'use strict';
/* LOTE ESTRATEGIA-CARTA-CORTA (decisión Valentino 2/11): la carta mínima de
   Estrategia se rinde en exactamente 3 bloques — Qué pasó / Qué viene /
   Qué hacer — con el mismo contenido y orden de antes, y sin botón de
   audio. La página firmada /carta/:token y el botón del email quedan
   intactos (server.js). Las cartas v1 guardadas conservan su forma.
   SUPERSEDED EN PARTE POR CARTA-LIDER (decisión Valentino 3/11): la
   partición y los títulos cambian a 2 secciones de cuerpo — Felicitaciones
   / Qué mejoramos y en qué trabajamos — con el cierre con agradecimiento
   como tercera parte (banner del motor). Los asserts de títulos/partición
   de este archivo se actualizaron con esa causa; el resto (contenido
   preservado, orden, sin audio, degenerada plana, escape, v1 intacta,
   superficies) sigue vigente. */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
// (CARTA-LIDER 3/11) El prístino v559 ya no se usa para la v1: la forma v1
// se verifica por comportamiento (render plano), no por diff de archivo.

// Harness: la función extraída usa esc y anaT como variables libres.
global.esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
global.anaLang = 'es';
global.anaT = (es, enS) => (global.anaLang === 'en' ? enS : es);
// La forma vieja usa pzIc para el botón de audio; el stub deja que el
// control negativo en prístino falle por asserts, no por crash.
global.pzIc = () => '';

// TANDA: la mínima ganó el parámetro opts (carta-personalizada: suprimir el
// saludo del cuerpo cuando el top ya lo rindió); la extracción acepta (a, opts).
const fnSrc = (chunk.match(/function anaLetterMinimalHTML\(a[^)]*\) \{[\s\S]*?\n\}/) || [])[0];
ok(!!fnSrc, 'anaLetterMinimalHTML extraída del chunk');
(0, eval)(fnSrc);
const render = (a) => global.anaLetterMinimalHTML(a);

const fixtureES = {
  lang: 'es',
  carta_url: '/carta/firmada-ejemplo',
  letter: {
    v: 2,
    greeting: 'Hola, cafecito —',
    body: [
      { t: 'photo', src: 'https://ejemplo.test/mejor.jpg' },
      { t: 'p', kind: 'festejo', text: 'Festejo real: tu mejor posteo llegó a 120 me gusta.' },
      { t: 'p', kind: 'honesta', text: 'Línea honesta: el ritmo flojeó el jueves, ya está en marcha el arreglo.' },
      { t: 'p', kind: 'acciones-head', text: 'Esta semana hago esto:' },
      { t: 'action', text: 'Esta semana hago esto: 5 posteos con tu producto real.' },
      { t: 'action', text: 'Un reel con tu vidriera, sin foto genérica.' },
      { t: 'p', kind: 'pedido', text: 'De tu lado, esta semana: nada. El plan lo corro yo.' },
    ],
  },
};
const fixtureEN = {
  lang: 'en',
  carta_url: '/carta/firmada-ejemplo',
  letter: {
    v: 2,
    greeting: 'Hi, little cafe —',
    body: [
      { t: 'photo', src: 'https://ejemplo.test/best.jpg' },
      { t: 'p', kind: 'festejo', text: 'Real win: your best post reached 120 likes.' },
      { t: 'p', kind: 'honesta', text: 'Honest line: rhythm dipped on Thursday, the fix is running.' },
      { t: 'p', kind: 'acciones-head', text: 'This week I do this:' },
      { t: 'action', text: 'This week I do this: 5 posts with your real product.' },
      { t: 'p', kind: 'pedido', text: 'On your side this week: nothing. I have the plan.' },
    ],
  },
};

const blocksOf = (html) => {
  const parts = html.split('<section class="ana-ltr-sec">').slice(1);
  return parts.map((p) => ({
    title: (p.match(/ana-sec-t">([^<]+)</) || [,''])[1],
    body: p,
  }));
};

/* ---------- ES: exactamente 2 secciones, títulos líder y orden (CARTA-LIDER) ---------- */
global.anaLang = 'es';
const htmlES = render(fixtureES);
const bES = blocksOf(htmlES);
ok(bES.length === 2, 'ES: exactamente 2 secciones de cuerpo');
ok(bES.map((b) => b.title).join('|') === 'Felicitaciones|Qué mejoramos y en qué trabajamos', 'ES: títulos en orden Felicitaciones / Qué mejoramos y en qué trabajamos');

/* ---------- EN: títulos espejo ---------- */
global.anaLang = 'en';
const htmlEN = render(fixtureEN);
const bEN = blocksOf(htmlEN);
ok(bEN.length === 2, 'EN: exactamente 2 secciones de cuerpo');
ok(bEN.map((b) => b.title).join('|') === 'Congratulations|What we improve and work on', 'EN: títulos en orden Congratulations / What we improve and work on');

/* ---------- Contenido preservado, mismo orden (ES) ---------- */
global.anaLang = 'es';
const expectedES = [
  'Hola, cafecito —', 'https://ejemplo.test/mejor.jpg',
  'Festejo real: tu mejor posteo llegó a 120 me gusta.',
  'Línea honesta: el ritmo flojeó el jueves, ya está en marcha el arreglo.',
  'Esta semana hago esto: 5 posteos con tu producto real.',
  'Un reel con tu vidriera, sin foto genérica.',
  'De tu lado, esta semana: nada. El plan lo corro yo.',
];
const idxES = expectedES.map((s) => htmlES.indexOf(s));
ok(idxES.every((i) => i >= 0), 'ES: todo el contenido anterior sigue presente, sin pérdidas');
ok(idxES.every((v, i, arr) => i === 0 || v > arr[i - 1]), 'ES: contenido en el mismo orden de antes');

/* ---------- Partición líder: cada cosa en su sección (CARTA-LIDER) ---------- */
ok(bES.length === 2 && bES[0].body.includes('Hola, cafecito —') && bES[0].body.includes('mejor.jpg')
  && bES[0].body.includes('Festejo real') && !bES[0].body.includes('Línea honesta')
  && !bES[0].body.includes('Esta semana hago esto: 5 posteos') && !bES[0].body.includes('De tu lado'),
  'sección 1 Felicitaciones: saludo + foto + festejo, sin honesta ni acciones ni pedido');
ok(bES.length === 2 && bES[1].body.includes('Línea honesta') && bES[1].body.includes('Esta semana hago esto')
  && bES[1].body.includes('Un reel con tu vidriera') && bES[1].body.includes('De tu lado, esta semana: nada')
  && !bES[1].body.includes('Festejo real'),
  'sección 2 Qué mejoramos: honesta + acciones + pedido, sin festejo');

/* ---------- Sin botón de audio aunque haya carta_url ---------- */
ok(!htmlES.includes('Escuchá tu carta') && !htmlES.includes('Listen to your letter')
  && !htmlES.includes('headphones') && !htmlES.includes('/carta/firmada-ejemplo'),
  'ES: sin botón de audio en la carta aunque exista carta_url');
ok(!htmlEN.includes('Escuchá tu carta') && !htmlEN.includes('Listen to your letter')
  && !htmlEN.includes('headphones'),
  'EN: sin botón de audio en la carta');

/* ---------- Degenerada sin acciones: plana, sin secciones vacías ---------- */
global.anaLang = 'es';
const htmlDeg = render({
  lang: 'es', carta_url: '/carta/x',
  letter: { v: 2, greeting: 'Hola —', body: [{ t: 'p', text: 'Solo narrativa, sin acciones.' }] },
});
ok(!htmlDeg.includes('ana-ltr-sec') && htmlDeg.includes('Solo narrativa, sin acciones.')
  && htmlDeg.includes('Hola —') && !htmlDeg.includes('Escuchá tu carta'),
  'sin acciones: forma plana de siempre, sin secciones vacías ni audio');

/* ---------- Sin foto: igual 2 secciones ---------- */
const htmlNoPhoto = render({
  lang: 'es', letter: {
    v: 2, greeting: 'Hola —',
    body: [{ t: 'p', kind: 'festejo', text: 'Narrativa.' }, { t: 'action', text: 'Acción.' }, { t: 'p', kind: 'pedido', text: 'De tu lado: nada.' }],
  },
});
ok(blocksOf(htmlNoPhoto).length === 2, 'sin foto: igual 2 secciones');

/* ---------- Escape: texto con HTML no se inyecta ---------- */
const htmlEsc = render({
  lang: 'es', letter: {
    v: 2, body: [{ t: 'p', text: '<script>alert(1)</script>' }, { t: 'action', text: 'Acción.' }, { t: 'p', text: 'De tu lado.' }],
  },
});
ok(!htmlEsc.includes('<script>alert') && htmlEsc.includes('&lt;script&gt;'),
  'el texto de la carta se escapa como antes');

/* ---------- No se tocó lo demás ---------- */
// (CARTA-LIDER 3/11) La v1 ya no se compara contra prístino-v559 (ese
// archivo no viaja con el árbol): se verifica por comportamiento — una
// carta v1 se sigue rindiendo plana, con fases y efecto, sin secciones.
const v1Src = (chunk.match(/function anaLetterBodyHTML\(a[^)]*\) \{[\s\S]*?\n\}/) || [])[0];
ok(!!v1Src, 'v1 (anaLetterBodyHTML) extraída del chunk');
if (v1Src) {
  (0, eval)(v1Src);
  global.anaLang = 'es';
  const v1Html = global.anaLetterBodyHTML({ letter: {
    greeting: 'Hola —',
    body: [
      { t: 'plan', phase: 0, phase_name: 'Fase', step: 'Paso v1', fx: 'Efecto v1' },
      { t: 'p', text: 'Texto v1' },
    ],
  } });
  ok(v1Html.includes('①') && v1Html.includes('Fase') && v1Html.includes('Paso v1')
    && v1Html.includes('El efecto: ') && v1Html.includes('Efecto v1') && v1Html.includes('Texto v1')
    && !v1Html.includes('ana-ltr-sec'),
    'v1: forma plana con fases y efecto, sin secciones — las cartas viejas conservan su forma');
}
ok(!chunk.includes('<div id="anaBoostRec">'), 'superficie Impulsar (anaBoostRec) FUERA de la carta (decisión 7/11)');
ok(chunk.includes('anaBanner') && chunk.includes('anaSignHTML'), 'banner de cierre y firma intactos en la carta');
ok(serverJs.includes("app.get('/carta/:token'"), 'página firmada /carta/:token intacta en server.js');
ok(serverJs.includes('Escuchá tu carta') && serverJs.includes('Listen to your letter'), 'botón del email ES + EN intacto en server.js');
ok(serverJs.includes('carta_url'), 'carta_url sigue en la respuesta del análisis');

console.log(`loteestrategiacartacorta: ${okN} ok, ${failN} fallos`);
process.exit(failN ? 1 : 0);
