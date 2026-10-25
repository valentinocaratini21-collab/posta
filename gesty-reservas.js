// =====================================================================
// GESTY · G-14 — AUTORESPUESTA PROPIA (sistema de reservas del website)
// Spec: gesty-cola-builds.md G-14 («Respuesta automática propia al
// que reserva», decisión del tablero por el mandato «pensá por mí»,
// 2026-10-24) + la regla de verdad auditada el 2026-10-24 (hasta que
// este build viviera, el sitio NO prometía ningún email automático:
// el _autoresponse de FormSubmit estaba configurado pero nunca
// llegaba — verificado).
//
// QUÉ ES: la ingesta pública de las reservas de gestyofficemanager.com
// y su confirmación transaccional por el canal de email de la app
// (./email sendEmail, inyectado por configure — el mismo que usan
// Facturación y Contador). SIN servicio de email pago y SIN prometer
// nada que no ocurra: si el canal no entrega, la reserva queda
// registrada con su email «fallido» y el motivo literal del canal.
//
// QUÉ NO ES: no es una capacidad de cliente. NO depende de packs ni
// de cuentas: una reserva del sitio es un lead de Gesty, no un dato
// de un cliente — por eso el registro durable son las tablas propias
// de este módulo (gesty_reservas / _envios / _descartes) y NO el
// registro por cuenta gesty_events (no hay user_id al que atribuirla
// sin contaminar la historia de una cuenta ajena).
//
// CONTRATO PARA EL RECABLEO DEL SITIO (deploy propio, fuera de este
// build — el formulario sigue con FormSubmit como respaldo hasta
// entonces):
//   POST /api/gesty/reservas/ingresar
//   Origen: el navegador debe mandar Origin (o Referer) de
//     https://gestyofficemanager.com o https://www.gestyofficemanager.com
//     — cualquier otro origen (o ninguno) se rechaza con 403. La ruta
//     responde CORS (incl. preflight OPTIONS) SOLO para esos orígenes.
//   Cuerpo (JSON o application/x-www-form-urlencoded):
//     negocio  (obligatorio, 2–120 caracteres)  nombre del negocio
//     rubro    (obligatorio, 1–80)             la opción del sitio
//     email    (obligatorio, válido)           a dónde va la confirmación
//     dolor    (opcional, ≤120)                la opción del sitio
//     detalle  (opcional, ≤2000)               el texto libre del sitio
//     plan     (opcional: esencial|completa|total — de ?plan=)
//     idioma   (opcional: es|en — según la página; default es)
//     honey    (honeypot; alias _honey del formulario actual:
//               si viene con contenido, descarte silencioso)
//   Respuesta 200: { ok:true, duplicada?:true, reserva:{ id,
//     email_estado: 'enviado'|'fallido', ... } } — la duplicada
//     devuelve la reserva ORIGINAL: ni segundo registro ni segundo
//     email (huella única: email + negocio + rubro + plan).
//   Errores: 400 validación · 403 origen · 429 rate-limit
//     (20 intentos por IP cada 15 minutos, todo intento cuenta).
//
// CONSULTA (la fuente limpia de reservas reales): 
//   GET  /api/gesty/reservas?token=<ADMIN_TOKEN>
//        → { ok, resumen, reservas } detrás de requireAdminToken,
//        el patrón de la casa para lecturas de operaciones
//        (server.js: paneles y endpoints /api/admin/*).
//   POST /api/gesty/reservas/:id/reintentar?token=<ADMIN_TOKEN>
//        → reintenta la confirmación de una reserva con email
//        «fallido»; el intento queda registrado.
//   El cron gesty-revision-datos-2-semanas pasará a contar desde
//   este resumen en vez de escarbar Gmail por asunto (acople
//   declarado; el cron no se toca en este build).
//
// EL EMAIL (copia editable: constantes COPIA_ES / COPIA_EN abajo):
// confirma que la reserva LLEGÓ, dice el lanzamiento (1 de abril
// de 2027) y — solo si eligió plan — su elección con el precio
// publicado y el programa Primeros 50 enunciado como programa
// (las primeras 50 cuentas congelan el precio 12 meses; NO se le
// garantiza a nadie un lugar numerado que no se puede verificar).
// Nada más: ni «te escribimos en 24 h» ni ninguna promesa de
// contacto con fecha — no hay un humano comprometido a eso.
// Sale con Reply-To hola@gestyofficemanager.com (las respuestas
// llegan al inbox de Gesty por el Email Routing de Cloudflare) y
// con el remitente del canal; para que salga DESDE
// hola@gestyofficemanager.com alcanza verificar ese dominio en
// Resend y cargar GESTY_EMAIL_FROM en el entorno (cero código).
// =====================================================================
'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constantes del área
// ---------------------------------------------------------------------------

const ORIGENES_PERMITIDOS = [
  'https://gestyofficemanager.com',
  'https://www.gestyofficemanager.com',
];

const IDIOMAS = ['es', 'en'];

// Espejo de los precios publicados en el sitio (packs de Gesty,
// escalera familiar 2026-10-24). Si el sitio cambia un precio, se
// cambia acá: el email cita SOLO el precio publicado.
const PLANES = {
  esencial: { nombre: 'Esencial', precio: '199.99' },
  completa: { nombre: 'Completa', precio: '299.99' },
  total: { nombre: 'Total', precio: '399.99' },
};

const REPLY_TO = 'hola@gestyofficemanager.com';
const LANZAMIENTO = { es: '1 de abril de 2027', en: 'April 1, 2027' };

const RL_MAX = 20;                 // intentos de ingesta por IP…
const RL_VENTANA_MS = 15 * 60 * 1000; // …cada 15 minutos

// ---------------------------------------------------------------------------
// La copia del email (EDITABLE — revisada por la regla de verdad)
// ---------------------------------------------------------------------------

const COPIA_ES = {
  asunto: 'Reserva recibida · Gesty',
  saludo: '¡Hola!',
  llego: (negocio) => `Tu reserva llegó. Guardamos el lugar de ${negocio} para el lanzamiento de Gesty, el ${LANZAMIENTO.es}.`,
  plan: (nombre, precio) => `Tu elección: Gesty ${nombre} — USD ${precio}/mes.`,
  primeros_50: 'Las primeras 50 cuentas de Gesty congelan su precio de lanzamiento por 12 meses.',
  aviso: 'El día del lanzamiento te avisamos a este email para que actives tu cuenta.',
  respuesta: 'Si querés contarnos algo más de tu negocio, respondé este correo: nos llega directo.',
  firma_linea: 'Quedate tranquilo, los papeles están al día.',
  firma: '— Gesty · Office Manager',
  sitio: 'gestyofficemanager.com',
};

const COPIA_EN = {
  asunto: 'Reservation received · Gesty',
  saludo: 'Hello!',
  llego: (negocio) => `Your reservation is in. We saved ${negocio}'s spot for Gesty's launch on ${LANZAMIENTO.en}.`,
  plan: (nombre, precio) => `Your choice: Gesty ${nombre} — USD ${precio}/month.`,
  primeros_50: 'The first 50 Gesty accounts lock in their launch price for 12 months.',
  aviso: 'On launch day we will email you at this address so you can activate your account.',
  respuesta: 'Want to tell us more about your business? Just reply to this email — it reaches us directly.',
  firma_linea: 'Rest easy, your paperwork is up to date.',
  firma: '— Gesty · Office Manager',
  sitio: 'gestyofficemanager.com',
};

function copiaDe(idioma) { return idioma === 'en' ? COPIA_EN : COPIA_ES; }

// Arma el email de confirmación de UNA reserva. Devuelve
// { subject, text, html }: el canal manda html + texto plano.
function armarEmail(r) {
  const c = copiaDe(r.idioma);
  const parrafos = [c.saludo, c.llego(r.negocio)];
  if (r.plan && PLANES[r.plan]) parrafos.push(c.plan(PLANES[r.plan].nombre, PLANES[r.plan].precio));
  parrafos.push(c.primeros_50, c.aviso, c.respuesta, c.firma_linea);
  const text = parrafos.join('\n\n') + `\n\n${c.firma}\n${c.sitio}\n`;
  const htmlParrafos = parrafos
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;color:#29173F;">${escHtml(p)}</p>`)
    .join('\n      ');
  const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:28px 24px;">
      <div style="margin:0 0 18px;"><img src="https://gestyofficemanager.com/gesty-cara.webp" alt="Gesty" width="54" height="54" style="border-radius:50%;vertical-align:middle;"> <span style="font-size:19px;color:#472B5E;"><strong>Gesty</strong></span> <span style="color:#A175CA;">· Office Manager</span></div>
      ${htmlParrafos}
      <p style="margin:22px 0 0;line-height:1.55;color:#472B5E;">${escHtml(c.firma)}<br><span style="color:#A175CA;">${escHtml(c.sitio)}</span></p>
    </div>`;
  return { subject: c.asunto, text, html };
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Configuración (el canal se inyecta desde server.js, patrón de la casa)
// ---------------------------------------------------------------------------

let _sendEmail = null;
let _from = null; // remitente forzado opcional (GESTY_EMAIL_FROM); null = el del canal
function configure(opts) {
  const o = opts || {};
  if (typeof o.sendEmail === 'function') _sendEmail = o.sendEmail;
  if (Object.prototype.hasOwnProperty.call(o, 'from')) _from = o.from || null;
}

// ---------------------------------------------------------------------------
// Esquema (idempotente, patrón de la casa)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    huella TEXT NOT NULL,
    negocio TEXT NOT NULL DEFAULT '',
    rubro TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    email_norm TEXT NOT NULL DEFAULT '',
    dolor TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT '',
    idioma TEXT NOT NULL DEFAULT 'es',
    origen TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    email_estado TEXT NOT NULL DEFAULT 'pendiente',
    email_motivo TEXT NOT NULL DEFAULT '',
    email_comprobante TEXT NOT NULL DEFAULT '',
    email_enviado_en TEXT NOT NULL DEFAULT '',
    intentos_email INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_reservas_huella ON gesty_reservas(huella);
  CREATE INDEX IF NOT EXISTS idx_gesty_reservas_email ON gesty_reservas(email_norm);
  CREATE TABLE IF NOT EXISTS gesty_reservas_envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reserva_id INTEGER NOT NULL,
    intento INTEGER NOT NULL DEFAULT 1,
    resultado TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '',
    comprobante TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_reservas_envios_reserva ON gesty_reservas_envios(reserva_id);
  CREATE TABLE IF NOT EXISTS gesty_reservas_descartes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    motivo TEXT NOT NULL DEFAULT '',
    huella TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    origen TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// Rate-limit propio (el de la casa vive en server.js, inalcanzable
// desde los módulos — precedente G-15b). En memoria, por IP.
// ---------------------------------------------------------------------------

const _hits = new Map(); // ip -> [ms, ...]
function consumirCupo(ip, ahoraMs) {
  const clave = String(ip || 'desconocida');
  const desde = ahoraMs - RL_VENTANA_MS;
  const vivos = (_hits.get(clave) || []).filter((t) => t > desde);
  if (vivos.length >= RL_MAX) { _hits.set(clave, vivos); return false; }
  vivos.push(ahoraMs);
  _hits.set(clave, vivos);
  return true;
}
function _resetRateLimit() { _hits.clear(); }

// ---------------------------------------------------------------------------
// Origen y validación
// ---------------------------------------------------------------------------

// El origen válido llega por Origin (los navegadores lo mandan en
// todo POST) o, en su defecto, por el origin del Referer. Sin
// ninguno de los dos no hay forma de atribuir la reserva al sitio:
// se rechaza (403), no se adivina.
function origenDe(headers) {
  const h = headers || {};
  if (h.origin) return String(h.origin).trim().toLowerCase().replace(/\/$/, '');
  if (h.referer || h.referrer) {
    try { return new URL(String(h.referer || h.referrer)).origin.toLowerCase(); } catch (e) { return ''; }
  }
  return '';
}
function esOrigenPermitido(origen) {
  return ORIGENES_PERMITIDOS.includes(String(origen || '').trim().toLowerCase().replace(/\/$/, ''));
}

function errorCon(codigo, mensaje) { const e = new Error(mensaje); e.code = codigo; return e; }

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
function texto(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

function huellaDe(emailNorm, negocio, rubro, plan) {
  return crypto.createHash('sha256')
    .update([emailNorm, negocio.toLowerCase(), rubro.toLowerCase(), plan].join('|'))
    .digest('hex');
}

// Normaliza y valida el cuerpo de la reserva. Lanza con
// code 'VALIDACION' ante cualquier dato fuera de contrato.
function validarDatos(datos) {
  const d = datos || {};
  const negocio = texto(d.negocio, 120);
  if (negocio.length < 2) throw errorCon('VALIDACION', 'Falta el nombre del negocio (mínimo 2 caracteres).');
  const rubro = texto(d.rubro, 80);
  if (!rubro) throw errorCon('VALIDACION', 'Falta el rubro.');
  const email = texto(d.email, 160);
  if (!EMAIL_RE.test(email)) throw errorCon('VALIDACION', 'El email no es válido.');
  const plan = texto(d.plan, 20).toLowerCase();
  if (plan && !PLANES[plan]) throw errorCon('VALIDACION', 'El plan elegido no es válido.');
  const idioma = texto(d.idioma, 8).toLowerCase() || 'es';
  if (!IDIOMAS.includes(idioma)) throw errorCon('VALIDACION', 'El idioma no es válido.');
  return {
    negocio,
    rubro,
    email,
    email_norm: email.toLowerCase(),
    dolor: texto(d.dolor, 120),
    detalle: texto(d.detalle, 2000),
    plan,
    idioma,
  };
}

// ---------------------------------------------------------------------------
// Fila → forma de API/consulta
// ---------------------------------------------------------------------------

function reservaParaApi(r) {
  if (!r) return null;
  return {
    id: r.id,
    negocio: r.negocio, rubro: r.rubro, email: r.email,
    dolor: r.dolor, detalle: r.detalle, plan: r.plan, idioma: r.idioma,
    email_estado: r.email_estado, email_motivo: r.email_motivo,
    email_comprobante: r.email_comprobante, email_enviado_en: r.email_enviado_en,
    intentos_email: r.intentos_email, creado_en: r.created_at,
  };
}
function getReserva(db, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_reservas WHERE id = ?').get(Number(id));
  return r ? reservaParaApi(r) : null;
}
function historialEnvios(db, reservaId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_reservas_envios WHERE reserva_id = ? ORDER BY id ASC').all(Number(reservaId));
}

// ---------------------------------------------------------------------------
// El envío de la confirmación (única vía, con su historia)
// ---------------------------------------------------------------------------

// Envía (o reintenta) la confirmación de una reserva y deja el
// intento asentado en gesty_reservas_envios + el estado honesto en
// la reserva: «enviado» SOLO con el comprobante del canal (su id);
// cualquier otro desenlace es «fallido» con el motivo literal.
async function enviarConfirmacion(db, reservaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const r = db.prepare('SELECT * FROM gesty_reservas WHERE id = ?').get(Number(reservaId));
  if (!r) throw errorCon('VALIDACION', 'La reserva no existe.');
  const intento = Number(r.intentos_email || 0) + 1;
  const mail = armarEmail(r);
  let resultado = 'fallido', motivo = '', comprobante = '';
  if (!_sendEmail) {
    motivo = 'canal de email no configurado en el servidor';
  } else {
    try {
      const envio = { to: r.email, subject: mail.subject, text: mail.text, html: mail.html, replyTo: REPLY_TO };
      if (_from) envio.from = _from;
      const res = await _sendEmail(envio);
      if (res && res.ok) {
        resultado = 'enviado';
        comprobante = String(res.id || '');
      } else if (res && res.skipped) {
        motivo = 'el canal omitió el envío (sin clave de envío configurada)';
      } else {
        motivo = String((res && (res.error || res.providerError)) || 'el canal rechazó el envío').slice(0, 300);
      }
    } catch (e) {
      motivo = String((e && e.message) || e).slice(0, 300);
    }
  }
  const ahora = o.ahora || new Date().toISOString();
  db.prepare('INSERT INTO gesty_reservas_envios (reserva_id, intento, resultado, motivo, comprobante) VALUES (?,?,?,?,?)')
    .run(r.id, intento, resultado, motivo, comprobante);
  db.prepare(`UPDATE gesty_reservas SET email_estado = ?, email_motivo = ?, email_comprobante = ?,
      email_enviado_en = ?, intentos_email = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(resultado === 'enviado' ? 'enviado' : 'fallido', motivo,
      resultado === 'enviado' ? comprobante : '',
      resultado === 'enviado' ? ahora : (r.email_enviado_en || ''), intento, r.id);
  return getReserva(db, r.id);
}

// El reintento manual (admin): solo sobre una reserva cuyo email
// quedó «fallido» — una confirmación ya enviada no se reenvía.
async function reintentarEnvio(db, reservaId, opts) {
  const r = getReserva(db, reservaId);
  if (!r) throw errorCon('VALIDACION', 'La reserva no existe.');
  if (r.email_estado === 'enviado') throw errorCon('VALIDACION', 'La confirmación ya fue enviada: no se reenvía.');
  return enviarConfirmacion(db, reservaId, opts);
}

// ---------------------------------------------------------------------------
// La ingesta pública
// ---------------------------------------------------------------------------

// Orden de guardas: (1) rate-limit — TODO intento cuenta, también
// el abusivo; (2) origen; (3) honeypot — descarte silencioso: la
// respuesta imita el éxito y la reserva NO entra (queda solo el
// conteo del descarte, fuera de las reservas reales); (4)
// validación; (5) dedupe por huella; (6) registro + confirmación.
async function ingresarReserva(db, datos, meta) {
  ensureSchema(db);
  const m = meta || {};
  const ahoraMs = m.ahora ? Date.parse(m.ahora) : Date.now();
  const ip = String(m.ip || 'desconocida');
  if (!consumirCupo(ip, ahoraMs)) {
    throw errorCon('RATE_LIMIT', 'Demasiados intentos desde esta conexión. Esperá unos minutos y probá de nuevo.');
  }
  const origen = String(m.origen || '').trim().toLowerCase().replace(/\/$/, '');
  if (!esOrigenPermitido(origen)) {
    throw errorCon('ORIGEN', 'Este formulario solo acepta reservas desde gestyofficemanager.com.');
  }
  const d = datos || {};
  if (texto(d.honey != null ? d.honey : d._honey, 200)) {
    const huellaSpam = (() => { try { return huellaDe(texto(d.email, 160).toLowerCase(), texto(d.negocio, 120), texto(d.rubro, 80), texto(d.plan, 20).toLowerCase()); } catch (e) { return ''; } })();
    db.prepare('INSERT INTO gesty_reservas_descartes (motivo, huella, ip, origen) VALUES (?,?,?,?)')
      .run('honeypot', huellaSpam, ip, origen);
    return { ok: true, descartada: true };
  }
  const v = validarDatos(d);
  const huella = huellaDe(v.email_norm, v.negocio, v.rubro, v.plan);
  const previa = db.prepare('SELECT * FROM gesty_reservas WHERE huella = ?').get(huella);
  if (previa) return { ok: true, duplicada: true, reserva: reservaParaApi(previa) };
  let id;
  try {
    const info = db.prepare(`INSERT INTO gesty_reservas
      (huella, negocio, rubro, email, email_norm, dolor, detalle, plan, idioma, origen, ip)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(huella, v.negocio, v.rubro, v.email, v.email_norm, v.dolor, v.detalle, v.plan, v.idioma, origen, ip);
    id = Number(info.lastInsertRowid);
  } catch (e) {
    // Carrera entre dos envíos simultáneos de la misma reserva:
    // la huella única manda — es la duplicada, no un error.
    const otra = db.prepare('SELECT * FROM gesty_reservas WHERE huella = ?').get(huella);
    if (otra) return { ok: true, duplicada: true, reserva: reservaParaApi(otra) };
    throw e;
  }
  const reserva = await enviarConfirmacion(db, id, { ahora: m.ahora });
  return { ok: true, duplicada: false, reserva };
}

// ---------------------------------------------------------------------------
// La consulta (fuente limpia de reservas reales para operaciones)
// ---------------------------------------------------------------------------

function resumenReservas(db) {
  ensureSchema(db);
  const filas = db.prepare('SELECT * FROM gesty_reservas ORDER BY id ASC').all();
  const porPlan = {}, porIdioma = {}, porEmail = { enviado: 0, fallido: 0, pendiente: 0 };
  const emails = new Set();
  for (const r of filas) {
    porPlan[r.plan || 'sin-plan'] = (porPlan[r.plan || 'sin-plan'] || 0) + 1;
    porIdioma[r.idioma] = (porIdioma[r.idioma] || 0) + 1;
    porEmail[r.email_estado] = (porEmail[r.email_estado] || 0) + 1;
    emails.add(r.email_norm);
  }
  const descartes = db.prepare("SELECT COUNT(*) AS n FROM gesty_reservas_descartes WHERE motivo = 'honeypot'").get();
  return {
    total_reales: filas.length,
    emails_unicos: emails.size,
    por_plan: porPlan,
    por_idioma: porIdioma,
    por_estado_email: porEmail,
    descartes_honeypot: Number(descartes.n || 0),
  };
}

function listReservas(db, opts) {
  ensureSchema(db);
  const o = opts || {};
  const lim = Math.min(Math.max(Number(o.limit) || 100, 1), 500);
  const off = Math.max(Number(o.offset) || 0, 0);
  const rows = db.prepare('SELECT * FROM gesty_reservas ORDER BY id DESC LIMIT ? OFFSET ?').all(lim, off);
  return { reservas: rows.map(reservaParaApi), total: resumenReservas(db).total_reales };
}

module.exports = {
  configure,
  ensureSchema,
  ingresarReserva,
  enviarConfirmacion,
  reintentarEnvio,
  resumenReservas,
  listReservas,
  getReserva,
  historialEnvios,
  esOrigenPermitido,
  origenDe,
  armarEmail,
  COPIA_ES,
  COPIA_EN,
  PLANES,
  ORIGENES_PERMITIDOS,
  _resetRateLimit,
};
