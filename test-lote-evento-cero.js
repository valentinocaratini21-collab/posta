// test-lote-evento-cero.js — LOTE EVENTO + PEDIDO DE CERO (extensión
// de Subir; decisión Valentino 13/11 15:33 «dale, armalo asi»).
//
// Cubre: evento con flyer (lectura del nombre — sin clave de IA el
// camino honesto devuelve sin_motor y el nombre lo confirma el
// cliente; cero tipeo extra) · evento sin flyer (sin nombre no hay
// posteo) · pedido de cero con datos incompletos (pregunta lo que
// falta, no inventa; sin confirmación no construye) · la cara
// aportada se COMPONE como foto (muestreo de píxeles: entra tal
// cual) + puerta dura estática (ningún camino del lote manda la
// cara a generación/redibujo) · foto que llega después (se suma al
// mismo posteo) · sin foto (fotos reales del negocio) · cadencia
// (desplaza el posteo de Posty y lo dice; día del cliente = freno)
// · grilla en la fecha futura con su rótulo · gate M78.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = 35141;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = '/tmp/ev-suite-' + process.pid;
const TZ = 'America/Argentina/Buenos_Aires';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + String(extra).slice(0, 300) : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);

const ymdIn = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const todayK = ymdIn(new Date());
const shift = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at19 = (k) => k + 'T22:00:00.000Z'; // 19:00 en Buenos Aires (UTC-3)
const DIA_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaNombreDe = (k) => DIA_ES[new Date(k + 'T12:00:00Z').getUTCDay()];

function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const markers = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '];
  let end = src.length;
  for (const m of markers) {
    const j = src.indexOf(m, i + 10);
    if (j > 0 && j < end) end = j;
  }
  return src.slice(i, end);
}

// Muestreo de color medio de una región de una imagen (PIL vía python3,
// sin shell: el path y la región viajan como argv).
function colorMedio(file, x0, y0, x1, y1) {
  const code = 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB")\nim = im.crop((int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))).resize((8, 8))\npx = list(im.getdata())\nn = len(px)\nprint(int(sum(p[0] for p in px)/n), int(sum(p[1] for p in px)/n), int(sum(p[2] for p in px)/n))';
  const out = require('child_process').execFileSync('python3', ['-c', code, file, String(x0), String(y0), String(x1), String(y1)]).toString().trim().split(/\s+/).map(Number);
  return out;
}
const cerca = (rgb, hex, tol) => {
  const c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  return rgb.every((v, i) => Math.abs(v - c[i]) <= tol);
};

// ================= Parte A: estática =================
{
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');

  t('A1 endpoints nuevos en server', ['/api/subir/evento/leer-nombre', '/api/subir/evento/crear', '/api/subir/cero/entender', '/api/subir/cero/crear', '/api/subir/evento/sumar-cara'].every((e) => has(srv, e)));
  t('A2 tabla subir_pedidos + require de subir-evento', has(srv, 'CREATE TABLE IF NOT EXISTS subir_pedidos') && has(srv, "require('./subir-evento')"));

  // PUERTA DURA DE LA CARA: el bloque del lote en server.js no conoce
  // ningún camino de generación/redibujo de imágenes; la única visión
  // es la lectura del nombre del flyer (OCR de texto, nunca la cara).
  const blk = srv.slice(srv.indexOf('LOTE EVENTO + PEDIDO DE CERO'), srv.indexOf('// GET /api/posts/dias-libres'));
  const prohibidos = ['enhancePhotoGenerate', 'generateDemoPieceImage', 'conceptShot', 'genArt(', 'enhance-image', 'photo-restyle', 'photo-enhance', 'images/generations', 'subirCaraGenerada'];
  t('A3 puerta dura: el bloque del lote NO pasa la cara a ningún generador', blk.length > 1000 && prohibidos.every((p) => !has(blk, p)), prohibidos.filter((p) => has(blk, p)).join(','));
  t('A4 el compositor es PIL puro (compose, no generate)', (() => {
    const py = fs.readFileSync(path.join(ROOT, 'evento-compose.py'), 'utf8');
    return has(py, 'from PIL import') && !/openai|fal\.|gemini|requests|urllib/i.test(py);
  })());
  t('A5 el parser de la idea es determinístico y sin red', (() => {
    const m = fs.readFileSync(path.join(ROOT, 'subir-evento.js'), 'utf8');
    return has(m, 'function parseIdea') && !/fetch|openai|https?:\/\//i.test(m);
  })());

  t('A6 tarjetas nuevas en Subir + pregunta exacta del evento', has(app, 'id="pzEvCard"') && has(app, 'id="pzCeroCard"') && has(app, '¿Es un evento con fecha?') && has(app, 'id="pzEvCal"') && has(app, 'data-ev-es="si"'));
  {
    const vista = app.slice(app.indexOf('function subirView()'), app.indexOf('async function pzSubirUpload'));
    const texts = (vista.match(/type="text"/g) || []).length;
    t('A7 UN SOLO campo tipeado en todo el flujo de Subir (el nombre del evento)', texts === 1 && has(vista, 'id="pzEvNombre"'), 'type=text: ' + texts);
  }
  t('A8 la idea de cero entra libre: textarea + tira de voz propia', has(app, 'id="pzCeroIdea"') && has(app, 'data-pz-voz="cero"') && has(app, "taCero.value = text") && has(app, "key === 'extra' || key === 'cero'"));
  t('A9 M78: funciones del lote definidas en el bundle', ['pzEvCalPintar', 'pzEvFechaLinda', 'pzEvErr', 'pzCeroErr', 'pzEvReciboPintar', 'pzEvSubirArchivo', 'pzEvSyncFlyer', 'pzEvLeerNombre', 'pzEvCaraElegida', 'pzEvCrear', 'pzCeroEntender', 'pzCeroFilaDato', 'pzCeroConfPintar', 'pzCeroCrear', 'bindEventoCero', 'pzEvCalDelegar'].every((f) => app.includes('function ' + f + '(')));
  t('A10 estados nuevos reseteados al abrir Subir y bind atado', has(app, 'PZ_EVENTO.es = false') && has(app, 'PZ_CERO.idea = ') && has(app, 'bindEventoCero();'));
  t('A11 estilos del calendario y de la confirmación de cero', has(css, '.pz-ev-cal') && has(css, '.pz-ev-dia') && has(css, '.pz-cero-fila') && has(css, 'LOTE EVENTO + PEDIDO DE CERO'));
  t('A12 pins del aterrizaje (RE-PIN del preparador con causa: el lote no re-estampaba sobre su base-fusión v1011; al componer sobre la base viva v1044 se estampa BUILD v1045 + app.js?v=713 + styles?v=20261281)', has(srv, "const BUILD_ID = '20261105-v1045';") && has(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), '/app.js?v=713') && has(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), '/styles.css?v=20261281'));
}

// ================= Parte B: el parser de la idea (módulo puro) =================
{
  const se = require(path.join(ROOT, 'subir-evento.js'));
  const fraseDJ = 'el ' + diaNombreDe(shift(todayK, 4)) + ' toca DJ Martín en el bar';
  const e1 = se.parseIdea(fraseDJ, todayK);
  t('B1 «el <día> toca DJ Martín» entiende quién, qué y día — sin inventar nada más', e1.quien === 'DJ Martín' && e1.que === 'DJ set' && e1.fechaISO === shift(todayK, 4) && e1.completo === true, JSON.stringify(e1));
  const e2 = se.parseIdea('algo lindo para mi gente', todayK);
  t('B2 idea vaga: faltan fecha, quién y qué — nada inventado', e2.fechaISO === null && e2.quien === '' && e2.que === '' && e2.faltantes.join(',') === 'fecha,quien,que' && e2.completo === false, JSON.stringify(e2));
  const e3 = se.parseIdea('quiero una fiesta el 22 de noviembre, se llama "Noche Blanca"', '2026-11-13');
  t('B3 nombre entre comillas + fecha con mes + tipo fiesta', e3.nombre === 'Noche Blanca' && e3.que === 'Fiesta' && e3.fechaISO === '2026-11-22', JSON.stringify(e3));
  const e4 = se.parseIdea('pasado mañana hay degustación de vinos', '2026-11-13');
  t('B4 «pasado mañana» + degustación', e4.fechaISO === '2026-11-15' && e4.que === 'Degustación', JSON.stringify(e4));
  t('B5 validarDatos: sin titular no hay posteo; fecha pasada frena', se.validarDatos({ nombre: '', que: '', fecha: '2026-11-20' }).error === 'sin_titular' && se.validarDatos({ nombre: 'X', fecha: '2026-11-13' }).error === 'fecha_pasada' && se.validarDatos({ nombre: 'X', fecha: '2026-11-20' }).ok === true);
  const cap = se.captionEvento({ nombre: '', que: 'Show en vivo', quien: 'DJ Martín', fechaISO: '2026-11-20' }, 'Bar Sur');
  t('B6 caption solo con datos confirmados', has(cap, 'Show en vivo con DJ Martín') && has(cap, 'Viernes 20 de noviembre') && has(cap, 'Bar Sur'), cap);
}

// ================= Parte C: servidor real =================
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
function cookieOf(res) { const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []; return sc.map((c) => c.split(';')[0]).join('; '); }
function pngDeColor(color, size) {
  const f = path.join(tmpDir, 'up-' + color + '-' + (size || '48') + '.png');
  try { execSync(`ffmpeg -y -v error -f lavfi -i color=c=${color}:s=${size || 48}x${size || 48} -frames:v 1 "${f}"`); return fs.readFileSync(f); }
  catch (e) { return null; }
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: 'adm-ev', SUPERVISION_HOOK_URL: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  const J = (r) => r.json().catch(() => ({}));
  const post = (url, body, cookie) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
  const get = (url, cookie) => fetch(BASE + url, { headers: { ...(cookie ? { cookie } : {}) } });
  async function register(email) {
    const r = await post('/api/auth/register', { email, password: 'secreto1' });
    const cookie = cookieOf(r);
    const db = dbOpen();
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    db.close();
    return { cookie, uid: u && u.id, status: r.status };
  }
  async function upload(cookie, buf) {
    const r = await fetch(BASE + '/api/album/photo', { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: buf });
    return { status: r.status, body: await J(r) };
  }
  function seedPost(uid, o) {
    const db = dbOpen();
    const info = db.prepare(`INSERT INTO posts (user_id, caption, image_path, media_type, status, scheduled_at, source, client_photo, approval, created_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(uid, o.caption || 'Semilla', o.image || '/media/seed.jpg', o.media || 'image', o.status || 'scheduled', o.at, o.source || 'trial', o.client ? 1 : 0, o.approval || 'pending');
    db.close();
    return Number(info.lastInsertRowid);
  }
  function postRow(id) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE id = ?').get(id); db.close(); return r; }
  function postsOf(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }
  function pedidoDe(postId) { const db = dbOpen(); const r = db.prepare('SELECT * FROM subir_pedidos WHERE post_id = ?').get(postId); db.close(); return r; }
  const mediaFile = (p) => path.join(tmpDir, String(p || '').replace(/^\//, ''));

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) { try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {} if (!up) await new Promise((r) => setTimeout(r, 1000)); }
    t('C0 server booteó', up, log.slice(-300));
    if (!up) return;

    const F3 = shift(todayK, 3), F2 = shift(todayK, 2), F4 = shift(todayK, 4);

    // --- Evento con flyer: lectura honesta sin motor + confirmación ---
    const u1 = await register('ev-u1@example.com');
    const flyer = await upload(u1.cookie, pngDeColor('0x7a3b8f', 300));
    t('C1 subida del flyer', flyer.status === 200 && flyer.body.ok && !!flyer.body.id, JSON.stringify(flyer.body).slice(0, 140));
    const rLeer = await J(await post('/api/subir/evento/leer-nombre', { asset_id: flyer.body.id }, u1.cookie));
    t('C2 leer-nombre sin clave de IA: camino honesto (sin_motor, nombre null) — el cliente escribe el nombre', rLeer.ok === true && rLeer.nombre === null && rLeer.sin_motor === true, JSON.stringify(rLeer).slice(0, 140));
    const rEv = await J(await post('/api/subir/evento/crear', { asset_id: flyer.body.id, nombre: 'Noche Blanca', fecha: F3 }, u1.cookie));
    t('C3 evento creado con el nombre confirmado: posteo + rótulo de día y 19:00', rEv.ok === true && !!rEv.post_id && !!rEv.dia_label && rEv.hora === '19:00' && !rEv.desplazado, JSON.stringify(rEv).slice(0, 200));
    const pEv = rEv.post_id ? postRow(rEv.post_id) : null;
    t('C4 el posteo: source=subir, marca Nuevo, draft, en la fecha del evento a las 19:00, flyer compuesto en disco', !!pEv && pEv.source === 'subir' && Number(pEv.subir_nuevo) === 1 && pEv.status === 'draft' && ymdIn(new Date(pEv.scheduled_at)) === F3 && has(pEv.image_path, '/media/') && fs.existsSync(mediaFile(pEv.image_path)), JSON.stringify(pEv).slice(0, 220));
    const ped = rEv.post_id ? pedidoDe(rEv.post_id) : null;
    t('C5 el pedido quedó registrado (tipo evento, estado posteado, nombre y fecha)', !!ped && ped.tipo === 'evento' && ped.estado === 'posteado' && ped.nombre === 'Noche Blanca' && ped.fecha === F3, JSON.stringify(ped).slice(0, 160));

    // --- Evento sin flyer y sin nombre: no hay posteo ---
    const antes = postsOf(u1.uid).length;
    const rSin = await post('/api/subir/evento/crear', { nombre: '', fecha: F4 }, u1.cookie);
    const jSin = await J(rSin);
    t('C6 sin nombre no hay posteo (400 sin_titular, cero efectos)', rSin.status === 400 && jSin.codigo === 'sin_titular' && postsOf(u1.uid).length === antes, `status=${rSin.status} ${JSON.stringify(jSin).slice(0, 120)}`);

    // --- Cadencia: el día del evento desplaza el posteo de Posty y lo dice ---
    const u2 = await register('ev-u2@example.com');
    const occId = seedPost(u2.uid, { at: at19(F2), source: 'trial', client: 0, caption: 'Posteo de Posty', status: 'scheduled' });
    const rCad = await J(await post('/api/subir/evento/crear', { nombre: 'Fiesta del Bar', fecha: F2 }, u2.cookie));
    const pCad = rCad.post_id ? postRow(rCad.post_id) : null;
    const occDesp = postRow(occId);
    t('C7 cadencia: el evento entra en SU día y el de Posty se movió a otro día (respuesta lo dice)', rCad.ok === true && !!rCad.desplazado && rCad.desplazado.post_id === occId && !!pCad && ymdIn(new Date(pCad.scheduled_at)) === F2 && !!occDesp && ymdIn(new Date(occDesp.scheduled_at)) !== F2, JSON.stringify(rCad).slice(0, 220));

    // --- Día ocupado por material del cliente: freno honesto ---
    const u3 = await register('ev-u3@example.com');
    seedPost(u3.uid, { at: at19(F2), source: 'album-armado', client: 1, caption: 'Del cliente', status: 'draft' });
    const rTuyo = await post('/api/subir/evento/crear', { nombre: 'Otro Evento', fecha: F2 }, u3.cookie);
    const jTuyo = await J(rTuyo);
    t('C8 día tomado por el cliente: 409 dia_tuyo y nada se crea ni se mueve', rTuyo.status === 409 && jTuyo.codigo === 'dia_tuyo' && postsOf(u3.uid).length === 1, `status=${rTuyo.status}`);

    // --- Pedido de cero: incompleto pregunta, no inventa; sin datos no construye ---
    const fraseDJ = 'el ' + diaNombreDe(F4) + ' toca DJ Martín en el bar';
    const rEnt0 = await J(await post('/api/subir/cero/entender', { idea: 'algo lindo para mi gente' }, u1.cookie));
    t('C9 cero incompleto: lo entendido vuelve con faltantes (fecha y qué), completo=false', rEnt0.ok === true && rEnt0.entendido.completo === false && rEnt0.entendido.faltantes.includes('fecha') && rEnt0.entendido.faltantes.includes('que') && postsOf(u1.uid).length === antes, JSON.stringify(rEnt0.entendido || {}).slice(0, 200));
    const rCeroSin = await post('/api/subir/cero/crear', { que: 'Fiesta' }, u1.cookie);
    const jCeroSin = await J(rCeroSin);
    t('C10 cero sin fecha confirmada: 400 fecha_ausente y cero posteos nuevos', rCeroSin.status === 400 && jCeroSin.codigo === 'fecha_ausente' && postsOf(u1.uid).length === antes, `status=${rCeroSin.status}`);
    const rEnt = await J(await post('/api/subir/cero/entender', { idea: fraseDJ }, u1.cookie));
    t('C11 cero completo: entiende quién (DJ Martín), qué (DJ set) y el día', rEnt.ok === true && rEnt.entendido.quien === 'DJ Martín' && rEnt.entendido.que === 'DJ set' && rEnt.entendido.fechaISO === F4, JSON.stringify(rEnt.entendido || {}).slice(0, 200));
    const rCero = await J(await post('/api/subir/cero/crear', { quien: rEnt.entendido.quien, que: rEnt.entendido.que, fecha: rEnt.entendido.fechaISO }, u1.cookie));
    const pCero = rCero.post_id ? postRow(rCero.post_id) : null;
    t('C12 cero confirmado crea el posteo en el día, con el quién en el caption', rCero.ok === true && !!pCero && ymdIn(new Date(pCero.scheduled_at)) === F4 && has(pCero.caption, 'DJ Martín') && pCero.source === 'subir', JSON.stringify(rCero).slice(0, 180));

    // --- La cara aportada: compuesta como foto (píxeles intactos) ---
    const u4 = await register('ev-u4@example.com');
    const fotoNeg = await upload(u4.cookie, pngDeColor('0xb03030', 300));
    const cara = await upload(u4.cookie, pngDeColor('0x2255aa', 300));
    const rCara = await J(await post('/api/subir/evento/crear', { nombre: 'Noche del DJ', fecha: F3, cara_asset_id: cara.body.id }, u4.cookie));
    const pCara = rCara.post_id ? postRow(rCara.post_id) : null;
    t('C13 evento con cara aportada: posteo creado y foto_asset_id = la cara', rCara.ok === true && !!pCara && Number(pCara.foto_asset_id) === Number(cara.body.id), JSON.stringify(rCara).slice(0, 160));
    // El rectángulo de la persona en el flyer 1080x1350: x 90..990, y 702..1262.
    const rgbCara = pCara ? colorMedio(mediaFile(pCara.image_path), 400, 900, 680, 1060) : [0, 0, 0];
    t('C14 la cara entra COMO FOTO: el bloque del flyer es el color exacto de la foto aportada (no redibujada)', cerca(rgbCara, '#2255aa', 26), 'rgb=' + rgbCara.join(','));

    // --- Foto que llega DESPUÉS: se suma al mismo posteo ---
    const u5 = await register('ev-u5@example.com');
    await upload(u5.cookie, pngDeColor('0x3a7d44', 300));
    const rTarde0 = await J(await post('/api/subir/evento/crear', { nombre: 'Show del Viernes', fecha: F4 }, u5.cookie));
    const pTarde0 = rTarde0.post_id ? postRow(rTarde0.post_id) : null;
    const caraTarde = await upload(u5.cookie, pngDeColor('0x2255aa', 300));
    const rTarde = await J(await post('/api/subir/evento/sumar-cara', { post_id: rTarde0.post_id, asset_id: caraTarde.body.id }, u5.cookie));
    const pTarde = postRow(rTarde0.post_id);
    t('C15 foto tardía: MISMO posteo, imagen recompuesta y la anterior guardada', rTarde.ok === true && rTarde.post_id === rTarde0.post_id && !!pTarde && pTarde.image_path !== pTarde0.image_path && pTarde.prev_image_path === pTarde0.image_path && postsOf(u5.uid).length === 1, JSON.stringify(rTarde).slice(0, 160));
    const rgbTarde = colorMedio(mediaFile(pTarde.image_path), 400, 900, 680, 1060);
    t('C16 el flyer recompuesto lleva la foto tardía como bloque fotográfico', cerca(rgbTarde, '#2255aa', 26), 'rgb=' + rgbTarde.join(','));

    // --- Sin foto de persona: flyer con las fotos reales del negocio ---
    const u6 = await register('ev-u6@example.com');
    await upload(u6.cookie, pngDeColor('0xb03030', 300));
    await upload(u6.cookie, pngDeColor('0x2e8b57', 300));
    const rSinFoto = await J(await post('/api/subir/evento/crear', { nombre: 'Fiesta de la Cosecha', fecha: F3 }, u6.cookie));
    const pSinFoto = rSinFoto.post_id ? postRow(rSinFoto.post_id) : null;
    t('C17 sin cara: el flyer se compone con las fotos del negocio (archivo en disco)', rSinFoto.ok === true && !!pSinFoto && fs.existsSync(mediaFile(pSinFoto.image_path)), JSON.stringify(rSinFoto).slice(0, 160));
    // Banda inferior del flyer sin persona = segunda foto del negocio.
    const rgbBanda = pSinFoto ? colorMedio(mediaFile(pSinFoto.image_path), 300, 1150, 780, 1300) : [0, 0, 0];
    t('C18 la banda inferior es la segunda foto REAL del negocio', cerca(rgbBanda, '#2e8b57', 30), 'rgb=' + rgbBanda.join(','));

    // --- Grilla: el posteo del evento en su fecha futura con su rótulo ---
    {
      const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
      const sandbox = {
        console, setTimeout, clearTimeout, sessionStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        ME: { lang: 'es' }, PROFILE: {},
        esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        mv: (p) => String(p || ''), pzIc: (n) => '<i data-ic="' + n + '"></i>', gzT: (es) => es, pcTz: () => TZ,
        pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
        schedDayKeyOf: (d, tz) => d.toLocaleDateString('en-CA', { timeZone: tz || TZ }),
        pzHoyCuandoCorto: () => '', pzHoyCuentaSaleTxt: () => '', pzHoyPillSalida: () => 'Se postea el viernes · 19:00',
        pzRitualPendiente: () => true, pzProximoYaAbierto: () => false, pzRitualSelLeer: () => 0,
        hfIgShortcode: () => null, hfFeedSortKey: (tt) => tt.post ? String(tt.post.scheduled_at || tt.post.published_at || '') : '', hfCmpDescKey: (a, b) => String(b).localeCompare(String(a)),
        document: { getElementById: () => null, querySelectorAll: () => [] }, window: {}, navigator: {},
      };
      vm.createContext(sandbox);
      let okLoad = true;
      for (const f of ['pzVozEn', 'homeGridCompose', 'homeTileHTML']) { const src = extractFn(app, f); if (!src) { okLoad = false; } else { try { vm.runInContext(src, sandbox); } catch (e) { okLoad = false; } } }
      vm.runInContext(`hfCoverState = () => ({ has: false }); hfWhenChip = () => 'vie · 19:00'; hfTileChipParts = () => null; pzAprobadoEs = () => false; pzDiaEsFutura = () => false; HOME_PIN_SVG=''; HOME_REEL_SVG=''; HOME_CAR_SVG='';`, sandbox);
      const evRow = { id: pEv.id, status: pEv.status, source: 'subir', media_type: 'image', image_path: pEv.image_path, caption: pEv.caption, scheduled_at: pEv.scheduled_at, subir_nuevo: 1 };
      const tiles = vm.runInContext(`homeGridCompose({ upcoming: [{ p: ${JSON.stringify(evRow)}, ymd: '${F3}' }], published: [], recents: [], all: [] })`, sandbox);
      const tile = tiles.find((x) => x.post && x.post.id === pEv.id);
      const tileHtml = tile ? vm.runInContext(`homeTileHTML(${JSON.stringify(tile)}, 1)`, sandbox) : '';
      t('C19 grilla: el evento rinde en su fecha futura con marca Nuevo y rótulo «Se postea…»', okLoad && !!tile && tile.subir === true && has(tileHtml, 'hf-nuevo-badge') && has(tileHtml, 'Se postea el viernes · 19:00'), String(tileHtml).slice(0, 180));
    }

    // --- El día del evento deja de estar libre ---
    const dl = await J(await get('/api/posts/dias-libres', u2.cookie));
    t('C20 dias-libres: el día del evento ya no figura libre', dl.ok === true && Array.isArray(dl.dias) && !dl.dias.some((d) => (d.fecha || d.ymd || d) === F2), JSON.stringify(dl).slice(0, 160));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
  }
  console.log(`\n=== EVENTO-CERO: ${pass} pass / ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
