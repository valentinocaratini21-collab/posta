// test-lote-a-mejoras-inicio.js — LOTE A MEJORAS INICIO (8/11):
// 1) pestaña «Hoy» → «Inicio»; 2) posteo del día debajo del saludo;
// 3) copy 5/7 con lógica de día; 4) camino de subida perfecto
// (posteo armado: slot en la subida, regla de hueco libre, estado por
// foto en el álbum, fix gemela por hash); 5) íconos feed/reel/
// etiquetados justo arriba de la grilla; 7b) filtro demo_% en el
// picker de Impulsar; 8) Estrategia + carta semanal eliminadas
// (la recomendación vive en Impulsar como una línea); 9) Nivel con
// avatar de Posty + línea del porqué. Agregado: «Usar la foto que
// envié» (detalle + chat, preview antes de confirmar, nunca en
// silencio). Guardas del chat (a/b/c + pregen con matcher por tema) y
// casos 1 y 2 (nunca prometer sin entregar; la oferta llega como
// TARJETA, no como texto). Paridad ES+EN.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-a-mejoras-inicio.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const http = require('http'), crypto = require('crypto'), os = require('os');
const { spawn } = require('child_process');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const gen = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const adsBil = fs.readFileSync(path.join(__dirname, 'ads-billetera.js'), 'utf8');
const sched = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
const chunkAn = fs.readFileSync(path.join(__dirname, 'public', 'chunk-analisis.js'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;

function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
function sliceFn(src, startSig, endSig) {
  const a = src.indexOf(startSig);
  if (a < 0) return '';
  const b = endSig ? src.indexOf(endSig, a + 10) : -1;
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

// ISO (UTC) de una hora de pared en America/New_York, con el offset
// real de esa fecha (DST incluido).
function tzISO(y, mo, d, h, mi, tz) {
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const asUTC = new Date(new Date(utc).toLocaleString('en-US', { timeZone: tz })).getTime();
  return new Date(utc + (utc - asUTC)).toISOString();
}
function nyParts(date) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).forEach((x) => { o[x.type] = x.value; });
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day) };
}
const TZ = 'America/New_York';
const nowNY = nyParts(new Date());
const tom = new Date(Date.UTC(nowNY.y, nowNY.m - 1, nowNY.d) + 86400000);
const tomNY = { y: tom.getUTCFullYear(), m: tom.getUTCMonth() + 1, d: tom.getUTCDate() };
const isoHoy19 = tzISO(nowNY.y, nowNY.m, nowNY.d, 19, 0, TZ);
const isoMan19 = tzISO(tomNY.y, tomNY.m, tomNY.d, 19, 0, TZ);
const postHoy = { id: 901, status: 'scheduled', approval: 'pending', media_type: 'image', image_path: 'foto-hoy.jpg', scheduled_at: isoHoy19, caption: 'En Posty, manejo tu Instagram' };

/* ---------- 1. Estático: pestañas — 5, Inicio, sin Estrategia ---------- */
console.log('— 1. pestañas: 5, Inicio, sin Estrategia —');
ok(cnt(app, /gzT\('Inicio', 'Home'\)/g) >= 2, 'rótulo Inicio en bb-bar y mz-tabs (gzT Inicio/Home)');
ok(cnt(app, /gzT\('Hoy', 'Home'\)/g) === 0, 'sin gzT Hoy/Home en ningún lado');
ok(!app.includes('data-tab="estrategia"'), 'sin data-tab estrategia');
ok(!app.includes("tabBtn('estrategia'"), 'sin tabBtn estrategia');
ok(!app.includes("tab: 'estrategia'"), 'sin tab estrategia en el mapeo');
const bbBar = app.split('\n').find((l) => l.includes('<nav class="bb-bar">')) || '';
ok(cnt(bbBar, /tabBtn\(/g) === 5, 'dock bb-bar: 5 botones (Inicio, Análisis, Impulsar, Nivel, Chat)');
ok(bbBar.includes("tabBtn('inicio'") && bbBar.includes("tabBtn('analisis'") && bbBar.includes("tabBtn('impulsar'") && bbBar.includes("tabBtn('jardin'") && bbBar.includes("tabBtn('chat'"), 'dock bb-bar: los 5 tabs correctos');
ok(app.includes("else if (tab === 'analisis') { location.hash = '#/app/ads'; return; }"), 'router: tab analisis redirige a #/app/ads (no a una pantalla Estrategia)');
ok(!app.includes("tab === 'analisis'") || app.includes("location.hash = '#/app/ads'"), 'router: la única rama analisis es la redirección');
const mxTab = sliceFn(app, 'function mxTabKey', 'function ');
ok(!!mxTab && !mxTab.includes("'estrategia'"), 'mxTabKey: sin estrategia');

/* ---------- 2. Estático: posteo de hoy + copy 5/7 ---------- */
console.log('— 2. posteo de hoy debajo del saludo + copy 5/7 —');
const hoyApr = sliceFn(app, 'const hoyAprobarHTML = ', '  ${hoyAprobarHTML}');
ok(!!hoyApr, 'extrae hoyAprobarHTML');
ok(hoyApr.includes('pzHoyHoyHTML'), 'hoyAprobarHTML rinde pzHoyHoyHTML (el posteo de hoy)');
ok(hoyApr.indexOf('pzHoySpeechHTML') < hoyApr.indexOf('pzHoyHoyHTML'), 'orden: saludo ANTES que el posteo de hoy');
ok(hoyApr.indexOf('pzHoyHoyHTML') < hoyApr.indexOf('pzHoyUploadHTML'), 'orden: posteo de hoy ANTES que la subida');
ok(hoyApr.indexOf('pzHoyUploadHTML') < hoyApr.indexOf('pzHoySemanaHTML'), 'orden: subida ANTES que la semana');
ok(hoyApr.includes('hoyPostR1'), 'hoyAprobarHTML considera hoyPostR1 (borrador armado de hoy)');
ok(!!extractFn(app, 'function pzHoyHoyHTML'), 'existe pzHoyHoyHTML');
ok(extractFn(app, 'function pzHoyHoyHTML').includes('EL POSTEO DE HOY'), 'pzHoyHoyHTML: cabecera EL POSTEO DE HOY');
const semSrc = extractFn(app, 'function pzHoySemanaHTML');
ok(!!semSrc, 'extrae pzHoySemanaHTML');
ok(semSrc.includes('tu semana viene en camino'), 'copy lun–sáb: «X/7 posteos, tu semana viene en camino»');
ok(semSrc.includes('esta semana cumplimos'), 'copy domingo: «esta semana cumplimos X/7 posteos»');
ok(semSrc.includes('¡Semana completa!'), 'copy domingo 7/7: festejo «¡Semana completa!»');
ok(semSrc.includes('hoy es domingo'), 'sub domingo: «hoy es domingo — N de 7 días…»');
ok(semSrc.includes('hoyIdx === 6'), 'la lógica de domingo es hoyIdx===6 (el 7º día de la tira)');
ok(semSrc.includes('This week we hit'), 'copy EN domingo presente');
ok(semSrc.includes('Week complete!'), 'festejo EN presente');

/* ---------- 3. Estático: subida — 2 botones directos, sin hoja ---------- */
console.log('— 3. subida: Galería/Cámara directas, sin hoja —');
ok(!app.includes('function pzHoySubirAbrir') && !app.includes('function pzHoySubirCerrar'), 'pzHoySubirAbrir/Cerrar ELIMINADAS (no hay hoja intermedia)');
const upSrc = extractFn(app, 'function pzHoyUploadHTML');
ok(!!upSrc, 'extrae pzHoyUploadHTML');
ok(upSrc.includes('data-pz-hoy-subir="galeria"') && upSrc.includes('data-pz-hoy-subir="camara"'), 'subida: 2 botones directos Galería + Cámara');
ok(upSrc.includes('Galería') && upSrc.includes('Cámara'), 'subida: rótulos Galería/Cámara');
ok(!upSrc.includes('data-pz-hoy-subir="1"'), 'subida: sin el botón único viejo (data-pz-hoy-subir="1")');
ok(upSrc.includes("pz-hoy-album-est"), 'álbum: píldora de estado por foto');
ok(upSrc.includes("sale el '") && upSrc.includes("ya salió") && upSrc.includes('esperando lugar'), 'álbum: estados «sale el [día]» / «ya salió» / «esperando lugar»');
const iniView = extractFn(app, 'function inicioView');
ok(!!iniView && !iniView.includes('hoySheetHTML'), 'inicioView: sin hoySheetHTML en el render');

/* ---------- 4. Estático: feed tabs + Nivel + usar-foto + SFT/casos ---------- */
console.log('— 4. feed tabs arriba de la grilla + Nivel + usar-foto + oferta del chat —');
const feedView = extractFn(app, 'function feedView');
ok(!!feedView, 'extrae feedView');
ok(feedView.includes('hfTabsHTML(HF_TAB, en)'), 'feedView rinde hfTabsHTML');
ok(feedView.indexOf('hfTabsHTML') < feedView.lastIndexOf('gridHTML'), 'feedView: la fila de pestañas va ANTES de ${gridHTML} en el retorno');
ok(feedView.indexOf('statsHTML') < feedView.indexOf('hfTabsHTML'), 'feedView: la fila va DESPUÉS de las stats (justo arriba de la grilla)');
ok(feedView.includes('hfTabTiles'), 'feedView filtra por hfTabTiles');
ok(app.includes('[data-hf-tab]'), 'bindFeed cablea los clicks [data-hf-tab]');
ok(iniView.indexOf('hfTabsHTML') > iniView.indexOf('homeHeadHTML'), 'inicioView: hfTabsHTML DESPUÉS del perfil (no antes)');
ok(iniView.indexOf('hfTabsHTML') < iniView.lastIndexOf('gridHTML'), 'inicioView: hfTabsHTML ANTES de ${gridHTML} en el retorno');
const nivSrc = extractFn(app, 'function pzNivelPantallaHTML');
ok(!!nivSrc, 'extrae pzNivelPantallaHTML');
ok(nivSrc.includes('pz-nivel-posty'), 'Nivel: avatar de Posty arriba (pz-nivel-posty)');
ok(nivSrc.includes('ai-avatar.png'), 'Nivel: la cara canónica ai-avatar.png');
ok(nivSrc.includes('Cuanto más nivel'), 'Nivel: línea «Cuanto más nivel, más sé qué te gusta…»');
ok(nivSrc.includes('los posteos salen cada vez mejores'), 'Nivel: la línea cierra en «los posteos salen cada vez mejores»');
// «Usar la foto que envié» (Valentino 21:10): detalle + chat, preview antes de confirmar.
ok(app.includes('pzUsarFotoAbrir') && app.includes('pzUsarFotoPreview') && app.includes('pzUsarFotoConfirmar'), 'usar-foto: abrir + preview + confirmar existen');
ok(app.includes('/api/album/libres'), 'usar-foto: GET /api/album/libres');
ok(app.includes('/usar-foto'), 'usar-foto: POST /usar-foto');
ok(app.includes('hf-d-usarfoto'), 'usar-foto: botón en el detalle (hf-d-usarfoto)');
ok(app.includes('Usar la foto que envié'), 'usar-foto: rótulo «Usar la foto que envié»');
const detSrc = extractFn(app, 'function hfDetailHTML');
ok(!!detSrc && detSrc.includes('hf-d-usarfoto'), 'detalle: el botón vive en hfDetailHTML (borrador/programado)');
// SFT: la oferta llega como TARJETA (caso 2) y nunca promete sin entregar (caso 1).
ok(app.includes('pzSftChatTarjetaArmada'), 'SFT: la oferta se rinde como tarjeta armada (pzSftChatTarjetaArmada)');
ok(!app.includes('Te propongo: Que Posty lo arme'), 'SFT: fuera el texto largo volcado (caso 2)');
const propSrc = extractFn(app, 'function pzSftChatProponer');
// (LOTE CHAT-CLICKS · re-pin) El POST /armar se factorizó a
// pzSftChatArmarUno (lo usan la tarjeta y «Aprobar todas»); Proponer lo
// llama, no lo hace directo.
const armUnoSrc = extractFn(app, 'function pzSftChatArmarUno');
ok(!!armUnoSrc && armUnoSrc.includes('/armar'), 'SFT: chatArmarUno llama POST /armar (el posteo se arma en la subida)');
ok(!!propSrc && propSrc.includes('pzSftChatArmarUno'), 'SFT: chatProponer arma vía pzSftChatArmarUno');
ok(!!propSrc && propSrc.includes('pzSftChatTarjetaArmada'), 'SFT: chatProponer rinde la tarjeta armada');
const aprSrc = extractFn(app, 'function pzSftChatAprobar');
ok(!!aprSrc && !aprSrc.includes("/crear'") && !aprSrc.includes('/crear"'), 'SFT: chatAprobar ya no llama /crear (el borrador ya existe armado)');
// (LOTE CHAT-CLICKS · re-pin) El PATCH + choice 'armar' se factorizó a
// pzSftChatAprobarUno (lo usan Aprobar y «Aprobar todas»).
const aprUnoSrc = extractFn(app, 'function pzSftChatAprobarUno');
ok(!!aprUnoSrc && aprUnoSrc.includes("choice: 'armar'"), 'SFT: chatAprobarUno marca choice armar');
ok(!!aprSrc && aprSrc.includes('pzSftChatAprobarUno'), 'SFT: chatAprobar aprueba vía pzSftChatAprobarUno');
// FIX ÁLBUM cliente: mediaId viaja en la lista (la gemela nacía acá).
const sftDesp = extractFn(app, 'function pzSftDespuesDeSubirChat');
ok(!!sftDesp && sftDesp.includes('mediaId'), 'FIX ÁLBUM: pzSftDespuesDeSubirChat copia mediaId (ya no re-sube los bytes)');
ok(cnt(app, /mediaId: c\.mediaId/g) >= 1, 'FIX ÁLBUM: la lista lleva mediaId: c.mediaId');
// Guardas del chat (a) y (c).
ok(app.includes('libraryPaths'), 'chat (a): el cliente manda libraryPaths a /api/ideas/chat');
const prevSrc = extractFn(app, 'function renderChatPreviews_OLD');
ok(!!prevSrc && prevSrc.includes('combined['), 'chat (c): el preview resuelve por combined[photo_index] (respeta el índice)');
const prevCode = prevSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
ok(!prevCode.includes('CHAT_PHOTOS[0]'), 'chat (c): el preview ya no usa CHAT_PHOTOS[0] ignorando photo_index');

/* ---------- 5. Estático: servidor + generator + CSS ---------- */
console.log('— 5. servidor: /armar, /libres, /usar-foto, demo, carta, dedupe, guardas —');
// Ítem 4: el posteo armado nace en la subida, con slot en el momento.
ok(srv.includes("app.post('/api/album/:id/armar'"), 'endpoint POST /api/album/:id/armar existe');
ok(srv.includes('function armarNextFeedSlot'), 'slot: armarNextFeedSlot existe');
ok(srv.includes('function nextFreeReelSlot'), 'slot: nextFreeReelSlot existe (mar/jue)');
ok(srv.includes('function armarSlotLabel'), 'slot: armarSlotLabel existe');
const armarSlot = extractFn(srv, 'function armarNextFeedSlot');
ok(!!armarSlot && armarSlot.includes("status = 'draft'"), 'slot: el avance cuenta borradores armados (draft con scheduled_at)');
ok(!!armarSlot && armarSlot.includes('taken.has(k)'), 'slot: el avance respeta también los días programados (fix colisión día 2)');
const reelSlot = extractFn(srv, 'function nextFreeReelSlot');
ok(!!reelSlot && reelSlot.includes('wd !== 2 && wd !== 4'), 'slot reel: solo martes (2) o jueves (4)');
const armarH = sliceFn(srv, "app.post('/api/album/:id/armar'", "app.post('/api/album/:id/crear'");
ok(!!armarH && armarH.includes('ya_armado'), 'armar: si ya está armada devuelve el armado existente');
ok(!!armarH && armarH.includes('semana_llena'), 'armar: avisa semana_llena (el lunes que viene, nunca en silencio)');
ok(!!armarH && armarH.includes("'album-armado'"), 'armar: el borrador nace con source album-armado');
ok(!!armarH && armarH.includes('foto_asset_id'), 'armar: el borrador queda atado a la foto (foto_asset_id)');
// «Usar la foto que envié»: servidor.
ok(srv.includes("app.get('/api/album/libres'"), 'endpoint GET /api/album/libres existe');
ok(srv.includes("app.post('/api/posts/:id/usar-foto'"), 'endpoint POST /api/posts/:id/usar-foto existe');
const usarFoto = sliceFn(srv, "app.post('/api/posts/:id/usar-foto'", "app.post('/api/album/:id/armar'");
ok(!!usarFoto && usarFoto.includes("error: 'ocupada'"), 'usar-foto: foto ocupada → 409 con el día de su posteo');
ok(!!usarFoto && usarFoto.includes('preview'), 'usar-foto: preview:true muestra sin guardar');
// Ítem 4: álbum con estado + dedupe por hash + diseños fuera.
ok(srv.includes('function albumFotoEstado'), 'álbum: albumFotoEstado existe');
ok(srv.includes('function assetContentHash'), 'álbum: assetContentHash (huella sha256) existe');
ok(dbjs.includes('content_hash'), 'db: assets.content_hash existe (ALTER)');
ok(cnt(srv, /content_hash/g) >= 8, 'álbum: content_hash se usa en media, álbum, DELETE y pregen');
const albumGet = sliceFn(srv, "app.get('/api/album'", "app.get('/api/album/libres'");
ok(!!albumGet && albumGet.includes('estado'), 'GET /api/album devuelve estado por foto');
ok(!!albumGet && albumGet.includes('content_hash'), 'GET /api/album deduplica por huella (no solo por path)');
ok(srv.includes("String(gen.proposalPath), 'design'"), 'álbum: cambiar-imagen inserta kind design (los diseños no van al álbum)');
const delAlbum = sliceFn(srv, "app.delete('/api/album/:id'", "app.post('/api/album/:id/crear'");
ok(!!delAlbum && delAlbum.includes('content_hash'), 'DELETE álbum: borra también por huella (la gemela de distinto path)');
// 7b: filtro demo_% en los 4 endpoints + ads-billetera.
ok(cnt(srv, /NOT LIKE 'demo_%'/g) === 4, '7b: filtro demo_% en los 4 endpoints del servidor (feed, elegibles, buscar, mejor-posteo)');
ok(srv.includes("p.media_type != 'story'"), '7b bonus: mejor-posteo excluye media_type story');
ok(cnt(adsBil, /startsWith\('demo_'\)/g) === 2, '7b: filtro demo_ en elegiblesParaAds y feedParaAds');
ok(adsBil.includes('el mejor posteo de la semana') && !adsBil.includes('el mejor posteo de la carta'), '7b: ads-billetera ya no habla de «la carta»');
// 8: la carta semanal no se genera más (el job queda pero retorna temprano).
const sweep = extractFn(srv, 'function refreshAnalysesSweep');
ok(!!sweep && sweep.includes('carta_eliminada'), '8: refreshAnalysesSweep retorna carta_eliminada al inicio (no se genera ni se manda nada)');
ok(sched.includes('runWeeklyAnalysisRefresh'), '8: scheduler.js intacto (la llamada queda, el gate la frena)');
const refreshRoute = sliceFn(srv, "app.post('/api/analysis/refresh'", "app.get('/api/analysis/:id'");
ok(!!refreshRoute && refreshRoute.includes('410'), '8: POST /api/analysis/refresh sigue en 410');
ok(chunkAn.includes('La recomendación vive en Impulsar') && chunkAn.includes('como una línea (LOTE A 8/11'), '8: chunk-analisis anota que la recomendación vive en Impulsar como una línea');
// Guardas del chat (a/b/c + pregen con matcher).
ok(srv.includes('libraryMeta'), 'chat (a): el servidor pasa libraryMeta (tag + visión por foto)');
const chatRoute = sliceFn(srv, "app.post('/api/ideas/chat'", "app.post('/api/ideas/chat/idea'");
ok(!!chatRoute && chatRoute.includes('libraryMeta'), 'chat (a): /api/ideas/chat arma libraryMeta desde la librería');
const pregen = extractFn(srv, 'function pregenIdeaImage');
ok(!!pregen && pregen.includes('missing'), 'chat (d): pregen sin match → missing (el poll corta y cae a on-demand, caso 1)');
ok(!!pregen && pregen.includes('photoMappedRefsFor'), 'chat (d): pregen corre el matcher por tema (albumRefsForPiece)');
ok(!gen.includes('photo_index = 0'), 'chat (b): FOTO-OLVIDADA ya no fuerza photo_index: 0');
ok(gen.includes('libraryMeta'), 'chat (a): generator recibe libraryMeta');
ok(gen.includes('nunca uses la cara de Posty para ilustrar otro tema'), 'chat: regla dura — la cara de Posty nunca ilustra otro tema');
ok(gen.includes('FOTO-OLVIDADA: photo_index por tema'), 'chat (b): el índice ahora se elige por tema');
// CSS nuevo.
for (const cls of ['.pz-hoy-hoy{', '.pz-hoy-hoy-head{', '.pz-hoy-upload-btns{', '.pz-hoy-album-est{', '.pz-nivel-posty{', '.hf-d-usarfoto{', '.pz-usarfoto-sheet{', '.pz-usarfoto-opt{']) {
  ok(css.includes(cls), 'CSS: clase ' + cls + ' presente');
}

/* ---------- 6. VM: renders (semana, posteo de hoy, subida) ---------- */
console.log('— 6. VM: renders —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
ok(!!escLine, 'extrae const esc');
const diasMie = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ estado: i === 2 ? 'hoy' : (i < 2 ? 'pub' : '') }));
const diasDom = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ estado: i === 6 ? 'hoy' : (i < 6 ? 'pub' : '') }));
const vmCtx = { console, ME: { lang: 'es' }, window: {}, pzIc: () => '[ic]' };
vm.createContext(vmCtx);
vm.runInContext(escLine + '\n' + extractFn(app, 'function pzHoySemanaHTML') + '\n'
  + extractFn(app, 'function pzHoyHoraCorta') + '\n' + extractFn(app, 'function pzHoyCuandoCorto') + '\n'
  + extractFn(app, 'function mv') + '\n' + extractFn(app, 'function pzHoyCardHTML') + '\n'
  + extractFn(app, 'function pzHoyHoyHTML') + '\n' + extractFn(app, 'function pzHoyUploadHTML'), vmCtx);
const Sem = vmCtx.pzHoySemanaHTML;
const sMie = Sem({ n: 5, dias: diasMie }, false);
ok(sMie.includes('5/7 posteos, tu semana viene en camino'), 'render semana miércoles n=5: «5/7 posteos, tu semana viene en camino»');
ok(sMie.includes('<b>5/7</b>'), 'render semana miércoles: anillo 5/7');
const sDom = Sem({ n: 5, dias: diasDom }, false);
ok(sDom.includes('esta semana cumplimos 5/7 posteos'), 'render semana domingo n=5: «esta semana cumplimos 5/7 posteos»');
ok(sDom.includes('hoy es domingo'), 'render semana domingo: sub «hoy es domingo…»');
const sDom7 = Sem({ n: 7, dias: diasDom.map((d) => ({ estado: 'pub' })) }, false);
ok(sDom7.includes('¡Semana completa! 🎉'), 'render semana domingo n=7: festejo «¡Semana completa! 🎉»');
const sCero = Sem({ n: 0, dias: diasMie.map(() => ({ estado: '' })) }, false);
ok(sCero.includes('Tu semana recién arranca'), 'render semana n=0: «Tu semana recién arranca» (sin inventar)');
const sMieEn = Sem({ n: 5, dias: diasMie }, true);
ok(sMieEn.includes('5/7 posts, your week is on its way'), 'render semana EN miércoles: copy en inglés');
const Hoy = vmCtx.pzHoyHoyHTML;
const hHoy = Hoy(postHoy, { en: false, tz: TZ });
ok(hHoy.includes('EL POSTEO DE HOY'), 'render posteo de hoy: cabecera EL POSTEO DE HOY');
ok(hHoy.includes('hoy · 19:00'), 'render posteo de hoy: pill «hoy · 19:00»');
ok(hHoy.includes('foto-hoy.jpg'), 'render posteo de hoy: la foto real del posteo');
ok(hHoy.includes('Dale, publicalo ✓'), 'render posteo de hoy: botón Dale, publicalo');
ok(hHoy.includes('Cambialo'), 'render posteo de hoy: botón Cambialo');
ok(hHoy.includes('En Posty, manejo tu Instagram'), 'render posteo de hoy: caption visible');
const hHoyEn = Hoy(postHoy, { en: true, tz: TZ });
ok(hHoyEn.includes('TODAY’S POST') && hHoyEn.includes('today · 07:00 PM'), 'render posteo de hoy EN: cabecera + pill en inglés');
const Up = vmCtx.pzHoyUploadHTML;
const albumVm = [
  { id: 1, path: '/media/f1.jpg', thumb: '/media/f1.jpg', estado: 'sale', dia_label: 'miércoles 11/11' },
  { id: 2, path: '/media/f2.jpg', thumb: '/media/f2.jpg', estado: 'salio', dia_label: '' },
  { id: 3, path: '/media/f3.jpg', thumb: '/media/f3.jpg', estado: 'esperando', dia_label: '' },
];
const uHtml = Up(albumVm, false);
ok(uHtml.includes('Galería') && uHtml.includes('Cámara'), 'render subida: botones Galería + Cámara');
ok(uHtml.includes('sale el miércoles 11/11'), 'render álbum: «sale el miércoles 11/11»');
ok(uHtml.includes('ya salió'), 'render álbum: «ya salió»');
ok(uHtml.includes('esperando lugar'), 'render álbum: «esperando lugar»');
ok(uHtml.includes('3 fotos'), 'render álbum: contador «3 fotos»');
ok(!uHtml.includes('data-pz-hoy-subir="1"'), 'render subida: sin botón único viejo');

/* ---------- 7. VM: slots reales con DB (better-sqlite3 del árbol) ---------- */
console.log('— 7. VM: slots con DB real —');
const SLOT_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-a-slots-'));
process.env.DATA_DIR = SLOT_TMP;
const db = require('./db.js');
const slotCtx = {
  console,
  db,
  getSettings: () => ({ timezone: TZ }),
  DEFAULT_TZ: 'America/Argentina/Buenos_Aires',
  require: (p) => { if (p === './story-reel') return { STORY_HOUR: 13 }; throw new Error('require no stub: ' + p); },
};
vm.createContext(slotCtx);
for (const f of ['tzToday', 'mondayKeyOf', 'ymdInTz', 'shiftDays', 'wallInTz', 'zonedWallToUtc', 'weekdayOfYmd', 'closedDaysOf', 'userTz', 'assignScheduleSlots', 'armarNextFeedSlot', 'nextFreeReelSlot', 'armarSlotLabel', 'albumFotoEstado']) {
  const src = extractFn(srv, 'function ' + f);
  ok(!!src, 'extrae ' + f + ' (slot)');
  if (src) vm.runInContext(src, slotCtx);
}
const uidIns = db.prepare("INSERT INTO users (email, password_hash) VALUES (?,?)").run('lote-a@test.local', 'x');
const UID = Number(uidIns.lastInsertRowid);
ok(UID > 0, 'DB slots: usuario de prueba creado (id ' + UID + ')');
const insPost = (status, media, iso) => db.prepare(
  "INSERT INTO posts (user_id, image_path, status, media_type, scheduled_at) VALUES (?,?,?,?,?)")
  .run(UID, '/media/foto-test.jpg', status, media, iso).lastInsertRowid;
const today = slotCtx.tzToday(TZ);
const slotIso = (dayOff) => slotCtx.zonedWallToUtc(slotCtx.shiftDays(today, dayOff) + ' 19:00', TZ);
// (A) Foto: huecos consecutivos; el borrador armado cuenta (no se apila).
const iso1 = slotCtx.armarNextFeedSlot(UID);
ok(slotCtx.ymdInTz(iso1, TZ) === slotCtx.shiftDays(today, 1), 'slot A1: primera subida → mañana (' + slotCtx.shiftDays(today, 1) + ')');
ok(slotCtx.wallInTz(iso1, TZ).slice(11, 16) === '19:00', 'slot A1: a las 19:00 (best_hour por defecto)');
insPost('draft', 'image', iso1);
const iso2 = slotCtx.armarNextFeedSlot(UID);
ok(slotCtx.ymdInTz(iso2, TZ) === slotCtx.shiftDays(today, 2), 'slot A2: segunda subida (borrador armado) → pasado mañana, sin pisar el día 1');
insPost('scheduled', 'image', iso2);
const iso3 = slotCtx.armarNextFeedSlot(UID);
ok(slotCtx.ymdInTz(iso3, TZ) === slotCtx.shiftDays(today, 3), 'slot A3: tercera subida → día 3');
insPost('scheduled', 'image', iso3);
// (A4) Semana completa → el lunes que viene.
for (let i = 4; i <= 7; i++) insPost('scheduled', 'image', slotIso(i));
const iso4 = slotCtx.armarNextFeedSlot(UID);
ok(slotCtx.ymdInTz(iso4, TZ) === slotCtx.shiftDays(today, 8), 'slot A4: semana llena (7 días) → día 8, el lunes que viene');
ok(slotCtx.weekdayOfYmd(slotCtx.ymdInTz(iso4, TZ)) === 1, 'slot A4: el día 8 es lunes');
ok(slotCtx.mondayKeyOf(slotCtx.ymdInTz(iso4, TZ)) !== slotCtx.mondayKeyOf(today), 'slot A4: el día 8 cae en otra semana (semana_llena)');
// (B) Reel: martes o jueves, sin apilar.
let expReel1 = null;
for (let i = 1; i <= 7; i++) { const k = slotCtx.shiftDays(today, i); if ([2, 4].includes(slotCtx.weekdayOfYmd(k))) { expReel1 = k; break; } }
const reel1 = slotCtx.nextFreeReelSlot(UID);
ok(slotCtx.ymdInTz(reel1, TZ) === expReel1, 'slot B1: primer reel → próximo mar/jue (' + expReel1 + ')');
ok([2, 4].includes(slotCtx.weekdayOfYmd(slotCtx.ymdInTz(reel1, TZ))), 'slot B1: el día es martes o jueves');
ok(slotCtx.wallInTz(reel1, TZ).slice(11, 16) === '19:00', 'slot B1: reel a las 19:00');
insPost('scheduled', 'video', reel1);
let expReel2 = null;
for (let i = 1; i <= 7; i++) { const k = slotCtx.shiftDays(slotCtx.ymdInTz(reel1, TZ), i); if ([2, 4].includes(slotCtx.weekdayOfYmd(k))) { expReel2 = k; break; } }
const reel2 = slotCtx.nextFreeReelSlot(UID);
ok(slotCtx.ymdInTz(reel2, TZ) === expReel2, 'slot B2: segundo reel → el siguiente mar/jue (' + expReel2 + '), sin pisar el primero');
insPost('scheduled', 'video', reel2);
const reel3 = slotCtx.nextFreeReelSlot(UID);
ok(slotCtx.ymdInTz(reel3, TZ) !== slotCtx.ymdInTz(reel2, TZ) && slotCtx.ymdInTz(reel3, TZ) !== slotCtx.ymdInTz(reel1, TZ), 'slot B3: tercer reel → otro mar/jue distinto');
// (C) Etiqueta del slot.
const lab = slotCtx.armarSlotLabel(UID, iso1);
ok(lab.dia === slotCtx.shiftDays(today, 1), 'slot C: armarSlotLabel.dia = mañana');
ok(lab.hora === '19:00', 'slot C: armarSlotLabel.hora = 19:00');
const wdName = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(lab.dia + 'T12:00:00Z'));
ok(lab.dia_label.startsWith(wdName), 'slot C: dia_label empieza por el día en español («' + lab.dia_label + '»)');
// (D) Estado del álbum: el borrador armado por /armar (draft CON scheduled_at)
// muestra «sale» con su fecha. (PREPARADOR LOTE A · 8/11) El fix: albumFotoEstado
// trataba el draft como «esperando» aunque tuviera fecha; en vivo GET /api/album
// devolvía 'esperando' para la foto recién armada aunque el borrador con su slot
// ya existía. El draft SIN fecha sigue «esperando».
const manana = slotCtx.shiftDays(today, 1);
db.prepare("INSERT INTO posts (user_id, image_path, status, media_type, scheduled_at) VALUES (?,?,?,?,?)").run(UID, '/media/foto-armada.jpg', 'draft', 'image', slotCtx.zonedWallToUtc(manana + ' 19:00', TZ));
const estArm = slotCtx.albumFotoEstado(UID, '/media/foto-armada.jpg', TZ);
ok(estArm.estado === 'sale' && estArm.dia === manana && typeof estArm.dia_label === 'string' && estArm.dia_label.length > 0, 'estado D1: draft armado con fecha → «sale» el día del slot (' + manana + ', «' + (estArm.dia_label || '') + '»)');
db.prepare("INSERT INTO posts (user_id, image_path, status, media_type, scheduled_at) VALUES (?,?,?,?,?)").run(UID, '/media/foto-sin-fecha.jpg', 'draft', 'image', null);
const estSin = slotCtx.albumFotoEstado(UID, '/media/foto-sin-fecha.jpg', TZ);
ok(estSin.estado === 'esperando', 'estado D2: draft SIN fecha → «esperando»');
const estNada = slotCtx.albumFotoEstado(UID, '/media/foto-nadie.jpg', TZ);
ok(estNada.estado === 'esperando', 'estado D3: sin posteo → «esperando»');
db.prepare("INSERT INTO posts (user_id, image_path, status, media_type, published_at) VALUES (?,?,?,?,?)").run(UID, '/media/foto-publicada.jpg', 'published', 'image', slotCtx.zonedWallToUtc(today + ' 19:00', TZ));
const estPub = slotCtx.albumFotoEstado(UID, '/media/foto-publicada.jpg', TZ);
ok(estPub.estado === 'salio', 'estado D4: published → «salio»');
try { db.close(); } catch (e) {}
fs.rmSync(SLOT_TMP, { recursive: true, force: true });

/* ---------- 8. Boot aislado ---------- */
console.log('— 8. boot —');
let expressOk = false;
try { require.resolve('express', { paths: [__dirname] }); expressOk = true; } catch (e) { expressOk = false; }
(async () => {
  if (!expressOk) {
    console.log('  (boot omitido: express no resuelve en este árbol)');
  } else {
    const PORT = 18962;
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-a-mejoras-inicio-'));
    const srvProc = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), OPENAI_API_KEY: '' }, stdio: 'ignore' });
    const pid = srvProc.pid;
    console.log('  boot PID: ' + pid);
    const BASE = 'http://127.0.0.1:' + PORT;
    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
    const getText = async (p) => { const r = await fetch(BASE + p, { headers: { 'User-Agent': 'lote-a-mejoras-inicio/1.0' } }); return { status: r.status, body: await r.text() }; };
    const api = async (cookie, method, p, body, raw) => {
      const headers = { Cookie: cookie || '' };
      let b;
      if (raw) { headers['Content-Type'] = 'image/png'; b = raw; }
      else if (body !== undefined) { headers['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
      const r = await fetch(BASE + p, { method, headers, body: b });
      let data = null;
      try { data = await r.json(); } catch (e) {}
      return { status: r.status, data, rawHeaders: r.headers };
    };
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); try { const v = await getText('/api/version'); up = v.status === 200; } catch (e) {} }
    ok(up, 'boot levanta (PID ' + pid + ')');
    if (up) {
      const ver = JSON.parse((await getText('/api/version')).body);
      ok(ver.build === '20261105-v825', '/api/version 20261105-v825 (estampado por el re-estampador)');
      const appS = await getText('/app.js?v=559');
      ok(appS.status === 200 && md5(appS.body) === md5(fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8')), 'app.js?v=559 servido = árbol');
      ok(appS.body.includes('pz-hoy-hoy') && appS.body.includes('pzUsarFotoAbrir'), 'servido: posteo de hoy + usar-foto presentes');
      ok(!appS.body.includes('data-tab="estrategia"'), 'servido: sin pestaña Estrategia');
      const stS = await getText('/styles.css?v=20261211');
      ok(stS.status === 200 && md5(stS.body) === md5(fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8')), 'styles?v=20261211 servido = árbol');
      ok(stS.body.includes('.pz-hoy-hoy{') && stS.body.includes('.pz-nivel-posty{'), 'servido: clases nuevas del lote en el CSS');
      const idx = await getText('/?cb=lote-a-mejoras-inicio');
      ok(idx.body.includes('app.js?v=559') && idx.body.includes('styles.css?v=20261211'), 'index ES servido ?v=557 + styles?v=20261211');
      const idxEn = await getText('/en/?cb=lote-a-mejoras-inicio');
      ok(idxEn.status === 200 && idxEn.body.includes('styles.css?v=20261211'), 'index EN servido styles?v=20261211');
      // Sin sesión: 401 en los endpoints nuevos.
      ok((await api('', 'GET', '/api/album')).status === 401, 'sin sesión: GET /api/album → 401');
      ok((await api('', 'GET', '/api/album/libres')).status === 401, 'sin sesión: GET /api/album/libres → 401');
      ok((await api('', 'POST', '/api/album/1/armar', {})).status === 401, 'sin sesión: POST /api/album/:id/armar → 401');
      ok((await api('', 'POST', '/api/posts/1/usar-foto', {})).status === 401, 'sin sesión: POST /api/posts/:id/usar-foto → 401');
      // Registro + sesión.
      const rr = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'lote-a-boot@example.com', password: 'test1234', business_name: 'Café Aroma Test' }) });
      const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
      const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
      ok(rr.status === 200 || rr.status === 201, 'registro → ' + rr.status);
      ok(cookie.length > 0, 'registro: sesión en cookie');
      // Subida de foto al álbum + dedupe por hash (la misma foto 2 veces = 1 fila).
      const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const up1 = await api(cookie, 'POST', '/api/album/photo', undefined, PNG1);
      ok(up1.status === 200 && up1.data && up1.data.ok === true, 'subida foto → 200 ok (vino ' + up1.status + ')');
      const assetId = up1.data && up1.data.id;
      ok(typeof assetId === 'number' && assetId > 0, 'subida foto: id de asset ' + assetId);
      ok(up1.data && up1.data.kind === 'photo', 'subida foto: kind photo');
      const alb1 = await api(cookie, 'GET', '/api/album');
      ok(alb1.status === 200 && alb1.data && Array.isArray(alb1.data.photos) && alb1.data.photos.length === 1, 'álbum: 1 foto tras la primera subida');
      ok(alb1.data && alb1.data.photos[0] && alb1.data.photos[0].estado === 'esperando', 'álbum: la foto nace con estado «esperando» (sin posteo)');
      ok(alb1.data && alb1.data.photos[0] && alb1.data.photos[0].id === assetId, 'álbum: la foto es la subida (mismo id)');
      const up2 = await api(cookie, 'POST', '/api/album/photo', undefined, PNG1);
      ok(up2.status === 200 && up2.data && up2.data.id === assetId, 'dedupe: la misma foto 2 veces devuelve EL MISMO id (sin gemela)');
      const alb2 = await api(cookie, 'GET', '/api/album');
      ok(alb2.data && alb2.data.photos.length === 1, 'dedupe: el álbum sigue con 1 foto (la gemela de distinto path no existe)');
      // Libres + armar (sin clave OpenAI: el endpoint se alcanza y frena en sin-ia).
      const lib = await api(cookie, 'GET', '/api/album/libres');
      ok(lib.status === 200 && lib.data && Array.isArray(lib.data.libres) && lib.data.libres.length === 1, 'libres: 1 foto libre');
      ok(lib.data && lib.data.libres[0] && lib.data.libres[0].id === assetId, 'libres: la libre es la subida');
      ok(lib.data && lib.data.libres[0] && typeof lib.data.libres[0].cuando === 'string' && lib.data.libres[0].cuando.length > 0, 'libres: la foto trae cuándo se envió («' + (lib.data.libres[0] && lib.data.libres[0].cuando) + '»)');
      const armar = await api(cookie, 'POST', '/api/album/' + assetId + '/armar', {});
      ok(armar.status === 400 && armar.data && armar.data.error === 'sin-ia', 'armar sin clave OpenAI → 400 sin-ia (el endpoint se alcanza; slot+borrador se cubren en VM §7, la caption necesita la clave)');
      const uf404 = await api(cookie, 'POST', '/api/posts/99999/usar-foto', { preview: true });
      ok(uf404.status === 404, 'usar-foto con posteo inexistente → 404 (vino ' + uf404.status + ')');
      // La carta semanal ya no se puede refrescar.
      const ref = await api(cookie, 'POST', '/api/analysis/refresh', {});
      ok(ref.status === 410, 'carta: POST /api/analysis/refresh → 410 (vino ' + ref.status + ')');
    }
    srvProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1500));
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { alive = false; }
    ok(!alive, 'boot muerto tras SIGTERM por PID exacto (' + pid + ')');
    const portFree = await new Promise((res) => { const s = http.get({ host: '127.0.0.1', port: PORT, path: '/api/version' }, () => res(false)); s.on('error', () => res(true)); });
    ok(portFree, 'puerto ' + PORT + ' libre tras matar el boot');
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\ntest-lote-a-mejoras-inicio: ${pass} ok, ${fail} mal`);
  if (fail) console.log('fallos: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
