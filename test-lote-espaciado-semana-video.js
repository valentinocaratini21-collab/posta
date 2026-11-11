// test-lote-espaciado-semana-video.js — LOTE v882 ESPACIADO SEMANA+VIDEO
// (10/11, mock aprobado por Valentino «perfecto. armalo asi»): la home
// quedó «todo muy amontonado» — el reset global *{margin:0} dejaba la nota
// con 4px abajo, el puente con 2px abajo y el h3 del video sin regla propia.
// Fix SOLO CSS, sin tocar texto ni markup:
//  - styles.css: nota 18px 2px 12px, 14px, lh 1.6 · puente 12px 2px 48px,
//    lh 1.6 · nueva .lp-vp h3 26px/800/-0.02em, margin 0 0 12px ·
//    .lp-vp .lede margin-bottom 32px · .lp-week-note + .lp-vp 36px (solo
//    dispara en la home EN, que no tiene puente: paridad ES/EN) · móvil
//    h3 23px.
//  - prueba.html / en-prueba.html (standalone, NO cargan styles.css: su
//    CSS vive en su <style> inline): mismo tratamiento solo en el bloque
//    de video, vía .sec:has(> .vp-row) — :has() ya se usa en el codebase
//    (prueba.html:851, styles.css:3082/3084/3552). Ningún otro h3 tocado.
// Base v868 (ref 4dc51788). SIN estampar: styles?v= lo pone el preparador.
// Node puro, sin boot. Uso: node test-lote-espaciado-semana-video.js
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const css = read('public/styles.css');
const prueba = read('public/prueba.html');
const enPrueba = read('public/en-prueba.html');
const app = read('public/app.js');
const idxEs = read('public/index.html');
const idxEn = read('public/en/index.html');
const cnt = (s, sub) => s.split(sub).length - 1;
const wcl = (s) => (s.match(/\n/g) || []).length;

// ---------- styles.css: nota y puente (valores nuevos, viejos en 0) ----------
t(cnt(css, '.lp-week-note{margin:18px 2px 12px;font-size:14px;color:var(--mut);text-align:center;line-height:1.6}') === 1,
  '§1 nota nueva: margin 18px 2px 12px, 14px, lh 1.6');
t(cnt(css, '.lp-week-note{margin:14px 2px 4px;font-size:13px;color:var(--mut);text-align:center}') === 0,
  '§1 nota vieja (4px abajo, 13px) en 0');
t(cnt(css, '.lp-week-bridge{text-align:center;font-size:15px;color:var(--mut);margin:12px 2px 48px;line-height:1.6}') === 1,
  '§2 puente nuevo: margin 12px 2px 48px, lh 1.6');
t(cnt(css, '.lp-week-bridge{text-align:center;font-size:15px;color:var(--mut);margin:12px 2px 2px}') === 0,
  '§2 puente viejo (2px abajo) en 0');

// ---------- styles.css: reglas nuevas del video ----------
t(cnt(css, '.lp-vp h3{text-align:center;font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0 0 12px}') === 1,
  '§3 .lp-vp h3 nueva: 26px/800/-0.02em, margin 0 0 12px, centrada');
t(cnt(css, '.lp-vp .lede{margin-bottom:32px}') === 1,
  '§4 .lp-vp .lede: margin-bottom 32px explícito');
t(cnt(css, '.lp-week-note + .lp-vp{margin-top:36px}') === 1,
  '§5 .lp-week-note + .lp-vp: 36px (solo EN, sin puente)');
t(cnt(css, '@media(max-width:760px){.lp-vp h3{font-size:23px}}') === 1,
  '§6 móvil: .lp-vp h3 23px a ≤760px');
t(cnt(css, '.lp-vp h3') === 2, '§6 .lp-vp h3 aparece ×2 (desktop + móvil, nada más)');

// ---------- paridad ES/EN de la home ----------
t(/<p class="lp-week-note">[^<]*<\/p>\s*<div class="lp-vp">/.test(idxEn),
  '§7 EN home: la nota va seguida directo por .lp-vp (dispara la regla +36px)');
t(!/<p class="lp-week-note">[^<]*<\/p>\s*<div class="lp-vp">/.test(app),
  '§7 ES home (app.js): entre nota y .lp-vp está el puente (la regla +36px NO dispara)');
t(cnt(app, 'Un video premium cada semana') === 1, '§7 app.js: h3 ES ×1, texto intacto');
t(cnt(idxEn, 'One premium video every week') === 1, '§7 EN index: h3 EN ×1, texto intacto');

// ---------- /prueba y /en/prueba: :has solo en el bloque de video ----------
for (const [name, src] of [['prueba', prueba], ['en-prueba', enPrueba]]) {
  t(cnt(src, '.sec:has(> .vp-row) h3{text-align:center;font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0 0 12px}') === 1,
    `§8 ${name}: :has h3 26px ×1`);
  t(cnt(src, '.sec:has(> .vp-row) > .lede{margin-bottom:32px}') === 1,
    `§8 ${name}: :has lede 32px ×1`);
  t(cnt(src, '@media(max-width:760px){.sec:has(> .vp-row) h3{font-size:23px}}') === 1,
    `§8 ${name}: :has móvil h3 23px ×1`);
  t(cnt(src, '.sec:has(> .vp-row)') === 3,
    `§8 ${name}: .sec:has(> .vp-row) ×3 en total (h3 + lede + móvil)`);
  t(cnt(src, '.sec h3{font-size:22px;font-weight:800;margin-bottom:6px}') === 1,
    `§9 ${name}: .sec h3 base (22px) intacta`);
  t(cnt(src, '.sec h3{font-size:24px;letter-spacing:-.01em}') === 1,
    `§9 ${name}: .sec h3 desktop (24px) intacta`);
  t(cnt(src, '.sec .lede{color:var(--mut);margin-bottom:20px;font-size:15px}') === 1,
    `§9 ${name}: .sec .lede base (20px) intacta`);
  t(cnt(src, '.sec{margin:44px 0}') === 1, `§9 ${name}: .sec margin 44px intacto`);
}

// ---------- sin tocar nada más ----------
t(cnt(css, '20261105-v868') === 0, '§10 styles.css no trae BUILD (no es server.js)');
t(wcl(css) === 6117, `§10 styles.css 6117 líneas (era 6112, +5) [${wcl(css)}]`);
t(wcl(prueba) === 8016, `§10 prueba.html 8016 líneas (era 8012, +4) [${wcl(prueba)}]`);
t(wcl(enPrueba) === 8001, `§10 en-prueba.html 8001 líneas (era 7997, +4) [${wcl(enPrueba)}]`);
t(css.split('{').length === css.split('}').length, '§10 styles.css: llaves equilibradas');
t(idxEs.includes('styles.css?v=20261231') && idxEn.includes('styles.css?v=20261231'),
  '§10 styles?v=20261231 estampado en ambos index');
t(!idxEs.includes('styles.css?v=20261226') && !idxEn.includes('styles.css?v=20261226'),
  '§10 styles?v=20261226 ya no presente (reemplazado por 20261231)');
t(app.includes("lpWeekBridge") && app.includes('lp-week-bridge'),
  '§10 app.js: puente y lpWeekBridge intactos (sin tocar app.js)');

console.log(`\ntest-lote-espaciado-semana-video: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
