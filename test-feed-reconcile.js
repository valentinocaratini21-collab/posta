#!/usr/bin/env node
// test-feed-reconcile.js — Reconciliación del espejo de Instagram
// (2026-10-24). El defecto: un posteo archivado/borrado EN Instagram
// seguía rindiendo como 'published' en el feed de Posty para siempre
// (cuenta 12: su grilla archivada el 19/10 seguía entera, «remera Nike»
// incluida). Y la lectura contaba los hijos de los carruseles como
// posteos sueltos (8 «posteos» leídos sobre 2 reales).
//
// Prueba: (1) archivar en la fuente -> ig_state='archived_ext' y fuera de
// la composición de la grilla; (2) desarchivar -> vuelve a 'live';
// (3) lectura parcial o fallida -> CERO cambios; (4) el parser deduplica
// nodos repetidos y los hijos de carrusel no son posteos de primer nivel.
// Uso: node test-feed-reconcile.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 200) : ''); }
};

// ---------- Parte 1: reconcilePublishedMirror contra DB descartable ----------
console.log('— feed-reconcile: espejo contra la lectura');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-reconcile-'));
const db = require('./db').db || require('./db');
const fr = require('./feed-reconcile');
const feedAudit = require('./feed-audit');

ok('la migración creó posts.ig_state', (() => {
  try { db.prepare('SELECT ig_state FROM posts LIMIT 1').get(); return true; } catch (e) { return false; }
})());

const uid = db.prepare(`INSERT INTO users (email, password_hash) VALUES ('reconcile@x.example', 'x')`).run().lastInsertRowid;
const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, ig_permalink, published_at)
  VALUES (?, '/media/x.jpg', 'cap', ?, ?, ?, '2026-10-01 00:00:00')`);
const pLive = ins.run(uid, 'published', 'image', 'https://www.instagram.com/p/AAA111/').lastInsertRowid;   // sigue en la grilla
const pGone = ins.run(uid, 'published', 'image', 'https://www.instagram.com/p/BBB222/').lastInsertRowid;   // archivado en IG
const pStory = ins.run(uid, 'published', 'story', '').lastInsertRowid;                                    // historia: jamás se reconcilia
const pNoLink = ins.run(uid, 'published', 'image', '').lastInsertRowid;                                   // sin permalink: sin prueba, no se toca
const pDraft = ins.run(uid, 'draft', 'image', 'https://www.instagram.com/p/CCC333/').lastInsertRowid;       // no publicado: fuera del alcance
const state = (id) => db.prepare('SELECT ig_state FROM posts WHERE id = ?').get(id).ig_state;

// Lectura COMPLETA: posts_count=2 y 2 posteos de primer nivel (AAA111 en
// grilla, DDD444 publicado por fuera) + 1 hijo de carrusel (sin fecha ni
// caption) que NO cuenta como posteo.
const readComplete = { ok: true, profile: { posts_count: 2 }, posts: [
  { shortcode: 'AAA111', taken_at: 1790000000, caption: 'sigue' },
  { shortcode: 'DDD444', taken_at: 1791000000, caption: 'de afuera' },
  { shortcode: 'EEE555', taken_at: null, caption: '' },
] };
let r = fr.reconcilePublishedMirror(db, Number(uid), readComplete);
ok('lectura completa: 1 archivado detectado', r.archived === 1 && r.restored === 0, JSON.stringify(r));
ok('el archivado en IG pasó a archived_ext', state(pGone) === 'archived_ext', state(pGone));
ok('el que sigue en la grilla queda live', state(pLive) === 'live', state(pLive));
ok('la historia no se toca', state(pStory) === 'live');
ok('sin permalink no se toca (sin prueba no hay toque)', state(pNoLink) === 'live');
ok('el borrador no se toca', state(pDraft) === 'live');
ok('el registro NO se destruye: status sigue published', db.prepare('SELECT status FROM posts WHERE id = ?').get(pGone).status === 'published');

// Desarchivar: BBB222 vuelve a la grilla leída.
const readBack = { ok: true, profile: { posts_count: 3 }, posts: [
  { shortcode: 'AAA111', taken_at: 1790000000, caption: 'sigue' },
  { shortcode: 'BBB222', taken_at: 1789000000, caption: 'volvió' },
  { shortcode: 'DDD444', taken_at: 1791000000, caption: 'de afuera' },
] };
r = fr.reconcilePublishedMirror(db, Number(uid), readBack);
ok('desarchivar en IG lo restaura a live', r.restored === 1 && state(pLive) === 'live' && state(pGone) === 'live', JSON.stringify(r));

// Lo vuelvo a archivar para probar las guardas de seguridad sobre un
// estado ya reconciliado.
fr.reconcilePublishedMirror(db, Number(uid), readComplete);
ok('re-archivado vuelve a archived_ext', state(pGone) === 'archived_ext');

// SEGURIDAD: lectura PARCIAL (posts_count=30 > leídos) no toca NADA:
// ni restaura al archivado ni archiva al vivo.
const readPartial = { ok: true, profile: { posts_count: 30 }, posts: [
  { shortcode: 'BBB222', taken_at: 1789000000, caption: 'volvió' },
  { shortcode: 'ZZZ999', taken_at: 1792000000, caption: 'otro' },
] };
r = fr.reconcilePublishedMirror(db, Number(uid), readPartial);
ok('lectura parcial: skipped', r.skipped === 'partial-read', JSON.stringify(r));
ok('lectura parcial: el archivado NO se restaura', state(pGone) === 'archived_ext');
ok('lectura parcial: el vivo NO se archiva', state(pLive) === 'live');

// SEGURIDAD: lectura fallida / sin contador -> cero cambios.
r = fr.reconcilePublishedMirror(db, Number(uid), { ok: false, error: 'x' });
ok('lectura fallida: skipped', r.skipped === 'read-not-ok');
r = fr.reconcilePublishedMirror(db, Number(uid), null);
ok('lectura nula: skipped', r.skipped === 'read-not-ok');
r = fr.reconcilePublishedMirror(db, Number(uid), { ok: true, profile: {}, posts: [] });
ok('sin posts_count: skipped', r.skipped === 'no-count');
ok('tras las guardas, nada cambió', state(pGone) === 'archived_ext' && state(pLive) === 'live');

// Grilla vaciada (posts_count=0, lectura completa): todo lo publicado
// con permalink pasa a archived_ext (archivado masivo, caso 19/10).
const pLive2 = ins.run(uid, 'published', 'image', 'https://www.instagram.com/reel/FFF666/').lastInsertRowid;
r = fr.reconcilePublishedMirror(db, Number(uid), { ok: true, profile: { posts_count: 0 }, posts: [] });
ok('grilla en 0: archiva también el reel con permalink', r.archived >= 2 && state(pLive) === 'archived_ext' && state(pLive2) === 'archived_ext', JSON.stringify(r));
ok('igShortcodeOf: /p/ y /reel/', fr.igShortcodeOf('https://www.instagram.com/p/AAA111/') === 'AAA111' && fr.igShortcodeOf('https://www.instagram.com/reel/FFF666/') === 'FFF666' && fr.igShortcodeOf('') === null && fr.igShortcodeOf(null) === null);

// ---------- Parte 2: parser del embed (dedupe + hijos de carrusel) ----------
console.log('— feed-reconcile: parser del embed');
const Q = '\\"';
const node = (type, fields) => {
  const parts = [`{${Q}__typename${Q}:${Q}${type}${Q}`];
  for (const [k, v] of Object.entries(fields)) parts.push(typeof v === 'number' ? `${Q}${k}${Q}:${v}` : `${Q}${k}${Q}:${Q}${v}${Q}`);
  return parts.join(',') + '}';
};
const withCap = (n, text) => n.slice(0, -1) + `,${Q}edge_media_to_caption${Q}:{${Q}edges${Q}:[{${Q}node${Q}:{${Q}text${Q}:${Q}${text}${Q}}}]}`;
const PAD = 'x'.repeat(9500); // en el embed real los nodos distan >9000 chars
const html = '<html>'
  + withCap(node('GraphSidecar', { shortcode: 'SIDECAR1', taken_at_timestamp: 1792760598, display_url: 'https://scontent.cdninstagram.com/s.jpg' }), 'Caption del carrusel') + PAD
  + node('GraphImage', { shortcode: 'CHILD1', display_url: 'https://scontent.cdninstagram.com/c1.jpg' }) + PAD
  + withCap(node('GraphImage', { shortcode: 'IMGREAL1', taken_at_timestamp: 1792627352, display_url: 'https://scontent.cdninstagram.com/a.jpg' }), 'Hola soy el posteo') + PAD
  + withCap(node('GraphImage', { shortcode: 'IMGDUP2', taken_at_timestamp: 1792627352, display_url: 'https://scontent.cdninstagram.com/b.jpg' }), 'Hola soy el posteo')
  + '</html>';
const parsed = feedAudit.parseEmbedPosts(html);
const scs = parsed.map((p) => p.shortcode);
ok('el parser devuelve 3 nodos (el duplicado se descarta)', parsed.length === 3, scs.join(','));
ok('sin shortcodes repetidos del mismo posteo', scs.includes('IMGREAL1') && !scs.includes('IMGDUP2'), scs.join(','));
const child = parsed.find((p) => p.shortcode === 'CHILD1');
ok('el hijo del carrusel NO es posteo de primer nivel', !!child && fr.isTopLevelReadPost(child) === false);
ok('el carrusel y la foto real SÍ son de primer nivel', parsed.filter((p) => p.shortcode !== 'CHILD1').every((p) => fr.isTopLevelReadPost(p) === true));

// El destacado suelto del embed (fuera de graphql_media): mismo caption
// que el posteo real pero OTRO shortcode y otra fecha — la deduplicación
// no lo colapsa; lo excluye el recorte por posts_count de fetchAuditData.
async function parte2b() {
  console.log('— feed-reconcile: recorte de la lectura a la grilla real');
  const featured = `${Q}shortcode_media${Q}:` + withCap(node('GraphImage', { shortcode: 'FEATURED9', taken_at_timestamp: 1792536152, display_url: 'https://scontent.cdninstagram.com/f.jpg' }), 'Hola soy el posteo');
  const html2 = '<html>' + `${Q}posts_count${Q}:2,` + `${Q}followers_count${Q}:8,`
    + withCap(node('GraphSidecar', { shortcode: 'SIDECAR1', taken_at_timestamp: 1792760598, display_url: 'https://scontent.cdninstagram.com/s.jpg' }), 'Caption del carrusel') + PAD
    + node('GraphImage', { shortcode: 'CHILD1', display_url: 'https://scontent.cdninstagram.com/c1.jpg' }) + PAD
    + withCap(node('GraphImage', { shortcode: 'IMGREAL1', taken_at_timestamp: 1792627352, display_url: 'https://scontent.cdninstagram.com/a.jpg' }), 'Hola soy el posteo') + PAD
    + featured
    + '</html>';
  const data = await feedAudit.fetchAuditData('cuenta.x', async () => html2, { pic: null, name: '' });
  ok('fetchAuditData leyó posts_count=2', !!data.ok && data.profile.posts_count === 2, JSON.stringify(data.profile || {}));
  const tops = (data.posts || []).filter((p) => fr.isTopLevelReadPost(p)).map((p) => p.shortcode);
  ok('la lectura queda recortada a la grilla real (sin el destacado)', JSON.stringify(tops) === JSON.stringify(['SIDECAR1', 'IMGREAL1']), tops.join(','));
  ok('el hijo del carrusel sigue en la lectura cruda (lo filtra el consumidor)', (data.posts || []).some((p) => p.shortcode === 'CHILD1'));
}

async function resto() {
// ---------- Parte 3: la composición de la grilla excluye archivados ----------
console.log('— feed-reconcile: composición del home');
const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
ok('bloque HOME_FEED delimitado', a > 0 && b > a);
const sb = {
  esc: (s) => String(s == null ? '' : s),
  mv: (p) => p,
  pcTz: () => 'America/Argentina/Buenos_Aires',
  pcParseDate: (s0) => { const d = new Date(String(s0 || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
  ME: undefined,
};
vm.createContext(sb);
vm.runInContext(APP.slice(a, b), sb);
const P = (id, extra) => Object.assign({ id, status: 'published', media_type: 'image', image_path: '/media/p' + id + '.jpg', published_at: '2026-10-19T00:00:00Z' }, extra || {});
const arch = P(7, { ig_state: 'archived_ext', published_at: '2026-09-27T00:00:00Z', caption: 'Remera nike' });
const live = P(8, { ig_state: 'live' });
let tiles = sb.homeGridCompose({ upcoming: [], published: [arch, live], recents: [] });
ok('la grilla excluye el archivado_ext y conserva el vivo', tiles.length === 1 && tiles[0].post.id === 8, JSON.stringify(tiles.map((t) => t.post && t.post.id)));
// Caso cuenta 12: TODOS sus publicados están archivados en IG -> la
// grilla muestra los posteos REALES leídos de su perfil (recents),
// que antes quedaban tapados por el ancla de los publicados viejos.
tiles = sb.homeGridCompose({ upcoming: [], published: [arch], recents: [
  { img: '/media/pieza1.jpg', type: 'image', taken_at: 1792627352 },
  { img: '/media/pieza2.jpg', type: 'carousel', taken_at: 1792760598 },
] });
ok('sin publicados vivos, los recents reales rinden (2)', tiles.filter((t) => t.kind === 'ig').length === 2 && tiles.filter((t) => t.kind === 'post').length === 0, JSON.stringify(tiles.map((t) => t.kind)));

// ---------- Parte 4: cableado ----------
console.log('— feed-reconcile: cableado');
const SERVER = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const DBJS = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
ok('server.js exige feed-reconcile y reconcilia tras leer el perfil',
  SERVER.includes("require('./feed-reconcile')") && SERVER.includes('feedReconcile.reconcilePublishedMirror(db, uid, data)'));
ok('homeProfileFromRead filtra hijos de carrusel de los recents',
  SERVER.includes('feedReconcile.isTopLevelReadPost(x)'));
ok('db.js crea ig_state / ig_state_at', DBJS.includes('ADD COLUMN ig_state') && DBJS.includes('ADD COLUMN ig_state_at'));
ok('app.js compone excluyendo archived_ext', APP.includes("p.ig_state !== 'archived_ext'"));
ok('index.html bumpeó el ?v= de app.js', !INDEX.includes('/app.js?v=258'));

console.log(`\nfeed-reconcile: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
}

parte2b().then(resto).catch((e) => { console.error('ERROR', e); process.exit(1); });
