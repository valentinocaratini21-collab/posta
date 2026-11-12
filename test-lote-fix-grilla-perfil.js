// test-lote-fix-grilla-perfil.js — LOTE FIX-GRILLA-PERFIL (12/11 · base v970):
// Los 3 posteos de perfume del 4/11 (DfVDDFAjKeG, DfVC-LFMau1, DfVCqgdjCrO)
// están VIVOS en el feed real de Instagram pero no se ven en la vista previa
// del perfil dentro de la app: su único camino es como tiles recientes del
// snapshot, y el snapshot los perdía (o no los traía) en silencio.
// El fix (SOLO server.js):
//  (1) OBSERVABILIDAD: la línea [feed-reconcile] se loguea SIEMPRE, también
//      con archivados=0 y restaurados=0 (antes solo si alguno era >0: un 0/0
//      era invisible hasta con acceso a los logs de Railway).
//  (2) ENDPOINT ADMIN solo-lectura GET /api/admin/home-snapshot?user_id=
//      (requireAdminToken): expone el payload guardado de ig_home_snapshot
//      (recents con shortcode/taken_at/img/src, posts_count, fetched_at).
//      Sin snapshot -> snapshot:null. No escribe nada.
//  (3) FALLBACK img=src: en homeProfileFromRead, si localizeTrialPhotos deja
//      un recent sin img, se conserva con img = src (URL de la CDN) en vez de
//      filtrarlo en silencio — el tile rinde con la URL remota y la
//      localización se reintenta en la próxima lectura. Sin src tampoco hay
//      nada que rendir: se filtra como antes.
// NO se toca: la regla de restore de feed-reconcile.js, ig_state, el badge
// «Publicado» (v925), pzIgLinkVivo (v940), chatMsgHtml, app.js ni styles.css.
// Uso: node test-lote-fix-grilla-perfil.js (desde release/, donde vive la
// suite; el boot usa el puerto 35007 — verificar libre con ss antes).
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
};
const cnt = (s, sub) => (s.split(sub).length - 1);

const TREE = __dirname;
const BASE = path.join(__dirname, '..', 'base-v970');
const HAS_BASE = fs.existsSync(path.join(BASE, 'server.js'));
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const STY = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const REC = fs.readFileSync(path.join(TREE, 'feed-reconcile.js'), 'utf8');

// ---------- 1. Estampado provisional ----------
t('S1: server BUILD v971 ×1', SRV.includes("const BUILD_ID = '20261105-v971';") && cnt(SRV, '20261105-v971') === 1);
t('S2: index ES app.js?v=672 ×1 + styles?v=20261270 ×1', cnt(IDX, 'app.js?v=672') === 1 && cnt(IDX, 'styles.css?v=20261270') === 1);
t('S3: index EN styles?v=20261270 ×1 y sin app.js?v=', cnt(IDX_EN, 'styles.css?v=20261270') === 1 && cnt(IDX_EN, 'app.js?v=') === 0);
t('S4: sin restos de v970/?v=671 en los archivos estampados', cnt(SRV, '20261105-v970') === 0 && cnt(IDX, 'app.js?v=671') === 0 && cnt(SRV, 'app.js?v=671') === 0);
t('S5: styles.css byte-idéntico a la base (el lote no lo toca)', !HAS_BASE || STY === fs.readFileSync(path.join(BASE, 'public', 'styles.css'), 'utf8'));

// ---------- 2. Estáticos del lote ----------
t('L1: marcador FIX-GRILLA-PERFIL ×3 en server.js (endpoint + fallback + log)', cnt(SRV, 'FIX-GRILLA-PERFIL') === 3);
t('L2: endpoint GET /api/admin/home-snapshot ×1 con requireAdminToken', cnt(SRV, "app.get('/api/admin/home-snapshot', requireAdminToken") === 1);
t('L3: el endpoint usa homeSnapshotGet y no escribe (sin INSERT/UPDATE/DELETE/homeSnapshotPut)', (() => {
  const a = SRV.indexOf("app.get('/api/admin/home-snapshot'");
  const b = SRV.indexOf("app.post('/api/admin/stop-publishing'", a);
  const blk = SRV.slice(a, b);
  return blk.includes('homeSnapshotGet(uid)') && !/INSERT INTO|UPDATE |DELETE FROM|homeSnapshotPut/.test(blk);
})());
t('L4: el endpoint responde snapshot:null sin snapshot guardado', SRV.includes("if (!snap) return res.json({ ok: true, user_id: uid, snapshot: null });"));
t('L5: fallback img=src presente en homeProfileFromRead', SRV.includes("if (!r.img && r.src) r.img = r.src;"));
t('L6: el log [feed-reconcile] ya no tiene la guarda archived||restored', !SRV.includes('if (rec && (rec.archived || rec.restored))') && SRV.includes('[feed-reconcile] user ${uid}'));
t('L7: feed-reconcile.js sin marcador del lote (regla de restore intacta)', !REC.includes('FIX-GRILLA-PERFIL'));
t('L8: app.js sin cambio vs base (el lote no toca el cliente)', !HAS_BASE || fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') === APP);
t('L9: chatMsgHtml con su firma de 8 params intacta', cnt(APP, 'chatMsgHtml(role, text, ts, id, reply, cap, photos, post)') === 1);
t('L10: la guarda de restore por presencia sigue en feed-reconcile.js', REC.includes("ig_state === 'archived_ext'") && REC.includes('restored'));

// ---------- 3. VM: fallback img=src en homeProfileFromRead ----------
function extractHomeProfileFromRead(src) {
  const start = src.indexOf('async function homeProfileFromRead(handle, data) {');
  if (start < 0) return null;
  // OJO: el comentario '(LOTE PERFIL-GRILLA-5-DE-10' aparece TAMBIÉN DENTRO
  // de la función (en el campo src del recent) — el cierre es la llave a
  // columna 0 seguida de ese comentario, no la primera ocurrencia.
  const end = src.indexOf('\n}\n// (LOTE PERFIL-GRILLA-5-DE-10', start);
  if (end < 0) return null;
  return src.slice(start, end + 2);
}
function runHomeProfileFromRead(src, fixture) {
  const fnSrc = extractHomeProfileFromRead(src);
  if (!fnSrc) return { error: 'no se pudo extraer homeProfileFromRead' };
  const sandbox = {
    feedAudit: {
      trialProfileFromAudit: () => ({ handle: 'posty.communitymanager', name: 'Posty', pic: null, bio: 'bio', bio_unread: false, link: '' }),
      // La localización falla para los índices 1 y 2 (los dos de perfume)
      // y anda para el 0 (el 593): el caso exacto del incidente.
      localizeTrialPhotos: async (loc) => { loc.photos = loc.photos.map((u, i) => (i === 0 ? '/media/igthumb-ok0.jpg' : null)); },
      localizeTrialPic: async () => {},
    },
    feedReconcile: { isTopLevelReadPost: (x) => !!(x && (x.taken_at || x.caption)) },
    igCategoryFields: () => ({}),
    MEDIA_DIR: '/tmp/fix-grilla-media',
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc + '\n__f = homeProfileFromRead;', sandbox);
  return sandbox.__f('posty.communitymanager', fixture);
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
(async () => {
  const out = await runHomeProfileFromRead(SRV, FIXTURE);
  t('F1: homeProfileFromRead rinde el payload (source read, posts_count 11)', !!out && out.source === 'read' && out.posts_count === 11, JSON.stringify(out && { source: out.source, posts_count: out.posts_count }));
  const rec = (out && out.recents) || [];
  t('F2: los 3 top-level con thumb se conservan (el fallo de localización ya no los tira)', rec.length === 3, 'recents=' + rec.length);
  t('F3: el localizado anda queda con su /media (img intacto, no se pisa con src)', rec[0] && rec[0].img === '/media/igthumb-ok0.jpg' && rec[0].src === 'https://scontent.cdninstagram.com/v/593.jpg', JSON.stringify(rec[0] || null));
  t('F4: el perfume 1 sobrevive con img = src (fallback CDN)', rec[1] && rec[1].img === 'https://scontent.cdninstagram.com/v/perfume1.jpg' && rec[1].src === rec[1].img && rec[1].shortcode === 'DfVDDFAjKeG', JSON.stringify(rec[1] || null));
  t('F5: el perfume 2 (carrusel) sobrevive con img = src y type carousel', rec[2] && rec[2].img === 'https://scontent.cdninstagram.com/v/perfume2.jpg' && rec[2].type === 'carousel' && rec[2].shortcode === 'DfVCqgdjCrO', JSON.stringify(rec[2] || null));
  t('F6: ningún recent queda con img null', rec.every((r) => !!r.img));
  t('F7: el sin thumb y el hijo de carrusel siguen filtrados (no se inventa nada)', !rec.some((r) => r.shortcode === 'DfXNOTHUMB' || r.shortcode === 'DfVCn89DB2M'));
  if (HAS_BASE) {
    const baseOut = await runHomeProfileFromRead(fs.readFileSync(path.join(BASE, 'server.js'), 'utf8'), FIXTURE);
    const baseRec = (baseOut && baseOut.recents) || [];
    t('F8 (control base v970): sin el fix solo sobrevive el localizado (1 recent)', baseRec.length === 1 && baseRec[0].shortcode === 'Dfnt-fls8P4', 'base recents=' + baseRec.length);
  }

  // ---------- 4. VM: el log [feed-reconcile] sale SIEMPRE ----------
  function extractReconcileBlock(src) {
    const a = src.indexOf('const rec = feedReconcile.reconcilePublishedMirror');
    if (a < 0) return null;
    const endMark = "} catch (e) { /* la reconciliación nunca frena la home */ }";
    const b = src.indexOf(endMark, a);
    if (b < 0) return null;
    const start = src.lastIndexOf('try {', a);
    return src.slice(start, b + endMark.length);
  }
  function runReconcileBlock(src, recValue) {
    const blk = extractReconcileBlock(src);
    if (!blk) return { error: 'no se pudo extraer el bloque' };
    const lines = [];
    const sandbox = {
      db: {}, uid: 12, handle: 'posty.communitymanager', data: {}, payload: { posts_count: 11 },
      feedReconcile: { reconcilePublishedMirror: () => recValue },
      console: { log: (...args) => lines.push(args.join(' ')), error: () => {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(blk, sandbox);
    return { lines };
  }
  const g00 = runReconcileBlock(SRV, { archived: 0, restored: 0, seen: 6, total: 11 });
  t('G1: con 0/0 el log [feed-reconcile] SALE (antes era invisible)', Array.isArray(g00.lines) && g00.lines.length === 1 && g00.lines[0].includes('[feed-reconcile]'), JSON.stringify(g00.lines));
  t('G2: la línea 0/0 dice archivados_ext=0 restaurados=0 y la grilla leída 6/11', Array.isArray(g00.lines) && g00.lines.length === 1 && g00.lines[0].includes('archivados_ext=0 restaurados=0') && g00.lines[0].includes('6/11'), JSON.stringify(g00.lines));
  const gNull = runReconcileBlock(SRV, null);
  t('G3: con rec null no se loguea nada (no se inventa un reconcile)', Array.isArray(gNull.lines) && gNull.lines.length === 0, JSON.stringify(gNull.lines));
  const g21 = runReconcileBlock(SRV, { archived: 2, restored: 1, seen: 11, total: 11 });
  t('G4: con cambios el log sigue saliendo (archivados_ext=2 restaurados=1)', Array.isArray(g21.lines) && g21.lines.length === 1 && g21.lines[0].includes('archivados_ext=2 restaurados=1'), JSON.stringify(g21.lines));
  if (HAS_BASE) {
    const baseSrc = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
    const b00 = runReconcileBlock(baseSrc, { archived: 0, restored: 0, seen: 6, total: 11 });
    t('G5 (control base v970): con 0/0 la base NO loguea nada (el bug de observabilidad)', Array.isArray(b00.lines) && b00.lines.length === 0, JSON.stringify(b00.lines));
    const b21 = runReconcileBlock(baseSrc, { archived: 2, restored: 1, seen: 11, total: 11 });
    t('G6 (control base v970): con cambios la base sí logueaba (el fix no cambia ese camino)', Array.isArray(b21.lines) && b21.lines.length === 1, JSON.stringify(b21.lines));
  }

  // ---------- 5. Boot real ----------
  const PORT = 35007;
  let portFree = true;
  try {
    const ssOut = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    portFree = !ssOut.split('\n').some((l) => l.includes(':' + PORT + ' '));
  } catch (e) { /* sin ss: se intenta igual y el boot lo dirá */ }
  t('B0: el puerto ' + PORT + ' está libre antes del boot', portFree);
  const BOOT_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-grilla-data-'));
  const envBoot = Object.assign({}, process.env, {
    DATA_DIR: BOOT_DATA, PORT: String(PORT),
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    ADMIN_TOKEN: 'fix-grilla-test-token',
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
  t('B1: boot /api/version = v971', !!(version && version.build === '20261105-v971'), JSON.stringify(version));
  if (version) {
    let ok5 = 0;
    for (let i = 0; i < 5; i++) { const r = await jget('/api/version'); if (r.j && r.j.build === '20261105-v971') ok5++; }
    t('B2: boot /api/version 5/5', ok5 === 5, ok5 + '/5');
    const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text().catch(() => '');
    t('B3: index servido con app.js?v=672 + styles?v=20261270', idx.includes('app.js?v=672') && idx.includes('styles.css?v=20261270'), idx.slice(0, 120));
    const noTok = await jget('/api/admin/home-snapshot?user_id=1');
    t('B4: GET /api/admin/home-snapshot sin token -> 403', noTok.status === 403, 'status=' + noTok.status);
    const noUid = await jget('/api/admin/home-snapshot?token=fix-grilla-test-token');
    t('B5: GET con token pero sin user_id -> 400', noUid.status === 400, 'status=' + noUid.status);
    const empty = await jget('/api/admin/home-snapshot?user_id=1&token=fix-grilla-test-token');
    t('B6: GET con token y sin snapshot guardado -> ok + snapshot:null', empty.status === 200 && empty.j && empty.j.ok === true && empty.j.snapshot === null, JSON.stringify(empty.j));
    // Siembra un snapshot guardado (los 3 perfume + 593) directo en la DB
    // del boot y se verifica que el endpoint lo expone tal cual, sin escribir.
    const dbFile = path.join(BOOT_DATA, 'posta.db');
    const db = new DatabaseSync(dbFile);
    const seededAt = 1794486000000;
    const seededPayload = {
      source: 'read', username: 'posty.communitymanager', posts_count: 11, fetched_at: seededAt,
      highlights: [],
      recents: [
        { img: '/media/igthumb-593.jpg', src: 'https://scontent.cdninstagram.com/v/593.jpg', type: 'video', taken_at: 1794440400, shortcode: 'Dfnt-fls8P4' },
        { img: null, src: 'https://scontent.cdninstagram.com/v/perfume1.jpg', type: 'image', taken_at: 1793721600, shortcode: 'DfVDDFAjKeG' },
        { img: '/media/igthumb-perfume2.jpg', src: 'https://scontent.cdninstagram.com/v/perfume2.jpg', type: 'carousel', taken_at: 1793721600, shortcode: 'DfVCqgdjCrO' },
      ],
    };
    db.prepare("INSERT INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username, payload=excluded.payload, fetched_at=excluded.fetched_at")
      .run(1, 'posty.communitymanager', JSON.stringify(seededPayload), seededAt);
    const beforeRow = db.prepare('SELECT payload, fetched_at FROM ig_home_snapshot WHERE user_id = ?').get(1);
    const snap1 = await jget('/api/admin/home-snapshot?user_id=1&token=fix-grilla-test-token');
    t('B7: GET con snapshot -> ok, posts_count 11, recents_count 3', snap1.status === 200 && snap1.j && snap1.j.ok === true && snap1.j.posts_count === 11 && snap1.j.recents_count === 3, JSON.stringify(snap1.j));
    const codes = Array.isArray(snap1.j && snap1.j.recents) ? snap1.j.recents.map((r) => r.shortcode) : [];
    t('B8: los recents traen los 3 shortcodes (593 + 2 perfume)', codes.includes('Dfnt-fls8P4') && codes.includes('DfVDDFAjKeG') && codes.includes('DfVCqgdjCrO'), JSON.stringify(codes));
    const p1 = Array.isArray(snap1.j && snap1.j.recents) ? snap1.j.recents.find((r) => r.shortcode === 'DfVDDFAjKeG') : null;
    t('B9: el recent con img null expone img null Y su src (el endpoint no inventa ni tapa)', !!p1 && p1.img === null && p1.src === 'https://scontent.cdninstagram.com/v/perfume1.jpg', JSON.stringify(p1));
    t('B10: fetched_at es el guardado (no se reescribe al leer)', snap1.j && snap1.j.fetched_at === seededAt, 'fetched_at=' + (snap1.j && snap1.j.fetched_at));
    const snap2 = await jget('/api/admin/home-snapshot?user_id=1&token=fix-grilla-test-token');
    const afterRow = db.prepare('SELECT payload, fetched_at FROM ig_home_snapshot WHERE user_id = ?').get(1);
    t('B11: segunda lectura idéntica y la fila en DB intacta (solo lectura, sin escribir)', snap2.j && snap2.j.fetched_at === seededAt && afterRow && afterRow.payload === beforeRow.payload && afterRow.fetched_at === beforeRow.fetched_at, JSON.stringify({ f1: snap1.j && snap1.j.fetched_at, f2: snap2.j && snap2.j.fetched_at }));
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
  t('B12: el proceso del boot murió por PID exacto', !stillAlive);
  let portFreeAfter = true;
  try {
    const ssOut = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    portFreeAfter = !ssOut.split('\n').some((l) => l.includes(':' + PORT + ' '));
  } catch (e) {}
  t('B13: el puerto ' + PORT + ' quedó libre', portFreeAfter);
  try { fs.rmSync(BOOT_DATA, { recursive: true, force: true }); } catch (e) {}

  console.log(`\ntest-lote-fix-grilla-perfil: ${pass} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASH:', e); process.exit(1); });
