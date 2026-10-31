'use strict';
/* =====================================================================
 * posty-dislike.js — 👎 «No me gusta → 3 opciones» (aprobado 30/10)
 *
 * Cuando al cliente no le gusta un BORRADOR de la semana, un toque en
 * «No me gusta» le ofrece 3 opciones NUEVAS para ese hueco. Elige UNA
 * con un toque y esa opción REEMPLAZA al borrador. Debajo de las 3 va
 * «Ninguna, frenar»: el hueco no sale. UNA SOLA RONDA por hueco por
 * semana, enforced en estado durable (no en la UI).
 *
 * REGLAS DURAS QUE ESTE MÓDULO ENFORCEA (no delega a la UI):
 *  1) Solo BORRADORES (status 'draft'). Publicado → 409, programado u
 *     otro estado → 409. El camino para un programado es Frenar primero
 *     (lo vuelve borrador) y después «No me gusta».
 *  2) 3 opciones = 3 IDEAS DISTINTAS: distinto ángulo, distinto titular
 *     (≤6 palabras, una idea por pieza), distinta imagen. NUNCA 3
 *     variaciones de la misma foto: las imágenes son fotos REALES del
 *     producto del cliente (de sus propios posteos / mapa de fotos),
 *     nunca stock ni genéricas. Sin texto dibujado en las imágenes.
 *  3) UNA SOLA RONDA por hueco por semana: tras elegir o frenar, el
 *     hueco no ofrece otro «hacé otro». Mientras está ofrecido, pedir
 *     opciones de nuevo devuelve LAS MISMAS 3 (idempotente, no es una
 *     segunda ronda).
 *  4) INSTANTÁNEO: las opciones se construyen en el momento, sin IA y
 *     sin red, a partir del fundamento (nombre del producto + fotos
 *     reales). No consume cupo de IA ni rompe el ritmo (~24 h).
 *  5) APRENDIZAJE: al elegir, la elección (ángulo + titular + imagen)
 *     se registra en el fundamento del cliente EL MISMO DÍA vía
 *     taste-memory.learn() (gusto explícito tipo 'libre', que se
 *     sincroniza a style_rules, el canal que ya consumen todos los
 *     generadores). Aprender nunca rompe la elección: si el registro
 *     falla, la elección igual queda y el resultado lo declara.
 *  6) VOLVER ATRÁS: antes de reemplazar, el borrador viejo se guarda
 *     en post_versions (el historial que ya usa el chat para volver
 *     atrás). Frenar vuelve el posteo a borrador (status='draft',
 *     approval='pending', scheduled_at NULL, user_stopped=1 — convención
 *     pcHold): no sale y se re-acepta cuando quieran.
 *     user_stopped=1 (fuera del programador: solo publica 'scheduled'
 *     con fecha), nunca toca el freno a nivel cuenta.
 *
 * El módulo NO depende de taste-memory en carga: el registro se inyecta
 * (learnFn) y por defecto se resuelve perezosamente. Así los tests
 * corren sin el árbol completo y el endpoint real pasa el learn real.
 * ===================================================================== */

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function wordsOf(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean);
}
function shortName(productName) {
  // Primeras 3 palabras del producto: con los hooks de 3 palabras los
  // titulares quedan siempre en ≤6 palabras, sin cortar ideas a la mitad.
  return wordsOf(productName).slice(0, 3).join(' ');
}

/* Ángulos: cada uno es UNA idea distinta. 'detalle' es reserva: solo se
 * usa si un titular choca con el titular del borrador rechazado. */
const ANGLES = {
  producto: {
    label: { es: 'el producto en sí', en: 'the product itself' },
    hook: { es: 'de la casa', en: 'made here' },
    caption: {
      es: (p) => `${p} de la casa, como siempre.`,
      en: (p) => `${p}, made here, as always.`,
    },
  },
  momento: {
    label: { es: 'el momento de uso', en: 'the moment' },
    hook: { es: 'para tu tarde', en: 'for today' },
    caption: {
      es: (p) => `Para tu tarde, ${p}.`,
      en: (p) => `For today, ${p}.`,
    },
  },
  invitacion: {
    label: { es: 'la invitación a probarlo', en: 'the invitation' },
    hook: { es: 'vení a probar', en: 'come try' },
    caption: {
      es: (p) => `Vení a probar ${p}.`,
      en: (p) => `Come try ${p}.`,
    },
  },
  detalle: {
    label: { es: 'el detalle', en: 'the detail' },
    hook: { es: 'el detalle de', en: 'the detail of' },
    caption: {
      es: (p) => `El detalle de ${p}.`,
      en: (p) => `The detail of ${p}.`,
    },
  },
};
const ANGLE_ORDER = ['producto', 'momento', 'invitacion'];

function headlineFor(angle, productName, lang) {
  const a = ANGLES[angle];
  const p = shortName(productName);
  const hook = (a.hook[lang] || a.hook.es);
  // Construcción por ángulo: 'invitacion' y 'detalle' llevan el hook
  // ANTES del producto; 'producto' y 'momento' lo llevan después.
  const t = (angle === 'invitacion' || angle === 'detalle')
    ? `${hook} ${p}`.trim()
    : `${p} ${hook}`.trim();
  return wordsOf(t).slice(0, 6).join(' ');
}

function headlineOk(t) {
  const w = wordsOf(t);
  return w.length >= 1 && w.length <= 6;
}

/* Construye las 3 opciones. Puro y síncrono (instantáneo).
 * Entrada: { draftImage, draftHeadline, poolImages, productName, lang }
 * poolImages: fotos reales del cliente (distintas entre sí ya en origen
 * o no; acá se deduplican). draftHeadline: titular actual del borrador,
 * si se conoce (para garantizar titulares NUEVOS, no solo distintos
 * entre sí). Devuelve { ok:true, opciones } o { ok:false, reason }.
 * Cada opción: { idx, idea, titulo, imagen, caption }.
 * Las imágenes son rutas tal cual (fotos reales): este módulo NUNCA
 * dibuja texto sobre ellas ni genera imágenes. */
function buildOptions(input) {
  const lang = (input && input.lang) === 'en' ? 'en' : 'es';
  const productName = String((input && input.productName) || '').trim();
  const draftImage = String((input && input.draftImage) || '');
  const draftHeadline = norm(input && input.draftHeadline);
  const seenImg = new Set();
  const pool = [];
  for (const img of (input && input.poolImages) || []) {
    const p = String(img || '').trim();
    if (!p || p === draftImage || seenImg.has(p)) continue;
    seenImg.add(p);
    pool.push(p);
  }
  if (pool.length < 3) {
    return { ok: false, reason: 'sin_fotos', disponibles: pool.length };
  }
  const opciones = [];
  const usedTitles = new Set();
  const angles = [...ANGLE_ORDER];
  for (let i = 0; i < 3; i++) {
    let angle = angles[i];
    let titulo = headlineFor(angle, productName, lang);
    // Si el titular choca con el borrador rechazado o con otra opción,
    // se usa el ángulo reserva 'detalle' (una sola vez); si también
    // choca, se descarta ese ángulo y se toma el siguiente de la lista.
    if ((draftHeadline && norm(titulo) === draftHeadline) || usedTitles.has(norm(titulo))) {
      const alt = headlineFor('detalle', productName, lang);
      if ((!draftHeadline || norm(alt) !== draftHeadline) && !usedTitles.has(norm(alt))) {
        angle = 'detalle';
        titulo = alt;
      } else {
        return { ok: false, reason: 'sin_titulares', disponibles: pool.length };
      }
    }
    if (!headlineOk(titulo)) return { ok: false, reason: 'titular_invalido' };
    usedTitles.add(norm(titulo));
    opciones.push({
      idx: i,
      idea: angle,
      idea_label: (ANGLES[angle].label[lang] || ANGLES[angle].label.es),
      titulo,
      imagen: pool[i],
      caption: ANGLES[angle].caption[lang](productName || 'este producto'),
    });
  }
  return { ok: true, opciones };
}

/* Lunes (YYYY-MM-DD) de la semana que contiene ymd. Espeja la
 * convención Monday-key de week-redo sin acoplarse a ese módulo. */
function mondayKeyOf(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getUTCDay(); // 0 dom … 6 sáb
  const back = (dow + 6) % 7; // días hasta el lunes
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
function weekKeyForPost(post) {
  if (post && post.week_key) return String(post.week_key);
  const src = (post && (post.scheduled_at || post.created_at)) || '';
  const key = mondayKeyOf(String(src).slice(0, 10));
  if (key) return key;
  return 'post-' + (post && post.id);
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS posty_dislike (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    week_key TEXT NOT NULL,
    estado TEXT NOT NULL,
    opciones_json TEXT NOT NULL DEFAULT '',
    elegido_idx INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(post_id, week_key)
  )`);
}

function getRow(db, postId, weekKey) {
  try {
    return db.prepare('SELECT * FROM posty_dislike WHERE post_id = ? AND week_key = ?').get(postId, weekKey) || null;
  } catch (e) { return null; }
}
function getPost(db, postId) {
  try {
    return db.prepare('SELECT * FROM posts WHERE id = ?').get(postId) || null;
  } catch (e) { return null; }
}
function postsHasColumn(db, col) {
  try {
    const rows = db.prepare('PRAGMA table_info(posts)').all();
    return rows.some((r) => r.name === col);
  } catch (e) { return false; }
}
function poolImagesFor(db, userId, postId, weekKey) {
  // Fotos reales del cliente: sus propios posteos. Se excluye solo el
  // hueco actual. Las fotos de OTROS huecos de la misma semana van
  // ÚLTIMAS (se prefiere no repetir visual en la semana), pero NO se
  // excluyen: un cliente nuevo, con una sola semana, quedaría sin pool
  // y la función moriría justo para quien más la necesita.
  let rows = [];
  try {
    rows = db.prepare('SELECT DISTINCT image_path FROM posts WHERE user_id = ? AND image_path IS NOT NULL AND image_path <> ? AND id <> ?').all(userId, '', postId);
  } catch (e) { return []; }
  let pool = rows.map((r) => r.image_path).filter(Boolean);
  try {
    if (weekKey && postsHasColumn(db, 'week_key')) {
      const sameWeek = new Set(db.prepare('SELECT image_path FROM posts WHERE user_id = ? AND week_key = ? AND image_path IS NOT NULL AND image_path <> ?').all(userId, weekKey, '').map((r) => r.image_path));
      pool.sort((a, b) => (sameWeek.has(a) ? 1 : 0) - (sameWeek.has(b) ? 1 : 0));
    }
  } catch (e) { /* sin orden de semana: el pool igual es real */ }
  return pool;
}

function defaultLearnFn(db, userId, payload) {
  try {
    const tasteMemory = require('./taste-memory');
    return tasteMemory.learn(db, userId, payload);
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

/* Ofrece la ronda de 3 opciones para un borrador. Valida propiedad,
 * estado y ronda única. Si ya está ofrecida, devuelve LAS MISMAS 3
 * (idempotente). */
function offerRedo(db, opts) {
  const userId = Number(opts && opts.userId) || 0;
  const postId = Number(opts && opts.postId) || 0;
  if (!userId || !postId) return { ok: false, code: 'datos_faltan', http: 400 };
  ensureSchema(db);
  const post = getPost(db, postId);
  if (!post) return { ok: false, code: 'no_encontrado', http: 404 };
  if (Number(post.user_id) !== userId) return { ok: false, code: 'no_tuyo', http: 403 };
  if (post.status === 'published') return { ok: false, code: 'publicado', http: 409 };
  const weekKey = weekKeyForPost(post);
  const row = getRow(db, postId, weekKey);
  // El estado de la ronda manda sobre el estado del posteo: un hueco
  // frenado o ya elegido responde eso (más informativo que un genérico
  // 'no_borrador'), y una ronda ofrecida devuelve las mismas 3 aunque
  // el posteo haya cambiado de estado por otro camino.
  if (row && row.estado === 'elegido') return { ok: false, code: 'ya_elegido', http: 409 };
  if (row && row.estado === 'frenado') return { ok: false, code: 'frenado', http: 409 };
  if (row && row.estado === 'ofrecido') {
    try {
      const opciones = JSON.parse(row.opciones_json || '[]');
      if (Array.isArray(opciones) && opciones.length === 3) {
        return { ok: true, post_id: postId, week_key: weekKey, opciones, repetido: true };
      }
    } catch (e) { /* cae a regenerar la oferta */ }
  }
  if (post.status !== 'draft') return { ok: false, code: 'no_borrador', http: 409 };
  const pool = poolImagesFor(db, userId, postId, weekKey);
  const extra = Array.isArray(opts.extraImages) ? opts.extraImages : [];
  const built = buildOptions({
    draftImage: post.image_path,
    draftHeadline: opts.draftHeadline || '',
    poolImages: [...pool, ...extra],
    productName: opts.productName || '',
    lang: opts.lang || 'es',
  });
  if (!built.ok) return { ok: false, code: built.reason, http: 422, disponibles: built.disponibles || 0 };
  const opcionesJson = JSON.stringify(built.opciones);
  try {
    db.prepare(`INSERT INTO posty_dislike (post_id, user_id, week_key, estado, opciones_json, updated_at)
      VALUES (?, ?, ?, 'ofrecido', ?, datetime('now'))
      ON CONFLICT(post_id, week_key) DO UPDATE SET estado = 'ofrecido', opciones_json = excluded.opciones_json, updated_at = datetime('now')`).run(postId, userId, weekKey, opcionesJson);
  } catch (e) {
    return { ok: false, code: 'db_error', http: 500, detail: String((e && e.message) || e).slice(0, 200) };
  }
  return { ok: true, post_id: postId, week_key: weekKey, opciones: built.opciones, repetido: false };
}

/* El cliente elige UNA de las 3. Reemplaza el borrador (con versión
 * previa en post_versions), marca la ronda como consumida y registra
 * el aprendizaje en el fundamento el mismo día. */
function chooseOption(db, opts) {
  const userId = Number(opts && opts.userId) || 0;
  const postId = Number(opts && opts.postId) || 0;
  const idx = Number(opts && opts.idx);
  if (!userId || !postId || !Number.isInteger(idx)) return { ok: false, code: 'datos_faltan', http: 400 };
  ensureSchema(db);
  const post = getPost(db, postId);
  if (!post) return { ok: false, code: 'no_encontrado', http: 404 };
  if (Number(post.user_id) !== userId) return { ok: false, code: 'no_tuyo', http: 403 };
  if (post.status === 'published') return { ok: false, code: 'publicado', http: 409 };
  const weekKey = weekKeyForPost(post);
  const row = getRow(db, postId, weekKey);
  if (!row || row.estado !== 'ofrecido') {
    if (row && row.estado === 'elegido') return { ok: false, code: 'ya_elegido', http: 409 };
    if (row && row.estado === 'frenado') return { ok: false, code: 'frenado', http: 409 };
    return { ok: false, code: 'sin_opciones', http: 409 };
  }
  let opciones = [];
  try { opciones = JSON.parse(row.opciones_json || '[]'); } catch (e) { opciones = []; }
  if (!Array.isArray(opciones) || idx < 0 || idx >= opciones.length) {
    return { ok: false, code: 'indice_invalido', http: 400 };
  }
  const elegida = opciones[idx];
  // Si el autopiloto programó el borrador mientras la ronda estaba
  // abierta, elegir desprograma primero (precedente aprobado de
  // regen-post: un programado se desprograma y la respuesta lo declara).
  let unscheduled = false;
  if (post.status === 'scheduled') {
    try {
      db.prepare(`UPDATE posts SET status = 'draft', scheduled_at = NULL WHERE id = ?`).run(postId);
      unscheduled = true;
    } catch (e) { /* sigue: el reemplazo igual aplica */ }
  }
  try {
    db.prepare('INSERT INTO post_versions (post_id, caption, hashtags, image_path) VALUES (?, ?, ?, ?)').run(postId, post.caption || '', post.hashtags || '', post.image_path || '');
  } catch (e) { /* el historial es nice-to-have: no frena la elección */ }
  try {
    db.prepare('UPDATE posts SET image_path = ?, caption = ? WHERE id = ?').run(elegida.imagen, elegida.caption, postId);
  } catch (e) {
    return { ok: false, code: 'db_error', http: 500, detail: String((e && e.message) || e).slice(0, 200) };
  }
  try {
    db.prepare(`UPDATE posty_dislike SET estado = 'elegido', elegido_idx = ?, updated_at = datetime('now') WHERE post_id = ? AND week_key = ?`).run(idx, postId, weekKey);
  } catch (e) {
    return { ok: false, code: 'db_error', http: 500, detail: String((e && e.message) || e).slice(0, 200) };
  }
  // Aprendizaje en el fundamento, mismo día. Nunca rompe la elección.
  const lang = opts.lang || 'es';
  const learnFn = opts.learnFn || defaultLearnFn;
  let learnOk = false;
  let learnDetail = '';
  try {
    const valor = `Prefiere posteos con ángulo «${elegida.idea_label}» (lo eligió entre 3 opciones tras un «no me gusta»; titular elegido: «${elegida.titulo}»)`;
    const r = learnFn(db, userId, { tipo: 'libre', valor, ejemplo: elegida.titulo, origen: 'explicito', lang });
    learnOk = !!(r && (r.gusto || r.dup));
    if (r && r.error) learnDetail = String(r.error).slice(0, 200);
  } catch (e) {
    learnDetail = String((e && e.message) || e).slice(0, 200);
  }
  return { ok: true, post_id: postId, week_key: weekKey, elegida, learnOk, learnDetail, unscheduled };
}

/* «Ninguna, frenar»: el hueco no sale. El posteo vuelve a borrador (ver
 * frenarHueco: convención pcHold) y la ronda queda 'frenado'.
 * Sin fecha + user_stopped=1: fuera del programador, que solo publica
 * 'scheduled' con fecha. No toca el freno a nivel cuenta. */
function chooseNone(db, opts) {
  const userId = Number(opts && opts.userId) || 0;
  const postId = Number(opts && opts.postId) || 0;
  if (!userId || !postId) return { ok: false, code: 'datos_faltan', http: 400 };
  ensureSchema(db);
  const post = getPost(db, postId);
  if (!post) return { ok: false, code: 'no_encontrado', http: 404 };
  if (Number(post.user_id) !== userId) return { ok: false, code: 'no_tuyo', http: 403 };
  if (post.status === 'published') return { ok: false, code: 'publicado', http: 409 };
  const weekKey = weekKeyForPost(post);
  const row = getRow(db, postId, weekKey);
  if (!row || row.estado !== 'ofrecido') {
    if (row && row.estado === 'elegido') return { ok: false, code: 'ya_elegido', http: 409 };
    if (row && row.estado === 'frenado') return { ok: false, code: 'frenado', http: 409 };
    return { ok: false, code: 'sin_opciones', http: 409 };
  }
  // FRENAR (convención viva pcHold, app.js): el borrador VUELVE A BORRADOR
  // (status='draft', approval='pending', user_stopped=1, sin fecha) — queda
  // visible en la semana y se re-acepta cuando quieran; el programador solo
  // publica status='scheduled', así que un borrador sin fecha NO sale.
  // NO status='paused': un 'paused' desaparecería de la vista de semana
  // (que selecciona solo status='draft') y el cliente no podría re-aceptarlo.
  try {
    if (postsHasColumn(db, 'user_stopped')) {
      try {
        db.prepare(`UPDATE posts SET status = 'draft', scheduled_at = NULL, auto_published = 0, approval = 'pending', user_stopped = 1 WHERE id = ?`).run(postId);
      } catch (e) {
        db.prepare(`UPDATE posts SET status = 'draft', scheduled_at = NULL, user_stopped = 1 WHERE id = ?`).run(postId);
      }
    } else {
      db.prepare(`UPDATE posts SET status = 'draft', scheduled_at = NULL WHERE id = ?`).run(postId);
    }
  } catch (e) {
    return { ok: false, code: 'db_error', http: 500, detail: String((e && e.message) || e).slice(0, 200) };
  }
  try {
    db.prepare(`UPDATE posty_dislike SET estado = 'frenado', updated_at = datetime('now') WHERE post_id = ? AND week_key = ?`).run(postId, weekKey);
  } catch (e) {
    return { ok: false, code: 'db_error', http: 500, detail: String((e && e.message) || e).slice(0, 200) };
  }
  return { ok: true, post_id: postId, week_key: weekKey, frenado: true };
}

module.exports = {
  buildOptions, headlineFor, headlineOk, mondayKeyOf, weekKeyForPost,
  ensureSchema, offerRedo, chooseOption, chooseNone, getRow, ANGLES,
};
