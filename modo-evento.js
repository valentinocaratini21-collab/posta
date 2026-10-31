'use strict';
// modo-evento.js — MODO EVENTO de Posty (mejora 3/5, 2026-10-30).
// El dueño anuncia un evento y Posty arma sola la mini-campaña:
// anticipación + día del evento + cierre con gracias.
// Módulo PURO: sin I/O, sin DB, sin red. Toda fecha es YYYY-MM-DD (UTC).
// Reglas duras: fecha real dada por el dueño (nunca inventada); 3 momentos
// siempre; no pisa días tomados ni (para anticipación/cierre) días de
// cierre; nada se publica sin la aprobación de un toque (canPublish).
// Lo no dado se omite en el texto y se devuelve como pregunta, jamás se
// inventa (lugar, horario, nombre, resultados).

const MOMENTOS = ['anticipacion', 'dia', 'cierre'];

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function pad(n) { return String(n).padStart(2, '0'); }
function isoOf(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

// Fecha de hoy en UTC (YYYY-MM-DD). `now` inyectable para tests.
function hoyISO(now) {
  const d = now ? new Date(now) : new Date();
  return d.toISOString().slice(0, 10);
}

// Validador estricto YYYY-MM-DD con día real de calendario.
// Devuelve { y, m, d } o null (formato malo o día imposible, p. ej. 2026-02-30).
function parseFecha(str) {
  if (typeof str !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

function addDays(iso, n) {
  const p = parseFecha(iso);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// Día ISO de la semana: 1 = lunes … 7 = domingo.
function isoWeekday(iso) {
  const p = parseFecha(iso);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = domingo
  return dow === 0 ? 7 : dow;
}

// "sábado 7 de noviembre" — para que el caption suene humano, sin inventar nada.
function fechaLinda(iso) {
  const p = parseFecha(iso);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return `${DIAS_ES[dt.getUTCDay()]} ${p.d} de ${MESES_ES[p.m - 1]}`;
}

function clean(s) {
  return String(s == null ? '' : s).trim();
}

// Guarda 1 — fecha del evento. `now` inyectable (tests deterministas).
// ok:false + error: 'fecha_ausente' | 'fecha_invalida' | 'fecha_pasada'.
function validateEventDate(fecha, now) {
  const f = clean(fecha);
  if (!f) return { ok: false, error: 'fecha_ausente' };
  const p = parseFecha(f);
  if (!p) return { ok: false, error: 'fecha_invalida' };
  const iso = isoOf(p.y, p.m, p.d);
  if (iso <= hoyISO(now)) return { ok: false, error: 'fecha_pasada' };
  return { ok: true, error: null, fecha: iso };
}

// Lo no dado: una pregunta de un toque por dato, nunca un invento.
function missingDetails(input) {
  const preguntas = [];
  if (!clean(input && input.nombre)) preguntas.push({ campo: 'nombre', pregunta: '¿cómo se llama el evento?' });
  if (!clean(input && input.lugar)) preguntas.push({ campo: 'lugar', pregunta: '¿dónde es?' });
  if (!clean(input && input.horario)) preguntas.push({ campo: 'horario', pregunta: '¿a qué hora?' });
  return preguntas;
}

function detalleFrase(detalle) {
  const d = clean(detalle);
  if (!d) return '';
  return /[.!?…]$/.test(d) ? ` ${d}` : ` ${d}.`;
}

// Caption de cada momento. Usa SOLO datos dados: lo ausente se omite.
// `nombre` ausente → "nuestro evento" (genérico, no inventado).
// El cierre agradece sin inventar resultados: nunca "fue un éxito".
function captionFor(momento, input) {
  const nombre = clean(input.nombre) || 'nuestro evento';
  const negocio = clean(input.negocio);
  const lugar = clean(input.lugar);
  const horario = clean(input.horario);
  const enLugar = lugar ? ` en ${lugar}` : '';
  const aHora = horario ? ` desde las ${horario}` : '';
  const firma = negocio ? ` ${negocio} va a estar ahí.` : '';
  const detalle = detalleFrase(input.detalle);
  if (momento === 'anticipacion') {
    return `falta poco para ${nombre} ✨ el ${fechaLinda(input.fecha)}${enLugar}${aHora}.${firma}${detalle}`.replace(/\s+/g, ' ').trim();
  }
  if (momento === 'dia') {
    const espera = negocio ? ` ${negocio} te espera.` : ' te esperamos.';
    return `hoy es ${nombre} 🎉${enLugar}${aHora}. pasate a vernos,${espera}${detalle}`.replace(/\s+/g, ' ').trim();
  }
  // cierre
  const gracias = negocio ? `gracias por pasar por ${nombre} 💛 ${negocio} te lo agradece.` : `gracias por pasar por ${nombre} 💛 nos vemos en la próxima.`;
  return `${gracias}${detalle}`.replace(/\s+/g, ' ').trim();
}

// Arma la campaña en borrador (sin agendar: eso lo hace slotCampaign).
// Devuelve { ok, campaign } o { ok:false, error }.
function buildCampaign(input, now) {
  const v = validateEventDate(input && input.fecha, now);
  if (!v.ok) return { ok: false, error: v.error };
  const fecha = v.fecha;
  const hoy = hoyISO(now);
  // Anticipación: evento − 2 días; si ya pasó, − 1 día; si el evento es
  // mañana, hoy mismo (anticipacion_hoy). Nunca después del evento.
  let anticipacion = addDays(fecha, -2);
  if (anticipacion <= hoy) anticipacion = addDays(fecha, -1);
  if (anticipacion <= hoy) anticipacion = hoy;
  const campaign = {
    nombre: clean(input.nombre),
    fecha_evento: fecha,
    lugar: clean(input.lugar),
    horario: clean(input.horario),
    detalle: clean(input.detalle),
    negocio: clean(input.negocio),
    estado: 'borrador',
    anticipacion_hoy: anticipacion === hoy,
    momentos: MOMENTOS.map((momento) => ({
      momento,
      fecha_objetivo: momento === 'anticipacion' ? anticipacion : momento === 'dia' ? fecha : addDays(fecha, 1),
      caption: captionFor(momento, { ...input, fecha }),
    })),
    preguntas: missingDetails(input),
  };
  return { ok: true, campaign };
}

// Agenda la campaña en huecos libres.
// opts: { takenDates: [YYYY-MM-DD...] (posteos programados/publicados),
//         closedDays: [1..7 ISO] (días de cierre del negocio),
//         hoy: 'YYYY-MM-DD' (inyectable para tests; por defecto hoy UTC) }.
// - día: ANCLADO a la fecha del evento. Si está tomado → conflicto
//   'dia_ocupado' (nunca se pisa). Si es día de cierre se permite igual:
//   el evento ocurre ese día (el dueño está ahí) y se marca dia_en_cierre.
// - anticipación: retrocede desde su objetivo hasta el primer hueco libre,
//   sin bajar nunca de hoy. Sin hueco → 'sin_hueco_anticipacion'.
// - cierre: avanza desde evento + 1 hasta el primer hueco libre (tope 60 d).
// Devuelve { ok, slots: [{momento, fecha, caption}] } o { ok:false, error, fecha? }.
function slotCampaign(campaign, opts) {
  const taken = new Set(Array.isArray(opts && opts.takenDates) ? opts.takenDates : []);
  const closed = new Set(Array.isArray(opts && opts.closedDays) ? opts.closedDays : []);
  const hoy = (opts && opts.hoy) || hoyISO();
  const isFree = (iso) => !taken.has(iso) && !closed.has(isoWeekday(iso));
  const byMoment = {};
  for (const m of campaign.momentos) byMoment[m.momento] = m;

  const dia = byMoment.dia;
  if (taken.has(dia.fecha_objetivo)) {
    return { ok: false, error: 'dia_ocupado', fecha: dia.fecha_objetivo };
  }
  // Anticipación: retroceder sin bajar de hoy y sin anticipar más de 7
  // días antes del evento (una anticipación lejana pierde sentido).
  let antFecha = null;
  let cursor = byMoment.anticipacion.fecha_objetivo;
  const ventanaAnt = addDays(campaign.fecha_evento, -7);
  for (let i = 0; i < 30; i++) {
    if (cursor < hoy || cursor < ventanaAnt) break;
    if (isFree(cursor)) { antFecha = cursor; break; }
    cursor = addDays(cursor, -1);
  }
  if (!antFecha) return { ok: false, error: 'sin_hueco_anticipacion' };
  // Cierre: avanzar hasta el primer hueco libre.
  let cieFecha = null;
  cursor = byMoment.cierre.fecha_objetivo;
  for (let i = 0; i < 60; i++) {
    if (isFree(cursor)) { cieFecha = cursor; break; }
    cursor = addDays(cursor, 1);
  }
  if (!cieFecha) return { ok: false, error: 'sin_hueco_cierre' };

  const slots = [
    { momento: 'anticipacion', fecha: antFecha, caption: byMoment.anticipacion.caption },
    { momento: 'dia', fecha: dia.fecha_objetivo, caption: dia.caption },
    { momento: 'cierre', fecha: cieFecha, caption: byMoment.cierre.caption },
  ];
  return {
    ok: true,
    slots,
    dia_en_cierre: closed.has(isoWeekday(dia.fecha_objetivo)),
  };
}

// Gate de publicación: solo una campaña aprobada puede publicar.
// El borrador NO publica (plan ≠ publicación); la cancelada, tampoco.
function canPublish(campaign) {
  return !!campaign && campaign.estado === 'aprobada';
}

// Transición de aprobación (un toque). Idempotente si ya está aprobada.
// Cancelada: no se puede aprobar (409 en el endpoint).
function approveCampaign(campaign) {
  if (!campaign) return { ok: false, error: 'sin_campana' };
  if (campaign.estado === 'cancelada') return { ok: false, error: 'campana_cancelada' };
  if (campaign.estado === 'aprobada') return { ok: true, campaign, yaEstaba: true };
  if (campaign.estado !== 'borrador') return { ok: false, error: 'estado_invalido' };
  return { ok: true, campaign: { ...campaign, estado: 'aprobada' }, yaEstaba: false };
}

module.exports = {
  MOMENTOS, hoyISO, parseFecha, addDays, isoWeekday, fechaLinda,
  validateEventDate, missingDetails, captionFor, buildCampaign,
  slotCampaign, canPublish, approveCampaign,
};
