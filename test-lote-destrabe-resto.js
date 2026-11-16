// test-lote-destrabe-resto.js
// LOTE DESTRABE-RESTO — lo que la evidencia en vivo del destrabe
// (v1112) dejo abierto: el destrabe aterrizo verificado pero NO
// cerro (evidencia 2 de 3, con una falla de fondo). Evidencia:
// ~/workspace/destrabe-evidencia/ (week-ev5.json / week-ev6.json,
// streams ev1–ev5, done-out.json).
//
// FASE 1 · EL DIAGNOSTICO (contra el codigo real de v1113):
//   (R1) LA CUARENTENA NO SALIA DE PRODUCTOS. trialDigestCuaren-
//        tenaWeb filtra por fuente (web/web-catalog/bio-link/home)
//        o por nombre contra el set del llamador. Las dos vias
//        estaban rotas para productos: (a) el set nacia VACIO —
//        webData.services son STRINGS (web-extract.servicesFromHtml
//        devuelve textos) y el llamador leia (s.name || s.title);
//        (b) d.productos se arma con itemList/toItem, que DESCARTA
//        la fuente que itemListF habia puesto ('web-catalog').
//        Resultado en vivo: web_cuarentena.items registro los 6
//        items BMX removidos de servicios, y los mismos 6 quedaron
//        en digest.productos; la estrella «Rotor Set Install»
//        (sin_confirmar) tematizo el primer posteo y 4 de 5
//        titulares salieron BMX. Las listas derivadas tampoco se
//        tocaban: photo_map.entries mapeaba fotos de la web a los
//        items BMX con marca:true, y el lexicon aprendio frases de
//        la web («Soulcycle is a BMX shop in Amsterdam»).
//        INVENTARIO de listas que la generacion consume del
//        digest: productos · servicios · productos_nombrados ·
//        catalog.items · bio_link.items · photo_map.entries ·
//        lexicon.entries · inferred_star · protagonista. (promos
//        nace del ADN del dueno y temas_feed del IG: no son de la
//        web y no se tocan.)
//   (R2) LA PROYECCION NO SE REFRESCABA. primer_posteo.logo.estado
//        nace en el spec de generateDemo con logoFileExists =
//        !!digest.logo_file — evaluado ANTES de que el stream
//        cosechara el archivo (trialLogoMaterializar corre
//        despues de generateDemo). El ensamblado final reescribe
//        etapa/veredicto/foto pero nunca logo; si el rescate no
//        completa el slot 0, el «sin-archivo» quedaba servido
//        para siempre con digest.logo_file sellado y el archivo
//        respondiendo 200 en /media (week-ev5: logo.estado
//        «sin-archivo» con logo-trial-soulcycle.jpg vivo).
//   (R3) EL LOCK SALTEABA EL GUARDA. trialLockServePayload servia
//        el snapshot del candado (y rehidrataba trial_cache con
//        el) SIN pasar por trialFundamentoContradice: la guarda
//        A4 cubria trialCacheServe e importTrialWeek, pero el
//        invitado que vuelve cae por el candado — la semana
//        contradictoria se sirvio por ahi en 0,7 s (verificado
//        pre-reseteo por el liberador del destrabe).
//   (R4) LA ESCALACION NO ESCALABA. El Cierre 7 solo contaba
//        cierres cuyas pendientes cerraran TODAS por un motivo de
//        RESCATE_MOTIVOS_BLOQUEO (tope/veredicto); un rescate
//        trabado por fallos de generacion repetidos sobre el
//        mismo insumo (generacion-fallo/compuesto-fallo) nunca
//        acumulaba cierres, la escalacion nunca sellaba y
//        avisoRescateHumano — que solo corre dentro de
//        declararRescateDetenido — nunca producia el caso. Cada
//        cadena fresca (barrido */5, resumidor, reinicio por
//        deploy: los mapas y timers viven en memoria) reponia
//        sus 6 pasadas: la corrida contestada ciclo 25+ min
//        quemando demo (163→187 llamadas) con las piezas clavadas
//        en armado (gen-status arming:5) y cero casos
//        prueba_trabada en el conserje. La firma y los umbrales
//        existian; la puerta de conteo los dejaba inalcanzables
//        para esta clase de traba.
//
// FASE 2 · EL ARREGLO (solo server.js + el re-pin A12 de la suite
// del cierre 7, declarado):
//   (R1) El set de nombres de la web se arma de TODAS sus
//        superficies (webData.services como strings u objetos +
//        deep.catalog.items + deep.bioLink.items) y la cuarentena
//        PROPAGA por nombre a cada lista derivada del inventario;
//        la estrella inferida o el protagonista que nombran un
//        item en cuarentena no tematizan ninguna pieza.
//   (R2) trialPayloadLogoRefresh: recomputa el estado del ARCHIVO
//        del logo contra el digest sellado (el valor que el spec
//        da con el archivo presente: 'sellado-pendiente-de-qa') y
//        anota el archivo; no toca el veredicto de la pieza. Se
//        aplica en el stream tras la cosecha, en trialCacheServe
//        y en trialLockServePayload (lo servido y lo rehidratado).
//   (R3) trialLockServePayload pasa por trialFundamentoContradice
//        ANTES de decorar/rehidratar: si contradice, no se sirve,
//        no se rehidrata y la fila de trial_cache de la clave se
//        borra; el llamador sigue su camino sin snapshot.
//   (R4) Dos capas, contra las tres propiedades del diagnóstico
//        del operativo (el rescate clavado quemó 27 llamadas
//        demo-ai-image ≈ USD 6,75 en ~55 min sin un solo caso):
//        (i) el conteo de cierres ya no exige la clase del motivo —
//        TODO cierre de cadena sin completar ninguna pieza cuenta
//        con el motivo real (vocabulario completo: ningún motivo
//        veta el conteo para siempre) y a los 3 la semana sella su
//        escalacion, con desbloqueo tambien para los motivos
//        transitorios; (ii) el LIBRO DE PASADAS por semana
//        (payload.rescate_libro, en base): cada pasada sin
//        completar ninguna pieza suma una, completar una pieza lo
//        reinicia, el insumo nuevo lo reinicia; al agotarlo (12 =
//        dos presupuestos de cadena) la pasada en curso declara la
//        detencion y sella la escalacion con el motivo dominante
//        real. La cuenta sobrevive a la muerte del proceso (un
//        deploy no la evapora: la cadena que el barrido reanuda
//        CONTINUA el libro) y el re-enganche sobre la semana
//        escalada re-dispara el aviso (dedup: un solo caso).
//
// Se corre desde la raiz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-destrabe-resto.js
// Control contra la base prístina v1113: PZ_ROOT=<base> (las
// secciones funcionales caen: las funciones no existen o el
// comportamiento es el de la falla).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function seccion(s) { console.log('\n[' + s + ']'); }
function normTxt(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

// Stub de rubroId con el contrato real (el mismo de la suite del
// destrabe): candidatas por palabras del texto; reconcileSources
// con la semantica de rubro-id.js.
const rubroIdStub = {
  classifyBusiness: (s) => {
    const text = [s.bio || '', s.fullName || '', s.webText || '', s.catalogText || '', ...(s.captions || [])].join(' ').toLowerCase();
    const candidatas = [];
    if (/fitness|gym|cycling|yoga|pilates|entrenamiento/.test(text)) candidatas.push({ rubro: 'fitness', score: 5 });
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

/* ── A · Censo de cableado ─────────────────────────────────────── */
seccion('A · censo de cableado');
{
  const iBuild = SERVER.indexOf('function buildTrialDigest');
  const cuerpoBuild = iBuild >= 0 ? SERVER.slice(iBuild, iBuild + 26000) : '';
  ok(cuerpoBuild.includes('(((deep && deep.catalog && deep.catalog.items) || [])).forEach(sumarNombreWebQ);'), 'A1 el set de nombres de la web suma el catalogo profundo');
  ok(cuerpoBuild.includes('(((deep && deep.bioLink && deep.bioLink.items) || [])).forEach(sumarNombreWebQ);'), 'A2 el set de nombres de la web suma el link de bio');
  ok(cuerpoBuild.includes("typeof x === 'string' ? x :"), 'A3 el set lee el nombre como venga (webData.services son strings)');
  const iCuar = SERVER.indexOf('function trialDigestCuarentenaWeb');
  const cuerpoCuar = iCuar >= 0 ? SERVER.slice(iCuar, iCuar + 9000) : '';
  ok(cuerpoCuar.includes('digest.productos_nombrados') && cuerpoCuar.includes('digest.photo_map') && cuerpoCuar.includes('digest.lexicon'), 'A4 la cuarentena propaga a productos_nombrados, photo_map y lexicon');
  ok(cuerpoCuar.includes('digest.catalog') && cuerpoCuar.includes('digest.bio_link') && cuerpoCuar.includes('digest.protagonista'), 'A5 la cuarentena propaga a catalog, bio_link y protagonista');
  ok(SERVER.includes('function trialPayloadLogoRefresh'), 'A6 existe trialPayloadLogoRefresh');
  const iServe = SERVER.indexOf('function trialCacheServe');
  const cuerpoServe = iServe >= 0 ? SERVER.slice(iServe, iServe + 6000) : '';
  ok(cuerpoServe.includes('trialPayloadLogoRefresh(probe)'), 'A7 trialCacheServe sirve con el estado real del logo');
  const iLock = SERVER.indexOf('function trialLockServePayload');
  const cuerpoLock = iLock >= 0 ? SERVER.slice(iLock, iLock + 4500) : '';
  ok(cuerpoLock.includes('trialFundamentoContradice(out)'), 'A8 el camino del lock pasa por el guarda de contradiccion (R3)');
  ok(cuerpoLock.includes('trialPayloadLogoRefresh(out)'), 'A9 el snapshot del lock se sirve con el estado real del logo (R2)');
  ok(SERVER.includes('trialPayloadLogoRefresh({ digest: trialDigest, primer_posteo: ppRecS })'), 'A10 el stream refresca la proyeccion tras la cosecha del logo');
  const iRescate = SERVER.indexOf('async function scheduleWeekRescue');
  const cuerpoRescate = iRescate >= 0 ? SERVER.slice(iRescate, iRescate + 42000) : '';
  ok(cuerpoRescate.includes('const cuentaCierreD = applied === 0 && motivosPendD.length > 0;'), 'A11 el conteo de cierres ya no exige la clase del motivo (R4)');
  ok(!cuerpoRescate.includes('motivosPendD.every((m) => RESCATE_MOTIVOS_BLOQUEO.has(m))'), 'A12 el filtro de clase del Cierre 7 salio del conteo');
  const iDesb = SERVER.indexOf('function rescateDesbloqueoPara');
  const cuerpoDesb = iDesb >= 0 ? SERVER.slice(iDesb, iDesb + 2200) : '';
  ok(cuerpoDesb.includes("case 'generacion-fallo':") && cuerpoDesb.includes("case 'pasadas-agotadas':"), 'A13 la escalacion nombra su desbloqueo tambien para los motivos transitorios');
  ok(cuerpoRescate.includes('rescate_libro') && cuerpoRescate.includes('RESCATE_LIBRO_TOPE_PASADAS') && cuerpoRescate.includes('libroAgotadoR'), 'A14 el presupuesto de pasadas vive en el payload (rescate_libro), no en la cadena ni en memoria (R4, propiedades 1 y 2)');
  const iRearme = SERVER.indexOf('async function rearmarSemanaPruebaPorCacheKey');
  const cuerpoRearme = iRearme >= 0 ? SERVER.slice(iRearme, iRearme + 6000) : '';
  ok(/avisoRescateHumano\(cacheKey, payload\.escalacion\.motivo/.test(cuerpoRearme), 'A15 el re-enganche sobre la semana escalada re-dispara el aviso al conserje (dedup: un solo caso)');
}

/* ── B · R1 funcional VM: buildTrialDigest real + client-digest real ── */
seccion('B · R1 funcional VM (fuente real): la cuarentena sale de TODAS las listas');
let buildFn = null;
{
  let clientDigest = null;
  try { clientDigest = require(path.join(ROOT, 'client-digest.js')); } catch (e) { clientDigest = null; }
  const iA0 = SERVER.indexOf('// (LOTE DESTRABE-SOULCYCLE · piezas A1/A2/A4)');
  const iA1 = SERVER.indexOf('function trialCacheServe(');
  const iB0 = SERVER.indexOf('function applyTrialMasVendido');
  const iB1 = SERVER.indexOf('function trialPreguntaGate');
  if (clientDigest && iA0 >= 0 && iA1 > iA0 && iB0 >= 0 && iB1 > iB0) {
    try {
      const ctx = { console, clientDigest, rubroId: rubroIdStub };
      vm.createContext(ctx);
      vm.runInContext(SERVER.slice(iA0, iA1) + '\n' + SERVER.slice(iB0, iB1) + '\nthis.__B = buildTrialDigest;', ctx);
      buildFn = ctx.__B;
    } catch (e) { buildFn = null; }
  }
}
const BMX = ['Rotor Set Install', 'Bars Cutting', 'General BMX Maintenance', 'HALLOWEEN RIDE-OUT 2026', 'KINK 2027 COLLECTION', 'WHEELS OF STEEL'];
const BMX_NORM = new Set(BMX.map(normTxt));
function sinBMX(lista, campo) {
  const items = (lista || []).map((it) => normTxt(typeof it === 'string' ? it : (it && (it.nombre || it.item)) || ''));
  return items.every((n) => !BMX_NORM.has(n));
}
function funcionalB() {
  ok(typeof buildFn === 'function', 'B0 buildTrialDigest se extrae del fuente real con el client-digest real');
  if (!buildFn) return;
  // El fixture de la corrida contestada, con las formas REALES de
  // cada superficie: webData.services como STRINGS (web-extract),
  // catalogo profundo como objetos, photoEntries como mapa.
  const dg = buildFn({
    business: 'SoulCycle', category: 'fitness',
    webData: {
      name: 'soulcyclebmx', description: 'Soulcycle is a BMX shop in Amsterdam. Rotor Set Install, Bars Cutting and general BMX maintenance.',
      services: ['Rotor Set Install', 'Bars Cutting', 'General BMX Maintenance'],
      city: 'Amsterdam', palette: [], url: 'https://soulcycle.com/', categoryHint: '',
    },
    feed: {
      bio: 'Fitness studio — ride with us', name: 'SoulCycle', handle: 'soulcycle', pic: '',
      captions: ['GO ALL IN. The final week of TURN IT UP, our 30-day challenge', "It's never just been about the bike. Your people are waiting."],
    },
    formText: '', feedPalette: null, registro: null,
    deep: {
      catalog: { items: BMX.map((n) => ({ name: n })), pages: 3, pdfs: 0 },
      bioLink: null,
      photoEntries: {
        'https://soulcycle.com/cdn/shop/files/soulcycle-banner.jpg': { item: 'WHEELS OF STEEL', confianza: 0.9, marca: true },
        'https://soulcycle.com/cdn/shop/files/halloween.png': { item: 'HALLOWEEN RIDE-OUT 2026', confianza: 0.8, marca: true },
      },
      brandPresence: null, logoIntegracion: null,
    },
    rubro: { category: 'fitness', subcat: '', rubroId: undefined, reconciliacion: null },
    onboarding: null, draft: null, comments: null, offerSheet: null, feedMap: null,
    starSignals: null, feedPosts: null, igLinkState: null,
  });
  ok(!!dg && typeof dg === 'object', 'B1 el digest de la corrida se construye', dg && Object.keys(dg).length);
  if (!dg) return;
  ok(!!dg.reconciliacion && dg.reconciliacion.contradiccion === true, 'B2 la reconciliacion efectiva declara la contradiccion (A1 sigue en pie)', dg.reconciliacion);
  ok(!!dg.web_cuarentena && BMX.every((n) => (dg.web_cuarentena.items || []).some((x) => normTxt(x) === normTxt(n))), 'B3 la cuarentena registra los 6 items de la web', dg.web_cuarentena);
  ok(sinBMX(dg.productos), 'B4 productos sin ningun item en cuarentena (LA FALLA: en v1112 quedaban los 6)', (dg.productos || []).map((x) => x.nombre));
  ok(sinBMX(dg.servicios), 'B5 servicios sin ningun item en cuarentena', (dg.servicios || []).map((x) => x.nombre));
  ok(sinBMX(dg.productos_nombrados), 'B6 productos_nombrados sin ningun item en cuarentena', (dg.productos_nombrados || []).map((x) => x.nombre));
  ok(!dg.catalog || sinBMX(dg.catalog.items), 'B7 el catalogo completo sin ningun item en cuarentena', dg.catalog && (dg.catalog.items || []).map((x) => x.nombre));
  const pmItems = dg.photo_map && dg.photo_map.entries ? Object.values(dg.photo_map.entries).map((e) => e && e.item) : [];
  ok(pmItems.every((n) => !BMX_NORM.has(normTxt(n))), 'B8 el photo_map no mapea fotos de la web a items en cuarentena', pmItems);
  const lexItems = dg.lexicon && dg.lexicon.entries ? dg.lexicon.entries.map((e) => e && e.item) : [];
  ok(lexItems.every((n) => !BMX_NORM.has(normTxt(n))), 'B9 el lexicon no aprende items en cuarentena', lexItems);
  ok(!dg.inferred_star || !BMX_NORM.has(normTxt(dg.inferred_star.nombre || '')), 'B10 la estrella inferida no es un item en cuarentena', dg.inferred_star);
  ok(!dg.protagonista || !BMX_NORM.has(normTxt(dg.protagonista)), 'B11 el protagonista no es un item en cuarentena', dg.protagonista);
}

/* ── C · R2 funcional VM: el refresco de la proyeccion del logo ── */
seccion('C · R2 funcional VM (fuente real): la proyeccion muestra el estado real del logo');
const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-resto-media-'));
let refreshFn = null;
{
  const i0 = SERVER.indexOf('function trialLogoAbsPath');
  const i1 = SERVER.indexOf('// ---------- 🏠 HOME');
  if (i0 >= 0 && i1 > i0) {
    try {
      const ctx = { fs, path, MEDIA_DIR: MEDIA_TMP, console };
      vm.createContext(ctx);
      vm.runInContext(SERVER.slice(i0, i1) + '\nthis.__R = (typeof trialPayloadLogoRefresh === "function") ? trialPayloadLogoRefresh : null;', ctx);
      refreshFn = ctx.__R;
    } catch (e) { refreshFn = null; }
  }
}
function funcionalC() {
  ok(typeof refreshFn === 'function', 'C0 trialPayloadLogoRefresh se extrae del fuente real');
  if (!refreshFn) return;
  fs.writeFileSync(path.join(MEDIA_TMP, 'logo-trial-soulcycle.jpg'), Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]));
  // El payload EXACTO de la grieta (week-ev5): digest con el
  // archivo sellado, registro con el estado del spec sin archivo.
  const p1 = {
    digest: { logo_file: 'logo-trial-soulcycle.jpg' },
    primer_posteo: { etapa: 'final', armando: true, logo: { requerido: true, estado: 'sin-archivo', metodo: 'hibrido-sello-real', veredicto: null }, veredicto: { pasa: false, cadena: 'en-rescate', motivos: ['rescate-en-fondo'] } },
  };
  const verdAntes = JSON.stringify(p1.primer_posteo.veredicto);
  eq(refreshFn(p1), true, 'C1 con el archivo sellado en el digest, el refresco actua');
  eq(p1.primer_posteo.logo.estado, 'sellado-pendiente-de-qa', 'C2 el estado servido es el real: hay archivo, sello pendiente de QA');
  eq(p1.primer_posteo.logo.file, 'logo-trial-soulcycle.jpg', 'C3 el registro anota el archivo');
  eq(JSON.stringify(p1.primer_posteo.veredicto), verdAntes, 'C4 el veredicto de la pieza NO se toca (su cadena sigue mandando)');
  const p2 = { digest: { logo_file: '' }, primer_posteo: { logo: { estado: 'sin-archivo' } } };
  eq(refreshFn(p2), false, 'C5 sin archivo en el digest no se inventa estado');
  eq(p2.primer_posteo.logo.estado, 'sin-archivo', 'C6 el registro sin logo queda como estaba');
  const p3 = { digest: { logo_file: 'logo-trial-soulcycle.jpg' }, primer_posteo: { logo: { estado: 'sellado-verificado' } } };
  eq(refreshFn(p3), false, 'C7 un estado ya sellado no se pisa');
  const p4 = { digest: { logo_file: 'logo-que-no-existe.jpg' }, primer_posteo: { logo: { estado: 'sin-archivo-de-logo' } } };
  eq(refreshFn(p4), false, 'C8 si el archivo no existe en disco, no hay refresco (regla de verdad)');
}

/* ── D · R3 funcional VM: el lock no sirve la semana contradictoria ── */
seccion('D · R3 funcional VM (fuente real): el camino del lock tambien frena');
let lockFn = null; const lockDeletes = []; let lockDecorados = 0;
{
  const iA0 = SERVER.indexOf('// (LOTE DESTRABE-SOULCYCLE · piezas A1/A2/A4)');
  const iA1 = SERVER.indexOf('function trialCacheServe(');
  const iR0 = SERVER.indexOf('function trialLogoAbsPath');
  const iR1 = SERVER.indexOf('// ---------- 🏠 HOME');
  const iL0 = SERVER.indexOf('function trialLockServePayload');
  const iL1 = SERVER.indexOf('function trialLockRecordFor');
  if (iA0 >= 0 && iA1 > iA0 && iR0 >= 0 && iR1 > iR0 && iL0 >= 0 && iL1 > iL0) {
    try {
      const ctx = {
        console, rubroId: rubroIdStub, fs, path, MEDIA_DIR: MEDIA_TMP,
        db: { prepare: (sql) => ({ run: (ig) => { if (String(sql).includes('DELETE FROM trial_cache')) lockDeletes.push(ig); }, get: () => null }) },
        trialLock: { decorateSnapshot: (lock, out) => { lockDecorados++; return { ...out, decorado: true }; } },
        spotsLeft: () => 49, buildTrialWeek: () => [],
      };
      vm.createContext(ctx);
      vm.runInContext(SERVER.slice(iR0, iR1) + '\n' + SERVER.slice(iA0, iA1) + '\n' + SERVER.slice(iL0, iL1) + '\nthis.__L = trialLockServePayload;', ctx);
      lockFn = ctx.__L;
    } catch (e) { lockFn = null; }
  }
}
function funcionalD() {
  ok(typeof lockFn === 'function', 'D0 trialLockServePayload se extrae del fuente real');
  if (!lockFn) return;
  const payloadContra = {
    business: 'SoulCycle', category: 'fitness', ig: 'soulcycle',
    web_info: { url: 'https://soulcycle.com/', name: 'soulcyclebmx', description: 'Soulcycle is a BMX shop in Amsterdam' },
    digest: { reconciliacion: { contradiccion: true, motivo: 'web_no_encaja' }, servicios: [{ nombre: 'Rotor Set Install', fuente: 'web' }], logo_file: '' },
    posts: [],
  };
  const lockContra = { ig: 'soulcycle', payload: JSON.stringify(payloadContra) };
  const antes = lockDecorados;
  eq(lockFn(lockContra), null, 'D1 el snapshot contradictorio NO se sirve por el lock (LA FALLA: en v1112 se servia en 0,7 s)');
  eq(lockDecorados, antes, 'D2 el snapshot contradictorio ni siquiera se decora (no se rehidrata)');
  ok(lockDeletes.includes('soulcycle'), 'D3 la fila de trial_cache de la clave se borra', lockDeletes);
  const payloadSano = {
    business: 'SoulCycle', category: 'fitness', ig: 'soulcycle',
    web_info: { url: 'https://www.soul-cycle.com/', name: 'SoulCycle', description: 'Fitness studio: cycling classes and training' },
    digest: { reconciliacion: { contradiccion: true, motivo: 'web_no_encaja', resuelta_por: 'confirmacion' }, servicios: [{ nombre: 'Clase de cycling', fuente: 'web' }], logo_file: '' },
    posts: [],
  };
  const outSano = lockFn({ ig: 'soulcycle', payload: JSON.stringify(payloadSano) });
  ok(!!outSano && outSano.decorado === true, 'D4 el snapshot sano se sirve como siempre', outSano && Object.keys(outSano));
}

/* ── E · R4 funcional VM: el rescate trabado declara y escala ──── */
seccion('E · R4 funcional VM (fuente real): la detencion se declara y le llega a un humano');
let rescateCtx = null; const casosE = [];
{
  const i0 = SERVER.indexOf('const SEMANA_REARME_MAX_PASADAS');
  const i1 = SERVER.indexOf('// (LOTE LOGO-PRUEBA-REARME · puntos 1 y 4) REFRESCO');
  if (i0 >= 0 && i1 > i0) {
    const cacheStore = new Map();
    const dbStub = {
      prepare: (sql) => {
        const s = String(sql);
        if (s.includes('SELECT payload FROM trial_cache')) return { get: (ig) => (cacheStore.has(ig) ? { payload: cacheStore.get(ig) } : undefined) };
        if (s.includes('INSERT INTO trial_cache')) return { run: (ig, payload) => { cacheStore.set(ig, payload); } };
        return { get: () => undefined, run: () => ({}) };
      },
    };
    try {
      const ctx = {
        console, fs, os, path, crypto, setTimeout, clearTimeout,
        db: dbStub,
        rescuePieceWithSealDetalle: async () => ({ ok: false, motivo: 'generacion-fallo' }),
        trialLogoAbsPath: () => null,
        refrescarLogoPrueba: async () => null,
        crearPosteoRescateTardio: () => null,
        scheduleAllDrafts: () => {},
        evTrack: () => {},
        guestTrial: { findGuestByIdentity: () => ({ id: 104 }) },
        supportCases: { openCase: (dbArg, args) => { casosE.push(args); return { ok: true, id: 88 }; } },
      };
      vm.createContext(ctx);
      vm.runInContext(SERVER.slice(i0, i1) + '\nthis.__E = { scheduleWeekRescue, __cache: null };', ctx);
      rescateCtx = { fn: ctx.__E.scheduleWeekRescue, cacheStore };
    } catch (e) { rescateCtx = null; }
  }
}
async function funcionalE() {
  ok(!!rescateCtx && typeof rescateCtx.fn === 'function', 'E0 scheduleWeekRescue se extrae del fuente real');
  if (!rescateCtx) return;
  const payload0 = {
    business: 'SoulCycle', category: 'fitness', ig: 'soulcycle',
    digest: { hash: 'h1-resto' },
    posts: [
      { type: 'image', image: null, armando: true, headline: 'Book Rotor Set Install today', caption: 'x' },
      { type: 'image', image: null, armando: true, headline: 'Bars Cutting', caption: 'y' },
    ],
    rescate_semana: [
      { idx: 0, cadena: 'en-rescate', motivo: 'cadena-en-fondo' },
      { idx: 1, cadena: 'en-rescate', motivo: 'cadena-en-fondo' },
    ],
    rescate_cierres: { n: 0, at: Date.now() },
  };
  rescateCtx.cacheStore.set('soulcycle', JSON.stringify(payload0));
  const args = {
    cacheKey: 'soulcycle', digestHash: 'h1-resto', business: 'SoulCycle', logoPath: '/tmp/logo-fix.png', accent: null, apiKey: '', geminiKey: '', intento: 6,
    pieces: [
      { idx: 0, prompt: 'p0', topicText: 't0', headline: 'Book Rotor Set Install today', textMode: '' },
      { idx: 1, prompt: 'p1', topicText: 't1', headline: 'Bars Cutting', textMode: '' },
    ],
  };
  const leer = () => JSON.parse(rescateCtx.cacheStore.get('soulcycle'));
  await rescateCtx.fn(args);
  let pl = leer();
  eq(pl.rescate_cierres && pl.rescate_cierres.n, 1, 'E1 cadena 1 sin completar ninguna pieza (motivo transitorio): el cierre CUENTA (en v1113 quedaba en 0 para siempre)');
  ok(!pl.escalacion, 'E2 un cierre no escala todavia');
  ok(casosE.some((c) => c.tipo === 'prueba_trabada' && c.userId === 104), 'E3 la detencion declarada ya abrio su caso para un humano', casosE.map((c) => c.dedupKey));
  await rescateCtx.fn(args);
  pl = leer();
  eq(pl.rescate_cierres && pl.rescate_cierres.n, 2, 'E4 cadena 2 (fresca, como tras un deploy): el contador persiste entre cadenas');
  await rescateCtx.fn(args);
  pl = leer();
  eq(pl.rescate_cierres && pl.rescate_cierres.n, 3, 'E5 cadena 3: tercer cierre sin completar ninguna pieza');
  ok(!!pl.escalacion && pl.escalacion.motivo === 'generacion-fallo', 'E6 la semana ESCALA con el motivo real de la traba', pl.escalacion);
  ok(!!pl.escalacion && /generación falla/i.test(pl.escalacion.desbloqueo || ''), 'E7 la escalacion nombra su desbloqueo', pl.escalacion && pl.escalacion.desbloqueo);
  ok(pl.posts.every((p) => p.rescate && p.rescate.estado === 'escalado'), 'E8 cada pieza declara su estado escalado con su motivo');
  ok(casosE.some((c) => c.tipo === 'prueba_trabada' && String(c.detalle || '').includes('generacion-fallo')), 'E9 el caso del conserje lleva el motivo real de la traba', casosE.map((c) => c.dedupKey));
}

async function funcionalLibro() {
  // (R4 · propiedades 1 y 2 del diagnóstico del operativo) El ciclo
  // REAL del rescate clavado: cadenas que un deploy mata a mitad de
  // camino — ninguna llega a su cierre natural (intento 5 de 6: la
  // pasada programa la siguiente y el proceso «muere»). En v1113 el
  // contador vivía en la cadena: 12 fragmentos así dejaban la semana
  // exactamente igual que al principio, sin caso y quemando. Con el
  // libro en el payload, la cuenta cruza los fragmentos y al
  // agotarlo la semana declara, escala y avisa.
  if (!rescateCtx) return;
  const payloadL = {
    business: 'SoulCycle', category: 'fitness', ig: 'soulcycle',
    digest: { hash: 'h2-libro' },
    posts: [
      { type: 'image', image: null, armando: true, headline: 'Book Rotor Set Install today', caption: 'x' },
      { type: 'image', image: null, armando: true, headline: 'Bars Cutting', caption: 'y' },
    ],
    rescate_semana: [
      { idx: 0, cadena: 'en-rescate', motivo: 'cadena-en-fondo' },
      { idx: 1, cadena: 'en-rescate', motivo: 'cadena-en-fondo' },
    ],
    rescate_cierres: { n: 0, at: Date.now() },
  };
  rescateCtx.cacheStore.set('soulcycle-libro', JSON.stringify(payloadL));
  const argsL = {
    cacheKey: 'soulcycle-libro', digestHash: 'h2-libro', business: 'SoulCycle', logoPath: '/tmp/logo-fix.png', accent: null, apiKey: '', geminiKey: '', intento: 5,
    pieces: [
      { idx: 0, prompt: 'p0', topicText: 't0', headline: 'Book Rotor Set Install today', textMode: '' },
      { idx: 1, prompt: 'p1', topicText: 't1', headline: 'Bars Cutting', textMode: '' },
    ],
  };
  const leerL = () => JSON.parse(rescateCtx.cacheStore.get('soulcycle-libro'));
  for (let i = 0; i < 11; i++) await rescateCtx.fn(argsL);
  let pl = leerL();
  eq(pl.rescate_libro && pl.rescate_libro.pasadas, 11, 'E10 once fragmentos de cadena cortados por «deploys»: el libro contó 11 pasadas en el payload (en v1113 no existía cuenta alguna entre cadenas)');
  eq(pl.rescate_cierres && pl.rescate_cierres.n, 0, 'E11 ningún fragmento llegó a un cierre natural: el conteo de cierres sigue en 0 y AUN ASÍ la semana no se evaporó');
  ok(!pl.escalacion, 'E12 el libro todavía no se agotó: no escala antes de tiempo');
  await rescateCtx.fn(argsL);
  pl = leerL();
  eq(pl.rescate_libro && pl.rescate_libro.pasadas, 12, 'E13 pasada 12: el libro se agota (2 presupuestos de cadena, contados por semana)');
  ok(!!pl.escalacion && pl.escalacion.motivo === 'generacion-fallo', 'E14 la semana ESCALA con el motivo real aunque ninguna cadena cerró entera', pl.escalacion);
  ok(pl.posts.every((p) => p.rescate && p.rescate.estado === 'escalado'), 'E15 cada pieza declara su estado escalado');
  ok(casosE.some((c) => c.tipo === 'prueba_trabada' && String(c.dedupKey || '').includes('soulcycle-libro')), 'E16 el caso «prueba_trabada» de ESTA clave llegó al conserje', casosE.map((c) => c.dedupKey));
}

/* ── F · Boot smoke ────────────────────────────────────────────── */
seccion('F · boot smoke del servidor');
async function bootSmoke() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 18900 + Math.floor(Math.random() * 200);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-resto-data-'));
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
      const r400 = await fetch('http://127.0.0.1:' + port + '/api/trial/gen-status').catch(() => null);
      ok(!!r400 && r400.status === 400, 'F2 /api/trial/gen-status (la superficie del arming) responde con su contrato', r400 && r400.status);
    }
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  funcionalB();
  funcionalC();
  funcionalD();
  await funcionalE();
  await funcionalLibro();
  await bootSmoke();
  try { fs.rmSync(MEDIA_TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n== DESTRABE-RESTO: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
