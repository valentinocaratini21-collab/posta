// test-demo-projection.js — v184/v185: la proyección de perfil de /prueba
// (su perfil HOY vs CON Posty) se arma con datos REALES y sin inventar.
// v187: la grilla HOY sirve las miniaturas desde NUESTRO server (la CDN de
// IG no se deja hotlinkear: en vivo salían las 9 celdas grises) y la grilla
// CON Posty no repite NINGÚN diseño (5 piezas + tapa del reel + extras).
//
// Parte A (fixture, sin red): fetchAuditData + trialProfileFromAudit sobre
// un HTML de embed ficticio — identidad, bio, conteos TAL CUAL y grilla.
// Parte A2 (v187, sin red): localizeTrialPhotos con fetch inyectado —
// descarga a MEDIA_DIR, /media/…, falla→null, anti-SSRF, caché por hash y
// recompresión real de las que superan 500 KB.
// Parte B (server real + DB temporal): el stream sin @ no trae proyección
// y termina igual; una semana cacheada CON perfil lo devuelve intacto
// (contrato del front para la tarjeta de resultados); las fotos locales
// cacheadas se sirven por /media con 200.
// Parte C (contrato estático): prueba.html trae el bloque y sus hooks.
// Parte D (v187, harness DOM): las funciones REALES de prueba.html arman
// la grilla CON Posty con visuales 100% únicos (9 y 6 celdas).
// Sin IA paga, sin Instagram real.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const feedAudit = require('./feed-audit');
const demo = require('./demo');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

// El HTML del embed de Instagram trae el JSON con las comillas escapadas
// con backslash: reproducimos ese formato exacto para el fixture.
function escJson(obj) { return JSON.stringify(obj).replace(/"/g, '\\"'); }
function fixtureHtml({ followingMode }) {
  const mediaNodes = [];
  for (let i = 0; i < 9; i++) {
    mediaNodes.push({
      __typename: i === 3 ? 'GraphVideo' : 'GraphImage',
      shortcode: 'FIX' + i,
      taken_at_timestamp: 1760000000 - i * 86400,
      display_url: `https://scontent.cdninstagram.com/fixture/foto-${i}.jpg`,
      edge_media_to_comment: { count: i },
      edge_media_preview_caption: { edges: [{ node: { text: `Caption fixture ${i}` } }] },
    });
  }
  const profileObj = {
    username: 'fixture.cafe',
    full_name: 'Café Fixture',
    biography: 'Café de especialidad y brunch\nEnvíos a todo el país',
    followers_count: 4812,
    posts_count: 128,
    edge_owner_to_timeline_media: { count: 128, edges: mediaNodes.map((n) => ({ node: n })) },
  };
  if (followingMode === 'edge') profileObj.edge_follow = { count: 96 };
  if (followingMode === 'direct') profileObj.following_count = 321;
  return '<html><body><script type="text/javascript">' + escJson(profileObj) + '</script></body></html>';
}

async function partA() {
  console.log('— Parte A: fixture de perfil (fetchAuditData + trialProfileFromAudit)');
  const PIC = 'data:image/jpeg;base64,AAAA';
  const data = await feedAudit.fetchAuditData('fixture.cafe',
    async () => fixtureHtml({ followingMode: 'edge' }),
    { pic: PIC, name: 'Café Fixture' });
  ok(data && data.ok === true, 'fetchAuditData ok con fixture');
  ok(data.profile.handle === 'fixture.cafe', 'handle del fixture');
  ok(data.profile.name === 'Café Fixture', 'nombre desde profOverride (sin red)');
  ok(data.profile.followers === 4812, 'seguidores tal cual (4812)');
  ok(data.profile.posts_count === 128, 'posteos tal cual (128)');
  ok(data.profile.following === 96, 'seguidos desde edge_follow (96)');
  ok(data.profile.bio === 'Café de especialidad y brunch Envíos a todo el país', 'bio extraída y decodificada');
  ok(data.posts.length === 9, 'grilla: 9 posteos parseados');
  ok(data.posts[0].thumb === 'https://scontent.cdninstagram.com/fixture/foto-0.jpg', 'thumb[0] es la foto real');
  ok(data.posts[3].type === 'GraphVideo', 'el nodo video se detecta como video');
  ok(data.posts[8].thumb.endsWith('foto-8.jpg'), 'thumb[8] en orden');

  const prof = feedAudit.trialProfileFromAudit(data, null);
  ok(!!prof, 'trialProfileFromAudit devuelve perfil');
  ok(prof.handle === 'fixture.cafe' && prof.name === 'Café Fixture', 'identidad en la proyección');
  ok(prof.followers === 4812 && prof.posts_count === 128 && prof.following === 96,
    'CONTEOS IDÉNTICOS a los reales (la proyección no infla números)');
  ok(prof.photos.length === 9 && prof.photos[0].includes('foto-0'), 'fotos de SU grilla (9)');
  ok(prof.pic === PIC, 'foto de perfil del override');

  const dataDirect = await feedAudit.fetchAuditData('fixture.cafe',
    async () => fixtureHtml({ followingMode: 'direct' }), { pic: null, name: '' });
  ok(dataDirect.profile.following === 321, 'seguidos desde following_count (321)');
  const profDirect = feedAudit.trialProfileFromAudit(dataDirect, 'data:fallback');
  ok(profDirect.pic === 'data:fallback', 'pic cae al fallback del llamador');

  const dataNone = await feedAudit.fetchAuditData('fixture.cafe',
    async () => fixtureHtml({ followingMode: 'none' }), { pic: null, name: '' });
  ok(dataNone.profile.following === null, 'sin dato de seguidos → null (no se inventa)');
  const profNone = feedAudit.trialProfileFromAudit(dataNone, null);
  ok(profNone.following === null && profNone.pic === null, 'la proyección conserva los null');

  ok(feedAudit.trialProfileFromAudit(null) === null, 'data nula → proyección nula');
  ok(feedAudit.trialProfileFromAudit({ ok: false }) === null, 'data no-ok → proyección nula');
}

function smallJpegBytes() { return makeJpeg(120, 120, false); }

function makeJpeg(w, h, noise) {
  const out = path.join(os.tmpdir(), `thumb-fixture-${w}x${h}-${noise ? 'n' : 'p'}.jpg`);
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:duration=1`, '-frames:v', '1'];
  if (noise) args.push('-vf', 'noise=alls=90:allf=t');
  args.push(out);
  execFileSync('ffmpeg', args);
  return fs.readFileSync(out);
}

async function partA2() {
  console.log('— Parte A2: localizeTrialPhotos (miniaturas locales de la grilla HOY)');
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-thumbs-'));
  try {
    const small = makeJpeg(120, 120, false);
    const big = makeJpeg(1400, 1400, true);
    ok(big.length > 500 * 1024, `fixture: el JPEG grande supera los 500 KB (${Math.round(big.length / 1024)} KB)`);
    const calls = [];
    const impl = async (url) => {
      calls.push(url);
      if (url.includes('foto-fail')) throw new Error('cdn caído');
      if (url.includes('foto-big')) return big;
      return small;
    };
    const prof = { handle: 'fixture.cafe', photos: [
      'https://scontent.cdninstagram.com/fixture/foto-ok.jpg',
      'https://scontent.cdninstagram.com/fixture/foto-big.jpg',
      'https://scontent.cdninstagram.com/fixture/foto-fail.jpg',
      'https://example.com/evil.jpg',
      null,
      // Así llegan del embed real: con escapes residuales (\/ por nivel de
      // JSON). La primera corrida real de v187 las rechazó TODAS por esto.
      'https:\\/\\/scontent.cdninstagram.com\\/fixture\\/foto-esc.jpg',
    ] };
    await feedAudit.localizeTrialPhotos(prof, mediaDir, impl);
    ok(!!(prof.photos[0] && prof.photos[0].startsWith('/media/igthumb-')), 'foto ok → URL local /media/igthumb-…');
    ok(!!(prof.photos[1] && prof.photos[1].startsWith('/media/igthumb-')), 'foto grande → URL local');
    ok(prof.photos[2] === null, 'foto que no descarga → null (celda neutra, como antes)');
    ok(prof.photos[3] === null, 'URL fuera de la CDN de IG → null (anti-SSRF)');
    ok(prof.photos[4] === null, 'foto ausente → null');
    ok(!!(prof.photos[5] && prof.photos[5].startsWith('/media/igthumb-')), 'URL con escapes residuales (\\/) → se limpia y localiza');
    ok(calls.some((u) => u === 'https://scontent.cdninstagram.com/fixture/foto-esc.jpg'), 'la descarga se pide con la URL ya limpia');
    ok(!calls.some((u) => u.includes('example.com')), 'la URL ajena ni siquiera se intenta descargar');
    const f0 = path.join(mediaDir, path.basename(prof.photos[0]));
    ok(fs.existsSync(f0) && fs.statSync(f0).size === small.length, 'la miniatura quedó escrita en MEDIA_DIR');
    const f1 = path.join(mediaDir, path.basename(prof.photos[1]));
    ok(fs.existsSync(f1) && fs.statSync(f1).size < big.length && fs.statSync(f1).size > 10 * 1024,
      `la de >500 KB se recomprimió (${Math.round(big.length / 1024)} KB → ${Math.round(fs.statSync(f1).size / 1024)} KB)`);
    // Caché por hash estable: la segunda corrida reusa el archivo, sin red.
    const calls2 = [];
    const prof2 = { handle: 'fixture.cafe', photos: ['https://scontent.cdninstagram.com/fixture/foto-ok.jpg'] };
    await feedAudit.localizeTrialPhotos(prof2, mediaDir, async (u) => { calls2.push(u); return small; });
    ok(prof2.photos[0] === prof.photos[0] && calls2.length === 0, 'archivo ya presente → misma URL local, cero descargas');
    // Lote inalcanzable: todo null y sin lanzar (el stream no se entera).
    const prof3 = { handle: 'fixture.cafe', photos: ['https://scontent.cdninstagram.com/fixture/foto-fail.jpg'] };
    await feedAudit.localizeTrialPhotos(prof3, mediaDir, impl);
    ok(prof3.photos[0] === null, 'todas inalcanzables → nulls, sin excepción');
  } catch (e) {
    fails++;
    console.error('  ✗ excepción en Parte A2:', e.message);
  } finally {
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-proj-'));
const PORT = 18744;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_KEY = 'testkey185';

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function parseSSE(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    let ev = '', data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (ev) { let d = data; try { d = JSON.parse(data); } catch (e) {} events.push({ ev, d }); }
  }
  return events;
}

async function partB() {
  console.log('— Parte B: server real (stream sin @ y semana cacheada con perfil)');
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken185', TRIAL_TEST_KEY: TEST_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'server booteó');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261018-v226', '/api/version es v226 (hero + form de /prueba)');

    // B1: stream SIN @ → el flujo termina igual y NO hay proyección.
    const fd = new FormData();
    fd.append('business', 'Café Test');
    fd.append('ig', '');
    fd.append('category', 'cafeteria');
    fd.append('country', 'AR');
    fd.append('tone', 'vos');
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/trial/generate-stream?test_key=${TEST_KEY}`, { method: 'POST', body: fd });
    ok(res.ok && (res.headers.get('content-type') || '').includes('text/event-stream'), 'stream responde SSE');
    const events = parseSSE(await res.text());
    const done = events.find((e) => e.ev === 'done');
    ok(!!done, 'el stream llega a done sin @ (fallback intacto)');
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (done) {
      const out = done.d.out;
      ok(out.ok === true && Array.isArray(out.posts) && out.posts.length === 5, `semana completa (5 posteos) en ${secs}s`);
      ok(out.profile === null, 'sin @ → profile null (la proyección no aparece)');
      const styles = new Set(out.posts.map((p) => p.style_name).filter(Boolean));
      ok(styles.size >= 3, `las piezas traen ≥3 estilos distintos nombrados (${styles.size})`);
    }
    ok(!events.some((e) => e.ev === 'profile'), 'sin evento profile cuando no hay @');

    // B2: semana cacheada CON perfil → /api/trial/week y el cache-hit del
    // stream devuelven el perfil intacto (contrato de la tarjeta).
    const fixtureProfile = {
      handle: 'fixture.cafe', name: 'Café Fixture',
      bio: 'Café de especialidad y brunch Envíos a todo el país',
      followers: 4812, posts_count: 128, following: 96,
      pic: 'data:image/jpeg;base64,AAAA',
      photos: Array.from({ length: 9 }, (_, i) => `https://scontent.cdninstagram.com/fixture/foto-${i}.jpg`),
    };
    const payload = JSON.stringify({
      ok: true, engine: demo.DEMO_ENGINE_V, business: 'Café Fixture', ig: 'fixture.cafe', category: 'cafeteria',
      profile: fixtureProfile,
      posts: [0, 1, 2, 3, 4].map((i) => ({ type: 'image', image: 'data:image/jpeg;base64,AAAA', caption: 'c' + i, hashtags: '#cafe', style_name: 'Estilo ' + i })),
      design: { posts: [], styles: [], photos: [], videoIdx: 2, count: 5, engine: demo.DEMO_ENGINE_V },
      week: [],
    });
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)').run('fixture.cafe', payload, Date.now());

    const wk = await (await fetch(`${BASE}/api/trial/week?ig=fixture.cafe`)).json();
    ok(wk && wk.profile && wk.profile.handle === 'fixture.cafe', '/api/trial/week devuelve el perfil guardado');
    ok(wk.profile.followers === 4812 && wk.profile.following === 96 && wk.profile.photos.length === 9,
      'el perfil cacheado conserva conteos y grilla');

    const fd2 = new FormData();
    fd2.append('business', 'Café Fixture');
    fd2.append('ig', 'fixture.cafe');
    fd2.append('category', 'cafeteria');
    fd2.append('country', 'AR');
    fd2.append('tone', 'vos');
    const res2 = await fetch(`${BASE}/api/trial/generate-stream`, { method: 'POST', body: fd2 });
    const events2 = parseSSE(await res2.text());
    const done2 = events2.find((e) => e.ev === 'done');
    ok(!!done2 && done2.d.out.cached === true, 'cache-hit del stream responde done al instante');
    if (done2) {
      ok(done2.d.out.profile && done2.d.out.profile.handle === 'fixture.cafe'
        && done2.d.out.profile.followers === 4812,
        'el done del cache-hit trae el perfil para la tarjeta');
    }

    // B3 (v187): semana cacheada con fotos LOCALES — el payload restaurado
    // conserva las URLs /media/… y el archivo se sirve con 200 desde
    // nuestro propio origen (eso es lo que el navegador sí puede mostrar).
    const thumbName = 'igthumb-fixture187.jpg';
    fs.mkdirSync(path.join(TMP, 'media'), { recursive: true });
    fs.writeFileSync(path.join(TMP, 'media', thumbName), smallJpegBytes());
    const payloadLocal = JSON.stringify({
      ok: true, engine: demo.DEMO_ENGINE_V, business: 'Café Local', ig: 'local.cafe', category: 'cafeteria',
      profile: { handle: 'local.cafe', name: 'Café Local', bio: '', followers: 10, posts_count: 3, following: 1,
        pic: null, photos: ['/media/' + thumbName, null, '/media/igthumb-otra187.jpg'] },
      posts: [0, 1, 2, 3, 4].map((i) => ({ type: 'image', image: 'data:image/jpeg;base64,AAAA', caption: 'c' + i, hashtags: '#cafe', style_name: 'Estilo ' + i })),
      design: { posts: [], styles: [], photos: [], videoIdx: 2, count: 5, engine: demo.DEMO_ENGINE_V },
      week: [],
    });
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)').run('local.cafe', payloadLocal, Date.now());
    const wkL = await (await fetch(`${BASE}/api/trial/week?ig=local.cafe`)).json();
    ok(wkL && wkL.profile && wkL.profile.photos[0] === '/media/' + thumbName && wkL.profile.photos[1] === null,
      'la semana cacheada conserva las fotos locales (y los null de las que fallaron)');
    const mediaRes = await fetch(`${BASE}/media/${thumbName}`);
    ok(mediaRes.status === 200 && (mediaRes.headers.get('content-type') || '').includes('image'),
      '/media sirve la miniatura local con 200 e image/*');
  } catch (e) {
    fails++;
    console.error('  ✗ excepción en Parte B:', e.message);
    console.error(srvLog.slice(-1500));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
  }
}

function partC() {
  console.log('— Parte C: contrato estático del front');
  const html = fs.readFileSync(path.join(__dirname, 'public', 'prueba.html'), 'utf8');
  ok(html.includes('id="projBox"'), 'prueba.html trae el contenedor #projBox');
  ok(html.includes('profile: onStreamProfile'), 'el handler SSE de profile está registrado');
  ok(html.includes('Proyección: así se vería tu perfil con Posty'), 'el rótulo de proyección está (verdad: es contenido, no promesa)');
  ok(html.includes('projFromTrial') && html.includes('t.profile'), 'resultados arman la tarjeta desde TRIAL.profile');
  // v210: auditoría en vivo — contenedor, handler SSE y render desde payload.
  ok(html.includes('id="auditBox"'), 'prueba.html trae el contenedor #auditBox (v210)');
  ok(html.includes('audit: onStreamAudit'), 'el handler SSE de audit está registrado (v210)');
  ok(html.includes('El análisis de tu Instagram'), 'el panel de auditoría trae su título (v210)');
  ok(html.includes('auditFromTrial') && html.includes('t.audit'), 'resultados arman la auditoría desde TRIAL.audit (v210)');
  ok(html.includes('pfp-stage') && html.includes('pfp-layer-hoy'), 'el contraste arrastrable HOY/CON POSTY está');
  ok(html.includes('pfp-ptag hoy') && html.includes('CON POSTY'), 'las etiquetas HOY / CON POSTY están');
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok(srv.includes("send('profile'"), 'el server emite el evento profile');
  ok(srv.includes('profile: trialProfile'), 'el payload final lleva profile');
  ok(srv.includes("const BUILD_ID = '20261018-v226'"), 'BUILD_ID en v226');
  // v212: la prueba acepta la web del negocio + chau Posty malabareando.
  ok(html.includes('id="webCard"') && html.includes('id="f_web"'), 'prueba.html trae la tarjeta web y el campo de link (v212)');
  ok(html.includes('/api/trial/web-prefill'), 'prueba.html llama al web-prefill (v212)');
  ok(html.includes('DEEP_WEB') && html.includes('startTrialWeb'), 'el flujo ?web= está cableado (v212)');
  ok(!html.includes('pjwrap') && !html.includes('pj-ball'), 'el tracker ya no tiene a Posty malabareando (v212)');
  ok(srv.includes("app.post('/api/trial/web-prefill'"), 'el server expone /api/trial/web-prefill (v212)');
  ok(srv.includes('trialWebContext') && srv.includes('web_info:'), 'el server enriquece la generación con la web (v212)');
  // v210: auditoría en vivo — el server computa y emite el análisis del @.
  ok(srv.includes('trialAuditFromData'), 'el server computa la auditoría del @ (v210)');
  ok(srv.includes("send('audit'"), 'el server emite el evento audit (v210)');
  ok(srv.includes('audit: trialAudit'), 'el payload final lleva audit (v210)');
  // v187: proxy de miniaturas + grilla CON Posty sin repetidos.
  ok(srv.includes('localizeTrialPhotos'), 'el stream localiza las miniaturas del perfil (v187)');
  ok(srv.includes('grid_extra: gridExtra'), 'el payload lleva grid_extra (visuales únicos de la grilla)');
  ok(srv.includes('cover:'), 'el posteo video lleva su tapa (cover) para la grilla');
  const fa = fs.readFileSync(path.join(__dirname, 'feed-audit.js'), 'utf8');
  ok(fa.includes('igthumb-') && fa.includes('localizeTrialPhotos'), 'feed-audit descarga las miniaturas a MEDIA_DIR');
  ok(html.includes('projAfterVisuals'), 'la grilla CON Posty se arma con projAfterVisuals (sin motivos repetidos)');
  ok(!html.includes('(i - 5) % arr.length'), 'el reciclado de piezas con crop (v185) ya no existe');
}

function partD() {
  console.log('— Parte D: grilla CON Posty con las funciones reales (visuales únicos)');
  const html = fs.readFileSync(path.join(__dirname, 'public', 'prueba.html'), 'utf8');
  const start = html.indexOf('let PROJ = null;');
  const end = html.indexOf('function renderProj()');
  ok(start > 0 && end > start, 'bloque de proyección extraíble de prueba.html');
  if (start < 0 || end <= start) return;
  globalThis.TRIAL = null;
  globalThis.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let api = null;
  try {
    api = new Function(html.slice(start, end) + '\nreturn { setProj: (p) => { PROJ = p; }, layer: projLayerHTML, visuals: projAfterVisuals };')();
  } catch (e) {
    ok(false, 'el bloque evalúa: ' + e.message);
    return;
  }
  const profile = { handle: 'fixture.cafe', name: 'Café Fixture', bio: 'bio', followers: 10, posts_count: 9, following: 3, pic: '', photos: [] };
  const mkPosts = (withCover) => {
    const posts = [0, 1, 2, 3, 4].map((i) => ({ type: 'image', image: 'data:IMG' + i, style_name: 'S' + i }));
    posts[2] = { type: 'video', video: 'data:VID', style_name: 'S2' };
    if (withCover) posts[2].cover = 'data:COVER';
    return posts;
  };
  const gridSrcs = (layerHtml) => {
    const gi = layerHtml.indexOf('pfp-grid');
    const frag = gi >= 0 ? layerHtml.slice(gi) : layerHtml;
    return [...frag.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  };
  const cellCount = (layerHtml) => (layerHtml.match(/<div class="pfp-cell">/g) || []).length;

  // D1 (fix v191): video + tapa + 1 extra → 6 celdas, todas únicas, SIN la
  // tapa: el reel ya se muestra como video en su celda y la tapa lo duplicaba.
  api.setProj({ profile, piecesArr: mkPosts(true), extras: ['data:EX0'], mode: 'card', closed: false, min: false, pos: 50, scrolled: true });
  const h1 = api.layer('posty');
  const s1 = gridSrcs(h1);
  ok(cellCount(h1) === 6, `D1: video+tapa+1 extra = 6 celdas (hay ${cellCount(h1)})`);
  ok(s1.length === 6 && new Set(s1).size === 6, `D1: los 6 visuales son únicos (únicos: ${new Set(s1).size})`);
  ok(s1.includes('data:VID') && s1.includes('data:EX0'), 'D1: están el reel (como video) y el extra');
  ok(!s1.includes('data:COVER'), 'D1: la tapa NO aparece (duplicaría el diseño del reel)');

  // D1b: video + tapa + 3 extras → hay 8 únicos; la regla <9 → 6 celdas.
  api.setProj({ profile, piecesArr: mkPosts(true), extras: ['data:EX0', 'data:EX1', 'data:EX2'], mode: 'card', closed: false, min: false, pos: 50, scrolled: true });
  const h1b = api.layer('posty');
  const s1b = gridSrcs(h1b);
  ok(cellCount(h1b) === 6 && s1b.length === 6 && new Set(s1b).size === 6, `D1b: 8 únicos disponibles → 6 celdas únicas (hay ${cellCount(h1b)})`);
  ok(!s1b.includes('data:COVER'), 'D1b: la tapa tampoco aparece con 3 extras');

  // D2 (caso v187 original, sin extras): la tapa viene en el payload pero el
  // reel se ve como video → 5 celdas únicas, sin tapa.
  api.setProj({ profile, piecesArr: mkPosts(true), extras: [], mode: 'card', closed: false, min: false, pos: 50, scrolled: true });
  const h2 = api.layer('posty');
  const s2 = gridSrcs(h2);
  ok(cellCount(h2) === 5, `D2: sin extras la grilla muestra las 5 piezas (hay ${cellCount(h2)})`);
  ok(s2.length === 5 && new Set(s2).size === 5, 'D2: los 5 visuales son únicos');
  ok(!s2.includes('data:COVER'), 'D2: la tapa no duplica al reel');

  // D3: sin tapa ni extras (último recurso) → 5 celdas, únicos igual.
  api.setProj({ profile, piecesArr: mkPosts(false), extras: [], mode: 'card', closed: false, min: false, pos: 50, scrolled: true });
  const h3 = api.layer('posty');
  const s3 = gridSrcs(h3);
  ok(cellCount(h3) === 5 && new Set(s3).size === s3.length, `D3: último recurso = 5 celdas únicas (hay ${cellCount(h3)})`);

  // D4 (fix v191): posteo video SIN media utilizable pero con tapa (payload
  // viejo/cacheado) → la tapa ocupa SU celda, una sola vez y sin huecos.
  const mkPostsNoMedia = () => {
    const posts = [0, 1, 2, 3, 4].map((i) => ({ type: 'image', image: 'data:IMG' + i, style_name: 'S' + i }));
    posts[2] = { type: 'video', style_name: 'S2', cover: 'data:COVER' };
    return posts;
  };
  api.setProj({ profile, piecesArr: mkPostsNoMedia(), extras: [], mode: 'card', closed: false, min: false, pos: 50, scrolled: true });
  const h4 = api.layer('posty');
  const s4 = gridSrcs(h4);
  ok(cellCount(h4) === 5, `D4: 5 celdas con la tapa en el lugar del reel (hay ${cellCount(h4)})`);
  ok(s4.filter((u) => u === 'data:COVER').length === 1, 'D4: la tapa aparece una sola vez');
  ok(new Set(s4).size === s4.length, 'D4: todos los visuales son únicos');
  ok(!h4.slice(h4.indexOf('pfp-grid')).includes('pfp-cell-wait'), 'D4: la grilla no tiene huecos');
}

(async () => {
  await partA();
  await partA2();
  await partB();
  partC();
  partD();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(fails ? `\n❌ ${fails} fallas` : '\n✅ TODO VERDE');
  process.exit(fails ? 1 : 0);
})();
