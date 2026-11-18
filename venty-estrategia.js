// venty-estrategia.js — VENTY F4: la estrategia de ventas como documento
// vivo VERSIONADO (lección D16 de Posty: la estrategia la ajusta el dueño
// por el chat; un pedido de preferencia reescribe la estrategia, un pedido
// puntual cambia solo esa partida).
//
// Modelo (diseño F4, STATUS del lote):
//   · venty_estrategia_versiones: una fila por versión, datos_json completo.
//     La VIGENTE es la versión más alta. Sin filas → defaults derivados del
//     fundamento (limites.descuento_max_pct ?? 10, zonas desde venty_zonas,
//     canales whatsapp/instagram/email, seguimiento 3 toques / 2 días):
//     el comportamiento sin estrategia NO cambia en nada.
//   · venty_estrategia_pendiente: la propuesta sin confirmar (un solo
//     pendiente por usuario). SIN confirmación NO nace versión: proponer
//     nunca toca la vigente. La columna tipo distingue 'propuesta' (lista
//     para confirmar) de 'ambiguo' / 'esperando_partida' (desambiguación
//     D16 en curso: el cambio parseado espera el toque que decide el
//     alcance, nunca se adivina).
//   · Campos: descuento_max_pct, zonas_activas[], zonas_pausadas[],
//     canales_habilitados[], seguimiento { toques_max, espera_dias }.
//     Origen de cada versión: chat | voz | sistema.
//   · Este módulo NO requiere venty.js (evita el ciclo): los defaults se
//     leen directo de venty_fundamento / venty_zonas. venty.js y
//     venty-oleadas.js SÍ requieren este módulo y leen la vigente.
'use strict';

const CANALES_TODOS = ['whatsapp', 'instagram', 'email'];
const ORIGENES = ['chat', 'voz', 'sistema'];

function ahoraIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function safeJson(s, dflt) { try { return JSON.parse(s || ''); } catch (e) { return dflt; } }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_estrategia_versiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    datos_json TEXT NOT NULL DEFAULT '{}',
    origen TEXT NOT NULL DEFAULT 'sistema',
    created_at TEXT NOT NULL DEFAULT '',
    UNIQUE(user_id, version)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_estr_user ON venty_estrategia_versiones(user_id, version)');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_estrategia_pendiente (
    user_id INTEGER PRIMARY KEY,
    datos_json TEXT NOT NULL DEFAULT '{}',
    origen TEXT NOT NULL DEFAULT 'chat',
    texto_original TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'propuesta',
    created_at TEXT NOT NULL DEFAULT ''
  )`);
}

// ---- defaults derivados del fundamento (sin filas → esto manda) ----------
function defaultsDesdeRegistro(db, userId) {
  let descuento = 10;
  try {
    const row = db.prepare('SELECT limites_json FROM venty_fundamento WHERE user_id = ?').get(userId);
    if (row) {
      const lim = safeJson(row.limites_json, {});
      if (lim && lim.descuento_max_pct !== undefined && lim.descuento_max_pct !== null && Number.isFinite(Number(lim.descuento_max_pct))) {
        descuento = Number(lim.descuento_max_pct);
      }
    }
  } catch (e) { /* sin fundamento: default histórico 10 */ }
  let zonasActivas = [];
  let zonasPausadas = [];
  try {
    const zonas = db.prepare('SELECT nombre, estado FROM venty_zonas WHERE user_id = ? ORDER BY nombre ASC').all(userId);
    for (const z of zonas) {
      if (!z.nombre) continue;
      if (String(z.estado || '') === 'pausada') zonasPausadas.push(z.nombre);
      else zonasActivas.push(z.nombre);
    }
  } catch (e) { /* sin zonas: listas vacías */ }
  return normalizarDatos({
    descuento_max_pct: descuento,
    zonas_activas: zonasActivas,
    zonas_pausadas: zonasPausadas,
    canales_habilitados: [...CANALES_TODOS],
    seguimiento: { toques_max: 3, espera_dias: 2 },
  }, null);
}

// ---- normalización / validación de los datos de una estrategia -----------
function listaNombres(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const x of v) {
    const s = String(x || '').trim().slice(0, 80);
    if (s && !out.some((o) => norm(o) === norm(s))) out.push(s);
  }
  return out.slice(0, 50);
}
function normalizarDatos(input, base) {
  const b = base || {};
  const src = input || {};
  const segSrc = (src.seguimiento && typeof src.seguimiento === 'object') ? src.seguimiento : {};
  const segBase = (b.seguimiento && typeof b.seguimiento === 'object') ? b.seguimiento : {};
  let desc = src.descuento_max_pct !== undefined ? Number(src.descuento_max_pct) : Number(b.descuento_max_pct);
  if (!Number.isFinite(desc)) desc = 10;
  desc = Math.max(0, Math.min(50, Math.round(desc)));
  let canales = src.canales_habilitados !== undefined ? listaNombres(src.canales_habilitados).map((c) => norm(c)) : listaNombres(b.canales_habilitados).map((c) => norm(c));
  canales = canales.filter((c) => CANALES_TODOS.includes(c));
  if (!canales.length) canales = [...CANALES_TODOS];
  let toques = segSrc.toques_max !== undefined ? Number(segSrc.toques_max) : Number(segBase.toques_max);
  if (!Number.isFinite(toques)) toques = 3;
  toques = Math.max(1, Math.min(10, Math.round(toques)));
  let espera = segSrc.espera_dias !== undefined ? Number(segSrc.espera_dias) : Number(segBase.espera_dias);
  if (!Number.isFinite(espera)) espera = 2;
  espera = Math.max(0, Math.min(30, Math.round(espera)));
  const pausadas = listaNombres(src.zonas_pausadas !== undefined ? src.zonas_pausadas : b.zonas_pausadas);
  const pausNorm = new Set(pausadas.map(norm));
  const activas = listaNombres(src.zonas_activas !== undefined ? src.zonas_activas : b.zonas_activas)
    .filter((z) => !pausNorm.has(norm(z)));
  return {
    descuento_max_pct: desc,
    zonas_activas: activas,
    zonas_pausadas: pausadas,
    canales_habilitados: canales,
    seguimiento: { toques_max: toques, espera_dias: espera },
  };
}

// Fusiona un cambio parcial sobre unos datos base (lo que usa proponer y
// el chat): el cambio trae solo los campos tocados; el resto hereda.
function aplicarCambio(base, cambio) {
  const c = cambio || {};
  const datos = normalizarDatos(base, null);
  if (c.descuento_max_pct !== undefined) datos.descuento_max_pct = c.descuento_max_pct;
  if (c.zona_pausar) {
    const nombre = String(c.zona_pausar).trim();
    if (nombre) {
      if (!datos.zonas_pausadas.some((z) => norm(z) === norm(nombre))) datos.zonas_pausadas.push(nombre);
      datos.zonas_activas = datos.zonas_activas.filter((z) => norm(z) !== norm(nombre));
    }
  }
  if (c.zona_reactivar) {
    const nombre = String(c.zona_reactivar).trim();
    if (nombre) {
      datos.zonas_pausadas = datos.zonas_pausadas.filter((z) => norm(z) !== norm(nombre));
      if (!datos.zonas_activas.some((z) => norm(z) === norm(nombre))) datos.zonas_activas.push(nombre);
    }
  }
  if (Array.isArray(c.canales_habilitados)) datos.canales_habilitados = c.canales_habilitados;
  if (c.canal_quitar) datos.canales_habilitados = datos.canales_habilitados.filter((x) => norm(x) !== norm(c.canal_quitar));
  if (c.canal_agregar && !datos.canales_habilitados.some((x) => norm(x) === norm(c.canal_agregar))) datos.canales_habilitados.push(norm(c.canal_agregar));
  if (c.seguimiento && typeof c.seguimiento === 'object') {
    datos.seguimiento = { ...datos.seguimiento, ...c.seguimiento };
  }
  return normalizarDatos(datos, null);
}

// ---- lectura de la vigente / historial ------------------------------------
function obtenerVigente(db, userId) {
  ensureSchema(db);
  const row = db.prepare('SELECT * FROM venty_estrategia_versiones WHERE user_id = ? ORDER BY version DESC LIMIT 1').get(userId);
  if (!row) {
    return { version: 0, es_default: true, origen: 'sistema', created_at: '', datos: defaultsDesdeRegistro(db, userId) };
  }
  return {
    version: Number(row.version) || 0,
    es_default: false,
    origen: row.origen || 'sistema',
    created_at: row.created_at || '',
    datos: normalizarDatos(safeJson(row.datos_json, {}), defaultsDesdeRegistro(db, userId)),
  };
}

function listarHistorial(db, userId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM venty_estrategia_versiones WHERE user_id = ? ORDER BY version DESC').all(userId)
    .map((r) => ({ version: Number(r.version) || 0, origen: r.origen || 'sistema', created_at: r.created_at || '', datos: normalizarDatos(safeJson(r.datos_json, {}), null) }));
}

function descuentoMax(db, userId) {
  return obtenerVigente(db, userId).datos.descuento_max_pct;
}
function zonaPausada(db, userId, nombreZona) {
  if (!nombreZona) return false;
  const d = obtenerVigente(db, userId).datos;
  return d.zonas_pausadas.some((z) => norm(z) === norm(nombreZona));
}
function canalHabilitado(db, userId, canal) {
  const d = obtenerVigente(db, userId).datos;
  return d.canales_habilitados.some((c) => norm(c) === norm(canal));
}

// ---- pendiente: propuesta / desambiguación --------------------------------
// tipo 'propuesta': datos_json = datos COMPLETOS propuestos (aplicarCambio
// ya fusionado); confirmar la convierte en versión.
// tipo 'ambiguo' / 'esperando_partida': datos_json = el CAMBIO parseado
// (parcial), esperando el toque que decide el alcance (D16).
function guardarPendiente(db, userId, datos, opts) {
  ensureSchema(db);
  const o = opts || {};
  const origen = ORIGENES.includes(o.origen) ? o.origen : 'chat';
  const tipo = ['propuesta', 'ambiguo', 'esperando_partida'].includes(o.tipo) ? o.tipo : 'propuesta';
  db.prepare(`INSERT INTO venty_estrategia_pendiente (user_id, datos_json, origen, texto_original, tipo, created_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET datos_json = excluded.datos_json, origen = excluded.origen,
      texto_original = excluded.texto_original, tipo = excluded.tipo, created_at = excluded.created_at`)
    .run(userId, JSON.stringify(datos || {}), origen, String(o.texto_original || '').slice(0, 500), tipo, ahoraIso());
  return leerPendiente(db, userId);
}

function leerPendiente(db, userId) {
  ensureSchema(db);
  const row = db.prepare('SELECT * FROM venty_estrategia_pendiente WHERE user_id = ?').get(userId);
  if (!row) return null;
  return {
    datos: safeJson(row.datos_json, {}),
    origen: row.origen || 'chat',
    texto_original: row.texto_original || '',
    tipo: row.tipo || 'propuesta',
    created_at: row.created_at || '',
  };
}

function borrarPendiente(db, userId) {
  ensureSchema(db);
  db.prepare('DELETE FROM venty_estrategia_pendiente WHERE user_id = ?').run(userId);
}

// Propone un cambio sobre la vigente: fusiona, guarda el pendiente como
// 'propuesta' y devuelve vigente + propuesta para mostrar «así queda».
// NO crea ninguna versión.
function proponer(db, userId, cambio, opts) {
  ensureSchema(db);
  const vigente = obtenerVigente(db, userId);
  const propuesta = aplicarCambio(vigente.datos, cambio || {});
  const pendiente = guardarPendiente(db, userId, propuesta, { ...(opts || {}), tipo: 'propuesta' });
  return { ok: true, vigente, propuesta, pendiente };
}

// Confirma el pendiente 'propuesta': recién acá nace la versión nueva
// (número = máximo + 1, con fecha y origen). Sin pendiente de propuesta
// no confirma nada.
function confirmarPendiente(db, userId, opts) {
  ensureSchema(db);
  const p = leerPendiente(db, userId);
  if (!p) return { ok: false, error: 'sin_pendiente' };
  if (p.tipo !== 'propuesta') return { ok: false, error: 'pendiente_no_es_propuesta', tipo: p.tipo };
  const o = opts || {};
  const origen = ORIGENES.includes(o.origen) ? o.origen : (ORIGENES.includes(p.origen) ? p.origen : 'chat');
  const datos = normalizarDatos(p.datos, defaultsDesdeRegistro(db, userId));
  const mx = db.prepare('SELECT COALESCE(MAX(version),0) m FROM venty_estrategia_versiones WHERE user_id = ?').get(userId);
  const version = (Number(mx && mx.m) || 0) + 1;
  const created = ahoraIso();
  db.prepare('INSERT INTO venty_estrategia_versiones (user_id, version, datos_json, origen, created_at) VALUES (?,?,?,?,?)')
    .run(userId, version, JSON.stringify(datos), origen, created);
  borrarPendiente(db, userId);
  try {
    db.prepare(`INSERT INTO venty_eventos (user_id, tipo, partida_id, datos_json, created_at) VALUES (?,?,?,?,?)`)
      .run(userId, 'estrategia_version', null, JSON.stringify({ version, origen }), created);
  } catch (e) { /* el evento es registro, nunca freno */ }
  return { ok: true, version, origen, created_at: created, datos };
}

function descartarPendiente(db, userId) {
  const p = leerPendiente(db, userId);
  if (!p) return { ok: false, error: 'sin_pendiente' };
  borrarPendiente(db, userId);
  return { ok: true, descartado: true };
}

// ---- descripción simple (voz de venty: minúsculas, sin ¿/¡) ---------------
function describirDatos(datos) {
  const d = normalizarDatos(datos, null);
  const zonasA = d.zonas_activas.length ? d.zonas_activas.join(', ') : 'ninguna cargada';
  const zonasP = d.zonas_pausadas.length ? d.zonas_pausadas.join(', ') : 'ninguna';
  return `descuento máximo ${d.descuento_max_pct}% · zonas activas: ${zonasA} · zonas pausadas: ${zonasP} · canales: ${d.canales_habilitados.join(', ')} · seguimiento: ${d.seguimiento.toques_max} toques cada ${d.seguimiento.espera_dias} días`;
}

module.exports = {
  CANALES_TODOS, ORIGENES,
  ensureSchema, defaultsDesdeRegistro, normalizarDatos, aplicarCambio,
  obtenerVigente, listarHistorial, descuentoMax, zonaPausada, canalHabilitado,
  guardarPendiente, leerPendiente, borrarPendiente,
  proponer, confirmarPendiente, descartarPendiente,
  describirDatos, ahoraIso, norm,
};
