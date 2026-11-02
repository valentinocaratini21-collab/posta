#!/usr/bin/env node
// test-lotechatwebsite.js — LOTE CHAT-WEBSITE: el MISMO chat de la app en la
// home pública (dock de la app + misma hoja + mismo endpoint /api/ideas/chat).
// Con sesión: mismo chat e historia. Sin sesión: el mismo chat responde dudas
// del producto e invita a entrar o a la prueba (rama pública restringida: sin
// fundamento, sin semana, sin Bandeja, sin datos de clientes).
// Uso: node test-lotechatwebsite.js   (desde la raíz del árbol)
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 250) : ''); }
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

// Extrae una función JS por conteo de llaves (salta strings con escape).
function extractFn(src, name) {
  const i = src.indexOf('function ' + name);
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  if (open < 0) return null;
  let d = 0, q = null, esc = false;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

const app = read('public/app.js');
const srv = read('server.js');
const css = read('public/styles.css');
const idx = read('public/index.html');
const en = read('public/en/index.html');
const ctl = fs.existsSync(path.join(__dirname, '..', 'control', 'public', 'app.js'))
  ? { app: read('../control/public/app.js'), en: read('../control/public/en/index.html') } : null;

console.log('— home ES: widget viejo fuera, hero intacto —');
ok('ES: posty-chat.js ausente', !idx.includes('posty-chat.js'));
ok('ES: app.js sigue cargado', idx.includes('/app.js'));
ok('ES: gj.js sigue cargado', idx.includes('gj.js'));
ok('ES: hero intacto (1 ocurrencia)', count(app, 'Mi feed queda a medias') === 1);
if (ctl) ok('ES: hero igual que en control', count(app, 'Mi feed queda a medias') === count(ctl.app, 'Mi feed queda a medias'));

console.log('— home EN: widget viejo fuera, bloque propio, hero intacto —');
ok('EN: posty-chat.js ausente', !en.includes('posty-chat.js'));
ok('EN: dock propio', en.includes('pzLpDock') && en.includes('Chat with Posty'));
ok('EN: hoja propia', en.includes('pzLpSheet'));
ok('EN: mismo endpoint /api/ideas/chat', en.includes('/api/ideas/chat'));
ok('EN: CTA entrar', en.includes('#/login'));
ok('EN: CTA prueba', en.includes('/en/prueba'));
ok('EN: rotación con las 5 frases', ['Chat with Posty', 'write to posty…', 'ask about your week…', 'ask for an idea for today…', 'tell him what you sell…'].every((s) => en.includes(s)));
ok('EN: 4 puertas data-posty-chat intactas (5 refs totales menos 1 delegación)', count(en, 'data-posty-chat') === 5 && count(en, '[data-posty-chat]') === 1);
ok('EN: delegación de puertas (1 ref)', count(en, '[data-posty-chat]') === 1);
ok('EN: hero intacto (3 ocurrencias)', count(en, 'My feed is half-done') === 3);
if (ctl) ok('EN: hero igual que en control', count(en, 'My feed is half-done') === count(ctl.en, 'My feed is half-done'));

console.log('— cliente ES: mismo dock, misma hoja, sin duplicar el chat —');
const html = extractFn(app, 'pzLpChatHTML');
ok('pzLpChatHTML definida 1 vez', count(app, 'function pzLpChatHTML') === 1);
ok('pzLpChatHTML extraíble y libre de dependencias', !!html && !html.includes('${') && !html.includes('pzIc'));
if (html) {
  ok('dock: id pzLpDock', html.includes('pzLpDock'));
  ok('dock: botón mzChatOpen con aria-label Hablar con Posty', html.includes('mzChatOpen') && html.includes('Hablar con Posty'));
  ok('dock: cara canónica', html.includes('/ai-avatar.png'));
  ok('dock: texto con clase mz-ph-tx', html.includes('mz-ph-tx'));
  ok('hoja: mzSheet + botón cerrar ✕', html.includes('mzSheet') && html.includes('mzSheetX') && html.includes('✕'));
  ok('hoja: cuerpo pzLpSheetBody', html.includes('pzLpSheetBody'));
}
const bind = extractFn(app, 'pzLpChatBind');
ok('pzLpChatBind definida 1 vez', count(app, 'function pzLpChatBind') === 1);
ok('pzLpChatBind llamada en exactamente 2 montajes', count(app, 'pzLpChatBind();') === 2);
if (bind) {
  ok('bind: misma hoja vía chatCardHTML', bind.includes('chatCardHTML(true, true, true, false, true, false)'));
  ok('bind: NO usa bindChat (no marca CHAT_LOADED)', !bind.includes('bindChat(') && !bind.includes('CHAT_LOADED'));
  ok('bind: historia directa con chatLoadHistory', bind.includes('chatLoadHistory()'));
  ok('bind: rotación del dock con pzPhStart', bind.includes('pzPhStart()'));
  ok('bind: sin sesión quita subida de fotos', bind.includes("getElementById('chatPlus')"));
  ok('bind: sin sesión botón Enviar simple', bind.includes('pzLpSend'));
  ok('bind: sin sesión quita chips de cuenta', bind.includes("getElementById('chatChips')"));
  ok('bind: sin sesión CTA Entrar + prueba', bind.includes('#/login') && bind.includes('/prueba'));
  ok('bind: abre con mzOpenSheet y cierra con mzCloseSheet', bind.includes('mzOpenSheet(true)') && bind.includes('mzCloseSheet()'));
  ok('bind: Enter envía con chatSend', bind.includes('chatSend()'));
  ok('bind: input actualiza botón con chatUpdateSendBtn', bind.includes('chatUpdateSendBtn()'));
  ok('bind: delegación de puertas con guarda de dock', bind.includes('[data-posty-chat]') && bind.includes('__pzLpDoor'));
  ok('bind: idempotente por guarda de dock', bind.includes("getElementById('pzLpDock')"));
}
ok('chatCardHTML sin tocar (1 definición)', count(app, 'function chatCardHTML') === 1);
ok('chatSend sin tocar (1 definición)', count(app, 'function chatSend') === 1);
ok('mzOpenSheet/mzCloseSheet sin tocar', count(app, 'function mzOpenSheet') === 1 && count(app, 'function mzCloseSheet') === 1);
ok('montaje anclas intacto', count(app, 'lpInitHero();') === 2);

console.log('— servidor: mismo endpoint, rama pública restringida —');
ok('POST /api/ideas/chat sin requireAuth', srv.includes("app.post('/api/ideas/chat', async (req, res) => {"));
ok('POST vieja con requireAuth ausente', !srv.includes("app.post('/api/ideas/chat', requireAuth"));
ok('POST: sin sesión deriva a la rama pública', srv.includes('if (!req.session.userId) return pzChatPublic(req, res);'));
ok('POST: gate de prueba inline tras la deriva', srv.includes('let _lpNx = false; requireTrialValid(req, res, () => { _lpNx = true; });'));
ok('GET /api/ideas/chat sin requireAuth', srv.includes("app.get('/api/ideas/chat', (req, res) => {"));
ok('GET vieja con requireAuth ausente', !srv.includes("app.get('/api/ideas/chat', requireAuth"));
ok('GET: sin sesión devuelve bienvenida ES/EN', srv.includes("req.query.lang === 'en'") && srv.includes('hola! soy posty') && srv.includes("hi! i'm posty"));
ok('pzChatPublic definida 1 vez', count(srv, 'async function pzChatPublic') === 1);
const postIdx = srv.indexOf("app.post('/api/ideas/chat'");
const branch = srv.slice(srv.indexOf('const PZ_CHAT_PUBLIC_SYS'), postIdx);
ok('rama pública: rate limit anti-abuso', branch.includes('postyChatAllowed'));
ok('rama pública: parse + guardado del widget', branch.includes('postyChatParse') && branch.includes('postyChatSave'));
ok('rama pública: responde idea null', branch.includes('idea: null'));
ok('rama pública: hechos reales ES', branch.includes('USD 200') && branch.includes('1 de febrero de 2027') && branch.includes('3 días'));
ok('rama pública: hechos reales EN', branch.includes('February 1, 2027') && branch.includes('3-day'));
ok('rama pública: sin fundamento', !branch.includes('fundamento'));
ok('rama pública: sin Bandeja', !branch.includes('Bandeja'));
ok('rama pública: sin chat_messages', !branch.includes('chat_messages'));
ok('rama pública: sin chat_state ni gustos', !branch.includes('chat_state') && !branch.includes('tasteMemory'));
ok('rama pública: sin gate de prueba ni scheduled', !branch.includes('requireTrialValid') && !branch.includes('scheduled'));
ok('rama pública: guarda en landing', branch.includes("'landing'"));
ok('rama pública: fail-closed sin llave (texto amable, nunca 500)', branch.includes('sin OPENAI_API_KEY') && branch.includes('FALLBACK'));
ok('ruta vieja /api/posty-chat intacta para /prueba', count(srv, "app.post('/api/posty-chat'") === 1);

console.log('— estilos + censo + M78 —');
ok('styles: dock .pz-lp-dock', css.includes('.pz-lp-dock'));
ok('styles: CTA .pz-lp-cta', css.includes('.pz-lp-cta'));
ok('censo server 3/16/3/16', count(srv, 'catsMatch') === 3 && count(srv, 'week-redo') === 16 && count(srv, 'first_week') === 3 && count(srv, '/aprobar') === 16);
ok('censo app 4/1/1/0/7', count(app, 'pzGoBack') === 4 && count(app, 'pz-detalle-setup') === 1 && count(app, '/aprobar') === 1 && count(app, 'autofetch') === 0 && count(app, 'pcDayKeyShift') === 7);
const m78 = ['pzLpChatHTML', 'pzLpChatBind', 'mzOpenSheet', 'mzCloseSheet', 'chatSend', 'chatUpdateSendBtn', 'chatScroll', 'chatLoadHistory', 'pzPhStart', 'chatCardHTML'];
ok('M78: las 10 funciones tienen exactamente 1 definición', m78.every((f) => count(app, 'function ' + f) === 1));
ok('M78: el código nuevo llama a 9 de ellas (chatScroll vive dentro de chatSend)', ['pzLpChatHTML', 'pzLpChatBind', 'mzOpenSheet', 'mzCloseSheet', 'chatSend', 'chatUpdateSendBtn', 'chatLoadHistory', 'pzPhStart', 'chatCardHTML'].every((f) => bind ? bind.includes(f) : false));

console.log(`\nRESULT ok=${passed} fail=${failed}`);
process.exit(failed ? 1 : 0);
