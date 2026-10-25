// =====================================================================
// GESTY · G-21 — CIERRE DEL DÍA (+ la rutina diaria)
// Spec: gesty-cola-builds.md G-21 · gesty-sistema-operativo.md §3
// (el cierre del día es la pieza de «la oficina» que el dueño lee
// todos los días) · build-spec §13 (la foto de caja de Reportes).
//
// EL CIERRE ES UNA FOTO DURABLE, NO UNA VISTA. A diferencia de la
// agenda (G-09) o el calendario calculado (G-19) — vistas que se
// componen en cada lectura —, el cierre del día es un MENSAJE que
// se genera y se entrega: su contenido queda congelado en
// gesty_cierres_dia por (cuenta, fecha, versión). Regenerar el
// cierre de una fecha crea una VERSIÓN NUEVA declarada (la anterior
// queda en el historial, marcada por la que la reemplaza): para una
// misma fecha puede haber varias versiones, pero UNA vigente — la
// última. Nada se pisa en silencio y nada se duplica «porque sí»:
// el historial dice cuántas veces se generó y cuál vale.
//
// TODO NÚMERO CITA SU FUENTE. El cierre se compone SOLO de
// registros reales de las áreas, cada uno con su procedencia:
//   · qué entró hoy — papeles de G-03 (gesty_comprobantes: su
//     marca de nacimiento created_at ES el instante de ingesta;
//     el reloj inyectable elige el día, el papel aporta su marca),
//     cobros registrados en facturas de G-04 (pagos[] con su fecha
//     dato) y pagos a proveedores asentados en G-07
//     (pagosDelPeriodo, el mismo libro que lee el cierre G-06).
//   · qué vence mañana — la vista compuesta de G-09 para mañana
//     (componerAgenda con hoy = la fecha del cierre): cada ítem ya
//     trae su fuente {area, entidad, id}; el arrastre de vencidas
//     abiertas (agendaHoy) se declara APARTE, no se mezcla con
//     «mañana».
//   · qué espera tu OK — la bandeja de G-02 tal cual está
//     (listCards pendientes + countPending), por tipo, con los
//     ids de las tarjetas. El cierre las CUENTA: jamás las toca.
//   · la foto de caja — entró/salió del día por moneda (de los
//     registros de arriba, no de una proyección) + la proyección
//     corta de G-06 (pronosticoCaja, 7 días) con su cobertura tal
//     cual la declara el motor. El «queda» de la proyección es el
//     neto acumulado desde cero: NO hay saldo inicial registrado
//     en el sistema y el cierre lo repite — inventar un saldo de
//     apertura sería el primer número falso del producto.
// Lo que una fuente no puede dar se DECLARA (lista
// `declaraciones`), nunca se rellena.
//
// DÍA VACÍO = MENSAJE CORTO Y HONESTO. Si no entró ningún papel,
// no se registró ningún cobro ni pago, mañana no vence nada y la
// bandeja está vacía, el texto lo dice en tres frases y nada más
// («Hoy no entró ningún papel nuevo ni se registraron cobros o
// pagos. Mañana no vence nada. Nada espera tu OK.»). Ningún texto
// del cierre felicita, celebra ni rellena: cada frase nace de un
// conteo verificable.
//
// LA RUTINA DIARIA VIVE ACÁ (lo declararon G-05, G-18 y G-20:
// «el disparo diario lo agenda G-21»). correrRutinaDiaria corre
// en orden los escaneos ya construidos, cada uno con su reloj
// inyectable y su resultado registrado en UN evento durable:
//   1) recordatorios de agenda (G-09 · procesarRecordatorios)
//   2) escaneo de vencimientos de cobranzas (G-05)
//   3) escaneo de huecos (G-18)
//   4) escaneo de patrones aprendidos (G-20)
//   5) escaneo de conciliación (G-17)
// Si un escaneo falla, la rutina lo declara en su paso
// ({estado: 'error', detalle}) y sigue con los demás: un escaneo
// caído no frena el día ni inventa su resultado. La rutina NO
// aprueba, NO emite, NO cobra, NO paga ni envía mensajes de
// negocio: los escaneos PREPARAN (tarjetas, propuestas, huecos) y
// el dueño decide. Los únicos envíos posibles son los
// recordatorios internos de G-09, que ya son autopilot de la
// matriz (§5) — y quedan registrados por G-09 con su entrega
// real, como siempre.
//
// ENTREGA: el cierre se entrega por el canal push de la casa
// (patrón G-09: inyectable por configure; server.js inyecta
// push.sendPush). La entrega REAL queda registrada en la fila del
// cierre y en el registro durable: si el canal no entregó, la
// fila lo dice ('sin-entrega:…') — jamás se registra un envío
// que no ocurrió. Horario y activación viven en el fundamento
// (reglas-dueno · cierre-del-dia; default DECLARADO: 19:00,
// activo).
//
// H-G21-1 · EL DISPARO PROGRAMADO: en el server no existe un
// programador diario POR CUENTA para Gesty (los setInterval del
// server son limpiezas y rituales de Posty, no un cron por
// cuenta). La rutina, el cierre y su entrega quedan invocables
// por endpoint (los corre el dueño, o el front al abrir la app a
// la hora configurada); enganchar el cron diario por cuenta —
// con la hora del fundamento y la zona del negocio — es el
// hueco declarado de este build. Ningún disparo se finge.
//
// RELOJ INYECTABLE: toda función pública acepta opts.hoy
// (YYYY-MM-DD) y trabaja «como si» fuera ese día (lección del
// fix de Cobranzas G-08: ningún cálculo usa la fecha del sistema
// cuando el llamador pasó la suya).
// =====================================================================
'use strict';

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');
const facturacion = require('./gesty-facturacion');
const proveedores = require('./gesty-proveedores');
const agenda = require('./gesty-agenda');
const reportes = require('./gesty-reportes');
const cobranzas = require('./gesty-cobranzas');
const huecos = require('./gesty-huecos');
const reglas = require('./gesty-reglas');
const conciliacion = require('./gesty-conciliacion');

// ---------------------------------------------------------------------------
// Utilidades (el patrón de la casa: cada módulo trae las suyas)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function esHora(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || '')); }
function addDias(iso, n) {
  const t = Date.parse(String(iso).slice(0, 10)) + Number(n) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function fmtMonto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safeJson(s, def) { try { const v = JSON.parse(s); return v === null || v === undefined ? def : v; } catch (e) { return def; } }
function monedaKey(m) { return normTexto(m).toUpperCase() || 'SIN-MONEDA'; }
// El reloj del llamador manda: opts.hoy válido o, en su defecto, hoy.
function hoyDe(opts) { const o = opts || {}; return esFechaISO(o.hoy) ? String(o.hoy) : hoyISO(); }
// La fecha del cierre: opts.fecha manda; si no, opts.hoy; si no, hoy.
function fechaDe(opts) {
  const o = opts || {};
  if (esFechaISO(o.fecha)) return String(o.fecha);
  return hoyDe(o);
}

const CONFIG_DEFAULT = { hora: '19:00', activo: true };
const MAX_ITEMS = 20; // por sección: el cierre cita; el detalle vive en cada área

// ---------------------------------------------------------------------------
// Configuración inyectable: el canal de notificaciones de la app.
// Por default se resuelve push.js (Web Push / VAPID) de forma perezosa;
// server.js inyecta su instancia y los tests, una falsa.
// ---------------------------------------------------------------------------

let notifyInyectado = null;
function configure(opts) {
  const o = opts || {};
  if (typeof o.notify === 'function') notifyInyectado = o.notify;
}
async function notificar(userId, payload) {
  if (notifyInyectado) return notifyInyectado(userId, payload);
  try {
    const push = require('./push');
    return await push.sendPush(userId, payload);
  } catch (e) {
    return { ok: false, reason: 'push-no-disponible' };
  }
}

// ---------------------------------------------------------------------------
// Esquema propio (idempotente): la foto durable del cierre.
// Una fila por (cuenta, fecha, versión); la vigente es la mayor
// versión de la fecha. El contenido va congelado en JSON tal como
// se compuso: la historia no se reescribe.
// ---------------------------------------------------------------------------

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_cierres_dia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    contenido TEXT NOT NULL DEFAULT '{}',
    texto TEXT NOT NULL DEFAULT '',
    texto_resumen TEXT NOT NULL DEFAULT '',
    entrega TEXT NOT NULL DEFAULT '',
    generado_por TEXT NOT NULL DEFAULT 'dueno',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_cierres_dia_version ON gesty_cierres_dia (user_id, fecha, version)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_cierres_dia_fecha ON gesty_cierres_dia (user_id, fecha)');
}

// ---------------------------------------------------------------------------
// Configuración del cierre (fundamento · reglas del dueño)
// ---------------------------------------------------------------------------

function getConfig(db, userId) {
  gesty.ensureSchema(db);
  const dato = gesty.getData(db, userId, { grupo: 'reglas-dueno' }).find((d) => d.campo === 'cierre-del-dia');
  const v = dato && dato.valor && typeof dato.valor === 'object' && !Array.isArray(dato.valor) ? dato.valor : {};
  return {
    hora: esHora(v.hora) ? String(v.hora) : CONFIG_DEFAULT.hora,
    activo: v.activo === undefined ? CONFIG_DEFAULT.activo : !!v.activo,
    es_default: !dato,
  };
}

function setConfig(db, userId, cambios) {
  const actual = getConfig(db, userId);
  const c = cambios || {};
  const nueva = {
    hora: c.hora === undefined ? actual.hora : String(c.hora),
    activo: c.activo === undefined ? actual.activo : !!c.activo,
  };
  if (!esHora(nueva.hora)) fail('La hora del cierre del día tiene que ser HH:MM (24 h).');
  gesty.setData(db, userId, {
    grupo: 'reglas-dueno', campo: 'cierre-del-dia', valor: nueva,
    origen: 'dueno', origen_ref: 'ajustes-cierre-dia', cargado_por: 'dueno',
  });
  return getConfig(db, userId);
}

// ---------------------------------------------------------------------------
// LAS FUENTES — cada sección lee de su área y cita su procedencia
// ---------------------------------------------------------------------------

// Papeles que ENTRARON en la fecha: la marca de nacimiento del
// papel (created_at) es el instante real de ingesta. Se pagina la
// lista de G-03 (tope declarado) y se filtra por esa marca.
function papelesQueEntraron(db, userId, fecha, declaraciones) {
  const TOPE = 2000;
  const entraron = [];
  let total = 0;
  let offset = 0;
  for (;;) {
    const { comprobantes: pagina, total: tot } = comprobantes.listComprobantes(db, userId, { limit: 500, offset, incluir_duplicados: true });
    total = tot;
    for (const c of pagina) {
      if (String(c.creado_en || '').slice(0, 10) === fecha) entraron.push(c);
    }
    offset += pagina.length;
    if (!pagina.length || offset >= tot || offset >= TOPE) break;
  }
  if (total > TOPE) declaraciones.push(`La cuenta tiene ${total} papeles y la lectura del día se topó en ${TOPE}: el conteo de papeles que entraron puede estar incompleto.`);
  const salida = {
    cantidad: entraron.length, leidos: 0, en_revision: 0, duplicados: 0, sin_monto: 0,
    por_moneda: {}, items: [],
  };
  for (const c of entraron) {
    const esDup = c.duplicado_de !== null && c.duplicado_de !== undefined || c.estado_lectura === 'duplicado';
    if (esDup) salida.duplicados++;
    else if (c.estado_lectura === 'leido') salida.leidos++;
    else salida.en_revision++;
    const monto = c.monto_total !== null && c.monto_total !== undefined ? Number(c.monto_total)
      : (c.monto_neto !== null && c.monto_neto !== undefined ? Number(c.monto_neto) : null);
    if (monto === null || !Number.isFinite(monto)) salida.sin_monto++;
    else {
      const k = monedaKey(c.moneda);
      const pm = salida.por_moneda[k] || (salida.por_moneda[k] = { cantidad: 0, monto: 0 });
      pm.cantidad++; pm.monto = round2(pm.monto + monto);
    }
    if (salida.items.length < MAX_ITEMS) {
      salida.items.push({
        id: c.id, tipo: c.tipo, direccion: c.direccion, numero: c.numero || '',
        contraparte: c.direccion === 'recibida' ? (c.emisor.nombre || '') : (c.receptor.nombre || ''),
        monto, moneda: c.moneda || '', estado_lectura: c.estado_lectura,
        fuente: { entidad: 'comprobante', id: c.id, detalle: `Papel ${c.tipo} ${c.numero || ''} (${c.direccion}) ingresado el ${fecha}`.trim() },
      });
    }
  }
  return salida;
}

// Cobros registrados en la fecha: los pagos de las facturas de
// G-04 traen su fecha como DATO (la declaró quien registró el
// cobro) — es la fecha del cobro, no una marca del sistema.
function cobrosDelDia(db, userId, fecha) {
  const salida = { cantidad: 0, por_moneda: {}, items: [] };
  const { facturas } = facturacion.listFacturas(db, userId, { limit: 1000 });
  for (const f of facturas) {
    for (const p of f.pagos || []) {
      if (String(p.fecha || '') !== fecha) continue;
      const monto = Number(p.monto) || 0;
      salida.cantidad++;
      const k = monedaKey(f.moneda);
      salida.por_moneda[k] = round2((salida.por_moneda[k] || 0) + monto);
      if (salida.items.length < MAX_ITEMS) {
        salida.items.push({
          factura_id: f.id, numero: f.numero, cliente: (f.cliente && f.cliente.nombre) || '',
          monto, moneda: f.moneda || '', medio: p.medio || '',
          fuente: { entidad: 'factura', id: f.id, detalle: `Cobro de ${f.moneda || ''} ${fmtMonto(monto)} registrado en la factura ${f.numero}` },
        });
      }
    }
  }
  return salida;
}

// Pagos a proveedores asentados en la fecha: el libro de G-07
// (pagosDelPeriodo, el mismo que lee el cierre mensual G-06).
function pagosProveedoresDelDia(db, userId, fecha) {
  const { pagos } = proveedores.pagosDelPeriodo(db, userId, { desde: fecha, hasta: fecha });
  const salida = { cantidad: pagos.length, por_moneda: {}, items: [] };
  for (const p of pagos) {
    const k = monedaKey(p.moneda);
    salida.por_moneda[k] = round2((salida.por_moneda[k] || 0) + (Number(p.monto) || 0));
    if (salida.items.length < MAX_ITEMS) {
      salida.items.push({
        pago_id: p.id, orden_id: p.orden_id,
        proveedor: p.proveedor ? (p.proveedor.nombre || '') : '',
        monto: Number(p.monto) || 0, moneda: p.moneda || '', fecha: p.fecha,
        fuente: { entidad: 'pago-proveedor', id: p.id, detalle: `Asiento de pago de la orden ${p.orden_id} (Proveedores, G-07)` },
      });
    }
  }
  return salida;
}

// Lo que espera el OK del dueño: la bandeja de G-02 tal cual
// está. El cierre la lee y la cuenta — jamás la toca.
function esperaOk(db, userId) {
  const tarjetas = gesty.listCards(db, userId, {});
  const porTipo = {};
  for (const t of tarjetas) {
    const g = porTipo[t.tipo] || (porTipo[t.tipo] = { cantidad: 0, tarjetas: [] });
    g.cantidad++;
    g.tarjetas.push(t.id);
  }
  return {
    total: gesty.countPending(db, userId),
    por_tipo: porTipo,
    tarjetas: tarjetas.slice(0, MAX_ITEMS).map((t) => ({
      id: t.id, tipo: t.tipo, titulo: t.titulo, vence: t.vence || '', estado: t.estado,
      fuente: { entidad: 'tarjeta', id: t.id, detalle: `Tarjeta «${t.tipo}» esperando el OK del dueño (bandeja, G-02)` },
    })),
  };
}

// La foto de caja: entró/salió REAL del día (registros, no
// proyección) + la proyección corta de G-06 con su cobertura.
function fotoCaja(db, userId, fecha, entro, declaraciones) {
  const entroHoy = {};
  for (const [k, monto] of Object.entries(entro.cobros.por_moneda)) entroHoy[k] = round2((entroHoy[k] || 0) + monto);
  const salioHoy = {};
  for (const [k, monto] of Object.entries(entro.pagos_proveedores.por_moneda)) salioHoy[k] = round2((salioHoy[k] || 0) + monto);
  let proyeccion = null;
  try {
    const p = reportes.pronosticoCaja(db, userId, { desde: fecha, dias: 7 });
    const porMoneda = {};
    for (const [k, agg] of Object.entries(p.por_moneda || {})) {
      porMoneda[k] = {
        entra: agg.entra, sale: agg.sale, queda: agg.queda,
        primer_dia_negativo: agg.primer_dia_negativo || null,
        saldo_inicial: null, // declarado por el motor: no hay saldo de apertura registrado
      };
    }
    proyeccion = {
      desde: p.desde, hasta: p.hasta, dias: p.dias,
      por_moneda: porMoneda,
      avisos: (p.avisos || []).length,
      cobertura: p.cobertura || [],
    };
  } catch (e) {
    declaraciones.push(`La proyección de caja de Reportes (G-06) no respondió en esta generación: ${e.message}. La foto del día sale sin proyección — no se estima una.`);
  }
  return { entro_hoy: entroHoy, salio_hoy: salioHoy, proyeccion_7d: proyeccion };
}

// ---------------------------------------------------------------------------
// EL TEXTO — cada frase nace de un conteo. Sin relleno, jamás.
// ---------------------------------------------------------------------------

function lineaMontos(porMoneda) {
  return Object.entries(porMoneda).map(([k, v]) => `${k} ${fmtMonto(typeof v === 'number' ? v : v.monto)}`).join(' · ');
}

function armarTexto(c) {
  const lineas = [];
  const sinActividad = !c.entro.papeles.cantidad && !c.entro.cobros.cantidad && !c.entro.pagos_proveedores.cantidad;
  if (sinActividad) {
    lineas.push('Hoy no entró ningún papel nuevo ni se registraron cobros o pagos.');
  } else {
    if (c.entro.papeles.cantidad) {
      const partes = [`Entraron ${c.entro.papeles.cantidad} papel(es) nuevo(s): ${c.entro.papeles.leidos} leído(s)`];
      if (c.entro.papeles.en_revision) partes.push(`${c.entro.papeles.en_revision} en revisión`);
      if (c.entro.papeles.duplicados) partes.push(`${c.entro.papeles.duplicados} duplicado(s)`);
      lineas.push(partes.join(', ') + '.');
    }
    if (c.entro.cobros.cantidad) lineas.push(`Se registraron ${c.entro.cobros.cantidad} cobro(s) por ${lineaMontos(c.entro.cobros.por_moneda)}.`);
    if (c.entro.pagos_proveedores.cantidad) lineas.push(`Se registraron ${c.entro.pagos_proveedores.cantidad} pago(s) a proveedores por ${lineaMontos(c.entro.pagos_proveedores.por_moneda)}.`);
  }
  if (c.manana.cantidad) {
    const detalle = Object.entries(c.manana.por_tipo).map(([t, n]) => `${n} ${t}`).join(', ');
    lineas.push(`Mañana (${c.manana.fecha}) vence(n) ${c.manana.cantidad} compromiso(s): ${detalle}.`);
  } else {
    lineas.push('Mañana no vence nada.');
  }
  const vencidas = (c.arrastre.facturas_vencidas || 0) + (c.arrastre.obligaciones_vencidas || 0);
  if (vencidas) lineas.push(`Siguen vencidas sin resolver: ${vencidas} (${c.arrastre.facturas_vencidas} factura(s) por cobrar, ${c.arrastre.obligaciones_vencidas} obligación(es) con proveedores).`);
  if (c.espera_ok.total) {
    const detalle = Object.entries(c.espera_ok.por_tipo).map(([t, g]) => `${g.cantidad} ${t}`).join(', ');
    lineas.push(`${c.espera_ok.total} cosa(s) espera(n) tu OK: ${detalle}.`);
  } else {
    lineas.push('Nada espera tu OK.');
  }
  for (const [k, agg] of Object.entries((c.caja.proyeccion_7d && c.caja.proyeccion_7d.por_moneda) || {})) {
    if (agg.primer_dia_negativo) {
      lineas.push(`Ojo con la caja: la proyección de 7 días queda negativa el ${agg.primer_dia_negativo} en ${k}.`);
    }
  }
  return lineas.join(' ');
}

// El resumen de una línea para el cuerpo del push: conteos, nada más.
function armarResumenCorto(c) {
  const partes = [];
  partes.push(c.entro.papeles.cantidad ? `Entraron ${c.entro.papeles.cantidad} papel(es)` : 'Sin papeles nuevos');
  partes.push(c.manana.cantidad ? `mañana vencen ${c.manana.cantidad}` : 'mañana no vence nada');
  partes.push(c.espera_ok.total ? `${c.espera_ok.total} espera(n) tu OK` : 'nada espera tu OK');
  return partes.join(' · ') + '.';
}

// ---------------------------------------------------------------------------
// COMPOSICIÓN — pura lectura de las fuentes (no persiste nada)
// ---------------------------------------------------------------------------

function componerCierre(db, userId, opts) {
  ensureSchema(db);
  gesty.ensureSchema(db);
  const fecha = fechaDe(opts);
  const manana = addDias(fecha, 1);
  const declaraciones = [];

  const entro = {
    papeles: papelesQueEntraron(db, userId, fecha, declaraciones),
    cobros: cobrosDelDia(db, userId, fecha),
    pagos_proveedores: pagosProveedoresDelDia(db, userId, fecha),
  };

  // Mañana según la agenda compuesta de G-09 (con hoy = la fecha
  // del cierre: los estados «vencida/por-vencer» se juzgan desde
  // ese día). Una fuente que cae queda declarada en `fuentes`
  // por el propio G-09; el cierre no la esconde.
  const compuestaManana = agenda.componerAgenda(db, userId, { desde: manana, hasta: manana, hoy: fecha });
  const porTipo = {};
  for (const it of compuestaManana.items) porTipo[it.tipo] = (porTipo[it.tipo] || 0) + 1;
  const mananaSec = {
    fecha: manana,
    cantidad: compuestaManana.items.length,
    por_tipo: porTipo,
    items: compuestaManana.items.slice(0, MAX_ITEMS),
    fuentes: compuestaManana.fuentes,
  };

  // El arrastre (vencidas abiertas) sale de agendaHoy con el
  // reloj del cierre: se declara aparte, no se suma a «mañana».
  let arrastre = { facturas_vencidas: 0, obligaciones_vencidas: 0 };
  try {
    const hoyVista = agenda.agendaHoy(db, userId, { hoy: fecha });
    arrastre = {
      facturas_vencidas: hoyVista.arrastre.facturas_vencidas.length,
      obligaciones_vencidas: hoyVista.arrastre.obligaciones_vencidas.length,
    };
  } catch (e) {
    declaraciones.push(`El arrastre de vencidas de la agenda (G-09) no respondió en esta generación: ${e.message}.`);
  }

  const espera = esperaOk(db, userId);
  const caja = fotoCaja(db, userId, fecha, entro, declaraciones);

  const contenido = {
    fecha, manana: mananaSec, entro,
    arrastre, espera_ok: espera, caja,
    declaraciones,
    vacio: !entro.papeles.cantidad && !entro.cobros.cantidad && !entro.pagos_proveedores.cantidad
      && !mananaSec.cantidad && !espera.total,
    generado_con: { hoy: fecha },
  };
  contenido.texto = armarTexto(contenido);
  contenido.texto_resumen = armarResumenCorto(contenido);
  return contenido;
}

// ---------------------------------------------------------------------------
// LA FOTO DURABLE — generar, leer, historial
// ---------------------------------------------------------------------------

function parseCierreRow(r) {
  if (!r) return null;
  return {
    id: r.id, user_id: r.user_id, fecha: r.fecha, version: r.version,
    contenido: safeJson(r.contenido, {}),
    texto: r.texto || '', texto_resumen: r.texto_resumen || '',
    entrega: r.entrega ? safeJson(r.entrega, null) : null,
    generado_por: r.generado_por || 'dueno',
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function generarCierre(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fecha = fechaDe(o);
  const contenido = componerCierre(db, userId, { hoy: fecha, fecha });
  const prev = db.prepare('SELECT MAX(version) AS v FROM gesty_cierres_dia WHERE user_id = ? AND fecha = ?').get(userId, fecha);
  const version = (prev && prev.v ? Number(prev.v) : 0) + 1;
  const generadoPor = o.generado_por === 'rutina' ? 'rutina' : 'dueno';
  const info = db.prepare(`INSERT INTO gesty_cierres_dia
    (user_id, fecha, version, contenido, texto, texto_resumen, generado_por)
    VALUES (?,?,?,?,?,?,?)`)
    .run(userId, fecha, version, JSON.stringify(contenido), contenido.texto, contenido.texto_resumen, generadoPor);
  const cierre = parseCierreRow(db.prepare('SELECT * FROM gesty_cierres_dia WHERE id = ?').get(Number(info.lastInsertRowid)));
  gesty.recordEvent(db, userId, {
    actor: generadoPor === 'rutina' ? 'gesty' : 'dueno',
    entidad_tipo: 'cierre-dia', entidad_id: fecha,
    tipo_evento: 'cierre-dia-generado',
    resumen: `Cierre del día ${fecha} generado (versión ${version}): ${contenido.texto_resumen}`,
    payload: {
      version, papeles: contenido.entro.papeles.cantidad,
      cobros: contenido.entro.cobros.cantidad, pagos_proveedores: contenido.entro.pagos_proveedores.cantidad,
      manana: contenido.manana.cantidad, espera_ok: contenido.espera_ok.total,
      reemplaza_version: version > 1 ? version - 1 : null,
    },
  });
  return cierre;
}

function getCierre(db, userId, fecha) {
  ensureSchema(db);
  const f = esFechaISO(fecha) ? String(fecha) : hoyDe({});
  const r = db.prepare('SELECT * FROM gesty_cierres_dia WHERE user_id = ? AND fecha = ? ORDER BY version DESC LIMIT 1').get(userId, f);
  return parseCierreRow(r);
}

function listCierres(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_cierres_dia WHERE user_id = ? ORDER BY fecha DESC, version DESC').all(userId);
  if (esFechaISO(o.desde)) rows = rows.filter((r) => r.fecha >= String(o.desde));
  if (esFechaISO(o.hasta)) rows = rows.filter((r) => r.fecha <= String(o.hasta));
  const vigentes = new Set();
  const out = rows.map((r) => {
    const c = parseCierreRow(r);
    c.es_vigente = !vigentes.has(r.fecha);
    if (c.es_vigente) vigentes.add(r.fecha);
    return c;
  });
  const lim = Math.min(Math.max(Number(o.limit) || 60, 1), 500);
  return { cierres: o.todas_las_versiones ? out.slice(0, lim) : out.filter((c) => c.es_vigente).slice(0, lim), total: out.length };
}

// ---------------------------------------------------------------------------
// ENTREGA — por el push de la casa, con la entrega real registrada
// ---------------------------------------------------------------------------

async function entregarCierre(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fecha = fechaDe(o);
  const config = getConfig(db, userId);
  let cierre = getCierre(db, userId, fecha);
  let generadoEnElActo = false;
  if (!cierre) {
    cierre = generarCierre(db, userId, { hoy: fecha, fecha, generado_por: o.generado_por });
    generadoEnElActo = true;
  }
  if (!config.activo) {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'cierre-dia', entidad_id: fecha,
      tipo_evento: 'cierre-dia-entrega',
      resumen: `Cierre del día ${fecha} NO entregado: el cierre está desactivado en el fundamento.`,
      payload: { version: cierre.version, entrega: 'no-entregado:desactivado' },
    });
    return { entregado: false, motivo: 'cierre-desactivado', cierre, generado_en_el_acto: generadoEnElActo, config };
  }
  let entrega = 'sin-canal';
  try {
    const r = await notificar(userId, {
      title: 'Gesty · Cierre del día',
      body: cierre.texto_resumen,
      url: '/#/app',
      data: { codigo: `cierre-dia:${fecha}`, tipo: 'cierre-dia', fecha },
    });
    entrega = r && r.ok ? 'enviado' : `sin-entrega:${(r && r.reason) || 'canal-sin-respuesta'}`;
  } catch (e) {
    entrega = `sin-entrega:${e.message || 'error-del-canal'}`;
  }
  const registro = { estado: entrega, en: new Date().toISOString(), version: cierre.version };
  db.prepare('UPDATE gesty_cierres_dia SET entrega = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
    .run(JSON.stringify(registro), cierre.id, userId);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cierre-dia', entidad_id: fecha,
    tipo_evento: 'cierre-dia-entrega',
    resumen: entrega === 'enviado'
      ? `Cierre del día ${fecha} entregado por push (versión ${cierre.version}).`
      : `Cierre del día ${fecha} SIN entrega (${entrega}): el canal no lo entregó y así queda registrado.`,
    payload: { version: cierre.version, entrega },
  });
  const actualizado = getCierre(db, userId, fecha);
  return { entregado: entrega === 'enviado', entrega, cierre: actualizado, generado_en_el_acto: generadoEnElActo, config };
}

// ---------------------------------------------------------------------------
// LA RUTINA DIARIA — los cinco escaneos, en orden, con su resultado
// ---------------------------------------------------------------------------

function conteoDe(obj, claves) {
  const out = {};
  for (const k of claves) {
    const v = obj ? obj[k] : undefined;
    out[k] = Array.isArray(v) ? v.length : (typeof v === 'number' ? v : (v === undefined ? null : v));
  }
  return out;
}

async function correrRutinaDiaria(db, userId, opts) {
  ensureSchema(db);
  gesty.ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const pasos = [];
  const registrar = (paso, fn) => async () => {
    try {
      const resultado = await fn();
      pasos.push({ paso, estado: 'ok', resultado });
    } catch (e) {
      pasos.push({ paso, estado: 'error', detalle: e.message || 'error del escaneo', resultado: null });
    }
  };

  await registrar('recordatorios-agenda', async () => {
    const r = await agenda.procesarRecordatorios(db, userId, { hoy });
    return {
      emitidos: r.emitidos.length, ya_emitidos: r.ya_emitidos,
      desactivados: !!r.desactivados,
      entregas: r.emitidos.map((x) => x.entrega),
    };
  })();
  await registrar('vencimientos-cobranzas', async () => conteoDe(
    cobranzas.escanearVencimientos(db, userId, { hoy }),
    ['revisadas', 'tarjetas_nuevas', 'tarjetas_regeneradas', 'cerradas', 'promesas_vigentes']))();
  await registrar('huecos', async () => conteoDe(
    huecos.escanearHuecos(db, userId, { hoy }),
    ['creados', 'actualizados', 'resueltos', 'explicados', 'sin_base']))();
  await registrar('patrones-aprendidos', async () => conteoDe(
    reglas.escanearPatrones(db, userId, { hoy }),
    ['creadas', 'esperando', 'ya_rigen', 'observaciones_registradas']))();
  await registrar('conciliacion', async () => conteoDe(
    conciliacion.conciliar(db, userId, { hoy }),
    ['procesados', 'asentados', 'propuestas', 'sin_par', 'errores']))();

  const okTotal = pasos.every((p) => p.estado === 'ok');
  const conError = pasos.filter((p) => p.estado === 'error').map((p) => p.paso);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cierre-dia', entidad_id: hoy,
    tipo_evento: 'rutina-diaria',
    resumen: okTotal
      ? `Rutina diaria del ${hoy}: los 5 escaneos corrieron (recordatorios, cobranzas, huecos, patrones, conciliación).`
      : `Rutina diaria del ${hoy}: falló ${conError.join(', ')}; el resto corrió y su resultado quedó registrado.`,
    payload: {
      pasos: pasos.map((p) => ({ paso: p.paso, estado: p.estado, detalle: p.detalle || null, resultado: p.resultado })),
    },
  });
  return { fecha: hoy, ok: okTotal, pasos };
}

// ---------------------------------------------------------------------------
// RESUMEN PARA «LA OFICINA»
// ---------------------------------------------------------------------------

function resumenCierreDia(db, userId, opts) {
  ensureSchema(db);
  const hoy = hoyDe(opts);
  const cierreHoy = getCierre(db, userId, hoy);
  const rutinas = gesty.listEvents(db, userId, { entidad_tipo: 'cierre-dia', entidad_id: hoy, limit: 5000 })
    .filter((e) => e.tipo_evento === 'rutina-diaria');
  const ultima = rutinas.length ? rutinas[rutinas.length - 1] : null;
  return {
    hoy,
    cierre_de_hoy: cierreHoy ? {
      existe: true, version: cierreHoy.version,
      entregado: !!(cierreHoy.entrega && cierreHoy.entrega.estado === 'enviado'),
      entrega: cierreHoy.entrega ? cierreHoy.entrega.estado : null,
      texto_resumen: cierreHoy.texto_resumen,
    } : { existe: false, version: null, entregado: false, entrega: null, texto_resumen: null },
    espera_ok_ahora: gesty.countPending(db, userId),
    ultima_rutina: ultima ? { resumen: ultima.resumen, pasos_ok: (ultima.payload && ultima.payload.pasos || []).filter((p) => p.estado === 'ok').length } : null,
    config: getConfig(db, userId),
    texto: cierreHoy
      ? `El cierre de hoy (versión ${cierreHoy.version}) ${cierreHoy.entrega && cierreHoy.entrega.estado === 'enviado' ? 'ya salió por push' : 'está generado y todavía no salió'}. Esperan tu OK: ${gesty.countPending(db, userId)}.`
      : `Todavía no se generó el cierre de hoy. Esperan tu OK: ${gesty.countPending(db, userId)}.`,
  };
}

// ---------------------------------------------------------------------------

module.exports = {
  // constantes
  CONFIG_DEFAULT,
  // configuración / inyección
  configure,
  // esquema
  ensureSchema,
  // configuración del fundamento
  getConfig, setConfig,
  // composición y foto durable
  componerCierre, generarCierre, getCierre, listCierres,
  // entrega
  entregarCierre,
  // la rutina diaria
  correrRutinaDiaria,
  // resumen para «La oficina»
  resumenCierreDia,
  // piezas internas, exportadas para tests y reuso
  armarTexto, armarResumenCorto,
};
