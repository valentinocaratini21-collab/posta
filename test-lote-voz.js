// test-lote-voz.js — LOTE VOZ · ALCANCE TOTAL (orden de Valentino
// 17/11 12:49: «TODOS los audios que se envian, te encargas vos de
// punta a punta. posty no escucha ni responde»).
//
// Qué cambia el lote:
//  (a) app.js: hfAskChangeBtnHTML devuelve '' — muere la tarjeta
//      mini-chat del detalle («qué le cambiamos a este posteo?» +
//      «🎙️ Decímelo con tu voz»); queda solo la tira de voz inferior.
//  (b) app.js: pzVozEnviar ya no ejecuta ni contesta — ni el carril
//      directo (restyle/enhance en el acto) ni el carril del cerebro
//      (/api/ideas/chat): el pedido se guarda en su hilo
//      (pzVozCerrar sin texto de asistente → POST /api/chat/hilo/log
//      con user_text solo) y lo levanta el vigilante de bamboo por la
//      cola de pedidos-voz.
//  (c) server.js: el turno de voz de POST /api/ideas/chat (campo
//      `audio`) termina tras la transcripción: el texto queda guardado
//      como mensaje del usuario (chatInsertUser, como hoy) y el
//      programa no contesta, no arma el borrador del día, no llama al
//      cerebro, no corre las redes ni crea órdenes de trabajo. La nota
//      chatNote («ejecutalo como si lo hubiera escrito») muere.
//  Los turnos de TEXTO no cambian en nada.
//
// Qué prueba (boot real del árbol, OpenAI mockeado por preload:
// Whisper devuelve la transcripción del archivo MOCK_TRANSCRIPT_FILE
// y el cerebro devuelve el texto de MOCK_BRAIN_FILE):
//  1 [FIX] Pedido de cambio por VOZ (audio + ancla) → respuesta vacía,
//     el mensaje del usuario guardado con la transcripción, CERO
//     mensajes del asistente nuevos, CERO trabajos nuevos, ningún
//     «[trabajo-fallo» nuevo y el posteo intacto.
//  2 [FIX] Pregunta general por VOZ → mismo silencio: guardada, sin
//     respuesta, sin ejecución.
//  3 [BASE] El mismo pedido de cambio por TEXTO → la vía de siempre:
//     respuesta no vacía y al menos un mensaje del asistente (la
//     ejecución del texto queda intacta).
//  4 [BASE] Pregunta general por TEXTO → respuesta instantánea del
//     cerebro, guardada como mensaje del asistente.
//  5 [INVARIANTE] El canal de la tira: POST /api/chat/hilo/log con
//     user_text solo → la cola GET /api/admin/support/conserje/
//     pedidos-voz muestra el pedido con respuesta null (así lo
//     levanta el vigilante). Es el log que pzVozCerrar hace desde el
//     lote para cada audio de la tira (el pedido del caso 1 queda
//     guardado en chat_messages por el insert del handler, como hoy).
//  6 [FIX/INVARIANTE] app.js en VM: hfAskChangeBtnHTML(posteo válido)
//     === ''; pzVozStripHTML sigue rindiendo el micrófono inferior
//     (data-pz-voz-mic); el cuerpo de pzVozEnviar (sin comentarios) ya
//     no nombra pzVozAplicarDirecto ni ideas/chat y cierra con
//     pzVozCerrar(strip, key, text, '').
//  7 [FIX/INVARIANTE] server.js sin comentarios: la instrucción
//     chatNote al cerebro ya no existe; transcribeAudio sigue vivo.
//
// CONTROL: en la base prístina v1154 los casos 1, 2 y los [FIX] de
// 6-7 fallan (el cerebro contesta y/o la red crea el trabajo; la
// tarjeta se rinde; la tira ejecutaba) y 3, 4, 5 pasan igual.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-voz.js
// (desde el árbol del lote; para el control, copiar a pristine/ y correr ahí.)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35231;
const ADMIN_TOKEN = 'tok-voz-test';
const EMAIL = 'voz@test.local';

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

// ---------- Estático + VM (app.js / server.js) ----------
console.log('== 6/7. Estático y VM ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appCode = stripComments(appSrc);
const srvCode = stripComments(srvSrc);
{
  const ctx = { esc: (s) => String(s), ME: { lang: 'es' }, HF_ASK_POSTS: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fnFrom(appSrc, 'function hfAskChangeBtnHTML(p)'), ctx);
  const out = ctx.hfAskChangeBtnHTML({ id: 123, status: 'draft', image_path: '/media/x.jpg', caption: 'c', redo_left: 3, media_type: 'image' });
  t(out === '', '6a [FIX] hfAskChangeBtnHTML(posteo válido) devuelve vacío', JSON.stringify(out).slice(0, 120));
  vm.runInContext('var pzIc = function(){ return ""; };', ctx);
  vm.runInContext(fnFrom(appSrc, 'function pzVozEn()'), ctx);
  vm.runInContext(fnFrom(appSrc, 'function pzVozStripHTML(p)'), ctx);
  const strip = ctx.pzVozStripHTML({ id: 123 });
  t(typeof strip === 'string' && strip.includes('data-pz-voz-mic'), '6b [INVARIANTE] la tira de voz inferior sigue rindiendo su micrófono', String(strip).slice(0, 120));
  const enviar = fnFrom(appCode, 'async function pzVozEnviar(strip, text)');
  t(enviar.length > 0, '6c pzVozEnviar existe');
  t(!enviar.includes('pzVozAplicarDirecto'), '6d [FIX] pzVozEnviar ya no llama el carril directo');
  t(!enviar.includes('pzVozLane('), '6e [FIX] pzVozEnviar ya no clasifica con pzVozLane');
  t(!enviar.includes('ideas/chat'), '6f [FIX] pzVozEnviar ya no manda el audio al cerebro');
  t(enviar.includes("pzVozCerrar(strip, key, text, '')"), '6g [FIX] pzVozEnviar cierra guardando solo el mensaje del cliente');
  t(!srvCode.includes('NOTA DE VOZ. El texto siguiente'), '7a [FIX] la instrucción chatNote al cerebro ya no existe');
  t(srvSrc.includes('async function transcribeAudio'), '7b [INVARIANTE] el tubo de transcripción sigue vivo');
  t(srvCode.includes("return res.json({ reply: '', idea: null, voz: true });"), '7c [FIX] el desvío del turno de voz está en el handler');
}

// ---------- Boot real con OpenAI mockeado ----------
const STUB = `'use strict';
const fs = require('fs');
const realFetch = globalThis.fetch;
function jres(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
globalThis.fetch = async function (url, opts) {
  const u = String(url || '');
  if (u.includes('/audio/transcriptions')) {
    let txt = '';
    try { txt = fs.readFileSync(process.env.MOCK_TRANSCRIPT_FILE, 'utf8'); } catch (e) {}
    return jres({ text: txt });
  }
  if (u.includes('api.openai.com')) {
    let brain = '';
    try { brain = fs.readFileSync(process.env.MOCK_BRAIN_FILE, 'utf8'); } catch (e) {}
    return jres({ choices: [{ message: { content: brain } }], usage: {} });
  }
  return realFetch(url, opts);
};
`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-voz-'));
const stubPath = path.join(tmpDir, 'stub.js');
const transcriptFile = path.join(tmpDir, 'transcript.txt');
const brainFile = path.join(tmpDir, 'brain.txt');
fs.writeFileSync(stubPath, STUB);
const dbPath = path.join(tmpDir, 'posta.db');

function boot() {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    OPENAI_API_KEY: 'test-key', ADMIN_TOKEN,
    MOCK_TRANSCRIPT_FILE: transcriptFile, MOCK_BRAIN_FILE: brainFile,
    NODE_PATH: NM,
  };
  const child = spawn(process.execPath, ['--require', stubPath, 'server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
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

(async () => {
  console.log('== Boot 1: registro ==');
  let child = boot();
  t(await waitUp(), 'B0 el servidor levanta');
  const reg = await req('POST', '/api/auth/register', { email: EMAIL, password: 'secreta123' });
  const cookie = String(reg.setCookie).split(';')[0];
  t(!!cookie && reg.status < 300, 'B1 registro con cookie de sesión', String(reg.status));
  await killPid(child);

  // Semilla: un posteo programado con imagen (con el servidor apagado).
  let uid = 0, postId = 0;
  {
    const db = new DatabaseSync(dbPath);
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    uid = Number(u && u.id);
    const ins = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at) VALUES (?,?,?,?,?,datetime('now', '+1 day'))")
      .run(uid, '/media/foto-prueba.jpg', 'posteo de prueba', 'scheduled', 'image');
    postId = Number(ins.lastInsertRowid);
    db.close();
  }
  t(uid > 0 && postId > 0, 'B2 semilla: usuario y posteo ancla', `uid=${uid} post=${postId}`);

  console.log('== Boot 2: casos ==');
  child = boot();
  t(await waitUp(), 'B3 el servidor relee la semilla');
  const counts = () => ({
    user: Number(dbGet('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND role = ?', [uid, 'user']).c),
    asst: Number(dbGet('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND role = ?', [uid, 'assistant']).c),
    jobs: Number(dbGet('SELECT COUNT(*) AS c FROM trabajos WHERE user_id = ?', [uid]).c),
    fallo: Number(dbGet("SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND text LIKE '%[trabajo-fallo%'", [uid]).c),
  });
  const AUDIO = 'data:audio/webm;base64,AAAA';
  const baseBody = { photos: [], library: [], drafts: [], photoPaths: [], libraryPaths: [] };

  // ── Caso 1: pedido de cambio por VOZ ──
  fs.writeFileSync(transcriptFile, 'cambiame la foto de este posteo por otra');
  fs.writeFileSync(brainFile, 'dale, ya te cambio la foto por otra nueva, queda genial');
  {
    const c0 = counts();
    const r = await req('POST', '/api/ideas/chat', { ...baseBody, messages: [{ role: 'user', text: 'cambiame la foto de este posteo por otra' }], audio: AUDIO, anchor_post_id: postId }, cookie);
    const c1 = counts();
    t(r.json && r.json.reply === '', '1a [FIX] VOZ cambio: la respuesta del programa es vacía', JSON.stringify(r.json).slice(0, 160));
    const saved = dbAll("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1", [uid]);
    t(c1.user === c0.user + 1 && saved.length && saved[0].text === 'cambiame la foto de este posteo por otra', '1b [FIX] VOZ cambio: el mensaje del usuario quedó guardado con la transcripción', JSON.stringify(saved).slice(0, 160));
    t(c1.asst === c0.asst, '1c [FIX] VOZ cambio: CERO mensajes del asistente nuevos', `asst ${c0.asst}→${c1.asst}`);
    t(c1.jobs === c0.jobs, '1d [FIX] VOZ cambio: CERO órdenes de trabajo nuevas', `jobs ${c0.jobs}→${c1.jobs}`);
    t(c1.fallo === c0.fallo, '1e [FIX] VOZ cambio: ningún [trabajo-fallo nuevo', `fallo ${c0.fallo}→${c1.fallo}`);
    const post = dbGet('SELECT image_path FROM posts WHERE id = ?', [postId]);
    t(post && post.image_path === '/media/foto-prueba.jpg', '1f [FIX] VOZ cambio: el posteo quedó intacto', JSON.stringify(post));
  }

  // ── Caso 2: pregunta general por VOZ ──
  fs.writeFileSync(transcriptFile, 'a que hora sale mi posteo de hoy');
  fs.writeFileSync(brainFile, 'tu posteo sale hoy a las 19:00, quedate tranqui');
  {
    const c0 = counts();
    const r = await req('POST', '/api/ideas/chat', { ...baseBody, messages: [{ role: 'user', text: 'a que hora sale mi posteo de hoy' }], audio: AUDIO }, cookie);
    const c1 = counts();
    t(r.json && r.json.reply === '', '2a [FIX] VOZ pregunta: la respuesta del programa es vacía', JSON.stringify(r.json).slice(0, 160));
    const saved = dbAll("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1", [uid]);
    t(c1.user === c0.user + 1 && saved.length && saved[0].text === 'a que hora sale mi posteo de hoy', '2b [FIX] VOZ pregunta: el mensaje quedó guardado', JSON.stringify(saved).slice(0, 160));
    t(c1.asst === c0.asst && c1.jobs === c0.jobs, '2c [FIX] VOZ pregunta: sin respuesta y sin ejecución', `asst ${c0.asst}→${c1.asst} jobs ${c0.jobs}→${c1.jobs}`);
  }

  // ── Caso 3: el mismo pedido de cambio por TEXTO ──
  fs.writeFileSync(brainFile, 'dale, ya te cambio la foto por otra nueva, queda genial');
  {
    const c0 = counts();
    const r = await req('POST', '/api/ideas/chat', { ...baseBody, messages: [{ role: 'user', text: 'cambiame la foto de este posteo por otra' }], anchor_post_id: postId }, cookie);
    const c1 = counts();
    // Con trabajo creado, la prosa-promesa se suprime (la red
    // anti-promesa la reemplaza por el estado del trabajo): lo que
    // define la vía intacta es que el ejecutor CREÓ la orden y el
    // asistente dejó su mensaje de estado, como en la base.
    t(c1.jobs > c0.jobs, '3a [BASE] TEXTO cambio: el ejecutor creó la orden de trabajo (vía intacta)', `jobs ${c0.jobs}→${c1.jobs} reply=${JSON.stringify(r.json && r.json.reply).slice(0, 80)}`);
    t(c1.asst > c0.asst, '3b [BASE] TEXTO cambio: el asistente respondió como siempre', `asst ${c0.asst}→${c1.asst} jobs ${c0.jobs}→${c1.jobs}`);
  }

  // ── Caso 4: pregunta general por TEXTO ──
  fs.writeFileSync(brainFile, 'tu semana viene tranqui: tenes tres posteos programados y todo en orden');
  {
    const c0 = counts();
    const r = await req('POST', '/api/ideas/chat', { ...baseBody, messages: [{ role: 'user', text: 'contame como viene mi semana' }] }, cookie);
    const c1 = counts();
    t(r.json && String(r.json.reply || '').includes('semana viene tranqui'), '4a [BASE] TEXTO pregunta: responde el cerebro al instante', JSON.stringify(r.json).slice(0, 160));
    const lastAsst = dbAll("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1", [uid]);
    t(c1.asst > c0.asst && lastAsst.length && String(lastAsst[0].text).includes('semana viene tranqui'), '4b [BASE] TEXTO pregunta: la respuesta quedó guardada', `asst ${c0.asst}→${c1.asst} last=${JSON.stringify(lastAsst).slice(0, 120)}`);
  }

  // ── Caso 5: el canal de la tira → la cola pedidos-voz ──
  {
    const log = await req('POST', '/api/chat/hilo/log', { post_id: postId, user_text: 'cambiame la foto por otra, por favor' }, cookie);
    t(log.json && log.json.ok, '5a [INVARIANTE] el log del hilo acepta solo el mensaje del cliente', JSON.stringify(log.json).slice(0, 160));
    const q = await req('GET', `/api/admin/support/conserje/pedidos-voz?limit=60&token=${ADMIN_TOKEN}`);
    const pedidos = (q.json && Array.isArray(q.json.pedidos)) ? q.json.pedidos : [];
    const mine = pedidos.find((p) => p.user_id === uid && p.pedido === 'cambiame la foto por otra, por favor');
    t(!!mine, '5b [INVARIANTE] la cola pedidos-voz muestra el pedido de voz', `total=${pedidos.length}`);
    t(!!mine && mine.respuesta === null && mine.ambito === 'posteo' && mine.posteo && Number(mine.posteo.id) === postId, '5c [INVARIANTE] el pedido llega sin respuesta y anclado a su posteo', JSON.stringify(mine).slice(0, 240));
  }

  await killPid(child);
  // Puerto libre tras matar por PID.
  let portFree = false;
  try { await fetch(`http://127.0.0.1:${PORT}/api/version`); } catch (e) { portFree = true; }
  t(portFree, 'B4 el puerto quedó libre tras matar el boot por PID');

  console.log(`\n== test-lote-voz: ${pass} ok / ${fail} mal ==`);
  if (fails.length) console.log('Fallaron:', fails.join(' · '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
