// test-lote-hoy-avatar-feed.js — LOTE HOY-AVATAR-FEED (8/11):
// 1) en Hoy la cara de Posty sale del saludo (queda solo en el
//    encabezado); 2) la tarjeta HOY del feed ya no pega texto sobre la
//    foto: la píldora «✦ El próximo» + la hora/cuenta bajan a una banda
//    de caption DEBAJO de la imagen, dentro de la .hf-cell; 3) el
//    encabezado .pz-shell-head queda fijo al scrollear.
// Mock aprobado por Valentino 8/11 20:16 («Si, armalo asi»).
// Paridad ES+EN. La carta velada (Variante B) la SACÓ el lote
// SACAR-CARTA-VELADA (9/11, orden Valentino 00:49): el próximo SIEMPRE
// rinde abierto. Las demás tiles NO se tocan. El texto del saludo queda
// byte-idéntico (lote saludo-hoy-honesto).
// Uso: node test-lote-hoy-avatar-feed.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const http = require('http'), crypto = require('crypto'), os = require('os');
const { spawn } = require('child_process');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
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
// real de esa fecha (DST incluido). Sin horas inventadas: el posteo de
// mañana a las 19:00 es mañana a las 19:00 en la zona de la cuenta.
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
const postHoy = { id: 901, status: 'scheduled', media_type: 'image', image_path: 'foto-hoy.jpg', scheduled_at: isoHoy19, caption: 'En Posty, manejo tu Instagram' };
const postMan = { id: 902, status: 'scheduled', media_type: 'image', image_path: 'foto-man.jpg', scheduled_at: isoMan19, caption: 'Mañana, otro posteo' };

/* ---------- 1. Estático: la carita sale del saludo ---------- */
console.log('— 1. FIX 1 estático: saludo sin carita —');
const speechSrc = extractFn(app, 'function pzHoySpeechHTML');
ok(!!speechSrc, 'extrae pzHoySpeechHTML');
ok(!speechSrc.includes('pz-hoy-speech-ava'), 'fuente: sin pz-hoy-speech-ava en el saludo');
ok(!speechSrc.includes('<img'), 'fuente: 0 <img> en la fila del saludo');
ok(speechSrc.includes('<div class="pz-hoy-speech-row">'), 'fuente: la fila del saludo sigue');
ok(speechSrc.includes('data-pz-hoy-chat="1"'), 'fuente: la burbuja conserva data-pz-hoy-chat');
ok(!css.includes('pz-hoy-speech-ava'), 'CSS: sin regla .pz-hoy-speech-ava');
ok(css.includes('#inicioView .pz-hoy-speech-row{margin-bottom:16px}'), 'CSS: fila del saludo sin flex (solo la burbuja)');
ok(css.includes('#inicioView .pz-hoy-speech{flex:1;min-width:0;width:auto;margin-bottom:0;'), 'CSS: la burbuja intacta (flex:1, sin borde oscuro)');

// El texto del saludo queda byte-idéntico (RS-2 · REGLA 02:40 · autopilot:
// el saludo viejo («Sin tu OK, no sale nada») se fue; el de hoy sale solo
// con aviso 30 min antes, y en manual dice que sale cuando vos lo aprobás).
ok(speechSrc.includes("`Te armé el posteo de hoy. <b>El de hoy sale${hh ? ' a las ' + esc(hh) : ''}</b> — miralo y dale «Dale» si te gusta. Tenés el modo manual: sale cuando vos lo aprobás.`"), 'texto ES hoyPost (rama manual) byte-idéntico (RS-2, sin el absoluto)');
ok(speechSrc.includes("`Te armé el posteo de hoy. <b>Está listo para las${hh ? ' ' + esc(hh) : ''}</b> — miralo y dale «Dale» si te gusta, y queda programado para salir.`"), 'texto ES hoyPost (rama borrador) byte-idéntico (RS-2)');
ok(speechSrc.includes("`Te armé el posteo de hoy. <b>El de hoy sale${hh ? ' a las ' + esc(hh) : ''} solo</b> — miralo si querés, te aviso 30 min antes por si querés frenarlo y te aviso cuando salga.`"), 'texto ES hoyPost (rama autopilot: sale solo) byte-idéntico (PARTE 6)');
ok(speechSrc.includes('Tenés 1 posteo para revisar — miralo en tu feed y dale «Dale» si te gusta.'), 'texto ES pendientes=1 byte-idéntico (autopilot: en tu feed)');
ok(speechSrc.includes('Tenés ${needOK} posteos para revisar — miralos en tu feed y dale «Dale» a los que te gusten.'), 'texto ES pendientes=N byte-idéntico (autopilot: en tu feed)');
ok(speechSrc.includes("`Tu semana ya está aprobada. Posty se ocupa de publicarla.`"), 'texto ES haySemana byte-idéntico');
ok(speechSrc.includes("`¿Armamos tu semana? Contame qué tenés para mostrar.`"), 'texto ES vacío byte-idéntico');
ok(speechSrc.includes("`I put together today's post for you. <b>Today's goes out${hh ? ' at ' + esc(hh) : ''}</b> — take a look and give it a «Publish it» if you like it. You've got manual mode on: it goes out when you approve it.`"), 'texto EN hoyPost (rama manual) byte-idéntico (RS-2, sin el absoluto)');
ok(speechSrc.includes("`I put together today's post for you. <b>It's ready for${hh ? ' ' + esc(hh) : ''}</b> — take a look and give it a «Publish it» if you like it, and it's scheduled to go out.`"), 'texto EN hoyPost (rama borrador) byte-idéntico (RS-2)');
ok(speechSrc.includes("`I put together today's post for you. <b>Today's goes out${hh ? ' at ' + esc(hh) : ''} on its own</b> — take a look if you want, I'll let you know 30 min before in case you want to stop it, and when it's out.`"), 'texto EN hoyPost (rama autopilot: on its own) byte-idéntico (PARTE 6)');

/* ---------- 2. Estático: la banda fuera de .hf-tile ---------- */
console.log('— 2. FIX 2 estático: banda .hf-tile-cap —');
const tileSrc = extractFn(app, 'function homeTileHTML');
ok(!!tileSrc, 'extrae homeTileHTML');
ok(!tileSrc.includes('stripR1'), 'fuente: stripR1 desapareció (era el strip dentro de la tile)');
ok(tileSrc.includes('capR1'), 'fuente: capR1 presente (la banda)');
ok(cnt(tileSrc, /hf-tile-cap/g) === 2, 'fuente (LOTE SACAR-CARTA-VELADA): hf-tile-cap x2 (def capR1: pill + fallback; la rama B velada se fue)');
ok(cnt(tileSrc, /<span class="hf-strip">/g) === 1, 'fuente: UN solo <span class="hf-strip"> en homeTileHTML (el retorno normal; las 2 ramas abiertas ya no lo tienen)');
ok(!tileSrc.includes('hf-cell-velada'), 'fuente (LOTE SACAR-CARTA-VELADA): la carta velada se fue (hf-cell-velada ×0)');
ok(!tileSrc.includes('hf-carta-contenido') && !tileSrc.includes('hf-carta-proximo'), 'fuente (LOTE SACAR-CARTA-VELADA): sin contenido ni píldora de la velada');
ok(tileSrc.includes('data-pz-cuenta-sale'), 'fuente: la cuenta (data-pz-cuenta-sale) sigue en las ramas abiertas');
ok(css.includes('.hf-tile-cap{display:block;padding:6px 2px 2px}'), 'CSS: .hf-tile-cap base presente');
ok(css.includes('.hf-tile-cap .hf-chip{position:static;'), 'CSS: el chip dentro de la banda es estático (no absoluto sobre la foto)');
ok(css.includes('.hf-tile-cap .pz-hoy-cuenta{margin-bottom:0}'), 'CSS: la cuenta en la banda sin margen extra');

/* ---------- 3. Estático: encabezado fijo ---------- */
console.log('— 3. FIX 3 estático: .pz-shell-head sticky —');
// La regla base completa, tal cual quedó parcheada (el sticky va
// ANTES del display:flex, así que no se busca por '.pz-shell-head{display:flex').
const headRuleFull = '.pz-shell-head{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;max-width:560px;margin:0 auto;width:100%;box-sizing:border-box}';
ok(css.includes(headRuleFull), 'CSS: .pz-shell-head sticky top:0 z:50 + blur + padding safe-area + max-width 560 (regla completa)');
const headRule = headRuleFull;
ok(headRule.includes('position:sticky'), 'CSS: .pz-shell-head con position:sticky');
ok(headRule.includes('top:0'), 'CSS: .pz-shell-head con top:0');
ok(headRule.includes('z-index:50'), 'CSS: .pz-shell-head con z-index:50');
ok(headRule.includes('backdrop-filter:blur(12px)'), 'CSS: .pz-shell-head con blur (mismo patrón de las barras fijas)');
ok(headRule.includes('padding:calc(10px + env(safe-area-inset-top)) 14px 10px'), 'CSS: .pz-shell-head conserva su padding con safe-area');
ok(headRule.includes('max-width:560px'), 'CSS: .pz-shell-head conserva su max-width');
ok(css.includes('.pz-shell-head{max-width:920px;padding:10px 24px}'), 'CSS: la regla desktop NO resetea position/background (el sticky aplica también en desktop)');

/* ---------- 4. VM: saludo (0 imgs) + encabezado (1 avatar) ---------- */
console.log('— 4. VM: saludo y encabezado —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const saludoFn = extractFn(app, 'function pzHoySaludoTxt');
const horaFn = extractFn(app, 'function pzHoyHoraCorta');
const headSrc = sliceFn(app, 'function pzShellHeadHTML(tab) {', 'function pzSaludoEscribir() {'); // (lote 9/11: la apertura se sacó, el encabezado lo sigue el saludo)
ok(!!escLine && !!saludoFn && !!horaFn && !!headSrc, 'extrae esc + saludo + hora + pzShellHeadHTML');
const ctx = {
  console,
  ME: { lang: 'es' },
  BB: { estado: { negocio: 'Café Aroma', bandeja_count: 0 } },
  HOME_PROF: { username: 'cafearoma' },
  PROFILE: { ig_username: 'cafearoma' },
  pzIc: () => '[ic]',
};
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + saludoFn + '\n' + horaFn + '\n' + speechSrc + '\n' + headSrc, ctx);
const S = ctx.pzHoySpeechHTML;
const sHoy = S({ hoyPost: { status: 'scheduled', scheduled_at: isoHoy19 }, pendientes: 1, haySemana: true, en: false, tz: TZ });
ok(cnt(sHoy, /<img/g) === 0, 'render saludo: 0 imgs de avatar en la fila');
ok(sHoy.startsWith('<div class="pz-hoy-speech-row">'), 'render saludo: empieza por la fila');
ok(sHoy.includes('Te armé el posteo de hoy. <b>El de hoy sale a las 19:00 solo</b> — miralo si querés, te aviso 30 min antes por si querés frenarlo y te aviso cuando salga.'), 'render saludo ES hoyPost: texto completo byte-idéntico (19:00, autopilot)');
const sPend = S({ hoyPost: null, pendientes: 2, haySemana: true, en: false, tz: TZ });
ok(sPend.includes('Tenés 2 posteos para revisar — miralos en tu feed y dale «Dale» a los que te gusten.'), 'render saludo ES pendientes=2: texto completo (autopilot)');
const sHoyAuto = S({ hoyPost: { status: 'scheduled', approval: 'pending', scheduled_at: isoHoy19 }, pendientes: 1, haySemana: true, en: false, tz: TZ });
ok(sHoyAuto.includes('Te armé el posteo de hoy. <b>El de hoy sale a las 19:00 solo</b> — miralo si querés, te aviso 30 min antes por si querés frenarlo y te aviso cuando salga.'), 'render saludo ES hoyPost autopilot: sale solo (PARTE 6)');
const sSem = S({ hoyPost: null, pendientes: 0, haySemana: true, en: false, tz: TZ });
ok(sSem.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.'), 'render saludo ES haySemana: texto completo');
const sHoyEn = S({ hoyPost: { status: 'scheduled', scheduled_at: isoHoy19 }, pendientes: 1, haySemana: true, en: true, tz: TZ });
ok(sHoyEn.includes("I put together today's post for you. <b>Today's goes out at 07:00 PM on its own</b>"), 'render saludo EN hoyPost: texto completo (07:00 PM, autopilot)');
const H = ctx.pzShellHeadHTML;
const hInicio = H('inicio');
ok(cnt(hInicio, /ai-avatar.png/g) === 1, 'render encabezado(inicio): EXACTAMENTE 1 avatar');
ok(hInicio.includes('Café Aroma') && !hInicio.includes('@cafearoma'), 'render encabezado(inicio): nombre del negocio, SIN @ (PARTE 5)');
ok(H('chat') === '', 'render encabezado(chat): vacío (el chat no se afecta)');

/* ---------- 5. VM: tiles del próximo (ES y EN) ---------- */
console.log('— 5. VM: tiles del próximo, abierta y demás tiles —');
const tileCtx = {
  console,
  ME: { lang: 'es' },
  // window: {} — el slice de mv trae los fallbacks top-level
  // window.__imgFb/__imgFbAnchor/__vidFb (solo se definen, nunca se
  // llaman en el test); sin window el runInContext rompería.
  window: {},
  pcTz: () => TZ,
  pzIc: () => '[ico]',
  pzAprobadoEs: () => false,
  pzDiaEsFutura: () => false,
  hfCoverState: () => ({ has: false }),
  HOME_PIN_SVG: '', HOME_REEL_SVG: '', HOME_CAR_SVG: '',
};
vm.createContext(tileCtx);
const fns = ['pcParseDate', 'pcDayKeyShift', 'pzWhenRelDay', 'pzRitualCuentaTxt', 'pzDiaInicioMs', 'pzTzOffsetMs',
  'hfChipText', 'hfWhenChip', 'hfPlanChip', 'hfTileChipParts',
  'pzHoyHoraCorta', 'pzHoyPillSalida', 'pzHoyCuentaSaleTxt', 'homeTileHTML'];
for (const f of fns) {
  const src = extractFn(app, 'function ' + f);
  ok(!!src, 'extrae ' + f);
  if (src) vm.runInContext(src, tileCtx);
}
vm.runInContext(escLine + '\n' + extractFn(app, 'function mv'), tileCtx);
const T = tileCtx.homeTileHTML;
ok(typeof T === 'function', 'homeTileHTML cargada en VM');

// (a) Rama A — el próximo de un día futuro, ABIERTO (ES).
const tA = T({ kind: 'oculta', openHoy: true, futuro: true, post: postMan }, 0);
ok(!!tA, 'rama A ES: rinde HTML');
ok(!tA.includes('hf-strip'), 'rama A ES: ningún .hf-strip (nada pegado sobre la foto)');
ok(tA.includes('hf-tile-cap'), 'rama A ES: banda .hf-tile-cap presente');
ok(tA.indexOf('hf-tile-cap') > tA.indexOf('hf-carta-destellos'), 'rama A ES: la banda va DESPUÉS de la foto/destellos (debajo de la tile)');
ok(tA.includes('✦ Se postea mañana · 19:00'), 'rama A ES: la banda trae la píldora «✦ Se postea mañana · 19:00»');
ok(tA.includes('data-pz-cuenta-sale'), 'rama A ES: la cuenta viaja con la banda (data-pz-cuenta-sale)');
ok(tA.includes('sale en'), 'rama A ES: la cuenta dice «sale en …» y sigue actualizándose');
ok(tA.includes('hf-carta-destellos'), 'rama A ES: los destellos siguen');
ok(tA.includes('data-post-id="902"'), 'rama A ES: data-post-id + handlers intactos');
ok(tA.includes('<img src="foto-man.jpg"'), 'rama A ES: la imagen sigue siendo la foto real del posteo');

// (b) Rama B — el próximo de HOY (ES): la misma rama única,
// pill de salida + cuenta (LOTE SACAR-CARTA-VELADA 9/11: el chip
// «Hoy · 19:00» y la píldora «✦ El próximo» se fueron con la velada).
const tB = T({ kind: 'oculta', openHoy: true, hoy: true, post: postHoy }, 0);
ok(!!tB, 'rama B ES: rinde HTML');
ok(!tB.includes('hf-strip'), 'rama B ES: ningún .hf-strip');
ok(tB.includes('hf-tile-cap'), 'rama B ES: banda .hf-tile-cap presente');
ok(tB.includes('✦ Se postea hoy · 19:00'), 'rama B ES: la banda trae la píldora «✦ Se postea hoy · 19:00»');
ok(tB.includes('data-pz-cuenta-sale'), 'rama B ES: la cuenta viaja con la banda (data-pz-cuenta-sale)');
ok(tB.includes('sale en'), 'rama B ES: la cuenta dice «sale en …»');
ok(!tB.includes('hf-chip-day'), 'rama B ES: sin chip «Hoy» en la banda (la pill ya dice el día y la hora)');
ok(tB.includes('hf-hoy-badge'), 'rama B ES: la píldora azul HOY sigue arriba a la izquierda');
ok(tB.includes('hf-carta-destellos'), 'rama B ES: los destellos siguen');

// (c) Rama A y B en EN.
tileCtx.ME.lang = 'en';
const tAEn = T({ kind: 'oculta', openHoy: true, futuro: true, post: postMan }, 0);
ok(!tAEn.includes('hf-strip') && tAEn.includes('hf-tile-cap'), 'rama A EN: sin strip, con banda');
ok(tAEn.includes('✦ Goes out tomorrow · 07:00 PM'), 'rama A EN: la banda trae «✦ Goes out tomorrow · 07:00 PM»');
ok(tAEn.includes('goes out in'), 'rama A EN: la cuenta dice «goes out in …»');
const tBEn = T({ kind: 'oculta', openHoy: true, hoy: true, post: postHoy }, 0);
ok(!tBEn.includes('hf-strip') && tBEn.includes('hf-tile-cap'), 'rama B EN: sin strip, con banda');
ok(tBEn.includes('✦ Goes out today · 07:00 PM'), 'rama B EN: la banda trae «✦ Goes out today · 07:00 PM»');
ok(tBEn.includes('goes out in'), 'rama B EN: la cuenta dice «goes out in …»');
ok(!tBEn.includes('hf-chip-day'), 'rama B EN: sin chip «Today» en la banda');
tileCtx.ME.lang = 'es';

// (d) La carta antes velada AHORA rinde ABIERTA (Variante B eliminada).
// (LOTE SACAR-CARTA-VELADA · 9/11 · orden Valentino 00:49: sin velo, nunca.)
const tV = T({ kind: 'oculta', post: postMan }, 0);
ok(!!tV, 'abierta ES: rinde HTML');
ok(!tV.includes('hf-cell-velada'), 'abierta ES: sin celda velada');
ok(tV.includes('<img src="foto-man.jpg"'), 'abierta ES: la foto SE VE');
ok(tV.includes('✦ Se postea mañana · 19:00'), 'abierta ES: la banda trae la píldora «✦ Se postea mañana · 19:00»');
ok(tV.includes('data-pz-cuenta-sale'), 'abierta ES: la cuenta es hasta que SALE');
ok(tV.includes('sale en'), 'abierta ES: la cuenta dice «sale en …»');
ok(!tV.includes('Se destapa'), 'abierta ES: sin «Se destapa»');
ok(!tV.includes('Posty lo está cuidando'), 'abierta ES: sin leyenda');
ok(tV.includes('hf-tile-cap'), 'abierta ES: CON banda (la banda es de las abiertas, y ahora todas lo son)');
ok(!tV.includes('hf-strip'), 'abierta ES: sin strip (nunca lo tuvo)');
ok(tV.includes('data-post-id="902"'), 'abierta ES: data-post-id (abre el detalle, no el ritual)');

// (e) Ningún otro tipo de tile cambió.
const tN = T({ kind: 'post', post: postHoy }, 1);
ok(!!tN, 'tile normal: rinde HTML');
ok(tN.includes('<span class="hf-strip">'), 'tile normal: conserva su <span class="hf-strip">');
ok(tN.includes('<span class="hf-chip-day">Hoy</span>'), 'tile normal: su chapita «Hoy» intacta');
ok(!tN.includes('hf-tile-cap'), 'tile normal: SIN banda (la banda es solo de la HOY)');
ok(tN.includes('data-post-id="901"'), 'tile normal: data-post-id intacto');
const tP = T({ kind: 'post', post: Object.assign({}, postHoy, { status: 'published' }) }, 1);
ok(tP.includes(' pub'), 'tile publicado: clase pub intacta');
ok(tP.includes('<span class="hf-strip">'), 'tile publicado: conserva su strip (vacío, sin chapita)');
ok(!tP.includes('hf-chip'), 'tile publicado: sin chapita (los publicados no llevan)');
ok(!tP.includes('hf-tile-cap'), 'tile publicado: SIN banda');
const tI = T({ kind: 'ig', img: 'ig.jpg', pinned: false, type: 'image' }, 2);
ok(tI.includes('hf-tile pub'), 'tile IG: rinde como siempre (hf-tile pub)');
ok(!tI.includes('hf-tile-cap') && !tI.includes('hf-strip'), 'tile IG: sin banda ni strip');

/* ---------- 6. Boot aislado (solo si express resuelve) ---------- */
console.log('— 6. boot —');
let expressOk = false;
try { require.resolve('express', { paths: [__dirname] }); expressOk = true; } catch (e) { expressOk = false; }
(async () => {
  if (!expressOk) {
    console.log('  (boot omitido: express no resuelve en este árbol)');
  } else {
    const PORT = 18961;
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-hoy-avatar-feed-'));
    const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), OPENAI_API_KEY: '' }, stdio: 'ignore' });
    const pid = srv.pid;
    console.log('  boot PID: ' + pid);
    // (LOTE CHAT-CLICKS · re-pin) Concatenar Buffers y decodificar al
    // final: «b += chunk» parte el UTF-8 multi-byte en los bordes de
    // chunk (el «á» de «probá de nuevo» quedaba «prob��» y el md5 del
    // servido difería del archivo aunque el server sirve byte-idéntico).
    const get = (p) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { 'User-Agent': 'lote-hoy-avatar-feed/1.0' } }, (r) => { const chunks = []; r.on('data', (c) => { chunks.push(c); }); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') })); }).on('error', rej); });
    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); try { const v = await get('/api/version'); up = v.status === 200; } catch (e) {} }
    ok(up, 'boot levanta (PID ' + pid + ')');
    if (up) {
      const ver = JSON.parse((await get('/api/version')).body);
      ok(ver.build === '20261105-v843', '/api/version 20261105-v843 (estampado)');
      const appS = await get('/app.js?v=575');
      ok(appS.status === 200 && md5(appS.body) === md5(fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8')), 'app.js?v=575 servido = árbol');
      ok(!appS.body.includes('pz-hoy-speech-ava'), 'servido: sin carita en el saludo');
      ok(appS.body.includes('hf-tile-cap'), 'servido: banda hf-tile-cap presente');
      const stS = await get('/styles.css?v=20261223');
      ok(stS.status === 200 && md5(stS.body) === md5(fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8')), 'styles?v=20261223 servido = árbol');
      ok(stS.body.includes('.pz-shell-head{position:sticky;top:0;z-index:50'), 'servido: encabezado sticky');
      ok(!stS.body.includes('pz-hoy-speech-ava'), 'servido: sin regla de carita en el CSS');
      const idx = await get('/?cb=lote-hoy-avatar-feed');
      ok(idx.body.includes('app.js?v=575') && idx.body.includes('styles.css?v=20261223'), 'index ES servido ?v=575 + styles?v=20261223');
      const idxEn = await get('/en/?cb=lote-hoy-avatar-feed');
      ok(idxEn.status === 200 && idxEn.body.includes('styles.css?v=20261223'), 'index EN servido styles?v=20261223');
      const del = await new Promise((res) => { const q = http.request({ host: '127.0.0.1', port: PORT, path: '/api/album/1', method: 'DELETE' }, (r) => res(r.statusCode)); q.on('error', () => res(0)); q.end(); });
      ok(del === 401, 'DELETE sin sesión 401 (el servidor es el real)');
    }
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1500));
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { alive = false; }
    ok(!alive, 'boot muerto tras SIGTERM por PID exacto (' + pid + ')');
    const portFree = await new Promise((res) => { const s = http.get({ host: '127.0.0.1', port: PORT, path: '/api/version' }, () => res(false)); s.on('error', () => res(true)); });
    ok(portFree, 'puerto ' + PORT + ' libre tras matar el boot');
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\ntest-lote-hoy-avatar-feed: ${pass} ok, ${fail} mal`);
  if (fail) console.log('fallos: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
