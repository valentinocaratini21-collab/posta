// test-lote-rediseño-rs3.js — REDISEÑO SIMPLE RS-3: FEED REAL (9/11):
// 1) el feed muestra FOTO, BIO Y NÚMEROS REALES desde la API de IG con
//    el token ya conectado (nuevo ig-profile.js; la lectura pública ya
//    no trae datos: IG sirve un shell de login);
// 2) la bio que es el <title> de la página de IG NO es una bio (guarda
//    en servidor + render; se limpia la fila guardada);
// 3) sin foto real, la cara canónica de Posty (ai-avatar.png), NUNCA la
//    letra sola;
// 4) banda del próximo posteo PRIMERO, a todo lo ancho, antes de la
//    grilla (la carta no rinde como tile en el Feed);
// 5) botón «Impulsar posteo» arriba del Feed (regla 7 v7 del mock),
//    que llama a pzFeedBoostPick() — contrato con RS-4 (hoja ELEGIR
//    posteo, window.pzOpenBoostPick). NO se construye «usar la foto que
//    envié» (sin objeto por la regla 01:48).
// Spec: mock posty-app-simple v7 (regla 7) + v5 (regla 6, vista Feed).
// Base: v826. Paridad ES+EN.
// Uso: node test-lote-rediseño-rs3.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const http = require('http'), crypto = require('crypto'), os = require('os');
const { spawn } = require('child_process');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;

function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
function sliceFn(src, startSig, endSig) {
  const a = src.indexOf(startSig);
  if (a < 0) return '';
  const b = endSig ? src.indexOf(endSig, a + 10) : -1;
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
// ISO (UTC) de una hora de pared en America/New_York, con el offset real.
function tzISO(y, mo, d, h, mi, tz) {
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const asUTC = new Date(new Date(utc).toLocaleString('en-US', { timeZone: tz })).getTime();
  return new Date(utc + (utc - asUTC)).toISOString();
}
function nyParts(date) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).forEach((x) => { o[x.type] = x.value; });
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day) };
}
const TZ = 'America/New_York';
const nowNY = nyParts(new Date());
const tomD = new Date(Date.UTC(nowNY.y, nowNY.m - 1, nowNY.d) + 86400000);
const tomNY = { y: tomD.getUTCFullYear(), m: tomD.getUTCMonth() + 1, d: tomD.getUTCDate() };
const d3D = new Date(Date.UTC(nowNY.y, nowNY.m - 1, nowNY.d) + 3 * 86400000);
const d3NY = { y: d3D.getUTCFullYear(), m: d3D.getUTCMonth() + 1, d: d3D.getUTCDate() };
const isoHoy19 = tzISO(nowNY.y, nowNY.m, nowNY.d, 19, 0, TZ);
const isoMan19 = tzISO(tomNY.y, tomNY.m, tomNY.d, 19, 0, TZ);
const isoD3 = tzISO(d3NY.y, d3NY.m, d3NY.d, 10, 0, TZ);
const TITLE_JUNK = 'Posty • Tu community manager (@posty.communitymanager) • Instagram photos and videos';
const STATS_JUNK = '8 seguidores, 1 seguido, 15 posteos';
const REAL_BIO = 'Café de especialidad · Croissants todos los días';

/* ---------- 1. Estático: ig-profile.js ---------- */
console.log('— 1. ig-profile.js (módulo nuevo) —');
ok(fs.existsSync(path.join(__dirname, 'ig-profile.js')), 'existe ig-profile.js');
const igp = fs.readFileSync(path.join(__dirname, 'ig-profile.js'), 'utf8');
ok(igp.includes("module.exports = { fetchIgProfileFull };"), 'exporta fetchIgProfileFull');
ok(igp.includes("const IG_HOST = 'https://graph.instagram.com';"), 'mismo host que ig-follows/ig-media');
ok(igp.includes("const API_VERSION = 'v26.0';"), 'misma versión de API (v26.0)');
ok(igp.includes('username,profile_picture_url,biography,followers_count,follows_count,media_count'), 'pide los 6 campos del perfil');
ok(igp.includes('expectedHandle'), 'guarda de identidad (expectedHandle)');
ok(igp.includes('fetchFn'), 'fetchFn inyectable (tests)');
ok(cnt(igp, /return null/g) >= 4, 'fail-closed: varios return null (sin token, error, identidad)');
ok(srv.includes("const igProfile = require('./ig-profile');"), 'server.js requiere ig-profile');

/* ---------- 2. Estático: servidor (API + guarda de bio) ---------- */
console.log('— 2. servidor: perfil por API + guarda de bio-título —');
ok(srv.includes('fetchIgProfileFull({ igUserId: s.ig_user_id, accessToken: s.ig_access_token, expectedHandle: handle })'), 'homeProfileReadAndStore llama a fetchIgProfileFull con el token guardado');
ok(srv.includes('if (api.pic) payload.pic = api.pic;'), 'API: la foto manda sobre el embed');
ok(srv.includes("if (api.bio) { payload.bio = api.bio; payload.bio_unread = false; }"), 'API: la bio manda y bio_unread se apaga');
ok(srv.includes("if (typeof api.followers === 'number') payload.followers = api.followers;"), 'API: followers manda');
ok(srv.includes("if (typeof api.following === 'number') payload.following = api.following;"), 'API: following manda');
ok(srv.includes("if (typeof api.postsCount === 'number') payload.posts_count = api.postsCount;"), 'API: posts_count manda');
ok(srv.includes("payload.profile_source = 'api';"), 'API: marca profile_source');
ok(cnt(srv, /isIgTitleJunkBio/g) === 3, 'isIgTitleJunkBio x3 (def + overlay + PUT)');
ok(srv.includes('/instagram photos and videos/i'), 'guarda: detecta el título de IG');
ok(srv.includes("UPDATE profiles SET profile_bio='' WHERE user_id=? AND profile_bio=?"), 'overlay: limpia la fila con la bio-título (perezoso)');
ok(srv.includes("isIgTitleJunkBio(bioIn) ? '' : bioIn.slice(0, 150)"), 'PUT /api/profile: no guarda bio-título');

/* ---------- 3. Estático: front (cara, bio, banda, botón) ---------- */
console.log('— 3. front: cara canónica, bio, banda, botón —');
ok(cnt(app, /function pzIsIgTitleBio\(s\)/g) === 1, 'pzIsIgTitleBio definida x1');
ok(cnt(app, /'\/ai-avatar\.png'/g) === 3, "cara canónica '/ai-avatar.png' x3 (1 preexistente en la definición del agente + 2 nuevas: homeHeadHTML y feedView)");
ok(app.includes("if (!picSrc) picSrc = '/ai-avatar.png';"), 'homeHeadHTML: sin foto ni logo -> cara canónica');
ok(app.includes("const picSrc = (prof && prof.pic) || '/ai-avatar.png';"), 'feedView: sin foto -> cara canónica');
ok(app.includes("const bio = pzIsIgTitleBio(bioRaw) ? '' : bioRaw;"), 'homeHeadHTML: la bio-título no se muestra');
ok(app.includes("const feedBio = pzIsIgTitleBio(feedBioRaw) ? '' : feedBioRaw;"), 'feedView: la bio-título no se muestra');
ok(cnt(app, /function pzFeedNextLabel\(/g) === 1, 'pzFeedNextLabel definida x1');
ok(cnt(app, /function pzFeedGridTiles\(/g) === 1, 'pzFeedGridTiles definida x1');
ok(cnt(app, /function pzFeedBoostPick\(\)/g) === 1, 'pzFeedBoostPick definida x1');
ok(app.includes('window.pzOpenBoostPick'), 'pzFeedBoostPick delega en window.pzOpenBoostPick (contrato RS-4)');
ok(cnt(app, /id="feedBoostBtn"/g) === 1, 'botón feedBoostBtn x1');
ok(cnt(app, /onclick="pzFeedBoostPick\(\)"/g) === 1, 'botón llama a pzFeedBoostPick() x1');
ok(cnt(app, /class="feed-boost-cta"/g) === 1, 'botón con clase feed-boost-cta x1');
ok(app.includes('Impulsar posteo') && app.includes('Posty ya eligió el mejor para vos →'), 'botón ES: «Impulsar posteo» + «Posty ya eligió el mejor para vos →»');
ok(app.includes('Boost post') && app.includes('Posty already picked the best one for you →'), 'botón EN: «Boost post» + subtítulo');
ok(cnt(app, /class="pz-feed-next"/g) === 1, 'banda pz-feed-next x1');
ok(app.includes('ya está armado') && app.includes('Es el próximo en salir — lo ves acá, antes de que se publique.'), 'banda ES: «ya está armado» + subtítulo');
ok(app.includes('already set') && app.includes('It goes out next — you see it here before it publishes.'), 'banda EN: «already set» + subtítulo');
ok(cnt(app, /class="pz-feed-bio"/g) === 1, 'bio del Feed pz-feed-bio x1');
ok(app.includes('hfTabTiles(pzFeedGridTiles(baseTiles), HF_TAB, prof)'), 'la grilla del Feed excluye la carta (pzFeedGridTiles)');
ok(cnt(app, /usar la foto que envié|Usar la foto que envié/g) === 5, '«usar la foto que envié» x5, igual que v826 (NO se construye: sin objeto)');
ok(css.includes('.feed-boost-cta{width:calc(100% - 28px);'), 'CSS: .feed-boost-cta presente');
ok(css.includes('.feed-boost-cta .fbc-main{font-size:16.5px;'), 'CSS: .fbc-main presente');
ok(css.includes('.pz-feed-next{display:flex;'), 'CSS: .pz-feed-next presente');
ok(css.includes('border:2px dashed #A9C6D4;'), 'CSS: la banda con borde punteado (mock)');
ok(css.includes('.pz-feed-bio{margin:0 16px 12px;'), 'CSS: .pz-feed-bio presente');
ok(css.includes('.pz-feed-ava{width:42px;height:42px;border-radius:50%;background:#EAF6FD;object-fit:cover;object-position:top;border:3px solid #FEC14D;flex:none}'), 'CSS: avatar del Feed con aro amarillo (mock)');

/* ---------- 4. VM: ig-profile.js con fetch stub ---------- */
console.log('— 4. VM: ig-profile.js (stub de fetch) —');
const igMod = require(path.join(__dirname, 'ig-profile.js'));
(async () => {
  const stubOk = async () => ({ json: async () => ({ username: 'posty.communitymanager', profile_picture_url: 'https://scontent.cdninstagram.com/v/pic.jpg', biography: REAL_BIO, followers_count: 128, follows_count: 42, media_count: 15, id: '17841424145064983' }) });
  const r1 = await igMod.fetchIgProfileFull({ igUserId: '17841424145064983', accessToken: 'tok', expectedHandle: 'posty.communitymanager', fetchFn: stubOk });
  ok(r1 && r1.username === 'posty.communitymanager', 'API ok: username');
  ok(r1 && r1.pic === 'https://scontent.cdninstagram.com/v/pic.jpg', 'API ok: pic');
  ok(r1 && r1.bio === REAL_BIO, 'API ok: bio real');
  ok(r1 && r1.followers === 128 && r1.following === 42 && r1.postsCount === 15, 'API ok: followers/following/postsCount');
  const r2 = await igMod.fetchIgProfileFull({ igUserId: '17841424145064983', accessToken: 'tok', expectedHandle: 'otro.handle', fetchFn: stubOk });
  ok(r2 === null, 'identidad distinta -> null (guarda)');
  const stubFieldErr = async () => ({ json: async () => ({ error: { message: 'Invalid field: profile_picture_url' } }) });
  let calls = 0;
  const stubRetry = async (url) => { calls++; if (calls === 1) return stubFieldErr(); return { json: async () => ({ username: 'posty.communitymanager', followers_count: 128, follows_count: 42, media_count: 15 }) }; };
  const r3 = await igMod.fetchIgProfileFull({ igUserId: '17841424145064983', accessToken: 'tok', expectedHandle: 'posty.communitymanager', fetchFn: stubRetry });
  ok(calls === 2, 'campo rechazado -> reintenta sin foto/bio');
  ok(r3 && r3.followers === 128 && r3.pic === null && r3.bio === null, 'reintento: conteos sí, pic/bio null (nunca inventados)');
  const stubErr = async () => ({ json: async () => ({ error: { message: 'Invalid OAuth access token' } }) });
  const r4 = await igMod.fetchIgProfileFull({ igUserId: '17841424145064983', accessToken: 'malo', expectedHandle: 'posty.communitymanager', fetchFn: stubErr });
  ok(r4 === null, 'API con error -> null (queda el embed)');
  const r5 = await igMod.fetchIgProfileFull({ igUserId: '', accessToken: '', fetchFn: stubOk });
  ok(r5 === null, 'sin token -> null (sin llamada)');
  const stubThrow = async () => { throw new Error('red caída'); };
  const r6 = await igMod.fetchIgProfileFull({ igUserId: '17841424145064983', accessToken: 'tok', fetchFn: stubThrow });
  ok(r6 === null, 'fetch que lanza -> null (nunca lanza)');

  /* ---------- 5. VM: helpers puros del front ---------- */
  console.log('— 5. VM: pzIsIgTitleBio + pzFeedNextLabel + pzFeedGridTiles + pzFeedBoostPick —');
  const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
  const fns = ['pcParseDate', 'pzWhenRelDay', 'pzFeedNextLabel', 'pzFeedGridTiles', 'pzIsIgTitleBio'];
  const ctx = { console, ME: { lang: 'es' }, pcTz: () => TZ, toast: (m) => { ctx.__toast = m; }, window: {} };
  vm.createContext(ctx);
  for (const f of fns) {
    const src = extractFn(app, 'function ' + f);
    ok(!!src, 'extrae ' + f);
    if (src) vm.runInContext(src, ctx);
  }
  vm.runInContext(escLine + '\n' + extractFn(app, 'function pzFeedBoostPick'), ctx);
  const G = ctx.pzIsIgTitleBio;
  ok(G(TITLE_JUNK) === true, 'bio-título ES: es junk');
  ok(G('Posty • Tu community manager (@posty.communitymanager) • Instagram photos and videos') === true, 'bio-título: el <title> exacto es junk');
  ok(G(STATS_JUNK) === true, 'línea de stats del og:description: es junk');
  ok(G(REAL_BIO) === false, 'bio real: NO es junk');
  ok(G('') === false && G(null) === false, 'bio vacía: NO es junk');
  ok(G('Seguinos en Instagram 📸') === false, 'bio con «Instagram» pero real: NO es junk');
  const L = ctx.pzFeedNextLabel;
  ok(L(isoMan19, TZ, false) === 'Mañana', 'etiqueta: mañana -> «Mañana»');
  ok(L(isoHoy19, TZ, false) === 'Hoy', 'etiqueta: hoy -> «Hoy»');
  const wd = L(isoD3, TZ, false);
  ok(typeof wd === 'string' && wd.length > 2 && wd !== 'Mañana' && wd !== 'Hoy', 'etiqueta: en 3 días -> día de la semana (' + wd + ')');
  ok(L(isoMan19, TZ, true) === 'Tomorrow', 'etiqueta EN: mañana -> «Tomorrow»');
  ok(L('no-fecha', TZ, false) === '', 'etiqueta: fecha inválida -> vacía');
  ok(L('', TZ, false) === '', 'etiqueta: sin fecha -> vacía');
  const FT = ctx.pzFeedGridTiles;
  const tilesIn = [{ kind: 'oculta', post: { id: 1 } }, { kind: 'post', post: { id: 2 } }, { kind: 'ig', img: 'x.jpg' }, { kind: 'oculta', post: { id: 3 } }];
  const tilesOut = FT(tilesIn);
  ok(tilesOut.length === 2 && tilesOut[0].post.id === 2 && tilesOut[1].img === 'x.jpg', 'pzFeedGridTiles: saca las 2 cartas, deja post + IG en orden');
  ok(FT([]).length === 0 && FT(null).length === 0, 'pzFeedGridTiles: vacío/null -> []');
  const BP = ctx.pzFeedBoostPick;
  ctx.window.pzOpenBoostPick = () => { ctx.__picked = true; };
  ctx.__picked = false; ctx.__toast = null;
  BP();
  ok(ctx.__picked === true && !ctx.__toast, 'pzFeedBoostPick: con RS-4 presente, abre la hoja');
  delete ctx.window.pzOpenBoostPick;
  ctx.__picked = false; ctx.__toast = null;
  BP();
  ok(ctx.__picked === false && ctx.__toast === 'Elegí el posteo para impulsar', 'pzFeedBoostPick: sin RS-4, avisa y no rompe');

  /* ---------- 6. VM: homeHeadHTML (cara + bio) ---------- */
  console.log('— 6. VM: homeHeadHTML —');
  const headCtx = {
    console, ME: { lang: 'es' }, window: {},
    pzIc: () => '[ic]',
    assetLogo: () => null,
    igHeadChipHTML: () => '',
  };
  vm.createContext(headCtx);
  const headFns = ['hfHighlightsTrayHTML', 'hfTabsHTML', 'pzDecEnt', 'pzIsIgTitleBio', 'homeHeadHTML'];
  for (const f of headFns) {
    const src = extractFn(app, 'function ' + f);
    ok(!!src, 'extrae ' + f);
    if (src) vm.runInContext(src, headCtx);
  }
  vm.runInContext(escLine, headCtx);
  const HH = headCtx.homeHeadHTML;
  const profReal = { username: 'posty.communitymanager', name: 'Posty.', pic: 'https://scontent.cdninstagram.com/v/foto.jpg', bio: REAL_BIO, followers: 128, following: 42, posts_count: 15 };
  const hReal = HH(profReal, 'Posty.', { en: false, splitHead: true });
  ok(hReal.includes('<img src="https://scontent.cdninstagram.com/v/foto.jpg"'), 'head con foto: la <img> es la foto real');
  ok(hReal.includes(REAL_BIO), 'head con bio real: la bio se muestra');
  ok(hReal.includes('<b>128</b>') && hReal.includes('<b>42</b>') && hReal.includes('<b>15</b>'), 'head con números: 15/128/42');
  const hNoPic = HH({ username: 'posty.communitymanager', name: 'Posty.', pic: null, bio: REAL_BIO, followers: 8, following: 1, posts_count: 15 }, 'Posty.', { en: false, splitHead: true });
  ok(hNoPic.includes('<img src="/ai-avatar.png"'), 'head sin foto: la <img> es la cara canónica (/ai-avatar.png)');
  ok(hNoPic.includes('hf-ava-in"><span class="hf-ava-letter">P</span><img src="/ai-avatar.png"'), 'head sin foto: la cara canónica tapa la letra (la letra queda solo como capa de respaldo, .hf-ava-in img la cubre)');
  const hJunk = HH({ username: 'posty.communitymanager', name: 'Posty.', pic: 'https://scontent.cdninstagram.com/v/foto.jpg', bio: TITLE_JUNK, followers: 8, following: 1, posts_count: 15 }, 'Posty.', { en: false, splitHead: true });
  ok(!hJunk.includes('Instagram photos and videos'), 'head con bio-título: el título NO se muestra');
  ok(!hJunk.includes('hf-bio'), 'head con bio-título: no hay .hf-bio');
  const hStats = HH({ username: 'posty.communitymanager', name: 'Posty.', pic: null, bio: STATS_JUNK, followers: 8, following: 1, posts_count: 15 }, 'Posty.', { en: false, splitHead: true });
  ok(!hStats.includes('8 seguidores, 1 seguido, 15 posteos'), 'head con línea de stats: NO se muestra como bio');
  headCtx.ME.lang = 'en';
  const hEn = HH({ username: 'posty.communitymanager', name: 'Posty.', pic: null, bio: REAL_BIO, followers: 1, following: 1, posts_count: 1 }, 'Posty.', { en: true, splitHead: true });
  ok(hEn.includes('<img src="/ai-avatar.png"') && hEn.includes('1</b>'), 'head EN: cara canónica + conteos');
  headCtx.ME.lang = 'es';

  /* ---------- 7. VM: homeDisplayOverlay (guarda del servidor) ---------- */
  console.log('— 7. VM: homeDisplayOverlay —');
  const ovSrc = sliceFn(srv, 'function homeDisplayOverlay(uid, prof, payload) {', 'app.get(\'/api/home/profile\'');
  ok(!!ovSrc, 'extrae homeDisplayOverlay');
  const ovCtx = {
    console,
    db: { prepare: () => ({ run: (...a) => { ovCtx.__dbRun = a; } }) },
    clientDigest: { getDigest: () => ({ paleta: [] }) },
    parseBrandHexes: () => [],
    getSettings: () => ({}),
  };
  vm.createContext(ovCtx);
  vm.runInContext(extractFn(srv, 'function isIgTitleJunkBio'), ovCtx);
  vm.runInContext(ovSrc, ovCtx);
  const OV = ovCtx.homeDisplayOverlay;
  const base = { username: 'posty.communitymanager', bio: REAL_BIO, pic: 'https://scontent.cdninstagram.com/v/foto.jpg', followers: 128 };
  ovCtx.__dbRun = null;
  const oJunk = OV(12, { profile_bio: TITLE_JUNK }, base);
  ok(oJunk.bio === REAL_BIO, 'overlay con bio-título guardada: manda la lectura (bio real)');
  ok(Array.isArray(ovCtx.__dbRun) && ovCtx.__dbRun[0] === 12, 'overlay con bio-título: limpia la fila (UPDATE)');
  const oReal = OV(12, { profile_bio: 'Mi bio de verdad' }, base);
  ok(oReal.bio === 'Mi bio de verdad', 'overlay con bio real guardada: manda el override del dueño');
  const oEmpty = OV(12, {}, base);
  ok(oEmpty.bio === REAL_BIO, 'overlay sin override: queda la lectura');

  /* ---------- 8. Boot aislado ---------- */
  console.log('— 8. boot —');
  const NODE_PATH_POSTA = '/home/hatch/workspace/posta/node_modules';
  let expressOk = fs.existsSync(path.join(NODE_PATH_POSTA, 'express', 'package.json'));
  if (!expressOk) {
    console.log('  (boot omitido: express no resuelve en este árbol)');
  } else {
    const PORT = 34580;
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-rediseno-rs3-'));
    const srvProc = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), NODE_PATH: NODE_PATH_POSTA, OPENAI_API_KEY: '' }, stdio: 'ignore' });
    const pid = srvProc.pid;
    console.log('  boot PID: ' + pid);
    const get = (p) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { 'User-Agent': 'lote-rediseno-rs3/1.0' } }, (r) => { const chunks = []; r.on('data', (c) => { chunks.push(c); }); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') })); }).on('error', rej); });
    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); try { const v = await get('/api/version'); up = v.status === 200; } catch (e) {} }
    ok(up, 'boot levanta (PID ' + pid + ')');
    if (up) {
      const ver = JSON.parse((await get('/api/version')).body);
      ok(ver.build === '20261105-v829', '/api/version 20261105-v829 (estampado)');
      const appS = await get('/app.js?v=563');
      ok(appS.status === 200 && md5(appS.body) === md5(fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8')), 'app.js?v=563 servido = árbol');
      ok(appS.body.includes('pzFeedBoostPick'), 'servido: pzFeedBoostPick presente');
      ok(appS.body.includes('pz-feed-next'), 'servido: banda pz-feed-next presente');
      ok(appS.body.includes('feedBoostBtn'), 'servido: botón feedBoostBtn presente');
      ok(appS.body.includes("'/ai-avatar.png'"), 'servido: cara canónica presente');
      ok(appS.body.includes('fetchIgProfileFull') === false, 'servido: app.js no trae el servidor (separación)');
      const stS = await get('/styles.css?v=20261214');
      ok(stS.status === 200 && md5(stS.body) === md5(fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8')), 'styles?v=20261214 servido = árbol');
      ok(stS.body.includes('.feed-boost-cta{'), 'servido: .feed-boost-cta presente');
      ok(stS.body.includes('.pz-feed-next{'), 'servido: .pz-feed-next presente');
      const idx = await get('/?cb=lote-rediseno-rs3');
      ok(idx.body.includes('app.js?v=563') && idx.body.includes('styles.css?v=20261214'), 'index ES servido ?v=563 + styles?v=20261214');
      const del = await new Promise((res) => { const q = http.request({ host: '127.0.0.1', port: PORT, path: '/api/album/1', method: 'DELETE' }, (r) => res(r.statusCode)); q.on('error', () => res(0)); q.end(); });
      ok(del === 401, 'DELETE sin sesión 401 (el servidor es el real)');
    }
    srvProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1500));
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { alive = false; }
    ok(!alive, 'boot muerto tras SIGTERM por PID exacto (' + pid + ')');
    const portFree = await new Promise((res) => { const s = http.get({ host: '127.0.0.1', port: PORT, path: '/api/version' }, () => res(false)); s.on('error', () => res(true)); });
    ok(portFree, 'puerto ' + PORT + ' libre tras matar el boot');
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\ntest-lote-rediseño-rs3: ${pass} ok, ${fail} mal`);
  if (fail) console.log('fallos: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
