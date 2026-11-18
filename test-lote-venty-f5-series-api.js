// test-lote-venty-f5-series-api.js — VENTY F5: rutas con boot real.
// Levanta el scratch con DATA_DIR aislada, registra un usuario y canjea
// el código web. El primer contacto (ventyUid) siembra el fundamento de
// Café Aroma y dispara la generación de series: la API tiene que
// devolver las 4 series con los nombres derivados de esa estrella.
// Uso: node test-lote-venty-f5-series-api.js (NODE_PATH con node_modules)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-f5-'));
const PORT = 18765;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-f5@test.com';

async function waitBoot(tries = 120) {
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
      body: JSON.stringify({ email: EMAIL, password: 'test1234', business_name: 'Series F5 Test' }),
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

    const sinAuth = await req('GET', '/api/venty/series', {});
    eq(sinAuth.status, 401, 'sin Bearer: series 401');

    // el primer contacto dispara semilla + series (punto declarado en server.js)
    const lista = await req('GET', '/api/venty/series', { headers: B });
    eq(lista.status, 200, 'GET /api/venty/series: 200');
    eq((lista.data.series || []).length, 4, 'la API devuelve las 4 series del negocio');
    const porTipo = Object.fromEntries((lista.data.series || []).map((s) => [s.tipo, s]));
    eq(porTipo.primer_contacto.nombre, 'Brunch Aroma · la mesa', 'api: primer contacto con nombre de la estrella de café aroma');
    eq(porTipo.seguimiento.nombre, 'Brunch Aroma · la sobremesa', 'api: seguimiento con nombre propio');
    eq(porTipo.reactivacion.nombre, 'Brunch Aroma · la vuelta a la mesa', 'api: reactivación con nombre propio');
    eq(porTipo.resena_referido.nombre, 'Brunch Aroma · el boca a boca', 'api: reseña/referido con nombre propio');
    ok((lista.data.series || []).every((s) => s.nombre_es_identidad), 'api: las 4 con identidad');
    ok((lista.data.series || []).every((s) => (s.pasos || []).every((p) => typeof p.idea === 'string' && typeof p.cta === 'string')), 'api: cada paso con una sola idea y una sola cta');
    ok((lista.data.series || []).every((s) => !/venty/i.test(s.firma_negocio || ''))), 'api: ninguna firma es de venty (sin nombre de negocio cargado, la firma queda como plantilla del negocio)';
    eq(db.prepare('SELECT COUNT(*) c FROM venty_series WHERE user_id = ?').get(UID).c, 4, 'db: 4 filas en venty_series');
    eq(db.prepare('SELECT COUNT(*) c FROM venty_eventos WHERE user_id = ? AND tipo = ?').get(UID, 'series_generadas').c, 1, 'db: un solo evento series_generadas tras varios contactos (idempotente por hash)');
    // con el nombre del negocio cargado en su perfil, la regeneración
    // forzada firma como ese negocio:
    db.prepare(`INSERT INTO profiles (user_id, business_name) VALUES (?, 'Series F5 Test') ON CONFLICT(user_id) DO UPDATE SET business_name = excluded.business_name`).run(UID);
    const genFirma = await req('POST', '/api/venty/series/generar', { headers: B, body: { forzar: true } });
    ok((genFirma.data.series || []).every((s) => /series f5 test/i.test(s.firma_negocio || '')), 'api: con el perfil cargado, la firma es el negocio (series f5 test), nunca venty');

    const una = await req('GET', '/api/venty/series/seguimiento', { headers: B });
    eq(una.status, 200, 'GET /api/venty/series/seguimiento: 200');
    eq(JSON.stringify((una.data.serie.pasos || []).map((p) => p.tipo_email)), JSON.stringify(['T2', 'T3', 'T4']), 'api: seguimiento trae T2, T3 y T4');

    const noHay = await req('GET', '/api/venty/series/no_existe', { headers: B });
    eq(noHay.status, 404, 'tipo inexistente: 404');

    const gen1 = await req('POST', '/api/venty/series/generar', { headers: B, body: {} });
    eq(gen1.status, 200, 'POST generar: 200');
    eq(gen1.data.ya_existia, true, 'POST generar sin cambios: ya existía (hash idéntico)');
    const gen2 = await req('POST', '/api/venty/series/generar', { headers: B, body: { forzar: true } });
    eq(gen2.status, 200, 'POST generar forzado: 200');
    eq(gen2.data.nombres_con_identidad, 4, 'POST generar forzado: regenera con identidad');
    eq(db.prepare('SELECT COUNT(*) c FROM venty_series WHERE user_id = ?').get(UID).c, 4, 'db: tras regenerar siguen siendo 4 series');

    // la bandeja del negocio rico no suma jugadas de nombre faltante
    const bandeja = await req('GET', '/api/venty/bandeja', { headers: B });
    eq(bandeja.status, 200, 'bandeja: 200');
    ok(!(bandeja.data.jugadas || []).some((j) => j.tipo === 'serie_sin_nombre'), 'bandeja: sin jugada serie_sin_nombre para el fundamento completo');

    db.close();
  } finally {
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n— venty-f5-series (api): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})();
