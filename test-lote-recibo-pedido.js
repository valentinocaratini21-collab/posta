'use strict';

// =====================================================================
// LOTE RECIBO-PEDIDO — suite del lote
// =====================================================================
// Regla del dueño (28/11/2026 00:50): «Pedí algo por mensaje y no
// apareció nada de recibido ni que Posty ya está trabajando en eso».
// La tira del posteo/semana guarda el pedido del cliente y — por la
// regla del 17/11 — el programa no contesta nada hasta que bamboo lo
// resuelve a mano: el cliente miraba el silencio. Desde este lote,
// apenas el mensaje queda guardado (POST /api/chat/hilo/log), Posty
// responde EN EL MISMO HILO con el acuse fijo:
//   ES «Recibido ✓ — ya estoy trabajando en eso.»
//   EN "Got it ✓ — I'm already working on it."
//   A · Función pura: las plantillas pasan el filtro chatLimpio
//       byte a byte (sin tecnicismos por diseño).
//   B · Estática del cableado: el helper pzChatReciboPedido existe,
//       el hook corre en la ruta real DESPUÉS del guardado del
//       asistente del mismo turno, el alcance es post/semana, y la
//       paridad BUILD_ID (server.js) == PZ_BUILD (public/app.js).
//   C · Boot real por HTTP: cliente ES manda el pedido EXACTO del
//       caso real (mensaje 1119, «Lo podes mejorar aun mas ?») y el
//       acuse aparece en su hilo; un acuse por mensaje, nunca dos;
//       semana también; general NO; si el turno ya trajo respuesta
//       del asistente, no hay acuse (sin doble charla); cliente EN
//       recibe el acuse en inglés; la cola pedidos-voz sigue
//       mostrando el pedido PENDIENTE con respuesta = el acuse (lo
//       que la cola muestra con verdad: entregado ≠ revisado) y los
//       ticks del cliente siguen en ✓ simple (visto=0: el acuse NO
//       marca revisión).
//   D · La base tras matar el servidor por su PID exacto: ninguna
//       fila en support_voz_pedidos nació del acuse, ninguna push ni
//       evento de push se creó, y el conteo de acuses es exacto.
// Uso: node test-lote-recibo-pedido.js — sale 0 si todo pasa.
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

const ACK_ES = 'Recibido ✓ — ya estoy trabajando en eso.';
const ACK_EN = "Got it ✓ — I'm already working on it.";
const PEDIDO_REAL = 'Lo podes mejorar aun mas ?';

// ---------------------------------------------------------------------
seccion('A · la función pura (chatLimpio sobre las plantillas)');
const chatLimpio = require(path.join(ROOT, 'chat-limpio'));
const L = chatLimpio.limpiarRespuestaCliente;
t('A1 la plantilla ES pasa el filtro byte a byte', L(ACK_ES) === ACK_ES, L(ACK_ES));
t('A2 la plantilla EN pasa el filtro byte a byte', L(ACK_EN) === ACK_EN, L(ACK_EN));
t('A3 ninguna plantilla lleva tecnicismos (ids, rutas, archivos)',
  !/\/media\/|material\s+#?\d|\.mp4|\.jpg/i.test(ACK_ES) && !/\/media\/|material\s+#?\d|\.mp4|\.jpg/i.test(ACK_EN));

// ---------------------------------------------------------------------
seccion('B · estática del cableado');
const serverSrc = read('server.js');
const appSrc = read('public/app.js');
t('B1 el helper pzChatReciboPedido existe', serverSrc.includes('function pzChatReciboPedido(uid, userMsgId, hilo, postId)'));
t('B2 el alcance es solo post/semana', serverSrc.includes("if (hilo !== 'post' && hilo !== 'semana') return 0;"));
t('B3 la plantilla ES exacta vive en el helper', serverSrc.includes("'Recibido ✓ — ya estoy trabajando en eso.'"));
t('B4 la plantilla EN exacta vive en el helper', serverSrc.includes('"Got it ✓ — I\'m already working on it."'));
t('B5 el idioma sale de langOfUser', serverSrc.includes("langOfUser(uid) === 'en' ? \"Got it ✓"));
t('B6 el acuse guardado pasa por chatLimpio', serverSrc.includes('chatLimpio.limpiarRespuestaCliente(ack)'));
t('B7 el hook corre en la ruta del hilo, tras guardar el asistente del turno',
  serverSrc.includes('const reciboId = userMsgId ? pzChatReciboPedido(uid, userMsgId, hilo, pid) : 0;')
  && serverSrc.indexOf('pzChatReciboPedido(uid, userMsgId, hilo, pid)') > serverSrc.indexOf('limpiarRespuestaCliente(asstText)'));
t('B8 la guarda anti-doble-charla: cualquier respuesta posterior al mensaje frena el acuse',
  serverSrc.includes("role = 'assistant' AND hilo = ? AND COALESCE(post_id, 0) = ? AND id > ?"));
t('B9 el helper no toca support_voz_pedidos ni manda push',
  !/support_voz_pedidos|sendPush/.test(serverSrc.slice(serverSrc.indexOf('function pzChatReciboPedido'), serverSrc.indexOf('function pzChatReciboPedido') + 2600)));
const buildSrv = (serverSrc.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (appSrc.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
t('B10 paridad BUILD_ID == PZ_BUILD', !!buildSrv && buildSrv === buildApp, buildSrv + ' vs ' + buildApp);
t('B11 el build es el de este lote (v1398)', buildSrv === '20261105-v1398', buildSrv);

// ---------------------------------------------------------------------
const SEED_POSTS = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
db.exec('PRAGMA busy_timeout = 8000');
const uidEs = Number(process.argv[4]), uidEn = Number(process.argv[5]);
const p1 = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, scheduled_at) VALUES (?, '/media/prueba.jpg', 'Posteo de prueba ES', 'scheduled', '2999-01-01 19:00:00')").run(uidEs);
const p2 = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, scheduled_at) VALUES (?, '/media/prueba.jpg', 'Test post EN', 'scheduled', '2999-01-01 19:00:00')").run(uidEn);
console.log(JSON.stringify({ postEs: Number(p1.lastInsertRowid), postEn: Number(p2.lastInsertRowid) }));
`;

const CHECK_DB = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
const uidEs = Number(process.argv[4]), uidEn = Number(process.argv[5]);
const out = {};
const hayTablaVistos = db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'support_voz_pedidos'").get().c > 0;
out.vistos = hayTablaVistos ? db.prepare('SELECT COUNT(*) AS c FROM support_voz_pedidos').get().c : 0;
out.pushSubs = db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id IN (?, ?)').get(uidEs, uidEn).c;
try { out.pushEventos = db.prepare("SELECT COUNT(*) AS c FROM events WHERE user_id IN (?, ?) AND name LIKE '%push%'").get(uidEs, uidEn).c; }
catch (e) { out.pushEventos = -1; }
out.acusesEs = db.prepare("SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND text = ?").get(uidEs, process.argv[6]).c;
out.acusesEn = db.prepare("SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND text = ?").get(uidEn, process.argv[7]).c;
out.asistGeneral = db.prepare("SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND hilo = 'general'").get(uidEs).c;
console.log(JSON.stringify(out));
`;

function puertoLibre(p) {
  try {
    const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    return !out.split('\n').some((l) => l.includes(':' + p + ' '));
  } catch (e) { return false; }
}

(async () => {
  seccion('C · boot real por HTTP');
  let PORT = 0;
  for (let p = 34851; p < 34875; p++) if (puertoLibre(p)) { PORT = p; break; }
  t('C0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'recibo-pedido-boot-'));
  const TOKEN = 'boot-test-token-recibo';
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

  const registro = async (email, lang) => {
    const rr = await fetch(base + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test1234', business_name: 'Negocio ' + email, lang }),
    });
    const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    const me = await (await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).json();
    return { cookie, uid: Number(me && me.user && me.user.id) || 0 };
  };
  const api = async (cookie, ruta, body) => {
    const r = await fetch(base + ruta, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie || '' }, body: JSON.stringify(body),
    } : { headers: { Cookie: cookie || '' } });
    let j = null; try { j = await r.json(); } catch (e) { /* sin json */ }
    return { status: r.status, j };
  };
  const apiAdmin = async (ruta) => {
    const r = await fetch(base + ruta + (ruta.includes('?') ? '&' : '?') + 'token=' + TOKEN);
    let j = null; try { j = await r.json(); } catch (e) { /* sin json */ }
    return { status: r.status, j };
  };

  let uidEs = 0, uidEn = 0, postEs = 0, postEn = 0;
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('C1 el servidor levanta en el puerto libre', up, serverLog.slice(-200));

    const es = await registro('recibo-es@test.local', 'es');
    const en = await registro('recibo-en@test.local', 'en');
    uidEs = es.uid; uidEn = en.uid;
    t('C2 dos clientes registrados (ES y EN)', uidEs > 0 && uidEn > 0 && uidEs !== uidEn, uidEs + '/' + uidEn);

    const seedFile = path.join(os.tmpdir(), 'recibo-seed-' + process.pid + '.js');
    fs.writeFileSync(seedFile, SEED_POSTS);
    const seedOut = JSON.parse(execFileSync(process.execPath, [seedFile, tmpD, ROOT, String(uidEs), String(uidEn)], { encoding: 'utf8' }).trim().split('\n').pop());
    postEs = seedOut.postEs; postEn = seedOut.postEn;
    t('C3 posteos sembrados para ambos clientes', postEs > 0 && postEn > 0, postEs + '/' + postEn);

    // — El caso real: el pedido del posteo, sin respuesta del flujo —
    const r1 = await api(es.cookie, '/api/chat/hilo/log', { post_id: postEs, user_text: PEDIDO_REAL });
    t('C4 el guardado del pedido responde ok y con recibo', r1.status === 200 && r1.j && r1.j.ok === true && r1.j.recibo === true, JSON.stringify(r1.j || {}).slice(0, 120));
    const h1 = await api(es.cookie, '/api/chat/hilo?post_id=' + postEs);
    const m1 = (h1.j && h1.j.messages) || [];
    t('C5 el hilo del posteo tiene el pedido y UN acuse', m1.length === 2 && m1[0].role === 'user' && m1[1].role === 'assistant', JSON.stringify(m1).slice(0, 200));
    t('C6 el acuse es el texto ES exacto y va pegado al pedido', m1.length === 2 && m1[1].text === ACK_ES && Number(m1[1].id) > Number(m1[0].id), m1[1] && m1[1].text);
    t('C7 el tick del cliente sigue en ✓ simple (visto=0: el acuse no revisa)', m1.length === 2 && Number(m1[0].visto || 0) === 0, JSON.stringify(m1[0] || {}));

    // — Segundo pedido del mismo hilo: un acuse por mensaje, ni uno más —
    const r2 = await api(es.cookie, '/api/chat/hilo/log', { post_id: postEs, user_text: 'y también el caption' });
    t('C8 el segundo pedido también trae su recibo', r2.j && r2.j.recibo === true, JSON.stringify(r2.j || {}).slice(0, 120));
    const h2 = await api(es.cookie, '/api/chat/hilo?post_id=' + postEs);
    const m2 = (h2.j && h2.j.messages) || [];
    const acuses2 = m2.filter((m) => m.role === 'assistant' && m.text === ACK_ES);
    t('C9 exactamente un acuse por mensaje (2 pedidos → 2 acuses, sin duplicados)',
      m2.length === 4 && acuses2.length === 2
      && m2[0].role === 'user' && m2[1].role === 'assistant'
      && m2[2].role === 'user' && m2[3].role === 'assistant',
      JSON.stringify(m2.map((m) => m.role)).slice(0, 120));

    // — Semana: también recibe —
    const r3 = await api(es.cookie, '/api/chat/hilo/log', { semana: 1, user_text: 'cambiá el posteo del jueves' });
    t('C10 el pedido de la semana trae recibo', r3.j && r3.j.recibo === true, JSON.stringify(r3.j || {}).slice(0, 120));
    const h3 = await api(es.cookie, '/api/chat/hilo?semana=1');
    const m3 = (h3.j && h3.j.messages) || [];
    t('C11 el hilo de la semana tiene pedido + acuse ES', m3.length === 2 && m3[1].role === 'assistant' && m3[1].text === ACK_ES, JSON.stringify(m3).slice(0, 200));

    // — General: NO recibe (conserva sus respuestas de siempre) —
    const r4 = await api(es.cookie, '/api/chat/hilo/log', { general: 1, user_text: 'hola, un pedido general' });
    t('C12 el hilo general guarda sin recibo', r4.j && r4.j.ok === true && !r4.j.recibo, JSON.stringify(r4.j || {}).slice(0, 120));

    // — Sin doble charla: el turno ya trajo respuesta del asistente —
    const r5 = await api(es.cookie, '/api/chat/hilo/log', { post_id: postEs, user_text: 'este pedido ya trae respuesta', assistant_text: 'Esa parte no la puedo cambiar desde acá.' });
    t('C13 si el flujo ya respondió en el mismo turno, no hay acuse', r5.j && r5.j.ok === true && !r5.j.recibo, JSON.stringify(r5.j || {}).slice(0, 120));
    const h4 = await api(es.cookie, '/api/chat/hilo?post_id=' + postEs);
    const m4 = (h4.j && h4.j.messages) || [];
    const trasUltimo = m4.slice(m4.findIndex((m) => m.role === 'user' && m.text === 'este pedido ya trae respuesta') + 1);
    t('C14 tras ese pedido hay UNA sola respuesta y es la del flujo (no el acuse)',
      trasUltimo.length === 1 && trasUltimo[0].text === 'Esa parte no la puedo cambiar desde acá.',
      JSON.stringify(trasUltimo).slice(0, 200));

    // — Cliente EN: el acuse en su idioma —
    const r6 = await api(en.cookie, '/api/chat/hilo/log', { post_id: postEn, user_text: 'Can you improve it even more?' });
    t('C15 el pedido EN trae recibo', r6.j && r6.j.recibo === true, JSON.stringify(r6.j || {}).slice(0, 120));
    const h5 = await api(en.cookie, '/api/chat/hilo?post_id=' + postEn);
    const m5 = (h5.j && h5.j.messages) || [];
    t('C16 el acuse EN es el texto exacto', m5.length === 2 && m5[1].role === 'assistant' && m5[1].text === ACK_EN, JSON.stringify(m5).slice(0, 200));

    // — La cola del operador: el pedido sigue PENDIENTE, con el acuse
    //    como su respuesta registrada (entregado ≠ revisado) —
    const cola = await apiAdmin('/api/admin/support/conserje/pedidos-voz?limit=60');
    const pedidos = (cola.j && cola.j.pedidos) || [];
    const pReal = pedidos.find((p) => p.pedido === PEDIDO_REAL);
    t('C17 la cola pedidos-voz lista el pedido del caso real', !!pReal, 'total=' + pedidos.length);
    t('C18 el pedido sigue PENDIENTE de revisión (el acuse no decide ni marca visto)',
      !!pReal && pReal.revision && pReal.revision.estado === 'pendiente' && !pReal.revision.visto_en && !pReal.revision.decidido_en,
      JSON.stringify(pReal && pReal.revision));
    t('C19 la respuesta que la cola muestra para el pedido es el acuse',
      !!pReal && pReal.respuesta === ACK_ES, pReal && pReal.respuesta);
  } finally {
    try { process.kill(serverPid, 'SIGTERM'); } catch (e) { /* ya murió */ }
    await new Promise((res) => setTimeout(res, 800));
  }

  seccion('D · la base tras el cierre');
  const checkFile = path.join(os.tmpdir(), 'recibo-check-' + process.pid + '.js');
  fs.writeFileSync(checkFile, CHECK_DB);
  const outDb = JSON.parse(execFileSync(process.execPath, [checkFile, tmpD, ROOT, String(uidEs), String(uidEn), ACK_ES, ACK_EN], { encoding: 'utf8' }).trim().split('\n').pop());
  t('D1 ninguna fila de revisión nació del acuse (support_voz_pedidos vacía)', outDb.vistos === 0, JSON.stringify(outDb));
  t('D2 ninguna suscripción push se creó', outDb.pushSubs === 0, JSON.stringify(outDb));
  t('D3 ningún evento de push se creó', outDb.pushEventos === 0, JSON.stringify(outDb));
  t('D4 conteo exacto de acuses ES (2 del posteo + 1 de la semana)', outDb.acusesEs === 3, JSON.stringify(outDb));
  t('D5 conteo exacto de acuses EN (1)', outDb.acusesEn === 1, JSON.stringify(outDb));
  t('D6 ningún asistente quedó guardado en el hilo general', outDb.asistGeneral === 0, JSON.stringify(outDb));

  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); });
