// test-lote-saludo-unico.js — LOTE SALUDO-UNICO (8/11): el encabezado del
// shell es la IDENTIDAD (nombre del negocio / @handle), no un saludo.
// Decisión Valentino 8/11 14:06 (mock hoy-saludo-unico-mock-v1): arriba
// decía «¡Hola!» y abajo «¡Buenas tardes!» — el saludo se repetía dos
// veces. Ahora el saludo vive SOLO en el mensaje de Posty en Hoy
// (pzHoySpeechHTML, sin tocar). El «Posty está trabajando ahora» sale;
// la carita, la píldora de racha y los iconos quedan.
// Node puro: asserts estáticos + VM + boot real por HTTP con DATA_DIR
// aislada (puerto 18943). Uso: node test-lote-saludo-unico.js (desde la raíz del árbol).
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
  // ---------- 1. Estático: el encabezado ya no saluda ----------
  const headSrc = sliceFn(app, 'function pzShellHeadHTML(tab) {', 'function pzAperturaHTML() {');
  t(headSrc.length > 0, '§1: pzShellHeadHTML presente');
  t(!headSrc.includes('Hola, '), '§1: sin «Hola, {negocio}» en el encabezado');
  t(!app.includes('Posty está trabajando ahora'), '§1: «Posty está trabajando ahora» ×0 en app.js');
  t(!app.includes('Posty is working now'), '§1: «Posty is working now» ×0 en app.js');
  t(headSrc.includes('pzShellSaludo'), '§1: id pzShellSaludo intacto (máquina de escribir)');
  t(headSrc.includes('ai-avatar.png'), '§1: carita de Posty intacta');
  t(headSrc.includes("bbGo('#/app/chat')"), '§1: identidad abre el Chat');
  t(headSrc.includes('BB.estado') && headSrc.includes('negocio'), '§1: nombre desde BB.estado.negocio');
  t(headSrc.includes('HOME_PROF') && headSrc.includes('username'), '§1: @handle desde HOME_PROF.username (misma fuente que homeHeadHTML)');
  t(headSrc.includes('PROFILE') && headSrc.includes('ig_username'), '§1: @handle de respaldo desde PROFILE.ig_username');
  t(headSrc.includes('¡Hola!'), '§1: fallback «¡Hola!» solo sin nombre ni handle');
  t(headSrc.includes("'Hi!'"), '§1: fallback EN «Hi!»');
  t(headSrc.includes('<small>${sub}</small>'), '§1: línea chica condicional (solo con nombre + handle)');
  t(headSrc.includes("if (tab === 'chat') return '';"), '§1: sin encabezado en Chat');

  // ---------- 2. Estático: ellipsis en ambas líneas ----------
  const bRule = ruleCss('.pz-shell-who b{');
  t(bRule.includes('white-space:nowrap') && bRule.includes('overflow:hidden') && bRule.includes('text-overflow:ellipsis'), '§2: línea grande con ellipsis');
  t(!bRule.includes('white-space:normal'), '§2: línea grande ya no envuelve');
  const sRule = ruleCss('.pz-shell-who small{');
  t(sRule.includes('white-space:nowrap') && sRule.includes('overflow:hidden') && sRule.includes('text-overflow:ellipsis'), '§2: línea chica con ellipsis');

  // ---------- 3. Estático: lo que NO se toca ----------
  const saludoHoraSrc = sliceFn(app, 'function pzHoySaludoTxt(', 'function pzHoyDiaKey(');
  t(saludoHoraSrc.includes('¡Buenas tardes! 🌤️'), '§3: saludo de Hoy intacto («¡Buenas tardes!» sigue en pzHoySaludoTxt)');
  const hoySrc = sliceFn(app, 'function pzHoySpeechHTML(', 'function pzHoyUploadHTML(');
  t(hoySrc.includes('pzHoySaludoTxt('), '§3: el mensaje de Posty sigue saludando por hora (pzHoySpeechHTML → pzHoySaludoTxt)');
  const apSrc = sliceFn(app, 'function pzAperturaHTML() {', 'function pzAperturaArranque() {');
  t(apSrc.includes('¡Hola! 👋'), '§3: burbuja de apertura del Chat intacta («¡Hola! 👋»)');
  const salSrc = sliceFn(app, 'function pzSaludoEscribir() {', 'function pzShellDatosHoy() {');
  t(salSrc.includes('pzShellSaludo') && salSrc.includes('typing') && salSrc.includes('prefers-reduced-motion'), '§3: máquina de escribir intacta (escribe la identidad)');
  t(srv.includes("const BUILD_ID = '20261105-v813'"), '§3: server.js sin tocar salvo BUILD v813');
  t(app.includes("const CHUNK_V = '20261105-v792'"), '§3: CHUNK_V v792 sin cambio');

  // ---------- 4. VM: matriz de fallbacks ----------
  const escFn = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ctx = {
    console, esc: escFn, pzIc: () => '[ic]',
    BB: { estado: { negocio: 'Café Aroma' } },
    ME: { lang: 'es' },
    HOME_PROF: { username: 'cafearoma' },
    PROFILE: { ig_username: 'cafearoma' },
  };
  vm.createContext(ctx);
  vm.runInContext(headSrc, ctx);
  const run = (tab) => vm.runInContext(`pzShellHeadHTML('${tab}')`, ctx);
  // (a) nombre + handle: título = nombre, chica = @handle, sin saludo.
  let h = run('inicio');
  t(h.includes('Café Aroma') && !h.includes('Hola'), '§4a: con negocio, título = nombre sin saludo');
  t(h.includes('@cafearoma'), '§4a: con negocio + handle, chica = @handle');
  t(h.includes('ai-avatar.png') && h.includes("bbGo('#/app/chat')") && h.includes('pzHeadRacha'), '§4a: carita + Chat + píldora presentes');
  // (b) sin nombre, con handle: título = @handle, sin duplicar la chica.
  ctx.BB.estado.negocio = '';
  h = run('inicio');
  t(h.includes('@cafearoma') && cnt(h, '@cafearoma') === 1, '§4b: sin nombre, título = @handle (una sola vez, sin chica duplicada)');
  t(!h.includes('<small'), '§4b: sin nombre, no hay línea chica');
  t(!h.includes('Hola'), '§4b: sin nombre, sin saludo');
  // (c) sin nombre ni handle: fallback «¡Hola!».
  ctx.HOME_PROF = null; ctx.PROFILE = null;
  h = run('inicio');
  t(h.includes('¡Hola!'), '§4c: sin nombre ni handle, fallback «¡Hola!»');
  t(!h.includes('<small'), '§4c: sin nombre ni handle, no hay línea chica');
  // (d) EN sin nada: «Hi!».
  ctx.ME.lang = 'en';
  h = run('inicio');
  t(h.includes('Hi!'), '§4d: EN sin nombre ni handle, fallback «Hi!»');
  // (e) nombre sin handle: título = nombre, sin chica.
  ctx.ME.lang = 'es'; ctx.BB.estado.negocio = 'Café Aroma';
  h = run('inicio');
  t(h.includes('Café Aroma') && !h.includes('<small'), '§4e: nombre sin handle, título = nombre sin chica');
  // (f) handle con @ inicial: un solo @.
  ctx.BB.estado.negocio = ''; ctx.HOME_PROF = { username: '@cafearoma' };
  h = run('inicio');
  t(h.includes('@cafearoma') && !h.includes('@@'), '§4f: handle con @ inicial no duplica el @');
  // (g) respaldo PROFILE cuando HOME_PROF todavía no cargó.
  ctx.HOME_PROF = null; ctx.PROFILE = { ig_username: 'cafearoma' };
  h = run('inicio');
  t(h.includes('@cafearoma'), '§4g: sin HOME_PROF, @handle sale de PROFILE.ig_username');
  // (h) Chat no lleva encabezado.
  ctx.BB.estado.negocio = 'Café Aroma'; ctx.HOME_PROF = { username: 'cafearoma' };
  t(run('chat') === '', '§4h: Chat sin encabezado');
  // (i) Análisis lleva el mismo encabezado (el shell es de toda la app).
  t(run('numeros').includes('Café Aroma') && run('numeros').includes('@cafearoma'), '§4i: Análisis con el mismo encabezado de identidad');

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
      t(ver.build === '20261105-v813', `§5: /api/version v813 (vino ${ver.build})`);
      const appTxt = await (await fetch(`${BASE}/app.js?v=548`)).text();
      t(md5(appTxt) === md5(app), '§5: app.js?v=548 servido = árbol');
      t(!appTxt.includes('Posty está trabajando ahora'), '§5: servido sin «Posty está trabajando ahora»');
      t(appTxt.includes('pzShellSaludo'), '§5: servido con #pzShellSaludo');
      const cssTxt = await (await fetch(`${BASE}/styles.css?v=20261197`)).text();
      t(md5(cssTxt) === md5(css), '§5: styles.css?v=20261197 servido = árbol');
      t(cssTxt.includes('text-overflow:ellipsis'), '§5: servido con ellipsis en el encabezado');
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
