// LOTE PEDIDO-VOZ-DUDA — paso 3 de la spec de pedidos por voz
// (Valentino, 13/11 22:26): cuando el pedido específico de Subir se
// cruza con el fundamento del cliente y el cruce deja una DUDA real
// sobre el producto (la promo o el evento no dice de cuál es, o la
// nota calza con dos productos), Posty le pregunta AL CLIENTE con
// opciones de un toque salidas de su propio fundamento — nunca texto
// libre, nunca una opción inventada. La respuesta queda registrada
// como parte de «lo entendido» que ve el conserje y la usa el armado.
// Sin duda, el flujo es EXACTAMENTE el de PEDIDO-VOZ-REVISION: el
// trabajo es la respuesta. Sin respuesta del cliente, el pedido cae
// en revisión con la duda marcada y nada se afirma por él.
//
// Cómo correrla: desde la raíz del árbol, `node test-lote-pedido-voz-duda.js`.
// Bootea el server real en DATA_DIR temporales de /tmp (puertos 35211
// release / 35212 control), sin claves de IA: el caption de Posty no
// se puede generar y la aprobación de un pedido con caption de Posty
// queda fail-closed como en la suite de PVR (B16) — el armado con
// respuesta confirmada se verifica por el payload del conserje y por
// el pin de fuente del fold-in. Control contra la base: si existe el
// árbol base (LOTE_BASE_DIR o ../base), el mismo pedido que acá nace
// con pregunta allá nace sin ella y el endpoint de respuesta da 404.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = 35211;
const BASE = `http://127.0.0.1:${PORT}`;
const PORTB = 35212;
const BASEB = `http://127.0.0.1:${PORTB}`;
const ADMIN = 'adm-duda';
const tmpDir = '/tmp/posta-pedido-duda-' + process.pid;
const tmpDirB = '/tmp/posta-pedido-duda-base-' + process.pid;

let ok = 0, mal = 0;
function t(name, cond, extra) { if (cond) { ok++; console.log('  ok', name); } else { mal++; console.log('  MAL', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); } }
const has = (s, x) => String(s || '').includes(x);

const DIG_PANADERIA = {
  business: 'Panadería Sol',
  productos: ['Medialunas de manteca', 'Torta de chocolate', 'Torta de limón', 'Budín de naranja'],
  servicios: [],
  inferred_star: { item: 'Torta de limón', confidence: 0.9, fuente: 'feed' },
};

// ================= Parte A: pines de fuente + la duda en VM =================
function parteA() {
  console.log('— A · fuente y la función de duda —');
  const dbSrc = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  const idxCreate = dbSrc.indexOf('CREATE TABLE IF NOT EXISTS subir_pedidos_voz');
  const idxAlter = dbSrc.indexOf('ALTER TABLE subir_pedidos_voz ADD COLUMN duda ');
  t('A1 db.js suma duda/duda_respuesta DESPUÉS del CREATE de subir_pedidos_voz', idxCreate > 0 && idxAlter > idxCreate && has(dbSrc, 'ALTER TABLE subir_pedidos_voz ADD COLUMN duda_respuesta '));
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  t('A2 el resolver persiste la duda y la devuelve solo si nació', has(srvSrc, 'function subirPedidoDuda(uid, nota, respuestas)') && has(srvSrc, '...(duda ? { duda } : {})') && has(srvSrc, 'SET duda = ? WHERE id = ?'));
  t('A3 endpoint del cliente para responder: dueño, revisión y opciones cerradas', has(srvSrc, "'/api/subir/pedidos-voz/:id/respuesta'") && has(srvSrc, "opcion !== 'otra' && !duda.opciones.includes(opcion)"));
  t('A4 el payload del conserje lleva la duda y la respuesta (lo entendido completo)', has(srvSrc, 'duda, duda_respuesta: p.duda_respuesta'));
  t('A5 el armado usa la confirmación y nunca afirma lo dudoso', has(srvSrc, 'El dueño confirmó que este pedido es sobre: ') && has(srvSrc, "dudaResp !== 'otra'"));
  t('A6 ningún barrido responde ni arma por el cliente', !has(fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8'), 'duda_respuesta'));
  const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  t('A7 el recibo pinta la pregunta con chips de un toque y el «otra cosa»', has(appSrc, 'data-pz-duda') && has(appSrc, 'pzSubirDudaResponder') && has(appSrc, 'Es otra cosa') && has(appSrc, "It's something else"));
  t('A8 la pregunta se dice como duda única, ES y EN', has(appSrc, 'Una sola duda para no errarle') && has(appSrc, 'One quick question so we get it right'));

  // La función de duda, extraída del server real y evaluada en VM con
  // el client-digest real del árbol y fundamentos sembrados por uid.
  const i0 = srvSrc.indexOf('function subirPedidoDuda(');
  const i1 = srvSrc.indexOf('// El armado tras la aprobación');
  t('A9 la función de duda se pudo extraer del server', i0 > 0 && i1 > i0);
  if (i0 > 0 && i1 > i0) {
    const clientDigest = require(path.join(ROOT, 'client-digest.js'));
    const digests = { 1: DIG_PANADERIA, 2: { business: 'Vacío', productos: [], servicios: [] } };
    const fn = vm.runInNewContext('(' + srvSrc.slice(i0, i1).trim().replace(/;?\s*$/, '') + ')', { clientDigest, digestForUser: (uid) => digests[uid] || null });
    const pool = DIG_PANADERIA.productos;
    // Sin fundamento o sin productos: no hay opciones construibles → no hay pregunta.
    t('A10 sin digest no hay pregunta', fn(99, 'quiero que anuncien la promo del finde', { promo: 'desc' }) === null);
    t('A11 fundamento sin productos: no hay pregunta', fn(2, 'quiero que anuncien la promo del finde', { promo: 'desc' }) === null);
    // Caption propio entero: el cliente ya especificó todo → no se pregunta.
    t('A12 caption propio entero: no hay pregunta aunque la promo no nombre producto', fn(1, 'quiero que anuncien la promo del finde', { promo: 'desc', caption_modo: 'mio', caption_text: 'x' }) === null);
    // D1 por el formulario: promo sin producto nombrado.
    const d1 = fn(1, 'quiero que anuncien la promo del finde en el local', { promo: 'desc', caption_modo: 'posty' });
    t('A13 D1 promo sin producto: pregunta producto_promo', !!d1 && d1.tipo === 'producto_promo', JSON.stringify(d1));
    t('A14 D1 las opciones salen del fundamento, la estrella primero, tope 3, ninguna inventada', !!d1 && d1.opciones.length === 3 && d1.opciones[0] === 'Torta de limón' && d1.opciones.every((o) => pool.includes(o)), JSON.stringify(d1 && d1.opciones));
    // D1 por la nota: evento sin producto, formulario en «no».
    const d1e = fn(1, 'quiero un posteo para el evento del sábado', { promo: 'no', caption_modo: 'posty' });
    t('A15 D1 evento sin producto: pregunta producto_evento', !!d1e && d1e.tipo === 'producto_evento' && d1e.opciones.every((o) => pool.includes(o)), JSON.stringify(d1e));
    // D1 por token de la nota (descuento) sin formulario.
    const d1n = fn(1, 'quiero que salga el descuento del finde', { promo: 'no', caption_modo: 'posty' });
    t('A16 D1 «descuento» en la nota también dispara', !!d1n && d1n.tipo === 'producto_promo', JSON.stringify(d1n));
    // D2: «la torta» calza con dos.
    const d2 = fn(1, 'quiero anunciar la torta para el viernes', { promo: 'no', caption_modo: 'posty' });
    t('A17 D2 la mención calza con dos tortas: pregunta producto_ambiguo con ambas', !!d2 && d2.tipo === 'producto_ambiguo' && d2.opciones.length === 2 && d2.opciones.includes('Torta de chocolate') && d2.opciones.includes('Torta de limón'), JSON.stringify(d2));
    // Identificado por nombre completo → sin duda.
    t('A18 nombre completo único: sin pregunta', fn(1, 'quiero que salga la torta de limón el viernes', { promo: 'no', caption_modo: 'posty' }) === null);
    // Una sola coincidencia débil identifica por eliminación.
    t('A19 «medialunas» con un solo producto de medialunas: sin pregunta', fn(1, 'quiero que el viernes salga el 2x1 en medialunas', { promo: '2x1', caption_modo: 'posty' }) === null);
    // Dos nombres completos: texto determinado → sin pregunta.
    t('A20 dos nombres completos en la nota: sin pregunta', fn(1, 'quiero anunciar la torta de limón y el budín de naranja', { promo: 'no', caption_modo: 'posty' }) === null);
    // Encargo genérico sin promo/evento ni ambigüedad → sin pregunta.
    t('A21 encargo genérico: sin pregunta', fn(1, 'quiero un posteo lindo para el viernes', { promo: 'no', caption_modo: 'posty' }) === null);
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
function seedDigest(dir, uid, digest) {
  const clientDigest = require(path.join(ROOT, 'client-digest.js'));
  const db = dbOpen(dir);
  try { clientDigest.saveDigest(db, uid, digest); } finally { db.close(); }
}

async function parteB() {
  console.log('— B · flujo real (release) —');
  const { srv, getLog } = boot(ROOT, PORT, tmpDir);
  const J = (r) => r.json().catch(() => ({}));
  const post = (url, body, cookie) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
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
  function pedidoRow(id) { const db = dbOpen(); const r = db.prepare('SELECT * FROM subir_pedidos_voz WHERE id = ?').get(id); db.close(); return r; }
  function postsOf(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }

  try {
    const up0 = await waitUp(BASE);
    t('B0 server booteó', up0, getLog().slice(-300));
    if (!up0) return;

    // --- U1: D1 promo sin producto → pregunta; respuesta → lo entendido ---
    const u1 = await register('duda-u1@example.com');
    seedDigest(tmpDir, u1.uid, DIG_PANADERIA);
    const up1 = await upload(u1.cookie, pngDeColor('red'));
    const r1 = await J(await post('/api/subir/resolver', { asset_id: up1.body.id, cuando: 'posty', promo: 'desc', mejora: 'no', caption_modo: 'posty', extra: 'quiero que anuncien la promo del finde en el local' }, u1.cookie));
    t('B1 el pedido nace en revisión Y con la pregunta de duda en la respuesta', r1.ok && r1.modo === 'pedido_revision' && !!r1.duda && r1.duda.tipo === 'producto_promo', JSON.stringify(r1).slice(0, 260));
    t('B2 las opciones son del fundamento del cliente, la estrella primero', !!r1.duda && r1.duda.opciones[0] === 'Torta de limón' && r1.duda.opciones.every((o) => DIG_PANADERIA.productos.includes(o)), JSON.stringify(r1.duda && r1.duda.opciones));
    const ped1 = r1.pedido_id ? pedidoRow(r1.pedido_id) : null;
    t('B3 la duda quedó persistida en el pedido, sin respuesta todavía', !!ped1 && has(ped1.duda, 'producto_promo') && String(ped1.duda_respuesta || '') === '' && ped1.estado === 'pendiente_revision', JSON.stringify(ped1).slice(0, 220));
    const uX = await register('duda-ux@example.com');
    const rAjena = await fetch(BASE + '/api/subir/pedidos-voz/' + r1.pedido_id + '/respuesta', { method: 'POST', headers: { 'content-type': 'application/json', cookie: uX.cookie }, body: JSON.stringify({ opcion: 'Torta de limón' }) });
    t('B4 otro cliente no puede responder la pregunta ajena (404)', rAjena.status === 404, 'status=' + rAjena.status);
    const rInv = await fetch(BASE + '/api/subir/pedidos-voz/' + r1.pedido_id + '/respuesta', { method: 'POST', headers: { 'content-type': 'application/json', cookie: u1.cookie }, body: JSON.stringify({ opcion: 'Producto Inventado' }) });
    t('B5 una opción que Posty no ofreció se rechaza (400) y nada queda guardado', rInv.status === 400 && String(pedidoRow(r1.pedido_id).duda_respuesta || '') === '', 'status=' + rInv.status);
    const rResp = await J(await post('/api/subir/pedidos-voz/' + r1.pedido_id + '/respuesta', { opcion: 'Torta de limón' }, u1.cookie));
    t('B6 la respuesta de un toque queda registrada en el pedido', !!rResp.ok && rResp.respuesta === 'Torta de limón' && pedidoRow(r1.pedido_id).duda_respuesta === 'Torta de limón', JSON.stringify(rResp).slice(0, 160));
    const rResp2 = await J(await post('/api/subir/pedidos-voz/' + r1.pedido_id + '/respuesta', { opcion: 'Torta de limón' }, u1.cookie));
    t('B7 repetir la misma respuesta es idempotente', !!rResp2.ok && rResp2.repetido === true);
    const rCambio = await fetch(BASE + '/api/subir/pedidos-voz/' + r1.pedido_id + '/respuesta', { method: 'POST', headers: { 'content-type': 'application/json', cookie: u1.cookie }, body: JSON.stringify({ opcion: 'otra' }) });
    t('B8 cambiar la respuesta no se puede (409): vale la primera palabra del dueño', rCambio.status === 409 && pedidoRow(r1.pedido_id).duda_respuesta === 'Torta de limón', 'status=' + rCambio.status);
    const lista1 = await J(await adm('/api/admin/support/conserje/pedidos-subir?estado=pendiente_revision'));
    const enLista1 = (lista1.pedidos || []).find((p) => p.id === r1.pedido_id);
    t('B9 el conserje ve lo entendido completo: duda + la respuesta del cliente', !!enLista1 && !!enLista1.duda && enLista1.duda.tipo === 'producto_promo' && enLista1.duda_respuesta === 'Torta de limón', JSON.stringify(enLista1 || {}).slice(0, 260));
    const rAp1 = await fetch(BASE + '/api/admin/support/conserje/pedidos-subir/' + r1.pedido_id + '/aprobar?token=' + ADMIN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const ped1b = pedidoRow(r1.pedido_id);
    t('B10 aprobar sin IA queda fail-closed como siempre y la respuesta se conserva', rAp1.status === 502 && !!ped1b && ped1b.estado === 'aprobado' && ped1b.duda_respuesta === 'Torta de limón' && postsOf(u1.uid).length === 0, 'status=' + rAp1.status + ' estado=' + (ped1b && ped1b.estado));

    // --- U2: D2 «la torta» calza con dos → pregunta; respuesta «otra» ---
    const u2 = await register('duda-u2@example.com');
    seedDigest(tmpDir, u2.uid, DIG_PANADERIA);
    const up2 = await upload(u2.cookie, pngDeColor('green'));
    const r2 = await J(await post('/api/subir/resolver', { asset_id: up2.body.id, cuando: 'posty', promo: 'no', mejora: 'no', caption_modo: 'posty', extra: 'quiero anunciar la torta para el viernes' }, u2.cookie));
    t('B11 «la torta» con dos tortas en el fundamento: pregunta producto_ambiguo con ambas', r2.ok && !!r2.duda && r2.duda.tipo === 'producto_ambiguo' && r2.duda.opciones.includes('Torta de chocolate') && r2.duda.opciones.includes('Torta de limón'), JSON.stringify(r2.duda || r2).slice(0, 220));
    const rRespO = await J(await post('/api/subir/pedidos-voz/' + r2.pedido_id + '/respuesta', { opcion: 'otra' }, u2.cookie));
    t('B12 el «es otra cosa» también es una respuesta válida y queda registrada', !!rRespO.ok && pedidoRow(r2.pedido_id).duda_respuesta === 'otra');

    // --- U3: sin duda → el flujo es el de siempre, byte a byte en lo observable ---
    const u3 = await register('duda-u3@example.com');
    seedDigest(tmpDir, u3.uid, DIG_PANADERIA);
    const up3 = await upload(u3.cookie, pngDeColor('blue'));
    const r3 = await J(await post('/api/subir/resolver', { asset_id: up3.body.id, cuando: 'posty', promo: '2x1', mejora: 'no', caption_modo: 'mio', caption_text: 'Caption del dueño', extra: 'quiero que el viernes salga el 2x1 en medialunas' }, u3.cookie));
    t('B13 pedido identificado (caption propio + producto nombrado): nace en revisión SIN pregunta', r3.ok && r3.modo === 'pedido_revision' && !('duda' in r3) && !!r3.pedido_id, JSON.stringify(r3).slice(0, 200));
    const ped3 = r3.pedido_id ? pedidoRow(r3.pedido_id) : null;
    t('B14 en la fila tampoco hay duda: el pedido es el de siempre', !!ped3 && String(ped3.duda || '') === '' && String(ped3.duda_respuesta || '') === '');
    const rSinDuda = await fetch(BASE + '/api/subir/pedidos-voz/' + r3.pedido_id + '/respuesta', { method: 'POST', headers: { 'content-type': 'application/json', cookie: u3.cookie }, body: JSON.stringify({ opcion: 'otra' }) });
    t('B15 responder un pedido sin pregunta da 409', rSinDuda.status === 409, 'status=' + rSinDuda.status);
    const rAp3 = await J(await adm('/api/admin/support/conserje/pedidos-subir/' + r3.pedido_id + '/aprobar', {}));
    t('B16 y su aprobación arma como siempre (flujo idéntico al de PVR)', !!rAp3.ok && pedidoRow(r3.pedido_id).estado === 'armado' && postsOf(u3.uid).length === 1);
    // Sin fundamento no hay opciones construibles: no se pregunta.
    const u3b = await register('duda-u3b@example.com');
    const up3b = await upload(u3b.cookie, pngDeColor('white'));
    const r3b = await J(await post('/api/subir/resolver', { asset_id: up3b.body.id, cuando: 'posty', promo: 'desc', mejora: 'no', caption_modo: 'posty', extra: 'quiero que anuncien la promo del finde en el local' }, u3b.cookie));
    t('B17 sin fundamento con productos no hay pregunta (no se inventan opciones)', r3b.ok && r3b.modo === 'pedido_revision' && !('duda' in r3b), JSON.stringify(r3b).slice(0, 180));

    // --- U4: sin respuesta → revisión con la duda marcada ---
    const u4 = await register('duda-u4@example.com');
    seedDigest(tmpDir, u4.uid, DIG_PANADERIA);
    const up4 = await upload(u4.cookie, pngDeColor('magenta'));
    const r4 = await J(await post('/api/subir/resolver', { asset_id: up4.body.id, cuando: 'posty', promo: 'no', mejora: 'no', caption_modo: 'posty', extra: 'quiero un posteo para el lanzamiento del lunes' }, u4.cookie));
    t('B18 el lanzamiento sin producto también pregunta (producto_evento)', r4.ok && !!r4.duda && r4.duda.tipo === 'producto_evento', JSON.stringify(r4.duda || r4).slice(0, 200));
    const lista4 = await J(await adm('/api/admin/support/conserje/pedidos-subir?estado=pendiente_revision'));
    const enLista4 = (lista4.pedidos || []).find((p) => p.id === r4.pedido_id);
    t('B19 sin respuesta, el conserje lo recibe con la duda marcada y la respuesta vacía', !!enLista4 && !!enLista4.duda && enLista4.duda.tipo === 'producto_evento' && enLista4.duda_respuesta === '' && enLista4.estado === 'pendiente_revision', JSON.stringify(enLista4 || {}).slice(0, 220));
    t('B20 y sigue sin armarse: cero posteos del cliente que no respondió', postsOf(u4.uid).length === 0);
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
    const r0 = await fetch(BASEB + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'duda-base@example.com', password: 'secreto1' }) });
    const cookie = cookieOf(r0);
    const dbB = new DatabaseSync(path.join(tmpDirB, 'posta.db'));
    const uB = dbB.prepare('SELECT id FROM users WHERE email = ?').get('duda-base@example.com');
    dbB.close();
    // El fundamento se siembra con el client-digest DE LA BASE: si la
    // base tampoco preguntara con fundamento idéntico, el contraste es
    // del lote y no del dato.
    const cdBase = require(path.join(baseDir, 'client-digest.js'));
    const dbB2 = new DatabaseSync(path.join(tmpDirB, 'posta.db'));
    try { cdBase.saveDigest(dbB2, uB.id, DIG_PANADERIA); } finally { dbB2.close(); }
    const upF = await fetch(BASEB + '/api/album/photo', { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: pngDeColor('black') });
    const upJ = await J(upF);
    const r = await J(await fetch(BASEB + '/api/subir/resolver', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ asset_id: upJ.id, cuando: 'posty', promo: 'desc', mejora: 'no', caption_modo: 'posty', extra: 'quiero que anuncien la promo del finde en el local' }) }));
    t('C1 en la base el mismo pedido nace en revisión pero SIN pregunta', r.ok && r.modo === 'pedido_revision' && !('duda' in r), JSON.stringify(r).slice(0, 200));
    const rResp = await fetch(BASEB + '/api/subir/pedidos-voz/' + (r.pedido_id || 0) + '/respuesta', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ opcion: 'otra' }) });
    t('C2 en la base el endpoint de respuesta no existe (404)', rResp.status === 404, 'status=' + rResp.status);
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
  }
}

(async () => {
  parteA();
  await parteB();
  await parteC();
  console.log(`\n== test-lote-pedido-voz-duda: ${ok} ok · ${mal} mal ==`);
  process.exit(mal ? 1 : 0);
})();
