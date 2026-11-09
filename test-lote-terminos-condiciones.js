// test-lote-terminos-condiciones.js — TÉRMINOS Y CONDICIONES v1.0 (9/11):
// 1) /terminos.html (ES) y /terms.html (EN) reemplazan las páginas viejas con
//    el documento v1.0 completo (15 secciones + Definiciones), email de
//    contacto confirmado hola@postycommunitymanager.com en §15 y domicilio
//    legal marcado como pendiente (no inventado); §13 linkea a la Política
//    de Privacidad existente; §10.3 como redactada, sin cambiar.
// 2) La app muestra los T&C en #/app/terminos (chunk-terminos.js, ES+EN,
//    paridad con las páginas) y enlaza desde Ajustes (grupo «Más»).
// 3) El alta (#/registro) exige el tilde de Términos y el servidor guarda
//    terms_accepted_at (fail-open: sin el flag la cuenta se crea igual, con
//    NULL — app.js cacheado viejo sigue pudiendo registrarse).
// 4) /prueba y /en-prueba enlazan los Términos y la Privacidad en el pie.
// Base: v829. Paridad ES+EN.
// Uso: node test-lote-terminos-condiciones.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const http = require('http'), crypto = require('crypto'), os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const aj = fs.readFileSync(path.join(__dirname, 'public', 'chunk-ajustes.js'), 'utf8');
const tc = fs.readFileSync(path.join(__dirname, 'public', 'chunk-terminos.js'), 'utf8');
const termES = fs.readFileSync(path.join(__dirname, 'public', 'terminos.html'), 'utf8');
const termEN = fs.readFileSync(path.join(__dirname, 'public', 'terms.html'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;

const TITLES_ES = ['Definiciones', '1. Qué es Posty', '2. Cuenta, conexión con Instagram y Fundamento', '3. Prueba gratuita', '4. Plan y precio', '5. Pagos, impuestos y facturación', '6. Aprobación y publicación de posteos', '7. Video premium e Impulsar', '8. Contenido del Cliente y propiedad intelectual', '9. Programa de referidos', '10. Cancelación y reembolsos', '11. Uso aceptable', '12. Disponibilidad, plataformas de terceros y responsabilidad', '13. Privacidad y datos', '14. Cambios en el Servicio y en estos Términos', '15. Ley aplicable y contacto'];
const TITLES_EN = ['Definitions', '1. What Posty is', '2. Account, Instagram connection and Foundation', '3. Free trial', '4. Plan and price', '5. Payments, taxes and billing', '6. Post approval and publishing', '7. Premium video and Boost', '8. Client content and intellectual property', '9. Referral program', '10. Cancellation and refunds', '11. Acceptable use', '12. Availability, third-party platforms and liability', '13. Privacy and data', '14. Changes to the Service and to these Terms', '15. Governing law and contact'];

/* ---------- 1. Páginas del website ---------- */
console.log('— 1. /terminos.html (ES, doc v1.0) —');
for (const t of TITLES_ES) ok(termES.includes('<h2>' + t + '</h2>'), 'ES: sección «' + t + '»');
ok(termES.includes('Versión 1.0'), 'ES: Versión 1.0');
ok(termES.includes('9 de noviembre de 2026'), 'ES: fecha 9 de noviembre de 2026');
ok(termES.includes('Bambooty LLC'), 'ES: Bambooty LLC');
ok(termES.includes('USD 199'), 'ES: USD 199');
ok(termES.includes('La prueba dura 3 días'), 'ES: prueba 3 días');
ok(termES.includes('Silencio = publicación'), 'ES: regla 6.3 Silencio = publicación');
ok(termES.includes('No se hacen reembolsos parciales por el período en curso'), 'ES: §10.3 como redactada');
ok(termES.includes('hola@postycommunitymanager.com'), 'ES: email de contacto');
ok(termES.includes('Domicilio legal: pendiente de publicación.'), 'ES: domicilio legal marcado como pendiente');
ok(termES.includes('href="/privacidad.html"'), 'ES: §13 linkea /privacidad.html');
ok(termES.includes('Fin de los Términos y Condiciones de Posty, versión 1.0'), 'ES: cierre del documento');
ok(!termES.includes('siempre tenés la última palabra'), 'ES: fuera el texto viejo (última palabra)');
ok(!termES.includes('MercadoPago</strong> (débito automático)'), 'ES: fuera el pago solo-MP');
ok(!termES.includes('República Argentina'), 'ES: fuera la ley argentina como aplicable');
ok(!termES.includes('Hecho en Argentina'), 'ES: fuera «Hecho en Argentina» del pie');
ok(!termES.includes('25 de septiembre de 2026'), 'ES: fuera la fecha vieja');
ok(cnt(termES, /<h2>/g) === 16, 'ES: 16 h2 (Definiciones + 15 secciones)');
ok(cnt(termES, /<h3>/g) === 9, 'ES: 9 h3 (2.1–2.4, 5.1–5.3, 7.1–7.2)');
ok(termES.includes('href="https://postycommunitymanager.com/terms.html"'), 'ES: hreflang EN apunta a /terms.html');

console.log('— 1b. /terms.html (EN, traducción fiel) —');
for (const t of TITLES_EN) ok(termEN.includes('<h2>' + t + '</h2>'), 'EN: sección «' + t + '»');
ok(termEN.includes('Version 1.0'), 'EN: Version 1.0');
ok(termEN.includes('November 9, 2026'), 'EN: fecha November 9, 2026');
ok(termEN.includes('Bambooty LLC'), 'EN: Bambooty LLC');
ok(termEN.includes('USD 199'), 'EN: USD 199');
ok(termEN.includes('The trial lasts 3 days'), 'EN: trial 3 days');
ok(termEN.includes('Silence = publication'), 'EN: regla 6.3 Silence = publication');
ok(termEN.includes('There are no partial refunds for the current period'), 'EN: §10.3 como redactada');
ok(termEN.includes('hola@postycommunitymanager.com'), 'EN: email de contacto');
ok(termEN.includes('Legal address: pending publication.'), 'EN: domicilio legal marcado como pendiente');
ok(termEN.includes('href="/privacy.html"'), 'EN: §13 linkea /privacy.html');
ok(termEN.includes("End of Posty's Terms and Conditions, version 1.0"), 'EN: cierre del documento');
ok(!termEN.includes('Republic of Argentina'), 'EN: fuera la ley argentina como aplicable');
ok(!termEN.includes('Made in Argentina'), 'EN: fuera «Made in Argentina» del pie');
ok(cnt(termEN, /<h2>/g) === 16, 'EN: 16 h2 (paridad con ES)');
ok(cnt(termEN, /<h3>/g) === 9, 'EN: 9 h3 (paridad con ES)');

/* ---------- 2. Chunk de la app ---------- */
console.log('— 2. chunk-terminos.js —');
ok(fs.existsSync(path.join(__dirname, 'public', 'chunk-terminos.js')), 'existe chunk-terminos.js');
ok(tc.includes('function terminosView()'), 'define terminosView');
ok(tc.includes('function tcLang()'), 'define tcLang');
ok(tc.includes('function tcToggleLang()'), 'define tcToggleLang');
ok(tc.includes("const TC_VER = '1.0'"), 'versión 1.0');
ok(tc.includes('hola@postycommunitymanager.com'), 'chunk: email de contacto');
ok(tc.includes('Domicilio legal: pendiente de publicación.'), 'chunk ES: domicilio pendiente');
ok(tc.includes('Legal address: pending publication.'), 'chunk EN: domicilio pendiente');
ok(tc.includes('<h2>Definiciones</h2>'), 'chunk ES: «Definiciones» (en defs)');
ok(tc.includes('<h2>Definitions</h2>'), 'chunk EN: «Definitions» (en defs)');
for (const t of TITLES_ES.slice(1)) ok(tc.includes("'" + t + "'"), 'chunk ES: sección «' + t + '»');
for (const t of TITLES_EN.slice(1)) ok(tc.includes("'" + t + "'"), 'chunk EN: sección «' + t + '»');
ok(tc.includes('Silencio = publicación'), 'chunk ES: regla 6.3');
ok(tc.includes('Silence = publication'), 'chunk EN: regla 6.3');
ok(tc.includes('No se hacen reembolsos parciales'), 'chunk ES: §10.3');
ok(tc.includes('There are no partial refunds'), 'chunk EN: §10.3');
ok(tc.includes('href="/privacidad.html"'), 'chunk ES: §13 linkea privacidad');
ok(tc.includes('href="/privacy.html"'), 'chunk EN: §13 linkea privacy');
try { new vm.Script(tc); ok(true, 'chunk compila (vm.Script)'); } catch (e) { ok(false, 'chunk compila (vm.Script): ' + e.message); }

/* ---------- 3. app.js: ruta + alta ---------- */
console.log('— 3. app.js —');
ok(app.includes("else if (tab === 'terminos')"), 'ruta #/app/terminos');
ok(app.includes("loadChunk('terminos')"), 'ruta carga el chunk terminos');
ok(app.includes('terminosView()'), 'ruta rinde terminosView');
ok(app.includes("termsAccept: 'Acepto los'"), 'AUTH_STR ES: termsAccept');
ok(app.includes("termsLink: 'Términos y Condiciones'"), 'AUTH_STR ES: termsLink');
ok(app.includes('termsRequired: \'Para crear tu cuenta tenés que aceptar'), 'AUTH_STR ES: termsRequired');
ok(app.includes("termsAccept: 'I accept the'"), 'AUTH_STR EN: termsAccept');
ok(app.includes("termsLink: 'Terms and Conditions'"), 'AUTH_STR EN: termsLink');
ok(app.includes('termsRequired: \'To create your account you need to accept'), 'AUTH_STR EN: termsRequired');
ok(app.includes('id="f_terms"'), 'authView: checkbox f_terms');
ok(app.includes("authLang() === 'en' ? '/terms.html' : '/terminos.html'"), 'authView: link a /terms.html o /terminos.html según idioma');
ok(app.includes("getElementById('f_terms')"), 'submit: gate del tilde en el alta');
ok(app.includes('authStr().termsRequired'), 'submit: error termsRequired');
ok(app.includes('body.terms_accepted = 1'), 'submit: manda terms_accepted = 1 en el registro');
// Funciones auditadas: todo lo que llama el código nuevo existe definido.
const fnsApp = ['function loadChunk(', 'function terminosView', 'function chunkFailHTML', 'function pzPaintSkeleton(', 'function authStr(', 'function authLang('];
for (const f of fnsApp) {
  const where = f === 'function terminosView' ? tc : app;
  ok(where.includes(f), 'función auditada: ' + f.replace('function ', '').replace('(', '') + ' existe');
}
ok(app.includes("function bbGo(") || app.includes('bbGo ='), 'función auditada: bbGo existe (fila Ajustes)');
ok(app.includes('function pzIc('), 'función auditada: pzIc existe (fila Ajustes)');
ok(app.includes('function render('), 'función auditada: render existe (toggle de idioma del chunk)');

/* ---------- 4. Ajustes ---------- */
console.log('— 4. chunk-ajustes.js —');
ok(aj.includes("bbGo('#/app/terminos')"), 'Ajustes: fila abre #/app/terminos');
ok(aj.includes("'Términos y Condiciones'"), 'Ajustes: fila ES «Términos y Condiciones»');
ok(aj.includes("'Terms and Conditions'"), 'Ajustes: fila EN «Terms and Conditions»');
ok(aj.includes("pzIc('shield', 20)"), 'Ajustes: fila con icono shield');
ok(aj.includes('Versión 1.0 · 9 de noviembre de 2026'), 'Ajustes: subtítulo ES con versión y fecha');

/* ---------- 5. Servidor + DB ---------- */
console.log('— 5. server.js + db.js —');
ok(srv.includes('terms_accepted'), 'server: register lee terms_accepted');
ok(srv.includes('terms_accepted_at'), 'server: register guarda terms_accepted_at');
ok(srv.includes('const termsAt = terms_accepted ?'), 'server: termsAt solo si hay flag');
ok(!/if \(!terms_accepted\)/.test(srv), 'server: sin rechazo si falta el flag (fail-open)');
ok(dbjs.includes('ALTER TABLE users ADD COLUMN terms_accepted_at TEXT'), 'db.js: columna terms_accepted_at');

/* ---------- 6. Páginas de prueba ---------- */
console.log('— 6. prueba.html / en-prueba.html —');
const prueba = fs.readFileSync(path.join(__dirname, 'public', 'prueba.html'), 'utf8');
const enPrueba = fs.readFileSync(path.join(__dirname, 'public', 'en-prueba.html'), 'utf8');
ok(prueba.includes('href="/terminos.html">Términos y Condiciones</a>'), 'prueba: pie enlaza Términos');
ok(prueba.includes('href="/privacidad.html">Privacidad</a>'), 'prueba: pie enlaza Privacidad');
ok(enPrueba.includes('href="/terms.html">Terms and Conditions</a>'), 'en-prueba: pie enlaza Terms');
ok(enPrueba.includes('href="/privacy.html">Privacy</a>'), 'en-prueba: pie enlaza Privacy');

/* ---------- 7. VM: terminosView ES + EN ---------- */
console.log('— 7. VM: terminosView —');
{
  const store = {};
  const ctx = {
    console, ME: { lang: 'es' },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    render: () => { ctx.__rendered = (ctx.__rendered || 0) + 1; },
  };
  vm.createContext(ctx);
  vm.runInContext(tc, ctx);
  ok(typeof ctx.terminosView === 'function', 'VM: terminosView existe');
  const vEs = ctx.terminosView();
  for (const t of TITLES_ES) ok(vEs.includes(t), 'VM ES: «' + t + '»');
  ok(vEs.includes('hola@postycommunitymanager.com'), 'VM ES: email');
  ok(vEs.includes('Domicilio legal: pendiente de publicación.'), 'VM ES: domicilio pendiente');
  ok(vEs.includes('Read in English'), 'VM ES: toggle a EN');
  ctx.render = () => { ctx.__rendered = (ctx.__rendered || 0) + 1; };
  ctx.tcToggleLang();
  ok(ctx.__rendered === 1, 'VM: tcToggleLang re-renderiza');
  const vEn = ctx.terminosView();
  for (const t of TITLES_EN) ok(vEn.includes(t), 'VM EN: «' + t + '»');
  ok(vEn.includes('hola@postycommunitymanager.com'), 'VM EN: email');
  ok(vEn.includes('Legal address: pending publication.'), 'VM EN: domicilio pendiente');
  ok(vEn.includes('Leer en español'), 'VM EN: toggle a ES');
}

/* ---------- 8. Boot aislado ---------- */
console.log('— 8. boot —');
(async () => {
  const NODE_PATH_POSTA = '/home/hatch/workspace/posta/node_modules';
  let expressOk = fs.existsSync(path.join(NODE_PATH_POSTA, 'express', 'package.json'));
  if (!expressOk) {
    console.log('  (boot omitido: express no resuelve en este árbol)');
  } else {
    const PORT = 34582;
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-terminos-'));
    const srvProc = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), NODE_PATH: NODE_PATH_POSTA, OPENAI_API_KEY: '' }, stdio: 'ignore' });
    const pid = srvProc.pid;
    console.log('  boot PID: ' + pid);
    const req = (method, p, body) => new Promise((res, rej) => {
      const data = body ? JSON.stringify(body) : null;
      const q = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: { 'User-Agent': 'lote-terminos/1.0', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (r) => {
        const chunks = []; r.on('data', (c) => { chunks.push(c); }); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: r.headers }));
      });
      q.on('error', rej); if (data) q.write(data); q.end();
    });
    const get = (p) => req('GET', p);
    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
    // Valores estampados se leen del árbol (la suite sobrevive al re-estampado).
    const buildTree = (srv.match(/BUILD_ID = '([^']+)'/) || [])[1] || '';
    const chunkVTree = (app.match(/const CHUNK_V = '([^']+)'/) || [])[1] || '';
    const appVTree = (fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').match(/app\.js\?v=(\d+)/) || [])[1] || '';
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); try { const v = await get('/api/version'); up = v.status === 200; } catch (e) {} }
    ok(up, 'boot levanta (PID ' + pid + ')');
    if (up) {
      const ver = JSON.parse((await get('/api/version')).body);
      ok(buildTree && ver.build === buildTree, '/api/version = BUILD del árbol (' + buildTree + ')');
      const tES = await get('/terminos.html');
      ok(tES.status === 200 && md5(tES.body) === md5(termES), '/terminos.html servido = árbol');
      ok(tES.body.includes('Silencio = publicación'), 'servido ES: regla 6.3');
      ok(tES.body.includes('Domicilio legal: pendiente de publicación.'), 'servido ES: domicilio pendiente');
      const tEN = await get('/terms.html');
      ok(tEN.status === 200 && md5(tEN.body) === md5(termEN), '/terms.html servido = árbol');
      ok(tEN.body.includes('Silence = publication'), 'servido EN: regla 6.3');
      const priv = await get('/privacidad.html');
      ok(priv.status === 200 && priv.body.includes('Política de Privacidad'), 'servido: /privacidad.html existe (destino §13)');
      const privEn = await get('/privacy.html');
      ok(privEn.status === 200 && privEn.body.includes('Privacy Policy'), 'servido: /privacy.html existe (destino §13 EN)');
      const chunk = await get('/chunk-terminos.js?v=' + chunkVTree);
      ok(chunk.status === 200 && md5(chunk.body) === md5(tc), 'chunk-terminos.js servido = árbol');
      const appS = await get('/app.js?v=' + appVTree);
      ok(appS.status === 200 && md5(appS.body) === md5(app), 'app.js?v=' + appVTree + ' servido = árbol');
      ok(appS.body.includes("tab === 'terminos'"), 'servido: ruta terminos presente');
      ok(appS.body.includes('f_terms'), 'servido: checkbox f_terms presente');
      const ajS = await get('/chunk-ajustes.js?v=' + chunkVTree);
      ok(ajS.status === 200 && md5(ajS.body) === md5(aj), 'chunk-ajustes.js servido = árbol');
      ok(ajS.body.includes("bbGo('#/app/terminos')"), 'servido: fila Términos en Ajustes');
      // Alta con aceptación → terms_accepted_at con fecha.
      const em1 = 'tc-acepta-' + Date.now() + '@test.dev';
      const r1 = await req('POST', '/api/auth/register', { email: em1, password: 'abcdef', terms_accepted: 1, lang: 'es' });
      ok(r1.status === 200, 'register con terms_accepted: 200');
      // Alta sin el flag → se crea igual (fail-open), terms_accepted_at NULL.
      const em2 = 'tc-viejo-' + Date.now() + '@test.dev';
      const r2 = await req('POST', '/api/auth/register', { email: em2, password: 'abcdef', lang: 'es' });
      ok(r2.status === 200, 'register sin terms_accepted: 200 (fail-open)');
      const db = new DatabaseSync(path.join(TMP, 'posta.db'), { readOnly: true });
      const row1 = db.prepare('SELECT terms_accepted_at FROM users WHERE email = ?').get(em1);
      const row2 = db.prepare('SELECT terms_accepted_at FROM users WHERE email = ?').get(em2);
      ok(row1 && row1.terms_accepted_at && /^\d{4}-\d{2}-\d{2}T/.test(row1.terms_accepted_at), 'DB: alta con flag guarda terms_accepted_at (' + (row1 && row1.terms_accepted_at) + ')');
      ok(row2 && row2.terms_accepted_at === null, 'DB: alta sin flag deja terms_accepted_at NULL');
      db.close();
    }
    srvProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1500));
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { alive = false; }
    ok(!alive, 'boot muerto tras SIGTERM por PID exacto (' + pid + ')');
    const portFree = await new Promise((res) => { const s = http.get({ host: '127.0.0.1', port: PORT, path: '/api/version' }, () => res(false)); s.on('error', () => res(true)); });
    ok(portFree, 'puerto ' + PORT + ' libre tras matar el boot');
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\ntest-lote-terminos-condiciones: ${pass} ok, ${fail} mal`);
  if (fail) console.log('fallos: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
