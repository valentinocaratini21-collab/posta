'use strict';
/* test-posty-oficina.js — POSTY en la oficina (programa TestFlight).
 * Su flujo real: el motor genera la semana (acá: posteos reales en la
 * tabla posts, como los deja generateWeekDrafts) → la oficina la registra
 * como salida con recibo → Bandeja con la propuesta → el OK del dueño
 * registra la semana aceptada (gate de nivel) → el parte la trae.
 * Corre con: node test-posty-oficina.js
 */
const { DatabaseSync } = require('node:sqlite');
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }

const oficina = require('./oficina');
const niveles = require('./niveles');
const posty = require('./posty-oficina');
const fixture = require('./oficina-fixture');

function dbMemoria() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    plan TEXT DEFAULT 'trial', plan_status TEXT DEFAULT 'trial', lang TEXT DEFAULT 'es', created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  db.exec(`CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', category TEXT DEFAULT 'otro', tone TEXT DEFAULT 'canchero', description TEXT DEFAULT '', ig_username TEXT DEFAULT '', ig_connected INTEGER DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  db.exec(`CREATE TABLE settings (user_id INTEGER PRIMARY KEY, brand_colors TEXT DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, image_path TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', hashtags TEXT NOT NULL DEFAULT '', scheduled_at TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  oficina.init(db);
  posty.init(db);
  return db;
}

(async () => {
  section('P1 · Sin posteos todavía: la sync lo dice, no inventa');
  const db = dbMemoria();
  const seed = await oficina.seedCafeAroma(db, {});
  const uid = seed.user_id;
  let r = await posty.sincronizarSemana(db, uid);
  ok(r.semana === false && r.causa === 'sin_posteos_todavia', 'sin posteos no hay semana registrada');

  section('P2 · El motor generó: la oficina registra la salida con recibo');
  const ins = db.prepare("INSERT INTO posts (user_id, caption, status, scheduled_at) VALUES (?, ?, ?, datetime('now', '+1 day'))");
  ins.run(uid, 'Brunch Aroma para dos', 'scheduled');
  ins.run(uid, 'Flat white de la casa', 'scheduled');
  ins.run(uid, 'Medialunas recién horneadas', 'draft');
  ins.run(uid, 'Torta del día', 'draft');
  ins.run(uid, 'Café en grano 250 g', 'draft');
  r = await posty.sincronizarSemana(db, uid);
  ok(r.semana === true && r.conteo.total === 5, 'la semana se registra con su conteo real (5)');
  const parte0 = oficina.parteDePoder(db, uid, 'posty');
  ok(parte0.salidas.some((x) => x.tipo === 'semana' && x.recibo && x.recibo.posteos === 5), 'el parte de Posty trae la semana con su recibo');
  const resuelto = oficina.resolverRegistro(db, uid, r.salida);
  ok(!!resuelto, 'el registro_ref de la semana resuelve');
  r = await posty.sincronizarSemana(db, uid);
  ok(r.ya_registrada === true, 'segunda sync: idempotente, no duplica la salida');

  section('P3 · La Bandeja trae la semana y el OK la acepta (gate real)');
  const items = oficina.listarBandeja(db, uid, { soloPendientes: true });
  const sem = items.find((i) => i.poder === 'posty');
  ok(!!sem && /semana/i.test(sem.que), 'la Bandeja trae «Tu semana de Instagram está lista»');
  const chat = await oficina.responderChat(db, uid, '¿cómo viene mi semana?');
  ok(chat.poder === 'posty' && /5 posteos/.test(chat.reply), 'el chat deriva a Posty y responde desde los posteos reales');
  const acc = oficina.accionarBandeja(db, uid, sem.id, 'aceptar');
  ok(acc.ok === true && acc.detalle === 'semana_aceptada', 'el hook de Posty registra la semana aceptada');
  const ev = db.prepare("SELECT COUNT(*) AS n FROM oficina_nivel_eventos WHERE user_id = ? AND poder = 'posty' AND evento = 'semana_aceptada'").get(uid).n;
  ok(ev === 1, 'el evento semana_aceptada quedó en el motor de niveles');
  const nv = niveles.computarNivel(db, uid, 'posty', oficina.metricas(db, uid));
  ok(nv.nivel === 3, 'Posty queda L3 (L4 pide además piezas aceptadas de primera: la vara no se regala)');
  ok(nv.proximo_paso && nv.proximo_paso.length > 4, 'el próximo paso de Posty sigue visible');

  section('P4 · Diseño y crecimiento: capacidades de Posty, con su sombra declarada');
  const chatD = await oficina.responderChat(db, uid, '¿quién hace el diseño de mis piezas?');
  ok(chatD.poder === 'posty', 'el diseño lo responde Posty (su capacidad, no un poder separado)');
  const chatG = await oficina.responderChat(db, uid, '¿y el crecimiento con campañas?');
  ok(chatG.poder === 'posty' && /MODO SOMBRA/.test(chatG.reply), 'el crecimiento lo responde Posty con su rótulo MODO SOMBRA intacto');

  console.log(fails ? `\n✗ ${fails} fallas` : '\n✓ TODO VERDE');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
