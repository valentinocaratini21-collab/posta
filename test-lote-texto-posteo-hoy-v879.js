// test-lote-texto-posteo-hoy-v879.js — LOTE v879 TEXTO DEL POSTEO DE HOY:
// CORRECCIÓN Valentino 10/11 10:04 («la hora ya lo dice en "para aprobar"»):
// la tarjeta «Por aprobar» ya muestra la hora («hoy · 19:00»), la cuenta
// en vivo «sale en X» y los botones «Dale, publicalo ✓» / «Cambialo» —
// el texto del posteo de hoy está de más y se SACA ENTERO en borrador y
// en manual pendiente (ES + EN): pzHoySpeechHTML rinde '' en esos dos
// estados y el mensaje queda solo con la tarjeta. Autopilot (saleSolo,
// aviso de 30 min) y «ya salió» NO se tocan. La tarjeta no se toca.
// Uso: node test-lote-texto-posteo-hoy-v879.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label + (extra ? ' — ' + String(extra).slice(0, 300) : '')); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;

function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

const TZ = 'America/New_York';
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
const nowNY = nyParts(new Date());
const isoHoy19 = tzISO(nowNY.y, nowNY.m, nowNY.d, 19, 0, TZ);

/* ---------- 1. Estático: los textos viejos salieron de la función ---------- */
console.log('— 1. estático: borrador y manual sin texto —');
const speechSrc = extractFn(app, 'function pzHoySpeechHTML');
ok(!!speechSrc, 'extrae pzHoySpeechHTML');
ok(!speechSrc.includes('Está listo para las'), 'fuente: sin «Está listo para las» (borrador ES salió)');
ok(!speechSrc.includes("It's ready for"), 'fuente: sin «It\'s ready for» (borrador EN salió)');
ok(!speechSrc.includes('Tenés el modo manual'), 'fuente: sin «Tenés el modo manual» (manual ES salió)');
ok(!speechSrc.includes('manual mode on'), 'fuente: sin «manual mode on» (manual EN salió)');
ok(!speechSrc.includes('miralo y dale «Dale» si te gusta'), 'fuente: sin «miralo y dale Dale» en el saludo');
ok(!speechSrc.includes('queda programado para salir'), 'fuente: sin «queda programado para salir» en el saludo');
ok(speechSrc.includes("cuerpo = '';"), 'fuente: borrador y manual ponen cuerpo = \'\' (v879)');
ok(speechSrc.includes('if (!cuerpo) return \'\';'), 'fuente: sin cuerpo no se rinde la burbuja (v879)');
ok(speechSrc.includes('v879'), 'fuente: el cambio lleva su marca v879');
// Autopilot y «ya salió» siguen en la función, byte-idénticos.
ok(speechSrc.includes("`Te armé el posteo de hoy. <b>El de hoy sale${hh ? ' a las ' + esc(hh) : ''} solo</b> — miralo si querés, te aviso 30 min antes por si querés frenarlo y te aviso cuando salga.`"), 'fuente: autopilot ES byte-idéntico (aviso 30 min intacto)');
ok(speechSrc.includes("`I put together today's post for you. <b>Today's goes out${hh ? ' at ' + esc(hh) : ''} on its own</b> — take a look if you want, I'll let you know 30 min before in case you want to stop it, and when it's out.`"), 'fuente: autopilot EN byte-idéntico');
ok(speechSrc.includes('El de hoy ya salió'), 'fuente: «ya salió» ES intacto');
ok(speechSrc.includes("Today's post is already out"), 'fuente: «ya salió» EN intacto');
// Las demás ramas no se tocan.
ok(speechSrc.includes('Tenés 1 posteo para revisar en tu feed.'), 'fuente: rama pendientes intacta');
ok(speechSrc.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.'), 'fuente: rama haySemana intacta');
ok(speechSrc.includes('¿Armamos tu semana? Contame qué tenés para mostrar.'), 'fuente: rama sin semana intacta');
// El «Te armé el posteo de hoy» que queda es solo autopilot (+ la frase
// fija del chat de fotos, otro sitio, intacta): ×2 en todo app.js.
ok(cnt(app, /Te armé el posteo de hoy/g) === 2, 'app.js: «Te armé el posteo de hoy» ×2 (autopilot + chat de fotos)');
ok(cnt(app, /I put together today's post for you/g) === 2, 'app.js: «I put together today\'s post for you» ×2 (autopilot + chat de fotos)');

/* ---------- 2. VM: render por estado ---------- */
console.log('— 2. VM: el mensaje queda solo con la tarjeta —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const horaFn = extractFn(app, 'function pzHoyHoraCorta');
ok(!!escLine && !!horaFn, 'extrae esc + pzHoyHoraCorta');
const ctx = { console, Date, Intl, Math, JSON };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + horaFn + '\n' + speechSrc, ctx);
const S = ctx.pzHoySpeechHTML;
const base = (over) => Object.assign({ pendientes: 1, haySemana: true, en: false, tz: TZ }, over);

// (1) Manual pendiente ES/EN: sin texto — solo la tarjeta (rinde '').
const sMan = S(base({ hoyPost: { status: 'scheduled', approval: 'pending', scheduled_at: isoHoy19 }, manual: true, needOK: 1, schedSolo: 0 }));
ok(sMan === '', 'render manual ES: sin burbuja (rinde \'\')', sMan);
const sManEn = S(base({ hoyPost: { status: 'scheduled', approval: 'pending', scheduled_at: isoHoy19 }, manual: true, needOK: 1, schedSolo: 0, en: true }));
ok(sManEn === '', 'render manual EN: sin burbuja (rinde \'\')', sManEn);
// (2) Borrador ES/EN: sin texto — solo la tarjeta.
const sDraft = S(base({ hoyPost: { status: 'draft', scheduled_at: isoHoy19 }, manual: false }));
ok(sDraft === '', 'render borrador ES: sin burbuja (rinde \'\')', sDraft);
const sDraftEn = S(base({ hoyPost: { status: 'draft', scheduled_at: isoHoy19 }, manual: false, en: true }));
ok(sDraftEn === '', 'render borrador EN: sin burbuja (rinde \'\')', sDraftEn);
// (2b) Borrador en manual: también sin burbuja.
const sDraftMan = S(base({ hoyPost: { status: 'draft', scheduled_at: isoHoy19 }, manual: true }));
ok(sDraftMan === '', 'render borrador en manual: sin burbuja (rinde \'\')', sDraftMan);
// (3) Autopilot ES/EN: texto completo, byte-idéntico.
const sAuto = S(base({ hoyPost: { status: 'scheduled', approval: 'pending', scheduled_at: isoHoy19 }, manual: false }));
ok(sAuto.includes('Te armé el posteo de hoy. <b>El de hoy sale a las 19:00 solo</b> — miralo si querés, te aviso 30 min antes por si querés frenarlo y te aviso cuando salga.'), 'render autopilot ES: texto completo byte-idéntico (19:00, aviso 30 min)', sAuto.slice(0, 300));
const sAutoEn = S(base({ hoyPost: { status: 'scheduled', approval: 'pending', scheduled_at: isoHoy19 }, manual: false, en: true }));
ok(sAutoEn.includes("I put together today's post for you. <b>Today's goes out at 07:00 PM on its own</b> — take a look if you want, I'll let you know 30 min before in case you want to stop it, and when it's out."), 'render autopilot EN: texto completo (07:00 PM, aviso 30 min)', sAutoEn.slice(0, 300));
// (3b) Manual con posteo APROBADO (sale solo): sigue con texto (es autopilot).
const sManAp = S(base({ hoyPost: { status: 'scheduled', approval: 'approved', scheduled_at: isoHoy19 }, manual: true }));
ok(sManAp.includes('solo') && sManAp.includes('30 min antes'), 'render manual aprobado: sale solo, con texto (autopilot)', sManAp.slice(0, 300));
// (4) «Ya salió» ES/EN: intacto.
const sPub = S(base({ hoyPost: { status: 'published', published_at: isoHoy19, scheduled_at: isoHoy19 } }));
ok(sPub.includes('El de hoy ya salió') && sPub.includes('salió a las 19:00') && sPub.includes('Miralo en tu feed.'), 'render ya salió ES: intacto', sPub.slice(0, 300));
const sPubEn = S(base({ hoyPost: { status: 'published', published_at: isoHoy19, scheduled_at: isoHoy19 }, en: true }));
ok(sPubEn.includes("Today's post is already out") && sPubEn.includes('it went out at 07:00 PM'), 'render ya salió EN: intacto', sPubEn.slice(0, 300));
// (5) Las demás ramas siguen rindiendo.
const sPend = S(base({ hoyPost: null, pendientes: 2 }));
ok(sPend.includes('Tenés 2 posteos para revisar'), 'render pendientes=2: intacto', sPend.slice(0, 200));
const sSem = S(base({ hoyPost: null, pendientes: 0, haySemana: true }));
ok(sSem.includes('Tu semana ya está aprobada.'), 'render haySemana: intacto', sSem.slice(0, 200));
const sVacio = S(base({ hoyPost: null, pendientes: 0, haySemana: false }));
ok(sVacio.includes('¿Armamos tu semana?'), 'render sin semana: intacto', sVacio.slice(0, 200));

/* ---------- 3. La tarjeta no se toca ---------- */
console.log('— 3. la tarjeta «Por aprobar» intacta —');
const cardSrc = extractFn(app, 'function pzHoyHoyHTML');
ok(!!cardSrc, 'extrae pzHoyHoyHTML (la tarjeta del posteo de hoy)');
ok(cardSrc.includes('pz-hoy-hoy'), 'tarjeta: clase pz-hoy-hoy intacta');
// Los botones viven en pzHoyCardHTML (la tarjeta principal la usa).
const cardBtnSrc = extractFn(app, 'function pzHoyCardHTML');
ok(!!cardBtnSrc, 'extrae pzHoyCardHTML (los botones de la tarjeta)');
ok(cardBtnSrc.includes('Dale, publicalo ✓'), 'tarjeta: botón «Dale, publicalo ✓» intacto');
ok(cardBtnSrc.includes('Cambialo'), 'tarjeta: botón «Cambialo» intacto');
ok(cardBtnSrc.includes('data-pz-hoy-aprobar') && cardBtnSrc.includes('data-pz-hoy-cambiar'), 'tarjeta: botones con data-pz-hoy-aprobar / data-pz-hoy-cambiar');
const paraSrc = extractFn(app, 'function pzHoyParaAprobarHTML');
ok(!!paraSrc, 'extrae pzHoyParaAprobarHTML (el encabezado «Por aprobar»)');
ok(paraSrc.includes('Por aprobar') || paraSrc.includes('aprobar'), 'tarjeta: encabezado «Por aprobar» intacto');

/* ---------- 4. M78: las funciones que toca el cambio existen ---------- */
console.log('— 4. M78: funciones llamadas desde el cambio, definidas —');
ok(app.includes('function pzHoyHoraCorta'), 'M78: pzHoyHoraCorta definida en app.js');
ok(app.includes('const esc = '), 'M78: esc definida en app.js');
ok(app.includes('function pzHoySpeechHTML'), 'M78: pzHoySpeechHTML definida en app.js');
ok(cnt(app, /function pzHoySpeechHTML/g) === 1, 'M78: pzHoySpeechHTML ×1 (sin duplicado)');

console.log('\nLOTE-TEXTO-POSTEO-HOY-v879: ' + pass + ' ok, ' + fail + ' mal' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
