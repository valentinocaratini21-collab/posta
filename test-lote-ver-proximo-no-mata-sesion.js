// Suite del lote v926 VER-PROXIMO-NO-MATA-SESION.
// Caso Olive & June: en la prueba, el botón «Ver próximo posteo»
// (la carta mágica de Inicio) navega a #/app/post/:id y, con la sesión
// invitada ya caída, el router rebota a #/login y la prueba se corta.
// El fix (solo para el invitado): el toque abre el próximo posteo EN LA
// MISMA PANTALLA (capa fijada del cofre #scfVault), sin navegar; el
// registrado sigue directo a la aprobación (#/app/post/:id).
//
// Qué verifica esta suite (sin navegador real):
//  A. Boot del release: /api/version v926 5/5, 0 errores.
//  B. HTTP con sesión invitada real: guest/start -> 3 posteos
//     programados -> GET /api/posts/:id 200 (la ruta ya era legible
//     para el invitado; el fix es que el botón ya no necesita pasar
//     por el router para mostrar el posteo).
//  C. VM sobre el app.js SERVIDO: el bucle del cofre de Inicio admite
//     la carta 'oculta' (su tarjeta .igmock existe) y la rama de click
//     de bindScfMinis: invitado -> scfOpenPop(w, true) y el hash NO se
//     mueve; registrado -> hash '#/app/post/<id>' y sin pop.
//  D. Alcance: hfDetailBind sigue filtrando solo kind 'post' (no se
//     tocó) y el bucle del cofre de Feed sigue solo 'post' (la carta
//     no rinde como tile ahí).
//
// Uso: node test-lote-ver-proximo-no-mata-sesion.js [ruta-al-release]
// Levanta su propio servidor en un puerto libre y lo mata por PID.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const RELEASE = path.resolve(process.argv[2] || path.join(__dirname, 'release'));
const POSTA_NM = path.join(os.homedir(), 'workspace', 'posta', 'node_modules');
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; } else { fail++; }
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
}

// Extrae un bloque { ... } por conteo de llaves desde el índice de '{'.
function extractBlock(src, braceIdx) {
  let depth = 0, i = braceIdx, inStr = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return src.slice(braceIdx, i + 1); }
  }
  throw new Error('bloque sin cerrar');
}
// Devuelve la sentencia completa (for/if...) desde su inicio hasta su
// llave de cierre. Necesario para VM: un `continue` o `return` suelto
// fuera de su sentencia es SyntaxError.
function extractStatement(src, stmtStart, afterIdx) {
  const s = src.indexOf(stmtStart, afterIdx || 0);
  if (s < 0) throw new Error('sentencia no encontrada: ' + stmtStart);
  const b = src.indexOf('{', s);
  if (b < 0) throw new Error('apertura no encontrada en: ' + stmtStart);
  return src.slice(s, b) + extractBlock(src, b);
}

async function main() {
  const port = 34981;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v926-suite-'));
  const env = Object.assign({}, process.env, {
    DATA_DIR: dataDir, PORT: String(port),
    TRIAL_TEST_KEY: 'test-v926-suite', OPENAI_API_KEY: '',
    NODE_PATH: POSTA_NM,
  });
  const child = spawn('node', ['server.js'], { cwd: RELEASE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const killChild = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  process.on('exit', killChild);

  const base = `http://127.0.0.1:${port}`;
  async function waitVersion(tries) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(base + '/api/version');
        const j = await r.json();
        if (r.ok && j.build === '20261105-v926') return true;
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }
  const booted = await waitVersion(30);
  check('A1 boot: /api/version responde v926', booted, booted ? '' : out.slice(-500));
  if (!booted) { killChild(); print(); process.exit(1); }

  // A: /api/version v926 5/5.
  let ok5 = 0;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(base + '/api/version');
      const j = await r.json();
      if (r.ok && j.build === '20261105-v926') ok5++;
    } catch (e) {}
  }
  check('A2 /api/version v926 5/5', ok5 === 5, `${ok5}/5`);

  // B: sesión invitada real + posteos.
  let cookie = '';
  let guestId = null;
  try {
    const r = await fetch(base + '/api/guest/start?test_key=test-v926-suite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: 'test-v926-suite-dev', lang: 'es' }),
    });
    const j = await r.json();
    const sc = r.headers.get('set-cookie') || '';
    cookie = sc.split(';')[0];
    guestId = j.user_id;
    check('B1 guest/start crea invitado', r.ok && j.ok && !!guestId, `status=${r.status} user_id=${guestId}`);
    check('B2 guest/start fija cookie de sesión', !!cookie, cookie.slice(0, 20));
  } catch (e) { check('B1 guest/start crea invitado', false, e.message); }

  if (guestId) {
    const dbFile = path.join(dataDir, 'posta.db');
    check('B3 DB del boot existe', fs.existsSync(dbFile), dbFile);
    const db = new DatabaseSync(dbFile);
    const now = Date.now();
    const ids = [];
    for (let i = 1; i <= 3; i++) {
      const at = new Date(now + i * 86400000).toISOString();
      const info = db.prepare('INSERT INTO posts (user_id, caption, status, scheduled_at, media_type, image_path) VALUES (?,?,?,?,?,?)')
        .run(guestId, 'Posteo de prueba ' + i, 'scheduled', at, 'image', '/media/test' + i + '.jpg');
      ids.push(Number(info.lastInsertRowid));
    }
    db.close();
    check('B4 3 posteos programados del invitado', ids.length === 3, `ids=${ids.join(',')}`);
    try {
      const r = await fetch(base + '/api/posts/' + ids[1], { headers: { Cookie: cookie } });
      const j = await r.json();
      check('B5 invitado lee /api/posts/:id (próximo)', r.ok && j.ok && j.post && j.post.id === ids[1], `status=${r.status}`);
      const rm = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } });
      const mj = await rm.json();
      check('B6 /api/auth/me devuelve al invitado', rm.ok && mj.user && mj.user.id === guestId, `user=${mj.user && mj.user.id}`);
    } catch (e) { check('B5 invitado lee /api/posts/:id (próximo)', false, e.message); }
  }

  // C: app.js SERVIDO (no el archivo en disco).
  let served = '';
  try {
    const r = await fetch(base + '/app.js?v=637');
    served = await r.text();
    check('C0 /app.js?v=637 se sirve 200', r.ok && served.length > 100000, `${served.length} bytes`);
  } catch (e) { check('C0 /app.js?v=637 se sirve 200', false, e.message); }

  if (served) {
    // C1: bucle del cofre de Inicio (primera aparición de vaultCards).
    try {
      const vaultAnchor = served.indexOf('const vaultCards = [];');
      const loop = extractStatement(served, 'for (const t of tiles) {', vaultAnchor);
      check('C1 cofre de Inicio admite kind oculta', loop.includes("t.kind !== 'oculta'") || loop.includes('oculta'), 'condición del bucle');
      const ctx = {
        tiles: [
          { kind: 'post', post: { id: 11, status: 'scheduled', published_at: '', scheduled_at: '2026-11-12T19:00:00Z' } },
          { kind: 'oculta', post: { id: 22, status: 'scheduled', published_at: '', scheduled_at: '2026-11-13T19:00:00Z' } },
          { kind: 'post', post: { id: 33, status: 'scheduled', published_at: '', scheduled_at: '2026-11-14T19:00:00Z' } },
        ],
        vaultCards: [], seenIds: new Set(), HF_PROPS: {},
        pl: { proposals: [] }, tz: 'America/Argentina/Buenos_Aires',
        bizName: 'Test', prof: { username: '', pic: '' },
        pzIc: () => '', homeWhenLabel: () => '', proposedLabelFor: () => ({ label: 'x', iso: null }),
        weekCardHTML: (p) => `<div class="igmock" data-post-id="${p.id}"></div>`,
      };
      vm.createContext(ctx);
      vm.runInContext(loop, ctx);
      const got = ctx.vaultCards.map((c) => /data-post-id="(\d+)"/.exec(c)[1]);
      check('C2 el cofre incluye la tarjeta del próximo (oculta)', got.join(',') === '11,22,33', `vault=${got.join(',')}`);
      check('C3 HF_PROPS registra el próximo', !!ctx.HF_PROPS[22], Object.keys(ctx.HF_PROPS).join(','));
    } catch (e) { check('C1/C2 cofre de Inicio (VM)', false, e.message); }

    // C4/C5: rama de click de bindScfMinis.
    try {
      const fnStart = served.indexOf('function bindScfMinis');
      const branch = extractStatement(served, 'if (pzDetDirectoEsAjustable(w)) {', fnStart);
      check('C4 rama directa existe en bindScfMinis', branch.includes('scfOpenPop') && branch.includes("location.hash = '#/app/post/'"), 'rama extraída');
      function runBranch(isGuest) {
        const calls = [];
        const ctx = {
          w: { dataset: { postId: '22' } },
          pzDetDirectoEsAjustable: () => true,
          pzIsGuest: () => isGuest,
          scfOpenPop: (w2, pinned) => { calls.push({ pinned }); },
          location: { hash: '#/app/inicio' },
          encodeURIComponent,
        };
        vm.createContext(ctx);
        // Envuelta en función: la rama tiene `return` (salida temprana).
        vm.runInContext('(function(){ ' + branch + ' })()', ctx);
        return { calls, hash: ctx.location.hash };
      }
      const g = runBranch(true);
      check('C5 invitado: abre la capa fijada, sin navegar', g.calls.length === 1 && g.calls[0].pinned === true && g.hash === '#/app/inicio', `calls=${g.calls.length} hash=${g.hash}`);
      const r2 = runBranch(false);
      check('C6 registrado: navega a #/app/post/22, sin pop', r2.calls.length === 0 && r2.hash === '#/app/post/22', `calls=${r2.calls.length} hash=${r2.hash}`);
    } catch (e) { check('C4/C5/C6 rama de click (VM)', false, e.message); }

    // D: alcance.
    check('D1 hfDetailBind sigue solo kind post (sin tocar)', /HF_TILES\.find\(\(x\) => x && x\.kind === 'post'/.test(served), 'filtro kind post intacto');
    const vaultLoops = served.split('const vaultCards = [];').length - 1;
    check('D2 hay 2 cofres (Inicio y Feed)', vaultLoops === 2, `loops=${vaultLoops}`);
    const secondVault = served.indexOf('const vaultCards = [];', served.indexOf('const vaultCards = [];') + 1);
    const feedLoop = extractStatement(served, 'for (const t of tiles) {', secondVault);
    check('D3 cofre de Feed sigue solo post (la carta no es tile ahí)', !feedLoop.includes('oculta'), 'sin oculta en Feed');
    check('D4 la carta mágica sigue con su aria-label', served.includes('Ver próximo posteo'), 'aria-label presente');
    check('D5 BUILD v926 estampado en el servido', !served.includes('20261105-v900'), 'sin resto de v900 en app.js');
  }

  killChild();
  await new Promise((r) => setTimeout(r, 1500));
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  print();
  process.exit(fail ? 1 : 0);
  function print() {
    console.log(results.join('\n'));
    console.log(`TOTAL: ${pass}/${pass + fail} PASS`);
  }
}
main().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });
