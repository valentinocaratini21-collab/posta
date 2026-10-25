#!/usr/bin/env node
// test-gesty-stock.js — G-10 · STOCK BÁSICO. Spec: gesty-cola-builds.md
// G-10, gesty-areas-detalle.md §5/§6, gesty-sistema-operativo.md §5.
// Cubre: el stock se DERIVA de los movimientos (no hay número
// editable: la ficha rechaza el campo stock en voz alta) · el conteo
// asienta la DIFERENCIA y la declara · el papel de G-03 NO suma sin
// confirmación (y sin cantidad no se confirma: no se inventa) · la
// venta de G-04 propone su salida y al confirmar descuenta · al
// cruzar el mínimo salta la alerta y nace la orden de compra con su
// tarjeta `orden-compra` — sin OK la orden NO sale (sigue
// esperando-ok) y con OK el ejecutor la marca enviada · cantidad
// sugerida desde el consumo con su fuente escrita · precios con
// fuente y variación marcada contra el precio anterior · la
// recepción suma SOLO con el remito de G-03 vinculado (y de ese
// proveedor) · el conteo por foto propone ajustes a confirmar y sin
// lector no toca nada · sin mínimo no hay alerta · separación por
// cuenta · gating (401/403 y capacidad «stock») en HTTP.
// Uso: node test-gesty-stock.js
'use strict';
const assert = require('assert');
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
const stock = require('./gesty-stock.js');
const comp = require('./gesty-comprobantes.js');
const fact = require('./gesty-facturacion.js');
const pres = require('./gesty-presupuestos.js');

const HOY = '2026-10-21';
const CUIT_PROPIO = '20123456786';
const CUIT_ESPIGA = '27234567891';
const CUIT_PROV = '30555555551';
const PROV = { nombre: 'Repuestos del Sur S.A.', cuit: CUIT_PROV };

pres.configure({ sendEmail: async () => ({ ok: true, id: 'resend-test-g10' }) });

function dbConPack(pack, uid) {
  const db = nuevaDb();
  gesty.setPack(db, uid || 1, pack, { origen: 'checkout', actor: 'sistema' });
  return db;
}
function sembrarBase(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_ESPIGA}`,
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_ESPIGA, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
  gesty.setData(db, uid, {
    grupo: 'proveedores', campo: `cuit_${CUIT_PROV}`,
    valor: { nombre: PROV.nombre, cuit: CUIT_PROV, email: 'pedidos@repuestosdelsur.example' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}
function papel(db, uid, datos) {
  const r = comp.registrarManual(db, uid, {
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO, moneda: 'ARS', ...datos,
  });
  assert(r.comprobante && r.comprobante.estado_lectura === 'leido', 'el papel sembrado tiene que nacer leído');
  return r.comprobante;
}
async function facturaVenta(db, uid, descripcion, cantidad, precio) {
  const f = fact.crearBorrador(db, uid, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion, cantidad, precio_unitario: precio, alicuota_iva: 21 }],
    fecha: HOY, vencimiento: '2026-11-20',
  });
  const p = fact.pedirOK(db, uid, f.id);
  const ap = gesty.approveCard(db, uid, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación de emisión tiene que salir');
  const env = await fact.enviarFactura(db, uid, f.id, { canal: 'whatsapp-manual', comprobante: 'wa-fact-g10', destinatario: 'Panadería La Espiga' });
  return env.factura;
}
const tarjetaDe = (db, uid, ordenId) => gesty.listCards(db, uid, {})
  .find((t) => t.tipo === 'orden-compra' && t.detalle && t.detalle.orden_compra_id === ordenId);

(async () => {

console.log('— unidad: ítems, stock derivado y conteo');
const db = dbConPack('completa');
sembrarBase(db, 1);
pres.setPolitica(db, 1, {
  lista_precios: [
    { descripcion: 'Compresor 1/4 HP', precio_unitario: 10000, alicuota_iva: 21 },
    { descripcion: 'Válvula de expansión', precio_unitario: 10000, alicuota_iva: 21 },
  ],
});

const creado = stock.crearItem(db, 1, {
  nombre: 'Compresor 1/4 HP', unidad: 'unidades', minimo: 3, reposicion_dias: 5,
  proveedor_nombre: PROV.nombre, proveedor_cuit: PROV.cuit,
}, { creado_por: 'dueno', hoy: HOY });
const item = creado.item;
ok('ítem creado con su ficha (mínimo, plazo y proveedor habitual)',
  !!item && creado.existente === false && item.minimo === 3 && item.reposicion_dias === 5
  && item.proveedor && item.proveedor.campo === `cuit_${CUIT_PROV}`, JSON.stringify(item).slice(0, 200));
const reflejo = gesty.getData(db, 1, { grupo: 'stock-ref' }).find((d) => d.campo === item.clave);
ok('el ítem se refleja en el fundamento (grupo stock-ref) con su procedencia',
  !!reflejo && reflejo.valor && reflejo.valor.item_id === item.id && reflejo.origen === 'dueno');
const dup = stock.crearItem(db, 1, { nombre: 'compresor 1/4 hp' }, { hoy: HOY });
ok('crear el mismo ítem dos veces devuelve el existente (clave normalizada)',
  dup.existente === true && dup.item.id === item.id);

let r = stock.registrarMovimiento(db, 1, { item_id: item.id, tipo: 'entrada', cantidad: 10, fecha: HOY }, { hoy: HOY });
ok('entrada asentada: el stock derivado es 10', r.stock === 10 && stock.getItem(db, 1, item.id, { hoy: HOY }).stock === 10);
r = stock.registrarMovimiento(db, 1, { item_id: item.id, tipo: 'salida', cantidad: 4, fecha: HOY }, { hoy: HOY });
ok('salida asentada: el stock derivado es 6', r.stock === 6);
r = stock.registrarMovimiento(db, 1, { item_id: item.id, tipo: 'ajuste', cantidad: -1, motivo: 'una unidad rota en el depósito', fecha: HOY }, { hoy: HOY });
ok('ajuste con motivo: el stock derivado es 5', r.stock === 5);
const errStock = lanza(() => stock.actualizarItem(db, 1, item.id, { stock: 99 }));
ok('el stock NO se edita como número: la ficha rechaza el campo stock en voz alta',
  !!errStock && /no se edita/.test(errStock.message), errStock && errStock.message);
const errSalida = lanza(() => stock.registrarMovimiento(db, 1, { item_id: item.id, tipo: 'salida', cantidad: 99, fecha: HOY }, { hoy: HOY }));
ok('una salida mayor al stock registrado se rechaza (la vía es el conteo, no el número imposible)',
  !!errSalida, errSalida && errSalida.message);
const errAjuste = lanza(() => stock.registrarMovimiento(db, 1, { item_id: item.id, tipo: 'ajuste', cantidad: 1, fecha: HOY }, { hoy: HOY }));
ok('el ajuste sin motivo se rechaza: el stock no se toca «a ojo»', !!errAjuste);

const conteo = stock.registrarConteo(db, 1, { item_id: item.id, cantidad_contada: 3, fecha: HOY }, { hoy: HOY });
ok('conteo físico: derivado 5, contado 3, diferencia −2 asentada y declarada',
  conteo.stock_derivado_antes === 5 && conteo.diferencia === -2 && conteo.stock === 3
  && !!conteo.movimiento && conteo.movimiento.tipo === 'ajuste',
  JSON.stringify(conteo).slice(0, 200));
const evConteo = gesty.listEvents(db, 1, { entidad_tipo: 'stock-item', entidad_id: String(item.id) })
  .find((e) => e.tipo_evento === 'stock-conteo');
ok('el evento del conteo declara la diferencia (nada se esconde)',
  !!evConteo && evConteo.payload && evConteo.payload.diferencia === -2);

console.log('— unidad: la alerta cruza el mínimo y nace la orden con su tarjeta');
const ordenesTrasConteo = stock.listOrdenesCompra(db, 1, {});
ok('al quedar en el mínimo (3) la alerta armó UNA orden de compra esperando el OK',
  ordenesTrasConteo.total === 1 && ordenesTrasConteo.ordenes[0].estado === 'esperando-ok',
  JSON.stringify(ordenesTrasConteo.ordenes).slice(0, 200));
const orden1 = ordenesTrasConteo.ordenes[0];
const linea1 = orden1.items[0];
ok('cantidad sugerida DESDE EL CONSUMO con su fuente escrita (4 salidas en 30 días, mínimo 3, plazo 5 → 1)',
  linea1.cantidad === 1 && linea1.cantidad_fuente && linea1.cantidad_fuente.tipo === 'consumo'
  && /consumo/.test(linea1.cantidad_fuente.texto), JSON.stringify(linea1).slice(0, 260));
ok('precio con fuente: sale de la lista de precios del fundamento (sin orden previa)',
  linea1.precio_unitario === 10000 && linea1.precio_fuente && linea1.precio_fuente.tipo === 'lista-precios'
  && orden1.monto_total === 10000, JSON.stringify(linea1).slice(0, 200));
const tarjeta1 = tarjetaDe(db, 1, orden1.id);
ok('la orden tiene su tarjeta `orden-compra` en la bandeja, esperando (sin OK no salió)',
  !!tarjeta1 && tarjeta1.estado === 'esperando' && orden1.estado === 'esperando-ok');
const ap1 = gesty.approveCard(db, 1, tarjeta1.id, { version_documento: tarjeta1.version_documento, usuario: 'dueno' });
const orden1TrasOK = stock.getOrdenCompra(db, 1, orden1.id);
ok('con el OK del dueño, el ejecutor marca la orden ENVIADA',
  ap1.ok === true && orden1TrasOK.estado === 'enviada', JSON.stringify(orden1TrasOK).slice(0, 160));

console.log('— unidad: el papel de G-03 no suma sin confirmación');
const facturaCompra = papel(db, 1, {
  tipo: 'factura', direccion: 'recibida', emisor_nombre: PROV.nombre, emisor_cuit: PROV.cuit,
  numero: 'A-0001-00000101', fecha: HOY, vencimiento: '2026-11-20', monto_total: 60000,
  concepto: 'Compresor 1/4 HP — compra del mes', clasificacion: 'stock',
});
const sync1 = stock.sincronizarDesdeComprobantes(db, 1, { hoy: HOY });
ok('la sincronización propone el ingreso A CONFIRMAR (el concepto coincide con el ítem)',
  sync1.creados.length === 1 && sync1.creados[0].estado === 'a-confirmar' && sync1.creados[0].cantidad === null,
  JSON.stringify(sync1.creados).slice(0, 200));
ok('el stock NO se movió: un papel mal leído no puede inflar el stock',
  stock.getItem(db, 1, item.id, { hoy: HOY }).stock === 3);
const movPapel = sync1.creados[0];
const errSinCantidad = lanza(() => stock.confirmarMovimiento(db, 1, movPapel.id, {}));
ok('confirmar sin cantidad se rechaza: el papel no la trae y no se inventa', !!errSinCantidad);
const confPapel = stock.confirmarMovimiento(db, 1, movPapel.id, { cantidad: 6 }, { hoy: HOY });
ok('confirmado con la cantidad del dueño, el ingreso suma: stock 9', confPapel.stock === 9);
const sync2 = stock.sincronizarDesdeComprobantes(db, 1, { hoy: HOY });
ok('re-sincronizar no duplica la propuesta (dedupe por comprobante e ítem)',
  sync2.creados.length === 0 && sync2.omitidos >= 1, JSON.stringify(sync2).slice(0, 160));

console.log('— unidad: la venta de G-04 propone su salida');
const fv = await facturaVenta(db, 1, 'Compresor 1/4 HP', 2, 15000);
ok('la factura de venta quedó enviada', fv.estado === 'enviada', fv.estado);
const syncF = stock.sincronizarDesdeFacturas(db, 1, { hoy: HOY });
ok('la sincronización propone la salida con la cantidad de la factura (2), a confirmar',
  syncF.creados.length === 1 && syncF.creados[0].tipo === 'salida' && syncF.creados[0].cantidad === 2
  && syncF.creados[0].estado === 'a-confirmar', JSON.stringify(syncF.creados).slice(0, 200));
ok('la venta tampoco descuenta sola: el stock sigue en 9 hasta confirmar',
  stock.getItem(db, 1, item.id, { hoy: HOY }).stock === 9);
const confVenta = stock.confirmarMovimiento(db, 1, syncF.creados[0].id, {}, { hoy: HOY });
ok('confirmada la salida, el stock baja a 7', confVenta.stock === 7);

console.log('— unidad: la recepción suma SOLO con el remito vinculado');
const remito1 = papel(db, 1, {
  tipo: 'remito', direccion: 'recibida', emisor_nombre: PROV.nombre, emisor_cuit: PROV.cuit,
  numero: 'R-0001-00000055', fecha: HOY, monto_total: 10000, concepto: 'Remito de entrega — compresor', clasificacion: 'stock',
});
const errSinPapel = lanza(() => stock.vincularRecepcion(db, 1, orden1.id, {}));
ok('sin papel vinculado no hay recepción: el stock no se mueve', !!errSinPapel);
const recep1 = stock.vincularRecepcion(db, 1, orden1.id, { comprobante_id: remito1.id }, { hoy: HOY });
ok('con el remito vinculado, el ingreso de la orden suma (7 + 1 = 8) y la orden queda RECIBIDA',
  recep1.movimientos.length === 1 && recep1.orden.estado === 'recibida'
  && stock.getItem(db, 1, item.id, { hoy: HOY }).stock === 8, JSON.stringify(recep1.orden).slice(0, 160));
const errDoble = lanza(() => stock.vincularRecepcion(db, 1, orden1.id, { comprobante_id: remito1.id }));
ok('la misma orden no se recibe dos veces', !!errDoble);

console.log('— unidad: segunda alerta, precio de la última orden y variación marcada');
r = stock.registrarMovimiento(db, 1, { item_id: item.id, tipo: 'salida', cantidad: 6, fecha: HOY }, { hoy: HOY });
ok('salida grande asentada: stock 2 (bajo el mínimo)', r.stock === 2);
const ordenes2 = stock.listOrdenesCompra(db, 1, { estado: 'esperando-ok' });
ok('la nueva alerta armó su orden (consumo acumulado: 10 salidas en 30 días ≈ 0.33/día; objetivo = mínimo 3 + 2 de reposición = 5; stock 2 → sugeridas 3)',
  ordenes2.total === 1 && ordenes2.ordenes[0].items[0].cantidad === 3
  && ordenes2.ordenes[0].items[0].cantidad_fuente.tipo === 'consumo',
  JSON.stringify(ordenes2.ordenes).slice(0, 240));
const orden2 = ordenes2.ordenes[0];
ok('el precio sale de la ÚLTIMA ORDEN (fuente citada), no de la lista',
  orden2.items[0].precio_unitario === 10000 && orden2.items[0].precio_fuente.tipo === 'ultima-orden',
  JSON.stringify(orden2.items[0]).slice(0, 200));
stock.anularOrdenCompra(db, 1, orden2.id, { motivo: 'prueba' });
ok('la orden se anula con su motivo y su tarjeta sale de la bandeja',
  stock.getOrdenCompra(db, 1, orden2.id).estado === 'anulada'
  && !gesty.listCards(db, 1, {}).some((t) => t.detalle && t.detalle.orden_compra_id === orden2.id));

console.log('— unidad: recepción parcial y proveedor equivocado');
const item2 = stock.crearItem(db, 1, {
  nombre: 'Filtro deshidratador', minimo: 2, proveedor_nombre: PROV.nombre, proveedor_cuit: PROV.cuit,
}, { creado_por: 'dueno', hoy: HOY }).item;
stock.registrarMovimiento(db, 1, { item_id: item2.id, tipo: 'entrada', cantidad: 1, fecha: HOY }, { hoy: HOY, evaluar_alertas: false });
const prep = stock.prepararOrdenCompra(db, 1, { items: [{ item_id: item2.id, cantidad: 4 }] }, { hoy: HOY, creado_por: 'dueno' });
const orden3 = prep.ordenes[0];
ok('orden manual preparada con su tarjeta (cantidad del pedido, fuente declarada)',
  !!orden3 && orden3.estado === 'esperando-ok' && orden3.items[0].cantidad === 4
  && orden3.items[0].cantidad_fuente.tipo === 'pedido', JSON.stringify(orden3).slice(0, 200));
const tarjeta3 = tarjetaDe(db, 1, orden3.id);
gesty.approveCard(db, 1, tarjeta3.id, { version_documento: tarjeta3.version_documento, usuario: 'dueno' });
const remitoOtro = papel(db, 1, {
  tipo: 'remito', direccion: 'recibida', emisor_nombre: 'Otro Proveedor S.A.', emisor_cuit: '30777777771',
  numero: 'R-0002-00000009', fecha: HOY, monto_total: 5000, concepto: 'Remito ajeno', clasificacion: 'stock',
});
const errProv = lanza(() => stock.vincularRecepcion(db, 1, orden3.id, { comprobante_id: remitoOtro.id }));
ok('el remito de OTRO proveedor no recibe esta orden', !!errProv, errProv && errProv.message);
const remito3 = papel(db, 1, {
  tipo: 'remito', direccion: 'recibida', emisor_nombre: PROV.nombre, emisor_cuit: PROV.cuit,
  numero: 'R-0001-00000056', fecha: HOY, monto_total: 20000, concepto: 'Remito de entrega — filtros', clasificacion: 'stock',
});
const recepParcial = stock.vincularRecepcion(db, 1, orden3.id, { comprobante_id: remito3.id, cantidades: { [item2.id]: 2 } }, { hoy: HOY });
ok('recepción parcial declarada: entra 2 de 4 y la orden queda RECIBIDA-PARCIAL',
  recepParcial.orden.estado === 'recibida-parcial' && stock.getItem(db, 1, item2.id, { hoy: HOY }).stock === 3,
  JSON.stringify(recepParcial.orden).slice(0, 160));
const remito4 = papel(db, 1, {
  tipo: 'remito', direccion: 'recibida', emisor_nombre: PROV.nombre, emisor_cuit: PROV.cuit,
  numero: 'R-0001-00000057', fecha: HOY, monto_total: 20000, concepto: 'Remito de entrega — filtros (resto)', clasificacion: 'stock',
});
const recepResto = stock.vincularRecepcion(db, 1, orden3.id, { comprobante_id: remito4.id }, { hoy: HOY });
ok('el resto completa la orden: RECIBIDA y stock 5',
  recepResto.orden.estado === 'recibida' && stock.getItem(db, 1, item2.id, { hoy: HOY }).stock === 5);

console.log('— unidad: variación de precio marcada antes de aprobar');
const item3 = stock.crearItem(db, 1, {
  nombre: 'Válvula de expansión', minimo: 1, proveedor_nombre: PROV.nombre, proveedor_cuit: PROV.cuit,
}, { creado_por: 'dueno', hoy: HOY }).item;
stock.registrarMovimiento(db, 1, { item_id: item3.id, tipo: 'entrada', cantidad: 5, fecha: HOY }, { hoy: HOY, evaluar_alertas: false });
const prepA = stock.prepararOrdenCompra(db, 1, { items: [{ item_id: item3.id, cantidad: 2 }] }, { hoy: HOY });
ok('primera orden de la válvula: precio de la lista (10000), sin variación',
  prepA.ordenes[0].items[0].precio_unitario === 10000 && prepA.ordenes[0].items[0].variacion === null,
  JSON.stringify(prepA.ordenes[0].items[0]).slice(0, 200));
const tarjetaA = tarjetaDe(db, 1, prepA.ordenes[0].id);
gesty.approveCard(db, 1, tarjetaA.id, { version_documento: tarjetaA.version_documento, usuario: 'dueno' });
const remitoA = papel(db, 1, {
  tipo: 'remito', direccion: 'recibida', emisor_nombre: PROV.nombre, emisor_cuit: PROV.cuit,
  numero: 'R-0001-00000058', fecha: HOY, monto_total: 20000, concepto: 'Remito — válvulas', clasificacion: 'stock',
});
stock.vincularRecepcion(db, 1, prepA.ordenes[0].id, { comprobante_id: remitoA.id }, { hoy: HOY });
pres.setPolitica(db, 1, {
  lista_precios: [
    { descripcion: 'Compresor 1/4 HP', precio_unitario: 10000, alicuota_iva: 21 },
    { descripcion: 'Válvula de expansión', precio_unitario: 12000, alicuota_iva: 21 },
  ],
});
const prepB = stock.prepararOrdenCompra(db, 1, { items: [{ item_id: item3.id, cantidad: 2 }] }, { hoy: HOY });
const lineaB = prepB.ordenes[0].items[0];
ok('la orden nueva cita la última orden (10000) y MARCA la variación contra la lista (12000): −16.67%',
  lineaB.precio_unitario === 10000 && lineaB.precio_fuente.tipo === 'ultima-orden'
  && !!lineaB.variacion && lineaB.variacion.pct === -16.67 && /OJO/.test(lineaB.variacion.texto),
  JSON.stringify(lineaB).slice(0, 260));

console.log('— unidad: conteo por foto y honestidades');
stock.registerContador(async () => ({ items: [{ descripcion: 'Compresor 1/4 HP', cantidad: 8 }, { descripcion: 'Cosa que no existe', cantidad: 3 }] }));
const foto = await stock.contarDesdeFoto(db, 1, { buffer: Buffer.from('foto'), mime: 'image/jpeg' }, { hoy: HOY });
ok('la foto propone el ajuste A CONFIRMAR (derivado 2 → contado 8) y reporta lo sin ítem',
  foto.ok === true && foto.propuestas.length === 1 && foto.propuestas[0].tipo === 'ajuste'
  && foto.propuestas[0].cantidad === 6 && foto.sin_item.length === 1,
  JSON.stringify(foto).slice(0, 240));
ok('la foto tampoco mueve el stock hasta confirmar', stock.getItem(db, 1, item.id, { hoy: HOY }).stock === 2);
const confFoto = stock.confirmarMovimiento(db, 1, foto.propuestas[0].id, {}, { hoy: HOY });
ok('confirmado el conteo por foto, el stock es el contado: 8', confFoto.stock === 8);
stock.registerContador(null);
const sinLector = await stock.contarDesdeFoto(db, 1, { buffer: Buffer.from('foto'), mime: 'image/jpeg' }, { hoy: HOY });
ok('sin lector disponible, la foto no toca nada y lo dice (sin-lector)',
  sinLector.ok === false && sinLector.motivo === 'sin-lector' && sinLector.propuestas.length === 0);

const itemSinMinimo = stock.crearItem(db, 1, { nombre: 'Tornillos M6', unidad: 'unidades' }, { creado_por: 'dueno', hoy: HOY }).item;
stock.registrarMovimiento(db, 1, { item_id: itemSinMinimo.id, tipo: 'entrada', cantidad: 1, fecha: HOY }, { hoy: HOY });
stock.registrarMovimiento(db, 1, { item_id: itemSinMinimo.id, tipo: 'salida', cantidad: 1, fecha: HOY }, { hoy: HOY });
const alertas = stock.listAlertas(db, 1, { hoy: HOY });
ok('sin mínimo cargado NO hay alerta (no se inventan mínimos), ni siquiera en cero',
  !alertas.alertas.some((a) => a.item_id === itemSinMinimo.id)
  && stock.getItem(db, 1, itemSinMinimo.id, { hoy: HOY }).alerta === null);
const resumen = stock.resumenStock(db, 1, { hoy: HOY });
ok('el resumen para «La oficina» sale de los registros (ítems, a confirmar, órdenes)',
  resumen.items >= 4 && typeof resumen.movimientos_a_confirmar === 'number'
  && resumen.ordenes_compra.recibida >= 2, JSON.stringify(resumen).slice(0, 200));

console.log('— unidad: separación por cuenta');
const db2 = dbConPack('total', 2);
ok('otra cuenta no ve el ítem ajeno', stock.getItem(db, 2, item.id, { hoy: HOY }) === null);
const errAjeno = lanza(() => stock.registrarMovimiento(db, 2, { item_id: item.id, tipo: 'entrada', cantidad: 1, fecha: HOY }, { hoy: HOY }));
ok('otra cuenta no mueve el stock ajeno', !!errAjeno);
ok('otra cuenta lista SU stock (vacío)', stock.listItems(db, 2, { hoy: HOY }).total === 0);
db2.close();

console.log('— cableado estático');
const srcServer = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const srcStock = fs.readFileSync(path.join(__dirname, 'gesty-stock.js'), 'utf8');
ok('server.js monta /api/gesty/stock con la capacidad «stock»',
  srcServer.includes("'/api/gesty/stock'") && srcServer.includes("capacidadMiddleware(db, 'stock')")
  && srcServer.includes("require('./gesty-stock')"));
ok('el ejecutor de la matriz está registrado para `orden-compra`',
  srcStock.includes("registerExecutor('orden-compra'"));

// ---------------- HTTP: flujo completo ----------------
const PORT = 3994;
const BASE = `http://127.0.0.1:${PORT}`;
async function call(method, p, body, cookie) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, cookie: sid };
}

console.log('— http: gating, capacidad y recorrido con el server booteado');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g10-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let listo = false;
for (let i = 0; i < 60 && !listo; i++) {
  try { const r2 = await fetch(`${BASE}/api/version`); listo = r2.status > 0; } catch (e) { await new Promise((res) => setTimeout(res, 500)); }
}
try {
  ok('el server booteó', listo);
  const reg = await call('POST', '/api/auth/register', { email: 'g10@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/stock/items', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/stock/items', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile.exec('PRAGMA busy_timeout = 5000');
  const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('g10@example.com');
  dbFile.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'esencial', 'admin-familia')").run(u.id);
  const conEsencial = await call('GET', '/api/gesty/stock/items', null, reg.cookie);
  ok('gating http: pack Esencial NO trae la capacidad stock → 403', conEsencial.status === 403, String(conEsencial.status));
  dbFile.prepare("UPDATE gesty_subscriptions SET pack = 'completa' WHERE user_id = ?").run(u.id);
  dbFile.close();

  const creadoHttp = await call('POST', '/api/gesty/stock/items', {
    nombre: 'Gas refrigerante R410', unidad: 'garrafas', minimo: 2,
    proveedor_nombre: PROV.nombre, proveedor_cuit: PROV.cuit,
  }, reg.cookie);
  ok('http: crear el ítem → 200 con su ficha', creadoHttp.status === 200 && creadoHttp.data.item && creadoHttp.data.item.minimo === 2,
    JSON.stringify(creadoHttp.data).slice(0, 200));
  const itemHttpId = creadoHttp.data.item.id;
  const movHttp = await call('POST', `/api/gesty/stock/items/${itemHttpId}/movimientos`, { tipo: 'entrada', cantidad: 5 }, reg.cookie);
  ok('http: registrar la entrada → 200 y stock 5', movHttp.status === 200 && movHttp.data.stock === 5,
    JSON.stringify(movHttp.data).slice(0, 160));
  const listaHttp = await call('GET', '/api/gesty/stock/items', null, reg.cookie);
  ok('http: la lista muestra el ítem con su stock derivado',
    listaHttp.status === 200 && listaHttp.data.items.some((i) => i.id === itemHttpId && i.stock === 5));
  const resumenHttp = await call('GET', '/api/gesty/stock', null, reg.cookie);
  ok('http: el resumen responde con los conteos', resumenHttp.status === 200 && resumenHttp.data.items === 1);

  const regB = await call('POST', '/api/auth/register', { email: 'g10-otra@example.com', password: 'secreto2' });
  const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile2.exec('PRAGMA busy_timeout = 5000');
  const uB = dbFile2.prepare('SELECT id FROM users WHERE email = ?').get('g10-otra@example.com');
  dbFile2.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'total', 'checkout')").run(uB.id);
  dbFile2.close();
  const listaB = await call('GET', '/api/gesty/stock/items', null, regB.cookie);
  ok('http: otra cuenta con pack ve SU stock (vacío), nunca el ajeno',
    listaB.status === 200 && listaB.data.items.length === 0);
  const detalleB = await call('GET', `/api/gesty/stock/items/${itemHttpId}`, null, regB.cookie);
  ok('http: el ítem ajeno → 400', detalleB.status === 400, String(detalleB.status));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
