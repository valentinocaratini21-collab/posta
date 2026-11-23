'use strict';

// =====================================================================
// LOTE CONSERJE-VER-GRANDE — suite del lote
// =====================================================================
// Pedido del dueño (23/11/2026 02:57, usando la consola en vivo): «en
// el conserje, si toco en la imagen de los posteos, tengo que poder
// verlos… verlos en grande». Hoy tocar la imagen de un posteo no abre
// nada. El lote:
//   · Un solo visor en grande (lightbox) para TODAS las superficies
//     que muestran la imagen de un posteo: la tarjeta de decisión
//     (pieza y el posteo de un pedido), la ficha (su semana y su
//     feed) y la producción de mañana. La pieza se ve ENTERA, sin
//     recorte, con su caption; el carrusel se recorre lámina a
//     lámina (flechas, puntos, teclas, swipe) y el video se
//     reproduce con su póster y controles. Cerrar (✕, toque fuera,
//     Esc) devuelve al mismo scroll y estado: el visor no decide
//     nada ni re-renderiza nada.
//   · La media completa sale de UN endpoint nuevo
//     (GET /api/admin/support/conserje/posteo-media →
//     conserjeVista.mediaDePosteo): láminas del carrusel en orden,
//     video reproducible + póster, caption SIN truncar. Cada
//     superficie abre primero con su respaldo (lo que la miniatura ya
//     tenía) y la media completa lo reemplaza cuando llega; si el
//     pedido falla, queda el respaldo — nunca un hueco.
//   · Cierra la F2 del censo CENSO-CONSERJE-2 (quedó sin ejercer por
//     el entorno): la ruta del feed emite la foto en «img» y
//     renderFeed leía «image_url» — «Su feed» no mostraba las fotos
//     y no había nada que tocar. El arreglo sigue el diseño
//     documentado en ese censo: póster primero y jamás un .mp4 en un
//     <img> (regla de CONSERJE-FOTO-VIDEO).
// La suite ejercita el lote sin boot ni navegador, sobre las
// funciones reales del árbol donde vive:
//   A · Estática del visor + gate de funciones de la consola.
//   B · mediaDePosteo real contra una base en memoria.
//   C · Las funciones del visor reales, extraídas del bundle, con un
//       DOM mínimo: abrir/cerrar, navegación del carrusel, los dos
//       caminos de apertura (directo y por posteo, con su respaldo).
//   D · Los renderers reales (postCard / decCard) emiten [data-ver]
//       en la miniatura — y solo cuando hay imagen.
// Contra la base efectiva (HEAD + CENSO-CONSERJE-2, sin este lote)
// las verificaciones del visor fallan y los controles sanos pasan.
// Uso: node test-lote-conserje-ver-grande.js — sale 0 si todo pasa.
// =====================================================================

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { DatabaseSync } = require('node:sqlite');

const ROOT = process.env.PZ_TREE || __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
function extraer(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no está la función ' + nombre);
  let prof = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') prof++;
    else if (src[j] === '}') { prof--; if (prof === 0) return src.slice(i, j + 1); }
  }
  throw new Error('sin cierre ' + nombre);
}

// ---------------------------------------------------------------------
seccion('A · estática del visor + gate de funciones');
const js = read('public/conserje.js');
const html = read('public/conserje.html');
const srv = read('server.js');
{
  t('A1 el HTML trae el visor (overlay, media, cerrar, flechas) y su CSS',
    html.includes('id="visor"') && html.includes('id="visorMedia"') && html.includes('id="visorCerrar"')
    && html.includes('id="visorPrev"') && html.includes('id="visorNext"') && html.includes('.visor{')
    && html.includes('object-fit:contain'));
  t('A2 el sello de la consola es conserje.js?v=6', html.includes('conserje.js?v=6'));
  const fns = ['regVisorFallback', 'visorItemsDe', 'visorPintar', 'abrirVisor', 'cerrarVisor', 'visorIrA', 'onVerThumb'];
  t('A3 las funciones del visor existen definidas', fns.every((f) => js.includes('function ' + f + '(')),
    fns.filter((f) => !js.includes('function ' + f + '(')).join(','));
  const nPost = (js.match(/data-ver-post/g) || []).length;
  const nUid = (js.match(/data-ver-uid/g) || []).length;
  t('A4 [data-ver] en las superficies: >=5 con posteo, >=3 con uid, >=1 directo',
    nPost >= 5 && nUid >= 3 && js.includes('data-ver-img'), 'post=' + nPost + ' uid=' + nUid);
  t('A5 F2: renderFeed lee la foto de «img» con la guarda anti-mp4',
    js.includes("t.img || t.image_url") && js.includes("esVideo && t.kind === 'post'"));
  t('A6 la ruta posteo-media existe con su puerta y su constructor',
    srv.includes("app.get('/api/admin/support/conserje/posteo-media', requireAdminToken")
    && srv.includes('conserjeVista.mediaDePosteo'));
  const acts = new Set([...js.matchAll(/data-act="([a-z0-9-]+)"/g)].map((m) => m[1]));
  const ramas = new Set([...js.matchAll(/act === '([a-z0-9-]+)'/g)].map((m) => m[1]));
  const sinRama = [...acts].filter((a) => !ramas.has(a));
  t('A7 gate: todo data-act del bundle tiene rama en el handler', sinRama.length === 0, sinRama.join(','));
  const iVer = js.indexOf("closest('[data-ver]')");
  const iSel = js.indexOf("closest('[data-sel]')");
  t('A8 gate: la rama [data-ver] del handler delegado va ANTES que data-sel/data-goto',
    iVer > 0 && iSel > 0 && iVer < iSel);
  t('A9 los controles del visor están cableados (✕, flechas, Esc, swipe)',
    js.includes("$('visorCerrar').addEventListener('click', cerrarVisor)")
    && js.includes("$('visorPrev').addEventListener('click'")
    && js.includes("$('visorNext').addEventListener('click'")
    && js.includes("ev.key === 'Escape'") && js.includes('touchend'));
}

// ---------------------------------------------------------------------
seccion('B · mediaDePosteo REAL (base en memoria)');
function compilarVista() {
  const file = path.join(ROOT, 'conserje-vista.js');
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
}
function sembrar() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, image_path TEXT,
    carousel_paths TEXT, cover_path TEXT, caption TEXT, status TEXT, media_type TEXT,
    tipo TEXT, scheduled_at TEXT, published_at TEXT, created_at TEXT, approval TEXT,
    source_topic TEXT, error TEXT)`);
  const ins = db.prepare(`INSERT INTO posts (id, user_id, image_path, carousel_paths, cover_path,
    caption, status, media_type, tipo, scheduled_at, published_at, created_at, approval, source_topic, error)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const capLargo = ('Caption entero del carrusel. ' + 'Segunda línea con detalle. ').repeat(30); // > 500: posteosDe lo truncaría
  ins.run(1, 316, '/media/foto.jpg', null, null, 'Foto única del negocio', 'published', 'image', '', null, '2026-11-20 19:00:00', '2026-11-20 19:00:00', '', '', '');
  ins.run(2, 316, '/media/c1.jpg', JSON.stringify(['/media/c1.jpg', '/media/c2.jpg', '/media/c3.jpg']), null, capLargo, 'scheduled', 'carousel', '', '2026-11-24 19:00:00', null, '2026-11-23 09:00:00', '', '', '');
  ins.run(3, 316, '/media/vid.mp4', null, '/media/vid-cover.jpg', 'El video de mañana', 'draft', 'video', '', '2026-11-24 19:00:00', null, '2026-11-23 09:00:00', '', '', '');
  ins.run(4, 316, '/media/reel.mp4', null, null, 'Un reel', 'published', 'reel', '', null, '2026-11-21 19:00:00', '2026-11-21 09:00:00', '', '', '');
  ins.run(5, 316, '/media/roto.jpg', '{json-roto', null, 'Carrusel con el JSON roto', 'draft', 'carousel', '', null, null, '2026-11-23 09:00:00', '', '', '');
  ins.run(6, 316, 'data:image/png;base64,AAAA', null, null, 'Imagen vieja en data:', 'draft', 'image', '', null, null, '2026-11-23 09:00:00', '', '', '');
  ins.run(7, 999, '/media/ajena.jpg', null, null, 'De otro usuario', 'published', 'image', '', null, '2026-11-20 19:00:00', '2026-11-20 09:00:00', '', '', '');
  return { db, capLargo };
}
const OPTS = {
  absImageUrl: (u, p) => 'http://x' + p,
  posterUrlFor: (u, p) => (['video', 'reel', 'reels'].includes(String(p.media_type || '').toLowerCase()) && p.cover_path) ? 'http://x' + p.cover_path : '',
};
{
  const vista = compilarVista();
  t('B0 mediaDePosteo está exportado', typeof vista.mediaDePosteo === 'function');
  if (typeof vista.mediaDePosteo === 'function') {
    const { db, capLargo } = sembrar();
    const foto = vista.mediaDePosteo(db, 316, 1, OPTS);
    t('B1 foto única: slides = [su URL], sin video', !!foto && foto.slides.length === 1
      && foto.slides[0] === 'http://x/media/foto.jpg' && foto.video_url === '' && foto.media_type === 'image');
    const car = vista.mediaDePosteo(db, 316, 2, OPTS);
    t('B2 carrusel: las 3 láminas en orden, URLs absolutas', !!car && car.slides.length === 3
      && car.slides[0] === 'http://x/media/c1.jpg' && car.slides[1] === 'http://x/media/c2.jpg' && car.slides[2] === 'http://x/media/c3.jpg');
    t('B3 el caption sale ENTERO (sin el truncado de 500 de la ficha)', !!car && car.caption === capLargo && car.caption.length > 500);
    const vid = vista.mediaDePosteo(db, 316, 3, OPTS);
    t('B4 video: video_url es el .mp4 y poster_url su póster', !!vid && vid.video_url === 'http://x/media/vid.mp4'
      && vid.poster_url === 'http://x/media/vid-cover.jpg' && vid.slides.length === 0);
    const reel = vista.mediaDePosteo(db, 316, 4, OPTS);
    t('B5 reel sin cover: video_url presente, póster vacío (fail-soft)', !!reel && reel.video_url === 'http://x/media/reel.mp4' && reel.poster_url === '');
    const roto = vista.mediaDePosteo(db, 316, 5, OPTS);
    t('B6 carrusel con JSON roto: cae a la portada sola', !!roto && roto.slides.length === 1 && roto.slides[0] === 'http://x/media/roto.jpg');
    const data = vista.mediaDePosteo(db, 316, 6, OPTS);
    t('B7 imagen en data:: sin URL servible, slides vacío (nada inventado)', !!data && data.image_url === '' && data.slides.length === 0);
    t('B8 posteo de OTRO usuario o inexistente: null', vista.mediaDePosteo(db, 316, 7, OPTS) === null
      && vista.mediaDePosteo(db, 316, 999, OPTS) === null);
  }
}

// ---------------------------------------------------------------------
// C y D comparten la extracción de funciones reales del bundle.
function cargarBundle(src, nombres) {
  const meses = src.match(/var MESES = \[[^\]]*\];/)[0];
  const header = [
    'var visor = { items: [], idx: 0, caption: \'\', abierto: false };',
    'var visorFallbacks = {}; var visorSeq = 0;',
    'var highlightPostId = null; var selUser = 316;',
    'var __els = {};',
    'function $(id) { return __els[id] || (__els[id] = { innerHTML: \'\', textContent: \'\', hidden: false,',
    '  classList: { _s: new Set(), add: function (c) { this._s.add(c); }, remove: function (c) { this._s.delete(c); }, contains: function (c) { return this._s.has(c); } } }); }',
    'var document = { body: { style: {} } };',
    'var __apiResp = { ok: false }; var __apiCalls = [];',
    'function api(path) { __apiCalls.push(path); return Promise.resolve(__apiResp); }',
  ].join('\n');
  const codigo = [header, meses]
    .concat(nombres.map((n) => extraer(src, n)))
    .concat(['module.exports = { ' + nombres.join(', ')
      + ', __visor: function () { return visor; }, __els: __els, __apiCalls: __apiCalls,'
      + ' __setApi: function (r) { __apiResp = r; }, __doc: document };'])
    .join('\n');
  const m = { exports: {} };
  new Function('module', 'exports', codigo)(m, m.exports);
  return m.exports;
}

// ---------------------------------------------------------------------
seccion('D · los renderers reales emiten [data-ver]');
{
  let f = null;
  try {
    f = cargarBundle(js, ['esc', 'trunc', 'fechaCorta', 'regVisorFallback', 'chipDePost', 'postCard', 'decTag', 'decCard']);
  } catch (e) { t('D0 el bundle del visor extrae y compila', false, e.message); }
  if (f) {
    const card = f.postCard({ id: 7, status: 'draft', media_type: 'image', image_url: 'http://x/f.jpg', poster_url: '', caption: 'La foto', dia_key: '2026-11-24', titulo: 'Foto', tipo: '' }, true, 'A');
    t('D1 postCard con imagen: la miniatura lleva data-ver-post y su respaldo',
      card.includes('data-ver data-ver-post="7"') && card.includes('data-ver-fb="vf'));
    t('D2 postCard conserva sus acciones donde están (Sale así sigue en la tarjeta)',
      card.includes('data-act="post-sale"'));
    const cardSin = f.postCard({ id: 8, status: 'draft', media_type: 'image', image_url: '', poster_url: '', caption: '', dia_key: '2026-11-24', titulo: 'Sin foto', tipo: '' }, true, 'A');
    t('D3 postCard SIN imagen: no hay data-ver (nada que tocar)', !cardSin.includes('data-ver'));
    const pieza = f.decCard({
      tipo: 'pieza', clase: 'decision', user_id: 316, business_name: 'Archivo SRL', ig_username: 'archivo.srl',
      titulo: 'Pieza de mañana', texto: 'El caption de la pieza', image_url: 'http://x/p.jpg', poster_url: '',
      media_type: 'image', fecha: '2026-11-24', post_id: 9,
    });
    t('D4 decCard pieza: el d-thumb lleva data-ver con posteo y usuario',
      pieza.includes('data-ver data-ver-post="9"') && pieza.includes('data-ver-uid="316"'));
    const voz = f.decCard({
      tipo: 'voz', clase: 'pedido', user_id: 316, business_name: 'Archivo SRL', ig_username: 'archivo.srl',
      pedido: 'cambiá la foto', message_id: 55, es_idea: false,
      posteo: { id: 11, status: 'scheduled', media_type: 'video', caption: 'El video', image_url: 'http://x/v.mp4', poster_url: 'http://x/v.jpg' },
    });
    t('D5 decCard voz: la miniatura del posteo del pedido lleva data-ver',
      voz.includes('data-ver data-ver-post="11"') && voz.includes('data-ver-uid="316"'));
  }
}

// ---------------------------------------------------------------------
seccion('C · las funciones del visor reales (abrir / navegar / cerrar)');
async function seccionC() {
  let f = null;
  try {
    f = cargarBundle(js, ['esc', 'regVisorFallback', 'visorItemsDe', 'visorPintar', 'abrirVisor', 'cerrarVisor', 'visorIrA', 'onVerThumb']);
  } catch (e) { t('C0 las funciones del visor extraen y compilan', false, e.message); }
  if (!f) return;
  const tick = () => new Promise((r) => setImmediate(r));

  t('C1 visorItemsDe foto: una sola imagen', JSON.stringify(f.visorItemsDe({ media_type: 'image', image_url: 'http://x/f.jpg' }))
    === JSON.stringify([{ tipo: 'img', src: 'http://x/f.jpg' }]));
  t('C2 visorItemsDe carrusel: las láminas en orden', JSON.stringify(f.visorItemsDe({ media_type: 'carousel', slides: ['a', 'b', 'c'], image_url: 'a' }))
    === JSON.stringify([{ tipo: 'img', src: 'a' }, { tipo: 'img', src: 'b' }, { tipo: 'img', src: 'c' }]));
  t('C3 visorItemsDe video: el reproducible con su póster', JSON.stringify(f.visorItemsDe({ media_type: 'reel', video_url: 'http://x/v.mp4', image_url: 'http://x/v.mp4', poster_url: 'http://x/p.jpg' }))
    === JSON.stringify([{ tipo: 'video', src: 'http://x/v.mp4', poster: 'http://x/p.jpg' }]));
  t('C4 visorItemsDe respaldo de tile de feed (img=mp4): video por «img», jamás al revés',
    JSON.stringify(f.visorItemsDe({ media_type: 'video', img: 'http://x/v.mp4', poster_url: 'http://x/p.jpg' }))
    === JSON.stringify([{ tipo: 'video', src: 'http://x/v.mp4', poster: 'http://x/p.jpg' }])
    && f.visorItemsDe({}).length === 0);

  // Apertura directa (tile del Instagram del cliente).
  const elDir = { getAttribute: (a) => (a === 'data-ver-img' ? 'http://ig/foto.jpg' : null) };
  f.onVerThumb(elDir);
  t('C5 apertura directa: abre con la imagen, sin pedir al endpoint',
    f.__visor().abierto && f.__visor().items.length === 1 && f.__visor().items[0].src === 'http://ig/foto.jpg'
    && f.__apiCalls.length === 0 && f.__els.visor.classList.contains('open'));
  f.cerrarVisor();
  t('C6 cerrar: se cierra, la media sale del DOM y el scroll del body se libera',
    !f.__visor().abierto && f.__els.visorMedia.innerHTML === '' && f.__doc.body.style.overflow === '');

  // Navegación del carrusel con vueltas.
  f.abrirVisor([{ tipo: 'img', src: '1' }, { tipo: 'img', src: '2' }, { tipo: 'img', src: '3' }], 'cap');
  f.visorIrA(1);
  const enDos = f.__visor().idx === 1 && f.__els.visorCount.textContent === '2 / 3' && f.__els.visorMedia.innerHTML.includes('src="2"');
  f.visorIrA(3);
  const envuelve = f.__visor().idx === 0;
  f.visorIrA(-1);
  t('C7 navegación: avanza, cuenta «2 / 3», envuelve en los dos extremos',
    enDos && envuelve && f.__visor().idx === 2);
  f.cerrarVisor();

  // Apertura por posteo: respaldo primero, media completa después.
  const k = f.regVisorFallback({ media_type: 'image', image_url: 'http://x/respaldo.jpg', caption: 'respaldo' });
  const elPost = { getAttribute: (a) => (a === 'data-ver-fb' ? k : a === 'data-ver-post' ? '2' : a === 'data-ver-uid' ? '316' : null) };
  f.__setApi({ ok: true, media_type: 'carousel', slides: ['http://x/c1.jpg', 'http://x/c2.jpg'], caption: 'Caption entero' });
  f.onVerThumb(elPost);
  const abrioRespaldo = f.__visor().abierto && f.__visor().items.length === 1 && f.__visor().items[0].src === 'http://x/respaldo.jpg';
  await tick();
  t('C8 apertura por posteo: abre con el respaldo y la media completa lo reemplaza (endpoint con uid+post)',
    abrioRespaldo && f.__apiCalls.length === 1 && f.__apiCalls[0].includes('posteo-media?user_id=316&post_id=2')
    && f.__visor().items.length === 2 && f.__visor().caption === 'Caption entero');
  f.cerrarVisor();

  // Si el endpoint falla, queda el respaldo (nunca un hueco).
  const k2 = f.regVisorFallback({ media_type: 'video', image_url: 'http://x/v.mp4', poster_url: 'http://x/p.jpg', caption: 'vid' });
  const elPost2 = { getAttribute: (a) => (a === 'data-ver-fb' ? k2 : a === 'data-ver-post' ? '3' : a === 'data-ver-uid' ? '316' : null) };
  f.__setApi({ ok: false, error: 'posteo_no_encontrado' });
  f.onVerThumb(elPost2);
  await tick();
  t('C9 endpoint en error: el visor queda abierto con el respaldo (el video, con póster)',
    f.__visor().abierto && f.__visor().items.length === 1 && f.__visor().items[0].tipo === 'video'
    && f.__els.visorMedia.innerHTML.includes('<video') && f.__els.visorMedia.innerHTML.includes('poster="http://x/p.jpg"'));
  f.cerrarVisor();
}

seccionC().then(() => {
  console.log('\nTOTAL :: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
}).catch((e) => { console.log('\nERROR :: ' + e.message); process.exit(1); });
