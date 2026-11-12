// test-lote-l5-menus-cuerpo.js — LOTE L5 PELAR-MENÚS-CUERPO.
// El digest ingiere rótulos de sección del cuerpo del sitio como si
// fueran productos, y después la estrella del dueño puede «validarse»
// contra un rótulo (límite asentado de L3). Remedio estructural: pelar
// los menús-cuerpo en el camino de ingesta — tiles de categoría que
// viven en el cuerpo como links de navegación interna — sin tocar la
// carta real de un restaurante (la clase `menu` a secas sigue sin
// pelarse: una carta ES contenido).
// Autónomo (patrón de las suites del repo): fixture real, sin red ni
// claves. Se corre desde la raíz del árbol a probar (release/):
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-l5-menus-cuerpo.js
// Cubre: (A) estático + estampado, (B) fixture veja-store.com real:
// «projet» 174 → 4 (los 4 son contenido editorial real, no menú),
// tiles 25 → 3 sin texto, servicios sin rótulos, digest con estrella
// null y sin validar «PROJET», (C) unidades de isNavTileAnchor,
// (D) fixture restaurante: la carta NO se pela, el tile de categoría
// SÍ, (E) no-tocar: cromo clásico + clase menu + junk headings,
// (F) boot local /api/version v972 5/5. Estampado provisional:
// BUILD v972. (El preparador re-numera; app.js NO se toca en este
// lote: sin bump de ?v=, el index NO va en el push.)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';

const ROOT = process.cwd();
// La DB de los requires va a un DATA_DIR temporal: no ensuciar el árbol.
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'l5-suite-'));
process.env.DATA_DIR = tmpData;
try { require('module').Module._initPaths(); } catch (e) {}

const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const weSrc = fs.readFileSync(path.join(ROOT, 'web-extract.js'), 'utf8');
const indexEs = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const indexEn = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const stylesSrc = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

const webExtract = require(path.join(ROOT, 'web-extract.js'));
const cd = require(path.join(ROOT, 'client-digest.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; failed.push(name); console.log('  FAIL -', name, extra ? '(' + extra + ')' : ''); }
}
function count(re, src) { return (src.match(re) || []).length; }
const hasStr = (list, v) => (list || []).includes(v);

(async () => {
  // ---------- A) Estático + estampado ----------
  console.log('== A) estampado ==');
  ok(count(/20261105-v972/g, serverSrc) === 1, 'BUILD v972 x1 solo en server.js', count(/20261105-v972/g, serverSrc));
  ok(count(/20261105-v971/g, serverSrc) === 0, 'sin restos de v971 en server.js');
  ok(count(/20261105-v972/g, appJs) === 0, 'sin BUILD en app.js (no se toca)');
  // app.js NO se toca: sin bump de ?v= — el index ES queda en el valor heredado (v971).
  ok(count(/app\.js\?v=672/g, indexEs) === 1, 'index ES sigue app.js?v=672 (SIN bump)', count(/app\.js\?v=672/g, indexEs));
  ok(count(/app\.js\?v=673/g, indexEs) === 0, 'index ES sin ?v=673 (no se bumpea lo que no se toca)');
  ok(count(/styles\.css\?v=20261270/g, indexEs) === 1, 'index ES styles?v=20261270 sin cambio');
  ok(count(/styles\.css\?v=20261270/g, indexEn) === 1, 'index EN styles?v=20261270 sin cambio');
  ok(count(/app\.js\?v=/g, indexEn) === 0, 'index EN sin app.js?v=');
  ok(weSrc.includes('isNavTileAnchor'), 'web-extract.js trae isNavTileAnchor');
  ok(weSrc.includes('LOTE L5'), 'web-extract.js trae el comentario LOTE L5');
  ok(weSrc.includes('nouveaut'), 'NAV_JUNK_H cubre nouveautés (FR)');

  // ---------- B) Fixture veja-store.com real ----------
  console.log('== B) fixture veja-store.com real ==');
  const vejaHtml = fs.readFileSync(path.join(ROOT, 'test-fixtures', 'veja-store.html'), 'utf8');
  const stripped = webExtract.stripSiteChrome(vejaHtml);
  ok(count(/projet/gi, vejaHtml) === 177, 'projet en HTML crudo: 177', count(/projet/gi, vejaHtml));
  // 174 → 4: los 4 que quedan son contenido editorial real («projets
  // sociaux» en la descripción del sitio), NO rótulos de menú. Un 0
  // exigiría borrar contenido real de la marca: no se hace.
  ok(count(/projet/gi, stripped) === 4, 'projet en HTML pelado: 174 -> 4', count(/projet/gi, stripped));
  const residuals = [...stripped.matchAll(/projet/gi)].map((m) => stripped.slice(Math.max(0, m.index - 120), m.index + 120));
  ok(residuals.length === 4 && residuals.every((c) => /projets sociaux/i.test(c)), 'los 4 residuales son «projets sociaux» editorial', residuals.map((c) => c.replace(/\s+/g, ' ').slice(0, 60)).join(' | '));
  const tileAnchorsRaw = (vejaHtml.match(/<a\b[^>]*pd__text-over-media[^>]*>/gi) || []).length;
  ok(tileAnchorsRaw === 25, 'tile anchors en crudo: 25', tileAnchorsRaw);
  const tileAnchorsLeft = [...stripped.matchAll(/<a\b[^>]*pd__text-over-media[^>]*>([\s\S]*?)<\/a>/gi)];
  ok(tileAnchorsLeft.length === 3, 'tile anchors en pelado: 3 (solo los sin texto)', tileAnchorsLeft.length);
  ok(tileAnchorsLeft.every((m) => !/<h[123][\s>]/i.test(m[1])), 'los 3 tiles restantes no tienen encabezado (no fugan a servicios)');
  const services = webExtract.servicesFromHtml(vejaHtml, null);
  for (const label of ['HOMME', 'FEMME', 'Enfant', 'RUNNING', 'SANDALES', 'accessoires', 'NOUVEAUTés', 'PROJET']) {
    ok(!hasStr(services, label), 'servicios sin el rótulo ' + label, JSON.stringify(services));
  }
  ok(services.length === 0, 'servicios del fixture: [] (sin modelo real, sin rótulos)', JSON.stringify(services));
  // El digest con los servicios limpios: estrella null y, aunque el
  // dueño declare «PROJET», ya NO se valida (remedio de L3).
  const dClean = cd.buildFromParts({ web: { name: 'Veja EMEA', description: 'VEJA crée des sneakers autrement.', services, siteLang: '' }, catalog: null, feed: null });
  ok((dClean.productos || []).length === 0, 'digest.productos: [] con L5', JSON.stringify(dClean.productos));
  ok(dClean.inferred_star === null || dClean.inferred_star === undefined, 'digest.inferred_star: null con L5');
  dClean.dueno = { estrella: 'PROJET' };
  ok(cd.effectiveStarOf(dClean) === null, 'dueno.estrella=PROJET NO se valida con el digest limpio');
  // Contraste: con los 8 rótulos (v942) el mismo dueño SÍ se validaba.
  const dOld = cd.buildFromParts({ web: { name: 'Veja EMEA', description: 'VEJA crée des sneakers autrement.', services: ['HOMME', 'FEMME', 'Enfant', 'RUNNING', 'SANDALES', 'accessoires', 'NOUVEAUTés', 'PROJET'], siteLang: '' }, catalog: null, feed: null });
  ok((dOld.productos || []).some((x) => (x.nombre || x) === 'PROJET'), 'sin L5, PROJET llegaba a productos', JSON.stringify((dOld.productos || []).map((x) => x.nombre || x)));
  dOld.dueno = { estrella: 'PROJET' };
  const effOld = cd.effectiveStarOf(dOld);
  ok(effOld && effOld.item === 'PROJET', 'sin L5, dueno.estrella=PROJET se validaba (el bug)', JSON.stringify(effOld));

  // ---------- C) Unidades de isNavTileAnchor ----------
  console.log('== C) isNavTileAnchor ==');
  const tileInner = '<div class="media-wrapper"><picture><img src="/img/homme.jpg" alt="Homme"></picture></div><h2>HOMME</h2>';
  ok(webExtract.isNavTileAnchor(tileInner, '/fr_fr/homme', '') === true, 'tile de categoría: se pela');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><h3>Esplar</h3>', '/products/esplar', '') === false, 'link /products/ NUNCA se pela (es contenido)');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><h3>Esplar</h3><span>€120</span>', '/fr_fr/esplar', '') === false, 'producto con precio dentro: no se pela');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><h3>Margherita</h3>', '/carta/margherita', '<span class="price">€12.50</span>') === false, 'producto con precio justo después: no se pela');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><h2>Pastas</h2>', '/carta/pastas', '\n</div>\n<div class="menu">\n<h2>Nuestra carta</h2>\n<div class="dish"><h3>Margherita</h3><p>Tomate</p><span>€12.50</span></div>') === true, 'tile sobre una carta con precios: se pela (el precio es de otro ítem — hay encabezado en medio)');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><h3>Margherita</h3>', '/carta/margherita', 'x'.repeat(200) + '€12.50') === true, 'precio a >150 chars no salva el tile (ventana de 150)');
  ok(webExtract.isNavTileAnchor('<h2>HOMME</h2>', '/homme', '') === false, 'link sin imagen: no se pela');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><span>HOMME</span>', '/homme', '') === false, 'rótulo sin encabezado: no se pela (no fuga a servicios)');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><h2>Descubre la nueva colección de primavera</h2>', '/coleccion', '') === false, 'texto largo (>4 palabras): no se pela');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><h2>Lo mejor de nuestra casa</h2>', '/casa', '') === false, 'texto de 5 palabras: no se pela');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg"><h2>Lookbook</h2>', 'https://externo.com/lookbook', '') === true, 'tile a sitio externo: se pela igual (es navegación, no contenido)');
  ok(webExtract.isNavTileAnchor('<img src="/x.jpg">', '/solo-imagen', '') === false, 'solo imagen sin encabezado ni texto: no se pela');
  ok(webExtract.isNavTileAnchor(tileInner, '', '') === false, 'sin href: no se pela');

  // ---------- D) Fixture restaurante: la carta NO se pela ----------
  console.log('== D) fixture restaurante ==');
  const REST_HTML = `<!DOCTYPE html><html lang="es"><head><title>La Parrilla de Juan</title>
<meta property="og:description" content="Parrilla familiar en Palermo."></head><body>
<nav><a href="/menu">Menú</a><a href="/contacto">Contacto</a></nav>
<main>
<div class="hero-tiles">
<a href="/carta/pizzas" class="tile"><img src="/img/pizzas.jpg" alt="Pizzas"><h2>Pizzas</h2></a>
<a href="/carta/pastas" class="tile"><img src="/img/pastas.jpg" alt="Pastas"><h2>Pastas</h2></a>
</div>
<div class="menu">
<h2>Nuestra carta</h2>
<div class="dish"><h3>Margherita</h3><p>Tomate, mozzarella, albahaca</p><span>€12.50</span></div>
<div class="dish"><h3>Marinara</h3><p>Tomate, ajo, orégano</p><span>€11.00</span></div>
<a href="/carta/margherita"><img src="/img/margherita.jpg" alt="Margherita"><h3>Margherita</h3></a><span class="price">€12.50</span>
<a href="/products/empanada"><img src="/img/empanada.jpg" alt="Empanada"><h3>Empanada</h3></a>
</div>
</main></body></html>`;
  const restStripped = webExtract.stripSiteChrome(REST_HTML);
  ok(restStripped.includes('class="menu"'), 'la clase menu a secas NO se pela');
  ok(restStripped.includes('Margherita') && restStripped.includes('Marinara'), 'los platos de la carta sobreviven al pelado');
  ok(!restStripped.includes('>Pizzas<') && !restStripped.includes('>Pastas<'), 'los tiles de categoría del restaurante SÍ se pelan');
  const restServices = webExtract.servicesFromHtml(REST_HTML, null);
  ok(hasStr(restServices, 'Margherita') && hasStr(restServices, 'Marinara'), 'los platos llegan a servicios', JSON.stringify(restServices));
  ok(hasStr(restServices, 'Empanada'), 'el link /products/ llega a servicios', JSON.stringify(restServices));
  ok(!hasStr(restServices, 'Pizzas') && !hasStr(restServices, 'Pastas'), 'las categorías no llegan a servicios', JSON.stringify(restServices));

  // ---------- E) No-tocar: cromo clásico + junk headings ----------
  console.log('== E) no-tocar ==');
  const CHROME_HTML = `<html><body><header><h2>PROJET</h2></header><nav><a href="/x">Shop</a></nav><main><h1>Esplar</h1><h2>Customer Services</h2></main><footer><h3>Legal</h3></footer></body></html>`;
  const chromeStripped = webExtract.stripSiteChrome(CHROME_HTML);
  ok(!chromeStripped.includes('PROJET'), 'el nav/header se siguen pelando');
  ok(chromeStripped.includes('Esplar'), 'el contenido real sobrevive');
  ok(webExtract.isJunkServiceHeading('novedades') === true, 'junk ES intacto: novedades');
  ok(webExtract.isJunkServiceHeading('New arrivals') === true, 'junk EN intacto: new arrivals');
  ok(webExtract.isJunkServiceHeading('NOUVEAUTés') === true, 'junk FR nuevo: NOUVEAUTés');
  ok(webExtract.isJunkServiceHeading('Esplar') === false, 'Esplar NO es junk');
  const exps = ['stripSiteChrome', 'servicesFromHtml', 'isNavTileAnchor', 'isJunkServiceHeading', 'siteLangFromHtml', 'fetchBusinessSite', 'extractBusinessFacts'];
  for (const e of exps) ok(typeof webExtract[e] === 'function', 'export intacto: ' + e);

  // ---------- F) Boot local /api/version v972 5/5 ----------
  console.log('== F) boot local ==');
  const port = 35007;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l5-boot-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getVersion = () => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/version', timeout: 5000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
  let up = false;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const r = await getVersion();
    if (r.status === 200) { up = true; break; }
  }
  ok(up, 'boot levanta y responde /api/version');
  if (up) {
    let hits = 0;
    for (let i = 0; i < 5; i++) {
      const r = await getVersion();
      try { if (JSON.parse(r.body).build === '20261105-v972') hits++; } catch (e) {}
    }
    ok(hits === 5, '/api/version v972 5/5 (estampado)', 'hits=' + hits);
  }
  const errLines = bootLog.split('\n').filter((l) => /error|Error|EADDRINUSE|Cannot find|MODULE_NOT_FOUND/i.test(l) && !/no se pudo|sin voz/i.test(l));
  ok(errLines.length === 0, 'boot sin errores en el log', errLines.slice(0, 3).join(' | '));
  const pid = child.pid;
  child.kill('SIGTERM');
  await sleep(1500);
  let alive = true;
  try { process.kill(pid, 0); } catch (e) { alive = false; }
  if (alive) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} await sleep(500); }
  ok(!alive || (() => { try { process.kill(pid, 0); return false; } catch (e) { return true; } })(), 'boot matado por PID exacto (' + pid + ')');
  await sleep(500);
  const after = await getVersion();
  ok(after.status === 0, 'puerto ' + port + ' libre tras matar el boot');
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch (e) {}

  // ---------- G) El árbol queda limpio ----------
  ok(!fs.existsSync(path.join(ROOT, 'data')), 'sin release/data/ tras la suite');

  console.log('\ntest-lote-l5-menus-cuerpo: ' + pass + ' ok, ' + fail + ' mal' + (failed.length ? ' — ' + failed.join(', ') : ''));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('SUITE CRASH:', e); process.exitCode = 1; });
