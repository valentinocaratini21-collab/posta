// test-lote-chat-muse.js — LOTE CHAT-MUSE: el chat de Posty igual al de Muse.
// 1) Encabezado FINO: chevron ‹ + cara + «Posty.» + punto verde «en línea»
//    (sin tarjeta glass grande). 2) Sin la línea «Nada pendiente ✓ ·
//    Todo al día» en la conversación (sale del flujo del chat; el estado de
//    la semana vive en Inicio). 3) Burbujas estilo Muse: carita SIEMPRE al
//    lado de cada mensaje de Posty, usuario a la derecha en azul, espaciado
//    ajustado. 4) Input: texto + cámara + mic + Enviar (círculo azul, solo
//    avión); SIN botón de video/calendario ni cara en la fila del input.
// 5) Indicador «escribiendo» transitorio + watchdog 95 s (si el intercambio
//    no se resuelve, se saca el indicador y se pinta la burbuja honesta).
// 6) Limpieza del «…» en 3 vías: filtro en el render (chatMsgHtml +
//    carga del historial), guarda en el servidor (pzChatSaveReply: nunca
//    guarda una fila de assistant vacía o «…») y limpieza única en db.js.
// Se conserva todo lo del Lote C y del Lote A (saludo nuevo, chips siempre
// visibles, tarjeta de oferta, guardas del chat).
// Rojo-primero: falla en base v821, pasa en el árbol del lote.
// Uso: node test-lote-chat-muse.js [dir-del-arbol] — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
function sliceFn(src, from, to) {
  const a = src.indexOf(from); if (a === -1) throw new Error('no se encontró: ' + from);
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  if (b === -1) throw new Error('no se encontró fin: ' + to);
  return src.slice(a, b);
}
function sliceOk(src, from, to) {
  try { return sliceFn(src, from, to); } catch (e) { return ''; }
}
function windowOf(src, from, len) {
  const a = src.indexOf(from); if (a === -1) return '';
  return src.slice(a, a + len);
}

const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(TREE, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const dbs = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const gen = fs.readFileSync(path.join(TREE, 'generator.js'), 'utf8');
const idxEs = fs.readFileSync(path.join(TREE, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(TREE, 'public/en/index.html'), 'utf8');

// ---------- Parte 0: pines ----------
console.log('— 0) pines —');
check('0a app.js cambió vs base v821', md5(app) !== '5210de8cceb1fc51b63b2403fc671e8c', md5(app));
check('0b server.js cambió vs base v821', md5(srv) !== '93af15859939642a99af27b2f7ffc098', md5(srv));
check('0c db.js cambió vs base v821', md5(dbs) !== '27909018edb1d5e0a017c4f3df183e6e', md5(dbs));
check('0d styles.css cambió vs base v821', md5(css) !== '82a97f57c75b03ae8880ad80e7a86c4d', md5(css));
check('0e generator.js = LOTE A (chat-muse no lo toca)', md5(gen) === 'd3be4f32b446c0451fb75f9bd47ccf81', md5(gen));
check('0f index ES/EN = v822 estampado (?v=557, styles?v=20261209)', md5(idxEs) === '912470a1f8b1d47e0adfa8f09f105a6a' && md5(idxEn) === '504157821517c6f19d632cc7893275a5', md5(idxEs) + ' / ' + md5(idxEn));
check('0g BUILD v822 (A estampado; lo re-estampa el re-estampador a v823)', srv.includes("const BUILD_ID = '20261105-v824'"));

// ---------- Parte 1: estática app.js — encabezado fino + input ----------
console.log('— 1) estática: encabezado e input —');
const headW = windowOf(app, 'function chatFullView() {', 1200);
check('1a encabezado: chevron ‹ (no flecha) + cara + «Posty.» + «en línea»',
  headW.includes("pzIc('chevronLeft', 22)") && !headW.includes("pzIc('arrowLeft'") && headW.includes('class="chat-face"') && headW.includes('>Posty<') && headW.includes('en línea'));
check('1b ícono chevronLeft definido en el mapa PZ_IC', app.includes("chevronLeft: '<path d=\"M15 5l-7 7 7 7\"/>'"));
check('1c chatCardHTML: la fila del input NO lleva cara (queda 1 sola cara: la del encabezado)',
  cnt(app, '<img class="chat-face" src="ai-avatar.png" alt="Posty">') === 1);
const barraW = sliceOk(app, 'function pzTemaBarraInit() {', 'function pzTemaInit() {');
check('1d input: SIN botón de video/reel (pzChatVideoBtn ×0) y SIN su ícono en la barra',
  cnt(barraW, 'pzChatVideoBtn') === 0 && cnt(barraW, "pzIc('reel'") === 0 && cnt(app, 'pzChatVideoBtn') === 0);
check('1e input: Enviar es solo el avión (sin <span> con texto) y sigue llamando a chatSend()',
  barraW.includes("send.innerHTML = pzIc('send', 16);") && !barraW.includes("pzIc('send', 16) + '<span>'") && barraW.includes('send.onclick = () => { try { chatSend(); } catch (e) {} };'));
check('1f input: la camarita (foto) y el mic siguen en la barra',
  barraW.includes("document.getElementById('chatMicSend')") && barraW.includes('chatPhotoDelegar') && app.includes('id="chatPhotoBtn"'));

// ---------- Parte 2: estática app.js — sin píldora + filtro «…» + watchdog ----------
console.log('— 2) estática: sin píldora, filtro «…», watchdog —');
const pintarW = windowOf(app, 'function pzTemaPintar() {', 900);
check('2a pzTemaPintar: sin tema pendiente no pinta nada (html = \'\') y no llama a la mini con «Nada pendiente»',
  pintarW.includes("html = '';") && !pintarW.includes("pzTemaMiniHTML(pzTemaT('Nada pendiente"));
check('2b pzTemaPintar: las tarjetas de tema (hoy/lunes/comentario) siguen vivas',
  pintarW.includes("tema.kind === 'hoy'"));
const colW = windowOf(app, 'function pzTemaColapsar(titulo, sub) {', 500);
check('2c pzTemaColapsar: al responder un tema la tira se va sin dejar línea de estado',
  colW.includes("wrap.innerHTML = '';") && !colW.includes('pzTemaMiniHTML(titulo, sub)'));
check('2d pzTemaMiniHTML queda definida (sin llamadores en el chat) — no se borra el helper',
  app.includes('function pzTemaMiniHTML(titulo, sub) {') && cnt(app, 'pzTemaMiniHTML(') === 1);
check('2e chatMsgHtml: una fila con texto «…» nunca se rinde',
  windowOf(app, 'function chatMsgHtml(role, text) {', 400).includes("if (String(text || '').trim() === '…') return '';"));
check('2f chatLoadHistory: el «…» no entra al historial en memoria',
  sliceOk(app, 'async function chatLoadHistory() {', 'async function draftFromPreview(').includes("String(m.text).trim() !== '…'"));
const xchg = sliceOk(app, 'async function chatExchange(', '// Posty parpadea como un humano');
check('2g watchdog: constante 95 s + carrera que corta la promesa colgada',
  app.includes('const CHAT_X_WATCHDOG_MS = 95000;') && xchg.includes('Promise.race([') && xchg.includes("new Error('chat-timeout-95s')") && xchg.includes('CHAT_X_WATCHDOG_MS'));
check('2h watchdog: el timeout 90 s del POST sigue (la carrera es el resguardo, no el reemplazo)',
  xchg.includes('{ timeout: 90000 }'));
check('2i Lote C intacto: saludo nuevo ×1, chips siempre visibles, comando corto, tarjeta de oferta',
  cnt(app, 'hola! soy Posty. decime qué necesitás y lo armo con tus fotos reales — yo pongo las palabras, nunca la foto.') === 1
  && app.includes('const chips = (!schedMode) ?') && app.includes('function chatIsShortCommand(t)')
  && app.includes('function proposalHTML(') && app.includes('Aprobar'));

// ---------- Parte 3: estática server.js + db.js — guarda del «…» ----------
console.log('— 3) estática: servidor y limpieza —');
check('3a helper pzChatSaveReply definido ×1 y rechaza vacío o «…»',
  cnt(srv, 'function pzChatSaveReply(db, uid, reply) {') === 1 && srv.includes("if (!t || t === '…') return false;"));
const postChat = sliceOk(srv, "app.post('/api/ideas/chat'", "app.post('/api/ideas/transcribe'");
check('3b las 6 filas de assistant del POST /api/ideas/chat pasan por la guarda',
  cnt(postChat, 'pzChatSaveReply(db,') === 6
  && cnt(postChat, 'pzChatSaveReply(db, uidChat, dv.ack)') === 1
  && cnt(postChat, 'pzChatSaveReply(db, uidChat, reply)') === 3
  && cnt(postChat, 'pzChatSaveReply(db, uid, reply)') === 1
  && cnt(postChat, 'pzChatSaveReply(db, uid, out.reply)') === 1);
check('3c cero INSERTs directos de assistant dentro del handler (el de otra ruta, fuera del slice, no se toca)',
  cnt(postChat, "run(uidChat, 'assistant'") === 0 && cnt(postChat, "run(uid, 'assistant', reply)") === 0
  && cnt(postChat, "run(uid, 'assistant', String(out.reply") === 0 && cnt(postChat, "run(uidChat, 'assistant', dv.ack)") === 0);
check('3d las filas de user se siguen guardando directo (solo las de assistant van por la guarda)',
  cnt(postChat, "run(uidChat, 'user', lastUserText") === 4 && cnt(postChat, "run(uid, 'user', lastUserText") === 1);
check('3e db.js: limpieza única de filas assistant «…» ×1, fuera del template literal',
  cnt(dbs, "DELETE FROM chat_messages WHERE role = 'assistant' AND trim(text) = '…'") === 1);

// ---------- Parte 4: estática CSS — fino, carita siempre, burbujas, input ----------
console.log('— 4) estática: CSS —');
check('4a header fino: sin glass/margen/sombra, borde inferior fino',
  css.includes('.pz-chatfull-head{display:flex;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top)) 12px 8px;margin:0;background:transparent;border:none;border-bottom:1px solid var(--line);border-radius:0;box-shadow:none;flex:none}')
  && !css.includes('.pz-chatfull-head{display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;margin:12px 12px 0'));
check('4b botón atrás: chevron sin círculo (28px, sin borde ni fondo)',
  css.includes('.pz-chatfull-back{width:28px;height:36px;border:none;background:transparent;color:var(--cel);'));
check('4c cara del encabezado 32px con borde fino (sin anillo amarillo)',
  css.includes('.pz-chatfull-head .chat-face{width:32px;height:32px;border-radius:50%;border:1px solid var(--line);'));
check('4d punto verde «en línea» por ::before (sobrevive al setter de voz) y se apaga al grabar',
  css.includes(".pz-chatfull-est::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#22C55E;margin-right:5px;vertical-align:1px}")
  && css.includes('.pz-chatfull-est.rec::before{display:none}'));
check('4e carita SIEMPRE: cero supresiones en rachas consecutivas',
  cnt(css, '.chat-msg.ai + .chat-msg.ai') === 0);
check('4f burbujas sólidas en el chat completo (AI blanca, usuario azul #5CA3CC)',
  css.includes('.pz-chatfull .chat-msg.ai{background:#fff;border:1px solid var(--line)}')
  && css.includes('.pz-chatfull .chat-msg.u{background:#5CA3CC;border:1px solid transparent}'));
check('4g input sin píldora glass; campo gris redondo; botones círculo blanco',
  css.includes('.pz-chatfull .chat-input-row{background:transparent;border:none;box-shadow:none;border-radius:0;padding:0 12px calc(10px + env(safe-area-inset-bottom));margin:0;flex:none;gap:8px}')
  && css.includes('.pz-chatfull .chat-input-row .in{background:#F0F4F7;border:none;box-shadow:none;border-radius:999px}')
  && css.includes('.pz-chatfull .chat-input-row .btn:not(.pz-chat-send){background:#fff;border:1px solid var(--line)}'));
check('4h Enviar círculo azul 44px solo avión; resto de botones 44px',
  css.includes('#pzChatFull .chat-input-row .pz-chat-send{width:44px;min-width:44px;height:44px;padding:0;font-size:13px;flex:none;border-radius:50%}')
  && css.includes('#pzChatFull .chat-input-row .btn:not(.pz-chat-send){width:44px;height:44px}'));

// ---------- Parte 5: VM — chatMsgHtml ----------
console.log('— 5) VM: chatMsgHtml —');
let CM = '';
try { CM = sliceFn(app, 'function chatStripCelebrate(t) {', 'async function chatLoadHistory() {'); } catch (e) { check('5x chatMsgHtml presente', false, e.message); }
if (CM) {
  const sb = {
    console,
    document: { addEventListener: () => {} },
    CELEBRATE_MARKER_G: /\[celebrate\]/g,
    FP_MARKER_RE: /$^/, FOTO_MARKER_RE: /$^/, LC_MARKER_RE: /$^/,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    pzIc: () => '',
    chatStripFpMarker: (t) => String(t || ''),
    chatStripLcMarker: (t) => String(t || ''),
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(CM + '\nthis.__cm = chatMsgHtml;', sb);
  const cm = sb.__cm;
  check('5a fila assistant «…» → no se rinde', cm('assistant', '…') === '');
  check('5b fila assistant «  …  » (con espacios) → no se rinde', cm('assistant', '  …  ') === '');
  check('5c fila user «…» → no se rinde', cm('user', '…') === '');
  check('5d mensaje normal de Posty → burbuja ai con su texto', (() => { const h = cm('assistant', 'hola! qué tal'); return h.includes('chat-msg ai') && h.includes('hola! qué tal'); })());
  check('5e mensaje normal del usuario → burbuja u con su texto', (() => { const h = cm('user', 'mostrame el posteo'); return h.includes('chat-msg u') && h.includes('mostrame el posteo'); })());
  check('5f «...» ASCII no es «…»: se rinde (la limpieza es solo el carácter exacto)', cm('assistant', '...') !== '');
}

// ---------- Parte 6: VM — chatCardHTML con el chatMsgHtml real ----------
console.log('— 6) VM: tarjeta del chat —');
let CC = '';
try { CC = sliceFn(app, 'function chatCardHTML(', '// Agrega un mensaje del asistente al chat'); } catch (e) { check('6x chatCardHTML presente', false, e.message); }
if (CC && CM) {
  const sb = {
    console,
    document: { addEventListener: () => {} },
    CELEBRATE_MARKER_G: /\[celebrate\]/g,
    FP_MARKER_RE: /$^/, FOTO_MARKER_RE: /$^/, LC_MARKER_RE: /$^/,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    pzIc: () => '',
    chatStripFpMarker: (t) => String(t || ''),
    chatStripLcMarker: (t) => String(t || ''),
    chatNextWeekHTML: () => '<div class="nw">WEEK</div>',
    proposalHTML: () => '',
    CHAT: [],
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(CM + '\nthis.__cm = chatMsgHtml;', sb);
  sb.chatMsgHtml = sb.__cm;
  vm.runInContext(CC + '\nthis.__cc = chatCardHTML;', sb);
  const cc = sb.__cc;
  sb.CHAT = [
    { role: 'assistant', text: '…' },
    { role: 'assistant', text: 'hola! soy Posty. decime qué necesitás' },
    { role: 'user', text: 'dale' },
  ];
  const h = cc(true, true, true);
  check('6a historial con fila «…»: no se rinde ninguna burbuja «…»', !h.includes('>…<'));
  check('6b el resto del historial sí se rinde', h.includes('hola! soy Posty. decime qué necesitás') && h.includes('>dale<'));
  check('6c la fila del input no lleva cara', !h.includes('class="chat-face"'));
  check('6d cámara + mic presentes; sin Enviar ni video en la tarjeta (los pone la barra)',
    h.includes('id="chatPhotoBtn"') && h.includes('id="chatMicSend"') && !h.includes('pzChatSendBtn') && !h.includes('pzChatVideoBtn'));
  sb.CHAT = [];
  const h0 = cc(true, true, true);
  check('6e sin historial: saludo nuevo + chips visibles', h0.includes('hola! soy Posty. decime qué necesitás') && h0.includes('id="chatChips"'));
}

// ---------- Parte 7: VM — pzChatSaveReply ----------
console.log('— 7) VM: pzChatSaveReply —');
let SR = '';
try { SR = sliceFn(srv, 'function pzChatSaveReply(db, uid, reply) {', "app.post('/api/ideas/chat'"); } catch (e) { check('7x helper presente', false, e.message); }
if (SR) {
  const sb = { console };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SR + '\nthis.__sr = pzChatSaveReply;', sb);
  const sr = sb.__sr;
  const calls = [];
  const fakeDb = { prepare: () => ({ run: (...a) => { calls.push(a); } }) };
  check('7a «…» no se guarda', sr(fakeDb, 1, '…') === false && calls.length === 0);
  check('7b vacío / solo espacios no se guarda', sr(fakeDb, 1, '') === false && sr(fakeDb, 1, '   ') === false && calls.length === 0);
  check('7c respuesta real se guarda como assistant', sr(fakeDb, 1, 'hola! 😄 con qué te ayudo hoy?') === true && calls.length === 1 && calls[0][0] === 1 && calls[0][1] === 'assistant' && calls[0][2] === 'hola! 😄 con qué te ayudo hoy?');
  check('7d texto largo se corta a 3000', sr(fakeDb, 1, 'x'.repeat(4000)) === true && calls[1][2].length === 3000);
}

// ---------- Parte 8: boot real + migración ----------
console.log('— 8) boot real + migración —');
const PORT = 34577;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-muse-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const TEST_KEY = 'boot-test-key-cm';

async function reqJson(method, p, body, cookie, contentType) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers, body: body === undefined ? undefined : (contentType ? body : JSON.stringify(body)) });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}
function startServer() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  return { child, out: () => out };
}
async function waitUp(srvProc) {
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}
async function waitExit(child) {
  for (let i = 0; i < 30; i++) {
    if (child.exitCode !== null) return true;
    await sleep(500);
  }
  return child.exitCode !== null;
}

async function parteBoot() {
  const s1 = startServer();
  try {
    const up = await waitUp(s1);
    check('8a el servidor levanta con el lote', up);
    if (!up) { console.log(s1.out().split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    check('8b /api/version = v822 (estampado)', ver && ver.build === '20261105-v824', JSON.stringify(ver));
    const appJs = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=556`)).text();
    check('8c el app.js servido trae el lote (chevron + watchdog + saludo; sin video ni píldora)',
      appJs.includes("pzIc('chevronLeft'") && appJs.includes('CHAT_X_WATCHDOG_MS') && appJs.includes('hola! soy Posty. decime qué necesitás')
      && !appJs.includes('pzChatVideoBtn') && !appJs.includes("pzTemaMiniHTML(pzTemaT('Nada pendiente"), 'len ' + appJs.length);
    const cssTxt = await (await fetch(`http://127.0.0.1:${PORT}/styles.css?v=20261208`)).text();
    check('8d el styles.css servido trae el encabezado fino + punto verde, sin supresión de carita',
      cssTxt.includes('.pz-chatfull-est::before') && cssTxt.includes('background:#22C55E')
      && cssTxt.includes('padding:calc(8px + env(safe-area-inset-top)) 12px 8px;margin:0;background:transparent')
      && !cssTxt.includes('.chat-msg.ai + .chat-msg.ai'), 'len ' + cssTxt.length);
    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'cm-test', device: 'test-device-cm' });
    check('8e join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
    const uid = join.json.user_id;
    // 9b (fix repro): el invitado fresco trae welcome proactivo + historial
    // vacío — la condición exacta del doble saludo que quita el fix 9a.
    const hist = await reqJson('GET', '/api/ideas/chat', undefined, cookie);
    check('9b primer ingreso: welcome proactivo + historial vacío (condición del doble saludo)',
      hist.status === 200 && hist.json && typeof hist.json.welcome === 'string' && hist.json.welcome.includes('cómo te llamo?') && Array.isArray(hist.json.messages) && hist.json.messages.length === 0,
      JSON.stringify(hist.json && { welcome: String(hist.json.welcome || '').slice(0, 60), n: (hist.json.messages || []).length }));
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
    // Como en test-lote-chat-nuevo: el join deja is_guest=1 (el chat exige
    // cuenta no invitada) y concierge=1 ('prueba-chat', que desvía el chat
    // al conserje antes del cerebro). Para probar el cerebro se apagan.
    try { db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid); } catch (e) {}
    try { db.prepare('UPDATE users SET concierge = 0 WHERE id = ?').run(uid); } catch (e) {}
    const greet = await reqJson('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] }, cookie);
    check('8f POST saludo puro responde sin modelo', greet.status === 200 && greet.json && greet.json.reply === 'hola! 😄 con qué te ayudo hoy?' && greet.json.idea === null, JSON.stringify(greet.json));
    const rowGreet = db.prepare("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").get(uid);
    check('8g la fila del saludo quedó guardada con el texto real (no «…» ni vacía)',
      rowGreet && rowGreet.text === 'hola! 😄 con qué te ayudo hoy?', JSON.stringify(rowGreet));
    // Siembra de filas «…» para probar la migración en el REINICIO.
    const ins = db.prepare("INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)");
    ins.run(uid, 'assistant', '…');
    ins.run(uid, 'user', '…');
    ins.run(uid, 'assistant', 'hola');
    const pre = db.prepare("SELECT COUNT(*) c FROM chat_messages WHERE user_id = ? AND trim(text) = '…'").get(uid);
    check('8h siembra: 2 filas «…» antes del reinicio', pre && pre.c === 2, JSON.stringify(pre));
    db.close();
  } finally {
    try { s1.child.kill('SIGTERM'); } catch (e) {}
    await waitExit(s1.child);
    await sleep(1000);
  }
  // Segundo arranque sobre el MISMO DATA_DIR: la migración de db.js corre
  // al cargar y borra las filas de assistant «…».
  const s2 = startServer();
  try {
    const up2 = await waitUp(s2);
    check('8i el servidor vuelve a levantar sobre el mismo DATA_DIR', up2);
    if (!up2) { console.log(s2.out().split('\n').slice(-30).join('\n')); throw new Error('no levanta (2)'); }
    const db2 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    try { db2.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
    const q = (role, text) => db2.prepare("SELECT COUNT(*) c FROM chat_messages WHERE role = ? AND trim(text) = ?").get(role, text);
    const aDots = q('assistant', '…');
    const uDots = q('user', '…');
    const aHola = q('assistant', 'hola');
    check('8j migración: la fila assistant «…» se borró en el arranque', aDots && aDots.c === 0, JSON.stringify(aDots));
    check('8k migración: la fila user «…» queda (la limpieza es solo assistant)', uDots && uDots.c === 1, JSON.stringify(uDots));
    check('8l migración: la fila assistant «hola» queda intacta', aHola && aHola.c === 1, JSON.stringify(aHola));
    db2.close();
  } finally {
    try { s2.child.kill('SIGTERM'); } catch (e) {}
    await waitExit(s2.child);
  }
}

// ---------- 9. FIX REPRO (preparador): un solo saludo en el primer ingreso ----------
// El repro visual mostró DOS saludos en el primer ingreso del invitado
// (welcome proactivo del servidor + saludo estático del estado vacío).
// Preexistente en v822 (mismos dos caminos byte-idénticos); el fix quita el
// estático cuando llega el welcome. 9b (en el boot) fija la condición.
try {
  const lh = sliceFn(app, 'async function chatLoadHistory() {', '// Fix auditoría #2');
  check('9a con welcome proactivo, el saludo estático del estado vacío se quita (un solo saludo)',
    lh.includes("insertAdjacentHTML('afterbegin'") && lh.includes('yo pongo las palabras, nunca la foto') && lh.includes('.remove()'));
} catch (e) { check('9x chatLoadHistory presente', false, e.message); }

(async () => {
  try { await parteBoot(); } catch (e) { check('8x boot sin excepción', false, e.message); }
  console.log(`\nlote-chat-muse: ${pass} ok, ${fail} mal`);
  if (fails.length) console.log('fallos:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
