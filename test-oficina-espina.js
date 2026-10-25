'use strict';
/* test-oficina-espina.js — ESPINA BAMBOOTY (programa TestFlight, Día 1).
 * Parte A: unidades con DB en memoria — niveles (solo hechos, nunca baja),
 *   fundamento Café Aroma (seed idempotente), Bandeja durable, partes con
 *   la forma del contrato de Bossty (ausencia NOMBRADA), política de push
 *   (motivos cerrados, guardas Talenty/Growty, topes, agrupado, prefs) y
 *   el chat que rutea desde los registros.
 * Parte B: E2E — bootea el servidor real con DATA_DIR temporal: seed por
 *   la puerta admin, login de la cuenta fixture, /api/auth/me con
 *   bambooty_shell, estado/bandeja/partes por HTTP, y una cuenta común
 *   SIN el shell (la web sigue siendo Posty).
 * Corre con: node test-oficina-espina.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const niveles = require('./niveles');
const oficina = require('./oficina');
const pushOf = require('./push-oficina');
const fixture = require('./oficina-fixture');

function dbMemoria() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    plan TEXT DEFAULT 'trial', plan_status TEXT DEFAULT 'trial', lang TEXT DEFAULT 'es', created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  db.exec(`CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', category TEXT DEFAULT 'otro', tone TEXT DEFAULT 'canchero', description TEXT DEFAULT '', ig_username TEXT DEFAULT '', ig_connected INTEGER DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  db.exec(`CREATE TABLE settings (user_id INTEGER PRIMARY KEY, brand_colors TEXT DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  oficina.init(db);
  return db;
}

(async () => {
  section('A1 · Seed de Café Aroma: fundamento completo, idempotente');
  const db = dbMemoria();
  const seed = await oficina.seedCafeAroma(db, { password: 'CafeAroma-TestFlight-2026!' });
  const uid = seed.user_id;
  ok(seed.creado === true, 'la cuenta fixture se crea');
  const fund = oficina.fundamentoCompleto(db, uid);
  ok(fund.total === fixture.FUNDAMENTO.length, `fundamento completo: ${fund.total}/${fixture.FUNDAMENTO.length} hechos`);
  const seed2 = await oficina.seedCafeAroma(db, {});
  ok(seed2.fundamento_nuevos === 0 && fund.total === fixture.FUNDAMENTO.length, 'segundo seed: 0 hechos nuevos (dedupe por clave)');
  const u = db.prepare('SELECT bambooty_shell, plan, plan_status FROM users WHERE id = ?').get(uid);
  ok(u.bambooty_shell === 1 && u.plan_status === 'active', 'cuenta fixture con shell activo y plan activo');

  section('A2 · Niveles tras la carga: solo hechos reales');
  const nv = (p) => niveles.computarNivel(db, uid, p, oficina.metricas(db, uid));
  ok(nv('oficina').nivel === 2 && nv('oficina').nombre_nivel === 'Conociendo tu mundo', 'oficina L2 por el fundamento cargado');
  for (const p of ['posty', 'gesty', 'venty', 'atenty', 'desy', 'bossty']) {
    ok(nv(p).nivel === 2, `${p} L2: su lista de lectura quedó cubierta`);
  }
  ok(nv('talenty').nivel === 1, 'talenty L1: su compartimento sellado NO se siembra en la capa compartida');
  ok(nv('growty').nivel === 1, 'growty L1: todavía sin fuente leída (su flujo es del viernes)');
  ok(nv('posty').proximo_paso && nv('posty').proximo_paso.length > 4, 'el próximo paso siempre visible (Posty)');
  const antes = nv('posty').nivel;
  niveles.registrarEvento(db, uid, { poder: 'posty', evento: 'fundamento_leido', hecho: 'relectura' }, oficina.metricas(db, uid));
  ok(nv('posty').nivel >= antes, 'el nivel nunca baja');

  section('A3 · Bandeja: la primera decisión del dueño, durable');
  let items = oficina.listarBandeja(db, uid, { soloPendientes: true });
  ok(items.length === 1 && /fundamento/i.test(items[0].que), 'la Bandeja nace con UN ítem genuino: confirmar el fundamento');
  ok(items[0].nombre === 'Bambooty' && !!items[0].color, 'el ítem trae la identidad de su poder');
  const acc = oficina.accionarBandeja(db, uid, items[0].id, 'aceptar');
  ok(acc.ok === true, 'aceptar funciona');
  items = oficina.listarBandeja(db, uid, { soloPendientes: true });
  ok(items.length === 0, 'la Bandeja queda vacía tras resolver');
  const acc2 = oficina.accionarBandeja(db, uid, acc.item.id, 'aceptar');
  ok(acc2.ok === false, 'una decisión resuelta no se resuelve dos veces');
  const evDec = db.prepare("SELECT COUNT(*) AS n FROM oficina_nivel_eventos WHERE user_id = ? AND poder = 'oficina' AND evento = 'decision_dueno'").get(uid).n;
  ok(evDec === 1, 'la decisión quedó como evento de nivel de la oficina');

  section('A4 · Un flujo corre: salida registrada, subida real, parte con forma de contrato');
  const sal = oficina.registrarSalida(db, uid, {
    poder: 'posty', tipo: 'semana', resumen: 'Posty armó la semana de Café Aroma desde su fundamento',
    recibo: { posteos: 5 }, evento_nivel: 'semana_generada',
  });
  ok(sal.registro_ref.startsWith('posty:semana:'), 'la salida nace con registro_ref');
  const resuelto = oficina.resolverRegistro(db, uid, sal.registro_ref);
  ok(resuelto && resuelto.resumen.includes('semana de Café Aroma'), 'el registro_ref RESUELVE a su registro');
  const itemP = await oficina.crearBandejaItem(db, uid, { poder: 'posty', que: 'Tu semana está lista para publicar', propuesta: '5 posteos desde tu fundamento.', push: false });
  const accP = oficina.accionarBandeja(db, uid, itemP.id, 'aceptar');
  ok(accP.subida && accP.subida.poder === 'posty' && accP.subida.nivel === 3 && accP.subida.nombre_nivel === 'De la casa', 'Posty sube a L3 con la semana + la decisión del dueño');
  ok(nv('oficina').nivel === 3, 'la oficina sube a L3: decisión del dueño + primer poder con salida');
  const parte = oficina.parteDePoder(db, uid, 'posty');
  ok(parte && Array.isArray(parte.salidas) && parte.salidas.length === 1 && parte.salidas[0].registro_ref === sal.registro_ref, 'el parte de Posty trae su salida con recibo resoluble');
  ok(parte.nivel.nivel_actual === 3 && Array.isArray(parte.fundamento_nuevo) && Array.isArray(parte.bandeja_pendientes) && Array.isArray(parte.incidentes_atrasos), 'el parte cumple la forma del contrato §1.1');
  const semana = oficina.partesDeLaSemana(db, uid);
  ok(semana.partes.talenty.parte_no_recibido === true, 'la ausencia de Talenty se NOMBRA (parte_no_recibido), jamás silencio');
  ok(semana.faltantes.includes('talenty'), 'los faltantes se listan');

  section('A5 · Push de la oficina: motivos, guardas, topes, agrupado, control del dueño');
  const db2 = dbMemoria();
  const seedB = await oficina.seedCafeAroma(db2, {});
  const uid2 = seedB.user_id;
  let r = await pushOf.emitir(db2, uid2, { agente: 'posty', motivo: 'cumpleanos', titulo: 'x', cuerpo: 'y' });
  ok(r.estado === 'bloqueada' && r.causa === 'motivo_invalido', 'motivo fuera de la lista cerrada: bloqueado y registrado');
  r = await pushOf.emitir(db2, uid2, { agente: 'talenty', motivo: 'decision', titulo: 'Legajo de Ana: sueldo $ 500.000', cuerpo: 'x', datos_personas: true });
  ok(r.estado === 'bloqueada' && r.causa === 'guarda_talenty', 'Talenty jamás empuja datos de personas');
  r = await pushOf.emitir(db2, uid2, { agente: 'talenty', motivo: 'decision', titulo: 'Hay una liquidación lista para tu OK', cuerpo: 'Sin nombres ni montos.' });
  ok(r.estado !== 'bloqueada' || r.causa !== 'guarda_talenty', 'Talenty SÍ puede avisar de su trabajo, sin datos');
  r = await pushOf.emitir(db2, uid2, { agente: 'growty', motivo: 'buena_noticia', titulo: 'Tu campaña anda bien', cuerpo: 'sin número' });
  ok(r.estado === 'bloqueada' && r.causa === 'guarda_growty_sin_medicion', 'Growty sin número medido: no habla');
  r = await pushOf.emitir(db2, uid2, { agente: 'posty', motivo: 'decision', titulo: 'Decisión', cuerpo: 'x', url: '/#/app/bandeja' });
  ok(r.estado === 'sin_suscripcion' || r.estado === 'en_espera', 'sin suscripción el intento queda registrado, jamás fingido como enviado');
  const logCount = db2.prepare('SELECT COUNT(*) AS n FROM push_oficina_log WHERE user_id = ?').get(uid2).n;
  ok(logCount >= 5, 'TODO intento quedó en el log durable');
  // Topes: 3 push enviadas de un agente (historia simulada en el log) → la 4ª espera.
  for (let i = 0; i < 3; i++) pushOf._log(db2, uid2, { agente: 'venty', motivo: 'decision', titulo: 't', cuerpo: '', url: '', estado: 'enviada', causa: '' });
  r = await pushOf.emitir(db2, uid2, { agente: 'venty', motivo: 'urgencia', titulo: 'u', cuerpo: 'x' });
  if (pushOf.esSilencioNocturno(Date.now())) { ok(r.estado === 'en_espera', 'de noche, hasta la urgencia del tope espera'); }
  else ok(r.estado === 'en_espera' && r.causa === 'tope_agente', 'tope por agente (3/día): la siguiente espera');
  // Agrupado de buenas noticias.
  for (let i = 0; i < 3; i++) await pushOf.emitir(db2, uid2, { agente: 'desy', motivo: 'buena_noticia', titulo: 'Pieza ' + (i + 1) + ' lista', cuerpo: 'x' });
  const flush = await pushOf.procesarEsperas(db2, uid2, { forzar: true });
  const resumen = db2.prepare("SELECT COUNT(*) AS n FROM push_oficina_log WHERE user_id = ? AND agente = 'bossty' AND causa = 'resumen_agrupado'").get(uid2).n;
  ok(resumen === 1, '3+ buenas noticias se agrupan en UNA de Bossty');
  const agrupadas = db2.prepare("SELECT COUNT(*) AS n FROM push_oficina_log WHERE user_id = ? AND estado = 'agrupada'").get(uid2).n;
  ok(agrupadas === 3, 'las originales quedan marcadas como agrupadas');
  // Control del dueño.
  pushOf.setPrefAgente(db2, uid2, 'desy', false);
  r = await pushOf.emitir(db2, uid2, { agente: 'desy', motivo: 'decision', titulo: 'x', cuerpo: 'y' });
  ok(r.estado === 'bloqueada' && r.causa === 'apagada_por_el_dueno', 'el toggle del dueño manda: agente apagado no empuja');
  pushOf.setSilencioGlobal(db2, uid2, true);
  r = await pushOf.emitir(db2, uid2, { agente: 'posty', motivo: 'urgencia', titulo: 'x', cuerpo: 'y' });
  ok(r.estado === 'bloqueada' && r.causa === 'apagada_por_el_dueno', 'el silencio global manda sobre todo');

  section('A6 · Chat con Bambooty: responde desde los registros');
  const c1 = await oficina.responderChat(db, uid, '¿qué hay en mi bandeja?');
  ok(typeof c1.reply === 'string' && c1.reply.length > 10, 'el chat responde');
  ok(c1.poder === 'bossty', 'lo no ruteado lo responde Bambooty (Bossty dirige)');
  const cReg = db.prepare("SELECT COUNT(*) AS n FROM oficina_registros WHERE user_id = ? AND tipo = 'chat'").get(uid).n;
  ok(cReg >= 1, 'el turno de chat quedó registrado en el río');

  section('B · E2E contra el servidor real');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-oficina-'));
  const port = 18000 + Math.floor(Math.random() * 900);
  const env = { ...process.env, DATA_DIR: tmp, PORT: String(port), ADMIN_TOKEN: 'test-token', NODE_ENV: 'test' };
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const v = await fetch(base + '/api/version'); up = v.ok; } catch (e) { await sleep(500); }
    }
    ok(up, 'el servidor bootea' + (up ? '' : ' — log: ' + srvLog.slice(-400)));
    if (up) {
      const seedRes = await fetch(base + '/api/admin/oficina/seed-cafe-aroma?token=test-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const seedJson = await seedRes.json().catch(() => ({}));
      ok(seedRes.ok && seedJson.user_id > 0, 'seed por la puerta admin (ADMIN_TOKEN)');
      const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fixture.FIXTURE_EMAIL, password: 'CafeAroma-TestFlight-2026!' }) });
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
      ok(login.ok && !!cookie, 'login de la cuenta fixture');
      const me = await (await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).json();
      ok(!!(me.user && me.user.bambooty_shell === true), '/api/auth/me expone bambooty_shell SOLO en la cuenta del shell');
      const est = await (await fetch(base + '/api/oficina/estado', { headers: { Cookie: cookie } })).json();
      ok(est.ok && est.poderes.length === 8 && est.negocio === 'Café Aroma', 'estado de la oficina por HTTP: 8 poderes, Café Aroma');
      ok(est.bandeja_count === 1, 'la Bandeja trae su ítem genuino');
      const itemId = est.bandeja_pendientes && est.bandeja_pendientes[0] && est.bandeja_pendientes[0].id;
      ok(!!itemId, 'el ítem de la Bandeja trae su id');
      const accRes = await fetch(base + '/api/oficina/bandeja/' + itemId + '/accion', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ accion: 'aceptar' }) });
      const accJson = await accRes.json().catch(() => ({}));
      ok(accRes.ok && accJson.ok === true, 'aceptar desde la app (HTTP) funciona y queda durable');
      const partes = await (await fetch(base + '/api/oficina/partes', { headers: { Cookie: cookie } })).json();
      ok(partes.ok && partes.partes.talenty.parte_no_recibido === true, 'partes por HTTP con la ausencia nombrada');
      const reg = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'comun@test.local', password: 'ClaveSegura123' }) });
      const cookie2 = (reg.headers.get('set-cookie') || '').split(';')[0];
      const me2 = await (await fetch(base + '/api/auth/me', { headers: { Cookie: cookie2 } })).json().catch(() => ({}));
      ok(!(me2.user && me2.user.bambooty_shell), 'una cuenta común NO tiene el shell: la web sigue siendo Posty');
    }
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(fails ? `\n✗ ${fails} fallas` : '\n✓ TODO VERDE');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
