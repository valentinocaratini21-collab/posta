// test-lote-b-formato-diag.js — LOTE B · FORMATO SIN SILENCIO
// (instrumentación del formato de la prueba; spec §4.4 + §5 Lote B del
// diagnóstico imagen/formato de la corrida Veja #5).
//
// El diagnóstico probó que la pérdida de formato en la prueba era
// INDISTINGUIBLE entre 3 puntos porque ninguno dejaba registro: el
// digest podía nacer sin formatos (carrera perdida) sin log, el
// fallback de buildDemoSpec vivía solo dentro del spec cacheado, la
// promoción del stream dejaba un warn suelto y la importación que
// degradaba carrusel→foto era muda. Este lote SOLO observa y registra
// (ninguna decisión de formato cambia — eso lo gobiernan C5 y
// FORMATO-SEMANA):
//   1. demo.buildDemoSpec devuelve formato_diag estructurado SIEMPRE
//      (dominante, feed_posts, pool, candidatos, carruseles, fallback
//      por motivo con detalle por pieza, promocion_fallida).
//   2. generateDemo cuenta las promociones fallidas de su armado y las
//      devuelve en formato_diag; el stream cuenta las suyas.
//   3. Ambas rutas vuelcan el resumen a out.formato_diag (viaja al
//      trial_cache) y emiten UNA línea [formato-marca] trial … al
//      cerrar la generación.
//   4. importTrialWeek loguea cada pieza degradada (idx + motivo
//      album<2 / sin-images) y, si el dominante era carrusel y la
//      semana importada salió con 0 carruseles, persiste el evento
//      trial_formato_degradado (tabla events, consultable por admin).
//
// Uso: node test-lote-b-formato-diag.js [árbol]
//   Sin argumento corre contra ./release. Contra la base (v1006) corre
//   en modo CONTROL: formato_diag no existe, la importación degrada en
//   silencio y no hay evento — el comportamiento VISIBLE (posteos y
//   formatos importados) es idéntico en ambos modos y se aserta igual.
//
// Parte 0 (estática): el cableado de las dos rutas y del import.
// Parte 1 (unitaria): buildDemoSpec → formato_diag en 4 fixtures.
// Parte 2 (boot real, DATA_DIR temporal, sin claves de IA): payloads
//   de trial_cache + registro con trial_ig → importTrialWeek real:
//   degradación album<2 (log + evento), degradación sin-images
//   (log + evento), importación sana (sin evento), payload viejo sin
//   formato_diag (log sí, evento no: sin dominante no se atribuye).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.argv[2] || path.join(__dirname, 'release'));
const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const demoSrc = fs.readFileSync(path.join(TREE, 'demo.js'), 'utf8');
const MODE = serverSrc.includes('trial_formato_degradado') ? 'release' : 'base';
console.log(`Árbol: ${TREE} — modo: ${MODE}`);

// DATA_DIR del proceso de la suite ANTES de requerir módulos del árbol
// (db.js abre la DB al requerirse): un temporal propio, jamás el árbol.
const SUITE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-suite-'));
process.env.DATA_DIR = SUITE_TMP;

const clientDigest = require(path.join(TREE, 'client-digest.js'));
const demo = require(path.join(TREE, 'demo.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } }

const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';
const sidecar = () => ({ type: 'GraphSidecar', caption: 'post' });
const gimage = () => ({ type: 'GraphImage', caption: 'post' });
const feedDe = (arr) => ({ bio: 'tienda de zapatillas', captions: arr.map(() => 'zapatillas de lona'), name: 'Marca', handle: 'marca' });

/* ================= Parte 0 · cableado (estática) ================= */
console.log('— Parte 0: cableado de rutas e importación —');
const count = (s, sub) => s.split(sub).length - 1;
if (MODE === 'release') {
  ok(count(serverSrc, 'trialFormatoDiagLog(') === 3, 'trialFormatoDiagLog: 1 definición + 2 llamadas (sync y stream)');
  ok(serverSrc.includes('formato_diag: genFormatoDiag || null'), 'ruta sync: out.formato_diag desde generateDemo');
  ok(serverSrc.includes('formato_diag: spec.formato_diag || null'), 'ruta stream: out.formato_diag desde el spec');
  ok(serverSrc.includes("'trial_formato_degradado'"), 'importación: evento trial_formato_degradado presente');
  ok(serverSrc.includes('pieza degradada a foto motivo='), 'importación: log por pieza degradada con motivo');
  ok(serverSrc.includes("fdImp.dominante === 'carrusel'"), 'importación: el evento exige dominante carrusel conocido (payload sin diag no atribuye)');
  ok(demoSrc.includes('formato_diag: formatoDiagB'), 'buildDemoSpec devuelve formato_diag');
  ok(demoSrc.includes('formato_diag: formatoDiagGen') && demoSrc.includes('promocionFallidaB++;'), 'generateDemo cuenta y devuelve promocion_fallida');
  ok(serverSrc.includes('streamPromocionFallida++;'), 'stream cuenta sus promociones fallidas');
} else {
  ok(!serverSrc.includes('trialFormatoDiagLog') && !serverSrc.includes('trial_formato_degradado'), 'CONTROL base: ni helper de log ni evento existen');
  ok(!demoSrc.includes('formatoDiagB'), 'CONTROL base: buildDemoSpec no produce diagnóstico estructurado');
}

/* ================= Parte 1 · buildDemoSpec ================= */
console.log('— Parte 1: formato_diag del spec —');
const imgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-imgs-'));
const tinyBuf = Buffer.from(TINY_JPG.split(',')[1], 'base64');
const mkJpg = (name) => { const p = path.join(imgDir, name); fs.writeFileSync(p, tinyBuf); return p; };
const userJpg = mkJpg('user.jpg');
const webPhotos = [1, 2, 3, 4].map((i) => ({ path: mkJpg('web' + i + '.jpg'), temas: ['zapatillas', 'lona'], url: 'https://example.com/' + i }));
function specCon(digest, extra) {
  return demo.buildDemoSpec(Object.assign({
    business: 'Veja Like', category: 'moda', country: 'AR', tone: null,
    photoPath: userJpg, goal: null, accent: '#2793C8', btn: '#0A1E33',
    count: 3, bioText: '', profilePicPath: null, feedRegister: null,
    extraPhotos: webPhotos, digest, lang: 'es', trialNoStock: true,
  }, extra || {}));
}
const dgCarr = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1, 2, 3, 4, 5, 6]), feedPosts: [sidecar(), sidecar(), sidecar(), sidecar(), sidecar(), sidecar()] });
const dgFoto = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1, 2, 3, 4, 5, 6]), feedPosts: [gimage(), gimage(), gimage(), gimage(), gimage(), gimage()] });
const dgNulo = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1]) });

const sA = specCon(dgCarr);
const sE = specCon(dgCarr, { extraPhotos: [] });
const sD = specCon(dgNulo);
const sB = specCon(dgFoto);
// El comportamiento visible del spec es el de C5 en AMBOS modos:
ok(sA.formato && sA.formato.dominante === 'carrusel' && sA.formato.carrusel >= 1, '(a) spec.formato de C5 intacto: dominante carrusel, ≥1 pieza marcada');
ok(sE.formato && sE.formato.carrusel === 0 && sE.formato.fallback >= 1, '(e) spec.formato de C5 intacto: sin pool, 0 carruseles y fallback contado');
ok(sD.formato === null && sD.specPosts.every((p) => !p.formato), '(d) digest sin dato → spec.formato null, comportamiento histórico');
if (MODE === 'release') {
  const dA = sA.formato_diag;
  ok(dA && dA.dominante === 'carrusel' && dA.feed_posts === 6, `(a) formato_diag: dominante carrusel, feed_posts=6 (${JSON.stringify(dA)})`);
  ok(dA.pool === 4 && dA.candidatos >= 1, `(a) pool=4 (el admitido por buildDemoSpec), candidatos=${dA.candidatos}`);
  ok(dA.carruseles === sA.formato.carrusel && dA.promocion_fallida === 0, '(a) carruseles del diag = los del resumen C5; promocion_fallida nace en 0');
  ok(dA.fallbacks.length === 0 && Object.keys(dA.fallback).length === 0, '(a) con material no hay fallbacks registrados');
  const dE = sE.formato_diag;
  const sumaE = Object.values(dE.fallback).reduce((a, b) => a + b, 0);
  ok(dE.carruseles === 0 && sumaE >= 1 && sumaE === sE.formato.fallback, `(e) sin pool: fallback por motivo suma ${sumaE} = el conteo histórico de C5`);
  ok(dE.fallbacks.length === sumaE && dE.fallbacks.every((f) => Number.isInteger(f.idx) && (f.motivo === 'sin-foto-real' || f.motivo === 'sin-material')), '(e) el detalle por pieza trae idx + motivo (ya no vive solo embebido)');
  ok(dE.pool === 0 && dE.feed_posts === 6, '(e) pool=0 con feed_posts=6: la pérdida queda localizada (no fue el feed)');
  const dD = sD.formato_diag;
  ok(dD && dD.dominante === null && dD.feed_posts === 0, '(d) digest sin formatos: el diag EXISTE con dominante null (el punto ciego #1 del diagnóstico, ahora visible)');
  const dB = sB.formato_diag;
  ok(dB && dB.dominante === 'foto' && dB.carruseles === 0 && Object.keys(dB.fallback).length === 0, '(b) dominante foto: diag sin carruseles ni fallbacks');
} else {
  ok(sA.formato_diag === undefined && sE.formato_diag === undefined && sD.formato_diag === undefined, 'CONTROL base: buildDemoSpec no devuelve formato_diag (el detalle moría dentro del spec)');
}

/* ================= Parte 2 · boot real ================= */
const PORT = 18783;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'testtoken-fb';
async function waitBoot(tries = 70) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return await r.json(); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
(async () => {
  console.log('— Parte 2: boot + importación instrumentada —');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-boot-'));
  const NODE_MODULES_PIN = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
  const envHijo = { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: TOKEN };
  if (fs.existsSync(NODE_MODULES_PIN)) envHijo.NODE_PATH = NODE_MODULES_PIN;
  for (const k of Object.keys(envHijo)) if (/OPENAI|ANTHROPIC|FAL_KEY|GEMINI|GOOGLE_API/.test(k)) delete envHijo[k];
  const srv = spawn('node', ['server.js'], { cwd: TREE, env: envHijo, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    const ver = await waitBoot();
    ok(!!ver, 'el server booteó');
    const build = String((ver && (ver.build || ver.BUILD_ID)) || '');
    if (MODE === 'release') ok(build.includes('v1009'), `/api/version = ${build} (v1009 definitivo del lote al aterrizar sobre ADMIN-PROGRAMAR-IMAGEN)`);
    else ok(build.includes('v1008'), `CONTROL base: /api/version = ${build} (v1008, base ADMIN-PROGRAMAR-IMAGEN del aterrizaje)`);

    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const ENGINE = demo.DEMO_ENGINE_V;
    const DIAG_CARR = { dominante: 'carrusel', feed_posts: 6, pool: 4, candidatos: 2, carruseles: 2, fallback: {}, fallbacks: [], promocion_fallida: 0 };
    const payload = (posts, formatoDiag) => JSON.stringify({
      ok: true, engine: ENGINE, business: 'Veja Like', category: 'moda',
      posts,
      design: { posts: posts.map((p, i) => ({ style: '/s' + i, kind: 'social' })), styles: [], photos: [], videoIdx: 0, count: posts.length, engine: ENGINE },
      week: [], digest: dgCarr,
      ...(formatoDiag ? { formato_diag: formatoDiag } : {}),
    });
    const register = async (email, ig) => {
      const r = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'secreto1', trial_ig: ig }),
      });
      return { status: r.status, ok: r.ok };
    };
    const userIdDe = (email) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) || {}).id;
    const postsDe = (uid) => db.prepare('SELECT media_type, carousel_paths FROM posts WHERE user_id = ? ORDER BY id').all(uid);
    const eventosDe = (uid) => db.prepare("SELECT name, props FROM events WHERE user_id = ? AND name = 'trial_formato_degradado'").all(uid);
    const esperaLog = async (frag) => {
      for (let i = 0; i < 20 && !srvLog.includes(frag); i++) await new Promise((r) => setTimeout(r, 250));
      return srvLog.includes(frag);
    };

    // (A) Degradación album<2 con dominante carrusel → log + evento.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
      .run('bdegrada', payload([
        { type: 'carousel', image: TINY_JPG, images: [TINY_JPG, 'data:image/jpeg;base64,@@@'], caption: 'Álbum corto', hashtags: '#moda' },
        { type: 'image', image: TINY_JPG, caption: 'Foto suelta', hashtags: '#moda' },
      ], DIAG_CARR), Date.now());
    const regA = await register('a-fb@example.com', 'bdegrada');
    ok(regA.ok, `registro con álbum insuficiente (${regA.status})`);
    const uA = userIdDe('a-fb@example.com');
    const postsA = postsDe(uA);
    ok(postsA.length === 2 && postsA[0].media_type === 'image' && postsA[1].media_type === 'image',
      `(A) comportamiento visible idéntico en ambos modos: la pieza degradada importa como foto (media_type='${postsA[0] && postsA[0].media_type}')`);
    if (MODE === 'release') {
      ok(await esperaLog('[formato-marca] trial import ig=bdegrada idx=0 pieza degradada a foto motivo=album<2'), '(A) la degradación album<2 quedó en el log con idx y motivo');
      const evA = eventosDe(uA);
      ok(evA.length === 1, `(A) dominante carrusel + 0 carruseles importados → 1 evento trial_formato_degradado (van ${evA.length})`);
      let propsA = {};
      try { propsA = JSON.parse(evA[0].props || '{}'); } catch (e) {}
      ok(propsA.dominante === 'carrusel' && propsA.carruseles === 0 && propsA.importados === 2 && propsA.ig === 'bdegrada',
        `(A) el evento lleva el resumen (dominante/carruseles/importados/ig): ${JSON.stringify(propsA)}`);
    } else {
      ok(!srvLog.includes('trial import ig=bdegrada'), 'CONTROL base: la degradación album<2 es muda (sin log)');
      ok(eventosDe(uA).length === 0, 'CONTROL base: sin evento (el fallo era invisible)');
    }

    // (B) Degradación sin-images → log con su motivo + evento.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
      .run('bsinimg', payload([
        { type: 'carousel', image: TINY_JPG, caption: 'Carrusel sin láminas', hashtags: '#moda' },
      ], DIAG_CARR), Date.now());
    const regB = await register('b-fb@example.com', 'bsinimg');
    ok(regB.ok, `registro con carrusel sin láminas (${regB.status})`);
    const uB = userIdDe('b-fb@example.com');
    const postsB = postsDe(uB);
    ok(postsB.length === 1 && postsB[0].media_type === 'image', '(B) la pieza sin láminas importa como foto en ambos modos');
    if (MODE === 'release') {
      ok(await esperaLog('ig=bsinimg idx=0 pieza degradada a foto motivo=sin-images'), '(B) motivo sin-images registrado en el log');
      ok(eventosDe(uB).length === 1, '(B) también deja su evento (0 carruseles con dominante carrusel)');
    } else {
      ok(eventosDe(uB).length === 0 && !srvLog.includes('trial import ig=bsinimg'), 'CONTROL base: degradación sin-images muda, sin evento');
    }

    // (C) Importación sana: carrusel real → NINGÚN evento ni log de degradación.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
      .run('bsano', payload([
        { type: 'carousel', image: TINY_JPG, images: [TINY_JPG, TINY_JPG], caption: 'Carrusel sano', hashtags: '#moda' },
        { type: 'image', image: TINY_JPG, caption: 'Foto suelta', hashtags: '#moda' },
      ], DIAG_CARR), Date.now());
    const regC = await register('c-fb@example.com', 'bsano');
    ok(regC.ok, `registro con carrusel sano (${regC.status})`);
    const uC = userIdDe('c-fb@example.com');
    const postsC = postsDe(uC);
    ok(postsC.length === 2 && postsC[0].media_type === 'carousel' && !!postsC[0].carousel_paths, '(C) el carrusel sano importa como carrusel en ambos modos');
    ok(eventosDe(uC).length === 0, '(C) sin degradación NO hay evento trial_formato_degradado');
    if (MODE === 'release') ok(!srvLog.includes('ig=bsano idx='), '(C) sin log de degradación para la importación sana');

    // (D) Payload viejo SIN formato_diag: la degradación se loguea
    // igual, pero el evento NO se emite (sin dominante conocido no se
    // atribuye degradación de formato de marca).
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
      .run('bvijo', payload([
        { type: 'carousel', image: TINY_JPG, images: [TINY_JPG, 'data:image/jpeg;base64,@@@'], caption: 'Álbum corto viejo', hashtags: '#moda' },
      ], null), Date.now());
    const regD = await register('d-fb@example.com', 'bvijo');
    ok(regD.ok, `registro con payload sin formato_diag (${regD.status})`);
    const uD = userIdDe('d-fb@example.com');
    const postsD = postsDe(uD);
    ok(postsD.length === 1 && postsD[0].media_type === 'image', '(D) importa como foto en ambos modos');
    ok(eventosDe(uD).length === 0, '(D) sin formato_diag no hay evento (atribución honesta)');
    if (MODE === 'release') {
      ok(await esperaLog('ig=bvijo idx=0 pieza degradada a foto motivo=album<2'), '(D) el log por pieza no depende del diag: la degradación queda registrada igual');
    }
    db.close();
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  try { fs.rmSync(SUITE_TMP, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(imgDir, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${fail ? `✗ ${fail} FALLAS` : '✓ TODO OK'} — ${pass} pasaron, ${fail} fallaron (modo ${MODE})`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FALLÓ LA SUITE:', e); process.exit(1); });
