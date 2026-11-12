// test-lote-ads-tab-principal.js — LOTE ADS-TAB-PRINCIPAL (11/11 · decisión
// Valentino «que sea un tab mas con inicio, chat y ajustes»):
// Ads ya era tab en el shell BB (nativa / bambooty_shell, v894: bb-bar
// Inicio · Ads · Chat), pero en el shell CLÁSICO (web de escritorio y
// móvil) la navegación principal mostraba SOLO Inicio, Chat, Ajustes —
// la vista #/app/ads existía pero no tenía pestaña.
// Este lote agrega Ads como tab principal en el shell clásico:
// 1) Sidebar de escritorio (drawer fijo ≥1024px): Inicio · Ads · Chat · Ajustes.
// 2) Barra inferior móvil (mz-tabs ≤820px): Inicio · Ads · Chat.
// La ruta #/app/ads sigue funcionando igual (adsView sin cambios); la
// billetera NO se toca (el lote Apple Pay la está tocando en paralelo);
// la landing pública NO se toca (su «Ads» del menú queda como está).
// Node puro: asserts estáticos + VM con DOM falso sobre la navegación.
// Uso: node test-lote-ads-tab-principal.js (desde el scratch; corre contra
// release/ si existe, si no contra el árbol de este directorio).
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const TREE = fs.existsSync(path.join(__dirname, 'release', 'server.js'))
  ? path.join(__dirname, 'release') : __dirname;
const SRC = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- estampado ----------
t('S1: server BUILD v942 ×1', SRV.includes("const BUILD_ID = '20261105-v942';") && cnt(SRV, '20261105-v942') === 1);
t('S2: index ES app.js?v=652 ×1 + styles?v=20261270 ×1', cnt(IDX, 'app.js?v=652') === 1 && cnt(IDX, 'styles.css?v=20261270') === 1);
t('S3: index EN styles?v=20261270 ×1 y sin app.js?v=', cnt(IDXEN, 'styles.css?v=20261270') === 1 && !IDXEN.includes('app.js?v='));

// ---------- sidebar de escritorio (drawer) ----------
const drawerSrc = sliceFn(SRC, 'function appShell(tab, content) {', '/* Drawer mobile:');
t('S4: drawer tiene 4 links en orden Inicio · Ads · Chat · Ajustes', (() => {
  const i = drawerSrc.indexOf('data-tab="inicio"');
  const a = drawerSrc.indexOf('data-tab="ads"');
  const c = drawerSrc.indexOf('data-tab="chat"');
  const j = drawerSrc.indexOf('data-tab="ajustes"');
  return i !== -1 && a !== -1 && c !== -1 && j !== -1 && i < a && a < c && c < j;
})(), drawerSrc.slice(0, 400));
t('S5: drawer Ads lleva icono megáfono + etiqueta Ads + activo con tab ads', drawerSrc.includes("data-tab=\"ads\"") && drawerSrc.includes("${pzIc('megaphone')}</span>Ads</button>") && drawerSrc.includes("${tab === 'ads' ? 'on' : ''}\" data-tab=\"ads\""));
t('S6: drawer sigue teniendo Salir al final (no se perdió nada)', drawerSrc.includes('drawer-logout') && drawerSrc.includes('Salir'));
t('S7: drawer-link ×5 en el shell (4 tabs + Salir)', cnt(drawerSrc, 'drawer-link') === 5, 'hay ' + cnt(drawerSrc, 'drawer-link'));

// ---------- barra inferior móvil (mz-tabs) ----------
const mzSrc = sliceFn(SRC, 'function mzTabsHTML(tab) {', '/* (LOTE DOCK-MAS)');
t('S8: mz-tabs tiene 3 tabs en orden Inicio · Ads · Chat', (() => {
  const i = mzSrc.indexOf("t('inicio', 'inicio'");
  const a = mzSrc.indexOf("t('ads', 'ads'");
  const c = mzSrc.indexOf("t('chat', 'chat'");
  return i !== -1 && a !== -1 && c !== -1 && i < a && a < c;
})(), mzSrc.slice(0, 400));
t('S9: mz-tabs Ads va a data-tab ads con icono megáfono', mzSrc.includes("t('ads', 'ads', pzIc('megaphone'), gzT('Ads', 'Ads'))"));
t('S10: mz-tabs marca activa la pestaña ads (on)', mzSrc.includes("tab === 'ads' ? 'ads'"));
t('S11: mz-tabs sigue con solo 3 botones (nada más agregado)', cnt(mzSrc, "t('") === 3, 'hay ' + cnt(mzSrc, "t('"));

// ---------- shell BB intacto (ya tenía Ads) ----------
const bbBar = SRC.split('\n').find((l) => l.includes('<nav class="bb-bar">')) || '';
t('S12: bb-bar sigue con 3 tabs Inicio · Ads · Chat (sin tocar)', (() => {
  const i = bbBar.indexOf("tabBtn('inicio'"); const a = bbBar.indexOf("tabBtn('ads'"); const c = bbBar.indexOf("tabBtn('chat'");
  return i !== -1 && a !== -1 && c !== -1 && i < a && a < c;
})());
t('S13: mxTabKey resuelve ads a ads (tab activo en bb-shell)', SRC.includes("if (tab === 'ads') return 'ads';"));

// ---------- ruta + vista Ads intactas ----------
t('S14: router tab ads → adsView() intacto', SRC.includes("else if (tab === 'ads') { content = await adsView(); }"));
t('S15: adsView definida y rinde la billetera (Tu Billetera)', SRC.includes('async function adsView() {') && sliceFn(SRC, 'async function adsView() {', 'function pzAdsMontosCarga').includes('pzAdsHTML()'));
t('S16: binding genérico [data-tab] intacto (navega a #/app/<tab>)', SRC.includes("$$('[data-tab]').forEach(b => b.onclick = () => { closeDrawer(); location.hash = '#/app/' + b.dataset.tab; });"));
t('S17: icono megáfono existe en PZ_IC ×1', cnt(SRC, "megaphone: '<path") === 1);

// ---------- landing pública NO tocada ----------
t('S18: landing conserva su «Ads» del menú ×2 (desktop + móvil)', cnt(SRC, '<a href="#ads">Ads</a>') === 2, 'hay ' + cnt(SRC, '<a href="#ads">Ads</a>'));
t('S19: sección Ads de la landing intacta (id=ads)', SRC.includes('<div class="section" id="ads">'));

// ---------- vecinos intactos ----------
const CHUNK_AJ = fs.readFileSync(path.join(TREE, 'public', 'chunk-ajustes.js'), 'utf8');
t('S20: Ajustes sigue en el drawer (su vista no se toca en este lote)', drawerSrc.includes('data-tab="ajustes"') && CHUNK_AJ.includes('function ajustesView() {'));
t('S21: styles.css no se toca en este lote (sin reglas nuevas de nav)', !CSS.includes('mz-tab-ads') && !CSS.includes('drawer-link-ads'));

// ---------- sandbox vm ----------
function elStub() {
  return {
    tagName: 'DIV', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild() {}, removeChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    closest: () => null,
    getBoundingClientRect: () => ({ width: 390, height: 100, top: 0, left: 0 }),
    focus() {}, click() {}, blur() {},
    innerHTML: '', textContent: '', value: '', hidden: false,
    src: '', href: '', disabled: false, checked: false,
    children: [], parentNode: null, isConnected: false,
  };
}
function storeStub() {
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
  s._keys = () => [...m.keys()];
  return s;
}
const locObj = { hash: '#/app/ads', href: 'https://postycommunitymanager.com/#/app/ads', pathname: '/', search: '', host: 'postycommunitymanager.com' };
const sandbox = {
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{}' }),
  location: locObj,
  navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', language: 'es-AR', onLine: true },
  localStorage: storeStub(), sessionStorage: storeStub(),
  performance: { now: () => Date.now() },
  AbortSignal, AbortController, URL, URLSearchParams,
  CustomEvent: function CustomEvent() {}, Event: function Event() {},
  Date,
};
sandbox.window = {
  addEventListener() {}, removeEventListener() {},
  innerHeight: 844, innerWidth: 390, location: locObj,
  scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  navigator: sandbox.navigator, document: null,
};
sandbox.document = {
  addEventListener() {}, removeEventListener() {},
  getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => elStub(), body: elStub(), documentElement: elStub(),
  title: 'Posty', hidden: false, visibilityState: 'visible',
};
sandbox.window.document = sandbox.document;
sandbox.self = sandbox.window;
vm.createContext(sandbox);

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  const sb = sandbox;
  const orderOf = (html) => {
    const i = html.indexOf('Inicio'); const a = html.indexOf('>Ads<'); const c = html.indexOf('>Chat<');
    return { i, a, c, ok: i !== -1 && a !== -1 && c !== -1 && i < a && a < c };
  };

  // ===== V1-V4) mz-tabs en vivo =====
  let mzAds = '';
  try { mzAds = String(sb.mzTabsHTML('ads')); } catch (e) { mzAds = 'ERROR: ' + (e && e.message); }
  t('V1: mzTabsHTML(ads) trae Inicio · Ads · Chat en ese orden', orderOf(mzAds).ok, mzAds.slice(0, 500));
  t('V2: mzTabsHTML(ads) marca Ads activa (class on en su botón)', mzAds.includes('class="mz-tab on" data-tab="ads"'), mzAds.slice(0, 500));
  let mzInicio = '';
  try { mzInicio = String(sb.mzTabsHTML('inicio')); } catch (e) { mzInicio = 'ERROR: ' + (e && e.message); }
  t('V3: mzTabsHTML(inicio) marca Inicio activa y Ads presente sin on', mzInicio.includes('class="mz-tab on" data-tab="inicio"') && mzInicio.includes('data-tab="ads"') && !mzInicio.includes('class="mz-tab on" data-tab="ads"'));
  let mzChat = '';
  try { mzChat = String(sb.mzTabsHTML('chat')); } catch (e) { mzChat = 'ERROR: ' + (e && e.message); }
  t('V4: mzTabsHTML(chat) marca Chat activa y Ads presente', mzChat.includes('class="mz-tab on" data-tab="chat"') && mzChat.includes('data-tab="ads"'));
  let mzAj = '';
  try { mzAj = String(sb.mzTabsHTML('ajustes')); } catch (e) { mzAj = 'ERROR: ' + (e && e.message); }
  t('V5: mzTabsHTML(ajustes) no marca ninguna activa pero Ads sigue presente', !mzAj.includes('class="mz-tab on"') && mzAj.includes('data-tab="ads"'));

  // ===== V6-V8) appShell clásico en vivo =====
  let shAds = '';
  try { shAds = String(sb.appShell('ads', '<p>CONTENIDO-ADS</p>')); } catch (e) { shAds = 'ERROR: ' + (e && e.message); }
  t('V6: appShell(ads) rinde el contenido y el drawer con Ads activo', shAds.includes('CONTENIDO-ADS') && shAds.includes('class="drawer-link on" data-tab="ads"'), shAds.slice(0, 600));
  t('V7: appShell(ads) rinde drawer en orden Inicio · Ads · Chat · Ajustes', (() => {
    const d = shAds.indexOf('drawer-link');
    const sub = shAds.slice(d);
    const i = sub.indexOf('data-tab="inicio"'); const a = sub.indexOf('data-tab="ads"'); const c = sub.indexOf('data-tab="chat"'); const j = sub.indexOf('data-tab="ajustes"');
    return i !== -1 && a !== -1 && c !== -1 && j !== -1 && i < a && a < c && c < j;
  })());
  t('V8: appShell(ads) rinde mz-tabs con Ads activo', shAds.includes('class="mz-tab on" data-tab="ads"'));
  let shInicio = '';
  try { shInicio = String(sb.appShell('inicio', '<p>CONTENIDO-INICIO</p>')); } catch (e) { shInicio = 'ERROR: ' + (e && e.message); }
  t('V9: appShell(inicio) marca Inicio activo y Ads presente sin on', shInicio.includes('class="drawer-link on" data-tab="inicio"') && shInicio.includes('data-tab="ads"') && !shInicio.includes('class="drawer-link on" data-tab="ads"') && shInicio.includes('class="mz-tab on" data-tab="inicio"'));

  // ===== V10) bb-shell intacto en vivo =====
  let bbAds = '';
  try { bbAds = String(sb.bbShell('ads', '<p>CONTENIDO-BB</p>')); } catch (e) { bbAds = 'ERROR: ' + (e && e.message); }
  t('V10: bbShell(ads) sigue con bb-bar Inicio · Ads · Chat y Ads activo', bbAds.includes('CONTENIDO-BB') && bbAds.includes("bbGo('#/app/ads')") && bbAds.includes('class="bb-tab on"') && bbAds.indexOf('Inicio') !== -1 && bbAds.indexOf('>Ads<') !== -1 && bbAds.indexOf('>Chat<') !== -1 && bbAds.indexOf('Inicio') < bbAds.indexOf('>Ads<') && bbAds.indexOf('>Ads<') < bbAds.indexOf('>Chat<'), bbAds.slice(0, 600));

  console.log(`\ntest-lote-ads-tab-principal: ${pass} ok, ${fail} mal`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL suite: ' + (e && e.stack)); process.exit(2); });
