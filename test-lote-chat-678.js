// Suite del lote CHAT-678: compartir posteo al chat (6), varias fotos a la vez (7),
// dejarle una nota a Posty (8). La 9 (Posty responde con nota de voz) está VETADA:
// no se construye y no se prueba.
// Base: v879 (commit a49996de). BUILD final 20261105-v936 (asignado por el tablero al re-basar sobre v935).
// Uso: node test-lote-chat-678.js   (puerto 34721, DATA_DIR en /tmp, sin clave de IA)
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const net = require('net');
const { spawn } = require('child_process');
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const DIR = __dirname;
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public', 'styles.css'), 'utf8');
const dbjs = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (detail ? ' — ' + String(detail).slice(0, 300) : '')); }
}
const count = (s, sub) => (s.split(sub).length - 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- 1. ESTATICO
console.log('== 1. ESTATICO ==');
check('1a BUILD estampado 20261105-v936', count(srv, "BUILD_ID = '20261105-v936'") === 1, count(srv, "BUILD_ID = '20261105-v936'"));
check('1b BUILD v879 ya no aparece como BUILD del server', !srv.includes("BUILD_ID = 'v879'"));
check('1c db.js: ALTER chat_messages post_id (fuera del template literal)', dbjs.includes('ALTER TABLE chat_messages ADD COLUMN post_id INTEGER NOT NULL DEFAULT 0'));
check('1d db.js: ALTER chat_messages photos_json (fuera del template literal)', dbjs.includes("ALTER TABLE chat_messages ADD COLUMN photos_json TEXT NOT NULL DEFAULT ''"));
// Las ALTER van como sentencias sueltas DESPUES del cierre del db.exec (no dentro del literal).
{
  const iAlter = dbjs.indexOf('ALTER TABLE chat_messages ADD COLUMN post_id');
  const iClose = dbjs.indexOf('`);\n// Historial de versiones de borradores');
  check('1e las ALTER van despues del cierre del db.exec del schema (no dentro del literal)', iAlter > 0 && iClose > 0 && iAlter > iClose, 'alter=' + iAlter + ' cierre=' + iClose);
}
check('1f endpoint POST /api/chat/compartir-posteo', srv.includes("app.post('/api/chat/compartir-posteo'"));
check('1g endpoint POST /api/chat/nota', srv.includes("app.post('/api/chat/nota'"));
check('1h compartir: valida postId y que el posteo sea del usuario (404 si no)', srv.includes("WHERE id = ? AND user_id = ?") && srv.includes("res.status(404).json({ error: 'Posteo no encontrado' })"));
check('1i compartir: NO toca el posteo (sin UPDATE posts en ese endpoint)', (() => {
  const a = srv.indexOf("app.post('/api/chat/compartir-posteo'");
  const b = srv.indexOf("app.post('/api/chat/nota'", a);
  return a > 0 && b > a && !srv.slice(a, b).includes('UPDATE posts');
})());
check('1j compartir: inserta user + ack con post_id y devuelve messageId/post', srv.includes("INSERT INTO chat_messages (user_id, role, text, post_id)") && srv.includes("messageId: ins.lastInsertRowid"));
check('1k nota: valida minimo 4 caracteres (400 si corta) y recorta a 500', srv.includes("texto.length < 4") && srv.includes(".trim().slice(0, 500)") && srv.includes("nota_corta"));
check('1l nota: guarda en memoria_cliente via guardarMemoria (tipo nota)', srv.includes("memoriaCliente.guardarMemoria(db, uid, [{ tipo: 'nota', texto }], texto)"));
check('1m nota: inserta user + ack y devuelve guardada', srv.includes('Nota a Posty: ') && srv.includes('guardada: guardadas > 0, messageId: ins.lastInsertRowid'));
check('1n GET /api/ideas/chat: SELECT incluye post_id y photos_json', srv.includes('c.post_id, c.photos_json, c.caption_post_id')); // (re-base v936: el SELECT fusionado es el de v935 con JOIN+meta; el literal v879 ya no existe. El comportamiento lo prueban 6d/7e en el boot.)
check('1o GET /api/ideas/chat: parsea photos (solo /media/, tope 10) y adjunta post', srv.includes("m.photos = JSON.parse(m.photos_json || '[]')") && srv.includes("m.photos = m.photos.filter(p => typeof p === 'string' && p.startsWith('/media/')).slice(0, 10)") && srv.includes('SELECT id, image_path, caption, scheduled_at, status, media_type FROM posts WHERE user_id = ? AND id IN ('));
check('1p POST /api/ideas/chat: userPhotos se calcula una sola vez arriba del handler', srv.includes("const userPhotos = (Array.isArray(photoPaths) ? photoPaths : [])"));
check('1q POST /api/ideas/chat: 6 INSERTs con photos_json (saludo, conserje, gustos x2, cerebro)', (() => {
  const a = srv.indexOf("app.post('/api/ideas/chat'");
  const b = srv.indexOf("app.post('/api/ideas/transcribe'", a);
  return a > 0 && b > a && count(srv.slice(a, b), 'photos_json) VALUES') === 6;
})(), 'en el handler: ' + (() => { const a = srv.indexOf("app.post('/api/ideas/chat'"); const b = srv.indexOf("app.post('/api/ideas/transcribe'", a); return count(srv.slice(a, b), 'photos_json) VALUES'); })());
check('1r cliente: chatMsgHtml rinde tarjeta del posteo (postcard + data-post-id)', app.includes('pz-chat-postcard') && app.includes('data-post-id'));
check('1s cliente: chatMsgHtml rinde grilla de fotos (photogrid, video si .mp4)', app.includes('pz-chat-photogrid') && app.includes('<video src=') && app.includes('muted preload="metadata"'));
check('1t cliente: chatLoadHistory lleva photos y post por mensaje', app.includes("photos: Array.isArray(m.photos) ? m.photos : []") && app.includes("post: (m.post && m.post.id) ? m.post : null"));
check('1u cliente: chatSend manda photoPaths y la burbuja optimista ya lleva la grilla', app.includes('photoPaths: CHAT_PHOTOS.map(p => p && p.file_path).filter(Boolean)') && app.includes("chatMsgHtml('user', sendText, sts, 0, null, null, unsentPaths)"));
check('1v cliente: picker permite varias fotos (multiple, tope 10)', app.includes('CHAT_FOTOS_MAX = 10') && app.includes('multiple') && app.includes('chatUploadPhotos'));
check('1w cliente: boton Compartir en el chat en el detalle del posteo', app.includes('apvShareChat') && app.includes('Compartir en el chat'));
check('1x cliente: pzCompartirPosteoChat llama al endpoint y ancla el posteo', app.includes("api.post('/api/chat/compartir-posteo'") && app.includes('pzHablarDePosteo(post)'));
check('1y cliente: clic en la tarjeta del chat abre el posteo (pzChatPostcardBind)', app.includes('pzChatPostcardBind') && app.includes("location.hash = '#/app/post/' + encodeURIComponent(b.dataset.postId)"));
check('1z cliente: nota a Posty en el chat (boton + form + guardar)', app.includes('pzNotaBtn') && app.includes('pzNotaForm') && app.includes('pzNotaInput') && app.includes('pzNotaGuardar'));
check('1aa cliente: pzNotaGuardar llama a /api/chat/nota y recarga el historial', app.includes("api.post('/api/chat/nota'") && app.includes('await chatLoadHistory()'));
check('1ab CSS: postcard, photogrid y nota-row', css.includes('.pz-chat-postcard') && css.includes('.pz-chat-photogrid') && css.includes('.pz-nota-row'));
check('1ac la 9 NO se construye: no hay endpoint ni funcion de Posty respondiendo con nota de voz', !srv.includes('/api/chat/responder-voz') && !app.includes('pzResponderVoz') && !app.includes('postyVoiceReply'));
check('1ad flujo de confirmacion intacto (aprobar en sitio + programar no se tocan)', app.includes('pzAprobarEnSitio') && srv.includes('/api/subir-foto/programar'));

// ---------------------------------------------------------------- 2. VM: chatMsgHtml
console.log('== 2. VM: chatMsgHtml ==');
{
  const a = app.indexOf('function chatMsgHtml(');
  const b = app.indexOf('async function logoCandidateRespond', a);
  check('2a chatMsgHtml extraible de app.js', a > 0 && b > a);
  const sandbox = {
    console,
    esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    linkifyEsc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    chatStripCelebrate: s => s,
    chatStripFpMarker: s => s,
    chatStripLcMarker: s => s,
    chatHoraHtml: () => '',
    pzIc: () => '',
    gzT: x => x,
    FP_MARKER_RE: /(?!)/, LC_MARKER_RE: /(?!)/, FOTO_MARKER_RE: /(?!)/,
  };
  vm.createContext(sandbox);
  let vmOk = true, vmErr = '';
  try { vm.runInContext(app.slice(a, b), sandbox); } catch (e) { vmOk = false; vmErr = e.message; }
  check('2b chatMsgHtml corre en VM con stubs', vmOk, vmErr);
  if (vmOk) {
    const post = { id: 42, image_path: '/media/foto-1.jpg', caption: 'Mi posteo de prueba\nsegunda línea', scheduled_at: '2026-11-12 19:00', status: 'scheduled' };
    const h1 = sandbox.chatMsgHtml('user', 'Te comparto este posteo para hablar de él', 123, 5, null, null, [], post);
    check('2c tarjeta del posteo: postcard + data-post-id + miniatura + caption + fecha + status', h1.includes('pz-chat-postcard') && h1.includes('data-post-id="42"') && h1.includes('/media/foto-1.jpg') && h1.includes('Mi posteo de prueba') && h1.includes('2026-11-12') && h1.includes('scheduled') && h1.includes('Te comparto este posteo'), h1.slice(0, 200));
    const h2 = sandbox.chatMsgHtml('user', '📷 Te mando 3 fotos', 123, 6, null, null, ['/media/foto-1.jpg', '/media/foto-2.jpg', '/media/foto-3.jpg'], null);
    check('2d 3 fotos: UNA burbuja con grilla y las 3 rutas', count(h2, 'chat-msg u') === 1 && h2.includes('pz-chat-photogrid') && h2.includes('/media/foto-1.jpg') && h2.includes('/media/foto-2.jpg') && h2.includes('/media/foto-3.jpg') && h2.includes('Te mando 3 fotos'), h2.slice(0, 200));
    const h3 = sandbox.chatMsgHtml('user', '📷 Te mando 1 foto', 123, 7, null, null, ['/media/video-1.mp4'], null);
    check('2e video en la grilla rinde <video> (no <img>)', h3.includes('<video') && !h3.includes('<img'), h3.slice(0, 200));
    const h4 = sandbox.chatMsgHtml('user', 'hola', 123, 8, null, null, [], null);
    check('2f mensaje normal sin post ni fotos: burbuja plana, sin postcard ni grilla', !h4.includes('pz-chat-postcard') && !h4.includes('pz-chat-photogrid') && h4.includes('hola'), h4.slice(0, 200));
    const h5 = sandbox.chatMsgHtml('assistant', 'Anotado ✅ Lo tengo en cuenta.', 123, 9, null, null, [], null);
    check('2g ack de la nota: burbuja de Posty normal', h5.includes('chat-msg ai') && h5.includes('Anotado'), h5.slice(0, 200));
  }
}

// ---------------------------------------------------------------- 3. BOOT EN VIVO
console.log('== 3. BOOT EN VIVO ==');
const PORT = 34721;
const TEST_KEY = 'boot-test-key-chat-678';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-chat-678-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
function startServer() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', RESEND_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY, SUPERVISION_OFF: '1', ADMIN_TOKEN: 'test-admin-chat-678', SESSION_SECRET: 'test-chat-678' };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  return { child, getOut: () => out };
}
function reqJson(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...(cookie ? { Cookie: cookie } : {}) } }, (res) => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, raw: b, setCookie: res.headers['set-cookie'] }); });
    });
    req.on('error', e => resolve({ status: 0, json: null, raw: String(e), setCookie: null }));
    if (data) req.write(data);
    req.end();
  });
}
async function waitUp(s, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await reqJson('GET', '/api/version');
    if (r.status === 200 && r.json && r.json.build) return r.json;
    await sleep(500);
  }
  return null;
}
function waitExit(child) { return new Promise(r => { if (child.exitCode !== null) return r(child.exitCode); child.once('exit', c => r(c)); setTimeout(() => r(null), 8000); }); }
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.end(); resolve(false); });
    s.on('error', () => resolve(true));
  });
}
function seedDb(fn) {
  for (let i = 0; i < 30; i++) {
    try {
      const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
      try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
      const out = fn(db);
      db.close();
      return out;
    } catch (e) {
      if (/BUSY|LOCKED|busy/i.test(e.message)) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200); continue; }
      throw e;
    }
  }
  throw new Error('seedDb: DB bloqueada tras 30 reintentos');
}
function dbCount(sql, ...params) {
  return seedDb(db => { const r = db.prepare(sql).get(...params); return r ? (r.c !== undefined ? r.c : r) : null; });
}
(async () => {
  let s1 = null;
  try {
    s1 = startServer();
    const v = await waitUp(s1, 45000);
    check('3a boot: /api/version responde con el BUILD del lote', v && v.build === '20261105-v936', JSON.stringify(v));
    if (!v) throw new Error('boot sin /api/version; salida: ' + s1.getOut().slice(-800));

    // Usuario 1 (cliente) + usuario 2 (otro cliente)
    const j1 = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'chat-678-uno', device: 'test-device-678-1' });
    check('3b join usuario 1 ok', j1.status === 200 && j1.json && j1.json.ok === true && j1.json.user_id > 0, JSON.stringify(j1.json));
    if (!j1.json || !j1.json.user_id) throw new Error('sin join 1');
    const cookie1 = j1.setCookie ? String(j1.setCookie).split(';')[0] : '';
    const uid1 = j1.json.user_id;
    const j2 = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'chat-678-dos', device: 'test-device-678-2' });
    check('3c join usuario 2 ok', j2.status === 200 && j2.json && j2.json.user_id > 0, JSON.stringify(j2.json));
    const uid2 = j2.json.user_id;
    seedDb(db => { db.prepare('UPDATE users SET is_guest = 0, concierge = 0 WHERE id = ?').run(uid1); db.prepare('UPDATE users SET is_guest = 0, concierge = 0 WHERE id = ?').run(uid2); });
    // Posteo del usuario 1 (programado) y del usuario 2
    const post1 = seedDb(db => Number(db.prepare("INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type) VALUES (?,?,?,?,?,'scheduled','image')").run(uid1, '/media/foto-posteo-1.jpg', 'Posteo de prueba para compartir', '', '2026-11-12 19:00').lastInsertRowid));
    const post2 = seedDb(db => Number(db.prepare("INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type) VALUES (?,?,?,?,?,'scheduled','image')").run(uid2, '/media/foto-posteo-2.jpg', 'Posteo del otro cliente', '', '2026-11-13 19:00').lastInsertRowid));
    check('3d siembra: posteo del usuario 1 y del usuario 2', post1 > 0 && post2 > 0, 'p1=' + post1 + ' p2=' + post2);

    // ---- 6. COMPARTIR POSTEO AL CHAT
    const sh = await reqJson('POST', '/api/chat/compartir-posteo', { postId: post1 }, cookie1);
    check('6a compartir posteo propio: 200 + ok + postId + messageId + post', sh.status === 200 && sh.json && sh.json.ok === true && sh.json.postId === post1 && sh.json.messageId > 0 && sh.json.post && sh.json.post.id === post1, JSON.stringify(sh.json));
    const rowsShare = seedDb(db => db.prepare('SELECT role, text, post_id FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 2').all(uid1));
    check('6b compartir: quedan 2 mensajes nuevos con post_id (user + ack de Posty)', rowsShare.length === 2 && rowsShare.every(r => r.post_id === post1) && rowsShare[1].role === 'user' && rowsShare[0].role === 'assistant', JSON.stringify(rowsShare));
    check('6c compartir: el mensaje del usuario dice que comparte el posteo', rowsShare[1].text.includes('comparto este posteo'), rowsShare[1].text);
    const hist1 = await reqJson('GET', '/api/ideas/chat', undefined, cookie1);
    const sharedMsg = (hist1.json && hist1.json.messages || []).find(m => m.post_id === post1 && m.role === 'user');
    check('6d historial: el mensaje compartido trae el post adjunto (id, imagen, caption, fecha)', sharedMsg && sharedMsg.post && sharedMsg.post.id === post1 && sharedMsg.post.image_path === '/media/foto-posteo-1.jpg' && sharedMsg.post.caption === 'Posteo de prueba para compartir' && sharedMsg.post.scheduled_at === '2026-11-12 19:00', JSON.stringify(sharedMsg && sharedMsg.post));
    const sh404 = await reqJson('POST', '/api/chat/compartir-posteo', { postId: 999999 }, cookie1);
    check('6e compartir posteo inexistente: 404', sh404.status === 404, sh404.status);
    const shOther = await reqJson('POST', '/api/chat/compartir-posteo', { postId: post2 }, cookie1);
    check('6f compartir posteo DE OTRO usuario: 404 (no se puede)', shOther.status === 404, shOther.status);
    const sh400 = await reqJson('POST', '/api/chat/compartir-posteo', {}, cookie1);
    check('6g compartir sin postId: 400', sh400.status === 400, sh400.status);
    const postAfter = seedDb(db => db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').get(post1));
    check('6h compartir NO cambia el posteo (status y fecha intactos)', postAfter && postAfter.status === 'scheduled' && postAfter.scheduled_at === '2026-11-12 19:00', JSON.stringify(postAfter));

    // ---- 7. VARIAS FOTOS A LA VEZ
    const fotoPaths = ['/media/foto-a.jpg', '/media/foto-b.jpg', '/media/foto-c.jpg'];
    seedDb(db => { for (const p of fotoPaths) db.prepare("INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)").run(uid1, p, 'photo', ''); });
    check('7a siembra: 3 assets del cliente (las fotos ya son assets, una por una)', dbCount("SELECT COUNT(*) c FROM assets WHERE user_id = ? AND file_path IN ('/media/foto-a.jpg','/media/foto-b.jpg','/media/foto-c.jpg')", uid1) === 3);
    const umBefore = dbCount("SELECT COUNT(*) c FROM chat_messages WHERE user_id = ? AND role = 'user'", uid1);
    const ph = await reqJson('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }], photoPaths: fotoPaths }, cookie1);
    check('7b mandar 3 fotos con saludo: 200 + saludo (sin gastar IA)', ph.status === 200 && ph.json && ph.json.reply === 'hola! 😄 con qué te ayudo hoy?', JSON.stringify(ph.json));
    const umAfter = dbCount("SELECT COUNT(*) c FROM chat_messages WHERE user_id = ? AND role = 'user'", uid1);
    check('7c las 3 fotos llegan en UN solo mensaje (no 3 mensajes)', umAfter === umBefore + 1, 'antes=' + umBefore + ' despues=' + umAfter);
    const lastUser = seedDb(db => db.prepare("SELECT text, photos_json FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").get(uid1));
    let pj = null; try { pj = JSON.parse(lastUser.photos_json || '[]'); } catch (e) { pj = null; }
    check('7d el mensaje guarda photos_json con las 3 rutas', Array.isArray(pj) && pj.length === 3 && pj[0] === '/media/foto-a.jpg' && pj[1] === '/media/foto-b.jpg' && pj[2] === '/media/foto-c.jpg', JSON.stringify(lastUser));
    const hist2 = await reqJson('GET', '/api/ideas/chat', undefined, cookie1);
    const photoMsg = (hist2.json && hist2.json.messages || []).filter(m => m.role === 'user').pop();
    check('7e historial: el mensaje trae photos (las 3) para la grilla', photoMsg && Array.isArray(photoMsg.photos) && photoMsg.photos.length === 3, JSON.stringify(photoMsg && photoMsg.photos));
    // Filtro: rutas no /media/ se descartan; tope 10.
    const many = ['/media/f1.jpg', '/media/f2.jpg', '/media/f3.jpg', '/media/f4.jpg', '/media/f5.jpg', '/media/f6.jpg', '/media/f7.jpg', '/media/f8.jpg', '/media/f9.jpg', '/media/f10.jpg', '/media/f11.jpg', 'https://externo.com/foto.jpg'];
    const ph2 = await reqJson('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }], photoPaths: many }, cookie1);
    const lastUser2 = seedDb(db => db.prepare("SELECT photos_json FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").get(uid1));
    let pj2 = null; try { pj2 = JSON.parse(lastUser2.photos_json || '[]'); } catch (e) { pj2 = null; }
    check('7f 12 rutas (1 externa + 11 /media/): se guardan 10, solo /media/', ph2.status === 200 && Array.isArray(pj2) && pj2.length === 10 && pj2.every(p => p.startsWith('/media/')) && !pj2.includes('https://externo.com/foto.jpg'), JSON.stringify(pj2));

    // ---- 8. NOTA A POSTY
    const nota = 'el lunes cierro, no postees de eso';
    const n1 = await reqJson('POST', '/api/chat/nota', { texto: nota }, cookie1);
    check('8a dejar nota: 200 + ok + guardada true + messageId', n1.status === 200 && n1.json && n1.json.ok === true && n1.json.guardada === true && n1.json.messageId > 0, JSON.stringify(n1.json));
    const mem = seedDb(db => db.prepare("SELECT texto, tipo FROM memoria_cliente WHERE user_id = ? AND tipo = 'nota' ORDER BY id DESC LIMIT 1").get(uid1));
    check('8b la nota queda en memoria_cliente (tipo nota, texto exacto)', mem && mem.texto === nota && mem.tipo === 'nota', JSON.stringify(mem));
    const notaUser = seedDb(db => db.prepare("SELECT role, text FROM chat_messages WHERE user_id = ? AND text LIKE '%Nota a Posty%' ORDER BY id DESC LIMIT 1").get(uid1));
    const notaAck = seedDb(db => db.prepare("SELECT role, text FROM chat_messages WHERE user_id = ? AND text LIKE '%Anotado%' ORDER BY id DESC LIMIT 1").get(uid1));
    check('8c la nota se ve en el chat (mensaje user) y Posty la confirma (ack)', notaUser && notaUser.role === 'user' && notaUser.text.includes(nota) && notaAck && notaAck.role === 'assistant' && notaAck.text.includes('Anotado'), JSON.stringify({ notaUser, notaAck }));
    const n2 = await reqJson('POST', '/api/chat/nota', { texto: nota }, cookie1);
    check('8d misma nota otra vez: ok pero guardada false (dedupe, no se duplica)', n2.status === 200 && n2.json && n2.json.ok === true && n2.json.guardada === false, JSON.stringify(n2.json));
    const memCount = dbCount("SELECT COUNT(*) c FROM memoria_cliente WHERE user_id = ? AND tipo = 'nota' AND texto = ?", uid1, nota);
    check('8e dedupe: sigue habiendo UNA sola nota con ese texto', memCount === 1, 'count=' + memCount);
    const n3 = await reqJson('POST', '/api/chat/nota', { texto: 'ab' }, cookie1);
    check('8f nota muy corta (2 chars): 400', n3.status === 400, n3.status);
    // La nota larga NO se rechaza: se recorta a 500 (el input del cliente ya
    // tiene maxlength=500; el servidor recorta por defensa, no castiga).
    const n4 = await reqJson('POST', '/api/chat/nota', { texto: 'x'.repeat(501) }, cookie1);
    const larga = seedDb(db => db.prepare("SELECT texto FROM memoria_cliente WHERE user_id = ? AND tipo = 'nota' AND texto LIKE 'xxx%' ORDER BY id DESC LIMIT 1").get(uid1));
    check('8g nota de 501 chars: 200 y se guarda recortada a 500', n4.status === 200 && n4.json && n4.json.ok === true && larga && larga.texto.length === 500, 'status=' + n4.status + ' len=' + (larga && larga.texto.length));
    const hist3 = await reqJson('GET', '/api/ideas/chat', undefined, cookie1);
    check('8h historial: la nota y su ack estan en el chat', (hist3.json && hist3.json.messages || []).some(m => m.role === 'user' && m.text.includes(nota)) && (hist3.json.messages || []).some(m => m.role === 'assistant' && m.text.includes('Anotado')), 'n=' + (hist3.json && hist3.json.messages || []).length);

    // ---- Persistencia entre sesiones: reinicio sobre el MISMO DATA_DIR
    try { s1.child.kill('SIGTERM'); } catch (e) {}
    await waitExit(s1.child);
    await sleep(800);
    const free1 = await portFree(PORT);
    check('3e el boot muere por SIGTERM y el puerto queda libre', free1, 'puerto libre=' + free1);
    const s2 = startServer();
    try {
      const v2 = await waitUp(s2, 45000);
      check('3f reinicio: /api/version sigue con el BUILD del lote', v2 && v2.build === '20261105-v936', JSON.stringify(v2));
      const mem2 = seedDb(db => db.prepare("SELECT texto FROM memoria_cliente WHERE user_id = ? AND tipo = 'nota' AND texto = ?").get(uid1, nota));
      check('8i tras el reinicio la nota SIGUE en memoria_cliente (persistente)', mem2 && mem2.texto === nota, JSON.stringify(mem2));
      const hist4 = await reqJson('GET', '/api/ideas/chat', undefined, cookie1);
      check('8j tras el reinicio el historial SIGUE con la nota y las fotos', (hist4.json && hist4.json.messages || []).some(m => m.role === 'user' && m.text.includes(nota)) && (hist4.json.messages || []).some(m => Array.isArray(m.photos) && m.photos.length === 3), 'n=' + (hist4.json && hist4.json.messages || []).length);
      const shared2 = (hist4.json && hist4.json.messages || []).find(m => m.post_id === post1 && m.role === 'user');
      check('6i tras el reinicio el mensaje compartido SIGUE con el post adjunto', shared2 && shared2.post && shared2.post.id === post1, JSON.stringify(shared2 && shared2.post));
    } finally {
      try { s2.child.kill('SIGTERM'); } catch (e) {}
      await waitExit(s2.child);
      await sleep(800);
      const free2 = await portFree(PORT);
      check('3g segundo boot muere y el puerto queda libre', free2, 'puerto libre=' + free2);
    }
  } catch (e) {
    check('3x boot sin excepcion', false, e.message + ' | ' + (s1 ? s1.getOut().slice(-600) : ''));
  } finally {
    try { if (s1 && s1.child.exitCode === null) s1.child.kill('SIGTERM'); } catch (e) {}
  }
})().then(() => {
  console.log('\n== RESUMEN ==');
  console.log('PASS: ' + pass + '  FAIL: ' + fail);
  if (fail) console.log('FALLIDOS: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
});
