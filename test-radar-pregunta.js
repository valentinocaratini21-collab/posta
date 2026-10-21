'use strict';
/* test-radar-pregunta.js — RADAR SEMANAL + BANCO CLAVE (v306, 2026-10-21).
 * Decisión de Valentino: UNA pregunta por semana que funciona como radar
 * de contenido — "qué se viene esta semana en tu negocio?" — con opciones
 * de un toque por rubro; la respuesta decide QUÉ posteos arma Posty.
 * Prueba:
 *  1) etiquetas del radar adaptadas al rubro (moda/gastronomía/default, ES y EN);
 *  2) techo duro: 1 pregunta por semana en total (radar y huecos juntos);
 *  3) cada opción mapea a su directiva de semana (radarWeekLine);
 *  4) descuento sin dato → needs_detail y NO se guarda nada;
 *  5) sin respuesta → la semana sale del fundamento (radar expira, línea '');
 *  6) lo perecedero no se recicla: la línea exige week_key en curso;
 *  7) banco clave por rubro (los 11 de Valentino + comodín) y alternancia:
 *     radar "nada" la semana pasada ⇒ esta semana sube la pregunta clave.
 * Corre con: node test-radar-pregunta.js (DB temporal, sin red, sin IA). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-radar-'));
process.env.DATA_DIR = TMP;

const dbInst = require('./db');
const clientDigest = require('./client-digest');
const pq = require('./posty-questions');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

const NOW = (d) => Date.parse(d + 'T12:00:00Z');
const W1 = '2026-10-19'; // lunes
const W2 = '2026-10-26'; // lunes siguiente

function mkUser(id, rubro, lang) {
  dbInst.prepare(`INSERT INTO users (id, email, password_hash, lang) VALUES (?, ?, 'x', ?)`).run(id, `u${id}@example.com`, lang || 'es');
  dbInst.prepare(`INSERT INTO profiles (user_id, business_name, category, subrubro) VALUES (?, ?, ?, '')`).run(id, 'Negocio ' + id, rubro);
  dbInst.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)`).run(id, JSON.stringify({
    producto_estrella: 'Producto Estrella', mas_vendido: 'Producto Estrella',
    cliente_ideal: 'vecinos del barrio', no_publicar: 'precios viejos',
    promos_activas: [{ titulo: 'promo base' }],
  }));
  const d = clientDigest.emptyDigest();
  d.business = 'Negocio ' + id;
  d.category = rubro;
  d.rubro_id = { v: 1, rubro, subrubro: '', confianza: 0.95, fuente: 'dueno', segura: true };
  d.productos = [{ nombre: 'Producto Estrella', precio: '$10.000' }];
  d.promos = [{ titulo: 'promo base' }];
  clientDigest.saveDigest(dbInst, id, d);
  return d;
}
const digestOf = (id) => clientDigest.getDigest(dbInst, id);
const optsOf = (q) => (q.opciones || []).map((o) => { try { return JSON.parse(o.value); } catch (e) { return {}; } });

// --- 1) Etiquetas por rubro -------------------------------------------------
ok('radar: etiqueta de novedad según rubro (moda/gastronomía/default) + EN', () => {
  const moda = pq.radarCandidate({ rubro_id: { rubro: 'moda' } }, W1, 'es');
  assert.strictEqual(moda.texto, 'qué se viene esta semana en tu negocio?');
  assert.strictEqual(moda.opciones.length, 6);
  assert.strictEqual(moda.opciones[1].label, '🆕 ingresó ropa');
  const gastro = pq.radarCandidate({ rubro_id: { rubro: 'gastronomia' } }, W1, 'es');
  assert.strictEqual(gastro.opciones[1].label, '🆕 plato nuevo');
  const otro = pq.radarCandidate({ rubro_id: { rubro: 'otro' } }, W1, 'es');
  assert.strictEqual(otro.opciones[1].label, '🆕 algo nuevo');
  const sinRubro = pq.radarCandidate({}, W1, 'es');
  assert.strictEqual(sinRubro.opciones[1].label, '🆕 algo nuevo');
  const en = pq.radarCandidate({ rubro_id: { rubro: 'moda' } }, W1, 'en');
  assert.strictEqual(en.texto, "what's coming up this week in your business?");
  assert.strictEqual(en.opciones[1].label, '🆕 new clothes in');
  assert.deepStrictEqual(optsOf(moda).map((o) => o.tipo),
    ['evento', 'novedad', 'descuento', 'empuje', 'festejo', 'nada']);
  assert.strictEqual(pq.radarCandidate({ rubro_id: { rubro: 'moda' } }, '', 'es'), null);
});

// --- 2) Techo: una sola pregunta por semana ---------------------------------
mkUser(101, 'fitness');
ok('techo: ensure crea UNA radar y responderla cierra la semana', () => {
  const q1 = pq.ensureWeeklyQuestion(dbInst, 101, W1, NOW(W1), { lang: 'es' });
  assert(q1 && q1.kind === 'radar');
  const q2 = pq.ensureWeeklyQuestion(dbInst, 101, W1, NOW(W1), { lang: 'es' });
  assert.strictEqual(q2.id, q1.id); // misma fila, no otra
  const pend = dbInst.prepare(`SELECT COUNT(*) AS n FROM posty_questions WHERE user_id = 101 AND status = 'pending'`).get();
  assert.strictEqual(pend.n, 1);
  const r = pq.applyAnswer(dbInst, 101, q1.id, { value: JSON.stringify({ radar: 1, tipo: 'evento' }), text: 'feria del barrio el sábado' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.applied, 'radar:evento');
  assert.strictEqual(pq.ensureWeeklyQuestion(dbInst, 101, W1, NOW(W1), { lang: 'es' }), null);
  const d = digestOf(101);
  assert.strictEqual(d.radar.tipo, 'evento');
  assert.strictEqual(d.radar.detalle, 'feria del barrio el sábado');
  assert.strictEqual(d.radar.week_key, W1);
});

// --- 3) Mapeo respuesta → directiva de semana -------------------------------
ok('mapeo: cada tipo produce su directiva y solo en su semana', () => {
  const L = (tipo, detalle) => pq.radarWeekLine({ tipo, detalle, week_key: W1 }, W1, 'es');
  assert(L('evento', 'feria').includes('EVENTO IMPORTANTE'));
  assert(L('evento', 'feria').includes('anticipación'));
  assert(L('novedad', 'llegó la línea nueva').includes('protagonista'));
  assert(L('empuje', 'quedan 3 sillones').includes('EMPUJAR'));
  assert(L('festejo', 'cumplimos 5 años').includes('FESTEJAR'));
  assert(L('festejo', 'cumplimos 5 años').includes('prueba social'));
  assert(L('clave', 'entró un motor v8').includes('contó'));
  assert.strictEqual(L('nada', ''), '');
  // perecedero: la misma respuesta, la semana siguiente, no se usa
  assert.strictEqual(pq.radarWeekLine({ tipo: 'evento', detalle: 'feria', week_key: W1 }, W2, 'es'), '');
  assert.strictEqual(pq.radarWeekLine(null, W1, 'es'), '');
  assert(pq.radarWeekLine({ tipo: 'evento', detalle: '', week_key: W1 }, W1, 'en').includes('IMPORTANT EVENT'));
});

// --- 4) Descuento: sin dato no hay posteo de descuento ----------------------
mkUser(102, 'moda');
ok('descuento sin detalle → needs_detail, nada guardado; con dato → directiva exacta', () => {
  const q = pq.ensureWeeklyQuestion(dbInst, 102, W1, NOW(W1), { lang: 'es' });
  assert(q && q.kind === 'radar');
  const bad = pq.applyAnswer(dbInst, 102, q.id, { value: JSON.stringify({ radar: 1, tipo: 'descuento' }) });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'needs_detail');
  assert.strictEqual(digestOf(102).radar, null);
  assert(pq.currentQuestion(dbInst, 102, W1)); // sigue pending
  const good = pq.applyAnswer(dbInst, 102, q.id, {
    value: JSON.stringify({ radar: 1, tipo: 'descuento' }),
    text: '20% en toda la ropa de invierno hasta el domingo',
  });
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.applied, 'radar:descuento');
  const line = pq.radarWeekLine(digestOf(102).radar, W1, 'es');
  assert(line.includes('DESCUENTO REAL'));
  assert(line.includes('20% en toda la ropa de invierno hasta el domingo'));
  // y el guardarraíl directo: un radar de descuento sin detalle no emite línea
  assert.strictEqual(pq.radarWeekLine({ tipo: 'descuento', detalle: '', week_key: W1 }, W1, 'es'), '');
});

// --- 5) Sin respuesta: la semana sale del fundamento -------------------------
mkUser(103, 'hogar');
ok('sin respuesta: expira y la semana siguiente nace otra (línea vacía)', () => {
  const q = pq.ensureWeeklyQuestion(dbInst, 103, W1, NOW(W1), { lang: 'es' });
  assert(q && q.kind === 'radar');
  const q2 = pq.ensureWeeklyQuestion(dbInst, 103, W2, NOW(W2), { lang: 'es' });
  assert(q2 && q2.kind === 'radar' && q2.id !== q.id);
  const vieja = dbInst.prepare(`SELECT status FROM posty_questions WHERE id = ?`).get(q.id);
  assert.strictEqual(vieja.status, 'expired');
  assert.strictEqual(digestOf(103).radar, null);
  assert.strictEqual(pq.radarWeekLine(digestOf(103).radar, W2, 'es'), '');
});

// --- 6) Banco clave por rubro + alternancia ---------------------------------
ok('banco clave: los rubros de Valentino y el comodín', () => {
  const esp = (rk) => pq.claveCandidate({ rubro_id: { rubro: rk } }, 'es').texto;
  assert(esp('gastronomia').includes('qué sale de la cocina'));
  assert(esp('barberia').includes('qué servicio querés llenar'));
  assert(esp('belleza').includes('qué tratamiento está funcionando mejor'));
  assert(esp('moda').includes('qué entró nuevo'));
  assert(esp('hogar').includes('qué pieza querés que se vaya'));
  assert(esp('fitness').includes('qué logro de un alumno'));
  assert(esp('mascotas').includes('historia de la semana'));
  assert(esp('salud').includes('qué es lo que más te preguntan'));
  assert(esp('autos').includes('entró al taller'));
  assert(esp('profesionales').includes('sin nombres'));
  assert(esp('inmobiliaria').includes('qué propiedad querés empujar'));
  assert.strictEqual(esp('rubro-inexistente'), 'pasó algo esta semana en tu negocio que tus clientes deberían saber?');
});

mkUser(104, 'fitness');
ok('alternancia: radar "nada" ⇒ la semana siguiente sube la clave del rubro', () => {
  const q1 = pq.ensureWeeklyQuestion(dbInst, 104, W1, NOW(W1), { lang: 'es' });
  assert(q1 && q1.kind === 'radar');
  const r = pq.applyAnswer(dbInst, 104, q1.id, { value: JSON.stringify({ radar: 1, tipo: 'nada' }) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(digestOf(104).radar.tipo, 'nada');
  assert.strictEqual(pq.radarWeekLine(digestOf(104).radar, W1, 'es'), ''); // "nada" no ensucia la semana
  const q2 = pq.ensureWeeklyQuestion(dbInst, 104, W2, NOW(W2), { lang: 'es' });
  assert(q2 && q2.kind === 'clave');
  assert(q2.texto.includes('qué logro de un alumno'));
  const rc = pq.applyAnswer(dbInst, 104, q2.id, { text: 'maría bajó 8 kilos en dos meses' });
  assert.strictEqual(rc.ok, true);
  assert.strictEqual(digestOf(104).radar.tipo, 'clave');
  assert(pq.radarWeekLine(digestOf(104).radar, W2, 'es').includes('maría bajó 8 kilos'));
});

// --- 7) Críticos del digest siguen mandando sobre el radar ------------------
ok('prioridad: la duda de rubro (crítica) sigue primera, radar después', () => {
  dbInst.prepare(`INSERT INTO users (id, email, password_hash, lang) VALUES (105, 'u105@example.com', 'x', 'es')`).run();
  dbInst.prepare(`INSERT INTO profiles (user_id, business_name, category, subrubro) VALUES (105, 'Dudoso', 'belleza', '')`).run();
  dbInst.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (105, '{}')`).run();
  const d = clientDigest.emptyDigest();
  d.business = 'Dudoso';
  d.category = 'belleza';
  // Misma forma que el fixture del test legado: finalizeDigest deriva
  // los question_candidates desde rubro_id.candidatas al guardar.
  d.rubro_id = {
    v: 1, rubro: 'belleza', subrubro: '', confianza: 0.62, fuente: 'deteccion',
    segura: false, nivel_duda: 'subrubro', needs_question: true, sin_confirmar: true,
    candidatas: [
      { rubro: 'belleza', subrubro: 'peluqueria' },
      { rubro: 'belleza', subrubro: 'makeup' },
    ],
    evidencia: ['bio ambigua'],
  };
  clientDigest.saveDigest(dbInst, 105, d);
  const q = pq.ensureWeeklyQuestion(dbInst, 105, W1, NOW(W1), { lang: 'es' });
  assert(q && q.kind === 'rubro');
});

// --- 8) Radar EN end-to-end --------------------------------------------------
mkUser(106, 'cafeteria', 'en');
ok('radar EN: pregunta y opciones en inglés', () => {
  const q = pq.ensureWeeklyQuestion(dbInst, 106, W1, NOW(W1), { lang: 'en' });
  assert(q && q.kind === 'radar');
  assert.strictEqual(q.texto, "what's coming up this week in your business?");
  assert.strictEqual(q.opciones[1].label, '🆕 a new dish');
});

console.log(`\ntest-radar-pregunta: ${passed}/9 bloques OK`);
