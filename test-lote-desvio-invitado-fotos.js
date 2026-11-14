// Suite del lote DESVÍO-INVITADO-FOTOS (Lote D del diagnóstico conserje,
// §4.2 y §6): el desvío al conserje del INVITADO (prueba-chat kind='free',
// POST /api/trial/chat-onboarding) insertaba el mensaje del usuario con un
// INSERT plano (user_id, role, text) SIN photos_json, mientras el desvío
// del REGISTRADO (/api/ideas/chat, modo conserje) lo guarda con
// chatInsertUser(..., JSON.stringify(userPhotos)). Si el invitado mandaba
// una foto con su pedido, el conserje nunca la veía.
// El arreglo: el camino del invitado extrae las fotos del body con el
// MISMO filtro que el registrado (photoPaths → solo /media/, tope 10) y
// persiste el mensaje por chatInsertUser. Sin fotos, la fila queda como
// siempre. El desvío en sí (qué se desvía, cuándo, con qué texto) y el
// camino del registrado NO se tocan.
// Uso: node test-lote-desvio-invitado-fotos.js  (puerto 34777, DATA_DIR en /tmp)
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const DIR = __dirname;
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (detail ? ' — ' + String(detail).slice(0, 300) : '')); }
}
const count = (s, sub) => (s.split(sub).length - 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- 1. ESTÁTICO
console.log('== 1. ESTATICO ==');
{
  const a = srv.indexOf("app.post('/api/trial/chat-onboarding'");
  const b = srv.indexOf("app.get('/api/trial/chat-onboarding'", a);
  const free = a > 0 && b > a ? srv.slice(a, b) : '';
  check('1a el handler de prueba-chat existe y se pudo aislar', free.length > 1000, 'a=' + a + ' b=' + b);
  check('1b el invitado extrae las fotos con el filtro exacto del registrado (photoPaths, solo /media/, tope 10)',
    free.includes("const guestPhotos = (Array.isArray(b.photoPaths) ? b.photoPaths : []).filter(p => typeof p === 'string' && p.startsWith('/media/')).slice(0, 10);"));
  check('1c el mensaje del invitado se persiste por chatInsertUser con photos_json',
    free.includes('chatInsertUser(db, uid, text, null, guestPhotos.length ? JSON.stringify(guestPhotos) : undefined);'));
  check('1d el INSERT plano del mensaje del usuario ya NO está en el camino del invitado',
    !free.includes("VALUES (?,?,?)').run(uid, 'user', text)"));
  check('1e el desvío no se tocó: divertToConcierge(db, uid, text) una sola vez y el INSERT de la respuesta sigue plano',
    count(free, 'supportCases.divertToConcierge(db, uid, text)') === 1
    && free.includes("VALUES (?,?,?)').run(uid, 'assistant', reply)"));
  check('1f el contrato del registrado sigue intacto (userPhotos + su chatInsertUser del desvío)',
    srv.includes('const userPhotos = (Array.isArray(photoPaths) ? photoPaths : [])')
    && srv.includes('chatInsertUser(db, uidChat, lastUserText, chatReply, JSON.stringify(userPhotos));'));
  check('1g chatInsertUser sigue definido una sola vez', count(srv, 'function chatInsertUser(db, uid, text, reply, photosJson)') === 1);
}

// ---------------------------------------------------------------- 2. BOOT EN VIVO
console.log('== 2. BOOT EN VIVO ==');
const PORT = 34777;
const TEST_KEY = 'boot-test-key-desvio-fotos';
const ADMIN_TOKEN = 'test-admin-desvio-fotos';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-desvio-fotos-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
function startServer() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', RESEND_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY, SUPERVISION_OFF: '1', ADMIN_TOKEN, SESSION_SECRET: 'test-desvio-fotos' };
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
async function waitUp(timeoutMs) {
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
function jar(jarObj, res) {
  if (res && res.setCookie && res.setCookie.length) {
    const c = String(res.setCookie[0]).split(';')[0];
    if (c.includes('=')) jarObj.cookie = c;
  }
  return jarObj.cookie;
}

(async () => {
  let s1 = null;
  try {
    check('2a puerto libre antes de bootear', await portFree(PORT));
    s1 = startServer();
    const v = await waitUp(45000);
    check('2b boot: /api/version responde', !!v, v ? v.build : s1.getOut().slice(-400));
    if (!v) throw new Error('boot sin /api/version');

    // ---- Invitado A: join + free CON fotos mezcladas (válidas y basura)
    const jarA = { cookie: '' };
    const jA = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'desvio-fotos-a', device: 'test-device-desvio-a' });
    jar(jarA, jA);
    check('2c join del invitado A ok', jA.status === 200 && jA.json && jA.json.ok === true && jA.json.user_id > 0, JSON.stringify(jA.json));
    const uidA = jA.json.user_id;

    const TEXTO = 'hola, ¿me cambiás esta foto?';
    const MIXED = ['/media/foto-cliente.jpg', '/media/otra.png', 'https://externo.com/x.jpg', 'data:image/png;base64,zz', 42, '/media/tercera.jpg'];
    const ESPERADAS = ['/media/foto-cliente.jpg', '/media/otra.png', '/media/tercera.jpg'];
    const fA = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'free', ig: 'desvio-fotos-a', device: 'test-device-desvio-a', text: TEXTO, photoPaths: MIXED }, jarA.cookie);
    jar(jarA, fA);
    check('2d free con fotos: 200 + ok + caso + msg_id (el desvío se comporta como siempre)',
      fA.status === 200 && fA.json && fA.json.ok === true && Number(fA.json.caso_id) > 0 && Number(fA.json.msg_id) > 0
      && typeof fA.json.reply === 'string' && fA.json.reply.length > 0 && fA.json.concierge === true, JSON.stringify(fA.json));

    const rowA = seedDb(db => db.prepare("SELECT text, photos_json, reply_to, reply_text FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").get(uidA));
    check('2e el mensaje del invitado guarda photos_json con SOLO las rutas /media/ (filtro del registrado)',
      rowA && rowA.photos_json === JSON.stringify(ESPERADAS), JSON.stringify(rowA));
    check('2f el texto del mensaje quedó exacto', rowA && rowA.text === TEXTO, rowA && rowA.text);
    const rowAck = seedDb(db => db.prepare("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").get(uidA));
    check('2g la respuesta del desvío quedó guardada como siempre', rowAck && rowAck.text === (fA.json && fA.json.reply), JSON.stringify(rowAck));

    // ---- Registrado B en modo conserje: paridad de contrato, string a string
    const jarB = { cookie: '' };
    const jB = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'desvio-fotos-b', device: 'test-device-desvio-b' });
    jar(jarB, jB);
    const uidB = jB.json && jB.json.user_id;
    check('2h join del usuario B ok', jB.status === 200 && uidB > 0, JSON.stringify(jB.json));
    seedDb(db => { db.prepare('UPDATE users SET is_guest = 0, concierge = 1 WHERE id = ?').run(uidB); });
    const cB = await reqJson('POST', '/api/ideas/chat',
      { messages: [{ role: 'user', text: TEXTO }], photoPaths: MIXED }, jarB.cookie);
    check('2i el desvío del registrado responde en modo conserje', cB.status === 200 && cB.json && cB.json.concierge === true, JSON.stringify(cB.json).slice(0, 200));
    const rowB = seedDb(db => db.prepare("SELECT photos_json FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").get(uidB));
    check('2j PARIDAD: photos_json del invitado === photos_json del registrado (mismo string, mismo contrato)',
      rowB && rowA && rowB.photos_json === rowA.photos_json && rowB.photos_json === JSON.stringify(ESPERADAS),
      'invitado=' + (rowA && rowA.photos_json) + ' registrado=' + (rowB && rowB.photos_json));

    // ---- Lectura canónica del chat: el mensaje desviado expone sus fotos
    const hist = await reqJson('GET', '/api/ideas/chat', undefined, jarA.cookie);
    const msgs = (hist.json && hist.json.messages) || [];
    const desviado = msgs.find(m => m.role === 'user' && m.text === TEXTO);
    check('2k el historial del chat lee el mensaje del invitado CON sus fotos (photos parseadas)',
      !!desviado && Array.isArray(desviado.photos) && desviado.photos.length === 3
      && desviado.photos[0] === ESPERADAS[0] && desviado.photos[1] === ESPERADAS[1] && desviado.photos[2] === ESPERADAS[2],
      JSON.stringify(desviado && desviado.photos));

    // ---- El conserje abre el journey del invitado y ve el hilo desviado
    const journey = await reqJson('GET', '/api/admin/support/' + uidA + '/journey?token=' + ADMIN_TOKEN);
    const jchat = (journey.json && journey.json.chat) || [];
    check('2l el journey del conserje responde ok y trae el mensaje desviado',
      journey.status === 200 && journey.json && journey.json.ok === true && jchat.some(m => m.role === 'user' && m.text === TEXTO),
      'status=' + journey.status + ' chat=' + JSON.stringify(jchat).slice(0, 200));

    // ---- Invitado A: free SIN fotos → la fila queda como hoy
    const fA2 = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'free', ig: 'desvio-fotos-a', device: 'test-device-desvio-a', text: 'otro pedido, sin foto' }, jarA.cookie);
    jar(jarA, fA2);
    check('2m free sin fotos: 200 + ok', fA2.status === 200 && fA2.json && fA2.json.ok === true, JSON.stringify(fA2.json));
    const rowA2 = seedDb(db => db.prepare("SELECT text, photos_json, reply_to, reply_text FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").get(uidA));
    check('2n sin fotos: la fila queda como hoy (photos_json vacío, reply_to NULL, reply_text vacío, texto exacto)',
      rowA2 && rowA2.text === 'otro pedido, sin foto' && (rowA2.photos_json === '' || rowA2.photos_json === null)
      && (rowA2.reply_to === null) && (rowA2.reply_text === '' || rowA2.reply_text === null), JSON.stringify(rowA2));

    // ---- Poll del hilo del invitado: el flujo sigue como siempre
    const poll = await reqJson('GET', '/api/trial/chat-onboarding?after=0&test_key=' + TEST_KEY, undefined, jarA.cookie);
    const pmsgs = (poll.json && poll.json.messages) || [];
    check('2o el poll del invitado devuelve el hilo en orden (user+respuesta, user+respuesta)',
      poll.status === 200 && pmsgs.length === 4
      && pmsgs[0].role === 'user' && pmsgs[0].text === TEXTO
      && pmsgs[1].role === 'assistant'
      && pmsgs[2].role === 'user' && pmsgs[2].text === 'otro pedido, sin foto'
      && pmsgs[3].role === 'assistant', JSON.stringify(pmsgs).slice(0, 300));

    // ---- Tope 10, como el registrado
    const DOCE = Array.from({ length: 12 }, (_, i) => '/media/tope-' + (i + 1) + '.jpg');
    const fA3 = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'free', ig: 'desvio-fotos-a', device: 'test-device-desvio-a', text: 'te mando muchas fotos', photoPaths: DOCE }, jarA.cookie);
    const rowA3 = seedDb(db => db.prepare("SELECT photos_json FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").get(uidA));
    let pj3 = null; try { pj3 = JSON.parse(rowA3.photos_json || '[]'); } catch (e) { pj3 = null; }
    check('2p tope del registrado: 12 rutas /media/ se guardan 10',
      fA3.status === 200 && Array.isArray(pj3) && pj3.length === 10 && pj3.every(p => p.startsWith('/media/')), JSON.stringify(pj3));
  } catch (e) {
    check('boot completo sin excepciones', false, e && e.message);
  } finally {
    if (s1) { try { s1.child.kill('SIGTERM'); } catch (e) {} await waitExit(s1.child); try { s1.child.kill('SIGKILL'); } catch (e) {} }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nDESVÍO-INVITADO-FOTOS: ' + pass + ' ok · ' + fail + ' mal' + (fails.length ? ' — fallan: ' + fails.join(' · ') : ''));
  process.exit(fail ? 1 : 0);
})();
