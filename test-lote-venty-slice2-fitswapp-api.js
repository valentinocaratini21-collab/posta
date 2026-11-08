// test-lote-venty-slice2-fitswapp-api.js — SLICE 2 FITSWAPP: rutas con boot real.
// Levanta el scratch con DATA_DIR aislada, registra un usuario, canjea el
// código web y juega las rutas del piloto: estado, web/conectar (la URL va
// fijada en el servidor), instagram/conectar, dominio-envio, email/enviar
// (gated) y el webhook de Instagram (challenge + firma). Sin credenciales
// reales. La conexión web real a fitswapp.com depende de la red: se acepta
// 200 (conectada) o 502 (sitio_sin_respuesta), nunca un dato inventado.
// Uso: node test-lote-venty-slice2-fitswapp-api.js  (NODE_PATH con node_modules)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('node:crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-slice2-'));
const PORT = 18762;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-slice2@test.com';

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
async function rawReq(method, p, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const rr = await fetch(BASE + p, { method, headers, body: opts.body });
  const text = await rr.text().catch(() => '');
  return { status: rr.status, text };
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env, DATA_DIR: TMP, PORT: String(PORT),
      ADMIN_TOKEN: 'testtoken-venty',
      WHATSAPP_VERIFY_TOKEN: 'wa-verify-test',
      INSTAGRAM_VERIFY_TOKEN: 'verify-test',
      INSTAGRAM_APP_SECRET: 'app-secret-test',
      VENTY_EMAIL_UNSUB_SECRET: 'secreto-baja-test',
    },
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261105-v797', `/api/version ${ver.build} (base v794 re-basada; número v797 asignado por el tablero)`);
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'test1234', business_name: 'Fitswapp Test' }),
    });
    ok(rr.status === 200 || rr.status === 201, `register (${rr.status})`);
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const vwt = require('./venty-web-tokens');
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    ok(row && row.id, 'usuario registrado en la DB de test');
    const issued = vwt.issueCode(db, row.id, EMAIL);
    const canje = await req('POST', '/api/auth/venty-token', { body: { code: issued.code } });
    ok(canje.status === 200 && /^[0-9a-f]{64}$/.test(canje.data.token || ''), 'canje código → token 200');
    const B = { Authorization: 'Bearer ' + canje.data.token };
    const sinAuth = await req('GET', '/api/venty/piloto/fitswapp', {});
    ok(sinAuth.status === 401, 'sin Bearer <redacted> piloto: 401');

    // --- estado inicial del piloto ---
    const pil0 = await req('GET', '/api/venty/piloto/fitswapp', { headers: B });
    ok(pil0.status === 200, 'GET piloto 200');
    ok(pil0.data.fundamento === 'borrador_sin_aprobar', 'piloto: fundamento borrador, nunca aprobado');
    ok(pil0.data.whatsapp && pil0.data.whatsapp.estado === 'excluido_piloto', 'piloto: WhatsApp excluido');
    ok(Array.isArray(pil0.data.bloqueos) && pil0.data.bloqueos.length === 3, 'piloto: 3 bloqueos al inicio (dominio + Meta + app review)');
    ok(pil0.data.email && pil0.data.email.listo_para_enviar_real === false, 'piloto: email no listo sin dominio');
    ok(pil0.data.web && pil0.data.web.website_url === 'https://fitswapp.com', 'piloto: URL fijada fitswapp.com');

    // --- web/conectar: 200 real o 502 honesto, nunca inventado ---
    const web = await req('POST', '/api/venty/piloto/fitswapp/web/conectar', { headers: B, body: {} });
    ok(web.status === 200 || web.status === 502, `POST web/conectar → ${web.status} (200 conectada o 502 sin respuesta)`);
    if (web.status === 200) {
      ok(web.data.website_url === 'https://fitswapp.com', 'web/conectar 200: website_url fitswapp.com');
      ok(JSON.stringify(web.data.paleta_hex) === JSON.stringify(['#FF6B00', '#0B0B0C']), 'web/conectar 200: paleta canónica Fitswapp');
      console.log('  (nota: fitswapp.com respondió en vivo; fuente conectada de verdad)');
    } else {
      ok(web.data.error === 'sitio_sin_respuesta', 'web/conectar 502: sitio_sin_respuesta (sin red o sitio caído, honesto)');
      console.log('  (nota: fitswapp.com no respondió en este entorno; la ruta queda verificada por el 502 honesto + el unit con stub)');
    }
    const partidas = await req('GET', '/api/venty/partidas', { headers: B });
    ok(partidas.status === 200 && (partidas.data.partidas || []).some((p) => p.cliente_nombre === 'Martín'), 'simulación Café Aroma intacta tras conectar la fuente (Martín sigue)');

    // --- instagram/conectar ---
    const ig = await req('POST', '/api/venty/piloto/fitswapp/instagram/conectar', { headers: B, body: {} });
    ok(ig.status === 200 && ig.data.conexion.etiqueta === '@fit.swapp', 'POST instagram/conectar: @fit.swapp');
    ok(ig.data.conexion.estado === 'falta_accion', 'instagram/conectar: falta_accion (sin cuenta de Meta)');
    ok((ig.data.conexion.ultimo_error || '').includes('instagram_manage_messages'), 'instagram/conectar: motivo con app review');

    // --- dominio-envio ---
    const domMalo = await req('POST', '/api/venty/piloto/fitswapp/dominio-envio', { headers: B, body: { dominio: 'https://fitswapp.com' } });
    ok(domMalo.status === 400, 'dominio con protocolo → 400');
    const domPosty = await req('POST', '/api/venty/piloto/fitswapp/dominio-envio', { headers: B, body: { dominio: 'postycommunitymanager.com' } });
    ok(domPosty.status === 400, 'dominio de Posty → 400');
    const domOk = await req('POST', '/api/venty/piloto/fitswapp/dominio-envio', { headers: B, body: { dominio: 'fitswapp.com' } });
    ok(domOk.status === 200 && domOk.data.dominio === 'fitswapp.com', 'dominio fitswapp.com → 200 y guardado');
    const pil1 = await req('GET', '/api/venty/piloto/fitswapp', { headers: B });
    ok(pil1.data.bloqueos.length === 2, 'con dominio fijado: quedan 2 bloqueos (Meta)');
    ok(pil1.data.email.dominio_envio === 'fitswapp.com', 'piloto: dominio_envio visible en el estado');

    // --- email/enviar piloto: la puerta del dominio ya pasó, falta jugada ---
    const envSinJugada = await req('POST', '/api/venty/piloto/fitswapp/email/enviar', { headers: B, body: {} });
    ok(envSinJugada.status === 400 && envSinJugada.data.error === 'sin_jugada', 'email piloto sin jugada → sin_jugada (el dominio ya no bloquea)');

    // --- webhook IG: challenge + firma (cableado v721, verificado acá) ---
    const igNoToken = await rawReq('GET', '/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=CH', {});
    ok(igNoToken.status === 403, 'webhook IG GET sin token → 403');
    const igOk = await rawReq('GET', '/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=CH123', {});
    ok(igOk.status === 200 && igOk.text === 'CH123', 'webhook IG GET con token → challenge');
    const igSinFirma = await rawReq('POST', '/api/webhooks/instagram', { headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(igSinFirma.status === 403, 'webhook IG POST sin firma → 403');
    const igBody = JSON.stringify({ entry: [{ messaging: [{ sender: { id: 's1' }, recipient: { id: 'ig-nadie' }, message: { mid: 'm1', text: 'hola' } }] }] });
    const igFirma = 'sha256=' + crypto.createHmac('sha256', 'app-secret-test').update(igBody).digest('hex');
    const igPost = await rawReq('POST', '/api/webhooks/instagram', { headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': igFirma }, body: igBody });
    ok(igPost.status === 200 && JSON.parse(igPost.text).ignorados === 1, 'webhook IG POST con firma → 200, sin dueño: ignorado');

    // --- estado general sigue real ---
    const est = await req('GET', '/api/venty/estado', { headers: B });
    ok(est.status === 200 && (est.data.canales || []).length === 5, 'GET /api/venty/estado: 5 canales');

    db.close();
  } finally {
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n— venty-slice2-fitswapp (api): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})();
