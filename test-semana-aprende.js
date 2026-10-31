// Harness de semana-aprende.js (NO va al zip de más; sí al repo como test).
// node test-semana-aprende.js — DB real en memoria (node:sqlite).
// Cubre el loop completo: semana N real → plan N+1 ajustado, sin ventas
// inventadas, sin preguntas inventadas, sin señales cuando no las hay.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const sa = require('./semana-aprende');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

const DDL = `
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  source_topic TEXT DEFAULT '', source_angle TEXT DEFAULT '', tipo TEXT DEFAULT '',
  status TEXT DEFAULT 'draft', week_key TEXT DEFAULT '', scheduled_at TEXT DEFAULT '',
  published_at TEXT DEFAULT '', created_at TEXT DEFAULT '');
CREATE TABLE oficina_nivel_eventos (id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, poder TEXT, evento TEXT, hecho TEXT DEFAULT '',
  registro_ref TEXT DEFAULT '', ts INTEGER);
CREATE TABLE comment_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  text TEXT DEFAULT '', created_at TEXT DEFAULT '');
CREATE TABLE dm_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  text TEXT DEFAULT '', created_at TEXT DEFAULT '');
CREATE TABLE piece_learning (post_id INTEGER PRIMARY KEY, user_id INTEGER,
  week_key TEXT DEFAULT '', comments INTEGER DEFAULT 0, saves INTEGER DEFAULT 0);
CREATE TABLE account_experiments (id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, week_key TEXT DEFAULT '', hypothesis TEXT DEFAULT '',
  result TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
`;

function seedSemanaN(db) {
  // Semana anterior: lunes 2026-10-19. Destino: lunes 2026-10-26.
  db.exec(DDL);
  const insP = db.prepare(`INSERT INTO posts (id, user_id, source_topic, source_angle, tipo, status, week_key)
    VALUES (?, 1, ?, ?, ?, ?, '2026-10-19')`);
  insP.run(11, '2x1 de medialunas', 'promo de la mañana', 'promo', 'published');
  insP.run(12, 'Turnos del sábado', 'agenda abierta', 'tip', 'published');
  insP.run(13, 'Promo Día de la Madre', 'regalos para mamá', 'promo', 'scheduled');
  // Aces: pieza 11 aceptada sin cambios 2 veces (dos eventos), dentro de la ventana.
  const ms = Date.UTC(2026, 9, 21, 15); // miércoles de la semana anterior
  const insE = db.prepare(`INSERT INTO oficina_nivel_eventos (user_id, poder, evento, hecho, registro_ref, ts)
    VALUES (1, 'posty', ?, ?, ?, ?)`);
  insE.run('pieza_aceptada_primera', 'aceptada sin cambios', 'pieza:11', ms);
  insE.run('pieza_aceptada_primera', 'aceptada sin cambios', 'pieza:11', ms + 3600000);
  insE.run('semana_aceptada', 'semana entera aceptada', 'semana-aceptada:2026-10-19', ms);
  // Ace FUERA de ventana (semana anterior a la anterior): no debe contar.
  insE.run('pieza_aceptada_primera', 'vieja', 'pieza:12', Date.UTC(2026, 9, 5, 15));
  // Preguntas recibidas en la semana anterior (con created_at en ventana).
  const insQ = db.prepare(`INSERT INTO comment_queue (user_id, text, created_at) VALUES (1, ?, ?)`);
  insQ.run('¿tienen opciones sin TACC?', '2026-10-20 10:00:00');
  insQ.run('hola, ¿abren el domingo?', '2026-10-22 18:30:00');
  insQ.run('qué rico se ve todo', '2026-10-21 09:00:00'); // no es pregunta: se ignora
  db.prepare(`INSERT INTO dm_queue (user_id, text, created_at) VALUES (1, ?, ?)`)
    .run('¿cuánto sale la docena?', '2026-10-23 12:00:00');
  // IG medido: la pieza 12 sumó guardados + comentarios.
  db.prepare(`INSERT INTO piece_learning (post_id, user_id, week_key, comments, saves)
    VALUES (12, 1, '2026-10-19', 4, 3)`).run();
}

// --- 1. Fechas ---
t('prevWeekKey 2026-10-26 → 2026-10-19', sa.prevWeekKey('2026-10-26') === '2026-10-19', sa.prevWeekKey('2026-10-26'));
t('prevWeekKey inválida → null', sa.prevWeekKey('no-fecha') === null);
t('prevWeekKey sin weekKey → null', sa.prevWeekKey('') === null);

// --- 2. Cold start: sin señales, plan intacto ---
{
  const db = new DatabaseSync(':memory:');
  db.exec(DDL);
  const ap = sa.aprendizajeSemanaAnterior(db, 1, '2026-10-26');
  t('cold start tiene=false', ap.tiene === false, ap);
  t('cold start texto vacío', sa.textoParaBrief(ap) === '');
  const pick = { titulo: 'Algo nuevo', angulo: 'novedad', porque: 'Porque es novedad.' };
  t('cold start porqué intacto', sa.porqueConAprendizaje(pick, ap) === 'Porque es novedad.');
  t('cold start no empareja', sa.emparejarPicks([pick], ap).length === 0);
  t('cold start no escribe hipótesis', sa.registrarHipotesis(db, 1, '2026-10-26', ap, [{ pick, motivo: { kind: 'ace', tema: 'x', n: 1 } }]) === null);
  const rows = db.prepare('SELECT COUNT(*) AS n FROM account_experiments').get();
  t('cold start 0 filas hipótesis', rows.n === 0, rows);
}

// --- 3. Semana N real → aprendizaje completo ---
{
  const db = new DatabaseSync(':memory:');
  seedSemanaN(db);
  const eventos = [
    { name: 'Día de la Madre', date: '2026-10-18' }, // semana anterior (domingo previo al lunes 19: cae fuera de [19,26)? 18 < 19 → fuera)
    { name: 'Halloween', date: '2026-10-31' },       // semana destino
    { name: 'CyberMonday', date: '2026-11-02' },      // fuera de la destino
  ];
  const ap = sa.aprendizajeSemanaAnterior(db, 1, '2026-10-26', eventos);
  t('semana N tiene=true', ap.tiene === true, ap);
  t('semana aceptada detectada', ap.semanaAceptada === true);
  t('aces: medialunas n=2', ap.aces.length === 1 && ap.aces[0].n === 2 && /medialunas/.test(ap.aces[0].tema), ap.aces);
  t('ace vieja fuera de ventana no cuenta', !ap.aces.some((a) => /sábado/.test(a.tema)), ap.aces);
  t('preguntas en semana = 3 (2 comentarios + 1 DM)', ap.preguntas.length === 3, ap.preguntas);
  t('pregunta sin signo pero con forma no entra', !ap.preguntas.some((p) => /qué rico/.test(p.texto)));
  t('pregunta textual exacta, no inventada', ap.preguntas.some((p) => p.texto === '¿tienen opciones sin TACC?'));
  t('IG medido: turnos 3 guardados 4 comentarios', ap.ig.length === 1 && ap.ig[0].saves === 3 && ap.ig[0].comments === 4, ap.ig);
  t('fechas pendientes: Halloween en destino', ap.fechasPendientes.some((f) => f.nombre === 'Halloween'), ap.fechasPendientes);
  t('CyberMonday fuera de destino no entra', !ap.fechasPendientes.some((f) => f.nombre === 'CyberMonday'));

  const brief = sa.textoParaBrief(ap);
  t('brief cita semana aceptada', /se aceptó entera/.test(brief), brief);
  t('brief cita aces con conteo', /2 veces/.test(brief), brief);
  t('brief cita pregunta textual', /sin TACC/.test(brief), brief);
  t('brief cita guardados reales', /3 guardados/.test(brief), brief);
  t('brief SIN ventas ni atribución', !/vend|clientes nuevos|trajo clientes/i.test(brief), brief);

  // --- 4. Plan N+1 ajustado ---
  const picks = [
    { titulo: 'Opciones sin TACC de la casa', angulo: 'para celíacos', tipo: 'tip', porque: 'Porque hay público celíaco.' },
    { titulo: 'El café de siempre', angulo: 'rutina', tipo: 'social', porque: 'Porque es clásico.' },
    { titulo: '2x1 de medialunas, segunda vuelta', angulo: 'promo de la mañana', tipo: 'promo', porque: 'Porque la promo rinde.' },
  ];
  const emp = sa.emparejarPicks(picks, ap);
  t('empareja pregunta (sin TACC) y ace (medialunas)', emp.length === 2, emp.map((e) => e.motivo.kind));
  t('prioridad pregunta antes que ace', emp[0].motivo.kind === 'pregunta');
  const pq1 = sa.porqueConAprendizaje(picks[0], ap);
  t('porqué cita la pregunta real', /preguntaron por esto/.test(pq1) && /sin TACC/.test(pq1), pq1);
  const pq2 = sa.porqueConAprendizaje(picks[1], ap);
  t('pick sin señal: porqué intacto', pq2 === 'Porque es clásico.', pq2);
  const pq3 = sa.porqueConAprendizaje(picks[2], ap);
  t('porqué cita ace con conteo', /aceptó sin cambios 2 veces/.test(pq3), pq3);
  const pqDup = sa.porqueConAprendizaje({ titulo: 'x', angulo: 'y', porque: 'La semana pasada ya dije esto.' }, ap);
  t('porqué que ya cita no se duplica', pqDup === 'La semana pasada ya dije esto.', pqDup);

  // --- 5. Hipótesis: una por semana, dedup, medición ---
  const h1 = sa.registrarHipotesis(db, 1, '2026-10-26', ap, emp);
  t('hipótesis escrita', h1 && h1.ok === true, h1);
  const h2 = sa.registrarHipotesis(db, 1, '2026-10-26', ap, emp);
  t('hipótesis dedup por semana', h2 && h2.ok === false && h2.reason === 'ya_existe', h2);
  const nHip = db.prepare('SELECT COUNT(*) AS n FROM account_experiments WHERE user_id = 1 AND week_key = ?').get('2026-10-26');
  t('exactamente 1 hipótesis en la semana', nHip.n === 1, nHip);
}

// --- 6. Medición de la hipótesis anterior ---
{
  const db = new DatabaseSync(':memory:');
  seedSemanaN(db);
  // Hipótesis de la semana anterior: tema medialunas → la semana N tuvo aces de medialunas.
  db.prepare(`INSERT INTO account_experiments (user_id, week_key, hypothesis, result)
    VALUES (1, '2026-10-19', 'Tema «2x1 de medialunas» aceptado sin cambios', '')`).run();
  const m = sa.medirHipotesisAnterior(db, 1, '2026-10-26');
  t('hipótesis anterior medida confirmada', m && /confirmada/.test(m.result), m);
  const row = db.prepare(`SELECT result FROM account_experiments WHERE week_key = '2026-10-19'`).get();
  t('resultado persistido', /confirmada/.test(row.result), row);
  const m2 = sa.medirHipotesisAnterior(db, 1, '2026-10-26');
  t('hipótesis ya medida no se re-mide', m2 === null, m2);
}
{
  const db = new DatabaseSync(':memory:');
  seedSemanaN(db);
  db.prepare(`INSERT INTO account_experiments (user_id, week_key, hypothesis, result)
    VALUES (1, '2026-10-19', 'Tema «sushi del chef» que no existió', '')`).run();
  const m = sa.medirHipotesisAnterior(db, 1, '2026-10-26');
  t('hipótesis sin ace del tema → no_confirmada', m && /no_confirmada/.test(m.result), m);
}
{
  // Sin aces en la semana anterior: la hipótesis queda sin medir (no se refuta por ausencia).
  const db = new DatabaseSync(':memory:');
  db.exec(DDL);
  db.prepare(`INSERT INTO account_experiments (user_id, week_key, hypothesis, result)
    VALUES (1, '2026-10-19', 'Tema «x»', '')`).run();
  const m = sa.medirHipotesisAnterior(db, 1, '2026-10-26');
  t('sin aces: sin medición', m === null, m);
  const row = db.prepare(`SELECT result FROM account_experiments`).get();
  t('result sigue vacío', row.result === '', row);
}

// --- 7. Preguntas sin created_at: alimentan el brief, jamás el porqué con semana ---
{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
    source_topic TEXT DEFAULT '', source_angle TEXT DEFAULT '', tipo TEXT DEFAULT '',
    status TEXT DEFAULT 'draft', week_key TEXT DEFAULT '');
  CREATE TABLE oficina_nivel_eventos (id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, poder TEXT, evento TEXT, hecho TEXT DEFAULT '',
    registro_ref TEXT DEFAULT '', ts INTEGER);
  CREATE TABLE comment_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, text TEXT DEFAULT '');
  CREATE TABLE dm_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, text TEXT DEFAULT '');
  CREATE TABLE piece_learning (post_id INTEGER PRIMARY KEY, user_id INTEGER,
    week_key TEXT DEFAULT '', comments INTEGER DEFAULT 0, saves INTEGER DEFAULT 0);
  CREATE TABLE account_experiments (id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, week_key TEXT DEFAULT '', hypothesis TEXT DEFAULT '', result TEXT DEFAULT '');`);
  db.prepare(`INSERT INTO comment_queue (user_id, text) VALUES (1, '¿tienen delivery?')`).run();
  const ap = sa.aprendizajeSemanaAnterior(db, 1, '2026-10-26');
  t('sin created_at: pregunta reciente, no en semana', ap.preguntas.length === 0 && ap.preguntasRecientes.length === 1, ap);
  t('sin created_at: tiene=false (sin señal de semana)', ap.tiene === false, ap);
  const brief = sa.textoParaBrief(ap);
  t('brief la rotula recientes, no semana pasada', /recientes/.test(brief) && !/Preguntas recibidas la semana pasada/.test(brief), brief);
}

// --- 8. Utilidades ---
t('esPregunta con signo', sa._esPregunta('¿abren hoy?') === true);
t('esPregunta con forma sin signo', sa._esPregunta('cuánto sale la docena') === true);
t('esPregunta: afirmación no es pregunta', sa._esPregunta('qué rico se ve todo') === false);
t('sigTokens filtra cortas y stopwords', JSON.stringify(sa._sigTokens('El 2x1 de medialunas de la casa')) === JSON.stringify(['2x1', 'medialunas', 'casa']));

console.log(`\ntest-semana-aprende: ${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
