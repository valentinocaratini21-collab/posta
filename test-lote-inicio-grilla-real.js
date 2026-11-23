'use strict';
/*
 * LOTE INICIO-GRILLA-REAL (22/11) — Inicio pinta la grilla REAL o un
 * estado honesto de carga, nunca la grilla vencida como actual.
 *
 * Caso fundante (confirmado por el censo de PUSH-DESTINO): el dueño
 * archivó TODOS sus posteos a la mañana y a las 19:02 su Inicio seguía
 * mostrando la grilla archivada entera. La causa: Inicio componía la
 * grilla desde los posteos locales + la lectura guardada de Instagram
 * (snapshot de 24 h) y reconciliaba con el vivo DESPUÉS de pintar
 * (hfLiveRevalidateFeed, asíncrono, con aborto a los 12 s): si la
 * lectura tardaba, abortaba o venía incompleta, la grilla vencida
 * quedaba plantada como si fuera el perfil.
 *
 * Qué afirma esta suite:
 *  A · estática: sintaxis, las 4 funciones nuevas definidas una sola
 *      vez y llamadas, la puerta presente en inicioView.
 *  B · VM: el filtro puro (hfLiveFilterTiles/hfLiveAtStake sobre
 *      hfLiveDropTile real) baja las tiles muertas y respeta vivas,
 *      fijadas y programadas; sin veredicto completo no toca nada.
 *  C · Chromium contra el server real, con la lectura guardada
 *      VENCIDA sembrada por intercepción de red (/api/home/profile
 *      trae 2 posteos que ya no existen en el vivo) y SONDAS cada
 *      100 ms durante la carga:
 *      C1 veredicto completo que tarda 1,2 s → la grilla vencida
 *         NUNCA se presenta (0 sondas con tiles muertas), la final
 *         es la del vivo.
 *      C2 veredicto rápido y lectura vigente → la grilla pinta
 *         completa y sin esperas nuevas (tiempo medido).
 *      C3 veredicto incompleto primero, completo al reintento → la
 *         grilla queda en carga honesta y la pintura tardía trae la
 *         real; las muertas jamás aparecen.
 *      C4 la lectura viva tarda más que el aborto (13 s) → ni una
 *         sonda ve la grilla vencida; el lugar queda en carga.
 *
 * Control contra la base prístina: B falla (las funciones no existen),
 * C1/C3/C4 reproducen el defecto (las sondas ven las tiles muertas
 * pintadas como el perfil) y C2 pasa (la pintura de siempre).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawn } = require('child_process');

const ROOT = __dirname;
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function buscarPuerto() {
  for (let p = 36900; p < 37100; p++) {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      if (!out.includes(':' + p + ' ')) return p;
    } catch (e) { return p; }
  }
  return 0;
}

// ---------------------------------------------------------------------
function seccionA() {
  seccion('A · estática');
  const src = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A1 node --check public/app.js', true); }
  catch (e) { t('A1 node --check public/app.js', false, String(e.message).slice(-200)); }
  for (const f of ['hfLiveGridVerdict', 'hfLiveAtStake', 'hfLiveFilterTiles', 'hfLiveGridLatePaint']) {
    const defs = (src.match(new RegExp('function ' + f + '\\b', 'g')) || []).length;
    const calls = (src.match(new RegExp(f + '\\(', 'g')) || []).length;
    t('A2 ' + f + ': definida 1 vez y llamada', defs === 1 && calls >= 2, 'defs=' + defs + ' calls=' + calls);
  }
  t('A3 la puerta está en inicioView (hfGridPending + hfGridSlot)',
    src.includes('hfGridPending') && src.includes('id="hfGridSlot"') && src.includes('hfLiveGridLatePaint'));
  t('A4 el veredicto es compartido (la revalidación ya no fetchea por su cuenta)',
    src.includes('const verdict = await hfLiveGridVerdict();'));
}

// ---------------------------------------------------------------------
function extraerFn(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let depth = 0, j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function seccionB() {
  seccion('B · VM: el filtro puro');
  const src = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const partes = ['hfIgShortcode', 'hfLiveDropTile', 'hfLiveAtStake', 'hfLiveFilterTiles']
    .map((n) => extraerFn(src, n));
  t('B0 las 4 funciones se extraen del bundle', partes.every(Boolean));
  if (!partes.every(Boolean)) return;
  const ctx = { pcParseDate: (s) => { const d = new Date(s); return isNaN(d) ? null : d; }, Set, Date, Number, String, Array, Object };
  vm.createContext(ctx);
  vm.runInContext(partes.join('\n'), ctx);
  const hace = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const tiles = [
    { kind: 'post', post: { id: 1, status: 'published', pinned: 0, published_at: hace(2), ig_permalink: 'https://www.instagram.com/p/VIVO1/' } },
    { kind: 'post', post: { id: 2, status: 'published', pinned: 0, published_at: hace(3), ig_permalink: 'https://www.instagram.com/p/MUERTO1/' } },
    { kind: 'post', post: { id: 3, status: 'published', pinned: 1, published_at: hace(3), ig_permalink: 'https://www.instagram.com/p/FIJADO/' } },
    { kind: 'post', post: { id: 4, status: 'scheduled', pinned: 0, scheduled_at: hace(-5), ig_permalink: '' } },
    { kind: 'ig', shortcode: 'VIVO2', taken_at: Math.floor((Date.now() - 3600000) / 1000) },
    { kind: 'ig', shortcode: 'MUERTO2', taken_at: Math.floor((Date.now() - 7200000) / 1000) },
  ];
  const verdict = { complete: true, live: new ctx.Set(['VIVO1', 'VIVO2']), cutoffMs: Date.now() - 7 * 86400000 };
  const r = ctx.hfLiveFilterTiles(tiles, verdict);
  const ids = r.kept.map((x) => x.kind === 'post' ? 'p' + x.post.id : 'ig:' + x.shortcode);
  t('B1 el filtro baja exactamente las 2 muertas', r.dropped === 2 && ids.join(',') === 'p1,p3,p4,ig:VIVO2', ids.join(','));
  t('B2 sin veredicto completo no se toca nada', ctx.hfLiveFilterTiles(tiles, { complete: false }).dropped === 0
    && ctx.hfLiveFilterTiles(tiles, null).dropped === 0);
  t('B3 hay juego cuando hay publicadas con shortcode', ctx.hfLiveAtStake(tiles) === true);
  t('B4 sin juego: solo programadas o sin permalink',
    ctx.hfLiveAtStake([{ kind: 'post', post: { id: 9, status: 'scheduled', scheduled_at: hace(-2), ig_permalink: '' } },
      { kind: 'post', post: { id: 10, status: 'published', published_at: hace(1), ig_permalink: '' } }]) === false);
}

// ---------------------------------------------------------------------
const SEED_C = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
  VALUES (601, 'dueno@grillaqa.test', ?, 'posty', 'active', 0, 0, 0, NULL, NULL, 1, 'es', 1, '2026-09-01 10:00:00')\`).run(hash);
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (601, ?, ?, ?, 1)')
  .run('Negocio Grilla QA', 'grillaqa', 'café');
db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (601, 'America/New_York', '')").run();
const iso = (ms) => new Date(ms).toISOString();
db.prepare(\`INSERT INTO posts (id, user_id, image_path, caption, status, media_type, scheduled_at, published_at, ig_permalink, created_at)
  VALUES (6011, 601, '/media/semilla.jpg', 'POSTEO VIVO QA', 'published', 'image', ?, ?, 'https://www.instagram.com/p/VIVO1/', ?)\`)
  .run(iso(Date.now() - 7200000), iso(Date.now() - 7200000), iso(Date.now() - 7200000));
db.prepare(\`INSERT INTO posts (id, user_id, image_path, caption, status, media_type, scheduled_at, published_at, ig_permalink, created_at)
  VALUES (6012, 601, '/media/semilla.jpg', 'POSTEO ARCHIVADO QA', 'published', 'image', ?, ?, 'https://www.instagram.com/p/MUERTO1/', ?)\`)
  .run(iso(Date.now() - 10800000), iso(Date.now() - 10800000), iso(Date.now() - 10800000));
console.log('semilla C ok');
`;

async function seccionC() {
  seccion('C · Chromium: sondas durante la carga');
  const PORT = buscarPuerto();
  t('C0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) return;
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-boot-'));
  const seedFile = path.join(tmpD, 'seed.js');
  fs.writeFileSync(seedFile, SEED_C);
  try {
    execFileSync(process.execPath, [seedFile, tmpD, ROOT], { encoding: 'utf8', timeout: 120000 });
    t('C0b la semilla cargó', true);
  } catch (e) { t('C0b la semilla cargó', false, String(e.stdout || e.message).slice(-300)); return; }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-grilla', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  const base = 'http://127.0.0.1:' + PORT;

  const ahoraS = () => Math.floor(Date.now() / 1000);
  const perfilVencido = () => JSON.stringify({
    ok: true, username: 'grillaqa', name: 'Negocio Grilla QA', pic: '',
    posts_count: 4, followers: 10, following: 5, category: null, note: null, location: null,
    recents: [
      { shortcode: 'VIVO2', img: 'https://example.com/vivo2.jpg', type: 'image', taken_at: ahoraS() - 3600, likes: 1, comments: 0 },
      { shortcode: 'MUERTO2', img: 'https://example.com/muerto2.jpg', type: 'image', taken_at: ahoraS() - 7200, likes: 1, comments: 0 },
    ],
  });
  const vivoCompleto = (codes) => JSON.stringify({
    ok: true, complete: true, shortcodes: codes,
    window_oldest: new Date(Date.now() - 7 * 86400000).toISOString(),
  });

  let browser = null;
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) {}
      if (!up) await sleep(500);
    }
    t('C1 el servidor levanta en el puerto libre', up, serverLog.slice(-300));
    if (!up) return;

    const lr = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dueno@grillaqa.test', password: 'ClaveQA123' }),
    });
    const setCookie = lr.headers.get('set-cookie') || '';
    const m = setCookie.match(/^([^=]+)=([^;]+)/);
    t('C1b login de la cuenta semilla', lr.status === 200 && !!m);
    if (!m) return;
    const cookie = { name: m[1], value: m[2] };

    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); break; } catch (e) {}
    }
    t('C1c playwright-core disponible', !!pw);
    if (!pw) return;
    let exe;
    const basePw = path.join(os.homedir(), '.cache/ms-playwright');
    try {
      for (const dir of fs.readdirSync(basePw)) {
        const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
        if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
      }
    } catch (e) {}
    browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });

    // Corre un escenario: instala las rutas según `guion` (n = número
    // de pedido a live-grid, 1-based) y sondea el DOM cada 100 ms.
    async function escenario(guion, duracionMs) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addCookies([{ name: cookie.name, value: cookie.value, url: base }]);
      const page = await ctx.newPage();
      let nLive = 0;
      await page.route('**/api/home/profile', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: perfilVencido() });
      });
      await page.route('**/api/home/live-grid', async (route) => {
        nLive++;
        const g = guion(nLive) || { delay: 0, body: { ok: true, complete: false } };
        if (g.delay) await sleep(g.delay);
        try { await route.fulfill({ status: 200, contentType: 'application/json', body: typeof g.body === 'string' ? g.body : JSON.stringify(g.body) }); } catch (e) {}
      });
      const sondas = [];
      const t0 = Date.now();
      await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      while (Date.now() - t0 < duracionMs) {
        try {
          const s = await page.evaluate(() => ({
            muertoPost: !!document.querySelector('#inicioView .hf-grid [data-post-id="6012"]'),
            muertoIg: !!document.querySelector('#inicioView .hf-grid [data-shortcode="MUERTO2"]'),
            vivoPost: !!document.querySelector('#inicioView .hf-grid [data-post-id="6011"]'),
            vivoIg: !!document.querySelector('#inicioView .hf-grid [data-shortcode="VIVO2"]'),
            slot: !!document.getElementById('hfGridSlot'),
            grilla: !!document.querySelector('#inicioView .hf-grid'),
          }));
          s.t = Date.now() - t0;
          sondas.push(s);
        } catch (e) {}
        await sleep(100);
      }
      await ctx.close();
      return sondas;
    }
    const alguna = (ss, k) => ss.some((s) => s[k]);
    const primera = (ss, k) => { const s = ss.find((x) => x[k]); return s ? s.t : null; };

    // C1 · veredicto completo que tarda: la vencida nunca se presenta.
    const s1 = await escenario(() => ({ delay: 1200, body: vivoCompleto(['VIVO1', 'VIVO2']) }), 7000);
    t('C2 [veredicto 1,2 s] 0 sondas con la tile local archivada', !alguna(s1, 'muertoPost'),
      'sondas=' + s1.length + ' primera=' + primera(s1, 'muertoPost'));
    t('C3 [veredicto 1,2 s] 0 sondas con la tile IG archivada', !alguna(s1, 'muertoIg'));
    t('C4 [veredicto 1,2 s] la grilla final es la del vivo (vivas sí, muertas no)',
      !!s1.length && s1[s1.length - 1].vivoPost && s1[s1.length - 1].vivoIg && !s1[s1.length - 1].muertoPost && !s1[s1.length - 1].muertoIg,
      JSON.stringify(s1[s1.length - 1] || {}));

    // C2 · lectura vigente y veredicto rápido: pintura completa, sin
    // esperas nuevas (se mide y se acota).
    const s2 = await escenario(() => ({ delay: 100, body: vivoCompleto(['VIVO1', 'VIVO2', 'MUERTO1', 'MUERTO2']) }), 6000);
    const tGrilla = primera(s2, 'grilla');
    t('C5 [vigente] la grilla pinta completa (las 4 tiles)', !!s2.length && s2[s2.length - 1].vivoPost && s2[s2.length - 1].vivoIg && s2[s2.length - 1].muertoPost && s2[s2.length - 1].muertoIg,
      JSON.stringify(s2[s2.length - 1] || {}));
    t('C6 [vigente] sin esperas nuevas: grilla visible en ≤3,5 s', tGrilla !== null && tGrilla <= 3500, 't=' + tGrilla + ' ms');
    console.log('    · tiempo a grilla (vigente): ' + tGrilla + ' ms · sondas: ' + s2.length);

    // C3 · incompleto primero, completo al reintento: carga honesta y
    // pintura tardía con la grilla real.
    const s3 = await escenario((n) => n === 1
      ? { delay: 100, body: { ok: true, complete: false } }
      : { delay: 100, body: vivoCompleto(['VIVO1', 'VIVO2']) }, 30000);
    t('C7 [incompleto→completo] 0 sondas con tiles muertas en toda la espera',
      !alguna(s3, 'muertoPost') && !alguna(s3, 'muertoIg'), 'sondas=' + s3.length);
    t('C8 [incompleto→completo] el lugar quedó en carga honesta (slot visto)',
      alguna(s3, 'slot'));
    t('C9 [incompleto→completo] la pintura tardía trae la grilla del vivo',
      !!s3.length && s3[s3.length - 1].vivoPost && s3[s3.length - 1].vivoIg && !s3[s3.length - 1].muertoPost && !s3[s3.length - 1].muertoIg,
      JSON.stringify(s3[s3.length - 1] || {}));

    // C4 · la lectura viva supera el aborto del cliente (12 s): la
    // vencida no se planta; el lugar queda en carga.
    const s4 = await escenario(() => ({ delay: 13000, body: vivoCompleto(['VIVO1', 'VIVO2']) }), 6000);
    t('C10 [aborto] 0 sondas con tiles muertas', !alguna(s4, 'muertoPost') && !alguna(s4, 'muertoIg'), 'sondas=' + s4.length);
    t('C11 [aborto] el lugar queda en carga, no en la grilla vencida', alguna(s4, 'slot') && !alguna(s4, 'grilla'));
  } catch (e) {
    t('C* la corrida de Chromium completó', false, String(e && e.message).slice(-300));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(300);
    try { if (child.exitCode === null) child.kill('SIGKILL'); } catch (e) {}
  }
}

// ---------------------------------------------------------------------
(async () => {
  seccionA();
  seccionB();
  await seccionC();
  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})();
