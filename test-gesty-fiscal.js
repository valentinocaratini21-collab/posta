#!/usr/bin/env node
// test-gesty-fiscal.js — G-19 · CALENDARIO FISCAL CALCULADO.
// Spec: gesty-cola-builds.md G-19 (aceptación: «para 3 perfiles
// fiscales de prueba, la agenda coincide 1:1 con el calendario
// oficial calculado a mano; si el régimen no está en la tabla,
// Gesty lo dice y pide el dato — nunca estima»).
// Las fechas esperadas se cruzaron a mano contra los cronogramas
// REALES publicados por ARCA: IVA oct/2026 (19/20/21/22/23 por
// pares), IVA dic/2025 (18/19/22/23/24), Monotributo sep/2026
// (el 20 fue domingo → venció el lunes 21), Autónomos oct/2026
// (5/6/7). Cubre: IVA por terminación con la regla citada ·
// monotributo mensual · la versión del período (monotributo
// 2010-04 = día 7 con la v2004.1; 2010-05 = día 20 con la
// v2010.2) · período sin versión vigente (IVA 2017-06) declarado
// · Ganancias sin confirmar NO calcula · Autónomos solo con
// titular persona física · régimen fuera de tabla →
// sin-cobertura + pregunta única y CERO fechas · jurisdicción
// sin tabla → declarado · sin CUIT → pregunta · cálculo y carga
// manual coincidentes NO se duplican (una, dos fuentes) · forma
// compatible con G-09 · separación por cuenta · gating HTTP
// (401 / 403 sin pack / 403 Esencial sin «agenda» / 200 Completa).
// Uso: node test-gesty-fiscal.js
'use strict';
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

const gesty = require('./gesty.js');
const fiscal = require('./gesty-fiscal.js');

const HOY = '2026-10-24';

function sembrarPerfil(db, uid, datos) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: datos.razon || 'Negocio de Prueba', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  if (datos.cuit) gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: datos.cuit, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  if (datos.condicion) gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'condicion_iva', valor: datos.condicion, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  if (datos.tipo_persona) gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'tipo_persona', valor: datos.tipo_persona, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  if (datos.jurisdiccion) gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'jurisdiccion', valor: datos.jurisdiccion, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
}

(async () => {
const db = nuevaDb();
gesty.initGesty(db);

// --- Perfil 1: responsable inscripto, CUIT terminación 6, sociedad
sembrarPerfil(db, 1, { razon: 'Refrigeración Sosa SRL', cuit: '20123456786', condicion: 'Responsable inscripto', tipo_persona: 'juridica' });
// --- Perfil 2: monotributista
sembrarPerfil(db, 2, { razon: 'Peluquería Lumière', cuit: '27999999999', condicion: 'Monotributo' });
// --- Perfil 3: régimen fuera de tabla
sembrarPerfil(db, 3, { razon: 'Cooperativa Andar', cuit: '30666666661', condicion: 'Régimen especial de fomento' });
// --- Perfil 4: jurisdicción sin tabla
sembrarPerfil(db, 4, { razon: 'Sucursal Montevideo', cuit: '20123456786', condicion: 'Responsable inscripto', jurisdiccion: 'UY' });
// --- Perfil 5: RI persona física, terminación 3
sembrarPerfil(db, 5, { razon: 'Taller Hermanos Ruiz', cuit: '20333333333', condicion: 'Responsable inscripto', tipo_persona: 'fisica' });
// --- Perfil 6: exento
sembrarPerfil(db, 6, { razon: 'Fundación Puente', cuit: '30777777771', condicion: 'IVA exento' });
// --- Perfil 7: RI sin CUIT
sembrarPerfil(db, 7, { razon: 'Distribuidora Sin Cuit', condicion: 'Responsable inscripto' });

// ---------------------------------------------------------------------------
console.log('— perfil fiscal: lectura del fundamento');
const p1 = fiscal.perfilFiscal(db, 1);
ok('perfil RI: régimen normalizado, terminación 6, estado ok',
  p1.regimen === 'responsable-inscripto' && p1.terminacion_cuit === 6 && p1.estado === 'ok', JSON.stringify(p1));
ok('perfil monotributo: régimen normalizado sin exigir CUIT para el día fijo',
  fiscal.perfilFiscal(db, 2).regimen === 'monotributo' && fiscal.perfilFiscal(db, 2).estado === 'ok');
ok('perfil exento: régimen conocido, estado ok', fiscal.perfilFiscal(db, 6).regimen === 'exento');

// ---------------------------------------------------------------------------
console.log('— IVA: el calendario oficial calculado a mano (oct/2026)');
const c1 = fiscal.calcularPeriodo(db, 1, '2026-09');
const iva1 = c1.vencimientos.find((v) => v.obligacion_clave === 'iva');
ok('IVA período 2026-09, terminación 6 → jueves 2026-10-22 (calendario ARCA real)',
  !!iva1 && iva1.fecha === '2026-10-22', iva1 && iva1.fecha);
ok('IVA: la regla y su versión quedan citadas (ar-iva-mensual v2018.1)',
  !!iva1 && iva1.regla_id === 'ar-iva-mensual' && iva1.regla_version === '2018.1');
ok('IVA: la base dice el porqué («terminación de CUIT 6»)',
  !!iva1 && iva1.base.includes('terminación de CUIT 6'), iva1 && iva1.base);
ok('IVA: fecha nominal 2026-10-21 y corrimiento de bloque declarado',
  !!iva1 && iva1.fecha_nominal === '2026-10-21' && iva1.ajuste.aplicado === 'fin-de-semana' && /bloque/.test(iva1.ajuste.detalle),
  iva1 && JSON.stringify(iva1.ajuste));
ok('IVA: SIN monto — el importe lo liquida el contador, jamás se inventa',
  !!iva1 && iva1.monto === null);
ok('IVA: todo vencimiento calculado declara «sin ajuste por feriados verificado»',
  c1.vencimientos.every((v) => /sin ajuste por feriados verificado/.test(v.ajuste.feriados)));

// Forma G-09 (la de vencimientosFiscalesFundamento) en cada calculado
ok('forma G-09: concepto/fecha/monto/moneda/fuente_campo/dato_id presentes',
  c1.vencimientos.every((v) => typeof v.concepto === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.fecha)
    && 'monto' in v && 'moneda' in v && v.fuente_campo === 'calculo-fiscal' && 'dato_id' in v));

// Todas las terminaciones contra el calendario real de oct/2026
const realesOct26 = { 0: '2026-10-19', 1: '2026-10-19', 2: '2026-10-20', 3: '2026-10-20', 4: '2026-10-21', 5: '2026-10-21', 6: '2026-10-22', 7: '2026-10-22', 8: '2026-10-23', 9: '2026-10-23' };
let todasOk = true;
for (const [t, esperada] of Object.entries(realesOct26)) {
  const regla = fiscal.REGLAS.find((r) => r.id === 'ar-iva-mensual');
  const idx = regla.pares.findIndex((p) => p.includes(Number(t)));
  const fecha = fiscal.enesimoHabilDesde(`2026-10-${regla.anclas[0]}`, idx);
  if (fecha !== esperada) todasOk = false;
}
ok('IVA: las diez terminaciones coinciden con el cronograma real de ARCA oct/2026', todasOk);
// Y contra dic/2025 (período 2025-11): 18/19/22/23/24
ok('IVA dic/2025: el bloque salta el fin de semana (18, 19, 22, 23, 24)',
  fiscal.enesimoHabilDesde('2025-12-18', 2) === '2025-12-22' && fiscal.enesimoHabilDesde('2025-12-18', 4) === '2025-12-24');

// ---------------------------------------------------------------------------
console.log('— Ganancias sin confirmar y Autónomos según el titular');
ok('Ganancias: regla sin confirmar → declarada y SIN fecha calculada',
  c1.reglas_sin_confirmar.some((r) => r.obligacion === 'Ganancias')
  && !c1.vencimientos.some((v) => v.obligacion_clave === 'ganancias'),
  JSON.stringify(c1.reglas_sin_confirmar));
ok('Autónomos: una sociedad (tipo_persona jurídica) NO lo paga — declarado no aplicable',
  c1.reglas_no_aplicables.some((r) => r.obligacion === 'Autónomos')
  && !c1.vencimientos.some((v) => v.obligacion_clave === 'autonomos'));
const c5 = fiscal.calcularPeriodo(db, 5, '2026-09');
const aut5 = c5.vencimientos.find((v) => v.obligacion_clave === 'autonomos');
ok('Autónomos: titular persona física, terminación 3 → lunes 2026-10-05 (calendario real)',
  !!aut5 && aut5.fecha === '2026-10-05' && aut5.regla_version === '2018.1', aut5 && aut5.fecha);
const iva5 = c5.vencimientos.find((v) => v.obligacion_clave === 'iva');
ok('IVA del mismo perfil (terminación 3) → 2026-10-20', !!iva5 && iva5.fecha === '2026-10-20', iva5 && iva5.fecha);

// ---------------------------------------------------------------------------
console.log('— monotributo: la cuota del día 20');
const c2 = fiscal.calcularPeriodo(db, 2, '2026-10');
const mono2 = c2.vencimientos.find((v) => v.obligacion_clave === 'monotributo');
ok('monotributo 2026-10 → martes 2026-10-20, sin corrimiento',
  !!mono2 && mono2.fecha === '2026-10-20' && mono2.ajuste.aplicado === 'ninguno', mono2 && mono2.fecha);
const c2s = fiscal.calcularPeriodo(db, 2, '2026-09');
const mono2s = c2s.vencimientos.find((v) => v.obligacion_clave === 'monotributo');
ok('monotributo 2026-09: el 20 fue domingo → lunes 21 (así lo publicó ARCA)',
  !!mono2s && mono2s.fecha === '2026-09-21' && mono2s.fecha_nominal === '2026-09-20', mono2s && mono2s.fecha);
ok('monotributo: un solo vencimiento por período y con su regla citada',
  c2.vencimientos.length === 1 && mono2.regla_id === 'ar-monotributo-cuota' && mono2.regla_version === '2010.2');

// ---------------------------------------------------------------------------
console.log('— versionado: el período manda qué versión calcula');
const cViejo = fiscal.calcularPeriodo(db, 2, '2010-04');
const monoViejo = cViejo.vencimientos.find((v) => v.obligacion_clave === 'monotributo');
ok('período 2010-04: calcula la versión vigente EN ese período (v2004.1, día 7 → 2010-04-07)',
  !!monoViejo && monoViejo.fecha === '2010-04-07' && monoViejo.regla_version === '2004.1',
  monoViejo && `${monoViejo.fecha} v${monoViejo.regla_version}`);
const cNuevo = fiscal.calcularPeriodo(db, 2, '2010-05');
const monoNuevo = cNuevo.vencimientos.find((v) => v.obligacion_clave === 'monotributo');
ok('período 2010-05: ya rige la v2010.2 (día 20 → 2010-05-20, RG 2819/2010)',
  !!monoNuevo && monoNuevo.fecha === '2010-05-20' && monoNuevo.regla_version === '2010.2');
const cSinVersion = fiscal.calcularPeriodo(db, 1, '2017-06');
ok('IVA 2017-06: ninguna versión cubre el período → declarado, CERO fechas de IVA',
  cSinVersion.sin_version_en_periodo.some((r) => r.regla_id === 'ar-iva-mensual')
  && !cSinVersion.vencimientos.some((v) => v.obligacion_clave === 'iva'),
  JSON.stringify(cSinVersion.sin_version_en_periodo));

// ---------------------------------------------------------------------------
console.log('— sin cobertura: se dice y se pregunta, jamás se estima');
const c3 = fiscal.calcularPeriodo(db, 3, '2026-09');
ok('régimen fuera de tabla → estado sin-cobertura', c3.estado === 'sin-cobertura');
ok('régimen fuera de tabla → CERO vencimientos (ninguna fecha estimada)',
  c3.vencimientos.length === 0);
ok('régimen fuera de tabla → la pregunta única es por la condición frente al IVA',
  !!c3.pregunta && c3.pregunta.campo === 'condicion_iva' && Array.isArray(c3.pregunta.opciones));
const c4 = fiscal.calcularPeriodo(db, 4, '2026-09');
ok('jurisdicción sin tabla (UY) → sin-cobertura + pregunta por jurisdicción + cero fechas',
  c4.estado === 'sin-cobertura' && !!c4.pregunta && c4.pregunta.campo === 'jurisdiccion' && c4.vencimientos.length === 0);
const c7 = fiscal.calcularPeriodo(db, 7, '2026-09');
ok('RI sin CUIT → sin-datos + pregunta por el CUIT + cero fechas',
  c7.estado === 'sin-datos' && !!c7.pregunta && c7.pregunta.campo === 'cuit' && c7.vencimientos.length === 0);
const c6 = fiscal.calcularPeriodo(db, 6, '2026-09');
ok('exento: estado ok, cero vencimientos y la declaración explícita',
  c6.estado === 'ok' && c6.vencimientos.length === 0 && c6.declaraciones.some((d) => /exento/i.test(d)));
ok('fuera de tabla declarado: Ingresos Brutos (provincial) figura en la salida',
  c1.fuera_de_tabla.some((f) => f.clave === 'ingresos-brutos'));

// ---------------------------------------------------------------------------
console.log('— convivencia: calculado + cargado a mano no se duplican');
gesty.setData(db, 1, {
  grupo: 'calendario-fiscal', campo: 'iva',
  valor: { concepto: 'IVA', fecha: '2026-10-22', monto: 150000, moneda: 'ARS' },
  origen: 'dueno', origen_ref: 'carga-manual', cargado_por: 'dueno',
});
const vista = fiscal.vencimientosUnificados(db, 1, { desde: '2026-10-01', hasta: '2026-10-31' });
const del22 = vista.items.filter((i) => i.fecha === '2026-10-22');
ok('la misma obligación en la misma fecha se declara UNA sola vez',
  del22.length === 1, JSON.stringify(del22.map((i) => i.concepto)));
ok('la unificada conserva el monto cargado y cita las DOS fuentes',
  del22.length === 1 && del22[0].monto === 150000 && del22[0].fusionada === true
  && JSON.stringify(del22[0].fuentes) === '["fundamento","calculo"]' && del22[0].regla_id === 'ar-iva-mensual',
  del22.length === 1 ? JSON.stringify(del22[0].fuentes) : '');
const vistaMono = fiscal.vencimientosUnificados(db, 2, { desde: '2026-10-01', hasta: '2026-10-31' });
ok('sin carga manual, el calculado entra solo con su fuente «calculo»',
  vistaMono.items.length === 1 && vistaMono.items[0].fuentes[0] === 'calculo' && vistaMono.items[0].monto === null);

// ---------------------------------------------------------------------------
console.log('— separación por cuenta y resumen');
const cAjeno = fiscal.calcularPeriodo(db, 2, '2026-09');
ok('cuenta 2 no ve el fundamento de la 1: su período trae solo SU monotributo',
  cAjeno.vencimientos.length === 1 && cAjeno.perfil.cuit === '27999999999');
const cVacia = fiscal.calcularPeriodo(db, 8, '2026-09');
ok('cuenta sin fundamento: sin-cobertura con pregunta, cero fechas',
  cVacia.estado === 'sin-cobertura' && cVacia.vencimientos.length === 0 && !!cVacia.pregunta);
const res2 = fiscal.resumenFiscal(db, 2, { hoy: HOY });
ok('resumen de La oficina (monotributo, hoy 24/10): próximo = cuota del 20/11',
  res2.estado === 'ok' && !!res2.proximo && res2.proximo.fecha === '2026-11-20' && res2.en_30_dias >= 1,
  res2.proximo && res2.proximo.fecha);
const res1 = fiscal.resumenFiscal(db, 1, { hoy: HOY });
ok('resumen RI: próximo vencimiento calculado y Ganancias declarada sin confirmar',
  res1.estado === 'ok' && !!res1.proximo && res1.reglas_sin_confirmar.some((r) => r.obligacion === 'Ganancias'));
const tabla = fiscal.tablaDeReglas();
ok('la tabla se expone con sus versiones y fuentes (monotributo ×2, ganancias sin confirmar)',
  tabla.reglas.filter((r) => r.id === 'ar-monotributo-cuota').length === 2
  && tabla.reglas.find((r) => r.id === 'ar-ganancias-anticipos-ddjj').confirmada === false
  && tabla.reglas.every((r) => r.confirmada ? !!r.fuente : !!r.motivo_sin_confirmar));

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido mínimo');
const PORT = 3985;
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g19-'));
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
  const reg = await call('POST', '/api/auth/register', { email: 'g19@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/fiscal/resumen', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/fiscal/resumen', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f.exec('PRAGMA busy_timeout = 5000');
  const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g19@example.com');
  f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'esencial');
  f.close();
  const esencial = await call('GET', '/api/gesty/fiscal/resumen', null, reg.cookie);
  ok('gating http: pack Esencial NO trae la capacidad «agenda» → 403', esencial.status === 403, String(esencial.status));
  const f2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f2.exec('PRAGMA busy_timeout = 5000');
  f2.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'completa');
  f2.close();
  const resumenHttp = await call('GET', '/api/gesty/fiscal/resumen?hoy=2026-10-24', null, reg.cookie);
  ok('http: con pack Completa el resumen responde 200 (cuenta sin fundamento: sin-cobertura honesto)',
    resumenHttp.status === 200 && resumenHttp.data.resumen.estado === 'sin-cobertura' && !!resumenHttp.data.resumen.pregunta,
    JSON.stringify(resumenHttp.data).slice(0, 220));
  const reglasHttp = await call('GET', '/api/gesty/fiscal/reglas', null, reg.cookie);
  ok('http: la tabla de reglas se sirve con sus versiones',
    reglasHttp.status === 200 && reglasHttp.data.reglas.some((r) => r.id === 'ar-iva-mensual' && r.version === '2018.1'),
    JSON.stringify(reglasHttp.data).slice(0, 200));
  const vtosHttp = await call('GET', '/api/gesty/fiscal/vencimientos?periodo=2026-09', null, reg.cookie);
  ok('http: vencimientos por período responde con cálculo + vista unificada',
    vtosHttp.status === 200 && !!vtosHttp.data.calculo && Array.isArray(vtosHttp.data.vista.items),
    JSON.stringify(vtosHttp.data).slice(0, 200));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
