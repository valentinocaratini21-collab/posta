// test-lote-ads-feed-stories.js — LOTE ADS-FEED-STORIES (bug reportado por
// Valentino 7/11 ~16:58 con captura: «El feed en ads esta mal» / «No muestra
// los posteos del feed»).
// 1) Las stories publicadas se colaban en la grilla «Tu feed» del tab Ads:
//    /api/ads/billetera/feed y feedParaAds filtraban solo por status +
//    ig_media_id, sin media_type. En producción (user 12) entraban las
//    stories 553, 412, 405 y 108 — la misma imagen dos veces, tiles
//    absurdos para impulsar («MIRÁ EL ÚLTIMO POST») y el contador en 15.
//    El mismo hueco estaba en /elegibles y /buscar (mismo criterio).
// 2) El recorte cuadrado (aspect-ratio 1/1 + object-fit:cover) cortaba los
//    titulares de las imágenes 4:5 en la grilla y en el destacado.
// La grilla muestra la imagen ENTERA (contain, fondo neutro), solo posteos
// del feed (sin stories), y el contador cuenta solo lo que se muestra.
// NO se toca: billetera, carga automática, flujo impulsar, destacado de hoy.
// Base v762. Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-feed-stories.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');
const ab = require(path.join(__dirname, 'ads-billetera.js'));

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const ana = fs.readFileSync(path.join(DIR, 'public/chunk-analisis.js'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const abSrc = fs.readFileSync(path.join(DIR, 'ads-billetera.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const runVm = (prelude, code) => {
  const ctx = vm.createContext({
    console,
    anaT: (es) => es,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { getElementById: () => null },
    api: { post: async () => ({ ok: true }), get: async () => ({ ok: true }) },
  });
  vm.runInContext(prelude + '\n' + code, ctx);
  return ctx.__out;
};

// ---------- 0. Base v763 ----------
console.log('— 0) base v763 —');
check('base: BUILD v763', srv.includes("const BUILD_ID = '20261105-v763'"));
check('base: CHUNK_V v760 (este lote no toca app.js)', fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8').includes("const CHUNK_V = '20261105-v760'"));

// ---------- A. Módulo: feedParaAds / elegiblesParaAds sin stories ----------
console.log('— A) módulo: stories fuera, feed entero dentro —');
const rows = [
  { id: 1, status: 'published', ig_media_id: 'm1', image_path: '/f1.jpg', caption: 'Posteo imagen', published_at: '2026-11-07T17:00:00', media_type: 'image' },
  { id: 2, status: 'published', ig_media_id: 'm2', image_path: '/f2.jpg', caption: 'Posteo video', published_at: '2026-11-06T17:00:00', media_type: 'video' },
  { id: 3, status: 'published', ig_media_id: 'm3', image_path: '/f3.jpg', caption: 'Posteo carrusel', published_at: '2026-11-05T17:00:00', media_type: 'carousel' },
  { id: 4, status: 'published', ig_media_id: 'm4', image_path: '/f4.jpg', caption: 'Story publicada', published_at: '2026-11-07T12:00:00', media_type: 'story' },
  { id: 5, status: 'draft', ig_media_id: 'm5', image_path: '/f5.jpg', caption: 'Story borrador', published_at: null, media_type: 'story' },
  { id: 6, status: 'published', ig_media_id: '', image_path: '/f6.jpg', caption: 'Sin ig', published_at: '2026-11-03T17:00:00', media_type: 'image' },
  { id: 7, status: 'published', ig_media_id: 'm7', image_path: '/f7.jpg', caption: 'Legado sin media_type', published_at: '2026-11-04T17:00:00' },
  { id: 8, status: 'published', ig_media_id: 'm8', image_path: '/f8.jpg', caption: 'Con pauta activa', published_at: '2026-11-02T17:00:00', media_type: 'image' },
];
const impulsados = new Set([8]);
const feed = ab.feedParaAds(rows, impulsados);
check('A1 feed trae 5 (imagen+video+carrusel+legado+con pauta; story fuera)', feed.length === 5, 'n=' + feed.length);
check('A2 la story publicada con ig NO entra en el feed', !feed.some((p) => p.post_id === 4));
check('A3 video y carrusel del feed SÍ entran', feed.some((p) => p.post_id === 2) && feed.some((p) => p.post_id === 3));
check('A4 fila sin media_type (legado) sigue entrando', feed.some((p) => p.post_id === 7));
check('A5 orden desc por publicado_en (el más nuevo primero)', feed[0].post_id === 1 && feed[feed.length - 1].post_id === 8, JSON.stringify(feed.map((p) => p.post_id)));
check('A6 ya_impulsado se preserva (8 sí, resto no)', feed.find((p) => p.post_id === 8).ya_impulsado === true && feed.filter((p) => p.post_id !== 8).every((p) => p.ya_impulsado === false));
check('A7 forma del feed (post_id + image_path + caption + publicado_en + ya_impulsado)', feed.every((p) => typeof p.post_id === 'number' && typeof p.image_path === 'string' && typeof p.publicado_en === 'string' && typeof p.ya_impulsado === 'boolean'));
const elig = ab.elegiblesParaAds(rows, 1, impulsados);
check('E1 elegibles: la story publicada con ig NO entra', !elig.some((p) => p.post_id === 4));
check('E2 elegibles: imagen+video+carrusel+legado SÍ entran', [1, 2, 3, 7].every((id) => elig.some((p) => p.post_id === id)));
check('E3 elegibles: el recomendado va primero', elig.length > 0 && elig[0].post_id === 1 && elig[0].recomendado === true, JSON.stringify(elig.map((p) => p.post_id)));
check('E4 elegibles: el ya impulsado activo NO se ofrece', !elig.some((p) => p.post_id === 8));
check('E5 elegibles: forma del picker (post_id + recomendado + saves)', elig.every((p) => typeof p.post_id === 'number' && typeof p.recomendado === 'boolean' && typeof p.saves === 'number'));

// ---------- B. Estático: el SQL de los 3 endpoints excluye stories ----------
console.log('— B) estático: SQL sin stories en feed/elegibles/buscar —');
const blkFeed = sliceFn(srv, "app.get('/api/ads/billetera/feed'", "app.get('/api/ads/billetera/elegibles'");
const blkElig = sliceFn(srv, "app.get('/api/ads/billetera/elegibles'", "app.get('/api/ads/billetera/buscar'");
const blkBusc = sliceFn(srv, "app.get('/api/ads/billetera/buscar'", "app.get('/api/ads/billetera/hoy'");
check('B1 /feed excluye stories en el SQL', blkFeed.includes("media_type != 'story'"));
check('B2 /elegibles excluye stories en el SQL', blkElig.includes("media_type != 'story'"));
check('B3 /buscar excluye stories en el SQL', blkBusc.includes("media_type != 'story'"));
check('B4 /feed SELECT trae p.media_type (defensa en profundidad del módulo)', blkFeed.includes('p.media_type'));
check('B5 /elegibles y /buscar SELECT traen p.media_type', blkElig.includes('p.media_type') && blkBusc.includes('p.media_type'));
check('B6 feedParaAds filtra media_type en el módulo', sliceFn(abSrc, 'function feedParaAds(', 'function getAutoTopup(').includes("media_type !== 'story'"));
check('B7 elegiblesParaAds filtra media_type en el módulo', sliceFn(abSrc, 'function elegiblesParaAds(', 'function feedParaAds(').includes("media_type !== 'story'"));
check('B8 /hoy intacto (el destacado de hoy no se toca)', srv.includes("app.get('/api/ads/billetera/hoy'") && blkBusc.includes("app.get('/api/ads/billetera/hoy'") === false);

// ---------- C. VM: la grilla muestra la imagen entera ----------
console.log('— C) VM: grilla con imagen entera + contador correcto —');
const srcFeed = sliceFn(ana, 'function anaAdsFeedHTML()', 'function anaAdsTabHTML()');
const srcDirecto = sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()');
const srcCortar = sliceFn(ana, 'function anaCortarCaption(', 'function anaBilleteraPickerRow(');
const srcConstruir = sliceFn(ana, 'function anaBilleteraConstruirDatos(', 'async function anaBilleteraTabDatos(');
const srcHistorial = sliceFn(ana, 'function anaBilleteraHistorialHTML()', 'function anaBilleteraHistorialPintar()');
check('C0 funciones extraídas del chunk', srcFeed.length > 300 && srcDirecto.length > 500 && srcCortar.length > 50 && srcConstruir.length > 100 && srcHistorial.length > 100,
  [srcFeed.length, srcDirecto.length, srcCortar.length, srcConstruir.length, srcHistorial.length].join('/'));
const datosFeed = {
  feed: [
    { post_id: 519, caption: 'Posteo imagen 4:5', image_path: '/519.jpg', ya_impulsado: false },
    { post_id: 518, caption: 'Posteo video', image_path: '/518.jpg', ya_impulsado: true },
    { post_id: 517, caption: 'Posteo carrusel', image_path: '/517.jpg', ya_impulsado: false },
    { post_id: 516, caption: 'Posteo viejo', image_path: '/516.jpg', ya_impulsado: false },
  ],
  hoy: { post_id: 521, caption: 'El posteo de hoy', image_path: '/hoy.jpg', hora: '17:00' },
  selId: 521,
};
const hFeed = runVm(srcFeed + '\nlet anaBilleteraDatos = ' + JSON.stringify(datosFeed) + ';\n', '__out = anaAdsFeedHTML();');
check('C1 la grilla renderiza (5 tiles: hoy + 4 del feed)', typeof hFeed === 'string' && hFeed.length > 500, String(hFeed && hFeed.length));
check('C2 la grilla muestra la imagen ENTERA (object-fit:contain)', hFeed.includes('object-fit:contain'));
check('C3 la grilla NO recorta (cero object-fit:cover en las celdas)', !hFeed.includes('object-fit:cover'), (hFeed.match(/object-fit:cover/g) || []).length + ' cover');
check('C4 el contador cuenta solo lo que se muestra (5 posteos)', hFeed.includes('5 posteos'), (hFeed.match(/\d+ posteos/) || ['?'])[0]);
check('C5 la elegida (hoy 521) lleva borde amarillo + tilde verde', hFeed.includes('box-shadow:inset 0 0 0 3px #FEC14D') && hFeed.includes('>✓<'));
check('C6 chip «Sale hoy · 17:00» en la elegida', hFeed.includes('Sale hoy · 17:00'));
check('C7 el ya impulsado lleva chip «Con ads»', hFeed.includes('Con ads'));
check('C8 las 4 fotos del feed están en la grilla', ['/519.jpg', '/518.jpg', '/517.jpg', '/516.jpg'].every((u) => hFeed.includes(u)));
check('C9 la grilla sigue siendo de 3 columnas', srcFeed.includes('repeat(3,1fr)'));
check('C10 el destacado (vista principal) también muestra la imagen entera', srcDirecto.includes('object-fit:contain') && !srcDirecto.includes('object-fit:cover'));

// ---------- D. SQL en memoria: el WHERE que usan los endpoints ----------
console.log('— D) SQL en memoria: feed/elegibles/buscar sin stories —');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, image_path TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', published_at TEXT, ig_media_id TEXT DEFAULT '', media_type TEXT DEFAULT 'image', week_key TEXT);
CREATE TABLE post_metrics (post_id INTEGER PRIMARY KEY, reach INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, saved INTEGER DEFAULT 0);`);
const ins = db.prepare('INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_media_id, media_type) VALUES (?,?,?,?,?,?,?)');
ins.run(7, '/f1.jpg', 'Estadio lleno, ¿te imaginás tener 3 días gratis?', 'published', '2026-11-07T17:00:00', 'ig_1', 'image');
ins.run(7, '/f2.jpg', 'Reel del café', 'published', '2026-11-06T17:00:00', 'ig_2', 'video');
ins.run(7, '/f3.jpg', 'Carrusel de medialunas', 'published', '2026-11-05T17:00:00', 'ig_3', 'carousel');
ins.run(7, '/f4.jpg', 'Posteo viejo', 'published', '2026-11-04T17:00:00', 'ig_4', 'image');
ins.run(7, '/f5.jpg', 'Estadio lleno story ¿te imaginás...?', 'published', '2026-11-07T12:00:00', 'ig_5', 'story');
ins.run(7, '/f6.jpg', 'Story borrador', 'draft', null, 'ig_6', 'story');
ins.run(7, '/f7.jpg', 'Borrador feed', 'draft', null, 'ig_7', 'image');
ins.run(7, '/f8.jpg', 'Sin ig', 'published', '2026-11-03T17:00:00', '', 'image');
const qFeed = db.prepare(`SELECT p.id, p.image_path, p.caption, p.status, p.published_at, p.ig_media_id, p.media_type FROM posts p WHERE p.user_id = ? AND p.status = 'published' AND p.ig_media_id IS NOT NULL AND p.ig_media_id != '' AND p.media_type != 'story' ORDER BY p.published_at DESC`).all(7);
check('D1 /feed SQL: 4 posteos del feed, en orden desc', JSON.stringify(qFeed.map((r) => r.id)) === '[1,2,3,4]', JSON.stringify(qFeed.map((r) => r.id)));
check('D2 /feed SQL: ninguna story', qFeed.every((r) => r.media_type !== 'story'));
const qElig = db.prepare(`SELECT p.id, p.image_path, p.caption, p.ig_media_id, p.status, p.week_key, COALESCE(m.reach,0) AS reach, COALESCE(m.likes,0) AS likes, COALESCE(m.comments,0) AS comments, COALESCE(m.saved,0) AS saved, p.media_type FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id WHERE p.user_id = ? AND p.status = 'published' AND p.ig_media_id IS NOT NULL AND p.ig_media_id != '' AND p.media_type != 'story' ORDER BY p.published_at DESC LIMIT 20`).all(7);
check('D3 /elegibles SQL: mismos 4, sin stories', JSON.stringify(qElig.map((r) => r.id)) === '[1,2,3,4]', JSON.stringify(qElig.map((r) => r.id)));
const qBusc = db.prepare(`SELECT p.id, p.image_path, p.caption, p.ig_media_id, p.status, p.week_key, COALESCE(m.reach,0) AS reach, COALESCE(m.likes,0) AS likes, COALESCE(m.comments,0) AS comments, COALESCE(m.saved,0) AS saved, p.media_type FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id WHERE p.user_id = ? AND p.status = 'published' AND p.ig_media_id IS NOT NULL AND p.ig_media_id != '' AND p.media_type != 'story' AND p.caption LIKE '%' || ? || '%' ESCAPE '\\' ORDER BY p.published_at DESC LIMIT 20`).all(7, 'estadio');
check('D4 /buscar SQL: «estadio» trae solo el posteo del feed (la story con el mismo texto NO)', JSON.stringify(qBusc.map((r) => r.id)) === '[1]', JSON.stringify(qBusc.map((r) => r.id)));
db.close();

console.log(`\ntest-lote-ads-feed-stories: ${pass}/${pass + fail} ok`);
if (fail) { console.log('fallos:', fails.join(' | ')); process.exit(1); }
