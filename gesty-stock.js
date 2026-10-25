// =====================================================================
// GESTY · G-10 — STOCK BÁSICO
// Spec: gesty-cola-builds.md G-10 · gesty-areas-detalle.md §5 (Stock)
// y §6 (Proveedores: la orden de compra nace ahí, con su OK) ·
// gesty-sistema-operativo.md §5 (matriz: enviar una orden de compra
// = SIEMPRE con OK del dueño; Stock no compra nada, en ninguna
// circunstancia).
//
// EL INVENTARIO ES UNA DERIVACIÓN, NO UN NÚMERO: el stock actual de
// cada ítem se calcula sumando sus movimientos ASENTADOS. No existe
// campo editable de stock: cualquier cambio pasa por un movimiento
// registrado (entrada, salida o ajuste con motivo) y queda en el
// registro durable. Un conteo que no cierra contra lo derivado no se
// «corrige a ojo»: el ajuste asienta la DIFERENCIA y la declara.
//
// ENTRADAS, de más a menos directa:
// · Registro manual del dueño (o de Gesty a su pedido): asentado.
// · Conteo físico del dueño (registrarConteo): asentado, con la
//   diferencia contra lo derivado explícita en el evento.
// · Conteo por foto: la lectura del modelo crea ajustes A CONFIRMAR
//   (una foto mal leída no reescribe el inventario en silencio).
// · Comprobantes recibidos de G-03 (factura de compra, remito): el
//   papel NO trae detalle por ítem — trae un concepto y un monto.
//   Cuando el concepto coincide con un ítem del inventario, Gesty
//   PROPONE el ingreso como movimiento A CONFIRMAR, sin cantidad
//   (el papel no la dice: la confirma el dueño). Jamás suma solo:
//   un papel mal leído no puede inflar el stock.
// · Facturas de venta de G-04: sus ítems SÍ traen cantidades; la
//   salida se propone A CONFIRMAR con la cantidad de la factura.
//
// LA ORDEN DE COMPRA (frontera que G-07 dejó declarada): nace acá,
// del lado de Proveedores — la alerta de stock la arma y su tarjeta
// `orden-compra` de la matriz la protege. Trae proveedor habitual
// (el del ítem o el de su historial), cantidad sugerida DESDE EL
// CONSUMO OBSERVADO (con la fuente escrita) y precios con fuente
// citada, como en G-08 — comparados contra la última compra, con
// la variación marcada ANTES de la aprobación (§6). Sin OK no sale:
// el ejecutor registrado es el único camino a `enviada`. Como en
// G-07, el acto externo es del dueño (no hay canal técnico a
// proveedores en la familia): el OK es lo que la matriz protege.
//
// EL CIERRE DEL CICLO (regla de verdad, espejo del asiento de G-07):
// la mercadería suma SOLO cuando el remito/comprobante de recepción
// entra por G-03 y se VINCULA a la orden. Sin papel vinculado, la
// orden no se marca recibida y el stock no se mueve.
//
// ALERTAS HONESTAS: sin mínimo cargado por el dueño no hay alerta
// (no se inventan mínimos). La proyección de faltante cruza el
// consumo observado con el plazo de reposición SOLO si el ítem lo
// trae cargado. Todo cálculo de días/consumo recibe el reloj
// (opts.hoy): ninguna función usa la fecha del sistema si el
// llamador pasó la suya.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');
const facturacion = require('./gesty-facturacion');
const proveedores = require('./gesty-proveedores');

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const GRUPO_STOCK = 'stock-ref';
const GRUPO_REGLAS = 'reglas-cobro'; // ahí vive lista_precios (la lee G-08; acá se cita como fuente)
const TIPOS_MOVIMIENTO = ['entrada', 'salida', 'ajuste'];
const ORIGENES_MOVIMIENTO = ['manual', 'conteo', 'foto', 'comprobante', 'factura', 'recepcion-orden'];
const ESTADOS_MOVIMIENTO = ['asentado', 'a-confirmar', 'descartado'];
const ESTADOS_ORDEN = ['borrador', 'esperando-ok', 'enviada', 'recibida-parcial', 'recibida', 'anulada'];
// Estados en los que una orden CUBRE a sus ítems (la alerta no arma otra).
const ESTADOS_ORDEN_ABIERTA = ['borrador', 'esperando-ok', 'enviada', 'recibida-parcial'];
const VENTANA_CONSUMO_DIAS = 30;
const REPOSICION_DEFAULT_DIAS = 7; // declarado en la fuente cuando el ítem no trae plazo cargado
// Tipos de papel que acreditan RECEPCIÓN de mercadería.
const TIPOS_RECEPCION = ['remito', 'factura-recibida'];

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
function sumarDias(iso, dias) {
  const d = new Date(Date.parse(String(iso).slice(0, 10)) + dias * 86400000);
  return d.toISOString().slice(0, 10);
}
function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }
// La clave de un ítem: su nombre normalizado (sin acentos, minúsculas,
// espacios colapsados). Es la identidad para matchear papeles y
// facturas contra el inventario — la misma idea que el slug de G-03.
function claveDe(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function cantidadValida(v, campo) {
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`${campo || 'La cantidad'} tiene que ser un número.`);
  return n;
}

// ---------------------------------------------------------------------------
// Configuración e inyección (patrón de la casa)
// ---------------------------------------------------------------------------

const _cfg = { apiKeyFor: null };
let _contador = null; // contador por foto inyectado (tests); gana al de la casa

function configure(opts) {
  const o = opts || {};
  if (o.apiKeyFor !== undefined) _cfg.apiKeyFor = typeof o.apiKeyFor === 'function' ? o.apiKeyFor : null;
}

// El contador recibe { userId, buffer, mime } y devuelve
// { items: [{ descripcion, cantidad }] } (o null si no pudo contar).
function registerContador(fn) {
  if (fn !== null && typeof fn !== 'function') fail('El contador por foto debe ser una función.');
  _contador = fn;
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  comprobantes.ensureSchema(db);
  facturacion.ensureSchema(db);
  proveedores.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_stock_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    clave TEXT NOT NULL DEFAULT '',
    nombre TEXT NOT NULL DEFAULT '',
    descripcion TEXT NOT NULL DEFAULT '',
    unidad TEXT NOT NULL DEFAULT 'unidades',
    minimo REAL,
    reposicion_dias INTEGER,
    proveedor_campo TEXT NOT NULL DEFAULT '',
    proveedor_nombre TEXT NOT NULL DEFAULT '',
    proveedor_cuit TEXT NOT NULL DEFAULT '',
    activo INTEGER NOT NULL DEFAULT 1,
    creado_por TEXT NOT NULL DEFAULT 'dueno',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_stock_items_clave ON gesty_stock_items(user_id, clave);
  CREATE INDEX IF NOT EXISTS idx_gesty_stock_items_user ON gesty_stock_items(user_id, activo, id);
  CREATE TABLE IF NOT EXISTS gesty_stock_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'entrada',
    cantidad REAL,
    cantidad_contada REAL,
    motivo TEXT NOT NULL DEFAULT '',
    origen TEXT NOT NULL DEFAULT 'manual',
    origen_ref TEXT NOT NULL DEFAULT '',
    comprobante_id INTEGER,
    factura_id INTEGER,
    orden_compra_id INTEGER,
    estado TEXT NOT NULL DEFAULT 'asentado',
    fecha TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '{}',
    creado_por TEXT NOT NULL DEFAULT 'dueno',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_stock_mov_item ON gesty_stock_movimientos(user_id, item_id, estado, id);
  CREATE INDEX IF NOT EXISTS idx_gesty_stock_mov_comp ON gesty_stock_movimientos(user_id, comprobante_id);
  CREATE INDEX IF NOT EXISTS idx_gesty_stock_mov_fact ON gesty_stock_movimientos(user_id, factura_id);
  CREATE TABLE IF NOT EXISTS gesty_ordenes_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    proveedor_campo TEXT NOT NULL DEFAULT '',
    proveedor_nombre TEXT NOT NULL DEFAULT '',
    proveedor_cuit TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    monto_total REAL,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    estado TEXT NOT NULL DEFAULT 'borrador',
    tarjeta_id INTEGER,
    recepcion_comprobante_id INTEGER,
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_ordenes_compra_user ON gesty_ordenes_compra(user_id, estado, id);
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// ÍTEMS — la ficha del inventario. El stock NO vive acá: se deriva.
// ---------------------------------------------------------------------------

function stockDe(db, userId, itemId) {
  ensureSchema(db);
  const r = db.prepare(`SELECT COALESCE(SUM(CASE tipo
      WHEN 'entrada' THEN cantidad
      WHEN 'salida' THEN -cantidad
      ELSE cantidad END), 0) AS s
    FROM gesty_stock_movimientos WHERE user_id = ? AND item_id = ? AND estado = 'asentado' AND cantidad IS NOT NULL`)
    .get(userId, Number(itemId));
  return round2(r ? r.s : 0);
}

// Consumo observado: salidas asentadas en la ventana (default 30
// días, reloj inyectado). Sin salidas no hay ritmo: se declara.
function consumoDe(db, userId, itemId, hoy, ventanaDias) {
  ensureSchema(db);
  const ventana = Number.isInteger(Number(ventanaDias)) && Number(ventanaDias) > 0 ? Number(ventanaDias) : VENTANA_CONSUMO_DIAS;
  const desde = sumarDias(hoy, -(ventana - 1));
  const r = db.prepare(`SELECT COALESCE(SUM(cantidad), 0) AS s FROM gesty_stock_movimientos
    WHERE user_id = ? AND item_id = ? AND tipo = 'salida' AND estado = 'asentado'
      AND fecha >= ? AND fecha <= ?`).get(userId, Number(itemId), desde, hoy);
  const salidas = round2(r ? r.s : 0);
  return { salidas, ventana_dias: ventana, desde, hasta: hoy, por_dia: salidas > 0 ? round2(salidas / ventana * 100) / 100 : 0 };
}

function parseItemRow(db, userId, r, hoy) {
  if (!r) return null;
  const stock = stockDe(db, userId, r.id);
  const consumo = consumoDe(db, userId, r.id, hoy);
  const minimo = r.minimo === null || r.minimo === undefined ? null : Number(r.minimo);
  const diasHastaAgotar = consumo.por_dia > 0 && stock > 0 ? Math.floor(stock / consumo.por_dia) : null;
  let alerta = null;
  if (minimo !== null && stock <= minimo) {
    alerta = { motivo: 'bajo-minimo', texto: `quedan ${fmtMonto(stock)} ${r.unidad} y tu mínimo es ${fmtMonto(minimo)}` };
  } else if (minimo !== null && r.reposicion_dias !== null && r.reposicion_dias !== undefined
    && diasHastaAgotar !== null && diasHastaAgotar <= Number(r.reposicion_dias)) {
    alerta = {
      motivo: 'proyeccion',
      texto: `al ritmo de uso alcanza para unos ${diasHastaAgotar} días y reponer tarda ${Number(r.reposicion_dias)}`,
    };
  }
  const pend = db.prepare(`SELECT COUNT(*) AS n FROM gesty_stock_movimientos WHERE user_id = ? AND item_id = ? AND estado = 'a-confirmar'`)
    .get(userId, r.id);
  return {
    id: r.id, clave: r.clave, nombre: r.nombre, descripcion: r.descripcion || '',
    unidad: r.unidad || 'unidades',
    minimo, reposicion_dias: r.reposicion_dias === null || r.reposicion_dias === undefined ? null : Number(r.reposicion_dias),
    proveedor: r.proveedor_campo || r.proveedor_nombre
      ? { campo: r.proveedor_campo || '', nombre: r.proveedor_nombre || '', cuit: r.proveedor_cuit || '' }
      : null,
    activo: r.activo === 1,
    stock, consumo, dias_hasta_agotar: diasHastaAgotar, alerta,
    movimientos_a_confirmar: pend ? Number(pend.n) || 0 : 0,
    creado_por: r.creado_por, creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function filaItem(db, userId, itemId) {
  const r = db.prepare('SELECT * FROM gesty_stock_items WHERE id = ?').get(Number(itemId));
  if (!r || r.user_id !== userId) fail('Ese ítem de stock no es de esta cuenta.');
  return r;
}
function getItem(db, userId, itemId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const r = db.prepare('SELECT * FROM gesty_stock_items WHERE id = ? AND user_id = ?').get(Number(itemId), userId);
  return r ? parseItemRow(db, userId, r, hoy) : null;
}
function itemPorClave(db, userId, clave) {
  const r = db.prepare('SELECT * FROM gesty_stock_items WHERE user_id = ? AND clave = ?').get(userId, clave);
  return r || null;
}

// El ítem se refleja en el fundamento (grupo `stock-ref`, la vista
// «Tu stock»): mejor esfuerzo, como las fichas vivas de G-07 — si la
// fundación rechaza, el ítem queda igual (él manda en su tabla).
function reflejarItemEnFundamento(db, userId, fila, creadoPor) {
  try {
    gesty.setData(db, userId, {
      grupo: GRUPO_STOCK, campo: fila.clave,
      valor: {
        nombre: fila.nombre, unidad: fila.unidad, minimo: fila.minimo,
        reposicion_dias: fila.reposicion_dias,
        proveedor: fila.proveedor_nombre || '', item_id: fila.id,
      },
      origen: creadoPor === 'dueno' ? 'dueno' : 'inferido',
      origen_ref: `stock-item:${fila.id}`,
      cargado_por: creadoPor === 'dueno' ? 'dueno' : 'gesty',
    });
  } catch (e) { /* la fundación manda: si rechaza, el ítem queda como está */ }
}

function crearItem(db, userId, datos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const d = datos || {};
  const creadoPor = normTexto(o.creado_por || d.creado_por || 'dueno');
  const nombre = normTexto(d.nombre);
  if (!nombre) fail('El ítem necesita su nombre (qué es lo que se cuenta).');
  const clave = claveDe(nombre);
  if (!clave) fail('El nombre del ítem no alcanza para identificarlo.');
  const previo = itemPorClave(db, userId, clave);
  if (previo) {
    const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
    return { item: parseItemRow(db, userId, previo, hoy), existente: true };
  }
  let minimo = null;
  if (d.minimo !== undefined && d.minimo !== null && d.minimo !== '') {
    minimo = cantidadValida(d.minimo, 'El mínimo');
    if (minimo < 0) fail('El mínimo no puede ser negativo.');
  }
  let reposicion = null;
  if (d.reposicion_dias !== undefined && d.reposicion_dias !== null && d.reposicion_dias !== '') {
    reposicion = Number(d.reposicion_dias);
    if (!Number.isInteger(reposicion) || reposicion < 0) fail('El plazo de reposición se carga en días enteros (0 o más).');
  }
  let provCampo = normTexto(d.proveedor_campo || '');
  let provNombre = normTexto(d.proveedor_nombre || (d.proveedor && d.proveedor.nombre) || '');
  let provCuit = soloDigitos(d.proveedor_cuit || (d.proveedor && d.proveedor.cuit) || '');
  if (!provCampo && (provNombre || provCuit)) provCampo = proveedores.campoProveedorDe(provNombre, provCuit);
  const info = db.prepare(`INSERT INTO gesty_stock_items (user_id, clave, nombre, descripcion, unidad, minimo, reposicion_dias,
      proveedor_campo, proveedor_nombre, proveedor_cuit, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, clave, nombre, normTexto(d.descripcion || ''), normTexto(d.unidad || 'unidades') || 'unidades',
      minimo, reposicion, provCampo, provNombre, provCuit, creadoPor);
  const fila = db.prepare('SELECT * FROM gesty_stock_items WHERE id = ?').get(Number(info.lastInsertRowid));
  reflejarItemEnFundamento(db, userId, fila, creadoPor);
  gesty.recordEvent(db, userId, {
    actor: creadoPor === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'stock-item', entidad_id: String(fila.id),
    tipo_evento: 'stock-item-creado',
    resumen: `Ítem de stock creado: ${nombre}${minimo !== null ? ` (mínimo ${fmtMonto(minimo)} ${fila.unidad})` : ' (sin mínimo cargado: no hay alerta hasta que lo fijes)'}`,
    payload: { clave, minimo, unidad: fila.unidad, proveedor_campo: provCampo },
  });
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  return { item: parseItemRow(db, userId, fila, hoy), existente: false };
}

// Editar la FICHA (mínimo, unidad, proveedor, plazo, descripción,
// activo). El stock NO se edita: cualquier campo de cantidad/stock
// que llegue se rechaza en voz alta — el stock se mueve con
// movimientos, nunca con un número suelto.
function actualizarItem(db, userId, itemId, cambios, opts) {
  ensureSchema(db);
  const o = opts || {};
  const c = cambios || {};
  for (const prohibido of ['stock', 'cantidad', 'stock_actual', 'saldo']) {
    if (c[prohibido] !== undefined) {
      fail(`El stock no se edita como un número: para cambiarlo registrá un movimiento (entrada, salida o un conteo con su ajuste). El campo «${prohibido}» no se acepta.`);
    }
  }
  const fila = filaItem(db, userId, itemId);
  const sets = [];
  const args = [];
  if (c.minimo !== undefined) {
    let m = null;
    if (c.minimo !== null && c.minimo !== '') { m = cantidadValida(c.minimo, 'El mínimo'); if (m < 0) fail('El mínimo no puede ser negativo.'); }
    sets.push('minimo = ?'); args.push(m);
  }
  if (c.reposicion_dias !== undefined) {
    let rp = null;
    if (c.reposicion_dias !== null && c.reposicion_dias !== '') {
      rp = Number(c.reposicion_dias);
      if (!Number.isInteger(rp) || rp < 0) fail('El plazo de reposición se carga en días enteros (0 o más).');
    }
    sets.push('reposicion_dias = ?'); args.push(rp);
  }
  if (c.unidad !== undefined) { sets.push('unidad = ?'); args.push(normTexto(c.unidad) || 'unidades'); }
  if (c.descripcion !== undefined) { sets.push('descripcion = ?'); args.push(normTexto(c.descripcion)); }
  if (c.nombre !== undefined) {
    const nombre = normTexto(c.nombre);
    if (!nombre) fail('El nombre no puede quedar vacío.');
    const clave = claveDe(nombre);
    const otro = itemPorClave(db, userId, clave);
    if (otro && Number(otro.id) !== Number(fila.id)) fail(`Ya hay otro ítem con ese nombre («${otro.nombre}»).`);
    sets.push('nombre = ?', 'clave = ?'); args.push(nombre, clave);
  }
  if (c.proveedor_nombre !== undefined || c.proveedor_cuit !== undefined || c.proveedor_campo !== undefined) {
    const nombre = c.proveedor_nombre !== undefined ? normTexto(c.proveedor_nombre) : fila.proveedor_nombre;
    const cuit = c.proveedor_cuit !== undefined ? soloDigitos(c.proveedor_cuit) : fila.proveedor_cuit;
    let campo = c.proveedor_campo !== undefined ? normTexto(c.proveedor_campo) : fila.proveedor_campo;
    if (!campo && (nombre || cuit)) campo = proveedores.campoProveedorDe(nombre, cuit);
    if (c.proveedor_nombre !== undefined || c.proveedor_cuit !== undefined) campo = (nombre || cuit) ? proveedores.campoProveedorDe(nombre, cuit) : '';
    sets.push('proveedor_nombre = ?', 'proveedor_cuit = ?', 'proveedor_campo = ?');
    args.push(nombre, cuit, campo);
  }
  if (c.activo !== undefined) { sets.push('activo = ?'); args.push(c.activo ? 1 : 0); }
  if (!sets.length) fail('No llegó ningún cambio para el ítem.');
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE gesty_stock_items SET ${sets.join(', ')} WHERE id = ?`).run(...args, fila.id);
  const nueva = db.prepare('SELECT * FROM gesty_stock_items WHERE id = ?').get(fila.id);
  reflejarItemEnFundamento(db, userId, nueva, 'dueno');
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'stock-item', entidad_id: String(fila.id),
    tipo_evento: 'stock-item-editado', resumen: `Ficha del ítem actualizada: ${nueva.nombre}`,
    payload: { cambios: Object.keys(c) },
  });
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  return { item: parseItemRow(db, userId, nueva, hoy) };
}

function listItems(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  let rows = db.prepare('SELECT * FROM gesty_stock_items WHERE user_id = ? ORDER BY nombre ASC').all(userId);
  if (!o.incluir_inactivos) rows = rows.filter((r) => r.activo === 1);
  const items = rows.map((r) => parseItemRow(db, userId, r, hoy));
  const filtrados = o.solo_alertas ? items.filter((i) => i.alerta) : items;
  return { items: filtrados, total: filtrados.length, hoy };
}

// ¿El texto de un papel o de una línea de factura habla de este
// ítem? Coincidencia por clave exacta o por contención (la clave
// del ítem dentro del texto, o el texto —si es corto y específico—
// dentro de la clave). Nada de parecidos difusos: un match flojo
// propondría movimientos equivocados.
function coincideItem(item, texto) {
  const ct = claveDe(texto);
  if (!ct || !item) return false;
  if (ct === item.clave) return true;
  if (item.clave.length >= 4 && ct.includes(item.clave)) return true;
  if (ct.length >= 4 && item.clave.includes(ct)) return true;
  return false;
}
function buscarItemPorTexto(db, userId, texto) {
  const rows = db.prepare('SELECT * FROM gesty_stock_items WHERE user_id = ? AND activo = 1 ORDER BY id ASC').all(userId);
  return rows.find((r) => coincideItem(r, texto)) || null;
}

// ---------------------------------------------------------------------------
// MOVIMIENTOS — el registro del que el stock se deriva. Un
// movimiento nace asentado (acto directo del dueño o cierre de una
// orden aprobada) o A CONFIRMAR (nació de un papel o de una foto:
// se asienta con confirmarMovimiento, que es su único camino).
// Ninguna función edita la cantidad de un movimiento ya creado: la
// corrección es otro movimiento (un ajuste con su motivo).
// ---------------------------------------------------------------------------

function parseMovRow(r) {
  if (!r) return null;
  return {
    id: r.id, item_id: r.item_id,
    tipo: r.tipo, cantidad: r.cantidad === null || r.cantidad === undefined ? null : Number(r.cantidad),
    cantidad_contada: r.cantidad_contada === null || r.cantidad_contada === undefined ? null : Number(r.cantidad_contada),
    motivo: r.motivo || '', origen: r.origen, origen_ref: r.origen_ref || '',
    comprobante_id: r.comprobante_id || null, factura_id: r.factura_id || null,
    orden_compra_id: r.orden_compra_id || null,
    estado: r.estado, fecha: r.fecha || '',
    detalle: safeJson(r.detalle, {}),
    creado_por: r.creado_por, creado_en: r.created_at,
  };
}
function filaMovimiento(db, userId, movId) {
  const r = db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(Number(movId));
  if (!r || r.user_id !== userId) fail('Ese movimiento de stock no es de esta cuenta.');
  return r;
}
function efectoDe(tipo, cantidad) {
  if (cantidad === null || cantidad === undefined) return 0;
  return tipo === 'salida' ? -Number(cantidad) : Number(cantidad);
}

function insertarMovimiento(db, userId, m) {
  const info = db.prepare(`INSERT INTO gesty_stock_movimientos (user_id, item_id, tipo, cantidad, cantidad_contada,
      motivo, origen, origen_ref, comprobante_id, factura_id, orden_compra_id, estado, fecha, detalle, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, m.item_id, m.tipo, m.cantidad === undefined ? null : m.cantidad,
      m.cantidad_contada === undefined ? null : m.cantidad_contada,
      m.motivo || '', m.origen || 'manual', m.origen_ref || '',
      m.comprobante_id || null, m.factura_id || null, m.orden_compra_id || null,
      m.estado || 'asentado', m.fecha || '', JSON.stringify(m.detalle || {}), m.creado_por || 'dueno');
  return Number(info.lastInsertRowid);
}

// Registro directo (el dueño en la app, o Gesty a su pedido).
// Entrada/salida exigen cantidad > 0; el ajuste lleva la cantidad
// FIRMADA y un motivo obligatorio. Ningún movimiento asentado deja
// el stock en negativo: si el número real difiere del derivado, la
// vía es el conteo (registrarConteo), no una salida imposible.
function registrarMovimiento(db, userId, datos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const d = datos || {};
  const item = filaItem(db, userId, d.item_id);
  const tipo = normTexto(d.tipo || 'entrada');
  if (!TIPOS_MOVIMIENTO.includes(tipo)) fail(`Tipo de movimiento inválido: ${tipo || '(vacío)'}. Válidos: ${TIPOS_MOVIMIENTO.join(', ')}.`);
  const cantidad = cantidadValida(d.cantidad, 'La cantidad');
  if (tipo !== 'ajuste' && cantidad <= 0) fail('La cantidad de una entrada o salida tiene que ser mayor a cero.');
  if (tipo === 'ajuste' && cantidad === 0) fail('Un ajuste en cero no mueve nada: no se registra.');
  const motivo = normTexto(d.motivo || '');
  if (tipo === 'ajuste' && !motivo) fail('El ajuste lleva su motivo: el stock no se toca «a ojo».');
  const fecha = esFechaISO(d.fecha) ? String(d.fecha) : (esFechaISO(o.hoy) ? String(o.hoy) : hoyISO());
  const creadoPor = normTexto(o.creado_por || d.creado_por || 'dueno');
  const stockPrevio = stockDe(db, userId, item.id);
  const resultante = round2(stockPrevio + efectoDe(tipo, cantidad));
  if (resultante < 0) {
    fail(`Ese movimiento dejaría el stock de «${item.nombre}» en ${fmtMonto(resultante)}: hay ${fmtMonto(stockPrevio)} registrados. Si el número real es otro, registrá un conteo y el ajuste asienta la diferencia.`);
  }
  const id = insertarMovimiento(db, userId, {
    item_id: item.id, tipo, cantidad, motivo,
    origen: ORIGENES_MOVIMIENTO.includes(d.origen) ? d.origen : (creadoPor === 'gesty' ? 'manual' : 'manual'),
    origen_ref: normTexto(d.origen_ref || ''), estado: 'asentado', fecha, creado_por: creadoPor,
    detalle: d.detalle && typeof d.detalle === 'object' ? d.detalle : {},
  });
  gesty.recordEvent(db, userId, {
    actor: creadoPor === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'stock-item', entidad_id: String(item.id),
    tipo_evento: 'stock-movimiento',
    resumen: `${tipo === 'entrada' ? 'Entrada' : tipo === 'salida' ? 'Salida' : 'Ajuste'} de stock: ${item.nombre} ${tipo === 'ajuste' ? (cantidad > 0 ? '+' : '') : ''}${fmtMonto(cantidad)} ${item.unidad} → quedan ${fmtMonto(resultante)}${motivo ? ` · ${motivo}` : ''}`,
    payload: { movimiento_id: id, tipo, cantidad, stock_resultante: resultante },
  });
  if (o.evaluar_alertas !== false) evaluarAlertas(db, userId, { hoy: fecha });
  return { movimiento: parseMovRow(db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(id)), stock: resultante };
}

// EL CONTEO FÍSICO: el dueño cuenta y dice el número real. El
// ajuste asienta la DIFERENCIA contra lo derivado y la declara en
// el evento — jamás se inventa el número que falta ni se esconde
// el que sobra (áreas §5).
function registrarConteo(db, userId, datos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const d = datos || {};
  const item = filaItem(db, userId, d.item_id);
  const contada = cantidadValida(d.cantidad_contada !== undefined ? d.cantidad_contada : d.cantidad, 'La cantidad contada');
  if (contada < 0) fail('La cantidad contada no puede ser negativa.');
  const fecha = esFechaISO(d.fecha) ? String(d.fecha) : (esFechaISO(o.hoy) ? String(o.hoy) : hoyISO());
  const creadoPor = normTexto(o.creado_por || d.creado_por || 'dueno');
  const derivado = stockDe(db, userId, item.id);
  const diferencia = round2(contada - derivado);
  let movimiento = null;
  if (diferencia !== 0) {
    const id = insertarMovimiento(db, userId, {
      item_id: item.id, tipo: 'ajuste', cantidad: diferencia, cantidad_contada: contada,
      motivo: normTexto(d.motivo || '') || 'conteo físico',
      origen: 'conteo', estado: 'asentado', fecha, creado_por: creadoPor,
      detalle: { stock_derivado_antes: derivado, diferencia },
    });
    movimiento = parseMovRow(db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(id));
  }
  gesty.recordEvent(db, userId, {
    actor: creadoPor === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'stock-item', entidad_id: String(item.id),
    tipo_evento: 'stock-conteo',
    resumen: diferencia === 0
      ? `Conteo de ${item.nombre}: contaste ${fmtMonto(contada)} ${item.unidad} y coincide con lo registrado.`
      : `Conteo de ${item.nombre}: según los movimientos había ${fmtMonto(derivado)} ${item.unidad} y contaste ${fmtMonto(contada)} — la diferencia (${diferencia > 0 ? '+' : ''}${fmtMonto(diferencia)}) quedó asentada como ajuste, visible.`,
    payload: { derivado_antes: derivado, contada, diferencia, movimiento_id: movimiento ? movimiento.id : null },
  });
  if (o.evaluar_alertas !== false) evaluarAlertas(db, userId, { hoy: fecha });
  return { movimiento, stock_derivado_antes: derivado, cantidad_contada: contada, diferencia, stock: stockDe(db, userId, item.id) };
}

// Confirmar un movimiento A CONFIRMAR: el único camino a asentado
// para lo que nació de un papel o una foto. La cantidad final es
// la propuesta o la que el dueño declara al confirmar — si el
// papel no traía cantidad y no llega ninguna, no se inventa.
function confirmarMovimiento(db, userId, movId, datos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const d = datos || {};
  const fila = filaMovimiento(db, userId, movId);
  if (fila.estado !== 'a-confirmar') fail(`Este movimiento ya está ${fila.estado}: no se confirma dos veces.`);
  const item = filaItem(db, userId, fila.item_id);
  let cantidad = fila.cantidad === null || fila.cantidad === undefined ? null : Number(fila.cantidad);
  if (d.cantidad !== undefined && d.cantidad !== null && d.cantidad !== '') cantidad = cantidadValida(d.cantidad, 'La cantidad');
  if (cantidad === null) fail('Este movimiento nació de un papel que no trae cantidades: cargá la cantidad para confirmarlo (no se inventa).');
  if (fila.tipo !== 'ajuste' && cantidad <= 0) fail('La cantidad confirmada tiene que ser mayor a cero.');
  if (fila.tipo === 'ajuste' && cantidad === 0) fail('Confirmar un ajuste en cero no mueve nada: descartalo si no corresponde.');
  const stockPrevio = stockDe(db, userId, item.id);
  const resultante = round2(stockPrevio + efectoDe(fila.tipo, cantidad));
  if (resultante < 0) {
    fail(`Confirmar esto dejaría el stock de «${item.nombre}» en ${fmtMonto(resultante)}: hay ${fmtMonto(stockPrevio)} registrados. Si el número real es otro, registrá un conteo.`);
  }
  db.prepare(`UPDATE gesty_stock_movimientos SET estado = 'asentado', cantidad = ? WHERE id = ?`).run(cantidad, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'stock-item', entidad_id: String(item.id),
    tipo_evento: 'stock-movimiento-confirmado',
    resumen: `Movimiento confirmado: ${fila.tipo} de ${fmtMonto(cantidad)} ${item.unidad} de ${item.nombre} (venía de ${fila.origen}) → quedan ${fmtMonto(resultante)}`,
    payload: { movimiento_id: fila.id, tipo: fila.tipo, cantidad, origen: fila.origen, stock_resultante: resultante },
  });
  if (o.evaluar_alertas !== false) evaluarAlertas(db, userId, { hoy: esFechaISO(o.hoy) ? String(o.hoy) : hoyISO() });
  return { movimiento: parseMovRow(db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(fila.id)), stock: resultante };
}

function descartarMovimiento(db, userId, movId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const fila = filaMovimiento(db, userId, movId);
  if (fila.estado !== 'a-confirmar') fail(`Este movimiento ya está ${fila.estado}: solo se descarta lo que espera confirmación.`);
  db.prepare(`UPDATE gesty_stock_movimientos SET estado = 'descartado' WHERE id = ?`).run(fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'stock-item', entidad_id: String(fila.item_id),
    tipo_evento: 'stock-movimiento-descartado',
    resumen: `Propuesta de movimiento descartada (${fila.tipo} de ${fila.origen}): no movió el stock.`,
    payload: { movimiento_id: fila.id, motivo: normTexto(d.motivo || '') },
  });
  return { movimiento: parseMovRow(db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(fila.id)) };
}

function listMovimientos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_stock_movimientos WHERE user_id = ? ORDER BY id DESC').all(userId);
  if (o.item_id) rows = rows.filter((r) => Number(r.item_id) === Number(o.item_id));
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  if (o.tipo) rows = rows.filter((r) => r.tipo === String(o.tipo));
  if (o.origen) rows = rows.filter((r) => r.origen === String(o.origen));
  const total = rows.length;
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { movimientos: rows.slice(off, off + lim).map(parseMovRow), total };
}

// ---------------------------------------------------------------------------
// SINCRONIZACIONES — las propuestas que nacen de los papeles.
// Dedupe por (comprobante/factura, ítem): re-correr no duplica.
// ---------------------------------------------------------------------------

function yaPropuesto(db, userId, campo, valor, itemId) {
  const r = db.prepare(`SELECT id FROM gesty_stock_movimientos WHERE user_id = ? AND ${campo} = ? AND item_id = ? AND estado != 'descartado' LIMIT 1`)
    .get(userId, Number(valor), Number(itemId));
  return !!r;
}

// Comprobantes recibidos leídos (G-03): si el concepto coincide
// con un ítem, se PROPONE el ingreso A CONFIRMAR. El papel no
// trae cantidades por ítem: la propuesta nace sin cantidad y la
// confirma el dueño. Los conceptos sin ítem vuelven como
// sugerencia de alta (el alta de productos desde papeles es CON
// confirmación, cola G-10 paso 1: crearItem es ese acto).
function sincronizarDesdeComprobantes(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const { comprobantes: comps } = comprobantes.listComprobantes(db, userId, { limit: 500 });
  const creados = [];
  const sugeridos = new Map();
  let omitidos = 0;
  for (const c of comps) {
    if (c.direccion !== 'recibida' || c.estado_lectura !== 'leido' || c.duplicado_de) continue;
    if (c.tipo === 'remito') continue; // el remito acredita recepción: entra por vincularRecepcion contra su orden
    const item = buscarItemPorTexto(db, userId, c.concepto || '');
    if (!item) {
      if (normTexto(c.concepto)) sugeridos.set(claveDe(c.concepto), { concepto: c.concepto, comprobante_id: c.id });
      continue;
    }
    if (yaPropuesto(db, userId, 'comprobante_id', c.id, item.id)) { omitidos++; continue; }
    const id = insertarMovimiento(db, userId, {
      item_id: item.id, tipo: 'entrada', cantidad: null, origen: 'comprobante',
      origen_ref: `comprobante:${c.id}`, comprobante_id: c.id, estado: 'a-confirmar',
      fecha: esFechaISO(c.fecha) ? String(c.fecha) : hoy, creado_por: 'gesty',
      motivo: `ingreso sugerido por el comprobante ${c.tipo} ${c.numero || ''} de ${c.emisor.nombre || ''}`.trim(),
      detalle: { concepto: c.concepto || '', monto_papel: c.monto_total === undefined ? null : c.monto_total },
    });
    creados.push(parseMovRow(db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(id)));
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'stock-item', entidad_id: String(item.id),
      tipo_evento: 'stock-ingreso-sugerido',
      resumen: `El comprobante ${c.numero || ''} de ${c.emisor.nombre || 'un proveedor'} parece traer ${item.nombre}: el ingreso quedó A CONFIRMAR (el papel no dice la cantidad).`,
      payload: { movimiento_id: id, comprobante_id: c.id },
    });
  }
  return { creados, items_sugeridos: [...sugeridos.values()], omitidos, hoy };
}

// Facturas de venta (G-04) ya fuera de borrador: sus líneas SÍ
// traen cantidades. La salida se propone A CONFIRMAR por línea
// que coincide con un ítem (la factura puede ser de servicios:
// lo que no coincide, no propone nada).
function sincronizarDesdeFacturas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const { facturas } = facturacion.listFacturas(db, userId, { limit: 500 });
  const creados = [];
  let omitidos = 0;
  for (const f of facturas) {
    if (!['lista-para-emitir', 'enviada', 'cobrada'].includes(f.estado)) continue;
    for (const linea of f.items || []) {
      const item = buscarItemPorTexto(db, userId, linea.descripcion || '');
      if (!item) continue;
      if (yaPropuesto(db, userId, 'factura_id', f.id, item.id)) { omitidos++; continue; }
      const id = insertarMovimiento(db, userId, {
        item_id: item.id, tipo: 'salida', cantidad: Number(linea.cantidad) || null, origen: 'factura',
        origen_ref: `factura:${f.id}`, factura_id: f.id, estado: 'a-confirmar',
        fecha: esFechaISO(f.fecha) ? String(f.fecha) : hoy, creado_por: 'gesty',
        motivo: `venta según la factura ${f.numero || f.id} a ${f.cliente && f.cliente.nombre ? f.cliente.nombre : 'un cliente'}`,
        detalle: { descripcion_factura: linea.descripcion || '' },
      });
      creados.push(parseMovRow(db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(id)));
    }
  }
  return { creados, omitidos, hoy };
}

// ---------------------------------------------------------------------------
// CONTEO POR FOTO — el patrón de visión de la casa (como G-03):
// clave por cuenta inyectada, contador inyectable para tests. La
// lectura propone AJUSTES A CONFIRMAR contra el stock derivado:
// la foto no reescribe el inventario en silencio. Sin lector
// disponible no se crea nada y se dice por qué.
// ---------------------------------------------------------------------------

const PROMPT_CONTEO = `Sos el contador de stock de una administradora de negocios. Mirás UNA foto del depósito o la góndola de un negocio y contás los productos visibles. Devolvé SOLO un JSON válido, sin texto extra, con esta forma exacta:
{"items":[{"descripcion":"","cantidad":0}]}
Reglas: una entrada por tipo de producto visible, con su mejor descripción corta (qué es, sin marca inventada) y la cantidad de unidades que se ven. Si algo no se distingue con seguridad, no lo incluyas: NUNCA inventes un producto ni una cantidad.`;

async function llamarModeloConteo(userId, buffer, mime) {
  const key = _cfg.apiKeyFor ? String(_cfg.apiKeyFor(userId) || '') : '';
  if (!key) return null;
  const b64 = buffer.toString('base64');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o', temperature: 0.1, max_tokens: 900,
      messages: [
        { role: 'system', content: PROMPT_CONTEO },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          { type: 'text', text: 'Contá los productos de esta foto y devolvé el JSON pedido.' },
        ] },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const raw = String((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()); }
  catch (e) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) { return null; } }
    return null;
  }
}

async function contarDesdeFoto(db, userId, datos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const d = datos || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  if (!Buffer.isBuffer(d.buffer) || !d.buffer.length) fail('La foto llegó vacía.');
  if (!/^image\//.test(d.mime || '')) fail('El conteo por foto necesita una imagen.');
  let lectura = null;
  const fn = _contador || (({ userId: uid, buffer, mime }) => llamarModeloConteo(uid, buffer, mime));
  try { lectura = await fn({ userId, buffer: d.buffer, mime: d.mime }); } catch (e) { lectura = null; }
  if (!lectura || !Array.isArray(lectura.items)) {
    return { ok: false, motivo: 'sin-lector', mensaje: 'No se pudo leer la foto (sin clave del modelo o lectura fallida): no se tocó el stock.', propuestas: [], sin_item: [], sin_cambio: [] };
  }
  const propuestas = [];
  const sinItem = [];
  const sinCambio = [];
  for (const leido of lectura.items) {
    const descripcion = normTexto(leido && leido.descripcion);
    const contada = Number(leido && leido.cantidad);
    if (!descripcion || !Number.isFinite(contada) || contada < 0) continue;
    const item = buscarItemPorTexto(db, userId, descripcion);
    if (!item) { sinItem.push({ descripcion, cantidad: contada }); continue; }
    const derivado = stockDe(db, userId, item.id);
    const diferencia = round2(contada - derivado);
    if (diferencia === 0) { sinCambio.push({ item_id: item.id, nombre: item.nombre, cantidad: contada }); continue; }
    const id = insertarMovimiento(db, userId, {
      item_id: item.id, tipo: 'ajuste', cantidad: diferencia, cantidad_contada: contada,
      motivo: 'conteo por foto (a confirmar)', origen: 'foto', estado: 'a-confirmar',
      fecha: hoy, creado_por: 'gesty', detalle: { stock_derivado_antes: derivado, leido_como: descripcion },
    });
    propuestas.push(parseMovRow(db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(id)));
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'stock-item', entidad_id: String(item.id),
      tipo_evento: 'stock-conteo-foto',
      resumen: `La foto contó ${fmtMonto(contada)} ${item.unidad} de ${item.nombre} (registrado: ${fmtMonto(derivado)}): el ajuste quedó A CONFIRMAR.`,
      payload: { movimiento_id: id, contada, derivado_antes: derivado },
    });
  }
  return { ok: true, propuestas, sin_item: sinItem, sin_cambio: sinCambio, hoy };
}

// ---------------------------------------------------------------------------
// ALERTAS Y LA ORDEN DE COMPRA — la frontera de G-07: la orden
// nace ACÁ (del lado de Proveedores), la arma la alerta de stock
// y la protege la tarjeta `orden-compra` de la matriz.
// ---------------------------------------------------------------------------

function ordenesAbiertas(db, userId) {
  ensureSchema(db);
  return db.prepare(`SELECT * FROM gesty_ordenes_compra WHERE user_id = ? AND estado IN (${ESTADOS_ORDEN_ABIERTA.map(() => '?').join(',')}) ORDER BY id ASC`)
    .all(userId, ...ESTADOS_ORDEN_ABIERTA);
}
function ordenAbiertaDeItem(db, userId, itemId, abiertas) {
  const lista = abiertas || ordenesAbiertas(db, userId);
  for (const o of lista) {
    if (safeJson(o.items, []).some((it) => Number(it.item_id) === Number(itemId))) return o;
  }
  return null;
}

function listAlertas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const abiertas = ordenesAbiertas(db, userId);
  const { items } = listItems(db, userId, { hoy });
  const alertas = items.filter((i) => i.alerta).map((i) => {
    const abierta = ordenAbiertaDeItem(db, userId, i.id, abiertas);
    return {
      item_id: i.id, nombre: i.nombre, unidad: i.unidad,
      stock: i.stock, minimo: i.minimo, dias_hasta_agotar: i.dias_hasta_agotar,
      motivo: i.alerta.motivo, texto: i.alerta.texto,
      orden_compra_id: abierta ? abierta.id : null,
      orden_estado: abierta ? abierta.estado : null,
    };
  });
  return { alertas, total: alertas.length, hoy };
}

// La cantidad sugerida sale del consumo observado y SIEMPRE
// declara su fuente: ritmo de la ventana + mínimo + plazo de
// reposición (el del ítem, o 7 días declarados como default).
function sugerenciaCantidad(itemParsed) {
  const minimo = itemParsed.minimo || 0;
  const consumo = itemParsed.consumo || { salidas: 0, por_dia: 0, ventana_dias: VENTANA_CONSUMO_DIAS };
  const repo = itemParsed.reposicion_dias !== null && itemParsed.reposicion_dias !== undefined
    ? Number(itemParsed.reposicion_dias) : REPOSICION_DEFAULT_DIAS;
  const repoDeclarado = itemParsed.reposicion_dias !== null && itemParsed.reposicion_dias !== undefined;
  if (consumo.por_dia > 0) {
    const objetivo = minimo + Math.ceil(consumo.por_dia * repo);
    return {
      cantidad: Math.max(1, Math.ceil(objetivo - itemParsed.stock)),
      fuente: {
        tipo: 'consumo',
        texto: `sale de tu consumo de los últimos ${consumo.ventana_dias} días (${fmtMonto(consumo.salidas)} salidas ≈ ${fmtMonto(consumo.por_dia)} por día), tu mínimo de ${fmtMonto(minimo)} y un plazo de reposición de ${repo} días${repoDeclarado ? ' cargado en el ítem' : ' (no cargaste el plazo del ítem: se usan 7 días)'}`,
      },
    };
  }
  return {
    cantidad: Math.max(1, Math.ceil(minimo * 2 - itemParsed.stock)),
    fuente: {
      tipo: 'minimo',
      texto: `sin salidas registradas en los últimos ${consumo.ventana_dias} días: se sugiere reponer hasta el doble de tu mínimo (${fmtMonto(minimo)})`,
    },
  };
}

// Precios con fuente citada (el patrón de G-08): (1) el cargado
// en el pedido, (2) la última orden de compra del ítem, (3) la
// lista de precios del fundamento. Y la comparación que pide §6:
// si el precio elegido difiere del otro precio conocido, la
// variación va marcada en la línea ANTES de la aprobación.
function listaPreciosDe(db, userId) {
  const d = gesty.getData(db, userId, { grupo: GRUPO_REGLAS }).find((x) => x.campo === 'lista_precios');
  const v = d && Array.isArray(d.valor) ? d.valor : [];
  return v.filter((e) => e && normTexto(e.descripcion) && Number.isFinite(Number(e.precio_unitario)))
    .map((e) => ({ descripcion: normTexto(e.descripcion), precio_unitario: round2(Number(e.precio_unitario)) }));
}
function precioDeLista(db, userId, descripcion) {
  const nd = claveDe(descripcion);
  const lista = listaPreciosDe(db, userId);
  return lista.find((e) => claveDe(e.descripcion) === nd)
    || lista.find((e) => { const ne = claveDe(e.descripcion); return ne && nd && (ne.includes(nd) || nd.includes(ne)); })
    || null;
}
function precioUltimaOrden(db, userId, itemId) {
  const rows = db.prepare(`SELECT * FROM gesty_ordenes_compra WHERE user_id = ? AND estado != 'anulada' ORDER BY id DESC`).all(userId);
  for (const r of rows) {
    for (const it of safeJson(r.items, [])) {
      if (Number(it.item_id) === Number(itemId) && it.precio_unitario !== null && it.precio_unitario !== undefined) {
        return { precio: round2(Number(it.precio_unitario)), orden_id: r.id };
      }
    }
  }
  return null;
}
function resolverPrecioOrden(db, userId, item, explicito) {
  const ultima = precioUltimaOrden(db, userId, item.id);
  const lista = precioDeLista(db, userId, item.nombre);
  let precio = null;
  let fuente = null;
  if (explicito !== undefined && explicito !== null && explicito !== '') {
    precio = round2(Number(explicito));
    if (!Number.isFinite(precio) || precio < 0) fail(`Precio inválido en «${item.nombre}».`);
    fuente = { tipo: 'cargado', texto: 'lo cargó el dueño en el pedido' };
  } else if (ultima) {
    precio = ultima.precio;
    fuente = { tipo: 'ultima-orden', orden_id: ultima.orden_id, texto: `es el precio de tu última orden de compra (#${ultima.orden_id})` };
  } else if (lista) {
    precio = lista.precio_unitario;
    fuente = { tipo: 'lista-precios', texto: 'sale de tu lista de precios del fundamento' };
  }
  let variacion = null;
  if (precio !== null) {
    const contra = fuente && fuente.tipo === 'ultima-orden'
      ? (lista ? { precio: lista.precio_unitario, texto: 'tu lista de precios' } : null)
      : (ultima ? { precio: ultima.precio, texto: `tu última orden (#${ultima.orden_id})` } : null);
    if (contra && contra.precio > 0) {
      const pct = round2((precio - contra.precio) / contra.precio * 100);
      if (Math.abs(pct) > 0.5) {
        variacion = {
          precio_anterior: contra.precio, pct,
          texto: `OJO: el precio cambió ${pct > 0 ? '+' : ''}${fmtMonto(pct)}% contra ${contra.texto} (${fmtMonto(contra.precio)} → ${fmtMonto(precio)})`,
        };
      }
    }
  }
  return { precio_unitario: precio, fuente, variacion };
}

// El proveedor habitual de un ítem: el cargado en su ficha; si
// no, el del último papel que trajo ese ítem (su historial).
function proveedorHabitualDe(db, userId, itemRow) {
  if (itemRow.proveedor_campo || itemRow.proveedor_nombre) {
    return { campo: itemRow.proveedor_campo || '', nombre: itemRow.proveedor_nombre || '', cuit: itemRow.proveedor_cuit || '', fuente: 'la ficha del ítem' };
  }
  const { comprobantes: comps } = comprobantes.listComprobantes(db, userId, { limit: 500 });
  for (const c of comps) {
    if (c.direccion !== 'recibida' || c.estado_lectura !== 'leido' || c.duplicado_de) continue;
    if (!coincideItem(itemRow, c.concepto || '')) continue;
    return {
      campo: proveedores.campoProveedorDe(c.emisor.nombre, c.emisor.cuit),
      nombre: c.emisor.nombre || '', cuit: c.emisor.cuit || '', fuente: 'el historial de comprobantes',
    };
  }
  return null;
}

function crearOrdenCompra(db, userId, fila) {
  const info = db.prepare(`INSERT INTO gesty_ordenes_compra (user_id, proveedor_campo, proveedor_nombre, proveedor_cuit,
      items, monto_total, moneda, estado, creado_por)
    VALUES (?,?,?,?,?,?,?,'borrador',?)`)
    .run(userId, fila.proveedor_campo || '', fila.proveedor_nombre || '', fila.proveedor_cuit || '',
      JSON.stringify(fila.items || []), fila.monto_total === undefined ? null : fila.monto_total,
      fila.moneda || 'ARS', fila.creado_por || 'gesty');
  return Number(info.lastInsertRowid);
}

// Armar la orden: desde las alertas (sin datos: Gesty la prepara
// sola) o desde un pedido explícito { items: [{item_id, cantidad?,
// precio_unitario?}] }. Queda en borrador y pide su OK: sin la
// tarjeta aprobada no sale (eso lo garantiza el ejecutor).
function prepararOrdenCompra(db, userId, datos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const d = datos || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : (esFechaISO(d.hoy) ? String(d.hoy) : hoyISO());
  const creadoPor = normTexto(o.creado_por || d.creado_por || 'gesty');
  let lineas = [];
  if (Array.isArray(d.items) && d.items.length) {
    lineas = d.items.map((l) => ({ item_id: Number(l.item_id), cantidad: l.cantidad, precio: l.precio_unitario }));
  } else {
    const { alertas } = listAlertas(db, userId, { hoy });
    lineas = alertas.filter((a) => !a.orden_compra_id).map((a) => ({ item_id: a.item_id }));
  }
  if (!lineas.length) fail('No hay ítems para la orden: o no hay alertas sin orden, o el pedido llegó vacío.');
  // Una orden por proveedor: se agrupa; si el pedido mezcla
  // proveedores, se arma una orden por cada uno.
  const porProveedor = new Map();
  const sinProveedor = [];
  for (const l of lineas) {
    const fila = filaItem(db, userId, l.item_id);
    const parsed = parseItemRow(db, userId, fila, hoy);
    const prov = proveedorHabitualDe(db, userId, fila);
    if (!prov) { sinProveedor.push({ item_id: fila.id, nombre: fila.nombre }); continue; }
    const claveProv = prov.campo || claveDe(prov.nombre);
    if (!porProveedor.has(claveProv)) porProveedor.set(claveProv, { prov, lineas: [] });
    const sug = (l.cantidad === undefined || l.cantidad === null)
      ? sugerenciaCantidad(parsed)
      : { cantidad: cantidadValida(l.cantidad, 'La cantidad'), fuente: { tipo: 'pedido', texto: 'la cantidad la cargó el dueño en el pedido' } };
    if (!(sug.cantidad > 0)) fail(`La cantidad para «${fila.nombre}» tiene que ser mayor a cero.`);
    const precio = resolverPrecioOrden(db, userId, fila, l.precio);
    porProveedor.get(claveProv).lineas.push({
      item_id: fila.id, descripcion: fila.nombre, unidad: fila.unidad,
      cantidad: sug.cantidad, cantidad_fuente: sug.fuente,
      precio_unitario: precio.precio_unitario, precio_fuente: precio.fuente, variacion: precio.variacion,
      subtotal: precio.precio_unitario === null ? null : round2(sug.cantidad * precio.precio_unitario),
      recibido: 0,
    });
  }
  const ordenes = [];
  for (const { prov, lineas: items } of porProveedor.values()) {
    const todosConPrecio = items.every((it) => it.precio_unitario !== null);
    const montoTotal = todosConPrecio ? round2(items.reduce((s, it) => s + (it.subtotal || 0), 0)) : null;
    const id = crearOrdenCompra(db, userId, {
      proveedor_campo: prov.campo, proveedor_nombre: prov.nombre, proveedor_cuit: prov.cuit,
      items, monto_total: montoTotal, moneda: normTexto(d.moneda || 'ARS') || 'ARS', creado_por: creadoPor,
    });
    gesty.recordEvent(db, userId, {
      actor: creadoPor === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'orden-compra', entidad_id: String(id),
      tipo_evento: 'orden-compra-creada',
      resumen: `Orden de compra preparada para ${prov.nombre || prov.campo}: ${items.map((it) => `${fmtMonto(it.cantidad)} × ${it.descripcion}`).join(', ')}${montoTotal !== null ? ` — total ${fmtMonto(montoTotal)}` : ' — sin total: falta el precio de algún ítem'}. Proveedor habitual según ${prov.fuente}.`,
      payload: { items: items.map((it) => it.item_id), monto_total: montoTotal },
    });
    ordenes.push(getOrdenCompra(db, userId, id, { hoy }));
  }
  // La tarjeta nace con la orden (como el vigía de G-07): preparada
  // y esperando — aprobarla es el acto del dueño.
  for (const orden of ordenes) pedirOKOrdenCompra(db, userId, orden.id);
  return { ordenes: ordenes.map((x) => getOrdenCompra(db, userId, x.id, { hoy })), sin_proveedor: sinProveedor, hoy };
}

// El escaneo de alertas: arma las órdenes que falten. Devuelve el
// panorama (alertas vigentes + órdenes creadas ahora).
function evaluarAlertas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const antes = listAlertas(db, userId, { hoy });
  const sinOrden = antes.alertas.filter((a) => !a.orden_compra_id);
  let creadas = [];
  let sinProveedor = [];
  if (sinOrden.length) {
    try {
      const r = prepararOrdenCompra(db, userId, {}, { hoy, creado_por: 'gesty' });
      creadas = r.ordenes;
      sinProveedor = r.sin_proveedor;
      for (const a of sinOrden) {
        gesty.recordEvent(db, userId, {
          actor: 'gesty', entidad_tipo: 'stock-item', entidad_id: String(a.item_id),
          tipo_evento: 'stock-alerta',
          resumen: `Alerta de stock: ${a.nombre} — ${a.texto}.`,
          payload: { motivo: a.motivo, stock: a.stock, minimo: a.minimo },
        });
      }
    } catch (e) { /* sin proveedor conocido no hay orden: la alerta queda visible en las consultas */ }
  }
  const ahora = listAlertas(db, userId, { hoy });
  return { alertas: ahora.alertas, ordenes_creadas: creadas, sin_proveedor: sinProveedor, hoy };
}

// ---------------------------------------------------------------------------
// La tarjeta «orden-compra»: el documento completo que el dueño
// aprueba (ítems, cantidades con su fuente, precios con su fuente
// y las variaciones marcadas). Lo que lee es lo que sale.
// ---------------------------------------------------------------------------

function parseOrdenRow(db, userId, r) {
  if (!r) return null;
  const items = safeJson(r.items, []);
  let tarjeta = null;
  if (r.tarjeta_id) {
    const card = gesty.getCard(db, userId, r.tarjeta_id);
    if (card) tarjeta = { id: card.id, estado: card.estado, version_documento: card.version_documento };
  }
  return {
    id: r.id,
    proveedor: { nombre: r.proveedor_nombre, cuit: r.proveedor_cuit, campo: r.proveedor_campo },
    items, monto_total: r.monto_total === null || r.monto_total === undefined ? null : Number(r.monto_total),
    moneda: r.moneda, estado: r.estado,
    tarjeta_id: r.tarjeta_id || null, tarjeta,
    recepcion_comprobante_id: r.recepcion_comprobante_id || null,
    creado_por: r.creado_por, creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}
function filaOrdenCompra(db, userId, ordenId) {
  const r = db.prepare('SELECT * FROM gesty_ordenes_compra WHERE id = ?').get(Number(ordenId));
  if (!r || r.user_id !== userId) fail('Esa orden de compra no es de esta cuenta.');
  return r;
}
// Reconciliación con la bandeja (espejo de G-07): si el dueño
// frenó la tarjeta de una orden que esperaba, la orden vuelve a
// borrador — su freno es un acto, no silencio.
function sincronizarEstadosOrden(db, userId, ordenId) {
  ensureSchema(db);
  const rows = ordenId
    ? db.prepare(`SELECT * FROM gesty_ordenes_compra WHERE user_id = ? AND id = ? AND estado = 'esperando-ok'`).all(userId, Number(ordenId))
    : db.prepare(`SELECT * FROM gesty_ordenes_compra WHERE user_id = ? AND estado = 'esperando-ok'`).all(userId);
  for (const fila of rows) {
    if (!fila.tarjeta_id) continue;
    const card = gesty.getCard(db, userId, fila.tarjeta_id);
    if (card && card.estado === 'frenada') {
      db.prepare(`UPDATE gesty_ordenes_compra SET estado = 'borrador', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'orden-compra', entidad_id: String(fila.id),
        tipo_evento: 'orden-compra-vuelta-a-borrador',
        resumen: 'La tarjeta de esta orden se frenó: la orden volvió a borrador y se puede volver a pedir el OK.',
        payload: { tarjeta_id: fila.tarjeta_id },
      });
    }
  }
}
function getOrdenCompra(db, userId, ordenId, opts) {
  ensureSchema(db);
  sincronizarEstadosOrden(db, userId, Number(ordenId));
  const r = db.prepare('SELECT * FROM gesty_ordenes_compra WHERE id = ? AND user_id = ?').get(Number(ordenId), userId);
  return r ? parseOrdenRow(db, userId, r) : null;
}
function listOrdenesCompra(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  sincronizarEstadosOrden(db, userId);
  let rows = db.prepare('SELECT * FROM gesty_ordenes_compra WHERE user_id = ? ORDER BY id DESC').all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  const total = rows.length;
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { ordenes: rows.slice(off, off + lim).map((r) => parseOrdenRow(db, userId, r)), total };
}

function detalleTarjetaOrden(db, userId, fila) {
  const items = safeJson(fila.items, []);
  const { dato } = proveedores.fichaProveedor(db, userId, fila.proveedor_campo);
  return {
    orden_compra_id: fila.id,
    proveedor: { nombre: fila.proveedor_nombre, cuit: fila.proveedor_cuit, campo: fila.proveedor_campo },
    usa_ficha: dato ? dato.id : null,
    items,
    monto_total: fila.monto_total, moneda: fila.moneda,
    precios_faltantes: items.filter((it) => it.precio_unitario === null).map((it) => it.descripcion),
    variaciones: items.filter((it) => it.variacion).map((it) => ({ descripcion: it.descripcion, ...it.variacion })),
  };
}
function tituloTarjetaOrden(fila) {
  const items = safeJson(fila.items, []);
  const primero = items.length ? items[0].descripcion : 'stock';
  return `Orden de compra a ${fila.proveedor_nombre || fila.proveedor_campo} · ${items.length === 1 ? primero : `${primero} y ${items.length - 1} más`}${fila.monto_total !== null && fila.monto_total !== undefined ? ` · ${fila.moneda} ${fmtMonto(fila.monto_total)}` : ''}`;
}

function pedirOKOrdenCompra(db, userId, ordenId) {
  ensureSchema(db);
  sincronizarEstadosOrden(db, userId, Number(ordenId));
  const fila = filaOrdenCompra(db, userId, ordenId);
  if (fila.estado === 'enviada') fail('Esta orden ya salió con el OK del dueño: queda registrar su recepción.');
  if (fila.estado === 'recibida' || fila.estado === 'recibida-parcial') fail('Esta orden ya está en recepción.');
  if (fila.estado === 'anulada') fail('Esta orden está anulada.');
  const previa = fila.tarjeta_id ? gesty.getCard(db, userId, fila.tarjeta_id) : null;
  if (previa && previa.estado === 'esperando') fail('Esta orden ya tiene su tarjeta esperando tu OK.');
  const detalle = detalleTarjetaOrden(db, userId, fila);
  let tarjeta;
  if (previa && previa.estado === 'devuelta') {
    tarjeta = gesty.editCard(db, userId, previa.id, {
      detalle, titulo: tituloTarjetaOrden(fila), monto: fila.monto_total, actor: 'gesty',
    });
    db.prepare(`UPDATE gesty_ordenes_compra SET estado = 'esperando-ok', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
    return getOrdenCompra(db, userId, fila.id);
  }
  if (fila.estado === 'esperando-ok') fail('Esta orden ya tiene su tarjeta esperando tu OK.');
  tarjeta = gesty.createCard(db, userId, {
    tipo: 'orden-compra',
    titulo: tituloTarjetaOrden(fila),
    detalle,
    monto: fila.monto_total, moneda: fila.moneda, vence: '',
    usa_datos: detalle.usa_ficha ? [detalle.usa_ficha] : [], creado_por: 'gesty',
  });
  db.prepare(`UPDATE gesty_ordenes_compra SET tarjeta_id = ?, estado = 'esperando-ok', updated_at = datetime('now') WHERE id = ?`)
    .run(tarjeta.id, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'orden-compra', entidad_id: String(fila.id),
    tipo_evento: 'orden-compra-esperando-ok',
    resumen: `Orden de compra lista para tu OK: ${tituloTarjetaOrden(fila)}`,
    payload: { tarjeta_id: tarjeta.id, monto_total: fila.monto_total },
  });
  return getOrdenCompra(db, userId, fila.id);
}

// EL EJECUTOR de la matriz (tipo `orden-compra`): el ÚNICO camino
// a `enviada`. Valida que la tarjeta sea la vigente y que el
// documento no haya cambiado debajo (monto e ítems congelados al
// pedir el OK). Aprobar NO paga ni encarga nada por un canal
// técnico — como en G-07, el acto externo es del dueño por el
// canal habitual del proveedor; el OK es lo que la matriz protege.
function ejecutarOrdenCompra(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  const fila = d.orden_compra_id
    ? db.prepare('SELECT * FROM gesty_ordenes_compra WHERE id = ? AND user_id = ?').get(Number(d.orden_compra_id), userId)
    : null;
  if (!fila) {
    // Tarjeta genérica sin orden detrás (las de la fundación):
    // se sella «sin motor», como en G-08 — no ejecuta nada.
    if (!d.orden_compra_id) return { ok: true, sin_motor: true };
    return { ok: false, motivo: 'La orden de compra de esta tarjeta ya no existe.' };
  }
  if (Number(fila.tarjeta_id) !== Number(card.id)) {
    return { ok: false, motivo: 'Hay una tarjeta más nueva para esta orden: se aprueba la vigente.' };
  }
  if (fila.estado !== 'esperando-ok') {
    return { ok: false, motivo: `La orden ya no está esperando aprobación (está ${fila.estado}).` };
  }
  const montoTarjeta = d.monto_total === null || d.monto_total === undefined ? null : round2(Number(d.monto_total));
  const montoFila = fila.monto_total === null || fila.monto_total === undefined ? null : round2(Number(fila.monto_total));
  if (montoTarjeta !== montoFila) {
    return { ok: false, motivo: 'El total cambió desde que se preparó la orden: la tarjeta se regenera con los números actuales.' };
  }
  db.prepare(`UPDATE gesty_ordenes_compra SET estado = 'enviada', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
  return {
    ok: true,
    evento: 'orden-compra-enviada', entidad_tipo: 'orden-compra', entidad_id: String(fila.id),
    resumen: `Orden de compra APROBADA y dada por enviada: ${tituloTarjetaOrden(fila)}. Sale por el canal habitual del proveedor; el stock se actualiza cuando el remito de recepción entre por Comprobantes y se vincule.`,
    payload: { tarjeta_id: card.id, monto_total: fila.monto_total },
  };
}
gesty.registerExecutor('orden-compra', ejecutarOrdenCompra);

function anularOrdenCompra(db, userId, ordenId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const fila = filaOrdenCompra(db, userId, ordenId);
  if (fila.estado === 'recibida' || fila.estado === 'recibida-parcial') fail('Esta orden ya recibió mercadería: no se anula.');
  if (fila.estado === 'anulada') fail('Esta orden ya está anulada.');
  if (fila.tarjeta_id) {
    const card = gesty.getCard(db, userId, fila.tarjeta_id);
    if (card && (card.estado === 'esperando' || card.estado === 'devuelta')) {
      try { gesty.stopCard(db, userId, card.id, { motivo: 'orden de compra anulada' }); } catch (e) { /* la tarjeta ya no esperaba */ }
    }
  }
  db.prepare(`UPDATE gesty_ordenes_compra SET estado = 'anulada', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'orden-compra', entidad_id: String(fila.id),
    tipo_evento: 'orden-compra-anulada',
    resumen: `Orden de compra anulada: ${tituloTarjetaOrden(fila)}${normTexto(d.motivo || '') ? ` · ${normTexto(d.motivo)}` : ''}`,
    payload: { motivo: normTexto(d.motivo || '') },
  });
  return getOrdenCompra(db, userId, fila.id);
}

// ---------------------------------------------------------------------------
// LA RECEPCIÓN — el cierre del ciclo. La mercadería suma SOLO
// cuando el papel de recepción (remito o factura de compra de
// G-03) se VINCULA a la orden enviada: un remito suelto en
// Comprobantes no mueve el stock por sí solo. Las cantidades
// salen de la orden; el dueño puede declarar una recepción
// parcial por ítem. Un mismo papel recibe una sola orden.
// ---------------------------------------------------------------------------

function vincularRecepcion(db, userId, ordenId, datos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const d = datos || {};
  const fila = filaOrdenCompra(db, userId, ordenId);
  if (!['enviada', 'recibida-parcial'].includes(fila.estado)) {
    fail(fila.estado === 'recibida'
      ? 'Esta orden ya está recibida por completo.'
      : 'La recepción se vincula sobre una orden ya enviada con el OK del dueño.');
  }
  const compId = Number(d.comprobante_id);
  if (!Number.isInteger(compId) || compId <= 0) {
    fail('La recepción exige el comprobante (remito o factura de compra) que entró por Comprobantes: sin papel vinculado, el stock no se mueve.');
  }
  const comp = comprobantes.getComprobante(db, userId, compId);
  if (!comp) fail('Ese comprobante no es de esta cuenta.');
  if (comp.direccion !== 'recibida' || comp.estado_lectura !== 'leido' || comp.duplicado_de) {
    fail('El comprobante de recepción tiene que ser un papel recibido y leído de Comprobantes.');
  }
  if (!TIPOS_RECEPCION.includes(comp.tipo)) {
    fail(`Un ${comp.tipo} no acredita recepción de mercadería: vinculá el remito o la factura de compra.`);
  }
  const campoPapel = proveedores.campoProveedorDe(comp.emisor.nombre, comp.emisor.cuit);
  if (fila.proveedor_campo && campoPapel && fila.proveedor_campo !== campoPapel) {
    fail(`El papel es de ${comp.emisor.nombre || comp.emisor.cuit} y la orden es para ${fila.proveedor_nombre || fila.proveedor_campo}: no se vincula la recepción de otro proveedor.`);
  }
  const yaVinculado = db.prepare(`SELECT id FROM gesty_stock_movimientos WHERE user_id = ? AND comprobante_id = ? AND origen = 'recepcion-orden' LIMIT 1`)
    .get(userId, compId);
  if (yaVinculado) fail('Ese comprobante ya recibió otra orden: un papel acredita una sola recepción.');
  const fecha = esFechaISO(d.fecha) ? String(d.fecha) : (esFechaISO(comp.fecha) ? String(comp.fecha) : (esFechaISO(o.hoy) ? String(o.hoy) : hoyISO()));
  const declaradas = d.cantidades && typeof d.cantidades === 'object' ? d.cantidades : {};
  const items = safeJson(fila.items, []);
  const movimientos = [];
  let completo = true;
  for (const it of items) {
    const pedida = Number(it.cantidad) || 0;
    const yaRecibido = Number(it.recibido) || 0;
    const falta = round2(pedida - yaRecibido);
    if (falta <= 0) continue;
    let llega = falta;
    if (declaradas[it.item_id] !== undefined) {
      llega = cantidadValida(declaradas[it.item_id], 'La cantidad recibida');
      if (llega < 0) fail('La cantidad recibida no puede ser negativa.');
      if (llega > falta + 0.004) fail(`Llegaron ${fmtMonto(llega)} de «${it.descripcion}» pero la orden pedía ${fmtMonto(pedida)} y ya habían entrado ${fmtMonto(yaRecibido)}: revisá el número.`);
    }
    if (llega <= 0) { completo = false; continue; }
    const stockPrevio = stockDe(db, userId, it.item_id);
    const movId = insertarMovimiento(db, userId, {
      item_id: it.item_id, tipo: 'entrada', cantidad: llega,
      motivo: `recepción de la orden de compra #${fila.id} (${comp.tipo} ${comp.numero || ''} de ${comp.emisor.nombre || ''})`.trim(),
      origen: 'recepcion-orden', origen_ref: `orden-compra:${fila.id}`,
      comprobante_id: compId, orden_compra_id: fila.id, estado: 'asentado',
      fecha, creado_por: 'dueno', detalle: { stock_resultante: round2(stockPrevio + llega) },
    });
    it.recibido = round2(yaRecibido + llega);
    if (it.recibido < pedida) completo = false;
    movimientos.push(parseMovRow(db.prepare('SELECT * FROM gesty_stock_movimientos WHERE id = ?').get(movId)));
  }
  if (!movimientos.length) fail('No llegó ninguna cantidad para asentar: la recepción no movió el stock.');
  const nuevoEstado = completo ? 'recibida' : 'recibida-parcial';
  db.prepare(`UPDATE gesty_ordenes_compra SET items = ?, estado = ?, recepcion_comprobante_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(items), nuevoEstado, compId, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'orden-compra', entidad_id: String(fila.id),
    tipo_evento: completo ? 'orden-compra-recibida' : 'orden-compra-recibida-parcial',
    resumen: `Recepción vinculada (${comp.tipo} ${comp.numero || ''} de ${comp.emisor.nombre || ''}): entró ${movimientos.map((m) => `${fmtMonto(m.cantidad)} × ítem #${m.item_id}`).join(', ')} y el stock se actualizó. La orden quedó ${completo ? 'recibida' : 'recibida PARCIALMENTE'}.`,
    payload: { comprobante_id: compId, movimientos: movimientos.map((m) => m.id) },
    comprobante_externo: `comprobante:${compId}`,
  });
  if (o.evaluar_alertas !== false) evaluarAlertas(db, userId, { hoy: fecha });
  return { orden: getOrdenCompra(db, userId, fila.id), movimientos };
}

// ---------------------------------------------------------------------------
// RESUMEN para «La oficina» — conteos y alertas, solo desde los
// registros (patrón de los resúmenes hermanos).
// ---------------------------------------------------------------------------

function resumenStock(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const { items, total } = listItems(db, userId, { hoy });
  const { alertas } = listAlertas(db, userId, { hoy });
  const pend = db.prepare(`SELECT COUNT(*) AS n FROM gesty_stock_movimientos WHERE user_id = ? AND estado = 'a-confirmar'`).get(userId);
  const ordenes = { borrador: 0, 'esperando-ok': 0, enviada: 0, 'recibida-parcial': 0, recibida: 0, anulada: 0 };
  const rows = db.prepare('SELECT estado, COUNT(*) AS n FROM gesty_ordenes_compra WHERE user_id = ? GROUP BY estado').all(userId);
  for (const r of rows) if (ordenes[r.estado] !== undefined) ordenes[r.estado] = r.n;
  return {
    hoy,
    items: total,
    con_alerta: alertas.length,
    alertas: alertas.map((a) => ({ item_id: a.item_id, nombre: a.nombre, stock: a.stock, minimo: a.minimo, motivo: a.motivo, orden_compra_id: a.orden_compra_id })),
    movimientos_a_confirmar: pend ? Number(pend.n) || 0 : 0,
    ordenes_compra: ordenes,
  };
}

module.exports = {
  // constantes
  TIPOS_MOVIMIENTO, ORIGENES_MOVIMIENTO, ESTADOS_MOVIMIENTO, ESTADOS_ORDEN, TIPOS_RECEPCION,
  // configuración / inyección
  configure, registerContador,
  // esquema
  ensureSchema,
  // ítems
  crearItem, actualizarItem, getItem, listItems,
  // movimientos (el stock se deriva de acá)
  registrarMovimiento, registrarConteo, confirmarMovimiento, descartarMovimiento, listMovimientos,
  // propuestas desde los papeles y la foto
  sincronizarDesdeComprobantes, sincronizarDesdeFacturas, contarDesdeFoto,
  // alertas y orden de compra
  listAlertas, evaluarAlertas, prepararOrdenCompra, pedirOKOrdenCompra,
  getOrdenCompra, listOrdenesCompra, anularOrdenCompra, vincularRecepcion,
  // resumen
  resumenStock,
  // ejecutor de la matriz
  ejecutarOrdenCompra,
  // piezas internas, exportadas para tests y reuso
  stockDe, consumoDe, claveDe, coincideItem, sugerenciaCantidad,
};
