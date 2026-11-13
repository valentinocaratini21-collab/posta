// test-lote-formato-ventana.js — LOTE FORMATO-VENTANA (L4 del
// diagnóstico de la corrida Veja #6, §3 respuesta B + §7 L4).
//
// El diagnóstico probó dos cosas sobre el formato de la prueba:
//   1. El dominante SÍ se computaba, pero sobre el total histórico
//      del embed (Veja: 51 posteos → foto 33) mientras la conducta
//      reciente de la marca (sus recents, 6/6 carrusel) no alimentaba
//      ningún camino: la marca carrusel-dominante reciente salía
//      «foto» y el armado de carruseles ni se intentaba.
//   2. La instrumentación del lote B no alcanzaba para verlo: su
//      evento trial_formato_degradado solo dispara si el dominante
//      computado es carrusel, y el cálculo de formatos no viajaba en
//      el payload.
// Este lote:
//   (a) formatosFromPosts computa el dominante sobre la VENTANA
//       RECIENTE (los últimos 12 posteos leídos, por taken_at; sin
//       fechas, el orden del embed), con la MISMA regla de dominancia
//       de siempre aplicada dentro de la ventana. El resultado
//       registra el cálculo: conteos y total de la ventana +
//       total_feed + ventana.
//   (b) digest.formatos viaja en el payload de la prueba dentro de
//       formato_diag (extensión del lote B, no un registro paralelo):
//       buildDemoSpec lo vuelca como formato_diag.formatos (null si
//       el digest no tiene formatos = trialData no llegó) y la línea
//       [formato-marca] lo cierra con ventana/total/total_feed o
//       «sin-dato».
//
// Uso: node test-lote-formato-ventana.js [árbol]
//   Contra el release corre en modo RELEASE; contra la base-fusión
//   (B sin este lote) corre en modo CONTROL: la ventana no existe, el
//   dominante sale del total histórico y formato_diag no trae
//   formatos — las aserciones de comportamiento difieren exactamente
//   en los frentes del lote y coinciden en el resto.
//
// Parte 0 (estática): el cableado de la extensión sobre el lote B.
// Parte 1 (unitaria): formatosFromPosts en 7 fixtures (Veja-forma,
//   foto-reciente, sin fechas, feed chico, empate, umbral, no
//   clasificables) + buildFromParts.
// Parte 2 (unitaria): buildDemoSpec → formato_diag.formatos.
// Parte 3 (boot real): el server del árbol levanta y responde health
//   con su BUILD (la línea de log extendida no rompe el arranque).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TREE = path.resolve(process.argv[2] || path.join(__dirname, 'release'));
const cdSrc = fs.readFileSync(path.join(TREE, 'client-digest.js'), 'utf8');
const demoSrc = fs.readFileSync(path.join(TREE, 'demo.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const MODE = cdSrc.includes('FORMATO_VENTANA') ? 'release' : 'base';
console.log(`Árbol: ${TREE} — modo: ${MODE}`);

// DATA_DIR temporal ANTES de requerir módulos del árbol.
const SUITE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-suite-'));
process.env.DATA_DIR = SUITE_TMP;

const clientDigest = require(path.join(TREE, 'client-digest.js'));
const demo = require(path.join(TREE, 'demo.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } }
const count = (s, sub) => s.split(sub).length - 1;

/* ================= fixtures ================= */
const T0 = 1762000000; // epoch base de los fixtures (descendente = más viejo)
const sidecar = (ts) => ({ type: 'GraphSidecar', caption: 'post', taken_at: ts });
const gimage = (ts) => ({ type: 'GraphImage', caption: 'post', taken_at: ts });
const gvideo = (ts) => ({ type: 'GraphVideo', caption: 'post', taken_at: ts });
const sinTipo = (ts) => ({ type: 'GraphTagged', caption: 'post', taken_at: ts });
// Arma un feed con `recientes` (los de mayor taken_at) y `viejos`,
// intercalados en el array: la recencia la manda taken_at, no la
// posición — como el embed real, cuyo orden no es el histórico puro.
function feedCon(recientes, viejos) {
  const rec = recientes.map((mk, i) => mk(T0 - i * 100));
  const vie = viejos.map((mk, i) => mk(T0 - 100000 - i * 100));
  const out = [];
  const max = Math.max(rec.length, vie.length);
  for (let i = 0; i < max; i++) { if (vie[i]) out.push(vie[i]); if (rec[i]) out.push(rec[i]); }
  return out;
}
const n = (mk, k) => Array.from({ length: k }, () => mk);

// VEJA-51: historia foto-dominante, ventana reciente carrusel-dominante.
const feedVeja = feedCon(
  [...n(sidecar, 7), ...n(gimage, 3), ...n(gvideo, 2)],
  [...n(gimage, 30), ...n(gvideo, 9)],
);
// FOTO-RECIENTE: historia carrusel, ventana reciente foto.
const feedFotoReciente = feedCon(
  [...n(gimage, 9), ...n(sidecar, 2), ...n(gvideo, 1)],
  [...n(sidecar, 8)],
);
// SIN-FECHAS: el orden servido (embed) manda; primeros 12 carrusel.
const feedSinFechas = [
  ...n(sidecar, 8), ...n(gimage, 4), ...n(gimage, 6),
].map((mk) => { const p = mk(0); delete p.taken_at; return p; });

/* ================= Parte 0 · cableado ================= */
console.log('— Parte 0: cableado de la extensión sobre el lote B —');
if (MODE === 'release') {
  ok(cdSrc.includes('const FORMATO_VENTANA = 12'), 'client-digest: ventana reciente de 12 definida');
  ok(cdSrc.includes('total_feed: totalFeed'), 'formatosFromPosts devuelve total_feed (el cálculo queda registrado)');
  ok(demoSrc.includes('formatos: (digest && digest.formatos') && demoSrc.includes('formato_diag: formatoDiagB'), 'demo: formato_diag.formatos extiende el diag de B (mismo objeto, sin registro paralelo)');
  ok(serverSrc.includes("formatos={${fz}}") && serverSrc.includes("'sin-dato'"), 'server: la línea [formato-marca] cierra con el cálculo o «sin-dato»');
  ok(count(serverSrc, 'trialFormatoDiagLog(') === 3, 'composición con B intacta: trialFormatoDiagLog sigue 1 definición + 2 llamadas');
} else {
  ok(!cdSrc.includes('FORMATO_VENTANA') && !cdSrc.includes('total_feed'), 'CONTROL base: ni ventana ni total_feed existen');
  ok(!demoSrc.includes('formatos: (digest && digest.formatos'), 'CONTROL base: formato_diag no trae formatos');
}

/* ================= Parte 1 · formatosFromPosts ================= */
console.log('— Parte 1: el dominante sale de la ventana reciente —');
const fVeja = clientDigest.formatosFromPosts(feedVeja);
if (MODE === 'release') {
  ok(fVeja.dominante === 'carrusel', `(Veja) dominante de ventana = carrusel (fue: ${fVeja.dominante})`);
  ok(fVeja.total === 12 && fVeja.total_feed === 51 && fVeja.ventana === 12, `(Veja) total ventana=12 sobre total_feed=51 (fue: ${fVeja.total}/${fVeja.total_feed})`);
  ok(fVeja.conteos.carrusel === 7 && fVeja.conteos.foto === 3 && fVeja.conteos.reel === 2, `(Veja) conteos de la ventana 7/3/2 (fue: ${JSON.stringify(fVeja.conteos)})`);
} else {
  ok(fVeja.dominante === 'foto' && fVeja.total === 51, `(Veja·CONTROL) sin ventana: dominante foto sobre el total histórico (fue: ${fVeja.dominante}/${fVeja.total})`);
  ok(fVeja.conteos.foto === 33 && fVeja.conteos.carrusel === 7 && fVeja.ventana === undefined && fVeja.total_feed === undefined, '(Veja·CONTROL) conteos del total, sin campos de ventana');
}
const fFoto = clientDigest.formatosFromPosts(feedFotoReciente);
if (MODE === 'release') {
  ok(fFoto.dominante === 'foto' && fFoto.conteos.foto === 9, `(foto-reciente) la ventana manda: foto aunque la historia sea carrusel (fue: ${fFoto.dominante})`);
} else {
  ok(fFoto.dominante === 'carrusel', `(foto-reciente·CONTROL) la historia manda: carrusel (fue: ${fFoto.dominante})`);
}
const fSin = clientDigest.formatosFromPosts(feedSinFechas);
if (MODE === 'release') {
  ok(fSin.dominante === 'carrusel' && fSin.total === 12 && fSin.total_feed === 18, `(sin fechas) el orden del embed es la recencia: ventana = primeros 12 → carrusel (fue: ${fSin.dominante}/${fSin.total}/${fSin.total_feed})`);
} else {
  ok(fSin.dominante === 'foto' && fSin.total === 18, `(sin fechas·CONTROL) total histórico → foto (fue: ${fSin.dominante})`);
}
const fChica = clientDigest.formatosFromPosts([...n(sidecar, 3), ...n(gimage, 2)].map((mk, i) => mk(T0 - i * 100)));
ok(fChica.dominante === 'carrusel' && fChica.total === 5, `(feed chico) 5 posteos: la ventana no recorta nada y el dominante es el de siempre (fue: ${fChica.dominante}/${fChica.total})`);
if (MODE === 'release') ok(fChica.total_feed === 5 && fChica.ventana === 12, '(feed chico) total_feed=5 con ventana declarada 12');
const fEmpate = clientDigest.formatosFromPosts(feedCon([...n(gimage, 6), ...n(sidecar, 6)], []));
ok(fEmpate.dominante === null && fEmpate.total === 12, `(empate en la ventana) 6/6 → dominante null, la regla no se afloja (fue: ${fEmpate.dominante})`);
const fUmbral = clientDigest.formatosFromPosts(feedCon([...n(sidecar, 5), ...n(gimage, 4), ...n(gvideo, 3)], []));
ok(fUmbral.dominante === null, `(umbral) 5/12 no duplica la mitad → null aunque lidere (fue: ${fUmbral.dominante})`);
const fRaros = clientDigest.formatosFromPosts(feedCon(
  [...n(sidecar, 7), ...n(gimage, 3), ...n(gvideo, 2)],
  [...n(sinTipo, 5)],
).map((p, i) => (p.type === 'GraphTagged' ? { ...p, taken_at: T0 + 10000 + i } : p)));
if (MODE === 'release') {
  ok(fRaros.total_feed === 12 && fRaros.dominante === 'carrusel', `(no clasificables) no consumen ventana ni total_feed aunque sean los más nuevos (fue: total_feed=${fRaros.total_feed}, dom=${fRaros.dominante})`);
} else {
  ok(fRaros.total === 12 && fRaros.dominante === 'carrusel', '(no clasificables·CONTROL) tampoco cuentan en el total histórico');
}
const dgVeja = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feedPosts: feedVeja });
if (MODE === 'release') {
  ok(dgVeja.formatos && dgVeja.formatos.dominante === 'carrusel' && dgVeja.formatos.total_feed === 51, '(buildFromParts) digest.formatos nace con el dominante de ventana');
} else {
  ok(dgVeja.formatos && dgVeja.formatos.dominante === 'foto', '(buildFromParts·CONTROL) digest.formatos nace foto (total histórico)');
}

/* ================= Parte 2 · formato_diag.formatos ================= */
console.log('— Parte 2: el cálculo viaja en el payload (formato_diag) —');
const imgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-imgs-'));
const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';
const tinyBuf = Buffer.from(TINY_JPG.split(',')[1], 'base64');
const mkJpg = (name) => { const p = path.join(imgDir, name); fs.writeFileSync(p, tinyBuf); return p; };
const userJpg = mkJpg('user.jpg');
const webPhotos = [1, 2, 3, 4].map((i) => ({ path: mkJpg('web' + i + '.jpg'), temas: ['zapatillas', 'lona'], url: 'https://example.com/' + i }));
const feedDe = (arr) => ({ bio: 'tienda de zapatillas', captions: arr.map(() => 'zapatillas de lona'), name: 'Marca', handle: 'marca' });
function specCon(digest, extra) {
  return demo.buildDemoSpec(Object.assign({
    business: 'Veja Like', category: 'moda', country: 'AR', tone: null,
    photoPath: userJpg, goal: null, accent: '#2793C8', btn: '#0A1E33',
    count: 3, bioText: '', profilePicPath: null, feedRegister: null,
    extraPhotos: webPhotos, digest, lang: 'es', trialNoStock: true,
  }, extra || {}));
}
const sVeja = specCon(dgVeja);
const domEsperado = MODE === 'release' ? 'carrusel' : 'foto';
ok(sVeja.formato && sVeja.formato.dominante === domEsperado, `(spec) el formato visible de C5 sigue al dominante (${MODE === 'release' ? 'de ventana: carrusel' : 'histórico: foto'}) — fue: ${sVeja.formato && sVeja.formato.dominante}`);
if (MODE === 'release') {
  const fz = sVeja.formato_diag && sVeja.formato_diag.formatos;
  ok(!!fz && fz.dominante === 'carrusel' && fz.total === 12 && fz.total_feed === 51 && fz.ventana === 12, `(payload) formato_diag.formatos trae el cálculo completo (fue: ${JSON.stringify(fz)})`);
  ok(fz.conteos && fz.conteos.carrusel === 7 && fz.conteos.foto === 3 && fz.conteos.reel === 2, '(payload) los conteos viajeros son los de la ventana');
  ok(fz !== dgVeja.formatos && fz.conteos !== dgVeja.formatos.conteos, '(payload) viaja una copia: mutar el payload no toca el digest');
  const dgNulo = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1]) });
  const sNulo = specCon(dgNulo);
  ok(sNulo.formato_diag && sNulo.formato_diag.formatos === null && sNulo.formato_diag.dominante === null, '(payload) digest sin formatos (trialData no llegó): formatos=null registrado, no cero');
  const dgEscaso = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1, 2]), feedPosts: [sidecar(T0), gimage(T0 - 100)] });
  const sEscaso = specCon(dgEscaso);
  ok(sEscaso.formato_diag.formatos && sEscaso.formato_diag.formatos.total === 2 && sEscaso.formato_diag.formatos.dominante === null, '(payload) feed escaso: formatos presente con dominante null y total real');
} else {
  ok(sVeja.formato_diag && sVeja.formato_diag.formatos === undefined, '(payload·CONTROL) la base-fusión (lote B) produce formato_diag pero SIN la extensión formatos');
}

/* ================= Parte 3 · boot smoke ================= */
console.log('— Parte 3: boot del server del árbol —');
const PORT = 18791;
const envHijo = { ...process.env, PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'fv-boot-')), ADMIN_TOKEN: 'testtoken-fv' };
// Los árboles de trabajo no traen node_modules: se usa el pin de la
// casa (el mismo que usa la suite del lote B) y se quitan las claves
// de IA del entorno hijo, como en esa suite.
const NODE_MODULES_PIN = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
if (fs.existsSync(NODE_MODULES_PIN)) envHijo.NODE_PATH = NODE_MODULES_PIN;
for (const k of Object.keys(envHijo)) if (/OPENAI|ANTHROPIC|FAL_KEY|GEMINI|GOOGLE_API/.test(k)) delete envHijo[k];
const child = spawn(process.execPath, [path.join(TREE, 'server.js')], {
  cwd: TREE,
  env: envHijo,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let bootLog = '';
child.stdout.on('data', (d) => { bootLog += d; });
child.stderr.on('data', (d) => { bootLog += d; });
const killChild = () => { try { child.kill('SIGKILL'); } catch (e) {} };
setTimeout(() => { killChild(); console.log('  ✗ boot: timeout esperando health'); console.log(`\nRESULTADO: ${pass} ok · ${fail + 1} mal`); process.exit(1); }, 90000);
(async () => {
  const t0 = Date.now();
  let health = null;
  while (Date.now() - t0 < 60000) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) { health = await r.json(); break; }
    } catch (e) { /* todavía no levanta */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  ok(!!health && health.ok === true, `boot: /api/health responde (pid ${child.pid})`);
  let version = null;
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) version = await r.json(); } catch (e) {}
  const buildEsperado = MODE === 'release' ? 'v1012' : 'v1011';
  ok(!!version && String(version.build || '').includes(buildEsperado), `(boot) /api/version declara el BUILD del árbol (${buildEsperado}): ${version && version.build}`);
  killChild();
  console.log(`\nRESULTADO: ${pass} ok · ${fail} mal`);
  process.exit(fail ? 1 : 0);
})();
