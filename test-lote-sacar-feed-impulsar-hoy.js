// test-lote-sacar-feed-impulsar-hoy.js — LOTE SACAR-FEED-IMPULSAR-HOY
// (v846): la pestaña Feed sale (quedan Hoy y Chat), la sección «Tu
// semana recién arranca» se reemplaza por la sección Impulsar, el
// picker lista el feed entero (recientes de IG con ig_media_id real),
// el saludo «¡Buen día!» sale de Hoy y el encabezado es «Posty.» +
// «tu community manager» + punto verde para todas las cuentas.
// Además: chat solo por audio (sin teclado; la camarita queda en la
// barra de voz a la izquierda y el mic grande a la derecha), hora en
// cada mensaje, el último mensaje siempre abajo, y el botón fantasma
// «Pedir un cambio en el chat →» sale de Hoy.
// Node puro: asserts estáticos + VM + boot real por HTTP con DATA_DIR
// aislada (puerto 18971). Uso: node test-lote-sacar-feed-impulsar-hoy.js
// (desde la raíz del árbol).
// Pins v847 (re-pineado por el re-estampador de v847): BUILD 20261105-v847 ·
// app.js?v=579 · styles?v=20261225 (heredado de v846: styles.css no cambia
// en este lote). La firma fusionada es chatMsgHtml(role, text, ts, id).
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

(async () => {
  // ---------- 1. Estático: barra con 2 pestañas, sin Feed ----------
  const tabsSrc = sliceFn(app, 'function mzTabsHTML(tab) {', '/* (LOTE DOCK-MAS) */');
  t(tabsSrc.length > 0, '§1: mzTabsHTML presente');
  t(tabsSrc.includes("gzT('Hoy', 'Today')") && tabsSrc.includes("gzT('Chat', 'Chat')"), '§1: mzTabsHTML con Hoy y Chat');
  t(!tabsSrc.includes("'feed'") && !tabsSrc.includes('"feed"'), '§1: mzTabsHTML sin pestaña Feed');
  t(!app.includes("tabBtn('feed'"), '§1: bb-bar sin tabBtn Feed');
  t(app.includes("tabBtn('inicio'") && app.includes("tabBtn('chat'"), '§1: bb-bar con Hoy y Chat');
  t(!app.includes('data-tab="feed"'), '§1: drawer sin data-tab Feed');
  const mxSrc = sliceFn(app, 'function mxTabKey(tab) {', 'function mxModoActual(tab) {');
  t(mxSrc.length > 0 && !mxSrc.includes("'feed'"), '§1: mxTabKey sin feed');
  t(app.includes("else if (tab === 'feed') { location.hash = '#/app/inicio'; return; }"), '§1: routing #/app/feed redirige a Hoy');
  t(!app.includes('content = await feedView()'), '§1: routing ya no pinta feedView');
  t(!app.includes("if (tab === 'feed') bindFeed();"), '§1: bind ya no llama bindFeed');
  t(cnt(app, '#/app/feed') === 7, `§1: #/app/feed ×7 (redir + comentarios, era ×14; vino ${cnt(app, '#/app/feed')})`);
  t(app.includes('async function feedView()'), '§1: feedView sigue definida (la composición no se toca)');
  t(app.includes('homeGridCompose') && cnt(app, 'homeGridCompose') >= 14, '§1: homeGridCompose intacto (×14)');
  t(app.includes('function pzHoySetView(nombre) {') && app.includes("if (nombre === 'feed') { try { location.hash = '#/app/inicio'; }"), '§1: pzHoySetView(feed) va a Hoy');
  // «Ver en el feed» → Hoy con scroll + destacado.
  t(app.includes('HF_HOY_HIGHLIGHT = String(post.id)') && app.includes("location.hash = '#/app/inicio';"), '§1: verfeed pone el destacado de Hoy y va a #/app/inicio');
  t(app.includes('function hfHoyHighlightApply()'), '§1: hfHoyHighlightApply definida');
  t(app.includes("document.querySelector('#inicioView .hf-tile[data-post-id=\"' + id + '\"]')"), '§1: el destacado busca la tile en #inicioView');
  t(app.includes('hfHoyHighlightApply();'), '§1: bindInicio aplica el destacado');
  t(css.includes('#inicioView .hf-tile.pz-feed-flash'), '§1: CSS del destacado en #inicioView');
  t(!app.includes("if ((location.hash || '') === '#/app/feed')"), '§1: ningún handler compara con #/app/feed');

  // ---------- 2. Estático: el saludo «¡Buen día!» sale de Hoy ----------
  t(cnt(app, 'pzHoySaludoTxt') === 0, '§2: pzHoySaludoTxt ×0 (función borrada)');
  t(cnt(app, 'pz-hoy-saludo') === 0, '§2: pz-hoy-saludo ×0 en app.js');
  t(cnt(css, 'pz-hoy-saludo') === 0, '§2: pz-hoy-saludo ×0 en styles.css (regla muerta limpiada)');
  const speechSrc = sliceFn(app, 'function pzHoySpeechHTML(', 'function pzHoyConserjeHTML(');
  t(speechSrc.length > 0 && !speechSrc.includes('pzHoySaludoTxt') && !speechSrc.includes('pz-hoy-saludo'), '§2: la burbuja ya no saluda por hora');
  t(cnt(app, 'pzHoySemanaInsightHTML') === 0, '§2: pzHoySemanaInsightHTML ×0 (la reemplaza la sección Impulsar)');
  t(cnt(app, 'Tu semana recién arranca') === 2, `§2: «Tu semana recién arranca» ×2 (1 en pzHoySemanaMiniHTML muerta + 1 en comentario de pzHoyImpulsarHTML; vino ${cnt(app, 'Tu semana recién arranca')})`);
  t(cnt(app, 'pzHoySemanaMiniHTML') === 1, '§2: pzHoySemanaMiniHTML solo su definición (sin llamadores; su borrado es otro lote)');

  // ---------- 3. Estático: encabezado «Posty.» + punto verde ----------
  const headSrc = sliceFn(app, 'function pzShellHeadHTML(tab) {', 'function pzShellDatosHoy() {');
  t(headSrc.length > 0, '§3: pzShellHeadHTML presente');
  t(headSrc.includes('Posty<span class="pdot">.</span>'), '§3: título fijo «Posty.»');
  t(headSrc.includes('tu community manager') && headSrc.includes('your community manager'), '§3: subtítulo ES+EN');
  t(headSrc.includes('pz-shell-dot') && headSrc.includes('pz-shell-ava-wrap'), '§3: punto verde sobre el avatar');
  t(!headSrc.includes('BB.estado.negocio') && !headSrc.includes('PROFILE.business_name'), '§3: el encabezado ya no lee el nombre del negocio');
  t(!headSrc.includes('¡Hola!') && !headSrc.includes("'Hi!'"), '§3: sin fallback «¡Hola!» en el encabezado');
  t(cnt(app, 'pzSaludoEscribir') === 0, '§3: pzSaludoEscribir ×0 (máquina de escribir borrada)');
  t(cnt(app, 'pzShellSaludo') === 0, '§3: pzShellSaludo ×0');
  t(!css.includes('b.typing::after') && !css.includes('pzShellBlink'), '§3: CSS de la máquina de escribir limpiado');
  t(css.includes('.pz-shell-dot{'), '§3: regla .pz-shell-dot presente');
  t(css.includes('.pz-shell-dot') && css.includes('background:#22C55E') && css.includes('border:2px solid #fff'), '§3: punto verde #22C55E con aro blanco');
  t(css.includes('.pz-shell-who small'), '§3: regla del subtítulo presente');
  t(app.includes('function homeHeadHTML('), '§3: homeHeadHTML intacto (el nombre del negocio sigue en el perfil de la grilla)');

  // ---------- 4. Estático: sección Impulsar en Hoy ----------
  t(app.includes('function pzHoyImpulsarHTML(mejor, en)'), '§4: pzHoyImpulsarHTML definida');
  t(app.includes('function pzHoyImpulsarRec()'), '§4: pzHoyImpulsarRec definida');
  t(app.includes("api.get('/api/estrategia/mejor-posteo')"), '§4: inicioView pide el recomendado (mismo de la carta)');
  t(app.includes('pzHoyImpulsarHTML(mejorHoy, enHome)'), '§4: Hoy rinde la sección Impulsar');
  t(app.includes('PZ_HOY_MEJOR = mejorHoy'), '§4: el recomendado queda en PZ_HOY_MEJOR para el CTA');
  t(app.includes('Todavía no hay un posteo con resultados reales para recomendar'), '§4: sin recomendado, la sección lo dice con honestidad');
  t(app.includes('Elegir otro posteo') && app.includes('window.pzOpenBoostPick'), '§4: «Elegir otro posteo» abre la hoja de elegir');
  t(css.includes('.pz-hoy-impulsar'), '§4: CSS de la sección Impulsar presente');
  t(css.includes('.pz-hoy-impulsar-otro'), '§4: CSS del enlace «Elegir otro posteo» presente');

  // ---------- 5. Estático + unidad: picker con el feed entero ----------
  t(srv.includes('function igMediaParaPicker(db, uid)'), '§5: igMediaParaPicker definida');
  t(srv.includes('function adoptarRecienteIg(db, uid, igMediaId)'), '§5: adoptarRecienteIg definida');
  t(srv.includes('function igShortcodeDePermalink(url)'), '§5: igShortcodeDePermalink definida');
  t(srv.includes('igMediaParaPicker(db, uid)') && cnt(srv, 'igMediaParaPicker(db, uid)') >= 2, '§5: elegibles y buscar mezclan los medios de IG');
  t(srv.includes('igMediaIdReq'), '§5: /impulsar acepta igMediaId');
  t(srv.includes('adoptarRecienteIg(db, uid, igMediaIdReq)'), '§5: /impulsar adopta el reciente sin fila');
  const ins = require(path.join(__dirname, 'insights.js'));
  t(typeof ins.fetchUserMedia === 'function', '§5: fetchUserMedia exportada');
  const bil = require(path.join(__dirname, 'ads-billetera.js'));
  const solo = bil.elegiblesParaAds([
    { id: 570, image_path: '/media/a.jpg', caption: 'local con métricas', ig_media_id: '17840001', status: 'published', media_type: 'image', week_key: '2026-11-09', reach: 120, likes: 15, comments: 3, saved: 2 },
    { id: null, image_path: '/media/b.jpg', caption: 'café de la mañana', ig_media_id: '17849999', status: 'published', media_type: 'image', week_key: '2026-11-02', published_at: '2026-11-05T10:00:00Z', reach: 0, likes: 40, comments: 5, saved: 0, solo_ig: true },
    { id: null, image_path: '', caption: '', ig_media_id: '17848888', status: 'published', media_type: 'video', week_key: '2026-11-02', published_at: '2026-11-04T10:00:00Z', reach: 0, likes: 0, comments: 0, saved: 0, solo_ig: true },
  ], 570, new Set(), { incluirImpulsados: false, semanaActual: '2026-11-09' });
  t(solo.length === 3, `§5: el mapper pasa los 3 (local + 2 recientes; vino ${solo.length})`);
  t(solo[0].post_id === 570 && solo[0].recomendado === true, '§5: el recomendado local va primero');
  const rec = solo.find((e) => e.ig_media_id === '17849999');
  t(!!rec && rec.post_id === null && rec.solo_ig === true && rec.caption.includes('café'), '§5: el reciente sin fila sale con post_id null + solo_ig + caption de IG');
  const vid = solo.find((e) => e.ig_media_id === '17848888');
  t(!!vid && vid.viejo === true, '§5: el reciente de otra semana marca viejo por week_key');
  const sinCreds = await ins.fetchUserMedia({ prepare: () => ({ get: () => null }) }, 999);
  t(Array.isArray(sinCreds) && sinCreds.length === 0, '§5: sin IG conectado, fetchUserMedia → [] (fail-closed)');
  t(srv.includes("const BUILD_ID = '20261105-v847'"), '§5: server.js con BUILD v847 estampado (preparador)');

  // ---------- 6. VM: sección Impulsar, picker, burbuja, encabezado ----------
  const escFn = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ctx = {
    console, esc: escFn,
    gzT: (es, en) => (ctx.ME && ctx.ME.lang === 'en' ? en : es),
    pzIc: () => '[ic]',
    ME: { lang: 'es' },
    PZ_HOY_MEJOR: null,
    pzHoyHoraCorta: () => '19:00',
    BB: { estado: { negocio: 'Café Aroma' } },
    PROFILE: { business_name: 'Café Aroma' },
  };
  ctx.pzBoostOpenArg = null;
  ctx.pzBoostOpen = (p) => { ctx.pzBoostOpenArg = p; };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function pzBoostRecTexto(', 'function pzBoostDia('), ctx);
  vm.runInContext(sliceFn(app, 'function pzHoyImpulsarHTML(', 'function pzHoyImpulsarRec('), ctx);
  vm.runInContext(sliceFn(app, 'function pzHoyImpulsarRec(', 'function pzHoyPendientes('), ctx);
  vm.runInContext(sliceFn(app, 'function pzBoostNormPost(', 'function pzBoostNumeros('), ctx);
  vm.runInContext(sliceFn(app, 'function pzHoySpeechHTML(', 'function pzHoyConserjeHTML('), ctx);
  vm.runInContext(sliceFn(app, 'function pzShellHeadHTML(tab) {', 'function pzShellDatosHoy() {'), ctx);
  vm.runInContext(sliceFn(app, 'function mzTabsHTML(tab) {', '/* (LOTE DOCK-MAS) */'), ctx);
  const mejor570 = { post_id: 570, image_path: '/media/570.jpg', caption: 'En Posty, manejo tu Instagram como un amigo', ig_media_id: '17840070', reach: 120, likes: 15, comments: 3, saved: 2 };
  let sec = vm.runInContext('pzHoyImpulsarHTML(' + JSON.stringify(mejor570) + ", false)", ctx);
  t(sec.includes('Impulsar posteo') && sec.includes('Impulsar este posteo →'), '§6a: sección con título y CTA');
  t(sec.includes('En Posty, manejo tu Instagram como un amigo'), '§6a: sección con el caption del recomendado');
  t(sec.includes('El mejor de tu semana'), '§6a: sección con los números reales del recomendado');
  t(sec.includes('/media/570.jpg') && sec.includes('Elegir otro posteo'), '§6a: sección con foto y «Elegir otro posteo»');
  sec = vm.runInContext('pzHoyImpulsarHTML(null, false)', ctx);
  t(sec.includes('Todavía no hay un posteo con resultados reales') && sec.includes('Elegir otro posteo') && !sec.includes('Impulsar este posteo →'), '§6a: sin recomendado, mensaje honesto + elegir queda, sin CTA');
  sec = vm.runInContext('pzHoyImpulsarHTML(' + JSON.stringify({ post_id: 571, image_path: '', caption: '', reach: 0, likes: 0, comments: 0, saved: 0 }) + ", false)", ctx);
  t(sec.includes('Todavía no hay un posteo con resultados reales'), '§6a: recomendado sin interacción = sin recomendado');
  sec = vm.runInContext('pzHoyImpulsarHTML(' + JSON.stringify(mejor570) + ", true)", ctx);
  t(sec.includes('Boost a post') && sec.includes('Boost this post →') && sec.includes('Choose another post'), '§6a: espejo EN de la sección');
  // CTA: abre la hoja con el objeto entero del recomendado.
  vm.runInContext('PZ_HOY_MEJOR = ' + JSON.stringify(mejor570) + '; pzHoyImpulsarRec();', ctx);
  t(ctx.pzBoostOpenArg && ctx.pzBoostOpenArg.post_id === 570, '§6a: el CTA abre pzBoostOpen con el recomendado (570)');
  // Picker: claves por post_id o por ig_media_id.
  const kLocal = vm.runInContext("pzBoostKey(pzBoostNormPost({post_id:570, ig_media_id:'17840070', caption:'x'}))", ctx);
  const kIg1 = vm.runInContext("pzBoostKey(pzBoostNormPost({post_id:null, ig_media_id:'17849999', caption:'café', solo_ig:true}))", ctx);
  const kIg2 = vm.runInContext("pzBoostKey(pzBoostNormPost({post_id:null, ig_media_id:'17848888', caption:'video', solo_ig:true}))", ctx);
  t(kLocal === 'p570', `§6b: clave local p570 (vino ${kLocal})`);
  t(kIg1 === 'ig:17849999' && kIg2 === 'ig:17848888' && kIg1 !== kIg2, '§6b: cada reciente sin fila tiene su propia clave por ig_media_id');
  t(vm.runInContext("pzBoostNormPost({post_id:null, ig_media_id:'', caption:'x'})", ctx) === null, '§6b: sin id ni ig_media_id no hay nada que impulsar');
  t(vm.runInContext("pzBoostNormPost({post_id:570, ig_media_id:'17840070', caption:'x', likes:3}).solo_ig", ctx) === false, '§6b: el local nunca marca solo_ig');
  // Burbuja de Hoy sin saludo.
  let bub = vm.runInContext("pzHoySpeechHTML({hoyPost:{scheduled_at:'2026-11-09T19:00:00-05:00', status:'scheduled', approval:'approved'}, pendientes:0, haySemana:true, en:false, tz:'America/New_York', manual:false, needOK:0, schedSolo:0, insight:''})", ctx);
  t(bub.includes('Te armé el posteo de hoy') && bub.includes('19:00'), '§6c: la burbuja arranca con el estado del posteo de hoy');
  t(!bub.includes('¡Buen día!') && !bub.includes('¡Buenas tardes!') && !bub.includes('¡Buenas noches!') && !bub.includes('¡Hola!'), '§6c: la burbuja no saluda');
  // Encabezado: Posty. para todas las cuentas, incluso con negocio.
  let hd = vm.runInContext("pzShellHeadHTML('inicio')", ctx);
  t(hd.includes('Posty<span class="pdot">.</span>') && hd.includes('tu community manager'), '§6d: encabezado ES con Posty. + tu community manager');
  t(hd.includes('pz-shell-dot') && hd.includes('pz-shell-ava-wrap'), '§6d: encabezado con punto verde');
  t(!hd.includes('Café Aroma'), '§6d: el nombre del negocio NO sale en el encabezado aunque exista');
  ctx.ME.lang = 'en';
  hd = vm.runInContext("pzShellHeadHTML('inicio')", ctx);
  t(hd.includes('your community manager'), '§6d: encabezado EN con your community manager');
  t(vm.runInContext("pzShellHeadHTML('chat')", ctx) === '', '§6d: sin encabezado en Chat');
  // Barra: 2 pestañas.
  ctx.ME.lang = 'es';
  const tabs = vm.runInContext("mzTabsHTML('inicio')", ctx);
  t(tabs.includes('Hoy') && tabs.includes('Chat') && !tabs.includes('Feed') && !tabs.includes('data-tab="feed"'), '§6e: mzTabsHTML con Hoy y Chat, sin Feed');
  t(vm.runInContext("mzTabsHTML('chat')", ctx).includes('mz-tab on'), '§6e: la pestaña activa se marca');

  // ---------- 7. Boot aislado ----------
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) { booted = false; }
  if (!booted) {
    console.log('boot: express no resuelve en este árbol, sección omitida');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-sacar-feed-'));
    const PORT = 18971;
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
      t(await waitBoot(), '§7: boot levanta');
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      t(ver.build === '20261105-v847', `§7: /api/version v847 (vino ${ver.build})`);
      const appTxt = await (await fetch(`${BASE}/app.js?v=579`)).text();
      t(md5(appTxt) === md5(app), '§7: app.js?v=579 servido = árbol');
      t(!appTxt.includes('pzHoySaludoTxt') && !appTxt.includes('pzSaludoEscribir'), '§7: servido sin las funciones borradas');
      t(appTxt.includes('pzHoyImpulsarHTML') && appTxt.includes('hfHoyHighlightApply'), '§7: servido con la sección Impulsar y el destacado de Hoy');
      t(!appTxt.includes("tabBtn('feed'"), '§7: servido sin pestaña Feed en la barra');
      const cssTxt = await (await fetch(`${BASE}/styles.css?v=20261225`)).text();
      t(md5(cssTxt) === md5(css), '§7: styles.css?v=20261225 servido = árbol');
      t(cssTxt.includes('.pz-shell-dot') && cssTxt.includes('.pz-hoy-impulsar'), '§7: servido con el punto verde y la sección Impulsar');
      const rMejor = await fetch(`${BASE}/api/estrategia/mejor-posteo`);
      t(rMejor.status === 401, `§7: sin sesión, /api/estrategia/mejor-posteo → 401 (vino ${rMejor.status})`);
      const rElig = await fetch(`${BASE}/api/ads/billetera/elegibles`);
      t(rElig.status === 401, `§7: sin sesión, /api/ads/billetera/elegibles → 401 (vino ${rElig.status})`);
      const rBuscar = await fetch(`${BASE}/api/ads/billetera/buscar?q=cafe`);
      t(rBuscar.status === 401, `§7: sin sesión, /api/ads/billetera/buscar → 401 (vino ${rBuscar.status})`);
    } finally {
      try { srvProc.kill('SIGTERM'); } catch (e) {}
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    }
  }

  // ---------- 8. Chat solo por audio + hora + último abajo + mic a la derecha ----------
  // Sin teclado en el chat con sesión: la fila, el botón Escribir y el
  // Enviar dinámico murieron; el único #chatInput que queda es el que
  // inyecta la landing sin sesión.
  t(cnt(app, '#pzWriteToggle') === 0, '§8a: #pzWriteToggle ×0');
  t(cnt(app, 'pzWriteRow') === 1, `§8a: pzWriteRow ×1 (solo la inyección de la landing; vino ${cnt(app, 'pzWriteRow')})`);
  t(cnt(app, 'pzChatSendBtn') === 0, '§8a: #pzChatSendBtn ×0');
  t(cnt(app, 'function pzWriteToggleDelegar') === 0, '§8a: pzWriteToggleDelegar ×0');
  t(cnt(app, 'function pzTemaBarraInit') === 0, '§8a: pzTemaBarraInit ×0');
  t(cnt(app, 'function pzSubirPreviaEditarTexto') === 0, '§8a: pzSubirPreviaEditarTexto ×0');
  t(cnt(app, 'function pzSubirPreviaGuardarTexto') === 0, '§8a: pzSubirPreviaGuardarTexto ×0');
  t(cnt(app, 'function pzSftChatCambiarTexto') === 0, '§8a: pzSftChatCambiarTexto ×0');
  t(cnt(app, 'function pzSftChatGuardarTexto') === 0, '§8a: pzSftChatGuardarTexto ×0');
  t(cnt(app, 'function hfDeliverAskText') === 0, '§8a: hfDeliverAskText ×0');
  t(cnt(app, 'HF_ASK_TEXT_PENDING') === 0, '§8a: HF_ASK_TEXT_PENDING ×0');
  t(cnt(app, 'data-voz-escribir') === 0, '§8a: data-voz-escribir ×0');
  t(cnt(app, '#chatCaption') === 0 && cnt(app, '#chatHashtags') === 0 && cnt(app, 'chatEditTx') === 0, '§8a: editor de propuesta (#chatCaption/#chatHashtags/#chatEditTx) ×0');
  t(cnt(app, 'hf-ask-input') === 0 && cnt(app, 'hf-ask-form') === 0, '§8a: mini-chat sin input (hf-ask-input/hf-ask-form ×0)');
  t(cnt(app, 'class="pz-ritual-cambio" data-pc-act="edit-cap"') === 0, '§8a: botón «Editar texto» del ritual ×0');
  t(cnt(app, 'data-pc-act="edit-cap"') === 2, `§8a: edit-cap solo en las tarjetas de posteos (igmock-cap + pcard-cap; vino ${cnt(app, 'data-pc-act="edit-cap"')})`);
  t(cnt(css, 'hf-ask-input') === 0 && cnt(css, 'hf-ask-send') === 0 && cnt(css, 'pz-write-toggle') === 0, '§8a: CSS muerto del teclado limpiado');
  t(cnt(css, '#chatCaption') === 0 && cnt(css, '#chatHashtags') === 0, '§8a: CSS del editor de propuesta limpiado');
  // Camarita en la barra (izquierda) + mic a la derecha + hint de voz.
  t(app.indexOf('pz-cam-btn') > 0 && app.indexOf('pz-cam-btn') < app.indexOf('pz-voice-txt') && app.indexOf('pz-voice-txt') < app.indexOf('id="chatMicSend"'), '§8a: barra de voz en orden: camarita → texto → mic');
  t(app.includes('id="chatPhotoBtn"') && app.includes("picker.accept = 'image/*,video/*'"), '§8a: la camarita abre el picker con foto+video');
  t(app.includes('Todo se responde tocando o hablando.') && app.includes('Everything is answered by tapping or talking.'), '§8a: hint del compositor sin escribir (ES+EN)');
  t(app.includes('async function chatSend(textArg)'), '§8a: chatSend recibe el texto como argumento');
  t(cnt(app, "getElementById('chatInput')") === 4, `§8a: getElementById('chatInput') ×4 (todo landing sin sesión; vino ${cnt(app, "getElementById('chatInput')")})`);
  t(cnt(app, 'chat-input-row pz-write-row') === 1, '§8a: la landing inyecta su propio campo (único #chatInput de la app)');
  t(app.includes("send.onclick = () => { try { const li = document.getElementById('chatInput');"), '§8a: #pzLpSend manda el valor del campo');
  // Hora en cada mensaje + orden por ts.
  t(app.includes('function pzChatHoraFmt(ts)') && app.includes('function chatHoraHtml(ts)') && app.includes('function chatAppendMsg(box, html, ts)') && app.includes('function chatMsgHtml(role, text, ts, id)'), '§8a: pzChatHoraFmt + chatHoraHtml + chatAppendMsg + chatMsgHtml(ts, id) definidas');
  t(app.includes('.sort((a, b) => (a.ts - b.ts) || (a.id - b.id))'), '§8a: chatLoadHistory ordena por (ts, id)');
  t(app.includes('¿me lo repetís con un audio?'), '§8a: si la respuesta falla, Posty pide repetir por voz');
  t(app.includes('VOICE_BUBBLE_TS') && app.includes('function vozBubbleSending'), '§8a: burbuja de voz con ts (VOICE_BUBBLE_TS)');
  t(app.includes('CHAT_CAPTION_TOUCHED'), '§8a: CHAT_CAPTION_TOUCHED guarda el caption dictado/elegido sin editor');
  t(css.includes('.pz-cam-btn{') && css.includes('.chat-msg-hora{') && css.includes('.hf-ask-voice{'), '§8a: CSS de camarita + hora + botón de voz del mini-chat');
  const vozPromptSrc = sliceFn(app, 'function pzCambioVozPrompt(postId) {', 'function pzCambioVozPromptDeliver() {');
  t(vozPromptSrc.length > 0 && !vozPromptSrc.includes('data-voz-escribir') && vozPromptSrc.includes('data-voz-grabar'), '§8a: prompt de cambio por voz con solo «Grabar nota de voz»');
  // VM: hora, orden y mini-chat de voz.
  const ctx2 = {
    console, esc: escFn,
    pzIc: () => '[ic]',
    pcTz: () => 'America/New_York',
    ME: { lang: 'es' },
    chatStripCelebrate: (x) => x,
    FP_MARKER_RE: /$^/, LC_MARKER_RE: /$^/, FOTO_MARKER_RE: /$^/,
    chatStripFpMarker: (x) => x, chatStripLcMarker: (x) => x,
    linkifyEsc: escFn,
    HF_ASK_POSTS: {},
  };
  vm.createContext(ctx2);
  vm.runInContext(sliceFn(app, 'function pzChatHoraFmt(ts) {', 'function chatAppendMsg(box, html, ts) {'), ctx2);
  vm.runInContext(sliceFn(app, 'function chatAppendMsg(box, html, ts) {', '// HTML de un mensaje del chat'), ctx2);
  vm.runInContext(sliceFn(app, 'function chatMsgHtml(role, text, ts, id) {', '// Confirma o rechaza el logo candidato'), ctx2);
  vm.runInContext(sliceFn(app, 'function hfAskChangeBtnHTML(p) {', 'function hfAskChange(post) {'), ctx2);
  const ts19 = Date.parse('2026-11-09T19:00:00-05:00');
  t(vm.runInContext(`pzChatHoraFmt(${ts19})`, ctx2) === '19:00', '§8b: pzChatHoraFmt(19:00 EST) = 19:00');
  t(vm.runInContext('pzChatHoraFmt(0)', ctx2) === '' && vm.runInContext('pzChatHoraFmt(undefined)', ctx2) === '', '§8b: sin ts no hay hora (nunca se inventa)');
  let mUser = vm.runInContext(`chatMsgHtml('user', 'hola posty', ${ts19})`, ctx2);
  t(mUser.includes('chat-msg u') && mUser.includes(`data-ts="${ts19}"`) && mUser.includes('chat-msg-hora') && mUser.includes('19:00'), '§8b: mensaje del usuario con data-ts + hora 19:00');
  let mAi = vm.runInContext("chatMsgHtml('assistant', 'hola', undefined)", ctx2);
  t(mAi.includes('chat-msg ai') && !mAi.includes('chat-msg-hora'), '§8b: sin ts, la burbuja no muestra hora');
  // chatAppendMsg: el mensaje nuevo va antes del primer data-ts mayor.
  const fakeBox = (kids) => ({
    _kids: kids, _appended: null,
    querySelectorAll() { return this._kids; },
    insertAdjacentHTML(pos, html) { this._appended = { pos, html }; },
    get lastElementChild() { return { tag: 'last' }; },
  });
  const kid = (ts) => ({ dataset: { ts: String(ts) }, _before: null, insertAdjacentHTML(pos, html) { this._before = { pos, html }; } });
  let k1 = kid(1000), k2 = kid(2000);
  let fb = fakeBox([k1, k2]);
  ctx2._box = fb; ctx2._k1 = k1; ctx2._k2 = k2;
  vm.runInContext("chatAppendMsg(_box, '<div>m1500</div>', 1500)", ctx2);
  t(k2._before && k2._before.pos === 'beforebegin' && k2._before.html.includes('m1500') && fb._appended === null, '§8b: ts 1500 se inserta antes del mensaje de ts 2000');
  fb = fakeBox([k1, k2]); ctx2._box = fb;
  vm.runInContext("chatAppendMsg(_box, '<div>m3000</div>', 3000)", ctx2);
  t(fb._appended && fb._appended.pos === 'beforeend' && fb._appended.html.includes('m3000'), '§8b: ts 3000 (el más nuevo) va al final');
  // Mini-chat del detalle: botón de voz, sin input.
  let mini = vm.runInContext("hfAskChangeBtnHTML({id: 570, status: 'scheduled', image_path: '/media/570.jpg', caption: 'x'})", ctx2);
  t(mini.includes('hf-ask-voice') && mini.includes('Decímelo con tu voz') && !mini.includes('hf-ask-input') && !mini.includes('<form'), '§8b: mini-chat con botón de voz, sin form ni input');
  t(vm.runInContext("hfAskChangeBtnHTML({id: 570, status: 'published', image_path: '/media/570.jpg'})", ctx2) === '', '§8b: un publicado no tiene mini-chat');
  t(vm.runInContext("hfAskChangeBtnHTML({id: 570, status: 'draft'})", ctx2) === '', '§8b: sin imagen no hay mini-chat');

  console.log(`\ntest-lote-sacar-feed-impulsar-hoy: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
