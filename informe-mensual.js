// informe-mensual.js — INFORME MENSUAL REAL (ítem 5, 2026-10-26).
// Una pieza mensual en la app con números reales del mes, nada más:
//   - piezas publicadas (posts status='published' con published_at en el mes)
//   - días con publicación (días distintos del mes con al menos una pieza)
//   - mensajes capturados (comment_queue + dm_queue recibidos en el mes)
//   - respuestas con OK (comment_replies status='sent' con decided_at en el mes)
// REGLA DE VERDAD, SIN EXCEPCIONES:
//   - Sin ROI inventado, sin ventas atribuidas, sin promedios que no existan.
//   - 'sent' solo se escribe desde approveAndSend (aprobación humana del dueño):
//     una respuesta contada acá pasó por el OK del dueño, por construcción.
//   - Los DMs NO se cuentan como respuestas: approveAndSend los rechaza
//     ("los DMs se responden desde Instagram por ahora"), así que 'sent'
//     es solo comentarios. No se infla con dm_queue.
//   - No existe etiquetado de fecha comercial por pieza en posts, así que
//     "fechas cubiertas" NO se inventa como feriados: es días con publicación
//     real, contados desde published_at. La etiqueta de la tarjeta lo dice así.
//   - Meses en UTC, el mismo reloj de published_at/created_at/decided_at
//     (datetime('now') del servidor). Un mes futuro no tiene informe: 400.
//   - comment_replies se crea perezoso (community.js, no db.js): si la tabla
//     no existe todavía, no hay respuestas enviadas y el conteo es 0, no error.
//   - Una pieza publicada sin published_at no se atribuye a ningún mes: queda
//     fuera del conteo (atribuirla sería inventar su mes).
// Canal: solo en la app. El email NO se construye en esta tanda: un email
// mensual solo encajaría en la regla de los dos motivos como buena noticia
// ya lograda de un mes cerrado con actividad real, y eso exige un trigger
// durable por usuario que hoy no existe. No se manda un blast mensual.
'use strict';

function mesValido(mes) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ''));
}

function mesActualUTC() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function tablaExiste(db, nombre) {
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nombre);
    return !!(r && r.n);
  } catch (e) { return false; }
}

function informePara(db, uid, mes) {
  if (!mesValido(mes)) throw new Error('mes_invalido');
  if (mes > mesActualUTC()) throw new Error('mes_futuro');
  const piezas = db.prepare(
    `SELECT id, published_at, ig_permalink, tipo FROM posts
     WHERE user_id = ? AND status = 'published' AND published_at IS NOT NULL
       AND substr(published_at, 1, 7) = ?
     ORDER BY published_at ASC, id ASC`
  ).all(uid, mes);
  const dias = new Set(piezas.map((p) => String(p.published_at).slice(0, 10))).size;
  const mensajes = db.prepare(
    `SELECT (SELECT COUNT(*) FROM comment_queue WHERE user_id = ? AND substr(created_at, 1, 7) = ?)
       + (SELECT COUNT(*) FROM dm_queue WHERE user_id = ? AND substr(created_at, 1, 7) = ?) AS n`
  ).get(uid, mes, uid, mes).n;
  let respuestas = 0;
  if (tablaExiste(db, 'comment_replies')) {
    respuestas = db.prepare(
      `SELECT COUNT(*) AS n FROM comment_replies
       WHERE user_id = ? AND status = 'sent' AND substr(decided_at, 1, 7) = ?`
    ).get(uid, mes).n;
  }
  return {
    ok: true,
    mes,
    es_mes_actual: mes === mesActualUTC(),
    piezas_publicadas: piezas.length,
    dias_con_publicacion: dias,
    mensajes_capturados: mensajes,
    respuestas_con_ok: respuestas,
    piezas: piezas.map((p) => ({
      id: p.id,
      fecha: String(p.published_at).slice(0, 10),
      permalink: p.ig_permalink || '',
      tipo: p.tipo || '',
    })),
  };
}

module.exports = { mesValido, mesActualUTC, informePara };
