// test-lote-logo-prueba-rearme.js
// LOTE LOGO-DE-LA-PRUEBA + REARME REAL — puntos 1 y 4 del diagnóstico
// Blind Barber (guest 101, posteos 674/675; ~/workspace/.diag-blind-barber/DIAGNOSIS.md):
//   La semana quedó en 2 porque las 3 piezas faltantes cayeron a la
//   cadena de póster (la única que exige archivo de logo) y el digest
//   no tenía logo: la foto de perfil llega como data: URI y la cosecha
//   solo aceptaba https://; no existía cosecha del logo del sitio. El
//   re-arme de v1026 corrió 6 pasadas IDÉNTICAS (re-resolvía el logo
//   del digest cacheado, que nunca se refresca) y, agotada la cadena,
//   nada la retomaba. Y las piezas de foto real no frenaron por logo:
//   en ese camino marca_visible=true salió del TEXTO de las etiquetas.
// Qué cambia:
//   (1) La cosecha acepta data: URI (la foto de perfil ES el logo) y
//       suma el logo del SITIO como fuente (apple-touch-icon / img de
//       header / favicon grande — og:image NO: es foto, no logo), por
//       el mismo embudo de archivo real + paleta. client-digest deja
//       de descartar la foto data: como fuente del fundamento.
//   (2) El re-arme REFRESCA el bloqueo entre pasadas (refrescarLogo-
//       Prueba vuelve a las fuentes del payload y PERSISTE el archivo
//       en el digest del caché) y una pasada que no puede cambiar
//       nada (sin logo, mismos pendientes, misma firma) NO quema el
//       máximo: a la segunda idéntica la cadena queda EN ESPERA.
//   (3) RESUMIDOR: al abrir la app (/api/week/ensure), una semana en
//       armado sin cadena viva re-abre su cadena; el cierre de la
//       cadena crea los posteos tardíos en la cuenta (P1 de Tartine)
//       también desde esta reanudación, no solo desde el stream.
//   (4) Superficie honesta: ensure declara trial_arming y la home lo
//       muestra como armado en curso (banner + rótulo), nunca la
//       semana parcial como final.
//   (6) Vara única de logo: classifyBrandPresence distingue LOGO de
//       TEXTO (tipo), brandLogoOf lo lee fail-closed, y una foto real
//       cuya única marca es texto de etiqueta ya no se entrega como
//       «con logo presente»: el slot cae a la cadena de composición.
// Se corre desde la raíz del release:
//   DATA_DIR=$(mktemp -d) NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-logo-prueba-rearme.js
// Control contra la base v1028: PZ_ROOT=<base> (las aserciones del
// comportamiento nuevo caen: la cosecha de la base devuelve null con
// la foto data: de la corrida y la foto de solo-texto se entrega).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DEMO_SRC = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const DIGEST_SRC = fs.readFileSync(path.join(ROOT, 'client-digest.js'), 'utf8');
const DEEPREAD_SRC = fs.readFileSync(path.join(ROOT, 'deep-read.js'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

const demo = require(path.join(ROOT, 'demo'));
const clientDigest = require(path.join(ROOT, 'client-digest'));
const deepRead = require(path.join(ROOT, 'deep-read'));
// En la base (control) las funciones nuevas no existen: el acceso
// seguro las convierte en MAL de la aserción, no en crash de la suite.
const brandLogoOfSeguro = typeof clientDigest.brandLogoOf === 'function' ? clientDigest.brandLogoOf : () => 'FUNCION-AUSENTE';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function seccion(s) { console.log('\n[' + s + ']'); }

const iRescate = SERVER.indexOf('async function scheduleWeekRescue');
const cuerpoRescate = iRescate >= 0 ? SERVER.slice(iRescate, iRescate + 26000) : '';

/* ── A · La cosecha consigue el logo (funcional, VM sobre el fuente) ── */
seccion('A · cosecha de logo: data:, https y sitio (VM del fuente real)');
const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-logo-media-'));
let cosecha = null;
{
  const i0 = SERVER.indexOf('function logoExtDeBytes');
  const i1 = SERVER.indexOf('// Refresca el logo de una cuenta');
  if (i0 >= 0 && i1 > i0) {
    const bloque = SERVER.slice(i0, i1);
    const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(600, 7)]);
    const HTML_SITIO = '<html><head>'
      + '<meta property="og:image" content="https://blindbarber.com/og-foto.jpg">'
      + '<link rel="icon" sizes="32x32" href="/favicon-32.png">'
      + '<link rel="apple-touch-icon" href="/apple-touch.png">'
      + '<link rel="icon" sizes="192x192" href="/favicon-192.png">'
      + '</head><body><header><img src="/assets/logo-blind.png" alt="Blind Barber logo"></header></body></html>';
    const fetchStub = async (url) => {
      const u = String(url);
      if (u === 'https://blindbarber.com/') return { ok: true, arrayBuffer: async () => Buffer.from(HTML_SITIO) };
      if (u.endsWith('.png') || u.endsWith('.jpg')) return { ok: true, arrayBuffer: async () => JPEG };
      return { ok: false, arrayBuffer: async () => Buffer.alloc(0) };
    };
    try {
      const ctx = {
        fs, path, Buffer, URL, setTimeout, clearTimeout, AbortController,
        MEDIA_DIR: MEDIA_TMP,
        demo: { extractColorsFromBuffer: async () => ['#AABBCC', '#112233'] },
        fetch: fetchStub, console,
      };
      vm.createContext(ctx);
      vm.runInContext(bloque + '\nthis.__c = { logoPaletaYArchivo, logoDelSitioYArchivo: (typeof logoDelSitioYArchivo === "function" ? logoDelSitioYArchivo : null), logoCandidatosDelSitio: (typeof logoCandidatosDelSitio === "function" ? logoCandidatosDelSitio : null), logoBufferDesdeDataUri: (typeof logoBufferDesdeDataUri === "function" ? logoBufferDesdeDataUri : null) };', ctx);
      cosecha = ctx.__c;
    } catch (e) { cosecha = null; }
  }
}
const DATAURI = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(600, 7)]).toString('base64');
async function cosechaTests() {
  ok(!!cosecha && typeof cosecha.logoPaletaYArchivo === 'function', 'A0 el bloque de cosecha se extrae del fuente real');
  if (!cosecha) return;
  const got = await cosecha.logoPaletaYArchivo(DATAURI, 'logo-trial-blindbarber');
  ok(!!got && got.file === 'logo-trial-blindbarber.jpg' && fs.existsSync(path.join(MEDIA_TMP, 'logo-trial-blindbarber.jpg')), 'A1 digest con foto data: CONSIGUE logo_file (archivo real escrito)', got);
  ok(!!got && Array.isArray(got.paleta) && got.paleta.length >= 2, 'A2 la cosecha data: trae su paleta', got && got.paleta);
  eq(await cosecha.logoPaletaYArchivo('data:text/html;base64,AAAA', 'x'), null, 'A3 una data: que no es imagen no produce archivo');
  eq(typeof cosecha.logoBufferDesdeDataUri === 'function' ? cosecha.logoBufferDesdeDataUri('no-es-una-uri') : 'FUNCION-AUSENTE', null, 'A4 basura no decodifica como logo');

  const gotHttps = await cosecha.logoPaletaYArchivo('https://blindbarber.com/apple-touch.png', 'logo-https');
  ok(!!gotHttps && gotHttps.file.startsWith('logo-https.') && fs.existsSync(path.join(MEDIA_TMP, gotHttps.file)), 'A5 la vía https histórica sigue produciendo archivo (la extensión sale de los bytes, no de la URL)', gotHttps);
  const cands = typeof cosecha.logoCandidatosDelSitio === 'function' ? cosecha.logoCandidatosDelSitio('<meta property="og:image" content="https://blindbarber.com/og-foto.jpg"><link rel="icon" sizes="32x32" href="/favicon-32.png"><link rel="apple-touch-icon" href="/apple-touch.png"><link rel="icon" sizes="192x192" href="/favicon-192.png"><img src="/assets/logo-blind.png" alt="logo">', 'https://blindbarber.com/') : [];
  eq(cands[0], 'https://blindbarber.com/apple-touch.png', 'A6 el primer candidato del sitio es el apple-touch-icon', cands);
  ok(cands.length > 0 && !cands.some((u) => u.includes('og-foto')), 'A7 og:image NO es candidato a logo (es la foto de portada, no el logo)', cands);
  ok(cands.indexOf('https://blindbarber.com/favicon-192.png') >= 0 && cands.indexOf('https://blindbarber.com/favicon-192.png') < cands.indexOf('https://blindbarber.com/favicon-32.png'), 'A8 el favicon grande va antes que el chico', cands);
  const gotSitio = typeof cosecha.logoDelSitioYArchivo === 'function' ? await cosecha.logoDelSitioYArchivo('https://blindbarber.com/', 'logo-trial-sitio') : null;
  ok(!!gotSitio && fs.existsSync(path.join(MEDIA_TMP, gotSitio.file)), 'A9 sitio con logo cosechable: la cosecha del sitio produce el archivo', gotSitio);
}

/* ── B · El fundamento no pierde la foto data: ─────────────────── */
seccion('B · client-digest conserva la fuente del logo');
{
  ok(DIGEST_SRC.includes("/^data:image\\//.test(p.feed.pic)"), 'B1 buildDigest acepta la foto data: como logo_url (no la descarta por no ser https)');
  ok(SERVER.includes("if (/^data:/i.test(logoUrl))"), 'B2 logoPaletaYArchivo despacha la data: a su decodificador');
  ok(SERVER.includes('logoDelSitioYArchivo(webData.url'), 'B3 el stream de la prueba suma el logo del sitio cuando la foto no produjo archivo');
}

/* ── C · Vara única de logo: presencia distingue logo de texto ─── */
seccion('C · brand_presence distingue LOGO de texto de etiqueta');
{
  const dg = { brand_presence: { entries: {
    'foto-logo': { marca: true, tipo: 'logo' },
    'foto-texto': { marca: true, tipo: 'texto', detalle: 'Frascos con el nombre visible en las etiquetas' },
    'foto-vieja': { marca: true },
    'foto-sin': { marca: false },
  } } };
  eq(brandLogoOfSeguro(dg, 'foto-logo'), true, 'C1 el logo gráfico en escena cuenta como logo presente');
  eq(brandLogoOfSeguro(dg, 'foto-texto'), false, 'C2 el texto de las etiquetas NO cuenta como logo presente (el caso Blind Barber)');
  eq(brandLogoOfSeguro(dg, 'foto-vieja'), null, 'C3 un veredicto sin tipo no se pronuncia para esta vara (fail-closed: null no es pase)');
  eq(brandLogoOfSeguro(dg, 'foto-sin'), null, 'C4 sin marca no hay logo');
  eq(brandLogoOfSeguro(dg, 'foto-ausente'), null, 'C5 foto sin veredicto: null');
  eq(clientDigest.brandPresenceOf(dg, 'foto-texto'), true, 'C6 la presencia de marca (vara vieja) no cambia: el negocio SÍ se ve — lo que no hay es logo');
  const sane = clientDigest.sanitizeBrandPresence({ a: { marca: true, tipo: 'texto' }, b: { marca: true, tipo: 'inventado' }, c: { marca: true, tipo: 'logo' } });
  eq(sane.a.tipo, 'texto', 'C7 sanitizeBrandPresence conserva el tipo válido');
  eq(sane.b.tipo, undefined, 'C8 un tipo inválido se descarta (no contamina la vara)');
  // La visión clasifica el tipo: prompt + parseo (con fetch stub).
  ok(DEEPREAD_SRC.includes('"tipo"') && DEEPREAD_SRC.includes('res.tipo'), 'C9 classifyBrandPresence pide y parsea el tipo de presencia');
}

/* ── D · La foto de solo-texto ya no se entrega como real con logo ── */
seccion('D · pickWebPhoto: la foto de solo-texto cae a la cadena de composición');
{
  const ctx = demo.photoGateCtx({ category: 'barberia', subcat: '', trialNoStock: true, vendeProducto: true });
  const topic = { tema: 'barberia', headline: 'El corte de la casa' };
  const fotoTexto = { url: 'https://blindbarber.com/set.jpg', path: '/tmp/set.jpg', temas: ['marca', 'producto'], marca_verdict: true, logo_verdict: false };
  const usada = new Set();
  const hitTexto = demo.pickWebPhoto(topic, [fotoTexto], usada, ctx, {});
  eq(hitTexto, null, 'D1 foto con marca solo como texto de etiqueta: NO se entrega como foto real — el slot cae al póster con el logo real');
  const fotoSinTipo = { url: 'https://blindbarber.com/set.jpg', path: '/tmp/set.jpg', temas: ['marca', 'producto'], marca_verdict: true };
  const hitHist = demo.pickWebPhoto(topic, [fotoSinTipo], new Set(), ctx, {});
  ok(!!hitHist, 'D2 sin dictamen de tipo (veredictos viejos) el pase histórico de presencia manda');
  const fotoLogo = { url: 'https://blindbarber.com/local.jpg', path: '/tmp/local.jpg', temas: ['marca', 'producto'], marca_verdict: true, logo_verdict: true };
  ok(!!demo.pickWebPhoto(topic, [fotoLogo], new Set(), ctx, {}), 'D3 foto con el logo en escena: se entrega como foto real');
  const fotoProducto = { url: 'https://blindbarber.com/clay.jpg', path: '/tmp/clay.jpg', temas: ['producto'], producto: 'Hair Clay', marca_verdict: true, logo_verdict: false };
  const topicProd = { tema: 'barberia', headline: 'Hair Clay', digest_anchor: 'Hair Clay' };
  ok(!!demo.pickWebPhoto(topicProd, [fotoProducto], new Set(), ctx, {}), 'D4 la vía del producto queda intacta: la foto que ES el producto de la pieza se entrega aunque el logo no se lea');
  ok(DEMO_SRC.includes('logo_visible: typeof lvGate'), 'D5 el foto_gate registra logo_visible por foto (auditable, separado de marca_visible)');
  ok(DEMO_SRC.includes('solo_texto: fotosGate.filter'), 'D6 el resumen del gate cuenta las fotos de solo-texto');
}

/* ── E · Re-arme real: refresco, pasada idéntica y resumidor ───── */
seccion('E · el re-arme refresca, no quema lo idéntico y se reanuda');
{
  ok(SERVER.includes('async function refrescarLogoPrueba(cacheKey)'), 'E1 existe el refresco del bloqueo de la prueba');
  ok(cuerpoRescate.includes('await refrescarLogoPrueba(o.cacheKey)'), 'E2 entre pasadas la cadena refresca el bloqueo ANTES de reintentar');
  ok(SERVER.includes('payload.digest.logo_file = got.file'), 'E3 el refresco PERSISTE el logo en el digest del caché (la pasada siguiente lo encuentra)');
  ok(SERVER.includes('logoDelSitioYArchivo(payload.web_info.url'), 'E4 el refresco busca también el logo del sitio desde el payload');
  ok(cuerpoRescate.includes('const identicaR = !logoR0 && applied === 0 && estR.sig === sigR;'), 'E5 la pasada idéntica se detecta por firma (sin logo + cero aplicadas + mismos pendientes)');
  ok(cuerpoRescate.includes('const intentoR = identicaR ? (o.intento | 0) : (o.intento | 0) + 1;'), 'E6 la pasada idéntica NO quema el máximo (el intento se hereda)');
  ok(cuerpoRescate.includes('la cadena queda EN ESPERA'), 'E7 a la segunda idéntica la cadena queda EN ESPERA, no agotada');
  ok(cuerpoRescate.includes('if (o.intento == null) { semanaCadenasVivas.add(o.cacheKey);'), 'E8 la cadena fresca se marca viva (el resumidor no duplica)');
  ok(cuerpoRescate.includes('semanaCadenasVivas.delete(o.cacheKey);') && cuerpoRescate.includes('semana completa: la cadena se cierra'), 'E9 al completarse la semana la cadena sale de las vivas');
  ok(SERVER.includes('async function rearmarSemanaPruebaDeUsuario(uid)'), 'E10 existe el resumidor de cadenas');
  ok(SERVER.includes('if (semanaCadenasVivas.has(info.ig))'), 'E11 el resumidor no re-abre una cadena que ya trabaja');
  ok(SERVER.includes("evTrack(uid, 'trial_rescate_reanudado'"), 'E12 la reanudación queda registrada como evento interno');
  ok(SERVER.includes('rearmarSemanaPruebaDeUsuario(uid).catch(() => {})'), 'E13 /api/week/ensure dispara el resumidor al abrir la app, sin bloquear la respuesta');
  ok(cuerpoRescate.includes('crearPosteoRescateTardio(ownerId, finP, idxP)'), 'E14 la creación tardía sigue en el cierre de la cadena: una pieza completada por el resumidor nace como posteo (no solo desde el stream)');
  // Tabla de verdad de la decisión de re-arme (las expresiones
  // pineadas arriba, evaluadas tal cual): sin logo + aplicada 0 +
  // misma firma = idéntica (no quema); la segunda idéntica = espera;
  // con logo la pasada es un reintento real y quema hasta el máximo.
  const decide = (logo, applied, sigPrev, sig, sinProgreso, intento) => {
    const identica = !logo && applied === 0 && sigPrev === sig;
    if (identica && sinProgreso + 1 >= 2) return 'espera';
    if (identica) return 'sigue-sin-quemar';
    return (intento + 1 <= 6) ? 'sigue-quemando' : 'agotada';
  };
  eq(decide(false, 0, '0,1,4|sin-logo', '0,1,4|sin-logo', 0, 3), 'sigue-sin-quemar', 'E15 corrida Blind Barber: la pasada sin logo, idéntica, no consume el máximo');
  eq(decide(false, 0, '0,1,4|sin-logo', '0,1,4|sin-logo', 1, 3), 'espera', 'E16 la segunda idéntica deja la cadena en espera (la retoma el resumidor)');
  eq(decide(false, 0, '0,1,4|sin-logo', '0,1|sin-logo', 1, 3), 'sigue-quemando', 'E17 si los pendientes cambian, la firma cambia: la pasada cuenta de nuevo');
  eq(decide(true, 0, '0,1|con-logo', '0,1|con-logo', 0, 6), 'agotada', 'E18 con logo, el reintento es real y el máximo manda como siempre');
}

/* ── F · Superficie honesta de armado ──────────────────────────── */
seccion('F · la home muestra el armado, nunca la semana parcial como final');
{
  ok(SERVER.includes('trial_arming: true'), 'F1 /api/week/ensure declara trial_arming cuando la semana de la prueba sigue en armado');
  ok(SERVER.includes('function semanaPruebaPendientesDeUsuario(uid)'), 'F2 el estado sale del trial_cache del propio usuario (su @), no de un global');
  ok(count(APPJS, 'er.trial_arming') >= 3, 'F3 las vistas de la home consumen trial_arming (generating + refresco)', count(APPJS, 'er.trial_arming'));
  ok(APPJS.includes('homeWeekHTML(posts, quota, generating, noDna, trialArming)'), 'F4 homeWeekHTML recibe el estado de armado de la prueba');
  ok(APPJS.includes('Estoy terminando de armar tu semana'), 'F5 con piezas en armado la home dice que la semana se está armando (no «lista»)');
  ok(APPJS.includes("weekTrialArming ? 'Tu semana se está armando…' : 'Tu semana, lista.'"), 'F6 el rótulo «Tu semana, lista» no sale mientras la semana se arma');
}

/* ── G · La visión distingue (funcional con fetch stub) ────────── */
async function visionTests() {
  seccion('G · classifyBrandPresence devuelve el tipo (fetch stub)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-logo-vision-'));
  const foto = path.join(dir, 'set.jpg');
  fs.writeFileSync(foto, Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(4000, 3)]));
  const fetchStub = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [{ i: 0, marca: true, tipo: 'texto', detalle: 'Frascos con el nombre en las etiquetas' }] }) } }] }) });
  const v = await deepRead.classifyBrandPresence({ photos: [{ key: 'k1', path: foto }], business: 'Blind Barber', items: [], apiKey: 'sk-test', fetchImpl: fetchStub });
  ok(!!v.k1 && v.k1.marca === true && v.k1.tipo === 'texto', 'G1 el veredicto de presencia trae tipo=texto cuando la visión lo clasifica', v);
  const dg2 = { brand_presence: { entries: clientDigest.sanitizeBrandPresence(v) } };
  eq(brandLogoOfSeguro(dg2, 'k1'), false, 'G2 ese veredicto, ya en el fundamento, lee «sin logo» en la vara única');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

/* ── H · Boot smoke ────────────────────────────────────────────── */
seccion('H · boot smoke del servidor');
async function bootSmoke() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 35700 + Math.floor(Math.random() * 250);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-logo-rearme-'));
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
    const r401 = await fetch('http://127.0.0.1:' + port + '/api/week/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
    ok(!!r401 && (r401.status === 401 || r401.status === 403), 'H2 /api/week/ensure (la puerta del resumidor) exige sesión como siempre', r401 && r401.status);
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await cosechaTests();
  await visionTests();
  await bootSmoke();
  try { fs.rmSync(MEDIA_TMP, { recursive: true, force: true }); } catch (e) {}
  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE LOGO-PRUEBA-REARME: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
