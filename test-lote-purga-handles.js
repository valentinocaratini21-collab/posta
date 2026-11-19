'use strict';
/* test-lote-purga-handles.js — LOTE PURGA-HANDLES (hermano de GALERIA-FUERA).
 * Los 4 negocios inventados (cafe.aurora · bustos.detailing · tiendacora ·
 * roca.propiedades + sus nombres) fuera de TODA superficie pública que queda:
 * comparador (demo -> Rosehip, real), semana de muestra (@ real o
 * en blanco, captions sin nombres), LP_PROFILES (-4) y /p/<slug> (-4 -> 404).
 * ENMIENDA MAPA-RUBROS (18/11): el comparador dejó de ser Tomoko (pastelería
 * queda solo en Constancia) y pasó a Rosehip Social Florist (@rosehipfloral,
 * fotos reales suyas); el demo dormido de cafetería pasó de @patisserietomoko
 * a @thecoffeebardc (The Coffee Bar, café real de Washington DC).
 * Uso: node test-lote-purga-handles.js [root]   (default: el dir del archivo)
 * Control: correrlo contra la base compuesta (HEAD + GALERIA-FUERA) debe
 * fallar en las aserciones de la purga y pasar la plomería. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let ok = 0, mal = 0;
const T = (cond, label) => { if (cond) { ok++; } else { mal++; console.log('  MAL:', label); } };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const HANDLES = ['cafe.aurora', 'bustos.detailing', 'tiendacora', 'roca.propiedades'];
const NAMES = ['Café Aurora', 'Bustos Detailing', 'Tienda Cora', 'Roca Propiedades'];
const PATTERNS = HANDLES.concat(NAMES, ['gt-tiendacora']);

// ---------- A. censo: handles + nombres = 0 en las superficies servidas
const SURFACES = ['public/app.js', 'public/en/index.html', 'public/index.html',
  'public/prueba.html', 'public/en-prueba.html', 'public/showcase-lp.js',
  'showcase-pages.js', 'server.js']
  .concat(fs.readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.js')).map((f) => 'public/' + f));
for (const f of SURFACES) {
  const s = read(f);
  for (const pat of PATTERNS) T(!s.includes(pat), `A: ${f} no contiene ${pat}`);
}
const appjs = read('public/app.js');
const en = read('public/en/index.html');

// ---------- B. archivos: backup servido fuera, set moda renombrado
T(!exists('public/app.js.orig'), 'B: public/app.js.orig eliminado');
for (let n = 1; n <= 9; n++) {
  T(exists(`public/g-moda-${n}.jpg`), `B: public/g-moda-${n}.jpg existe`);
  T(!exists(`public/gt-tiendacora-${n}.jpg`), `B: public/gt-tiendacora-${n}.jpg ya no existe`);
}

// ---------- C. showcase-pages: -4 slugs, el resto intacto
const { SHOWCASE_PAGES } = require(path.join(ROOT, 'showcase-pages.js'));
const keys = Object.keys(SHOWCASE_PAGES);
T(keys.length === 33, `C: SHOWCASE_PAGES tiene 33 entradas (tiene ${keys.length})`);
for (const slug of ['cafe-aurora', 'bustos', 'tiendacora', 'roca'])
  T(!(slug in SHOWCASE_PAGES), `C: slug ${slug} fuera del registro`);
for (const slug of ['nocta', 'elcorte', 'miogelato', 'cafe-martinez', 'flow-pilates', 'shade-tattoo'])
  T(slug in SHOWCASE_PAGES, `C: slug real ${slug} intacto`);
for (const [slug, pg] of Object.entries(SHOWCASE_PAGES))
  for (const img of pg.imgs)
    T(exists('public' + img), `C: imagen de /p/${slug} existe (${img})`);

// ---------- D. semana de muestra funcional (VM sobre el bloque real)
const i0 = appjs.indexOf('/* ---------- v177: la semana de tu rubro ---------- */');
const i1 = appjs.indexOf('/* 🧠 Análisis');
T(i0 > 0 && i1 > i0, 'D: bloque LP_WEEK localizable');
const ctx = { document: { querySelectorAll: () => [], getElementById: () => null }, window: {}, console };
vm.createContext(ctx);
const { LP_WEEK, LP_WEEK_CAPS, LP_WEEK_MIXKEY, lpWeekCards } =
  vm.runInContext(appjs.slice(i0, i1) + '\n;({ LP_WEEK, LP_WEEK_CAPS, LP_WEEK_MIXKEY, lpWeekCards });', ctx);
T(Object.keys(LP_WEEK).length === 17, `D: LP_WEEK conserva 17 claves (tiene ${Object.keys(LP_WEEK).length})`);
for (const k of ['mixto', 'cafeteria', 'barberia', 'moda', 'belleza', 'mascotas', 'fitness', 'detailing', 'inmobiliaria', 'boliche', 'odontologia', 'cerveceria', 'farmacia', 'libreria', 'verduleria', 'optica', 'veterinaria'])
  T(k in LP_WEEK, `D: LP_WEEK.${k} presente`);
const cafe = lpWeekCards('cafeteria');
T(cafe.length === 5 && cafe.every((c) => c.u === 'thecoffeebardc'), 'D: semana cafeteria sale con @thecoffeebardc (enmienda MAPA-RUBROS)');
T(cafe.every((c) => c.alt.includes('The Coffee Bar')), 'D: alt de cafeteria nombra a The Coffee Bar');
for (const k of ['moda', 'detailing', 'inmobiliaria']) {
  const cards = lpWeekCards(k);
  T(cards.length === 5 && cards.every((c) => c.u === ''), `D: semana ${k} con @ en blanco (5 tarjetas)`);
  T(cards.every((c) => !NAMES.some((n) => c.alt.includes(n))), `D: alt de ${k} sin nombres inventados`);
}
const mixto = lpWeekCards('mixto');
T(mixto.length === 5, 'D: mixto conserva 5 tarjetas');
T(mixto[0].u === 'thecoffeebardc', 'D: mixto[0] es thecoffeebardc');
T(mixto[1].u === '' && mixto[1].k === 'moda', 'D: mixto[1] sin @ y con k=moda (banco de captions)');
T(LP_WEEK_MIXKEY['thecoffeebardc'] === 'cafeteria', 'D: MIXKEY mapea thecoffeebardc->cafeteria');
T(!('cafe.aurora' in LP_WEEK_MIXKEY) && !('tiendacora' in LP_WEEK_MIXKEY), 'D: MIXKEY sin handles inventados');
const capsJson = JSON.stringify(LP_WEEK_CAPS);
for (const n of NAMES) T(!capsJson.includes(n), `D: banco de captions sin «${n}»`);
T((capsJson.match(/The Coffee Bar/g) || []).length === 2, 'D: captions de cafeteria nombran a The Coffee Bar x2');
T(!capsJson.includes('Patisserie Tomoko'), 'D: captions sin Patisserie Tomoko (MAPA-RUBROS)');
for (const k of Object.keys(LP_WEEK)) {
  for (const c of lpWeekCards(k)) T(exists('public/' + c.img), `D: img de semana ${k} existe (${c.img})`);
}
// renderer: el @ en blanco no deja un '@' colgado en el visor
T(appjs.includes("set('lpViewU', c.u ? '@' + c.u : '');"), 'D: lpViewRender protege el @ en blanco');
T(appjs.includes("(card.k || LP_WEEK_MIXKEY[card.u])"), 'D: lpWeekSet resuelve el banco por k o por @');

// ---------- E. LP_PROFILES: -4 entradas
const p0 = appjs.indexOf('const LP_PROFILES = [');
let depth = 0, p1 = -1;
for (let i = appjs.indexOf('[', p0); i < appjs.length; i++) {
  if (appjs[i] === '[') depth++;
  if (appjs[i] === ']' && --depth === 0) { p1 = i; break; }
}
const profiles = vm.runInNewContext('(' + appjs.slice(appjs.indexOf('[', p0), p1 + 1) + ')');
T(profiles.length === 31, `E: LP_PROFILES tiene 31 entradas (tiene ${profiles.length})`);
for (const h of HANDLES) T(!profiles.some((pr) => pr.user === h), `E: LP_PROFILES sin ${h}`);
for (const slug of ['cafe-aurora', 'bustos', 'tiendacora', 'roca'])
  T(!profiles.some((pr) => pr.link === slug || pr.slug === slug), `E: LP_PROFILES ya no imprime /p/${slug}`);
T(profiles.some((pr) => pr.user === 'nocta.club'), 'E: perfiles vecinos intactos (nocta.club)');

// ---------- F. comparador = Rosehip (ES + EN) — enmienda MAPA-RUBROS
function baBlock(s) {
  const a = s.indexOf('<div class="pz-beforeafter">');
  const b = s.indexOf('<div class="section lp-week-sec"', a);
  return s.slice(a, b);
}
const baES = baBlock(appjs), baEN = baBlock(en);
for (const [tag, ba] of [['ES', baES], ['EN', baEN]]) {
  T((ba.match(/rosehipfloral/g) || []).length === 2, `F: comparador ${tag} nombra rosehipfloral x2`);
  T(ba.includes('lp-rosehip-avatar.jpg'), `F: comparador ${tag} usa el avatar real de Rosehip`);
  T(ba.includes('lp-rosehip-1.jpg') && ba.includes('lp-rosehip-2.jpg') && ba.includes('lp-rosehip-3.jpg') && ba.includes('lp-rosehip-4.jpg'),
    `F: comparador ${tag} usa las fotos reales de Rosehip`);
  T(!ba.toLowerCase().includes('tomoko'), `F: comparador ${tag} sin Tomoko (MAPA-RUBROS)`);
  for (const bad of ['ig-cafe.jpg', 'g-tazas.jpg', 'g-latte.jpg', 'Gorriti', 'Palermo'])
    T(!ba.includes(bad), `F: comparador ${tag} sin rastro del demo viejo (${bad})`);
}
T(baES.includes('Florería · Williamsburg, Brooklyn'), 'F: comparador ES con la ficha real de Rosehip');
T(baEN.includes('Florist · Williamsburg, Brooklyn'), 'F: comparador EN con la ficha real de Rosehip');

// ---------- G. vecinos intactos
for (const pin of ['lp-patagonia-carrusel-1.jpg', 'mk-carr-head', 'lpWeekGrid', 'mk-feed-cap', 'mnPlanHTML', 'vd-kick', 'cmp-scene'])
  T(appjs.includes(pin), `G: vecino ES intacto (${pin})`);
for (const pin of ['lp-patagonia-carrusel-1.jpg', 'vd-kick', 'cmp-scene', 'patisserietomoko'])
  T(en.includes(pin), `G: vecino EN intacto (${pin})`);
T(!appjs.includes('lpWall') && !en.includes('lpWall'), 'G: la galeria de GALERIA-FUERA sigue fuera');

// ---------- H2. assets de Rosehip (enmienda MAPA-RUBROS)
for (const a of ['lp-rosehip-avatar.jpg', 'lp-rosehip-1.jpg', 'lp-rosehip-2.jpg', 'lp-rosehip-3.jpg', 'lp-rosehip-4.jpg'])
  T(exists('public/' + a), `H2: asset de Rosehip existe (${a})`);

// ---------- H. stamps preparados
T(read('public/index.html').includes('app.js?v=804'), 'H: index ES prepara app.js?v=804');

console.log(`PURGA-HANDLES: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
