// gesty-cuenta-corriente.js — CUENTA CORRIENTE POR CLIENTE (mejora 30/34).
// Fiados, pagos parciales y saldo por cliente, sin planilla.
// Sobre G-05: es el LIBRO de cuenta corriente, distinto de la
// cobranza puntual (un reclamo por una factura) y del historial
// de comportamiento (a tiempo/tarde, mejora 11).
//
// · cuentaCliente: el libro cronológico de un cliente — cada
//   factura suma al debe, cada pago resta al haber, con saldo
//   acumulado por renglón. Incluye parciales: una factura con un
//   pago parcial queda con su saldo abierto, no cerrada.
// · El cliente se resuelve por CUIT exacto o nombre normalizado
//   exacto; si el nombre coincide con más de uno, se devuelve la
//   lista para elegir (nunca se fusionan dos clientes).
// · Vencido: saldo de facturas con vencimiento pasado (hoy dado
//   o real). Sin vencimiento, el saldo es abierto, no vencido:
//   nunca se inventa un plazo.
// · listCuentas: todos los clientes con su saldo, ordenados por
//   saldo descendente (los que más deben primero).
'use strict';
const gesty = require('./gesty.js');
const facturacion = require('./gesty-facturacion.js');

function norm(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function soloDigitos(v) { return String(v || '').replace(/\D/g, '');
}
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function facturasCliente(db, userId) {
  const mapa = new Map();
  for (const estado of ['enviada', 'cobrada']) {
    const { facturas } = facturacion.listFacturas(db, userId, { estado, limit: 1000 });
    for (const f of facturas) {
      const cli = f.cliente && typeof f.cliente === 'object' ? f.cliente : {};
      const clave = cli.cuit ? `cuit:${soloDigitos(cli.cuit)}` : `nombre:${norm(cli.nombre)}`;
      if (!mapa.has(clave)) mapa.set(clave, { nombre: cli.nombre || '', cuit: cli.cuit || null, facturas: [] });
      mapa.get(clave).facturas.push(f);
    }
  }
  return mapa;
}

function resolverCliente(db, userId, datos) {
  const d = datos || {};
  const mapa = facturasCliente(db, userId);
  if (d.cuit) {
    const clave = `cuit:${soloDigitos(d.cuit)}`;
    if (!mapa.has(clave)) return { noEncontrado: true };
    return { cliente: mapa.get(clave) };
  }
  const q = norm(d.nombre || d.cliente);
  if (!q) throw new Error('La cuenta corriente lleva su cliente (nombre o CUIT).');
  const exactos = [...mapa.values()].filter((c) => norm(c.nombre) === q);
  if (exactos.length === 1) return { cliente: exactos[0] };
  if (exactos.length > 1) return { ambiguo: exactos.map((c) => ({ nombre: c.nombre, cuit: c.cuit })) };
  const contiene = [...mapa.values()].filter((c) => norm(c.nombre).includes(q) && q.length >= 3);
  if (contiene.length === 1) return { cliente: contiene[0] };
  if (contiene.length > 1) return { ambiguo: contiene.map((c) => ({ nombre: c.nombre, cuit: c.cuit })) };
  return { noEncontrado: true };
}

function cuentaCliente(db, userId, datos) {
  const o = datos || {};
  const hoy = String(o.hoy || new Date().toISOString().slice(0, 10));
  const r = resolverCliente(db, userId, o);
  if (r.noEncontrado) throw new Error('Ese cliente no tiene facturas registradas.');
  if (r.ambiguo) return { ambiguo: r.ambiguo };
  const c = r.cliente;
  const movimientos = [];
  let totalFacturado = 0;
  let totalCobrado = 0;
  let vencido = 0;
  const facturas = c.facturas.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  for (const f of facturas) {
    totalFacturado = round2(totalFacturado + Number(f.total || 0));
    movimientos.push({ fecha: f.fecha, tipo: 'factura', factura_id: f.id, vencimiento: f.vencimiento || null,
      detalle: `Factura ${f.numero || f.id}`, debe: Number(f.total || 0), haber: 0, moneda: f.moneda });
    for (const p of (Array.isArray(f.pagos) ? f.pagos : [])) {
      totalCobrado = round2(totalCobrado + Number(p.monto || 0));
      movimientos.push({ fecha: p.fecha, tipo: 'pago', factura_id: f.id, medio: p.medio || '',
        detalle: `Pago factura ${f.numero || f.id} (${p.medio || 'sin medio'})`, debe: 0, haber: Number(p.monto || 0), moneda: f.moneda });
    }
    if (f.vencimiento && f.vencimiento < hoy && Number(f.saldo || 0) > 0) vencido = round2(vencido + Number(f.saldo || 0));
  }
  movimientos.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (a.tipo === 'factura' ? -1 : 1));
  let acumulado = 0;
  for (const m of movimientos) {
    acumulado = round2(acumulado + m.debe - m.haber);
    m.saldo_acumulado = acumulado;
  }
  const saldo = round2(totalFacturado - totalCobrado);
  return {
    cliente: c.nombre, cuit: c.cuit,
    total_facturado: totalFacturado, total_cobrado: totalCobrado, saldo,
    vencido, al_dia: round2(saldo - vencido),
    facturas: facturas.map((f) => ({ id: f.id, numero: f.numero || null, fecha: f.fecha, vencimiento: f.vencimiento || null,
      total: f.total, pagado: round2(Number(f.total || 0) - Number(f.saldo || 0)), saldo: f.saldo, estado: f.estado, moneda: f.moneda })),
    movimientos,
  };
}

function listCuentas(db, userId, opts) {
  const o = opts || {};
  const hoy = String(o.hoy || new Date().toISOString().slice(0, 10));
  const out = [];
  for (const c of facturasCliente(db, userId).values()) {
    const cuenta = cuentaCliente(db, userId, { nombre: c.nombre, cuit: c.cuit, hoy });
    if (cuenta.ambiguo) continue;
    out.push({ cliente: cuenta.cliente, cuit: cuenta.cuit, saldo: cuenta.saldo, vencido: cuenta.vencido,
      total_facturado: cuenta.total_facturado, total_cobrado: cuenta.total_cobrado, facturas: cuenta.facturas.length });
  }
  out.sort((a, b) => b.saldo - a.saldo);
  return out;
}

module.exports = { cuentaCliente, listCuentas };
