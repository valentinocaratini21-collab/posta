#!/usr/bin/env node
// LOTE DISEÑO-FAVORITA (7/11) — mock v2 aprobado por Valentino 7/11 ~14:24
// («dale. asi si»): la pantalla «¿Cómo querés que salga tu producto?»
// con vista previa en vivo + 3 opciones con TRES FOTOS DISTINTAS del mismo
// rubro, diferencia MUY visible (Gigante = producto enorme en primer plano;
// En acción = producto en uso, con vida; Marca al frente = logo grande
// ENCIMA de la foto, nunca logo solo). NUNCA la misma foto recompuesta o
// recortada distinto en las tres (corrección Valentino 7/11 ~14:21: eso es
// el mismo error de antes). Paquete «1 de 4» con 4 fotos distintas, sin
// repetir ninguna de las 3 opciones; favorita con borde amarillo + tilde.
// Botón «Seguir con este estilo», «volver», copy en palabras del visitante
// sin «draft». Las fotos reales salen del estudio del negocio.
// Fix (lote onboarding v760, re-estampado desde v758): draftCardPhoto(dim,
// opt, oi) devuelve {src, desc, logo} desde el pool SIN USAR (pool menos
// las fotos ya elegidas en DR.picks): cada opción es una foto real distinta
// o null honesto (nunca el logo como si fuera el producto, nunca un recorte
// de la misma foto). Sin DRAFT_CROPS ni draftDedupePicks (eliminados: el
// desempate por recorte era el truco prohibido). La ronda foto tiene vista
// previa grande (draftFotoDefaultSel/draftFotoPreviewData) y botón de
// seguir; el paquete muestra puntos honestos mientras falta elegir (nunca
// «?»); cada posteo mostrado lleva su prompt (draftPromptFor).
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
  'function draftPoolUnused() {',
  'function draftFotoDefaultSel(',
  'function draftFotoPreviewData(',
];
function loadDraft(html, S, WEB, PREFILL, FL_E) {
  const parts = [];
  for (const sig of FNS) {
    const s = fnFrom(html, sig);
    if (!s) return null;
    parts.push(s);
  }
  for (const re of [/var DRAFT_DESC = \{[^;]+\};/, /var DRAFT_PREVIEW_DESC = \{[^;]+\};/, /var DRAFT_OPTS = \{[^;]+\};/]) {
    const m = html.match(re);
    if (!m) return null;
    parts.push(m[0]);
  }
  // draftCardPhoto lee DR.picks (pool sin usar): el ctx lo lleva siempre.
  const ctx = { S, WEB, PREFILL, FL_E, DR: { picks: [], champ: null } };
  vm.createContext(ctx);
  vm.runInContext(parts.join('\n'), ctx);
  return ctx;
}
function key(p) { return p.src || ''; }
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

// ---------- A) El pool: fotos reales, sin duplicados, sin logo ----------
for (const lang of [['ES', es], ['EN', en]]) {
  const ctx = loadDraft(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  ok('A1 ' + lang[0] + ' pool Portrait: estrella primero, luego productos y web, SIN logo', !!ctx && JSON.stringify(vm.runInContext('draftPhotoPool()', ctx)) === JSON.stringify([BOLSA, NANO, HAIR, TAZA, COLECCION]), ctx ? JSON.stringify(vm.runInContext('draftPhotoPool()', ctx)) : 'sin draftCardPhoto (prístino)');
  const ctxDup = loadDraft(lang[1], S_P, { photos: [BOLSA, TAZA] }, PREFILL_P, FL_P);
  ok('A2 ' + lang[0] + ' pool: sin duplicados aunque la web repita la foto del producto', !!ctxDup && vm.runInContext('draftPhotoPool()', ctxDup).length === 4, ctxDup ? JSON.stringify(vm.runInContext('draftPhotoPool()', ctxDup)) : 'sin draftCardPhoto (prístino)');
  const ctxTC = loadDraft(lang[1], S_T, WEB_T, PREFILL_T, FL_T);
  ok('A3 ' + lang[0] + ' pool Top Class: con solo el logo, el pool queda VACÍO (el logo no es foto de producto)', !!ctxTC && JSON.stringify(vm.runInContext('draftPhotoPool()', ctxTC)) === JSON.stringify([]), ctxTC ? JSON.stringify(vm.runInContext('draftPhotoPool()', ctxTC)) : 'sin draftCardPhoto (prístino)');
}

// ---------- B) Ronda 'foto' (mock v2): 3 FOTOS DISTINTAS, nunca recortes ----------
const FOTO_OPTS = [{ v: 'producto' }, { v: 'accion' }, { v: 'marca' }];
for (const lang of [['ES', es], ['EN', en]]) {
  const got = photos(lang[1], S_P, WEB_P, PREFILL_P, FL_P, 'foto', FOTO_OPTS);
  ok('B1 ' + lang[0] + ' ronda foto Portrait: 3 src distintos', !!got && distinct(got), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  ok('B2 ' + lang[0] + ' ronda foto: producto = foto estrella, sin recorte, con descripción', !!got && got[0].src === BOLSA && !('crop' in got[0]) && typeof got[0].desc === 'string' && got[0].desc.length > 0, got ? JSON.stringify(got[0]) : 'sin draftCardPhoto (prístino)');
  ok('B3 ' + lang[0] + ' ronda foto: acción = otra foto real (no la misma), sin recorte', !!got && got[1].src === NANO && !('crop' in got[1]), got ? JSON.stringify(got[1]) : 'sin draftCardPhoto (prístino)');
  ok('B4 ' + lang[0] + ' ronda foto: marca = tercera foto distinta + logo ENCIMA (logo en su campo, nunca como src)', !!got && got[2].src === HAIR && got[2].logo === LOGO && !('crop' in got[2]), got ? JSON.stringify(got[2]) : 'sin draftCardPhoto (prístino)');
  const gotTC = photos(lang[1], S_T, WEB_T, PREFILL_T, FL_T, 'foto', FOTO_OPTS);
  ok('B5 ' + lang[0] + ' ronda foto Top Class (sin fotos de producto): src null en las 3, marca con logo, sin recorte', !!gotTC && gotTC.every((p) => p.src === null && !('crop' in p)) && gotTC[2].logo === LOGO_TC, gotTC ? JSON.stringify(gotTC) : 'sin draftCardPhoto (prístino)');
  const gotL = photos(lang[1], S_L, WEB_L, PREFILL_L, FL_L, 'foto', FOTO_OPTS);
  ok('B6 ' + lang[0] + ' ronda foto Ladyee: 3 distintos, producto = Zahra', !!gotL && distinct(gotL) && gotL[0].src === 'https://x/zahra.jpg', gotL ? JSON.stringify(gotL) : 'sin draftCardPhoto (prístino)');
}

// ---------- C) Ronda 'tema': la imagen ilustra el tema (nit del mock 2) ----------
const TEMA_OPTS = [{ v: 'tip' }, { v: 'social' }, { v: 'promo' }];
for (const lang of [['ES', es], ['EN', en]]) {
  const got = photos(lang[1], S_P, WEB_P, PREFILL_P, FL_P, 'tema', TEMA_OPTS);
  ok('C1 ' + lang[0] + ' tema: 3 src distintos', !!got && distinct(got), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  const tipDesc = lang[0] === 'ES' ? 'Detalle de cerca' : 'Close-up detail';
  ok('C2 ' + lang[0] + ' tema tip (Consejos): detalle de cerca, no la foto genérica, sin recorte', !!got && got[0].desc === tipDesc && !('crop' in got[0]), got ? JSON.stringify(got[0]) : 'sin draftCardPhoto (prístino)');
}

// ---------- D) Otras dimensiones: 3 opciones distintas por ronda ----------
for (const lang of [['ES', es], ['EN', en]]) {
  for (const dim of ['protagonista', 'texto', 'enfoque']) {
    const opts = [{ v: 'a' }, { v: 'b' }, { v: 'c' }];
    const got = photos(lang[1], S_P, WEB_P, PREFILL_P, FL_P, dim, opts);
    ok('D1 ' + lang[0] + ' ronda ' + dim + ': 3 src distintos (BOLSA, NANO, HAIR)', !!got && distinct(got) && got[0].src === BOLSA && got[1].src === NANO && got[2].src === HAIR, got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  }
}

// ---------- E) La favorita: 4 picks de 4 rondas, 4 fotos distintas (pool sin usar) ----------
function champPicks(html, S, WEB, PREFILL, FL_E) {
  const ctx = loadDraft(html, S, WEB, PREFILL, FL_E);
  if (!ctx) return null;
  const rounds = [
    ['foto', { v: 'producto' }, 0],
    ['protagonista', { v: 'gente' }, 1],
    ['texto', { v: 'limpia' }, 0],
    ['tema', { v: 'tip' }, 0],
  ];
  const picks = [];
  for (const [dim, o, oi] of rounds) {
    const p = vm.runInContext('draftCardPhoto(' + JSON.stringify(dim) + ',' + JSON.stringify(o) + ',' + oi + ')', ctx);
    // Como hace la ronda real: el pick entra a DR.picks antes de la próxima.
    picks.push({ dim, v: o.v, l: o.l || o.v, foto: p.src, logo: p.logo || null, imgDesc: p.desc });
    vm.runInContext('DR.picks.push(' + JSON.stringify({ foto: p.src }) + ')', ctx);
  }
  return picks;
}
for (const lang of [['ES', es], ['EN', en]]) {
  const got = champPicks(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  ok('E1 ' + lang[0] + ' favorita Portrait: 4 picks → 4 src distintos (BOLSA, HAIR, NANO, TAZA)', !!got && distinct(got.map((p) => ({ src: p.foto }))) && got[0].foto === BOLSA && got[1].foto === HAIR && got[2].foto === NANO && got[3].foto === TAZA, got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  ok('E2 ' + lang[0] + ' favorita: foto y tema traen descripción; cada pick guarda imgDesc (string)', !!got && typeof got[0].imgDesc === 'string' && got[0].imgDesc.length > 0 && typeof got[3].imgDesc === 'string' && got[3].imgDesc.length > 0 && got.every((p) => typeof p.imgDesc === 'string'), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  const gotTC = champPicks(lang[1], S_T, WEB_T, PREFILL_T, FL_T);
  ok('E3 ' + lang[0] + ' favorita Top Class (sin fotos): todos los picks con foto null, sin recorte', !!gotTC && gotTC.every((p) => p.foto === null && !('crop' in p)), gotTC ? JSON.stringify(gotTC) : 'sin draftCardPhoto (prístino)');
}

// ---------- F) Regla del pool sin usar: lo elegido no se repite ----------
// (Reemplaza la vieja sección F de draftDedupePicks, eliminado: el desempate
// por recorte era el truco prohibido por Valentino 7/11 ~14:21.)
for (const lang of [['ES', es], ['EN', en]]) {
  const ctx = loadDraft(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  if (!ctx) { ok('F1 ' + lang[0] + ' pool sin usar: tras elegir BOLSA, tema/tip = NANO', false, 'sin draftCardPhoto (prístino)'); }
  else {
    vm.runInContext('DR.picks.push({foto: "' + BOLSA + '"})', ctx);
    const tip = vm.runInContext('draftCardPhoto("tema", {v:"tip"}, 0)', ctx);
    ok('F1 ' + lang[0] + ' pool sin usar: tras elegir BOLSA, tema/tip = NANO (no repite)', tip.src === NANO, JSON.stringify(tip));
    ok('F2 ' + lang[0] + ' pool sin usar: excluye lo elegido ([NANO, HAIR, TAZA, COLECCION])', JSON.stringify(vm.runInContext('draftPoolUnused()', ctx)) === JSON.stringify([NANO, HAIR, TAZA, COLECCION]), JSON.stringify(vm.runInContext('draftPoolUnused()', ctx)));
  }
  const ctx0 = loadDraft(lang[1], S_P, WEB_P, PREFILL_P, FL_P);
  ok('F3 ' + lang[0] + ' pool sin usar: sin picks, el pool sin usar es el pool entero (5)', !!ctx0 && JSON.stringify(vm.runInContext('draftPoolUnused()', ctx0)) === JSON.stringify([BOLSA, NANO, HAIR, TAZA, COLECCION]), ctx0 ? JSON.stringify(vm.runInContext('draftPoolUnused()', ctx0)) : 'sin draftPoolUnused (prístino)');
  // Una sola foto real: acción NO reutiliza la foto con otro recorte.
  const S1 = { ans: { q1: 'Café', q1mix: 'uno' }, products: [{ nombre: 'Café', foto: 'https://x/cafe.jpg' }] };
  const ctx1 = loadDraft(lang[1], S1, null, { photo: LOGO }, { productos: [{ nombre: 'Café' }] });
  if (!ctx1) { ok('F4 ' + lang[0] + ' una sola foto: acción = null (nunca la misma foto recortada)', false, 'sin draftCardPhoto (prístino)'); }
  else {
    const f1 = vm.runInContext('draftCardPhoto("foto", {v:"producto"}, 0)', ctx1);
    const f2 = vm.runInContext('draftCardPhoto("foto", {v:"accion"}, 1)', ctx1);
    const f3 = vm.runInContext('draftCardPhoto("foto", {v:"marca"}, 2)', ctx1);
    ok('F4 ' + lang[0] + ' una sola foto: producto = la foto, acción = null, marca = {src null, logo}', f1.src === 'https://x/cafe.jpg' && f2.src === null && f3.src === null && f3.logo === LOGO, JSON.stringify([f1, f2, f3]));
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
  ok('H1 ' + lang[0] + ' sin fotos: la tarjeta queda sin imagen (src null, logo null, sin recorte), nunca un bloque ni stock', !!ctx && got && got.src === null && got.logo === null && !('crop' in got), got ? JSON.stringify(got) : 'sin draftCardPhoto (prístino)');
  const got2 = ctx ? vm.runInContext('draftPhotoPool()', ctx) : null;
  ok('H2 ' + lang[0] + ' sin fotos: el pool queda vacío', !!ctx && Array.isArray(got2) && got2.length === 0, got2 ? JSON.stringify(got2) : 'sin draftCardPhoto (prístino)');
}

// ---------- I) Fuente: el render usa la foto del pick + chip + paridad ES/EN ----------
for (const lang of [['ES', es], ['EN', en]]) {
  const html = lang[1];
  ok('I1 ' + lang[0] + ' ronda foto: vista previa con draftFotoDefaultSel/draftFotoPreviewData + esc(card.src), sin recortes', /draftFotoDefaultSel\(dim, opts\)/.test(html) && /draftFotoPreviewData\(dim, opts\[sel\], sel\)/.test(html) && /esc\(card\.src\)/.test(html) && !/ph\.crop/.test(html) && !/DRAFT_CROPS/.test(html));
  ok('I2 ' + lang[0] + ' favorita: chip «✓ Tu favorita» + grid oc-champ + imgDesc + prompt por posteo', /oc-champ-chip/.test(html) && /class="oc-grid oc-champ"/.test(html) && /esc\(p\.imgDesc/.test(html) && /draftPromptFor\(p\)/.test(html) && !/esc\(p\.crop/.test(html));
  ok('I3 ' + lang[0] + ' favorita: NO llama a draftDedupePicks en ningún lado (truco prohibido)', !/draftDedupePicks/.test(html));
  ok('I4 ' + lang[0] + ' CSS: imagen de tarjeta 148px con position:relative + preview 260px + chip + media 900px', /oc-draft-img\{position:relative;display:block;height:148px/.test(html) && /oc-draft-img\.big\{height:260px/.test(html) && /oc-draft-chip\{/.test(html) && /oc-champ-chip\{display:none/.test(html) && /@media \(min-width:900px\)\{\.oc-grid\.oc-champ\{grid-template-columns:repeat\(4,1fr\)\}\}/.test(html));
  ok('I5 ' + lang[0] + ' ronda: encabezado «N de 4» (oc-draft-count); favorita: «4 de 4» (oc-draft-step)', /oc-draft-count/.test(html) && /oc-draft-step/.test(html) && /4 de 4<\/span>/.test(html));
}
function draftFnSrc(html, sig) { return fnFrom(html, sig); }
for (const sig of ['function draftCardPhoto(', 'function draftPhotoPool() {', 'function draftLogoPhoto() {', 'function draftPoolUnused() {', 'function draftFotoDefaultSel(', 'function draftFotoPreviewData(', 'function draftShowRound(', 'function draftShowChamp(']) {
  const a = draftFnSrc(es, sig), b = draftFnSrc(en, sig);
  ok('I6 paridad ES/EN: ' + sig.trim().slice(0, 30) + ' existe en ambas e idéntico', a !== null && a === b);
}

// ---------- J) Render real: el HTML que ve el usuario (DOM mínimo) ----------
function renderCtx(html, lang, S, WEB, PREFILL, FL_E) {
  const parts = [];
  for (const sig of [...FNS, 'function draftOptionsFor(', 'function draftPromptFor(', 'function draftMiniHTML() {', 'function draftShowRound(', 'function draftShowChamp(']) {
    const s = fnFrom(html, sig);
    if (!s) return null;
    parts.push(s);
  }
  for (const re of [/var DRAFT_DESC = \{[^;]+\};/, /var DRAFT_PREVIEW_DESC = \{[^;]+\};/, /var DRAFT_SETS = \{[^;]+\};/, /var DRAFT_TEMA = \{[^;]+\};/, /var DRAFT_Q = \{[^;]+\};/, /var DRAFT_OPTS = \{[^;]+\};/, /var DRAFT_KIND_L = \{[^;]+\};/, /var DRAFT_T = \{[^;]+\};/]) {
    const m = html.match(re);
    if (!m) return null;
    parts.push(m[0]);
  }
  const escSrc = fnFrom(html, 'function esc(');
  if (!escSrc) return null;
  parts.push(escSrc);
  const box = { innerHTML: '', querySelectorAll() { return []; } };
  const T = lang === 'ES' ? {
    back: 'Volver', draftNoPhoto: 'Sin foto de tu producto todavía', draftSlotPending: 'Falta elegir esta ronda',
    draftFotoSub: 'Tocá un estilo y mirá cómo queda. Lo que elijas, así sale tu producto en toda la semana.',
    draftFotoChoose: 'ELEGÍ UN ESTILO', draftPackSub: 'Elegí tu favorita: tocá la que más te guste y así aprendo qué posteos querés.',
    draftFotoGo: 'Seguir con este estilo', draftFotoFoot: 'Posty usa tu estilo en toda la semana.', draftPreviewAs: 'así se vería',
    promptFotoMarca: 'tu logo grande al centro, sobre tu foto de {prod}', promptPalette: 'con tu paleta {names}',
    promptToneVos: 'con tu tono cercano', promptToneUsted: 'con tu tono formal',
  } : {
    back: 'Back', draftNoPhoto: 'No photo of your product yet', draftSlotPending: 'Still to pick in this round',
    draftFotoSub: 'Tap a style and see how it looks. Whatever you pick, that is how your product comes out all week.',
    draftFotoChoose: 'PICK A STYLE', draftPackSub: 'Pick your favorite: tap the one you like most and I learn which posts you want.',
    draftFotoGo: 'Continue with this style', draftFotoFoot: 'Posty uses your style all week long.', draftPreviewAs: 'this is how it would look',
    promptFotoMarca: 'your logo big front and center, over your photo of {prod}', promptPalette: 'with your palette of {names}',
    promptToneVos: 'with your close tone', promptToneUsted: 'with your formal tone',
  };
  const ctx = {
    S, WEB, PREFILL, FL_E,
    DR: null, reduced: false, T,
    document: { getElementById() { return { addEventListener() {} }; }, documentElement: { lang: lang === 'ES' ? 'es' : 'en' } },
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
  const re = /<img src="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function countSub(html, sub) { return (html.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length; }
for (const lang of [['ES', es], ['EN', en]]) {
  const r = renderCtx(lang[1], lang[0], S_P, WEB_P, PREFILL_P, FL_P);
  if (!r) { ok('J1 ' + lang[0] + ' render ronda foto: preview + 3 tarjetas + logo', false, 'sin draftShowRound (prístino)'); }
  else {
    r.ctx.DR = { dims: ['foto', 'protagonista', 'texto', 'tema'], picks: [], champ: null };
    vm.runInContext('draftShowRound(0)', r.ctx);
    const imgs = imgsFrom(r.box.innerHTML);
    const chip = lang[0] === 'ES' ? '★ Gigante · así se vería' : '★ Huge · this is how it would look';
    ok('J1 ' + lang[0] + ' render ronda foto: 5 imgs (preview + 3 tarjetas + logo), 4 src distintos, BOLSA ×2', imgs.length === 5 && new Set(imgs).size === 4 && imgs.filter((s) => s === BOLSA).length === 2 && imgs.includes(LOGO), JSON.stringify(imgs));
    ok('J1b ' + lang[0] + ' render ronda foto: chip «' + chip + '» con la foto elegida', r.box.innerHTML.includes(chip), r.box.innerHTML.slice(0, 400));
    ok('J1c ' + lang[0] + ' render ronda foto: sin «?» en el paquete — pendientes con puntos honestos', !/oc-draft-slot">\?/.test(r.box.innerHTML) && /oc-slot-dots/.test(r.box.innerHTML), r.box.innerHTML.slice(0, 400));
    ok('J2 ' + lang[0] + ' render ronda foto: píldora «1 de 4» visible', /1 de 4<\/span>/.test(r.box.innerHTML), r.box.innerHTML.slice(0, 200));
    const picks = [
      ['foto', { v: 'producto' }, 0],
      ['protagonista', { v: 'gente' }, 1],
      ['texto', { v: 'limpia' }, 0],
      ['tema', { v: 'tip' }, 0],
    ].map(([dim, o, oi]) => {
      const p = vm.runInContext('draftCardPhoto(' + JSON.stringify(dim) + ',' + JSON.stringify(o) + ',' + oi + ')', r.ctx);
      vm.runInContext('DR.picks.push(' + JSON.stringify({ foto: p.src }) + ')', r.ctx);
      return { dim, v: o.v, l: o.v, foto: p.src, logo: p.logo || null, imgDesc: p.desc };
    });
    r.ctx.DR = { dims: ['foto', 'protagonista', 'texto', 'tema'], picks, champ: null };
    vm.runInContext('draftShowChamp()', r.ctx);
    const cimgs = imgsFrom(r.box.innerHTML);
    ok('J3 ' + lang[0] + ' render favorita: 8 imgs (4 minis + 4 tarjetas), 4 src distintos, sin logo', cimgs.length === 8 && new Set(cimgs).size === 4 && !cimgs.includes(LOGO), JSON.stringify(cimgs));
    ok('J3b ' + lang[0] + ' render favorita: al menos un posteo muestra su prompt', /oc-prompt/.test(r.box.innerHTML), r.box.innerHTML.slice(0, 400));
    ok('J4 ' + lang[0] + ' render favorita: chip «✓ Tu favorita» + grid 4 columnas + «4 de 4»', /oc-champ-chip/.test(r.box.innerHTML) && /oc-grid oc-champ/.test(r.box.innerHTML) && /4 de 4<\/span>/.test(r.box.innerHTML));
  }
  const rTC = renderCtx(lang[1], lang[0], S_T, WEB_T, PREFILL_T, FL_T);
  if (!rTC) { ok('J5 ' + lang[0] + ' render Top Class: sin fotos, estado honesto', false, 'sin draftShowRound (prístino)'); }
  else {
    rTC.ctx.DR = { dims: ['foto', 'protagonista', 'texto', 'tema'], picks: [], champ: null };
    vm.runInContext('draftShowRound(0)', rTC.ctx);
    const imgs = imgsFrom(rTC.box.innerHTML);
    const go = lang[0] === 'ES' ? 'Seguir con este estilo' : 'Continue with this style';
    ok('J5 ' + lang[0] + ' render Top Class: 0 imgs, 4× estado sin foto, logo NUNCA en el HTML, botón de seguir presente', imgs.length === 0 && countSub(rTC.box.innerHTML, 'oc-draft-nophoto') === 4 && !rTC.box.innerHTML.includes(LOGO_TC) && rTC.box.innerHTML.includes(go), 'imgs=' + JSON.stringify(imgs) + ' nophoto=' + countSub(rTC.box.innerHTML, 'oc-draft-nophoto'));
  }
}

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
