// test-v331-home.js — v331: la home ES el perfil literal del cliente.
// Parte 1 (endpoint GET /api/home/profile): la réplica se sirve de la
// lectura guardada TAL CUAL (destacadas y conteos reales pasan exactos;
// lo que no vino queda null/ausente — NUNCA se inventa), y una cuenta
// sin Instagram cae al kit de nacimiento (source 'kit').
// Parte 2 (composición pura HOME_FEED extraída de public/app.js): la
// semana va en su posición final (orden de publicación), la marca
// NUEVO vive solo en borradores (al aceptar se apaga y la pieza NO
// desaparece), las historias quedan fuera, los posteos leídos no
// duplican a los publicados por Posty, y el cap es 24.
// Uso: node test-v331-home.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-v331-'));
const PORT = 18791;
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

(async () => {
  console.log('— v331 home: endpoint /api/home/profile');
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken331' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'server booteó');
    if (!srvLog) {}
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const uidOf = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const snap = (uid, username, payload, ageSec) => {
      // fetched_at es epoch ms (así lo escribe homeSnapshotPut).
      const at = Date.now() - (ageSec || 0) * 1000;
      db.prepare('INSERT OR REPLACE INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (?,?,?,?)')
        .run(uid, username, JSON.stringify(payload), at);
    };
    // La fila de profiles nace perezosa (primer getProfile): el test la
    // crea/actualiza directo, como quedaría tras guardar el perfil.
    const setProfile = (uid, ig, biz) => {
      db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET ig_username = excluded.ig_username, business_name = excluded.business_name`)
        .run(uid, biz || '', ig || '');
    };

    // ── A: snapshot completo (destacadas + conteos + recientes) → pasa exacto
    const uA = await register('a331@example.com');
    const uidA = uidOf('a331@example.com');
    setProfile(uidA, 'cafesol', 'Café Sol');
    snap(uidA, 'cafesol', {
      source: 'read', username: 'cafesol', name: 'Café Sol', bio: 'Café de especialidad\nBarrio Norte', bio_unread: false,
      link: 'https://cafesol.example', pic: '/media/igthumb-pic-cafesol.jpg',
      followers: 340, posts_count: 128, following: 57,
      highlights: [{ title: 'Menú', cover: '/media/hl1.jpg' }, { title: 'Local', cover: '/media/hl2.jpg' }],
      recents: [
        { img: '/media/igthumb-a.jpg', type: 'image', taken_at: 1760000000 },
        { img: '/media/igthumb-b.jpg', type: 'video', taken_at: 1759000000 },
      ],
    }, 60);
    const rA = await api(uA.cookie, 'GET', '/api/home/profile');
    ok(rA.status === 200 && rA.data && rA.data.ok === true, `A endpoint responde ok (status ${rA.status})`);
    ok(rA.data.source === 'read', `A source = read (vino ${rA.data.source})`);
    ok(rA.data.username === 'cafesol' && rA.data.name === 'Café Sol', 'A username y nombre reales');
    ok(rA.data.followers === 340 && rA.data.posts_count === 128 && rA.data.following === 57, 'A conteos EXACTOS (340/128/57), sin redondeo');
    ok(Array.isArray(rA.data.highlights) && rA.data.highlights.length === 2 && rA.data.highlights[0].title === 'Menú', 'A destacadas reales presentes con título y portada');
    ok(Array.isArray(rA.data.recents) && rA.data.recents.length === 2 && rA.data.recents[1].type === 'video', 'A recientes leídos presentes');
    ok(String(rA.data.bio).includes('Barrio Norte') && rA.data.bio_unread === false, 'A bio línea por línea');

    // ── B: snapshot SIN destacadas y con conteos null → nada inventado
    const uB = await register('b331@example.com');
    const uidB = uidOf('b331@example.com');
    setProfile(uidB, 'tiendab', 'Tienda B');
    snap(uidB, 'tiendab', {
      source: 'read', username: 'tiendab', name: 'Tienda B', bio: '', bio_unread: true, link: '', pic: null,
      followers: null, posts_count: null, following: null, recents: [],
      // sin clave highlights a propósito
    }, 60);
    const rB = await api(uB.cookie, 'GET', '/api/home/profile');
    ok(rB.data && rB.data.source === 'read', `B source = read (vino ${rB.data && rB.data.source})`);
    ok(Array.isArray(rB.data.highlights) && rB.data.highlights.length === 0, 'B sin destacadas en la lectura → fila vacía, no inventada');
    ok(rB.data.followers === null && rB.data.posts_count === null && rB.data.following === null, 'B conteos no leídos quedan null (no 0, no estimados)');
    ok(rB.data.pic === null && rB.data.bio_unread === true, 'B foto ausente y bio no leída quedan declaradas');

    // ── C: cuenta nueva sin Instagram → kit de nacimiento
    const uC = await register('c331@example.com');
    setProfile(uidOf('c331@example.com'), '', 'Panadería Nueva');
    const rC = await api(uC.cookie, 'GET', '/api/home/profile');
    ok(rC.data && rC.data.source === 'kit', `C sin IG → source kit (vino ${rC.data && rC.data.source})`);
    ok(rC.data && rC.data.username === '' && Array.isArray(rC.data.highlights) && Array.isArray(rC.data.recents), 'C kit: sin username, sin destacadas, sin recientes');
    ok(rC.data && String(rC.data.name || '').length > 0, 'C kit trae nombre del negocio (propuesta de nacimiento)');

    // ── D: sin sesión → 401
    const rD = await fetch(`${BASE}/api/home/profile`);
    ok(rD.status === 401, `D sin sesión → 401 (vino ${rD.status})`);
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
  }

  console.log('— v331 home: composición pura HOME_FEED (extraída de app.js)');
  const src = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  const a = src.indexOf('const HOME_FEED_CAP');
  const b = src.indexOf('/* ===== /HOME_FEED ===== */', a);
  ok(a > 0 && b > a, 'bloque HOME_FEED delimitado en app.js');
  const sandbox = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (p) => p,
  };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(a, b), sandbox);
  const { homeGridCompose, homeHeadHTML, homeTileHTML } = sandbox;
  ok(typeof homeGridCompose === 'function' && typeof homeHeadHTML === 'function' && typeof homeTileHTML === 'function', 'funciones puras cargadas');

  const P = (id, status, extra) => Object.assign({ id, status, media_type: 'image', image_path: '/media/p' + id + '.jpg' }, extra || {});
  const up = [
    { p: P(1, 'draft'), ymd: '2026-10-27' },
    { p: P(2, 'scheduled', { scheduled_at: '2026-10-28T13:00:00.000Z' }), ymd: '2026-10-28' },
    { p: P(3, 'draft'), ymd: '2026-10-29' },
    { p: P(4, 'draft', { media_type: 'story' }), ymd: '2026-10-29' },
  ];
  const tiles = homeGridCompose({ upcoming: up, published: [], recents: [] });
  ok(tiles.length === 3, `composición: 3 piezas (la historia queda fuera), vinieron ${tiles.length}`);
  ok(tiles.map((t) => t.post.id).join(',') === '1,2,3', 'composición: la semana queda en su orden de publicación (el próximo arriba)');
  ok(tiles[0].isNew === true && tiles[1].isNew === false && tiles[2].isNew === true, 'marca NUEVO: solo en borradores pendientes');
  const accepted = homeGridCompose({ upcoming: [{ p: P(1, 'scheduled'), ymd: '2026-10-27' }], published: [], recents: [] });
  ok(accepted.length === 1 && accepted[0].isNew === false, 'al aceptar: la marca se apaga y la pieza NO desaparece');

  const pubMs = Date.parse('2026-10-20T15:00:00.000Z');
  const tiles2 = homeGridCompose({
    upcoming: [],
    published: [P(9, 'published', { published_at: '2026-10-20T15:00:00.000Z' }), P(10, 'published', { media_type: 'story', published_at: '2026-10-21T15:00:00.000Z' })],
    recents: [
      { img: '/media/old.jpg', type: 'image', taken_at: Math.floor(pubMs / 1000) - 86400 },
      { img: '/media/dup.jpg', type: 'image', taken_at: Math.floor(pubMs / 1000) + 86400 },
      { img: '/media/nodate.jpg', type: 'image', taken_at: null },
    ],
  });
  ok(tiles2.length === 2 && tiles2[0].post && tiles2[0].post.id === 9 && tiles2[1].img === '/media/old.jpg',
    `dedupe: publicado + solo el leído ANTERIOR (vinieron ${tiles2.length})`);
  const tiles3 = homeGridCompose({ upcoming: [], published: [], recents: [{ img: '/media/x.jpg', type: 'image', taken_at: null }, { img: '/media/y.jpg', type: 'carousel', taken_at: 123 }] });
  ok(tiles3.length === 2, 'sin publicados por Posty: los leídos entran todos (no hay duplicado posible)');
  const many = [];
  for (let i = 0; i < 30; i++) many.push({ img: '/media/m' + i + '.jpg', type: 'image', taken_at: i });
  ok(homeGridCompose({ upcoming: [], published: [], recents: many }).length === 24, 'cap de grilla: 24 tiles');

  const headFull = homeHeadHTML({ username: 'cafesol', name: 'Café Sol', bio: 'Línea 1\nLínea 2', bio_unread: false, link: '', pic: null, followers: 340, posts_count: 128, following: 57, highlights: [{ title: 'Menú', cover: '/media/h.jpg' }] }, 'X');
  ok(headFull.includes('cafesol') && headFull.includes('340') && headFull.includes('seguidores') && headFull.includes('Menú') && headFull.includes('hf-hls'), 'encabezado completo: username, conteos, destacadas');
  ok(headFull.includes('Línea 1') && headFull.includes('Línea 2'), 'encabezado: bio línea por línea');
  const headNull = homeHeadHTML({ username: 'tiendab', name: 'Tienda B', bio: 'no leída', bio_unread: true, link: '', pic: null, followers: null, posts_count: null, following: null, highlights: [] }, 'X');
  ok(!headNull.includes('seguidores') && !headNull.includes('publicaciones') && !headNull.includes('hf-hls') && !headNull.includes('no leída'),
    'encabezado honesto: sin conteos no hay fila de stats, sin destacadas no hay fila, bio no leída no se muestra');
  const tileNew = homeTileHTML(tiles[0], 0);
  ok(tileNew.includes('hf-new') && tileNew.includes('NUEVO') && tileNew.includes('data-post-id="1"'), 'tile de borrador: pill NUEVO + data para la ampliación');
  const tileIg = homeTileHTML({ kind: 'ig', img: '/media/z.jpg', type: 'video', taken_at: 1, isNew: false }, 1);
  ok(tileIg.includes('data-lightbox="/media/z.jpg"') && tileIg.includes('hf-glyph'), 'tile leído: lightbox + glifo de reel');

  console.log(fails ? `\n✗ ${fails}/${total} FALLOS` : `\n✓ ${total}/${total} OK`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
