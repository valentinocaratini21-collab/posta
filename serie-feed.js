'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SERIE-FEED-PROPIO (diseño .diag-serie-feed-propio/DISENO.md, orden del
// tablero 14/11/2026 — incidente de la tira del feed propio, user 12).
//
// PROBLEMA QUE CIERRA: la semana de un cliente REGISTRADO puede ser una
// SERIE pensada (foto·video·foto, cada pieza con SU día), pero ningún
// relleno automático conocía ese mapa: ensureTodayPost solo rescataba
// borradores imagen/carrusel creados en las últimas 48 h, el embudo
// semanal (scheduleDraftsPerWeek) colocaba cada borrador en el PRIMER
// día libre, y la regla 24h (scheduleAllDrafts) programaba cualquier
// borrador viejo en el próximo hueco. Resultado del 14/11: el video de
// la serie (653) quedó en borrador SIN que nadie lo notara, un posteo
// ajeno (679) tomó su día y la serie salió rota en silencio.
//
// SOLUCIÓN (este módulo, SIN tabla ni columna nueva): el día de cada
// pieza de una semana GOBERNADA se DERIVA al leer:
//
//   mapaDiasSerie(db, uid, weekKey, tz) → { gobernada, porPost, reservados }
//     · Semana gobernada: tiene un ANCLA (pieza de feed published o
//       scheduled) o una fila en feed_compositions.
//     · Las anclas fijan su día (scheduled_at / published_at en la tz de
//       la cuenta) y ocupan ese día aunque estén frenadas o sean de
//       Subir: ya están colocadas en el feed.
//     · Los borradores DEL CONJUNTO (feed, no frenada, no user_stopped,
//       no rechazados, source fuera de 'subir'/'express') toman en orden
//       (rango en la composición; desempate created_at ASC, id ASC) los
//       días de la semana no ocupados, no cerrados (closed_days) y sin
//       day_stop. Esos días quedan RESERVADOS: ningún relleno puede
//       tomarlos para otra pieza.
//     · Excedente (más borradores que días): sin día — sin reserva ni
//       alerta (la sobreproducción no es un incidente).
//
// CONSUMIDORES (el pegamento vive en server.js / scheduler.js):
//   · ensureTodayPost — paso 1.5: hoy es de la pieza dueña o de nadie.
//   · scheduleDraftsPerWeek — reservados = ocupados para ajenos; la
//     pieza gobernada solo cae en su día o espera ('serie_dia_propio').
//   · subirPlanDia — día reservado no es libre; ancla gobernada no se
//     desplaza con la mecánica «mover».
//   · serieFeedSweep (server.js, cron :07 en scheduler.js) — la ALERTA:
//     la pieza que sigue en borrador al acercarse su día habla en el
//     registro del equipo (support_team_log, visible en el conserje).
//
// PRECEDENCIA (fijada en el diseño): freno de cuenta
// (publishing_stopped) > freno de día (day_stops) > freno de pieza
// (frenada / user_stopped: la pieza sale del mapa y su día NO se
// reserva) > candado de serie > relleno normal. Los gestos humanos
// deliberados pisan el candado (no pasan por estos consumidores).
//
// Módulo PURO: sin dependencias, solo lee la DB que le pasan. Las
// funciones de fecha ESPEJAN las de server.js (mondayKeyOf, shiftDays,
// dayKeyInTz de morning-post-push.js) para no acoplar.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

// ── Fechas (espejo de server.js / morning-post-push.js) ─────────────────────

function ymdEsValida(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

// dayKeyInTz: espejo EXACTO de morning-post-push.js (en-CA da YYYY-MM-DD).
function dayKeyInTz(d, tz) {
  try {
    return d.toLocaleDateString('en-CA', {
      timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch (e) { return ''; }
}

// Lunes (YYYY-MM-DD) de la semana de un YMD — espejo de mondayKeyOf.
function mondayOf(ymd) {
  if (!ymdEsValida(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = dt.getUTCDay(); // 0 dom .. 6 sáb
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// Suma n días a un YMD — espejo de shiftDays (mediodía UTC, sin DST).
function shiftDays(ymd, n) {
  if (!ymdEsValida(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + Number(n || 0));
  return dt.toISOString().slice(0, 10);
}

// Día de semana ISO de un YMD: 1 = lunes .. 7 = domingo (closed_days).
function weekdayOf(ymd) {
  if (!ymdEsValida(ymd)) return 0;
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

// scheduled_at / published_at / created_at llegan como ISO con Z o como
// 'YYYY-MM-DD HH:MM:SS' de SQLite (UTC): sin zona explícita se leen UTC.
function parseFecha(raw) {
  if (!raw) return null;
  let s = String(raw).replace(' ', 'T');
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Minutos desde medianoche en la tz (para «la hora local ya pasó best_hour»).
function minutosLocales(d, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || DEFAULT_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    let h = 0; let m = 0;
    for (const p of parts) {
      if (p.type === 'hour') h = Number(p.value) % 24;
      if (p.type === 'minute') m = Number(p.value);
    }
    return h * 60 + m;
  } catch (e) { return 0; }
}

// ── Lecturas de la semana ────────────────────────────────────────────────────

// Piezas de la semana W del usuario: week_key explícita manda (como
// postWeekKey); la cubeta es el LUNES de esa week_key (las filas reales
// guardan el lunes, y mondayOf es idempotente sobre lunes).
function piezasDeSemana(db, uid, weekKey) {
  let rows = [];
  try {
    rows = db.prepare('SELECT * FROM posts WHERE user_id = ?').all(uid) || [];
  } catch (e) { return []; }
  return rows.filter((p) => p && p.week_key && mondayOf(String(p.week_key)) === weekKey);
}

// Orden de la composición guardada (feed_compositions.data_json.order).
// Sin composición: null (el desempate es created_at/id).
function ordenComposicion(db, uid, weekKey) {
  try {
    const rows = db.prepare('SELECT week_key, data_json FROM feed_compositions WHERE user_id = ?').all(uid) || [];
    for (const r of rows) {
      if (!r || !r.week_key || mondayOf(String(r.week_key)) !== weekKey) continue;
      try {
        const data = JSON.parse(r.data_json || '{}');
        if (data && Array.isArray(data.order)) return data.order.map((x) => Number(x)).filter((x) => x > 0);
      } catch (e) { /* fila ilegible: sin orden */ }
      return null;
    }
  } catch (e) { /* sin tabla legible: sin orden */ }
  return null;
}

function hayComposicion(db, uid, weekKey) {
  try {
    const rows = db.prepare('SELECT week_key FROM feed_compositions WHERE user_id = ?').all(uid) || [];
    return rows.some((r) => r && r.week_key && mondayOf(String(r.week_key)) === weekKey);
  } catch (e) { return false; }
}

// Días cerrados de la cuenta (profiles.closed_days, ISO 1..7) — espejo
// de closedDaysOf de server.js.
function closedDaysDe(db, uid) {
  try {
    const p = db.prepare('SELECT closed_days FROM profiles WHERE user_id = ?').get(uid);
    if (!p || !p.closed_days) return new Set();
    const arr = JSON.parse(p.closed_days);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7));
  } catch (e) { return new Set(); }
}

// day_stops del usuario como Set de day_keys — espejo de dayStopsSet.
function stopsDe(db, uid) {
  try {
    const rows = db.prepare('SELECT day_key FROM day_stops WHERE user_id = ?').all(uid) || [];
    return new Set(rows.map((r) => String(r.day_key)));
  } catch (e) { return new Set(); }
}

// ¿La pieza pertenece al CONJUNTO gobernado? (los borradores que reciben
// día derivado; las frenadas/pausadas/rechazadas y las de Subir/express
// quedan FUERA: su día no se reserva — precedencia del diseño §2.1).
function esDelConjunto(p) {
  if (!p) return false;
  if (String(p.media_type || 'image') === 'story') return false;
  const src = String(p.source || '');
  if (src === 'subir' || src === 'express') return false;
  if (Number(p.frenada || 0) === 1) return false;
  if (Number(p.user_stopped || 0) === 1) return false;
  if (String(p.approval || 'pending') === 'rejected') return false;
  return true;
}

// ── EL MAPA ──────────────────────────────────────────────────────────────────

// mapaDiasSerie(db, uid, weekKey, tz) →
//   { gobernada: bool,
//     porPost: Map<postId, dayKey>,      // anclas + borradores con día
//     porId: Map<postId, post>,          // filas de la semana (lectura)
//     reservados: Set<dayKey> }          // días de los borradores
function mapaDiasSerie(db, uid, weekKey, tz) {
  const vacio = { gobernada: false, porPost: new Map(), porId: new Map(), reservados: new Set() };
  const wk = mondayOf(String(weekKey || ''));
  if (!wk) return vacio;
  const zona = tz || DEFAULT_TZ;
  const piezas = piezasDeSemana(db, uid, wk);
  const porId = new Map(piezas.map((p) => [Number(p.id), p]));

  const hayAncla = piezas.some((p) => (p.status === 'published' || p.status === 'scheduled')
    && String(p.media_type || 'image') !== 'story');
  const gobernada = hayAncla || hayComposicion(db, uid, wk);
  if (!gobernada) return { gobernada: false, porPost: new Map(), porId, reservados: new Set() };

  const porPost = new Map();
  const ocupados = new Set();

  // 1) Las ANCLAS fijan su día y lo ocupan — TODAS las piezas de feed ya
  //    colocadas (aunque estén frenadas o sean de Subir: su día en el
  //    feed es un hecho, no una decisión del relleno).
  for (const p of piezas) {
    if (String(p.media_type || 'image') === 'story') continue;
    let raw = null;
    if (p.status === 'scheduled') raw = p.scheduled_at;
    else if (p.status === 'published') raw = p.published_at || p.scheduled_at;
    if (!raw) continue;
    const f = parseFecha(raw);
    if (!f) continue;
    const k = dayKeyInTz(f, zona);
    if (k) { porPost.set(Number(p.id), k); ocupados.add(k); }
  }

  // 2) Los borradores del conjunto toman, EN ORDEN, los días de W no
  //    ocupados, no cerrados y sin day_stop.
  const drafts = piezas.filter((p) => p.status === 'draft' && esDelConjunto(p));
  const orden = ordenComposicion(db, uid, wk);
  const rango = new Map();
  if (orden) orden.forEach((id, i) => { if (!rango.has(id)) rango.set(id, i); });
  drafts.sort((a, b) => {
    const ra = rango.has(Number(a.id)) ? rango.get(Number(a.id)) : Number.MAX_SAFE_INTEGER;
    const rb = rango.has(Number(b.id)) ? rango.get(Number(b.id)) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    const ca = String(a.created_at || ''); const cb = String(b.created_at || '');
    if (ca !== cb) return ca < cb ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });

  const stops = stopsDe(db, uid);
  const cerrados = closedDaysDe(db, uid);
  const diasLibres = [];
  for (let i = 0; i < 7; i++) {
    const k = shiftDays(wk, i);
    if (!k || ocupados.has(k) || stops.has(k)) continue;
    if (cerrados.has(weekdayOf(k))) continue;
    diasLibres.push(k);
  }

  const reservados = new Set();
  drafts.forEach((p, i) => {
    if (i >= diasLibres.length) return; // excedente: sin día, sin alerta
    porPost.set(Number(p.id), diasLibres[i]);
    reservados.add(diasLibres[i]);
  });

  return { gobernada: true, porPost, porId, reservados };
}

// Unión de días reservados de varias semanas (ensure / Subir / embudo).
function diasReservadosSerie(db, uid, tz, weekKeys) {
  const out = new Set();
  const vistas = new Set();
  for (const wk of (weekKeys || [])) {
    const m = mondayOf(String(wk || ''));
    if (!m || vistas.has(m)) continue;
    vistas.add(m);
    const mapa = mapaDiasSerie(db, uid, m, tz);
    if (!mapa.gobernada) continue;
    for (const k of mapa.reservados) out.add(k);
  }
  return out;
}

// La pieza DUEÑA de un día: el borrador del conjunto cuyo día derivado
// es dayKey (o null). Es la pregunta del paso 1.5 del ensure.
function piezaDuenaDelDia(db, uid, dayKey, tz) {
  if (!ymdEsValida(dayKey)) return null;
  const mapa = mapaDiasSerie(db, uid, mondayOf(dayKey), tz);
  if (!mapa.gobernada) return null;
  for (const [pid, dk] of mapa.porPost) {
    if (dk !== dayKey) continue;
    const p = mapa.porId.get(pid);
    if (p && p.status === 'draft' && esDelConjunto(p)) return p;
  }
  return null;
}

// El día (derivado o anclado) de UNA pieza, o null si no tiene.
function diaDerivadoDe(db, post, tz) {
  if (!post || !post.week_key) return null;
  const mapa = mapaDiasSerie(db, Number(post.user_id), mondayOf(String(post.week_key)), tz);
  if (!mapa.gobernada) return null;
  const k = mapa.porPost.get(Number(post.id));
  return k || null;
}

// ¿La pieza pertenece a una semana gobernada y está en el conjunto?
// (Subir: una ancla gobernada ya programada no se desplaza.)
function esPiezaGobernada(db, post, tz) {
  if (!post || !post.week_key) return false;
  if (!esDelConjunto(post) && post.status !== 'scheduled' && post.status !== 'published') return false;
  const mapa = mapaDiasSerie(db, Number(post.user_id), mondayOf(String(post.week_key)), tz);
  return !!mapa.gobernada;
}

// ── LA ALERTA (núcleo puro del barrido) ──────────────────────────────────────

function recorteCaption(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const max = n || 40;
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function detalleAlerta(action, post, dia, weekKey, bestHour) {
  const cap = recorteCaption(post.caption, 40);
  if (action === 'serie_alerta_vispera') {
    return `serie: la pieza ${post.id} («${cap}») es de la serie de la semana ${weekKey} y su día es mañana ${dia}; sigue en borrador.`;
  }
  if (action === 'serie_alerta_hoy') {
    return `serie: la pieza ${post.id} («${cap}») es de la serie de la semana ${weekKey} y su día es HOY ${dia} a las ${bestHour}:00; sigue en borrador.`;
  }
  return `serie: la pieza ${post.id} («${cap}») es de la serie de la semana ${weekKey} y su día era ${dia} y quedó en borrador: la serie salió sin ella.`;
}

// Dedup: ¿ya se emitió ESTA alerta (pieza, nivel, día derivado)?
// El day_key viaja en el detalle con formato fijo; la consulta previa
// al log es lo que hace idempotente al barrido.
function yaEmitida(db, postId, action, dia) {
  try {
    const r = db.prepare(
      'SELECT id FROM support_team_log WHERE post_id = ? AND action = ? AND detalle LIKE ? LIMIT 1',
    ).get(postId, action, '%' + dia + '%');
    return !!r;
  } catch (e) { return false; }
}

// alertasSerie(db, ahora, opts) → [{ user_id, post_id, action, day_key,
// week_key, detalle }] — las alertas NUEVAS que el barrido tiene que
// escribir. opts: { tzDe(uid), bestHourDe(uid) } (el pegamento pasa los
// helpers de server.js; sin ellos, tz por defecto y best_hour de users).
//
// Universo: cuentas REGISTRADAS (is_guest = 0), sin publishing_stopped,
// con borradores en las semanas anterior / actual / siguiente según la
// tz de cada cuenta. Exclusiones: la pieza frenada/pausada/rechazada no
// está en el mapa (no reserva ni alerta) · needs_review reserva su día
// pero NO alerta (ya tiene su propio canal) · un día con day_stop no
// recibe día derivado (el mapa lo salta), así que dueno_pausa /
// conserje_no_sale callan por construcción y soporte_rehacer SÍ alerta:
// el rehacer deja la pieza en borrador y su día derivado se re-deriva
// al próximo día libre, que no tiene stop.
function alertasSerie(db, ahora, opts) {
  const o = opts || {};
  const out = [];
  let userRows = [];
  try {
    userRows = db.prepare(
      `SELECT DISTINCT p.user_id AS id FROM posts p JOIN users u ON u.id = p.user_id
        WHERE p.status = 'draft' AND COALESCE(u.is_guest, 0) = 0
          AND COALESCE(u.publishing_stopped, 0) = 0`,
    ).all() || [];
  } catch (e) { return out; }

  for (const u of userRows) {
    const uid = Number(u.id);
    let tz = DEFAULT_TZ;
    try { if (typeof o.tzDe === 'function') tz = o.tzDe(uid) || DEFAULT_TZ; } catch (e) {}
    let bestHour = 19;
    try {
      if (typeof o.bestHourDe === 'function') bestHour = o.bestHourDe(uid);
      else {
        const r = db.prepare('SELECT best_hour FROM users WHERE id = ?').get(uid);
        if (r && r.best_hour >= 9 && r.best_hour <= 21) bestHour = r.best_hour;
      }
    } catch (e) {}
    if (!(bestHour >= 0 && bestHour <= 23)) bestHour = 19;

    const hoy = dayKeyInTz(ahora, tz);
    if (!hoy) continue;
    const manana = shiftDays(hoy, 1);
    const semanas = [mondayOf(shiftDays(hoy, -7)), mondayOf(hoy), mondayOf(shiftDays(hoy, 7))];

    for (const wk of semanas) {
      if (!wk) continue;
      const mapa = mapaDiasSerie(db, uid, wk, tz);
      if (!mapa.gobernada) continue;
      for (const [pid, dia] of mapa.porPost) {
        const p = mapa.porId.get(pid);
        if (!p || p.status !== 'draft' || !esDelConjunto(p)) continue;
        if (!mapa.reservados.has(dia)) continue; // solo piezas con día derivado
        if (Number(p.needs_review || 0) === 1) continue; // reserva, no alerta
        let action = null;
        if (dia === manana) action = 'serie_alerta_vispera';
        else if (dia === hoy) {
          // Solo si la hora local todavía no pasó la best_hour: después,
          // el hecho es «no salió» y lo cuenta la atrasada de mañana.
          if (minutosLocales(ahora, tz) < bestHour * 60) action = 'serie_alerta_hoy';
        } else if (dia < hoy) action = 'serie_alerta_atrasada';
        if (!action) continue;
        if (yaEmitida(db, pid, action, dia)) continue;
        out.push({
          user_id: uid,
          post_id: pid,
          action,
          day_key: dia,
          week_key: wk,
          detalle: detalleAlerta(action, p, dia, wk, bestHour),
        });
      }
    }
  }
  return out;
}

module.exports = {
  mapaDiasSerie,
  diasReservadosSerie,
  piezaDuenaDelDia,
  diaDerivadoDe,
  esPiezaGobernada,
  esDelConjunto,
  alertasSerie,
  // utilidades (la suite las usa; espejan server.js)
  mondayOf,
  shiftDays,
  weekdayOf,
  dayKeyInTz,
};
