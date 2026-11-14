// LOTE PEDIDO-VOZ-REVISION — los pedidos ESPECÍFICOS por nota de voz
// en el tab Subir no se arman en el momento: nacen 'pendiente_revision'
// en subir_pedidos_voz, el cliente recibe la confirmación honesta de
// que se lo preparamos para mañana, y solo la aprobación del equipo
// (POST admin …/pedidos-subir/:id/aprobar) arma el posteo para el día
// siguiente a la aprobación, a la hora habitual y con la cadencia de
// 1 por día (desplaza el de Posty o va al siguiente libre, registrado).
// Sin aprobación, jamás se arma — ni con el paso del tiempo (no hay
// barrido: pin sobre scheduler.js). La subida estándar (sin nota, o
// con nota que solo describe el material) sigue instantánea.
//
// Cómo correrla: desde la raíz del árbol, `node test-lote-pedido-voz-revision.js`.
// Bootea el server real en un DATA_DIR temporal de /tmp (puertos
// 35177 release / 35178 control), sin claves de IA (env vacías): el
// caption de Posty no se puede generar y ese es justamente el caso
// fail-closed de la aprobación. Control contra la base: si existe el
// árbol base (LOTE_BASE_DIR o ../base), la misma llamada que hoy nace
// en revisión en la base se resolvía en el momento (modo posteado).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = 35177;
const BASE = `http://127.0.0.1:${PORT}`;
const PORTB = 35178;
const BASEB = `http://127.0.0.1:${PORTB}`;
const ADMIN = 'adm-pedidos';
const TZ = 'America/Argentina/Buenos_Aires';
const tmpDir = '/tmp/posta-pedidos-voz-' + process.pid;
const tmpDirB = '/tmp/posta-pedidos-voz-base-' + process.pid;

let ok = 0, mal = 0;
function t(name, cond, extra) { if (cond) { ok++; console.log('  ok', name); } else { mal++; console.log('  MAL', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); } }
const has = (s, x) => String(s || '').includes(x);
const ymdIn = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const todayK = ymdIn(new Date());
function shift(k, n) { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const tomorrowK = shift(todayK, 1);
const at19 = (k) => k + 'T22:00:00.000Z'; // 19:00 en Buenos Aires (UTC-3)
const horaIn = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const wdOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// ================= Parte A: pines de fuente + detector =================
function parteA() {
  console.log('— A · fuente y detector —');
  const dbSrc = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  t('A1 db.js crea subir_pedidos_voz (registro único del pedido)', has(dbSrc, 'CREATE TABLE IF NOT EXISTS subir_pedidos_voz'));
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  t('A2 la puerta del resolver responde modo pedido_revision y persiste el pedido', has(srvSrc, "modo: 'pedido_revision'") && has(srvSrc, 'subirPedidoCrear(uid, asset, kind, extraNota, respuestas)'));
  t('A3 endpoints del conserje: listar / aprobar / descartar', has(srvSrc, "'/api/admin/support/conserje/pedidos-subir'") && has(srvSrc, 'pedidos-subir/:id/aprobar') && has(srvSrc, 'pedidos-subir/:id/descartar'));
  t('A4 el armado usa el piso desde mañana (desdeYmd) sobre subirPlanDia', has(srvSrc, 'opts.desdeYmd') && has(srvSrc, "subirPlanDia(uid, kind, 'posty', { desdeYmd: manana })"));
  const sched = fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8');
  t('A5 ningún barrido toca los pedidos: sin aprobación no se arman con el tiempo', !has(sched, 'subir_pedidos_voz'));
  const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  t('A6 el recibo del cliente dice la verdad: «Lo preparamos para mañana»', has(appSrc, "r.modo === 'pedido_revision'") && has(appSrc, 'Lo preparamos para mañana') && has(appSrc, "We'll get it ready for tomorrow"));

  // El detector, extraído del server real y evaluado en VM.
  const i0 = srvSrc.indexOf('function subirNotaEsPedidoEspecifico');
  const i1 = srvSrc.indexOf('function subirPedidoCrear');
  t('A7 el detector se pudo extraer del server', i0 > 0 && i1 > i0);
  if (i0 > 0 && i1 > i0) {
    const fn = vm.runInNewContext('(' + srvSrc.slice(i0, i1).trim().replace(/;?\s*$/, '') + ')', {});
    const pos = [
      'quiero que el viernes salga el 2x1 en medialunas',
      'anunciá el evento del sábado, es la inauguración',
      'para el viernes preparame algo con la torta nueva',
      'el viernes hay 2x1 en el local',
      'haceme una historia para el lanzamiento',
      'quiero que se vea bien la torta', // es un pedido (dirigido a Posty): a revisión por diseño
      'please post this on friday',
    ];
    const neg = [
      'esta es la torta de la abuela',
      'foto de la vidriera nueva, la sacamos hoy a la mañana',
      'el plato nuevo del menú, sale con fritas',
      'hay medialunas recién hechas',
      'la torta que hace mi abuela los domingos',
      '',
      'ok',
    ];
    for (const s of pos) t('A8 pedido: «' + s.slice(0, 44) + '»', fn(s) === true, 'dio ' + fn(s));
    for (const s of neg) t('A9 descripción: «' + (s.slice(0, 44) || '(vacía)') + '»', fn(s) === false, 'dio ' + fn(s));
  }
}

// ================= Parte B: servidor real =================
function dbOpen(dir) { return new DatabaseSync(path.join(dir || tmpDir, 'posta.db')); }
function cookieOf(res) { const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []; return sc.map((c) => c.split(';')[0]).join('; '); }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function pngDeColor(color) {
  const f = path.join(tmpDir, 'up-' + color + '.png');
  try { execSync(`ffmpeg -y -v error -f lavfi -i color=c=${color}:s=48x48 -frames:v 1 "${f}"`); return fs.readFileSync(f); }
  catch (e) { return PNG; }
}
function boot(root, port, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: ADMIN, SUPERVISION_HOOK_URL: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  return { srv, getLog: () => log };
}
async function waitUp(base) {
  for (let i = 0; i < 90; i++) { try { const r = await fetch(base + '/api/version'); if (r.ok) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 1000)); }
  return false;
}

async function parteB() {
  console.log('— B · flujo real (release) —');
  const { srv, getLog } = boot(ROOT, PORT, tmpDir);
  const J = (r) => r.json().catch(() => ({}));
  const post = (url, body, cookie) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
  const get = (url, cookie) => fetch(BASE + url, { headers: { ...(cookie ? { cookie } : {}) } });
  const adm = (url, body) => fetch(BASE + url + (url.includes('?') ? '&' : '?') + 'token=' + ADMIN, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  async function register(email) {
    const r = await post('/api/auth/register', { email, password: 'secreto1' });
    const cookie = cookieOf(r);
    const db = dbOpen(); const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email); db.close();
    return { cookie, uid: u && u.id, status: r.status };
  }
  async function upload(cookie, buf) {
    const r = await fetch(BASE + '/api/album/photo', { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: buf });
    return { status: r.status, body: await J(r) };
  }
  function postsOf(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }
  function pedidoRow(id) { const db = dbOpen(); const r = db.prepare('SELECT * FROM subir_pedidos_voz WHERE id = ?').get(id); db.close(); return r; }
  function pedidosOf(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM subir_pedidos_voz WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }
  function assetRow(id) { const db = dbOpen(); const r = db.prepare('SELECT * FROM assets WHERE id = ?').get(id); db.close(); return r; }
  function seedPost(uid, o) {
    const db = dbOpen();
    const info = db.prepare(`INSERT INTO posts (user_id, caption, image_path, media_type, status, scheduled_at, source, client_photo, approval, created_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(uid, o.caption || 'Semilla', o.image || '/media/seed.jpg', o.media || 'image', o.status || 'scheduled', o.at, o.source || 'trial', o.client ? 1 : 0, o.approval || 'pending');
    db.close();
    return Number(info.lastInsertRowid);
  }
  function postRow(id) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE id = ?').get(id); db.close(); return r; }
  async function hacerPedido(u, color, extra, extraBody) {
    const up = await upload(u.cookie, pngDeColor(color));
    const body = { asset_id: up.body.id, cuando: 'posty', caption_modo: 'mio', caption_text: 'Caption del pedido', mejora: 'no', extra, ...(extraBody || {}) };
    const r = await J(await post('/api/subir/resolver', body, u.cookie));
    return { up, r };
  }

  try {
    const up0 = await waitUp(BASE);
    t('B0 server booteó', up0, getLog().slice(-300));
    if (!up0) return;

    // --- U1: pedido específico → nace en revisión; aprobación → mañana directo ---
    const u1 = await register('pedidos-u1@example.com');
    const { r: r1 } = await hacerPedido(u1, 'red', 'quiero que el viernes salga el 2x1 en medialunas');
    t('B1 el pedido específico NO se arma en el momento: modo pedido_revision', r1.ok && r1.modo === 'pedido_revision' && !!r1.pedido_id, JSON.stringify(r1).slice(0, 200));
    t('B2 cero posteos creados al pedir', postsOf(u1.uid).length === 0, 'posts=' + postsOf(u1.uid).length);
    const ped1 = r1.pedido_id ? pedidoRow(r1.pedido_id) : null;
    t('B3 el pedido quedó persistido: pendiente_revision, con su nota y sus respuestas', !!ped1 && ped1.estado === 'pendiente_revision' && has(ped1.nota, '2x1') && has(ped1.respuestas, 'Caption del pedido'), JSON.stringify(ped1).slice(0, 220));
    t('B4 el material quedó marcado como del pedido (no suelto)', !!ped1 && assetRow(ped1.asset_id).upload_choice === 'pedido_revision');
    const lista = await J(await adm('/api/admin/support/conserje/pedidos-subir?estado=pendiente_revision'));
    const enLista = (lista.pedidos || []).find((p) => p.id === r1.pedido_id);
    t('B5 el conserje lo ve: pedido con nota, cliente y estado', !!enLista && has(enLista.nota, '2x1') && enLista.email === 'pedidos-u1@example.com' && enLista.estado === 'pendiente_revision', JSON.stringify(enLista || lista).slice(0, 200));
    const rSinTok = await fetch(BASE + '/api/admin/support/conserje/pedidos-subir');
    t('B6 sin token admin no se lee (403)', rSinTok.status === 403, 'status=' + rSinTok.status);
    const rAp1 = await J(await adm('/api/admin/support/conserje/pedidos-subir/' + r1.pedido_id + '/aprobar', {}));
    const ped1b = pedidoRow(r1.pedido_id);
    const post1 = ped1b && ped1b.post_id ? postRow(ped1b.post_id) : null;
    t('B7 aprobar arma el posteo y el pedido queda armado con su par', !!rAp1.ok && !!ped1b && ped1b.estado === 'armado' && !!post1 && post1.source === 'subir' && post1.caption === 'Caption del pedido', JSON.stringify(rAp1).slice(0, 220));
    t('B8 el posteo sale MAÑANA a la hora habitual (19:00), camino directo', !!post1 && ymdIn(new Date(post1.scheduled_at)) === tomorrowK && horaIn(post1.scheduled_at) === '19:00' && !!ped1b.armado && JSON.parse(ped1b.armado).camino === 'directo' && JSON.parse(ped1b.armado).dia === tomorrowK, 'post=' + (post1 && post1.scheduled_at) + ' armado=' + (ped1b && ped1b.armado));
    const rAp1b = await J(await adm('/api/admin/support/conserje/pedidos-subir/' + r1.pedido_id + '/aprobar', {}));
    t('B9 aprobar de nuevo no duplica: repetido y un solo posteo', !!rAp1b.ok && rAp1b.repetido === true && postsOf(u1.uid).length === 1);

    // --- U2: mañana ocupado por un posteo de Posty → se desplaza el de Posty ---
    const u2 = await register('pedidos-u2@example.com');
    const semilla2 = seedPost(u2.uid, { at: at19(tomorrowK), source: 'trial', client: 0, caption: 'De Posty, mañana' });
    const { r: r2 } = await hacerPedido(u2, 'green', 'anunciá la promo del finde en el local');
    const rAp2 = await J(await adm('/api/admin/support/conserje/pedidos-subir/' + r2.pedido_id + '/aprobar', {}));
    const ped2 = pedidoRow(r2.pedido_id);
    const post2 = ped2 && ped2.post_id ? postRow(ped2.post_id) : null;
    const sem2 = postRow(semilla2);
    const arm2 = ped2 && ped2.armado ? JSON.parse(ped2.armado) : {};
    if (wdOf(tomorrowK) === 0) {
      // Mañana es domingo: no hay día libre posterior en la semana
      // para recibir al de Posty → el pedido va al siguiente libre y
      // el de Posty no se mueve (la regla de siempre del planner).
      t('B10 (domingo) el pedido va al siguiente libre y el de Posty queda en su día', !!post2 && ymdIn(new Date(post2.scheduled_at)) !== tomorrowK && ymdIn(new Date(sem2.scheduled_at)) === tomorrowK && arm2.camino === 'siguiente_libre', 'camino=' + arm2.camino + ' post=' + (post2 && post2.scheduled_at));
    } else {
      t('B10 el pedido ocupa mañana y el de Posty se mueve a un día libre posterior', !!post2 && ymdIn(new Date(post2.scheduled_at)) === tomorrowK && ymdIn(new Date(sem2.scheduled_at)) !== tomorrowK && ymdIn(new Date(sem2.scheduled_at)) > tomorrowK && arm2.camino === 'desplazo_posty' && arm2.desplazado_post_id === semilla2, 'camino=' + arm2.camino + ' post=' + (post2 && post2.scheduled_at) + ' semilla=' + (sem2 && sem2.scheduled_at));
    }
    {
      const rows = postsOf(u2.uid).filter((p) => p.scheduled_at);
      const days = rows.map((p) => ymdIn(new Date(p.scheduled_at)));
      t('B11 invariante u2: ningún día con dos posteos', new Set(days).size === days.length, JSON.stringify(days));
    }

    // --- U3: mañana ocupado por un posteo DEL CLIENTE → el pedido va al siguiente libre ---
    const u3 = await register('pedidos-u3@example.com');
    const semilla3 = seedPost(u3.uid, { at: at19(tomorrowK), source: 'subir', client: 1, caption: 'Del cliente, mañana' });
    const { r: r3 } = await hacerPedido(u3, 'blue', 'quiero un posteo para el evento del sábado');
    await J(await adm('/api/admin/support/conserje/pedidos-subir/' + r3.pedido_id + '/aprobar', {}));
    const ped3 = pedidoRow(r3.pedido_id);
    const post3 = ped3 && ped3.post_id ? postRow(ped3.post_id) : null;
    const sem3 = postRow(semilla3);
    const arm3 = ped3 && ped3.armado ? JSON.parse(ped3.armado) : {};
    t('B12 el día del cliente no se toca: el pedido va al siguiente libre y queda registrado', !!post3 && ymdIn(new Date(post3.scheduled_at)) > tomorrowK && sem3.scheduled_at === at19(tomorrowK) && arm3.camino === 'siguiente_libre', 'camino=' + arm3.camino + ' post=' + (post3 && post3.scheduled_at) + ' semilla=' + (sem3 && sem3.scheduled_at));

    // --- U4: sin aprobación, nunca se arma ---
    const u4 = await register('pedidos-u4@example.com');
    const { r: r4 } = await hacerPedido(u4, 'yellow', 'necesito que anuncien el lanzamiento del lunes');
    const ped4antes = pedidoRow(r4.pedido_id);
    t('B13 el pedido sin aprobar espera: pendiente y cero posteos (tras todo el flujo de la suite)', !!ped4antes && ped4antes.estado === 'pendiente_revision' && postsOf(u4.uid).length === 0);

    // --- U5: descartado es terminal ---
    const u5 = await register('pedidos-u5@example.com');
    const { r: r5 } = await hacerPedido(u5, 'magenta', 'quiero que salga el sorteo del viernes');
    const rDes = await J(await adm('/api/admin/support/conserje/pedidos-subir/' + r5.pedido_id + '/descartar', {}));
    const rApDes = await fetch(BASE + '/api/admin/support/conserje/pedidos-subir/' + r5.pedido_id + '/aprobar?token=' + ADMIN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    t('B14 descartar cierra el pedido: aprobar después da 409 y no se arma nada', !!rDes.ok && pedidoRow(r5.pedido_id).estado === 'descartado' && rApDes.status === 409 && postsOf(u5.uid).length === 0, 'status=' + rApDes.status);

    // --- U6: aprobación sin forma de armar (caption de Posty sin IA) → fail-closed ---
    const u6 = await register('pedidos-u6@example.com');
    const up6 = await upload(u6.cookie, pngDeColor('cyan'));
    const r6 = await J(await post('/api/subir/resolver', { asset_id: up6.body.id, cuando: 'posty', caption_modo: 'posty', mejora: 'no', extra: 'quiero un posteo para el evento del sábado' }, u6.cookie));
    t('B15 el pedido con caption de Posty también nace en revisión', r6.ok && r6.modo === 'pedido_revision' && !!r6.pedido_id, JSON.stringify(r6).slice(0, 160));
    const rAp6 = await fetch(BASE + '/api/admin/support/conserje/pedidos-subir/' + r6.pedido_id + '/aprobar?token=' + ADMIN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const bodyAp6 = await J(rAp6);
    const ped6 = pedidoRow(r6.pedido_id);
    t('B16 sin forma de generar el caption: no se arma, queda aprobado con el motivo (reintentable)', rAp6.status === 502 && bodyAp6.ok === false && !!ped6 && ped6.estado === 'aprobado' && !!ped6.error && postsOf(u6.uid).length === 0, 'status=' + rAp6.status + ' estado=' + (ped6 && ped6.estado) + ' error=' + (ped6 && ped6.error));

    // --- U7: la subida estándar sigue instantánea; la nota descriptiva no frena; guardar no pide ---
    const u7 = await register('pedidos-u7@example.com');
    const upA = await upload(u7.cookie, pngDeColor('orange'));
    const rStd = await J(await post('/api/subir/resolver', { asset_id: upA.body.id, cuando: 'semana', caption_modo: 'mio', caption_text: 'Estándar', mejora: 'no' }, u7.cookie));
    t('B17 subida estándar sin nota: instantánea como siempre', rStd.ok && rStd.modo === 'posteado' && !!rStd.post_id, JSON.stringify(rStd).slice(0, 160));
    const upB = await upload(u7.cookie, pngDeColor('purple'));
    const rDesc = await J(await post('/api/subir/resolver', { asset_id: upB.body.id, cuando: 'semana', caption_modo: 'mio', caption_text: 'Con nota descriptiva', mejora: 'no', extra: 'esta es la torta de la abuela, la de siempre' }, u7.cookie));
    t('B18 nota que solo describe el material: instantánea, no es pedido', rDesc.ok && rDesc.modo === 'posteado' && !!rDesc.post_id, JSON.stringify(rDesc).slice(0, 160));
    const upC = await upload(u7.cookie, pngDeColor('brown'));
    const rGuard = await J(await post('/api/subir/resolver', { asset_id: upC.body.id, cuando: 'guardar', caption_modo: 'mio', caption_text: 'x', extra: 'quiero que salga el viernes' }, u7.cookie));
    t('B19 «solo guardarlo» manda sobre la nota: se guarda y no nace pedido', rGuard.ok && rGuard.modo === 'guardado' && pedidosOf(u7.uid).length === 0, JSON.stringify(rGuard).slice(0, 160));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
  }
}

// ================= Parte C: control contra la base =================
async function parteC() {
  console.log('— C · control contra la base —');
  const baseDir = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
  if (!fs.existsSync(path.join(baseDir, 'server.js'))) { console.log('  (sin árbol base: control omitido)'); return; }
  const { srv } = boot(baseDir, PORTB, tmpDirB);
  const J = (r) => r.json().catch(() => ({}));
  try {
    const up = await waitUp(BASEB);
    t('C0 la base booteó', up);
    if (!up) return;
    const r0 = await fetch(BASEB + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'pedidos-base@example.com', password: 'secreto1' }) });
    const cookie = cookieOf(r0);
    const upF = await fetch(BASEB + '/api/album/photo', { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: pngDeColor('white') });
    const upJ = await J(upF);
    const r = await J(await fetch(BASEB + '/api/subir/resolver', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ asset_id: upJ.id, cuando: 'posty', caption_modo: 'mio', caption_text: 'Caption del pedido', mejora: 'no', extra: 'quiero que el viernes salga el 2x1 en medialunas' }) }));
    t('C1 en la base el mismo pedido se resolvía EN EL MOMENTO (posteado, sin revisión)', r.ok && r.modo === 'posteado' && !!r.post_id, JSON.stringify(r).slice(0, 200));
    const rAdm = await fetch(BASEB + '/api/admin/support/conserje/pedidos-subir?token=' + ADMIN);
    t('C2 en la base no existe la superficie de pedidos del conserje (404)', rAdm.status === 404, 'status=' + rAdm.status);
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
  }
}

(async () => {
  parteA();
  await parteB();
  await parteC();
  console.log(`\n== test-lote-pedido-voz-revision: ${ok} ok · ${mal} mal ==`);
  process.exit(mal ? 1 : 0);
})();
