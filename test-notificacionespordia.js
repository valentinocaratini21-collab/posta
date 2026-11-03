// test-notificacionespordia.js — NOTIFICACIONES POR DÍA (corrección Valentino 3/11).
// La semana se sigue armando entera por dentro, pero el usuario la vive UN
// POSTEO POR DÍA. Las pushes que anunciaban la semana como lote se eliminan;
// el anuncio pasa a ser la push matutina por día de posteo-del-día (texto
// exacto «Tu posteo de hoy ya está 👇», que vive en ESE lote, no en este).
// Corre: node test-notificacionespordia.js (desde la raíz del repo).
// Análisis estático sobre el código: cero envíos reales, cero red.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let n = 0;
function ok(cond, label) {
  n++;
  assert.ok(cond, label);
  console.log('ok ' + n + ' - ' + label);
}

const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const scheduler = fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8');
const notifyPush = fs.readFileSync(path.join(ROOT, 'notify-push.js'), 'utf8');
const upcoming = fs.readFileSync(path.join(ROOT, 'upcoming-notice.js'), 'utf8');
const despegue = fs.readFileSync(path.join(ROOT, 'alerta-despegue.js'), 'utf8');
const proactive = fs.readFileSync(path.join(ROOT, 'proactive.js'), 'utf8');
const pushJs = fs.readFileSync(path.join(ROOT, 'push.js'), 'utf8');

// ---------- 1) ELIMINADAS: ningún sendPush anuncia la semana en lote ----------
const batchTitles = ['Tu semana está lista ✨', 'Tu semana está lista 🎉', 'Tu semana se publica sola ✨'];
for (const t of batchTitles) {
  // Solo cuentan envíos reales: líneas con sendPush (los comentarios y las
  // páginas web que citan el texto viejo no son pushes).
  const sendLines = server.split('\n').filter((l) => l.includes('sendPush') && l.includes(t));
  ok(sendLines.length === 0, 'sin sendPush «' + t + '» en server.js (era generación / next-week / auto-arm)');
  const schedLines = scheduler.split('\n').filter((l) => l.includes('sendPush') && l.includes(t));
  ok(schedLines.length === 0, 'sin sendPush «' + t + '» en scheduler.js');
}

// ---------- 2) WOW SEMANAL: se mantiene como resumen, cuerpo por día ----------
ok(scheduler.includes("title: '🎉 Tu semana en Posty'"), 'wow semanal: título intacto');
ok(scheduler.includes('uno por día'), 'wow semanal: cuerpo dice «uno por día»');
ok(!scheduler.includes('posteos publicados. Tocá para ver cómo te fue'), 'wow semanal: cuerpo viejo en lote ya no está');

// ---------- 3) NO TOCADAS: pushes por posteo y resto del sistema ----------
ok(notifyPush.includes('Tu posteo de las ${hour} está listo'), 'aviso 3 h intacto');
ok(notifyPush.includes('No publiqué tu posteo de las ${hour}'), 'no-publicado intacto');
ok(upcoming.includes("'🚀 Publico en 30 min'"), 'aviso 30 min autopiloto intacto');
ok(upcoming.includes("'⏰ Sale en 30 minutos'"), 'aviso 30 min manual intacto');
ok(scheduler.includes('¡Tu primer posteo ya salió!'), 'publicado primer posteo intacto');
ok(scheduler.includes('Tu posteo ya sali'), 'publicado resto intacto');
ok(despegue.includes('Tu posteo está despegando'), 'despegue intacto');
ok(despegue.includes('SILENCIO_DESDE = 22'), 'despegue: silencio 22–8 intacto');
for (const t of ['trial_ending', 'streak_risk', 'drafts_pending', 'need_photos', 'winner', 'oportunidad']) {
  ok(proactive.includes("type: '" + t + "'"), 'proactiva intacta: ' + t);
}
ok(server.includes('Te falta 1 para pagar la mitad'), 'referido intacto');
ok(scheduler.includes('Tu semana quedó guardada'), 'cierre de prueba intacto');
ok(pushJs.includes('Tu carta de Posty ya llegó'), 'carta del domingo intacta');
ok(pushJs.includes('notifySundayLetter'), 'carta del domingo: función intacta');

// ---------- 4) ESTE LOTE NO INVENTA LA PUSH MATUTINA DE POSTEO-DEL-DÍA ----------
// El texto exacto «Tu posteo de hoy ya está 👇» vive en el lote posteo-del-día
// (se libera junto con este). Acá solo puede aparecer citado en comentarios,
// nunca como payload de un sendPush nuevo.
const morningPayload = server.split('\n').filter((l) => l.includes('sendPush') && l.includes('Tu posteo de hoy ya está'));
ok(morningPayload.length === 0, 'sin sendPush matutino duplicado en este lote (vive en posteo-del-día)');

// ---------- 5) EMAILS FUERA DEL LOTE ----------
// El email de semana lista sigue existiendo (sendWeekReady / sendWeekPreview)
// porque los emails son otro lote pendiente, no este.
ok(server.includes('sendWeekReady'), 'email semana lista intacto (fuera del lote, pendiente aparte)');
ok(server.includes('sendWeekPreview'), 'email preview intacto (fuera del lote, pendiente aparte)');

console.log('notificacionespordia: ' + n + ' ok, 0 fallos');
