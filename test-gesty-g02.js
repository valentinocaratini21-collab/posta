#!/usr/bin/env node
// test-gesty-g02.js — G-02 · FUNDACIÓN del módulo Gesty (spec:
// gesty-g02-build-spec.md). Cubre los P0:
//   P0-1 · Registro de empleados + gating por pack forzado en servidor.
//   P0-2 · Registro durable de eventos append-only (triggers incluidos),
//          separación por cuenta y payload sin secretos.
//   P0-3 · Fundamento-vista con procedencia en cada dato, corrección
//          del dueño que propaga a las dos vistas, credenciales solo
//          como referencia y datos fiscales que Gesty jamás sobrescribe.
//   P0-4 · Bandeja «Para tu OK»: la matriz en el servidor — sin tarjeta,
//          tarjeta ajena y versión vieja se rechazan Y quedan en el
//          registro; NO existe aprobación masiva; idempotencia (R5);
//          fallo = la tarjeta vuelve con motivo (R6); editar no
//          aprueba (R7); tarjeta vencida no se aprueba (H4); tarjeta
//          «actualizada» no se aprueba hasta regenerarla (§3.4).
// Unidad del módulo (DB :memory:) + wiring estático + flujo HTTP con
// el server booteado. Uso: node test-gesty-g02.js
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

// ---------------- P0-1 · Registro de empleados y gating ----------------
console.log('— P0-1: registro de empleados + gating por pack');
{
  const db = nuevaDb();
  gesty.initGesty(db);
  const empleados = gesty.listEmpleados(db);
  const g = empleados.find((e) => e.id === 'gesty');
  ok('registro: Gesty es el segundo empleado', !!g && empleados.some((e) => e.id === 'posty'));
  ok('registro: color amatista de Gesty (#A175CA)', g && g.color === '#A175CA', g && g.color);
  ok('registro: Gesty declara los 10 tipos de tarjeta de la matriz', g && g.tipos_de_tarjeta.length === 10 && gesty.MATRIX_TIPOS.every((t) => g.tipos_de_tarjeta.includes(t)));
  ok('registro: packs que habilitan a Gesty', g && JSON.stringify(g.packs_que_lo_habilitan) === JSON.stringify(['esencial', 'completa', 'total']));

  ok('gating: sin pack la cuenta NO tiene Gesty (default apagado)', gesty.packOf(db, 1) === 'ninguno' && gesty.gestyEnabled(db, 1) === false);
  const evAntes = gesty.listEvents(db, 1).length;
  gesty.setPack(db, 1, 'esencial', { origen: 'checkout', actor: 'sistema' });
  ok('gating: con pack esencial la cuenta tiene Gesty', gesty.gestyEnabled(db, 1) === true && gesty.packOf(db, 1) === 'esencial');
  const evs = gesty.listEvents(db, 1);
  ok('gating: el cambio de pack queda en el registro (pack-cambiado)', evs.length === evAntes + 1 && evs[evs.length - 1].tipo_evento === 'pack-cambiado');
  gesty.setPack(db, 1, 'esencial', { origen: 'checkout' });
  ok('gating: repetir el mismo pack no duplica el evento', gesty.listEvents(db, 1).length === evs.length);
  ok('gating: pack inválido se rechaza', !!lanza(() => gesty.setPack(db, 1, 'premium')));
  ok('capacidades: Esencial = facturación, cobranzas y comprobantes', gesty.hasCapacidad(db, 1, 'facturacion') && gesty.hasCapacidad(db, 1, 'cobranzas') && gesty.hasCapacidad(db, 1, 'comprobantes'));
  ok('capacidades: Esencial NO incluye WhatsApp ni llamadas', !gesty.hasCapacidad(db, 1, 'whatsapp') && !gesty.hasCapacidad(db, 1, 'llamadas'));
  gesty.setPack(db, 1, 'completa', { origen: 'admin-familia' });
  ok('capacidades: Completa suma las 8 áreas + WhatsApp', gesty.hasCapacidad(db, 1, 'whatsapp') && gesty.hasCapacidad(db, 1, 'presupuestos') && gesty.hasCapacidad(db, 1, 'stock'));
  ok('capacidades: Completa NO incluye llamadas (Total)', !gesty.hasCapacidad(db, 1, 'llamadas'));
  gesty.setPack(db, 1, 'total', { origen: 'checkout' });
  ok('capacidades: Total incluye llamadas y reportes avanzados', gesty.hasCapacidad(db, 1, 'llamadas') && gesty.hasCapacidad(db, 1, 'reportes-avanzados'));
  gesty.setPack(db, 1, 'ninguno', { origen: 'admin' });
  ok('gating: bajar a ninguno apaga el módulo sin tocar el fundamento', gesty.gestyEnabled(db, 1) === false);
  db.close();
}

// ---------------- P0-2 · Registro durable append-only ----------------
console.log('— P0-2: registro durable de eventos');
{
  const db = nuevaDb();
  gesty.initGesty(db);
  gesty.recordEvent(db, 7, { actor: 'gesty', entidad_tipo: 'tarjeta', entidad_id: '5', tipo_evento: 'tarjeta-creada', resumen: 'Para tu OK: prueba', payload: { tipo: 'cobranza' } });
  gesty.recordEvent(db, 7, { actor: 'sistema', tipo_evento: 'rutina-corrida', resumen: 'Rutina de apertura', payload: { api_token: 'NO-DEBE-QUEDAR', n: 2 } });
  gesty.recordEvent(db, 8, { actor: 'gesty', tipo_evento: 'tarjeta-creada', resumen: 'De otra cuenta' });
  const evs = gesty.listEvents(db, 7);
  ok('registro: los eventos se leen en orden y completos', evs.length === 2 && evs[0].tipo_evento === 'tarjeta-creada' && evs[1].tipo_evento === 'rutina-corrida');
  ok('registro: separación por cuenta (la cuenta 8 no se mezcla)', gesty.listEvents(db, 8).length === 1 && gesty.listEvents(db, 9).length === 0);
  ok('registro: el payload limpia claves secretas', evs[1].payload && evs[1].payload.api_token === '[omitido]' && !JSON.stringify(evs).includes('NO-DEBE-QUEDAR'));
  ok('registro: append-only — UPDATE prohibido por trigger', !!lanza(() => db.exec("UPDATE gesty_events SET resumen = 'pisado'")));
  ok('registro: append-only — DELETE prohibido por trigger', !!lanza(() => db.exec('DELETE FROM gesty_events')));
  ok('registro: los eventos sobreviven intactos a los intentos', gesty.listEvents(db, 7).length === 2 && gesty.listEvents(db, 7)[0].resumen === 'Para tu OK: prueba');
  const deTarjeta = gesty.listEvents(db, 7, { entidad_tipo: 'tarjeta', entidad_id: '5' });
  ok('registro: el historial de una entidad se lee del registro', deTarjeta.length === 1 && deTarjeta[0].tipo_evento === 'tarjeta-creada');
  db.close();
}

// ---------------- P0-3 · Fundamento con procedencia ----------------
console.log('— P0-3: fundamento-vista Gesty');
{
  const db = nuevaDb();
  gesty.initGesty(db);
  gesty.setPack(db, 3, 'completa', { origen: 'checkout' });

  ok('fundamento: un dato sin origen_ref NO puede existir', !!lanza(() => gesty.setData(db, 3, { grupo: 'reglas-cobro', campo: 'sena_pct', valor: 30, origen: 'dueno' })));
  ok('fundamento: un origen fuera de la lista se rechaza', !!lanza(() => gesty.setData(db, 3, { grupo: 'reglas-cobro', campo: 'sena_pct', valor: 30, origen: 'inventado', origen_ref: 'x' })));

  const deRubro = gesty.setData(db, 3, { grupo: 'calendario-fiscal', campo: 'vencimiento_iva', valor: 'día 20', origen: 'rubro', origen_ref: 'ficha-rubro', cargado_por: 'gesty' });
  ok('fundamento: origen rubro nace NO confirmado', deRubro.confirmado_por_dueno === false);
  const inferido = gesty.setData(db, 3, { grupo: 'reglas-cobro', campo: 'plazo_habitual', valor: '30 días', origen: 'inferido', origen_ref: 'comprobantes-2026-10', cargado_por: 'gesty' });
  ok('fundamento: origen inferido nace NO confirmado', inferido.confirmado_por_dueno === false);
  const delDueno = gesty.setData(db, 3, { grupo: 'reglas-cobro', campo: 'sena_pct', valor: 30, origen: 'dueno', origen_ref: 'ajustes-gesty', cargado_por: 'dueno' });
  ok('fundamento: lo que dice el dueño nace confirmado', delDueno.confirmado_por_dueno === true);
  ok('fundamento: todo dato guardado lleva origen + origen_ref', gesty.getData(db, 3).every((d) => d.origen && d.origen_ref));
  const sinProc = db.prepare("SELECT COUNT(*) AS n FROM gesty_foundation WHERE COALESCE(origen_ref,'') = ''").get();
  ok('fundamento: auditoría — cero datos sin procedencia en la base', sinProc.n === 0);

  const versionAntes = gesty.foundationVersion(db, 3);
  const corr = gesty.correctData(db, 3, inferido.id, { valor: '15 días', actor: 'dueno' });
  ok('corrección: la vista del dueño muestra el valor nuevo', gesty.foundationForOwner(db, 3).datos.find((d) => d.id === inferido.id).valor === '15 días');
  const aprendido = gesty.learnedView(db, 3);
  const enAprendido = (aprendido.grupos['Cómo cobrás'] || []).find((d) => d.id === inferido.id);
  ok('corrección: «Lo que Gesty aprendió» muestra el MISMO valor nuevo (una sola verdad)', !!enAprendido && enAprendido.valor === '15 días');
  ok('corrección: el dato corregido queda confirmado por el dueño', corr.dato.confirmado_por_dueno === true);
  ok('corrección: el historial guarda anterior → nuevo', corr.dato.historial.length === 1 && corr.dato.historial[0].valor_anterior === '30 días' && corr.dato.historial[0].valor_nuevo === '15 días');
  ok('corrección: sube la versión del fundamento', gesty.foundationVersion(db, 3) === versionAntes + 1);
  ok('corrección: queda el evento dato-corregido con anterior/nuevo', gesty.listEvents(db, 3).some((e) => e.tipo_evento === 'dato-corregido' && e.payload && e.payload.anterior === '30 días' && e.payload.nuevo === '15 días'));
  ok('corrección: la vista aprendida dice el origen en lenguaje llano', !!enAprendido && /dedujo Gesty/.test(enAprendido.origen_legible));
  ok('corrección: solo el dueño corrige (Gesty no se corrige sola)', !!lanza(() => gesty.correctData(db, 3, delDueno.id, { valor: 50, actor: 'gesty' })));
  ok('corrección: un dato de OTRA cuenta no se puede corregir', !!lanza(() => gesty.correctData(db, 99, delDueno.id, { valor: 50, actor: 'dueno' })));

  // Datos fiscales: Gesty crea desde el primer papel, jamás sobrescribe.
  gesty.setData(db, 3, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Luna SRL', origen: 'comprobante', origen_ref: 'comp-1', cargado_por: 'gesty' });
  ok('fiscales: Gesty NO puede sobrescribir un dato fiscal existente', !!lanza(() => gesty.setData(db, 3, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Otra SA', origen: 'comprobante', origen_ref: 'comp-2', cargado_por: 'gesty' })));
  const fiscal = gesty.getData(db, 3, { grupo: 'datos-fiscales' })[0];
  gesty.correctData(db, 3, fiscal.id, { valor: 'Luna Hermanos SRL', actor: 'dueno' });
  ok('fiscales: el dueño SÍ corrige su dato fiscal', gesty.getData(db, 3, { grupo: 'datos-fiscales' })[0].valor === 'Luna Hermanos SRL');

  // Credenciales: solo la referencia; el secreto jamás entra.
  ok('credenciales: guardar el secreto en claro se RECHAZA', !!lanza(() => gesty.setData(db, 3, { grupo: 'datos-fiscales', campo: 'credencial_emision', valor: 'mi-clave-secreta', origen: 'dueno', origen_ref: 'ajustes', cargado_por: 'dueno' })));
  gesty.setData(db, 3, { grupo: 'datos-fiscales', campo: 'credencial_emision', valor: { ref: 'vault:gesty/3/emision' }, origen: 'dueno', origen_ref: 'ajustes', cargado_por: 'dueno' });
  const vistaDueno = gesty.foundationForOwner(db, 3);
  const cred = vistaDueno.datos.find((d) => d.campo === 'credencial_emision');
  ok('credenciales: con referencia se guarda, marcada sensible', !!cred && cred.sensible === true);
  ok('credenciales: la API del dueño muestra ESTADO, nunca el valor ni la referencia', cred.valor === null && cred.valor_estado === 'cargado' && !JSON.stringify(vistaDueno).includes('vault:gesty'));
  ok('credenciales: el registro de eventos tampoco las filtra', !JSON.stringify(gesty.listEvents(db, 3)).includes('mi-clave-secreta') && !JSON.stringify(gesty.listEvents(db, 3)).includes('vault:gesty'));
  db.close();
}

// ---------------- P0-4 · Bandeja y matriz en el servidor ----------------
console.log('— P0-4: bandeja «Para tu OK» y matriz');
{
  const db = nuevaDb();
  gesty.initGesty(db);
  gesty.setPack(db, 5, 'total', { origen: 'checkout' });
  gesty.setPack(db, 6, 'total', { origen: 'checkout' });

  ok('matriz: crear una tarjeta de un tipo fuera de la matriz se rechaza', !!lanza(() => gesty.createCard(db, 5, { tipo: 'publicar-posteo', titulo: 'x' })));
  ok('matriz: el módulo NO exporta ninguna aprobación masiva (R3)', !Object.keys(gesty).some((k) => /all|masiv|todo/i.test(k)), Object.keys(gesty).join(','));

  // Ejecutor de cobranza (motor de área de mentira): cuenta ejecuciones.
  let ejecucionesCobranza = 0;
  gesty.registerExecutor('cobranza', () => { ejecucionesCobranza++; return { ok: true, comprobante: 'wa-123', evento: 'mensaje-enviado', resumen: 'Mensaje de cobranza enviado' }; });
  // Ejecutor de emisión inestable: falla la primera, anda la segunda.
  let intentosEmision = 0;
  gesty.registerExecutor('factura-emision', () => { intentosEmision++; if (intentosEmision === 1) return { ok: false, motivo: 'El emisor no responde' }; return { ok: true, comprobante: 'CAE-999' }; });

  // Flujo feliz de punta a punta (aceptación §4).
  const t1 = gesty.createCard(db, 5, { tipo: 'cobranza', titulo: 'Cobrar la factura 12', detalle: { mensaje: 'Hola, vence el 10' }, monto: 1500, moneda: 'ARS' });
  ok('tarjeta: nace esperando, versión 1, en la bandeja', t1.estado === 'esperando' && t1.version_documento === 1 && gesty.countPending(db, 5) === 1);
  const ap = gesty.approveCard(db, 5, t1.id, { version_documento: 1, usuario: 'dueno' });
  ok('aprobación: aprobar con tarjeta y versión vigente EJECUTA', ap.ok === true && ejecucionesCobranza === 1);
  ok('aprobación: la tarjeta se sella (sale de la fila)', ap.card.estado === 'aprobada' && gesty.countPending(db, 5) === 0);
  ok('aprobación: el registro guarda quién, cuándo y qué versión', !!ap.approval && ap.approval.usuario === 'dueno' && ap.approval.version_documento === 1 && !!ap.approval.ts);
  const evsT1 = gesty.listEvents(db, 5, { entidad_tipo: 'tarjeta', entidad_id: String(t1.id) });
  ok('aprobación: el registro reconstruye creada → aprobada → ejecución con comprobante', evsT1.some((e) => e.tipo_evento === 'tarjeta-creada') && evsT1.some((e) => e.tipo_evento === 'tarjeta-aprobada') && evsT1.some((e) => e.tipo_evento === 'mensaje-enviado' && e.comprobante_externo === 'wa-123'));

  // R5 · Doble toque: una sola ejecución.
  const ap2 = gesty.approveCard(db, 5, t1.id, { version_documento: 1, usuario: 'dueno' });
  ok('idempotencia: el doble toque devuelve el resultado registrado SIN ejecutar de nuevo', ap2.ok === true && ap2.idempotente === true && ejecucionesCobranza === 1);

  // Rechazos de la matriz (aceptación §4: las tres quedan en el log).
  const rSin = gesty.approveCard(db, 5, 99999, { version_documento: 1, usuario: 'dueno' });
  ok('matriz: aprobar SIN tarjeta previa se rechaza', rSin.ok === false && rSin.motivo === 'tarjeta-inexistente');
  const tAjena = gesty.createCard(db, 6, { tipo: 'cobranza', titulo: 'De la cuenta 6' });
  const rAjena = gesty.approveCard(db, 5, tAjena.id, { version_documento: 1, usuario: 'dueno' });
  ok('matriz: aprobar una tarjeta AJENA se rechaza', rAjena.ok === false && rAjena.motivo === 'tarjeta-ajena');
  const tVer = gesty.createCard(db, 5, { tipo: 'presupuesto', titulo: 'Presupuesto mesa' });
  gesty.editCard(db, 5, tVer.id, { detalle: { total: 2000 } });
  const rVieja = gesty.approveCard(db, 5, tVer.id, { version_documento: 1, usuario: 'dueno' });
  ok('matriz: aprobar con la versión VIEJA del documento se rechaza', rVieja.ok === false && rVieja.motivo === 'version-vieja');
  ok('matriz: los tres rechazos quedaron en el registro', gesty.listEvents(db, 5).filter((e) => e.tipo_evento === 'aprobacion-rechazada').length >= 3);
  ok('matriz: la tarjeta de la cuenta 6 sigue esperando (nadie la tocó)', gesty.getCard(db, 6, tAjena.id).estado === 'esperando');

  // Sin motor de área (presupuesto): se sella como registrada, sin fingir.
  const apSinMotor = gesty.approveCard(db, 5, tVer.id, { version_documento: 2, usuario: 'dueno' });
  const evSinMotor = gesty.listEvents(db, 5, { entidad_tipo: 'tarjeta', entidad_id: String(tVer.id) }).find((e) => e.tipo_evento === 'tarjeta-aprobada');
  ok('fundación: sin motor de área, la aprobación se sella SIN fingir ejecución externa', apSinMotor.ok === true && evSinMotor && evSinMotor.payload.ejecucion === 'sin-motor-g02');

  // Vencida no se aprueba; la que vence HOY (solo fecha) sí.
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const tVenc = gesty.createCard(db, 5, { tipo: 'presupuesto', titulo: 'Presupuesto vencido', vence: ayer });
  const rVenc = gesty.approveCard(db, 5, tVenc.id, { version_documento: 1, usuario: 'dueno' });
  ok('vencimiento: una tarjeta vencida NO se puede aprobar', rVenc.ok === false && rVenc.motivo === 'tarjeta-vencida');
  const hoy = new Date().toISOString().slice(0, 10);
  const tHoy = gesty.createCard(db, 5, { tipo: 'presupuesto', titulo: 'Vence hoy', vence: hoy });
  ok('vencimiento: la que vence hoy (solo fecha) todavía se puede aprobar', gesty.approveCard(db, 5, tHoy.id, { version_documento: 1, usuario: 'dueno' }).ok === true);

  // R6 · Fallo del canal: la tarjeta VUELVE con motivo; reintento en un toque.
  const tEmi = gesty.createCard(db, 5, { tipo: 'factura-emision', titulo: 'Emitir factura A' });
  const rFallo = gesty.approveCard(db, 5, tEmi.id, { version_documento: 1, usuario: 'dueno' });
  ok('fallo: si la ejecución falla, la aprobación NO se da por buena', rFallo.ok === false && rFallo.devuelta === true);
  const tDevuelta = gesty.getCard(db, 5, tEmi.id);
  ok('fallo: la tarjeta vuelve esperando, con el motivo en una línea', tDevuelta.estado === 'devuelta' && tDevuelta.motivo === 'El emisor no responde' && gesty.countPending(db, 5) >= 1);
  ok('fallo: NO hay evento de éxito falso', !gesty.listEvents(db, 5, { entidad_tipo: 'tarjeta', entidad_id: String(tEmi.id) }).some((e) => e.tipo_evento === 'tarjeta-aprobada'));
  const rReintento = gesty.approveCard(db, 5, tEmi.id, { version_documento: 1, usuario: 'dueno' });
  ok('fallo: el reintento sobre la MISMA tarjeta ejecuta (segundo intento)', rReintento.ok === true && intentosEmision === 2);

  // R7 · Frenar saca de la fila y no se puede aprobar frenada.
  const tFren = gesty.createCard(db, 5, { tipo: 'orden-compra', titulo: 'Orden de compra' });
  gesty.stopCard(db, 5, tFren.id, { usuario: 'dueno' });
  ok('frenar: la tarjeta sale de la fila y queda registrada', gesty.getCard(db, 5, tFren.id).estado === 'frenada' && gesty.listEvents(db, 5, { entidad_tipo: 'tarjeta', entidad_id: String(tFren.id) }).some((e) => e.tipo_evento === 'tarjeta-frenada'));
  ok('frenar: una tarjeta frenada no se aprueba', gesty.approveCard(db, 5, tFren.id, { version_documento: 1, usuario: 'dueno' }).ok === false);

  // §3.4/H4 · Fundamento corregido debajo del borrador → «actualizada».
  const datoBase = gesty.setData(db, 5, { grupo: 'reglas-cobro', campo: 'medio_cobro', valor: 'transferencia', origen: 'dueno', origen_ref: 'ajustes', cargado_por: 'dueno' });
  const tAct = gesty.createCard(db, 5, { tipo: 'cobranza', titulo: 'Cobrar con el medio viejo', usa_datos: [datoBase.id] });
  const corrAct = gesty.correctData(db, 5, datoBase.id, { valor: 'link de pago', actor: 'dueno' });
  ok('actualizada: corregir el dato marca la tarjeta que lo usa', corrAct.tarjetas_actualizadas === 1 && gesty.getCard(db, 5, tAct.id).actualizada === true);
  const rAct = gesty.approveCard(db, 5, tAct.id, { version_documento: 1, usuario: 'dueno' });
  ok('actualizada: NO se aprueba hasta regenerar el borrador', rAct.ok === false && rAct.motivo === 'tarjeta-actualizada');
  const tRegen = gesty.editCard(db, 5, tAct.id, { detalle: { medio: 'link de pago' } });
  ok('actualizada: editar regenera (versión+1, marca limpia, sigue esperando)', tRegen.actualizada === false && tRegen.version_documento === 2 && tRegen.estado === 'esperando');
  ok('actualizada: regenerada, se aprueba con la versión nueva', gesty.approveCard(db, 5, tAct.id, { version_documento: 2, usuario: 'dueno' }).ok === true);

  // R10 · Orden de la fila: el caso sensible encabeza.
  const tNormal = gesty.createCard(db, 5, { tipo: 'presupuesto', titulo: 'Común' });
  const tSensible = gesty.createCard(db, 5, { tipo: 'caso-sensible', titulo: 'Reclamo escalado' });
  const fila = gesty.listCards(db, 5, {});
  ok('orden: el caso sensible encabeza la fila aunque se creó después', fila.length >= 2 && fila[0].id === tSensible.id && fila[fila.length - 1].id === tNormal.id);
  db.close();
}

// ---------------- Wiring estático ----------------
console.log('— wiring estático');
{
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const iGesty = srv.indexOf("app.get('/api/gesty/estado'");
  const iCatch = srv.indexOf("\napp.get('*', (req, res)");
  ok('server: monta el módulo gesty', srv.includes("require('./gesty')") && srv.includes('gesty.initGesty(db)'));
  ok('server: las rutas /api/gesty/* existen y van ANTES del catch-all', iGesty > 0 && iCatch > iGesty);
  ok('server: las rutas del módulo van detrás de requireAuth + gating', srv.includes("gesty.gestyMiddleware(db)"));
  ok('server: NO existe ruta de aprobación masiva para Gesty (R3)', !/gesty[^\n]*(aprobar-todo|approve-all|aprobar_todo)/i.test(srv) && !srv.includes('/api/gesty/bandeja/aprobar'));
  ok('server: la ruta de aprobación es por tarjeta (:id/aprobar)', srv.includes("app.post('/api/gesty/bandeja/:id/aprobar'"));
  ok('server: BUILD_ID presente y con la convención vigente (el módulo no lo gestiona)', /const BUILD_ID = '[0-9]{8}-v[0-9]+';/.test(srv));
}

// ---------------- HTTP: flujo completo ----------------
const PORT = 3996;
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

(async () => {
  console.log('— http: gating y bandeja con el server booteado');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
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

    const reg = await call('POST', '/api/auth/register', { email: 'gesty@example.com', password: 'secreto1' });
    ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
    const estado0 = await call('GET', '/api/gesty/estado', null, reg.cookie);
    ok('gating http: /estado dice enabled:false sin pack', estado0.status === 200 && estado0.data.enabled === false && estado0.data.pack === 'ninguno');
    const fund403 = await call('GET', '/api/gesty/fundamento', null, reg.cookie);
    ok('gating http: sin pack, el fundamento responde 403', fund403.status === 403, String(fund403.status));
    const band403 = await call('GET', '/api/gesty/bandeja', null, reg.cookie);
    ok('gating http: sin pack, la bandeja responde 403', band403.status === 403, String(band403.status));
    const sinSesion = await call('GET', '/api/gesty/bandeja', null, '');
    ok('gating http: sin sesión responde 401 (como toda la app)', sinSesion.status === 401, String(sinSesion.status));

    // El pack se aplica del lado admin (sin checkout): fila directa en
    // el registro de suscripción, como haría el admin de la familia.
    const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
    dbFile.exec('PRAGMA busy_timeout = 5000');
    const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('gesty@example.com');
    dbFile.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'completa', 'admin-familia')").run(u.id);
    dbFile.close();

    const estado1 = await call('GET', '/api/gesty/estado', null, reg.cookie);
    ok('gating http: con pack admin-familia, /estado dice enabled:true', estado1.data.enabled === true && estado1.data.pack === 'completa');
    const modulo = await call('GET', '/api/gesty/modulo', null, reg.cookie);
    ok('módulo http: se presenta Gesty con su color y su pack', modulo.status === 200 && modulo.data.empleado && modulo.data.empleado.id === 'gesty' && modulo.data.empleado.color === '#A175CA');
    const fund200 = await call('GET', '/api/gesty/fundamento', null, reg.cookie);
    ok('fundamento http: con pack responde 200 y vacío correcto', fund200.status === 200 && fund200.data.fundamento.datos.length === 0);

    const datoHttp = await call('POST', '/api/gesty/fundamento', { grupo: 'contador', campo: 'email', valor: 'estudio@contadores.com' }, reg.cookie);
    ok('fundamento http: el dueño carga un dato (origen dueno, confirmado)', datoHttp.status === 200 && datoHttp.data.dato.confirmado_por_dueno === true);
    const aprendido = await call('GET', '/api/gesty/aprendido', null, reg.cookie);
    ok('fundamento http: «Lo que Gesty aprendió» lo muestra en su grupo llano', aprendido.status === 200 && (aprendido.data.aprendido.grupos['Tu contador'] || []).length === 1);

    const creada = await call('POST', '/api/gesty/bandeja', { tipo: 'presupuesto', titulo: 'Presupuesto HTTP', detalle: { total: 900 }, monto: 900, moneda: 'ARS' }, reg.cookie);
    ok('bandeja http: crear la tarjeta la deja esperando', creada.status === 200 && creada.data.tarjeta.estado === 'esperando', JSON.stringify(creada.data).slice(0, 160));
    const cardId = creada.data.tarjeta.id;
    const rViejaHttp = await call('POST', `/api/gesty/bandeja/${cardId}/aprobar`, { version_documento: 99 }, reg.cookie);
    ok('bandeja http: aprobar con versión vieja → 400 version-vieja', rViejaHttp.status === 400 && rViejaHttp.data.motivo === 'version-vieja', JSON.stringify(rViejaHttp.data).slice(0, 160));
    const rOkHttp = await call('POST', `/api/gesty/bandeja/${cardId}/aprobar`, { version_documento: 1 }, reg.cookie);
    ok('bandeja http: aprobar con la versión vigente → 200 y tarjeta sellada', rOkHttp.status === 200 && rOkHttp.data.tarjeta.estado === 'aprobada', JSON.stringify(rOkHttp.data).slice(0, 160));
    const rDobleHttp = await call('POST', `/api/gesty/bandeja/${cardId}/aprobar`, { version_documento: 1 }, reg.cookie);
    ok('bandeja http: el doble toque devuelve idempotente, sin re-ejecutar', rDobleHttp.status === 200 && rDobleHttp.data.idempotente === true);
    const eventos = await call('GET', '/api/gesty/eventos', null, reg.cookie);
    const tiposEv = (eventos.data.eventos || []).map((e) => e.tipo_evento);
    ok('registro http: la historia completa está en el registro durable', tiposEv.includes('tarjeta-creada') && tiposEv.includes('aprobacion-rechazada') && tiposEv.includes('tarjeta-aprobada'), tiposEv.join(','));

    // Segunda cuenta CON pack: no aprueba tarjetas ajenas ni ve el fundamento ajeno.
    const regB = await call('POST', '/api/auth/register', { email: 'otra@example.com', password: 'secreto2' });
    const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
    dbFile2.exec('PRAGMA busy_timeout = 5000');
    const uB = dbFile2.prepare('SELECT id FROM users WHERE email = ?').get('otra@example.com');
    dbFile2.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'total', 'checkout')").run(uB.id);
    dbFile2.close();
    const creada2 = await call('POST', '/api/gesty/bandeja', { tipo: 'cobranza', titulo: 'Tarjeta de A' }, reg.cookie);
    const rAjenaHttp = await call('POST', `/api/gesty/bandeja/${creada2.data.tarjeta.id}/aprobar`, { version_documento: 1 }, regB.cookie);
    ok('bandeja http: otra cuenta NO aprueba la tarjeta ajena (400 tarjeta-ajena)', rAjenaHttp.status === 400 && rAjenaHttp.data.motivo === 'tarjeta-ajena', JSON.stringify(rAjenaHttp.data).slice(0, 160));
    const fundB = await call('GET', '/api/gesty/fundamento', null, regB.cookie);
    ok('fundamento http: la otra cuenta ve SU fundamento (vacío), nunca el ajeno', fundB.status === 200 && fundB.data.fundamento.datos.length === 0);
  } finally {
    child.kill('SIGKILL');
  }
  console.log(`\n${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
