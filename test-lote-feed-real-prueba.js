// test-lote-feed-real-prueba.js
// LOTE FEED-REAL-PRUEBA (v953 del builder · aterriza como v1061) — el feed real del cliente en la vista de la prueba.
// Pedido de Valentino en vivo (12/11): en la vista de resultado de la prueba se ve
// solo el tile generado; faltan los posteos reales de su feed. El fix, SOLO server.js:
//  - /api/trial/generate y /api/trial/generate-stream llevan out.feed_recents con los
//    posteos reales del embed que la generación YA leyó (cero fetches nuevos);
//  - importTrialWeek siembra ese feed como snapshot del invitado (seedTrialFeedSnapshot)
//    para que /api/home/profile lo sirva de inmediato y homeGridCompose rinda los
//    reales junto al generado, con el generado primero y los reales de solo lectura.
//  - app.js NO se toca (la grilla ya rinde recents como tiles kind 'ig' de solo lectura).
// Se corre desde la raíz del scratch:  node release/test-lote-feed-real-prueba.js
// (los paths se resuelven por __dirname, no por cwd).
// (PREPARADOR · aterrizaje v1061 sobre la base viva v1060) Adaptaciones SOLO de
// estampado en §A/§D: BUILD v953→v1061 y v942→v1060, md5 de app.js/styles a los
// de la base viva, app.js?v=652→722, styles.css?v=20261270→20261282. El código
// del lote y el resto de la suite quedan byte-idénticos a los del builder.
// (BUILDER DEL ARREGLO · freno de preparación: la siembra quedaba anulada por
// el contrato de lectura de LOCALIZAR-RECENTS v975) La siembra ahora LOCALIZA
// las miniaturas a /media (feedAudit.localizeTrialPhotos) antes de escribir el
// snapshot, y es ASYNC. Adaptaciones de la suite, solo donde el arreglo obliga:
//  - §B corre como sección async (la espera §D antes de bootear) y la
//    extracción sigue la declaración async de la siembra — con fallback a la
//    forma síncrona para que la suite también corra sobre la base del
//    preparador como control del freno (ahí D7/D8/D14 quedan en rojo);
//  - §B suma el stub de feedAudit/MEDIA_DIR con el contrato real de
//    localizeTrialPhotos y los chequeos B21–B28 (img en /media, src
//    preservado, fallo parcial fail-closed por foto, sin siembra si
//    ninguna miniatura localiza);
//  - §D pre-siembra la caché determinística de miniaturas
//    (igthumb-<sha256(handle|url)[:24]>.jpg de más de 1024 bytes = hit de
//    caché de localizeTrialPhotos, sin descargar de la CDN) — el mismo
//    estado al que producción llega con las descargas reales — y espera a
//    que la siembra async aterrice en ig_home_snapshot antes de asertar;
//    D7/D8/D14 siguen siendo los chequeos de aceptación del freno y se
//    suma D15 (los recents servidos llevan img en /media).
// Total: 68 chequeos (59 + 8 de §B + 1 de §D).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'));
const STYLES = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'));
const IDX_ES = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ', real ' + JSON.stringify(a)); }
function count(hay, needle) { return hay.split(needle).length - 1; }
function md5(buf) { return require('crypto').createHash('md5').update(buf).digest('hex'); }

// Extrae una function declaration por nombre con balanceo de llaves.
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('no se encontró function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('llaves sin cerrar en ' + name);
}

// Extrae una async function declaration por nombre (misma mecánica).
function extractAsyncFn(src, name) {
  const start = src.indexOf('async function ' + name + '(');
  if (start < 0) throw new Error('no se encontró async function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('llaves sin cerrar en ' + name);
}

// ---------------------------------------------------------------- A. Estáticos
console.log('\n[A] Estampado y marcadores (estáticos)');
eq(count(SERVER, '20261105-v1061'), 1, 'A1 BUILD v1061 x1 solo en server.js');
eq(count(SERVER, '20261105-v1060'), 0, 'A2 BUILD v1060 x0 (sin restos del vivo anterior)');
eq(md5(APPJS), '3ebd3ae5d23cd60a6eb3cbf0735881d0', 'A3 public/app.js byte-idéntico a la base viva v1060 (sin bump de ?v=)');
eq(md5(STYLES), '107cf1f8637a439625d04e454235eeec', 'A4 styles.css byte-idéntico a la base viva v1060');
eq(count(IDX_ES, 'app.js?v=722'), 1, 'A5 index ES app.js?v=722 x1 (sin cambio)');
eq(count(IDX_ES, 'styles.css?v=20261282'), 1, 'A6 index ES styles 20261282 x1');
eq(count(IDX_EN, 'app.js?v='), 0, 'A7 index EN sin app.js?v=');
eq(count(IDX_EN, 'styles.css?v=20261282'), 1, 'A8 index EN styles 20261282 x1');
eq(count(SERVER, 'trialFeedRecentsFromEmbed('), 3, 'A9 trialFeedRecentsFromEmbed x3 (def + clásico + stream)');
eq(count(SERVER, 'seedTrialFeedSnapshot('), 2, 'A10 seedTrialFeedSnapshot x2 (def + llamada en importTrialWeek)');
eq(count(SERVER, 'feed_recents:'), 2, 'A11 feed_recents: x2 (los dos out: clásico y stream)');
eq(count(SERVER, 'trialFeedRecentsFromEmbed(_embedPostsVoz)'), 1, 'A12 el out clásico usa _embedPostsVoz (embed ya leído, sin fetch nuevo)');
eq(count(SERVER, 'trialFeedRecentsFromEmbed(trialData && trialData.posts)'), 1, 'A13 el out del stream usa trialData.posts (auditoría ya leída)');
ok(SERVER.includes('homeSnapshotPut(userId, ig, payload)'), 'A14 la siembra escribe por homeSnapshotPut (mismo camino que la lectura real)');

// ------------------------------------------------- B. VM servidor: helpers puros
// (Arreglo del freno) La siembra es async (localiza las miniaturas
// descargando): la sección corre como función async y §D la espera
// antes de bootear. La extracción busca la declaración async; sobre la
// base del preparador (siembra síncrona) cae a la forma clásica y la
// suite sirve de control del freno.
async function seccionB() {
console.log('\n[B] trialFeedRecentsFromEmbed + seedTrialFeedSnapshot (VM con stubs)');
const store = new Map();
const sandboxB = {
  console,
  feedReconcile: { isTopLevelReadPost: (p) => !!p && ((typeof p.taken_at === 'number' && p.taken_at > 0) || !!String(p.caption || '').trim()) },
  homeSnapshotGet: (uid) => { const r = store.get(uid); return r ? { payload: r, fetched_at: Date.now() } : null; },
  homeSnapshotPut: (uid, username, payload) => { store.set(uid, payload); },
  // Stub del contrato real de feedAudit.localizeTrialPhotos: muta
  // loc.photos dejando '/media/...' por cada URL de la CDN que
  // «descarga» bien y null en las que no (las del marcador NO-DL, o
  // las que no son de la CDN) — nunca lanza.
  feedAudit: {
    localizeTrialPhotos: async (loc) => {
      loc.photos = (loc.photos || []).map((u, i) => (typeof u === 'string' && /cdninstagram\.com\//.test(u) && u.indexOf('NO-DL') < 0) ? '/media/igthumb-stub' + i + '.jpg' : null);
      return loc;
    },
  },
  MEDIA_DIR: '/tmp/feed-real-stub-media',
};
vm.createContext(sandboxB);
let seedSrcB;
try { seedSrcB = extractAsyncFn(SERVER, 'seedTrialFeedSnapshot'); }
catch (e) { seedSrcB = extractFn(SERVER, 'seedTrialFeedSnapshot'); }
vm.runInContext(extractFn(SERVER, 'trialFeedRecentsFromEmbed') + '\n' + seedSrcB, sandboxB);
const trialFeedRecentsFromEmbed = sandboxB.trialFeedRecentsFromEmbed;
const seedTrialFeedSnapshot = sandboxB.seedTrialFeedSnapshot;

const EMBED = [
  { type: 'GraphImage', shortcode: 'DVEJA001', taken_at: 1762000000, caption: 'Nuevo modelo', likes: 120, comments: 4, pinned: false, thumb: 'https://scontent.cdninstagram.com/v/abc1.jpg' },
  { type: 'GraphVideo', shortcode: 'DVEJA002', taken_at: 1761900000, caption: 'El taller', likes: 98, comments: 2, pinned: true, thumb: 'https://scontent.cdninstagram.com/v/abc2.jpg' },
  { type: 'GraphSidecar', shortcode: 'DVEJA003', taken_at: 1761800000, caption: 'Colección', likes: 75, comments: 0, pinned: false, thumb: 'https://scontent.cdninstagram.com/v/abc3.jpg' },
  { type: 'GraphImage', shortcode: 'DHIJO01', taken_at: null, caption: '', likes: 0, comments: 0, thumb: 'https://scontent.cdninstagram.com/v/hijo.jpg' },
  { type: 'GraphImage', shortcode: 'DSINTHUMB', taken_at: 1761700000, caption: 'Sin thumb', likes: 5, comments: 0, thumb: null },
];
const rec = trialFeedRecentsFromEmbed(EMBED);
eq(rec.length, 3, 'B1 solo primer nivel con thumb: 3 de 5 (hijo de carrusel y sin thumb afuera)');
eq(rec.map((r) => r.shortcode).join(','), 'DVEJA001,DVEJA002,DVEJA003', 'B2 orden y shortcodes preservados');
eq(rec.map((r) => r.type).join(','), 'image,video,carousel', 'B3 tipo mapeado GraphImage/Video/Sidecar → image/video/carousel');
ok(rec.every((r) => r.img && r.img === r.src && r.img.startsWith('https://scontent.cdninstagram.com/')), 'B4 img = src = URL de la CDN en el payload (la siembra la localiza a /media antes de escribir)');
eq(rec[1].pinned, true, 'B5 pinned viaja (el fijado real se marca)');
eq(rec[0].likes, 120, 'B6 likes/comments viajan');
eq(JSON.stringify(trialFeedRecentsFromEmbed(null)), '[]', 'B7 null → []');
eq(JSON.stringify(trialFeedRecentsFromEmbed([])), '[]', 'B8 [] → []');
const many = Array.from({ length: 15 }, (_, i) => ({ type: 'GraphImage', shortcode: 'D' + i, taken_at: 1762000000 - i, caption: 'c' + i, thumb: 'https://x/' + i + '.jpg' }));
eq(trialFeedRecentsFromEmbed(many).length, 12, 'B9 tope 12 (ventana del feedMap)');

const OUT_OK = { business: 'Veja', ig_pic: 'https://example.invalid/veja.jpg', feed_recents: rec, digest: { feedMap: { posts_count_total: 3507 } } };
store.clear();
eq(await seedTrialFeedSnapshot(101, 'veja', OUT_OK), true, 'B10 la siembra escribe cuando no hay snapshot');
const snap = store.get(101);
eq(snap && snap.source, 'trial', 'B11 snapshot con source trial');
eq(snap && snap.username, 'veja', 'B12 snapshot con username = @');
eq(snap && snap.posts_count, 3507, 'B13 posts_count = total real del feedMap (no el tamaño de la ventana)');
eq(snap && snap.recents.length, 3, 'B14 snapshot con los 3 recents');
ok(snap && snap.recents.every((r) => typeof r.img === 'string' && r.img.indexOf('/media/') === 0), 'B21 los recents sembrados llevan img en /media (el contrato de lectura v975 los acepta)');
eq(snap && snap.recents.map((r) => r.src).join(','), rec.map((r) => r.src).join(','), 'B22 el src conserva la URL original de la CDN (la unión re-localiza desde ahí)');
eq(await seedTrialFeedSnapshot(101, 'veja', OUT_OK), false, 'B15 NO pisa un snapshot que ya trae recents');
eq(await seedTrialFeedSnapshot(102, 'veja', { feed_recents: [] }), false, 'B16 feed vacío → no siembra (la vista sigue como hoy)');
eq(await seedTrialFeedSnapshot(103, '', OUT_OK), false, 'B17 sin @ → no siembra');
store.clear();
const OUT_SIN_TOTAL = { business: 'Veja', feed_recents: rec, digest: {} };
eq(await seedTrialFeedSnapshot(104, 'veja', OUT_SIN_TOTAL), true, 'B18 sin total real, siembra igual');
eq(store.get(104).posts_count, 3, 'B19 posts_count cae a recents.length sin feedMap');
store.clear();
const OUT_SIN_SC = { business: 'Veja', feed_recents: [{ img: 'https://x/a.jpg', src: 'https://x/a.jpg', shortcode: null }] };
eq(await seedTrialFeedSnapshot(105, 'veja', OUT_SIN_SC), false, 'B20 recents sin shortcode no se siembran');
const OUT_PARCIAL = { business: 'Veja', feed_recents: [
  { img: 'https://scontent.cdninstagram.com/v/ok1.jpg', src: 'https://scontent.cdninstagram.com/v/ok1.jpg', shortcode: 'DOK1' },
  { img: 'https://scontent.cdninstagram.com/v/NO-DL-mala.jpg', src: 'https://scontent.cdninstagram.com/v/NO-DL-mala.jpg', shortcode: 'DMALA' },
  { img: 'https://scontent.cdninstagram.com/v/ok2.jpg', src: 'https://scontent.cdninstagram.com/v/ok2.jpg', shortcode: 'DOK2' },
], digest: { feedMap: { posts_count_total: 3507 } } };
eq(await seedTrialFeedSnapshot(106, 'veja', OUT_PARCIAL), true, 'B23 fallo parcial de descarga: siembra con las que localizaron');
const snapP = store.get(106);
eq(snapP && snapP.recents.length, 2, 'B24 la miniatura que no localizó excluye solo a su recent');
eq(snapP && snapP.recents.map((r) => r.shortcode).join(','), 'DOK1,DOK2', 'B25 quedan las dos buenas, en orden');
eq(snapP && snapP.posts_count, 3507, 'B26 posts_count conserva el total real aunque falte una miniatura');
const OUT_NULA = { business: 'Veja', feed_recents: [
  { img: 'https://scontent.cdninstagram.com/v/NO-DL-1.jpg', src: 'https://scontent.cdninstagram.com/v/NO-DL-1.jpg', shortcode: 'DNULA1' },
], digest: {} };
eq(await seedTrialFeedSnapshot(107, 'veja', OUT_NULA), false, 'B27 si ninguna miniatura localiza, no se siembra nada');
eq(store.has(107), false, 'B28 sin snapshot nuevo: la home queda como hoy (la lectura real puebla en su cadencia)');
}

// ------------------------------------------------- C. VM cliente: composición
console.log('\n[C] homeGridCompose + homeTileHTML (VM sobre app.js real)');
function pcParseDateStub(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}
const sandboxC = {
  console,
  pcParseDate: pcParseDateStub,
  pcTz: () => 'America/New_York',
  schedDayKeyOf: (d, tz) => { try { return d.toLocaleDateString('en-CA', { timeZone: tz || 'America/New_York' }); } catch (e) { return ''; } },
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  HOME_PIN_SVG: '', HOME_REEL_SVG: '', HOME_CAR_SVG: '',
  pzIc: () => '',
  ME: { lang: 'es' },
};
vm.createContext(sandboxC);
for (const fn of ['hfIgShortcode', 'hfCmpDescKey', 'hfFeedSortKey', 'homeGridCompose', 'homeTileHTML']) {
  vm.runInContext(extractFn(APPJS.toString(), fn), sandboxC);
}
// El próximo 19:00 en Nueva York (hoy si falta, mañana si ya pasó).
function next1900NY() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const ymd = get('year') + '-' + get('month') + '-' + get('day');
  const hour = parseInt(get('hour'), 10);
  const day = (hour < 19) ? ymd : (() => { const d = new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day')) + 86400000); return d.toISOString().slice(0, 10); })();
  // 19:00 NY → UTC: en noviembre NY es UTC-5.
  return day + ' 19:00:00';
}
function schedAt(hoursFromNow) {
  const d = new Date(Date.now() + hoursFromNow * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
const GEN1 = { id: 901, status: 'scheduled', scheduled_at: next1900NY(), media_type: 'image', image_path: '/media/trial-gen1.jpg', caption: 'El primer posteo', pinned: 0 };
const GEN2 = { id: 902, status: 'scheduled', scheduled_at: schedAt(27), media_type: 'image', image_path: '/media/trial-gen2.jpg', caption: 'Segundo', pinned: 0 };
const GEN3 = { id: 903, status: 'scheduled', scheduled_at: schedAt(51), media_type: 'image', image_path: '/media/trial-gen3.jpg', caption: 'Tercero', pinned: 0 };
const RECENTS = [
  { img: 'https://scontent.cdninstagram.com/v/abc1.jpg', src: 'https://scontent.cdninstagram.com/v/abc1.jpg', type: 'image', taken_at: 1762000000, shortcode: 'DVEJA001', likes: 120, comments: 4, pinned: false },
  { img: 'https://scontent.cdninstagram.com/v/abc2.jpg', src: 'https://scontent.cdninstagram.com/v/abc2.jpg', type: 'video', taken_at: 1761900000, shortcode: 'DVEJA002', likes: 98, comments: 2, pinned: false },
  { img: 'https://scontent.cdninstagram.com/v/abc3.jpg', src: 'https://scontent.cdninstagram.com/v/abc3.jpg', type: 'image', taken_at: 1761800000, shortcode: 'DVEJA003', likes: 75, comments: 0, pinned: false },
];
const INPUT = { upcoming: [{ p: GEN1, ymd: null }, { p: GEN2, ymd: null }, { p: GEN3, ymd: null }], published: [], recents: RECENTS };
const beforeWeek = JSON.stringify([GEN1.scheduled_at, GEN2.scheduled_at, GEN3.scheduled_at]);
const tiles = sandboxC.homeGridCompose(INPUT);
eq(tiles.length, 4, 'C1 la grilla trae 4 tiles: generado + 3 reales');
eq(tiles[0].kind, 'oculta', 'C2 el generado va PRIMERO (carta idx 0)');
eq(tiles[0].post && tiles[0].post.id, 901, 'C3 la carta es el posteo generado (id 901)');
eq(tiles.slice(1).map((t) => t.kind).join(','), 'ig,ig,ig', 'C4 los 3 reales rinden como tiles kind ig');
eq(tiles.slice(1).map((t) => t.shortcode).join(','), 'DVEJA001,DVEJA002,DVEJA003', 'C5 los reales en orden de fecha descendente');
const tilesVacio = sandboxC.homeGridCompose({ upcoming: [{ p: GEN1, ymd: null }], published: [], recents: [] });
eq(tilesVacio.length, 1, 'C6 feed vacío: solo el generado, sin romperse');
eq(tilesVacio[0].post && tilesVacio[0].post.id, 901, 'C7 feed vacío: el generado sigue primero');
const tilesSinImg = sandboxC.homeGridCompose({ upcoming: [{ p: GEN1, ymd: null }], published: [], recents: [{ shortcode: 'DX', img: null }, RECENTS[0]] });
eq(tilesSinImg.length, 2, 'C8 un recent sin img no rinde (no hay hueco)');
const tileHtml = sandboxC.homeTileHTML({ kind: 'ig', img: 'https://scontent.cdninstagram.com/v/abc1.jpg', type: 'image', shortcode: 'DVEJA001', taken_at: 1762000000 }, 1);
ok(tileHtml.includes('data-lightbox='), 'C9 el tile real abre el visor (data-lightbox)');
ok(!/Editar|Frenar|Eliminar|data-pz-hoy-detalle/.test(tileHtml), 'C10 el tile real es SOLO LECTURA: sin Editar/Frenar/Eliminar ni detalle');
eq(JSON.stringify([GEN1.scheduled_at, GEN2.scheduled_at, GEN3.scheduled_at]), beforeWeek, 'C11 la semana del invitado intacta (la composición no muta horarios ni posteos)');

// ------------------------------------------------- D. Boot real + integración
console.log('\n[D] Boot real (DATA_DIR temporal, puerto 35011) + register → import → /api/home/profile');
(async () => {
  await seccionB();
  const PORT = 35011;
  const dataDir = fs.mkdtempSync(path.join('/tmp', 'feed-real-boot-'));
  // (Arreglo del freno) La siembra LOCALIZA las miniaturas con
  // feedAudit.localizeTrialPhotos y esta suite no descarga de la CDN:
  // se pre-siembra la caché de /media con los archivos determinísticos
  // que esa función reutiliza sin descargar (igthumb-<sha256(handle|url)
  // [:24]>.jpg con más de 1024 bytes = hit de caché) — el mismo estado
  // al que producción llega con las descargas reales de la lectura.
  const mediaDir = path.join(dataDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const thumbBuf = Buffer.alloc(2048, 0xff);
  for (const r of RECENTS) {
    const h = require('crypto').createHash('sha256').update('veja' + '|' + r.src).digest('hex').slice(0, 24);
    fs.writeFileSync(path.join(mediaDir, 'igthumb-' + h + '.jpg'), thumbBuf);
  }
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), DATA_DIR: dataDir,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
  });
  const child = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOut = '';
  child.stdout.on('data', (d) => { serverOut += String(d); });
  child.stderr.on('data', (d) => { serverOut += String(d); });
  function req(method, pth, body, extraHeaders) {
    return new Promise((resolve, reject) => {
      const headers = Object.assign({}, extraHeaders || {});
      let payload = null;
      if (body != null) { payload = typeof body === 'string' ? body : JSON.stringify(body); headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
      const r = http.request({ host: '127.0.0.1', port: PORT, path: pth, method, headers }, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }
  async function waitVersion(tries) {
    for (let i = 0; i < tries; i++) {
      try { const r = await req('GET', '/api/version'); const j = JSON.parse(r.body); if (j && j.build === '20261105-v1061') return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }
  // (Arreglo del freno) La siembra es async (localiza y después
  // escribe): se espera a que aterrice en ig_home_snapshot antes de
  // asertar, como en producción la ve la próxima apertura de la home.
  async function waitSeeded(dbH, uid, tries) {
    for (let i = 0; i < tries; i++) {
      try {
        const row = dbH.prepare('SELECT payload FROM ig_home_snapshot WHERE user_id = ?').get(uid);
        if (row && row.payload) { const j = JSON.parse(row.payload); if (j && j.source === 'trial' && Array.isArray(j.recents) && j.recents.length === 3) return true; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  try {
    ok(await waitVersion(40), 'D1 /api/version responde v1061 (boot ~30 s)');
    let vOk = 0;
    for (let i = 0; i < 5; i++) { const r = await req('GET', '/api/version'); try { if (JSON.parse(r.body).build === '20261105-v1061') vOk++; } catch (e) {} }
    eq(vOk, 5, 'D2 /api/version v1061 5/5');

    // Fixture: la semana de la prueba como la deja /api/trial/generate (con feed_recents).
    const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
    const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';
    const fixture = {
      ok: true, engine: 25, lang: 'en', content_lang: 'en', business: 'Veja', ig: 'veja',
      category: '', ig_pic: 'https://example.invalid/veja.jpg',
      posts: [
        { image: PIXEL, caption: 'Primer posteo Veja', hashtags: '' },
        { image: PIXEL, caption: 'Segundo posteo', hashtags: '' },
        { image: PIXEL, caption: 'Tercer posteo', hashtags: '' },
      ],
      design: { posts: [{}, {}, {}] },
      feed_recents: RECENTS,
      digest: { feedMap: { posts_count_total: 3507 } },
      week: [],
    };
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)').run('veja', JSON.stringify(fixture), Date.now());

    const reg = await req('POST', '/api/auth/register', { email: 'feedreal.test@example.invalid', password: 'test1234', trial_ig: 'veja', terms_accepted: true });
    let regJ = null; try { regJ = JSON.parse(reg.body); } catch (e) {}
    ok(reg.status === 200 && regJ && regJ.ok === true, 'D3 register con trial_ig=veja → 200 ok', 'status=' + reg.status + ' body=' + reg.body.slice(0, 200));
    const cookie = (reg.headers['set-cookie'] || []).map((c) => String(c).split(';')[0]).join('; ');
    ok(!!cookie, 'D4 la respuesta trae cookie de sesión');
    const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get('feedreal.test@example.invalid');
    ok(!!(userRow && userRow.id), 'D5 el usuario se creó en la DB');
    const uid = userRow.id;
    // (la fila de profiles puede no existir todavía: upsert, no UPDATE pelado —
    // un UPDATE sobre una fila inexistente afecta 0 filas en silencio y el
    // handle quedaría vacío, igual que le pasó a la primera versión de esta suite)
    db.prepare(`INSERT INTO profiles (user_id, ig_username) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET ig_username = excluded.ig_username`).run(uid, 'veja');

    await waitSeeded(db, uid, 40);

    const prof = await req('GET', '/api/home/profile', null, { Cookie: cookie });
    let profJ = null; try { profJ = JSON.parse(prof.body); } catch (e) {}
    ok(prof.status === 200 && profJ && profJ.ok === true, 'D6 GET /api/home/profile → 200 ok', 'status=' + prof.status + ' body=' + prof.body.slice(0, 200));
    eq(Array.isArray(profJ && profJ.recents) ? profJ.recents.length : -1, 3, 'D7 /api/home/profile sirve los 3 posteos reales');
    eq((profJ && profJ.recents || []).map((r) => r.shortcode).join(','), 'DVEJA001,DVEJA002,DVEJA003', 'D8 los recents servidos son los reales del feed');
    eq(profJ && profJ.posts_count, 3507, 'D9 posts_count servido = total real (3507)');

    const snapRow = db.prepare('SELECT payload FROM ig_home_snapshot WHERE user_id = ?').get(uid);
    let snapJ = null; try { snapJ = JSON.parse(snapRow && snapRow.payload || 'null'); } catch (e) {}
    eq(snapJ && snapJ.source, 'trial', 'D10 el snapshot sembrado lleva source trial');
    eq(snapJ && snapJ.username, 'veja', 'D11 el snapshot sembrado lleva username veja');
    eq(snapJ && Array.isArray(snapJ.recents) ? snapJ.recents.length : -1, 3, 'D12 el snapshot sembrado trae los 3 recents');

    const postsRow = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND source = ?').get(uid, 'trial');
    eq(postsRow && postsRow.c, 3, 'D13 la semana se importó igual (3 posteos source trial) — la siembra no tocó la semana');
    const prof2 = await req('GET', '/api/home/profile', null, { Cookie: cookie });
    let prof2J = null; try { prof2J = JSON.parse(prof2.body); } catch (e) {}
    eq(Array.isArray(prof2J && prof2J.recents) ? prof2J.recents.length : -1, 3, 'D14 segunda lectura: los 3 reales siguen ahí (la siembra no se pierde)');
    ok(Array.isArray(profJ && profJ.recents) && profJ.recents.length === 3 && profJ.recents.every((r) => r && typeof r.img === 'string' && r.img.indexOf('/media/') === 0), 'D15 los recents servidos llevan img en /media (contrato de lectura v975): ninguno con URL de CDN');
    db.close();
  } finally {
    try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    if (!child.killed) { try { process.kill(child.pid, 'SIGKILL'); } catch (e) {} }
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    if (fail) console.log('\n[boot-log]\n' + serverOut.slice(-2000));
  }

  console.log('\n== FEED-REAL-PRUEBA: ' + pass + ' ok, ' + fail + ' fail ==');
  if (failures.length) { console.log('Fallos:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASH:', e); process.exit(2); });
