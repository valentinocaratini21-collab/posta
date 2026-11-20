// Suite LOTE SUBIR-VOZ-PRIMERO (20/11) — la pestaña Subir sin
// preguntas, el material primero, la pregunta pegada con voz primero,
// la confirmación «Entendí esto» y la cola que se corre.
//
// Parte A: fuente (la tarjeta permanente de fecha salió; la pregunta
//   nueva y las rutas existen) + unit del módulo puro
//   subir-voz-primero (los ejemplos de los mocks aprobados).
// Parte B: boot real con DATA_DIR temporal — flujo entero, el
//   desplazamiento de punta a punta con deshacer, los tres casos
//   borde, sin respuesta = nada asentado, las guardas (día con stop
//   no resucita · cuenta de la casa sin movimiento automático ·
//   cuenta frenada), lo ambiguo a revisión y el lote de 2 piezas.
// Parte C: control contra el árbol base (endpoints 404, la tarjeta
//   de fecha sigue en la base).
//
// La transcripción se inyecta como TEXTO: el caño Whisper vivo es
// /api/ideas/transcribe (probado por su propia familia); acá se
// prueba lo que este lote construye — parseo, plan, asiento, recibo.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE_DIR = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
const PORT = 35241, PORTB = 35242, PORTH = 35243, PORTV = 35244;
const BASE = `http://127.0.0.1:${PORT}`, BASEB = `http://127.0.0.1:${PORTB}`, BASEH = `http://127.0.0.1:${PORTH}`, BASEV = `http://127.0.0.1:${PORTV}`;
const ADMIN = 'adm-vp';
const tmpDir = '/tmp/posta-vp-' + process.pid;
const tmpDirB = '/tmp/posta-vp-base-' + process.pid;
const tmpDirH = '/tmp/posta-vp-house-' + process.pid;
const tmpDirV = '/tmp/posta-vp-video-' + process.pid;

let ok = 0, mal = 0;
function t(name, cond, extra) { if (cond) { ok++; console.log('  ok', name); } else { mal++; console.log('  MAL', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); } }
const has = (s, x) => String(s || '').includes(x);

// ---------- ventana horaria determinística (patrón de la familia) ----------
const TZ_CANDIDATAS = ['Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Karachi', 'Europe/Madrid', 'Europe/London', 'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/New_York', 'America/Mexico_City', 'America/Los_Angeles', 'Pacific/Honolulu'];
function partesEn(tz, date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date || new Date());
  const o = {}; for (const x of p) o[x.type] = x.value;
  return o;
}
function ymdEn(tz, date) { const o = partesEn(tz, date); return `${o.year}-${o.month}-${o.day}`; }
function elegirTz() {
  for (const tz of TZ_CANDIDATAS) {
    const o = partesEn(tz);
    const hora = Number(o.hour) % 24;
    const wd = new Date(Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day))).getUTCDay();
    if (hora >= 7 && hora <= 14 && wd >= 1 && wd <= 6) return tz;
  }
  return null;
}
const TZ = elegirTz();
const todayK = TZ ? ymdEn(TZ) : null;
function shift(k, n) { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(k) { const wd = new Date(k + 'T12:00:00Z').getUTCDay(); return shift(k, -((wd + 6) % 7)); }
const sundayK = todayK ? shift(mondayOf(todayK), 6) : null;
const ymdIn = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const horaIn = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
function zonedIso(ymd, hhmm, tz) {
  const [Y, M, D] = ymd.split('-').map(Number); const [H, Mi] = hhmm.split(':').map(Number);
  let guess = Date.UTC(Y, M - 1, D, H, Mi);
  for (let i = 0; i < 4; i++) {
    const o = partesEn(tz, new Date(guess));
    const wallAsUtc = Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour) % 24, Number(o.minute));
    const diff = Date.UTC(Y, M - 1, D, H, Mi) - wallAsUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess).toISOString();
}
const at19 = (k) => zonedIso(k, '19:00', TZ);

// ================= Parte A =================
function parteA() {
  console.log('— A · fuente + módulo puro —');
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const dbjs = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  t('A1 la tarjeta permanente «¿Tenés una fecha especial?» salió de la pestaña', !has(app, 'id="pzEvCard"') && !has(app, 'id="pzCeroCard"') && !has(app, 'id="pzSubirPreg"') && !has(app, 'id="pzSubirListo"'));
  t('A2 la pregunta pegada existe (pzVpCard + micrófono protagonista)', has(app, 'id="pzVpCard"') && has(app, 'pzVpMic') && has(app, 'pzVpMostrarPregunta'));
  t('A3 queda solo la fila de la idea por voz además de la zona', has(app, 'id="pzSubirVozOp"') && has(app, 'id="pzVpMaterial"'));
  t('A4 las 4 rutas del lote existen en el servidor', has(srv, "'/api/subir/voz/entender'") && has(srv, "'/api/subir/voz/confirmar'") && has(srv, "'/api/subir/voz/deshacer'") && has(srv, "'/api/subir/recibos'"));
  t('A5 la tabla de recibos existe', has(dbjs, 'CREATE TABLE IF NOT EXISTS subir_recibos'));
  t('A6 la costura con la doctrina de voz está en el código (ambiguo → subirPedidoCrear)', has(srv, 'subirPedidoCrear(uid, first, kind, transcript'));

  const M = require(path.join(ROOT, 'subir-voz-primero.js'));
  const HOY = '2026-11-20'; // viernes (día de los mocks)
  const e1 = M.parseNotaVoz('Es el aniversario de casados de mis viejos, el 12 de diciembre. No lo anuncies hasta el lunes.', { hoy: HOY, lang: 'es', kind: 'foto' });
  t('A7 mock aniversario: fecha concreta + motivo + condición', e1.intencion === 'fecha' && e1.fechaISO === '2026-12-12' && e1.motivo === 'Aniversario' && e1.condiciones.length === 1 && /lunes/i.test(e1.condiciones[0]), JSON.stringify(e1));
  const e2 = M.parseNotaVoz('Este video es de la inauguración, es el sábado que viene, dejalo tal cual con su sonido', { hoy: HOY, lang: 'es', kind: 'video' });
  t('A8 mock inauguración: «el sábado que viene» = 2026-11-28 + tal cual', e2.intencion === 'fecha' && e2.fechaISO === '2026-11-28' && e2.motivo === 'Inauguración' && e2.tratamiento === 'tal_cual', JSON.stringify(e2));
  const e3 = M.parseNotaVoz('subila hoy', { hoy: HOY, lang: 'es', kind: 'foto' });
  t('A9 mock hoy: intención hoy, sin ambigüedad (el servidor resuelve «hoy» en su zona)', e3.intencion === 'hoy' && e3.ambiguo === false, JSON.stringify(e3));
  const e4 = M.parseNotaVoz('mirá, esto es para cuando puedas, vemos', { hoy: HOY, lang: 'es', kind: 'foto' });
  t('A10 lo vago es ambiguo (cae a revisión, no se asienta)', e4.ambiguo === true, JSON.stringify(e4));
  const e5 = M.parseNotaVoz('usala en mis posteos, es el aniversario el 12 de diciembre', { hoy: HOY, lang: 'es', kind: 'foto' });
  t('A11 la instrucción explícita gana al motivo implícito', e5.intencion === 'posteos' && e5.motivo === 'Aniversario' && e5.fechaISO === '2026-12-12', JSON.stringify(e5));
  const e6 = M.parseNotaVoz("This is for our anniversary, December 12. Don't announce it until Monday.", { hoy: HOY, lang: 'en', kind: 'foto' });
  t('A12 EN: fecha + motivo + condición', e6.intencion === 'fecha' && e6.fechaISO === '2026-12-12' && e6.motivo === 'Aniversario' && e6.condiciones.length === 1, JSON.stringify(e6));
  const e7 = M.parseNotaVoz('es una fecha especial', { hoy: HOY, lang: 'es', kind: 'foto' });
  t('A13 fecha sin día: faltante fecha, no se adivina', e7.intencion === 'fecha' && !e7.fechaISO && e7.faltantes.includes('fecha'), JSON.stringify(e7));
  const e8 = M.parseNotaVoz('este video es para el cumpleaños, mañana', { hoy: HOY, lang: 'es', kind: 'video' });
  t('A14 video sin tratamiento claro: faltante tratamiento', e8.faltantes.includes('tratamiento') && e8.fechaISO === '2026-11-21', JSON.stringify(e8));
}

// ================= Boot + lados =================
function boot(root, port, dir, extraEnv) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: ADMIN, SUPERVISION_HOOK_URL: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules', ...(extraEnv || {}) },
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function makeSide(baseUrl, dir) {
  const dbOpen = () => new DatabaseSync(path.join(dir, 'posta.db'));
  const J = (r) => r.json().catch(() => ({}));
  const post = (url, body, cookie) => fetch(baseUrl + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
  const get = (url, cookie) => fetch(baseUrl + url, { headers: { ...(cookie ? { cookie } : {}) } });
  function cookieOf(res) { const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []; return sc.map((c) => c.split(';')[0]).join('; '); }
  async function register(email) {
    const r = await post('/api/auth/register', { email, password: 'secreto1' });
    const cookie = cookieOf(r);
    const db = dbOpen(); const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const uid = u && u.id;
    // El perfil con su IG reproduce el estado real de un cliente que
    // ya pasó el onboarding: sin fila en profiles, la guarda
    // esCuentaPropia (fail-closed por diseño) trata a CUALQUIER
    // cuenta de un boot fresco como dudosa — en producción la fila
    // existe y la guarda resuelve por el handle.
    if (uid) { db.prepare('INSERT OR IGNORE INTO settings (user_id) VALUES (?)').run(uid); db.prepare('UPDATE settings SET timezone = ? WHERE user_id = ?').run(TZ, uid); db.prepare('INSERT OR IGNORE INTO profiles (user_id, ig_username) VALUES (?, ?)').run(uid, 'negocio.prueba'); }
    db.close();
    return { cookie, uid };
  }
  async function upload(cookie, buf, ct) {
    const r = await fetch(baseUrl + '/api/album/photo', { method: 'POST', headers: { 'content-type': ct || 'image/png', cookie }, body: buf || PNG });
    return { status: r.status, body: await J(r) };
  }
  const entender = (cookie, assetIds, transcript) => post('/api/subir/voz/entender', { asset_ids: assetIds, transcript }, cookie).then(J);
  const confirmar = (cookie, body) => post('/api/subir/voz/confirmar', body, cookie).then(J);
  const deshacer = (cookie, reciboId) => post('/api/subir/voz/deshacer', { recibo_id: reciboId }, cookie).then(J);
  const recibos = (cookie) => get('/api/subir/recibos', cookie).then(J);
  function postsOf(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }
  function recibosDb(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM subir_recibos WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }
  function pedidosDb(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM subir_pedidos_voz WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }
  function seedPost(uid, o) {
    const db = dbOpen();
    const info = db.prepare(`INSERT INTO posts (user_id, caption, image_path, media_type, status, scheduled_at, published_at, source, client_photo, approval, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(uid, o.caption || 'Semilla', '/media/seed.jpg', o.media || 'image', o.status || 'scheduled', o.at, o.published_at || null, o.source || 'trial', o.client ? 1 : 0, 'pending');
    db.close();
    return Number(info.lastInsertRowid);
  }
  function dbRun(sql, ...args) { const db = dbOpen(); db.prepare(sql).run(...args); db.close(); }
  return { register, upload, entender, confirmar, deshacer, recibos, postsOf, recibosDb, pedidosDb, seedPost, dbRun, post, get, J };
}

// ================= Parte B =================
async function parteB() {
  console.log('— B · flujo real (release) —');
  if (!TZ) { t('B0 ventana determinística', false, 'sin tz candidata'); return; }
  t('B0 ventana determinística (7–14h, lun–sáb)', true, 'tz=' + TZ + ' hoy=' + todayK + ' domingo=' + sundayK);
  const { srv, getLog } = boot(ROOT, PORT, tmpDir);
  const S = makeSide(BASE, tmpDir);
  try {
    const up = await waitUp(BASE);
    t('B1 server booteó', up, getLog().slice(-300));
    if (!up) return;

    // B2 · el flujo entero: foto → pregunta → nota → confirmación con
    // fecha concreta → «Va así» → posteo + recibo.
    const u1 = await S.register('vp-u1@example.com');
    const up1 = await S.upload(u1.cookie);
    t('B2.1 la foto se guarda primero (sin preguntas)', up1.status === 200 && up1.body.ok && !!up1.body.id, JSON.stringify(up1.body).slice(0, 160));
    const notaAniv = 'Es el aniversario de casados de mis viejos, el 12 de diciembre. No lo anuncies hasta el lunes.';
    const ent1 = await S.entender(u1.cookie, [up1.body.id], notaAniv);
    t('B2.2 entender: fecha concreta 2026-12-12 + motivo + condición', ent1.ok && ent1.entendido.fechaISO === '2026-12-12' && ent1.entendido.motivo === 'Aniversario' && ent1.entendido.condiciones.length === 1, JSON.stringify(ent1).slice(0, 260));
    t('B2.3 entender no escribe nada (0 posteos, 0 recibos)', S.postsOf(u1.uid).length === 0 && S.recibosDb(u1.uid).length === 0);
    const conf1 = await S.confirmar(u1.cookie, { asset_ids: [up1.body.id], transcript: notaAniv, caption_modo: 'mio', caption_text: 'Caption de la suite' });
    t('B2.4 «Va así» asienta: modo fecha + posteo creado', conf1.ok && conf1.modo === 'fecha' && !!conf1.post_id, JSON.stringify(conf1).slice(0, 260));
    const p1 = S.postsOf(u1.uid)[0];
    t('B2.5 el posteo cae el 12/12 a las 19:00', !!p1 && ymdIn(p1.scheduled_at) === '2026-12-12' && horaIn(p1.scheduled_at) === '19:00', p1 && p1.scheduled_at);
    const rec1 = await S.recibos(u1.cookie);
    t('B2.6 el recibo queda pegado en Tu material', rec1.ok && rec1.recibos.length === 1 && rec1.recibos[0].modo === 'fecha' && rec1.recibos[0].post_id === conf1.post_id, JSON.stringify(rec1).slice(0, 260));

    // B3 · el desplazamiento de punta a punta: semana llena, entra
    // hoy y la cola se corre sin perder ni duplicar; deshacer restaura.
    const u2 = await S.register('vp-u2@example.com');
    const semillas = [];
    for (let i = 0; i < 7; i++) semillas.push(S.seedPost(u2.uid, { at: at19(shift(todayK, i)) }));
    const up2 = await S.upload(u2.cookie);
    const ent2 = await S.entender(u2.cookie, [up2.body.id], 'subila hoy');
    t('B3.1 la confirmación DECLARA el desplazamiento (7 movimientos)', ent2.ok && ent2.plan && ent2.plan.movimientos.length === 7 && ent2.plan.movimientos[0].de_ymd === todayK && ent2.plan.movimientos[0].a_ymd === shift(todayK, 1), JSON.stringify(ent2.plan).slice(0, 260));
    const conf2 = await S.confirmar(u2.cookie, { asset_ids: [up2.body.id], transcript: 'subila hoy', caption_modo: 'mio', caption_text: 'Caption de la suite' });
    t('B3.2 confirmar hoy con semana llena: ok + 7 movimientos', conf2.ok && conf2.modo === 'hoy' && (conf2.movimientos || []).length === 7, JSON.stringify(conf2).slice(0, 260));
    const posts2 = S.postsOf(u2.uid).filter((p) => p.status === 'scheduled' || p.status === 'draft');
    const dias2 = posts2.map((p) => ymdIn(p.scheduled_at));
    t('B3.3 7/7 + el nuevo: 8 posteos, ningún día repetido, ninguno perdido', posts2.length === 8 && new Set(dias2).size === 8, dias2.join(','));
    const nuevo2 = posts2.find((p) => p.id === conf2.post_id);
    t('B3.4 lo subido ocupa hoy 19:00', !!nuevo2 && ymdIn(nuevo2.scheduled_at) === todayK && horaIn(nuevo2.scheduled_at) === '19:00', nuevo2 && nuevo2.scheduled_at);
    const corridoUltimo = posts2.find((p) => p.id === semillas[6]);
    t('B3.5 el último desplazado queda primero en la cola (un día tras el último día ocupado)', !!corridoUltimo && ymdIn(corridoUltimo.scheduled_at) === shift(todayK, 7), corridoUltimo && corridoUltimo.scheduled_at);
    const des2 = await S.deshacer(u2.cookie, conf2.recibo_id);
    const posts2b = S.postsOf(u2.uid);
    const restaurado = semillas.every((id, i) => { const p = posts2b.find((x) => x.id === id); return p && ymdIn(p.scheduled_at) === shift(todayK, i); });
    t('B3.6 deshacer restaura el plan anterior exacto', des2.ok && !posts2b.find((p) => p.id === conf2.post_id) && restaurado, JSON.stringify(des2).slice(0, 160));
    const rec2 = await S.recibos(u2.cookie);
    t('B3.7 el recibo deshecho sale de Tu material', rec2.ok && rec2.recibos.length === 0);

    // B4 · hoy sin posteo: ocupa sin desplazar.
    const u3 = await S.register('vp-u3@example.com');
    const up3 = await S.upload(u3.cookie);
    const conf3 = await S.confirmar(u3.cookie, { asset_ids: [up3.body.id], transcript: 'subila hoy', caption_modo: 'mio', caption_text: 'Caption de la suite' });
    const p3 = S.postsOf(u3.uid)[0];
    t('B4 hoy vacío: ocupa hoy sin movimientos', conf3.ok && (conf3.movimientos || []).length === 0 && !!p3 && ymdIn(p3.scheduled_at) === todayK, JSON.stringify(conf3).slice(0, 200));

    // B13 · Cambiar desde el recibo: el anterior se deshace y el
    // nuevo asienta (el posteo de hoy sale, la pieza queda material).
    const rec3 = await S.recibos(u3.cookie);
    const conf3b = await S.confirmar(u3.cookie, { asset_ids: [up3.body.id], transcript: 'mejor usala en mis posteos', recibo_id: rec3.recibos[0].id });
    const rec3b = S.recibosDb(u3.uid);
    t('B13 cambiar: recibo viejo reemplazado, posteo fuera, pieza como material', conf3b.ok && conf3b.modo === 'posteos' && S.postsOf(u3.uid).length === 0 && rec3b.filter((r) => r.estado === 'activo').length === 1 && rec3b.filter((r) => r.estado === 'reemplazado').length === 1, JSON.stringify(conf3b).slice(0, 200));

    // B5 · hoy ya publicado: la confirmación ofrece mañana.
    const u4 = await S.register('vp-u4@example.com');
    S.seedPost(u4.uid, { at: at19(todayK), status: 'published', published_at: new Date().toISOString() });
    const up4 = await S.upload(u4.cookie);
    const ent4 = await S.entender(u4.cookie, [up4.body.id], 'subila hoy');
    t('B5.1 hoy ya salió: el plan dice mañana (motivo ya_salio)', ent4.ok && ent4.plan && ent4.plan.motivo === 'ya_salio' && ent4.plan.insert_ymd === shift(todayK, 1), JSON.stringify(ent4.plan).slice(0, 200));
    const conf4 = await S.confirmar(u4.cookie, { asset_ids: [up4.body.id], transcript: 'subila hoy', caption_modo: 'mio', caption_text: 'Caption de la suite' });
    const p4 = S.postsOf(u4.uid).find((p) => p.id === conf4.post_id);
    t('B5.2 el nuevo cae mañana 19:00', conf4.ok && !!p4 && ymdIn(p4.scheduled_at) === shift(todayK, 1), p4 && p4.scheduled_at);

    // B6 · sin respuesta: material guardado y nada asentado.
    const u5 = await S.register('vp-u5@example.com');
    const up5 = await S.upload(u5.cookie);
    const rec5 = await S.recibos(u5.cookie);
    t('B6 sin respuesta: 0 posteos, 0 recibos, material guardado', up5.body.ok && S.postsOf(u5.uid).length === 0 && rec5.ok && rec5.recibos.length === 0);

    // B7 · guarda: el día con stop (descarte del dueño) no resucita:
    // la cola lo salta y el hueco queda vacío.
    const u6 = await S.register('vp-u6@example.com');
    const semilla6 = S.seedPost(u6.uid, { at: at19(todayK) });
    S.dbRun('INSERT INTO day_stops (user_id, day_key, origen) VALUES (?, ?, ?)', u6.uid, shift(todayK, 1), 'dueno_descarte');
    const up6 = await S.upload(u6.cookie);
    const conf6 = await S.confirmar(u6.cookie, { asset_ids: [up6.body.id], transcript: 'subila hoy', caption_modo: 'mio', caption_text: 'Caption de la suite' });
    const posts6 = S.postsOf(u6.uid);
    const movido6 = posts6.find((p) => p.id === semilla6);
    t('B7 la cola salta el día frenado: el de hoy cae pasado mañana y mañana queda vacío', conf6.ok && !!movido6 && ymdIn(movido6.scheduled_at) === shift(todayK, 2) && !posts6.find((p) => p.status !== 'published' && ymdIn(p.scheduled_at) === shift(todayK, 1)), String(JSON.stringify(conf6.movimientos || conf6)).slice(0, 200));

    // B9 · guarda: cuenta frenada (publishing_stopped) — la nota se
    // guarda, nada se programa.
    const u7 = await S.register('vp-u7@example.com');
    S.dbRun('UPDATE users SET publishing_stopped = 1 WHERE id = ?', u7.uid);
    const up7 = await S.upload(u7.cookie);
    const conf7 = await S.confirmar(u7.cookie, { asset_ids: [up7.body.id], transcript: 'subila hoy', caption_modo: 'mio', caption_text: 'Caption de la suite' });
    const rec7 = S.recibosDb(u7.uid);
    t('B9 cuenta frenada: recibo «frenado», 0 posteos', conf7.ok && conf7.modo === 'frenado' && S.postsOf(u7.uid).length === 0 && rec7.length === 1 && rec7[0].modo === 'frenado', JSON.stringify(conf7).slice(0, 200));

    // B10 · lo ambiguo cae a la revisión de siempre (la línea a mano).
    const u8 = await S.register('vp-u8@example.com');
    const up8 = await S.upload(u8.cookie);
    const ent8 = await S.entender(u8.cookie, [up8.body.id], 'mirá, esto es para cuando puedas, vemos');
    const conf8 = await S.confirmar(u8.cookie, { asset_ids: [up8.body.id], transcript: 'mirá, esto es para cuando puedas, vemos', intencion: 'revision' });
    const ped8 = S.pedidosDb(u8.uid);
    t('B10 ambiguo → revisión: pedido en la cola de siempre, 0 posteos', ent8.ok && ent8.entendido.ambiguo === true && conf8.ok && conf8.modo === 'revision' && ped8.length === 1 && ped8[0].estado === 'pendiente_revision' && S.postsOf(u8.uid).length === 0, JSON.stringify(conf8).slice(0, 200));

    // B14 · el chip «es una fecha» sobre una nota que decía posteos:
    // entender computa el plan para la intención del chip, así el
    // destino se declara en la confirmación igual que siempre.
    const u10 = await S.register('vp-u10@example.com');
    const up10 = await S.upload(u10.cookie);
    const ent10 = await S.post('/api/subir/voz/entender', { asset_ids: [up10.body.id], transcript: 'usala en mis posteos, es el aniversario el 12 de diciembre', intencion: 'fecha' }, u10.cookie).then(S.J);
    t('B14 chip fecha: entender declara el destino 2026-12-12', ent10.ok && ent10.entendido.intencion === 'fecha' && ent10.plan && ent10.plan.insert_ymd === '2026-12-12', JSON.stringify(ent10).slice(0, 220));

    // B11 · lote de 2 piezas, una sola pregunta.
    const u9 = await S.register('vp-u9@example.com');
    const up9a = await S.upload(u9.cookie);
    const up9b = await S.upload(u9.cookie);
    const conf9 = await S.confirmar(u9.cookie, { asset_ids: [up9a.body.id, up9b.body.id], transcript: 'usalas en mis posteos' });
    const rec9 = S.recibosDb(u9.uid);
    t('B11 lote de 2: dos recibos «posteos» (el segundo con grupo_de), 0 posteos', conf9.ok && conf9.modo === 'posteos' && rec9.length === 2 && rec9.every((r) => r.modo === 'posteos') && has(rec9[1].datos, 'grupo_de'), JSON.stringify(rec9.map((r) => r.modo)));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
  }

  // B8 · la cuenta de la casa: sin desplazamiento ni creación
  // automáticos — la nota se guarda como recibo casa_manual.
  const bootH = boot(ROOT, PORTH, tmpDirH, { HOUSE_USER_IDS: '1' });
  const SH = makeSide(BASEH, tmpDirH);
  try {
    const up = await waitUp(BASEH);
    t('B8.0 boot de la casa', up, bootH.getLog().slice(-200));
    if (up) {
      const casa = await SH.register('vp-casa@example.com');
      t('B8.1 la cuenta sembrada es la de la casa (id 1)', casa.uid === 1, 'uid=' + casa.uid);
      const upC = await SH.upload(casa.cookie);
      const confC = await SH.confirmar(casa.cookie, { asset_ids: [upC.body.id], transcript: 'subila hoy', caption_modo: 'mio', caption_text: 'Caption de la suite' });
      const recC = SH.recibosDb(casa.uid);
      t('B8.2 casa: recibo casa_manual, 0 posteos, nada se movió', confC.ok && confC.modo === 'casa_manual' && SH.postsOf(casa.uid).length === 0 && recC.length === 1 && recC[0].modo === 'casa_manual', JSON.stringify(confC).slice(0, 200));
    }
  } finally { try { bootH.srv.kill('SIGTERM'); } catch (e) {} }

  // B12 · video: la duración la sabe Posty y el tratamiento tal cual
  // se asienta sin subtítulos. (Boot con clave dummy: el armado de
  // reel exige la clave presente; el caption va con override «mio»,
  // sin gasto de IA.)
  const bootV = boot(ROOT, PORTV, tmpDirV, { OPENAI_API_KEY: 'sk-suite-dummy' });
  const SV = makeSide(BASEV, tmpDirV);
  try {
    const up = await waitUp(BASEV);
    t('B12.0 boot de video', up, bootV.getLog().slice(-200));
    if (up) {
      const uv = await SV.register('vp-video@example.com');
      // Video de prueba generado (720×1280 con audio): el clip de
      // stock del repo es de baja resolución y la puerta de calidad
      // vigente lo frena — comportamiento del producto, no del lote.
      const mp4Path = path.join(tmpDirV, 'clip-suite.mp4');
      require('child_process').execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4Path]);
      const mp4 = fs.readFileSync(mp4Path);
      const upV = await SV.upload(uv.cookie, mp4, 'video/mp4');
      t('B12.1 el video se guarda primero', upV.status === 200 && upV.body.ok && upV.body.kind === 'video', JSON.stringify(upV.body).slice(0, 160));
      const notaV = 'Este video es de la inauguración, es el sábado que viene, dejalo tal cual con su sonido';
      const entV = await SV.entender(uv.cookie, [upV.body.id], notaV);
      t('B12.2 entender video: duración de Posty (5 s) + tratamiento tal cual', entV.ok && entV.entendido.duracion_seg === 5 && entV.entendido.tratamiento === 'tal_cual' && !!entV.entendido.fechaISO, JSON.stringify(entV.entendido).slice(0, 220));
      const confV = await SV.confirmar(uv.cookie, { asset_ids: [upV.body.id], transcript: notaV, caption_modo: 'mio', caption_text: 'Caption de la suite' });
      const pV = SV.postsOf(uv.uid)[0];
      t('B12.3 «Va así»: el video queda creado en su fecha, sin subtítulos (tal cual)', confV.ok && confV.modo === 'fecha' && !!pV && pV.media_type === 'video' && confV.subs_aplicados === false, JSON.stringify(confV).slice(0, 220));
    }
  } finally { try { bootV.srv.kill('SIGTERM'); } catch (e) {} }
}

// ================= Parte C: control contra la base =================
async function parteC() {
  console.log('— C · control contra la base v1194 —');
  const appB = fs.readFileSync(path.join(BASE_DIR, 'public', 'app.js'), 'utf8');
  t('C1 la base conserva la tarjeta de fecha (pzEvCard) y no tiene la pregunta nueva', has(appB, 'id="pzEvCard"') && !has(appB, 'id="pzVpCard"'));
  const { srv, getLog } = boot(BASE_DIR, PORTB, tmpDirB);
  const SB = makeSide(BASEB, tmpDirB);
  try {
    const up = await waitUp(BASEB);
    t('C2 la base booteó', up, getLog().slice(-200));
    if (!up) return;
    const ub = await SB.register('vp-base@example.com');
    const r1 = await SB.post('/api/subir/voz/entender', { asset_ids: [1], transcript: 'hola' }, ub.cookie);
    const r2 = await SB.get('/api/subir/recibos', ub.cookie);
    t('C3 en la base los endpoints del lote no existen (404)', r1.status === 404 && r2.status === 404, 'entender=' + r1.status + ' recibos=' + r2.status);
  } finally { try { srv.kill('SIGTERM'); } catch (e) {} }
}

(async () => {
  parteA();
  await parteB();
  await parteC();
  console.log(`\nRESULTADO: ${ok} ok · ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(2); });
