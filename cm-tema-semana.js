// cm-tema-semana.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// ESTRATEGIA SEMANAL: cada semana generada lleva UN tema y un arco
// (qué se siembra el lunes, qué se cierra el viernes), guardado en
// cm_semana y visible en la carta de Estrategia como «Esta semana: …».
// Sin tema no hay semana: si no hay ninguna señal, el tema es el oficio
// del rubro, jamás un tema inventado sobre un producto que no existe.
//
// Prioridad de las señales (la primera que existe gana):
//   1. promo activa del fundamento
//   2. fecha de temporada dentro de la semana (cm-temporada / efemérides)
//   3. tendencia del día (cm-tendencias, solo la fila de HOY)
//   4. producto del fundamento, rotando por weekKey (nunca dos semanas
//      seguidas con el mismo producto si hay más de uno)
//   5. evergreen del rubro
// Si el tema elegido coincide con el de la semana anterior, se baja a la
// siguiente señal; si no queda ninguna, el evergreen cambia de vuelta
// («detrás de escena» en vez de «el oficio») para no repetir semana.
'use strict';

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function hashStr(s) {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return h;
}

function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return isNaN(dt.getTime()) ? null : dt;
}

function isoDay(dt) { return dt.toISOString().slice(0, 10); }

function prevWeekKey(weekKey) {
  const dt = parseYmd(weekKey);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() - 7);
  return isoDay(dt);
}

function elegirTema({ rubro, productos = [], promos = [], fechas = [], temaAnterior = null, tendenciaHoy = null, weekKey = '' } = {}) {
  const rubroTxt = String(rubro || '').trim();
  const prods = (productos || []).map((p) => String((p && p.nombre) || p || '').trim()).filter(Boolean);
  const prom = (promos || []).map((p) => String((p && p.nombre) || p || '').trim()).filter(Boolean);
  const fech = (fechas || []).filter((f) => f && f.nombre).map((f) => ({ nombre: String(f.nombre), fecha: String(f.fecha || '') }));

  const candidatos = [];
  if (prom.length) candidatos.push({ tema: `Promo: ${prom[0]}`, origen: 'promo' });
  if (fech.length) candidatos.push({ tema: fech[0].nombre, origen: 'temporada' });
  if (tendenciaHoy) candidatos.push({ tema: String(tendenciaHoy), origen: 'tendencia' });
  if (prods.length) {
    const idx = hashStr(weekKey || '') % prods.length;
    // Rotación: el producto de esta semana no es el de la anterior si hay más de uno.
    let pick = prods[idx];
    if (prods.length > 1 && temaAnterior && norm(temaAnterior).includes(norm(pick))) {
      pick = prods[(idx + 1) % prods.length];
    }
    candidatos.push({ tema: `El producto: ${pick}`, origen: 'producto' });
  }
  candidatos.push({ tema: rubroTxt ? `El oficio de ${rubroTxt}` : 'Tu negocio por dentro', origen: 'evergreen' });
  candidatos.push({ tema: rubroTxt ? `Detrás de escena de ${rubroTxt}` : 'Detrás de escena de tu negocio', origen: 'evergreen' });

  let elegido = candidatos[0];
  if (temaAnterior) {
    const ant = norm(temaAnterior);
    const distinto = candidatos.find((c) => norm(c.tema) !== ant);
    if (distinto) elegido = distinto;
  }
  const tema = elegido.tema;
  return {
    tema,
    origen: elegido.origen,
    siembra: `Lunes: se abre la semana presentando ${tema}.`,
    cierre: `Viernes: se cierra la semana con ${tema} y lo que dejó.`,
  };
}

function lineaParaCarta(tema) {
  if (!tema) return '';
  return `Esta semana: ${tema}`;
}

// --- Persistencia (tabla cm_semana; crear si no existe, nunca rompe) ---
function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_semana (
      user_id INTEGER NOT NULL, week_key TEXT NOT NULL,
      tema TEXT DEFAULT '', siembra TEXT DEFAULT '', cierre TEXT DEFAULT '',
      origen TEXT DEFAULT '', formatos_json TEXT DEFAULT '[]',
      objetivo TEXT DEFAULT '', hora_recomendada INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, week_key)
    )`);
  } catch (e) { /* la semana nunca frena por su tabla */ }
}

function guardar(db, uid, weekKey, temaObj, extra = {}) {
  try {
    if (!db || uid === undefined || uid === null || !weekKey || !temaObj) return null;
    asegurarTabla(db);
    db.prepare(`INSERT OR REPLACE INTO cm_semana
      (user_id, week_key, tema, siembra, cierre, origen, formatos_json, objetivo, hora_recomendada)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uid, weekKey, temaObj.tema || '', temaObj.siembra || '', temaObj.cierre || '',
        temaObj.origen || '', JSON.stringify(extra.formatos || []),
        extra.objetivo || '', (extra.horaRecomendada === undefined || extra.horaRecomendada === null) ? null : extra.horaRecomendada);
    return { ok: true };
  } catch (e) { return null; }
}

function leer(db, uid, weekKey) {
  try {
    if (!db || uid === undefined || uid === null || !weekKey) return null;
    asegurarTabla(db);
    const row = db.prepare('SELECT * FROM cm_semana WHERE user_id = ? AND week_key = ?').get(uid, weekKey);
    if (!row) return null;
    let formatos = [];
    try { formatos = JSON.parse(row.formatos_json || '[]'); } catch (e) { formatos = []; }
    return { ...row, formatos };
  } catch (e) { return null; }
}

function leerAnterior(db, uid, weekKey) {
  const prev = prevWeekKey(weekKey);
  if (!prev) return null;
  return leer(db, uid, prev);
}

module.exports = { elegirTema, lineaParaCarta, guardar, leer, leerAnterior, prevWeekKey, _norm: norm };
