// Suite LOTE APERTURA-SIN-BLANCO (22/11) — la pantalla crema retirada
// (la cara en un círculo blanco sobre #FAF4E8) deja de ser un paso de la
// apertura. Diagnóstico del lote: esa pantalla no la pinta NINGÚN código
// del árbol (no existe en index/app.js/styles/server) — es la imagen de
// arranque que iOS muestra antes del primer byte: la página no declara
// apple-touch-startup-image y iOS, por su documentación, usa «una
// captura de la aplicación web la última vez que se abrió»; en el
// teléfono del dueño esa captura es la apertura retirada. Por eso los
// arreglos dentro del documento (v1210/v1211/v1231) nunca la sacaron.
//
// Afirma, sobre la fuente:
//  A) El index ES declara las imágenes de arranque de iOS: una por clase
//     de teléfono (retrato), incluida la del dueño (430x932 @3), y cada
//     archivo existe con los píxeles exactos de su nombre.
//  B) El lienzo nace con el degradé de la magia: el <head> trae el fondo
//     sobre html.pz-appctx ANTES de la hoja externa y del bloque del
//     boot — el primer byte ya es la apertura en contexto app.
//  C) El manifest ya no ofrece un fondo casi blanco a los sistemas que
//     generan la pantalla de arranque desde él (Android/Chrome).
//  D) La pantalla retirada sigue muerta en el código: ni su color ni la
//     cara vieja en el boot; la magia asentada queda intacta.
//  E) Sellos: BUILD_ID = PZ_BUILD (paridad) y el ?v= de app.js se movió
//     del de la base.
// La verificación de frames en navegador (etapa del sistema + documento,
// muestreo de píxeles por frame) corre con qa/frames.py del scratch del
// lote: prístino reproduce el frame crema del dueño y el release no
// muestra crema ni blanco en ninguna etapa.
// Uso: node test-lote-apertura-sin-blanco.js [root]
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const es = read('public/index.html');
const en = read('public/en/index.html');
const app = read('public/app.js');
const server = read('server.js');
const styles = read('public/styles.css');
const manifest = JSON.parse(read('public/manifest.json'));

let ok = 0, fail = 0;
const t = (name, cond) => { if (cond) { ok++; } else { fail++; console.log('FAIL: ' + name); } };
const has = (s, x) => String(s || '').includes(x);

function jpegSize(buf) {
  // SOF0/SOF2: dimensiones reales del JPEG sin decodificarlo.
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xC0 || m === 0xC2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD9)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

// ---------- A · imágenes de arranque de iOS ----------
const links = [...es.matchAll(/<link rel="apple-touch-startup-image" href="(\/splash-(\d+)x(\d+)\.jpg)" media="([^"]+)"/g)];
t('A1 el index ES declara 11 imágenes de arranque', links.length === 11);
const owner = links.find((m) => m[1] === '/splash-1290x2796.jpg');
t('A2 la clase del teléfono del dueño (430x932 @3) está declarada',
  !!owner && has(owner[4], 'device-width: 430px') && has(owner[4], 'device-height: 932px') && has(owner[4], '-webkit-device-pixel-ratio: 3'));
let allDims = true, allPortrait = true;
for (const m of links) {
  const p = path.join(root, 'public', m[1].slice(1));
  if (!fs.existsSync(p)) { allDims = false; break; }
  const sz = jpegSize(fs.readFileSync(p));
  if (!sz || sz.w !== Number(m[2]) || sz.h !== Number(m[3])) { allDims = false; break; }
  if (!has(m[4], 'orientation: portrait')) allPortrait = false;
}
t('A3 cada imagen existe y sus píxeles son los de su nombre', allDims);
t('A4 todas las declaraciones son de retrato', allPortrait);
t('A5 el index EN no declara imágenes de arranque (la app abre desde la cáscara ES; el EN es la landing)', !has(en, 'apple-touch-startup-image'));

// ---------- B · el lienzo nace con el degradé ----------
const GRAD = 'linear-gradient(168deg,#3EA6DB 0%,#2793C8 34%,#1B6FA0 68%,#0A1E33 100%)';
const stylePos = es.indexOf('html.pz-appctx{background:' + GRAD + '}');
t('B1 el <head> pinta el degradé de la magia sobre html.pz-appctx', stylePos > 0);
t('B2 esa regla va ANTES de la hoja externa styles.css', stylePos > 0 && stylePos < es.indexOf('<link rel="stylesheet" href="/styles.css'));
t('B3 esa regla va DESPUÉS del script que marca .pz-appctx (la clase ya está puesta cuando aplica)', stylePos > es.indexOf("classList.add('pz-appctx')"));
t('B4 esa regla va ANTES del bloque del boot (que vive al final del body)', stylePos > 0 && stylePos < es.indexOf('<div id="posty-boot"'));
t('B5 el degradé es exactamente el de la magia asentada (el mismo string del boot)', (es.match(/linear-gradient\(168deg,#3EA6DB 0%,#2793C8 34%,#1B6FA0 68%,#0A1E33 100%\)/g) || []).length >= 3);

// ---------- C · manifest ----------
t('C1 manifest.background_color es el azul de marca (ya no el casi-blanco #F2F9FD)', manifest.background_color === '#2793C8');
t('C2 manifest.theme_color intacto', manifest.theme_color === '#2793C8');
t('C3 el resto del manifest no se movió (start_url, display, nombre)', manifest.start_url === '/#/app' && manifest.display === 'standalone' && manifest.short_name === 'Posty');

// ---------- D · la pantalla retirada sigue muerta; la magia intacta ----------
for (const [name, src] of [['index ES', es], ['index EN', en], ['app.js', app], ['styles.css', styles], ['server.js', server]]) {
  t('D-sin-crema en ' + name + ' (#FAF4E8 no existe en el árbol)', !has(src, '#FAF4E8') && !has(src, '#faf4e8'));
}
const bootDiv = (es.match(/<div id="posty-boot"[\s\S]*?<\/div>\s*<style>/) || [''])[0];
t('D1 el boot no contiene la cara vieja (ai-avatar)', !!bootDiv && !has(bootDiv, 'ai-avatar'));
t('D2 la magia asentada queda intacta (cara verdadera, palabra, 4 estrellitas)',
  has(es, '<img src="/posty-splash-cara.webp"') && has(es, '<div class="pzsp-word">Posty<span class="pzsp-dot">.</span></div>') && (es.match(/class="pzsp-star"/g) || []).length === 4);
t('D3 la activación sigue siendo solo contexto app y un solo disparo (v1231 intacto)',
  has(es, "sessionStorage.getItem('pz_splash_played') === '1'") && has(app, 'pzAperturaShellVieja'));

// ---------- E · sellos ----------
const buildSrv = (server.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildPz = (app.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
t('E1 paridad BUILD_ID = PZ_BUILD', !!buildSrv && buildSrv === buildPz);
const vq = (es.match(/src="\/app\.js\?v=(\d+)"/) || [])[1];
t('E2 el ?v= de app.js se movió del de la base v1241 (871)', !!vq && vq !== '871');
t('E3 styles?v= sin tocar en ambos índices (el lote no toca styles.css)',
  has(es, '/styles.css?v=20261322') && has(en, '/styles.css?v=20261322'));

console.log('APERTURA-SIN-BLANCO: ' + ok + ' ok · ' + fail + ' MAL');
process.exit(fail ? 1 : 0);
