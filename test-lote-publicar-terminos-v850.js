// test-lote-publicar-terminos-v850.js — PUBLICAR T&C v1.0 (v850):
// Lo único que cambia es el domicilio legal de Bambooty LLC, que pasa de
// «pendiente de publicación» a 105 Rogers St NE, Atlanta, GA 30317,
// Estados Unidos — en el encabezado (donde el documento identifica a
// Bambooty LLC) y en §15 contacto, en /terminos.html (ES), /terms.html (EN)
// y en la vista en la app (chunk-terminos.js, ES+EN).
// §10.3 (reembolsos) NO se toca: ya coincide con el texto confirmado.
// La ley aplicable NO se toca. app.js cambia SOLO CHUNK_V v849->v850 (chunk-terminos
// publica el domicilio; es lazy, sin el bump el cliente seguiría con el chunk cacheado
// con el placeholder) + ?v=581 en el index ES (regla dura: cada push que toca app.js
// bumpea ?v=). M78 7/7 (sin funciones nuevas ni borradas). EN y styles.css sin cambio.
// Base: v845 (f1359765). Uso: node test-lote-publicar-terminos-v850.js
// (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const http = require('http'), crypto = require('crypto'), os = require('os');
const { spawn } = require('child_process');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const tc = fs.readFileSync(path.join(__dirname, 'public', 'chunk-terminos.js'), 'utf8');
const termES = fs.readFileSync(path.join(__dirname, 'public', 'terminos.html'), 'utf8');
const termEN = fs.readFileSync(path.join(__dirname, 'public', 'terms.html'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const cnt = (s, re) => (s.match(re) || []).length;

const DOM_ES = '105 Rogers St NE, Atlanta, GA 30317, Estados Unidos';
const DOM_EN = '105 Rogers St NE, Atlanta, GA 30317, United States';
const SEC103_ES = 'No se hacen reembolsos parciales por el período en curso ni por posteos no utilizados, salvo en dos casos: cargos duplicados o erróneos, y fallas prolongadas del Servicio imputables a Bambooty que impidan publicar. En esos casos el reembolso o el crédito es proporcional al tiempo afectado.';
const SEC103_EN = 'There are no partial refunds for the current period or for unused posts, except in two cases: duplicate or erroneous charges, and prolonged Service failures attributable to Bambooty that prevent publishing. In those cases the refund or credit is proportional to the time affected.';
const LEY_ES = 'Estos Términos se rigen por las leyes del estado de registro de Bambooty LLC, en los Estados Unidos';
const LEY_EN = 'These Terms are governed by the laws of the state of registration of Bambooty LLC, in the United States';

/* ---------- A. Estática: el domicilio publicado ---------- */
console.log('— A. domicilio en las 3 superficies, ES+EN —');
// Encabezado (meta) — donde el documento identifica a Bambooty LLC.
ok(termES.includes('Versión 1.0 · 9 de noviembre de 2026 · Bambooty LLC · ' + DOM_ES), 'ES html: encabezado con domicilio');
ok(termEN.includes('Version 1.0 · November 9, 2026 · Bambooty LLC · ' + DOM_EN), 'EN html: encabezado con domicilio');
ok(tc.includes("meta: 'Versión 1.0 · 9 de noviembre de 2026 · Bambooty LLC · " + DOM_ES + "'"), 'chunk ES: meta con domicilio');
ok(tc.includes("meta: 'Version 1.0 · November 9, 2026 · Bambooty LLC · " + DOM_EN + "'"), 'chunk EN: meta con domicilio');
// §15 contacto.
ok(termES.includes('<p>Domicilio legal: ' + DOM_ES + '.</p>'), 'ES html: §15 domicilio');
ok(termEN.includes('<p>Legal address: ' + DOM_EN + '.</p>'), 'EN html: §15 domicilio');
ok(tc.includes('<p>Domicilio legal: ' + DOM_ES + '.</p>'), 'chunk ES: §15 domicilio');
ok(tc.includes('<p>Legal address: ' + DOM_EN + '.</p>'), 'chunk EN: §15 domicilio');
// Cero placeholders en las 3 superficies.
for (const [n, s] of [['terminos.html', termES], ['terms.html', termEN], ['chunk-terminos.js', tc]]) {
  ok(!s.includes('pendiente de publicación'), n + ': sin «pendiente de publicación»');
  ok(!s.includes('pending publication'), n + ': sin «pending publication»');
}
// §10.3 intacto, texto exacto del docx, en las 3 superficies.
for (const [n, s] of [['terminos.html', termES], ['chunk ES', tc]]) ok(s.includes(SEC103_ES), n + ': §10.3 exacto ES');
for (const [n, s] of [['terms.html', termEN], ['chunk EN', tc]]) ok(s.includes(SEC103_EN), n + ': §10.3 exacto EN');
// Ley aplicable intacta.
ok(termES.includes(LEY_ES) && tc.includes(LEY_ES), 'ES: ley aplicable sin cambio');
ok(termEN.includes(LEY_EN) && tc.includes(LEY_EN), 'EN: ley aplicable sin cambio');
// Email de contacto intacto en las 3 superficies.
for (const [n, s] of [['terminos.html', termES], ['terms.html', termEN], ['chunk', tc]]) ok(s.includes('hola@postycommunitymanager.com'), n + ': email de contacto');
// El chunk ya no dice que el domicilio está pendiente.
ok(!tc.includes('PENDIENTES (no inventar)'), 'chunk: comentario de pendientes actualizado');
// BUILD + app.js intacto.
ok(srv.includes("const BUILD_ID = '20261105-v850'"), 'server.js: BUILD_ID v850');
const appV = (idx.match(/app\.js\?v=(\d+)/) || [])[1] || '';
ok(appV === '581', 'index.html: ?v=581 (app.js cambia SOLO CHUNK_V v849->v850)');
ok(!app.includes('105 Rogers'), 'app.js: sin texto de T&C (no se toca)');
try { new vm.Script(tc); ok(true, 'chunk compila (vm.Script)'); } catch (e) { ok(false, 'chunk compila: ' + e.message); }

/* ---------- B. VM: terminosView rinde el domicilio ES+EN ---------- */
console.log('— B. VM: terminosView —');
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
  ok(vEs.includes(DOM_ES), 'VM ES: domicilio en la vista');
  ok(vEs.includes('Domicilio legal: ' + DOM_ES), 'VM ES: §15 domicilio');
  ok(vEs.includes(SEC103_ES), 'VM ES: §10.3 exacto');
  ok(!vEs.includes('pendiente de publicación'), 'VM ES: sin placeholder');
  ctx.tcToggleLang();
  const vEn = ctx.terminosView();
  ok(vEn.includes(DOM_EN), 'VM EN: domicilio en la vista');
  ok(vEn.includes('Legal address: ' + DOM_EN), 'VM EN: §15 domicilio');
  ok(vEn.includes(SEC103_EN), 'VM EN: §10.3 exacto');
  ok(!vEn.includes('pending publication'), 'VM EN: sin placeholder');
}

/* ---------- C. Boot aislado ---------- */
console.log('— C. boot —');
(async () => {
  const NODE_PATH_POSTA = '/home/hatch/workspace/posta/node_modules';
  let expressOk = fs.existsSync(path.join(NODE_PATH_POSTA, 'express', 'package.json'));
  if (!expressOk) {
    console.log('  (boot omitido: express no resuelve en este árbol)');
  } else {
    const PORT = 34595;
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-terminos-v850-'));
    const srvProc = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), NODE_PATH: NODE_PATH_POSTA, OPENAI_API_KEY: '' }, stdio: 'ignore' });
    const pid = srvProc.pid;
    console.log('  boot PID: ' + pid);
    const req = (method, p, body) => new Promise((res, rej) => {
      const data = body ? JSON.stringify(body) : null;
      const q = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: { 'User-Agent': 'lote-terminos-v850/1.0', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (r) => {
        const chunks = []; r.on('data', (c) => { chunks.push(c); }); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: r.headers }));
      });
      q.on('error', rej); if (data) q.write(data); q.end();
    });
    const get = (p) => req('GET', p);
    const chunkVTree = (app.match(/const CHUNK_V = '([^']+)'/) || [])[1] || '';
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); try { const v = await get('/api/version'); up = v.status === 200; } catch (e) {} }
    ok(up, 'boot levanta (PID ' + pid + ')');
    if (up) {
      const ver = JSON.parse((await get('/api/version')).body);
      ok(ver.build === '20261105-v850', '/api/version = 20261105-v850');
      const tES = await get('/terminos.html');
      ok(tES.status === 200 && md5(tES.body) === md5(termES), '/terminos.html servido = árbol');
      ok(tES.body.includes('Domicilio legal: ' + DOM_ES + '.'), 'servido ES: §15 domicilio');
      ok(tES.body.includes(SEC103_ES), 'servido ES: §10.3 exacto');
      ok(!tES.body.includes('pendiente de publicación'), 'servido ES: sin placeholder');
      const tEN = await get('/terms.html');
      ok(tEN.status === 200 && md5(tEN.body) === md5(termEN), '/terms.html servido = árbol');
      ok(tEN.body.includes('Legal address: ' + DOM_EN + '.'), 'servido EN: §15 domicilio');
      ok(tEN.body.includes(SEC103_EN), 'servido EN: §10.3 exacto');
      ok(!tEN.body.includes('pending publication'), 'servido EN: sin placeholder');
      const chunk = await get('/chunk-terminos.js?v=' + chunkVTree);
      ok(chunk.status === 200 && md5(chunk.body) === md5(tc), 'chunk-terminos.js servido = árbol');
      ok(chunk.body.includes(DOM_ES) && chunk.body.includes(DOM_EN), 'servido chunk: domicilio ES+EN');
      const ajS = await get('/chunk-ajustes.js?v=' + chunkVTree);
      ok(ajS.status === 200 && ajS.body.includes("bbGo('#/app/terminos')"), 'servido: fila Términos en Ajustes');
      const appS = await get('/app.js?v=' + appV);
      ok(appS.status === 200 && md5(appS.body) === md5(app), 'app.js?v=' + appV + ' servido = árbol');
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
  console.log(`\ntest-lote-publicar-terminos-v850: ${pass} ok, ${fail} mal`);
  if (fail) console.log('fallos: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
