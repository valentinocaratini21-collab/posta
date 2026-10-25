'use strict';
/* test-showcase-pages.js — Vidriera permanente de /p/<slug>.
 *
 * Las homes imprimen postycommunitymanager.com/p/<slug> como link de bio de
 * cada perfil de ejemplo (ES: LP_PROFILES en public/app.js · EN: tarjetas en
 * public/en/index.html). Esos slugs no son perfiles de clientes: la ruta
 * /p/:slug los resuelve desde showcase-pages.js. Este test exige:
 *   1. TODO slug impreso por las homes está en SHOWCASE_PAGES.
 *   2. Cada ejemplo tiene name/user y ≥3 imágenes que EXISTEN en public/.
 *   3. server.js consulta SHOWCASE_PAGES[slug] dentro del handler /p/:slug
 *      (después del miss de perfil real, antes del 404).
 *
 * Uso: node test-showcase-pages.js   (desde la raíz del repo)
 */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const root = __dirname;
const { SHOWCASE_PAGES } = require(path.join(root, 'showcase-pages.js'));
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const enHome = fs.readFileSync(path.join(root, 'public', 'en', 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

const printed = new Set();
// ES: el dataset de perfiles soñados imprime link: '<slug>'.
for (const m of appJs.matchAll(/link: '([a-z0-9-]+)'/g)) printed.add(m[1]);
// EN: las tarjetas prerenderizadas imprimen la URL completa.
for (const m of enHome.matchAll(/postycommunitymanager\.com\/p\/([a-z0-9-]+)/g)) printed.add(m[1]);

console.log(`— slugs impresos por las homes: ${printed.size}`);
ok(printed.size >= 37, `se esperaban ≥37 slugs impresos (hay ${printed.size})`);
for (const slug of printed) {
  const sc = SHOWCASE_PAGES[slug];
  ok(!!sc, `slug impreso sin página de vidriera: ${slug}`);
  if (!sc) continue;
  ok(!!sc.name && !!sc.user, `${slug}: name/user presentes`);
  ok(Array.isArray(sc.imgs) && sc.imgs.length >= 3, `${slug}: ≥3 imágenes (hay ${sc.imgs ? sc.imgs.length : 0})`);
  for (const img of sc.imgs || []) {
    ok(img.startsWith('/'), `${slug}: imagen con ruta absoluta ${img}`);
    ok(fs.existsSync(path.join(root, 'public', img)), `${slug}: la imagen existe en public${img}`);
  }
}
// Ningún slug de vidriera sobra sin imprimirse (el mapa no acumula basura).
for (const slug of Object.keys(SHOWCASE_PAGES)) {
  ok(printed.has(slug), `slug en SHOWCASE_PAGES que ninguna home imprime: ${slug}`);
}
// Cableado en server.js: require + consulta dentro del handler, antes del 404.
ok(serverJs.includes("require('./showcase-pages')"), 'server.js requiere showcase-pages');
const handlerAt = serverJs.indexOf("app.get('/p/:slug'");
const branchAt = serverJs.indexOf('SHOWCASE_PAGES[slug]');
ok(handlerAt > -1 && branchAt > handlerAt, 'la rama de vidriera vive dentro del handler /p/:slug');
const notFoundAt = serverJs.indexOf("res.status(404);", handlerAt);
ok(branchAt > -1 && (notFoundAt === -1 || branchAt < notFoundAt + 4000), 'la rama de vidriera precede al 404 del handler');

console.log(`\ntest-showcase-pages: ${okN} ok, ${failN} fallas`);
process.exit(failN ? 1 : 0);
