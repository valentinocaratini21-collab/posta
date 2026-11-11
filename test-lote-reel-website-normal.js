#!/usr/bin/env node
// Suite del lote REEL-WEBSITE-NORMAL v905.
// A: cap del héroe solo en escritorio · B: póster del video (cover_path) ·
// C: resto intacto · D: estampado · E: medidas del render.
// Corre desde la raíz del scratch: node test-lote-reel-website-normal.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const S = __dirname;
const REL = path.join(S, 'release');
const BASE = path.join(S, 'base-v907');
const read = (p) => fs.readFileSync(p, 'utf8');
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const nlines = (p) => read(p).split('\n').length - (read(p).endsWith('\n') ? 1 : 0);
const occ = (txt, re) => (txt.match(re) || []).length;

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

const cssB = read(path.join(BASE, 'public/styles.css'));
const cssR = read(path.join(REL, 'public/styles.css'));
const jsB = fs.readFileSync(path.join(BASE, 'public/app.js'), 'utf8');
const jsR = fs.readFileSync(path.join(REL, 'public/app.js'), 'utf8');
const srvR = read(path.join(REL, 'server.js'));
const idxR = read(path.join(REL, 'public/index.html'));
const idxEnR = read(path.join(REL, 'public/en/index.html'));

// ---------- A. Cap del héroe solo en escritorio ----------
const MQ = "@media(min-width:761px){.pz-hoy-hoy{max-width:480px;margin-left:auto;margin-right:auto}}";
t('A1: media query 761px .pz-hoy-hoy max-width 480px ×1 en release, ×0 en base',
  occ(cssR, new RegExp(MQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) === 1 && !cssB.includes(MQ));
t('A2: comentario de trazabilidad v905 ×1 en styles.css',
  occ(cssR, /REEL-WEBSITE-NORMAL v905/g) === 1);
t('A3: regla base .pz-hoy-hoy{margin-top:12px} intacta ×1',
  occ(cssR, /\.pz-hoy-hoy\{margin-top:12px\}/g) === 1);
t('A4: ningún otro max-width sobre .pz-hoy-hoy (solo la media query)',
  occ(cssR, /pz-hoy-hoy\{[^}]*max-width/g) === 1);
t('A5: el cap es min-width:761px (no toca viewports angostos)',
  cssR.includes('@media(min-width:761px){.pz-hoy-hoy{'));

// ---------- B. Póster del video = cover_path ----------
// El viejo snippet de 2 líneas en pzHoyCardHTML (img desde image_path,
// con clase pz-hoy-thumb-img). OJO: la misma primera línea existe en
// pzHoyTiraDetalleHTML (21917, otra superficie, sin tocar en este lote).
const OLD_IMG = 'const img = (p && p.image_path)\n      ? `<img class="pz-hoy-thumb-img" src="${esc(mv(p.image_path, 640))}"';
t('B1: imgSrc presente: video → cover_path, resto → image_path',
  jsR.includes("const imgSrc = String((p && p.media_type) || '') === 'video'") &&
  jsR.includes("? String((p && p.cover_path) || '')") &&
  jsR.includes(": String((p && p.image_path) || '');"));
t('B2: el viejo `const img = (p && p.image_path)` de pzHoyCardHTML ya no existe',
  !jsR.includes(OLD_IMG));
t('B3: el <img> usa imgSrc (src + data-full), con onerror __imgFb intacto',
  jsR.includes('src="${esc(mv(imgSrc, 640))}" data-full="${esc(imgSrc)}" onerror="__imgFb(this)"'));
t('B4: sin póster no se rinde <img> (imgSrc vacío → img vacío)',
  jsR.includes('const img = imgSrc'));
t('B5: la rama o.hero sigue usando heroImg desde img (sin cambio)',
  jsR.includes("const heroImg = img ? img.replace('class=\"pz-hoy-thumb-img\"', 'class=\"pz-hoy-hero-img\"') : '';"));
t('B6: comentario de trazabilidad v905 ×1 en app.js',
  occ(jsR, /REEL-WEBSITE-NORMAL v905/g) === 1);

// ---------- C. Resto intacto ----------
t('C1: regla v902 .pz-hoy-hero-link (botón flex) intacta ×1 en base y release',
  occ(cssR, /\.pz-hoy-hero-link\{display:flex;align-items:center;justify-content:center;gap:8px;width:100%/g) === 1 &&
  occ(cssB, /\.pz-hoy-hero-link\{display:flex;align-items:center;justify-content:center;gap:8px;width:100%/g) === 1);
t('C2: v900 intacto: config ×1 y payment-method ×1 en server.js',
  occ(srvR, /\/api\/billing\/stripe\/config/g) === 1 &&
  occ(srvR, /\/api\/billing\/stripe\/payment-method/g) === 1);
t('C3: v899 intacto: min(170px,44vw) ×2, restos ×0, media query 100px ×1',
  occ(cssR, /min\(170px,44vw\)/g) === 2 &&
  occ(cssR, /min\(300px,76vw\)/g) === 0 &&
  occ(cssR, /@media\(min-width:761px\)\{\.hero-video\{width:100px\}\.pz-mg--heroV\{width:100px\}\}/g) === 1);
t('C4: v898 intacto: obFormHTML ×0, noDna ×5, frase ×1, o.hero literal ×1',
  occ(jsR, /obFormHTML/g) === 0 && occ(jsR, /noDna/g) === 5 &&
  occ(jsR, /Te armé el posteo de hoy/g) === 1 && occ(jsR, /o\.hero/g) === 1);
t('C5: CHUNK_V v890 ×1 línea en app.js',
  occ(jsR, /20261105-v890/g) === 1);
t('C6: pzHoyHoyHTML intacto (cabecera + hero:true)',
  jsR.includes("pzHoyCardHTML(p, { cartita: false, sinCuando: true, en, tz, prop: (o && o.prop) || null, hero: true })"));

// ---------- D. Estampado ----------
t('D1: BUILD v905 ×1 en server.js, v900 ×0',
  occ(srvR, /20261105-v905/g) === 1 && occ(srvR, /20261105-v900/g) === 0);
t('D2: app.js?v=618 ×1 en index ES, styles.css?v=20261243 ×1 ES + ×1 EN, EN sin app.js?v=',
  occ(idxR, /app\.js\?v=618/g) === 1 &&
  occ(idxR, /styles\.css\?v=20261243/g) === 1 &&
  occ(idxEnR, /styles\.css\?v=20261243/g) === 1 &&
  !idxEnR.includes('app.js?v='));
t('D3: styles.css 6226 líneas (6224 base-v907 + 2), app.js 31492 (31485 + 7)',
  nlines(path.join(REL, 'public/styles.css')) === 6226 &&
  nlines(path.join(REL, 'public/app.js')) === 31492);

// ---------- E. Medidas del render ----------
let m = null;
try { m = JSON.parse(read(path.join(S, 'render/measurements.json'))); } catch (e) { m = null; }
t('E1: measurements.json existe', !!m);
if (m) {
  t('E2: 390px idéntico antes/después (bloque 362, media 415)',
    m['antes-390'].blkW === 362 && m['despues-390'].blkW === 362 &&
    m['antes-390'].mediaH === 415 && m['despues-390'].mediaH === 415);
  t('E3: 1808px capado (antes 1112 → después 480, max-width 480px)',
    m['antes-1808'].blkW === 1112 && m['despues-1808'].blkW === 480 &&
    m['despues-1808'].blkMaxW === '480px');
  t('E4: 1808px centrado (margen izq == der)',
    m['despues-1808'].blkMarginL === m['despues-1808'].blkMarginR);
  t('E5: póster antes roto (naturalWidth 0) y después carga (1080)',
    m['antes-1808'].heroImgNW === 0 && m['despues-1808'].heroImgNW === 1080);
  t('E6: compacta después carga (naturalWidth 1080)',
    m['despues-1808'].compactImgNW === 1080);
  t('E7: badge ▶ Reel presente antes y después',
    m['antes-1808'].reelBadge === true && m['despues-1808'].reelBadge === true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
