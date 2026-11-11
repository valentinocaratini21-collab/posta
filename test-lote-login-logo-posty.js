// test-lote-login-logo-posty.js — LOTE LOGIN-LOGO-POSTY
// (10/11, mock aprobado por Valentino «perfecto. armalo asi», v3 con el logo
// a 55px): la pantalla de entrar mostraba la moneda de Bambooty + texto
// «posty.» arriba a la izquierda; el website muestra la cara de Posty +
// «posty.» (posty-logo.png). El cambio pone el logo del website en las 3
// pantallas de auth (login/registro, olvidó, reset), a 55px de alto
// (medido: el «posty.» dentro de posty-logo.png mide 26px de los 62px de
// la imagen; a 55px el texto se lee a ~23px, igual que el «posty.» actual).
//  - app.js: las 3 ocurrencias del encabezado de auth (authView, forgotView,
//    resetView) pasan de moneda+texto a <img class="logo-img logo-img-auth"
//    src="/posty-logo.png" ...>. Solo HTML en template literals.
//  - styles.css: nueva regla .logo-img-auth (55px desktop, 44px móvil) con
//    scope propio; NO toca .logo-img del website (34px/28px) ni .logo-img-foot.
// Base v878 (ref d3877249). SIN estampar: ?v=/styles?v= los pone el preparador.
// Node puro, sin boot. Uso: node test-lote-login-logo-posty.js
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const css = read('public/styles.css');
const app = read('public/app.js');
const server = read('server.js');
const idxEs = read('public/index.html');
const idxEn = read('public/en/index.html');
const cnt = (s, sub) => s.split(sub).length - 1;
const wcl = (s) => (s.match(/\n/g) || []).length;

const OLD_LOGO = '<img class="sello-cabecera" src="/logo-bambooty.png" width="34" height="34" alt="Bambooty">posty<span class="pdot">.</span>';
const NEW_LOGO = '<img class="logo-img logo-img-auth" src="/posty-logo.png" width="226" height="62" alt="Posty">';

// ---------- app.js: moneda vieja en 0 ----------
t(cnt(app, OLD_LOGO) === 0, '§1 moneda vieja (sello-cabecera + «posty.») en 0 en app.js');
t(cnt(app, 'logo-bambooty.png') === 0, '§1 logo-bambooty.png en 0 en app.js');
t(cnt(app, 'sello-cabecera" src=') === 0, '§1 sello-cabecera con src en 0 en app.js');

// ---------- app.js: logo nuevo ×3, en las 3 pantallas de auth ----------
t(cnt(app, NEW_LOGO) === 3, '§2 logo nuevo (logo-img-auth + posty-logo.png) ×3 en app.js');
t(cnt(app, 'posty-logo.png') === 5, '§2 posty-logo.png ×5 en app.js (2 website + 3 auth)');
const iAuth = app.indexOf('function authView(mode)');
const iForgot = app.indexOf('function forgotView()');
const iReset = app.indexOf('function resetView()');
const iNext = app.indexOf('\nfunction ', iReset + 10);
const spanAuth = app.slice(iAuth, iForgot);
const spanForgot = app.slice(iForgot, iReset);
const spanReset = app.slice(iReset, iNext === -1 ? undefined : iNext);
t(iAuth > 0 && cnt(spanAuth, NEW_LOGO) === 1, '§2 authView: 1 logo nuevo en su encabezado');
t(iForgot > 0 && cnt(spanForgot, NEW_LOGO) === 1, '§2 forgotView: 1 logo nuevo en su encabezado');
t(iReset > 0 && cnt(spanReset, NEW_LOGO) === 1, '§2 resetView: 1 logo nuevo en su encabezado');
t(cnt(app, "sessionStorage.setItem('posta_ver_web','1')") === 3, '§2 onclick posta_ver_web intacto ×3');

// ---------- M78: funciones de auth definidas, sin llamadas nuevas ----------
t(cnt(app, 'function authView(mode)') === 1, '§3 M78: authView definida ×1');
t(cnt(app, 'function forgotView()') === 1, '§3 M78: forgotView definida ×1');
t(cnt(app, 'function resetView()') === 1, '§3 M78: resetView definida ×1');

// ---------- styles.css: regla nueva con scope propio ----------
t(cnt(css, '.logo-img-auth{height:55px;width:auto;display:block}') === 1, '§4 .logo-img-auth: 55px desktop');
t(cnt(css, '@media(max-width:760px){.logo-img-auth{height:44px}}') === 1, '§4 .logo-img-auth: 44px a ≤760px');
t(cnt(css, '.logo-img{height:34px;width:auto;display:block}') === 1, '§4 .logo-img del website intacto (34px)');
t(cnt(css, '@media(max-width:760px){.logo-img{height:28px}.logo-img-foot{height:34px}}') === 1, '§4 .logo-img móvil del website intacto (28px)');
t(cnt(css, '.logo-img-foot{height:40px;width:auto;display:block}') === 1, '§4 .logo-img-foot intacto (40px)');
t(cnt(css, '.sello-cabecera{width:34px;height:34px;border-radius:50%;flex:none;margin-right:9px}') === 1, '§4 regla .sello-cabecera intacta (CSS muerto, sin tocar)');

// ---------- textos de la pantalla intactos ----------
t(app.includes('Bienvenido de vuelta'), '§5 «Bienvenido de vuelta» intacto');
t(app.includes('Probar 3 días gratis'), '§5 «Probar 3 días gratis» intacto (no se toca)');
t(app.includes('Usar otra cuenta'), '§5 «Usar otra cuenta» intacto');
t(app.includes('Tus cuentas en este dispositivo'), '§5 «Tus cuentas en este dispositivo» intacto (se ve en mayúsculas por CSS)');
t(app.includes('Crear cuenta'), '§5 «Crear cuenta» intacto');

// ---------- sin tocar nada más / sin estampar ----------
t(cnt(server, '20261105-v889') === 1, '§6 server.js BUILD v889 ×1 (estampado por el preparador)');
t(css.split('{').length === css.split('}').length, '§6 styles.css: llaves equilibradas');
t(wcl(app) === 31212, `§6 app.js 31212 líneas (v888 +0, reemplazo en línea sin cambio) [${wcl(app)}]`);
t(wcl(css) === 6122, `§6 styles.css 6122 líneas (era 6118, +4) [${wcl(css)}]`);
t(idxEs.includes('app.js?v=605'), '§6 app.js?v=605 estampado en index ES (preparador)');
t(!idxEs.includes('app.js?v=602') && !idxEs.includes('app.js?v=598') && !idxEs.includes('app.js?v=596'), '§6 solo ?v=605 en index ES (ni 602 de v886, ni 598 de v879, ni 596)');
t(idxEs.includes('styles.css?v=20261233') && idxEn.includes('styles.css?v=20261233'),
  '§6 styles?v=20261233 estampado en ambos index (preparador, mismo valor)');
t(!idxEs.includes('styles.css?v=20261232') && !idxEn.includes('styles.css?v=20261232'),
  '§6 styles?v=20261232 ausente (es de v886, no de v889)');

console.log(`\ntest-lote-login-logo-posty: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
