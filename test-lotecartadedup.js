'use strict';
/* LOTE CARTA-DEDUP (reporte Valentino 4/11, Estrategia #3 1/11/2026):
   la carta violaba el orden aprobado 3/11 y la regla NADA REPETIDO DOS
   VECES: abría con el problema (intro week_summary) antes de la
   felicitación, la mejora de reels aparecía 3 veces (intro + «Noté
   esto» + bullet idéntico) y el problema 2 veces (intro + «Noté
   esto»); además el saludo salía «Hola, Posty.:» (el nombre guardado
   es «Posty.» con punto). El fix, en chunk-analisis.js: saludo →
   felicitar (festejo abre la sección 1) → qué mejoramos + pasos sin
   re-enunciar la mejora → De tu lado → gracias; intro week_summary
   filtrada contra el cuerpo (solo sobrevive lo nuevo, después del
   cuerpo, nunca antes); cartas v1 conservan su forma vieja.
   Corre con: node test-lotecartadedup.js (desde el árbol del lote). */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');

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
// Los slices pueden traer funciones reales (anaFullHTML, anaAprendeHTML):
// los stubs mandan, reasignados tras los evals.
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
global.pzIc = () => '';

const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const count = (hay, needle) => norm(stripTags(hay)).split(norm(needle)).length - 1;

const WS_DUP = 'Esta semana miré tu cuenta y vi que todavía no aprovechás los reels, el formato que más empuja Instagram (0 reels en tus últimos 10 posteos).\nPor eso tu semana es así: la semana suma reels: es el formato que más empuja y hoy no está en tu mix.';
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

global.anaLang = 'es';
const html = global.anaCartaHTML(carta3());
const txt = stripTags(html);

// 1) Saludo sin punto de más (top y cuerpo).
ok(html.includes('Hola, Posty:'), 'saludo top «Hola, Posty:»');
ok(!html.includes('Posty.:'), 'ningún «Posty.:» en la carta');
const bodyOnly = global.anaLetterMinimalHTML({ letter: { v: 2, minimal: true, greeting: 'Hola, Posty.:', body: body3 } });
ok(stripTags(bodyOnly).includes('Hola, Posty:'), 'saludo del cuerpo normalizado');
ok(!stripTags(bodyOnly).includes('Posty.:'), 'cuerpo sin punto de más');

// 2) Orden aprobado: felicitar antes que «qué mejoramos»; festejo abre la sección 1.
ok(html.indexOf('Felicitaciones') !== -1 && html.indexOf('Felicitaciones') < html.indexOf('Qué mejoramos'), 'Felicitaciones antes que Qué mejoramos');
ok(html.indexOf('Primero festejemos') < html.indexOf('Qué mejoramos'), 'festejo antes que Qué mejoramos');
ok(html.indexOf('Primero festejemos') < html.indexOf('antes que nada, el ajuste'), 'festejo abre la sección 1 (antes del ajuste)');

// 3) Dedup: mejora 1 vez, problema 1 vez, intro fuera.
ok(count(html, 'la semana suma reels') === 1, 'mejora «la semana suma reels» exactamente 1 vez (era 3), halladas: ' + count(html, 'la semana suma reels'));
ok(count(html, 'todavía no aprovechás los reels') === 1, 'problema reels exactamente 1 vez (era 2)');
ok(!txt.includes('miré tu cuenta'), 'intro duplicada fuera (no «miré tu cuenta»)');
ok(!txt.includes('Por eso tu semana es así'), 'intro duplicada fuera (no «Por eso tu semana es así»)');

// 4) Pasos: el distinto se queda, el idéntico se va, el encabezado queda.
ok(txt.includes('La semana sale a buscar turnos'), 'paso distinto conservado');
ok(txt.includes('Esta semana hago esto:'), 'encabezado de pasos presente (queda 1 paso)');

// 5) De tu lado → gracias, una vez cada uno.
ok(count(html, 'De tu lado, esta semana: nada') === 1, 'De tu lado 1 vez');
ok(count(html, 'Gracias por trabajar con Posty.') === 1, 'gracias 1 vez');
ok(html.indexOf('De tu lado') < html.indexOf('Gracias por trabajar con Posty.'), 'De tu lado antes que gracias');

// 6) Resto intacto (superficie de la carta).
ok(html.includes('anaFullBtn'), 'botón Ver mi estrategia completa intacto');
ok(!html.includes('ana-fl-confirm'), 'ana-fl-confirm FUERA de la carta (decisión 6/11: la carta termina en Compartir)');
ok(!html.includes('ana-refresh'), 'nota de actualización FUERA de la carta (decisión 6/11)');
ok(html.includes('anaBoostRec'), 'anaBoostRec (Impulsar) intacto');
ok(html.includes('ana-carta-mano'), 'carta-mano intacta');
ok(chunk.includes('function anaAprendeHTML'), 'anaAprendeHTML sigue en el chunk');
ok(chunk.includes('function anaBoostRecHTML'), 'anaBoostRecHTML sigue en el chunk');
ok(chunk.includes('ana-tema'), 'ana-tema sigue en el chunk');

// 7) Borde: todos los pasos duplican → cae también el encabezado.
const bodyAllDup = body3.map((it) => (it.t === 'action' && it.text.includes('turnos')
  ? { t: 'action', text: 'La semana suma reels: es el formato que más empuja y hoy no está en tu mix.' } : it));
const htmlAllDup = global.anaCartaHTML(carta3({}, { body: bodyAllDup }));
ok(!stripTags(htmlAllDup).includes('Esta semana hago esto:'), 'sin pasos, cae el encabezado (no sección vacía)');
ok(count(htmlAllDup, 'la semana suma reels') === 1, 'con todos los pasos duplicados, la mejora sigue 1 vez');

// 8) Decisión 6/11: el intro YA NO sobrevive en la carta (ni la frase nueva).
// La frase nueva del week_summary no se rinde en ninguna rama de la carta.
const WS_NEW = WS_DUP + '\nAdemás, tu web nueva ya está enlazada en tu perfil.';
const htmlNew = global.anaCartaHTML(carta3({}, {}));
const htmlNew2 = global.anaCartaHTML({ analysis: carta3().analysis, week_summary: WS_NEW, temaSemana: null });
ok(!stripTags(htmlNew2).includes('tu web nueva ya está enlazada en tu perfil'), 'frase nueva del intro YA NO sobrevive en la carta (decisión 6/11)');
ok(!stripTags(htmlNew2).includes('miré tu cuenta'), 'intro fuera de la carta también con frase nueva');
ok(count(htmlNew2, 'la semana suma reels') === 1, 'con frase nueva, la mejora sigue 1 vez');

// 9) Decisión 6/11: las cartas v1 TAMBIÉN pierden el intro en la carta.
const v1 = { analysis: { lang: 'es', letter: { v: 1, title: 'Tu estrategia', greeting: 'Hola, Posty.:', closing: 'Gracias por trabajar con Posty.', body: body3 } }, week_summary: WS_DUP, temaSemana: null };
const htmlV1 = global.anaCartaHTML(v1);
ok(!stripTags(htmlV1).includes('miré tu cuenta'), 'v1: intro fuera de la carta (decisión 6/11)');
ok(!stripTags(htmlV1).includes('Por eso tu semana es así'), 'v1: segunda línea del intro fuera de la carta');
ok(htmlV1.includes('Primero festejemos'), 'v1: cuerpo intacto sin intro');

// 10) EN: saludo normalizado también.
global.anaLang = 'en';
const htmlEN = global.anaCartaHTML({ analysis: { lang: 'en', letter: { v: 2, minimal: true, title: 'Hold and refine', greeting: 'Hi, Posty.:', closing: 'Thanks for working with Posty.', body: body3 } }, week_summary: WS_DUP, temaSemana: null });
ok(htmlEN.includes('Hi, Posty:'), 'saludo EN «Hi, Posty:»');
ok(!htmlEN.includes('Posty.:'), 'EN sin punto de más');

console.log(`\nLOTE CARTA-DEDUP: ${okN} OK, ${failN} FALLIDOS`);
process.exit(failN ? 1 : 0);
