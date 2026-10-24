'use strict';
/* test-caption-dedup.js — DEDUP-EXACTA (Juli, 2026-10-24): route breach
 * de deduplicación. La auditoría encontró 3 captions EXACTOS duplicados
 * dentro de la misma semana en producción (posts 444=451, 430=437,
 * 425=426). La causa: (a) la ruta de generación de la semana nunca le
 * pasaba prevCaptions a la generación, y (b) ni siquiera con previos
 * había una compuerta de duplicado EXACTO — las compuertas
 * intra-semana comparan la apertura (dispositivos/rotación) y la
 * puerta inglesa ni miraba los previos.
 *
 * Este test prueba la garantía nueva en los tres niveles:
 *  1. captionPasses / captionPassesEn rechazan un duplicado exacto de
 *     un previo (incluidas variantes de mayúsculas/espacios/emojis).
 *  2. generateContent NUNCA devuelve un duplicado exacto de un previo:
 *     con la IA stubbeada devolviendo siempre el mismo caption, la
 *     segunda generación difiere o lanza error honesto.
 *  3. generateCaptions tampoco devuelve dos captions idénticos entre
 *     sí cuando la IA devuelve la misma tanda repetida.
 * Corre con: node test-caption-dedup.js  (sin red real: fetch stub). */
const assert = require('assert');
const gen = require('./generator');

let passed = 0, failed = 0;
const ok = (name, fn) => {
  try { const r = fn(); if (r && typeof r.then === 'function') return r.then(() => { passed++; console.log('  ✓', name); }).catch((e) => { failed++; console.log('  ×', name, '—', e.message); }); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ×', name, '—', e.message); }
};

/* ---------- Fixtures validados contra la puerta (árbol sin el fix: pasan) ---------- */
// Apertura declarativa de 2 palabras: escapa el gate de dispositivos
// (deviceOf necesita ≥3 palabras) — por eso el duplicado real escapó.
const FIX_ES = 'Agenda abierta 📩\nAgendá tu turno en Gesty y dejá la administración de tu negocio al día, sin vueltas ni papeles sueltos.\nEscribime por DM y lo resolvemos hoy mismo 📩';
const IN_ES = { business: 'Gesty', category: 'servicios', tone: 'canchero', dna: null, ig_username: 'gesty.officemanager' };
const FIX_EN = 'Booking open 📩\nBook your spot at Gesty and leave your business admin up to date, no fuss.\nDM us today and we sort it out 📩';
const IN_EN = { business: 'Gesty', dna: null };

console.log('== 1. La puerta frena el duplicado exacto (ES) ==');
ok('el fixture pasa limpio sin previos (no es un falso positivo)', () => {
  assert.strictEqual(gen.captionPasses(FIX_ES, IN_ES).ok, true);
});
ok('con prevCaptions=[él mismo] se RECHAZA por duplicado exacto', () => {
  const chk = gen.captionPasses(FIX_ES, { ...IN_ES, prevCaptions: [FIX_ES] });
  assert.strictEqual(chk.ok, false, 'debió rechazar el duplicado');
  assert.ok(/duplicado exacto/i.test(chk.reason), chk.reason);
});
ok('variante de caso/espacios del mismo caption también es duplicado', () => {
  const variant = FIX_ES.toUpperCase().replace('📩', '').replace(/\s+/g, '  ');
  const chk = gen.captionPasses(variant, { ...IN_ES, prevCaptions: [FIX_ES] });
  assert.strictEqual(chk.ok, false, 'la clave de cuerpo normaliza caso y puntuación');
});
ok('un caption DISTINTO con los mismos previos pasa', () => {
  const other = '¿Sin tiempo para los papeles? 📂\nGesty ordena tu facturación y tus cobranzas mientras vos vendés.\nEscribime por DM y arrancamos esta semana 📩';
  const chk = gen.captionPasses(other, { ...IN_ES, prevCaptions: [FIX_ES] });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== 1b. La puerta frena el duplicado exacto (EN) ==');
ok('el fixture EN pasa limpio sin previos', () => {
  assert.strictEqual(gen.captionPassesEn(FIX_EN, IN_EN).ok, true);
});
ok('captionPassesEn con prevCaptions=[él mismo] se RECHAZA (antes ni miraba prevs)', () => {
  const chk = gen.captionPassesEn(FIX_EN, { ...IN_EN, prevCaptions: [FIX_EN] });
  assert.strictEqual(chk.ok, false, 'debió rechazar el duplicado');
  assert.ok(/duplicate/i.test(chk.reason), chk.reason);
});

console.log('== 1c. captionBodyKey: la clave de cuerpo ==');
ok('ignora caso, tildes, puntuación y emojis; distingue textos distintos', () => {
  assert.strictEqual(gen.captionBodyKey(FIX_ES), gen.captionBodyKey(FIX_ES.toUpperCase()));
  assert.strictEqual(gen.captionBodyKey('¡Reservá ya! 🎉'), gen.captionBodyKey('reserva ya'));
  assert.notStrictEqual(gen.captionBodyKey(FIX_ES), gen.captionBodyKey(FIX_EN));
});

/* ---------- Nivel 2 y 3: generación con IA stubbeada ---------- */
const realFetch = global.fetch;
function stubFetchAlways(captions) {
  global.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({
      id: 'chatcmpl-stub', usage: {},
      choices: [{ message: { content: JSON.stringify({ caption: captions[0], captions, overlays: captions.map(() => ''), hashtags: '#gesty' }) } }],
    }),
    text: async () => '',
  });
}
function restoreFetch() { global.fetch = realFetch; }

const GEN_IN = { business: 'Gesty', category: 'servicios', tone: 'canchero', dna: null, ig_username: 'gesty.officemanager', topic: 'agenda de turnos', tipo: 'foto' };

(async () => {
  console.log('== 2. generateContent: dos generaciones de la misma semana no repiten ==');
  await ok('la 2ª generación con el caption de la 1ª como previo difiere o lanza', async () => {
    stubFetchAlways([FIX_ES]);
    try {
      const g1 = await gen.generateContent({ ...GEN_IN, prevCaptions: [] }, 'sk-stub');
      assert.ok(gen.captionBodyKey(g1.caption).endsWith(gen.captionBodyKey(FIX_ES)),
        'el stub manda: la primera generación es el fixture de la IA (con su hook antepuesto)');
      let g2 = null, threw = false;
      try { g2 = await gen.generateContent({ ...GEN_IN, prevCaptions: [g1.caption] }, 'sk-stub'); }
      catch (e) { threw = true; assert.ok(/duplicado/i.test(e.message), e.message); }
      if (!threw) {
        assert.ok(g2 && g2.caption, 'la segunda generación devuelve un caption');
        assert.notStrictEqual(gen.captionBodyKey(g2.caption), gen.captionBodyKey(g1.caption),
          'dos generaciones de la misma semana produjeron un caption idéntico');
      }
    } finally { restoreFetch(); }
  });

  console.log('== 3. generateCaptions: la tanda no sale con duplicados internos ==');
  await ok('tanda de 3 idénticos de la IA → devueltos pairwise distintos', async () => {
    stubFetchAlways([FIX_ES, FIX_ES, FIX_ES]);
    try {
      const out = await gen.generateCaptions({ ...GEN_IN }, 3, 'sk-stub');
      assert.ok(gen.captionBodyKey(out.captions[0]).endsWith(gen.captionBodyKey(FIX_ES)),
        'el stub manda: el primer caption de la tanda es el fixture de la IA (con su hook antepuesto)');
      const keys = out.captions.map((c) => gen.captionBodyKey(c));
      assert.strictEqual(new Set(keys).size, keys.length, `captions duplicados en la tanda: ${JSON.stringify(keys)}`);
    } finally { restoreFetch(); }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
