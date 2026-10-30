// gesty-puntos.js — PUNTOS DE TUS CLIENTES (undécima tanda, mejora 86/90).
// Programa de fidelidad: compran, suman, canjean.
//
// · La regla vive en el fundamento (grupo 'puntos'): {pesos_por_punto
//   (cuántos $ dan 1 punto), vencimiento_dias (0 = no vencen)}.
//   Sin regla no hay puntos: nunca un canje inventado.
// · Solo puntos de compras REALES: acumular exige una factura real
//   de la cuenta (getFactura); la misma factura no suma dos veces.
// · El vencimiento se fija en cada acumulación con la regla vigente
//   en ese momento: cambios posteriores no reescriben historia.
// · Canjear = tarjeta 'canje-puntos' en Bandeja (el OK del dueño):
//   el ejecutor descuenta solo si el saldo alcanza en ese momento.
// · El saldo nunca baja de cero y nunca se regalan puntos.
'use strict';
const gesty = require('./gesty.js');
const facturacion = require('./gesty-facturacion.js');

function fail(m) { throw new Error(m); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function sumarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(dias));
  return d.toISOString().slice(0, 10);
}

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  facturacion.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_puntos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    cliente_nombre TEXT NOT NULL, tipo TEXT NOT NULL,
    puntos INTEGER NOT NULL, factura_id INTEGER, beneficio TEXT NOT NULL DEFAULT '',
    fecha TEXT NOT NULL, vence TEXT NOT NULL DEFAULT '',
    tarjeta_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  _esquemas.add(db);
}

function getRegla(db, userId) {
  const fila = gesty.getData(db, userId, { grupo: 'puntos' }).find((x) => x.campo === 'regla');
  return fila && fila.valor ? fila.valor : null;
}

function setRegla(db, userId, regla) {
  ensureSchema(db);
  const r = regla || {};
  const ppp = Number(r.pesos_por_punto);
  if (!Number.isFinite(ppp) || ppp <= 0) fail('La regla de puntos lleva cuántos $ dan 1 punto.');
  const ven = Number(r.vencimiento_dias || 0);
  if (!Number.isFinite(ven) || ven < 0) fail('El vencimiento de puntos lleva días mayor o igual a cero.');
  const final = { pesos_por_punto: ppp, vencimiento_dias: ven };
  gesty.setData(db, userId, { grupo: 'puntos', campo: 'regla', valor: final, origen: 'dueno', origen_ref: 'puntos-regla', cargado_por: 'dueno' });
  return final;
}

function saldoDe(db, userId, clienteNombre, hoy) {
  ensureSchema(db);
  const h = hoy || '9999-12-31';
  const rows = db.prepare(`SELECT tipo, puntos, vence FROM gesty_puntos WHERE user_id = ? AND cliente_nombre = ?`).all(userId, clienteNombre);
  let saldo = 0;
  for (const r of rows) {
    if (r.tipo === 'acumulacion' && (r.vence === '' || r.vence >= h)) saldo += Number(r.puntos);
    if (r.tipo === 'canje') saldo -= Number(r.puntos);
  }
  return saldo;
}

function acumular(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const regla = getRegla(db, userId);
  if (!regla) fail('Sin regla de puntos no se acumula: definí cuántos $ dan 1 punto.');
  const f = facturacion.getFactura(db, userId, d.factura_id);
  if (!f) fail('Los puntos son de una compra real: la factura no es de esta cuenta.');
  const cliente = String(d.cliente_nombre || (f.cliente && f.cliente.nombre) || '').trim();
  if (!cliente) fail('La acumulación lleva su cliente.');
  const ya = db.prepare(`SELECT id FROM gesty_puntos WHERE user_id = ? AND tipo = 'acumulacion' AND factura_id = ?`).get(userId, f.id);
  if (ya) fail('Esa factura ya sumó sus puntos.');
  const fecha = String(d.fecha || f.fecha || '');
  if (!esFecha(fecha)) fail('La acumulación lleva su fecha (AAAA-MM-DD).');
  const puntos = Math.floor(Number(f.total) / Number(regla.pesos_por_punto));
  if (puntos <= 0) fail(`Esa compra no alcanza para 1 punto (regla: ${regla.pesos_por_punto} $ por punto).`);
  const vence = regla.vencimiento_dias > 0 ? sumarDias(fecha, regla.vencimiento_dias) : '';
  const info = db.prepare(`INSERT INTO gesty_puntos (user_id, cliente_nombre, tipo, puntos, factura_id, fecha, vence)
    VALUES (?,?,?,?,?,?,?)`).run(userId, cliente, 'acumulacion', puntos, f.id, fecha, vence);
  gesty.recordEvent(db, userId, { actor: 'gesty', entidad_tipo: 'puntos', entidad_id: String(info.lastInsertRowid),
    tipo_evento: 'puntos-acumulados',
    resumen: `${cliente} sumó ${puntos} puntos por su compra.`,
    payload: { cliente_nombre: cliente, puntos, factura_id: f.id, vence } });
  return { id: Number(info.lastInsertRowid), cliente_nombre: cliente, puntos, factura_id: f.id, fecha, vence, saldo: saldoDe(db, userId, cliente, fecha) };
}

function pedirCanje(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const cliente = String(d.cliente_nombre || '').trim();
  if (!cliente) fail('El canje lleva su cliente.');
  const puntos = Number(d.puntos);
  if (!Number.isFinite(puntos) || puntos <= 0 || !Number.isInteger(puntos)) fail('El canje lleva sus puntos (entero mayor a cero).');
  const beneficio = String(d.beneficio || '').trim();
  if (!beneficio) fail('El canje lleva su beneficio.');
  const fecha = String(d.fecha || '');
  if (fecha && !esFecha(fecha)) fail('La fecha del canje lleva formato (AAAA-MM-DD).');
  const hoy = fecha || new Date().toISOString().slice(0, 10);
  if (saldoDe(db, userId, cliente, hoy) < puntos) fail(`Saldo insuficiente para canjear: ${cliente} tiene ${saldoDe(db, userId, cliente, hoy)} puntos.`);
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'canje-puntos',
    titulo: `Canje de ${puntos} puntos de ${cliente}: ${beneficio}`,
    detalle: { cliente_nombre: cliente, puntos, beneficio, fecha: hoy },
    creado_por: 'gesty',
  });
  gesty.recordEvent(db, userId, { actor: 'gesty', entidad_tipo: 'puntos', entidad_id: String(tarjeta.id),
    tipo_evento: 'puntos-canje-pedido',
    resumen: `Canje pedido: ${cliente} quiere ${beneficio} por ${puntos} puntos.`,
    payload: { cliente_nombre: cliente, puntos, beneficio, tarjeta_id: tarjeta.id } });
  return { tarjeta, cliente_nombre: cliente, puntos, beneficio, saldo_actual: saldoDe(db, userId, cliente, hoy) };
}

function ejecutarCanje(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  const cliente = String(d.cliente_nombre || '');
  const puntos = Number(d.puntos);
  if (!cliente || !Number.isFinite(puntos) || puntos <= 0) return { ok: false, motivo: 'La tarjeta no trae un canje válido.' };
  const hoy = String(d.fecha || new Date().toISOString().slice(0, 10));
  if (saldoDe(db, userId, cliente, hoy) < puntos) return { ok: false, motivo: `Saldo insuficiente: ${cliente} ya no tiene ${puntos} puntos.` };
  db.prepare(`INSERT INTO gesty_puntos (user_id, cliente_nombre, tipo, puntos, beneficio, fecha, tarjeta_id)
    VALUES (?,?,?,?,?,?,?)`).run(userId, cliente, 'canje', puntos, String(d.beneficio || ''), hoy, card.id);
  return { ok: true, evento: 'puntos-canje-aprobado', entidad_tipo: 'puntos', entidad_id: String(card.id),
    resumen: `${cliente} canjeó ${puntos} puntos por ${d.beneficio}.`,
    payload: { cliente_nombre: cliente, puntos, beneficio: String(d.beneficio || ''), saldo: saldoDe(db, userId, cliente, hoy) } };
}
try { gesty.registerExecutor('canje-puntos', ejecutarCanje); } catch (e) { /* ya registrado */ }

function listMovimientos(db, userId, clienteNombre) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_puntos WHERE user_id = ? AND cliente_nombre = ? ORDER BY id ASC').all(userId, clienteNombre);
}

module.exports = { ensureSchema, getRegla, setRegla, acumular, saldoDe, pedirCanje, listMovimientos };
