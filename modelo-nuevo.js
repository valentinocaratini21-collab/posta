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
//     gasto las arma buildTrialWeekCasara con la regla nueva (primer
//     slot en el próximo 19:00, hoy si no pasó, mañana si pasó).
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
};
