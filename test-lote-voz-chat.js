// test-lote-voz-chat.js — LOTE VOZ-CHAT (orden de Valentino
// 17/11 13:34: «si, sumalo · todo va directamente a vos y te
// encargas vos de armar todo y enviarlo al cliente · posty no se
// ocupa de ningun audio»).
//
// El lote VOZ-ALCANCE-TOTAL (v1155) desvió el audio del handler de
// chat (campo `audio`) y la tira de voz del posteo/semana, pero el
// micrófono del chat principal y el de Inicio transcribían del lado
// cliente y entraban a /api/ideas/chat COMO TEXTO (voiceSend →
// chatExchange; la nota de Inicio vía pzVoicePendingDeliver →
// chatExchange): el cerebro los respondía y ejecutaba como si
// fueran tipeo. Este lote cierra ese borde:
//
//  (a) app.js: nace pzVozChatGuardar(text) — el turno que nace del
//      micrófono se guarda en su hilo por el mismo canal de la tira
//      (POST /api/chat/hilo/log): con ancla viva (HF_CHAT_ANCHOR) va
//      al hilo del posteo; sin ancla, al hilo general
//      ({general: 1} → hilo='general'). El poll de supervisión queda
//      corriendo para que la respuesta de bamboo llegue en vivo.
//      voiceSend y pzVoicePendingDeliver cierran con ese guardado:
//      ya no llaman a chatExchange.
//  (b) server.js: /api/chat/hilo/log acepta el destino `general`.
//  (c) support-cases.js: la cola pedidos-voz (voiceRequests), los
//      conteos y la puerta de decisión incluyen hilo='general'
//      (ambito 'chat', sin posteo ancla; la respuesta se busca en el
//      hilo general, donde las respuestas del asistente viven sin
//      hilo estampado).
//  El chat del cliente es SOLO POR AUDIO desde v846 (no hay tipeo
//  libre en la superficie): los envíos de texto que la app genera
//  (chips/prefills vía chatSend/chatExchange) quedan byte a byte.
//
// Qué prueba (boot real del árbol, OpenAI mockeado por preload):
//  1 [FIX] VM: pzVozChatGuardar sin ancla loguea {general:1} y con
//     ancla loguea {post_id}; en ambos casos arranca el poll.
//  2 [FIX] Estático: voiceSend y pzVoicePendingDeliver ya no nombran
//     chatExchange y cierran con pzVozChatGuardar; chatExchange y el
//     camino canned (chatSend) siguen intactos; la tira (pzVozEnviar)
//     sigue cerrando con pzVozCerrar como en v1155.
//  3 [FIX] POST /api/chat/hilo/log {general:1, user_text} → ok; la
//     fila queda role='user', hilo='general', post_id=0; CERO
//     mensajes del asistente y CERO trabajos nuevos.
//  4 [FIX] La cola pedidos-voz muestra el pedido del chat general:
//     ambito 'chat', posteo null, respuesta null, revisión
//     pendiente — así lo levanta el vigilante de bamboo.
//  5 [FIX] La variante anclada ({post_id}) entra como ambito
//     'posteo' con su posteo (paridad con la tira).
//  6 [FIX] La puerta de decisión acepta el pedido general
//     (decidir → descartado; la cola lo refleja).
//  7 [BASE] El camino de texto del endpoint sigue como siempre:
//     pregunta canned por /api/ideas/chat → el cerebro responde al
//     instante y la respuesta queda guardada.
//
// CONTROL: en la base prístina v1155 los casos 1, 2, 3, 4 y 6 fallan
// (el destino general no existe: 400 «Falta el destino»; la cola no
// lee hilo 'general'; voiceSend entraba al cerebro) y 5, 7 pasan
// igual.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-voz-chat.js
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
const PORT = 35237;
const ADMIN_TOKEN = 'tok-vozchat-test';
const EMAIL = 'vozchat@test.local';

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

// ---------- Estático + VM (app.js) ----------
console.log('== 1/2. Estático y VM ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const appCode = stripComments(appSrc);
{
  const guardar = fnFrom(appCode, 'async function pzVozChatGuardar(text)');
  t(guardar.length > 0, '2a [FIX] pzVozChatGuardar existe');
  t(guardar.includes("'/api/chat/hilo/log'"), '2b [FIX] pzVozChatGuardar guarda por el canal de la tira (hilo/log)');
  t(guardar.includes('general: 1'), '2c [FIX] sin ancla, el destino es el hilo general');
  t(guardar.includes('post_id: anchor'), '2d [FIX] con ancla viva, el destino es el hilo del posteo');
  t(guardar.includes('pzSupervisionPoll()'), '2e [FIX] el poll de supervisión queda corriendo (la respuesta de bamboo llega en vivo)');
  const vs = fnFrom(appCode, 'async function voiceSend()');
  t(vs.length > 0, '2f voiceSend existe');
  t(!vs.includes('chatExchange'), '2g [FIX] voiceSend ya NO entra al pipeline del texto (chatExchange)');
  t(vs.includes('pzVozChatGuardar(transcript)'), '2h [FIX] voiceSend cierra guardando la nota en su hilo');
  const pd = fnFrom(appCode, 'function pzVoicePendingDeliver()');
  t(pd.length > 0, '2i pzVoicePendingDeliver existe');
  t(!pd.includes('chatExchange'), '2j [FIX] la nota de Inicio ya NO corre el intercambio con el cerebro');
  t(pd.includes('pzVozChatGuardar(p.text)'), '2k [FIX] la nota de Inicio se guarda en su hilo al abrir el chat');
  // chatExchange es demasiado grande para el conteo de llaves de
  // fnFrom (llaves dentro de strings): se corta entre firmas.
  const ceStart = appCode.indexOf('async function chatExchange(');
  const ceEnd = appCode.indexOf('async function pzSupervisionPoll()', ceStart);
  const ce = ceStart >= 0 && ceEnd > ceStart ? appCode.slice(ceStart, ceEnd) : '';
  t(ce.includes("'/api/ideas/chat'"), '2l [INVARIANTE] chatExchange sigue vivo para los envíos de texto de la app');
  const cs = fnFrom(appCode, 'function chatSend(') || fnFrom(appCode, 'async function chatSend(');
  t(cs.includes('chatExchange'), '2m [INVARIANTE] chatSend (chips/prefills) sigue por chatExchange');
  const tira = fnFrom(appCode, 'async function pzVozEnviar(strip, text)');
  t(tira.includes("pzVozCerrar(strip, key, text, '')") && !tira.includes('ideas/chat'), '2n [INVARIANTE] la tira de voz sigue como la dejó v1155');
}
(async () => {
  // VM funcional de pzVozChatGuardar: api y poll stubeados.
  const calls = [];
  const ctx = {
    console,
    HF_CHAT_ANCHOR: null,
    api: { post: async (p, b) => { calls.push({ p, b }); return { ok: true }; } },
    pzSupervisionPoll: () => { calls.push({ poll: true }); },
  };
  vm.createContext(ctx);
  vm.runInContext(fnFrom(appSrc, 'async function pzVozChatGuardar(text)'), ctx);
  if (typeof ctx.pzVozChatGuardar !== 'function') {
    t(false, '1a [FIX] VM sin ancla: loguea {general:1, user_text} y arranca el poll', 'pzVozChatGuardar no existe');
    t(false, '1b [FIX] VM con ancla: loguea {post_id:77, user_text} y arranca el poll', 'pzVozChatGuardar no existe');
  } else {
    await ctx.pzVozChatGuardar('quiero cambiar la foto de mi semana');
    t(calls.length === 2 && calls[0].p === '/api/chat/hilo/log' && calls[0].b.general === 1 && calls[0].b.user_text === 'quiero cambiar la foto de mi semana' && calls[1].poll === true,
      '1a [FIX] VM sin ancla: loguea {general:1, user_text} y arranca el poll', JSON.stringify(calls).slice(0, 200));
    calls.length = 0;
    ctx.HF_CHAT_ANCHOR = { id: 77 };
    await ctx.pzVozChatGuardar('cambiame esta foto');
    t(calls.length === 2 && calls[0].b.post_id === 77 && calls[0].b.user_text === 'cambiame esta foto' && calls[1].poll === true,
      '1b [FIX] VM con ancla: loguea {post_id:77, user_text} y arranca el poll', JSON.stringify(calls).slice(0, 200));
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-voz-chat-'));
  const stubPath = path.join(tmpDir, 'stub.js');
  const transcriptFile = path.join(tmpDir, 'transcript.txt');
  const brainFile = path.join(tmpDir, 'brain.txt');
  fs.writeFileSync(stubPath, STUB);
  fs.writeFileSync(transcriptFile, 'transcripcion de prueba');
  fs.writeFileSync(brainFile, 'respuesta del cerebro de prueba');
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

  console.log('== Boot 1: registro ==');
  let child = boot();
  t(await waitUp(), 'B0 el servidor levanta');
  const reg = await req('POST', '/api/auth/register', { email: EMAIL, password: 'secreta123' });
  const cookie = String(reg.setCookie).split(';')[0];
  t(!!cookie && reg.status < 300, 'B1 registro con cookie de sesión', String(reg.status));
  await killPid(child);

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
    asst: Number(dbGet('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND role = ?', [uid, 'assistant']).c),
    jobs: Number(dbGet('SELECT COUNT(*) AS c FROM trabajos WHERE user_id = ?', [uid]).c),
  });
  const cola = async () => {
    const q = await req('GET', `/api/admin/support/conserje/pedidos-voz?limit=60&token=${ADMIN_TOKEN}`);
    return (q.json && Array.isArray(q.json.pedidos)) ? q.json.pedidos : [];
  };

  // ── Caso 3: el guardado del chat general (lo que hace pzVozChatGuardar) ──
  const TEXTO_GRAL = 'quiero cambiar la foto de portada de mi semana';
  {
    const c0 = counts();
    const log = await req('POST', '/api/chat/hilo/log', { general: 1, user_text: TEXTO_GRAL }, cookie);
    const c1 = counts();
    t(log.json && log.json.ok, '3a [FIX] el log acepta el destino general', JSON.stringify(log.json).slice(0, 160));
    const row = dbAll("SELECT role, hilo, post_id, text FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1", [uid]);
    t(row.length && row[0].role === 'user' && row[0].hilo === 'general' && Number(row[0].post_id) === 0 && row[0].text === TEXTO_GRAL,
      '3b [FIX] el mensaje quedó guardado en su hilo (hilo=general, sin posteo)', JSON.stringify(row).slice(0, 200));
    t(c1.asst === c0.asst, '3c [FIX] CERO mensajes del asistente nuevos', `asst ${c0.asst}→${c1.asst}`);
    t(c1.jobs === c0.jobs, '3d [FIX] CERO órdenes de trabajo nuevas', `jobs ${c0.jobs}→${c1.jobs}`);
  }

  // ── Caso 4: la cola pedidos-voz lo muestra como pedido del chat ──
  let gralId = 0;
  {
    const pedidos = await cola();
    const mine = pedidos.find((p) => p.user_id === uid && p.pedido === TEXTO_GRAL);
    gralId = mine ? Number(mine.id) : 0;
    t(!!mine, '4a [FIX] la cola pedidos-voz muestra el pedido del chat general', `total=${pedidos.length}`);
    t(!!mine && mine.ambito === 'chat' && mine.posteo === null && mine.respuesta === null,
      '4b [FIX] ambito chat, sin posteo ancla y sin respuesta del programa', JSON.stringify(mine || null).slice(0, 240));
    t(!!mine && mine.revision && mine.revision.estado === 'pendiente',
      '4c [FIX] el pedido nace pendiente de revisión (lo levanta el vigilante)', JSON.stringify(mine && mine.revision));
  }

  // ── Caso 5: la variante anclada entra como posteo (paridad con la tira) ──
  {
    const log = await req('POST', '/api/chat/hilo/log', { post_id: postId, user_text: 'cambiame esta foto por la del local' }, cookie);
    t(log.json && log.json.ok, '5a [INVARIANTE] el log anclado al posteo sigue aceptado', JSON.stringify(log.json).slice(0, 120));
    const pedidos = await cola();
    const mine = pedidos.find((p) => p.user_id === uid && p.pedido === 'cambiame esta foto por la del local');
    t(!!mine && mine.ambito === 'posteo' && mine.posteo && Number(mine.posteo.id) === postId,
      '5b [INVARIANTE] el pedido anclado sale como posteo con su posteo', JSON.stringify(mine).slice(0, 200));
  }

  // ── Caso 6: la puerta de decisión acepta el pedido general ──
  {
    const dec = await req('POST', `/api/admin/support/conserje/pedidos-voz/decidir?token=${ADMIN_TOKEN}`, { message_id: gralId, decision: 'descartado' });
    t(dec.json && dec.json.ok && dec.json.estado === 'descartado', '6a [FIX] decidir acepta el pedido del chat general', JSON.stringify(dec.json).slice(0, 160));
    const pedidos = await cola();
    const mine = pedidos.find((p) => Number(p.id) === gralId);
    t(!!mine && mine.revision && mine.revision.estado === 'descartado', '6b [FIX] la cola refleja la decisión sobre el pedido general', JSON.stringify(mine && mine.revision));
  }

  // ── Caso 7: el camino de texto (canned) sigue como siempre ──
  fs.writeFileSync(brainFile, 'tu semana viene tranqui: tenes tres posteos programados y todo en orden');
  {
    const c0 = counts();
    const r = await req('POST', '/api/ideas/chat', { photos: [], library: [], drafts: [], photoPaths: [], libraryPaths: [], messages: [{ role: 'user', text: 'contame como viene mi semana' }] }, cookie);
    const c1 = counts();
    t(r.json && String(r.json.reply || '').includes('semana viene tranqui'), '7a [BASE] TEXTO canned: el cerebro responde al instante, como hoy', JSON.stringify(r.json).slice(0, 160));
    const lastAsst = dbAll("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1", [uid]);
    t(c1.asst > c0.asst && lastAsst.length && String(lastAsst[0].text).includes('semana viene tranqui'), '7b [BASE] TEXTO canned: la respuesta quedó guardada', `asst ${c0.asst}→${c1.asst}`);
  }

  await killPid(child);
  let portFree = false;
  try { await fetch(`http://127.0.0.1:${PORT}/api/version`); } catch (e) { portFree = true; }
  t(portFree, 'B4 el puerto quedó libre tras matar el boot por PID');

  console.log(`\n== test-lote-voz-chat: ${pass} ok / ${fail} mal ==`);
  if (fails.length) console.log('Fallaron:', fails.join(' · '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
