// gesty-contratos.js — CONTRATOS CON CLIENTES (décima tanda, mejora 75/82).
// Quién tiene contrato vigente, cuándo vence, renovación con
// alerta previa. DISTINTO de la carpeta legal: esos son los
// papeles del negocio; estos son los contratos con sus clientes.
//
// · Se registra con datos o con foto/PDF: el documento vive en
//   Papeles (G-03, la superficie de papeles) y el contrato guarda
//   su referencia (documento_ref). Nunca se exige el archivo: el
//   contrato con datos solos también vale.
// · La vigencia se evalúa por fecha (como las garantías): ningún
//   estado guardado que se vuelva viejo. Solo renovado y cancelado
//   son acciones guardadas.
// · El vencimiento alimenta el plan del día (gesty-plan-dia lee
//   proximosAVencer): la alerta previa es el alerta_dias del
//   dueño, no un número inventado.
'use strict';
const gesty = require('./gesty.js');

function fail(m) { throw new Error(m); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function addDias(iso, n) {
  const d = new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000);
  return d.toISOString().slice(0, 10);
}
function diasEntre(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_contratos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    cliente_nombre TEXT NOT NULL, cliente_cuit TEXT NOT NULL DEFAULT '',
    titulo TEXT NOT NULL, fecha_inicio TEXT NOT NULL, fecha_fin TEXT NOT NULL,
    monto REAL, moneda TEXT NOT NULL DEFAULT 'ARS',
    alerta_dias INTEGER NOT NULL DEFAULT 30, documento_ref TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'vigente', motivo_cancelacion TEXT NOT NULL DEFAULT '',
    renovado_de INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  _esquemas.add(db);
}

function parseRow(r, hoy) {
  const vigentePorFecha = r.fecha_fin >= hoy;
  const estado = r.estado === 'vigente' ? (vigentePorFecha ? 'vigente' : 'vencido') : r.estado;
  return {
    id: r.id, cliente: { nombre: r.cliente_nombre, cuit: r.cliente_cuit }, titulo: r.titulo,
    fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin, monto: r.monto, moneda: r.moneda,
    alerta_dias: r.alerta_dias, documento_ref: r.documento_ref, estado,
    dias_restantes: diasEntre(hoy, r.fecha_fin), renovado_de: r.renovado_de,
  };
}

function registrarContrato(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const cliente = String(d.cliente_nombre || (d.cliente && d.cliente.nombre) || '').trim();
  if (!cliente) fail('El contrato lleva su cliente.');
  const titulo = String(d.titulo || '').trim();
  if (!titulo) fail('El contrato lleva su título (qué cubre).');
  if (!esFecha(d.fecha_inicio) || !esFecha(d.fecha_fin)) fail('El contrato lleva inicio y fin (AAAA-MM-DD).');
  if (d.fecha_fin <= d.fecha_inicio) fail('El fin del contrato es posterior a su inicio.');
  const alerta = d.alerta_dias === undefined ? 30 : Number(d.alerta_dias);
  if (!Number.isInteger(alerta) || alerta < 0) fail('La alerta previa se carga en días (0 o más).');
  const info = db.prepare(`INSERT INTO gesty_contratos (user_id, cliente_nombre, cliente_cuit, titulo, fecha_inicio, fecha_fin,
    monto, moneda, alerta_dias, documento_ref) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    userId, cliente, String(d.cliente_cuit || (d.cliente && d.cliente.cuit) || ''), titulo,
    d.fecha_inicio, d.fecha_fin,
    d.monto === undefined || d.monto === null ? null : Number(d.monto),
    String(d.moneda || 'ARS').toUpperCase(), alerta, String(d.documento_ref || ''));
  gesty.recordEvent(db, userId, { actor: 'dueno', entidad_tipo: 'contrato', entidad_id: String(info.lastInsertRowid),
    tipo_evento: 'contrato-registrado', resumen: `Contrato «${titulo}» con ${cliente}, vence ${d.fecha_fin}.`,
    payload: { cliente, titulo, fecha_fin: d.fecha_fin } });
  return getContrato(db, userId, Number(info.lastInsertRowid));
}

function getContrato(db, userId, id, opts) {
  ensureSchema(db);
  const hoy = (opts && opts.hoy) || new Date().toISOString().slice(0, 10);
  const r = db.prepare('SELECT * FROM gesty_contratos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parseRow(r, hoy) : null;
}

function listarContratos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = o.hoy || new Date().toISOString().slice(0, 10);
  let out = db.prepare('SELECT * FROM gesty_contratos WHERE user_id = ? ORDER BY fecha_fin ASC').all(userId)
    .map((r) => parseRow(r, hoy));
  if (o.estado) out = out.filter((c) => c.estado === o.estado);
  if (o.cliente) out = out.filter((c) => c.cliente.nombre.toLowerCase().includes(String(o.cliente).toLowerCase()));
  return out;
}

function proximosAVencer(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = o.hoy || new Date().toISOString().slice(0, 10);
  return listarContratos(db, userId, { hoy }).filter((c) => {
    if (c.estado !== 'vigente') return false;
    const dias = o.dias !== undefined ? Number(o.dias) : c.alerta_dias;
    return c.dias_restantes >= 0 && c.dias_restantes <= dias;
  });
}

function alertasParaPlanDia(db, userId, opts) {
  const o = opts || {};
  const hoy = o.hoy || new Date().toISOString().slice(0, 10);
  return proximosAVencer(db, userId, { hoy, dias: o.dias }).map((c) => ({
    id: c.id, cliente: c.cliente.nombre, titulo: c.titulo, vence: c.fecha_fin, dias_restantes: c.dias_restantes,
  }));
}

function renovarContrato(db, userId, id, datos) {
  ensureSchema(db);
  const viejo = getContrato(db, userId, id);
  if (!viejo) fail('Ese contrato no es de esta cuenta.');
  if (viejo.estado === 'cancelado') fail('Un contrato cancelado no se renueva.');
  const d = datos || {};
  const nuevo = registrarContrato(db, userId, {
    cliente_nombre: viejo.cliente.nombre, cliente_cuit: viejo.cliente.cuit, titulo: viejo.titulo,
    fecha_inicio: d.fecha_inicio || addDias(viejo.fecha_fin, 1), fecha_fin: d.fecha_fin,
    monto: d.monto !== undefined ? d.monto : viejo.monto, moneda: viejo.moneda,
    alerta_dias: d.alerta_dias !== undefined ? d.alerta_dias : viejo.alerta_dias,
    documento_ref: d.documento_ref || viejo.documento_ref,
  });
  db.prepare('UPDATE gesty_contratos SET estado = ? WHERE id = ?').run('renovado', Number(id));
  db.prepare('UPDATE gesty_contratos SET renovado_de = ? WHERE id = ?').run(Number(id), nuevo.id);
  return getContrato(db, userId, nuevo.id);
}

function cancelarContrato(db, userId, id, motivo) {
  ensureSchema(db);
  const c = getContrato(db, userId, id);
  if (!c) fail('Ese contrato no es de esta cuenta.');
  if (!String(motivo || '').trim()) fail('Cancelar un contrato lleva su motivo.');
  db.prepare('UPDATE gesty_contratos SET estado = ?, motivo_cancelacion = ? WHERE id = ?').run('cancelado', String(motivo), Number(id));
  return getContrato(db, userId, id);
}

module.exports = { ensureSchema, registrarContrato, getContrato, listarContratos, proximosAVencer, alertasParaPlanDia, renovarContrato, cancelarContrato };
