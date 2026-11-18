// venty-canal.js — VENTY F3: lectura automática del canal dominante del
// negocio (lección C13 del playbook: el formato sigue a la marca — si el
// negocio vive en whatsapp, ahí cierra venty; si su público responde por
// email, la oleada va por email; se lee de su realidad, no de una
// plantilla). Genérico: ningún negocio atado, todo sale del registro.
//
// SEÑALES (solo las que existen de verdad en el modelo de datos):
//   · consultas: venty_partidas.canal — el canal real por el que entró
//     cada consulta (whatsapp / instagram / email; 'simulacion' es el
//     modo prueba y NO cuenta como canal real).
//   · respuestas: venty_mensajes con autor 'cliente' agrupados por el
//     canal de su partida — qué canal concentra la respuesta del público.
//   · cierres: venty_partidas en estado 'cerrada_ganada' por canal.
//   · conexiones: venty_conexiones (viva = conectado + fetch + credencial,
//     según venty-conexiones.estadoDerivado). La conexión NO decide la
//     lectura: decide si el canal dominante se puede USAR. Si el
//     dominante no está conectado, el uso cae al criterio actual.
//
// UMBRAL DE SEÑAL SUFICIENTE (definido acá, con su porqué):
//   · MIN_CONSULTAS = 5 consultas reales en total. Con menos, una o dos
//     conversaciones mueven la cuota de 0 a 100%: no hay patrón, hay
//     anécdota.
//   · CUOTA_MINIMA = 0.60: el canal de arriba concentra al menos el 60%
//     de las consultas. Un 51/49 es un empate práctico, no un dominante;
//     el 60% exige mayoría clara con margen sobre el resto junto.
//   · Sin empate en la cima (si dos canales igualan arriba, no hay
//     desempate honesto en las consultas: queda sin_definir).
//   · Más de un canal posible: si solo existe un canal en la realidad
//     del negocio (único conectado y único con consultas), declararlo
//     «dominante» sería inventar una preferencia donde no hubo elección;
//     queda sin_definir y manda el criterio actual, que en la práctica
//     ya usa ese único canal cuando corresponde.
// Si la señal no alcanza, el resultado es estado 'sin_definir' con su
// motivo y NADA cambia: cierre y oleadas siguen con su criterio actual.
//
// RECÁLCULO: la lectura se computa desde el registro en cada lectura
// (leer / canalEfectivo), así una consulta nueva o un cambio de conexión
// se refleja en la lectura siguiente sin caché vencida; además cada
// lectura persiste su snapshot en venty_canal_dominante (registro y
// auditoría) y refrescar() se invoca desde los puntos de uso (cierre y
// oleadas). No hay rutas nuevas: el resultado viaja en el fundamento
// (GET /api/venty/fundamento) y en GET /api/venty/estado.
//
// Voz de Venty: minúsculas, sin signos de apertura (el porque se valida
// con venty.validarVoz al construirse en los tests).
'use strict';

const venty = require('./venty');
let _conexiones = null;
function conexiones() { if (!_conexiones) _conexiones = require('./venty-conexiones'); return _conexiones; }

const CANALES_REALES = ['whatsapp', 'instagram', 'email'];
const MIN_CONSULTAS = 5;
const CUOTA_MINIMA = 0.6;

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_canal_dominante (
    user_id INTEGER PRIMARY KEY,
    estado TEXT NOT NULL DEFAULT 'sin_definir',
    canal TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '',
    evidencia_json TEXT NOT NULL DEFAULT '{}',
    calculado_at TEXT NOT NULL DEFAULT ''
  )`);
}

// ---- señales crudas: conteos por canal, nada interpretado --------------
function senales(db, userId) {
  const porCanal = {};
  for (const c of CANALES_REALES) porCanal[c] = { canal: c, consultas: 0, respuestas: 0, cierres: 0, conectado: false };
  try {
    const rows = db.prepare(`SELECT canal, COUNT(*) n,
        SUM(CASE WHEN estado = 'cerrada_ganada' THEN 1 ELSE 0 END) cierres
      FROM venty_partidas WHERE user_id = ? GROUP BY canal`).all(userId);
    for (const r of rows) {
      if (!porCanal[r.canal]) continue; // simulacion y otros no son canal real
      porCanal[r.canal].consultas = Number(r.n) || 0;
      porCanal[r.canal].cierres = Number(r.cierres) || 0;
    }
  } catch (e) {}
  try {
    const rows = db.prepare(`SELECT p.canal AS canal, COUNT(*) n
      FROM venty_mensajes m JOIN venty_partidas p ON p.id = m.partida_id
      WHERE p.user_id = ? AND m.autor = 'cliente' GROUP BY p.canal`).all(userId);
    for (const r of rows) {
      if (!porCanal[r.canal]) continue;
      porCanal[r.canal].respuestas = Number(r.n) || 0;
    }
  } catch (e) {}
  let conectados = [];
  try {
    const lista = conexiones().listarConexiones(db, userId);
    for (const c of lista) {
      if (porCanal[c.canal] && c.viva) { porCanal[c.canal].conectado = true; conectados.push(c.canal); }
    }
  } catch (e) { conectados = []; }
  const totalConsultas = CANALES_REALES.reduce((a, c) => a + porCanal[c].consultas, 0);
  return { por_canal: porCanal, total_consultas: totalConsultas, canales_conectados: conectados };
}

// Canales que de verdad podrían llevarse las consultas de este negocio:
// los conectados vivos más los que ya trajeron consultas. Si es uno solo,
// no hubo elección posible y no se declara dominante.
function canalesPosibles(sig) {
  const s = new Set(sig.canales_conectados.filter((c) => CANALES_REALES.includes(c)));
  for (const c of CANALES_REALES) if (sig.por_canal[c].consultas > 0) s.add(c);
  return [...s];
}

function porqueDe(estado, motivo, sig, top, cuota) {
  const detalle = CANALES_REALES
    .map((c) => { const s = sig.por_canal[c]; return `${c}: ${s.consultas} consultas, ${s.respuestas} respuestas, ${s.cierres} cierres`; })
    .join(' · ');
  if (estado === 'definido' && top) {
    return `canal dominante ${top.canal}: concentra ${top.consultas} de ${sig.total_consultas} consultas (${Math.round(cuota * 100)}%), con ${top.respuestas} respuestas de clientes y ${top.cierres} cierres · ${detalle}`;
  }
  const razones = {
    sin_consultas_reales: 'todavía no entró ninguna consulta por un canal real',
    senal_insuficiente: `hay ${sig.total_consultas} consultas reales y el mínimo para leer un patrón es ${MIN_CONSULTAS}`,
    empate: 'dos canales igualan en consultas y no hay desempate honesto',
    sin_dominancia_clara: `el canal de arriba concentra ${Math.round((cuota || 0) * 100)}% de las consultas y el mínimo es ${Math.round(CUOTA_MINIMA * 100)}%`,
    un_solo_canal_posible: 'hay un solo canal posible en la realidad del negocio: sin elección no se declara dominante',
  };
  return `canal dominante sin definir: ${razones[motivo] || motivo} · ${detalle}`;
}

// ---- la lectura ---------------------------------------------------------
function computar(db, userId) {
  const sig = senales(db, userId);
  const ranking = CANALES_REALES.map((c) => sig.por_canal[c])
    .slice().sort((a, b) => b.consultas - a.consultas);
  const top = ranking[0];
  const segundo = ranking[1];
  const cuota = sig.total_consultas ? (top.consultas / sig.total_consultas) : 0;
  let estado = 'definido';
  let motivo = '';
  if (!sig.total_consultas) { estado = 'sin_definir'; motivo = 'sin_consultas_reales'; }
  else if (sig.total_consultas < MIN_CONSULTAS) { estado = 'sin_definir'; motivo = 'senal_insuficiente'; }
  else if (segundo && top.consultas === segundo.consultas) { estado = 'sin_definir'; motivo = 'empate'; }
  else if (cuota < CUOTA_MINIMA) { estado = 'sin_definir'; motivo = 'sin_dominancia_clara'; }
  else if (canalesPosibles(sig).length <= 1) { estado = 'sin_definir'; motivo = 'un_solo_canal_posible'; }
  const evidencia = {
    por_canal: sig.por_canal,
    total_consultas: sig.total_consultas,
    cuota_dominante: estado === 'definido' ? Math.round(cuota * 1000) / 1000 : null,
    canales_conectados: sig.canales_conectados,
    canales_posibles: canalesPosibles(sig),
    umbral: { min_consultas: MIN_CONSULTAS, cuota_minima: CUOTA_MINIMA },
    porque: porqueDe(estado, motivo, sig, estado === 'definido' ? top : null, cuota),
  };
  return {
    estado,
    canal_dominante: estado === 'definido' ? top.canal : null,
    motivo: estado === 'definido' ? '' : motivo,
    conectado: estado === 'definido' ? !!sig.por_canal[top.canal].conectado : false,
    evidencia,
    calculado_at: ahoraIso(),
  };
}

// Leer = computar fresco desde el registro + persistir el snapshot.
// Por eso el recálculo es automático: entra una consulta nueva o cambia
// una conexión y la próxima lectura ya lo refleja.
function leer(db, userId) {
  ensureSchema(db);
  const lectura = computar(db, userId);
  try {
    db.prepare(`INSERT INTO venty_canal_dominante (user_id, estado, canal, motivo, evidencia_json, calculado_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET estado = excluded.estado, canal = excluded.canal,
        motivo = excluded.motivo, evidencia_json = excluded.evidencia_json, calculado_at = excluded.calculado_at`)
      .run(userId, lectura.estado, lectura.canal_dominante || '', lectura.motivo,
        JSON.stringify(lectura.evidencia), lectura.calculado_at);
  } catch (e) { /* el snapshot nunca rompe la lectura */ }
  return lectura;
}

// Punto de refresco explícito para los hooks (consulta nueva / cambio de
// conexión / puntos de uso): hoy es la misma lectura fresca de leer().
function refrescar(db, userId) { return leer(db, userId); }

function snapshot(db, userId) {
  ensureSchema(db);
  const row = db.prepare('SELECT * FROM venty_canal_dominante WHERE user_id = ?').get(userId);
  if (!row) return null;
  let evidencia = {};
  try { evidencia = JSON.parse(row.evidencia_json || '{}'); } catch (e) {}
  return {
    estado: row.estado,
    canal_dominante: row.canal || null,
    motivo: row.motivo || '',
    evidencia, calculado_at: row.calculado_at || '',
  };
}

// ---- el canal que manda, con fallback -----------------------------------
// opts: { canales_permitidos: [...], canal_actual }
// Devuelve el canal dominante SOLO si está definido, aplica a este uso
// (está en canales_permitidos) y está conectado vivo. En cualquier otro
// caso devuelve canal_actual con fuente 'criterio_actual': el
// comportamiento de hoy, sin romper nada.
function canalEfectivo(db, userId, opts) {
  const o = opts || {};
  const permitidos = Array.isArray(o.canales_permitidos) && o.canales_permitidos.length
    ? o.canales_permitidos : CANALES_REALES;
  const actual = o.canal_actual || null;
  const lectura = leer(db, userId);
  if (lectura.estado !== 'definido') {
    return { canal: actual, fuente: 'criterio_actual', motivo: lectura.motivo || 'sin_definir', lectura };
  }
  if (!permitidos.includes(lectura.canal_dominante)) {
    return { canal: actual, fuente: 'criterio_actual', motivo: 'canal_dominante_no_aplica', lectura };
  }
  if (!lectura.conectado) {
    return { canal: actual, fuente: 'criterio_actual', motivo: 'canal_dominante_no_conectado', lectura };
  }
  return { canal: lectura.canal_dominante, fuente: 'canal_dominante', motivo: '', lectura };
}

// Canal por defecto del cierre: manda el canal real de la propia partida
// (la conversación ya vive ahí); si la partida no tiene canal real
// (simulacion u otro), manda el dominante conectado; si no, el actual.
function canalDeCierre(db, userId, partida) {
  const actual = (partida && partida.canal) || 'simulacion';
  if (CANALES_REALES.includes(actual)) {
    return { canal: actual, fuente: 'canal_de_la_partida', motivo: '' };
  }
  const ef = canalEfectivo(db, userId, { canales_permitidos: CANALES_REALES, canal_actual: actual });
  return { canal: ef.canal || actual, fuente: ef.fuente, motivo: ef.motivo };
}

// Bloque que se declara en el fundamento (y en el estado): la lectura
// con su porqué con datos.
function paraFundamento(db, userId) {
  const l = leer(db, userId);
  return {
    estado: l.estado,
    canal: l.canal_dominante,
    motivo: l.motivo,
    conectado: l.conectado,
    porque: l.evidencia.porque,
    evidencia: l.evidencia,
    calculado_at: l.calculado_at,
  };
}

module.exports = {
  CANALES_REALES, MIN_CONSULTAS, CUOTA_MINIMA,
  ensureSchema, senales, canalesPosibles, computar, leer, refrescar, snapshot,
  canalEfectivo, canalDeCierre, paraFundamento,
};
