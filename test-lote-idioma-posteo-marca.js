// LOTE IDIOMA-POSTEO-MARCA · v922
// REGLA (Valentino, caso Veja 11/11): titular, caption y texto dentro de
// la imagen van en el idioma en que postea LA MARCA (IG primero, web
// después), NUNCA en el idioma de la prueba o la interfaz.
// Se corre desde la raíz del árbol a probar (release/):
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-idioma-posteo-marca.js
// Cubre: (A) detector puro, (B) cableado en ambas rutas de generación,
// (C) buildDemoSpec honra el lang que recibe (el lever), (D) boot local
// /api/version v922 5/5. No toca la red ni IG real.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = process.cwd();
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const demoSrc = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');

let pass = 0, fail = 0;
const failed = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok -', name); }
  else { fail++; failed.push(name); console.log('  FAIL -', name, extra ? '(' + extra + ')' : ''); }
}
function count(re, src) { return (src.match(re) || []).length; }

async function main() {
  // ---------- A) Estático: estampado + cableado ----------
  console.log('== A) estampado y cableado ==');
  ok(count(/20261105-v922/g, serverSrc) === 1, 'BUILD v922 x1 en server.js');
  ok(count(/20261105-v900/g, serverSrc) === 0, 'sin rastro de BUILD v900');
  ok(count(/function detectBrandLang\(/g, demoSrc) === 1, 'detectBrandLang definida en demo.js');
  ok(count(/detectBrandLang,/g, demoSrc) === 1, 'detectBrandLang exportada');
  // Ruta /api/trial/generate (sin stream): el contenido va en contentLang.
  ok(count(/digest: trialDigest, lang: contentLang, trialNoStock/g, serverSrc) === 1, 'generate: generateDemo recibe lang: contentLang x1');
  ok(count(/content_lang: contentLang,/g, serverSrc) === 1, 'generate: out.content_lang x1');
  ok(count(/trialDigest\.post_lang = contentLang;/g, serverSrc) === 1, 'generate: digest.post_lang = contentLang x1');
  ok(count(/trialPostPrompt\(\{ post: pp, specPost: _sp, paletteNames: estiloPaletteNames, tone: \(estilo && estilo\.tone\) \|\| null, lang \}\)/g, serverSrc) === 1, 'generate: trialPostPrompt sigue en idioma de la prueba');
  ok(count(/week: buildTrialWeek\(posts\.length, lang\)/g, serverSrc) === 1, 'generate: semana (UI) sigue en idioma de la prueba');
  // Ruta /api/trial/generate-stream: el contenido va en contentLangS.
  ok(count(/lang: contentLangS, trialNoStock/g, serverSrc) === 2, 'stream: buildDemoSpec en contentLangS x2 (spec + extras de la grilla)');
  ok(count(/lang: contentLangS, trialNoStock: true \}\);/g, serverSrc) === 1, 'stream: extras de la grilla en contentLangS x1');
  ok(count(/lang: contentLangS, prevCaptions: prevCaps,/g, serverSrc) === 1, 'stream: resolveTrialCaption en contentLangS x1');
  ok(count(/trialVoiceEcho\(voiceMarkers, i, contentLangS\)/g, serverSrc) === 1, 'stream: eco de voz en contentLangS x1');
  ok(count(/appendOfferTerms\(r\.caption, topics\[r\.topicIndex\] \|\| t, contentLangS\)/g, serverSrc) === 1, 'stream: appendOfferTerms en contentLangS x1');
  ok(count(/closeTrialCaption\(baseCaptionS, topics\[r\.topicIndex\] \|\| t, tone, contentLangS\)/g, serverSrc) === 1, 'stream: closeTrialCaption en contentLangS x1');
  ok(count(/content_lang: contentLangS,/g, serverSrc) === 1, 'stream: out.content_lang x1');
  ok(count(/trialDigest\.post_lang = contentLangS;/g, serverSrc) === 1, 'stream: digest.post_lang = contentLangS x1');
  ok(count(/const week = buildTrialWeek\(n, lang\);/g, serverSrc) === 1, 'stream: semana (UI) sigue en idioma de la prueba');
  ok(count(/generateIdeas\(\{ business, category, tone, description: richGoal, competitors, lang,/g, serverSrc) === 2, 'ideas (UI de la prueba) siguen en idioma de la prueba x2 rutas');
  ok(count(/brandCaptions/g, serverSrc) === 3, 'brandCaptions izado fuera del bloque de voz (declaración + asignación + uso)');
  ok(count(/trialProfile\.captions/g, serverSrc) >= 2, 'stream: señal IG = trialProfile.captions');

  // ---------- B) Detector puro ----------
  console.log('== B) detectBrandLang (puro) ==');
  // La DB del require va a un DATA_DIR temporal: no ensuciar el árbol.
  const tmpData = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v922-suite-'));
  process.env.DATA_DIR = tmpData;
  try { require('module').Module._initPaths(); } catch (e) {}
  const demo = require(path.join(ROOT, 'demo.js'));
  ok(typeof demo.detectBrandLang === 'function', 'detectBrandLang exportada y callable');
  // Caso Veja: marca que postea en inglés, trial en español → inglés.
  const vejaCaps = [
    'The new Esplar is here. Designed in Paris, made in Brazil with organic cotton and wild rubber from the Amazon.',
    'Our bestseller is back in stock. Shop the Campo now, free shipping on orders over $150.',
    'Thank you for all the love this week. The new collection drops on Friday, stay tuned for more.',
  ];
  ok(demo.detectBrandLang({ captions: vejaCaps, webText: '' }) === 'en', 'Veja: captions EN → en (aunque el trial sea ES)');
  // Marca que postea en español, trial en inglés → español.
  const esCaps = [
    'Ya llegó el nuevo blend Tesora, el primero de Phil. Caramelo y nuez en cada taza, probalo hoy en tu local.',
    'Gracias por venir esta semana, los esperamos todos los días con café recién hecho y medialunas.',
    'Nuestro Mint Mojito es la bebida más pedida del verano, con menta fresca y crema de la casa.',
  ];
  ok(demo.detectBrandLang({ captions: esCaps, webText: '' }) === 'es', 'marca ES: captions ES → es (aunque el trial sea EN)');
  // Sin señal clara → null (fallback documentado, no adivinanza).
  ok(demo.detectBrandLang({ captions: ['🔥🔥🔥', '✨ new drop ✨', 'Veja'], webText: '' }) === null, 'sin señal (emojis/corto) → null');
  ok(demo.detectBrandLang({ captions: [], webText: '' }) === null, 'sin captions ni web → null');
  ok(demo.detectBrandLang({ captions: ['New drop 🔥'], webText: '' }) === null, 'dos palabras sueltas → null (umbral ≥3)');
  // Bilingüe parejo → null (no se adivina).
  ok(demo.detectBrandLang({ captions: ['The new styles are here now', 'La nueva colección está aquí ahora'], webText: '' }) === null, 'bilingüe parejo (margen 1) → null');
  // Respaldo web: sin captions, la web decide.
  ok(demo.detectBrandLang({ captions: [], webText: 'Somos una cafetería de barrio. Nuestro café se tuesta todos los días y las medialunas salen del horno cada mañana.' }) === 'es', 'sin captions: web ES → es');
  ok(demo.detectBrandLang({ captions: [], webText: 'We are a family bakery in Brooklyn. Our sourdough is baked every morning and we ship nationwide.' }) === 'en', 'sin captions: web EN → en');
  // IG manda sobre la web cuando discrepan (IG primario).
  ok(demo.detectBrandLang({ captions: vejaCaps, webText: 'Somos una tienda de zapatillas en Madrid con envíos a toda España.' }) === 'en', 'IG EN + web ES → en (IG manda)');
  // Hashtags y URLs no cuentan como palabras de idioma.
  ok(demo.detectBrandLang({ captions: ['#sneakers #veja https://veja-store.com/shop', 'New styles just landed in store now, come and see them all today.'], webText: '' }) === 'en', 'hashtags/URLs ignorados, el texto decide');

  // ---------- C) El lever: buildDemoSpec honra el lang que recibe ----------
  console.log('== C) buildDemoSpec honra lang (el lever que mueve contentLang) ==');
  const esStop = ['llegaron', 'sorteo', 'regalo', 'camperas', 'formas', 'combinan', 'hasta'];
  const specEN = demo.buildDemoSpec({ business: 'Veja', category: 'moda', country: 'US', tone: 'vos', goal: 'sneakers', lang: 'en', count: 5 });
  const specES = demo.buildDemoSpec({ business: 'Veja', category: 'moda', country: 'US', tone: 'vos', goal: 'sneakers', lang: 'es', count: 5 });
  const enHeads = specEN.specPosts.map((p) => p.headline);
  const esHeads = specES.specPosts.map((p) => p.headline);
  ok(specEN.specPosts.length === 5 && specES.specPosts.length === 5, 'ambos specs traen 5 piezas');
  ok(enHeads.join(' ').toLowerCase().split(/[^a-z]+/).every((w) => !esStop.includes(w)), 'spec EN: ningún titular en español');
  ok(esHeads.some((h) => esStop.some((w) => h.toLowerCase().includes(w))), 'spec ES: al menos un titular en español');
  ok(enHeads.join('|') !== esHeads.join('|'), 'mismo input, lang distinto → titulares distintos');
  // El caption también sigue el lang (resolveTrialCaption vía el spec).
  const capEN = demo.resolveTrialCaption(specEN.topics, 'moda', { business: 'Veja', tone: 'vos', country: 'US', idx: 0, lang: 'en', prevCaptions: [] });
  const capES = demo.resolveTrialCaption(specES.topics, 'moda', { business: 'Veja', tone: 'vos', country: 'US', idx: 0, lang: 'es', prevCaptions: [] });
  ok(capEN.caption && capEN.caption !== capES.caption, 'caption EN ≠ caption ES con el mismo tema');
  ok(!esStop.some((w) => capEN.caption.toLowerCase().includes(w)), 'caption EN sin palabras españolas');
  // El texto dentro de la imagen sale del titular del spec (text_mode=text):
  // con contentLang='en' el titular es inglés → la imagen sale en inglés.
  ok(specEN.specPosts.filter((p) => p.text_mode === 'text').length >= 1, 'spec EN: al menos una pieza con texto en la imagen');
  ok(specEN.specPosts.filter((p) => p.text_mode === 'text').every((p) => !esStop.some((w) => String(p.headline || '').toLowerCase().includes(w))), 'piezas con texto EN: titular en inglés');

  // ---------- D) Boot local /api/version v922 5/5 ----------
  console.log('== D) boot local ==');
  const port = 34995;
  const dataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v922-boot-'));
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
      try { if (JSON.parse(r.body).build === '20261105-v922') hits++; } catch (e) {}
    }
    ok(hits === 5, '/api/version v922 5/5');
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
  // Puerto libre tras matar.
  await sleep(500);
  const after = await getVersion();
  ok(after.status === 0, 'puerto ' + port + ' libre tras matar el boot');
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch (e) {}

  console.log('\n== RESULTADO ==');
  console.log('pass:', pass, 'fail:', fail);
  if (failed.length) console.log('fallidos:', failed.join(' | '));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('SUITE CRASH:', e); process.exit(2); });
