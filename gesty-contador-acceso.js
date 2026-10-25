// =====================================================================
// GESTY · G-15b — PORTAL DE SOLO LECTURA DEL CONTADOR
// Spec: gesty-cola-builds.md G-15 (la aceptación completa incluye
// esta mitad: «un contador de prueba entra con su acceso, ve la
// carpeta en el formato elegido, descarga y queda el log; revocar
// le corta el acceso en el acto») · gesty-build-spec.md §13.1 (el
// contador entra con su propio acceso, no con el del dueño; cada
// acceso queda en el log; no aprueba, no edita, no ve a otros).
//
// POR QUÉ UN MÓDULO NUEVO Y NO UNA EXTENSIÓN DE gesty-contador.js:
// G-15 es el ciclo de ENTREGA (perfil, paquete, sello, envío) y su
// superficie es la del dueño autenticado. El portal es una
// superficie de SEGURIDAD distinta — tokens hasheados, rutas
// públicas sin sesión, log de accesos, rate-limit — con su propio
// ciclo de vida (invitar → sellar → salir → revocar). Vive acá,
// aislado y auditable, y consume la API pública de G-15
// (getContador / getPaquete / paqueteCSV): no duplica ni un dato.
//
// EL SELLO DE LA INVITACIÓN (la misma disciplina que G-15):
// · crearAcceso es un acto del dueño autenticado que NO envía
//   nada: deja el acceso «activo» con la invitación «preparada»
//   y SIN token vivo (el enlace todavía no existe);
// · aprobarInvitacion es el sello: solo el dueño, registrado en
//   gesty_contador_acceso_aprobaciones + el registro durable,
//   idempotente, con los rechazos esperados devueltos (no
//   lanzados) y registrados, como aprobarPaquete;
// · enviarInvitacion es LA ÚNICA vía de salida por email y
//   exige el sello de la RONDA vigente; sin sello no sale y el
//   intento queda en el registro (invitacion-contador-
//   rechazada-sin-ok), como enviarPaquete;
// · compartirInvitacion es el análogo de la entrega manual de
//   G-15: el dueño copia el enlace y lo entrega por su cuenta —
//   no es un envío de Gesty, no pide sello, pero exige su medio
//   y queda registrado igual.
//
// EL TOKEN (nace en la salida, nunca antes):
// · 32 bytes aleatorios (patrón de la casa: magic links / reset),
//   guardado SOLO como hash SHA-256 con índice único; en la base
//   y en el registro vive apenas su huella corta (8 hex del hash);
// · cada salida (email o enlace copiado) MIENTA un token nuevo y
//   mata el anterior: hay exactamente UN enlace vivo por acceso
//   y la respuesta lo declara (reemplazo_anterior). Reinvitar
//   mata el token en el acto y abre una ronda nueva (el sello
//   anterior no sirve para la ronda nueva);
// · la validación busca por el hash (índice) y compara en tiempo
//   constante; revocado o vencido, el token muere en la request
//   siguiente — no hay caché de sesiones del portal.
//
// LO QUE EL CONTADOR VE (alcance mínimo y cerrado):
// SOLO los paquetes de SU dueño (user_id del acceso) cuya
// destinatario es SU email y que ya SALIERON (estado «enviado» o
// «entregado-manual»): las versiones tal como fueron armadas, en
// el formato en que se entregaron, con descarga CSV/JSON de esos
// paquetes. Nada más: ni paquetes sin entregar, ni otros
// períodos fuera de un paquete, ni otras áreas, ni otra cuenta.
// El namespace del portal es SOLO GET: cualquier escritura es un
// 405 y, si el token es válido, queda registrada como intento.
//
// LOG DE ACCESOS (durable, consultable por el dueño):
// cada lectura del contador (ver paquetes, ver paquete, bajar
// CSV/JSON) deja fila en gesty_contador_acceso_log + evento en
// el registro de la cuenta (actor «contador»). Los intentos con
// un token conocido pero revocado/vencido también: acceso-
// denegado con su motivo. Un token desconocido no se puede
// atribuir a ninguna cuenta: lo frena el rate-limit.
//
// RATE-LIMIT: el limitador de auth de la casa (authHitCount)
// vive en server.js y no es alcanzable desde los módulos; este
// módulo trae el suyo, en memoria, con la misma ventana y
// espíritu: máx. 30 validaciones fallidas por IP en 15 minutos
// y máx. 300 lecturas del portal por IP en 15 minutos.
// =====================================================================
'use strict';

const crypto = require('crypto');

const gesty = require('./gesty');
const contador = require('./gesty-contador');

// ---------------------------------------------------------------------------
// Utilidades (los patrones de la casa)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function sha256Hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function ahoraISO(opts) {
  const o = opts || {};
  if (o.ahora) return new Date(o.ahora).toISOString();
  return new Date().toISOString();
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIAS_DEFAULT = 90;
const DIAS_MIN = 1;
const DIAS_MAX = 365;

// El canal de email de la app, inyectado por server.js (el mismo
// patrón que G-15: configure).
const _cfg = { sendEmail: null };
function configure(opts) {
  const o = opts || {};
  if (o.sendEmail !== undefined) _cfg.sendEmail = typeof o.sendEmail === 'function' ? o.sendEmail : null;
}
function baseUrl() {
  return (process.env.BASE_URL || 'https://postycommunitymanager.com').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  contador.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_contador_accesos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    nombre TEXT NOT NULL DEFAULT '',
    token_hash TEXT NOT NULL DEFAULT '',
    huella TEXT NOT NULL DEFAULT '',
    token_creado_en TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'activo',
    invitacion TEXT NOT NULL DEFAULT 'preparada',
    ronda INTEGER NOT NULL DEFAULT 1,
    dias_validez INTEGER NOT NULL DEFAULT ${DIAS_DEFAULT},
    vence_en TEXT NOT NULL DEFAULT '',
    creado_por TEXT NOT NULL DEFAULT 'dueno',
    revocado_en TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_contador_accesos_user ON gesty_contador_accesos(user_id, estado);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_contador_accesos_hash ON gesty_contador_accesos(token_hash) WHERE token_hash <> '';
  CREATE TABLE IF NOT EXISTS gesty_contador_acceso_aprobaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    acceso_id INTEGER NOT NULL,
    ronda INTEGER NOT NULL DEFAULT 1,
    usuario TEXT NOT NULL DEFAULT 'dueno',
    accion TEXT NOT NULL DEFAULT 'invitar',
    resultado TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_contador_acceso_aprob_user ON gesty_contador_acceso_aprobaciones(user_id, acceso_id);
  CREATE TABLE IF NOT EXISTS gesty_contador_invitaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    acceso_id INTEGER NOT NULL,
    ronda INTEGER NOT NULL DEFAULT 1,
    canal TEXT NOT NULL DEFAULT 'email',
    destinatario TEXT NOT NULL DEFAULT '',
    resultado TEXT NOT NULL DEFAULT '',
    comprobante TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_contador_invitaciones_user ON gesty_contador_invitaciones(user_id, acceso_id);
  CREATE TABLE IF NOT EXISTS gesty_contador_acceso_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    acceso_id INTEGER NOT NULL,
    accion TEXT NOT NULL DEFAULT '',
    paquete_id INTEGER,
    detalle TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_contador_acceso_log_user ON gesty_contador_acceso_log(user_id, acceso_id, id);
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// Rate-limit propio del portal (en memoria; ver el encabezado)
// ---------------------------------------------------------------------------

const _hits = new Map(); // clave -> [timestamps ms]
function _contar(clave, ventanaMs, ahoraMs) {
  const arr = (_hits.get(clave) || []).filter((t) => ahoraMs - t < ventanaMs);
  _hits.set(clave, arr);
  return arr.length;
}
function _registrar(clave, ahoraMs) {
  const arr = _hits.get(clave) || [];
  arr.push(ahoraMs);
  _hits.set(clave, arr);
}
const VENTANA_MS = 15 * 60 * 1000;
const MAX_FALLOS_IP = 30;
const MAX_LECTURAS_IP = 300;
function _resetRateLimit() { _hits.clear(); } // solo para tests

// ---------------------------------------------------------------------------
// EL ACCESO: lectura y forma pública (sin hash, sin token: solo
// la huella corta, que es lo que el dueño ve y el log cita)
// ---------------------------------------------------------------------------

function parseAccesoRow(r, opts) {
  if (!r) return null;
  const ahora = ahoraISO(opts);
  const vencido = r.estado === 'activo' && !!r.vence_en && r.vence_en <= ahora;
  return {
    id: r.id,
    email: r.email,
    nombre: r.nombre,
    estado: r.estado === 'activo' && vencido ? 'vencido' : r.estado,
    estado_guardado: r.estado,
    vencido,
    invitacion: r.invitacion,
    ronda: r.ronda,
    dias_validez: r.dias_validez,
    vence_en: r.vence_en,
    huella: r.huella || '',
    tiene_enlace_vivo: !!r.token_hash,
    enlace_desde: r.token_creado_en || '',
    creado_por: r.creado_por,
    creado_en: r.created_at,
    revocado_en: r.revocado_en || '',
  };
}

function filaAcceso(db, accesoId) {
  return db.prepare('SELECT * FROM gesty_contador_accesos WHERE id = ?').get(Number(accesoId)) || null;
}
function getAcceso(db, userId, accesoId, opts) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_contador_accesos WHERE id = ? AND user_id = ?').get(Number(accesoId), userId);
  return parseAccesoRow(r, opts);
}
function listAccesos(db, userId, opts) {
  ensureSchema(db);
  const rows = db.prepare('SELECT * FROM gesty_contador_accesos WHERE user_id = ? ORDER BY id DESC').all(userId);
  return rows.map((r) => {
    const a = parseAccesoRow(r, opts);
    const ultimo = db.prepare('SELECT accion, created_at FROM gesty_contador_acceso_log WHERE acceso_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
    a.ultimo_acceso = ultimo ? { accion: ultimo.accion, fecha: ultimo.created_at } : null;
    a.lecturas = Number((db.prepare('SELECT COUNT(*) AS c FROM gesty_contador_acceso_log WHERE acceso_id = ?').get(r.id) || {}).c || 0);
    return a;
  });
}

// ---------------------------------------------------------------------------
// CREAR EL ACCESO (acto del dueño; no envía nada, no mienta token)
// ---------------------------------------------------------------------------

function validarDias(dias) {
  if (dias === undefined || dias === null || dias === '') return DIAS_DEFAULT;
  const n = Number(dias);
  if (!Number.isInteger(n) || n < DIAS_MIN || n > DIAS_MAX) {
    fail(`La validez del acceso va de ${DIAS_MIN} a ${DIAS_MAX} días.`);
  }
  return n;
}
function calcularVence(ahoraIsoStr, dias) {
  return new Date(new Date(ahoraIsoStr).getTime() + dias * 24 * 3600 * 1000).toISOString();
}

function crearAcceso(db, userId, datos, opts) {
  ensureSchema(db);
  const d = datos || {};
  const o = opts || {};
  const perfil = contador.getContador(db, userId);
  const email = normTexto(d.email || perfil.email || '');
  if (!email) fail('No hay a quién invitar: cargá el email de tu contador en el fundamento o pasalo en la invitación.');
  if (!EMAIL_RE.test(email)) fail(`Ese email no parece válido: ${email}.`);
  const nombre = normTexto(d.nombre || perfil.nombre || '');
  const dias = validarDias(d.dias_validez !== undefined ? d.dias_validez : d.dias);
  const existente = db.prepare(`SELECT * FROM gesty_contador_accesos WHERE user_id = ? AND lower(email) = lower(?) AND estado = 'activo'`)
    .get(userId, email);
  if (existente) {
    fail(`Ya hay un acceso activo para ${email} (#${existente.id}): reinvitalo para un enlace nuevo o revocalo antes de crear otro.`);
  }
  const ahora = ahoraISO(o);
  const vence = calcularVence(ahora, dias);
  const info = db.prepare(`INSERT INTO gesty_contador_accesos (user_id, email, nombre, dias_validez, vence_en, creado_por)
    VALUES (?,?,?,?,?,?)`).run(userId, email, nombre, dias, vence, 'dueno');
  const id = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'acceso-contador', entidad_id: String(id),
    tipo_evento: 'acceso-contador-creado',
    resumen: `Acceso de solo lectura creado para el contador ${nombre || email} <${email}>: vence el ${vence.slice(0, 10)}. La invitación todavía no salió.`,
    payload: { acceso_id: id, ronda: 1, vence_en: vence, dias_validez: dias },
  });
  return getAcceso(db, userId, id, o);
}

// ---------------------------------------------------------------------------
// EL SELLO DE LA INVITACIÓN (espejo de aprobarPaquete de G-15):
// aprobarInvitacion NO lanza por los rechazos esperados:
// devuelve { ok:false, motivo } y TODO queda registrado.
// ---------------------------------------------------------------------------

function logAprobacionAcceso(db, userId, accesoId, ronda, usuario, accion, resultado, motivo) {
  db.prepare(`INSERT INTO gesty_contador_acceso_aprobaciones (user_id, acceso_id, ronda, usuario, accion, resultado, motivo)
    VALUES (?,?,?,?,?,?,?)`).run(userId, accesoId, ronda, usuario || 'dueno', accion, resultado, motivo || '');
}

function selloInvitacionVigente(db, userId, accesoRow) {
  const r = db.prepare(`SELECT * FROM gesty_contador_acceso_aprobaciones
    WHERE user_id = ? AND acceso_id = ? AND ronda = ? AND accion = 'invitar' AND resultado = 'ejecutada'
    ORDER BY id DESC LIMIT 1`).get(userId, accesoRow.id, accesoRow.ronda);
  return r || null;
}

function aprobarInvitacion(db, userId, accesoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const usuario = String(o.usuario || 'dueno');
  const id = Number(accesoId);
  const row = filaAcceso(db, id);
  if (!row) {
    logAprobacionAcceso(db, userId, id, Number(o.ronda) || 0, usuario, 'invitar', 'rechazada', 'acceso-inexistente');
    return { ok: false, error: 'El acceso no existe.', motivo: 'acceso-inexistente' };
  }
  if (row.user_id !== userId) {
    logAprobacionAcceso(db, userId, id, Number(o.ronda) || 0, usuario, 'invitar', 'rechazada', 'acceso-ajeno');
    return { ok: false, error: 'Ese acceso no es de esta cuenta.', motivo: 'acceso-ajeno' };
  }
  const rechazar = (motivo, error) => {
    logAprobacionAcceso(db, userId, id, row.ronda, usuario, 'invitar', 'rechazada', motivo);
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'acceso-contador', entidad_id: String(id),
      tipo_evento: 'invitacion-contador-rechazada', resumen: `Sello de la invitación rechazado: ${error}`,
      payload: { acceso_id: id, ronda: row.ronda, motivo },
    });
    return { ok: false, error, motivo, acceso: parseAccesoRow(row, o) };
  };
  const rondaPedida = Number(o.ronda);
  if (Number.isInteger(rondaPedida) && rondaPedida !== row.ronda) {
    return rechazar('ronda-vieja', 'La invitación cambió desde que se preparó (hay una ronda nueva): revisá la vigente antes de dar el OK.');
  }
  if (row.estado !== 'activo') return rechazar('acceso-revocado', 'Ese acceso está revocado: creá uno nuevo para volver a invitar.');
  const ahora = ahoraISO(o);
  if (row.vence_en && row.vence_en <= ahora) return rechazar('acceso-vencido', 'Ese acceso ya venció: reinvitalo para abrir una ronda con validez nueva.');
  if (row.invitacion === 'enviada' || row.invitacion === 'compartida') {
    return rechazar('ya-salio', 'La invitación de esta ronda ya salió: para mandar otra, reinvitá (se abre una ronda nueva y el enlace anterior muere).');
  }
  if (row.invitacion === 'aprobada' && selloInvitacionVigente(db, userId, row)) {
    return { ok: true, idempotente: true, acceso: parseAccesoRow(row, o) };
  }
  db.prepare(`UPDATE gesty_contador_accesos SET invitacion = 'aprobada', updated_at = datetime('now') WHERE id = ?`).run(id);
  logAprobacionAcceso(db, userId, id, row.ronda, usuario, 'invitar', 'ejecutada', '');
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'acceso-contador', entidad_id: String(id),
    tipo_evento: 'invitacion-contador-aprobada',
    resumen: `OK del dueño: la invitación al portal sale para ${row.nombre || row.email} <${row.email}> (ronda ${row.ronda}).`,
    payload: { acceso_id: id, ronda: row.ronda, destinatario_email: row.email },
  });
  return { ok: true, acceso: getAcceso(db, userId, id, o) };
}

// ---------------------------------------------------------------------------
// LA SALIDA: el token nace acá. Cada salida mienta uno nuevo y
// mata el anterior (un solo enlace vivo por acceso).
// ---------------------------------------------------------------------------

function mentarToken(db, row, opts) {
  const plano = crypto.randomBytes(32).toString('hex');
  const hash = sha256Hex(plano);
  const huella = hash.slice(0, 8);
  db.prepare(`UPDATE gesty_contador_accesos SET token_hash = ?, huella = ?, token_creado_en = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(hash, huella, ahoraISO(opts), row.id);
  return { plano, huella };
}
function enlaceDe(plano) { return `${baseUrl()}/api/portal-contador?t=${plano}`; }

async function enviarInvitacion(db, userId, accesoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const row0 = filaAcceso(db, Number(accesoId));
  if (!row0 || row0.user_id !== userId) fail('Ese acceso no es de esta cuenta.');
  const acceso = parseAccesoRow(row0, o);

  // Reenviar lo ya enviado devuelve el envío registrado: el
  // email no sale dos veces (idempotencia, como la R5 de G-15).
  if (row0.invitacion === 'enviada') {
    const prev = db.prepare(`SELECT * FROM gesty_contador_invitaciones WHERE user_id = ? AND acceso_id = ? AND ronda = ? AND resultado = 'enviada' ORDER BY id DESC LIMIT 1`)
      .get(userId, row0.id, row0.ronda);
    if (prev) return { ok: true, idempotente: true, acceso, envio: { canal: 'email', destinatario: prev.destinatario, comprobante: prev.comprobante, fecha: prev.created_at } };
  }
  const rechazarSalida = (motivo, mensaje) => {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'acceso-contador', entidad_id: String(row0.id),
      tipo_evento: 'invitacion-contador-rechazada-sin-ok',
      resumen: `La invitación al portal para ${row0.email} NO salió: ${mensaje}`,
      payload: { acceso_id: row0.id, ronda: row0.ronda, motivo },
    });
    fail(mensaje);
  };
  if (row0.estado !== 'activo') rechazarSalida('acceso-revocado', 'ese acceso está revocado.');
  if (acceso.vencido) rechazarSalida('acceso-vencido', 'ese acceso ya venció: reinvitalo para abrir una ronda nueva.');
  if (row0.invitacion === 'compartida') {
    rechazarSalida('ya-compartida', 'esta ronda ya salió por enlace copiado: para que salga por email, reinvitá (ronda nueva) y da el OK.');
  }
  if (row0.invitacion !== 'aprobada' || !selloInvitacionVigente(db, userId, row0)) {
    rechazarSalida('sin-ok', 'sin el OK del dueño no sale: esta invitación no tiene su sello registrado.');
  }
  if (!_cfg.sendEmail) fail('El canal de email no está disponible en este servidor.');

  const teniaEnlace = !!row0.token_hash;
  const { plano, huella } = mentarToken(db, row0, o);
  const enlace = enlaceDe(plano);
  const negocio = (() => {
    const dd = gesty.getData(db, userId, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
    return dd && dd.valor ? String(dd.valor) : '';
  })();
  const subject = `Tu acceso a la carpeta de ${negocio || 'tu cliente'} — Gesty`;
  const text = [
    `${row0.nombre ? `${row0.nombre}: ` : ''}${negocio || 'Tu cliente'} te da acceso de solo lectura a su carpeta mensual en Gesty.`,
    'Ahí ves los paquetes que te entregó (comprobantes clasificados, el cierre del mes en tu formato) y los podés descargar.',
    `Tu enlace personal: ${enlace}`,
    `Vence el ${row0.vence_en.slice(0, 10)}. Es solo lectura: no podés editar ni aprobar nada.`,
    'Si no esperabas esta invitación, ignorá este email.',
  ].join('\n');
  const html = [
    `<h2>Tu carpeta en Gesty${negocio ? ` — ${negocio}` : ''}</h2>`,
    `<p>${negocio || 'Tu cliente'} te da acceso de <strong>solo lectura</strong> a los paquetes de su carpeta mensual: comprobantes clasificados y el cierre del mes en tu formato, listos para descargar.</p>`,
    `<p style="text-align:center;margin:24px 0"><a href="${enlace}" style="display:inline-block;background:#472B5E;color:#fff;font-weight:700;padding:12px 28px;border-radius:999px;text-decoration:none">Ver la carpeta</a></p>`,
    `<p>El enlace es personal y vence el ${row0.vence_en.slice(0, 10)}. Si el botón no abre, copiá esta dirección: ${enlace}</p>`,
  ].join('\n');
  let r;
  try { r = await _cfg.sendEmail({ to: row0.email, subject, html, text }); }
  catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) {
    const motivo = r && r.skipped ? 'el servidor no tiene el canal de email configurado' : 'el proveedor de email rechazó el envío';
    // El token recién mentado muere: no quedó ningún enlace
    // «enviado» a medias dando vueltas sin que nadie lo tenga.
    db.prepare(`UPDATE gesty_contador_accesos SET token_hash = '', huella = '', token_creado_en = '', updated_at = datetime('now') WHERE id = ?`).run(row0.id);
    db.prepare(`INSERT INTO gesty_contador_invitaciones (user_id, acceso_id, ronda, canal, destinatario, resultado, comprobante, detalle)
      VALUES (?,?,?, 'email', ?, 'fallida', '', ?)`).run(userId, row0.id, row0.ronda, row0.email, motivo);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'acceso-contador', entidad_id: String(row0.id),
      tipo_evento: 'invitacion-contador-envio-fallido',
      resumen: `La invitación al portal para ${row0.email} NO salió por email: ${motivo}. Sigue aprobada, lista para reintentar.`,
      payload: { acceso_id: row0.id, ronda: row0.ronda, motivo },
    });
    fail(`El email no salió (${motivo}). La invitación sigue aprobada: nada quedó enviado a medias.`);
  }
  const comprobante = String(r.id || r.provider_id || 'email');
  db.prepare(`INSERT INTO gesty_contador_invitaciones (user_id, acceso_id, ronda, canal, destinatario, resultado, comprobante, detalle)
    VALUES (?,?,?, 'email', ?, 'enviada', ?, '')`).run(userId, row0.id, row0.ronda, row0.email, comprobante);
  db.prepare(`UPDATE gesty_contador_accesos SET invitacion = 'enviada', updated_at = datetime('now') WHERE id = ?`).run(row0.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'acceso-contador', entidad_id: String(row0.id),
    tipo_evento: 'invitacion-contador-enviada',
    resumen: `Invitación al portal enviada por email a ${row0.nombre || row0.email} <${row0.email}> (ronda ${row0.ronda}, huella ${huella}).`,
    payload: { acceso_id: row0.id, ronda: row0.ronda, destinatario_email: row0.email, huella },
    comprobante_externo: comprobante,
  });
  return {
    ok: true, acceso: getAcceso(db, userId, row0.id, o),
    envio: { canal: 'email', destinatario: row0.email, comprobante, fecha: new Date().toISOString() },
    enlace, reemplazo_anterior: teniaEnlace,
  };
}

// Compartir el enlace (el análogo de la entrega manual de G-15):
// el dueño lo copia y lo entrega por su cuenta. Sin sello — es
// el dueño actuando — pero con medio obligatorio y registrado.
function compartirInvitacion(db, userId, accesoId, datos, opts) {
  ensureSchema(db);
  const d = datos || {};
  const o = opts || {};
  const row = filaAcceso(db, Number(accesoId));
  if (!row || row.user_id !== userId) fail('Ese acceso no es de esta cuenta.');
  const acceso = parseAccesoRow(row, o);
  if (row.estado !== 'activo') fail('Ese acceso está revocado: no tiene enlace para compartir.');
  if (acceso.vencido) fail('Ese acceso ya venció: reinvitalo para abrir una ronda con validez nueva.');
  if (row.invitacion === 'enviada') fail('Esta ronda ya salió por email: el enlace vigente es el de ese email. Para uno nuevo, reinvitá.');
  if (row.invitacion === 'aprobada') fail('Esta ronda ya tiene tu OK para salir por email: enviala, o reinvitá si preferís compartir el enlace vos.');
  const medio = normTexto(d.medio || '');
  if (!medio) fail('Compartir el enlace se registra con su medio (cómo lo entregás: se lo paso por WhatsApp, lo pego en mi email…): sin medio, no hay entrega registrada.');
  const teniaEnlace = !!row.token_hash;
  const { plano, huella } = mentarToken(db, row, o);
  const enlace = enlaceDe(plano);
  db.prepare(`INSERT INTO gesty_contador_invitaciones (user_id, acceso_id, ronda, canal, destinatario, resultado, comprobante, detalle)
    VALUES (?,?,?, 'manual', ?, 'compartida', ?, '')`).run(userId, row.id, row.ronda, row.email, medio);
  db.prepare(`UPDATE gesty_contador_accesos SET invitacion = 'compartida', updated_at = datetime('now') WHERE id = ?`).run(row.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'acceso-contador', entidad_id: String(row.id),
    tipo_evento: 'invitacion-contador-compartida',
    resumen: `El dueño compartió el enlace del portal con ${row.nombre || row.email} <${row.email}>: ${medio} (ronda ${row.ronda}, huella ${huella}).`,
    payload: { acceso_id: row.id, ronda: row.ronda, medio, huella },
    comprobante_externo: medio,
  });
  return { ok: true, acceso: getAcceso(db, userId, row.id, o), enlace, reemplazo_anterior: teniaEnlace };
}

// ---------------------------------------------------------------------------
// REVOCAR (en un toque: muere en el acto) Y REINVITAR (ronda
// nueva: el token viejo muere acá mismo, el sello anterior no
// sirve para la ronda nueva y hay que salir de nuevo)
// ---------------------------------------------------------------------------

function revocarAcceso(db, userId, accesoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const row = filaAcceso(db, Number(accesoId));
  if (!row || row.user_id !== userId) fail('Ese acceso no es de esta cuenta.');
  if (row.estado === 'revocado') fail('Ese acceso ya está revocado.');
  db.prepare(`UPDATE gesty_contador_accesos SET estado = 'revocado', revocado_en = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(row.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'acceso-contador', entidad_id: String(row.id),
    tipo_evento: 'acceso-contador-revocado',
    resumen: `Acceso al portal revocado para ${row.nombre || row.email} <${row.email}>: su enlace dejó de andar en el acto.`,
    payload: { acceso_id: row.id, ronda: row.ronda, huella: row.huella || '' },
  });
  return getAcceso(db, userId, row.id, o);
}

function reinvitarAcceso(db, userId, accesoId, datos, opts) {
  ensureSchema(db);
  const d = datos || {};
  const o = opts || {};
  const row = filaAcceso(db, Number(accesoId));
  if (!row || row.user_id !== userId) fail('Ese acceso no es de esta cuenta.');
  if (row.estado !== 'activo') fail('Ese acceso está revocado: para volver a invitar a este contador, creá un acceso nuevo.');
  const dias = validarDias(d.dias_validez !== undefined ? d.dias_validez : (d.dias !== undefined ? d.dias : row.dias_validez));
  const ahora = ahoraISO(o);
  const vence = calcularVence(ahora, dias);
  const ronda = row.ronda + 1;
  db.prepare(`UPDATE gesty_contador_accesos SET ronda = ?, invitacion = 'preparada', dias_validez = ?, vence_en = ?,
    token_hash = '', huella = '', token_creado_en = '', updated_at = datetime('now') WHERE id = ?`)
    .run(ronda, dias, vence, row.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'acceso-contador', entidad_id: String(row.id),
    tipo_evento: 'acceso-contador-reinvitado',
    resumen: `Reinvitación al portal para ${row.nombre || row.email} <${row.email}>: ronda ${ronda}, el enlace anterior murió y la validez corre hasta el ${vence.slice(0, 10)}. La invitación nueva todavía no salió.`,
    payload: { acceso_id: row.id, ronda, vence_en: vence, dias_validez: dias },
  });
  return getAcceso(db, userId, row.id, o);
}

// ---------------------------------------------------------------------------
// EL PORTAL: resolución del token y lecturas de solo lectura
// ---------------------------------------------------------------------------

function registrarLog(db, accesoRow, accion, paqueteId, detalle) {
  db.prepare(`INSERT INTO gesty_contador_acceso_log (user_id, acceso_id, accion, paquete_id, detalle)
    VALUES (?,?,?,?,?)`).run(accesoRow.user_id, accesoRow.id, accion, paqueteId || null, detalle || '');
}

function eventoPortal(db, accesoRow, tipo, resumen, payload) {
  gesty.recordEvent(db, accesoRow.user_id, {
    actor: 'contador', entidad_tipo: 'acceso-contador', entidad_id: String(accesoRow.id),
    tipo_evento: tipo, resumen, payload: payload || {},
  });
}

// resolverAcceso: la ÚNICA puerta del portal. Devuelve
// { ok:true, acceso } o { ok:false, status, error, motivo }.
// Aplica el rate-limit (con la IP que pasa la ruta) y registra
// los accesos denegados de tokens conocidos (revocado/vencido).
function resolverAcceso(db, tokenPlano, opts) {
  ensureSchema(db);
  const o = opts || {};
  const ip = String(o.ip || 'sin-ip');
  const ahoraMs = Date.now();
  if (_contar(`portal|${ip}`, VENTANA_MS, ahoraMs) >= MAX_LECTURAS_IP) {
    return { ok: false, status: 429, motivo: 'limite', error: 'Demasiadas lecturas desde esta conexión. Esperá unos minutos.' };
  }
  _registrar(`portal|${ip}`, ahoraMs);
  const token = normTexto(tokenPlano || '');
  const denegado = (status, motivo, error) => ({ ok: false, status, motivo, error });
  if (!token || token.length < 32) return denegado(401, 'sin-token', 'Este enlace no es válido.');
  if (_contar(`portal-fallo|${ip}`, VENTANA_MS, ahoraMs) >= MAX_FALLOS_IP) {
    return denegado(429, 'limite-fallos', 'Demasiados intentos con enlaces inválidos. Esperá unos minutos.');
  }
  const hash = sha256Hex(token);
  const row = db.prepare('SELECT * FROM gesty_contador_accesos WHERE token_hash = ?').get(hash);
  if (!row || !crypto.timingSafeEqual(Buffer.from(hash, 'utf8'), Buffer.from(String(row.token_hash), 'utf8'))) {
    _registrar(`portal-fallo|${ip}`, ahoraMs);
    return denegado(401, 'token-invalido', 'Este enlace no es válido.');
  }
  if (row.estado !== 'activo') {
    registrarLog(db, row, 'acceso-denegado', null, 'motivo: revocado');
    eventoPortal(db, row, 'contador-portal-acceso-denegado',
      `El contador ${row.email} intentó entrar con un enlace revocado: quedó afuera.`,
      { acceso_id: row.id, motivo: 'revocado', huella: row.huella || '' });
    _registrar(`portal-fallo|${ip}`, ahoraMs);
    return denegado(401, 'revocado', 'Este acceso fue revocado por el dueño de la carpeta.');
  }
  const ahora = ahoraISO(o);
  if (row.vence_en && row.vence_en <= ahora) {
    registrarLog(db, row, 'acceso-denegado', null, 'motivo: vencido');
    eventoPortal(db, row, 'contador-portal-acceso-denegado',
      `El contador ${row.email} intentó entrar con un enlace vencido: quedó afuera.`,
      { acceso_id: row.id, motivo: 'vencido', huella: row.huella || '' });
    _registrar(`portal-fallo|${ip}`, ahoraMs);
    return denegado(401, 'vencido', 'Este enlace venció. Pedile al dueño de la carpeta que te lo reenvíe.');
  }
  return { ok: true, acceso: row };
}

// Los paquetes que ESTE contador puede ver: de su dueño, para
// su email, ya entregados. Ni uno más.
function paquetesVisibles(db, accesoRow) {
  return contador.listPaquetes(db, accesoRow.user_id, {})
    .filter((p) => (p.estado === 'enviado' || p.estado === 'entregado-manual')
      && String(p.destinatario.email || '').toLowerCase() === String(accesoRow.email || '').toLowerCase());
}

function portalResumen(db, accesoRow) {
  const paquetes = paquetesVisibles(db, accesoRow);
  registrarLog(db, accesoRow, 'ver-paquetes', null, `${paquetes.length} paquete(s) visibles`);
  eventoPortal(db, accesoRow, 'contador-portal-vio',
    `Tu contador ${accesoRow.email} entró al portal y vio su lista de paquetes (${paquetes.length}).`,
    { acceso_id: accesoRow.id, accion: 'ver-paquetes' });
  const negocio = (() => {
    const dd = gesty.getData(db, accesoRow.user_id, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
    return dd && dd.valor ? String(dd.valor) : '';
  })();
  return {
    negocio,
    contador: { nombre: accesoRow.nombre || '', email: accesoRow.email },
    vence_en: accesoRow.vence_en,
    paquetes: paquetes.map((p) => ({
      id: p.id, periodo: p.periodo, version: p.version,
      formato: p.formato, formato_origen: p.formato_origen,
      estado: p.estado, totales: p.totales,
      faltantes: (p.faltantes || []).length,
      entregado_en: p.actualizado_en,
    })),
  };
}

function portalPaquete(db, accesoRow, paqueteId) {
  const visibles = paquetesVisibles(db, accesoRow);
  const p = visibles.find((x) => x.id === Number(paqueteId));
  if (!p) return null;
  registrarLog(db, accesoRow, 'ver-paquete', p.id, `período ${p.periodo} · versión ${p.version} · formato ${p.formato}`);
  eventoPortal(db, accesoRow, 'contador-portal-vio',
    `Tu contador ${accesoRow.email} vio el paquete de ${p.periodo} (versión ${p.version}) en el portal.`,
    { acceso_id: accesoRow.id, accion: 'ver-paquete', paquete_id: p.id, periodo: p.periodo });
  return p;
}

function portalPaqueteCSV(db, accesoRow, paqueteId) {
  const visibles = paquetesVisibles(db, accesoRow);
  const p = visibles.find((x) => x.id === Number(paqueteId));
  if (!p) return null;
  const csv = contador.paqueteCSV(db, accesoRow.user_id, p.id);
  registrarLog(db, accesoRow, 'descargar-csv', p.id, `período ${p.periodo} · versión ${p.version}`);
  eventoPortal(db, accesoRow, 'contador-portal-descargo',
    `Tu contador ${accesoRow.email} descargó el CSV del paquete de ${p.periodo} (versión ${p.version}).`,
    { acceso_id: accesoRow.id, accion: 'descargar-csv', paquete_id: p.id, periodo: p.periodo });
  return { paquete: p, csv };
}

function portalPaqueteJSON(db, accesoRow, paqueteId) {
  const visibles = paquetesVisibles(db, accesoRow);
  const p = visibles.find((x) => x.id === Number(paqueteId));
  if (!p) return null;
  registrarLog(db, accesoRow, 'descargar-json', p.id, `período ${p.periodo} · versión ${p.version}`);
  eventoPortal(db, accesoRow, 'contador-portal-descargo',
    `Tu contador ${accesoRow.email} descargó el JSON del paquete de ${p.periodo} (versión ${p.version}).`,
    { acceso_id: accesoRow.id, accion: 'descargar-json', paquete_id: p.id, periodo: p.periodo });
  return p;
}

// Un intento de escritura con el acceso del contador: queda
// registrado como intento (la ruta responde 405).
function registrarIntentoEscritura(db, accesoRow, metodo, ruta) {
  registrarLog(db, accesoRow, 'intento-escritura', null, `${metodo} ${ruta}`);
  eventoPortal(db, accesoRow, 'contador-portal-intento-escritura',
    `El acceso de tu contador ${accesoRow.email} intentó escribir en el portal (${metodo} ${ruta}): el portal es de solo lectura y el intento quedó registrado.`,
    { acceso_id: accesoRow.id, accion: 'intento-escritura', metodo: String(metodo || ''), ruta: String(ruta || '') });
}

function listAccesoLog(db, userId, accesoId, opts) {
  ensureSchema(db);
  const acceso = getAcceso(db, userId, accesoId, opts);
  if (!acceso) fail('Ese acceso no es de esta cuenta.');
  const o = opts || {};
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const rows = db.prepare('SELECT * FROM gesty_contador_acceso_log WHERE user_id = ? AND acceso_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, acceso.id, lim);
  return rows.map((r) => ({
    id: r.id, accion: r.accion, paquete_id: r.paquete_id || null,
    detalle: r.detalle || '', fecha: r.created_at,
  }));
}

function listInvitaciones(db, userId, accesoId) {
  ensureSchema(db);
  const acceso = getAcceso(db, userId, accesoId);
  if (!acceso) fail('Ese acceso no es de esta cuenta.');
  return db.prepare('SELECT * FROM gesty_contador_invitaciones WHERE user_id = ? AND acceso_id = ? ORDER BY id ASC')
    .all(userId, acceso.id)
    .map((r) => ({
      id: r.id, ronda: r.ronda, canal: r.canal, destinatario: r.destinatario,
      resultado: r.resultado, comprobante: r.comprobante, detalle: r.detalle, fecha: r.created_at,
    }));
}

module.exports = {
  // esquema y canal
  ensureSchema, configure,
  // el acceso (lado del dueño)
  crearAcceso, getAcceso, listAccesos,
  // el sello y las salidas de la invitación
  aprobarInvitacion, enviarInvitacion, compartirInvitacion,
  // revocación y reinvitación
  revocarAcceso, reinvitarAcceso,
  // el portal (lado del contador)
  resolverAcceso, portalResumen, portalPaquete, portalPaqueteCSV, portalPaqueteJSON,
  registrarIntentoEscritura,
  // log e historial, consultables por el dueño
  listAccesoLog, listInvitaciones,
  // solo para tests
  _resetRateLimit,
};
