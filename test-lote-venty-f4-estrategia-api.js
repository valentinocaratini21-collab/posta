// test-lote-venty-f4-estrategia-api.js — VENTY F4: rutas con boot real.
// Levanta el scratch con DATA_DIR aislada, registra un usuario y canjea
// el código web. Verifica la estrategia por API: defaults derivados,
// propuesta que no se aplica hasta confirmar, versión con fecha/origen,
// historial, y el flujo completo por el chat de toques (preferencia,
// puntual y ambiguo) contra el servidor real.
// Uso: node test-lote-venty-f4-estrategia-api.js (NODE_PATH con node_modules)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-f4-'));
const PORT = 18771;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-f4@test.com';

async function waitBoot(tries = 160) { // el boot del server completo tarda ~35-40 s en esta VM
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
    ok(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').includes('VENTY-F4-ESTRATEGIA'), 'server.js: el bloque lleva el ancla VENTY-F4-ESTRATEGIA');
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'test1234', business_name: 'Estrategia Test' }),
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

    const sinAuth = await req('GET', '/api/venty/estrategia', {});
    eq(sinAuth.status, 401, 'sin Bearer: estrategia 401');

    // primer contacto: siembra la semilla de modo prueba
    const est0 = await req('GET', '/api/venty/estado', { headers: B });
    eq(est0.status, 200, 'estado 200 (semilla de modo prueba)');

    // ---------- defaults por API ----------
    console.log('— defaults derivados del fundamento');
    const e1 = await req('GET', '/api/venty/estrategia', { headers: B });
    eq(e1.status, 200, 'GET estrategia: 200');
    eq(e1.data.modo, 'prueba', 'GET estrategia: modo prueba');
    eq(e1.data.vigente.version, 0, 'GET estrategia: vigente versión 0 (defaults)');
    eq(e1.data.vigente.es_default, true, 'GET estrategia: es_default');
    eq(e1.data.vigente.datos.descuento_max_pct, 10, 'GET estrategia: descuento default 10');
    eq(JSON.stringify(e1.data.vigente.datos.canales_habilitados), JSON.stringify(['whatsapp', 'instagram', 'email']), 'GET estrategia: canales default');
    eq(e1.data.vigente.datos.seguimiento.toques_max, 3, 'GET estrategia: seguimiento 3 toques');
    eq(e1.data.pendiente, null, 'GET estrategia: sin pendiente');
    const h0 = await req('GET', '/api/venty/estrategia/historial', { headers: B });
    eq(h0.data.historial.length, 0, 'historial: vacío al inicio');

    // ---------- propuesta por API: no se aplica hasta confirmar ----------
    console.log('— propuesta + confirmación por API');
    const prop = await req('POST', '/api/venty/estrategia/propuesta', { headers: B, body: { cambio: { descuento_max_pct: 7 }, origen: 'chat' } });
    eq(prop.status, 200, 'POST propuesta: 200');
    eq(prop.data.propuesta.descuento_max_pct, 7, 'POST propuesta: la propuesta trae 7');
    eq(prop.data.vigente.datos.descuento_max_pct, 10, 'POST propuesta: la vigente sigue en 10');
    const e2 = await req('GET', '/api/venty/estrategia', { headers: B });
    ok(e2.data.pendiente && e2.data.pendiente.tipo === 'propuesta', 'tras proponer: el pendiente es la propuesta');
    eq(e2.data.vigente.datos.descuento_max_pct, 10, 'tras proponer: la vigente por API sigue en 10');
    const conf = await req('POST', '/api/venty/estrategia/confirmar', { headers: B, body: {} });
    eq(conf.status, 200, 'POST confirmar: 200');
    eq(conf.data.version, 1, 'POST confirmar: nació la versión 1');
    eq(conf.data.origen, 'chat', 'POST confirmar: origen chat');
    ok(/^\d{4}-\d{2}-\d{2}/.test(conf.data.created_at || ''), 'POST confirmar: la versión trae fecha');
    const e3 = await req('GET', '/api/venty/estrategia', { headers: B });
    eq(e3.data.vigente.version, 1, 'tras confirmar: vigente versión 1');
    eq(e3.data.vigente.datos.descuento_max_pct, 7, 'tras confirmar: vigente con descuento 7');
    eq(e3.data.pendiente, null, 'tras confirmar: sin pendiente');
    const h1 = await req('GET', '/api/venty/estrategia/historial', { headers: B });
    eq(h1.data.historial.length, 1, 'historial: 1 versión');
    eq(h1.data.historial[0].origen, 'chat', 'historial: la versión guarda su origen');
    const conf2 = await req('POST', '/api/venty/estrategia/confirmar', { headers: B, body: {} });
    eq(conf2.status, 400, 'confirmar sin pendiente: 400 honesto');

    // descartar por API
    await req('POST', '/api/venty/estrategia/propuesta', { headers: B, body: { cambio: { descuento_max_pct: 3 }, origen: 'voz' } });
    const desc = await req('POST', '/api/venty/estrategia/descartar', { headers: B, body: {} });
    eq(desc.status, 200, 'POST descartar: 200');
    const e4 = await req('GET', '/api/venty/estrategia', { headers: B });
    eq(e4.data.vigente.datos.descuento_max_pct, 7, 'tras descartar: la vigente no se movió (7)');
    eq(e4.data.pendiente, null, 'tras descartar: sin pendiente');

    // ---------- chat de toques contra el servidor real ----------
    console.log('— chat: preferencia, puntual y ambiguo por API');
    const chat = (text) => req('POST', '/api/venty/chat', { headers: B, body: { text } });
    const verChat = await chat('mi estrategia');
    eq(verChat.status, 200, 'chat mi estrategia: 200');
    ok(verChat.data.reply.includes('descuento máximo 7%'), 'chat mi estrategia: muestra la vigente real (7%)');
    ok(!/[¿¡]/.test(verChat.data.reply), 'chat mi estrategia: cero signos de apertura');
    const pref = await chat('bajá el descuento máximo a 5');
    ok(pref.data.reply.includes('así queda tu estrategia'), 'chat preferencia: muestra «así queda»');
    eq(JSON.stringify(pref.data.options), JSON.stringify(['confirmar', 'cancelar']), 'chat preferencia: opciones confirmar/cancelar');
    const e5 = await req('GET', '/api/venty/estrategia', { headers: B });
    eq(e5.data.vigente.datos.descuento_max_pct, 7, 'chat preferencia sin confirmar: vigente sigue en 7');
    const confChat = await chat('confirmar');
    ok(confChat.data.reply.includes('versión 2'), 'chat confirmar: nació la versión 2');
    const e6 = await req('GET', '/api/venty/estrategia', { headers: B });
    eq(e6.data.vigente.datos.descuento_max_pct, 5, 'chat confirmar: vigente en 5');

    const bandejaAntes = await req('GET', '/api/venty/bandeja', { headers: B });
    const nAntes = bandejaAntes.data.jugadas.length;
    const punt = await chat('para pedro molina dale un 20% de descuento');
    ok(punt.data.reply.includes('solo para pedro molina'), 'chat puntual: solo para esa partida');
    const bandejaDesp = await req('GET', '/api/venty/bandeja', { headers: B });
    eq(bandejaDesp.data.jugadas.length, nAntes + 1, 'chat puntual: una jugada nueva en bandeja');
    ok(bandejaDesp.data.jugadas.some((j) => j.propuesta && j.propuesta.alcance === 'solo_esta_partida'), 'chat puntual: la jugada es solo_esta_partida');
    const e7 = await req('GET', '/api/venty/estrategia', { headers: B });
    eq(e7.data.vigente.version, 2, 'chat puntual: la estrategia sigue en la versión 2, intacta');

    const amb = await chat('bajá el descuento a 4 para esta partida');
    eq(JSON.stringify(amb.data.options), JSON.stringify(['mi estrategia', 'solo esta partida']), 'chat ambiguo: dos toques de desambiguación');
    const e8 = await req('GET', '/api/venty/estrategia', { headers: B });
    eq(e8.data.vigente.version, 2, 'chat ambiguo: ninguna versión nueva');
    ok(e8.data.pendiente && e8.data.pendiente.tipo === 'ambiguo', 'chat ambiguo: el pendiente es la desambiguación');
    const toque = await chat('mi estrategia');
    ok(toque.data.reply.includes('así queda tu estrategia'), 'ambiguo→mi estrategia: muestra «así queda»');
    await chat('confirmar');
    const e9 = await req('GET', '/api/venty/estrategia', { headers: B });
    eq(e9.data.vigente.datos.descuento_max_pct, 4, 'ambiguo→confirmado: vigente en 4');
    eq(e9.data.vigente.version, 3, 'ambiguo→confirmado: versión 3');
    const hFin = await req('GET', '/api/venty/estrategia/historial', { headers: B });
    eq(hFin.data.historial.length, 3, 'historial final: 3 versiones (api, chat, ambiguo confirmado)');
  } catch (e) {
    fails++; console.error('  ✗ excepción:', e && e.message);
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
  }
  console.log(`\n— venty f4 estrategia api: ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})();
