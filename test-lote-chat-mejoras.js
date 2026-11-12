'use strict';
// test-lote-chat-mejoras.js — LOTE CHAT-MEJORAS (5 mejoras del chat, Valentino
// 10/11 21:33 «dale, arma todas»): 1) reaccionar a un mensaje (❤️/👍, un toque
// la pone, otro la saca) · 2) buscar en el chat (por texto, con salto al
// mensaje) · 3) fijar un mensaje (tira de fijados arriba, siempre visible) ·
// 4) editar o borrar un mensaje propio (editado marcado; borrado suave, la
// fila queda para auditar) · 5) galería de lo compartido (fotos y videos del
// cliente, en grilla, un toque abre la pieza). Todo con ownership: cada
// acción exige que el mensaje sea del usuario de la sesión. Gestos: SOLO
// mantener pulsado / clic derecho abren el menú del mensaje; NO hay swipe ni
// doble toque (el deslizar-para-responder es del otro lote y no se toca).
// Node puro: asserts estáticos + VM con DOM falso + boot real por HTTP con
// DATA_DIR aislada. Puerto 34731.
// Uso: node test-lote-chat-mejoras.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const DIR = __dirname;
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
const idxES = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- 1. Estampado (re-pineada por el preparador a base v912 + finales v917) ----------
t(srv.includes("const BUILD_ID = '20261105-v917';"), 'server: BUILD v917');
t(cnt(srv, '20261105-v917') === 1, 'server: BUILD v917 ×1 (solo el estampado)');
t(idxES.includes('/app.js?v=630'), 'index ES: app.js?v=630 (provisional)');
t(idxES.includes('/styles.css?v=20261255'), 'index ES: styles?v=20261255');
t(idxEN.includes('/styles.css?v=20261255'), 'index EN: styles?v=20261255 (mismo valor que ES)');
t(!idxEN.includes('/app.js?v='), 'index EN: no carga app.js (landing, sin ?v= que tocar)');

// ---------- 2. Servidor (estático) ----------
t(dbjs.includes('CREATE TABLE IF NOT EXISTS chat_message_meta'), 'db: tabla chat_message_meta');
t(dbjs.includes('reaction TEXT NOT NULL DEFAULT') && dbjs.includes('pinned INTEGER NOT NULL DEFAULT 0') && dbjs.includes('edited INTEGER NOT NULL DEFAULT 0') && dbjs.includes('deleted INTEGER NOT NULL DEFAULT 0'), 'db: meta con reaction/pinned/edited/deleted');
t(dbjs.includes('idx_chatmsgmeta_user_pinned'), 'db: índice meta por usuario+fijado');
t(srv.includes("app.post('/api/chat/react'"), 'server: POST /api/chat/react');
t(srv.includes("app.post('/api/chat/pin'"), 'server: POST /api/chat/pin');
t(srv.includes("app.post('/api/chat/edit'"), 'server: POST /api/chat/edit');
t(srv.includes("app.post('/api/chat/delete'"), 'server: POST /api/chat/delete');
t(srv.includes("app.get('/api/chat/search'"), 'server: GET /api/chat/search');
t(srv.includes("app.get('/api/chat/around'"), 'server: GET /api/chat/around');
t(srv.includes("reaction !== '' && reaction !== '❤️' && reaction !== '👍'"), 'server: react solo acepta ❤️/👍/vacío');
t(srv.includes("if (msg.role !== 'user') return res.json({ ok: false, error: 'no_propio' });"), 'server: editar/borrar solo mensajes propios (no_propio)');
t(srv.includes('LEFT JOIN chat_message_meta m ON m.message_id = c.id'), 'server: la carga hace LEFT JOIN con la meta');
t(srv.includes("(m.deleted IS NULL OR m.deleted = 0)"), 'server: la carga/búsqueda/salto excluyen borrados');
t(srv.includes("OR COALESCE(m.pinned,0) = 1"), 'server: los fijados entran aunque pasen los 7 días');
t(srv.includes('COALESCE(m.reaction,'), 'server: la carga devuelve reaction/pinned/edited por mensaje');
t(srv.includes("q.length < 2"), 'server: buscar exige mínimo 2 caracteres');
t(srv.includes("ESCAPE '\\\\'"), 'server: buscar escapa comodines LIKE');

// ---------- 3. Cliente (estático) ----------
t(app.includes('let CHAT_META = {};'), 'app: CHAT_META global');
t(app.includes('function pzChatMetaHtml(id)'), 'app: pzChatMetaHtml definida');
t(app.includes('function pzChatMsgFull(m)'), 'app: pzChatMsgFull definida');
t(app.includes('function pzChatRenderPinned()'), 'app: pzChatRenderPinned definida');
t(app.includes('function pzChatJumpTo(id)'), 'app: pzChatJumpTo definida');
t(app.includes('function pzChatLoadAround(id)'), 'app: pzChatLoadAround definida');
t(app.includes('function pzChatReact(id, reaction)'), 'app: pzChatReact definida');
t(app.includes('function pzChatPinToggle(id)'), 'app: pzChatPinToggle definida');
t(app.includes('function pzChatEditStart(id)'), 'app: pzChatEditStart definida');
t(app.includes('function pzChatEditSave(id)'), 'app: pzChatEditSave definida');
t(app.includes('function pzChatDelete(id)'), 'app: pzChatDelete definida');
t(app.includes('function pzChatOpenSheet(id, role)'), 'app: pzChatOpenSheet definida');
t(app.includes('function pzChatSearchRun(inputEl)'), 'app: pzChatSearchRun definida');
t(app.includes('function pzChatOpenGallery()'), 'app: pzChatOpenGallery definida');
t(app.includes('function pzChatCloseGallery()'), 'app: pzChatCloseGallery definida');
t(app.includes("data-tool=\"search\"") && app.includes("data-tool=\"gallery\""), 'app: toolbar Buscar + Fotos y videos en chatCardHTML');
t(app.includes('pz-chat-search-input') && app.includes('pz-chat-search-res'), 'app: caja de búsqueda con input y resultados');
t(app.includes("CHAT.map(m => pzChatMsgFull(m))"), 'app: la carga y la tarjeta usan pzChatMsgFull (con meta)');
t(app.includes('pzChatRenderPinned();'), 'app: la carga re-renderiza la tira de fijados');
// Gestos: mantener (500 ms, cancelado por touchmove) y contextmenu; NADA de swipe.
const blkA = app.indexOf('// ---------- LOTE CHAT-MEJORAS');
const blkB = app.indexOf('function chatCardHTML', blkA);
const blk = (blkA !== -1 && blkB > blkA) ? app.slice(blkA, blkB) : '';
t(blk.length > 5000, 'app: bloque CHAT-MEJORAS extraído (' + blk.length + ' chars)');
t(blk.includes('setTimeout(() => { if (holdId) pzChatOpenSheet(holdId, holdRole);'), 'app: mantener 500 ms abre el menú');
t(blk.includes("document.addEventListener('touchmove', holdCancel"), 'app: touchmove cancela el mantener (no pelea con el scroll)');
t(blk.includes("document.addEventListener('contextmenu'"), 'app: clic derecho abre el menú (escritorio)');
const blkCode = blk.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
t(!blkCode.includes('clientX') && !blkCode.includes('clientY') && !blkCode.includes('swipe'), 'app: sin swipe ni seguimiento de desplazamiento en código (no pelea con deslizar-para-responder)');
t(blk.includes("e.target.closest('button, a, input, textarea, .pz-chat-react')"), 'app: el menú no se abre sobre botones/enlaces/reacción');
t(blk.includes("a.kind === 'photo' || a.kind === 'video'"), 'app: la galería lista solo foto/video del cliente');
t(blk.includes("data-sheet-act=\"react-heart\"") && blk.includes("data-sheet-act=\"pin\"") && blk.includes("data-sheet-act=\"edit\"") && blk.includes("data-sheet-act=\"delete\""), 'app: el menú trae reaccionar, fijar, editar y borrar');
// M78: funciones llamadas desde el bloque existen definidas.
['pzChatMetaHtml', 'pzChatMsgFull', 'pzChatFechaCorta', 'pzChatBubbleById', 'pzChatRerenderBubble', 'pzChatRenderPinned', 'pzChatJumpTo', 'pzChatLoadAround', 'pzChatReact', 'pzChatPinToggle', 'pzChatEditStart', 'pzChatEditSave', 'pzChatEditCancel', 'pzChatDelete', 'pzChatOpenSheet', 'pzChatCloseSheet', 'pzChatSearchRun', 'pzChatOpenGallery', 'pzChatCloseGallery'].forEach(fn => {
  t(app.includes('function ' + fn + '('), 'M78: ' + fn + ' definida');
});
// ---------- CSS ----------
['.pz-chat-tools', '.pz-chat-search-input', '.pz-chat-search-row', '.pz-chat-pinned', '.pz-chat-pin-row', '.pz-chat-meta', '.pz-chat-react', '.pz-chat-edited', '.pz-chat-flash', '.pz-chat-sheet', '.pz-chat-edit-input', '.pz-chat-gallery', '.pz-chat-gallery-grid', '.pz-chat-gallery-view'].forEach(cls => {
  t(css.includes(cls), 'css: ' + cls);
});

// ---------- 4. VM: render real con DOM falso ----------
function extractFn(src, name) {
  const a = src.indexOf('function ' + name + '(');
  if (a === -1) return '';
  let i = src.indexOf('{', a), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(a, j + 1); }
  }
  return '';
}
{
  const fns = ['pzChatMetaHtml', 'pzChatMsgFull', 'pzChatFechaCorta', 'pzChatRenderPinned'].map(n => extractFn(app, n)).join('\n');
  t(fns.length > 1000, 'vm: funciones extraídas del bundle real');
  const boxEl = {
    _html: '',
    querySelector(sel) { return sel === '.pz-chat-pinned' ? null : null; },
    insertAdjacentHTML(pos, html) { this._html = html + this._html; },
  };
  const sandbox = {
    console,
    CHAT: [
      { role: 'assistant', text: '¡Hola! acá va tu semana con café', ts: 1793000000000, id: 11 },
      { role: 'user', text: 'me gusta el segundo posteo', ts: 1793000001000, id: 12 },
    ],
    CHAT_META: { 11: { reaction: '❤️', pinned: 1, edited: 0 }, 12: { reaction: '', pinned: 0, edited: 1 } },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    gzT: (es) => es,
    chatMsgHtml: (role, text, ts, id) => `<div class="chat-msg ${role === 'user' ? 'u' : 'ai'}" data-msg-id="${id}" data-ts="${ts}">${String(text)}</div>`,
    document: { getElementById: (id) => (id === 'chatBox' ? boxEl : null) },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fns, sandbox);
  const r1 = vm.runInContext(`pzChatMsgFull(CHAT[0])`, sandbox);
  t(String(r1).includes('❤️') && String(r1).includes('pz-chat-react'), 'vm: la reacción ❤️ se muestra debajo de la burbuja');
  const r2 = vm.runInContext(`pzChatMsgFull(CHAT[1])`, sandbox);
  t(String(r2).includes('editado') && String(r2).includes('pz-chat-edited'), 'vm: el mensaje editado lleva la marca «editado»');
  t(String(r1).endsWith('</div>'), 'vm: la meta se inyecta antes del </div> final (burbuja intacta)');
  vm.runInContext(`pzChatRenderPinned()`, sandbox);
  t(String(boxEl._html).includes('Fijados') && String(boxEl._html).includes('data-jump="11"') && String(boxEl._html).includes('acá va tu semana'), 'vm: la tira de fijados muestra el mensaje fijado con salto');
  t(!String(boxEl._html).includes('data-jump="12"'), 'vm: la tira de fijados NO muestra el mensaje sin fijar');
  const f = vm.runInContext(`pzChatFechaCorta(1793000000000)`, sandbox);
  t(/^\d{2}\/\d{2} \d{2}:\d{2}$/.test(String(f)), 'vm: fecha corta DD/MM HH:MM (' + f + ')');
}

// ---------- 5. Boot real: endpoints end-to-end ----------
const PORT = 34731;
const TEST_KEY = 'boot-test-key-chat-mejoras';
const ADMIN_TOKEN = 'test-admin-token-chat-mejoras';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-mejoras-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { execSync } = require('child_process');

async function reqJson(method, p, body, cookie, timeoutMs) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 30000) });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}
function seedDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    for (let i = 0; i < 10; i++) {
      try { fn(db); return; }
      catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
    }
  } finally { try { db.close(); } catch (e) {} }
}
function dbGet(dbPath, sql, ...args) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return db.prepare(sql).get(...args); }
  finally { try { db.close(); } catch (e) {} }
}

(async () => {
  console.log('— 5) boot real: reacciones / fijar / editar / borrar / buscar / galería —');
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN, NODE_PATH: nodeModules, TRIAL_TEST_KEY: TEST_KEY };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  const pid = child.pid;
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    t(up, 'boot: el servidor levanta en ' + PORT);
    if (!up) { console.log('--- salida del servidor (últimas 30 líneas) ---'); console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await reqJson('GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v917', 'boot: /api/version trae el BUILD v917', JSON.stringify(ver.json));
    const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
    t(idx.includes('/app.js?v=630') && idx.includes('/styles.css?v=20261255'), 'boot: el index servido trae ?v=630 y styles?v=20261255');
    const dbPath = path.join(tmpDir, 'posta.db');
    t(fs.existsSync(dbPath), 'boot: la DB existe en el DATA_DIR temporal');

    const joinA = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'chat-mejoras-a', device: 'test-device-chat-a' });
    t(joinA.status === 200 && joinA.json && joinA.json.ok === true && joinA.json.user_id > 0, 'boot: join A ok', JSON.stringify(joinA.json));
    if (!joinA.json || !joinA.json.user_id) throw new Error('sin join A');
    const uidA = joinA.json.user_id;
    const cookieA = joinA.setCookie ? String(joinA.setCookie).split(';')[0] : '';
    const joinB = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'chat-mejoras-b', device: 'test-device-chat-b' });
    t(joinB.status === 200 && joinB.json && joinB.json.user_id > 0 && joinB.json.user_id !== uidA, 'boot: join B ok (otro usuario)');
    const uidB = joinB.json.user_id;
    const cookieB = joinB.setCookie ? String(joinB.setCookie).split(';')[0] : '';

    // Siembra: 4 mensajes de A (1 propio, 1 de Posty, 1 propio con palabra
    // buscable, 1 viejo fijable) + 1 mensaje de B + assets para la galería.
    const ids = {};
    seedDb(dbPath, (db) => {
      const ins = db.prepare(`INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (?,?,?,?)`);
      ids.m1 = Number(ins.run(uidA, 'user', 'hola posty, este es mi texto de prueba', 'datetime(\'now\')').lastInsertRowid);
      ids.m2 = Number(ins.run(uidA, 'assistant', '¡Hola! acá va tu semana con café y medialunas', 'datetime(\'now\')').lastInsertRowid);
      ids.m3 = Number(ins.run(uidA, 'user', 'el precio del combo es 15000', 'datetime(\'now\')').lastInsertRowid);
      ids.m4 = Number(ins.run(uidA, 'assistant', 'mensaje viejo fijado para la semana', '2026-10-20 12:00:00').lastInsertRowid);
      ids.m5 = Number(ins.run(uidB, 'user', 'mensaje de otro cliente', 'datetime(\'now\')').lastInsertRowid);
      const insA = db.prepare(`INSERT INTO assets (user_id, file_path, kind) VALUES (?,?,?)`);
      insA.run(uidA, '/media/test-foto.jpg', 'photo');
      insA.run(uidA, '/media/test-video.mp4', 'video');
      insA.run(uidB, '/media/test-foto-b.jpg', 'photo');
    });
    t(ids.m1 > 0 && ids.m2 > ids.m1 && ids.m3 > ids.m2 && ids.m4 > ids.m3, 'boot: siembra de mensajes ok', JSON.stringify(ids));

    // 1) Reaccionar: pone, cambia, saca; inválida y de otro usuario fallan.
    let r = await reqJson('POST', '/api/chat/react', { id: ids.m2, reaction: '❤️' }, cookieA);
    t(r.json && r.json.ok === true && r.json.reaction === '❤️', 'boot: reaccionar ❤️ a un mensaje de Posty');
    r = await reqJson('POST', '/api/chat/react', { id: ids.m2, reaction: '👍' }, cookieA);
    t(r.json && r.json.ok === true && r.json.reaction === '👍', 'boot: cambiar la reacción a 👍');
    r = await reqJson('POST', '/api/chat/react', { id: ids.m2, reaction: '' }, cookieA);
    t(r.json && r.json.ok === true && r.json.reaction === '', 'boot: sacar la reacción con vacío');
    r = await reqJson('POST', '/api/chat/react', { id: ids.m2, reaction: '😂' }, cookieA);
    t(r.json && r.json.ok === false && r.json.error === 'reaccion_invalida', 'boot: reacción inválida rechazada');
    r = await reqJson('POST', '/api/chat/react', { id: ids.m5, reaction: '❤️' }, cookieA);
    t(r.json && r.json.ok === false && r.json.error === 'no_encontrado', 'boot: no se puede reaccionar al mensaje de otro cliente');
    r = await reqJson('POST', '/api/chat/react', { id: ids.m2, reaction: '❤️' }, cookieA);
    t(r.json && r.json.ok === true, 'boot: reaccionar ❤️ de nuevo (para verificar en la carga)');

    // 2) Fijar: el mensaje viejo entra en la carga aunque pase los 7 días.
    r = await reqJson('POST', '/api/chat/pin', { id: ids.m4, pinned: 1 }, cookieA);
    t(r.json && r.json.ok === true && r.json.pinned === 1, 'boot: fijar el mensaje viejo');
    let chat = await reqJson('GET', '/api/ideas/chat', undefined, cookieA);
    let msgs = (chat.json && chat.json.messages) || [];
    const m4 = msgs.find(m => Number(m.id) === ids.m4);
    t(!!m4 && Number(m4.pinned) === 1, 'boot: la carga incluye el fijado viejo con pinned=1', JSON.stringify(msgs.map(m => m.id)));
    const m2 = msgs.find(m => Number(m.id) === ids.m2);
    t(!!m2 && m2.reaction === '❤️' && Number(m2.pinned) === 0 && Number(m2.edited) === 0, 'boot: la carga trae reaction/pinned/edited por mensaje');
    r = await reqJson('POST', '/api/chat/pin', { id: ids.m4, pinned: 0 }, cookieA);
    t(r.json && r.json.ok === true && r.json.pinned === 0, 'boot: desfijar');
    chat = await reqJson('GET', '/api/ideas/chat', undefined, cookieA);
    msgs = (chat.json && chat.json.messages) || [];
    t(!msgs.find(m => Number(m.id) === ids.m4), 'boot: sin fijar, el mensaje viejo ya no entra en la carga');

    // 3) Editar: propio ok (marca editado), de Posty y de otro no.
    r = await reqJson('POST', '/api/chat/edit', { id: ids.m1, text: 'hola posty, texto corregido' }, cookieA);
    t(r.json && r.json.ok === true && r.json.text === 'hola posty, texto corregido', 'boot: editar mensaje propio');
    chat = await reqJson('GET', '/api/ideas/chat', undefined, cookieA);
    const m1 = ((chat.json && chat.json.messages) || []).find(m => Number(m.id) === ids.m1);
    t(!!m1 && m1.text === 'hola posty, texto corregido' && Number(m1.edited) === 1, 'boot: el editado queda con el texto nuevo y edited=1');
    r = await reqJson('POST', '/api/chat/edit', { id: ids.m2, text: 'intento editar a Posty' }, cookieA);
    t(r.json && r.json.ok === false && r.json.error === 'no_propio', 'boot: no se puede editar un mensaje de Posty');
    r = await reqJson('POST', '/api/chat/edit', { id: ids.m5, text: 'intento editar a otro' }, cookieA);
    t(r.json && r.json.ok === false && r.json.error === 'no_encontrado', 'boot: no se puede editar el mensaje de otro cliente');
    r = await reqJson('POST', '/api/chat/edit', { id: ids.m1, text: '   ' }, cookieA);
    t(r.json && r.json.ok === false && r.json.error === 'texto_vacio', 'boot: editar a vacío rechazado');

    // 4) Buscar: encuentra por texto; 1 carácter no busca.
    let s = await reqJson('GET', '/api/chat/search?q=' + encodeURIComponent('café'), undefined, cookieA);
    t(s.json && s.json.ok === true && (s.json.results || []).some(x => Number(x.id) === ids.m2), 'boot: buscar «café» encuentra el mensaje de Posty');
    s = await reqJson('GET', '/api/chat/search?q=' + encodeURIComponent('combo'), undefined, cookieA);
    t(s.json && (s.json.results || []).some(x => Number(x.id) === ids.m3), 'boot: buscar «combo» encuentra el mensaje propio');
    s = await reqJson('GET', '/api/chat/search?q=c', undefined, cookieA);
    t(s.json && s.json.ok === true && (s.json.results || []).length === 0, 'boot: buscar con 1 carácter devuelve vacío');

    // 5) Salto (around): ventana ordenada con el mensaje en el medio.
    const ar = await reqJson('GET', '/api/chat/around?id=' + ids.m2, undefined, cookieA);
    const am = (ar.json && ar.json.messages) || [];
    t(ar.json && ar.json.ok === true && am.some(x => Number(x.id) === ids.m2), 'boot: around trae el mensaje pedido');
    t(am.length >= 2 && am.every((x, i) => i === 0 || Number(x.id) > Number(am[i - 1].id)), 'boot: around ordenado por id ascendente');
    t(am.every(x => x.reaction !== undefined && x.pinned !== undefined && x.edited !== undefined), 'boot: around trae reaction/pinned/edited');
    const arBad = await reqJson('GET', '/api/chat/around?id=999999', undefined, cookieA);
    t(arBad.json && arBad.json.ok === false && arBad.json.error === 'no_encontrado', 'boot: around con id inexistente');

    // 6) Borrar: propio ok y suave (la fila queda); de Posty no.
    r = await reqJson('POST', '/api/chat/delete', { id: ids.m3 }, cookieA);
    t(r.json && r.json.ok === true, 'boot: borrar mensaje propio');
    chat = await reqJson('GET', '/api/ideas/chat', undefined, cookieA);
    msgs = (chat.json && chat.json.messages) || [];
    t(!msgs.find(m => Number(m.id) === ids.m3), 'boot: el borrado ya no sale en la carga');
    s = await reqJson('GET', '/api/chat/search?q=' + encodeURIComponent('combo'), undefined, cookieA);
    t(s.json && (s.json.results || []).length === 0, 'boot: el borrado ya no sale en la búsqueda');
    const metaRow = dbGet(dbPath, `SELECT deleted FROM chat_message_meta WHERE message_id = ?`, ids.m3);
    t(!!metaRow && Number(metaRow.deleted) === 1, 'boot: borrado suave — la fila de meta queda con deleted=1 (auditoría)');
    const msgRow = dbGet(dbPath, `SELECT text FROM chat_messages WHERE id = ?`, ids.m3);
    t(!!msgRow && msgRow.text === 'el precio del combo es 15000', 'boot: borrado suave — la fila del mensaje sigue en la DB');
    r = await reqJson('POST', '/api/chat/delete', { id: ids.m2 }, cookieA);
    t(r.json && r.json.ok === false && r.json.error === 'no_propio', 'boot: no se puede borrar un mensaje de Posty');

    // 7) Galería: solo el material de este cliente (foto + video).
    const assets = await reqJson('GET', '/api/assets', undefined, cookieA);
    const mine = (assets.json || []).filter(a => a && (a.kind === 'photo' || a.kind === 'video'));
    t(mine.some(a => a.file_path === '/media/test-foto.jpg') && mine.some(a => a.file_path === '/media/test-video.mp4'), 'boot: la galería lista la foto y el video del cliente');
    t(!mine.some(a => a.file_path === '/media/test-foto-b.jpg'), 'boot: la galería NO trae el material de otro cliente');
  } catch (e) {
    bad++;
    console.log('✗ boot: excepción ::', String((e && e.message) || e).slice(0, 400));
    console.log('--- salida del servidor (últimas 30 líneas) ---');
    console.log(out.split('\n').slice(-30).join('\n'));
  } finally {
    kill();
    try { await sleep(1500); } catch (e) {}
    try {
      const ss = execSync('ss -ltnp 2>/dev/null || ss -ltn 2>/dev/null', { encoding: 'utf8' });
      t(!ss.includes(':' + PORT + ' '), 'boot: el puerto ' + PORT + ' quedó libre tras matar por PID ' + pid);
    } catch (e) { t(true, 'boot: puerto liberado (ss no disponible)'); }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nchat-mejoras: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
