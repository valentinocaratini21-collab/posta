// test-lote-dock-ads.js — LOTE DOCK-ADS v2 (base v710, BUILD v711, preparador).
// Retrabajo del lote v1 por decisión de Valentino 6/11 12:27: el dock queda
// Inicio, Ads, + (centro, Agregar, se queda), Estrategia, Premios
// (5 lugares; DOCK-5 6/11: Ajustes sale del dock y vive en el perfil)
// en las dos shells (bbShell nativa + mzTabsHTML escritorio);
// Premios VUELVE al dock con su ruta #/app/jardin-posty y la fila
// «🏆 Premios · Nivel N» que el v1 había agregado en Ajustes SE SACA
// (Ajustes vuelve a como estaba en v710). Premios NO va dentro de Ads:
// pestaña propia (Premios es el hábito diario; dentro de Ads, que se
// abre solo para cargar plata, nadie lo ve). El tab Ads queda EXACTO al
// del v1: billetera USD de v707 (misma UI que la carta de Estrategia +
// historial real de /api/ads/boosts). Sin endpoints nuevos, sin números
// inventados (el mock mostraba 12.400 vistos / 1.840 clics ilustrativos:
// el historial muestra solo alcance y gasto reales cuando Meta los
// reporta). La carta de Estrategia, su billetera y la tarjeta de Agenda
// quedan intactas. Los dos fixes del v1 se mantienen (elegibles por
// post_id; sin mejor, primer elegible pre-seleccionado).
// Node puro: asserts estáticos + VM con DOM falso sobre los bloques nuevos.
// Uso: node test-lote-dock-ads.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const ana = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const aju = fs.readFileSync(path.join(__dirname, 'public/chunk-ajustes.js'), 'utf8');
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
  // ---------- 1. Censo (sin cambio) + base v710 (BUILD v711 en el árbol final) ----------
  t(srv.includes("const BUILD_ID = '20261105-v750'"), 'server: BUILD v750 (re-pin ads-pantalla v750, re-base sobre v748)');
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
  t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
  t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
  t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
  t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
  t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
  t(app.includes("const CHUNK_V = '20261105-v750'"), 'CHUNK_V v750 (bump ads-pantalla)');
  t(md5(css) === '8d16705e3a63aa3aedb926274f9d0664', 'styles.css md5 (re-pin posty-dentro)');
  t(cnt(srv, "app.get('/api/ads") + cnt(srv, "app.post('/api/ads") === 12, 'server: 12 rutas /api/ads (10 + buscar + hoy del lote ads-pantalla)');

  // ---------- 2. Dock v2: Inicio, Ads, +, Estrategia, Premios (las dos shells; DOCK-5 6/11: Ajustes sale del dock y vive en el perfil) ----------
  const bbNav = (app.split('\n').find((l) => l.includes("'<nav class=\"bb-bar\">'")) || '');
  const bbOrd = ['inicio', 'ads', 'pzDockMasBtn', 'analisis', 'jardin']
    .map((k) => bbNav.indexOf(k === 'pzDockMasBtn' ? 'pzDockMasBtn' : `tabBtn('${k}'`));
  t(bbNav.includes("tabBtn('ads', '#/app/ads', gzT('Ads', 'Ads'))"), 'bbShell: tab Ads en el dock');
  t(bbNav.includes("tabBtn('jardin', '#/app/jardin-posty', gzT('Premios', 'Prizes'))"), 'bbShell: Premios vuelve al dock');
  t(cnt(bbNav, 'tabBtn(') === 4 && cnt(bbNav, 'pzDockMasBtn') === 1, 'bbShell: dock en 5 (4 tabs + Agregar centro)');
  t(bbOrd.every((v) => v !== -1) && bbOrd.every((v, i, a) => i === 0 || v > a[i - 1]), 'bbShell: orden Inicio, Ads, +, Estrategia, Premios');
  t(!bbNav.includes("tabBtn('ajustes'"), 'bbShell: sin tab Ajustes (vive en el perfil)');
  const mzNav = (app.split('\n').find((l) => l.includes('<nav class="mz-tabs"')) || '');
  const mzOrd = ['inicio', 'ads', 'pzDockMasBtn', 'analisis', 'jardin']
    .map((k) => mzNav.indexOf(k === 'pzDockMasBtn' ? 'pzDockMasBtn' : `t('${k}'`));
  t(mzNav.includes("t('ads', 'ads', pzIc('megaphone'), gzT('Ads', 'Ads'))"), 'mzTabsHTML: tab Ads con megáfono');
  t(mzNav.includes("t('jardin', 'jardin-posty', pzIc('navBambu'), gzT('Premios', 'Prizes'))"), 'mzTabsHTML: Premios vuelve al dock');
  t(cnt(mzNav, "t('") === 4 && cnt(mzNav, 'pzDockMasBtn') === 1, 'mzTabsHTML: dock en 5 (4 tabs + Agregar centro)');
  t(mzOrd.every((v) => v !== -1) && mzOrd.every((v, i, a) => i === 0 || v > a[i - 1]), 'mzTabsHTML: orden Inicio, Ads, +, Estrategia, Premios');
  t(!mzNav.includes("t('ajustes'"), 'mzTabsHTML: sin tab Ajustes (vive en el perfil)');
  t(app.includes("    ads: '<svg"), 'bbShell: icono megáfono en el mapa ic');
  t(app.includes("|| tab === 'ads') return tab;"), "mxTabKey: 'ads' resuelve a 'ads' (tab activo)");
  t(app.includes("else if (tab === 'ads')") && app.includes('content = await adsView()'), "router: tab 'ads' → adsView()");
  t(cnt(app, '12.400') === 0 && cnt(app, '1.840') === 0, 'app.js: cero números del mock (12.400 / 1.840)');

  // Premios sigue vivo: ruta, drawer y vista de Premios intactos
  t(app.includes("tab === 'jardin-posty'"), 'Premios: la ruta #/app/jardin-posty sigue viva');
  t(app.includes('data-tab="jardin-posty"'), 'Premios: sigue en el drawer (menú ≡)');
  t(app.includes('function mxJardinHTML'), 'Premios: la vista de Premios sigue intacta');
  t(!app.includes('ajsec-premios') && !app.includes('ajPremiosNivel'), 'Premios: sin fila en Ajustes (ya está en el dock)');

  // ---------- 3. adsView (VM): cáscara con billetera + historial reales ----------
  const adsViewSlice = sliceFn(app, 'async function adsView() {', 'function bindAds() {');
  t(adsViewSlice.length > 500, 'adsView: bloque nuevo localizable');
  t(adsViewSlice.includes("loadChunk('analisis')"), 'adsView: carga el chunk analisis (ahí vive la billetera)');
  t(adsViewSlice.includes('anaBilleteraTabDatos()'), 'adsView: pide los datos del tab (billetera real)');
  t(adsViewSlice.includes('anaBilleteraHTML()'), 'adsView: reutiliza la UI de la carta (no reinventa)');
  t(adsViewSlice.includes('anaBilleteraHistorialHTML()'), 'adsView: pinta el historial real');
  t(adsViewSlice.includes('id="adsBilleteraBox"') && adsViewSlice.includes('id="adsHistorial"'), 'adsView: cajas #adsBilleteraBox + #adsHistorial');
  t(!adsViewSlice.includes('recommendations') && !adsViewSlice.includes('fmtARSc(bal)'), 'adsView: fuera el flujo viejo (recomendaciones + crédito ARS)');
  {
    let loadChunkCalls = [];
    let failChunk = false, failDatos = false;
    const sandbox = {
      loadChunk: async (name) => { loadChunkCalls.push(name); if (failChunk) throw new Error('chunk no cargó'); },
      anaBilleteraTabDatos: async () => { if (failDatos) throw new Error('sin datos'); return { ok: true }; },
      anaBilleteraHTML: () => '<div class="ana-boostrec">WALLET $50</div>',
      anaBilleteraHistorialHTML: () => '<div>HIST $20 Activo</div>',
      anaT: (es) => es,
      pzIc: (n) => '[ic:' + n + ']',
      gzT: (es) => es,
      chunkFailHTML: () => '<div class="fail">CHUNK FAIL</div>',
    };
    vm.createContext(sandbox);
    vm.runInContext(adsViewSlice + ';globalThis.__adsView = adsView;', sandbox);
    let html = await sandbox.__adsView();
    t(loadChunkCalls.join(',') === 'analisis', 'adsView VM: carga el chunk analisis');
    t(html.includes('id="adsBilleteraBox"') && html.includes('WALLET $50'), 'adsView VM: la billetera real va en #adsBilleteraBox');
    t(html.includes('id="adsHistorial"') && html.includes('HIST $20 Activo'), 'adsView VM: el historial real va en #adsHistorial');
    t(html.includes('Últimos impulsos') && html.includes('[ic:megaphone]'), 'adsView VM: título Ads + megáfono');
    t(!html.includes('12.400') && !html.includes('1.840'), 'adsView VM: ningún número del mock');
    failChunk = true;
    html = await sandbox.__adsView();
    t(html.includes('CHUNK FAIL'), 'adsView VM: sin chunk analisis → carta amable, no crash');
    failChunk = false; failDatos = true;
    html = await sandbox.__adsView();
    t(html.includes('No pudimos cargar tu billetera') && html.includes('id="adsBilleteraBox"') && html.includes('id="adsHistorial"'), 'adsView VM: sin datos → nota honesta, cáscara intacta');
  }

  // ---------- 4. chunk-analisis: billetera compartida + tab (VM) ----------
  t(ana.includes('anaBilleteraFetchDatos'), 'chunk-analisis: fetch compartido carta/tab');
  t(ana.includes('anaBilleteraConstruirDatos'), 'chunk-analisis: constructor de datos compartido');
  t(ana.includes('anaBilleteraTabDatos'), 'chunk-analisis: loader de datos del tab');
  t(ana.includes('anaBilleteraTabLoad'), 'chunk-analisis: refresco del tab tras cargar/impulsar');
  t(ana.includes('anaBilleteraPintar'), 'chunk-analisis: repintado carta+tab');
  t(ana.includes('anaBilleteraHistorialHTML'), 'chunk-analisis: historial real de impulsos');
  t(ana.includes("api.get('/api/ads/boosts')"), 'chunk-analisis: historial desde /api/ads/boosts (existente)');
  t(ana.includes("'/api/estrategia/mejor-posteo'") && ana.includes("'/api/ads/billetera'") && ana.includes("'/api/ads/billetera/elegibles'"), 'chunk-analisis: tab usa los 3 endpoints existentes');
  t(ana.includes("api.post('/api/ads/billetera/cargar'") && ana.includes("api.post('/api/ads/billetera/impulsar'"), 'chunk-analisis: cargar/impulsar por los endpoints v707');
  t(ana.includes('elegibles.map((e) => e.post_id)') && !ana.includes('.map((e) => e.id)'), 'chunk-analisis: elegibles por post_id (fix del conjunto viejo de undefined)');
  t(cnt(ana, '12.400') === 0, 'chunk-analisis: sin 12.400 del mock');
  {
    const fixtures = () => ({
      mejor: { ok: true, mejor: { post_id: 519, caption: 'Mejor posteo', image_path: '', likes: 10, comments: 2, saved: 1, reach: 100 }, boostHabilitado: true, ads_permiso: true, conversion_pendiente: false },
      bil: { ok: true, balance_cents: 5000, currency: 'USD', montos_usd: [20, 50, 100], ads_permiso: true, boostHabilitado: true, conversion_pendiente: false, movimientos: [{ kind: 'boost_usd', amount_cents: 2000, note: 'Impulso posteo 519 $20 x 7 días' }] },
      elig: { ok: true, elegibles: [{ post_id: 519, caption: 'Mejor posteo', image_path: '' }, { post_id: 521, caption: 'Otro posteo', image_path: '' }] },
      boosts: { ok: true, boosts: [
        { id: 1, post_id: 519, status: 'active', budget_cents: 2000, currency: 'USD', duration_days: 7, created_at: '2026-11-05 17:00:00', last_reach: 1240, last_spend_cents: 350 },
        { id: 2, post_id: 521, status: 'pending', budget_cents: 5000, currency: 'USD', duration_days: 7, created_at: '2026-11-06 10:00:00', last_reach: 0, last_spend_cents: 0 },
      ] },
    });
    let F = fixtures();
    let failUrls = new Set();
    let apiCalls = [];
    const els = {};
    const mounted = new Set();
    const fakeEl = (id) => { if (!els[id]) els[id] = { id, innerHTML: '', textContent: '', disabled: false }; return els[id]; };
    const sandbox = {
      console,
      api: {
        get: async (url) => {
          apiCalls.push(['get', url]);
          if (failUrls.has(url)) throw new Error('fail ' + url);
          if (url === '/api/estrategia/mejor-posteo') return F.mejor;
          if (url === '/api/ads/billetera') return F.bil;
          if (url === '/api/ads/billetera/elegibles') return F.elig;
          if (url === '/api/ads/boosts') return F.boosts;
          throw new Error('url no esperada ' + url);
        },
        post: async (url, body) => {
          apiCalls.push(['post', url, body]);
          if (url === '/api/ads/billetera/cargar') { F.bil = { ...F.bil, balance_cents: 7000 }; return { ok: true, balance_cents: 7000 }; }
          if (url === '/api/ads/billetera/impulsar') { F.bil = { ...F.bil, balance_cents: 3000 }; return { ok: true, balance_cents: 3000 }; }
          throw new Error('post no esperado ' + url);
        },
      },
      document: { getElementById: (id) => (mounted.has(id) ? fakeEl(id) : null) },
      anaPastMode: false,
      anaLang: 'es',
      anaT: (es) => es,
      esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    };
    vm.createContext(sandbox);
    const slice = sliceFn(ana, 'let anaBilleteraDatos = null;', '// ---------- FUNDAMENTO-LITERAL x5');
    t(slice.length > 1000, 'chunk-analisis VM: bloque billetera localizable');
    vm.runInContext(slice + ';globalThis.__getDatos = () => anaBilleteraDatos;'
      + ';globalThis.__tabDatos = anaBilleteraTabDatos; globalThis.__tabLoad = anaBilleteraTabLoad;'
      + ';globalThis.__pintar = anaBilleteraPintar; globalThis.__histHTML = anaBilleteraHistorialHTML;'
      + ';globalThis.__html = anaBilleteraHTML; globalThis.__recLoad = anaBoostRecLoad;'
      + ';globalThis.__elegirPosteo = anaBilleteraElegirPosteo; globalThis.__elegirMonto = anaBilleteraElegirMonto;'
      + ';globalThis.__cargar = anaBilleteraCargar; globalThis.__impulsar = anaBilleteraImpulsar;', sandbox);
    const reset = () => { F = fixtures(); failUrls = new Set(); apiCalls = []; };

    // TabDatos feliz: recomendado pre-seleccionado, saldo y boosts reales
    reset(); mounted.clear();
    let datos = await sandbox.__tabDatos();
    t(datos && datos.selId === 519, 'tabDatos: recomendado (519) pre-seleccionado');
    t(datos && datos.billetera.balance_cents === 5000, 'tabDatos: saldo real $50 de la billetera');
    t(datos && datos.boosts.length === 2, 'tabDatos: 2 impulsos reales del historial');
    t(datos && datos.movimientos.length === 1, 'tabDatos: movimientos de la billetera');
    t(sandbox.__html().includes('Tu billetera de ads: $50'), 'wallet: saldo $50 real en el HTML');
    t(sandbox.__html().includes('el que más rindió'), 'wallet: el recomendado lleva su marca');

    // FIX keepSel: la selección sobrevive a la recarga (antes se perdía: el
    // conjunto era de `id` undefined y siempre volvía al recomendado)
    sandbox.__elegirPosteo(521, null);
    t(sandbox.__getDatos().selId === 521, 'elegirPosteo: cambia la selección a 521');
    datos = await sandbox.__tabDatos();
    t(datos.selId === 521, 'tabDatos keepSel: la selección 521 sobrevive a la recarga');

    // Sin mejor: se pre-selecciona el primer elegible
    reset(); F.mejor = { ok: true, mejor: null, boostHabilitado: true, ads_permiso: true, conversion_pendiente: false };
    F.elig = { ok: true, elegibles: [{ post_id: 521, caption: 'A', image_path: '' }, { post_id: 522, caption: 'B', image_path: '' }] };
    datos = await sandbox.__tabDatos();
    t(datos && datos.selId === 521, 'tabDatos sin mejor: primer elegible pre-seleccionado');

    // Las 3 lecturas fallan: null (adsView muestra la nota honesta)
    reset(); failUrls = new Set(['/api/estrategia/mejor-posteo', '/api/ads/billetera', '/api/ads/billetera/elegibles']);
    datos = await sandbox.__tabDatos();
    t(datos === null, 'tabDatos: las 3 lecturas fallan → null (nunca «no habilitado» mentiroso)');

    // Mejor-posteo falla pero billetera ok: la billetera igual se muestra
    reset(); failUrls = new Set(['/api/estrategia/mejor-posteo']);
    datos = await sandbox.__tabDatos();
    t(datos && datos.boostHabilitado === true, 'tabDatos: mejor falla → boostHabilitado sale de la billetera');
    t(datos && sandbox.__html().includes('Tu billetera de ads: $50'), 'tabDatos: mejor falla → la billetera igual se pinta');

    // Historial real: estado, monto, días, fechas, alcance y gasto reales
    reset(); await sandbox.__tabDatos();
    const hist = sandbox.__histHTML();
    t(hist.includes('$20') && hist.includes('$50'), 'historial: montos reales $20 y $50');
    t(hist.includes('Activo') && hist.includes('Pendiente'), 'historial: estados reales Activo y Pendiente');
    t(/1[.,]240/.test(hist), 'historial: alcance real 1.240 (de Meta, no del mock)');
    t(hist.includes('Posteo #519') && /hasta 12/.test(hist), 'historial: posteo + hasta 12 nov (7 días)');
    t(hist.includes('Gastado $3'), 'historial: gasto real $3');
    t(!hist.includes('clics') && !hist.includes('1.840') && !hist.includes('12.400'), 'historial: sin clics inventados ni números del mock');
    reset(); F.boosts = { ok: true, boosts: [] }; await sandbox.__tabDatos();
    t(sandbox.__histHTML().includes('Todavía no impulsaste'), 'historial vacío: nota honesta, sin números');

    // TabLoad pinta el tab; sin montar, no hace nada (ni tira)
    reset(); mounted.clear(); mounted.add('adsBilleteraBox'); mounted.add('adsHistorial'); mounted.add('anaBoostRecMsg');
    apiCalls = [];
    await sandbox.__tabLoad();
    t(fakeEl('adsBilleteraBox').innerHTML.includes('Tu billetera de ads: $50'), 'tabLoad: pinta la billetera en el tab');
    t(fakeEl('adsHistorial').innerHTML.includes('$20'), 'tabLoad: pinta el historial en el tab');
    mounted.clear();
    apiCalls = [];
    await sandbox.__tabLoad();
    t(true, 'tabLoad sin montar: no tira');
    t(apiCalls.filter((c) => c[0] === 'get').length === 0, 'tabLoad sin montar: no llama a la API');

    // Pintar: elegir monto repinta carta Y tab
    reset(); mounted.clear(); mounted.add('anaBoostRec'); mounted.add('adsBilleteraBox');
    await sandbox.__tabDatos();
    sandbox.__elegirMonto(50, null);
    t(fakeEl('anaBoostRec').innerHTML.includes('Meter ads por 7 días · $50'), 'pintar: elegir monto repinta la carta');
    t(fakeEl('adsBilleteraBox').innerHTML.includes('Meter ads por 7 días · $50'), 'pintar: elegir monto repinta el tab');

    // Carta intacta: pinta, y se esconde sin mejor ni elegibles / sin datos
    reset(); mounted.clear(); mounted.add('anaBoostRec');
    await sandbox.__recLoad();
    t(fakeEl('anaBoostRec').innerHTML.includes('Tu billetera de ads: $50'), 'carta: anaBoostRecLoad sigue pintando la billetera');
    F.mejor = { ok: true, mejor: null, boostHabilitado: true, ads_permiso: true }; F.elig = { ok: true, elegibles: [] };
    await sandbox.__recLoad();
    t(fakeEl('anaBoostRec').innerHTML === '', 'carta: sin mejor ni elegibles → la caja se esconde (como antes)');
    reset(); failUrls = new Set(['/api/estrategia/mejor-posteo']);
    await sandbox.__recLoad();
    t(fakeEl('anaBoostRec').innerHTML === '', 'carta: mejor-posteo falla → la caja se esconde (como antes)');

    // Cargar e impulsar: cobran por los endpoints v707 y refrescan carta+tab
    reset(); mounted.clear(); mounted.add('anaBoostRec'); mounted.add('adsBilleteraBox'); mounted.add('adsHistorial'); mounted.add('anaBoostRecMsg');
    await sandbox.__tabDatos();
    apiCalls = [];
    await sandbox.__cargar(20, null);
    t(apiCalls.some((c) => c[0] === 'post' && c[1] === '/api/ads/billetera/cargar' && c[2].montoUSD === 20), 'cargar: POST /api/ads/billetera/cargar {montoUSD:20}');
    t(fakeEl('anaBoostRecMsg').textContent.includes('cargaste $20') && fakeEl('anaBoostRecMsg').textContent.includes('$70'), 'cargar: mensaje con el saldo nuevo $70');
    t(fakeEl('adsBilleteraBox').innerHTML.includes('Tu billetera de ads: $70'), 'cargar: el tab muestra el saldo nuevo');
    apiCalls = [];
    await sandbox.__impulsar(null);
    t(apiCalls.some((c) => c[0] === 'post' && c[1] === '/api/ads/billetera/impulsar' && c[2].posteoId === 519 && c[2].montoUSD === 20), 'impulsar: POST /api/ads/billetera/impulsar {posteoId:519, montoUSD:20}');
    t(fakeEl('anaBoostRecMsg').textContent.includes('ya tiene ads por 7 días'), 'impulsar: mensaje de éxito');
    t(fakeEl('adsBilleteraBox').innerHTML.includes('Tu billetera de ads: $30'), 'impulsar: el tab muestra el saldo nuevo $30');
  }

  // ---------- 5. chunk-ajustes: SIN fila de Premios (vuelve al dock; Ajustes = v710) ----------
  t(!aju.includes('id="ajsec-premios"'), 'ajustes: sin tarjeta #ajsec-premios (el v1 la agregaba)');
  t(!aju.includes('id="ajPremiosNivel"'), 'ajustes: sin span de nivel de Premios');
  t(!aju.includes("api.get('/api/oficina/nivel?poder=posty')"), 'ajustes: sin lectura de /api/oficina/nivel (era solo para la fila)');
  t(md5(aju) === 'a872d9babb32f29548cde30a0cfa6e48', 'ajustes: chunk-ajustes.js intacto (md5 v748, re-pin ads-pantalla: el pin v723 quedó rancio en v732)');

  // ---------- 6. Contratos: nada de lo vigente se rompe ----------
  t(ana.includes('anaBoostRecLoad') && ana.includes("getElementById('anaBoostRec')"), 'contrato: la billetera de la carta sigue viva');
  t(app.includes('function enhanceAdsBoost') && app.includes('function adsBoostCardHTML') && app.includes('adsBoostSlot'), 'contrato: la tarjeta de impulsar en Agenda sigue viva');
  t(app.includes("api.get('/api/ads/config')"), 'contrato: la tarjeta de Agenda sigue leyendo su propio /api/ads/config');
  t(app.includes('function handlePendingBoost'), 'contrato: la vuelta de MercadoPago (topup viejo) sigue atendiéndose');
  t(app.includes('function bindAdsRecCards'), 'contrato: los botones de impulsar de Agenda siguen cableados');
  t(!app.includes("ADS_CTX = { balance: cfg"), 'contrato: el tab viejo ya no escribe ADS_CTX (nadie lo necesita)');
  t(cnt(ana, 'anaBilleteraHTML()') >= 3, 'contrato: una sola UI de billetera para carta y tab');

  console.log(`\ntest-lote-dock-ads: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e && e.stack || e); process.exit(1); });
