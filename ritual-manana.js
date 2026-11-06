'use strict';
// ritual-manana.js — RITUAL DE LA MAÑANA (LOTE 5/8, aprobado Valentino 5/11 «Arma todo»;
// LOTE RITUAL-1-OPCION · 6/11 · decisión Valentino «una sola opción + editar»:
// el paquete del día trae UNA sola carta — la recomendada (el posteo ya
// programado para hoy) —, el dueño la revela con un toque y la confirma
// con [Sale así] o pide otra versión desde el chat. Sin elección, sale
// la recomendada (el flujo vigente del scheduler; acá no se programa nada
// nuevo). Solo posteos: el video semanal NO entra.
//
// Mecánica (fail-closed, nunca inventar):
// · Una fila por usuario y día en pz_ritual: recomendada + elegida +
//   dorada. (Las alternas —alt_post_ids y reutilizarBorradores— se
//   RETIRARON 6/11: el ritual ya no genera ni resuelve 3 opciones; la
//   columna alt_post_ids queda en la tabla por compatibilidad con filas
//   viejas, siempre '[]' en filas nuevas.)
// · Elegir ES aprobar: la elegida queda scheduled en el slot de hoy con
//   approval='approved' y needs_review=0 (la elección del dueño ES la
//   revisión); con una sola opción la elegida ES la recomendada, sin
//   intercambio (el camino de intercambio queda para filas viejas de la
//   era de 3 opciones, que podían elegir una alterna).
// · Racha REAL: días consecutivos con elección, contados desde las
//   elecciones guardadas. Sin actividad no hay racha (nunca se inventa).
// · Dorada = hito: la elección completa una racha de 7, 30 o 100 días,
//   o es la primera elección del usuario. Solo entonces hay carta dorada.
// · Álbum: la semana (lun–dom en la zona de la cuenta) con la carta
//   elegida por día; lo no jugado es silueta oscura con candado, nunca
//   solo tierra ni un hueco vacío.

const { dayKeyInTz } = require('./morning-post-push');

const HITOS_RACHA = [7, 30, 100];
const DIAS_ES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const DIAS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function prevDayKey(dayKey) {
  try {
    const [y, m, d] = String(dayKey || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  } catch (e) { return ''; }
}

function addDaysKey(dayKey, n) {
  try {
    const [y, m, d] = String(dayKey || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  } catch (e) { return ''; }
}

function mondayOf(dayKey) {
  try {
    const [y, m, d] = String(dayKey || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  } catch (e) { return ''; }
}

// Clave de dedup de captions (misma idea que captionBodyKey del server:
// normalizar y comparar; dos captions iguales son la misma carta).
function normCaption(caption) {
  return String(caption || '').toLowerCase()
    .replace(/[^a-z0-9áéíóúñü]+/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function ensureRitualTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS pz_ritual (
    user_id INTEGER NOT NULL,
    day_key TEXT NOT NULL,
    recommended_post_id INTEGER NOT NULL,
    alt_post_ids TEXT NOT NULL DEFAULT '[]',
    picked_post_id INTEGER,
    gold INTEGER NOT NULL DEFAULT 0,
    picked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, day_key)
  )`);
}

function getRow(db, uid, dayKey) {
  try {
    return db.prepare('SELECT * FROM pz_ritual WHERE user_id = ? AND day_key = ?').get(uid, dayKey) || null;
  } catch (e) { return null; }
}

function upsertRow(db, uid, dayKey, recommendedId) {
  db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids)
    VALUES (?, ?, ?, '[]')
    ON CONFLICT(user_id, day_key) DO UPDATE SET recommended_post_id = excluded.recommended_post_id`)
    .run(uid, dayKey, recommendedId);
}

// Racha contando hacia atrás desde dayKey (inclusive): días consecutivos
// con elección. Si dayKey no tiene elección, da 0.
function rachaHasta(db, uid, dayKey) {
  let n = 0;
  let d = dayKey;
  for (let i = 0; i < 366 && d; i++) {
    let row = null;
    try { row = db.prepare('SELECT picked_post_id FROM pz_ritual WHERE user_id = ? AND day_key = ?').get(uid, d); } catch (e) { return n; }
    if (!row || !row.picked_post_id) return n;
    n++;
    d = prevDayKey(d);
  }
  return n;
}

// Racha vigente: si hoy ya se eligió, la que termina hoy; si no, la que
// terminó ayer (la racha no muere hasta que se salta un día entero).
function rachaVigente(db, uid, dayKey) {
  const row = getRow(db, uid, dayKey);
  if (row && row.picked_post_id) return rachaHasta(db, uid, dayKey);
  const ayer = prevDayKey(dayKey);
  if (!ayer) return 0;
  return rachaHasta(db, uid, ayer);
}

function totalPicks(db, uid) {
  try {
    const r = db.prepare('SELECT COUNT(*) AS n FROM pz_ritual WHERE user_id = ? AND picked_post_id IS NOT NULL').get(uid);
    return (r && Number(r.n)) || 0;
  } catch (e) { return 0; }
}

function esDorada(rachaDespues, totalDespues) {
  return HITOS_RACHA.includes(Number(rachaDespues)) || Number(totalDespues) === 1;
}

// Álbum de la semana (lun–dom en la zona de la cuenta): por día, la
// imagen de la carta elegida o null (silueta con candado en la vista).
function albumWeek(db, uid, dayKey, lang) {
  const lunes = mondayOf(dayKey);
  const labels = lang === 'en' ? DIAS_EN : DIAS_ES;
  const slots = [];
  if (!lunes) return { lunes: '', slots };
  for (let i = 0; i < 7; i++) {
    const d = addDaysKey(lunes, i);
    let imagen = null;
    let dorada = false;
    let jugado = false;
    try {
      const row = getRow(db, uid, d);
      if (row && row.picked_post_id) {
        jugado = true;
        dorada = !!row.gold;
        const p = db.prepare('SELECT image_path FROM posts WHERE id = ? AND user_id = ?').get(row.picked_post_id, uid);
        if (p && p.image_path) imagen = String(p.image_path);
      }
    } catch (e) { /* slot sin jugar: silueta */ }
    slots.push({ dia: d, etiqueta: labels[i], imagen, dorada, hoy: d === dayKey, jugado });
  }
  return { lunes, slots };
}

// (LOTE PROXIMO-RITUAL · 5/11) Rubro de una carta del ritual, para la
// chapita visible. (El contrato con RUBRO-ROTACION —3 opciones en 3
// rubros distintos— quedó SUPERSEDED 6/11 por la decisión «una sola
// opción»: el rubro sigue viviendo en la chapita de la carta única.)
// Clasificador MÍNIMO y honesto:
// 0) si la fila ya trae rubro guardado (columna posts.rubro de
//    RUBRO-ROTACION) → ese valor, sin reclasificar;
// 1) si el posteo tiene producto de referencia (rg_producto) → el
//    nombre del producto normalizado en minúsculas;
// 2) si es un posteo de Posty mismo (sin producto, con el personaje
//    como protagonista en el prompt/la caption/el tema) → 'avatar';
// 3) si no se sabe con seguridad → el tipo del posteo, o 'general'
//    (nunca un rubro inventado).
function rubroDeCarta(post) {
  try {
    // (LOTE RUBRO-ROTACION · 5/11 · columna posts.rubro) Si la fila ya
    // trae el rubro GUARDADO, manda ese valor: es la decisión de la
    // rotación (o de la línea editorial), no una clasificación hecha acá.
    const guardado = String((post && post.rubro) || '').trim().toLowerCase();
    if (guardado) return guardado.slice(0, 24);
    const prod = String((post && post.rg_producto) || '').trim().toLowerCase();
    if (prod) return prod.slice(0, 24);
    const hay = [post && post.image_prompt, post && post.caption, post && post.source_topic, post && post.source_angle, post && post.tipo]
      .map((x) => String(x || '').toLowerCase()).join(' ');
    if (/\b(posty|avatar)\b/.test(hay)) return 'avatar';
    const tipo = String((post && post.tipo) || '').trim().toLowerCase();
    return tipo ? tipo.slice(0, 24) : 'general';
  } catch (e) { return 'general'; }
}

// Carta para la vista: lo mínimo para pintarla (la imagen se sirve por
// /media/... como en el feed; la vista usa mv() igual que las tiles).
// `caption` es el texto COMPLETO (la edición in situ lo necesita en
// data-full); `caption_corta` es la primera línea para mostrar.
function cardOf(post, recomendada) {
  if (!post) return null;
  const cap = String(post.caption || '').split('\n')[0].trim();
  return {
    id: post.id,
    imagen: String(post.image_path || ''),
    caption: String(post.caption || ''),
    caption_corta: cap.slice(0, 120),
    tipo: String(post.tipo || ''),
    media_type: String(post.media_type || 'image'),
    recomendada: !!recomendada,
    rubro: rubroDeCarta(post),
  };
}

// La elección: intercambio atómico + registro. Idempotente: si el día ya
// tiene elección, devuelve el estado actual sin tocar nada.
function aplicarPick(db, uid, dayKey, postId) {
  const pid = Number(postId);
  if (!pid) return { error: 'post_id' };
  const row = getRow(db, uid, dayKey);
  if (!row) return { error: 'sin_ritual' };
  if (row.picked_post_id) {
    return { ok: true, ya: true, elegida: row.picked_post_id, dorada: !!row.gold, racha: rachaVigente(db, uid, dayKey), intercambio: false };
  }
  let alts = [];
  try { alts = JSON.parse(row.alt_post_ids || '[]'); } catch (e) { alts = []; }
  const cartas = [Number(row.recommended_post_id), ...alts.map(Number)];
  if (!cartas.includes(pid)) return { error: 'no_es_carta' };
  let rec = null;
  let pick = null;
  try {
    rec = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(row.recommended_post_id, uid);
    pick = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(pid, uid);
  } catch (e) { return { error: 'db' }; }
  if (!rec || !pick) return { error: 'no_encontrado' };
  if (rec.status !== 'scheduled' || !rec.scheduled_at) return { error: 'sin_programado' };
  const intercambio = pid !== rec.id;
  if (intercambio && pick.status !== 'draft') return { error: 'estado' };
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (intercambio) {
        // La elegida toma el slot de hoy con aprobación (la elección ES
        // la aprobación) y la recomendada vuelve a borrador, sin borrarse.
        db.prepare(`UPDATE posts SET scheduled_at = ?, status = 'scheduled', approval = 'approved', needs_review = 0 WHERE id = ?`)
          .run(rec.scheduled_at, pid);
        db.prepare(`UPDATE posts SET scheduled_at = NULL, status = 'draft' WHERE id = ?`).run(rec.id);
      } else {
        db.prepare(`UPDATE posts SET approval = 'approved', needs_review = 0 WHERE id = ?`).run(pid);
      }
      db.prepare(`UPDATE pz_ritual SET picked_post_id = ?, picked_at = datetime('now') WHERE user_id = ? AND day_key = ?`)
        .run(pid, uid, dayKey);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }
  } catch (e) { return { error: 'db' }; }
  const racha = rachaHasta(db, uid, dayKey);
  const total = totalPicks(db, uid);
  const dorada = esDorada(racha, total);
  try { db.prepare(`UPDATE pz_ritual SET gold = ? WHERE user_id = ? AND day_key = ?`).run(dorada ? 1 : 0, uid, dayKey); } catch (e) {}
  return { ok: true, elegida: pid, dorada, racha, intercambio };
}

module.exports = {
  HITOS_RACHA,
  prevDayKey,
  addDaysKey,
  mondayOf,
  normCaption,
  ensureRitualTable,
  getRow,
  upsertRow,
  rachaHasta,
  rachaVigente,
  totalPicks,
  esDorada,
  albumWeek,
  cardOf,
  rubroDeCarta,
  aplicarPick,
  dayKeyInTz,
};
