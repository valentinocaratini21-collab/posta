'use strict';

// =====================================================================
// LOTE MODELO-NUEVO — «HOY TE ESTUDIAMOS, MAÑANA SALE»
// =====================================================================
// Decisión de Valentino (18/11/2026): la prueba se vende como
// «descargá la app y te hacemos 3 posteos gratis» y el primer posteo
// sale MAÑANA a las 19:00 — la ventana de producción pasa de minutos
// a un día entero. Lo que el cliente ve AL INSTANTE no es la pieza
// terminada: es su SEMANA PLANEADA (estrella, formatos y fechas,
// desde los datos de su semana de prueba). Este módulo es la
// proyección pura de ese plan desde el payload de trial_cache + la
// marca persistida de aprobación de la estrategia. Sin dependencias
// de server.js (testeable con node:sqlite, como guest-trial.js).
//
// EL PLAN, DESDE LOS DATOS QUE LA SEMANA YA TRAE:
//   - fechas: payload.week[i] {day, date, hour} — en la puerta sin
//     gasto las arma buildTrialWeekCasara. (LOTE PLAN-MAGIA · 18/11)
//     La regla vigente es la del modelo: el día 1 sale MAÑANA 19:00
//     siempre; la cáscara ya nace así y esta proyección reasigna las
//     cáscaras viejas que todavía arrancan hoy (ver planSemanaPrueba).
//   - estrella: payload.digest.producto_estrella (o la estrella que
//     el spec registró para el slot 0 en design.posts[0].creatividad).
//   - nombre de la pieza: posts[i].headline o design.posts[i].headline
//     (el slot 0 sin titular muestra su estrella: la pieza ES la
//     estrella). Nada se inventa: sin nombre, el slot muestra su
//     formato o queda solo con su fecha.
//   - formato de la pieza: posts[i].formato (lo nombra la palanca
//     admin de pieza a mano al cargar la pieza, que es donde el
//     sistema de formatos de bamboo toca la app) o design.posts[i]
//     .formato si un spec futuro lo trae.
//   - sistema de formatos del negocio: payload.formatos_sistema
//     (la lista que la palanca admin puede fijar sobre la semana) o,
//     en su defecto, los formatos nombrados de los slots en orden.
//   - estado del slot: 'listo' cuando la pieza ya está cargada
//     (mano.cargada_at, o media presente y no en armado); 'plan'
//     mientras es solo plan. La casa NUNCA finge arte terminado:
//     el slot en plan es un vidrio con nombre y fecha, sin imagen.

function ensureSchema(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS trial_estrategia_aprobada (
      user_id INTEGER PRIMARY KEY,
      aprobada_at INTEGER NOT NULL DEFAULT 0
    )`);
  } catch (e) {}
}

// La aprobación de la estrategia («Así va a postear tu Instagram»,
// un toque): la marca vive en su tabla propia, una fila por usuario.
function estrategiaAprobada(db, userId) {
  try {
    if (!db || !userId) return 0;
    ensureSchema(db);
    const r = db.prepare('SELECT aprobada_at FROM trial_estrategia_aprobada WHERE user_id = ?').get(userId);
    return r ? (Number(r.aprobada_at) || 0) : 0;
  } catch (e) { return 0; }
}

function marcarEstrategiaAprobada(db, userId, now) {
  const t = Number(now) || Date.now();
  if (!db || !userId) return 0;
  ensureSchema(db);
  const prev = estrategiaAprobada(db, userId);
  if (prev) return prev; // idempotente: la primera aprobación manda
  db.prepare('INSERT OR REPLACE INTO trial_estrategia_aprobada (user_id, aprobada_at) VALUES (?, ?)').run(userId, t);
  return t;
}

function txt(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 120);
}

function estrellaDe(payload) {
  const d = (payload && payload.digest) || {};
  const e = txt(d.producto_estrella, 120);
  if (e) return e;
  const design = (payload && payload.design && Array.isArray(payload.design.posts)) ? payload.design.posts : [];
  const c = design[0] && design[0].creatividad;
  return txt(c && c.estrella, 120);
}

function formatosSistema(payload) {
  const raw = payload && Array.isArray(payload.formatos_sistema) ? payload.formatos_sistema : [];
  const out = [];
  for (const f of raw) {
    const s = txt(f, 60);
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 6);
}

function formatoDeSlot(payload, i) {
  const posts = (payload && Array.isArray(payload.posts)) ? payload.posts : [];
  const design = (payload && payload.design && Array.isArray(payload.design.posts)) ? payload.design.posts : [];
  return txt((posts[i] && posts[i].formato) || (design[i] && design[i].formato), 60);
}

function nombreDeSlot(payload, i, estrella) {
  const posts = (payload && Array.isArray(payload.posts)) ? payload.posts : [];
  const design = (payload && payload.design && Array.isArray(payload.design.posts)) ? payload.design.posts : [];
  const h = txt((posts[i] && posts[i].headline) || (design[i] && design[i].headline), 120);
  if (h) return h;
  if (i === 0 && estrella) return estrella; // el slot 0 ES la pieza estrella
  return '';
}

function estadoDeSlot(p) {
  if (!p) return 'plan';
  if (p.mano && p.mano.cargada_at) return 'listo';
  if (p.armando) return 'plan';
  if (p.image || p.video || (Array.isArray(p.images) && p.images.length)) return 'listo';
  return 'plan';
}

// La etiqueta de HOY con las mismas tablas y zonas que
// buildTrialWeekCasara (server.js): sirve para marcar qué slot
// «sale hoy» comparando etiquetas, sin parsear fechas del payload.
const MN_DIAS = {
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const MN_MESES = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
function etiquetaHoy(lang, nowMs) {
  const en = lang === 'en';
  const tz = en ? 'America/New_York' : 'America/Argentina/Buenos_Aires';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Number(nowMs) || Date.now()));
    const got = {};
    for (const p of parts) got[p.type] = p.value;
    const y = Number(got.year), m = Number(got.month), d = Number(got.day);
    if (!y || !m || !d) return { day: '', date: '' };
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const days = en ? MN_DIAS.en : MN_DIAS.es;
    const months = en ? MN_MESES.en : MN_MESES.es;
    return {
      day: days[dt.getUTCDay()],
      date: en ? `${months[dt.getUTCMonth()]} ${dt.getUTCDate()}` : `${dt.getUTCDate()} ${months[dt.getUTCMonth()]}`,
    };
  } catch (e) { return { day: '', date: '' }; }
}

// ---------- (LOTE REGLA-15-19 · regla del dueño, 26/11) ----------
// «Si hacen el posteo antes de 3pm, ese posteo sale ese mismo día
// 7pm. Con 4 hrs de anticipación, podemos lograrlo.» La regla vive
// acá como funciones puras para que la cáscara, el agendado y la
// proyección del plan hablen el mismo idioma:
//   - la SALIDA es a la hora del posteo (19:00 por defecto);
//   - el CORTE es esa hora menos 4: una pieza lista antes del corte
//     sale HOY; una lista después, mañana;
//   - y el plan que ve el cliente lee el día y la hora de la agenda
//     real del posteo (etiquetasPara), nunca de etiquetas escritas
//     al generar — era el desacuerdo de la corrida ×10 (el plan
//     decía «viernes 12:30» y el posteo salía el jueves 19:00).
const REGLA_HORA_SALIDA = 19;
const REGLA_CORTE_HORAS = 4;

function mnPartesEnTz(tz, ms) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(Number(ms) || Date.now()));
    const g = {};
    for (const p of parts) g[p.type] = p.value;
    const out = { y: Number(g.year), mo: Number(g.month), d: Number(g.day), hh: Number(g.hour) % 24, mi: Number(g.minute) };
    if (!out.y || !out.mo || !out.d) return null;
    return out;
  } catch (e) { return null; }
}

function mnOffsetTzMs(tz, utcMs) {
  const p = mnPartesEnTz(tz, utcMs);
  if (!p) return 0;
  // La hora que ese instante UTC «parece» tener en la zona, leída
  // como si fuera UTC: la diferencia es el offset de la zona.
  return Date.UTC(p.y, p.mo - 1, p.d, p.hh, p.mi, 0) - Math.floor(utcMs / 60000) * 60000;
}

function mnWallToUtcMs(y, mo, d, hh, tz) {
  const wall = Date.UTC(y, mo - 1, d, hh, 0, 0);
  let utc = wall - mnOffsetTzMs(tz, wall);
  utc = wall - mnOffsetTzMs(tz, utc); // segunda pasada: bordes de DST
  return utc;
}

// ¿La pieza que se está agendando AHORA llega a salir HOY a la hora
// del posteo? Solo si ahora, en la zona de la cuenta, todavía no
// pasó la hora de corte (salida − 4 h; para las 19:00, las 15:00).
function saleHoySiListoAntesDe(tz, horaPosteo, nowMs) {
  try {
    const now = Number(nowMs) || Date.now();
    const p = mnPartesEnTz(tz, now);
    if (!p) return false;
    const hora = Number(horaPosteo);
    const corte = Math.max(0, (Number.isFinite(hora) ? hora : REGLA_HORA_SALIDA) - REGLA_CORTE_HORAS);
    return now < mnWallToUtcMs(p.y, p.mo, p.d, corte, tz);
  } catch (e) { return false; }
}

// Las etiquetas (día, fecha, hora, «sale hoy») de UN instante real,
// en la zona de la cuenta y el idioma del plan — las mismas tablas
// de la cáscara. Es la única fuente de verdad del plan cuando el
// posteo ya existe: su scheduled_at manda.
function etiquetasPara(lang, tz, ms, nowMs) {
  try {
    const en = lang === 'en';
    const p = mnPartesEnTz(tz, Number(ms));
    if (!p) return null;
    const pn = mnPartesEnTz(tz, Number(nowMs) || Date.now());
    const days = en ? MN_DIAS.en : MN_DIAS.es;
    const months = en ? MN_MESES.en : MN_MESES.es;
    const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12, 0, 0));
    const h12 = p.hh % 12 === 0 ? 12 : p.hh % 12;
    return {
      dia_semana: days[dt.getUTCDay()],
      fecha: en ? `${months[p.mo - 1]} ${p.d}` : `${p.d} ${months[p.mo - 1]}`,
      hora: en ? `${h12}:${String(p.mi).padStart(2, '0')} ${p.hh < 12 ? 'AM' : 'PM'}` : `${String(p.hh).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`,
      sale_hoy: !!(pn && pn.y === p.y && pn.mo === p.mo && pn.d === p.d),
    };
  } catch (e) { return null; }
}

// El día 1 de la cáscara, con la regla: 0 (hoy) si la semana nace
// antes del corte en la zona de la cáscara; 1 (mañana) si nace
// después. La cáscara usa la zona por idioma, como siempre.
function offsetDiaUnoCasara(lang, nowMs) {
  const tz = lang === 'en' ? 'America/New_York' : 'America/Argentina/Buenos_Aires';
  const p = mnPartesEnTz(tz, Number(nowMs) || Date.now());
  if (!p) return 1;
  return p.hh < (REGLA_HORA_SALIDA - REGLA_CORTE_HORAS) ? 0 : 1;
}

// LA PROYECCIÓN DEL PLAN. null cuando no hay semana de prueba con
// fechas (sin plan no se muestra nada: la casa no promete en vacío).
function planSemanaPrueba(payload, nowMs) {
  try {
    if (!payload || !Array.isArray(payload.posts) || !payload.posts.length) return null;
    const week = Array.isArray(payload.week) ? payload.week : [];
    if (!week.length) return null;
    const lang = (payload.lang === 'en' || payload.content_lang === 'en') ? 'en' : 'es';
    const estrella = estrellaDe(payload);
    const hoy = etiquetaHoy(lang, nowMs);
    const slots = payload.posts.slice(0, 3).map((p, i) => {
      const w = week[i] || {};
      const diaSemana = txt(w.day, 20);
      const fecha = txt(w.date, 20);
      return {
        dia: i + 1,
        nombre: nombreDeSlot(payload, i, estrella),
        formato: formatoDeSlot(payload, i),
        dia_semana: diaSemana,
        fecha,
        hora: txt(w.hour, 12),
        estado: estadoDeSlot(p),
        post_id: (p && p.mano && p.mano.post_id) || null,
        tipo: txt(p && p.type, 20) || 'image',
        sale_hoy: !!(hoy.day && diaSemana === hoy.day && fecha === hoy.date),
      };
    });
    if (!slots.length) return null;
    // (LOTE REGLA-15-19 · 26/11) LA REASIGNACIÓN DE PLAN-MAGIA YA NO
    // VA: aquella regla («el día 1 sale mañana, nunca hoy») quedó
    // derogada por la regla del dueño — si la pieza está lista antes
    // de las 15:00, el día 1 ES hoy, y una cáscara fechada hoy no es
    // un error a correr sino la promesa correcta. La proyección ya
    // no reescribe etiquetas: las del payload valen hasta que el
    // posteo existe, y desde ahí manda su agenda real (la ruta
    // mi-plan pisa día y hora con etiquetasPara sobre scheduled_at).
    let formatos = formatosSistema(payload);
    if (!formatos.length) {
      for (const s of slots) if (s.formato && !formatos.includes(s.formato)) formatos.push(s.formato);
    }
    return {
      lang,
      estrella,
      formatos,
      slots,
      linea_mano: !!payload.linea_mano,
    };
  } catch (e) { return null; }
}

module.exports = {
  ensureSchema,
  estrategiaAprobada,
  marcarEstrategiaAprobada,
  estrellaDe,
  formatosSistema,
  formatoDeSlot,
  nombreDeSlot,
  estadoDeSlot,
  etiquetaHoy,
  planSemanaPrueba,
  saleHoySiListoAntesDe,
  etiquetasPara,
  offsetDiaUnoCasara,
  REGLA_HORA_SALIDA,
  REGLA_CORTE_HORAS,
};
