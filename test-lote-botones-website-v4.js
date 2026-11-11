// test-lote-botones-website-v4.js — LOTE v886 BOTONES DEL WEBSITE VARIANTE 4
// (10/11, Valentino eligió la 4 «variante 4»): el botón principal del website
// pasa a ser más grande y con flecha en vez del ojo — mismo azul #2793C8,
// font-size 17px, padding 17px 34px. Sin cambiar ni una palabra de texto.
// Alcance SOLO website (home + /prueba + barra fija móvil), NUNCA la app:
//  - styles.css: .lp-igform button 16px/15px 26px -> 17px/17px 34px + sombra
//    v4 (cubre los 4 botones hero: index.html:320, app.js:4840/4945,
//    en/index.html:336/638 — todos ya usaban #wb-go, la flecha) · nueva
//    regla .lp-cta-big con los mismos valores para los links de cierre.
//  - Home bottom links (app.js:5024 ES, en/index.html:810 EN): clase
//    lp-cta-big, sin inline, icono #wb-eye -> #wb-go (la flecha ya existe
//    como símbolo #wb-go en app.js:4734; NO se crea símbolo nuevo).
//  - /prueba + /en/prueba: su .btn base YA es 17px/16px 34px (tamaño v4) ->
//    solo iconos: #wb-eye -> #wb-go en #btnGo, #btnPrefillGo, #btnWebTrialGo,
//    #btnGo2, #exMine y en el reset JS de #btnGo (2237/2228). #btnShy
//    (linklike «Mirá un ejemplo») y #wb-down (1180, scroll al form) quedan
//    como están, a propósito (el ojo / la flecha abajo son semánticos ahí).
//  - #stickyFormBar (amarilla, solo móvil): 16px/15px 18px -> 17px/17px 18px
//    + flecha #wb-go en el markup.
//  - La app queda intacta: .btn base 14px y .btn-primary sin tocar;
//    .pz-lp-cta («Probar 3 días gratis», app.js:24804) sin lp-cta-big.
// Base v879 (ref a49996de), re-base del preparador sobre el HEAD vivo.
// RE-PINEO DEL RE-ESTAMPADOR v886 (base v885, ref 4b9b9ff0): §5/§6 +4 líneas
// (v882 añadió 4 líneas en prueba.html y en-prueba.html) y §7 a los conteos
// de la base v885 (styles.css 6118, app.js 31205, prueba 8016, en-prueba 8001).
// Estampado: BUILD v886, ?v=602 (solo ES), styles?v=20261232 (AMBOS index).
// Node puro, sin boot. Uso: node test-lote-botones-website-v4.js
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const css = read('public/styles.css');
const app = read('public/app.js');
const idxEs = read('public/index.html');
const idxEn = read('public/en/index.html');
const prueba = read('public/prueba.html');
const enPrueba = read('public/en-prueba.html');
const server = read('server.js');
const cnt = (s, sub) => s.split(sub).length - 1;
const nlines = (s) => s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
const line = (s, n) => s.split('\n')[n - 1] || '';

// ---------- §1 styles.css: hero form buttons 17px/17px 34px + sombra v4 ----------
t(cnt(css, '.lp-igform button{border-radius:999px;font-size:17px;padding:17px 34px;cursor:pointer;box-shadow:0 8px 22px rgba(39,147,200,.45),inset 0 1px 0 rgba(255,255,255,.55)}') === 1,
  '§1 .lp-igform button: 17px/17px 34px + sombra v4');
t(cnt(css, '.lp-igform button{border-radius:999px;font-size:16px;padding:15px 26px;cursor:pointer}') === 0,
  '§1 .lp-igform button viejo (16px/15px 26px) en 0');
t(cnt(css, '.lp-cta-big{font-size:17px;padding:17px 34px;box-shadow:0 8px 22px rgba(39,147,200,.45),inset 0 1px 0 rgba(255,255,255,.55)}') === 1,
  '§1 .lp-cta-big nueva: 17px/17px 34px + sombra v4');
t(cnt(css, 'lp-cta-big') === 1, '§1 lp-cta-big aparece ×1 en styles.css (solo la regla)');

// ---------- §2 styles.css: base de la app intacta ----------
t(cnt(css, '.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;cursor:pointer;font-weight:800;font-size:14px;border-radius:999px;padding:12px 26px;') === 1,
  '§2 .btn base intacto: 14px/12px 26px (la app no se agranda)');
t(cnt(css, '.btn-primary{background:var(--cel);color:#fff;box-shadow:0 6px 16px rgba(39,147,200,.42),inset 0 1px 0 rgba(255,255,255,.55)}') === 1,
  '§2 .btn-primary base intacto (sin tocar global)');
t((css.match(/{/g) || []).length === (css.match(/}/g) || []).length,
  '§2 styles.css: llaves equilibradas');

// ---------- §3 home ES: hero con flecha, cierre con clase nueva ----------
t(cnt(app, 'Ver mi semana gratis') === 3, '§3 app.js: «Ver mi semana gratis» ×3, textos intactos');
t(line(app, 4840).includes('href="#wb-go"'), '§3 app.js:4840 hero ES: flecha #wb-go');
t(line(app, 4945).includes('href="#wb-go"'), '§3 app.js:4945 2º form ES: flecha #wb-go');
t(line(app, 5024).includes('lp-cta-big'), '§3 app.js:5024 cierre ES: clase lp-cta-big');
t(!line(app, 5024).includes('style="font-size'), '§3 app.js:5024 cierre ES: sin inline de tamaño');
t(line(app, 5024).includes('href="#wb-go"'), '§3 app.js:5024 cierre ES: flecha #wb-go');
t(!line(app, 5024).includes('#wb-eye'), '§3 app.js:5024 cierre ES: ojo viejo en 0');
t(cnt(app, 'href="#wb-eye"') === 0, '§3 app.js: #wb-eye en 0 (el único era el cierre)');
t(line(idxEs, 320).includes('href="#wb-go"'), '§3 index.html:320 hero ES estático: flecha #wb-go');
t(cnt(app, 'lp-cta-big') === 1, '§3 app.js: lp-cta-big ×1 (solo el cierre)');
t(cnt(app, 'Probar 3 días gratis') === 2, '§3 app.js: «Probar 3 días gratis» ×2 (string trialCta:5087 + pz-lp-cta:24804, app) intacto');
t(!app.includes('pz-lp-cta"><a class="btn btn-primary lp-cta-big'), '§3 app.js: el CTA de la app NO lleva lp-cta-big');

// ---------- §4 home EN: espejo de §3 ----------
t(cnt(idxEn, 'See my week, free') === 3, '§4 en/index.html: «See my week, free» ×3, textos intactos');
t(line(idxEn, 336).includes('href="#wb-go"'), '§4 en/index.html:336 hero EN: flecha #wb-go');
t(line(idxEn, 638).includes('href="#wb-go"'), '§4 en/index.html:638 2º form EN: flecha #wb-go');
t(line(idxEn, 810).includes('lp-cta-big'), '§4 en/index.html:810 cierre EN: clase lp-cta-big');
t(!line(idxEn, 810).includes('style="font-size'), '§4 en/index.html:810 cierre EN: sin inline de tamaño');
t(line(idxEn, 810).includes('href="#wb-go"'), '§4 en/index.html:810 cierre EN: flecha #wb-go');
t(!line(idxEn, 810).includes('#wb-eye'), '§4 en/index.html:810 cierre EN: ojo viejo en 0');
t(cnt(idxEn, 'href="#wb-eye"') === 0, '§4 en/index.html: #wb-eye en 0 (el único era el cierre)');
t(cnt(idxEn, 'lp-cta-big') === 1, '§4 en/index.html: lp-cta-big ×1 (solo el cierre)');

// ---------- §5 /prueba: iconos flecha en los submits, resto intacto ----------
for (const [ln, id] of [[1259, '#btnGo'], [1294, '#btnPrefillGo'], [1316, '#btnWebTrialGo'], [1340, '#btnGo2'], [1500, '#exMine']]) {
  t(line(prueba, ln).includes(`id="${id.slice(1)}"`) && line(prueba, ln).includes('href="#wb-go"'),
    `§5 prueba.html:${ln} ${id}: flecha #wb-go`);
}
t(line(prueba, 2241).includes("btn.textContent = 'Ver mi semana") && line(prueba, 2241).includes('href="#wb-go"'),
  '§5 prueba.html:2241 reset JS de #btnGo: flecha #wb-go (no vuelve el ojo)');
t(line(prueba, 1273).includes('id="btnShy"') && line(prueba, 1273).includes('href="#wb-eye"'),
  '§5 prueba.html:1273 #btnShy («Mirá un ejemplo») SIGUE con ojo, a propósito');
t(line(prueba, 1184).includes('href="#wb-down"'),
  '§5 prueba.html:1184 «Armar mi semana» SIGUE con flecha abajo (scroll al form)');
t(cnt(prueba, 'href="#wb-eye"') === 1, '§5 prueba.html: #wb-eye ×1 (solo #btnShy)');
t(cnt(prueba, 'Ver mi semana') === 4, '§5 prueba.html: «Ver mi semana» ×4 (2 botones + reset JS + string entryIgGo:4998), textos intactos');
t(cnt(prueba, 'Armar mi semana') === 3, '§5 prueba.html: «Armar mi semana» ×3, textos intactos');
t(line(prueba, 743).includes('font-size:17px;padding:17px 18px'),
  '§5 prueba.html:743 .sticky-form-bar: 17px/17px 18px');
t(line(prueba, 1446).includes('id="stickyFormBar"') && line(prueba, 1446).includes('href="#wb-go"'),
  '§5 prueba.html:1446 #stickyFormBar: flecha #wb-go en el markup');
t(cnt(prueba, '.btn{display:inline-block') === 1 && line(prueba, 101).includes('padding:16px 34px;font-size:17px'),
  '§5 prueba.html: .btn base YA era 17px/16px 34px (tamaño v4, sin tocar)');

// ---------- §6 /en/prueba: espejo de §5 ----------
for (const [ln, id] of [[1252, '#btnGo'], [1287, '#btnPrefillGo'], [1309, '#btnWebTrialGo'], [1333, '#btnGo2'], [1493, '#exMine']]) {
  t(line(enPrueba, ln).includes(`id="${id.slice(1)}"`) && line(enPrueba, ln).includes('href="#wb-go"'),
    `§6 en-prueba.html:${ln} ${id}: flecha #wb-go`);
}
t(line(enPrueba, 2232).includes("btn.textContent = 'See my week") && line(enPrueba, 2232).includes('href="#wb-go"'),
  '§6 en-prueba.html:2232 reset JS de #btnGo: flecha #wb-go');
t(line(enPrueba, 1266).includes('id="btnShy"') && line(enPrueba, 1266).includes('href="#wb-eye"'),
  '§6 en-prueba.html:1266 #btnShy SIGUE con ojo, a propósito');
t(line(enPrueba, 1177).includes('href="#wb-down"'),
  '§6 en-prueba.html:1177 «Build my week» SIGUE con flecha abajo (scroll al form)');
t(cnt(enPrueba, 'href="#wb-eye"') === 1, '§6 en-prueba.html: #wb-eye ×1 (solo #btnShy)');
t(line(enPrueba, 736).includes('font-size:17px;padding:17px 18px'),
  '§6 en-prueba.html:736 .sticky-form-bar: 17px/17px 18px');
t(line(enPrueba, 1439).includes('id="stickyFormBar"') && line(enPrueba, 1439).includes('href="#wb-go"'),
  '§6 en-prueba.html:1439 #stickyFormBar: flecha #wb-go en el markup');

// ---------- §7 líneas y estampado (re-pineado por el preparador a v886) ----------
t(nlines(css) === 6118, '§7 styles.css 6118 líneas (+1 regla nueva)');
t(nlines(app) === 31205, '§7 app.js 31205 líneas (base v885, lote 1→1 sin cambio)');
t(nlines(idxEn) === 1817, '§7 en/index.html 1817 líneas');
t(nlines(prueba) === 8016, '§7 prueba.html 8016 líneas');
t(nlines(enPrueba) === 8001, '§7 en-prueba.html 8001 líneas');
t(server.includes('20261105-v886'), '§7 server.js: BUILD v886 (estampado)');
t(idxEs.includes('app.js?v=602'), '§7 index ES: ?v=602 (estampado)');
t(idxEs.includes('styles.css?v=20261232') && idxEn.includes('styles.css?v=20261232'), '§7 index ES+EN: styles?v=20261232 (estampado, mismo valor)');
t(!server.includes('20261105-v879') && !idxEs.includes('app.js?v=598'), '§7 sin valores viejos (BUILD v879 y ?v=598 en 0)');

console.log(`\ntest-lote-botones-website-v4: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
