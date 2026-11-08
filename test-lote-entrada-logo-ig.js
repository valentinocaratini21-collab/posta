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

// --- 2) Web del mismo tamaño que IG ---
// Botón web primario sólido en los dos archivos ES (en EN no hay webform).
t((idx.match(/btn btn-primary" type="submit">Usar mi web/g) || []).length === 1, 'ES index: botón web primario (no fantasma)');
t((app.match(/btn btn-primary" type="submit">Usar mi web/g) || []).length === 1, 'app.js: botón web primario (no fantasma)');
t(!/btn btn-ghost" type="submit">Usar mi web/.test(idx + app), 'ningún botón web fantasma restante');
// CSS unificado en styles.css (una sola verdad): web = IG en fuente, padding, borde y radio.
const igIn = /\.lp-igform input\{[^}]*font-size:17px;padding:15px 18px;border:2px solid #D7E5EE;border-radius:999px/.test(css);
const webIn = /\.lp-webform input\{[^}]*font-size:17px;padding:15px 18px;border:2px solid #D7E5EE;border-radius:999px/.test(css);
t(igIn, 'CSS: input IG 17px / 15px 18px / borde 2px / radio 999');
t(webIn, 'CSS: input web IGUAL que IG (17px / 15px 18px / borde 2px / radio 999)');
const igBtn = /\.lp-igform button\{[^}]*font-size:16px;padding:15px 26px/.test(css);
const webBtn = /\.lp-webform button\{[^}]*font-size:16px;padding:15px 26px/.test(css);
t(igBtn, 'CSS: botón IG 16px / 15px 26px');
t(webBtn, 'CSS: botón web IGUAL que IG (16px / 15px 26px)');
// El <style> inline viejo de .lp-webform ya no vive en index.html (vive en styles.css).
t(!idx.includes('.lp-webform input{flex:1;min-width:210px;font-size:16px;padding:12px 18px'), 'ES index: sin <style> inline viejo de webform (16px/12px)');
t((css.match(/\.lp-webform\{/g) || []).length === 1, 'CSS: .lp-webform definido 1 sola vez (sin duplicar)');
// Textos y placeholders intactos (nada de cambios de copy).
t(idx.includes('placeholder="@tu_negocio"') && idx.includes('placeholder="www.tunegocio.com.ar"'), 'ES index: placeholders intactos');
t(idxEn.includes('placeholder="@your_business"'), 'EN index: placeholder intacto');
t(app.includes('Ver mi semana') && app.includes('Usar mi web'), 'app.js: textos de botones intactos');
t(!app.includes('btn btn-ghost" type="submit">Usar mi web'), 'app.js: sin resto del botón fantasma');

console.log(`entrada-logo-ig: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
