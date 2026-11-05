// test-lote-consolasoporte.js — CONSOLA DE SOPORTE (lote consola-soporte,
// base v697). Panel único de principio a fin + espejo + alertas + casos.
//
// Cubre: el espejo muestra el feed del cliente con sus posteos reales y la
// carta primera; un posteo no publicado abre un caso con el dato real;
// una prueba trabada abre un caso; un caso no cierra sin confirmación del
// cliente; ninguna acción del equipo publica sin registro (toda acción
// escribe en support_team_log); sin dato no se inventa estado; el panel
// muestra el recorrido completo de un cliente de principio a fin (cada
// etapa con su estado) y lo urgente queda al frente (rojo → ámbar → verde).
// DB scratch en memoria; fechas relativas al ahora real (las ventanas SQL
// usan datetime('now')).
// Uso: node test-lote-consolasoporte.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { dayKeyInTz } = require('./morning-post-push');
const support = require('./support-cases');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const NOW = new Date();
function utc(d) { return d.toISOString().slice(0, 19).replace('T', ' '); }
function hoursAgo(h) { return utc(new Date(NOW.getTime() - h * 3600 * 1000)); }
function daysAgo(d) { return utc(new Date(NOW.getTime() - d * 24 * 3600 * 1000)); }
function hoursAhead(h) { return utc(new Date(NOW.getTime() + h * 3600 * 1000)); }
const TODAY_NY = dayKeyInTz(NOW, 'America/New_York');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT DEFAULT '', plan TEXT DEFAULT '', plan_status TEXT DEFAULT 'active', publishing_stopped INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-10-01 00:00:00');
  CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '');
  CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '');
  CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'pending', media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, source_topic TEXT DEFAULT '', week_key TEXT DEFAULT '', strategy_why TEXT DEFAULT '', error TEXT DEFAULT '', ig_permalink TEXT DEFAULT '', ig_media_id TEXT DEFAULT '', published_at TEXT, created_at TEXT DEFAULT '2026-10-20 00:00:00');
  CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT DEFAULT '', text TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE pz_ritual (user_id INTEGER NOT NULL, day_key TEXT NOT NULL, recommended_post_id INTEGER NOT NULL, alt_post_ids TEXT NOT NULL DEFAULT '[]', picked_post_id INTEGER, gold INTEGER NOT NULL DEFAULT 0, picked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, day_key));
  CREATE TABLE morning_post_push (user_id INTEGER NOT NULL, day_key TEXT NOT NULL, post_id INTEGER NOT NULL, sent_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, day_key));
  CREATE TABLE push_subscriptions (user_id INTEGER NOT NULL, endpoint TEXT DEFAULT '', keys_json TEXT DEFAULT '', transport TEXT DEFAULT '');
  CREATE TABLE publish_ledger (post_id INTEGER NOT NULL, status TEXT DEFAULT '');
  CREATE TABLE publish_watchdog_escalations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, original_scheduled_at TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE qa_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT (datetime('now')), passed INTEGER, result TEXT, image_path TEXT);
  CREATE TABLE health_interventions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierta', created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, days_to_resolve INTEGER);
  CREATE TABLE ig_home_snapshot (user_id INTEGER PRIMARY KEY, username TEXT DEFAULT '', payload TEXT DEFAULT '', fetched_at INTEGER DEFAULT 0);
  CREATE TABLE post_signals (user_id INTEGER, post_id INTEGER, caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_for TEXT DEFAULT '', rubro TEXT DEFAULT '', client_signal TEXT DEFAULT '', week_key TEXT DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (user_id, post_id));
  CREATE TABLE style_rules (user_id INTEGER, rule_key TEXT, rule_text TEXT DEFAULT '', hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1, PRIMARY KEY (user_id, rule_key));
  CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '');
`);

// Usuarios: 12 Valentino (activo, con todo) · 13 Café Aroma (prueba
// trabada + sin aprobar) · 14 Top Team (verde) · 15 Perfumería (vencido +
// escalado) · 16 (error de semana) · 17 (nuevo, sin datos).
const users = [
  [12, 'valentino_bamboo@hotmail.com', 'posty', 'active'],
  [13, 'cafe@aroma.test', 'posty', 'trial'],
  [14, 'top@team.test', 'posty', 'active'],
  [15, 'perfume@test.dev', 'posty', 'active'],
  [16, 'semana@test.dev', 'posty', 'active'],
  [17, 'nuevo@test.dev', 'posty', 'active'],
];
for (const [id, email, plan, st] of users) {
  db.prepare('INSERT INTO users (id, email, plan, plan_status) VALUES (?,?,?,?)').run(id, email, plan, st);
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?)').run(id, 'America/New_York');
}
const profs = [
  [12, 'Posty', 'posty.communitymanager', 'Marketing'],
  [13, 'Café Aroma', 'cafe.aroma', 'Cafetería'],
  [14, 'Top Team', 'topteamcontractorsllc', 'Construcción'],
  [15, 'Perfumería', 'perfumeria.test', 'Perfume'],
  [16, 'Semana Test', 'semana.test', 'Marketing'],
  [17, 'Nuevo', '', ''],
];
for (const [uid, b, ig, cat] of profs) {
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?,?,?,?)').run(uid, b, ig, cat);
}
db.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (12, ?)`)
  .run(JSON.stringify({ productos: ['Café', 'Perfume'], rubro: 'Marketing' }));

// Posteos de user 12: el 518 real (hoy 22:00 UTC, con el empalme que Juli
// marcó), el 519 de mañana, el 551 publicado ayer, el 554 cancelado.
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, created_at)
  VALUES (518, 12, '/media/518.jpg', 'El ingrediente de Así trabajamos detrás de escena en Posty que casi nadie usa (y nosotros sí, en Posty.)', ?, 'scheduled', 'approved', 'Detrás de escena: el proceso real.', ?)`)
  .run(hoursAhead(3), daysAgo(2));
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, created_at)
  VALUES (519, 12, '/media/519.jpg', 'Mañana sale el café.', ?, 'scheduled', 'approved', 'Producto que vende.', ?)`)
  .run(hoursAhead(27), daysAgo(2));
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, status, approval, published_at, ig_permalink, ig_media_id, created_at)
  VALUES (551, 12, '/media/551.jpg', 'El estadio.', 'published', 'approved', ?, 'https://instagram.com/p/551', 'm551', ?)`)
  .run(daysAgo(1), daysAgo(2));
db.prepare(`INSERT INTO posts (id, user_id, caption, status, approval, created_at)
  VALUES (554, 12, 'Cancelado.', 'cancelled', 'rejected', ?)`).run(daysAgo(1));
// User 13: 2 programados sin aprobar desde hace 3 días + 1 borrador en revisión.
for (let i = 0; i < 2; i++) {
  db.prepare(`INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, approval, week_key, created_at)
    VALUES (13, '/media/13.jpg', 'Post sin aprobar.', ?, 'scheduled', 'pending', '2026-11-02', ?)`)
    .run(hoursAhead(24 + i * 24), daysAgo(3));
}
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, status, approval, needs_review, week_key, source_topic, created_at)
  VALUES (601, 13, '/media/601.jpg', 'Borrador en revisión.', 'draft', 'pending', 1, '2026-11-02', 'cafe', ?)`)
  .run(daysAgo(1));
// User 14: verde — publicado ayer + programado aprobado mañana.
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, status, approval, published_at, ig_permalink, created_at)
  VALUES (701, 14, '/media/701.jpg', 'Obra terminada.', 'published', 'approved', ?, 'https://instagram.com/p/701', ?)`)
  .run(daysAgo(1), daysAgo(2));
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, created_at)
  VALUES (702, 14, '/media/702.jpg', 'Antes y después.', ?, 'scheduled', 'approved', ?)`)
  .run(hoursAhead(26), daysAgo(1));
// User 15: vencido hace 5 h sin recibo + escalación del vigía.
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, created_at)
  VALUES (801, 15, '/media/801.jpg', 'El perfume de hoy.', ?, 'scheduled', 'approved', ?)`)
  .run(hoursAgo(5), daysAgo(1));
db.prepare(`INSERT INTO publish_watchdog_escalations (user_id, post_id, original_scheduled_at, reason, attempts, detail, created_at)
  VALUES (15, 801, ?, 'repeated_overdue_no_receipt', 3, 'reprogramado 3 veces por el vigía y sigue sin recibo', ?)`)
  .run(hoursAgo(5), hoursAgo(1));

// Funnel: 12 y 14 y 15 completos; 13 solo prueba_complete hace 2 días;
// 16 solo week_generate_start hace 3 h.
function funnel(uid, names, days) {
  names.forEach((n, i) => {
    db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (?, ?, ?)`)
      .run(uid, n, daysAgo(days - i * 0.1));
  });
}
funnel(12, ['prueba_view', 'prueba_complete', 'prueba_register', 'ig_connect', 'week_generate_done', 'post_publish'], 3);
funnel(14, ['prueba_view', 'prueba_complete', 'prueba_register', 'ig_connect', 'week_generate_done', 'post_publish'], 4);
funnel(15, ['prueba_view', 'prueba_complete', 'prueba_register', 'ig_connect', 'week_generate_done', 'post_publish'], 4);
db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (13, 'prueba_complete', ?)`)
  .run(daysAgo(2));
db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (16, 'week_generate_start', ?)`)
  .run(hoursAgo(3));

// Chat de user 12 (2 mensajes) + ritual de hoy (518 recomendado, sin elegir)
// + snapshot IG + token push SIN marca de envío (push 9:00 sin entregar).
db.prepare(`INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (12, 'user', 'hola posty', ?)`)
  .run(hoursAgo(5));
db.prepare(`INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (12, 'assistant', 'hola! acá estoy', ?)`)
  .run(hoursAgo(5));
db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id) VALUES (12, ?, 518, '[519]', NULL)`)
  .run(TODAY_NY);
db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, keys_json, transport) VALUES (12, 'tok-12', '{}', 'apns')`)
  .run();
db.prepare(`INSERT INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (12, 'posty.communitymanager', ?, ?)`)
  .run(JSON.stringify({ username: 'posty.communitymanager', recents: [
    { img: '/media/ig1.jpg', type: 'image', taken_at: Date.now() / 1000 - 86400, likes: 5, comments: 0 },
    { img: '/media/ig2.jpg', type: 'video', taken_at: Date.now() / 1000 - 172800, likes: 2, comments: 1 },
  ] }), Date.now());
// qa_audit: defecto de imagen en user 12 (Mora).
db.prepare(`INSERT INTO qa_audit (passed, result, image_path, created_at) VALUES (0, ?, '/media/518.jpg', ?)`)
  .run(JSON.stringify({ user_id: 12, post_id: 518, qa_gate_failed_checks: ['texto_en_ingles'], detalle: 'texto horneado en inglés' }), hoursAgo(5));
// Intervención abierta en user 13 (señal ámbar sin caso).
db.prepare(`INSERT INTO health_interventions (user_id, cause, play, status, created_at) VALUES (13, 'calidad', 'carta', 'abierta', ?)`)
  .run(daysAgo(1));

const absImageUrl = (uid, p) => (p ? 'https://posty.test' + p : null);

// ---------- 1 · Esquema ----------
support.ensureSchema(db);
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'support_%'`).all().map((r) => r.name);
check('esquema: existen support_cases, support_case_events y support_team_log',
  tables.includes('support_cases') && tables.includes('support_case_events') && tables.includes('support_team_log'));

// ---------- 2 · Scan: alertas que abren casos solas ----------
const scan1 = support.scanAlerts(db, { now: NOW });
const byType = {};
for (const c of scan1.opened) (byType[c.tipo] = byType[c.tipo] || []).push(c);
check('scan abre 7 casos (2 post_no_publicado + semana_error + prueba_trabada + sin_aprobar + push_9 + defecto_imagen)',
  scan1.opened.length === 7, 'abrió ' + scan1.opened.length + ': ' + scan1.opened.map((c) => c.tipo + '#' + c.id).join(', '));
check('post_no_publicado por escalación del vigía trae el dato real',
  (byType.post_no_publicado || []).some((c) => c.post_id === 801 && c.detalle.includes('repeated_overdue_no_receipt') && c.detalle.includes('3 intentos')));
check('post_no_publicado por vencido vivo trae hora y caption reales',
  (byType.post_no_publicado || []).some((c) => c.post_id === 801 && c.detalle.includes('sigue en scheduled sin recibo')));
check('prueba_trabada abre caso con el dato real (usuario 13)',
  (byType.prueba_trabada || []).some((c) => c.user_id === 13 && c.detalle.includes('no avanzó en 24 h')));
check('sin_aprobar abre caso por semana (usuario 13)',
  (byType.sin_aprobar || []).some((c) => c.user_id === 13 && c.detalle.includes('2 posteo(s)')));
check('push_9_sin_entregar abre caso (usuario 12, con token)',
  (byType.push_9_sin_entregar || []).some((c) => c.user_id === 12 && c.post_id === 518));
check('defecto_imagen abre caso desde qa_audit (usuario 12, post 518)',
  (byType.defecto_imagen || []).some((c) => c.user_id === 12 && c.post_id === 518 && c.detalle.includes('texto_en_ingles')));
check('semana_error abre caso (usuario 16, start sin done)',
  (byType.semana_error || []).some((c) => c.user_id === 16 && c.detalle.includes('week_generate_done')));
check('cada caso abierto tiene número, dueño y siguiente paso',
  scan1.opened.every((c) => Number.isInteger(c.id) && c.id > 0 && c.dueno && c.siguiente_paso));
const scan2 = support.scanAlerts(db, { now: NOW });
check('segundo scan no duplica casos (dedup por clave)', scan2.opened.length === 0, 'abrió ' + scan2.opened.length);

// ---------- 3 · Cierre solo con confirmación del cliente ----------
const casoPrueba = byType.prueba_trabada[0];
const noClose = support.closeCase(db, casoPrueba.id, { now: NOW });
check('cerrar sin confirmado_por se niega (sin_confirmacion)',
  noClose.ok === false && noClose.error === 'sin_confirmacion');
check('el caso sigue abierto tras el intento sin confirmación',
  support.getCase(db, casoPrueba.id).estado === 'abierto');
const yesClose = support.closeCase(db, casoPrueba.id, { confirmadoPor: 'Café Aroma por chat', now: NOW });
check('cerrar con confirmado_por cierra y registra quién confirmó',
  yesClose.ok === true && yesClose.caso.estado === 'cerrado' && yesClose.caso.confirmado_por === 'Café Aroma por chat');
check('el cierre queda en el historial del caso',
  yesClose.caso.eventos.some((e) => e.kind === 'cierre' && e.texto.includes('Café Aroma')));
const reOpen = support.reopenCase(db, casoPrueba.id, { texto: 'El cliente escribió de nuevo.' });
check('reabrir vuelve a abierto y anota el motivo',
  reOpen.ok === true && reOpen.caso.estado === 'abierto' && reOpen.caso.confirmado_por === null);

// ---------- 4 · Dueño, siguiente paso, nota manual, dedup manual ----------
const casoAyuda = support.openCase(db, { userId: 14, tipo: 'ayuda', titulo: 'No encuentra su posteo',
  detalle: 'El cliente no encuentra el posteo del viernes.', siguientePaso: 'Mostrarle dónde está.',
  dedupKey: 'manual:14:viernes' });
check('caso manual se abre con número', casoAyuda.ok === true && casoAyuda.caso.id > 0);
const casoAyudaDup = support.openCase(db, { userId: 14, tipo: 'ayuda', titulo: 'duplicado',
  dedupKey: 'manual:14:viernes' });
check('caso manual con la misma clave no duplica', casoAyudaDup.ok === true && casoAyudaDup.duplicado === true && casoAyudaDup.caso.id === casoAyuda.caso.id);
const owned = support.setOwner(db, casoAyuda.caso.id, 'Valentino', 'equipo');
check('asignar dueño actualiza y queda en el historial',
  owned.ok === true && owned.caso.dueno === 'Valentino');
const stepped = support.setNextStep(db, casoAyuda.caso.id, 'Llamarlo hoy a las 18:00.', 'equipo');
check('siguiente paso actualiza', stepped.ok === true && stepped.caso.siguiente_paso === 'Llamarlo hoy a las 18:00.');
support.addEvent(db, casoAyuda.caso.id, { actor: 'equipo', kind: 'nota', texto: 'Lo encontramos: era el 702.' });
check('nota manual queda en el historial',
  support.getCase(db, casoAyuda.caso.id).eventos.some((e) => e.texto.includes('era el 702')));

// ---------- 5 · Acciones del equipo: registro siempre, nunca publican ----------
const logBefore = support.teamLog(db, {}).length;
const re1 = support.reschedulePost(db, 518, hoursAhead(4), { actor: 'equipo' });
check('reprogramar mueve la hora del posteo',
  re1.ok === true && re1.post.scheduled_at === hoursAhead(4));
check('reprogramar queda en el log del equipo',
  support.teamLog(db, { postId: 518 }).some((l) => l.action === 'reprogramar' && l.detalle.includes('518')));
check('reprogramar queda en el historial del caso del posteo',
  support.listCases(db, { userId: 12, estado: 'abierto' })
    .some((c) => c.post_id === 518 && support.getCase(db, c.id).eventos.some((e) => e.texto.includes('reprogramar'))));
check('reprogramar un publicado se niega', support.reschedulePost(db, 551, hoursAhead(4)).error === 'no_programado');
check('reprogramar con fecha inválida se niega', support.reschedulePost(db, 518, 'no-fecha').error === 'fecha_invalida');
check('reprogramar inexistente se niega', support.reschedulePost(db, 99999, hoursAhead(4)).error === 'no_existe');

let regenCalls = [];
const re2 = support.redoPost(db, 601, { actor: 'equipo', note: 'La foto no es el producto.',
  regen: (uid, wk, topic) => { regenCalls.push([uid, wk, topic]); return Promise.resolve(); } });
check('rehacer borrador en revisión: borra y regenera',
  re2.ok === true && re2.modo === 'regenerar' && regenCalls.length === 1 && regenCalls[0][0] === 13 && regenCalls[0][1] === '2026-11-02');
check('rehacer borrador en revisión queda en el log',
  support.teamLog(db, { postId: 601 }).some((l) => l.action === 'rehacer'));
check('rehacer borrador en revisión alimenta la señal de rechazo',
  db.prepare(`SELECT client_signal FROM post_signals WHERE post_id = 601`).get().client_signal === 'rejected');
const re3 = support.redoPost(db, 702, { actor: 'equipo', note: 'Cambiar el titular.' });
check('rehacer programado: vuelve a borrador sin fecha',
  re3.ok === true && re3.modo === 'borrador' &&
  db.prepare(`SELECT status, scheduled_at, approval FROM posts WHERE id = 702`).get().status === 'draft');
check('rehacer programado queda en el log',
  support.teamLog(db, { postId: 702 }).some((l) => l.action === 'rehacer'));
check('rehacer publicado se niega', support.redoPost(db, 551, {}).error === 'no_rehacer');

const chatBefore = db.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = 12`).get().c;
const rp = support.replyAsPosty(db, 12, 'Listo, lo reprogramé para hoy a las 18:00.', { actor: 'equipo' });
check('responder como Posty escribe en el chat del cliente',
  rp.ok === true && db.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = 12`).get().c === chatBefore + 1);
check('la respuesta queda como mensaje de Posty (assistant)',
  db.prepare(`SELECT role, text FROM chat_messages WHERE id = ?`).get(rp.id).role === 'assistant');
check('responder queda en el log del equipo',
  support.teamLog(db, { userId: 12 }).some((l) => l.action === 'responder_chat'));
check('responder con texto vacío se niega', support.replyAsPosty(db, 12, '   ').error === 'texto_vacio');
check('responder a usuario inexistente se niega', support.replyAsPosty(db, 99999, 'hola').error === 'sin_usuario');
check('todas las acciones del equipo quedaron en el log',
  support.teamLog(db, {}).length >= logBefore + 4);
check('el módulo no tiene ningún camino de publicación',
  !/publishPost\(|publishVideo\(|publishStory\(|publishCarousel\(|sendPush\(/.test(fs.readFileSync(__filename.replace('test-lote-consolasoporte.js', 'support-cases.js'), 'utf8')));

// ---------- 6 · refreshCaseStates: anota la resolución, no cierra solo ----------
db.prepare(`UPDATE posts SET status='published', published_at=?, ig_permalink='https://instagram.com/p/801' WHERE id=801`).run(hoursAgo(1));
const ref = support.refreshCaseStates(db, { now: NOW });
const casoVencido = byType.post_no_publicado.find((c) => c.dedup_key === 'overdue:801');
check('el caso del posteo que salió anota la resolución',
  ref.noted.includes(casoVencido.id) &&
  support.getCase(db, casoVencido.id).eventos.some((e) => e.texto.includes('salió')));
check('el caso NO se cierra solo aunque el posteo ya salió',
  support.getCase(db, casoVencido.id).estado === 'abierto');

// ---------- 7 · Recorrido de principio a fin (user 12) ----------
const j12 = support.buildJourney(db, 12, { absImageUrl, now: NOW });
check('journey de user 12: ok y con luz roja (push 9:00 sin entregar)',
  j12.ok === true && j12.luz === 'rojo');
check('journey tiene las 6 etapas en orden (prueba → espejo → semana → ritual → publicación → medición)',
  j12.stages.map((s) => s.key).join(',') === 'prueba,espejo,semana,ritual,publicacion,medicion');
check('prueba: completa (funnel entero) con sus eventos reales',
  j12.stages[0].estado === 'ok' && j12.stages[0].eventos.length === 6 && j12.stages[0].falta.length === 1);
check('espejo: la carta primera es el 518 (el próximo real)',
  j12.stages[1].proximo && j12.stages[1].proximo.id === 518 && j12.stages[1].estado === 'ok');
check('espejo: la semana trae el 519 y los publicados el 551 (no el cancelado 554)',
  j12.stages[1].semana.some((p) => p.id === 519) && j12.stages[1].publicados.some((p) => p.id === 551) &&
  !j12.stages[1].publicados.some((p) => p.id === 554) && !j12.stages[1].semana.some((p) => p.id === 554));
check('espejo: trae la lectura de Instagram (recents reales)',
  j12.stages[1].en_instagram.length === 2 && j12.stages[1].en_instagram[0].img === '/media/ig1.jpg');
check('semana: trae el porqué real del 518',
  j12.stages[2].posts.some((p) => p.id === 518 && p.strategy_why.includes('Detrás de escena')));
check('ritual: recomendado 518, todavía sin elegir',
  j12.stages[3].estado === 'atencion' && j12.stages[3].recomendado === 518 && j12.stages[3].elegido === null);
check('publicación: último publicado el 551 con permalink real',
  j12.stages[4].estado === 'ok' && j12.stages[4].publicados[0].id === 551 &&
  j12.stages[4].publicados[0].ig_permalink === 'https://instagram.com/p/551');
check('medición: publicados en 30 días y aprobación con números reales',
  j12.stages[5].estado === 'ok' && j12.stages[5].publicados_30d >= 1 && j12.stages[5].aprobados_30d >= 1);
check('chat del journey trae el historial con la respuesta del equipo',
  j12.chat.length === 3 && j12.chat.some((m) => m.role === 'assistant' && m.text.includes('reprogramé')));
check('journey de usuario inexistente se niega', support.buildJourney(db, 99999, {}).error === 'sin_usuario');

// ---------- 8 · Sin dato no se inventa estado (user 17) ----------
const j17 = support.buildJourney(db, 17, { absImageUrl, now: NOW });
check('journey sin datos: las 6 etapas reportan sin_datos',
  j17.ok === true && j17.stages.every((s) => s.estado === 'sin_datos'),
  j17.stages.map((s) => s.key + ':' + s.estado).join(', '));
check('journey sin datos: luz verde (nada falló, solo no hay datos)',
  j17.luz === 'verde');
check('luz ámbar por intervención abierta sin caso',
  support.luzFor(db, 13, []) === 'ambar');

// ---------- 9 · Panel: todo bajo control, lo urgente al frente ----------
const ov = support.buildOverview(db, { now: NOW });
check('panel: contadores con números reales',
  ov.contadores.clientes_en_vista === 6 && ov.contadores.casos_abiertos >= 7 &&
  ov.contadores.necesitan_ayuda >= 3 && ov.contadores.publicados_hoy >= 1);
const ranks = ov.clientes.map((c) => ({ rojo: 0, ambar: 1, verde: 2 })[c.luz]);
check('panel: lo urgente queda al frente (rojo → ámbar → verde)',
  ranks.join('') === [...ranks].sort((a, b) => a - b).join('') && ranks[0] === 0 && ranks[ranks.length - 1] === 2,
  ov.clientes.map((c) => c.user_id + ':' + c.luz).join(', '));
check('panel: el cliente rojo trae su caso urgente con número y siguiente paso',
  ov.clientes.find((c) => c.user_id === 12).caso_urgente &&
  ov.clientes.find((c) => c.user_id === 12).caso_urgente.numero > 0 &&
  ov.clientes.find((c) => c.user_id === 12).siguiente_paso.length > 0);
check('panel: la lista de casos trae número, dueño y siguiente paso',
  ov.casos.length > 0 && ov.casos.every((c) => Number.isInteger(c.numero) && c.dueno && c.siguiente_paso));
check('panel: el cliente verde no tiene casos abiertos',
  ov.clientes.find((c) => c.user_id === 17).luz === 'verde' &&
  ov.clientes.find((c) => c.user_id === 17).casos_abiertos === 0);

console.log(`\ntest-lote-consolasoporte: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
