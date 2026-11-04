'use strict';
/* LOTE CARTA-LIDER (decisión Valentino 3/11, «Sí, armala así» — SUPERSEDE
   carta-corta 2/11): la carta mínima de Estrategia es de un LÍDER
   MOTIVACIONAL en 3 partes cortas: 1) felicitar avances con UN dato real
   (nunca inventado) · 2) qué vamos a mejorar y en qué trabajamos la
   semana siguiente, en pasos claros · 3) agradecimiento por trabajar con
   Posty (el cierre, desde el motor). REGLA DURA: NADA REPETIDO DOS VECES —
   lo que dice la carta no se repite textual en próximo-paso, aprende ni
   números; el tema semanal se fusiona si duplica (no se duplica).
   Preserva: carta-mano, saludo con nombre del negocio, ana-fl-confirm,
   Impulsar + gate, cartas v1 con su forma vieja. Corre con:
   node test-lotecartalider.js (desde el árbol del lote). */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Harness: las funciones extraídas usan esc y anaT como variables libres.
global.esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
global.anaLang = 'es';
global.anaT = (es, enS) => (global.anaLang === 'en' ? enS : es);
global.anaPastMode = false;

const extract = (re, name) => {
  const src = (chunk.match(re) || [])[0];
  ok(!!src, name + ' extraída del chunk');
  return src;
};
const fnMinimalSrc = extract(/function anaLetterMinimalHTML\(a[^)]*\) \{[\s\S]*?\n\}/, 'anaLetterMinimalHTML');
(0, eval)(fnMinimalSrc);
const fnAprendeSrc = extract(/function anaAprendeHTML\(d\) \{[\s\S]*?\n\}/, 'anaAprendeHTML');
(0, eval)(fnAprendeSrc);
const fnNextSrc = extract(/function anaNextStepHTML\(paso\) \{[\s\S]*?\n\}/, 'anaNextStepHTML');
(0, eval)(fnNextSrc);
const fnNumsSrc = extract(/function anaWeekNumsTiles\(st, posts\) \{[\s\S]*?\n\}/, 'anaWeekNumsTiles');
(0, eval)(fnNumsSrc);
const render = (a) => global.anaLetterMinimalHTML(a);

const blocksOf = (html) => {
  const parts = html.split('<section class="ana-ltr-sec">').slice(1);
  return parts.map((p) => ({
    title: (p.match(/ana-sec-t">([^<]+)</) || [,''])[1],
    body: p,
  }));
};
const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const fixtureES = {
  lang: 'es',
  letter: {
    v: 2, minimal: true, greeting: 'Hola, Café Fixture:',
    body: [
      { t: 'photo', src: 'https://ejemplo.test/mejor.jpg' },
      { t: 'p', kind: 'festejo', text: 'Primero festejemos lo bueno, que es mérito tuyo: tu estrella, el brunch, es lo que más sale de tu tienda. Sobre eso construimos.' },
      { t: 'p', kind: 'honesta', text: 'Noté esto: el ritmo flojeó el jueves — hoy: 0 posteos. Tranqui: ya está en marcha — 5 posteos con tu producto real.' },
      { t: 'p', kind: 'acciones-head', text: 'Esta semana hago esto:' },
      { t: 'action', text: 'Publicar 5 posteos con tu producto real.' },
      { t: 'action', text: 'Un reel con tu vidriera, sin foto genérica.' },
      { t: 'p', kind: 'pedido', text: 'De tu lado, esta semana: nada. El plan lo corro yo.' },
    ],
  },
};
const fixtureEN = {
  lang: 'en',
  letter: {
    v: 2, minimal: true, greeting: 'Hi, little cafe:',
    body: [
      { t: 'photo', src: 'https://ejemplo.test/best.jpg' },
      { t: 'p', kind: 'festejo', text: 'First, let us celebrate the good stuff — you earned it: your star, the brunch, is what moves most in your store. We build on that.' },
      { t: 'p', kind: 'honesta', text: 'I noticed this: rhythm dipped on Thursday — today: 0 posts. No worries — already in motion: 5 posts with your real product.' },
      { t: 'p', kind: 'acciones-head', text: 'This week I am doing this:' },
      { t: 'action', text: 'Publish 5 posts with your real product.' },
      { t: 'p', kind: 'pedido', text: 'On your side this week: nothing. I have the plan.' },
    ],
  },
};

/* ---------- ES: 2 secciones, títulos líder, partición por kind ---------- */
global.anaLang = 'es';
const htmlES = render(fixtureES);
const bES = blocksOf(htmlES);
ok(bES.length === 2, 'ES: exactamente 2 secciones de cuerpo (el cierre con agradecimiento es el banner del motor)');
ok(bES.map((b) => b.title).join('|') === 'Felicitaciones|Qué mejoramos y en qué trabajamos', 'ES: títulos en orden Felicitaciones / Qué mejoramos y en qué trabajamos');
ok(bES[0].body.includes('Hola, Café Fixture:') && bES[0].body.includes('mejor.jpg')
  && bES[0].body.includes('mérito tuyo') && !bES[0].body.includes('Noté esto')
  && !bES[0].body.includes('Publicar 5 posteos') && !bES[0].body.includes('De tu lado'),
  'sección 1: saludo + foto + festejo, sin honesta ni acciones ni pedido');
ok(bES[1].body.includes('Noté esto') && bES[1].body.includes('Esta semana hago esto')
  && bES[1].body.includes('Publicar 5 posteos') && bES[1].body.includes('Un reel con tu vidriera')
  && bES[1].body.includes('De tu lado, esta semana: nada') && !bES[1].body.includes('mérito tuyo'),
  'sección 2: honesta + acciones + pedido, sin festejo');
ok(!htmlES.includes('Qué pasó') && !htmlES.includes('Qué viene') && !htmlES.includes('Qué hacer'),
  'ES: títulos viejos de carta-corta fuera');

/* ---------- EN: títulos espejo ---------- */
global.anaLang = 'en';
const htmlEN = render(fixtureEN);
const bEN = blocksOf(htmlEN);
ok(bEN.length === 2, 'EN: exactamente 2 secciones de cuerpo');
ok(bEN.map((b) => b.title).join('|') === 'Congratulations|What we improve and work on', 'EN: títulos en orden Congratulations / What we improve and work on');

/* ---------- Contenido preservado, mismo orden (ES) ---------- */
global.anaLang = 'es';
const expectedES = [
  'Hola, Café Fixture:', 'https://ejemplo.test/mejor.jpg',
  'Primero festejemos lo bueno, que es mérito tuyo',
  'Noté esto: el ritmo flojeó el jueves',
  'Esta semana hago esto:', 'Publicar 5 posteos con tu producto real.',
  'Un reel con tu vidriera, sin foto genérica.',
  'De tu lado, esta semana: nada. El plan lo corro yo.',
];
const idxES = expectedES.map((s) => htmlES.indexOf(s));
ok(idxES.every((i) => i >= 0), 'ES: todo el contenido anterior sigue presente, sin pérdidas');
ok(idxES.every((v, i, arr) => i === 0 || v > arr[i - 1]), 'ES: contenido en el mismo orden de antes');

/* ---------- Sin festejo: sin sección de felicitación, sin invento ---------- */
const htmlNoFes = render({
  lang: 'es', letter: {
    v: 2, greeting: 'Hola —',
    body: [
      { t: 'p', kind: 'honesta', text: 'Noté esto: ritmo flojo.' },
      { t: 'action', text: 'Acción real.' },
      { t: 'p', kind: 'pedido', text: 'De tu lado: nada.' },
    ],
  },
});
const bNoFes = blocksOf(htmlNoFes);
ok(!htmlNoFes.includes('Felicitaciones') && bNoFes.length === 1
  && bNoFes[0].title === 'Qué mejoramos y en qué trabajamos'
  && bNoFes[0].body.includes('Hola —') && bNoFes[0].body.includes('Noté esto'),
  'sin festejo: sin sección de felicitación, sin felicitación inventada; el saludo abre la sección 2');

/* ---------- Kind desconocido (ajuste-salud del servidor): nunca se pierde ---------- */
const htmlAjuste = render({
  lang: 'es', letter: {
    v: 2, greeting: 'Hola —',
    body: [
      { t: 'p', kind: 'ajuste-salud', text: 'Ajuste de salud real.' },
      { t: 'p', kind: 'festejo', text: 'Festejo real.' },
      { t: 'action', text: 'Acción real.' },
      { t: 'p', kind: 'pedido', text: 'De tu lado: nada.' },
    ],
  },
});
ok(htmlAjuste.includes('Ajuste de salud real.') && blocksOf(htmlAjuste)[0].body.includes('Ajuste de salud real.'),
  'kind desconocido pre-acciones cae en la sección 1 por posición, sin perder contenido');

/* ---------- Degenerada sin acciones: plana, sin secciones vacías ---------- */
const htmlDeg = render({
  lang: 'es', letter: { v: 2, greeting: 'Hola —', body: [{ t: 'p', text: 'Solo narrativa, sin acciones.' }] },
});
ok(!htmlDeg.includes('ana-ltr-sec') && htmlDeg.includes('Solo narrativa, sin acciones.')
  && htmlDeg.includes('Hola —') && !htmlDeg.includes('Escuchá tu carta'),
  'sin acciones: forma plana de siempre, sin secciones vacías ni audio');

/* ---------- Sin foto: igual 2 secciones ---------- */
const htmlNoPhoto = render({
  lang: 'es', letter: {
    v: 2, greeting: 'Hola —',
    body: [{ t: 'p', kind: 'festejo', text: 'Festejo.' }, { t: 'action', text: 'Acción.' }, { t: 'p', kind: 'pedido', text: 'De tu lado: nada.' }],
  },
});
ok(blocksOf(htmlNoPhoto).length === 2, 'sin foto: igual 2 secciones');

/* ---------- Saludo suprimido con saludoTop (carta-personalizada) ---------- */
const htmlTop = global.anaLetterMinimalHTML(fixtureES, { saludoTop: true });
ok(!htmlTop.includes('Hola, Café Fixture:') && htmlTop.includes('mérito tuyo'),
  'saludoTop: el saludo del cuerpo se suprime, el festejo queda');

/* ---------- Escape: texto con HTML no se inyecta ---------- */
const htmlEsc = render({
  lang: 'es', letter: {
    v: 2, body: [{ t: 'p', kind: 'festejo', text: '<script>alert(1)</script>' }, { t: 'action', text: 'Acción.' }, { t: 'p', kind: 'pedido', text: 'De tu lado.' }],
  },
});
ok(!htmlEsc.includes('<script>alert') && htmlEsc.includes('&lt;script&gt;'),
  'el texto de la carta se escapa como antes');

/* ---------- Sin botón de audio aunque haya carta_url ---------- */
ok(!htmlES.includes('Escuchá tu carta') && !htmlES.includes('Listen to your letter')
  && !htmlES.includes('headphones'),
  'ES: sin botón de audio en la carta');

/* ---------- NADA REPETIDO: aprende ---------- */
global.anaPastMode = false;
const cartaBodyES = fixtureES.letter.body;
const dAprendeDup = { aprendizaje: 'tu estrella, el brunch, es lo que más sale de tu tienda', analysis: { letter: { body: cartaBodyES } } };
ok(global.anaAprendeHTML(dAprendeDup) === '', 'aprende: frase que la carta ya dice no se repite debajo');
const dAprendeOk = { aprendizaje: 'tu reel rindió más que tus fotos', analysis: { letter: { body: cartaBodyES } } };
const aprendeOk = global.anaAprendeHTML(dAprendeOk);
ok(aprendeOk.includes('Posty aprendió') && aprendeOk.includes('tu reel rindió más que tus fotos'),
  'aprende: frase nueva sí se dibuja');
global.anaPastMode = true;
ok(global.anaAprendeHTML(dAprendeOk) === '', 'aprende: en cartas viejas no se dibuja');
global.anaPastMode = false;

/* ---------- NADA REPETIDO: tema (guarda inline en anaCartaHTML) ---------- */
ok(chunk.includes('cartaTxtTema') && chunk.includes('temaNuevo') && chunk.includes('ana-tema'),
  'anaCartaHTML: la línea del tema solo se dibuja si la carta no lo dice ya (fusión, normalización inline sin función nueva)');
ok(!/function anaNormIncluye/.test(chunk),
  'sin función nueva en el chunk (censo M78 de carta-mano: 0 nuevas)');

/* ---------- NADA REPETIDO: próximo-paso y números ---------- */
const letterTxt = norm(fixtureES.letter.body.map((it) => it.text || '').join(' '));
for (const paso of ['aprobar', 'impulsar']) {
  const t = stripTags(global.anaNextStepHTML(paso));
  const texto = norm(t.replace(/^Próximo paso\s*/, '').replace(/Aprobá tu semana|Impulsá tu mejor posteo/g, ''));
  ok(texto.length > 10 && !letterTxt.includes(texto),
    'próximo-paso (' + paso + '): su frase no está textual en la carta');
}
const tiles = global.anaWeekNumsTiles({ posts_7d: 7, reach_7d: 1200 }, [{ status: 'published', published_at: new Date().toISOString(), likes: 10 }]);
const labels = tiles.map((t) => t.l);
ok(labels.includes('Posteos') && labels.includes('Likes') && labels.includes('Alcance'), 'números: tiles Posteos/Likes/Alcance presentes');
const letterSentences = letterTxt.split(/(?<=[.!?])\s+/);
ok(!labels.some((l) => letterSentences.some((s) => s.trim() === l.toLowerCase())),
  'números: ninguna etiqueta es una frase de la carta');

/* ---------- MOTOR: el cierre abre con agradecimiento ---------- */
const ae = require('./analysis-engine');
const NOW = Math.floor(Date.now() / 1000);
const mkPosts = (specs) => specs.map((s) => ({ taken_at: NOW - s.daysAgo * 86400, type: s.type || 'GraphImage', caption: s.caption || '' }));
const weakPosts = mkPosts([
  { daysAgo: 40, caption: 'Foto del local' },
  { daysAgo: 31, caption: 'Nuestro menú' },
  { daysAgo: 22, caption: 'Vení a conocernos' },
  { daysAgo: 15, caption: 'Plato del día' },
]);
const aES = ae.analyzeExisting({ profile: { followers: 320, posts_count: 40 }, posts: weakPosts, ctx: { postsPerWeek: 7, plan: 'pro', peers: [], businessName: 'Café Fixture' } });
ok(!!(aES && aES.letter), 'motor: carta generada');
if (aES && aES.letter) {
  ok(aES.letter.closing.startsWith('Gracias por trabajar con Posty. '), 'motor ES: el cierre abre con agradecimiento');
  ok(/Domingo 1 conmigo/.test(aES.letter.closing), 'motor ES: la cadencia del domingo siguiente intacta');
  ok(ae.lintTone(aES.letter.closing, 'es').ok, 'motor ES: el cierre pasa el lint de tono');
  const fes = (aES.letter.body || []).filter((it) => it.kind === 'festejo');
  ok(fes.length === 1, 'motor ES: UN solo festejo, con EL dato de la semana');
  const kinds = (aES.letter.body || []).map((it) => it.kind || it.t);
  const iF = kinds.indexOf('festejo'), iA = kinds.indexOf('action');
  ok(iF !== -1 && iA !== -1 && iF < iA, 'motor ES: festejo antes que acciones');
}
const aEN = ae.analyzeExisting({ profile: { followers: 320, posts_count: 40 }, posts: weakPosts, ctx: { postsPerWeek: 7, plan: 'pro', peers: [], lang: 'en', businessName: 'Glow Studio' } });
if (aEN && aEN.letter) {
  ok(aEN.letter.closing.startsWith('Thank you for working with Posty. '), 'motor EN: el cierre abre con agradecimiento');
  ok(ae.lintTone(aEN.letter.closing, 'en').ok, 'motor EN: el cierre pasa el lint de tono');
}

/* ---------- No se tocó lo demás ---------- */
ok(chunk.includes('ana-fl-confirm'), 'confirmación semanal ana-fl-confirm intacta en la carta');
ok(chunk.includes('<div id="anaBoostRec">'), 'superficie Impulsar (anaBoostRec) intacta en la carta');
ok(chunk.includes('anaBanner') && chunk.includes('anaSignHTML'), 'banner de cierre y firma intactos en la carta');
ok(chunk.includes('ana-carta-mano'), 'carta-mano intacta');
ok(chunk.includes('function anaSaludoTop'), 'saludo con nombre del negocio (anaSaludoTop) intacto');
ok(chunk.includes('anaMagiaEntrada'), 'magia de entrada intacta');
ok(serverJs.includes('conversionARS'), 'gate Impulsar intacto en server.js (conversionARS sin definir = sin cobro)');
ok(serverJs.includes("app.get('/carta/:token'"), 'página firmada /carta/:token intacta en server.js');

console.log(`lotecartalider: ${okN} ok, ${failN} fallos`);
process.exit(failN ? 1 : 0);
