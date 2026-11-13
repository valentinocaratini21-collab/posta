// test-lote-correctivo-5-formato.js — LOTE CORRECTIVO-5 · FORMATO DE LA
// MARCA (base v980 → v987). El formato sigue a la marca: el digest guarda
// el formato dominante del feed (de los posteos YA leídos, sin fetches
// nuevos), la prueba arma sus piezas en ese formato y el primer posteo
// (ensure) deja de ser pisado por la rotación por día.
// Uso: node test-lote-correctivo-5-formato.js [árbol]
//   Sin argumento corre contra ./release. Contra ./base-v980 corre en
//   modo CONTROL: el caso (a) produce foto suelta y no existe el campo.
// Parte 1 (unitaria): formatosFromPosts / buildFromParts /
//   applyDeepBlocks con las fixtures (a)–(e) del encargo.
// Parte 2 (spec): buildDemoSpec con digest de cada fixture.
// Parte 3 (boot real, DATA_DIR temporal, sin claves de IA): import de
//   la prueba (carrusel → posts media_type='carousel' con
//   carousel_paths; álbum insuficiente → foto), siembra del digest con
//   su formato, y ensure del primer posteo con fallback registrado.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.argv[2] || path.join(__dirname, 'release'));
const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const MODE = serverSrc.includes('20261105-v994') ? 'release' : 'base';
console.log(`Árbol: ${TREE} — modo: ${MODE}`);

// DATA_DIR del proceso de la suite ANTES de requerir módulos del árbol
// (db.js abre la DB al requerirse): un temporal propio, jamás el árbol.
const SUITE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'f5-suite-'));
process.env.DATA_DIR = SUITE_TMP;

const clientDigest = require(path.join(TREE, 'client-digest.js'));
const demo = require(path.join(TREE, 'demo.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } }

const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';
const sidecar = () => ({ type: 'GraphSidecar', caption: 'post' });
const gimage = () => ({ type: 'GraphImage', caption: 'post' });
const gvideo = () => ({ type: 'GraphVideo', caption: 'post' });
const feedDe = (arr) => ({ bio: 'tienda de zapatillas', captions: arr.map(() => 'zapatillas de lona'), name: 'Marca', handle: 'marca' });

/* ================= Parte 1 · el dato (digest) ================= */
console.log('— Parte 1: formato dominante en el digest —');
if (MODE === 'release') {
  const F = clientDigest.formatosFromPosts;
  ok(typeof F === 'function', 'formatosFromPosts exportado');
  const a = F([sidecar(), sidecar(), sidecar(), sidecar(), sidecar(), sidecar()]);
  ok(a.dominante === 'carrusel' && a.conteos.carrusel === 6 && a.total === 6, `(a) feed 6/6 carrusel → dominante carrusel (${JSON.stringify(a.conteos)})`);
  const aSnap = F(Array.from({ length: 6 }, () => ({ type: 'carousel' })));
  ok(aSnap.dominante === 'carrusel', "(a') los recents del snapshot ('carousel') también cuentan como carrusel");
  const b = F([gimage(), gimage(), gimage(), gimage(), gimage(), gimage()]);
  ok(b.dominante === 'foto' && b.conteos.foto === 6, '(b) feed de fotos → dominante foto');
  const c = F([gvideo(), gvideo(), gvideo(), gvideo(), gimage(), gimage()]);
  ok(c.dominante === 'reel' && c.conteos.reel === 4, '(c) reels mayoritarios (4/6) → dominante reel');
  const d1 = F([sidecar(), sidecar()]);
  ok(d1.dominante === null && d1.total === 2, '(d) solo 2 posteos leídos → sin dato (dominante null)');
  const d2 = F([sidecar(), sidecar(), sidecar(), gimage(), gimage(), gimage()]);
  ok(d2.dominante === null, '(d) empate 3/3 → sin dato (sin mayoría clara)');
  const d3 = F([]);
  ok(d3.dominante === null && d3.total === 0, '(d) sin posteos → sin dato');

  const dgA = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1, 2, 3, 4, 5, 6]), feedPosts: [sidecar(), sidecar(), sidecar(), sidecar(), sidecar(), sidecar()] });
  ok(dgA.formatos && dgA.formatos.dominante === 'carrusel', 'buildFromParts guarda digest.formatos con dominante carrusel');
  ok(clientDigest.formatoDominanteDe(dgA) === 'carrusel', 'formatoDominanteDe(digest) = carrusel');
  const dgSin = clientDigest.buildFromParts({ business: 'Sin Feed', category: 'moda', feed: feedDe([1]) });
  ok(dgSin.formatos === null && clientDigest.formatoDominanteDe(dgSin) === null, 'sin posteos en las partes → formatos null (nunca calculado)');
  const dgPocos = clientDigest.buildFromParts({ business: 'Poco Feed', category: 'moda', feed: feedDe([1, 2]), feedPosts: [sidecar(), sidecar()] });
  ok(dgPocos.formatos && dgPocos.formatos.dominante === null && dgPocos.formatos.total === 2, 'calculado pero sin mayoría → dominante null adentro del bloque');

  // El refresco (applyDeepBlocks): sin lectura fresca, el formato
  // aprendido sobrevive; con lectura fresca, manda la fresca.
  const stored = JSON.parse(JSON.stringify(dgA));
  const freshSin = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1]) });
  const merged1 = clientDigest.applyDeepBlocks(stored, freshSin);
  ok(merged1.formatos && merged1.formatos.dominante === 'carrusel', 'refresco sin posteos: el formato guardado SOBREVIVE');
  const freshFoto = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1, 2, 3, 4, 5, 6]), feedPosts: [gimage(), gimage(), gimage(), gimage(), gimage(), gimage()] });
  const merged2 = clientDigest.applyDeepBlocks(stored, freshFoto);
  ok(merged2.formatos && merged2.formatos.dominante === 'foto', 'refresco con posteos: manda el formato fresco');
} else {
  ok(typeof clientDigest.formatosFromPosts === 'undefined', 'CONTROL base: formatosFromPosts no existe en v980');
  const dgBase = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1, 2, 3, 4, 5, 6]), feedPosts: [sidecar(), sidecar(), sidecar(), sidecar(), sidecar(), sidecar()] });
  ok(!dgBase.formatos, 'CONTROL base: el digest no guarda ningún formato (el caso (a) sale foto suelta)');
}

/* ================= Parte 2 · la prueba (spec del demo) ================= */
console.log('— Parte 2: buildDemoSpec sigue el formato —');
const imgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f5-imgs-'));
const tinyBuf = Buffer.from(TINY_JPG.split(',')[1], 'base64');
const mkJpg = (name) => { const p = path.join(imgDir, name); fs.writeFileSync(p, tinyBuf); return p; };
const userJpg = mkJpg('user.jpg');
// El pool web del demo exige temas derivables por foto (gate foto↔tema
// de buildDemoSpec): sin temas, la foto queda afuera del pool.
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
const dgReel = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1, 2, 3, 4, 5, 6]), feedPosts: [gvideo(), gvideo(), gvideo(), gvideo(), gimage(), gimage()] });
const dgFoto = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1, 2, 3, 4, 5, 6]), feedPosts: [gimage(), gimage(), gimage(), gimage(), gimage(), gimage()] });
const dgNulo = clientDigest.buildFromParts({ business: 'Veja Like', category: 'moda', feed: feedDe([1]) });
if (MODE === 'release') {
  const sA = specCon(dgCarr);
  ok(sA.formato && sA.formato.dominante === 'carrusel', `(a) spec.formato.dominante = carrusel (${JSON.stringify(sA.formato)})`);
  ok(sA.formato.carrusel >= 1, `(a) ≥1 pieza armada en carrusel (van ${sA.formato.carrusel})`);
  ok(sA.specPosts.every((p) => p.formato !== 'carrusel' || (Array.isArray(p.slides) && p.slides.length >= 1)), '(a) todo carrusel del spec lleva ≥1 lámina extra (álbum total ≥2, nunca de 1)');
  ok(sA.specPosts.filter((p) => p.formato === 'carrusel').every((p) => p.slides.every((s) => webPhotos.some((w) => w.path === s))), '(a) las láminas son fotos reales del negocio (pool web), no stock');
  const sE = specCon(dgCarr, { extraPhotos: [] });
  ok(sE.formato && sE.formato.carrusel === 0 && sE.formato.fallback >= 1, `(e) una sola foto disponible → 0 carruseles y fallback registrado (${JSON.stringify(sE.formato)})`);
  ok(sE.specPosts.every((p) => p.formato !== 'carrusel'), '(e) ninguna pieza finge carrusel');
  ok(sE.specPosts.some((p) => p.formato_fallback && p.formato_fallback.motivo === 'sin-material'), "(e) el fallback queda registrado en la pieza (motivo 'sin-material')");
  const sC = specCon(dgReel);
  ok(sC.formato && sC.formato.dominante === 'reel' && sC.formato.carrusel === 0, '(c) spec.formato.dominante = reel, sin carruseles');
  ok(sC.specPosts.every((p) => p.formato !== 'carrusel'), '(c) ninguna pieza muta a carrusel');
  ok(Number.isInteger(sC.videoIdx) && sC.videoIdx >= 0 && sC.videoIdx < sC.specPosts.length, '(c) el camino de video del demo sigue presente (videoIdx válido)');
  const sB = specCon(dgFoto);
  ok(sB.formato && sB.formato.dominante === 'foto' && sB.specPosts.every((p) => !p.formato && !p.formato_fallback), '(b) dominante foto → piezas en foto, sin cambios');
  const sD = specCon(dgNulo);
  ok(sD.formato === null && sD.specPosts.every((p) => !p.formato), '(d) digest sin dato → spec.formato null y comportamiento histórico');
} else {
  const sBase = specCon(dgCarr);
  ok(!sBase.formato && sBase.specPosts.every((p) => !p.formato), 'CONTROL base: con feed 100% carrusel el spec no marca formato alguno (foto suelta)');
}

/* ================= Parte 3 · boot real ================= */
const PORT = 18777;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'testtoken-f5';
async function waitBoot(tries = 70) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return await r.json(); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
(async () => {
  console.log('— Parte 3: boot + importación + ensure —');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'f5-boot-'));
  // El árbol no trae node_modules: el boot usa el pin NODE_PATH de las
  // suites hermanas (express 4.22.3), como test-lote-voz-propia-prueba-boot.
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
    if (MODE === 'release') ok(build.includes('v994'), `/api/version = ${build} (v994)`);
    else ok(build.includes('v980'), `CONTROL base: /api/version = ${build} (v980)`);

    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const ENGINE = demo.DEMO_ENGINE_V;
    const payload = (posts, digest) => JSON.stringify({
      ok: true, engine: ENGINE, business: 'Veja Like', category: 'moda',
      posts,
      design: { posts: posts.map((p, i) => ({ style: '/s' + i, kind: 'social' })), styles: [], photos: [], videoIdx: 0, count: posts.length, engine: ENGINE },
      week: [], digest,
    });
    const register = async (email, ig) => {
      const r = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'secreto1', trial_ig: ig }),
      });
      const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).join('; ');
      return { status: r.status, ok: r.ok, cookies };
    };

    // (a) Importación: pieza carrusel de la prueba → posteo carrusel.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
      .run('vejalike', payload([
        { type: 'carousel', image: TINY_JPG, images: [TINY_JPG, TINY_JPG], caption: 'Carrusel de la prueba', hashtags: '#moda' },
        { type: 'image', image: TINY_JPG, caption: 'Foto suelta', hashtags: '#moda' },
      ], dgCarr), Date.now());
    const regA = await register('a-f5@example.com', 'vejalike');
    ok(regA.ok, `registro con prueba carrusel (${regA.status})`);
    const uA = db.prepare('SELECT id FROM users WHERE email = ?').get('a-f5@example.com');
    const postsA = db.prepare('SELECT media_type, image_path, carousel_paths FROM posts WHERE user_id = ? ORDER BY id').all(uA.id);
    ok(postsA.length === 2, `2 posteos importados (van ${postsA.length})`);
    if (MODE === 'release') {
      ok(postsA[0] && postsA[0].media_type === 'carousel', `(a) el posteo 1 nace media_type='carousel' (es '${postsA[0] && postsA[0].media_type}')`);
      let album = [];
      try { album = JSON.parse(postsA[0].carousel_paths || '[]'); } catch (e) {}
      ok(Array.isArray(album) && album.length === 2, `(a) carousel_paths trae el álbum completo (${album.length} láminas)`);
      ok(postsA[0] && postsA[0].image_path === album[0], '(a) image_path = la portada del álbum');
      ok(album.every((p) => fs.existsSync(path.join(TMP, 'media', path.basename(p)))), '(a) los archivos de las láminas existen en el media dir');
      ok(postsA[1] && postsA[1].media_type === 'image' && !postsA[1].carousel_paths, '(a) el posteo foto sigue foto, sin álbum');
      const dgRowA = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(uA.id);
      const dgStoredA = dgRowA ? JSON.parse(dgRowA.digest_json) : null;
      ok(dgStoredA && dgStoredA.formatos && dgStoredA.formatos.dominante === 'carrusel', '(a) el digest sembrado en la cuenta conserva el formato dominante');
    } else {
      ok(postsA[0] && postsA[0].media_type === 'image', `CONTROL base: la pieza carrusel importa como foto suelta (es '${postsA[0] && postsA[0].media_type}')`);
    }

    // (e) Importación: álbum insuficiente (1 válida + 1 ilegible) → foto.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
      .run('unafoto', payload([
        { type: 'carousel', image: TINY_JPG, images: [TINY_JPG, 'data:image/jpeg;base64,@@@'], caption: 'Álbum roto', hashtags: '#moda' },
      ], dgCarr), Date.now());
    const regB = await register('b-f5@example.com', 'unafoto');
    ok(regB.ok, `registro con álbum insuficiente (${regB.status})`);
    const uB = db.prepare('SELECT id FROM users WHERE email = ?').get('b-f5@example.com');
    const postsB = db.prepare('SELECT media_type, carousel_paths FROM posts WHERE user_id = ? ORDER BY id').all(uB.id);
    ok(postsB.length === 1 && postsB[0].media_type === 'image' && !postsB[0].carousel_paths,
      `(e) álbum de <2 válidas → importa como foto, nunca carrusel de 1 (media_type='${postsB[0] && postsB[0].media_type}')`);

    // Primer posteo (ensure): cuenta con digest carrusel, sin posteos.
    // Sin claves de IA el pipeline no puede producir el carrusel: el
    // fallback honesto a foto tiene que quedar registrado en el log.
    const regC = await register('c-f5@example.com', undefined);
    ok(regC.ok, `registro de la cuenta del ensure (${regC.status})`);
    const uC = db.prepare('SELECT id FROM users WHERE email = ?').get('c-f5@example.com');
    clientDigest.saveDigest(db, uC.id, dgCarr);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 150000);
    let ritStatus = 0;
    try {
      const r = await fetch(`${BASE}/api/ritual/hoy`, { headers: { Cookie: regC.cookies }, signal: ctrl.signal });
      ritStatus = r.status;
      await r.text();
    } catch (e) { /* abort por timeout: el ensure sigue server-side */ }
    finally { clearTimeout(to); }
    let found = srvLog.includes('[formato-marca]');
    for (let i = 0; i < 90 && !found; i++) { await new Promise((r) => setTimeout(r, 500)); found = srvLog.includes('[formato-marca]'); }
    if (MODE === 'release') {
      ok(found && srvLog.includes('formato carrusel'), `ensure: el primer posteo pidió carrusel y el fallback honesto quedó registrado (ritual/hoy status ${ritStatus})`);
    } else {
      ok(!found, 'CONTROL base: sin registro [formato-marca] (la rotación manda)');
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
