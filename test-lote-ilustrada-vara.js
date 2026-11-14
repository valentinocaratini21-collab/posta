// test-lote-ilustrada-vara.js
// LOTE ILUSTRADA-BAJO-LA-VARA — el arreglo de la bifurcación «marca
// ilustrada» tras la re-prueba The Ordinary (13/11, posteos 668–670:
// la semana salió en ilustraciones sin producto ni logo, la vitrina
// mostró una foto real que no era la entrega, el veredicto del
// payload era el del spec pisado, el QA reprobó 4 de 5 piezas y se
// entregaron igual, «Sale solo» sin Instagram conectado y textos de
// peluquería/servicio para una marca de skincare). Spec de 8 piezas
// del diagnóstico (~/workspace/.diag-ilustrada/DIAGNOSIS.md):
//   1 corroboración de la bifurcación + veredicto auditable
//   2 veredicto sobre la pieza FINAL (etapa «final»)
//   3 sin exención en el rescate para piezas IA que no pasan
//   4 QA del demo fail-closed en la prueba
//   5 vitrina = entrega (slot 0 retenido hasta su pieza final)
//   6 hitos honestos (escena/chequeo tras la pieza final)
//   7 «Sale solo» con la conexión como entrada (app.js)
//   8 textos por subrubro y por ítem (hashtags + familia de servicios)
// Se corre desde la raíz del release:
//   DATA_DIR=$(mktemp -d) NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ilustrada-vara.js
// (sin DATA_DIR, la suite usa un temporal propio: nunca crea data/.)
'use strict';
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/ilu-vara-');
}
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const BASE = path.join(ROOT, '..', 'base');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const SERVER_BASE = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const IDX_ES = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');

const clientDigest = require('./client-digest');
const captions = require('./demo-captions');
const demo = require('./demo');
const baseDigest = require(path.join(BASE, 'client-digest'));
const baseCaptions = require(path.join(BASE, 'demo-captions'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
const md5 = (p) => require('crypto').createHash('md5').update(fs.readFileSync(p)).digest('hex');

/* ── A · PINS ESTRUCTURALES (piezas 1–6 sobre server.js) ────────── */
console.log('\n[A] Pins estructurales: bifurcación, veredicto, rescate, QA, vitrina, hitos');
{
  eq(count(SERVER, '20261105-v1020'), 1, 'A0 BUILD v1020 x1 (re-estampado del aterrizaje v1020)');
  // Pieza 1 — corroboración + registro auditable.
  ok(/const fotoRealConMarcaS = \(\(\) =>/.test(SERVER), 'A1 la corroboración se computa antes de consumir la clasificación');
  ok(SERVER.includes("feedClasificacion.kind_final = 'photo'") && SERVER.includes('feedClasificacion.vetada = true'), 'A2 el veto deja el feed en photo y queda registrado');
  ok(SERVER.includes('kind_modelo: cls.kind') && SERVER.includes('muestra: (feedPhotoPaths || []).slice(0, 4)'), 'A3 el veredicto de la clasificación (modelo, character/style, muestra) se guarda');
  ok(SERVER.includes('feed_clasificacion: feedClasificacion'), 'A4 el registro viaja en el payload (feed_clasificacion)');
  ok(/cls\.kind === 'illustrated' && !\(feedClasificacion && feedClasificacion\.vetada\)/.test(SERVER), 'A5 la rama ilustrada no corre si la clasificación fue vetada');
  // Pieza 5 — retención del slot 0 y resolución única.
  ok(SERVER.includes('if (rescueIdxS.has(i) || (i === 0 && classifyPromise)) return;'), 'A6 el render retiene el slot 0 mientras la clasificación está en vuelo');
  ok(SERVER.includes('if (i === 0 && rescueIdxS.has(0)) return;'), 'A7 onPiece no emite el slot 0 cuando la cadena de rescate lo posee');
  ok(SERVER.includes('if (!slot0Emitido) {') && count(SERVER, "send('post', { index: 0,"), 'A8 la resolución emite el slot 0 una sola vez (guardia slot0Emitido)');
  // Pieza 6 — hitos diferidos + keepalive en Escena.
  ok(SERVER.includes('slot0HitosPendientes = true'), 'A9 con clasificación en vuelo, hero/escena/chequeo del slot 0 se difieren');
  eq(count(SERVER, "step: 'escena'"), 2, 'A10 los estados de la fase IA narran la escena (inicio + keepalive)');
  eq(count(SERVER, "step: 'personaje'"), 0, 'A11 ningún estado promete «personaje» como paso');
  // Pieza 4 — QA fail-closed.
  ok(SERVER.includes('demo-ai QA fail-closed: la pieza') && SERVER.includes('demo-ai QA texto fail-closed: la pieza'), 'A12 QA reprobado y titular que tapa: la pieza no reemplaza (fail-closed x2)');
  ok((SERVER.match(/no reemplaza a la de plantilla/g) || []).length >= 2, 'A13 el fail-closed devuelve la pieza a plantilla en ambos chequeos');
  // Pieza 3 — sin exención en el rescate.
  ok(SERVER.includes('const aiPasaVaraI = !!(') && SERVER.includes('(posts[i].ai && aiPasaVaraI)'), 'A14 el salto del rescate exige que la pieza IA pase la vara final');
  ok(!SERVER.includes('if (!posts[i] || posts[i].ai) { // ya la produjo el pipeline IA ilustrado: su QA viaja en demo_ai'), 'A15 el salto incondicional de la corrida (la exención) ya no existe');
  // Pieza 2 — veredicto final.
  ok(SERVER.includes("ppRecS.etapa = 'final'") && SERVER.includes('ppRecS.veredicto_spec = specVerd'), 'A16 el registro se cierra en etapa «final» conservando el veredicto del spec');
  ok(SERVER.includes("finCadena = 'ilustrada'") && SERVER.includes("finCadena = 'en-rescate'"), 'A17 el veredicto final distingue la cadena real de la pieza entregada');
  // Orden de la cadena: render < clasificación < resolución < rescate < veredicto final < payload.
  const iRender = SERVER.indexOf('if (rescueIdxS.has(i) || (i === 0 && classifyPromise)) return;');
  const iClass = SERVER.indexOf('const fotoRealConMarcaS');
  const iResol = SERVER.indexOf('RESOLUCIÓN DEL\n    // SLOT 0 RETENIDO');
  const iRescue = SERVER.indexOf('const rescateSemanaS = []');
  const iFinal = SERVER.indexOf("ppRecS.etapa = 'final'");
  const iOut = SERVER.indexOf('const out = {', iFinal);
  ok(iRender > 0 && iClass > iRender && iResol > iClass && iRescue > iResol && iFinal > iRescue && iOut > iFinal, 'A18 orden: retención → clasificación/veto → resolución slot 0 → rescate → veredicto final → payload', { iRender, iClass, iResol, iRescue, iFinal, iOut });
  // Pieza 8 — cableado del subrubro.
  ok(SERVER.includes("subcat: spec.subcat || ''") && fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8').includes("subcat: (spec && spec.subcat) || ''"), 'A19 el subrubro llega a resolveTrialCaption en las dos rutas');
  // Alcance de archivos del lote.
  let out = '';
  try { out = execFileSync('diff', ['-rq', BASE, ROOT], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }); } catch (e) { out = (e.stdout || '').toString(); }
  const lines = out.split('\n').filter(Boolean).filter((l) => !/Only in .*base: data$/.test(l) && !/Only in .*release: data$/.test(l));
  const expected = [
    'Files ' + path.join(BASE, 'server.js') + ' and ' + path.join(ROOT, 'server.js') + ' differ',
    'Files ' + path.join(BASE, 'demo.js') + ' and ' + path.join(ROOT, 'demo.js') + ' differ',
    'Files ' + path.join(BASE, 'client-digest.js') + ' and ' + path.join(ROOT, 'client-digest.js') + ' differ',
    'Files ' + path.join(BASE, 'demo-ai.js') + ' and ' + path.join(ROOT, 'demo-ai.js') + ' differ',
    'Files ' + path.join(BASE, 'demo-captions.js') + ' and ' + path.join(ROOT, 'demo-captions.js') + ' differ',
    'Files ' + path.join(BASE, 'public', 'app.js') + ' and ' + path.join(ROOT, 'public', 'app.js') + ' differ',
    'Files ' + path.join(BASE, 'public', 'index.html') + ' and ' + path.join(ROOT, 'public', 'index.html') + ' differ',
    'Files ' + path.join(BASE, 'test-lote-primer-posteo-perfecto.js') + ' and ' + path.join(ROOT, 'test-lote-primer-posteo-perfecto.js') + ' differ',
    'Files ' + path.join(BASE, 'test-lote-imagen-generada-sin-foto.js') + ' and ' + path.join(ROOT, 'test-lote-imagen-generada-sin-foto.js') + ' differ',
    'Only in ' + ROOT + ': test-lote-ilustrada-vara.js',
  ];
  const extra = lines.filter((l) => !expected.includes(l));
  const missing = expected.filter((l) => !lines.includes(l));
  ok(extra.length === 0 && missing.length === 0, 'A20 (re-pin del aterrizaje v1020 · re-pin v1052: el censo suma demo-ai.js, que el lote ETIQUETA-Y-TEXTO hace crecer de forma puramente aditiva con la QA final del wow) diff vs base = el alcance del aterrizaje: los 6 archivos del lote + esta suite + las 2 suites vecinas re-pineadas en este mismo push (perfecto M0/M3 · v960)', { extra, missing });
  eq(md5(path.join(ROOT, 'demo-ai.js')), 'b00bf9ac9b5e364367a7169b25fbdb5c', 'A21 (re-pin del aterrizaje v1052 · lote ETIQUETA-Y-TEXTO · re-pin del aterrizaje v1053 · lote JUICIO-FINAL) demo-ai.js = el de ese lote (md5 pineado): crece de forma puramente aditiva con juicioFinalPieza (+137 líneas, 0 removidas ni modificadas vs la base v1052, md5 a16e78572cfd2f37336ec5ebf5218193); qaTrialWowFinal, qaComposedText y el clasificador intactos');
}

/* ── B · PIEZA 1 (señales del veto, a nivel spec) ───────────────── */
console.log('\n[B] Pieza 1: la evidencia que veta la bifurcación existe en la forma Ordinary y no en la mascota');
function ordinaryDigest(cd) {
  return cd.buildFromParts({
    business: 'The Ordinary', category: 'belleza',
    web: { name: 'The Ordinary', description: 'Clinical formulations with integrity.', services: ['Retinol 0.3% Emulsion', 'The Holiday Bundle'] },
    feed: { bio: 'Clinical skincare.', captions: ['Retinol 0.3% Emulsion is back.'], name: 'The Ordinary', handle: 'theordinary', pic: '' },
    form: { description: '' },
    catalog: null, bioLink: null,
    photoEntries: { 'https://theordinary.com/foto-bundle.jpg': { item: 'The Holiday Bundle', confianza: 0.9, marca: true } },
    brandPresence: null,
  });
}
{
  const dg = ordinaryDigest(clientDigest);
  const specArgs = { business: 'The Ordinary', category: 'belleza', country: 'US', tone: 'vos', photoPath: null, goal: '', goal_key: '', accent: '#111111', btn: '#222222', count: 5, bioText: 'Clinical skincare.', profilePicPath: null, feedRegister: null, digest: dg, lang: 'en', trialNoStock: true, draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null };
  const spec = demo.buildDemoSpec({ ...specArgs, extraPhotos: [
    { path: '/media/foto-bundle.jpg', url: 'https://theordinary.com/foto-bundle.jpg', producto: 'The Holiday Bundle', marca_visible: true, marca_verdict: true, temas: ['The Holiday Bundle'] },
  ] });
  const f0 = (spec.foto_gate && spec.foto_gate.fotos || [])[0] || {};
  ok(f0.admitida === true && !!f0.producto && (f0.marca_visible || f0.marca_verdict === true), 'B1 forma Ordinary: foto real de producto con marca ADMITIDA en el foto_gate (la señal que veta)', f0);
  const pm = dg.photo_map && dg.photo_map.entries;
  ok(pm && Object.values(pm).some((e) => e && e.item && e.marca === true), 'B2 forma Ordinary: el photo_map trae una foto de producto con marca en escena');
  const specM = demo.buildDemoSpec({ ...specArgs, extraPhotos: [] });
  const fotosM = (specM.foto_gate && specM.foto_gate.fotos) || [];
  ok(!fotosM.some((f) => f && f.admitida && f.producto && (f.marca_visible || f.marca_verdict === true)), 'B3 forma mascota (sin fotos de producto admitidas): la señal del veto NO existe — el camino ilustrado sigue vivo');
}

/* ── C · PIEZA 8 (textos por subrubro y por ítem) ───────────────── */
console.log('\n[C] Pieza 8: replay del fundamento The Ordinary — sin pelo, sin «another service», titular de producto');
const HAIR = ['#balayage', '#hairsalon', '#salonlife', '#hairgoals'];
{
  const tagsMakeup = captions.demoHashtags('belleza', 'US', 'vos', 'en', 'makeup');
  ok(!HAIR.some((h) => tagsMakeup.includes(h)), 'C1 hashtags belleza/makeup (EN): cero hashtags de pelo', tagsMakeup);
  const tagsSin = captions.demoHashtags('belleza', 'US', 'vos', 'en');
  ok(!HAIR.some((h) => tagsSin.includes(h)), 'C2 hashtags belleza sin subrubro (EN): el pool genérico ya no es el de peluquería', tagsSin);
  const tagsPelu = captions.demoHashtags('belleza', 'US', 'vos', 'en', 'peluqueria');
  ok(HAIR.some((h) => tagsPelu.includes(h)), 'C3 hashtags peluquería (EN): el pelo vive en su pool y solo ahí', tagsPelu);
  const tagsEs = captions.demoHashtags('belleza', 'AR', 'vos', 'es', 'makeup');
  ok(!/#peluqueria/.test(tagsEs) && /#maquillaje|#makeup/.test(tagsEs), 'C4 hashtags belleza/makeup (ES): pool de maquillaje, sin #peluqueria', tagsEs);
  // Control contra la base: la corrida sale con el set de pelo.
  const tagsBase = baseCaptions.demoHashtags('belleza', 'US', 'vos', 'en', 'makeup');
  ok(HAIR.filter((h) => tagsBase.includes(h)).length >= 4, 'C0 CONTROL base: belleza/makeup devolvía el set de peluquería entero (la falla de la corrida)', tagsBase);

  const dg = clientDigest.buildFromParts({
    business: 'The Ordinary', category: 'belleza',
    web: { name: 'The Ordinary', description: 'Clinical formulations with integrity.', services: ['Retinol 0.3% Emulsion', 'The Holiday Bundle', 'For Density and Thickness', 'Glycolic Acid 7% Exfoliating Toner'] },
    feed: { bio: 'Clinical skincare.', captions: ['Retinol 0.3% Emulsion is back.', 'The Holiday Bundle is here.', 'For Density and Thickness, our scalp serum.'], name: 'The Ordinary', handle: 'theordinary', pic: '' },
    form: { description: '' },
    catalog: null, bioLink: null,
    photoEntries: {
      'https://theordinary.com/foto-bundle.jpg': { item: 'The Holiday Bundle', confianza: 0.9, marca: true },
      'https://theordinary.com/foto-retinol.jpg': { item: 'Retinol 0.3% Emulsion', confianza: 0.9, marca: true },
    },
    brandPresence: null,
  });
  eq(clientDigest.itemHasProductEvidence(dg, 'The Holiday Bundle'), true, 'C5 el bundle tiene evidencia de producto (foto mapeada con marca / clase catálogo)');
  eq(clientDigest.itemHasProductEvidence(dg, 'Haircut Deluxe'), false, 'C6 un servicio sin foto ni catálogo no gana evidencia de producto');
  eq(clientDigest.itemHasProductEvidence({ productos_nombrados: [{ nombre: 'Serum X', clases: ['catalogo'], fuente: 'catalogo' }] }, 'Serum X'), true, 'C6b un ítem del catálogo de la tienda (fuente de catálogo) sí es evidencia de producto');
  eq(clientDigest.itemHasProductEvidence({ productos_nombrados: [{ nombre: 'Corte y peinado', clases: ['catalogo'], fuente: 'web' }] }, 'Corte y peinado'), false, 'C6c la lista genérica de la web (fuente web) NO discrimina: no es evidencia de producto');
  eq(typeof baseDigest.itemHasProductEvidence, 'undefined', 'C0b CONTROL base: itemHasProductEvidence no existe (la familia mandaba por rubro pelado)');
  const topics = clientDigest.deriveTopics(dg, { category: 'belleza', lang: 'en', count: 5 });
  const caps = topics.map((t) => String(t.caption || ''));
  ok(!caps.some((c) => /another service/.test(c)), 'C7 ningún tema se narra como servicio («another service» fuera)', caps.map((c) => c.split('\n')[0]));
  const bundleTopic = topics.find((t) => t.digest_anchor === 'The Holiday Bundle');
  ok(bundleTopic && /another favorite/.test(String(bundleTopic.caption || '')), 'C8 el bundle se narra como producto («another favorite»)', bundleTopic && bundleTopic.caption);
  const topicsBase = baseDigest.deriveTopics(dg, { category: 'belleza', lang: 'en', count: 5 });
  ok(topicsBase.some((t) => /another service/.test(String(t.caption || ''))), 'C0c CONTROL base: el mismo fundamento narraba el bundle como «another service» (la falla de la corrida)');
  const wow = clientDigest.deriveFirstPostWow(dg, { category: 'belleza', lang: 'en' });
  ok(wow && /^Try /.test(wow.headline || ''), 'C9 el titular de la estrella es de producto («Try … today»), no la plantilla de reserva', wow && wow.headline);
  const wowBase = baseDigest.deriveFirstPostWow(dg, { category: 'belleza', lang: 'en' });
  ok(wowBase && /^Book /.test(wowBase.headline || ''), 'C0d CONTROL base: el titular era «Book … today» (la plantilla de reserva de la corrida)', wowBase && wowBase.headline);
  // Un servicio PURO de un rubro de servicios sigue narrándose como servicio:
  const dgSvc = clientDigest.buildFromParts({
    business: 'Peluquería Lola', category: 'belleza',
    web: { name: 'Peluquería Lola', description: 'Peluquería y color.', services: ['Corte y peinado'] },
    feed: { bio: '', captions: ['Corte y peinado, como siempre.'], name: 'Peluquería Lola', handle: 'pelulola', pic: '' },
    form: { description: '' }, catalog: null, bioLink: null, photoEntries: null, brandPresence: null,
  });
  eq(clientDigest.itemHasProductEvidence(dgSvc, 'Corte y peinado'), false, 'C10 el servicio puro sin evidencia sigue siendo servicio (la guarda no vacía la familia)');
}

/* ── D · PIEZA 7 («Sale solo» con la conexión como entrada) ─────── */
console.log('\n[D] Pieza 7: sin Instagram conectado, ninguna superficie afirma la salida automática');
function extractFn(srcText, name) {
  const i = srcText.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0, j = srcText.indexOf('{', i);
  const start = j;
  for (; j < srcText.length; j++) {
    if (srcText[j] === '{') depth++;
    else if (srcText[j] === '}') { depth--; if (!depth) return srcText.slice(i, j + 1); }
  }
  return '';
}
function buildClient(profile) {
  const sbx = {
    console,
    apvTz: () => 'America/Argentina/Buenos_Aires',
    apvHM: () => '19:00',
    apvCountdown: () => 'en 2 h',
    humanError: (e) => e || '',
    esc: (s) => String(s),
    pzIc: () => '',
    mv: (s) => s,
    pcParseDate: (s) => new Date(String(s).replace(' ', 'T') + 'Z'),
    pzWhenRelDay: () => 'mañana',
    pzHoyHoraCorta: () => '19:00',
    hfChipText: () => '',
    pzHoyCuandoCorto: () => 'Mañana 19:00',
    pzHoyCuentaSaleTxt: () => '',
  };
  if (profile !== undefined) sbx.PROFILE = profile;
  vm.createContext(sbx);
  const code = extractFn(APPJS, 'pzIsPubReal') + '\n' + extractFn(APPJS, 'apvPill')
    + '\n' + extractFn(APPJS, 'pzHoyPillSalida') + '\n' + extractFn(APPJS, 'pzHoyCardHTML')
    + '\nthis.__x = { apvPill, pzHoyPillSalida, pzHoyCardHTML };';
  vm.runInContext(code, sbx);
  return sbx.__x;
}
{
  eq(count(IDX_ES, 'app.js?v=698'), 1, 'D0 index ES app.js?v=698 x1 (bump del lote)');
  eq(count(IDX_EN, 'app.js?v='), 0, 'D0b index EN sin app.js?v= (como siempre)');
  const sched = { id: 668, status: 'scheduled', approval: 'auto', scheduled_at: '2026-11-14 19:00:00', caption: 'Retinol, paso a paso.' };
  const D = new Date('2026-11-14T22:00:00Z');
  // Sin PROFILE (sandbox de suites / superficies sin perfil): legado.
  const xLegacy = buildClient(undefined);
  ok(/Sale solo a las 19:00/.test(xLegacy.apvPill(sched, D, true)), 'D1 sin PROFILE en el entorno: «Sale solo a las 19:00» como siempre');
  // Conectado: sin cambios.
  const xOk = buildClient({ ig_connected: 1 });
  ok(/Sale solo a las 19:00/.test(xOk.apvPill(sched, D, true)), 'D2 conectado: «Sale solo a las 19:00» intacto');
  ok(/Se postea mañana · 19:00/.test(xOk.pzHoyPillSalida(sched, undefined, false)), 'D3 conectado: la píldora de Hoy afirma la salida como siempre');
  const cardOk = xOk.pzHoyCardHTML({ ...sched, approval: 'approved' }, { cartita: true });
  ok(/también lo sube como historia/.test(cardOk), 'D4 conectado: la nota de la tarjeta aprobada afirma la historia como siempre');
  // NO conectado (el user 99 de la corrida): pendiente-de-conexión.
  const xOff = buildClient({ ig_connected: 0 });
  const pillOff = xOff.apvPill(sched, D, true);
  ok(/Pendiente — sale cuando conectes tu Instagram/.test(pillOff) && !/Sale solo/.test(pillOff), 'D5 sin conexión: el detalle dice pendiente-de-conexión, nunca «Sale solo»', pillOff);
  const hoyOff = xOff.pzHoyPillSalida(sched, undefined, false);
  ok(/Pendiente: conectá tu Instagram/.test(hoyOff) && !/Se postea/.test(hoyOff), 'D6 sin conexión: la píldora de Hoy no afirma la salida', hoyOff);
  const cardOff = xOff.pzHoyCardHTML({ ...sched, approval: 'approved' }, { cartita: true });
  ok(/sale cuando conectes tu Instagram/.test(cardOff) && !/también lo sube como historia/.test(cardOff), 'D7 sin conexión: la nota de la tarjeta no promete salida ni historia');
  // Control contra la base: sin conexión, la base afirmaba «Sale solo».
  const APPJS_BASE = fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8');
  const sbxB = { console, apvTz: () => 'America/Argentina/Buenos_Aires', apvHM: () => '19:00', apvCountdown: () => 'en 2 h', humanError: (e) => e || '', esc: (s) => String(s), pzIc: () => '', PROFILE: { ig_connected: 0 } };
  vm.createContext(sbxB);
  vm.runInContext(extractFn(APPJS_BASE, 'pzIsPubReal') + '\n' + extractFn(APPJS_BASE, 'apvPill') + '\nthis.__pill = apvPill;', sbxB);
  ok(/Sale solo a las 19:00/.test(sbxB.__pill(sched, D, true)), 'D0c CONTROL base: sin conexión, el detalle afirmaba «Sale solo a las 19:00» (la falla de la corrida)');
}

console.log(`\n== ${pass} ok · ${fail} mal ==`);
if (failures.length) { console.log('FALLOS:\n - ' + failures.join('\n - ')); }
process.exit(fail ? 1 : 0);
