// preflight-casa.js — PREFLIGHT-1830 (aprobado por el dueño en el tablero
// 23/11 00:17, «dale, arma todo»).
//
// Chequeo automático y SILENCIOSO que corre a las 18:30 (America/New_York),
// media hora antes de la publicación de las 19:00 de las cuentas de la
// casa, sobre cada posteo programado para esa hora. Nace de la cadena
// causal de la película del 22/11: el master sin faststart (60 fps, sin
// metadata de color) fue rechazado por Meta a las 19:01 y el reintento
// rebotó en silencio contra el cupo semanal de reels (el 695 ya
// publicado había consumido el único reel del plan de prueba, y un
// posteo FALLIDO perdía la exención de programado: publish-now lo
// cobraba como nuevo — server.js, /api/posts/:id/publish-now). Esa
// segunda mitad la cerró FRENO-REINTENTO-CUPO (v1270, 23/11): el
// reintento de un fallido HEREDA el lugar de su misma semana, y la
// simulación del cupo de abajo modela esa herencia desde
// PREFLIGHT-REINTENTO-HEREDA.
//
// Qué verifica, por posteo de la casa programado en la ventana de las
// 19:00 (hora de Nueva York) de hoy:
//   (a) si es video: el archivo existe, es un MP4 con faststart (el
//       bloque moov ANTES de mdat) y Meta lo puede procesar — códec
//       H.264, hasta 30 fps y metadata de color presente (los tres
//       defectos del master del 22/11), medidos con ffprobe + lectura
//       de cajas del propio archivo.
//   (b) el cupo de reels, simulando el reintento TAL CUAL producción
//       desde FRENO-REINTENTO-CUPO: el posteo de las 19:00, si falla,
//       hereda su propio lugar al reintentar dentro de su semana — eso
//       ya no se avisa. Lo que sí se avisa: un video que ya quedó
//       fallido y NO hereda (su horario original es de otra semana, o
//       no tiene horario guardado: publish-now lo cobra como nuevo)
//       cuando el cupo de esta semana ya está completo — su reintento
//       de esta noche rebota por plan_limit.
//   (c) la portada existe: cover_path cargado y su archivo en disco.
//       Para posteos que no son video, el archivo de la pieza misma.
//
// Si TODO está bien: silencio total — ningún aviso, ningún caso, solo
// la línea de log del scheduler como todo trabajo programado.
// (LOTE CONSERJE-DATOS-BANDEJA · censo-conserje-3 §5.3) Sano o con
// defectos, TODA corrida persiste ahora el resumen de sí misma
// (revisados / con defectos / casos / causas / hora) en la tabla de
// una fila preflight_casa_resumen: es la fuente de la que la consola
// del conserje pinta la línea verde «todo sano» o la roja con su
// causa (vista.hoy.preflight). El silencio hacia el operador no
// cambia: sin defectos sigue sin haber caso ni aviso.
// Si algo falla: UN caso por posteo en la vía de avisos al operador que
// ya existe (support_cases, tipo 'preflight_casa', visible en
// /api/admin/support/conserje/pendientes — la misma superficie que
// vigila el monitor del conserje), con la causa literal de cada
// defecto. Idempotente: dedup_key por posteo + día (Nueva York) —
// correrlo dos veces no duplica el aviso del mismo defecto.
//
// La casa = la identidad que el sistema ya reconoce
// (plan-gate.esCuentaDeLaCasa: HOUSE_USER_IDS, default '12', o el
// ig_username de la casa — cubre @posty.communitymanager y su espejo
// EN @postycommunitymanager). Ninguna otra cuenta se revisa.
//
// DECLARACIÓN (la que pide el tablero): este preflight ABSORBE el
// freno nombrado el 22/11 (la validación del video al cargar, familia
// Subir) para los posteos de la casa — la validación corre acá, a las
// 18:30, sobre lo PROGRAMADO. NO corre al cargar el material
// (Subir / cargar-pieza no inspeccionan el video hoy: solo exigen la
// fila del asset y que el archivo exista) y este lote NO la agrega a
// la carga, por dos razones: (1) la puerta de carga también sirve
// material de clientes y material que el equipo todavía va a trabajar
// (la película limpia del 22/11 se re-encodó DESPUÉS de cargar el
// master: un freno duro al cargar habría bloqueado el material de
// trabajo); (2) mirando lo programado, el preflight cubre TODOS los
// caminos de armado (cargar-pieza, Subir, sesión, dogfood) en la
// última puerta antes de Meta, que es donde el defecto hace daño.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const NY_TZ = 'America/New_York';

// ---------- tiempo: la ventana de las 19:00 de hoy en Nueva York ----------

function partesEnTz(ms, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    H: Number(p.hour) % 24, M: Number(p.minute), S: Number(p.second),
  };
}

function dayKeyEnTz(ms, tz) {
  const p = partesEnTz(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// Instante UTC en que el reloj de pared de tz marca y-m-d H:M:00.
function paredAUtc(y, m, d, H, M, tz) {
  let guess = Date.UTC(y, m - 1, d, H, M, 0);
  for (let i = 0; i < 3; i++) {
    const p = partesEnTz(guess, tz);
    const paredComoUtc = Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S);
    const target = Date.UTC(y, m - 1, d, H, M, 0);
    const next = guess + (target - paredComoUtc);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

// Ventana [19:00, 20:00) de hoy en Nueva York + la clave del día.
function ventana19DeHoy(nowMs) {
  const hoy = partesEnTz(nowMs, NY_TZ);
  return {
    dayKey: `${hoy.y}-${String(hoy.m).padStart(2, '0')}-${String(hoy.d).padStart(2, '0')}`,
    desdeMs: paredAUtc(hoy.y, hoy.m, hoy.d, 19, 0, NY_TZ),
    hastaMs: paredAUtc(hoy.y, hoy.m, hoy.d, 20, 0, NY_TZ),
  };
}

function msDePost(s) {
  if (!s) return NaN;
  const t = Date.parse(String(s).replace(' ', 'T').replace(/(\d{2}:\d{2}:\d{2})$/, '$1Z'));
  return Number.isFinite(t) ? t : Date.parse(s);
}

// ---------- (a) el video: faststart + lo que Meta necesita ----------

// Camina las cajas de primer nivel del MP4 leyendo solo cabeceras.
function leerCajasMp4(abs) {
  return new Promise((resolve) => {
    fs.open(abs, 'r', (err, fd) => {
      if (err) return resolve(null);
      const cajas = [];
      const buf = Buffer.alloc(16);
      const fin = (out) => fs.close(fd, () => resolve(out));
      const paso = (offset) => {
        fs.read(fd, buf, 0, 16, offset, (e, leidos) => {
          if (e || leidos < 8) return fin(cajas);
          let size = buf.readUInt32BE(0);
          const type = buf.toString('ascii', 4, 8);
          if (size === 1) {
            if (leidos < 16) return fin(cajas);
            size = Number(buf.readBigUInt64BE(8));
          } else if (size === 0) {
            cajas.push({ type, offset });
            return fin(cajas);
          }
          if (!Number.isFinite(size) || size < 8) return fin(cajas);
          cajas.push({ type, offset });
          if (type === 'moov' || cajas.length > 64) return fin(cajas);
          paso(offset + size);
        });
      };
      paso(0);
    });
  });
}

function probeVideo(abs) {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name,avg_frame_rate,r_frame_rate,color_space,color_primaries,color_transfer',
      '-of', 'json', abs,
    ], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(String((err && err.message) || err).slice(0, 160)));
      try { resolve(JSON.parse(stdout || '{}')); } catch (e) { reject(new Error('salida de ffprobe ilegible')); }
    });
  });
}

function fpsDe(stream) {
  const raw = String((stream && (stream.avg_frame_rate || stream.r_frame_rate)) || '');
  const [a, b] = raw.split('/').map(Number);
  if (Number.isFinite(a) && Number.isFinite(b) && b > 0) return a / b;
  return Number.isFinite(a) ? a : NaN;
}

// Devuelve la lista de defectos (causas literales) del video de un posteo.
async function defectosDeVideo(post, abs, mediaDir) {
  const { fileExists } = require('./image-fallback');
  const defectos = [];
  const base = path.basename(String(post.image_path || ''));
  if (!fileExists(mediaDir, post.image_path) || !fs.existsSync(abs)) {
    defectos.push(`El archivo del video del posteo ${post.id} no está en el servidor (${base}): a las 19:00 no va a poder salir.`);
    return defectos;
  }
  const cajas = await leerCajasMp4(abs);
  if (!cajas || !cajas.length || cajas[0].type !== 'ftyp') {
    defectos.push(`El video del posteo ${post.id} (${base}) no parece un MP4 válido: no se encontró la estructura de cajas (ftyp). Meta no lo va a poder procesar.`);
  } else {
    const iMoov = cajas.findIndex((c) => c.type === 'moov');
    const iMdat = cajas.findIndex((c) => c.type === 'mdat');
    if (iMoov === -1) {
      defectos.push(`El video del posteo ${post.id} (${base}) no tiene bloque moov legible: Meta no lo va a poder procesar.`);
    } else if (iMdat !== -1 && iMoov > iMdat) {
      defectos.push(`El video del posteo ${post.id} (${base}) no tiene faststart: el bloque moov está después de los datos (mdat). Es el defecto del master que Meta rechazó el 22/11 a las 19:01 — hay que re-encodarlo con -movflags +faststart antes de las 19:00.`);
    }
  }
  let probe = null;
  try { probe = await probeVideo(abs); } catch (e) {
    defectos.push(`ffprobe no pudo leer el video del posteo ${post.id} (${base}): ${e.message}. Un archivo que ffprobe no puede leer, Meta tampoco lo procesa.`);
    return defectos;
  }
  const streams = (probe && probe.streams) || [];
  const v = streams.find((s) => s.codec_type === 'video');
  if (!v) {
    defectos.push(`El archivo del posteo ${post.id} (${base}) no tiene pista de video.`);
    return defectos;
  }
  if (String(v.codec_name || '').toLowerCase() !== 'h264') {
    defectos.push(`El video del posteo ${post.id} (${base}) está en ${v.codec_name || 'un códec desconocido'} y Meta exige H.264 para publicar reels.`);
  }
  const fps = fpsDe(v);
  if (Number.isFinite(fps) && fps > 30.5) {
    defectos.push(`El video del posteo ${post.id} (${base}) está a ${Math.round(fps)} fps y Meta procesa reels hasta 30 fps (el master del 22/11 salió a 60 fps y fue rechazado al procesarlo).`);
  }
  const color = [v.color_space, v.color_primaries, v.color_transfer]
    .map((x) => String(x || '').trim().toLowerCase());
  if (color.every((x) => !x || x === 'unknown')) {
    defectos.push(`El video del posteo ${post.id} (${base}) no trae metadata de color (espacio, primarias y transferencia vacíos): fue uno de los defectos del master rechazado el 22/11.`);
  }
  return defectos;
}

// ---------- (b) el cupo: la simulación del reintento ----------

// La MISMA cuenta que quotaCounts de server.js (la semana del posteo).
function conteoSemana(db, userId, monday) {
  const rows = db.prepare(`SELECT media_type, COUNT(*) AS n FROM posts
    WHERE user_id = ? AND status IN ('scheduled','publishing','published')
    AND COALESCE(source,'') != 'express'
    AND date(COALESCE(scheduled_at, published_at, created_at)) >= date(?)
    AND date(COALESCE(scheduled_at, published_at, created_at)) < date(?, '+7 days')
    GROUP BY media_type`).all(userId, monday, monday) || [];
  const m = {};
  for (const r of rows) m[r.media_type || 'image'] = r.n;
  return m;
}

function defectosDeCupo(db, post) {
  const { getPlan, TRIAL_PLAN } = require('./config/plans');
  const streaks = require('./streaks');
  const defectos = [];
  const userId = Number(post.user_id);
  const u = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(userId) || {};
  const plan = getPlan(u.plan_status === 'active' ? u.plan : TRIAL_PLAN);
  const limit = (plan && plan.reelsPerWeek) || 0;
  const st = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId) || {};
  const tz = st.timezone || 'America/Argentina/Buenos_Aires';
  const monday = streaks.mondayKeyOf(dayKeyEnTz(msDePost(post.scheduled_at), tz));
  const counts = conteoSemana(db, userId, monday);
  const usados = counts.video || 0;
  // (PREFLIGHT-REINTENTO-HEREDA) La simulación del reintento modela la
  // herencia de FRENO-REINTENTO-CUPO (v1270), tal cual las dos puertas
  // de producción:
  //  - publish-now: un 'failed' cuyo horario original (el scheduled_at
  //    que sobrevive al fallo) cae en la semana que mide quotaFor — la
  //    vigente — NO se cobra de nuevo; el de otra semana, o sin
  //    horario guardado, se cobra como nuevo contra la semana vigente.
  //  - PATCH (reprogramar): un 'failed' reprogramado a SU misma semana
  //    tampoco se cobra; a otra semana se cobra contra esa semana.
  // El posteo de esta noche, si falla, reintenta dentro de su propia
  // semana por cualquiera de las dos puertas: hereda siempre y ya NO
  // genera el aviso que la simulación vieja le ponía (quedó falso).
  // Lo que sigue siendo defecto de verdad: un video que YA quedó
  // fallido y no hereda, con el cupo vigente completo — su reintento
  // de esta noche por publish-now rebota por plan_limit.
  if (limit > 0 && usados >= limit) {
    const ids = db.prepare(`SELECT id FROM posts
      WHERE user_id = ? AND media_type = 'video'
      AND status IN ('scheduled','publishing','published')
      AND COALESCE(source,'') != 'express'
      AND date(COALESCE(scheduled_at, published_at, created_at)) >= date(?)
      AND date(COALESCE(scheduled_at, published_at, created_at)) < date(?, '+7 days')
      ORDER BY id ASC`).all(userId, monday, monday).map((r) => r.id);
    // Los fallidos se barren enteros (no solo los de esta semana): la
    // herencia se decide por posteo, con su horario original. Los
    // express quedan fuera: publish-now no les cobra cupo nunca.
    const fallidos = db.prepare(`SELECT id, scheduled_at FROM posts
      WHERE user_id = ? AND media_type = 'video' AND status = 'failed'
      AND COALESCE(source,'') != 'express'
      ORDER BY id ASC`).all(userId);
    for (const f of fallidos) {
      const semanaOriginal = f.scheduled_at
        ? streaks.mondayKeyOf(dayKeyEnTz(msDePost(f.scheduled_at), tz)) : null;
      if (semanaOriginal === monday) continue; // hereda: su reintento no rebota
      const motivo = !f.scheduled_at
        ? 'quedó fallido sin horario programado guardado, así que su reintento se cobra como nuevo'
        : 'su horario original cae en otra semana, así que no hereda el lugar de esta';
      defectos.push(`El posteo ${f.id} quedó fallido y su reintento rebota por cupo (plan ${plan.name || plan.id}: ${usados} de ${limit} reels de esta semana ya usados por los posteos ${ids.join(', ')}): ${motivo} y la semana vigente está completa (plan_limit).`);
    }
  }
  return defectos;
}

// ---------- (c) la portada ----------

function defectosDePortada(post, mediaDir) {
  const { fileExists } = require('./image-fallback');
  if (post.media_type !== 'video') {
    if (!fileExists(mediaDir, post.image_path)) {
      return [`El archivo del posteo ${post.id} no está en el servidor (${path.basename(String(post.image_path || ''))}): a las 19:00 no va a poder salir.`];
    }
    return [];
  }
  if (!post.cover_path) {
    return [`El posteo ${post.id} no tiene portada (cover_path vacío): el reel saldría sin su portada propia.`];
  }
  if (!fileExists(mediaDir, post.cover_path)) {
    return [`La portada del posteo ${post.id} no está en el servidor (${path.basename(String(post.cover_path || ''))}).`];
  }
  return [];
}

// ---------- la corrida ----------

async function runPreflightCasa(db, opts = {}) {
  const planGate = require('./plan-gate');
  const supportCases = require('./support-cases');
  const { fileExists } = require('./image-fallback');
  const nowMs = Number(opts.nowMs || Date.now());
  const mediaDir = opts.mediaDir || process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
  const log = typeof opts.log === 'function' ? opts.log : console.log;
  const ventana = ventana19DeHoy(nowMs);

  // Cuentas con algo programado → solo las de la casa se revisan.
  const candidatos = db.prepare(
    `SELECT DISTINCT user_id FROM posts WHERE status = 'scheduled'`).all();
  const resumen = { ventana: ventana.dayKey, revisados: 0, con_defectos: 0, casos: 0, duplicados: 0, causas: [] };
  for (const c of candidatos) {
    const userId = Number(c.user_id);
    let esCasa = false;
    try { esCasa = planGate.esCuentaDeLaCasa(db, userId); } catch (e) { esCasa = false; }
    if (!esCasa) continue;
    const prof = db.prepare('SELECT ig_username FROM profiles WHERE user_id = ?').get(userId) || {};
    const ig = String(prof.ig_username || '').replace(/^@/, '');
    const rows = db.prepare(
      `SELECT * FROM posts WHERE user_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC`).all(userId);
    for (const post of rows) {
      const ms = msDePost(post.scheduled_at);
      if (!Number.isFinite(ms) || ms < ventana.desdeMs || ms >= ventana.hastaMs) continue;
      resumen.revisados++;
      let defectos = [];
      if (post.media_type === 'video') {
        const abs = fileExists(mediaDir, post.image_path)
          ? path.join(mediaDir, path.basename(String(post.image_path || ''))) : '';
        defectos = defectos.concat(await defectosDeVideo(post, abs, mediaDir));
        defectos = defectos.concat(defectosDeCupo(db, post));
        defectos = defectos.concat(defectosDePortada(post, mediaDir));
      } else {
        defectos = defectos.concat(defectosDePortada(post, mediaDir));
      }
      if (!defectos.length) continue;
      resumen.con_defectos++;
      for (const d of defectos) resumen.causas.push(d);
      const detalle = [
        `Posteo ${post.id} · @${ig || userId} · programado para las 19:00 de hoy (Nueva York) · ${post.media_type || 'image'}${post.image_path ? ' · archivo ' + path.basename(String(post.image_path)) : ''}`,
        ...defectos.map((d, i) => `${i + 1}. ${d}`),
      ].join('\n');
      const r = supportCases.openCase(db, {
        userId,
        tipo: 'preflight_casa',
        titulo: `Preflight 19:00 — el posteo ${post.id} de @${ig || userId} no está listo`,
        detalle,
        postId: post.id,
        siguientePaso: 'Corregir la causa antes de las 19:00. El posteo sigue programado: si nadie lo toca, sale (o rebota) igual.',
        dedupKey: `preflight-casa:${post.id}:${ventana.dayKey}`,
      });
      if (r && r.ok && r.duplicado) resumen.duplicados++;
      else if (r && r.ok) resumen.casos++;
    }
  }
  if (resumen.revisados || resumen.con_defectos) {
    log(`[preflight-casa] ${ventana.dayKey}: ${resumen.revisados} posteo(s) de la casa revisados, ${resumen.con_defectos} con defectos, ${resumen.casos} caso(s) abiertos, ${resumen.duplicados} ya avisados`);
  }
  persistirResumen(db, resumen, nowMs);
  return resumen;
}

// ---------- (LOTE CONSERJE-DATOS-BANDEJA) el resumen persiste ----------
// Tabla de UNA fila (id = 1, declarada en db.js; el CREATE de acá es
// la red para correr el módulo contra una base que todavía no pasó
// por db.js). Cada corrida pisa la fila con la suya: lo que la vista
// lee es siempre la ÚLTIMA corrida, con su hora — nunca un resumen
// armado de memoria. Si guardar falla, la corrida vale igual (el
// resumen es para la consola, no una condición del chequeo).
const DDL_RESUMEN = `CREATE TABLE IF NOT EXISTS preflight_casa_resumen (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ventana TEXT NOT NULL DEFAULT '',
  revisados INTEGER NOT NULL DEFAULT 0,
  con_defectos INTEGER NOT NULL DEFAULT 0,
  casos INTEGER NOT NULL DEFAULT 0,
  causas_json TEXT NOT NULL DEFAULT '[]',
  corrida_at TEXT NOT NULL DEFAULT ''
)`;

function persistirResumen(db, resumen, nowMs) {
  try {
    db.exec(DDL_RESUMEN);
    db.prepare(`INSERT INTO preflight_casa_resumen (id, ventana, revisados, con_defectos, casos, causas_json, corrida_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET ventana = excluded.ventana, revisados = excluded.revisados,
        con_defectos = excluded.con_defectos, casos = excluded.casos,
        causas_json = excluded.causas_json, corrida_at = excluded.corrida_at`)
      .run(resumen.ventana || '', resumen.revisados || 0, resumen.con_defectos || 0, resumen.casos || 0,
        JSON.stringify((resumen.causas || []).slice(0, 10)),
        new Date(nowMs).toISOString());
  } catch (e) { /* la corrida ya pasó: el resumen no la condiciona */ }
}

// La última corrida persistida, o null si nunca corrió (o si la tabla
// no existe): la vista expone el campo solo con fila real.
function ultimoResumenPreflight(db) {
  try {
    const r = db.prepare('SELECT ventana, revisados, con_defectos, casos, causas_json, corrida_at FROM preflight_casa_resumen WHERE id = 1').get();
    if (!r) return null;
    let causas = [];
    try { const p = JSON.parse(r.causas_json || '[]'); if (Array.isArray(p)) causas = p.map((c) => String(c)); } catch (e) { causas = []; }
    return {
      ventana: r.ventana || '',
      revisados: Number(r.revisados) || 0,
      con_defectos: Number(r.con_defectos) || 0,
      casos: Number(r.casos) || 0,
      causas,
      corrida_at: r.corrida_at || '',
    };
  } catch (e) { return null; }
}

module.exports = {
  runPreflightCasa,
  ultimoResumenPreflight,
  _internos: { ventana19DeHoy, leerCajasMp4, defectosDeVideo, defectosDeCupo, defectosDePortada, msDePost, persistirResumen },
};
