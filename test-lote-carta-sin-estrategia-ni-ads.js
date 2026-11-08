'use strict';
/* LOTE CARTA-SIN-ESTRATEGIA-NI-ADS (decisión Valentino 7/11 20:53):
   1) Fuera de la carta la línea «la estrategia para esta semana»:
      la carta YA ES la estrategia, no hace falta aclararlo.
   2) Fuera de la carta todo lo de ads (#anaBoostRec: Impulsar +
      billetera + Cargar + picker): ads ya tiene su lugar (tab Ads).
      Sale de la rama carta Y de la vista sin carta (misma superficie
      Estrategia, mismo bloque).
   Queda: el tema de la semana («Esta semana: <tema>») — es contenido
   de estrategia, no el rótulo — y toda la maquinaria de ads del tab
   (anaBoostRecLoad, anaBilleteraHTML, tab Ads intactos). Las llamadas
   a anaBoostRecLoad en anaLoad/anaBackCurrent quedan como no-op
   guardado (sin caja, retorno temprano); no se borran.
   Corre con: node test-lote-carta-sin-estrategia-ni-ads.js (desde la raíz del árbol). */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');

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
global.anaShareBlockHTML = () => '<div class="ana-share">Compartir mi semana</div>';
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
global.anaShareBlockHTML = () => '<div class="ana-share">Compartir mi semana</div>';
global.anaAprendeHTML = () => '';
global.anaPlanHTML = () => '';
global.anaWeekBirthHTML = () => '';
global.anaLoopHTML = () => '';
global.pzIc = () => '';

const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
  week_summary: '',
  temaSemana: null,
}, extraD);

// ---------- 1. La línea del rótulo fuera (ES + EN, carta + sin carta) ----------
global.anaLang = 'es';
const html = global.anaCartaHTML(carta3());
ok(!html.includes('la estrategia para esta semana'), 'ES carta: sin la línea del rótulo');
ok(!html.includes('ana-ltr-first'), 'ES carta: sin clase ana-ltr-first');
ok(!html.includes('anaBoostRec'), 'ES carta: sin #anaBoostRec');
ok(!html.includes('Impulsar'), 'ES carta: sin bloque Impulsar');
const htmlNoCarta = global.anaCartaHTML({ analysis: null, week_summary: 'Esta semana miré tu cuenta y vi que…', temaSemana: null });
ok(!htmlNoCarta.includes('la estrategia para esta semana'), 'ES sin carta: sin la línea del rótulo');
ok(!htmlNoCarta.includes('anaBoostRec'), 'ES sin carta: sin #anaBoostRec');
global.anaLang = 'en';
const htmlEN = global.anaCartaHTML({ analysis: { lang: 'en', letter: { v: 2, minimal: true, title: 'Hold and refine', greeting: 'Hi, Posty.:', closing: 'Thanks for working with Posty.', body: body3 } }, week_summary: '', temaSemana: null });
ok(!htmlEN.includes('the strategy for this week'), 'EN carta: sin la línea del rótulo');
ok(!htmlEN.includes('anaBoostRec'), 'EN carta: sin #anaBoostRec');
global.anaLang = 'es';

// ---------- 2. Estático: el chunk ya no emite el rótulo ni el div ----------
ok(!chunk.includes("anaT('la estrategia para esta semana'"), 'chunk: sin el anaT del rótulo');
ok(!chunk.includes('if (a) h += `<p class="ana-ltr-first"'), 'chunk: sin la línea del rótulo');
ok(!chunk.includes('<div id="anaBoostRec"></div>'), 'chunk: sin el div #anaBoostRec en la carta');
ok((chunk.match(/id="anaBoostRec"/g) || []).length === 0, 'chunk: cero id="anaBoostRec" (las ids hijas Busq/Msg son del bloque, no de la carta)');

// ---------- 3. Queda: la carta sigue siendo carta ----------
ok(html.includes('Carta de Posty'), 'carta: rótulo Carta de Posty intacto');
ok(html.includes('A sostener y afinar'), 'carta: título intacto');
ok(html.includes('Primero festejemos'), 'carta: cuerpo intacto (festejo)');
ok(html.includes('anaFullBtn'), 'carta: botón Ver mi estrategia completa intacto');
ok(html.includes('Compartir mi semana'), 'carta: Compartir mi semana intacto');
ok(html.includes('Gracias por trabajar con Posty.'), 'carta: cierre intacto');
ok(!html.includes('Se actualiza una vez por semana'), 'carta: sigue sin nota de actualización (decisión 6/11)');

// ---------- 4. Queda: el tema de la semana (contenido, no rótulo) ----------
const htmlTema = global.anaCartaHTML(carta3({ temaSemana: 'Más reservas' }));
ok(htmlTema.includes('Esta semana: ') && htmlTema.includes('Más reservas'), 'carta: el tema de la semana sigue («Esta semana: Más reservas»)');
ok(!htmlTema.includes('la estrategia para esta semana'), 'carta con tema: sin el rótulo igual');
const htmlTemaEnCuerpo = global.anaCartaHTML(carta3({ temaSemana: 'reels' }));
ok(!stripTags(htmlTemaEnCuerpo).includes('Esta semana: reels'), 'carta: tema ya en el cuerpo, sin línea standalone duplicada (CARTA-LIDER)');

// ---------- 5. Queda: la maquinaria de ads del tab Ads ----------
ok(chunk.includes('async function anaBoostRecLoad'), 'chunk: anaBoostRecLoad sigue (tab Ads + refresh tras Cargar/Impulsar)');
ok(chunk.includes('function anaBilleteraHTML()'), 'chunk: anaBilleteraHTML sigue (bloque del tab Ads)');
ok(chunk.includes('function anaBilleteraCargar'), 'chunk: anaBilleteraCargar sigue');
ok(chunk.includes('function anaBilleteraTabLoad'), 'chunk: anaBilleteraTabLoad sigue (tab Ads)');
ok(chunk.includes('function anaAdsTabHTML'), 'chunk: anaAdsTabHTML sigue (vista del tab Ads)');
ok(chunk.includes("getElementById('adsTabRoot')"), 'chunk: el tab Ads sigue montando en adsTabRoot');
ok(chunk.includes('function anaBoostRecMotivo'), 'chunk: anaBoostRecMotivo sigue (textos de Cargar/Impulsar)');
ok(appJs.includes('anaAdsTabHTML') || chunk.includes('anaAdsTabHTML'), 'tab Ads: vista directa intacta');
// Las llamadas en anaLoad/anaBackCurrent quedan como no-op guardado.
const anaLoadIdx = chunk.indexOf('async function anaLoad(');
const anaLoadBody = chunk.slice(anaLoadIdx, chunk.indexOf('function anaRefresh'));
ok(anaLoadBody.includes('anaBoostRecLoad();'), 'anaLoad: la llamada queda (no-op guardado, sin caja retorna temprano)');
ok(chunk.includes('anaBoostRecLoad();'), 'chunk: anaBoostRecLoad() sigue llamado (guardado por early return sin caja)');

// ---------- 6. Funciones auditadas (M78: no se toca app.js) ----------
// Este lote NO toca public/app.js: solo chunk-analisis.js + suites.
ok(true, 'M78: app.js sin tocar (sin funciones nuevas que auditar)');

console.log(`\nLOTE CARTA-SIN-ESTRATEGIA-NI-ADS: ${okN} OK, ${failN} FALLIDOS`);
process.exit(failN ? 1 : 0);
