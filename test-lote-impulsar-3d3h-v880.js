'use strict';
// test-lote-impulsar-3d3h-v880.js — LOTE IMPULSAR 3D-3H DORADO PREMIUM
// HORIZONTAL (v880, diseño elegido por Valentino 10/11 tras mocks
// V1–V11 y 3D-1/2/3): la hoja Impulsar pasa a 3D-3H — título
// «Impulsar posteo con Ads», foto del posteo a la izquierda (entera,
// 96×120, 4:5, contain, marco dorado), los 3 montos apilados a la
// derecha ($50 grande dorado RECOMENDADO · 7 DÍAS, $20 y $100), cada
// monto impulsa con UN TOQUE, y abajo «El mejor de tu semana · 5 de
// alcance, 1 me gusta» + «Elegir otro posteo» (abre el picker). No van:
// el título de sección, el caption truncado, el «Por eso Posty te
// recomienda...» ni el botón celeste de confirmar (los montos SON la
// acción). Si un monto no puede impulsar (saldo, gate o moneda), el
// toque NO impulsa: la hoja muestra el aviso y el camino de carga,
// que degrada a «Agregar tarjeta» si no hay tarjeta (camino v877).
// Sin riel (v885) todavía: los montos NO dependen de endpoints del
// riel; el impulso usa POST /impulsar existente y el cobro, /cargar.
// Node puro: asserts estáticos + VM con DOM falso sobre la sección
// RS-4 de app.js (mismo patrón que test-lote-rediseño-rs4.js) + boot
// real por HTTP con DATA_DIR aislada. Puerto 34711.
// Uso: node test-lote-impulsar-3d3h-v880.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idxES = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

(async () => {
  // ---------- 1. Estampado ----------
  t(srv.includes("const BUILD_ID = '20261105-v880';"), 'server: BUILD v880');
  t(cnt(srv, '20261105-v880') === 1, 'server: BUILD v880 ×1 (solo el estampado)');
  t(idxES.includes('/app.js?v=599'), 'index ES: app.js?v=599');
  t(idxES.includes('/styles.css?v=20261229'), 'index ES: styles?v=20261229');
  t(idxEN.includes('/styles.css?v=20261229'), 'index EN: styles?v=20261229 (mismo valor que ES)');
  t(!idxEN.includes('/app.js?v='), 'index EN: no carga app.js (landing, sin ?v= que tocar)');

  // ---------- 2. Estructura de la hoja (estático) ----------
  const a = app.indexOf('function pzBoostPintarBoost()');
  const b = app.indexOf('function pzBoostPintarExito', a);
  const hoja = (a !== -1 && b > a) ? app.slice(a, b) : '';
  t(hoja.length > 1000, 'app: pzBoostPintarBoost extraída (' + hoja.length + ' chars)');
  // Lo que VA (diseño 3D-3H).
  t(hoja.includes('pz-boost-3d3-title') && hoja.includes("gzT('Impulsar posteo', 'Boost post')") && hoja.includes("gzT('con Ads', 'with Ads')"), 'hoja: título «Impulsar posteo con Ads»');
  t(hoja.includes('pz-boost-3d3-thumb') && hoja.includes('pz-boost-3d3-row'), 'hoja: foto a la izquierda en fila 3D-3H');
  t(hoja.includes('pz-boost-3d3-main') && hoja.includes('pzBoostImpulsarMonto(50, this)') && hoja.includes("gzT('RECOMENDADO · 7 DÍAS', 'RECOMMENDED · 7 DAYS')"), 'hoja: $50 grande dorado RECOMENDADO · 7 DÍAS');
  t(hoja.includes('pzBoostImpulsarMonto(20, this)') && hoja.includes('pzBoostImpulsarMonto(100, this)'), 'hoja: $20 y $100 como montos laterales');
  t(hoja.includes('pz-boost-3d3-bottom') && hoja.includes('pz-boost-3d3-linea') && hoja.includes("gzT('El mejor de tu semana', 'Your best post this week')"), 'hoja: línea «El mejor de tu semana» abajo');
  t(hoja.includes('pz-boost-3d3-otro') && hoja.includes('pzBoostPickOpen()') && hoja.includes("gzT('Elegir otro posteo', 'Choose another post')"), 'hoja: «Elegir otro posteo» abre el picker');
  t(hoja.includes('pzBoostNumerosComa(p)'), 'hoja: la línea usa los números con coma (5 de alcance, 1 me gusta)');
  // Lo que SALE (no va en la hoja).
  t(!hoja.includes('pz-boost-head'), 'hoja: sin título de sección (pz-boost-head fuera)');
  t(!hoja.includes('pzBoostTitulo(p)') && !hoja.includes('pz-boost-post'), 'hoja: sin caption truncado (pzBoostTitulo / pz-boost-post fuera)');
  t(!hoja.includes('pzBoostRecTexto(p)') && !hoja.includes('Por eso Posty'), 'hoja: sin «Por eso Posty te recomienda...»');
  t(!hoja.includes('pz-boost-hero') && !hoja.includes('Te recomiendo este monto'), 'hoja: sin hero del monto ni texto de recomendación');
  t(!hoja.includes('pz-boost-amts') && !hoja.includes('Cambiar monto') && !hoja.includes('pzBoostToggleMontos'), 'hoja: sin selector de montos ni «Cambiar monto»');
  t(!hoja.includes('Impulsar por $') && !hoja.includes('btn-primary btn-block" style="margin-top:9px"'), 'hoja: sin botón celeste de confirmar');
  t(!hoja.includes('Tu saldo') && !hoja.includes('pz-boost-bal'), 'hoja: sin línea de saldo permanente (solo el aviso cuando falta)');
  // La carga sigue existiendo, pero solo cuando falta saldo.
  t(hoja.includes("pzBoostCargar(this)") && hoja.includes("const cargar = falta ?"), 'hoja: «Cargar $X ahora» solo cuando falta saldo');
  t(hoja.includes('pzBoostMsg'), 'hoja: el párrafo de mensajes sigue (para Cargar/Confirmar)');

  // ---------- 3. Funciones nuevas + M78 ----------
  t(app.includes('function pzBoostNumerosComa(p)'), 'app: pzBoostNumerosComa definida');
  t(app.includes('function pzBoostPuede(monto)'), 'app: pzBoostPuede definida');
  t(app.includes('async function pzBoostImpulsarMonto(monto, btn)'), 'app: pzBoostImpulsarMonto definida');
  t(cnt(app, 'pzBoostImpulsarMonto') === 4, 'M78: pzBoostImpulsarMonto ×4 (def + 3 botones)');
  t(cnt(app, 'pzBoostPuede') === 2, 'M78: pzBoostPuede ×2 (def + llamada en pzBoostImpulsarMonto)');
  t(cnt(app, 'pzBoostNumerosComa') === 2, 'M78: pzBoostNumerosComa ×2 (def + llamada en la hoja)');
  t(cnt(app, 'pzBoostPickOpen') >= 1 && hoja.includes('pzBoostPickOpen()'), 'M78: pzBoostPickOpen llamada desde «Elegir otro posteo»');
  // La degradación a v877 sigue cableada: pzBoostCargar pega el botón
  // «Agregar tarjeta» cuando no hay tarjeta.
  t(app.includes("motivo === 'sin_cliente_stripe' || motivo === 'sin_tarjeta_guardada'") && app.includes('anaAgregarTarjetaBtn(msgEl)'), 'app: degradación v877 intacta en pzBoostCargar (sin tarjeta → Agregar tarjeta)');
  // Sin dependencia del riel: la hoja no llama a ningún endpoint nuevo
  // ni a /api/ads/billetera/* fuera de los existentes.
  t(!hoja.includes('/api/ads/billetera/rail') && !hoja.includes('railCobro'), 'app: la hoja no depende del riel (sin endpoints nuevos)');
  // pzBoostRecTexto y pzBoostTitulo siguen existiendo (los usa la
  // sección Impulsar de Hoy y el picker, fuera de la hoja).
  t(app.includes('function pzBoostRecTexto(p)') && app.includes('function pzBoostTitulo(p)'), 'app: pzBoostRecTexto y pzBoostTitulo siguen (los usan Hoy y el picker)');

  // ---------- 4. CSS 3D-3H ----------
  t(css.includes('.pz-boost-3d3{'), 'styles: .pz-boost-3d3 (tarjeta dorada)');
  t(css.includes('.pz-boost-3d3-thumb{width:96px;height:120px'), 'styles: thumb 96×120');
  t(css.includes('.pz-boost-3d3-thumb img{width:100%;height:100%;object-fit:contain'), 'styles: foto entera, contain, sin recorte');
  t(css.includes('.pz-boost-3d3-thumb{') && css.includes('border:3px solid #FEC14D'), 'styles: marco dorado en la foto');
  t(css.includes('.pz-boost-3d3-main{') && css.includes('linear-gradient(180deg,#FFDE7A 0%,#FEC14D 45%,#F0A92E 100%)'), 'styles: $50 con gradiente dorado');
  t(css.includes('0 6px 0 #C78F16'), 'styles: $50 con borde 3D (relieve dorado)');
  t(css.includes('.pz-boost-3d3-side{') && css.includes('0 3px 0 #E0CFA4'), 'styles: $20/$100 con relieve');
  t(css.includes('.pz-boost-3d3-title span{color:#B98A12}'), 'styles: «con Ads» en dorado');
  t(css.includes('.pz-boost-3d3-otro{') && css.includes('color:#2793C8'), 'styles: «Elegir otro posteo» fantasma celeste');
  t(cnt(css, 'pz-boost-3d3') >= 12, 'styles: clases pz-boost-3d3 ×12+ (tarjeta completa)');
  // El CSS viejo de la hoja queda (lo usan el picker y el estado
  // «ya impulsado»); no se borra nada que otra superficie necesite.
  t(css.includes('.pz-boost-head{') && css.includes('.pz-boost-opt{'), 'styles: CSS del picker intacto');

  // ---------- 5. VM: la hoja con DOM falso ----------
  const rs4Start = app.indexOf('/* ============================================================\n   LOTE REDISEÑO SIMPLE RS-4');
  const rs4End = app.indexOf('function bindAds() {', rs4Start);
  const rs4Src = (rs4Start !== -1 && rs4End > rs4Start) ? app.slice(rs4Start, rs4End) : '';
  t(rs4Src.length > 5000 && rs4Src.includes('function pzBoostImpulsarMonto('), 'VM: sección RS-4 extraída con el código v880');
  const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ELEG_VM = [
    { post_id: 101, image_path: '/media/cafe1.jpg', caption: 'Café de especialidad recién tostado', reach: 500, likes: 40, comments: 5, saves: 2, recomendado: true, publicado_en: '2026-11-09 12:00:00', viejo: false },
    { post_id: 102, image_path: '/media/cafe2.jpg', caption: 'Torta de chocolate para el finde', reach: 100, likes: 10, comments: 1, saves: 0, recomendado: false, publicado_en: '2026-11-08 12:00:00', viejo: false },
    { post_id: 103, image_path: '/media/torta-vieja.jpg', caption: 'Promo vieja de la abuela', reach: 50, likes: 3, comments: 0, saves: 0, recomendado: false, publicado_en: '2026-10-26 12:00:00', viejo: true, ya_impulsado: true },
  ];
  const makeCtx = (lang, behavior) => {
    const toasts = [];
    const posts = [];
    const windowStub = {};
    const docById = {};
    const docButtons = [];
    let agregarTarjetaCalled = false;
    class FakeEl {
      constructor(tag) {
        this.tagName = (tag || 'div').toUpperCase();
        this.id = ''; this.className = ''; this.style = {};
        this.innerHTML = ''; this.textContent = ''; this.disabled = false;
        this.children = [];
        this.classList = { add: (c) => { this.className = (this.className + ' ' + c).trim(); }, remove: () => {}, contains: (c) => this.className.split(' ').includes(c) };
      }
      addEventListener() {}
      appendChild(ch) { this.children.push(ch); if (ch.id) docById[ch.id] = ch; return ch; }
      querySelectorAll() { return []; }
    }
    const documentStub = {
      body: new FakeEl('body'),
      createElement: (tag) => new FakeEl(tag),
      getElementById: (id) => docById[id] || null,
      querySelectorAll: (sel) => {
        const m = /data-pz-boost-post="(\d+)"/.exec(String(sel || ''));
        if (!m) return [];
        return docButtons.filter((b) => String(b._pzBoostPost) === m[1]);
      },
    };
    documentStub.body.appendChild = (ch) => { documentStub.body.children.push(ch); if (ch.id) docById[ch.id] = ch; return ch; };
    const ctx = vm.createContext({
      console, window: windowStub, document: documentStub,
      api: {
        get: async (url) => {
          if (String(url).includes('/elegibles')) return { ok: true, ads_ready: behavior.adsReady, motivo: behavior.adsReady ? undefined : 'ads_not_configured', elegibles: behavior.elegibles };
          if (String(url).includes('/billetera')) return { ok: true, balance_cents: behavior.balance_cents, currency: 'USD', montos_usd: [20, 50, 100], boostHabilitado: behavior.boostHabilitado, ads_permiso: behavior.adsPermiso, conversion_pendiente: behavior.conversionPendiente || false };
          return { ok: false };
        },
        post: async (url, body) => {
          posts.push({ url: String(url), body: body || null });
          if (String(url).includes('/impulsar')) {
            if (behavior.postImpulsarThrow) throw { data: behavior.postImpulsarThrow };
            return behavior.postImpulsar || { ok: true, balance_cents: 0 };
          }
          if (String(url).includes('/cargar')) {
            if (behavior.postCargarThrow) throw { data: behavior.postCargarThrow };
            return behavior.postCargar || { ok: true, balance_cents: behavior.balance_cents + 5000 };
          }
          return { ok: false };
        },
      },
      esc: escStub,
      gzT: (es, en) => (lang === 'en' ? (en || es) : es),
      toast: (m) => { toasts.push(String(m)); },
      pcParseDate: (s) => { const x = String(s || '').replace(' ', 'T'); const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x) ? x : x + 'Z'); return isNaN(d) ? null : d; },
      pcTz: () => 'America/New_York',
      loadChunk: async () => {},
      anaAgregarTarjetaBtn: (msgEl) => { agregarTarjetaCalled = true; if (msgEl) msgEl.__agregarBtn = true; },
      __toasts: toasts, __posts: posts,
    });
    const pickBody = new FakeEl('div'); pickBody.id = 'pzBoostPickBody'; docById['pzBoostPickBody'] = pickBody;
    const pickGo = new FakeEl('button'); pickGo.id = 'pzBoostPickGo'; docById['pzBoostPickGo'] = pickGo;
    const boostBody = new FakeEl('div'); boostBody.id = 'pzBoostBody'; docById['pzBoostBody'] = boostBody;
    const msg = new FakeEl('p'); msg.id = 'pzBoostMsg'; docById['pzBoostMsg'] = msg;
    vm.runInContext(rs4Src, ctx);
    ctx.__pickBody = pickBody; ctx.__pickGo = pickGo; ctx.__boostBody = boostBody; ctx.__msg = msg;
    ctx.__FakeEl = FakeEl; ctx.__docButtons = docButtons; ctx.__docById = docById;
    ctx.__agregarTarjeta = () => agregarTarjetaCalled;
    return ctx;
  };
  const stateOf = (ctx) => { vm.runInContext('__s = pzBoostState;', ctx); return ctx.__s; };

  // D1. Gate cerrado, saldo $0: la hoja 3D-3H con el aviso del gate.
  const behD = { adsReady: false, boostHabilitado: false, adsPermiso: null, balance_cents: 0, elegibles: ELEG_VM };
  const ctxD = makeCtx('es', behD);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxD);
  const hD = ctxD.__boostBody.innerHTML;
  t(hD.includes('Impulsar posteo') && hD.includes('con Ads'), 'VM D1: título «Impulsar posteo con Ads»');
  t(hD.includes('/media/cafe1.jpg') && hD.includes('pz-boost-3d3-thumb'), 'VM D1: foto real del posteo en el marco dorado');
  t(hD.includes('$50') && hD.includes('RECOMENDADO · 7 DÍAS') && hD.includes('$20') && hD.includes('$100'), 'VM D1: los 3 montos ($50 RECOMENDADO, $20, $100)');
  t(hD.includes('El mejor de tu semana') && hD.includes('500 de alcance, 40 me gusta'), 'VM D1: línea «El mejor de tu semana · 500 de alcance, 40 me gusta»');
  t(hD.includes('Elegir otro posteo'), 'VM D1: botón «Elegir otro posteo»');
  t(!hD.includes('Café de especialidad recién tostado'), 'VM D1: el caption NO aparece en la hoja (sale el truncado)');
  t(!hD.includes('Por eso Posty') && !hD.includes('pz-boost-hero') && !hD.includes('Cambiar monto') && !hD.includes('Impulsar por $'), 'VM D1: nada de lo viejo en la hoja');
  t(hD.includes('La pauta todavía no está configurada para tu cuenta.'), 'VM D1: aviso honesto del gate (Meta sin configurar)');
  t(hD.includes('Cargar $50 ahora'), 'VM D1: con saldo $0, el botón Cargar $50 está (camino de carga)');
  t(!hD.includes('Tu saldo'), 'VM D1: sin línea de saldo permanente');

  // D2. Gate abierto, saldo $0: un toque NO impulsa (sin gasto) y el
  // aviso sigue el monto; la degradación a v877 queda cableada.
  const behF = { adsReady: true, boostHabilitado: true, adsPermiso: true, balance_cents: 0, elegibles: ELEG_VM };
  const ctxF = makeCtx('es', behF);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxF);
  t(ctxF.__boostBody.innerHTML.includes('Te faltan $50'), 'VM D2: saldo $0, el aviso es lo que falta ($50)');
  t(ctxF.__posts.filter((p) => p.url.includes('/impulsar')).length === 0, 'VM D2: al abrir no se impulsa nada (sin POST)');
  await vm.runInContext('pzBoostImpulsarMonto(50, null);', ctxF);
  t(ctxF.__posts.filter((p) => p.url.includes('/impulsar')).length === 0, 'VM D2: un toque en $50 sin saldo NO impulsa (sin POST, sin gasto)');
  t(ctxF.__boostBody.innerHTML.includes('Te faltan $50') && ctxF.__boostBody.innerHTML.includes('Cargar $50 ahora'), 'VM D2: tras el toque, la hoja muestra el aviso y Cargar $50');
  await vm.runInContext('pzBoostImpulsarMonto(20, null);', ctxF);
  t(ctxF.__boostBody.innerHTML.includes('Te faltan $20') && ctxF.__boostBody.innerHTML.includes('Cargar $20 ahora'), 'VM D2: el aviso y Cargar siguen el monto tocado ($20)');
  t(stateOf(ctxF).selMonto === 20, 'VM D2: el monto elegido queda en el estado ($20)');
  await vm.runInContext('pzBoostImpulsarMonto(30, null);', ctxF);
  t(stateOf(ctxF).selMonto === 20 && ctxF.__posts.filter((p) => p.url.includes('/impulsar')).length === 0, 'VM D2: monto inválido (30) es un no-op');
  // Degradación v877: Cargar sin tarjeta → motivo + botón Agregar tarjeta.
  const behG = { adsReady: true, boostHabilitado: true, adsPermiso: true, balance_cents: 0, elegibles: ELEG_VM, postCargarThrow: { ok: false, motivo: 'sin_tarjeta_guardada' } };
  const ctxG = makeCtx('es', behG);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxG);
  await vm.runInContext('pzBoostCargar(null);', ctxG);
  t(ctxG.__msg.textContent.includes('No tenés una tarjeta guardada'), 'VM D2: Cargar sin tarjeta muestra el motivo real');
  t(ctxG.__agregarTarjeta() === true, 'VM D2: degradación v877 — se invoca anaAgregarTarjetaBtn (botón «Agregar tarjeta»)');

  // D3. Gate abierto con saldo: un toque por monto impulsa con ese monto.
  for (const m of [50, 20, 100]) {
    const beh = { adsReady: true, boostHabilitado: true, adsPermiso: true, balance_cents: 10000, elegibles: ELEG_VM, postImpulsar: { ok: true, balance_cents: 10000 - m * 100 } };
    const ctx = makeCtx('es', beh);
    await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctx);
    t(!ctx.__boostBody.innerHTML.includes('Te faltan $') && !ctx.__boostBody.innerHTML.includes('Cargar $'), 'VM D3: con saldo, sin aviso ni Cargar ($' + m + ')');
    await vm.runInContext(`pzBoostImpulsarMonto(${m}, null);`, ctx);
    const imp = ctx.__posts.filter((p) => p.url.includes('/impulsar'));
    t(imp.length === 1 && imp[0].body && imp[0].body.montoUSD === m, 'VM D3: un toque en $' + m + ' → POST /impulsar con montoUSD ' + m);
    t(ctx.__boostBody.innerHTML.includes('Posteo impulsado'), 'VM D3: éxito «Posteo impulsado» ($' + m + ')');
    t(ctx.__toasts.some((x) => x.includes('Posteo impulsado por 7 días')), 'VM D3: toast de éxito ($' + m + ')');
  }

  // D4. «Elegir otro posteo» abre el picker.
  const ctxP = makeCtx('es', behD);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxP);
  await vm.runInContext('pzBoostPickOpen();', ctxP);
  t(ctxP.__docById['pzBoostPickOv'] && ctxP.__docById['pzBoostPickOv'].style.display === 'flex', 'VM D4: «Elegir otro posteo» abre el picker (overlay visible)');
  t(ctxP.__docById['pzBoostOv'] && ctxP.__docById['pzBoostOv'].style.display === 'none', 'VM D4: al abrir el picker, la hoja se esconde');
  t(ctxP.__pickBody.innerHTML.includes('Torta de chocolate para el finde'), 'VM D4: el picker lista los posteos para elegir');

  // D5. Posteo ya impulsado: estado «ya impulsado», sin montos.
  const behY = { adsReady: true, boostHabilitado: true, adsPermiso: true, balance_cents: 10000, elegibles: ELEG_VM };
  const ctxY = makeCtx('es', behY);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[2])})`, ctxY);
  t(ctxY.__boostBody.innerHTML.includes('Este posteo ya está impulsado'), 'VM D5: posteo ya impulsado → estado «ya impulsado»');
  t(!ctxY.__boostBody.innerHTML.includes('pzBoostImpulsarMonto'), 'VM D5: sin montos cuando ya está impulsado');

  // D6. Inglés: título y RECOMENDADO en EN.
  const ctxEN = makeCtx('en', behD);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxEN);
  const hEN = ctxEN.__boostBody.innerHTML;
  t(hEN.includes('Boost post') && hEN.includes('with Ads'), 'VM D6: título EN «Boost post with Ads»');
  t(hEN.includes('RECOMMENDED · 7 DAYS'), 'VM D6: RECOMENDADO en EN');
  t(hEN.includes('Your best post this week') && hEN.includes('500 reach, 40 likes'), 'VM D6: línea EN con números reales');
  t(hEN.includes('Choose another post'), 'VM D6: «Choose another post» en EN');

  // ---------- 6. Boot real: /api/version v880 + bundle servido ----------
  let booted = false;
  try {
    require.resolve('express');
    booted = true;
  } catch (e) {
    if (!process.env.V880_BOOTSTRAPPED) {
      const { spawnSync } = require('child_process');
      const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
        stdio: 'inherit',
        env: { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules', V880_BOOTSTRAPPED: '1' },
      });
      process.exit(r.status == null ? 1 : r.status);
    }
  }
  if (booted) {
    const os = require('os');
    const { spawn } = require('child_process');
    const PORT = 34711;
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-impulsar-v880-'));
    const env = { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'test', SESSION_SECRET: 'test', OPENAI_API_KEY: '', RESEND_API_KEY: '' };
    delete env.OPENAI_API_KEY; delete env.RESEND_API_KEY;
    const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: 'ignore' });
    const BASE = 'http://127.0.0.1:' + PORT;
    const waitBoot = async (tries = 60) => {
      for (let i = 0; i < tries; i++) {
        try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    };
    try {
      const up = await waitBoot();
      t(up, 'boot: el servidor levanta en ' + PORT);
      if (up) {
        const v = await (await fetch(BASE + '/api/version')).json();
        t(v.build === '20261105-v880', 'boot: /api/version v880', v.build);
        const idx = await (await fetch(BASE + '/')).text();
        t(idx.includes('/app.js?v=599'), 'boot: el index servido trae app.js?v=599');
        t(idx.includes('/styles.css?v=20261229'), 'boot: el index servido trae styles?v=20261229');
        const appSrv = await (await fetch(BASE + '/app.js?v=599')).text();
        t(appSrv.includes('pzBoostImpulsarMonto') && appSrv.includes('pz-boost-3d3-main'), 'boot: el bundle servido trae el código 3D-3H');
        const cssSrv = await (await fetch(BASE + '/styles.css?v=20261229')).text();
        t(cssSrv.includes('.pz-boost-3d3-thumb{width:96px;height:120px'), 'boot: el CSS servido trae el thumb 96×120');
      }
    } finally {
      try { child.kill('SIGTERM'); } catch (e) {}
    }
  }

  console.log('\ntest-lote-impulsar-3d3h-v880: ' + ok + ' ok, ' + bad + ' mal');
  console.log('md5 app.js: ' + md5(app));
  console.log('md5 styles.css: ' + md5(css));
  console.log('md5 server.js: ' + md5(srv));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
