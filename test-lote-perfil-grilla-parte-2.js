// TEST LOTE PERFIL-GRILLA-PARTE-2 — BUILD v927 (base v900).
// BUG EN VIVO (Valentino 11/11 17:48–17:49, sesión de Valentino,
// @posty.communitymanager, tras v913 en vivo): el encabezado dice «10
// publicaciones» pero la grilla muestra solo 6 tarjetas, idéntico
// antes y después de un refresh. Las 6: carta HOY (593, hoy 19:00) ·
// uñas publicado 10/11 (592) · café «LUNES / El flat white de la casa»
// · «Primero estudio tu rubro.» · «Mi feed queda a medias» · «SOY
// POSTY.». FALTAN los 3 posteos de perfumería del 4/11 y 2 de café del
// 3/11 — que SÍ están en la lectura fresca del embed (verificado en
// vivo 11/11 con fetchAuditData real: 11 nodos = 6 top-level + 5
// láminas hijas) y SÍ aparecen en listas de la app (el de perfume se
// ve como «Publicado» en el detalle), pero NO como tarjeta en la
// grilla. Antes de v913 la grilla mostraba 5; después, 6 (se sumó 1).
//
// CAUSA RAÍZ (ver STATUS.md §1 — por eliminación, con evidencia):
// los 5 faltantes son filas DB status='published' con permalink real
// pero ig_state='archived_ext' (marca errónea). Una sola marca mala
// los borra por DOS caminos a la vez: el filtro de publicados los
// excluye del tile DB (homeGridCompose) Y el dedupe por shortcode
// (archivedShortcodes) mata su recent. El fix de v913 (unión de
// recents) no podía curar una marca: la restauración solo corría en
// lectura COMPLETA, y las lecturas son parciales crónicas (el embed
// capa en ~11 nodos: 6 < 10) — la marca quedaba para siempre. Además
// el total de la guarda venía solo del embed (página cacheable).
//
// FIX (solo server.js + feed-reconcile.js; app.js intacto):
//  · reconcilePublishedMirror: RESTAURAR por presencia corre SIEMPRE,
//    también en lectura parcial (la presencia es prueba positiva de
//    estar vivo); ARCHIVAR solo en lectura completa (la ausencia solo
//    prueba algo con ventana completa). Total autoritativo: el mayor
//    entre el del embed y el de la API oficial (opts.totalOverride).
//  · homeProfileReadAndStore pasa el conteo del payload (ya con la
//    API) como totalOverride; el log de reconcile soporta
//    parcial+restaurados; el merge oficial deja constancia cuando no
//    trae datos (antes fallaba en silencio).
//
// FIXTURE (datos REALES de la cuenta, leídos de Instagram 11/11):
// 10 posteos: uñas 10/11 (DflJLfAD-8C) · perfumería 4/11 imagen
// (DfVDDFAjKeG), reel (DfVC-LFMau1) y carrusel (DfVCqgdjCrO) · café
// 3/11 imagen (DfRt0axD0G0), reel (DfRsxGrSssF) y carrusel
// (DfRrm2Vj8Qa, «LUNES — El flat white de la casa») · «Primero
// estudio tu rubro.» 1/11 (DfOBymGj4q9) · «Mi feed queda a medias»
// 28/10 (DfCzqFdE5yz) · «SOY POSTY.» 20/10 (Deu7nAFji6X). Fechas
// RELATIVAS a hoy (la suite corre cualquier día). A diferencia de la
// suite v913 (que modelaba «la tira vive solo en IG»), acá la DB
// tiene filas published para los 9 posteos viejos: 4 live + 5 con
// archived_ext erróneo (el caso diagnosticado) + 1 archivado DE VERDAD
// (fuera de IG, sigue sin rendir). 592 sigue scheduled vencido (v913
// §1.3) y solo sale vía recent; 593 es la carta HOY; 594, mañana.
//
// Uso: node test-lote-perfil-grilla-parte-2.js [árbol]
//   Sin argumento usa ./work. En la BASE el fix no existe: los asserts
//   del fix FALLAN (el bug se reproduce y la suite lo detecta); en el
//   release pasan todos. El boot (5 checks) corre al final en el mismo
//   archivo; usa NODE_PATH=/home/hatch/workspace/posta/node_modules.
//   (Sin 'use strict': el eval del código extraído tiene que exponer
//   las funciones en este scope, como en test-lotepublicados3.js.)
const fs = require('fs');
const os = require('os');
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
  // Stubs con el comportamiento de la BASE (sin v913): la unión no
  // existe (el refresh reemplaza) y la ventana parcial se da por
  // completa. Así los asserts de v913 corren igual y FALLAN en base.
  bundle += 'function homeRecentsUnion(newRecents) { return Array.isArray(newRecents) ? newRecents.slice() : []; }\n';
  bundle += 'function homeLiveGridComplete() { return true; }\n';
}
eval(bundle);
// Stubs solo para ramas que el fixture no toca:
if (typeof pcParseDate === 'undefined') pcParseDate = (s) => { const d = new Date(s); return isNaN(d) ? null : d; };
if (typeof pcTz === 'undefined') pcTz = () => 'America/New_York';
if (typeof schedDayKeyOf === 'undefined') schedDayKeyOf = (d) => { try { return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch (e) { return ''; } };
if (typeof schedYmdToDate === 'undefined') schedYmdToDate = () => null;

// Reconciliación REAL del árbol bajo prueba (módulo, no eval): en la
// base es la regla vieja («parcial no toca nada»); en el release, la
// asimetría v927. La DB es descartable (DATA_DIR temporal).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-grilla2-'));
const db = require(path.join(ROOT, 'db')).db || require(path.join(ROOT, 'db'));
const fr = require(path.join(ROOT, 'feed-reconcile'));
const hasFix927 = srvSrc.includes('totalOverride') && fs.readFileSync(path.join(ROOT, 'feed-reconcile.js'), 'utf8').includes('RESTAURAR por presencia');
ok(hasFix927, 'fix presente: restore-por-presencia + totalOverride en feed-reconcile.js/server.js', hasFix927 ? '' : 'base sin fix v927');

// ---------- Fixture: los 10 posteos reales, fechas relativas a hoy ----------
const H = 3600 * 1000, D = 24 * H;
const NOW = Date.now();
const dayKey = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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
// Lo que trae el snapshot previo (los 4 viejos, fuera de la ventana).
const PREV4 = IG10.slice(6).map(recent);
const POSTS_COUNT = 10;
// Los 5 con la marca errónea (vivos en IG, archived_ext en DB).
const WRONG5 = ['DfVDDFAjKeG', 'DfVC-LFMau1', 'DfVCqgdjCrO', 'DfRt0axD0G0', 'DfRsxGrSssF'];
// Lectura parcial real: posts_count=10, solo 6 top-level (el embed).
const readPartial10 = { ok: true, profile: { posts_count: 10 }, posts: IG10.slice(0, 6).map((p) => ({ shortcode: p.shortcode, taken_at: p.taken_at, caption: p.cap })) };

// ---------- DB descartable: 9 published + 592/593/594 + 1 archivado real ----------
const uid = db.prepare(`INSERT INTO users (email, password_hash) VALUES ('grilla2@x.example', 'x')`).run().lastInsertRowid;
const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, ig_permalink, published_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);
const rowId = {};
function addPub(p, state) {
  const id = ins.run(uid, '/media/' + p.shortcode + '.jpg', p.cap, 'published', p.type === 'video' ? 'video' : 'image',
    'https://www.instagram.com/p/' + p.shortcode + '/', new Date(p.taken_at * 1000).toISOString().slice(0, 19).replace('T', ' ')).lastInsertRowid;
  if (state === 'archived_ext') db.prepare(`UPDATE posts SET ig_state = 'archived_ext' WHERE id = ?`).run(id);
  rowId[p.shortcode] = id;
  return id;
}
for (const p of IG10.slice(1)) addPub(p, WRONG5.includes(p.shortcode) ? 'archived_ext' : 'live');
// Archivado DE VERDAD (no está en IG ni en ninguna lectura): sigue sin rendir.
const archReal = ins.run(uid, '/media/arch.jpg', 'archivado de verdad', 'published', 'image', 'https://www.instagram.com/p/ARCHIVADO1/', '2026-09-01 00:00:00').lastInsertRowid;
db.prepare(`UPDATE posts SET ig_state = 'archived_ext' WHERE id = ?`).run(archReal);
const P592 = { id: 592, status: 'scheduled', scheduled_at: new Date(NOW - 26 * H).toISOString(), image_path: '/media/tira-nails-1.jpg', media_type: 'image', caption: 'uñas 10/11' };
const P593 = { id: 593, status: 'scheduled', scheduled_at: new Date(NOW + 2 * H).toISOString(), image_path: '/media/tira-nails-2.mp4', media_type: 'video', caption: 'uñas hoy' };
const P594 = { id: 594, status: 'scheduled', scheduled_at: new Date(NOW + 26 * H).toISOString(), image_path: '/media/tira-nails-3.jpg', media_type: 'image', caption: 'uñas mañana' };
const UPCOMING = [
  { p: P592, ymd: dayKey(NOW - 26 * H) },
  { p: P593, ymd: dayKey(NOW + 2 * H) },
  { p: P594, ymd: dayKey(NOW + 26 * H) },
];
const stateOf = (id) => db.prepare('SELECT ig_state FROM posts WHERE id = ?').get(id).ig_state;
const pubRows = () => db.prepare(`SELECT * FROM posts WHERE user_id = ? AND status = 'published'`).all(uid)
  .map((r) => ({ id: r.id, status: r.status, ig_state: r.ig_state, ig_permalink: r.ig_permalink, published_at: r.published_at, scheduled_at: r.scheduled_at, image_path: r.image_path, caption: r.caption, media_type: r.media_type }));
const igCodesInTiles = (tiles) => {
  const s = new Set();
  for (const t of tiles || []) {
    if (t.kind === 'ig' && t.shortcode) s.add(String(t.shortcode));
    if (t.kind === 'post' && t.post && t.post.ig_permalink) { const sc = hfIgShortcode(t.post.ig_permalink); if (sc) s.add(String(sc)); }
  }
  return s;
};
const publishedTiles = (tiles) => (tiles || []).filter((t) => t.kind === 'ig' || (t.kind === 'post' && t.post && t.post.status === 'published'));

// ---------- Asserts: el bug reproducido (estado previo a curar) ----------
{
  // Con las 5 marcas erróneas y la lectura fresca (6 recents), la
  // grilla rinde carta + 5 = 6 tiles: los 5 faltantes no rinden ni
  // como tile DB ni como recent. Es el estado en vivo 11/11 17:48.
  const tiles = homeGridCompose({ upcoming: UPCOMING, published: pubRows().filter((p) => p.status === 'published'), recents: FRESH6, ritual: null, all: pubRows().concat([P592, P593, P594]) });
  const pub = publishedTiles(tiles);
  ok(tiles.length === 6, 'bug reproducido: con las 5 marcas erróneas la grilla rinde 6 tiles (carta + 5)', 'n=' + tiles.length);
  ok(pub.length === 5, 'bug reproducido: solo 5 publicados rinden (faltan perfume×3 + café×2)', 'n=' + pub.length);
  const codes = igCodesInTiles(tiles);
  ok(WRONG5.every((sc) => !codes.has(sc)), 'bug reproducido: ninguno de los 5 faltantes rinde como tile');
  ok(codes.has('DflJLfAD-8C'), 'bug reproducido: 592 SÍ rinde vía recent (su fila scheduled no lo trae, el espejo sí)');
}

// ---------- Asserts: la cura (restore por presencia, lectura parcial) ----------
{
  const r = fr.reconcilePublishedMirror(db, Number(uid), readPartial10);
  ok(r.skipped === 'partial-read', 'cura: la lectura parcial sigue marcada partial-read (no archiva)', JSON.stringify(r));
  ok(r.restored === 5, 'cura: la lectura parcial restaura los 5 vivos por presencia', JSON.stringify(r));
  ok(r.archived === 0 || r.archived === undefined, 'cura: la lectura parcial no archiva nada', JSON.stringify(r));
  ok(WRONG5.every((sc) => stateOf(rowId[sc]) === 'live'), 'cura: las 5 marcas erróneas pasan a live');
  ok(stateOf(rowId.DfRrm2Vj8Qa) === 'live', 'cura: el vivo ausente de la ventana parcial (café carrusel) NO se archiva');
  ok(stateOf(archReal) === 'archived_ext', 'cura: el archivado de verdad (ausente de la lectura) sigue archivado');
}
{
  // Idempotencia: una segunda lectura parcial consecutiva no pierde
  // ninguna tarjeta ni re-archiva nada.
  const r2 = fr.reconcilePublishedMirror(db, Number(uid), readPartial10);
  ok(r2.restored === 0 && (r2.archived === 0 || r2.archived === undefined), 'cura: segunda lectura parcial consecutiva no cambia nada (idempotente)', JSON.stringify(r2));
  ok(WRONG5.every((sc) => stateOf(rowId[sc]) === 'live'), 'cura: tras la segunda lectura los 5 siguen live');
}
{
  // Grilla curada: 11 tiles (carta + 10 publicados) y el conteo 10
  // coincide con la grilla. El perfume rinde como TARJETA (kind post
  // con su permalink), no solo en una lista.
  const tiles = homeGridCompose({ upcoming: UPCOMING, published: pubRows().filter((p) => p.status === 'published'), recents: FRESH6, ritual: null, all: pubRows().concat([P592, P593, P594]) });
  const pub = publishedTiles(tiles);
  ok(tiles.length === 11, 'grilla curada: 11 tiles (carta + 10 publicados)', 'n=' + tiles.length);
  ok(pub.length === 10, 'grilla curada: 10 publicados rinden', 'n=' + pub.length);
  const codes = igCodesInTiles(tiles);
  ok(IG10.every((p) => codes.has(p.shortcode)), 'grilla curada: están los 10 posteos reales de IG (café, perfumería, uñas)');
  ok(POSTS_COUNT === pub.length, 'grilla curada: el conteo del encabezado (10) coincide con la grilla (10)');
  const perfTile = (tiles || []).find((t) => t.kind === 'post' && t.post && t.post.ig_permalink && String(t.post.ig_permalink).includes('DfVDDFAjKeG'));
  ok(!!perfTile, 'grilla curada: el posteo de perfume rinde como TARJETA (no solo en el modal)');
  ok(tiles[0] && tiles[0].kind === 'oculta' && tiles[0].post && tiles[0].post.id === 593, 'grilla curada: la carta HOY sigue primera (593)');
  ok(!igCodesInTiles(tiles).has('ARCHIVADO1'), 'grilla curada: el archivado de verdad sigue sin rendir (regla 1/11 intacta)');
  // Con la ventana completa (unión v913), el live-drop no quita nada.
  const recentsFixed = homeRecentsUnion(FRESH6, POSTS_COUNT, PREV4);
  const liveSet = new Set(recentsFixed.map((r) => r.shortcode));
  const cutoffMs = Math.min.apply(null, recentsFixed.map((r) => r.taken_at * 1000));
  const kept = tiles.filter((t) => !hfLiveDropTile(t, liveSet, cutoffMs));
  ok(kept.length === tiles.length, 'grilla curada: la revalidación en vivo no quita ningún tile (ventana completa)');
}

// ---------- Asserts: archivar sigue funcionando (lectura completa) ----------
{
  // Usuario aislado: A está en la lectura completa, B no. Solo B se archiva.
  const uid2 = db.prepare(`INSERT INTO users (email, password_hash) VALUES ('grilla2b@x.example', 'x')`).run().lastInsertRowid;
  const ins2 = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, ig_permalink, published_at)
    VALUES (?, '/media/x.jpg', 'cap', 'published', 'image', ?, '2026-10-01 00:00:00')`);
  const aId = ins2.run(uid2, 'https://www.instagram.com/p/AAAA1111/').lastInsertRowid;
  const bId = ins2.run(uid2, 'https://www.instagram.com/p/BBBB2222/').lastInsertRowid;
  const st2 = (id) => db.prepare('SELECT ig_state FROM posts WHERE id = ?').get(id).ig_state;
  const r = fr.reconcilePublishedMirror(db, Number(uid2), { ok: true, profile: { posts_count: 1 }, posts: [{ shortcode: 'AAAA1111', taken_at: 1790000000, caption: 'sigue' }] });
  ok(r.archived === 1 && r.restored === 0, 'completa: la lectura completa archiva al ausente (1 archivado)', JSON.stringify(r));
  ok(st2(bId) === 'archived_ext' && st2(aId) === 'live', 'completa: solo el ausente pasa a archived_ext, el vivo queda live');
  // Desarchivar en completa lo restaura (comportamiento vigente).
  const r2 = fr.reconcilePublishedMirror(db, Number(uid2), { ok: true, profile: { posts_count: 2 }, posts: [
    { shortcode: 'AAAA1111', taken_at: 1790000000, caption: 'sigue' },
    { shortcode: 'BBBB2222', taken_at: 1789000000, caption: 'volvió' },
  ] });
  ok(r2.restored === 1 && st2(bId) === 'live', 'completa: desarchivar en IG lo restaura a live', JSON.stringify(r2));
  // Lectura fallida / sin contador: cero cambios (guardas vigentes).
  const r3 = fr.reconcilePublishedMirror(db, Number(uid2), { ok: false, error: 'x' });
  ok(r3.skipped === 'read-not-ok', 'guardas: lectura fallida no toca nada', JSON.stringify(r3));
  const r4 = fr.reconcilePublishedMirror(db, Number(uid2), { ok: true, profile: {}, posts: [] });
  ok(r4.skipped === 'no-count', 'guardas: sin posts_count no toca nada', JSON.stringify(r4));
}

// ---------- Asserts: total autoritativo (endurecimiento v927) ----------
{
  // Dos usuarios aislados (las llamadas no son independientes sobre
  // el mismo: la primera ya mutaría a D). En ambos, C está en la
  // lectura y D no; el embed trae un conteo RANCIO-BAJO (6) pero la
  // API oficial dice 10.
  const mkUser = (email) => {
    const u = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?, 'x')`).run(email).lastInsertRowid;
    const insX = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, ig_permalink, published_at)
      VALUES (?, '/media/x.jpg', 'cap', 'published', 'image', ?, '2026-10-01 00:00:00')`);
    const cId = insX.run(u, 'https://www.instagram.com/p/CCCC3333/').lastInsertRowid;
    const dId = insX.run(u, 'https://www.instagram.com/p/DDDD4444/').lastInsertRowid;
    return { u, cId, dId, st: (id) => db.prepare('SELECT ig_state FROM posts WHERE id = ?').get(id).ig_state };
  };
  const fresh6 = [
    { shortcode: 'CCCC3333', taken_at: 1790000000, caption: 'c' },
    { shortcode: 'E1', taken_at: 1790000001, caption: 'e1' },
    { shortcode: 'E2', taken_at: 1790000002, caption: 'e2' },
    { shortcode: 'E3', taken_at: 1790000003, caption: 'e3' },
    { shortcode: 'E4', taken_at: 1790000004, caption: 'e4' },
    { shortcode: 'E5', taken_at: 1790000005, caption: 'e5' },
  ];
  // CON override: la lectura (6/10) es parcial y NO archiva a D.
  const t1 = mkUser('grilla2c@x.example');
  const r = fr.reconcilePublishedMirror(db, Number(t1.u), { ok: true, profile: { posts_count: 6 }, posts: fresh6 }, { totalOverride: 10 });
  ok(r.skipped === 'partial-read', 'total autoritativo: con override 10 la lectura (6/10) es parcial y no archiva', JSON.stringify(r));
  ok(t1.st(t1.dId) === 'live', 'total autoritativo: el ausente D sigue live con el total de la API');
  // SIN override: el mismo total rancio (6/6) la da por completa y
  // archiva a D — el agujero que el override tapa (mecanismo viejo,
  // pasa en base y en release: es la demostración, no el fix).
  const t2 = mkUser('grilla2d@x.example');
  const rOld = fr.reconcilePublishedMirror(db, Number(t2.u), { ok: true, profile: { posts_count: 6 }, posts: fresh6 });
  ok(!rOld.skipped && rOld.archived === 1 && t2.st(t2.dId) === 'archived_ext', 'total autoritativo: sin override el total rancio archivaba a D (el agujero que se tapa)', JSON.stringify(rOld));
}

// ---------- Asserts: v913 preservado (unión + ventana viva) ----------
// Solo cuando el árbol trae el código v913 (tras el re-base del
// preparador): este lote se construye sobre base v900, que NO tiene
// homeRecentsUnion/homeLiveGridComplete — ahí los guards se omiten
// (SKIP) y los verifica el preparador tras el re-base. No son asserts
// de este lote; son la guarda de no-regresión de v913.
if (!hasFix) {
  console.log('SKIP v913: homeRecentsUnion/homeLiveGridComplete no están en este árbol (base v900); los verifica el preparador tras el re-base a v913+');
} else {
  const u = homeRecentsUnion(FRESH6, POSTS_COUNT, PREV4);
  ok(u.length === 10, 'v913: unión en lectura parcial 6 + 4 = 10 recents', 'n=' + u.length);
  ok(IG10.every((p) => new Set(u.map((r) => r.shortcode)).has(p.shortcode)), 'v913: la unión trae los 10 shortcodes reales');
  const fresh10 = IG10.map(recent);
  const prevConBorrado = PREV4.concat([{ img: '/media/ig-DEL.jpg', src: 'https://cdninstagram.com/DEL.jpg', type: 'image', taken_at: Math.floor((NOW - 30 * D) / 1000), shortcode: 'DELBORRADO', pinned: null, likes: null, comments: null }]);
  const u2 = homeRecentsUnion(fresh10, POSTS_COUNT, prevConBorrado);
  ok(u2.length === 10 && !u2.some((r) => r.shortcode === 'DELBORRADO'), 'v913: en lectura completa se reemplaza, el borrado NO vuelve');
  ok(homeLiveGridComplete(FRESH6, POSTS_COUNT) === false, 'v913: ventana parcial (6/10) NO es completa', 'base devuelve true');
  ok(homeLiveGridComplete(IG10.map(recent), POSTS_COUNT) === true, 'v913: ventana completa (10/10) SÍ es completa');
  ok(homeLiveGridComplete([], 0) === true, 'v913: cuenta vacía (0/0) es completa');
}

// ---------- Boot local (5 checks) ----------
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v927-boot-'));
const PORT = 34946;
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
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), NODE_PATH: '/home/hatch/workspace/posta/node_modules', ADMIN_TOKEN: 'testtoken-perfil-grilla-parte-2', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: '' },
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
      ok(v && v.build === '20261105-v927', 'boot: /api/version = 20261105-v927', 'build=' + (v && v.build));
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
  console.log(`\nperfil-grilla-parte-2: ${pass} pass, ${fail} fail${hasFix927 ? '' : ' (BASE sin fix: los FAIL del fix son el bug reproduciéndose)'}`);
  process.exitCode = fail ? 1 : 0;
})();
