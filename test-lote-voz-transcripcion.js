'use strict';
// test-lote-voz-transcripcion.js — LOTE VOZ-TRANSCRIPCION (v937, captura de
// Valentino 10/11 21:38): la nota de voz muestra su transcripción debajo de
// la onda, entre comillas, + la pregunta de feedback útil/no útil.
// Lo que se verifica:
//  - La transcripción que se muestra es la MISMA que Posty usa para actuar
//    (la de /api/ideas/transcribe, guardada como texto del mensaje).
//  - El feedback se guarda por mensaje (chat_messages.transcript_feedback)
//    y no se vuelve a preguntar por ese mensaje (idempotente).
//  - «No útil» → Posty pregunta que lo repita o lo escriba (ES/EN).
//  - Si la transcripción falla, el comportamiento actual se mantiene.
//  - No se toca cómo se transcribe (Whisper) ni cómo Posty ejecuta.
// Node puro: asserts estáticos + VM con DOM falso para las funciones de
// app.js + boot real por HTTP con DATA_DIR aislada. Puerto 34712.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-voz-transcripcion.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const idxES = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

// ---------- DOM falso mínimo (solo lo que usan pzVoiceTxAttach/Feedback) ----------
function FakeEl(tag, cls) {
  this.tagName = (tag || 'div').toUpperCase();
  this.children = [];
  this.parentNode = null;
  this.dataset = {};
  this.style = {};
  this.className = cls || '';
  this._cls = (cls || '').split(/\s+/).filter(Boolean);
  this._attrs = {};
  this._listeners = {};
  this.disabled = false;
  this.textContent = '';
  this._html = '';
}
// className sincronizado con _cls (lo que usa _match): en el código real,
// document.createElement + el.className = '...' debe matchear querySelector.
Object.defineProperty(FakeEl.prototype, 'className', {
  get() { return this._cls.join(' '); },
  set(v) { this._cls = String(v || '').split(/\s+/).filter(Boolean); },
});
FakeEl.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
FakeEl.prototype.getAttribute = function (k) { return this._attrs[k]; };
FakeEl.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeEl.prototype.insertBefore = function (c, ref) {
  c.parentNode = this;
  const i = ref ? this.children.indexOf(ref) : -1;
  if (i === -1) this.children.push(c); else this.children.splice(i, 0, c);
  return c;
};
FakeEl.prototype.addEventListener = function (ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); };
FakeEl.prototype.fire = function (ev, arg) { (this._listeners[ev] || []).forEach((fn) => fn(arg)); };
FakeEl.prototype._match = function (sel) {
  if (!sel) return false;
  if (sel[0] === '.') return this._cls.includes(sel.slice(1));
  if (sel[0] === '[') {
    const m = sel.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);
    if (!m) return false;
    const v = this._attrs['data-' + m[1]];
    return m[2] === undefined ? v !== undefined : v === m[2];
  }
  return this.tagName.toLowerCase() === sel.toLowerCase();
};
FakeEl.prototype.querySelector = function (sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; };
FakeEl.prototype.querySelectorAll = function (sel) {
  const out = [];
  const walk = (el) => { for (const c of el.children) { if (c._match && c._match(sel)) out.push(c); walk(c); } };
  walk(this); return out;
};
Object.defineProperty(FakeEl.prototype, 'firstChild', { get() { return this.children[0] || null; } });
function parseHTML(html) {
  const root = new FakeEl('div');
  const stack = [root];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      const tn = new FakeEl('#text'); tn.textContent = m[4];
      stack[stack.length - 1].appendChild(tn);
      continue;
    }
    if (m[1] === '/') { if (stack.length > 1) stack.pop(); continue; }
    const el = new FakeEl(m[2].toLowerCase());
    const cls = (m[3] || '').match(/class="([^"]*)"/);
    if (cls) { el.className = cls[1]; el._cls = cls[1].split(/\s+/).filter(Boolean); }
    const dt = (m[3] || '').match(/data-txfb="([^"]*)"/);
    if (dt) el.setAttribute('data-txfb', dt[1]);
    stack[stack.length - 1].appendChild(el);
    stack.push(el);
  }
  return root.children;
}
Object.defineProperty(FakeEl.prototype, 'innerHTML', {
  get() { return this._html; },
  set(v) { this._html = String(v); this.children = []; for (const k of parseHTML(String(v))) this.appendChild(k); },
});

(async () => {
  // ---------- 1. Estampado ----------
  t(srv.includes("const BUILD_ID = '20261105-v937';"), 'server: BUILD v937');
  t(cnt(srv, '20261105-v937') === 1, 'server: BUILD v937 ×1 (solo el estampado)');
  t(cnt(srv, '20261105-v879') === 0, 'server: sin rastro de v879');
  t(idxES.includes('/app.js?v=647'), 'index ES: app.js?v=647');
  t(idxES.includes('/styles.css?v=20261269'), 'index ES: styles?v=20261269');
  t(idxEN.includes('/styles.css?v=20261269'), 'index EN: styles?v=20261269 (mismo valor que ES)');
  t(!idxEN.includes('/app.js?v='), 'index EN: no carga app.js (landing, sin ?v= que tocar)');

  // ---------- 2. Servidor: endpoint + columna ----------
  t(srv.includes("app.post('/api/ideas/chat/transcript-feedback'"), 'server: endpoint transcript-feedback existe');
  t(srv.includes('transcript_feedback'), 'server: usa transcript_feedback');
  t(srv.includes("no te entendí bien, ¿me lo repetís o me lo escribís?"), 'server: respuesta no-útil ES');
  t(srv.includes("i didn't quite catch that"), 'server: respuesta no-útil EN');
  t(srv.includes('ya_respondido'), 'server: idempotente (ya_respondido)');
  t(srv.includes('pzChatSaveReply(db, uid, reply)'), 'server: la respuesta no-útil se guarda como mensaje de Posty');
  t(srv.includes("app.post('/api/ideas/transcribe'") && srv.includes('transcribeAudio'), 'server: la transcripción (Whisper) no se tocó');
  t(dbjs.includes('ALTER TABLE chat_messages ADD COLUMN transcript_feedback'), 'db: ALTER transcript_feedback existe');
  t(dbjs.indexOf('ALTER TABLE chat_messages ADD COLUMN transcript_feedback') > dbjs.indexOf('CREATE TABLE IF NOT EXISTS chat_messages'), 'db: el ALTER está DESPUÉS del CREATE TABLE (no falla en DB nueva)');

  // ---------- 3. Cliente: funciones + enganches ----------
  t(app.includes('function pzVoiceTxHTML(transcript)'), 'app: pzVoiceTxHTML definida');
  t(app.includes('function pzVoiceTxAttach(el, transcript)'), 'app: pzVoiceTxAttach definida');
  t(app.includes('function pzVoiceTxFeedback(el, transcript, useful)'), 'app: pzVoiceTxFeedback definida');
  t(app.includes('pzVoiceTxAttach(VOICE_BUBBLE_EL, transcript)'), 'app: voiceSend engancha la transcripción a la burbuja');
  t(app.includes('pzVoiceTxAttach(nb, p.text)'), 'app: pzVoicePendingDeliver engancha la transcripción');
  t(!app.includes('sin transcripto en la burbuja'), 'app: el comentario viejo («sin transcripto») ya no está');
  t(app.includes("api.post('/api/ideas/chat/transcript-feedback'"), 'app: el feedback pega al endpoint nuevo');
  t(cnt(app, 'pzVoiceTxHTML') >= 2, 'M78: pzVoiceTxHTML (def + uso en Attach)');
  t(cnt(app, 'pzVoiceTxAttach') >= 3, 'M78: pzVoiceTxAttach (def + 2 enganches)');
  t(cnt(app, 'pzVoiceTxFeedback') >= 2, 'M78: pzVoiceTxFeedback (def + llamada en Attach)');

  // ---------- 4. CSS ----------
  for (const cls of ['.vb-tx{', '.vb-tx-text{', '.vb-tx-fb{', '.vb-tx-q{', '.vb-tx-opts{', '.vb-tx-opt{', '.vb-tx-thanks{']) {
    t(css.includes(cls), 'css: ' + cls + ' existe');
  }
  t(css.includes('.vb-tx-q b{color:#1E9E5A'), 'css: las opciones van en verde (como la captura)');

  // ---------- 5. VM: render de la transcripción + feedback (DOM falso) ----------
  const a = app.indexOf('function pzVoiceTxHTML(transcript)');
  const b = app.indexOf('// (LOTE VOZ-LINDA)', a);
  const code = app.slice(a, b);
  t(code.length > 1500 && code.includes('pzVoiceTxFeedback'), 'VM: bloque de funciones extraído (' + code.length + ' chars)');
  let langEn = false;
  let apiNext = { ok: true };
  const apiCalls = [];
  const appended = [];
  const CHAT = [];
  const fakeBox = new FakeEl('div', 'chat-box');
  const sandbox = {
    console,
    document: {
      createElement: (tag) => new FakeEl(tag),
      getElementById: (id) => (id === 'chatBox' ? fakeBox : null),
    },
    api: { post: async (url, body) => { apiCalls.push({ url, body }); return apiNext; } },
    CHAT,
    chatAppendMsg: (box, html, ts) => { appended.push({ box, html, ts }); return null; },
    chatMsgHtml: (role, text, ts) => '[' + role + '] ' + text,
    chatScroll: () => {},
    vozEn: () => langEn,
    esc: (s) => String(s ?? '').replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const tick = () => new Promise((r) => setTimeout(r, 15));
  const TX = 'Tiras esa clínica podría que tenés ahí en mándalo a tirar coco boludo.';
  // ES
  langEn = false;
  const htmlES = vm.runInContext('pzVoiceTxHTML(' + JSON.stringify(TX) + ')', sandbox);
  t(htmlES.includes('&ldquo;' + TX + '&rdquo;'), 'VM ES: la transcripción va entre comillas');
  t(htmlES.includes('¿La transcripción estuvo bien?'), 'VM ES: pregunta de feedback');
  t(htmlES.includes('data-txfb="util"') && htmlES.includes('>sí<'), 'VM ES: opción «sí»');
  t(htmlES.includes('data-txfb="no_util"') && htmlES.includes('>no<'), 'VM ES: opción «no»');
  // EN
  langEn = true;
  const htmlEN = vm.runInContext('pzVoiceTxHTML(' + JSON.stringify(TX) + ')', sandbox);
  t(htmlEN.includes('Was this transcript <b>useful</b> or <b>not useful</b>?'), 'VM EN: pregunta de feedback (captura)');
  t(htmlEN.includes('>useful<') && htmlEN.includes('>not useful<'), 'VM EN: opciones useful / not useful');
  // Escape: la transcripción con HTML no rompe la burbuja.
  langEn = false;
  const htmlX = vm.runInContext('pzVoiceTxHTML(' + JSON.stringify('<script>alert(1)</script> hola') + ')', sandbox);
  t(!htmlX.includes('<script>') && htmlX.includes('&lt;script&gt;'), 'VM: la transcripción se escapa (sin inyección HTML)');
  // Attach: una sola vez, antes de la hora.
  const bubble = new FakeEl('div', 'chat-msg u vb-voice');
  sandbox.bubble = bubble;
  const hora = new FakeEl('span', 'chat-msg-hora'); hora.textContent = '21:38';
  bubble.appendChild(hora);
  const att1 = vm.runInContext('pzVoiceTxAttach(bubble, ' + JSON.stringify(TX) + ')', sandbox);
  t(att1 === true, 'VM: attach devuelve true la primera vez');
  t(bubble.querySelector('.vb-tx') !== null, 'VM: la burbuja tiene .vb-tx');
  t(bubble.children.indexOf(bubble.querySelector('.vb-tx')) < bubble.children.indexOf(hora), 'VM: la transcripción va antes de la hora');
  t(bubble.querySelectorAll('[data-txfb]').length === 2, 'VM: dos botones de feedback');
  const att2 = vm.runInContext('pzVoiceTxAttach(bubble, ' + JSON.stringify(TX) + ')', sandbox);
  t(att2 === false && bubble.querySelectorAll('.vb-tx').length === 1, 'VM: segundo attach no duplica');
  // Feedback útil.
  langEn = false; apiNext = { ok: true, feedback: 'util' }; apiCalls.length = 0; appended.length = 0;
  const btnUtil = bubble.querySelectorAll('[data-txfb]')[0];
  btnUtil.fire('click', { currentTarget: btnUtil });
  await tick();
  t(apiCalls.length === 1 && apiCalls[0].url === '/api/ideas/chat/transcript-feedback' && apiCalls[0].body.transcript === TX && apiCalls[0].body.useful === true, 'VM: útil pega al endpoint con {transcript, useful:true}');
  t(bubble.querySelector('.vb-tx-q').style.display === 'none' && bubble.querySelector('.vb-tx-opts').style.display === 'none', 'VM: útil esconde la pregunta y las opciones');
  t(bubble.querySelector('.vb-tx-thanks') !== null, 'VM: útil muestra «gracias»');
  t(appended.length === 0, 'VM: útil NO agrega mensaje de Posty');
  // Segundo click: no re-pega (ya respondido).
  btnUtil.fire('click', { currentTarget: btnUtil });
  await tick();
  t(apiCalls.length === 1, 'VM: segundo click no vuelve a pegar (dataset.done)');
  // Feedback no útil (burbuja nueva).
  const bubble2 = new FakeEl('div', 'chat-msg u vb-voice');
  sandbox.bubble2 = bubble2;
  vm.runInContext('pzVoiceTxAttach(bubble2, ' + JSON.stringify(TX) + ')', sandbox);
  langEn = false; apiNext = { ok: true, feedback: 'no_util', reply: 'no te entendí bien, ¿me lo repetís o me lo escribís?' }; apiCalls.length = 0; appended.length = 0; CHAT.length = 0;
  const btnNo = bubble2.querySelectorAll('[data-txfb]')[1];
  btnNo.fire('click', { currentTarget: btnNo });
  await tick();
  t(apiCalls.length === 1 && apiCalls[0].body.useful === false, 'VM: no-útil pega con useful:false');
  t(appended.length === 1 && appended[0].html.includes('no te entendí bien'), 'VM: no-útil muestra el mensaje de Posty en el chat');
  t(CHAT.length === 1 && CHAT[0].role === 'assistant', 'VM: no-útil agrega la respuesta al CHAT');
  // Endpoint dice ya_respondido: se esconde sin duplicar.
  const bubble3 = new FakeEl('div', 'chat-msg u vb-voice');
  sandbox.bubble3 = bubble3;
  vm.runInContext('pzVoiceTxAttach(bubble3, ' + JSON.stringify(TX) + ')', sandbox);
  apiNext = { ok: false, error: 'ya_respondido' }; apiCalls.length = 0;
  const btn3 = bubble3.querySelectorAll('[data-txfb]')[0];
  btn3.fire('click', { currentTarget: btn3 });
  await tick();
  t(apiCalls.length === 1 && bubble3.querySelector('.vb-tx-fb').style.display === 'none', 'VM: ya_respondido esconde el feedback sin duplicar');

  // ---------- 6. Boot real por HTTP (DATA_DIR aislada, puerto 34712) ----------
  const PORT = 34712;
  const BASE = 'http://127.0.0.1:' + PORT;
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-tx-'));
  const env = { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'test', SESSION_SECRET: 'test', OPENAI_API_KEY: '', RESEND_API_KEY: '' };
  const waitBoot = async (tries = 120) => {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };
  const apiH = async (cookie, method, p, body) => {
    const rr = await fetch(BASE + p, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await rr.json(); } catch (e) {}
    return { status: rr.status, data };
  };
  // Seed/check en la DB del DATA_DIR aislado (proceso node aparte, cwd=release).
  const dbRun = (code, extraEnv) => {
    const out = execFileSync('node', ['-e', code], { cwd: __dirname, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 30000 });
    return out;
  };
  const seedCode = `
    const db = require('./db').db || require('./db');
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.SEED_EMAIL);
    if (!u) { console.error('seed: sin usuario'); process.exit(1); }
    const uid = u.id;
    if (process.env.SEED_LANG) db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(process.env.SEED_LANG, uid);
    const txs = JSON.parse(process.env.SEED_TXS || '[]');
    for (const tx of txs) db.prepare("INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'user', ?)").run(uid, tx);
    console.log('seed ok uid=' + uid);
  `;
  const checkCode = `
    const db = require('./db').db || require('./db');
    const rows = db.prepare(process.env.Q).all(...JSON.parse(process.env.P || '[]'));
    console.log(JSON.stringify(rows));
  `;
  const dbQuery = (q, params) => JSON.parse(dbRun(checkCode, { Q: q, P: JSON.stringify(params || []) }));
  const srvProc = spawn('node', ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srvProc.stdout.on('data', (d) => { srvLog += d; });
  srvProc.stderr.on('data', (d) => { srvLog += d; });
  try {
    t(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(BASE + '/api/version')).json();
    t(ver.build === '20261105-v937', 'boot: /api/version 20261105-v937 (vino ' + ver.build + ')');
    const idx = await (await fetch(BASE + '/')).text();
    t(idx.includes('/app.js?v=647') && idx.includes('/styles.css?v=20261269'), 'boot: index servido con ?v=647 y styles?v=20261269');
    const appSrv = await (await fetch(BASE + '/app.js?v=647')).text();
    t(appSrv.includes('function pzVoiceTxHTML'), 'boot: bundle servido con pzVoiceTxHTML');
    t(appSrv.includes('function pzVoiceTxFeedback'), 'boot: bundle servido con pzVoiceTxFeedback');
    const cssSrv = await (await fetch(BASE + '/styles.css?v=20261269')).text();
    t(cssSrv.includes('.vb-tx{') && cssSrv.includes('.vb-tx-opt{'), 'boot: css servido con .vb-tx y .vb-tx-opt');
    // Sin sesión → 401.
    const noAuth = await apiH('', 'POST', '/api/ideas/chat/transcript-feedback', { transcript: 'hola', useful: true });
    t(noAuth.status === 401, 'boot: sin sesión, feedback → 401 (vino ' + noAuth.status + ')');
    // Registro usuario A (ES).
    const emailA = 'voz-tx-a@example.com';
    const rrA = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password: 'test1234', business_name: 'Café Aroma Test' }) });
    const cookieA = (rrA.headers.getSetCookie ? rrA.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    t((rrA.status === 200 || rrA.status === 201) && cookieA.length > 0, 'boot: registro A deja sesión');
    const TXA = 'Tiras esa clínica podría que tenés ahí en mándalo a tirar coco boludo.';
    const TXA2 = 'Me extraña gordito, avivate, boludo.';
    dbRun(seedCode, { SEED_EMAIL: emailA, SEED_TXS: JSON.stringify([TXA, TXA2]) });
    // La columna existe en la DB nueva (el ALTER corre tras el CREATE).
    const cols = dbQuery("SELECT name FROM pragma_table_info('chat_messages') WHERE name = 'transcript_feedback'");
    t(cols.length === 1 && cols[0].name === 'transcript_feedback', 'boot: la columna transcript_feedback existe en DB nueva');
    // Feedback útil.
    const fb1 = await apiH(cookieA, 'POST', '/api/ideas/chat/transcript-feedback', { transcript: TXA, useful: true });
    t(fb1.status === 200 && fb1.data && fb1.data.ok === true && fb1.data.feedback === 'util', 'boot: útil → ok + feedback util');
    t(!fb1.data.reply, 'boot: útil NO trae reply de Posty');
    const row1 = dbQuery('SELECT transcript_feedback FROM chat_messages WHERE user_id = (SELECT id FROM users WHERE email = ?) AND text = ?', [emailA, TXA]);
    t(row1.length === 1 && row1[0].transcript_feedback === 'util', 'boot: útil queda guardado en la DB');
    // Segundo feedback al mismo mensaje → ya_respondido, no se pisa.
    const fb1b = await apiH(cookieA, 'POST', '/api/ideas/chat/transcript-feedback', { transcript: TXA, useful: false });
    t(fb1b.data && fb1b.data.ok === false && fb1b.data.error === 'ya_respondido', 'boot: segundo feedback → ya_respondido');
    const row1b = dbQuery('SELECT transcript_feedback FROM chat_messages WHERE user_id = (SELECT id FROM users WHERE email = ?) AND text = ?', [emailA, TXA]);
    t(row1b.length === 1 && row1b[0].transcript_feedback === 'util', 'boot: ya_respondido no pisa el feedback');
    // Feedback no útil → reply ES + mensaje de Posty guardado.
    const fb2 = await apiH(cookieA, 'POST', '/api/ideas/chat/transcript-feedback', { transcript: TXA2, useful: false });
    t(fb2.status === 200 && fb2.data && fb2.data.ok === true && fb2.data.feedback === 'no_util', 'boot: no-útil → ok + feedback no_util');
    t(fb2.data && typeof fb2.data.reply === 'string' && fb2.data.reply.includes('no te entendí bien'), 'boot: no-útil trae el reply ES');
    const row2 = dbQuery('SELECT transcript_feedback FROM chat_messages WHERE user_id = (SELECT id FROM users WHERE email = ?) AND text = ?', [emailA, TXA2]);
    t(row2.length === 1 && row2[0].transcript_feedback === 'no_util', 'boot: no-útil queda guardado');
    const asst = dbQuery("SELECT text FROM chat_messages WHERE user_id = (SELECT id FROM users WHERE email = ?) AND role = 'assistant' AND text LIKE '%no te entendí bien%'", [emailA]);
    t(asst.length === 1, 'boot: el mensaje de Posty («no te entendí bien») queda en el historial');
    // Transcript desconocido → no_encontrado.
    const fb3 = await apiH(cookieA, 'POST', '/api/ideas/chat/transcript-feedback', { transcript: 'esto nunca se dijo', useful: true });
    t(fb3.data && fb3.data.ok === false && fb3.data.error === 'no_encontrado', 'boot: transcript desconocido → no_encontrado');
    // Sin transcript → sin_transcript.
    const fb4 = await apiH(cookieA, 'POST', '/api/ideas/chat/transcript-feedback', { transcript: '   ', useful: true });
    t(fb4.data && fb4.data.ok === false && fb4.data.error === 'sin_transcript', 'boot: transcript vacío → sin_transcript');
    // Usuario B (EN): la respuesta no-útil sale en inglés.
    const emailB = 'voz-tx-b@example.com';
    const rrB = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailB, password: 'test1234', business_name: 'Bakery Test' }) });
    const cookieB = (rrB.headers.getSetCookie ? rrB.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    t(cookieB.length > 0, 'boot: registro B deja sesión');
    const TXB = 'Hello, this is a test voice note.';
    dbRun(seedCode, { SEED_EMAIL: emailB, SEED_LANG: 'en', SEED_TXS: JSON.stringify([TXB]) });
    const fbB = await apiH(cookieB, 'POST', '/api/ideas/chat/transcript-feedback', { transcript: TXB, useful: false });
    t(fbB.data && fbB.data.ok === true && typeof fbB.data.reply === 'string' && fbB.data.reply.includes("didn't quite catch that"), 'boot: no-útil EN trae el reply en inglés');
    // B no puede dar feedback sobre un mensaje de A.
    const fbX = await apiH(cookieB, 'POST', '/api/ideas/chat/transcript-feedback', { transcript: TXA2, useful: true });
    t(fbX.data && fbX.data.ok === false && fbX.data.error === 'no_encontrado', 'boot: feedback sobre mensaje de otro usuario → no_encontrado');
  } finally {
    try { srvProc.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    let portFree = false;
    try { await fetch(BASE + '/api/version'); } catch (e) { portFree = true; }
    t(portFree, 'boot: puerto 34712 libre tras matar por PID');
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }

  // ---------- Resumen ----------
  console.log(`\nvoz-transcripcion: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
