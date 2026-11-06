// test-lote-ads-nativa.js — BUG 6/11: en la app iOS el tab «Ads» del dock
// llevaba a la grilla de la semana en vez de a la pantalla de Ads/billetera.
// Causa (verificada): public/app.js:17772 rebotaba en nativa con
// `location.hash = '#/app/semana'` y el comentario «(solo web)». La rama
// venía del bulk upload 0aa1b09 (30/9/2026, sin mensaje): en esa época la
// recarga era checkout web de MercadoPago (location.href = init_point), que
// dentro del webview sacaba al usuario de la app. Con v707 la recarga es
// cobro por API a la tarjeta guardada (POST /api/ads/billetera/cargar, sin
// redirect) y la carta ya la ofrece en nativa sin gate (IS_NATIVE: 0 en
// chunk-analisis.js). El rebote quedó obsoleto y v711 (dock-ads) lo dejó
// puesto al hacer de Ads un tab de primera clase.
// Fix: el router renderiza adsView() en web Y en nativa; el checkout
// MercadoPago viejo (rec-cards + [data-topup], hoy inalcanzable en nativa)
// se abre en el navegador del sistema en vez de hacer location.href.
// Node puro: asserts estáticos + VM con DOM falso sobre los bloques nuevos.
// Uso: node test-lote-ads-nativa.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const ana = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

(async () => {
  // ---------- 1. Censo (sin cambio) + base v718 ----------
  t(srv.includes("const BUILD_ID = '20261105-v725'"), 'server: BUILD v724 (re-pin sacar-transición, base v723)');
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
  t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
  t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
  t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
  t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
  t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
  t(app.includes("const CHUNK_V = '20261105-v723'"), 'CHUNK_V v723 (ajustes-simple; sin cambio en este lote)');
  t(md5(css) === 'fff8181f706ca8526db1c0f35095608e', 'styles.css md5 (re-pin sacar-transición v725: fuera keyframes entrada)');
  t(cnt(srv, "app.get('/api/ads") + cnt(srv, "app.post('/api/ads") === 10, 'server: 10 rutas /api/ads, sin endpoints nuevos');

  // ---------- 2. El router ya no rebot a semana ----------
  const routerLine = (app.split('\n').find((l) => l.includes("else if (tab === 'ads')")) || '').trim();
  t(routerLine === "else if (tab === 'ads') { content = await adsView(); } // 🚀 Potenciar: billetera + boost (web y nativa: la recarga es cobro por API a la tarjeta guardada, sin checkout web)",
    'router: tab ads renderiza adsView() sin rama nativa (línea exacta)');
  t(!routerLine.includes('IS_NATIVE') && !routerLine.includes('#/app/semana'), 'router: la línea ads no menciona IS_NATIVE ni semana');
  t(cnt(app, '#/app/semana') === 0, 'app.js: cero redirecciones a #/app/semana');
  t(app.includes("if (tab === 'ads') bindAds();"), 'bindApp: tab ads sigue cableando bindAds()');
  t(app.includes('async function adsView()'), 'adsView sigue definida');
  t(app.includes('await loadChunk(\'analisis\')') && app.includes('anaBilleteraTabDatos()'), 'adsView: carga chunk analisis + datos reales de billetera');

  // ---------- 3. Por qué la recarga ya no necesita «solo web» ----------
  t(cnt(ana, 'IS_NATIVE') === 0, 'chunk-analisis: cero gates IS_NATIVE (la billetera ya vive en nativa vía la carta)');
  t(ana.includes("api.post('/api/ads/billetera/cargar'"), 'billetera: la recarga es POST API a la tarjeta guardada (sin redirect)');
  t(ana.includes("api.post('/api/ads/billetera/impulsar'"), 'billetera: impulsar es POST API (sin redirect)');
  t(srv.includes("app.post('/api/ads/billetera/cargar'"), 'server: endpoint cargar existe (cobro Stripe en servidor)');

  // ---------- 4. Checkout MercadoPago viejo: nunca location.href en nativa ----------
  t(app.includes('function adsAbrirCheckout(url)'), 'helper adsAbrirCheckout existe');
  t(cnt(app, 'location.href = r.init_point') === 0, 'app.js: cero location.href = init_point (el checkout ya no saca de la app)');
  t(cnt(app, 'adsAbrirCheckout(r.init_point)') === 2, 'los 2 call sites MP usan adsAbrirCheckout (rec-card + [data-topup])');
  t(app.includes("btn.textContent = esNativa ? '⏳ Abriendo el pago en tu navegador…' : '⏳ Abriendo MercadoPago…';"),
    'rec-card topup: texto honesto en nativa');
  t(app.includes('Se abrió el pago en tu navegador. Cuando vuelvas, tu saldo ya va a estar actualizado.'),
    'rec-card topup: nota honesta en nativa tras abrir el navegador');
  t(app.includes("if (typeof IS_NATIVE !== 'undefined' && IS_NATIVE) { window.open(url, '_blank'); return; }"),
    'adsAbrirCheckout: en nativa abre en el navegador del sistema');

  // ---------- 5. Dock: Ads 2º y marcado activo ----------
  t(app.includes("|| tab === 'ads') return tab;"), "mxTabKey: 'ads' resuelve a 'ads' (bbShell nativa: tab activo)");
  t(app.includes("tab === 'ads' ? 'ads'"), "mzTabsHTML: el mapa 'on' incluye ads (dock web: tab activo)");
  t(app.includes("tabBtn('ads', '#/app/ads', gzT('Ads', 'Ads'))"), 'bbShell: tab Ads 2º en el dock');
  t(app.includes("t('ads', 'ads', pzIc('megaphone'), gzT('Ads', 'Ads'))"), 'mzTabsHTML: tab Ads 2º en el dock');

  // ---------- 6. VM: adsAbrirCheckout con IS_NATIVE true y false ----------
  const helperSrc = sliceFn(app, 'function adsAbrirCheckout(url) {', 'function bindAdsRecCards');
  t(helperSrc.length > 50, 'VM: helper extraído del bundle');
  const runHelper = (native) => {
    const calls = [];
    const loc = { href: '' };
    const ctx = vm.createContext({
      IS_NATIVE: native,
      window: { open: (u, tgt) => { calls.push([u, tgt]); } },
      location: loc,
      console,
    });
    vm.runInContext(helperSrc + "\nadsAbrirCheckout('https://mp.example/pay');", ctx);
    return { calls, href: loc.href };
  };
  const nat = runHelper(true);
  t(nat.calls.length === 1 && nat.calls[0][0] === 'https://mp.example/pay' && nat.calls[0][1] === '_blank',
    'VM: en nativa, el checkout se abre con window.open(url, _blank)');
  t(nat.href === '', 'VM: en nativa, location.href no se toca (el usuario sigue en el tab Ads)');
  const web = runHelper(false);
  t(web.calls.length === 0 && web.href === 'https://mp.example/pay',
    'VM: en web, el checkout navega con location.href (como siempre)');

  // ---------- 7. VM: mzTabsHTML marca Ads activo (y solo Ads) ----------
  const mzSrc = sliceFn(app, 'function mzTabsHTML(tab) {', '/* (LOTE DOCK-MAS) */');
  t(mzSrc.length > 100, 'VM: mzTabsHTML extraído del bundle');
  const runMz = (tab) => {
    const ctx = vm.createContext({
      pzIc: () => '',
      gzT: (es) => es,
      pzDockMasBtn: () => '<button>+</button>',
      pzDockMasHTML: () => '',
      console,
    });
    vm.runInContext(mzSrc + `\n__out = mzTabsHTML('${tab}');`, ctx);
    return ctx.__out;
  };
  const mzAds = runMz('ads');
  t(mzAds.includes('class="mz-tab on" data-tab="ads"'), 'VM: con tab ads, el botón Ads lleva la clase on');
  t(!mzAds.includes('class="mz-tab on" data-tab="inicio"'), 'VM: con tab ads, Inicio NO lleva la clase on');
  t(mzAds.indexOf('data-tab="ads"') < mzAds.indexOf('data-tab="analisis"'), 'VM: Ads sigue 2º en el dock');
  const mzInicio = runMz('inicio');
  t(mzInicio.includes('class="mz-tab on" data-tab="inicio"'), 'VM: con tab inicio, Inicio lleva la clase on');
  t(!mzInicio.includes('class="mz-tab on" data-tab="ads"'), 'VM: con tab inicio, Ads NO lleva la clase on');

  console.log(`\ntest-lote-ads-nativa: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
