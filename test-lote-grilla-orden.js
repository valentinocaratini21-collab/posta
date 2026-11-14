// test-lote-grilla-orden.js — LOTE GRILLA-ORDEN-Y-VERDAD (14/11 · base v1079 (doble re-base: SUBIR-HOY aterrizó como v1078 y FRENO-DÍA-MARCADO como v1079 durante la construcción; el lote se compuso sobre v1077 y se re-basó dos veces, con los árboles probados por hash git contra cada commit)):
// Dos errores de la grilla del perfil señalados por Valentino con captura:
//  (1) ORDEN: «cuanto más tarde se postea el posteo, más a la izquierda
//      tiene que aparecer» — la grilla se lee como el feed real: futuros por
//      fecha efectiva DESCENDENTE (el más lejano primero) y publicados
//      debajo en su orden real. La base fijaba la carta del próximo en
//      idx 0 y la dejaba a la izquierda de futuros más lejanos (la captura:
//      mañana · jueves · martes en vez de jueves · martes · mañana).
//  (2) VERDAD: un draft con fecha planeada NO se presenta como «Se postea
//      en X días» (un borrador no se publica solo): su rótulo dice
//      «Borrador · sería …» con su día tentativo. Los programados conservan
//      su «Se postea…» intacto.
// El arreglo vive SOLO en public/app.js (homeGridCompose: la carta entra al
// arreglo y el bloque no publicado se ordena por la clave del Lote 12;
// homeTileHTML: la línea de la celda de Subir elige el rótulo por estado,
// con el helper nuevo hfBorradorCapTxt). Sin tocar: el contrato de
// homeSnapshotGet (server.js solo cambia el BUILD), la publicación ni los
// estados en la base.
// Uso: node test-lote-grilla-orden.js (desde release/). Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
};
const cnt = (s, sub) => (s.split(sub).length - 1);

const TREE = __dirname;
const BASE = path.join(__dirname, '..', 'base');
const HAS_BASE = fs.existsSync(path.join(BASE, 'public', 'app.js'));
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const APPB = HAS_BASE ? fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') : '';
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');

// ---------- 1. Estampado provisional ----------
t('S1: server BUILD v1083 ×1 (definitivo del preparador; el provisional del builder era v1081)', cnt(SRV, "const BUILD_ID = '20261105-v1083';") === 1);
t('S2: index ES app.js?v=731 ×1', cnt(IDX, 'app.js?v=731') === 1);
t('S3: index EN sin app.js?v= y con styles?v=20261284', cnt(IDX_EN, 'app.js?v=') === 0 && cnt(IDX_EN, 'styles.css?v=20261284') === 1);
t('S4: styles.css byte-idéntico a la base (el lote no lo toca)', !HAS_BASE || fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8') === fs.readFileSync(path.join(BASE, 'public', 'styles.css'), 'utf8'));
t('S5: server.js difiere de la base SOLO en el BUILD', !HAS_BASE || (() => {
  const a = SRV.split('\n'), b = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8').split('\n');
  if (a.length !== b.length) return false;
  let diffs = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diffs++; if (!/BUILD_ID/.test(a[i]) || !/BUILD_ID/.test(b[i])) return false; }
  return diffs === 1;
})());
t('S6: index EN byte-idéntico a la base; index ES difiere solo en el ?v=', !HAS_BASE
  || (IDX_EN === fs.readFileSync(path.join(BASE, 'public', 'en', 'index.html'), 'utf8')
    && IDX.replace('app.js?v=731', 'app.js?v=730') === fs.readFileSync(path.join(BASE, 'public', 'index.html'), 'utf8')));

// ---------- 2. Estáticos del lote ----------
t('L1: marcador GRILLA-ORDEN-Y-VERDAD ×4 en app.js', cnt(APP, 'GRILLA-ORDEN-Y-VERDAD') === 4);
t('L2: hfBorradorCapTxt definida ×1 y llamada ×1 en homeTileHTML', cnt(APP, 'function hfBorradorCapTxt') === 1 && cnt(APP, 'hfBorradorCapTxt(p, t, phEn)') === 1);
t('L3: la carta ya no se splicea en idx 0 (sin splice(0, 0, { kind: \'oculta\')', !APP.includes("finalTiles.splice(0, 0, { kind: 'oculta'"));
t('L4: la carta entra con push y el orden usa hfFeedSortKey + hfCmpDescKey', APP.includes("finalTiles.push({ kind: 'oculta', post: nextPost") && APP.includes('return hfCmpDescKey(hfFeedSortKey(a), hfFeedSortKey(b));'));

// ---------- 3. VM: composición y rótulos (release y base) ----------
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  let i = src.indexOf('{', start), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(start, j);
}
function pcParseDateStub(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}
function makeSandbox(appSrc, lang) {
  const sb = {
    console,
    pcParseDate: pcParseDateStub,
    pcTz: () => 'America/New_York',
    schedDayKeyOf: (d, tz) => { try { return d.toLocaleDateString('en-CA', { timeZone: tz || 'America/New_York' }); } catch (e) { return ''; } },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    mv: (s) => s,
    slotHour: () => 19,
    pzRitualCuentaTxt: () => ({ faltan: '5 h 12 min' }),
    hfCoverState: () => ({ has: false, path: '', pos: 50 }),
    HOME_PIN_SVG: '', HOME_REEL_SVG: '', HOME_CAR_SVG: '',
    ME: { lang },
  };
  vm.createContext(sb);
  const fns = ['pcDayKeyShift', 'schedYmdToDate', 'hfIgShortcode', 'hfCmpDescKey', 'hfFeedSortKey',
    'pzWhenRelDay', 'hfChipText', 'hfWhenChip', 'hfPlanChip', 'hfTileChipParts', 'pzHoyHoraCorta',
    'pzHoyPillSalida', 'pzHoyCuentaSaleTxt', 'homeGridCompose', 'homeTileHTML', 'hfBorradorCapTxt'];
  for (const fn of fns) {
    const code = extractFn(appSrc, fn);
    if (code) vm.runInContext(code, sb);
  }
  return sb;
}
// Fechas relativas a HOY en Nueva York (19:00 UTC = 14:00/15:00 NY, mismo día).
function ymdNY(offset) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (tt) => parts.find((p) => p.type === tt).value;
  const d = new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day')) + offset * 86400000);
  return d.toISOString().slice(0, 10);
}
// Instante UTC cuya hora de pared en Nueva York es 19:00 del día ymd
// (así se guarda en producción: 19:00 EST = 00:00 UTC del día siguiente).
function iso19(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, 19, 0, 0);
  let guess = target + 5 * 3600000;
  for (let k = 0; k < 2; k++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(guess));
    const g = (tt) => +parts.find((p) => p.type === tt).value;
    const wall = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') === 24 ? 0 : g('hour'), g('minute'), g('second'));
    guess += (target - wall);
  }
  return new Date(guess).toISOString().slice(0, 19).replace('T', ' ');
}
const taken = (ymd) => Math.floor(Date.parse(iso19(ymd).replace(' ', 'T') + 'Z') / 1000);

const MANANA = { id: 582, status: 'scheduled', scheduled_at: iso19(ymdNY(1)), media_type: 'image', image_path: '/media/medialunas.jpg', caption: 'los que vuelven', source: 'week', pinned: 0, approval: 'pending', created_at: iso19(ymdNY(-2)) };
const MARTES = { id: 680, status: 'draft', scheduled_at: iso19(ymdNY(3)), media_type: 'image', image_path: '/media/medialunas.jpg', caption: 'copia subida', source: 'subir', pinned: 0, approval: 'pending', created_at: iso19(ymdNY(0)) };
const SUBSCHED = { id: 690, status: 'scheduled', scheduled_at: iso19(ymdNY(4)), media_type: 'image', image_path: '/media/subida.jpg', caption: 'subida programada', source: 'subir', pinned: 0, approval: 'pending', created_at: iso19(ymdNY(0)) };
const JUEVES = { id: 681, status: 'draft', scheduled_at: iso19(ymdNY(5)), media_type: 'video', image_path: '/media/torta.mp4', caption: 'video subido', source: 'subir', pinned: 0, approval: 'pending', created_at: iso19(ymdNY(0)) };
const PUB1 = { id: 649, status: 'published', published_at: iso19(ymdNY(-1)), scheduled_at: iso19(ymdNY(-1)), media_type: 'image', image_path: '/media/pub1.jpg', caption: 'ya salio', pinned: 0 };
const PUB2 = { id: 640, status: 'published', published_at: iso19(ymdNY(-4)), scheduled_at: iso19(ymdNY(-4)), media_type: 'image', image_path: '/media/pub2.jpg', caption: 'ya salio 2', pinned: 0 };
const REC1 = { img: '/media/ig1.jpg', type: 'image', taken_at: taken(ymdNY(-6)), shortcode: 'DIGVIEJO', pinned: false };
// upcoming como lo emite hfFeedUpcoming: por día ascendente.
const UPC = [{ p: MANANA, ymd: ymdNY(1) }, { p: MARTES, ymd: ymdNY(3) }, { p: SUBSCHED, ymd: ymdNY(4) }, { p: JUEVES, ymd: ymdNY(5) }];
const ALLP = [MANANA, MARTES, SUBSCHED, JUEVES, PUB1, PUB2];
const seqOf = (tiles) => tiles.map((x) => x.kind === 'ig' ? 'ig:' + x.shortcode : x.kind + ':' + (x.post && x.post.id)).join(',');

const sbR = makeSandbox(APP, 'es');
const sbB = HAS_BASE ? makeSandbox(APPB, 'es') : null;

// --- Escenario A: la captura del 14/11 ---
const tilesR = sbR.homeGridCompose({ upcoming: UPC, published: [PUB1, PUB2], recents: [REC1], all: ALLP });
t('A1 (release): orden de feed = jueves · subido programado · martes · mañana(carta) · publicados · IG',
  seqOf(tilesR) === 'post:681,post:690,post:680,oculta:582,post:649,post:640,ig:DIGVIEJO', seqOf(tilesR));
if (sbB) {
  const tilesB = sbB.homeGridCompose({ upcoming: UPC, published: [PUB1, PUB2], recents: [REC1], all: ALLP });
  t('A2 (control base): reproduce la captura = carta mañana PRIMERA, a la izquierda del jueves',
    seqOf(tilesB) === 'oculta:582,post:681,post:690,post:680,post:649,post:640,ig:DIGVIEJO', seqOf(tilesB));
}
const tileDe = (tiles, id) => tiles.find((x) => x.post && x.post.id === id);
const htmlJuevesR = sbR.homeTileHTML(tileDe(tilesR, 681), 2);
const htmlMartesR = sbR.homeTileHTML(tileDe(tilesR, 680), 1);
const htmlSubR = sbR.homeTileHTML(tileDe(tilesR, 690), 1);
const htmlCartaR = sbR.homeTileHTML(tileDe(tilesR, 582), 0);
t('A3 (release): el draft del jueves se rotula «Borrador · sería en 5 días · 19:00» y NUNCA «Se postea»',
  htmlJuevesR.includes('Borrador · sería en 5 días · 19:00') && !htmlJuevesR.includes('Se postea'), htmlJuevesR.slice(-400));
t('A4 (release): el draft del martes se rotula «Borrador · sería en 3 días · 19:00» y NUNCA «Se postea»',
  htmlMartesR.includes('Borrador · sería en 3 días · 19:00') && !htmlMartesR.includes('Se postea'), htmlMartesR.slice(-400));
t('A5 (release): el subido PROGRAMADO conserva su verdad «Se postea en 4 días · 19:00» (sin rótulo de borrador)',
  htmlSubR.includes('Se postea en 4 días · 19:00') && !htmlSubR.includes('Borrador · sería'), htmlSubR.slice(-400));
t('A6 (release): la carta del programado de mañana conserva «Se postea mañana» + la cuenta «sale en»',
  htmlCartaR.includes('Se postea mañana · 19:00') && htmlCartaR.includes('sale en'), htmlCartaR.slice(-400));
if (sbB) {
  const tilesB2 = sbB.homeGridCompose({ upcoming: UPC, published: [PUB1, PUB2], recents: [REC1], all: ALLP });
  const htmlJuevesB = sbB.homeTileHTML(tileDe(tilesB2, 681), 2);
  t('A7 (control base): el draft del jueves se presentaba como «Se postea en 5 días · 19:00» (la mentira de la captura)',
    htmlJuevesB.includes('Se postea en 5 días · 19:00'), htmlJuevesB.slice(-400));
}

// --- Escenario B: todo publicado (sin futuros) — orden idéntico al vigente ---
const inB = { upcoming: [], published: [PUB1, PUB2], recents: [REC1, { img: '/media/ig2.jpg', type: 'image', taken_at: taken(ymdNY(-3)), shortcode: 'DIGMEDIO', pinned: false }], all: [PUB1, PUB2] };
const seqBR = seqOf(sbR.homeGridCompose(inB));
t('B1 (release): sin futuros, publicados e IG por fecha descendente real', seqBR === 'post:649,ig:DIGMEDIO,post:640,ig:DIGVIEJO', seqBR);
if (sbB) t('B2 (control): la secuencia sin futuros es IDÉNTICA a la base', seqOf(sbB.homeGridCompose(inB)) === seqBR);

// --- Escenario C: un solo futuro (el caso común) — la carta sigue primera ---
const inC = { upcoming: [{ p: MANANA, ymd: ymdNY(1) }], published: [PUB1, PUB2], recents: [], all: [MANANA, PUB1, PUB2] };
const seqCR = seqOf(sbR.homeGridCompose(inC));
t('C1 (release): con un solo futuro, la carta sigue en idx 0 como hoy', seqCR === 'oculta:582,post:649,post:640', seqCR);
if (sbB) t('C2 (control): la secuencia con un solo futuro es IDÉNTICA a la base', seqOf(sbB.homeGridCompose(inC)) === seqCR);

// --- Escenario D: helper de borrador, ramas y EN ---
const capManana = sbR.hfBorradorCapTxt(MANANA_AS_DRAFT(), null, false);
function MANANA_AS_DRAFT() { return Object.assign({}, MANANA, { status: 'draft' }); }
t('D1: draft con salida mañana → «Borrador · sería mañana · 19:00»', capManana === 'Borrador · sería mañana · 19:00', capManana);
const sbEn = makeSandbox(APP, 'en');
const capEn = sbEn.hfBorradorCapTxt(MANANA_AS_DRAFT(), null, true);
t('D2: EN → «Draft · would be tomorrow · 07:00 PM»', capEn === 'Draft · would be tomorrow · 07:00 PM', capEn);
const ymdD = ymdNY(2);
const wdEsperado = new Date(ymdD + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' }).replace(/\./g, '').toLowerCase();
const capYmd = sbR.hfBorradorCapTxt({ status: 'draft', scheduled_at: null }, { day: ymdD }, false);
t('D3: draft sin scheduled_at, con día del plan → «Borrador · sería el <día>»', capYmd === 'Borrador · sería el ' + wdEsperado, capYmd);
t('D4: draft sin ninguna fecha → solo «Borrador» (nunca una fecha inventada)', sbR.hfBorradorCapTxt({ status: 'draft' }, {}, false) === 'Borrador');
t('D5: el helper no existe en la base (control)', !HAS_BASE || typeof sbB.hfBorradorCapTxt === 'undefined');

console.log('\nTOTAL: ' + pass + ' ok · ' + fail + ' mal');
process.exit(fail ? 1 : 0);
