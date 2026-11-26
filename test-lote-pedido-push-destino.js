'use strict';
/* =====================================================================
   LOTE PEDIDO-PUSH-DESTINO — suite propia (26/11/2026)
   Orden del dueño (26/11): «la push te tiene que llevar directo a
   la pantalla donde ves el cambio». La push «El cambio que pediste
   está listo» aterrizaba siempre en el chat general (#/app/chat),
   aunque el cambio fuera de un posteo puntual.

   El lote: un solo destino calculado por pedido —
   · pedido de un posteo → #/app/post/<id> (la pantalla del
     posteo, donde se ven el cambio hecho y el hilo);
   · pedido de la semana → #/app/semana;
   · pedido del chat general → #/app/chat (ahí se ve el cambio).
   Y se aplica en los TRES caminos que mandan esa push: el cierre
   a mano de bamboo (pedidos-voz/resolver), el resuelto desde el
   conserje (marcarVozResuelto) y el trabajo automático
   (chat_cambio). La push de «tu video ya está listo» NO es de un
   cambio pedido y no se toca (su pantalla es el chat).
   Control: contra el árbol anterior (PEDIDOPUSH_ROOT=<base>) la
   suite falla en los pines del lote.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PEDIDOPUSH_ROOT || path.resolve(__dirname);
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok ·', label); }
  else { fail++; fails.push(label); console.log('  XX ·', label, extra ? '→ ' + String(extra).slice(0, 220) : ''); }
}

const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

console.log('\n— A. El destino calculado —');
ok(SRV.includes('function pzPushUrlCambio(hilo, postId)'), 'A1 · existe el calculador de destino de la push de cambio');
const iFn = SRV.indexOf('function pzPushUrlCambio(hilo, postId)');
const fnTxt = iFn >= 0 ? SRV.slice(iFn, iFn + 400) : '';
ok(fnTxt.includes("if (hilo === 'post' && pid) return '/#/app/post/' + pid;"), 'A2 · pedido de posteo → la pantalla del posteo');
ok(fnTxt.includes("if (hilo === 'semana') return '/#/app/semana';"), 'A3 · pedido de semana → la semana');
ok(fnTxt.includes("return '/#/app/chat';"), 'A4 · pedido del chat → el chat');

console.log('\n— B. Los tres caminos lo usan —');
ok(SRV.includes('url: pzPushUrlCambio(job.hilo, job.post_id)'), 'B1 · el trabajo automático (chat_cambio) usa el destino del posteo');
ok(SRV.includes('url: pzPushUrlCambio(r.hilo, r.post_id)'), 'B2 · el cierre a mano de bamboo (resolver) usa el destino del pedido');
ok(SRV.includes('url: pzPushUrlCambio(m.hilo, m.post_id)'), 'B3 · el resuelto del conserje usa el destino del pedido');
ok(SRV.includes('"SELECT user_id, hilo, post_id FROM chat_messages WHERE id = ? AND role = \'user\'"'), 'B4 · el resuelto del conserje lee el hilo y el posteo del pedido');
// Ninguna push de «cambio listo» puede quedar con el chat fijo:
const bloquesCambio = (SRV.match(/El cambio que pediste está listo[\s\S]{0,400}/g) || []);
const conChatFijo = bloquesCambio.filter((b) => b.includes("url: '/#/app/chat'") && !b.includes('pzPushUrlCambio'));
ok(bloquesCambio.length >= 3 && conChatFijo.length === 0, 'B5 · ninguna push de cambio listo queda con destino fijo al chat', bloquesCambio.length + ' bloques');

console.log('\n— C. Funcional: el calculador, extraído y corrido —');
try {
  const pzPushUrlCambio = eval('(' + fnTxt.slice(0, fnTxt.indexOf('\n}') + 2) + ')');
  ok(pzPushUrlCambio('post', 791) === '/#/app/post/791', 'C1 · post 791 → su pantalla');
  ok(pzPushUrlCambio('semana', 0) === '/#/app/semana', 'C2 · semana → la semana');
  ok(pzPushUrlCambio('general', 0) === '/#/app/chat', 'C3 · chat general → el chat');
  ok(pzPushUrlCambio('post', 0) === '/#/app/chat', 'C4 · posteo sin id cae al chat (nunca a una pantalla rota)');
} catch (e) {
  ok(false, 'C · el calculador extraído corre', e && e.message);
}

console.log('\n— D. Sellos —');
const buildSrv = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (APP.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
ok(!!buildSrv && buildSrv === buildApp, 'D1 · BUILD_ID y PZ_BUILD en paridad', buildSrv + ' / ' + buildApp);
ok(IDX.includes('app.js?v=964'), 'D2 · el índice ES sirve el app.js del build');

console.log(`\n===== PEDIDO-PUSH-DESTINO: ${pass} ok · ${fail} fallos =====`);
if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
process.exit(fail ? 1 : 0);
