// Suite LOTE UNA-SOLA-PRESENTACION (27/11) — arranque = UNA presentación.
// El dueño grabó la apertura (27/11 19:15): suena La Magia, el Inicio
// carga y se ve el posteo de hoy, y ~1 s después VUELVE a aparecer una
// segunda presentación (el cuadro quieto: la cara y «Posty.» sobre el
// degradé) tapando el Inicio, antes del Inicio definitivo. Causa raíz,
// reproducida en local con la cáscara vieja simulada (sello servido
// v1300 + /api/version en v9999): Inicio pinta en el documento 1 → la
// auto-cura del <head> y/o la guarda de versión de app.js recargan en
// caliente → el documento 2 nace con pz_splash_played puesto y la
// activación lo pone en MODO ESPERA, cuyo cuadro ES el cuadro final de
// la magia (cara + palabra, CSS .pz-boot-wait .pzsp-*) = la segunda
// presentación. Este lote: (1) ninguna cura recarga un documento cuya
// app ya pintó — la cura queda marcada en localStorage
// 'posty_cure_next' y la auto-cura la aplica en la próxima apertura
// ANTES del primer paint; (2) el documento que nace de una recarga
// dentro de la misma apertura (rescate de apertura muerta) espera con
// cubierta PLANA: el nodo .pzsp-stage se quita del DOM, sin cara ni
// palabra que mostrar. La Magia (documento 1) y su espera con cuadro
// final quedan intactas.
// Uso: node test-lote-una-sola-presentacion.js [root]
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const es = read('public/index.html');
const en = read('public/en/index.html');
const app = read('public/app.js');
const server = read('server.js');

let ok = 0, fail = 0;
const t = (name, cond) => { if (cond) { ok++; } else { fail++; console.log('FAIL: ' + name); } };
const has = (s, x) => String(s || '').includes(x);
const idx = (s, x) => String(s || '').indexOf(x);

// ---------- A · la cura diferida se aplica antes del primer paint ----------
t('A1 el head lee la marca posty_cure_next', has(es, "localStorage.getItem('posty_cure_next')"));
t('A2 la aplicación es solo en contexto app', idx(es, "localStorage.getItem('posty_cure_next')") > idx(es, "if (window.__pzAppCtx === true) {"));
t('A3 la aplicación recarga con el sello fresco', has(es, "u0.searchParams.set('fresh', pend)") && has(es, 'location.replace(u0.toString())'));
t('A4 la aplicación va ANTES del fetch de la auto-cura', idx(es, "localStorage.getItem('posty_cure_next')") < idx(es, "fetch('/api/version?shellcheck='"));
t('A5 la marca se consume al leerla (sin bucle)', has(es, "localStorage.removeItem('posty_cure_next')"));

// ---------- B · la auto-cura no recarga tras pintar ----------
t('B1 go() corta si la app ya pintó', has(es, 'if (window.__pzAppPainted === true)'));
t('B2 go() diferido marca posty_cure_next con el build vivo', has(es, "localStorage.setItem('posty_cure_next', String(d.build))"));
t('B3 la recarga de rescate sigue existiendo (app sin pintar)', has(es, 'location.replace(u.toString())'));

// ---------- C · el documento recargado no presenta ----------
t('C1 la rama ya-sonó entra a cubierta plana', has(es, "if (sessionStorage.getItem('pz_splash_played') === '1') { plainCover(); return; }"));
t('C2 la rama ya-sonó ya NO entra a modo espera', !has(es, "{ waitMode(); return; }"));
t('C3 plainCover quita el escenario del DOM', has(es, "b.querySelector('.pzsp-stage')") && has(es, 'if (st) st.remove();'));
t('C4 plainCover pone la clase de cubierta plana', has(es, "b.classList.add('pz-boot-plain')"));
t('C5 CSS de la cubierta plana con el degradé de la magia', has(es, '#posty-boot.pz-boot-plain{background:linear-gradient(168deg,#3EA6DB 0%,#2793C8 34%,#1B6FA0 68%,#0A1E33 100%)'));

// ---------- D · la magia del documento 1 queda intacta ----------
t('D1 la activación sigue sonando la magia', has(es, "boot.classList.add('pz-magic')"));
t('D2 el modo espera sigue definido para la espera del documento 1', has(es, 'var waitMode = function ()'));
t('D3 la espera del documento 1 sostiene el cuadro (waitMode en el hold)', has(es, 'else { sp.waiting = true; waitMode(); }'));
t('D4 el CSS del modo espera sigue presente', has(es, '#posty-boot.pz-boot-wait{background:linear-gradient(168deg,#3EA6DB 0%,#2793C8 34%,#1B6FA0 68%,#0A1E33 100%)'));
t('D5 la marca de un solo disparo se sigue escribiendo antes de la animación', has(es, "sessionStorage.setItem('pz_splash_played', '1');"));

// ---------- E · la guarda de versión no recarga tras pintar ----------
t('E1 pzVGuardReload corta si la app ya pintó', has(app, 'if (window.__pzAppPainted === true)'));
t('E2 la guarda diferida marca posty_cure_next', has(app, "localStorage.setItem('posty_cure_next', String(build))"));
t('E3 la guarda sigue recargando sin pintar (rescate intacto)', has(app, 'location.replace(u.toString());\n  return true;'));

// ---------- F · sellos e intactos ----------
t('F1 BUILD_ID v1383 en server.js', has(server, "const BUILD_ID = '20261105-v1383';"));
t('F2 PZ_BUILD v1383 en app.js (paridad)', has(app, "const PZ_BUILD = '20261105-v1383';"));
t('F3 app.js?v=984 en el index ES', has(es, '<script src="/app.js?v=984"></script>'));
t('F4 el index EN no tiene boot (intacto)', !has(en, 'posty-boot'));

console.log(`UNA-SOLA-PRESENTACION: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
