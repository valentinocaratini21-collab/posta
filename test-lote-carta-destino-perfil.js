// test-lote-carta-destino-perfil.js — LOTE CARTA-DESTINO-PERFIL
// (captura del dueño, 23/11 08:08): Valentino tocó la push de la
// semana y aterrizó en Inicio: la push no lo llevó a la carta que
// anunciaba, y la tarjeta de perfil se veía como un placeholder —
// círculo con la letra «P», la bio reemplazada por el título
// scrapeado de la página de Instagram («… • Instagram photos and
// videos») y el link pelado instagram.com/<@>.
//
// El censo (árbol v1272) encontró:
//  1. La push de la carta (push.js notifySundayLetter) declara
//     /#/app/analisis, pero la superficie murió con Estrategia
//     (LOTE A · 8/11): el router redirigía analisis → #/app/ads y
//     analisisView/bindAnalisis (chunk-analisis) quedaron muertos.
//     EL ARREGLO: la rama analisis del router vuelve a rendir la
//     carta (loadChunk + analisisView, el patrón de la rama admin).
//     La push no se toca: su URL siempre fue la dirección de la carta.
//  2. GET /api/home/profile sirve el snapshot guardado; la guarda
//     anti-título (isIgTitleJunkBio) cubría solo la bio que el dueño
//     guardó (profiles.profile_bio) — la bio del propio payload, un
//     pic vacío y el link-residuo (la URL del propio Instagram)
//     pasaban tal cual. EL ARREGLO vive en homeDisplayOverlay, el
//     único punto por el que pasa todo payload al servir: bio del
//     payload que es el título de IG → la bio del kit de la cuenta
//     (su fundamento) o vacía; pic vacío → digest.logo_url (la misma
//     fuente del kit); link que es el propio Instagram → se descarta
//     (el que el dueño guardó, profiles.profile_link, manda y no se
//     toca).
//  3. La grilla NO era defecto (censo): homeGridCompose compone el
//     perfil literal de la cuenta (próximos + publicados propios +
//     recientes de SU Instagram); en la casa, su feed real es la
//     vidriera con piezas publicadas de verdad.
//
// CONTROL: contra la base prístina v1272 fallan los casos [FIX]
// (la rama analisis redirige a Ads; el overlay sirve la bio-título,
// el pic null y el link-residuo). Los casos de comportamiento
// vigente (la bio real no se toca, la del dueño manda, el portero
// nativo) pasan en ambos árboles.
// Uso: node test-lote-carta-destino-perfil.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function buscarPuerto() {
  for (let p = 36850; p < 37050; p++) {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      if (!out.includes(':' + p + ' ')) return p;
    } catch (e) { return p; }
  }
  return 0;
}
function puertoLibre(p) {
  try {
    const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    return !out.includes(':' + p + ' ');
  } catch (e) { return true; }
}
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let depth = 0, j = src.indexOf('{', i);
  if (j < 0) return null;
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}

// ---------- 1. Estático ----------
seccion('1. Estático: la carta tiene superficie y el overlay sanea el payload');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const chunkSrc = fs.readFileSync(path.join(ROOT, 'public/chunk-analisis.js'), 'utf8');
const pushSrc = fs.readFileSync(path.join(ROOT, 'push.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
{
  const iA = appSrc.indexOf("else if (tab === 'analisis')");
  const iB = appSrc.indexOf('else if', iA + 10);
  const rama = iA >= 0 ? stripComments(appSrc.slice(iA, iB > iA ? iB : iA + 900)) : '';
  t(iA >= 0 && rama.includes("loadChunk('analisis')") && rama.includes('analisisView()'),
    'S1 [FIX] app.js: la rama analisis carga el chunk y rinde analisisView() (la carta)',
    rama.slice(0, 200));
  t(!appSrc.includes("tab === 'analisis') { location.hash = '#/app/ads'"),
    'S2 [FIX] app.js: la redirección analisis → Ads no existe más');
  t(chunkSrc.includes('function analisisView()') && chunkSrc.includes('function bindAnalisis()')
    && appSrc.includes('function pzPaintSkeleton(') && appSrc.includes('function loadChunk(') && appSrc.includes('function chunkFailHTML('),
    'S3 funciones auditadas del lote: analisisView + bindAnalisis definidas en chunk-analisis; pzPaintSkeleton + loadChunk + chunkFailHTML definidas en app.js');
  const urls = (pushSrc.match(/url: '\/#\/app\/analisis'/g) || []).length;
  t(urls === 2, 'S4 push.js: notifySundayLetter declara /#/app/analisis en ES y EN (la dirección de la carta)', 'urls=' + urls);
  const ov = extractFn(srvSrc, 'function homeDisplayOverlay(uid, prof, payload)');
  t(!!ov && ov.includes('isIgTitleJunkBio(out.bio)') && ov.includes('homeProfileKit(uid, prof)'),
    'S5 [FIX] server.js: el overlay sanea la bio del payload (título de IG → bio del kit)', ov ? '' : 'sin función');
  t(!!ov && ov.includes('dgPic') && ov.includes('logo_url') && ov.includes('out.pic = String(dgPic.logo_url)'),
    'S6 [FIX] server.js: el overlay completa un pic vacío desde digest.logo_url');
  t(!!ov && ov.includes("instagram.com/' + handleLk") && ov.includes('if (!pl && out.link)'),
    'S7 [FIX] server.js: el overlay descarta el link que es el propio Instagram (y respeta el del dueño)');
  const pr = extractFn(appSrc, 'function pzNativeRoute(url, isShell)');
  let rutaNat = null;
  try { rutaNat = (new Function(pr + '; return pzNativeRoute;'))()('/#/app/analisis', true); } catch (e) {}
  t(rutaNat === '#/app/analisis', 'S8 el portero nativo deja pasar la URL de la carta tal cual (el toque nativo aterriza en la carta)', String(rutaNat));
}

// ---------- Semilla ----------
const SEED = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
function usuario(id, email, nombre, ig, cat) {
  db.prepare("INSERT INTO users (id, email, password_hash, plan, plan_status, concierge, publishing_stopped, trial_started_at, trial_ends_at, lang, email_verified, created_at) VALUES (?, ?, ?, 'posty', 'active', 0, 0, NULL, NULL, 'es', 1, '2026-09-01 10:00:00')").run(id, email, hash);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)').run(id, nombre, ig, cat);
  db.prepare("INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')").run(id);
}
usuario(601, 'carta@carta.test', 'Negocio Carta QA', 'negociocarta', 'Panadería');
usuario(602, 'vacia@carta.test', 'Negocio Vacío QA', 'negociovacio', 'Cafetería');
usuario(603, 'real@carta.test', 'Negocio Real QA', 'negocioreal', 'Panadería');
usuario(604, 'dueno@carta.test', 'Negocio Dueño QA', 'negociodueno', 'Panadería');
db.exec("CREATE TABLE IF NOT EXISTS ig_home_snapshot (user_id INTEGER PRIMARY KEY, username TEXT DEFAULT '', payload TEXT DEFAULT '', fetched_at INTEGER DEFAULT 0)");
function snap(uid, handle, extra) {
  const payload = Object.assign({ source: 'read', username: handle, name: '', pic: null, category: null, category_en: null, note: null, bio: '', bio_unread: false, link: '', followers: null, posts_count: null, following: null, is_verified: null, highlights: [], recents: [], captured_at: Date.now() }, extra);
  db.prepare('INSERT INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (?,?,?,?)').run(uid, handle, JSON.stringify(payload), Date.now());
}
const JUNK = (h) => 'Negocio QA (@' + h + ') \\u2022 Instagram photos and videos';
snap(601, 'negociocarta', { bio: JUNK('negociocarta'), pic: null, link: 'https://instagram.com/negociocarta' });
snap(602, 'negociovacio', { bio: JUNK('negociovacio'), pic: null, link: 'instagram.com/negociovacio' });
snap(603, 'negocioreal', { bio: 'Panadería artesanal · medialunas todos los días', pic: 'https://example.com/foto-real.jpg', link: 'https://negocioreal.example/' });
snap(604, 'negociodueno', { bio: JUNK('negociodueno'), pic: null, link: 'https://instagram.com/negociodueno' });
db.prepare("UPDATE profiles SET profile_bio = 'Bio escrita por el dueño', profile_link = 'https://instagram.com/negociodueno' WHERE user_id = 604").run();
const cd = require(path.join(ROOT, 'client-digest'));
cd.saveDigest(db, 601, { logo_url: '/ai-avatar.png', productos: [{ nombre: 'Medialuna de manteca' }], inferred_star: { item: 'Medialuna de manteca' }, diferencial: 'Horno propio desde 1998', ciudad: 'Palermo' });
const ae = require(path.join(ROOT, 'analysis-engine'));
ae.saveAnalysis(db, 601, { kind: 'cuenta', lang: 'es', letter: { title: 'Tu semana, en orden', greeting: 'Hola, Negocio Carta QA', paragraphs: ['Esta es la carta sembrada de la suite.'] }, findings: [] });
console.log('semilla carta ok');
`;

// ---------- 2/3. Boot real + API + Chromium ----------
// (tt = t con el nombre primero, por legibilidad de esta sección)
const tt = (name, cond, extra) => t(cond, name, extra);
async function bootSuite() {
  seccion('2. Boot: /api/home/profile sirve la cara y la bio reales');
  const PORT = buscarPuerto();
  tt('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) return;
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-boot-'));
  const seedFile = path.join(tmpD, 'seed.js');
  fs.writeFileSync(seedFile, SEED);
  try {
    execFileSync(process.execPath, [seedFile, tmpD, ROOT], { encoding: 'utf8', timeout: 120000 });
    tt('B0b la semilla cargó (db del árbol + bcryptjs)', true);
  } catch (e) { tt('B0b la semilla cargó', false, String((e && (e.stdout || e.message)) || '').slice(-300)); return; }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-carta', SESSION_SECRET: 'boot-test-session-secret-carta', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  const base = 'http://127.0.0.1:' + PORT;

  async function login(email) {
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ClaveQA123' }),
    });
    const setCookie = r.headers.get('set-cookie') || '';
    const m = setCookie.match(/^([^=]+)=([^;]+)/);
    return { status: r.status, cookie: m ? m[1] + '=' + m[2] : null, raw: m ? { name: m[1], value: m[2] } : null };
  }
  async function get(p, cookie) {
    const r = await fetch(base + p, { headers: cookie ? { Cookie: cookie } : {} });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, j };
  }

  let browser = null;
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) {}
      if (!up) await sleep(500);
    }
    tt('B1 el servidor levanta en el puerto libre', up, serverLog.slice(-300));
    if (!up) return;

    const s601 = await login('carta@carta.test');
    const s602 = await login('vacia@carta.test');
    const s603 = await login('real@carta.test');
    const s604 = await login('dueno@carta.test');
    tt('B1b login de las cuatro cuentas semilla', [s601, s602, s603, s604].every((s) => s.status === 200 && s.cookie));

    const junkRe = /instagram photos and videos/i;
    const a1 = await get('/api/home/profile', s601.cookie);
    const p1 = (a1.j || {});
    tt('A1 [FIX] cuenta con snapshot-basura y fundamento real: pic = su logo guardado, bio = la del kit (su estrella), link-residuo fuera',
      a1.status === 200 && p1.ok === true && p1.pic === '/ai-avatar.png'
      && !junkRe.test(String(p1.bio || '')) && String(p1.bio || '').includes('Medialuna')
      && p1.link === '' && p1.username === 'negociocarta',
      JSON.stringify({ pic: p1.pic, bio: p1.bio, link: p1.link }).slice(0, 300));

    const a2 = await get('/api/home/profile', s602.cookie);
    const p2 = (a2.j || {});
    tt('A2 [FIX] cuenta sin fundamento guardado: degrada con gracia — bio del kit sin scrape, sin foto inventada, link-residuo fuera',
      a2.status === 200 && p2.ok === true && !junkRe.test(String(p2.bio || '')) && String(p2.bio || '').length > 0
      && !p2.pic && p2.link === '',
      JSON.stringify({ pic: p2.pic, bio: p2.bio, link: p2.link }).slice(0, 300));

    const a3 = await get('/api/home/profile', s603.cookie);
    const p3 = (a3.j || {});
    tt('A3 la lectura real no se toca: bio, foto y link reales pasan tal cual',
      a3.status === 200 && p3.bio === 'Panadería artesanal · medialunas todos los días'
      && p3.pic === 'https://example.com/foto-real.jpg' && p3.link === 'https://negocioreal.example/',
      JSON.stringify({ bio: p3.bio, pic: p3.pic, link: p3.link }).slice(0, 300));

    const a4 = await get('/api/home/profile', s604.cookie);
    const p4 = (a4.j || {});
    tt('A4 lo que el dueño guardó manda: su bio y su link (aunque sea el de Instagram) no se tocan',
      a4.status === 200 && p4.bio === 'Bio escrita por el dueño' && p4.link === 'https://instagram.com/negociodueno',
      JSON.stringify({ bio: p4.bio, link: p4.link }).slice(0, 300));

    const a5 = await get('/api/analysis', s601.cookie);
    const p5 = (a5.j || {});
    tt('A5 la carta que la vista pinta existe: GET /api/analysis trae el análisis con su carta firmada (analysis.carta_url)',
      a5.status === 200 && p5.ok === true && !!p5.analysis && typeof (p5.analysis || {}).carta_url === 'string' && p5.analysis.carta_url.startsWith('/carta/'),
      JSON.stringify({ ok: p5.ok, carta_url: (p5.analysis || {}).carta_url }).slice(0, 200));

    // ---------- 3. Chromium ----------
    seccion('3. Chromium: el toque de la push aterriza en la carta; la tarjeta muestra la cara real');
    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); break; } catch (e) {}
    }
    tt('C0 playwright-core disponible', !!pw);
    if (pw && s601.raw) {
      let exe = null;
      const basePw = path.join(os.homedir(), '.cache/ms-playwright');
      try {
        for (const dir of fs.readdirSync(basePw)) {
          const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
          if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
        }
      } catch (e) {}
      browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addCookies([{ name: s601.raw.name, value: s601.raw.value, url: base }]);
      const page = await ctx.newPage();
      const esperar = async (fn, arg, ms) => {
        try { await page.waitForFunction(fn, arg, { timeout: ms || 20000 }); return true; }
        catch (e) { return false; }
      };
      await page.goto(base + '/#/app/analisis', { waitUntil: 'domcontentloaded' });
      const c1 = await esperar(() => !!document.querySelector('.ana-wrap') && location.hash === '#/app/analisis');
      const hashC1 = await page.evaluate(() => location.hash);
      tt('C1 [FIX] el destino de la push (#/app/analisis) rinde la carta (la vista de análisis) y el hash no rebota a Ads',
        c1 && hashC1 === '#/app/analisis', 'hash final: ' + hashC1);

      await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      const c2 = await esperar(() => !!document.querySelector('.hf-head'));
      const head = c2 ? await page.evaluate(() => {
        const h = document.querySelector('.hf-head');
        const img = h ? h.querySelector('.hf-ava img') : null;
        return { txt: h ? h.textContent : '', img: img ? (img.getAttribute('src') || '') : '' };
      }) : { txt: '', img: '' };
      tt('C2 [FIX] la tarjeta de Inicio muestra la cara guardada (img con su logo) y la bio real del kit — nada de «P» sola ni del título de IG',
        c2 && head.img === '/ai-avatar.png' && !/instagram photos and videos/i.test(head.txt) && head.txt.includes('Medialuna'),
        JSON.stringify(head).slice(0, 300));
      await ctx.close();
    }
  } catch (e) {
    tt('B* la sección de boot corrió sin excepciones', false, String(e && e.message).slice(0, 300));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (child && !child.killed) { try { process.kill(child.pid, 'SIGTERM'); } catch (e) {} }
    await sleep(1200);
    let vivo = true;
    try { process.kill(child.pid, 0); } catch (e) { vivo = false; }
    tt('B9 el boot murió por su PID exacto y el puerto quedó libre', !vivo && puertoLibre(PORT));
    try { fs.rmSync(tmpD, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await bootSuite();
  console.log('\nTOTAL: ' + pass + ' ok · ' + fail + ' MAL');
  if (fails.length) console.log('Fallan: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
