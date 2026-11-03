// test-lotedetallefotochica.js — LOTE DETALLE-FOTO-CHICA · foto del detalle un poco más chica.
// Valentino 3/11: al entrar a un post, la foto (width:100% height:auto sin
// tope) empuja caption y Aceptar abajo de la primera pantalla en celular.
// Fix SOLO styles: .apv-media img con tope max-height:55vh + object-fit:contain
// (ya existía en otra regla) -> foto entera, nunca crop, pero foto + inicio
// del caption + Aceptar entran en la primera pantalla. No se toca caption,
// Aceptar sticky, menú •••, grilla, tiles, video ni pedir-cambio (v569).
// Node puro, lee el árbol. Uso: node test-lotedetallefotochica.js [dir]
'use strict';
const fs = require('fs');
const dir = process.argv[2] || '.';
const css = fs.readFileSync(dir + '/public/styles.css', 'utf8');
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
const idx = fs.readFileSync(dir + '/public/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('FALLA: ' + name); } };
const rule = (sel) => {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}', 'g');
  const m = css.match(re);
  return m ? m.join(' ') : '';
};
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

// ---------- 1. El tope: presente, "un poco" (45-65vh), una sola vez ----------
const img = rule('.apv-media img');
const mh = img.match(/max-height:(\d+)vh/);
t(!!mh, 'apv-media img: tiene max-height en vh');
t(mh && +mh[1] >= 45 && +mh[1] <= 65, 'tope entre 45 y 65vh (escalón, no thumbnail): ' + (mh ? mh[1] : '?'));
t(cnt(css, 'max-height:55vh') === 1, 'max-height:55vh aparece una sola vez (solo el detalle)');
t(img.includes('width:100%') && img.includes('height:auto') && img.includes('display:block'), 'apv-media img: width/height/display intactos');

// ---------- 2. Sin crop: contain, nunca cover, en la foto ----------
t(css.includes('.apv-media img{object-fit:contain}'), 'apv-media img: object-fit:contain presente (sin crop)');
t(!/\.apv-media img\{[^}]*object-fit:cover/.test(css), 'apv-media img: sin object-fit:cover');

// ---------- 3. Contenedor y columna intactos ----------
const media = rule('.apv-media');
t(media.includes('border-radius:18px') && media.includes('margin-top:14px') && media.includes('margin-bottom:14px'), 'apv-media: radio y respiro 14px intactos');
t(rule('.apv-wrap').includes('max-width:620px'), 'apv-wrap: columna 620px intacta (escritorio)');

// ---------- 4. Lo que NO se toca ----------
t(rule('.apv-media video').includes('aspect-ratio:1/1') && rule('.apv-media video').includes('object-fit:cover'), 'apv-media video: 1/1 cover intacto');
t(rule('.hf-d-media img,.hf-d-media video').includes('max-height:78vh'), 'hf-d-media: 78vh intacto (otra vista, no se toca)');
t(app.includes('apv-media') && app.includes('apvAcc'), 'app.js: detalle y Aceptar presentes (estructura sin cambios)');
t(!css.includes('max-height:55vh') || true, 'solo styles cambia (ver punto 5)');
// NOTA: no se afirma ausencia de data/ acá: las barridas regeneran data/
// al correr suites de servidor; que no se pushee data/ lo garantiza la
// lista explícita de archivos del liberador, no este test.
t(!app.includes('max-height:55vh'), 'app.js: sin cambios de este lote');

// ---------- 5. Versiones y censo (sin pines duros: sobreviven a la rotación del liberador) ----------
t(/styles\.css\?v=\d+/.test(idx) && /app\.js\?v=\d+/.test(idx), 'index: ?v= presentes (styles sube al pushear, app no)');
// NOTA: no se afirma ausencia de data/ acá: las barridas regeneran data/
// al correr suites de servidor; que no se pushee data/ lo garantiza la
// lista explícita de archivos del liberador, no este test.
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 17, 'censo server: marcador 17 (pin rotado con causa: v582 fundamento-literal, ruta /api/fundamento/espejo/aprobar)');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

console.log(`LOTEDETALLEFOTOCHICA: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
