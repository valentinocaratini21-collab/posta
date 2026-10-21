// test-tn-install.js — Instalación desde la Tienda de Aplicaciones sin
// sesión de Posty: pendiente firmada con vencimiento, claim de un solo
// uso, robo de tienda a un dueño anterior y limpieza de vencidas.
// (2026-10-20, homologación — app Partners ID 47715)
// Uso: node test-tn-install.js
'use strict';
process.env.TIENDANUBE_CLIENT_ID = process.env.TIENDANUBE_CLIENT_ID || '47715';
process.env.TIENDANUBE_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || 'test-secret-install';

const { DatabaseSync } = require('node:sqlite');
const tiendanube = require('./tiendanube.js');
const clientDigest = require('./client-digest.js');
const inst = require('./tn-install.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}
const SESSION = 'session-secret-de-prueba';

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT)`);
  db.prepare('INSERT INTO users (email) VALUES (?)').run('una@tienda.com'); // id 1
  db.prepare('INSERT INTO users (email) VALUES (?)').run('otra@tienda.com'); // id 2
  return db;
}

console.log('— pendiente: crear → resolver → info pública');
{
  const db = freshDb();
  const state = inst.createPendingInstall(db, {
    store_id: '1234567', store_name: 'Tienda Demo',
    access_token: 'tok_nuevo', scope: 'read_products,read_orders',
  }, SESSION);
  check('el state tiene 3 partes firmadas', state.split('.').length === 3);
  const row = inst.resolvePendingInstall(db, state, SESSION);
  check('resuelve a la fila con el token guardado', !!row && row.access_token === 'tok_nuevo' && row.store_id === '1234567');
  const info = inst.pendingStoreInfo(db, state, SESSION);
  check('info pública: solo nombre de la tienda', !!info && info.store_name === 'Tienda Demo' && !('access_token' in info));
  check('resolver NO consume (un login fallido no quema la instalación)', !!inst.resolvePendingInstall(db, state, SESSION));
}

console.log('— estados inválidos');
{
  const db = freshDb();
  const state = inst.createPendingInstall(db, { store_id: '1', access_token: 't' }, SESSION);
  const [id, ts] = state.split('.');
  check('firma alterada → null', inst.resolvePendingInstall(db, `${id}.${ts}.deadbeefdeadbeefdeadbeefdeadbeef`, SESSION) === null);
  check('otro secreto → null', inst.resolvePendingInstall(db, state, 'otro-secreto') === null);
  check('basura → null', inst.resolvePendingInstall(db, 'hola', SESSION) === null);
  check('vacío → null', inst.resolvePendingInstall(db, '', SESSION) === null);
  // Vencimiento: fila vieja con state firmado en su época.
  const oldId = 'abcdef0123456789abcdef01';
  const oldTs = Date.now() - 31 * 60 * 1000;
  db.prepare(`INSERT INTO tn_pending_installs (id, store_id, store_name, access_token, scope, created_at)
    VALUES (?, '9', '', 'tok_viejo', '', ?)`)
    .run(oldId, oldTs);
  const oldState = inst.signInstallState(oldId, oldTs, SESSION);
  check('state de hace 31 min → null (TTL 30 min)', inst.resolvePendingInstall(db, oldState, SESSION) === null);
  check('la fila vencida se borra al resolver', !db.prepare('SELECT 1 FROM tn_pending_installs WHERE id = ?').get(oldId));
}

console.log('— claim: empareja, consume y el token sirve para sync');
{
  const db = freshDb();
  const state = inst.createPendingInstall(db, {
    store_id: '1234567', store_name: 'Tienda Demo',
    access_token: 'tok_nuevo', scope: 'read_products',
  }, SESSION);
  const claimed = inst.claimPendingInstall(db, state, SESSION, 1);
  check('claim devuelve la tienda', !!claimed && claimed.store_id === '1234567');
  const conn = tiendanube.getConnection(db, 1);
  check('la conexión quedó guardada para el usuario', !!conn && conn.access_token === 'tok_nuevo' && conn.status === 'connected');
  check('segundo claim del mismo state → null (un solo uso)', inst.claimPendingInstall(db, state, SESSION, 2) === null);
  check('state vencido/inválido al claim → null', inst.claimPendingInstall(db, 'x.y.z', SESSION, 1) === null);
  check('sin usuario → null', inst.claimPendingInstall(db, state, SESSION, 0) === null);
}

console.log('— claim roba la tienda si otro usuario la tenía');
{
  const db = freshDb();
  tiendanube.saveConnection(db, 2, {
    store_id: '1234567', store_name: 'Tienda Demo', access_token: 'tok_viejo', scope: 'read_products',
  });
  const d = clientDigest.emptyDigest();
  d.connections = { tiendanube: { store_id: '1234567', star: { name: 'X', units_30d: 1 } } };
  clientDigest.saveDigest(db, 2, d);
  const state = inst.createPendingInstall(db, {
    store_id: '1234567', store_name: 'Tienda Demo', access_token: 'tok_nuevo', scope: 'read_products',
  }, SESSION);
  inst.claimPendingInstall(db, state, SESSION, 1);
  check('el dueño nuevo tiene la conexión', tiendanube.getConnection(db, 1).access_token === 'tok_nuevo');
  check('la conexión anterior se cortó', tiendanube.getConnection(db, 2) === null);
  const prev = clientDigest.getStoredDigest(db, 2);
  check('el bloque TN salió del digest anterior', !(prev && prev.connections && prev.connections.tiendanube));
}

console.log('— limpieza de vencidas');
{
  const db = freshDb();
  inst.ensurePendingTable(db);
  const now = Date.now();
  db.prepare('INSERT INTO tn_pending_installs (id, store_id, access_token, created_at) VALUES (?,?,?,?)')
    .run('vieja00000000000000000001', '1', 't', now - 40 * 60 * 1000);
  db.prepare('INSERT INTO tn_pending_installs (id, store_id, access_token, created_at) VALUES (?,?,?,?)')
    .run('nueva00000000000000000002', '2', 't', now);
  const n = inst.cleanupExpiredInstalls(db, now);
  check('borra solo las vencidas', n === 1);
  check('la fresca queda', !!db.prepare("SELECT 1 FROM tn_pending_installs WHERE id LIKE 'nueva%'").get());
}

console.log('— validación del formulario (espejo de /api/auth/register)');
{
  check('email inválido → error', inst.validateClaimBody({ email: 'no-es-email', password: '123456' }).ok === false);
  check('register: contraseña de 5 → error', inst.validateClaimBody({ email: 'a@b.com', password: '12345' }).ok === false);
  check('register: contraseña de 6 → ok', inst.validateClaimBody({ email: 'a@b.com', password: '123456' }).ok === true);
  check('login: sin exigencia de largo', inst.validateClaimBody({ mode: 'login', email: 'a@b.com', password: '123' }).ok === true);
  check('sin contraseña → error', inst.validateClaimBody({ email: 'a@b.com' }).ok === false);
  check('email se normaliza a minúsculas', inst.validateClaimBody({ email: '  A@B.COM ', password: '123456' }).email === 'a@b.com');
}

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
