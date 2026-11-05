// test-lote-conserje.js — MODO CONSERJE + PANEL DEL DUEÑO (lote conserje,
// base v697). Cubre: el flag por cliente (default apagado, prender/apagar
// con registro); el desvío del mensaje a la Bandeja (un caso vivo por
// cliente, sin duplicar, nunca lanza); el aviso de pendientes (el acuse
// automático NO marca como atendido — solo la respuesta real del
// operador); responder como Posty (queda en el chat y en el registro);
// la mañana del conserje (posteos de hoy + envío como Posty, sin
// publicar nada); el panel del dueño (clientes, registro real con nombre
// y hora, Bandeja solo con lo del dueño); el journey lleva el flag.
// DB scratch en memoria; fechas relativas al ahora real.
// Uso: node test-lote-conserje.js — sale 0 si todo pasa.
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
function hoursAhead(h) { return utc(new Date(NOW.getTime() + h * 3600 * 1000)); }
const TODAY_NY = dayKeyInTz(NOW, 'America/New_York');
// Mediodía de Nueva York de hoy (17:00 UTC): cae seguro dentro del día
// de la cuenta, corra el test a la hora que corra.
const NOON_NY_UTC = TODAY_NY + ' 17:00:00';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT DEFAULT '', plan TEXT DEFAULT '', plan_status TEXT DEFAULT 'active', publishing_stopped INTEGER DEFAULT 0, concierge INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT '2026-10-01 00:00:00');
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

// Usuarios: 12 Valentino (conserje) · 13 Café Aroma (conserje, con
// pendientes) · 14 Top Team (sin conserje) · 15 Perfumería (sin datos).
const users = [
  [12, 'valentino_bamboo@hotmail.com', 'posty', 'active'],
  [13, 'cafe@aroma.test', 'posty', 'trial'],
  [14, 'top@team.test', 'posty', 'active'],
  [15, 'perfume@test.dev', 'posty', 'active'],
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
];
for (const [uid, b, ig, cat] of profs) {
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?,?,?,?)').run(uid, b, ig, cat);
}
// Posteo de hoy de user 12 (recomendado del ritual) + uno de mañana.
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, created_at)
  VALUES (518, 12, '/media/518.jpg', 'El posteo de hoy.', ?, 'scheduled', 'approved', 'Producto que vende.', ?)`)
  .run(NOON_NY_UTC, hoursAgo(2));
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, created_at)
  VALUES (519, 12, '/media/519.jpg', 'El posteo de mañana.', ?, 'scheduled', 'approved', 'Producto que vende.', ?)`)
  .run(TODAY_NY + ' 17:00:00', hoursAgo(2));
// OJO: el 519 usa el día siguiente en UTC (mañana a las 17:00 UTC es
// mañana mediodía NY): lo muevo un día adelante para que no caiga hoy.
db.prepare(`UPDATE posts SET scheduled_at = datetime(?, '+1 day') WHERE id = 519`).run(TODAY_NY + ' 17:00:00');
db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold)
  VALUES (12, ?, 518, '[519]', NULL, 0)`).run(TODAY_NY);

console.log('— flag de conserje —');
check('apagado por default para todos', !support.isConcierge(db, 12) && !support.isConcierge(db, 13) && !support.isConcierge(db, 14));
check('isConcierge no lanza con usuario inexistente', support.isConcierge(db, 999) === false);
const on12 = support.setConcierge(db, 12, true, 'equipo');
check('prender conserje user 12', on12.ok && on12.concierge === true);
check('isConcierge true tras prender', support.isConcierge(db, 12) === true);
check('prender no toca a los demás', support.isConcierge(db, 13) === false);
const on13 = support.setConcierge(db, 13, true, 'equipo');
check('prender conserje user 13', on13.ok && on13.concierge === true);
check('setConcierge sin usuario se niega', support.setConcierge(db, 999, true, 'equipo').ok === false);
const logOn = support.teamLog(db, { userId: 12, limit: 5 });
check('prender queda en el registro (conserje_on)', logOn.some((l) => l.action === 'conserje_on'));
const off13 = support.setConcierge(db, 13, false, 'equipo');
check('apagar conserje user 13', off13.ok && off13.concierge === false);
check('isConcierge false tras apagar', support.isConcierge(db, 13) === false);
check('apagar queda en el registro (conserje_off)', support.teamLog(db, { userId: 13, limit: 5 }).some((l) => l.action === 'conserje_off'));
support.setConcierge(db, 13, true, 'equipo'); // vuelve a prender para lo que sigue

console.log('— desvío del mensaje a la Bandeja —');
const d1 = support.divertToConcierge(db, 13, 'hola, ¿me cambiás la foto del posteo de hoy?');
check('desvío abre el caso y devuelve acuse', d1.ok && d1.caso_id > 0 && typeof d1.ack === 'string' && d1.ack.length > 0);
check('el acuse es honesto (no promete el trabajo hecho)', !/listo|hecho|ya está/i.test(d1.ack));
const caso1 = support.getCase(db, d1.caso_id);
check('caso tipo conserje', caso1 && caso1.tipo === 'conserje');
check('caso abierto con siguiente paso responder', caso1 && caso1.estado === 'abierto' && /Responder en el chat/.test(caso1.siguiente_paso || ''));
check('el mensaje queda en el historial del caso', (caso1.eventos || []).some((e) => e.kind === 'mensaje' && /cambiás la foto/.test(e.texto || '')));
// El handler del chat guarda el mensaje del usuario y el acuse en chat_messages:
db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (13, 'user', 'hola, ¿me cambiás la foto del posteo de hoy?')`).run();
db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (13, 'assistant', ?)`)
  .run(d1.ack);
const d2 = support.divertToConcierge(db, 13, 'y también quiero que salga más temprano');
check('segundo mensaje reusa el MISMO caso (sin duplicar)', d2.ok && d2.caso_id === d1.caso_id);
const caso2 = support.getCase(db, d1.caso_id);
check('el detalle del caso es el último mensaje', caso2 && /más temprano/.test(caso2.detalle || ''));
check('dos mensajes en el historial', (caso2.eventos || []).filter((e) => e.kind === 'mensaje').length === 2);
db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (13, 'user', 'y también quiero que salga más temprano')`).run();
db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (13, 'assistant', ?)`)
  .run(d2.ack);
check('desvío con texto vacío se niega', support.divertToConcierge(db, 13, '   ').ok === false);
check('desvío sin usuario se niega', support.divertToConcierge(db, 999, 'hola').ok === false);
check('desvío nunca lanza (sin usuario, sin texto)', (() => { try { support.divertToConcierge(db, null, null); return true; } catch (e) { return false; } })());

console.log('— aviso de pendientes —');
const pend1 = support.pendingConcierge(db, {});
check('pendientes: user 13 con 2 mensajes sin responder', pend1.ok && pend1.total === 1
  && pend1.pendientes[0].user_id === 13 && pend1.pendientes[0].mensajes_pendientes === 2);
check('el acuse automático NO marca como atendido', pend1.pendientes[0].mensajes_pendientes === 2);
check('el último mensaje es el segundo', /más temprano/.test(pend1.pendientes[0].ultimo_mensaje || ''));
check('user 12 (sin mensajes) no está en pendientes', !pend1.pendientes.some((p) => p.user_id === 12));
check('user 14 (sin conserje) no está en pendientes', !pend1.pendientes.some((p) => p.user_id === 14));

console.log('— responder como Posty —');
const rp = support.replyAsPosty(db, 13, 'dale, ya te lo cambio 😄 sale a las 17:00 con la foto nueva.', { actor: 'equipo' });
check('responder como Posty ok', rp.ok && rp.id > 0);
const chat13 = db.prepare(`SELECT role, text FROM chat_messages WHERE user_id = 13 ORDER BY id ASC`).all();
check('la respuesta quedó en el chat del cliente como assistant',
  chat13.some((m) => m.role === 'assistant' && /ya te lo cambio/.test(m.text || '')));
const logResp = support.teamLog(db, { userId: 13, limit: 10 });
check('la respuesta quedó en el registro con el texto',
  logResp.some((l) => l.action === 'responder_chat' && /ya te lo cambio/.test(l.detalle || '')));
const pend2 = support.pendingConcierge(db, {});
check('tras responder, ya no hay pendientes', pend2.ok && pend2.total === 0);
// El cliente escribe de nuevo: vuelve a pendiente.
support.divertToConcierge(db, 13, 'gracias! quedó perfecto');
db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (13, 'user', 'gracias! quedó perfecto')`).run();
const pend3 = support.pendingConcierge(db, {});
check('mensaje nuevo tras la respuesta vuelve a pendiente (1)', pend3.ok && pend3.total === 1
  && pend3.pendientes[0].mensajes_pendientes === 1);

console.log('— la mañana del conserje —');
const man = support.morningFor(db, 12);
check('mañana: recomendado es el 518', man.ok && man.recomendado && man.recomendado.id === 518);
check('mañana: posteos de hoy incluyen el 518 y NO el 519', man.ok
  && man.posts_hoy.some((p) => p.id === 518) && !man.posts_hoy.some((p) => p.id === 519));
check('mañana: día = hoy en la zona de la cuenta', man.ok && man.dia === TODAY_NY);
const man15 = support.morningFor(db, 15);
check('mañana sin ritual ni posteos: ok con lista vacía', man15.ok && man15.posts_hoy.length === 0 && !man15.recomendado);
check('mañana sin usuario se niega', support.morningFor(db, 999).ok === false);
const conf = support.confirmMorning(db, 12, { actor: 'equipo', mensaje: 'buen día 😄 hoy sale el posteo a las 12:00, ¿te parece bien así?' });
check('confirmar mañana ok', conf.ok && conf.dia === TODAY_NY && conf.posts.some((p) => p.id === 518));
check('confirmar mañana queda en el registro (envio_manana)',
  support.teamLog(db, { userId: 12, limit: 5 }).some((l) => l.action === 'envio_manana' && /518/.test(l.detalle || '')));
check('el mensaje de la mañana se envió como Posty',
  conf.enviado && conf.enviado.id > 0
  && db.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = 12 AND role = 'assistant' AND text LIKE '%buen día%'`).get().c === 1);
const conf2 = support.confirmMorning(db, 12, { actor: 'equipo' });
check('confirmar sin mensaje: registra igual, sin enviar', conf2.ok && conf2.enviado === null
  && support.teamLog(db, { userId: 12, limit: 5 }).filter((l) => l.action === 'envio_manana').length === 2);
check('confirmar mañana sin usuario se niega', support.confirmMorning(db, 999, {}).ok === false);

console.log('— acciones genéricas del operador —');
const fa = support.logOperatorAction(db, 13, 'foto_mejorada', { postId: 601, detalle: 'Luz y encuadre mejorados en la foto del posteo #601.' });
check('foto mejorada queda registrada con el posteo', fa.ok && fa.id > 0
  && support.teamLog(db, { userId: 13, limit: 10 }).some((l) => l.action === 'foto_mejorada' && l.post_id === 601));
check('acción con clave inválida se niega', support.logOperatorAction(db, 13, 'foto mejorada!', {}).ok === false);
check('acción sin usuario se niega', support.logOperatorAction(db, 999, 'foto_mejorada', {}).ok === false);
const pc = support.logOperatorAction(db, 13, 'posteo_creado', { postId: 602, detalle: 'Posteo #602 creado para el cliente.' });
check('posteo creado queda registrado', pc.ok);

console.log('— panel del dueño —');
// Un caso para la Bandeja: dueño Valentino. Otro con dueño equipo: no va a la Bandeja.
const cb = support.openCase(db, { userId: 13, tipo: 'ayuda', titulo: 'Necesita decisión del dueño',
  detalle: '¿Aprobamos el cambio de horario?', dueno: 'valentino', siguientePaso: 'Decidir el horario.' });
check('caso para la Bandeja creado', cb.ok);
const ce = support.openCase(db, { userId: 14, tipo: 'ayuda', titulo: 'Ayuda normal',
  detalle: 'Duda de horarios.', dueno: 'equipo', siguientePaso: 'Responder.' });
check('caso normal creado', ce.ok);
const panel = support.buildOwnerPanel(db, {});
check('panel ok', panel.ok);
check('panel: clientes en conserje son 12 y 13', panel.clientes.length === 2
  && panel.clientes.some((c) => c.user_id === 12) && panel.clientes.some((c) => c.user_id === 13));
check('panel: user 13 con pendiente (1 mensaje sin responder)',
  (panel.clientes.find((c) => c.user_id === 13) || {}).pendiente === true);
check('panel: user 12 sin pendientes', (panel.clientes.find((c) => c.user_id === 12) || {}).pendiente === false);
check('panel: user 14 (sin conserje) no está', !panel.clientes.some((c) => c.user_id === 14));
check('panel: registro real con nombre del cliente y hora',
  panel.registro.length > 0 && panel.registro.every((e) => e.created_at && (e.business_name || e.email))
  && panel.registro.some((e) => e.action === 'responder_chat' && /ya te lo cambio/.test(e.detalle || '')));
check('panel: registro tiene la foto mejorada y el envío de la mañana',
  panel.registro.some((e) => e.action === 'foto_mejorada')
  && panel.registro.some((e) => e.action === 'envio_manana'));
check('panel: registro tiene etiqueta legible (no la clave cruda)',
  panel.registro.some((e) => e.action === 'responder_chat' && e.etiqueta === 'Respondió en el chat como Posty'));
check('panel: Bandeja trae SOLO el caso del dueño', panel.bandeja.length === 1
  && panel.bandeja[0].id === cb.caso.id);
check('panel: necesidades abiertas incluyen el caso conserje y los de ayuda',
  panel.necesidades.some((c) => c.tipo === 'conserje') && panel.necesidades.length >= 3);
check('panel: contadores reales', panel.contadores.clientes_conserje === 2
  && panel.contadores.bandeja === 1 && panel.contadores.acciones_30d > 0);

console.log('— journey con el flag —');
const j12 = support.buildJourney(db, 12, {});
check('journey de user 12 lleva concierge=true', j12.ok && j12.user.concierge === true);
const j14 = support.buildJourney(db, 14, {});
check('journey de user 14 lleva concierge=false', j14.ok && j14.user.concierge === false);
check('journey trae el chat del cliente', j12.ok && Array.isArray(j12.chat));

console.log('— cableado (estático) —');
const modSrc = fs.readFileSync(__dirname + '/support-cases.js', 'utf8');
check('la consola NO tiene camino de publicación',
  !/publishPost\(|publishVideo\(|publishStory\(|publishCarousel\(|sendPush\(/.test(modSrc));
const srvSrc = fs.readFileSync(__dirname + '/server.js', 'utf8');
const chatStart = srvSrc.indexOf("app.post('/api/ideas/chat'");
const chatIdeaAt = srvSrc.indexOf('chatIdea(', chatStart);
const chatBlock = chatStart >= 0 && chatIdeaAt > chatStart ? srvSrc.slice(chatStart, chatIdeaAt) : '';
check('el chat llama al desvío de conserje antes de la IA', chatBlock.includes('divertToConcierge'));
check('el chat lee el flag y salta tope/rate para conserje',
  chatBlock.includes('conciergeMode') && chatBlock.includes('isConcierge'));
check('el chat devuelve el acuse con concierge:true', chatBlock.includes('concierge: true'));

console.log(`\n${pass} ok, ${fail} mal`);
process.exit(fail ? 1 : 0);
