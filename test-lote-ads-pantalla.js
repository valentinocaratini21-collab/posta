// test-lote-ads-pantalla.js — LOTE ADS-PANTALLA (6/11, mock v1 aprobado
// por Valentino + regla «cualquier posteo del feed»).
// La pantalla Ads ya no muestra una caja muerta cuando Meta no está
// conectado: billetera siempre visible, posteo de hoy cuando no hay mejor
// de la semana, picker con los 5 recientes + buscador por caption sobre
// TODOS los publicados (sin límite de edad), y en estado bloqueado el
// botón abre el chat con Posty (posteo + monto ya escritos) en vez de
// ofrecer un gasto que el servidor rechazaría. La compuerta bloquea
// GASTAR, no mostrar: /impulsar sigue con todos sus gates intactos.
// Node puro: asserts estáticos + VM con DOM falso sobre el chunk, +
// boot real por HTTP con DATA_DIR aislada (sección 5, solo si express
// resuelve, como test-lote-prueba-chat.js).
// Uso: node test-lote-ads-pantalla.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
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
  // ---------- 1. Censo (sin cambio) + base v756, re-base v759 ----------
  // (LOTE ADS-DIRECTO v759: pins del preparador — BUILD v759, CHUNK_V v759,
  // 14 rutas /api/ads (12 + feed + auto); el picker usa anaCortarCaption.)
  t(srv.includes("const BUILD_ID = '20261105-v826'"), 'server: BUILD v822 (re-pin lote A v822)');  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
  t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
  t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
  t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
  t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
  t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
  t(app.includes("const CHUNK_V = '20261105-v792'"), 'CHUNK_V v786 (re-pin cargar-ads v786)');
  t(md5(app) === 'ed09a73f7b3d3e57193d300976454191', 'app.js md5 (re-pin fusionado A + CHAT-MUSE)');
  t(md5(css) === 'ac5cce38c92ad0c2936f7d1a1a36996d', 'styles.css md5 (re-pin fusionado A + CHAT-MUSE)');
  t(cnt(srv, "app.get('/api/ads") + cnt(srv, "app.post('/api/ads") === 14, 'server: 14 rutas /api/ads (12 + feed + auto del lote ads-directo)');

  // ---------- 2. Server: elegibles sin gate de listado, buscar, hoy ----------
  t(srv.includes("app.get('/api/ads/billetera/buscar'"), 'server: GET /api/ads/billetera/buscar existe');
  t(srv.includes("app.get('/api/ads/billetera/hoy'"), 'server: GET /api/ads/billetera/hoy existe');
  t(srv.includes('morningPostPush.pickTodayPost(sched, tz, new Date())'), 'hoy: usa pickTodayPost (solo lectura, no genera)');
  t(srv.includes("app.get('/api/ads/billetera/elegibles'"), 'server: elegibles sigue existiendo');
  t(!srv.includes("if (!gate.ok) return res.json({ ok: true, elegibles: [], ads_ready: false, motivo: gate.motivo });"),
    'elegibles: ya no devuelve lista vacía cuando Meta no está configurado');
  t(srv.includes('ads_ready: !!gate.ready'), 'elegibles: ads_ready sigue honesto (gate calculado, no inventado)');
  t(srv.includes("motivo: gate.code || 'page_not_authorized'"), 'elegibles: motivo honesto del gate (ads_not_configured cuando Meta no está)');
  t(srv.includes("replace(/%/g, '\\\\%')") && srv.includes("replace(/_/g, '\\\\_')") && srv.includes("replace(/\\\\/g, '\\\\\\\\')"), 'buscar: escapa %, _ y \\ en el LIKE (sin inyección de comodines)');
  t(srv.includes("if (q.length < 2) return res.json({ ok: true, resultados: [] });"), 'buscar: q < 2 caracteres → lista vacía honesta (200, sin error, sin viaje a la DB)');
  t(srv.includes("status = 'published'") && srv.includes('ig_media_id'), 'buscar/elegibles: solo publicados con ig_media_id');
  t(srv.includes("datetime(p.published_at) >= datetime('now', '-60 days')") === false,
    'elegibles: sin ventana de 60 días (un posteo viejo también se puede impulsar)');
  // Los gates de GASTO no se tocan.
  t(srv.includes("if (!destacadoSemana.boostHabilitado(process.env)) return res.status(403).json({ ok: false, motivo: 'boost_deshabilitado' });"),
    'impulsar: flag apagado → 403 (gate intacto)');
  t(srv.includes("motivo: 'ads_sin_permiso'"), 'impulsar: sin ads_management → ads_sin_permiso (gate intacto)');
  t(srv.includes("motivo: 'ads_no_configurado'"), 'impulsar: Meta sin configurar → ads_no_configurado (gate intacto)');

  // ---------- 3. Chunk: la caja muerta se fue, todo se muestra ----------
  t(!ana.includes('Impulsar todavía no está habilitado en tu cuenta.'), 'chunk: la caja muerta ya no existe en anaBilleteraHTML');
  t(ana.includes('const habilitado = d.boostHabilitado === true && d.ads_permiso === true;'),
    'chunk: habilitado = flag + permiso, los dos en true explícito (fail-closed)');
  t(ana.includes("anaT('El posteo de hoy'"), 'chunk: slot «El posteo de hoy»');
  t(ana.includes("anaT('¿Buscás otro posteo?'"), 'chunk: bloque buscador');
  t(ana.includes("oninput=\"anaBilleteraBuscar(this.value)\""), 'chunk: el buscador dispara anaBilleteraBuscar al escribir');
  t(ana.includes('function anaBilleteraPickerRow('), 'chunk: fila del picker compartida (recomendado/recientes/buscador)');
  t(ana.includes("anaT('✦ el más reciente'"), 'chunk: chip «el más reciente» cuando no hay mejor');
  t(ana.includes("anaT('✦ el que más rindió'"), 'chunk: chip «el que más rindió» intacto');
  t(ana.includes('function anaBilleteraQuieroImpulsar('), 'chunk: botón del chat (estado bloqueado)');
  t(ana.includes("anaT('Quiero impulsar este posteo'"), 'chunk: texto del botón del chat');
  t(ana.includes("api.get('/api/ads/billetera/hoy')"), 'chunk: fetch de hoy (4º fetch)');
  t(ana.includes("api.get('/api/ads/billetera/feed')"), 'chunk: fetch del feed (5º fetch, grilla del tab)');
  t(ana.includes('HF_ASK_TEXT_PENDING'), 'chunk: el botón del chat usa HF_ASK_TEXT_PENDING (flujo «Pedir un cambio»)');
  t(ana.includes('hfAskChange(anchorPost)'), 'chunk: el botón del chat ancla el posteo con hfAskChange');
  t(ana.includes('hfDeliverAskText()'), 'chunk: el botón del chat entrega el texto con hfDeliverAskText');
  t(!ana.includes("api.post('/api/ads/billetera/reservar'"), 'chunk: no se inventa ninguna «reserva» en el servidor');
  t(ana.includes('selPost'), 'chunk: selPost guarda el posteo elegido por el buscador');

  // ---------- 4. VM: anaBilleteraHTML en cada estado ----------
  const srcHTML = sliceFn(ana, 'function anaBilleteraHTML() {', '// Fila del picker de posteos');
  const srcCortar = sliceFn(ana, 'function anaCortarCaption(', 'function anaBilleteraPickerRow(');
  const srcRow = sliceFn(ana, 'function anaBilleteraPickerRow(', '// Resultados del buscador');
  const srcBusqRes = sliceFn(ana, 'function anaBilleteraBusqResHTML()', 'var ANA_BUSQ_TIMER');
  const srcQuiero = sliceFn(ana, 'function anaBilleteraQuieroImpulsar(', '// Selección en el picker');
  const srcElegir = sliceFn(ana, 'function anaBilleteraElegirPosteo(', 'function anaBilleteraElegirMonto(');
  const srcConstruir = sliceFn(ana, 'function anaBilleteraConstruirDatos(', 'async function anaBoostRecLoad(');
  t(srcHTML.length > 500, 'VM: anaBilleteraHTML extraído');
  t(srcCortar.length > 50 && srcRow.length > 100 && srcBusqRes.length > 50 && srcQuiero.length > 100, 'VM: helpers extraídos (incluido anaCortarCaption, que usa el picker)');
  t(srcElegir.length > 100 && srcConstruir.length > 500, 'VM: elegir/construir extraídos');
  const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const makeCtx = (lang) => {
    const calls = { pintar: 0, ask: null, delivered: false };
    const ctx = vm.createContext({
      console,
      anaT: (es, en) => (lang === 'en' ? (en || es) : es),
      esc: escStub,
      anaBoostRecPartes: (m) => ({ img: m.image_path ? '<img src="X">' : '', cap: '<p>' + escStub(m.caption || '') + '</p>', porque: 'rindió bien' }),
      anaBilleteraDatos: null,
      anaBilleteraPintar: () => { calls.pintar++; },
      hfAskChange: (p) => { calls.ask = p; },
      hfDeliverAskText: () => { calls.delivered = true; },
      HF_ASK_TEXT_PENDING: '',
      __calls: calls,
    });
    vm.runInContext(srcCortar + '\n' + srcHTML + '\n' + srcRow + '\n' + srcBusqRes + '\n' + srcQuiero + '\n' + srcElegir + '\n' + srcConstruir, ctx);
    return ctx;
  };
  const render = (ctx, datos) => {
    ctx.anaBilleteraDatos = datos;
    vm.runInContext('__out = anaBilleteraHTML();', ctx);
    return ctx.__out;
  };
  const eleg3 = [
    { post_id: 518, image_path: '/media/p518.jpg', caption: 'Café de especialidad recién tostado', ig_media_id: 'ig518' },
    { post_id: 551, image_path: '/media/p551.jpg', caption: 'Torta de chocolate para el finde', ig_media_id: 'ig551' },
    { post_id: 406, image_path: '/media/p406.jpg', caption: 'Promo 2x1 en medialunas', ig_media_id: 'ig406' },
  ];
  // A. Estado de hoy (bloqueado, sin Meta, billetera $0, sin mejor).
  const ctxA = makeCtx('es');
  const htmlA = render(ctxA, {
    mejor: null, hoy: { post_id: 519, caption: 'El posteo de hoy sale a las 17', image_path: '/media/p519.jpg', scheduled_at: '2026-11-06T22:00:00.000Z', hora: '17:00' },
    boostHabilitado: false, ads_permiso: null, conversion_pendiente: false,
    billetera: { balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles: eleg3, selId: 518, selMonto: 20, selPost: eleg3[0], busq: { q: '', resultados: [], buscando: false, hecho: false },
  });
  t(htmlA.includes('Tu billetera de ads: $0'), 'VM A: billetera $0 siempre visible (bloqueado)');
  t(htmlA.includes('Cargar plata'), 'VM A: cargar plata visible (bloqueado)');
  t(htmlA.includes('El posteo de hoy'), 'VM A: slot «El posteo de hoy» cuando no hay mejor');
  t(htmlA.includes('Sale hoy · 17:00'), 'VM A: chip «Sale hoy · 17:00»');
  t(htmlA.includes('En cuanto se publique, queda listo para impulsar.'), 'VM A: nota del posteo de hoy');
  t(htmlA.includes('el más reciente'), 'VM A: chip «el más reciente» en la primera fila (sin mejor)');
  t(htmlA.includes('Café de especialidad recién tostado') && htmlA.includes('Torta de chocolate para el finde') && htmlA.includes('Promo 2x1 en medialunas'),
    'VM A: picker con los 3 publicados y captions reales');
  t(htmlA.includes('/media/p518.jpg') && htmlA.includes('/media/p551.jpg'), 'VM A: miniaturas reales por posteo');
  t(htmlA.includes('¿Buscás otro posteo?') && htmlA.includes('id="anaBoostRecBusq"'), 'VM A: buscador presente');
  t(htmlA.includes('Quiero impulsar este posteo'), 'VM A: botón del chat en estado bloqueado');
  t(htmlA.includes('falta conectar la cuenta publicitaria de Meta'), 'VM A: nota honesta (sin configurar)');
  t(!htmlA.includes('Meter ads por 7 días'), 'VM A: NO aparece el botón de gastar (bloqueado)');
  t(!htmlA.includes('Impulsar todavía no está habilitado'), 'VM A: la caja muerta no aparece');
  // B. Estado habilitado (flag + permiso, saldo $50, mejor de la semana).
  const ctxB = makeCtx('es');
  const htmlB = render(ctxB, {
    mejor: { post_id: 551, image_path: '/media/p551.jpg', caption: 'Torta de chocolate para el finde', reach: 900 },
    hoy: null, boostHabilitado: true, ads_permiso: true, conversion_pendiente: false,
    billetera: { balance_cents: 5000, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles: eleg3, selId: 551, selMonto: 20, selPost: eleg3[1], busq: { q: '', resultados: [], buscando: false, hecho: false },
  });
  t(htmlB.includes('Tu billetera de ads: $50'), 'VM B: billetera $50 (habilitado)');
  t(htmlB.includes('Tu mejor posteo de la semana'), 'VM B: mejor de la semana visible');
  t(htmlB.includes('el que más rindió'), 'VM B: chip «el que más rindió»');
  t(!htmlB.includes('El posteo de hoy'), 'VM B: con mejor, no hay slot de hoy');
  t(htmlB.includes('Meter ads por 7 días · $20'), 'VM B: botón de gastar (habilitado)');
  t(!htmlB.includes('Quiero impulsar este posteo'), 'VM B: NO aparece el botón del chat (habilitado)');
  t(!htmlB.includes('falta conectar la cuenta publicitaria'), 'VM B: sin nota de bloqueo (habilitado)');
  // C. Sin posteos todavía (bloqueado): billetera igual, sin botón de chat.
  const ctxC = makeCtx('es');
  const htmlC = render(ctxC, {
    mejor: null, hoy: null, boostHabilitado: false, ads_permiso: null, conversion_pendiente: false,
    billetera: { balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles: [], selId: 0, selMonto: 20, selPost: null, busq: { q: '', resultados: [], buscando: false, hecho: false },
  });
  t(htmlC.includes('Tu billetera de ads: $0'), 'VM C: billetera visible aunque no haya posteos');
  t(htmlC.includes('Todavía no tenés posteos publicados para impulsar.'), 'VM C: nota honesta sin posteos');
  t(!htmlC.includes('Quiero impulsar este posteo'), 'VM C: sin posteo no hay botón del chat (nada que anclar)');
  t(htmlC.includes('falta conectar la cuenta publicitaria de Meta'), 'VM C: nota honesta igual');
  // D. Sin permiso (ads_management): motivo distinto, mismo botón del chat.
  const ctxD = makeCtx('es');
  const htmlD = render(ctxD, {
    mejor: null, hoy: null, boostHabilitado: true, ads_permiso: false, conversion_pendiente: false,
    billetera: { balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles: eleg3, selId: 518, selMonto: 20, selPost: eleg3[0], busq: { q: '', resultados: [], buscando: false, hecho: false },
  });
  t(htmlD.includes('falta el permiso de publicidad (ads_management)'), 'VM D: nota de sin permiso (ads_management)');
  t(htmlD.includes('Quiero impulsar este posteo'), 'VM D: botón del chat también sin permiso');
  // D2. Flag apagada pero Meta lista: la nota es la de la flag (el único
  // caso en que sale ese motivo: Meta ya está, falta el interruptor).
  const ctxD2 = makeCtx('es');
  const htmlD2 = render(ctxD2, {
    mejor: null, hoy: null, boostHabilitado: false, ads_permiso: true, conversion_pendiente: false,
    billetera: { balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles: eleg3, selId: 518, selMonto: 20, selPost: eleg3[0], busq: { q: '', resultados: [], buscando: false, hecho: false },
  });
  t(htmlD2.includes('El impulso todavía no está habilitado en tu cuenta'), 'VM D2: nota de flag apagada (Meta lista)');
  t(htmlD2.includes('Quiero impulsar este posteo'), 'VM D2: botón del chat también con flag apagada');
  // E. Posteo elegido por el buscador (fuera de los 5): queda como fila extra.
  const eleg6 = [1, 2, 3, 4, 5, 6].map((n) => ({ post_id: 100 + n, image_path: '/media/p' + n + '.jpg', caption: 'Posteo número ' + n + ' del feed', ig_media_id: 'ig' + n }));
  const ctxE = makeCtx('es');
  const htmlE = render(ctxE, {
    mejor: null, hoy: null, boostHabilitado: false, ads_permiso: null, conversion_pendiente: false,
    billetera: { balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles: eleg6, selId: 106, selMonto: 20, selPost: eleg6[5], busq: { q: 'número 6', resultados: [eleg6[5]], buscando: false, hecho: true },
  });
  t(htmlE.includes('Posteo número 6 del feed'), 'VM E: el elegido por el buscador se ve como fila seleccionada');
  // Dos ✓: la fila extra del picker (la selección) + la fila del
  // resultado del buscador (donde se encontró). Es el mismo posteo en
  // dos lugares con sentido distinto, no un duplicado sin querer.
  t((htmlE.match(/✓/g) || []).length === 2, 'VM E: dos ✓ (fila extra del picker + resultado del buscador)');
  t(htmlE.includes('Mostramos los 5 más recientes.'), 'VM E: nota de 5 recientes con más de 5 elegibles');
  // F. EN espejado 1:1.
  const ctxF = makeCtx('en');
  const htmlF = render(ctxF, {
    mejor: null, hoy: { post_id: 519, caption: 'Today post', image_path: '/media/p519.jpg', scheduled_at: '2026-11-06T22:00:00.000Z', hora: '5:00 PM' },
    boostHabilitado: false, ads_permiso: null, conversion_pendiente: false,
    billetera: { balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles: eleg3, selId: 518, selMonto: 20, selPost: eleg3[0], busq: { q: '', resultados: [], buscando: false, hecho: false },
  });
  t(htmlF.includes("Today's post") && htmlF.includes('I want to boost this post'), 'VM F: EN espejado (hoy + botón del chat)');
  t(!htmlF.includes('El posteo de hoy') && !htmlF.includes('Quiero impulsar este posteo'), 'VM F: EN sin textos ES');
  // G. Elegir un posteo del buscador guarda selPost (sobrevive al re-render).
  const ctxG = makeCtx('es');
  ctxG.anaBilleteraDatos = {
    elegibles: eleg3, selId: 518, selMonto: 20, selPost: eleg3[0],
    busq: { q: 'torta', resultados: [{ post_id: 900, image_path: '/media/p900.jpg', caption: 'Torta vieja de 2024', ig_media_id: 'ig900' }], buscando: false, hecho: true },
  };
  vm.runInContext('anaBilleteraElegirPosteo(900, null);', ctxG);
  t(ctxG.anaBilleteraDatos.selId === 900 && ctxG.anaBilleteraDatos.selPost && ctxG.anaBilleteraDatos.selPost.post_id === 900,
    'VM G: elegir del buscador guarda selId + selPost');
  t(ctxG.__calls.pintar === 1, 'VM G: elegir repinta (anaBilleteraPintar)');
  // H. Botón del chat: texto + ancla + entrega (sin gastar nada).
  const ctxH = makeCtx('es');
  ctxH.anaBilleteraDatos = {
    selId: 900, selMonto: 50,
    selPost: { post_id: 900, image_path: '/media/p900.jpg', caption: 'Torta vieja de 2024' },
    elegibles: [],
  };
  vm.runInContext('anaBilleteraQuieroImpulsar(null);', ctxH);
  t(ctxH.HF_ASK_TEXT_PENDING === 'Quiero impulsar este posteo con $50 por 7 días', 'VM H: texto pendiente con posteo + $50 + 7 días');
  t(ctxH.__calls.ask && ctxH.__calls.ask.id === 900 && ctxH.__calls.ask.caption === 'Torta vieja de 2024',
    'VM H: ancla con id + caption del posteo elegido');
  t(ctxH.__calls.delivered === true, 'VM H: se llama a hfDeliverAskText (mismo flujo que «Pedir un cambio»)');
  // I. ConstruirDatos: hoy + selección que sobrevive aunque venga del buscador.
  const ctxI = makeCtx('es');
  vm.runInContext(`__d1 = anaBilleteraConstruirDatos(
    { d: { ok: true, mejor: null }, bil: { ok: true, balance_cents: 0 }, elig: { ok: true, elegibles: ${JSON.stringify(eleg3)} }, hoy: { ok: true, hoy: { post_id: 519, caption: 'hoy', hora: '17:00' } } },
    null);`, ctxI);
  t(ctxI.__d1.hoy && ctxI.__d1.hoy.post_id === 519, 'VM I: constructor trae hoy');
  t(ctxI.__d1.selId === 518 && ctxI.__d1.selPost && ctxI.__d1.selPost.post_id === 518, 'VM I: sin mejor, pre-selecciona el primer elegible');
  vm.runInContext(`__d2 = anaBilleteraConstruirDatos(
    { d: { ok: true, mejor: null }, bil: { ok: true, balance_cents: 0 }, elig: { ok: true, elegibles: ${JSON.stringify(eleg3)} }, hoy: { ok: false, hoy: null } },
    { selId: 900, selMonto: 100, selPost: { post_id: 900, image_path: '/media/p900.jpg', caption: 'Torta vieja' } });`, ctxI);
  t(ctxI.__d2.selId === 900 && ctxI.__d2.selPost && ctxI.__d2.selPost.post_id === 900, 'VM I: la selección del buscador sobrevive a la recarga');
  t(ctxI.__d2.selMonto === 100, 'VM I: el monto elegido sobrevive a la recarga');

  // ---------- 5. Boot real por HTTP (solo si express resuelve) ----------
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) { booted = false; }
  if (!booted) {
    console.log('boot: express no resuelve en este árbol, sección omitida (como test-lote-prueba-chat.js)');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-ads-pantalla-'));
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
      env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-ads-pantalla', OPENAI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvLog = '';
    srvProc.stdout.on('data', (d) => { srvLog += d; });
    srvProc.stderr.on('data', (d) => { srvLog += d; });
    try {
      t(await waitBoot(), 'boot: server levanta');
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      t(ver.build === '20261105-v826', `boot: /api/version 20261105-v825 (vino ${ver.build})`);      // Sin sesión: 401 en los endpoints nuevos.
      const s1 = await api('', 'GET', '/api/ads/billetera/buscar?q=cafe');
      t(s1.status === 401, 'boot: sin sesión, buscar → 401');
      const s2 = await api('', 'GET', '/api/ads/billetera/hoy');
      t(s2.status === 401, 'boot: sin sesión, hoy → 401');
      // Registro + sesión.
      const email = 'ads-pantalla-test@example.com';
      const rr = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'test1234', business_name: 'Café Aroma Test' }),
      });
      const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
      const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
      t(rr.status === 200 || rr.status === 201, `boot: registro → ${rr.status}`);
      t(cookie.length > 0, 'boot: registro deja sesión en cookie');
      // Seed de posteos directo en la DB del DATA_DIR aislado (mismo
      // patrón que test-carta-aprobar.js --seed).
      const seedSrc = `
        const db = require('./db').db || require('./db');
        const u = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.SEED_EMAIL);
        if (!u) { console.error('seed: sin usuario'); process.exit(1); }
        const uid = u.id;
        const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 19).replace('T', ' ');
        const baToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const ins = db.prepare('INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, published_at, ig_media_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const recientes = [];
        for (let n = 1; n <= 5; n++) {
          const r = ins.run(uid, '/media/cafe' + n + '.jpg', 'Café de especialidad ' + n, '', daysAgo(n), 'published', 'image', daysAgo(n), 'ig_' + n);
          recientes.push(Number(r.lastInsertRowid));
        }
        const old = ins.run(uid, '/media/torta-vieja.jpg', 'Torta de chocolate PALABRA-VIEJA-UNICA de la abuela', '', daysAgo(90), 'published', 'image', daysAgo(90), 'ig_old');
        ins.run(uid, '/media/sin-ig.jpg', 'Posteo sin IG media id', '', daysAgo(2), 'published', 'image', daysAgo(2), '');
        ins.run(uid, '/media/borrador.jpg', 'Borrador no elegible', '', daysAgo(1), 'draft', 'image', null, 'ig_draft');
        const hoy = ins.run(uid, '/media/hoy.jpg', 'El posteo de hoy sale a las 17', '', baToday + ' 21:00:00', 'scheduled', 'image', null, '');
        console.log('SEED ' + JSON.stringify({ uid, recientes, old: Number(old.lastInsertRowid), hoy: Number(hoy.lastInsertRowid), baToday }));
      `;
      const seedOut = await new Promise((resolve, reject) => {
        execFile('node', ['-e', seedSrc], { cwd: __dirname, env: { ...process.env, DATA_DIR: TMP, SEED_EMAIL: email } },
          (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
      });
      const seedLine = (seedOut.split('\n').find((l) => l.startsWith('SEED ')) || '').slice(5);
      let seed = null;
      try { seed = JSON.parse(seedLine); } catch (e) { seed = null; }
      t(!!seed && seed.recientes && seed.recientes.length === 5, 'boot: seed de 5 recientes + viejo + hoy');
      if (seed) {
        // Elegibles: los 6 publicados con ig_media_id, INCLUIDO el viejo
        // de 90 días (sin ventana de 60); fuera el sin ig_media_id y el borrador.
        const elig = await api(cookie, 'GET', '/api/ads/billetera/elegibles');
        t(elig.status === 200 && elig.data && elig.data.ok === true, 'boot: elegibles → 200 ok');
        const rows = (elig.data && elig.data.elegibles) || [];
        t(rows.length === 6, `boot: elegibles trae 6 (vino ${rows.length}, viejo incluido)`);
        const ids = new Set(rows.map((r) => r.post_id));
        t(ids.has(seed.old), 'boot: elegibles incluye el posteo viejo de 90 días');
        t(seed.recientes.every((id) => ids.has(id)), 'boot: elegibles incluye los 5 recientes');
        t(rows.every((r) => r.image_path && r.caption), 'boot: elegibles trae miniatura real + caption por posteo');
        t(elig.data.ads_ready === false, 'boot: elegibles con Meta sin conectar → ads_ready false (honesto)');
        t(elig.data.motivo === 'ads_not_configured', `boot: elegibles motivo ads_not_configured (vino ${elig.data.motivo})`);
        // Buscador: encuentra el viejo por su caption, sin límite de edad.
        const busqViejo = await api(cookie, 'GET', '/api/ads/billetera/buscar?q=' + encodeURIComponent('PALABRA-VIEJA-UNICA'));
        t(busqViejo.status === 200 && busqViejo.data && busqViejo.data.ok === true, 'boot: buscar viejo → 200 ok');
        const resViejo = (busqViejo.data && busqViejo.data.resultados) || [];
        t(resViejo.length === 1 && resViejo[0].post_id === seed.old, 'boot: buscar encuentra el posteo viejo por caption');
        t(resViejo[0] && resViejo[0].image_path === '/media/torta-vieja.jpg', 'boot: buscar trae la miniatura real del viejo');
        const busqCafe = await api(cookie, 'GET', '/api/ads/billetera/buscar?q=' + encodeURIComponent('ESPECIALIDAD'));
        t(busqCafe.status === 200 && ((busqCafe.data && busqCafe.data.resultados) || []).length === 5, 'boot: buscar ESPECIALIDAD (mayúsculas) trae los 5 cafés');
        const busqCorto = await api(cookie, 'GET', '/api/ads/billetera/buscar?q=x');
        t(busqCorto.status === 200 && ((busqCorto.data && busqCorto.data.resultados) || []).length === 0, 'boot: buscar con 1 letra → lista vacía honesta (200, sin error)');
        const busqNada = await api(cookie, 'GET', '/api/ads/billetera/buscar?q=' + encodeURIComponent('ZZZNOTHING'));
        t(busqNada.status === 200 && ((busqNada.data && busqNada.data.resultados) || []).length === 0, 'boot: buscar sin coincidencias → lista vacía honesta');
        // Hoy: el programado de hoy, con hora.
        const hoy = await api(cookie, 'GET', '/api/ads/billetera/hoy');
        t(hoy.status === 200 && hoy.data && hoy.data.ok === true, 'boot: hoy → 200 ok');
        t(hoy.data && hoy.data.hoy && hoy.data.hoy.post_id === seed.hoy, 'boot: hoy es el programado de hoy');
        t(hoy.data && hoy.data.hoy && typeof hoy.data.hoy.hora === 'string' && hoy.data.hoy.hora.length > 0, 'boot: hoy trae hora formateada');
        // Nada gasta sin Meta: impulsar con flag apagado → 403.
        const imp = await api(cookie, 'POST', '/api/ads/billetera/impulsar', { posteoId: seed.recientes[0], montoUSD: 20 });
        t(imp.status === 403 && imp.data && imp.data.motivo === 'boost_deshabilitado', 'boot: impulsar con flag apagado → 403 (nada se gasta)');
        // Billetera: saldo 0; cargar en demo → 409 (nada se cobra).
        const bil = await api(cookie, 'GET', '/api/ads/billetera');
        t(bil.status === 200 && bil.data && bil.data.ok === true && bil.data.balance_cents === 0, 'boot: billetera $0 en cuenta nueva');
        const car = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 50 });
        t(car.status === 409, `boot: cargar en demo_mode → 409 (nada se cobra, vino ${car.status})`);
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

  console.log(`\ntest-lote-ads-pantalla: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
