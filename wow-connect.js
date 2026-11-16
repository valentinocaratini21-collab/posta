'use strict';
// =====================================================================
// wow-connect.js — LOTE CONEXIÓN POST-WOW
//
// La agenda del wow. La pantalla que revela el primer posteo de la
// prueba ES la pantalla de conexión (decisión de Valentino, 16/11:
// «con un click se les tiene que conectar el producto de posty a su
// instagram»): el toque abre el OAuth de Instagram y, apenas conecta,
// esta agenda cumple la promesa de esa pantalla — las piezas de la
// prueba quedan agendadas a las 19:00 de la zona de la cuenta:
//
//   · la primera, en el PRÓXIMO slot de las 19:00: hoy si en su zona
//     todavía no son las 19:00, mañana si ya pasaron (nunca un «hoy»
//     falso: a las 19:00 en punto el slot ya se considera pasado);
//   · la segunda y la tercera, en los dos días que siguen, 19:00.
//
// Las piezas son las filas de `posts` que la semana ya tiene — vengan
// del software (importadas en guest/start) o de la línea a mano (la
// palanca las crea/actualiza como filas y pasan por el mismo embudo):
// la agenda NO toca imagen, caption ni headline; solo les da su día y
// su hora, con la semántica del embudo para invitados (scheduleAll-
// Drafts: status 'scheduled', approval 'auto', auto_published 1).
// Quedan afuera, como en el embudo: las historias, las piezas sin
// imagen, las retenidas por el gate (needs_review), las frenadas por
// el dueño (user_stopped) y las frenadas (frenada) — esas siguen su
// camino de revisión/freno, la promesa del wow no las pisa.
//
// Solo invitados (is_guest = 1): la marca de sesión del wow solo nace
// en las superficies de la prueba, y esta guarda lo vuelve a chequear
// del lado servidor. Sin piezas, sin invitado o con la cuenta frenada
// (publishing_stopped), la agenda no hace nada y lo declara.
// =====================================================================

const WOW_HOUR = 19;
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

// --- primitivas de zona (espejo de las de server.js: Intl, sin deps) ---

function partsInTz(ms, tz) {
  const d = new Date(ms);
  if (isNaN(d)) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const p = {};
    for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
    return {
      ymd: `${p.year}-${p.month}-${p.day}`,
      hour: Number(p.hour) % 24,
      minute: Number(p.minute),
    };
  } catch (e) { return null; }
}

function ymdDe(ms, tz) {
  const p = partsInTz(ms, tz);
  return p ? p.ymd : '';
}

// Minutos del día en la zona (0–1439): la comparación del slot se hace
// en minutos — a las 19:00 en punto el slot de hoy ya pasó.
function minutosDelDia(ms, tz) {
  const p = partsInTz(ms, tz);
  return p ? p.hour * 60 + p.minute : -1;
}

function shiftYmd(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// «YYYY-MM-DD HH:MM» de pared en la zona → ISO UTC (mismo algoritmo
// que zonedWallToUtc de server.js).
function zonedWallToUtc(s, tz) {
  try {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!m) return null;
    const Y = +m[1], Mo = +m[2], D = +m[3], h = +m[4], mi = +m[5];
    if (Y < 2026 || Y > 2030 || Mo < 1 || Mo > 12 || D < 1 || D > 31 || h > 23 || mi > 59) return null;
    const zone = tz || DEFAULT_TZ;
    const guess = Date.UTC(Y, Mo - 1, D, h, mi);
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = {};
    for (const p of fmt.formatToParts(new Date(guess))) parts[p.type] = p.value;
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, (+parts.hour % 24), +parts.minute, +parts.second);
    return new Date(guess - (asUtc - guess)).toISOString();
  } catch (e) { return null; }
}

// --- la regla del slot ---

// El día (YYYY-MM-DD en la zona) del próximo slot de las 19:00:
// hoy si todavía no son las 19:00 en la zona; mañana si ya pasaron.
function wowBaseYmd(tz, nowMs) {
  const hoy = ymdDe(nowMs, tz);
  if (!hoy) return '';
  return minutosDelDia(nowMs, tz) < WOW_HOUR * 60 ? hoy : shiftYmd(hoy, 1);
}

// Los tres días del wow: [base, base+1, base+2].
function wowDias(tz, nowMs) {
  const base = wowBaseYmd(tz, nowMs);
  if (!base) return [];
  return [base, shiftYmd(base, 1), shiftYmd(base, 2)];
}

// Los tres instantes UTC de las 19:00 de esos días.
function wowSlots(tz, nowMs) {
  const hh = String(WOW_HOUR).padStart(2, '0');
  return wowDias(tz, nowMs).map((d) => zonedWallToUtc(`${d} ${hh}:00`, tz));
}

// La palabra del día para la copia: 'hoy' | 'mañana' según la misma
// regla (el cliente calcula la suya con pzWowDayWord, en espejo).
function wowDayWord(tz, nowMs) {
  return minutosDelDia(nowMs, tz) < WOW_HOUR * 60 ? 'hoy' : 'mañana';
}

// --- la agenda ---

// Las piezas que el wow agenda: las primeras 3 de feed con imagen que
// la semana del invitado ya tiene en borrador o programadas, en orden
// de creación — el orden de la semana: la importación crea las filas
// en el orden de los días (y scheduleAllDrafts agenda por created_at
// ASC, el mismo criterio), y las piezas de la línea a mano entran en
// el orden en que se cargan, que es el de sus días.
function piezasWow(db, userId) {
  return db.prepare(
    `SELECT * FROM posts
     WHERE user_id = ?
       AND COALESCE(media_type, '') != 'story'
       AND status IN ('draft', 'scheduled')
       AND COALESCE(needs_review, 0) = 0
       AND COALESCE(user_stopped, 0) = 0
       AND COALESCE(frenada, 0) = 0
       AND COALESCE(image_path, '') != ''
     ORDER BY created_at ASC, id ASC
     LIMIT 3`
  ).all(userId);
}

function agendarAlConectar(db, userId, opts) {
  const o = opts || {};
  const tz = o.timezone || DEFAULT_TZ;
  const nowMs = Number.isFinite(o.now) ? o.now : Date.now();
  let user = null;
  try { user = db.prepare('SELECT id, is_guest, publishing_stopped FROM users WHERE id = ?').get(userId); } catch (e) { user = null; }
  if (!user) return { scheduled: 0, reason: 'no_user' };
  if (!user.is_guest) return { scheduled: 0, reason: 'not_guest' };
  if (user.publishing_stopped) return { scheduled: 0, reason: 'publishing_stopped' };
  let piezas = [];
  try { piezas = piezasWow(db, userId); } catch (e) { return { scheduled: 0, reason: 'query_failed' }; }
  if (!piezas.length) return { scheduled: 0, reason: 'no_pieces' };
  const slots = wowSlots(tz, nowMs);
  if (slots.some((s) => !s)) return { scheduled: 0, reason: 'no_slots' };
  const upd = db.prepare(
    `UPDATE posts SET scheduled_at = ?, status = 'scheduled', approval = 'auto', error = '', notified = 0, auto_published = 1 WHERE id = ?`
  );
  let n = 0;
  for (let i = 0; i < piezas.length; i++) {
    upd.run(slots[i], piezas[i].id);
    n++;
  }
  return { scheduled: n, first_at: slots[0], slots: slots.slice(0, n), ids: piezas.map((p) => p.id) };
}

module.exports = {
  WOW_HOUR,
  partsInTz, ymdDe, minutosDelDia, shiftYmd, zonedWallToUtc,
  wowBaseYmd, wowDias, wowSlots, wowDayWord,
  piezasWow, agendarAlConectar,
};
