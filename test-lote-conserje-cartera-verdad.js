'use strict';

// =====================================================================
// LOTE CONSERJE-CARTERA-VERDAD — suite del lote
// =====================================================================
// El dueño (2026-11-27): «sigue sin funcionarme bien el panel de
// clientes en conserje». Contra los datos vivos, la lista de la
// CARTERA VIVA (CONSERJE-FORMA) todavía mentía en tres lugares:
//   1 · La invitación pendiente de conexión NO vencía nunca: la
//       cohorte del 23/11 (10 invitados que jamás conectaron, con su
//       trial_ends_at ya pasado) seguía listada como «pruebas
//       esperando» días después. Regla del dueño (22/11): el que ya
//       no está en la prueba ni es cliente pago NO aparece.
//   2 · La cuenta demo de la casa (Café Aroma, @bambooty.test, plan
//       active) computaba clase «pago»: era el ÚNICO «cliente» del
//       panel con 0 pagos reales en el sistema.
//   3 · «Suscriptores» de la tira superior contaba plan_status
//       'active' crudo (demo + espacios de la casa): leía 4 con 0
//       suscriptores reales.
// El arreglo (conserje-vista.js, claseDeCuenta + resumenHoy):
//   · pendiente: su propio trial_ends_at (o la extensión vigente, o
//     los 3 días desde la creación) es su fecha límite para conectar;
//     vencida sin conexión → clase null (si conecta tarde, vuelve
//     sola como prueba corriendo).
//   · email @bambooty.test → clase «demo» (rótulo «Demo de la casa»,
//     visible en Todos, jamás cuenta como pago). El dominio es el de
//     la casa, exacto — «.test» a secas es la convención de datos
//     falsos de las suites (pago@real.test ES un cliente pago ahí).
//   · suscriptores = filas de la cartera viva con clase «pago».
// Uso: node test-lote-conserje-cartera-verdad.js — sale 0 si pasa.
// =====================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }

const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

// ---------------------------------------------------------------------
seccion('A · estática del arreglo');
const vistaSrc = read('conserje-vista.js');
t('A1 la pendiente vencida sale de la cartera (finInv contra el reloj)', vistaSrc.includes('finInv') && vistaSrc.includes('CONSERJE-CARTERA-VERDAD'));
t('A2 la demo de la casa tiene su clase por su dominio exacto', vistaSrc.includes("@bambooty\\.test") && vistaSrc.includes("clase: 'demo'"));
t('A3 suscriptores sale de la clase viva, no del plan_status crudo', vistaSrc.includes("f.clase === 'pago').length") && !vistaSrc.includes("WHERE plan_status = 'active'"));
t('A4 el rótulo de la demo existe', vistaSrc.includes('Demo de la casa'));

// ---------------------------------------------------------------------
seccion('B · módulo — la cartera contra una mini-producción (reloj fijo)');
const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-cartera-mod-'));
process.env.DATA_DIR = tmpB;
const db = require('./db');
require('./guest-trial').ensureSchema(db);
const cv = require('./conserje-vista');

const NOW = Date.UTC(2026, 10, 27, 18, 0, 0); // jueves 2026-11-27 18:00 UTC
const DIA = 86400000;

function usuario(id, email, planStatus, e) {
  const x = e || {};
  db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, created_at)
    VALUES (?, ?, 'x', ?, ?, 0, 0, 0, ?, ?, ?)`)
    .run(id, email, x.plan || 'posty', planStatus, x.started != null ? x.started : null, x.ends != null ? x.ends : null, x.created || '2026-11-20 10:00:00');
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)')
    .run(id, x.nombre || '', x.ig || '', '');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
  if (x.conPost) {
    db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, created_at)
      VALUES (?, '/media/semilla.jpg', 'Pieza', 'scheduled', 'image', '2026-11-28T22:00:00.000Z', '2026-11-27 10:00:00')`).run(id);
  }
  if (x.ext) db.prepare('UPDATE users SET trial_extended_until = ? WHERE id = ?').run(x.ext, id);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// 401 · pendiente VENCIDA (la cohorte del 23/11): nunca conectó, su
// trial_ends_at pasó hace 15 horas, tiene posteos: NO aparece.
const u401 = usuario(401, 'guest-viejo@guest.invalid', 'trial', { nombre: 'Vieja Cohorte', ig: 'viejacohorte', started: 0, ends: NOW - 15 * 3600000, conPost: true, created: '2026-11-24 03:11:25' });
// 402 · pendiente FRESCA (la tanda de hoy): ventana abierta: aparece.
const u402 = usuario(402, 'guest-nuevo@guest.invalid', 'trial', { nombre: 'Tanda Nueva', ig: 'tandanueva', started: 0, ends: NOW + 3 * DIA, conPost: true, created: '2026-11-27 16:01:37' });
// 403 · pendiente con la fecha pasada pero EXTENSIÓN vigente: aparece.
const u403 = usuario(403, 'guest-ext@guest.invalid', 'trial', { nombre: 'Con Extensión', ig: 'conextension', started: 0, ends: NOW - DIA, ext: NOW + 5 * DIA, conPost: true });
// 404 · pendiente SIN trial_ends_at, creada hace 10 días: la ventana
// de 3 días desde la creación ya cerró: NO aparece.
const u404 = usuario(404, 'guest-sinf@guest.invalid', 'trial', { nombre: 'Sin Fecha Vieja', ig: 'sinfechavieja', started: 0, ends: null, conPost: true, created: '2026-11-17 18:00:00' });
// 405 · pendiente SIN trial_ends_at, creada hoy: aparece.
const u405 = usuario(405, 'guest-hoy@guest.invalid', 'trial', { nombre: 'Sin Fecha Hoy', ig: 'sinfechahoy', started: 0, ends: null, conPost: true, created: '2026-11-27 10:00:00' });
// 406 · la demo de la casa (plan active): clase demo, no pago.
const u406 = usuario(406, 'cafe.aroma@bambooty.test', 'active', { nombre: 'Café Aroma', ig: 'cafearoma.palermo', plan: 'total' });
// 407 · cliente pago real: clase pago, cuenta en suscriptores.
const u407 = usuario(407, 'cliente@gmail.com', 'active', { nombre: 'Cliente Real', ig: 'clientereal' });
// 408 · prueba corriendo (control): sigue corriendo.
const u408 = usuario(408, 'guest-corre@guest.invalid', 'trial', { nombre: 'Corre Bien', ig: 'correbien', started: NOW - DIA, ends: NOW + 2 * DIA });
// 409 · la convención de las suites: @real.test active ES pago.
const u409 = usuario(409, 'pago@real.test', 'active', { nombre: 'Pago Suite', ig: 'pagosuite' });

t('B1 la pendiente vencida (cohorte vieja) ya no es relación viva', cv.claseDeCuenta(db, u401, NOW).clase === null, JSON.stringify(cv.claseDeCuenta(db, u401, NOW)));
t('B2 la pendiente fresca (tanda de hoy) sigue esperando conexión', cv.claseDeCuenta(db, u402, NOW).clase === 'prueba_pendiente');
t('B3 la extensión vigente manda sobre la fecha pasada', cv.claseDeCuenta(db, u403, NOW).clase === 'prueba_pendiente');
t('B4 sin fecha guardada, la ventana corre desde la creación (10 días = fuera)', cv.claseDeCuenta(db, u404, NOW).clase === null);
t('B5 sin fecha guardada pero creada hoy: adentro', cv.claseDeCuenta(db, u405, NOW).clase === 'prueba_pendiente');
t('B6 la demo de la casa es «demo», no «pago»', cv.claseDeCuenta(db, u406, NOW).clase === 'demo', JSON.stringify(cv.claseDeCuenta(db, u406, NOW)));
t('B7 el cliente pago real sigue «pago»', cv.claseDeCuenta(db, u407, NOW).clase === 'pago');
t('B8 la prueba corriendo no se tocó', cv.claseDeCuenta(db, u408, NOW).clase === 'prueba_corriendo');
t('B9 @real.test (convención de suites) sigue «pago»: el dominio demo es exacto', cv.claseDeCuenta(db, u409, NOW).clase === 'pago');

const v = cv.vista(db, { nowMs: NOW });
const ids = v.clientes.map((f) => f.user_id).sort((a, b) => a - b);
t('B10 la lista del panel es exactamente la cartera viva verdadera',
  JSON.stringify(ids) === JSON.stringify([402, 403, 405, 406, 407, 408, 409]), 'salió: ' + ids.join(','));
const fila = (uid) => v.clientes.filter((f) => f.user_id === uid)[0] || {};
t('B11 la demo se ve en Todos con su rótulo «Demo de la casa»', fila(406).clase === 'demo' && fila(406).clase_label === 'Demo de la casa');
t('B12 «esperando conexión» cuenta solo las invitaciones vivas (3)', v.hoy.pruebas_esperando === 3, 'salió: ' + v.hoy.pruebas_esperando);
t('B13 «Suscriptores» cuenta solo pagos reales (2: el real y el de suite; la demo, no)', v.hoy.suscriptores === 2, 'salió: ' + v.hoy.suscriptores);
t('B14 pruebas activas = las que corren (1)', v.hoy.pruebas_activas === 1, 'salió: ' + v.hoy.pruebas_activas);

console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
process.exit(mal ? 1 : 0);
