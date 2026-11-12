// test-lote-localizar-recents.js — LOTE LOCALIZAR-RECENTS-PERFIL (12/11 · base v972):
// En la grilla del perfil, los posteos recientes cuya imagen no está
// localizada se ven ROTOS en el teléfono (tarjetas blancas con ícono de
// imagen rota; verificado por Valentino en su iPhone, 12/11 17:02).
// Causa raíz (verificada en vivo 12/11 con sondas reales contra la CDN):
// parseEmbedPosts (feed-audit.js) capturaba el display_url del embed con
// un tope de 600 caracteres — las URLs firmadas miden 610–670 limpias —
// y la firma `oh` llegaba amputada: la CDN responde 403 a la descarga y
// localizeTrialPhotos jamás pudo localizar una miniatura del embed.
// La URL COMPLETA descarga OK (<1 s) con el fetcher de producción
// (fetchImageBuf, headers actuales): el mecanismo que funciona es el
// mismo de siempre; le llegaban URLs rotas.
// El fix:
//  (1) feed-audit.js: tope de captura del display_url 600 -> 2048.
//  (2) server.js homeProfileFromRead: se RETIRA el fallback img=src de
//      v971 (la URL cruda de la CDN no carga en el teléfono): si una
//      miniatura no se localiza, el recent no entra — ausente, no roto.
//  (3) server.js homeSnapshotGet: los snapshots guardados en la era
//      v971 con img = URL de CDN se descartan AL LEER (en memoria; la
//      fila no se toca) para que dejen de rendirse rotos sin esperar
//      al próximo refresh; img null y /media quedan intactos.
// NO se toca: app.js, styles.css, los index, feed-reconcile.js, el
// endpoint admin de v971 ni su log.
// Uso: node test-lote-localizar-recents.js (desde release/, donde vive
// la suite; el boot usa el puerto 35008 — verificar libre con ss antes).
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

// DATA_DIR efímero ANTES de requerir módulos del árbol: feed-audit.js
// requiere ./db al cargar y, sin DATA_DIR, db.js crearía data/posta.db
// dentro del árbol (la trampa conocida de las suites). El boot usa el
// suyo propio, más abajo.
const SUITE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-rec-suite-data-'));
process.env.DATA_DIR = SUITE_DATA;

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
};
const cnt = (s, sub) => (s.split(sub).length - 1);

const TREE = __dirname;
const BASE = path.join(__dirname, '..', 'base-v972');
const HAS_BASE = fs.existsSync(path.join(BASE, 'server.js'));
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const FA = fs.readFileSync(path.join(TREE, 'feed-audit.js'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const feedAudit = require(path.join(TREE, 'feed-audit.js'));
const feedReconcile = require(path.join(TREE, 'feed-reconcile.js'));

// ---------- 1. Estampado provisional ----------
t('S1: server BUILD v975 ×1 y sin restos de v972', cnt(SRV, "const BUILD_ID = '20261105-v975';") === 1 && cnt(SRV, '20261105-v972') === 0);
t('S2: index ES app.js?v=672 ×1 + styles?v=20261270 ×1 (el lote no toca el cliente)', cnt(IDX, 'app.js?v=672') === 1 && cnt(IDX, 'styles.css?v=20261270') === 1);
t('S3: index EN styles?v=20261270 ×1 y sin app.js?v=', cnt(IDX_EN, 'styles.css?v=20261270') === 1 && cnt(IDX_EN, 'app.js?v=') === 0);
t('S4: app.js byte-idéntico a la base (el lote no toca el cliente)', !HAS_BASE || fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') === APP);

// ---------- 2. Estáticos del lote ----------
t('L1: feed-audit captura el display_url con tope 2048 (sin el corte a 600)', FA.includes('display_url":"((?:[^"\\\\]|\\\\.){0,2048})') && !FA.includes('display_url":"((?:[^"\\\\]|\\\\.){0,600})'));
t('L2: el fallback img=src de v971 está RETIRADO de server.js', cnt(SRV, 'if (!r.img && r.src) r.img = r.src;') === 0 && cnt(SRV, '})).filter((r) => r.img),') >= 1);
t('L3: marcador LOCALIZAR-RECENTS ×3 (feed-audit ×1 + server ×2)', cnt(FA, 'LOCALIZAR-RECENTS') === 1 && cnt(SRV, 'LOCALIZAR-RECENTS') === 2);
t('L4: marcador FIX-GRILLA-PERFIL ×3 en server.js (lo de v971 sigue: endpoint + log + historia)', cnt(SRV, 'FIX-GRILLA-PERFIL') === 3);
t('L5: homeSnapshotGet descarta al leer los recents con img de CDN', SRV.includes("payload.recents = payload.recents.filter((r) => !(r && typeof r.img === 'string' && /^https?:\\/\\/[a-z0-9.-]*cdninstagram\\.com\\//i.test(r.img)));"));
t('L6: el endpoint admin de v971 sigue intacto (GET home-snapshot con requireAdminToken)', cnt(SRV, "app.get('/api/admin/home-snapshot', requireAdminToken") === 1);

// ---------- 3. Parser REAL: la URL firmada larga ya no se trunca ----------
const LONG_TAIL = '00_AQ' + 'X'.repeat(120) + 'FULLTAIL9';
const CLEAN_URL = 'https://scontent-dfw6-2.cdninstagram.com/v/t51.82787-15/885665156_18130063441804836_3971167651997503135_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=106&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=dFvSxXgZb2EQ7kNvwEgoej4&_nc_oc=AdoJQWQ6kjfWIayGKghDyj90hpbEMOYVTLaQcNp8cV79onMapvvz20mQlAMMn42CI-A_rIl5tBF15ZkccgPa1suHAdoJQWQ6kjfWIayGKghDyj90hpbEMOYVTLaQcNp8cV79onMapvvz20mQlAMMn42CI-A_rIl5tBF15ZkccgPa1suH&_nc_zt=23&_nc_ht=scontent-dfw6-2.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=' + LONG_TAIL + '&oe=6AF44AF5';
const ESC_URL = CLEAN_URL.replace(/\//g, '\\/').replace(/&/g, '\\u0026');
const NODE_RAW = '{\\"__typename\\":\\"GraphImage\\",\\"shortcode\\":\\"TESTLONG1\\",\\"taken_at_timestamp\\":1793721600,\\"display_url\\":\\"' + ESC_URL + '\\",\\"edge_liked_by\\":{\\"count\\":5},\\"edge_media_to_comment\\":{\\"count\\":1}}';
const EMBED_HTML = 'relleno' + NODE_RAW + 'relleno';
t('P0: la URL del fixture es de largo real (>600 limpia, como las de la CDN)', CLEAN_URL.length > 600, 'len=' + CLEAN_URL.length);
const parsed = feedAudit.parseEmbedPosts(EMBED_HTML);
t('P1: parseEmbedPosts devuelve el posteo', parsed.length === 1 && parsed[0].shortcode === 'TESTLONG1', JSON.stringify(parsed.map((p) => p.shortcode)));
t('P2: el thumb parseado es la URL COMPLETA (termina en la firma entera)', parsed.length === 1 && parsed[0].thumb === CLEAN_URL, parsed.length ? ('len=' + String(parsed[0].thumb || '').length + ' tail=' + String(parsed[0].thumb || '').slice(-30)) : 'sin posts');
if (HAS_BASE) {
  const baseFA = require(path.join(BASE, 'feed-audit.js'));
  const baseParsed = baseFA.parseEmbedPosts(EMBED_HTML);
  t('P3 (control base v972): la base TRUNCABA el thumb (prefijo propio, sin FULLTAIL9)', baseParsed.length === 1 && !!baseParsed[0].thumb && baseParsed[0].thumb.length < CLEAN_URL.length && CLEAN_URL.startsWith(baseParsed[0].thumb) && !baseParsed[0].thumb.includes('FULLTAIL9'), baseParsed.length ? 'base len=' + String(baseParsed[0].thumb || '').length : 'sin posts');
}

// ---------- 4. localizeTrialPhotos REAL con descarga inyectada ----------
(async () => {
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-rec-media-'));
  const fakeJpeg = Buffer.alloc(3000, 0x89);
  const urlA = 'https://scontent.cdninstagram.com/v/t51/fake-a.jpg';
  const urlB = 'https://scontent.cdninstagram.com/v/t51/fake-b.jpg';
  let calls = 0;
  const okFetch = async () => { calls++; return fakeJpeg; };
  const prof1 = { handle: 'posty.communitymanager', photos: [urlA, urlB] };
  await feedAudit.localizeTrialPhotos(prof1, mediaDir, okFetch);
  t('U1: con descarga OK, las 2 fotos quedan localizadas en /media/igthumb-', prof1.photos.every((x) => typeof x === 'string' && x.startsWith('/media/igthumb-')), JSON.stringify(prof1.photos));
  t('U2: los archivos localizados existen en disco con los bytes descargados', prof1.photos.every((x) => { const f = path.join(mediaDir, path.basename(x)); return fs.existsSync(f) && fs.statSync(f).size === 3000; }));
  calls = 0;
  const prof2 = { handle: 'posty.communitymanager', photos: [urlA, urlB] };
  await feedAudit.localizeTrialPhotos(prof2, mediaDir, okFetch);
  t('U3: idempotente — la segunda pasada NO re-descarga (0 fetches, mismos nombres)', calls === 0 && JSON.stringify(prof2.photos) === JSON.stringify(prof1.photos), 'calls=' + calls);
  const failB = async (u) => { if (u === urlB) throw new Error('http 403'); return fakeJpeg; };
  const mediaDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-rec-media2-'));
  const prof3 = { handle: 'posty.communitymanager', photos: [urlA, urlB] };
  await feedAudit.localizeTrialPhotos(prof3, mediaDir2, failB);
  t('U4: si una descarga falla, solo esa queda null (la otra localiza)', !!prof3.photos[0] && prof3.photos[1] === null, JSON.stringify(prof3.photos));
  fs.rmSync(mediaDir, { recursive: true, force: true });
  fs.rmSync(mediaDir2, { recursive: true, force: true });

  // ---------- 5. VM: homeProfileFromRead con la localización REAL ----------
  function extractHomeProfileFromRead(src) {
    const start = src.indexOf('async function homeProfileFromRead(handle, data) {');
    if (start < 0) return null;
    const end = src.indexOf('\n}\n// (LOTE PERFIL-GRILLA-5-DE-10', start);
    if (end < 0) return null;
    return src.slice(start, end + 2);
  }
  function runHPFR(src, fetchImpl, mediaDir) {
    const fnSrc = extractHomeProfileFromRead(src);
    if (!fnSrc) return Promise.resolve({ error: 'no se pudo extraer homeProfileFromRead' });
    const sandbox = {
      feedAudit: {
        trialProfileFromAudit: () => ({ handle: 'posty.communitymanager', name: 'Posty', pic: null, bio: 'bio', bio_unread: false, link: '' }),
        localizeTrialPhotos: (loc, dir) => feedAudit.localizeTrialPhotos(loc, dir, fetchImpl),
        localizeTrialPic: async () => {},
      },
      feedReconcile,
      igCategoryFields: () => ({}),
      MEDIA_DIR: mediaDir,
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(fnSrc + '\n__f = homeProfileFromRead;', sandbox);
    return sandbox.__f('posty.communitymanager', FIXTURE);
  }
  const FIXTURE = {
    ok: true,
    profile: { followers: 8, posts_count: 11, following: 1, category: 'otro' },
    posts: [
      { thumb: 'https://scontent.cdninstagram.com/v/593.jpg', type: 'GraphVideo', taken_at: 1794440400, shortcode: 'Dfnt-fls8P4', likes: 10, comments: 2 },
      { thumb: 'https://scontent.cdninstagram.com/v/perfume1.jpg', type: 'GraphImage', taken_at: 1793721600, shortcode: 'DfVDDFAjKeG', likes: 5, comments: 1 },
      { thumb: 'https://scontent.cdninstagram.com/v/perfume2.jpg', type: 'GraphSidecar', taken_at: 1793721600, shortcode: 'DfVCqgdjCrO', likes: 7, comments: 0 },
      { thumb: null, type: 'GraphImage', taken_at: 1793721600, shortcode: 'DfXNOTHUMB' },
      { thumb: 'https://scontent.cdninstagram.com/v/child.jpg', type: 'GraphImage', shortcode: 'DfVCn89DB2M' },
    ],
  };
  const vmMedia = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-rec-vm-'));
  const okAll = async () => Buffer.alloc(3000, 0x89);
  const outA = await runHPFR(SRV, okAll, vmMedia);  const recA = (outA && outA.recents) || [];
  t('V1: con localización OK entran los 3 top-level', recA.length === 3, 'recents=' + recA.length);
  t('V2: todos los img son /media/ (servidos por Posty), ninguno es URL remota', recA.length === 3 && recA.every((r) => typeof r.img === 'string' && r.img.startsWith('/media/')), JSON.stringify(recA.map((r) => r.img)));
  t('V3: los archivos de los 3 recents existen en MEDIA_DIR', recA.every((r) => fs.existsSync(path.join(vmMedia, path.basename(r.img)))));
  const failPerfume = async (u) => { if (u.includes('perfume')) throw new Error('http 403'); return Buffer.alloc(3000, 0x89); };
  // Directorio NUEVO para el caso B: si reusara el de A, la caché en
  // disco de localizeTrialPhotos serviría los perfume sin descargar
  // (comportamiento correcto en producción, pero tapa el caso).
  const vmMediaB = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-rec-vm-b-'));
  const outB = await runHPFR(SRV, failPerfume, vmMediaB);
  const recB = (outB && outB.recents) || [];
  t('V4: si la localización de los perfume falla, NO entran (ausentes, no rotos)', recB.length === 1 && recB[0].shortcode === 'Dfnt-fls8P4', 'recents=' + JSON.stringify(recB.map((r) => r.shortcode)));
  t('V5: ningún recent queda con img remota de la CDN', recB.every((r) => !/^https?:\/\//.test(String(r.img || ''))), JSON.stringify(recB.map((r) => r.img)));
  if (HAS_BASE) {
    const baseSRV = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
    const vmMediaBase = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-rec-vm-base-'));
    const outBase = await runHPFR(baseSRV, failPerfume, vmMediaBase);
    const recBase = (outBase && outBase.recents) || [];
    t('V6 (control base v972): la base conservaba los perfume con img = CDN (el tile roto)', recBase.length === 3 && recBase.some((r) => r.shortcode === 'DfVDDFAjKeG' && /^https:\/\/scontent\.cdninstagram\.com\//.test(String(r.img))), 'base recents=' + recBase.length);
    fs.rmSync(vmMediaBase, { recursive: true, force: true });
  }
  fs.rmSync(vmMedia, { recursive: true, force: true });
  fs.rmSync(vmMediaB, { recursive: true, force: true });

  // ---------- 6. Boot real: snapshot legado v971 + /media servido ----------
  const PORT = 35008;
  let portFree = true;
  try {
    const ssOut = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    portFree = !ssOut.split('\n').some((l) => l.includes(':' + PORT + ' '));
  } catch (e) { /* sin ss: se intenta igual y el boot lo dirá */ }
  t('B0: el puerto ' + PORT + ' está libre antes del boot', portFree);
  const BOOT_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-rec-data-'));
  const envBoot = Object.assign({}, process.env, {
    DATA_DIR: BOOT_DATA, PORT: String(PORT),
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    ADMIN_TOKEN: 'localizar-recents-test-token',
    TZ: 'America/New_York',
  });
  const child = spawn('node', ['server.js'], { cwd: TREE, env: envBoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jget = async (p, opts) => {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, opts); const j = await r.json().catch(() => null); return { status: r.status, j }; }
    catch (e) { return { status: 0, j: null }; }
  };
  let version = null;
  for (let i = 0; i < 160 && !version; i++) {
    await sleep(350);
    const r = await jget('/api/version');
    if (r.j && r.j.build) version = r.j;
  }
  t('B1: boot /api/version = v975', !!(version && version.build === '20261105-v975'), JSON.stringify(version));
  if (version) {
    let ok5 = 0;
    for (let i = 0; i < 5; i++) { const r = await jget('/api/version'); if (r.j && r.j.build === '20261105-v975') ok5++; }
    t('B2: boot /api/version 5/5', ok5 === 5, ok5 + '/5');
    // Archivo localizado servido por /media (lo que el teléfono carga).
    const mediaDirBoot = path.join(BOOT_DATA, 'media');
    fs.mkdirSync(mediaDirBoot, { recursive: true });
    const imgBytes = Buffer.alloc(3000, 0x89);
    fs.writeFileSync(path.join(mediaDirBoot, 'igthumb-ok.jpg'), imgBytes);
    const mediaRes = await fetch(`http://127.0.0.1:${PORT}/media/igthumb-ok.jpg`).catch(() => null);
    const mediaBuf = mediaRes ? Buffer.from(await mediaRes.arrayBuffer()) : Buffer.alloc(0);
    t('B3: GET /media/igthumb-ok.jpg -> 200 con los bytes de la imagen (la sirve Posty)', !!mediaRes && mediaRes.status === 200 && mediaBuf.equals(imgBytes), mediaRes ? ('status=' + mediaRes.status + ' bytes=' + mediaBuf.length) : 'sin respuesta');
    t('B4: el /media servido es imagen (content-type image/*)', !!mediaRes && String(mediaRes.headers.get('content-type') || '').startsWith('image/'), mediaRes && mediaRes.headers.get('content-type'));
    // Snapshot legado de la era v971: un recent /media, uno con img=CDN
    // (el fallback retirado) y uno con img null.
    const dbFile = path.join(BOOT_DATA, 'posta.db');
    const db = new DatabaseSync(dbFile);
    const seededAt = 1794486000000;
    const seededPayload = {
      source: 'read', username: 'posty.communitymanager', posts_count: 11,
      highlights: [],
      recents: [
        { img: '/media/igthumb-ok.jpg', src: 'https://scontent.cdninstagram.com/v/593.jpg', type: 'video', taken_at: 1794440400, shortcode: 'Dfnt-fls8P4' },
        { img: 'https://scontent.cdninstagram.com/v/perfume1.jpg', src: 'https://scontent.cdninstagram.com/v/perfume1.jpg', type: 'image', taken_at: 1793721600, shortcode: 'DfVDDFAjKeG' },
        { img: null, src: 'https://scontent.cdninstagram.com/v/sinloc.jpg', type: 'image', taken_at: 1793721600, shortcode: 'SINLOC1' },
      ],
    };
    db.prepare("INSERT INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username, payload=excluded.payload, fetched_at=excluded.fetched_at")
      .run(1, 'posty.communitymanager', JSON.stringify(seededPayload), seededAt);
    const beforeRow = db.prepare('SELECT payload, fetched_at FROM ig_home_snapshot WHERE user_id = ?').get(1);
    const snap = await jget('/api/admin/home-snapshot?user_id=1&token=localizar-recents-test-token');
    const codes = Array.isArray(snap.j && snap.j.recents) ? snap.j.recents.map((r) => r.shortcode) : [];
    t('B5: el snapshot leído descarta el recent con img de CDN (quedan 2: /media y null)', snap.status === 200 && snap.j && snap.j.recents_count === 2 && codes.includes('Dfnt-fls8P4') && codes.includes('SINLOC1') && !codes.includes('DfVDDFAjKeG'), JSON.stringify(codes));
    t('B6: ningún recent servido tiene img remota de la CDN', Array.isArray(snap.j && snap.j.recents) && snap.j.recents.every((r) => !/^https?:\/\/[a-z0-9.-]*cdninstagram\.com\//i.test(String(r.img || ''))), JSON.stringify(snap.j && snap.j.recents));
    const afterRow = db.prepare('SELECT payload, fetched_at FROM ig_home_snapshot WHERE user_id = ?').get(1);
    t('B7: la fila guardada NO se toca al leer (siguen los 3 recents crudos en DB)', !!afterRow && afterRow.payload === beforeRow.payload && afterRow.fetched_at === beforeRow.fetched_at && JSON.parse(afterRow.payload).recents.length === 3);
    try { db.close(); } catch (e) {}
  } else {
    t(false, 'boot: el servidor no levantó', bootLog.slice(0, 500));
  }
  const bootPid = child.pid;
  try { process.kill(bootPid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let stillAlive = true;
  try { process.kill(bootPid, 0); } catch (e) { stillAlive = false; }
  if (stillAlive) { try { process.kill(bootPid, 'SIGKILL'); } catch (e) {} await sleep(800); }
  try { process.kill(bootPid, 0); stillAlive = true; } catch (e) { stillAlive = false; }
  t('B8: el proceso del boot murió por PID exacto', !stillAlive);
  let portFreeAfter = true;
  try {
    const ssOut = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    portFreeAfter = !ssOut.split('\n').some((l) => l.includes(':' + PORT + ' '));
  } catch (e) {}
  t('B9: el puerto ' + PORT + ' quedó libre', portFreeAfter);
  try { fs.rmSync(BOOT_DATA, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(SUITE_DATA, { recursive: true, force: true }); } catch (e) {}
  t('B10: sin release/data tras la suite', !fs.existsSync(path.join(TREE, 'data')));

  console.log(`\ntest-lote-localizar-recents: ${pass} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASH:', e); process.exit(1); });
