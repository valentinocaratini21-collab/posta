// =====================================================================
// TEST · G-14 — AUTORESPUESTA PROPIA (reservas del website de Gesty)
// Cubre la aceptación de la cola G-14 y las guardas del contrato:
// reserva válida → registrada + confirmación enviada en SU idioma
// con la copia decidida (sin promesas prohibidas) · duplicada → ni
// segundo registro ni segundo email · canal fallido u omitido →
// estado honesto «fallido» con su motivo y reintento registrado ·
// origen no permitido → rechazado · honeypot → descarte silencioso
// fuera de las reservas reales · rate-limit activo con su ventana ·
// la consulta cuenta SOLO reservas reales (con emails únicos).
// HTTP: la ingesta pública responde CORS solo a los orígenes del
// sitio, la consulta y el reintento viven detrás de
// requireAdminToken, y sin clave de email en el server de prueba la
// reserva queda «fallido» (omitido) — jamás «enviado» sin canal.
// Uso: node test-gesty-reservas.js
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 240) : ''); }
};
const nuevaDb = () => new DatabaseSync(':memory:');
async function lanzaAsync(fn) { try { await fn(); return null; } catch (e) { return e; } }

const reservas = require('./gesty-reservas.js');

const ORIGEN = 'https://gestyofficemanager.com';
const AHORA = '2026-10-24T20:00:00.000Z';
const base = { negocio: 'Peluquería Luna', rubro: 'peluqueria', email: 'duena@luna.com', dolor: 'facturacion', detalle: 'Facturo a mano en un cuaderno.', plan: 'completa', idioma: 'es' };

(async () => {

console.log('— unidad: reserva válida, confirmación en su idioma');
{
  const db = nuevaDb();
  reservas._resetRateLimit();
  const llamadas = [];
  reservas.configure({ sendEmail: async (o) => { llamadas.push(o); return { ok: true, id: 'msg-1' }; }, from: null });
  const r = await reservas.ingresarReserva(db, base, { origen: ORIGEN, ip: '1.1.1.1', ahora: AHORA });
  ok('la reserva queda registrada', r.ok && !r.duplicada && r.reserva.id > 0, JSON.stringify(r).slice(0, 200));
  ok('el email sale UNA vez y al email de la reserva', llamadas.length === 1 && llamadas[0].to === 'duena@luna.com');
  ok('el email queda «enviado» SOLO con el comprobante del canal', r.reserva.email_estado === 'enviado' && r.reserva.email_comprobante === 'msg-1' && r.reserva.intentos_email === 1);
  ok('el asunto es el decidido (ES)', llamadas[0].subject === 'Reserva recibida · Gesty', llamadas[0].subject);
  ok('la copia confirma la llegada y dice el lanzamiento', /Tu reserva llegó/.test(llamadas[0].text) && llamadas[0].text.includes('1 de abril de 2027'));
  ok('con plan: cita su elección con el precio publicado y el programa Primeros 50',
    llamadas[0].text.includes('Gesty Completa') && llamadas[0].text.includes('299.99') && /primeras 50 cuentas/.test(llamadas[0].text));
  ok('la copia NO promete contacto con fecha (ni 24 h ni nada parecido)', !/24\s?h|24 horas|mañana te|te escribimos el/.test(llamadas[0].text), llamadas[0].text.slice(0, 200));
  ok('las respuestas van al inbox de Gesty (reply-to)', llamadas[0].replyTo === 'hola@gestyofficemanager.com');
  const hist = reservas.historialEnvios(db, r.reserva.id);
  ok('el intento queda asentado en la historia de envíos', hist.length === 1 && hist[0].resultado === 'enviado' && hist[0].comprobante === 'msg-1');

  console.log('— unidad: la duplicada no duplica ni reenvía');
  const dup = await reservas.ingresarReserva(db, { ...base, detalle: 'otro detalle, misma reserva' }, { origen: ORIGEN, ip: '1.1.1.1', ahora: AHORA });
  ok('la misma huella devuelve la reserva original', dup.ok && dup.duplicada === true && dup.reserva.id === r.reserva.id);
  ok('ni segundo registro ni segundo email', reservas.resumenReservas(db).total_reales === 1 && llamadas.length === 1);
}

console.log('— unidad: la copia EN y sin plan');
{
  const db = nuevaDb();
  const llamadas = [];
  reservas.configure({ sendEmail: async (o) => { llamadas.push(o); return { ok: true, id: 'msg-en' }; }, from: null });
  const r = await reservas.ingresarReserva(db, { negocio: 'Bloom Salon', rubro: 'salon', email: 'owner@bloom.com', idioma: 'en' }, { origen: 'https://www.gestyofficemanager.com', ip: '2.2.2.2', ahora: AHORA });
  ok('reserva EN registrada desde el www', r.ok && r.reserva.idioma === 'en' && r.reserva.plan === '');
  ok('el asunto y la fecha salen en inglés', llamadas[0].subject === 'Reservation received · Gesty' && llamadas[0].text.includes('April 1, 2027'));
  ok('sin plan no hay línea de elección (no se inventa una)', !/Your choice/.test(llamadas[0].text));
}

console.log('— unidad: canal fallido → estado honesto y reintento registrado');
{
  const db = nuevaDb();
  reservas.configure({ sendEmail: async () => ({ ok: false, error: 'HTTP 403' }), from: null });
  const r = await reservas.ingresarReserva(db, { ...base, email: 'falla@luna.com' }, { origen: ORIGEN, ip: '3.3.3.3', ahora: AHORA });
  ok('la reserva se registra igual, con el email «fallido» y su motivo', r.reserva.email_estado === 'fallido' && /403/.test(r.reserva.email_motivo), JSON.stringify(r.reserva).slice(0, 200));
  ok('jamás figura «enviado» sin comprobante', r.reserva.email_comprobante === '');
  const e1 = await lanzaAsync(() => reservas.reintentarEnvio(db, 9999, {}));
  ok('reintentar una reserva inexistente se rechaza', !!e1 && /no existe/.test(e1.message));
  reservas.configure({ sendEmail: async () => ({ ok: true, id: 'msg-reintento' }), from: null });
  const re = await reservas.reintentarEnvio(db, r.reserva.id, { ahora: AHORA });
  ok('el reintento con el canal sano envía y queda registrado', re.email_estado === 'enviado' && re.email_comprobante === 'msg-reintento' && re.intentos_email === 2);
  ok('la historia guarda los dos intentos con su desenlace', reservas.historialEnvios(db, r.reserva.id).map((h) => h.resultado).join(',') === 'fallido,enviado');
  const e2 = await lanzaAsync(() => reservas.reintentarEnvio(db, r.reserva.id, {}));
  ok('una confirmación ya enviada NO se reenvía', !!e2 && /ya fue enviada/.test(e2.message));
}

console.log('— unidad: canal omitido (sin clave) → «fallido», nunca silencio');
{
  const db = nuevaDb();
  reservas.configure({ sendEmail: async () => ({ ok: false, skipped: true }), from: null });
  const r = await reservas.ingresarReserva(db, { ...base, email: 'omitido@luna.com' }, { origen: ORIGEN, ip: '4.4.4.4', ahora: AHORA });
  ok('el omitido queda «fallido» con su motivo declarado', r.reserva.email_estado === 'fallido' && /omitió/.test(r.reserva.email_motivo), r.reserva.email_motivo);
}

console.log('— unidad: honeypot, origen y validaciones');
{
  const db = nuevaDb();
  let llamados = 0;
  reservas.configure({ sendEmail: async () => { llamados++; return { ok: true, id: 'x' }; }, from: null });
  const spam = await reservas.ingresarReserva(db, { ...base, honey: 'http://spam.example' }, { origen: ORIGEN, ip: '5.5.5.5', ahora: AHORA });
  ok('honeypot: la respuesta imita el éxito', spam.ok === true && spam.descartada === true && !spam.reserva);
  const res = reservas.resumenReservas(db);
  ok('honeypot: NO entra a las reservas reales y el canal no se llama', res.total_reales === 0 && llamados === 0);
  ok('honeypot: el descarte queda contado aparte', res.descartes_honeypot === 1);
  const eOrigen = await lanzaAsync(() => reservas.ingresarReserva(db, base, { origen: 'https://evil.example', ip: '5.5.5.6', ahora: AHORA }));
  ok('origen no permitido → rechazado', !!eOrigen && eOrigen.code === 'ORIGEN');
  const eSinOrigen = await lanzaAsync(() => reservas.ingresarReserva(db, base, { origen: '', ip: '5.5.5.7', ahora: AHORA }));
  ok('sin origen atribuible → rechazado (no se adivina)', !!eSinOrigen && eSinOrigen.code === 'ORIGEN');
  ok('el origen se puede derivar del Referer del sitio', reservas.origenDe({ referer: 'https://gestyofficemanager.com/prueba?plan=total' }) === ORIGEN);
  const eEmail = await lanzaAsync(() => reservas.ingresarReserva(db, { ...base, email: 'no-es-email' }, { origen: ORIGEN, ip: '5.5.5.8', ahora: AHORA }));
  ok('email inválido → validación', !!eEmail && eEmail.code === 'VALIDACION');
  const ePlan = await lanzaAsync(() => reservas.ingresarReserva(db, { ...base, plan: 'pro' }, { origen: ORIGEN, ip: '5.5.5.9', ahora: AHORA }));
  ok('plan fuera de contrato → validación', !!ePlan && ePlan.code === 'VALIDACION');
  const eNegocio = await lanzaAsync(() => reservas.ingresarReserva(db, { ...base, negocio: 'x' }, { origen: ORIGEN, ip: '5.5.5.10', ahora: AHORA }));
  ok('negocio vacío → validación', !!eNegocio && eNegocio.code === 'VALIDACION');
  const eIdioma = await lanzaAsync(() => reservas.ingresarReserva(db, { ...base, idioma: 'fr' }, { origen: ORIGEN, ip: '5.5.5.11', ahora: AHORA }));
  ok('idioma fuera de contrato → validación', !!eIdioma && eIdioma.code === 'VALIDACION');
}

console.log('— unidad: rate-limit con ventana');
{
  const db = nuevaDb();
  reservas._resetRateLimit();
  reservas.configure({ sendEmail: async () => ({ ok: true, id: 'rl' }), from: null });
  let pasaron = 0;
  for (let i = 0; i < 20; i++) {
    const r = await reservas.ingresarReserva(db, { ...base, email: `rl${i}@luna.com`, negocio: `Negocio RL ${i}` }, { origen: ORIGEN, ip: '6.6.6.6', ahora: AHORA });
    if (r.ok) pasaron++;
  }
  ok('los primeros 20 intentos de la IP pasan', pasaron === 20, String(pasaron));
  const e21 = await lanzaAsync(() => reservas.ingresarReserva(db, { ...base, email: 'rl21@luna.com', negocio: 'Negocio RL 21' }, { origen: ORIGEN, ip: '6.6.6.6', ahora: AHORA }));
  ok('el intento 21 en la ventana → rate-limit', !!e21 && e21.code === 'RATE_LIMIT');
  const despues = await reservas.ingresarReserva(db, { ...base, email: 'rl22@luna.com', negocio: 'Negocio RL 22' }, { origen: ORIGEN, ip: '6.6.6.6', ahora: '2026-10-24T20:16:00.000Z' });
  ok('pasada la ventana (16 min), la misma IP vuelve a entrar', despues.ok === true);
  reservas._resetRateLimit();
}

console.log('— unidad: la consulta cuenta solo reservas reales');
{
  const db = nuevaDb();
  reservas.configure({ sendEmail: async () => ({ ok: true, id: 'c' }), from: null });
  await reservas.ingresarReserva(db, { ...base }, { origen: ORIGEN, ip: '7.7.7.1', ahora: AHORA });
  await reservas.ingresarReserva(db, { ...base, negocio: 'Distribuidora Sur', rubro: 'distribuidora', plan: 'total' }, { origen: ORIGEN, ip: '7.7.7.2', ahora: AHORA });
  await reservas.ingresarReserva(db, { negocio: 'Café Aurora', rubro: 'gastronomia', email: 'hola@aurora.com', idioma: 'es' }, { origen: ORIGEN, ip: '7.7.7.3', ahora: AHORA });
  const res = reservas.resumenReservas(db);
  ok('total de reservas reales', res.total_reales === 3, JSON.stringify(res));
  ok('emails únicos: el mismo email con dos negocios cuenta una vez', res.emails_unicos === 2);
  ok('el desglose por plan incluye sin-plan', res.por_plan.completa === 1 && res.por_plan.total === 1 && res.por_plan['sin-plan'] === 1, JSON.stringify(res.por_plan));
  const lista = reservas.listReservas(db, {});
  ok('la lista trae las reservas con su estado de email', lista.total === 3 && lista.reservas.every((r) => r.email_estado === 'enviado'));
}

// ------------------------------------------------------------------
// HTTP: server real booteado (sin RESEND_API_KEY a propósito: el
// canal omite y la reserva debe quedar «fallido» honesto).
// ------------------------------------------------------------------
console.log('— http: ingesta pública, guardas y consulta admin');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
async function callRaw(method, p, { headers = {}, body } = {}) {
  const r = await fetch(BASE + p, { method, headers, body });
  const texto = await r.text();
  let data = {};
  try { data = JSON.parse(texto); } catch (e) { data = { texto }; }
  return { status: r.status, data, headers: r.headers };
}
const postJson = (p, payload, origen) => callRaw('POST', p, {
  headers: { 'Content-Type': 'application/json', ...(origen ? { Origin: origen } : {}) },
  body: JSON.stringify(payload),
});

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g14-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '', RESEND_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let bootLog = '';
child.stdout.on('data', (d) => { bootLog += d; });
child.stderr.on('data', (d) => { bootLog += d; });
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch (e) {}
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  ok('server bootea', up, bootLog.slice(-300));

  const sinOrigen = await postJson('/api/gesty/reservas/ingresar', base, null);
  ok('http: POST sin origen → 403', sinOrigen.status === 403, String(sinOrigen.status));
  const origenMalo = await postJson('/api/gesty/reservas/ingresar', base, 'https://evil.example');
  ok('http: POST desde un origen ajeno → 403', origenMalo.status === 403, String(origenMalo.status));
  const preflight = await callRaw('OPTIONS', '/api/gesty/reservas/ingresar', { headers: { Origin: ORIGEN, 'Access-Control-Request-Method': 'POST' } });
  ok('http: el preflight del sitio recibe CORS', preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === ORIGEN,
    `${preflight.status} ${preflight.headers.get('access-control-allow-origin')}`);

  const buena = await postJson('/api/gesty/reservas/ingresar', base, ORIGEN);
  ok('http: la reserva válida entra (200)', buena.status === 200 && buena.data.ok === true, JSON.stringify(buena.data).slice(0, 200));
  ok('http: sin clave de email, el estado es «fallido» honesto (omitido), nunca «enviado»',
    buena.data.reserva && buena.data.reserva.email_estado === 'fallido' && /omitió/.test(buena.data.reserva.email_motivo || ''), JSON.stringify(buena.data).slice(0, 240));
  ok('http: la respuesta trae CORS para el sitio', buena.headers.get('access-control-allow-origin') === ORIGEN);

  const dup = await postJson('/api/gesty/reservas/ingresar', base, ORIGEN);
  ok('http: la misma reserva por HTTP → duplicada, sin nuevo registro', dup.status === 200 && dup.data.duplicada === true && dup.data.reserva.id === buena.data.reserva.id);

  const form = await callRaw('POST', '/api/gesty/reservas/ingresar', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGEN },
    body: new URLSearchParams({ negocio: 'Taller El Faro', rubro: 'taller', email: 'taller@faro.com', plan: 'esencial', idioma: 'es' }).toString(),
  });
  ok('http: el cuerpo urlencoded (formulario clásico) también entra', form.status === 200 && form.data.ok === true && form.data.reserva.negocio === 'Taller El Faro', JSON.stringify(form.data).slice(0, 200));

  const spam = await postJson('/api/gesty/reservas/ingresar', { ...base, email: 'spam@luna.com', _honey: 'spam' }, ORIGEN);
  ok('http: honeypot → 200 silencioso sin reserva', spam.status === 200 && spam.data.ok === true && !spam.data.reserva);

  const sinToken = await callRaw('GET', '/api/gesty/reservas');
  ok('http: la consulta sin token admin → 403', sinToken.status === 403, String(sinToken.status));
  const consulta = await callRaw('GET', '/api/gesty/reservas?token=test-admin');
  ok('http: la consulta con token admin cuenta SOLO las reales (2: ni la duplicada ni el honeypot)',
    consulta.status === 200 && consulta.data.resumen.total_reales === 2 && consulta.data.resumen.descartes_honeypot === 1,
    JSON.stringify(consulta.data.resumen || {}).slice(0, 200));

  const reSinToken = await callRaw('POST', `/api/gesty/reservas/${buena.data.reserva.id}/reintentar`, { headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok('http: el reintento sin token admin → 403', reSinToken.status === 403, String(reSinToken.status));
  const re = await callRaw('POST', `/api/gesty/reservas/${buena.data.reserva.id}/reintentar?token=test-admin`, { headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok('http: el reintento queda registrado (intento 2) y sigue honesto sin canal',
    re.status === 200 && re.data.reserva.intentos_email === 2 && re.data.reserva.email_estado === 'fallido', JSON.stringify(re.data).slice(0, 200));
} finally {
  child.kill('SIGKILL');
}

console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})();
