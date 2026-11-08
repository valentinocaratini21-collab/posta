// test-loteajusteslimpio.js — LOTE AJUSTES-LIMPIO (piezas 1-7), SIN PUSH.
// Node puro, lee el árbol. Uso: node test-loteajusteslimpio.js
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const cnt = (s, sub) => (s.split(sub).length - 1);
const chk = fs.readFileSync(path.join(__dirname, 'public/chunk-ajustes.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idx = (s, sub) => s.indexOf(sub);

// ---------- PIEZA 1 + 5: menú + detalle + orden principal ----------
// Orden en el template: menú (#ajMenu, filas data-ajnav en orden) → detalle
// (#ajDetail: referidos → notif → negocio → plan → auto → conex → marca →
// pagina → avanzado) → caja Gesty. Salir es fila del menú.
// ACTUALIZADO (lote ajustes-carpetas 7/11): el botón «Más ajustes» y su
// desplegable salen; cada sección abre su propia pantalla de detalle.
const iNotif = idx(chk, 'id="ajsec-notif"');
const iRef = idx(chk, 'id="ajsec-referidos"');
const iNeg = idx(chk, 'id="ajsec-negocio"');
const iPlan = idx(chk, 'id="ajsec-plan"');
const iAuto = idx(chk, 'id="ajsec-auto"');
const iConex = idx(chk, 'id="ajsec-conex"');
const iMarca = idx(chk, 'id="ajsec-marca"');
const iPag = idx(chk, 'id="ajsec-pagina"');
const iAv = idx(chk, 'id="ajsec-avanzado"');
const iMenu = idx(chk, 'id="ajMenu"');
const iDetail = idx(chk, 'id="ajDetail"');
const iSalir = idx(chk, 'id="btnLogoutAj"');
const iGz = idx(chk, 'id="gzAjustesBox"');
t(iRef > 0 && iNotif > 0 && iNeg > 0 && iPlan > 0 && iAuto > 0 && iConex > 0 && iMarca > 0 && iPag > 0 && iAv > 0 && iMenu > 0 && iDetail > 0 && iSalir > 0, 'todas las tarjetas existen');
t(iRef < iNotif && iNotif < iNeg && iNeg < iPlan && iPlan < iAuto && iAuto < iConex && iConex < iMarca && iMarca < iPag && iPag < iAv, 'orden de detalle: referidos → notif → negocio → plan → auto → conex → marca → pagina → avanzado');
t(iMenu < iDetail && iSalir > iMenu && iSalir < iDetail, 'menú antes que el detalle; Salir es fila del menú');
t(cnt(chk, 'id="ajsec-referidos"') === 1, 'referidos NO duplicado (1 sola tarjeta)');
t(iDetail < iGz, 'caja Gesty después del detalle');
t(chk.indexOf('id="ajsec-mas2"') === -1 && chk.indexOf('id="ajsec-mas2-wrap"') === -1, 'sin botón ni bloque «Más ajustes»');
// En la pantalla de detalle siguen: auto, conex, marca, pagina, avanzado.
for (const id of ['auto', 'conex', 'marca', 'pagina', 'avanzado']) {
  const i = idx(chk, 'id="ajsec-' + id + '"');
  t(i > iDetail && i < iGz, 'ajsec-' + id + ' sigue en la pantalla de detalle');
}
// Carpetas: lista exacta de plegables; notif y referidos NO se pliegan.
const mFold = chk.match(/const AJ_FOLDABLE = \[([^\]]*)\]/);
t(!!mFold, 'existe AJ_FOLDABLE');
if (mFold) {
  const list = mFold[1];
  for (const id of ['negocio', 'plan', 'auto', 'conex', 'marca', 'pagina']) t(list.includes("'" + id + "'"), 'plegable: ' + id);
  t(!list.includes("'notif'") && !list.includes("'referidos'"), 'notif y referidos NO son plegables');
}
t(chk.includes('function ajFoldInit()'), 'existe ajFoldInit');
t(chk.includes('function ajFoldAbrir('), 'existe ajFoldAbrir');
t(chk.includes("location.hash = '#/app/ajustes'") && chk.includes('data-ajnav'), 'navegación por hash: filas del menú y botón ‹ (sin estado en localStorage)');
t(chk.includes('ajFoldInit()'), 'bindSettings llama a ajFoldInit');
t(chk.includes('ajFoldAbrir(ajDeep)'), 'deep-link abre la pantalla destino');
t(app.includes("ajFoldAbrir('plan')"), 'scroll ?plan=1 abre Mi plan');
// Notificaciones: botón Activar + cartel de error intactos, dentro de notif.
const notifSec = chk.slice(iNotif, iNeg);
t(notifSec.includes('id="btnPushEnable"'), 'botón Activar notificaciones sigue en notif');
t(notifSec.includes('id="pzPushErr"'), 'cartel #pzPushErr sigue junto al botón');
// Menú y su navegación intactos.
t(chk.includes('id="ajMenu"') && chk.includes('id="ajDetail"') && chk.includes('function ajNav(') && chk.includes('id="ajBackBtn"'), 'menú, detalle, navegación y botón ‹ intactos');
t(!chk.includes('id="ajsec-mas2-preview"'), 'fila Cómo me ve la IA eliminada (6/11: vive en Tu negocio)');
// CSS del menú (ACTUALIZADO lote ajustes-carpetas 7/11: el CSS de carpetas
// plegables sale con el pliegue; el menú trae sus propias reglas).
t(css.includes('.ajmenu-row{display:flex;align-items:center;gap:12px'), 'CSS: fila del menú con ícono, título y resumen');
t(css.includes('.ajmenu-h{font-size:11.5px;font-weight:800'), 'CSS: encabezado chico de grupo del menú');
t(css.includes('.ajback{display:inline-flex;align-items:center'), 'CSS: botón ‹ para volver al menú');

// ---------- PIEZA 2: iconos + días ----------
t(cnt(chk, '${esc(title)}') === 0, '0 ocurrencias de esc(title) en Datos de otras fuentes');
t(chk.includes('${title} ${dnaSrcChip(fuentes, field)}'), 'label usa title sin escapar (el icono se renderiza)');
t(chk.includes("esc(field.replace(/_/g, ' ')"), 'título de campo nuevo escapa solo el nombre, no el icono');
t(chk.includes('id="closedDaysRow" style="display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto'), 'fila de días sin wrap, con scroll horizontal');
t(chk.includes('padding:7px 11px;font-size:12.5px;font-weight:700;cursor:pointer;flex:none'), 'botones de día compactos y sin encoger (Dom no se corta)');

// ---------- PIEZA 3: fuera la tarjeta oficina de Ajustes ----------
t(cnt(app, '<h2>Cómo te avisa tu oficina</h2>') === 1, '«Cómo te avisa tu oficina» se RENDERIZA solo en Mi negocio (1 <h2>; el comentario del lote no cuenta)');
t(cnt(app, 'bbAvisosCard') === 0, '0 ocurrencias de bbAvisosCard (la tarjeta no se crea)');
t(app.includes('async function bbAvisosEnAjustes()'), 'bbAvisosEnAjustes sigue definida (no-op, el call-site no rompe)');
t(app.includes('bbAvisosEnAjustes();'), 'call-site de bbAvisosEnAjustes intacto');
t(app.includes('function bbTogglePref(') || app.includes('bbTogglePref('), 'bbTogglePref sigue (lo usa Mi negocio)');
t(app.includes('/api/oficina/push-prefs'), 'endpoint de prefs en servidor sigue (Mi negocio lo lee)');

// ---------- PIEZA 4: fuera Estilos; generación Posty-elige ----------
t(cnt(chk, 'Estilos de tus posteos') === 1, '«Estilos de tus posteos» queda SOLO en un comentario histórico (no en el template)');
t(cnt(chk, 'id="styleGallery"') === 0, '0 div #styleGallery en el template');
t(cnt(chk, 'Tu marca y estilos') === 0, '0 «Tu marca y estilos» (el encabezado ahora es «Tu marca»)');
t(chk.includes('Tu marca</h3>'), 'encabezado «Tu marca» presente');
t(chk.includes('if (!box) return;'), 'styleGalleryLoad hace no-op sin el div (no llama a la API)');
t(cnt(srv, '(LOTE AJUSTES-LIMPIO) Posty elige') === 6, '6 sitios de generación pasan a Posty-elige (semana + 5 picks)');
t(cnt(srv, 'getStyleFavorites(') === 3, 'getStyleFavorites queda SOLO en definición + 2 lecturas de API (ninguna generación)');
t(srv.includes('UPDATE settings SET favorite_styles'), 'PUT de favoritos intacto: los guardados se conservan, no se borran');
t(srv.includes("res.json({ ok: true, favorites: getStyleFavorites(req.session.userId) })"), 'GET de favoritos intacto (la API sigue siendo veraz)');

// ---------- PIEZA 6: automático sin overflow, solo controles ----------
// El cierre correcto: entre autoWeekStatus y «Cuando subo fotos» hay un </div>.
const iAutoWeek = idx(chk, 'id="autoWeekStatus"');
const iFotos = idx(chk, 'Cuando subo fotos');
t(iAutoWeek > 0 && iFotos > iAutoWeek, 'bloque automático con autoWeekStatus y Cuando subo fotos');
t(chk.slice(iAutoWeek, iFotos).includes('</div>'), 'la fila de Tu semana se CIERRA antes de Cuando subo fotos (causa del overflow)');
const iBili = idx(chk, 'id="bilingualWeekStatus"');
const finAuto = chk.slice(iBili, iBili + 300);
t(finAuto.includes('</div>\n  </div></div>') && !finAuto.includes('</div>\n    </div>\n  </div></div>'), 'cierre final de automático sin </div> sobrante');
t(chk.includes('id="sftDefaultSel"'), 'select Cuando subo fotos presente');
const iSel = idx(chk, 'id="sftDefaultSel"');
t(chk.slice(Math.max(0, iSel - 200), iSel).includes('flex-wrap:wrap'), 'fila del select con flex-wrap (cinturón a 390px)');
t(chk.slice(iSel, iSel + 300).includes('max-width:100%'), 'select con max-width:100%');
for (const id of ['btnPauseAll', 'btnAutopilotToggle', 'btnAutoWeekToggle', 'btnBilingualWeekToggle', 'sftDefaultSel', 'autopilotInfo']) {
  t(chk.includes('id="' + id + '"'), 'control automático intacto: ' + id);
}
t(!chk.includes('Posty programa y publica tus posteos solo'), 'fuera párrafo Publicación (obvio)');
t(!chk.includes('Posty arma tu semana solo'), 'fuera párrafo Tu semana (obvio)');
t(!chk.includes('nada se crea sin tu toque'), 'fuera párrafo Cuando subo fotos (obvio)');
t(!chk.includes('Para negocios con turistas o clientes en inglés'), 'fuera párrafo dos idiomas (largo)');
t(chk.includes('Lo programado vuelve a borrador y nada sale hasta que reanudes.'), 'Pausar conserva su consecuencia en una línea');
t(chk.includes('No cambia el idioma de la app.'), 'Dos idiomas conserva su aclaración en una línea');

// ---------- PIEZA 7: poda general (ausentes) ----------
const ausentes = [
  'solo cuando importa, nada de ruido',
  'cómo viene tu Instagram y qué ya estoy haciendo por tu negocio',
  'Nunca sale a medias: queda en borrador para que lo mires',
  'Posty inclina todos los posteos a esto — cambialo cuando quieras',
  'Mientras más nos cuentes, mejores ideas creamos por vos',
  'la IA lo usa para crear posteos que venden de verdad',
  'junto con todo tu negocio — un solo guardado para todo',
  'Lo estudio solo para crear posteos que venden.',
  'Tus gustos fijos: lo que me enseñaste en el chat',
  'Acá definís tu logo y tus colores',
  'o elegilos a mano tocando el color o escribiendo su código',
  'no cambia captions, colores ni texto de web/app',
  'Así se ve tu marca en tus posteos',
  'Así se ve tu logo recortado en círculo',
  'Cada persona que la visita conoce Posty',
  'Mostrale tu semana a tu socio o a tu familia',
  'Compartí tus posteos también en TikTok: con tu cuenta conectada',
  'Tu tienda, conectada: Posty lee tu catálogo, tu stock y tus ventas',
  'Uso estos datos para crear posteos que venden de verdad.',
];
for (const s of ausentes) t(!chk.includes(s), 'podado ausente: ' + s.slice(0, 52));
// ---------- PIEZA 7: lo que se conserva (confundiría sin él) ----------
const presentes = [
  'Todavía no activaste las notificaciones en tu celu',
  'tocá Permitir',
  'Te aviso 30 minutos antes',
  'Con código de país (Argentina: 54 9 + tu número)',
  'WhatsApp todavía no está encendido',
  'Si tu primera semana no te convence, te la rehacemos entera, gratis.',
  'Posty inclina todos los posteos a esto.',
  'Se guardan con el botón <b>Guardar</b> de acá abajo.',
  'Si borrás uno, deja de aplicar desde la próxima generación.',
  'Solo lee: nunca toca precios ni stock',
  'Solo letras minúsculas, números y guiones',
  'Aceptamos imagen, PDF o Word.',
  'con 2 alcanza para activar',
  'Aplica a semanas nuevas y regeneraciones',
  'Tocá el rol de cada color para reordenarlos',
  'Respondé las reseñas de tu ficha de Google',
  'Nunca vemos ni guardamos tu contraseña',
  'Relee tu Instagram completo',
  'Si la apagás, tu link muestra',
  'Solo se ven posteos ya publicados — nunca borradores.',
  'Uso estos datos para crear tus posteos.',
  'Los estudiamos para crear ideas que te hagan destacar.',
  '(para programar a la hora de tu país)',
  'Cada domingo a la noche, con el botón para aprobar tu semana en un toque.',
  'Solo cambia el titular dentro de tus posteos.',
  'Cada posteo publicado suma el botón',
  'Posty nunca publica ahí sin que lo pidas.',
  'Posty lee tu catálogo y stock para postear solo lo que tenés.',
  'Tu link para la <b>bio de Instagram</b>: tu negocio y tus posteos ya publicados',
];
for (const s of presentes) t(chk.includes(s), 'conservado: ' + s.slice(0, 52));
// Controles de todas las secciones intactos (solo copy y layout cambiaron).
for (const id of ['btnPushEnable', 'pzPushErr', 'btnPreNotifyToggle', 'btnLetterToggle', 'btnFailToggle', 'btnWaNotifyToggle',
  's_biz', 's_cat', 's_tone', 's_desc', 's_tz', 'closedDaysRow', 'btnSaveProfile',
  'planZone', 'btnPauseAll', 'btnAutopilotToggle', 'btnAutoWeekToggle', 'btnBilingualWeekToggle',
  'btnSaveBrand', 'btnBrandLogo', 's_slug', 'btnSavePage', 'refZone', 'btnLogoutAj']) {
  t(chk.includes('id="' + id + '"'), 'control intacto: ' + id);
}

console.log(`loteajusteslimpio: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
