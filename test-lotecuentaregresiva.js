#!/usr/bin/env node
/* LOTE CUENTA-REGRESIVA-CORTADA — test del lote.
 * Decisión Valentino 26/10 («dale! armalo asi»): REEMPLAZA la cuenta
 * regresiva 1/12–31/1. SOLO lista de espera sobre el diseño de /prueba
 * (sin timer, sin posición, sin botón de prueba, sin cara); el último
 * día agrega «Mañana se abre.»; al día siguiente, apertura total.
 * La ventana era 29–31/1/2027 (apertura 1/2/2027) y la movió la decisión
 * de Valentino del 15/11: 28–30/11/2026, apertura 1/12/2026, acompañando
 * el lanzamiento.
 * Verifica sin bootear el servidor: la ventana es una función pura con
 * fecha inyectable (ART), y el gate se prueba con req/res/next falsos.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WL = require('./waitlist');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const DB = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const ES = fs.readFileSync(path.join(__dirname, 'public', 'lista-espera.html'), 'utf8');
const EN = fs.readFileSync(path.join(__dirname, 'public', 'en-lista-espera.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.log('  FAIL - ' + name); }
}
function stripTags(s) { return s.replace(/<[^>]*>/g, ''); }

// ---- 1. La ventana: solo 28–30/11/2026, en días ART (no UTC) ----
// ART = UTC-3. 2026-11-28T03:00Z = 28/11 00:00 ART (abre); 02:00Z = 27/11 23:00 ART (todavía normal).
ok(WL.waitlistPhaseOf(new Date('2026-11-15T12:00:00Z')) === 'normal', 'noviembre antes del 28: web normal');
ok(WL.waitlistPhaseOf(new Date('2026-11-28T02:00:00Z')) === 'normal', '27/11 23:00 ART: todavía normal (no abre por UTC)');
ok(WL.waitlistPhaseOf(new Date('2026-11-28T03:00:00Z')) === 'waitlist', '28/11 00:00 ART: abre la lista de espera');
ok(WL.waitlistPhaseOf(new Date('2026-11-29T15:00:00Z')) === 'waitlist', '29/11: lista de espera');
ok(WL.waitlistPhaseOf(new Date('2026-11-30T12:00:00Z')) === 'waitlist', '30/11: lista de espera');
ok(WL.waitlistPhaseOf(new Date('2026-12-01T02:00:00Z')) === 'waitlist', '30/11 23:00 ART: sigue lista (no cierra por UTC)');
ok(WL.waitlistPhaseOf(new Date('2026-12-01T03:00:00Z')) === 'normal', '1/12 00:00 ART: apertura total, web normal');
ok(WL.waitlistPhaseOf(new Date('2026-12-05T12:00:00Z')) === 'normal', 'después del 1/12: web normal');
ok(WL.waitlistPhaseOf(new Date('2027-01-30T12:00:00Z')) === 'normal', 'la ventana vieja (29–31/1/2027) ya no abre: web normal');
ok(WL.isWaitlistWindow(new Date('2026-11-29T12:00:00Z')) === true, 'isWaitlistWindow true dentro');
ok(WL.isWaitlistWindow(new Date('2026-11-27T12:00:00Z')) === false, 'isWaitlistWindow false fuera');
// Solo el 30/11 lleva «Mañana se abre.»
ok(WL.isWaitlistLastDay(new Date('2026-11-30T12:00:00Z')) === true, '30/11 es el último día');
ok(WL.isWaitlistLastDay(new Date('2026-11-29T12:00:00Z')) === false, '29/11 no es el último día');
ok(WL.isWaitlistLastDay(new Date('2026-12-01T12:00:00Z')) === false, '1/12 no es el último día');
// Emails: mismo patrón que ideas-email.js.
ok(WL.isWaitlistEmail('hola@negocio.com') === true, 'email válido pasa');
ok(WL.isWaitlistEmail('  Hola@Negocio.COM  ') === true, 'email con espacios/mayúsculas pasa (se normaliza en la ruta)');
ok(WL.isWaitlistEmail('sin-arroba') === false, 'sin arroba no pasa');
ok(WL.isWaitlistEmail('a@b.c') === false, 'dominio de 1 letra no pasa');
ok(WL.isWaitlistEmail('') === false, 'vacío no pasa');

// ---- 2. El gate con fecha inyectada ----
function fakeReq(p, session) {
  return { method: 'GET', path: p, session: session || {} };
}
function fakeRes() {
  const r = { headers: {}, body: null, sent: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.send = (b) => { r.body = b; r.sent = true; };
  r.redirect = (u) => { r.body = 'REDIRECT:' + u; r.sent = true; };
  return r;
}
function runGate(gate, req) {
  const res = fakeRes();
  let nexted = false;
  gate(req, res, () => { nexted = true; });
  return { res, nexted };
}
const gate28 = WL.createWaitlistGate({ nowFn: () => new Date('2026-11-28T15:00:00Z') });
const gate30 = WL.createWaitlistGate({ nowFn: () => new Date('2026-11-30T15:00:00Z') });
const gateNormal = WL.createWaitlistGate({ nowFn: () => new Date('2026-11-15T15:00:00Z') });

let t = runGate(gate28, fakeReq('/'));
ok(t.res.sent && stripTags(t.res.body).includes('Posty abre el 1 de diciembre'), 'ventana + visitante + /: sirve la lista ES');
ok(t.res.sent && !t.res.body.includes('<!--WAITLIST_MANANA-->'), '28/11: sin placeholder sin reemplazar');
ok(t.res.sent && !stripTags(t.res.body).includes('Mañana se abre.'), '28/11: sin línea de mañana');
ok(t.res.headers['Cache-Control'] === 'no-cache', 'la página de ventana sale sin caché');
t = runGate(gate30, fakeReq('/'));
ok(t.res.sent && stripTags(t.res.body).includes('Mañana se abre.'), '30/11: agrega «Mañana se abre.»');
t = runGate(gate30, fakeReq('/en/'));
ok(t.res.sent && stripTags(t.res.body).includes('Posty opens on December 1'), 'ventana + visitante + /en/: sirve la lista EN');
ok(t.res.sent && stripTags(t.res.body).includes('Opens tomorrow.'), '30/11 EN: «Opens tomorrow.»');
t = runGate(gate28, fakeReq('/prueba'));
ok(t.res.sent && stripTags(t.res.body).includes('Posty abre el 1 de diciembre'), 'ventana + visitante + /prueba: sin prueba, solo lista');
t = runGate(gate28, fakeReq('/en/prueba'));
ok(t.res.sent && stripTags(t.res.body).includes('Posty opens on December 1'), 'ventana + visitante + /en/prueba: solo lista EN');
t = runGate(gate28, fakeReq('/', { userId: 12 }));
ok(!t.res.sent && t.nexted, 'ventana + cliente con sesión + /: pasa a la app normal');
t = runGate(gateNormal, fakeReq('/'));
ok(!t.res.sent && t.nexted, 'fuera de ventana + visitante + /: pasa a la web normal');
t = runGate(gate28, fakeReq('/app.js'));
ok(!t.res.sent && t.nexted, 'ventana + asset (no listado): pasa, no interfiere');
t = runGate(gate28, { method: 'POST', path: '/', session: {} });
ok(!t.res.sent && t.nexted, 'solo GET se gatea; POST pasa');
t = runGate(gate28, fakeReq('/index.html'));
ok(t.res.sent, 'ventana + /index.html directo: también lista (no se esquiva)');
t = runGate(gate28, fakeReq('/prueba.html'));
ok(t.res.sent, 'ventana + /prueba.html directo: también lista (no se esquiva)');
t = runGate(gate28, fakeReq('/fundadores'));
ok(!t.res.sent && t.nexted, 'ventana + /fundadores: no se toca (fuera del alcance)');

// ---- 3. Las páginas: textos exactos, y nada de lo prohibido ----
for (const s of ['Posty abre el 1 de diciembre', 'Sumate a la lista fundadora y quedate con el precio fundador congelado.', 'Tu email', 'Sumarme a la lista', 'Listo, ya estás en la lista.', 'Revisá tu email', 'Algo falló, probá de nuevo']) {
  ok(ES.includes(s), 'ES contiene: ' + s);
}
for (const s of ['Posty opens on December 1', 'Join the founder list and lock in the founder price.', 'Your email', 'Join the list', "You're on the list.", 'Check your email', 'Something went wrong, try again']) {
  ok(EN.includes(s), 'EN contiene: ' + s);
}
for (const page of [ES, EN]) {
  ok(!/<img/i.test(page), 'sin imágenes (sin cara)');
  ok(!/hero-ava|posty-cara|ai-avatar/i.test(page), 'sin cara de Posty por clase o archivo');
  ok(!/setInterval|countdown|timer/i.test(page), 'sin timer ni cuenta atrás');
  ok(!/posici/i.test(page), 'sin número de posición ni la palabra');
  ok(!/prueba/i.test(page), 'sin botón ni mención de prueba');
  ok(!/og:image/i.test(page), 'sin imagen de share (nada que muestre cara)');
  ok(!/app\.js/i.test(page), 'no carga el bundle de la app');
  ok(!/quedan|lugares|apur/i.test(page), 'sin urgencia inventada');
  ok(page.includes("fetch('/api/waitlist'"), 'el form postea a /api/waitlist');
  ok(page.includes('<!--WAITLIST_MANANA-->'), 'placeholder de mañana presente para inyección del servidor');
  ok(!/fundadores|api\/founders/i.test(page), 'sin conteo ni link a fundadores');
}

// ---- 4. Cableado: gate antes del static, rutas, tabla ----
const gateIdx = SRV.indexOf('createWaitlistGate()');
const staticIdx = SRV.indexOf("express.static(path.join(__dirname, 'public')");
ok(gateIdx > 0 && staticIdx > 0 && gateIdx < staticIdx, 'el gate se registra ANTES del static de public');
ok(SRV.includes("require('./waitlist')"), 'server.js requiere el módulo waitlist');
ok(SRV.includes('registerWaitlistRoutes(app, db)'), 'server.js registra las rutas de la lista');
ok(DB.includes('CREATE TABLE IF NOT EXISTS waitlist'), 'db.js crea la tabla waitlist');
ok(DB.includes('email TEXT UNIQUE NOT NULL'), 'waitlist: email único');
ok(DB.includes("source TEXT NOT NULL DEFAULT 'lista-espera'"), 'waitlist: fuente lista-espera');
const WLJS = fs.readFileSync(path.join(__dirname, 'waitlist.js'), 'utf8');
ok(WLJS.includes("app.post('/api/waitlist'"), 'ruta POST /api/waitlist');
ok(WLJS.includes('INSERT OR IGNORE INTO waitlist'), 'alta con INSERT OR IGNORE (duplicado = already)');
ok(WLJS.includes('already: r.changes === 0'), 'duplicado devuelve already sin revelar conteo');
ok(WLJS.includes("app.get('/lista-espera'") && WLJS.includes("app.get('/en/lista-espera'"), 'rutas directas ES/EN de la lista');
ok(!WLJS.includes('ideas_subscribers'), 'la lista NO mezcla con el newsletter de ideas');
ok(!WLJS.includes("require('nodemailer')") && !WLJS.includes('sendMail') && !WLJS.includes('resend'), 'la lista no envía emails (destino pendiente, no inventado)');
ok(WLJS.includes('const WAITLIST_START_KEY = 20261128;') && WLJS.includes('const WAITLIST_END_KEY = 20261130;') && WLJS.includes('const WAITLIST_LAST_DAY_KEY = 20261130;'), 'ventana 28–30/11/2026 pineada en el módulo (decisión 15/11)');
ok(!WLJS.includes('20270129') && !WLJS.includes('20270131'), 'la ventana vieja de enero no queda en el módulo');

// ---- 5. Intacto: lo que no se toca ----
ok(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').includes('Mi feed queda a medias y no me trae clientes'), 'hero problema-primero intacto en la home');
ok(SRV.includes("app.get('/prueba'"), 'la ruta /prueba sigue registrada (vuelve el 1/12)');
ok(SRV.includes("app.get('/en/prueba'"), 'la ruta /en/prueba sigue registrada');
ok(!APP.includes('waitlist'), 'app.js sin tocar por este lote');
ok(!SRV.includes('WAITLIST_BYPASS') && !WLJS.includes('process.env.WAITLIST'), 'sin atajos por env: la ventana es fecha real, no flag');

console.log('\n' + pass + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
