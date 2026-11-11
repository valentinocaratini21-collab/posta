// TEST LOTE PERFIL-GRILLA-5-DE-10 — BUILD v913 (base v912).
// BUG EN VIVO (Valentino 11/11 16:55, con captura): en la vista previa
// del perfil de @posty.communitymanager el encabezado dice «10
// publicaciones» pero la grilla muestra solo 5 tarjetas y después
// espacio vacío. No aparecen los posteos publicados de la tira (café,
// perfumería, uñas). Valentino: antes aparecían todos (regresión).
//
// CAUSA RAÍZ (ver STATUS.md §1): el encabezado trae el conteo REAL de
// Instagram (posts_count, 10) mientras la grilla se compone de
// publicados de la DB + recents del snapshot — y los recents se
// reconstruyen desde la página del embed, que Instagram capa en ~11
// nodos: con 2 carruseles solo sobreviven los 6 posteos más nuevos
// (verificado en vivo 11/11 con fetchAuditData real: 11 nodos = 6
// top-level + 5 láminas). Un refresh con lectura PARCIAL reemplaza el
// snapshot y encoge la grilla; y /api/home/live-grid devolvía
// complete:true con esa ventana parcial, con lo que el cliente borraba
// del DOM posteos vivos ausentes de la ventana. El fix (server.js):
// homeRecentsUnion (unión en lectura parcial) + homeLiveGridComplete
// (ventana parcial = no filtrar).
//
// FIXTURE (datos REALES de la cuenta, leídos de Instagram 11/11):
// 10 posteos: uñas 10/11 (DflJLfAD-8C) · perfumería 4/11 imagen
// (DfVDDFAjKeG), reel (DfVC-LFMau1) y carrusel (DfVCqgdjCrO) · café
// 3/11 imagen (DfRt0axD0G0), reel (DfRsxGrSssF) y carrusel
// (DfRrm2Vj8Qa, «LUNES — El flat white de la casa») · «Primero
// estudio tu rubro.» 1/11 (DfOBymGj4q9) · «Mi feed queda a medias»
// 28/10 (DfCzqFdE5yz) · «SOY POSTY.» 20/10 (Deu7nAFji6X). Las fechas
// son RELATIVAS a hoy (la suite corre cualquier día): se preservan el
// orden y los huecos reales. La tira (café/perfumería/uñas) vive SOLO
// en IG: la DB no tiene filas published para ella (peor caso honesto);
// los únicos posteos de la DB son 592 (uñas 10/11, scheduled vencido:
// salió a IG como DflJLfAD-8C pero su fila nunca pasó a published),
// 593 (hoy 19:00, la carta HOY, video) y 594 (mañana 19:00).
//
// Uso: node test-lote-perfil-grilla-5-de-10.js [árbol]
//   Sin argumento usa ./work. En la BASE el fix no existe: los asserts
//   del fix FALLAN (el bug se reproduce y la suite lo detecta); en el
//   release pasan todos. El boot (5 checks) corre al final en el mismo
//   archivo; usa NODE_PATH=/home/hatch/workspace/posta/node_modules.
//   (Sin 'use strict': el eval del código extraído tiene que exponer
//   las funciones en este scope, como en test-lotepublicados3.js.)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'work');
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function extractFn(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('no hallado: ' + sig);
  const j = src.indexOf('{', i);
  let depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

// ---------- Código real (extraído, sin reescrituras) ----------
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
let hasFix = true;
let bundle = '';
try { bundle += extractFn(srvSrc, 'function homeRecentsUnion') + '\n'; }
catch (e) { hasFix = false; }
try { bundle += extractFn(srvSrc, 'function homeLiveGridComplete') + '\n'; }
catch (e) { hasFix = false; }
bundle += extractFn(appSrc, 'function hfFeedSortKey') + '\n';
bundle += extractFn(appSrc, 'function hfCmpDescKey') + '\n';
bundle += extractFn(appSrc, 'function hfIgShortcode') + '\n';
bundle += extractFn(appSrc, 'function homeGridCompose') + '\n';
bundle += extractFn(appSrc, 'function hfLiveDropTile') + '\n';
if (!hasFix) {
  // Stubs con el comportamiento de la BASE (sin fix): la unión no
  // existe (el refresh reemplaza) y la ventana parcial se da por
  // completa. Así los asserts del fix corren igual y FALLAN en base.
  bundle += 'function homeRecentsUnion(newRecents) { return Array.isArray(newRecents) ? newRecents.slice() : []; }\n';
  bundle += 'function homeLiveGridComplete() { return true; }\n';
}
eval(bundle);
// Stubs solo para ramas que el fixture no toca:
if (typeof pcParseDate === 'undefined') pcParseDate = (s) => { const d = new Date(s); return isNaN(d) ? null : d; };
if (typeof pcTz === 'undefined') pcTz = () => 'America/New_York';
if (typeof schedDayKeyOf === 'undefined') schedDayKeyOf = (d) => { try { return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch (e) { return ''; } };
if (typeof schedYmdToDate === 'undefined') schedYmdToDate = () => null;

// ---------- Fixture: la captura, con fechas relativas a hoy ----------
const H = 3600 * 1000, D = 24 * H;
const NOW = Date.now();
const dayKey = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
// Los 10 posteos reales de IG (shortcode, tipo, taken_at relativo).
// Orden real: uñas 10/11 · perfume 4/11 (img, reel, carrusel) · café
// 3/11 (img, reel, carrusel) · rubro 1/11 · feed-a-medias 28/10 ·
// SOY POSTY 20/10.
const IG10 = [
  { shortcode: 'DflJLfAD-8C', type: 'image', taken_at: Math.floor((NOW - 1 * D) / 1000), cap: 'uñas 10/11' },
  { shortcode: 'DfVDDFAjKeG', type: 'image', taken_at: Math.floor((NOW - 7 * D) / 1000), cap: 'perfume img 4/11' },
  { shortcode: 'DfVC-LFMau1', type: 'video', taken_at: Math.floor((NOW - 7 * D - 60 * 1000) / 1000), cap: 'perfume reel 4/11' },
  { shortcode: 'DfVCqgdjCrO', type: 'carousel', taken_at: Math.floor((NOW - 7 * D - 240 * 1000) / 1000), cap: 'perfume carrusel 4/11' },
  { shortcode: 'DfRt0axD0G0', type: 'image', taken_at: Math.floor((NOW - 8 * D) / 1000), cap: 'café img 3/11' },
  { shortcode: 'DfRsxGrSssF', type: 'video', taken_at: Math.floor((NOW - 8 * D - 60 * 1000) / 1000), cap: 'café reel 3/11' },
  { shortcode: 'DfRrm2Vj8Qa', type: 'carousel', taken_at: Math.floor((NOW - 8 * D - 120 * 1000) / 1000), cap: 'café carrusel 3/11 (flat white LUNES)' },
  { shortcode: 'DfOBymGj4q9', type: 'image', taken_at: Math.floor((NOW - 10 * D) / 1000), cap: 'rubro 1/11' },
  { shortcode: 'DfCzqFdE5yz', type: 'image', taken_at: Math.floor((NOW - 14 * D) / 1000), cap: 'feed a medias 28/10' },
  { shortcode: 'Deu7nAFji6X', type: 'image', taken_at: Math.floor((NOW - 22 * D) / 1000), cap: 'SOY POSTY 20/10' },
];
const recent = (p) => ({ img: '/media/ig-' + p.shortcode + '.jpg', src: 'https://cdninstagram.com/' + p.shortcode + '.jpg', type: p.type, taken_at: p.taken_at, shortcode: p.shortcode, pinned: null, likes: null, comments: null });
// Lo que trae el embed HOY (verificado en vivo): solo los 6 más nuevos.
const FRESH6 = IG10.slice(0, 6).map(recent);
// Lo que trae el snapshot RANCIO (la captura): solo los 4 más viejos.
const PREV4 = IG10.slice(6).map(recent);
const POSTS_COUNT = 10;
// Posteos de la DB: solo la tira nails (592 vencido, 593 hoy, 594 mañana).
const P592 = { id: 592, status: 'scheduled', scheduled_at: new Date(NOW - 26 * H).toISOString(), image_path: '/media/tira-nails-1.jpg', media_type: 'image', caption: 'uñas 10/11' };
const P593 = { id: 593, status: 'scheduled', scheduled_at: new Date(NOW + 2 * H).toISOString(), image_path: '/media/tira-nails-2.mp4', media_type: 'video', caption: 'uñas hoy' };
const P594 = { id: 594, status: 'scheduled', scheduled_at: new Date(NOW + 26 * H).toISOString(), image_path: '/media/tira-nails-3.jpg', media_type: 'image', caption: 'uñas mañana' };
const ALL_DB = [P592, P593, P594];
const UPCOMING = [
  { p: P592, ymd: dayKey(NOW - 26 * H) },
  { p: P593, ymd: dayKey(NOW + 2 * H) },
  { p: P594, ymd: dayKey(NOW + 26 * H) },
];
const igCodesInTiles = (tiles) => {
  const s = new Set();
  for (const t of tiles || []) {
    if (t.kind === 'ig' && t.shortcode) s.add(String(t.shortcode));
    if (t.kind === 'post' && t.post && t.post.ig_permalink) { const sc = hfIgShortcode(t.post.ig_permalink); if (sc) s.add(String(sc)); }
  }
  return s;
};

// ---------- Asserts: la unión (fix 1) ----------
ok(hasFix, 'fix presente: homeRecentsUnion + homeLiveGridComplete existen en server.js', hasFix ? '' : 'base sin fix');
{
  const u = homeRecentsUnion(FRESH6, POSTS_COUNT, PREV4);
  ok(u.length === 10, 'unión en lectura parcial: 6 nuevos + 4 viejos = 10 recents', 'n=' + u.length);
  const codes = new Set(u.map((r) => r.shortcode));
  ok(IG10.every((p) => codes.has(p.shortcode)), 'unión: están los 10 shortcodes reales de IG');
  ok(u.length === 10 && u[0].shortcode === 'DflJLfAD-8C' && u[9].shortcode === 'Deu7nAFji6X', 'unión: orden fecha descendente (uñas primero, SOY POSTY último)', 'n=' + u.length);
  ok(new Set(u.map((r) => r.shortcode)).size === u.length, 'unión: sin duplicados por shortcode');
}
{
  // Lectura COMPLETA reemplaza: un borrado real sale (no resucita).
  const fresh10 = IG10.map(recent);
  const prevConBorrado = PREV4.concat([{ img: '/media/ig-DEL.jpg', src: 'https://cdninstagram.com/DEL.jpg', type: 'image', taken_at: Math.floor((NOW - 30 * D) / 1000), shortcode: 'DELBORRADO', pinned: null, likes: null, comments: null }]);
  const u = homeRecentsUnion(fresh10, POSTS_COUNT, prevConBorrado);
  ok(u.length === 10 && !u.some((r) => r.shortcode === 'DELBORRADO'), 'unión: en lectura completa se reemplaza, el borrado NO vuelve');
}
ok(homeRecentsUnion(FRESH6, POSTS_COUNT, []).length === 6, 'unión: sin snapshot previo no inventa nada (6 = lo leído)');
ok(homeRecentsUnion(FRESH6, 6, PREV4).length === 6, 'unión: lectura completa (6/6) no agrega viejos');
ok(homeRecentsUnion(FRESH6, null, PREV4).length === 6, 'unión: sin conteo no une (fail-closed, queda lo leído)');

// ---------- Asserts: la ventana viva (fix 2) ----------
ok(homeLiveGridComplete(FRESH6, POSTS_COUNT) === false, 'live-grid: ventana parcial (6/10) NO es completa', 'base devuelve true');
ok(homeLiveGridComplete(IG10.map(recent), POSTS_COUNT) === true, 'live-grid: ventana completa (10/10) SÍ es completa');
ok(homeLiveGridComplete(FRESH6, null) === true, 'live-grid: sin conteo no cambia el comportamiento vigente');
ok(homeLiveGridComplete([], 0) === true, 'live-grid: cuenta vacía (0/0) es completa');

// ---------- Asserts: la grilla reproduce la captura (base) ----------
{
  // Estado en la captura: snapshot rancio (4 viejos), sin publicados
  // en la DB. La grilla rinde carta + 4 = 5 tiles; el encabezado 10.
  const tiles = homeGridCompose({ upcoming: UPCOMING, published: [], recents: PREV4, ritual: null, all: ALL_DB });
  const ig = igCodesInTiles(tiles);
  ok(tiles.length === 5, 'grilla con snapshot rancio: 5 tiles (carta + 4 viejos)', 'n=' + tiles.length);
  ok(tiles[0] && tiles[0].kind === 'oculta' && tiles[0].post && tiles[0].post.id === 593, 'grilla: la primera tile es la carta HOY (593)');
  ok(ig.size === 4 && POSTS_COUNT !== ig.size, 'grilla: solo 4 de 10 posteos de IG (el bug: 5 tiles vs 10 publicaciones)');
  ok(!tiles.some((t) => t.kind === 'post' && t.post && t.post.id === 592), 'grilla: 592 (scheduled vencido) NO rinde como tile de DB (filtro un-posteo-por-día)');
}
{
  // Mecanismo del borrado en vivo: con la ventana parcial de los 4
  // viejos, hfLiveDropTile quita los 6 recents nuevos del DOM.
  const tiles = homeGridCompose({ upcoming: UPCOMING, published: [], recents: FRESH6, ritual: null, all: ALL_DB });
  ok(tiles.length === 7, 'grilla con snapshot fresco (base): carta + 6 recents = 7 (faltan los 4 viejos)', 'n=' + tiles.length);
  const liveSet = new Set(PREV4.map((r) => r.shortcode));
  const cutoffMs = Math.min.apply(null, PREV4.map((r) => r.taken_at * 1000));
  const kept = tiles.filter((t) => !hfLiveDropTile(t, liveSet, cutoffMs));
  // La ventana parcial (4 viejos, piso = SOY POSTY 20/10) no contiene
  // ninguno de los 6 recents nuevos y todos son más nuevos que el piso:
  // el drop los borra a los 6 del DOM y solo queda la carta.
  ok(kept.length === 1, 'live-drop con ventana parcial: de 7 tiles queda solo la carta (borra los 6 nuevos del DOM)', 'n=' + kept.length);
  ok(homeLiveGridComplete(FRESH6, POSTS_COUNT) === false, 'live-drop: con el fix la ventana parcial NO filtra (complete:false)');
}

// ---------- Asserts: la grilla con el fix (10/10) ----------
{
  const recentsFixed = homeRecentsUnion(FRESH6, POSTS_COUNT, PREV4);
  const tiles = homeGridCompose({ upcoming: UPCOMING, published: [], recents: recentsFixed, ritual: null, all: ALL_DB });
  const ig = igCodesInTiles(tiles);
  ok(tiles.length === 11, 'grilla con fix: 11 tiles (carta + 10 posteos de IG)', 'n=' + tiles.length);
  ok(ig.size === 10, 'grilla con fix: los 10 posteos de IG rinden como tiles');
  ok(IG10.every((p) => ig.has(p.shortcode)), 'grilla con fix: la tira publicada aparece (café, perfumería, uñas)');
  ok(POSTS_COUNT === ig.size, 'grilla con fix: el conteo del encabezado (10) coincide con la grilla (10)');
  ok(ig.has('DflJLfAD-8C'), 'grilla con fix: 592 sale vía recent (su fila scheduled vencida no rinde, el espejo IG sí lo trae)');
  ok(tiles[0] && tiles[0].kind === 'oculta' && tiles[0].hoy === true, 'grilla con fix: la carta HOY sigue primera y con marca HOY');
  // Con la ventana completa, el live-drop no quita nada.
  const liveSet = new Set(recentsFixed.map((r) => r.shortcode));
  const cutoffMs = Math.min.apply(null, recentsFixed.map((r) => r.taken_at * 1000));
  const kept = tiles.filter((t) => !hfLiveDropTile(t, liveSet, cutoffMs));
  ok(kept.length === tiles.length, 'grilla con fix: la revalidación en vivo no quita ningún tile (ventana completa)');
}

// ---------- Boot local (5 checks) ----------
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v913-boot-'));
const PORT = 34945;
const BASE_URL = `http://127.0.0.1:${PORT}`;
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE_URL}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function qv(html, file) {
  const m = new RegExp(file.replace('.', '\\.') + '\\?v=([^"\'&\\s]+)').exec(String(html || ''));
  return m ? m[1] : null;
}
(async () => {
  const treeIndexES = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const treeIndexEN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), NODE_PATH: '/home/hatch/workspace/posta/node_modules', ADMIN_TOKEN: 'testtoken-perfil-grilla-5-de-10', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const srvPid = srv.pid;
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    const booted = await waitBoot();
    ok(booted, 'boot: servidor levanta en puerto ' + PORT);
    if (booted) {
      const v = await (await fetch(`${BASE_URL}/api/version`)).json().catch(() => null);
      ok(v && v.build === '20261105-v913', 'boot: /api/version = 20261105-v913', 'build=' + (v && v.build));
      const idxES = await (await fetch(`${BASE_URL}/`)).text().catch(() => '');
      ok(idxES && qv(idxES, 'app.js') === qv(treeIndexES, 'app.js') && qv(idxES, 'styles.css') === qv(treeIndexES, 'styles.css'),
        'boot: index ES servido con los ?v= del árbol (app.js?v=' + qv(treeIndexES, 'app.js') + ' styles?v=' + qv(treeIndexES, 'styles.css') + ')');
      const idxEN = await (await fetch(`${BASE_URL}/en/`)).text().catch(() => '');
      ok(idxEN && qv(idxEN, 'styles.css') === qv(treeIndexEN, 'styles.css'),
        'boot: index EN servido con styles?v= del árbol (' + qv(treeIndexEN, 'styles.css') + ')');
      const lg = await fetch(`${BASE_URL}/api/home/live-grid`).catch(() => null);
      ok(lg && lg.status === 401, 'boot: /api/home/live-grid sin sesión → 401 (ruta cargada y guardada)', 'status=' + (lg && lg.status));
      ok(!fs.existsSync(path.join(ROOT, 'data')), 'boot: sin data/ en el árbol');
    }
      ok(!/EADDRINUSE|UnhandledPromiseRejection|FATAL/.test(srvLog), 'boot: log sin errores fatales (EADDRINUSE/Unhandled/FATAL)');
  } finally {
    try { process.kill(srvPid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    let portFree = false;
    try { await fetch(`${BASE_URL}/api/version`); } catch (e) { portFree = true; }
    ok(portFree, 'boot: puerto ' + PORT + ' libre tras matar por PID exacto (' + srvPid + ')');
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nperfil-grilla-5-de-10: ${pass} pass, ${fail} fail${hasFix ? '' : ' (BASE sin fix: los FAIL del fix son el bug reproduciéndose)'}`);
  process.exitCode = fail ? 1 : 0;
})();
