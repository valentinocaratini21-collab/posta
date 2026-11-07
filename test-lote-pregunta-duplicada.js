// test-lote-pregunta-duplicada.js — PREGUNTA DUPLICADA EN EL CHAT DE LA PRUEBA (lote v756, base v755).
// Bug reportado por Valentino 7/11 con captura: la pregunta «¿y dónde están?
// pasame el barrio o la ciudad. ¿Dónde te encuentran?» salía DOS veces seguidas
// (una burbuja con título en negrita y enseguida la misma en texto plano).
// Causa: chatAskCurrent() hace push local Y postea la pregunta al servidor
// (chatPost('question')); el servidor la guardaba como mensaje real
// (INSERT INTO chat_messages, role='assistant') y el poll cada 3 s la mostraba
// como segunda burbuja si un tick caía entre el INSERT y la llegada del POST.
// El dedup chatSeenAdd(msg_id) es solo temporal.
// Fix: (1) el servidor ya NO inserta kind 'question' (solo evento del caso,
// como 'answer'); (2) el poll salta mensajes 'assistant' cuyo texto es una
// pregunta guionada (q.chat + ' ' + q.title de alguna clave del plan);
// (3) el join inicializa S.chatLastId con el último id existente (el primer
// poll ya no re-muestra el hilo viejo); (4) el push local de chatAskCurrent
// queda guardado contra doble llamado (S.chatPushedQ, se resetea en
// chatRebuildLog para que volver atrás siga mostrando la pregunta).
// Parte A: boot real de server.js en DATA_DIR temporal + HTTP (cookie de
// sesión) + conteo directo en posta.db. Parte B: las funciones del cliente
// extraídas de public/prueba.html y public/en-prueba.html y corridas en vm
// con stubs (mismo patrón que test-lote-diseno-favorita.js).
// Uso: node test-lote-pregunta-duplicada.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Parte A: servidor real ----------
const PORT = 34562;
const TEST_KEY = 'boot-test-key-pregunta-duplicada';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pregunta-dup-boot-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';

async function reqJson(method, p, body, cookie) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  const setCookie = r.headers.get('set-cookie');
  return { status: r.status, json: j, setCookie };
}
function chatMsgCount(db, uid) {
  try { const r = db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ?').get(uid); return (r && r.c) || 0; }
  catch (e) { return -1; }
}

async function parteA() {
  console.log('— A) servidor: kind question no deja fila, el poll no ecoa —');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), ADMIN_TOKEN: 'boot-test-token-dup',
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    check('A0 el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    check('A0b /api/version trae el BUILD v761', ver.status === 200 && ver.json && ver.json.build === '20261105-v761', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    check('A0c la DB del boot existe en el DATA_DIR temporal', fs.existsSync(dbPath));
    const db = new DatabaseSync(dbPath, { readOnly: true });

    // Join como invitado (la pregunta duplicada es la de 'ubicacion').
    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'prueba-dup-test', device: 'test-device-dup' });
    check('A0d join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const uid = join.json.user_id;
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
    const SCRIPTED = '¿y dónde están? pasame el barrio o la ciudad. ¿Dónde te encuentran?';

    // (a) Postear kind 'question' NO deja fila en chat_messages.
    const q = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'question', question: 'ubicacion', text: SCRIPTED, ig: 'prueba-dup-test', device: 'test-device-dup' }, cookie);
    check('A1 post question responde ok', q.status === 200 && q.json && q.json.ok === true, JSON.stringify(q.json));
    check('A2 post question NO deja fila en chat_messages', chatMsgCount(db, uid) === 0, 'filas=' + chatMsgCount(db, uid));
    check('A3 post question registra el evento del caso (caso_id)', q.json && q.json.caso_id > 0, JSON.stringify(q.json));
    const poll1 = await reqJson('GET', '/api/trial/chat-onboarding?after=0&test_key=' + TEST_KEY, null, cookie);
    check('A4 el poll no devuelve nada nuevo tras postear la pregunta', poll1.status === 200 && poll1.json && Array.isArray(poll1.json.messages) && poll1.json.messages.length === 0, JSON.stringify(poll1.json));

    // Controles: el flujo normal sigue sano (por delta: la fila de la
    // pregunta de A2 sigue ahí en prístino, y no es culpa de answer/free).
    const antesAns = chatMsgCount(db, uid);
    const a = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'answer', question: 'ubicacion', value: 'Palermo', ig: 'prueba-dup-test', device: 'test-device-dup' }, cookie);
    check('A5 answer responde ok y NO suma filas (precedente intacto)', a.status === 200 && a.json && a.json.ok === true && chatMsgCount(db, uid) === antesAns, JSON.stringify(a.json) + ' filas=' + chatMsgCount(db, uid) + ' antes=' + antesAns);
    const antesFree = chatMsgCount(db, uid);
    const f = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'free', text: 'hola, ¿me cambiás la foto?', ig: 'prueba-dup-test', device: 'test-device-dup' }, cookie);
    check('A6 free responde ok con su ACK', f.status === 200 && f.json && f.json.ok === true && typeof f.json.reply === 'string' && f.json.reply.length > 0, JSON.stringify(f.json));
    check('A7 free SÍ suma sus 2 filas (user + ACK)', chatMsgCount(db, uid) === antesFree + 2, 'filas=' + chatMsgCount(db, uid) + ' antes=' + antesFree);
    const poll2 = await reqJson('GET', '/api/trial/chat-onboarding?after=0&test_key=' + TEST_KEY, null, cookie);
    check('A8 el poll devuelve el texto libre + el ACK (el flujo vivo sigue)', poll2.status === 200 && poll2.json && Array.isArray(poll2.json.messages)
      && poll2.json.messages.some((m) => m.role === 'user' && m.text === 'hola, ¿me cambiás la foto?')
      && poll2.json.messages.some((m) => m.role === 'assistant' && m.text === (f.json && f.json.reply)), JSON.stringify(poll2.json));
    try { db.close(); } catch (e) {}
  } catch (e) {
    console.log('error de la parte A:', e.message);
    fail++;
  } finally {
    kill();
    await sleep(500);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- Parte B: cliente en vm ----------
function fnFrom(html, sig) {
  const i = html.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}') { d--; if (d === 0) return html.slice(i, j + 1); }
  }
  return null;
}
const FNS = [
  'function chatPost(',
  'function chatJoin() {',
  'function chatSeenAdd(',
  'function chatPollStart() {',
  'function chatPollStop() {',
  'function chatLogPush(',
  'function chatScrollBottom() {',
  'function chatQText(',
  'function chatIsScriptedQuestion(',
  'function chatRebuildLog() {',
  'function chatAskCurrent() {',
  'function esc(',
  // (LOTE ONBOARDING-DIVERTIDO v760) chatRebuildLog/chatAskCurrent ahora
  // dependen de estas: tarjeta de lo aprendido/rama honesta, reacciones
  // y la tarjeta destacada de la pregunta vigente (chatLogHTML).
  'function chatHonestNeeded() {',
  'function chatKnownRows() {',
  'function chatHonestRows() {',
  'function chatJoinHonestText() {',
  'function chatReactionFor(',
  'function chatQIntro(',
  'function chatLogHTML(',
  'function chatStyleLine() {',
];
function loadChat(html) {
  const parts = [];
  for (const sig of FNS) {
    const s = fnFrom(html, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  for (const sig of ['var T = {']) {
    const s = fnFrom(html, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  // CHAT_POLL_MS y CHAT_ACK_TEXT son líneas sin llaves: por regex, no por fnFrom.
  for (const re of [/var CHAT_POLL_MS = [^;]+;/, /var CHAT_ACK_TEXT = '[^']*';/]) {
    const m = html.match(re);
    if (!m) return { error: 'falta ' + re };
    parts.push(m[0]);
  }
  return { code: parts.join('\n') };
}

const fakeBox = { appendChild: () => {}, scrollTop: 0, scrollHeight: 0 };
// (LOTE ONBOARDING-DIVERTIDO v760) chatLogPush arma la burbuja con avatar
// (createElement + setAttribute + appendChild): el elemento falso tiene
// que soportar eso, si no el poll aborta en el primer mensaje bot.
function fakeEl() { return { className: '', textContent: '', innerHTML: '', src: '', alt: '', style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelectorAll() { return []; } }; }

function parteB() {
  console.log('— B) cliente: poll, join y push local —');
  for (const [lang, file] of [['ES', 'public/prueba.html'], ['EN', 'public/en-prueba.html']]) {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    const loaded = loadChat(html);
    check(`B0 ${lang} se extraen las funciones del chat`, !loaded.error, loaded.error || '');
    if (loaded.error) continue;

    // (b) El poll salta la pregunta guionada y sigue mostrando lo real.
    {
      const ctx = { S: {}, TEST_KEY_QS: '', document: { getElementById: () => fakeBox, createElement: () => fakeEl(), documentElement: { lang: lang === 'ES' ? 'es' : 'en' } }, chatRender: () => {}, chatBlocked: () => {}, chatDeviceId: () => 'dev-test', console };
      let tick = null;
      ctx.setInterval = (fn) => { tick = fn; return 1; };
      ctx.clearInterval = () => {};
      const pollQueue = [];
      ctx.fetch = (url) => Promise.resolve({ json: () => Promise.resolve(pollQueue.shift() || { ok: true, messages: [] }) });
      vm.createContext(ctx);
      vm.runInContext(loaded.code, ctx);
      vm.runInContext(`S.plan = ['ubicacion', 'q1']; S.qi = 0; S.ans = {}; S.products = []; S.chatJoined = true; S.chatLastId = 0; S.chatSeen = {}; S.chatLog = []; S.chatPaused = false;`, ctx);
      // El texto guionado es el que el cliente postea: chatQText(key) en el
      // estado real (q1 con S.products vacío usa chatQ1Empty, no chatQ1).
      const scripted = (key) => vm.runInContext(`(function () { var q = chatQText('${key}'); return q.chat + ' ' + q.title; })()`, ctx);
      const scriptedUbic = () => scripted('ubicacion');
      const scriptedQ1 = () => scripted('q1');
      pollQueue.push({ ok: true, messages: [
        { id: 11, role: 'assistant', text: scriptedUbic() },
        { id: 12, role: 'assistant', text: scriptedQ1() },
        { id: 13, role: 'assistant', text: 'hola, soy bamboo, te respondo en vivo' },
        { id: 14, role: 'user', text: 'Palermo' },
        { id: 15, role: 'assistant', text: scriptedUbic() + ' (aclaración)' },
      ] });
      vm.runInContext('chatPollStart()', ctx);
      const p = (async () => {
        await sleep(120);
        if (typeof tick === 'function') tick();
        await sleep(120);
        const log = vm.runInContext('S.chatLog', ctx);
        const lastId = vm.runInContext('S.chatLastId', ctx);
        check(`B1 ${lang} el poll salta las 2 preguntas guionadas (ubicacion + q1)`, log.length === 3, 'chatLog=' + JSON.stringify(log));
        check(`B2 ${lang} el poll SÍ muestra la respuesta real + el texto del visitante + la aclaración`, log.some((m) => m.t === 'hola, soy bamboo, te respondo en vivo') && log.some((m) => m.t === 'Palermo') && log.some((m) => m.t === scriptedUbic() + ' (aclaración)'), JSON.stringify(log));
        check(`B3 ${lang} el poll avanza el watermark aunque salte mensajes (lastId=15)`, lastId === 15, 'lastId=' + lastId);
      })();
      parteB._pending = parteB._pending || [];
      parteB._pending.push(p);
    }

    // (d) Doble llamado a chatAskCurrent pushea una sola vez.
    {
      const posts = [];
      const ctx = { S: {}, TEST_KEY_QS: '', document: { getElementById: () => fakeBox, createElement: () => fakeEl(), documentElement: { lang: lang === 'ES' ? 'es' : 'en' } }, chatRender: () => {}, chatBlocked: () => {}, chatDeviceId: () => 'dev-test', console };
      ctx.fetch = (url, opts) => { posts.push({ url, opts }); return Promise.resolve({ json: () => Promise.resolve({ ok: true, msg_id: 0 }) }); };
      vm.createContext(ctx);
      vm.runInContext(loaded.code, ctx);
      vm.runInContext(`S.plan = ['ubicacion', 'q1']; S.qi = 0; S.ans = {}; S.products = []; S.chatLog = []; S.chatJoined = true; S.ig = 'prueba-dup-test'; S.web = '';`, ctx);
      const T = vm.runInContext('T', ctx);
      vm.runInContext('chatAskCurrent(); chatAskCurrent();', ctx);
      const log = vm.runInContext('S.chatLog', ctx);
      check(`B4 ${lang} doble chatAskCurrent pushea UNA sola burbuja`, log.length === 1, 'chatLog=' + JSON.stringify(log));
      // (LOTE ONBOARDING-DIVERTIDO v760) La pregunta vigente ya no es una
      // burbuja con el título en negrita: es una TARJETA destacada
      // (entrada qcard). La única entrada es esa tarjeta y al pintarla
      // lleva la chapita, la intro y la pregunta en grande.
      check(`B5 ${lang} esa única entrada es la tarjeta destacada de la pregunta (qcard)`, log.length === 1 && log[0].w === 'bot' && log[0].qcard === 'ubicacion', JSON.stringify(log[0]));
      const cardHtml = vm.runInContext('chatLogHTML(S.chatLog[0])', ctx);
      check(`B5b ${lang} la tarjeta pinta chapita + pregunta en grande`, /oc-qcard/.test(cardHtml) && cardHtml.includes(T.qUbicacion), cardHtml.slice(0, 300));
      check(`B6 ${lang} el post al servidor también es uno solo`, posts.length === 1 && /kind/.test(posts[0].opts.body) && JSON.parse(posts[0].opts.body).kind === 'question', JSON.stringify(posts));
      // Control: tras rebuild (volver atrás) la pregunta vuelve a aparecer una vez.
      vm.runInContext('S.qi = 0; S.ans = {}; chatRebuildLog(); chatAskCurrent();', ctx);
      const log2 = vm.runInContext('S.chatLog', ctx);
      check(`B7 ${lang} tras rebuild la pregunta aparece de nuevo UNA vez (no cero)`, log2.filter((m) => m.qcard === 'ubicacion').length === 1, 'chatLog=' + JSON.stringify(log2));
    }

    // (c) El join inicializa lastId con el último id existente.
    {
      const calls = [];
      const ctx = { S: {}, TEST_KEY_QS: '', document: { getElementById: () => fakeBox, createElement: () => fakeEl(), documentElement: { lang: lang === 'ES' ? 'es' : 'en' } }, chatRender: () => {}, chatBlocked: () => {}, chatDeviceId: () => 'dev-test', console };
      ctx.fetch = (url, opts) => {
        calls.push({ url, method: (opts && opts.method) || 'GET' });
        if (opts && opts.method === 'POST') return Promise.resolve({ json: () => Promise.resolve({ ok: true, user_id: 88 }) });
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, messages: [{ id: 7, role: 'assistant', text: 'x' }, { id: 9, role: 'user', text: 'y' }] }) });
      };
      vm.createContext(ctx);
      vm.runInContext(loaded.code, ctx);
      vm.runInContext(`S.ig = 'prueba-dup-test'; S.web = ''; S.chatJoined = false; S.chatLastId = 0; S.chatLog = [];`, ctx);
      vm.runInContext('chatJoin()', ctx);
      const p = (async () => {
        await sleep(150);
        const lastId = vm.runInContext('S.chatLastId', ctx);
        const joined = vm.runInContext('S.chatJoined', ctx);
        const initFetch = calls.some((c) => c.method === 'GET' && /after=0/.test(c.url));
        check(`B8 ${lang} el join hace el fetch inicial del hilo (after=0)`, initFetch, JSON.stringify(calls));
        check(`B9 ${lang} el join inicializa lastId con el último id existente (9)`, joined === true && lastId === 9, 'joined=' + joined + ' lastId=' + lastId);
      })();
      parteB._pending = parteB._pending || [];
      parteB._pending.push(p);
    }
  }
}

(async () => {
  await parteA();
  parteB();
  if (parteB._pending) await Promise.all(parteB._pending);
  console.log(`\n${pass} pasaron, ${fail} fallaron.`);
  if (fails.length) console.log('fallaron: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
