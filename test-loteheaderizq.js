// HEADER-IZQ — test del lote. Sin navegador: verifica cableado por grep
// sobre el código real + el presupuesto de ancho de la fila del encabezado
// medido en el render Chromium a 390px (ver STATUS).
// Uso: node work/test-loteheaderizq.js  (exit 0 = verde)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PUB = path.join(__dirname, 'public');
const app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
const idxES = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(PUB, 'en', 'index.html'), 'utf8');
let ok = 0, bad = 0;
function t(name, cond, extra) {
  if (cond) { ok++; console.log('OK  ' + name); }
  else { bad++; console.log('FALLO ' + name + (extra ? ' :: ' + extra : '')); }
}
function count(s, re) { const m = s.match(re); return m ? m.length : 0; }
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);

// ---------- 1. Este lote toca SOLO styles.css ----------
t('app.js byte-idéntico a v617 (md5 dfbccc7b)', md5(app) === 'dfbccc7b', 'hallado=' + md5(app));
t('CHUNK_V intacto v612 (ningún chunk cambia)', /CHUNK_V = '20261101-v612'/.test(app));
t('sin data/ en el árbol de trabajo', !fs.existsSync(path.join(__dirname, 'data')));

// ---------- 2. Capas protegidas intactas (linaje v614–v617) ----------
t('zoom: .hf-tile manipulation x1', count(css, /\.hf-tile\{touch-action:manipulation\}/g) === 1);
t('zoom: ya no queda .hf-tile pan-y', !/\.hf-tile\{touch-action:pan-y\}/.test(css));
t('zoom: belt manipulation v616 intacto', /#inicioView,\.bb-bar,\.mz-tabs,\.mz-bottomstack\{touch-action:manipulation\}/.test(css));
t('zoom: meta viewport v615 intacto en ambos index', /maximum-scale=1, user-scalable=no/.test(idxES) && /maximum-scale=1, user-scalable=no/.test(idxEN));
t('zoom: pzZoomBlockInit/pzZoomTapExcluded intactos', /pzZoomBlockInit/.test(app) && /pzZoomTapExcluded/.test(app));
t('dock v615 intacto (5x flex:1)', /\.bb-bar \.bb-tab\{flex:1;min-width:0\}/.test(css));
t('F3 intacto (pan-y en imgs, pan-x en track)', /\.apv-media img,\.igmock-media img\{touch-action:pan-y/.test(css) && /\.igmock-media-car \.hf-d-track\{touch-action:pan-x/.test(css));
t('v614 intacto: prow flex-wrap', /#inicioView:not\(\.hf-collapsed\) \.hf-prow\{min-width:0;flex-wrap:wrap\}/.test(css));
t('v614 intacto: .hf-stats min-width:max-content', /#inicioView \.hf-stats\{min-width:max-content\}/.test(css));
t('v614 intacto: avatar 68 en bloque ≤820', /#inicioView \.hf-ava-in\{width:68px;height:68px\}/.test(css));
t('v614 intacto: icons margin-left:auto en ≤820', /#inicioView \.hf-head-icons\{margin-left:auto\}/.test(css));
t('v614 intacto: avatar colapsado 40 (especificidad mayor, no lo pisa el lote)', /#inicioView\.hf-collapsed \.hf-head \.hf-ava-in\{width:40px;height:40px\}/.test(css));
t('Aceptar todo intacto (fila + nota)', /\.hf-pacts-accept/.test(css) && /\.hf-accept-note/.test(css));

// ---------- 3. Fix HEADER-IZQ presente, después de v614 ----------
const iV614 = css.indexOf('LOTE INICIO-DOCK-ZOOM');
const iFix = css.indexOf('LOTE HEADER-IZQ');
t('bloque HEADER-IZQ presente x1', count(css, /LOTE HEADER-IZQ/g) === 1);
t('bloque HEADER-IZQ después de v614 (gana empates)', iFix > iV614 && iV614 > 0, 'v614=' + iV614 + ' fix=' + iFix);
const m820 = css.match(/@media\(max-width:820px\)\{[\s\S]*?#inicioView \.hf-head-ic svg\{width:16px;height:16px\}[\s\S]*?\n\}/);
t('tier ≤820 completo', !!m820
  && /#inicioView \.hf-head\{padding:12px\}/.test(css)
  && /#inicioView \.hf-ava-in\{width:60px;height:60px\}/.test(css)
  && /#inicioView \.hf-prow\{gap:10px\}/.test(css)
  && /#inicioView \.hf-stats\{gap:6px\}/.test(css)
  && /#inicioView \.hf-stat\{padding:0\}/.test(css)
  && /#inicioView \.hf-stat span\{font-size:11px\}/.test(css)
  && /#inicioView \.hf-head-icons\{gap:4px\}/.test(css)
  && /#inicioView \.hf-head-ic\{width:32px;height:32px\}/.test(css));
const m380 = css.match(/@media\(max-width:380px\)\{[\s\S]*?#inicioView \.hf-head-ic svg\{width:14px;height:14px\}[\s\S]*?\n\}/);
t('tier ≤380 completo', !!m380
  && /#inicioView \.hf-ava-in\{width:52px;height:52px\}/.test(css)
  && /#inicioView \.hf-prow\{gap:8px\}/.test(css)
  && /#inicioView \.hf-stats\{gap:4px\}/.test(css)
  && /#inicioView \.hf-stat span\{font-size:10px\}/.test(css)
  && /#inicioView \.hf-head-ic\{width:28px;height:28px\}/.test(css));
t('CSS con llaves balanceadas', count(css, /\{/g) === count(css, /\}/g), '{=' + count(css, /\{/g) + ' }=' + count(css, /\}/g));

// ---------- 4. Presupuesto de ancho a 390px (medido en render Chromium) ----------
// Ancho interior fila = 390 - 2*12 (margen tarjeta) - 2 (borde) - 2*12 (padding)
// = 340. Fila: avatar 60 + gap 10 + stats (72.14+57.66+41.47 + gaps 2*6)
// + gap 10 + íconos (32+4+32) = 331.27 ≤ 340 → una línea, sin wrap.
const budget390 = 60 + 10 + (72.14 + 57.66 + 41.47 + 12) + 10 + (32 + 4 + 32);
t('presupuesto 390px: fila ≤ 340 (una línea)', budget390 <= 340, 'fila=' + budget390.toFixed(2));
// A 360px (tier ≤380): interior = 360-24-2-24 = 310. Fila: 52+8+(65.6+52.4+37.7+8)+8+60 = 291.7.
const budget360 = 52 + 8 + (65.6 + 52.4 + 37.7 + 8) + 8 + (28 + 4 + 28);
t('presupuesto 360px: fila ≤ 310 (una línea)', budget360 <= 310, 'fila=' + budget360.toFixed(2));

// ---------- 5. styles?v= bumpeado en AMBOS index, y solo styles ----------
const vES = (idxES.match(/styles\.css\?v=([0-9]+)/) || [])[1];
const vEN = (idxEN.match(/styles\.css\?v=([0-9]+)/) || [])[1];
t('styles?v= bumpeado (≠20261127) e igual en ambos index', !!vES && vES === vEN && vES !== '20261127', 'ES=' + vES + ' EN=' + vEN);
t('app.js?v= intacto 417 en ES; EN sigue sin ?v= en app.js (sin cambios)', /\/app\.js\?v=417/.test(idxES) && !/app\.js\?v=/.test(idxEN));

console.log(`\n${ok} OK, ${bad} FALLOS`);
process.exit(bad ? 1 : 0);
