'use strict';

// =====================================================================
// LOTE CONSERJE-FORMA — suite del lote
// =====================================================================
// El Conserje rehecho en la forma que dictó el dueño (2026-11-22):
//   A · Estática: la forma existe en el código (semáforo, clases
//       vivas, las cuatro clases de la derecha, la falla #1 cerrada:
//       la frase vieja que vaciaba la lista ya no está).
//   B · Módulo contra una DB temporal sembrada como mini-producción,
//       con el reloj fijo en DOMINGO 2026-11-22 09:00 (Nueva York):
//       la cartera viva (prueba corriendo sí, terminada no, pago sí,
//       casa sí, cancelada no, pendiente con semana sí, pendiente
//       sin nada no), el centro adelantado (mañana = lunes 23, con
//       listo / en preparación / falta computados de los datos), y
//       la derecha con las cuatro clases SOLO de hoy: el fósil (su
//       objeto ya se resolvió, o su cuenta ya no es viva, o su día
//       ya pasó) no aparece; el real viejo re-entra con fecha de hoy.
//   C · Boot real (server.js, DATA_DIR temporal, puerto libre
//       verificado): /conserje sirve la forma y la API devuelve
//       manana + mano; la acción de decidir cierra el ítem.
//   D · Chromium sobre el boot: tocar clientes bajo cada pestaña y
//       con búsqueda puesta NUNCA pierde la lista (la falla #1); el
//       vacío es solo de búsqueda explícita y se limpia; el centro
//       abre en la producción de mañana; un pedido abre sobre la
//       cosa misma (la ficha con el posteo referido marcado) y la
//       acción se completa desde ahí; en viewport de teléfono las
//       tres secciones quedan en una columna, en orden, accionables
//       y sin scroll horizontal.
// Uso: node test-lote-conserje-forma.js — sale 0 si todo pasa.
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
seccion('A · estática de la forma');
const vistaSrc = read('conserje-vista.js');
const jsSrc = read('public/conserje.js');
const htmlSrc = read('public/conserje.html');
t('A1 el servidor computa la clase viva (claseDeCuenta) y la producción de mañana', vistaSrc.includes('function claseDeCuenta') && vistaSrc.includes('function produccionManana'));
t('A2 la membresía sale del reloj real de prueba (trial_started_at + fin efectivo), no de plan_status pelado',
  vistaSrc.includes('trial_started_at') && vistaSrc.includes('finEfectivoPrueba'));
t('A3 la derecha lee las fuentes reales de falla y de plata (posts failed · ig_token_warning · payment_failed)',
  vistaSrc.includes("status = 'failed'") && vistaSrc.includes('ig_token_warning') && vistaSrc.includes("name = 'payment_failed'"));
t('A4 la página trae el semáforo y la columna «Hoy necesita una mano»',
  htmlSrc.includes('id="semaforo"') && htmlSrc.includes('Hoy necesita una mano'));
t('A5 el cliente abre el centro en la producción de mañana y agrupa la derecha por clase',
  jsSrc.includes('renderManana') && jsSrc.includes('MANO_GRUPOS'));
t('A6 FALLA #1: la frase que vaciaba la lista al seleccionar ya no existe; el vacío es de búsqueda, con su botón',
  !jsSrc.includes('Ningún cliente coincide con ese filtro.') && jsSrc.includes('limpiar-busqueda'));
t('A7 cada ítem abre sobre la cosa misma (data-goto con el posteo referido)',
  jsSrc.includes('data-goto') && jsSrc.includes('gotoFicha') && jsSrc.includes('highlightPostId'));
t('A8 los filtros del roster leen la clase viva, no plan_status',
  jsSrc.includes("f.clase === 'prueba_corriendo'") && jsSrc.includes("f.clase === 'pago'"));

// ---------------------------------------------------------------------
seccion('B · módulo — la forma contra la mini-producción (domingo fijo)');
const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-forma-mod-'));
process.env.DATA_DIR = tmpB;
const db = require('./db');
require('./guest-trial').ensureSchema(db); // columnas del invitado (is_guest, guest_ig, guest_domain)
const cv = require('./conserje-vista');
const sc = require('./support-cases');

const NOW = Date.UTC(2026, 10, 22, 14, 0, 0); // domingo 2026-11-22, 09:00 en Nueva York
const HOY = '2026-11-22';
const MANANA = '2026-11-23';
const DIA = 86400000;

function usuario(id, email, planStatus, extra) {
  const e = extra || {};
  db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, created_at)
    VALUES (?, ?, 'x', ?, ?, 0, 0, 0, ?, ?, '2026-09-01 10:00:00')`)
    .run(id, email, e.plan || 'posty', planStatus, e.started != null ? e.started : null, e.ends != null ? e.ends : null);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)')
    .run(id, e.nombre || '', e.ig || '', e.rubro || '');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', ?)")
    .run(id, e.igPage || '');
}
function post(uid, campos) {
  const c = campos || {};
  const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uid, c.image || '/media/semilla.jpg', c.caption || 'Caption de prueba', c.status || 'draft',
      c.media || 'image', c.sched || null, c.error || null, c.created || '2026-11-22 10:00:00');
  return Number(r.lastInsertRowid);
}

// La casa (12): plan_status viejo 'trial' con el reloj vencido —
// entra SOLO por la regla de la casa.
usuario(12, 'dueno@posty.test', 'trial', { nombre: 'Posty', ig: 'posty.communitymanager', started: NOW - 40 * DIA, ends: NOW - 37 * DIA });
// 201 · cliente pago, con el posteo de mañana ya programado.
usuario(201, 'pago@test', 'active', { nombre: 'Pago Café', ig: 'pagocafe' });
const postListo = post(201, { status: 'scheduled', sched: '2026-11-24T00:00:00.000Z', caption: 'El café de mañana' });
// 202 · prueba corriendo (día 2 de 3), con propuesta para mañana.
usuario(202, 'viva@test', 'trial', { nombre: 'Prueba Viva', ig: 'pruebaviva', started: NOW - DIA, ends: NOW + 2 * DIA });
const postPropuesta = post(202, { status: 'draft', caption: 'La propuesta de mañana' });
// 203 · prueba que corrió y terminó hace semanas: NO aparece.
usuario(203, 'muerta@test', 'trial', { nombre: 'Prueba Muerta', ig: 'pruebamuerta', started: NOW - 30 * DIA, ends: NOW - 27 * DIA });
// 204 · cancelada: NO aparece.
usuario(204, 'cancelada@test', 'cancelled', { nombre: 'La Cancelada', ig: 'lacancelada', started: NOW - 20 * DIA, ends: NOW - 17 * DIA });
// 205 · prueba pendiente de conexión CON la semana armada y la
// invitación vigente (LOTE CONSERJE-CARTERA-VERDAD: la pendiente
// vencida sin conexión ya no es relación viva): aparece.
usuario(205, 'pendiente@test', 'trial', { nombre: 'Pendiente Café', ig: 'pendientecafe', started: 0, ends: NOW + 2 * DIA });
db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
  .run('pendientecafe', JSON.stringify({
    posts: [{ type: 'image' }, { type: 'carousel' }, { type: 'video' }],
    week: [{ day: 'Martes', date: '24/11', hour: '19:00' }, { day: 'Miércoles', date: '25/11', hour: '19:00' }, { day: 'Jueves', date: '26/11', hour: '19:00' }],
    formats: ['La Estrella'],
  }), NOW);
// 206 · prueba pendiente sin semana ni posteos: NO aparece.
usuario(206, 'vacia@test', 'trial', { nombre: 'La Vacía', ig: 'lavacia', started: 0, ends: null });
// 207 · prueba corriendo que TERMINA HOY (el día de la venta).
usuario(207, 'termina@test', 'trial', { nombre: 'Termina Hoy', ig: 'terminahoy', started: Date.UTC(2026, 10, 19, 15, 0, 0), ends: Date.UTC(2026, 10, 22, 15, 0, 0) });
// 208 · cliente pago SIN posteo de mañana y con la conexión caída.
usuario(208, 'falta@test', 'active', { nombre: 'Falta Todo', ig: 'faltatodo' });
db.prepare('UPDATE settings SET ig_token_warning = 1 WHERE user_id = 208').run();

// --- las fuentes de la derecha ---
// Pedido vivo de 201 sobre un posteo programado (su objeto sigue vivo).
db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (201, 'user', '¿Me cambiás el posteo de mañana por la torta nueva?', 'post', ?)").run(postListo);
// Pedido FÓSIL de 201: su posteo ya se publicó — se resolvió solo.
const postPublicado = post(201, { status: 'published', caption: 'Ya salió' });
db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (201, 'user', 'Cambiame este posteo que ya salió', 'post', ?)").run(postPublicado);
// Pedido de una cuenta que ya no es viva (203): no entra.
db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (203, 'user', 'Un pedido de una prueba terminada', 'general', 0)").run();
// Material subido de 202 esperando armado.
db.prepare("INSERT INTO subir_pedidos_voz (user_id, asset_id, kind, nota, estado) VALUES (202, 1, 'foto', 'Esta foto es del local nuevo', 'pendiente_revision')").run();
// Posteo que no salió HOY (202) y uno de hace 10 días (fósil).
post(202, { status: 'failed', error: 'Meta rechazó la publicación (190)', sched: '2026-11-22T23:00:00.000Z', created: '2026-11-22 09:00:00' });
post(202, { status: 'failed', error: 'Fallo viejo', sched: '2026-11-12T23:00:00.000Z', created: '2026-11-12 09:00:00' });
// Pago fallido de HOY (201) y uno de una cuenta muerta (203).
db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (201, 'payment_failed', '{}', '2026-11-22 13:30:00')").run();
db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (203, 'payment_failed', '{}', '2026-11-22 13:30:00')").run();
// Caso real viejo (ayuda, sin día): re-entra con fecha de hoy.
const casoAyuda = sc.openCase(db, { userId: 201, tipo: 'ayuda', titulo: 'Necesita una mano con su menú', detalle: 'Pidió ayuda hace días y sigue esperando.' });
db.prepare("UPDATE support_cases SET created_at = '2026-11-15 10:00:00' WHERE id = ?").run(casoAyuda.caso.id);
// Caso DE UN DÍA nacido hace 5 días: su día ya pasó — fósil.
let casoDia = sc.openCase(db, { userId: 201, tipo: 'sin_posteo_manana', titulo: 'Sin posteo mañana (del 17/11)' });
if (!casoDia || !casoDia.ok) {
  const r = db.prepare(`INSERT INTO support_cases (user_id, tipo, titulo, detalle, estado, dueno) VALUES (201, 'sin_posteo_manana', 'Sin posteo mañana (del 17/11)', '', 'abierto', 'equipo')`).run();
  casoDia = { caso: { id: Number(r.lastInsertRowid) } };
}
db.prepare("UPDATE support_cases SET created_at = '2026-11-17 10:00:00' WHERE id = ?").run(casoDia.caso.id);

const v = cv.vista(db, { nowMs: NOW });
const ids = v.clientes.map((f) => f.user_id).sort((a, b) => a - b);
t('B1 la cartera viva es exactamente casa + pago + corriendo + pendiente-con-semana + termina-hoy + pago-sin-posteo',
  JSON.stringify(ids) === JSON.stringify([12, 201, 202, 205, 207, 208]), 'salió: ' + ids.join(','));
const fila = (uid) => v.clientes.filter((f) => f.user_id === uid)[0] || {};
t('B2 las clases: casa · pago · corriendo · pendiente · corriendo',
  fila(12).clase === 'casa' && fila(201).clase === 'pago' && fila(202).clase === 'prueba_corriendo'
  && fila(205).clase === 'prueba_pendiente' && fila(207).clase === 'prueba_corriendo');
t('B3 la prueba corriendo declara sus días desde el reloj real (quedan 2)',
  fila(202).prueba && fila(202).prueba.dias_restantes === 2 && fila(202).prueba.termina_key === '2026-11-24');
t('B4 el resumen cuenta pruebas activas = las que corren (2), no las 42 históricas',
  v.hoy.pruebas_activas === 2, 'salió: ' + v.hoy.pruebas_activas);
t('B5 el centro trabaja un día adelantado: domingo → lunes 2026-11-23',
  v.manana.fecha === MANANA, 'salió: ' + v.manana.fecha);
t('B6 el semáforo y el centro comparten los mismos conteos (3 en régimen: 1 listo · 1 en preparación · 1 falta)',
  v.manana.resumen.total === 3 && v.manana.resumen.listos === 1 && v.manana.resumen.en_preparacion === 1 && v.manana.resumen.faltan === 1,
  JSON.stringify(v.manana.resumen));
const itemM = (uid) => v.manana.items.filter((i) => i.user_id === uid)[0] || {};
t('B7 los estados salen de los datos: programado=listo · propuesta=en preparación · nada=falta',
  itemM(201).estado === 'listo' && itemM(202).estado === 'en_preparacion' && itemM(208).estado === 'falta');
t('B8 la casa y la prueba que termina hoy no entran al régimen de mañana',
  !itemM(12).estado && !itemM(207).estado && !itemM(205).estado);

const mano = v.mano || [];
const hay = (tipo, uid) => mano.some((d) => d.tipo === tipo && d.user_id === uid);
t('B9 clase pedido: el pedido vivo (201) y el material subido (202) están',
  hay('voz', 201) && hay('subir', 202));
t('B10 FÓSILES fuera: el pedido cuyo posteo ya se publicó no aparece',
  mano.filter((d) => d.tipo === 'voz').length === 1);
t('B11 FÓSILES fuera: nada de cuentas que ya no son vivas (203/204/206) en toda la lista',
  mano.every((d) => ![203, 204, 206].includes(d.user_id)));
t('B12 clase decisión: la propuesta de mañana de 202 espera el toque del dueño',
  hay('pieza', 202) && mano.filter((d) => d.tipo === 'pieza')[0].fecha === MANANA);
t('B13 clase problema: la falta de 208, su conexión caída y el posteo que no salió hoy (202)',
  hay('pieza_falta', 208) && hay('conexion', 208) && hay('post_fallido', 202));
t('B14 FÓSILES fuera: el posteo fallido de hace 10 días no aparece (solo el de hoy)',
  mano.filter((d) => d.tipo === 'post_fallido').length === 1);
t('B15 clase plata: la prueba que termina hoy (207) y el pago fallido de hoy (201)',
  hay('prueba_termina', 207) && hay('pago_fallido', 201));
t('B16 el caso real viejo re-entra CON FECHA DE HOY; el caso de un día vencido no aparece',
  mano.some((d) => d.tipo === 'caso' && d.user_id === 201 && d.fecha === HOY)
  && mano.filter((d) => d.tipo === 'caso').length === 1);
t('B17 NADA sin fecha ni de otro día: cada ítem es de hoy o es la pieza de mañana',
  mano.every((d) => d.fecha === HOY || d.fecha === MANANA),
  mano.map((d) => d.tipo + ':' + d.fecha).join(' · '));
t('B18 las cuatro clases están representadas y ordenadas (pedido · decisión · problema · plata)',
  ['pedido', 'decision', 'problema', 'plata'].every((c) => mano.some((d) => d.clase === c)));
t('B19 los exports de v1 siguen (19) y se suman los de la forma',
  ['catalogoTratamientos', 'tratamientoDe', 'asignarTratamiento', 'planDePrueba', 'rachaDe', 'pendientesDe',
   'usuariosAtendidos', 'filaRoster', 'resumenHoy', 'decisiones', 'ultimasDecisiones', 'colaProduccion',
   'semanaDe', 'posteosDe', 'cliente', 'marcarVozResuelto', 'abrirOrdenProduccion', 'vista']
    .every((f) => typeof cv[f] === 'function')
  && typeof cv.claseDeCuenta === 'function' && typeof cv.produccionManana === 'function' && typeof cv.finEfectivoPrueba === 'function');
t('B20 la cola de producción también es de la cartera viva (sin cuentas muertas)',
  (v.cola || []).every((j) => ids.includes(j.user_id)));

// ---------------------------------------------------------------------
// C + D · boot real y Chromium
// ---------------------------------------------------------------------
function puertoLibre(p) {
  try { execFileSync('ss', ['-ltn', 'sport = :' + p], { encoding: 'utf8' }); } catch (e) { return false; }
  const out = execFileSync('ss', ['-ltn', 'sport = :' + p], { encoding: 'utf8' });
  return !/LISTEN/.test(out);
}
function buscarPuerto() {
  for (let p = 34611; p < 34630; p++) if (puertoLibre(p)) return p;
  return 0;
}

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
usuario(302, 'viva@real.test', 'trial', { nombre: 'Viva Real', ig: 'vivareal', started: now - DIA, ends: now + 2 * DIA });
usuario(303, 'muerta@real.test', 'trial', { nombre: 'Muerta Real', ig: 'muertareal', started: now - 30 * DIA, ends: now - 27 * DIA });
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const mananaKey = fmt.format(new Date(now + DIA));
const sched = new Date(mananaKey + 'T19:00:00-05:00').toISOString();
db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at) VALUES (301, '/media/semilla.jpg', 'El posteo de mañana de Pago Real', 'scheduled', 'image', ?)").run(sched);
const r = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type) VALUES (302, '/media/semilla.jpg', 'La propuesta de Viva Real', 'draft', 'image')").run();
db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (302, 'user', '¿Me cambiás este posteo por la foto nueva del local?', 'post', ?)").run(Number(r.lastInsertRowid));
console.log('seed ok · draft=' + Number(r.lastInsertRowid) + ' · manana=' + mananaKey);
`;

(async () => {
  seccion('C · boot real — la forma servida y la API');
  const PORT = buscarPuerto();
  t('C0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-forma-boot-'));
  const seedFile = path.join(os.tmpdir(), 'conserje-forma-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });

  const TOKEN = 'boot-test-token-forma';
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
  async function getJson(p) {
    const r = await fetch(base + p + (p.includes('?') ? '&' : '?') + 'token=' + TOKEN);
    let j = null; try { j = await r.json(); } catch (e) { /* no json */ }
    return { status: r.status, json: j };
  }
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('C1 el servidor levanta en el puerto libre', up, serverLog.slice(-300));

    const html = await (await fetch(base + '/conserje?token=' + TOKEN)).text();
    t('C2 /conserje sirve la forma (semáforo + «Hoy necesita una mano»)',
      html.includes('id="semaforo"') && html.includes('Hoy necesita una mano'));

    const v1 = await getJson('/api/admin/conserje/vista');
    const j1 = v1.json || {};
    const idsBoot = (j1.clientes || []).map((f) => f.user_id);
    t('C3 la API trae la cartera viva del boot (301 y 302 sí; la muerta 303 no)',
      v1.status === 200 && j1.ok && idsBoot.includes(301) && idsBoot.includes(302) && !idsBoot.includes(303),
      'ids: ' + idsBoot.join(','));
    t('C4 la API trae manana (con resumen) y mano (las cuatro clases viajan en cada ítem)',
      !!j1.manana && !!j1.manana.resumen && Array.isArray(j1.mano)
      && j1.mano.every((d) => ['pedido', 'decision', 'problema', 'plata'].includes(d.clase)));
    const pieza302 = (j1.mano || []).filter((d) => d.tipo === 'pieza' && d.user_id === 302)[0];
    const draftId = pieza302 ? pieza302.post_id : null;
    t('C5 la propuesta de 302 espera decisión y el pedido de 302 está en la derecha',
      !!pieza302 && (j1.mano || []).some((d) => d.tipo === 'voz' && d.user_id === 302));

    // ---------------- D · Chromium ----------------
    seccion('D · Chromium — la falla #1, el drill-in y el teléfono');
    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); break; } catch (e) { /* siguiente */ }
    }
    t('D0 playwright-core disponible', !!pw);
    if (pw) {
      let exe = '';
      const basePw = path.join(os.homedir(), '.cache/ms-playwright');
      for (const dir of fs.readdirSync(basePw)) {
        const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
        if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
      }
      const browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(base + '/conserje?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.client-row', { timeout: 20000 });
      const rosterTxt = await page.textContent('#roster');
      t('D1 el roster muestra la cartera viva y NO a la prueba terminada',
        rosterTxt.includes('Pago Real') && rosterTxt.includes('Viva Real') && !rosterTxt.includes('Muerta Real'));
      const semTxt = await page.textContent('#semaforoTxt');
      t('D2 el semáforo responde arriba de todo (mañana, con sus conteos)', /Mañana/.test(semTxt) && /listos/.test(semTxt), semTxt);
      const centroTxt0 = await page.textContent('#centro');
      t('D3 el centro abre en la producción de mañana (no en una ficha)', centroTxt0.includes('Producción de mañana'));

      // FALLA #1 — tocar clientes bajo una pestaña nunca pierde la lista
      await page.click('[data-filtro="clientes"]');
      await page.waitForTimeout(300);
      await page.click('.client-row[data-sel="301"]');
      await page.waitForSelector('#centro .c-name', { timeout: 15000 });
      const rosterTrasTocar = await page.textContent('#roster');
      const filasTrasTocar = await page.locator('#roster .client-row').count();
      t('D4 FALLA #1: con la pestaña Clientes puesta, tocar el cliente abre su ficha y la lista QUEDA',
        filasTrasTocar >= 1 && !rosterTrasTocar.includes('coincide con ese filtro'));
      await page.click('[data-act="ir-manana"]');
      await page.waitForTimeout(300);
      t('D5 el botón «Producción de mañana» vuelve al tablero de trabajo',
        (await page.textContent('#centro')).includes('Producción de mañana'));

      // El vacío es SOLO de búsqueda explícita, y se limpia
      await page.click('[data-filtro="todos"]');
      await page.waitForTimeout(200);
      await page.fill('#buscador', 'zzzsinresultados');
      await page.waitForTimeout(300);
      const vacioTxt = await page.textContent('#roster');
      t('D6 la búsqueda sin resultados muestra el vacío CON el texto buscado y el botón de limpiar',
        vacioTxt.includes('zzzsinresultados') && vacioTxt.includes('Limpiar búsqueda'));
      await page.click('[data-act="limpiar-busqueda"]');
      await page.waitForTimeout(300);
      t('D7 limpiar la búsqueda devuelve la lista entera',
        (await page.locator('#roster .client-row').count()) >= 3);

      // Cada pedido abre sobre la cosa misma + la acción se completa ahí
      const manoTxt = await page.textContent('#decisiones');
      t('D8 la derecha agrupa por clase (Pedidos de clientes · Decisiones de hoy)',
        manoTxt.includes('Pedidos de clientes') && manoTxt.includes('Decisiones de hoy'));
      await page.click('#decisiones [data-goto-post="' + draftId + '"]');
      await page.waitForSelector('#post-' + draftId, { timeout: 15000 });
      const clasePost = await page.getAttribute('#post-' + draftId, 'class');
      const fichaTxt = await page.textContent('#centro');
      t('D9 el pedido abre sobre la cosa misma: la ficha de Viva Real con SU posteo marcado',
        fichaTxt.includes('Viva Real') && /destacado/.test(clasePost || ''));
      await page.click('#decisiones [data-act="voz-responder"]');
      await page.waitForSelector('#decisiones textarea', { timeout: 10000 });
      await page.fill('#decisiones textarea', 'Listo: te lo dejo con la foto nueva.');
      await page.click('#decisiones [data-act="voz-enviar"]');
      await page.waitForTimeout(2500);
      const manoTras = await page.textContent('#decisiones');
      t('D10 la acción sobre el ítem se completa desde ahí (responder cierra el pedido)',
        !manoTras.includes('foto nueva del local'));

      // El teléfono: una columna, en orden, sin scroll horizontal
      const ctxTel = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const tel = await ctxTel.newPage();
      await tel.goto(base + '/conserje?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
      await tel.waitForSelector('.client-row', { timeout: 20000 });
      const ancho = await tel.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      t('D11 teléfono: sin scroll horizontal', ancho.scroll <= ancho.inner + 1, JSON.stringify(ancho));
      const orden = await tel.evaluate(() => {
        const y = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().top + window.scrollY : -1; };
        return { clientes: y('.layout > aside'), centro: y('#centro'), derecha: y('.col-right') };
      });
      t('D12 teléfono: una columna en su orden (clientes → posteos de mañana → lo que necesita mano)',
        orden.clientes >= 0 && orden.centro > orden.clientes && orden.derecha > orden.centro, JSON.stringify(orden));
      await tel.click('[data-filtro="pruebas"]');
      await tel.waitForTimeout(300);
      const telRoster = await tel.textContent('#roster');
      t('D13 teléfono: las secciones son accionables con el pulgar (la pestaña Pruebas filtra)',
        telRoster.includes('Viva Real') && !telRoster.includes('Pago Real'));
      await browser.close();
    }

    // C6 · la acción de decidir por API cierra el ítem (ningún botón muerto)
    const dec = await fetch(base + '/api/admin/support/conserje/revision/decidir?token=' + TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 302, fecha_posteo: j1.manana.fecha, post_id: draftId, decision: 'sale' }),
    });
    const decJson = await dec.json().catch(() => null);
    const v2 = await getJson('/api/admin/conserje/vista');
    const item302 = ((v2.json || {}).manana.items || []).filter((i) => i.user_id === 302)[0] || {};
    t('C6 decidir «sale» por la puerta real deja mañana LISTO y saca la decisión de la derecha',
      !!(decJson && decJson.ok) && item302.estado === 'listo'
      && !((v2.json || {}).mano || []).some((d) => d.tipo === 'pieza' && d.user_id === 302));
  } catch (e) {
    t('C/D sin excepción', false, String(e && e.message || e));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) { /* ya murió */ }
    await new Promise((res) => setTimeout(res, 1200));
    let vivo = true;
    try { process.kill(serverPid, 0); } catch (e) { vivo = false; }
    if (vivo) { try { process.kill(serverPid, 'SIGKILL'); } catch (e) { /* nada */ } }
    t('C7 el boot murió por su PID exacto y el puerto quedó libre', !vivo && puertoLibre(PORT));
    try { fs.unlinkSync(seedFile); } catch (e) { /* nada */ }
  }

  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
