'use strict';

// =====================================================================
// LOTE CHAT-SIN-TECNICISMOS — suite del lote
// =====================================================================
// Regla del dueño (27/11/2026, extensión de la de push v1385): el
// chat de cara al cliente NUNCA responde con tecnicismos — ni ids
// de material/posteo, ni rutas /media/..., ni nombres de archivo —
// lo pregunte quien lo pregunte. Caso real (captura de Subir de la
// casa): «Es el material 96: /media/….jpg — la foto de la Synchilla
// que subiste hoy.» / «Es el material 98: /media/….mp4 — el video
// que subiste recién.»
//   A · La función pura (chat-limpio.limpiarRespuestaCliente):
//       los dos casos EXACTOS de la captura, los bordes (limpia
//       intacta, solo-tecnicismo → genérica, hashtags del cliente,
//       marcador [foto:] funcional, «caso #N» por diseño) e
//       idempotencia.
//   B · Estática del cableado: el filtro está en los puntos reales
//       de guardado/envío (pzChatSaveReply, respuesta del handler,
//       pzChatMsgInsert, resolver-idea, idea-voz, hilo/log,
//       resolveVoiceRequest, replyAsPosty) y la regla vive en el
//       prompt del respondedor (generator.js).
//   C · Boot real por HTTP: una resolución del operador con la
//       filtración EXACTA de la captura entra por las dos puertas
//       (pedidos-voz/resolver y pedidos-voz/resolver-idea) y lo
//       que queda guardado en el hilo del cliente sale LIMPIO.
//   D · La base, tras matar el servidor por su PID exacto.
// Uso: node test-lote-chat-tecnicismos.js — sale 0 si todo pasa.
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

const FUGA_FOTO = 'Es el material 96: /media/1795820852456-7f8b778b3cb7.jpg — la foto de la Synchilla que subiste hoy.';
const LIMPIA_FOTO = 'Es la foto de la Synchilla que subiste hoy.';
const FUGA_VIDEO = 'Es el material 98: /media/1795825334411-446412163fad.mp4 — el video que subiste recién.';
const LIMPIA_VIDEO = 'Es el video que subiste recién.';

// ---------------------------------------------------------------------
seccion('A · la función pura');
const chatLimpio = require(path.join(ROOT, 'chat-limpio'));
const L = chatLimpio.limpiarRespuestaCliente;
t('A0 el módulo exporta limpiarRespuestaCliente', typeof L === 'function');
t('A1 captura exacta 1 (foto Synchilla) → humana', L(FUGA_FOTO) === LIMPIA_FOTO, L(FUGA_FOTO));
t('A2 captura exacta 2 (video) → humana', L(FUGA_VIDEO) === LIMPIA_VIDEO, L(FUGA_VIDEO));
t('A3 respuesta limpia pasa intacta (plantilla de idea resuelta)',
  L('¡Listo! Tu idea ya es un posteo — sale viernes 27-11 a las 19:00.') === '¡Listo! Tu idea ya es un posteo — sale viernes 27-11 a las 19:00.');
t('A4 solo el dato técnico (foto) → la genérica de foto', L('Es el material 96: /media/1795820852456-7f8b778b3cb7.jpg') === 'Es la foto que subiste hoy.', L('Es el material 96: /media/1795820852456-7f8b778b3cb7.jpg'));
t('A5 solo el dato técnico (video) → la genérica de video', L('Es el material 98: /media/1795825334411-446412163fad.mp4') === 'Es el video que subiste hoy.');
t('A6 los hashtags del cliente no se tocan', L('Sale hoy 🌿 #Synchilla #HechoAMano') === 'Sale hoy 🌿 #Synchilla #HechoAMano');
t('A7 el marcador funcional [foto:] no se toca (lo rinde el cliente)',
  L('Acá está la imagen de tu posteo 💪 [foto:/media/1795820852456-7f8b778b3cb7.jpg]') === 'Acá está la imagen de tu posteo 💪 [foto:/media/1795820852456-7f8b778b3cb7.jpg]');
t('A8 «caso #N» no se toca (referencia visible por diseño)',
  L('Tu pedido quedó en el caso #12, te responde el equipo en este chat.') === 'Tu pedido quedó en el caso #12, te responde el equipo en este chat.');
t('A9 el id de posteo sale y la frase queda', L('Ya cambié el posteo 827: sale mañana.') === 'Ya cambié el posteo: sale mañana.', L('Ya cambié el posteo 827: sale mañana.'));
t('A10 la fuga en inglés también se limpia', L("It's material 98: /media/1795825334411-446412163fad.mp4 — the video you just uploaded.") === "It's the video you just uploaded.");
t('A11 el centinela «…» del chat pasa intacto', L('…') === '…');
t('A12 idempotencia sobre las fugas', L(L(FUGA_FOTO)) === LIMPIA_FOTO && L(L(FUGA_VIDEO)) === LIMPIA_VIDEO);
t('A13 ninguna salida conserva /media/ ni «material N»',
  !/\/media\/|material\s+#?\d/i.test(L(FUGA_FOTO)) && !/\/media\/|material\s+#?\d/i.test(L(FUGA_VIDEO)));

// ---------------------------------------------------------------------
seccion('B · estática del cableado');
const serverSrc = read('server.js');
const scSrc = read('support-cases.js');
const genSrc = read('generator.js');
t('B1 server.js requiere chat-limpio', serverSrc.includes("require('./chat-limpio')"));
t('B2 pzChatSaveReply limpia antes de guardar', serverSrc.includes("chatLimpio.limpiarRespuestaCliente(String(reply || '').trim())"));
t('B3 la respuesta HTTP del chat sale limpia', serverSrc.includes('reply: chatLimpio.limpiarRespuestaCliente(out.reply)'));
t('B4 pzChatMsgInsert limpia', serverSrc.includes("chatLimpio.limpiarRespuestaCliente(String(text || '')).slice(0, 3000)"));
t('B5 resolver-idea limpia respuesta y texto guardado', serverSrc.includes('respuesta = chatLimpio.limpiarRespuestaCliente(respuesta, lang);') && serverSrc.includes('const textoLimpio = texto ? chatLimpio.limpiarRespuestaCliente(texto, lang) : texto;'));
t('B6 el acuse de idea-voz pasa por el filtro', serverSrc.includes('chatLimpio.limpiarRespuestaCliente(subirIdeaRespuesta(uid, texto)'));
t('B7 el log del hilo limpia el texto del asistente', serverSrc.includes('chatLimpio.limpiarRespuestaCliente(asstText)'));
t('B8 support-cases requiere chat-limpio y limpia resolveVoiceRequest', scSrc.includes("require('./chat-limpio')") && scSrc.includes("chatLimpio.limpiarRespuestaCliente(String(o.respuesta || '').trim())"));
t('B9 replyAsPosty (dictado) limpia', scSrc.includes("chatLimpio.limpiarRespuestaCliente(String(texto || '').trim())"));
t('B10 la regla vive en el prompt del respondedor', genSrc.includes('SIN TECNICISMOS (regla dura)') && genSrc.includes('lo pregunte quien lo pregunte'));

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
require(process.argv[3] + '/guest-trial').ensureSchema(db);
db.prepare("INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, created_at) VALUES (401, 'cliente@test.local', 'x', 'posty', 'trial', 0, 0, 0, '2026-09-01 10:00:00')").run();
db.prepare("INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (401, 'Cliente Prueba', 'clienteprueba', '')").run();
db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (401, 'America/Argentina/Buenos_Aires', '')").run();
db.prepare("INSERT INTO chat_messages (id, user_id, role, text, post_id, hilo) VALUES (7001, 401, 'user', '¿me decís el id del material de la foto que subí hoy?', 0, 'general')").run();
db.prepare("INSERT INTO chat_messages (id, user_id, role, text, post_id, hilo) VALUES (7002, 401, 'user', 'quiero un posteo con el video que subí recién', 0, 'general')").run();
db.prepare("INSERT INTO subir_ideas (id, user_id, message_id, texto, asset_ids, estado) VALUES (71, 401, 7002, 'quiero un posteo con el video que subí recién', '', 'recibida')").run();
db.prepare('UPDATE chat_messages SET idea_id = 71 WHERE id = 7002').run();
console.log('seed ok');
`;

const CHECK_DB = `
process.env.DATA_DIR = process.argv[2];
const db = require(process.argv[3] + '/db');
const out = {};
out.asistentes = db.prepare("SELECT id, text, idea_id FROM chat_messages WHERE user_id = 401 AND role = 'assistant' ORDER BY id ASC").all();
out.idea = db.prepare('SELECT id, estado, respuesta FROM subir_ideas WHERE id = 71').get();
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
  for (let p = 34811; p < 34830; p++) if (puertoLibre(p)) { PORT = p; break; }
  t('C0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-tecnicismos-boot-'));
  const seedFile = path.join(os.tmpdir(), 'chat-tecnicismos-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });
  const TOKEN = 'boot-test-token-tecnicismos';
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
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('C1 el servidor levanta en el puerto libre', up, serverLog.slice(-200));

    const r1 = await api('/api/admin/support/conserje/pedidos-voz/resolver', { message_id: 7001, respuesta: FUGA_FOTO });
    t('C2 la resolución por la cola de pedidos responde ok', r1.status === 200 && r1.j && r1.j.ok === true, JSON.stringify(r1.j || {}).slice(0, 160));

    const r2 = await api('/api/admin/support/conserje/pedidos-voz/resolver-idea', { message_id: 7002, texto: FUGA_VIDEO });
    t('C3 la resolución de la idea responde ok', r2.status === 200 && r2.j && r2.j.ok === true, JSON.stringify(r2.j || {}).slice(0, 160));
  } finally {
    try { process.kill(serverPid, 'SIGTERM'); } catch (e) { /* ya murió */ }
    await new Promise((res) => setTimeout(res, 800));
  }

  seccion('D · la base tras el cierre');
  const checkFile = path.join(os.tmpdir(), 'chat-tecnicismos-check-' + process.pid + '.js');
  fs.writeFileSync(checkFile, CHECK_DB);
  const outDb = JSON.parse(execFileSync(process.execPath, [checkFile, tmpD, ROOT], { encoding: 'utf8' }).trim().split('\n').pop());
  const textos = (outDb.asistentes || []).map((a) => a.text);
  t('D1 el hilo guardó dos respuestas del asistente', textos.length === 2, JSON.stringify(textos).slice(0, 200));
  t('D2 la respuesta de la cola quedó LIMPIA (caso exacto de la captura)', textos.includes(LIMPIA_FOTO), JSON.stringify(textos).slice(0, 200));
  t('D3 la respuesta de la idea quedó LIMPIA (caso exacto de la captura)', textos.includes(LIMPIA_VIDEO), JSON.stringify(textos).slice(0, 200));
  t('D4 ninguna respuesta guardada conserva tecnicismos',
    textos.every((x) => !/\/media\/|material\s+#?\d|\.mp4|\.jpg/i.test(x)), JSON.stringify(textos).slice(0, 200));
  t('D5 la fila de la idea guardó la respuesta limpia', !!outDb.idea && outDb.idea.respuesta === LIMPIA_VIDEO && outDb.idea.estado === 'resuelta', JSON.stringify(outDb.idea || {}).slice(0, 200));

  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); });
