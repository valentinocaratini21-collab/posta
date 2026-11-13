// test-lote-logo-cabecera-cliente.js — LOTE LOGO-CABECERA-CLIENTE (builder).
// Defecto (captura de Valentino 12/11 01:38): en la cabecera del perfil
// del negocio (Inicio, vista previa del perfil) aparecía la cara de
// Posty (robot azul) en círculo junto al nombre del negocio («VEJA»).
// Ese avatar dice de quién es ese perfil: tiene que ser el logo del
// negocio, nunca la cara de Posty.
// Regla (Valentino 10/11 regla de logos + 12/11 cabecera): en un cliente
// va SOLO el logo del cliente; la cara de Posty nunca aparece como
// identidad del cliente. El logo solo si es REAL y está en su fundamento
// (foto de perfil de su IG o logo subido) — nunca inventado ni generado.
// Sin logo usable, la inicial neutra del negocio. La cara de Posty sigue
// donde corresponde: en el chat (remitente) y en el perfil/feed de Posty
// mismo — la cuenta de la casa (@posty.communitymanager) ES Posty, así
// que ahí la cara canónica SÍ es su logo y el fallback no cambia.
// Cubre: (A) estático, (B) VM homeHeadHTML, (C) VM cabecera del Feed,
// (D) VM homeProfileKit (servidor), (E) censo de ai-avatar.png,
// (F) boot local /api/version v932 5/5, (G) limpieza del árbol.
// Autónomo: fixtures, sin red ni claves. Se corre desde la raíz del
// árbol a probar (release/):
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-logo-cabecera-cliente.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');

process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';
const ROOT = process.cwd();
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-cabecera-suite-'));
process.env.DATA_DIR = tmpData;
try { require('module').Module._initPaths(); } catch (e) {}

const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;

let pass = 0, fail = 0;
const failed = [];
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; failed.push(label); console.log('  ✗ FALLO: ' + label + (extra ? ' — ' + extra : '')); }
};
function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
const escFn = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

(async () => {
  /* ---------- A) Estático: los dos fallbacks viejos no existen más ---------- */
  console.log('— A) estático: fallbacks viejos fuera, nuevos dentro —');
  ok(!app.includes("if (!picSrc) picSrc = '/ai-avatar.png';"), 'homeHeadHTML: el fallback incondicional a la cara de Posty NO existe');
  ok(!app.includes("const picSrc = (prof && prof.pic) || '/ai-avatar.png';"), 'Feed: el fallback incondicional a la cara de Posty NO existe');
  ok(app.includes("if (!picSrc && String(P.username || '').replace(/^@/, '').toLowerCase() === 'posty.communitymanager') picSrc = '/ai-avatar.png';"), 'homeHeadHTML: la cara solo como fallback de la casa (@posty.communitymanager)');
  ok(app.includes("if (!picSrc) { try { const lg = (typeof assetLogo === 'function') ? assetLogo() : null; if (lg && lg.file_path) picSrc = lg.file_path; } catch (e) {} }"), 'homeHeadHTML: la cadena pic -> logo subido sigue intacta');
  ok(app.includes("let feedPic = (prof && prof.pic) || '';"), 'Feed: feedPic nace de prof.pic');
  ok(app.includes("const feedIsHouse = String((prof && prof.username) || '').replace(/^@/, '').toLowerCase() === 'posty.communitymanager';"), 'Feed: guarda de casa (feedIsHouse)');
  ok(app.includes("if (!feedPic && feedIsHouse) feedPic = '/ai-avatar.png';"), 'Feed: la cara solo como fallback de la casa');
  ok(app.includes('pz-feed-ava-l'), 'Feed: la inicial neutra usa .pz-feed-ava-l');
  ok(app.includes('pz-feed-ava-wrap'), 'Feed: la letra va debajo de la foto (.pz-feed-ava-wrap)');
  ok(css.includes('.pz-feed-ava-l{display:flex;align-items:center;justify-content:center;background:#2793C8;color:#fff;font-weight:700;font-size:18px}'), 'styles: .pz-feed-ava-l (círculo azul, inicial blanca)');
  ok(css.includes('.pz-feed-ava-wrap{position:relative;width:42px;height:42px;flex:none}'), 'styles: .pz-feed-ava-wrap');
  ok(css.includes('.pz-feed-ava-wrap .pz-feed-ava{position:absolute;inset:0}'), 'styles: la foto tapa la letra dentro del wrap');
  ok(css.indexOf('.pz-feed-ava-l') > css.indexOf('.pz-feed-ava{'), 'styles: .pz-feed-ava-l va DESPUÉS de .pz-feed-ava (su fondo gana a igual especificidad)');
  ok(srv.includes('pic: (digest && digest.logo_url) || null,'), 'servidor: homeProfileKit lleva el logo real del fundamento (digest.logo_url)');
  ok(!srv.includes("    pic: null,\n    bio: kit ? (kit.bio_lines || []).join('\\n') : '',"), 'servidor: el kit ya no hardcodea pic: null');
  ok(app.includes('hf-d-ava-l'), 'patrón existente: hfFollowerHTML sigue con inicial neutra (hf-d-ava-l)');
  ok(app.includes('fp-ava-letter'), 'patrón existente: feedProfileHeadHTML sigue con inicial debajo (fp-ava-letter)');
  ok(app.includes('igmock-ava" style="background:'), 'patrón existente: weekCardHTML sigue con inicial neutra (igmock-ava)');

  /* ---------- B) VM: homeHeadHTML ---------- */
  console.log('— B) VM: homeHeadHTML (cabecera de Inicio) —');
  const headCtx = {
    console, ME: { lang: 'es' }, window: {},
    pzIc: () => '[ic]',
    igHeadChipHTML: () => '',
    __logoAsset: null,
  };
  headCtx.assetLogo = () => headCtx.__logoAsset;
  vm.createContext(headCtx);
  const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
  ok(!!escLine, 'extrae const esc');
  if (escLine) vm.runInContext(escLine, headCtx);
  for (const f of ['hfHighlightsTrayHTML', 'hfTabsHTML', 'pzDecEnt', 'pzIsIgTitleBio', 'homeHeadHTML']) {
    const src = extractFn(app, 'function ' + f);
    ok(!!src, 'extrae ' + f);
    if (src) vm.runInContext(src, headCtx);
  }
  const HH = headCtx.homeHeadHTML;
  const profVeja = { username: 'veja', name: 'VEJA', bio: '', bio_unread: false, link: '', followers: 1100000, posts_count: 3507, following: 12, highlights: [] };
  // B1: cliente con pic -> la foto real, nunca la cara de Posty
  headCtx.__logoAsset = null;
  const h1 = HH({ ...profVeja, pic: 'https://cdn.example/v.jpg' }, 'VEJA', { en: false, splitHead: true });
  ok(h1.includes('<img src="https://cdn.example/v.jpg"'), 'B1 cliente con pic: la <img> es su foto real');
  ok(!h1.includes('ai-avatar.png'), 'B1 cliente con pic: sin cara de Posty');
  // B2: cliente sin pic + logo subido -> el logo
  headCtx.__logoAsset = { kind: 'logo', file_path: '/media/logo-veja.png' };
  const h2 = HH({ ...profVeja, pic: null }, 'VEJA', { en: false, splitHead: true });
  ok(h2.includes('<img src="/media/logo-veja.png"'), 'B2 cliente sin pic + logo: la <img> es el logo subido');
  ok(!h2.includes('ai-avatar.png'), 'B2 cliente sin pic + logo: sin cara de Posty');
  // B3: cliente sin pic ni logo -> SOLO la inicial, ninguna <img>
  headCtx.__logoAsset = null;
  const h3 = HH({ ...profVeja, pic: '' }, 'VEJA', { en: false, splitHead: true });
  ok(!h3.includes('<img'), 'B3 cliente sin pic ni logo: ninguna <img> en el encabezado');
  ok(h3.includes('hf-ava-letter') && h3.includes('>V</span>'), 'B3 cliente sin pic ni logo: queda la inicial V');
  ok(!h3.includes('ai-avatar.png'), 'B3 cliente sin pic ni logo: sin cara de Posty (caso de la captura)');
  // B4: casa sin pic ni logo -> la cara canónica SIGUE (excepción)
  const h4 = HH({ username: 'posty.communitymanager', name: 'Posty.', pic: null, bio: '', bio_unread: false, link: '', followers: 8, following: 1, posts_count: 15, highlights: [] }, 'Posty.', { en: false, splitHead: true });
  ok(h4.includes('<img src="/ai-avatar.png"'), 'B4 casa sin pic: la <img> SIGUE siendo la cara de Posty');
  ok(h4.includes('hf-ava-letter') && h4.includes('>P</span>'), 'B4 casa sin pic: la letra P queda debajo como respaldo');
  // B5: casa con pic -> la foto real manda
  const h5 = HH({ username: 'posty.communitymanager', name: 'Posty.', pic: 'https://cdn.example/posty.jpg', bio: '', bio_unread: false, link: '', followers: 8, following: 1, posts_count: 15, highlights: [] }, 'Posty.', { en: false, splitHead: true });
  ok(h5.includes('<img src="https://cdn.example/posty.jpg"'), 'B5 casa con pic: la <img> es su foto real de IG');
  ok(!h5.includes('ai-avatar.png'), 'B5 casa con pic: la cara canónica no aparece');
  // B6: cliente sin nombre -> la inicial sale del @
  const h6 = HH({ username: 'veja', name: '', pic: '', bio: '', bio_unread: false, link: '', followers: null, posts_count: null, following: null, highlights: [] }, '', { en: false, splitHead: true });
  ok(h6.includes('>V</span>') && !h6.includes('<img'), 'B6 cliente sin nombre: la inicial sale del @ (V), sin <img>');
  // B7: la foto que falla al cargar revela la letra (onerror)
  ok(h1.includes('onerror="this.remove()"'), 'B7 la <img> de la cabecera tiene onerror que la quita y deja la letra');

  /* ---------- C) VM: cabecera del Feed (bloque del avatar) ---------- */
  console.log('— C) VM: cabecera del Feed (avatar del negocio) —');
  const fbStart = app.indexOf('  let feedPic = (prof && prof.pic)');
  const fbEndMark = 'aria-hidden="true">${feedLetter}</span>`;';
  const fbEnd = app.indexOf(fbEndMark, fbStart) + fbEndMark.length;
  const feedBlock = app.slice(fbStart, fbEnd);
  ok(fbStart > 0 && fbEnd > fbStart, 'extrae el bloque del avatar del Feed');
  const runFeed = (prof, user, bizName, logoAsset) => {
    const ctx = { console, esc: escFn, prof, user, bizName, __logo: logoAsset || null };
    ctx.assetLogo = () => ctx.__logo;
    vm.createContext(ctx);
    vm.runInContext(feedBlock, ctx);
    // (const/let del bloque no cuelgan del objeto contexto: se leen
    // evaluándolos en el mismo contexto, donde el scope léxico persiste)
    const picHTML = vm.runInContext('picHTML', ctx);
    const feedLetter = vm.runInContext('feedLetter', ctx);
    return { picHTML, feedLetter };
  };
  const c1 = runFeed({ username: 'veja', name: 'VEJA', pic: 'https://cdn.example/v.jpg' }, 'veja', 'VEJA', null);
  ok(c1.picHTML.includes('<img class="pz-feed-ava" src="https://cdn.example/v.jpg"'), 'C1 Feed con pic: la <img> es su foto real');
  ok(c1.picHTML.includes('pz-feed-ava-l') && c1.picHTML.includes('>V</span>'), 'C1 Feed con pic: la letra V va debajo de la foto');
  ok(!c1.picHTML.includes('ai-avatar.png'), 'C1 Feed con pic: sin cara de Posty');
  ok(c1.picHTML.includes('onerror="this.remove()"'), 'C1 Feed con pic: onerror revela la letra si la foto falla');
  const c2 = runFeed({ username: 'veja', name: 'VEJA', pic: '' }, 'veja', 'VEJA', { kind: 'logo', file_path: '/media/logo-veja.png' });
  ok(c2.picHTML.includes('<img class="pz-feed-ava" src="/media/logo-veja.png"'), 'C2 Feed sin pic + logo: la <img> es el logo subido');
  ok(!c2.picHTML.includes('ai-avatar.png'), 'C2 Feed sin pic + logo: sin cara de Posty');
  const c3 = runFeed({ username: 'veja', name: 'VEJA', pic: null }, 'veja', 'VEJA', null);
  ok(!c3.picHTML.includes('<img'), 'C3 Feed sin pic ni logo: ninguna <img>');
  ok(c3.picHTML.includes('pz-feed-ava-l') && c3.picHTML.includes('>V</span>'), 'C3 Feed sin pic ni logo: solo la inicial V');
  ok(!c3.picHTML.includes('ai-avatar.png'), 'C3 Feed sin pic ni logo: sin cara de Posty');
  ok(c3.feedLetter === 'V', 'C3 Feed: feedLetter es V');
  const c4 = runFeed({ username: 'posty.communitymanager', name: 'Posty.', pic: null }, 'posty.communitymanager', 'Posty.', null);
  ok(c4.picHTML.includes('<img class="pz-feed-ava" src="/ai-avatar.png"'), 'C4 Feed casa sin pic: la <img> SIGUE siendo la cara de Posty');
  const c5 = runFeed({ username: 'veja', name: '', pic: null }, 'veja', '', null);
  ok(c5.feedLetter === 'V' && c5.picHTML.includes('>V</span>'), 'C5 Feed sin nombre: la inicial sale del @ (V)');
  const c6 = runFeed({ username: 'veja', name: 'VEJA', pic: null }, '@veja', 'VEJA', null);
  ok(c6.feedLetter === 'V', 'C6 Feed: el @ inicial no se toma como letra');

  /* ---------- D) VM: homeProfileKit (servidor) ---------- */
  console.log('— D) VM: homeProfileKit lleva el logo real del fundamento —');
  const kitSrc = (() => {
    const a = srv.indexOf('function homeProfileKit(uid, prof) {');
    if (a < 0) return '';
    const b = srv.indexOf('\nfunction ', a + 10);
    return b < 0 ? srv.slice(a) : srv.slice(a, b);
  })();
  ok(!!kitSrc, 'extrae homeProfileKit');
  const kitCtx = {
    console, db: {},
    __digest: null,
    clientDigest: { getDigest: () => kitCtx.__digest },
    analysisEngine: { profileKit: () => ({ display_name: 'VEJA', bio_lines: ['Zapatillas'], highlights: ['a'], note: '' }) },
    igCategoryFields: () => ({}),
  };
  vm.createContext(kitCtx);
  vm.runInContext(kitSrc, kitCtx);
  const kitProf = { business_name: 'VEJA', category: '', ig_username: 'veja' };
  kitCtx.__digest = { logo_url: 'https://cdn.example/logo-veja.jpg', ciudad: 'París' };
  const k1 = kitCtx.homeProfileKit(94, kitProf);
  ok(k1.pic === 'https://cdn.example/logo-veja.jpg', 'D1 kit con digest.logo_url: pic es el logo real del fundamento');
  ok(k1.name === 'VEJA', 'D1 kit: el nombre no cambia');
  kitCtx.__digest = { ciudad: 'París' };
  const k2 = kitCtx.homeProfileKit(94, kitProf);
  ok(k2.pic === null, 'D2 kit sin logo_url: pic null (el cliente muestra la inicial)');
  kitCtx.__digest = null;
  const k3 = kitCtx.homeProfileKit(94, kitProf);
  ok(k3.pic === null, 'D3 kit sin digest: pic null (fail-closed)');
  ok(k3.source === 'kit', 'D3 kit: source sigue siendo kit');

  /* ---------- E) Censo: ai-avatar.png solo donde corresponde ---------- */
  console.log('— E) censo: la cara de Posty solo como identidad de Posty —');
  ok(cnt(app, /'\/ai-avatar\.png'/g) === 4, "ai-avatar.png x4 en app.js: 1 definición del agente + 3 fallbacks de la casa (homeHeadHTML, Feed y sidebar v956)");
  const avLines = app.split('\n').filter((l) => l.includes("'/ai-avatar.png'"));
  ok(avLines.length === 4, 'censo: exactamente 4 líneas con la cara canónica', avLines.length + ' líneas');
  ok(avLines.some((l) => /a: '\/ai-avatar\.png'/.test(l)), 'censo: 1 es la definición del agente (Posty)');
  ok(avLines.some((l) => l.includes("if (!picSrc") && l.includes('posty.communitymanager')), 'censo: 1 es el fallback de la casa en homeHeadHTML');
  ok(avLines.some((l) => l.includes("if (!feedPic && feedIsHouse) feedPic = '/ai-avatar.png';")), 'censo: 1 es el fallback de la casa en el Feed (gobernado por feedIsHouse)');
  ok(avLines.some((l) => l.includes("if (!picSrc && isHouse) picSrc = '/ai-avatar.png';")), 'censo: 1 es el fallback de la casa en el sidebar (gobernado por isHouse, v956)');
  ok(app.includes("const feedIsHouse = String((prof && prof.username) || '').replace(/^@/, '').toLowerCase() === 'posty.communitymanager';"), 'censo: feedIsHouse solo es true para la casa');
  const prueba = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
  ok(prueba.includes('<img src="/ai-avatar.png" alt="Posty">'), 'prueba.html: el héroe del formulario SIGUE con la cara de Posty (es la página de Posty, no el perfil del negocio)');
  ok(!app.includes("if (!picSrc) picSrc = '/ai-avatar.png';"), 'censo: sin fallback incondicional en homeHeadHTML');
  ok(!app.includes("|| '/ai-avatar.png'"), 'censo: sin fallback con || a la cara en ningún avatar de negocio');

  /* ---------- F) Boot local /api/version v932 5/5 ---------- */
  console.log('— F) boot local —');
  const port = 34995;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-cabecera-boot-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getVersion = () => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/version', timeout: 5000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
  let up = false;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const r = await getVersion();
    if (r.status === 200) { up = true; break; }
  }
  ok(up, 'boot levanta y responde /api/version');
  if (up) {
    let hits = 0;
    for (let i = 0; i < 5; i++) {
      const r = await getVersion();
      try { if (JSON.parse(r.body).build === '20261105-v932') hits++; } catch (e) {}
    }
    ok(hits === 5, '/api/version v932 5/5 (base sin estampar)');
  }
  const errLines = bootLog.split('\n').filter((l) => /error|Error|EADDRINUSE|Cannot find|MODULE_NOT_FOUND/i.test(l) && !/no se pudo|sin voz/i.test(l));
  ok(errLines.length === 0, 'boot sin errores en el log', errLines.slice(0, 3).join(' | '));
  const pid = child.pid;
  child.kill('SIGTERM');
  await sleep(1500);
  let alive = true;
  try { process.kill(pid, 0); } catch (e) { alive = false; }
  if (alive) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} await sleep(500); }
  ok(!alive || (() => { try { process.kill(pid, 0); return false; } catch (e) { return true; } })(), 'boot matado por PID exacto (' + pid + ')');
  await sleep(500);
  const after = await getVersion();
  ok(after.status === 0, 'puerto ' + port + ' libre tras matar el boot');
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch (e) {}

  /* ---------- G) El árbol queda limpio ---------- */
  console.log('— G) limpieza —');
  ok(!fs.existsSync(path.join(ROOT, 'data')), 'sin release/data/ tras la suite');
  ok(!fs.existsSync(path.join(ROOT, 'node_modules')), 'sin node_modules/ en el release');

  console.log(fail ? `\n✗ ${fail}/${pass + fail} FALLOS:\n  - ${failed.join('\n  - ')}` : `\n✓ ${pass}/${pass} OK`);
  process.exit(fail ? 1 : 0);
})();
