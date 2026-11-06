// test-conserje-panel-v2.js — PANEL DEL DUEÑO v2 (conserje-panel-v2, base v698).
// Cubre: el endpoint devuelve por cliente foto + posteo de hoy + feed +
// mañana (confirmada o no) + próximos; las alertas son solo hechos reales
// (posteo fallido / sin posteo mañana / mensaje >2h) y con nada que
// alertar la lista es vacía; el registro sigue siendo real; el render de
// showConcierge (ejecutado de verdad en VM) muestra el trabajo y no
// contadores; el estado vacío está diseñado; el auto-refresh se arma sin
// romper el render. DB scratch en memoria; fechas relativas al ahora real.
// Uso: node test-conserje-panel-v2.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const vm = require('node:vm');
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
const NOON_NY_UTC = TODAY_NY + ' 17:00:00';
const ABS = (uid, p) => 'https://postycommunitymanager.com' + String(p || '');

const DDL = `
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
  CREATE TABLE qa_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), passed INTEGER, result TEXT, image_path TEXT);
  CREATE TABLE health_interventions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierta', created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, days_to_resolve INTEGER);
  CREATE TABLE ig_home_snapshot (user_id INTEGER PRIMARY KEY, username TEXT DEFAULT '', payload TEXT DEFAULT '', fetched_at INTEGER DEFAULT 0);
  CREATE TABLE post_signals (user_id INTEGER, post_id INTEGER, caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_for TEXT DEFAULT '', rubro TEXT DEFAULT '', client_signal TEXT DEFAULT '', week_key TEXT DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (user_id, post_id));
  CREATE TABLE style_rules (user_id INTEGER, rule_key TEXT, rule_text TEXT DEFAULT '', hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1, PRIMARY KEY (user_id, rule_key));
  CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '');
`;

const db = new DatabaseSync(':memory:');
db.exec(DDL);

// Usuarios: 12 Posty (conserje, con mensaje de hace 3 h sin responder) ·
// 13 Café Aroma (conserje, con 2 mensajes recientes + un posteo fallido y
// sin posteos) · 14 Top Team (sin conserje) · 15 Perfumería (sin datos).
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
// Posteos de user 12: 517 publicado (feed) · 518 hoy (recomendado) · 519 mañana.
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, published_at, created_at)
  VALUES (517, 12, '/media/517.jpg', 'El posteo que salió bien.', ?, 'published', 'approved', 'Producto que vende.', ?, ?)`)
  .run(TODAY_NY + ' 14:00:00', TODAY_NY + ' 14:00:00', hoursAgo(26));
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, created_at)
  VALUES (518, 12, '/media/518.jpg', 'El posteo de hoy.', ?, 'scheduled', 'approved', 'Producto que vende.', ?)`)
  .run(NOON_NY_UTC, hoursAgo(2));
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, created_at)
  VALUES (519, 12, '/media/519.jpg', 'El posteo de mañana.', ?, 'scheduled', 'approved', 'Producto que vende.', ?)`)
  .run(TODAY_NY + ' 17:00:00', hoursAgo(2));
db.prepare(`UPDATE posts SET scheduled_at = datetime(?, '+1 day') WHERE id = 519`).run(TODAY_NY + ' 17:00:00');
db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold)
  VALUES (12, ?, 518, '[519]', NULL, 0)`).run(TODAY_NY);

support.setConcierge(db, 12, true, 'equipo');
support.setConcierge(db, 13, true, 'equipo');
// User 12: un mensaje de hace 3 h, sin respuesta real → pendiente + alerta.
db.prepare(`INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (12, 'user', '¿me cambiás el posteo de hoy? Sale a las 17:00, ¿no?', ?)`)
  .run(hoursAgo(3));
// User 13: desvío + respuesta real + 2 mensajes nuevos (pendiente, recientes).
support.divertToConcierge(db, 13, 'hola, ¿me cambiás la foto del posteo de hoy?');
db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (13, 'user', 'hola, ¿me cambiás la foto del posteo de hoy?')`).run();
support.replyAsPosty(db, 13, 'dale, ya te lo cambio 😄 sale a las 17:00 con la foto nueva.', { actor: 'equipo' });
db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (13, 'user', 'y también quiero que salga más temprano')`).run();
db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (13, 'user', '¿lo viste?')`).run();
// User 13: un posteo fallido hace 1 h (evento real).
db.prepare(`INSERT INTO events (user_id, name, props, created_at) VALUES (13, 'post_failed', ?, ?)`)
  .run(JSON.stringify({ post_id: 601, kind: 'stuck_publishing', cause: 'Se trabó publicando (+60 min en publishing)' }), hoursAgo(1));
// Acciones del operador: foto mejorada (12) + confirmar la mañana (12) +
// posteo creado (13). La mañana de 12 queda confirmada hoy.
support.logOperatorAction(db, 12, 'foto_mejorada', { postId: 518, detalle: 'Luz y encuadre mejorados en la foto del posteo #518.' });
support.confirmMorning(db, 12, { actor: 'equipo' });
support.logOperatorAction(db, 13, 'posteo_creado', { postId: 602, detalle: 'Posteo #602 creado para el cliente.' });

console.log('— endpoint: foto + posteo de hoy por cliente —');
const panel = support.buildOwnerPanel(db, { absImageUrl: ABS });
check('panel ok', panel.ok === true);
check('panel: clientes en conserje son 12 y 13', panel.clientes.length === 2
  && panel.clientes.some((c) => c.user_id === 12) && panel.clientes.some((c) => c.user_id === 13));
const c12 = panel.clientes.find((c) => c.user_id === 12) || {};
const c13 = panel.clientes.find((c) => c.user_id === 13) || {};
check('user 12: foto es la URL absoluta de su posteo publicado más reciente',
  c12.foto === 'https://postycommunitymanager.com/media/517.jpg', String(c12.foto));
check('user 12: posteo de hoy es el 518 (recomendado del ritual)',
  c12.posteo_hoy && c12.posteo_hoy.id === 518 && c12.posteo_hoy.caption === 'El posteo de hoy.'
  && c12.posteo_hoy.image_url === 'https://postycommunitymanager.com/media/518.jpg'
  && c12.posteo_hoy.strategy_why === 'Producto que vende.'
  && /^hoy \d{2}:\d{2}$/.test(c12.posteo_hoy.cuando || ''), JSON.stringify(c12.posteo_hoy));
check('user 12: posts_hoy_total 1 y proximos_semana 2 (518 hoy + 519 mañana)',
  c12.posts_hoy_total === 1 && c12.proximos_semana === 2
  && (c12.proximos || []).map((p) => p.id).join(',') === '518,519');
check('user 12: proximos llevan cuando (hoy / mañana)',
  /^hoy /.test((c12.proximos || [])[0].cuando || '') && /^mañana /.test((c12.proximos || [])[1].cuando || ''),
  JSON.stringify((c12.proximos || []).map((p) => p.cuando)));
check('user 12: pendiente con 1 mensaje (el de hace 3 h)',
  c12.pendiente === true && c12.mensajes_pendientes === 1
  && /cambiás el posteo de hoy/.test(c12.ultimo_mensaje || ''));
check('user 12: última actividad es la mañana confirmada, con etiqueta legible',
  c12.ultima_actividad && c12.ultima_actividad.action === 'envio_manana'
  && c12.ultima_actividad.etiqueta === 'Confirmó / envió la mañana', JSON.stringify(c12.ultima_actividad));
check('user 13: sin posteos → foto null y posteo_hoy null',
  c13.foto === null && c13.posteo_hoy === null && (c13.feed || {}).proximo === null
  && Array.isArray(c13.feed.publicados) && c13.feed.publicados.length === 0);
check('user 13: pendiente con 2 mensajes recientes', c13.pendiente === true && c13.mensajes_pendientes === 2);
check('user 13: mañana sin confirmar (no hay envio_manana)',
  c13.manana && c13.manana.confirmada === false && c13.manana.posts_hoy.length === 0);

console.log('— endpoint: feed + mañana por cliente —');
check('user 12: feed trae el publicado 517 y el próximo 518',
  (c12.feed.publicados || []).some((p) => p.id === 517 && p.image_url === 'https://postycommunitymanager.com/media/517.jpg')
  && c12.feed.proximo && c12.feed.proximo.id === 518);
check('user 12: mañana confirmada hoy (envio_manana)',
  c12.manana && c12.manana.confirmada === true && !!c12.manana.confirmado_en
  && c12.manana.recomendado && c12.manana.recomendado.id === 518
  && (c12.manana.posts_hoy || []).some((p) => p.id === 518));
check('user 13: mañana sin recomendado ni posteos hoy',
  c13.manana && !c13.manana.recomendado && !c13.manana.elegido && c13.manana.posts_hoy.length === 0);

console.log('— endpoint: próximos posteos + alertas —');
check('proximos_posteos: 518 y 519 ordenados por fecha, con el negocio',
  (panel.proximos_posteos || []).map((p) => p.id).join(',') === '518,519'
  && panel.proximos_posteos.every((p) => p.business_name === 'Posty' && p.image_url));
const tipos = (panel.alertas || []).map((a) => a.tipo).sort().join(',');
check('alertas: exactamente 3 (falla 13 + sin posteo mañana 13 + mensaje >2h 12)',
  (panel.alertas || []).length === 3 && tipos === 'mensaje_sin_respuesta,post_fallido,sin_posteo_manana',
  JSON.stringify(panel.alertas));
check('alerta post_fallido: user 13, posteo #601, con la causa',
  (panel.alertas || []).some((a) => a.tipo === 'post_fallido' && a.user_id === 13 && a.post_id === 601 && /Se trabó publicando/.test(a.detalle || '')));
check('alerta sin_posteo_manana: solo user 13 (12 sí tiene el 519)',
  (panel.alertas || []).some((a) => a.tipo === 'sin_posteo_manana' && a.user_id === 13)
  && !(panel.alertas || []).some((a) => a.tipo === 'sin_posteo_manana' && a.user_id === 12));
check('alerta mensaje_sin_respuesta: user 12, 3 h, con el texto',
  (panel.alertas || []).some((a) => a.tipo === 'mensaje_sin_respuesta' && a.user_id === 12 && /3 h/.test(a.detalle || '') && /cambiás el posteo/.test(a.detalle || '')));
check('registro sigue siendo real (nombre + hora + etiquetas)',
  panel.registro.length > 0 && panel.registro.every((e) => e.created_at && (e.business_name || e.email))
  && panel.registro.some((e) => e.action === 'envio_manana')
  && panel.registro.some((e) => e.action === 'foto_mejorada' && e.post_id === 518));

console.log('— endpoint: sin absImageUrl la foto sale como ruta relativa —');
const panelRaw = support.buildOwnerPanel(db, {});
const r12 = (panelRaw.clientes || []).find((c) => c.user_id === 12) || {};
check('sin absImageUrl: foto y posteo_hoy usan la ruta tal cual',
  r12.foto === '/media/517.jpg' && r12.posteo_hoy && r12.posteo_hoy.image_url === '/media/518.jpg');

console.log('— endpoint: estado vacío (nadie en conserje) —');
const db0 = new DatabaseSync(':memory:');
db0.exec(DDL);
const panel0 = support.buildOwnerPanel(db0, { absImageUrl: ABS });
check('vacío: sin clientes, sin registro, sin alertas, sin próximos',
  panel0.ok === true && panel0.clientes.length === 0 && panel0.registro.length === 0
  && Array.isArray(panel0.alertas) && panel0.alertas.length === 0
  && Array.isArray(panel0.proximos_posteos) && panel0.proximos_posteos.length === 0);

console.log('— estáticos: la vista nueva —');
const chunkSrc = fs.readFileSync(__dirname + '/public/chunk-admin.js', 'utf8');
const v2Start = chunkSrc.indexOf('// ---------- CONSERJE — PANEL DEL DUEÑO v2');
const v2End = chunkSrc.indexOf("  $$('#adminCard [data-atab]')", v2Start);
const v2 = v2Start >= 0 && v2End > v2Start ? chunkSrc.slice(v2Start, v2End) : '';
check('el bloque v2 existe en chunk-admin.js', v2.length > 1000, String(v2.length));
for (const s of ['Posteo de hoy', 'Qué necesita', 'Qué se hizo', 'Qué falta', 'La mañana de todos',
  'Próximos posteos', 'Actividad en vivo', 'Mensajes sin responder', 'Feed',
  '/ai-avatar.png', '#2793C8', '#FEC14D', '#0A1E33', 'data-cj-panel', 'setInterval', '45000',
  'visibilitychange', 'scrollTo']) {
  check(`la vista v2 contiene «${s}»`, v2.includes(s));
}
for (const s of ["cnt('Clientes en conserje'", 'Acciones del equipo (30d)', 'Bandeja (tu decisión)',
  'repeat(auto-fit,minmax(130px,1fr))']) {
  check(`la vista v2 YA NO tiene los contadores «${s}»`, !v2.includes(s));
}
const srvSrc = fs.readFileSync(__dirname + '/server.js', 'utf8');
const panelRoute = srvSrc.slice(srvSrc.indexOf("app.get('/api/admin/support/conserje/panel'"));
check('la ruta del panel pasa absImageUrl y sigue bajo requireAdminToken',
  panelRoute.includes('absImageUrl') && panelRoute.includes('requireAdminToken'));
check('la consola NO tiene camino de publicación',
  !/publishPost\(|publishVideo\(|publishStory\(|publishCarousel\(|sendPush\(/.test(fs.readFileSync(__dirname + '/support-cases.js', 'utf8')));

console.log('— render real de showConcierge en VM —');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function makeCtx(payload) {
  const intervals = [];
  const listeners = [];
  const body = { _html: '',
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
    querySelector: () => null, querySelectorAll: () => [] };
  const ctx = {
    body,
    adminApi: async () => payload,
    esc, pzIc: (n) => '[icon:' + n + ']',
    showSupportClient: () => {}, showSupportCase: () => {},
    tipoLabel: (t) => t,
    confirm: () => true, alert: () => {},
    document: { addEventListener: (ev) => listeners.push(ev), hidden: false, querySelector: () => null },
    window: { scrollY: 0, scrollTo: () => {}, __cjVisBound: false },
    setInterval: (fn, ms) => { intervals.push(ms); return 7; },
    clearInterval: () => {},
    intervals, listeners,
  };
  ctx.window.__cjVisBound = false;
  return ctx;
}
const fnSrc = v2 + '\nreturn showConcierge;';
const makeFn = (ctx) => new Function('body', 'adminApi', 'esc', 'pzIc', 'showSupportClient', 'showSupportCase',
  'tipoLabel', 'confirm', 'alert', 'document', 'window', 'setInterval', 'clearInterval', fnSrc)
  .call(null, ctx.body, ctx.adminApi, ctx.esc, ctx.pzIc, ctx.showSupportClient, ctx.showSupportCase,
    ctx.tipoLabel, ctx.confirm, ctx.alert, ctx.document, ctx.window, ctx.setInterval, ctx.clearInterval);
(async () => {
  const ctx = makeCtx(panel);
  const fn = makeFn(ctx);
  await fn();
  const html = ctx.body.innerHTML;
  for (const s of ['Posty', 'https://postycommunitymanager.com/media/517.jpg', 'El posteo de hoy.',
    'Qué necesita', 'Qué se hizo', 'Qué falta', 'Posteo de hoy', 'La mañana de todos',
    'Próximos posteos', 'Actividad en vivo', 'Feed', 'Responder', 'Ver cliente',
    '⚠ Hay cosas que necesitan atención', 'lleva 3 h con un mensaje sin responder',
    'Confirmada', 'El posteo #601', 'no tiene posteo programado para mañana']) {
    check(`el render poblado muestra «${s}»`, html.includes(s));
  }
  for (const s of ['Acciones del equipo (30d)', 'Bandeja (tu decisión)']) {
    check(`el render poblado NO muestra el contador «${s}»`, !html.includes(s));
  }
  check('auto-refresh: setInterval a 45 s', ctx.intervals.includes(45000), JSON.stringify(ctx.intervals));
  check('auto-refresh: escucha visibilitychange', ctx.listeners.includes('visibilitychange'));
  check('el render lleva el marcador data-cj-panel', html.includes('data-cj-panel'));

  const ctx0 = makeCtx(panel0);
  const fn0 = makeFn(ctx0);
  await fn0();
  const html0 = ctx0.body.innerHTML;
  check('render vacío: estado diseñado con la cara de Posty',
    html0.includes('Todavía no hay clientes en modo conserje') && html0.includes('/ai-avatar.png')
    && html0.includes('Ver clientes en Soporte'));
  check('render vacío: sin alertas ni secciones de clientes',
    !html0.includes('⚠ Hay cosas que necesitan atención') && !html0.includes('Mensajes sin responder — lo primero')
    && !html0.includes('La mañana de todos'));
  console.log(`\n${pass} ok, ${fail} mal`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('error del test:', e && e.stack || e); process.exit(1); });
