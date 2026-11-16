// test-lote-destrabe-soulcycle.js
// LOTE DESTRABE-SOULCYCLE — los tres frenos que mataron la corrida
// SoulCycle 3 (15/11, guest 104, veredicto: no cuenta, 0 posteos):
// la semana se armo con el fundamento de OTRO negocio (la tienda
// BMX de Amsterdam duena de soulcycle.com contra el Instagram
// fitness de SoulCycle), cada pieza cayo con «sin-archivo-de-logo»
// y la cadena se detuvo a las 19:31 EST sin avisar a ningun humano.
//
// FASE 1 · EL DIAGNOSTICO (evidencia: ~/workspace/soulcycle-
// corrida3-15nov/ — stream1.txt, stream2.txt, week-live-*.json):
//   (A1) La puerta SI declaro la contradiccion en la primera pasada
//        (stream1: falta_pregunta, web_no_encaja) y el dueno
//        respondio «Fitness / Gym»; en la pasada respondida el atajo
//        de la respuesta recomputo la reconciliacion sin las
//        clasificaciones y digest.reconciliacion quedo null: sin
//        reconciliacion no hay candidata, la puerta no frena y la
//        web perdedora alimento servicios/productos/temas.
//   (A2) La estrella minada de la web (Rotor Set Install) abrio la
//        semana sin pasar por la pregunta vinculante de estrella:
//        la puerta solo mira inferred_star, que venia null — los
//        temas del spec salen de digest.servicios/productos por un
//        camino que la puerta de estrella no inspecciona.
//   (A3) El link del perfil no se leyo ni en el reintento (el embed
//        no trae external_url y la pagina muere desde produccion):
//        la web real (soul-cycle.com) nunca compitio con la tipeada.
//   (A4) El reseteo no limpiaba el client_digest del invitado ni el
//        estado en memoria de la clave: la semana se sirvio
//        cached:true con el fundamento viejo.
//   (B)  El stream nunca cosechaba el archivo del logo (la ruta
//        generate si): digest.logo_file '' y la puerta de cada
//        pieza caia con «sin-archivo-de-logo» (~17 min de freno).
//   (C)  La escalacion del Cierre 7 declaraba motivo y desbloqueo
//        SOLO en el payload de trial_cache y en el log.
//
// FASE 2 · EL ARREGLO:
//   (A1) buildTrialDigest recomputa la reconciliacion desde las
//        partes (trialReconciliacionEfectiva) si vino vacia, y con
//        contradiccion la web entra en CUARENTENA
//        (trialDigestCuarentenaWeb): sus items salen de servicios/
//        productos antes de que el digest alimente la semana.
//   (A2) La cuarentena des-infiere la estrella que ES un item de
//        la web contradicha.
//   (A3) Segunda fuente del link: el dominio escrito en la bio
//        (feedAudit.linkFromBioText) compite en trialWebCanonica.
//   (A4) trial-reset borra el client_digest del invitado e invalida
//        el estado en memoria de la clave; trialCacheServe e
//        importTrialWeek no sirven/importan un fundamento que
//        contradice (trialFundamentoContradice).
//   (B)  trialLogoMaterializar: el stream cosecha el logo (foto de
//        perfil data:/https, respaldo el logo del sitio) ANTES de
//        la primera pasada del rescate y de cachear la semana.
//   (C)  avisoRescateHumano: toda detencion declarada del rescate
//        abre un caso «prueba_trabada» en support_cases (consola
//        viva) con motivo y desbloqueo, dedup por clave+firma.
//
// Se corre desde la raiz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-destrabe-soulcycle.js
// Control contra la base: PZ_ROOT=<base> (las secciones funcionales
// caen: las funciones no existen y el cableado no esta).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const FEEDAUDIT_SRC = fs.readFileSync(path.join(ROOT, 'feed-audit.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function seccion(s) { console.log('\n[' + s + ']'); }

/* ── A · Censo de cableado ─────────────────────────────────────── */
seccion('A · censo de cableado');
{
  ok(SERVER.includes('function trialReconciliacionEfectiva'), 'A1 existe trialReconciliacionEfectiva');
  ok(SERVER.includes('function trialDigestCuarentenaWeb'), 'A2 existe trialDigestCuarentenaWeb');
  ok(SERVER.includes('function trialFundamentoContradice'), 'A3 existe trialFundamentoContradice');
  const iBuild = SERVER.indexOf('function buildTrialDigest');
  const cuerpoBuild = iBuild >= 0 ? SERVER.slice(iBuild, iBuild + 26000) : '';
  ok(cuerpoBuild.includes('trialReconciliacionEfectiva({ feed, webData, category'), 'A4 buildTrialDigest recomputa la reconciliacion desde las partes');
  ok(cuerpoBuild.includes('trialDigestCuarentenaWeb(_trialDigestBuilt'), 'A5 buildTrialDigest aplica la cuarentena');
  const iServe = SERVER.indexOf('function trialCacheServe');
  const cuerpoServe = iServe >= 0 ? SERVER.slice(iServe, iServe + 6000) : '';
  ok(cuerpoServe.includes('trialFundamentoContradice(probe)'), 'A6 trialCacheServe no sirve un fundamento que contradice');
  const iImport = SERVER.indexOf('function importTrialWeek');
  const cuerpoImport = iImport >= 0 ? SERVER.slice(iImport, iImport + 4000) : '';
  ok(cuerpoImport.includes('trialFundamentoContradice(out)'), 'A7 importTrialWeek no importa un fundamento que contradice');
  const iReset = SERVER.indexOf("/api/admin/trial-reset");
  const cuerpoReset = iReset >= 0 ? SERVER.slice(iReset, iReset + 9000) : '';
  ok(cuerpoReset.includes('clientDigest.deleteDigest(db, guestId)'), 'A8 trial-reset borra el client_digest del invitado');
  ok(cuerpoReset.includes('semanaRearmeToken(k, true)') && cuerpoReset.includes('trialGenEarlyWebClear(k)'), 'A9 trial-reset invalida el estado en memoria de la clave');
  ok(cuerpoReset.includes('fundamento_borrado: fundamentoBorrado'), 'A10 la respuesta del reseteo declara fundamento_borrado');
  ok(SERVER.includes('function trialLogoMaterializar'), 'A11 existe trialLogoMaterializar');
  const iLogoPath = SERVER.indexOf('const trialLogoPathS = trialLogoAbsPath(trialDigest);');
  const iCosecha = SERVER.indexOf('trialLogoMaterializar(trialDigest,');
  ok(iCosecha >= 0 && iLogoPath >= 0 && iCosecha < iLogoPath, 'A12 el stream cosecha el logo ANTES de calcular la ruta para el rescate');
  ok(SERVER.includes('function avisoRescateHumano'), 'A13 existe avisoRescateHumano');
  const iRescate = SERVER.indexOf('async function scheduleWeekRescue');
  const cuerpoRescate = iRescate >= 0 ? SERVER.slice(iRescate, iRescate + 40000) : '';
  ok(cuerpoRescate.includes('avisoRescateHumano(o.cacheKey,'), 'A14 la detencion declarada del rescate avisa a un humano');
  ok(SERVER.includes('feedAudit.linkFromBioText(prof.bio)'), 'A15 el stream busca el link en la bio tras el reintento fallido');
  ok(FEEDAUDIT_SRC.includes('function linkFromBioText'), 'A16 feed-audit expone linkFromBioText');
}

/* ── B · Funcional VM: reconciliacion, cuarentena y guarda ─────── */
seccion('B · funcional VM (fuente real): la respuesta manda sobre el fundamento');
let A = null;
{
  const i0 = SERVER.indexOf('// (LOTE DESTRABE-SOULCYCLE · piezas A1/A2/A4)');
  const i1 = SERVER.indexOf('function trialCacheServe(');
  if (i0 >= 0 && i1 > i0) {
    const bloque = SERVER.slice(i0, i1);
    // Stub de rubroId con el contrato real: candidatas por palabras
    // del texto; reconcileSources con la semantica de rubro-id.js
    // (igRubro por senales o prefill; web con oferta que no apoya al
    // IG = contradiccion web_no_encaja / rubros_distintos).
    const rubroIdStub = {
      classifyBusiness: (s) => {
        const text = [s.bio || '', s.fullName || '', s.webText || '', s.catalogText || '', ...(s.captions || [])].join(' ').toLowerCase();
        const candidatas = [];
        if (/fitness|gym|cycling studio|yoga|pilates|entrenamiento/.test(text)) candidatas.push({ rubro: 'fitness', score: 5 });
        if (/restaurante|parrilla|comida|food/.test(text)) candidatas.push({ rubro: 'gastronomia', score: 5 });
        return { rubro: candidatas.length ? candidatas[0].rubro : null, confianza: candidatas.length ? 0.8 : 0, candidatas };
      },
      reconcileSources: ({ igCls, webCls, igPrefillRubro, web }) => {
        const igRubro = (igCls && igCls.rubro) || (igPrefillRubro && igPrefillRubro !== 'otro' ? igPrefillRubro : '');
        if (!igRubro) return null;
        const w = web || {};
        const webOferta = ((w.servicios || 0) >= 1 || (w.catalogo || 0) >= 1 || String(w.descripcion || '').length >= 40);
        if (!webOferta) return null;
        const webApoyaIg = !!(webCls && (webCls.candidatas || []).some((c) => c.rubro === igRubro && c.score >= 2));
        if (webApoyaIg) return null;
        const webRubro = webCls && webCls.rubro;
        return { contradiccion: true, motivo: (webRubro && webRubro !== igRubro) ? 'rubros_distintos' : 'web_no_encaja', ig: { rubro: igRubro }, web: { rubro: webRubro || null, nombre: w.nombre || '', url: w.url || '' } };
      },
    };
    try {
      const ctx = { console, rubroId: rubroIdStub };
      vm.createContext(ctx);
      vm.runInContext(bloque + '\nthis.__A = { trialReconciliacionEfectiva, trialDigestCuarentenaWeb, trialFundamentoContradice };', ctx);
      A = ctx.__A;
    } catch (e) { A = null; }
  }
}
function funcionalA() {
  ok(!!A, 'B0 el bloque de la pieza A se extrae del fuente real');
  if (!A) return;
  // B1 · la reconciliacion efectiva nace de las partes (feed fitness
  // + web BMX + rubro confirmado fitness) aunque `rubro` vino vacio.
  const rec = A.trialReconciliacionEfectiva({
    feed: { bio: 'Fitness studio — ride with us', name: 'SoulCycle', handle: 'soulcycle', captions: ['GO ALL IN. The final week of TURN IT UP'] },
    webData: { name: 'soulcyclebmx', description: 'Soulcycle is a BMX shop in Amsterdam', url: 'https://soulcycle.com/', services: [{ name: 'Rotor Set Install' }, { name: 'Bars Cutting' }, { name: 'General BMX Maintenance' }] },
    category: 'fitness', catalogo: 0,
  });
  ok(!!rec && rec.contradiccion === true && rec.motivo === 'web_no_encaja', 'B1 la reconciliacion efectiva declara la contradiccion de la corrida', rec);
  // B2 · la cuarentena saca la web de servicios/productos y
  // des-infiere su estrella; lo del feed queda.
  const dg = {
    servicios: [
      { nombre: 'Rotor Set Install', fuente: 'web' },
      { nombre: 'Bars Cutting', fuente: 'web' },
      { nombre: 'Clase de cycling', fuente: 'caption' },
    ],
    productos: [
      { nombre: 'Rotor Set Install' },
      { nombre: 'Remera de la casa', fuente: 'caption' },
    ],
    inferred_star: { nombre: 'Rotor Set Install', veces: 3 },
  };
  const fuera = A.trialDigestCuarentenaWeb(dg, 'web_no_encaja', new Set(['rotor set install', 'bars cutting', 'general bmx maintenance']));
  eq(fuera, 3, 'B2 la cuarentena saca 3 items de la web (2 servicios + 1 producto)');
  eq(dg.servicios.length, 1, 'B3 el servicio del feed sobrevive');
  eq(dg.productos.length, 1, 'B4 el producto del feed sobrevive');
  eq(dg.inferred_star, null, 'B5 la estrella minada de la web se des-infiere');
  ok(!!dg.web_cuarentena && dg.web_cuarentena.motivo === 'web_no_encaja' && dg.web_cuarentena.items.length === 3, 'B6 la cuarentena queda registrada en el digest', dg.web_cuarentena);
  // B3 · el guarda frena el payload EXACTO de la corrida (cacheado,
  // reconciliacion null, servicios BMX, rubro fitness).
  const payloadCorrida = {
    business: 'SoulCycle', category: 'fitness', ig: 'soulcycle',
    web_info: { url: 'https://soulcycle.com/', name: 'soulcyclebmx', description: 'Soulcycle is a BMX shop in Amsterdam' },
    digest: { reconciliacion: null, servicios: [{ nombre: 'Rotor Set Install', fuente: 'web' }, { nombre: 'Bars Cutting', fuente: 'web' }, { nombre: 'General BMX Maintenance', fuente: 'web' }] },
  };
  eq(A.trialFundamentoContradice(payloadCorrida), 'contenido-web_no_encaja', 'B7 el guarda frena la semana cacheada de la corrida');
  const payloadSano = {
    business: 'SoulCycle', category: 'fitness', ig: 'soulcycle',
    web_info: { url: 'https://www.soul-cycle.com/', name: 'SoulCycle', description: 'Fitness studio: cycling classes and training' },
    digest: { reconciliacion: null, servicios: [{ nombre: 'Clase de cycling', fuente: 'web' }] },
  };
  eq(A.trialFundamentoContradice(payloadSano), null, 'B8 el fundamento sano se sirve');
  const payloadSinResolver = { category: 'fitness', digest: { reconciliacion: { contradiccion: true, motivo: 'web_no_encaja' }, servicios: [] } };
  eq(A.trialFundamentoContradice(payloadSinResolver), 'reconciliacion-web_no_encaja', 'B9 la reconciliacion sin resolver frena');
  const payloadResuelto = { category: 'fitness', web_info: { name: 'SoulCycle', description: 'Fitness studio: cycling classes and training' }, digest: { reconciliacion: { contradiccion: true, motivo: 'web_no_encaja', resuelta_por: 'confirmacion' }, servicios: [{ nombre: 'Clase de cycling', fuente: 'web' }] } };
  eq(A.trialFundamentoContradice(payloadResuelto), null, 'B10 la contradiccion resuelta a favor del IG, con fundamento limpio, se sirve');
}

/* ── C · Funcional VM: el logo nace con el fundamento ──────────── */
seccion('C · funcional VM (fuente real): cosecha del logo en el stream');
const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-destrabe-media-'));
let cosecha = null;
{
  const i0 = SERVER.indexOf('function logoExtDeBytes');
  const i1 = SERVER.indexOf('// Refresca el logo de una cuenta');
  if (i0 >= 0 && i1 > i0) {
    const bloque = SERVER.slice(i0, i1);
    const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(600, 7)]);
    const HTML_SITIO = '<html><head><link rel="apple-touch-icon" href="/apple-touch.png"></head><body></body></html>';
    const fetchStub = async (url) => {
      const u = String(url);
      if (u === 'https://www.soul-cycle.com/') return { ok: true, arrayBuffer: async () => Buffer.from(HTML_SITIO) };
      if (u.endsWith('.png') || u.endsWith('.jpg')) return { ok: true, arrayBuffer: async () => JPEG };
      return { ok: false, arrayBuffer: async () => Buffer.alloc(0) };
    };
    try {
      const ctx = {
        fs, path, Buffer, URL, setTimeout, clearTimeout, AbortController,
        MEDIA_DIR: MEDIA_TMP,
        demo: { extractColorsFromBuffer: async () => ['#AABBCC', '#112233'] },
        fetch: fetchStub, console,
        clientDigest: { sanitizeDigestLogo: (x) => ({ url: x.url || '', file: x.file || '', fuente: x.fuente || '' }) },
        trialLogoAbsPath: (digest) => {
          const f = digest && digest.logo_file;
          if (!f) return null;
          const abs = path.join(MEDIA_TMP, path.basename(String(f)));
          try { return fs.statSync(abs).isFile() ? abs : null; } catch (e) { return null; }
        },
      };
      vm.createContext(ctx);
      vm.runInContext(bloque + '\nthis.__c = { trialLogoMaterializar };', ctx);
      cosecha = ctx.__c;
    } catch (e) { cosecha = null; }
  }
}
const DATAURI = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(600, 7)]).toString('base64');
async function funcionalC() {
  ok(!!cosecha && typeof cosecha.trialLogoMaterializar === 'function', 'C0 el bloque de cosecha con trialLogoMaterializar se extrae del fuente real');
  if (!cosecha) return;
  const dg = { logo_url: DATAURI, logo_file: '' };
  const abs = await cosecha.trialLogoMaterializar(dg, { pic: DATAURI, fileBase: 'logo-trial-soulcycle' });
  eq(dg.logo_file, 'logo-trial-soulcycle.jpg', 'C1 la foto de perfil data: produce el ARCHIVO del logo al nacer el fundamento');
  ok(!!abs && fs.existsSync(path.join(MEDIA_TMP, 'logo-trial-soulcycle.jpg')), 'C2 el archivo existe en MEDIA_DIR y la ruta resuelve (la puerta no cae con sin-archivo-de-logo)');
  ok(!!dg.logo && dg.logo.file === 'logo-trial-soulcycle.jpg', 'C3 el sello digest.logo viaja con el archivo', dg.logo);
  const dg2 = { logo_url: '', logo_file: '' };
  const abs2 = await cosecha.trialLogoMaterializar(dg2, { pic: '', webUrl: 'https://www.soul-cycle.com/', fileBase: 'logo-trial-sitio' });
  ok(!!abs2 && !!dg2.logo_file, 'C4 sin foto de perfil, el logo del sitio respalda la cosecha', dg2.logo_file);
  const dg3 = { logo_url: '', logo_file: '' };
  const abs3 = await cosecha.trialLogoMaterializar(dg3, { pic: '', webUrl: '', fileBase: 'logo-trial-x' });
  eq(abs3, null, 'C5 sin fuentes no se inventa logo (la puerta decide como hoy)');
}

/* ── D · Funcional VM: la detencion le habla a un humano ───────── */
seccion('D · funcional VM (fuente real): aviso de la detencion');
let avisoFn = null; const casosCapturados = [];
{
  const i0 = SERVER.indexOf('// (LOTE DESTRABE-SOULCYCLE · pieza C)');
  const i1 = SERVER.indexOf('async function scheduleWeekRescue');
  if (i0 >= 0 && i1 > i0) {
    const bloque = SERVER.slice(i0, i1);
    try {
      const ctx = {
        console,
        db: { prepare: () => ({ get: () => null }) },
        guestTrial: { findGuestByIdentity: () => ({ id: 104 }) },
        supportCases: { openCase: (dbArg, args) => { casosCapturados.push(args); return { ok: true, id: 77 }; } },
      };
      vm.createContext(ctx);
      vm.runInContext(bloque + '\nthis.__f = avisoRescateHumano;', ctx);
      avisoFn = ctx.__f;
    } catch (e) { avisoFn = null; }
  }
}
function funcionalD() {
  ok(typeof avisoFn === 'function', 'D0 avisoRescateHumano se extrae del fuente real');
  if (!avisoFn) return;
  const r = avisoFn('soulcycle', 'sin-archivo-de-logo', 'cosechar el archivo del logo de la prueba');
  ok(!!r && r.ok === true, 'D1 la detencion abre el caso', r);
  eq(casosCapturados.length, 1, 'D2 un solo caso por detencion');
  const c = casosCapturados[0] || {};
  eq(c.tipo, 'prueba_trabada', 'D3 el caso es del tipo vivo «prueba_trabada»');
  eq(c.userId, 104, 'D4 el caso cuelga del invitado de la corrida');
  eq(c.dedupKey, 'trial-rescate:soulcycle:sin-archivo-de-logo', 'D5 dedup por clave+firma: la misma detencion no duplica casos');
  ok(String(c.detalle || '').includes('sin-archivo-de-logo') && String(c.detalle || '').includes('cosechar el archivo'), 'D6 el detalle lleva motivo y desbloqueo', c.detalle);
}

/* ── E · El link escrito en la bio (modulo real) ───────────────── */
seccion('E · linkFromBioText (feed-audit real)');
{
  let fa = null;
  try { fa = require(path.join(ROOT, 'feed-audit')); } catch (e) { fa = null; }
  ok(!!fa && typeof fa.linkFromBioText === 'function', 'E0 feed-audit exporta linkFromBioText');
  if (fa && typeof fa.linkFromBioText === 'function') {
    eq(fa.linkFromBioText('SoulCycle | Book your ride at soul-cycle.com'), 'https://soul-cycle.com', 'E1 la bio con el dominio real lo devuelve (la web que nunca compitio)');
    eq(fa.linkFromBioText('Reservas: https://www.soul-cycle.com/classes'), 'https://www.soul-cycle.com/classes', 'E2 la URL completa de la bio viaja tal cual');
    eq(fa.linkFromBioText('Seguinos en instagram.com/soulcycle para mas'), null, 'E3 una red social en la bio NO es la web del negocio');
    eq(fa.linkFromBioText('El estudio de cycling de tu barrio'), null, 'E4 bio sin dominio: null (sin inventar)');
  }
}

/* ── F · Boot smoke ────────────────────────────────────────────── */
seccion('F · boot smoke del servidor');
async function bootSmoke() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 18700 + Math.floor(Math.random() * 200);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-destrabe-data-'));
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let vivo = false;
  try {
    for (let i = 0; i < 40 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch('http://127.0.0.1:' + port + '/api/version').catch(() => null);
      if (resp && resp.status === 200) vivo = true;
    }
    ok(vivo, 'F1 el servidor parcheado levanta y responde /api/version');
    if (vivo) {
      const r401 = await fetch('http://127.0.0.1:' + port + '/api/admin/trial-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
      ok(!!r401 && (r401.status === 401 || r401.status === 403), 'F2 /api/admin/trial-reset (con el destrabe) sigue exigiendo token admin', r401 && r401.status);
    }
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  funcionalA();
  await funcionalC();
  funcionalD();
  await bootSmoke();
  try { fs.rmSync(MEDIA_TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n== DESTRABE-SOULCYCLE: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
