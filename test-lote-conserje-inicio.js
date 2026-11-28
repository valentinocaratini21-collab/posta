'use strict';

// =====================================================================
// LOTE CONSERJE-INICIO — suite del lote
// =====================================================================
// El dueño (27/11): la ficha del cliente en la bandeja pasa a ser su
// INICIO — una sola pantalla simple con el posteo de hoy, el de
// mañana, su semana de un vistazo, lo que pidió por el chat, lo que
// subió y qué se hizo con eso, sus alertas, su momento comercial, su
// impulso y su billetera — con decisiones simples (la hoja de cambio
// que cambia DE VERDAD: Agregado A), el chat de correcciones del
// operador (Agregado B) y el aterrizaje de las push directo en el
// inicio del cliente (Agregado C).
//   A · Estática del lote (sello, rutas, SW, listeners).
//   B · Boot real: la vista del cliente trae las piezas del inicio.
//   C · Chromium: tablero con mini-estado, el inicio completo, las
//       flechas, la hoja (cambiar pieza + editar texto), las
//       correcciones, la cuenta tranquila y el deep link de la push.
// Uso: node test-lote-conserje-inicio.js — sale 0 si todo pasa.
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
seccion('A · estática del lote');
const htmlSrc = read('public/conserje.html');
const jsSrc = read('public/conserje.js');
const swSrc = read('public/sw.js');
const srvSrc = read('server.js');
const vistaSrc = read('conserje-vista.js');
t('A1 sello conserje.js?v=31', htmlSrc.includes('/conserje.js?v=31'));
t('A2 el inicio existe y la ficha completa queda detrás de su botón',
  jsSrc.includes('function mInicioHtml()') && jsSrc.includes('function mFichaCompletaHtml()') && jsSrc.includes('ficha-completa'));
t('A3 la hoja de cambio/decisión existe (Agregado A)', jsSrc.includes('function abrirHojaPost(')
  && jsSrc.includes("/set-image") && jsSrc.includes("/set-media") && jsSrc.includes("/edit-caption"));
t('A4 las correcciones están cableadas (Agregado B)', jsSrc.includes('corr-enviar')
  && srvSrc.includes("'/api/admin/conserje/correcciones'") && srvSrc.includes("'/api/admin/conserje/correcciones/estado'")
  && srvSrc.includes("'/api/admin/conserje/correcciones/nuevas'") && vistaSrc.includes('operador_correcciones'));
t('A5 el aterrizaje de la push (Agregado C): SW enfoca + postMessage, la consola escucha',
  swSrc.includes("tipo: 'conserje-ir'") && swSrc.includes('postMessage') && swSrc.includes('openWindow')
  && jsSrc.includes("d.tipo !== 'conserje-ir'") && jsSrc.includes('function abrirInicioCliente('));
t('A6 el parámetro de la push se limpia de la URL al abrir', jsSrc.includes("qs.get('user') || qs.get('post')"));
t('A7 la vista trae las piezas del inicio', vistaSrc.includes('function pedidosClienteDe(')
  && vistaSrc.includes('function subidosDe(') && vistaSrc.includes('function comercialDe(')
  && vistaSrc.includes('function alertasDe(') && vistaSrc.includes('mini,'));

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
require(process.argv[3] + '/guest-trial').ensureSchema(db);
try { require(process.argv[3] + '/support-cases').ensureSchema(db); } catch (e) {}
const fs = require('fs'); const path = require('path');
const MEDIA = path.join(process.argv[2], 'media');
fs.mkdirSync(MEDIA, { recursive: true });
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==', 'base64');
for (const f of ['hoy.jpg', 'manana.jpg', 'otra.jpg', 'suelta.jpg']) fs.writeFileSync(path.join(MEDIA, f), JPG);
function nyParts(d) { const g = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach((p) => { g[p.type] = p.value; }); return g; }
function nyWall(y, mo, d, h) {
  let guess = Date.UTC(y, mo - 1, d, h, 0);
  for (let i = 0; i < 3; i++) {
    const g = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(guess)).forEach((p) => { g[p.type] = p.value; });
    const asUtc = Date.UTC(+g.year, +g.month - 1, +g.day, (+g.hour) % 24, +g.minute);
    guess += (Date.UTC(y, mo - 1, d, h, 0) - asUtc);
  }
  return new Date(guess).toISOString();
}
const hoyP = nyParts(new Date());
const HOY10 = nyWall(+hoyP.year, +hoyP.month, +hoyP.day, 10);
const MAN19 = nyWall(+hoyP.year, +hoyP.month, +hoyP.day + 1, 19);
const PAS19 = nyWall(+hoyP.year, +hoyP.month, +hoyP.day + 2, 19);
const now = Date.now(); const H = 3600000;
const isoHace = (ms) => new Date(now - ms).toISOString().replace('T', ' ').slice(0, 19);
function usuario(id, email, planStatus, e) {
  db.prepare("INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, created_at) VALUES (?, ?, 'x', 'posty', ?, 0, 0, 0, NULL, NULL, '2026-09-01 10:00:00')").run(id, email, planStatus);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, city, ig_connected) VALUES (?, ?, ?, ?, ?, 1)').run(id, e.nombre || '', e.ig || '', e.cat || '', e.city || '');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(12, 'dueno@posty.test', 'trial', { nombre: 'Posty', ig: 'posty.communitymanager' });
usuario(401, 'cafe@real.test', 'active', { nombre: 'Café Inicio', ig: 'cafeinicio', cat: 'Cafetería', city: 'Palermo' });
usuario(402, 'tranqui@real.test', 'active', { nombre: 'Negocio Tranqui', ig: 'negociotranqui', cat: 'Tienda' });
db.prepare("INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, media_type, published_at) VALUES (9001, 401, '/media/hoy.jpg', ?, ?, 'published', 'image', ?)").run('El posteo de hoy ya salió\\ncon todo su texto', HOY10, HOY10);
db.prepare("INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, media_type) VALUES (9002, 401, '/media/manana.jpg', ?, ?, 'scheduled', 'image')").run('La pieza de mañana original', MAN19);
db.prepare("INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, media_type) VALUES (9003, 401, '/media/otra.jpg', ?, ?, 'scheduled', 'image')").run('La otra pieza de la semana', PAS19);
db.prepare('INSERT INTO chat_messages (id, user_id, role, text, hilo, created_at) VALUES (9101, 401, ?, ?, ?, ?)').run('user', '¿Pueden cambiar la foto de mañana?', 'general', isoHace(2 * H));
db.prepare('INSERT INTO chat_messages (id, user_id, role, text, hilo, created_at) VALUES (9102, 401, ?, ?, ?, ?)').run('assistant', '¡Hecho! Ya la cambié por la otra foto.', 'general', isoHace(1 * H));
db.prepare("INSERT INTO support_voz_pedidos (message_id, estado, decidido_en) VALUES (9101, 'resuelto_mano', datetime('now'))").run();
db.prepare('INSERT INTO chat_messages (id, user_id, role, text, hilo, created_at) VALUES (9103, 401, ?, ?, ?, ?)').run('user', 'Quiero un posteo del pan dulce', 'general', isoHace(30 * 60000));
db.prepare("INSERT INTO assets (id, user_id, kind, file_path, thumb_path, producto, created_at) VALUES (9201, 401, 'photo', '/media/manana.jpg', '', 'Pan dulce', ?)").run(isoHace(3 * H));
db.prepare("INSERT INTO assets (id, user_id, kind, file_path, thumb_path, producto, created_at) VALUES (9202, 401, 'photo', '/media/suelta.jpg', '', '', ?)").run(isoHace(2 * H));
db.prepare("INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (401, 5000, 'USD')").run();
db.prepare("INSERT INTO ad_boosts (user_id, post_id, budget_cents, fee_cents, currency, status, duration_days, last_spend_cents, started_at, created_at) VALUES (401, 9001, 2000, 200, 'USD', 'active', 7, 350, ?, ?)").run(isoHace(2 * 86400000), isoHace(2 * 86400000));
console.log('seed ok');
`;

function puertoLibre(p) {
  const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
  return !out.split('\n').some((l) => l.includes(':' + p + ' '));
}

(async () => {
  let PORT = 0;
  for (let p = 34751; p < 34770; p++) if (puertoLibre(p)) { PORT = p; break; }
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-inicio-boot-'));
  const seedFile = path.join(os.tmpdir(), 'conserje-inicio-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });
  const TOKEN = 'boot-test-token-inicio';
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
  const apiJson = async (url) => { const r = await fetch(base + url + (url.includes('?') ? '&' : '?') + 'token=' + TOKEN); return r.json(); };
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('B1 el servidor levanta en el puerto libre', up, serverLog.slice(-200));

    seccion('B · la vista del cliente trae el inicio');
    const cli = await apiJson('/api/admin/conserje/vista/cliente?user_id=401');
    t('B2 momento comercial: Cliente pago', !!(cli.comercial && cli.comercial.texto === 'Cliente pago'), JSON.stringify(cli.comercial || null));
    t('B3 su negocio en una línea: rubro + ciudad', !!(cli.negocio_linea && cli.negocio_linea.texto.includes('Cafetería') && cli.negocio_linea.texto.includes('Palermo')), JSON.stringify(cli.negocio_linea || null));
    t('B4 hoy publicado y mañana programado', !!(cli.inicio && cli.inicio.hoy && cli.inicio.hoy.estado === 'publicado' && cli.inicio.manana && cli.inicio.manana.estado === 'programado'),
      JSON.stringify(cli.inicio || null).slice(0, 200));
    t('B5 pedidos: el nuevo y el resuelto con su respuesta', Array.isArray(cli.pedidos) && cli.pedidos.length === 2
      && cli.pedidos.some((p) => p.estado === 'nuevo' && p.texto.includes('pan dulce'))
      && cli.pedidos.some((p) => p.estado === 'resuelto' && p.respuesta.includes('Ya la cambié')), JSON.stringify(cli.pedidos || null).slice(0, 240));
    t('B6 subidos con su uso real: sale mañana / guardado', Array.isArray(cli.subidos) && cli.subidos.length === 2
      && cli.subidos.some((s) => s.uso.startsWith('Sale mañana'))
      && cli.subidos.some((s) => s.uso.startsWith('Lo tengo guardado')), JSON.stringify(cli.subidos || null).slice(0, 240));
    t('B7 impulso activo y billetera con saldo', !!(cli.impulso && cli.impulso.presupuesto_cents === 2000 && cli.billetera && cli.billetera.saldo_cents === 5000),
      JSON.stringify({ impulso: cli.impulso, billetera: cli.billetera }).slice(0, 200));
    t('B8 sin problemas reales: alertas vacías', Array.isArray(cli.alertas) && cli.alertas.length === 0, JSON.stringify(cli.alertas || null));
    t('B9 el roster trae el mini-estado de la fila', (() => {
      const f = (cli.mini) || null;
      return !!(f && f.hoy === 'salio' && f.manana === 'programado' && f.pedidos_nuevos === 1);
    })(), JSON.stringify(cli.mini || null));
    const cli402 = await apiJson('/api/admin/conserje/vista/cliente?user_id=402');
    t('B10 la cuenta tranquila: sin pedidos, sin subidos, sin impulso ni billetera',
      Array.isArray(cli402.pedidos) && cli402.pedidos.length === 0 && Array.isArray(cli402.subidos) && cli402.subidos.length === 0
      && !cli402.impulso && !cli402.billetera && cli402.inicio && !cli402.inicio.hoy && !cli402.inicio.manana);

    seccion('C · Chromium: el inicio en la bandeja');
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
      const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      await page.goto(base + '/conserje?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#movil .m-nav', { timeout: 20000 });
      await page.click('#movil [data-mtab="negocios"]');
      await page.waitForSelector('[data-mbiz="401"]', { timeout: 15000 });
      const fila401 = await page.evaluate(() => { const el = document.querySelector('[data-mbiz="401"]'); return el ? el.textContent : ''; });
      t('C1 la fila del tablero trae el mini-estado (hoy ✓ · mañana ◷ · 1 pedido nuevo)',
        fila401.includes('hoy ✓') && fila401.includes('mañana ◷') && fila401.includes('pedido nuevo'), fila401.slice(0, 160));

      await page.click('[data-mbiz="401"]');
      await page.waitForSelector('#movil .ini-switch', { timeout: 15000 });
      const inicioTxt = await page.evaluate(() => document.querySelector('#mBody').textContent);
      t('C2 el inicio literal: su grilla con hoy y mañana etiquetados, y el resto',
        inicioTxt.includes('Hoy ·') && inicioTxt.includes('Mañana · 19:00')
        && inicioTxt.includes('Cliente pago') && inicioTxt.includes('Cafetería') && inicioTxt.includes('Palermo')
        && inicioTxt.includes('Quiero un posteo del pan dulce') && inicioTxt.includes('Lo resolví yo')
        && inicioTxt.includes('Sale mañana') && inicioTxt.includes('Lo tengo guardado para su semana')
        && inicioTxt.includes('Impulso activo') && inicioTxt.includes('Billetera: US$ 50,00'), inicioTxt.slice(0, 300));
      const celdas = await page.evaluate(() => ({
        n: document.querySelectorAll('#mBody .ini-cell').length,
        hoy: document.querySelectorAll('#mBody .ini-cell.hoy').length,
        marcaHoy: (document.querySelector('#mBody .ini-cell.hoy .ini-marca') || {}).textContent || '',
      }));
      t('C3 la grilla de su semana: 7 celdas en posición, hoy marcado y etiquetado', celdas.n === 7 && celdas.hoy === 1 && celdas.marcaHoy.startsWith('Hoy'), JSON.stringify(celdas));

      // Las flechas pasan de cliente y el contador cambia; Negocios vuelve.
      const posAntes = await page.evaluate(() => document.querySelector('.ini-swpos').textContent);
      await page.click('.ini-switch [data-minav="1"]');
      await page.waitForFunction((antes) => {
        const el = document.querySelector('.ini-swpos');
        return el && el.textContent !== antes;
      }, posAntes, { timeout: 15000 });
      const posDespues = await page.evaluate(() => document.querySelector('.ini-swpos').textContent);
      t('C4 la flecha pasa al cliente siguiente y el contador cambia', posAntes !== posDespues, posAntes + ' → ' + posDespues);
      await page.click('.ini-switch [data-mback]');
      await page.waitForSelector('#mBody .m-sums', { timeout: 10000 });
      t('C5 «Negocios» vuelve a la lista', true);

      // La hoja de mañana: cambiar la pieza por otra de la semana.
      await page.click('[data-mbiz="401"]');
      await page.waitForSelector('#movil .ini-switch', { timeout: 15000 });
      await page.click('#mBody [data-hoja-post="9002"]');
      await page.waitForSelector('#iniSheet', { timeout: 10000 });
      await page.click('#iniSheet [data-cambiar-desde="9003"]');
      await page.waitForFunction(() => !document.querySelector('#iniSheet'), null, { timeout: 15000 });
      await page.waitForTimeout(1200);
      const cliTras = await apiJson('/api/admin/conserje/vista/cliente?user_id=401');
      const post9002 = (cliTras.posteos || []).filter((p) => Number(p.id) === 9002)[0] || {};
      t('C6 cambiar la pieza la cambia DE VERDAD (la de mañana ahora es la otra)', String(post9002.image_url || '').includes('otra.jpg'), String(post9002.image_url || ''));
      const thumbManana = await page.evaluate(() => {
        const el = document.querySelector('#mBody [data-hoja-post="9002"] img');
        return el ? el.getAttribute('src') : '';
      });
      t('C7 la tarjeta del inicio se re-pinta con la pieza nueva', String(thumbManana).includes('otra.jpg'), String(thumbManana));

      // La hoja: editar el texto completo y verificar el guardado.
      await page.click('#mBody [data-hoja-post="9002"]');
      await page.waitForSelector('#iniSheet', { timeout: 10000 });
      await page.waitForTimeout(700);
      await page.fill('#hojaCap', 'Texto nuevo completo para mañana, con su segunda línea.');
      await page.click('#iniSheet [data-hoja-caption]');
      await page.waitForFunction(() => !document.querySelector('#iniSheet'), null, { timeout: 15000 });
      const cliCap = await apiJson('/api/admin/conserje/vista/cliente?user_id=401');
      const postCap = (cliCap.posteos || []).filter((p) => Number(p.id) === 9002)[0] || {};
      t('C8 editar el texto lo guarda completo', String(postCap.caption || '').startsWith('Texto nuevo completo para mañana'), String(postCap.caption || '').slice(0, 80));

      // Correcciones: escribir desde la UI, la ruta de nuevas la lista
      // con el negocio, la de estado la aplica y el hilo dice Hecha ✓.
      // (Espera de asentamiento: el refetch tras guardar el texto no
      // puede pisar lo tipeado — la misma pausa que usa C6.)
      await page.waitForTimeout(1200);
      await page.fill('#corrIn', 'Bajale el precio al pan dulce en el posteo');
      await page.click('[data-act="corr-enviar"]');
      await page.waitForFunction(() => document.querySelector('#mBody').textContent.includes('Bajale el precio al pan dulce'), null, { timeout: 15000 });
      t('C9 la corrección escrita desde la UI queda en el hilo', true);
      const nuevas = await apiJson('/api/admin/conserje/correcciones/nuevas');
      const miCorr = (nuevas.correcciones || []).filter((c) => c.texto.includes('Bajale el precio'))[0] || null;
      t('C10 la ruta de nuevas la lista con el negocio correcto', !!(miCorr && miCorr.negocio === 'Café Inicio' && Number(miCorr.user_id) === 401), JSON.stringify(miCorr || null));
      if (miCorr) {
        const rEst = await fetch(base + '/api/admin/conserje/correcciones/estado?token=' + TOKEN, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: miCorr.id, estado: 'aplicada', respuesta: 'Precio corregido en el posteo.' }),
        });
        const jEst = await rEst.json();
        t('C11 la ruta de estado la pasa a aplicada con su respuesta', !!(jEst.ok && jEst.correccion && jEst.correccion.estado === 'aplicada'));
        await page.click('.ini-switch [data-mback]');
        await page.waitForSelector('[data-mbiz="401"]', { timeout: 10000 });
        await page.click('[data-mbiz="401"]');
        await page.waitForFunction(() => document.querySelector('#mBody').textContent.includes('Hecha ✓'), null, { timeout: 15000 });
        const hiloTxt = await page.evaluate(() => document.querySelector('#mBody').textContent);
        t('C12 el hilo muestra «Hecha ✓» con la respuesta', hiloTxt.includes('Precio corregido en el posteo.'), hiloTxt.slice(-200));
      }

      // La cuenta tranquila: líneas tranquilas y ninguna alerta.
      await page.click('.ini-switch [data-mback]');
      await page.waitForSelector('[data-mbiz="402"]', { timeout: 10000 });
      await page.click('[data-mbiz="402"]');
      await page.waitForSelector('#movil .ini-switch', { timeout: 15000 });
      const tranqui = await page.evaluate(() => ({
        txt: document.querySelector('#mBody').textContent,
        alertas: document.querySelectorAll('#mBody .ini-alert').length,
      }));
      t('C13 la cuenta sin pedidos ni subidas muestra las líneas tranquilas',
        tranqui.txt.includes('No pidió nada por el chat.') && tranqui.txt.includes('Todavía no subió material'), tranqui.txt.slice(0, 200));
      t('C14 sin problemas no hay alertas ni impulso ni billetera',
        tranqui.alertas === 0 && !tranqui.txt.includes('Impulso activo') && !tranqui.txt.includes('Billetera:'), 'alertas=' + tranqui.alertas);

      // Agregado C: el deep link de la push abre el inicio del cliente
      // con su posteo marcado y la URL limpia.
      const page2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      await page2.goto(base + '/conserje?token=' + TOKEN + '&user=401&post=9002', { waitUntil: 'domcontentloaded' });
      await page2.waitForSelector('#movil .ini-switch', { timeout: 20000 });
      const deep = await page2.evaluate(() => ({
        nombre: (document.querySelector('.ini-swname') || {}).textContent || '',
        search: location.search,
        marcado: (() => { const el = document.querySelector('#mBody [data-hoja-post="9002"]'); return el ? String(el.getAttribute('style') || '') : 'sin celda'; })(),
      }));
      t('C15 la push aterriza directo en el inicio de ese cliente', deep.nombre.includes('Café Inicio'), JSON.stringify(deep));
      t('C16 el posteo del aviso queda marcado en la grilla', deep.marcado.includes('2793C8'), deep.marcado);
      t('C17 el parámetro no queda pegado en la URL', !deep.search.includes('user='), deep.search);
      await browser.close();
    }
  } finally {
    try { process.kill(serverPid, 'SIGTERM'); } catch (e) { /* ya murió */ }
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN', e); process.exit(1); });
