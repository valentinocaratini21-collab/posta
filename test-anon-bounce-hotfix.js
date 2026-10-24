'use strict';
/*
 * test-anon-bounce-hotfix.js — v371: LA LANDING NO REBOTA AL LOGIN.
 *
 * El defecto (vivo hasta v370): render() dispara ttEnhance() a los 80 ms en
 * CADA render — también en rutas públicas — y ttStatusOnce() pedía
 * /api/tiktok/status (requireAuth → 401 anónimo). El wrapper api, ante
 * cualquier 401, seteaba location.hash = '#/login' como efecto lateral
 * ANTES de lanzar el error: el visitante sin sesión veía la landing un
 * parpadeo y terminaba en el login. Invisible para QA por curl (es
 * comportamiento del cliente) y para el dueño (siempre logueado).
 *
 * El arreglo (defensa en profundidad):
 *  1) El wrapper solo rebota al login si hay una sesión que proteger
 *     (ruta #/app…, ME cargado o cuenta guardada con token en el
 *     dispositivo). En ruta pública el 401 vuelve como error común.
 *  2) ttEnhance() no pide el endpoint sin contexto de sesión.
 *
 * Este test usa NAVEGADOR REAL (chromium headless vía playwright-core,
 * resuelto como en test-showcase.js). Sobre el árbol SIN el fix, las
 * partes A y D FALLAN (demostración del defecto); con el fix, todo pasa.
 * La parte C protege lo que NO debía cambiar: sesión muerta dentro de la
 * app sigue rebotando a #/login con posta_return_to.
 *
 * Modo remoto: HOTFIX_BASE=https://postycommunitymanager.com corre solo
 * las partes anónimas (A/B/D) contra esa base, sin boot local ni parte C
 * (nada de crear cuentas en producción).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; console.log('  ✘', name, extra ? '— ' + extra : ''); }
}

const REMOTE = process.env.HOTFIX_BASE || '';
// Puerto aleatorio por corrida (un listener viejo nunca contamina el boot)
// y DATA_DIR en el workspace: /tmp es un tmpfs de 512 MB que se llena y
// ya mató un boot a mitad de camino en esta misma tanda.
let PORT = 4500 + Math.floor(Math.random() * 400);
let BASE = REMOTE || `http://127.0.0.1:${PORT}`;

function resolveChromium() {
  let chromium = null;
  for (const cand of ['playwright', 'playwright-core',
    '/home/hatch/workspace/posty-stores/tools/node_modules/playwright-core',
    '/home/hatch/workspace/posty-mobile-audit/tools/node_modules/playwright-core']) {
    try { const m = require(cand); if (m && m.chromium) { chromium = m.chromium; break; } } catch (e) {}
  }
  let executablePath = null;
  try {
    const cacheDir = path.join(os.homedir(), '.cache', 'ms-playwright');
    const shells = fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium_headless_shell-')).sort();
    if (shells.length) executablePath = path.join(cacheDir, shells[shells.length - 1], 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  } catch (e) {}
  return { chromium, executablePath };
}

async function bootLocal() {
  const dataDir = fs.mkdtempSync(path.join(__dirname, '..', 'test-data-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error('el servidor murió en el boot: ' + log.slice(-300));
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return { child, dataDir }; } catch (e) {}
    if (Date.now() - t0 > 30000) throw new Error('el servidor no booteó: ' + log.slice(-300));
    await new Promise((r) => setTimeout(r, 400));
  }
}

(async () => {
  console.log('== test-anon-bounce-hotfix ==', REMOTE ? `(remoto: ${REMOTE})` : '(local)');
  let srv = null;
  if (!REMOTE) srv = await bootLocal();
  const { chromium, executablePath } = resolveChromium();
  ok('chromium disponible', !!chromium);
  if (!chromium) { console.log(`\n${pass} ok / ${fail} FAIL`); process.exit(1); }
  const browser = await chromium.launch(executablePath && fs.existsSync(executablePath) ? { executablePath } : {});
  try {
    // ---------- A: anónimo en la landing ----------
    console.log('— A: anónimo en la landing');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      let ttRequests = 0;
      page.on('request', (r) => { if (r.url().includes('/api/tiktok/status')) ttRequests++; });
      await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(1800); // el timer del defecto era 80 ms: sobra margen
      const st = await page.evaluate(() => ({
        hash: location.hash || '',
        loginForm: !!document.querySelector('#f_email'),
        landingNav: !!document.querySelector('.nav-landing'),
        plans: !!document.querySelector('#plansRow'),
      }));
      ok('A1: el hash NO saltó a #/login', !st.hash.startsWith('#/login'), 'hash=' + st.hash);
      ok('A2: la landing sigue visible (nav + planes, sin form de login)', st.landingNav && st.plans && !st.loginForm, JSON.stringify(st));
      ok('A3: sin sesión NO se pidió /api/tiktok/status', ttRequests === 0, 'requests=' + ttRequests);

      // ---------- D: el wrapper ante un 401 anónimo en ruta pública ----------
      console.log('— D: api.get con 401 en ruta pública no toca el hash');
      const d = await page.evaluate(async () => {
        const before = location.hash || '';
        let status = null;
        try { await api.get('/api/tiktok/status'); status = 200; }
        catch (e) { status = e && e.status; }
        return { before, after: location.hash || '', status };
      });
      ok('D1: el 401 vuelve como error (status 401)', d.status === 401, JSON.stringify(d));
      ok('D2: el hash quedó intacto (sin rebote)', d.after === d.before && !d.after.startsWith('#/login'), JSON.stringify(d));
      await ctx.close();
    }

    // ---------- B: anónimo en /prueba ----------
    console.log('— B: anónimo en /prueba');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(BASE + '/prueba', { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(1200);
      const st = await page.evaluate(() => ({
        path: location.pathname,
        hash: location.hash || '',
        form: !!document.querySelector('#f_ig'),
      }));
      ok('B1: sigue en /prueba, sin rebote al login', st.path === '/prueba' && !st.hash.startsWith('#/login'), JSON.stringify(st));
      ok('B2: el formulario público de la prueba está visible', st.form, JSON.stringify(st));
      await ctx.close();
    }

    // ---------- C: sesión muerta DENTRO de la app (lo que no debía cambiar) ----------
    if (!REMOTE) {
      console.log('— C: sesión muerta en #/app sigue rebotando con return-to');
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
      // NO esperar la landing pintada: sin el fix, el rebote la reemplaza
      // por el login en un parpadeo (carrera). Alcanza con que app.js haya
      // cargado: el registro va por fetch, indiferente a la vista pintada.
      await page.waitForFunction(() => typeof api === 'object' && !!api.get, null, { timeout: 20000 });
      const reg = await page.evaluate(async () => {
        const r = await fetch('/api/auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'hotfix-bounce@test.local', password: 'test-password-123' }),
        });
        return r.status;
      });
      ok('C0: registro de prueba creado (sesión viva)', reg === 200, 'status=' + reg);
      await page.goto(BASE + '/#/app/inicio', { waitUntil: 'load', timeout: 45000 });
      await page.waitForFunction(() => (location.hash || '').startsWith('#/app'), null, { timeout: 20000 });
      await page.waitForFunction(() => typeof ME !== 'undefined' && !!ME, null, { timeout: 20000 });
      ok('C1: con sesión viva la app carga (ME presente, sin rebote)', true);

      // Con sesión VIVA, ttStatusOnce resuelve el estado real (no rebota).
      const ttLive = await page.evaluate(async () => {
        __ttStatusP = null;
        const st = await ttStatusOnce();
        return { hash: location.hash || '', isObj: !!st && typeof st === 'object', connected: st && st.connected };
      });
      ok('C2: logueado, /api/tiktok/status responde y no rebota', ttLive.isObj && ttLive.connected === false && ttLive.hash.startsWith('#/app'), JSON.stringify(ttLive));

      // Quiescencia de red ANTES de purgar: la vista Inicio dispara una
      // ráfaga inicial (con generación de la primera semana) y un request
      // EN VUELO al purgar re-guarda su sesión al terminar (touch de
      // express-session con rolling) y la resucita — verificado con la
      // fila reapareciendo a los <400 ms de borrada. Se espera a que la
      // página no tenga requests pendientes por 1,2 s sostenidos.
      {
        let inflight = 0;
        page.on('request', () => { inflight++; });
        page.on('requestfinished', () => { inflight--; });
        page.on('requestfailed', () => { inflight--; });
        const t0 = Date.now();
        let quietSince = 0;
        while (Date.now() - t0 < 30000) {
          if (inflight <= 0) { if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince >= 1200) break; }
          else quietSince = 0;
          await page.waitForTimeout(150);
        }
      }
      // La sesión muere EN EL STORE (purga server-side: vencimiento o
      // logout en otra pestaña). Se borra la fila de `sessions` por la
      // DB directa — el POST /api/auth/logout no alcanza para el test:
      // con la app viva, un request en vuelo re-guarda la sesión tras el
      // destroy y la resucita (verificado: el llamado daba 200).
      const cookies = await ctx.cookies(BASE);
      const sidCookie = cookies.find((c) => /sid/i.test(c.name)) || cookies[0];
      let sid = '';
      try {
        const v = decodeURIComponent(sidCookie.value || '');
        sid = (v.startsWith('s:') ? v.slice(2) : v).split('.')[0];
      } catch (e) {}
      ok('C2b: cookie de sesión identificada para purgar', !!sid, JSON.stringify(cookies.map((c) => c.name)));
      const purge = spawn(process.execPath, ['-e',
        "const { DatabaseSync } = require('node:sqlite'); const path = require('path');" +
        "const db = new DatabaseSync(path.join(process.env.DATA_DIR, 'posta.db'));" +
        "for (let i = 0; i < 30; i++) { try { const r = db.prepare('DELETE FROM sessions WHERE sid = ?').run(process.argv[1]); console.log('CHANGES=' + Number(r.changes)); process.exit(0); } catch (e) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150); } } process.exit(1);",
        sid], { cwd: __dirname, env: { ...process.env, DATA_DIR: srv.dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
      let purgeOut = '';
      purge.stdout.on('data', (d) => { purgeOut += d; });
      const purgeCode = await new Promise((r) => purge.on('close', r));
      const purgeChanges = /CHANGES=(\d+)/.test(purgeOut) ? Number(RegExp.$1) : -1;
      ok('C2c: fila de sesión purgada del store (DELETE con efecto)', purgeCode === 0 && purgeChanges >= 1, 'exit=' + purgeCode + ' ' + purgeOut.trim());
      const dead = await page.evaluate(async () => {
        let status = null;
        try { await api.get('/api/tiktok/status'); status = 200; }
        catch (e) { status = e && e.status; }
        // Lectura sincrónica apenas el wrapper lanzó: ya seteó hash y return-to.
        return { status, hash: location.hash || '', ret: sessionStorage.getItem('posta_return_to') || '' };
      });
      ok('C3: el 401 con sesión muerta llega como 401', dead.status === 401, JSON.stringify(dead));
      ok('C4: rebota a #/login (comportamiento bueno intacto)', dead.hash === '#/login', JSON.stringify(dead));
      ok('C5: posta_return_to guardó la ruta de la app', dead.ret.startsWith('#/app'), JSON.stringify(dead));
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => location.hash || '');
      ok('C6: tras el render, sigue en #/login', after === '#/login', 'hash=' + after);
      await ctx.close();
    }
  } finally {
    await browser.close();
    if (srv) { try { srv.child.kill('SIGKILL'); } catch (e) {} }
  }
  console.log(`\n${pass} ok / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
