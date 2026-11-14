// test-lote-conserje-foto-video.js — LOTE CONSERJE-FOTO-VIDEO
// (14/11, captura de Valentino 15:30: «no me aparecen las imagenes en
// conserje» — 5 de 7 tarjetas oscuras con el ícono roto). Causa raíz:
// un posteo de video guarda el .mp4 en posts.image_path y el conserje
// lo pintaba con <img src="….mp4"> en la lista, el detalle, «Ver en
// el feed» y el detalle de pedidos por voz (donde un onerror lo
// ocultaba en silencio). cover_path existía pero la generación de la
// prueba nunca lo poblaba.
// El lote:
//   · server.js: posterUrlDePosteo/asegurarCoverDeVideo — el póster
//     es cover_path si existe; si no, el frame se extrae UNA vez
//     (ffmpeg, <stem>-cover.jpg) y se persiste en cover_path. La vía
//     perezosa cubre el stock; importTrialWeek y
//     crearPosteoRescateTardio extraen el frame al NACER el video de
//     la prueba y lo guardan en el INSERT.
//   · conserje-revision.itemView y support-cases.voiceRequests
//     exponen media_type (ya estaba) y poster_url por posteo; el
//     endpoint de feed y subirPedidoPublico suman poster_url.
//   · chunk-conserje.js: las superficies eligen por payload — foto →
//     <img>; video → póster con marca ▶; video sin póster → marcador
//     honesto «Video». Fuera el onerror que ocultaba en silencio.
// PIN MADRE: ningún <img src$=".mp4"> en NINGUNA superficie del
// conserje, con los 7 posteos de la captura como fixture.
// Uso: node test-lote-conserje-foto-video.js → contra este árbol
//      PZ_TREE=<árbol> node test-lote-conserje-foto-video.js → control
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('node:vm');
const { spawn, execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.env.PZ_TREE || __dirname;
const PIN_MP4 = /<img[^>]*src="[^"]*\.mp4"/;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const absStub = (uid, p) => 'https://cdn.test' + String(p || '');

// ================= §A1 · payload de la revisión (módulo) =================
function seccionRevision() {
  console.log('— §A1 payload · colaRevision expone poster_url —');
  const rev = require(path.join(TREE, 'conserje-revision.js'));
  const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));
  const OWNER_TZ = 'America/New_York';
  const NOW = new Date();
  const HOY = dayKeyInTz(NOW, OWNER_TZ);
  const MANANA = (() => { const d = new Date(Date.UTC(+HOY.slice(0, 4), +HOY.slice(5, 7) - 1, +HOY.slice(8, 10), 12)); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const slot = (hh) => rev.wallToUtc(MANANA + ' ' + String(hh).padStart(2, '0') + ':00', OWNER_TZ);
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT DEFAULT '', plan TEXT DEFAULT '', plan_status TEXT DEFAULT 'active', publishing_stopped INTEGER DEFAULT 0, concierge INTEGER NOT NULL DEFAULT 0, best_hour INTEGER DEFAULT 19, trial_ends_at INTEGER, created_at TEXT DEFAULT '2026-10-01 00:00:00');
    CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '', tone TEXT DEFAULT '', description TEXT DEFAULT '');
    CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '');
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'pending', media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '', cover_path TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, source_topic TEXT DEFAULT '', week_key TEXT DEFAULT '', strategy_why TEXT DEFAULT '', error TEXT DEFAULT '', tipo TEXT DEFAULT '', user_stopped INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-10-20 00:00:00', published_at TEXT);
    CREATE TABLE support_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, tipo TEXT DEFAULT '', estado TEXT DEFAULT 'abierto', siguiente_paso TEXT DEFAULT '', titulo TEXT DEFAULT '', dedup_key TEXT DEFAULT '');
    CREATE TABLE support_team_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT DEFAULT '', action TEXT DEFAULT '', user_id INTEGER, post_id INTEGER, case_id INTEGER, detalle TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE style_rules (user_id INTEGER, rule_key TEXT, rule_text TEXT DEFAULT '', hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1, PRIMARY KEY (user_id, rule_key));
    CREATE TABLE cm_semana (user_id INTEGER NOT NULL, week_key TEXT NOT NULL, tema TEXT DEFAULT '', siembra TEXT DEFAULT '', cierre TEXT DEFAULT '', origen TEXT DEFAULT '', formatos_json TEXT DEFAULT '[]', objetivo TEXT DEFAULT '', hora_recomendada INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, week_key));
    CREATE TABLE cm_gusto (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, senal TEXT NOT NULL DEFAULT '', tema TEXT DEFAULT '', angulo TEXT DEFAULT '', formato TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (user_id, post_id, senal));
    CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT NOT NULL DEFAULT '{}', hash TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '');
    CREATE TABLE health_interventions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierta', created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, days_to_resolve INTEGER);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  const users = [
    [87, 'portrait@coffee.test', 'posty', 'active', '2026-10-05 00:00:00'],
    [88, 'top@class.test', 'posty', 'trial', '2026-11-01 00:00:00'],
    [89, 'ladyee@boutique.test', 'posty', 'active', '2026-10-10 00:00:00'],
  ];
  for (const [id, email, plan, st, created] of users) {
    db.prepare('INSERT INTO users (id, email, plan, plan_status, created_at) VALUES (?,?,?,?,?)').run(id, email, plan, st, created);
    db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?)').run(id, OWNER_TZ);
  }
  const profs = [
    [87, 'Portrait Coffee', 'portrait.coffee', 'Cafetería', 'Cercano'],
    [88, 'Top Class', 'topclass', 'Barbería', 'Cercano'],
    [89, 'Ladyee Boutique', 'ladyee', 'Moda', 'Elegante'],
  ];
  for (const [uid, b, ig, cat, tone] of profs) {
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, tone) VALUES (?,?,?,?,?)').run(uid, b, ig, cat, tone);
  }
  db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type) VALUES (571, 87, '/media/571.jpg', 'El single origin de esta semana.', ?, 'scheduled', 'pending', 'image')`).run(slot(19));
  db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type, cover_path) VALUES (576, 88, '/media/576.mp4', 'El tour del local.', ?, 'scheduled', 'pending', 'video', '/media/576-cover.jpg')`).run(slot(19));
  db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type, cover_path) VALUES (578, 89, '/media/578.mp4', 'El reel de la colección.', ?, 'scheduled', 'pending', 'video', '')`).run(slot(19));

  // Con la costura del servidor: cover guardado gana; sin cover, el
  // frame extraído que el servidor resuelve.
  const posterStub = (uid, post) => (post.cover_path ? absStub(uid, post.cover_path) : 'https://cdn.test/media/extraido-' + post.id + '.jpg');
  const cola = rev.colaRevision(db, { fecha: MANANA, absImageUrl: absStub, posterUrlFor: posterStub });
  const it87 = cola.items.find((i) => i.user_id === 87);
  const it88 = cola.items.find((i) => i.user_id === 88);
  const it89 = cola.items.find((i) => i.user_id === 89);
  check('la cola trae los 3 posteos de mañana', cola.ok && !!it87 && !!it88 && !!it89);
  check('foto: poster_url vacío y su image_url es la foto', !!it87 && it87.post.poster_url === '' && it87.post.image_url === 'https://cdn.test/media/571.jpg');
  check('video CON cover: poster_url es el cover', !!it88 && it88.post.poster_url === 'https://cdn.test/media/576-cover.jpg', it88 && it88.post.poster_url);
  check('video SIN cover: poster_url es el frame que resuelve el servidor', !!it89 && it89.post.poster_url === 'https://cdn.test/media/extraido-578.jpg', it89 && it89.post.poster_url);
  check('el payload no miente: el video conserva media_type e image_url (el front elige)', !!it88 && it88.post.media_type === 'video' && it88.post.image_url === 'https://cdn.test/media/576.mp4');
  // Sin la costura: el cover guardado alcanza; sin cover no se inventa.
  const cola2 = rev.colaRevision(db, { fecha: MANANA, absImageUrl: absStub });
  const it88b = cola2.items.find((i) => i.user_id === 88);
  const it89b = cola2.items.find((i) => i.user_id === 89);
  check('sin posterUrlFor: el cover guardado sigue exponiéndose', !!it88b && it88b.post.poster_url === 'https://cdn.test/media/576-cover.jpg');
  check('sin posterUrlFor ni cover: poster_url vacío (el front pinta su marcador)', !!it89b && it89b.post.poster_url === '');
}

// ================= §A2 · payload de pedidos por voz (módulo) =================
function seccionVoz() {
  console.log('— §A2 payload · voiceRequests expone poster_url en el posteo —');
  const support = require(path.join(TREE, 'support-cases.js'));
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '');
    CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '');
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', caption TEXT DEFAULT '', image_path TEXT DEFAULT '', prev_image_path TEXT DEFAULT '', cover_path TEXT DEFAULT '', scheduled_at TEXT, published_at TEXT);
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, user_id INTEGER, role TEXT DEFAULT 'user', text TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), post_id INTEGER DEFAULT 0, hilo TEXT DEFAULT '');
  `);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (87, ?, ?)').run('Portrait Coffee', 'portrait.coffee');
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (87, ?)').run('America/New_York');
  db.prepare(`INSERT INTO posts (id, user_id, status, media_type, caption, image_path, cover_path, scheduled_at) VALUES (701, 87, 'scheduled', 'video', 'el reel del local', '/media/701.mp4', '/media/701-cover.jpg', '2026-11-14 00:00:00')`).run();
  db.prepare(`INSERT INTO posts (id, user_id, status, media_type, caption, image_path, published_at) VALUES (702, 87, 'published', 'image', 'la foto de la casa', '/media/702.jpg', '2026-11-12 00:00:00')`).run();
  const msgs = [
    [1, 87, 'user', 'rehacé el video con otro plano', 'post', 701],
    [2, 87, 'assistant', 'Listo, lo rehice ✓', 'post', 701],
    [3, 87, 'user', 'qué linda quedó la foto', 'post', 702],
    [4, 87, 'assistant', 'Sale así ✓', 'post', 702],
  ];
  for (const m of msgs) db.prepare('INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id) VALUES (?,?,?,?,?,?)').run(...m);
  const out = support.voiceRequests(db, { absImageUrl: absStub });
  const p701 = out.pedidos.find((p) => p.posteo && p.posteo.id === 701);
  const p702 = out.pedidos.find((p) => p.posteo && p.posteo.id === 702);
  check('los dos pedidos salen con su posteo', out.ok && !!p701 && !!p702);
  check('posteo video: poster_url es su cover (fallback por cover_path)', !!p701 && p701.posteo.poster_url === 'https://cdn.test/media/701-cover.jpg', p701 && p701.posteo.poster_url);
  check('posteo foto: poster_url vacío', !!p702 && p702.posteo.poster_url === '');
  const out2 = support.voiceRequests(db, { absImageUrl: absStub, posterUrlFor: (uid, post) => 'https://cdn.test/media/stub-' + post.id + '.jpg' });
  const p701b = out2.pedidos.find((p) => p.posteo && p.posteo.id === 701);
  check('con posterUrlFor del servidor, ese valor manda', !!p701b && p701b.posteo.poster_url === 'https://cdn.test/media/stub-701.jpg');
}

// ================= §B · render del chunk en VM =================
function seccionRender() {
  console.log('— §B render · las superficies eligen por payload (los 7 de la captura) —');
  const chunkSrc = fs.readFileSync(path.join(TREE, 'public', 'chunk-conserje.js'), 'utf8');
  const ctx = {
    console,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    $: () => null,
    adminApi: async () => ({ ok: true, pedidos: [] }),
    document: { querySelector: () => null },
    location: { hash: '' },
    sessionStorage: { getItem: () => null, removeItem: () => {} },
    localStorage: { setItem: () => {} },
    window: {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(chunkSrc, ctx, { filename: 'chunk-conserje.js' });
  const fnsOk = typeof ctx.conserjeMiniFotoHTML === 'function' && typeof ctx.conserjeFotoHTML === 'function'
    && typeof ctx.conserjeFeedTileHTML === 'function' && typeof ctx.conserjePedidoDetalleHTML === 'function'
    && typeof ctx.conserjePedidoSubirDetalleHTML === 'function';
  check('el chunk carga y expone las superficies de foto/video', fnsOk);
  if (!fnsOk) return;

  // Los 7 posteos de la captura del 14/11 15:30, con la forma del
  // payload vigente: 2 fotos (Blind Barber 677, Posty 582) y 5 videos
  // con póster (Hungry Ghost 643, Jeni's 667, Mejuri 664,
  // The Ordinary 670, Veja 661).
  const itemFoto = (uid, name, id, img) => ({ user_id: uid, business_name: name, post: { id, image_url: 'https://cdn.test/media/' + img, poster_url: '', media_type: 'image', tiene_foto: true } });
  const itemVideo = (uid, name, id, poster) => ({ user_id: uid, business_name: name, post: { id, image_url: 'https://cdn.test/media/' + id + '.mp4', poster_url: poster ? 'https://cdn.test/media/' + id + '-cover.jpg' : '', media_type: 'video', tiene_foto: true } });
  const siete = [
    itemFoto(101, 'Blind Barber', 677, '677.jpg'),
    itemFoto(12, 'Posty.', 582, '582.jpg'),
    itemVideo(96, 'Hungry Ghost Coffee', 643, true),
    itemVideo(98, "Jeni's Ice Creams", 667, true),
    itemVideo(97, 'Mejuri', 664, true),
    itemVideo(99, 'The Ordinary', 670, true),
    itemVideo(94, 'Veja', 661, true),
  ];
  let todo = '';
  for (const it of siete) {
    const mini = ctx.conserjeMiniFotoHTML(it);
    const grande = ctx.conserjeFotoHTML(it, true);
    todo += mini + grande;
    if (it.post.media_type === 'image') {
      check('foto ' + it.post.id + ' (' + it.business_name + '): su <img> .jpg intacta, sin marca de video',
        mini.includes('<img src="https://cdn.test/media/' + it.post.id + '.jpg"') && !mini.includes('▶'));
    } else {
      check('video ' + it.post.id + ' (' + it.business_name + '): mini con su póster y marca ▶',
        mini.includes('<img src="https://cdn.test/media/' + it.post.id + '-cover.jpg"') && mini.includes('▶') && !mini.includes('.mp4'));
      check('video ' + it.post.id + ': la foto grande usa el póster, no el .mp4',
        grande.includes(it.post.id + '-cover.jpg') && !grande.includes('.mp4'));
    }
  }
  // Video sin póster (stock viejo sin frame): marcador honesto.
  const sinPoster = itemVideo(90, 'Sin Portada', 999, false);
  const miniSP = ctx.conserjeMiniFotoHTML(sinPoster);
  const grandeSP = ctx.conserjeFotoHTML(sinPoster, true);
  todo += miniSP + grandeSP;
  check('video sin póster: sin <img> y con el rótulo «Video»', !miniSP.includes('<img') && miniSP.includes('Video') && !grandeSP.includes('<img'));

  // «Ver en el feed»: tile de posteo video con y sin póster + tile IG.
  const tileVideo = ctx.conserjeFeedTileHTML({ kind: 'post', post_id: 643, img: 'https://cdn.test/media/643.mp4', poster_url: 'https://cdn.test/media/643-cover.jpg', media_type: 'video', hue: 'H' }, 'H');
  const tileVideoSP = ctx.conserjeFeedTileHTML({ kind: 'post', post_id: 999, img: 'https://cdn.test/media/999.mp4', poster_url: '', media_type: 'video', hue: 'H' }, 'H');
  const tileIg = ctx.conserjeFeedTileHTML({ kind: 'ig', img: 'https://cdn.test/media/ig-1.jpg', media_type: 'video', hue: 'I' }, 'I');
  todo += tileVideo + tileVideoSP + tileIg;
  check('feed: el tile del posteo video pinta su póster', tileVideo.includes('<img src="https://cdn.test/media/643-cover.jpg"') && !tileVideo.includes('.mp4'));
  check('feed: el tile del posteo video sin póster no pinta ningún <img> de video', !tileVideoSP.includes('<img'));
  check('feed: el tile de IG sigue usando su imagen (es una foto de IG)', tileIg.includes('<img src="https://cdn.test/media/ig-1.jpg"'));
  const feedHTML = ctx.conserjeFeedHTML({ ok: true, user_id: 96, disponible: true, tiles: [
    { kind: 'post', post_id: 643, img: 'https://cdn.test/media/643.mp4', poster_url: 'https://cdn.test/media/643-cover.jpg', media_type: 'video', fecha: 'hoy', caption: 'el reel' },
    { kind: 'post', post_id: 677, img: 'https://cdn.test/media/677.jpg', poster_url: '', media_type: 'image', fecha: 'mañana', caption: 'la foto' },
  ], total: 2 }, 'Hungry Ghost Coffee');
  todo += feedHTML;
  check('feed completo: póster para el video y foto intacta', feedHTML.includes('643-cover.jpg') && feedHTML.includes('677.jpg'));

  // Detalle de pedidos por voz: el póster VISIBLE (sin onerror).
  const pedido = (posteo) => ({ id: 1, user_id: 96, business_name: 'Hungry Ghost Coffee', ig_username: 'hungryghostcoffee', cuando: 'hoy, 10:00', ambito: 'posteo', pedido: 'rehacé el video', respuesta: 'Listo ✓', entendido: 'Listo ✓', entregado: true, revision: { estado: 'pendiente', decidido_en: null }, posteo });
  const detVideo = ctx.conserjePedidoDetalleHTML(pedido({ id: 643, status: 'scheduled', media_type: 'video', caption: 'el reel', scheduled_at: '2026-11-15 00:00:00', published_at: null, image_url: 'https://cdn.test/media/643.mp4', poster_url: 'https://cdn.test/media/643-cover.jpg', tiene_anterior: false }));
  const detFoto = ctx.conserjePedidoDetalleHTML(pedido({ id: 677, status: 'published', media_type: 'image', caption: 'la foto', scheduled_at: null, published_at: '2026-11-13 00:00:00', image_url: 'https://cdn.test/media/677.jpg', poster_url: '', tiene_anterior: false }));
  const detSinPoster = ctx.conserjePedidoDetalleHTML(pedido({ id: 999, status: 'draft', media_type: 'video', caption: 'sin portada', scheduled_at: null, published_at: null, image_url: 'https://cdn.test/media/999.mp4', poster_url: '', tiene_anterior: false }));
  todo += detVideo + detFoto + detSinPoster;
  check('pedido-voz: el posteo video muestra su póster visible con marca ▶', detVideo.includes('<img src="https://cdn.test/media/643-cover.jpg"') && detVideo.includes('▶') && !detVideo.includes('.mp4'));
  check('pedido-voz: el posteo foto sigue con su <img> y sin onerror silencioso', detFoto.includes('<img src="https://cdn.test/media/677.jpg"') && !detFoto.includes('onerror'));
  check('pedido-voz: video sin póster dice «sin portada» en vez de ocultar', detSinPoster.includes('sin portada') && !detSinPoster.includes('<img'));

  // Detalle de pedidos desde Subir: el posteo armado video con póster.
  const subir = ctx.conserjePedidoSubirDetalleHTML({ id: 7, user_id: 96, business_name: 'Hungry Ghost Coffee', ig_username: 'hungryghostcoffee', cuando: 'hoy', kind: 'video', nota: 'subí este video', asset_path: '', asset_url: '', entendido: '', respuestas: {}, duda: null, estado: 'armado', post: { id: 643, status: 'scheduled', media_type: 'video', image_path: '/media/643.mp4', image_url: 'https://cdn.test/media/643.mp4', poster_url: 'https://cdn.test/media/643-cover.jpg', caption: 'el reel', scheduled_at: '2026-11-15 00:00:00', published_at: null } });
  todo += subir;
  check('pedido-subir: el posteo video armado muestra su póster', subir.includes('<img src="https://cdn.test/media/643-cover.jpg"') && !subir.includes('.mp4'));

  check('PIN MADRE: ningún <img src$=".mp4"> en ninguna superficie', !PIN_MP4.test(todo));
}

// ================= §C · boot real: el frame nace y se persiste =================
const PORT = 35431;
const TOKEN = 'lote-conserje-foto-video';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function getJson(urlPath, tries) {
  let last = null;
  const sep = urlPath.includes('?') ? '&' : '?';
  for (let i = 0; i < (tries || 1); i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + urlPath + sep + 'token=' + TOKEN);
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch (e) { /* queda null */ }
      return { status: r.status, j, t };
    } catch (e) { last = e; await sleep(700); }
  }
  return { status: 0, j: null, t: String(last) };
}
async function seccionBoot() {
  console.log('— §C boot · el servidor extrae el frame, lo persiste y lo sirve —');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-cfv-'));
  const dataDir = path.join(tmp, 'data');
  const mediaDir = path.join(tmp, 'media');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=540x960:d=1', '-pix_fmt', 'yuv420p', path.join(mediaDir, 'vid-boot-1.mp4')]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=540x540:d=1', '-frames:v', '1', path.join(mediaDir, 'foto-boot.jpg')]);
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: dataDir,
    MEDIA_DIR: mediaDir,
    ADMIN_TOKEN: TOKEN,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    OPENAI_API_KEY: 'x',
  };
  const srv = spawn('node', ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  srv.stdout.on('data', (d) => { bootLog += d; });
  srv.stderr.on('data', (d) => { bootLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) { const r = await getJson('/api/version'); up = r.status === 200; if (!up) await sleep(700); }
    check('el servidor bootea', up, bootLog.slice(-400));
    if (!up) return;
    const pdb = new DatabaseSync(path.join(dataDir, 'posta.db'));
    pdb.prepare("INSERT INTO users (id, email, password_hash, plan, plan_status, concierge, best_hour) VALUES (1, 'dueno@test.local', 'x', 'posty', 'active', 1, 19)").run();
    pdb.prepare("INSERT INTO profiles (user_id, business_name, ig_username, category, tone, description) VALUES (1, 'Negocio Boot', 'negocio.boot', 'Cafetería', 'Cercano', '')").run();
    pdb.prepare("INSERT INTO settings (user_id, timezone) VALUES (1, 'America/New_York')").run();
    pdb.prepare("INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type, cover_path) VALUES (201, 1, '/media/vid-boot-1.mp4', 'el reel del boot', datetime('now', '+1 day'), 'scheduled', 'pending', 'video', '')").run();
    pdb.prepare("INSERT INTO posts (id, user_id, image_path, caption, published_at, status, approval, media_type) VALUES (202, 1, '/media/foto-boot.jpg', 'la foto del boot', datetime('now', '-1 day'), 'published', 'approved', 'image')").run();
    pdb.prepare('INSERT INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (1, ?, ?, ?)').run('negocio.boot', JSON.stringify({ source: 'read', username: 'negocio.boot', name: 'Negocio Boot', pic: '', highlights: [], recents: [] }), Date.now());
    const msgs = [
      [1, 1, 'user', 'rehacé el video porfa', 'post', 201],
      [2, 1, 'assistant', 'Listo, lo rehice ✓', 'post', 201],
      [3, 1, 'user', 'qué linda la foto', 'post', 202],
      [4, 1, 'assistant', 'Sale así ✓', 'post', 202],
    ];
    for (const m of msgs) pdb.prepare('INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id) VALUES (?,?,?,?,?,?)').run(...m);
    pdb.close();

    const feed = await getJson('/api/admin/support/conserje/feed?user_id=1&post_id=201', 6);
    const tVideo = feed.j && feed.j.tiles.find((t) => t.kind === 'post' && t.post_id === 201);
    const tFoto = feed.j && feed.j.tiles.find((t) => t.kind === 'post' && t.post_id === 202);
    check('feed en vivo: el tile del video trae poster_url con su cover', !!tVideo && /vid-boot-1-cover\.jpg$/.test(tVideo.poster_url || ''), tVideo && tVideo.poster_url);
    check('feed en vivo: el tile de la foto no trae poster_url', !!tFoto && tFoto.poster_url === '');
    const pdb2 = new DatabaseSync(path.join(dataDir, 'posta.db'), { readOnly: true });
    const row = pdb2.prepare('SELECT cover_path FROM posts WHERE id = 201').get();
    pdb2.close();
    check('el cover quedó persistido en posts.cover_path', !!row && row.cover_path === '/media/vid-boot-1-cover.jpg', row && row.cover_path);
    const coverFile = path.join(mediaDir, 'vid-boot-1-cover.jpg');
    const magic = fs.existsSync(coverFile) ? fs.readFileSync(coverFile).subarray(0, 2).toString('hex') : '';
    check('el archivo del cover existe y es un JPEG real', magic === 'ffd8', magic);
    const voz = await getJson('/api/admin/support/conserje/pedidos-voz?user_id=1', 4);
    const pv = voz.j && voz.j.pedidos.find((p) => p.posteo && p.posteo.id === 201);
    const pf = voz.j && voz.j.pedidos.find((p) => p.posteo && p.posteo.id === 202);
    check('pedidos-voz en vivo: el posteo video trae su poster_url', !!pv && /vid-boot-1-cover\.jpg$/.test(pv.posteo.poster_url || ''), pv && pv.posteo.poster_url);
    check('pedidos-voz en vivo: el posteo foto sin poster_url', !!pf && pf.posteo.poster_url === '');
    const img = await fetch('http://127.0.0.1:' + PORT + '/media/vid-boot-1-cover.jpg');
    check('el cover se sirve por /media (200)', img.status === 200, String(img.status));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) { /* ya murió */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* limpieza best-effort */ }
  }
}

(async () => {
  try { seccionRevision(); } catch (e) { check('§A1 sin excepciones', false, String(e && e.stack || e).slice(0, 300)); }
  try { seccionVoz(); } catch (e) { check('§A2 sin excepciones', false, String(e && e.stack || e).slice(0, 300)); }
  try { seccionRender(); } catch (e) { check('§B sin excepciones', false, String(e && e.stack || e).slice(0, 300)); }
  try { await seccionBoot(); } catch (e) { check('§C sin excepciones', false, String(e && e.stack || e).slice(0, 300)); }
  console.log(`\n== ${pass} ok · ${fail} mal ==`);
  process.exit(fail ? 1 : 0);
})();
