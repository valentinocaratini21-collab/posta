// push-oficina.js — EL SISTEMA DE PUSH DE LA OFICINA (espina TestFlight).
// Doctrina: DETALLE-TOTAL §5 — cada push es SU agente hablando.
// Este módulo es el ÚNICO camino de salida para las push de la oficina:
// ninguna push sale sin pasar por emitir(), y TODO resultado queda en
// push_oficina_log (sin registro no hay promesa — también para lo bloqueado).
//
// Reglas hechas cumplir en código:
//  · Motivos cerrados: decision · buena_noticia · urgencia · celebracion
//    (+ cierre_prueba, la única excepción aprobada para no-clientes).
//  · Silencio 22–8 salvo urgencia real del negocio.
//  · Topes: 3 por agente/día y 6 totales/día; el excedente espera y se agrupa.
//  · Agrupado: 3+ buenas noticias/celebraciones en espera → UNA push de
//    Bossty («Tu oficina mientras dormías» / resumen del día).
//  · Guarda de Talenty: jamás un dato de personas (bloqueo por bandera y,
//    en profundidad, por patrón de monto/legajo en el texto).
//  · Guarda de Growty: sin un número MEDIDO detrás, no hay push suya.
//  · Control del dueño: toggles por agente + silencio global (push_prefs).
//  · Aviso de cierre de prueba: UN solo aviso, personal, un toque a SU
//    resultado, canal único por disponibilidad — push si lo tiene; email
//    solo como respaldo (lo decide avisoCierrePrueba y lo ejecuta el cron
//    existente de scheduler.js, que conserva su marca durable).
'use strict';

const push = require('./push');
const { PODERES } = require('./niveles');

const MOTIVOS = ['decision', 'buena_noticia', 'urgencia', 'celebracion', 'cierre_prueba'];
const CAP_AGENTE_DIA = 3;
const CAP_TOTAL_DIA = 6;
const TZ = process.env.OFFICE_TZ || 'America/Argentina/Buenos_Aires';
const BASE = process.env.BASE_URL || process.env.APP_URL || 'https://postycommunitymanager.com';

function init(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_oficina_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    agente TEXT NOT NULL,
    motivo TEXT NOT NULL,
    titulo TEXT DEFAULT '',
    cuerpo TEXT DEFAULT '',
    url TEXT DEFAULT '',
    estado TEXT NOT NULL,
    causa TEXT DEFAULT '',
    ts INTEGER NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_push_oficina_log_user_ts ON push_oficina_log(user_id, ts)`);
  db.exec(`CREATE TABLE IF NOT EXISTS push_prefs (
    user_id INTEGER NOT NULL,
    agente TEXT NOT NULL,
    activado INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, agente)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS push_prefs_global (
    user_id INTEGER PRIMARY KEY,
    silencio INTEGER NOT NULL DEFAULT 0
  )`);
}

function horaLocal(ts) {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date(ts));
    return parseInt(s, 10) % 24;
  } catch (e) { return new Date(ts).getHours(); }
}
function esSilencioNocturno(ts) { const h = horaLocal(ts); return h >= 22 || h < 8; }
function inicioDiaLocal(ts) {
  // Día calendario en TZ: conteo por ventana móvil de 24 h es más simple y
  // suficiente para topes; pero la vara pide "por día": usamos la fecha local.
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
    return f; // YYYY-MM-DD local
  } catch (e) { return new Date(ts).toISOString().slice(0, 10); }
}
function mismoDiaLocal(tsA, tsB) { return inicioDiaLocal(tsA) === inicioDiaLocal(tsB); }

function getPrefs(db, uid) {
  const agentes = {};
  try {
    const rows = db.prepare('SELECT agente, activado FROM push_prefs WHERE user_id = ?').all(uid);
    for (const r of rows) agentes[r.agente] = !!r.activado;
  } catch (e) {}
  let silencio = false;
  try { const g = db.prepare('SELECT silencio FROM push_prefs_global WHERE user_id = ?').get(uid); silencio = !!(g && g.silencio); } catch (e) {}
  return { silencio, agentes };
}
function agenteActivo(db, uid, agente) {
  const p = getPrefs(db, uid);
  if (p.silencio) return false;
  if (agente in p.agentes) return p.agentes[agente];
  return true;
}
function setPrefAgente(db, uid, agente, activado) {
  db.prepare('INSERT INTO push_prefs (user_id, agente, activado) VALUES (?, ?, ?) ON CONFLICT(user_id, agente) DO UPDATE SET activado = excluded.activado')
    .run(uid, agente, activado ? 1 : 0);
}
function setSilencioGlobal(db, uid, on) {
  db.prepare('INSERT INTO push_prefs_global (user_id, silencio) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET silencio = excluded.silencio')
    .run(uid, on ? 1 : 0);
}

function enviadasHoy(db, uid, agente) {
  const rows = db.prepare("SELECT agente, ts FROM push_oficina_log WHERE user_id = ? AND estado = 'enviada'").all(uid);
  const hoy = rows.filter((r) => mismoDiaLocal(r.ts, Date.now()));
  return agente ? hoy.filter((r) => r.agente === agente).length : hoy.length;
}

function log(db, uid, o) {
  const r = db.prepare('INSERT INTO push_oficina_log (user_id, agente, motivo, titulo, cuerpo, url, estado, causa, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, o.agente, o.motivo, o.titulo || '', o.cuerpo || '', o.url || '', o.estado, o.causa || '', Date.now());
  return r.lastInsertRowid;
}

async function despachar(db, uid, o) {
  // Identidad: nombre del agente + su avatar como imagen (si tiene asset).
  const def = PODERES[o.agente] || {};
  const titulo = o.titulo || '';
  const image = def.avatar ? (BASE + def.avatar) : undefined;
  const actions = [];
  if (o.motivo === 'decision' && o.bandeja_id) {
    actions.push({ action: 'aprobar', title: 'Aprobar' });
    actions.push({ action: 'ver', title: 'Ver' });
  } else if (o.url) {
    actions.push({ action: 'ver', title: 'Ver' });
  }
  const r = await push.sendPush(uid, {
    title: titulo,
    body: o.cuerpo || '',
    url: o.url || '/#/app/oficina',
    image,
    actions: actions.length ? actions : undefined,
    data: { agente: o.agente, motivo: o.motivo, bandeja_id: o.bandeja_id || undefined },
  });
  return r;
}

// emitir(): la única puerta. Devuelve { estado, causa, id } y SIEMPRE loguea.
async function emitir(db, uid, o) {
  const base = { agente: o.agente, motivo: o.motivo, titulo: o.titulo, cuerpo: o.cuerpo, url: o.url };
  const fin = (estado, causa, extra) => {
    const id = log(db, uid, { ...base, estado, causa: causa || '' });
    return { estado, causa: causa || '', id, ...(extra || {}) };
  };
  if (!MOTIVOS.includes(o.motivo)) return fin('bloqueada', 'motivo_invalido');
  if (!PODERES[o.agente]) return fin('bloqueada', 'agente_invalido');
  // Guarda de Talenty: jamás datos de personas. Bandera explícita + patrón
  // (montos largos o palabras de legajo) como defensa en profundidad.
  if (o.agente === 'talenty') {
    const texto = `${o.titulo || ''} ${o.cuerpo || ''}`;
    if (o.datos_personas || /\$\s?\d{2,}|\blegajo\b|\bsueldo\b|\bdni\b/i.test(texto)) {
      return fin('bloqueada', 'guarda_talenty');
    }
  }
  // Guarda de Growty: solo habla con un número medido detrás.
  if (o.agente === 'growty' && (o.numero_medido === undefined || o.numero_medido === null)) {
    return fin('bloqueada', 'guarda_growty_sin_medicion');
  }
  // Control del dueño.
  if (!agenteActivo(db, uid, o.agente)) return fin('bloqueada', 'apagada_por_el_dueno');
  // Grupo de buenas noticias: esperan para agruparse (Bossty las resume).
  if (o.motivo === 'buena_noticia' || o.motivo === 'celebracion') {
    return fin('en_espera', 'agrupable');
  }
  // Silencio nocturno: solo la urgencia real lo cruza.
  if (esSilencioNocturno(Date.now()) && o.motivo !== 'urgencia') {
    return fin('en_espera', 'silencio_nocturno');
  }
  // Topes.
  if (enviadasHoy(db, uid, o.agente) >= CAP_AGENTE_DIA) return fin('en_espera', 'tope_agente');
  if (enviadasHoy(db, uid) >= CAP_TOTAL_DIA) return fin('en_espera', 'tope_total');
  const r = await despachar(db, uid, o);
  if (r && r.ok) return fin('enviada', '', { sent: r.sent });
  return fin('sin_suscripcion', (r && r.reason) || 'sin_suscripcion');
}

// procesarEsperas(): vacía la cola de buenas noticias/celebraciones.
//  · Con 3+ en espera → UNA push de Bossty que las resume (queda logueada).
//  · Con menos, sale cada una con su identidad si ya esperó lo suficiente
//    (o si se fuerza — cierre del día / tests del programa).
// Respeta silencio nocturno (no despierta por buenas noticias) y topes.
async function procesarEsperas(db, uid, { forzar = false, esperaMinMs = 10 * 60 * 1000 } = {}) {
  // El silencio nocturno manda sobre el vaciado automático; `forzar` es el
  // vaciado DELIBERADO (lo pide el dueño o el programa), nunca el intervalo.
  if (esSilencioNocturno(Date.now()) && !forzar) return { enviadas: 0, causa: 'silencio_nocturno' };
  const pend = db.prepare("SELECT * FROM push_oficina_log WHERE user_id = ? AND estado = 'en_espera' AND motivo IN ('buena_noticia', 'celebracion') ORDER BY ts ASC").all(uid);
  if (!pend.length) return { enviadas: 0 };
  const marcar = (id, estado, causa) => db.prepare('UPDATE push_oficina_log SET estado = ?, causa = ? WHERE id = ?').run(estado, causa || '', id);
  if (pend.length >= 3) {
    if (!agenteActivo(db, uid, 'bossty')) { pend.forEach((p) => marcar(p.id, 'bloqueada', 'apagada_por_el_dueno')); return { enviadas: 0, causa: 'apagada_por_el_dueno' }; }
    const lineas = pend.slice(0, 5).map((p) => `• ${p.titulo}`).join(' ');
    const r = await despachar(db, uid, {
      agente: 'bossty', motivo: 'buena_noticia',
      titulo: 'Tu oficina mientras dormías ✨',
      cuerpo: lineas.slice(0, 170),
      url: '/#/app/oficina',
    });
    const idRes = log(db, uid, { agente: 'bossty', motivo: 'buena_noticia', titulo: 'Tu oficina mientras dormías ✨', cuerpo: lineas.slice(0, 170), url: '/#/app/oficina', estado: r && r.ok ? 'enviada' : 'sin_suscripcion', causa: 'resumen_agrupado' });
    pend.forEach((p) => marcar(p.id, 'agrupada', `resumen:${idRes}`));
    return { enviadas: r && r.ok ? 1 : 0, resumen: idRes };
  }
  let enviadas = 0;
  for (const p of pend) {
    if (!forzar && Date.now() - p.ts < esperaMinMs) continue;
    if (!agenteActivo(db, uid, p.agente)) { marcar(p.id, 'bloqueada', 'apagada_por_el_dueno'); continue; }
    if (enviadasHoy(db, uid, p.agente) >= CAP_AGENTE_DIA || enviadasHoy(db, uid) >= CAP_TOTAL_DIA) { marcar(p.id, 'en_espera', 'tope'); continue; }
    const r = await despachar(db, uid, { agente: p.agente, motivo: p.motivo, titulo: p.titulo, cuerpo: p.cuerpo, url: p.url });
    marcar(p.id, r && r.ok ? 'enviada' : 'sin_suscripcion', r && r.ok ? 'desde_espera' : ((r && r.reason) || ''));
    if (r && r.ok) enviadas++;
  }
  return { enviadas };
}

// avisoCierrePrueba(): la excepción aprobada (DETALLE-TOTAL §5). UN aviso,
// personal, un toque a SU resultado. Devuelve el canal elegido:
// 'push' (ya emitido por esta puerta) | 'email' (respaldo: lo manda el cron
// de scheduler con su plantilla y su marca durable) | 'ninguno'.
async function avisoCierrePrueba(db, user, { negocio } = {}) {
  const uid = user.id;
  let tienePush = false;
  try { tienePush = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(uid).n > 0; } catch (e) {}
  const agente = user.bambooty_shell ? 'oficina' : 'posty';
  if (!tienePush) return { canal: 'email', causa: 'sin_push' };
  const r = await emitir(db, uid, {
    agente,
    motivo: 'cierre_prueba',
    titulo: 'Tu semana quedó guardada 💙',
    cuerpo: `${negocio || 'Tu negocio'}: tu semana quedó lista y guardada. Te espera si te sumás.`,
    url: '/#/app/schedule',
  });
  if (r.estado === 'enviada') return { canal: 'push', id: r.id };
  if (r.estado === 'sin_suscripcion') return { canal: 'email', causa: 'push_no_entregable' };
  // Bloqueada por el dueño o en espera nocturna: el aviso es del momento del
  // cierre — si la puerta lo retiene, el respaldo es el email UNA sola vez.
  return { canal: 'email', causa: r.causa || r.estado };
}

module.exports = {
  init, emitir, procesarEsperas, avisoCierrePrueba,
  getPrefs, setPrefAgente, setSilencioGlobal, agenteActivo,
  MOTIVOS, CAP_AGENTE_DIA, CAP_TOTAL_DIA, esSilencioNocturno, _log: log,
};
