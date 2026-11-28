'use strict';

// =====================================================================
// LOTE CONSERJE-PUSH-OPERADOR — suite del lote (censo-conserje-3 §5.5)
// AJUSTE CONSERJE-PUSH-URGENTES (27/11 23:27): solo avisan las
// URGENCIAS — un posteo no salió, pidieron un cambio o el cliente
// escribió y espera respuesta.
// LOTE CONSERJE-AVISOS-APAGADOS (27/11 23:48: «no mandarme
// notificaciones de clientes. Te tenes que hacer cargo vos de
// todo.»): las push del conserje al operador se apagan POR COMPLETO
// con un interruptor en el embudo único de envío (avisosActivos():
// env OPERADOR_AVISOS === 'on'; default APAGADO). La suite corre en
// DOS MUNDOS:
//   · APAGADO (el default, sin la env): TODOS los eventos que antes
//     avisaban — caso conserje, retorno_dm, pedido, idea, posteo
//     fallido, el barrido completo — producen CERO envíos y CERO
//     filas reclamadas en operador_avisos (nada se quema: si el
//     dueño vuelve a prender, el historial arranca limpio).
//   · PRENDIDO (proceso hijo con OPERADOR_AVISOS=on seteada antes
//     de requerir el módulo): el comportamiento de v1391 sigue
//     intacto — avisan solo las urgencias, con dedup durable.
// =====================================================================
// La suscripción queda atada a la identidad del operador (la casa,
// user 12) por una puerta admin propia, y no cambia con el
// interruptor: suscribirse no manda nada por sí mismo. Cada push
// lleva su deep link ?user=<uid> (y &post=<id> si el evento es de un
// posteo): al tocarla, aterriza en el perfil de ESE cliente.
//   A · Estática de las puntadas (módulo, interruptor y sus
//       cortocircuitos, hook en openCase, rutas, hook de la idea,
//       hooks del fracaso en ambos emisores, barrido en el
//       scheduler, cliente, sello; la rama de decisiones, fuera).
//   B · Mundo APAGADO — módulo contra DB temporal con transporte
//       capturado: ningún camino avisa ni reclama claves.
//   C · Boot real por HTTP: la puerta de suscripción ata la fila al
//       12, el estado la refleja, sin token no pasa, sello v=30.
//   D · La base, tras matar el servidor por su PID exacto.
//   E · Mundo PRENDIDO — proceso hijo con la env puesta: los casos
//       de envío de v1391 (retorno_dm una vez, preflight/línea a
//       mano mudos, idea, barrido sin duplicar, posteo fallido una
//       sola vez y sin quemar la clave sin suscripción).
// Uso: node test-lote-push-operador.js — sale 0 si todo pasa.
// (El transporte se simula con opts.sendFn, el patrón de la casa; el
// envío real sin suscripción se prueba con el sendPush verdadero.)
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

// ---------------------------------------------------------------------
seccion('A · estática de las puntadas');
const modSrc = read('push-operador.js');
const scSrc = read('support-cases.js');
const serverSrc = read('server.js');
const schedSrc = read('scheduler.js');
const jsSrc = read('public/conserje.js');
const htmlSrc = read('public/conserje.html');
t('A1 el módulo existe con su dedup durable y sus tres fuentes urgentes', modSrc.includes('operador_avisos') && modSrc.includes('INSERT OR IGNORE') && modSrc.includes('function hookCaso') && modSrc.includes('function hookPedido') && modSrc.includes('function hookFallo') && modSrc.includes('function barrido'));
t('A2 el operador es la casa (user 12) y los únicos tipos que avisan son los urgentes', modSrc.includes('OPERADOR_USER_ID = 12') && modSrc.includes("TIPOS_URGENTES = ['conserje', 'prueba_retorno_dm']"));
t('A2b la rama de decisiones se eliminó entera (sin constructor, sin clave, sin cuerpo)', !modSrc.includes('avisoDeDecision') && !modSrc.includes("decision-'") && !modSrc.includes('esperando tu decisión') && !modSrc.includes('estadoVentana'));
t('A2c el aviso del posteo fallido existe con su clave por posteo y su cuerpo en humano', modSrc.includes("'fallo-'") && modSrc.includes('no salió.') && modSrc.includes('function hookFallo'));
t('A3 openCase engancha el hook al nacer el caso', scSrc.includes("require('./push-operador').hookCaso(db, caso)"));
t('A4 el server registra la puerta admin de suscripción y el estado', serverSrc.includes("'/api/admin/conserje/push/suscribir'") && serverSrc.includes("'/api/admin/conserje/push/estado'") && serverSrc.includes('pushOperador.OPERADOR_USER_ID'));
t('A5 la ruta de la idea escrita engancha su hook', serverSrc.includes('pushOperador.hookPedido(db, {'));
t('A6 el scheduler corre el barrido junto al del vigía', schedSrc.includes('pushOperador.barrido(db, {})'));
t('A7 el cliente ofrece activar avisos (Más + escritorio) por la puerta admin', jsSrc.includes('data-mact="avisos"') && jsSrc.includes('activarAvisosOperador') && jsSrc.includes('/api/admin/conserje/push/suscribir') && htmlSrc.includes('id="btnOpPush"'));
t('A8 sello conserje.js?v=30', htmlSrc.includes('/conserje.js?v=30'));
t('A9 los textos no llevan tecnicismos (sin «caso #», sin rutas internas en el cuerpo)', !/caso #/.test(modSrc) && modSrc.includes("title: TITULO") && modSrc.includes("'/conserje?user='"));
t('A10 el fracaso se engancha en los DOS emisores del evento post_failed (scheduler y server)', schedSrc.includes('pushOperador.hookFallo') && serverSrc.includes('pushOperador.hookFallo'));
t('A11 el interruptor existe: avisosActivos() lee OPERADOR_AVISOS y solo «on» prende', modSrc.includes('function avisosActivos()') && modSrc.includes("process.env.OPERADOR_AVISOS === 'on'") && modSrc.includes('avisosActivos,'));
t('A12 el interruptor cortocircuita el embudo y cada entrada (3 hooks + barrido)', (modSrc.match(/avisosActivos\(\)/g) || []).length >= 6 && modSrc.includes("reason: 'avisos_apagados'"));

// ---------------------------------------------------------------------
seccion('B · mundo APAGADO — ningún camino avisa ni reclama claves');
// El default: la env NO está (se borra por las dudas — el mundo
// prendido corre en el proceso hijo de la sección E).
delete process.env.OPERADOR_AVISOS;
const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'push-operador-mod-'));
process.env.DATA_DIR = tmpB;
const db = require('./db');
require('./guest-trial').ensureSchema(db);
const push = require('./push');
push.initPush(db);
const captura = [];
push.sendPush = async (uid, payload) => { captura.push([uid, payload]); return { ok: true, sent: 1 }; };
const pushOperador = require('./push-operador');
const supportCases = require('./support-cases');

function usuarioB(id, email, planStatus, e) {
  const x = e || {};
  db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, created_at)
    VALUES (?, ?, 'x', 'posty', ?, 0, ?, 0, ?, ?, '2026-09-01 10:00:00')`)
    .run(id, email, planStatus, x.concierge ? 1 : 0, x.started != null ? x.started : null, x.ends != null ? x.ends : null);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)')
    .run(id, x.nombre || '', x.ig || '', '');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
const DIA_B = 86400000;
const nowB = Date.now();
usuarioB(12, 'dueno@posty.test', 'trial', { nombre: 'Posty', ig: 'posty.communitymanager', started: nowB - 40 * DIA_B, ends: nowB - 37 * DIA_B });
usuarioB(301, 'conserje@test', 'active', { nombre: 'Café Conserje', ig: 'cafeconserje', concierge: true });
usuarioB(302, 'pago@test', 'active', { nombre: 'Pago Real', ig: 'pagoreal' });
usuarioB(303, 'idea@test', 'active', { nombre: 'Idea Bar', ig: 'ideabar' });

(async () => {
  t('B0 sin la env, el interruptor está apagado', pushOperador.avisosActivos() === false);

  // B1 · TODOS los casos nacen (la maquinaria vive) pero ninguno zumba.
  const rPf = supportCases.openCase(db, { userId: 12, tipo: 'preflight_casa', titulo: 'Preflight: el video de hoy no tiene portada', dedupKey: 'preflight:suite-off' });
  const rMano = supportCases.openCase(db, { userId: 302, tipo: 'prueba_linea_mano', titulo: 'Línea a mano: entrada de la prueba', dedupKey: 'mano:suite-off' });
  const rDm = supportCases.openCase(db, { userId: 302, tipo: 'prueba_retorno_dm', titulo: 'Retorno: mandar el link de regreso', dedupKey: 'retorno:suite-off' });
  const dOff = supportCases.divertToConcierge(db, 301, 'Hola, ¿me cambian la foto del posteo?');
  await sleep(200);
  t('B1 los casos nacen igual (preflight, línea a mano, retorno_dm, conserje) y NINGUNO avisa', rPf.ok && rMano.ok && rDm.ok && dOff.ok && captura.length === 0, 'captura=' + captura.length);

  // B2 · el hook de la idea, cortocircuitado en su entrada.
  const rIdeaOff = await pushOperador.hookPedido(db, { user_id: 303, business_name: 'Idea Bar', es_idea: true, idea_id: 77, id: 555, posteo: null });
  t('B2 el hook de la idea devuelve avisos_apagados y no manda nada', rIdeaOff.ok === false && rIdeaOff.reason === 'avisos_apagados' && captura.length === 0, JSON.stringify(rIdeaOff));

  // B3 · el hook del posteo fallido, cortocircuitado en su entrada.
  const rFalloOff = await pushOperador.hookFallo(db, { user_id: 302, post_id: 9001 });
  t('B3 el hook del posteo fallido devuelve avisos_apagados y no manda nada', rFalloOff.ok === false && rFalloOff.reason === 'avisos_apagados' && captura.length === 0, JSON.stringify(rFalloOff));

  // B4 · el embudo mismo: ni con transporte inyectado se toca la red.
  let llamadasOff = 0;
  const rEmbudoOff = await pushOperador.avisarOperador(db, { clave: 'suite-off-embudo', title: 'Conserje', body: 'Prueba', url: '/conserje' }, { sendFn: async () => { llamadasOff++; return { ok: true, sent: 1 }; } });
  t('B4 el embudo cortocircuita ANTES del transporte y del reclamo', rEmbudoOff.ok === false && rEmbudoOff.reason === 'avisos_apagados' && llamadasOff === 0 && captura.length === 0, JSON.stringify(rEmbudoOff) + ' llamadas=' + llamadasOff);

  // B5 · el hook de casos directo, también en su entrada.
  const rCasoOff = await pushOperador.hookCaso(db, { id: 999, user_id: 302, tipo: 'conserje' });
  t('B5 el hook de casos devuelve avisos_apagados y no manda nada', rCasoOff.ok === false && rCasoOff.reason === 'avisos_apagados' && captura.length === 0, JSON.stringify(rCasoOff));

  // B6 · el barrido completo, con la superficie sembrada (pedido +
  // idea sin revisar + los casos de arriba): resumen en cero.
  const mPed = db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (302, 'user', '¿Me arman un posteo con la foto nueva?', 'general', 0)").run();
  const mIdea = db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (303, 'user', 'Quiero un posteo del combo del finde', 'general', 0)").run();
  db.prepare("INSERT INTO subir_ideas (user_id, message_id, texto, asset_ids, estado) VALUES (303, ?, 'Quiero un posteo del combo del finde', '', 'recibida')").run(Number(mIdea.lastInsertRowid));
  const bOff = await pushOperador.barrido(db, {});
  t('B6 el barrido con todo sembrado no avisa nada ni cuenta nada', bOff.casos === 0 && bOff.pedidos === 0 && bOff.enviados === 0 && captura.length === 0, JSON.stringify(bOff) + ' captura=' + captura.length);

  // B7 · la prueba de fondo: tras TODOS los eventos de arriba, la
  // tabla de dedup tiene CERO filas reclamadas (ensureSchema se
  // llama acá solo para poder contar: crear la tabla vacía no es
  // reclamar ninguna clave).
  pushOperador.ensureSchema(db);
  const filasOff = db.prepare('SELECT COUNT(*) AS c FROM operador_avisos').get().c;
  t('B7 cero filas reclamadas en operador_avisos tras todos los eventos', filasOff === 0, 'filas=' + filasOff);

  // ---------------------------------------------------------------
  seccion('C · boot real por HTTP — la suscripción del operador');
  let PORT = 0;
  const puertoLibre = (p) => {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      return !out.split('\n').some((l) => l.includes(':' + p + ' '));
    } catch (e) { return false; }
  };
  for (let p = 34751; p < 34770; p++) if (puertoLibre(p)) { PORT = p; break; }
  t('C0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'push-operador-boot-'));
  const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
require(process.argv[3] + '/guest-trial').ensureSchema(db);
const now = Date.now(); const DIA = 86400000;
db.prepare("INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, created_at) VALUES (12, 'dueno@posty.test', 'x', 'posty', 'trial', 0, 0, 0, ?, ?, '2026-09-01 10:00:00')").run(now - 40 * DIA, now - 37 * DIA);
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (12, ?, ?, ?)')
  .run('Posty', 'posty.communitymanager', '');
db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (12, 'America/New_York', '')").run();
console.log('seed ok');
`;
  const seedFile = path.join(os.tmpdir(), 'push-operador-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });
  const TOKEN = 'boot-test-token-operador';
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
      if (!up) await sleep(500);
    }
    t('C1 el servidor levanta en el puerto libre', up, serverLog.slice(-200));

    const sinToken = await fetch(base + '/api/admin/conserje/push/estado');
    t('C2 sin token admin, la puerta no pasa', sinToken.status === 403, 'status=' + sinToken.status);

    const est0 = await (await fetch(base + '/api/admin/conserje/push/estado?token=' + TOKEN)).json();
    t('C3 el estado nace sin suscripción', est0.ok === true && est0.suscrito === false, JSON.stringify(est0));

    const sub = await fetch(base + '/api/admin/conserje/push/suscribir?token=' + TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example.com/operador-1', keys: { p256dh: 'clave-p', auth: 'clave-a' } }),
    });
    const subJ = await sub.json();
    t('C4 la suscripción se guarda atada al operador (user 12)', sub.status === 200 && subJ.ok === true && subJ.user_id === 12, JSON.stringify(subJ));

    const subMala = await fetch(base + '/api/admin/conserje/push/suscribir?token=' + TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'http://inseguro.example.com/x', keys: {} }),
    });
    t('C5 un endpoint que no es https se rechaza', subMala.status === 400, 'status=' + subMala.status);

    const sub2 = await fetch(base + '/api/admin/conserje/push/suscribir?token=' + TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example.com/operador-1', keys: { p256dh: 'clave-p2', auth: 'clave-a2' } }),
    });
    t('C6 re-suscribir el mismo dispositivo actualiza, no duplica', sub2.status === 200, 'status=' + sub2.status);

    const est1 = await (await fetch(base + '/api/admin/conserje/push/estado?token=' + TOKEN)).json();
    t('C7 el estado refleja la suscripción', est1.ok === true && est1.suscrito === true, JSON.stringify(est1));

    const html = await (await fetch(base + '/conserje?token=' + TOKEN)).text();
    t('C8 /conserje sirve con el sello v=30 y el botón de avisos', html.includes('/conserje.js?v=30') && html.includes('id="btnOpPush"'));
  } finally {
    try { process.kill(serverPid, 'SIGTERM'); } catch (e) { /* ya murió */ }
    await sleep(800);
    let vivo = true;
    try { process.kill(serverPid, 0); } catch (e) { vivo = false; }
    t('C9 el servidor murió por su PID exacto', !vivo);
  }

  // ---------------------------------------------------------------
  seccion('D · la base, con el servidor apagado');
  const CHECK_DB = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
const out = {};
out.subs = db.prepare("SELECT user_id, endpoint, transport FROM push_subscriptions").all();
console.log(JSON.stringify(out));
`;
  const checkFile = path.join(os.tmpdir(), 'push-operador-check-' + process.pid + '.js');
  fs.writeFileSync(checkFile, CHECK_DB);
  const outD = JSON.parse(execFileSync(process.execPath, [checkFile, tmpD, ROOT], { encoding: 'utf8' }).trim().split('\n').pop());
  t('D1 una sola suscripción, atada al 12 y por webpush', outD.subs.length === 1 && outD.subs[0].user_id === 12 && outD.subs[0].endpoint === 'https://push.example.com/operador-1' && outD.subs[0].transport === 'webpush', JSON.stringify(outD.subs));

  // ---------------------------------------------------------------
  seccion('E · mundo PRENDIDO — el comportamiento de v1391 sigue intacto');
  // Proceso hijo con OPERADOR_AVISOS=on seteada ANTES de requerir el
  // módulo: ahí la taxonomía de urgentes manda como en v1391. El
  // hijo imprime sus propias líneas ok/MAL y su RESULTADO_ON, que el
  // padre suma a la cuenta de la suite.
  const RUNNER_ON = `
process.env.DATA_DIR = process.argv[2];
var ROOT = process.argv[3];
var db = require(ROOT + '/db');
require(ROOT + '/guest-trial').ensureSchema(db);
var push = require(ROOT + '/push');
push.initPush(db);
var sendReal = push.sendPush;
var captura = [];
push.sendPush = async function (uid, payload) { captura.push([uid, payload]); return { ok: true, sent: 1 }; };
var pushOperador = require(ROOT + '/push-operador');
var supportCases = require(ROOT + '/support-cases');
var ok = 0, mal = 0;
function t(n, c, x) { if (c) { ok++; console.log('  ok  ' + n); } else { mal++; console.log('  MAL ' + n + (x ? ' — ' + x : '')); } }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var DIA = 86400000; var now = Date.now();
function usuario(id, email, planStatus, nombre, ig, concierge, started, ends) {
  db.prepare("INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, created_at) VALUES (?, ?, 'x', 'posty', ?, 0, ?, 0, ?, ?, '2026-09-01 10:00:00')")
    .run(id, email, planStatus, concierge ? 1 : 0, started != null ? started : null, ends != null ? ends : null);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)')
    .run(id, nombre || '', ig || '', '');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(12, 'dueno@posty.test', 'trial', 'Posty', 'posty.communitymanager', false, now - 40 * DIA, now - 37 * DIA);
usuario(301, 'conserje@test', 'active', 'Café Conserje', 'cafeconserje', true, null, null);
usuario(302, 'pago@test', 'active', 'Pago Real', 'pagoreal', false, null, null);
usuario(303, 'idea@test', 'active', 'Idea Bar', 'ideabar', false, null, null);
(async function () {
  t('ON0 con la env en «on», el interruptor está prendido', pushOperador.avisosActivos() === true);
  var rPf = supportCases.openCase(db, { userId: 12, tipo: 'preflight_casa', titulo: 'Preflight: el video de hoy no tiene portada', dedupKey: 'preflight:suite-on' });
  await sleep(150);
  t('ON1 el caso preflight nace pero NO avisa (es un riesgo, no una urgencia)', rPf.ok && captura.length === 0, 'captura=' + captura.length);
  var rMano = supportCases.openCase(db, { userId: 302, tipo: 'prueba_linea_mano', titulo: 'Línea a mano: entrada de la prueba', dedupKey: 'mano:suite-on' });
  await sleep(150);
  t('ON2 el caso de línea a mano nace pero NO avisa (es la cola de trabajo)', rMano.ok && captura.length === 0, 'captura=' + captura.length);
  var rDm = supportCases.openCase(db, { userId: 302, tipo: 'prueba_retorno_dm', titulo: 'Retorno: mandar el link de regreso', dedupKey: 'retorno:suite-on' });
  await sleep(150);
  t('ON3 el caso retorno_dm SÍ avisa al operador (user 12), con su link al cliente', rDm.ok && captura.length === 1 && captura[0][0] === 12 && captura[0][1].url === '/conserje?user=302' && captura[0][1].title === 'Conserje' && /link de regreso/.test(captura[0][1].body), JSON.stringify(captura).slice(0, 260));
  var rDm2 = supportCases.openCase(db, { userId: 302, tipo: 'prueba_retorno_dm', titulo: 'otra vez', dedupKey: 'retorno:suite-on' });
  await sleep(150);
  t('ON3b el mismo caso (dedup_key) no avisa dos veces', rDm2.ok && rDm2.duplicado === true && captura.length === 1, 'captura=' + captura.length);
  var rAyuda = supportCases.openCase(db, { userId: 302, tipo: 'ayuda', titulo: 'Ayuda pedida', dedupKey: 'ayuda:suite-on' });
  await sleep(150);
  t('ON4 un tipo fuera de los urgentes no avisa', rAyuda.ok && captura.length === 1, 'captura=' + captura.length);
  var d1 = supportCases.divertToConcierge(db, 301, 'Hola, ¿me cambian la foto del posteo?');
  await sleep(150);
  var d2 = supportCases.divertToConcierge(db, 301, '¿Y también el horario?');
  await sleep(150);
  t('ON5 el mensaje en modo conserje avisa una sola vez por cliente', d1.ok && d2.ok && captura.length === 2 && captura[1][1].url === '/conserje?user=301' && /Café Conserje/.test(captura[1][1].body), 'captura=' + captura.length);
  var rSin = await pushOperador.avisarOperador(db, { clave: 'suite-on-sin-sub', title: 'Conserje', body: 'Prueba', url: '/conserje' }, { sendFn: sendReal });
  var filaSin = db.prepare("SELECT COUNT(*) AS c FROM operador_avisos WHERE clave = 'suite-on-sin-sub'").get().c;
  t('ON6 sin suscripción: no_subs, nada enviado y la clave queda libre', rSin.ok === false && rSin.reason === 'no_subs' && filaSin === 0, JSON.stringify(rSin));
  var rCon = await pushOperador.avisarOperador(db, { clave: 'suite-on-sin-sub', title: 'Conserje', body: 'Prueba', url: '/conserje' }, {});
  t('ON7 con transporte, la misma clave avisa (no quedó quemada)', rCon.ok === true && captura.length === 3, JSON.stringify(rCon) + ' captura=' + captura.length);
  var rDup = await pushOperador.avisarOperador(db, { clave: 'suite-on-sin-sub', title: 'Conserje', body: 'Prueba', url: '/conserje' }, {});
  t('ON8 y avisada, no se repite', rDup.ok === false && rDup.reason === 'duplicado' && captura.length === 3, JSON.stringify(rDup));
  var rIdea = await pushOperador.hookPedido(db, { user_id: 303, business_name: 'Idea Bar', es_idea: true, idea_id: 77, id: 555, posteo: null });
  t('ON9 la idea nueva avisa con su negocio y su link', rIdea.ok === true && captura.length === 4 && captura[3][1].url === '/conserje?user=303' && /Idea Bar/.test(captura[3][1].body) && /idea escrita/.test(captura[3][1].body), JSON.stringify(captura[3] && captura[3][1]));
  db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (302, 'user', '¿Me arman un posteo con la foto nueva?', 'general', 0)").run();
  var mIdea = db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (303, 'user', 'Quiero un posteo del combo del finde', 'general', 0)").run();
  db.prepare("INSERT INTO subir_ideas (user_id, message_id, texto, asset_ids, estado) VALUES (303, ?, 'Quiero un posteo del combo del finde', '', 'recibida')").run(Number(mIdea.lastInsertRowid));
  var antes = captura.length;
  var b1 = await pushOperador.barrido(db, {});
  var nuevos = captura.slice(antes);
  var urls = nuevos.map(function (c) { return c[1].url; }).sort();
  t('ON10 el barrido avisa el pedido y la idea sin revisar (y no repite lo del hook)', nuevos.length === 2 && urls.includes('/conserje?user=302') && urls.includes('/conserje?user=303'), JSON.stringify(nuevos).slice(0, 260) + ' barrido=' + JSON.stringify(b1));
  var b2 = await pushOperador.barrido(db, {});
  t('ON11 el segundo barrido no duplica ningún aviso', captura.length === antes + 2 && b2.enviados === 0, 'captura=' + captura.length + ' ' + JSON.stringify(b2));
  var schedManana = new Date('2026-12-03T19:00:00-05:00').toISOString();
  db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at) VALUES (302, '/media/seed.jpg', 'La pieza de mañana', 'scheduled', 'image', ?)").run(schedManana);
  var antesCorte = captura.length;
  var b3 = await pushOperador.barrido(db, {});
  t('ON12 la pieza esperando decisión NO avisa nunca', captura.length === antesCorte && b3.enviados === 0, JSON.stringify(b3) + ' captura=' + captura.length);
  var antesFallo = captura.length;
  var rF1 = await pushOperador.hookFallo(db, { user_id: 302, post_id: 9001 });
  var f1 = captura[antesFallo];
  t('ON13 el posteo fallido avisa UNA vez, al operador, con su link al cliente y al posteo', rF1.ok === true && captura.length === antesFallo + 1 && f1[0] === 12 && f1[1].title === 'Conserje' && f1[1].body === 'El posteo de hoy de Pago Real no salió.' && f1[1].url === '/conserje?user=302&post=9001', JSON.stringify(rF1) + ' ' + JSON.stringify(f1));
  var rF2 = await pushOperador.hookFallo(db, { user_id: 302, post_id: 9001 });
  t('ON14 el mismo posteo no avisa dos veces (dedup por posteo)', rF2.ok === false && rF2.reason === 'duplicado' && captura.length === antesFallo + 1, JSON.stringify(rF2));
  var rF3 = await pushOperador.hookFallo(db, { user_id: 302, post_id: 9002 }, { sendFn: sendReal });
  var filaF = db.prepare("SELECT COUNT(*) AS c FROM operador_avisos WHERE clave = 'fallo-9002'").get().c;
  t('ON15 sin suscripción, el fallo no se manda y su clave no se quema', rF3.ok === false && rF3.reason === 'no_subs' && filaF === 0 && captura.length === antesFallo + 1, JSON.stringify(rF3));
  var rF4 = await pushOperador.hookFallo(db, { user_id: 302, post_id: 9002 });
  t('ON16 con transporte, ese mismo posteo avisa (la clave quedó libre)', rF4.ok === true && captura.length === antesFallo + 2 && captura[antesFallo + 1][1].url === '/conserje?user=302&post=9002', JSON.stringify(rF4));
  console.log('RESULTADO_ON ok=' + ok + ' mal=' + mal);
  process.exit(mal ? 1 : 0);
})().catch(function (e) { console.error('EXCEPCIÓN ON', e); console.log('RESULTADO_ON ok=' + ok + ' mal=' + (mal + 1)); process.exit(1); });
`;
  const tmpE = fs.mkdtempSync(path.join(os.tmpdir(), 'push-operador-on-'));
  const runnerFile = path.join(os.tmpdir(), 'push-operador-runner-on-' + process.pid + '.js');
  fs.writeFileSync(runnerFile, RUNNER_ON);
  const envOn = { ...process.env, OPERADOR_AVISOS: 'on' };
  delete envOn.DATA_DIR;
  let outE = '';
  let exitE = 0;
  try {
    outE = execFileSync(process.execPath, [runnerFile, tmpE, ROOT], { encoding: 'utf8', env: envOn });
  } catch (e) {
    exitE = e.status || 1;
    outE = String(e.stdout || '');
    if (e.stderr) console.log(String(e.stderr).slice(-400));
  }
  console.log(outE.trim());
  const mE = /RESULTADO_ON ok=(\d+) mal=(\d+)/.exec(outE);
  if (mE) { ok += Number(mE[1]); mal += Number(mE[2]); }
  t('E0 el mundo prendido corrió completo en su propio proceso', !!mE && exitE === 0, 'exit=' + exitE);

  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN', e); console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); });
