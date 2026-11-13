// test-lote-sidebar-logo-cliente.js — LOTE SIDEBAR-LOGO-CLIENTE v990
// El sidebar fijo de escritorio (≥1024px) muestra el LOGO DEL NEGOCIO,
// no la cara de Posty (hueco de v933: la cabecera del perfil y del Feed
// ya lo hacían). Misma resolución que v933: foto del fundamento
// (prof.pic) → logo subido (assetLogo) → casa → inicial neutra.
// Uso: cd release && node test-lote-sidebar-logo-cliente.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = __dirname;
let okN = 0, malN = 0, saltados = 0;
function ok(c, name, extra) { if (c) { okN++; console.log('PASS ' + name); } else { malN++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); } }
function skip(name, why) { saltados++; console.log('SKIP ' + name + ' :: ' + why); }
function cnt(s, re) { return (String(s).match(re) || []).length; }
function sliceFn(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) return null;
  const b = endMarker ? src.indexOf(endMarker, a + startMarker.length) : -1;
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  const indexES = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const indexEN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

  /* ---------- A) Estáticos ---------- */
  console.log('— A) estáticos —');
  ok(app.includes('<div class="side-posty" id="sidePosty" aria-label="Tu negocio"></div>'), 'A1 appShell: el sidebar es un mount vacío (sin cara antes de pintar)');
  ok(!app.includes('sidePostyName'), 'A2 sin sidePostyName en app.js (el nombre lo pinta paintSidePosty)');
  const shellSrc = sliceFn(app, 'function appShell(', 'function openDrawer()');
  ok(!!shellSrc && !shellSrc.includes('ai-avatar.png'), 'A3 appShell: sin ai-avatar.png en el shell (la cara no está en el HTML estático)');
  const paintSrc = sliceFn(app, 'async function paintSidePosty(', '// Track 4 "Pipeline perpetuo"');
  ok(!!paintSrc, 'A4 paintSidePosty existe y se extrae');
  if (paintSrc) {
    ok(paintSrc.includes("(prof && prof.pic) || ''"), 'A5 paintSidePosty: prof.pic primero (fundamento, como v933)');
    ok(paintSrc.includes('assetLogo()'), 'A6 paintSidePosty: fallback a logo subido (assetLogo)');
    ok(paintSrc.includes("if (!picSrc && isHouse) picSrc = '/ai-avatar.png';"), 'A7 paintSidePosty: la cara SOLO como fallback de la casa (condicional por isHouse)');
    ok(!paintSrc.includes("if (!picSrc) picSrc = '/ai-avatar.png';"), 'A8 paintSidePosty: sin fallback incondicional a la cara');
    ok(!paintSrc.includes("|| '/ai-avatar.png'"), 'A9 paintSidePosty: sin fallback con || a la cara');
    ok(paintSrc.includes('side-posty-ava-fb') && paintSrc.includes('initial'), 'A10 paintSidePosty: inicial neutra cuando no hay logo');
    ok(paintSrc.includes('pzCurProfGet') && paintSrc.includes('pzHomeProfGet'), 'A11 paintSidePosty: lee el perfil de la home (pzCurProfGet || pzHomeProfGet)');
    ok(paintSrc.includes("api.get('/api/home/profile')"), 'A12 paintSidePosty: pide /api/home/profile si no hay perfil cargado');
    ok(paintSrc.includes('__pzSidePostyProfPendiente'), 'A13 paintSidePosty: el fetch del perfil tiene guarda anti-duplicado');
  }
  // (el slice termina en la llave de cierre de la función, no en el
  // comentario de paintSidePosty — ese comentario menciona prof.pic).
  const dStart = app.indexOf('async function paintDrawerIdent(');
  const dEnd = (dStart >= 0) ? app.indexOf('\n}\n', dStart) : -1;
  const drawerSrc = (dStart >= 0 && dEnd > dStart) ? app.slice(dStart, dEnd) : null;
  ok(!!drawerSrc && !drawerSrc.includes('prof.pic') && !drawerSrc.includes('pzCurProfGet'), 'A14 paintDrawerIdent intacto (mobile, fuera de alcance: sigue solo con assetLogo)');
  ok(styles.includes('.side-posty-ava-wrap{'), 'A15 CSS: existe .side-posty-ava-wrap');
  ok(styles.includes('.side-posty-ava-fb{'), 'A16 CSS: existe .side-posty-ava-fb (inicial)');
  ok(!styles.includes('box-shadow:0 3px 10px rgba(39,147,200,.35)'), 'A17 CSS: sin el brillo azul de Posty en el avatar del sidebar');
  ok(cnt(server, /20261105-v990/g) === 1 && !server.includes('20261105-v984'), 'A18 server.js: BUILD v990 ×1, v984 ×0');
  ok(cnt(indexES, /app\.js\?v=682/g) === 1, 'A19 index ES: app.js?v=682 ×1');
  ok(cnt(indexES, /styles\.css\?v=20261274/g) === 1 && cnt(indexEN, /styles\.css\?v=20261274/g) === 1, 'A20 index ES y EN: styles?v=20261274 ×1 en cada uno');
  ok(!indexEN.includes('app.js?v='), 'A21 index EN: sin app.js?v= (no va en el push)');
  ok(app.includes("CHUNK_V = '20261105-v977'"), 'A22 app.js: CHUNK_V intacto (ningún chunk se toca)');
  // Gate M78: todo lo que llama paintSidePosty existe definido en el bundle.
  for (const fn of ['pzCurProfGet', 'pzHomeProfGet', 'pzCurProfSet', 'pzHomeProfSet', 'assetLogo', 'brandColors']) {
    ok(app.includes('function ' + fn + '('), 'A23 M78: ' + fn + ' definida en app.js');
  }
  ok(app.includes('const esc = '), 'A24 M78: esc definida en app.js');
  ok(app.includes('try { paintSidePosty(); } catch (e) {}'), 'A25 paintSidePosty sigue cableada en bindApp');

  /* ---------- B) VM: paintSidePosty ---------- */
  console.log('— B) VM: paintSidePosty —');
  const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
  ok(!!escLine && !!paintSrc, 'extrae esc + paintSidePosty', !escLine ? 'sin esc' : !paintSrc ? 'sin paint' : '');
  if (escLine && paintSrc) {
    const LOGO_VEJA = 'https://scontent.cdninstagram.com/veja-logo.jpg';
    const LOGO_SUBIDO = '/media/logo-cliente.png';
    function makeCtx(opts) {
      const o = opts || {};
      let curProf = (o.prof !== undefined) ? o.prof : null;
      let homeProf = (o.prof !== undefined) ? o.prof : null;
      const mount = { innerHTML: '' };
      const win = {};
      const calls = { apiGet: 0 };
      const ctx = {
        console,
        document: { getElementById: (id) => (id === 'sidePosty' ? mount : null) },
        window: win,
        PROFILE: (o.profile !== undefined) ? o.profile : { business_name: 'VEJA', ig_username: 'veja' },
        ME: { id: 94 },
        assetLogo: () => (o.logoSubido ? { file_path: LOGO_SUBIDO } : null),
        brandColors: () => (o.brand || []),
        pzCurProfGet: () => curProf,
        pzHomeProfGet: () => homeProf,
        pzCurProfSet: (p) => { curProf = p; },
        pzHomeProfSet: (p) => { homeProf = p; },
        api: { get: async (p) => { calls.apiGet++; return (o.apiGet ? o.apiGet(p) : null); } },
      };
      vm.createContext(ctx);
      vm.runInContext(escLine + '\n' + paintSrc, ctx);
      return { ctx, mount, calls, win };
    }
    // B1: cliente con pic → logo del fundamento, sin cara.
    {
      const { ctx, mount } = makeCtx({ prof: { username: 'veja', pic: LOGO_VEJA, name: 'VEJA' } });
      await ctx.paintSidePosty();
      ok(mount.innerHTML.includes(LOGO_VEJA) && !mount.innerHTML.includes('ai-avatar.png'), 'B1 cliente con pic: logo del fundamento, sin cara');
      ok(mount.innerHTML.includes('<b>VEJA</b>'), 'B1 nombre del negocio en el sidebar');
      ok(mount.innerHTML.includes('side-posty-ava-fb') && mount.innerHTML.includes('>V<'), 'B1 letra V debajo de la foto (si falla, queda la inicial)');
    }
    // B2: sin pic + logo subido → logo subido.
    {
      const { ctx, mount } = makeCtx({ prof: { username: 'veja', pic: '', name: 'VEJA' }, logoSubido: true });
      await ctx.paintSidePosty();
      ok(mount.innerHTML.includes(LOGO_SUBIDO) && !mount.innerHTML.includes('ai-avatar.png'), 'B2 sin pic + logo subido: logo subido, sin cara');
    }
    // B3: sin pic ni logo → inicial neutra, sin img, sin cara.
    {
      const { ctx, mount } = makeCtx({ prof: { username: 'veja', pic: '', name: 'VEJA' } });
      await ctx.paintSidePosty();
      ok(!mount.innerHTML.includes('<img') && !mount.innerHTML.includes('ai-avatar.png'), 'B3 sin pic ni logo: sin img y sin cara');
      ok(mount.innerHTML.includes('side-posty-ava-fb') && mount.innerHTML.includes('>V<'), 'B3 inicial neutra V con fondo de marca');
    }
    // B4: casa sin pic → la cara de Posty SIGUE.
    {
      const { ctx, mount } = makeCtx({ prof: { username: 'posty.communitymanager', pic: '', name: 'Posty' }, profile: { business_name: 'Posty', ig_username: 'posty.communitymanager' } });
      await ctx.paintSidePosty();
      ok(mount.innerHTML.includes('<img class="side-posty-ava" src="/ai-avatar.png"'), 'B4 casa sin pic: la cara de Posty SIGUE');
    }
    // B5: casa CON pic → manda el pic (precedencia v933), sin cara.
    {
      const { ctx, mount } = makeCtx({ prof: { username: 'posty.communitymanager', pic: 'https://ig/posty-pic.jpg', name: 'Posty' }, profile: { business_name: 'Posty', ig_username: 'posty.communitymanager' } });
      await ctx.paintSidePosty();
      ok(mount.innerHTML.includes('posty-pic.jpg') && !mount.innerHTML.includes('ai-avatar.png'), 'B5 casa con pic: manda el pic, sin cara (precedencia v933)');
    }
    // B6: nombre tal cual + fallback a prof.name.
    {
      const { ctx, mount } = makeCtx({ prof: { username: 'veja', pic: LOGO_VEJA, name: 'VEJA' }, profile: { ig_username: 'veja' } });
      await ctx.paintSidePosty();
      ok(mount.innerHTML.includes('<b>VEJA</b>'), 'B6 sin business_name: el nombre sale de prof.name');
    }
    // B7: @ con mayúsculas → casa igual (normalización).
    {
      const { ctx, mount } = makeCtx({ prof: { username: '@Posty.CommunityManager', pic: '', name: 'Posty' }, profile: { business_name: 'Posty', ig_username: '@Posty.CommunityManager' } });
      await ctx.paintSidePosty();
      ok(mount.innerHTML.includes('/ai-avatar.png'), 'B7 @Posty.CommunityManager con mayúsculas: casa igual');
    }
    // B8: sin perfil cargado → pide /api/home/profile UNA vez y repinta con el logo.
    {
      const hp = { ok: true, username: 'veja', pic: LOGO_VEJA, name: 'VEJA' };
      const { ctx, mount, calls } = makeCtx({ prof: null, profile: { business_name: 'VEJA', ig_username: 'veja' }, apiGet: async () => hp });
      await ctx.paintSidePosty();
      await sleep(150);
      ok(calls.apiGet === 1, 'B8 sin perfil: /api/home/profile pedido 1 vez', calls.apiGet + ' llamadas');
      ok(mount.innerHTML.includes(LOGO_VEJA) && !mount.innerHTML.includes('ai-avatar.png'), 'B8 tras el fetch: logo del fundamento en el sidebar');
      await ctx.paintSidePosty();
      await sleep(50);
      ok(calls.apiGet === 1, 'B8 segundo render: no vuelve a pedir el perfil (caché seteado)');
    }
    // B9: sin perfil y sin pic en el fetch → queda la inicial, sin fetch en loop.
    {
      const { ctx, mount, calls } = makeCtx({ prof: null, profile: { business_name: 'VEJA', ig_username: 'veja' }, apiGet: async () => ({ ok: true, username: 'veja', pic: null }) });
      await ctx.paintSidePosty();
      await sleep(150);
      ok(calls.apiGet === 1, 'B9 fetch sin pic: 1 pedido y no más', calls.apiGet + ' llamadas');
      ok(mount.innerHTML.includes('>V<') && !mount.innerHTML.includes('<img'), 'B9 sin pic en el fetch: inicial, sin img');
    }
  }

  /* ---------- C) Boot ---------- */
  console.log('— C) boot —');
  const port = 35011;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidebar-logo-boot-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const get = (p) => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 5000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
  let up = false;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const r = await get('/api/version');
    if (r.status === 200) { up = true; break; }
  }
  ok(up, 'C1 boot levanta y responde /api/version');
  if (up) {
    let hits = 0;
    for (let i = 0; i < 5; i++) {
      const r = await get('/api/version');
      try { if (JSON.parse(r.body).build === '20261105-v990') hits++; } catch (e) {}
    }
    ok(hits === 5, 'C2 /api/version v990 5/5');
    const idx = await get('/');
    ok(idx.status === 200 && idx.body.includes('app.js?v=682') && idx.body.includes('styles.css?v=20261274'), 'C3 index servido con ?v=682 y styles?v=20261274');
  }
  const errLines = bootLog.split('\n').filter((l) => /error|Error|EADDRINUSE|Cannot find|MODULE_NOT_FOUND/i.test(l) && !/no se pudo|sin voz/i.test(l));
  ok(errLines.length === 0, 'C4 boot sin errores en el log', errLines.slice(0, 3).join(' | '));
  const pid = child.pid;
  child.kill('SIGTERM');
  await sleep(1500);
  let alive = true;
  try { process.kill(pid, 0); } catch (e) { alive = false; }
  if (alive) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} await sleep(500); }
  ok(!alive || (() => { try { process.kill(pid, 0); return false; } catch (e) { return true; } })(), 'C5 boot matado por PID exacto (' + pid + ')');
  await sleep(500);
  const after = await get('/api/version');
  ok(after.status === 0, 'C6 puerto 35011 libre tras matar el boot');
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}

  console.log('\n== RESULTADO ==');
  console.log('sidebar-logo-cliente: ' + okN + ' ok, ' + malN + ' mal, ' + saltados + ' saltados');
  if (malN > 0) { console.log('FALLA: hay ' + malN + ' checks en rojo.'); process.exitCode = 1; }
  else { console.log('TODO VERDE.'); }
})().catch((e) => { console.error('CRASH DE LA SUITE:', e); process.exitCode = 1; });
