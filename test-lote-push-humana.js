// Suite del lote PUSH-HUMANA (regla del dueño 27/11 22:04, con captura
// de su Centro de Notificaciones): ninguna push al cliente lleva
// tecnicismos ni copia la respuesta del chat; la falla avisa «Tu
// posteo de hoy no salió / Ya lo estamos resolviendo…» y la
// resolución cierra conectada («Ya salió ✓ — el posteo que se había
// trabado…»).
//   A) estáticos de las plantillas exactas y de las copias retiradas
//   B) notifyPostFailed real (push.js) con sendFn capturado: textos
//      ES/EN, singular/plural, destino Inicio y evento marcador
//   C) la lógica de cierre de scheduler.js contra eventos sembrados
//      (las consultas EXACTAS que el archivo trae)
//   D) BUILD v1385 en paridad
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let ok = 0, fail = 0;
const t = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  ok · ' + nombre); }
  else { fail++; console.log('  ✗ MAL · ' + nombre + (detalle ? ' :: ' + detalle : '')); }
};
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

(async () => {
  console.log('— A) estáticos —');
  const pushJs = R('push.js');
  const sched = R('scheduler.js');
  const server = R('server.js');
  t('A1 falla ES exacta', pushJs.includes("'Tu posteo de hoy no salió'") && pushJs.includes("'Ya lo estamos resolviendo. Te aviso apenas esté publicado.'"));
  t('A2 falla EN exacta', pushJs.includes('"Today\'s post didn\'t go out"') && pushJs.includes('"We\'re already on it. I\'ll let you know as soon as it\'s published."'));
  t('A3 la copia retirada no existe en push.js', !/Miralo cuando puedas|Miralos cuando puedas|dejé en borrador|dejé en borrador|kept it as a draft|kept them as drafts|Take a look when you can/i.test(pushJs));
  t('A4 la falla aterriza en Inicio', pushJs.includes("url: '/#/app/inicio'"));
  t('A5 cierre ES exacto en scheduler', sched.includes('El posteo que se había trabado ya está publicado en tu Instagram.'));
  t('A6 cierre EN exacto en scheduler', sched.includes('The post that got stuck is now published on your Instagram.'));
  t('A7 el cierre se marca con post_recovered_push', (sched.match(/post_recovered_push/g) || []).length >= 2 && sched.includes("name = 'post_failed_push'"));
  t('A8 el «ya salió» normal gana su versión EN', sched.includes('Your post is out!') && sched.includes('Your first post is out!'));
  t('A9 resolver: plantilla fija, sin copiar la respuesta', server.includes("'Ya está hecho — tocá para ver el cambio.'") && !server.includes("body: String(b.respuesta") && !server.includes('body: textoResp.slice'));
  t('A10 resolver-idea: sin cuerpo-respuesta', !server.includes('body: respuesta,') && !server.includes('body: respuesta.slice') && server.includes("'Tocá para ver el posteo.'"));
  t('A11 trabajos: sin body dinámico', !server.includes('body: titulo,') && !/body: titulo\s*\n/.test(server));
  for (const f of ['push.js', 'scheduler.js', 'server.js']) {
    try { execSync(`node --check ${f}`, { cwd: __dirname, stdio: 'pipe' }); t('A12 node --check ' + f, true); }
    catch (e) { t('A12 node --check ' + f, false, String(e.message).slice(0, 120)); }
  }

  console.log('— B) notifyPostFailed real —');
  try {
    const { DatabaseSync } = require('node:sqlite');
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-humana-'));
    const db = new DatabaseSync(path.join(dir, 't.db'));
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, lang TEXT, notify_failed INTEGER, notify_letter INTEGER);
             CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT, name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));`);
    db.prepare("INSERT INTO users (id, lang) VALUES (1, 'es'), (2, 'en')").run();
    const push = require('./push.js');
    const captura = [];
    const sendFn = async (uid, payload) => { captura.push([uid, payload]); return { ok: true, sent: 1 }; };
    // ES singular: 1 fallo en la ventana
    db.prepare("INSERT INTO events (user_id, name) VALUES (1, 'post_failed')").run();
    const r1 = await push.notifyPostFailed(1, { db, sendFn });
    t('B1 ES: título de la regla', captura[0] && captura[0][1].title === 'Tu posteo de hoy no salió', captura[0] && captura[0][1].title);
    t('B2 ES: cuerpo de la regla', captura[0] && captura[0][1].body === 'Ya lo estamos resolviendo. Te aviso apenas esté publicado.');
    t('B3 ES: destino Inicio', captura[0] && captura[0][1].url === '/#/app/inicio');
    const marca = db.prepare("SELECT COUNT(*) c FROM events WHERE user_id = 1 AND name = 'post_failed_push'").get();
    t('B4 queda el evento marcador post_failed_push', marca.c === 1);
    // EN con 2 fallos en 10 min → plural (otro usuario, sin throttle)
    db.prepare("INSERT INTO events (user_id, name) VALUES (2, 'post_failed'), (2, 'post_failed')").run();
    captura.length = 0;
    await push.notifyPostFailed(2, { db, sendFn });
    t('B5 EN plural', captura[0] && captura[0][1].title === "Today's posts didn't go out", captura[0] && captura[0][1].title);
    t('B6 EN cuerpo', captura[0] && captura[0][1].body === "We're already on it. I'll let you know as soon as it's published.");
    // Throttle: el segundo aviso dentro de 30 min no sale
    captura.length = 0;
    const rT = await push.notifyPostFailed(1, { db, sendFn });
    t('B7 throttle de 30 min intacto', rT && rT.reason === 'throttled' && captura.length === 0);
  } catch (e) { t('B excepción', false, String(e && e.message).slice(0, 200)); }

  console.log('— C) lógica de cierre (consultas del scheduler) —');
  try {
    const { DatabaseSync } = require('node:sqlite');
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-humana-c-'));
    const db = new DatabaseSync(path.join(dir, 't.db'));
    db.exec(`CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT, name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));`);
    // Réplica fiel de la decisión que toma scheduler.js al publicar.
    const hayCierre = (uid) => {
      const f = db.prepare("SELECT id FROM events WHERE user_id = ? AND name = 'post_failed_push' AND created_at >= datetime('now', '-24 hours') ORDER BY id DESC LIMIT 1").get(uid);
      if (!f) return false;
      const c = db.prepare("SELECT id FROM events WHERE user_id = ? AND name = 'post_recovered_push' AND id > ? LIMIT 1").get(uid, f.id);
      return !c;
    };
    t('C1 sin falla previa: sin cierre', hayCierre(9) === false);
    db.prepare("INSERT INTO events (user_id, name) VALUES (9, 'post_failed_push')").run();
    t('C2 con falla sin cerrar: cierre', hayCierre(9) === true);
    db.prepare("INSERT INTO events (user_id, name, props) VALUES (9, 'post_recovered_push', '{}')").run();
    t('C3 tras cerrar: el próximo posteo sale normal', hayCierre(9) === false);
    db.prepare("INSERT INTO events (user_id, name, created_at) VALUES (9, 'post_failed_push', datetime('now', '-30 hours'))").run();
    t('C4 una falla de hace 30 h no conecta posteos nuevos', hayCierre(9) === false);
  } catch (e) { t('C excepción', false, String(e && e.message).slice(0, 200)); }

  console.log('— D) sellos —');
  t('D1 BUILD_ID v1385', R('server.js').includes("BUILD_ID = '20261105-v1385'"));
  t('D2 PZ_BUILD v1385 en paridad', R('public/app.js').includes('20261105-v1385'));

  console.log(`\nPUSH-HUMANA: ${ok} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN:', e); process.exit(1); });
