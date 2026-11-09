// test-lote-pantalla-apertura.js — PANTALLA DE APERTURA AFUERA (9/11):
// decisión de Valentino («Esto sacalo tambien», con captura): la pantalla
// que aparecía al abrir la app — saludo «¡Hola! 👋 Te traje el posteo
// de hoy» + tarjeta «El posteo de hoy» + «Tocá para saltar» — se saca
// ENTERA. La app abre directo en Hoy, sin saludo ni pantalla intermedia
// que haya que saltar. La tarjeta del posteo de hoy SIGUE viviendo en
// Hoy (pzHoyHoyHTML, con sus propios datos). El saludo que escribe del
// encabezado y la píldora de racha siguen (ahora arrancan al pintar).
// Node puro: asserts estáticos + VM + boot real por HTTP con DATA_DIR
// aislada (puerto 18791; el de ads-pantalla es 18754, nunca en paralelo).
// Uso: node test-lote-pantalla-apertura.js (desde la raíz del árbol).
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
// RE-PIN tras implementar (md5s del árbol del lote; base v829).
const MD5_APP_WORK = '18105a7f853daf3da3dbdffd3b831824';
const MD5_CSS_WORK = '60a7322e65606285a98f6fe6c4f2de69';

(async () => {
  // ---------- 1. Censo + pins: la apertura no existe más ----------
  t(srv.includes("const BUILD_ID = '20261105-v839'"), 'server: BUILD v839');
  t(app.includes("const CHUNK_V = '20261105-v793'"), 'CHUNK_V v792 (sin cambio en este lote)');
  t(md5(app) === MD5_APP_WORK, 'app.js md5 (re-pin lote)');
  t(md5(css) === MD5_CSS_WORK, 'styles.css md5 (re-pin lote)');
  t(cnt(app, 'pzApertura') === 0, 'censo app: pzApertura ×0');
  t(cnt(app, '__pzHoyCarta') === 0, 'censo app: __pzHoyCarta ×0');
  t(cnt(app, '__pzApertura') === 0, 'censo app: __pzApertura ×0');
  t(cnt(app, 'Tocá para saltar') === 0, 'censo app: «Tocá para saltar» ×0');
  t(cnt(app, 'Tap to skip') === 0, 'censo app: «Tap to skip» ×0');
  t(cnt(app, 'Te traje el posteo de hoy') === 0, 'censo app: «Te traje el posteo de hoy» ×0');
  t(cnt(app, "I brought today's post") === 0, 'censo app: «I brought today\'s post» ×0');
  t(cnt(css, 'pz-apertura') === 0, 'censo css: pz-apertura ×0');
  t(cnt(css, 'pzApBurbuja') === 0, 'censo css: pzApBurbuja ×0');
  t(cnt(css, 'pzApCard') === 0, 'censo css: pzApCard ×0');
  t(!app.includes('function pzAperturaHTML()'), 'sin function pzAperturaHTML');
  t(!app.includes('function pzAperturaArranque()'), 'sin function pzAperturaArranque');
  t(!app.includes('function pzAperturaCerrar()'), 'sin function pzAperturaCerrar');

  // ---------- 2. Los DOS shells rinden sin apertura ----------
  const bbFn = sliceFn(app, 'function bbShell(tab, content) {', '\nasync function bbLoadEstado');
  t(bbFn.length > 0, 'bbShell presente');
  t(!bbFn.includes('pzApertura'), 'bbShell: sin apertura');
  t(bbFn.includes('pzShellHeadHTML(tab)'), 'bbShell: el encabezado común sigue');
  t(bbFn.includes('<nav class="bb-bar">'), 'bbShell: el dock sigue');
  const shellFn = sliceFn(app, 'function appShell(tab, content) {', '\n/* Drawer mobile');
  t(shellFn.length > 0, 'appShell presente');
  t(!shellFn.includes('pzApertura'), 'appShell: sin apertura');
  t(shellFn.includes('pzShellHeadHTML(tab)'), 'appShell: el encabezado común sigue');
  t(shellFn.includes('mzTabsHTML(tab)'), 'appShell: el dock de escritorio sigue');

  // ---------- 3. El saludo que escribe y los datos siguen, al pintar ----------
  t(app.includes('function pzSaludoEscribir()'), 'existe pzSaludoEscribir');
  t(app.includes('function pzShellDatosHoy()'), 'existe pzShellDatosHoy');
  t(app.includes('setTimeout(() => { try { pzSaludoEscribir(); } catch (e) {} }, 0);'), 'render: el saludo que escribe arranca al pintar');
  t(app.includes('setTimeout(() => { try { pzShellDatosHoy(); } catch (e) {} }, 0);'), 'render: los datos de hoy se piden al pintar');
  { const paintIdx = app.indexOf('root.innerHTML = appShell(tab, content);');
    const salIdx = app.indexOf('setTimeout(() => { try { pzSaludoEscribir(); }');
    t(paintIdx > 0 && salIdx > paintIdx, 'render: el saludo arranca DESPUÉS de pintar (la app ya está en Hoy)'); }
  t(!app.includes('__pzAperturaTimer'), 'render: sin timer de apertura');
  t(!app.includes('pzAperturaCerrar'), 'render: sin cierre de apertura');
  { const paintIdx = app.indexOf('root.innerHTML = appShell(tab, content);');
    const bindIdx = app.indexOf('bindApp(tab);', paintIdx);
    t(paintIdx > 0 && bindIdx > paintIdx && !app.slice(paintIdx, bindIdx).includes('3000'), 'render: entre pintar y bindApp no hay timer de 3 s (la apertura no alarga la carga)'); }

  // ---------- 4. Datos de hoy = solo racha (sin carta) ----------
  const hoySrc = sliceFn(app, 'function pzShellDatosHoy() {', '// ===== /LOTE REDISEÑO R0');
  t(hoySrc.includes('/api/ritual/hoy'), 'datos-hoy: UN fetch a /api/ritual/hoy (solo racha)');
  t(!hoySrc.includes('pzHeadRacha'), 'datos-hoy: sin píldora de racha (la sacó simplificar-app v833, no este lote)');
  t(!hoySrc.includes('__pzHeadRachaTxt'), 'datos-hoy: sin caché de racha (la píldora se fue en v833)');
  t(!hoySrc.includes('__pzHeadRachaN'), 'datos-hoy: sin caché numérico de racha (v833)');
  t(hoySrc.includes('__pzShellHoyPendiente'), 'datos-hoy: flag pendiente (un fetch por carga, con reintento si falla)');
  t(hoySrc.includes('.catch(') && hoySrc.includes('__pzShellHoyPendiente = false'), 'datos-hoy: si el fetch falla, el pendiente se limpia (reintenta)');
  t(hoySrc.includes('r.ok === false'), 'datos-hoy: una respuesta sin ok no marca «hecho»');
  t(!hoySrc.includes('pzHeadRacha'), 'datos-hoy: sin nodo de racha que buscar (v833)');
  t(!hoySrc.includes('cartas'), 'datos-hoy: sin carta (la tarjeta de la apertura se fue con ella)');
  t(!hoySrc.includes('__pzHoyCarta'), 'datos-hoy: sin caché de carta');
  t(!hoySrc.includes('pzApertura'), 'datos-hoy: sin mención a la apertura');

  // ---------- 5. La tarjeta del posteo de hoy SIGUE en Hoy ----------
  const hoyHoySrc = sliceFn(app, 'function pzHoyHoyHTML(p, o) {', 'function pzHoySpeechHTML(o) {');
  t(hoyHoySrc.length > 0, 'pzHoyHoyHTML presente');
  t(hoyHoySrc.includes('EL POSTEO DE HOY'), 'Hoy: cabecera «EL POSTEO DE HOY»');
  t(hoyHoySrc.includes('pzHoyCardHTML('), 'Hoy: la tarjeta de siempre (con sus botones Aprobar/Cambiar)');
  t(app.includes('pzHoyHoyHTML(hoyPostR1'), 'Hoy: la tarjeta se rinde desde hoyPostR1 (el posteo del día, no la apertura)');

  // ---------- 6. VM: los shells rinden directo en Hoy, sin overlay ----------
  { const loc = { hash: '' };
    const ctx = {
      gzT: (es) => es, pzIc: () => '[ic]', console,
      esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      location: loc, document: { getElementById: () => null, querySelector: () => null },
      BB: { estado: { negocio: 'Café Aroma', bandeja_count: 0 } },
      ME: { lang: 'es', bambooty_shell: true },
      mxModoActual: () => 'posty', BB_SHELL_ON: () => false,
      pzBackHTML: () => '', pzBackMtopHTML: () => '', pzBackDesktopHTML: () => '',
      pzDockMasBtn: () => '', pzDockMasHTML: () => '', mzTabsHTML: () => '<nav class="mz-tabs"></nav>',
      rsShareSheetHTML: () => '', // stub: vive en app.js (RS-1) fuera de los slices del VM; la hoja no se evalúa acá
      setupChecklistHtml: () => '',
    };
    ctx.bbGo = (h) => { loc.hash = h; };
    ctx.window = { matchMedia: () => ({ matches: false }) };
    ctx.matchMedia = () => ({ matches: false });
    vm.createContext(ctx);
    vm.runInContext(sliceFn(app, 'function mxTabKey(tab) {', 'function mxModoActual(tab) {'), ctx);
    const headSrc = sliceFn(app, 'function pzShellHeadHTML(tab) {', 'function pzSaludoEscribir() {');
    vm.runInContext(headSrc, ctx);
    vm.runInContext(bbFn, ctx);
    vm.runInContext(shellFn, ctx);
    const bbInicio = vm.runInContext("bbShell('inicio', '<p>HOY</p>')", ctx);
    t(!bbInicio.includes('pzApertura'), 'VM bbShell(inicio): sin overlay de apertura');
    t(!bbInicio.includes('Tocá para saltar'), 'VM bbShell(inicio): sin «Tocá para saltar»');
    t(bbInicio.includes('<p>HOY</p>'), 'VM bbShell(inicio): el contenido de Hoy cae directo (sin pantalla intermedia)');
    t(bbInicio.includes('pz-shell-head'), 'VM bbShell(inicio): el encabezado sigue');
    t(bbInicio.includes('bb-bar'), 'VM bbShell(inicio): el dock sigue');
    const mzInicio = vm.runInContext("appShell('inicio', '<p>HOY</p>')", ctx);
    t(!mzInicio.includes('pzApertura'), 'VM appShell(inicio): sin overlay de apertura');
    t(!mzInicio.includes('Tocá para saltar'), 'VM appShell(inicio): sin «Tocá para saltar»');
    t(mzInicio.includes('<p>HOY</p>'), 'VM appShell(inicio): el contenido de Hoy cae directo');
    t(mzInicio.includes('app-shell'), 'VM appShell(inicio): el shell de escritorio sigue');
    const h = vm.runInContext("pzShellHeadHTML('inicio')", ctx);
    t(h.includes('pzShellSaludo') && !h.includes('pzHeadRacha'), 'VM encabezado(inicio): identidad intacta, píldora de racha ausente (v833)');
    // El saludo que escribe sigue funcionando (máquina de escribir real).
    const salSrc = sliceFn(app, 'function pzSaludoEscribir() {', 'function pzShellDatosHoy() {');
    const salEl = { textContent: 'Café Aroma', classList: { add: () => {}, remove: () => {} } };
    const ctx2 = { console, setTimeout, document: { getElementById: (id) => (id === 'pzShellSaludo' ? salEl : null) }, window: { matchMedia: () => ({ matches: false }) } };
    ctx2.matchMedia = () => ({ matches: false });
    vm.createContext(ctx2);
    vm.runInContext(salSrc, ctx2);
    vm.runInContext('pzSaludoEscribir()', ctx2);
    t(salEl.textContent === '', 'VM saludo: al arrancar vacía el texto y empieza a escribir');
    await new Promise((r) => setTimeout(r, 1300));
    t(salEl.textContent === 'Café Aroma', 'VM saludo: ~1 s después el nombre está completo (la máquina sigue andando)');
  }

  // ---------- 7. Boot aislado ----------
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) { booted = false; }
  if (!booted) {
    console.log('boot: express no resuelve en este árbol, sección omitida (como test-lote-prueba-chat.js)');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-apertura-'));
    const PORT = 18791;
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
      t(await waitBoot(), 'boot: server levanta');
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      t(ver.build === '20261105-v839', `boot: /api/version 20261105-v839 (vino ${ver.build})`);
      const appTxt = await (await fetch(`${BASE}/app.js?v=571`)).text();
      t(md5(appTxt) === md5(app), 'boot: app.js?v=571 servido = árbol');
      t(!appTxt.includes('pzApertura'), 'boot: lo servido sin apertura');
      const cssTxt = await (await fetch(`${BASE}/styles.css?v=20261219`)).text();
      t(md5(cssTxt) === md5(css), 'boot: styles.css?v=20261219 servido = árbol');
      t(!cssTxt.includes('pz-apertura'), 'boot: CSS servido sin apertura');
      const rHoy = await fetch(`${BASE}/api/ritual/hoy`);
      t(rHoy.status === 401, `boot: sin sesión, /api/ritual/hoy → 401 (vino ${rHoy.status})`);
    } finally {
      try { srvProc.kill(); } catch (e) {}
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    }
  }

  console.log(`\ntest-lote-pantalla-apertura: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
