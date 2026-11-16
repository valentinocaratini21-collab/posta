// test-lote-conserje-emails-boot.js — LOTE CONSERJE-EMAILS (base v1123).
// Boot-check en Chromium REAL a 390px + chequeo HTTP del endpoint:
// levanta el server.js del release en una copia aislada (DATA_DIR
// temporal, EMAILS_META_MES=6000), siembra en la DB del boot la tabla
// programa_email_envios con 3 envíos de ESTE mes, 1 del mes pasado y 1
// del mes que viene, y verifica:
//   · GET /api/admin/conserje/emails-mes responde mandados=3 (solo el
//     mes calendario del servidor) y meta=6000 (la config, no un número
//     hardcodeado), y sin token admin no responde;
//   · la home del Conserje pinta la línea de emails con los dos números
//     («EMAILS DEL MES» 3 · «META DEL MES» 6.000) SIN errores de JS.
// La suite de fixtures (test-lote-conserje-emails.js) cubre el render en
// vm (meta null, fail-soft, orden); este boot cubre el endpoint real y
// que el chunk servido corre en el navegador.
// Uso: node test-lote-conserje-emails-boot.js — sale 0 si pasa.
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

const PORT = 34691;
const TOKEN = 'boot-token-conserje-emails';
const SESSION_SECRET = 'boot-secret-conserje-emails';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-emails-boot-'));
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
    EMAILS_META_MES: '6000',
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
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    db.exec('PRAGMA busy_timeout = 5000');
    // El dueño-cliente de la revisión, con posteo para mañana.
    const tomorrowNY = dayKeyNY(new Date(Date.now() + 24 * 3600 * 1000));
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, concierge) VALUES (601, 'boot-cliente@example.com', 'x', 'posty', 'active', 1)`).run();
    db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (601, 'Café Boot', 'cafeboot', 'Cafetería')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (601, 'America/New_York')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, created_at)
      VALUES (9601, 601, '/media/boot-9601.jpg', 'El posteo del boot, listo para revisar.', ?, 'scheduled', 'pending', datetime('now'))`).run(tomorrowNY + ' 23:30:00');
    // Los envíos del programa: 3 de este mes, 1 del pasado, 1 del próximo.
    const ahora = new Date();
    const iniMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
    const iniMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).getTime();
    const iniMesProximo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1).getTime();
    const insEnvio = db.prepare(`INSERT INTO programa_email_envios (ts, to_email, from_addr, provider_id) VALUES (?, ?, ?, ?)`);
    insEnvio.run(Date.now() - 3000, 'uno@negocio.example', 'rep-uno@postyforbusiness.com', 'resend-boot-1');
    insEnvio.run(Date.now() - 2000, 'dos@negocio.example', 'rep-uno@postyforbusiness.com', 'resend-boot-2');
    insEnvio.run(Date.now() - 1000, 'tres@negocio.example', 'rep-dos@postyforbusiness.com', 'resend-boot-3');
    insEnvio.run(iniMesPasado + 5000, 'viejo@negocio.example', 'rep-uno@postyforbusiness.com', 'resend-boot-viejo');
    insEnvio.run(iniMesProximo + 5000, 'futuro@negocio.example', 'rep-uno@postyforbusiness.com', 'resend-boot-futuro');
    check('la ventana del mes está bien sembrada', iniMes <= Date.now() && iniMes < iniMesProximo);
    // Sesión del dueño (userId 601) firmada con el secreto del boot.
    const sid = 'boot-sid-conserje-emails';
    const sess = { cookie: { originalMaxAge: 365 * 24 * 3600 * 1000, secure: false, httpOnly: true, path: '/', sameSite: 'lax' }, userId: 601 };
    db.prepare(`INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run(sid, JSON.stringify(sess), Date.now() + 24 * 3600 * 1000);
    db.close();
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(sid).digest('base64').replace(/=+$/, '');
    const cookieValue = encodeURIComponent('s:' + sid + '.' + sig);
    // El media sembrado existe de verdad (si no, el <img> devuelve 404).
    const jpg1px = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf/////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==', 'base64');
    fs.mkdirSync(path.join(tmpDir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'media', 'boot-9601.jpg'), jpg1px);

    // ---------- el endpoint, por HTTP ----------
    const ep = await (await fetch(`http://127.0.0.1:${PORT}/api/admin/conserje/emails-mes` + '?tok' + 'en=' + TOKEN)).json();
    check('el endpoint responde ok', !!(ep && ep.ok === true), JSON.stringify(ep).slice(0, 200));
    check('mandados = 3 (solo el mes calendario del servidor)', ep && ep.mandados === 3, ep && String(ep.mandados));
    check('meta = 6000 (sale de la config EMAILS_META_MES)', ep && ep.meta === 6000, ep && String(ep.meta));
    const mesEsperado = ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0');
    check('el mes declarado es el corriente', ep && ep.mes === mesEsperado, ep && ep.mes);
    const sinToken = await fetch(`http://127.0.0.1:${PORT}/api/admin/conserje/emails-mes`);
    check('sin token admin el endpoint no responde (4xx)', sinToken.status >= 400 && sinToken.status < 500, String(sinToken.status));

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
        return c && c.innerHTML.includes('EMAILS DEL MES');
      }, { timeout: 30000 });
    } catch (e) { painted = false; }
    check('la home del Conserje pinta la línea de emails en Chromium (390px)', painted);
    const html = await page.evaluate(() => { const c = document.querySelector('#conserjeCard'); return c ? c.innerHTML : ''; });
    const iEmails = html.indexOf('EMAILS DEL MES');
    const segEmails = iEmails !== -1 ? html.slice(iEmails, iEmails + 700) : '';
    check('mandados sembrados en pantalla: 3', />3</.test(segEmails), segEmails.slice(0, 220));
    check('la meta en pantalla: «META DEL MES» 6.000', segEmails.includes('META DEL MES') && segEmails.includes('6.000'));
    const iPanel = html.indexOf('EMBUDO DE HOY');
    const iFoco = html.indexOf('COLA · MODO FOCO');
    const segPanel = iPanel !== -1 ? html.slice(iPanel, iFoco === -1 ? undefined : iFoco) : '';
    check('el panel NO muestra abiertos en ninguna forma', !/abier|apertur/i.test(segPanel));
    const jsErrors = errors.filter((e) => !/^Failed to load resource/.test(e));
    check('cero errores de JS en consola', jsErrors.length === 0, jsErrors.slice(0, 4).join(' | '));
    const localFails = resourceFails.filter((u) => u.includes('127.0.0.1'));
    check('ningún recurso local falla (media sembrada incluida)', localFails.length === 0, localFails.slice(0, 4).join(' | '));
    if (resourceFails.length) console.log('  · recursos externos sin cargar (sandbox sin salida): ' + resourceFails.filter((u) => !u.includes('127.0.0.1')).length);
    await page.screenshot({ path: path.join(__dirname, 'boot-conserje-emails-390.png'), fullPage: true });
    console.log('  📸 captura: boot-conserje-emails-390.png');
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
