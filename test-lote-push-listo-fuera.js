// test-lote-push-listo-fuera.js — Suite del lote PUSH-LISTO-FUERA
// (2026-11-22): muere entera la clase «posteo listo» de pushes — el
// aviso de las 3 horas («Tu posteo de las 19:00 está listo 👀 / Sale
// solo en 3 horas salvo que me digas lo contrario.», el que le llegó
// al dueño a las 16:00) y el aviso de las 9:00 («Hoy sale este — sale
// a las …» / «Today's post is ready — goes out at …»).
// ACTUALIZACIÓN (LOTE PUSH-MANANA-VUELVE · 2026-11-27): por decisión
// explícita del dueño («Reactivemosla!»), la push de las 9:00 VUELVE
// — excepción puntual a la doctrina del 22/11, porque la pieza del
// feed «Las dos notificaciones» (29/11) la muestra y el producto
// tiene que hacer lo que la pieza promete. El aviso de las 3 horas
// SIGUE MUERTO. Esta suite pasa a afirmar la verdad nueva completa:
//   A · Estática — el emisor de las 3 horas no existe; la matutina
//       vuelve a enviar (pushFn + default sendPush cableados); las
//       clases que se quedan (tanda, problema, resultado de pedido,
//       publicado) siguen cableadas y byte-intactas.
//   B · Aprobación — el camino scheduler → approval → notify-push no
//       produce ningún push «listo» a ninguna hora; el push de
//       problema (no salió por falta de aprobación) sigue saliendo.
//   C · Matutina — el barrido de las 9:00 sigue garantizando el
//       posteo del día (ensureTodayPost) y envía la push UNA vez por
//       cuenta por día (dedup durable), con el texto, la hora real
//       de salida y la foto del posteo; textos ES/EN y filtros del
//       pick (rechazado fuera, pendiente dentro) intactos.
//   D · Tanda — la decisión de aviso de la bandeja sigue viva: un
//       aviso por tanda, al formarse.
//   E · Boot real — el servidor levanta con la verdad nueva puesta.
// El punto de envío se verifica en el código de decisión con el
// transporte grabado (sin VAPID real ni servicios externos), como
// declara el CENSO del lote. Contra el árbol del 22/11 (corte sin
// revertir), C falla: no sale ninguna push de las 9:00.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function portFree(p) {
  try { return !execFileSync('ss', ['-ltn'], { encoding: 'utf8' }).includes(':' + p + ' '); }
  catch (e) { return true; }
}
function freePort() { for (let p = 36400; p < 36600; p++) { if (portFree(p)) return p; } return 0; }

// ---------------------------------------------------------------- A
console.log('\nA · Estática');
{
  const np = read('notify-push.js');
  const mp = read('morning-post-push.js');
  const sch = read('scheduler.js');
  const srv = read('server.js');
  const ap = read('approval.js');
  ok('A1 el emisor de las 3 horas no existe: notify-push.js sin la función sendApprovalPush ni sus textos de envío',
    !np.includes('async function sendApprovalPush') && !np.includes('`Tu posteo de las ${hour} está listo') && !np.includes("'Sale solo en 3 horas salvo que me digas lo contrario.'"));
  ok('A2 el push de problema se queda: sendMissedPush definida y exportada en notify-push.js',
    np.includes('async function sendMissedPush') && np.includes('sendMissedPush }'));
  ok('A3 la matutina VUELVE a enviar (PUSH-MANANA-VUELVE): morning-post-push.js llama a pushFn y su default es el sendPush real de push.js',
    mp.includes('await pushFn(') && mp.includes("require('./push').sendPush") && !mp.includes('res.suppressed++'));
  ok('A4 la garantía de las 9:00 sigue cableada: scheduler llama sendMorningPostPush con ensureTodayPost',
    sch.includes('mpp.sendMorningPostPush(db, { ensureTodayPost: ensureFn })'));
  ok('A5 la tanda se queda: el notify de bandeja sigue en scheduler.js y en server.js («respuestas listas para aprobar»)',
    sch.includes('respuestas listas para aprobar') && srv.includes('respuestas listas para aprobar'));
  ok('A6 el problema se queda: notifyPostFailed sigue en push.js y approval.notifyMissed sigue despachando',
    read('push.js').includes('notifyPostFailed') && ap.includes('sendMissedPush'));
  ok('A7 el resultado de un pedido se queda: server.js conserva «El cambio que pediste está listo»',
    srv.includes('El cambio que pediste está listo'));
  ok('A8 el publicado se queda: scheduler.js conserva el push «ya salió» de cada publicación',
    sch.includes('notifyPushPublished') && sch.includes('ya sali'));
  ok('A9 el barrido de aprobación sigue existiendo (lo que muere es su canal push, no el barrido)',
    sch.includes('processApprovalNotifications') && ap.includes('notifyApproval'));
}

// ------------------------------------------------------- setup módulo
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pushfuera-mod-'));
process.env.DATA_DIR = TMP;
const db = require('./db');
// El transporte se graba ANTES de cargar approval/scheduler/notify-push:
// notify-push captura sendPush al cargarse, así que el parche manda.
const pushCalls = [];
const pushMod = require('./push');
pushMod.sendPush = async (uid, payload) => { pushCalls.push({ uid, payload }); return { ok: true, sent: 1 }; };
const approval = require('./approval');
const scheduler = require('./scheduler');
const morning = require('./morning-post-push');
const bandeja = require('./bandeja');

function seedUser(email, tz, demoMode) {
  const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x');
  const uid = Number(r.lastInsertRowid);
  db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
  db.prepare('INSERT INTO settings (user_id, demo_mode, timezone) VALUES (?, ?, ?)').run(uid, demoMode, tz);
  return uid;
}
function seedPost(uid, scheduledAt) {
  const r = db.prepare(`INSERT INTO posts (user_id, caption, image_path, media_type, status, approval, notified, scheduled_at)
    VALUES (?, 'Posteo de prueba', '/media/prueba.jpg', 'image', 'scheduled', 'pending', 0, ?)`).run(uid, scheduledAt);
  return Number(r.lastInsertRowid);
}
const utcStr = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

(async () => {
  // ---------------------------------------------------------------- B
  console.log('\nB · Aprobación (el push de las 16:00)');
  const uidB = seedUser('aprobacion@pushfuera.test', 'America/New_York', 0);
  const postB = seedPost(uidB, utcStr(new Date(Date.now() + 2 * 3600 * 1000)));
  const rowB = db.prepare('SELECT * FROM posts WHERE id = ?').get(postB);
  const rB1 = await approval.notifyApproval(db, rowB);
  ok('B1 notifyApproval NO produce ningún push (0 llamadas al transporte)',
    pushCalls.length === 0, 'llamadas=' + pushCalls.length);
  ok('B2 el canal del aviso ya no es push', rB1 && rB1.channel !== 'push', JSON.stringify(rB1));
  const postB2 = seedPost(uidB, utcStr(new Date(Date.now() + 3 * 3600 * 1000)));
  const rowB2 = db.prepare('SELECT * FROM posts WHERE id = ?').get(postB2);
  await approval.notifyMissed(db, rowB2, 'trust_0');
  ok('B3 el push de PROBLEMA sigue saliendo (no se publicó por falta de aprobación)',
    pushCalls.length === 1 && /No publiqué tu posteo/.test(pushCalls[0].payload.title || ''),
    JSON.stringify(pushCalls.map(c => c.payload.title)));
  const postB3 = seedPost(uidB, utcStr(new Date(Date.now() + 150 * 60 * 1000)));
  const antes = pushCalls.length;
  const rB3 = await scheduler.processApprovalNotifications(db);
  ok('B4 el barrido de aprobación no envía ningún push «listo» (sent=0, transporte intacto)',
    rB3 && rB3.sent === 0 && pushCalls.length === antes && !pushCalls.some(c => /está listo/.test(c.payload.title || '')),
    'sent=' + (rB3 && rB3.sent));

  // ---------------------------------------------------------------- C
  console.log('\nC · Matutina (el push de las 9:00 — volvió el 27/11)');
  const uidC = seedUser('matutina@pushfuera.test', 'UTC', 0);
  db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, keys_json) VALUES (?, 'https://push.example/x', '{}')").run(uidC);
  const hoyUTC = new Date().toISOString().slice(0, 10);
  const postC = seedPost(uidC, hoyUTC + ' 19:00:00');
  const morningCalls = [];
  let ensureCalls = 0;
  const depsC = {
    now: new Date(hoyUTC + 'T09:30:00Z'),
    pushFn: async (uid, payload) => { morningCalls.push({ uid, payload }); return { ok: true, sent: 1 }; },
    ensureTodayPost: async () => { ensureCalls++; },
  };
  const rC = await morning.sendMorningPostPush(db, depsC);
  ok('C1 el barrido de las 9:00 ENVÍA la push, una sola (sent=1)', morningCalls.length === 1 && rC.sent === 1,
    'envios=' + morningCalls.length + ' sent=' + rC.sent);
  const plC = (morningCalls[0] || {}).payload || {};
  ok('C2 el payload es el de la pieza: «Hoy sale este — sale a las 19:00», abre el ritual, con la foto del posteo y su postId',
    plC.title === 'Posty' && plC.body === 'Hoy sale este — sale a las 19:00' && plC.url === '/#/app/ritual'
      && plC.image === 'https://postycommunitymanager.com/media/prueba.jpg' && plC.data && plC.data.postId === String(postC),
    JSON.stringify(plC));
  const rC2 = await morning.sendMorningPostPush(db, depsC);
  const marcaC = db.prepare('SELECT post_id FROM morning_post_push WHERE user_id = ? AND day_key = ?').get(uidC, hoyUTC);
  ok('C3 dedup durable: el segundo barrido del día no reenvía y la marca quedó con el posteo del día',
    rC2.sent === 0 && morningCalls.length === 1 && !!marcaC && Number(marcaC.post_id) === postC,
    'sent2=' + rC2.sent + ' marca=' + JSON.stringify(marcaC));
  ok('C4 la garantía de las 9:00 sigue viva: ensureTodayPost corrió para la cuenta', ensureCalls === 1, 'ensure=' + ensureCalls);
  const tEs = morning.morningText('es', '19:00');
  const tEn = morning.morningText('en', '7:00 PM');
  ok('C5 los textos viven en los dos idiomas (ES/EN)',
    tEs.body === 'Hoy sale este — sale a las 19:00' && tEn.body === "Today's post is ready — goes out at 7:00 PM",
    JSON.stringify({ tEs, tEn }));
  const pickC = morning.pickTodayPost([
    { id: 901, status: 'scheduled', scheduled_at: hoyUTC + ' 18:00:00', approval: 'rejected' },
    { id: 902, status: 'scheduled', scheduled_at: hoyUTC + ' 19:00:00', approval: 'pending' },
  ], 'UTC', new Date(hoyUTC + 'T09:30:00Z'));
  ok('C6 el pick conserva sus filtros: el rechazado en revisión queda fuera, el pendiente (sin revisar) entra',
    !!pickC && pickC.id === 902, JSON.stringify(pickC));

  // ---------------------------------------------------------------- D
  console.log('\nD · Tanda (la clase que se queda, viva)');
  const uidD = (() => {
    const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('tanda@pushfuera.test', 'x');
    const uid = Number(r.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc')").run(uid);
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
    db.prepare("INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)").run(uid, JSON.stringify({ horarios: 'Lun a Vie 9 a 20' }));
    return uid;
  })();
  const notifyCalls = [];
  const depsD = {
    credsOf: () => ({ igUserId: 'IGBIZ', accessToken: 'tok-falso', igUsername: 'thecoffeebardc' }),
    suggestFn: () => async () => ({ reply: '¡Hola Sofi! Hoy estamos hasta las 20.', needsHuman: false, reason: '' }),
    apiKeyOf: () => '',
    notify: (uid, info) => notifyCalls.push({ uid, ...info }),
    fetchers: {
      fetchMedia: async () => [{ id: 'POST1', caption: 'El posteo del día', thumb: '', timestamp: new Date().toISOString() }],
      fetchComments: async () => [{ id: 'c1', text: '¿hasta qué hora están hoy?', username: 'sofi.m', timestamp: new Date().toISOString(), replies: [] }],
      fetchConversations: async () => [],
      sendCommentReply: async () => ({ id: 'r1' }),
      sendDm: async () => ({ id: 'dm1' }),
      hideComment: async () => ({ ok: true }),
    },
  };
  const rD = await bandeja.pollBandeja(db, depsD, { onlyUser: uidD });
  ok('D1 la tanda se forma y su decisión de aviso dispara UNA vez (n=1)',
    notifyCalls.length === 1 && notifyCalls[0].n === 1, 'avisos=' + JSON.stringify(notifyCalls) + ' errores=' + JSON.stringify(rD.errors));

  // ---------------------------------------------------------------- E
  console.log('\nE · Boot real');
  const port = freePort();
  ok('E0 el puerto del boot está libre antes de arrancar', port > 0 && portFree(port));
  const dirE = fs.mkdtempSync(path.join(os.tmpdir(), 'pushfuera-boot-'));
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dirE, MEDIA_DIR: path.join(dirE, 'media'), ADMIN_TOKEN: 'tok-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  proc.stdout.on('data', d => { bootLog += d; });
  proc.stderr.on('data', d => { bootLog += d; });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); up = r.ok; } catch (e) { await sleep(1000); }
  }
  ok('E1 el servidor levanta con la verdad nueva (matutina viva, 3 horas muerta)', up, bootLog.slice(-300));
  const pid = proc.pid;
  try { process.kill(pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let muerto = false;
  try { process.kill(pid, 0); } catch (e) { muerto = true; }
  ok('E2 el boot muere por su PID exacto y el puerto queda libre', muerto && portFree(port));

  console.log(`\n== RESULTADO: ${pass} ok · ${fail} MAL ==`);
  if (fails.length) { console.log('Fallaron:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
