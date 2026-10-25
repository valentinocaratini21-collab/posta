#!/usr/bin/env node
// test-gesty-formatos-contador.js — G-26 · FORMATOS DEL CONTADOR
// Spec: gesty-cola-builds.md G-26. Cubre: el registro de layouts
// (uno verificado con su fuente citada; el resto declarado sin
// verificar, sin generar) · el Libro de IVA Digital campo por
// campo contra papeles sembrados (posiciones exactas del diseño
// público de la RG AFIP 4597/2019) · las exclusiones con motivo
// (nada se rellena adivinando: percepciones no discriminadas,
// varias alícuotas, moneda extranjera, CUIT que no cierra,
// aritmética que no cierra, tipo que no es factura, duplicado,
// en revisión) · las sumas de control cruzadas entre el archivo
// y el índice · la integración con G-15 por la costura de
// proveedores (el archivo queda CONGELADO en la versión del
// paquete; sin sistema el paquete es idéntico al de siempre; un
// sistema declarado lo declara y no genera; uno desconocido
// también) · el sistema destino en el fundamento · separación
// por cuenta · gating HTTP (401/403 sin pack/403 esencial sin
// «reportes»/200 completa) con la descarga del archivo.
// Uso: node test-gesty-formatos-contador.js
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
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 260) : ''); }
};
const nuevaDb = () => new DatabaseSync(':memory:');
function lanza(fn) { try { fn(); return null; } catch (e) { return e; } }
const F = (l, a, b) => l.slice(a - 1, b); // campo del diseño: posiciones 1-based inclusivas
const CEROS15 = '000000000000000';

const gesty = require('./gesty.js');
const comp = require('./gesty-comprobantes.js');
const rep = require('./gesty-reportes.js');
const contador = require('./gesty-contador.js');
const formatos = require('./gesty-formatos-contador.js');

const CUIT_PROPIO = '20123456786';
const CUIT_CLIENTE = '27234567891';      // Panadería La Espiga
const CUIT_PROV_A = '30123456781';       // Repuestos del Sur
const CUIT_PROV_B = '30567890127';       // Lubricantes Andina

function comprobante(db, uid, datos) {
  const r = comp.registrarManual(db, uid, {
    tipo: datos.tipo || 'factura', direccion: datos.direccion,
    emisor_nombre: datos.emisor, emisor_cuit: datos.emisor_cuit,
    receptor_nombre: datos.receptor, receptor_cuit: datos.receptor_cuit,
    numero: datos.numero, fecha: datos.fecha, vencimiento: datos.vencimiento,
    moneda: datos.moneda || 'ARS', monto_total: datos.total, monto_neto: datos.neto,
    impuestos: datos.impuestos, clasificacion: datos.clasificacion || 'gasto',
    concepto: datos.concepto || 'Insumos',
  });
  return r.comprobante;
}

(async () => {

// ---------------------------------------------------------------------------
console.log('— el registro: un layout verificado con fuente; el resto, declarado');
const registro = formatos.listFormatos();
const iva = registro.find((f) => f.id === 'libro-iva-digital');
ok('libro-iva-digital: verificado, con norma, diseño, especificaciones y tablas citadas',
  !!iva && iva.estado === 'verificado' && /4597/.test(iva.fuente.norma)
  && /VENTAS_CBTE/.test(iva.fuente.diseno_registros) && /Especificaciones/.test(iva.fuente.especificaciones)
  && /0005 = 21%/.test(iva.fuente.tablas) && /nota de crédito/i.test(iva.alcance));
const declarados = registro.filter((f) => f.estado === 'declarado-sin-verificar');
ok('los otros sistemas entran declarados, con su requisito, y sin función generadora pública',
  declarados.length >= 3 && declarados.every((f) => f.requisito && !('generar' in f) && f.fuente === null),
  JSON.stringify(registro.map((f) => [f.id, f.estado])));
const errGenDeclarado = lanza(() => formatos.generarLayout('tango-gestion', []));
ok('generar un layout declarado: rechazado en criollo (se entrega el genérico)',
  !!errGenDeclarado && /declarado sin verificar/.test(errGenDeclarado.message));

// ---------------------------------------------------------------------------
console.log('— la siembra del mes (septiembre 2026, cuenta 1)');
const db = nuevaDb();
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
gesty.setData(db, 1, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
gesty.setData(db, 1, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });

// VENTAS
const v1 = comprobante(db, 1, { // Factura A completa → ENTRA, con su alícuota
  direccion: 'emitida', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
  numero: 'A0001-00000009', fecha: '2026-09-08', vencimiento: '2026-09-18',
  total: 48400, neto: 40000, impuestos: [{ concepto: 'IVA 21%', monto: 8400 }], clasificacion: 'venta',
});
const v2 = comprobante(db, 1, { // Factura B a consumidor final → ENTRA como sin identificar (doc 99)
  direccion: 'emitida', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Consumidor Final', receptor_cuit: CUIT_CLIENTE,
  numero: 'B0003-00000123', fecha: '2026-09-10',
  total: 12100, neto: 10000, impuestos: [{ concepto: 'IVA 21%', monto: 2100 }], clasificacion: 'venta',
});
db.prepare('UPDATE gesty_comprobantes SET receptor_cuit = ? WHERE id = ?').run('', v2.id);
const v3 = comprobante(db, 1, { // Factura A cuyo comprador quedó sin CUIT → FUERA
  direccion: 'emitida', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Cliente Sin Cuit', receptor_cuit: CUIT_CLIENTE,
  numero: 'A0001-00000010', fecha: '2026-09-09',
  total: 24200, neto: 20000, impuestos: [{ concepto: 'IVA 21%', monto: 4200 }], clasificacion: 'venta',
});
db.prepare('UPDATE gesty_comprobantes SET receptor_cuit = ? WHERE id = ?').run('', v3.id);
const v4 = comprobante(db, 1, { // con percepción: el índice no la discrimina por campo → FUERA
  direccion: 'emitida', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
  numero: 'A0001-00000011', fecha: '2026-09-11',
  total: 12400, neto: 10000, impuestos: [{ concepto: 'IVA 21%', monto: 2100 }, { concepto: 'Percepción IIBB 3%', monto: 300 }], clasificacion: 'venta',
});
const v5 = comprobante(db, 1, { // número pelado: ni letra ni punto de venta afirmables → FUERA
  direccion: 'emitida', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
  numero: '00000123', fecha: '2026-09-12',
  total: 12100, neto: 10000, impuestos: [{ concepto: 'IVA 21%', monto: 2100 }], clasificacion: 'venta',
});
const v7 = comprobante(db, 1, { // dos alícuotas: el neto por alícuota no es dato del índice → FUERA
  direccion: 'emitida', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
  numero: 'A0002-00000007', fecha: '2026-09-14',
  total: 17625, neto: 15000, impuestos: [{ concepto: 'IVA 21%', monto: 2100 }, { concepto: 'IVA 10,5%', monto: 525 }], clasificacion: 'venta',
});
const v8 = comprobante(db, 1, { // neto + IVA ≠ total: el papel no cierra → FUERA
  direccion: 'emitida', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
  numero: 'A0001-00000012', fecha: '2026-09-15',
  total: 99999, neto: 10000, impuestos: [{ concepto: 'IVA 21%', monto: 2100 }], clasificacion: 'venta',
});
// COMPRAS
const c1 = comprobante(db, 1, { // Factura A de proveedor → ENTRA, con alícuota y crédito
  direccion: 'recibida', emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: 'A0001-00000101', fecha: '2026-09-05',
  total: 121000, neto: 100000, impuestos: [{ concepto: 'IVA 21%', monto: 21000 }], clasificacion: 'stock',
});
const c2 = comprobante(db, 1, { // Factura B recibida → ENTRA sin alícuotas (regla de Compras)
  direccion: 'recibida', emisor: 'Lubricantes Andina', emisor_cuit: CUIT_PROV_B,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: 'B0002-00000055', fecha: '2026-09-12',
  total: 60500, neto: 50000, impuestos: [{ concepto: 'IVA 21%', monto: 10500 }], clasificacion: 'gasto',
});
const c3 = comprobante(db, 1, { // sin CUIT del vendedor → FUERA
  direccion: 'recibida', emisor: 'Proveedor Sin Cuit', emisor_cuit: CUIT_PROV_B,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: 'A0004-00000321', fecha: '2026-09-06',
  total: 24200, neto: 20000, impuestos: [{ concepto: 'IVA 21%', monto: 4200 }], clasificacion: 'gasto',
});
db.prepare('UPDATE gesty_comprobantes SET emisor_cuit = ? WHERE id = ?').run('', c3.id);
const c4 = comprobante(db, 1, { // en dólares: sin tipo de cambio en el índice → FUERA
  direccion: 'recibida', emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: 'A0001-00000999', fecha: '2026-09-07', moneda: 'USD',
  total: 121000, neto: 100000, impuestos: [{ concepto: 'IVA 21%', monto: 21000 }], clasificacion: 'gasto',
});
const c5 = comprobante(db, 1, { // un ticket: no es factura → FUERA
  direccion: 'recibida', tipo: 'ticket', emisor: 'Lubricantes Andina', emisor_cuit: CUIT_PROV_B,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: '0002-00000088', fecha: '2026-09-13',
  total: 6050, neto: 5000, impuestos: [{ concepto: 'IVA 21%', monto: 1050 }], clasificacion: 'gasto',
});
const c6 = comprobante(db, 1, { // todavía en revisión → FUERA
  direccion: 'recibida', emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: 'A0005-00000077', fecha: '2026-09-16',
  total: 24200, neto: 20000, impuestos: [{ concepto: 'IVA 21%', monto: 4200 }], clasificacion: 'gasto',
});
db.prepare("UPDATE gesty_comprobantes SET estado_lectura = 'necesita-revision' WHERE id = ?").run(c6.id);
const c7 = comprobante(db, 1, { // el duplicado de c1 → FUERA (el vivo es el original)
  direccion: 'recibida', emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: 'A0001-00000101', fecha: '2026-09-05',
  total: 121000, neto: 100000, impuestos: [{ concepto: 'IVA 21%', monto: 21000 }], clasificacion: 'stock',
});
db.prepare('UPDATE gesty_comprobantes SET duplicado_de = ? WHERE id = ?').run(c1.id, c7.id);

// ---------------------------------------------------------------------------
console.log('— el layout sobre el índice real de la carpeta de G-06');
const carpeta = rep.carpetaDelMes(db, 1, '2026-09');
const gen = formatos.generarLayout('libro-iva-digital', carpeta.indice_comprobantes);
const arch = Object.fromEntries(gen.archivos.map((a) => [a.clave, a]));
const lineas = (a) => (a.contenido ? a.contenido.split('\r\n').filter(Boolean) : []);
const vCbte = lineas(arch['libro-iva-digital:ventas-cbte']);
const vAlic = lineas(arch['libro-iva-digital:ventas-alicuotas']);
const cCbte = lineas(arch['libro-iva-digital:compras-cbte']);
const cAlic = lineas(arch['libro-iva-digital:compras-alicuotas']);
ok('entran 2 ventas y 2 compras; las alícuotas: 2 de ventas y 1 de compras (la B recibida no genera)',
  vCbte.length === 2 && cCbte.length === 2 && vAlic.length === 2 && cAlic.length === 1,
  `v=${vCbte.length} c=${cCbte.length} va=${vAlic.length} ca=${cAlic.length}`);
ok('incluidos: exactamente v1, v2, c1 y c2',
  JSON.stringify([...gen.incluidos].sort((a, b) => a - b)) === JSON.stringify([v1.id, v2.id, c1.id, c2.id].sort((a, b) => a - b)),
  JSON.stringify(gen.incluidos));
const motivoDe = Object.fromEntries(gen.excluidos.map((e) => [e.comprobante_id, e.motivo]));
ok('exclusiones con su motivo, una por papel, ninguna adivinada',
  motivoDe[v3.id] === 'venta-sin-cuit-del-comprador'
  && motivoDe[v4.id] === 'impuesto-no-iva-no-discriminado'
  && motivoDe[v5.id] === 'sin-letra-ni-punto-de-venta'
  && motivoDe[v7.id] === 'varias-alicuotas-sin-neto-por-alicuota'
  && motivoDe[v8.id] === 'no-cierra-neto-iva-total'
  && motivoDe[c3.id] === 'compra-sin-cuit-del-vendedor'
  && motivoDe[c4.id] === 'moneda-sin-tipo-de-cambio'
  && motivoDe[c5.id] === 'tipo-no-es-factura'
  && motivoDe[c6.id] === 'en-revision'
  && motivoDe[c7.id] === 'duplicado-del-original',
  JSON.stringify(motivoDe));

// VENTAS CBTE campo por campo (diseño: longitud 266)
const L1 = vCbte[0];
ok('ventas cbte: longitud exacta del diseño (266) en todos los registros',
  vCbte.every((l) => l.length === 266), vCbte.map((l) => l.length).join(','));
ok('v1 · fecha, tipo por letra, punto de venta y número con su «hasta»',
  F(L1, 1, 8) === '20260908' && F(L1, 9, 11) === '001' && F(L1, 12, 16) === '00001'
  && F(L1, 17, 36) === '00000000000000000009' && F(L1, 37, 56) === F(L1, 17, 36));
ok('v1 · comprador: doc 80 con su CUIT a 20 y la denominación a 30',
  F(L1, 57, 58) === '80' && F(L1, 59, 78) === '00000000027234567891'
  && F(L1, 79, 108) === 'PANADERÍA LA ESPIGA'.padEnd(30));
ok('v1 · importe total y los siete campos que el cierre prueba en cero',
  F(L1, 109, 123) === '000000004840000'
  && [124, 139, 154, 169, 184, 199, 214].every((d) => F(L1, d, d + 14) === CEROS15));
ok('v1 · moneda PES, tipo de cambio 1, una alícuota, código de operación en blanco, otros tributos 0 y su vencimiento',
  F(L1, 229, 231) === 'PES' && F(L1, 232, 241) === '0001000000' && F(L1, 242, 242) === '1'
  && F(L1, 243, 243) === ' ' && F(L1, 244, 258) === CEROS15 && F(L1, 259, 266) === '20260918');
const L2 = vCbte[1];
ok('v2 · la venta B sin CUIT sale sin identificar: doc 99, número 0, leyenda del papel, sin vencimiento',
  F(L2, 9, 11) === '006' && F(L2, 57, 58) === '99' && F(L2, 59, 78) === '00000000000000000000'
  && F(L2, 79, 108) === 'CONSUMIDOR FINAL'.padEnd(30) && F(L2, 242, 242) === '1' && F(L2, 259, 266) === '00000000');
// VENTAS ALÍCUOTAS (longitud 62)
ok('ventas alícuotas: longitud 62 y la fila de v1 con neto, código 0005 (21%) e impuesto',
  vAlic.every((l) => l.length === 62)
  && F(vAlic[0], 1, 3) === '001' && F(vAlic[0], 4, 8) === '00001' && F(vAlic[0], 9, 28) === '00000000000000000009'
  && F(vAlic[0], 29, 43) === '000000004000000' && F(vAlic[0], 44, 47) === '0005' && F(vAlic[0], 48, 62) === '000000000840000',
  vAlic[0]);
// COMPRAS CBTE campo por campo (longitud 325)
const K1 = cCbte[0];
ok('compras cbte: longitud exacta del diseño (325) en todos los registros',
  cCbte.every((l) => l.length === 325), cCbte.map((l) => l.length).join(','));
ok('c1 · fecha, tipo, pv, número, despacho en ceros y vendedor con su CUIT',
  F(K1, 1, 8) === '20260905' && F(K1, 9, 11) === '001' && F(K1, 12, 16) === '00001'
  && F(K1, 17, 36) === '00000000000000000101' && F(K1, 37, 52) === '0000000000000000'
  && F(K1, 53, 54) === '80' && F(K1, 55, 74) === '00000000030123456781'
  && F(K1, 75, 104) === 'REPUESTOS DEL SUR'.padEnd(30));
ok('c1 · total, campos en cero por el cierre, PES, cambio 1, una alícuota y el crédito = impuesto liquidado (sin prorrateo)',
  F(K1, 105, 119) === '000000012100000'
  && [120, 135, 150, 165, 180, 195, 210].every((d) => F(K1, d, d + 14) === CEROS15)
  && F(K1, 225, 227) === 'PES' && F(K1, 228, 237) === '0001000000' && F(K1, 238, 238) === '1'
  && F(K1, 240, 254) === '000000002100000' && F(K1, 255, 269) === CEROS15);
ok('c1 · sin corredor: CUIT emisor en ceros, denominación en blancos, IVA comisión en cero',
  F(K1, 270, 280) === '00000000000' && F(K1, 281, 310) === ' '.repeat(30) && F(K1, 311, 325) === CEROS15);
const K2 = cCbte[1];
ok('c2 · la compra B: cantidad de alícuotas 0 y crédito 0, como mandan las Especificaciones de Compras',
  F(K2, 9, 11) === '006' && F(K2, 238, 238) === '0' && F(K2, 240, 254) === CEROS15
  && F(K2, 105, 119) === '000000006050000');
// COMPRAS ALÍCUOTAS (longitud 84)
ok('compras alícuotas: una sola fila (la de c1), longitud 84, con doc del vendedor, neto, 0005 e impuesto',
  cAlic.length === 1 && cAlic[0].length === 84
  && F(cAlic[0], 29, 30) === '80' && F(cAlic[0], 31, 50) === '00000000030123456781'
  && F(cAlic[0], 51, 65) === '000000010000000' && F(cAlic[0], 66, 69) === '0005' && F(cAlic[0], 70, 84) === '000000002100000',
  cAlic[0]);
// SUMAS DE CONTROL CRUZADAS: el archivo contra el índice.
const sumaCampo = (lineasArr, a, b) => lineasArr.reduce((s, l) => s + Number(F(l, a, b)) / 100, 0);
ok('control cruzado: la suma del campo «importe total» del archivo ES la del índice incluido',
  sumaCampo(vCbte, 109, 123) === arch['libro-iva-digital:ventas-cbte'].control.suma_importe_total
  && arch['libro-iva-digital:ventas-cbte'].control.suma_importe_total === 48400 + 12100
  && sumaCampo(cCbte, 105, 119) === arch['libro-iva-digital:compras-cbte'].control.suma_importe_total
  && arch['libro-iva-digital:compras-cbte'].control.suma_importe_total === 121000 + 60500);
ok('control cruzado: neto e impuesto de las alícuotas cuadran con su control',
  sumaCampo(vAlic, 29, 43) === 50000 && sumaCampo(vAlic, 48, 62) === 10500
  && sumaCampo(cAlic, 51, 65) === 100000 && sumaCampo(cAlic, 70, 84) === 21000);
ok('determinismo: el mismo índice produce exactamente el mismo archivo',
  JSON.stringify(formatos.generarLayout('libro-iva-digital', carpeta.indice_comprobantes).archivos.map((a) => a.contenido))
  === JSON.stringify(gen.archivos.map((a) => a.contenido)));

// ---------------------------------------------------------------------------
console.log('— el sistema destino en el fundamento y el paquete de G-15');
contador.setContador(db, 1, { nombre: 'Estudio Contable Pérez', email: 'estudio@contador.example', formato_carpeta: 'generico', dia_entrega: 5 });
let sis = formatos.getSistemaDestino(db, 1);
ok('sin sistema: estado «sin-definir», declarado vacío', sis.estado === 'sin-definir' && sis.declarado === '');
const errSis = lanza(() => formatos.setSistemaDestino(db, 1, { sistema: 'sistema-que-no-existe' }));
ok('un sistema fuera del registro no entra al fundamento', !!errSis && /no está en el registro/.test(errSis.message));
sis = formatos.setSistemaDestino(db, 1, { sistema: 'libro-iva-digital' });
ok('el sistema se aprende una vez y el perfil de G-15 lo expone',
  sis.estado === 'verificado' && sis.formato.id === 'libro-iva-digital'
  && contador.getContador(db, 1).sistema_destino === 'libro-iva-digital');

const p1 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
const archP1 = (p1.contenido && p1.contenido.archivos_sistema) || [];
ok('el paquete suma los cuatro archivos del layout, generados desde SU índice congelado',
  archP1.length === 4 && archP1.every((a) => a.sistema === 'libro-iva-digital')
  && archP1.find((a) => a.clave === 'libro-iva-digital:ventas-cbte').contenido
     === gen.archivos.find((a) => a.clave === 'libro-iva-digital:ventas-cbte').contenido,
  JSON.stringify(archP1.map((a) => a.clave)));
ok('el paquete declara el layout, su norma y cuántos papeles quedaron fuera',
  p1.contenido.declaraciones.some((d) => /Libro de IVA Digital/.test(d) && /4597/.test(d) && /quedaron fuera 10/.test(d)),
  JSON.stringify(p1.contenido.declaraciones));
const csvP1 = contador.paqueteCSV(db, 1, p1.id);
ok('el CSV de G-15 sigue intacto con el paquete con layout', csvP1.startsWith('fecha;tipo;direccion'));
const archBajada = formatos.archivoDePaquete(db, 1, p1.id, 'libro-iva-digital:compras-cbte');
ok('el archivo se baja del paquete congelado, idéntico al generado',
  archBajada.contenido === gen.archivos.find((a) => a.clave === 'libro-iva-digital:compras-cbte').contenido
  && archBajada.nombre_archivo === 'LIBRO_IVA_DIGITAL_COMPRAS_CBTE.txt');
const errArchAjena = lanza(() => formatos.archivoDePaquete(db, 2, p1.id, 'libro-iva-digital:compras-cbte'));
ok('bajar el archivo del paquete de otra cuenta: no existe para esta cuenta', !!errArchAjena);
const errArchClave = lanza(() => formatos.archivoDePaquete(db, 1, p1.id, 'libro-iva-digital:no-esta'));
ok('una clave que el paquete no trae: rechazada en criollo', !!errArchClave && /no trae ese archivo/.test(errArchClave.message));

// Lo congelado no se mueve: entra un papel nuevo y se rearma —
// la versión 1 conserva SU archivo; la 2 trae el suyo.
const copiaV1 = archP1.find((a) => a.clave === 'libro-iva-digital:ventas-cbte').contenido;
comprobante(db, 1, {
  direccion: 'emitida', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
  numero: 'A0001-00000021', fecha: '2026-09-20',
  total: 24200, neto: 20000, impuestos: [{ concepto: 'IVA 21%', monto: 4200 }], clasificacion: 'venta',
});
const p2 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
const p1Releido = contador.getPaquete(db, 1, p1.id);
ok('congelado: la v1 conserva su archivo (2 registros) y la v2 trae el suyo (3)',
  p1Releido.contenido.archivos_sistema.find((a) => a.clave === 'libro-iva-digital:ventas-cbte').contenido === copiaV1
  && p2.contenido.archivos_sistema.find((a) => a.clave === 'libro-iva-digital:ventas-cbte').registros === 3);

// ---------------------------------------------------------------------------
console.log('— declarado y desconocido: se declara, no se genera');
formatos.setSistemaDestino(db, 1, { sistema: 'tango-gestion' });
const p3 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
ok('sistema declarado: el paquete sale SIN archivos y lo declara, con su requisito',
  !('archivos_sistema' in (p3.contenido || {}))
  && p3.contenido.declaraciones.some((d) => /Tango Gestión/.test(d) && /no es público y verificable/.test(d) && /haría falta/.test(d)),
  JSON.stringify(p3.contenido.declaraciones));
gesty.setData(db, 1, { grupo: 'contador', campo: 'sistema_destino', valor: 'inventado-xyz', origen: 'dueno', origen_ref: 'edicion-directa', cargado_por: 'dueno' });
const p4 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
ok('sistema desconocido en el fundamento: declarado como tal, sin archivo, sin frenar el paquete',
  !('archivos_sistema' in (p4.contenido || {}))
  && p4.contenido.declaraciones.some((d) => /inventado-xyz/.test(d) && /no está en el registro/.test(d)),
  JSON.stringify(p4.contenido.declaraciones));
const sisDesc = formatos.getSistemaDestino(db, 1);
ok('la consulta del sistema desconocido lo declara desconocido', sisDesc.estado === 'desconocido' && sisDesc.declarado === 'inventado-xyz');
const sisLimpio = formatos.setSistemaDestino(db, 1, { sistema: null });
ok('borrar el sistema vuelve a «sin-definir»', sisLimpio.estado === 'sin-definir');

// ---------------------------------------------------------------------------
console.log('— sin sistema: el paquete es exactamente el de G-15 (cuenta 2)');
contador.setContador(db, 2, { nombre: 'Estudio B', email: 'b@contador.example', formato_carpeta: 'generico' });
comprobante(db, 2, {
  direccion: 'recibida', emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A,
  receptor: 'Otro Negocio', receptor_cuit: CUIT_PROPIO,
  numero: 'A0001-00000201', fecha: '2026-09-05',
  total: 121000, neto: 100000, impuestos: [{ concepto: 'IVA 21%', monto: 21000 }], clasificacion: 'stock',
});
const pU2 = contador.armarPaquete(db, 2, { periodo: '2026-09' });
ok('sin sistema destino: ni archivos ni declaraciones de layout — G-15 intacto',
  !('archivos_sistema' in (pU2.contenido || {})) && pU2.contenido.declaraciones.length === 0,
  JSON.stringify(pU2.contenido.declaraciones));
const resumen = formatos.resumenFormatos(db, 2);
ok('resumen para «La oficina»: sistema sin definir y el conteo del registro',
  resumen.sistema_destino.estado === 'sin-definir' && resumen.formatos_verificados === 1 && resumen.formatos_registrados >= 4);

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido con el server booteado');
const PORT = 3989;
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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g26-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let bootLog = '';
child.stdout.on('data', (d) => { bootLog += d; });
child.stderr.on('data', (d) => { bootLog += d; });
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch (e) {}
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  ok('server bootea', up, bootLog.slice(-300));

  const reg = await call('POST', '/api/auth/register', { email: 'g26@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/contador/formatos', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/contador/formatos', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const ponerPack = (pack) => {
    const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
    f.exec('PRAGMA busy_timeout = 5000');
    const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g26@example.com');
    f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, pack);
    f.close();
  };
  ponerPack('esencial');
  const esencial = await call('GET', '/api/gesty/contador/formatos', null, reg.cookie);
  ok('gating http: pack esencial SIN capacidad «reportes» (la de G-15) → 403', esencial.status === 403, String(esencial.status));

  ponerPack('completa');
  const formatosHttp = await call('GET', '/api/gesty/contador/formatos', null, reg.cookie);
  const ivaHttp = (formatosHttp.data.formatos || []).find((f) => f.id === 'libro-iva-digital');
  ok('http: el registro se consulta con el verificado y su fuente; el sistema arranca sin definir',
    formatosHttp.status === 200 && !!ivaHttp && ivaHttp.estado === 'verificado' && /4597/.test(ivaHttp.fuente.norma)
    && formatosHttp.data.sistema_destino.estado === 'sin-definir',
    JSON.stringify(formatosHttp.data).slice(0, 220));
  const putMal = await call('PUT', '/api/gesty/contador/sistema', { sistema: 'no-registrado' }, reg.cookie);
  ok('http: un sistema fuera del registro → 400', putMal.status === 400, String(putMal.status));
  const putHttp = await call('PUT', '/api/gesty/contador/sistema', { sistema: 'libro-iva-digital' }, reg.cookie);
  ok('http: el sistema destino queda en el fundamento',
    putHttp.status === 200 && putHttp.data.sistema_destino.estado === 'verificado',
    JSON.stringify(putHttp.data).slice(0, 200));
  const paqHttp = await call('POST', '/api/gesty/contador/paquetes', { periodo: '2026-09' }, reg.cookie);
  const archHttp = (paqHttp.data.paquete && paqHttp.data.paquete.contenido.archivos_sistema) || [];
  ok('http: el paquete armado por HTTP trae los cuatro archivos del layout (índice vacío: 0 registros)',
    paqHttp.status === 200 && archHttp.length === 4 && archHttp.every((a) => a.registros === 0),
    JSON.stringify(paqHttp.data).slice(0, 220));
  const paqId = paqHttp.data.paquete.id;
  const dl = await fetch(BASE + `/api/gesty/contador/paquetes/${paqId}/archivos/libro-iva-digital:ventas-cbte`, { headers: { Cookie: reg.cookie } });
  ok('http: la descarga del archivo congelado baja como text/plain con su nombre del diseño',
    dl.status === 200 && (dl.headers.get('content-type') || '').includes('text/plain')
    && (dl.headers.get('content-disposition') || '').includes('LIBRO_IVA_DIGITAL_VENTAS_CBTE.txt'),
    `${dl.status} ${dl.headers.get('content-disposition')}`);
  const dlMala = await call('GET', `/api/gesty/contador/paquetes/${paqId}/archivos/clave-que-no-esta`, null, reg.cookie);
  ok('http: una clave que el paquete no trae → 400', dlMala.status === 400, String(dlMala.status));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
