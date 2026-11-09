// test-lote-chat-nuevo.js — LOTE C MEJORAS INICIO: CHAT NUEVO (ítem 10).
// 1) Apertura nueva: encabezado propio con cara + «en línea · responde al
//    toque», saludo que explica qué se le puede pedir, chips siempre visibles.
// 2) Por qué responde mal: historial real (POST 20×3000, GET 60/7d), sin
//    atajos por regex antes del cerebro (solo comando corto), MODO PEDIDO y
//    SIN FOTOS permiten preguntar el hueco UNA vez, techo 700→1200.
// 3) Casos vivos: CASO 1 nunca promete sin entregar (sin burbuja «…»
//    pelada, error como burbuja, show_drafts por tema con línea honesta);
//    CASO 2 el posteo ofrecido llega como TARJETA (prompt: voz de WhatsApp
//    en minúscula, nunca pitch con hashtags ni texto volcado); CASO 3 el
//    flujo chat → feed es real (dependencia del fix del perfil, NO de este
//    lote — solo se anota en el STATUS, no se construye acá).
// Rojo-primero: falla en base v820, pasa en el árbol del lote.
// Uso: node test-lote-chat-nuevo.js [dir-del-arbol] — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
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

const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(TREE, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const gen = fs.readFileSync(path.join(TREE, 'generator.js'), 'utf8');

// ---------- Parte 0: pines ----------
console.log('— 0) pines —');
check('0a app.js cambió vs base v820', md5(app) !== '5f38503c070cf80d91282f5fdfdf6603', md5(app));
check('0b server.js cambió vs base v820', md5(srv) !== '0de3dc6d3d261e183bc431ce89fcae95', md5(srv));
check('0c generator.js cambió vs base v820', md5(gen) !== '7e5edc801f1a618533e8183487db01c8', md5(gen));
check('0d styles.css cambió vs base v820', md5(css) !== 'a856a7b75db749865b06c06e418caf1e', md5(css));
check('0e BUILD v822 (estampado por el re-estampador)', srv.includes("const BUILD_ID = '20261105-v822'"), md5(srv));

// ---------- Parte 1: estática — apertura nueva ----------
console.log('— 1) estática: apertura —');
const chatView = sliceOk(app, 'async function chatView() {', '// ---------- Álbum del negocio');
check('1a chatView: encabezado propio con cara + «en línea · responde al toque»',
  chatView.includes('en línea · responde al toque') && chatView.includes('class="chat-online-dot"') && chatView.includes('ai-avatar.png'));
check('1b chatView: el chat va PRIMERO (chatCardHTML antes que la grilla de la semana)',
  chatView.indexOf('chatCardHTML(true, true, true)') !== -1 && chatView.indexOf('chatCardHTML(true, true, true)') < chatView.indexOf('homeWeekHTML('));
check('1c chatView: rótulo «Tu semana, lista.» debajo del chat; el viejo «¿Cambiamos algo?» no está en la vista',
  chatView.includes('Tu semana, lista.') && !chatView.includes('¿Cambiamos algo?'));
check('1d saludo nuevo (mock v1) ×1; el viejo «qué hacemos hoy» no existe',
  cnt(app, 'hola! soy Posty. decime qué necesitás y lo armo con tus fotos reales — yo pongo las palabras, nunca la foto.') === 1
  && cnt(app, 'qué hacemos hoy') === 0);
check('1e chips siempre visibles: condición sin !msgs; rótulos del mock en minúscula',
  app.includes('const chips = (!schedMode) ?') && !app.includes('const chips = (!msgs && !schedMode) ?')
  && app.includes('>haceme un posteo</button>') && app.includes('>cambiá el texto</button>') && app.includes('>idea para vender más</button>'));
check('1f chatLoadHistory NO saca los chips con historial; corte de carga 2000→3000',
  (() => { const f = sliceOk(app, 'async function chatLoadHistory() {', 'async function draftFromPreview('); return !f.includes("$('#chatChips')") && f.includes('.slice(0, 3000)'); })());
check('1g la hoja de la landing SIN sesión sigue sacando los chips (no es el chat de la app)',
  app.includes("const chips = document.getElementById('chatChips'); if (chips) chips.remove();"));
check('1h CSS: punto verde en línea (.chat-online-dot, #22C55E)',
  css.includes('.chat-online-dot{') && css.includes('background:#22C55E'));

// ---------- Parte 2: estática — interceptores ----------
console.log('— 2) estática: interceptores —');
check('2a chatIsShortCommand definida (≤6 palabras)', app.includes('function chatIsShortCommand(t)') && app.includes('w.length <= 6'));
const gates = ['chatIsShortCommand(sendText) && /\\bcomentarios?\\b/i.test(sendText) && /(pregunt|duda|objeci|quieren|frena|dicen)/i',
  'chatIsShortCommand(sendText) && /qu[eé] sale|esta semana|mi semana|\\bagenda\\b|programados/i',
  'chatIsShortCommand(sendText) && /\\b(reseñas?|resenas?|opiniones|reviews?)\\b/i',
  'chatIsShortCommand(sendText) && /\\b(mensajes?|dms?|directos?|privados?|bandeja)\\b/i',
  'chatIsShortCommand(sendText) && /\\bcomentarios?\\b/i.test(sendText) && !/sin comentarios/i'];
check('2b los 5 atajos de vista corren solo con comando corto', gates.every((g) => app.includes(g)), gates.filter((g) => !app.includes(g)).join(' | '));
check('2c diagnósticos y «armame la semana» NO se gatean (son comandos, no preguntas)',
  !app.includes('chatIsShortCommand(sendText) && /diagn') && !app.includes('chatIsShortCommand(sendText) && /arma(m|r)?(me)? la semana/'));

// ---------- Parte 3: estática — chatExchange, camino de error ----------
console.log('— 3) estática: intercambio y error —');
const xchg = sliceOk(app, 'async function chatExchange(', '// Posty parpadea como un humano');
check('3a typing con id único por intercambio + dropTyping que limpia residuos',
  xchg.includes("const typingId = 'chatTyping-'") && xchg.includes('const dropTyping = () =>') && cnt(xchg, 'dropTyping()') === 2);
check('3b no se inserta más una burbuja con id="chatTyping" fijo', cnt(app, 'id="chatTyping"') === 0);
check('3c el POST del chat lleva timeout 90s', xchg.includes("{ timeout: 90000 }"));
check('3d nunca burbuja «…» pelada: cero `r.reply || \'…\'` en el intercambio y en el completar de subir foto',
  cnt(xchg, "r.reply || '…'") === 0 && cnt(app, "r.reply || '…'") === 0);
check('3e respuesta vacía sin payload → mensaje honesto; con payload no se pinta burbuja vacía',
  xchg.includes("const replyText = String((r && r.reply) || '').trim()") && xchg.includes('no me salió la respuesta, ¿me lo repetís en una línea? 🙏') && xchg.includes('const hasPayload'));
check('3f el error es burbuja del chat (no solo #chatMsg) y queda en el historial',
  xchg.includes("const errText = 'no pude responder, probá de nuevo en un rato 🙏'") && xchg.includes("CHAT.push({ role: 'assistant', text: errText })"));
check('3g se re-lee el box y el botón tras el await (re-render en medio del intercambio)',
  xchg.includes("const boxNow = $('#chatBox') || box") && xchg.includes("const btnNow = $('#chatMicSend') || btn") && xchg.includes('boxNow.insertAdjacentHTML'));

// ---------- Parte 4: estática — servidor: historial + show_drafts ----------
console.log('— 4) estática: servidor —');
const postChat = sliceOk(srv, "app.post('/api/ideas/chat'", "app.post('/api/ideas/transcribe'");
check('4a POST: historial 20 mensajes × 3000 caracteres (era 10×2000)',
  postChat.includes('.slice(-20)') && cnt(postChat, '.slice(0, 3000)') === 9 && !postChat.includes('.slice(-10)') && !postChat.includes('.slice(0, 2000)'));
check('4b GET: historial 60 mensajes / 7 días (era 30/24h)',
  srv.includes("datetime('now', '-7 days') ORDER BY id DESC LIMIT 60"));
check('4c show_drafts por tema: helper definido y usado; línea honesta cuando nada matchea',
  srv.includes('function pzChatShowDraftsTopic(drafts, lastUserText)') && srv.includes('pzChatShowDraftsTopic(showDrafts, lastUserShow)')
  && srv.includes("no tengo ningún posteo armado — estos son los que tengo 👇"));
check('4d el reemplazo genérico «todavía no armé nada» sigue cuando no hay nada con imagen',
  srv.includes("out.reply = 'todavía no armé nada — la armamos? 🚀';"));

// ---------- Parte 5: estática — prompt del chat ----------
console.log('— 5) estática: prompt —');
check('5a PREGUNTA ≠ PEDIDO presente', gen.includes('PREGUNTA ≠ PEDIDO: si el mensaje es una PREGUNTA'));
check('5b HUECO UNA VEZ presente (pregunta el dato que falta, nunca arma con material que no matchee)',
  gen.includes('HUECO UNA VEZ: si falta un dato que cambia el resultado'));
check('5c SIN FOTOS nuevo: frena cuando la foto ES el tema; la cara de Posty nunca sustituye',
  gen.includes('SIN FOTOS: si el posteo necesita una foto del producto o del tema y no hay ninguna que matchee, NO trabajes igual')
  && gen.includes('nunca uses una foto que no tenga que ver ni la cara de Posty')
  && !gen.includes('JAMÁS frenes todo por falta de fotos'));
check('5d AL GRANO + VOZ DEL CHAT (tarjeta, nunca texto volcado ni pitch con hashtags)',
  gen.includes('AL GRANO: respuesta en 1-3 líneas con el dato concreto')
  && gen.includes('VOZ DEL CHAT: escribí como un amigo por WhatsApp, en minúscula, voseo, corto')
  && gen.includes('PROHIBIDO describir el posteo en el mensaje (título, caption, hashtags) cuando ya va en el bloque'));
check('5e techo de tokens 700→1200 y abort del modelo 25s→60s (cliente 90s)',
  gen.includes('max_tokens: 1200') && gen.includes('AbortSignal.timeout(60000)') && gen.includes('El cliente aborta a los 90s'));
check('5f MODO PEDIDO sigue (triage original intacto) y FOTO-OLVIDADA reescrita por el Lote A (índice por tema, nunca forzado a 0)',
  gen.includes('MODO PEDIDO: muchos clientes no quieren brainstormear') && gen.includes('FOTO-OLVIDADA: photo_index por tema') && gen.includes('no se fuerza photo_index') && !gen.includes('FOTO-OLVIDADA: photo_index forzado a 0'));
// (LOTE A · re-base v821) 5f actualizado: en el árbol fusionado FOTO-OLVIDADA YA es
// la versión del Lote A (el índice se elige por tema o no se fuerza nada); la
// versión vieja («forzado a 0») era lo que el Lote C dejó intacto a propósito.

// ---------- Parte 6: VM — chatIsShortCommand ----------
console.log('— 6) VM: comando corto —');
let SC = '';
try { SC = sliceFn(app, 'function chatIsShortCommand(t) {', 'async function chatSend() {'); } catch (e) { check('6x chatIsShortCommand presente', false, e.message); }
if (SC) {
  const sb = { console };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SC + '\nthis.__sc = chatIsShortCommand;', sb);
  const sc = sb.__sc;
  check('6a «esta semana» es comando corto', sc('esta semana') === true);
  check('6b «mis comentarios» es comando corto', sc('mis comentarios') === true);
  check('6c «¿qué sale esta semana?» es comando corto', sc('¿qué sale esta semana?') === true);
  check('6d «¿qué comentarios me dejaron en el posteo de fitness?» va al cerebro', sc('¿qué comentarios me dejaron en el posteo de fitness?') === false);
  check('6e «revisá mis dms y decime si hay algo urgente» va al cerebro', sc('revisá mis dms y decime si hay algo urgente') === false);
  check('6f vacío no es comando', sc('') === false);
  check('6g «mensajes» es comando corto', sc('mensajes') === true);
}

// ---------- Parte 7: VM — chatCardHTML ----------
console.log('— 7) VM: tarjeta del chat —');
let CC = '';
try { CC = sliceFn(app, 'function chatCardHTML(', '// Agrega un mensaje del asistente al chat'); } catch (e) { check('7x chatCardHTML presente', false, e.message); }
if (CC) {
  const sb = {
    console,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    pzIc: () => '',
    chatNextWeekHTML: () => '<div class="nw">WEEK</div>',
    proposalHTML: () => '',
    chatMsgHtml: (r, t) => '<div class="m">' + String(t) + '</div>',
    CHAT: [],
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(CC + '\nthis.__cc = chatCardHTML;', sb);
  const cc = sb.__cc;
  sb.CHAT = [];
  const h0 = cc(true, true, true);
  check('7a sin historial: saludo nuevo + chips visibles + línea de semana',
    h0.includes('hola! soy Posty. decime qué necesitás') && h0.includes('id="chatChips"') && h0.includes('haceme un posteo') && h0.includes('WEEK') && !h0.includes('qué hacemos hoy'));
  sb.CHAT = [{ role: 'user', text: 'hola' }];
  const h1 = cc(true, true, true);
  check('7b con historial: los chips SIGUEN visibles y no hay saludo',
    h1.includes('id="chatChips"') && !h1.includes('hola! soy Posty') && h1.includes('hola'));
  sb.CHAT = [];
  const h2 = cc(true, true, true, false, true);
  check('7c mainScr sin historial: saludo nuevo, sin línea de semana',
    h2.includes('hola! soy Posty. decime qué necesitás') && !h2.includes('WEEK'));
  const h3 = cc(true, true, true, true, false);
  check('7d schedMode: sin chips (la revisión no es chat)', !h3.includes('id="chatChips"'));
}

// ---------- Parte 8: VM — pzChatShowDraftsTopic ----------
console.log('— 8) VM: show_drafts por tema —');
let TP = '';
try { TP = sliceFn(srv, 'function pzChatShowDraftsTopic(', "app.post('/api/ideas/chat'"); } catch (e) { check('8x helper presente', false, e.message); }
if (TP) {
  const sb = { console };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(TP + '\nthis.__tp = pzChatShowDraftsTopic;', sb);
  const tp = sb.__tp;
  const drafts = [
    { caption: 'nuevo menú del día, vení a probar', media_type: 'image' },
    { caption: 'empezá hoy: tu primera clase de fitness gratis', media_type: 'image' },
  ];
  const r1 = tp(drafts, 'mostrame el posteo de fitness');
  check('8a «posteo de fitness»: el de fitness va primero, sin línea honesta',
    r1.list[0].caption.includes('fitness') && r1.topic === '');
  const r2 = tp(drafts, 'mostrame el posteo de yoga');
  check('8b «posteo de yoga»: ninguno matchea → topic yoga para la línea honesta',
    r2.topic === 'yoga' && r2.list.length === 2);
  const r3 = tp(drafts, 'mostrame mis posteos');
  check('8c pedido genérico: sin tema, la lista sale tal cual', r3.topic === '' && r3.list[0].caption.includes('menú'));
  const r4 = tp([{ caption: 'promo del mes', media_type: 'image' }, { caption: 'clase en vivo', media_type: 'video' }], 'mostrame el reel de fitness');
  check('8d «reel de fitness»: el video va primero por media_type', r4.list[0].media_type === 'video');
  const r5 = tp(drafts, 'mostrame el posteo de gym');
  check('8e «gym» (3 letras) también es tema', r5.topic === 'gym' || r5.list[0].caption.includes('fitness'));
}

// ---------- Parte 9: boot real ----------
console.log('— 9) boot real —');
const PORT = 34576;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-nuevo-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const TEST_KEY = 'boot-test-key-cn';

async function reqJson(method, p, body, cookie, contentType) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers, body: body === undefined ? undefined : (contentType ? body : JSON.stringify(body)) });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}

async function parteBoot() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    check('9a el servidor levanta con el lote', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    check('9b /api/version = v822 (estampado)', ver && ver.build === '20261105-v822', JSON.stringify(ver));
    const appJs = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=557`)).text();
    check('9c el app.js servido trae el lote (saludo nuevo + comando corto + dropTyping)',
      appJs.includes('hola! soy Posty. decime qué necesitás') && appJs.includes('function chatIsShortCommand') && appJs.includes('dropTyping()') && !appJs.includes('qué hacemos hoy'), 'len ' + appJs.length);
    const cssTxt = await (await fetch(`http://127.0.0.1:${PORT}/styles.css?v=20261209`)).text();
    check('9d el styles.css servido trae el punto en línea', cssTxt.includes('.chat-online-dot{') && cssTxt.includes('background:#22C55E'), 'len ' + cssTxt.length);
    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'cn-test', device: 'test-device-cn' });
    check('9e join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
    const uid = join.json.user_id;
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
    try { db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid); } catch (e) {}
    // El join de prueba marca concierge=1 ('prueba-chat') y eso desvía el
    // chat al conserje antes del cerebro: para probar el cerebro se apaga.
    try { db.prepare('UPDATE users SET concierge = 0 WHERE id = ?').run(uid); } catch (e) {}
    const ins = db.prepare("INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (?,?,?,?)");
    for (let i = 0; i < 5; i++) ins.run(uid, i % 2 ? 'assistant' : 'user', 'reciente ' + i, new Date().toISOString().slice(0, 19).replace('T', ' '));
    ins.run(uid, 'user', 'hace dos dias', new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 19).replace('T', ' '));
    ins.run(uid, 'assistant', 'hace ocho dias', new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 19).replace('T', ' '));
    const hist = await reqJson('GET', '/api/ideas/chat', undefined, cookie);
    const msgs = (hist.json && hist.json.messages) || [];
    const texts = msgs.map((m) => m.text || '');
    check('9f GET historial: entran los 5 recientes + el de hace 2 días; el de hace 8 días queda afuera',
      hist.status === 200 && texts.some((t) => t.includes('hace dos dias')) && !texts.some((t) => t.includes('hace ocho dias')) && texts.filter((t) => t.startsWith('reciente')).length === 5,
      JSON.stringify(texts));
    const greet = await reqJson('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] }, cookie);
    check('9g POST saludo puro responde sin modelo', greet.status === 200 && greet.json && greet.json.reply === 'hola! 😄 con qué te ayudo hoy?' && greet.json.idea === null, JSON.stringify(greet.json));
    const join2 = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'cn-test-2', device: 'test-device-cn-2' });
    const uid2 = join2.json && join2.json.user_id;
    const cookie2 = join2.setCookie ? String(join2.setCookie).split(';')[0] : '';
    try { db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid2); } catch (e) {}
    for (let i = 0; i < 65; i++) ins.run(uid2, i % 2 ? 'assistant' : 'user', 'lote ' + i, new Date().toISOString().slice(0, 19).replace('T', ' '));
    const hist2 = await reqJson('GET', '/api/ideas/chat', undefined, cookie2);
    const msgs2 = (hist2.json && hist2.json.messages) || [];
    check('9h GET historial con 65 filas: devuelve exactamente 60 (tope nuevo)', hist2.status === 200 && msgs2.length === 60, 'len ' + msgs2.length);
  } finally { kill(); }
}

(async () => {
  try { await parteBoot(); } catch (e) { check('9x boot sin excepción', false, e.message); }
  console.log(`\nlote-chat-nuevo: ${pass} ok, ${fail} mal`);
  if (fails.length) console.log('fallos:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
