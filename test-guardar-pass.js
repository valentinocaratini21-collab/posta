'use strict';
/* test-guardar-pass.js — «Guardar contraseña en este dispositivo» (2026-10-25).
 * Un click en la tarjeta de login, sin guardar jamás la contraseña.
 * Lo que se verifica (estático + node --check en el boot test):
 *  1. El checkbox vive en la tarjeta de LOGIN (no en registro), debajo de la
 *     contraseña y antes de «Entrar», con su rótulo ES y EN.
 *  2. La preferencia recordada es SOLO un booleano (posta_remember_pref);
 *     ningún código nuevo escribe una contraseña en localStorage/cookies.
 *  3. El cliente manda remember y condiciona el guardado: sin tilde, quita
 *     la entrada previa del dispositivo y revoca su token.
 *  4. El servidor emite device_token en login solo si remember (clientes
 *     viejos sin el campo siguen como antes); sin remember, la cookie de
 *     sesión pasa a cookie de navegador (sin Expires/Max-Age).
 * Corre con: node test-guardar-pass.js
 */
const fs = require('fs');
const path = require('path');
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const app = read('public/app.js');
const srv = read('server.js');
const idx = read('public/index.html');

section('1 · El checkbox en la tarjeta de login');
ok(app.includes('id="f_remember"'), 'checkbox f_remember presente en authView');
ok(app.includes('Guardar contraseña en este dispositivo'), 'rótulo ES presente');
ok(app.includes('Save password on this device'), 'rótulo EN presente');
ok(/isLogin \? `<label[^`]*f_remember/.test(app), 'el checkbox solo se renderiza en login (rama isLogin)');
ok(app.indexOf('f_remember') > app.indexOf('id="f_pass"'), 'el checkbox va después del campo de contraseña');
ok(app.indexOf('f_remember') < app.indexOf('id="btnAuth"'), 'el checkbox va antes del botón Entrar');

section('2 · Solo se recuerda un booleano, jamás la contraseña');
ok(app.includes("REMEMBER_PREF_KEY = 'posta_remember_pref'"), 'clave de preferencia definida');
ok(app.includes('localStorage.setItem(REMEMBER_PREF_KEY'), 'la preferencia se escribe al cambiar el tilde');
ok(!/localStorage\.setItem\([^)]*password/i.test(app), 'ningún setItem nuevo guarda una contraseña');

section('3 · El cliente condiciona el guardado al tilde');
ok(app.includes('body.remember = rememberOn ? 1 : 0'), 'el login manda remember');
ok(app.includes('if (isReg || rememberOn)'), 'el guardado se condiciona al tilde (registro intacto)');
ok(app.includes("savedAccountsRemove(emL)") && app.includes("device-revoke', { token: prev.token }"), 'sin tilde: quita la entrada previa y revoca su token');

section('4 · El servidor: token solo con tilde, sesión solo de esa visita sin tilde');
ok(srv.includes("remember !== 0 && remember !== false && remember !== '0'"), 'wantRemember: sin campo = como antes');
ok(srv.includes('wantRemember ? deviceTokens.issue(db, user.id) : null'), 'login emite device_token solo con tilde');
ok(srv.includes('req.session.cookie.maxAge = null') && srv.includes('req.session.cookie.expires = false'), 'sin tilde: cookie de navegador (sin Expires/Max-Age)');

section('5 · Versiones');
ok(srv.includes("const BUILD_ID = '20261025-v458';"), 'BUILD v458');
ok(idx.includes('<script src="/app.js?v=289"></script>'), 'app.js ?v=289');

console.log(fails ? `\n${fails} FALLAS` : '\nTODO VERDE');
process.exit(fails ? 1 : 0);
