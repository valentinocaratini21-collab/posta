'use strict';
/*
 * LOTE MONEDA-CARGA — suite estática sobre public/index.html.
 *
 * El rayito girando de la capa de arranque (#posty-boot) se reemplaza
 * por la MONEDA de Bambooty correcta — la dorada con el borde de
 * colores, /bambooty-placa.webp (NO el sello liso sello-bambooty.png) —
 * con el diseño 5 «aro de magia» del mock aprobado por el dueño el
 * 23/11 02:44: la moneda se mece ±6° en 2,6 s dentro de un aro dorado
 * que gira en 7 s, con 4 estrellitas que titilan en 1,8 s y «Cargando…»
 * debajo. Con prefers-reduced-motion la moneda queda quieta.
 *
 * Sección A: el lote. Sección B: los invariantes del lote REGRESO-NEGRO
 * (v1251) que este lote NO debe tocar (modo espera, vigilante de 30 s,
 * «Está tardando…», __pzAppPainted).
 *
 * Uso: node test-lote-moneda-carga.js   (exit 0 = todo ok)
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

let fails = 0, total = 0;
function ok(name, cond) {
  total++;
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('  XX  ' + name); }
}

console.log('A. La moneda en la capa de arranque');
ok('A1 el boot referencia la moneda correcta (/bambooty-placa.webp) en un <img> HTML puro',
  idx.includes('<img class="pz-boot-coinimg" src="/bambooty-placa.webp"'));
ok('A2 el rayo salió de la capa: pz-boot-ray ausente en todo el index',
  !idx.includes('pz-boot-ray'));
ok('A3 la rotación del rayo salió: pz-boot-rot ausente',
  !idx.includes('pz-boot-rot'));
ok('A4 el sello liso NO se referencia: sello-bambooty ausente en todo el index',
  !idx.includes('sello-bambooty'));
ok('A5 el aro existe: .pz-boot-coin::before con el aro dorado',
  idx.includes('.pz-boot-coin::before{') && idx.includes('border:2px solid rgba(254,193,77,.85)'));
ok('A6 el aro gira lento: animation pz-boot-ring 7s linear infinite + keyframes a 360°',
  idx.includes('animation:pz-boot-ring 7s linear infinite') &&
  idx.includes('@keyframes pz-boot-ring{to{transform:rotate(360deg)}}'));
ok('A7 la moneda se mece: animation pz-boot-rock 2.6s ease-in-out infinite',
  idx.includes('animation:pz-boot-rock 2.6s ease-in-out infinite'));
ok('A8 el balanceo es ±6°: keyframes pz-boot-rock con rotate(-6deg) y rotate(6deg)',
  idx.includes('@keyframes pz-boot-rock{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}'));
ok('A9 las 4 estrellitas están en el markup (s1..s4)',
  (idx.match(/class="pz-boot-star s\d"/g) || []).length === 4);
ok('A10 las estrellitas titilan: .pz-boot-star con pz-boot-tw 1.8s y keyframes con opacity/scale',
  idx.includes('animation:pz-boot-tw 1.8s ease-in-out infinite') &&
  idx.includes('@keyframes pz-boot-tw{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}'));
ok('A11 los retardos de las estrellitas son los del mock (.5s / 1s / 1.4s)',
  idx.includes('.pz-boot-star.s2{top:16px;right:14px;animation-delay:.5s}') &&
  idx.includes('.pz-boot-star.s3{bottom:10px;left:12px;animation-delay:1s}') &&
  idx.includes('.pz-boot-star.s4{bottom:20px;right:26px;animation-delay:1.4s}'));
ok('A12 el contenedor del diseño 5 es 150×150 centrado',
  idx.includes('.pz-boot-coin{position:relative;width:150px;height:150px;flex:none;display:flex;align-items:center;justify-content:center}'));
ok('A13 la moneda es redonda de 88×88',
  idx.includes('.pz-boot-coinimg{width:88px;height:88px;border-radius:50%'));
ok('A14 reduced-motion: la moneda queda quieta (animation:none en aro, moneda y estrellitas)',
  idx.includes('@media (prefers-reduced-motion: reduce){.pz-boot-coin::before,.pz-boot-coinimg,.pz-boot-star{animation:none}}'));
ok('A15 «Cargando…» sigue debajo de la moneda (pz-boot-txt tras el elemento de la moneda)',
  idx.indexOf('pz-boot-coin') > -1 &&
  idx.indexOf('<span class="pz-boot-txt">Cargando…</span>') > idx.indexOf('pz-boot-coinimg'));

console.log('B. Las reglas de visibilidad apuntan a la moneda (los dos contextos del boot)');
ok('B1 en contexto app la moneda arranca oculta (la maneja la magia/espera)',
  idx.includes('html.pz-appctx #posty-boot .pz-boot-coin,html.pz-appctx #posty-boot .pz-boot-txt{display:none}'));
ok('B2 en modo espera la moneda se muestra (display:flex)',
  idx.includes('html.pz-appctx #posty-boot.pz-boot-wait .pz-boot-coin{display:flex}'));
ok('B3 durante la magia la moneda está oculta (manda la presentación)',
  idx.includes('#posty-boot.pz-magic .pz-boot-coin,#posty-boot.pz-magic .pz-boot-txt{display:none}'));

console.log('C. Invariantes de REGRESO-NEGRO intactos');
ok('C1 el modo espera sigue definido (#posty-boot.pz-boot-wait)',
  idx.includes('#posty-boot.pz-boot-wait{'));
ok('C2 en espera la línea se ve en blanco sobre el degradé',
  idx.includes('pz-boot-wait .pz-boot-txt{display:block;color:#fff}'));
ok('C3 la salida de los 30 s sigue: «Está tardando… tocá para reintentar»',
  idx.includes('Está tardando… tocá para reintentar'));
ok('C4 el vigilante sigue: window.__pzAppPainted',
  idx.includes('window.__pzAppPainted'));
ok('C5 el estado lento sigue: pz-boot-lento',
  idx.includes('pz-boot-lento'));
ok('C6 la magia sigue: pz-magic + el paso a espera (waitMode agrega pz-boot-wait)',
  idx.includes('pz-magic') && idx.includes("b.classList.add('pz-boot-wait')"));

console.log('');
console.log((total - fails) + '/' + total + ' ok' + (fails ? ' — ' + fails + ' FALLAS' : ''));
process.exit(fails ? 1 : 0);
