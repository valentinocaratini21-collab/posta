#!/usr/bin/env node
// test-logo-web.js — (v468) Logo de auth → website con sesión cerrada en PWA.
//
// Bug (Valentino, 2026-10-25, después de v466): con la sesión cerrada, apretar
// el logo de Posty en login NO llevaba al website. v466 había puesto el href
// correcto (/ y /en/) pero eso solo no alcanza en la PWA: hay CUATRO rebotes
// standalone que devuelven al login antes de que la landing se vea:
//   1. public/index.html, script head (corre antes que app.js, incluso cacheado)
//   2. public/en/index.html, script head (idéntico; la página EN es estática)
//   3. app.js render(), primera rama standalone
//   4. app.js render(), rama #/
// Causa completa: tap en el logo → navegación a "/" → head script hace
// location.replace('/#/app/inicio') → sin sesión, /app rebota a #/login.
// El tap "no hacía nada" (login → login).
//
// Fix (v468): intención one-shot en sessionStorage ('posta_ver_web'):
// el onclick del logo de auth la marca; el head script ES no redirige si está
// puesta (NO la consume: la consume app.js); el head script EN la consume
// (no hay app.js que la consuma); la primera rama de app.js la consume y
// marca PZ_VER_WEB_ONCE para que la rama #/ tampoco redirija. La próxima
// apertura de la PWA vuelve a comportarse como app (regla 2026-10-20 intacta).
//
// Este test EJECUTA de verdad los dos head scripts extraídos (vm, con
// standalone/navegación simulados) y hace censo exacto de los 4 puntos de
// contacto en app.js. Sin navegador vivo: el click físico en PWA queda para
// la pasada del padre (ver informe de la tanda).
//
// Uso: node test-logo-web.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 300) : ''); }
};

const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const enIdx = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');

// ---------- A) Censo de los 4 puntos de contacto ----------
console.log('— censo: la llave posta_ver_web en los 4 puntos');
const setter = "sessionStorage.setItem('posta_ver_web','1')";
ok('app.js: 3 onclick del logo de auth marcan la intención', (app.split(setter).length - 1) === 3);
ok('app.js: logo de la landing sigue href="#/" (no se toca)', app.includes('<a class="logo logo-posty" href="#/">'));
ok('app.js: 3 anchors de auth siguen href=${homeHref}', (app.split('href="${homeHref}"').length - 1) === 3);
ok('app.js: primera rama standalone consume la intención', app.includes("sessionStorage.getItem('posta_ver_web') === '1'") && app.includes("sessionStorage.removeItem('posta_ver_web')"));
ok('app.js: rama #/ respeta PZ_VER_WEB_ONCE', app.includes('PZ_VER_WEB_ONCE') && app.includes("if (PZ_VER_WEB_ONCE) { PZ_VER_WEB_ONCE = false; }"));
const headEs = (idx.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
const headEn = (enIdx.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
ok('index.html: head script honra la intención', headEs.includes("sessionStorage.getItem('posta_ver_web') === '1'"));
ok('index.html: head script NO la consume (la consume app.js)', headEs.includes("getItem('posta_ver_web')") && !headEs.includes("removeItem('posta_ver_web')"));
ok('en/index.html: head script honra Y consume la intención (página estática)', headEn.includes("getItem('posta_ver_web')") && headEn.includes("removeItem('posta_ver_web')"));

// ---------- B) Ejecución real de los head scripts ----------
console.log('— ejecución: head scripts con PWA standalone simulada');
function runHead(script, { standalone, hash, flag }) {
  const store = new Map();
  if (flag) store.set('posta_ver_web', '1');
  let replaced = null;
  const sandbox = {
    window: {},
    navigator: { standalone: false },
    screen: { width: 390 },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    location: { hash, replace: (u) => { replaced = u; } },
  };
  sandbox.window.matchMedia = () => ({ matches: standalone });
  sandbox.window.innerWidth = 390;
  sandbox.window.screen = { width: 390 };
  sandbox.matchMedia = sandbox.window.matchMedia;
  sandbox.screen = { width: 390 };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { replaced, flagLeft: store.has('posta_ver_web') };
}
let r;
r = runHead(headEs, { standalone: true, hash: '', flag: true });
ok('ES + flag: NO redirige (se ve la landing)', r.replaced === null, r.replaced);
ok('ES + flag: la intención queda para app.js (no consumida en head)', r.flagLeft === true);
r = runHead(headEs, { standalone: true, hash: '', flag: false });
ok('ES sin flag: redirige a la app como siempre (regla 2026-10-20)', r.replaced === '/#/app/inicio', r.replaced);
r = runHead(headEs, { standalone: true, hash: '#/login', flag: false });
ok('ES #/login: exento aunque standalone', r.replaced === null, r.replaced);
r = runHead(headEs, { standalone: false, hash: '', flag: false });
ok('ES no-standalone: no toca nada', r.replaced === null, r.replaced);
r = runHead(headEn, { standalone: true, hash: '', flag: true });
ok('EN + flag: NO redirige y consume la intención', r.replaced === null && r.flagLeft === false, JSON.stringify(r));
r = runHead(headEn, { standalone: true, hash: '', flag: false });
ok('EN sin flag: redirige a la app como siempre', r.replaced === '/#/app/inicio', r.replaced);

console.log(`\nlogo-web: ${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
