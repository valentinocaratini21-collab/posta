'use strict';
/* =====================================================================
   LOTE PEDIDO-VISTO-CIERRE — suite propia (26/11/2026)
   Órdenes del dueño (26/11): (1) «cuando se hace un cambio que
   pidio el cliente, avisar con push notification» — y el refuerzo:
   «Siempre tenes que resolver vos a mano. Entonces siempre se
   manda push!»; (2) «agregarle 2 ticks como en whatsapp cuando
   envias un mensaje, para confirmar que posty lo reviso».

   El caso que lo destapó: su pedido 1089 (caption del posteo 791)
   se resolvió a mano por la ruta admin de captions y no llegó
   ninguna push ni quedó respuesta en el hilo — la push existente
   solo salta en el camino automático (chat_cambio).

   El lote:
   A. VISTO: support_voz_pedidos gana visto_en. Marcar visto no
      decide nada; decidir también estampa el visto. La cola del
      conserje lo expone (revision.visto_en).
   B. TICKS: /api/chat/hilo adjunta visto=1/0 a cada mensaje del
      cliente y la burbuja de la tira pinta ✓ (enviado) o ✓✓ en
      amarillo (revisado por Posty).
   C. CIERRE CON PUSH: la ruta admin pedidos-voz/resolver deja la
      respuesta de Posty en el hilo del pedido, lo marca visto y
      aprobado, y manda la push «El cambio que pediste está
      listo» — el cierre de TODA resolución a mano de bamboo.
   Control: contra el árbol anterior (PEDIDOVISTO_ROOT=<base>)
   la suite falla en los pines y en las funciones nuevas.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PEDIDOVISTO_ROOT || path.resolve(__dirname);
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok ·', label); }
  else { fail++; fails.push(label); console.log('  XX ·', label, extra ? '→ ' + String(extra).slice(0, 220) : ''); }
}

const SC = fs.readFileSync(path.join(ROOT, 'support-cases.js'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');

console.log('\n— A. El visto en el módulo de soporte —');
ok(SC.includes('ALTER TABLE support_voz_pedidos ADD COLUMN visto_en TEXT'), 'A1 · la tabla de pedidos gana la columna visto_en');
ok(SC.includes('function markVoiceRequestSeen(db, opts)'), 'A2 · existe markVoiceRequestSeen (visto sin decidir)');
ok(SC.includes('function resolveVoiceRequest(db, opts)'), 'A3 · existe resolveVoiceRequest (el cierre en una llamada)');
ok(SC.includes('markVoiceRequestSeen, resolveVoiceRequest'), 'A4 · las dos funciones se exportan');
ok(SC.includes('visto_en: rev && rev.visto_en ? String(rev.visto_en) : null'), 'A5 · la cola del conserje expone revision.visto_en');

console.log('\n— B. Ticks: servidor y cliente —');
ok(SRV.includes('function pzHiloAdjuntarVistos(rows)'), 'B1 · /api/chat/hilo adjunta el visto a los mensajes del cliente');
ok((SRV.match(/pzHiloAdjuntarVistos\(rows\);/g) || []).length === 2, 'B2 · el visto se adjunta en los dos hilos (posteo y semana)');
ok(APP.includes('class="pz-voz-ticks${m.visto ? \' ok\' : \'\'}"'), 'B3 · la burbuja del cliente pinta los ticks según m.visto');
ok(APP.includes("${m.visto ? '✓✓' : '✓'}"), 'B4 · ✓ al enviar y ✓✓ al ser revisado');
ok(CSS.includes('.pz-voz-ticks{') && CSS.includes('.pz-voz-ticks.ok{color:#FEC14D}'), 'B5 · los ticks revisados van en amarillo de la marca');

console.log('\n— C. El cierre con push —');
ok(SRV.includes("app.post('/api/admin/support/conserje/pedidos-voz/visto'"), 'C1 · ruta admin para marcar visto');
ok(SRV.includes("app.post('/api/admin/support/conserje/pedidos-voz/resolver'"), 'C2 · ruta admin del cierre (resolver)');
ok(SRV.includes("supportCases.resolveVoiceRequest(db, { messageId: b.message_id, respuesta: b.respuesta })"), 'C3 · la ruta de cierre usa resolveVoiceRequest');
ok(SRV.includes("'The change you asked for is ready' : 'El cambio que pediste está listo'"), 'C4 · el cierre manda la misma push del camino automático');

console.log('\n— D. Funcional: visto y cierre sobre una base de juguete —');
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, user_id INTEGER, role TEXT, text TEXT, hilo TEXT, post_id INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
  const sc = require(path.join(ROOT, 'support-cases.js'));
  db.prepare("INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id) VALUES (500, 12, 'user', 'Cambia el caption. El community manager soy yo.', 'post', 791)").run();
  db.prepare("INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id) VALUES (501, 12, 'user', 'La semana que viene quiero más reels.', 'semana', 0)").run();

  const vistos0 = sc.markVoiceRequestSeen(db, { messageId: 999 });
  ok(!vistos0.ok && vistos0.error === 'pedido_inexistente', 'D1 · marcar visto un pedido inexistente se rechaza');
  const v1 = sc.markVoiceRequestSeen(db, { messageId: 500 });
  ok(v1.ok && v1.estado === 'pendiente' && !!v1.visto_en, 'D2 · el visto se marca sin decidir (sigue pendiente)');
  const fila = db.prepare('SELECT estado, visto_en, decidido_en FROM support_voz_pedidos WHERE message_id = 500').get();
  ok(fila && fila.estado === 'pendiente' && !!fila.visto_en && !fila.decidido_en, 'D3 · la fila guarda visto_en sin decidido_en');

  const r0 = sc.resolveVoiceRequest(db, { messageId: 500, respuesta: '   ' });
  ok(!r0.ok && r0.error === 'respuesta_vacia', 'D4 · el cierre sin respuesta se rechaza');
  const r1 = sc.resolveVoiceRequest(db, { messageId: 500, respuesta: 'Listo: el caption ya dice que el community manager sos vos.' });
  ok(r1.ok && r1.user_id === 12 && r1.hilo === 'post' && r1.post_id === 791, 'D5 · el cierre devuelve el destino del pedido');
  const reply = db.prepare("SELECT role, text, hilo, post_id FROM chat_messages WHERE id = ?").get(r1.reply_id);
  ok(reply && reply.role === 'assistant' && reply.hilo === 'post' && Number(reply.post_id) === 791, 'D6 · la respuesta queda en el hilo del posteo');
  const fila2 = db.prepare('SELECT estado, visto_en, decidido_en FROM support_voz_pedidos WHERE message_id = 500').get();
  ok(fila2 && fila2.estado === 'aprobado' && !!fila2.visto_en && !!fila2.decidido_en, 'D7 · el cierre deja el pedido visto y aprobado');

  const r2 = sc.resolveVoiceRequest(db, { messageId: 501, respuesta: 'Anotado para tu semana.' });
  const reply2 = db.prepare("SELECT hilo, post_id FROM chat_messages WHERE id = ?").get(r2.reply_id);
  ok(r2.ok && reply2 && reply2.hilo === 'semana' && Number(reply2.post_id) === 0, 'D8 · el cierre de semana responde en el hilo de semana (post_id 0)');
  db.close();
} catch (e) {
  ok(false, 'D · la parte funcional corre', e && e.message);
}

console.log('\n— E. Sellos —');
const buildSrv = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (APP.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
ok(!!buildSrv && buildSrv === buildApp, 'E1 · BUILD_ID y PZ_BUILD en paridad', buildSrv + ' / ' + buildApp);
ok(IDX.includes('app.js?v=963'), 'E2 · el índice ES sirve el app.js del build');
ok(IDX.includes('styles.css?v=20261357') && IDXEN.includes('styles.css?v=20261357'), 'E3 · styles?v= nuevo e IGUAL en los dos índices (ES y EN)');

console.log(`\n===== PEDIDO-VISTO-CIERRE: ${pass} ok · ${fail} fallos =====`);
if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
process.exit(fail ? 1 : 0);
