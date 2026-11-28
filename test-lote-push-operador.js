'use strict';

// =====================================================================
// LOTE CONSERJE-PUSH-OPERADOR — suite del lote (censo-conserje-3 §5.5)
// =====================================================================
// Los avisos del operador con el teléfono bloqueado: la suscripción
// queda atada a la identidad del operador (la casa, user 12) por una
// puerta admin propia; los hooks avisan cuando nace lo que hoy solo
// ve el monitor — caso nuevo en pendientes (incluido preflight_casa),
// idea/pedido nuevo sin revisar, pieza de mañana esperando decisión
// pasada la hora de corte (la ventana de revisión abre 19:00, hora
// del dueño) — cada push con su deep link a la ficha del negocio.
// Dedup durable por clave estable: un evento repetido no duplica el
// aviso; sin suscripción no se manda nada y la clave no se quema.
//   A · Estática de las puntadas (módulo, hook en openCase, rutas,
//       hook de la idea, barrido en el scheduler, cliente, sello).
//   B · Módulo contra DB temporal con transporte capturado: el hook
//       de casos (nace → avisa; duplicado → no; tipo fuera de
//       pendientes → no), el desvío a conserje, el núcleo sin
//       suscripción, el hook de la idea y el barrido completo
//       (pedidos + idea + decisión tras el corte, sin repetir).
//   C · Boot real por HTTP: la puerta de suscripción ata la fila al
//       12, el estado la refleja, sin token no pasa, sello v=30.
//   D · La base, tras matar el servidor por su PID exacto.
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
t('A1 el módulo existe con su dedup durable y sus tres fuentes', modSrc.includes('operador_avisos') && modSrc.includes('INSERT OR IGNORE') && modSrc.includes('function hookCaso') && modSrc.includes('function hookPedido') && modSrc.includes('function barrido'));
t('A2 el operador es la casa (user 12) y los tipos con aviso son los de pendientes', modSrc.includes('OPERADOR_USER_ID = 12') && modSrc.includes("'preflight_casa'") && modSrc.includes("'conserje'"));
t('A3 openCase engancha el hook al nacer el caso', scSrc.includes("require('./push-operador').hookCaso(db, caso)"));
t('A4 el server registra la puerta admin de suscripción y el estado', serverSrc.includes("'/api/admin/conserje/push/suscribir'") && serverSrc.includes("'/api/admin/conserje/push/estado'") && serverSrc.includes('pushOperador.OPERADOR_USER_ID'));
t('A5 la ruta de la idea escrita engancha su hook', serverSrc.includes('pushOperador.hookPedido(db, {'));
t('A6 el scheduler corre el barrido junto al del vigía', schedSrc.includes('pushOperador.barrido(db, {})'));
t('A7 el cliente ofrece activar avisos (Más + escritorio) por la puerta admin', jsSrc.includes('data-mact="avisos"') && jsSrc.includes('activarAvisosOperador') && jsSrc.includes('/api/admin/conserje/push/suscribir') && htmlSrc.includes('id="btnOpPush"'));
t('A8 sello conserje.js?v=30', htmlSrc.includes('/conserje.js?v=30'));
t('A9 los textos no llevan tecnicismos (sin «caso #», sin rutas internas en el cuerpo)', !/caso #/.test(modSrc) && modSrc.includes("title: TITULO") && modSrc.includes("'/conserje?user='"));

// ---------------------------------------------------------------------
seccion('B · módulo — hooks y barrido con transporte capturado');
const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'push-operador-mod-'));
process.env.DATA_DIR = tmpB;
const db = require('./db');
require('./guest-trial').ensureSchema(db);
const push = require('./push');
push.initPush(db);
const sendReal = push.sendPush;
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
  // B1–B4 · el hook de casos desde el punto único de apertura.
  const rPf = supportCases.openCase(db, { userId: 12, tipo: 'preflight_casa', titulo: 'Preflight: el video de hoy no tiene portada', dedupKey: 'preflight:suite' });
  await sleep(150);
  t('B1 el caso preflight nace y el hook avisa al operador (user 12)', rPf.ok && captura.length === 1 && captura[0][0] === 12, JSON.stringify(captura).slice(0, 220));
  t('B2 el aviso del preflight lleva su deep link a la casa y título «Conserje»', captura.length === 1 && captura[0][1].url === '/conserje?user=12' && captura[0][1].title === 'Conserje' && /en riesgo/.test(captura[0][1].body), JSON.stringify(captura[0] && captura[0][1]));
  const rPf2 = supportCases.openCase(db, { userId: 12, tipo: 'preflight_casa', titulo: 'otra vez', dedupKey: 'preflight:suite' });
  await sleep(150);
  t('B3 el mismo caso (dedup_key) no avisa dos veces', rPf2.ok && rPf2.duplicado === true && captura.length === 1, 'captura=' + captura.length);
  const rAyuda = supportCases.openCase(db, { userId: 302, tipo: 'ayuda', titulo: 'Ayuda pedida', dedupKey: 'ayuda:suite' });
  await sleep(150);
  t('B4 un tipo fuera de la superficie de pendientes no avisa', rAyuda.ok && captura.length === 1, 'captura=' + captura.length);

  // B5 · el desvío a conserje (mensaje del cliente en modo conserje).
  const d1 = supportCases.divertToConcierge(db, 301, 'Hola, ¿me cambian la foto del posteo?');
  await sleep(150);
  const d2 = supportCases.divertToConcierge(db, 301, '¿Y también el horario?');
  await sleep(150);
  t('B5 el mensaje en modo conserje avisa una sola vez por cliente', d1.ok && d2.ok && captura.length === 2 && captura[1][1].url === '/conserje?user=301' && /Café Conserje/.test(captura[1][1].body), 'captura=' + captura.length + ' ' + JSON.stringify(captura[1] && captura[1][1]));

  // B6 · sin suscripción no se manda nada (transporte real) y la clave no se quema.
  const rSin = await pushOperador.avisarOperador(db, { clave: 'suite-sin-sub', title: 'Conserje', body: 'Prueba', url: '/conserje' }, { sendFn: sendReal });
  const filaSin = db.prepare("SELECT COUNT(*) AS c FROM operador_avisos WHERE clave = 'suite-sin-sub'").get().c;
  t('B6 sin suscripción: no_subs, nada enviado y la clave queda libre', rSin.ok === false && rSin.reason === 'no_subs' && filaSin === 0, JSON.stringify(rSin));
  const rCon = await pushOperador.avisarOperador(db, { clave: 'suite-sin-sub', title: 'Conserje', body: 'Prueba', url: '/conserje' }, {});
  t('B7 con transporte, la misma clave avisa (no quedó quemada)', rCon.ok === true && captura.length === 3, JSON.stringify(rCon) + ' captura=' + captura.length);
  const rDup = await pushOperador.avisarOperador(db, { clave: 'suite-sin-sub', title: 'Conserje', body: 'Prueba', url: '/conserje' }, {});
  t('B8 y avisada, no se repite', rDup.ok === false && rDup.reason === 'duplicado' && captura.length === 3, JSON.stringify(rDup));

  // B9 · el hook de la idea escrita.
  const rIdea = await pushOperador.hookPedido(db, { user_id: 303, business_name: 'Idea Bar', es_idea: true, idea_id: 77, id: 555, posteo: null });
  t('B9 la idea nueva avisa con su negocio y su link', rIdea.ok === true && captura.length === 4 && captura[3][1].url === '/conserje?user=303' && /Idea Bar/.test(captura[3][1].body) && /idea escrita/.test(captura[3][1].body), JSON.stringify(captura[3] && captura[3][1]));

  // B10–B13 · el barrido: pedidos e ideas sin revisar + dedup total.
  const mPed = db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (302, 'user', '¿Me arman un posteo con la foto nueva?', 'general', 0)").run();
  const mIdea = db.prepare("INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (303, 'user', 'Quiero un posteo del combo del finde', 'general', 0)").run();
  db.prepare("INSERT INTO subir_ideas (user_id, message_id, texto, asset_ids, estado) VALUES (303, ?, 'Quiero un posteo del combo del finde', '', 'recibida')").run(Number(mIdea.lastInsertRowid));
  const antes = captura.length;
  const b1 = await pushOperador.barrido(db, { nowMs: Date.UTC(2026, 11, 2, 15, 0) }); // 10:00 NY: ventana cerrada
  const nuevos = captura.slice(antes);
  const urls = nuevos.map((c) => c[1].url).sort();
  t('B10 el barrido avisa el pedido y la idea sin revisar (y no repite lo del hook)', nuevos.length === 2 && urls.includes('/conserje?user=302') && urls.includes('/conserje?user=303'), JSON.stringify(nuevos).slice(0, 260) + ' barrido=' + JSON.stringify(b1));
  const b2 = await pushOperador.barrido(db, { nowMs: Date.UTC(2026, 11, 2, 15, 0) });
  t('B11 el segundo barrido no duplica ningún aviso', captura.length === antes + 2 && b2.enviados === 0, 'captura=' + captura.length + ' ' + JSON.stringify(b2));

  // B12–B13 · la pieza de mañana tras la hora de corte.
  const schedManana = new Date('2026-12-03T19:00:00-05:00').toISOString();
  db.prepare("INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at) VALUES (302, '/media/seed.jpg', 'La pieza de mañana', 'scheduled', 'image', ?)").run(schedManana);
  const antesCorte = captura.length;
  const b3 = await pushOperador.barrido(db, { nowMs: Date.UTC(2026, 11, 2, 23, 0) }); // 18:00 NY: antes del corte
  t('B12 antes de las 19:00 del dueño, la pieza en espera no avisa', captura.length === antesCorte && b3.decisiones === 0, JSON.stringify(b3) + ' captura=' + captura.length);
  const b4 = await pushOperador.barrido(db, { nowMs: Date.UTC(2026, 11, 3, 0, 30) }); // 19:30 NY: ventana abierta
  const dec = captura.slice(antesCorte);
  t('B13 pasada la hora de corte, la pieza avisa con su deep link al posteo', dec.length === 1 && /user=302&post=/.test(dec[0][1].url) && /esperando tu decisión/.test(dec[0][1].body), JSON.stringify(dec).slice(0, 240) + ' ' + JSON.stringify(b4));
  const b5 = await pushOperador.barrido(db, { nowMs: Date.UTC(2026, 11, 3, 1, 0) });
  t('B14 y no se repite en el barrido siguiente', captura.length === antesCorte + 1 && b5.enviados === 0, 'captura=' + captura.length);

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

  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN', e); console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); });
