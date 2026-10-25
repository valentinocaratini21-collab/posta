// =====================================================================
// GESTY · G-26 — FORMATOS DEL CONTADOR (layouts de importación)
// Spec: gesty-cola-builds.md G-26 («la carpeta de G-15 suma
// layouts de importación declarados para los sistemas que usan
// los contadores; genérico + por sistema SOLO cuando el layout es
// público y verificable; si no, se declara y se entrega el
// genérico ordenado a su manera»).
//
// QUÉ ES: un REGISTRO de layouts. Cada layout es una
// transformación PURA del índice CONGELADO del paquete de G-15
// (los mismos números de G-06, con otra forma de archivo): no
// lee papeles por su cuenta, no calcula un solo total nuevo —
// reordena y reformatea lo que la carpeta ya cerró. La
// integración con G-15 es la costura de G-20: este módulo se
// registra como proveedor de archivos (registerProveedorArchivos)
// y el paquete, al armarse, incluye el archivo del sistema
// destino del contador CONGELADO en su versión. El sello y el
// envío de G-15 no cambian. El sistema destino vive en el
// fundamento (grupo «contador», campo «sistema_destino») y se
// aprende una vez, como todo el perfil del contador.
//
// =====================================================================
// EL JUICIO SOBRE EL LIBRO DE IVA DIGITAL (layout verificado)
// =====================================================================
// FUENTES PÚBLICAS CONSULTADAS Y CITADAS (octubre 2026):
// · Norma: RG AFIP 4597/2019 — Libro de IVA Digital. Su art. 8°
//   manda que la registración por importación de datos observe
//   los diseños de registro del micrositio oficial.
// · Diseños: AFIP/ARCA, «Diseño de Registro — Libro de IVA
//   Digital» (libro-iva-digital-diseno-registros.pdf): VENTAS_CBTE
//   long. 266 · VENTAS_ALICUOTAS 62 · COMPRAS_CBTE 325 ·
//   COMPRAS_ALICUOTAS 84, campo por campo con posiciones.
// · Reglas: AFIP, «Libro IVA Digital — Especificaciones»
//   (RG 4597, revisión 30/07/2025): el llenado campo por campo.
// · Tablas: ARCA, «Tablas del Sistema»: alícuotas (0003 = 0% ·
//   0004 = 10,5% · 0005 = 21% · 0006 = 27% · 0008 = 5% ·
//   0009 = 2,5%), comprobantes (001 Factura A · 006 B · 011 C ·
//   051 M), documentos (80 = CUIT · 99 = sin identificar),
//   monedas (PES = pesos argentinos).
//
// LO QUE SE AFIRMA Y SE GENERA (con su mapeo declarado):
// · Los cuatro archivos de arriba, registro por registro, con
//   los campos del diseño en sus posiciones exactas (los tests
//   los asertan campo por campo contra papeles sembrados).
// · Fecha AAAAMMDD · tipo por la LETRA parseada del número
//   impreso (el parseo de G-18: letra + punto de venta + número,
//   con evidencia — lo no parseable no se genera) · punto de
//   venta y número con ceros a la izquierda · número «hasta» =
//   número (Especificaciones, campo 5 de Ventas: en el resto de
//   los casos se consigna el dato del campo 4) · documento de la
//   contraparte: 80 con su CUIT cuando el CUIT del papel cierra
//   el checksum módulo 11 de G-03 · importes de 15 posiciones
//   (13 enteros + 2 decimales sin punto) · moneda PES con tipo
//   de cambio 0001000000 (las Especificaciones mandan completarlo
//   aun para PES; en pesos el cambio es 1) · fecha de vencimiento
//   de Ventas con el vencimiento del papel (campo opcional del
//   diseño; sin vencimiento, ceros, como mandan las
//   Consideraciones para los campos opcionales).
// · ALÍCUOTAS: una fila por comprobante con UNA sola alícuota
//   discriminada: neto gravado = monto_neto del papel, impuesto
//   liquidado = el IVA leído del papel, código de alícuota por
//   su tasa — con doble control aritmético (neto × tasa ≈ IVA y
//   neto + IVA = total, al centavo).
// · CRÉDITO FISCAL COMPUTABLE (Compras, campo 21): la regla
//   «sin prorrateo» de las Especificaciones — idéntico al
//   impuesto liquidado total del comprobante. Si el estudio
//   prorratea el período, ese campo es el que ajusta: declarado.
//
// LO QUE NO SE GENERA, Y POR QUÉ (cada exclusión viaja con su
// motivo en el detalle del archivo; nada se rellena adivinando):
// · Los campos en CERO (no gravado, exentas, percepciones,
//   impuestos internos, otros tributos) solo se escriben cuando
//   la aritmética del papel CIERRA (neto + IVA = total al
//   centavo): las Especificaciones mandan que el total sea la
//   suma de todos los importes del comprobante, así que si
//   cierra, no hay otro componente; si no cierra, el papel NO
//   se genera (motivo «no-cierra-neto-iva-total»).
// · Un impuesto que no es la alícuota (percepciones, retenciones)
//   no se genera: el índice de G-03 guarda concepto libre y
//   monto, sin discriminar A QUÉ campo del diseño va cada uno
//   (motivo «impuesto-no-iva-no-discriminado»).
// · Varias alícuotas en un papel: el neto POR alícuota no es un
//   dato del índice (motivo «varias-alicuotas-sin-neto-por-
//   alicuota»). IVA a tasa 0%: el diseño exige un código de
//   operación (E/N/A…) que el papel no afirma (motivo
//   «iva-tasa-cero-sin-codigo-de-operacion»).
// · NOTAS DE CRÉDITO/DÉBITO: G-03 no captura la clase del papel
//   (su tipo es factura-emitida/recibida, sin distinguir factura
//   de nota). Este layout cubre FACTURAS: el código es el de la
//   factura de su letra. Declarado acá y en la ficha: si la
//   carpeta guardara una nota como factura, su código AFIP
//   diferiría — es un hueco de datos de G-03, no de este layout.
// · COMPRAS B/C: las Especificaciones lo afirman DOS veces para
//   compras (campo 19 y la intro de Compras-Alícuotas): los
//   comprobantes que no discriminan IVA llevan cantidad de
//   alícuotas 0 y NO generan filas de alícuotas; su crédito
//   computable es 0. Se aplica tal cual.
// · VENTAS B: INTERPRETACIÓN DOCUMENTADA. La nota general de las
//   Especificaciones («para los comprobantes B o C, cantidad 0»)
//   convive con el texto ESPECÍFICO del campo 19 de Ventas (sin
//   excepción B/C: la cantidad de alícuotas del comprobante) y
//   con el campo 6 de Ventas-Alícuotas («aun tratándose de
//   compradores consumidores finales, igualmente deberá
//   consignarse el IVA contenido»). Este layout sigue el texto
//   específico de Ventas: la B genera su fila con el IVA
//   contenido — es además la única lectura bajo la cual una
//   venta B aporta su débito fiscal. La tensión queda declarada
//   en la ficha del layout, a la vista del estudio.
// · VENTAS C: no se generan. La clase C no discrimina IVA (su
//   emisor no es responsable inscripto) y el código de operación
//   que el diseño pediría no es afirmable desde el papel
//   (motivo «venta-clase-c»).
// · Moneda extranjera: el diseño pide el tipo de cambio de la
//   operación y el índice no lo registra (motivo
//   «moneda-sin-tipo-de-cambio»). Solo PES.
// · Ventas A/M sin CUIT del comprador: en Ventas el CUIT es
//   obligatorio salvo consumidor final, y una A/M nunca es de
//   consumidor final sin identificar (motivo
//   «venta-sin-cuit-del-comprador»). Compras sin CUIT válido del
//   vendedor: en Compras el CUIT es obligatorio en todos los
//   casos (motivo «compra-sin-cuit-del-vendedor»). La venta B
//   sin CUIT sale como sin identificar (doc 99, número 0, y la
//   denominación del papel o la leyenda CONSUMIDOR FINAL que
//   manda el campo 8 de las Especificaciones).
// · Tickets, remitos, recibos y «otros»: sin código afirmable en
//   la tabla (un ticket puede ser tique-factura 081/082 o un
//   papel sin valor fiscal) — fuera (motivo «tipo-no-es-factura»).
// · Archivos TurIVA, Importación de Bienes/Servicios y
//   Comprobantes Anulados: fuera de alcance — Gesty no registra
//   esos regímenes ni la fecha de anulación como dato.
//
// OTROS SISTEMAS: entran al registro como «declarado-sin-
// verificar» (nombre + qué haría falta para verificarlos), sin
// layout generado: el paquete lo declara y entrega el genérico
// ordenado a la manera del contador, como manda la cola.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const contador = require('./gesty-contador');
const comprobantes = require('./gesty-comprobantes');
const huecos = require('./gesty-huecos');

const { parseNumero } = huecos;

// ---------------------------------------------------------------------------
// Utilidades (los patrones de la casa)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

// Importe del diseño: 15 posiciones = 13 enteros + 2 decimales,
// sin punto decimal. Negativo (este generador no los produce:
// se excluyen antes): el signo va en la primera posición de los
// enteros, como mandan las Especificaciones.
function fmtImporte(n) {
  const v = Number(n) || 0;
  const cents = String(Math.round(Math.abs(v) * 100)).padStart(15, '0').slice(-15);
  return v < 0 ? '-' + cents.slice(1) : cents;
}
// 'AAAA-MM-DD' estricto → 'AAAAMMDD'; otra cosa → null.
function fmtFecha8(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normTexto(iso));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return m[1] + m[2] + m[3];
}
// Texto del diseño: mayúsculas, sin caracteres de control, cortado
// y rellenado con blancos a la derecha. El archivo viaja en
// ISO-8859-1 (juego admitido por las Especificaciones).
function fmtTexto(s, len) {
  const t = normTexto(s).toUpperCase().replace(/[\u0000-\u001f\u007f]/g, ' ');
  return t.slice(0, len).padEnd(len, ' ');
}
function padNum(v, len) { return String(v).padStart(len, '0').slice(-len); }

// ---------------------------------------------------------------------------
// EL REGISTRO DE LAYOUTS
// ---------------------------------------------------------------------------

const FUENTE_LIBRO_IVA = {
  norma: 'RG AFIP 4597/2019 — Libro de IVA Digital (art. 8°: la registración por importación de datos observa los diseños de registro publicados en el micrositio oficial)',
  diseno_registros: 'AFIP/ARCA — «Diseño de Registro · Libro de IVA Digital»: VENTAS_CBTE (long. 266), VENTAS_ALICUOTAS (62), COMPRAS_CBTE (325), COMPRAS_ALICUOTAS (84), campo por campo con posiciones — https://www.afip.gob.ar/iva/documentos/libro-iva-digital-diseno-registros.pdf',
  especificaciones: 'AFIP — «Libro IVA Digital · Especificaciones» (RG 4597, revisión 30/07/2025): el llenado campo por campo — https://ftp.afip.gov.ar/iva/documentos/Libro-IVA-Digital-Especificaciones.pdf',
  tablas: 'ARCA — «Tablas del Sistema · Libro IVA Digital»: alícuotas (0003 = 0% · 0004 = 10,5% · 0005 = 21% · 0006 = 27% · 0008 = 5% · 0009 = 2,5%), comprobantes (001 Factura A · 006 Factura B · 011 Factura C · 051 Factura M), documentos (80 = CUIT · 99 = sin identificar), monedas (PES = pesos argentinos) — https://www.arca.gob.ar/libro-iva-digital/documentos/Libro-IVA-Digital-Tablas-del-Sistema.pdf',
};

const ALCANCE_LIBRO_IVA = [
  'Cubre FACTURAS A, B y M de ventas y A, B, C y M de compras, en pesos, con los cuatro archivos del diseño (cabeceras y alícuotas).',
  'G-03 no distingue factura de nota de crédito/débito: el código usado es el de la FACTURA de la letra del papel. Si la carpeta guarda una nota como factura, su código AFIP difiere — hueco de datos declarado, no del layout.',
  'Compras B/C: cantidad de alícuotas 0 y sin filas de alícuotas, como mandan las Especificaciones de Compras; crédito fiscal computable 0 para esos comprobantes.',
  'Ventas B: genera su fila de alícuota con el IVA contenido, por el texto específico de Ventas (campo 19 y campo 6 de Ventas-Alícuotas de las Especificaciones); la nota general «B o C → 0» queda aplicada donde el texto de Compras la afirma.',
  'Crédito fiscal computable = impuesto liquidado (regla «sin prorrateo» de las Especificaciones): si el estudio prorratea el período, ese campo es el que ajusta.',
  'Todo papel que el diseño no puede afirmar desde el índice queda FUERA del archivo, con su motivo en el detalle (percepciones no discriminadas, varias alícuotas, moneda extranjera, CUIT que no cierra, aritmética que no cierra, tipo que no es factura).',
].join(' ');

const REGISTRO = [
  {
    id: 'libro-iva-digital',
    sistema: 'Libro de IVA Digital — ARCA (ex AFIP), importación del Portal IVA',
    estado: 'verificado',
    fuente: FUENTE_LIBRO_IVA,
    alcance: ALCANCE_LIBRO_IVA,
    requisito: null,
    generar: generarLibroIvaDigital,
  },
  {
    id: 'tango-gestion',
    sistema: 'Tango Gestión (Axoft)',
    estado: 'declarado-sin-verificar',
    fuente: null,
    alcance: 'Registrado como sistema habitual de estudios en Argentina, SIN layout generado: no hay un diseño de registro público y normado que citar.',
    requisito: 'la especificación de importación vigente del estudio (Tango importa con layouts que se configuran por empresa) o un archivo de ejemplo ya validado contra su Tango',
    generar: null,
  },
  {
    id: 'xubio',
    sistema: 'Xubio',
    estado: 'declarado-sin-verificar',
    fuente: null,
    alcance: 'Registrado como sistema habitual de estudios en Argentina, SIN layout generado: su importación se hace con plantillas propias de la plataforma, no con un diseño de registro público y normado.',
    requisito: 'la plantilla oficial de importación de comprobantes vigente y un archivo de ejemplo ya importado sin errores por el estudio',
    generar: null,
  },
  {
    id: 'colppy',
    sistema: 'Colppy',
    estado: 'declarado-sin-verificar',
    fuente: null,
    alcance: 'Registrado como sistema habitual de estudios en Argentina, SIN layout generado: su importación se hace con plantillas propias de la plataforma, no con un diseño de registro público y normado.',
    requisito: 'la plantilla oficial de importación de comprobantes vigente y un archivo de ejemplo ya importado sin errores por el estudio',
    generar: null,
  },
];

function fichaPublica(f) {
  return {
    id: f.id, sistema: f.sistema, estado: f.estado,
    fuente: f.fuente || null, alcance: f.alcance || '', requisito: f.requisito || null,
  };
}
function listFormatos() { return REGISTRO.map(fichaPublica); }
function formatoPorId(id) { return REGISTRO.find((f) => f.id === id) || null; }

// ---------------------------------------------------------------------------
// LIBRO DE IVA DIGITAL — la derivación por papel (con evidencia)
// ---------------------------------------------------------------------------

// Tablas del Sistema (verificadas en la fuente citada).
const CODIGO_FACTURA_POR_LETRA = { A: '001', B: '006', C: '011', M: '051' };
const ALICUOTA_POR_TASA = new Map([[0, '0003'], [2.5, '0009'], [5, '0008'], [10.5, '0004'], [21, '0005'], [27, '0006']]);

// Los impuestos del papel, clasificados sin adivinar: una línea
// es «la alícuota» solo si su concepto dice IVA con una tasa de
// la tabla y no es una percepción; cualquier otra línea con
// monto es un impuesto que el índice NO discrimina por campo
// del diseño — y su papel no se genera.
function clasificarImpuestos(impuestos) {
  const iva = [];
  let ivaIlegible = false;
  const noIva = [];
  for (const imp of impuestos || []) {
    const concepto = normTexto(imp && imp.concepto);
    const monto = imp && imp.monto !== null && imp.monto !== undefined ? Number(imp.monto) : null;
    if (monto === null || Number.isNaN(monto) || monto === 0) continue;
    const up = concepto.toUpperCase();
    if (/\bIVA\b/.test(up) && !/PERCEP|RETEN/.test(up)) {
      const m = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(up);
      const tasa = m ? Number(m[1].replace(',', '.')) : NaN;
      if (m && ALICUOTA_POR_TASA.has(tasa)) iva.push({ tasa, monto });
      else ivaIlegible = true;
    } else {
      noIva.push({ concepto: concepto || '(sin concepto)', monto });
    }
  }
  return { iva, ivaIlegible, noIva };
}

// Un papel del índice → el registro derivado, o su exclusión con
// motivo. Cada regla cita su porqué en la cabecera del módulo.
function derivar(c) {
  const no = (motivo) => ({ ok: false, id: c.id, motivo });
  if (c.duplicado_de) return no('duplicado-del-original');
  if (c.estado_lectura !== 'leido') return no('en-revision');
  const lado = c.tipo === 'factura-emitida' ? 'ventas' : c.tipo === 'factura-recibida' ? 'compras' : null;
  if (!lado) return no('tipo-no-es-factura');
  const fecha8 = fmtFecha8(c.fecha);
  if (!fecha8) return no('fecha-no-legible');
  const p = parseNumero(c.numero);
  if (!p) return no('numero-no-parseable');
  if (!p.letra) return no('sin-letra-ni-punto-de-venta');
  if (p.punto_venta === null || p.punto_venta === undefined) return no('sin-punto-de-venta');
  const letra = String(p.letra).toUpperCase();
  if (!CODIGO_FACTURA_POR_LETRA[letra]) return no('letra-no-cubierta');
  const moneda = normTexto(c.moneda).toUpperCase();
  if (moneda && !['ARS', 'PES', '$', 'PESOS'].includes(moneda)) return no('moneda-sin-tipo-de-cambio');
  const total = c.monto_total === null || c.monto_total === undefined ? null : Number(c.monto_total);
  if (total === null || Number.isNaN(total)) return no('sin-monto-total');
  if (total < 0) return no('monto-negativo');
  const imp = clasificarImpuestos(c.impuestos);
  if (imp.ivaIlegible) return no('iva-sin-tasa-legible');
  if (imp.noIva.length) return no('impuesto-no-iva-no-discriminado');

  const contraparte = lado === 'ventas' ? c.receptor : c.emisor;
  const cuitCp = normTexto(contraparte && contraparte.cuit).replace(/\D/g, '');
  const cuitOk = cuitCp.length === 11 && comprobantes.cuitChecksumOk(cuitCp);
  let doc; let idDoc; let nombre;
  if (lado === 'compras') {
    if (!cuitOk) return no('compra-sin-cuit-del-vendedor');
    doc = '80'; idDoc = cuitCp; nombre = (contraparte && contraparte.nombre) || '';
  } else {
    if (letra === 'C') return no('venta-clase-c');
    if (cuitOk) { doc = '80'; idDoc = cuitCp; nombre = (contraparte && contraparte.nombre) || ''; }
    else if (letra === 'B') { doc = '99'; idDoc = ''; nombre = (contraparte && contraparte.nombre) || 'CONSUMIDOR FINAL'; }
    else return no('venta-sin-cuit-del-comprador');
  }

  const base = {
    ok: true, id: c.id, lado, letra,
    tipoCod: CODIGO_FACTURA_POR_LETRA[letra],
    pv: p.punto_venta, numero: p.numero, fecha8, doc, idDoc, nombre, total,
    vencimiento8: fmtFecha8(c.vencimiento) || '00000000',
  };
  // Compras B/C: el diseño de Compras las afirma sin alícuotas.
  if (lado === 'compras' && (letra === 'B' || letra === 'C')) {
    return { ...base, neto: null, ivaTotal: 0, tasa: null, filas: 0 };
  }
  const neto = c.monto_neto === null || c.monto_neto === undefined ? null : Number(c.monto_neto);
  if (neto === null || Number.isNaN(neto)) return no('sin-monto-neto');
  if (neto < 0) return no('monto-negativo');
  const ivaTotal = round2(imp.iva.reduce((a, i) => a + i.monto, 0));
  const tasas = [...new Set(imp.iva.map((i) => i.tasa))];
  if (!tasas.length) return no(lado === 'ventas' ? 'venta-sin-iva-discriminado' : 'compra-sin-iva-discriminado');
  if (tasas.length > 1) return no('varias-alicuotas-sin-neto-por-alicuota');
  const tasa = tasas[0];
  if (tasa === 0) return no('iva-tasa-cero-sin-codigo-de-operacion');
  if (Math.abs(round2(neto * tasa / 100) - ivaTotal) > 1) return no('iva-no-cuadra-con-el-neto');
  // El cierre: SOLO si neto + IVA = total al centavo, los demás
  // campos de importes del diseño son cero de verdad.
  if (Math.abs(round2(neto + ivaTotal) - total) > 0.011) return no('no-cierra-neto-iva-total');
  return { ...base, neto, ivaTotal, tasa, filas: 1 };
}

// Los constructores de línea: las posiciones EXACTAS del diseño.
function lineaVentasCbte(d) {
  return [
    d.fecha8, d.tipoCod, padNum(d.pv, 5), padNum(d.numero, 20), padNum(d.numero, 20),
    d.doc, padNum(d.idDoc, 20), fmtTexto(d.nombre, 30),
    fmtImporte(d.total),
    fmtImporte(0), fmtImporte(0), fmtImporte(0), fmtImporte(0), fmtImporte(0), fmtImporte(0), fmtImporte(0),
    'PES', '0001000000', String(d.filas), ' ', fmtImporte(0), d.vencimiento8,
  ].join('');
}
function lineaVentasAlicuotas(d) {
  return [
    d.tipoCod, padNum(d.pv, 5), padNum(d.numero, 20),
    fmtImporte(d.neto), ALICUOTA_POR_TASA.get(d.tasa), fmtImporte(d.ivaTotal),
  ].join('');
}
function lineaComprasCbte(d) {
  return [
    d.fecha8, d.tipoCod, padNum(d.pv, 5), padNum(d.numero, 20), '0'.repeat(16),
    d.doc, padNum(d.idDoc, 20), fmtTexto(d.nombre, 30),
    fmtImporte(d.total),
    fmtImporte(0), fmtImporte(0), fmtImporte(0), fmtImporte(0), fmtImporte(0), fmtImporte(0), fmtImporte(0),
    'PES', '0001000000', String(d.filas), ' ',
    fmtImporte(d.filas ? d.ivaTotal : 0), fmtImporte(0),
    '0'.repeat(11), ' '.repeat(30), fmtImporte(0),
  ].join('');
}
function lineaComprasAlicuotas(d) {
  return [
    d.tipoCod, padNum(d.pv, 5), padNum(d.numero, 20),
    d.doc, padNum(d.idDoc, 20),
    fmtImporte(d.neto), ALICUOTA_POR_TASA.get(d.tasa), fmtImporte(d.ivaTotal),
  ].join('');
}

// La transformación pura: índice congelado → los cuatro archivos
// + incluidos/excluidos con motivo. Sin base, sin reloj, sin
// azar: el mismo índice produce el mismo archivo, siempre.
function generarLibroIvaDigital(indice) {
  const derivados = [];
  const excluidos = [];
  for (const c of indice || []) {
    const d = derivar(c);
    if (d.ok) derivados.push(d);
    else excluidos.push({ comprobante_id: c.id, motivo: d.motivo });
  }
  const ventas = derivados.filter((d) => d.lado === 'ventas');
  const compras = derivados.filter((d) => d.lado === 'compras');
  const suma = (arr, f) => round2(arr.reduce((a, d) => a + f(d), 0));
  const armarArchivo = (clave, nombreArchivo, lineas, fuentes, control) => ({
    clave, nombre_archivo: nombreArchivo,
    contenido: lineas.length ? lineas.join('\r\n') + '\r\n' : '',
    registros: lineas.length,
    comprobantes: fuentes.map((d) => d.id),
    control,
  });
  const archivos = [
    armarArchivo('libro-iva-digital:ventas-cbte', 'LIBRO_IVA_DIGITAL_VENTAS_CBTE.txt',
      ventas.map(lineaVentasCbte), ventas,
      { suma_importe_total: suma(ventas, (d) => d.total) }),
    armarArchivo('libro-iva-digital:ventas-alicuotas', 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS.txt',
      ventas.filter((d) => d.filas).map(lineaVentasAlicuotas), ventas.filter((d) => d.filas),
      { suma_neto_gravado: suma(ventas, (d) => d.neto || 0), suma_impuesto_liquidado: suma(ventas, (d) => d.ivaTotal) }),
    armarArchivo('libro-iva-digital:compras-cbte', 'LIBRO_IVA_DIGITAL_COMPRAS_CBTE.txt',
      compras.map(lineaComprasCbte), compras,
      { suma_importe_total: suma(compras, (d) => d.total) }),
    armarArchivo('libro-iva-digital:compras-alicuotas', 'LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS.txt',
      compras.filter((d) => d.filas).map(lineaComprasAlicuotas), compras.filter((d) => d.filas),
      { suma_neto_gravado: suma(compras.filter((d) => d.filas), (d) => d.neto || 0), suma_impuesto_liquidado: suma(compras.filter((d) => d.filas), (d) => d.ivaTotal) }),
  ];
  return { archivos, incluidos: derivados.map((d) => d.id), excluidos };
}

// Generar un layout por id desde un índice (consulta y tests):
// solo los verificados generan; el resto se declara, no se finge.
function generarLayout(sistemaId, indice) {
  const f = formatoPorId(String(sistemaId || ''));
  if (!f) fail(`Ese sistema no está en el registro de formatos: ${sistemaId}.`);
  if (f.estado !== 'verificado' || typeof f.generar !== 'function') {
    fail(`El sistema «${f.sistema}» está declarado sin verificar: no genera layout. Se entrega el genérico ordenado a su manera.`);
  }
  return f.generar(indice || []);
}

// ---------------------------------------------------------------------------
// EL SISTEMA DESTINO EN EL FUNDAMENTO (grupo «contador»)
// ---------------------------------------------------------------------------

function getSistemaDestino(db, userId) {
  contador.ensureSchema(db);
  const perfil = contador.getContador(db, userId);
  const raw = normTexto(perfil.sistema_destino || '');
  if (!raw) return { declarado: '', estado: 'sin-definir', formato: null };
  const f = formatoPorId(raw);
  if (!f) return { declarado: raw, estado: 'desconocido', formato: null };
  return { declarado: raw, estado: f.estado, formato: fichaPublica(f) };
}

function setSistemaDestino(db, userId, datos, opts) {
  contador.ensureSchema(db);
  const d = datos || {};
  const raw = d.sistema === undefined || d.sistema === null ? '' : normTexto(d.sistema);
  let valor = null;
  if (raw) {
    const f = formatoPorId(raw);
    if (!f) fail(`Ese sistema no está en el registro de formatos: ${raw}. Registrados: ${REGISTRO.map((x) => x.id).join(', ')}.`);
    valor = f.id;
  }
  gesty.setData(db, userId, {
    grupo: 'contador', campo: 'sistema_destino', valor,
    origen: 'dueno', origen_ref: 'formatos-contador', cargado_por: 'dueno', confirmado: true,
  });
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'contador', entidad_id: 'perfil',
    tipo_evento: 'sistema-contador-actualizado',
    resumen: valor
      ? `Sistema destino del contador: ${valor} — los paquetes suman su layout si está verificado.`
      : 'Sistema destino del contador borrado: los paquetes salen sin archivo de sistema.',
    payload: { sistema: valor },
  });
  return getSistemaDestino(db, userId);
}

// Un archivo de sistema YA CONGELADO en un paquete (la descarga
// y el portal leen esto: lo que se aprobó es lo que se baja).
function archivoDePaquete(db, userId, paqueteId, clave) {
  const p = contador.getPaquete(db, userId, paqueteId);
  if (!p) fail('Ese paquete no es de esta cuenta.');
  const a = ((p.contenido && p.contenido.archivos_sistema) || []).find((x) => x.clave === String(clave || ''));
  if (!a) fail('Ese paquete no trae ese archivo de sistema: los archivos se generan al armarlo, con el sistema destino cargado en el fundamento.');
  return a;
}

// Resumen para «La oficina»: el sistema destino y su estado, sin
// prometer de más (un declarado se muestra como declarado).
function resumenFormatos(db, userId) {
  const sis = getSistemaDestino(db, userId);
  return {
    sistema_destino: sis,
    formatos_registrados: REGISTRO.length,
    formatos_verificados: REGISTRO.filter((f) => f.estado === 'verificado').length,
  };
}

// ---------------------------------------------------------------------------
// EL PROVEEDOR PARA G-15: al armar el paquete, el sistema destino
// manda. Sin sistema → null (el paquete es exactamente el de
// siempre). Declarado o desconocido → solo la declaración.
// Verificado → los archivos, congelados, con su declaración.
// ---------------------------------------------------------------------------

function proveedorArchivos(db, userId, ctx) {
  const perfil = (ctx && ctx.perfil) || {};
  const raw = normTexto(perfil.sistema_destino || '');
  if (!raw) return null;
  const f = formatoPorId(raw);
  if (!f) {
    return {
      archivos: [],
      declaraciones: [`El fundamento nombra un sistema destino («${raw}») que no está en el registro de formatos de Gesty: el paquete sale sin archivo de sistema, con el formato de carpeta de siempre.`],
    };
  }
  if (f.estado !== 'verificado' || typeof f.generar !== 'function') {
    return {
      archivos: [],
      declaraciones: [`Tu contador declaró que usa ${f.sistema}: su layout de importación no es público y verificable, así que el paquete sale con el formato de carpeta elegido y SIN archivo de sistema. Para verificarlo haría falta ${f.requisito}.`],
    };
  }
  const gen = f.generar((ctx.contenido && ctx.contenido.indice) || []);
  const motivos = [...new Set(gen.excluidos.map((e) => e.motivo))];
  return {
    archivos: gen.archivos.map((a) => ({ sistema: f.id, ...a })),
    declaraciones: [`Formato de sistema: ${f.sistema}. Los archivos de importación se generaron desde el índice congelado de este paquete según el diseño de registro público (${f.fuente.norma}). Entraron ${gen.incluidos.length} comprobante(s) y quedaron fuera ${gen.excluidos.length}${gen.excluidos.length ? ` — motivos: ${motivos.join(' · ')}` : ''}; el detalle por papel viaja en cada archivo generado.`],
  };
}
contador.registerProveedorArchivos(proveedorArchivos);

module.exports = {
  // el registro (consulta)
  listFormatos, fichaPublica, REGISTRO,
  // el layout verificado: generación pura + por id
  generarLibroIvaDigital, generarLayout,
  // el sistema destino en el fundamento
  getSistemaDestino, setSistemaDestino,
  // el archivo congelado del paquete + resumen
  archivoDePaquete, resumenFormatos,
  // piezas internas, exportadas para tests
  derivarRegistro: derivar, clasificarImpuestos,
};
