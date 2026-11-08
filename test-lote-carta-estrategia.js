'use strict';
/* LOTE CARTA-ESTRATEGIA (decisión Valentino 6/11, veredicto bamboo: los 3 sí):
   1) Jerarquía en celular: «Hola, X:» (22px carta-mano) y «la estrategia
      para esta semana» (21px Gochi) eran casi idénticos — el saludo pasa
      a saludo chico y apagado (17px/700/apagado) y la línea a título
      inconfundible (26px azul Posty #2793C8).
   2) Fuera el párrafo «Esta semana miré tu cuenta y vi que…» de la
      carta (v1 y mínima v2): repetía lo que el cuerpo ya dice y se veía
      con otra letra. El dato week_summary sigue en el payload y en la
      vista sin carta.
   3) Fuera todo lo que está debajo de «Compartir mi semana» en la
      carta: nota de actualización, «¿Qué vendés esta semana?» y Aprende.
      Impulsar (#anaBoostRec) queda: vive ANTES del botón.
   (7/11, decisión Valentino — CARTA-SIN-ESTRATEGIA-NI-ADS: la línea
   «la estrategia para esta semana» sale (la carta YA ES la estrategia)
   y el Impulsar (#anaBoostRec) sale de la carta (ads vive en el tab
   Ads). Las checks de §2 y §5 quedaron invertidas a «sin».)
   Corre con: node test-lote-carta-estrategia.js (desde la raíz del árbol). */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

global.esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
global.anaLang = 'es';
global.anaT = (es, enS) => (global.anaLang === 'en' ? enS : es);
global.anaPastMode = false;
global.anaSetLang = () => {};
global.anaCtx = () => ({ biz: 'Posty', handle: 'posty.communitymanager' });
global.anaStage = () => '';
global.anaDateLine = () => '';
global.anaProximoAnalisisHTML = () => '';
global.anaFullHTML = () => '';
global.anaKitHTML = () => '';
global.anaMarketHTML = () => '';
global.anaHistoryHTML = () => '';
global.anaBanner = () => '';
global.anaSignHTML = () => '';
global.anaShareBlockHTML = () => '';
global.anaAprendeHTML = () => '';
global.anaPlanHTML = () => '';
global.anaWeekBirthHTML = () => '';
global.anaLoopHTML = () => '';
global.pzIc = () => '';

const sliceFn = (startMark, endMark) => {
  const i = chunk.indexOf(startMark);
  const j = chunk.indexOf(endMark, i);
  ok(i !== -1 && j !== -1, startMark.trim() + ' extraíble');
  return chunk.slice(i, j);
};
(0, eval)(sliceFn('function anaLetterMinimalHTML(a, opts) {', '\nfunction anaLetterBodyHTML'));
(0, eval)(sliceFn('function anaLetterBodyHTML(a, opts) {', '\nfunction anaHasLetter'));
(0, eval)(sliceFn('function anaHasLetter(a) {', '\n/* ---------- La carta completa ---------- */'));
(0, eval)(sliceFn('function anaSaludoTop(a, carta) {', '\nfunction anaCartaHTML(d) {'));
(0, eval)(sliceFn('function anaCartaHTML(d) {', '\nfunction anaBoostRecPartes'));
// Los slices pueden traer funciones reales: los stubs mandan, reasignados tras los evals.
global.anaSetLang = () => {};
global.anaCtx = () => ({ biz: 'Posty', handle: 'posty.communitymanager' });
global.anaStage = () => '';
global.anaDateLine = () => '';
global.anaProximoAnalisisHTML = () => '';
global.anaFullHTML = () => '';
global.anaKitHTML = () => '';
global.anaMarketHTML = () => '';
global.anaHistoryHTML = () => '';
global.anaBanner = () => '';
global.anaSignHTML = () => '';
global.anaShareBlockHTML = () => '';
global.anaAprendeHTML = () => '';
global.anaPlanHTML = () => '';
global.anaWeekBirthHTML = () => '';
global.anaLoopHTML = () => '';
global.pzIc = () => '';

const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const count = (hay, needle) => norm(stripTags(hay)).split(norm(needle)).length - 1;

const WS_DUP = 'Esta semana miré tu cuenta y vi que todavía no aprovechás los reels, el formato que más empuja Instagram (0 reels en tus últimos 10 posteos).\nPor eso tu semana es así: la semana suma reels: es el formato que más empuja y hoy no está en tu mix.';
const WS_EN = 'This week I looked at your account and saw that you are not using reels yet, the format that pushes Instagram the hardest (0 reels in your last 10 posts).\nThat\'s why your week looks like this: the week adds reels.';
const body3 = [
  { t: 'p', text: 'antes que nada, el ajuste de esta semana: reforcé la revisión de tus posteos (pasan por doble control antes de que los veas) y volví a leer tu Instagram y tu web para que lo que viene se parezca más a vos.' },
  { t: 'p', kind: 'festejo', text: 'Primero festejemos lo bueno, que es mérito tuyo: tu constancia ya trabaja para tu agenda: salís a 4,4 posteos por semana. Sostenerlo y afinarlo es mi trabajo.' },
  { t: 'p', kind: 'honesta', text: 'Noté esto: todavía no aprovechás los reels, el formato que más empuja Instagram — hoy: 0 reels en tus últimos 10 posteos. Tranqui: ya está en marcha — la semana suma reels: es el formato que más empuja y hoy no está en tu mix.' },
  { t: 'p', kind: 'acciones-head', text: 'Esta semana hago esto:' },
  { t: 'action', text: 'La semana suma reels: es el formato que más empuja y hoy no está en tu mix.' },
  { t: 'action', text: 'La semana sale a buscar turnos: los posteos clave llevan el llamado a reservar bien a la vista.' },
  { t: 'p', kind: 'pedido', text: 'De tu lado, esta semana: nada. El plan lo corro yo.' },
];
const carta3 = (extraD = {}, extraA = {}) => Object.assign({
  analysis: {
    lang: 'es',
    letter: Object.assign({
      v: 2, minimal: true, title: 'A sostener y afinar',
      greeting: 'Hola, Posty.:',
      closing: 'Gracias por trabajar con Posty.',
      body: body3,
    }, extraA),
  },
  week_summary: WS_DUP,
  temaSemana: null,
}, extraD);

// ---------- 1. Jerarquía saludo vs línea (CSS) ----------
const rule = (sel) => {
  const m = styles.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  return m ? m[1] : null;
};
const px = (r, prop) => { const m = r && r.match(new RegExp(prop + ':(\\d+)px')); return m ? Number(m[1]) : null; };
const col = (r) => { const m = r && r.match(/color:([^;}]+)/); return m ? m[1].trim() : null; };
const manoGreet = rule('.ana-carta-mano .ana-ltr-greet');
const manoFirst = rule('.ana-carta-mano .ana-ltr-first');
const baseGreet = rule('.ana-ltr-greet');
const baseFirst = rule('.ana-ltr-first');
ok(manoGreet && px(manoGreet, 'font-size') === 17, 'carta-mano: saludo 17px, hallado: ' + (manoGreet || 'sin regla'));
ok(manoFirst && px(manoFirst, 'font-size') === 26, 'carta-mano: línea de estrategia 26px, hallado: ' + (manoFirst || 'sin regla'));
ok(px(manoGreet, 'font-size') < px(manoFirst, 'font-size'), 'carta-mano: título (26) claramente mayor que saludo (17)');
ok(col(manoGreet) === 'rgba(10,30,51,.55)', 'carta-mano: saludo apagado, hallado: ' + col(manoGreet));
ok(col(manoFirst) === '#2793C8', 'carta-mano: línea azul Posty #2793C8, hallado: ' + col(manoFirst));
ok(manoGreet && /font-weight:700/.test(manoGreet), 'carta-mano: saludo peso 700 (no compite con el título)');
ok(baseGreet && col(baseGreet) === 'rgba(10,30,51,.6)', 'base: saludo apagado también en cartas viejas, hallado: ' + col(baseGreet));
ok(baseFirst && col(baseFirst) === '#2793C8', 'base: línea azul Posty también en cartas viejas, hallado: ' + col(baseFirst));
ok(styles.includes(".ana-carta-mano .ana-ltr-p{font-size:21px;line-height:1.5;font-family:'Gochi Hand'"), 'carta-mano: el saludo sigue en Gochi por herencia');

// ---------- 2. Render: jerarquía visible en el HTML ----------
global.anaLang = 'es';
const html = global.anaCartaHTML(carta3());
const txt = stripTags(html);
ok(html.includes('class="ana-ltr-p ana-ltr-greet"'), 'render: saludo con clase ana-ltr-greet');
ok(!html.includes('class="ana-ltr-first"'), 'render: sin línea ana-ltr-first (decisión 7/11)');
ok(html.includes('Hola, Posty:'), 'render: saludo «Hola, Posty:»');
ok(!html.includes('la estrategia para esta semana'), 'render: sin la línea «la estrategia para esta semana» (decisión 7/11)');
ok(html.indexOf('Hola, Posty:') < html.indexOf('Primero festejemos'), 'render: saludo arriba, cuerpo después');

// ---------- 3. «miré tu cuenta» fuera de TODAS las ramas de la carta ----------
ok(!txt.includes('miré tu cuenta'), 'v2 mínima ES: sin «miré tu cuenta»');
ok(!txt.includes('Por eso tu semana es así'), 'v2 mínima ES: sin «Por eso tu semana es así»');
const WS_NEW = WS_DUP + '\nAdemás, tu web nueva ya está enlazada en tu perfil.';
const htmlNew = global.anaCartaHTML({ analysis: carta3().analysis, week_summary: WS_NEW, temaSemana: null });
ok(!stripTags(htmlNew).includes('tu web nueva ya está enlazada en tu perfil'), 'v2 mínima: ni la frase nueva del intro sobrevive');
const v1 = { analysis: { lang: 'es', letter: { v: 1, title: 'Tu estrategia', greeting: 'Hola, Posty.:', closing: 'Gracias por trabajar con Posty.', body: body3 } }, week_summary: WS_DUP, temaSemana: null };
const htmlV1 = global.anaCartaHTML(v1);
ok(!stripTags(htmlV1).includes('miré tu cuenta'), 'v1: sin «miré tu cuenta»');
ok(!stripTags(htmlV1).includes('Por eso tu semana es así'), 'v1: sin «Por eso tu semana es así»');
global.anaLang = 'en';
const htmlEN = global.anaCartaHTML({ analysis: { lang: 'en', letter: { v: 2, minimal: true, title: 'Hold and refine', greeting: 'Hi, Posty.:', closing: 'Thanks for working with Posty.', body: body3 } }, week_summary: WS_EN, temaSemana: null });
ok(!stripTags(htmlEN).includes('looked at your account'), 'v2 mínima EN: sin «looked at your account»');
global.anaLang = 'es';

// ---------- 4. Nada debajo de «Compartir mi semana» (rama carta) ----------
ok(!html.includes('ana-refresh'), 'carta: sin nota de actualización');
ok(!html.includes('ana-fl-confirm'), 'carta: sin botón «¿Qué vendés esta semana?»');
ok(!txt.includes('Se actualiza una vez por semana'), 'carta: sin el texto de actualización');
ok(!txt.includes('¿Qué vendés esta semana?'), 'carta: sin el texto de confirmación');
ok(!htmlV1.includes('ana-refresh') && !htmlV1.includes('ana-fl-confirm'), 'v1: tampoco nada debajo de Compartir');
// Estático: entre la llamada a Compartir y el return de la rama carta no hay nada de eso.
const cartaSrc = sliceFn('function anaCartaHTML(d) {', '\nfunction anaBoostRecPartes');
const shareIdx = cartaSrc.indexOf('anaShareBlockHTML(a)');
ok(shareIdx !== -1, 'anaShareBlockHTML llamado en la carta');
ok((cartaSrc.match(/anaShareBlockHTML\(a\)/g) || []).length === 1, 'anaShareBlockHTML llamado una sola vez');
const tail = cartaSrc.slice(shareIdx, cartaSrc.indexOf('return h;', shareIdx));
ok(!tail.includes('ana-refresh'), 'estático: nada de refresh entre Compartir y el fin de la carta');
ok(!tail.includes('ana-fl-confirm'), 'estático: nada de fl-confirm entre Compartir y el fin de la carta');
ok(!tail.includes('anaAprendeHTML'), 'estático: nada de Aprende entre Compartir y el fin de la carta');
const afterReturn = cartaSrc.slice(cartaSrc.indexOf('return h;', shareIdx));
ok(afterReturn.includes('ana-refresh'), 'vista sin carta conserva el refresh');
ok(afterReturn.includes('anaAprendeHTML(d)'), 'vista sin carta conserva Aprende');
ok((chunk.match(/h \+= anaAprendeHTML\(d\);/g) || []).length === 1, 'anaAprendeHTML llamada solo 1 vez en todo el chunk (rama sin carta)');

// ---------- 5. Lo que queda: Ver completa, cuerpo (sin Impulsar) ----------
// (7/11, decisión Valentino) Impulsar (#anaBoostRec) salió de la carta:
// ads vive en el tab Ads. La carta queda como carta de estrategia.
ok(!html.includes('anaBoostRec'), 'carta: sin Impulsar (#anaBoostRec) (decisión 7/11)');
ok(html.includes('anaFullBtn'), 'botón Ver mi estrategia completa intacto');
ok(html.includes('Primero festejemos'), 'cuerpo intacto (festejo)');
ok(count(html, 'la semana suma reels') === 1, 'mejora sigue 1 vez');

// ---------- 6. Sin llamadas colgando; dato intacto ----------
ok(chunk.includes('function anaFlConfirmLoad'), 'anaFlConfirmLoad sigue definido (flujo dormido)');
ok(chunk.includes('function anaFlConfirmRender'), 'anaFlConfirmRender sigue definido (flujo dormido)');
ok(chunk.includes('function anaAprendeHTML'), 'anaAprendeHTML sigue definida');
ok(serverJs.includes('week_summary: analysisEngine.weekSummary(analysis)'), 'week_summary intacto en el payload del servidor');
// Vista sin carta: el week_summary SÍ se rinde (apertura).
const htmlNoCarta = global.anaCartaHTML({ analysis: null, week_summary: WS_DUP, temaSemana: null });
ok(stripTags(htmlNoCarta).includes('miré tu cuenta'), 'vista sin carta: el week_summary sigue abriendo la ventana');
ok(!htmlNoCarta.includes('anaBoostRec'), 'vista sin carta: sin Impulsar (#anaBoostRec) (decisión 7/11)');

console.log(`\nLOTE CARTA-ESTRATEGIA: ${okN} OK, ${failN} FALLIDOS`);
process.exit(failN ? 1 : 0);
