// test-lote-tartine-frenos.js
// LOTE TARTINE-FRENOS — el arreglo del diagnóstico de la corrida
// Tartine (13/11, posteos 671/672): convertir la maquinaria de la
// prueba de REGISTRO en FRENO (spec P1–P8 de .diag-tartine):
//   P1 semana completa o incompletud honesta y visible (el rescate de
//      fondo crea los posteos faltantes en la cuenta; días del spec o
//      el cambio registrado) · P2 el contador cuenta entregables ·
//   P3 revelado honesto (héroe provisorio = foto real) · P4 insignia
//      con cuarta fuente (temas_feed) y degradación por VALIDEZ del
//      ancla · P5 clase «rótulo del sitio» en la ingesta · P6 el tour
//      sin placas · P7 sin archivo de logo = freno en TODAS las
//      cadenas · P8 pool panadería + novedad solo con evidencia.
// Se corre desde la raíz del release:
//   DATA_DIR=$(mktemp -d) NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-tartine-frenos.js
// Control contra la base: PZ_ROOT=<release base> (las aserciones de
// comportamiento nuevo fallan ahí: es la reproducción de la corrida).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DEMO = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const PRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
const ENPRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');

const clientDigest = require(path.join(ROOT, 'client-digest'));
const captions = require(path.join(ROOT, 'demo-captions'));
const demo = require(path.join(ROOT, 'demo'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function seccion(s) { console.log('\n[' + s + ']'); }

/* ── A · P5 — la clase «rótulo del sitio» ──────────────────────── */
seccion('A · P5 rótulo del sitio en la ingesta');
{
  const L = ['Welcome to Tartine', 'Welcome to Tartine Bakery', 'Bienvenidos a La Panadería', 'Welcome', 'Home', 'Order Online', 'About Us', 'Menú', 'Book a Table', 'Shop All'];
  for (const l of L) {
    eq(typeof clientDigest.isSiteLabelName === 'function' && clientDigest.isSiteLabelName(l), true, 'A1 «' + l + '» es rótulo del sitio');
    eq(clientDigest.isPlausibleOfferItem(l), false, 'A2 «' + l + '» NO es ítem de oferta plausible');
  }
  const P = ['Morning Bun', 'Croissant de almendras', 'Salar', 'Mint Mojito', 'Welcome Wagon Burger', 'Tarta de frutas', 'Medialunas de manteca'];
  for (const p of P) {
    eq(typeof clientDigest.isSiteLabelName === 'function' && clientDigest.isSiteLabelName(p), false, 'A3 «' + p + '» no es rótulo');
    eq(clientDigest.isPlausibleOfferItem(p), true, 'A4 «' + p + '» sigue siendo ítem plausible');
  }
  // El embudo completo: el fundamento construido con el saludo del
  // sitio en los servicios web sale LIMPIO de rótulos.
  const dg = clientDigest.buildFromParts({
    business: 'Tartine Bakery', category: 'gastronomia',
    web: { name: 'Tartine Bakery', description: 'Bakery in San Francisco.', services: ['Welcome to Tartine', 'Morning Bun', 'Croissant', 'Custom Cakes'] },
    feed: { bio: '', captions: [], name: 'Tartine Bakery', handle: 'tartinebakery', pic: '' },
    form: { description: '' }, catalog: null, bioLink: null,
  });
  const nombres = [...(dg.productos || []), ...(dg.servicios || [])].map((x) => String((x && x.nombre) || x || ''));
  ok(!nombres.some((n) => /welcome to tartine/i.test(n)), 'A5 el fundamento no guarda «Welcome to Tartine» como ítem', nombres);
  ok(nombres.some((n) => /morning bun/i.test(n)), 'A6 el Morning Bun sí entra como ítem', nombres);
}

/* ── B · P4 — insignia con temas_feed + degradación por validez ── */
seccion('B · P4 insignia: cuarta fuente y ancla válida');
{
  const dgBase = { dueno: {}, inferred_star: null, producto_estrella: '', onboarding: null };
  const ins = clientDigest.insigniaOf({ ...dgBase, temas_feed: ['fresh from the oven', 'Morning Bun'] });
  ok(!!ins && ins.fuente === 'temas_feed', 'B1 la insignia sale de temas_feed cuando las demás fuentes vienen vacías', ins);
  const insObj = clientDigest.insigniaOf({ ...dgBase, temas_feed: [{ nombre: 'Morning Bun' }] });
  ok(!!insObj && insObj.frase === 'Morning Bun' && insObj.fuente === 'temas_feed', 'B2 temas_feed acepta entradas objeto {nombre}', insObj);
  const insRot = clientDigest.insigniaOf({ ...dgBase, temas_feed: ['Welcome to Tartine', 'Morning Bun'] });
  ok(!!insRot && insRot.frase === 'Morning Bun', 'B3 un rótulo dentro de temas_feed tampoco es insignia (salta al tema válido)', insRot);
  const sav = clientDigest.starAnchorValida;
  eq(typeof sav === 'function' && sav(dgBase, 'Welcome to Tartine'), false, 'B4 el ancla-rótulo NO es válida');
  eq(typeof sav === 'function' && sav(dgBase, 'Morning Bun'), true, 'B5 el ancla-producto sí es válida');
  eq(typeof sav === 'function' && sav(dgBase, ''), false, 'B6 el ancla vacía no es válida');
  eq(typeof sav === 'function' && sav(dgBase, 'Pint Club'), false, 'B7 una suscripción tampoco es ancla válida');
  // El test de degradación del wow en demo.js usa la VALIDEZ:
  ok(DEMO.includes('starAnchorValida(digest, wowFirst.digest_anchor)'), 'B8 el test de degradación del wow mide validez (starAnchorValida), no presencia');
  ok(DEMO.includes('wowFirst.star_missing && !(wowFirst.digest_anchor && clientDigest.starAnchorValida'), 'B9 la forma del test: ancla inválida degrada como estrella ausente');
}

/* ── C · P7 — sin archivo de logo = freno en el gate ───────────── */
seccion('C · P7 gate: sin-archivo-de-logo fail-closed');
{
  const base = { star: 'Morning Bun', temaFinal: 'Morning Bun', headline: 'Morning Bun', caption: 'Morning Bun at Tartine Bakery.', lang: 'en' };
  const gSin = demo.primerPosteoGate({ ...base, photoSource: 'ai-generated', logoFileExists: false });
  eq(gSin.veredicto.pasa, false, 'C1 generada sin archivo de logo NO pasa');
  ok(gSin.veredicto.motivos.includes('sin-archivo-de-logo'), 'C2 el motivo es sin-archivo-de-logo', gSin.veredicto.motivos);
  eq(gSin.logo.estado, 'sin-archivo', 'C3 el estado del logo queda registrado como sin-archivo');
  const gCon = demo.primerPosteoGate({ ...base, photoSource: 'ai-generated', logoFileExists: true });
  eq(gCon.veredicto.pasa, true, 'C4 generada CON archivo de logo pasa (el sello se verifica en la ruta)');
  const gReal = demo.primerPosteoGate({ ...base, photoSource: 'real-product-brand', brandVisible: true, logoFileExists: false });
  eq(gReal.veredicto.pasa, true, 'C5 la foto real con logo en escena no depende del archivo: no frena');
  const gSinDeclarar = demo.primerPosteoGate({ ...base, photoSource: 'ai-generated' });
  eq(gSinDeclarar.veredicto.pasa, true, 'C6 sin declarar (llamadores viejos), el gate se comporta como siempre');
  // BUILD: el spec pasa el dato real del fundamento al gate.
  ok(DEMO.includes("logoFileExists: digest ? !!digest.logo_file : undefined"), 'C7 buildDemoSpec alimenta logoFileExists desde digest.logo_file');
  // Las demás cadenas (demo.js): sello del slot 0 y rescate de semana.
  ok(DEMO.includes("if (!logoPath) { firstLogoQa = { estado: 'sin-archivo-de-logo' }; return false; }"), 'C8 sealFirstAttempt frena sin logoPath (ruta sync)');
  ok(DEMO.includes("motivo: 'sin-archivo-de-logo' }); continue;"), 'C9 el rescate de semana de generateDemo ni genera sin logoPath');
  ok(!DEMO.includes('(!logoPath || (logoQaI && logoQaI.ok))'), 'C10 la aceptación sin sello (!logoPath || …) ya no existe');
  // Servidor: la cadena con sello (stream + fondo) es fail-closed.
  ok(SERVER.includes('if (!logoPath) return null;'), 'C11 rescuePieceWithSeal es fail-closed sin logoPath, antes de generar');
  ok(SERVER.includes('if (!trialLogoAbsPath(trialDigest)) return null;'), 'C12 la cadena IA del stream tampoco reemplaza sin archivo de logo');
  ok(SERVER.includes("ent7.motivo = 'sin-archivo-de-logo'"), 'C13 el rescate de fondo registra el motivo en el payload (frenada visible)');
}

/* ── D · P6 — el tour sin placas ───────────────────────────────── */
seccion('D · P6 tour sin placas');
{
  const sp = [{ photo_source: 'photo' }, { photo_source: 'brand-poster' }, { photo_source: 'photo' }, { photo_source: 'brand-poster' }, { photo_source: 'photo' }];
  const dp = sp.map((_, i) => 'post-' + i + '.jpg');
  const tsf = demo.tourScenesFor;
  const t2 = typeof tsf === 'function' ? tsf(sp, dp, 2, null) : null;
  ok(!!t2 && JSON.stringify(t2.paths) === JSON.stringify(['post-2.jpg', 'post-4.jpg', 'post-0.jpg']), 'D1 el tour excluye los diseños póster y arranca en la pieza de video', t2);
  eq(typeof tsf === 'function' ? tsf(sp, dp, 1, null) : 'sin-funcion', null, 'D2 si la pieza de video ES una placa, no hay video');
  const finArm = [null, null, { armando: true }, null, null];
  eq(typeof tsf === 'function' ? tsf(sp, dp, 2, finArm) : 'sin-funcion', null, 'D3 una pieza de video en armado tampoco sale como video');
  const finAi = [null, { ai: true }, null, null, null];
  const tAi = typeof tsf === 'function' ? tsf(sp, dp, 1, finAi) : null;
  ok(!!tAi && tAi.paths[0] === 'post-1.jpg' && !tAi.paths.includes('post-3.jpg'), 'D4 la pieza reemplazada por IA sí recorre (su JPG es la escena); la placa sigue fuera', tAi);
  ok(SERVER.includes('demo.tourScenesFor(specPosts, designPaths, videoIdx, posts)'), 'D5 el stream arma el tour con tourScenesFor');
  ok(DEMO.includes('tourScenesFor(specPosts, designPaths, videoIdx, null)'), 'D6 generateDemo arma el tour con tourScenesFor');
}

/* ── E · P8 — pool panadería + novedad con evidencia ───────────── */
seccion('E · P8 hashtags de panadería y novedad con evidencia');
{
  const en = captions.demoHashtags('gastronomia', 'US', null, 'en', 'panaderia');
  ok(/#bakery|#croissant|#freshbaked/.test(en) && !/#coffee|#barista|#specialtycoffee/.test(en), 'E1 EN: panadería sale con hashtags de panadería, cero café', en);
  const es = captions.demoHashtags('gastronomia', 'AR', null, 'es', 'panaderia');
  ok(/#panaderia|#medialunas/.test(es) && !/#cafe|#barista/.test(es), 'E2 ES: panadería sale con hashtags de panadería, cero café', es);
  const assertNov = /something new|we added|fresh in|just arrived|is here at|ya está en|recién llegad|algo nuevo/i;
  const mk = (extra) => [{ kind: 'novedad', tag: 'NEW', headline: 'Morning Bun', caption: 'Something new at Tartine Bakery 👀\n\nWe added something this week you will want to see.\n\nStop by the store today 📍', digest_anchor: 'Morning Bun', ...(extra || {}) }];
  const rSin = captions.resolveTrialCaption(mk(), 'gastronomia', { business: 'Tartine Bakery', tone: null, country: 'US', idx: 0, goalLine: '', lang: 'en', prevCaptions: [], voiceLine: '', subcat: 'panaderia' });
  ok(!assertNov.test(rSin.caption), 'E3 novedad SIN evidencia: el caption no afirma ninguna novedad', rSin.caption);
  ok(/Morning Bun/.test(rSin.caption), 'E4 sin evidencia, el caption PRESENTA el ítem (no afirma que llegó)', rSin.caption);
  const rCon = captions.resolveTrialCaption(mk({ _launch: 1 }), 'gastronomia', { business: 'Tartine Bakery', tone: null, country: 'US', idx: 0, goalLine: '', lang: 'en', prevCaptions: [], voiceLine: '', subcat: 'panaderia' });
  ok(assertNov.test(rCon.caption) || /launch|Meet/.test(rCon.caption), 'E5 novedad CON evidencia (lanzamiento): la afirmación sí puede salir', rCon.caption);
  const mkEs = [{ kind: 'novedad', tag: 'NUEVO', headline: 'Medialunas', caption: 'Algo nuevo en La Espiga 👀\n\nEsta semana sumamos algo que te va a gustar.\n\nPasá por el local hoy', digest_anchor: 'Medialunas' }];
  const rEs = captions.resolveTrialCaption(mkEs, 'gastronomia', { business: 'La Espiga', tone: null, country: 'AR', idx: 0, goalLine: '', lang: 'es', prevCaptions: [], voiceLine: '', subcat: 'panaderia' });
  ok(!assertNov.test(rEs.caption), 'E6 ES: novedad sin evidencia tampoco se afirma', rEs.caption);
  eq(typeof captions.novedadConEvidencia, 'function', 'E7 la puerta de evidencia existe y es exportable');
  eq(typeof captions.novedadConEvidencia === 'function' && captions.novedadConEvidencia({ offer_ends_at: '2026-12-01' }), true, 'E8 una promo con fecha ES evidencia de novedad');
  eq(typeof captions.novedadConEvidencia === 'function' && captions.novedadConEvidencia({ kind: 'novedad' }), false, 'E9 el kind solo no es evidencia');
}

/* ── F · P1 — semana completa o incompletud visible ────────────── */
seccion('F · P1 rescate que completa + registros');
{
  const cuerpoRescate = SERVER.slice(SERVER.indexOf('async function scheduleWeekRescue'), SERVER.indexOf('async function scheduleWeekRescue') + 14000);
  ok(!cuerpoRescate.includes("return { applied: false, reason: 'imported' }"), 'F1 el rescate de fondo ya NO aborta cuando la semana se importó');
  ok(cuerpoRescate.includes('crearPosteoRescateTardio(ownerId, finP, idxP)'), 'F2 al cerrar, el rescate CREA los posteos faltantes en la cuenta dueña');
  ok(cuerpoRescate.includes('trial_rescate_importado'), 'F3 la creación tardía se registra como evento');
  ok(cuerpoRescate.includes('dia_spec') && cuerpoRescate.includes('dia_real'), 'F4 el día del spec y el día real quedan registrados (el cambio se dice)');
  ok(cuerpoRescate.includes('trial_semana_incompleta'), 'F5 lo que sigue en armado queda registrado como incompletud visible');
  ok(cuerpoRescate.includes('esGuestP ? 3 : 7'), 'F6 la ventana de creación tardía respeta el tipo de cuenta (invitado 3 · registrado 7)');
  eq(typeof SERVER === 'string' && SERVER.includes('function crearPosteoRescateTardio(userId, out, idx)'), true, 'F7 el helper de creación tardía existe (espejo del insert de importTrialWeek)');
  ok(SERVER.includes("evTrack(userId, 'trial_import_incompleta'"), 'F8 la importación registra sus faltantes (trial_import_incompleta)');
  ok(SERVER.includes('faltantesImp'), 'F9 importTrialWeek computa los índices faltantes en vez de filtrarlos en silencio');
}

/* ── G · P2 + P3 — contador y revelado en el cliente ───────────── */
seccion('G · P2 contador de entregables · P3 héroe provisorio');
{
  for (const [nombre, H] of [['prueba.html', PRUEBA], ['en-prueba.html', ENPRUEBA]]) {
    ok(H.includes('countedIdx') && H.includes('entregableTF'), 'G1 ' + nombre + ': el contador cuenta solo entregables, una vez por índice');
    ok(H.includes("ev === 'meta'") && H.includes('postsTotal = d.total'), 'G2 ' + nombre + ': el denominador viene del spec (evento meta)');
    ok(!/postsSeen\+\+;\s*\n\s*\/\/ \(LOTE PRIMER-POSTEO/.test(H), 'G3 ' + nombre + ': ya no hay incremento ciego por evento post');
  }
  ok(SERVER.includes("send('meta', { total: n })"), 'G4 el stream emite el total del spec antes de los posteos');
  ok(SERVER.includes('provisorio: true'), 'G5 el stream emite un héroe PROVISORIO con foto real cuando el slot 0 está en la cadena');
  ok(SERVER.includes('candHero'), 'G6 el héroe provisorio sale de las fotos reales de la marca (spec.photos/perfil), nunca del diseño interno');
}

/* ── H · Boot smoke ────────────────────────────────────────────── */
seccion('H · boot smoke del servidor');
async function bootSmoke() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 35200 + Math.floor(Math.random() * 400);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-tartine-frenos-'));
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    const t0 = Date.now();
    let version = null;
    while (Date.now() - t0 < 90000) {
      try {
        const r = await fetch('http://127.0.0.1:' + port + '/api/version');
        if (r.ok) { version = await r.json(); break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    ok(!!version && !!version.build, 'H1 el servidor botea y /api/version responde', version || out.slice(-300));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await bootSmoke();
  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE TARTINE-FRENOS: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
