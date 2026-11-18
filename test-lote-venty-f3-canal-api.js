// test-lote-venty-f3-canal-api.js — VENTY F3 CANAL DOMINANTE: rutas con
// boot real. El bloque canal_dominante viaja en GET /api/venty/estado y
// DENTRO del fundamento en GET /api/venty/fundamento, con su evidencia
// (conteos por canal). Sin rutas nuevas. La semilla de Café Aroma
// (whatsapp 4, instagram 3) no alcanza el umbral: sin_definir. Al sumar
// consultas reales de whatsapp en la DB, la lectura pasa a definido.
// Uso: node test-lote-venty-f3-canal-api.js (NODE_PATH con node_modules)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-f3-'));
const PORT = 18771;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-f3@test.com';

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
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'test1234', business_name: 'F3 Test' }),
    });
    ok(rr.status === 200 || rr.status === 201, `register (${rr.status})`);
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const vwt = require('./venty-web-tokens');
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    const UID = row.id;
    const issued = vwt.issueCode(db, UID, EMAIL);
    const canje = await req('POST', '/api/auth/venty-token', { body: { code: issued.code } });
    ok(canje.status === 200 && /^[0-9a-f]{64}$/.test(canje.data.token || ''), 'canje código a token 200');
    const B = { Authorization: 'Bearer ' + canje.data.token };

    const sinAuth = await req('GET', '/api/venty/fundamento', {});
    eq(sinAuth.status, 401, 'sin Bearer: fundamento 401');

    // primer contacto: semilla Café Aroma (whatsapp 4, instagram 3)
    const fund = await req('GET', '/api/venty/fundamento', { headers: B });
    eq(fund.status, 200, 'fundamento 200');
    const cd = fund.data.fundamento.canal_dominante;
    ok(cd && typeof cd === 'object', 'el fundamento declara canal_dominante');
    eq(cd.estado, 'sin_definir', 'semilla: sin_definir (57% no alcanza el 60%)');
    eq(cd.motivo, 'sin_dominancia_clara', 'semilla: motivo sin_dominancia_clara');
    eq(cd.evidencia.por_canal.whatsapp.consultas, 4, 'evidencia por API: 4 consultas whatsapp');
    eq(cd.evidencia.por_canal.instagram.consultas, 3, 'evidencia por API: 3 consultas instagram');
    eq(cd.evidencia.total_consultas, 7, 'evidencia por API: total 7');
    ok(typeof cd.porque === 'string' && cd.porque.includes('whatsapp: 4 consultas'), 'el porque viaja con los conteos');

    const est = await req('GET', '/api/venty/estado', { headers: B });
    eq(est.status, 200, 'estado 200');
    ok(est.data.canal_dominante && est.data.canal_dominante.estado === 'sin_definir', 'el estado también declara el bloque canal_dominante');

    // entran 5 consultas reales más por whatsapp: 9 de 12 = 75%
    const insP = db.prepare(`INSERT INTO venty_partidas (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insM = db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at, fuente_precio) VALUES (?,?,?,?,?,?)`);
    for (let i = 0; i < 5; i++) {
      const pid = Number(insP.run(UID, 'Cliente Api ' + i, 'whatsapp', 'viva', '', 0, '', '', 0, '', 'whatsapp', '2026-11-12 09:00:00', '2026-11-12 09:00:00').lastInsertRowid);
      insM.run(pid, 'cliente', 'hola, consulto', 'whatsapp', '2026-11-12 09:00:00', '');
    }
    const fund2 = await req('GET', '/api/venty/fundamento', { headers: B });
    const cd2 = fund2.data.fundamento.canal_dominante;
    eq(cd2.estado, 'definido', 'tras las consultas nuevas: definido (recálculo en la lectura)');
    eq(cd2.canal, 'whatsapp', 'dominante whatsapp por API');
    eq(cd2.evidencia.cuota_dominante, 0.75, 'cuota 0.75 por API');
    ok(cd2.porque.includes('9 de 12'), 'el porque actualizado trae 9 de 12');
    const snap = db.prepare('SELECT * FROM venty_canal_dominante WHERE user_id = ?').get(UID);
    ok(snap && snap.canal === 'whatsapp', 'snapshot persistido en venty_canal_dominante');
  } catch (e) {
    fails++; console.error('  ✗ excepción:', e.message);
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
  }
  console.log(`\nF3 CANAL API: ${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
})();
