// cm-temporada.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// CALENDARIO DE TEMPORADA: fechas del rubro planeadas con anticipación
// (día del rubro, fiestas, estaciones) como insumo de la estrategia
// semanal. La fuente es ephemeris.js (la misma que ya usa el prompt de
// ideas) + fechas registradas a mano: NUNCA se inventa una fecha.
//
// fechasParaSemana filtra las efemérides dentro de la ventana de la
// semana y marca cuáles calzan con el rubro (por tokens compartidos).
// planificar las guarda en cm_temporada para que la estrategia semanal
// las vea antes de que lleguen.
'use strict';

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOP = new Set(('de la el que en y a los las un una con por para su sus al del como mas pero este esta esto eso esa sin sobre entre'.split(' ')));

function tokens(s) {
  return norm(s).split(' ').filter((w) => w.length >= 4 && !STOP.has(w));
}

function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return isNaN(dt.getTime()) ? null : dt;
}

function isoDay(dt) { return dt.toISOString().slice(0, 10); }

function addDays(ymd, n) {
  const dt = parseYmd(ymd);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() + n);
  return isoDay(dt);
}

// Eventos dentro de [weekKey, weekKey+7d). Relevancia por rubro primero.
function fechasParaSemana({ rubro = '', weekKey = '', eventos = [] } = {}) {
  const hasta = addDays(weekKey, 7);
  if (!weekKey || !hasta) return [];
  const rubroToks = new Set(tokens(rubro));
  const out = [];
  for (const e of (eventos || [])) {
    if (!e || !e.date || !e.name) continue;
    if (e.date < weekKey || e.date >= hasta) continue;
    const toks = tokens(e.name);
    const relevante = toks.some((t) => rubroToks.has(t));
    out.push({ nombre: String(e.name), fecha: String(e.date), relevante });
  }
  out.sort((a, b) => (b.relevante - a.relevante) || (a.fecha < b.fecha ? -1 : 1));
  return out;
}

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_temporada (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      fecha TEXT NOT NULL DEFAULT '', nombre TEXT NOT NULL DEFAULT '',
      rubro TEXT DEFAULT '', semana_planeada TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, fecha, nombre)
    )`);
  } catch (e) {}
}

function planificar(db, uid, weekKey, fechas, rubro) {
  try {
    if (!db || !weekKey || !Array.isArray(fechas)) return null;
    asegurarTabla(db);
    let n = 0;
    for (const f of fechas) {
      if (!f || !f.nombre || !f.fecha) continue;
      db.prepare('INSERT OR IGNORE INTO cm_temporada (user_id, fecha, nombre, rubro, semana_planeada) VALUES (?, ?, ?, ?, ?)')
        .run(uid, String(f.fecha), String(f.nombre), String(rubro || ''), String(weekKey));
      n++;
    }
    return { ok: true, planeadas: n };
  } catch (e) { return null; }
}

module.exports = { fechasParaSemana, asegurarTabla, planificar, _tokens: tokens };
