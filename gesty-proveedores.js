// =====================================================================
// GESTY · G-07 — PROVEEDORES Y PAGOS
// Spec: gesty-cola-builds.md G-07 · gesty-areas-detalle.md §6 ·
// gesty-sistema-operativo.md §5 (matriz: enviar una orden de compra
// o comprometer un pago a proveedor = SIEMPRE con OK del dueño) ·
// gesty-g02-build-spec.md §11 (interfaz Talenty → Gesty).
//
// Los proveedores ya nacen en el fundamento desde los papeles
// (G-03 los propone en el grupo `proveedores`); acá la ficha se
// mantiene VIVA: cada lectura/escaneo la enriquece con lo que los
// comprobantes y los pagos muestran — último comprobante, plazo
// habitual (emisión → vencimiento) y días de pago observados — sin
// pisar jamás lo que el dueño cargó (sus claves quedan intactas;
// solo se refrescan las observadas, y todo cambio de fundamento
// queda en su historial, corregible por él).
//
// OBLIGACIONES: no son una tabla más — se DERIVAN de los
// comprobantes recibidos leídos de G-03 menos los pagos asentados
// acá. Una sola fuente de verdad por número: el papel manda en lo
// devengado; esta área manda en lo pagado.
//
// LA ORDEN DE PAGO la prepara Gesty (proveedor, comprobantes que
// cubre, monto, fecha propuesta según los días de pago de la
// ficha) y nace su tarjeta `pago-proveedor` en «Para tu OK»: el
// ejecutor registrado es el ÚNICO camino a `aprobada`, y aprobar
// compromete el pago — no lo ejecuta. El pago lo hace el DUEÑO en
// su banco/billetera (Gesty no mueve plata) y la orden pasa a
// `pagada` SOLO cuando el comprobante de pago vuelve y se vincula
// (registrarPagoOrden exige el papel: sin papel, no hay pago —
// regla de verdad, con test). Pago parcial: saldo vivo y la orden
// queda `pagada-parcial`; sobrepago: rechazado con los números.
//
// EL VIGÍA: el escaneo mira las obligaciones vencidas o por vencer
// sin orden que las cubra y prepara orden + tarjeta por cada una.
// Nunca silencio: una factura de proveedor vencida siempre tiene
// su tarjeta esperando (o su orden ya en curso, visible en las
// consultas y el resumen).
//
// INTERFAZ TALENTY (doble control, spec §11): una liquidación la
// PREPARA Talenty y Gesty ejecuta su pago; a Gesty solo le llegan
// MONTO y FECHA (y una referencia opaca). La recepción valida con
// lista blanca: cualquier campo de más — y sobre todo cualquier
// dato de personas (legajo, nombre, documento) — RECHAZA la
// recepción entera. La orden resultante es del tipo distinguible
// `liquidacion-externa` y recorre la MISMA tarjeta de OK y el
// MISMO cierre con comprobante que cualquier pago a proveedor.
//
// EL VÍNCULO CON EL PAPEL: G-03 no exporta un setter para su
// columna `asiento_vinculado`, así que el asiento del pago vive de
// este lado: la fila de `gesty_pagos` (orden ↔ comprobante que
// salda ↔ comprobante de pago) más su evento durable. Y para que
// el cierre de G-06 deje de declarar los «pagos del período» como
// faltantes, esta área EXPONE pagosDelPeriodo: la consulta por
// período que el cierre puede consumir (G-06 no se toca).
// =====================================================================
'use strict';

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const GRUPO_PROVEEDORES = 'proveedores';
const GRUPO_REGLAS = 'reglas-pago';
const DIAS_AVISO_DEFAULT = 3;
const TIPOS_ORDEN = ['proveedor', 'liquidacion-externa'];
const ESTADOS_ORDEN = ['borrador', 'esperando-ok', 'aprobada', 'pagada-parcial', 'pagada', 'anulada'];
// Estados en los que una orden CUBRE a sus comprobantes (el vigía
// no prepara otra) y en los que todavía puede recibir pagos.
const ESTADOS_CUBRE = ['borrador', 'esperando-ok', 'aprobada', 'pagada-parcial'];
const ESTADOS_PAGABLE = ['aprobada', 'pagada-parcial'];
// Los tipos de papel que NO obligan a pagar: el remito acredita la
// entrega, no la deuda (la factura que lo acompaña es la obligación).
const TIPOS_NO_OBLIGAN = ['remito'];
// La interfaz con Talenty acepta SOLO esto (lista blanca, §11).
const CAMPOS_LIQUIDACION = ['monto', 'fecha', 'moneda', 'referencia'];

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
function diaSemana(iso) { return new Date(Date.parse(String(iso).slice(0, 10))).getUTCDay(); }
function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }
// La MISMA función que usa G-03 para la clave de la ficha: la
// identidad del proveedor tiene que coincidir entre áreas.
function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function campoProveedorDe(nombre, cuit) {
  const c = soloDigitos(cuit);
  return c ? `cuit_${c}` : slug(nombre);
}
function montoDeComprobante(c) {
  if (!c) return null;
  if (c.monto_total !== null && c.monto_total !== undefined) return Number(c.monto_total);
  if (c.monto_neto !== null && c.monto_neto !== undefined) return Number(c.monto_neto);
  return null;
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente): la orden de pago y el asiento
// del pago. Los pagos viven como FILAS (no como JSON en la orden)
// porque son la fuente que el cierre G-06 consulta por período.
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  comprobantes.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_ordenes_pago (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'proveedor',
    proveedor_campo TEXT NOT NULL DEFAULT '',
    proveedor_nombre TEXT NOT NULL DEFAULT '',
    proveedor_cuit TEXT NOT NULL DEFAULT '',
    referencia_opaca TEXT NOT NULL DEFAULT '',
    monto_total REAL NOT NULL DEFAULT 0,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    fecha_propuesta TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'borrador',
    tarjeta_id INTEGER,
    comprobantes TEXT NOT NULL DEFAULT '[]',
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_ordenes_user ON gesty_ordenes_pago(user_id, estado, id);
  CREATE TABLE IF NOT EXISTS gesty_pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    orden_id INTEGER NOT NULL,
    comprobante_id INTEGER,
    comprobante_pago_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    fecha TEXT NOT NULL DEFAULT '',
    medio TEXT NOT NULL DEFAULT '',
    creado_por TEXT NOT NULL DEFAULT 'dueno',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_pagos_user ON gesty_pagos(user_id, fecha, id);
  CREATE INDEX IF NOT EXISTS idx_gesty_pagos_orden ON gesty_pagos(orden_id);
  CREATE INDEX IF NOT EXISTS idx_gesty_pagos_comp ON gesty_pagos(comprobante_id);
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// Pagos asentados: la mitad «pagado» de cada saldo
// ---------------------------------------------------------------------------

function pagadoDeOrden(db, ordenId) {
  ensureSchema(db);
  const r = db.prepare('SELECT COALESCE(SUM(monto), 0) AS s FROM gesty_pagos WHERE orden_id = ?').get(Number(ordenId));
  return round2(r ? r.s : 0);
}
function pagadoDeComprobante(db, userId, comprobanteId) {
  ensureSchema(db);
  const r = db.prepare('SELECT COALESCE(SUM(monto), 0) AS s FROM gesty_pagos WHERE user_id = ? AND comprobante_id = ?')
    .get(userId, Number(comprobanteId));
  return round2(r ? r.s : 0);
}
function pagosDeOrden(db, userId, ordenId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_pagos WHERE user_id = ? AND orden_id = ? ORDER BY fecha ASC, id ASC')
    .all(userId, Number(ordenId))
    .map((p) => ({
      id: p.id, orden_id: p.orden_id, comprobante_id: p.comprobante_id,
      comprobante_pago_id: p.comprobante_pago_id, monto: p.monto, moneda: p.moneda,
      fecha: p.fecha, medio: p.medio || '', creado_por: p.creado_por, creado_en: p.created_at,
    }));
}

// ---------------------------------------------------------------------------
// OBLIGACIONES — derivadas de G-03 (recibidas leídas) menos pagos
// ---------------------------------------------------------------------------

function ordenesAbiertas(db, userId) {
  ensureSchema(db);
  return db.prepare(`SELECT * FROM gesty_ordenes_pago WHERE user_id = ? AND estado IN (${ESTADOS_CUBRE.map(() => '?').join(',')}) ORDER BY id ASC`)
    .all(userId, ...ESTADOS_CUBRE);
}
function coberturaDe(db, userId, comprobanteId, abiertas) {
  const lista = abiertas || ordenesAbiertas(db, userId);
  for (const o of lista) {
    const ids = safeJson(o.comprobantes, []);
    if (ids.map(Number).includes(Number(comprobanteId))) return { orden_id: o.id, orden_estado: o.estado, orden_tipo: o.tipo };
  }
  return null;
}

function obligacionDe(db, userId, comp, hoy, abiertas) {
  const monto = montoDeComprobante(comp);
  const pagado = pagadoDeComprobante(db, userId, comp.id);
  const saldo = monto === null ? null : round2(monto - pagado);
  const vto = esFechaISO(comp.vencimiento) ? String(comp.vencimiento) : '';
  let estado = 'sin-vencimiento';
  let diasMora = null;
  let diasParaVencer = null;
  if (saldo !== null && saldo <= 0) estado = 'saldada';
  else if (vto) {
    const d = diffDias(vto, hoy);
    if (d !== null && d > 0) { estado = 'vencida'; diasMora = d; }
    else if (d !== null) { estado = 'por-vencer'; diasParaVencer = -d; }
  }
  return {
    comprobante_id: comp.id,
    comprobante: {
      tipo: comp.tipo, numero: comp.numero, fecha: comp.fecha, vencimiento: comp.vencimiento,
      moneda: comp.moneda, monto_total: comp.monto_total, monto_neto: comp.monto_neto,
      clasificacion: comp.clasificacion, concepto: comp.concepto || '',
      archivo: comp.archivo,
    },
    proveedor: {
      nombre: comp.emisor.nombre || '', cuit: comp.emisor.cuit || '',
      campo: campoProveedorDe(comp.emisor.nombre, comp.emisor.cuit),
    },
    fecha: comp.fecha || '', vencimiento: vto,
    moneda: comp.moneda || 'ARS',
    monto, pagado, saldo,
    estado, dias_mora: diasMora, dias_para_vencer: diasParaVencer,
    cobertura: coberturaDe(db, userId, comp.id, abiertas),
  };
}

function todasLasObligaciones(db, userId, hoy) {
  ensureSchema(db);
  const { comprobantes: comps } = comprobantes.listComprobantes(db, userId, { limit: 500 });
  const abiertas = ordenesAbiertas(db, userId);
  return comps
    .filter((c) => c.direccion === 'recibida' && c.estado_lectura === 'leido' && !c.duplicado_de && !TIPOS_NO_OBLIGAN.includes(c.tipo))
    .map((c) => obligacionDe(db, userId, c, hoy, abiertas));
}

function listObligaciones(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  let out = todasLasObligaciones(db, userId, hoy);
  if (o.con_saldo) out = out.filter((x) => x.saldo !== null && x.saldo > 0);
  if (o.estado) out = out.filter((x) => x.estado === String(o.estado));
  if (o.proveedor_cuit) out = out.filter((x) => soloDigitos(x.proveedor.cuit) === soloDigitos(o.proveedor_cuit));
  if (o.proveedor) {
    const q = normTexto(o.proveedor).toLowerCase();
    out = out.filter((x) => (x.proveedor.nombre || '').toLowerCase().includes(q));
  }
  // Primero lo que duele: vencidas por mora, después por vencer.
  out.sort((a, b) => (b.dias_mora || 0) - (a.dias_mora || 0)
    || String(a.vencimiento || '9999').localeCompare(String(b.vencimiento || '9999'))
    || a.comprobante_id - b.comprobante_id);
  const total = out.length;
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { obligaciones: out.slice(off, off + lim), total, hoy };
}

// ---------------------------------------------------------------------------
// LA FICHA VIVA — enriquecimiento desde los papeles y los pagos.
// Solo se refrescan las claves OBSERVADAS; lo que el dueño cargó
// (contacto, condiciones, días de pago declarados) no se toca. Si
// nada cambió, no se escribe (el registro no se llena de ruido).
// ---------------------------------------------------------------------------

function moda(nums) {
  if (!nums.length) return null;
  const conteo = new Map();
  for (const n of nums) conteo.set(n, (conteo.get(n) || 0) + 1);
  let mejor = null;
  let mejorN = -1;
  for (const [v, n] of conteo) {
    if (n > mejorN || (n === mejorN && (mejor === null || v < mejor))) { mejor = v; mejorN = n; }
  }
  return mejor;
}

function statsProveedores(db, userId) {
  ensureSchema(db);
  const { comprobantes: comps } = comprobantes.listComprobantes(db, userId, { limit: 500 });
  const stats = new Map();
  for (const c of comps) {
    if (c.direccion !== 'recibida' || c.estado_lectura !== 'leido' || c.duplicado_de) continue;
    if (!c.emisor.nombre && !c.emisor.cuit) continue;
    const campo = campoProveedorDe(c.emisor.nombre, c.emisor.cuit);
    if (!stats.has(campo)) {
      stats.set(campo, {
        campo, nombre: c.emisor.nombre || '', cuit: c.emisor.cuit || '',
        recibidos: [], plazos: [], ultimo_id: 0, ultimo_monto: null, moneda: '',
      });
    }
    const s = stats.get(campo);
    s.recibidos.push(c);
    if (Number(c.id) > s.ultimo_id) {
      s.ultimo_id = Number(c.id);
      s.ultimo_monto = montoDeComprobante(c);
      s.moneda = c.moneda || s.moneda;
    }
    const plazo = diffDias(c.fecha, c.vencimiento);
    if (plazo !== null && plazo >= 0 && plazo <= 365) s.plazos.push(plazo);
  }
  // Días de pago OBSERVADOS: los días de semana en que el dueño
  // efectivamente pagó a cada proveedor (de los asientos de pago).
  const pagos = db.prepare(`SELECT p.fecha, o.proveedor_campo FROM gesty_pagos p
    JOIN gesty_ordenes_pago o ON o.id = p.orden_id
    WHERE p.user_id = ? AND o.tipo = 'proveedor' AND o.proveedor_campo != ''`).all(userId);
  const diasPorCampo = new Map();
  for (const p of pagos) {
    if (!esFechaISO(p.fecha)) continue;
    if (!diasPorCampo.has(p.proveedor_campo)) diasPorCampo.set(p.proveedor_campo, new Map());
    const m = diasPorCampo.get(p.proveedor_campo);
    const d = diaSemana(p.fecha);
    m.set(d, (m.get(d) || 0) + 1);
  }
  for (const s of stats.values()) {
    const m = diasPorCampo.get(s.campo);
    s.dias_pago_observados = m
      ? [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([d]) => d)
      : [];
    s.plazo_habitual = moda(s.plazos);
  }
  return stats;
}

const CLAVES_OBSERVADAS = ['ultimo_comprobante', 'ultimo_monto', 'moneda', 'comprobantes_recibidos', 'plazo_dias_habitual', 'dias_pago_observados'];
function enriquecerFichas(db, userId) {
  ensureSchema(db);
  const stats = statsProveedores(db, userId);
  const actuales = new Map(gesty.getData(db, userId, { grupo: GRUPO_PROVEEDORES }).map((d) => [d.campo, d]));
  let tocadas = 0;
  for (const s of stats.values()) {
    const observado = {
      ultimo_comprobante: s.ultimo_id,
      ultimo_monto: s.ultimo_monto,
      moneda: s.moneda || '',
      comprobantes_recibidos: s.recibidos.length,
      plazo_dias_habitual: s.plazo_habitual,
      dias_pago_observados: s.dias_pago_observados,
    };
    const prev = actuales.get(s.campo);
    const base = prev && prev.valor && typeof prev.valor === 'object' ? prev.valor : null;
    if (base && CLAVES_OBSERVADAS.every((k) => JSON.stringify(base[k] === undefined ? null : base[k]) === JSON.stringify(observado[k] === undefined ? null : observado[k]))) {
      continue; // nada cambió: ni escritura ni evento
    }
    const valor = {
      ...(base || {}),
      nombre: (base && base.nombre) || s.nombre,
      cuit: (base && base.cuit) || s.cuit,
      ...observado,
    };
    try {
      gesty.setData(db, userId, {
        grupo: GRUPO_PROVEEDORES, campo: s.campo, valor,
        origen: 'comprobante', origen_ref: String(s.ultimo_id), cargado_por: 'gesty',
      });
      tocadas++;
    } catch (e) { /* la fundación manda: si rechaza, la ficha queda como estaba */ }
  }
  return tocadas;
}

// Los proveedores vivos: la ficha del fundamento + sus números
// (obligado / pagado / saldo / vencidas) calculados al momento.
function listProveedores(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  enriquecerFichas(db, userId);
  const obligaciones = todasLasObligaciones(db, userId, hoy);
  const porCampo = new Map();
  for (const ob of obligaciones) {
    const k = ob.proveedor.campo;
    if (!porCampo.has(k)) porCampo.set(k, { obligado: 0, pagado: 0, saldo: 0, vencidas: 0, obligaciones: 0 });
    const a = porCampo.get(k);
    a.obligaciones++;
    if (ob.monto !== null) a.obligado = round2(a.obligado + ob.monto);
    a.pagado = round2(a.pagado + (ob.pagado || 0));
    if (ob.saldo !== null && ob.saldo > 0) a.saldo = round2(a.saldo + ob.saldo);
    if (ob.estado === 'vencida') a.vencidas++;
  }
  const datos = gesty.getData(db, userId, { grupo: GRUPO_PROVEEDORES });
  const proveedores = datos.map((d) => {
    const v = d.valor && typeof d.valor === 'object' ? d.valor : {};
    const a = porCampo.get(d.campo) || { obligado: 0, pagado: 0, saldo: 0, vencidas: 0, obligaciones: 0 };
    return {
      campo: d.campo, dato_id: d.id,
      nombre: v.nombre || '', cuit: v.cuit || '',
      ficha: v, confirmado_por_dueno: !!d.confirmado_por_dueno,
      numeros: a,
    };
  });
  // Un proveedor con papeles pero sin ficha (no debería pasar:
  // G-03 la propone al ingresar) igual aparece, con su ficha vacía.
  for (const [campo, a] of porCampo) {
    if (!proveedores.some((p) => p.campo === campo)) {
      const ob = obligaciones.find((x) => x.proveedor.campo === campo);
      proveedores.push({
        campo, dato_id: null,
        nombre: ob ? ob.proveedor.nombre : '', cuit: ob ? ob.proveedor.cuit : '',
        ficha: {}, confirmado_por_dueno: false, numeros: a,
      });
    }
  }
  proveedores.sort((x, y) => (y.numeros.saldo || 0) - (x.numeros.saldo || 0) || String(x.nombre).localeCompare(String(y.nombre)));
  return { proveedores, total: proveedores.length, hoy };
}

function fichaProveedor(db, userId, campo) {
  const d = gesty.getData(db, userId, { grupo: GRUPO_PROVEEDORES }).find((x) => x.campo === campo);
  return d ? { dato: d, ficha: d.valor && typeof d.valor === 'object' ? d.valor : {} } : { dato: null, ficha: {} };
}

// La fecha propuesta de una orden: el vencimiento más próximo que
// cubre; si la ficha declara días de pago (o ya se observaron),
// se corre al próximo día de pago en o después de esa fecha.
function fechaPropuestaPara(db, userId, campo, comps, hoy) {
  let base = hoy;
  const vtos = (comps || []).map((c) => c.vencimiento).filter((v) => esFechaISO(v)).sort();
  if (vtos.length) base = vtos[0];
  if (esFechaISO(base) && base < hoy) base = hoy; // vencida: se propone pagar ya, no en el pasado
  const { ficha } = fichaProveedor(db, userId, campo);
  let dias = Array.isArray(ficha.dias_pago) ? ficha.dias_pago.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  if (!dias.length && Array.isArray(ficha.dias_pago_observados) && ficha.dias_pago_observados.length) {
    dias = [Number(ficha.dias_pago_observados[0])];
  }
  if (dias.length && esFechaISO(base)) {
    for (let i = 0; i < 7; i++) {
      const cand = sumarDias(base, i);
      if (dias.includes(diaSemana(cand))) return cand;
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// Entidad orden de pago — lectura
// ---------------------------------------------------------------------------

function parseOrdenRow(db, userId, r) {
  if (!r) return null;
  const pagos = pagosDeOrden(db, userId, r.id);
  const pagado = round2(pagos.reduce((s, p) => s + (p.monto || 0), 0));
  const compIds = safeJson(r.comprobantes, []);
  const comprobantesDetalle = compIds.map((id) => {
    const c = comprobantes.getComprobante(db, userId, Number(id));
    if (!c) return null;
    const pagadoComp = pagadoDeComprobante(db, userId, c.id);
    const monto = montoDeComprobante(c);
    return {
      id: c.id, tipo: c.tipo, numero: c.numero, fecha: c.fecha, vencimiento: c.vencimiento,
      moneda: c.moneda, monto, pagado: pagadoComp,
      saldo: monto === null ? null : round2(monto - pagadoComp),
      emisor: c.emisor, archivo: c.archivo,
    };
  }).filter(Boolean);
  let tarjeta = null;
  if (r.tarjeta_id) {
    const card = gesty.getCard(db, userId, r.tarjeta_id);
    if (card) tarjeta = { id: card.id, estado: card.estado, version_documento: card.version_documento };
  }
  return {
    id: r.id, tipo: r.tipo,
    proveedor: r.tipo === 'proveedor'
      ? { nombre: r.proveedor_nombre, cuit: r.proveedor_cuit, campo: r.proveedor_campo }
      : null,
    referencia: r.tipo === 'liquidacion-externa' ? r.referencia_opaca : '',
    monto_total: r.monto_total, moneda: r.moneda,
    fecha_propuesta: r.fecha_propuesta,
    estado: r.estado,
    tarjeta_id: r.tarjeta_id || null, tarjeta,
    comprobantes: comprobantesDetalle,
    pagos, pagado, saldo: round2((r.monto_total || 0) - pagado),
    creado_por: r.creado_por, creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function filaOrden(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_ordenes_pago WHERE id = ?').get(Number(id));
  if (!r || r.user_id !== userId) fail('Esa orden de pago no es de esta cuenta.');
  return r;
}
function getOrden(db, userId, id) {
  ensureSchema(db);
  sincronizarEstados(db, userId, Number(id));
  const r = db.prepare('SELECT * FROM gesty_ordenes_pago WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parseOrdenRow(db, userId, r) : null;
}

// Reconciliación de estados con la bandeja: si el dueño frenó la
// tarjeta de una orden que esperaba, la orden vuelve a borrador
// (su historia lo asienta; la tarjeta guarda el acto del dueño).
function sincronizarEstados(db, userId, ordenId) {
  ensureSchema(db);
  const rows = ordenId
    ? db.prepare(`SELECT * FROM gesty_ordenes_pago WHERE user_id = ? AND id = ? AND estado = 'esperando-ok'`).all(userId, Number(ordenId))
    : db.prepare(`SELECT * FROM gesty_ordenes_pago WHERE user_id = ? AND estado = 'esperando-ok'`).all(userId);
  let vueltas = 0;
  for (const fila of rows) {
    if (!fila.tarjeta_id) continue;
    const card = gesty.getCard(db, userId, fila.tarjeta_id);
    if (card && card.estado === 'frenada') {
      db.prepare(`UPDATE gesty_ordenes_pago SET estado = 'borrador', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'orden-pago', entidad_id: String(fila.id),
        tipo_evento: 'orden-pago-vuelta-a-borrador',
        resumen: 'La tarjeta de esta orden se frenó: la orden volvió a borrador y se puede volver a pedir el OK.',
        payload: { tarjeta_id: fila.tarjeta_id },
      });
      vueltas++;
    }
  }
  return vueltas;
}

// ---------------------------------------------------------------------------
// Preparar la orden (Gesty la arma; el dueño la aprueba)
// ---------------------------------------------------------------------------

function crearOrden(db, userId, fila) {
  const info = db.prepare(`INSERT INTO gesty_ordenes_pago (user_id, tipo, proveedor_campo, proveedor_nombre, proveedor_cuit,
    referencia_opaca, monto_total, moneda, fecha_propuesta, estado, comprobantes, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,'borrador',?,?)`)
    .run(userId, fila.tipo, fila.proveedor_campo || '', fila.proveedor_nombre || '', fila.proveedor_cuit || '',
      fila.referencia_opaca || '', fila.monto_total, fila.moneda || 'ARS', fila.fecha_propuesta || '',
      JSON.stringify(fila.comprobantes || []), fila.creado_por || 'gesty');
  return Number(info.lastInsertRowid);
}

function prepararOrden(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const hoy = hoyISO();
  const creadoPor = normTexto(d.creado_por || 'gesty');
  const idsCrudos = Array.isArray(d.comprobante_ids) ? [...new Set(d.comprobante_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];

  if (idsCrudos.length) {
    const comps = idsCrudos.map((id) => {
      const c = comprobantes.getComprobante(db, userId, id);
      if (!c) fail(`El comprobante #${id} no es de esta cuenta.`);
      return c;
    });
    for (const c of comps) {
      if (c.direccion !== 'recibida' || c.estado_lectura !== 'leido') {
        fail(`El comprobante #${c.id} todavía no es una obligación leída (dirección ${c.direccion || '—'}, lectura ${c.estado_lectura}).`);
      }
    }
    const campos = new Set(comps.map((c) => campoProveedorDe(c.emisor.nombre, c.emisor.cuit)));
    if (campos.size > 1) fail('La orden cubre comprobantes de más de un proveedor: se prepara una orden por proveedor.');
    const campo = [...campos][0];
    const primero = comps[0];
    const saldos = comps.map((c) => {
      const monto = montoDeComprobante(c);
      return monto === null ? null : round2(monto - pagadoDeComprobante(db, userId, c.id));
    });
    if (saldos.some((s) => s === null)) fail('Uno de los comprobantes no tiene monto leído: no se prepara una orden sobre un número que falta.');
    const sumaSaldos = round2(saldos.reduce((s, x) => s + x, 0));
    if (sumaSaldos <= 0) fail('Esos comprobantes ya están saldados: no queda orden para preparar.');
    let monto = d.monto === undefined || d.monto === null ? sumaSaldos : round2(Number(d.monto));
    if (!Number.isFinite(monto) || monto <= 0) fail('El monto de la orden tiene que ser mayor a cero.');
    if (monto > sumaSaldos + 0.004) fail(`El monto (${fmtMonto(monto)}) supera el saldo de los comprobantes que cubre (${fmtMonto(sumaSaldos)}).`);
    const fechaPropuesta = esFechaISO(d.fecha_propuesta) ? String(d.fecha_propuesta) : fechaPropuestaPara(db, userId, campo, comps, hoy);
    const id = crearOrden(db, userId, {
      tipo: 'proveedor', proveedor_campo: campo,
      proveedor_nombre: primero.emisor.nombre || '', proveedor_cuit: primero.emisor.cuit || '',
      monto_total: monto, moneda: normTexto(d.moneda || primero.moneda || 'ARS') || 'ARS',
      fecha_propuesta: fechaPropuesta, comprobantes: idsCrudos, creado_por: creadoPor,
    });
    gesty.recordEvent(db, userId, {
      actor: creadoPor === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'orden-pago', entidad_id: String(id),
      tipo_evento: 'orden-pago-creada',
      resumen: `Orden de pago preparada para ${primero.emisor.nombre || primero.emisor.cuit} por ${normTexto(d.moneda || primero.moneda || 'ARS')} ${fmtMonto(monto)} (cubre ${idsCrudos.length} comprobante(s), pago propuesto el ${fmtFecha(fechaPropuesta)})`,
      payload: { tipo: 'proveedor', comprobantes: idsCrudos, monto, fecha_propuesta: fechaPropuesta },
    });
    return getOrden(db, userId, id);
  }

  // Compromiso sin papel todavía (p. ej. un alquiler acordado): el
  // dueño lo declara con proveedor, monto y fecha — Gesty no lo
  // inventa, lo registra como compromiso suyo.
  const nombre = normTexto(d.proveedor_nombre || (d.proveedor && d.proveedor.nombre));
  const cuit = soloDigitos(d.proveedor_cuit || (d.proveedor && d.proveedor.cuit));
  const monto = round2(Number(d.monto));
  if (!nombre && !cuit) fail('Sin comprobantes, la orden necesita el proveedor (nombre o CUIT) declarado por el dueño.');
  if (!Number.isFinite(monto) || monto <= 0) fail('Sin comprobantes, la orden necesita su monto declarado por el dueño.');
  if (!esFechaISO(d.fecha_propuesta)) fail('Sin comprobantes, la orden necesita su fecha propuesta (AAAA-MM-DD).');
  const campo = campoProveedorDe(nombre, cuit);
  const id = crearOrden(db, userId, {
    tipo: 'proveedor', proveedor_campo: campo, proveedor_nombre: nombre, proveedor_cuit: cuit,
    monto_total: monto, moneda: normTexto(d.moneda || 'ARS') || 'ARS',
    fecha_propuesta: String(d.fecha_propuesta), comprobantes: [], creado_por: creadoPor,
  });
  gesty.recordEvent(db, userId, {
    actor: creadoPor === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'orden-pago', entidad_id: String(id),
    tipo_evento: 'orden-pago-creada',
    resumen: `Orden de pago preparada para ${nombre || cuit} por ${normTexto(d.moneda || 'ARS')} ${fmtMonto(monto)} (compromiso sin comprobante, pago propuesto el ${fmtFecha(String(d.fecha_propuesta))})`,
    payload: { tipo: 'proveedor', comprobantes: [], monto, fecha_propuesta: String(d.fecha_propuesta), sin_comprobante: true },
  });
  return getOrden(db, userId, id);
}

// ---------------------------------------------------------------------------
// INTERFAZ TALENTY → GESTY (doble control, §11): la liquidación se
// prepara AFUERA; acá entra SOLO monto + fecha (+ referencia
// opaca). Lista blanca estricta: cualquier campo de más rechaza
// la recepción — los legajos son la caja fuerte de Talenty y esta
// puerta no los deja pasar ni por error.
// ---------------------------------------------------------------------------

function recibirLiquidacionExterna(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  if (typeof d !== 'object' || Array.isArray(d)) fail('La liquidación externa llega como un objeto con monto y fecha.');
  for (const k of Object.keys(d)) {
    const clave = String(k).toLowerCase();
    const v = d[k];
    if (v !== null && typeof v === 'object') {
      fail(`La interfaz de liquidaciones no acepta objetos anidados («${k}»): solo monto, fecha, moneda y referencia. El detalle de personas no sale de Talenty.`);
    }
    if (!CAMPOS_LIQUIDACION.includes(clave)) {
      fail(`La interfaz de liquidaciones solo acepta ${CAMPOS_LIQUIDACION.join(', ')}: vino un campo de más («${k}»). A Gesty solo le llegan monto y fecha — ningún dato de personas.`);
    }
  }
  const monto = round2(Number(d.monto));
  if (!Number.isFinite(monto) || monto <= 0) fail('La liquidación externa necesita su monto (mayor a cero).');
  if (!esFechaISO(d.fecha)) fail('La liquidación externa necesita su fecha de pago (AAAA-MM-DD).');
  const referencia = normTexto(d.referencia || '');
  if (referencia.length > 80) fail('La referencia de la liquidación es opaca y corta (máximo 80 caracteres): no es un lugar para detalle.');
  if (/\d{11}/.test(soloDigitos(referencia)) || /dni|cuil|legajo|sueldo|salario/i.test(referencia)) {
    fail('Esa referencia parece contener un dato de personas: la referencia es opaca (un código), nunca un documento ni un detalle de legajo.');
  }
  const id = crearOrden(db, userId, {
    tipo: 'liquidacion-externa', referencia_opaca: referencia,
    monto_total: monto, moneda: normTexto(d.moneda || 'ARS') || 'ARS',
    fecha_propuesta: String(d.fecha), comprobantes: [], creado_por: 'talenty',
  });
  gesty.recordEvent(db, userId, {
    actor: 'talenty', entidad_tipo: 'orden-pago', entidad_id: String(id),
    tipo_evento: 'liquidacion-recibida',
    resumen: `Liquidación recibida por la interfaz (doble control): ${normTexto(d.moneda || 'ARS')} ${fmtMonto(monto)} para pagar el ${fmtFecha(String(d.fecha))}${referencia ? ` · ref. ${referencia}` : ''}. Gesty prepara el pago; el detalle queda en Talenty.`,
    payload: { tipo: 'liquidacion-externa', monto, fecha: String(d.fecha), referencia },
  });
  return getOrden(db, userId, id);
}

// ---------------------------------------------------------------------------
// La tarjeta «pago-proveedor»: el documento completo que el dueño
// aprueba. Lo que lee es lo que se compromete.
// ---------------------------------------------------------------------------

function detalleTarjeta(db, userId, fila) {
  const detalle = {
    orden_id: fila.id, tipo_orden: fila.tipo,
    monto_total: fila.monto_total, moneda: fila.moneda, fecha_propuesta: fila.fecha_propuesta,
  };
  if (fila.tipo === 'proveedor') {
    const { dato } = fichaProveedor(db, userId, fila.proveedor_campo);
    detalle.proveedor = { nombre: fila.proveedor_nombre, cuit: fila.proveedor_cuit, campo: fila.proveedor_campo };
    detalle.usa_ficha = dato ? dato.id : null;
    const ids = safeJson(fila.comprobantes, []);
    detalle.comprobantes = ids.map((id) => {
      const c = comprobantes.getComprobante(db, userId, Number(id));
      if (!c) return null;
      const monto = montoDeComprobante(c);
      const pagado = pagadoDeComprobante(db, userId, c.id);
      return {
        id: c.id, tipo: c.tipo, numero: c.numero, fecha: c.fecha, vencimiento: c.vencimiento,
        monto, pagado, saldo: monto === null ? null : round2(monto - pagado),
      };
    }).filter(Boolean);
    detalle.saldo_cubierto = round2(detalle.comprobantes.reduce((s, c) => s + (c.saldo || 0), 0));
  } else {
    detalle.referencia = fila.referencia_opaca || '';
    detalle.origen = 'Liquidación preparada por Talenty (interfaz de doble control): Gesty recibe solo monto y fecha.';
  }
  return detalle;
}
function tituloTarjeta(fila) {
  if (fila.tipo === 'liquidacion-externa') {
    return `Pago de liquidación · ${fila.moneda} ${fmtMonto(fila.monto_total)} · ${fmtFecha(fila.fecha_propuesta)}`;
  }
  return `Pago a ${fila.proveedor_nombre || fila.proveedor_cuit} · ${fila.moneda} ${fmtMonto(fila.monto_total)}`;
}
function usaDatosDe(db, userId, fila) {
  if (fila.tipo !== 'proveedor') return [];
  const { dato } = fichaProveedor(db, userId, fila.proveedor_campo);
  return dato ? [dato.id] : [];
}

function pedirOKOrden(db, userId, ordenId) {
  ensureSchema(db);
  sincronizarEstados(db, userId, Number(ordenId));
  const fila = filaOrden(db, userId, ordenId);
  if (fila.estado === 'aprobada' || fila.estado === 'pagada-parcial') fail('Esta orden ya está aprobada: queda registrar el pago con su comprobante.');
  if (fila.estado === 'pagada') fail('Esta orden ya está pagada.');
  if (fila.estado === 'anulada') fail('Esta orden está anulada.');
  const detalle = detalleTarjeta(db, userId, fila);
  if (fila.tipo === 'proveedor' && safeJson(fila.comprobantes, []).length && (detalle.saldo_cubierto || 0) <= 0) {
    fail('Los comprobantes que cubre esta orden ya están saldados: no queda pago para aprobar.');
  }
  let tarjeta = null;
  const previa = fila.tarjeta_id ? gesty.getCard(db, userId, fila.tarjeta_id) : null;
  if (previa && previa.estado === 'esperando') fail('Esta orden ya tiene su tarjeta esperando tu OK.');
  if (previa && previa.estado === 'devuelta') {
    // La tarjeta volvió (la ejecución falló): se regenera la misma
    // con los números actuales, como en G-04/G-05. La orden sigue
    // en esperando-ok: regenerar no la mueve de estado.
    tarjeta = gesty.editCard(db, userId, previa.id, {
      detalle, titulo: tituloTarjeta(fila), monto: fila.monto_total, actor: 'gesty',
    });
    db.prepare(`UPDATE gesty_ordenes_pago SET estado = 'esperando-ok', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'orden-pago', entidad_id: String(fila.id),
      tipo_evento: 'orden-pago-tarjeta-regenerada',
      resumen: 'La tarjeta de esta orden se regeneró con los números actuales y vuelve a esperar tu OK.',
      payload: { tarjeta_id: tarjeta.id },
    });
    return getOrden(db, userId, fila.id);
  }
  if (fila.estado === 'esperando-ok') fail('Esta orden ya tiene su tarjeta esperando tu OK.');
  {
    tarjeta = gesty.createCard(db, userId, {
      tipo: 'pago-proveedor',
      titulo: tituloTarjeta(fila),
      detalle,
      // Como en G-04/G-05: la tarjeta NO hereda el vencimiento de
      // la obligación — una factura vencida es justamente la que
      // hay que pagar; si la tarjeta naciera vencida, no se podría
      // aprobar nunca.
      monto: fila.monto_total, moneda: fila.moneda, vence: '',
      usa_datos: usaDatosDe(db, userId, fila), creado_por: 'gesty',
    });
  }
  db.prepare(`UPDATE gesty_ordenes_pago SET tarjeta_id = ?, estado = 'esperando-ok', updated_at = datetime('now') WHERE id = ?`)
    .run(tarjeta.id, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'orden-pago', entidad_id: String(fila.id),
    tipo_evento: 'orden-pago-esperando-ok',
    resumen: `Orden de pago lista para tu OK: ${tituloTarjeta(fila)} (pago propuesto el ${fmtFecha(fila.fecha_propuesta)})`,
    payload: { tarjeta_id: tarjeta.id, monto: fila.monto_total, tipo: fila.tipo },
  });
  return getOrden(db, userId, fila.id);
}

// ---------------------------------------------------------------------------
// EL EJECUTOR de la matriz (tipo `pago-proveedor`): lo invoca
// approveCard tras validar la aprobación en el servidor. Sella la
// orden como APROBADA — comprometer el pago es el acto del dueño;
// el pago en sí lo hace él en su banco y acá solo se asienta
// cuando vuelve el comprobante. Nunca devuelve un «pagado».
// ---------------------------------------------------------------------------

function ejecutarPagoProveedor(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  const fila = d.orden_id
    ? db.prepare('SELECT * FROM gesty_ordenes_pago WHERE id = ? AND user_id = ?').get(Number(d.orden_id), userId)
    : null;
  if (!fila) return { ok: false, motivo: 'La orden de pago de esta tarjeta ya no existe.' };
  if (Number(fila.tarjeta_id) !== Number(card.id)) {
    return { ok: false, motivo: 'Hay una tarjeta más nueva para esta orden: se aprueba la vigente.' };
  }
  if (fila.estado !== 'esperando-ok') {
    return { ok: false, motivo: `La orden ya no está esperando aprobación (está ${fila.estado}).` };
  }
  if (round2(Number(d.monto_total)) !== round2(fila.monto_total)) {
    return { ok: false, motivo: 'El monto cambió desde que se preparó la orden: la tarjeta se regenera con el número actual.' };
  }
  if (fila.tipo === 'proveedor' && safeJson(fila.comprobantes, []).length) {
    const saldoActual = round2(safeJson(fila.comprobantes, []).reduce((s, id) => {
      const c = comprobantes.getComprobante(db, userId, Number(id));
      if (!c) return s;
      const monto = montoDeComprobante(c);
      return s + (monto === null ? 0 : round2(monto - pagadoDeComprobante(db, userId, c.id)));
    }, 0));
    if (saldoActual !== round2(Number(d.saldo_cubierto))) {
      return { ok: false, motivo: 'Los saldos de los comprobantes cambiaron desde que se preparó la orden: la tarjeta se regenera con los números actuales.' };
    }
  }
  db.prepare(`UPDATE gesty_ordenes_pago SET estado = 'aprobada', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
  return {
    ok: true,
    evento: 'orden-pago-aprobada', entidad_tipo: 'orden-pago', entidad_id: String(fila.id),
    resumen: `Orden de pago APROBADA: ${tituloTarjeta(fila)}. El pago lo ejecuta el dueño en su banco/billetera; la orden se marca pagada cuando vuelva el comprobante.`,
    payload: { tarjeta_id: card.id, monto: fila.monto_total, tipo: fila.tipo },
  };
}
gesty.registerExecutor('pago-proveedor', ejecutarPagoProveedor);

// ---------------------------------------------------------------------------
// EL ASIENTO DEL PAGO — la ÚNICA vía por la que una orden pasa a
// pagada. Exige la orden aprobada y el comprobante de pago
// vinculado (un papel de la cuenta, que no sea la propia
// obligación y que no haya pagado ya otra orden). El monto sale
// del papel o de la declaración al vincular — nunca se inventa.
// ---------------------------------------------------------------------------

function registrarPagoOrden(db, userId, ordenId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const fila = filaOrden(db, userId, ordenId);
  if (!ESTADOS_PAGABLE.includes(fila.estado)) {
    fail(fila.estado === 'pagada'
      ? 'Esta orden ya está pagada.'
      : 'La orden todavía no está aprobada: sin el OK del dueño no se asienta ningún pago.');
  }
  const compPagoId = Number(d.comprobante_pago_id);
  if (!Number.isInteger(compPagoId) || compPagoId <= 0) {
    fail('Una orden solo pasa a pagada con su comprobante de pago vinculado: subilo por Comprobantes y volvé con su id. Sin papel, no hay pago.');
  }
  const compPago = comprobantes.getComprobante(db, userId, compPagoId);
  if (!compPago) fail('Ese comprobante de pago no es de esta cuenta.');
  const cubiertos = safeJson(fila.comprobantes, []).map(Number);
  if (cubiertos.includes(compPagoId)) {
    fail('El comprobante de la obligación no puede ser su propio comprobante de pago.');
  }
  const yaUsado = db.prepare('SELECT * FROM gesty_pagos WHERE user_id = ? AND comprobante_pago_id = ? LIMIT 1').get(userId, compPagoId);
  if (yaUsado) {
    fail(`Ese comprobante de pago ya está vinculado a la orden #${yaUsado.orden_id}: un papel paga una sola vez.`);
  }
  let monto = d.monto === undefined || d.monto === null ? montoDeComprobante(compPago) : round2(Number(d.monto));
  if (!Number.isFinite(monto) || monto === null || monto <= 0) {
    fail('El comprobante de pago no trae un monto legible: indicá el monto del pago para asentarlo (no se inventa).');
  }
  monto = round2(monto);
  const pagadoPrevio = pagadoDeOrden(db, fila.id);
  if (round2(pagadoPrevio + monto) > round2(fila.monto_total) + 0.004) {
    fail(`Sobrepago: la orden es por ${fila.moneda} ${fmtMonto(fila.monto_total)}, ya se asentaron ${fmtMonto(pagadoPrevio)} y este pago es de ${fmtMonto(monto)}.`);
  }
  const fecha = esFechaISO(d.fecha) ? String(d.fecha) : (esFechaISO(compPago.fecha) ? String(compPago.fecha) : hoyISO());
  const medio = normTexto(d.medio || '');

  // La imputación del pago a las obligaciones que la orden cubre:
  // explícita a un comprobante, o en orden de vencimiento.
  const imputaciones = [];
  if (fila.tipo === 'proveedor' && cubiertos.length) {
    const saldos = cubiertos.map((id) => {
      const c = comprobantes.getComprobante(db, userId, id);
      const m = c ? montoDeComprobante(c) : null;
      return { id, vencimiento: c ? (c.vencimiento || '9999') : '9999', saldo: m === null ? 0 : round2(m - pagadoDeComprobante(db, userId, id)) };
    }).filter((x) => x.saldo > 0);
    let resto = monto;
    if (d.comprobante_id !== undefined && d.comprobante_id !== null) {
      const elegido = saldos.find((x) => x.id === Number(d.comprobante_id));
      if (!elegido) fail('Ese comprobante no está cubierto por esta orden (o ya está saldado).');
      if (round2(monto) > round2(elegido.saldo) + 0.004) {
        fail(`El pago (${fmtMonto(monto)}) supera el saldo de ese comprobante (${fmtMonto(elegido.saldo)}): imputalo a la orden sin elegir comprobante y se reparte por vencimiento.`);
      }
      imputaciones.push({ comprobante_id: elegido.id, monto });
      resto = 0;
    } else {
      saldos.sort((a, b) => String(a.vencimiento).localeCompare(String(b.vencimiento)) || a.id - b.id);
      for (const s of saldos) {
        if (resto <= 0.004) break;
        const parte = round2(Math.min(resto, s.saldo));
        if (parte > 0) { imputaciones.push({ comprobante_id: s.id, monto: parte }); resto = round2(resto - parte); }
      }
    }
    if (resto > 0.004) {
      fail(`El pago (${fmtMonto(monto)}) supera el saldo vivo de los comprobantes que cubre la orden (${fmtMonto(round2(monto - resto))}).`);
    }
  } else {
    imputaciones.push({ comprobante_id: null, monto });
  }

  const filasPago = imputaciones.map((imp) => {
    const info = db.prepare(`INSERT INTO gesty_pagos (user_id, orden_id, comprobante_id, comprobante_pago_id, monto, moneda, fecha, medio, creado_por)
      VALUES (?,?,?,?,?,?,?,?, 'dueno')`)
      .run(userId, fila.id, imp.comprobante_id, compPagoId, imp.monto, fila.moneda, fecha, medio);
    return {
      id: Number(info.lastInsertRowid), orden_id: fila.id, comprobante_id: imp.comprobante_id,
      comprobante_pago_id: compPagoId, monto: imp.monto, moneda: fila.moneda, fecha, medio,
    };
  });
  const pagadoNuevo = round2(pagadoPrevio + monto);
  const estadoNuevo = pagadoNuevo >= round2(fila.monto_total) - 0.004 ? 'pagada' : 'pagada-parcial';
  db.prepare(`UPDATE gesty_ordenes_pago SET estado = ?, updated_at = datetime('now') WHERE id = ?`).run(estadoNuevo, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'orden-pago', entidad_id: String(fila.id),
    tipo_evento: 'pago-registrado',
    resumen: `Pago asentado contra la orden #${fila.id} (${tituloTarjeta(fila)}): ${fila.moneda} ${fmtMonto(monto)} el ${fmtFecha(fecha)}, con su comprobante #${compPagoId} archivado. La orden queda ${estadoNuevo === 'pagada' ? 'PAGADA' : `pagada parcial (saldo ${fmtMonto(round2(fila.monto_total - pagadoNuevo))})`}.`,
    payload: {
      monto, fecha, comprobante_pago_id: compPagoId,
      comprobantes_imputados: imputaciones.map((i) => i.comprobante_id).filter((x) => x !== null),
      estado_orden: estadoNuevo,
    },
    comprobante_externo: `comprobante:${compPagoId}`,
  });
  if (estadoNuevo === 'pagada') {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'orden-pago', entidad_id: String(fila.id),
      tipo_evento: 'orden-pago-pagada',
      resumen: `Orden #${fila.id} PAGADA por completo (${fila.moneda} ${fmtMonto(fila.monto_total)}), con cada pago asentado contra su comprobante.`,
      payload: { monto_total: fila.monto_total },
    });
  }
  const orden = getOrden(db, userId, fila.id);
  return { orden, pagos: filasPago, pago: filasPago[0] || null };
}

function anularOrden(db, userId, ordenId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const fila = filaOrden(db, userId, ordenId);
  if (fila.estado === 'pagada' || fila.estado === 'pagada-parcial') {
    fail('Una orden con pagos asentados no se anula: el registro de pagos es la verdad y no se reescribe.');
  }
  if (fila.estado === 'anulada') fail('Esta orden ya está anulada.');
  const motivo = normTexto(d.motivo || '');
  db.prepare(`UPDATE gesty_ordenes_pago SET estado = 'anulada', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'orden-pago', entidad_id: String(fila.id),
    tipo_evento: 'orden-pago-anulada',
    resumen: `Orden de pago anulada por el dueño${motivo ? `: ${motivo}` : ''}. Si su tarjeta seguía esperando, la aprobación la rechaza (la orden ya no existe como compromiso).`,
    payload: { motivo, estado_previo: fila.estado },
  });
  return getOrden(db, userId, fila.id);
}

// ---------------------------------------------------------------------------
// EL VIGÍA — escaneo de obligaciones. Lo vencido o por vencer sin
// orden que lo cubra nace como orden preparada + su tarjeta.
// Nunca silencio.
// ---------------------------------------------------------------------------

function diasAvisoVigia(db, userId, opts) {
  if (opts && Number.isFinite(Number(opts.dias_aviso))) return Math.max(0, Math.trunc(Number(opts.dias_aviso)));
  const d = gesty.getData(db, userId, { grupo: GRUPO_REGLAS }).find((x) => x.campo === 'dias_aviso_pagos');
  const n = d ? Number(d.valor) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : DIAS_AVISO_DEFAULT;
}

function escanearObligaciones(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const diasAviso = diasAvisoVigia(db, userId, o);
  const resultado = {
    hoy, dias_aviso: diasAviso,
    fichas_enriquecidas: enriquecerFichas(db, userId),
    estados_sincronizados: sincronizarEstados(db, userId),
    revisadas: 0, vencidas: 0, por_vencer: 0, sin_vencimiento: 0,
    cubiertas: 0, saldadas: 0, ordenes_creadas: 0, tarjetas_creadas: 0,
  };
  const obligaciones = todasLasObligaciones(db, userId, hoy);
  for (const ob of obligaciones) {
    if (ob.saldo === null || ob.saldo <= 0) { resultado.saldadas++; continue; }
    resultado.revisadas++;
    if (!ob.vencimiento) { resultado.sin_vencimiento++; continue; }
    const esVencida = ob.estado === 'vencida';
    const esPorVencer = ob.estado === 'por-vencer' && ob.dias_para_vencer !== null && ob.dias_para_vencer <= diasAviso;
    if (!esVencida && !esPorVencer) continue;
    if (esVencida) resultado.vencidas++; else resultado.por_vencer++;
    if (ob.cobertura) { resultado.cubiertas++; continue; }
    const orden = prepararOrden(db, userId, { comprobante_ids: [ob.comprobante_id], creado_por: 'gesty' });
    resultado.ordenes_creadas++;
    pedirOKOrden(db, userId, orden.id);
    resultado.tarjetas_creadas++;
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'comprobante', entidad_id: String(ob.comprobante_id),
      tipo_evento: 'obligacion-vigia',
      resumen: `Vigía: la factura de ${ob.proveedor.nombre || ob.proveedor.cuit} ${ob.vencimiento ? (esVencida ? `venció el ${fmtFecha(ob.vencimiento)} (hace ${ob.dias_mora} día(s))` : `vence el ${fmtFecha(ob.vencimiento)}`) : ''} no tenía orden de pago: quedó preparada la orden #${orden.id} con su tarjeta en «Para tu OK».`,
      payload: { orden_id: orden.id, saldo: ob.saldo, vencimiento: ob.vencimiento, dias_mora: ob.dias_mora },
    });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Consulta de pagos por período — LA FUENTE del «pagos del
// período» del cierre (G-06 la consume; acá no se toca G-06).
// Cada fila es una imputación; los totales suman imputaciones
// (un pago repartido entre dos comprobantes suma una sola vez).
// ---------------------------------------------------------------------------

function pagosDelPeriodo(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const desde = esFechaISO(o.desde) ? String(o.desde) : '';
  const hasta = esFechaISO(o.hasta) ? String(o.hasta) : '';
  const rows = db.prepare(`SELECT p.*, o.tipo AS orden_tipo, o.proveedor_nombre, o.proveedor_cuit,
      o.proveedor_campo, o.referencia_opaca
    FROM gesty_pagos p JOIN gesty_ordenes_pago o ON o.id = p.orden_id
    WHERE p.user_id = ? ${desde ? 'AND p.fecha >= ?' : ''} ${hasta ? 'AND p.fecha <= ?' : ''}
    ORDER BY p.fecha ASC, p.id ASC`)
    .all(...[userId, ...(desde ? [desde] : []), ...(hasta ? [hasta] : [])]);
  const totales = {};
  const eventos = new Set();
  const pagos = rows.map((p) => {
    totales[p.moneda] = round2((totales[p.moneda] || 0) + p.monto);
    eventos.add(p.comprobante_pago_id);
    return {
      id: p.id, fecha: p.fecha, monto: p.monto, moneda: p.moneda, medio: p.medio || '',
      orden_id: p.orden_id, tipo_orden: p.orden_tipo,
      proveedor: p.orden_tipo === 'proveedor' ? { nombre: p.proveedor_nombre, cuit: p.proveedor_cuit, campo: p.proveedor_campo } : null,
      liquidacion_referencia: p.orden_tipo === 'liquidacion-externa' ? (p.referencia_opaca || '') : null,
      comprobante_obligacion_id: p.comprobante_id,
      comprobante_pago_id: p.comprobante_pago_id,
    };
  });
  return { pagos, totales, total_pagos: eventos.size, desde, hasta };
}

// ---------------------------------------------------------------------------
// Consultas: órdenes y resumen
// ---------------------------------------------------------------------------

function listOrdenes(db, userId, opts) {
  ensureSchema(db);
  sincronizarEstados(db, userId);
  const o = opts || {};
  const rows = db.prepare('SELECT * FROM gesty_ordenes_pago WHERE user_id = ? ORDER BY id DESC').all(userId);
  let out = rows.map((r) => parseOrdenRow(db, userId, r));
  if (o.estado) out = out.filter((x) => x.estado === String(o.estado));
  if (o.tipo) out = out.filter((x) => x.tipo === String(o.tipo));
  if (o.proveedor_cuit) out = out.filter((x) => x.proveedor && soloDigitos(x.proveedor.cuit) === soloDigitos(o.proveedor_cuit));
  const total = out.length;
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { ordenes: out.slice(off, off + lim), total };
}

function resumenProveedores(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const obligaciones = todasLasObligaciones(db, userId, hoy);
  const resumen = {
    hoy,
    obligaciones: { con_saldo: 0, vencidas: 0, por_vencer: 0, monto_vencido: 0, saldo_total: 0 },
    ordenes: { borrador: 0, 'esperando-ok': 0, aprobada: 0, 'pagada-parcial': 0, pagada: 0, anulada: 0 },
    proveedores_con_saldo: 0,
  };
  const camposConSaldo = new Set();
  for (const ob of obligaciones) {
    if (ob.saldo === null || ob.saldo <= 0) continue;
    resumen.obligaciones.con_saldo++;
    resumen.obligaciones.saldo_total = round2(resumen.obligaciones.saldo_total + ob.saldo);
    camposConSaldo.add(ob.proveedor.campo);
    if (ob.estado === 'vencida') {
      resumen.obligaciones.vencidas++;
      resumen.obligaciones.monto_vencido = round2(resumen.obligaciones.monto_vencido + ob.saldo);
    } else if (ob.estado === 'por-vencer') resumen.obligaciones.por_vencer++;
  }
  resumen.proveedores_con_saldo = camposConSaldo.size;
  const rows = db.prepare('SELECT estado, COUNT(*) AS n FROM gesty_ordenes_pago WHERE user_id = ? GROUP BY estado').all(userId);
  for (const r of rows) if (resumen.ordenes[r.estado] !== undefined) resumen.ordenes[r.estado] = r.n;
  const mes = hoy.slice(0, 7);
  resumen.pagos_mes = pagosDelPeriodo(db, userId, { desde: `${mes}-01`, hasta: `${mes}-31` });
  return resumen;
}

module.exports = {
  // constantes
  TIPOS_ORDEN, ESTADOS_ORDEN, CAMPOS_LIQUIDACION, DIAS_AVISO_DEFAULT,
  // esquema
  ensureSchema,
  // fichas vivas y proveedores
  enriquecerFichas, listProveedores, fichaProveedor,
  // obligaciones derivadas
  listObligaciones, todasLasObligaciones,
  // órdenes de pago
  prepararOrden, pedirOKOrden, getOrden, listOrdenes, anularOrden,
  // el asiento del pago (única vía a «pagada»)
  registrarPagoOrden, pagosDeOrden, pagadoDeOrden, pagadoDeComprobante,
  // interfaz Talenty (doble control)
  recibirLiquidacionExterna,
  // el vigía
  escanearObligaciones,
  // la fuente de pagos para el cierre G-06
  pagosDelPeriodo,
  // resumen
  resumenProveedores,
  // ejecutor de la matriz
  ejecutarPagoProveedor,
  // piezas internas, exportadas para tests y reuso
  campoProveedorDe, fechaPropuestaPara, sincronizarEstados,
};
