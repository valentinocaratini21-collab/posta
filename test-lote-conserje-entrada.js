'use strict';

// =====================================================================
// LOTE CONSERJE-ENTRADA — suite del lote
// =====================================================================
// Palabra del dueño (27/11 23:07, con captura): «me lleva al conserje
// viejo ahora el conserje. me tiene que llevar al otro!» — entrar al
// conserje aterriza en la NUEVA pantalla (la bandeja) en TODOS los
// anchos; la consola de escritorio queda como piel optativa detrás
// de Más → «Consola completa» (ver-escritorio), con vuelta por el
// botón flotante o por la marca.
//   A · Estática de la inversión de pieles.
//   B · Boot real + Chromium a 1280px: la bandeja manda al entrar;
//       «Consola completa» muestra la vieja; «Volver a la bandeja»
//       regresa. Y a 390px la bandeja sigue mandando.
// Uso: node test-lote-conserje-entrada.js — sale 0 si todo pasa.
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
seccion('A · estática de la entrada');
const htmlSrc = read('public/conserje.html');
t('A1 la capa de la bandeja gobierna todos los anchos (media de siempre)', htmlSrc.includes('@media (max-width:10000px){'));
t('A2 la piel completa sigue detrás de ver-escritorio', htmlSrc.includes('body.ver-escritorio .app{display:block}') && htmlSrc.includes('body.ver-escritorio #movil{display:none}'));
t('A3 en pantalla ancha la bandeja es columna centrada sobre el marino', htmlSrc.includes('body:not(.ver-escritorio) #movil{max-width:520px'));
t('A4 la vuelta «Volver a la bandeja» existe', htmlSrc.includes('id="volverBandeja"'));

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
  const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
  return !out.split('\n').some((l) => l.includes(':' + p + ' '));
}

(async () => {
  seccion('B · boot real + Chromium');
  let PORT = 0;
  for (let p = 34731; p < 34750; p++) if (puertoLibre(p)) { PORT = p; break; }
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-entrada-boot-'));
  const seedFile = path.join(os.tmpdir(), 'conserje-entrada-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });
  const TOKEN = 'boot-test-token-entrada';
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

    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); break; } catch (e) { /* siguiente */ }
    }
    t('B2 playwright-core disponible', !!pw);
    if (pw) {
      let exe = '';
      const basePw = path.join(os.homedir(), '.cache/ms-playwright');
      for (const dir of fs.readdirSync(basePw)) {
        const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
        if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
      }
      const browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
      const disp = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'sin elemento'; }, sel);

      // Escritorio (1280px): al entrar manda la bandeja, no la vieja.
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await page.goto(base + '/conserje?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#movil .m-nav', { timeout: 20000 });
      await page.waitForTimeout(600);
      t('B3 a 1280px entra la bandeja (móvil visible, consola vieja oculta)',
        (await disp(page, '#movil')) === 'flex' && (await disp(page, '.app')) === 'none',
        'movil=' + (await disp(page, '#movil')) + ' app=' + (await disp(page, '.app')));
      const anchoColumna = await page.evaluate(() => Math.round(document.querySelector('#movil').getBoundingClientRect().width));
      t('B4 la bandeja se presenta como columna centrada (≤520px)', anchoColumna > 300 && anchoColumna <= 520, 'ancho=' + anchoColumna);

      // Más → Consola completa: la vieja aparece; Volver: la bandeja.
      await page.click('#movil [data-mtab="mas"]');
      await page.waitForSelector('[data-mact="escritorio"]', { timeout: 10000 });
      await page.click('[data-mact="escritorio"]');
      await page.waitForTimeout(400);
      t('B5 «Consola completa» muestra la consola vieja y esconde la bandeja',
        (await disp(page, '.app')) !== 'none' && (await disp(page, '#movil')) === 'none' && (await disp(page, '#volverBandeja')) === 'block');
      await page.click('#volverBandeja');
      await page.waitForTimeout(400);
      t('B6 «Volver a la bandeja» regresa a la pantalla nueva',
        (await disp(page, '#movil')) === 'flex' && (await disp(page, '.app')) === 'none');

      // Teléfono (390px): la bandeja manda como siempre.
      const page2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      await page2.goto(base + '/conserje?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
      await page2.waitForSelector('#movil .m-nav', { timeout: 20000 });
      await page2.waitForTimeout(400);
      t('B7 a 390px la bandeja sigue mandando', (await disp(page2, '#movil')) === 'flex' && (await disp(page2, '.app')) === 'none');
      await browser.close();
    }
  } finally {
    try { process.kill(serverPid, 'SIGTERM'); } catch (e) { /* ya murió */ }
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN', e); process.exit(1); });
