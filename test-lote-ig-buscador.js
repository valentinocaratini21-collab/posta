// test-lote-ig-buscador.js — LOTE IG-CON-BUSCADOR · 6/11
// Idea de Valentino 6/11 ~17:44: al poner el IG en la prueba, Posty lo busca
// y se toca la cuenta. Hoy NO existe endpoint de búsqueda.
//
// QUÉ HACE EL LOTE (ver ig-search.js, STATUS del lote):
// - GET /api/ig/search?q=<@> (público, sin sesión): devuelve los datos
//   PÚBLICOS de la cuenta (nombre, foto, seguidores, posteos, verificado)
//   para confirmar «es esta». Fuente: la página pública de embed de
//   Instagram (contextJSON). La API de Meta no ofrece búsqueda por nombre
//   y el CLI del entorno no existe en producción. Sin coincidencia exacta
//   no hay sugerencias (IG no expone búsqueda por prefijo sin login).
// - Autocompletado en f_ig (prueba.html / en-prueba.html) y en oc_ig (chat
//   de onboarding, mismo archivo): tarjeta para tocar y confirmar.
// - Escribir a mano sigue funcionando siempre: el envío lee el campo.
//
// LA SUITE CAZA EL COMPORTAMIENTO:
// - A (estático): endpoint público con validación, rate-limit y error
//   honesto; módulo sin contraseñas ni DB; frontend cableado en los dos
//   campos, ES+EN, con el fallback manual intacto.
// - B (parser, offline): la página de embed de un @ conocido se parsea
//   (nombre, seguidores, posteos, foto); contextJSON:null → no existe;
//   sin contextJSON o malformado → null sin romper; stub de fetch: caché,
//   no-encontrado e IG caído.
// - C (vivo, boot del servidor): @ conocido se encuentra, @ inexistente
//   da found:false, @ corto/inválido da 400 honesto, y el rate-limit 429.
// - D (baselines PRE==POST): prueba-chat, onboardingperfecto y
//   prueba-3-posteos dan los mismos conteos en este árbol que en el
//   prístino v737.
//
// Uso: node test-lote-ig-buscador.js            (árbol actual)
//      BASE=/ruta/al/arbol node test-lote-ig-buscador.js
// En prístino v737 debe FALLAR (no hay endpoint ni cableado).
// En este árbol debe dar 0 fallos. La sección C necesita red (Instagram).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BASE = process.env.BASE || __dirname;
const PRISTINE = '/home/hatch/workspace/.preparador-plan-posty-v737/release-v736';
let okN = 0, badN = 0, skipN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const skip = (name) => { skipN++; console.log('~ salteado:', name); };
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

const SRV = read('server.js');
let IG = '';
try { IG = read('ig-search.js'); } catch (e) { IG = ''; }
const PR = read('public/prueba.html');
const EPR = read('public/en-prueba.html');

// ---------- A. Estático: endpoint ----------
const searchLine = SRV.split('\n').find((l) => l.includes("app.get('/api/ig/search'"));
t(!!searchLine, 'server.js: existe GET /api/ig/search');
t(searchLine && !searchLine.includes('requireAuth'), 'server.js: /api/ig/search es público (sin requireAuth, el visitante no tiene sesión)');
t(SRV.includes("require('./ig-search')"), 'server.js: requiere ./ig-search');
t(SRV.includes("authHitCount('ig-search|'"), 'server.js: rate-limit por IP en /api/ig/search');
t(SRV.includes('>= 20'), 'server.js: rate-limit 20/min por IP');
t(SRV.includes('too_short'), 'server.js: error honesto too_short (<3 caracteres)');
t(SRV.includes("error: 'invalid'"), 'server.js: error honesto invalid (@ con caracteres no válidos)');
t(SRV.includes('ig_unavailable'), 'server.js: error honesto ig_unavailable (IG no respondió, se sigue a mano)');
t(SRV.includes('rate_limited'), 'server.js: error honesto rate_limited (429)');
t(SRV.includes('lookupIgProfile(q)'), 'server.js: el endpoint usa lookupIgProfile');
t(!/password/i.test(IG), 'ig-search.js: sin contraseñas (ni se piden ni se guardan)');
t(IG.length > 100, 'ig-search.js existe en este árbol');
t(!/\bdb\./.test(IG), 'ig-search.js: sin DB (caché en memoria, nada sensible persistido)');
t(IG.includes('contextJSON'), 'ig-search.js: parsea el contextJSON de la página de embed');
t(IG.includes('AbortSignal.timeout'), 'ig-search.js: timeout duro en el fetch a Instagram');
t(IG.includes('CACHE_FOUND_MS'), 'ig-search.js: caché en memoria con TTL');
t(IG.includes('scontent'), 'ig-search.js: solo fotos reales de scontent (misma regla que /api/ig/avatar)');

// ---------- A2. Estático: frontend ES+EN ----------
for (const [tag, html, L] of [['ES', PR, { c: 'Es esta', nf: 'No encontramos ese @' }], ['EN', EPR, { c: 'This is me', nf: "We couldn't find that @" }]]) {
  t(html.includes('function igSuggestWire'), `prueba ${tag}: existe igSuggestWire`);
  t(html.includes('id="f_ig_sug"'), `prueba ${tag}: caja de sugerencias en f_ig`);
  t(html.includes('id="oc_ig_sug"'), `prueba ${tag}: caja de sugerencias en oc_ig`);
  t(html.includes("fetch('/api/ig/search?q='"), `prueba ${tag}: el helper consulta /api/ig/search`);
  t(html.includes('.ig-sug-card'), `prueba ${tag}: CSS de la tarjeta de sugerencia`);
  t(html.includes('data-ig-confirmed'), `prueba ${tag}: tocar la tarjeta marca el @ confirmado`);
  t(html.includes(L.c), `prueba ${tag}: la tarjeta dice «${L.c}»`);
  t(html.includes(L.nf), `prueba ${tag}: aviso honesto cuando el @ no existe`);
  t(html.includes('igSuggestWire($(\'#f_ig\')'), `prueba ${tag}: f_ig cableado al buscador`);
  t(html.includes('igSuggestWire(document.getElementById(\'oc_ig\')'), `prueba ${tag}: oc_ig cableado al buscador`);
}
// Fallback manual intacto: el envío sigue leyendo el campo, nunca la tarjeta.
t(PR.includes("cleanIg($('#f_ig').value)"), 'prueba ES: onIgSubmit sigue leyendo f_ig a mano');
t(PR.includes("cleanIg((igEl && igEl.value) || '')"), 'prueba ES: startFromField sigue leyendo oc_ig a mano');
t(EPR.includes("cleanIg($('#f_ig').value)"), 'prueba EN: onIgSubmit sigue leyendo f_ig a mano');
t(EPR.includes("cleanIg((igEl && igEl.value) || '')"), 'prueba EN: startFromField sigue leyendo oc_ig a mano');

// ---------- B. Parser offline (fixtures sintéticos con la estructura real) ----------
// En prístino no existe ig-search.js: se marca el fallo y se sigue (la
// sección B entera debe fallar ahí, sin romper la corrida).
let igSearch = null;
try { igSearch = require(path.join(BASE, 'ig-search.js')); } catch (e) { igSearch = null; }
t(!!igSearch, 'ig-search.js existe y se puede requerir');
const IG_OK = !!igSearch;
const igOr = (fn, fallback) => { try { return IG_OK ? fn() : fallback; } catch (e) { return fallback; } };
function embedFixture(ctxObj) {
  const ctx = JSON.stringify({ context: ctxObj });
  return '<html><body>"isProfileEmbed":true,"contextJSON":' + JSON.stringify(ctx) + ',"other":1</body></html>';
}
const REAL_CTX = {
  username: 'postycommunitymanager',
  full_name: 'Posty • Your community manager',
  verified: false,
  profile_pic_url: 'https://scontent-lax3-2.cdninstagram.com/v/t51.82787-19/x.jpg?stp=dst-jpg_s150x150',
  followers_count: 2,
  posts_count: 12,
};
const p1 = igOr(() => igSearch.parseIgEmbedHtml(embedFixture(REAL_CTX)), null);
t(p1 && p1.username === 'postycommunitymanager', 'parser: el @ conocido se parsea (username)');
t(p1 && p1.name === 'Posty • Your community manager', 'parser: el nombre llega con el • intacto (doble unescape)');
t(p1 && p1.followers === 2 && p1.posts === 12, 'parser: seguidores y posteos exactos (2 / 12)');
t(p1 && p1.pic_url === REAL_CTX.profile_pic_url, 'parser: la foto es la URL de scontent');
t(p1 && p1.verified === false, 'parser: verificado false');
t(p1 && p1.url === 'https://www.instagram.com/postycommunitymanager/', 'parser: url del perfil');
t(igOr(() => igSearch.parseIgEmbedHtml('<html>"isProfileEmbed":false,"contextJSON":null</html>') === null, false), 'parser: contextJSON:null (inexistente) → null');
t(igOr(() => igSearch.parseIgEmbedHtml('<html><body>sin context</body></html>') === null, false), 'parser: sin contextJSON → null');
t(igOr(() => igSearch.parseIgEmbedHtml('"contextJSON":"{no json"') === null, false), 'parser: contextJSON malformado → null sin romper');
t(igOr(() => igSearch.parseIgEmbedHtml('') === null, false), 'parser: HTML vacío → null');
t(igOr(() => igSearch.parseIgEmbedHtml(embedFixture({ ...REAL_CTX, profile_pic_url: 'https://example.com/x.jpg' })).pic_url === null, false), 'parser: foto que no es de scontent → pic null (no se muestra rota)');
t(igOr(() => igSearch.parseIgEmbedHtml(embedFixture({ username: 'soloarroba' })).followers === null, false), 'parser: sin conteos → followers null (nunca inventado)');
t(igOr(() => igSearch.normalizeIgQuery('@Posty.X ') === 'posty.x', false), 'normalize: @Posty.X → posty.x');
t(igOr(() => igSearch.isValidIgQuery('posty.x_1') === true, false), 'validate: posty.x_1 válido');
t(igOr(() => igSearch.isValidIgQuery('a b') === false, false), 'validate: con espacio inválido');
t(igOr(() => igSearch.isValidIgQuery('') === false, false), 'validate: vacío inválido');
t(igOr(() => igSearch.isValidIgQuery('a'.repeat(31)) === false, false), 'validate: más de 30 inválido');

// lookup con fetch inyectado (sin red real)
(async () => {
if (!IG_OK) {
  t(false, 'lookup stub: sin ig-search.js no hay lookup que probar');
} else {
  let calls = 0;
  const stubFound = async () => { calls++; return { status: 200, text: async () => embedFixture(REAL_CTX) }; };
  igSearch.clearIgSearchCache();
  const r1 = await igSearch.lookupIgProfile('@postycommunitymanager', stubFound);
  t(r1.found === true && r1.profile.username === 'postycommunitymanager', 'lookup stub: @ conocido → found:true con perfil');
  t(calls === 1, 'lookup stub: un solo fetch para el @ conocido');
  const r1b = await igSearch.lookupIgProfile('postycommunitymanager', stubFound);
  t(r1b.found === true && calls === 1, 'lookup stub: segundo llamado usa el caché (sin segundo fetch)');
  igSearch.clearIgSearchCache();
  const stubMiss = async () => { calls++; return { status: 200, text: async () => '<html>"isProfileEmbed":false,"contextJSON":null</html>' }; };
  const r2 = await igSearch.lookupIgProfile('esteusuario_no_existe_xyz123', stubMiss);
  t(r2.found === false, 'lookup stub: @ inexistente → found:false (error honesto, no excepción)');
  const stubDown = async () => { throw new Error('boom'); };
  let codeDown = '';
  try { await igSearch.lookupIgProfile('otro_usuario_q', stubDown); } catch (e) { codeDown = e.code; }
  t(codeDown === 'ig_unavailable', 'lookup stub: IG caído → rechaza con ig_unavailable');
  const stub429 = async () => ({ status: 429, text: async () => '' });
  let code429 = '';
  try { await igSearch.lookupIgProfile('otro_usuario_r', stub429); } catch (e) { code429 = e.code; }
  t(code429 === 'ig_unavailable', 'lookup stub: HTTP 429 de IG → ig_unavailable');
  let codeInv = '';
  try { await igSearch.lookupIgProfile('a b', stubFound); } catch (e) { codeInv = e.code; }
  t(codeInv === 'invalid', 'lookup stub: @ inválido → rechaza con invalid sin fetchear');
}

  // ---------- C. Vivo: boot del servidor y GET /api/ig/search ----------
  const PORT = 34562;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-buscador-boot-'));
  let nodeModules = path.join(BASE, 'node_modules');
  if (!fs.existsSync(nodeModules)) nodeModules = path.join(os.homedir(), 'workspace', 'posta', 'node_modules');
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-test-token-ig-buscador',
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: BASE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  const getJson = async (p) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, json: j };
  };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'vivo: el servidor levanta con el lote');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    // @ conocido, con un reintento si IG titubea
    let known = null;
    for (let attempt = 0; attempt < 2 && !known; attempt++) {
      const r = await getJson('/api/ig/search?q=postycommunitymanager');
      if (r.json && r.json.ok === true && r.json.found === true) known = r.json.profile;
      else if (attempt === 0) await new Promise((res) => setTimeout(res, 3000));
    }
    if (!known) { skip('vivo: IG no respondió al @ conocido (red de Instagram, no del lote)'); }
    t(!!known, 'vivo: @ conocido → found:true');
    t(known && known.username === 'postycommunitymanager', 'vivo: el perfil trae el username exacto');
    t(known && typeof known.name === 'string' && known.name.includes('Posty'), 'vivo: el perfil trae el nombre para mostrar');
    t(known && typeof known.followers === 'number' && known.followers >= 0, 'vivo: el perfil trae seguidores (número real)');
    t(known && typeof known.posts === 'number' && known.posts >= 0, 'vivo: el perfil trae posteos (número real)');
    t(known && typeof known.pic_url === 'string' && known.pic_url.includes('cdninstagram.com'), 'vivo: el perfil trae la foto de scontent');
    const val = await getJson('/api/ig/search?q=valentinocaratini');
    if (val.json && val.json.ok === true && val.json.found === true) {
      t(val.json.profile.name === 'Valentino Caratini', 'vivo: segundo @ conocido → nombre exacto');
      t(typeof val.json.profile.followers === 'number' && val.json.profile.followers > 100, 'vivo: segundo @ conocido → seguidores reales (>100)');
    } else if (val.json && val.json.ok === false) { skip('vivo: segundo @ conocido sin respuesta de IG'); }
    else { t(false, 'vivo: segundo @ conocido → found:true'); }
    const miss = await getJson('/api/ig/search?q=esteusuario_no_existe_xyz123');
    if (miss.json && miss.json.ok === true) {
      t(miss.status === 200 && miss.json.found === false, 'vivo: @ inexistente → 200 found:false (error honesto)');
    } else if (miss.json && miss.json.ok === false) { skip('vivo: @ inexistente sin respuesta de IG'); }
    else { t(false, 'vivo: @ inexistente → respuesta con forma'); }
    const short = await getJson('/api/ig/search?q=ab');
    t(short.status === 400 && short.json && short.json.error === 'too_short', 'vivo: @ de 2 caracteres → 400 too_short');
    const bad = await getJson('/api/ig/search?q=a%20b');
    t(bad.status === 400 && bad.json && bad.json.error === 'invalid', 'vivo: @ con espacio → 400 invalid');
    const empty = await getJson('/api/ig/search');
    t(empty.status === 400 && empty.json && empty.json.error === 'invalid', 'vivo: sin q → 400 invalid');
    const shortEn = await getJson('/api/ig/search?q=ab&lang=en');
    t(shortEn.status === 400 && shortEn.json && /at least 3/.test(shortEn.json.message || ''), 'vivo: lang=en → el mensaje de error sale en inglés');
    // Rate-limit: ya van ~8 llamados en esta ventana; 20 más tienen que
    // topar con el 429 (20/min por IP).
    let saw429 = false;
    for (let i = 0; i < 20; i++) {
      const r = await getJson('/api/ig/search?q=postycommunitymanager');
      if (r.status === 429 && r.json && r.json.error === 'rate_limited') { saw429 = true; break; }
    }
    t(saw429, 'vivo: más de 20 búsquedas/min por IP → 429 rate_limited');
  } catch (e) {
    console.log('error del test vivo:', e.message);
    badN++;
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  // ---------- D. Baselines PRE==POST ----------
  const runSuite = (file, base) => {
    try {
      const o = execSync(`node ${path.join(base, file)}`, { env: { ...process.env, BASE: base }, timeout: 300000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      const m = o.match(/(\d+) ok[^0-9]*(\d+) (fallos|fallas|FAIL)/) || o.match(/(\d+) OK, (\d+) FAIL/);
      return m ? { ok: Number(m[1]), fail: Number(m[2]), raw: o } : { ok: null, fail: null, raw: o };
    } catch (e) {
      const o = String((e.stdout || '') + (e.stderr || ''));
      const m = o.match(/(\d+) ok[^0-9]*(\d+) (fallos|fallas|FAIL)/) || o.match(/(\d+) OK, (\d+) FAIL/);
      return m ? { ok: Number(m[1]), fail: Number(m[2]), raw: o } : { ok: null, fail: null, raw: o };
    }
  };
  for (const file of ['test-lote-prueba-chat.js', 'test-lote-onboardingperfecto.js', 'test-lote-prueba-3-posteos.js']) {
    const pre = runSuite(file, PRISTINE);
    const post = runSuite(file, BASE);
    t(pre.ok !== null && post.ok !== null, `baseline ${file}: se pudieron leer los conteos PRE y POST`);
    t(pre.ok === post.ok && pre.fail === post.fail, `baseline ${file}: PRE==POST (${pre.ok}/${pre.fail} → ${post.ok}/${post.fail})`);
  }

  console.log(`\ntest-lote-ig-buscador: ${okN} ok, ${badN} fallos, ${skipN} salteados`);
  process.exit(badN ? 1 : 0);
})();
