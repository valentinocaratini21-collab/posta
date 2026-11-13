// test-lote-venty-conectar4-api.js — VENTY-CONECTAR-4: rutas con boot real.
// Levanta el scratch con DATA_DIR aislada, registra un usuario, canjea el
// código web y juega las rutas nuevas: estado REAL, conexiones (listar,
// iniciar, revocar, duplicado), zonas / representantes / leads (dedupe),
// gobernador, dirección de email + baja, webhooks de Instagram y de
// WhatsApp por cliente (verificación + firma). Sin red externa ni
// credenciales reales: los secretos de webhook se fijan por env de test.
// Uso: node test-lote-venty-conectar4-api.js  (NODE_PATH con node_modules)
// Nota: el server necesita express; en este scratch no hay node_modules:
// correr con NODE_PATH=<posta con node_modules>/node_modules.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('node:crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-con4-'));
const PORT = 18761;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-con4@test.com';

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
      ADMIN_TOKEN: 'testtoken-venty', OPENAI_API_KEY: '',
      INSTAGRAM_VERIFY_TOKEN: 'verify-test', INSTAGRAM_APP_SECRET: 'app-secret-test',
      VENTY_EMAIL_UNSUB_SECRET: 'secreto-baja-test',
    },
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261105-v991', `/api/version ${ver.build} (re-pin a v991; número asignado por el tablero)`);
    // Registro + canje (patrón test-lote-venty-web1-api.js).
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'test1234', business_name: 'Café Aroma Test' }),
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
    const sinAuth = await req('GET', '/api/venty/conexiones', {});
    ok(sinAuth.status === 401, 'sin Bearer <redacted> conexiones: 401');

    // --- estado REAL (ya no hardcodeado) ---
    const est0 = await req('GET', '/api/venty/estado', { headers: B });
    ok(est0.status === 200, 'GET /api/venty/estado 200');
    const canales0 = (est0.data && est0.data.canales) || [];
    ok(canales0.some((c) => c.canal === 'simulacion' && c.estado === 'activo'), 'estado: simulación sigue activa');
    ok(canales0.some((c) => c.canal === 'whatsapp' && c.estado === 'no_conectado'), 'estado: whatsapp no_conectado al inicio (real, no hardcodeado)');
    ok(canales0.some((c) => c.canal === 'web' && c.estado === 'no_conectado'), 'estado: web no_conectada al inicio');
    eqLen(canales0, 5, 'estado: 5 canales (simulación + 4 reales)');

    // --- conexiones ---
    const list0 = await req('GET', '/api/venty/conexiones', { headers: B });
    ok(list0.status === 200 && list0.data.conexiones.length === 4, 'GET conexiones: 4 canales');
    const iniWa = await req('POST', '/api/venty/conexiones', { headers: B, body: { canal: 'whatsapp', proveedor: 'meta', etiqueta: 'mi número' } });
    ok(iniWa.status === 200 && iniWa.data.conexion.estado === 'falta_accion', 'POST conexiones whatsapp sin ref → falta_accion');
    const dupWa = await req('POST', '/api/venty/conexiones', { headers: B, body: { canal: 'whatsapp', credencial_ref: 'VENTY_WA_X' } });
    ok(dupWa.status === 400, 'segunda conexión whatsapp sin revocar → 400');
    const secreto = await req('POST', '/api/venty/conexiones', { headers: B, body: { canal: 'instagram', token: 'abc123' } });
    ok(secreto.status === 400, 'conectar con campo secreto → 400 (solo credencial_ref)');
    const revWa = await req('POST', '/api/venty/conexiones/whatsapp/revocar', { headers: B, body: {} });
    ok(revWa.status === 200 && revWa.data.conexion.estado === 'revocada', 'revocar whatsapp → revocada');
    const est1 = await req('GET', '/api/venty/estado', { headers: B });
    ok(est1.data.canales.some((c) => c.canal === 'whatsapp' && c.estado === 'revocado'), 'estado tras revocar: whatsapp revocado (real)');
    const canalMalo = await req('GET', '/api/venty/conexiones/telegram', { headers: B });
    ok(canalMalo.status === 400, 'canal desconocido → 400');

    // --- zonas / representantes / leads ---
    const zona = await req('POST', '/api/venty/zonas', { headers: B, body: { nombre: 'Centro', ciudad: 'CABA' } });
    ok(zona.status === 200 && zona.data.id, 'POST zonas Centro 200');
    const zonaDup = await req('POST', '/api/venty/zonas', { headers: B, body: { nombre: 'Centro' } });
    ok(zonaDup.status === 400, 'zona duplicada → 400');
    const rep = await req('POST', '/api/venty/representantes', { headers: B, body: { zona_id: zona.data.id, nombre: 'Ana', remitente_nombre: 'Ana de Café Aroma' } });
    ok(rep.status === 200 && rep.data.id, 'POST representantes en Centro 200');
    const repDup = await req('POST', '/api/venty/representantes', { headers: B, body: { zona_id: zona.data.id, nombre: 'Otro' } });
    ok(repDup.status === 400, 'segundo representante en la misma zona → 400');
    const lead = await req('POST', '/api/venty/leads', { headers: B, body: { zona_id: zona.data.id, nombre: 'Gimnasio Fuerza Viva', canal_preferido: 'instagram', puntaje: 91 } });
    ok(lead.status === 200 && lead.data.id, 'POST leads 200');
    const leadDup = await req('POST', '/api/venty/leads', { headers: B, body: { nombre: 'gimnasio fuerza viva' } });
    ok(leadDup.status === 400 && leadDup.data.error === 'lead_ya_existe', 'lead duplicado → 400 lead_ya_existe');
    const leads = await req('GET', '/api/venty/leads', { headers: B });
    ok(leads.status === 200 && leads.data.leads.length === 1, 'GET leads: 1 (dedupe)');
    const reps = await req('GET', '/api/venty/representantes', { headers: B });
    ok(reps.status === 200 && reps.data.representantes.length === 1, 'GET representantes: 1');

    // --- gobernador ---
    const gob = await req('GET', '/api/venty/gobernador', { headers: B });
    ok(gob.status === 200 && gob.data.dia.length === 3, 'GET gobernador: 3 canales');
    ok(gob.data.dia.find((d) => d.canal === 'whatsapp').tope === 20, 'gobernador: tope whatsapp 20');
    const topeAlto = await req('POST', '/api/venty/gobernador/tope', { headers: B, body: { canal: 'whatsapp', tope: 500 } });
    ok(topeAlto.status === 400, 'tope sobre el techo → 400');
    const topeBajo = await req('POST', '/api/venty/gobernador/tope', { headers: B, body: { canal: 'email', tope: 10 } });
    ok(topeBajo.status === 200 && topeBajo.data.tope === 10, 'bajar tope email a 10 → 200');

    // --- email: dirección + baja ---
    const dir0 = await req('GET', '/api/venty/email/direccion', { headers: B });
    ok(dir0.status === 200 && dir0.data.existe === false, 'dirección email: no existe al inicio');
    const dir1 = await req('POST', '/api/venty/email/direccion', { headers: B, body: {} });
    ok(dir1.status === 200 && /^venty\+[0-9a-f]{48}@ventysalesmanager\.com$/.test(dir1.data.direccion || ''), 'POST dirección: se genera una sola vez visible');
    const dir2 = await req('GET', '/api/venty/email/direccion', { headers: B });
    ok(dir2.status === 200 && dir2.data.direccion_visible.includes('••••••••'), 'GET dirección: enmascarada después');
    const bajaMala = await rawReq('GET', '/api/venty/email/baja?t=x&e=' + encodeURIComponent(EMAIL), {});
    ok(bajaMala.status === 400, 'baja con token inválido → 400');
    // Baja válida: token HMAC con el secreto de test (mismo cálculo del módulo).
    const tokBaja = crypto.createHmac('sha256', 'secreto-baja-test').update(row.id + '|' + EMAIL.toLowerCase()).digest('hex').slice(0, 32);
    const bajaOk = await rawReq('GET', '/api/venty/email/baja?t=' + tokBaja + '&e=' + encodeURIComponent(EMAIL), {});
    ok(bajaOk.status === 200 && /no te escribimos/.test(bajaOk.text), 'baja con token válido → 200 y supresión');
    const sup = db.prepare("SELECT email FROM venty_email_supresion WHERE user_id = ? AND email = ?").get(row.id, EMAIL.toLowerCase());
    ok(!!sup, 'baja registrada en la tabla de supresión');
    const dirRegen = await req('POST', '/api/venty/email/direccion', { headers: B, body: {} });
    ok(dirRegen.status === 200 && dirRegen.data.mato_anterior === true, 'regenerar dirección mata la anterior');

    // --- webhooks de Instagram ---
    const igNoToken = await rawReq('GET', '/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=CH', {});
    ok(igNoToken.status === 403, 'webhook IG GET sin token válido → 403');
    const igOk = await rawReq('GET', '/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=CH123', {});
    ok(igOk.status === 200 && igOk.text === 'CH123', 'webhook IG GET con token → challenge');
    const igSinFirma = await rawReq('POST', '/api/webhooks/instagram', { headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(igSinFirma.status === 403, 'webhook IG POST sin firma → 403');
    const igBody = JSON.stringify({ entry: [{ messaging: [{ sender: { id: 's1' }, recipient: { id: 'ig-nadie' }, message: { mid: 'm1', text: 'hola' } }] }] });
    const igFirma = 'sha256=' + crypto.createHmac('sha256', 'app-secret-test').update(igBody).digest('hex');
    const igPost = await rawReq('POST', '/api/webhooks/instagram', { headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': igFirma }, body: igBody });
    ok(igPost.status === 200, 'webhook IG POST con firma → 200 (destinatario sin dueño: ignorado)');
    const igPostBody = JSON.parse(igPost.text);
    ok(igPostBody.ignorados === 1, 'webhook IG: mensaje sin dueño → ignorado, no inventa');

    // --- webhook de WhatsApp por cliente ---
    const waNoToken = await rawReq('GET', '/api/webhooks/whatsapp-venty?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=CH', {});
    ok(waNoToken.status === 403, 'webhook WA-venty GET sin token → 403');
    const waSinFirma = await rawReq('POST', '/api/webhooks/whatsapp-venty', { headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(waSinFirma.status === 403, 'webhook WA-venty POST sin firma → 403');

    // --- hilos vacíos al inicio ---
    const hilosWa = await req('GET', '/api/venty/whatsapp/hilos', { headers: B });
    ok(hilosWa.status === 200 && Array.isArray(hilosWa.data.hilos) && hilosWa.data.hilos.length === 0, 'hilos WA vacíos al inicio');
    const hilosIg = await req('GET', '/api/venty/instagram/hilos', { headers: B });
    ok(hilosIg.status === 200 && Array.isArray(hilosIg.data.hilos) && hilosIg.data.hilos.length === 0, 'hilos IG vacíos al inicio');

    db.close();
  } finally {
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n— venty-conectar4 (api): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})();

function eqLen(arr, n, msg) { ok(Array.isArray(arr) && arr.length === n, `${msg} (esperaba ${n}, dio ${arr && arr.length})`); }
