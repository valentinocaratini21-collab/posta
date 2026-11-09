// test-lote-rediseño-rs4.js — LOTE REDISEÑO SIMPLE RS-4 (9/11, mock v7
// regla 7): Impulsar sin pestaña. Dos hojas (patrón .pubsheet):
// «¿Cuál querés impulsar?» (elegir posteo, el recomendado ya viene
// pre-seleccionado, los ya impulsados van deshabilitados) + «Impulsar
// posteo» ($50/7 días recomendado, «Cambiar monto» escondido $20/$50/$100,
// saldo + Cargar en el mismo lugar, confirmación, éxito «✓ Posteo
// impulsado»). La pestaña Ads SE QUEDA (la quita RS-5, el corte).
// Servidor: solo el opt-in ?incluir_impulsados=1 en /elegibles (sin el
// flag la respuesta es byte-idéntica a la de antes) + publicado_en/viejo.
// Stripe sigue sin configurar: Cargar usa el flujo existente y muestra el
// motivo real. Nada cobra nada en este lote.
// Node puro: asserts estáticos + unit del módulo + VM con DOM falso sobre
// la sección RS-4 de app.js + auditoría de funciones + boot real por HTTP
// con DATA_DIR aislada (sección 5, solo si express resuelve, como
// test-lote-ads-pantalla.js). Puerto 18754: NUNCA en paralelo con
// ads-pantalla.
// Uso: node test-lote-rediseño-rs4.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const abSrc = fs.readFileSync(path.join(__dirname, 'ads-billetera.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

(async () => {
  // ---------- 1. Censo (sin cambio) + pins del árbol RS-4 ----------
  t(srv.includes("const BUILD_ID = '20261105-v836'"), 'server: BUILD v825 (el re-estampador estampa el final)');
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
  t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
  t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
  t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
  t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
  t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
  t(app.includes("const CHUNK_V = '20261105-v793'"), 'CHUNK_V v793 (bump T&C)');
  t(md5(app) === '4ac21c0543bc34c5cb113ae4b62b9396', 'app.js md5 (RS-4 + T&C v836)');
  t(md5(css) === 'a6ef1f0f0bdd52079f0af7b7d781d690', 'styles.css md5 (RS-4)');
  t(md5(srv) === 'e17bfe2920f2098ff38543595539ae74', 'server.js md5 (RS-4 + T&C v836)');
  t(md5(abSrc) === '04c90ac71c59335d9785aaee959c1260', 'ads-billetera.js md5 (RS-4)');
  t(cnt(srv, "app.get('/api/ads") + cnt(srv, "app.post('/api/ads") === 14, 'server: 14 rutas /api/ads (sin ruta nueva)');
  t(cnt(app, 'pzBoost') === 158, 'app: pzBoost ×158 (sección RS-4 + alias)');
  t(cnt(app, 'LOTE REDISEÑO SIMPLE RS-4') === 1, 'app: marcador RS-4 ×1');
  t(cnt(srv, 'LOTE REDISEÑO SIMPLE RS-4') === 1, 'server: marcador RS-4 ×1');
  t(cnt(abSrc, 'LOTE REDISEÑO SIMPLE RS-4') === 1, 'ads-billetera: marcador RS-4 ×1');
  t(cnt(css, 'LOTE REDISEÑO SIMPLE RS-4') === 1, 'styles: marcador RS-4 ×1');
  t(cnt(css, 'pz-boost-') === 46, 'styles: clases pz-boost- ×46');
  t(cnt(srv, 'incluir_impulsados') === 2, 'server: ?incluir_impulsados=1 (flag + lectura)');
  t(cnt(abSrc, 'incluirImpulsados') === 2, 'ads-billetera: opts.incluirImpulsados ×2');
  t(cnt(abSrc, 'publicado_en') === 5, 'ads-billetera: publicado_en ×5');
  t(cnt(abSrc, 'viejo') === 5, 'ads-billetera: viejo ×5');
  t(cnt(app, 'data-pz-boost-post') === 3, 'app: contrato data-pz-boost-post ×3 (RS-2/RS-3/RS-5)');
  // CONTRATO RS-3 → RS-4 (spec v10): el botón del Feed (RS-3) llama a
  // window.pzOpenBoostPick(). Alias de pzBoostPickOpen (misma hoja ELEGIR).
  t(app.includes('function pzOpenBoostPick() { return pzBoostPickOpen(); }'), 'contrato RS-3: pzOpenBoostPick es alias de pzBoostPickOpen');
  t(app.includes('window.pzOpenBoostPick = pzOpenBoostPick'), 'contrato RS-3: window.pzOpenBoostPick expuesto explícitamente');
  // RE-BASE v829: +3 de RS-3 (comentario + typeof + llamada en pzFeedBoostPick).
  t(cnt(app, 'pzOpenBoostPick') === 10, 'contrato RS-3: pzOpenBoostPick ×10 (7 RS-4 + 3 RS-3)');
  t(cnt(app, 'window.pzOpenBoostPick') === 7, 'contrato RS-3: window.pzOpenBoostPick ×7 (4 RS-4 + 3 RS-3)');
  // La pestaña Ads SE QUEDA hasta el corte (RS-5): la sección RS-4 no
  // toca la barra de pestañas ni el router de Ads.
  t(app.includes("function adsView() {") && app.includes("function bindAds() {"), 'app: adsView/bindAds intactos (la pestaña Ads se queda)');
  t(!app.includes('pzBoost') || cnt(app, 'pzBoost') === 158, 'app: pzBoost solo vive en la sección RS-4');

  // ---------- 2. Módulo ads-billetera: elegibles con/sin incluir ----------
  const ab = require('./ads-billetera');
  const rowsM = [
    { id: 1, status: 'published', ig_media_id: 'ig1', media_type: 'image', image_path: '/m/1.jpg', caption: 'Café de especialidad', published_at: '2026-11-09 12:00:00', week_key: '2026-11-09', reach: 500, likes: 40, comments: 5, saved: 2 },
    { id: 2, status: 'published', ig_media_id: 'ig2', media_type: 'image', image_path: '/m/2.jpg', caption: 'Torta de chocolate', published_at: '2026-11-08 12:00:00', week_key: '2026-11-09', reach: 100, likes: 10, comments: 1, saved: 0 },
    { id: 3, status: 'published', ig_media_id: 'ig3', media_type: 'image', image_path: '/m/3.jpg', caption: 'Promo vieja', published_at: '2026-10-26 12:00:00', week_key: '2026-10-26', reach: 50, likes: 3, comments: 0, saved: 0 },
    { id: 4, status: 'draft', ig_media_id: 'ig4', media_type: 'image', image_path: '/m/4.jpg', caption: 'Borrador', published_at: '', week_key: '2026-11-09' },
    { id: 5, status: 'published', ig_media_id: '', media_type: 'image', image_path: '/m/5.jpg', caption: 'Sin IG', published_at: '', week_key: '2026-11-09' },
    { id: 6, status: 'published', ig_media_id: 'demo_x', media_type: 'image', image_path: '/m/6.jpg', caption: 'Demo', published_at: '', week_key: '2026-11-09' },
    { id: 7, status: 'published', ig_media_id: 'ig7', media_type: 'story', image_path: '/m/7.jpg', caption: 'Story', published_at: '', week_key: '2026-11-09' },
  ];
  // Por defecto (3 args): el impulsado NO se ofrece, sin campo ya_impulsado.
  const def = ab.elegiblesParaAds(rowsM, 1, new Set([2]));
  t(def.length === 2 && def[0].post_id === 1 && def[1].post_id === 3, 'módulo: por defecto ofrece 1 y 3 (el impulsado 2 fuera; draft/sin IG/demo/story fuera)');
  t(def[0].recomendado === true, 'módulo: el recomendado (1) va primero');
  t(def.every((e) => !('ya_impulsado' in e)), 'módulo: por defecto NO hay campo ya_impulsado (respuesta idéntica a antes)');
  t(def.every((e) => typeof e.publicado_en === 'string' && e.publicado_en.length > 0), 'módulo: publicado_en viaja siempre');
  t(def.every((e) => e.viejo === false), 'módulo: sin semanaActual no hay viejo (nunca inventado)');
  // Con incluirImpulsados: el impulsado VUELVE, marcado, y el viejo se marca.
  const inc = ab.elegiblesParaAds(rowsM, 1, new Set([2]), { incluirImpulsados: true, semanaActual: '2026-11-09' });
  t(inc.length === 3 && inc[0].post_id === 1, 'módulo: con incluir, ofrece 1, 2 y 3 (recomendado primero)');
  t(inc.find((e) => e.post_id === 2).ya_impulsado === true, 'módulo: el impulsado vuelve con ya_impulsado: true');
  t(inc.find((e) => e.post_id === 1).ya_impulsado === false, 'módulo: el no impulsado tiene ya_impulsado: false');
  t(inc.find((e) => e.post_id === 3).viejo === true, 'módulo: el de otra semana tiene viejo: true');
  t(inc.find((e) => e.post_id === 1).viejo === false && inc.find((e) => e.post_id === 2).viejo === false, 'módulo: los de esta semana tienen viejo: false');
  // El recomendado impulsado: visible, primero y marcado (la hoja lo
  // deshabilita y la selección salta al siguiente, no lo esconde).
  const incRec = ab.elegiblesParaAds(rowsM, 2, new Set([2]), { incluirImpulsados: true, semanaActual: '2026-11-09' });
  t(incRec[0].post_id === 2 && incRec[0].recomendado === true && incRec[0].ya_impulsado === true,
    'módulo: recomendado impulsado = primero + recomendado + ya_impulsado (visible, no escondido)');
  // Sin mejor: ningún recomendado, nunca uno inventado.
  const sinMejor = ab.elegiblesParaAds(rowsM, null, new Set());
  t(sinMejor.length === 3 && sinMejor.every((e) => e.recomendado === false), 'módulo: sin mejor no hay recomendado');
  t(ab.elegiblesParaAds([], null, new Set()).length === 0, 'módulo: sin posteos → vacío');
  // Server (estático): el endpoint lee el flag y pasa semanaActual.
  t(srv.includes("p.media_type, p.published_at,"), 'server: /elegibles suma p.published_at al SELECT');
  t(srv.includes("const incluirImp = String(req.query.incluir_impulsados || '') === '1';"), 'server: /elegibles lee ?incluir_impulsados=1');
  t(srv.includes("{ incluirImpulsados: incluirImp, semanaActual: wk }"), 'server: /elegibles pasa opts + semanaActual');
  t(srv.includes("app.get('/api/ads/billetera/elegibles'"), 'server: /elegibles sigue existiendo');
  t(srv.includes("ads_ready: !!gate.ready"), 'server: /elegibles ads_ready sigue honesto');
  // Los gates de GASTO no se tocan.
  t(srv.includes("if (!destacadoSemana.boostHabilitado(process.env)) return res.status(403).json({ ok: false, motivo: 'boost_deshabilitado' });"),
    'impulsar: flag apagado → 403 (gate intacto)');
  t(srv.includes("if (yaActivo) return res.status(409).json({ ok: false, motivo: 'ya_impulsado' });"),
    'impulsar: ya impulsado → 409 (gate intacto, la hoja lo deshabilita antes)');
  t(srv.includes("motivo: 'ads_no_configurado'"), 'impulsar: Meta sin configurar → ads_no_configurado (gate intacto)');

  // ---------- 3. VM: la sección RS-4 de app.js con DOM falso ----------
  const rs4Start = app.indexOf('/* ============================================================\n   LOTE REDISEÑO SIMPLE RS-4');
  const rs4End = app.indexOf('function bindAds() {', rs4Start);
  const rs4Src = (rs4Start !== -1 && rs4End > rs4Start) ? app.slice(rs4Start, rs4End) : '';
  t(rs4Src.length > 5000, 'VM: sección RS-4 extraída del bundle (' + rs4Src.length + ' caracteres)');
  t(rs4Src.includes('function pzBoostOpen(') && rs4Src.includes('function pzBoostPickOpen(') && rs4Src.includes('function pzFeedBoostPick('),
    'VM: entradas pzBoostOpen / pzBoostPickOpen / pzFeedBoostPick existen');
  t(rs4Src.includes("api.get('/api/ads/billetera/elegibles?incluir_impulsados=1')"), 'VM: la hoja de elegir pide elegibles con incluir_impulsados=1');
  t(rs4Src.includes("api.post('/api/ads/billetera/impulsar'"), 'VM: confirmar usa POST /impulsar existente');
  t(rs4Src.includes("api.post('/api/ads/billetera/cargar'"), 'VM: cargar usa POST /cargar existente');
  t(!rs4Src.includes('/api/ads/billetera/reservar') && !rs4Src.includes('stripe.com') && !rs4Src.includes('STRIPE_'), 'VM: sin ruta nueva ni llamada a Stripe en el front');
  t(rs4Src.includes('Stripe sigue sin configurar'), 'VM: la decisión Stripe (sin configurar, flujo existente) está documentada en la sección');
  t(rs4Src.includes('pzBoostMarcarImpulsado'), 'VM: pzBoostMarcarImpulsado existe (contrato RS-2/RS-3/RS-5)');

  // DOM falso mínimo POR CONTEXTO (cada makeCtx tiene su propio
  // registro: si se compartiera, un contexto creado después re-apuntaría
  // los ids y los renders de un contexto anterior escribirían en otro lado).
  // Los renders escriben innerHTML en los cuerpos pre-registrados;
  // ensureSheets crea los overlays; querySelectorAll resuelve los botones
  // [data-pz-boost-post="N"] registrados en ese contexto.
  const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ELEG_VM = [
    { post_id: 101, image_path: '/media/cafe1.jpg', caption: 'Café de especialidad recién tostado', reach: 500, likes: 40, comments: 5, saves: 2, recomendado: true, publicado_en: '2026-11-09 12:00:00', viejo: false },
    { post_id: 102, image_path: '/media/cafe2.jpg', caption: 'Torta de chocolate para el finde', reach: 100, likes: 10, comments: 1, saves: 0, recomendado: false, publicado_en: '2026-11-08 12:00:00', viejo: false },
    { post_id: 103, image_path: '/media/torta-vieja.jpg', caption: 'Promo vieja de la abuela', reach: 50, likes: 3, comments: 0, saves: 0, recomendado: false, publicado_en: '2026-10-26 12:00:00', viejo: true, ya_impulsado: true },
  ];
  const makeCtx = (lang, behavior) => {
    const toasts = [];
    const windowStub = {};
    const docById = {};
    const docButtons = [];
    class FakeEl {
      constructor(tag) {
        this.tagName = (tag || 'div').toUpperCase();
        this.id = '';
        this.className = '';
        this.style = {};
        this.innerHTML = '';
        this.textContent = '';
        this.disabled = false;
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
      console,
      window: windowStub,
      document: documentStub,
      api: {
        get: async (url) => {
          if (String(url).includes('/elegibles')) return { ok: true, ads_ready: behavior.adsReady, motivo: behavior.adsReady ? undefined : 'ads_not_configured', elegibles: behavior.elegibles };
          if (String(url).includes('/billetera')) return { ok: true, balance_cents: behavior.balance_cents, currency: 'USD', montos_usd: [20, 50, 100], boostHabilitado: behavior.boostHabilitado, ads_permiso: behavior.adsPermiso, conversion_pendiente: behavior.conversionPendiente || false };
          return { ok: false };
        },
        post: async (url) => {
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
      __toasts: toasts,
    });
    // Cuerpos pre-registrados (en el DOM real los crea ensureSheets al
    // poner el innerHTML del overlay; aquí se registran a mano).
    const pickBody = new FakeEl('div'); pickBody.id = 'pzBoostPickBody'; docById['pzBoostPickBody'] = pickBody;
    const pickGo = new FakeEl('button'); pickGo.id = 'pzBoostPickGo'; docById['pzBoostPickGo'] = pickGo;
    const boostBody = new FakeEl('div'); boostBody.id = 'pzBoostBody'; docById['pzBoostBody'] = boostBody;
    const msg = new FakeEl('p'); msg.id = 'pzBoostMsg'; docById['pzBoostMsg'] = msg;
    vm.runInContext(rs4Src, ctx);
    ctx.__pickBody = pickBody; ctx.__pickGo = pickGo; ctx.__boostBody = boostBody; ctx.__msg = msg;
    ctx.__FakeEl = FakeEl; ctx.__docButtons = docButtons; ctx.__window = windowStub;
    return ctx;
  };
  const stateOf = (ctx) => { vm.runInContext('__s = pzBoostState;', ctx); return ctx.__s; };

  // A. Textos con números reales (nunca inventados).
  const behA = { adsReady: false, boostHabilitado: false, adsPermiso: null, balance_cents: 0, elegibles: ELEG_VM };
  const ctxA = makeCtx('es', behA);
  vm.runInContext(`__r0 = pzBoostRecTexto(${JSON.stringify(ELEG_VM[0])});`, ctxA);
  t(ctxA.__r0 === 'El mejor de tu semana: 500 de alcance, 40 me gusta, 5 comentarios. Por eso Posty te recomienda este y no otro.', 'VM A: recomendado con sus números reales');
  vm.runInContext(`__r1 = pzBoostRecTexto(${JSON.stringify(ELEG_VM[1])});`, ctxA);
  t(ctxA.__r1 === 'Ya salió y viene sumando: 100 de alcance, 10 me gusta, 1 comentarios.', 'VM A: otro posteo con sus números');
  vm.runInContext(`__r2 = pzBoostRecTexto(${JSON.stringify(ELEG_VM[2])});`, ctxA);
  t(ctxA.__r2 === 'Un posteo de la semana pasada que todavía puede rendir: 50 de alcance, 3 me gusta en su momento. Impulsarlo lo vuelve a mostrar por 7 días.', 'VM A: viejo con sus números y sin prometer');
  vm.runInContext(`__r3 = pzBoostRecTexto({ reach: 0, likes: 0, comments: 0 });`, ctxA);
  t(ctxA.__r3 === 'Ya está publicado y se puede impulsar por 7 días.', 'VM A: sin métricas, sin números inventados');
  vm.runInContext(`__n0 = pzBoostNumeros(${JSON.stringify(ELEG_VM[0])});`, ctxA);
  t(ctxA.__n0 === '500 de alcance · 40 me gusta · 5 comentarios', 'VM A: números de la fila (alcance · me gusta · comentarios)');
  vm.runInContext(`__n1 = pzBoostNumeros({ reach: 0, likes: 0, comments: 0 });`, ctxA);
  t(ctxA.__n1 === 'Publicado', 'VM A: sin métricas, la fila dice «Publicado»');
  vm.runInContext(`__d0 = pzBoostDia('2026-11-09 12:00:00');`, ctxA);
  t(ctxA.__d0 === 'Lunes', 'VM A: día del posteo (lunes, en la zona del cliente)');
  vm.runInContext(`__d1 = pzBoostDia('2026-11-08 12:00:00');`, ctxA);
  t(ctxA.__d1 === 'Domingo', 'VM A: día del posteo (domingo)');
  vm.runInContext(`__d2 = pzBoostDia('');`, ctxA);
  t(ctxA.__d2 === '', 'VM A: sin fecha no hay día');
  vm.runInContext(`__t0 = pzBoostTitulo(${JSON.stringify(ELEG_VM[0])});`, ctxA);
  t(ctxA.__t0 === 'Lunes · Café de especialidad recién tostado', 'VM A: título = día + caption');

  // B. Hoja de elegir: recomendado pre-seleccionado, impulsado deshabilitado.
  await vm.runInContext('pzBoostPickOpen()', ctxA);
  const pickHTML = ctxA.__pickBody.innerHTML;
  t(pickHTML.includes('RECOMENDADO'), 'VM B: insignia RECOMENDADO en el posteo recomendado');
  t(pickHTML.includes('Café de especialidad recién tostado') && pickHTML.includes('Torta de chocolate para el finde') && pickHTML.includes('Promo vieja de la abuela'),
    'VM B: la lista trae los 3 posteos con caption real');
  t(pickHTML.includes('/media/cafe1.jpg') && pickHTML.includes('/media/torta-vieja.jpg'), 'VM B: miniaturas reales por posteo');
  t((pickHTML.match(/disabled/g) || []).length === 1, 'VM B: solo el ya impulsado va deshabilitado (1× disabled)');
  t(pickHTML.includes('pz-boost-opt on'), 'VM B: el recomendado viene pre-seleccionado (clase on)');
  t(ctxA.__pickGo.disabled === false, 'VM B: «Impulsar este posteo →» habilitado con selección');
  t(stateOf(ctxA).selId === 101, 'VM B: la pre-selección es el recomendado (101)');
  // Elegir otro: la selección se mueve; el impulsado no se puede elegir.
  vm.runInContext('pzBoostElegirPick(102, null);', ctxA);
  t(stateOf(ctxA).selId === 102, 'VM B: elegir el 102 mueve la selección');
  t(ctxA.__pickBody.innerHTML.includes('Torta de chocolate para el finde'), 'VM B: la lista sigue tras elegir');
  vm.runInContext('pzBoostElegirPick(103, null);', ctxA);
  t(stateOf(ctxA).selId === 102, 'VM B: elegir el impulsado (103) es un no-op');
  // Recomendado impulsado: la selección salta al primer no impulsado.
  const behB = { adsReady: false, boostHabilitado: false, adsPermiso: null, balance_cents: 0, elegibles: ELEG_VM.map((e) => (e.post_id === 101 ? { ...e, ya_impulsado: true } : e)) };
  const ctxB = makeCtx('es', behB);
  await vm.runInContext('pzBoostPickOpen()', ctxB);
  t(stateOf(ctxB).selId === 102, 'VM B2: recomendado impulsado → la selección salta al primer no impulsado (102)');
  t((ctxB.__pickBody.innerHTML.match(/disabled/g) || []).length === 2, 'VM B2: dos deshabilitados (101 recomendado impulsado + 103)');
  // Sin elegibles: nota honesta y botón deshabilitado.
  const behC = { adsReady: false, boostHabilitado: false, adsPermiso: null, balance_cents: 0, elegibles: [] };
  const ctxC = makeCtx('es', behC);
  await vm.runInContext('pzBoostPickOpen()', ctxC);
  t(ctxC.__pickBody.innerHTML.includes('Todavía no tenés posteos publicados para impulsar.'), 'VM C: sin posteos, nota honesta');
  t(ctxC.__pickGo.disabled === true, 'VM C: sin selección, el botón de confirmar va deshabilitado');

  // D. Hoja Impulsar con gate cerrado (Meta sin configurar, saldo $0):
  // hero $50, montos escondidos, saldo real, aviso, Cargar, confirmar deshabilitado.
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxA);
  const boostHTML = ctxA.__boostBody.innerHTML;
  t(boostHTML.includes('Impulsar posteo'), 'VM D: título de la hoja');
  t(boostHTML.includes('Café de especialidad recién tostado'), 'VM D: el posteo elegido en la hoja');
  t(boostHTML.includes('$50') && boostHTML.includes('por 7 días'), 'VM D: hero $50 por 7 días');
  t(boostHTML.includes('Te recomiendo este monto para este posteo. Confirmalo con un toque.'), 'VM D: texto de recomendación del monto');
  t(boostHTML.includes('Cambiar monto'), 'VM D: «Cambiar monto» presente');
  t(boostHTML.includes('id="pzBoostAmts" style="display:none"'), 'VM D: el selector de montos arranca ESCONDIDO');
  t(boostHTML.includes('Tu saldo') && boostHTML.includes('$0'), 'VM D: saldo real $0');
  t(!boostHTML.includes('Te faltan $'), 'VM D: con el gate cerrado manda la nota del gate, no la de saldo');
  t(boostHTML.includes('Cargar $50 ahora'), 'VM D: botón Cargar $50 ahora');
  t(boostHTML.includes('Impulsar por $50 · 7 días'), 'VM D: botón confirmar con monto y días');
  t(boostHTML.includes('La pauta todavía no está configurada para tu cuenta.'), 'VM D: nota honesta (Meta sin configurar)');
  t(boostHTML.includes('disabled'), 'VM D: confirmar deshabilitado con el gate cerrado');
  // Cambiar monto: el selector se abre y el hero/Cargar/Confirmar siguen el monto.
  vm.runInContext('pzBoostToggleMontos();', ctxA);
  const boostHTML2 = ctxA.__boostBody.innerHTML;
  t(boostHTML2.includes('id="pzBoostAmts" style="display:grid"'), 'VM D: al tocar «Cambiar monto» el selector se abre');
  t(boostHTML2.includes('class="pz-boost-amt on"') && boostHTML2.includes('>$50<'), 'VM D: $50 marcado como elegido');
  vm.runInContext('pzBoostElegirMonto(20);', ctxA);
  const boostHTML3 = ctxA.__boostBody.innerHTML;
  t(boostHTML3.includes('>$20<') && boostHTML3.includes('Cargar $20 ahora') && boostHTML3.includes('Impulsar por $20 · 7 días'), 'VM D: $20 actualiza hero, Cargar y Confirmar');
  t(boostHTML3.includes('La pauta todavía no está configurada'), 'VM D: con el gate cerrado la nota sigue siendo la del gate al cambiar el monto');
  vm.runInContext('pzBoostElegirMonto(100);', ctxA);
  t(ctxA.__boostBody.innerHTML.includes('Impulsar por $100 · 7 días'), 'VM D: $100 actualiza Confirmar');
  vm.runInContext('pzBoostElegirMonto(30);', ctxA);
  t(ctxA.__boostBody.innerHTML.includes('Impulsar por $100 · 7 días'), 'VM D: monto inválido (30) no cambia nada');
  vm.runInContext('pzBoostElegirMonto(50);', ctxA);

  // E. Gate abierto con saldo: confirmar habilitado y éxito.
  const behE = { adsReady: true, boostHabilitado: true, adsPermiso: true, balance_cents: 5000, elegibles: ELEG_VM, postImpulsar: { ok: true, balance_cents: 0 } };
  const ctxE = makeCtx('es', behE);
  const fakeBtn = new ctxE.__FakeEl('button');
  fakeBtn._pzBoostPost = '101';
  fakeBtn.textContent = 'Impulsar';
  ctxE.__docButtons.push(fakeBtn);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxE);
  const boostHTMLE = ctxE.__boostBody.innerHTML;
  t(boostHTMLE.includes('✓ Alcanza para este impulso.'), 'VM E: con saldo, la hoja dice que alcanza');
  t(!boostHTMLE.includes('disabled'), 'VM E: confirmar HABILITADO con gate abierto y saldo');
  await vm.runInContext('pzBoostConfirmar(null);', ctxE);
  const exitoHTML = ctxE.__boostBody.innerHTML;
  t(exitoHTML.includes('Posteo impulsado'), 'VM E: éxito «Posteo impulsado»');
  t(exitoHTML.includes('por 7 días, desde hoy. Posty te avisa cómo viene.'), 'VM E: éxito con duración y aviso');
  t(fakeBtn.textContent === 'Impulsado ✓' && fakeBtn.disabled === true, 'VM E: el botón [data-pz-boost-post="101"] pasa a «Impulsado ✓» deshabilitado');
  t(ctxE.__toasts.some((m) => m.includes('Posteo impulsado por 7 días')), 'VM E: toast de éxito');
  t((ctxE.__pickBody.innerHTML.match(/disabled/g) || []).length === 2, 'VM E: la hoja de elegir repinta el 101 como deshabilitado');

  // F. Confirmar sin saldo: motivo real, sin éxito, sin gasto.
  const behF = { adsReady: true, boostHabilitado: true, adsPermiso: true, balance_cents: 0, elegibles: ELEG_VM, postImpulsarThrow: { ok: false, motivo: 'saldo_insuficiente' } };
  const ctxF = makeCtx('es', behF);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxF);
  t(ctxF.__boostBody.innerHTML.includes('Te faltan $50'), 'VM F: con gate abierto y saldo $0, el aviso es lo que falta ($50)');
  t(ctxF.__boostBody.innerHTML.includes('disabled'), 'VM F: confirmar deshabilitado sin saldo (gate abierto)');
  vm.runInContext('pzBoostElegirMonto(20);', ctxF);
  t(ctxF.__boostBody.innerHTML.includes('Te faltan $20'), 'VM F: el aviso sigue el monto nuevo ($20)');
  vm.runInContext('pzBoostElegirMonto(50);', ctxF);
  await vm.runInContext('pzBoostConfirmar(null);', ctxF);
  t(ctxF.__msg.textContent.includes('No te alcanza el saldo de la billetera para $50'), 'VM F: error de saldo con motivo real');
  t(!ctxF.__boostBody.innerHTML.includes('Posteo impulsado'), 'VM F: sin éxito cuando el servidor rechaza');

  // G. Cargar sin Stripe: motivo real, sin éxito.
  const behG = { adsReady: false, boostHabilitado: false, adsPermiso: null, balance_cents: 0, elegibles: ELEG_VM, postCargarThrow: { ok: false, motivo: 'stripe_no_configurado' } };
  const ctxG = makeCtx('es', behG);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxG);
  await vm.runInContext('pzBoostCargar(null);', ctxG);
  t(ctxG.__msg.textContent.includes('La carga todavía no está disponible en tu cuenta.'), 'VM G: Cargar sin Stripe muestra el motivo real');

  // H. Posteo ya impulsado: la hoja muestra el estado, no el formulario.
  const ctxH = makeCtx('es', behA);
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[2])})`, ctxH);
  t(ctxH.__boostBody.innerHTML.includes('Este posteo ya está impulsado'), 'VM H: posteo ya impulsado → estado, no formulario');
  t(!ctxH.__boostBody.innerHTML.includes('Impulsar por $50'), 'VM H: sin botón de confirmar para el ya impulsado');
  // I. Abrir por id (detalle del día / chat): carga y abre con ese posteo.
  const ctxI = makeCtx('es', behA);
  await vm.runInContext('pzBoostOpenById(102);', ctxI);
  t(ctxI.__boostBody.innerHTML.includes('Torta de chocolate para el finde'), 'VM I: pzBoostOpenById(102) abre la hoja con ese posteo');
  // J. EN espejado 1:1.
  const ctxJ = makeCtx('en', behA);
  await vm.runInContext('pzBoostPickOpen()', ctxJ);
  t(ctxJ.__pickBody.innerHTML.includes('RECOMENDADO'), 'VM J: la insignia RECOMENDADO no se traduce (es marca, no texto)');
  await vm.runInContext(`pzBoostOpen(${JSON.stringify(ELEG_VM[0])})`, ctxJ);
  t(ctxJ.__boostBody.innerHTML.includes('for 7 days') && ctxJ.__boostBody.innerHTML.includes('Change amount') && ctxJ.__boostBody.innerHTML.includes('Your balance'),
    'VM J: EN espejado (hero, Cambiar monto, saldo)');
  t(!ctxJ.__boostBody.innerHTML.includes('Te recomiendo este monto'), 'VM J: EN sin textos ES');

  // K. Contrato RS-3 → RS-4: window.pzOpenBoostPick abre la hoja ELEGIR
  // con el recomendado ya pre-seleccionado (es lo que llama el botón del
  // Feed de RS-3; si no existiera, el botón solo mostraría un toast).
  const ctxK = makeCtx('es', behA);
  t(typeof ctxK.__window.pzOpenBoostPick === 'function', 'VM K: window.pzOpenBoostPick es una función (expuesta al cargar la sección)');
  await vm.runInContext('window.pzOpenBoostPick()', ctxK);
  t(ctxK.__pickBody.innerHTML.includes('RECOMENDADO'), 'VM K: window.pzOpenBoostPick() abre la hoja ELEGIR (insignia RECOMENDADO)');
  t(stateOf(ctxK).selId === 101, 'VM K: la hoja ELEGIR abierta desde el Feed trae el recomendado pre-seleccionado (101)');
  t(ctxK.__pickBody.innerHTML.includes('Café de especialidad recién tostado'), 'VM K: la hoja ELEGIR muestra los posteos');

  // ---------- 4. Auditoría de funciones (gate M69.1) ----------
  // Cada función llamada desde tarjetas/menús (onclick de las hojas) y
  // cada entrada que RS-2/RS-3/RS-5 llaman por nombre tiene que existir
  // definida en el bundle servido.
  const called = new Set([...rs4Src.matchAll(/onclick="[^"]*?(pzBoost[A-Za-z0-9]+|pzFeedBoostPick)\(/g)].map((m) => m[1]));
  ['pzFeedBoostPick', 'pzBoostPickOpen', 'pzBoostOpen', 'pzBoostOpenById', 'pzBoostMarcarImpulsado', 'pzOpenBoostPick'].forEach((f) => called.add(f));
  const defined = new Set([...rs4Src.matchAll(/function (pzBoost[A-Za-z0-9]+|pzFeedBoostPick|pzOpenBoostPick)\s*\(/g)].map((m) => m[1]));
  const faltan = [...called].filter((f) => !defined.has(f));
  t(faltan.length === 0, 'auditoría: funciones llamadas existen definidas (' + [...called].sort().join(', ') + ')' + (faltan.length ? ' — FALTAN: ' + faltan.join(', ') : ''));
  t(defined.size >= 20, 'auditoría: funciones RS-4 definidas: ' + defined.size);
  console.log(`funciones auditadas: ${called.size - faltan.length}/${called.size}`);
  for (const g of ['api', 'esc', 'gzT', 'toast', 'pcParseDate', 'pcTz']) {
    t(new RegExp('(function|const|let|var)\\s+' + g + '\\b').test(app), 'auditoría: global ' + g + ' existe en app.js');
  }
  // Los onclick de las hojas solo llaman a funciones RS-4 (nada fuera).
  const onclickFns = new Set([...rs4Src.matchAll(/onclick="([a-zA-Z_][a-zA-Z0-9_]*)\(/g)].map((m) => m[1]));
  t([...onclickFns].every((f) => f.startsWith('pzBoost') || f === 'pzFeedBoostPick'), 'auditoría: los onclick de las hojas solo llaman a funciones RS-4 (' + [...onclickFns].sort().join(', ') + ')');

  // ---------- 5. Boot real por HTTP (solo si express resuelve) ----------
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) { booted = false; }
  if (!booted) {
    console.log('boot: express no resuelve en este árbol, sección omitida (como test-lote-ads-pantalla.js)');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-rs4-'));
    const PORT = 18754;
    const BASE = `http://127.0.0.1:${PORT}`;
    const waitBoot = async (tries = 60) => {
      for (let i = 0; i < tries; i++) {
        try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    };
    const api = async (cookie, method, p, body) => {
      const rr = await fetch(BASE + p, {
        method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await rr.json(); } catch (e) {}
      return { status: rr.status, data };
    };
    const srvProc = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-rs4', OPENAI_API_KEY: '', DESTACADO_BOOST_ENABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvLog = '';
    srvProc.stdout.on('data', (d) => { srvLog += d; });
    srvProc.stderr.on('data', (d) => { srvLog += d; });
    try {
      t(await waitBoot(), 'boot: server levanta');
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      t(ver.build === '20261105-v836', `boot: /api/version 20261105-v825 (vino ${ver.build})`);
      const s1 = await api('', 'GET', '/api/ads/billetera/elegibles');
      t(s1.status === 401, 'boot: sin sesión, elegibles → 401');
      // Registro + sesión.
      const email = 'rs4-test@example.com';
      const rr = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'test1234', business_name: 'Café Aroma Test' }),
      });
      const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
      const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
      t(rr.status === 200 || rr.status === 201, `boot: registro → ${rr.status}`);
      t(cookie.length > 0, 'boot: registro deja sesión en cookie');
      // Seed directo en la DB del DATA_DIR aislado (mismo patrón que
      // test-lote-ads-pantalla.js): 5 recientes + 1 viejo + 1 sin IG +
      // 1 borrador + métricas para el mejor + pauta activa en el 2º.
      const seedSrc = `
        const db = require('./db').db || require('./db');
        const u = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.SEED_EMAIL);
        if (!u) { console.error('seed: sin usuario'); process.exit(1); }
        const uid = u.id;
        const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 19).replace('T', ' ');
        const baToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const mondayKeyOf = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d, 12)); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); };
        const wk = mondayKeyOf(baToday);
        const ins = db.prepare('INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, published_at, ig_media_id, week_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const recientes = [];
        for (let n = 1; n <= 5; n++) {
          const r = ins.run(uid, '/media/cafe' + n + '.jpg', 'Café de especialidad ' + n, '', daysAgo(n), 'published', 'image', daysAgo(n), 'ig_' + n, wk);
          recientes.push(Number(r.lastInsertRowid));
        }
        const old = ins.run(uid, '/media/torta-vieja.jpg', 'Torta vieja de la abuela', '', daysAgo(90), 'published', 'image', daysAgo(90), 'ig_old', '2020-01-06');
        ins.run(uid, '/media/sin-ig.jpg', 'Posteo sin IG media id', '', daysAgo(2), 'published', 'image', daysAgo(2), '', wk);
        ins.run(uid, '/media/borrador.jpg', 'Borrador no elegible', '', daysAgo(1), 'draft', 'image', null, 'ig_draft', wk);
        db.prepare('INSERT INTO post_metrics (post_id, reach, likes, comments, saved) VALUES (?, 500, 40, 5, 2)').run(recientes[0]);
        db.prepare("INSERT INTO ad_boosts (user_id, post_id, ig_media_id, budget_cents, fee_cents, spend_cents, currency, status, meta_campaign_id, meta_adset_id, meta_ad_id, objective, duration_days) VALUES (?, ?, 'ig_2', 5000, 0, 0, 'USD', 'active', '', '', '', 'engagement', 7)").run(uid, recientes[1]);
        console.log('SEED ' + JSON.stringify({ uid, recientes, old: Number(old.lastInsertRowid), wk, baToday }));
      `;
      const seedOut = await new Promise((resolve, reject) => {
        execFile('node', ['-e', seedSrc], { cwd: __dirname, env: { ...process.env, DATA_DIR: TMP, SEED_EMAIL: email } },
          (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
      });
      const seedLine = (seedOut.split('\n').find((l) => l.startsWith('SEED ')) || '').slice(5);
      let seed = null;
      try { seed = JSON.parse(seedLine); } catch (e) { seed = null; }
      t(!!seed && seed.recientes && seed.recientes.length === 5, 'boot: seed de 5 recientes + viejo + métricas + pauta activa');
      if (seed) {
        // /elegibles por defecto: 5 (el impulsado fuera, el viejo dentro),
        // sin campo ya_impulsado, recomendado primero, publicado_en y viejo.
        const elig = await api(cookie, 'GET', '/api/ads/billetera/elegibles');
        t(elig.status === 200 && elig.data && elig.data.ok === true, 'boot: elegibles → 200 ok');
        const rows = (elig.data && elig.data.elegibles) || [];
        t(rows.length === 5, `boot: elegibles por defecto trae 5 (vino ${rows.length}, impulsado fuera)`);
        t(rows.every((r) => !('ya_impulsado' in r)), 'boot: por defecto NO hay campo ya_impulsado');
        t(rows.every((r) => typeof r.publicado_en === 'string' && r.publicado_en.length > 0), 'boot: todos traen publicado_en');
        t(rows[0].post_id === seed.recientes[0] && rows[0].recomendado === true, 'boot: el mejor de la semana (métricas) es el recomendado y va primero');
        const viejoRow = rows.find((r) => r.post_id === seed.old);
        t(!!viejoRow && viejoRow.viejo === true, 'boot: el viejo de 90 días tiene viejo: true');
        t(rows.filter((r) => r.post_id !== seed.old).every((r) => r.viejo === false), 'boot: los recientes tienen viejo: false');
        t(elig.data.ads_ready === false, 'boot: elegibles con Meta sin conectar → ads_ready false (honesto)');
        t(elig.data.motivo === 'ads_not_configured', `boot: elegibles motivo ads_not_configured (vino ${elig.data.motivo})`);
        // ?incluir_impulsados=1: 6, el impulsado vuelve marcado.
        const eligInc = await api(cookie, 'GET', '/api/ads/billetera/elegibles?incluir_impulsados=1');
        t(eligInc.status === 200 && eligInc.data && eligInc.data.ok === true, 'boot: elegibles?incluir_impulsados=1 → 200 ok');
        const rowsInc = (eligInc.data && eligInc.data.elegibles) || [];
        t(rowsInc.length === 6, `boot: con incluir trae 6 (vino ${rowsInc.length})`);
        const impRow = rowsInc.find((r) => r.post_id === seed.recientes[1]);
        t(!!impRow && impRow.ya_impulsado === true, 'boot: el impulsado vuelve con ya_impulsado: true');
        t(rowsInc.filter((r) => r.post_id !== seed.recientes[1]).every((r) => r.ya_impulsado === false), 'boot: los demás tienen ya_impulsado: false');
        t(rowsInc[0].post_id === seed.recientes[0] && rowsInc[0].recomendado === true, 'boot: con incluir, el recomendado sigue primero');
        const elig0 = await api(cookie, 'GET', '/api/ads/billetera/elegibles?incluir_impulsados=0');
        t(elig0.status === 200 && ((elig0.data && elig0.data.elegibles) || []).length === 5, 'boot: incluir_impulsados=0 es igual que por defecto (5)');
        // Billetera: saldo 0.
        const bil = await api(cookie, 'GET', '/api/ads/billetera');
        t(bil.status === 200 && bil.data && bil.data.ok === true && bil.data.balance_cents === 0, 'boot: billetera $0 en cuenta nueva');
        // Impulsar el ya impulsado (flag ON) → 409 ya_impulsado, sin gasto.
        const impYa = await api(cookie, 'POST', '/api/ads/billetera/impulsar', { posteoId: seed.recientes[1], montoUSD: 50 });
        t(impYa.status === 409 && impYa.data && impYa.data.motivo === 'ya_impulsado', `boot: impulsar el ya impulsado → 409 ya_impulsado (vino ${impYa.status} ${impYa.data && impYa.data.motivo})`);
        // Impulsar uno elegible con Meta sin configurar → 503, sin gasto.
        const impMeta = await api(cookie, 'POST', '/api/ads/billetera/impulsar', { posteoId: seed.recientes[0], montoUSD: 50 });
        t(impMeta.status === 503 && impMeta.data && impMeta.data.motivo === 'ads_no_configurado', `boot: impulsar sin Meta → 503 ads_no_configurado (vino ${impMeta.status} ${impMeta.data && impMeta.data.motivo})`);
        // Cargar sin Stripe → 409 con motivo real (nada se cobra).
        const car = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 50 });
        t(car.status === 409 && car.data && typeof car.data.motivo === 'string' && car.data.motivo.length > 0, `boot: cargar sin Stripe → 409 con motivo real (vino ${car.status} ${car.data && car.data.motivo})`);
        const bil2 = await api(cookie, 'GET', '/api/ads/billetera');
        t(bil2.status === 200 && bil2.data && bil2.data.balance_cents === 0, 'boot: tras los intentos, la billetera sigue en $0 (nada se gastó)');
      }
    } catch (e) {
      t(false, 'boot: excepción ' + (e && e.message));
      if (srvLog) console.log('--- server log ---\n' + srvLog.slice(-3000));
    } finally {
      try { srvProc.kill(); } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    }
  }

  console.log(`\ntest-lote-rediseño-rs4: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
