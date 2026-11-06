// venty-gobernador.js — VENTY-CONECTAR-4: cupos por canal y por día por negocio.
// El gobernador es la única puerta antes de cada envío real de Venty: se
// consulta ANTES de mandar y se registra el consumo DESPUÉS de mandar (o en
// la misma llamada, cuando el envío es local y síncrono). Fail-closed: sin
// cupo, sin permiso, canal desconocido o negocio en pausa → no sale nada.
// Los topes son por negocio y por día calendario (zona de la cuenta). El
// dueño puede bajarlos (nunca subirlos por encima del tope de seguridad del
// canal). El canal web no envía: no tiene cupo (tope 0, no aplica).
//
// Topes por defecto (conservadores, para no quemar cuentas nuevas):
//   whatsapp 20/día · instagram 20/día · email 50/día · web —
// Tope de seguridad (techo absoluto por canal, no superable por el dueño):
//   whatsapp 100 · instagram 100 · email 200.
// La lista de leads compartida (venty.js) es la que evita escribir dos
// veces al mismo prospecto; el gobernador evita pasarse del cupo del día.
'use strict';

const CANALES_ENVIO = ['whatsapp', 'instagram', 'email'];
const TOPES_DEFAULT = { whatsapp: 20, instagram: 20, email: 50 };
const TOPES_MAX = { whatsapp: 100, instagram: 100, email: 200 };
const TZ_CUENTA = 'America/Argentina/Buenos_Aires';

function fail(m) { const e = new Error(m); e.ventyGobernador = true; throw e; }
function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function hoyYmd(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz || TZ_CUENTA });
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_gobernador_consumo (
    user_id INTEGER NOT NULL,
    canal TEXT NOT NULL,
    fecha TEXT NOT NULL,
    usados INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, canal, fecha)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_gobernador_topesc (
    user_id INTEGER NOT NULL,
    canal TEXT NOT NULL,
    tope INTEGER NOT NULL,
    actualizado_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, canal)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_gobernador_registro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    canal TEXT NOT NULL,
    fecha TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    motivo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_gob_reg ON venty_gobernador_registro(user_id, canal, fecha, id)');
}

function topeDe(db, userId, canal) {
  ensureSchema(db);
  if (!CANALES_ENVIO.includes(canal)) return 0;
  const row = db.prepare('SELECT tope FROM venty_gobernador_topesc WHERE user_id = ? AND canal = ?').get(userId, canal);
  if (row) return Math.max(0, Number(row.tope) || 0);
  return TOPES_DEFAULT[canal];
}

// El dueño puede BAJAR el tope (nunca subirlo por encima del techo).
function setTope(db, userId, canal, tope) {
  ensureSchema(db);
  if (!CANALES_ENVIO.includes(canal)) fail('Canal sin cupo (la web no envía).');
  const n = Math.floor(Number(tope));
  if (!Number.isFinite(n) || n < 0) fail('Tope inválido.');
  if (n > TOPES_MAX[canal]) fail('Ese tope supera el techo de seguridad del canal (' + TOPES_MAX[canal] + '/día).');
  db.prepare(`INSERT INTO venty_gobernador_topesc (user_id, canal, tope, actualizado_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id, canal) DO UPDATE SET tope = excluded.tope, actualizado_at = excluded.actualizado_at`)
    .run(userId, canal, n, ahoraIso());
  return { canal, tope: n, techo: TOPES_MAX[canal] };
}

function usadosHoy(db, userId, canal, fecha) {
  ensureSchema(db);
  if (!CANALES_ENVIO.includes(canal)) return 0;
  const f = fecha || hoyYmd();
  const row = db.prepare('SELECT usados FROM venty_gobernador_consumo WHERE user_id = ? AND canal = ? AND fecha = ?').get(userId, canal, f);
  return row ? Number(row.usados) || 0 : 0;
}

// Consulta pura (no consume): ¿puede salir este envío hoy?
function consultar(db, userId, canal, cantidad) {
  ensureSchema(db);
  const n = cantidad === undefined ? 1 : Math.floor(Number(cantidad) || 0);
  if (!CANALES_ENVIO.includes(canal)) return { permitido: false, motivo: 'canal_sin_cupo', usados: 0, tope: 0, restante: 0 };
  if (n <= 0) return { permitido: false, motivo: 'cantidad_invalida', usados: usadosHoy(db, userId, canal), tope: topeDe(db, userId, canal), restante: 0 };
  const tope = topeDe(db, userId, canal);
  const usados = usadosHoy(db, userId, canal);
  const restante = Math.max(0, tope - usados);
  if (usados + n > tope) return { permitido: false, motivo: 'cupo_diario_agotado', usados, tope, restante };
  return { permitido: true, motivo: '', usados, tope, restante };
}

// Consulta + registro atómico del consumo: la puerta que usan los envíos
// reales. Si no hay cupo, no registra nada y devuelve permitido:false.
// El consumo se registra ANTES del envío para que dos envíos en paralelo
// no se pasen del cupo; si el envío falla, el llamador lo devuelve con
// devolverConsumo().
function pedirPermiso(db, userId, canal, cantidad, motivo) {
  const c = consultar(db, userId, canal, cantidad);
  if (!c.permitido) return { ...c, registrado: false };
  const n = cantidad === undefined ? 1 : Math.floor(Number(cantidad) || 1);
  const fecha = hoyYmd();
  db.prepare(`INSERT INTO venty_gobernador_consumo (user_id, canal, fecha, usados) VALUES (?,?,?,?)
    ON CONFLICT(user_id, canal, fecha) DO UPDATE SET usados = usados + excluded.usados`)
    .run(userId, canal, fecha, n);
  db.prepare(`INSERT INTO venty_gobernador_registro (user_id, canal, fecha, cantidad, motivo, created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, canal, fecha, n, String(motivo || '').slice(0, 200), ahoraIso());
  const usados = usadosHoy(db, userId, canal, fecha);
  const tope = topeDe(db, userId, canal);
  return { permitido: true, motivo: '', usados, tope, restante: Math.max(0, tope - usados), registrado: true };
}

// Devuelve consumo cuando el envío no salió (fallo del proveedor): el cupo
// no se quema por un intento que no llegó. Nunca baja de cero.
function devolverConsumo(db, userId, canal, cantidad, motivo) {
  ensureSchema(db);
  if (!CANALES_ENVIO.includes(canal)) return { devuelto: 0 };
  const n = Math.max(0, Math.floor(Number(cantidad) || 0));
  if (!n) return { devuelto: 0 };
  const fecha = hoyYmd();
  const usados = usadosHoy(db, userId, canal, fecha);
  const dev = Math.min(n, usados);
  if (dev > 0) {
    db.prepare('UPDATE venty_gobernador_consumo SET usados = usados - ? WHERE user_id = ? AND canal = ? AND fecha = ?')
      .run(dev, userId, canal, fecha);
    db.prepare(`INSERT INTO venty_gobernador_registro (user_id, canal, fecha, cantidad, motivo, created_at) VALUES (?,?,?,?,?,?)`)
      .run(userId, canal, fecha, -dev, 'devolución: ' + String(motivo || '').slice(0, 160), ahoraIso());
  }
  return { devuelto: dev };
}

function resumenDia(db, userId, fecha) {
  ensureSchema(db);
  const f = fecha || hoyYmd();
  return CANALES_ENVIO.map((canal) => {
    const tope = topeDe(db, userId, canal);
    const usados = usadosHoy(db, userId, canal, f);
    return { canal, fecha: f, usados, tope, restante: Math.max(0, tope - usados) };
  });
}

module.exports = {
  CANALES_ENVIO, TOPES_DEFAULT, TOPES_MAX, TZ_CUENTA,
  ensureSchema, topeDe, setTope, usadosHoy, consultar,
  pedirPermiso, devolverConsumo, resumenDia, hoyYmd,
};
