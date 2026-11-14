// Suite del lote POSTY-RESPONDE-CON-TRABAJO — regla de Valentino (13/11
// 20:08): «posty solo responda si tiene alguna duda y que se responda con
// clicks a sus preguntas. si no tiene preguntas no responde con mensajes,
// responde con trabajo».
// Qué prueba:
//  1. El acuse enlatado no existe más en ninguna superficie (censo de
//     strings): nota («Anotado ✅»), compartir-posteo («Ya lo veo —
//     decime qué querés cambiar»), trial chat («listo ✅ algo más?»).
//  2. La nota se registra y se ACTÚA sin mensaje de Posty (boot real):
//     queda en memoria_cliente y como mensaje del usuario; ningún acuse.
//  3. Compartir un posteo deja SOLO el mensaje del usuario con el posteo.
//  4. Las preguntas abiertas enlatadas del cerebro mueren: el respaldo de
//     coherencia es silencio y «todavía no armé nada» ya no pregunta.
//  5. El prompt del cerebro lleva la regla madre: la duda real va SOLO
//     con ```options derivadas del fundamento; las cláusulas que mandaban
//     preguntar abierto están reescritas.
//  6. La red determinística pzChatReplyEsPreguntaSuelta (VM): una sola
//     pregunta abierta = suelta; recibos, saludos y textos con dato, no.
//  7. Los recibos aprobados y las dudas legales quedan intactos: recibo
//     verificado del chat (chatReceiptLines), ack de aprendizaje de
//     gustos, propuestas de gusto con botones, saludo de diseño (v916).
//  8. Control contra la base (../base): los strings abolidos EXISTEN ahí
//     (el defecto se reproduce en la base).
// Uso: node test-lote-posty-responde-trabajo.js  (puerto 35021, DATA_DIR
// en /tmp, sin clave de IA)
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
const gen = fs.readFileSync(path.join(DIR, 'generator.js'), 'utf8');
const tm = fs.readFileSync(path.join(DIR, 'taste-memory.js'), 'utf8');
const baseSrv = fs.readFileSync(path.join(DIR, '..', 'base', 'server.js'), 'utf8');
const baseGen = fs.readFileSync(path.join(DIR, '..', 'base', 'generator.js'), 'utf8');
let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (detail ? ' — ' + String(detail).slice(0, 300) : '')); }
}
const count = (s, sub) => (s.split(sub).length - 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seg = (s, from, to) => { const a = s.indexOf(from); const b = s.indexOf(to, a); return (a > 0 && b > a) ? s.slice(a, b) : ''; };

// ---------------------------------------------------------------- 1. CENSO
console.log('== 1. CENSO: el acuse enlatado no existe más ==');
check('1a «Anotado ✅» fuera del servidor (×0)', count(srv, 'Anotado ✅') === 0, count(srv, 'Anotado ✅'));
check('1b «Noted ✅» fuera del servidor (×0)', count(srv, 'Noted ✅') === 0, count(srv, 'Noted ✅'));
// El censo apunta a los fragmentos exactos de la plantilla del acuse:
// «Decime qué querés cambiar de la foto 🙏» (error de validación
// cambio_vacio de /api/album/:id/cambiar-imagen) es OTRA superficie —
// un error de formulario, no un mensaje conversacional — y queda.
check('1c compartir: la plantilla del acuse fuera (×0)', count(srv, 'Ya lo veo — el posteo del') === 0 && count(srv, 'Decime qué querés cambiar.') === 0 && count(srv, 'Tell me what you want to change.') === 0);
check('1d trial chat: «listo ✅ algo más?» / «done ✅ anything else?» fuera (×0)', count(srv, 'listo ✅ algo más?') === 0 && count(srv, 'done ✅ anything else?') === 0);
check('1e respaldo de coherencia: «¿me contás un poco más y lo armamos?» fuera (×0)', count(srv, '¿me contás un poco más y lo armamos?') === 0 && count(srv, "we'll build it?") === 0);
check('1f «todavía no armé nada — la armamos?» fuera; queda solo el hecho', count(srv, 'la armamos? 🚀') === 0 && count(srv, "out.reply = 'todavía no armé nada.';") === 1);
check('1g trial chat: la aclaración abierta fuera de ambos prompts', count(srv, 'pedí aclaración en reply') === 0 && count(srv, 'ask for clarification in reply') === 0);
{
  const notaSeg = seg(srv, "app.post('/api/chat/nota'", "app.post('/api/ideas/chat/transcript-feedback'");
  check('1h endpoint nota: sin insert de assistant (la nota no genera mensaje)', notaSeg.length > 0 && !notaSeg.includes("'assistant'") && notaSeg.includes("guardada: guardadas > 0"), 'seg=' + notaSeg.length);
  const compSeg = seg(srv, "app.post('/api/chat/compartir-posteo'", "app.post('/api/chat/nota'");
  check('1i endpoint compartir: sin insert de assistant; el user con post_id queda', compSeg.length > 0 && !compSeg.includes("'assistant', ackText") && !compSeg.includes('ackText') && compSeg.includes("run(uid, 'user', userText, postId)"), 'seg=' + compSeg.length);
}
console.log('== 2. PROMPT DEL CEREBRO: la regla madre ==');
check('2a regla madre presente en el prompt', gen.includes('RESPONDÉS CON TRABAJO, NO CON MENSAJES'));
check('2b la duda va con ```options derivadas (regla madre)', gen.includes('La duda va SIEMPRE como pregunta corta + opciones tocables'));
check('2c sin opciones derivables: decide el fundamento y entrega trabajo', gen.includes('Si la duda no se puede ofrecer como opciones, decidís VOS desde el fundamento'));
check('2d cláusula vieja «Hacé preguntas cortas cuando te falte contexto» fuera', count(gen, 'Hacé preguntas cortas cuando te falte contexto') === 0);
check('2e «preguntá corto en voseo qué quiso decir» fuera', count(gen, 'preguntá corto en voseo qué quiso decir') === 0);
check('2f «preguntá corto ("¿el primero o el segundo?")» como instrucción fuera', count(gen, 'preguntá corto ("¿el primero o el segundo?")') === 0);
check('2g frustración: «UNA pregunta corta sobre QUÉ no va» fuera; la duda va con options', count(gen, 'UNA pregunta corta sobre QUÉ no va') === 0 && gen.includes('la duda va con ```options (["el texto","la foto","el tono"])'));
check('2h HUECO UNA VEZ: «hacé UNA sola pregunta corta» fuera; va con options', count(gen, 'hacé UNA sola pregunta corta y frená ahí') === 0 && gen.includes('hacé UNA sola duda con ```options derivadas del contexto'));
check('2i entrevista ADN: las dudas van con ```options derivadas', gen.includes('SIEMPRE con ```options derivadas de lo que ya sabés del negocio'));
check('2j optionsGuide: «la ÚNICA forma legal de preguntar»', gen.includes('la ÚNICA forma legal de preguntar'));
console.log('== 3. RED DETERMINÍSTICA (VM) ==');
{
  const a = srv.indexOf('function pzChatReplyEsPreguntaSuelta(');
  const b = srv.indexOf('\nfunction ', a + 10);
  check('3a la guarda es extraible del server', a > 0 && b > a);
  const sandbox = { console };
  vm.createContext(sandbox);
  let okVm = true, err = '';
  try { vm.runInContext(srv.slice(a, b), sandbox); } catch (e) { okVm = false; err = e.message; }
  check('3b la guarda corre en VM', okVm && typeof sandbox.pzChatReplyEsPreguntaSuelta === 'function', err);
  if (okVm) {
    const f = sandbox.pzChatReplyEsPreguntaSuelta;
    check('3c pregunta suelta clásica: «¿el primero o el segundo?» → suelta', f('¿el primero o el segundo?') === true);
    check('3d el viejo respaldo de coherencia sería suelta', f('dale 😄 ¿me contás un poco más y lo armamos?') === true);
    check('3e «¿de cuál hablamos?» → suelta', f('¿de cuál hablamos?') === true);
    check('3f «¿lo subo a las 19 o a las 20?» → suelta', f('¿querés que lo suba a las 19 o a las 20?') === true);
    check('3g recibo de trabajo → NO suelta', f('listo, te lo cambié para el viernes ✓') === false);
    check('3h saludo de diseño (2 oraciones) → NO suelta', f('hola! 😄 con qué te ayudo hoy?') === false);
    check('3i hecho + ofrecimiento honesto (publicado) → NO suelta', f('ese posteo ya salió en instagram y ahí no se puede mover el texto ni cambiar la foto en el lugar. si querés, te armo la versión corregida y te la dejo lista para que la apruebes en un toque en tu bandeja — decímelo y la preparo.') === false);
    check('3j estado sin pregunta («todavía no armé nada.») → NO suelta', f('todavía no armé nada.') === false);
    check('3k vacío / «…» → NO suelta', f('') === false && f('…') === false);
    check('3l texto largo con pregunta al final → NO suelta (conservador)', f('te dejé los tres borradores de la semana con las fotos nuevas y los captions en el tono de siempre, el del viernes quedó con la promo del 2x1 que me pediste la otra vez y el del domingo con la foto del local lleno. ¿querés que lo veamos?') === false);
    // Conservador declarado: las fechas con puntos parten la oración y
    // la guarda no la marca suelta — nunca come un texto con datos.
    check('3m pregunta con fechas con puntos → NO suelta (conservador)', f('¿el del 12.11 o el del 13.11?') === false);
  }
  check('3n la guarda se aplica en el handler antes de guardar la respuesta', srv.includes('pzChatReplyEsPreguntaSuelta(out.reply)') && srv.includes('haySalida'));
}
console.log('== 4. RECIBOS Y DUDAS LEGALES INTACTOS ==');
check('4a recibo verificado del chat intacto (chatReceiptLines se sigue armando)', srv.includes('const receiptLines = chatReceiptLines({'));
check('4b ack de aprendizaje de gustos intacto (recibo de trabajo durable)', tm.includes('anotado 📝'));
check('4c propuestas de gusto con botones intactas (taste_proposal en la respuesta)', srv.includes('taste_proposal: tasteMemory.proposalPayload(db, uid, langOfUser(uid))'));
check('4d el gate de opciones tras ejecutar trabajo intacto (el recibo manda)', srv.includes('if (editApplied || publishApplied || revertApplied || approveApplied'));
check('4e saludo de diseño v916 intacto en el atajo del chat', srv.includes("const reply = 'hola! 😄 con qué te ayudo hoy?';"));
check('4f la extracción ```options del generador intacta', gen.includes('// Opciones tocables (```options)'));

// ---------------------------------------------------------------- 5. BOOT
console.log('== 5. BOOT EN VIVO ==');
const PORT = 35021;
const TEST_KEY = 'boot-test-key-responde-trabajo';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-responde-trabajo-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
function startServer() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', RESEND_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY, SUPERVISION_OFF: '1', ADMIN_TOKEN: 'test-admin-responde', SESSION_SECRET: 'test-responde' };
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
    check('5a el puerto está libre antes de bootear', await portFree(PORT));
    s1 = startServer();
    const v = await waitUp(s1, 45000);
    check('5b boot: /api/version responde', !!(v && v.build), JSON.stringify(v));
    if (!v) throw new Error('boot sin /api/version; salida: ' + s1.getOut().slice(-800));
    const j1 = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'responde-uno', device: 'test-device-responde-1' });
    check('5c join del cliente ok', j1.status === 200 && j1.json && j1.json.ok === true && j1.json.user_id > 0, JSON.stringify(j1.json));
    if (!j1.json || !j1.json.user_id) throw new Error('sin join');
    const cookie1 = j1.setCookie ? String(j1.setCookie).split(';')[0] : '';
    const uid1 = j1.json.user_id;
    seedDb(db => { db.prepare('UPDATE users SET is_guest = 0, concierge = 0 WHERE id = ?').run(uid1); });

    // Saludo de diseño: sigue respondiendo (no es acuse de un pedido).
    const g = await reqJson('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] }, cookie1);
    check('5d saludo puro: la respuesta social de diseño sigue', g.status === 200 && g.json && g.json.reply === 'hola! 😄 con qué te ayudo hoy?', JSON.stringify(g.json));
    const asstAntes = dbCount("SELECT COUNT(*) c FROM chat_messages WHERE user_id = ? AND role = 'assistant'", uid1);

    // NOTA: se guarda, se ve como mensaje del usuario y NO genera acuse.
    const nota = 'el lunes cierro, no postees de eso';
    const n1 = await reqJson('POST', '/api/chat/nota', { texto: nota }, cookie1);
    check('5e dejar nota: 200 + ok + guardada true + messageId', n1.status === 200 && n1.json && n1.json.ok === true && n1.json.guardada === true && n1.json.messageId > 0, JSON.stringify(n1.json));
    const mem = seedDb(db => db.prepare("SELECT texto, tipo FROM memoria_cliente WHERE user_id = ? AND tipo = 'nota' ORDER BY id DESC LIMIT 1").get(uid1));
    check('5f la nota queda en memoria_cliente (el trabajo que la actúa)', mem && mem.texto === nota && mem.tipo === 'nota', JSON.stringify(mem));
    const notaUser = seedDb(db => db.prepare("SELECT role, text FROM chat_messages WHERE user_id = ? AND text LIKE '%Nota a Posty%' ORDER BY id DESC LIMIT 1").get(uid1));
    check('5g la nota se ve en el chat como mensaje del usuario', notaUser && notaUser.role === 'user' && notaUser.text.includes(nota), JSON.stringify(notaUser));
    const asstDespuesNota = dbCount("SELECT COUNT(*) c FROM chat_messages WHERE user_id = ? AND role = 'assistant'", uid1);
    check('5h la nota NO generó ningún mensaje de Posty (sin acuse)', asstDespuesNota === asstAntes, 'antes=' + asstAntes + ' despues=' + asstDespuesNota);
    const ackRow = seedDb(db => db.prepare("SELECT id FROM chat_messages WHERE user_id = ? AND text LIKE '%Anotado%' LIMIT 1").get(uid1));
    check('5i ningún mensaje «Anotado» existe para el cliente', !ackRow, JSON.stringify(ackRow));
    const n2 = await reqJson('POST', '/api/chat/nota', { texto: nota }, cookie1);
    check('5j dedupe intacto: la misma nota no se duplica', n2.status === 200 && n2.json && n2.json.guardada === false, JSON.stringify(n2.json));

    // COMPARTIR: queda solo el mensaje del usuario con el posteo.
    const post1 = seedDb(db => Number(db.prepare("INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type) VALUES (?,?,?,?,?,'scheduled','image')").run(uid1, '/media/foto-1.jpg', 'Posteo para compartir', '', '2026-11-12 19:00').lastInsertRowid));
    const sh = await reqJson('POST', '/api/chat/compartir-posteo', { postId: post1 }, cookie1);
    check('5k compartir: 200 + ok + postId + messageId + post', sh.status === 200 && sh.json && sh.json.ok === true && sh.json.postId === post1 && sh.json.messageId > 0 && sh.json.post && sh.json.post.id === post1, JSON.stringify(sh.json));
    const rowsShare = seedDb(db => db.prepare('SELECT role, text, post_id FROM chat_messages WHERE user_id = ? AND post_id = ?').all(uid1, post1));
    check('5l compartir: queda SOLO el mensaje del usuario con el posteo', rowsShare.length === 1 && rowsShare[0].role === 'user', JSON.stringify(rowsShare));
    const asstDespuesShare = dbCount("SELECT COUNT(*) c FROM chat_messages WHERE user_id = ? AND role = 'assistant'", uid1);
    check('5m compartir tampoco generó mensaje de Posty', asstDespuesShare === asstAntes, 'antes=' + asstAntes + ' despues=' + asstDespuesShare);

    // Historial: la nota está; el acuse no existe en ninguna parte.
    const hist = await reqJson('GET', '/api/ideas/chat', undefined, cookie1);
    const msgs = (hist.json && hist.json.messages) || [];
    check('5n historial: la nota está y ningún acuse aparece', msgs.some(m => m.role === 'user' && m.text.includes(nota)) && !msgs.some(m => m.text.includes('Anotado')), 'n=' + msgs.length);
  } catch (e) {
    check('boot completo sin excepciones', false, e.message);
  } finally {
    if (s1) { try { s1.child.kill('SIGKILL'); } catch (e) {} }
    await sleep(300);
    check('5o el puerto queda libre al cerrar', await portFree(PORT));
  }

  // ---------------------------------------------------------------- 6. CONTROL
  console.log('== 6. CONTROL CONTRA LA BASE ==');
  check('6a base: el acuse de la nota EXISTE (el defecto se reproduce)', count(baseSrv, 'Anotado ✅') === 1 && count(baseSrv, 'Noted ✅') === 1);
  check('6b base: el acuse de compartir EXISTE', baseSrv.includes('Ya lo veo') && baseSrv.includes('Decime qué querés cambiar'));
  check('6c base: el default del trial chat EXISTE', baseSrv.includes('listo ✅ algo más?'));
  check('6d base: el respaldo de coherencia EXISTE', baseSrv.includes('¿me contás un poco más y lo armamos?'));
  check('6e base: el prompt mandaba preguntar abierto', baseGen.includes('Hacé preguntas cortas cuando te falte contexto') && !baseGen.includes('RESPONDÉS CON TRABAJO, NO CON MENSAJES'));

  console.log('\nTOTAL: ' + pass + ' ok · ' + fail + ' fallas');
  if (fails.length) { console.log('FALLAS:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
