// =====================================================================
// GESTY · G-06 — REPORTES Y CIERRE MENSUAL (+ PRONÓSTICO DE CAJA)
// Spec: gesty-cola-builds.md G-06 (pasos 0–5) · gesty-areas-detalle.md
// §8 (Reportes: nada se aprueba, el dueño solo lee; el reporte no
// tiene fuentes propias — si un dato no está, marca el hueco) ·
// gesty-build-spec.md §13.2 (pronóstico de caja) ·
// gesty-experiencia-cliente.md §5 (la vara del contador: el primer
// cierre lo aprueba sin pedir reordenar nada).
//
// LA REGLA QUE GOBIERNA TODO EL MÓDULO: ningún número sin fuente.
// Cada total del cierre guarda su desglose (las entidades que lo
// suman) y cada línea del pronóstico cita su entidad y su fecha. Lo
// que no se puede saber NO se estima ni se completa: queda marcado
// como FALTANTE, con el dato que falta, en el propio cierre.
//
// Fuentes reales de hoy (y solo esas):
// · Ventas → las facturas de G-04 en estado lista-para-emitir /
//   enviada / cobrada (un borrador o una esperando-ok todavía no es
//   una venta; una anulada dejó de serlo).
// · Gastos → los comprobantes RECIBIDOS leídos de G-03, por
//   clasificación (devengado). Los duplicados no suman (el vivo es
//   el primero); los que están en revisión no entran — se declaran.
// · Cobros → los pagos registrados en las facturas de G-04, por la
//   fecha del pago (no por la fecha de la factura).
// · Impuestos → los discriminados en esas facturas (débito) y en
//   esos comprobantes (por concepto). Gesty NO liquida impuestos:
//   prepara todo para el contador (áreas §7/§8).
// · Pagos a proveedores → TODAVÍA NO EXISTE la entidad que los
//   registra (llega con G-07): el cierre lo declara faltante en vez
//   de disfrazar los gastos devengados de pagos.
//
// Pronóstico (§13.2): entra / sale / queda a 30 días SOLO desde
// registros reales — facturas a cobrar por su saldo y vencimiento
// (las vencidas entran el primer día de la ventana, marcadas), las
// cobranzas abiertas ordenan el «qué cobrar primero» (no duplican:
// son el mismo saldo de la misma factura), comprobantes de
// proveedores por su vencimiento, y vencimientos fiscales SOLO si
// están en el fundamento (grupo calendario-fiscal) con fecha y
// monto concretos: una regla tipo «día 20» sin monto se declara,
// nunca se convierte en un número. El saldo inicial de caja no
// está registrado en ningún lado: el «queda» es el neto acumulado
// de la ventana desde cero, y el pronóstico lo dice. Si algún día
// el acumulado queda negativo, el aviso trae la fecha exacta y el
// orden de cobranzas que lo corrige.
//
// Reportes no genera tarjetas ni aprueba nada (matriz: Reportes =
// solo lee). El cierre SÍ es una entidad durable: generarlo lo
// persiste con sus totales, su desglose por fuente y sus
// faltantes, y queda en el registro («cierre-generado»). Regenerar
// el mismo período crea una generación nueva — la historia no se
// reescribe — y la «fila del cierre» es siempre la última.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const facturacion = require('./gesty-facturacion');
const comprobantes = require('./gesty-comprobantes');
const cobranzas = require('./gesty-cobranzas');

// ---------------------------------------------------------------------------
// Utilidades (los patrones de la casa)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function diffDias(desdeISO, hastaISO) {
  if (!esFechaISO(desdeISO) || !esFechaISO(hastaISO)) return null;
  return Math.round((Date.parse(String(hastaISO).slice(0, 10)) - Date.parse(String(desdeISO).slice(0, 10))) / 86400000);
}
function addDias(iso, n) {
  const t = Date.parse(String(iso).slice(0, 10)) + Number(n) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function fmtMonto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// La moneda de un registro: la suya. Lo que no trae moneda leída NO
// se asume ARS — se agrupa aparte y se ve como lo que es.
function monedaKey(m) { return normTexto(m).toUpperCase() || 'SIN-MONEDA'; }
function sumar(map, moneda, monto) {
  const k = monedaKey(moneda);
  map[k] = round2((map[k] || 0) + (Number(monto) || 0));
  return map;
}
function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente) — el cierre como entidad durable
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  facturacion.ensureSchema(db);
  comprobantes.ensureSchema(db);
  cobranzas.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_cierres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    periodo TEXT NOT NULL DEFAULT '',
    desde TEXT NOT NULL DEFAULT '',
    hasta TEXT NOT NULL DEFAULT '',
    totales TEXT NOT NULL DEFAULT '{}',
    desglose TEXT NOT NULL DEFAULT '{}',
    faltantes TEXT NOT NULL DEFAULT '[]',
    generado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_cierres_user ON gesty_cierres(user_id, periodo, id);
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// Lectura paginada de las fuentes (los listados de G-03/G-04 tienen
// tope por página: el cierre recorre TODO, no una muestra)
// ---------------------------------------------------------------------------

function todasLasFacturas(db, userId) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const r = facturacion.listFacturas(db, userId, { limit: 1000, offset });
    out.push(...r.facturas);
    offset += r.facturas.length;
    if (!r.facturas.length || offset >= r.total) break;
  }
  return out;
}

function todosLosComprobantes(db, userId, filtros) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const r = comprobantes.listComprobantes(db, userId, { ...(filtros || {}), incluir_duplicados: true, limit: 500, offset });
    out.push(...r.comprobantes);
    offset += r.comprobantes.length;
    if (!r.comprobantes.length || offset >= r.total) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vencimientos fiscales del fundamento (grupo «calendario-fiscal»)
// Solo es un número real el dato ESTRUCTURADO {fecha, monto}: la
// regla «día 20» dice cuándo vence algo, pero no cuánto — y sin
// monto no hay salida que sumar. Las reglas se devuelven aparte
// para declararlas, jamás para calcular con ellas.
// ---------------------------------------------------------------------------

function vencimientosFiscalesFundamento(db, userId) {
  const datos = gesty.getData(db, userId, { grupo: 'calendario-fiscal' });
  const conMonto = [];
  const sinMonto = [];
  const comoItem = (d, o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const monto = Number(o.monto);
    const fecha = normTexto(o.fecha);
    if (!Number.isFinite(monto) || monto < 0 || !esFechaISO(fecha)) return null;
    return {
      concepto: normTexto(o.concepto) || d.campo, fecha, monto: round2(monto),
      moneda: monedaKey(o.moneda), fuente_campo: d.campo, dato_id: d.id,
    };
  };
  for (const d of datos) {
    const v = d.valor;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      const items = v.map((o) => comoItem(d, o));
      if (items.every(Boolean)) { conMonto.push(...items); continue; }
      sinMonto.push({ campo: d.campo, dato_id: d.id, valor: v });
      continue;
    }
    const it = comoItem(d, v);
    if (it) { conMonto.push(it); continue; }
    if (v !== null && v !== undefined && v !== '') sinMonto.push({ campo: d.campo, dato_id: d.id, valor: v });
  }
  return { conMonto, sinMonto };
}

// ===========================================================================
// PRONÓSTICO DE CAJA (§13.2) — entra / sale / queda, solo registros
// ===========================================================================

function pronosticoCaja(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const desde = esFechaISO(o.desde) ? String(o.desde) : hoyISO();
  const dias = Math.min(Math.max(Number(o.dias) || 30, 1), 92);
  const hasta = addDias(desde, dias - 1);
  const movimientos = [];
  const cobertura = [];

  // --- ENTRA: facturas a cobrar (saldo real, fecha = vencimiento) --
  const facturas = todasLasFacturas(db, userId);
  const aCobrar = facturas.filter((f) => (f.estado === 'lista-para-emitir' || f.estado === 'enviada') && f.saldo > 0);
  let nEntra = 0;
  for (const f of aCobrar) {
    const fechaReal = f.vencimiento || f.fecha;
    if (!esFechaISO(fechaReal)) continue;
    const vencida = fechaReal < desde;
    if (!vencida && fechaReal > hasta) continue;
    movimientos.push({
      fecha: vencida ? desde : fechaReal, fecha_original: fechaReal, vencida,
      tipo: 'entra', monto: f.saldo, moneda: monedaKey(f.moneda),
      concepto: `Cobro de la factura ${f.numero} — ${f.cliente.nombre || 'cliente'}`,
      fuente: { entidad: 'factura', id: f.id, detalle: `saldo de la factura ${f.numero} (${f.estado})` },
    });
    nEntra++;
  }
  cobertura.push({
    fuente: 'facturas-a-cobrar', estado: nEntra ? 'con-datos' : 'sin-datos',
    detalle: nEntra
      ? `${nEntra} factura(s) con saldo y vencimiento en la ventana (las vencidas entran el primer día).`
      : 'No hay facturas con saldo pendiente venciendo en la ventana.',
  });

  // --- Las cobranzas abiertas NO suman: ordenan. Son el mismo
  // saldo de las mismas facturas, empujado por Gesty. El orden
  // propuesto ataca primero lo que la cobranza ya está trabajando
  // (mayor mora primero) y después lo vencido más viejo.
  const resumenCob = cobranzas.resumenCobranzas(db, userId);
  const abiertas = cobranzas.listCobranzas(db, userId, { estado: 'abierta', limit: 1000 }).cobranzas;
  const cobPorFactura = new Map(abiertas.map((c) => [c.factura_id, c]));
  const orden = aCobrar
    .filter((f) => { const fr = f.vencimiento || f.fecha; return esFechaISO(fr) && fr <= hasta; })
    .map((f) => {
      const cob = cobPorFactura.get(f.id);
      const vto = f.vencimiento || f.fecha;
      const mora = diffDias(vto, desde);
      return {
        factura_id: f.id, numero: f.numero, cliente: (f.cliente && f.cliente.nombre) || '',
        saldo: f.saldo, moneda: monedaKey(f.moneda), vencimiento: vto,
        dias_mora: mora !== null && mora > 0 ? mora : 0,
        escalon: cob ? (cob.escalon || cob.escalon_actual || '') : '',
        motivo: cob
          ? `cobranza abierta${cob.escalon ? ` · escalón ${cob.escalon}` : ''}${mora > 0 ? ` · ${mora} día(s) de mora` : ''}`
          : (mora > 0 ? `vencida hace ${mora} día(s), sin cobranza abierta` : `vence el ${vto}`),
        _conCob: cob ? 0 : 1, _mora: mora || 0,
      };
    })
    .sort((a, b) => (a._conCob - b._conCob) || (b._mora - a._mora) || (b.saldo - a.saldo))
    .map(({ _conCob, _mora, ...resto }) => resto);
  cobertura.push({
    fuente: 'abonos-recurrentes', estado: 'sin-registro',
    detalle: 'No hay un registro de abonos recurrentes en el sistema: un abono cobrado entra al pronóstico cuando es una factura (ya está en facturas a cobrar). Nada se proyecta por fuera de un registro.',
  });

  // --- SALE: comprobantes de proveedores por su vencimiento -------
  // Sin G-07 no hay registro de pagos: un comprobante recibido
  // leído con vencimiento es, para los registros, una salida
  // comprometida. Los vinculados a un asiento no se cuentan (ya
  // tienen su registro) y los que están en revisión no son un
  // número confirmado: se cuentan aparte, no se suman.
  const comps = todosLosComprobantes(db, userId, {});
  let nSale = 0, sinConfirmar = 0;
  for (const c of comps) {
    if (c.direccion !== 'recibida' || c.duplicado_de) continue;
    if (c.estado_lectura !== 'leido') { if (esFechaISO(c.vencimiento) && c.vencimiento <= hasta) sinConfirmar++; continue; }
    if (c.asiento_vinculado) continue;
    const monto = c.monto_total !== null && c.monto_total !== undefined ? c.monto_total : c.monto_neto;
    if (monto === null || monto === undefined || !esFechaISO(c.vencimiento)) continue;
    const vencida = c.vencimiento < desde;
    if (!vencida && c.vencimiento > hasta) continue;
    movimientos.push({
      fecha: vencida ? desde : c.vencimiento, fecha_original: c.vencimiento, vencida,
      tipo: 'sale', monto: round2(monto), moneda: monedaKey(c.moneda),
      concepto: `Pago a ${c.emisor.nombre || 'proveedor'} — ${c.tipo} ${c.numero || ''}`.trim(),
      fuente: { entidad: 'comprobante', id: c.id, detalle: `comprobante recibido de ${c.emisor.nombre || 'proveedor'}` },
    });
    nSale++;
  }
  cobertura.push({
    fuente: 'comprobantes-proveedores', estado: nSale ? 'con-datos' : 'sin-datos',
    detalle: nSale
      ? `${nSale} comprobante(s) de proveedores con vencimiento en la ventana${sinConfirmar ? `; ${sinConfirmar} más están sin terminar de leer y NO entraron (no son un número confirmado)` : ''}.`
      : 'No hay comprobantes de proveedores con vencimiento en la ventana.',
  });

  // --- SALE: vencimientos fiscales SOLO con fecha y monto reales --
  const fiscales = vencimientosFiscalesFundamento(db, userId);
  let nFisc = 0;
  for (const it of fiscales.conMonto) {
    const vencida = it.fecha < desde;
    if (!vencida && it.fecha > hasta) continue;
    movimientos.push({
      fecha: vencida ? desde : it.fecha, fecha_original: it.fecha, vencida,
      tipo: 'sale', monto: it.monto, moneda: it.moneda,
      concepto: `Vencimiento fiscal — ${it.concepto}`,
      fuente: { entidad: 'fundamento', id: it.dato_id, detalle: `calendario fiscal del fundamento · ${it.fuente_campo}` },
    });
    nFisc++;
  }
  cobertura.push({
    fuente: 'vencimientos-fiscales',
    estado: nFisc ? 'con-datos' : (fiscales.sinMonto.length ? 'sin-monto' : 'sin-datos'),
    detalle: nFisc
      ? `${nFisc} vencimiento(s) fiscal(es) con fecha y monto registrados en el fundamento.`
      : (fiscales.sinMonto.length
        ? 'El fundamento registra vencimientos fiscales como reglas (ej. «día 20») SIN monto: se sabe que vencen, no cuánto — no entraron en el cálculo.'
        : 'No hay vencimientos fiscales registrados en el fundamento.'),
  });

  // --- Serie diaria por moneda: el «queda» es el neto acumulado ---
  // No existe un saldo inicial registrado en ningún registro: la
  // serie arranca en cero y el pronóstico lo declara. Inventar un
  // saldo de apertura sería el primer número falso del producto.
  movimientos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.tipo === b.tipo ? 0 : (a.tipo === 'entra' ? -1 : 1))));
  const porMoneda = {};
  for (const m of movimientos) {
    const k = m.moneda;
    porMoneda[k] = porMoneda[k] || { entra: 0, sale: 0, queda: 0, saldo_inicial: null, dias: [], primer_dia_negativo: null, minimo: null };
    if (m.tipo === 'entra') porMoneda[k].entra = round2(porMoneda[k].entra + m.monto);
    else porMoneda[k].sale = round2(porMoneda[k].sale + m.monto);
  }
  const avisos = [];
  for (const [moneda, agg] of Object.entries(porMoneda)) {
    let acum = 0;
    for (let d = 0; d < dias; d++) {
      const fecha = addDias(desde, d);
      let e = 0, s = 0;
      for (const m of movimientos) {
        if (m.moneda !== moneda || m.fecha !== fecha) continue;
        if (m.tipo === 'entra') e = round2(e + m.monto); else s = round2(s + m.monto);
      }
      acum = round2(acum + e - s);
      agg.dias.push({ fecha, entra: e, sale: s, acumulado: acum });
      if (agg.minimo === null || acum < agg.minimo.monto) agg.minimo = { fecha, monto: acum };
      if (acum < 0 && !agg.primer_dia_negativo) agg.primer_dia_negativo = fecha;
    }
    agg.queda = round2(agg.entra - agg.sale);
    if (agg.primer_dia_negativo) {
      const diaNeg = agg.dias.find((x) => x.fecha === agg.primer_dia_negativo);
      avisos.push({
        tipo: 'ventana-negativa', moneda, fecha: agg.primer_dia_negativo,
        queda_ese_dia: diaNeg ? diaNeg.acumulado : null,
        mensaje: `El ${agg.primer_dia_negativo} la caja de la ventana queda en ${moneda} ${fmtMonto(diaNeg ? diaNeg.acumulado : 0)}: salen más de lo que entra hasta ese día. El orden de cobranzas propuesto ataca primero los saldos que lo corrigen.`,
        orden_cobranzas_propuesto: orden.filter((x) => x.moneda === moneda),
      });
    }
  }
  cobertura.push({
    fuente: 'saldo-inicial', estado: 'sin-registro',
    detalle: 'No hay un saldo inicial de caja registrado: el «queda» es el neto acumulado de la ventana desde cero, no el saldo de una cuenta.',
  });

  return {
    desde, hasta, dias,
    movimientos,
    por_moneda: porMoneda,
    orden_cobranzas_propuesto: orden,
    resumen_cobranzas: {
      abiertas: resumenCob.abiertas, cerradas: resumenCob.cerradas,
      por_escalon: resumenCob.por_escalon, monto_vencido: resumenCob.monto_vencido,
    },
    cobertura, avisos,
    generado_en: new Date().toISOString(),
  };
}

// ===========================================================================
// CIERRE DEL PERÍODO — agregación con desglose y faltantes
// ===========================================================================

const ESTADOS_VENTA = ['lista-para-emitir', 'enviada', 'cobrada'];

function rangoPeriodo(periodo) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(periodo || ''));
  if (!m) fail('El período tiene que venir como AAAA-MM (ej. 2026-09).');
  const y = Number(m[1]); const mo = Number(m[2]);
  const desde = `${m[1]}-${m[2]}-01`;
  const hasta = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  return { desde, hasta };
}

function calcularCierre(db, userId, periodo) {
  const { desde, hasta } = rangoPeriodo(periodo);
  const enPeriodo = (f) => esFechaISO(f) && f >= desde && f <= hasta;
  const facturas = todasLasFacturas(db, userId);
  const comps = todosLosComprobantes(db, userId, {});

  // --- Ventas (G-04): solo las que ya son venta --------------------
  const ventasPorMoneda = {};
  const ventasIds = [];
  const excluidas = {};
  for (const f of facturas) {
    if (!enPeriodo(f.fecha)) continue;
    if (!ESTADOS_VENTA.includes(f.estado)) { excluidas[f.estado] = (excluidas[f.estado] || 0) + 1; continue; }
    const k = monedaKey(f.moneda);
    const v = ventasPorMoneda[k] || (ventasPorMoneda[k] = { cantidad: 0, neto: 0, iva: 0, otros_impuestos: [], total: 0 });
    v.cantidad++;
    v.neto = round2(v.neto + (Number(f.subtotal_neto) || 0));
    v.iva = round2(v.iva + (f.impuestos || []).reduce((a, l) => a + (Number(l.monto) || 0), 0));
    for (const oi of f.otros_impuestos || []) {
      const prev = v.otros_impuestos.find((x) => x.concepto === oi.concepto);
      if (prev) prev.monto = round2(prev.monto + (Number(oi.monto) || 0));
      else v.otros_impuestos.push({ concepto: oi.concepto, monto: round2(Number(oi.monto) || 0) });
    }
    v.total = round2(v.total + (Number(f.total) || 0));
    ventasIds.push(f.id);
  }

  // --- Gastos (G-03): comprobantes recibidos leídos, por clase ----
  const gastosPorMoneda = {};
  const gastosIdsPorClase = {};
  let duplicadosPeriodo = 0;
  const enRevision = [];
  const sinMonto = [];
  let recibidosSinImpuestos = 0;
  const impuestosComprobantes = {}; // moneda -> [{concepto, monto}]
  for (const c of comps) {
    if (!enPeriodo(c.fecha)) continue;
    if (c.duplicado_de) { duplicadosPeriodo++; continue; }
    if (c.estado_lectura !== 'leido') { enRevision.push(c.id); continue; }
    if (c.direccion !== 'recibida') continue;
    const monto = c.monto_total !== null && c.monto_total !== undefined ? c.monto_total : c.monto_neto;
    if (monto === null || monto === undefined) { sinMonto.push(c.id); continue; }
    const k = monedaKey(c.moneda);
    const clase = c.clasificacion || 'sin-clasificar';
    const g = gastosPorMoneda[k] || (gastosPorMoneda[k] = { cantidad: 0, neto: 0, total: 0, por_clasificacion: {} });
    const gc = g.por_clasificacion[clase] || (g.por_clasificacion[clase] = { cantidad: 0, neto: 0, total: 0 });
    g.cantidad++; gc.cantidad++;
    g.total = round2(g.total + Number(monto)); gc.total = round2(gc.total + Number(monto));
    const neto = c.monto_neto !== null && c.monto_neto !== undefined ? Number(c.monto_neto) : Number(monto);
    g.neto = round2(g.neto + neto); gc.neto = round2(gc.neto + neto);
    (gastosIdsPorClase[clase] = gastosIdsPorClase[clase] || []).push(c.id);
    const imps = Array.isArray(c.impuestos) ? c.impuestos : [];
    if (!imps.length) recibidosSinImpuestos++;
    for (const imp of imps) {
      const arr = impuestosComprobantes[k] || (impuestosComprobantes[k] = []);
      const prev = arr.find((x) => x.concepto === (imp.concepto || ''));
      const mm = Number(imp.monto) || 0;
      if (prev) prev.monto = round2(prev.monto + mm);
      else arr.push({ concepto: imp.concepto || '', monto: round2(mm) });
    }
  }

  // --- Cobros del período: por la fecha del PAGO ------------------
  const cobrosPorMoneda = {};
  const cobrosDetalle = [];
  for (const f of facturas) {
    for (const p of f.pagos || []) {
      if (!enPeriodo(p.fecha)) continue;
      const k = monedaKey(f.moneda);
      const c = cobrosPorMoneda[k] || (cobrosPorMoneda[k] = { cantidad: 0, total: 0 });
      c.cantidad++;
      c.total = round2(c.total + (Number(p.monto) || 0));
      cobrosDetalle.push({ factura_id: f.id, numero: f.numero, cliente: (f.cliente && f.cliente.nombre) || '', fecha: p.fecha, monto: round2(Number(p.monto) || 0), medio: p.medio || '' });
    }
  }

  // --- Impuestos y resultado por moneda ---------------------------
  const monedas = new Set([...Object.keys(ventasPorMoneda), ...Object.keys(gastosPorMoneda), ...Object.keys(cobrosPorMoneda), ...Object.keys(impuestosComprobantes)]);
  const porMoneda = {};
  for (const k of monedas) {
    const v = ventasPorMoneda[k] || { cantidad: 0, neto: 0, iva: 0, otros_impuestos: [], total: 0 };
    const g = gastosPorMoneda[k] || { cantidad: 0, neto: 0, total: 0, por_clasificacion: {} };
    const impsComp = impuestosComprobantes[k] || [];
    porMoneda[k] = {
      ventas: v,
      gastos: g,
      cobros: cobrosPorMoneda[k] || { cantidad: 0, total: 0 },
      impuestos: {
        debito_iva: v.iva,
        otros_impuestos_venta: v.otros_impuestos,
        en_comprobantes: impsComp,
        iva_en_comprobantes: round2(impsComp.filter((x) => /iva/i.test(x.concepto)).reduce((a, x) => a + x.monto, 0)),
      },
      resultado: round2(v.total - g.total),
    };
  }

  const fiscales = vencimientosFiscalesFundamento(db, userId);

  // --- Faltantes: lo que NO se puede saber, dicho ----------------
  const faltantes = [];
  if (enRevision.length) {
    faltantes.push({
      clave: 'comprobantes-en-revision', dato_que_falta: 'terminar de leer esos comprobantes',
      detalle: `${enRevision.length} comprobante(s) del período están sin terminar de leer (ids ${enRevision.join(', ')}): no entraron en ningún total.`,
      ids: enRevision,
    });
  }
  if (sinMonto.length) {
    faltantes.push({
      clave: 'comprobantes-sin-monto', dato_que_falta: 'el monto de esos comprobantes',
      detalle: `${sinMonto.length} comprobante(s) leídos del período no tienen monto (ids ${sinMonto.join(', ')}): quedaron fuera de los gastos.`,
      ids: sinMonto,
    });
  }
  if (recibidosSinImpuestos) {
    faltantes.push({
      clave: 'impuestos-sin-discriminar', dato_que_falta: 'los impuestos discriminados de esos comprobantes',
      detalle: `${recibidosSinImpuestos} comprobante(s) recibidos del período no traen impuestos discriminados: el total de impuestos de comprobantes puede estar incompleto.`,
    });
  }
  faltantes.push({
    clave: 'pagos-del-periodo', dato_que_falta: 'el registro de pagos a proveedores (llega con Proveedores y pagos, G-07)',
    detalle: 'Todavía no hay una entidad que registre los pagos a proveedores: el cierre muestra los gastos DEVENGADOS por clasificación y los cobros reales del período; no afirma qué se pagó.',
  });
  if (!fiscales.conMonto.length && !fiscales.sinMonto.length) {
    faltantes.push({
      clave: 'calendario-fiscal', dato_que_falta: 'los vencimientos fiscales en el fundamento (grupo calendario-fiscal)',
      detalle: 'El fundamento no registra vencimientos fiscales: el cierre no puede listar impuestos a pagar con fecha.',
    });
  } else if (fiscales.sinMonto.length) {
    faltantes.push({
      clave: 'vencimientos-fiscales-sin-monto', dato_que_falta: 'el monto de esos vencimientos fiscales',
      detalle: `El fundamento registra vencimientos fiscales sin monto (${fiscales.sinMonto.map((x) => x.campo).join(', ')}): se sabe que vencen, no cuánto — no se afirmó ningún importe.`,
      campos: fiscales.sinMonto.map((x) => x.campo),
    });
  }

  const totales = {
    periodo, desde, hasta, base: 'devengado',
    por_moneda: porMoneda,
    vencimientos_fiscales_registrados: fiscales.conMonto,
  };
  const desglose = {
    ventas: { ids: ventasIds, excluidas_por_estado: excluidas },
    gastos: { ids_por_clasificacion: gastosIdsPorClase },
    cobros: { detalle: cobrosDetalle },
    comprobantes: { duplicados_en_periodo: duplicadosPeriodo, en_revision: enRevision, sin_monto: sinMonto },
    fundamento_version: gesty.foundationVersion(db, userId),
  };
  return { totales, desglose, faltantes };
}

function parseCierreRow(r) {
  if (!r) return null;
  return {
    id: r.id, periodo: r.periodo, desde: r.desde, hasta: r.hasta,
    totales: safeJson(r.totales, {}), desglose: safeJson(r.desglose, {}),
    faltantes: safeJson(r.faltantes, []),
    generado_por: r.generado_por, generado_en: r.created_at,
  };
}

function generarCierre(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const periodo = normTexto(o.periodo) || hoyISO().slice(0, 7);
  rangoPeriodo(periodo); // valida el formato (falla en criollo)
  const { totales, desglose, faltantes } = calcularCierre(db, userId, periodo);
  const info = db.prepare(`INSERT INTO gesty_cierres (user_id, periodo, desde, hasta, totales, desglose, faltantes, generado_por)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(userId, periodo, totales.desde, totales.hasta, JSON.stringify(totales), JSON.stringify(desglose), JSON.stringify(faltantes), normTexto(o.generado_por) || 'gesty');
  const id = Number(info.lastInsertRowid);
  const compacto = {};
  for (const [k, v] of Object.entries(totales.por_moneda)) {
    compacto[k] = { ventas: v.ventas.total, gastos: v.gastos.total, cobros: v.cobros.total, resultado: v.resultado };
  }
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cierre', entidad_id: String(id),
    tipo_evento: 'cierre-generado',
    resumen: `Cierre de ${periodo} generado: ${Object.entries(compacto).map(([k, v]) => `${k} ventas ${fmtMonto(v.ventas)} · gastos ${fmtMonto(v.gastos)} · resultado ${fmtMonto(v.resultado)}`).join(' | ') || 'sin movimientos registrados en el período'}`,
    payload: { periodo, por_moneda: compacto, faltantes: faltantes.map((f) => f.clave) },
  });
  return parseCierreRow(db.prepare('SELECT * FROM gesty_cierres WHERE id = ?').get(id));
}

function getCierre(db, userId, periodo) {
  ensureSchema(db);
  const p = normTexto(periodo);
  if (!p) fail('Falta el período (AAAA-MM).');
  const r = db.prepare('SELECT * FROM gesty_cierres WHERE user_id = ? AND periodo = ? ORDER BY id DESC LIMIT 1').get(userId, p);
  return parseCierreRow(r);
}

// La última generación de cada período — la «fila del cierre» que
// leen la pantalla Cierre y el Contador Aliado (G-15).
function listCierres(db, userId) {
  ensureSchema(db);
  const rows = db.prepare('SELECT * FROM gesty_cierres WHERE user_id = ? ORDER BY periodo DESC, id DESC').all(userId);
  const porPeriodo = new Map();
  for (const r of rows) {
    if (!porPeriodo.has(r.periodo)) porPeriodo.set(r.periodo, { cierre: parseCierreRow(r), generaciones: 0 });
    porPeriodo.get(r.periodo).generaciones++;
  }
  return [...porPeriodo.values()].map(({ cierre, generaciones }) => ({ ...cierre, generaciones }));
}

// La fila compacta del cierre (para «La oficina» y G-15): los
// números de tapa, con sus faltantes a la vista — nunca escondidos.
function filaCierre(db, userId, periodo) {
  const c = periodo ? getCierre(db, userId, periodo) : (listCierres(db, userId)[0] || null);
  if (!c) return null;
  const porMoneda = {};
  for (const [k, v] of Object.entries(c.totales.por_moneda || {})) {
    porMoneda[k] = {
      ventas_total: v.ventas.total, gastos_total: v.gastos.total,
      cobros_total: v.cobros.total, resultado: v.resultado,
    };
  }
  return {
    cierre_id: c.id, periodo: c.periodo, generado_en: c.generado_en,
    por_moneda: porMoneda,
    faltantes: c.faltantes.length, faltantes_claves: c.faltantes.map((f) => f.clave),
  };
}

// ===========================================================================
// CARPETA DEL MES PARA EL CONTADOR — índice + reporte, exportable
// ===========================================================================

function carpetaDelMes(db, userId, periodo, opts) {
  ensureSchema(db);
  const p = normTexto(periodo) || hoyISO().slice(0, 7);
  const { desde, hasta } = rangoPeriodo(p);
  let cierre = getCierre(db, userId, p);
  if (!cierre) cierre = generarCierre(db, userId, { periodo: p, generado_por: (opts && opts.generado_por) || 'gesty' });
  const comps = todosLosComprobantes(db, userId, { desde, hasta });
  const indice = comps
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id))
    .map((c) => ({
      id: c.id, fecha: c.fecha, tipo: c.tipo, direccion: c.direccion,
      emisor: c.emisor, receptor: c.receptor, numero: c.numero,
      vencimiento: c.vencimiento, moneda: c.moneda,
      monto_total: c.monto_total, monto_neto: c.monto_neto,
      impuestos: c.impuestos, clasificacion: c.clasificacion || '',
      estado_lectura: c.estado_lectura, duplicado_de: c.duplicado_de,
      archivo: c.archivo,
    }));
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cierre', entidad_id: String(cierre.id),
    tipo_evento: 'carpeta-generada',
    resumen: `Carpeta del mes ${p} generada para el contador: ${indice.length} comprobante(s) indexados + el reporte del cierre #${cierre.id}`,
    payload: { periodo: p, cierre_id: cierre.id, comprobantes: indice.length },
  });
  return {
    periodo: p, desde, hasta, generado_en: new Date().toISOString(),
    cierre,
    indice_comprobantes: indice,
    totales_carpeta: {
      comprobantes: indice.length,
      leidos: indice.filter((c) => c.estado_lectura === 'leido').length,
      en_revision: indice.filter((c) => c.estado_lectura === 'necesita-revision').length,
      duplicados: indice.filter((c) => c.duplicado_de).length,
    },
  };
}

// El CSV de la carpeta (el patrón de exportación de la casa): el
// índice de comprobantes, una fila por papel, listo para el
// contador o para abrir en una planilla.
function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function carpetaCSV(carpeta) {
  const head = ['fecha', 'tipo', 'direccion', 'emisor', 'emisor_cuit', 'receptor', 'receptor_cuit', 'numero', 'vencimiento', 'moneda', 'monto_neto', 'monto_total', 'clasificacion', 'estado_lectura', 'duplicado_de'];
  const lines = [head.join(';')];
  for (const c of carpeta.indice_comprobantes || []) {
    lines.push([
      c.fecha, c.tipo, c.direccion,
      c.emisor && c.emisor.nombre, c.emisor && c.emisor.cuit,
      c.receptor && c.receptor.nombre, c.receptor && c.receptor.cuit,
      c.numero, c.vencimiento, c.moneda, c.monto_neto, c.monto_total,
      c.clasificacion, c.estado_lectura, c.duplicado_de || '',
    ].map(csvEscape).join(';'));
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  // esquema
  ensureSchema,
  // pronóstico de caja (§13.2)
  pronosticoCaja,
  // cierre del período
  generarCierre, getCierre, listCierres, filaCierre,
  // carpeta del contador
  carpetaDelMes, carpetaCSV,
  // piezas internas, exportadas para tests y reuso
  calcularCierre, rangoPeriodo, vencimientosFiscalesFundamento,
};
