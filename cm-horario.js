// cm-horario.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// MEJOR HORARIO REAL: la hora de publicación se elige por la audiencia
// de ESE negocio cuando hay datos. Fuente: piece_learning (hora de la
// pieza + sus métricas medidas). El resultado se escribe en
// users.best_hour, que assignScheduleSlots ya lee (rango 9–21, respaldo
// 19:00). Sin datos, NO se escribe nada: la hora por defecto actual
// sigue mandando y jamás se declara un «horario óptimo» inventado.
//
// Evidencia mínima: 3+ piezas medidas en total y un ganador estricto
// (empate en el primer puesto = sin horario, no se elige al azar).
// Solo cuentan horas dentro del rango publicable 9–21.
'use strict';

function parseHora(h) {
  const m = /(\d{1,2})/.exec(String(h || ''));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n >= 9 && n <= 21) ? n : null;
}

// Mejor hora por datos reales de ESTA cuenta, o null.
function mejorHora(db, uid) {
  try {
    if (!db || uid === undefined || uid === null) return null;
    const rows = db.prepare(`SELECT hour, likes, comments, saves FROM piece_learning
      WHERE user_id = ? AND hour IS NOT NULL AND hour != ''`).all(uid);
    const acc = new Map();
    let medidos = 0;
    for (const r of rows) {
      const h = parseHora(r.hour);
      if (h === null) continue;
      const tieneDato = r.likes !== null && r.likes !== undefined ||
        r.comments !== null && r.comments !== undefined ||
        r.saves !== null && r.saves !== undefined;
      if (!tieneDato) continue;
      medidos++;
      const puntos = (+r.likes || 0) + 2 * (+r.comments || 0) + 3 * (+r.saves || 0);
      const cur = acc.get(h) || { hora: h, puntos: 0, piezas: 0 };
      cur.puntos += puntos; cur.piezas += 1;
      acc.set(h, cur);
    }
    if (medidos < 3 || !acc.size) return null;
    const orden = [...acc.values()].sort((a, b) => b.puntos - a.puntos);
    if (orden.length > 1 && orden[0].puntos === orden[1].puntos) return null; // empate: sin horario
    return orden[0];
  } catch (e) { return null; }
}

// Escribe users.best_hour SOLO si hay ganador real. Nunca borra ni
// inventa un valor: sin ganador, devuelve { actualizada: false }.
function actualizarBestHour(db, uid) {
  try {
    const g = mejorHora(db, uid);
    if (!g) return { actualizada: false };
    db.prepare('UPDATE users SET best_hour = ? WHERE id = ?').run(g.hora, uid);
    return { actualizada: true, hora: g.hora, puntos: g.puntos, piezas: g.piezas };
  } catch (e) { return { actualizada: false }; }
}

module.exports = { parseHora, mejorHora, actualizarBestHour };
