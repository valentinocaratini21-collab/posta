// test-lote15.js — LOTE 15 · PASADA DE BELLEZA (dirección mock v1 aprobada).
// Node puro, lee el árbol. Uso: node test-lote15.js
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, 'public');
const app = fs.readFileSync(path.join(R, 'app.js'), 'utf8');
const ch = fs.readFileSync(path.join(R, 'chunk-analisis.js'), 'utf8');
const css = fs.readFileSync(path.join(R, 'styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(R, 'en', 'index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('FALLO: ' + name); } };
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const bodyOf = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---- 2 · El jardín de Posty, en vivo ----
t(app.includes(`gzT('El jardín de Posty', "Posty's garden")`), 'jardín: título exacto ES/EN');
t(!app.includes(`<h1>${'${'}gzT('Mi jardín', 'My garden')}</h1><p>`), 'jardín: título viejo fuera del header');
t(app.includes('mx-jardin-vivo') && app.includes('mx-orb-a') && app.includes('mx-orb-b') && css.includes('mx-slowzoom'), 'jardín vivo: contenedor + orbes + zoom lento');
t(app.includes('mx-posty-live') && app.includes('Posty está acá') && app.includes('Posty is here'), 'jardín vivo: Posty presente + etiqueta');
t(app.includes('mx-hero-mosaico') && app.includes('mx-etapa lock') && app.includes('mx-etapa-aca'), 'jardín (LOTE JARDÍN): hero mosaico completo — futuras oscuras con candado, actual marcada (nunca solo tierra)');
t(app.includes('mx-jardin-sentido') && app.includes('Crece con tus semanas publicadas') && app.includes('Grows with your published weeks'), 'jardín: sentido junto al visual');
t(app.includes('function mxPremioCercaHTML') && app.includes('mxPremioCercaHTML(nvP)') && app.includes('Próximo premio') && app.includes('en el Nivel'), 'premio cerca junto al hero, en palabras');
const vistas = bodyOf(app, 'function mxVistasUnAgenteHTML', 'function mxJardinHTML');
t(!vistas.includes('mx-premio-cerca'), 'premio cerca: fuera de las vistas (sin duplicar)');
t(app.includes('MX_ZONAS_PREMIO') && [6, 11, 16, 21, 26, 31, 36, 41, 46].every(n => app.includes(`nv: ${n},`)), 'mapa: 9 zonas premio con niveles reales');
t(app.includes('Brote dorado') && app.includes('Raíz firme') && app.includes('Maestro del jardín') && app.includes('Golden sprout') && app.includes('Garden master'), 'mapa: nombres ES/EN de las zonas');
t(app.includes('function mxJardinMapaHTML') && app.includes('mxJardinMapaHTML(nvP, post50)'), 'mapa: renderizado en el jardín');
t(app.includes('function mxZonaToggle') && app.includes(`onclick="mxZonaToggle(this)"`), 'mapa: tocar zona bloqueada muestra el desbloqueo');
t(app.includes('Después del Nivel 50') && app.includes('Al llegar al Nivel 50 se abren nuevas zonas'), 'mapa: teaser post-50 sin nombres inventados');
t(app.includes('tienePost50') && app.includes('post50.zonas'), 'mapa: con zonas post-50 del servidor no duplica la sección');
t(css.includes('.mx-zona.lock{filter:grayscale(1)'), 'mapa: silueta CSS para lo bloqueado');
const jardinFn = bodyOf(app, 'function mxJardinHTML', 'function mxJardinErrorHTML');
t(!jardinFn.includes('mxBarra('), 'jardín: sin barras dentro (la barrita vive solo en la tira)');
t(app.includes('mx-tira-thumb') && app.includes('jardin-bambu.webp') && app.includes('nvTira < 6'), 'tira (LOTE JARDÍN): bambusal completo en chico, candadito si Nv<6 (brote SUPERSEDED)');
t(app.includes('const MX_BROTE_SVG'), 'brote (LOTE JARDÍN): el glifo queda definido pero sin usos — hero mosaico y tira bambusal lo reemplazan');

// ---- 1+5 · Home pulida / pulido fino ----
t(css.includes('.hf-grid .hf-tile{border-radius:10px'), 'home: tiles con radio del mock');
t(css.includes('.mx-tira-jardin{box-shadow:0 4px 14px'), 'home: sombra suave en la tira');
t(css.includes('.hf-strip{') && css.includes('gap:8px'), 'home: chapita+corazón con gap fijo intacto (Lote 13)');
t(css.includes('.hf-tile.hf-tile-draft{outline:1.5px dashed rgba(39,147,200,.35)'), 'borrador: marca más suave');
t(css.indexOf('.hf-tile.hf-tile-draft{outline:1.5px dashed rgba(39,147,200,.35)') > css.indexOf('.hf-tile.hf-tile-draft{outline:2px dashed #2793C8'), 'borrador: el suave gana por cascada al viejo');
t(css.includes('.bb-bcard{box-shadow:0 4px 14px') && css.includes('.bb-bcard.foco{outline:2px solid #FEC14D'), 'bandeja: sombra + anillo dorado en foco');
t(css.includes('.hf-d-top{box-shadow:0 2px 12px'), 'detalle: sombra en el encabezado');

// ---- 7 · Chat con Posty ----
t(app.includes('<img class="chat-face" src="ai-avatar.png" alt="Posty">') && app.includes('placeholder="escribile a posty…"'), 'chat: cara + minúscula');
t(app.includes('mzChatOpen"><img class="chat-face"') && app.includes('mz-ph-tx">escribile a posty…</span></button>'), 'barra home: cara + minúscula');
t(!app.includes('placeholder="Escribile a Posty'), 'chat: placeholder viejo en mayúscula fuera');

// ---- 8 · Nunca hueco blanco ----
// SUPERSEDED 2/11 (decisión Valentino: solo 3 puntitos, nunca pantalla blanca): el esqueleto con cara + shimmer queda reemplazado por .pz-load.
t(app.includes('pz-load') && app.includes('pz-dot-1') && app.includes('pz-dot-2') && app.includes('pz-dot-3') && css.includes('.pz-load{') && !app.includes('pz-sk-head'), 'carga entre rutas: solo 3 puntitos sobre degradado, sin cara ni shimmer (LOTE CARGA-PUNTITOS)');

// ---- 10 · Celebración al publicar ----
t(app.includes('function pzPubCelebShow') && app.includes('function pzPubCelebMaybe') && app.includes('justPublished'), 'celebración: solo transiciones reales a publicado');
t(app.includes('  try { pzPubCelebMaybe(job); } catch (e) {}') && app.indexOf('  try { pzPubCelebMaybe(job); } catch (e) {}') > app.indexOf('function hfLiveApply'), 'celebración: gancho en el diff vivo de Inicio');
t(app.includes("sessionStorage.getItem('pzPubCeleb')") && app.includes('setTimeout(close, 5000)'), 'celebración: sin spam + auto-cierre');
t(app.includes('pzPubCelebShow') && app.includes("pzSonido('publicar')"), 'celebración: sonido de publicar');

// ---- 11 · Bienvenida mágica ----
t(app.includes('pz-bienv-magia') && app.includes('pzPostPayCard'), 'bienvenida: magia en la tarjeta post-pago');

// ---- 12 · Arranque con Posty ----
t(idx.includes('#posty-boot{position:fixed;inset:0;background:#F4FAFE;'), 'splash: fondo celeste pálido, no blanco');
t(idx.includes('pb-twinkle') && idx.includes('color:#FEC14D;font-size:22px'), 'splash: destellos dorado/celeste');
t(app.includes('bootSplashOff'), 'splash: retiro al pintar la app intacto');

// ---- 13 · Sonidos chiquitos ----
t(app.includes('function pzSonido') && app.includes('[660, 880]') && app.includes('[523, 659, 784]'), 'sonidos: motivos aprobar y publicar');
t(app.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'sonidos: gate reduced-motion');
const sndBody = bodyOf(app, 'function pzSonido', 'function pzMomentoSonido');
t(!sndBody.includes('vibrate'), 'sonidos: nunca vibración fingida');
t(app.includes('[784, 988, 1175]'), 'sonido nivel: tríada ascendente en el momento del avance');
t(cnt(app, "pzSonido('aprobar')") === 3, 'sonido aprobar: 3 ganchos (corazón, doble toque, detalle)');
t(cnt(app, "pzSonido('publicar')") === 1, 'sonido publicar: 1 gancho (celebración)');

// ---- Tiles web: corazón vs detalle ----
const likeBody = bodyOf(app, 'function hfLikeBind', 'function hfDurBind');
t(likeBody.includes('}, true);'), 'tiles web: corazón en captura');
t(likeBody.includes('stopPropagation'), 'tiles web: corazón corta la propagación');
t(app.includes("addEventListener('mousemove'") && app.includes("closest('.hf-strip, [data-hf-like]')") && app.includes('!SCF_PINNED) scfClosePop()'), 'tiles web: pop suprimido sobre la franja y el corazón (LOTE CORAZÓN: corazón arriba a la derecha)');
const detBind = bodyOf(app, 'function hfDetailBind', 'function hfLikeBind');
t(detBind.includes("hover: none") && detBind.includes('< 300') && detBind.includes("closest('[data-hf-like]')"), 'táctil intacto: doble toque 300ms + corazón sin navegar');

// ---- 3 · Estrategia: carta simple sin repeticiones ----
t(ch.includes("if (a) h += `<p class=\"ana-ltr-first\""), 'estrategia: primera línea en ambos caminos con análisis');
t(!ch.includes("if (carta) h += `<p class=\"ana-ltr-first\""), 'estrategia: vieja condición solo-con-carta fuera');
t(ch.includes("(wsOpen ? '' : `<p class=\"ana-intro\">${intro}</p>`)"), 'estrategia: intro genérica suprimida si hay apertura real');
t(cnt(ch, 'const wsOpen =') === 1, 'estrategia: week_summary calculado una sola vez');
t(ch.includes("if (!birth) h += `<div class=\"ana-verdict\""), 'estrategia: veredicto solo si agrega (no en nacimiento)');
t(ch.includes('function anaKitHTML(a, skipActs)') && ch.includes('function anaNormTxt') && ch.includes('anaFindingHTML(f, skipActs)'), 'estrategia: kit filtrado anti-repetición');
t(ch.includes('anaKitHTML(a, wsOpen ? [wsOpen].concat(wsDecs) : wsDecs)'), 'estrategia: filtro aplicado en nacimiento sin carta');
const fullBody = bodyOf(ch, 'function anaFullHTML', 'function anaCartaHTML');
t(fullBody.includes('anaKitHTML(a || {})') && !fullBody.includes('skipActs'), 'estrategia: vista completa sin filtrar (radiografía)');

// ---- Íconos: tuerca real, resto intacto ----
const GEAR = 'M21.9 10.4L21.9 13.6L18.5 16.7L20.1 17.9L17.9 20.1L13.3 19.9L13.6 21.9L10.4 21.9L7.3 18.5L6.1 20.1L3.9 17.9L4.1 13.3L2.1 13.6L2.1 10.4L5.5 7.3L3.9 6.1L6.1 3.9L10.7 4.1L10.4 2.1L13.6 2.1L16.7 5.5L17.9 3.9L20.1 6.1L19.9 10.7Z';
t(cnt(app, GEAR) === 2, 'íconos: tuerca dentada en PZ_IC y en bb-bar');
t(!app.includes('M12 2.8v2.6') && !app.includes('M12 2.8v3'), 'íconos: glifo sol viejo fuera');
t(app.includes('M3 11.5 12 3l9 8.5') && app.includes('M4 20V11M10 20V4'), 'íconos: inicio y estrategia intactos');

// ---- Hero Lote 14 intacto + versiones + censo + M78 ----
t(idx.includes('Mi feed queda a medias y no me trae clientes'), 'hero Lote 14 ES intacto');
t(idxEn.includes('My feed is half-done and brings me no customers'), 'hero Lote 14 EN intacto');
t(idx.includes('app.js?v=355') && idx.includes('styles.css?v=20261074') && idxEn.includes('styles.css?v=20261074'), 'versiones: bumps ?v= aplicados');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'versiones: CHUNK_V v516 (chunk-analisis cache-busteado)');
t(!idxEn.includes('app.js?v='), 'versiones: EN no carga app.js (sin bump fantasma)');
const censo = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
t(censo(srv, 'catsMatch') === 3 && censo(srv, 'week-redo') === 16 && censo(srv, 'first_week') === 3 && censo(srv, '/aprobar') === 16, 'censo server.js intacto 3/16/3/16');
t(censo(app, 'pzGoBack') === 4 && censo(app, 'pz-detalle-setup') === 1 && censo(app, '/aprobar') === 1 && censo(app, 'autofetch') === 0, 'censo app.js intacto 4/1/1/0');
['mxZonaToggle', 'mxPremioCercaHTML', 'mxJardinMapaHTML', 'pzPubCelebShow', 'pzPubCelebMaybe', 'pzSonido'].forEach(f => t(app.includes('function ' + f), 'M78: función nueva definida: ' + f));
t(ch.includes('function anaNormTxt'), 'M78: anaNormTxt definida en chunk-analisis');
t(app.includes('const MX_BROTE_SVG'), 'M78: MX_BROTE_SVG definido');
const srvBase = fs.readFileSync(path.join(__dirname, '..', 'work-base', 'server.js'), 'utf8');
const normSrv = (s) => s.split('\n').filter((l) => !l.includes('const BUILD_ID =')).join('\n');
// LOTE IMPULSAR: server.js cambia además en la zona del Impulsar (endpoint
// /api/destacado/impulsar + endpoint /api/estrategia/mejor-posteo). Se
// descuenta esa zona completa de ambos lados: el resto debe ser idéntico.
const sinZonaImpulsar = (s) => {
  const a = s.indexOf('// Cobro del destacado (Lote 5)');
  const b = s.indexOf("app.get('/api/ads/config'", a);
  if (a === -1 || b === -1) return null;
  return s.slice(0, a) + s.slice(b);
};
// LOTE PULL: server.js cambia además en el endpoint de re-lectura fresca
// (POST /api/home/profile/refresh). Se descuenta esa zona completa del
// lado actual: el resto debe ser idéntico (precedente impulsar).
const sinZonaPull = (s) => {
  const a = s.indexOf('// (LOTE PULL-TO-REFRESH');
  const b = s.indexOf('/* ---------- (Tanda feed 6D', a);
  if (a === -1 || b === -1) return null;
  return s.slice(0, a) + s.slice(b);
};
const baseSin = sinZonaImpulsar(normSrv(srvBase));
const curSin0 = sinZonaImpulsar(normSrv(srv));
// (LOTE FECHA/HORA) La base ya es v524 y CONTIENE la zona Pull: se descuenta
// de ambos lados (el lote Pull la descontaba solo del actual porque su base
// era v523, anterior a Pull). La intención no cambia: fuera de las zonas
// conocidas + BUILD, server.js idéntico.
const baseSin2 = baseSin === null ? null : sinZonaPull(baseSin);
const curSin = curSin0 === null ? null : sinZonaPull(curSin0);
// (LOTE PERFIL) server.js cambia además en la zona del perfil (is_verified
// en el payload de homeProfileFromRead + kit). Se descuentan esos fragmentos
// de ambos lados: el resto debe ser idéntico (precedente impulsar/pull).
// OJO: la línea del kit solo AGREGA ", is_verified: null" a una línea que ya
// existía — borrar la línea entera desplazaría todo; por eso se recorta el
// fragmento y se vuelve a la línea original. La línea del payload sí es
// una línea propia y se filtra entera.
const sinZonaPerfil = (s) => s.split('\n')
  .filter((l) => !l.trim().startsWith('is_verified:'))
  .map((l) => l.replace(', is_verified: null', ''))
  .join('\n');
const baseSin3 = baseSin2 === null ? null : sinZonaPerfil(baseSin2);
const curSin3 = curSin === null ? null : sinZonaPerfil(curSin);
t(baseSin3 !== null && curSin3 !== null && baseSin3 === curSin3, 'server.js: fuera de la zona Impulsar, solo cambia el BUILD_ID (resto idéntico)');
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'server.js: BUILD_ID v521 para verificar el deploy');

console.log(`test-lote15: ${ok} ok / ${bad} fallas`);
process.exit(bad ? 1 : 0);
