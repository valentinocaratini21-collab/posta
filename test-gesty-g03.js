#!/usr/bin/env node
// test-gesty-g03.js — G-03 · COMPROBANTES (el motor de papeles de
// Gesty). Spec: gesty-build-spec.md §4/§7/§12, gesty-areas-detalle.md
// §7, gesty-cola-builds.md G-03, vara de experiencia §5.
// Cubre: ingesta por subida → lectura → archivo feliz · dedupe
// (emisor+tipo+número+CUIT: el duplicado se guarda, marcado) · campo
// con baja confianza → necesita-revision con la pregunta única por
// SOLO ese dato (+ su corrección) · propuestas al fundamento con
// origen comprobante sin pisar lo existente ni sobrescribir datos
// fiscales · ingesta por email · registro manual asistido · sin
// modelo = papel guardado, nunca perdido · separación por cuenta ·
// gating (sin pack 403 / sin capacidad 403 / sin sesión 401) ·
// filtros de consulta de Papeles.
// Unidad del módulo (DB :memory:, extractor falso inyectado — el
// patrón de fuente inyectada de la casa) + wiring estático + flujo
// HTTP con el server booteado. Uso: node test-gesty-g03.js
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

const gesty = require('./gesty.js');
const comp = require('./gesty-comprobantes.js');

const CUIT_PROPIO = '20123456786';       // Refrigeración Sosa (checksum válido)
const CUIT_PROVEEDOR = '30123456781';    // Repuestos del Sur S.A.
const CUIT_CLIENTE = '27234567891';      // Panadería La Espiga
const CUIT_OTRO_PROV = '30567890127';    // Fletes Andina

const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g03-media-'));
comp.configure({ mediaDir: MEDIA_TMP, apiKeyFor: () => '' });

// Extractor falso: decide por el contenido del buffer (determinista,
// sin red). Devuelve null cuando el «papel» no trae marca legible.
const CONF_ALTA = { tipo: 0.98, emisor_nombre: 0.97, emisor_cuit: 0.99, receptor_nombre: 0.96, receptor_cuit: 0.99, numero: 0.98, fecha: 0.97, vencimiento: 0.9, monto_total: 0.98, monto_neto: 0.95, cae: 0.9, clasificacion_sugerida: 0.9 };
function extractorFalso({ buffer }) {
  const t = buffer ? buffer.toString('utf8', 0, 400) : '';
  if (t.includes('FACTURA-PROVEEDOR')) {
    return {
      tipo: 'factura', emisor_nombre: 'Repuestos del Sur S.A.', emisor_cuit: CUIT_PROVEEDOR,
      receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
      numero: '0003-00001234', fecha: '2026-10-05', vencimiento: '2026-11-04', moneda: 'ARS',
      monto_total: 185000, monto_neto: 153000, impuestos: [{ concepto: 'IVA 21%', monto: 32000 }],
      cae: '74123456789012', concepto: 'Compra de repuestos', clasificacion_sugerida: 'gasto',
      confianza: { ...CONF_ALTA }, _via: 'vision',
    };
  }
  if (t.includes('FACTURA-BAJA')) {
    return {
      tipo: 'factura', emisor_nombre: 'Fletes Andina', emisor_cuit: CUIT_OTRO_PROV,
      receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
      numero: '0001-00000077', fecha: '2026-10-07', vencimiento: '', moneda: 'ARS',
      monto_total: 42000, monto_neto: null, impuestos: [], cae: '',
      concepto: 'Flete de mercadería', clasificacion_sugerida: 'gasto',
      confianza: { ...CONF_ALTA, monto_total: 0.3 }, _via: 'vision',
    };
  }
  if (t.includes('FACTURA-EMITIDA')) {
    return {
      tipo: 'factura', emisor_nombre: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
      receptor_nombre: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
      numero: '0001-00000042', fecha: '2026-10-06', vencimiento: '2026-10-21', moneda: 'ARS',
      monto_total: 925000, monto_neto: 764463, impuestos: [{ concepto: 'IVA 21%', monto: 160537 }],
      cae: '74123456789099', concepto: 'Instalación de cámara frigorífica — seña 50%', clasificacion_sugerida: 'venta',
      confianza: { ...CONF_ALTA }, _via: 'vision',
    };
  }
  if (t.includes('TICKET-SERVICIO')) {
    return {
      tipo: 'ticket', emisor_nombre: 'Edesur S.A.', emisor_cuit: '',
      receptor_nombre: '', receptor_cuit: '',
      numero: '', fecha: '2026-10-03', vencimiento: '2026-10-17', moneda: 'ARS',
      monto_total: 84300, monto_neto: null, impuestos: [], cae: '',
      concepto: 'Servicio de energía eléctrica del taller', clasificacion_sugerida: 'gasto',
      confianza: { ...CONF_ALTA, numero: 0 }, _via: 'vision',
    };
  }
  return null;
}
comp.registerExtractor(extractorFalso);

function dbConPack(pack) {
  const db = nuevaDb();
  gesty.initGesty(db);
  comp.ensureSchema(db);
  gesty.setPack(db, 1, pack, { origen: 'checkout', actor: 'sistema' });
  return db;
}

(async () => {
// ---------------- Ingesta feliz: subida → lectura → archivo ----------------
console.log('— ingesta por subida: camino feliz');
{
  const db = dbConPack('esencial');
  const r = await comp.ingestUpload(db, 1, { buffer: Buffer.from('FACTURA-PROVEEDOR foto del papel'), contentType: 'image/jpeg', nombreArchivo: 'factura-repuestos.jpg' });
  const c = r.comprobante;
  ok('feliz: el comprobante queda LEÍDO sin corrección', c.estado_lectura === 'leido', c.estado_lectura);
  ok('feliz: tipo factura-recibida (el receptor es el negocio)', c.tipo === 'factura-recibida', c.tipo);
  ok('feliz: emisor, número, fecha y monto extraídos', c.emisor.nombre === 'Repuestos del Sur S.A.' && c.numero === '0003-00001234' && c.fecha === '2026-10-05' && c.monto_total === 185000);
  ok('feliz: impuestos discriminados guardados', Array.isArray(c.impuestos) && c.impuestos.length === 1 && c.impuestos[0].monto === 32000);
  ok('feliz: CAE impreso queda registrado', c.cae === '74123456789012');
  ok('feliz: clasificado gasto por regla auditada', c.clasificacion === 'gasto' && c.extraccion.clasificacion_regla === 'sugerencia-del-modelo', c.extraccion.clasificacion_regla);
  ok('feliz: el archivo quedó guardado en la infra de medios', !!c.archivo.path && fs.existsSync(path.join(MEDIA_TMP, path.basename(c.archivo.path))));
  ok('feliz: cada campo guardó su confianza', c.extraccion.campos.monto_total.confianza === 0.98 && c.extraccion.via === 'vision');
  const evs = gesty.listEvents(db, 1, { entidad_tipo: 'comprobante', entidad_id: String(c.id) }).map((e) => e.tipo_evento);
  ok('feliz: el registro cuenta la historia (registrado → leído)', evs.includes('comprobante-registrado') && evs.includes('comprobante-leido'), evs.join(','));
  ok('feliz: sin campos dudosos ni pregunta', c.campos_dudosos.length === 0 && c.pregunta === null);

  // La propuesta al fundamento: el proveedor nace de este papel.
  const provs = gesty.getData(db, 1, { grupo: 'proveedores' });
  ok('fundamento: el proveedor nació del comprobante', provs.length === 1 && provs[0].origen === 'comprobante' && provs[0].origen_ref === String(c.id), JSON.stringify(provs).slice(0, 160));
  ok('fundamento: el dato del proveedor guarda nombre y último monto', provs[0].valor.nombre === 'Repuestos del Sur S.A.' && provs[0].valor.ultimo_monto === 185000);
  ok('fundamento: proponer está en las propuestas devueltas', r.propuestas.includes(`proveedores:cuit_${CUIT_PROVEEDOR}`), r.propuestas.join(','));
  db.close();
}

// ---------------- Dedupe ----------------
console.log('— dedupe: mismo emisor + tipo + número + CUIT');
{
  const db = dbConPack('completa');
  const r1 = await comp.ingestUpload(db, 1, { buffer: Buffer.from('FACTURA-PROVEEDOR primera'), contentType: 'image/jpeg', nombreArchivo: 'a.jpg' });
  const r2 = await comp.ingestUpload(db, 1, { buffer: Buffer.from('FACTURA-PROVEEDOR la misma, foto repetida'), contentType: 'image/jpeg', nombreArchivo: 'b.jpg' });
  ok('dedupe: el segundo ingreso se detecta como duplicado', r2.duplicado === true && r2.comprobante.duplicado_de === r1.comprobante.id);
  ok('dedupe: el duplicado se GUARDA marcado (nunca se descarta)', r2.comprobante.estado_lectura === 'duplicado');
  const lista = comp.listComprobantes(db, 1, {});
  ok('dedupe: la consulta muestra UN solo registro vivo', lista.total === 1 && lista.comprobantes[0].id === r1.comprobante.id);
  const conDupes = comp.listComprobantes(db, 1, { incluir_duplicados: true });
  ok('dedupe: conteo de entrada = conteo registrado (2 entradas, 2 filas)', conDupes.total === 2);
  const evsDup = gesty.listEvents(db, 1, { entidad_tipo: 'comprobante', entidad_id: String(r2.comprobante.id) }).map((e) => e.tipo_evento);
  ok('dedupe: el duplicado queda asentado en el registro', evsDup.includes('comprobante-duplicado'), evsDup.join(','));
  ok('dedupe: el duplicado no vuelve a proponer al fundamento', gesty.getData(db, 1, { grupo: 'proveedores' }).length === 1 && r2.propuestas.length === 0);
  const r3 = await comp.ingestUpload(db, 1, { buffer: Buffer.from('TICKET-SERVICIO luz'), contentType: 'image/jpeg', nombreArchivo: 'luz.jpg' });
  ok('dedupe: un papel distinto (sin número) no se marca duplicado', r3.duplicado === false && r3.comprobante.estado_lectura === 'leido');
  db.close();
}

// ---------------- Baja confianza → pregunta única → corrección ----------------
console.log('— revisión: la pregunta pide SOLO el dato dudoso');
{
  const db = dbConPack('esencial');
  const r = await comp.ingestUpload(db, 1, { buffer: Buffer.from('FACTURA-BAJA foto borrosa'), contentType: 'image/jpeg', nombreArchivo: 'flete.jpg' });
  const c = r.comprobante;
  ok('revisión: monto flojo → necesita-revision', c.estado_lectura === 'necesita-revision', c.estado_lectura);
  ok('revisión: SOLO el monto es dudoso (fecha/emisor/número firmes)', JSON.stringify(c.campos_dudosos) === JSON.stringify(['monto_total']), c.campos_dudosos.join(','));
  ok('revisión: la pregunta es por el monto, una sola', !!c.pregunta && c.pregunta.campo === 'monto_total' && /monto/i.test(c.pregunta.texto));
  const preguntas = gesty.listEvents(db, 1, { entidad_tipo: 'comprobante', entidad_id: String(c.id) }).filter((e) => e.tipo_evento === 'pregunta-hecha');
  ok('revisión: la pregunta quedó en el registro con su campo', preguntas.length === 1 && preguntas[0].payload.campo === 'monto_total');
  ok('revisión: el papel quedó guardado (nunca perdido)', !!comp.getComprobante(db, 1, c.id) && fs.existsSync(path.join(MEDIA_TMP, path.basename(c.archivo.path))));

  const corr = comp.corregirComprobante(db, 1, c.id, { monto_total: 43500 }, { actor: 'dueno' });
  ok('corrección: respondido el dato, el comprobante queda LEÍDO', corr.comprobante.estado_lectura === 'leido' && corr.comprobante.monto_total === 43500);
  ok('corrección: el campo corregido queda con confianza plena', corr.comprobante.extraccion.campos.monto_total.confianza === 1);
  const evs = gesty.listEvents(db, 1, { entidad_tipo: 'comprobante', entidad_id: String(c.id) }).map((e) => e.tipo_evento);
  ok('corrección: pregunta-respondida y comprobante-corregido en el registro', evs.includes('pregunta-respondida') && evs.includes('comprobante-corregido'), evs.join(','));
  ok('corrección: solo el dueño corrige', !!lanza(() => comp.corregirComprobante(db, 1, c.id, { monto_total: 1 }, { actor: 'gesty' })));
  db.close();
}

// ---------------- Fundamento: propuestas que no pisan ----------------
console.log('— fundamento: proponer sin pisar (y fiscal jamás sobrescrito)');
{
  const db = dbConPack('completa');
  // El dueño ya declaró sus datos fiscales y su proveedor habitual.
  gesty.setData(db, 1, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'ajustes', cargado_por: 'dueno' });
  gesty.setData(db, 1, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Sosa Martín — Refrigeración Sosa', origen: 'dueno', origen_ref: 'ajustes', cargado_por: 'dueno' });
  gesty.setData(db, 1, { grupo: 'proveedores', campo: `cuit_${CUIT_PROVEEDOR}`, valor: { nombre: 'Repuestos del Sur (ficha del dueño)', condicion: 'cuenta corriente 30 días' }, origen: 'dueno', origen_ref: 'ajustes', cargado_por: 'dueno' });

  const r = await comp.ingestUpload(db, 1, { buffer: Buffer.from('FACTURA-EMITIDA a la panadería'), contentType: 'image/jpeg', nombreArchivo: 'emitida.jpg' });
  ok('emitida: el emisor es el negocio → factura-emitida, venta', r.comprobante.tipo === 'factura-emitida' && r.comprobante.clasificacion === 'venta');
  const rs = gesty.getData(db, 1, { grupo: 'datos-fiscales' }).find((d) => d.campo === 'razon_social');
  ok('fiscal: la razón social del dueño NO la pisa el papel', rs.valor === 'Sosa Martín — Refrigeración Sosa', String(rs.valor));
  const cuit = gesty.getData(db, 1, { grupo: 'datos-fiscales' }).find((d) => d.campo === 'cuit');
  ok('fiscal: el CUIT del dueño queda intacto', cuit.valor === CUIT_PROPIO && cuit.origen === 'dueno');
  const clientes = gesty.getData(db, 1, { grupo: 'clientes-facturacion' });
  ok('fundamento: el cliente de la factura emitida nació del papel', clientes.length === 1 && clientes[0].valor.nombre === 'Panadería La Espiga' && clientes[0].origen === 'comprobante');

  await comp.ingestUpload(db, 1, { buffer: Buffer.from('FACTURA-PROVEEDOR otra'), contentType: 'image/jpeg', nombreArchivo: 'otra.jpg' });
  const prov = gesty.getData(db, 1, { grupo: 'proveedores' }).find((d) => d.campo === `cuit_${CUIT_PROVEEDOR}`);
  ok('fundamento: la ficha del proveedor del dueño NO se sobrescribe con el papel', prov.valor.nombre === 'Repuestos del Sur (ficha del dueño)' && prov.origen === 'dueno');
  db.close();

  // Sin dato fiscal previo: la dirección de una factura subida no se
  // puede saber desde el papel (la dirección sale del cruce con el
  // CUIT propio) → no se adivina: queda recibida, que es el papel que
  // un negocio archiva. El dato fiscal propio nace del primer
  // comprobante emitido CUANDO hay señal de dirección — acá, el
  // registro manual asistido que la declara (build-spec §3.3/§7.4):
  // crear no es sobrescribir.
  const db2 = dbConPack('esencial');
  const subida2 = await comp.ingestUpload(db2, 1, { buffer: Buffer.from('FACTURA-EMITIDA primera'), contentType: 'image/jpeg', nombreArchivo: 'primera.jpg' });
  ok('fiscal: sin CUIT propio cargado, la dirección NO se adivina (queda recibida)', subida2.comprobante.tipo === 'factura-recibida' && gesty.getData(db2, 1, { grupo: 'datos-fiscales' }).length === 0, subida2.comprobante.tipo);
  comp.registrarManual(db2, 1, {
    tipo: 'factura', direccion: 'emitida', emisor_nombre: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
    receptor_nombre: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
    numero: '0001-00000042', fecha: '2026-10-06', monto_total: 925000, moneda: 'ARS',
  });
  const fiscal2 = gesty.getData(db2, 1, { grupo: 'datos-fiscales' });
  ok('fiscal: sin dato previo, el CUIT propio nace del primer comprobante emitido (con dirección declarada)', fiscal2.some((d) => d.campo === 'cuit' && d.valor === CUIT_PROPIO && d.origen === 'comprobante'), JSON.stringify(fiscal2).slice(0, 140));
  db2.close();
}

// ---------------- Ingesta por email ----------------
console.log('— ingesta por email (lector existente, mensaje normalizado)');
{
  const db = dbConPack('esencial');
  const facturaB64 = Buffer.from('FACTURA-PROVEEDOR adjunta del mail').toString('base64');
  const ticketB64 = Buffer.from('TICKET-SERVICIO adjunto del mail').toString('base64');
  const r = await comp.ingestEmail(db, 1, {
    de: 'facturacion@repuestosdelsur.example', asunto: 'Su factura',
    adjuntos: [
      { nombre: 'factura.jpg', content_type: 'image/jpeg', datos_base64: facturaB64 },
      { nombre: 'luz.jpg', content_type: 'image/jpeg', datos_base64: ticketB64 },
    ],
  });
  ok('email: cada adjunto papel entra al registro', r.comprobantes.length === 2 && r.comprobantes.every((c) => c.origen === 'email'));
  ok('email: la factura del mail quedó leída y clasificada', r.comprobantes[0].estado_lectura === 'leido' && r.comprobantes[0].clasificacion === 'gasto');
  const sinAdj = await comp.ingestEmail(db, 1, { de: 'x@y.example', asunto: 'hola', adjuntos: [] });
  ok('email: un mensaje sin adjuntos no crea nada (y lo dice)', sinAdj.comprobantes.length === 0);
  ok('email: conteo — entraron 2 papeles y hay 2 registros vivos', comp.listComprobantes(db, 1, {}).total === 2);
  db.close();
}

// ---------------- Manual asistido + sin modelo ----------------
console.log('— registro manual asistido y lectura sin modelo');
{
  const db = dbConPack('esencial');
  const completo = comp.registrarManual(db, 1, {
    tipo: 'factura', direccion: 'recibida', emisor_nombre: 'Pinturería Centro', emisor_cuit: CUIT_OTRO_PROV,
    numero: '0002-00000321', fecha: '2026-10-08', monto_total: 67000, moneda: 'ARS', concepto: 'Pintura para el taller',
  });
  ok('manual: con los datos clave, nace LEÍDO con confianza plena', completo.comprobante.estado_lectura === 'leido' && completo.comprobante.extraccion.via === 'manual' && completo.comprobante.extraccion.campos.monto_total.confianza === 1);
  const incompleto = comp.registrarManual(db, 1, { tipo: 'factura', direccion: 'recibida', emisor_nombre: 'Vidriería Sur', numero: '0001-00000009', fecha: '2026-10-08' });
  ok('manual: si falta el monto, nace en revisión preguntando SOLO el monto', incompleto.comprobante.estado_lectura === 'necesita-revision' && incompleto.comprobante.pregunta.campo === 'monto_total');

  comp.registerExtractor(() => null); // sin modelo disponible
  const sinModelo = await comp.ingestUpload(db, 1, { buffer: Buffer.from('papel ilegible'), contentType: 'image/png', nombreArchivo: 'ilegible.png' });
  ok('sin modelo: el papel queda GUARDADO en revisión, nunca perdido', sinModelo.comprobante.estado_lectura === 'necesita-revision' && !!sinModelo.comprobante.archivo.path && sinModelo.comprobante.extraccion.via === 'sin-modelo', sinModelo.comprobante.extraccion.via);
  comp.registerExtractor(extractorFalso);
  db.close();
}

// ---------------- Consulta y separación por cuenta ----------------
console.log('— consulta de Papeles y separación por cuenta');
{
  const db = dbConPack('completa');
  await comp.ingestUpload(db, 1, { buffer: Buffer.from('FACTURA-PROVEEDOR q1'), contentType: 'image/jpeg', nombreArchivo: 'q1.jpg' });
  await comp.ingestUpload(db, 1, { buffer: Buffer.from('FACTURA-EMITIDA q2'), contentType: 'image/jpeg', nombreArchivo: 'q2.jpg' });
  await comp.ingestUpload(db, 1, { buffer: Buffer.from('TICKET-SERVICIO q3'), contentType: 'image/jpeg', nombreArchivo: 'q3.jpg' });
  ok('consulta: por período (desde/hasta sobre la fecha)', comp.listComprobantes(db, 1, { desde: '2026-10-05', hasta: '2026-10-05' }).total === 1);
  ok('consulta: por contraparte (nombre parcial)', comp.listComprobantes(db, 1, { contraparte: 'Espiga' }).total === 1);
  ok('consulta: por contraparte (CUIT)', comp.listComprobantes(db, 1, { contraparte: CUIT_PROVEEDOR }).total === 1);
  ok('consulta: por clasificación', comp.listComprobantes(db, 1, { clasificacion: 'venta' }).total === 1 && comp.listComprobantes(db, 1, { clasificacion: 'gasto' }).total === 2);
  ok('consulta: por texto libre (número)', comp.listComprobantes(db, 1, { q: '00000042' }).total === 1);
  ok('consulta: por tipo', comp.listComprobantes(db, 1, { tipo: 'ticket' }).total === 1);
  const ajeno = comp.listComprobantes(db, 2, {});
  ok('cuentas: otra cuenta no ve ningún comprobante', ajeno.total === 0);
  const idDeUno = comp.listComprobantes(db, 1, {}).comprobantes[0].id;
  ok('cuentas: el detalle de otra cuenta se rechaza', comp.getComprobante(db, 2, idDeUno) === null && !!lanza(() => comp.historialComprobante(db, 2, idDeUno)));
  ok('cuentas: corregir un comprobante ajeno se rechaza', !!lanza(() => comp.corregirComprobante(db, 2, idDeUno, { monto_total: 1 }, { actor: 'dueno' })));
  const hist = comp.historialComprobante(db, 1, idDeUno);
  ok('detalle: el historial del papel se lee del registro durable', hist.historial.length >= 2 && hist.historial[0].tipo_evento === 'comprobante-registrado');
  db.close();
}

// ---------------- Wiring estático en server.js ----------------
console.log('— wiring: server.js');
{
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const iG03 = srv.indexOf("require('./gesty-comprobantes')");
  const iCatch = srv.indexOf("\napp.get('*', (req, res)");
  ok('server: monta el módulo de comprobantes', iG03 > 0);
  ok('server: las rutas de comprobantes van ANTES del catch-all', iG03 > 0 && iCatch > iG03);
  ok('server: la API va detrás de la capacidad «comprobantes»', srv.includes("gesty.capacidadMiddleware(db, 'comprobantes')"));
  ok('server: configurado con MEDIA_DIR y la clave de la cuenta (openaiKeyFor)', srv.includes('gestyComprobantes.configure({ mediaDir: MEDIA_DIR, apiKeyFor:'));
  for (const ruta of ["app.post('/api/gesty/comprobantes'", "app.post('/api/gesty/comprobantes/manual'", "app.post('/api/gesty/comprobantes/email'", "app.get('/api/gesty/comprobantes'", "app.get('/api/gesty/comprobantes/:id'", "app.post('/api/gesty/comprobantes/:id/corregir'"]) {
    ok(`server: ruta ${ruta.slice(4, 44)}…`, srv.includes(ruta));
  }
  ok('capacidades: Esencial incluye comprobantes (las 3 áreas base)', gesty.hasCapacidad(dbConPack('esencial'), 1, 'comprobantes'));
  const dbNinguno = dbConPack('ninguno');
  ok('capacidades: sin pack no hay capacidad comprobantes', !gesty.hasCapacidad(dbNinguno, 1, 'comprobantes'));
  dbNinguno.close();
}

// ---------------- HTTP: flujo completo ----------------
const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;
async function call(method, p, body, cookie, raw) {
  const r = await fetch(BASE + p, {
    method,
    headers: raw ? { 'Content-Type': raw.ct, ...(cookie ? { Cookie: cookie } : {}) } : { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: raw ? raw.buf : (body ? JSON.stringify(body) : undefined),
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, cookie: sid };
}

console.log('— http: gating e ingesta con el server booteado');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g03-'));
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

  const reg = await call('POST', '/api/auth/register', { email: 'g03@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/comprobantes', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/comprobantes', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const sinPackPost = await call('POST', '/api/gesty/comprobantes/manual', { emisor_nombre: 'X', fecha: '2026-10-01', monto_total: 10 }, reg.cookie);
  ok('gating http: sin pack, la ingesta también → 403', sinPackPost.status === 403, String(sinPackPost.status));

  const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile.exec('PRAGMA busy_timeout = 5000');
  const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('g03@example.com');
  dbFile.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'esencial', 'admin-familia')").run(u.id);
  dbFile.close();

  const manual = await call('POST', '/api/gesty/comprobantes/manual', {
    tipo: 'factura', direccion: 'recibida', emisor_nombre: 'Repuestos del Sur S.A.', emisor_cuit: CUIT_PROVEEDOR,
    numero: '0003-00001234', fecha: '2026-10-05', monto_total: 185000, moneda: 'ARS',
  }, reg.cookie);
  ok('http: registro manual con pack esencial → 200 y leído', manual.status === 200 && manual.data.comprobante.estado_lectura === 'leido', JSON.stringify(manual.data).slice(0, 200));
  const compId = manual.data.comprobante.id;

  const subida = await call('POST', '/api/gesty/comprobantes?nombre=papel.png', null, reg.cookie, { ct: 'image/png', buf: Buffer.from('PNGSINLECTURA') });
  ok('http: subida sin clave de IA → 200, papel guardado en revisión (nunca perdido)', subida.status === 200 && subida.data.comprobante.estado_lectura === 'necesita-revision' && !!subida.data.comprobante.archivo.path, JSON.stringify(subida.data).slice(0, 200));

  const lista = await call('GET', '/api/gesty/comprobantes', null, reg.cookie);
  ok('http: la consulta devuelve los dos papeles de la cuenta', lista.status === 200 && lista.data.total === 2, JSON.stringify(lista.data).slice(0, 160));
  const detalle = await call('GET', `/api/gesty/comprobantes/${compId}`, null, reg.cookie);
  ok('http: el detalle trae el historial desde el registro', detalle.status === 200 && Array.isArray(detalle.data.historial) && detalle.data.historial.length >= 2);
  const corrHttp = await call('POST', `/api/gesty/comprobantes/${subida.data.comprobante.id}/corregir`, { campos: { emisor_nombre: 'Papel del mostrador', fecha: '2026-10-09', monto_total: 12000 } }, reg.cookie);
  ok('http: corregir por API deja el papel leído', corrHttp.status === 200 && corrHttp.data.comprobante.estado_lectura === 'leido', JSON.stringify(corrHttp.data).slice(0, 200));

  const regB = await call('POST', '/api/auth/register', { email: 'g03-otra@example.com', password: 'secreto2' });
  const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile2.exec('PRAGMA busy_timeout = 5000');
  const uB = dbFile2.prepare('SELECT id FROM users WHERE email = ?').get('g03-otra@example.com');
  dbFile2.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'total', 'checkout')").run(uB.id);
  dbFile2.close();
  const listaB = await call('GET', '/api/gesty/comprobantes', null, regB.cookie);
  ok('http: otra cuenta con pack ve SU archivo (vacío), nunca el ajeno', listaB.status === 200 && listaB.data.total === 0);
  const detalleB = await call('GET', `/api/gesty/comprobantes/${compId}`, null, regB.cookie);
  ok('http: el detalle ajeno → 400', detalleB.status === 400, String(detalleB.status));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
