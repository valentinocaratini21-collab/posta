// venty-conexiones.js — VENTY-CONECTAR-4: registro de conexión por negocio y canal.
// Un solo lugar donde el dueño conecta cada canal UNA vez: whatsapp,
// instagram, web (el sitio del negocio como fuente) y email (dirección de
// reenvío). Después Venty se ocupa del resto. Patrón gesty-conexiones.js.
//
// Reglas (no se negocian):
// · Secretos NUNCA en DB ni en texto: solo se guarda `credencial_ref`, el
//   nombre del handle en el almacenamiento seguro / env. Si llega un valor
//   que parece secreto en claro, se rechaza (fail-closed).
// · `cuenta_ref` es el identificador PÚBLICO de la cuenta (phone_number_id
//   de WhatsApp, ig user id, dominio): sirve para rutear webhooks entrantes.
//   No es un secreto, pero tampoco se muestra completo en la UI.
// · Estado honesto: ninguna conexión se declara «conectada» sin un fetch
//   exitoso (ultimo_fetch) y credencial presente. Sin permiso no hay fetch.
// · Una sola conexión activa por (negocio, canal): para cambiar de cuenta o
//   de credencial, primero se revoca. Nada de fusiones silenciosas.
// · La web no tiene secreto: su «conexión» es website_url en el fundamento
//   + un refresco exitoso con web-extract.js (lo hace venty-web.js).
// · Instagram: la conexión OAuth vive en instagram.js/settings (deuda vieja
//   en claro, NO replicada acá). Acá solo queda el registro de estado y el
//   ruteo del webhook por cuenta_ref.
// · Nada de esto conecta nada vivo por sí solo: «conectar» registra la
//   intención + la ref y deja el canal en pendiente / falta una acción hasta
//   que el paso de Meta / del dueño se complete (ver STATUS.md).
'use strict';

const CANALES = ['whatsapp', 'instagram', 'web', 'email'];
// Estados internos. En la UI se muestran en español:
// conectado → «Conectado», pendiente → «Pendiente»,
// falta_accion → «Falta una acción», revocada → «Revocada».
const ESTADOS = ['conectado', 'pendiente', 'falta_accion', 'revocada'];
const CAMPOS_SECRETO = ['secreto', 'token', 'clave', 'password', 'api_key', 'apikey', 'access_token', 'refresh_token', 'client_secret'];

let _vault = null;

function fail(m) { const e = new Error(m); e.ventyConexiones = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function configure(opts) {
  if (opts && opts.vault !== undefined) _vault = opts.vault;
  return { vault: !!_vault };
}

function vault() {
  if (_vault) return _vault;
  return { tiene: (ref) => !!ref && process.env[String(ref)] !== undefined && process.env[String(ref)] !== '' };
}

function credencialPresente(ref) {
  if (!ref) return false;
  try {
    const v = vault();
    if (typeof v.tiene === 'function') return !!v.tiene(ref);
    if (typeof v.get === 'function') { const g = v.get(ref); return g !== undefined && g !== null && g !== ''; }
  } catch (e) { return false; }
  return false;
}

// Un valor que parece secreto en claro (largo, con prefijo típico o con
// caracteres de token) se rechaza: acá solo viajan refs, nunca valores.
function pareceSecretoEnClaro(v) {
  const s = String(v || '');
  if (!s) return false;
  if (/^(EA[A-Za-z0-9]|ya29\.|sk-|xox[baprs]-|gho_|ghp_|Bearer\s)/.test(s)) return true;
  if (s.length >= 40 && /^[A-Za-z0-9_\-+/=]{40,}$/.test(s)) return true;
  return false;
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_conexiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    canal TEXT NOT NULL DEFAULT '',
    proveedor TEXT NOT NULL DEFAULT '',
    etiqueta TEXT NOT NULL DEFAULT '',
    credencial_ref TEXT NOT NULL DEFAULT '',
    cuenta_ref TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    ultimo_fetch TEXT NOT NULL DEFAULT '',
    ultimo_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, canal)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_conex_user ON venty_conexiones(user_id, canal, estado, id)');
}

function parseRow(r) {
  if (!r) return null;
  return {
    id: r.id, user_id: r.user_id, canal: r.canal, proveedor: r.proveedor || '',
    etiqueta: r.etiqueta || '', credencial_ref: r.credencial_ref || '',
    cuenta_ref: r.cuenta_ref || '', estado: r.estado,
    ultimo_fetch: r.ultimo_fetch || '', ultimo_error: r.ultimo_error || '',
    created_at: r.created_at || '', updated_at: r.updated_at || '',
  };
}

// Estado derivado, siempre honesto: «conectada» exige fetch exitoso y
// credencial presente (la web no tiene credencial: exige fetch + URL).
function estadoDerivado(db, userId, row) {
  let estado = row.estado;
  let credencial_presente = true;
  let nota = '';
  if (row.canal === 'web') {
    credencial_presente = true;
    if (estado === 'conectado' && !row.ultimo_fetch) { estado = 'falta_accion'; nota = 'falta refrescar el sitio para confirmar la conexión'; }
  } else {
    credencial_presente = credencialPresente(row.credencial_ref);
    if (estado === 'conectado' && (!row.ultimo_fetch || !credencial_presente)) {
      estado = 'falta_accion';
      nota = !row.ultimo_fetch ? 'falta confirmar la conexión' : 'falta la credencial';
    }
  }
  if (row.estado === 'revocada') { estado = 'revocada'; nota = 'revocada por el dueño'; }
  const viva = estado === 'conectado' && !!row.ultimo_fetch
    && (row.canal === 'web' || credencial_presente);
  return { ...row, estado, credencial_presente, viva, nota };
}

function listarConexiones(db, userId) {
  ensureSchema(db);
  const rows = db.prepare('SELECT * FROM venty_conexiones WHERE user_id = ? ORDER BY canal ASC').all(userId);
  const porCanal = {};
  for (const r of rows) { const d = estadoDerivado(db, userId, parseRow(r)); porCanal[d.canal] = d; }
  // Los 4 canales siempre se listan, aunque no tengan fila: sin fila es
  // «no conectado» (nunca se inventa una conexión).
  return CANALES.map((canal) => porCanal[canal] || {
    id: null, user_id: userId, canal, proveedor: '', etiqueta: '',
    credencial_ref: '', cuenta_ref: '', estado: 'pendiente',
    ultimo_fetch: '', ultimo_error: '', credencial_presente: false,
    viva: false, nota: 'todavía no conectado',
  });
}

function estadoCanal(db, userId, canal) {
  if (!CANALES.includes(canal)) fail('Canal desconocido.');
  const lista = listarConexiones(db, userId);
  return lista.find((c) => c.canal === canal);
}

// Resumen para GET /api/venty/estado: los 4 canales con su estado real.
// 'simulacion' se mantiene como canal aparte (modo prueba), no es conexión.
function resumenEstado(db, userId) {
  const lista = listarConexiones(db, userId);
  return lista.map((c) => ({
    canal: c.canal,
    estado: c.viva ? 'conectado' : (c.estado === 'revocada' ? 'revocado' : (c.id ? c.estado : 'no_conectado')),
    ultimo_fetch: c.ultimo_fetch || '',
    nota: c.nota || '',
  }));
}

// Iniciar una conexión: registra intención + ref. Nunca guarda secretos.
// opts: { proveedor, etiqueta, credencial_ref, cuenta_ref }.
// Sin credencial_ref (web, o canal que pide el paso de Meta después):
// queda en falta_accion con el motivo. Con ref presente pero sin valor en
// env/vault: queda en pendiente (falta completar el paso externo).
function iniciarConexion(db, userId, canal, opts) {
  ensureSchema(db);
  if (!CANALES.includes(canal)) fail('Canal desconocido.');
  const o = opts || {};
  for (const k of Object.keys(o)) {
    if (CAMPOS_SECRETO.includes(k.toLowerCase())) fail('Las credenciales no se guardan acá: pasá solo credencial_ref.');
  }
  const credencialRef = normTexto(o.credencial_ref);
  if (credencialRef && pareceSecretoEnClaro(credencialRef)) fail('Ese valor parece un secreto en claro: pasá solo el nombre de la referencia (credencial_ref).');
  const cuentaRef = normTexto(o.cuenta_ref).slice(0, 120);
  const etiqueta = normTexto(o.etiqueta).slice(0, 120);
  const proveedor = normTexto(o.proveedor).slice(0, 80);
  const existente = db.prepare('SELECT * FROM venty_conexiones WHERE user_id = ? AND canal = ?').get(userId, canal);
  if (existente && existente.estado !== 'revocada') fail('Ese canal ya tiene una conexión: primero revocá la actual.');
  const estado = !credencialRef && canal !== 'web' ? 'falta_accion'
    : (credencialRef && !credencialPresente(credencialRef) ? 'pendiente' : 'pendiente');
  const error = !credencialRef && canal !== 'web' ? 'falta la credencial: completá el paso de conexión' : '';
  const ahora = ahoraIso();
  if (existente) {
    db.prepare(`UPDATE venty_conexiones SET proveedor=?, etiqueta=?, credencial_ref=?, cuenta_ref=?, estado=?, ultimo_error=?, updated_at=? WHERE id=?`)
      .run(proveedor, etiqueta, credencialRef, cuentaRef, estado, error, ahora, existente.id);
    return estadoDerivado(db, userId, parseRow(db.prepare('SELECT * FROM venty_conexiones WHERE id = ?').get(existente.id)));
  }
  const r = db.prepare(`INSERT INTO venty_conexiones (user_id, canal, proveedor, etiqueta, credencial_ref, cuenta_ref, estado, ultimo_error, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(userId, canal, proveedor, etiqueta, credencialRef, cuentaRef, estado, error, ahora, ahora);
  return estadoDerivado(db, userId, parseRow(db.prepare('SELECT * FROM venty_conexiones WHERE id = ?').get(Number(r.lastInsertRowid))));
}

// Un fetch exitoso por el canal: marca ultimo_fetch. Solo el módulo dueño
// del canal lo llama tras verificar de verdad (nunca a ciegas). Si la fila
// estaba pendiente/falta_accion y hay credencial (o es web), pasa a conectado.
function marcarFetch(db, userId, canal, opts) {
  ensureSchema(db);
  if (!CANALES.includes(canal)) fail('Canal desconocido.');
  const o = opts || {};
  const row = db.prepare('SELECT * FROM venty_conexiones WHERE user_id = ? AND canal = ?').get(userId, canal);
  if (!row) fail('Ese canal todavía no tiene conexión registrada.');
  if (row.estado === 'revocada') fail('Esa conexión está revocada.');
  if (o.cuenta_ref) {
    db.prepare('UPDATE venty_conexiones SET cuenta_ref = ? WHERE id = ?').run(normTexto(o.cuenta_ref).slice(0, 120), row.id);
  }
  const credOk = canal === 'web' || credencialPresente(row.credencial_ref);
  const nuevoEstado = credOk ? 'conectado' : 'falta_accion';
  db.prepare(`UPDATE venty_conexiones SET estado=?, ultimo_fetch=?, ultimo_error='', updated_at=? WHERE id=?`)
    .run(nuevoEstado, ahoraIso(), ahoraIso(), row.id);
  return estadoDerivado(db, userId, parseRow(db.prepare('SELECT * FROM venty_conexiones WHERE id = ?').get(row.id)));
}

function marcarFaltaAccion(db, userId, canal, motivo) {
  ensureSchema(db);
  if (!CANALES.includes(canal)) fail('Canal desconocido.');
  const row = db.prepare('SELECT * FROM venty_conexiones WHERE user_id = ? AND canal = ?').get(userId, canal);
  if (!row) fail('Ese canal todavía no tiene conexión registrada.');
  if (row.estado === 'revocada') return estadoDerivado(db, userId, parseRow(row));
  db.prepare(`UPDATE venty_conexiones SET estado='falta_accion', ultimo_error=?, updated_at=? WHERE id=?`)
    .run(normTexto(motivo).slice(0, 300), ahoraIso(), row.id);
  return estadoDerivado(db, userId, parseRow(db.prepare('SELECT * FROM venty_conexiones WHERE id = ?').get(row.id)));
}

function marcarError(db, userId, canal, motivo) {
  ensureSchema(db);
  const row = db.prepare('SELECT * FROM venty_conexiones WHERE user_id = ? AND canal = ?').get(userId, canal);
  if (!row) return null;
  db.prepare(`UPDATE venty_conexiones SET ultimo_error=?, updated_at=? WHERE id=?`)
    .run(normTexto(motivo).slice(0, 300), ahoraIso(), row.id);
  return estadoDerivado(db, userId, parseRow(db.prepare('SELECT * FROM venty_conexiones WHERE id = ?').get(row.id)));
}

// Revocar: la credencial_ref queda registrada pero sin efecto (el estado
// manda: revocada nunca es viva). Para cambiar de cuenta, revocar y volver
// a iniciar. No borra el historial: la fila queda como registro.
function revocarConexion(db, userId, canal) {
  ensureSchema(db);
  if (!CANALES.includes(canal)) fail('Canal desconocido.');
  const row = db.prepare('SELECT * FROM venty_conexiones WHERE user_id = ? AND canal = ?').get(userId, canal);
  if (!row) fail('Ese canal todavía no tiene conexión registrada.');
  db.prepare(`UPDATE venty_conexiones SET estado='revocada', updated_at=? WHERE id=?`).run(ahoraIso(), row.id);
  return estadoDerivado(db, userId, parseRow(db.prepare('SELECT * FROM venty_conexiones WHERE id = ?').get(row.id)));
}

// Ruteo de webhooks entrantes: por cuenta_ref pública (phone_number_id de
// WhatsApp, ig user id de Instagram) se resuelve el dueño. Sin match: null
// (el webhook ignora lo desconocido, nunca inventa un dueño).
function resolverDuenoPorCuenta(db, canal, cuentaRef) {
  ensureSchema(db);
  if (!CANALES.includes(canal) || !cuentaRef) return null;
  const row = db.prepare(`SELECT user_id FROM venty_conexiones WHERE canal = ? AND cuenta_ref = ? AND estado <> 'revocada' LIMIT 1`)
    .get(canal, String(cuentaRef));
  return row ? Number(row.user_id) : null;
}

module.exports = {
  CANALES, ESTADOS, configure, credencialPresente, pareceSecretoEnClaro,
  ensureSchema, listarConexiones, estadoCanal, resumenEstado,
  iniciarConexion, marcarFetch, marcarFaltaAccion, marcarError,
  revocarConexion, resolverDuenoPorCuenta,
};
