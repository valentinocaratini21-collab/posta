// test-lote-venty-web1-api.js — VENTY slice 1-web: boot real + flujo de auth web.
// Levanta el scratch API con DATA_DIR aislada, registra un usuario y juega el
// flujo completo: CORS preflight, code-request (sin revelar existencia,
// rate-limit, guard sin RESEND_API_KEY), canje código → token, Bearer en los
// 20 endpoints /api/venty/* + /api/oficina/nivel, refresh, revoke, expiración.
// Uso: node test-lote-venty-web1-api.js  (desde api/ del scratch)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('node:crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-web1-'));
const PORT = 18760;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-web@test.com';

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function req(method, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const rr = await fetch(BASE + p, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data, headers: rr.headers };
}
async function register(email) {
  const rr = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234', business_name: 'Café Aroma Test' }),
  });
  const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
  return { status: rr.status, cookie: cookies.map((c) => c.split(';')[0]).join('; ') };
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-venty', OPENAI_API_KEY: '' },
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    const buildInFile = (fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').match(/BUILD_ID\s*=\s*'([^']+)'/) || [])[1];
    ok(ver.build === buildInFile, `/api/version ${ver.build} (BUILD del archivo ${buildInFile})`);

    // --- sesión de Posty sigue funcionando (requireAuthOrWebToken) ---
    const u = await register(EMAIL);
    ok(u.status === 200 || u.status === 201, `register (${u.status})`);
    const ses = await req('GET', '/api/venty/estado', { headers: { Cookie: u.cookie } });
    ok(ses.status === 200 && ses.data && ses.data.modo === 'prueba', 'sesión Posty: /api/venty/estado 200 (modo prueba)');

    // --- sin auth: 401 ---
    const sinAuth = await req('GET', '/api/venty/estado');
    ok(sinAuth.status === 401, 'sin token ni sesión: 401');

    // --- CORS preflight ---
    const pre = await fetch(`${BASE}/api/venty/estado`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    });
    ok(pre.status === 204, 'preflight ventysalesmanager.com: 204');
    ok(pre.headers.get('access-control-allow-origin') === ORIGIN, 'preflight: Allow-Origin exacto ventysalesmanager.com');
    const preEvil = await fetch(`${BASE}/api/venty/estado`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'GET' },
    });
    ok(!preEvil.headers.get('access-control-allow-origin'), 'preflight origen no permitido: sin Allow-Origin');
    const conOrigen = await req('GET', '/api/venty/estado', { headers: { Origin: ORIGIN } });
    ok(conOrigen.status === 401 && conOrigen.headers.get('access-control-allow-origin') === ORIGIN, 'GET sin auth pero con Origin permitido: 401 + Allow-Origin');

    // --- code-request: no revela existencia, valida email, rate-limit, guard sin Resend ---
    const desc = await req('POST', '/api/auth/venty-code-request', { body: { email: 'nadie@desconocido.com' } });
    ok(desc.status === 200 && desc.data && desc.data.ok === true, 'code-request email desconocido: 200 {ok:true} (no revela)');
    const malo = await req('POST', '/api/auth/venty-code-request', { body: { email: 'no-es-email' } });
    ok(malo.status === 200 && malo.data && malo.data.ok === true, 'code-request email inválido: 200 {ok:true} (no revela ni la validez)');
    for (let i = 0; i < 5; i++) await req('POST', '/api/auth/venty-code-request', { body: { email: 'ratelimit@test.com' } });
    const sexto = await req('POST', '/api/auth/venty-code-request', { body: { email: 'ratelimit@test.com' } });
    ok(sexto.status === 429, 'code-request 6º intento mismo email+IP: 429');
    const sinResend = await req('POST', '/api/auth/venty-code-request', { body: { email: EMAIL } });
    ok(sinResend.status === 503, 'code-request usuario real sin RESEND_API_KEY: 503 honesto');

    // --- código emitido en proceso (el email no puede salir en test) ---
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const vwt = require('./venty-web-tokens');
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    ok(row && row.id, 'usuario registrado en la DB de test');
    const uid = row.id;
    const issued = vwt.issueCode(db, uid, EMAIL);
    const code = issued && issued.code;
    ok(/^[0-9a-f]{32}$/.test(code || ''), 'issueCode: código 32-hex (16 bytes)');
    const canje = await req('POST', '/api/auth/venty-token', { body: { code } });
    ok(canje.status === 200 && canje.data && /^[0-9a-f]{64}$/.test(canje.data.token || ''), 'canje código → token 200');
    const token = canje.data.token;
    const reuso = await req('POST', '/api/auth/venty-token', { body: { code } });
    ok(reuso.status === 401, 'reuso del código: 401 (un solo uso)');
    const codigoMalo = await req('POST', '/api/auth/venty-token', { body: { code: '00'.repeat(16) } });
    ok(codigoMalo.status === 401, 'código malo: 401');
    // solo el hash vive en el servidor
    const fila = vwt.rowForToken(db, token);
    ok(fila && fila.token_hash === crypto.createHash('sha256').update(token).digest('hex'), 'token guardado como hash SHA-256');
    ok(fila && fila.token_hash !== token, 'el token en claro NO está en la DB');
    // código emitido por sesión (flujo return_to futuro)
    const codeSes = await req('GET', '/api/auth/venty-code', { headers: { Cookie: u.cookie } });
    ok(codeSes.status === 200 && /^[0-9a-f]{32}$/.test(codeSes.data.code || ''), 'GET /api/auth/venty-code con sesión: 200 código 32-hex');
    const canjeSes = await req('POST', '/api/auth/venty-token', { body: { code: codeSes.data.code } });
    ok(canjeSes.status === 200 && canjeSes.data.token, 'canje del código de sesión → token 200');

    // --- Bearer en los endpoints Venty + oficina/nivel (datos de la semilla) ---
    const B = { Authorization: 'Bearer ' + token };
    const estado = await req('GET', '/api/venty/estado', { headers: B });
    ok(estado.status === 200 && estado.data.modo === 'prueba', 'Bearer: /api/venty/estado 200');
    const partidas = await req('GET', '/api/venty/partidas', { headers: B });
    ok(partidas.status === 200 && Array.isArray(partidas.data.partidas) && partidas.data.partidas.length === 8, 'Bearer: /api/venty/partidas → 8 partidas');
    const bandeja = await req('GET', '/api/venty/bandeja', { headers: B });
    ok(bandeja.status === 200 && Array.isArray(bandeja.data.jugadas) && bandeja.data.jugadas.length === 3, 'Bearer: /api/venty/bandeja → 3 jugadas');
    const frase = await req('GET', '/api/venty/frase', { headers: B });
    ok(frase.status === 200 && frase.data.tasa_cierre_pct === 50 && frase.data.primera_respuesta_seg === 42, 'Bearer: /api/venty/frase → 50% / 42 s');
    const parte = await req('GET', '/api/venty/parte', { headers: B });
    ok(parte.status === 200 && parte.data.ventas === 3 && parte.data.monto === 105000, 'Bearer: /api/venty/parte → 3 ventas $105.000');
    const mensajes = await req('GET', '/api/venty/mensajes-hoy', { headers: B });
    ok(mensajes.status === 200 && Array.isArray(mensajes.data.mensajes) && mensajes.data.mensajes.length === 8, 'Bearer: /api/venty/mensajes-hoy → 8');
    const caza = await req('GET', '/api/venty/caza', { headers: B });
    ok(caza.status === 200 && caza.data.cupo_semanal && caza.data.cupo_semanal.usados === 8 && caza.data.cupo_semanal.tope === 12, 'Bearer: /api/venty/caza → cupo 8/12');
    const fund = await req('GET', '/api/venty/fundamento', { headers: B });
    ok(fund.status === 200 && fund.data.fundamento && fund.data.fundamento.estrella === 'Brunch Aroma para dos', 'Bearer: /api/venty/fundamento → estrella Brunch Aroma');
    const nivel = await req('GET', '/api/oficina/nivel', { headers: B });
    ok(nivel.status === 200, 'Bearer: /api/oficina/nivel 200');
    const chat = await req('POST', '/api/venty/chat', { headers: B, body: { text: 'hola' } });
    ok(chat.status === 200, 'Bearer: POST /api/venty/chat 200');
    // token malo / vencido
    const tokenMalo = await req('GET', '/api/venty/estado', { headers: { Authorization: 'Bearer xyz' } });
    ok(tokenMalo.status === 401, 'Bearer inválido: 401');
    const expirado = vwt.issueWebToken(db, uid, 'test-expirado', Date.now() - 61 * 24 * 3600 * 1000);
    const conExpirado = await req('GET', '/api/venty/estado', { headers: { Authorization: 'Bearer ' + expirado.token } });
    ok(conExpirado.status === 401, 'token vencido: 401');

    // --- refresh rota, revoke mata ---
    const refresh = await req('POST', '/api/auth/venty-refresh', { headers: B });
    ok(refresh.status === 200 && refresh.data.token && refresh.data.token !== token, 'refresh: 200 con token nuevo distinto');
    const viejoMuerto = await req('GET', '/api/venty/estado', { headers: B });
    ok(viejoMuerto.status === 401, 'refresh: el token viejo ya no sirve (401)');
    const nuevoVivo = await req('GET', '/api/venty/estado', { headers: { Authorization: 'Bearer ' + refresh.data.token } });
    ok(nuevoVivo.status === 200, 'refresh: el token nuevo sirve (200)');
    const revoke = await req('POST', '/api/auth/venty-revoke', { headers: { Authorization: 'Bearer ' + refresh.data.token } });
    ok(revoke.status === 200 && revoke.data.ok === true, 'revoke: 200 {ok:true}');
    const revocado = await req('GET', '/api/venty/estado', { headers: { Authorization: 'Bearer ' + refresh.data.token } });
    ok(revocado.status === 401, 'revoke: el token revocado ya no sirve (401)');
    db.close();
  } finally {
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n— venty slice 1-web (api): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})();
