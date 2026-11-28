'use strict';

// =====================================================================
// LOTE CONSERJE-NAV — suite del lote
// =====================================================================
// Dos pedidos del dueño (27/11, con captura de la piel completa en el
// teléfono): (1) el botón/marca «Posty · CONSERJE» lleva al inicio de
// la NUEVA pantalla — si la consola está en la piel completa
// (ver-escritorio), la marca también sale de esa piel; (2) tocar un
// cliente abre SU FICHA (su información), nunca la vista «Su
// producto» — en el teléfono ya era así (data-mbiz) y en gotoFicha
// también; el toque del roster de escritorio era la vía que faltaba,
// y «Ir al próximo con problemas» comparte el destino.
//   A · Estática de las tres puntadas.
//   B · Boot real + Chromium: el toque abre la ficha con la pestaña
//       «Su ficha» activa; la marca, con la piel completa puesta,
//       vuelve al inicio de la bandeja sin la piel.
// Uso: node test-lote-conserje-nav.js — sale 0 si todo pasa.
// =====================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }

const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

// ---------------------------------------------------------------------
seccion('A · estática de la navegación');
const jsSrc = read('public/conserje.js');
const htmlSrc = read('public/conserje.html');
t('A1 el toque del roster abre la ficha (centroVista semana, sin «producto»)', jsSrc.includes("centroVista = 'semana'; highlightPostId = null; cargarCliente(selUser); irAlCentro(); return; }") && !jsSrc.includes("centroVista = 'producto'"));
t('A2 «Ir al próximo con problemas» también aterriza en la ficha', jsSrc.includes("selUser = sigP.user_id; centroVista = 'semana';"));
t('A3 la marca sale de la piel completa al ir al inicio', jsSrc.includes("document.body.classList.remove('ver-escritorio');"));
t('A4 el pie del riel dice «su ficha», como el toque nuevo', htmlSrc.includes('ves <b>su</b> ficha'));
t('A5 sello conserje.js?v=28', htmlSrc.includes('/conserje.js?v=28'));

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
require(process.argv[3] + '/guest-trial').ensureSchema(db);
const now = Date.now(); const DIA = 86400000;
function usuario(id, email, planStatus, e) {
  db.prepare("INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, created_at) VALUES (?, ?, 'x', 'posty', ?, 0, 0, 0, ?, ?, '2026-09-01 10:00:00')")
    .run(id, email, planStatus, e.started != null ? e.started : null, e.ends != null ? e.ends : null);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)')
    .run(id, e.nombre || '', e.ig || '', '');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(12, 'dueno@posty.test', 'trial', { nombre: 'Posty', ig: 'posty.communitymanager', started: now - 40 * DIA, ends: now - 37 * DIA });
usuario(301, 'pago@real.test', 'active', { nombre: 'Pago Real', ig: 'pagoreal' });
console.log('seed ok');
`;

function puertoLibre(p) {
  try { execFileSync('ss', ['-ltn', 'sport = :' + p], { encoding: 'utf8' }); } catch (e) { return false; }
  const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
  return !out.split('\n').some((l) => l.includes(':' + p + ' '));
}

(async () => {
  seccion('B · boot real + Chromium');
  let PORT = 0;
  for (let p = 34711; p < 34730; p++) if (puertoLibre(p)) { PORT = p; break; }
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-nav-boot-'));
  const seedFile = path.join(os.tmpdir(), 'conserje-nav-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });
  const TOKEN = 'boot-test-token-nav';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverPid = child.pid;
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += String(d); });
  child.stderr.on('data', (d) => { serverLog += String(d); });
  const base = 'http://127.0.0.1:' + PORT;
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('B1 el servidor levanta en el puerto libre', up, serverLog.slice(-200));
    const html = await (await fetch(base + '/conserje?token=' + TOKEN)).text();
    t('B2 /conserje sirve con el sello v=28', html.includes('/conserje.js?v=28'));

    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); break; } catch (e) { /* siguiente */ }
    }
    t('B3 playwright-core disponible', !!pw);
    if (pw) {
      let exe = '';
      const basePw = path.join(os.homedir(), '.cache/ms-playwright');
      for (const dir of fs.readdirSync(basePw)) {
        const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
        if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
      }
      const browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await page.goto(base + '/conserje?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.client-row[data-sel="301"]', { timeout: 20000 });

      // El toque en el cliente → su ficha (información), no «Su producto».
      await page.click('.client-row[data-sel="301"]');
      await page.waitForSelector('#centro .mkbizname', { timeout: 15000 });
      await page.waitForTimeout(400);
      const tabOn = await page.evaluate(() => { const el = document.querySelector('#centro .mktab.on'); return el ? el.textContent.trim() : ''; });
      const biz = await page.evaluate(() => { const el = document.querySelector('#centro .mkbizname'); return el ? el.textContent : ''; });
      t('B4 tocar el cliente abre su ficha con la pestaña «Su ficha» activa', tabOn === 'Su ficha' && /Pago Real/.test(biz), 'tab=' + tabOn + ' biz=' + biz);

      // La marca, con la piel completa puesta → inicio de la bandeja, sin piel.
      await page.evaluate(() => { document.body.classList.add('ver-escritorio'); });
      await page.evaluate(() => {
        const els = document.querySelectorAll('.mkbrand');
        for (const el of els) { if (el.offsetParent !== null || el.getClientRects().length) { el.click(); return; } }
        els[0] && els[0].click();
      });
      await page.waitForTimeout(500);
      const sinPiel = await page.evaluate(() => !document.body.classList.contains('ver-escritorio'));
      const centroTxt = await page.textContent('#centro');
      t('B5 la marca vuelve al inicio (producción de mañana) y sale de la piel completa', sinPiel && centroTxt.includes('Producción de mañana'), 'sinPiel=' + sinPiel);
      await browser.close();
    }
  } finally {
    try { process.kill(serverPid, 'SIGTERM'); } catch (e) { /* ya murió */ }
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN', e); process.exit(1); });
