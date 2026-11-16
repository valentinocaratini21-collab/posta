// venty-medicion.js — VENTY SLICE 5: medición real de la métrica norte.
// Todo número de este módulo se computa, al momento de leerlo, desde el
// registro durable: venty_partidas, venty_mensajes, venty_eventos y
// venty_jugadas (y, solo para la sección saliente, venty_leads y los
// eventos de contacto saliente). Ninguna cifra viene del mock ni de la
// semilla de Café Aroma: la semilla sigue existiendo como contenido de
// Modo Prueba en venty.js y este módulo no la invoca ni la mezcla; si el
// registro está vacío, el resultado lo dice (el parte no se emite).
// La voz de Venty en todo texto generado: minúsculas y sin signos de
// apertura de interrogación o exclamación.
//
// DEFINICIONES EXACTAS (estas líneas son el contrato del slice 5):
// - Semana: lunes 00:00:00 a lunes siguiente 00:00:00, comparando los
//   timestamps guardados (formato 'YYYY-MM-DD HH:MM:SS') tal como están.
//   La clave de semana es el lunes en formato 'YYYY-MM-DD'.
// - consultas(semana) = filas de venty_partidas del usuario creadas en
//   la semana (created_at en el rango), sin importar su estado final.
// - calificada: una partida cuenta como calificada en la semana si en
//   la semana hay un evento 'calificacion' o 'calificada' suyo, o un
//   evento 'cotizacion' suyo (el motor solo cotiza después de calificar
//   qué busca el cliente, así que cotizar es evidencia registrada de
//   calificación). calificadas = partidas distintas que cumplen eso.
// - cotizadas(semana) = partidas distintas con evento 'cotizacion'
//   en la semana.
// - ventas(semana) = partidas distintas con evento 'cierre' en la
//   semana. monto(semana) = suma, por partida cerrada, del monto del
//   evento 'cierre' (datos.monto) y, si el evento no trae monto, del
//   monto de la partida. Nunca se suman dos cierres de una misma
//   partida: vale el último evento 'cierre' de la semana.
// - turnos(semana) = partidas distintas con evento 'cierre' en la
//   semana cuya forma (datos.forma del evento o forma_cierre de la
//   partida) empieza con 'reserva' o 'turno', más las que tengan un
//   evento 'turno', 'reserva' o 'agenda' en la semana.
// - no_shows(semana) = partidas distintas con evento 'no_show',
//   'no-show', 'noshow' o 'inasistencia' en la semana. Es un conteo del
//   registro, no una constante: si no hay eventos de ese tipo, vale 0
//   porque eso es lo que el registro dice.
// - primera respuesta(seg): por cada partida creada en la semana, la
//   diferencia en segundos entre su primer mensaje de autor 'cliente'
//   en venty_mensajes y el primer mensaje posterior de autor 'venty'.
//   Si la partida no tiene ese par de mensajes pero sí un evento
//   'primera_respuesta' en la semana con datos.ms, se usa datos.ms.
//   primera_respuesta_seg = promedio (media aritmética, redondeada)
//   de esas diferencias medidas; si no hay ninguna medida, es null
//   (nunca un número inventado ni un 0 disfrazado).
// - tasa de cierre = ventas / consultas calificadas de la semana.
//   tasa_cierre_pct = round(100 * ventas / calificadas) si
//   calificadas es mayor que 0; si no, null.
// - objeción que más frenó: el datos.texto más frecuente entre los
//   eventos 'objecion' de la semana, textual, tal como quedó
//   registrado. Empate: gana el texto que apareció primero.
// - qué ajustó: el datos.que del evento 'ajuste' más reciente de la
//   semana; 'lo que tu oficina aprendió' lista todos los datos.que
//   distintos de la semana, en orden de aparición.
// - sección saliente(semana): prospectos_nuevos = filas de venty_leads
//   creadas en la semana; contactos_salientes = eventos de la semana
//   de tipo 'email_prospecto_enviado', 'ig_dm_enviado' o
//   'caza_contacto'; partidas_de_caza = partidas creadas en la semana
//   con origen 'caza'; ventas_de_caza = partidas de origen 'caza' con
//   evento 'cierre' en la semana. Si todo eso es 0, hay_datos es false
//   y la nota lo dice: no se inventa actividad saliente.
// - regla dura del parte: si consultas y cotizadas de la semana son
//   ambas 0, el parte NO se emite: se devuelve emitido:false con su
//   razón ('sin_datos'), sin números de ejemplo.
// - comparación: el mismo cómputo aplicado a la semana anterior
//   (lunes menos 7 días). Los deltas son actual menos anterior, campo
//   por campo. Si la semana anterior tampoco tuvo datos, la
//   comparación lo dice (hay_anterior:false) y deltas es null.
// - canal caído / falta grave: una partida en estado 'viva' cuyo
//   primer mensaje de autor 'cliente' lleva más de UMBRAL minutos sin
//   ningún mensaje posterior de autor 'venty' es una consulta sin
//   responder y se reporta como alerta grave, con su antigüedad
//   medida desde los timestamps. UMBRAL por defecto: 60 minutos.
// - niveles: se computan SOLO desde venty_eventos acumulados (hechos
//   registrados, sin ventana de tiempo salvo lo que cada hecho es).
//   Nunca por pagar, nunca por tiempo solo: como los hechos solo se
//   acumulan, el nivel calculado nunca baja. Las compuertas exactas
//   están en COMPUERTAS más abajo; 'qué falta para subir' es, hecho
//   por hecho, necesita menos hecho de la compuerta siguiente.
// - jobs: jobFraseDiaria guarda una fila por usuario y día en
//   venty_medicion_frase (upsert por UNIQUE(user_id, fecha)) y
//   jobParteSemanal guarda una fila por usuario y semana en
//   venty_parte (upsert por UNIQUE(user_id, semana)) y registra el
//   evento 'parte_emitido' solo la primera vez que esa semana se
//   emite. Re-correr un job no duplica filas ni eventos: idempotente.
'use strict';

const MODO = 'prueba';
const FUENTE = 'registro';
const UMBRAL_SIN_RESPUESTA_MIN = 60;
const TZ_CUENTA = 'America/Argentina/Buenos_Aires';

// ---- helpers de fecha (mismo formato que venty.js) ----
function hoyYmd(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz || TZ_CUENTA });
}
function mondayKeyOf(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function ahoraIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function tsMs(s) {
  const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : null;
}
function fmtPesos(n) {
  const s = String(Math.round(Number(n) || 0));
  return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function safeJson(s, dflt) { try { return JSON.parse(s || ''); } catch (e) { return dflt; } }
function rangoSemana(semana) {
  const sem = mondayKeyOf(semana || hoyYmd());
  return { sem, ini: sem + ' 00:00:00', fin: shiftDays(sem, 7) + ' 00:00:00' };
}

// ---- esquema propio (aditivo; las tablas del registro ya existen) ----
function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_medicion_frase (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    datos_json TEXT NOT NULL DEFAULT '{}',
    calculado_at TEXT NOT NULL DEFAULT '',
    UNIQUE(user_id, fecha)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_parte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    semana TEXT NOT NULL,
    datos_json TEXT NOT NULL,
    emitido_at TEXT NOT NULL,
    UNIQUE(user_id, semana)
  )`);
}

// ---- lecturas base del registro ----
function eventosEnRango(db, userId, ini, fin, tipos) {
  const ph = tipos.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM venty_eventos WHERE user_id = ? AND tipo IN (${ph}) AND created_at >= ? AND created_at < ? ORDER BY created_at ASC, id ASC`)
    .all(userId, ...tipos, ini, fin);
}
function distinctIds(rows) {
  const s = new Set();
  for (const r of rows) if (r.partida_id != null) s.add(Number(r.partida_id));
  return s;
}

// primera respuesta medida por partida: mensajes primero, evento después.
function medirPrimerasRespuestas(db, userId, ini, fin) {
  const partidas = db.prepare(`SELECT id FROM venty_partidas WHERE user_id = ? AND created_at >= ? AND created_at < ? ORDER BY id ASC`).all(userId, ini, fin);
  const medidas = [];
  let sinRespuesta = 0;
  for (const p of partidas) {
    const msgs = db.prepare(`SELECT autor, enviado_at FROM venty_mensajes WHERE partida_id = ? ORDER BY enviado_at ASC, id ASC`).all(p.id);
    const primeroCliente = msgs.find((m) => m.autor === 'cliente');
    if (!primeroCliente) continue;
    const resp = msgs.find((m) => m.autor === 'venty' && String(m.enviado_at) >= String(primeroCliente.enviado_at));
    if (resp) {
      const a = tsMs(primeroCliente.enviado_at); const b = tsMs(resp.enviado_at);
      if (a !== null && b !== null && b >= a) { medidas.push(Math.round((b - a) / 1000)); continue; }
    }
    const ev = db.prepare(`SELECT datos_json FROM venty_eventos WHERE user_id = ? AND partida_id = ? AND tipo = 'primera_respuesta' AND created_at >= ? AND created_at < ? ORDER BY created_at ASC LIMIT 1`).get(userId, p.id, ini, fin);
    const ms = ev ? Number(safeJson(ev.datos_json, {}).ms) : NaN;
    if (Number.isFinite(ms) && ms >= 0) { medidas.push(Math.round(ms / 1000)); continue; }
    sinRespuesta++;
  }
  const promedio = medidas.length ? Math.round(medidas.reduce((a, b) => a + b, 0) / medidas.length) : null;
  return { promedio_seg: promedio, medidas: medidas.length, sin_respuesta: sinRespuesta };
}

// ---- alertas de canal caído: consulta sin primera respuesta ----
function detectarSinResponder(db, userId, opts) {
  const o = opts || {};
  const ahora = o.ahora || ahoraIso();
  const umbralMin = Number(o.umbralMin != null ? o.umbralMin : UMBRAL_SIN_RESPUESTA_MIN);
  const ahoraMs = tsMs(ahora);
  const alertas = [];
  const partidas = db.prepare(`SELECT * FROM venty_partidas WHERE user_id = ? AND estado = 'viva' ORDER BY created_at ASC, id ASC`).all(userId);
  for (const p of partidas) {
    const msgs = db.prepare(`SELECT autor, enviado_at FROM venty_mensajes WHERE partida_id = ? ORDER BY enviado_at ASC, id ASC`).all(p.id);
    const primeroCliente = msgs.find((m) => m.autor === 'cliente');
    if (!primeroCliente) continue;
    const respondida = msgs.some((m) => m.autor === 'venty' && String(m.enviado_at) >= String(primeroCliente.enviado_at));
    if (respondida) continue;
    const t0 = tsMs(primeroCliente.enviado_at);
    if (t0 === null || ahoraMs === null) continue;
    const minutos = Math.floor((ahoraMs - t0) / 60000);
    if (minutos < umbralMin) continue;
    alertas.push({
      partida_id: p.id,
      cliente: p.cliente_nombre,
      canal: p.canal || '',
      primera_consulta_at: primeroCliente.enviado_at,
      minutos_sin_respuesta: minutos,
      grave: true,
      texto: `alerta grave: la consulta de ${String(p.cliente_nombre || 'un cliente').toLowerCase()} por ${p.canal || 'un canal'} lleva ${minutos} minutos sin primera respuesta, y una consulta sin responder es una falta grave`,
    });
  }
  return alertas;
}

// ---- sección saliente (desde venty_leads y eventos de contacto) ----
function computarSaliente(db, userId, ini, fin) {
  let prospectos = 0;
  try {
    const r = db.prepare(`SELECT COUNT(*) c FROM venty_leads WHERE user_id = ? AND created_at >= ? AND created_at < ?`).get(userId, ini, fin);
    prospectos = (r && r.c) || 0;
  } catch (e) { prospectos = 0; }
  const contactos = eventosEnRango(db, userId, ini, fin, ['email_prospecto_enviado', 'ig_dm_enviado', 'caza_contacto']).length;
  const pc = db.prepare(`SELECT COUNT(*) c FROM venty_partidas WHERE user_id = ? AND origen = 'caza' AND created_at >= ? AND created_at < ?`).get(userId, ini, fin);
  const partidasCaza = (pc && pc.c) || 0;
  let ventasCaza = 0;
  if (partidasCaza || true) {
    const rows = db.prepare(`SELECT DISTINCT e.partida_id pid FROM venty_eventos e JOIN venty_partidas p ON p.id = e.partida_id
      WHERE e.user_id = ? AND e.tipo = 'cierre' AND p.origen = 'caza' AND e.created_at >= ? AND e.created_at < ?`).all(userId, ini, fin);
    ventasCaza = rows.length;
  }
  const hay = prospectos > 0 || contactos > 0 || partidasCaza > 0;
  return {
    hay_datos: hay,
    prospectos_nuevos: prospectos,
    contactos_salientes: contactos,
    partidas_de_caza: partidasCaza,
    ventas_de_caza: ventasCaza,
    nota: hay ? '' : 'sin datos salientes esta semana: el registro no muestra prospectos nuevos ni contactos salientes, y esta sección no inventa actividad',
  };
}

// ---- parte semanal real (sin comparación; la comparación lo envuelve) ----
function computarSemana(db, userId, semana) {
  const { sem, ini, fin } = rangoSemana(semana);
  const consultasRow = db.prepare(`SELECT COUNT(*) c FROM venty_partidas WHERE user_id = ? AND created_at >= ? AND created_at < ?`).get(userId, ini, fin);
  const consultas = (consultasRow && consultasRow.c) || 0;
  const calificadas = distinctIds(eventosEnRango(db, userId, ini, fin, ['calificacion', 'calificada', 'cotizacion'])).size;
  const cotizadas = distinctIds(eventosEnRango(db, userId, ini, fin, ['cotizacion'])).size;
  // ventas: último cierre por partida dentro de la semana.
  const cierres = eventosEnRango(db, userId, ini, fin, ['cierre']);
  const ultimoCierre = new Map();
  for (const e of cierres) if (e.partida_id != null) ultimoCierre.set(Number(e.partida_id), e);
  let monto = 0;
  const formas = new Map();
  for (const [pid, e] of ultimoCierre) {
    const datos = safeJson(e.datos_json, {});
    const partida = db.prepare(`SELECT monto, forma_cierre FROM venty_partidas WHERE id = ? AND user_id = ?`).get(pid, userId);
    const m = Number(datos.monto);
    monto += Number.isFinite(m) && datos.monto !== undefined && datos.monto !== null && datos.monto !== '' ? m : (partida ? Number(partida.monto) || 0 : 0);
    formas.set(pid, String(datos.forma || (partida && partida.forma_cierre) || ''));
  }
  const ventas = ultimoCierre.size;
  const turnosSet = new Set();
  for (const [pid, forma] of formas) if (/^(reserva|turno)/i.test(forma)) turnosSet.add(pid);
  for (const e of eventosEnRango(db, userId, ini, fin, ['turno', 'reserva', 'agenda'])) if (e.partida_id != null) turnosSet.add(Number(e.partida_id));
  const noShows = distinctIds(eventosEnRango(db, userId, ini, fin, ['no_show', 'no-show', 'noshow', 'inasistencia'])).size;
  const primera = medirPrimerasRespuestas(db, userId, ini, fin);
  const tasa = calificadas > 0 ? Math.round((ventas / calificadas) * 100) : null;
  const objRows = eventosEnRango(db, userId, ini, fin, ['objecion']);
  const conteo = new Map();
  for (const e of objRows) {
    const t = String(safeJson(e.datos_json, {}).texto || '');
    if (t) conteo.set(t, (conteo.get(t) || 0) + 1);
  }
  let objTop = null; let objVeces = 0;
  for (const [t, n] of conteo) if (n > objVeces) { objTop = t; objVeces = n; }
  const ajustesRows = eventosEnRango(db, userId, ini, fin, ['ajuste']);
  const aprendio = [];
  for (const e of ajustesRows) {
    const q = String(safeJson(e.datos_json, {}).que || '');
    if (q && !aprendio.includes(q)) aprendio.push(q);
  }
  const ajuste = aprendio.length ? aprendio[aprendio.length - 1] : null;
  const saliente = computarSaliente(db, userId, ini, fin);
  return {
    semana: sem, consultas, calificadas, cotizadas, ventas, monto,
    turnos: turnosSet.size, no_shows: noShows,
    primera_respuesta_seg: primera.promedio_seg,
    primera_respuesta_medidas: primera.medidas,
    consultas_sin_respuesta: primera.sin_respuesta,
    tasa_cierre_pct: tasa,
    objecion_mas_frecuente: objTop, objecion_veces: objVeces,
    ajuste, aprendio_semana: aprendio, saliente,
  };
}

const CAMPOS_DELTA = ['consultas', 'calificadas', 'cotizadas', 'ventas', 'monto', 'turnos', 'no_shows', 'primera_respuesta_seg', 'tasa_cierre_pct'];

function computarParteReal(db, userId, semana, opts) {
  const o = opts || {};
  const { sem } = rangoSemana(semana);
  const actual = computarSemana(db, userId, sem);
  if (!actual.consultas && !actual.cotizadas) {
    return {
      emitido: false, semana: sem, modo: MODO, fuente: FUENTE, razon: 'sin_datos',
      texto: 'el parte no se emite: esta semana el registro no tiene consultas ni cotizaciones, y sin datos no hay parte',
      comparacion: null,
    };
  }
  const semAnterior = shiftDays(sem, -7);
  const anteriorCrudo = computarSemana(db, userId, semAnterior);
  const hayAnterior = !!(anteriorCrudo.consultas || anteriorCrudo.cotizadas);
  let comparacion;
  if (hayAnterior) {
    const deltas = {};
    for (const c of CAMPOS_DELTA) {
      const a = actual[c]; const b = anteriorCrudo[c];
      deltas[c] = (a === null || a === undefined || b === null || b === undefined) ? null : a - b;
    }
    comparacion = { hay_anterior: true, semana_anterior: semAnterior, anterior: anteriorCrudo, deltas };
  } else {
    comparacion = { hay_anterior: false, semana_anterior: semAnterior, anterior: null, deltas: null, razon: 'sin_datos_semana_anterior' };
  }
  const alertas = detectarSinResponder(db, userId, o);
  const lineas = [
    `consultas: ${actual.consultas}`,
    `calificadas: ${actual.calificadas}`,
    `cotizadas: ${actual.cotizadas}`,
    `ventas: ${actual.ventas} por ${fmtPesos(actual.monto)}`,
    `turnos: ${actual.turnos} · no-shows: ${actual.no_shows}`,
    `primera respuesta: ${actual.primera_respuesta_seg === null ? 'sin medidas esta semana' : actual.primera_respuesta_seg + ' segundos en promedio'}`,
    `tasa de cierre: ${actual.tasa_cierre_pct === null ? 'sin calificadas esta semana' : actual.tasa_cierre_pct + '%'}`,
    `la objeción que más frenó: ${actual.objecion_mas_frecuente ? '"' + actual.objecion_mas_frecuente + '"' : 'ninguna quedó registrada'}`,
    `qué ajustó venty: ${actual.ajuste || 'nada quedó registrado esta semana'}`,
  ];
  if (alertas.length) lineas.push(`alertas: ${alertas.length} ${alertas.length === 1 ? 'consulta' : 'consultas'} sin responder, falta grave`);
  return {
    emitido: true, semana: sem, modo: MODO, fuente: FUENTE,
    ...actual, lineas, comparacion, alertas_canal: alertas,
  };
}

// ---- línea norte y frase del día, desde el registro ----
function computarLineaNorteReal(db, userId, semana) {
  const s = computarSemana(db, userId, semana || mondayKeyOf(hoyYmd()));
  return {
    semana: s.semana,
    tasa_cierre_pct: s.tasa_cierre_pct,
    ventas: s.ventas, calificadas: s.calificadas,
    primera_respuesta_seg: s.primera_respuesta_seg,
    primera_respuesta_medidas: s.primera_respuesta_medidas,
    modo: MODO, fuente: FUENTE,
  };
}

function computarFraseReal(db, userId, opts) {
  const o = opts || {};
  const fecha = o.fecha || hoyYmd();
  const ini = fecha + ' 00:00:00'; const fin = shiftDays(fecha, 1) + ' 00:00:00';
  const cierres = eventosEnRango(db, userId, ini, fin, ['cierre']);
  const pids = distinctIds(cierres);
  let montoHoy = 0;
  const ultimo = new Map();
  for (const e of cierres) if (e.partida_id != null) ultimo.set(Number(e.partida_id), e);
  for (const [pid, e] of ultimo) {
    const datos = safeJson(e.datos_json, {});
    const m = Number(datos.monto);
    if (Number.isFinite(m) && datos.monto !== undefined && datos.monto !== null && datos.monto !== '') montoHoy += m;
    else { const p = db.prepare(`SELECT monto FROM venty_partidas WHERE id = ?`).get(pid); montoHoy += p ? Number(p.monto) || 0 : 0; }
  }
  const consultasRow = db.prepare(`SELECT COUNT(*) c FROM venty_partidas WHERE user_id = ? AND created_at >= ? AND created_at < ?`).get(userId, ini, fin);
  const consultasHoy = (consultasRow && consultasRow.c) || 0;
  const totalRow = db.prepare(`SELECT COUNT(*) c FROM venty_partidas WHERE user_id = ?`).get(userId);
  const total = (totalRow && totalRow.c) || 0;
  const vivasRow = db.prepare(`SELECT COUNT(*) c FROM venty_partidas WHERE user_id = ? AND estado = 'viva'`).get(userId);
  const vivas = (vivasRow && vivasRow.c) || 0;
  const alertas = detectarSinResponder(db, userId, o);
  const norte = computarLineaNorteReal(db, userId, mondayKeyOf(fecha));
  let frase;
  if (!total) frase = 'hoy no entró ninguna consulta todavía, venty está buscando';
  else if (alertas.length) frase = `alerta grave: hay ${alertas.length} ${alertas.length === 1 ? 'consulta' : 'consultas'} sin responder · hoy cerraste ${ultimo.size} ${ultimo.size === 1 ? 'venta' : 'ventas'} por ${fmtPesos(montoHoy)} · ${vivas} ${vivas === 1 ? 'conversación viva' : 'conversaciones vivas'}`;
  else if (!ultimo.size) frase = `hoy entraron ${consultasHoy} ${consultasHoy === 1 ? 'consulta' : 'consultas'} · todavía sin cierres hoy · ${vivas} ${vivas === 1 ? 'conversación viva' : 'conversaciones vivas'} · venty sigue buscando`;
  else frase = `hoy cerraste ${ultimo.size} ${ultimo.size === 1 ? 'venta' : 'ventas'} por ${fmtPesos(montoHoy)} · ${vivas} ${vivas === 1 ? 'conversación viva' : 'conversaciones vivas'}`;
  return {
    frase, fecha, ventas_hoy: ultimo.size, monto_hoy: montoHoy,
    consultas_hoy: consultasHoy, vivas, alertas_canal: alertas,
    tasa_cierre_pct: norte.tasa_cierre_pct, primera_respuesta_seg: norte.primera_respuesta_seg,
    linea_norte: norte, modo: MODO, fuente: FUENTE,
  };
}

// ---- niveles con hechos (solo venty_eventos) ----
const NIVELES = [
  { nivel: 1, nombre: 'recién sentado al tablero', escala: 'llegando' },
  { nivel: 2, nombre: 'leyendo tu partida', escala: 'conociendo tu mundo' },
  { nivel: 3, nombre: 'jugando de memoria', escala: 'de la casa' },
  { nivel: 4, nombre: 'viendo tres jugadas adelante', escala: 'mano derecha' },
  { nivel: 5, nombre: 'la partida entera en su cabeza', escala: 'socio' },
];

function hechosNivel(db, userId) {
  const rows = db.prepare(`SELECT tipo, partida_id, datos_json FROM venty_eventos WHERE user_id = ?`).all(userId);
  const porTipo = new Map();
  for (const r of rows) {
    if (!porTipo.has(r.tipo)) porTipo.set(r.tipo, []);
    porTipo.get(r.tipo).push(r);
  }
  const cuenta = (tipo) => (porTipo.get(tipo) || []).length;
  const distintas = (tipos) => {
    const s = new Set();
    for (const t of tipos) for (const r of porTipo.get(t) || []) if (r.partida_id != null) s.add(Number(r.partida_id));
    return s.size;
  };
  const objDistintas = new Set((porTipo.get('objecion') || []).map((r) => String(safeJson(r.datos_json, {}).texto || '')).filter(Boolean)).size;
  const partesSet = new Set((porTipo.get('parte_emitido') || []).map((r) => String(safeJson(r.datos_json, {}).semana || '')).filter(Boolean));
  const conSeguimiento = new Set((porTipo.get('seguimiento') || []).map((r) => r.partida_id).filter((x) => x != null).map(Number));
  const conCierre = new Set((porTipo.get('cierre') || []).map((r) => r.partida_id).filter((x) => x != null).map(Number));
  const seguimientoConCierre = [...conSeguimiento].filter((id) => conCierre.has(id)).length;
  const formas = new Set();
  for (const r of porTipo.get('cierre') || []) {
    const f = String(safeJson(r.datos_json, {}).forma || '').toLowerCase();
    if (/pago/.test(f)) formas.add('pago');
    else if (/seña|sena/.test(f)) formas.add('sena');
    else if (/reserva|turno/.test(f)) formas.add('reserva');
    else if (/visita/.test(f)) formas.add('visita');
  }
  return {
    hechos_total: rows.length,
    lectura_fuente: cuenta('lectura_fuente'),
    cotizacion_partidas: distintas(['cotizacion']),
    primera_respuesta_partidas: distintas(['primera_respuesta']),
    partidas_atendidas: distintas(['primera_respuesta', 'cotizacion', 'cierre', 'seguimiento']),
    objeciones_distintas: objDistintas,
    cierre_partidas: distintas(['cierre']),
    resena_pedida: cuenta('resena_pedida') + cuenta('resena'),
    partes_emitidos: partesSet.size,
    jugada_aceptada: cuenta('jugada_aceptada'),
    seguimiento_con_cierre: seguimientoConCierre,
    objecion_anticipada: cuenta('objecion_anticipada'),
    formas_cierre_distintas: formas.size,
  };
}

// Compuertas exactas por nivel destino (hecho, necesita, descripción).
const COMPUERTAS = {
  2: [
    { clave: 'lectura_fuente', necesita: 1, descripcion: 'leer una fuente real del negocio, con su lectura registrada' },
    { clave: 'cotizacion_partidas', necesita: 1, descripcion: 'cotizar una partida desde esa fuente' },
    { clave: 'primera_respuesta_partidas', necesita: 1, descripcion: 'dar la primera respuesta en una partida real' },
  ],
  3: [
    { clave: 'partidas_atendidas', necesita: 10, descripcion: 'atender 10 partidas reales' },
    { clave: 'objeciones_distintas', necesita: 3, descripcion: 'registrar 3 objeciones distintas con su texto' },
    { clave: 'cierre_partidas', necesita: 1, descripcion: 'cerrar una partida con su forma registrada' },
    { clave: 'resena_pedida', necesita: 1, descripcion: 'pedir una reseña tras un cierre' },
  ],
  4: [
    { clave: 'partes_emitidos', necesita: 4, descripcion: 'emitir 4 partes semanales con datos reales' },
    { clave: 'jugada_aceptada', necesita: 1, descripcion: 'que el dueño acepte una jugada de la bandeja' },
    { clave: 'seguimiento_con_cierre', necesita: 1, descripcion: 'que un seguimiento reviva una partida y la cierre' },
    { clave: 'objecion_anticipada', necesita: 1, descripcion: 'registrar una objeción anticipada, respondida antes de que frenara' },
  ],
  5: [
    { clave: 'formas_cierre_distintas', necesita: 3, descripcion: 'cerrar en 3 formas distintas: pago, seña, reserva o visita' },
    { clave: 'resena_pedida', necesita: 3, descripcion: 'pedir reseñas tres veces, con su registro' },
    { clave: 'jugada_aceptada', necesita: 3, descripcion: 'que el dueño acepte tres jugadas de la bandeja' },
    { clave: 'partes_emitidos', necesita: 8, descripcion: 'emitir 8 partes semanales con datos reales' },
    { clave: 'cierre_partidas', necesita: 10, descripcion: 'cerrar 10 partidas reales' },
  ],
};

function computarNivel(db, userId) {
  const hechos = hechosNivel(db, userId);
  const detalle = [];
  let nivel = 1;
  for (const destino of [2, 3, 4, 5]) {
    const items = COMPUERTAS[destino].map((g) => {
      const hecho = Number(hechos[g.clave]) || 0;
      return { clave: g.clave, descripcion: g.descripcion, hecho, necesita: g.necesita, falta: Math.max(0, g.necesita - hecho), cumple: hecho >= g.necesita };
    });
    const completo = items.every((i) => i.cumple);
    detalle.push({ destino, nombre: NIVELES[destino - 1].nombre, completo, items });
    if (completo && nivel === destino - 1) nivel = destino;
  }
  const actual = NIVELES[nivel - 1];
  const siguiente = nivel < 5 ? detalle.find((d) => d.destino === nivel + 1) : null;
  const faltantes = siguiente ? siguiente.items.filter((i) => !i.cumple) : [];
  let textoFalta;
  if (!siguiente) textoFalta = 'ya llegó al nivel más alto: sigue sumando hechos y el nivel no baja nunca';
  else if (!hechos.hechos_total) textoFalta = `todavía no hay hechos registrados, así que está en el nivel inicial · para llegar a ${siguiente.nombre} falta: ` + faltantes.map((i) => i.descripcion).join(' · ');
  else textoFalta = `para llegar a ${siguiente.nombre} falta: ` + faltantes.map((i) => `${i.descripcion} (${i.hecho} de ${i.necesita})`).join(' · ');
  return {
    nivel, nombre: actual.nombre, escala: actual.escala,
    nombres: NIVELES,
    hechos, detalle, siguiente_nivel: siguiente ? siguiente.destino : null,
    siguiente_nombre: siguiente ? siguiente.nombre : null,
    que_falta: faltantes, texto_falta: textoFalta,
    sin_hechos: hechos.hechos_total === 0,
    regla: 'el nivel se gana solo con hechos registrados en venty_eventos, nunca por pagar y nunca baja',
    modo: MODO, fuente: 'venty_eventos',
  };
}

// ---- jobs de agregación (idempotentes) ----
function usuariosConRegistro(db) {
  const s = new Set();
  try { for (const r of db.prepare(`SELECT DISTINCT user_id FROM venty_fundamento`).all()) s.add(Number(r.user_id)); } catch (e) {}
  try { for (const r of db.prepare(`SELECT DISTINCT user_id FROM venty_partidas`).all()) s.add(Number(r.user_id)); } catch (e) {}
  return [...s].sort((a, b) => a - b);
}

function jobFraseDiaria(db, opts) {
  const o = opts || {};
  ensureSchema(db);
  const fecha = o.fecha || hoyYmd();
  const users = o.userId ? [Number(o.userId)] : usuariosConRegistro(db);
  const resultados = [];
  for (const uid of users) {
    const datos = computarFraseReal(db, uid, { fecha, ahora: o.ahora });
    db.prepare(`INSERT INTO venty_medicion_frase (user_id, fecha, datos_json, calculado_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id, fecha) DO UPDATE SET datos_json = excluded.datos_json, calculado_at = excluded.calculado_at`)
      .run(uid, fecha, JSON.stringify(datos), ahoraIso());
    resultados.push({ user_id: uid, fecha, frase: datos.frase });
  }
  return { ok: true, job: 'frase_diaria', fecha, procesados: resultados.length, resultados };
}

function jobParteSemanal(db, opts) {
  const o = opts || {};
  ensureSchema(db);
  const { sem } = rangoSemana(o.semana);
  const users = o.userId ? [Number(o.userId)] : usuariosConRegistro(db);
  const resultados = [];
  for (const uid of users) {
    const parte = computarParteReal(db, uid, sem, o);
    if (!parte.emitido) { resultados.push({ user_id: uid, semana: sem, emitido: false, razon: parte.razon }); continue; }
    const ya = db.prepare(`SELECT id FROM venty_parte WHERE user_id = ? AND semana = ?`).get(uid, sem);
    db.prepare(`INSERT INTO venty_parte (user_id, semana, datos_json, emitido_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id, semana) DO UPDATE SET datos_json = excluded.datos_json`)
      .run(uid, sem, JSON.stringify(parte), ahoraIso());
    if (!ya) {
      try {
        db.prepare(`INSERT INTO venty_eventos (user_id, tipo, partida_id, datos_json, created_at) VALUES (?,?,?,?,?)`)
          .run(uid, 'parte_emitido', null, JSON.stringify({ semana: sem }), ahoraIso());
      } catch (e) { /* el registro nunca rompe el job */ }
    }
    resultados.push({ user_id: uid, semana: sem, emitido: true, nuevo: !ya });
  }
  return { ok: true, job: 'parte_semanal', semana: sem, procesados: resultados.length, resultados };
}

// Registro de jobs siguiendo el patrón de scheduler.js (node-cron,
// una expresión por job, cada corrida envuelta para que un error no
// tire el scheduler). Diaria 08:05 para la frase; semanal viernes
// 18:30 para el parte. No se registra dos veces sobre la misma db.
const jobsRegistrados = new WeakSet();
function registrarJobs(cron, db, opts) {
  if (!cron || typeof cron.schedule !== 'function' || !db) return false;
  if (jobsRegistrados.has(db)) return false;
  jobsRegistrados.add(db);
  const o = opts || {};
  cron.schedule('5 8 * * *', () => { try { jobFraseDiaria(db, o); } catch (e) { console.error('[venty-medicion] frase diaria:', e.message); } });
  cron.schedule('30 18 * * 5', () => { try { jobParteSemanal(db, o); } catch (e) { console.error('[venty-medicion] parte semanal:', e.message); } });
  return true;
}

module.exports = {
  MODO, FUENTE, UMBRAL_SIN_RESPUESTA_MIN, NIVELES, COMPUERTAS, CAMPOS_DELTA,
  ensureSchema, computarParteReal, computarSemana, computarLineaNorteReal,
  computarFraseReal, computarNivel, hechosNivel, detectarSinResponder,
  computarSaliente, medirPrimerasRespuestas,
  jobFraseDiaria, jobParteSemanal, registrarJobs, usuariosConRegistro,
  hoyYmd, mondayKeyOf, shiftDays, rangoSemana, fmtPesos,
};
