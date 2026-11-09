// test-lote-hoy-rediseno.js — LOTE HOY-REDISEÑO v810 (PROVISIONAL):
// la pantalla Hoy en UN solo fondo continuo (sale el panel pálido
// cortado a mitad de pantalla), perfil FINO (avatar + nombre + handle
// en una fila, stats en su propia fila en línea, sin los íconos de
// compartir/ajustes duplicados) y el saludo como mensaje de Posty
// (burbuja sola desde HOY-AVATAR-FEED · 8/11: la carita salió del saludo;
// el encabezado ya identifica a Posty). Los datos, textos y acciones NO
// cambian: solo
// la presentación. Mock aprobado por Valentino 8/11.
// Límites: v807 YA aterrizó antes que este lote (segmentador fuera,
// botón verde btn-publish); el texto del saludo es del v806; la
// píldora de racha, del v808.
// Uso: node test-lote-hoy-rediseno.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;

function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

/* ---------- 1. Fondo único: el panel claro sale, el shell queda ---------- */
console.log('— 1. fondo único (sin panel cortado) —');
ok(css.includes('#inicioView.hf-wrap{background:transparent}'), 'el wrap de Inicio es transparente (el panel claro sale)');
ok(css.indexOf('#inicioView.hf-wrap{background:transparent}') > css.indexOf('#inicioView.hf-wrap{background:radial-gradient'), 'el override va DESPUÉS de la regla 5259 del panel (gana por orden)');
ok(css.includes('#inicioView.hf-wrap{background:radial-gradient'), 'la regla 5259 del panel sigue presente (las suites glass la afirman)');
ok(/\.bb-app[^{]*\{[^}]*#9ED6F4/.test(css), 'shell R0 intacto: degradado cielo con #9ED6F4');
ok(css.includes('LOTE HOY-REDISEÑO v810'), 'bloque del lote presente en styles.css');

/* ---------- 2. Perfil fino ---------- */
console.log('— 2. perfil fino (sin íconos duplicados, stats en línea) —');
const hh = extractFn(app, 'function homeHeadHTML');
ok(!!hh, 'extrae homeHeadHTML');
ok(app.includes('headIcons: false'), 'inicioView ya NO pide los íconos en el perfil');
ok(!app.includes('headIcons: !HF_VISITOR'), 'el viejo headIcons: !HF_VISITOR no queda');
ok(hh.includes('<div class="hf-who">'), 'el prow trae columna .hf-who (nombre + handle junto al avatar)');
ok(hh.includes('const titleTxt = name || user;'), 'título = nombre visible (handle como fallback)');
ok(hh.includes("const handleTxt = (user && name && name.toLowerCase() !== user.toLowerCase()) ? '@' + user : '';"), 'handle en sublínea con @ solo si difiere del nombre');
const ret = hh.slice(hh.indexOf('return `<div class="hf-head">'));
const prow = ret.slice(ret.indexOf('<div class="hf-prow">'), ret.indexOf('${stats.length'));
ok(prow.includes('hf-who') && !prow.includes('hf-stats'), 'el prow trae avatar + nombre/handle; las stats quedan fuera');
ok(ret.includes('</div>\n    ${stats.length'), 'las stats rinden DESPUÉS del cierre del prow (su propia fila)');
ok(css.includes('#inicioView .hf-who{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px}'), 'CSS: .hf-who en columna junto al avatar');
ok(css.includes('#inicioView .hf-stats{display:flex;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid rgba(10,30,51,.08)}'), 'CSS: stats en su propia fila con separador');
ok(css.includes('#inicioView .hf-stat{display:flex;align-items:baseline;gap:4px;padding:0}'), 'CSS: stat en línea (número + etiqueta lado a lado)');
ok(css.includes('#inicioView .hf-stat b{display:inline;font-size:15px}'), 'CSS: número del stat en línea, 15px');

// Render real de homeHeadHTML (como el perfil de Valentino).
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const pzDecEnt = extractFn(app, 'function pzDecEnt');
const pzIsIgTitleBio = extractFn(app, 'function pzIsIgTitleBio');
ok(!!escLine && !!pzDecEnt && !!pzIsIgTitleBio, 'extrae esc + pzDecEnt + pzIsIgTitleBio');
const ctx = { console, pzIc: (n) => '<i data-ic="' + n + '"></i>' };
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + pzDecEnt + '\n' + pzIsIgTitleBio + '\n' + hh, ctx);
const H = ctx.homeHeadHTML;
const val = { username: 'posty.communitymanager', name: 'Posty', pic: 'x.jpg',
  posts_count: 14, followers: 8, following: 1, is_verified: true };
const h = H(Object.assign({}, val), '', { splitHead: true, headIcons: false });
ok(h.includes('<div class="hf-user">Posty'), 'título = nombre visible («Posty»), no el handle');
ok(h.includes('<div class="hf-name">@posty.communitymanager</div>'), 'sublínea = @handle');
ok(h.includes('<div class="hf-stat"><b>14</b><span>publicaciones</span></div>'), 'stat en línea: 14 publicaciones');
ok(h.includes('<div class="hf-stat"><b>8</b><span>seguidores</span></div>'), 'stat en línea: 8 seguidores');
ok(h.includes('<div class="hf-stat"><b>1</b><span>seguido</span></div>'), 'stat en línea: 1 seguido (singular)');
ok(h.indexOf('<div class="hf-stats">') > h.indexOf('<div class="hf-name">'), 'las stats rinden DESPUÉS del nombre (su propia fila)');
ok(!h.includes('hf-head-icons') && !h.includes('data-hf-pact'), 'sin íconos en el perfil (headIcons: false)');
const hIc = H(Object.assign({}, val), '', { splitHead: true, headIcons: true });
ok(hIc.includes('data-hf-pact="share"') && hIc.includes('data-hf-pact="settings"'), 'con headIcons:true la función sigue rindiendo los íconos (no se rompió)');
const hDup = H({ username: 'cafe', name: 'cafe', pic: 'x.jpg', posts_count: 3, followers: 2, following: 1 }, '', { splitHead: true });
ok(hDup.includes('<div class="hf-user">cafe') && !hDup.includes('<div class="hf-name">'), 'nombre == handle: sin sublínea duplicada');
const hNoName = H({ username: 'cafe', pic: 'x.jpg', posts_count: 3 }, '', { splitHead: true });
ok(hNoName.includes('<div class="hf-user">cafe') && !hNoName.includes('<div class="hf-name">'), 'sin nombre: el título sigue siendo el handle, sin sublínea');
const hNoUser = H({ name: 'X', pic: 'x.jpg', posts_count: 1, followers: 2 }, '', { splitHead: true, racha: 5, headIcons: true });
ok(typeof hNoUser === 'string' && !hNoUser.includes('hf-user') && !hNoUser.includes('hf-racha'), 'sin usuario: ni línea hf-user ni fila de racha (loteperfil C6)');
const hEn = H(Object.assign({}, val), '', { splitHead: true, en: true });
ok(hEn.includes('<span>posts</span>') && hEn.includes('<span>followers</span>') && hEn.includes('<span>following</span>'), 'EN: etiquetas de stats en inglés');

/* ---------- 3. El saludo como mensaje de Posty ---------- */
console.log('— 3. saludo como mensaje (burbuja sola — HOY-AVATAR-FEED) —');
const speech = extractFn(app, 'function pzHoySpeechHTML');
ok(!!speech, 'extrae pzHoySpeechHTML');
ok(speech.includes('<div class="pz-hoy-speech-row">'), 'el saludo se envuelve en .pz-hoy-speech-row');
ok(!speech.includes('pz-hoy-speech-ava'), 'sin carita en el saludo (HOY-AVATAR-FEED: la cara vive solo en el encabezado)');
ok(speech.includes('data-pz-hoy-chat="1"'), 'el botón conserva data-pz-hoy-chat (abre el chat)');
ok(!speech.includes('<span class="pz-hoy-saludo">'), 'el saludo YA NO está en su span (murió en v846)');
ok(!speech.includes('pz-hoy-nota'), 'sin nota (chat-mejora)');
ok(speech.includes('if (hoyPost)') && speech.includes('else if (pendientes > 0)') && speech.includes('else if (haySemana)'), 'las 4 ramas del cuerpo siguen (hoyPost / pendientes / haySemana / else)');
const spRule = css.slice(css.indexOf('#inicioView .pz-hoy-speech{'), css.indexOf('}', css.indexOf('#inicioView .pz-hoy-speech{')) + 1);
ok(css.includes('#inicioView .pz-hoy-speech-row{margin-bottom:16px}'), 'CSS: fila del mensaje sin flex (solo la burbuja)');
ok(!css.includes('pz-hoy-speech-ava'), 'CSS: sin regla de carita (HOY-AVATAR-FEED)');
ok(spRule.length > 0 && !spRule.includes('2px solid #0A1E33') && spRule.includes('border:1px solid rgba(255,255,255,.75)'), 'CSS: la burbuja ya NO tiene borde oscuro 2px navy (borde blanco suave)');
ok(css.includes('#inicioView .pz-hoy-card,#inicioView .pz-hoy-conserje{margin-bottom:14px}'), 'CSS: ritmo de espaciado de las secciones Hoy (PARTES 1/2: upload/semana/vacio salieron de la regla)');

// Render real de pzHoySpeechHTML (texto intacto, solo presentación).
// (v846) pzHoySaludoTxt murió: la burbuja ya no saluda por hora.
const hora = extractFn(app, 'function pzHoyHoraCorta');
ok(!app.includes('function pzHoySaludoTxt'), 'pzHoySaludoTxt murió en v846');
ok(!!hora, 'extrae pzHoyHoraCorta');
vm.runInContext(hora + '\n' + speech, ctx);
const S = ctx.pzHoySpeechHTML;
const hoyPost = { scheduled_at: new Date(Date.now() + 3600 * 1000).toISOString() };
const sHoy = S({ hoyPost, pendientes: 1, haySemana: true, en: false, tz: 'America/New_York' });
const sPend = S({ hoyPost: null, pendientes: 2, haySemana: true, en: false, tz: 'America/New_York' });
const sSem = S({ hoyPost: null, pendientes: 0, haySemana: true, en: false, tz: 'America/New_York' });
const sVacio = S({ hoyPost: null, pendientes: 0, haySemana: false, en: false, tz: 'America/New_York' });
ok(sHoy.startsWith('<div class="pz-hoy-speech-row">'), 'render: el mensaje empieza por la fila');
ok(!sHoy.includes('<img'), 'render: sin carita (0 imgs en la fila del saludo)');
ok(sHoy.includes('data-pz-hoy-chat="1"') && sHoy.includes('<b>'), 'render hoyPost: botón + hora en negrita');
ok(sHoy !== sPend && sPend !== sSem && sSem !== sVacio, 'las 4 ramas rinden textos distintos (el texto sigue variando por estado)');
ok(!sHoy.includes('¡Buen día!') && !sHoy.includes('¡Buenas tardes!') && !sHoy.includes('¡Buenas noches!'), 'render: la burbuja ya no saluda (v846)');
const sHoyEn = S({ hoyPost, pendientes: 1, haySemana: true, en: true, tz: 'America/New_York' });
ok(sHoyEn !== sHoy, 'EN rinde distinto de ES');
ok(!sHoy.includes('pz-hoy-nota') && !sHoyEn.includes('pz-hoy-nota'), 'render: sin nota en ES ni EN');

/* ---------- 4. NO tocado: los lotes en vuelo ---------- */
console.log('— 4. límites (segmentador, botón verde, saludo, racha) —');
ok(!app.includes('pz-hoy-seg') && app.includes("hoySegHTML = '';"), 'el segmentador ya no está (v807 lo sacó antes que este lote)');
const card = extractFn(app, 'function pzHoyCardHTML');
ok(card.includes('btn-publish') && card.includes('data-pz-hoy-aprobar') && card.includes('Dale, publicalo ✓'), 'el botón «Dale, publicalo ✓» ya es verde btn-publish (v807, aterrizó antes que este lote)');
ok(!card.includes('22C55E'), 'la tarjeta del posteo no trae verde');
const lotCss = css.slice(css.indexOf('LOTE HOY-REDISEÑO v810'));
ok(!lotCss.includes('22C55E'), 'el bloque del lote no pone verde en ningún lado (eso es v807)');
ok(!app.includes("('🔥 ' + (rachaN === 1 ? (en ? '1 day' : '1 día') : rachaN + (en ? ' days' : ' días')))"), 'la píldora de racha salió (PARTE 5; era v808/v815)');
ok(srv.includes("const BUILD_ID = '20261105-v846'"), 'server.js con BUILD v846 estampado (preparador)');

/* ---------- 5. Censo ---------- */
console.log('— 5. censo —');
ok(cnt(srv, /catsMatch/g) === 3, 'server catsMatch 3');
ok(cnt(srv, /week-redo/g) === 16, 'server week-redo 16');
ok(cnt(srv, /first_week/g) === 3, 'server first_week 3');
ok(cnt(srv, /\/aprobar/g) === 17, 'server /aprobar 17');
ok(cnt(app, /pzGoBack/g) === 6, 'app pzGoBack 6');
ok(cnt(app, /pz-detalle-setup/g) === 1, 'app pz-detalle-setup 1');
ok(cnt(app, /\/aprobar/g) === 1, 'app /aprobar 1');
ok(cnt(app, /autofetch/g) === 0, 'app autofetch 0');
ok(cnt(app, /pcDayKeyShift/g) === 6, 'app pcDayKeyShift 6');

console.log('\nTOTAL ' + pass + ' asserts, ' + fail + ' fallos' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
