// test-lote-l2-fallback-idioma.js — LOTE L2 (FALLBACK HONESTO DE IDIOMA).
// Cuando detectBrandLang da null Y el sitio declara un tercer idioma
// (ej. Veja: sitio en francés, <html lang="fr">), el sistema caía en
// silencio al idioma del visitante y el posteo salía en el idioma
// equivocado sin que nadie lo supiera. Ahora: NO genera — pregunta el
// idioma de la marca con un toque (solo en ese caso) y reenvía con
// brand_lang; el siteLang crudo queda registrado como evidencia.
// Autónomo (patrón de las suites del repo): fixtures, sin red ni claves.
// Se corre desde la raíz del árbol a probar (release/):
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-l2-fallback-idioma.js
// Cubre: (A) estático + cableado, (B) resolveBrandLangDecision (tabla),
// (C) siteLangRawFromHtml, (D) reproducción Veja con datos reales,
// (E) pzParseBrandLangAnswer (extraída de app.js), (F) boot local
// /api/version v932 5/5. Estampado por el preparador: BUILD v932.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';

const ROOT = process.cwd();
// La DB del require va a un DATA_DIR temporal: no ensuciar el árbol
// (demo.js abre la DB al hacer require — sin esto crea release/data/).
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-suite-'));
process.env.DATA_DIR = tmpData;
try { require('module').Module._initPaths(); } catch (e) {}

const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const demoSrc = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const weSrc = fs.readFileSync(path.join(ROOT, 'web-extract.js'), 'utf8');
const pruebaSrc = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
const enPruebaSrc = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

const webExtract = require(path.join(ROOT, 'web-extract.js'));
const demo = require(path.join(ROOT, 'demo.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; failed.push(name); console.log('  FAIL -', name, extra ? '(' + extra + ')' : ''); }
}
function count(re, src) { return (src.match(re) || []).length; }
function eq(name, got, want) {
  ok(JSON.stringify(got) === JSON.stringify(want), name, 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}

async function main() {
  // ---------- A) Estático y cableado ----------
  console.log('== A) estático y cableado ==');
  ok(count(/20261105-v932/g, serverSrc) === 1, 'BUILD v932 ×1 en server.js (sin estampar)');
  ok(!/20261105-v933/.test(serverSrc), 'sin rastro de v933');
  ok(typeof demo.resolveBrandLangDecision === 'function', 'demo exporta resolveBrandLangDecision');
  ok(typeof demo.detectBrandLang === 'function', 'demo sigue exportando detectBrandLang');
  // La única vía de decisión en el servidor es el resolver (2 call sites).
  ok(count(/demo\.resolveBrandLangDecision\(\{/g, serverSrc) === 2, 'los 2 call sites usan resolveBrandLangDecision');
  ok(count(/demo\.detectBrandLang\(\{/g, serverSrc) === 0, 'ningún call site llama directo a detectBrandLang');
  ok(count(/falta_idioma_marca: true/g, serverSrc) === 2, 'falta_idioma_marca ×2 (generate + stream)');
  ok(count(/fields\.brand_lang/g, serverSrc) === 2, 'brand_lang leído en las 2 rutas');
  ok(count(/trialDigest\.post_lang_source =/g, serverSrc) === 4, 'post_lang_source asignado ×4 (2 rutas × confirmado/no-confirmado)');
  ok(count(/trialDigest\.site_lang_declared =/g, serverSrc) === 4, 'site_lang_declared asignado ×4');
  ok(count(/console\.log\('\[brand-lang\]'/g, serverSrc) === 2, 'log [brand-lang] ×2 (una por ruta)');
  ok(count(/siteLangRaw: webData && webData\.siteLangRaw/g, serverSrc) === 2, 'siteLangRaw pasado en los 2 call sites');
  // detectBrandLang intacto (pins v922/ingesta).
  eq('detectBrandLang: captions EN → en', demo.detectBrandLang({ captions: ['New drop is here today', 'Shop now with free shipping'], webText: '', siteLang: '' }), 'en');
  eq('detectBrandLang: sin señal → null', demo.detectBrandLang({ captions: [], webText: '', siteLang: '' }), null);
  eq('detectBrandLang: siteLang fr → null (no adivina)', demo.detectBrandLang({ captions: [], webText: '', siteLang: 'fr' }), null);
  // web-extract: crudo expuesto, filtrado intacto.
  ok(typeof webExtract.siteLangRawFromHtml === 'function', 'web-extract exporta siteLangRawFromHtml');
  ok(/siteLangRaw: siteLangRawFromHtml\(html\)/.test(weSrc), 'fetchBusinessSite devuelve siteLangRaw');
  eq('siteLangFromHtml fr → \'\' (sin cambio)', webExtract.siteLangFromHtml('<html lang="fr">'), '');
  eq('siteLangFromHtml en → en (sin cambio)', webExtract.siteLangFromHtml('<html lang="en">'), 'en');
  // Formulario ES.
  ok(/id="fLangWrap"/.test(pruebaSrc), 'prueba.html: picker fLangWrap');
  ok(/id="fLangEn"/.test(pruebaSrc) && /id="fLangEs"/.test(pruebaSrc), 'prueba.html: botones English/Español');
  ok(/falta_idioma_marca/.test(pruebaSrc), 'prueba.html: maneja falta_idioma_marca');
  ok(count(/need_lang/g, pruebaSrc) >= 2, 'prueba.html: camino need_lang');
  ok(/brand_lang/.test(pruebaSrc), 'prueba.html: reenvía brand_lang');
  ok(/btn-ghost/.test(pruebaSrc), 'prueba.html: estilo btn-ghost');
  // Formulario EN (espejo).
  ok(/id="fLangWrap"/.test(enPruebaSrc), 'en-prueba.html: picker fLangWrap');
  ok(/id="fLangEn"/.test(enPruebaSrc) && /id="fLangEs"/.test(enPruebaSrc), 'en-prueba.html: botones English/Español');
  ok(/falta_idioma_marca/.test(enPruebaSrc), 'en-prueba.html: maneja falta_idioma_marca');
  ok(count(/need_lang/g, enPruebaSrc) >= 2, 'en-prueba.html: camino need_lang');
  ok(/brand_lang/.test(enPruebaSrc), 'en-prueba.html: reenvía brand_lang');
  // Chat en la app (tercera entrada a /api/trial/generate).
  ok(count(/PZ_GUEST_LANG_FOR/g, appSrc) >= 6, 'app.js: estado PZ_GUEST_LANG_FOR (declara, setea, rutea, limpia)');
  ok(count(/pzParseBrandLangAnswer/g, appSrc) === 2, 'app.js: pzParseBrandLangAnswer (def + uso)');
  ok(count(/falta_idioma_marca/g, appSrc) === 2, 'app.js: falta_idioma_marca en las 2 funciones guest');
  ok(count(/fd\.append\('brand_lang', brandLang\)/g, appSrc) === 2, 'app.js: brand_lang en los 2 FormData guest');

  // ---------- B) resolveBrandLangDecision: tabla ----------
  console.log('== B) resolveBrandLangDecision ==');
  const R = demo.resolveBrandLangDecision;
  const noSignal = { captions: [], webText: '', siteLang: '', siteLangRaw: '', lang: 'es' };
  let d = R({ ...noSignal, siteLangRaw: 'fr' });
  eq('veja: fr sin señal → needsChoice', { nc: d.needsChoice, cl: d.contentLang, src: d.source, sl: d.siteLangDeclared }, { nc: true, cl: null, src: 'unconfirmed', sl: 'fr' });
  d = R({ ...noSignal, siteLangRaw: 'fr', brandLang: 'en' });
  eq('veja + brand_lang en → en/user', { cl: d.contentLang, nc: d.needsChoice, src: d.source }, { cl: 'en', nc: false, src: 'user' });
  d = R({ ...noSignal, siteLangRaw: 'fr', brandLang: 'ES' });
  eq('brand_lang ES (mayúscula) → es/user', { cl: d.contentLang, src: d.source }, { cl: 'es', src: 'user' });
  d = R({ ...noSignal, siteLangRaw: 'fr', brandLang: 'xx' });
  eq('brand_lang inválido → needsChoice de nuevo', { nc: d.needsChoice, cl: d.contentLang }, { nc: true, cl: null });
  d = R({ ...noSignal, siteLangRaw: 'fr', brandLang: ' fr ' });
  eq('brand_lang con espacios y fr → needsChoice (no es en/es)', { nc: d.needsChoice, cl: d.contentLang }, { nc: true, cl: null });
  d = R({ captions: ['New drop is here today', 'Shop now with free shipping'], webText: '', siteLang: '', siteLangRaw: '', lang: 'es' });
  eq('marca EN por captions → en/detected', { cl: d.contentLang, nc: d.needsChoice, src: d.source }, { cl: 'en', nc: false, src: 'detected' });
  d = R({ captions: ['El nuevo blend ya está aquí hoy', 'Comprá ahora con envío gratis'], webText: '', siteLang: '', siteLangRaw: '', lang: 'en' });
  eq('marca ES por captions → es/detected (aunque el visitante sea en)', { cl: d.contentLang, src: d.source }, { cl: 'es', src: 'detected' });
  d = R({ ...noSignal });
  eq('sin señal ni tercer idioma (es) → fallback visitante es', { cl: d.contentLang, nc: d.needsChoice, src: d.source }, { cl: 'es', nc: false, src: 'visitor-fallback' });
  d = R({ ...noSignal, lang: 'en' });
  eq('sin señal ni tercer idioma (en) → fallback visitante en', { cl: d.contentLang, src: d.source }, { cl: 'en', src: 'visitor-fallback' });
  d = R({ ...noSignal, siteLangRaw: 'de', lang: 'en' });
  eq('sitio de sin señal → needsChoice (no cae al en del visitante)', { nc: d.needsChoice, cl: d.contentLang, sl: d.siteLangDeclared }, { nc: true, cl: null, sl: 'de' });
  d = R({ ...noSignal, siteLangRaw: 'pt', lang: 'es' });
  eq('sitio pt sin señal → needsChoice', { nc: d.needsChoice, sl: d.siteLangDeclared }, { nc: true, sl: 'pt' });
  d = R({ captions: ['New drop is here today', 'Shop now with free shipping'], webText: '', siteLang: '', siteLangRaw: 'fr', lang: 'es' });
  eq('sitio fr PERO captions EN fuertes → en/detected (la detección manda)', { cl: d.contentLang, src: d.source }, { cl: 'en', src: 'detected' });
  d = R({ captions: [], webText: 'El nuevo blend ya está aquí hoy con envío gratis para todos', siteLang: '', siteLangRaw: 'fr', lang: 'en' });
  eq('sitio fr PERO web ES fuerte → es/detected', { cl: d.contentLang, src: d.source }, { cl: 'es', src: 'detected' });
  d = R({ ...noSignal, siteLangRaw: 'FR' });
  eq('siteLangRaw FR (mayúscula) → needsChoice', { nc: d.needsChoice, sl: d.siteLangDeclared }, { nc: true, sl: 'fr' });
  d = R({ ...noSignal, siteLangRaw: 'fr-FR' });
  eq('siteLangRaw fr-FR → needsChoice (subtag primario)', { nc: d.needsChoice, sl: d.siteLangDeclared }, { nc: true, sl: 'fr' });
  d = R({ captions: ['New drop', 'Shop the look'], webText: 'the new collection is here now', siteLang: '', siteLangRaw: '', lang: 'es' });
  eq('pool débil IG+web mismo idioma → en (ingesta intacta vía resolver)', { cl: d.contentLang, src: d.source }, { cl: 'en', src: 'detected' });
  d = R({ captions: ['the new shop el día de hoy'], webText: 'the new collection el nuevo blend', siteLang: '', siteLangRaw: '', lang: 'es' });
  eq('bilingüe empatado sin tercer idioma → fallback visitante (no needsChoice)', { cl: d.contentLang, nc: d.needsChoice, src: d.source }, { cl: 'es', nc: false, src: 'visitor-fallback' });

  // ---------- C) siteLangRawFromHtml ----------
  console.log('== C) siteLangRawFromHtml ==');
  const raw = webExtract.siteLangRawFromHtml;
  eq('lang="fr" → fr', raw('<html lang="fr">'), 'fr');
  eq('lang="fr-FR" → fr', raw('<html lang="fr-FR">'), 'fr');
  eq('lang="en-US" → en', raw('<html lang="en-US">'), 'en');
  eq('lang="es-MX" → es', raw('<html lang="es-MX">'), 'es');
  eq('sin lang → \'\'', raw('<html>'), '');
  eq('lang="de" → de', raw('<html lang="de">'), 'de');
  eq('comillas simples → fr', raw("<html lang='fr'>"), 'fr');
  eq('lang="PT" → pt (minúscula)', raw('<html lang="PT">'), 'pt');

  // ---------- D) Reproducción Veja con datos reales ----------
  console.log('== D) reproducción Veja (datos reales del diagnóstico) ==');
  // Descripción y servicios reales de veja-store.com (todo en francés),
  // 0 captions parseables del embed, <html lang="fr">, visitante 'es'.
  const vejaWebText = [
    'VEJA crée des sneakers avec du coton bio et du caoutchouc naturel',
    'HOMME', 'FEMME', 'Enfant', 'RUNNING', 'SANDALES', 'accessoires', 'NOUVEAUTés', 'PROJET',
  ].join('\n');
  d = R({ captions: [], webText: vejaWebText, siteLang: '', siteLangRaw: 'fr', lang: 'es' });
  eq('Veja real → needsChoice, NUNCA cae a es en silencio', { nc: d.needsChoice, cl: d.contentLang }, { nc: true, cl: null });
  ok(d.evidence.includes('fr'), 'Veja real: la evidencia nombra fr');
  d = R({ captions: [], webText: vejaWebText, siteLang: '', siteLangRaw: 'fr', lang: 'es', brandLang: 'en' });
  eq('Veja real + usuario elige English → en/user', { cl: d.contentLang, src: d.source, nc: d.needsChoice }, { cl: 'en', src: 'user', nc: false });
  // Byredo-like: captions EN reales deciden sin preguntar.
  d = R({ captions: ['Mojave Ghost is back in stock', 'Discover the new collection today with free shipping'], webText: '', siteLang: '', siteLangRaw: '', lang: 'es' });
  eq('marca EN con captions → en sin preguntar', { cl: d.contentLang, nc: d.needsChoice }, { cl: 'en', nc: false });

  // ---------- E) pzParseBrandLangAnswer (extraída de app.js) ----------
  console.log('== E) pzParseBrandLangAnswer ==');
  const mFn = appSrc.match(/function pzParseBrandLangAnswer[\s\S]*?return null;\n\}/);
  ok(!!mFn, 'pzParseBrandLangAnswer extraíble de app.js');
  if (mFn) {
    const parseLang = eval('(' + mFn[0].replace(/^function pzParseBrandLangAnswer/, 'function') + ')');
    const cases = [
      ['English', 'en'], ['english', 'en'], ['En inglés', 'en'], ['en', 'en'],
      ['Español', 'es'], ['spanish', 'es'], ['es', 'es'], ['EN ESPAÑOL', 'es'],
      ['hola', null], ['sneakers', null], ['francés', null], ['', null], ['  ', null],
    ];
    for (const [input, want] of cases) {
      eq('parse ' + JSON.stringify(input) + ' → ' + JSON.stringify(want), parseLang(input), want);
    }
  }

  // ---------- F) Boot local /api/version v932 5/5 ----------
  console.log('== F) boot local ==');
  const port = 34997;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-boot-'));
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
      try { if (JSON.parse(r.body).build === '20261105-v932') hits++; } catch (e) {}
    }
    ok(hits === 5, '/api/version v932 5/5 (estampado)');
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
  ok(!fs.existsSync(path.join(ROOT, 'node_modules')), 'sin node_modules/ en el release');

  console.log('\n== RESULTADO ==');
  console.log('pass:', pass, 'fail:', fail);
  if (failed.length) console.log('fallidos:', failed.join(' | '));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('SUITE CRASH:', e); process.exit(2); });
