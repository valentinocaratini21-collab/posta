// test-lote-subir-escrito.js — LOTE SUBIR-ESCRITO (decisión del dueño
// 20/11 19:12: «sacar las nota de voz de todos lados… nos piden solo
// por mensaje, y vos respondes a la media hora con el resultado ya
// hecho o con alguna pregunta si la necesitas para hacerlo perfecto»;
// enmienda 19:18/19:20: el mensaje predeterminado de la tarjeta es el
// diseño «Dos ejemplos, dos mundos» con los ejemplos generados POR
// NEGOCIO desde su fundamento).
//
// El lote:
//  (1) Sale «Tu material» de la pestaña Subir (markup y funciones de
//      pintado fuera; el registro sigue del lado servidor).
//  (2) «¿Tenés una idea?» 100% ESCRITO: tarjeta con la burbuja de
//      Posty + dos ejemplos por negocio (digest: productos/servicios
//      y promos reales; precio solo si el fundamento lo trae,
//      verbatim; sin productos, la forma sin nombre) + cuadro con la
//      invitación de detalle + «Tiempo estimado de respuesta: 30
//      min». Al enviar → acuse con hora (POST /api/subir/idea: guarda
//      el pedido en chat_messages hilo 'general' — la cola
//      pedidos-voz de siempre — y su estado en subir_ideas; SIN
//      respuesta automática de contenido: muere la de SUBIR-RESPONDE
//      en este espacio).
//  (3) Cierre del circuito: el operador resuelve desde la cola
//      (POST /api/admin/support/conserje/pedidos-voz/resolver-idea)
//      con un posteo y/o una respuesta → la respuesta queda en el
//      hilo, la revisión queda 'resuelto_mano', sale PUSH y
//      GET /api/subir/idea devuelve la idea resuelta con el posteo
//      (el mismo de su semana) o la respuesta para la tarjeta.
//  (4) La pregunta post-subida se responde por ESCRITO: fuera el
//      micrófono y la transcripción del flujo (pzVpTextoEnviar →
//      la misma pasada /api/subir/voz/entender sobre el texto);
//      chips, «Entendí esto» y el desplazamiento quedan idénticos.
//
// CONTROL: en la base prístina v1211 los casos [FIX] fallan (la ruta
// /api/subir/idea no existe: 404; el markup trae el micrófono y la
// fila de voz; pzVpTextoEnviar y pzIdeaPintar no existen).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-subir-escrito.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35473;
const ADMIN_TOKEN = ['lote', 'subir', 'escrito', 'rig'].join('-');
const TZ = 'America/New_York';

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function zonedWallToUtc(ymd, hhmm, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(guess));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour === '24' ? 0 : p.hour), Number(p.minute));
    const diff = Date.UTC(y, m - 1, d, hh, mm) - asUtc;
    if (!diff) break;
    guess += diff;
  }
  return new Date(guess).toISOString();
}
function ymdInTz(instant, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}
function shiftYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ---------- Estático ----------
console.log('== 1. Estático ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const appCode = stripComments(appSrc);
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
const scSrc = fs.readFileSync(path.join(ROOT, 'support-cases.js'), 'utf8');
const cjSrc = fs.readFileSync(path.join(ROOT, 'public/conserje.js'), 'utf8');
const stSrc = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
{
  t(srvSrc.includes("app.post('/api/subir/idea', requireAuth"), '1a [FIX] server: POST /api/subir/idea');
  t(srvSrc.includes("app.get('/api/subir/idea', requireAuth"), '1b [FIX] server: GET /api/subir/idea');
  t(srvSrc.includes("app.post('/api/admin/support/conserje/pedidos-voz/resolver-idea', requireAdminToken"), '1c [FIX] server: resolver-idea del operador');
  t(srvSrc.includes('function subirIdeaEjemplos(uid)'), '1d [FIX] server: ejemplos por negocio desde el digest');
  t(dbSrc.includes('CREATE TABLE IF NOT EXISTS subir_ideas'), '1e [FIX] db.js crea subir_ideas');
  t(srvSrc.includes("const BUILD_ID = '20261105-v1212';"), '1f [FIX] BUILD v1212');
  t(appSrc.includes("const PZ_BUILD = '20261105-v1212';"), '1g [FIX] PZ_BUILD en paridad v1212');
  // La pestaña Subir sin voz y sin «Tu material»:
  const iSubir = appSrc.indexOf('async function subirView()');
  const iFin = appSrc.indexOf('function pzSubirErr(', iSubir);
  const subirMarkup = appSrc.slice(iSubir, iFin);
  t(subirMarkup.includes('pzIdeaCard'), '1h [FIX] el markup trae la tarjeta de la idea escrita');
  t(subirMarkup.includes('pzVpTexto') && subirMarkup.includes('pzVpEnviarTxt'), '1i [FIX] la pregunta post-subida trae cuadro de texto y botón');
  t(!subirMarkup.includes('pzVpMic') && !subirMarkup.includes('pzSubirVozOp') && !subirMarkup.includes('pzVpMaterial'), '1j [FIX] sin micrófono, sin fila de voz y sin sección Tu material en el markup');
  t(!appCode.includes('function pzVpRecToggle') && !appCode.includes('function pzVpMaterialPintar') && !appCode.includes('function pzVpReciboLinea'), '1k [FIX] fuera la grabadora VP y el pintado de Tu material');
  t(appCode.includes('async function pzVpTextoEnviar()') && appCode.includes('function pzIdeaPintar()') && appCode.includes('async function pzIdeaEnviar()'), '1l [FIX] existen pzVpTextoEnviar, pzIdeaPintar y pzIdeaEnviar');
  const iVp = appCode.indexOf('LOTE SUBIR-VOZ-PRIMERO');
  const iVpFin = appCode.indexOf('function pzVpBind()', iVp);
  t(!appCode.slice(iVp, iVpFin).includes('/api/ideas/transcribe'), '1m [FIX] el flujo post-subida ya no transcribe (la respuesta es escrita)');
  t(scSrc.includes('es_idea: !!ideaRow'), '1n [FIX] la cola marca es_idea desde subir_ideas');
  t(cjSrc.includes("data-act=\"idea-resolver\"") && cjSrc.includes('pedidos-voz/resolver-idea'), '1o [FIX] la consola del conserje resuelve ideas por su puerta');
  t(stSrc.includes('.pz-subir .pz-idea{'), '1p [FIX] styles: la tarjeta de la idea tiene su gramática');
  const ixSrc = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const enSrc = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');
  t(ixSrc.includes('/app.js?v=844') && ixSrc.includes('/styles.css?v=20261309') && enSrc.includes('/styles.css?v=20261309'), '1q [FIX] sellos ?v=844 y styles?v=20261309 en ambos index');
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-subir-escrito-'));
  const dbPath = path.join(tmpDir, 'posta.db');
  function boot() {
    const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, ADMIN_TOKEN, NODE_PATH: NM };
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', (d) => { process.stderr.write('[srv] ' + d); });
    return child;
  }
  async function waitUp() {
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  function killPid(child) {
    return new Promise((resolve) => {
      if (!child || child.killed) return resolve();
      child.once('exit', () => resolve());
      try { child.kill('SIGTERM'); } catch (e) { resolve(); }
      setTimeout(resolve, 5000);
    });
  }
  async function req(method, p, body, cookie) {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return { status: r.status, json, text: txt, setCookie: r.headers.get('set-cookie') || '' };
  }
  function dbAll(sql, params) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { return db.prepare(sql).all(...(params || [])); } finally { db.close(); }
  }
  function dbGet(sql, params) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { return db.prepare(sql).get(...(params || [])); } finally { db.close(); }
  }

  console.log('== Boot 1: registros ==');
  let child = boot();
  t(await waitUp(), 'B0 el servidor levanta');
  const hoy = ymdInTz(new Date(), TZ);
  const manana = shiftYmd(hoy, 1);
  const users = {};
  for (const tag of ['a', 'b', 'c']) {
    const email = `subirescrito-${tag}@test.local`;
    const reg = await req('POST', '/api/auth/register', { email, password: 'secreta123' });
    users[tag] = { email, cookie: String(reg.setCookie).split(';')[0] };
    t(!!users[tag].cookie && reg.status < 300, `B1 registro ${tag} con sesión`, String(reg.status));
  }
  await killPid(child);
  let postA = 0;
  {
    const db = new DatabaseSync(dbPath);
    for (const tag of ['a', 'b', 'c']) {
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(users[tag].email);
      users[tag].uid = Number(u && u.id);
      db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone').run(users[tag].uid, TZ);
    }
    // Fundamentos: A vende zapatillas (producto con precio, sin
    // promos); B es una pizzería (producto sin precio + promo real);
    // C queda sin fundamento (fallback en la forma).
    const dgA = { productos: [{ nombre: 'Zapatillas Volt', precio: '$65.000' }], servicios: [], promos: [], protagonista: 'Zapatillas Volt', temas_feed: [] };
    const dgB = { productos: [{ nombre: 'Pizza de muzzarella' }], servicios: [], promos: [{ titulo: '2×1 los martes' }], protagonista: '', temas_feed: [] };
    db.prepare('INSERT INTO client_digest (user_id, digest_json) VALUES (?, ?)').run(users.a.uid, JSON.stringify(dgA));
    db.prepare('INSERT INTO client_digest (user_id, digest_json) VALUES (?, ?)').run(users.b.uid, JSON.stringify(dgB));
    // El posteo que va a resolver la idea de A: mañana 19:00.
    const ins = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at) VALUES (?,?,?,?,?,?)")
      .run(users.a.uid, '/media/volt.jpg', 'la Volt, la chunky de todos los días', 'scheduled', 'image', zonedWallToUtc(manana, '19:00', TZ));
    postA = Number(ins.lastInsertRowid);
    db.close();
  }
  t(users.a.uid > 0 && postA > 0, 'B2 semilla: usuarios, fundamentos y el posteo de A');

  console.log('== Boot 2: casos ==');
  child = boot();
  t(await waitUp(), 'B3 el servidor relee la semilla');

  // ── Ejemplos por negocio (la enmienda) ──
  const ejA = await req('GET', '/api/subir/idea', null, users.a.cookie);
  t(ejA.json && ejA.json.ok && ejA.json.idea === null, 'E1 A sin ideas: idea null y ejemplos presentes', JSON.stringify(ejA.json).slice(0, 200));
  t(ejA.json && ejA.json.ejemplos && ejA.json.ejemplos.producto.includes('Zapatillas Volt') && ejA.json.ejemplos.producto.includes('$65.000'),
    'E2 [FIX] ejemplo de producto de A: SU producto con SU precio verbatim', ejA.json && ejA.json.ejemplos && ejA.json.ejemplos.producto);
  t(ejA.json && ejA.json.ejemplos && !/pizza|muzzarella/i.test(ejA.json.ejemplos.producto + ' ' + ejA.json.ejemplos.fecha),
    'E3 [FIX] ningún ejemplo de A sale del rubro de B');
  t(ejA.json && ejA.json.ejemplos && /aniversario/.test(ejA.json.ejemplos.fecha) && !/\d+%|\$\s?\d/.test(ejA.json.ejemplos.fecha),
    'E4 [FIX] A sin promo real: ejemplo de fecha en la forma, sin fecha ni descuento inventados', ejA.json && ejA.json.ejemplos && ejA.json.ejemplos.fecha);
  const ejB = await req('GET', '/api/subir/idea', null, users.b.cookie);
  t(ejB.json && ejB.json.ejemplos && ejB.json.ejemplos.producto.includes('Pizza de muzzarella') && !ejB.json.ejemplos.producto.includes('$'),
    'E5 [FIX] ejemplo de B: su producto y SIN precio (el fundamento no lo trae)', ejB.json && ejB.json.ejemplos && ejB.json.ejemplos.producto);
  t(ejB.json && ejB.json.ejemplos && ejB.json.ejemplos.fecha.includes('2×1 los martes'),
    'E6 [FIX] ejemplo de fecha de B: sale de SU promo real', ejB.json && ejB.json.ejemplos && ejB.json.ejemplos.fecha);
  t(ejB.json && ejB.json.ejemplos && !/zapatillas|volt/i.test(ejB.json.ejemplos.producto + ' ' + ejB.json.ejemplos.fecha),
    'E7 [FIX] ningún ejemplo de B sale del rubro de A');
  const ejC = await req('GET', '/api/subir/idea', null, users.c.cookie);
  t(ejC.json && ejC.json.ejemplos && ejC.json.ejemplos.producto.includes('producto estrella') && !/\$/.test(ejC.json.ejemplos.producto),
    'E8 [FIX] C sin fundamento: ejemplo en la forma, sin producto ni precio inventados', ejC.json && ejC.json.ejemplos && ejC.json.ejemplos.producto);

  // ── La idea escrita: envío, acuse y cola ──
  const ideaTxt = 'quiero un posteo para el sábado: llegó la Volt urbana, que se vea en movimiento';
  const env1 = await req('POST', '/api/subir/idea', { text: ideaTxt }, users.a.cookie);
  t(env1.json && env1.json.ok && env1.json.idea && env1.json.idea.estado === 'recibida' && /^\d{2}:\d{2}$/.test(env1.json.idea.hora || ''),
    'I1 [FIX] enviar la idea: acuse recibida con hora local', JSON.stringify(env1.json).slice(0, 220));
  const ideaA = env1.json && env1.json.idea;
  const msgsA = dbAll("SELECT role, hilo, text FROM chat_messages WHERE user_id = ? ORDER BY id ASC", [users.a.uid]);
  t(msgsA.length === 1 && msgsA[0].role === 'user' && msgsA[0].hilo === 'general' && msgsA[0].text === ideaTxt,
    'I2 [FIX] el pedido cae en la cola (hilo general) y NO hay respuesta automática de contenido', JSON.stringify(msgsA).slice(0, 200));
  const colaR = await req('GET', '/api/admin/support/conserje/pedidos-voz?limit=60&token=' + ADMIN_TOKEN);
  const pedA = ((colaR.json && colaR.json.pedidos) || []).find((p) => p.user_id === users.a.uid);
  t(!!pedA && pedA.es_idea === true && pedA.revision && pedA.revision.estado === 'pendiente' && !pedA.respuesta,
    'I3 [FIX] la cola pedidos-voz muestra la idea: es_idea, pendiente, sin respuesta', JSON.stringify(pedA).slice(0, 240));
  const midA = pedA && pedA.id;

  // ── Resolución con posteo: push + resultado en la tarjeta ──
  const res1 = await req('POST', '/api/admin/support/conserje/pedidos-voz/resolver-idea?token=' + ADMIN_TOKEN, { message_id: midA, post_id: postA });
  t(res1.json && res1.json.ok && res1.json.push && res1.json.push.ok === false && res1.json.push.reason === 'no_subs',
    'R1 [FIX] resolver con posteo: ok y push intentada (sin suscripciones en el rig: no_subs)', JSON.stringify(res1.json).slice(0, 220));
  const getA = await req('GET', '/api/subir/idea', null, users.a.cookie);
  t(getA.json && getA.json.idea && getA.json.idea.estado === 'resuelta' && getA.json.idea.posteo && getA.json.idea.posteo.id === postA && !!getA.json.idea.posteo.dia_label && getA.json.idea.posteo.hora === '19:00',
    'R2 [FIX] la tarjeta de A muestra el resultado: el MISMO posteo, con su día y hora', JSON.stringify(getA.json && getA.json.idea).slice(0, 260));
  const filaA = dbGet('SELECT estado, post_id FROM subir_ideas WHERE user_id = ?', [users.a.uid]);
  t(filaA && filaA.estado === 'resuelta' && Number(filaA.post_id) === postA, 'R3 [FIX] subir_ideas quedó resuelta con el posteo enlazado');
  const revA = dbGet('SELECT estado FROM support_voz_pedidos WHERE message_id = ?', [midA]);
  t(revA && revA.estado === 'resuelto_mano', 'R4 [FIX] la revisión de la cola quedó resuelta a mano');
  const asstA = dbAll("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant'", [users.a.uid]);
  t(asstA.length === 1 && /posteo/.test(asstA[0].text), 'R5 [FIX] la respuesta quedó en el hilo (la cola la muestra entregada)');

  // ── Resolución con palabras (una pregunta) ──
  const env2 = await req('POST', '/api/subir/idea', { text: 'quiero avisar el 2×1 del martes que viene' }, users.b.cookie);
  const cola2 = await req('GET', '/api/admin/support/conserje/pedidos-voz?limit=60&token=' + ADMIN_TOKEN);
  const pedB = ((cola2.json && cola2.json.pedidos) || []).find((p) => p.user_id === users.b.uid);
  const res2 = await req('POST', '/api/admin/support/conserje/pedidos-voz/resolver-idea?token=' + ADMIN_TOKEN, { message_id: pedB && pedB.id, texto: 'una duda para hacerlo perfecto: ¿el 2×1 va en pizzas grandes o en todas?' });
  t(res2.json && res2.json.ok, 'R6 [FIX] resolver con una pregunta en palabras: ok', JSON.stringify(res2.json).slice(0, 160));
  const getB = await req('GET', '/api/subir/idea', null, users.b.cookie);
  t(getB.json && getB.json.idea && getB.json.idea.estado === 'resuelta' && /pizzas grandes/.test(getB.json.idea.respuesta || '') && !getB.json.idea.posteo,
    'R7 [FIX] la tarjeta de B muestra la pregunta, sin posteo', JSON.stringify(getB.json && getB.json.idea).slice(0, 240));

  // ── Errores y frenos ──
  const sinSesion = await req('POST', '/api/subir/idea', { text: 'x' });
  t(sinSesion.status === 401, 'X1 sin sesión → 401', String(sinSesion.status));
  const vacio = await req('POST', '/api/subir/idea', { text: '  ' }, users.c.cookie);
  t(vacio.status === 400, 'X2 texto vacío → 400', String(vacio.status));
  const sinRes = await req('POST', '/api/admin/support/conserje/pedidos-voz/resolver-idea?token=' + ADMIN_TOKEN, { message_id: midA });
  t(sinRes.status === 400 && sinRes.json && sinRes.json.error === 'sin_resolucion', 'X3 resolver sin posteo ni texto → 400 sin_resolucion', JSON.stringify(sinRes.json).slice(0, 120));
  const ajeno = await req('POST', '/api/admin/support/conserje/pedidos-voz/resolver-idea?token=' + ADMIN_TOKEN, { message_id: pedB && pedB.id, post_id: postA });
  t(ajeno.status === 400 && ajeno.json && ajeno.json.error === 'posteo_invalido', 'X4 posteo de otro usuario → 400 posteo_invalido', JSON.stringify(ajeno.json).slice(0, 120));
  const inex = await req('POST', '/api/admin/support/conserje/pedidos-voz/resolver-idea?token=' + ADMIN_TOKEN, { message_id: 999999, texto: 'hola' });
  t(inex.status === 404, 'X5 idea inexistente → 404', String(inex.status));
  const postsAntes = dbAll('SELECT id FROM posts WHERE user_id = ?', [users.a.uid]).length;
  t(postsAntes === 1, 'X6 [FRENO] el circuito de ideas no crea posteos: A sigue con el único sembrado', String(postsAntes));

  // ── La pregunta post-subida, escrita (el caño de siempre) ──
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
  const upR = await fetch(`http://127.0.0.1:${PORT}/api/album/photo`, { method: 'POST', headers: { 'Content-Type': 'image/png', Cookie: users.a.cookie }, body: PNG });
  const upJ = await upR.json().catch(() => null);
  t(upR.status === 200 && upJ && upJ.ok && !!upJ.id, 'V1 la foto se guarda primero (sin preguntas)', JSON.stringify(upJ).slice(0, 140));
  const notaAniv = 'Es el aniversario de casados de mis viejos, el 12 de diciembre. No lo anuncies hasta el lunes.';
  const ent = await req('POST', '/api/subir/voz/entender', { asset_ids: [upJ && upJ.id], transcript: notaAniv }, users.a.cookie);
  t(ent.json && ent.json.ok && ent.json.entendido && ent.json.entendido.fechaISO === '2026-12-12' && ent.json.entendido.motivo === 'Aniversario',
    'V2 [FIX] lo ESCRITO corre la misma pasada estructurada: fecha + motivo como con la voz', JSON.stringify(ent.json).slice(0, 240));

  await killPid(child);
  try { child.kill('SIGKILL'); } catch (e) {}
  console.log(`\n== RESUMEN: ${pass} ok / ${fail} mal ==`);
  if (fails.length) { console.log('Fallaron:', fails.join(' | ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(2); });
