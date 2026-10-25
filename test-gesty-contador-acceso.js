#!/usr/bin/env node
// test-gesty-contador-acceso.js — G-15b · PORTAL DE SOLO LECTURA
// DEL CONTADOR. Spec: gesty-cola-builds.md G-15 (aceptación
// completa) · gesty-build-spec.md §13.1.
// Cubre: el acceso se crea sin enviar nada y SIN token vivo ·
// EL SELLO de la invitación: sin OK el email no sale (verificado
// sobre el canal inyectado: cero emails, y el rechazo queda en
// el registro) · ronda vieja rechazada · la salida mienta el
// token (hash en la base; el plano SOLO en el email/enlace) y el
// token no aparece en claro en NINGUNA tabla ni en el registro
// de eventos · el contador ve SOLO los paquetes de su dueño,
// para su email, ya entregados, en su formato · las lecturas y
// descargas quedan en el log · el intento de escritura queda
// registrado · revocar corta en el acto (la request siguiente)
// · token vencido no entra · reinvitar mata el token viejo (no
// resucita) y exige sello nuevo · separación entre dos dueños
// con el MISMO contador · gating HTTP (401/403) y el recorrido
// del portal booteado (header, CSV, 405, revocación).
// Uso: node test-gesty-contador-acceso.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 220) : ''); }
};
const nuevaDb = () => new DatabaseSync(':memory:');
function lanza(fn) { try { fn(); return null; } catch (e) { return e; } }
async function lanzaAsync(fn) { try { await fn(); return null; } catch (e) { return e; } }

const gesty = require('./gesty.js');
const comp = require('./gesty-comprobantes.js');
const contador = require('./gesty-contador.js');
const acceso = require('./gesty-contador-acceso.js');

const EMAIL_CONTADOR = 'estudio@contador.example';

// Canales de email inyectados (uno por módulo): cuentan y guardan.
let emailsPaquete = [];
contador.configure({ sendEmail: async (o) => { emailsPaquete.push(o); return { ok: true, id: 'resend-paquete-test' }; } });
let emailsInvitacion = [];
acceso.configure({ sendEmail: async (o) => { emailsInvitacion.push(o); return { ok: true, id: 'resend-invitacion-test' }; } });

function eventosDe(db, uid, tipo) {
  return gesty.listEvents(db, uid, { limit: 5000 }).filter((e) => e.tipo_evento === tipo);
}
function comprobanteSimple(db, uid, cuitPropio, numero) {
  return comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: 'Repuestos del Sur', emisor_cuit: '30123456781',
    receptor_nombre: 'El negocio', receptor_cuit: cuitPropio,
    numero, fecha: '2026-09-05', vencimiento: '2026-09-20',
    moneda: 'ARS', monto_total: 121000, monto_neto: 100000,
    impuestos: [{ concepto: 'IVA 21%', monto: 21000 }], clasificacion: 'stock', concepto: 'Repuestos',
  }).comprobante;
}
// Deja un paquete del período ENTREGADO por email (vía G-15) y
// otro apenas preparado: el portal solo puede ver el primero.
function paqueteEntregado(db, uid, periodo) {
  const armado = contador.armarPaquete(db, uid, { periodo });
  const ap = contador.aprobarPaquete(db, uid, armado.id, { version: armado.version });
  if (!ap.ok) throw new Error('aprobarPaquete falló: ' + ap.error);
  return contador.enviarPaquete(db, uid, armado.id, {}).then((r) => r.paquete);
}
function tokenDeEmail(email) {
  const m = /portal-contador\?t=([0-9a-f]{64})/.exec(email.text || '');
  return m ? m[1] : null;
}

(async () => {

// ---------------------------------------------------------------------------
console.log('— unidad: dos negocios, el MISMO contador');
const db = nuevaDb();
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
gesty.setData(db, 1, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
gesty.setData(db, 2, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Panadería La Espiga', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
// El mismo estudio contable atiende a los dos negocios; cada
// dueño lo carga en SU fundamento, con SU formato preferido.
contador.setContador(db, 1, { nombre: 'Estudio Pérez', email: EMAIL_CONTADOR, formato_carpeta: 'por-tipo' });
contador.setContador(db, 2, { nombre: 'Estudio Pérez', email: EMAIL_CONTADOR, formato_carpeta: 'generico' });
comprobanteSimple(db, 1, '20123456786', '0001-00000101');
comprobanteSimple(db, 2, '27234567891', '0001-00000202');

const enviadoU1 = await paqueteEntregado(db, 1, '2026-09');
const sinEnviarU1 = contador.armarPaquete(db, 1, { periodo: '2026-08' }); // queda «preparado»
const enviadoU2 = await paqueteEntregado(db, 2, '2026-09');
ok('montaje: el paquete de cada dueño salió por email y el de agosto quedó sin entregar',
  enviadoU1.estado === 'enviado' && enviadoU2.estado === 'enviado' && sinEnviarU1.estado === 'preparado',
  `${enviadoU1.estado}/${enviadoU2.estado}/${sinEnviarU1.estado}`);

// ---------------------------------------------------------------------------
console.log('— unidad: crear el acceso no envía nada y no mienta token');
const errSinEmail = lanza(() => acceso.crearAcceso(db, 3, {}));
ok('sin contador cargado y sin email en la invitación: no hay a quién invitar',
  !!errSinEmail && /email de tu contador/.test(errSinEmail.message), errSinEmail && errSinEmail.message);
const acc1 = acceso.crearAcceso(db, 1, {});
ok('el acceso nace activo, con la invitación preparada y SIN enlace vivo',
  acc1.email === EMAIL_CONTADOR && acc1.estado === 'activo' && acc1.invitacion === 'preparada'
  && acc1.tiene_enlace_vivo === false && !!acc1.vence_en && acc1.ronda === 1,
  JSON.stringify(acc1));
const filaAcc1 = db.prepare('SELECT token_hash FROM gesty_contador_accesos WHERE id = ?').get(acc1.id);
ok('en la base no hay hash todavía: el token no existe hasta que la invitación sale',
  filaAcc1.token_hash === '', JSON.stringify(filaAcc1));
const errDuplicado = lanza(() => acceso.crearAcceso(db, 1, {}));
ok('un segundo acceso activo para el mismo email se rechaza (se reinvita o se revoca)',
  !!errDuplicado && /Ya hay un acceso activo/.test(errDuplicado.message), errDuplicado && errDuplicado.message);

// ---------------------------------------------------------------------------
console.log('— unidad: EL SELLO — sin OK, la invitación no sale');
const errSinOk = await lanzaAsync(() => acceso.enviarInvitacion(db, 1, acc1.id));
ok('enviar sin el sello: rechazado', !!errSinOk && /OK del dueño/.test(errSinOk.message), errSinOk && errSinOk.message);
ok('…y el email NO salió (cero envíos por el canal)', emailsInvitacion.length === 0, String(emailsInvitacion.length));
ok('…y el intento quedó en el registro durable',
  eventosDe(db, 1, 'invitacion-contador-rechazada-sin-ok').length === 1);
const apVieja = acceso.aprobarInvitacion(db, 1, acc1.id, { ronda: 99 });
ok('aprobar con una ronda vieja: rechazado y registrado',
  apVieja.ok === false && apVieja.motivo === 'ronda-vieja', JSON.stringify(apVieja).slice(0, 160));
const ap = acceso.aprobarInvitacion(db, 1, acc1.id, {});
ok('el sello del dueño queda sobre la ronda vigente',
  ap.ok === true && ap.acceso.invitacion === 'aprobada', JSON.stringify(ap).slice(0, 160));
const apIdem = acceso.aprobarInvitacion(db, 1, acc1.id, {});
ok('re-aprobar la misma ronda es idempotente', apIdem.ok === true && apIdem.idempotente === true);

// ---------------------------------------------------------------------------
console.log('— unidad: la salida mienta el token (y solo vive hasheado)');
const envio = await acceso.enviarInvitacion(db, 1, acc1.id);
ok('con el sello, la invitación sale por email al contador',
  envio.ok === true && emailsInvitacion.length === 1 && emailsInvitacion[0].to === EMAIL_CONTADOR,
  JSON.stringify(emailsInvitacion[0] && emailsInvitacion[0].to));
const token1 = tokenDeEmail(emailsInvitacion[0]);
ok('el email lleva el enlace del portal con su token de 64 hex', !!token1);
const filaHash = db.prepare('SELECT token_hash, huella FROM gesty_contador_accesos WHERE id = ?').get(acc1.id);
const hashDeToken1 = require('crypto').createHash('sha256').update(token1).digest('hex');
ok('la base guarda el HASH del token (y su huella corta), nunca el token',
  filaHash.token_hash === hashDeToken1 && filaHash.huella === hashDeToken1.slice(0, 8) && filaHash.token_hash !== token1);
const tablasConToken = [];
for (const t of ['gesty_contador_accesos', 'gesty_contador_invitaciones', 'gesty_contador_acceso_log', 'gesty_contador_acceso_aprobaciones', 'gesty_events']) {
  const filas = db.prepare(`SELECT * FROM ${t}`).all();
  if (JSON.stringify(filas).includes(token1)) tablasConToken.push(t);
}
ok('el token en claro no aparece en NINGUNA tabla (ni en el registro de eventos)',
  tablasConToken.length === 0, tablasConToken.join(','));
const envioIdem = await acceso.enviarInvitacion(db, 1, acc1.id);
ok('reenviar la invitación ya enviada es idempotente (no sale dos veces)',
  envioIdem.ok === true && envioIdem.idempotente === true && emailsInvitacion.length === 1);

// ---------------------------------------------------------------------------
console.log('— unidad: el portal — alcance mínimo y cerrado, con su log');
const resuelto = acceso.resolverAcceso(db, token1, { ip: '10.0.0.1' });
ok('el token válido resuelve al acceso de su dueño', resuelto.ok === true && resuelto.acceso.user_id === 1);
const resumen = acceso.portalResumen(db, resuelto.acceso);
ok('el portal muestra SOLO el paquete entregado (el preparado no existe para el contador)',
  resumen.paquetes.length === 1 && resumen.paquetes[0].id === enviadoU1.id,
  JSON.stringify(resumen.paquetes.map((p) => p.id)));
ok('…y en el formato en que se entregó (el preferido de ESTE dueño: por-tipo)',
  resumen.paquetes[0].formato === 'por-tipo' && resumen.negocio === 'Refrigeración Sosa',
  JSON.stringify(resumen.paquetes[0]));
ok('el paquete de la OTRA cuenta es invisible aunque se pida por id',
  acceso.portalPaquete(db, resuelto.acceso, enviadoU2.id) === null);
const visto = acceso.portalPaquete(db, resuelto.acceso, enviadoU1.id);
ok('el paquete entregado se ve tal como salió (versión y contenido congelados)',
  !!visto && visto.id === enviadoU1.id && visto.version === enviadoU1.version && Array.isArray(visto.contenido.indice));
const csvR = acceso.portalPaqueteCSV(db, resuelto.acceso, enviadoU1.id);
ok('la descarga CSV baja el índice del paquete', !!csvR && csvR.csv.startsWith('fecha;tipo;direccion'),
  csvR && csvR.csv.slice(0, 40));
const jsonR = acceso.portalPaqueteJSON(db, resuelto.acceso, enviadoU1.id);
ok('la descarga JSON baja el paquete entero', !!jsonR && jsonR.id === enviadoU1.id);
acceso.registrarIntentoEscritura(db, resuelto.acceso, 'POST', '/api/portal-contador/paquetes/' + enviadoU1.id);
const log1 = acceso.listAccesoLog(db, 1, acc1.id);
const accionesLog = log1.map((l) => l.accion);
ok('el log del dueño registra cada lectura, cada descarga y el intento de escritura',
  accionesLog.includes('ver-paquetes') && accionesLog.includes('ver-paquete')
  && accionesLog.includes('descargar-csv') && accionesLog.includes('descargar-json')
  && accionesLog.includes('intento-escritura'), accionesLog.join(','));
ok('las visitas del contador también están en el registro durable de la cuenta',
  eventosDe(db, 1, 'contador-portal-vio').length >= 2 && eventosDe(db, 1, 'contador-portal-intento-escritura').length === 1);

// ---------------------------------------------------------------------------
console.log('— unidad: vencimiento, revocación y reinvitación');
// Vencido: el mismo token, resuelto con un reloj pasado el vencimiento.
const despues = new Date(new Date(acc1.vence_en).getTime() + 24 * 3600 * 1000).toISOString();
const resVencido = acceso.resolverAcceso(db, token1, { ip: '10.0.0.2', ahora: despues });
ok('con el reloj pasado el vencimiento, el token no entra (motivo: vencido)',
  resVencido.ok === false && resVencido.status === 401 && resVencido.motivo === 'vencido', JSON.stringify(resVencido));
const resVigente = acceso.resolverAcceso(db, token1, { ip: '10.0.0.2' });
ok('el vencimiento es derivado, no un estado quemado: en fecha, el token sigue vivo',
  resVigente.ok === true);
// Revocar: corta en el acto — la request siguiente ya no entra.
acceso.revocarAcceso(db, 1, acc1.id);
const resRevocado = acceso.resolverAcceso(db, token1, { ip: '10.0.0.3' });
ok('revocar corta en el acto: la request siguiente queda afuera (motivo: revocado)',
  resRevocado.ok === false && resRevocado.motivo === 'revocado', JSON.stringify(resRevocado));
ok('…y el intento con el enlace revocado quedó en el log como acceso denegado',
  acceso.listAccesoLog(db, 1, acc1.id).some((l) => l.accion === 'acceso-denegado'));
const errReinvRevocado = lanza(() => acceso.reinvitarAcceso(db, 1, acc1.id));
ok('un acceso revocado no se reinvita: se crea uno nuevo', !!errReinvRevocado);

// ---------------------------------------------------------------------------
console.log('— unidad: reinvitar mata el token viejo y exige sello nuevo');
const acc2 = acceso.crearAcceso(db, 1, {}); // el anterior está revocado: el email queda libre
const errSinMedio = lanza(() => acceso.compartirInvitacion(db, 1, acc2.id, {}));
ok('compartir el enlace sin medio no se registra (no hay entrega sin medio)',
  !!errSinMedio && /medio/.test(errSinMedio.message), errSinMedio && errSinMedio.message);
const compartida = acceso.compartirInvitacion(db, 1, acc2.id, { medio: 'se lo paso por WhatsApp' });
const tokenViejo = /t=([0-9a-f]{64})/.exec(compartida.enlace)[1];
ok('compartir el enlace lo mienta y queda registrado con su medio',
  !!tokenViejo && compartida.acceso.invitacion === 'compartida'
  && acceso.listInvitaciones(db, 1, acc2.id).some((i) => i.resultado === 'compartida' && i.comprobante === 'se lo paso por WhatsApp'));
ok('el enlace compartido entra al portal', acceso.resolverAcceso(db, tokenViejo, { ip: '10.0.0.4' }).ok === true);
acceso.reinvitarAcceso(db, 1, acc2.id, {});
const resTokenMuerto = acceso.resolverAcceso(db, tokenViejo, { ip: '10.0.0.4' });
ok('reinvitar mata el token anterior en el acto (no resucita)',
  resTokenMuerto.ok === false && resTokenMuerto.motivo === 'token-invalido', JSON.stringify(resTokenMuerto));
const errSinOk2 = await lanzaAsync(() => acceso.enviarInvitacion(db, 1, acc2.id));
ok('la ronda nueva no hereda el sello: sin OK nuevo, el email no sale',
  !!errSinOk2 && emailsInvitacion.length === 1);
acceso.aprobarInvitacion(db, 1, acc2.id, {});
const envio2 = await acceso.enviarInvitacion(db, 1, acc2.id);
const tokenNuevo = tokenDeEmail(emailsInvitacion[emailsInvitacion.length - 1]);
ok('con el sello nuevo sale un token NUEVO, distinto del muerto',
  envio2.ok === true && !!tokenNuevo && tokenNuevo !== tokenViejo);
ok('el token nuevo entra y el viejo sigue afuera',
  acceso.resolverAcceso(db, tokenNuevo, { ip: '10.0.0.5' }).ok === true
  && acceso.resolverAcceso(db, tokenViejo, { ip: '10.0.0.5' }).ok === false);

// ---------------------------------------------------------------------------
console.log('— unidad: separación — el mismo contador, dos dueños');
const accU2 = acceso.crearAcceso(db, 2, {});
acceso.aprobarInvitacion(db, 2, accU2.id, {});
await acceso.enviarInvitacion(db, 2, accU2.id);
const tokenU2 = tokenDeEmail(emailsInvitacion[emailsInvitacion.length - 1]);
const resU2 = acceso.resolverAcceso(db, tokenU2, { ip: '10.0.0.6' });
const resumenU2 = acceso.portalResumen(db, resU2.acceso);
ok('el acceso del segundo dueño ve SOLO su paquete (y con SU formato: generico)',
  resumenU2.paquetes.length === 1 && resumenU2.paquetes[0].id === enviadoU2.id
  && resumenU2.paquetes[0].formato === 'generico' && resumenU2.negocio === 'Panadería La Espiga',
  JSON.stringify(resumenU2.paquetes));
ok('…y el paquete del primer dueño le es invisible',
  acceso.portalPaquete(db, resU2.acceso, enviadoU1.id) === null);
ok('los logs no se cruzan: el log del acceso del dueño 2 no tiene lecturas del dueño 1',
  acceso.listAccesoLog(db, 2, accU2.id).every((l) => l.accion !== 'descargar-csv'));

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido con el server booteado');
const PORT = 3990;
const BASE = `http://127.0.0.1:${PORT}`;
async function call(method, p, body, cookie, headers) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  const texto = await r.text();
  try { data = JSON.parse(texto); } catch (e) { data = { texto }; }
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, cookie: sid, texto };
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g15b-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '' },
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

  const reg = await call('POST', '/api/auth/register', { email: 'g15b@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/contador/accesos', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/contador/accesos', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const ponerPack = (pack) => {
    const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
    f.exec('PRAGMA busy_timeout = 5000');
    const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g15b@example.com');
    f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, pack);
    f.close();
  };
  ponerPack('esencial');
  const esencial = await call('GET', '/api/gesty/contador/accesos', null, reg.cookie);
  ok('gating http: pack esencial SIN capacidad «reportes» → 403', esencial.status === 403, String(esencial.status));
  ponerPack('completa');

  await call('PUT', '/api/gesty/contador', { nombre: 'Estudio Contable Pérez', email: EMAIL_CONTADOR, formato_carpeta: 'por-tipo' }, reg.cookie);
  // Un paquete ENTREGADO por la vía manual (registrada, sin
  // depender del canal de email del server de test): es lo que
  // el contador va a ver en el portal.
  const paq = await call('POST', '/api/gesty/contador/paquetes', { periodo: '2026-09' }, reg.cookie);
  const entrega = await call('POST', `/api/gesty/contador/paquetes/${paq.data.paquete.id}/entrega-manual`, { medio: 'lo descargó el dueño y lo mandó desde su casilla' }, reg.cookie);
  ok('http: el paquete queda entregado a mano (registrado, con su medio)',
    entrega.status === 200 && entrega.data.paquete.estado === 'entregado-manual', JSON.stringify(entrega.data).slice(0, 200));

  const accHttp = await call('POST', '/api/gesty/contador/accesos', {}, reg.cookie);
  ok('http: el acceso se crea con la invitación preparada y sin enlace vivo',
    accHttp.status === 200 && accHttp.data.acceso.invitacion === 'preparada' && accHttp.data.acceso.tiene_enlace_vivo === false,
    JSON.stringify(accHttp.data).slice(0, 200));
  const accHttpId = accHttp.data.acceso.id;
  const enviarSinOk = await call('POST', `/api/gesty/contador/accesos/${accHttpId}/enviar-invitacion`, {}, reg.cookie);
  ok('http: enviar la invitación SIN el OK del dueño → 400 (no sale)',
    enviarSinOk.status === 400 && /OK del dueño/.test(enviarSinOk.data.error || ''), JSON.stringify(enviarSinOk.data).slice(0, 200));
  const apHttp = await call('POST', `/api/gesty/contador/accesos/${accHttpId}/aprobar-invitacion`, {}, reg.cookie);
  ok('http: el sello de la invitación queda registrado', apHttp.status === 200 && apHttp.data.acceso.invitacion === 'aprobada',
    JSON.stringify(apHttp.data).slice(0, 200));
  const apHttp2 = await call('POST', `/api/gesty/contador/accesos/${accHttpId}/aprobar-invitacion`, {}, reg.cookie);
  ok('http: re-aprobar la misma ronda es idempotente', apHttp2.status === 200 && apHttp2.data.idempotente === true);

  // La salida por enlace copiado pide ronda sin sellar: con la
  // invitación aprobada para email, compartir es otra historia —
  // se reinvita y se comparte la ronda nueva.
  await call('POST', `/api/gesty/contador/accesos/${accHttpId}/reinvitar`, {}, reg.cookie);
  const compHttp = await call('POST', `/api/gesty/contador/accesos/${accHttpId}/compartir`, { medio: 'se lo paso por WhatsApp' }, reg.cookie);
  const tokenHttp = compHttp.data.enlace ? /t=([0-9a-f]{64})/.exec(compHttp.data.enlace)[1] : null;
  ok('http: compartir el enlace (con su medio) lo mienta y lo devuelve una sola vez',
    compHttp.status === 200 && !!tokenHttp, JSON.stringify(compHttp.data).slice(0, 200));

  const portalSinToken = await call('GET', '/api/portal-contador', null, '');
  ok('portal http: sin token → 401', portalSinToken.status === 401, String(portalSinToken.status));
  const portalBasura = await call('GET', '/api/portal-contador', null, '', { 'x-portal-contador': 'x'.repeat(64) });
  ok('portal http: token desconocido → 401', portalBasura.status === 401 && portalBasura.data.motivo === 'token-invalido',
    JSON.stringify(portalBasura.data).slice(0, 160));
  const portal = await call('GET', '/api/portal-contador', null, '', { 'x-portal-contador': tokenHttp });
  ok('portal http: el contador entra con su token y ve SOLO su paquete entregado',
    portal.status === 200 && portal.data.portal.paquetes.length === 1
    && portal.data.portal.paquetes[0].id === paq.data.paquete.id && portal.data.portal.paquetes[0].formato === 'por-tipo',
    JSON.stringify(portal.data).slice(0, 240));
  const portalCsv = await fetch(BASE + `/api/portal-contador/paquetes/${paq.data.paquete.id}/csv`, { headers: { 'x-portal-contador': tokenHttp } });
  const portalCsvTexto = await portalCsv.text();
  ok('portal http: la descarga CSV baja como adjunto text/csv',
    portalCsv.status === 200 && (portalCsv.headers.get('content-type') || '').includes('text/csv') && portalCsvTexto.startsWith('fecha;tipo;direccion'),
    `${portalCsv.status} ${portalCsv.headers.get('content-type')}`);
  const escritura = await call('POST', `/api/portal-contador/paquetes/${paq.data.paquete.id}`, { loQueSea: 1 }, '', { 'x-portal-contador': tokenHttp });
  ok('portal http: escribir con el acceso del contador → 405 (solo lectura)',
    escritura.status === 405, String(escritura.status));
  const logHttp = await call('GET', `/api/gesty/contador/accesos/${accHttpId}/log`, null, reg.cookie);
  const accionesHttp = (logHttp.data.log || []).map((l) => l.accion);
  ok('portal http: el log del dueño trae la visita, la descarga y el intento de escritura',
    logHttp.status === 200 && accionesHttp.includes('ver-paquetes') && accionesHttp.includes('descargar-csv')
    && accionesHttp.includes('intento-escritura'), accionesHttp.join(','));
  const revHttp = await call('POST', `/api/gesty/contador/accesos/${accHttpId}/revocar`, {}, reg.cookie);
  ok('http: revocar en un toque deja el acceso revocado',
    revHttp.status === 200 && revHttp.data.acceso.estado === 'revocado', JSON.stringify(revHttp.data).slice(0, 200));
  const portalRevocado = await call('GET', '/api/portal-contador', null, '', { 'x-portal-contador': tokenHttp });
  ok('portal http: con el acceso revocado, la request siguiente queda afuera (401, revocado)',
    portalRevocado.status === 401 && portalRevocado.data.motivo === 'revocado', JSON.stringify(portalRevocado.data).slice(0, 160));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
