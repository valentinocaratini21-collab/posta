'use strict';
/* test-posty-questions.js — POSTY PREGUNTA (v238, 2026-10-19).
 * Aprobado por Valentino: máximo 1 pregunta por semana, detrás del
 * digest, sobre lo que el fundamento no pudo leer solo. Prueba:
 *  1) prioridad: rubro sin confirmar > estrella inferido > contradicción
 *     > huecos del ADN, con las opciones reales del clasificador;
 *  2) responder el rubro cierra el candidato, lockea digest + perfil;
 *  3) ignorada una semana → expira y la siguiente sale OTRA (memoria);
 *     a los 21 días puede volver; descartada/respondida: 42 días;
 *  4) tope duro: nunca 2 pending la misma semana (doble ensure);
 *  5) la respuesta cae al digest y al ADN (precio, estrella, huecos) y
 *     deriveTopics usa el estrella del dueño;
 *  6) contrato de deploy: endpoints, tarjeta en Schedule, BUILD_ID.
 * Corre con: node test-posty-questions.js (DB temporal, sin red, sin IA). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-questions-'));
process.env.DATA_DIR = TMP;

const dbInst = require('./db');
const clientDigest = require('./client-digest');
const pq = require('./posty-questions');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

const NOW = (d) => Date.parse(d + 'T12:00:00Z');

// --- Usuario fixture con fundamento completo y las tres dudas vivas ---
dbInst.prepare(`INSERT INTO users (id, email, password_hash) VALUES (77, 'duena@example.com', 'x')`).run();
dbInst.prepare(`INSERT INTO profiles (user_id, business_name, category, subrubro) VALUES (77, 'Estudio Belleza', 'belleza', '')`).run();
dbInst.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (77, '{}')`).run();

const fixtureDigest = clientDigest.emptyDigest();
fixtureDigest.business = 'Estudio Belleza';
fixtureDigest.category = 'belleza';
fixtureDigest.rubro_id = {
  v: 1, rubro: 'belleza', subrubro: '', confianza: 0.62, fuente: 'deteccion',
  segura: false, nivel_duda: 'subrubro', needs_question: true, sin_confirmar: true,
  candidatas: [
    { rubro: 'belleza', subrubro: 'peluqueria' },
    { rubro: 'belleza', subrubro: 'makeup' },
    { rubro: 'belleza', subrubro: 'unas' },
  ],
  evidencia: ['bio ambigua'],
};
fixtureDigest.productos = [
  { nombre: 'Blend Patagonia', precio: '$12.000' },
  { nombre: 'Kit Omakase', precio: '$30.000' },
];
fixtureDigest.inferred_star = { item: 'Blend Patagonia', confidence: 0.8, evidence: ['aparece en 4 posteos'], score: 8 };
fixtureDigest.contradictions = [
  { item: 'Blend Patagonia', valores: { web: '$12.000', 'bio-link': '$13.500' }, resolucion: '$12.000' },
];
clientDigest.saveDigest(dbInst, 77, fixtureDigest);

const stored = () => clientDigest.getStoredDigest(dbInst, 77);
const dna = () => { const r = dbInst.prepare('SELECT dna_json FROM business_dna WHERE user_id = 77').get(); return JSON.parse(r.dna_json || '{}'); };
const pendingCount = () => dbInst.prepare(`SELECT COUNT(*) AS n FROM posty_questions WHERE user_id = 77 AND status = 'pending'`).get().n;
// Las filas nacen con datetime('now') REAL; el test simula semanas, así
// que estampa en cada fila la fecha de SU semana (en producción el
// reloj real y el de las semanas son el mismo).
const stamp = (q, week) => { if (q && q.id) dbInst.prepare(`UPDATE posty_questions SET created_at = ? WHERE id = ?`).run(week + ' 12:00:00', q.id); };

console.log('== 1) Prioridad: la primera pregunta es el RUBRO, con opciones del clasificador ==');
let q1;
ok('ensure crea la pregunta de rubro', () => {
  q1 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-10-19', NOW('2026-10-19')); stamp(q1, '2026-10-19');
  assert.ok(q1, 'hay pregunta');
  assert.strictEqual(q1.kind, 'rubro');
  assert.ok(q1.opciones.length >= 2, 'al menos 2 opciones');
  const vals = q1.opciones.map((o) => JSON.parse(o.value));
  assert.ok(vals.every((v) => v.rubro === 'belleza'), 'opciones del rubro firme');
  assert.ok(vals.some((v) => v.subrubro === 'makeup'), 'incluye makeup');
  assert.strictEqual(q1.allow_text, false, 'rubro es solo un toque');
});
ok('tope duro: un segundo ensure (reporte + ritual) devuelve LA MISMA y no crea otra', () => {
  const q1b = pq.ensureWeeklyQuestion(dbInst, 77, '2026-10-19', NOW('2026-10-19'));
  assert.strictEqual(q1b.id, q1.id);
  assert.strictEqual(pendingCount(), 1);
});

console.log('== 2) Responder el rubro: cierra el candidato y lockea digest + perfil ==');
ok('la respuesta de rubro cae al digest y al perfil', () => {
  const makeup = q1.opciones.find((o) => JSON.parse(o.value).subrubro === 'makeup');
  const r = pq.applyAnswer(dbInst, 77, q1.id, { value: makeup.value });
  assert.ok(r.ok, JSON.stringify(r));
  const d = stored();
  assert.strictEqual(d.rubro_id.needs_question, false);
  assert.strictEqual(d.rubro_id.fuente, 'pregunta');
  assert.strictEqual(d.subcat, 'makeup');
  assert.ok(!(d.question_candidates || []).some((c) => c.tipo === 'rubro'), 'el candidato de rubro desapareció');
  const prof = dbInst.prepare('SELECT category, subrubro FROM profiles WHERE user_id = 77').get();
  assert.strictEqual(prof.category, 'belleza');
  assert.strictEqual(prof.subrubro, 'makeup');
  assert.strictEqual(pendingCount(), 0);
});
ok('resuelta la semana, no nace otra pregunta esa misma semana', () => {
  assert.strictEqual(pq.ensureWeeklyQuestion(dbInst, 77, '2026-10-19', NOW('2026-10-19')), null);
});

console.log('== 3) Semana 2: estrella inferido. Se ignora → expira y NO se repite al toque ==');
let q2;
ok('la pregunta de la semana 2 es confirmar el estrella inferido', () => {
  q2 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-10-26', NOW('2026-10-26')); stamp(q2, '2026-10-26');
  assert.ok(q2);
  assert.strictEqual(q2.kind, 'estrella');
  assert.ok(q2.opciones.some((o) => o.value === 'Blend Patagonia'), 'opción Sí con el ítem');
});
let q3;
ok('semana 3: la ignorada expiró y sale la contradicción (otra pregunta, no la misma)', () => {
  q3 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-11-02', NOW('2026-11-02')); stamp(q3, '2026-11-02');
  assert.ok(q3);
  assert.strictEqual(q3.kind, 'contradiccion');
  const row2 = dbInst.prepare('SELECT status FROM posty_questions WHERE id = ?').get(q2.id);
  assert.strictEqual(row2.status, 'expired');
  assert.strictEqual(pendingCount(), 1);
});
ok('responder la contradicción fija el precio del dueño en digest y ADN', () => {
  const r = pq.applyAnswer(dbInst, 77, q3.id, { value: '$13.500' });
  assert.ok(r.ok, JSON.stringify(r));
  const d = stored();
  assert.strictEqual(d.productos.find((p) => p.nombre === 'Blend Patagonia').precio, '$13.500');
  assert.strictEqual((d.contradictions || []).length, 0);
  assert.ok(d.dueno && d.dueno.precios && d.dueno.precios['blend patagonia'], 'precio del dueño registrado');
  assert.ok(!(d.question_candidates || []).some((c) => c.tipo === 'contradiccion'));
});

console.log('== 4) Huecos del ADN, en orden, semana a semana ==');
ok('semana 4: hueco "qué se vende más" (el estrella inferido tapa el hueco estrella)', () => {
  const q4 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-11-09', NOW('2026-11-09')); stamp(q4, '2026-11-09');
  assert.ok(q4);
  assert.strictEqual(q4.kind, 'mas_vendido');
  const r = pq.applyAnswer(dbInst, 77, q4.id, { text: 'El Kit Omakase, vuela' });
  assert.ok(r.ok);
  // La respuesta libre se guarda como dato, no como frase: el ítem elegido manda.
  assert.ok(stored().dueno.mas_vendido.includes('Kit Omakase'));
});
ok('semana 5: hueco promos — "sin promos" también es respuesta', () => {
  const q5 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-11-16', NOW('2026-11-16')); stamp(q5, '2026-11-16');
  assert.ok(q5);
  assert.strictEqual(q5.kind, 'promos');
  const r = pq.applyAnswer(dbInst, 77, q5.id, { value: '__none__' });
  assert.ok(r.ok && r.applied === 'promos:ninguna');
});
ok('semana 6: la estrella ignorada volvió tras 21 días (y ahora sí se confirma)', () => {
  const q6 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-11-23', NOW('2026-11-23')); stamp(q6, '2026-11-23');
  assert.ok(q6);
  assert.strictEqual(q6.kind, 'estrella');
  const si = q6.opciones.find((o) => o.value === 'Blend Patagonia');
  const r = pq.applyAnswer(dbInst, 77, q6.id, { value: si.value });
  assert.ok(r.ok);
  const d = stored();
  assert.strictEqual(d.inferred_star.fuente, 'dueno');
  assert.strictEqual(d.dueno.estrella, 'Blend Patagonia');
  assert.strictEqual(dna().producto_estrella, 'Blend Patagonia');
  assert.ok(!(d.question_candidates || []).some((c) => c.tipo === 'estrella'), 'ya no se pide confirmar lo confirmado');
});
ok('semana 7: hueco cliente ideal — la respuesta cae al ADN', () => {
  const q7 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-11-30', NOW('2026-11-30')); stamp(q7, '2026-11-30');
  assert.ok(q7);
  assert.strictEqual(q7.kind, 'cliente');
  const r = pq.applyAnswer(dbInst, 77, q7.id, { text: 'Novias y madrinas de 25 a 45' });
  assert.ok(r.ok);
  assert.strictEqual(dna().cliente_ideal, 'Novias y madrinas de 25 a 45');
});
ok('semana 8: hueco "qué NO publicar" — cae al ADN y al digest', () => {
  const q8 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-12-07', NOW('2026-12-07')); stamp(q8, '2026-12-07');
  assert.ok(q8);
  assert.strictEqual(q8.kind, 'no_publicar');
  const r = pq.applyAnswer(dbInst, 77, q8.id, { text: 'Nunca muestres precios de la competencia' });
  assert.ok(r.ok);
  assert.strictEqual(dna().no_publicar, 'Nunca muestres precios de la competencia');
  assert.strictEqual(stored().dueno.no_publicar, 'Nunca muestres precios de la competencia');
});
ok('semana 9: sin huecos ni dudas → sale el RADAR (v306: la pregunta semanal de Valentino)', () => {
  // (v306) La regla vieja era "sin huecos, no hay pregunta". La decisión
  // de Valentino (2026-10-21) la reemplaza: con el fundamento completo,
  // la pregunta de la semana es el RADAR — "qué se viene esta semana en
  // tu negocio?" — cuya respuesta decide los posteos de la semana.
  const q9 = pq.ensureWeeklyQuestion(dbInst, 77, '2026-12-14', NOW('2026-12-14')); stamp(q9, '2026-12-14');
  assert.ok(q9);
  assert.strictEqual(q9.kind, 'radar');
  assert.strictEqual(q9.texto, 'qué se viene esta semana en tu negocio?');
});

console.log('== 5) "Ahora no": no vuelve por 42 días y la semana siguiente sale otra ==');
ok('memoria de bloqueos (42 días resuelta / 21 días ignorada)', () => {
  const now = NOW('2026-10-19');
  const hist = [
    { qkey: 'hueco:promos', status: 'dismissed', created_at: '2026-09-10 12:00:00' }, // 39 días: bloqueada
    { qkey: 'hueco:cliente', status: 'dismissed', created_at: '2026-09-01 12:00:00' }, // 48 días: libre
    { qkey: 'estrella-inf:x', status: 'expired', created_at: '2026-10-05 12:00:00' }, // 14 días: bloqueada
    { qkey: 'precio:y', status: 'expired', created_at: '2026-09-20 12:00:00' }, // 29 días: libre
  ];
  const b = pq.blockedKeys(hist, now);
  assert.ok(b.has('hueco:promos'));
  assert.ok(!b.has('hueco:cliente'));
  assert.ok(b.has('estrella-inf:x'));
  assert.ok(!b.has('precio:y'));
});
ok('dismiss marca la fila y la semana siguiente ofrece la siguiente prioridad', () => {
  dbInst.prepare(`INSERT INTO users (id, email, password_hash) VALUES (78, 'otra@example.com', 'x')`).run();
  dbInst.prepare(`INSERT INTO profiles (user_id, business_name, category) VALUES (78, 'Café Sur', 'gastronomia')`).run();
  dbInst.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (78, '{}')`).run();
  const d78 = clientDigest.emptyDigest();
  d78.business = 'Café Sur';
  d78.productos = [{ nombre: 'Blend Patagonia' }, { nombre: 'Medialunas' }];
  d78.inferred_star = { item: 'Blend Patagonia', confidence: 0.9, evidence: ['top'], score: 9 };
  clientDigest.saveDigest(dbInst, 78, d78);
  const qa = pq.ensureWeeklyQuestion(dbInst, 78, '2026-10-19', NOW('2026-10-19')); stamp(qa, '2026-10-19');
  assert.strictEqual(qa.kind, 'estrella');
  pq.dismissQuestion(dbInst, 78, qa.id);
  const qb = pq.ensureWeeklyQuestion(dbInst, 78, '2026-10-26', NOW('2026-10-26')); stamp(qb, '2026-10-26');
  assert.ok(qb, 'hay otra pregunta');
  assert.strictEqual(qb.kind, 'mas_vendido');
});

console.log('== 6) deriveTopics usa el estrella del dueño ==');
ok('el ítem confirmado por el dueño abre la rotación de temas', () => {
  const d = clientDigest.emptyDigest();
  d.business = 'Café Sur'; d.category = 'gastronomia';
  d.productos = [{ nombre: 'Medialunas de manteca' }, { nombre: 'Blend Patagonia' }];
  d.dueno = { estrella: 'Blend Patagonia' };
  const topics = clientDigest.deriveTopics(d, { count: 3 });
  assert.ok(topics.length >= 1);
  assert.strictEqual(topics[0].digest_anchor, 'Blend Patagonia');
});

console.log('== 7) Contrato de deploy ==');
ok('server: endpoints + reporte + BUILD_ID presente', () => {
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  // (v306) El pin literal de versión (v243) quedó fósil: fallaba con
  // cualquier build posterior sin decir nada del contrato. Se verifica
  // la FORMA del BUILD_ID, que es lo que el contrato necesita.
  assert.ok(/const BUILD_ID = '\d{8}-v\d+'/.test(srv), 'BUILD_ID con forma AAAA-vNNN');
  assert.ok(srv.includes("app.get('/api/questions/current'"));
  assert.ok(srv.includes("app.post('/api/questions/:id/answer'"));
  assert.ok(srv.includes("app.post('/api/questions/:id/dismiss'"));
  assert.ok(srv.includes('question: weeklyQuestionFor(uid)'));
  assert.ok(srv.includes('NUNCA publicar'));
});
ok('app.js: tarjeta en Schedule con caché propia', () => {
  const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  assert.ok(app.includes('id="hs-question"'));
  assert.ok(app.includes('async function enhanceQuestion'));
  assert.ok(app.includes('function wireQuestionCard'));
  assert.ok(app.includes("api.get('/api/questions/current')"));
  assert.ok(app.includes('Ahora no'));
});
ok('db.js: tabla posty_questions', () => {
  const dbsrc = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  assert.ok(dbsrc.includes('CREATE TABLE IF NOT EXISTS posty_questions'));
});

console.log(`\n${passed}/${passed} OK — POSTY PREGUNTA ✅`);
