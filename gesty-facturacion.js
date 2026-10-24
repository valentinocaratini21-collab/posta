// =====================================================================
// GESTY · G-04 — FACTURACIÓN (preparar y controlar)
// Spec: gesty-cola-builds.md G-04 · gesty-areas-detalle.md §2 ·
// gesty-g02-build-spec.md §4 (bandeja/matriz) y §7 (excepción) ·
// gesty-build-spec.md §4 (entidad Factura) y §6 (interfaz Emisor).
//
// DECISIÓN DEL DUEÑO QUE MANDA (Valentino, 2026-10-24): Facturación
// emite SIEMPRE con OK del dueño. La única excepción es un ajuste que
// el dueño activa: emisión automática SOLO para clientes habituales
// con tope de monto, apagada por default, registrada y reversible en
// un toque. En este build queda el ajuste, su registro y su
// evaluación; la emisión real bajo la regla la ejecuta G-11 — acá el
// borrador calificado se marca `excepcion_aplicable` y sigue el flujo
// normal con el evento asentado. Nada de fingir emisión.
//
// Flujo de estados: borrador → esperando-ok → lista-para-emitir →
// enviada → cobrada (con error-emision y anulada como estados
// explícitos). Pasar a lista-para-emitir SOLO ocurre dentro del
// ejecutor de la tarjeta `factura-emision`, que la fundación invoca
// tras validar la aprobación en el servidor (approveCard): no existe
// endpoint ni función pública que salte ese acto. Enviar exige
// lista-para-emitir; cobrar exige enviada. Totales e impuestos se
// calculan SIEMPRE en el servidor: los totales que mande el cliente
// se ignoran.
// =====================================================================
'use strict';

const gesty = require('./gesty');

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const TIPOS_COMPROBANTE = ['factura', 'nota-debito', 'nota-credito', 'recibo', 'otro'];
const ESTADOS = ['borrador', 'esperando-ok', 'lista-para-emitir', 'enviada', 'cobrada', 'error-emision', 'anulada'];
const CANALES_ENVIO = ['email', 'whatsapp-manual'];

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function soloDigitos(v) { return String(v || '').replace(/\D/g, ''); }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtMonto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Configuración e inyección (patrón de la casa: el canal se inyecta)
// ---------------------------------------------------------------------------

const _cfg = { sendEmail: null };

function configure(opts) {
  const o = opts || {};
  if (o.sendEmail !== undefined) _cfg.sendEmail = typeof o.sendEmail === 'function' ? o.sendEmail : null;
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    numero_borrador INTEGER NOT NULL,
    tipo_comprobante TEXT NOT NULL DEFAULT 'factura',
    letra TEXT NOT NULL DEFAULT '',
    cliente_campo TEXT NOT NULL DEFAULT '',
    cliente_nombre TEXT NOT NULL DEFAULT '',
    cliente_cuit TEXT NOT NULL DEFAULT '',
    cliente_condicion_iva TEXT NOT NULL DEFAULT '',
    cliente_email TEXT NOT NULL DEFAULT '',
    fecha TEXT NOT NULL DEFAULT '',
    vencimiento TEXT NOT NULL DEFAULT '',
    moneda TEXT NOT NULL DEFAULT 'ARS',
    concepto TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    impuestos TEXT NOT NULL DEFAULT '[]',
    otros_impuestos TEXT NOT NULL DEFAULT '[]',
    subtotal_neto REAL NOT NULL DEFAULT 0,
    total_impuestos REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'borrador',
    origen_tipo TEXT NOT NULL DEFAULT 'manual',
    origen_ref TEXT NOT NULL DEFAULT '',
    tarjeta_id INTEGER,
    excepcion_aplicable INTEGER NOT NULL DEFAULT 0,
    emision TEXT NOT NULL DEFAULT '{}',
    envio TEXT NOT NULL DEFAULT '{}',
    pagos TEXT NOT NULL DEFAULT '[]',
    motivo_anulacion TEXT NOT NULL DEFAULT '',
    fundamento_version INTEGER NOT NULL DEFAULT 0,
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_fact_user ON gesty_facturas(user_id, id);
  CREATE INDEX IF NOT EXISTS idx_gesty_fact_estado ON gesty_facturas(user_id, estado, vencimiento);
  CREATE TABLE IF NOT EXISTS gesty_facturacion_meta (
    user_id INTEGER PRIMARY KEY,
    proximo_borrador INTEGER NOT NULL DEFAULT 1
  );
  `);
  _esquemas.add(db);
}

function proximoNumeroBorrador(db, userId) {
  db.prepare(`INSERT INTO gesty_facturacion_meta (user_id, proximo_borrador) VALUES (?, 2)
    ON CONFLICT(user_id) DO UPDATE SET proximo_borrador = proximo_borrador + 1`).run(userId);
  const r = db.prepare('SELECT proximo_borrador FROM gesty_facturacion_meta WHERE user_id = ?').get(userId);
  return Number(r.proximo_borrador) - 1;
}
function numeroFormateado(n) { return `B-${String(n).padStart(4, '0')}`; }

// ---------------------------------------------------------------------------
// Cálculo de totales — SIEMPRE en el servidor
// ---------------------------------------------------------------------------
// Ítem: { descripcion, cantidad, precio_unitario (NETO, sin IVA),
// alicuota_iva }. Lo que el cliente mande como total se ignora.
function calcularTotales(itemsIn, otrosIn) {
  const items = [];
  const porAlicuota = new Map();
  let neto = 0;
  for (const it of itemsIn || []) {
    const descripcion = normTexto(it && it.descripcion);
    if (!descripcion) fail('Cada ítem de la factura necesita su descripción.');
    const cantidad = Number(it.cantidad === undefined ? 1 : it.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) fail(`Cantidad inválida en «${descripcion}».`);
    const precio = Number(it.precio_unitario);
    if (!Number.isFinite(precio) || precio < 0) fail(`Precio inválido en «${descripcion}».`);
    const alicuota = it.alicuota_iva === undefined || it.alicuota_iva === null ? 21 : Number(it.alicuota_iva);
    if (!Number.isFinite(alicuota) || alicuota < 0 || alicuota >= 100) fail(`Alícuota de IVA inválida en «${descripcion}».`);
    const subtotal = round2(cantidad * precio);
    const iva = round2(subtotal * alicuota / 100);
    neto = round2(neto + subtotal);
    if (alicuota > 0) {
      const prev = porAlicuota.get(alicuota) || { concepto: `IVA ${alicuota}%`, alicuota, base: 0, monto: 0 };
      prev.base = round2(prev.base + subtotal);
      prev.monto = round2(prev.monto + iva);
      porAlicuota.set(alicuota, prev);
    }
    items.push({ descripcion, cantidad, precio_unitario: round2(precio), alicuota_iva: alicuota, subtotal, iva });
  }
  if (!items.length) fail('La factura necesita al menos un ítem.');
  const impuestos = [...porAlicuota.values()].sort((a, b) => b.alicuota - a.alicuota);
  const otros = [];
  let otrosTotal = 0;
  for (const oi of otrosIn || []) {
    const concepto = normTexto(oi && oi.concepto);
    const monto = Number(oi && oi.monto);
    if (!concepto || !Number.isFinite(monto) || monto < 0) fail('Impuesto adicional inválido (concepto y monto ≥ 0).');
    otros.push({ concepto, monto: round2(monto) });
    otrosTotal = round2(otrosTotal + monto);
  }
  const totalImpuestos = round2(impuestos.reduce((a, l) => a + l.monto, 0) + otrosTotal);
  return { items, impuestos, otros_impuestos: otros, subtotal_neto: neto, total_impuestos: totalImpuestos, total: round2(neto + totalImpuestos) };
}

// ---------------------------------------------------------------------------
// Cliente: sale del fundamento (§3.3) o del alta del momento — con
// snapshot en la factura (lo ya documentado no se reescribe si el
// fundamento cambia después).
// ---------------------------------------------------------------------------

function buscarClienteDato(db, userId, ref) {
  const clientes = gesty.getData(db, userId, { grupo: 'clientes-facturacion' });
  if (ref.campo) return clientes.find((d) => d.campo === String(ref.campo)) || null;
  if (ref.cuit) {
    const cuit = soloDigitos(ref.cuit);
    return clientes.find((d) => d.valor && soloDigitos(d.valor.cuit || '') === cuit && cuit) || null;
  }
  return null;
}

function resolverCliente(db, userId, clienteIn) {
  const c = clienteIn || {};
  let dato = null;
  if (c.campo || c.cuit) {
    dato = buscarClienteDato(db, userId, c);
    if (c.campo && !dato) fail(`El cliente «${c.campo}» no está en el fundamento.`);
  }
  const v = dato && dato.valor && typeof dato.valor === 'object' ? dato.valor : {};
  const snap = {
    campo: dato ? dato.campo : normTexto(c.campo),
    dato_id: dato ? dato.id : null,
    nombre: normTexto(c.nombre || v.nombre || v.razon_social),
    cuit: soloDigitos(c.cuit || v.cuit || ''),
    condicion_iva: normTexto(c.condicion_iva || v.condicion_iva || v.condicion || ''),
    email: normTexto(c.email || v.email || ''),
  };
  if (!snap.nombre && !snap.cuit) {
    fail('La factura necesita un cliente (nombre o CUIT). Gesty no inventa datos de clientes: si falta, se pregunta.');
  }
  return snap;
}

function datoIdFundamento(db, userId, grupo, campo) {
  const d = gesty.getData(db, userId, { grupo }).find((x) => x.campo === campo);
  return d ? d.id : null;
}

// ---------------------------------------------------------------------------
// Entidad factura — lectura
// ---------------------------------------------------------------------------

function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }

function parseFacturaRow(r) {
  if (!r) return null;
  const pagos = safeJson(r.pagos, []);
  const pagado = round2(pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0));
  return {
    id: r.id, user_id: r.user_id,
    numero_borrador: r.numero_borrador,
    numero: numeroFormateado(r.numero_borrador),
    tipo_comprobante: r.tipo_comprobante, letra: r.letra || '',
    cliente: {
      campo: r.cliente_campo || '', nombre: r.cliente_nombre || '', cuit: r.cliente_cuit || '',
      condicion_iva: r.cliente_condicion_iva || '', email: r.cliente_email || '',
    },
    fecha: r.fecha, vencimiento: r.vencimiento, moneda: r.moneda,
    concepto: r.concepto || '',
    items: safeJson(r.items, []),
    impuestos: safeJson(r.impuestos, []),
    otros_impuestos: safeJson(r.otros_impuestos, []),
    subtotal_neto: r.subtotal_neto, total_impuestos: r.total_impuestos, total: r.total,
    pagado, saldo: round2(r.total - pagado),
    cobro_estado: pagado <= 0 ? 'pendiente' : (round2(r.total - pagado) <= 0 ? 'cobrada' : 'parcial'),
    estado: r.estado,
    origen: { tipo: r.origen_tipo, ref: r.origen_ref || '' },
    tarjeta_id: r.tarjeta_id || null,
    excepcion_aplicable: r.excepcion_aplicable === 1,
    emision: safeJson(r.emision, {}),
    envio: safeJson(r.envio, {}),
    pagos,
    motivo_anulacion: r.motivo_anulacion || '',
    fundamento_version: r.fundamento_version,
    creado_por: r.creado_por,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function getFactura(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_facturas WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return parseFacturaRow(r);
}

function filaFactura(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_facturas WHERE id = ?').get(Number(id));
  if (!r || r.user_id !== userId) fail('Esa factura no es de esta cuenta.');
  return r;
}

// ---------------------------------------------------------------------------
// Creación de borradores (desde cero / presupuesto / duplicado)
// ---------------------------------------------------------------------------

function crearBorrador(db, userId, input) {
  ensureSchema(db);
  const b = input || {};
  const cliente = resolverCliente(db, userId, b.cliente);
  const tipo = normTexto(b.tipo_comprobante || 'factura').toLowerCase();
  if (!TIPOS_COMPROBANTE.includes(tipo)) fail(`Tipo de comprobante inválido: ${tipo}.`);
  const calculo = calcularTotales(b.items, b.otros_impuestos);
  const fecha = normTexto(b.fecha) || hoyISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fail('Fecha de la factura inválida (AAAA-MM-DD).');
  let vencimiento = normTexto(b.vencimiento);
  if (!vencimiento && b.plazo_dias !== undefined && b.plazo_dias !== null) {
    const dias = Number(b.plazo_dias);
    if (!Number.isFinite(dias) || dias < 0) fail('Plazo de vencimiento inválido.');
    const d = new Date(`${fecha}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Math.floor(dias));
    vencimiento = d.toISOString().slice(0, 10);
  }
  if (vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)) fail('Vencimiento inválido (AAAA-MM-DD).');
  const numero = proximoNumeroBorrador(db, userId);
  const info = db.prepare(`INSERT INTO gesty_facturas (user_id, numero_borrador, tipo_comprobante, letra,
    cliente_campo, cliente_nombre, cliente_cuit, cliente_condicion_iva, cliente_email,
    fecha, vencimiento, moneda, concepto, items, impuestos, otros_impuestos,
    subtotal_neto, total_impuestos, total, estado, origen_tipo, origen_ref,
    fundamento_version, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'borrador', ?,?,?,?)`)
    .run(userId, numero, tipo, normTexto(b.letra).toUpperCase().slice(0, 2),
      cliente.campo, cliente.nombre, cliente.cuit, cliente.condicion_iva, cliente.email,
      fecha, vencimiento, normTexto(b.moneda || 'ARS').toUpperCase() || 'ARS', normTexto(b.concepto),
      JSON.stringify(calculo.items), JSON.stringify(calculo.impuestos), JSON.stringify(calculo.otros_impuestos),
      calculo.subtotal_neto, calculo.total_impuestos, calculo.total,
      normTexto(b.origen_tipo || 'manual') || 'manual', normTexto(b.origen_ref || ''),
      gesty.foundationVersion(db, userId), normTexto(b.creado_por || 'gesty') || 'gesty');
  const id = Number(info.lastInsertRowid);
  const factura = getFactura(db, userId, id);
  gesty.recordEvent(db, userId, {
    actor: factura.creado_por === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'factura', entidad_id: String(id),
    tipo_evento: 'factura-creada',
    resumen: `Borrador ${factura.numero} para ${cliente.nombre || cliente.cuit} · ${factura.moneda} ${fmtMonto(factura.total)}`,
    payload: { numero: factura.numero, total: factura.total, moneda: factura.moneda, origen_tipo: factura.origen.tipo, origen_ref: factura.origen.ref },
  });
  return factura;
}

// Desde un presupuesto aceptado (G-08): el acople es por referencia —
// Gesty guarda el id del presupuesto, no construye su entidad.
function crearDesdePresupuesto(db, userId, input) {
  const b = input || {};
  const ref = normTexto(b.presupuesto_ref || b.origen_ref || '');
  if (!ref) fail('La factura desde presupuesto necesita la referencia del presupuesto aceptado.');
  return crearBorrador(db, userId, { ...b, origen_tipo: 'presupuesto', origen_ref: ref });
}

// Duplicar una factura anterior: mismo cliente e ítems, borrador nuevo.
function duplicarFactura(db, userId, facturaId, opts) {
  ensureSchema(db);
  const orig = getFactura(db, userId, facturaId);
  if (!orig) fail('Esa factura no es de esta cuenta.');
  const o = opts || {};
  return crearBorrador(db, userId, {
    cliente: { campo: orig.cliente.campo, nombre: orig.cliente.nombre, cuit: orig.cliente.cuit, condicion_iva: orig.cliente.condicion_iva, email: orig.cliente.email },
    items: orig.items.map((it) => ({ descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: it.precio_unitario, alicuota_iva: it.alicuota_iva })),
    otros_impuestos: orig.otros_impuestos,
    tipo_comprobante: orig.tipo_comprobante, letra: orig.letra, moneda: orig.moneda,
    concepto: o.concepto !== undefined ? o.concepto : orig.concepto,
    fecha: o.fecha, vencimiento: o.vencimiento, plazo_dias: o.plazo_dias,
    origen_tipo: 'duplicado', origen_ref: String(orig.id),
    creado_por: o.creado_por,
  });
}

// Editar SOLO en borrador: recalcula totales en el servidor y deja el
// evento. Fuera de borrador, el documento se corrige por la bandeja
// (editar la tarjeta, R7) o por un duplicado — nunca pisando historia.
function editarBorrador(db, userId, facturaId, cambios) {
  ensureSchema(db);
  const f = getFactura(db, userId, facturaId);
  if (!f) fail('Esa factura no es de esta cuenta.');
  if (f.estado !== 'borrador') fail(`Solo se edita un borrador (esta factura está «${f.estado}»).`);
  const c = cambios || {};
  const cliente = c.cliente !== undefined ? resolverCliente(db, userId, c.cliente) : f.cliente;
  const calculo = calcularTotales(c.items !== undefined ? c.items : f.items, c.otros_impuestos !== undefined ? c.otros_impuestos : f.otros_impuestos);
  const fecha = normTexto(c.fecha !== undefined ? c.fecha : f.fecha) || hoyISO();
  const vencimiento = normTexto(c.vencimiento !== undefined ? c.vencimiento : f.vencimiento);
  db.prepare(`UPDATE gesty_facturas SET cliente_campo = ?, cliente_nombre = ?, cliente_cuit = ?,
    cliente_condicion_iva = ?, cliente_email = ?, fecha = ?, vencimiento = ?, moneda = ?,
    concepto = ?, items = ?, impuestos = ?, otros_impuestos = ?, subtotal_neto = ?,
    total_impuestos = ?, total = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(cliente.campo || '', cliente.nombre, cliente.cuit, cliente.condicion_iva || '', cliente.email || '',
      fecha, vencimiento, normTexto(c.moneda || f.moneda).toUpperCase() || 'ARS',
      normTexto(c.concepto !== undefined ? c.concepto : f.concepto),
      JSON.stringify(calculo.items), JSON.stringify(calculo.impuestos), JSON.stringify(calculo.otros_impuestos),
      calculo.subtotal_neto, calculo.total_impuestos, calculo.total, f.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'factura', entidad_id: String(f.id),
    tipo_evento: 'factura-editada', resumen: `Borrador ${f.numero} editado · ${f.moneda} ${fmtMonto(calculo.total)}`,
    payload: { numero: f.numero, total_anterior: f.total, total_nuevo: calculo.total },
  });
  return getFactura(db, userId, f.id);
}

// ---------------------------------------------------------------------------
// La excepción de emisión automática (G-02 §7): ajuste del dueño
// ---------------------------------------------------------------------------

function getAjusteExcepcion(db, userId) {
  ensureSchema(db);
  const d = gesty.getData(db, userId, { grupo: 'reglas-dueno' }).find((x) => x.campo === 'excepcion_emision');
  const v = d && d.valor && typeof d.valor === 'object' ? d.valor : {};
  return {
    activa: v.activa === true,
    solo_clientes_habituales: true, // alcance cerrado de la decisión: no es configurable a otra cosa
    monto_tope: v.monto_tope === undefined || v.monto_tope === null ? null : Number(v.monto_tope),
    moneda: normTexto(v.moneda || 'ARS').toUpperCase() || 'ARS',
    desde: v.desde || null,
  };
}

function setAjusteExcepcion(db, userId, cambios) {
  ensureSchema(db);
  const c = cambios || {};
  const actual = getAjusteExcepcion(db, userId);
  const activa = c.activa !== undefined ? !!c.activa : actual.activa;
  const tope = c.monto_tope !== undefined ? (c.monto_tope === null ? null : Number(c.monto_tope)) : actual.monto_tope;
  if (activa && (!Number.isFinite(tope) || tope === null || tope <= 0)) {
    fail('La excepción no se activa sin monto tope: es uno de sus dos datos obligatorios (clientes habituales + tope).');
  }
  const valor = {
    activa,
    solo_clientes_habituales: true,
    monto_tope: tope,
    moneda: normTexto(c.moneda || actual.moneda || 'ARS').toUpperCase() || 'ARS',
    desde: activa ? (actual.activa && actual.desde ? actual.desde : new Date().toISOString()) : null,
  };
  gesty.setData(db, userId, {
    grupo: 'reglas-dueno', campo: 'excepcion_emision', valor,
    origen: 'dueno', origen_ref: 'ajustes-facturacion', cargado_por: 'dueno', confirmado: true,
  });
  const tipoEvento = !actual.activa && activa ? 'excepcion-activada'
    : actual.activa && !activa ? 'excepcion-desactivada' : 'excepcion-actualizada';
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'cuenta', entidad_id: String(userId),
    tipo_evento: tipoEvento,
    resumen: activa
      ? `Excepción de emisión ACTIVADA: clientes habituales hasta ${valor.moneda} ${fmtMonto(tope)}`
      : 'Excepción de emisión APAGADA: toda emisión vuelve a pedir el OK del dueño',
    payload: { activa, monto_tope: tope, moneda: valor.moneda },
  });
  return getAjusteExcepcion(db, userId);
}

// La evaluación de la regla sobre UN borrador: las dos condiciones de
// la decisión, nada más. Fuera de ellas, la factura va a la bandeja.
function evaluarExcepcion(db, userId, factura) {
  ensureSchema(db);
  if (!factura) fail('Factura inexistente.');
  const ajuste = getAjusteExcepcion(db, userId);
  const motivos = [];
  if (!ajuste.activa) motivos.push('excepcion-apagada');
  const datoCliente = buscarClienteDato(db, userId, { campo: factura.cliente.campo, cuit: factura.cliente.cuit });
  const habitual = !!datoCliente;
  if (!habitual) motivos.push('cliente-no-habitual');
  if (ajuste.activa && ajuste.monto_tope !== null && factura.total > ajuste.monto_tope) motivos.push('supera-tope');
  if (ajuste.moneda && factura.moneda && ajuste.moneda !== factura.moneda) motivos.push('moneda-distinta');
  return { califica: motivos.length === 0, motivos, ajuste, cliente_habitual: habitual };
}

// ---------------------------------------------------------------------------
// Interfaz Emisor (build-spec §6) — adaptadores
// ---------------------------------------------------------------------------
// emitir(borrador) → { numero, codigo_autorizacion, pdf } ·
// anular(borrador, { motivo }) · estado(). Toda llamada queda
// registrada (request/response sin credenciales) en el registro de
// la factura. Los adaptadores reales llegan en G-11; acá vive el
// `manual`: el modo respaldo permanente (lista-para-emitir).

const EMISORES = {};

function registerEmisor(nombre, impl) {
  const n = normTexto(nombre).toLowerCase();
  if (!n) fail('El adaptador Emisor necesita nombre.');
  if (!impl || typeof impl.emitir !== 'function' || typeof impl.anular !== 'function' || typeof impl.estado !== 'function') {
    fail(`El adaptador «${n}» debe implementar emitir / anular / estado (interfaz Emisor, build-spec §6).`);
  }
  EMISORES[n] = impl;
  return impl;
}

function getEmisor(nombre) { return EMISORES[normTexto(nombre).toLowerCase()] || null; }
function listEmisores() { return Object.keys(EMISORES); }

// El emisor activo de la cuenta: 'manual' hasta que G-11 conecte el
// facturador (el fundamento podrá nombrarlo en reglas-dueno ·
// emisor_activo; si nombra uno no registrado, manda el manual:
// nunca se finge una conexión que no existe).
function emisorActivo(db, userId) {
  const d = gesty.getData(db, userId, { grupo: 'reglas-dueno' }).find((x) => x.campo === 'emisor_activo');
  const nombre = d && d.valor ? normTexto(typeof d.valor === 'string' ? d.valor : d.valor.nombre || '').toLowerCase() : '';
  if (nombre && EMISORES[nombre]) return { nombre, impl: EMISORES[nombre] };
  return { nombre: 'manual', impl: EMISORES.manual };
}

const emisorManual = {
  nombre: 'manual',
  // Modo respaldo: NO emite ante ningún organismo. Deja el documento
  // con todo cargado para que el dueño lo emita en su facturador de
  // siempre en dos toques. numero/CAE quedan null A PROPÓSITO: en
  // este modo todavía no existen, y Gesty no inventa números.
  emitir(factura) {
    return {
      numero: null, codigo_autorizacion: null, pdf: null,
      modo: 'manual', pendiente_en_facturador: true,
      nota: 'Documento listo para emitir en tu facturador de siempre: cliente, ítems, impuestos y totales ya están cargados.',
    };
  },
  anular(factura, opts) {
    return {
      anulada_en_registro: true, modo: 'manual',
      nota: 'La anulación queda asentada en el registro de Gesty; el comprobante se anula en tu facturador de siempre.',
      motivo: normTexto((opts || {}).motivo || ''),
    };
  },
  estado() { return { conectado: false, modo: 'manual', nombre: 'manual' }; },
};
registerEmisor('manual', emisorManual);

// ---------------------------------------------------------------------------
// Bandeja: pedir el OK y los ejecutores de la matriz
// ---------------------------------------------------------------------------

function documentoDatos(f) {
  return {
    factura_id: f.id, numero_borrador: f.numero,
    tipo_comprobante: f.tipo_comprobante, letra: f.letra,
    cliente: f.cliente, fecha: f.fecha, vencimiento: f.vencimiento, moneda: f.moneda,
    concepto: f.concepto, items: f.items, impuestos: f.impuestos, otros_impuestos: f.otros_impuestos,
    subtotal_neto: f.subtotal_neto, total_impuestos: f.total_impuestos, total: f.total,
  };
}

// Pedir el OK = crear la tarjeta `factura-emision` con el documento
// completo. Antes, se evalúa la excepción: si el borrador califica,
// queda marcado `excepcion_aplicable` con su evento — y SIGUE el
// flujo normal (la emisión automática real es de G-11).
function pedirOK(db, userId, facturaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const f = getFactura(db, userId, facturaId);
  if (!f) fail('Esa factura no es de esta cuenta.');
  if (f.estado === 'esperando-ok' && f.tarjeta_id) {
    const card = gesty.getCard(db, userId, f.tarjeta_id);
    if (card && (card.estado === 'esperando' || card.estado === 'devuelta')) {
      fail('Esta factura ya tiene su tarjeta esperando en «Para tu OK».');
    }
  }
  if (f.estado !== 'borrador' && f.estado !== 'esperando-ok') {
    fail(`La factura está «${f.estado}»: ya no pide OK de emisión.`);
  }
  const evaluacion = evaluarExcepcion(db, userId, f);
  if (evaluacion.califica && !f.excepcion_aplicable) {
    db.prepare(`UPDATE gesty_facturas SET excepcion_aplicable = 1, updated_at = datetime('now') WHERE id = ?`).run(f.id);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'factura', entidad_id: String(f.id),
      tipo_evento: 'factura-excepcion-aplicable',
      resumen: `El borrador ${f.numero} califica para la excepción de emisión (cliente habitual, ${f.moneda} ${fmtMonto(f.total)} ≤ tope ${evaluacion.ajuste.moneda} ${fmtMonto(evaluacion.ajuste.monto_tope)}); sin emisión conectada (G-11) sigue el flujo normal con OK`,
      payload: { numero: f.numero, total: f.total, tope: evaluacion.ajuste.monto_tope },
    });
  }
  // Datos del fundamento que el documento usa: si cambian debajo del
  // borrador, la fundación marca la tarjeta «actualizada» (H4).
  const usaDatos = [];
  const clienteDato = buscarClienteDato(db, userId, { campo: f.cliente.campo, cuit: f.cliente.cuit });
  if (clienteDato) usaDatos.push(clienteDato.id);
  for (const campo of ['razon_social', 'cuit']) {
    const id = datoIdFundamento(db, userId, 'datos-fiscales', campo);
    if (id) usaDatos.push(id);
  }
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'factura-emision',
    titulo: `Emitir y enviar factura ${f.numero} · ${f.cliente.nombre || f.cliente.cuit} · ${f.moneda} ${fmtMonto(f.total)}`,
    detalle: { factura_id: f.id, documento: documentoDatos(f), excepcion_aplicable: evaluacion.califica },
    // OJO: la tarjeta NO hereda el vencimiento de cobro de la factura
    // como su propio vencimiento — una factura vencida es justamente
    // la que hay que emitir y mandar; su fecha vive en el documento.
    monto: f.total, moneda: f.moneda, vence: o.vence || '',
    usa_datos: usaDatos, creado_por: o.creado_por || 'gesty',
  });
  db.prepare(`UPDATE gesty_facturas SET estado = 'esperando-ok', tarjeta_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(tarjeta.id, f.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'factura', entidad_id: String(f.id),
    tipo_evento: 'factura-esperando-ok',
    resumen: `Factura ${f.numero} esperando tu OK en la bandeja`,
    payload: { numero: f.numero, tarjeta_id: tarjeta.id, total: f.total },
  });
  return { factura: getFactura(db, userId, f.id), tarjeta, evaluacion_excepcion: evaluacion };
}

// LA transición a lista-para-emitir. Guarda de servidor: solo se
// llega con la tarjeta de la matriz en la mano — la invoca el
// ejecutor que approveCard llama tras validar la aprobación (tipo,
// tarjeta vinculada a ESTA factura, factura esperando su OK). Sin
// ese acto registrado no hay transición: es la forma que tiene el
// servidor de rechazar el «pasar a lista sin OK».
function transicionLista(db, userId, factura, card) {
  if (!card || card.tipo !== 'factura-emision') fail('La transición a lista-para-emitir exige la tarjeta de emisión de la matriz.');
  if (!card.detalle || Number(card.detalle.factura_id) !== Number(factura.id)) fail('La tarjeta no corresponde a esta factura.');
  if (Number(factura.tarjeta_id) !== Number(card.id)) fail('La tarjeta no es la que esta factura está esperando.');
  if (factura.estado !== 'esperando-ok') fail(`La factura está «${factura.estado}»: no está esperando su OK.`);
  const { nombre, impl } = emisorActivo(db, userId);
  const request = { factura_id: factura.id, numero_borrador: factura.numero, total: factura.total, moneda: factura.moneda };
  let response;
  try { response = impl.emitir(documentoDatos(factura), { db, userId }); }
  catch (e) { return { ok: false, motivo: `El emisor (${nombre}) rechazó la emisión: ${e.message || 'error'}` }; }
  if (!response || typeof response !== 'object') return { ok: false, motivo: `El emisor (${nombre}) no respondió.` };
  const emision = {
    emisor: nombre, fecha: new Date().toISOString(),
    numero: response.numero || null, codigo_autorizacion: response.codigo_autorizacion || null,
    pdf: response.pdf || null, modo: response.modo || nombre,
    pendiente_en_facturador: !!response.pendiente_en_facturador,
    nota: response.nota || '',
  };
  db.prepare(`UPDATE gesty_facturas SET estado = 'lista-para-emitir', emision = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(emision), factura.id);
  return {
    ok: true, emision,
    evento: {
      tipo_evento: 'factura-lista-para-emitir', entidad_tipo: 'factura', entidad_id: String(factura.id),
      resumen: `Factura ${factura.numero} lista para emitir (${nombre === 'manual' ? 'modo respaldo: se emite en tu facturador' : `emisor ${nombre}`})`,
      payload: { emisor: nombre, request, response: { numero: emision.numero, codigo_autorizacion: emision.codigo_autorizacion, pdf: emision.pdf, modo: emision.modo } },
      comprobante: emision.codigo_autorizacion || '',
    },
  };
}

// Ejecutor de la tarjeta `factura-emision` (lo invoca approveCard con
// la aprobación ya validada; R6: si devuelve ok:false, la tarjeta
// vuelve con el motivo y la factura queda en su estado, sin fingir).
function ejecutarEmision(db, userId, card) {
  try {
    const facturaId = card && card.detalle ? Number(card.detalle.factura_id) : NaN;
    if (!Number.isInteger(facturaId)) return { ok: false, motivo: 'La tarjeta no referencia ninguna factura.' };
    const f = getFactura(db, userId, facturaId);
    if (!f) return { ok: false, motivo: 'La factura de esta tarjeta no existe en esta cuenta.' };
    const r = transicionLista(db, userId, f, card);
    if (!r.ok) return { ok: false, motivo: r.motivo };
    return {
      ok: true,
      evento: r.evento.tipo_evento, entidad_tipo: r.evento.entidad_tipo, entidad_id: r.evento.entidad_id,
      resumen: r.evento.resumen, payload: r.evento.payload, comprobante: r.evento.comprobante,
    };
  } catch (e) { return { ok: false, motivo: e.message || 'La ejecución falló.' }; }
}

// ---------------------------------------------------------------------------
// Anulación (matriz #3): siempre con motivo, vía su tarjeta
// ---------------------------------------------------------------------------

function solicitarAnulacion(db, userId, facturaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const motivo = normTexto(o.motivo || '');
  if (!motivo) fail('Anular una factura exige el motivo: queda registrado siempre.');
  const f = getFactura(db, userId, facturaId);
  if (!f) fail('Esa factura no es de esta cuenta.');
  if (f.estado !== 'lista-para-emitir' && f.estado !== 'enviada') {
    fail(`Una factura «${f.estado}» no se anula por esta vía (borrador: se frena su tarjeta; cobrada: va por nota de crédito).`);
  }
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'factura-anulacion',
    titulo: `Anular factura ${f.numero} · ${f.cliente.nombre || f.cliente.cuit} · ${f.moneda} ${fmtMonto(f.total)}`,
    detalle: { factura_id: f.id, motivo, documento: documentoDatos(f) },
    monto: f.total, moneda: f.moneda, creado_por: o.creado_por || 'gesty',
  });
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'factura', entidad_id: String(f.id),
    tipo_evento: 'factura-anulacion-pedida',
    resumen: `Anulación de la factura ${f.numero} esperando tu OK: ${motivo}`,
    payload: { numero: f.numero, tarjeta_id: tarjeta.id, motivo },
  });
  return { factura: f, tarjeta };
}

function ejecutarAnulacion(db, userId, card) {
  try {
    const facturaId = card && card.detalle ? Number(card.detalle.factura_id) : NaN;
    if (!Number.isInteger(facturaId)) return { ok: false, motivo: 'La tarjeta no referencia ninguna factura.' };
    const f = getFactura(db, userId, facturaId);
    if (!f) return { ok: false, motivo: 'La factura de esta tarjeta no existe en esta cuenta.' };
    if (f.estado !== 'lista-para-emitir' && f.estado !== 'enviada') {
      return { ok: false, motivo: `La factura está «${f.estado}»: ya no se puede anular por esta vía.` };
    }
    const motivo = normTexto(card.detalle.motivo || '');
    const { nombre, impl } = emisorActivo(db, userId);
    let response;
    try { response = impl.anular(documentoDatos(f), { motivo }, { db, userId }); }
    catch (e) { return { ok: false, motivo: `El emisor (${nombre}) rechazó la anulación: ${e.message || 'error'}` }; }
    db.prepare(`UPDATE gesty_facturas SET estado = 'anulada', motivo_anulacion = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(motivo, f.id);
    return {
      ok: true,
      evento: 'factura-anulada', entidad_tipo: 'factura', entidad_id: String(f.id),
      resumen: `Factura ${f.numero} anulada (${nombre}): ${motivo}`,
      payload: { emisor: nombre, motivo, response: response || {} },
    };
  } catch (e) { return { ok: false, motivo: e.message || 'La anulación falló.' }; }
}

// Los ejecutores se registran al cargar el módulo (la fundación los
// invoca solo a través de approveCard).
gesty.registerExecutor('factura-emision', ejecutarEmision);
gesty.registerExecutor('factura-anulacion', ejecutarAnulacion);

// ---------------------------------------------------------------------------
// Envío al cliente (exige lista-para-emitir) y control de cobro
// ---------------------------------------------------------------------------

async function enviarFactura(db, userId, facturaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const f = getFactura(db, userId, facturaId);
  if (!f) fail('Esa factura no es de esta cuenta.');
  if (f.estado === 'esperando-ok' || f.estado === 'borrador') {
    fail('Sin el OK del dueño no sale: la factura todavía no está lista para emitir.');
  }
  if (f.estado !== 'lista-para-emitir') fail(`La factura está «${f.estado}»: no está para enviar.`);
  const canal = normTexto(o.canal || 'email').toLowerCase();
  if (!CANALES_ENVIO.includes(canal)) fail(`Canal de envío inválido: ${canal}.`);

  if (canal === 'whatsapp-manual') {
    // Envío manual asistido: el dueño lo manda por su WhatsApp y el
    // envío existe porque queda registrado con su comprobante.
    const comprobante = normTexto(o.comprobante || '');
    if (!comprobante) fail('El envío manual se registra con su comprobante (qué se mandó y cuándo): sin comprobante, no hay envío.');
    const envio = { canal, destinatario: normTexto(o.destinatario || f.cliente.nombre), fecha: new Date().toISOString(), comprobante };
    db.prepare(`UPDATE gesty_facturas SET estado = 'enviada', envio = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(envio), f.id);
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'factura', entidad_id: String(f.id),
      tipo_evento: 'factura-enviada', resumen: `Factura ${f.numero} enviada por WhatsApp (registro manual del dueño)`,
      payload: { numero: f.numero, canal }, comprobante_externo: comprobante,
    });
    return { factura: getFactura(db, userId, f.id), envio };
  }

  // Canal email: el canal de email existente de la app (inyectado).
  const destinatario = normTexto(o.destinatario || f.cliente.email);
  if (!destinatario) fail('No hay email del cliente para enviarle la factura: se carga una vez y queda en el fundamento.');
  if (!_cfg.sendEmail) fail('El canal de email no está disponible en este servidor.');
  const negocio = (() => {
    const d = gesty.getData(db, userId, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
    return d && d.valor ? String(d.valor) : '';
  })();
  const html = documentoFactura(db, userId, f.id);
  const text = `Factura ${f.numero} de ${negocio || 'tu proveedor'} · ${f.moneda} ${fmtMonto(f.total)} · Vence: ${f.vencimiento || f.fecha}. El detalle completo va en este mensaje.`;
  let r;
  try { r = await _cfg.sendEmail({ to: destinatario, subject: `Factura ${f.numero}${negocio ? ` — ${negocio}` : ''}`, html, text }); }
  catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) {
    const motivo = r && r.skipped ? 'el servidor no tiene el canal de email configurado' : 'el proveedor de email rechazó el envío';
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'factura', entidad_id: String(f.id),
      tipo_evento: 'factura-envio-fallido', resumen: `La factura ${f.numero} NO salió por email: ${motivo}`,
      payload: { numero: f.numero, canal, motivo },
    });
    fail(`El email no salió (${motivo}). La factura sigue lista para emitir: nada quedó enviado a medias.`);
  }
  const envio = { canal, destinatario, fecha: new Date().toISOString(), comprobante: String(r.id || r.provider_id || 'email') };
  db.prepare(`UPDATE gesty_facturas SET estado = 'enviada', envio = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(envio), f.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'factura', entidad_id: String(f.id),
    tipo_evento: 'factura-enviada', resumen: `Factura ${f.numero} enviada por email a ${destinatario}`,
    payload: { numero: f.numero, canal, destinatario }, comprobante_externo: envio.comprobante,
  });
  return { factura: getFactura(db, userId, f.id), envio };
}

// Cobro: se registra el pago que entró (nunca se marca cobrada sin un
// pago que la respalde — áreas §3). Parciales: la factura sigue
// enviada con su saldo; al completar el total pasa a cobrada sola.
function registrarCobro(db, userId, facturaId, pago) {
  ensureSchema(db);
  const p = pago || {};
  const f = getFactura(db, userId, facturaId);
  if (!f) fail('Esa factura no es de esta cuenta.');
  if (f.estado !== 'enviada') fail(`Solo se cobra una factura enviada (esta está «${f.estado}»).`);
  const monto = p.monto === undefined || p.monto === null ? f.saldo : Number(p.monto);
  if (!Number.isFinite(monto) || monto <= 0) fail('El cobro necesita un monto mayor a cero.');
  if (round2(monto) > round2(f.saldo)) fail(`El cobro (${fmtMonto(monto)}) supera el saldo de la factura (${fmtMonto(f.saldo)}).`);
  const registro = {
    monto: round2(monto), medio: normTexto(p.medio || ''), fecha: normTexto(p.fecha) || hoyISO(),
    comprobante: normTexto(p.comprobante || ''), registrado_en: new Date().toISOString(),
  };
  const pagos = [...f.pagos, registro];
  const saldoNuevo = round2(f.total - pagos.reduce((a, x) => a + x.monto, 0));
  const nuevoEstado = saldoNuevo <= 0 ? 'cobrada' : 'enviada';
  db.prepare(`UPDATE gesty_facturas SET estado = ?, pagos = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(nuevoEstado, JSON.stringify(pagos), f.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'factura', entidad_id: String(f.id),
    tipo_evento: 'factura-cobro-registrado',
    resumen: `Cobro registrado en la factura ${f.numero}: ${f.moneda} ${fmtMonto(registro.monto)}${registro.medio ? ` (${registro.medio})` : ''}`,
    payload: { numero: f.numero, monto: registro.monto, medio: registro.medio, saldo_restante: saldoNuevo },
    comprobante_externo: registro.comprobante,
  });
  if (nuevoEstado === 'cobrada') {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'factura', entidad_id: String(f.id),
      tipo_evento: 'factura-cobrada', resumen: `Factura ${f.numero} cobrada: la deuda quedó saldada`,
      payload: { numero: f.numero, total: f.total },
    });
  }
  return { factura: getFactura(db, userId, f.id), pago: registro, saldo: saldoNuevo };
}

// ---------------------------------------------------------------------------
// Consulta (la base de G-05: por estado y por vencimiento)
// ---------------------------------------------------------------------------

function listFacturas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  const rows = db.prepare('SELECT * FROM gesty_facturas WHERE user_id = ? ORDER BY id DESC').all(userId)
    .map(parseFacturaRow);
  let out = rows;
  if (o.estado) out = out.filter((f) => f.estado === String(o.estado));
  if (o.cliente_cuit) out = out.filter((f) => f.cliente.cuit === soloDigitos(o.cliente_cuit));
  if (o.desde) out = out.filter((f) => f.fecha >= String(o.desde));
  if (o.hasta) out = out.filter((f) => f.fecha <= String(o.hasta));
  if (o.vencidas) {
    const hoy = hoyISO();
    out = out.filter((f) => (f.estado === 'lista-para-emitir' || f.estado === 'enviada') && f.vencimiento && f.vencimiento < hoy && f.saldo > 0);
  }
  if (o.a_cobrar) {
    out = out.filter((f) => (f.estado === 'lista-para-emitir' || f.estado === 'enviada') && f.saldo > 0);
  }
  const total = out.length;
  return { facturas: out.slice(off, off + lim), total };
}

function resumenFacturas(db, userId) {
  ensureSchema(db);
  const rows = db.prepare('SELECT * FROM gesty_facturas WHERE user_id = ?').all(userId).map(parseFacturaRow);
  const hoy = hoyISO();
  const porEstado = {};
  for (const e of ESTADOS) porEstado[e] = 0;
  let aCobrar = 0, vencido = 0, cobrado = 0;
  for (const f of rows) {
    porEstado[f.estado] = (porEstado[f.estado] || 0) + 1;
    if (f.estado === 'lista-para-emitir' || f.estado === 'enviada') {
      aCobrar = round2(aCobrar + f.saldo);
      if (f.vencimiento && f.vencimiento < hoy && f.saldo > 0) vencido = round2(vencido + f.saldo);
    }
    cobrado = round2(cobrado + f.pagado);
  }
  return { por_estado: porEstado, total_facturas: rows.length, a_cobrar: aCobrar, vencido, cobrado };
}

// ---------------------------------------------------------------------------
// El documento armado (la vista/descarga del modo respaldo)
// ---------------------------------------------------------------------------
// HTML imprimible con TODO lo cargado. Regla de verdad: mientras la
// emisión sea manual, el documento se rotula como lo que es — un
// documento preparado, NO un comprobante fiscal válido.
function documentoFactura(db, userId, facturaId) {
  ensureSchema(db);
  const f = getFactura(db, userId, facturaId);
  if (!f) fail('Esa factura no es de esta cuenta.');
  const fiscales = gesty.getData(db, userId, { grupo: 'datos-fiscales' });
  const fiscal = (campo) => { const d = fiscales.find((x) => x.campo === campo); return d && d.valor ? String(d.valor) : ''; };
  const negocio = fiscal('razon_social') || 'Tu negocio';
  const cuitEmisor = fiscal('cuit');
  const filas = f.items.map((it) => `<tr><td>${esc(it.descripcion)}</td><td class="n">${fmtMonto(it.cantidad)}</td><td class="n">${fmtMonto(it.precio_unitario)}</td><td class="n">${it.alicuota_iva}%</td><td class="n">${fmtMonto(it.subtotal)}</td></tr>`).join('');
  const filasImp = [
    ...f.impuestos.map((l) => `<tr><td>${esc(l.concepto)} (base ${fmtMonto(l.base)})</td><td class="n">${fmtMonto(l.monto)}</td></tr>`),
    ...f.otros_impuestos.map((l) => `<tr><td>${esc(l.concepto)}</td><td class="n">${fmtMonto(l.monto)}</td></tr>`),
  ].join('');
  // Sin código de autorización de un emisor conectado, el papel es un
  // documento preparado — y se rotula como tal, siempre.
  const aviso = !(f.emision && f.emision.codigo_autorizacion)
    ? '<p class="aviso">Documento preparado por Gesty — pendiente de emisión en tu facturador. No es un comprobante fiscal válido.</p>' : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Factura ${esc(f.numero)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#29173F;margin:32px}h1{font-size:20px;margin:0}.aviso{background:#FBEEDC;border:1px solid #B5805F;padding:8px 12px;border-radius:8px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}.n{text-align:right}.tot{font-weight:700;font-size:16px}.meta{color:#555}</style></head>
<body>${aviso}<h1>${esc(f.tipo_comprobante.toUpperCase())} ${esc(f.letra)} · ${esc(f.numero)}</h1>
<p class="meta">${esc(negocio)}${cuitEmisor ? ` · CUIT ${esc(cuitEmisor)}` : ''}<br>Fecha: ${esc(f.fecha)} · Vencimiento: ${esc(f.vencimiento || f.fecha)} · Estado: ${esc(f.estado)}</p>
<p><strong>Cliente:</strong> ${esc(f.cliente.nombre)}${f.cliente.cuit ? ` · CUIT ${esc(f.cliente.cuit)}` : ''}${f.cliente.condicion_iva ? ` · ${esc(f.cliente.condicion_iva)}` : ''}</p>
${f.concepto ? `<p>${esc(f.concepto)}</p>` : ''}
<table><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">IVA</th><th class="n">Subtotal</th></tr>${filas}</table>
<table><tr><td>Subtotal neto</td><td class="n">${fmtMonto(f.subtotal_neto)}</td></tr>${filasImp}<tr><td class="tot">TOTAL ${esc(f.moneda)}</td><td class="n tot">${fmtMonto(f.total)}</td></tr></table>
</body></html>`;
}

module.exports = {
  // constantes
  TIPOS_COMPROBANTE, ESTADOS, CANALES_ENVIO,
  // configuración / inyección
  configure,
  // esquema
  ensureSchema,
  // entidad y flujo
  crearBorrador, crearDesdePresupuesto, duplicarFactura, editarBorrador,
  getFactura, listFacturas, resumenFacturas, documentoFactura,
  pedirOK, transicionLista, ejecutarEmision,
  solicitarAnulacion, ejecutarAnulacion,
  enviarFactura, registrarCobro,
  // excepción de emisión automática
  getAjusteExcepcion, setAjusteExcepcion, evaluarExcepcion,
  // interfaz Emisor
  registerEmisor, getEmisor, listEmisores, emisorActivo, emisorManual,
  // piezas internas, exportadas para tests y reuso
  calcularTotales,
};
