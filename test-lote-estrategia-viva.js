/* Suite LOTE ESTRATEGIA-VIVA — la sección #crecimiento pasa del cuerpo navy
   con tres cuerpos pre-renderizados a la tarjeta viva del mock aprobado
   (18/11 + corrección de fondo de Valentino: mismo fondo que las demás =
   plaid claro de la línea; la sección deja el navy).
   Uso: node test-lote-estrategia-viva.js [root]   (root = carpeta con public/;
   default: ./tree del scratch. Control: ./base-pristina debe fallar.)
   ENMIENDA MAPA-RUBROS (18/11, ajuste 21:58): el switcher Birds/Tomoko/
   Scorpion pasa a Sotto Sotto (restaurante) + A Cappella Books (librería)
   + All Life is Yoga (yoga) — un rubro por sección, ningún tattoo, solo
   negocios reales. Big Top salió: su trío es el ejemplo de la puerta. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = process.argv[2] || path.join(__dirname, 'tree');
const PUB = path.join(ROOT, 'public');
let ok = 0, mal = 0;
function chk(cond, label) { if (cond) { ok++; } else { mal++; console.log('  MAL:', label); } }
function read(p) { return fs.readFileSync(path.join(PUB, p), 'utf8'); }
function span(s, a, b) { const i = s.indexOf(a); if (i < 0) return ''; const j = s.indexOf(b, i); return j < 0 ? s.slice(i) : s.slice(i, j); }
function count(s, sub) { return s.split(sub).length - 1; }

const app = read('app.js');
const en = read('en/index.html');
const idx = read('index.html');

/* ---------- sintaxis ---------- */
try { new vm.Script(app); chk(true, 'app.js parsea'); } catch (e) { chk(false, 'app.js parsea: ' + e.message); }
/* RE-PIN DE LIBERACIÓN (25d65950): la extracción original (marcador → primer
   '})();') quedó invalidada por la deriva del HEAD — ATIENDE/VOZ aterrizaron
   su wiring dentro del mismo bloque <script> final, así que el primer
   '})();' ya no cierra el wiring de esta sección. Se extrae el bloque
   <script> completo que contiene el marcador: misma intención del pin
   (el wiring EN es JS válido), robusto al layout vigente. */
const enMarker = en.indexOf("var esCardEl = q('#crecimiento .es-card');");
const enBlockStart = en.lastIndexOf('<script>', enMarker);
const enBlockEnd = en.indexOf('</script>', enMarker);
const enScript = (enMarker >= 0 && enBlockStart >= 0 && enBlockEnd > enMarker) ? en.slice(enBlockStart + 8, enBlockEnd) : '';
try { new vm.Script(enScript); chk(true, 'script EN (wiring) parsea'); } catch (e) { chk(false, 'script EN (wiring) parsea: ' + e.message); }

/* ---------- ES: la sección ---------- */
const sec = span(app, 'function lpCrecimientoHTML()', 'function lpAtiendeHTML()');
chk(sec.length > 0, 'ES: lpCrecimientoHTML existe');
chk(sec.includes('<div class="section cap-sec" id="crecimiento">'), 'ES: sección clara (cap-sec sin navy)');
chk(!sec.includes('cap-sec navy'), 'ES: la sección ya no es navy');
chk(!sec.includes('radial-gradient'), 'ES: sin fondo propio (vive el plaid de la línea)');
chk(sec.includes('es-invite') && sec.includes('Tocá un negocio y mirá la suya.'), 'ES: invite del mock presente');
chk(count(sec, 'class="es-chip') === 3, 'ES: 3 chips de negocio');
chk(sec.includes('data-esbiz="0"') && sec.includes('data-esbiz="1"') && sec.includes('data-esbiz="2"'), 'ES: chips data-esbiz 0/1/2');
chk(sec.includes('class="es-chip on" data-esbiz="0"'), 'ES: chip Sotto activo al inicio');
chk(sec.includes('class="es-card" style="--cbg:#F6F0E4'), 'ES: tarjeta con la piel de Sotto inline');
chk(sec.includes('id="esName">Estrategia de Sotto Sotto'), 'ES: nombre Sotto renderizado');
chk(sec.includes('id="esSub">Restaurante italiano · Inman Park, Atlanta'), 'ES: sub Sotto completo');
chk(sec.includes('id="esHeroImg" src="lp-es-sotto-hero.jpg"'), 'ES: hero Sotto');
chk(sec.includes('SU ESTRELLA') && sec.includes('id="esStarName">Tortelli di Michelangelo'), 'ES: estrella diseñada en el hero');
chk(sec.includes('id="esStarTag">Sotto Sotto · La estrella de la casa'), 'ES: tag de la estrella');
chk(sec.includes('El tortelli es el plato que la gente viene a buscar'), 'ES: fundamento Sotto');
chk(sec.includes('<span>Su semana</span><em>1 posteo por día · 19:00</em>'), 'ES: rótulo de la semana');
const slots = sec.match(/<div class="es-slot/g) || [];
chk(slots.length === 7, 'ES: 7 slots renderizados (encontrados ' + slots.length + ')');
chk(sec.includes('<div class="es-slot star"><img loading="lazy" src="lp-es-sotto-strozzapreti.jpg"'), 'ES: slot 1 = estrella con su foto');
const fmtSeq = ['The Dish', 'Handmade', 'The Table', 'The Dish', 'The Dish', 'The Table', 'The Sweet Finish'];
let pos = -1, seqOk = true;
for (const f of fmtSeq) { const n = sec.indexOf('<span class="es-fmt">' + f + '</span>', pos + 1); if (n < 0) { seqOk = false; break; } pos = n; }
chk(seqOk, 'ES: secuencia de formatos de la semana de Sotto (su sistema real)');
chk(count(sec, 'class="es-mk"') === 3, 'ES: 3 marcadores de formato (2 carruseles + 1 reel)');
chk(sec.includes('id="esRitmo">1 por día · 2 carruseles por semana'), 'ES: ritmo en la tira');
chk(sec.includes('id="esAds">Tu zona · cenas y sobremesas'), 'ES: público de Ads en la tira');
chk(sec.includes('id="esPal"><i style="background:#F6F0E4"></i><i style="background:#6B7248"></i><i style="background:#A8B09A"></i><i style="background:#8A6B42"></i><i style="background:#2B2118"></i>'), 'ES: paleta de Sotto en la tira');
chk(sec.includes('<p class="cap-note">Cada negocio tiene la suya: sale de su estudio, no de una plantilla.</p>'), 'ES: nota al pie de la tarjeta');
chk(sec.includes('<a class="cap-cta" href="/prueba">Probá gratis 3 días →</a>'), 'ES: CTA de producción');
chk(!sec.includes('strat-body') && !sec.includes('strat-row') && !sec.includes('data-strat'), 'ES: cuerpos viejos fuera de la sección');
chk(!sec.includes('lp-birds-estrella.jpg') && !sec.includes('lp-tomoko-hojicha-det.jpg') && !sec.includes('lp-scorpion-estrella.jpg'), 'ES: fotos viejas de la sección fuera');
chk(!app.includes('Scorpion') && !app.includes('lp-es-scorp') && !app.includes('lp-es-birds') && !app.includes('lp-es-tomoko') && !en.includes('Scorpion'), 'MAPA-RUBROS: ni tattoo, ni Tomoko, ni Birds en todo el lote');

/* ---------- ES: wiring + datos + CSS ---------- */
chk(app.includes('var ES_BIZ = ['), 'ES: datos ES_BIZ presentes');
chk(app.includes('var esRender = function'), 'ES: render de la tarjeta presente');
chk(!app.includes('swBodies') && !app.includes("qa('.strat-chip')"), 'ES: wiring viejo eliminado');
chk(app.includes("'--cbg': '#F3EAD8'") && app.includes('Signed First Editions Club'), 'ES: datos A Cappella (piel + estrella)');
chk(app.includes("'--cbg': '#EFE7D8'") && app.includes('Great Wall Yoga'), 'ES: datos Yoga (piel + estrella)');
chk(app.includes('#crecimiento .es-card{'), 'ES: CSS .es-card en el bloque de la landing');
chk(app.includes('@keyframes es-rise'), 'ES: animación de re-barajado presente');
chk(app.includes('background:rgba(254,193,77,.25)'), 'ES: chip activo en vidrio amarillo (línea clara)');

const EXPECTED = {
  'lp-es-sotto-hero.jpg': '67533c44a5e1335ec85a1c4c7769d9ca', 'lp-es-sotto-strozzapreti.jpg': '3ad08f43a30c6dfa09dad0abad5a0cb5',
  'lp-es-sotto-tagliatelle.jpg': 'd97237d907c9f8626ddce79f80c7e1d7', 'lp-es-sotto-sala.jpg': '23207d1e633aaac497ced11009a6232f',
  'lp-es-sotto-costoletta.jpg': '87019483e63cb1a6beb028fa48d992d5', 'lp-es-sotto-caprese.jpg': 'f85f251a43d355520cdcb2ef63eef702',
  'lp-es-sotto-mesa.jpg': '2fe1d0db43a5a093085046f311d890bf', 'lp-es-sotto-zuppa.jpg': 'a6e82f0552be0dde95e7eb9d8de3f304',
  'lp-es-cappella-hero.jpg': 'f4fb1f4a5be56f19b290e2e39751cc84', 'lp-es-cappella-firmados.jpg': 'de9a8db0af1a407f65502368616e7e07',
  'lp-es-cappella-pasillo.jpg': '88592a718f53b33bd40358054279c15a', 'lp-es-cappella-vidriera.jpg': '782124e05b18a3fe2f4d1a5e4c667627',
  'lp-es-cappella-llegados.jpg': 'e03469915908fe6a9f9089726a66ed70', 'lp-es-cappella-rincon.jpg': '46079e7d7389d14b45397f8327ce5732',
  'lp-es-cappella-fachada.jpg': '083f0aad98cd94c33631a73192d012d3', 'lp-es-cappella-elegidos.jpg': 'cd0f88a693e5c4da14829f5fbcb7942c',
  'lp-es-yoga-hero.jpg': '8e5c205ff49ba3e8aece6d15dfb45e7f', 'lp-es-yoga-pared.jpg': '1485ab46e485df62b7df4e605dde931f',
  'lp-es-yoga-clase.jpg': '86f5ee5582614a9b84cc11a4dd70ac0c', 'lp-es-yoga-respiro.jpg': '3bf7ff777635a896a7d3dd06e2a7828b',
  'lp-es-yoga-practica.jpg': '5a1a47f9b58647bd1b93a65e888f7e27', 'lp-es-yoga-pared2.jpg': '84f9f141255f3cf302c8e398c25717e2',
  'lp-es-yoga-descanso.jpg': 'ba18f5e0908ab59e735502af24fe20ef', 'lp-es-yoga-cierre.jpg': '42f7fccc6cddeb39fb00d06aad375fbb'
};
const names = Object.keys(EXPECTED);
const referenced = new Set();
for (const src of [sec, app, en]) { const m = src.match(/lp-es-[a-z0-9-]+\.jpg/g); if (m) m.forEach(x => referenced.add(x)); }
chk(names.every(n => referenced.has(n)), 'ES+EN: las 24 imágenes están referenciadas');
let assetsOk = true;
for (const n of names) {
  const p = path.join(PUB, n);
  if (!fs.existsSync(p)) { assetsOk = false; console.log('  MAL: falta asset', n); break; }
  const h = crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
  if (h !== EXPECTED[n]) { assetsOk = false; console.log('  MAL: md5 distinto en', n); break; }
}
chk(assetsOk, 'assets: las 24 imágenes reales de los 3 negocios (md5)');

/* ---------- stamps ---------- */
chk(idx.includes('app.js?v=802') && !idx.includes('app.js?v=801'), 'stamps: index ES en app.js?v=790');

/* ---------- EN: espejo ---------- */
const esec = span(en, '<div class="section cap-sec" id="crecimiento">', '<div class="section" id="voz">');
chk(esec.length > 0, 'EN: sección clara presente');
chk(!en.includes('cap-sec navy" id="crecimiento"'), 'EN: la sección ya no es navy');
chk(esec.includes('Tap a business and see theirs.'), 'EN: invite');
chk(esec.includes('id="esName">Strategy of Sotto Sotto'), 'EN: nombre Sotto');
chk(esec.includes('id="esSub">Italian restaurant · Inman Park, Atlanta'), 'EN: sub Sotto');
chk(esec.includes('id="esHeroImg" src="/lp-es-sotto-hero.jpg"'), 'EN: hero con ruta raíz-relativa');
chk(!esec.includes('src="lp-es-'), 'EN: ninguna imagen de la sección con ruta relativa');
chk(esec.includes('ITS STAR') && esec.includes('id="esStarName">Tortelli di Michelangelo'), 'EN: estrella en el hero');
chk(esec.includes('The tortelli is the dish people come looking for'), 'EN: fundamento Sotto');
chk(esec.includes('<span>Its week</span><em>1 post a day · 19:00</em>'), 'EN: rótulo de la semana');
chk((esec.match(/<div class="es-slot/g) || []).length === 7, 'EN: 7 slots renderizados');
chk(esec.includes('id="esRitmo">1 a day · 2 carousels a week'), 'EN: ritmo');
chk(esec.includes('id="esAds">Your area · dinners and long evenings'), 'EN: público de Ads');
chk(esec.includes('Every business has its own: it comes from its study, not from a template.'), 'EN: nota al pie');
chk(!esec.includes('strat-body') && !esec.includes('strat-row') && !esec.includes('data-strat'), 'EN: cuerpos viejos fuera de la sección');
chk(en.includes('var ES_BIZ = [') && en.includes('Signed First Editions Club'), 'EN: datos del switcher (A Cappella)');
chk(en.includes('picked by the staff: it opens the week'), 'EN: fundamento A Cappella');
chk(!en.includes('swBodies') && !en.includes("qa('.strat-chip')"), 'EN: wiring viejo eliminado');
chk(en.includes('#crecimiento .es-card{'), 'EN: CSS .es-card presente');

console.log('LOTE ESTRATEGIA-VIVA · root=' + ROOT + ' · ' + ok + ' ok · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
