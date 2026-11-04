// TEST LOTE PUBLICADOS-3 — extrae código REAL (sin reescrituras):
//  - parseEmbedPosts + helpers de feed-audit.js
//  - isTopLevelReadPost de feed-reconcile.js
//  - homeGridCompose + hfFeedSortKey + hfCmpDescKey + hfIgShortcode de public/app.js
//  - reglas de public/styles.css
// Uso: node test-lotepublicados3.js [árbol]  (sin argumento usa ./work)
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'work');
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function extractFn(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('no hallado: ' + sig);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}
function extractFnUntil(src, sig, nextSig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('no hallado: ' + sig);
  const j = src.indexOf(nextSig, i + sig.length);
  if (j < 0) throw new Error('no hallado siguiente: ' + nextSig);
  return src.slice(i, j);
}
function extractBlock(src, startMark, endMark) {
  const i = src.indexOf(startMark);
  if (i < 0) throw new Error('no hallado: ' + startMark);
  const j = endMark ? src.indexOf(endMark, i) : src.length;
  if (j < 0) throw new Error('no hallado fin: ' + endMark);
  return src.slice(i, j);
}

// ---------- Código real ----------
const faSrc = fs.readFileSync(path.join(ROOT, 'feed-audit.js'), 'utf8');
const frSrc = fs.readFileSync(path.join(ROOT, 'feed-reconcile.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
let bundle = '';
bundle += extractBlock(faSrc, 'const CAPTION_RESIDUE_CUTS', 'function cleanCaptionResidue') + '\n';
bundle += extractFn(faSrc, 'function cleanCaptionResidue') + '\n';
bundle += extractFn(faSrc, 'function decodeCaption') + '\n';
bundle += faSrc.slice(faSrc.indexOf('const MAX_POSTS'), faSrc.indexOf('\n', faSrc.indexOf('const MAX_POSTS')) + 1) + '\n';
bundle += extractFnUntil(faSrc, 'function parseEmbedPosts', '\nfunction parseProfilePageVerified') + '\n';
bundle += extractFn(frSrc, 'function isTopLevelReadPost') + '\n';
bundle += extractFn(appSrc, 'function hfFeedSortKey') + '\n';
bundle += extractFn(appSrc, 'function hfCmpDescKey') + '\n';
bundle += extractFn(appSrc, 'function hfIgShortcode') + '\n';
bundle += extractFn(appSrc, 'function homeGridCompose') + '\n';
eval(bundle);
// Stubs solo para ramas que el fixture no toca (tiles post/ymd):
if (typeof pcParseDate === 'undefined') pcParseDate = (s) => { const d = new Date(s); return isNaN(d) ? null : d; };
if (typeof schedYmdToDate === 'undefined') schedYmdToDate = () => null;

// ---------- Fixture embed (caso real 4/11) ----------
function postNode(type, o) {
  let s = '{\\"__typename\\":\\"' + type + '\\"';
  if (o.shortcode) s += ',\\"shortcode\\":\\"' + o.shortcode + '\\"';
  if (o.display_url) s += ',\\"display_url\\":\\"' + o.display_url + '\\"';
  if (o.taken_at) s += ',\\"taken_at_timestamp\\":' + o.taken_at;
  if (o.caption) s += ',\\"edge_media_to_caption\\":{\\"edges\\":[{\\"node\\":{\\"text\\":\\"' + o.caption + '\\"}}]}';
  if (o.comments != null) s += ',\\"edge_media_to_comment\\":{\\"count\\":' + o.comments + '}';
  if (o.likes != null) s += ',\\"edge_liked_by\\":{\\"count\\":' + o.likes + '}';
  if (o.children) {
    s += ',\\"edge_sidecar_to_children\\":{\\"edges\\":[';
    s += o.children.map((c) => '{\\"node\\":{\\"__typename\\":\\"GraphImage\\",\\"display_url\\":\\"' + c + '\\"}}').join(',');
    s += ']}';
  }
  return s + '}';
}
const TS = (s) => Math.floor(new Date(s).getTime() / 1000);
const html =
  '<html><body>' +
  postNode('GraphImage', { shortcode: 'DfRt0axD0G0', display_url: 'https://cdn/photo.jpg', taken_at: TS('2026-11-03T03:01:00Z'), caption: 'Hay cafés que no se llenan por el café.', comments: 3, likes: 40 }) +
  postNode('GraphVideo', { shortcode: 'DfRsxGrSssF', display_url: 'https://cdn/reel.jpg', taken_at: TS('2026-11-03T02:46:00Z'), caption: 'Un café, en movimiento.', comments: 2, likes: 30 }) +
  postNode('GraphSidecar', { shortcode: 'DfRrm2Vj8Qa', display_url: 'https://cdn/cover.jpg', taken_at: TS('2026-11-03T02:36:00Z'), caption: 'Una semana entera, sin repetir una idea.', comments: 5, likes: 50,
    children: ['https://cdn/lun.jpg', 'https://cdn/mar.jpg', 'https://cdn/mie.jpg', 'https://cdn/jue.jpg', 'https://cdn/vie-brunch.jpg'] }) +
  postNode('GraphImage', { shortcode: 'DfOBymGj4q9', display_url: 'https://cdn/111.jpg', taken_at: TS('2026-11-01T16:33:00Z'), caption: 'Hay posteos que se notan genéricos a la legua.', comments: 4, likes: 60 }) +
  postNode('GraphImage', { shortcode: 'DfKJgUQj3y-', display_url: 'https://cdn/3110.jpg', taken_at: TS('2026-10-31T05:23:00Z'), caption: 'Un comentario sin responder es un cliente que se va.', comments: 1, likes: 20 }) +
  postNode('GraphImage', { shortcode: 'DfIad5HDw8z', display_url: 'https://cdn/3010.jpg', taken_at: TS('2026-10-30T15:00:00Z'), caption: 'Hay reseñas que te hacen el día.', comments: 0, likes: 15 }) +
  postNode('GraphImage', { shortcode: 'DfFQNY4D_Yt', display_url: 'https://cdn/2910.jpg', taken_at: TS('2026-10-29T12:00:00Z'), caption: 'Una herramienta te da trabajo', comments: 6, likes: 70 }) +
  '</body></html>';

// ---------- 1. Parser: hijos jamás heredan identidad ----------
const posts = parseEmbedPosts(html);
const tops = posts.filter(isTopLevelReadPost);
const bySc = (sc) => tops.find((p) => p.shortcode === sc);
ok(tops.length === 7, 'parser: 7 top-level exactos (5 hijos fuera)', 'hay ' + tops.length);
ok(tops.map((p) => p.shortcode).join(',') === 'DfRt0axD0G0,DfRsxGrSssF,DfRrm2Vj8Qa,DfOBymGj4q9,DfKJgUQj3y-,DfIad5HDw8z,DfFQNY4D_Yt',
  'parser: orden top-level = IG real', tops.map((p) => p.shortcode).join(','));
const car = bySc('DfRrm2Vj8Qa');
ok(!!car && car.type === 'GraphSidecar' && car.thumb === 'https://cdn/cover.jpg' && car.taken_at === TS('2026-11-03T02:36:00Z') && car.caption.indexOf('Una semana entera') === 0,
  'parser: carrusel padre intacto (portada, fecha, caption propios)');
ok(!!car && car.likes === 50 && car.comments === 5, 'parser: carrusel conserva likes/comments (ventana completa)');
const p111 = bySc('DfOBymGj4q9');
ok(!!p111 && p111.thumb === 'https://cdn/111.jpg' && p111.taken_at === TS('2026-11-01T16:33:00Z'),
  'parser: 1/11 real presente con SU foto y SU fecha (no Frankenstein)');
ok(!tops.some((p) => (p.thumb || '').includes('vie-brunch') || (p.thumb || '').includes('lun.jpg')),
  'parser: ninguna lámina hija llega a top-level');
const children = posts.filter((p) => !isTopLevelReadPost(p));
ok(children.length === 5 && children.every((p) => p.taken_at == null && !p.caption && !p.shortcode),
  'parser: las 5 hijas quedan sin identidad (fecha/caption/shortcode null)', 'hijas: ' + children.length);

// ---------- 2. Grilla: 6 exactos en orden, 29/10 fuera por regla ----------
// Recents como los entrega el snapshot tras el fix (top-level con taken_at):
function recent(sc, img, type, ts) { return { img, type, taken_at: ts, shortcode: sc }; }
const recentsNew = [
  recent('DfRt0axD0G0', '/media/photo.jpg', 'image', TS('2026-11-03T03:01:00Z')),
  recent('DfRsxGrSssF', '/media/reel.jpg', 'video', TS('2026-11-03T02:46:00Z')),
  recent('DfRrm2Vj8Qa', '/media/cover.jpg', 'carousel', TS('2026-11-03T02:36:00Z')),
  recent('DfOBymGj4q9', '/media/111.jpg', 'image', TS('2026-11-01T16:33:00Z')),
  recent('DfKJgUQj3y-', '/media/3110.jpg', 'image', TS('2026-10-31T05:23:00Z')),
  recent('DfIad5HDw8z', '/media/3010.jpg', 'image', TS('2026-10-30T15:00:00Z')),
  recent('DfFQNY4D_Yt', '/media/2910.jpg', 'image', TS('2026-10-29T12:00:00Z')),
];
const tilesNew = homeGridCompose({ upcoming: [], published: [], recents: recentsNew });
const pubsNew = tilesNew.filter((t) => t.kind === 'ig').map((t) => t.img);
ok(pubsNew.join(',') === '/media/photo.jpg,/media/reel.jpg,/media/cover.jpg,/media/111.jpg,/media/3110.jpg,/media/3010.jpg',
  'grilla nueva: 6 exactos en orden IG (foto, reel, carrusel, 1/11, 31/10, 30/10)', pubsNew.join(','));
ok(!pubsNew.some((x) => x.includes('2910')), 'grilla nueva: 29/10 fuera por ser 7º (regla últimos 6, no bug)');
// Control: con el snapshot VIEJO (hija Frankenstein + sin 1/11) la grilla
// reproduce el bug en vivo — el test detecta el bug, no es tautológico.
const recentsOld = [
  recent('DfRt0axD0G0', '/media/photo.jpg', 'image', TS('2026-11-03T03:01:00Z')),
  recent('DfRsxGrSssF', '/media/reel.jpg', 'video', TS('2026-11-03T02:46:00Z')),
  recent('DfRrm2Vj8Qa', '/media/cover.jpg', 'carousel', TS('2026-11-03T02:36:00Z')),
  recent('DfOBymGj4q9', '/media/vie-brunch.jpg', 'image', TS('2026-11-01T16:33:00Z')),
  recent('DfKJgUQj3y-', '/media/3110.jpg', 'image', TS('2026-10-31T05:23:00Z')),
  recent('DfIad5HDw8z', '/media/3010.jpg', 'image', TS('2026-10-30T15:00:00Z')),
  recent('DfFQNY4D_Yt', '/media/2910.jpg', 'image', TS('2026-10-29T12:00:00Z')),
];
const pubsOld = homeGridCompose({ upcoming: [], published: [], recents: recentsOld }).filter((t) => t.kind === 'ig').map((t) => t.img);
ok(pubsOld.join(',') === '/media/photo.jpg,/media/reel.jpg,/media/cover.jpg,/media/vie-brunch.jpg,/media/3110.jpg,/media/3010.jpg',
  'control: snapshot viejo reproduce el bug en vivo (intrusa 4ª, 1/11 fuera)', pubsOld.join(','));
// Posición 3 intacta en ambos: carrusel.
ok(pubsNew[2] === '/media/cover.jpg' && pubsOld[2] === '/media/cover.jpg', 'posición 3 = carrusel en ambos (no se rompe lo verificado)');

// ---------- 3. Estilos: oscuritas, no gris ----------
ok(!/#inicioView\s+\.hf-tile\.pub\s+img\s*\{\s*filter\s*:\s*grayscale\(1\)\s*\}/.test(css),
  'styles: regla grayscale v624 eliminada');
ok(/\.hf-tile\.pub\s+img\s*,\s*\.hf-tile\.pub\s+video\s*\{\s*filter\s*:\s*brightness\(\.58\)\s*saturate\(\.85\)\s*\}/.test(css),
  'styles: regla oscurita v623 presente (brightness .58 saturate .85)');
ok(/\.fp-tile\.pub\s+img\s*,\s*\.fp-tile\.pub\s+video\s*\{\s*filter\s*:\s*brightness\(\.58\)\s*saturate\(\.85\)\s*\}/.test(css),
  'styles: .fp-tile.pub intacto (lo que v624 no cambió, no se cambia)');

// ---------- 4. Guardas de alcance ----------
ok(appSrc.includes('pzHeadCollapseEcho'), 'alcance: guard pzHeadCollapseEcho v623 intacto en app.js');

console.log('\nTOTAL: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
