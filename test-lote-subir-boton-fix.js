// =====================================================================
// LOTE SUBIR-BOTON-FIX — suite propia (boot real + Chromium)
// El botón central «Subir» de la barra inferior (shell bb) quedó no
// clickeable y de otro tamaño tras BARRA-VIVA (v1221): su caja medía
// 27px contra 49px de Inicio/Ads. Causa: .bb-bar alinea a flex-end y
// la palabra sola (19.4px + padding) no llena la fila. El arreglo:
// .bb-tab-subir gana align-self:stretch — su caja llena el alto de la
// fila, la palabra queda centrada y toda la columna es botón.
// Base: HEAD 5bb24579 (v1221 · BARRA-VIVA).
//
//   A · Estática — la regla del arreglo, la palabra en los dos
//       shells, la ruta del botón intacta.
//   B · HTTP contra el boot real — levanta y las sesiones entran.
//   C · Chromium 390px táctil — geometría de los tres botones en los
//       dos shells, la zona muerta cerrada (elementFromPoint), y los
//       toques reales navegando (Subir, Inicio, Ads).
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
function buscarPuerto() {
  for (let p = 36100; p < 36300; p++) {
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

// ---------------------------------------------------------------------
seccion('A · Estática');
const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A0 node --check public/app.js', true); }
catch (e) { t('A0 node --check public/app.js', false, String(e.message).slice(0, 200)); }
t('A1 la regla del arreglo está: .bb-tab-subir con align-self:stretch',
  css.includes('.bb-tab-subir{justify-content:center;align-self:stretch}'));
t('A2 la palabra «Subir» sigue en los dos shells (bb y mz) y sin glifo en el markup central',
  appJs.includes('bb-tab-subir-word') && appJs.includes('mz-tab-subir-word')
  && appJs.includes("tabBtn('subir', '#/app/subir'") && appJs.includes("t('subir', 'subir'"));
t('A3 la barra no se tocó: .bb-bar sigue align-items:flex-end (el arreglo vive en el botón)',
  /\.bb-bar\{[^}]*align-items:flex-end/.test(css));
t('A4 el tamaño de la palabra no cambió (15.5px/800 en bb · 15px/800 en mz)',
  css.includes('.bb-tab-subir-word{font-size:15.5px;font-weight:800')
  && css.includes('.mz-tab-subir-word{font-size:15px;font-weight:800'));

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) { /* ya existe */ }
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
function usuario(id, email, shell, nombre, ig) {
  db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
    VALUES (?, ?, ?, 'posty', 'active', 0, 0, 0, NULL, NULL, ?, 'es', 1, '2026-09-01 10:00:00')\`).run(id, email, hash, shell);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)').run(id, nombre, ig, 'café');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(12, 'dueno@botonfix.test', 1, 'Posty', 'posty.communitymanager');
usuario(504, 'clasico@botonfix.test', 0, 'Café Clásico', 'cafeclasico');
console.log('semilla ok');
`;

async function main() {
  seccion('B · Boot real + HTTP');
  const PORT = buscarPuerto();
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'botonfix-boot-'));
  const seedFile = path.join(os.tmpdir(), 'botonfix-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-botonfix', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverPid = child.pid;
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += String(d); });
  child.stderr.on('data', (d) => { serverLog += String(d); });
  const base = 'http://127.0.0.1:' + PORT;

  async function login(email) {
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ClaveQA123' }),
    });
    const setCookie = r.headers.get('set-cookie') || '';
    const m = setCookie.match(/^([^=]+)=([^;]+)/);
    return m ? { name: m[1], value: m[2] } : null;
  }

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('B1 el servidor levanta en el puerto libre', up, serverLog.slice(-300));
    const sesCasa = await login('dueno@botonfix.test');
    const sesClasico = await login('clasico@botonfix.test');
    t('B2 login de la casa (shell bb) y del clásico (shell mz)', !!(sesCasa && sesClasico));

    // ---------------- C · Chromium ----------------
    seccion('C · Chromium 390px táctil');
    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); if (pw) break; } catch (e) { /* siguiente */ }
    }
    t('C0 playwright-core disponible', !!pw);
    if (pw && sesCasa && sesClasico) {
      const basePw = path.join(os.homedir(), '.cache/ms-playwright');
      let exe = null;
      for (const dir of fs.readdirSync(basePw)) {
        const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
        if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
      }
      const browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
      const mkCtx = async (ses) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        await ctx.addCookies([{ name: ses.name, value: ses.value, url: base }]);
        return ctx;
      };
      // La barra se espera ESTABLE (el mismo nodo en dos muestras
      // seguidas): el primer pintado del shell se reemplaza al llegar
      // los datos (familia repintado en caliente, preexistente) y un
      // toque sobre el nodo saliente se pierde — eso no es este lote.
      const esperarBarraEstable = async (page, sel) => {
        let estables = 0;
        for (let i = 0; i < 40; i++) {
          const mismo = await page.evaluate((s) => {
            const el = document.querySelector(s);
            if (!el) return false;
            if (window.__barraNodo && window.__barraNodo === el) return true;
            window.__barraNodo = el;
            return false;
          }, sel).catch(() => false);
          estables = mismo ? estables + 1 : 0;
          if (estables >= 3) return true;
          await page.waitForTimeout(400);
        }
        return false;
      };
      const medir = async (page, barSel, tabSel) => page.evaluate(({ ts }) => {
        const btns = [...document.querySelectorAll(ts)];
        const datos = btns.map((b) => {
          const r = b.getBoundingClientRect();
          return { cls: b.className, txt: b.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height, svg: !!b.querySelector('svg') };
        });
        const subir = btns.find((b) => /tab-subir/.test(b.className));
        const sr = subir.getBoundingClientRect();
        const cx = sr.left + sr.width / 2;
        const enCentro = document.elementFromPoint(cx, sr.top + sr.height / 2);
        const inicio = btns.find((b) => !/tab-subir/.test(b.className));
        const ir = inicio.getBoundingClientRect();
        const enTecho = document.elementFromPoint(cx, ir.top + 6);
        return {
          datos,
          centroEsBoton: enCentro === subir || subir.contains(enCentro),
          techoEsBoton: enTecho === subir || subir.contains(enTecho),
          cx: Math.round(cx), techoY: Math.round(ir.top + 6), centroY: Math.round(sr.top + sr.height / 2),
        };
      }, { bs: barSel, ts: tabSel });

      // — shell bb (la casa, el del defecto) —
      const ctxB = await mkCtx(sesCasa);
      const pB = await ctxB.newPage();
      await pB.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pB.waitForSelector('.bb-bar .bb-tab', { timeout: 20000 });
      await esperarBarraEstable(pB, '.bb-tab-subir');
      await pB.waitForTimeout(600);
      const mB = await medir(pB, '.bb-bar', '.bb-bar .bb-tab');
      const hs = mB.datos.map((d) => Math.round(d.h));
      const ws = mB.datos.map((d) => Math.round(d.w));
      t('C1 BB: los tres botones miden el mismo alto (uniformes ±1px)',
        Math.max(...hs) - Math.min(...hs) <= 1, 'altos=' + hs.join('/') + ' anchos=' + ws.join('/'));
      t('C2 BB: Subir mide como Inicio (' + hs[0] + 'px) y supera el mínimo táctil de 44px',
        Math.round(mB.datos[1].h) === hs[0] && hs[1] >= 44, 'subir=' + hs[1] + 'px');
      t('C3 BB: sin zona muerta — el centro y el techo de la columna de Subir son el botón',
        mB.centroEsBoton && mB.techoEsBoton, JSON.stringify({ centro: mB.centroEsBoton, techo: mB.techoEsBoton }));
      t('C4 BB: la palabra «Subir» sin glifo; Inicio y Ads conservan su ícono',
        mB.datos[1].txt === 'Subir' && mB.datos[1].svg === false && mB.datos[0].svg && mB.datos[2].svg,
        JSON.stringify(mB.datos.map((d) => d.txt + ':' + d.svg)));
      await pB.touchscreen.tap(mB.cx, mB.centroY);
      await pB.waitForTimeout(1600);
      t('C5 BB: toque real en el centro de Subir → navega a Subir',
        await pB.evaluate(() => location.hash) === '#/app/subir',
        await pB.evaluate(() => location.hash));
      // volver a Inicio y tocar donde estaba la zona muerta
      const geoAds = await pB.evaluate(() => {
        const ini = [...document.querySelectorAll('.bb-bar .bb-tab')].find((b) => !/tab-subir/.test(b.className));
        const r = ini.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      await pB.touchscreen.tap(geoAds.x, geoAds.y);
      await pB.waitForTimeout(1600);
      t('C6 BB: toque en Inicio vuelve a Inicio',
        await pB.evaluate(() => location.hash) === '#/app/inicio',
        await pB.evaluate(() => location.hash));
      const mB2 = await medir(pB, '.bb-bar', '.bb-bar .bb-tab');
      await pB.touchscreen.tap(mB2.cx, mB2.techoY);
      await pB.waitForTimeout(1600);
      t('C7 BB: toque en el techo de la columna de Subir (la ex zona muerta) → navega a Subir',
        await pB.evaluate(() => location.hash) === '#/app/subir',
        await pB.evaluate(() => location.hash));
      const geoAds2 = await pB.evaluate(() => {
        const ads = [...document.querySelectorAll('.bb-bar .bb-tab')][2];
        const r = ads.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      await pB.touchscreen.tap(geoAds2.x, geoAds2.y);
      await pB.waitForTimeout(1600);
      t('C8 BB: toque en Ads navega a Ads (los vecinos intactos)',
        await pB.evaluate(() => location.hash) === '#/app/ads',
        await pB.evaluate(() => location.hash));
      await ctxB.close();

      // — shell mz (clásico): ya era uniforme; se verifica que sigue igual —
      const ctxM = await mkCtx(sesClasico);
      const pM = await ctxM.newPage();
      await pM.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pM.waitForSelector('.mz-tabs .mz-tab', { timeout: 20000 });
      await esperarBarraEstable(pM, '.mz-tab-subir');
      await pM.waitForTimeout(600);
      const mM = await medir(pM, '.mz-tabs', '.mz-tabs .mz-tab');
      const hsM = mM.datos.map((d) => Math.round(d.h));
      t('C9 MZ: los tres botones uniformes (±1px), como ya estaban',
        Math.max(...hsM) - Math.min(...hsM) <= 1, 'altos=' + hsM.join('/'));
      await pM.touchscreen.tap(mM.cx, mM.centroY);
      await pM.waitForTimeout(1600);
      t('C10 MZ: toque real en Subir → navega a Subir',
        await pM.evaluate(() => location.hash) === '#/app/subir',
        await pM.evaluate(() => location.hash));
      await ctxM.close();
      await browser.close();
    }
  } finally {
    try { process.kill(serverPid, 'SIGTERM'); } catch (e) { /* ya murió */ }
    await new Promise((res) => setTimeout(res, 700));
    t('B3 el puerto queda libre al cerrar (boot muerto por su PID exacto)', puertoLibre(PORT));
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
