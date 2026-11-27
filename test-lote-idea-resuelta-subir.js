#!/usr/bin/env node
/* LOTE IDEA-RESUELTA-SUBIR — al resolver un pedido que ES una idea de
   Subir, la idea se cierra con la misma respuesta: la tarjeta de Subir
   del cliente lee subir_ideas.estado, y resolver solo por la cola de
   pedidos la dejaba en 'recibida' para siempre (la app se contradecía:
   cola resuelta, tarjeta «La estamos viendo»). Precedente: mensaje 1092
   de la cuenta de la casa (26/11), señalado por el dueño el 27/11. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok ·', label); }
  else { fail++; console.log('  MAL ·', label, extra ? '— ' + extra : ''); }
}
const SC = fs.readFileSync(path.join(ROOT, 'support-cases.js'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

console.log('\n— A. Estructura —');
ok(SC.includes('(LOTE IDEA-RESUELTA-SUBIR)'), 'A1 · el cierre de la idea vive en resolveVoiceRequest');
ok(SC.includes("SELECT id FROM subir_ideas WHERE message_id = ?"), 'A2 · la idea se busca por el mensaje que la abrió');
ok(SC.includes("SET estado = 'resuelta', respuesta = ?, resuelta_at = datetime('now')"), 'A3 · la idea se marca resuelta con la misma respuesta');
ok(SC.includes("UPDATE chat_messages SET idea_id = ? WHERE id = ? AND idea_id IS NULL"), 'A4 · la contestación queda estampada con el idea_id');
ok(SRV.includes("supportCases.resolveVoiceRequest(db, { messageId: b.message_id, respuesta: b.respuesta })"), 'A5 · la ruta de cierre sigue pasando por resolveVoiceRequest');

console.log('\n— B. Funcional: la idea se cierra al resolver el pedido —');
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, user_id INTEGER, role TEXT, text TEXT, hilo TEXT, post_id INTEGER, idea_id INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE subir_ideas (id INTEGER PRIMARY KEY, user_id INTEGER, message_id INTEGER, texto TEXT, estado TEXT DEFAULT 'recibida', respuesta TEXT, post_id INTEGER, resuelta_at TEXT, asset_ids TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  const sc = require(path.join(ROOT, 'support-cases.js'));

  // La idea del precedente: mensaje 700 abre la idea 8.
  db.prepare("INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id, idea_id) VALUES (700, 12, 'user', 'Pieza film-04 ES 27/11', 'general', 0, 8)").run();
  db.prepare("INSERT INTO subir_ideas (id, user_id, message_id, texto, estado) VALUES (8, 12, 700, 'Pieza film-04 ES 27/11', 'recibida')").run();
  // Un pedido común, sin idea detrás.
  db.prepare("INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id) VALUES (701, 12, 'user', 'La semana que viene quiero más reels.', 'general', 0)").run();
  // Un seguimiento del hilo: el mensaje 702 no abre la idea 9, la lleva estampada.
  db.prepare("INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id) VALUES (650, 12, 'user', 'Quiero un posteo del equipo', 'general', 0)").run();
  db.prepare("INSERT INTO subir_ideas (id, user_id, message_id, texto, estado) VALUES (9, 12, 650, 'Quiero un posteo del equipo', 'recibida')").run();
  db.prepare("INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id, idea_id) VALUES (702, 12, 'user', '¿Y para cuándo sale?', 'general', 0, 9)").run();

  const r1 = sc.resolveVoiceRequest(db, { messageId: 700, respuesta: 'Listo ✓ film-04 ya está cargado.' });
  ok(r1.ok, 'B1 · el cierre del pedido-idea sale ok');
  const idea8 = db.prepare('SELECT estado, respuesta, resuelta_at FROM subir_ideas WHERE id = 8').get();
  ok(idea8 && idea8.estado === 'resuelta' && idea8.respuesta === 'Listo ✓ film-04 ya está cargado.' && !!idea8.resuelta_at, 'B2 · la idea 8 queda resuelta con la misma respuesta');
  const reply1 = db.prepare('SELECT role, idea_id FROM chat_messages WHERE id = ?').get(r1.reply_id);
  ok(reply1 && reply1.role === 'assistant' && Number(reply1.idea_id) === 8, 'B3 · la contestación queda en el hilo de la idea (idea_id 8)');

  const r2 = sc.resolveVoiceRequest(db, { messageId: 701, respuesta: 'Anotado para tu semana.' });
  ok(r2.ok, 'B4 · el pedido sin idea cierra como siempre');
  const reply2 = db.prepare('SELECT idea_id FROM chat_messages WHERE id = ?').get(r2.reply_id);
  ok(reply2 && !reply2.idea_id, 'B5 · la contestación sin idea no gana idea_id');

  const r3 = sc.resolveVoiceRequest(db, { messageId: 702, respuesta: 'Sale hoy a las 19:00.' });
  const idea9 = db.prepare('SELECT estado FROM subir_ideas WHERE id = 9').get();
  ok(r3.ok && idea9 && idea9.estado === 'resuelta', 'B6 · el seguimiento también cierra su idea (por idea_id)');

  const r4 = sc.resolveVoiceRequest(db, { messageId: 700, respuesta: 'Otra respuesta posterior.' });
  const idea8b = db.prepare('SELECT respuesta FROM subir_ideas WHERE id = 8').get();
  ok(r4.ok && idea8b && idea8b.respuesta === 'Listo ✓ film-04 ya está cargado.', 'B7 · una idea ya resuelta no se reescribe');
  db.close();
} catch (e) {
  ok(false, 'B · la parte funcional corre', e && e.message);
}

console.log(`\n${pass} ok · ${fail} MAL`);
process.exit(fail ? 1 : 0);
