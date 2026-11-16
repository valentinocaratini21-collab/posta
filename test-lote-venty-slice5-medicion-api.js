// test-lote-venty-slice5-medicion-api.js — VENTY SLICE 5: rutas con boot real.
// Levanta el scratch con DATA_DIR aislada, registra un usuario y canjea
// el código web. La semilla de Café Aroma que ventyUid siembra al primer
// contacto se BORRA de las tablas del usuario y el registro se arma a
// mano con filas reales: los números que devuelve la API tienen que ser
// exactamente esos, ni uno de la semilla.
// Uso: node test-lote-venty-slice5-medicion-api.js (NODE_PATH con node_modules)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-slice5-'));
const PORT = 18763;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-slice5@test.com';

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function req(method, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, ...(opts.headers || {}) };
  const rr = await fetch(BASE + p, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'test', WHATSAPP_APP_SECRET: 'x', WHATSAPP_VERIFY_TOKEN: 'x', INSTAGRAM_APP_SECRET: 'x', INSTAGRAM_VERIFY_TOKEN: 'x' },
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    const buildInFile = (fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').match(/BUILD_ID\s*=\s*'([^']+)'/) || [])[1];
    eq(ver.build, buildInFile, `/api/version coincide con el BUILD_ID del archivo (${buildInFile})`);
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'test1234', business_name: 'Medición Test' }),
    });
    ok(rr.status === 200 || rr.status === 201, `register (${rr.status})`);
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const vwt = require('./venty-web-tokens');
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    ok(row && row.id, 'usuario registrado en la DB de test');
    const UID = row.id;
    const issued = vwt.issueCode(db, UID, EMAIL);
    const canje = await req('POST', '/api/auth/venty-token', { body: { code: issued.code } });
    ok(canje.status === 200 && /^[0-9a-f]{64}$/.test(canje.data.token || ''), 'canje código a token 200');
    const B = { Authorization: 'Bearer ' + canje.data.token };

    const sinAuth = await req('GET', '/api/venty/medicion/parte', {});
    eq(sinAuth.status, 401, 'sin Bearer: medición/parte 401');

    // primer contacto: siembra la semilla (patrón de todas las rutas venty)
    const est = await req('GET', '/api/venty/estado', { headers: B });
    eq(est.status, 200, 'estado 200 (la semilla de modo prueba existe)');

    // se borra TODO el registro del usuario (semilla incluida) y se arma
    // un registro real a mano: la medición no puede mezclar la semilla.
    const pids = db.prepare('SELECT id FROM venty_partidas WHERE user_id = ?').all(UID).map((r) => r.id);
    ok(pids.length > 0, 'la semilla había sembrado partidas (se borran para la medición)');
    for (const pid of pids) db.prepare('DELETE FROM venty_mensajes WHERE partida_id = ?').run(pid);
    db.prepare('DELETE FROM venty_partidas WHERE user_id = ?').run(UID);
    db.prepare('DELETE FROM venty_eventos WHERE user_id = ?').run(UID);
    db.prepare('DELETE FROM venty_jugadas WHERE user_id = ?').run(UID);
    db.prepare('DELETE FROM venty_leads WHERE user_id = ?').run(UID);
    db.prepare('DELETE FROM venty_parte WHERE user_id = ?').run(UID);

    const vacio = await req('GET', '/api/venty/medicion/parte?semana=2026-11-02', { headers: B });
    eq(vacio.status, 200, 'parte sin datos: 200');
    eq(vacio.data.emitido, false, 'parte sin datos: no emitido por API');
    eq(vacio.data.razon, 'sin_datos', 'parte sin datos: razón sin_datos');

    // registro real a mano, semana 2026-11-02
    const insP = db.prepare(`INSERT INTO venty_partidas (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insM = db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at, fuente_precio) VALUES (?,?,?,?,?,?)`);
    const insE = db.prepare(`INSERT INTO venty_eventos (user_id, tipo, partida_id, datos_json, created_at) VALUES (?,?,?,?,?)`);
    const p1 = Number(insP.run(UID, 'Cliente Api Uno', 'whatsapp', 'cerrada_ganada', '', 7000, 'pago total', '', 0, '', 'whatsapp', '2026-11-03 09:00:00', '2026-11-03 09:10:00').lastInsertRowid);
    insM.run(p1, 'cliente', 'hola, cuánto sale', 'whatsapp', '2026-11-03 09:00:00', '');
    insM.run(p1, 'venty', 'hola, sale siete mil', 'whatsapp', '2026-11-03 09:02:00', '');
    insE.run(UID, 'cotizacion', p1, JSON.stringify({ monto: 7000 }), '2026-11-03 09:02:00');
    insE.run(UID, 'cierre', p1, JSON.stringify({ forma: 'pago total', monto: 7000 }), '2026-11-03 09:10:00');
    const p2 = Number(insP.run(UID, 'Cliente Api Dos', 'whatsapp', 'viva', '', 0, '', '', 0, '', 'whatsapp', '2026-11-04 10:00:00', '2026-11-04 10:00:00').lastInsertRowid);
    insM.run(p2, 'cliente', 'hola, tienen lugar', 'whatsapp', '2026-11-04 10:00:00', '');
    insM.run(p2, 'venty', 'hola, contame para cuántos', 'whatsapp', '2026-11-04 10:01:00', '');
    insE.run(UID, 'calificacion', p2, JSON.stringify({}), '2026-11-04 10:01:00');
    // consulta vieja sin responder: alerta grave por API
    const p3 = Number(insP.run(UID, 'Cliente Api Olvidado', 'whatsapp', 'viva', '', 0, '', '', 0, '', 'whatsapp', '2020-01-01 08:00:00', '2020-01-01 08:00:00').lastInsertRowid);
    insM.run(p3, 'cliente', 'hola, necesito una reserva', 'whatsapp', '2020-01-01 08:00:00', '');

    const parte = await req('GET', '/api/venty/medicion/parte?semana=2026-11-02', { headers: B });
    eq(parte.status, 200, 'parte real: 200');
    eq(parte.data.emitido, true, 'parte real: emitido');
    eq(parte.data.consultas, 2, 'parte real: 2 consultas (solo el registro armado, nada de la semilla)');
    eq(parte.data.calificadas, 2, 'parte real: 2 calificadas');
    eq(parte.data.cotizadas, 1, 'parte real: 1 cotizada');
    eq(parte.data.ventas, 1, 'parte real: 1 venta');
    eq(parte.data.monto, 7000, 'parte real: monto 7000');
    eq(parte.data.tasa_cierre_pct, 50, 'parte real: tasa 1/2 = 50');
    eq(parte.data.primera_respuesta_seg, 90, 'parte real: primera respuesta (120+60)/2 = 90, medida de los timestamps');
    eq(parte.data.comparacion.hay_anterior, false, 'parte real: sin semana anterior con datos, comparación honesta');
    eq(parte.data.fuente, 'registro', 'parte real: fuente registro');

    const mala = await req('GET', '/api/venty/medicion/parte?semana=ayer', { headers: B });
    eq(mala.status, 400, 'semana inválida: 400');

    const alertas = await req('GET', '/api/venty/medicion/alertas', { headers: B });
    eq(alertas.status, 200, 'alertas: 200');
    ok((alertas.data.alertas || []).some((a) => a.partida_id === p3 && a.grave), 'alertas: la consulta olvidada figura como falta grave');
    ok((alertas.data.alertas || []).every((a) => a.partida_id !== p2), 'alertas: la consulta respondida no figura');

    const nivel = await req('GET', '/api/venty/medicion/nivel', { headers: B });
    eq(nivel.status, 200, 'nivel: 200');
    eq(nivel.data.nivel, 1, 'nivel: 1 (falta la lectura de fuente, hecho no registrado)');
    eq(nivel.data.nombre, 'recién sentado al tablero', 'nivel: nombre inicial del plan');
    ok((nivel.data.que_falta || []).some((f) => f.clave === 'lectura_fuente'), 'nivel: qué falta incluye la lectura de fuente calculada');

    const frase = await req('GET', '/api/venty/medicion/frase', { headers: B });
    eq(frase.status, 200, 'frase: 200');
    ok(typeof frase.data.frase === 'string' && frase.data.frase.length > 0, 'frase: texto computado presente');
    eq(frase.data.fuente, 'registro', 'frase: fuente registro');

    const resumen = await req('GET', '/api/venty/medicion/resumen?semana=2026-11-02', { headers: B });
    eq(resumen.status, 200, 'resumen: 200');
    ok(resumen.data.parte && resumen.data.nivel && resumen.data.frase && Array.isArray(resumen.data.alertas), 'resumen: trae parte, nivel, frase y alertas');

    const job1 = await req('POST', '/api/venty/medicion/jobs/parte', { headers: B, body: { semana: '2026-11-02' } });
    eq(job1.status, 200, 'job parte por API: 200');
    eq(job1.data.resultados[0].emitido, true, 'job parte por API: emitido');
    await req('POST', '/api/venty/medicion/jobs/parte', { headers: B, body: { semana: '2026-11-02' } });
    eq(db.prepare(`SELECT COUNT(*) c FROM venty_parte WHERE user_id = ? AND semana = '2026-11-02'`).get(UID).c, 1, 'job parte x2: 1 sola fila en venty_parte (idempotente)');
    eq(db.prepare(`SELECT COUNT(*) c FROM venty_eventos WHERE user_id = ? AND tipo = 'parte_emitido'`).get(UID).c, 1, 'job parte x2: 1 solo evento parte_emitido');
    await req('POST', '/api/venty/medicion/jobs/frase', { headers: B, body: {} });
    await req('POST', '/api/venty/medicion/jobs/frase', { headers: B, body: {} });
    eq(db.prepare(`SELECT COUNT(*) c FROM venty_medicion_frase WHERE user_id = ?`).get(UID).c, 1, 'job frase x2: 1 sola fila en venty_medicion_frase (idempotente)');

    db.close();
  } finally {
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n— venty-slice5-medicion (api): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})();
