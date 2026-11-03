#!/usr/bin/env node
// test-lotechatwebsitelindo.js — LOTE CHAT-WEBSITE-LINDO: en escritorio (≥1024px)
// el chat de la landing es un PANEL LATERAL derecho premium; en móvil sigue siendo
// la hoja de siempre. La app no se toca: el panel vive solo en la landing.
// Uso: node test-lotechatwebsitelindo.js   (desde la raíz del árbol)
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
const css = read('public/styles.css');
const en = read('public/en/index.html');

console.log('— ES: hoja de la landing marcada + cabecera premium —');
const html = extractFn(app, 'pzLpChatHTML');
ok('pzLpChatHTML definida 1 vez', count(app, 'function pzLpChatHTML') === 1);
if (html) {
  ok('hoja ES lleva clase pz-lp-sheet', html.includes('pz-lp-sheet'));
  ok('cabecera ES con cara + nombre', html.includes('pz-lp-face') && html.includes('pz-lp-nom') && html.includes('/ai-avatar.png'));
  ok('hoja ES sigue con mzSheet/mzSheetX/✕/pzLpSheetBody', html.includes('mzSheet') && html.includes('mzSheetX') && html.includes('✕') && html.includes('pzLpSheetBody'));
}

console.log('— ES: apertura/cierre solo-landing, app intacta —');
const bind = extractFn(app, 'pzLpChatBind');
ok('pzLpOpen definida 1 vez', count(app, 'function pzLpOpen') === 1);
ok('pzLpClose definida 1 vez', count(app, 'function pzLpClose') === 1);
ok('pzLpOpen llamada 2 veces (botón + puertas)', count(app, 'pzLpOpen()') === 3); // def + 2 llamadas
ok('pzLpClose llamada 2 veces (X + fondo)', count(app, 'pzLpClose()') === 3); // def + 2 llamadas
if (bind) {
  ok('bind ES no usa mzOpenSheet (no navega fuera de la landing)', !bind.includes('mzOpenSheet'));
  ok('bind ES sigue con chatCardHTML + historia + Enviar simple sin sesión',
    bind.includes('chatCardHTML(true, true, true, false, true, false)') && bind.includes('chatLoadHistory()') && bind.includes('pzLpSend'));
}
ok('mzOpenSheet/mzCloseSheet sin tocar (1 def cada uno)', count(app, 'function mzOpenSheet') === 1 && count(app, 'function mzCloseSheet') === 1);
ok('chatCardHTML/chatSend sin tocar (1 def cada uno)', count(app, 'function chatCardHTML') === 1 && count(app, 'function chatSend') === 1);
const openFn = extractFn(app, 'pzLpOpen');
const closeFn = extractFn(app, 'pzLpClose');
if (openFn) {
  ok('pzLpOpen: solo escritorio anima (clase pz-lp-open)', openFn.includes('pz-lp-open') && openFn.includes('innerWidth >= 1024'));
  ok('pzLpOpen: enfoca el campo', openFn.includes('chatInput'));
}
if (closeFn) {
  ok('pzLpClose: escritorio anima y luego oculta; móvil cierra directo',
    closeFn.includes('pz-lp-open') && closeFn.includes('setTimeout') && closeFn.includes('mzCloseSheet()'));
}

console.log('— ES: CSS del panel solo en escritorio —');
const marker = css.indexOf('(LOTE CHAT-WEBSITE-LINDO');
ok('bloque panel presente en styles.css', marker >= 0);
if (marker >= 0) {
  const block = css.slice(marker);
  ok('panel: media ≥1024px', block.includes('@media (min-width:1024px)'));
  ok('panel: derecha, ancho 420, alto completo, sin velo',
    block.includes('right:0') && block.includes('min(420px,94vw)') && block.includes('100dvh') && block.includes('background:transparent'));
  ok('panel: vidrio + sombra lateral', block.includes('rgba(255,255,255,.88)') && block.includes('blur(20px)') && block.includes('-24px 0 60px'));
  ok('panel: entra desde la derecha y se abre con clase', block.includes('translateX(106%)') && block.includes('pz-lp-open') && block.includes('translateX(0)'));
  ok('panel: cabecera cara 44px + nombre 19px navy', block.includes('pz-lp-face') && block.includes('44px') && block.includes('pz-lp-nom') && block.includes('19px') && block.includes('#0A1E33'));
  ok('panel: barra cómoda (48px, vidrio) + Enviar píldora, no círculo', block.includes('chat-input-row') && block.includes('48px') && block.includes('#pzLpSend{width:auto;height:48px'));
  ok('panel: reduced-motion sin transición', block.includes('prefers-reduced-motion'));
  ok('panel: cara oculta en móvil (cabecera móvil intacta) + Enviar píldora base', block.includes('.pz-lp-sheet .pz-lp-face{display:none}') && block.includes('.pz-lp-sheet .chat-input-row #pzLpSend{width:auto;height:48px'));
  ok('panel: ninguna regla pz-lp-sheet antes del bloque (móvil intacto)', !css.slice(0, marker).includes('pz-lp-sheet'));
}
ok('hoja base .mz-sheet intacta (fondo + tarjeta)', css.includes('.mz-sheet{position:fixed;inset:0') && css.includes('.mz-sheet-card{'));

console.log('— EN: panel propio en la home estática —');
ok('EN: hoja con clase de apertura', en.includes('pz-lp-open'));
ok('EN: cabecera con cara + nombre', en.includes('pzLpFace') && en.includes('pzLpNom'));
ok('EN: media ≥1024 con panel derecho 420 + vidrio', en.includes('@media (min-width:1024px)') && en.includes('min(420px,94vw)') && en.includes('rgba(255,255,255,.88)'));
ok('EN: tarjeta entra desde la derecha', en.includes('translateX(106%)') && en.includes('translateX(0)'));
ok('EN: fila cómoda (48px Enviar)', en.includes('#pzLpSend{height:48px'));
ok('EN: cara oculta en móvil', en.includes('#pzLpSheetHead .pzLpFace{display:none}'));

console.log(`\n${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
