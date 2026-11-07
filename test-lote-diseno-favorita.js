#!/usr/bin/env node
// LOTE DISEÑO-FAVORITA (7/11) — mock 2 aprobado por Valentino: la favorita
// (y la ronda foto, mock 1) con imágenes DISTINTAS por opción.
// Bug: draftCardProduct/draftPhotoFor daban UNA sola foto por producto y
// draftShowRound/draftShowChamp la reutilizaban en las 3 tarjetas de la
// ronda y en las 4 de la favorita — la diferencia vivía solo en texto
// de 17px/13px (confirmado en p17.jpg, l15.jpg, t18.jpg del video).
// Fix: draftCardPhoto(dim, opt, oi) — pool de fotos reales del negocio
// (productos del espejo + fotos de la web + foto de perfil) con recortes
// distintos por opción; la ronda 'foto' muestra su ángulo (producto
// grande / en acción / marca al frente); la ronda 'tema' ilustra el tema
// (consejos = detalle de cerca — nit del mock 2: la 4ª opción decía
// «Consejos» con una foto que no lo ilustraba); el pick guarda
// foto+crop+imgDesc y la favorita los renderiza + chip «✓ Tu favorita»;
// draftDedupePicks desempata picks de rondas distintas que caen en la
// misma (foto, recorte). Sin stock, sin genéricos: todo sale de lo estudiado.
// Uso: node test-lote-diseno-favorita.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const es = fs.readFileSync(path.join(DIR, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(DIR, 'public', 'en-prueba.html'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}
function fnFrom(html, sig) {
  const i = html.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}') { d--; if (d === 0) return html.slice(i, j + 1); }
  }
  return null;
}

const FNS = [
  'function draftStarName() {',
  'function draftPhotoFor(',
  'function draftCardProduct(',
  'function draftPhotoPool() {',
  'function draftLogoPhoto() {',
  'function draftCardPhoto(',
  'function draftDedupePicks(',
];
function loadDraft(html, S, WEB, PREFILL, FL_E) {
  const parts = [];
  for (const sig of FNS) {
    const s = fnFrom(html, sig);
    if (!s) return null;
    parts.push(s);
  }
  for (const re of [/var DRAFT_CROPS = \[[^\]]+\];/, /var DRAFT_CHAMP_CROPS = \[[^\]]+\];/, /var DRAFT_CROP_DESC = \{[^}]+\};/]) {
    const m = html.match(re);
    if (!m) return null;
    parts.push(m[0]);
  }
  const ctx = { S, WEB, PREFILL, FL_E };
  vm.createContext(ctx);
  vm.runInContext(parts.join('\n'), ctx);
  return ctx;
}
function key(p) { return (p.src || '') + '|' + (p.crop || ''); }
function distinct(list) { return new Set(list.map(key)).size === list.length; }

// ---------- Escenarios (fotos reales, como las del video) ----------
const BOLSA = 'https://x/bolsa-atliens.jpg';
const NANO = 'https://x/nano.jpg';
const HAIR = 'https://x/hair.jpg';
const TAZA = 'https://x/taza.jpg';
const COLECCION = 'https://x/coleccion.jpg';
const LOGO = 'https://x/logo-portrait.jpg';
const LOGO_TC = 'https://x/logo-topclass.jpg';

// Portrait: estrella + 3 productos con foto + 2 fotos de web + logo.
const S_P = { ans: { q1: 'ATLiens Coffee', q1mix: 'uno' }, products: [
  { nombre: 'ATLiens Coffee', foto: BOLSA },
  { nombre: 'Nano Challa', foto: NANO },
  { nombre: 'Hair Bender', foto: HAIR },
] };
const WEB_P = { photos: [TAZA, COLECCION] };
const PREFILL_P = { photo: LOGO };
const FL_P = { productos: [{ nombre: 'ATLiens Coffee' }, { nombre: 'Nano Challa' }] };
// Top Class: solo IG, sin web, sin productos con foto — solo el logo.
const S_T = { ans: {}, products: [] };
const WEB_T = null;
const PREFILL_T = { photo: LOGO_TC };
const FL_T = { productos: [] };
// Ladyee: estrella + 3 productos + 1 foto de web + logo.
const S_L = { ans: { q1: 'Zahra Dress', q1mix: 'uno' }, products: [
  { nombre: 'Zahra Dress', foto: 'https://x/zahra.jpg' },
  { nombre: 'Yvonne linen caftan', foto: 'https://x/yvonne.jpg' },
  { nombre: 'Eni Two Piece Set', foto: 'https://x/eni.jpg' },
] };
const WEB_L = { photos: ['https://x/zahra2.jpg'] };
const PREFILL_L = { photo: 'https://x/ladyee-logo.jpg' };
const FL_L = { productos: [{ nombre: 'Zahra Dress' }] };

function photos(html, S, WEB, PREFILL, FL_E, dim, opts) {
  const ctx = loadDraft(html, S, WEB, PREFILL, FL_E);
  if (!ctx) return null;
  return opts.map((o, oi) => vm.runInContext('draftCardPhoto(' + JSON.stringify(dim) + ',' + JSON.stringify(o) + ',' + oi + ')', ctx));
}

// ---------- A) El pool: fotos reales, sin duplicados, estrella primero ----------
for (const lang of [['ES', es], ['EN', en]]) {
  const ctx = loadDraft(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  ok('A1 ' + lang[0] + ' pool Portrait: estrella primero, luego productos, web y logo', !!ctx && JSON.stringify(vm.runInContext('draftPhotoPool()', ctx)) === JSON.stringify([BOLSA, NANO, HAIR, TAZA, COLECCION, LOGO]), ctx ? JSON.stringify(vm.runInContext('draftPhotoPool()', ctx)) : 'sin draftCardPhoto (prístino)');
  const ctxDup = loadDraft(lang[1], S_P, { photos: [BOLSA, TAZA] }, PREFILL_P, FL_P);
  ok('A2 ' + lang[0] + ' pool: sin duplicados aunque la web repita la foto del producto', !!ctxDup && vm.runInContext('draftPhotoPool()', ctxDup).length === 5, ctxDup ? JSON.stringify(vm.runInContext('draftPhotoPool()', ctxDup)) : 'sin draftCardPhoto (prístino)');
  const ctxTC = loadDraft(lang[1], S_T, WEB_T, PREFILL_T, FL_T);
  ok('A3 ' + lang[0] + ' pool Top Class: con solo el logo, el pool es [logo]', !!ctxTC && JSON.stringify(vm.runInContext('draftPhotoPool()', ctxTC)) === JSON.stringify([LOGO_TC]), ctxTC ? JSON.stringify(vm.runInContext('draftPhotoPool()', ctxTC)) : 'sin draftCardPhoto (prístino)');
}

// ---------- B) Ronda 'foto' (mock 1): 3 imágenes distintas, una por ángulo ----------
const FOTO_OPTS = [{ v: 'producto' }, { v: 'accion' }, { v: 'marca' }];
for (const lang of [['ES', es], ['EN', en]]) {
  const got = photos(lang[1], S_P, WEB_P, PREFILL_P, FL_P, 'foto', FOTO_OPTS);
  ok('B1 ' + lang[0] + ' ronda foto Portrait: 3 (foto, recorte) distintos', !!got && distinct(got), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  ok('B2 ' + lang[0] + ' ronda foto: producto = foto estrella en primer plano', !!got && got[0].src === BOLSA && got[0].crop === 'crop-close', got ? JSON.stringify(got[0]) : 'sin draftCardPhoto (prístino)');
  ok('B3 ' + lang[0] + ' ronda foto: acción = otra foto real (no la misma)', !!got && got[1].src === NANO && got[1].crop === 'crop-action', got ? JSON.stringify(got[1]) : 'sin draftCardPhoto (prístino)');
  ok('B4 ' + lang[0] + ' ronda foto: marca = el logo', !!got && got[2].src === LOGO && got[2].crop === 'crop-brand', got ? JSON.stringify(got[2]) : 'sin draftCardPhoto (prístino)');
  const gotTC = photos(lang[1], S_T, WEB_T, PREFILL_T, FL_T, 'foto', FOTO_OPTS);
  ok('B5 ' + lang[0] + ' ronda foto Top Class (1 sola foto): 3 recortes distintos del logo', !!gotTC && gotTC.every((p) => p.src === LOGO_TC) && new Set(gotTC.map((p) => p.crop)).size === 3, gotTC ? JSON.stringify(gotTC) : 'sin draftCardPhoto (prístino)');
  const gotL = photos(lang[1], S_L, WEB_L, PREFILL_L, FL_L, 'foto', FOTO_OPTS);
  ok('B6 ' + lang[0] + ' ronda foto Ladyee: 3 distintos, producto = Zahra', !!gotL && distinct(gotL) && gotL[0].src === 'https://x/zahra.jpg', gotL ? JSON.stringify(gotL) : 'sin draftCardPhoto (prístino)');
}

// ---------- C) Ronda 'tema': la imagen ilustra el tema (nit del mock 2) ----------
const TEMA_OPTS = [{ v: 'tip' }, { v: 'social' }, { v: 'promo' }];
for (const lang of [['ES', es], ['EN', en]]) {
  const got = photos(lang[1], S_P, WEB_P, PREFILL_P, FL_P, 'tema', TEMA_OPTS);
  ok('C1 ' + lang[0] + ' tema: 3 (foto, recorte) distintos', !!got && distinct(got), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  ok('C2 ' + lang[0] + ' tema tip (Consejos): detalle de cerca, no la foto genérica', !!got && got[0].crop === 'crop-close' && got[0].desc === 'Detalle de cerca', got ? JSON.stringify(got[0]) : 'sin draftCardPhoto (prístino)');
}

// ---------- D) Otras dimensiones: 3 opciones distintas por ronda ----------
for (const lang of [['ES', es], ['EN', en]]) {
  for (const dim of ['protagonista', 'texto', 'enfoque']) {
    const opts = [{ v: 'a' }, { v: 'b' }, { v: 'c' }];
    const got = photos(lang[1], S_P, WEB_P, PREFILL_P, FL_P, dim, opts);
    ok('D1 ' + lang[0] + ' ronda ' + dim + ': 3 (foto, recorte) distintos', !!got && distinct(got), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  }
}

// ---------- E) La favorita: 4 picks de 4 rondas, 4 imágenes distintas ----------
function champPicks(html, S, WEB, PREFILL, FL_E) {
  const ctx = loadDraft(html, S, WEB, PREFILL, FL_E);
  if (!ctx) return null;
  const picks = [
    ['foto', { v: 'producto' }, 0],
    ['protagonista', { v: 'gente' }, 1],
    ['texto', { v: 'limpia' }, 0],
    ['tema', { v: 'tip' }, 0],
  ].map(([dim, o, oi]) => vm.runInContext('draftCardPhoto(' + JSON.stringify(dim) + ',' + JSON.stringify(o) + ',' + oi + ')', ctx));
  // draftDedupePicks muta los picks que recibe (como hace draftShowChamp):
  const copies = picks.map((p) => ({ foto: p.src, crop: p.crop }));
  vm.runInContext('draftDedupePicks(__picks)', Object.assign(ctx, { __picks: copies }));
  return copies.map((c, i) => ({ src: c.foto, crop: c.crop, desc: picks[i].desc }));
}
for (const lang of [['ES', es], ['EN', en]]) {
  const got = champPicks(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  ok('E1 ' + lang[0] + ' favorita Portrait: 4 picks → 4 (foto, recorte) distintos tras el desempate', !!got && distinct(got), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  ok('E2 ' + lang[0] + ' favorita: cada pick trae descripción de lo que se ve (la <small>)', !!got && got.every((p) => typeof p.desc === 'string' && p.desc.length > 0), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  const gotTC = champPicks(lang[1], S_T, WEB_T, PREFILL_T, FL_T);
  ok('E3 ' + lang[0] + ' favorita Top Class (1 sola foto): 4 recortes distintos tras el desempate', !!gotTC && gotTC.every((p) => p.src === LOGO_TC) && new Set(gotTC.map((p) => p.crop)).size === 4, gotTC ? JSON.stringify(gotTC) : 'sin draftCardPhoto (prístino)');
}

// ---------- F) Desempate puro: colisiones conocidas se resuelven ----------
for (const lang of [['ES', es], ['EN', en]]) {
  const ctx = loadDraft(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  if (!ctx) { ok('F1 ' + lang[0] + ' desempate: foto/producto + tema/tip no colisionan', false, 'sin draftCardPhoto (prístino)'); }
  else {
    const picks = [{ foto: BOLSA, crop: 'crop-close' }, { foto: BOLSA, crop: 'crop-close' }, { foto: BOLSA, crop: 'crop-close' }];
    vm.runInContext('draftDedupePicks(__p)', Object.assign(ctx, { __p: picks }));
    ok('F1 ' + lang[0] + ' desempate: 3 picks idénticos → 3 recortes distintos', new Set(picks.map((p) => p.foto + '|' + p.crop)).size === 3, JSON.stringify(picks));
    const picks2 = [{ foto: BOLSA, crop: 'crop-close' }, { foto: NANO, crop: 'crop-b' }];
    vm.runInContext('draftDedupePicks(__p2)', Object.assign(ctx, { __p2: picks2 }));
    ok('F2 ' + lang[0] + ' desempate: sin colisión no toca nada (idempotente)', picks2[0].crop === 'crop-close' && picks2[1].crop === 'crop-b', JSON.stringify(picks2));
    vm.runInContext('draftDedupePicks(__p2)', ctx);
    ok('F3 ' + lang[0] + ' desempate: segunda pasada no cambia nada', picks2[0].crop === 'crop-close' && picks2[1].crop === 'crop-b', JSON.stringify(picks2));
  }
}

// ---------- G) Regresión: el PRODUCTO por ronda no cambia (F1/F2 de gate-fix) ----------
for (const lang of [['ES', es], ['EN', en]]) {
  const ctx = loadDraft(lang[1], { ans: {} }, WEB_P, PREFILL_P, { productos: [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }] });
  ok('G1 ' + lang[0] + ' regresión: sin estrella, las 3 tarjetas siguen mostrando el MISMO producto', !!ctx && [0, 1, 2].every((i) => vm.runInContext('draftCardProduct(0,' + i + ')', ctx) === 'Café de especialidad'), ctx ? 'ok' : 'sin draftCardProduct (prístino)');
  const ctx2 = loadDraft(lang[1], { ans: { q1: 'Medialunas', q1mix: 'uno' } }, WEB_P, PREFILL_P, { productos: [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }] });
  ok('G2 ' + lang[0] + ' regresión: con estrella, las 3 tarjetas muestran la estrella', !!ctx2 && [0, 1, 2].every((i) => vm.runInContext('draftCardProduct(0,' + i + ')', ctx2) === 'Medialunas'), ctx2 ? 'ok' : 'sin draftCardProduct (prístino)');
  const ctx3 = loadDraft(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  ok('G3 ' + lang[0] + ' regresión: draftPhotoFor(estrella) sigue dando la foto de la estrella', !!ctx3 && vm.runInContext('draftPhotoFor("ATLiens Coffee")', ctx3) === BOLSA, ctx3 ? String(vm.runInContext('draftPhotoFor("ATLiens Coffee")', ctx3)) : 'sin draftPhotoFor (prístino)');
}

// ---------- H) Fail-closed: sin fotos no se inventa ninguna ----------
for (const lang of [['ES', es], ['EN', en]]) {
  const ctx = loadDraft(lang[1], { ans: {}, products: [] }, null, null, { productos: [] });
  const got = ctx ? vm.runInContext('draftCardPhoto("foto", {v:"producto"}, 0)', ctx) : null;
  ok('H1 ' + lang[0] + ' sin fotos: la tarjeta queda sin imagen (null), nunca un bloque ni stock', !!ctx && got && got.src === null, got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  const got2 = ctx ? vm.runInContext('draftPhotoPool()', ctx) : null;
  ok('H2 ' + lang[0] + ' sin fotos: el pool queda vacío', !!ctx && Array.isArray(got2) && got2.length === 0, got2 ? JSON.stringify(got2) : 'sin draftCardPhoto (prístino)');
}

// ---------- I) Fuente: el render usa la foto del pick + chip + paridad ES/EN ----------
for (const lang of [['ES', es], ['EN', en]]) {
  const html = lang[1];
  ok('I1 ' + lang[0] + ' ronda: usa draftCardPhoto con su recorte', /draftCardPhoto\(dim, o, oi\)/.test(html) && /class="' \+ esc\(ph\.crop/.test(html));
  ok('I2 ' + lang[0] + ' favorita: chip «✓ Tu favorita» + recorte del pick + grid oc-champ', /oc-champ-chip/.test(html) && /class="oc-grid oc-champ"/.test(html) && /esc\(p\.crop/.test(html) && /esc\(p\.imgDesc/.test(html));
  ok('I3 ' + lang[0] + ' favorita: llama a draftDedupePicks antes de renderizar', /draftDedupePicks\(DR\.picks\)/.test(html));
  ok('I4 ' + lang[0] + ' CSS: imagen de tarjeta 148px + recortes + chip + media 900px', /oc-draft-card img\{[^}]*height:148px/.test(html) && /img\.crop-close/.test(html) && /img\.crop-action/.test(html) && /img\.crop-brand/.test(html) && /oc-champ-chip\{display:none/.test(html) && /@media \(min-width:900px\)\{\.oc-grid\.oc-champ\{grid-template-columns:repeat\(4,1fr\)\}\}/.test(html));
  ok('I5 ' + lang[0] + ' ronda: píldora «N de 4» en el encabezado', /oc-draft-step/.test(html) && /de 4<\/span>/.test(html));
}
function draftFnSrc(html, sig) { return fnFrom(html, sig); }
for (const sig of ['function draftCardPhoto(', 'function draftPhotoPool() {', 'function draftLogoPhoto() {', 'function draftDedupePicks(']) {
  ok('I6 paridad ES/EN: ' + sig.trim().slice(0, 30) + ' idéntico', draftFnSrc(es, sig) === draftFnSrc(en, sig));
}

// ---------- J) Render real: el HTML que ve el usuario (DOM mínimo) ----------
function renderCtx(html, S, WEB, PREFILL, FL_E) {
  const parts = [];
  for (const sig of [...FNS, 'function draftOptionsFor(', 'function draftMiniHTML() {', 'function draftShowRound(', 'function draftShowChamp(']) {
    const s = fnFrom(html, sig);
    if (!s) return null;
    parts.push(s);
  }
  for (const re of [/var DRAFT_CROPS = \[[^\]]+\];/, /var DRAFT_CHAMP_CROPS = \[[^\]]+\];/, /var DRAFT_CROP_DESC = \{[^}]+\};/, /var DRAFT_SETS = \{[^;]+\};/, /var DRAFT_TEMA = \{[^;]+\};/, /var DRAFT_Q = \{[^;]+\};/, /var DRAFT_OPTS = \{[^;]+\};/, /var DRAFT_KIND_L = \{[^;]+\};/, /var DRAFT_T = \{[^;]+\};/]) {
    const m = html.match(re);
    if (!m) return null;
    parts.push(m[0]);
  }
  const escSrc = fnFrom(html, 'function esc(');
  if (!escSrc) return null;
  parts.push(escSrc);
  const box = { innerHTML: '', querySelectorAll() { return []; } };
  const ctx = {
    S, WEB, PREFILL, FL_E,
    DR: null, reduced: false,
    T: { back: 'Volver' },
    document: { getElementById() { return { addEventListener() {} }; } },
    window: { scrollTo() {} },
    ocq() { return box; },
    stemHTML() { return ''; },
    show() {},
    opResumeSave() {},
    trk() {},
  };
  vm.createContext(ctx);
  vm.runInContext(parts.join('\n'), ctx);
  return { ctx, box };
}
function imgsFrom(html) {
  const out = [];
  const re = /<img src="([^"]*)"[^>]*class="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1] + '|' + m[2]);
  return out;
}
for (const lang of [['ES', es], ['EN', en]]) {
  const r = renderCtx(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  if (!r) { ok('J1 ' + lang[0] + ' render ronda foto: 3 tarjetas distintas', false, 'sin draftShowRound (prístino)'); }
  else {
    r.ctx.DR = { dims: ['foto', 'protagonista', 'texto', 'tema'], picks: [], champ: null };
    vm.runInContext('draftShowRound(0)', r.ctx);
    const imgs = imgsFrom(r.box.innerHTML);
    ok('J1 ' + lang[0] + ' render ronda foto: 3 tarjetas con (foto, recorte) distintos', new Set(imgs).size === 3, JSON.stringify(imgs));
    ok('J2 ' + lang[0] + ' render ronda foto: píldora «1 de 4» visible', /1 de 4<\/span>/.test(r.box.innerHTML), r.box.innerHTML.slice(0, 200));
    const picks = [
      ['foto', { v: 'producto' }, 0],
      ['protagonista', { v: 'gente' }, 1],
      ['texto', { v: 'limpia' }, 0],
      ['tema', { v: 'tip' }, 0],
    ].map(([dim, o, oi]) => vm.runInContext('draftCardPhoto(' + JSON.stringify(dim) + ',' + JSON.stringify(o) + ',' + oi + ')', r.ctx));
    r.ctx.DR = { dims: ['foto', 'protagonista', 'texto', 'tema'], picks: picks.map((p) => ({ dim: 'x', v: 'y', l: 'z', foto: p.src, crop: p.crop, imgDesc: p.desc })), champ: null };
    vm.runInContext('draftShowChamp()', r.ctx);
    const cimgs = imgsFrom(r.box.innerHTML);
    ok('J3 ' + lang[0] + ' render favorita: 4 tarjetas con (foto, recorte) distintos', new Set(cimgs).size === 4, JSON.stringify(cimgs));
    ok('J4 ' + lang[0] + ' render favorita: chip «✓ Tu favorita» + grid 4 columnas + «4 de 4»', /oc-champ-chip/.test(r.box.innerHTML) && /oc-grid oc-champ/.test(r.box.innerHTML) && /4 de 4<\/span>/.test(r.box.innerHTML));
  }
  const rTC = renderCtx(lang[1], S_T, WEB_T, PREFILL_T, FL_T);
  if (!rTC) { ok('J5 ' + lang[0] + ' render Top Class: 3 recortes distintos del logo', false, 'sin draftShowRound (prístino)'); }
  else {
    rTC.ctx.DR = { dims: ['foto', 'protagonista', 'texto', 'tema'], picks: [], champ: null };
    vm.runInContext('draftShowRound(0)', rTC.ctx);
    const imgs = imgsFrom(rTC.box.innerHTML);
    ok('J5 ' + lang[0] + ' render Top Class: 3 tarjetas, mismo logo, 3 recortes distintos', imgs.length === 3 && imgs.every((s) => s.startsWith(LOGO_TC + '|')) && new Set(imgs).size === 3, JSON.stringify(imgs));
  }
}

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
