// test-lote-avatar-pzvozmsg.js — MICRO-LOTE AVATAR-PZVOZMSG (14/11).
// Origen: follow-up pineado en la suite de SUBIR-AVATAR-DEDUP (v1070).
// La cara de los mensajes de la tira de voz (pzVozMsgHTML) era el último
// círculo-cara de la app que usaba el logo con wordmark (/posty-logo.png,
// 226×62 recortado en un círculo de 22px, del que se lee «po»): el mismo
// defecto que Valentino corrigió en Subir el 14/11. La cara correcta es
// el avatar de Posty (/ai-avatar.png), el que ya usan los demás círculos.
// Alcance quirúrgico: UNA línea de app.js (el src de .pz-voz-face dentro
// de pzVozMsgHTML). Los 5 usos de landing/auth del logo (wordmark
// 226×62, no son caras) quedan byte-idénticos; textos, lógica de la tira
// y estilos no se tocan.
// La vecina test-lote-subir-avatar-dedup.js NO se re-escribe: su pin A5
// declaraba este spot como follow-up; este lote lo cierra y esta suite
// es la que pasa a pinear el estado nuevo.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const BASE_DIR = process.env.LOTE_BASE_DIR || path.join(__dirname, '..', 'base');
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + String(extra).slice(0, 260) : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);
const count = (s, sub) => String(s || '').split(sub).length - 1;
function extractFn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  const markers = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '];
  let end = src.length;
  for (const m of markers) {
    const j = src.indexOf(m, i + 10);
    if (j > 0 && j < end) end = j;
  }
  return src.slice(i, end);
}
function ruleOf(css, sel) {
  const i = css.indexOf(sel + '{');
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i) + 1);
}
function runMsgHTML(appSrc, m) {
  const fn = extractFn(appSrc, 'pzVozMsgHTML');
  if (!fn) return null;
  const ctx = {
    esc: (s) => String(s == null ? '' : s),
    pzIc: (n, s) => '[ic:' + n + ':' + s + ']',
  };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.__f = pzVozMsgHTML;', ctx);
  return ctx.__f(m);
}

const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const baseApp = fs.readFileSync(path.join(BASE_DIR, 'public', 'app.js'), 'utf8');
const baseCss = fs.readFileSync(path.join(BASE_DIR, 'public', 'styles.css'), 'utf8');

console.log('== A. La cara de la tira de voz es el avatar de Posty ==');
const outA = runMsgHTML(app, { role: 'assistant', text: 'listo, ya lo cambié' });
t('A1 pzVozMsgHTML existe y renderiza el mensaje del asistente', typeof outA === 'string' && outA.length > 0, outA);
t('A2 el markup lleva <img class="pz-voz-face" src="/ai-avatar.png">',
  has(outA, '<img class="pz-voz-face" src="/ai-avatar.png" alt="">'), outA);
t('A3 el markup del asistente no contiene posty-logo', !has(outA, 'posty-logo'), outA);
t('A4 el texto del mensaje se sigue renderizando', has(outA, '<span>listo, ya lo cambié</span>'), outA);
const fnNew = extractFn(app, 'pzVozMsgHTML') || '';
t('A5 el cuerpo de pzVozMsgHTML no menciona posty-logo en ninguna rama', !has(fnNew, 'posty-logo'));

console.log('== B. Lo demás queda exactamente igual ==');
const outU = runMsgHTML(app, { role: 'user', text: 'cambiame la foto' });
const outUBase = runMsgHTML(baseApp, { role: 'user', text: 'cambiame la foto' });
t('B1 el mensaje del usuario se renderiza byte-idéntico a la base', outU === outUBase, outU);
t('B2 el mensaje del usuario no lleva cara (sin <img>)', !has(outU, '<img'), outU);
t('B3 la regla .pz-voz-face de styles.css es idéntica a la base (mismo tamaño/posición)',
  ruleOf(css, '.pz-voz-face') === ruleOf(baseCss, '.pz-voz-face') && ruleOf(css, '.pz-voz-face') !== '',
  ruleOf(css, '.pz-voz-face'));

console.log('== C. Censo del logo: solo quedan los 5 de landing/auth ==');
t('C1 en el árbol quedan exactamente 5 usos de posty-logo.png', count(app, 'posty-logo.png') === 5,
  'count=' + count(app, 'posty-logo.png'));
t('C2 en la base había 6 (los 5 + la cara de la tira)', count(baseApp, 'posty-logo.png') === 6,
  'count=' + count(baseApp, 'posty-logo.png'));
const logoLines = (src) => src.split('\n').filter((l) => l.includes('posty-logo.png'));
const nuevas = logoLines(app), viejas = logoLines(baseApp);
t('C3 las 5 líneas con el logo son byte-idénticas a las de la base',
  nuevas.length === 5 && nuevas.every((l) => viejas.includes(l)));
t('C4 las 5 son el wordmark 226×62 de landing/auth (ninguna es una cara)',
  nuevas.every((l) => l.includes('width="226"') && l.includes('height="62"')));

console.log('== D. Alcance quirúrgico: una sola línea de app.js difiere de la base ==');
const la = baseApp.split('\n'), lb = app.split('\n');
let diffs = 0, diffTxt = '';
if (la.length === lb.length) {
  for (let i = 0; i < la.length; i++) {
    if (la[i] !== lb[i]) { diffs++; diffTxt = 'línea ' + (i + 1) + ': ' + lb[i].trim().slice(0, 120); }
  }
}
t('D1 app.js tiene el mismo largo en líneas que la base', la.length === lb.length, la.length + ' vs ' + lb.length);
t('D2 exactamente 1 línea difiere y es la de la cara de pzVozMsgHTML',
  diffs === 1 && has(diffTxt, 'pz-voz-face') && has(diffTxt, '/ai-avatar.png'), 'diffs=' + diffs + ' ' + diffTxt);
t('D3 styles.css es byte-idéntico a la base', css === baseCss);

console.log('\nRESULTADO: ' + pass + ' ok · ' + fail + ' mal');
process.exit(fail ? 1 : 0);
