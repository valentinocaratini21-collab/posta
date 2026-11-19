/* LOTE REORDEN-PRINCIPIO — suite propia.
   Pinea: (1) el orden nuevo de secciones ES (assembly de landingView en
   public/app.js) y EN (public/en/index.html estático): héroe → #equipo →
   tira semanal → #como-funciona (Producto/Mañana/Vender) → Constancia →
   Atiende → Estrategia → Semana → Voz → Ads → Subir → ejemplos →
   #planes → #prueba → Progreso → FAQ → lp-final → footer;
   (2) #equipo DIRECTAMENTE tras el héroe (es la primera sección);
   (3) el sizing GRANDE de #equipo (columna de foto 480px, wrap 1240px,
   iconos 40px, nombres 15px, escena móvil 520px) en ambos archivos;
   (4) cada sección exactamente una vez y las anclas del nav resuelven.
   La base compuesta (HEAD 268aea21 + EQUIPO-VIVO + SEMANA-VIVA +
   PROGRESO-VIVO) NO trae #atiende en EN (hueco preexistente de la base):
   si aparece, la suite exige que caiga entre Constancia y Estrategia. */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const appjs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const en = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');

let ok = 0, mal = 0;
function pin(cond, label) {
  if (cond) { ok++; }
  else { mal++; console.log('  ✗', label); }
}
function seqOk(positions, label) {
  const vals = positions.map(p => p[1]);
  pin(vals.every(v => v >= 0), label + ': todas las marcas presentes');
  pin(vals.every((v, i) => i === 0 || v > vals[i - 1]), label + ': secuencia estrictamente creciente');
}

/* ---------- ES: assembly de landingView ---------- */
const esLines = appjs.split('\n');
const lvStart = esLines.findIndex(l => l.includes('function landingView'));
pin(lvStart >= 0, 'ES: landingView existe');
const esRegion = esLines.slice(lvStart, lvStart + 2900);
function esLine(needle) {
  const i = esRegion.findIndex(l => l.includes(needle));
  return i < 0 ? -1 : i;
}
const ES_MARKS = [
  ['hero', '<div class="hero">'],
  ['equipo', 'id="equipo"'],
  ['scrolly', '<div class="wd-scrolly">'],
  ['como-funciona', 'id="como-funciona"'],
  ['ideas/constancia', '${lpIdeasHTML()}'],
  ['atiende', '${lpAtiendeHTML()}'],
  ['crecimiento/estrategia', '${lpCrecimientoHTML()}'],
  ['semana', '${lpSemanaHTML()}'],
  ['voz', '${lpVozHTML()}'],
  ['ads', '${lpAdsHTML()}'],
  ['subir', '${lpSubirHTML()}'],
  ['ejemplos', 'id="ejemplos"'],
  ['planes', 'id="planes"'],
  ['prueba', 'id="prueba"'],
  ['progreso', '${lpProgresoHTML()}'],
  ['faq', 'id="faq"'],
  ['lp-final', '<div class="lp-final">'],
  ['footer', 'class="footer"'],
];
seqOk(ES_MARKS.map(([n, m]) => [n, esLine(m)]), 'ES orden');

/* #equipo es la PRIMERA sección tras el héroe: entre el fin del héroe y
   #equipo no hay ninguna otra sección, y la primera línea con
   class="section tras el héroe es la de #equipo. */
const heroLine = esLine('<div class="hero">');
const equipoLine = esLine('id="equipo"');
const firstSectionAfterHero = esRegion.findIndex((l, i) => i > heroLine && l.includes('class="section'));
pin(firstSectionAfterHero === equipoLine, 'ES: #equipo es la primera sección tras el héroe');

/* cada sección del assembly, exactamente una vez en la región */
for (const id of ['equipo', 'como-funciona', 'ejemplos', 'prueba', 'planes', 'faq']) {
  const n = esRegion.filter(l => l.includes('id="' + id + '"')).length;
  pin(n === 1, 'ES: id="' + id + '" ×1 en el assembly (hay ' + n + ')');
}
pin(esRegion.filter(l => l.includes('<div class="lp-final">')).length === 1, 'ES: .lp-final ×1');
pin(esRegion.filter(l => l.includes('${lpSemanaHTML()}')).length === 1, 'ES: inserto Semana ×1');
pin(esRegion.filter(l => l.includes('${lpProgresoHTML()}')).length === 1, 'ES: inserto Progreso ×1');

/* ---------- EN: secciones estáticas ---------- */
const EN_MARKS = [
  ['hero', '<div class="hero">'],
  ['equipo', 'id="equipo"'],
  ['scrolly', '<div class="wd-scrolly">'],
  ['como-funciona', 'id="como-funciona"'],
  ['ideas/constancia', 'id="ideas"'],
  ['crecimiento/estrategia', 'id="crecimiento"'],
  ['semana', 'id="semana"'],
  ['voz', 'id="voz"'],
  ['ads', 'id="ads"'],
  ['subir', 'id="subir"'],
  ['ejemplos', 'id="ejemplos"'],
  ['planes', 'id="planes"'],
  ['prueba', 'id="prueba"'],
  ['progreso', 'id="progreso"'],
  ['faq', 'id="faq"'],
  ['lp-final', '<div class="lp-final">'],
  ['footer', 'class="footer"'],
];
seqOk(EN_MARKS.map(([n, m]) => [n, en.indexOf(m)]), 'EN orden');
const enAtiende = en.indexOf('id="atiende"');
if (enAtiende >= 0) {
  pin(enAtiende > en.indexOf('id="ideas"') && enAtiende < en.indexOf('id="crecimiento"'),
    'EN: #atiende (si está) cae entre Constancia y Estrategia');
}
const enHero = en.indexOf('<div class="hero">');
const enFirstSection = en.indexOf('class="section', enHero);
const enFirstSectionTail = en.slice(enFirstSection, en.indexOf('\n', enFirstSection));
pin(enFirstSectionTail.includes('id="equipo"'), 'EN: #equipo es la primera sección tras el héroe');
for (const id of ['equipo', 'como-funciona', 'ideas', 'crecimiento', 'semana', 'voz', 'ads', 'subir', 'ejemplos', 'prueba', 'planes', 'progreso', 'faq']) {
  const n = en.split('id="' + id + '"').length - 1;
  pin(n === 1, 'EN: id="' + id + '" ×1 (hay ' + n + ')');
}

/* ---------- EQUIPO GRANDE: sizing en ambos archivos ---------- */
for (const [name, src] of [['ES', appjs], ['EN', en]]) {
  pin(src.includes('grid-template-columns:1fr 480px 1fr'), name + ': columna de foto 480px');
  pin(!src.includes('1fr 372px 1fr'), name + ': la columna chica de 372px ya no está');
  pin(src.includes('#equipo .wrap{max-width:1240px}'), name + ': wrap de #equipo a 1240px');
  pin(src.includes('.eqv-pic{flex:none;width:40px;height:40px'), name + ': iconos de panel a 40px');
  pin(src.includes('.eqv-pic svg{width:22px;height:22px}'), name + ': glifos de panel a 22px');
  pin(src.includes('.eqv-pn{color:#fff;font-size:15px'), name + ': nombres sobre la foto a 15px');
  pin(src.includes('.eqv-deg-bottom{position:absolute;left:0;right:0;bottom:0;height:176px'), name + ': degradé inferior proporcional (176px)');
  pin(src.includes('.eqv-scene{grid-template-columns:1fr;gap:26px;max-width:520px'), name + ': escena móvil a 520px');
  pin(src.includes('id="homeFounderCard"') || name === 'EN', name + ': homeFounderCard conservado');
}
pin(appjs.includes('EL CRITERIO') && appjs.includes('LA CONSTANCIA') && appjs.includes('Convierte tus audios en cambios'),
  'ES: contenido de #equipo intacto (chips + audios solo del lado de Posty)');
pin(en.includes('THE EYE') && en.includes('THE CONSTANCY') && en.includes('Turns your voice notes into changes'),
  'EN: contenido de #equipo intacto');

/* ---------- anclas del nav resuelven ---------- */
for (const target of ['equipo', 'como-funciona', 'ads', 'planes', 'faq', 'prueba']) {
  pin(appjs.includes('id="' + target + '"'), 'ES: ancla #' + target + ' resuelve');
  pin(en.includes('id="' + target + '"'), 'EN: ancla #' + target + ' resuelve');
}

console.log(`REORDEN-PRINCIPIO: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
