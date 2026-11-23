'use strict';

// =====================================================================
// LOTE BOTONES-CONSERJE — suite del lote
// =====================================================================
// El dueño reportó (22/11): «los botones del conserje la mayoría no
// andan, y no te hacen lo que deberían hacer». El censo nominal está en
// equipo-posty/censo-botones-conserje.md (50 elementos, 5 fallas). Esta
// suite ejercita UNO POR UNO los botones del censo en Chromium contra
// el árbol donde vive, cada uno con su resultado esperado:
//   A · Estática + gate M78: los 5 arreglos existen; todo data-act
//       renderizado tiene rama en el handler; ninguna llamada a una
//       función inexistente en el bundle servido.
//   B · Módulo: la ficha del cliente del posteo fallido INCLUYE el
//       posteo fallido (F5).
//   C · Boot real + puerta: token malo → la puerta avisa (F4); token
//       bueno por botón y por Enter → entra.
//   D · Chromium escritorio: shell, mañana, ficha y las 12 clases de
//       tarjeta, botón por botón (incluye cancelar los diálogos: F1 y
//       los que ya cortaban bien).
//   E · Chromium 390px: la navegación a la ficha la trae a la vista
//       (F3), «Ver el posteo» cae en la semana aunque la ficha haya
//       quedado en «Su feed» (F2), y las acciones caminan con el pulgar.
// Contra la base prístina, las verificaciones de F1–F5 fallan y el
// resto pasa: ese es el control del lote.
// Uso: node test-lote-botones-conserje.js — sale 0 si todo pasa.
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
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------
seccion('A · estática de los arreglos + gate M78');
const jsSrc = read('public/conserje.js');
const htmlSrc = read('public/conserje.html');
const vistaSrc = read('conserje-vista.js');
t('A1 F1: «Pedir arreglo» distingue Cancelar (prompt → null corta, no registra)',
  jsSrc.includes("if (notaA === null) { re(); return; }"));
t('A2 F2: gotoFicha abre siempre en la semana (centroVista reseteado)',
  /function gotoFicha\(uid, postId\) \{\s*highlightPostId[^}]*centroVista = 'semana'/.test(jsSrc));
t('A3 F3: existe el helper único irAlCentro y lo usan data-sel, ver-cliente y gotoFicha',
  jsSrc.includes('function irAlCentro()')
  && (jsSrc.match(/irAlCentro\(\)/g) || []).length >= 4);
t('A4 F4: la puerta tiene su línea de mensaje y cargar la escribe ante 401/403',
  htmlSrc.includes('id="gateMsg"') && jsSrc.includes('gateMsg') && jsSrc.includes('Ese token no abrió la consola'));
t('A5 F5: posteosDe incluye el posteo fallido en la ficha',
  vistaSrc.includes("status IN ('published', 'scheduled', 'draft', 'failed')"));
t('A6 el sello de caché del bundle subió (conserje.js?v=4)',
  htmlSrc.includes('/conserje.js?v=4'));
// Gate M78 — todo data-act renderizado tiene rama en el handler.
const acts = new Set();
for (const m of (jsSrc + htmlSrc).matchAll(/data-act=\\?"([a-z0-9-]+)/g)) acts.add(m[1]);
const ramas = new Set();
for (const m of jsSrc.matchAll(/act === '([a-z0-9-]+)'/g)) ramas.add(m[1]);
const sinRama = [...acts].filter((a) => !ramas.has(a));
t('A7 M78: los ' + acts.size + ' data-act renderizados tienen rama en el handler (' + (acts.size - sinRama.length) + '/' + acts.size + ')',
  sinRama.length === 0, sinRama.join(','));
// Gate M78 — ninguna llamada a función inexistente en el bundle
// (comentarios y strings fuera antes de escanear).
const sinComentarios = jsSrc
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""')
  .replace(/`(?:\\.|[^`\\])*`/g, '``');
const defs = new Set();
for (const m of sinComentarios.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defs.add(m[1]);
for (const m of sinComentarios.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=\s*function/g)) defs.add(m[1]);
const kw = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'else', 'do', 'new']);
const builtins = new Set(['Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'Intl', 'Promise', 'Set', 'Map', 'RegExp', 'Error', 'URLSearchParams', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'encodeURIComponent', 'decodeURIComponent', 'fetch', 'alert', 'prompt', 'confirm']);
const llamadas = new Set();
for (const m of sinComentarios.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) { if (!kw.has(m[1])) llamadas.add(m[1]); }
const fantasmas = [...llamadas].filter((c) => !defs.has(c) && !builtins.has(c));
t('A8 M78: 0 llamadas a funciones inexistentes (' + defs.size + ' definidas en el bundle, ' + llamadas.size + ' nombres llamados)',
  fantasmas.length === 0, fantasmas.join(','));

// ---------------------------------------------------------------------
// La siembra del censo (la misma del documento): la casa con su forma
// real y un cliente por clase de tarjeta.
const SEED = `
process.env.DATA_DIR = process.argv[2];
const ROOT = process.argv[3];
const db = require(ROOT + '/db');
require(ROOT + '/guest-trial').ensureSchema(db);
require(ROOT + '/support-cases').ensureSchema(db);
const now = Date.now(); const DIA = 86400000;
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const mananaKey = fmt.format(new Date(now + DIA));
const utcStr = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const out = {};
function usuario(id, email, planStatus, e) {
  db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, trial_extended_until, created_at)
    VALUES (?, ?, 'x', ?, ?, 0, 0, ?, ?, ?, ?, '2026-09-01 10:00:00')\`)
    .run(id, email, e.plan || 'posty', planStatus, e.stopped ? 1 : 0, e.started != null ? e.started : null, e.ends != null ? e.ends : null, e.extended != null ? e.extended : null);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)').run(id, e.nombre || '', e.ig || '', e.rubro || '');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', ?)").run(id, e.igPage || '');
}
function post(uid, c) {
  const r = db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, error, created_at, cover_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\`)
    .run(uid, c.image || '/media/semilla.jpg', c.caption || 'Caption de prueba', c.status || 'draft', c.media || 'image', c.sched || null, c.error || null, c.created || utcStr(now), c.cover != null ? c.cover : '');
  return Number(r.lastInsertRowid);
}
function chatMsg(uid, text, hilo, postId) {
  const r = db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (?, 'user', ?, ?, ?)").run(uid, text, hilo, postId || 0);
  return Number(r.lastInsertRowid);
}
usuario(12, 'dueno@posty.test', 'trial', { nombre: 'Posty', ig: 'posty.communitymanager', rubro: 'Community manager', started: 1791299328075 - 3 * DIA, ends: 1791299328075, extended: 1801413964874, stopped: 1 });
usuario(301, 'pago@test', 'active', { nombre: 'Pago Café', ig: 'pagocafe' });
out.A1 = post(301, { status: 'scheduled', sched: new Date(mananaKey + 'T19:00:00-05:00').toISOString(), caption: 'El café de mañana' });
out.A2 = post(301, { status: 'draft', caption: 'Borrador de Pago Café' });
out.A5 = post(301, { status: 'draft', caption: 'Borrador para descartar' });
out.A3 = post(301, { status: 'published', sched: utcStr(now - DIA), caption: 'El de ayer, ya salió' });
db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (301, 'payment_failed', '{}', ?)").run(utcStr(now));
out.caso301 = Number(db.prepare(\`INSERT INTO support_cases (user_id, tipo, titulo, detalle, estado, dueno, created_at)
  VALUES (301, 'ayuda', 'Necesita una mano con su menú', 'Pidió ayuda con el menú nuevo y sigue esperando.', 'abierto', 'equipo', ?)\`).run(utcStr(now)).lastInsertRowid);
usuario(302, 'viva@test', 'trial', { nombre: 'Prueba Viva', ig: 'pruebaviva', started: now - DIA, ends: now + 2 * DIA });
out.B1 = post(302, { status: 'draft', caption: 'La propuesta de mañana' });
out.msgVoz302 = chatMsg(302, '¿Me cambiás este posteo por la foto nueva del local?', 'post', out.B1);
out.msgIdea302 = chatMsg(302, 'Tengo una idea: un posteo del local nuevo por dentro', 'general', 0);
db.prepare('INSERT INTO subir_ideas (user_id, message_id, texto) VALUES (302, ?, ?)').run(out.msgIdea302, 'un posteo del local nuevo por dentro');
db.prepare("INSERT INTO subir_pedidos_voz (user_id, asset_id, kind, nota, estado) VALUES (302, 1, 'foto', 'Esta foto es del local nuevo', 'pendiente_revision')").run();
usuario(303, 'falta@test', 'active', { nombre: 'Falta Todo', ig: 'faltatodo' });
db.prepare('UPDATE settings SET ig_token_warning = 1 WHERE user_id = 303').run();
usuario(304, 'impulso@test', 'active', { nombre: 'Impulso Bar', ig: 'impulsobar' });
out.P304 = post(304, { status: 'published', sched: utcStr(now - 2 * DIA), caption: 'El posteo impulsado' });
out.boost304 = Number(db.prepare(\`INSERT INTO ad_boosts (user_id, post_id, budget_cents, fee_cents, status, error, created_at)
  VALUES (304, ?, 2000, 300, 'error', 'Meta rechazó la creación del impulso (error 1815105).', ?)\`).run(out.P304, utcStr(now)).lastInsertRowid);
usuario(305, 'portada@test', 'active', { nombre: 'Portada Café', ig: 'portadacafe' });
out.V305 = post(305, { status: 'published', media: 'video', image: '/media/video.mp4', sched: utcStr(now - DIA), caption: 'El video sin portada', cover: '' });
usuario(307, 'fallo@test', 'active', { nombre: 'Fallo Café', ig: 'fallocafe' });
out.F307 = post(307, { status: 'failed', error: 'Meta rechazó la publicación (190)', sched: utcStr(now), created: utcStr(now) });
usuario(308, 'termina@test', 'trial', { nombre: 'Termina Hoy', ig: 'terminahoy', started: now - 2 * DIA, ends: now + 3 * 3600000 });
usuario(309, 'cola@test', 'trial', { nombre: 'Cola Café', ig: 'colacafe', started: now - DIA, ends: now + 2 * DIA });
db.prepare(\`INSERT INTO support_cases (user_id, tipo, titulo, detalle, estado, dueno, created_at)
  VALUES (309, 'prueba_linea_mano', 'Prueba a mano de Cola Café', 'Producir su semana a mano.', 'abierto', 'equipo', ?)\`).run(utcStr(now));
usuario(310, 'descarte@test', 'trial', { nombre: 'Descarte Café', ig: 'descartecafe', started: now - DIA, ends: now + 2 * DIA });
out.D310 = post(310, { status: 'draft', caption: 'Propuesta de Descarte Café' });
out.msgVoz310 = chatMsg(310, 'Este pedido se descarta en la suite', 'post', out.D310);
usuario(311, 'resuelto@test', 'trial', { nombre: 'Resuelto Café', ig: 'resueltocafe', started: now - DIA, ends: now + 2 * DIA });
out.msgVoz311 = chatMsg(311, 'Pedido que se cierra a mano en la suite', 'general', 0);
usuario(312, 'sale@test', 'trial', { nombre: 'Sale Café', ig: 'salecafe', started: now - DIA, ends: now + 2 * DIA });
out.S312 = post(312, { status: 'draft', caption: 'Propuesta de Sale Café' });
usuario(313, 'nosale@test', 'trial', { nombre: 'NoSale Café', ig: 'nosalecafe', started: now - DIA, ends: now + 2 * DIA });
out.N313 = post(313, { status: 'draft', caption: 'Propuesta de NoSale Café' });
usuario(314, 'arreglar@test', 'trial', { nombre: 'Arreglar Café', ig: 'arreglarcafe', started: now - DIA, ends: now + 2 * DIA });
out.R314 = post(314, { status: 'draft', caption: 'Propuesta de Arreglar Café' });
console.log(JSON.stringify(out));
`;

// ---------------------------------------------------------------------
seccion('B · módulo — la ficha incluye el posteo fallido (F5)');
{
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'botones-conserje-mod-'));
  const seedFile = path.join(os.tmpdir(), 'botones-conserje-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED);
  const ids = JSON.parse(execFileSync(process.execPath, [seedFile, tmpB, ROOT], { encoding: 'utf8' }).trim().split('\n').pop());
  process.env.DATA_DIR = tmpB;
  const cv = require('./conserje-vista');
  const db = require('./db');
  const ficha307 = cv.cliente(db, 307, {});
  const fallido = (ficha307.posteos || []).filter((p) => p.id === ids.F307)[0];
  t('B1 la ficha de Fallo Café incluye su posteo fallido en posteos', !!fallido && fallido.status === 'failed',
    JSON.stringify((ficha307.posteos || []).map((p) => p.id + ':' + p.status)));
  const ficha301 = cv.cliente(db, 301, {});
  t('B2 la ficha de Pago Café sigue trayendo sus posteos de siempre (publicado, programado, borradores)',
    [ids.A1, ids.A2, ids.A3].every((id) => (ficha301.posteos || []).some((p) => p.id === id)));
  try { fs.unlinkSync(seedFile); } catch (e) { /* nada */ }
  delete process.env.DATA_DIR;
}

// ---------------------------------------------------------------------
// C + D + E · boot real y Chromium
// ---------------------------------------------------------------------
function puertoLibre(p) {
  const out = execFileSync('ss', ['-ltn', 'sport = :' + p], { encoding: 'utf8' });
  return !/LISTEN/.test(out);
}
function buscarPuerto(desde) {
  for (let p = desde; p < desde + 25; p++) if (puertoLibre(p)) return p;
  return 0;
}
function cargarPw() {
  for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
    path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { return require(cand); } catch (e) { /* siguiente */ }
  }
  return null;
}
function exeChromium() {
  const basePw = path.join(os.homedir(), '.cache/ms-playwright');
  for (const dir of fs.readdirSync(basePw)) {
    const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
    if (dir.startsWith('chromium') && !dir.includes('headless') && fs.existsSync(p)) return p;
  }
  return undefined;
}
async function boot(desde) {
  const PORT = buscarPuerto(desde);
  if (!PORT) throw new Error('sin puerto libre');
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'botones-conserje-boot-'));
  const seedFile = path.join(os.tmpdir(), 'botones-conserje-seed-' + process.pid + '-' + PORT + '.js');
  fs.writeFileSync(seedFile, SEED);
  const ids = JSON.parse(execFileSync(process.execPath, [seedFile, tmpD, ROOT], { encoding: 'utf8' }).trim().split('\n').pop());
  const TOKEN = 'tok-botones-conserje';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += String(d); });
  child.stderr.on('data', (d) => { log += String(d); });
  const base = 'http://127.0.0.1:' + PORT;
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
    if (!up) await esperar(500);
  }
  if (!up) throw new Error('el servidor no levantó: ' + log.slice(-300));
  return { PORT, ids, child, base, TOKEN, pid: child.pid, seedFile };
}
async function matar(b) {
  try { b.child.kill('SIGTERM'); } catch (e) { /* ya murió */ }
  await esperar(1200);
  let vivo = true;
  try { process.kill(b.pid, 0); } catch (e) { vivo = false; }
  if (vivo) { try { process.kill(b.pid, 'SIGKILL'); } catch (e) { /* nada */ } await esperar(400); }
  let sigue = true;
  try { process.kill(b.pid, 0); } catch (e) { sigue = false; }
  try { fs.unlinkSync(b.seedFile); } catch (e) { /* nada */ }
  return !sigue && puertoLibre(b.PORT);
}

(async () => {
  const pw = cargarPw();
  t('C0 playwright-core disponible', !!pw);
  if (!pw) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const browser = await pw.chromium.launch({ executablePath: exeChromium(), args: ['--no-sandbox'] });

  // ================= C · puerta + D · escritorio =================
  const b = await boot(34851);
  {
    seccion('C · boot real y la puerta (F4)');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const bag = { reqs: [], plan: { mode: 'dismiss' } };
    page.on('response', (r) => { if (r.url().includes('/api/')) bag.reqs.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' → ' + r.status()); });
    page.on('dialog', async (d) => { try { if (bag.plan.mode === 'accept') await d.accept(bag.plan.text || ''); else await d.dismiss(); } catch (e) { /* cerrado */ } });
    const txt = (sel) => page.textContent(sel).catch(() => '');
    const existe = (sel) => page.locator(sel).count().then((n) => n > 0).catch(() => false);
    const click = async (sel) => { await page.click(sel, { timeout: 9000 }); await esperar(1000); };
    const toastsTxt = () => page.evaluate(() => Array.from(document.querySelectorAll('#toasts .toast')).map((x) => x.textContent).join(' | '));
    const sinReq = (marca, frag) => !bag.reqs.slice(marca).some((r) => r.includes(frag));

    await page.goto(b.base + '/conserje', { waitUntil: 'domcontentloaded' });
    await esperar(1100);
    t('C1 sin token, la puerta se abre', await existe('#gate.open'));
    await page.fill('#gateToken', 'token-que-no-es');
    await page.click('#gateBtn');
    await esperar(1700);
    const msgMalo = (await txt('#gateMsg').catch(() => '')).trim();
    t('C2 F4: con el token mal, la puerta AVISA (no rebota en silencio)', msgMalo.includes('Ese token no abrió la consola'), 'msg: «' + msgMalo + '»');
    t('C3 con el token mal, la puerta sigue abierta', await existe('#gate.open'));
    await page.fill('#gateToken', b.TOKEN);
    await page.click('#gateBtn');
    let filas = 0;
    try { await page.waitForSelector('.client-row', { timeout: 20000 }); filas = await page.locator('#roster .client-row').count(); } catch (e) { /* sin filas */ }
    t('C4 con el token bien (botón Entrar), la consola carga', filas >= 13, 'filas: ' + filas);
    {
      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p2 = await ctx2.newPage();
      await p2.goto(b.base + '/conserje', { waitUntil: 'domcontentloaded' });
      await esperar(900);
      await p2.fill('#gateToken', b.TOKEN);
      await p2.keyboard.press('Enter');
      let filas2 = 0;
      try { await p2.waitForSelector('.client-row', { timeout: 15000 }); filas2 = await p2.locator('#roster .client-row').count(); } catch (e) { /* sin filas */ }
      t('C5 con el token bien (tecla Enter), la consola carga', filas2 >= 13, 'filas: ' + filas2);
      await ctx2.close();
    }

    seccion('D · escritorio — shell, mañana, ficha y tarjetas, botón por botón');
    await page.goto(b.base + '/conserje?token=' + b.TOKEN, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.client-row', { timeout: 20000 });
    await esperar(700);
    const vistaApi = await (await fetch(b.base + '/api/admin/conserje/vista?token=' + b.TOKEN)).json();
    const tarjetasDom = await page.locator('#decisiones .decision').count();
    t('D01 el DOM pinta todas las tarjetas que trae la API (' + tarjetasDom + '/' + (vistaApi.mano || []).length + ')',
      tarjetasDom === (vistaApi.mano || []).length);
    await click('#btnRecargar');
    t('D02 «Actualizar» recarga la vista y el roster queda', (await page.locator('#roster .client-row').count()) >= 13);
    await click('[data-filtro="pruebas"]');
    { const tx = await txt('#roster'); t('D03 filtro Pruebas: solo pruebas', tx.includes('Prueba Viva') && !tx.includes('Pago Café')); }
    await click('[data-filtro="clientes"]');
    { const tx = await txt('#roster'); t('D04 filtro Clientes: solo pagos', tx.includes('Pago Café') && !tx.includes('Prueba Viva')); }
    await click('[data-filtro="pendientes"]');
    { const tx = await txt('#roster'); t('D05 filtro Con pendientes: muestra cuentas con pendientes', tx.includes('Pago Café')); }
    await click('[data-filtro="todos"]');
    await page.fill('#buscador', 'zzzsinresultados');
    await esperar(500);
    { const tx = await txt('#roster'); t('D06 el buscador sin resultados muestra el vacío con su botón de limpiar', tx.includes('zzzsinresultados') && await existe('[data-act="limpiar-busqueda"]')); }
    await click('[data-act="limpiar-busqueda"]');
    t('D07 «Limpiar búsqueda» devuelve la lista entera', (await page.locator('#roster .client-row').count()) >= 13 && (await page.inputValue('#buscador')) === '');
    await page.fill('#buscador', 'Pago');
    await esperar(500);
    { const tx = await txt('#roster'); t('D08 el buscador filtra por nombre', tx.includes('Pago Café') && !tx.includes('Prueba Viva')); await page.fill('#buscador', ''); await esperar(400); }

    // F2 primero (usa la tarjeta de voz de 302 antes de consumirla):
    await click('#roster [data-sel="302"]');
    t('D09 la fila de Prueba Viva abre su ficha', (await txt('#centro')).includes('Prueba Viva'));
    await click('[data-vista="feed"]');
    t('D10 el toggle «Su feed» cambia la vista', await page.evaluate(() => { const x = document.querySelector('#centro [data-vista="feed"]'); return !!x && x.className.includes('on'); }));
    await click('#decisiones [data-goto-post="' + b.ids.B1 + '"]:not(.who-link)');
    await esperar(500);
    t('D11 F2: «Ver el posteo» tras usar «Su feed» cae EN LA SEMANA con el posteo marcado',
      await existe('#post-' + b.ids.B1 + '.destacado')
      && await page.evaluate(() => { const x = document.querySelector('#centro [data-vista="semana"]'); return !!x && x.className.includes('on'); }));
    // Mañana: filas listo y falta + volver
    await click('[data-act="ir-manana"]');
    t('D12 «Producción de mañana» vuelve al tablero', (await txt('#centro')).includes('Producción de mañana'));
    await click('#centro [data-goto="301"]');
    t('D13 la fila «listo» de mañana abre la ficha de Pago Café', (await txt('#centro')).includes('Pago Café'));
    await click('[data-act="ir-manana"]');
    await click('#centro [data-goto="303"]');
    t('D14 la fila «falta» de mañana abre la ficha de Falta Todo', (await txt('#centro')).includes('Falta Todo'));
    // Ficha 301 completa
    await click('#roster [data-sel="301"]');
    await click('[data-vista="feed"]');
    { const tx = await txt('#centro'); t('D15 «Su feed» sin snapshot explica que no hay feed que mostrar (no inventa uno)', tx.includes('Sin snapshot no mostramos un feed inventado')); }
    await click('[data-vista="semana"]');
    t('D16 el toggle «Esta semana» vuelve a la semana', (await txt('#centro')).includes('Esta semana'));
    { const href = await page.getAttribute('#centro a[target="_blank"]', 'href').catch(() => null);
      t('D17 «Ver su Instagram» apunta al Instagram real del cliente', href === 'https://instagram.com/pagocafe', String(href)); }
    { const fam = await page.evaluate(() => { const o = Array.from(document.querySelectorAll('#tratSel option')).filter((x) => x.value)[0]; return o ? o.value : ''; });
      await page.selectOption('#tratSel', fam); await esperar(1300);
      const t1 = await toastsTxt();
      await page.selectOption('#tratSel', ''); await esperar(1300);
      const t2 = await toastsTxt();
      t('D18 el selector de tratamiento asigna y retira, con su aviso', t1.includes('Tratamiento asignado') && t2.includes('Tratamiento retirado')); }
    await page.fill('#notaInput', 'Nota de la suite de botones');
    await click('[data-act="nota-guardar"]');
    await esperar(600);
    t('D19 «Guardar nota» deja la nota puesta en la ficha', (await page.inputValue('#notaInput')) === 'Nota de la suite de botones');
    { const btn = page.locator('[data-act="producir"]').first();
      const fecha = await btn.getAttribute('data-fecha');
      await btn.click(); await esperar(1400);
      const t1 = await toastsTxt();
      const sigue = await existe('[data-act="producir"][data-fecha="' + fecha + '"]');
      let t2 = '';
      if (sigue) { await click('[data-act="producir"][data-fecha="' + fecha + '"]'); t2 = await toastsTxt(); }
      t('D20 «Producir el posteo» abre la orden y el segundo toque avisa que ya estaba', t1.includes('Orden abierta') && t2.includes('ya estaba en la cola')); }
    { let marca = bag.reqs.length;
      bag.plan = { mode: 'dismiss' };
      await page.click('#post-' + b.ids.A1 + ' [data-act="post-reprogramar"]', { timeout: 9000 });
      await esperar(800);
      t('D21 Reprogramar: cancelar el prompt no dispara nada', sinReq(marca, '/reprogramar'));
      bag.plan = { mode: 'accept', text: '2026-12-01 19:00' };
      await page.click('#post-' + b.ids.A1 + ' [data-act="post-reprogramar"]', { timeout: 9000 });
      await esperar(1500);
      const j = await (await fetch(b.base + '/api/admin/conserje/vista/cliente?user_id=301&token=' + b.TOKEN)).json();
      const p = (j.posteos || []).filter((x) => x.id === b.ids.A1)[0] || {};
      t('D22 Reprogramar: aceptar mueve el posteo a la fecha nueva', String(p.scheduled_at || '').startsWith('2026-12-01'), String(p.scheduled_at)); }
    await click('#post-' + b.ids.A2 + ' [data-act="post-sale"]');
    { const tx = await page.textContent('#post-' + b.ids.A2).catch(() => '');
      t('D23 el «Sale así» de la ficha aprueba el borrador y pasa a programado', tx.includes('Programado')); }
    { const marca = bag.reqs.length;
      bag.plan = { mode: 'dismiss' };
      await page.click('#post-' + b.ids.A5 + ' [data-act="post-descartar"]', { timeout: 9000 });
      await esperar(800);
      t('D24 Descartar: cancelar la confirmación no dispara nada y la tarjeta queda', sinReq(marca, '/descartar') && await existe('#post-' + b.ids.A5));
      bag.plan = { mode: 'accept' };
      await page.click('#post-' + b.ids.A5 + ' [data-act="post-descartar"]', { timeout: 9000 });
      await esperar(1400);
      t('D25 Descartar: confirmar descarta y la tarjeta sale', !(await existe('#post-' + b.ids.A5))); }
    // Tarjetas de voz e idea (302)
    await click('#decisiones [data-act="voz-responder"][data-mid="' + b.ids.msgVoz302 + '"]');
    t('D26 «Responder» despliega el campo de respuesta', await existe('#vozText-' + b.ids.msgVoz302));
    { const marca = bag.reqs.length;
      await click('#decisiones [data-act="voz-enviar"][data-mid="' + b.ids.msgVoz302 + '"]');
      t('D27 «Enviar» vacío frena con aviso y no manda nada', (await toastsTxt()).includes('Escribí la respuesta primero') && sinReq(marca, '/chat')); }
    await page.fill('#vozText-' + b.ids.msgVoz302, 'Listo: te lo dejo con la foto nueva del local.');
    await click('#decisiones [data-act="voz-enviar"][data-mid="' + b.ids.msgVoz302 + '"]');
    t('D28 «Enviar y cerrar» manda la respuesta y la tarjeta sale', !(await existe('#decisiones [data-act="voz-responder"][data-mid="' + b.ids.msgVoz302 + '"]')));
    await click('#decisiones [data-act="idea-resolver"][data-mid="' + b.ids.msgIdea302 + '"]');
    t('D29 «Resolver y avisar» (idea) despliega sus campos', await existe('#ideaText-' + b.ids.msgIdea302) && await existe('#ideaPost-' + b.ids.msgIdea302));
    await click('#decisiones [data-act="idea-enviar"][data-mid="' + b.ids.msgIdea302 + '"]');
    t('D30 «Resolver (push)» vacío frena con aviso', (await toastsTxt()).includes('Escribí la respuesta o cargá el N°'));
    await page.fill('#ideaText-' + b.ids.msgIdea302, 'Ya lo armé con la foto del local nuevo.');
    await page.fill('#ideaPost-' + b.ids.msgIdea302, String(b.ids.B1));
    await click('#decisiones [data-act="idea-enviar"][data-mid="' + b.ids.msgIdea302 + '"]');
    t('D31 «Resolver (push)» con datos resuelve y la tarjeta sale', !(await existe('#decisiones [data-act="idea-resolver"][data-mid="' + b.ids.msgIdea302 + '"]')));
    { const marca = bag.reqs.length;
      bag.plan = { mode: 'dismiss' };
      await page.click('#decisiones [data-act="voz-descartar"][data-mid="' + b.ids.msgVoz310 + '"]', { timeout: 9000 });
      await esperar(800);
      t('D32 Descartar pedido: cancelar no dispara nada y la tarjeta queda', sinReq(marca, 'pedidos-voz/decidir') && await existe('#decisiones [data-act="voz-descartar"][data-mid="' + b.ids.msgVoz310 + '"]'));
      bag.plan = { mode: 'accept' };
      await page.click('#decisiones [data-act="voz-descartar"][data-mid="' + b.ids.msgVoz310 + '"]', { timeout: 9000 });
      await esperar(1400);
      t('D33 Descartar pedido: confirmar descarta y la tarjeta sale', !(await existe('#decisiones [data-act="voz-descartar"][data-mid="' + b.ids.msgVoz310 + '"]'))); }
    await click('#decisiones [data-act="voz-resuelto"][data-mid="' + b.ids.msgVoz311 + '"]');
    t('D34 «Resuelto a mano» cierra el pedido y la tarjeta sale', !(await existe('#decisiones [data-act="voz-resuelto"][data-mid="' + b.ids.msgVoz311 + '"]')));
    // Pieza: F1 (cancelar no registra) y el resto de las decisiones
    { const marca = bag.reqs.length;
      bag.plan = { mode: 'dismiss' };
      await page.click('#decisiones [data-act="pieza-arreglar"][data-uid="314"]', { timeout: 9000 });
      await esperar(900);
      t('D35 F1: «Pedir arreglo» CANCELADO no registra ninguna decisión y la tarjeta queda',
        sinReq(marca, 'revision/decidir') && await existe('#decisiones [data-act="pieza-arreglar"][data-uid="314"]'));
      if (!(await existe('#decisiones [data-act="pieza-arreglar"][data-uid="314"]'))) {
        // En la base, el Cancelar de D35 ya consumió la tarjeta (eso ES
        // la falla F1): el camino de aceptar no se puede ni ejercer.
        t('D36 «Pedir arreglo» aceptado registra el arreglo y la tarjeta sale', false, 'la tarjeta ya no está: la consumió el cancelar del paso anterior');
      } else {
        bag.plan = { mode: 'accept', text: 'Cambiar la foto por la del local nuevo' };
        await page.click('#decisiones [data-act="pieza-arreglar"][data-uid="314"]', { timeout: 9000 });
        await esperar(1400);
        t('D36 «Pedir arreglo» aceptado registra el arreglo y la tarjeta sale', !(await existe('#decisiones [data-act="pieza-arreglar"][data-uid="314"]')));
      } }
    await click('#decisiones .who-link[data-goto="313"]');
    t('D37 el nombre del cliente en la tarjeta abre su ficha', (await txt('#centro')).includes('NoSale Café'));
    await click('#decisiones [data-act="pieza-nosale"][data-uid="313"]');
    t('D38 «No sale» frena la pieza y la tarjeta sale', !(await existe('#decisiones [data-act="pieza-nosale"][data-uid="313"]')));
    await click('#decisiones [data-act="pieza-sale"][data-uid="312"]');
    { const j = await (await fetch(b.base + '/api/admin/conserje/vista?token=' + b.TOKEN)).json();
      const it = (j.manana.items || []).filter((x) => x.user_id === 312)[0] || {};
      t('D39 «Sale así» aprueba la pieza: mañana queda listo y la tarjeta sale', it.estado === 'listo' && !(await existe('#decisiones [data-act="pieza-sale"][data-uid="312"]'))); }
    await click('#decisiones [data-act="falta-pedir"][data-uid="303"]');
    t('D40 «Posty lo arma» registra el pedido, la tarjeta sale y la cola lo muestra',
      !(await existe('#decisiones [data-act="falta-pedir"][data-uid="303"]')) && (await txt('#cola')).includes('Falta Todo'));
    { const card = page.locator('#decisiones .decision', { has: page.locator('.who-link[data-goto="303"]') }).filter({ hasNot: page.locator('[data-act]') });
      await card.locator('[data-goto="303"]:not(.who-link)').click(); await esperar(1200);
      t('D41 Conexión caída: «Ver la ficha» abre la ficha de Falta Todo', (await txt('#centro')).includes('Falta Todo')); }
    await click('#decisiones [data-act="impulso-detalle"]');
    { const c1 = await page.getAttribute('#err-' + b.ids.boost304, 'class');
      await click('#decisiones [data-act="impulso-detalle"]');
      const c2 = await page.getAttribute('#err-' + b.ids.boost304, 'class');
      t('D42 «Ver error» despliega y repliega el detalle', /open/.test(c1 || '') && !/open/.test(c2 || '')); }
    await click('#decisiones [data-act="impulso-ok"]');
    t('D43 «Entendido» del impulso lo marca visto y la tarjeta sale', !(await existe('#decisiones [data-act="impulso-ok"]')));
    await click('#decisiones [data-act="ver-cliente"][data-uid="305"]');
    t('D44 «Ver la ficha» de la alerta de portada abre la ficha', (await txt('#centro')).includes('Portada Café'));
    await click('#decisiones [data-act="portada-ok"]');
    t('D45 «Entendido» de portada marca la alerta y la tarjeta sale', !(await existe('#decisiones [data-act="portada-ok"]')));
    { const marca = bag.reqs.length;
      bag.plan = { mode: 'dismiss' };
      await page.click('#decisiones [data-act="caso-cerrar"]', { timeout: 9000 });
      await esperar(800);
      t('D46 Cerrar caso: cancelar no dispara nada y la tarjeta queda', sinReq(marca, 'caso-cerrar') && await existe('#decisiones [data-act="caso-cerrar"]'));
      bag.plan = { mode: 'accept' };
      await page.click('#decisiones [data-act="caso-cerrar"]', { timeout: 9000 });
      await esperar(1400);
      t('D47 Cerrar caso: confirmar cierra y la tarjeta sale', !(await existe('#decisiones [data-act="caso-cerrar"]'))); }
    { const card = page.locator('#decisiones .decision', { hasText: 'Subió material' });
      await card.locator('[data-goto="302"]:not(.who-link)').click(); await esperar(1200);
      t('D48 Material subido: «Ver la ficha» abre la ficha de Prueba Viva', (await txt('#centro')).includes('Prueba Viva')); }
    await click('#decisiones [data-goto-post="' + b.ids.F307 + '"]:not(.who-link)');
    await esperar(500);
    t('D49 F5: «Ver el posteo» del posteo fallido lo muestra en la ficha, marcado',
      await existe('#post-' + b.ids.F307 + '.destacado'));
    { const card = page.locator('#decisiones .decision', { has: page.locator('[data-goto-post="' + b.ids.F307 + '"]') });
      await card.locator('[data-goto="307"]:not(.who-link):not([data-goto-post])').click(); await esperar(1200);
      t('D50 Posteo fallido: «Ver la ficha» abre la ficha de Fallo Café', (await txt('#centro')).includes('Fallo Café')); }
    { const card = page.locator('#decisiones .decision', { hasText: 'último día de la prueba' });
      await card.locator('[data-goto="308"]:not(.who-link)').click(); await esperar(1200);
      t('D51 Termina su prueba: «Ver la ficha» abre la ficha de Termina Hoy', (await txt('#centro')).includes('Termina Hoy')); }
    { const card = page.locator('#decisiones .decision', { hasText: 'El cobro de hoy falló' });
      await card.locator('[data-goto="301"]:not(.who-link)').click(); await esperar(1200);
      t('D52 Pago fallido: «Ver la ficha» abre la ficha de Pago Café', (await txt('#centro')).includes('Pago Café')); }
    { const disco = (vistaApi.mano || []).some((d) => d.tipo === 'alerta' && d.kind === 'disco');
      if (!disco) { t('D53 alerta de disco: no aplica en este entorno (el payload no la trae)', true); }
      else {
        const card = page.locator('#decisiones .decision', { hasText: 'MB libres' });
        const popupP = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
        await card.locator('a[href="/panel"]').click();
        const popup = await popupP;
        t('D53 «Ver el panel» abre el panel en una pestaña nueva', !!popup && new URL(popup.url()).pathname === '/panel', popup ? popup.url() : 'sin popup');
        if (popup) await popup.close();
      } }
    await click('#cola [data-sel="309"]');
    t('D54 el chip de la cola abre la ficha de Cola Café', (await txt('#centro')).includes('Cola Café'));
    t('D55 el boot de escritorio muere por su PID y el puerto queda libre', await matar(b));
    await ctx.close();
  }

  // ================= E · teléfono 390px =================
  const b2 = await boot(34881);
  {
    seccion('E · teléfono 390px — la ficha viene a la vista (F3) y todo camina');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('dialog', async (d) => { try { await d.dismiss(); } catch (e) { /* cerrado */ } });
    const txt = (sel) => page.textContent(sel).catch(() => '');
    const existe = (sel) => page.locator(sel).count().then((n) => n > 0).catch(() => false);
    const centroEnVista = () => page.evaluate(() => {
      const c = document.querySelector('#centro'); if (!c) return false;
      const r = c.getBoundingClientRect();
      return r.top > -60 && r.top < window.innerHeight - 80;
    });
    await page.goto(b2.base + '/conserje?token=' + b2.TOKEN, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.client-row', { timeout: 20000 });
    await esperar(700);
    { const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      t('E01 el teléfono carga sin scroll horizontal', m.sw <= m.iw + 1, JSON.stringify(m)); }
    await page.tap('#roster [data-sel="301"]');
    await esperar(1900);
    t('E02 F3: tocar un cliente trae su ficha A LA VISTA', (await txt('#centro')).includes('Pago Café') && await centroEnVista());
    await page.evaluate(() => { const x = document.querySelector('#decisiones [data-act="ver-cliente"][data-uid="305"]'); if (x) x.scrollIntoView({ block: 'center' }); });
    await esperar(600);
    await page.tap('#decisiones [data-act="ver-cliente"][data-uid="305"]');
    await esperar(1900);
    t('E03 F3: «Ver la ficha» de una tarjeta trae la ficha A LA VISTA', (await txt('#centro')).includes('Portada Café') && await centroEnVista());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.tap('#roster [data-sel="302"]');
    await esperar(1500);
    await page.tap('[data-vista="feed"]');
    await esperar(800);
    await page.evaluate((pid) => { const x = document.querySelector('#decisiones [data-goto-post="' + pid + '"]:not(.who-link)'); if (x) x.scrollIntoView({ block: 'center' }); }, String(b2.ids.B1));
    await esperar(500);
    await page.tap('#decisiones [data-goto-post="' + b2.ids.B1 + '"]:not(.who-link)');
    await esperar(1700);
    t('E04 F2 en el teléfono: «Ver el posteo» tras «Su feed» muestra el posteo en la semana', await existe('#post-' + b2.ids.B1 + '.destacado'));
    await page.evaluate(() => { const x = document.querySelector('#decisiones [data-act="pieza-sale"][data-uid="312"]'); if (x) x.scrollIntoView({ block: 'center' }); });
    await esperar(500);
    await page.tap('#decisiones [data-act="pieza-sale"][data-uid="312"]');
    await esperar(1600);
    t('E05 en el teléfono, «Sale así» aprueba y la tarjeta sale', !(await existe('#decisiones [data-act="pieza-sale"][data-uid="312"]')));
    await page.evaluate(() => window.scrollTo(0, 0));
    await esperar(400);
    await page.tap('[data-filtro="pruebas"]');
    await esperar(800);
    { const tx = await txt('#roster'); t('E06 en el teléfono, los filtros filtran con el pulgar', tx.includes('Prueba Viva') && !tx.includes('Pago Café')); }
    t('E07 el boot de teléfono muere por su PID y el puerto queda libre', await matar(b2));
    await ctx.close();
  }

  await browser.close();
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); });
