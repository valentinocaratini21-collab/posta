// test-lote-bandeja-responde.js — Suite del lote BANDEJA-RESPONDE
// (2026-11-22): «borrador + tanda + un toque».
//   A · Estática: archivos, endpoints, cableado del scheduler, y el
//       gate M78 (toda función llamada desde la vista existe definida).
//   B · Módulo bandeja.js con fetchers/suggest inyectados (sin IG real,
//       sin gasto de IA): la tanda se arma EN SILENCIO (un solo aviso
//       por tanda), las importantes arriba marcadas, spam oculto, el
//       dato que falta no se inventa, editar/descartar/deshacer, y los
//       TRES casos del freno anti-duplicado uno por uno + la compuerta
//       de permiso (nada se marca enviado si no salió).
//   C · Boot real: login, GET /api/bandeja, count, edit, dismiss y el
//       approve contra un token falso — el camino responde honesto y
//       NINGÚN ítem queda 'enviado'.
//   D · Chromium 390px: la pantalla de notificaciones y la de revisión
//       se leen sin desborde ni scroll horizontal; descartar/deshacer
//       mueven el conteo vivo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- A
console.log('\nA · Estática');
{
  const bj = read('bandeja.js');
  const srv = read('server.js');
  const dbj = read('db.js');
  const sch = read('scheduler.js');
  const app = read('public/app.js');
  ok('A1 bandeja.js exporta el motor completo', ['pollBandeja', 'getBandeja', 'refreshTanda', 'approveTanda', 'countAcciones', 'novedades', 'initBandejaTables'].every(k => bj.includes(k)));
  ok('A2 server.js: los 7 endpoints de la bandeja', ['/api/bandeja\'', '/api/bandeja/count', '/api/bandeja/refresh', '/api/bandeja/item/:id/edit', '/api/bandeja/item/:id/dismiss', '/api/bandeja/item/:id/undismiss', '/api/bandeja/tanda/:id/approve'].every(k => srv.includes(k)));
  ok('A3 server.js: el borrador nace del redactor con fundamento (suggestDetailedForUser)', srv.includes('suggestFn: (uid) => suggestDetailedForUser(uid)'));
  ok('A4 server.js: el aviso único apunta a la pantalla de notificaciones', srv.includes("url: '/#/app/notificaciones'"));
  ok('A5 db.js inicializa las tablas de la bandeja junto a community', dbj.includes("require('./bandeja').initBandejaTables(db)"));
  ok('A6 scheduler: el cron de atención alimenta la bandeja (pollBandeja)', sch.includes("require('./bandeja').pollBandeja(db, proBandejaDeps(db))"));
  ok('A7 app.js: la ruta notificaciones abre la vista de la bandeja', app.includes("tab === 'notificaciones'") && app.includes('pzBandejaView()'));
  const llamadas = ['pzBandejaView', 'pzBandejaAbrir', 'pzBandejaVolver', 'pzBandejaAprobar', 'pzBandejaEditar', 'pzBandejaGuardar', 'pzBandejaDescartar', 'pzBandejaDeshacer', 'pzBandejaRepintar'];
  const definidas = llamadas.filter(fn => new RegExp('(async )?function ' + fn + '\\(').test(app));
  ok(`A8 gate M78 — funciones auditadas: ${definidas.length}/${llamadas.length}`, definidas.length === llamadas.length, 'faltan: ' + llamadas.filter(f => !definidas.includes(f)).join(','));
  ok('A9 la vista NO promete respuesta automática (coherencia de promesa)', !/pzb[\s\S]{0,400}respondido en el momento/.test(app) && app.includes('Nada sale hasta que apruebes'));
  ok('A10 la pantalla usa su propio <style> pzb- (styles.css intacto en este lote)', app.includes('.pzb-banda') && app.includes('linear-gradient(180deg,#57B2E5'));
}

// ---------------------------------------------------------------- B
console.log('\nB · Módulo (fetchers y redactor inyectados)');
const TMPB = fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-mod-'));
process.env.DATA_DIR = TMPB;
const db = require('./db');
const B = require('./bandeja');

function seedUser(email) {
  const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x');
  const uid = Number(r.lastInsertRowid);
  db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
  db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc')").run(uid);
  db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
  db.prepare("INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)").run(uid, JSON.stringify({ horarios: 'Lun a Vie 9 a 20' }));
  return uid;
}

function makeWorld() {
  const now = new Date().toISOString();
  const state = {
    comments: [
      { id: 'c1', text: 'ayer me cobraron dos veces el mismo café, ¿me lo devuelven?', username: 'martin.g', timestamp: now, replies: [] },
      { id: 'c2', text: '¿hasta qué hora abren hoy?', username: 'sofi.m', timestamp: now, replies: [] },
      { id: 'c3', text: 'el mejor café de la ciudad 😍', username: 'juanp', timestamp: now, replies: [] },
      { id: 'c4', text: 'seguidores gratis en www.promo.example entrá ya', username: 'spam.bot', timestamp: now, replies: [] },
      { id: 'c5', text: '¿cuánto cuesta el flat white?', username: 'vale.r', timestamp: now, replies: [] },
      { id: 'c6', text: '¿tienen wifi?', username: 'ana.p', timestamp: now, replies: [{ id: 'c6r1', text: '¡Sí! Pedí la clave en la barra.', username: 'thecoffeebardc', timestamp: now }] },
    ],
    convs: [
      { id: 'cv1', participants: [{ id: 'IGBIZ', username: 'thecoffeebardc' }, { id: 'U900', username: 'sofi.m' }],
        messages: [{ id: 'm1', text: 'hola, ¿tienen algo sin tacc?', fromId: 'U900', fromUsername: 'sofi.m', created_time: now }] },
    ],
    sentReplies: [], sentDms: [], hidden: [], notifyCalls: [], failSendWith: null,
  };
  const fetchers = {
    fetchMedia: async () => [{ id: 'POST1', caption: 'Classic Espresso, el de todos los días', thumb: 'https://example.com/t.jpg', timestamp: now }],
    fetchComments: async () => JSON.parse(JSON.stringify(state.comments)),
    fetchConversations: async () => JSON.parse(JSON.stringify(state.convs)),
    sendCommentReply: async (creds, commentId, text) => { if (state.failSendWith) throw new Error(state.failSendWith); state.sentReplies.push({ commentId, text }); return { id: 'r' + commentId }; },
    sendDm: async (creds, to, text) => { if (state.failSendWith) throw new Error(state.failSendWith); state.sentDms.push({ to, text }); return { id: 'dm1' }; },
    hideComment: async (creds, commentId) => { state.hidden.push(commentId); return { ok: true }; },
  };
  const suggestFn = () => async (args) => {
    const t = String(args.commentText || '');
    if (/cuesta|precio/.test(t)) return { reply: '', needsHuman: true, reason: 'dato_no_esta_en_el_fundamento:precio' };
    if (/cobraron/.test(t)) return { reply: 'Hola Martín, perdón por eso. Pasá por el local con el comprobante y te lo resolvemos en el momento.', needsHuman: false, reason: '' };
    if (/mañana/.test(t)) return { reply: '¡Hola Sofi! Mañana también estamos de 9 a 20.', needsHuman: false, reason: '' };
    if (/hora/.test(t)) return { reply: '¡Hola Sofi! Hoy estamos hasta las 20. Te esperamos.', needsHuman: false, reason: '' };
    return { reply: '¡Gracias por escribirnos! 🙌', needsHuman: false, reason: '' };
  };
  const deps = {
    credsOf: () => ({ igUserId: 'IGBIZ', accessToken: 'tok-falso', igUsername: 'thecoffeebardc' }),
    suggestFn, apiKeyOf: () => '',
    notify: (uid, info) => state.notifyCalls.push({ uid, ...info }),
    fetchers,
  };
  return { state, deps };
}

(async () => {
  const uid = seedUser('dueno@coffee.example');
  const { state, deps } = makeWorld();

  const r1 = await B.pollBandeja(db, deps, { onlyUser: uid });
  ok('B1 el poll procesa la cuenta conectada', r1.users === 1, JSON.stringify(r1.errors));
  const data1 = B.getBandeja(db, uid);
  const tandaPost = data1.tandas.find(t => t.kind === 'post');
  const tandaDm = data1.tandas.find(t => t.kind === 'dm');
  ok('B2 se arman dos tandas: el posteo y la conversación', !!tandaPost && !!tandaDm);
  const items = tandaPost ? tandaPost.items : [];
  const byUser = (u) => items.find(i => i.author_username === u);
  ok('B3 la de plata nace IMPORTANTE y con borrador', !!byUser('martin.g') && byUser('martin.g').clase === 'importante' && /comprobante/.test(byUser('martin.g').draft));
  ok('B4 la importante va PRIMERA en la lista', items.length > 0 && items[0].author_username === 'martin.g');
  ok('B5 el horario se responde con el dato del fundamento', !!byUser('sofi.m') && /hasta las 20/.test(byUser('sofi.m').draft));
  ok('B6 el dato que NO está en el fundamento NO se inventa (falta_dato=precio, sin borrador)', !!byUser('vale.r') && byUser('vale.r').falta_dato === 'precio' && byUser('vale.r').draft === '');
  ok('B7 el spam se oculta y NO entra a la revisión', state.hidden.includes('c4') && !items.some(i => i.author_username === 'spam.bot'));
  ok('B8 FRENO (1) al ingresar: el hilo ya respondido por el negocio nace ya_respondido', !!byUser('ana.p') && byUser('ana.p').estado === 'ya_respondido');
  ok('B9 UN solo aviso por tanda (2 tandas → 2 avisos, ninguno por comentario)', state.notifyCalls.length === 2, 'avisos=' + state.notifyCalls.length);
  ok('B10 el conteo de la tanda: 3 para salir · 1 esperando dato · 1 importante', !!tandaPost && tandaPost.conteo.para_salir === 3 && tandaPost.conteo.esperando_dato === 1 && tandaPost.conteo.importantes === 1, JSON.stringify(tandaPost && tandaPost.conteo));
  ok('B11 el DM entra como su propia tanda con borrador', !!tandaDm && tandaDm.items.length === 1 && !!tandaDm.items[0].draft);
  ok('B12 la insignia cuenta ítems de acción (pendientes de las dos tandas)', B.countAcciones(db, uid) === 5, 'acciones=' + B.countAcciones(db, uid));

  const r2 = await B.pollBandeja(db, deps, { onlyUser: uid });
  ok('B13 un segundo poll no duplica ítems ni repite el aviso', r2.nuevos === 0 && state.notifyCalls.length === 2);

  state.comments.push({ id: 'c7', text: '¿abren los domingos?', username: 'luis.f', timestamp: new Date().toISOString(), replies: [] });
  const r3 = await B.pollBandeja(db, deps, { onlyUser: uid });
  const data3 = B.getBandeja(db, uid);
  const tanda3 = data3.tandas.find(t => t.kind === 'post');
  ok('B14 un comentario nuevo se suma a la MISMA tanda sin repetir el aviso', r3.nuevos === 1 && state.notifyCalls.length === 2 && tanda3.items.some(i => i.author_username === 'luis.f'));

  // FRENO (3): la persona escribe de nuevo en el hilo de sofi.m
  state.comments.find(c => c.id === 'c2').replies.push({ id: 'c2r1', text: '¿y mañana?', username: 'sofi.m', timestamp: new Date().toISOString() });
  await B.pollBandeja(db, deps, { onlyUser: uid });
  let sofi = B.getBandeja(db, uid).tandas.find(t => t.kind === 'post').items.find(i => i.author_username === 'sofi.m');
  ok('B15 FRENO (3): escribió de nuevo → el borrador se re-prepara y se marca actualizado', sofi.actualizado === 1 && /Mañana también/.test(sofi.draft), sofi.draft);
  // El dueño edita; un mensaje nuevo NO pisa su texto.
  B.editItem(db, uid, sofi.id, 'Hola Sofi, mañana de 9 a 20 como siempre.');
  state.comments.find(c => c.id === 'c2').replies.push({ id: 'c2r2', text: 'perfecto, gracias', username: 'sofi.m', timestamp: new Date().toISOString() });
  await B.pollBandeja(db, deps, { onlyUser: uid });
  sofi = B.getBandeja(db, uid).tandas.find(t => t.kind === 'post').items.find(i => i.author_username === 'sofi.m');
  ok('B16 FRENO (3) con edición del dueño: su texto se respeta y el ítem avisa', sofi.draft === 'Hola Sofi, mañana de 9 a 20 como siempre.' && sofi.actualizado === 1);

  // FRENO (1) al abrir la revisión: juanp ya fue respondido desde IG.
  state.comments.find(c => c.id === 'c3').replies.push({ id: 'c3r1', text: '¡Gracias Juan!', username: 'thecoffeebardc', timestamp: new Date().toISOString() });
  await B.refreshTanda(db, uid, tanda3.id, deps);
  const juan = B.getBandeja(db, uid).tandas.find(t => t.kind === 'post').items.find(i => i.author_username === 'juanp');
  ok('B17 FRENO (1) en la revisión: lo respondido por el negocio sale de la tanda', juan.estado === 'ya_respondido');

  // Descartar / deshacer
  const luis = B.getBandeja(db, uid).tandas.find(t => t.kind === 'post').items.find(i => i.author_username === 'luis.f');
  B.dismissItem(db, uid, luis.id);
  let luisNow = B.getBandeja(db, uid).tandas.find(t => t.kind === 'post').items.find(i => i.id === luis.id);
  ok('B18 descartar saca el ítem de los que salen', luisNow.estado === 'descartado');
  B.undismissItem(db, uid, luis.id);
  luisNow = B.getBandeja(db, uid).tandas.find(t => t.kind === 'post').items.find(i => i.id === luis.id);
  ok('B19 deshacer lo devuelve a la tanda', luisNow.estado === 'pendiente');

  // Aprobar la tanda del posteo: salen martin + sofi (texto editado) +
  // luis (el que se sumó en B14); vale espera su dato y juan ya estaba
  // respondido por el negocio (B17).
  const ap = await B.approveTanda(db, uid, tanda3.id, deps);
  ok('B20 UN toque aprueba la tanda: salen las que tienen borrador', ap.enviadas === 3 && state.sentReplies.some(s => s.commentId === 'c7'), JSON.stringify(ap));
  ok('B21 el envío usa el texto EDITADO por el dueño', state.sentReplies.some(s => s.commentId === 'c2' && /mañana de 9 a 20 como siempre/.test(s.text)));
  ok('B22 la que espera el dato NO sale ni se marca enviada', ap.esperando_dato === 1 && !state.sentReplies.some(s => s.commentId === 'c5'));
  const martinNow = B.getBandeja(db, uid).tandas.find(t => t.kind === 'post').items.find(i => i.author_username === 'martin.g');
  ok('B23 lo enviado queda marcado enviado', martinNow.estado === 'enviado');

  // Aprobar la tanda de DMs: sale por el camino de mensajes.
  const tandaDmNow = B.getBandeja(db, uid).tandas.find(t => t.kind === 'dm');
  const apDm = await B.approveTanda(db, uid, tandaDmNow.id, deps);
  ok('B24 la tanda de DMs sale por su camino (sendDm al autor)', apDm.enviadas === 1 && state.sentDms.length === 1 && state.sentDms[0].to === 'U900');

  // FRENO (2): al enviar, el hilo ya tiene respuesta del negocio.
  const uid2 = seedUser('otro@coffee.example');
  const w2 = makeWorld();
  await B.pollBandeja(db, w2.deps, { onlyUser: uid2 });
  w2.state.comments.find(c => c.id === 'c1').replies.push({ id: 'zz1', text: 'Ya te lo resolvimos por el local.', username: 'thecoffeebardc', timestamp: new Date().toISOString() });
  const t2 = B.getBandeja(db, uid2).tandas.find(t => t.kind === 'post');
  const ap2 = await B.approveTanda(db, uid2, t2.id, w2.deps);
  const martin2 = B.getBandeja(db, uid2).tandas.find(t => t.kind === 'post').items.find(i => i.author_username === 'martin.g');
  ok('B25 FRENO (2): si el negocio ya respondió, NO se envía y queda ya_respondido', martin2.estado === 'ya_respondido' && !w2.state.sentReplies.some(s => s.commentId === 'c1') && ap2.ya_respondidas >= 1);

  // COMPUERTA DE PERMISO: Meta corta con #200 → nada sale, todo queda honesto.
  const uid3 = seedUser('tercero@coffee.example');
  const w3 = makeWorld();
  await B.pollBandeja(db, w3.deps, { onlyUser: uid3 });
  w3.state.failSendWith = '(#200) The permission has not been granted to this account';
  const t3 = B.getBandeja(db, uid3).tandas.find(t => t.kind === 'post');
  const ap3 = await B.approveTanda(db, uid3, t3.id, w3.deps);
  const items3 = B.getBandeja(db, uid3).tandas.find(t => t.kind === 'post').items;
  ok('B26 sin permiso: NADA se marca enviado y la tanda lo declara (permiso=false)', ap3.permiso === false && ap3.enviadas === 0 && !items3.some(i => i.estado === 'enviado'));
  ok('B27 sin permiso: los borradores quedan guardados como sin_permiso', items3.filter(i => i.estado === 'sin_permiso').length === 3, 'sin_permiso=' + items3.filter(i => i.estado === 'sin_permiso').length);

  // Novedades con datos reales.
  db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (?, '/x.jpg', 'Classic Espresso', 'published', datetime('now'))").run(uid);
  db.prepare("INSERT INTO ad_boosts (user_id, ig_media_id, budget_cents, currency, status, duration_days) VALUES (?, 'POST1', 5000, 'USD', 'active', 7)").run(uid);
  const novs = B.novedades(db, uid);
  ok('B28 novedades reales: el posteo de hoy y el impulso corriendo', novs.length === 2 && novs.some(n => n.tipo === 'posteo') && novs.some(n => n.tipo === 'impulso'), JSON.stringify(novs));

  // ---------------------------------------------------------- C + D
  console.log('\nC · Boot real (HTTP)');
  await bootSuite();
  console.log(`\nRESULTADO: ${pass} ✓ · ${fail} ✗`);
  if (fails.length) { console.log('FALLAS:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(1); });

// ------------------------------------------------------------------
// Boot real + Chromium
// ------------------------------------------------------------------
function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (let p = 19711; p < 19811; p++) { if (!out.includes(':' + p + ' ')) return p; }
  throw new Error('sin puerto libre');
}
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}
function seedBootDir(dir) {
  const seed = `
    process.env.DATA_DIR = ${JSON.stringify(dir)};
    const db = require(${JSON.stringify(path.join(ROOT, 'db.js'))}).db || require(${JSON.stringify(path.join(ROOT, 'db.js'))});
    const bcrypt = require('bcryptjs');
    const B = require(${JSON.stringify(path.join(ROOT, 'bandeja.js'))});
    const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('dueno@coffee.example', bcrypt.hashSync('clave-prueba-1', 10));
    const uid = Number(r.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run(uid);
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
    db.prepare("INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)").run(uid, JSON.stringify({ horarios: 'Lun a Vie 9 a 20' }));
    const t = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, notified_at) VALUES (?, 'POST1', 'post', 'POST1', 'Classic Espresso, el de todos los días', '', datetime('now'))").run(uid);
    const tid = Number(t.lastInsertRowid);
    const ins = db.prepare("INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato) VALUES (?, ?, 'comment', ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    ins.run(tid, uid, 'c1', 'c1', 'c1', 'martin.g', 'ayer me cobraron dos veces el mismo café, ¿me lo devuelven?', 'Hola Martín, perdón por eso. Pasá por el local con el comprobante y te lo resolvemos en el momento.', 'importante', 'pendiente', '');
    ins.run(tid, uid, 'c2', 'c2', 'c2', 'sofi.m', '¿hasta qué hora abren hoy?', '¡Hola Sofi! Hoy estamos hasta las 20. Te esperamos.', 'normal', 'pendiente', '');
    ins.run(tid, uid, 'c3', 'c3', 'c3', 'juanp', 'el mejor café de la ciudad', '¡Gracias Juan! Es nuestro Classic Espresso, el de todos los días.', 'normal', 'pendiente', '');
    ins.run(tid, uid, 'c6', 'c6', 'c6', 'ana.p', '¿tienen wifi?', '', 'normal', 'ya_respondido', '');
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (?, '/x.jpg', 'Classic Espresso', 'published', datetime('now'))").run(uid);
    db.prepare("INSERT INTO ad_boosts (user_id, ig_media_id, budget_cents, currency, status, duration_days) VALUES (?, 'POST1', 5000, 'USD', 'active', 7)").run(uid);
    console.log('SEEDED uid=' + uid + ' tanda=' + tid);
  `;
  const out = execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
  return out.trim();
}

async function bootSuite() {
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-boot-'));
  console.log('  seed C:', seedBootDir(dirC));
  const port = freePort();
  ok('C0 el puerto del boot está libre antes de arrancar', portFree(port));
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dirC, MEDIA_DIR: path.join(dirC, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  proc.stdout.on('data', d => { bootLog += d; });
  proc.stderr.on('data', d => { bootLog += d; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
    ok('C1 el servidor levanta', up, bootLog.slice(-400));
    if (!up) return;

    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dueno@coffee.example', password: 'clave-prueba-1' }) });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    ok('C2 login del dueño', login.ok && !!cookie, 'status=' + login.status);
    const H = { Cookie: cookie, 'Content-Type': 'application/json' };

    const gb = await (await fetch(base + '/api/bandeja', { headers: H })).json();
    const tanda = (gb.tandas || []).find(t => t.kind === 'post');
    ok('C3 GET /api/bandeja trae la tanda con su conteo (3 para salir · 1 importante)', !!tanda && tanda.conteo.para_salir === 3 && tanda.conteo.importantes === 1, JSON.stringify(gb).slice(0, 300));
    ok('C4 las novedades reales viajan en la misma respuesta', Array.isArray(gb.novedades) && gb.novedades.length === 2);
    const cnt = await (await fetch(base + '/api/bandeja/count', { headers: H })).json();
    ok('C5 GET /api/bandeja/count (la insignia de la campana) = 3', cnt.acciones === 3, JSON.stringify(cnt));

    const items = tanda ? tanda.items : [];
    const sofi = items.find(i => i.author_username === 'sofi.m');
    const ed = await (await fetch(base + '/api/bandeja/item/' + sofi.id + '/edit', { method: 'POST', headers: H, body: JSON.stringify({ text: 'Hola Sofi, hoy hasta las 20 como siempre.' }) })).json();
    ok('C6 editar un borrador por HTTP', ed.ok === true, JSON.stringify(ed));
    const juan = items.find(i => i.author_username === 'juanp');
    const dis = await (await fetch(base + '/api/bandeja/item/' + juan.id + '/dismiss', { method: 'POST', headers: H, body: '{}' })).json();
    const cnt2 = await (await fetch(base + '/api/bandeja/count', { headers: H })).json();
    ok('C7 descartar baja el conteo de acción a 2', dis.ok === true && cnt2.acciones === 2, JSON.stringify(cnt2));

    const ap = await (await fetch(base + '/api/bandeja/tanda/' + tanda.id + '/approve', { method: 'POST', headers: H, body: '{}' })).json();
    const gb2 = await (await fetch(base + '/api/bandeja', { headers: H })).json();
    const tanda2 = (gb2.tandas || []).find(t => t.id === tanda.id);
    const enviados = tanda2 ? tanda2.items.filter(i => i.estado === 'enviado').length : -1;
    ok('C8 approve con token falso: NADA queda enviado (el camino es honesto)', ap.ok === true && ap.enviadas === 0 && enviados === 0, JSON.stringify(ap));
  } finally {
    try { process.kill(proc.pid, 'SIGTERM'); } catch (e) {}
    await sleep(1500);
    ok('C9 el boot muere por PID exacto y el puerto queda libre', portFree(port));
  }

  // ------------------------------------------------------------ D
  // Boot propio con semilla prístina (la sección C ya mutó la suya).
  console.log('\nD · Chromium (390px)');
  const dirD = fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-ui-'));
  console.log('  seed D:', seedBootDir(dirD));
  const portD = freePort();
  const procD = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(portD), DATA_DIR: dirD, MEDIA_DIR: path.join(dirD, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseD = `http://127.0.0.1:${portD}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(baseD + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
    ok('D0 el segundo boot levanta', up);
    if (!up) return;
    const login = await fetch(baseD + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dueno@coffee.example', password: 'clave-prueba-1' }) });
    const cookieD = (login.headers.get('set-cookie') || '').split(';')[0];
    await chromiumSuite(baseD, cookieD);
  } finally {
    try { process.kill(procD.pid, 'SIGTERM'); } catch (e) {}
    await sleep(1500);
    ok('D10 el boot de UI muere por PID exacto y el puerto queda libre', portFree(portD));
  }
}

async function chromiumSuite(base, cookie) {
  let pw = null;
  for (const p of ['/tmp/pw-boot/node_modules/playwright-core', path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { pw = require(p); break; } catch (e) {}
  }
  if (!pw) { ok('D0 playwright-core disponible', false, 'no se encontró el módulo'); return; }
  const fsx = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright')).filter(d => d.startsWith('chromium') && !d.includes('headless'));
  let exe = '';
  for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
    const cand = path.join(os.homedir(), '.cache/ms-playwright', fsx[0], sub);
    if (fs.existsSync(cand)) { exe = cand; break; }
  }
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const [name, value] = cookie.split('=');
    await ctx.addCookies([{ name, value, url: base }]);
    const page = await ctx.newPage();
    await page.goto(base + '/#/app/notificaciones', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForSelector('.pzb-banda', { timeout: 30000 });
    const tit = await page.textContent('.pzb-banda h1');
    ok('D1 la banda celeste abre con «Notificaciones»', /Notificaciones/.test(tit || ''));
    const cardTxt = await page.textContent('.pzb-card');
    ok('D2 la tarjeta de la tanda: respuestas listas + chip de importante', /respuestas listas/.test(cardTxt || '') && /importante/i.test(cardTxt || ''), (cardTxt || '').slice(0, 160));
    const w1 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    ok('D3 teléfono 390px sin scroll horizontal (notificaciones)', w1.sw <= w1.iw + 1, JSON.stringify(w1));
    await page.screenshot({ path: path.join(ROOT, 'qa-bandeja-notificaciones-390.png'), fullPage: true });
    await page.click('button:has-text("Revisar")');
    await page.waitForSelector('.pzb-item', { timeout: 30000 });
    const revTxt = await page.textContent('.pzb-sobre');
    ok('D4 la revisión abre con la importante PRIMERO y su chip', /Respuestas listas/.test(await page.textContent('.pzb-banda h1') || '') && /martin\.g/.test(revTxt || '') && /IMPORTANTE/.test(revTxt || ''));
    const orden = await page.evaluate(() => Array.from(document.querySelectorAll('.pzb-user')).map(e => e.textContent));
    ok('D5 el orden de la lista pone a martin.g primero', orden[0] === '@martin.g', orden.join(','));
    const barra0 = await page.textContent('.pzb-barra');
    ok('D6 la barra inferior lleva el conteo vivo (quedan 3 para salir · 0 descartadas)', /Quedan\s+3\s+para salir/.test(barra0 || '') && /0 descartadas/.test(barra0 || ''), (barra0 || '').slice(0, 140));
    // Descartar a juanp desde la pantalla y verificar el conteo vivo.
    await page.evaluate(() => { const items = Array.from(document.querySelectorAll('.pzb-item')); const j = items.find(i => i.textContent.includes('@juanp')); Array.from(j.querySelectorAll('button')).find(b => b.textContent.trim() === 'Descartar').click(); });
    await page.waitForFunction(() => /1 descartadas/.test(document.querySelector('.pzb-barra').textContent), { timeout: 20000 });
    const barra1 = await page.textContent('.pzb-barra');
    ok('D7 descartar actualiza la barra: quedan 2 · 1 descartada', /Quedan\s+2\s+para salir/.test(barra1 || '') && /1 descartadas/.test(barra1 || ''), (barra1 || '').slice(0, 140));
    await page.evaluate(() => { const d = Array.from(document.querySelectorAll('.pzb-item')).find(i => i.classList.contains('pzb-descartado')); Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'Deshacer').click(); });
    await page.waitForFunction(() => /0 descartadas/.test(document.querySelector('.pzb-barra').textContent) && /Quedan\s+3\s+para salir/.test(document.querySelector('.pzb-barra').textContent), { timeout: 20000 });
    ok('D8 deshacer devuelve el ítem y el conteo vuelve (quedan 3 · 0 descartadas)', true);
    const w2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    ok('D9 teléfono 390px sin scroll horizontal (revisión)', w2.sw <= w2.iw + 1, JSON.stringify(w2));
    await page.screenshot({ path: path.join(ROOT, 'qa-bandeja-revision-390.png'), fullPage: true });
  } finally {
    await browser.close();
  }
}
