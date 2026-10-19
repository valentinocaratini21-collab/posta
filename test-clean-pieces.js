'use strict';
/* test-clean-pieces.js — Limpieza de piezas (2026-10-18, pedido de
 * Valentino: posteos "más limpios, sin tantas palabras, como los del
 * website"). Cubre la build que lleva la vara del website al pipeline
 * de CLIENTES y el apretón equivalente en la PRUEBA:
 *  1) Dosificación 2-de-5 en clientes (clean-pieces.js, lógica pura):
 *     semana fixture de 5 ⇒ exactamente 2 con texto / 3 limpias; el
 *     carousel (tips/educativo) queda exento como el reel del demo;
 *     el modo de una pieza sale de la composición de su semana
 *     (palanca regen-post / creaciones individuales).
 *  2) Tope duro de caption en captionPasses: >320 caracteres, >3
 *     bloques o >4 emojis ⇒ rechazo (el reintento de generateContent
 *     corrige con ese motivo).
 *  3) Bajada muerta: el brief de clientes ya no pide ni devuelve
 *     "suboverlay" (nadie lo consumía).
 *  4) Wiring en server.js (contratos de fuente): dosificación tras
 *     ordenar los picks, pieza limpia sin titular hacia la generación
 *     (ni composite ni salvavidas stock), caption limpio que cierra
 *     con CTA, assembleImagePrompt sin zona de titular cuando no hay
 *     texto, y las medianas de limpieza en el resultado de la corrida.
 *  5) Prueba (amendment): la dosificación del demo sigue exacta y la
 *     pila de texto queda acotada — titular + UN solo extra (bajada
 *     ≤8 palabras O pastilla, nunca los dos).
 * Corre con: node test-clean-pieces.js   (sin red, sin IA paga). */
const assert = require('assert');
const fs = require('fs');

const cp = require('./clean-pieces');
const gen = require('./generator');
const demo = require('./demo');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

console.log('== 1) Dosificación 2-de-5 en clientes (lógica pura) ==');
const PICKS5 = [
  { tipo: 'social', titulo: 'Gracias por estar ahí' },
  { tipo: 'promo', titulo: '2x1 en medialunas' },
  { tipo: 'detras', titulo: 'Así amasamos cada mañana' },
  { tipo: 'novedad', titulo: 'Llegó el pan dulce' },
  { tipo: 'reserva', titulo: 'Reservá tu mesa del finde' },
];
ok('semana de 5 sin carousel: exactamente 2 con texto y 3 limpias', () => {
  const { modes, carouselIdx } = cp.planWeekTextModes(PICKS5, 5);
  assert.strictEqual(carouselIdx, -1);
  assert.strictEqual(modes.filter((m) => m === 'text').length, 2);
  assert.strictEqual(modes.filter((m) => m === 'clean').length, 3);
});
ok('los 2 textos son los kinds que más venden (promo y reserva)', () => {
  const { modes } = cp.planWeekTextModes(PICKS5, 5);
  assert.strictEqual(modes[1], 'text'); // promo
  assert.strictEqual(modes[4], 'text'); // reserva
});
ok('con un tip: el carousel queda exento y los 2 textos van a las piezas imagen', () => {
  const picks = [{ tipo: 'tip', titulo: '3 errores al guardar el pan' }, ...PICKS5.slice(1)];
  const { modes, carouselIdx } = cp.planWeekTextModes(picks, 5);
  assert.strictEqual(carouselIdx, 0);
  assert.strictEqual(modes[0], 'clean'); // exento: no consume un lugar con texto
  assert.strictEqual(modes.filter((m) => m === 'text').length, 2);
});
ok('tanda chica (3): la proporción 2-de-5 da 1 con texto', () => {
  const { modes } = cp.planWeekTextModes(PICKS5.slice(0, 3), 3);
  assert.strictEqual(modes.filter((m) => m === 'text').length, 1);
});
ok('mapeo tipo→kind como el demo (detras/foto→social, desconocido→social)', () => {
  assert.strictEqual(cp.kindOfTipo('promo'), 'promo');
  assert.strictEqual(cp.kindOfTipo('reserva'), 'reserva');
  assert.strictEqual(cp.kindOfTipo('tip'), 'tip');
  assert.strictEqual(cp.kindOfTipo('detras'), 'social');
  assert.strictEqual(cp.kindOfTipo('foto'), 'social');
  assert.strictEqual(cp.kindOfTipo(''), 'social');
});
ok('modo por semana: candidato social en semana con sus textos dados → limpio', () => {
  // Semana de 5 (promo, reserva, social, novedad, social) + candidato social.
  assert.strictEqual(cp.modeFromWeekKinds(['promo', 'reserva', 'social', 'novedad', 'social', 'social'], 5), 'clean');
});
ok('modo por semana: candidato promo en semana de sociales → con texto', () => {
  assert.strictEqual(cp.modeFromWeekKinds(['social', 'social', 'social', 'social', 'promo'], 4), 'text');
});
ok('modo por semana: la pieza regenerada se juzga en SU posición', () => {
  // La del medio (novedad) no rankea contra promo+reserva de su semana.
  assert.strictEqual(cp.modeFromWeekKinds(['promo', 'novedad', 'reserva', 'social', 'social'], 1), 'clean');
  // Y una promo en su posición sí conserva el texto.
  assert.strictEqual(cp.modeFromWeekKinds(['promo', 'novedad', 'reserva', 'social', 'social'], 0), 'text');
});

console.log('== 2) Tope duro de caption (captionPasses) ==');
const INPUT = { business: 'Panadería La Espiga', dna: null };
const BUENO = 'El pan de masa madre sale del horno a las 8 en punto.\n\nHarina, agua, sal y 18 horas de fermentación. Nada más.\n\nPasá por el local hoy y llevate el tuyo calentito.';
ok('caption limpio de ~200 caracteres y 3 bloques pasa', () => {
  assert.strictEqual(gen.captionPasses(BUENO, INPUT).ok, true);
});
ok('caption de 400+ caracteres se rechaza por largo', () => {
  const largo = ('Recién salido del horno, como todas las mañanas en el barrio. ').repeat(7) + 'Pasá por el local hoy.';
  assert.ok(largo.length > 400);
  const chk = gen.captionPasses(largo, INPUT);
  assert.strictEqual(chk.ok, false);
  assert.ok(/demasiado largo/.test(chk.reason), chk.reason);
});
ok('caption de 4 bloques se rechaza por bloques', () => {
  const bloques = 'Gancho rico para arrancar el día con todo.\n\nSegundo bloque con el desarrollo del tema.\n\nTercer bloque con más detalle del producto.\n\nPasá por el local hoy.';
  const chk = gen.captionPasses(bloques, INPUT);
  assert.strictEqual(chk.ok, false);
  assert.ok(/bloques de texto/.test(chk.reason), chk.reason);
});
ok('caption con 5 emojis se rechaza por emojis', () => {
  const emojis = 'Salio el pan calentito para todo el barrio 🔥🥖☕🎉✨ y vuela.\n\nPasá por el local hoy a buscar el tuyo.';
  const chk = gen.captionPasses(emojis, INPUT);
  assert.strictEqual(chk.ok, false);
  assert.ok(/emojis/.test(chk.reason), chk.reason);
});

console.log('== 3) Bajada muerta fuera del brief ==');
const genSrc = fs.readFileSync('generator.js', 'utf8');
ok('generator.js: sin campo suboverlay en el JSON pedido ni en los returns', () => {
  assert.ok(!genSrc.includes('\\"suboverlay\\": \\"...\\"'), 'el JSON del prompt no pide suboverlay');
  assert.ok(!genSrc.includes('parsed.suboverlay'), 'el parse no lee suboverlay');
  assert.ok(!genSrc.includes('suboverlay: cortar'), 'la plantilla no fabrica suboverlay');
  assert.ok(!genSrc.includes('suboverlay: looksLikeBrief'), 'openaiGenerate no devuelve suboverlay');
});
ok('generator.js: la meta numérica está en el prompt y en CAPTION_CRAFT', () => {
  assert.ok(genSrc.includes('100 a 280 caracteres, en 3 bloques cortos'));
  assert.ok(genSrc.includes('LARGO LIMPIO: el caption entero mide de 100 a 280 caracteres'));
});

console.log('== 4) Wiring en server.js (contratos) ==');
const srv = fs.readFileSync('server.js', 'utf8');
ok('generateWeekDrafts aplica la dosificación tras ordenar los picks', () => {
  assert.ok(srv.includes('const tm = planWeekTextModes(picks, deficit);'));
  assert.ok(srv.includes("p._textMode = tm.modes[ix] || 'text'"));
});
ok('pieza limpia: sin titular hacia la generación y caption que cierra con CTA', () => {
  assert.ok(srv.includes("const cleanPiece = !isCarousel && idea._textMode === 'clean';"));
  assert.ok(srv.includes('const headline = cleanPiece ? '));
  assert.ok(srv.includes('caption = demo.ensureCaptionCtaClose(caption, kindOfTipo(idea.tipo)'));
});
ok('la palanca regen-post y las creaciones individuales deciden el modo por semana', () => {
  assert.ok(srv.includes('const mode = weekTextModeFor(uid, post.week_key, kindOfTipo(tipo), post.id);'));
  // (v236) makeIdeaDraft mide el modo contra la semana ACTUAL (wk),
  // no contra la semana de origen de la idea: el borrador cae hoy.
  assert.ok(srv.includes('const mode = weekTextModeFor(uid, wk, kindOfTipo(tipo), null);'));
  assert.ok(srv.includes('const mode = weekTextModeFor(uid, weekKey, kindOfTipo(idea.tipo), null);'));
  assert.ok(srv.includes("const headline = mode === 'clean' ? ''"));
});
ok('assembleImagePrompt no reserva zona de titular cuando no hay texto', () => {
  assert.ok(srv.includes("if (String(headline || '').trim()) parts.push(headlineZoneLine(headline));"));
});
ok('vigilancia: las medianas de limpieza quedan en el resultado de la corrida', () => {
  assert.ok(srv.includes('const runCleanStats = { text: 0, clean: 0, carousel: 0, capLens: [] };'));
  assert.ok(srv.includes('captionMedianChars'));
  assert.ok(srv.includes('cleanStats };'));
  assert.ok(srv.includes('HEADLINE ZONE'));
});
ok('server.js consume el módulo puro clean-pieces', () => {
  assert.ok(srv.includes("const cleanPieces = require('./clean-pieces');"));
});

console.log('== 5) Prueba: dosificación exacta y pila de texto acotada ==');
for (const cat of ['cafeteria', 'belleza', 'peluqueria']) {
  for (let r = 0; r < 10; r++) {
    const spec = demo.buildDemoSpec({
      business: 'Negocio Test', category: cat, country: 'AR', tone: 'vos', goal: '', count: 5,
      profilePicPath: '/tmp/pic-test.jpg',
    });
    const posts = spec.specPosts;
    assert.strictEqual(posts.filter((p) => p.text_mode === 'text').length, 2, `${cat}: no son 2 con texto`);
    assert.strictEqual(posts.filter((p) => p.text_mode === 'clean').length, 3, `${cat}: no son 3 limpias`);
    for (const p of posts) {
      if (p.text_mode !== 'text') continue;
      assert.ok(!(p.pill && p.subline), `${cat}: pieza con pastilla Y bajada ("${p.headline}")`);
      if (p.subline) assert.ok(words(p.subline) <= 8, `${cat}: bajada de ${words(p.subline)} palabras ("${p.subline}")`);
    }
  }
}
passed++; console.log('  ✓ 30 semanas demo (3 rubros ×10): 2 con texto / 3 limpias, pila acotada (titular + bajada ≤8 o pastilla)');

(async () => {
  const out = await gen.generateContent({ business: 'Panadería La Espiga', category: 'panaderia', tone: 'canchero', topic: 'Pan de masa madre recién horneado', tipo: 'novedad', dna: null }, null);
  assert.ok(out && out.caption, 'generateContent devuelve caption');
  assert.ok(!('suboverlay' in out), 'la salida no trae suboverlay');
  passed++; console.log('  ✓ generateContent (plantilla) devuelve caption/overlay/hashtags, sin suboverlay');
  console.log(`\n✅ test-clean-pieces: ${passed} verificaciones OK`);
})().catch((e) => { console.error('  ✗', e.message); process.exitCode = 1; });
