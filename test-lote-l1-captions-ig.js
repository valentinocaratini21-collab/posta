// test-lote-l1-captions-ig.js — LOTE L1 · REPARAR LA FUENTE DE CAPTIONS DE IG
// Problema: parseEmbedPosts devolvía 0 posteos del embed vivo de instagram.com/veja
// porque Instagram sirve el embed como shell JS sin datos para un UA de navegador
// (0 __typename, 0 display_url, 0 captions). Sin captions, detectBrandLang queda
// ciego y el idioma del posteo cae al del visitante.
// Fix (SOLO demo.js): fetchIgEmbedHtml pide primero el embed con UA de crawler
// (Googlebot), que sirve la variante SSR con los posteos embebidos en el formato
// clásico que ya parsea parseEmbedPosts; si no trae posteos, cae al UA actual.
// parseEmbedPosts NO se toca (su formato es el del SSR). Sin cambios de umbrales
// (v922), sin cambios de fallback (eso es L2), sin tocar server.js ni client-digest.js.
// Corre sin red: fixtures = recortes VERBATIM del embed SSR vivo (12/11 01:5x)
// + prefijo VERBATIM del shell vivo. Se corre desde la raíz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-l1-captions-ig.js
'use strict';

const fs = require('fs');
const path = require('path');
const fa = require('./feed-audit.js');
const demo = require('./demo.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}
const fix = (f) => fs.readFileSync(path.join(__dirname, 'test-fixtures', f), 'utf8');
const demoSrc = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');
const faSrc = fs.readFileSync(path.join(__dirname, 'feed-audit.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const fnBody = (src, name) => {
  const i = src.indexOf('function ' + name);
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 10);
  return j > 0 ? src.slice(i, j) : src.slice(i);
};

async function main() {
  console.log('== A) Estático y cableado ==');
  ok('demo.js trae el UA de crawler (Googlebot)', demoSrc.includes('Googlebot/2.1'), 'sin UA de crawler');
  ok('demo.js define IG_CRAWLER_UA', demoSrc.includes('const IG_CRAWLER_UA'));
  const fetchBody = fnBody(demoSrc, 'fetchIgEmbedHtml');
  ok('fetchIgEmbedHtml existe', fetchBody.length > 0);
  ok('fetchIgEmbedHtml intenta PRIMERO el crawler y LUEGO el UA actual',
    fetchBody.indexOf('IG_CRAWLER_UA') >= 0 && fetchBody.indexOf('needPosts: false') > fetchBody.indexOf('IG_CRAWLER_UA'),
    'orden de intentos');
  ok('el intento crawler exige posteos (needPosts: true)', fetchBody.includes('needPosts: true'));
  ok('el fallback conserva el chequeo de identidad por username', fetchBody.includes('username'));
  ok('embedHtmlHasPosts exportada', typeof demo.embedHtmlHasPosts === 'function');
  ok('fetchIgEmbedHtml sigue exportada', typeof demo.fetchIgEmbedHtml === 'function');
  ok('parseEmbedPosts NO se toca en este lote (feed-audit.js sin Googlebot)', !faSrc.includes('Googlebot'));
  ok('umbrales v922 intactos en detectBrandLang', demoSrc.includes('en >= 3 && en - es >= 2') && demoSrc.includes('es >= 3 && es - en >= 2'));
  ok('server.js sin tocar: BUILD v932 x1', (srvSrc.match(/20261105-v932/g) || []).length === 1, (srvSrc.match(/20261105-v932/g) || []).length);
  ok('sin rastro de v933', !/20261105-v933/.test(srvSrc) && !/20261105-v933/.test(demoSrc));

  console.log('== B) embedHtmlHasPosts (pura) ==');
  ok('SSR veja → true', demo.embedHtmlHasPosts(fix('l1-veja-embed-ssr.html')) === true);
  ok('SSR byredo → true', demo.embedHtmlHasPosts(fix('l1-officialbyredo-embed-ssr.html')) === true);
  ok('shell veja → false', demo.embedHtmlHasPosts(fix('l1-veja-embed-shell.html')) === false);
  ok('comillas planas → true', demo.embedHtmlHasPosts('"__typename":"GraphImage"') === true);
  ok('comillas escapadas → true', demo.embedHtmlHasPosts('\\"__typename\\":\\"GraphVideo\\"') === true);
  ok('GraphSidecar → true', demo.embedHtmlHasPosts('\\"__typename\\":\\"GraphSidecar\\"') === true);
  ok('__typename no-Graph → false', demo.embedHtmlHasPosts('"__typename":"User"') === false);
  ok('vacío → false', demo.embedHtmlHasPosts('') === false);
  ok('null → false', demo.embedHtmlHasPosts(null) === false);

  console.log('== C) Fixtures reales SSR: el parser lee el formato del SSR ==');
  const veja = fa.parseEmbedPosts(fix('l1-veja-embed-ssr.html'));
  ok('veja SSR: 4 posteos top-level', veja.length === 4, veja.length);
  ok('veja: todos con shortcode y fecha', veja.every((p) => p.shortcode && typeof p.taken_at === 'number' && p.taken_at > 0));
  const vejaCaps = veja.map((p) => p.caption).filter(Boolean);
  ok('veja: 4 captions reales', vejaCaps.length === 4, vejaCaps.length);
  ok('veja: primer caption exacto (The Salar, en inglés)',
    vejaCaps[0] === 'The Salar, where outdoor influences meet urban style. Model: @lisaaxlu',
    JSON.stringify(vejaCaps[0]));
  ok('veja: ningún caption con residuo JSON', vejaCaps.every((c) => !/edge_|":\{|count"/.test(c)));
  ok('veja: detectBrandLang solo con captions → en',
    demo.detectBrandLang({ captions: vejaCaps, webText: '', siteLang: '' }) === 'en');
  const byr = fa.parseEmbedPosts(fix('l1-officialbyredo-embed-ssr.html'));
  ok('byredo SSR: 3 posteos top-level', byr.length === 3, byr.length);
  const byrCaps = byr.map((p) => p.caption).filter(Boolean);
  ok('byredo: 3 captions reales', byrCaps.length === 3, byrCaps.length);
  ok('byredo: primer caption real (Constance Tenvik)',
    byrCaps[0].indexOf('Step inside Constance Tenvik') === 0, JSON.stringify((byrCaps[0] || '').slice(0, 60)));
  ok('byredo: detectBrandLang solo con captions → en',
    demo.detectBrandLang({ captions: byrCaps, webText: '', siteLang: '' }) === 'en');
  ok('shell vivo: parseEmbedPosts → 0 (el fallo original)', fa.parseEmbedPosts(fix('l1-veja-embed-shell.html')).length === 0);

  console.log('== D) Caso Veja end-to-end (Q1 del diagnóstico) ==');
  // Inputs reales de la corrida 01:15: captions IG + webText en francés + siteLang ''.
  const webTextFr = 'VEJA crée des sneakers avec du coton bio, du caoutchouc sauvage d’Amazonie et des matières recyclées.\nHOMME\nFEMME\nRUNNING\nPROJET';
  ok('con captions (SSR) + web francés + siteLang vacío → en',
    demo.detectBrandLang({ captions: vejaCaps, webText: webTextFr, siteLang: '' }) === 'en');
  ok('SIN captions (shell, el bug) + web francés + siteLang vacío → null',
    demo.detectBrandLang({ captions: [], webText: webTextFr, siteLang: '' }) === null);
  ok('con captions byredo + web francés → en',
    demo.detectBrandLang({ captions: byrCaps, webText: webTextFr, siteLang: '' }) === 'en');

  console.log('== E) Limpieza ==');
  ok('sin node_modules/ en release/', !fs.existsSync(path.join(__dirname, 'node_modules')));
  // NOTA: requerir demo.js/feed-audit.js CREA release/data/ (demo.js abre la DB
  // al requerir — trampa conocida del tablero). Se borra después de la corrida;
  // no se pincha acá porque la propia suite lo crea.

  console.log('\n== RESULTADO: pass ' + pass + ', fail ' + fail + ' ==');
  process.exit(fail ? 1 : 0);
}
main();
