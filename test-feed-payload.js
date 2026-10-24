// test-feed-payload.js — v360: datos de payload del feed.
// A) /api/posts trae likes + comments_count REALES desde post_metrics
//    (null cuando el posteo no tiene métricas: jamás inventados) y el
//    detalle (weekCardHTML) los muestra estilo IG solo con datos.
// B) /api/home/profile: category/category_en públicas desde el rubro
//    real (mapa de etiquetas) + note null (sin fuente en la lectura).
// C) Parser del embed: pinned_for_users -> pinned true/false/null.
// D) Sidebar: «Inicio» primero en el drawer (data-tab='inicio').
// E) health-plays: el fallback de BASE_URL es el dominio vigente.
// Uso: node test-feed-payload.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-v360-'));
const PORT = 18793;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function register(email) {
  const rr = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234', business_name: 'Test ' + email }),
  });
  const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
  return { status: rr.status, cookie: cookies.map((c) => c.split(';')[0]).join('; ') };
}
async function api(cookie, method, p, body) {
  const rr = await fetch(BASE + p, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}

// Extrae una función top-level de app.js y la evalúa en un vm con stubs.
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const next = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

(async () => {
  console.log('— v360 feed payload: parser de fijados (sin servidor)');
  const fa = require('./feed-audit');
  const seg = (extra) => `{\\"__typename\\":\\"GraphImage\\",\\"shortcode\\":\\"SC1\\",\\"taken_at_timestamp\\":1760000000,\\"edge_media_to_comment\\":{\\"count\\":4},\\"edge_liked_by\\":{\\"count\\":9},\\"display_url\\":\\"https://cdn.example/x.jpg\\"${extra}}`;
  const p1 = fa.parseEmbedPosts(seg(',\\"pinned_for_users\\":[{\\"id\\":\\"42\\"}]'));
  ok(p1.length === 1 && p1[0].pinned === true, `C1 pinned_for_users no vacío -> pinned true (vino ${p1[0] && p1[0].pinned})`);
  ok(p1[0].likes === 9 && p1[0].comments === 4, 'C1 likes/comments del embed intactos (9/4)');
  const p2 = fa.parseEmbedPosts(seg(',\\"pinned_for_users\\":[]'));
  ok(p2.length === 1 && p2[0].pinned === false, 'C2 pinned_for_users vacío -> pinned false');
  const p3 = fa.parseEmbedPosts(seg(''));
  ok(p3.length === 1 && p3[0].pinned === null, 'C3 sin marca de fijado -> pinned null (no se asume)');

  console.log('— v360 feed payload: cliente (app.js)');
  const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  const drawerIdx = appSrc.indexOf('data-tab="inicio"');
  const schedIdx = appSrc.indexOf('data-tab="schedule"');
  ok(drawerIdx > 0 && schedIdx > drawerIdx, 'D1 el drawer trae Inicio (data-tab=inicio) ANTES de Semana');
  ok(appSrc.includes("'Home' : 'Inicio'"), 'D2 etiqueta del drawer con paridad EN (Home/Inicio)');
  ok(appSrc.includes('const HOME_PIN_SVG'), 'A1 glifo pin definido');
  ok(appSrc.includes('t.pinned ? HOME_PIN_SVG'), 'A1 la tile de recientes usa el pin solo si pinned');
  ok(appSrc.includes('class="hf-cat"'), 'A4 el header renderiza la línea de categoría cuando el payload la trae');
  ok(appSrc.includes('class="hf-note"'), 'A5 el header renderiza la burbuja de nota solo con nota real');
  ok(appSrc.includes('igmock-comments'), 'A2 la línea «Ver los N comentarios» existe en el detalle');

  const ctx = vm.createContext({
    console, Date, Math, Number, String, Array, Object, JSON,
    ME: { lang: 'es' }, PROFILE: { ig_username: 'cafesol' },
    LP_WEEK_ICONS: '<i>icons</i>',
    f3ThreadHTML: () => '',
    pcParseDate: () => null, pcFmtDayLong: () => '',
    assetLogo: () => null, brandColors: () => ['#2793C8'],
  });
  const escSrc = appSrc.slice(appSrc.indexOf('const esc ='), appSrc.indexOf('\n', appSrc.indexOf('const esc =')));
  vm.runInContext(escSrc, ctx);
  vm.runInContext(extractFn(appSrc, 'igRelTime'), ctx);
  vm.runInContext(extractFn(appSrc, 'weekCardHTML'), ctx);
  const basePost = { id: 5, media_type: 'image', status: 'published', image_path: '/media/x.jpg', caption: 'Hola', hashtags: '', published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), scheduled_at: null };
  const withData = vm.runInContext(`weekCardHTML(${JSON.stringify({ ...basePost, likes: 128, comments_count: 7 })}, { bizName: 'Café Sol', user: 'cafesol' })`, ctx);
  ok(withData.includes('128') && withData.includes('Me gusta'), 'A3 con métricas reales el detalle muestra «128 Me gusta»');
  ok(withData.includes('Ver los 7 comentarios'), 'A2 con comentarios reales muestra «Ver los 7 comentarios»');
  ok(!withData.includes('Sé el primero'), 'A3 con datos NO aparece la variante de cero likes');
  const noData = vm.runInContext(`weekCardHTML(${JSON.stringify({ ...basePost, likes: null, comments_count: null })}, { bizName: 'Café Sol', user: 'cafesol' })`, ctx);
  ok(noData.includes('Sé el primero en indicar que te gusta'), 'A3 sin métricas queda la variante de cero likes (nada inventado)');
  ok(!noData.includes('Ver los'), 'A2 sin comentarios no aparece la línea de comentarios');
  const enCtxCheck = vm.runInContext(`(ME.lang = 'en', weekCardHTML(${JSON.stringify({ ...basePost, likes: 3, comments_count: 1 })}, { bizName: 'Café Sol', user: 'cafesol' }))`, ctx);
  ok(enCtxCheck.includes('3 likes') && enCtxCheck.includes('View 1 comment'), 'A2/A3 paridad EN («3 likes» / «View 1 comment»)');

  console.log('— v360 feed payload: servidor (boot sembrado)');
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken360' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'server booteó');
    const v = await api('', 'GET', '/api/version');
    ok(v.data && String(v.data.build).endsWith('v360'), `build v360 (vino ${v.data && v.data.build})`);
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const u = await register('feed360@example.com');
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('feed360@example.com').id;
    db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET ig_username = excluded.ig_username, category = excluded.category`)
      .run(uid, 'Café Sol', 'cafesol', 'gastronomia');
    const mkPost = (status, igId, pubAt) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, ig_media_id, published_at, scheduled_at)
      VALUES (?, '/media/x.jpg', 'Hola', ?, ?, ?, ?)`).run(uid, status, igId || '', pubAt || null, pubAt || null).lastInsertRowid;
    const pMet = mkPost('published', 'IGM1', '2026-10-20 15:00:00');
    db.prepare('INSERT INTO post_metrics (post_id, reach, likes, comments, saved) VALUES (?,?,?,?,?)').run(Number(pMet), 900, 128, 7, 3);
    const pNoMet = mkPost('published', 'IGM2', '2026-10-21 15:00:00');
    const pSched = mkPost('scheduled', '', null);

    const posts = await api(u.cookie, 'GET', '/api/posts');
    ok(Array.isArray(posts.data), 'A /api/posts responde array');
    const byId = {};
    for (const r of posts.data || []) byId[r.id] = r;
    ok(byId[Number(pMet)] && byId[Number(pMet)].likes === 128 && byId[Number(pMet)].comments_count === 7,
      `A3/A2 el posteo con métricas trae likes=128 y comments_count=7 (vino ${byId[Number(pMet)] && byId[Number(pMet)].likes}/${byId[Number(pMet)] && byId[Number(pMet)].comments_count})`);
    ok(byId[Number(pNoMet)] && byId[Number(pNoMet)].likes === null && byId[Number(pNoMet)].comments_count === null,
      'A3/A2 el posteo SIN métricas trae null (no 0, no inventado)');
    ok(byId[Number(pSched)] && byId[Number(pSched)].likes === null, 'A3 el programado sin publicar trae likes null');

    // Snapshot con la forma v359 (sin category/note): al servir se completa.
    db.prepare('INSERT OR REPLACE INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (?,?,?,?)')
      .run(uid, 'cafesol', JSON.stringify({
        source: 'read', username: 'cafesol', name: 'Café Sol', pic: null, bio: 'Café', bio_unread: false,
        link: '', followers: 10, posts_count: 3, following: 2, highlights: [],
        recents: [{ img: '/media/r.jpg', type: 'image', taken_at: 1760000000, shortcode: 'SC1', likes: 9, comments: 4, pinned: true }],
      }), Date.now());
    const prof = await api(u.cookie, 'GET', '/api/home/profile');
    ok(prof.data && prof.data.category === 'Restaurante' && prof.data.category_en === 'Restaurant',
      `A4 category pública desde el rubro real (vino ${prof.data && prof.data.category}/${prof.data && prof.data.category_en})`);
    ok(prof.data && prof.data.note === null, 'A5 note llega null (sin fuente: no se inventa)');
    const rec = prof.data && Array.isArray(prof.data.recents) && prof.data.recents[0];
    ok(rec && rec.pinned === true && rec.likes === 9 && rec.comments === 4, 'A1/A2 los recientes conservan pinned/likes/comments reales del snapshot');

    console.log('— v360 health-plays (ítem C)');
    const hp = fs.readFileSync(path.join(__dirname, 'health-plays.js'), 'utf8');
    ok(hp.includes("|| 'https://postycommunitymanager.com'"), 'C el fallback de BASE_URL es el dominio vigente');
    ok(!/BASE_URL[\s\S]{0,120}postyhacetodo\.com/.test(hp.split('\n').find((l) => l.includes('const BASE_URL')) || ''), 'C el fallback ya no apunta al dominio viejo');
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
  }

  console.log(`\n${total - fails}/${total} checks OK`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
