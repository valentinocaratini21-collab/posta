// test-lote-subir-responde.js — LOTE SUBIR-RESPONDE (orden del dueño
// vía chat principal, 20/11: probó en vivo la fila «¿Tenés una idea?»
// del tab Subir a las 16:55, la transcripción anduvo y murió en el ✓ —
// Posty no respondió nada y el pedido ni cayó en la cola pedidos-voz).
//
// Causa raíz (verificada en el árbol v1208): en app.js, pzVozEnviar
// rama 'extra' solo hacía PZ_SUBIR.extra = text y pintaba '✓ ' + text:
// ningún POST, ningún log, ninguna respuesta. Y /api/ideas/transcribe
// (server.js) devuelve la transcripción y nada más.
//
// El lote:
//  (a) server.js: POST /api/subir/idea-voz (requireAuth) — compone la
//      respuesta en el momento: (a) lo entendido, (b) qué se va a
//      hacer; si es PREGUNTA por el posteo de hoy/el próximo, la
//      contesta con el dato real del plan (posts: estado + hora en la
//      tz de la cuenta; sin posteo, lo dice). Guarda user+assistant en
//      el hilo 'general' (mismo INSERT de /api/chat/hilo/log) → el
//      pedido cae en la cola pedidos-voz del conserje
//      (support-cases.voiceRequests). No genera, no agenda, no
//      publica: lectura + registro (FRENO-CUENTA-PROPIA intacto).
//  (b) app.js: la rama 'extra' conserva el ✓ y el viaje con el
//      «Listo», y además llama al endpoint y pinta la respuesta pegada
//      a la fila ([data-subir-voz-resp], helper pzSubirVozRespPintar).
//      Invitado: sin sesión, comportamiento local de siempre.
//  (c) styles.css: el bloque .voz-op-resp.
//
// Qué prueba:
//  1 [FIX] Estático app.js: la rama 'extra' llama a /api/subir/idea-voz
//     y pinta con pzSubirVozRespPintar; el markup trae
//     data-subir-voz-resp; se conservan PZ_SUBIR.extra y el '✓ '.
//  2 [FIX] VM: pzVozEnviar('extra') con sesión llama al endpoint con
//     {text} y pinta la respuesta; como invitado NO llama.
//  3 [FIX] Boot: pregunta «¿hoy sale el posteo de las 7?» con posteo
//     hoy 19:00 → respuesta con el dato real («sale hoy», «19:00»),
//     pregunta=true; quedan user+assistant en hilo 'general'.
//  4 [FIX] La cola pedidos-voz muestra el pedido: ambito 'chat',
//     respuesta = la compuesta, revisión pendiente.
//  5 [FIX] Idea (no pregunta): respuesta «Entendí: …» + cola del
//     equipo; también cae en pedidos-voz.
//  6 [FIX] Sin posteo hoy pero con uno mañana: la respuesta dice que
//     hoy no hay y nombra mañana + la hora real.
//  7 [FIX] Posteo de hoy ya publicado: la respuesta dice «ya salió»
//     con su hora real.
//  8 [FRENO] El endpoint no crea posteos ni trabajos: solo suma los
//     dos mensajes del hilo por llamada.
//  9 [BASE] Sin sesión → 401; texto vacío → 400; la transcripción
//     (/api/ideas/transcribe) sigue como siempre (no_heard sin audio
//     válido es otro camino: acá se verifica que la ruta existe y
//     responde JSON, no 404).
//
// CONTROL: en la base prístina v1208 los casos 1–7 fallan (la ruta no
// existe: 404; la rama 'extra' no nombra el endpoint) y 8–9 pasan
// igual o no aplican.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-subir-responde.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35391;
const ADMIN_TOKEN = ['token', 'de', 'prueba'].join('-');
const TZ = 'America/New_York';

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return src.slice(i, start);
}
// «YYYY-MM-DD HH:MM» hora de pared en tz -> ISO UTC (algoritmo estándar).
function zonedWallToUtc(ymd, hhmm, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(guess));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour === '24' ? 0 : p.hour), Number(p.minute));
    const target = Date.UTC(y, m - 1, d, hh, mm);
    const diff = target - asUtc;
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

// ---------- Estático + VM (app.js) ----------
console.log('== 1/2. Estático y VM ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const appCode = stripComments(appSrc);
{
  const enviar = fnFrom(appCode, 'async function pzVozEnviar(strip, text)');
  t(enviar.length > 0, '1a pzVozEnviar existe');
  t(enviar.includes("'/api/subir/idea-voz'"), '1b [FIX] la rama extra llama a /api/subir/idea-voz');
  t(enviar.includes('pzSubirVozRespPintar(strip'), '1c [FIX] la respuesta se pinta pegada a la fila');
  t(enviar.includes('PZ_SUBIR.extra = text') && enviar.includes("'✓ ' + text"), '1d [INVARIANTE] se conservan el viaje con el Listo y el ✓ de lo entendido');
  t(appCode.includes('data-subir-voz-resp'), '1e [FIX] el markup de la fila trae el bloque de respuesta');
  t(fnFrom(appCode, 'function pzSubirVozRespPintar(strip, txt)').length > 0, '1f [FIX] pzSubirVozRespPintar está definida');
  t(appSrc.includes("const PZ_BUILD = '20261105-v1209';"), '1g [FIX] PZ_BUILD en paridad con BUILD v1209');
}
(async () => {
  // VM funcional de la rama 'extra'.
  const calls = [];
  const respEl = { hidden: true, innerHTML: '' };
  const txtEl = { textContent: '' };
  const estEl = { hidden: true, textContent: '' };
  const strip = {
    getAttribute: () => 'extra',
    querySelector: (sel) => sel === '[data-subir-voz-txt]' ? txtEl : (sel === '[data-subir-voz-resp]' ? respEl : estEl),
  };
  const ctx = {
    console,
    PZ_SUBIR: { extra: '' },
    pzVozEn: () => false,
    pzIsGuest: () => false,
    esc: (s) => String(s),
    api: { post: async (p, b) => { calls.push({ p, b }); return { ok: true, respuesta: 'Entendí: prueba. Lo dejo en la cola del equipo.' }; } },
  };
  vm.createContext(ctx);
  vm.runInContext(fnFrom(appSrc, 'function pzSubirVozRespPintar(strip, txt)'), ctx);
  vm.runInContext(fnFrom(appSrc, 'function pzVozEstado(strip, txt)'), ctx);
  vm.runInContext(fnFrom(appSrc, 'async function pzVozEnviar(strip, text)'), ctx);
  if (typeof ctx.pzVozEnviar !== 'function') {
    t(false, '2a [FIX] VM: la nota de idea llama al endpoint y pinta la respuesta', 'pzVozEnviar no existe');
    t(false, '2b [FIX] VM: como invitado no llama (sin sesión no hay cola)', 'pzVozEnviar no existe');
  } else {
    await ctx.pzVozEnviar(strip, 'quiero una promo para el viernes');
    t(calls.length === 1 && calls[0].p === '/api/subir/idea-voz' && calls[0].b.text === 'quiero una promo para el viernes',
      '2a [FIX] VM: la nota de idea llama al endpoint con el texto', JSON.stringify(calls).slice(0, 200));
    t(respEl.hidden === false && respEl.innerHTML.includes('cola del equipo') && txtEl.textContent === '✓ quiero una promo para el viernes',
      '2b [FIX] VM: la respuesta queda pintada en la fila y el ✓ se conserva', respEl.innerHTML.slice(0, 160));
    calls.length = 0; respEl.hidden = true; respEl.innerHTML = '';
    ctx.pzIsGuest = () => true;
    await ctx.pzVozEnviar(strip, 'idea de invitado');
    t(calls.length === 0 && respEl.hidden === true, '2c [FIX] VM: como invitado no llama (sin sesión no hay cola)');
  }

  // ---------- Boot real ----------
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-subir-responde-'));
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

  console.log('== Boot 1: registros y semilla ==');
  let child = boot();
  t(await waitUp(), 'B0 el servidor levanta');
  const hoy = ymdInTz(new Date(), TZ);
  const manana = shiftYmd(hoy, 1);
  const users = {};
  for (const tag of ['a', 'b', 'c']) {
    const email = `subirresponde-${tag}@test.local`;
    const reg = await req('POST', '/api/auth/register', { email, password: 'secreta123' });
    users[tag] = { email, cookie: String(reg.setCookie).split(';')[0] };
    t(!!users[tag].cookie && reg.status < 300, `B1 registro ${tag} con sesión`, String(reg.status));
  }
  await killPid(child);
  {
    const db = new DatabaseSync(dbPath);
    for (const tag of ['a', 'b', 'c']) {
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(users[tag].email);
      users[tag].uid = Number(u && u.id);
      db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone').run(users[tag].uid, TZ);
    }
    // A: posteo de HOY 19:00 programado. B: nada hoy, uno mañana 19:00.
    // C: posteo de HOY ya publicado a las 12:00.
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at) VALUES (?,?,?,?,?,?)")
      .run(users.a.uid, '/media/a.jpg', 'posteo de hoy A', 'scheduled', 'image', zonedWallToUtc(hoy, '19:00', TZ));
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at) VALUES (?,?,?,?,?,?)")
      .run(users.b.uid, '/media/b.jpg', 'posteo de mañana B', 'scheduled', 'image', zonedWallToUtc(manana, '19:00', TZ));
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, published_at) VALUES (?,?,?,?,?,?,?)")
      .run(users.c.uid, '/media/c.jpg', 'posteo publicado C', 'published', 'image', zonedWallToUtc(hoy, '12:00', TZ), zonedWallToUtc(hoy, '12:00', TZ));
    db.close();
  }
  t(users.a.uid > 0 && users.b.uid > 0 && users.c.uid > 0, 'B2 semilla: 3 usuarios con tz fija y sus posteos');

  console.log('== Boot 2: casos ==');
  child = boot();
  t(await waitUp(), 'B3 el servidor relee la semilla');
  const cola = async () => {
    const q = await req('GET', '/api/admin/support/conserje/pedidos-voz?limit=60&token=' + ADMIN_TOKEN);
    return (q.json && Array.isArray(q.json.pedidos)) ? q.json.pedidos : [];
  };
  const conteos = (uid) => ({
    posts: Number(dbGet('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?', [uid]).c),
    msgs: Number(dbGet('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ?', [uid]).c),
  });

  // ── Caso 3: la pregunta del dueño, textual ──
  const PREG = 'Posty, que onda, hoy sale el posteo de las 7?';
  {
    const c0 = conteos(users.a.uid);
    const r = await req('POST', '/api/subir/idea-voz', { text: PREG }, users.a.cookie);
    const c1 = conteos(users.a.uid);
    t(r.json && r.json.ok === true && r.json.pregunta === true, '3a [FIX] la pregunta se acepta y se detecta como pregunta', JSON.stringify(r.json).slice(0, 200));
    t(!!r.json && String(r.json.respuesta || '').includes('sale hoy') && String(r.json.respuesta || '').includes('19:00'),
      '3b [FIX] la respuesta contesta con el dato real (sale hoy, 19:00)', String(r.json && r.json.respuesta));
    const rows = dbAll("SELECT role, text, hilo, post_id FROM chat_messages WHERE user_id = ? ORDER BY id ASC", [users.a.uid]);
    t(rows.length === 2 && rows[0].role === 'user' && rows[0].text === PREG && rows[0].hilo === 'general' && Number(rows[0].post_id) === 0
      && rows[1].role === 'assistant' && rows[1].text === String(r.json.respuesta),
      '3c [FIX] pedido + respuesta quedaron en el hilo general', JSON.stringify(rows).slice(0, 240));
    t(c1.posts === c0.posts && c1.msgs === c0.msgs + 2, '3d [FRENO] no se creó ningún posteo: solo los 2 mensajes del hilo', JSON.stringify({ c0, c1 }));
  }
  // ── Caso 4: la cola pedidos-voz ──
  {
    const pedidos = await cola();
    const mine = pedidos.find((p) => p.user_id === users.a.uid && p.pedido === PREG);
    t(!!mine && mine.ambito === 'chat' && !!mine.respuesta && mine.respuesta.includes('sale hoy') && mine.revision && mine.revision.estado === 'pendiente',
      '4a [FIX] la cola pedidos-voz muestra el pedido con su respuesta, pendiente de revisión', JSON.stringify(mine || null).slice(0, 260));
  }
  // ── Caso 5: una idea (no pregunta) ──
  const IDEA = 'quiero anunciar una promo 2x1 para el viernes';
  {
    const r = await req('POST', '/api/subir/idea-voz', { text: IDEA }, users.a.cookie);
    t(r.json && r.json.ok === true && r.json.pregunta === false && String(r.json.respuesta || '').startsWith('Entendí:') && String(r.json.respuesta || '').includes('cola del equipo'),
      '5a [FIX] la idea recibe entendido + qué se va a hacer', String(r.json && r.json.respuesta));
    const pedidos = await cola();
    const mine = pedidos.find((p) => p.user_id === users.a.uid && p.pedido === IDEA);
    t(!!mine && mine.revision && mine.revision.estado === 'pendiente', '5b [FIX] la idea también cae en pedidos-voz', JSON.stringify(mine || null).slice(0, 200));
  }
  // ── Caso 6: sin posteo hoy, próximo mañana ──
  {
    const r = await req('POST', '/api/subir/idea-voz', { text: '¿a qué hora sale mi posteo de hoy?' }, users.b.cookie);
    const resp = String((r.json || {}).respuesta || '');
    t(r.json && r.json.ok === true && resp.includes('hoy no hay') && resp.includes('mañana') && resp.includes('19:00'),
      '6a [FIX] sin posteo hoy: lo dice y nombra el próximo real (mañana 19:00)', resp);
  }
  // ── Caso 7: ya publicado hoy ──
  {
    const r = await req('POST', '/api/subir/idea-voz', { text: '¿hoy sale el posteo?' }, users.c.cookie);
    const resp = String((r.json || {}).respuesta || '');
    t(r.json && r.json.ok === true && resp.includes('ya salió') && resp.includes('12:00'),
      '7a [FIX] posteo de hoy publicado: «ya salió» con su hora real', resp);
  }
  // ── Caso 9: guardas ──
  {
    const sinSesion = await req('POST', '/api/subir/idea-voz', { text: 'hola' });
    t(sinSesion.status === 401, '9a [BASE] sin sesión → 401', String(sinSesion.status));
    const vacio = await req('POST', '/api/subir/idea-voz', { text: '   ' }, users.a.cookie);
    t(vacio.status === 400, '9b [BASE] texto vacío → 400', String(vacio.status));
    const tr = await req('POST', '/api/ideas/transcribe', { audio: 'data:audio/webm;base64,AAAA' }, users.a.cookie);
    t(tr.status !== 404 && !!tr.json, '9c [BASE] /api/ideas/transcribe sigue existiendo (la transcripción no se tocó)', String(tr.status));
  }

  await killPid(child);
  let portFree = false;
  try { await fetch(`http://127.0.0.1:${PORT}/api/version`); } catch (e) { portFree = true; }
  t(portFree, 'B4 el puerto quedó libre tras matar el boot por PID');

  console.log(`\n== test-lote-subir-responde: ${pass} ok / ${fail} mal ==`);
  if (fails.length) console.log('Fallaron:', fails.join(' · '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
