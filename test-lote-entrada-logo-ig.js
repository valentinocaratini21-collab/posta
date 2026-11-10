// LOTE ENTRADA-LOGO-IG (pedido Valentino 7/11 ~18:48, con captura) — test nuevo.
// 1) El campo del @ de Instagram lleva el logo de Instagram a la izquierda
//    (SVG inline con degradado, reconocible) en las 3 instancias del hero
//    ES (index.html estático + landingView de app.js) y EN (en/index.html).
// 2) El campo de la web es del MISMO TAMAÑO que el del @: mismo alto,
//    fuente, padding, radio y botón (primario sólido, no fantasma).
// Corre con: node test-lote-entrada-logo-ig.js (desde el dir del árbol).
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
let pass = 0, fail = 0;
const t = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL:', n); } };

const css = fs.readFileSync(path.join(HERE, 'public', 'styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(HERE, 'public', 'index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(HERE, 'public', 'en', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(HERE, 'public', 'app.js'), 'utf8');

// --- 1) Logo de Instagram a la izquierda del @ ---
// El glifo: cuadrado redondeado con degradado IG + círculo blanco + punto.
const LOGO = /<span class="lp-ig-wrap"><svg class="lp-ig-ic" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="lpIgGrad\d+"[^>]*><stop offset="0" stop-color="#FEDA75"\/><stop offset="\.35" stop-color="#FA7E1E"\/><stop offset="\.65" stop-color="#D62976"\/><stop offset="1" stop-color="#962FBF"\/><\/linearGradient><\/defs><rect x="1\.5" y="1\.5" width="21" height="21" rx="6" fill="url\(#lpIgGrad\d+\)"\/><circle cx="12" cy="12" r="4\.4" fill="none" stroke="#fff" stroke-width="1\.8"\/><circle cx="17\.3" cy="6\.7" r="1\.4" fill="#fff"\/><\/svg><input /;
const countLogo = (s) => (s.match(/<span class="lp-ig-wrap"><svg class="lp-ig-ic"/g) || []).length;
t(countLogo(idx) === 1, 'ES index: 1 logo IG (hero estático)');
t(countLogo(app) === 3, 'ES app.js landingView: 3 logos IG (hero + muestra + cierre)');
t(countLogo(idxEn) === 3, 'EN index: 3 logos IG (hero + muestra + cierre)');
t(LOGO.test(idx) && LOGO.test(app) && LOGO.test(idxEn), 'logo: glifo IG completo (degradado + círculo + punto) en los 3 archivos');
// El logo va PEGADO al input, dentro del mismo wrapper, sin romper ids ni handlers
// (la regex LOGO de arriba ya exige la secuencia exacta wrapper+svg+input).
t((app.match(/id="lpIg"/g) || []).length === 1, 'app.js: id lpIg intacto (1 vez, lpGoTrial lo lee)');
t((idxEn.match(/id="lpIg"/g) || []).length === 1, 'EN index: id lpIg intacto (1 vez)');
t(app.includes('return lpGoTrial(event)'), 'app.js: handler lpGoTrial intacto');
t(app.includes("cleanIgHandle(this.querySelector('input').value)"), 'app.js: handlers cleanIgHandle intactos');
// CSS del wrapper: el logo no tapa el placeholder (padding-left 46px) y no rompe la fila flex.
t(/\.lp-ig-wrap\{position:relative;flex:1;min-width:210px;display:flex\}/.test(css), 'CSS: .lp-ig-wrap flex como el input');
t(/\.lp-igform \.lp-ig-wrap input\{[^}]*padding-left:46px/.test(css), 'CSS: input con padding-left 46px (logo sin tapar)');
t(/\.lp-ig-ic\{position:absolute;left:16px;top:50%;transform:translateY\(-50%\);width:22px;height:22px;pointer-events:none/.test(css), 'CSS: .lp-ig-ic centrado a la izquierda, sin capturar toques');

// --- 2) Web como link de texto, no botón (LOTE HERO+QUIZ) ---
// El botón "Usar mi web" murió: "Prefiero usar mi web" cambia el MISMO campo
// de Instagram a modo URL (toggle lpHeroWebToggle, sin segundo formulario).
t(!idx.includes('lp-webform') && !app.includes('lp-webform') && !idxEn.includes('lp-webform') && !css.includes('lp-webform'), 'sin lp-webform en ningún archivo');
t(!idx.includes('>Usar mi web') && !app.includes('>Usar mi web'), 'sin botón Usar mi web');
t(idx.includes('Prefiero usar mi web') && app.includes('Prefiero usar mi web'), 'ES: link Prefiero usar mi web');
t(idxEn.includes('Use my website instead'), 'EN: link Use my website instead');
t(app.includes('function lpHeroWebToggle(') && idx.includes('function lpHeroWebToggle(') && idxEn.includes('function lpHeroWebToggle('), 'toggle lpHeroWebToggle en las 3 superficies');
t(app.includes('/prueba?web=') && idx.includes('/prueba?web=') && idxEn.includes('/en/prueba?web='), 'rama ?web= en las 3 superficies');
t(app.includes('www.tunegocio.com.ar') && idxEn.includes('yourwebsite.com'), 'placeholders web en el toggle');
t(app.includes('Ver una semana de ejemplo') && idxEn.includes('See an example week'), 'link semana de ejemplo como texto');
// CSS: .lp-sec (texto, no botón) y muerte de .lp-webform.
t(css.includes('.lp-sec{') && css.includes('.lp-sec-link{') && css.includes('.lp-sec-dot{'), 'CSS: .lp-sec + link + punto');
t(!css.includes('.lp-webform'), 'CSS: sin .lp-webform');
// Botón del campo con el copy nuevo; logo IG y handler intactos (§1).
t(idx.includes('Ver mi semana gratis') && app.includes('Ver mi semana gratis'), 'ES: botón Ver mi semana gratis');
t(idxEn.includes('See my week, free'), 'EN: botón See my week, free');
t(idx.includes('placeholder="@tu_negocio"'), 'ES index: placeholder IG intacto');
t(idxEn.includes('placeholder="@your_business"'), 'EN index: placeholder intacto');

console.log(`entrada-logo-ig: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
