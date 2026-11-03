// cm-tendencias.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// TENDENCIAS DEL DÍA: una fuente DIARIA de temas del rubro que el
// generador puede usar el mismo día. Es un REGISTRO, no un detector
// mágico: cada fila es un tema real detectado (por el equipo, por una
// búsqueda, por lo que se habla en el rubro) con su fecha y su fuente.
//
// REGLA DE VERDAD: el generador solo usa la fila de HOY para ESE rubro.
// Si no hay fila de hoy, NO se fuerza ninguna tendencia: temaDeHoy
// devuelve null y la semana se arma con sus otras señales. Jamás se
// inventa una tendencia para rellenar.
'use strict';

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_tendencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT, rubro TEXT NOT NULL DEFAULT '',
      fecha TEXT NOT NULL DEFAULT '', tema TEXT NOT NULL DEFAULT '',
      fuente TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (rubro, fecha, tema)
    )`);
  } catch (e) {}
}

function registrarTema(db, rubro, fecha, tema, fuente) {
  try {
    if (!db || !rubro || !fecha || !tema) return null;
    asegurarTabla(db);
    db.prepare('INSERT OR IGNORE INTO cm_tendencias (rubro, fecha, tema, fuente) VALUES (?, ?, ?, ?)')
      .run(String(rubro), String(fecha), String(tema), String(fuente || ''));
    return { ok: true };
  } catch (e) { return null; }
}

// Solo la fila de HOY para ese rubro (la más reciente del día). Sin fila, null.
function temaDeHoy(db, rubro, fecha) {
  try {
    if (!db || !rubro || !fecha) return null;
    asegurarTabla(db);
    const row = db.prepare(`SELECT tema FROM cm_tendencias
      WHERE rubro = ? AND fecha = ? ORDER BY created_at DESC LIMIT 1`).get(String(rubro), String(fecha));
    return row ? String(row.tema) : null;
  } catch (e) { return null; }
}

function temasDeDia(db, rubro, fecha) {
  try {
    if (!db || !rubro || !fecha) return [];
    asegurarTabla(db);
    return db.prepare('SELECT tema, fuente FROM cm_tendencias WHERE rubro = ? AND fecha = ? ORDER BY created_at DESC')
      .all(String(rubro), String(fecha)).map((r) => ({ tema: r.tema, fuente: r.fuente || '' }));
  } catch (e) { return []; }
}

module.exports = { asegurarTabla, registrarTema, temaDeHoy, temasDeDia };
