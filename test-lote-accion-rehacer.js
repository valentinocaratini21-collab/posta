'use strict';

// =====================================================================
// LOTE CONSERJE-ACCION-REHACER — suite del lote (censo-conserje-3 §5.4)
// =====================================================================
// La tarjeta del posteo FALLIDO gana la acción «Que se rehaga»: una
// orden de rehacer ATADA al post_id que entra por la fuente vigente
// (la puerta vista/producir extendida con el posteo de origen → el
// caso prueba_linea_mano de abrirOrdenRehacer, con post_id cargado y
// dedup POR POSTEO «vista-rehacer:<id>»). Nada se regenera solo: la
// orden despierta a la línea a mano y aparece en la cola de
// producción; la tarjeta deja de pedir la acción cuando la orden ya
// existe; duplicar el toque no duplica la orden; un posteo ya
// resuelto (no 'failed') no admite la acción (fósil).
//   A · Estática de las puntadas (vista, ruta, cliente, sello).
//   B · Boot real por HTTP: tarjeta → orden registrada con su
//       post_id → cola de producción → reflejo en la tarjeta →
//       duplicado sin duplicar → segundo fallido con su propia orden
//       → fósil y posteo ajeno rechazados → producir clásico intacto.
//   C · Boot + Chromium: el botón de la tarjeta, de verdad, y su
//       reflejo tras el toque.
//   D · La base, tras matar el servidor por su PID exacto: la fila
//       del caso y el registro del equipo.
// Uso: node test-lote-accion-rehacer.js — sale 0 si todo pasa.
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
seccion('A · estática de las puntadas');
const vistaSrc = read('conserje-vista.js');
const serverSrc = read('server.js');
const jsSrc = read('public/conserje.js');
const htmlSrc = read('public/conserje.html');
t('A1 la vista exporta abrirOrdenRehacer con dedup por posteo', vistaSrc.includes('function abrirOrdenRehacer') && vistaSrc.includes("'vista-rehacer:' + pid") && vistaSrc.includes('abrirOrdenRehacer,'));
t('A2 la tarjeta post_fallido lleva el reflejo de la orden', vistaSrc.includes('rehacer_pedida: !!ordenesRehacer[p.id]'));
t('A3 la puerta producir deriva a rehacer cuando viene post_id', serverSrc.includes('conserjeVista.abrirOrdenRehacer(db'));
t('A4 el cliente pinta el botón y el estado registrado', jsSrc.includes('data-act="fallido-rehacer"') && jsSrc.includes('Orden de rehacer registrada') && jsSrc.includes('d.rehacer_pedida'));
t('A5 el handler manda el post_id por la puerta de producir', jsSrc.includes("act === 'fallido-rehacer'") && jsSrc.includes('post_id: Number(b.getAttribute(\'data-pid\'))'));
t('A6 sello conserje.js?v=29', htmlSrc.includes('/conserje.js?v=29'));

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
const ahora = new Date().toISOString();
function posteo(id, status, error) {
  db.prepare("INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, error, published_at) VALUES (?, 301, '/media/seed.jpg', 'Pieza de siembra', ?, ?, ?, ?)")
    .run(id, ahora, status, error || '', status === 'published' ? ahora : null);
}
posteo(9001, 'failed', 'Error de Meta (siembra): el token de la pagina vencio');
posteo(9002, 'failed', 'Error de Meta (siembra): la foto fue rechazada');
posteo(9003, 'published', '');
posteo(9004, 'failed', 'Error de Meta (siembra): timeout del publicador');
console.log('seed ok');
`;

const CHECK_DB = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
const out = {};
out.caso9001 = db.prepare("SELECT id, user_id, tipo, post_id, estado, dedup_key, titulo FROM support_cases WHERE dedup_key = 'vista-rehacer:9001'").all();
out.n9001 = db.prepare("SELECT COUNT(*) AS c FROM support_cases WHERE dedup_key = 'vista-rehacer:9001'").get().c;
out.n9002 = db.prepare("SELECT COUNT(*) AS c FROM support_cases WHERE dedup_key = 'vista-rehacer:9002'").get().c;
out.n9004 = db.prepare("SELECT COUNT(*) AS c FROM support_cases WHERE dedup_key = 'vista-rehacer:9004'").get().c;
out.log9001 = db.prepare("SELECT COUNT(*) AS c FROM support_team_log WHERE action = 'rehacer_pedido' AND post_id = 9001").get().c;
console.log(JSON.stringify(out));
`;

function puertoLibre(p) {
  try {
    const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    return !out.split('\n').some((l) => l.includes(':' + p + ' '));
  } catch (e) { return false; }
}

(async () => {
  seccion('B · boot real por HTTP');
  let PORT = 0;
  for (let p = 34731; p < 34750; p++) if (puertoLibre(p)) { PORT = p; break; }
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'accion-rehacer-boot-'));
  const seedFile = path.join(os.tmpdir(), 'accion-rehacer-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });
  const TOKEN = 'boot-test-token-rehacer';
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
  const api = async (ruta, body) => {
    const r = await fetch(base + ruta + '?token=' + TOKEN, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : {});
    let j = null; try { j = await r.json(); } catch (e) { /* sin json */ }
    return { status: r.status, j };
  };
  let casoId = 0;
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('B1 el servidor levanta en el puerto libre', up, serverLog.slice(-200));

    const v1 = await api('/api/admin/conserje/vista');
    const card1 = (v1.j.mano || []).find((d) => d.tipo === 'post_fallido' && d.post_id === 9001);
    t('B2 la tarjeta del fallido nace sin orden pedida', !!card1 && card1.rehacer_pedida === false, JSON.stringify(card1 || null).slice(0, 200));

    const r1 = await api('/api/admin/conserje/vista/producir', { user_id: 301, post_id: 9001, detalle: 'Que se rehaga este posteo (suite).' });
    casoId = r1.j && r1.j.caso ? r1.j.caso.id : 0;
    t('B3 la orden se abre por la puerta de producir con post_id', r1.status === 200 && r1.j.ok === true && casoId > 0 && r1.j.duplicado === false, JSON.stringify(r1.j).slice(0, 200));

    const v2 = await api('/api/admin/conserje/vista');
    const card2 = (v2.j.mano || []).find((d) => d.tipo === 'post_fallido' && d.post_id === 9001);
    t('B4 la tarjeta refleja la orden (deja de pedir la acción)', !!card2 && card2.rehacer_pedida === true && card2.rehacer_caso_id === casoId, JSON.stringify(card2 || null).slice(0, 200));
    const enCola = (v2.j.cola || []).some((c) => c.case_id === casoId);
    t('B5 la orden se ve en la cola de producción', enCola, JSON.stringify((v2.j.cola || []).map((c) => c.case_id)));

    const r2 = await api('/api/admin/conserje/vista/producir', { user_id: 301, post_id: 9001 });
    t('B6 duplicar el toque no duplica la orden', r2.status === 200 && r2.j.ok === true && r2.j.duplicado === true && r2.j.caso && r2.j.caso.id === casoId, JSON.stringify(r2.j).slice(0, 200));

    const r3 = await api('/api/admin/conserje/vista/producir', { user_id: 301, post_id: 9002 });
    t('B7 otro fallido de la misma cuenta tiene SU orden (dedup por posteo)', r3.status === 200 && r3.j.ok === true && r3.j.duplicado === false && r3.j.caso && r3.j.caso.id !== casoId, JSON.stringify(r3.j).slice(0, 200));

    const r4 = await api('/api/admin/conserje/vista/producir', { user_id: 301, post_id: 9003 });
    t('B8 el posteo ya resuelto no admite la acción (fósil)', r4.status === 400 && r4.j && r4.j.error === 'posteo_no_fallido', JSON.stringify(r4.j).slice(0, 200));

    const r5 = await api('/api/admin/conserje/vista/producir', { user_id: 12, post_id: 9001 });
    t('B9 el posteo de otra cuenta no admite la orden', r5.status === 400 && r5.j && r5.j.error === 'posteo_ajeno', JSON.stringify(r5.j).slice(0, 200));

    const r6 = await api('/api/admin/conserje/vista/producir', { user_id: 301, detalle: 'Orden clásica de la suite.' });
    t('B10 sin post_id, la orden de producción de siempre sigue andando', r6.status === 200 && r6.j.ok === true && !!r6.j.caso, JSON.stringify(r6.j).slice(0, 200));

    const html = await (await fetch(base + '/conserje?token=' + TOKEN)).text();
    t('B11 /conserje sirve con el sello v=29', html.includes('/conserje.js?v=29'));

    // ---------------------------------------------------------------
    seccion('C · Chromium: el botón en la tarjeta');
    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); break; } catch (e) { /* siguiente */ }
    }
    t('C0 playwright-core disponible', !!pw);
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
      const btnSel = '#movil button[data-act="fallido-rehacer"][data-pid="9004"]'; // (ajuste del liberador) desde CONSERJE-ENTRADA la piel que manda a 1280px es la bandeja: el botón visible es el de #movil (el de la consola vieja queda en el DOM oculto).
      await page.waitForSelector(btnSel, { timeout: 20000 });
      t('C1 la tarjeta del fallido 9004 ofrece «Que se rehaga»', true);
      await page.click(btnSel);
      // La tarjeta (no el toast): el article del posteo 9004 pasa a
      // mostrar el registro, y el botón desaparece de TODAS las
      // pieles que pintan la tarjeta.
      await page.waitForFunction(() => [].some.call(document.querySelectorAll('article.decision'),
        (a) => a.innerText.includes('#9004') && a.innerText.includes('Orden de rehacer registrada')), null, { timeout: 20000 });
      t('C2 tras el toque, la tarjeta muestra la orden registrada', true);
      await page.waitForFunction(() => !document.querySelector('button[data-act="fallido-rehacer"][data-pid="9004"]'), null, { timeout: 20000 });
      t('C3 el botón de ese posteo ya no se ofrece', true);
      await browser.close();
    }
  } finally {
    try { process.kill(serverPid, 'SIGTERM'); } catch (e) { /* ya murió */ }
    await new Promise((res) => setTimeout(res, 800));
    let vivo = true;
    try { process.kill(serverPid, 0); } catch (e) { vivo = false; }
    t('B12 el servidor murió por su PID exacto', !vivo);
  }

  // ---------------------------------------------------------------
  seccion('D · la base, con el servidor apagado');
  const checkFile = path.join(os.tmpdir(), 'accion-rehacer-check-' + process.pid + '.js');
  fs.writeFileSync(checkFile, CHECK_DB);
  const out = JSON.parse(execFileSync(process.execPath, [checkFile, tmpD, ROOT], { encoding: 'utf8' }).trim().split('\n').pop());
  const c1 = out.caso9001 && out.caso9001[0];
  t('D1 el caso quedó registrado con su post_id', !!c1 && c1.post_id === 9001 && c1.user_id === 301, JSON.stringify(c1 || null));
  t('D2 el caso es de la cola de producción y quedó abierto', !!c1 && c1.tipo === 'prueba_linea_mano' && c1.estado === 'abierto', JSON.stringify(c1 || null));
  t('D3 un solo caso por posteo (9001, 9002 y el de Chromium 9004)', out.n9001 === 1 && out.n9002 === 1 && out.n9004 === 1, JSON.stringify({ n9001: out.n9001, n9002: out.n9002, n9004: out.n9004 }));
  t('D4 el registro del equipo anota el rehacer una sola vez', out.log9001 === 1, 'log9001=' + out.log9001);

  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN', e); console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); });
