'use strict';
// =====================================================================
// G-17 · CONCILIACIÓN AUTOMÁTICA — el cruce entre los movimientos
// reales (banco / billetera) y lo que la administración espera.
//
// Spec: gesty-cola-builds.md (tanda G-17…G-22, fila G-17) ·
// gesty-sistema-operativo.md (registrar, archivar y clasificar
// comprobantes y PAGOS corre en automático; mover plata o
// comprometer un pago nuevo es lo que pide OK) ·
// gesty-experiencia-cliente.md («ver cobros y pagos reales para
// conciliar sola — "esto ya se pagó" deja de depender de la
// memoria del cliente. Leer movimientos: sí. Mover plata: solo
// con su OK por operación»). La conciliación NO mueve plata ni
// compromete nada: registra, con su par y su motivo, un hecho que
// el dueño ya hizo con su mano en su banco. Por eso asienta sola
// cuando el match es FUERTE — y solo cuando es fuerte.
//
// LOS MOVIMIENTOS. Los extractos entran como papeles por G-03,
// pero su lector extrae el papel (emisor, fecha, totales), NO el
// detalle línea por línea: un extracto declarado sin detalle queda
// declarado «sin-detalle» y NUNCA se inventa un movimiento. El
// detalle llega por dos vías honestas: (a) si la extracción del
// papel algún día trae `movimientos`, se derivan tal cual (origen
// «lector»); (b) la carga asistida del dueño (origen «asistido»).
// Cada movimiento es una fila propia vinculada a su papel, con
// monto CON SIGNO (+ entra / − sale), contraparte y referencia.
//
// MATCH FUERTE — la definición exacta que este módulo aplica
// (todas las condiciones a la vez, auditables por su regla):
//   1. Moneda: la del movimiento es dato (no asumida) e igual a
//      la del par.
//   2. Monto: |movimiento| igual AL CENTAVO al SALDO vivo del par
//      (no al total: contra el saldo, un match exacto salda sin
//      sobrepagar jamás).
//   3. Contraparte identificada: CUIT exacto de 11 dígitos
//      (regla «fuerte-cuit-monto-ventana») o nombre normalizado
//      coincidente (regla «fuerte-nombre-monto-ventana»:
//      normalización sin acentos ni sufijos societarios, igualdad
//      o contención con piso de 5 caracteres / tokens).
//   4. Ventana de fecha declarada: el movimiento cae entre
//      5 días antes de la fecha del documento y 90 días después
//      de su vencimiento (o de su fecha, si no vence).
//   5. Unicidad cruzada: es el ÚNICO par fuerte del movimiento Y
//      ningún otro movimiento pendiente (incluidos los ya
//      propuestos) tiene al mismo par como fuerte. Dos créditos
//      idénticos para una sola factura son indistinguibles: NO
//      se asienta ninguno solo (sería un match falso posible).
//
// LO AMBIGUO NO SE ASIENTA: queda como PROPUESTA de un toque
// (aceptar el par propuesto / elegir otro de los candidatos /
// descartar). Causas: diferencia de monto dentro de la tolerancia
// de comisión (máx. entre $5 y el 1% del saldo), contraparte no
// identificada con monto exacto, fecha fuera de la ventana con
// todo lo demás exacto, o varios candidatos. La propuesta vive
// FUERA de la bandeja: la matriz de G-02 es una lista cerrada de
// 10 tipos y ninguno es «conciliar» (precedente G-15/G-16: misma
// disciplina — decisión del dueño registrada — sin colar un tipo
// 11). El par descartado por el dueño no se vuelve a proponer ni
// se asienta solo después: su palabra queda registrada.
//
// LOS ASIENTOS van por los circuitos de cada área:
// · Cobro: si la factura tiene cobranza abierta, el circuito de
//   papel de G-05 (vincularComprobantePago, con el extracto como
//   papel); si no, el registro de cobro de G-04 (registrarCobro)
//   con comprobante «conciliacion:mov-<id>».
// · Pago: el asiento de G-07 (la fila de gesty_pagos que leen
//   los saldos de las obligaciones y el cierre de G-06). La vía
//   de G-07 (registrarPagoOrden) pide una orden APROBADA por el
//   dueño y un papel de pago de un solo uso: es la puerta de los
//   pagos que Gesty prepara y el dueño ejecuta — no la de un pago
//   que el dueño ya hizo en su banco y el extracto prueba. Acá
//   la orden nace de la propia conciliación (prepararOrden, el
//   acto de borrador de Gesty) y su estado se asienta en la
//   REALIDAD (pagada / pagada-parcial), sin tarjeta y sin fingir
//   aprobación alguna: el registro durable dice, con el par y el
//   motivo, que el pago ya estaba hecho y quién lo cruzó.
// DESHACER (del dueño) revierte por los mismos circuitos: el
// cobro sale del registro de pagos de la factura (localizado por
// su comprobante exacto, nunca a ciegas) y el asiento de pago se
// elimina con su orden de conciliación anulada; la obligación y
// la factura vuelven a su saldo, y todo queda en el registro.
// =====================================================================

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');
const facturacion = require('./gesty-facturacion');
const cobranzas = require('./gesty-cobranzas');
const proveedores = require('./gesty-proveedores');

// ---------------------------------------------------------------------------
// Constantes declaradas (la ventana y la tolerancia son de la casa)
// ---------------------------------------------------------------------------

const VENTANA_ANTES_DIAS = 5;    // el movimiento puede preceder al documento
const VENTANA_DESPUES_DIAS = 90; // y seguir a su vencimiento hasta 90 días
const TOLERANCIA_PISO = 5;       // diferencia «de comisión»: máx($5, 1% del saldo)
const TOLERANCIA_PCT = 0.01;

const REGLAS_FUERTE = ['fuerte-cuit-monto-ventana', 'fuerte-nombre-monto-ventana'];
const CAUSAS_PROPUESTA = ['diferencia-de-monto', 'contraparte-no-identificada', 'fecha-fuera-de-ventana', 'varios-candidatos'];

// ---------------------------------------------------------------------------
// Helpers (los de la casa, patrón de los módulos hermanos)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function soloDigitos(v) { return String(v || '').replace(/\D/g, ''); }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function fmtMonto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function diffDias(desdeISO, hastaISO) {
  if (!esFechaISO(desdeISO) || !esFechaISO(hastaISO)) return null;
  return Math.round((Date.parse(String(hastaISO).slice(0, 10)) - Date.parse(String(desdeISO).slice(0, 10))) / 86400000);
}
function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }

const SUFIJOS_SOC = new Set(['sa', 'srl', 'sas', 'sac', 'eirl', 'sc', 'sca', 'sh']);
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e']);
function normNombre(s) {
  const t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return t.split(' ').filter((w) => w && !SUFIJOS_SOC.has(w) && !PALABRAS_VACIAS.has(w)).join(' ');
}
// Coincidencia de nombres con red: igualdad normalizada, contención
// con piso (≥5 caracteres) o contención de tokens. Nada de parecidos
// difusos: un nombre «casi» igual NO identifica a la contraparte.
function nombreCoincide(a, b) {
  const x = normNombre(a);
  const y = normNombre(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const corta = x.length <= y.length ? x : y;
  const larga = x.length <= y.length ? y : x;
  if (corta.length >= 5 && larga.includes(corta)) return true;
  const tx = new Set(x.split(' '));
  const ty = new Set(y.split(' '));
  const ct = tx.size <= ty.size ? tx : ty;
  const lt = tx.size <= ty.size ? ty : tx;
  if (ct.size >= 2 && [...ct].every((w) => lt.has(w))) return true;
  if (ct.size === 1 && [...ct][0].length >= 5 && lt.has([...ct][0])) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente — tablas propias del área)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  comprobantes.ensureSchema(db);
  facturacion.ensureSchema(db);
  cobranzas.ensureSchema(db);
  proveedores.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_conciliacion_extractos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    comprobante_id INTEGER NOT NULL,
    detalle TEXT NOT NULL DEFAULT 'sin-detalle',
    declarado_por TEXT NOT NULL DEFAULT 'dueno',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gcon_ext_user_comp ON gesty_conciliacion_extractos(user_id, comprobante_id);
  CREATE TABLE IF NOT EXISTS gesty_conciliacion_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    extracto_id INTEGER NOT NULL,
    comprobante_id INTEGER NOT NULL,
    fecha TEXT NOT NULL DEFAULT '',
    monto REAL NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    moneda_declarada INTEGER NOT NULL DEFAULT 1,
    contraparte_nombre TEXT NOT NULL DEFAULT '',
    contraparte_cuit TEXT NOT NULL DEFAULT '',
    referencia TEXT NOT NULL DEFAULT '',
    descripcion TEXT NOT NULL DEFAULT '',
    origen TEXT NOT NULL DEFAULT 'asistido',
    estado TEXT NOT NULL DEFAULT 'sin-conciliar',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gcon_mov_user ON gesty_conciliacion_movimientos(user_id, estado, fecha, id);
  CREATE INDEX IF NOT EXISTS idx_gcon_mov_comp ON gesty_conciliacion_movimientos(user_id, comprobante_id);
  CREATE TABLE IF NOT EXISTS gesty_conciliacion_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    movimiento_id INTEGER NOT NULL,
    lado TEXT NOT NULL DEFAULT '',
    par_tipo TEXT NOT NULL DEFAULT '',
    par_id INTEGER NOT NULL DEFAULT 0,
    par_etiqueta TEXT NOT NULL DEFAULT '',
    monto_asentado REAL,
    regla TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '',
    candidatos TEXT NOT NULL DEFAULT '[]',
    estado TEXT NOT NULL DEFAULT 'propuesta',
    via TEXT NOT NULL DEFAULT '',
    asiento TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gcon_match_user ON gesty_conciliacion_matches(user_id, estado, id);
  CREATE INDEX IF NOT EXISTS idx_gcon_match_mov ON gesty_conciliacion_matches(user_id, movimiento_id, estado);
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// Filas → objetos
// ---------------------------------------------------------------------------

function parseMovimiento(r) {
  if (!r) return null;
  return {
    id: r.id, extracto_id: r.extracto_id, comprobante_id: r.comprobante_id,
    fecha: r.fecha, monto: r.monto, moneda: r.moneda,
    moneda_declarada: r.moneda_declarada === 1,
    contraparte: { nombre: r.contraparte_nombre || '', cuit: r.contraparte_cuit || '' },
    referencia: r.referencia || '', descripcion: r.descripcion || '',
    origen: r.origen, estado: r.estado,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function parseMatch(r) {
  if (!r) return null;
  return {
    id: r.id, movimiento_id: r.movimiento_id, lado: r.lado,
    par: { tipo: r.par_tipo, id: r.par_id, etiqueta: r.par_etiqueta || '' },
    monto_asentado: r.monto_asentado, regla: r.regla, motivo: r.motivo,
    candidatos: safeJson(r.candidatos, []),
    estado: r.estado, via: r.via || '',
    asiento: r.asiento ? safeJson(r.asiento, null) : null,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function filaMovimiento(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_conciliacion_movimientos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  if (!r) fail('Ese movimiento no es de esta cuenta.');
  return r;
}
function filaExtracto(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_conciliacion_extractos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  if (!r) fail('Ese extracto no es de esta cuenta.');
  return r;
}
function filaMatch(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_conciliacion_matches WHERE id = ? AND user_id = ?').get(Number(id), userId);
  if (!r) fail('Ese cruce no es de esta cuenta.');
  return r;
}

function getMovimiento(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_conciliacion_movimientos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parseMovimiento(r) : null;
}
function getMatch(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_conciliacion_matches WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parseMatch(r) : null;
}

// ---------------------------------------------------------------------------
// Extractos: la declaración y el detalle de movimientos
// ---------------------------------------------------------------------------

function insertarMovimiento(db, userId, extracto, m, origen) {
  const info = db.prepare(`INSERT INTO gesty_conciliacion_movimientos
    (user_id, extracto_id, comprobante_id, fecha, monto, moneda, moneda_declarada,
     contraparte_nombre, contraparte_cuit, referencia, descripcion, origen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, extracto.id, extracto.comprobante_id, m.fecha, m.monto, m.moneda,
      m.moneda_declarada ? 1 : 0, m.contraparte_nombre, m.contraparte_cuit,
      m.referencia, m.descripcion, origen);
  return Number(info.lastInsertRowid);
}

// Normaliza un movimiento crudo (del lector o de la carga asistida)
// contra el papel del extracto. Devuelve null si no es un
// movimiento válido (sin fecha o sin monto): no se inventa.
function normalizarMovimiento(crudo, papel) {
  const m = crudo || {};
  const fecha = normTexto(m.fecha).slice(0, 10);
  if (!esFechaISO(fecha)) return null;
  const monto = m.monto === undefined || m.monto === null || m.monto === '' ? NaN : round2(Number(m.monto));
  if (!Number.isFinite(monto) || monto === 0) return null;
  const monedaDato = normTexto(m.moneda || papel.moneda || '');
  return {
    fecha,
    monto,
    moneda: (monedaDato || 'ARS').toUpperCase(),
    moneda_declarada: !!monedaDato,
    contraparte_nombre: normTexto(m.contraparte_nombre || m.contraparte || ''),
    contraparte_cuit: (() => { const c = soloDigitos(m.contraparte_cuit || ''); return c.length === 11 ? c : ''; })(),
    referencia: normTexto(m.referencia || ''),
    descripcion: normTexto(m.descripcion || m.concepto || ''),
  };
}

function parseExtracto(db, userId, r) {
  if (!r) return null;
  const n = db.prepare('SELECT COUNT(*) AS n FROM gesty_conciliacion_movimientos WHERE user_id = ? AND extracto_id = ?').get(userId, r.id);
  const papel = comprobantes.getComprobante(db, userId, r.comprobante_id);
  return {
    id: r.id, comprobante_id: r.comprobante_id, detalle: r.detalle,
    declarado_por: r.declarado_por, movimientos: Number(n ? n.n : 0),
    papel: papel ? {
      tipo: papel.tipo, fecha: papel.fecha, moneda: papel.moneda,
      concepto: papel.concepto, emisor: papel.emisor, archivo: papel.archivo,
    } : null,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

// Declara un papel de G-03 como extracto conciliable. La palabra
// es del dueño (Gesty sugiere por el tipo/concepto, no se niega);
// el duplicado de otro papel NO se declara (el mismo extracto dos
// veces contaría dos veces). Si la extracción del papel trae el
// detalle (`movimientos`), se deriva tal cual; si no, el extracto
// queda «sin-detalle» declarado hasta la carga asistida.
function declararExtracto(db, userId, comprobanteId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const comp = comprobantes.getComprobante(db, userId, Number(comprobanteId));
  if (!comp) fail('Ese comprobante no es de esta cuenta.');
  if (comp.duplicado_de) {
    fail(`Este papel es el duplicado del comprobante #${comp.duplicado_de}: el mismo extracto no se concilia dos veces.`);
  }
  const previa = db.prepare('SELECT * FROM gesty_conciliacion_extractos WHERE user_id = ? AND comprobante_id = ?').get(userId, comp.id);
  if (previa) return { extracto: parseExtracto(db, userId, previa), movimientos_derivados: 0, ya_declarado: true };
  const info = db.prepare(`INSERT INTO gesty_conciliacion_extractos (user_id, comprobante_id, detalle, declarado_por)
    VALUES (?,?, 'sin-detalle', ?)`)
    .run(userId, comp.id, normTexto(o.declarado_por || 'dueno') || 'dueno');
  const extractoId = Number(info.lastInsertRowid);

  // Derivación del lector: SOLO si el papel trae el detalle.
  let derivados = 0;
  const crudos = comp.extraccion && Array.isArray(comp.extraccion.movimientos) ? comp.extraccion.movimientos : [];
  if (crudos.length) {
    const fila = db.prepare('SELECT * FROM gesty_conciliacion_extractos WHERE id = ?').get(extractoId);
    for (const crudo of crudos) {
      const m = normalizarMovimiento(crudo, comp);
      if (m) { insertarMovimiento(db, userId, fila, m, 'lector'); derivados++; }
    }
    if (derivados) {
      db.prepare(`UPDATE gesty_conciliacion_extractos SET detalle = 'con-detalle', updated_at = datetime('now') WHERE id = ?`).run(extractoId);
    }
  }
  const fila = db.prepare('SELECT * FROM gesty_conciliacion_extractos WHERE id = ?').get(extractoId);
  gesty.recordEvent(db, userId, {
    actor: normTexto(o.declarado_por || 'dueno') === 'dueno' ? 'dueno' : 'gesty',
    entidad_tipo: 'conciliacion-extracto', entidad_id: String(extractoId),
    tipo_evento: 'conciliacion-extracto-declarado',
    resumen: derivados
      ? `Extracto declarado (comprobante #${comp.id}): el lector trajo ${derivados} movimiento(s) y quedaron derivados tal cual.`
      : `Extracto declarado (comprobante #${comp.id}) SIN detalle de movimientos: ningún movimiento se inventa; el detalle se carga asistido.`,
    payload: { comprobante_id: comp.id, detalle: derivados ? 'con-detalle' : 'sin-detalle', movimientos_derivados: derivados },
  });
  return { extracto: parseExtracto(db, userId, fila), movimientos_derivados: derivados, ya_declarado: false };
}

function getExtracto(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_conciliacion_extractos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parseExtracto(db, userId, r) : null;
}

function listExtractos(db, userId) {
  ensureSchema(db);
  const rows = db.prepare('SELECT * FROM gesty_conciliacion_extractos WHERE user_id = ? ORDER BY id ASC').all(userId);
  return { extractos: rows.map((r) => parseExtracto(db, userId, r)), total: rows.length };
}

// La carga asistida del detalle: el dueño transcribe (o pega) los
// movimientos de su extracto. Cada uno se valida; el inválido se
// declara en la respuesta, no se adivina. Dedupe: mismo día,
// mismo monto y misma referencia no vacía = el mismo movimiento.
function cargarMovimientos(db, userId, extractoId, movimientos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fila = filaExtracto(db, userId, extractoId);
  const papel = comprobantes.getComprobante(db, userId, fila.comprobante_id);
  if (!papel) fail('El papel de este extracto ya no está en la cuenta.');
  if (!Array.isArray(movimientos) || !movimientos.length) fail('La carga trae al menos un movimiento.');
  let cargados = 0;
  let salteados = 0;
  const invalidos = [];
  const ids = [];
  movimientos.forEach((crudo, i) => {
    const m = normalizarMovimiento(crudo, papel);
    if (!m) { invalidos.push(i); return; }
    if (m.referencia) {
      const dup = db.prepare(`SELECT id FROM gesty_conciliacion_movimientos
        WHERE user_id = ? AND extracto_id = ? AND fecha = ? AND monto = ? AND referencia = ? LIMIT 1`)
        .get(userId, fila.id, m.fecha, m.monto, m.referencia);
      if (dup) { salteados++; return; }
    }
    ids.push(insertarMovimiento(db, userId, fila, m, 'asistido'));
    cargados++;
  });
  if (cargados) {
    db.prepare(`UPDATE gesty_conciliacion_extractos SET detalle = 'con-detalle', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
  }
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'conciliacion-extracto', entidad_id: String(fila.id),
    tipo_evento: 'conciliacion-movimientos-cargados',
    resumen: `Detalle del extracto #${fila.id} cargado a mano: ${cargados} movimiento(s) nuevo(s)${salteados ? `, ${salteados} repetido(s) salteado(s)` : ''}${invalidos.length ? `, ${invalidos.length} inválido(s) declarado(s)` : ''}.`,
    payload: { comprobante_id: fila.comprobante_id, cargados, salteados, invalidos },
  });
  return {
    extracto: getExtracto(db, userId, fila.id),
    cargados, salteados, invalidos,
    movimientos: ids.map((id) => getMovimiento(db, userId, id)),
    hoy: o.hoy || null,
  };
}

function listMovimientos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_conciliacion_movimientos WHERE user_id = ? ORDER BY fecha ASC, id ASC').all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  if (o.comprobante_id) rows = rows.filter((r) => r.comprobante_id === Number(o.comprobante_id));
  if (o.extracto_id) rows = rows.filter((r) => r.extracto_id === Number(o.extracto_id));
  if (o.desde) rows = rows.filter((r) => r.fecha >= String(o.desde));
  if (o.hasta) rows = rows.filter((r) => r.fecha <= String(o.hasta));
  const total = rows.length;
  const lim = Math.min(Math.max(Number(o.limit) || 500, 1), 2000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { movimientos: rows.slice(off, off + lim).map(parseMovimiento), total };
}

// ---------------------------------------------------------------------------
// Los pares: lo que la administración espera (con saldo vivo)
// ---------------------------------------------------------------------------

function poolFacturas(db, userId) {
  const { facturas } = facturacion.listFacturas(db, userId, { estado: 'enviada', limit: 500 });
  return facturas.filter((f) => f.saldo > 0).map((f) => ({
    lado: 'cobro', par_tipo: 'factura', par_id: f.id,
    etiqueta: `Factura ${f.numero} de ${f.cliente.nombre || f.cliente.cuit || 'cliente'}`,
    contraparte_nombre: f.cliente.nombre || '', contraparte_cuit: f.cliente.cuit || '',
    saldo: f.saldo, fecha: f.fecha || '', vencimiento: f.vencimiento || '',
    moneda: (f.moneda || 'ARS').toUpperCase(),
  }));
}

function poolObligaciones(db, userId, hoy) {
  return proveedores.todasLasObligaciones(db, userId, hoy)
    .filter((ob) => ob.saldo !== null && ob.saldo > 0)
    .map((ob) => ({
      lado: 'pago', par_tipo: 'obligacion', par_id: ob.comprobante_id,
      etiqueta: `Comprobante ${ob.comprobante.numero || `#${ob.comprobante_id}`} de ${ob.proveedor.nombre || ob.proveedor.cuit || 'proveedor'}`,
      contraparte_nombre: ob.proveedor.nombre || '', contraparte_cuit: ob.proveedor.cuit || '',
      saldo: ob.saldo, fecha: ob.fecha || '', vencimiento: ob.vencimiento || '',
      moneda: (ob.moneda || 'ARS').toUpperCase(),
    }));
}

// Evalúa UN movimiento contra UN par. Devuelve null (ni candidato)
// o el veredicto con su nivel, su regla y los porqués en números.
function evaluarContraPar(mov, par) {
  // El signo manda el lado: crédito busca cobro, débito busca pago.
  if ((mov.monto > 0) !== (par.lado === 'cobro')) return null;
  if (normTexto(mov.moneda).toUpperCase() !== par.moneda) return null; // otra moneda: ni candidato
  const montoMov = round2(Math.abs(mov.monto));
  const diff = round2(montoMov - par.saldo);
  const montoExacto = diff === 0;
  const tolerancia = Math.max(TOLERANCIA_PISO, round2(par.saldo * TOLERANCIA_PCT));
  const montoCercano = !montoExacto && Math.abs(diff) <= tolerancia;
  if (!montoExacto && !montoCercano) return null;
  const cuitOk = !!mov.contraparte.cuit && !!par.contraparte_cuit
    && soloDigitos(mov.contraparte.cuit) === soloDigitos(par.contraparte_cuit)
    && soloDigitos(mov.contraparte.cuit).length === 11;
  const nombreOk = nombreCoincide(mov.contraparte.nombre, par.contraparte_nombre);
  const contraparteOk = cuitOk || nombreOk;
  const refCierre = par.vencimiento || par.fecha;
  const diasDesdeDoc = esFechaISO(par.fecha) ? diffDias(par.fecha, mov.fecha) : null;
  const diasDesdeCierre = refCierre ? diffDias(refCierre, mov.fecha) : null;
  const ventanaOk = diasDesdeDoc !== null && diasDesdeDoc >= -VENTANA_ANTES_DIAS
    && (diasDesdeCierre === null || diasDesdeCierre <= VENTANA_DESPUES_DIAS);
  const base = {
    lado: par.lado, par_tipo: par.par_tipo, par_id: par.par_id, etiqueta: par.etiqueta,
    saldo: par.saldo, moneda: par.moneda, fecha: par.fecha, vencimiento: par.vencimiento,
    contraparte_nombre: par.contraparte_nombre, contraparte_cuit: par.contraparte_cuit,
    diff, montoExacto, cuitOk, nombreOk, ventanaOk,
  };
  if (montoExacto && contraparteOk && ventanaOk && mov.moneda_declarada) {
    return {
      ...base, nivel: 'fuerte',
      regla: cuitOk ? 'fuerte-cuit-monto-ventana' : 'fuerte-nombre-monto-ventana',
      causa: null,
      score: 1000 + (cuitOk ? 100 : 50),
    };
  }
  // Plausible (propuesta): nunca asienta solo; el motivo dice por qué.
  let causa = null;
  if (montoCercano && contraparteOk) causa = 'diferencia-de-monto';
  else if (montoExacto && contraparteOk && !ventanaOk) causa = 'fecha-fuera-de-ventana';
  else if (montoExacto && !contraparteOk) causa = 'contraparte-no-identificada';
  if (!causa) return null;
  return {
    ...base, nivel: 'plausible', regla: `propuesta-${causa}`, causa,
    score: (montoExacto ? 500 : 200) + (cuitOk ? 100 : nombreOk ? 50 : 0) + (ventanaOk ? 25 : 0),
  };
}

function paresExcluidos(db, userId, movimientoId) {
  const rows = db.prepare(`SELECT par_tipo, par_id FROM gesty_conciliacion_matches
    WHERE user_id = ? AND movimiento_id = ? AND estado = 'descartada'`).all(userId, movimientoId);
  return new Set(rows.map((r) => `${r.par_tipo}:${r.par_id}`));
}

// Todos los candidatos de un movimiento, contra los saldos de
// AHORA (los pools se leen frescos en cada evaluación: un asiento
// cambia los saldos y el cruce siguiente ya lo sabe).
function candidatosDe(db, userId, mov, hoy) {
  const excluidos = paresExcluidos(db, userId, mov.id);
  const pools = [...poolFacturas(db, userId), ...poolObligaciones(db, userId, hoy)];
  const out = [];
  for (const par of pools) {
    if (excluidos.has(`${par.par_tipo}:${par.par_id}`)) continue;
    const c = evaluarContraPar(mov, par);
    if (c) out.push(c);
  }
  out.sort((a, b) => b.score - a.score || a.par_id - b.par_id);
  return out;
}

// ¿Otro movimiento todavía no asentado tiene a este par como
// FUERTE? Si lo tiene, el par está disputado: ninguno de los dos
// se asienta solo (los dos movimientos son indistinguibles).
function parDisputado(db, userId, movPropio, candidato, hoy) {
  const rows = db.prepare(`SELECT * FROM gesty_conciliacion_movimientos
    WHERE user_id = ? AND id != ? AND estado IN ('sin-conciliar','sin-par','propuesto') ORDER BY id ASC`)
    .all(userId, movPropio.id);
  for (const r of rows) {
    const otro = parseMovimiento(r);
    const cs = candidatosDe(db, userId, otro, hoy);
    if (cs.some((c) => c.nivel === 'fuerte' && c.par_tipo === candidato.par_tipo && c.par_id === candidato.par_id)) return otro;
  }
  return null;
}

function motivoFuerte(mov, c) {
  const ident = c.cuitOk
    ? `contraparte identificada por CUIT ${mov.contraparte.cuit}`
    : `contraparte identificada por nombre («${mov.contraparte.nombre}»)`;
  return `Monto exacto (${c.moneda} ${fmtMonto(Math.abs(mov.monto))}) contra el saldo vivo, ${ident}, `
    + `y fecha dentro de la ventana (movimiento ${fmtFecha(mov.fecha)}; documento ${fmtFecha(c.fecha)}`
    + `${c.vencimiento ? `, vencimiento ${fmtFecha(c.vencimiento)}` : ''}).`;
}

function motivoPropuesta(mov, c, causa, extra) {
  if (causa === 'diferencia-de-monto') {
    return `El monto del movimiento (${c.moneda} ${fmtMonto(Math.abs(mov.monto))}) difiere en ${c.moneda} ${fmtMonto(Math.abs(c.diff))} `
      + `del saldo de ${c.etiqueta} (${c.moneda} ${fmtMonto(c.saldo)}): calza con una comisión o retención. No se asienta solo.`;
  }
  if (causa === 'fecha-fuera-de-ventana') {
    return `Monto exacto y contraparte identificada, pero el movimiento (${fmtFecha(mov.fecha)}) cae fuera de la ventana `
      + `del documento (${fmtFecha(c.fecha)}${c.vencimiento ? `, vencimiento ${fmtFecha(c.vencimiento)}` : ''}). No se asienta solo.`;
  }
  if (causa === 'varios-candidatos') {
    return `El cruce no es único: ${extra || 'hay más de un candidato indistinguible para este movimiento'}. Ninguno se asienta solo.`;
  }
  return `El monto calza exacto con ${c.etiqueta}, pero la contraparte del movimiento no se pudo identificar `
    + `con certeza (sin CUIT coincidente ni nombre que cierre). No se asienta solo.`;
}

// ---------------------------------------------------------------------------
// Los asientos: por los circuitos de cada área
// ---------------------------------------------------------------------------

// COBRO: con cobranza abierta manda el circuito de papel de G-05
// (el extracto ES el papel); sin cobranza, el registro de G-04.
function asentarCobro(db, userId, mov, cand, hoy) {
  const f = facturacion.getFactura(db, userId, cand.par_id);
  if (!f) fail('Esa factura ya no es de esta cuenta.');
  if (f.estado !== 'enviada' || f.saldo <= 0) fail(`La factura ${f.numero} ya no espera cobro (estado ${f.estado}, saldo ${fmtMonto(f.saldo)}).`);
  const monto = round2(Math.min(round2(Math.abs(mov.monto)), f.saldo));
  const lista = cobranzas.listCobranzas(db, userId, { factura_id: f.id });
  const abierta = (lista.cobranzas || []).find((c) => c.estado === 'abierta');
  if (abierta) {
    const r = cobranzas.vincularComprobantePago(db, userId, {
      cobranza_id: abierta.id, comprobante_id: mov.comprobante_id,
      monto, medio: 'conciliación automática', fecha: mov.fecha || undefined,
    });
    return { factura_id: f.id, numero: f.numero, circuito: 'cobranzas', cobranza_id: abierta.id, registro: r.pago };
  }
  const r = facturacion.registrarCobro(db, userId, f.id, {
    monto, medio: 'conciliación automática', fecha: mov.fecha || undefined,
    comprobante: `conciliacion:mov-${mov.id}`,
  });
  return { factura_id: f.id, numero: f.numero, circuito: 'facturacion', registro: r.pago };
}

// PAGO: el asiento de G-07 (ver la cabecera: la orden nace de la
// conciliación y su estado se asienta en la realidad del banco).
function asentarPago(db, userId, mov, cand, hoy) {
  const ob = proveedores.todasLasObligaciones(db, userId, hoy)
    .find((x) => x.comprobante_id === cand.par_id);
  if (!ob || ob.saldo === null || ob.saldo <= 0) fail('Esa obligación ya no tiene saldo vivo.');
  const monto = round2(Math.min(round2(Math.abs(mov.monto)), ob.saldo));
  const orden = proveedores.prepararOrden(db, userId, {
    comprobante_ids: [cand.par_id], monto, creado_por: 'gesty',
  });
  const saldoDespues = round2(ob.saldo - monto);
  const estadoOrden = saldoDespues <= 0 ? 'pagada' : 'pagada-parcial';
  db.prepare(`UPDATE gesty_ordenes_pago SET estado = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(estadoOrden, orden.id);
  const info = db.prepare(`INSERT INTO gesty_pagos
    (user_id, orden_id, comprobante_id, comprobante_pago_id, monto, moneda, fecha, medio, creado_por)
    VALUES (?,?,?,?,?,?,?,?, 'gesty')`)
    .run(userId, orden.id, cand.par_id, mov.comprobante_id, monto,
      ob.moneda || cand.moneda || 'ARS', mov.fecha || '', 'conciliación automática · extracto');
  const pagoId = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'orden-pago', entidad_id: String(orden.id),
    tipo_evento: 'pago-conciliado',
    resumen: `Pago YA HECHO en el banco, conciliado desde el extracto (comprobante #${mov.comprobante_id}): `
      + `${ob.moneda || 'ARS'} ${fmtMonto(monto)} contra ${cand.etiqueta}. La orden #${orden.id} nació de esta conciliación `
      + `y queda ${estadoOrden === 'pagada' ? 'PAGADA' : 'pagada parcial'}: Gesty no comprometió un pago nuevo, registró el que el dueño ya hizo.`,
    payload: { movimiento_id: mov.id, comprobante_obligacion_id: cand.par_id, monto, pago_id: pagoId, desde_conciliacion: true },
  });
  return {
    orden_id: orden.id, pago_id: pagoId, orden_nacio_de_conciliacion: true,
    comprobante_obligacion_id: cand.par_id,
  };
}

// Asienta el cruce y lo deja escrito: fila de match + movimiento
// conciliado + evento durable con el par y el motivo. Si el
// asiento falla, no queda ni match ni movimiento tocado.
function asentar(db, userId, mov, cand, ctx) {
  const asiento = cand.lado === 'cobro'
    ? asentarCobro(db, userId, mov, cand, ctx.hoy)
    : asentarPago(db, userId, mov, cand, ctx.hoy);
  const montoAsentado = round2(Math.min(round2(Math.abs(mov.monto)), cand.saldo));
  let matchId;
  if (ctx.matchExistente) {
    matchId = ctx.matchExistente;
    db.prepare(`UPDATE gesty_conciliacion_matches SET lado = ?, par_tipo = ?, par_id = ?, par_etiqueta = ?,
      monto_asentado = ?, regla = ?, motivo = ?, estado = 'asentado', via = ?, asiento = ?,
      updated_at = datetime('now') WHERE id = ?`)
      .run(cand.lado, cand.par_tipo, cand.par_id, cand.etiqueta, montoAsentado,
        ctx.regla, ctx.motivo, ctx.via, JSON.stringify(asiento), matchId);
  } else {
    const info = db.prepare(`INSERT INTO gesty_conciliacion_matches
      (user_id, movimiento_id, lado, par_tipo, par_id, par_etiqueta, monto_asentado, regla, motivo, candidatos, estado, via, asiento)
      VALUES (?,?,?,?,?,?,?,?,?,'[]','asentado',?,?)`)
      .run(userId, mov.id, cand.lado, cand.par_tipo, cand.par_id, cand.etiqueta,
        montoAsentado, ctx.regla, ctx.motivo, ctx.via, JSON.stringify(asiento));
    matchId = Number(info.lastInsertRowid);
  }
  db.prepare(`UPDATE gesty_conciliacion_movimientos SET estado = 'conciliado', updated_at = datetime('now') WHERE id = ?`).run(mov.id);
  gesty.recordEvent(db, userId, {
    actor: ctx.via === 'automatico' ? 'gesty' : 'dueno',
    entidad_tipo: 'conciliacion-movimiento', entidad_id: String(mov.id),
    tipo_evento: 'conciliacion-asentada',
    resumen: `Movimiento del ${fmtFecha(mov.fecha)} (${mov.moneda} ${fmtMonto(mov.monto)}) conciliado con ${cand.etiqueta}: `
      + `se asentaron ${cand.moneda} ${fmtMonto(montoAsentado)} por la vía ${ctx.via === 'automatico' ? 'automática (match fuerte)' : 'de la propuesta aceptada'}.`,
    payload: {
      match_id: matchId, lado: cand.lado, par_tipo: cand.par_tipo, par_id: cand.par_id,
      par_etiqueta: cand.etiqueta, monto: montoAsentado, regla: ctx.regla, motivo: ctx.motivo,
      extracto_comprobante_id: mov.comprobante_id,
    },
    comprobante_externo: `comprobante:${mov.comprobante_id}`,
  });
  return getMatch(db, userId, matchId);
}

// La propuesta de un toque: el mejor candidato al frente y los
// demás como alternativas elegibles. NO asienta nada.
function crearPropuesta(db, userId, mov, pares, causa) {
  const best = pares[0];
  const motivo = motivoPropuesta(mov, best, causa,
    causa === 'varios-candidatos'
      ? (pares.filter((p) => p.nivel === 'fuerte').length > 1
        ? `este movimiento calza fuerte con ${pares.filter((p) => p.nivel === 'fuerte').length} pares distintos`
        : 'otro movimiento pendiente calza igual con el mismo par')
      : null);
  const info = db.prepare(`INSERT INTO gesty_conciliacion_matches
    (user_id, movimiento_id, lado, par_tipo, par_id, par_etiqueta, monto_asentado, regla, motivo, candidatos, estado, via, asiento)
    VALUES (?,?,?,?,?,?,NULL,?,?,?,'propuesta','','')`)
    .run(userId, mov.id, best.lado, best.par_tipo, best.par_id, best.etiqueta,
      `propuesta-${causa}`, motivo, JSON.stringify(pares.map((p) => ({
        lado: p.lado, par_tipo: p.par_tipo, par_id: p.par_id, etiqueta: p.etiqueta,
        saldo: p.saldo, moneda: p.moneda, fecha: p.fecha, vencimiento: p.vencimiento,
        contraparte_nombre: p.contraparte_nombre, contraparte_cuit: p.contraparte_cuit,
        nivel: p.nivel, regla: p.regla, causa: p.causa, diff: p.diff,
      }))));
  const matchId = Number(info.lastInsertRowid);
  db.prepare(`UPDATE gesty_conciliacion_movimientos SET estado = 'propuesto', updated_at = datetime('now') WHERE id = ?`).run(mov.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'conciliacion-movimiento', entidad_id: String(mov.id),
    tipo_evento: 'conciliacion-propuesta-creada',
    resumen: `Movimiento del ${fmtFecha(mov.fecha)} (${mov.moneda} ${fmtMonto(mov.monto)}): propuesta de conciliación con ${best.etiqueta}. ${motivo}`,
    payload: {
      match_id: matchId, par_tipo: best.par_tipo, par_id: best.par_id, par_etiqueta: best.etiqueta,
      regla: `propuesta-${causa}`, motivo, candidatos: pares.length,
    },
    comprobante_externo: `comprobante:${mov.comprobante_id}`,
  });
  return getMatch(db, userId, matchId);
}

// ---------------------------------------------------------------------------
// El escaneo: cruza todo lo pendiente, de a uno, con saldos frescos
// ---------------------------------------------------------------------------

function propuestaVivaDe(db, userId, movimientoId) {
  const r = db.prepare(`SELECT * FROM gesty_conciliacion_matches
    WHERE user_id = ? AND movimiento_id = ? AND estado = 'propuesta' ORDER BY id DESC LIMIT 1`)
    .get(userId, movimientoId);
  return r ? parseMatch(r) : null;
}

function conciliar(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  let rows = db.prepare(`SELECT * FROM gesty_conciliacion_movimientos
    WHERE user_id = ? AND estado IN ('sin-conciliar','sin-par') ORDER BY fecha ASC, id ASC`).all(userId);
  if (o.desde) rows = rows.filter((r) => r.fecha >= String(o.desde));
  if (o.hasta) rows = rows.filter((r) => r.fecha <= String(o.hasta));
  const resultado = {
    hoy, procesados: 0, asentados: [], propuestas: [], sin_par: [],
    ya_propuestos: 0, errores: [],
  };
  for (const fila of rows) {
    const mov = parseMovimiento(fila);
    resultado.procesados++;
    try {
      const pares = candidatosDe(db, userId, mov, hoy);
      const fuertes = pares.filter((p) => p.nivel === 'fuerte');
      let disputa = null;
      if (fuertes.length === 1) disputa = parDisputado(db, userId, mov, fuertes[0], hoy);
      if (fuertes.length === 1 && !disputa) {
        const c = fuertes[0];
        const match = asentar(db, userId, mov, c, {
          via: 'automatico', regla: c.regla, motivo: motivoFuerte(mov, c), hoy,
        });
        resultado.asentados.push({ movimiento_id: mov.id, match_id: match.id, par: match.par, monto: match.monto_asentado, regla: match.regla });
      } else if (pares.length) {
        const causa = fuertes.length > 1 || disputa ? 'varios-candidatos' : (pares[0].causa || 'contraparte-no-identificada');
        const prop = crearPropuesta(db, userId, mov, pares, causa);
        resultado.propuestas.push({ movimiento_id: mov.id, match_id: prop.id, par: prop.par, regla: prop.regla });
      } else {
        db.prepare(`UPDATE gesty_conciliacion_movimientos SET estado = 'sin-par', updated_at = datetime('now') WHERE id = ?`).run(mov.id);
        resultado.sin_par.push(mov.id);
      }
    } catch (e) {
      // Un movimiento que no se pudo cruzar queda pendiente y el
      // error declarado en el resultado: el escaneo no se cae
      // entero por un caso, y nada queda asentado a medias.
      resultado.errores.push({ movimiento_id: mov.id, error: e.message });
    }
  }
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'conciliacion', entidad_id: '',
    tipo_evento: 'conciliacion-escaneo',
    resumen: `Conciliación corrida: ${resultado.asentados.length} asentado(s) solo(s) por match fuerte, `
      + `${resultado.propuestas.length} propuesta(s) para el dueño, ${resultado.sin_par.length} movimiento(s) sin par`
      + `${resultado.errores.length ? `, ${resultado.errores.length} con error declarado` : ''}.`,
    payload: {
      procesados: resultado.procesados,
      asentados: resultado.asentados.length, propuestas: resultado.propuestas.length,
      sin_par: resultado.sin_par.length, errores: resultado.errores.length,
      desde: o.desde || null, hasta: o.hasta || null,
    },
  });
  return resultado;
}

// ---------------------------------------------------------------------------
// La decisión del dueño sobre la propuesta (un toque)
// ---------------------------------------------------------------------------

function aceptarPropuesta(db, userId, matchId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const fila = filaMatch(db, userId, matchId);
  if (fila.estado !== 'propuesta') fail('Esa propuesta ya no está esperando: fue resuelta o revertida.');
  const mov = parseMovimiento(filaMovimiento(db, userId, fila.movimiento_id));
  if (mov.estado !== 'propuesto') fail('El movimiento de esta propuesta ya no está esperando decisión.');
  let cand = {
    lado: fila.lado, par_tipo: fila.par_tipo, par_id: fila.par_id,
    etiqueta: fila.par_etiqueta, saldo: null, moneda: '',
  };
  if (o.par_tipo || o.par_id) {
    const alt = safeJson(fila.candidatos, []).find((c) => c.par_tipo === String(o.par_tipo || '') && c.par_id === Number(o.par_id || 0));
    if (!alt) fail('Ese par no estaba entre los candidatos de la propuesta: no se cruza con un par que la propuesta no mostró.');
    cand = { ...alt };
  }
  // El saldo del par se lee AHORA: si ya se saldó por otro lado,
  // el asiento lo rechaza y la propuesta sigue viva (declarado).
  const pool = cand.lado === 'cobro' ? poolFacturas(db, userId) : poolObligaciones(db, userId, hoy);
  const vivo = pool.find((p) => p.par_tipo === cand.par_tipo && p.par_id === cand.par_id);
  if (!vivo) fail(`El par propuesto (${cand.etiqueta}) ya no tiene saldo vivo: la propuesta quedó vieja.`);
  cand.saldo = vivo.saldo;
  cand.moneda = vivo.moneda;
  cand.etiqueta = vivo.etiqueta;
  return asentar(db, userId, mov, cand, {
    via: 'propuesta-aceptada', regla: fila.regla,
    motivo: `${fila.motivo} — Propuesta aceptada por el dueño.`,
    hoy, matchExistente: fila.id,
  });
}

function descartarPropuesta(db, userId, matchId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fila = filaMatch(db, userId, matchId);
  if (fila.estado !== 'propuesta') fail('Esa propuesta ya no está esperando: fue resuelta o revertida.');
  db.prepare(`UPDATE gesty_conciliacion_matches SET estado = 'descartada', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
  db.prepare(`UPDATE gesty_conciliacion_movimientos SET estado = 'sin-par', updated_at = datetime('now') WHERE id = ?`).run(fila.movimiento_id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'conciliacion-movimiento', entidad_id: String(fila.movimiento_id),
    tipo_evento: 'conciliacion-propuesta-descartada',
    resumen: `Propuesta descartada por el dueño: el movimiento no se cruza con ${fila.par_etiqueta}. `
      + 'Ese par no se vuelve a proponer para este movimiento.',
    payload: { match_id: fila.id, par_tipo: fila.par_tipo, par_id: fila.par_id, motivo: normTexto(o.motivo || '') },
  });
  return getMatch(db, userId, fila.id);
}

function listPropuestas(db, userId) {
  ensureSchema(db);
  const rows = db.prepare(`SELECT * FROM gesty_conciliacion_matches WHERE user_id = ? AND estado = 'propuesta' ORDER BY id ASC`).all(userId);
  return { propuestas: rows.map(parseMatch), total: rows.length };
}

// ---------------------------------------------------------------------------
// Deshacer: la reversa por los circuitos de cada área
// ---------------------------------------------------------------------------

function revertirCobro(db, userId, match, asiento) {
  const f = facturacion.getFactura(db, userId, asiento.factura_id);
  if (!f) fail('La factura del cobro a revertir ya no está en la cuenta.');
  if (f.estado !== 'enviada' && f.estado !== 'cobrada') {
    fail(`La factura ${f.numero} está «${f.estado}»: el cobro no se revierte a ciegas sobre una factura que cambió de estado.`);
  }
  const reg = asiento.registro || {};
  const idx = f.pagos.findIndex((p) => p.comprobante === reg.comprobante
    && round2(p.monto) === round2(reg.monto) && p.registrado_en === reg.registrado_en);
  if (idx < 0) fail('El cobro asentado por la conciliación ya no está en el registro de la factura: no se revierte a ciegas.');
  const pagos = f.pagos.filter((_, i) => i !== idx);
  const pagado = round2(pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0));
  const saldo = round2(f.total - pagado);
  const estado = saldo <= 0 ? 'cobrada' : 'enviada';
  db.prepare(`UPDATE gesty_facturas SET estado = ?, pagos = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(estado, JSON.stringify(pagos), f.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'factura', entidad_id: String(f.id),
    tipo_evento: 'factura-cobro-revertido',
    resumen: `Cobro revertido en la factura ${f.numero}: salen ${f.moneda} ${fmtMonto(reg.monto)} que había asentado la conciliación `
      + `(cruce #${match.id}). La factura vuelve a saldo ${f.moneda} ${fmtMonto(saldo)}.`,
    payload: { numero: f.numero, monto: reg.monto, desde_conciliacion: match.id, saldo_restante: saldo },
    comprobante_externo: reg.comprobante || '',
  });
}

function revertirPago(db, userId, match, asiento) {
  const pago = db.prepare('SELECT * FROM gesty_pagos WHERE id = ? AND user_id = ?').get(Number(asiento.pago_id), userId);
  if (!pago) fail('El asiento de pago de esta conciliación ya no está: no se revierte a ciegas.');
  db.prepare('DELETE FROM gesty_pagos WHERE id = ?').run(pago.id);
  if (asiento.orden_nacio_de_conciliacion && asiento.orden_id) {
    const quedan = db.prepare('SELECT COUNT(*) AS n FROM gesty_pagos WHERE orden_id = ?').get(Number(asiento.orden_id));
    if (Number(quedan ? quedan.n : 0) === 0) {
      db.prepare(`UPDATE gesty_ordenes_pago SET estado = 'anulada', updated_at = datetime('now') WHERE id = ?`)
        .run(Number(asiento.orden_id));
    }
  }
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'orden-pago', entidad_id: String(asiento.orden_id || ''),
    tipo_evento: 'pago-conciliacion-revertido',
    resumen: `Asiento de pago revertido: salen ${pago.moneda} ${fmtMonto(pago.monto)} que la conciliación había asentado `
      + `(cruce #${match.id}, orden #${asiento.orden_id}). La obligación vuelve a tener su saldo.`,
    payload: { match_id: match.id, pago_id: pago.id, monto: pago.monto, desde_conciliacion: true },
  });
}

function deshacerConciliacion(db, userId, matchId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fila = filaMatch(db, userId, matchId);
  if (fila.estado !== 'asentado') fail('Solo se deshace un cruce asentado (esta propuesta no asentó nada o ya fue revertida).');
  const asiento = safeJson(fila.asiento, null);
  if (!asiento) fail('Este cruce no guarda su asiento: no se revierte a ciegas.');
  const match = parseMatch(fila);
  if (fila.lado === 'cobro') revertirCobro(db, userId, match, asiento);
  else revertirPago(db, userId, match, asiento);
  db.prepare(`UPDATE gesty_conciliacion_matches SET estado = 'revertida', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
  db.prepare(`UPDATE gesty_conciliacion_movimientos SET estado = 'sin-conciliar', updated_at = datetime('now') WHERE id = ?`).run(fila.movimiento_id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'conciliacion-movimiento', entidad_id: String(fila.movimiento_id),
    tipo_evento: 'conciliacion-revertida',
    resumen: `Cruce deshecho por el dueño: el movimiento del extracto vuelve a estar sin conciliar y ${fila.par_etiqueta} recupera su saldo.`,
    payload: { match_id: fila.id, par_tipo: fila.par_tipo, par_id: fila.par_id, motivo: normTexto(o.motivo || '') },
  });
  return getMatch(db, userId, fila.id);
}

// ---------------------------------------------------------------------------
// Consultas: el estado del período y el resumen para «La oficina»
// ---------------------------------------------------------------------------

function listMatches(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_conciliacion_matches WHERE user_id = ? ORDER BY id ASC').all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  if (o.movimiento_id) rows = rows.filter((r) => r.movimiento_id === Number(o.movimiento_id));
  const total = rows.length;
  const lim = Math.min(Math.max(Number(o.limit) || 500, 1), 2000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { matches: rows.slice(off, off + lim).map(parseMatch), total };
}

// El estado de un período: qué se concilió solo (con su par y su
// motivo), qué espera al dueño y qué quedó sin par — declarado,
// nunca escondido. Los extractos sin detalle se declaran aparte:
// su papel entró, pero sus movimientos todavía no existen.
function estadoConciliacion(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const desde = esFechaISO(o.desde) ? String(o.desde) : null;
  const hasta = esFechaISO(o.hasta) ? String(o.hasta) : null;
  const enPeriodo = (fecha) => (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
  const movs = db.prepare('SELECT * FROM gesty_conciliacion_movimientos WHERE user_id = ? ORDER BY fecha ASC, id ASC')
    .all(userId).filter((r) => enPeriodo(r.fecha));
  const porEstado = { conciliado: 0, propuesto: 0, 'sin-par': 0, 'sin-conciliar': 0 };
  for (const r of movs) porEstado[r.estado] = (porEstado[r.estado] || 0) + 1;
  const idsPeriodo = new Set(movs.map((r) => r.id));
  const matches = db.prepare('SELECT * FROM gesty_conciliacion_matches WHERE user_id = ? ORDER BY id ASC').all(userId)
    .filter((r) => idsPeriodo.has(r.movimiento_id));
  const { extractos } = listExtractos(db, userId);
  return {
    desde, hasta,
    extractos,
    extractos_sin_detalle: extractos.filter((e) => e.detalle === 'sin-detalle'),
    movimientos: { total: movs.length, ...porEstado },
    conciliados: matches.filter((r) => r.estado === 'asentado')
      .map((r) => ({ ...parseMatch(r), movimiento: getMovimiento(db, userId, r.movimiento_id) })),
    propuestas: matches.filter((r) => r.estado === 'propuesta')
      .map((r) => ({ ...parseMatch(r), movimiento: getMovimiento(db, userId, r.movimiento_id) })),
    sin_par: movs.filter((r) => r.estado === 'sin-par').map(parseMovimiento),
    sin_conciliar: movs.filter((r) => r.estado === 'sin-conciliar').map(parseMovimiento),
  };
}

function resumenConciliacion(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const { extractos } = listExtractos(db, userId);
  const cont = (estado) => {
    const r = db.prepare('SELECT COUNT(*) AS n FROM gesty_conciliacion_movimientos WHERE user_id = ? AND estado = ?').get(userId, estado);
    return Number(r ? r.n : 0);
  };
  const escaneos = gesty.listEvents(db, userId, { entidad_tipo: 'conciliacion', limit: 5000 })
    .filter((e) => e.tipo_evento === 'conciliacion-escaneo');
  const ultimo = escaneos.length ? escaneos[escaneos.length - 1] : null;
  return {
    hoy,
    extractos: extractos.length,
    extractos_sin_detalle: extractos.filter((e) => e.detalle === 'sin-detalle').length,
    movimientos_conciliados: cont('conciliado'),
    movimientos_sin_conciliar: cont('sin-conciliar') + cont('sin-par'),
    propuestas_esperando: cont('propuesto'),
    ultimo_escaneo: ultimo ? { fecha: ultimo.created_at || null, resumen: ultimo.resumen } : null,
  };
}

module.exports = {
  // constantes declaradas
  VENTANA_ANTES_DIAS, VENTANA_DESPUES_DIAS, REGLAS_FUERTE, CAUSAS_PROPUESTA,
  // esquema
  ensureSchema,
  // extractos y movimientos
  declararExtracto, getExtracto, listExtractos, cargarMovimientos,
  getMovimiento, listMovimientos,
  // el cruce
  conciliar, listPropuestas, aceptarPropuesta, descartarPropuesta,
  deshacerConciliacion, getMatch, listMatches,
  // consultas
  estadoConciliacion, resumenConciliacion,
  // piezas internas, exportadas para tests y reuso
  normalizarMovimiento, evaluarContraPar, candidatosDe, nombreCoincide, normNombre,
};
