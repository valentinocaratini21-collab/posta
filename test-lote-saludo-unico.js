// test-lote-saludo-unico.js — LOTE SALUDO-UNICO (8/11), REESCRITO EN v846:
// el encabezado del shell ya NO es la identidad del negocio: es «Posty.»
// fijo para TODAS las cuentas, con «tu community manager» debajo y un
// puntito verde de online sobre el avatar (decisión Valentino 9/11 12:04,
// SUPERSEDE simplificar-app Parte 5). Y el saludo de Hoy («¡Buen día!»)
// murió en v846 (decisión Valentino 9/11 12:01): la burbuja arranca con
// el estado del posteo de hoy, sin saludar por hora.
// Node puro: asserts estáticos + VM + boot real por HTTP con DATA_DIR
// aislada (puerto 18943). Uso: node test-lote-saludo-unico.js (desde la raíz del árbol).
// Pins provisorios v846 (el re-estampador estampa BUILD/?v=/styles?v=
// y re-pinea): BUILD 20261105-v846 · app.js?v=578 · styles?v=20261223.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const ruleCss = (sel) => {
  const i = css.indexOf(sel); if (i === -1) return '';
  const j = css.indexOf('}', i); return j === -1 ? '' : css.slice(i, j + 1);
};

(async () => {
  // ---------- 1. Estático: el encabezado es «Posty.» para todas las cuentas ----------
  const headSrc = sliceFn(app, 'function pzShellHeadHTML(tab) {', 'function pzShellDatosHoy() {');
  t(headSrc.length > 0, '§1: pzShellHeadHTML presente');
  t(headSrc.includes('Posty<span class="pdot">.</span>'), '§1: título fijo «Posty.»');
  t(headSrc.includes('tu community manager') && headSrc.includes('your community manager'), '§1: subtítulo ES+EN');
  t(headSrc.includes('pz-shell-dot') && headSrc.includes('pz-shell-ava-wrap'), '§1: punto verde sobre el avatar');
  t(!headSrc.includes('BB.estado.negocio') && !headSrc.includes('PROFILE.business_name'), '§1: el encabezado ya no lee el nombre del negocio');
  t(!headSrc.includes('¡Hola!') && !headSrc.includes("'Hi!'"), '§1: sin fallback «¡Hola!»/«Hi!»');
  t(!headSrc.includes('HOME_PROF') && !headSrc.includes('ig_username'), '§1: sin @ ni handle en el encabezado');
  t(!app.includes('Posty está trabajando ahora'), '§1: «Posty está trabajando ahora» ×0 en app.js');
  t(!app.includes('Posty is working now'), '§1: «Posty is working now» ×0 en app.js');
  t(cnt(app, 'pzShellSaludo') === 0, '§1: pzShellSaludo ×0 (la máquina de escribir murió)');
  t(cnt(app, 'pzSaludoEscribir') === 0, '§1: pzSaludoEscribir ×0');
  t(headSrc.includes('ai-avatar.png'), '§1: carita de Posty intacta');
  t(headSrc.includes("bbGo('#/app/chat')"), '§1: identidad abre el Chat');
  t(headSrc.includes("if (tab === 'chat') return '';"), '§1: sin encabezado en Chat');

  // ---------- 2. Estático: ellipsis en título y subtítulo ----------
  const bRule = ruleCss('.pz-shell-who b{');
  t(bRule.includes('white-space:nowrap') && bRule.includes('overflow:hidden') && bRule.includes('text-overflow:ellipsis'), '§2: título con ellipsis');
  const sRule = ruleCss('.pz-shell-who small{');
  t(sRule.includes('white-space:nowrap') && sRule.includes('overflow:hidden') && sRule.includes('text-overflow:ellipsis'), '§2: subtítulo con ellipsis (regla nueva de v846)');
  const dotRule = ruleCss('.pz-shell-dot{');
  t(dotRule.includes('background:#22C55E') && dotRule.includes('border:2px solid #fff'), '§2: punto verde #22C55E con aro blanco');

  // ---------- 3. Estático: el saludo de Hoy murió en v846 ----------
  t(cnt(app, 'pzHoySaludoTxt') === 0, '§3: pzHoySaludoTxt ×0 (el saludo de Hoy murió)');
  t(cnt(app, 'pz-hoy-saludo') === 0, '§3: pz-hoy-saludo ×0 en app.js');
  t(cnt(css, 'pz-hoy-saludo') === 0, '§3: pz-hoy-saludo ×0 en styles.css');
  const hoySrc = sliceFn(app, 'function pzHoySpeechHTML(', 'function pzHoyConserjeHTML(');
  t(hoySrc.length > 0 && !hoySrc.includes('pzHoySaludoTxt') && !hoySrc.includes('pz-hoy-saludo'), '§3: la burbuja ya no saluda por hora');
  t(!css.includes('b.typing::after') && !css.includes('pzShellBlink'), '§3: CSS de la máquina de escribir limpiado');
  t(srv.includes("const BUILD_ID = '20261105-v846'"), '§3: server.js con BUILD v846 estampado (preparador)');
  t(app.includes("const CHUNK_V = '20261105-v793'"), '§3: CHUNK_V v793 sin cambio (fase 1)');

  // ---------- 4. VM: el encabezado es igual para todas las cuentas ----------
  const escFn = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ctx = {
    console, esc: escFn, pzIc: () => '[ic]',
    BB: { estado: { negocio: 'Café Aroma' } },
    ME: { lang: 'es' },
    HOME_PROF: { username: 'cafearoma' },
    PROFILE: { ig_username: 'cafearoma', business_name: 'Café Aroma' },
  };
  vm.createContext(ctx);
  vm.runInContext(headSrc, ctx);
  const run = (tab) => vm.runInContext(`pzShellHeadHTML('${tab}')`, ctx);
  // (a) con negocio: título Posty., subtítulo, punto verde; el negocio NO sale.
  let h = run('inicio');
  t(h.includes('Posty<span class="pdot">.</span>') && h.includes('tu community manager'), '§4a: con negocio, título Posty. + subtítulo');
  t(!h.includes('Café Aroma') && !h.includes('@'), '§4a: con negocio, el nombre y el @ NO salen en el encabezado');
  t(h.includes('pz-shell-dot') && h.includes('ai-avatar.png'), '§4a: punto verde + carita presentes');
  // (b) sin nombre: lo mismo (el encabezado no depende del negocio).
  ctx.BB.estado.negocio = ''; ctx.PROFILE.business_name = '';
  h = run('inicio');
  t(h.includes('Posty<span class="pdot">.</span>') && h.includes('tu community manager'), '§4b: sin nombre, mismo encabezado');
  t(!h.includes('¡Hola!') && !h.includes('<small></small>'), '§4b: sin nombre, sin fallback «¡Hola!»');
  // (c) EN: subtítulo en inglés, mismo título.
  ctx.ME.lang = 'en';
  h = run('inicio');
  t(h.includes('Posty<span class="pdot">.</span>') && h.includes('your community manager'), '§4c: EN con your community manager');
  // (d) Chat no lleva encabezado.
  ctx.ME.lang = 'es'; ctx.BB.estado.negocio = 'Café Aroma';
  t(run('chat') === '', '§4d: Chat sin encabezado');
  // (e) Análisis lleva el mismo encabezado.
  h = run('numeros');
  t(h.includes('Posty<span class="pdot">.</span>') && !h.includes('Café Aroma'), '§4e: Análisis con el mismo encabezado (sin nombre del negocio)');

  // ---------- 5. Boot aislado ----------
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) { booted = false; }
  if (!booted) {
    console.log('boot: express no resuelve en este árbol, sección omitida');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-saludo-'));
    const PORT = 18943;
    const BASE = `http://127.0.0.1:${PORT}`;
    const waitBoot = async (tries = 60) => {
      for (let i = 0; i < tries; i++) {
        try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    };
    const srvProc = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), OPENAI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      t(await waitBoot(), '§5: boot levanta');
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      t(ver.build === '20261105-v846', `§5: /api/version v846 (vino ${ver.build})`);
      const appTxt = await (await fetch(`${BASE}/app.js?v=578`)).text();
      t(md5(appTxt) === md5(app), '§5: app.js?v=578 servido = árbol');
      t(!appTxt.includes('pzHoySaludoTxt') && !appTxt.includes('pzSaludoEscribir'), '§5: servido sin el saludo ni la máquina de escribir');
      t(appTxt.includes('Posty<span class="pdot">.</span>') && appTxt.includes('tu community manager'), '§5: servido con el encabezado Posty.');
      const cssTxt = await (await fetch(`${BASE}/styles.css?v=20261223`)).text();
      t(md5(cssTxt) === md5(css), '§5: styles.css?v=20261223 servido = árbol');
      t(cssTxt.includes('.pz-shell-dot') && cssTxt.includes('text-overflow:ellipsis'), '§5: servido con punto verde y ellipsis');
      const rHoy = await fetch(`${BASE}/api/ritual/hoy`);
      t(rHoy.status === 401, `§5: sin sesión, /api/ritual/hoy → 401 (vino ${rHoy.status})`);
    } finally {
      try { srvProc.kill('SIGTERM'); } catch (e) {}
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    }
  }

  console.log(`\ntest-lote-saludo-unico: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
