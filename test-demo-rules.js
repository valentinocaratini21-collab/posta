'use strict';
/* test-demo-rules.js — Reglas de pieza v209 (órdenes de Valentino, 2026-10-18):
 *  1) UNA IDEA POR PIEZA: consigna en las fuentes de temas/prompts.
 *  2) TITULARES ≤ 6 PALABRAS (duro): catálogo, capHeadlineWords y
 *     makeHeadline del generador con casos reales/hostiles.
 *  3) EL TEXTO NUNCA PELEA CON LA FOTO: el renderer elige la zona
 *     segura (las 3 fallas de la semana de Mili como casos), la vía
 *     limpia no dibuja texto, y el 4º chequeo del QA (ruta IA) juzga
 *     la pieza compuesta.
 *  4) DOSIFICACIÓN: exactamente 2 piezas con texto y 3 limpias sobre
 *     los 5 posteos imagen; el caption de las limpias cierra con CTA.
 *  5) SIN BOTONES CTA en las piezas: el renderer ya no conoce cta_button.
 * Corre con: node test-demo-rules.js   (sin red, sin IA paga). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const demo = require('./demo');
const captions = require('./demo-captions');
const generator = require('./generator');
const demoAi = require('./demo-ai');

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
let passed = 0;
const ok = (name, fn) => { if (fn) fn(); passed++; console.log('  ✓', name); };

(async () => {
  console.log('== 2) Titulares ≤6 palabras: catálogo completo ==');
  const topics = captions.DEMO_TOPICS;
  assert(topics, 'demo-captions debe exponer el catálogo para auditarlo');
  let nTopics = 0;
  for (const cat of Object.values(topics)) {
    for (const t of cat) {
      nTopics++;
      assert(words(t.headline) <= 6, `titular de ${words(t.headline)} palabras: "${t.headline}"`);
      assert(captions.captionEndsWithCta(t.caption), `caption sin cierre CTA: "${t.headline}"`);
    }
  }
  ok(`catálogo: ${nTopics} temas, todos ≤6 palabras y captions con cierre CTA`);

  ok('capHeadlineWords: el ejemplo de Valentino pasa intacto', () => {
    assert.strictEqual(captions.capHeadlineWords('Agenda abierta: reservá tu fecha', 6), 'Agenda abierta: reservá tu fecha');
    assert.strictEqual(words(captions.capHeadlineWords('Agenda abierta: reservá tu fecha', 6)), 5);
  });
  ok('capHeadlineWords: prefiere la primera cláusula completa', () => {
    assert.strictEqual(captions.capHeadlineWords('Turnos de octubre: agenda abierta para vos', 6), 'Turnos de octubre');
    assert.strictEqual(captions.capHeadlineWords('De castaño a rubio en un día', 6), 'De castaño a rubio');
  });
  ok('capHeadlineWords: protege el precio y no deja colgadas', () => {
    const out = captions.capHeadlineWords('La docena de facturas a $12.500 hoy nomás', 6);
    assert(words(out) <= 6 && out.includes('$12.500'), out);
    const out2 = captions.capHeadlineWords('Promo para vos y para tu amiga también', 6);
    assert(words(out2) <= 6 && !/\b(para|y|de|con|en|a)$/i.test(out2), out2);
  });

  console.log('== 2b) makeHeadline del generador (clientes) ==');
  const hostile = [
    'De castaño a rubio en un día, sin dañar tu pelo',
    'Nueva colección primavera verano ya llegó a nuestro local hermoso',
    '¿Ya probaste nuestro servicio estrella de la casa nueva?',
    'Promo 2x1 en esmaltado semipermanente todos los jueves de octubre',
    'La docena de facturas a $12.500 recién salida del horno',
  ];
  for (const h of hostile) {
    const out = generator.makeHeadline(h, 6, 70, 'belleza');
    assert(out && words(out) <= 6, `"${h}" → "${out}" (${words(out)} palabras)`);
  }
  const price = generator.makeHeadline('La docena de facturas a $12.500 recién salida del horno', 6, 70, 'gastronomia');
  assert(price.includes('$12.500'), `el precio debe salir entero: "${price}"`);
  passed++; console.log('  ✓ makeHeadline: 5 entradas hostiles → todas ≤6 palabras');

  console.log('== 4) Dosificación 2 con texto / 3 limpias ==');
  for (const category of ['makeup', 'belleza', 'gastronomia', 'indumentaria']) {
    const spec = demo.buildDemoSpec({ business: 'Milagros', category, country: 'AR', tone: 'vos', count: 5, bioText: 'Maquillaje social, novias y producciones. Reservas por mensaje.' });
    const imgs = spec.specPosts.filter((p, i) => i !== spec.videoIdx);
    const withText = imgs.filter(p => p.text_mode === 'text');
    const clean = imgs.filter(p => p.text_mode === 'clean');
    assert.strictEqual(withText.length, 2, `${category}: ${withText.length} con texto (esperaba 2)`);
    assert.strictEqual(clean.length, imgs.length - 2, `${category}: ${clean.length} limpias`);
    assert.strictEqual(spec.specPosts[spec.videoIdx].text_mode, 'clean', `${category}: el reel queda fuera de la cuenta`);
    for (const p of spec.specPosts) assert(words(p.headline) <= 6, `${category}: "${p.headline}"`);
    console.log(`  ✓ ${category}: 2 texto / 3 limpias, titulares ≤6`);
    passed++;
  }
  ok('assignTextModes: elige promo/reserva antes que social', () => {
    const tps = [{ kind: 'social' }, { kind: 'promo' }, { kind: 'tip' }, { kind: 'reserva' }, { kind: 'social' }];
    const modes = captions.assignTextModes(tps, -1, 2);
    assert.strictEqual(modes[1], 'text');
    assert.strictEqual(modes[3], 'text');
    assert.strictEqual(modes.filter(m => m === 'text').length, 2);
  });
  ok('captions de piezas limpias cierran con CTA (ensureCaptionCtaClose)', () => {
    const sin = 'Un look que dura todo el evento, sin retoques.\n\nPiel luminosa y labios que aguantan la pista.';
    const con = captions.ensureCaptionCtaClose(sin, 'tip', 'vos');
    assert(captions.captionEndsWithCta(con), con);
    const ya = captions.ensureCaptionCtaClose(sin + '\n\nReservá tu fecha 📩', 'tip', 'vos');
    assert.strictEqual(ya, sin + '\n\nReservá tu fecha 📩', 'no duplica el CTA');
  });

  console.log('== 1) Una idea por pieza: consignas en la fuente ==');
  const srcGen = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
  const srcSrv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const srcCap = fs.readFileSync(path.join(__dirname, 'demo-captions.js'), 'utf8');
  assert(/UNA IDEA POR PIEZA/.test(srcGen), 'generator.js sin la consigna');
  assert(/UNA IDEA POR PIEZA/.test(srcSrv), 'server.js (expandArtBrief) sin la consigna');
  assert(/UNA IDEA POR PIEZA/.test(srcCap), 'demo-captions.js sin la consigna');
  passed++; console.log('  ✓ consigna presente en generator.js, server.js y demo-captions.js');

  console.log('== 5) Sin botones CTA en el renderer ==');
  const srcRender = fs.readFileSync(path.join(__dirname, 'demo_render.py'), 'utf8');
  assert(!srcRender.includes('cta_button'), 'demo_render.py todavía dibuja el botón CTA');
  assert(!/get\("cta"\)/.test(srcRender), 'demo_render.py todavía lee el CTA para dibujar');
  passed++; console.log('  ✓ demo_render.py no conoce cta_button ni lee p["cta"]');

  console.log('== 3) Zonas seguras en el renderer (las 3 fallas de Mili) ==');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posty-rules-'));
  const STOCK = path.join(__dirname, 'public', 'demo-stock');
  const COLORS = { accent: '#B3836D', btn: '#B3836D', btn_text: '#FFFFFF', headline: '#2E2A26', subline: '#6B5D4F', poster_bg: '#F3E9DC', poster_dark: '#3A2E24', detail: '#D6B89C', accent_text: '#FFFFFF', watermark: '#8A7A68' };
  const renderZones = (posts) => {
    const specPath = path.join(tmp, 'spec.json');
    fs.writeFileSync(specPath, JSON.stringify({ fonts_dir: path.join(__dirname, 'assets', 'fonts'), colors: COLORS, posts }));
    const outDir = path.join(tmp, 'out' + Math.random().toString(36).slice(2, 8));
    const log = execFileSync('python3', [path.join(__dirname, 'demo_render.py'), specPath, outDir], { encoding: 'utf8' });
    return [...log.matchAll(/zone=([a-z-]+)/g)].map(m => m[1]);
  };
  const P = (photo, skeleton, focus, headline) => ({ photo: path.join(STOCK, photo), style: 't', treatment: { skeleton, grade: 'neutral', crop: 'normal' }, focus, pill: 'TIP', headline, subline: 'Sub de prueba para la pieza.', cta: 'Reservar' });

  // (a) El pote de "Agenda abierta" (beauty-4, esqueleto arriba): el
  // bloque NO puede quedar arriba sobre el frasco → baja.
  let zones = renderZones([P('beauty-4.webp', 'arriba', 0.3, 'Agenda abierta: reservá tu fecha')]);
  assert.strictEqual(zones[0], 'bottom', `pote: zone=${zones[0]} (el bloque debe bajar)`);
  passed++; console.log('  ✓ (b) pote de crema: el bloque baja (zone=bottom)');

  // (c) La cara de "Novias" (beauty-11, arriba): el texto JAMÁS sobre
  // la cara. Hasta v230 el bloque medía ~400px y su rectángulo
  // inferior (y0=831) rozaba la caja de la cara (termina en 841) →
  // ambas bandas prohibidas → panel. Con el guard de área de v231 el
  // bloque mide 311px y la banda inferior (y0=929) queda VERIFICABLE-
  // MENTE libre de cara → el bloque baja (la regla dura es "nunca
  // sobre la cara", y abajo no la toca; el panel sigue siendo el
  // destino cuando ambas bandas están prohibidas de verdad).
  zones = renderZones([P('beauty-11.webp', 'arriba', 0.56, 'Novias: tu prueba va incluida')]);
  assert.strictEqual(zones[0], 'bottom', `novias: zone=${zones[0]} (debe bajar: la banda inferior quedó libre de cara)`);
  passed++; console.log('  ✓ (c) cara de la novia: el bloque baja a la banda libre (zone=bottom, jamás sobre la cara)');

  // (a) Los pinceles (beauty-3, claro abajo): nunca zona alta sobre el
  // flat-lay; abajo con scrim o panel.
  zones = renderZones([P('beauty-3.webp', 'claro', 0.43, 'Makeup que dura toda la fiesta')]);
  assert(['bottom', 'panel'].includes(zones[0]), `pinceles: zone=${zones[0]}`);
  passed++; console.log(`  ✓ (a) pinceles: zone=${zones[0]} (abajo protegido o panel, nunca sobre el flat-lay)`);

  // Centro con cara dentro del panel (beauty-10) → panel editorial.
  zones = renderZones([P('beauty-10.webp', 'centro', 0.3, '3 errores que arruinan tu makeup')]);
  assert.strictEqual(zones[0], 'panel', `centro: zone=${zones[0]}`);
  passed++; console.log('  ✓ panel central con cara adentro → panel editorial');

  // Pieza limpia de la dosificación: sale sin texto (zone=clean).
  zones = renderZones([{ ...P('beauty-2.webp', 'abajo', 0.43, ''), pill: '', subline: '', cta: '' }]);
  assert.strictEqual(zones[0], 'clean', `limpia: zone=${zones[0]}`);
  passed++; console.log('  ✓ pieza limpia: zone=clean (foto sin texto quemado)');

  console.log('== 3b) QA del texto compuesto (ruta IA, 4º chequeo) ==');
  const pieceB64 = fs.readFileSync(path.join(STOCK, 'beauty-2.webp')).toString('base64');
  const fetchOk = (content) => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }) });
  let qa = await demoAi.qaComposedText({ b64: pieceB64, zone: 'top', apiKey: 'test-key', fetchImpl: fetchOk('{"texto_no_tapa": true, "detalle": "fondo liso"}') });
  assert(qa && qa.passed === true, JSON.stringify(qa));
  qa = await demoAi.qaComposedText({ b64: pieceB64, zone: 'top', apiKey: 'test-key', fetchImpl: fetchOk('{"texto_no_tapa": false, "detalle": "tapa el ojo"}') });
  assert(qa && qa.passed === false, JSON.stringify(qa));
  qa = await demoAi.qaComposedText({ b64: pieceB64, zone: 'top', apiKey: 'test-key', fetchImpl: async () => { throw new Error('red caída'); } });
  assert.strictEqual(qa, null, 'sin red el QA es fail-open (null)');
  passed++; console.log('  ✓ qaComposedText: pasa / falla / fail-open sin red');

  console.log('== composite con zona (ruta IA) ==');
  const buf = await demoAi.compositeDemoPiece({ b64: pieceB64, headline: 'Agenda abierta: reservá tu fecha', gradeHex: '#B3836D', workDir: tmp, index: 7, headlineScale: 1.45, inkHex: '#F7F1E6', zone: 'bottom' });
  assert(Buffer.isBuffer(buf) && buf.length > 10000 && buf[0] === 0xFF && buf[1] === 0xD8, 'compositeDemoPiece debe devolver un JPEG');
  passed++; console.log('  ✓ compositeDemoPiece compone en la zona pedida (bottom) y devuelve JPEG');

  console.log(`\n✅ test-demo-rules: ${passed} verificaciones OK`);
})().catch((e) => { console.error('❌ test-demo-rules:', e.message); process.exit(1); });
