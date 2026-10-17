// test-demo-projection.js — v184/v185: la proyección de perfil de /prueba
// (su perfil HOY vs CON Posty) se arma con datos REALES y sin inventar.
//
// Parte A (fixture, sin red): fetchAuditData + trialProfileFromAudit sobre
// un HTML de embed ficticio — identidad, bio, conteos TAL CUAL y grilla.
// Parte B (server real + DB temporal): el stream sin @ no trae proyección
// y termina igual; una semana cacheada CON perfil lo devuelve intacto
// (contrato del front para la tarjeta de resultados).
// Parte C (contrato estático): prueba.html trae el bloque y sus hooks.
// Sin IA paga, sin Instagram real.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
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
    ok(ver.build === '20261017-v185', '/api/version es v185 (build de la proyección)');

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
  ok(html.includes('pfp-stage') && html.includes('pfp-layer-hoy'), 'el contraste arrastrable HOY/CON POSTY está');
  ok(html.includes('pfp-ptag hoy') && html.includes('CON POSTY'), 'las etiquetas HOY / CON POSTY están');
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok(srv.includes("send('profile'"), 'el server emite el evento profile');
  ok(srv.includes('profile: trialProfile'), 'el payload final lleva profile');
  ok(srv.includes('20261017-v185'), 'BUILD_ID en v185');
}

(async () => {
  await partA();
  await partB();
  partC();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(fails ? `\n❌ ${fails} fallas` : '\n✅ TODO VERDE');
  process.exit(fails ? 1 : 0);
})();
