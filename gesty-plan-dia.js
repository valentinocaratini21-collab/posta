// gesty-plan-dia.js — PLAN DEL DÍA UNIFICADO (mejora 9/10).
// Una sola vista «hoy», SOLO LECTURA agregada sobre lo que ya
// existe (G-24/G-09/G-19/G-07). No duplica ningún módulo, no crea
// tarjetas, no escribe nada:
//
// · pagar_hoy: órdenes de pago con fecha propuesta hoy (proveedores,
//   alquiler, sueldos, servicios — todo lo que es una orden).
// · vence_manana: lo que vence mañana — vencimientos fiscales de
//   la agenda (G-19), facturas enviadas que vencen (cobros), órdenes
//   con fecha propuesta mañana y compromisos de agenda.
// · necesita_ok: tarjetas pendientes en Bandeja, por tipo.
// · hoy_agenda: compromisos y vencimientos fiscales de hoy.
// · salud: el resumen de «La oficina» (G-24), si se puede componer;
//   si no, null con motivo — el plan nunca se rompe por una sección.
// · Las categorías alquiler/sueldos/servicios no son módulos nuevos:
//   aparecen como órdenes o compromisos con su nombre real. Nada se
//   inventa: sin dato, la sección sale vacía, no con ceros.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const proveedores = require('./gesty-proveedores.js');
const facturacion = require('./gesty-facturacion.js');

function esFechaISO(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function addDias(iso, n) {
  const d = new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000);
  return d.toISOString().slice(0, 10);
}
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function planDelDia(db, userId, opts) {
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : new Date().toISOString().slice(0, 10);
  const manana = addDias(hoy, 1);

  const { ordenes } = proveedores.listOrdenes(db, userId, { limit: 1000 });
  const ordenesVivas = ordenes.filter((x) => ['borrador', 'esperando-ok', 'aprobada', 'en-ejecucion'].includes(x.estado));
  const resumirOrden = (x) => ({
    id: x.id, tipo: x.tipo, proveedor: x.proveedor ? (x.proveedor.nombre || x.proveedor.cuit || '') : '',
    monto_total: x.monto_total, moneda: x.moneda, estado: x.estado, fecha_propuesta: x.fecha_propuesta,
  });
  const pagarHoy = ordenesVivas.filter((x) => x.fecha_propuesta === hoy).map(resumirOrden);

  const { eventos } = agenda.listEventos(db, userId, { estado: 'activo', limit: 1000 });
  const resumirEvento = (e) => ({ id: e.id, tipo: e.tipo, titulo: e.titulo, fecha: e.fecha, hora: e.hora || '', cliente: e.cliente_nombre || '' });
  const hoyAgenda = eventos.filter((e) => e.fecha === hoy).map(resumirEvento);
  const fiscalManana = eventos.filter((e) => e.fecha === manana && e.tipo === 'vencimiento-fiscal').map(resumirEvento);
  const compromisosManana = eventos.filter((e) => e.fecha === manana && e.tipo !== 'vencimiento-fiscal').map(resumirEvento);

  const { facturas } = facturacion.listFacturas(db, userId, { estado: 'enviada', limit: 500 });
  const facturasManana = facturas
    .filter((f) => f.vencimiento === manana)
    .map((f) => ({ id: f.id, numero: f.numero, cliente: f.cliente.nombre || f.cliente.cuit || '', total: f.total, saldo: f.saldo, moneda: f.moneda, vencimiento: f.vencimiento }));

  const ordenesManana = ordenesVivas.filter((x) => x.fecha_propuesta === manana).map(resumirOrden);

  const tarjetas = gesty.listCards(db, userId, {});
  const porTipo = {};
  for (const t of tarjetas) porTipo[t.tipo] = (porTipo[t.tipo] || 0) + 1;
  const necesitaOk = {
    cantidad: tarjetas.length, por_tipo: porTipo,
    tarjetas: tarjetas.slice(0, 20).map((t) => ({ id: t.id, tipo: t.tipo, titulo: t.titulo, monto: t.monto, moneda: t.moneda })),
  };

  let salud = null;
  try {
    const s = require('./gesty-salud.js');
    salud = s.resumenSalud(db, userId, { hoy });
  } catch (e) { salud = { error: String(e.message || e).slice(0, 200) }; }

  // Décima tanda: los contratos por vencer alimentan el plan del
  // día (cada uno con su alerta previa del dueño). Como salud: si
  // la sección no se puede componer, sale vacía, el plan no se rompe.
  let contratosPorVencer = [];
  try {
    const contratos = require('./gesty-contratos.js');
    contratosPorVencer = contratos.alertasParaPlanDia(db, userId, { hoy });
  } catch (e) { contratosPorVencer = []; }

  return {
    hoy, manana,
    pagar_hoy: pagarHoy,
    vence_manana: { fiscal: fiscalManana, facturas: facturasManana, ordenes: ordenesManana, compromisos: compromisosManana },
    necesita_ok: necesitaOk,
    hoy_agenda: hoyAgenda,
    contratos_por_vencer: contratosPorVencer,
    salud,
  };
}

module.exports = { planDelDia };
