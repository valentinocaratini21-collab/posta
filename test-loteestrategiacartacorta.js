'use strict';
/* LOTE ESTRATEGIA-CARTA-CORTA (decisión Valentino 2/11): la carta mínima de
   Estrategia se rinde en exactamente 3 bloques — Qué pasó / Qué viene /
   Qué hacer — con el mismo contenido y orden de antes, y sin botón de
   audio. La página firmada /carta/:token y el botón del email quedan
   intactos (server.js). Las cartas v1 guardadas conservan su forma. */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const pristineChunk = fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'public', 'chunk-analisis.js'), 'utf8');

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
      { t: 'p', text: 'Festejo real: tu mejor posteo llegó a 120 me gusta.' },
      { t: 'p', text: 'Línea honesta: el ritmo flojeó el jueves, ya está en marcha el arreglo.' },
      { t: 'action', text: 'Esta semana hago esto: 5 posteos con tu producto real.' },
      { t: 'action', text: 'Un reel con tu vidriera, sin foto genérica.' },
      { t: 'p', text: 'De tu lado, esta semana: nada. El plan lo corro yo.' },
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
      { t: 'p', text: 'Real win: your best post reached 120 likes.' },
      { t: 'p', text: 'Honest line: rhythm dipped on Thursday, the fix is running.' },
      { t: 'action', text: 'This week I do this: 5 posts with your real product.' },
      { t: 'p', text: 'On your side this week: nothing. I have the plan.' },
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

/* ---------- ES: exactamente 3 bloques, títulos y orden ---------- */
global.anaLang = 'es';
const htmlES = render(fixtureES);
const bES = blocksOf(htmlES);
ok(bES.length === 3, 'ES: exactamente 3 bloques');
ok(bES.map((b) => b.title).join('|') === 'Qué pasó|Qué viene|Qué hacer', 'ES: títulos en orden Qué pasó / Qué viene / Qué hacer');

/* ---------- EN: títulos espejo ---------- */
global.anaLang = 'en';
const htmlEN = render(fixtureEN);
const bEN = blocksOf(htmlEN);
ok(bEN.length === 3, 'EN: exactamente 3 bloques');
ok(bEN.map((b) => b.title).join('|') === 'What happened|What\'s next|What to do', 'EN: títulos en orden What happened / What\'s next / What to do');

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

/* ---------- Partición: cada cosa en su bloque ---------- */
ok(bES.length === 3 && bES[0].body.includes('Hola, cafecito —') && bES[0].body.includes('mejor.jpg')
  && bES[0].body.includes('Festejo real') && bES[0].body.includes('Línea honesta'),
  'bloque 1 Qué pasó: saludo + foto + festejo/honesta');
ok(bES.length === 3 && !bES[0].body.includes('Esta semana hago esto') && !bES[0].body.includes('De tu lado'),
  'bloque 1: sin acciones ni De tu lado');
ok(bES.length === 3 && bES[1].body.includes('Esta semana hago esto') && bES[1].body.includes('Un reel con tu vidriera'),
  'bloque 2 Qué viene: las acciones de la semana');
ok(bES.length === 3 && !bES[1].body.includes('Festejo real') && !bES[1].body.includes('De tu lado'),
  'bloque 2: sin narrativa ni De tu lado');
ok(bES.length === 3 && bES[2].body.includes('De tu lado, esta semana: nada'),
  'bloque 3 Qué hacer: el De tu lado');
ok(bES.length === 3 && !bES[2].body.includes('Esta semana hago esto'),
  'bloque 3: sin acciones');

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

/* ---------- Sin foto: igual 3 bloques ---------- */
const htmlNoPhoto = render({
  lang: 'es', letter: {
    v: 2, greeting: 'Hola —',
    body: [{ t: 'p', text: 'Narrativa.' }, { t: 'action', text: 'Acción.' }, { t: 'p', text: 'De tu lado: nada.' }],
  },
});
ok(blocksOf(htmlNoPhoto).length === 3, 'sin foto: igual 3 bloques');

/* ---------- Escape: texto con HTML no se inyecta ---------- */
const htmlEsc = render({
  lang: 'es', letter: {
    v: 2, body: [{ t: 'p', text: '<script>alert(1)</script>' }, { t: 'action', text: 'Acción.' }, { t: 'p', text: 'De tu lado.' }],
  },
});
ok(!htmlEsc.includes('<script>alert') && htmlEsc.includes('&lt;script&gt;'),
  'el texto de la carta se escapa como antes');

/* ---------- No se tocó lo demás ---------- */
// TANDA: la v1 ganó el plumbing opts (carta-personalizada). La comparación
// normaliza exactamente esos 3 cambios mecánicos; si normalizada es
// idéntica a prístino, la forma vieja se conserva (el render sin opts es
// el mismo, verificado en la liberación).
const v1WorkRaw = (chunk.match(/function anaLetterBodyHTML\(a[^)]*\) \{[\s\S]*?\n\}/) || [])[0];
const v1Work = v1WorkRaw && v1WorkRaw
  .replace('function anaLetterBodyHTML(a, opts) {', 'function anaLetterBodyHTML(a) {')
  .replace('return anaLetterMinimalHTML(a, opts);', 'return anaLetterMinimalHTML(a);')
  .replace('if (L.greeting && !(opts && opts.saludoTop))', 'if (L.greeting)');
const v1Pristine = (pristineChunk.match(/function anaLetterBodyHTML\(a\) \{[\s\S]*?\n\}/) || [])[0];
ok(!!v1Work && v1Work === v1Pristine, 'v1 (anaLetterBodyHTML) idéntica a prístino salvo plumbing opts: las cartas viejas conservan su forma');
ok(chunk.includes('<div id="anaBoostRec">'), 'superficie Impulsar (anaBoostRec) intacta en la carta');
ok(chunk.includes('anaBanner') && chunk.includes('anaSignHTML'), 'banner de cierre y firma intactos en la carta');
ok(serverJs.includes("app.get('/carta/:token'"), 'página firmada /carta/:token intacta en server.js');
ok(serverJs.includes('Escuchá tu carta') && serverJs.includes('Listen to your letter'), 'botón del email ES + EN intacto en server.js');
ok(serverJs.includes('carta_url'), 'carta_url sigue en la respuesta del análisis');

console.log(`loteestrategiacartacorta: ${okN} ok, ${failN} fallos`);
process.exit(failN ? 1 : 0);
