#!/usr/bin/env node
// test-lote-conserje-frescura.js — LOTE CONSERJE-FRESCURA (Lote B del
// diagnóstico conserje §2 y §6, sobre v1080).
// Síntoma (Valentino, 14/11 15:30 EST): el conserje se ve SIN los botones
// [✓ Sale así] [✎ Editar] [✕ No sale] [🖼 Ver en el feed] que el servidor
// entrega desde v967 — su cliente rinde la lista vieja (pre-v967) con
// datos frescos. Causa raíz probada en el diagnóstico:
//  · los estáticos con ?v= se sirven Cache-Control: public,
//    max-age=2592000, immutable (30 días): el navegador no revalida nunca;
//  · CHUNK_V quedó congelado en '20261105-v1046' por 33 builds: toda copia
//    de app.js pide los chunks con la URL vieja para siempre;
//  · la SPA no tenía guarda de versión: una copia vieja nunca se entera.
//
// EL CAMBIO (solo public/app.js):
//  · PZ_BUILD: el build del cliente, estampado por el preparador en cada
//    lote con el mismo valor que el BUILD_ID de server.js.
//  · CHUNK_V = PZ_BUILD (derivado): la URL de cada chunk cambia en cada
//    lote; ningún chunk cacheado sobrevive a un deploy.
//  · pzVersionGuard: al arrancar y al volver el foco/visibilidad/
//    pageshow, compara PZ_BUILD contra /api/version; si el servidor va
//    adelante, recarga UNA sola vez navegando con ?fresh=<build> (URL
//    nueva = documento nuevo, fuera de la entrada immutable) conservando
//    el hash. Anti-loop: marca de sessionStorage por build + el propio
//    ?fresh= de la URL + throttle de un chequeo por minuto.
//
//  §A Pins estáticos: PZ_BUILD ×1 y en paridad con el BUILD_ID del mismo
//     árbol · CHUNK_V derivado ×1 y el literal congelado ausente · el
//     loader sigue usando CHUNK_V · la guarda y sus disparadores existen.
//  §B La guarda en VM (segmento real extraído de app.js): servidor
//     adelante ⇒ una sola navegación con ?fresh= y el hash intacto;
//     segundo chequeo con el mismo build ⇒ no insiste (sessionStorage);
//     llegada con ?fresh= de ese build ⇒ no insiste (URL); build igual o
//     atrás ⇒ nada; fetch caído ⇒ nada y no explota; throttle ⇒ un solo
//     chequeo por minuto; CHUNK_V del bundle == PZ_BUILD.
//  §C Control contra la base v1080: sin PZ_BUILD ni guarda y con el
//     CHUNK_V congelado — la copia vieja nunca se entera (el síntoma).
//  §D Boot real (DATA_DIR en /tmp): /api/version.build == PZ_BUILD y el
//     bundle servido trae la guarda y el CHUNK_V derivado.
//
// Uso: node test-lote-conserje-frescura.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

let fails = 0, total = 0;
const ok = (cond, msg, extra) => {
  total++;
  if (cond) console.log('  ✓', msg);
  else { fails++; console.error('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
};
const read = (p) => fs.readFileSync(p, 'utf8');
const ROOT = __dirname;
const BASE_ROOT = path.join(ROOT, '..', 'base');
const count = (hay, needle) => hay.split(needle).length - 1;

const app = read(path.join(ROOT, 'public/app.js'));
const srvJs = read(path.join(ROOT, 'server.js'));
const appBase = read(path.join(BASE_ROOT, 'public/app.js'));

const pzBuild = (app.match(/const PZ_BUILD = '([^']+)'/) || [])[1] || null;
const srvBuild = (srvJs.match(/const BUILD_ID = '([^']+)'/) || [])[1] || null;
const num = (b) => { const m = /-v(\d+)$/.exec(String(b || '')); return m ? Number(m[1]) : null; };
const shiftBuild = (b, d) => String(b).replace(/-v(\d+)$/, (s, n) => '-v' + (Number(n) + d));

// ───────────────────────── §A · Pins estáticos ─────────────────────────
console.log('§A pins estáticos del release');
ok(!!pzBuild, 'A1 PZ_BUILD existe en app.js', pzBuild);
ok(pzBuild && srvBuild && pzBuild === srvBuild, 'A2 PZ_BUILD == BUILD_ID de server.js del mismo árbol', { pzBuild, srvBuild });
ok(count(app, 'const PZ_BUILD = ') === 1, 'A3 PZ_BUILD definido una sola vez');
ok(count(app, 'const CHUNK_V = PZ_BUILD;') === 1, 'A4 CHUNK_V deriva de PZ_BUILD (const CHUNK_V = PZ_BUILD;)');
ok(!app.includes("const CHUNK_V = '20261105-v1046';"), 'A5 el literal congelado v1046 ya no está');
ok(count(app, "s.src = '/chunk-' + name + '.js?v=' + CHUNK_V;") === 1, 'A6 el loader de chunks usa CHUNK_V (el derivado)');
ok(count(app, 'async function pzVersionGuard()') === 1, 'A7 pzVersionGuard definida una sola vez');
ok(app.includes("fetch('/api/version?vg=' + now, { cache: 'no-store', credentials: 'same-origin' })"), 'A8 la guarda consulta /api/version sin caché');
ok(app.includes("sessionStorage.getItem(key)") && app.includes("pz_vguard_"), 'A9 anti-loop por sessionStorage y build');
ok(app.includes("u.searchParams.get('fresh')") && app.includes('location.replace(u.toString())'), 'A10 anti-loop por ?fresh= y navegación con location.replace');
ok(app.includes("addEventListener('focus', () => { try { pzVersionGuard(); }"), 'A11 disparador por foco registrado');
ok(app.includes("addEventListener('pageshow', () => { try { pzVersionGuard(); }"), 'A12 disparador por pageshow registrado');
ok(app.includes("if (!document.hidden) pzVersionGuard();"), 'A13 disparador por visibilidad registrado');
ok(app.includes('setTimeout(() => { try { pzVersionGuard(); } catch (e) {} }, 2500);'), 'A14 chequeo de arranque registrado');

// ───────────────────────── §B · La guarda en VM ─────────────────────────
function guardSegment(src) {
  const a = src.indexOf('const PZ_BUILD');
  const b = src.indexOf('let ME = null;', a);
  if (a < 0 || b < 0) return null;
  return src.slice(a, b);
}
function makeCtx({ href, serverBuild, store }) {
  const calls = { replace: [], fetch: 0 };
  const sandbox = {
    console,
    URL,
    fetch: async () => {
      calls.fetch++;
      if (serverBuild === '__FAIL__') throw new Error('offline');
      return { ok: true, json: async () => ({ ok: true, build: serverBuild }) };
    },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    location: { href, replace: (u) => { calls.replace.push(String(u)); } },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(guardSegment(app), ctx);
  return { ctx, calls, sandbox };
}
const runGuard = (ctx) => vm.runInContext('pzVersionGuard()', ctx);

async function secB() {
  console.log('§B la guarda en VM');
  const seg = guardSegment(app);
  ok(!!seg, 'B0 el segmento PZ_BUILD→guarda se extrae de app.js');
  if (!seg || !pzBuild) return;
  const next = shiftBuild(pzBuild, 1);
  const prev = shiftBuild(pzBuild, -1);
  const HREF = 'https://postycommunitymanager.com/#/app/conserje';

  { // B1: servidor adelante ⇒ recarga una vez, con sello y hash intactos
    const store = new Map();
    const { ctx, calls } = makeCtx({ href: HREF, serverBuild: next, store });
    await runGuard(ctx);
    ok(calls.replace.length === 1, 'B1 servidor adelante: navega una sola vez', calls.replace);
    const u = calls.replace.length ? new URL(calls.replace[0]) : null;
    ok(!!u && u.searchParams.get('fresh') === next, 'B1 la URL lleva ?fresh=<build nuevo>', calls.replace[0]);
    ok(!!u && u.hash === '#/app/conserje', 'B1 el hash (la pantalla del usuario) se conserva', calls.replace[0]);
    ok(store.has('pz_vguard_' + next), 'B1 la marca anti-loop quedó en sessionStorage');
    ok(vm.runInContext('CHUNK_V', ctx) === pzBuild && vm.runInContext('PZ_BUILD', ctx) === pzBuild, 'B6 CHUNK_V del bundle == PZ_BUILD');
  }
  { // B2: segundo foco con el mismo build (marca puesta) ⇒ no insiste
    const store = new Map([['pz_vguard_' + next, '1']]);
    const { ctx, calls } = makeCtx({ href: HREF, serverBuild: next, store });
    await runGuard(ctx);
    ok(calls.replace.length === 0, 'B2 ya recargó por este build (sessionStorage): no insiste');
  }
  { // B2b: llegó con el ?fresh= de ese build y sigue vieja ⇒ no insiste
    const store = new Map();
    const hrefF = 'https://postycommunitymanager.com/?fresh=' + next + '#/app/conserje';
    const { ctx, calls } = makeCtx({ href: hrefF, serverBuild: next, store });
    await runGuard(ctx);
    ok(calls.replace.length === 0, 'B2b la URL ya trae el sello de este build: no vuelve a navegar');
  }
  { // B3: build igual ⇒ nada
    const store = new Map();
    const { ctx, calls } = makeCtx({ href: HREF, serverBuild: pzBuild, store });
    await runGuard(ctx);
    ok(calls.replace.length === 0 && calls.fetch === 1, 'B3 build igual al del servidor: chequea y no hace nada');
  }
  { // B4: servidor atrás (rollback) ⇒ nada
    const store = new Map();
    const { ctx, calls } = makeCtx({ href: HREF, serverBuild: prev, store });
    await runGuard(ctx);
    ok(calls.replace.length === 0, 'B4 servidor atrás: no hace nada');
  }
  { // B5: fetch caído ⇒ nada y no explota
    const store = new Map();
    const { ctx, calls } = makeCtx({ href: HREF, serverBuild: '__FAIL__', store });
    let threw = false;
    try { await runGuard(ctx); } catch (e) { threw = true; }
    ok(!threw && calls.replace.length === 0, 'B5 sin red: no navega ni explota');
  }
  { // B7: throttle — dos disparos pegados, un solo chequeo
    const store = new Map();
    const { ctx, calls, sandbox } = makeCtx({ href: HREF, serverBuild: next, store });
    await runGuard(ctx);
    store.clear(); // ni la marca ni el sello frenan el segundo disparo: solo el throttle
    sandbox.location.href = HREF;
    await runGuard(ctx);
    ok(calls.fetch === 1 && calls.replace.length === 1, 'B7 throttle: el segundo disparo dentro del minuto no re-chequea');
  }
}

// ───────────────────────── §C · Control contra la base ─────────────────────────
console.log('§C control contra la base');
ok(!appBase.includes('pzVersionGuard') && !appBase.includes('PZ_BUILD'), 'C1 BASE: sin PZ_BUILD ni guarda — la copia vieja nunca se entera');
// RE-PIN del preparador (composición sobre v1087): la base ya no trae el
// literal v1046 del control original — el Lote A (v1087) lo bumpeó A MANO a
// '20261105-v1087'. El síntoma que prueba el control es el mismo: en la base
// CHUNK_V es un literal estampado a mano (no la derivación de este lote) y
// solo se mueve cuando un lote que toca un chunk se acuerda de bumpearlo.
ok(/const CHUNK_V = '20261105-v\d+';/.test(appBase) && !appBase.includes('const CHUNK_V = PZ_BUILD;'), 'C2 BASE: CHUNK_V es un literal estampado a mano, no la derivación (el síntoma)');
ok(guardSegment(appBase) === null, 'C3 BASE: no hay segmento de guarda que extraer');

// ───────────────────────── §D · Boot real ─────────────────────────
const PORT = 35193;
async function boot() {
  console.log('§D boot real (release)');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-frescura-'));
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: TMP, SESSION_SECRET: 'test-secret', ADMIN_TOKEN: 'test-admin', OPENAI_API_KEY: '', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  srv.stderr.on('data', d => { err += d; });
  const BASE = `http://127.0.0.1:${PORT}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(`${BASE}/api/version`); up = r.ok; } catch (e) {}
      if (!up) await new Promise(r => setTimeout(r, 1000));
    }
    ok(up, 'D0 el server del release levantó', err.slice(-200));
    if (up) {
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      ok(ver.build === pzBuild, 'D1 /api/version.build == PZ_BUILD del bundle', { ver: ver.build, pzBuild });
      const home = await (await fetch(`${BASE}/`)).text();
      const m = home.match(/app\.js\?v=(\d+)/);
      const appLive = await (await fetch(`${BASE}/app.js?v=${m ? m[1] : 'x'}`)).text();
      ok(appLive.includes('async function pzVersionGuard()'), 'D2 el bundle servido trae la guarda');
      ok(appLive.includes('const CHUNK_V = PZ_BUILD;') && appLive.includes(`const PZ_BUILD = '${pzBuild}';`), 'D3 el bundle servido trae PZ_BUILD y el CHUNK_V derivado');
    }
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await secB();
  await boot();
  console.log(`\n${total - fails}/${total} ok · ${fails} fallas`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
