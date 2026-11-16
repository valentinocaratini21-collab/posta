// test-lote-venty-slice4-representantes-api.js — SLICE 4: rutas con boot real.
// Boot A sin VENTY_INGESTA_SECRET: la ingesta queda cerrada (503).
// Boot B con secreto: ingesta sin header 401, con secreto incorrecto 401,
// con el correcto 200 y la respuesta visible como jugada en Bandeja;
// carga del piloto por API (198 leads, censo), oleada diaria en espejo y
// verificar-salida dictaminando las puertas cerradas del piloto.
// Uso: node test-lote-venty-slice4-representantes-api.js (NODE_PATH con node_modules)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-slice4@test.com';
const SECRET = 'secreto-ingesta-api-test';

async function waitBoot(base, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(base + '/api/version'); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function boot(port, extraEnv) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-slice4-'));
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(port), SESSION_SECRET: 's4-test', RESEND_API_KEY: 'dummy', ...extraEnv },
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});
  return { srv, TMP, base: 'http://127.0.0.1:' + port };
}
async function stop(b) {
  b.srv.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 800));
  try { fs.rmSync(b.TMP, { recursive: true, force: true }); } catch (e) {}
}
async function req(base, method, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, ...(opts.headers || {}) };
  const rr = await fetch(base + p, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}

(async () => {
  // ---------- boot A: sin secreto de ingesta → ruta cerrada ----------
  const envSinSecreto = { ...process.env };
  delete envSinSecreto.VENTY_INGESTA_SECRET;
  const A = boot(18764, { VENTY_INGESTA_SECRET: '' });
  // (VENTY_INGESTA_SECRET vacío equivale a no configurado: verificarSecreto lo trata como cerrada)
  try {
    ok(await waitBoot(A.base), 'boot A: server levanta');
    const r = await req(A.base, 'POST', '/api/venty/email/ingesta', { body: { de: 'a@b.com', asunto: 'hola', cuerpo: 'hola' } });
    ok(r.status === 503 && r.data.error === 'ingesta_cerrada', 'sin secreto configurado la ingesta queda cerrada (503)');
  } finally { await stop(A); }

  // ---------- boot B: con secreto ----------
  const B = boot(18765, { VENTY_INGESTA_SECRET: SECRET });
  try {
    ok(await waitBoot(B.base), 'boot B: server levanta');
    const sinHeader = await req(B.base, 'POST', '/api/venty/email/ingesta', { body: { de: 'a@b.com', asunto: 'hola', cuerpo: 'hola' } });
    ok(sinHeader.status === 401, 'ingesta sin header de secreto → 401');
    const malo = await req(B.base, 'POST', '/api/venty/email/ingesta', { headers: { 'x-venty-ingesta-secret': 'incorrecto' }, body: { de: 'a@b.com', asunto: 'hola', cuerpo: 'hola' } });
    ok(malo.status === 401 && malo.data.error === 'secreto_incorrecto', 'ingesta con secreto incorrecto → 401');

    const rr = await fetch(B.base + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'test1234', business_name: 'Fitswapp Test S4' }),
    });
    ok(rr.status === 200 || rr.status === 201, 'register (' + rr.status + ')');
    const db = new DatabaseSync(path.join(B.TMP, 'posta.db'));
    const vwt = require('./venty-web-tokens');
    const ventyEmail = require('./venty-email');
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    ok(row && row.id, 'usuario registrado en la DB de test');
    const issued = vwt.issueCode(db, row.id, EMAIL);
    const canje = await req(B.base, 'POST', '/api/auth/venty-token', { body: { code: issued.code } });
    ok(canje.status === 200 && /^[0-9a-f]{64}$/.test(canje.data.token || ''), 'canje código → token 200');
    const H = { Authorization: 'Bearer ' + canje.data.token };

    const sinAuth = await req(B.base, 'GET', '/api/venty/piloto/fitswapp/carga', {});
    ok(sinAuth.status === 401, 'censo de carga sin Bearer → 401');

    // carga por API + censo
    const cargaRes = await req(B.base, 'POST', '/api/venty/piloto/fitswapp/cargar', { headers: H, body: {} });
    ok(cargaRes.status === 200 && cargaRes.data.leads === 198, 'POST cargar: 198 leads (dio ' + (cargaRes.data && cargaRes.data.leads) + ')');
    ok(cargaRes.data.oleada1 && cargaRes.data.oleada1.items === 10, 'POST cargar: oleada 1 con 10 ítems en espejo');
    const censo = await req(B.base, 'GET', '/api/venty/piloto/fitswapp/carga', { headers: H });
    ok(censo.status === 200 && censo.data.fundamento === 'borrador_sin_aprobar', 'censo: el fundamento sigue borrador sin aprobar');
    ok(JSON.stringify((censo.data.zonas || []).map((z) => z.orden)) === JSON.stringify([1, 2, 3, 4, 5]), 'censo: zonas en orden 1 a 5');
    ok(censo.data.representantes === 5, 'censo: 5 representantes, uno por zona');
    const carga2 = await req(B.base, 'POST', '/api/venty/piloto/fitswapp/cargar', { headers: H, body: {} });
    ok(carga2.status === 200 && carga2.data.ya_cargado === true && carga2.data.leads === 198, 'POST cargar de nuevo: idempotente');

    // oleada diaria en espejo + verificar salida con puertas cerradas
    const diaria = await req(B.base, 'POST', '/api/venty/representantes/oleada-diaria', { headers: H, body: {} });
    ok(diaria.status === 200 && diaria.data.total_items > 0, 'oleada diaria: prepara ítems en espejo por zona (' + (diaria.data && diaria.data.total_items) + ')');
    const oleada1Id = censo.data.oleada1.id;
    const verif = await req(B.base, 'POST', '/api/venty/representantes/oleadas/' + oleada1Id + '/verificar-salida', { headers: H, body: {} });
    ok(verif.status === 200 && verif.data.puede_salir === false, 'verificar-salida oleada 1: no puede salir');
    const errores = (verif.data.bloqueos || []).map((b) => b.error);
    ok(errores.includes('sin_espejo_aceptado'), 'bloqueo presente: sin_espejo_aceptado');
    ok(errores.includes('falta_dominio_envio'), 'bloqueo presente: falta_dominio_envio (puerta cerrada)');
    ok(errores.includes('falta_permiso_instagram'), 'bloqueo presente: falta_permiso_instagram (puerta cerrada)');

    // ingesta con el secreto correcto → hilo + jugada visible en bandeja
    const dir = ventyEmail.generarDireccion(db, row.id);
    const ing = await req(B.base, 'POST', '/api/venty/email/ingesta', {
      headers: { 'x-venty-ingesta-secret': SECRET },
      body: { de: 'fundador@example.com', para: dir.direccion, asunto: 're: fundadores', cuerpo: 'hola, quiero sumarme como fundador', message_id: 'api-s4-1' },
    });
    ok(ing.status === 200 && ing.data.ok && ing.data.jugada_id, 'ingesta con secreto correcto → 200 con jugada');
    const bandeja = await req(B.base, 'GET', '/api/venty/bandeja', { headers: H });
    ok(bandeja.status === 200 && (bandeja.data.jugadas || []).some((j) => j.id === ing.data.jugada_id && j.tipo === 'responder_email'), 'la respuesta de la ingesta espera en la bandeja');
    db.close();
  } finally { await stop(B); }

  console.log(`\n— venty-slice4-representantes (api): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})();
