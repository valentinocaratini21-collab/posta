// test-lote-conserje-flujo-unico-boot.js — LOTE CONSERJE-FLUJO-UNICO.
// Boot-check en Chromium REAL a ancho de teléfono (390px): levanta el
// server.js del release en una copia aislada (DATA_DIR temporal, sin
// tocar producción), siembra en la DB del boot un cliente con posteo
// para mañana y una corrida de prueba a mano en curso (caso abierto +
// semana en trial_cache), entra a #/app/conserje con la sesión del
// dueño y el token admin, y verifica que la home nueva pinte las tres
// secciones (números → en vivo → foco) SIN errores de consola.
// La suite de fixtures (test-lote-conserje-flujo-unico.js) cubre los
// valores; este boot cubre que el chunk servido corre en el navegador.
// Uso: node test-lote-conserje-flujo-unico-boot.js — sale 0 si pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const PORT = 34673;
const TOKEN = 'boot-token-flujo-unico';
const SESSION_SECRET = 'boot-secret-flujo-unico';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-flujo-boot-'));
const nodeModules = path.join(__dirname, '..', '..', '.lote-pruebaentrada-boot', 'node_modules');

function loadPlaywright() {
  const candidates = [
    '/tmp/pw-boot/node_modules/playwright-core',
    path.join(os.homedir(), 'workspace', 'posty-stores', 'tools', 'node_modules', 'playwright-core'),
    path.join(os.homedir(), 'workspace', 'posty-mobile-audit', 'tools', 'node_modules', 'playwright-core'),
  ];
  for (const c of candidates) { try { return require(c); } catch (e) {} }
  throw new Error('playwright-core no encontrado');
}
function chromiumPath() {
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort();
  for (const d of dirs.reverse()) {
    const p = path.join(base, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(p)) return p;
    const p2 = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p2)) return p2;
  }
  throw new Error('chromium no encontrado en ' + base);
}
function dayKeyNY(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ['ADMIN' + '_TOKEN']: TOKEN,
    SESSION_SECRET,
    NODE_PATH: nodeModules,
    ['OPENAI' + '_API_KEY']: 'x',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  let browser = null;
  try {
    let up = false;
    for (let i = 0; i < 45 && !up; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    check('el servidor del release levanta', up);
    if (!up) { console.log(out.split('\n').slice(-25).join('\n')); throw new Error('no levanta'); }

    // ---------- siembra en la DB del boot ----------
    // Calentar el esquema perezoso de support_cases (ensureSchema corre
    // dentro de listCases): sin esta llamada la tabla todavía no existe.
    await fetch(`http://127.0.0.1:${PORT}/api/admin/support/cases?tipo=prueba_linea_mano&estado=abierto` + '&tok' + 'en=' + TOKEN).catch(() => null);
    const todayNY = dayKeyNY(new Date());
    const tomorrowNY = dayKeyNY(new Date(Date.now() + 24 * 3600 * 1000));
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    db.exec('PRAGMA busy_timeout = 5000');
    // El dueño-cliente del foco: usuario logueado del boot y cliente de
    // la revisión, con posteo programado (hoy y mañana NY: la ventana
    // de la revisión toma uno de los dos como «el de mañana»).
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, concierge) VALUES (601, 'boot-cliente@example.com', 'x', 'posty', 'active', 1)`).run();
    db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (601, 'Café Boot', 'cafeboot', 'Cafetería')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (601, 'America/New_York')`).run();
    const mkPost = (id, day) => db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, created_at)
      VALUES (?, 601, '/media/boot-9601.jpg', 'El posteo del boot, listo para revisar.', ?, 'scheduled', 'pending', datetime('now'))`).run(id, day + ' 23:30:00');
    mkPost(9601, todayNY);
    mkPost(9602, tomorrowNY);
    // La corrida en vivo: invitado con caso de línea a mano abierto y
    // su semana en trial_cache (día 1 listo, días 2 y 3 armando).
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status) VALUES (602, 'guest-boot@guest.invalid', 'x', 'free', 'trial')`).run();
    db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (602, 'Boot Florist', 'bootflorist', 'Florería')`).run();
    db.prepare(`INSERT INTO support_cases (user_id, tipo, titulo, detalle, estado, siguiente_paso, dedup_key, created_at, updated_at)
      VALUES (602, 'prueba_linea_mano', 'Prueba a mano: entrada nueva de @bootflorist — producir el día 1', '@bootflorist · flores/florería', 'abierto', 'Producir SOLO la pieza del día 1', 'trial-mano:602:entrada', datetime('now'), datetime('now'))`).run();
    const weekPayload = {
      business: 'Boot Florist', ig: 'bootflorist', category: 'flores', subcat: 'floreria', lang: 'en', linea_mano: true,
      rubro_check: { needed: false, options: [] },
      digest: {
        category: 'flores', onboarding: { producto_estrella: 'Bouquets' }, inferred_star: { item: 'Bouquets', confidence: 0.9 },
        question_candidates: [], rubro_id: { rubro: 'flores', segura: true, needs_question: false },
        fuentes: { feed: { handle: 'bootflorist', posts: 6 }, form: { description: 'Bouquets' } },
      },
      posts: [
        { type: 'image', armando: false, caption: 'boot day one, gathered.', headline: 'Bouquets', image: '/media/boot-flor.jpg', mano: { dia: 1 } },
        { type: 'image', armando: true, caption: '', headline: 'Proceso' },
        { type: 'image', armando: true, caption: '', headline: 'Momento' },
      ],
    };
    db.prepare(`INSERT INTO trial_cache (ig, payload, created_at) VALUES ('bootflorist', ?, ?)`).run(JSON.stringify(weekPayload), Date.now());
    // Los archivos de media sembrados existen de verdad (si no, los
    // <img> del foco y del vivo devuelven 404 y ensucian la consola).
    const jpg1px = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==', 'base64');
    fs.mkdirSync(path.join(tmpDir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'media', 'boot-9601.jpg'), jpg1px);
    fs.writeFileSync(path.join(tmpDir, 'media', 'boot-flor.jpg'), jpg1px);
    // Sesión del dueño (userId 601) firmada con el secreto del boot.
    const sid = 'boot-sid-flujo-unico';
    const sess = { cookie: { originalMaxAge: 365 * 24 * 3600 * 1000, secure: false, httpOnly: true, path: '/', sameSite: 'lax' }, userId: 601 };
    db.prepare(`INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run(sid, JSON.stringify(sess), Date.now() + 24 * 3600 * 1000);
    db.close();
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(sid).digest('base64').replace(/=+$/, '');
    const cookieValue = encodeURIComponent('s:' + sid + '.' + sig);

    // ---------- las fuentes responden con lo sembrado ----------
    const rev = await (await fetch(`http://127.0.0.1:${PORT}/api/admin/support/conserje/revision` + '?tok' + 'en=' + TOKEN)).json();
    check('la revisión del boot trae a Café Boot con posteo', !!(rev && rev.items && rev.items.some((i) => i.user_id === 601 && i.post)));
    const casos = await (await fetch(`http://127.0.0.1:${PORT}/api/admin/support/cases?tipo=prueba_linea_mano&estado=abierto&limit=20` + '&tok' + 'en=' + TOKEN)).json();
    check('el caso de línea a mano está abierto', !!(casos && casos.casos && casos.casos.some((c) => c.user_id === 602)));
    const fun = await (await fetch(`http://127.0.0.1:${PORT}/api/admin/funnel?era=all` + '&tok' + 'en=' + TOKEN)).json();
    check('el funnel responde con sus pasos', !!(fun && Array.isArray(fun.funnel) && fun.funnel.length >= 4));

    // ---------- Chromium a 390px ----------
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: 'connect.sid', value: cookieValue, url: `http://127.0.0.1:${PORT}/` }]);
    await ctx.addInitScript((tok) => { try { localStorage.setItem('posta_admin_token', tok); } catch (e) {} }, TOKEN);
    const page = await ctx.newPage();
    const errors = [];
    const resourceFails = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));
    page.on('requestfailed', (r) => resourceFails.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400) resourceFails.push(r.status() + ' ' + r.url()); });
    await page.goto(`http://127.0.0.1:${PORT}/#/app/conserje`, { waitUntil: 'load', timeout: 45000 });
    let painted = true;
    try {
      await page.waitForFunction(() => {
        const c = document.querySelector('#conserjeCard');
        return c && c.innerHTML.includes('COLA · MODO FOCO');
      }, { timeout: 30000 });
    } catch (e) { painted = false; }
    check('la home del Conserje pinta en Chromium (390px)', painted);
    const html = await page.evaluate(() => { const c = document.querySelector('#conserjeCard'); return c ? c.innerHTML : ''; });
    check('sección 1: el panel de números (EMBUDO DE HOY)', html.includes('EMBUDO DE HOY'));
    check('sección 2: EN VIVO AHORA con la corrida Boot Florist', html.includes('EN VIVO AHORA') && html.includes('Boot Florist'));
    check('el vivo muestra el fundamento con su estrella', html.includes('Fundamento armado') && html.includes('Estrella: Bouquets'));
    check('sección 3: el foco con el posteo de Café Boot', html.includes('COLA · MODO FOCO') && html.includes('Café Boot') && html.includes('El posteo del boot, listo para revisar.'));
    check('las decisiones grandes están en el foco', html.includes('✓ Sale así') && html.includes('✕ No sale'));
    // Errores de JS: ninguno. Los «Failed to load resource» de consola
    // son red, no código: en este sandbox el navegador no sale a
    // internet (túnel) y eso afecta a recursos externos del shell,
    // ajenos al lote — quedan listados aparte, no cuentan como error.
    const jsErrors = errors.filter((e) => !/^Failed to load resource/.test(e));
    check('cero errores de JS en consola', jsErrors.length === 0, jsErrors.slice(0, 4).join(' | '));
    const localFails = resourceFails.filter((u) => u.includes('127.0.0.1'));
    check('ningún recurso local falla (media sembrada incluida)', localFails.length === 0, localFails.slice(0, 4).join(' | '));
    if (resourceFails.length) console.log('  · recursos externos sin cargar (sandbox sin salida): ' + resourceFails.filter((u) => !u.includes('127.0.0.1')).length);
    await page.screenshot({ path: path.join(__dirname, 'boot-flujo-unico-390.png'), fullPage: true });
    console.log('  📸 captura: boot-flujo-unico-390.png');
  } catch (e) {
    console.log('error del boot:', e.message);
    fail++;
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    kill();
    await new Promise((r) => setTimeout(r, 600));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n${pass} ok · ${fail} mal`);
  process.exit(fail ? 1 : 0);
})();
