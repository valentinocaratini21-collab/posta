// MEDICIÓN DE LOS 4 PILARES — lote medición (5/11/2026, aprobado «Arma todo»)
// Mide en serio tres cosas con datos ya existentes, sin dashboard nuevo y
// sin cambios de UI. La lectura sale por GET /api/medicion (datos propios
// del usuario que pide + agregados globales SIN identificadores).
//
// (a) FOTO→POSTEO: desde que el cliente manda una foto hasta que queda
//     programada. Población exacta: posteos del flujo subir-foto
//     (source_topic='subir-foto-preguntas') con foto_asset_id (la foto del
//     cliente que lo originó). Duración = posts.created_at −
//     assets.created_at. Incluye el tiempo del cliente respondiendo las
//     preguntas del modal: es el camino completo, no solo el proceso.
//     Los posteos de subir-foto anteriores a este lote no traen
//     foto_asset_id y se cuentan aparte como sin_origen (no se estiman).
//     El camino foto-por-chat → create queda FUERA de esta v1: ese flujo
//     no marca el origen (sin source_topic ni foto_asset_id); sumarlo es
//     un lote aparte, no una estimación.
// (b) ONBOARDING→SEMANA: desde que arranca /prueba (el envío del form, no
//     la visita) hasta que la semana está generada. Inicio = evento
//     funnel 'prueba_start' (meta = @ normalizado, o 'web:'+dominio; se
//     registra en /api/trial/generate y /api/trial/generate-stream, solo
//     fuera de testMode). Fin = trial_locks.generated_at (estable: nunca
//     se reescribe al servir un snapshot; trial_cache.created_at SÍ se
//     reescribe y por eso solo es fallback). Emparejamiento: para cada
//     candado, el prueba_start más reciente con created_at ≤
//     generated_at. Sin inicio registrado (pruebas viejas, anteriores al
//     evento) no se mide: se cuentan como sin_inicio, nunca se estiman.
//     Secundario: generado→entrada (users.created_at del invitado −
//     generated_at), que muestra cuánto tarda el visitante en entrar al
//     feed una vez lista la semana. Solo agregados, sin @ ni dominios.
// (c) % SEMANAS ACEPTADAS SIN CAMBIOS: semanas (user_id, week_key) con al
//     menos un posteo aprobado por el dueño (approved_at NOT NULL y
//     approval != 'auto': el autopiloto no es aceptación del dueño).
//     Fuera: subir-foto (posteos sueltos, no semanas) y tipo evento.
//     Una semana tiene cambios si algún posteo suyo tiene una fila en
//     post_versions posterior a su approved_at (edición o rehacer tras
//     aprobar — el rehacer solo de imagen también deja versión desde este
//     lote), o si quedó approval='rejected' / status='cancelled' tras
//     haber sido aprobado. Limitación honesta: un posteo aprobado que
//     volvió a borrador pierde su scheduled_at y su week_key, así que no
//     se puede atribuir a su semana original y no cuenta como cambio.
//     week_key sale de posts.week_key (legado sin week_key: lunes de
//     scheduled_at en el tz de la cuenta).
//
// Todo es defensivo: si una tabla o columna falta, la sección devuelve
// vacío con nota en vez de romper el endpoint.

function parseTs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) { const n = Number(s); return Number.isFinite(n) ? n : null; }
  const iso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function fmtUtc(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function aggMin(minutes) {
  const vals = minutes.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!vals.length) return { n: 0, mediana_min: null, media_min: null, min_min: null, max_min: null };
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const mediana = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const r1 = (n) => Math.round(n * 10) / 10;
  return { n: vals.length, mediana_min: r1(mediana), media_min: r1(media), min_min: r1(sorted[0]), max_min: r1(sorted[sorted.length - 1]) };
}

// Lunes (YYYY-MM-DD) de la semana del posteo, en el tz de la cuenta.
// Misma lógica que notify-email.js: solo fallback para posteos legado sin
// week_key.
function mondayKeyOfScheduled(iso, tz) {
  const t = parseTs(iso);
  if (t === null) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', timeZone: tz || 'America/Argentina/Buenos_Aires',
    }).formatToParts(new Date(t));
    const get = (x) => (parts.find((p) => p.type === x) || {}).value || '';
    const y = Number(get('year')), m = Number(get('month')), day = Number(get('day'));
    const off = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[get('weekday')];
    if (!y || !m || !day || off === undefined) return '';
    return new Date(Date.UTC(y, m - 1, day - off)).toISOString().slice(0, 10);
  } catch (e) { return ''; }
}

function hasColumn(db, table, col) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return rows.some((r) => r.name === col);
  } catch (e) { return false; }
}

function fotoPosteo(db, userId) {
  const out = { ...aggMin([]), sin_origen: 0, excluidos: 0, muestras: [] };
  try {
    if (!hasColumn(db, 'posts', 'foto_asset_id')) { out.nota = 'sin_columna_foto_asset_id'; return out; }
    const rows = db.prepare(`
      SELECT p.id, p.created_at, a.created_at AS asset_created
      FROM posts p JOIN assets a ON a.id = p.foto_asset_id
      WHERE p.user_id = ? AND COALESCE(p.source_topic, '') = 'subir-foto-preguntas'
      ORDER BY p.created_at DESC`).all(userId);
    const minutes = [];
    for (const r of rows) {
      const a = parseTs(r.asset_created), b = parseTs(r.created_at);
      if (a === null || b === null || b - a <= 0) { out.excluidos++; continue; }
      const m = (b - a) / 60000;
      minutes.push(m);
      if (out.muestras.length < 20) out.muestras.push({ post_id: r.id, minutos: Math.round(m * 10) / 10 });
    }
    try {
      const s = db.prepare(`
        SELECT COUNT(*) c FROM posts WHERE user_id = ? AND COALESCE(source_topic, '') = 'subir-foto-preguntas'
        AND foto_asset_id IS NULL`).get(userId);
      out.sin_origen = (s && s.c) || 0;
    } catch (e) {}
    Object.assign(out, aggMin(minutes));
    out.muestras = out.muestras;
    return out;
  } catch (e) { out.nota = 'sin_datos'; return out; }
}

function semanas(db, userId, tz) {
  const out = { total: 0, sin_cambios: 0, pct: null, sin_semana: 0, detalle: [] };
  try {
    const posts = db.prepare(`
      SELECT id, week_key, scheduled_at, approved_at, approval, status, source_topic, tipo
      FROM posts WHERE user_id = ? AND approved_at IS NOT NULL
      AND COALESCE(approval, '') != 'auto'
      AND COALESCE(source_topic, '') != 'subir-foto-preguntas'
      AND COALESCE(tipo, '') != 'evento'`).all(userId);
    if (!posts.length) return out;
    const ids = posts.map((p) => p.id);
    const versions = new Map();
    try {
      const ph = ids.map(() => '?').join(',');
      const vrows = db.prepare(`SELECT post_id, created_at FROM post_versions WHERE post_id IN (${ph})`).all(...ids);
      for (const v of vrows) {
        if (!versions.has(v.post_id)) versions.set(v.post_id, []);
        versions.get(v.post_id).push(v.created_at);
      }
    } catch (e) {}
    const weeks = new Map();
    for (const p of posts) {
      let wk = String(p.week_key || '');
      if (!wk) wk = mondayKeyOfScheduled(p.scheduled_at, tz);
      if (!wk) { out.sin_semana++; continue; }
      if (!weeks.has(wk)) weeks.set(wk, { week_key: wk, posteos: 0, cambios: new Set() });
      const w = weeks.get(wk);
      w.posteos++;
      const ap = parseTs(p.approved_at);
      const vs = versions.get(p.id) || [];
      if (ap !== null && vs.some((c) => { const t = parseTs(c); return t !== null && t > ap; })) w.cambios.add('edicion');
      if (p.approval === 'rejected' || p.status === 'cancelled') w.cambios.add('rechazo');
    }
    const list = [...weeks.values()].sort((a, b) => (a.week_key < b.week_key ? 1 : -1));
    out.total = list.length;
    out.sin_cambios = list.filter((w) => w.cambios.size === 0).length;
    out.pct = list.length ? Math.round((out.sin_cambios / list.length) * 1000) / 10 : null;
    out.detalle = list.slice(0, 20).map((w) => ({ week_key: w.week_key, posteos: w.posteos, cambios: [...w.cambios] }));
    return out;
  } catch (e) { out.nota = 'sin_datos'; return out; }
}

function onboardingSemana(db) {
  const out = { ...aggMin([]), sin_inicio: 0, excluidos: 0, entrada: aggMin([]), muestras_min: [] };
  try {
    let ends = [];
    try {
      ends = db.prepare('SELECT ig, domain, generated_at FROM trial_locks ORDER BY generated_at DESC').all();
    } catch (e) { ends = []; }
    if (!ends.length) {
      try {
        const cache = db.prepare('SELECT ig, created_at FROM trial_cache ORDER BY created_at DESC').all();
        ends = cache.map((c) => ({ ig: c.ig, domain: '', generated_at: c.created_at }));
      } catch (e) {}
    }
    const minutes = [], entradas = [];
    for (const e of ends) {
      const gen = parseTs(e.generated_at);
      if (gen === null) { out.excluidos++; continue; }
      const metas = [];
      if (e.ig) metas.push(e.ig);
      if (e.domain) metas.push('web:' + e.domain);
      if (e.ig && String(e.ig).startsWith('web:')) metas.push(String(e.ig).slice(4));
      let start = null;
      for (const meta of metas) {
        try {
          const r = db.prepare(`
            SELECT created_at FROM funnel_events WHERE event = 'prueba_start' AND meta = ?
            AND datetime(created_at) <= datetime(?, 'unixepoch')
            ORDER BY created_at DESC LIMIT 1`).get(meta, Math.floor(gen / 1000));
          const t = r ? parseTs(r.created_at) : null;
          if (t !== null && (start === null || t > start)) start = t;
        } catch (err) {}
      }
      if (start === null) { out.sin_inicio++; continue; }
      if (gen - start <= 0) { out.excluidos++; continue; }
      minutes.push((gen - start) / 60000);
      // Secundario: generado → entrada al feed (invitado con ese @ o dominio).
      try {
        const g = db.prepare(`
          SELECT created_at FROM users WHERE COALESCE(is_guest, 0) = 1
          AND (guest_ig = ? OR guest_domain = ?) ORDER BY created_at ASC LIMIT 1`)
          .get(e.ig || '', e.domain || '');
        const et = g ? parseTs(g.created_at) : null;
        if (et !== null && et > gen) entradas.push((et - gen) / 60000);
      } catch (err) {}
    }
    const a = aggMin(minutes);
    out.n = a.n; out.mediana_min = a.mediana_min; out.media_min = a.media_min;
    out.min_min = a.min_min; out.max_min = a.max_min;
    out.entrada = aggMin(entradas);
    out.muestras_min = minutes.slice(0, 20).map((m) => Math.round(m * 10) / 10);
    return out;
  } catch (e) { out.nota = 'sin_datos'; return out; }
}

function computeMedicion(db, userId, tz) {
  const safe = (fn) => { try { return fn(); } catch (e) { return { nota: 'sin_datos' }; } };
  return {
    foto_posteo: safe(() => fotoPosteo(db, userId)),
    semanas: safe(() => semanas(db, userId, tz)),
    onboarding_semana: safe(() => onboardingSemana(db)),
  };
}

module.exports = { parseTs, aggMin, mondayKeyOfScheduled, fotoPosteo, semanas, onboardingSemana, computeMedicion };
