// test-lote-adopcion-sana-medio.js — LOTE ADOPCIÓN QUE SANA EL MEDIO
// (v1119; diagnóstico verificado del video negro de la 691).
//
// El defecto: adoptarRecienteIg creaba la fila adoptada con una imagen
// quieta en image_path aunque el medio fuera video (primera opción: la
// miniatura del snapshot) y dejaba cover_path vacío — rompiendo el
// invariante del sistema (en las filas video, image_path guarda el
// video reproducible) — y hfDetailHTML emitía <video src="…jpg"> sin
// póster: el rectángulo negro exacto de la captura de Valentino.
//
// El lote, ejercitado acá contra el código real:
//   A · feedAudit.localizeIgVideo — la tubería que baja el mp4 a
//       /media (nombre determinístico por id del medio) y localiza la
//       portada; nunca lanza; host de la CDN de Meta o nada.
//   B · adoptarRecienteIg (extraída de server.js) — la adopción nueva
//       de un video guarda mp4 local + portada · la rama idempotente
//       CURA la fila ya adoptada con quieta (el fixture de la 691) ·
//       la fila sana no se toca ni gasta llamada · sin descarga, la
//       fila nace como nacía (con su portada de póster) · la imagen
//       adoptada queda byte-idéntica en comportamiento.
//   C · hfDetailHTML (extraída de public/app.js) — el fixture de la
//       fila video adoptada SANA (mp4 + cover) renderiza <video> con
//       póster · el fixture de la fila con QUIETA cae al póster con
//       insignia de reproducción y salida a su permalink, jamás un
//       <video> muerto · la foto de siempre, intacta.
//   D · pines estáticos: stamps (BUILD v1119 · PZ_BUILD v1119 ·
//       app.js?v=756 solo en el index ES) y ganchos del lote.
//
// Uso: node test-lote-adopcion-sana-medio.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- extractor de funciones por balanceo de llaves ----------
function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  if (start < 0) return null;
  if (start >= 6 && src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('{', start);
  if (i < 0) return null;
  let depth = 0;
  let mode = 'code';
  const tplDepth = [];
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (mode === 'line') { if (c === '\n') mode = 'code'; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i++; } continue; }
    if (mode === 'sq') { if (c === '\\') { i++; continue; } if (c === "'") mode = 'code'; continue; }
    if (mode === 'dq') { if (c === '\\') { i++; continue; } if (c === '"') mode = 'code'; continue; }
    if (mode === 'tpl') {
      if (c === '\\') { i++; continue; }
      if (c === '`') { mode = 'code'; continue; }
      if (c === '$' && n === '{') { tplDepth.push(depth); depth++; mode = 'code'; i++; continue; }
      continue;
    }
    if (c === '/' && n === '/') { mode = 'line'; i++; continue; }
    if (c === '/' && n === '*') { mode = 'block'; i++; continue; }
    if (c === "'") { mode = 'sq'; continue; }
    if (c === '"') { mode = 'dq'; continue; }
    if (c === '`') { mode = 'tpl'; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') {
      depth--;
      if (tplDepth.length && depth === tplDepth[tplDepth.length - 1]) { tplDepth.pop(); mode = 'tpl'; continue; }
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

const ROOT = __dirname;
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

async function main() {
  // ================= A · localizeIgVideo (módulo real) =================
  console.log('A · feedAudit.localizeIgVideo');
  let feedAudit = null;
  try { feedAudit = require('./feed-audit'); } catch (e) { feedAudit = null; }
  check('feed-audit carga y exporta localizeIgVideo', !!feedAudit && typeof feedAudit.localizeIgVideo === 'function');
  if (feedAudit && typeof feedAudit.localizeIgVideo === 'function') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-media-'));
    const VID = 'https://video.cdninstagram.com/v/t50.2886-16/reel.mp4?efg=firmada';
    const THUMB = 'https://scontent.cdninstagram.com/v/t51.82787-15/thumb.jpg?efg=firmada';
    let videoFetches = 0;
    const fakeFetch = async (url) => {
      if (url === VID) { videoFetches++; return Buffer.alloc(20480, 7); }
      if (url === THUMB) return Buffer.alloc(2048, 3);
      throw new Error('url inesperada: ' + url);
    };
    const loc = await feedAudit.localizeIgVideo(VID, THUMB, '18134182399868716', dir, fakeFetch);
    check('video localizado con nombre determinístico igvideo-<hash>.mp4', !!loc.video && /^\/media\/igvideo-[0-9a-f]{24}\.mp4$/.test(loc.video), JSON.stringify(loc));
    check('el mp4 quedó en disco con los bytes bajados', !!loc.video && fs.existsSync(path.join(dir, path.basename(loc.video))) && fs.statSync(path.join(dir, path.basename(loc.video))).size === 20480);
    check('portada localizada por la tubería igthumb', !!loc.cover && /^\/media\/igthumb-[0-9a-f]{24}\.jpg$/.test(loc.cover), JSON.stringify(loc));
    const loc2 = await feedAudit.localizeIgVideo(VID, THUMB, '18134182399868716', dir, fakeFetch);
    check('segunda pasada reusa el archivo (sin re-descargar)', loc2.video === loc.video && videoFetches === 1, `fetches=${videoFetches}`);
    const locLocal = await feedAudit.localizeIgVideo(VID, '/media/igthumb-ya-local.jpg', 'otro-id', dir, fakeFetch);
    check('portada ya local pasa tal cual, sin tocar la red', locLocal.cover === '/media/igthumb-ya-local.jpg');
    const locHost = await feedAudit.localizeIgVideo('https://evil.example.com/reel.mp4', '', 'x', dir, fakeFetch);
    check('host fuera de la CDN de Meta: no baja nada', locHost.video === null);
    const locFail = await feedAudit.localizeIgVideo(VID, 'https://scontent.cdninstagram.com/v/t51/thumb-nueva.jpg?efg=z', 'id-que-falla', dir, async () => { throw new Error('red caída'); });
    check('descarga caída: devuelve nulls y NUNCA lanza', locFail.video === null && locFail.cover === null);
  }

  // ================= B · adoptarRecienteIg (extraída) =================
  console.log('B · adoptarRecienteIg');
  const helperSrc = extractFn(serverSrc, 'adoptMedioEsVideo');
  const adoptSrc = extractFn(serverSrc, 'adoptarRecienteIg');
  check('adoptarRecienteIg y su guarda adoptMedioEsVideo existen en server.js', !!adoptSrc && !!helperSrc);
  if (adoptSrc && helperSrc) {
    const THUMB_LOCAL = '/media/igthumb-08d8d374476fc83e0000ad2f.jpg';
    const REEL = {
      id: '18134182399868716', media_type: 'VIDEO',
      media_url: 'https://video.cdninstagram.com/v/t50/reel.mp4?efg=x',
      thumbnail_url: 'https://scontent.cdninstagram.com/v/t51/thumb.jpg?efg=x',
      permalink: 'https://www.instagram.com/reel/DfvcZxJBoxS/',
      caption: 'el reel del sábado', timestamp: '2026-11-14T19:00:00.000Z',
    };
    const state = { media: [], fetchCalls: 0, loc: { video: '/media/igvideo-test.mp4', cover: null } };
    const requireStub = (p) => {
      if (p === './insights') return { fetchUserMedia: async () => { state.fetchCalls++; return state.media; } };
      throw new Error('require no stubbeado: ' + p);
    };
    const feedAuditStub = { localizeIgVideo: async () => state.loc };
    const factory = new Function('require', 'feedAudit', 'homeSnapshotGet', 'igShortcodeDePermalink', 'userTz', 'ymdInTz', 'mondayKeyOf', 'MEDIA_DIR',
      `${helperSrc}\n${adoptSrc}\nreturn adoptarRecienteIg;`);
    const adoptar = factory(
      requireStub, feedAuditStub,
      () => ({ payload: { recents: [{ shortcode: 'DfvcZxJBoxS', img: THUMB_LOCAL }] } }),
      (link) => { const m = /\/(?:reel|p)\/([^/?#]+)/.exec(String(link || '')); return m ? m[1] : ''; },
      () => 'America/New_York', () => '2026-11-14', () => '2026-11-09', '/tmp/adopt-suite-media');
    function freshDb() {
      const db = new DatabaseSync(':memory:');
      db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT, caption TEXT DEFAULT '', status TEXT, published_at TEXT, ig_media_id TEXT, ig_permalink TEXT, week_key TEXT, media_type TEXT, cover_path TEXT);`);
      return db;
    }
    const getRow = (db, mid) => db.prepare('SELECT * FROM posts WHERE user_id = 12 AND ig_media_id = ?').get(mid);

    // B1 · adopción nueva de un video, con descarga sana
    {
      const db = freshDb(); state.media = [REEL]; state.fetchCalls = 0; state.loc = { video: '/media/igvideo-test.mp4', cover: null };
      const r = await adoptar(db, 12, REEL.id);
      const row = getRow(db, REEL.id);
      check('B1 adopción nueva: ok con post_id', !!r.ok && !!row && r.post_id === row.id);
      check('B1 la fila video nace con el mp4 local en image_path', !!row && row.image_path === '/media/igvideo-test.mp4', row && row.image_path);
      check('B1 la portada queda cargada (la miniatura del snapshot)', !!row && row.cover_path === THUMB_LOCAL, row && row.cover_path);
      check('B1 media_type video y status published', !!row && row.media_type === 'video' && row.status === 'published');
    }
    // B2 · adopción nueva de un video, SIN descarga (cae al respaldo)
    {
      const db = freshDb(); state.media = [REEL]; state.loc = { video: null, cover: null };
      const r = await adoptar(db, 12, REEL.id);
      const row = getRow(db, REEL.id);
      check('B2 sin descarga: la fila nace como nacía, con su miniatura', !!r.ok && !!row && row.image_path === THUMB_LOCAL, row && row.image_path);
      check('B2 y su portada queda de póster (nunca negro en el detalle)', !!row && row.cover_path === THUMB_LOCAL, row && row.cover_path);
    }
    // B3 · LA CURA — el fixture de la 691: fila adoptada con quieta
    {
      const db = freshDb();
      db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, status, published_at, ig_media_id, ig_permalink, week_key, media_type, cover_path)
        VALUES (691, 12, ?, 'el reel del sábado', 'published', '2026-11-14T19:00:00.000Z', ?, ?, '2026-11-09', 'video', '')`).run(THUMB_LOCAL, REEL.id, REEL.permalink);
      state.media = [REEL]; state.loc = { video: '/media/igvideo-test.mp4', cover: null };
      const r = await adoptar(db, 12, REEL.id);
      const row = getRow(db, REEL.id);
      const n = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 12 AND ig_media_id = ?').get(REEL.id).n;
      check('B3 re-adoptar devuelve ya_existia + medio_curado', !!r.ok && r.ya_existia === true && r.medio_curado === true && r.post_id === 691, JSON.stringify(r));
      check('B3 la fila curada guarda el mp4 en image_path', !!row && row.image_path === '/media/igvideo-test.mp4', row && row.image_path);
      check('B3 la miniatura vieja queda como su portada', !!row && row.cover_path === THUMB_LOCAL, row && row.cover_path);
      check('B3 sin duplicar: sigue habiendo UNA fila del medio', n === 1, `n=${n}`);
    }
    // B4 · la fila sana no se toca (ni una llamada)
    {
      const db = freshDb();
      db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_media_id, ig_permalink, week_key, media_type, cover_path)
        VALUES (12, '/media/igvideo-sano.mp4', 'reel sano', 'published', '2026-11-14T19:00:00.000Z', ?, ?, '2026-11-09', 'video', '/media/igthumb-sano.jpg')`).run(REEL.id, REEL.permalink);
      state.media = [REEL]; state.fetchCalls = 0;
      const r = await adoptar(db, 12, REEL.id);
      const row = getRow(db, REEL.id);
      check('B4 fila sana: ya_existia sin medio_curado y sin llamar a IG', !!r.ok && r.ya_existia === true && !r.medio_curado && state.fetchCalls === 0, `fetchCalls=${state.fetchCalls}`);
      check('B4 la fila sana queda byte-idéntica', !!row && row.image_path === '/media/igvideo-sano.mp4' && row.cover_path === '/media/igthumb-sano.jpg');
    }
    // B5 · la adopción de una imagen no cambia
    {
      const db = freshDb();
      const FOTO = { id: '17999999999999999', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/v/t51/foto.jpg?efg=x', thumbnail_url: '', permalink: 'https://www.instagram.com/p/AbCdEfGh/', caption: 'una foto', timestamp: '2026-11-14T19:00:00.000Z' };
      state.media = [FOTO];
      const r = await adoptar(db, 12, FOTO.id);
      const row = getRow(db, FOTO.id);
      check('B5 imagen adoptada como siempre (media_url, sin portada)', !!r.ok && !!row && row.image_path === FOTO.media_url && row.media_type === 'image' && !row.cover_path, row && `${row.image_path} · ${row.cover_path}`);
    }
    // B6 · cura imposible (el medio ya no está en los recientes)
    {
      const db = freshDb();
      db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_media_id, ig_permalink, week_key, media_type, cover_path)
        VALUES (12, ?, 'reel viejo', 'published', '2026-11-14T19:00:00.000Z', ?, ?, '2026-11-09', 'video', '')`).run(THUMB_LOCAL, REEL.id, REEL.permalink);
      state.media = []; state.loc = { video: '/media/igvideo-test.mp4', cover: null };
      const r = await adoptar(db, 12, REEL.id);
      const row = getRow(db, REEL.id);
      check('B6 sin el medio en recientes: ya_existia honesto, fila intacta', !!r.ok && r.ya_existia === true && !r.medio_curado && !!row && row.image_path === THUMB_LOCAL);
    }
  }

  // ================= C · hfDetailHTML (extraída) =================
  console.log('C · hfDetailHTML');
  const coverSrc = extractFn(appSrc, 'hfCoverState');
  const esVideoSrc = extractFn(appSrc, 'hfEsArchivoVideo');
  const posterSrc = extractFn(appSrc, 'hfPosterVideoHTML');
  const detailSrc = extractFn(appSrc, 'hfDetailHTML');
  check('hfCoverState + hfEsArchivoVideo + hfPosterVideoHTML + hfDetailHTML existen en app.js', !!coverSrc && !!esVideoSrc && !!posterSrc && !!detailSrc);
  if (coverSrc && esVideoSrc && posterSrc && detailSrc) {
    const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const factory = new Function('esc', 'pzIc', 'hfCropOverlayHTML', 'pzIsPubReal', 'hfRelShort', 'hfChipText', 'hfRedoLeft', 'hfRedoLineHTML', 'rgLineHTML', 'HF_D_COMMENT', 'HF_D_SHARE', 'HF_D_SAVE', 'HF_D_SAVE_FULL',
      `${coverSrc}\n${esVideoSrc}\n${posterSrc}\n${detailSrc}\nreturn { hfDetailHTML, hfEsArchivoVideo };`);
    const { hfDetailHTML, hfEsArchivoVideo } = factory(
      escStub, () => '', () => '', () => false, () => '', () => '', () => null, () => '', () => '', '', '', '', '');
    check('C0 hfEsArchivoVideo: mp4/mov/webm son video', hfEsArchivoVideo('/media/igvideo-x.mp4') === true && hfEsArchivoVideo('/media/reel.mov') === true && hfEsArchivoVideo('https://cdn.example/v.webm?firma=1') === true);
    check('C0 hfEsArchivoVideo: jpg/png/URL firmada/vacío NO son video', hfEsArchivoVideo('/media/igthumb-x.jpg') === false && hfEsArchivoVideo('https://scontent.cdninstagram.com/thumb.jpg?efg=x') === false && hfEsArchivoVideo('') === false);
    // C1 · el fixture de la fila adoptada SANA (mp4 + cover)
    const sana = { id: 700, media_type: 'video', image_path: '/media/igvideo-x.mp4', cover_path: '/media/igthumb-x.jpg', caption: 'reel sano', status: 'published', ig_permalink: 'https://www.instagram.com/reel/SanoX/' };
    const hSana = hfDetailHTML(sana, {});
    check('C1 fila sana: renderiza <video> con su póster', hSana.includes('<video src="/media/igvideo-x.mp4" poster="/media/igthumb-x.jpg"'), hSana.slice(0, 200));
    check('C1 fila sana: sin forma póster (nada de ▶)', !hSana.includes('▶'));
    // C2 · el fixture de la fila con QUIETA (la forma de la 691 pre-cura)
    const rota = { id: 691, media_type: 'video', image_path: '/media/igthumb-08d8d374476fc83e0000ad2f.jpg', cover_path: '', caption: 'el reel del sábado', status: 'published', ig_permalink: 'https://www.instagram.com/reel/DfvcZxJBoxS/' };
    const hRota = hfDetailHTML(rota, {});
    check('C2 fila con quieta: NINGÚN <video> muerto', !hRota.includes('<video'), hRota.slice(0, 200));
    check('C2 fila con quieta: se muestra su miniatura como póster', hRota.includes('<img src="/media/igthumb-08d8d374476fc83e0000ad2f.jpg"'));
    check('C2 fila con quieta: insignia de reproducción presente', hRota.includes('▶'));
    check('C2 fila con quieta: salida a su permalink de Instagram', hRota.includes('href="https://www.instagram.com/reel/DfvcZxJBoxS/"'));
    // C2b · con portada cargada, el póster es la portada (no el src)
    const rotaCover = { ...rota, cover_path: '/media/igthumb-portada.jpg' };
    const hCover = hfDetailHTML(rotaCover, {});
    check('C2b con cover_path, el póster es la portada', hCover.includes('<img src="/media/igthumb-portada.jpg"') && !hCover.includes('<video'));
    // C4 · la foto de siempre, intacta
    const foto = { id: 701, media_type: 'image', image_path: '/media/foto.jpg', caption: 'una foto', status: 'published' };
    const hFoto = hfDetailHTML(foto, {});
    check('C4 foto: <img> como siempre, sin video ni insignia', hFoto.includes('<img src="/media/foto.jpg"') && !hFoto.includes('<video') && !hFoto.includes('▶'));
  }

  // ================= D · pines estáticos =================
  console.log('D · pines');
  check('D server.js: BUILD_ID 20261105-v1119 ×1 y v1118 ×0', (serverSrc.match(/20261105-v1119/g) || []).length >= 1 && serverSrc.includes("const BUILD_ID = '20261105-v1119';") && !serverSrc.includes('20261105-v1118'));
  check('D app.js: PZ_BUILD 20261105-v1119 y v1117 ×0', appSrc.includes("const PZ_BUILD = '20261105-v1119';") && !appSrc.includes('20261105-v1117'));
  check('D adoptarRecienteIg llama a feedAudit.localizeIgVideo', !!adoptSrc && adoptSrc.includes('feedAudit.localizeIgVideo'));
  check('D la cura escribe image_path + cover_path por UPDATE', serverSrc.includes('UPDATE posts SET image_path = ?, cover_path = ? WHERE id = ?'));
  check('D el endpoint de adopción devuelve medio_curado', serverSrc.includes('ad.medio_curado'));
  check('D hfDetailHTML deriva a la forma póster cuando el src no es video', !!detailSrc && detailSrc.includes('hfEsArchivoVideo(slides[0])') && detailSrc.includes('hfPosterVideoHTML(p,'));
  const idxES = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const idxEN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
  check('D index ES: app.js?v=756 ×1 y 755 ×0', (idxES.match(/app\.js\?v=756/g) || []).length === 1 && !idxES.includes('app.js?v=755'));
  check('D index EN: sin app.js?v= (como siempre)', !idxEN.includes('app.js?v='));

  console.log(`\n${pass} ok / ${fail} mal`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('ERROR de suite:', e); process.exit(1); });
