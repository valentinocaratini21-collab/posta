#!/usr/bin/env node
// test-gesty-buzon.js — G-23 · EL BUZÓN DE PAPELES (la dirección de
// email del negocio). Spec: gesty-cola-builds.md G-23.
// Cubre la aceptación del build: dirección generada resuelve su
// cuenta y la regeneración mata la anterior · email con adjunto
// papel entra a G-03 y queda leído/archivado con su evento de
// ingesta como constancia · remitente/emisor conocido vincula y
// emisor nuevo propone contraparte sin escribirla directo · token
// inválido = rechazo en voz alta y CERO papeles en cualquier cuenta
// · email sin papel = «sin-papel» registrado con su motivo ·
// adjunto duplicado = la huella de G-03 lo marca sin duplicar el
// vivo · rate-limit propio · el token jamás aparece en el
// fundamento ni en el registro (solo su huella) · separación por
// cuenta y gating de consultas (401/403/200) + la ingesta pública
// por HTTP (200 con la dirección, 404 con token basura).
// Unidad del módulo (DB :memory:, extractor falso inyectado en
// G-03 — el patrón de la casa) + wiring estático + flujo HTTP con
// el server booteado. Uso: node test-gesty-buzon.js
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 240) : ''); }
};
const nuevaDb = () => new DatabaseSync(':memory:');
function lanza(fn) { try { fn(); return null; } catch (e) { return e; } }
async function lanzaAsync(fn) { try { await fn(); return null; } catch (e) { return e; } }
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const gesty = require('./gesty.js');
const comp = require('./gesty-comprobantes.js');
const buzon = require('./gesty-buzon.js');

const CUIT_PROPIO = '20123456786';     // Refrigeración Sosa (checksum válido)
const CUIT_PROVEEDOR = '30123456781';  // Repuestos del Sur S.A.
const CUIT_OTRO_PROV = '30567890127';  // Fletes Andina
const AHORA = '2026-10-24T15:00:00.000Z';

const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g23-media-'));
comp.configure({ mediaDir: MEDIA_TMP, apiKeyFor: () => '' });

// Extractor falso (mismo patrón que test-gesty-g03): decide por el
// contenido del buffer. '-2' va antes: su marca contiene a la otra.
const CONF_ALTA = { tipo: 0.98, emisor_nombre: 0.97, emisor_cuit: 0.99, receptor_nombre: 0.96, receptor_cuit: 0.99, numero: 0.98, fecha: 0.97, vencimiento: 0.9, monto_total: 0.98, monto_neto: 0.95, cae: 0.9, clasificacion_sugerida: 0.9 };
function extractorFalso({ buffer }) {
  const t = buffer ? buffer.toString('utf8', 0, 400) : '';
  if (t.includes('FACTURA-PROVEEDOR-2')) {
    return {
      tipo: 'factura', emisor_nombre: 'Repuestos del Sur S.A.', emisor_cuit: CUIT_PROVEEDOR,
      receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
      numero: '0003-00001235', fecha: '2026-10-12', vencimiento: '2026-11-11', moneda: 'ARS',
      monto_total: 64000, monto_neto: 52900, impuestos: [{ concepto: 'IVA 21%', monto: 11100 }],
      cae: '74123456789013', concepto: 'Compra de repuestos (segunda)', clasificacion_sugerida: 'gasto',
      confianza: { ...CONF_ALTA }, _via: 'vision',
    };
  }
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
  return null;
}
comp.registerExtractor(extractorFalso);

function dbConPack(pack, uid) {
  const db = nuevaDb();
  gesty.initGesty(db);
  comp.ensureSchema(db);
  buzon.ensureSchema(db);
  gesty.setPack(db, uid, pack, { origen: 'checkout', actor: 'sistema' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  return db;
}
const b64 = (texto) => Buffer.from(texto, 'utf8').toString('base64');
const adjPapel = (marca, nombre) => ({ nombre: nombre || 'factura.pdf', content_type: 'application/pdf', datos_base64: b64(marca) });

(async () => {
// ---------------- Wiring estático ----------------
console.log('— wiring en server.js');
{
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok('server.js requiere gesty-buzon y monta la ingesta pública + las consultas', src.includes("require('./gesty-buzon')") && src.includes("app.post('/api/gesty/buzon/ingresar'") && src.includes("app.get('/api/gesty/buzon/resumen'"));
  ok('server.js conserva un BUILD_ID con formato de build (la aserción de base fija se relajó en v428: cada push de la casa lo bumpea)', /const BUILD_ID = '[0-9]{8}-v[0-9]+';/.test(src));
}

// ---------------- La dirección: generación, huella y regeneración ----------------
console.log('— la dirección del buzón');
const db = dbConPack('completa', 1);
{
  const sinBuzon = buzon.estadoBuzon(db, 1);
  ok('sin dirección generada no hay buzón (declarado, no implícito)', sinBuzon.existe === false && sinBuzon.activa === false && /todavía no generó/.test(sinBuzon.nota));

  const sinPack = lanza(() => buzon.generarDireccion(db, 99, { ahora: AHORA }));
  ok('sin pack Gesty no se genera dirección', !!sinPack && /no tiene Gesty habilitado/.test(sinPack.message), sinPack && sinPack.message);

  const g1 = buzon.generarDireccion(db, 1, { ahora: AHORA });
  ok('la dirección tiene el formato declarado papeles+<token>@gestyofficemanager.com', /^papeles\+[0-9a-f]{48}@gestyofficemanager\.com$/.test(g1.direccion), g1.direccion);
  ok('el token tiene 16+ bytes (24 bytes = 48 hex)', g1.token.length === 48);
  ok('la generación queda fechada con el reloj inyectado', g1.generada_en === AHORA, g1.generada_en);

  const fila = db.prepare('SELECT * FROM gesty_buzon WHERE user_id = 1').get();
  ok('en la tabla solo vive la HUELLA sha256 del token', fila.huella === sha256(g1.token) && fila.huella_corta === sha256(g1.token).slice(0, 8) && !JSON.stringify(fila).includes(g1.token));
  const fund = gesty.getData(db, 1, { grupo: 'cuentas-medios' }).find((d) => d.campo === 'buzon_papeles');
  ok('el fundamento espeja la dirección con SOLO su huella', !!fund && fund.valor.huella === sha256(g1.token) && fund.valor.huella_corta === g1.huella_corta && !JSON.stringify(fund).includes(g1.token));
  const eventosJson = JSON.stringify(gesty.listEvents(db, 1, {}));
  ok('el token jamás aparece en el registro durable (solo la huella corta)', !eventosJson.includes(g1.token) && eventosJson.includes(g1.huella_corta));

  const est = buzon.estadoBuzon(db, 1);
  ok('el estado muestra activa + enmascarada + fecha, nunca el token', est.activa === true && est.direccion_visible.startsWith('papeles+••') && est.generada_en === AHORA && !JSON.stringify(est).includes(g1.token));

  const res = buzon.resolverDestino(db, g1.direccion);
  ok('la dirección generada resuelve su cuenta', !!res && res.user_id === 1);
  ok('resolver acepta la dirección con mayúsculas y con nombre <…>', buzon.resolverDestino(db, g1.direccion.toUpperCase()).user_id === 1 && buzon.resolverDestino(db, `Buzón <${g1.direccion}>`).user_id === 1);
  ok('una dirección de otro prefijo no resuelve', buzon.resolverDestino(db, 'hola@gestyofficemanager.com') === null);

  // Regenerar mata la anterior en el acto.
  const g2 = buzon.generarDireccion(db, 1, { ahora: '2026-10-25T09:00:00.000Z' });
  ok('regenerar crea un token nuevo y lo declara', g2.token !== g1.token && g2.generacion === 2 && g2.mato_anterior === true);
  ok('la dirección vieja dejó de resolver en el acto', buzon.resolverDestino(db, g1.direccion) === null);
  ok('la dirección nueva resuelve', buzon.resolverDestino(db, g2.direccion).user_id === 1);
  var direccionActual = g2.direccion;
}

// ---------------- Ingesta feliz: el papel entra a G-03 ----------------
console.log('— ingesta: el comprobante reenviado entra solo');
{
  buzon._resetRateLimit();
  const r = await buzon.ingresarEmail(db, {
    para: direccionActual, de: 'Facturacion Repuestos <facturacion@repuestosdelsur.example>',
    asunto: 'Factura 0003-00001234', adjuntos: [adjPapel('FACTURA-PROVEEDOR papel del proveedor')],
  }, { ip: '10.0.0.1' });
  ok('ingesta feliz: resultado global con-papeles', r.ingesta.resultado === 'con-papeles' && r.ingesta.papeles === 1, r.ingesta.resultado);
  const entrada = r.resultados.find((x) => x.fuente === 'adjunto');
  ok('el papel quedó LEÍDO por G-03', entrada.resultado === 'leido' && typeof entrada.comprobante_id === 'number', entrada.resultado);
  const papel = comp.getComprobante(db, 1, entrada.comprobante_id);
  ok('el papel vive en G-03 con origen email y archivado', papel.origen === 'email' && papel.estado_lectura === 'leido' && !!papel.archivo.path && papel.emisor.cuit === CUIT_PROVEEDOR);
  ok('emisor nuevo: nace VINCULADO=false y su propuesta quedó en la ingesta', entrada.vinculado === false && r.ingesta.detalle.propuestas.includes('proveedores:cuit_' + CUIT_PROVEEDOR), JSON.stringify(r.ingesta.detalle.propuestas));
  const fundProv = gesty.getData(db, 1, { grupo: 'proveedores' }).find((d) => d.campo === 'cuit_' + CUIT_PROVEEDOR);
  ok('la contraparte se PROPUSO al fundamento por el circuito de G-03 (origen comprobante)', !!fundProv && fundProv.origen === 'comprobante', fundProv && fundProv.origen);
  const evs = gesty.listEvents(db, 1, { entidad_tipo: 'buzon', entidad_id: String(r.ingesta.id) });
  ok('el evento de ingesta es la constancia (buzon-ingesta con el papel y el remitente)', evs.length === 1 && evs[0].tipo_evento === 'buzon-ingesta' && evs[0].payload.resultados[0].comprobante_id === entrada.comprobante_id && evs[0].payload.remitente === 'facturacion@repuestosdelsur.example');
  ok('el remitente quedó normalizado en la ingesta', r.ingesta.remitente === 'facturacion@repuestosdelsur.example');
}

// ---------------- Emisor conocido: el papel nace vinculado ----------------
console.log('— ingesta: contraparte conocida');
{
  const r = await buzon.ingresarEmail(db, {
    para: direccionActual, de: 'facturacion@repuestosdelsur.example', asunto: 'Otra factura',
    adjuntos: [adjPapel('FACTURA-PROVEEDOR-2 segunda del mismo proveedor', 'factura-2.pdf')],
  }, { ip: '10.0.0.2' });
  const entrada = r.resultados.find((x) => x.fuente === 'adjunto');
  ok('segundo papel del mismo emisor: leído y VINCULADO a la contraparte conocida', entrada.resultado === 'leido' && entrada.vinculado === true, JSON.stringify(entrada));
  ok('sin propuesta nueva para una contraparte que ya existía', !r.ingesta.detalle.propuestas.includes('proveedores:cuit_' + CUIT_PROVEEDOR), JSON.stringify(r.ingesta.detalle.propuestas));
}

// ---------------- Papel flojo: necesita-revisión (el resultado de G-03 manda) ----------------
console.log('— ingesta: papel con un dato flojo');
{
  const r = await buzon.ingresarEmail(db, {
    para: direccionActual, de: 'fletes@andina.example', asunto: 'Flete',
    adjuntos: [adjPapel('FACTURA-BAJA monto dudoso')],
  }, { ip: '10.0.0.3' });
  const entrada = r.resultados.find((x) => x.fuente === 'adjunto');
  const papel = comp.getComprobante(db, 1, entrada.comprobante_id);
  ok('el papel flojo entra como necesita-revision con su pregunta única de G-03', entrada.resultado === 'necesita-revision' && papel.pregunta && papel.pregunta.campo === 'monto_total', entrada.resultado);
  ok('la ingesta igual es con-papeles (entró al registro)', r.ingesta.resultado === 'con-papeles');
}

// ---------------- Duplicado: la huella de G-03 manda ----------------
console.log('— ingesta: el mismo papel reenviado dos veces');
{
  const vivosAntes = comp.listComprobantes(db, 1, {}).total;
  const r = await buzon.ingresarEmail(db, {
    para: direccionActual, de: 'facturacion@repuestosdelsur.example', asunto: 'Reenvío de la misma factura',
    adjuntos: [adjPapel('FACTURA-PROVEEDOR papel del proveedor')],
  }, { ip: '10.0.0.4' });
  const entrada = r.resultados.find((x) => x.fuente === 'adjunto');
  ok('el duplicado queda marcado por la huella de G-03, con su original citado', entrada.resultado === 'duplicado' && typeof entrada.duplicado_de === 'number', JSON.stringify(entrada));
  ok('el registro vivo NO se duplicó', comp.listComprobantes(db, 1, {}).total === vivosAntes);
  ok('el duplicado se guardó marcado (no se descartó)', comp.listComprobantes(db, 1, { incluir_duplicados: true }).total === vivosAntes + 1);
}

// ---------------- Token inválido: rechazo en voz alta, cero papeles ----------------
console.log('— ingesta: token que no resuelve');
{
  const papelesAntes = db.prepare('SELECT COUNT(*) AS n FROM gesty_comprobantes').get().n;
  const err = await lanzaAsync(() => buzon.ingresarEmail(db, {
    para: 'papeles+000000000000000000000000000000000000000000000000@gestyofficemanager.com',
    de: 'spam@malo.example', asunto: 'Factura trucha', adjuntos: [adjPapel('FACTURA-PROVEEDOR papel del proveedor')],
  }, { ip: '10.0.0.5' }));
  ok('token desconocido = rechazo en voz alta (code TOKEN)', !!err && err.code === 'TOKEN', err && err.message);
  ok('cero papeles entraron en CUALQUIER cuenta', db.prepare('SELECT COUNT(*) AS n FROM gesty_comprobantes').get().n === papelesAntes);
  const desc = db.prepare("SELECT * FROM gesty_buzon_descartes WHERE motivo = 'token-sin-buzon'").all();
  ok('el intento quedó registrado como descarte, fuera de toda cuenta', desc.length === 1 && desc[0].huella_corta.length === 8 && !JSON.stringify(desc).includes('000000000000000000000000000000000000000000000000'));
}

// ---------------- Sin papel: registrado con su motivo ----------------
console.log('— ingesta: emails sin papel aprovechable');
{
  const r1 = await buzon.ingresarEmail(db, {
    para: direccionActual, de: 'vecino@example.com', asunto: 'Consulta', cuerpo_texto: 'Hola, ¿siguen en el mismo horario?',
    adjuntos: [{ nombre: 'notas.docx', content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', datos_base64: b64('notas') }],
  }, { ip: '10.0.0.6' });
  ok('adjunto no-papel + cuerpo sin comprobante = sin-papel con motivo', r1.ingesta.resultado === 'sin-papel' && /ningún adjunto era un papel/.test(r1.ingesta.detalle.motivo || ''), r1.ingesta.detalle.motivo);
  ok('el adjunto no-papel quedó registrado con su resultado, no desapareció', r1.resultados.some((x) => x.resultado === 'no-papel'));
  const evs1 = gesty.listEvents(db, 1, { entidad_tipo: 'buzon', entidad_id: String(r1.ingesta.id) });
  ok('el sin-papel también tiene su constancia (buzon-ingesta-sin-papel)', evs1.length === 1 && evs1[0].tipo_evento === 'buzon-ingesta-sin-papel');

  const r2 = await buzon.ingresarEmail(db, { para: direccionActual, de: 'vecino@example.com', asunto: 'Vacío' }, { ip: '10.0.0.7' });
  ok('email sin adjuntos ni cuerpo = sin-papel declarado', r2.ingesta.resultado === 'sin-papel' && /sin adjuntos y sin cuerpo/.test(r2.ingesta.detalle.motivo || ''), r2.ingesta.detalle.motivo);
}

// ---------------- Cuerpo legible sin adjuntos (H-G23-2) ----------------
console.log('— ingesta: el cuerpo trae el comprobante');
{
  const cuerpo = 'Factura B 0003-00009999\nFecha: 05/10/2026\nEmisor CUIT 30-12345678-1\nTotal: $ 185.000,00';
  ok('el detector determinista declara el cuerpo legible (fecha + monto + señal fiscal)', buzon.cuerpoLegible(cuerpo).legible === true, JSON.stringify(buzon.cuerpoLegible(cuerpo)));
  const papelesAntes = db.prepare('SELECT COUNT(*) AS n FROM gesty_comprobantes WHERE user_id = 1').get().n;
  const r = await buzon.ingresarEmail(db, {
    para: direccionActual, de: 'facturacion@repuestosdelsur.example', asunto: 'Tu factura (en el cuerpo)', cuerpo_texto: cuerpo,
  }, { ip: '10.0.0.8' });
  const entradaCuerpo = r.resultados.find((x) => x.fuente === 'cuerpo');
  ok('H-G23-2: el cuerpo legible queda registrado como no-archivado CON el motivo literal de G-03', !!entradaCuerpo && entradaCuerpo.resultado === 'no-archivado' && /Formato no soportado/.test(entradaCuerpo.motivo || ''), JSON.stringify(entradaCuerpo));
  ok('no se fingió ningún papel desde el cuerpo', db.prepare('SELECT COUNT(*) AS n FROM gesty_comprobantes WHERE user_id = 1').get().n === papelesAntes && r.ingesta.resultado === 'sin-papel' && /H-G23-2/.test(r.ingesta.detalle.motivo || ''));
}

// ---------------- Guardas de tamaño ----------------
console.log('— ingesta: guardas de tamaño');
{
  const grande = Buffer.alloc(10 * 1024 * 1024 + 1, 65).toString('base64');
  const r = await buzon.ingresarEmail(db, {
    para: direccionActual, de: 'facturacion@repuestosdelsur.example', asunto: 'Adjunto enorme',
    adjuntos: [{ nombre: 'enorme.pdf', content_type: 'application/pdf', datos_base64: grande }],
  }, { ip: '10.0.0.9' });
  const entrada = r.resultados.find((x) => x.fuente === 'adjunto');
  ok('adjunto que supera los 10 MB: rechazado con su motivo registrado', entrada.resultado === 'rechazado-tamano' && /10 MB/.test(entrada.motivo || ''), JSON.stringify(entrada));
  ok('y el email cierra como sin-papel', r.ingesta.resultado === 'sin-papel');
}

// ---------------- Rate-limit propio ----------------
console.log('— ingesta: rate-limit');
{
  buzon._resetRateLimit();
  let ultimo = null;
  for (let i = 0; i < 61; i++) {
    ultimo = await lanzaAsync(() => buzon.ingresarEmail(db, {
      para: 'papeles+111111111111111111111111111111111111111111111111@gestyofficemanager.com',
      de: 'x@y.example', asunto: 'spam', adjuntos: [],
    }, { ip: '9.9.9.9' }));
    if (i < 60 && (!ultimo || ultimo.code !== 'TOKEN')) break;
  }
  ok('todo intento cuenta: el 61.º desde la misma IP es RATE_LIMIT (429)', !!ultimo && ultimo.code === 'RATE_LIMIT', ultimo && ultimo.code);
  buzon._resetRateLimit();
}

// ---------------- Consultas y resumen ----------------
console.log('— consultas del dueño');
{
  const lista = buzon.listIngestas(db, 1, {});
  ok('el historial lista las ingestas de la cuenta con su resultado por papel', lista.total >= 7 && lista.ingestas.every((i) => Array.isArray(i.detalle.resultados)), String(lista.total));
  const res = buzon.resumenBuzon(db, 1);
  ok('el resumen para «La oficina» cuenta de registros reales', res.buzon.activa === true && res.ingestas_total === lista.total && res.con_papeles >= 4 && res.sin_papel >= 3 && res.papeles.leidos === 2 && res.papeles.duplicados === 1 && res.papeles.necesita_revision === 1, JSON.stringify(res));
}

// ---------------- Separación por cuenta ----------------
console.log('— separación por cuenta');
{
  const db2 = dbConPack('esencial', 2);
  const g = buzon.generarDireccion(db2, 2, { ahora: AHORA });
  const r = await buzon.ingresarEmail(db2, {
    para: g.direccion, de: 'facturacion@repuestosdelsur.example', asunto: 'Factura de la otra cuenta',
    adjuntos: [adjPapel('FACTURA-PROVEEDOR papel del proveedor')],
  }, { ip: '10.0.1.1' });
  ok('el email a la dirección de la cuenta 2 entra SOLO en la cuenta 2', r.ingesta.resultado === 'con-papeles' && comp.listComprobantes(db2, 2, {}).total === 1 && comp.listComprobantes(db2, 1, {}).total === 0);
  ok('los historiales no se cruzan', buzon.listIngestas(db2, 2, {}).total === 1 && buzon.listIngestas(db2, 1, {}).total === 0);
  ok('el resumen de la cuenta 2 no ve la actividad de la 1', buzon.resumenBuzon(db2, 2).ingestas_total === 1);
  db2.close();
}
db.close();

// ---------------- HTTP: ingesta pública + gating de consultas ----------------
console.log('— http: ingesta pública y gating');
const PORT = 3981;
const BASE = `http://127.0.0.1:${PORT}`;
async function call(method, p, body, cookie) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  const texto = await r.text();
  try { data = JSON.parse(texto); } catch (e) { data = { texto }; }
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, cookie: sid, texto };
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g23-'));
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
  const reg = await call('POST', '/api/auth/register', { email: 'g23@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/buzon/estado', null, '');
  ok('gating http: estado sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/buzon/estado', null, reg.cookie);
  ok('gating http: estado sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f.exec('PRAGMA busy_timeout = 5000');
  const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g23@example.com');
  f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'esencial');
  f.close();
  const gen = await call('POST', '/api/gesty/buzon/direccion', {}, reg.cookie);
  ok('http: generar la dirección con pack Esencial (capacidad comprobantes) → 200 y formato', gen.status === 200 && /^papeles\+[0-9a-f]{48}@gestyofficemanager\.com$/.test(gen.data.direccion || ''), JSON.stringify(gen.data).slice(0, 200));
  const tokenHttp = (gen.data.direccion || '').split('@')[0].replace('papeles+', '');
  const est = await call('GET', '/api/gesty/buzon/estado', null, reg.cookie);
  ok('http: el estado muestra el buzón activo SIN filtrar el token', est.status === 200 && est.data.estado.activa === true && !JSON.stringify(est.data).includes(tokenHttp), JSON.stringify(est.data).slice(0, 200));
  const ing = await call('POST', '/api/gesty/buzon/ingresar', {
    para: gen.data.direccion, de: 'facturacion@repuestosdelsur.example', asunto: 'Factura por HTTP',
    adjuntos: [adjPapel('FACTURA-PROVEEDOR papel por http')],
  }, '');
  ok('http: la ingesta pública (sin sesión) con la dirección real → 200 con-papeles', ing.status === 200 && ing.data.ingesta && ing.data.ingesta.resultado === 'con-papeles' && ing.data.ingesta.papeles === 1, JSON.stringify(ing.data).slice(0, 220));
  const ing404 = await call('POST', '/api/gesty/buzon/ingresar', {
    para: 'papeles+abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd@gestyofficemanager.com',
    de: 'x@y.example', asunto: 'basura', adjuntos: [adjPapel('FACTURA-PROVEEDOR papel del proveedor')],
  }, '');
  ok('http: token que no resuelve → 404 en voz alta', ing404.status === 404, String(ing404.status));
  const hist = await call('GET', '/api/gesty/buzon/ingestas', null, reg.cookie);
  ok('http: el historial muestra la ingesta con su remitente', hist.status === 200 && hist.data.total === 1 && hist.data.ingestas[0].remitente === 'facturacion@repuestosdelsur.example', JSON.stringify(hist.data).slice(0, 220));
  const resH = await call('GET', '/api/gesty/buzon/resumen', null, reg.cookie);
  ok('http: el resumen responde con su forma', resH.status === 200 && resH.data.resumen.ingestas_total === 1 && resH.data.resumen.papeles.entrados === 1, JSON.stringify(resH.data).slice(0, 200));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
