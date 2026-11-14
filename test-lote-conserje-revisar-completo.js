// test-lote-conserje-revisar-completo.js — LOTE CONSERJE-REVISAR-COMPLETO
// (Lote C del diagnóstico del conserje; pieza de la puerta de
// lanzamiento: «sin eso perfecto para revisar no podemos lanzar»).
// Cubre los tres huecos probados en el diagnóstico:
//  A · CUANDO EN LA ZONA DEL CLIENTE — la etiqueta `cuando` de la
//      tarjeta mezclaba día/fecha en UTC del proceso con la hora en
//      la tz de la cuenta y contradecía la fecha del tablero (caso
//      medido el 15/11: «lun 16/11 · 19:00» y «dom 15/11 · 19:00»
//      sobre el mismo tablero). Ahora la etiqueta entera (día, fecha
//      y hora) sale de la zona de LA CUENTA y coincide con la fecha
//      del tablero que agrupa el posteo.
//  B · CONTADOR DE PEDIDOS POR AUDIO — la sección de pedidos por voz
//      era perezosa y sin señal (3 pendientes invisibles en
//      producción). conteosPedidos (support-cases) cuenta desde la
//      MISMA fuente que lista cada sección; el payload de la revisión
//      lo trae (pedidos_pendientes) y el chunk pinta la señal en el
//      encabezado de cada sección desde la carga, refrescándola desde
//      la propia lista al cargarla o decidir.
//  C · EVENTOS VISIBLES EN EL CONSERJE — el registro support_team_log
//      existía sin superficie en #/app/conserje (la única mejora
//      pedida nunca construida). teamLog suma etiqueta legible,
//      negocio del cliente y cuándo en la tz de la cuenta (campos
//      aditivos; los crudos no cambian), y el chunk suma la sección
//      «🗂 Eventos del equipo» de solo lectura.
// DB scratch en memoria; fechas fijas. Uso:
//   node test-lote-conserje-revisar-completo.js        → este árbol
//   PZ_TREE=<árbol> node test-lote-conserje-revisar-completo.js → control
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.env.PZ_TREE || __dirname;
const support = require(path.join(TREE, 'support-cases.js'));
const rev = require(path.join(TREE, 'conserje-revision.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const DDL = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT DEFAULT '', plan TEXT DEFAULT '', plan_status TEXT DEFAULT 'active', publishing_stopped INTEGER DEFAULT 0, concierge INTEGER NOT NULL DEFAULT 0, best_hour INTEGER DEFAULT 19, trial_ends_at INTEGER, created_at TEXT DEFAULT '2026-10-01 00:00:00');
  CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '', tone TEXT DEFAULT '', description TEXT DEFAULT '');
  CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '');
  CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'pending', media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, source_topic TEXT DEFAULT '', week_key TEXT DEFAULT '', strategy_why TEXT DEFAULT '', error TEXT DEFAULT '', tipo TEXT DEFAULT '', user_stopped INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-10-20 00:00:00', published_at TEXT);
  CREATE TABLE support_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, tipo TEXT DEFAULT '', estado TEXT DEFAULT 'abierto', siguiente_paso TEXT DEFAULT '', titulo TEXT DEFAULT '', dedup_key TEXT DEFAULT '');
  CREATE TABLE support_team_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT DEFAULT '', action TEXT DEFAULT '', user_id INTEGER, post_id INTEGER, case_id INTEGER, detalle TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE style_rules (user_id INTEGER, rule_key TEXT, rule_text TEXT DEFAULT '', hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1, PRIMARY KEY (user_id, rule_key));
  CREATE TABLE cm_semana (user_id INTEGER NOT NULL, week_key TEXT NOT NULL, tema TEXT DEFAULT '', siembra TEXT DEFAULT '', cierre TEXT DEFAULT '', origen TEXT DEFAULT '', formatos_json TEXT DEFAULT '[]', objetivo TEXT DEFAULT '', hora_recomendada INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, week_key));
  CREATE TABLE cm_gusto (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, senal TEXT NOT NULL DEFAULT '', tema TEXT DEFAULT '', angulo TEXT DEFAULT '', formato TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (user_id, post_id, senal));
  CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT NOT NULL DEFAULT '{}', hash TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '');
  CREATE TABLE health_interventions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierta', created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, days_to_resolve INTEGER);
  CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, user_id INTEGER, role TEXT DEFAULT 'user', text TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), post_id INTEGER DEFAULT 0, hilo TEXT DEFAULT '');
  CREATE TABLE subir_pedidos_voz (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, asset_id INTEGER, kind TEXT DEFAULT '', nota TEXT DEFAULT '', respuestas TEXT DEFAULT '{}', estado TEXT DEFAULT 'pendiente_revision', post_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`;

// ================= A · CUANDO EN LA ZONA DEL CLIENTE =================
console.log('· A — la etiqueta cuando, entera en la zona de la cuenta');
{
  const db = new DatabaseSync(':memory:');
  db.exec(DDL);
  const addUser = (id, email, bn, ig) => {
    db.prepare('INSERT INTO users (id, email, plan, plan_status) VALUES (?, ?, ?, ?)').run(id, email, 'pro', 'active');
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(id, bn, ig);
  };
  addUser(12, 'valentino@example.com', 'Posty.', 'posty.communitymanager');
  addUser(201, 'aurora@example.com', 'Café Aurora', 'cafe.aurora');
  addUser(202, 'pacifico@example.com', 'Tienda Pacífico', 'tienda.pacifico');
  addUser(203, 'kiwi@example.com', 'Kiwi Shop', 'kiwi.shop');
  const addTz = (id, tz) => db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?)').run(id, tz);
  addTz(12, 'America/New_York');
  addTz(201, 'America/New_York');
  addTz(202, 'America/Los_Angeles');
  addTz(203, 'Pacific/Auckland');
  // El mismo instante para los tres: 2026-11-16T00:00:00Z — el caso
  // del tablero del 15/11 del diagnóstico.
  const addPost = (uid) => db.prepare(
    `INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, media_type)
     VALUES (?, '/media/x.jpg', 'Caption de prueba', '2026-11-16T00:00:00.000Z', 'scheduled', 'image')`).run(uid);
  addPost(201); addPost(202); addPost(203);

  const board15 = rev.colaRevision(db, { fecha: '2026-11-15' });
  const it201 = board15.items.find((i) => i.user_id === 201);
  const it202 = board15.items.find((i) => i.user_id === 202);
  check('NY: el posteo cae en el tablero del 15 (su día en NY)', !!it201 && !!it201.post);
  check('NY: cuando = «dom 15/11 · 19:00» (día, fecha y hora en NY)',
    !!it201 && it201.post.cuando === 'dom 15/11 · 19:00', it201 && it201.post.cuando);
  check('LA: el posteo cae en el tablero del 15 (su día en LA)', !!it202 && !!it202.post);
  check('LA: cuando = «dom 15/11 · 16:00» (su hora, no la del proceso)',
    !!it202 && it202.post.cuando === 'dom 15/11 · 16:00', it202 && it202.post.cuando);
  const board16 = rev.colaRevision(db, { fecha: '2026-11-16' });
  const it203 = board16.items.find((i) => i.user_id === 203);
  check('Auckland: el posteo cae en el tablero del 16 (su día allá)', !!it203 && !!it203.post);
  check('Auckland: cuando = «lun 16/11 · 13:00»',
    !!it203 && it203.post.cuando === 'lun 16/11 · 13:00', it203 && it203.post.cuando);
  // La etiqueta nunca contradice la fecha del tablero que la agrupa:
  // para cada ítem con posteo, el «d/m» de la etiqueta es la fecha.
  const fechaDM = (f) => Number(f.slice(8, 10)) + '/' + Number(f.slice(5, 7));
  const okA = board15.items.filter((i) => i.post).every((i) => i.post.cuando.includes(fechaDM('2026-11-15')));
  const okB = board16.items.filter((i) => i.post).every((i) => i.post.cuando.includes(fechaDM('2026-11-16')));
  check('ninguna etiqueta contradice la fecha de su tablero', okA && okB);
}

// ================= B · CONTADOR DE PEDIDOS POR AUDIO =================
console.log('· B — el conteo sale de la misma fuente que lista cada sección');
{
  const db = new DatabaseSync(':memory:');
  db.exec(DDL);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (201, ?, ?)').run('Café Aurora', 'cafe.aurora');
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (202, ?, ?)').run('Tienda Pacífico', 'tienda.pacifico');
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (201, ?)').run('America/New_York');
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (202, ?)').run('America/Los_Angeles');
  const msg = (id, uid, role, hilo, postId, text) => db.prepare(
    'INSERT INTO chat_messages (id, user_id, role, hilo, post_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, uid, role, hilo, postId, text, '2026-11-14 10:00:00');
  msg(1, 201, 'user', 'post', 500, 'cambiá la foto de este posteo');
  msg(2, 201, 'assistant', 'post', 500, 'Entendido: cambio la foto por la otra.');
  msg(3, 202, 'user', 'semana', 0, 'esta semana hacé más reels');
  msg(4, 201, 'user', 'post', 501, 'acortá el caption');
  msg(5, 201, 'assistant', 'post', 501, 'Entendido: caption más corto.');
  msg(6, 202, 'user', '', 0, 'hola, una consulta general');
  const sub = (uid, estado) => db.prepare(
    'INSERT INTO subir_pedidos_voz (user_id, nota, estado) VALUES (?, ?, ?)').run(uid, 'nota de voz', estado);
  sub(201, 'pendiente_revision'); sub(202, 'pendiente_revision'); sub(201, 'armado'); sub(202, 'descartado');

  check('conteosPedidos existe en support-cases', typeof support.conteosPedidos === 'function');
  if (typeof support.conteosPedidos === 'function') {
    const lista = support.voiceRequests(db, {});
    check('la lista de voz trae su conteo de pendientes (3 de 3; el chat general no entra)',
      lista.pendientes === 3 && lista.total === 3, JSON.stringify({ p: lista.pendientes, t: lista.total }));
    const c0 = support.conteosPedidos(db);
    check('conteosPedidos: voz = 3 (ninguno decidido todavía)',
      c0.voz === 3, JSON.stringify(c0));
    check('conteosPedidos: subir = 2 (solo pendiente_revision)', c0.subir === 2, JSON.stringify(c0));
    check('el conteo y la lista dicen lo mismo (una sola fuente)', c0.voz === lista.pendientes);
    const dAp = support.decideVoiceRequest(db, { messageId: 4, decision: 'aprobado' });
    check('aprobar el de la lista sale bien', dAp.ok === true);
    const c1 = support.conteosPedidos(db);
    check('tras aprobar uno, voz baja a 2 en conteo y en lista',
      c1.voz === 2 && support.voiceRequests(db, {}).pendientes === 2, JSON.stringify(c1));
    const dDesc = support.decideVoiceRequest(db, { messageId: 1, decision: 'descartado' });
    check('descartar otro pendiente sale bien', dDesc.ok === true);
    check('tras descartar, voz queda en 1', support.conteosPedidos(db).voz === 1);
    const dDesc3 = support.decideVoiceRequest(db, { messageId: 3, decision: 'descartado' });
    check('sin pendientes de voz, el conteo es 0', dDesc3.ok === true && support.conteosPedidos(db).voz === 0);
    const dPend = support.decideVoiceRequest(db, { messageId: 1, decision: 'pendiente' });
    check('volver a pendiente lo devuelve al conteo', dPend.ok === true && support.conteosPedidos(db).voz === 1);
  }
  const dbVacia = new DatabaseSync(':memory:');
  dbVacia.exec(DDL);
  if (typeof support.conteosPedidos === 'function') {
    const cv = support.conteosPedidos(dbVacia);
    check('sin pedidos de ningún tipo: conteos en 0', cv.voz === 0 && cv.subir === 0, JSON.stringify(cv));
  }
}

// ================= C · EVENTOS DEL EQUIPO =================
console.log('· C — support_team_log visible, con cliente, etiqueta y cuándo');
{
  const db = new DatabaseSync(':memory:');
  db.exec(DDL);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (201, ?, ?)').run('Café Aurora', 'cafe.aurora');
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (202, ?, ?)').run('Tienda Pacífico', 'tienda.pacifico');
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (201, ?)').run('America/New_York');
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (202, ?)').run('America/Los_Angeles');
  support.logTeamAction(db, { actor: 'equipo', action: 'rehacer', userId: 201, postId: 500, detalle: 'Se rehizo el posteo a pedido del cliente' });
  support.logTeamAction(db, { actor: 'valentino', action: 'responder_chat', userId: 202, detalle: 'Respondió en el chat como Posty' });
  support.logTeamAction(db, { actor: 'sistema', action: 'envio_manana', detalle: 'Confirmación de la mañana' });
  const log = support.teamLog(db, {});
  check('teamLog devuelve los 3 eventos, el más nuevo primero',
    log.length === 3 && log[0].action === 'envio_manana', 'n=' + log.length);
  const evRe = log.find((e) => e.action === 'rehacer');
  check('el evento trae la etiqueta legible de la acción',
    !!evRe && evRe.etiqueta === 'Rehizo el posteo', evRe && evRe.etiqueta);
  check('el evento trae el negocio y el @ del cliente',
    !!evRe && evRe.business_name === 'Café Aurora' && evRe.ig_username === 'cafe.aurora');
  check('el evento trae el cuándo formateado (dd/mm, hh:mm — el formato de la casa)',
    !!evRe && /^\d{2}\/\d{2}, \d{2}:\d{2}$/.test(evRe.cuando || ''), evRe && evRe.cuando);
  check('los campos crudos no cambian (action, detalle, created_at)',
    !!evRe && evRe.detalle === 'Se rehizo el posteo a pedido del cliente' && /^\d{4}-\d{2}-\d{2} /.test(evRe.created_at || ''));
  const evSin = log.find((e) => e.action === 'envio_manana');
  check('un evento sin cliente no inventa negocio y trae cuándo igual',
    !!evSin && !evSin.business_name && /^\d{2}\/\d{2}, \d{2}:\d{2}$/.test(evSin.cuando || ''));
  const soloUno = support.teamLog(db, { userId: 202 });
  check('el filtro por cliente sigue andando', soloUno.length === 1 && soloUno[0].user_id === 202);
}

// ================= SUPERFICIE — rutas y chunk =================
console.log('· superficie — server.js y chunk-conserje.js');
{
  const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
  check('la revisión trae pedidos_pendientes desde conteosPedidos',
    serverSrc.includes('r.pedidos_pendientes = supportCases.conteosPedidos(db)'));
  check('pedidos-subir devuelve su conteo de pendientes',
    serverSrc.includes("WHERE estado = 'pendiente_revision'") && serverSrc.includes('pendientes: Number((pendRow || {}).c) || 0'));
  const chunkSrc = fs.readFileSync(path.join(TREE, 'public', 'chunk-conserje.js'), 'utf8');
  check('el chunk pinta la señal de pendientes en ambas secciones',
    chunkSrc.includes("conserjeBadgePendientesHTML('cjBadgeVoz'") && chunkSrc.includes("conserjeBadgePendientesHTML('cjBadgeSubir'"));
  check('el chunk guarda el conteo que viaja con la revisión',
    chunkSrc.includes('d.pedidos_pendientes') && chunkSrc.includes('conserjeEstado.conteos = d.pedidos_pendientes'));
  check('el chunk tiene la sección Eventos del equipo, de solo lectura',
    chunkSrc.includes('🗂 Eventos del equipo') && chunkSrc.includes('data-cj="eventos"') && chunkSrc.includes("adminApi('support/team-log?limit=50', 'GET')"));
}

// ================= RENDER VM — badges y eventos =================
console.log('· render del chunk en VM');
{
  const chunkSrc = fs.readFileSync(path.join(TREE, 'public', 'chunk-conserje.js'), 'utf8');
  const cardEl = { innerHTML: '' };
  const ctx = {
    console,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    $: (sel) => (sel === '#conserjeCard' ? cardEl : null),
    adminApi: async () => ({ ok: true, pedidos: [] }),
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({}) },
    location: { hash: '' },
    sessionStorage: { getItem: () => null, removeItem: () => {} },
    localStorage: { setItem: () => {} },
    window: {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(chunkSrc, ctx, { filename: 'chunk-conserje.js' });
  check('las funciones nuevas existen en el chunk',
    typeof ctx.conserjeEventosHTML === 'function' && typeof ctx.conserjeEventosCargar === 'function' && typeof ctx.conserjeBadgePendientesHTML === 'function');
  if (typeof ctx.conserjeRender === 'function' && typeof ctx.conserjeEventosHTML === 'function') {
    ctx.conserjeEstado.datos = { ok: true, fecha: '2026-11-15', ventana: { estado: 'abierta', ahora: '20:00' }, resumen: { total: 0, necesitan_atencion: 0 }, items: [], sin_posteo: [] };
    ctx.conserjeEstado.conteos = { voz: 3, subir: 1 };
    ctx.conserjeRender();
    const html = cardEl.innerHTML;
    check('con pendientes, la señal se ve desde la carga (3 y 1, sin abrir secciones)',
      html.includes('id="cjBadgeVoz"') && html.includes('3 pendientes') && html.includes('id="cjBadgeSubir"') && html.includes('1 pendiente'));
    check('la sección de eventos está en la pantalla del conserje',
      html.includes('🗂 Eventos del equipo') && html.includes('id="cjEventos"'));
    ctx.conserjeEstado.conteos = { voz: 0, subir: 0 };
    ctx.conserjeRender();
    const html0 = cardEl.innerHTML;
    check('sin pendientes, las señales quedan ocultas (nada de ruido en cero)',
      html0.includes('id="cjBadgeVoz"') && html0.includes('id="cjBadgeSubir"') && (html0.match(/display:none/g) || []).length >= 2);
    ctx.conserjeEstado.eventos = { ok: true, log: [
      { etiqueta: 'Rehizo el posteo', action: 'rehacer', business_name: 'Café Aurora', ig_username: 'cafe.aurora', post_id: 500, case_id: null, actor: 'equipo', cuando: '14/11 09:32', created_at: '2026-11-14 14:32:00', detalle: 'Se rehizo el posteo a pedido del cliente' },
      { etiqueta: 'Confirmó / envió la mañana', action: 'envio_manana', business_name: null, ig_username: null, post_id: null, case_id: null, actor: 'sistema', cuando: '14/11 08:00', created_at: '2026-11-14 13:00:00', detalle: '' },
    ] };
    const evHtml = ctx.conserjeEventosHTML();
    check('la vista de eventos muestra qué pasó, sobre qué cliente/posteo y cuándo',
      evHtml.includes('Rehizo el posteo') && evHtml.includes('Café Aurora') && evHtml.includes('@cafe.aurora')
      && evHtml.includes('posteo #500') && evHtml.includes('14/11 09:32') && evHtml.includes('Se rehizo el posteo a pedido del cliente'));
    check('un evento sin cliente se lee «General», sin inventar',
      evHtml.includes('General') && evHtml.includes('Confirmó / envió la mañana'));
    ctx.conserjeEstado.eventos = { ok: true, log: [] };
    check('sin eventos: estado vacío honesto', ctx.conserjeEventosHTML().includes('Todavía no hay eventos registrados.'));
  }
}

console.log(`\n== ${pass} ok · ${fail} mal ==`);
process.exit(fail ? 1 : 0);
