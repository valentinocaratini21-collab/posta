// test-lote-voz-propia-prueba-boot.js — Boot aislado del lote
// VOZ-PROPIA-EN-LA-PRUEBA (M121, base v765).
// Levanta server.js en una copia aislada (DATA_DIR temporal propio, sin
// tocar la DB real; express 4.22.3 PIN vía NODE_PATH; TRIAL_TEST_KEY
// propio; sin OPENAI_API_KEY → USD 0) y verifica de punta a punta:
// /api/version con el BUILD del árbol, /prueba.html y /en-prueba.html
// servidas con la fila de voz, prefill vivo @posty.communitymanager
// (ok + voz_marcadores array) y prefill falso (ok:false), generate
// no-stream con la fixture de ownerWords (los 5 captions llevan su
// frase, solo frases del digest, titular con su frase), generate sin
// marcadores (ninguna frase inventada, sin «En tus palabras» ni «),
// y generate-stream igual que generate. No toca producción.
// Uso: node test-lote-voz-propia-prueba-boot.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const PORT = 34571;
const TOKEN = 'boot-test-voz-propia';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-propia-boot-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
const BASE = `http://127.0.0.1:${PORT}`;
const KEY_QS = `?test_key=${TOKEN}`;
// El require('./demo') de la re-derivación crea data/ en el árbol (db.js
// abre la DB al requerirse): se borra al final si el boot la creó.
const hadData = fs.existsSync(path.join(__dirname, 'data'));

// Fixture de ownerWords (la del lote, en inglés para la panadería de
// @bestillandrise): las frases del cliente que la prueba tiene que
// leer en sus captions y repetir tal cual.
const OWNER_EN = {
  producto_estrella: 'Handmade cookies',
  diferencial: 'Sourdough bread',
  audiencia: 'Neighbors who love homemade food',
};
const BAKERY_MARKERS_EN = ['handmade cookies', 'sourdough bread', 'love homemade'];

async function getJson(p) {
  const r = await fetch(BASE + p);
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
async function getText(p) {
  const r = await fetch(BASE + p);
  return { status: r.status, text: await r.text() };
}
async function postJson(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
function formBody(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}
async function postForm(p, fields, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 240000);
  try {
    const r = await fetch(BASE + p, { method: 'POST', body: formBody(fields), signal: ctrl.signal });
    return { status: r.status, text: await r.text() };
  } finally { clearTimeout(t); }
}

// Cada caption de la prueba tiene que llevar UNA frase del digest (el
// eco «En tus palabras: «m»») y ninguna frase fuera del digest.
function captionsCarryDigestMarkers(out, lang) {
  const markers = (((out || {}).digest || {}).voz_marcadores || []).map((m) => String(m || '').trim()).filter(Boolean);
  const posts = (out || {}).posts || [];
  const echoWord = lang === 'en' ? 'In your words' : 'En tus palabras';
  const problems = [];
  posts.forEach((p, i) => {
    const c = String((p && p.caption) || '');
    const m = c.match(/«([^»]+)»/);
    if (!m) { problems.push(`post ${i} sin eco`); return; }
    const said = m[1].trim();
    const ok = markers.some((mk) => mk.toLowerCase() === said.toLowerCase());
    if (!ok) problems.push(`post ${i} dice «${said}» fuera del digest [${markers.join(' | ')}]`);
    if (!c.includes(echoWord)) problems.push(`post ${i} sin «${echoWord}»`);
  });
  return { markers, posts, problems };
}
function headlineCarriesMarker(out) {
  const markers = (((out || {}).digest || {}).voz_marcadores || []).map((m) => String(m || '').trim().toLowerCase()).filter(Boolean);
  const words = new Set();
  markers.forEach((m) => m.split(/[^a-záéíóúñ]+/i).filter((w) => w.length >= 3).forEach((w) => words.add(w)));
  const posts = (out || {}).posts || [];
  return posts.some((p) => {
    const h = String((p && (p.headline || p.title)) || '').toLowerCase();
    if (!h) return false;
    for (const w of words) if (h.includes(w)) return true;
    return false;
  });
}

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    TRIAL_TEST_KEY: TOKEN,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`${BASE}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    check('el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await getJson('/api/version');
    check('/api/version trae el BUILD v765 del árbol', ver.status === 200 && ver.json && ver.json.build === '20261105-v765',
      JSON.stringify(ver.json));

    const esHtml = await getText('/prueba.html');
    check('/prueba.html servida con la fila de voz', esHtml.status === 200 && esHtml.text.includes('knownVoz') && esHtml.text.includes('Hablás así'));
    const enHtml = await getText('/en-prueba.html');
    check('/en-prueba.html servida con la fila de voz', enHtml.status === 200 && enHtml.text.includes('knownVoz') && enHtml.text.includes('How you sound'));

    // Prefill vivo: @posty.communitymanager (cuenta ES de Valentino).
    const pre = await postJson('/api/trial/prefill' + KEY_QS, { ig: 'posty.communitymanager' });
    check('prefill vivo ok:true', pre.status === 200 && pre.json && pre.json.ok === true, JSON.stringify(pre.json && pre.json.error));
    const preMarkers = (pre.json && pre.json.voz_marcadores) || null;
    check('prefill vivo trae voz_marcadores (array)', Array.isArray(preMarkers),
      `voz_marcadores=${JSON.stringify(preMarkers)}`);
    if (Array.isArray(preMarkers)) console.log(`     marcadores del prefill vivo: ${JSON.stringify(preMarkers)}`);

    const preFake = await postJson('/api/trial/prefill' + KEY_QS, { ig: 'noexiste987654xyz' });
    check('prefill falso ok:false', preFake.json && preFake.json.ok === false,
      JSON.stringify(preFake.json));

    // Prefill vivo de la panadería (sin ownerWords): sus marcadores
    // puros de captions, para probar que cada marcador del digest de
    // generate es real (de sus captions o de sus respuestas).
    const preB = await postJson('/api/trial/prefill' + KEY_QS, { ig: 'bestillandrise' });
    const preMarkersB = (preB.json && preB.json.voz_marcadores) || [];
    check('prefill bestillandrise ok:true', preB.json && preB.json.ok === true,
      JSON.stringify(preB.json && preB.json.error));
    console.log(`     marcadores del prefill bestillandrise: ${JSON.stringify(preMarkersB)}`);

    // Generate A (no-stream): IG vivo coherente con la fixture (la
    // panadería @bestillandrise, en inglés) + ownerWords de la panadería.
    const genAFields = {
      business: 'Be Still & Rise Bakery', ig: 'bestillandrise',
      category: 'cafeteria', country: 'US', tone: 'tu', lang: 'en',
      producto: OWNER_EN.producto_estrella, diferencial: OWNER_EN.diferencial,
      producto_estrella: OWNER_EN.producto_estrella, diferencial: OWNER_EN.diferencial,
      audiencia: OWNER_EN.audiencia, cta: 'Book a visit', promo: 'No promo',
      voz: 'Friendly', precios: 'Yes',
    };
    const genA = await postForm('/api/trial/generate' + KEY_QS, genAFields);
    let outA = null;
    try { outA = JSON.parse(genA.text); } catch (e) { outA = null; }
    check('generate no-stream HTTP 200 + JSON', genA.status === 200 && !!outA,
      `status=${genA.status} body=${String(genA.text).slice(0, 200)}`);
    check('generate no-stream trae 5 posteos', outA && Array.isArray(outA.posts) && outA.posts.length === 5,
      `posts=${outA && outA.posts && outA.posts.length} error=${outA && outA.error}`);
    if (outA && Array.isArray(outA.posts) && outA.posts.length === 5) {
      const markersA = (((outA || {}).digest || {}).voz_marcadores || []);
      check('generate no-stream: el digest trae marcadores de voz', markersA.length > 0,
        `voz_marcadores=${JSON.stringify(markersA)}`);
      // Cada marcador del digest es EXACTAMENTE lo que el extractor da
      // sobre sus captions vivas + sus respuestas (misma entrada que la
      // ruta): nada inventado, nada de otra cuenta. Las frases de las
      // respuestas pueden quedar fuera del top 8 cuando sus captions
      // repiten mucho (el cap y el dedup del extractor son compartidos
      // con la cuenta) — lo que se prueba acá es la re-derivación exacta.
      let expected = null, expectedErr = '';
      try {
        const demo = require('./demo');
        const feedAudit = require('./feed-audit');
        const pers = require('./personalizacion');
        const htmlVoz = await demo.fetchIgEmbedHtml('bestillandrise');
        const capsVoz = (feedAudit.parseEmbedPosts(htmlVoz) || []).map((p) => p.caption).filter(Boolean).slice(0, 12);
        expected = pers.extraerMarcadoresVoz(capsVoz, [OWNER_EN.producto_estrella, OWNER_EN.diferencial, OWNER_EN.audiencia]);
      } catch (e) { expectedErr = String((e && e.message) || e); }
      check('generate no-stream: los marcadores son los del extractor sobre sus captions + respuestas', Array.isArray(expected) && JSON.stringify(markersA) === JSON.stringify(expected),
        expectedErr || `digest=${JSON.stringify(markersA)} esperado=${JSON.stringify(expected)}`);
      console.log(`     de sus respuestas sobrevivieron en el digest: ${JSON.stringify(BAKERY_MARKERS_EN.filter((b) => markersA.some((m) => String(m).toLowerCase() === b)))}`);
      const vA = captionsCarryDigestMarkers(outA, 'en');
      check('generate no-stream: los 5 captions llevan su frase (del digest)', vA.posts.length === 5 && vA.problems.length === 0,
        vA.problems.join('; ') || `marcadores=${JSON.stringify(vA.markers)}`);
      check('generate no-stream: ningún caption inventa voz fuera del digest', vA.problems.length === 0,
        vA.problems.join('; '));
      check('generate no-stream: un titular lleva su frase', headlineCarriesMarker(outA),
        `titulares=${JSON.stringify(outA.posts.map((p) => p.headline || p.title || ''))} marcadores=${JSON.stringify(vA.markers)}`);
    }

    // Generate B (sin marcadores): IG falso + respuestas de una palabra
    // (palabra suelta en 1 texto no es marcador) → la prueba sale como
    // hoy, sin eco y sin frase inventada.
    const genBFields = {
      business: 'Panadería Sola', ig: 'noexiste987654xyz',
      category: 'cafeteria', country: 'AR', tone: 'vos', lang: 'es',
      producto: 'Pan', diferencial: 'Casero',
      producto_estrella: 'Pan', diferencial: 'Casero',
      audiencia: 'Vecinos', cta: 'Reservar', promo: 'Sin promo',
      voz: 'Cercano', precios: 'Sí',
    };
    const genB = await postForm('/api/trial/generate' + KEY_QS, genBFields);
    let outB = null;
    try { outB = JSON.parse(genB.text); } catch (e) { outB = null; }
    check('generate sin voz HTTP 200 + JSON', genB.status === 200 && !!outB,
      `status=${genB.status} body=${String(genB.text).slice(0, 200)}`);
    if (outB && Array.isArray(outB.posts) && outB.posts.length === 5) {
      const markersB = (((outB || {}).digest || {}).voz_marcadores || []);
      console.log(`     marcadores del caso sin voz: ${JSON.stringify(markersB)}`);
      const noEcho = outB.posts.every((p) => !String(p.caption || '').includes('En tus palabras') && !String(p.caption || '').includes('«'));
      check('generate sin voz: ningún caption trae eco ni frase entre «»', noEcho,
        JSON.stringify(outB.posts.map((p) => p.caption)));
      check('generate sin voz: el digest no trae marcadores', markersB.length === 0,
        `voz_marcadores=${JSON.stringify(markersB)}`);
    } else {
      check('generate sin voz trae 5 posteos', false, `posts=${outB && outB.posts && outB.posts.length} error=${outB && outB.error}`);
    }

    // Stream: mismo caso que A, por el camino SSE. El evento done trae
    // { out } (no el out directo).
    const stream = await postForm('/api/trial/generate-stream' + KEY_QS, genAFields);
    let outS = null;
    if (stream.status === 200) {
      const doneIdx = stream.text.lastIndexOf('event: done');
      const chunk = doneIdx >= 0 ? stream.text.slice(doneIdx) : stream.text;
      const m = chunk.match(/data:\s*(\{[\s\S]*\})/);
      try { const parsed = m ? JSON.parse(m[1]) : null; outS = (parsed && parsed.out) || parsed; } catch (e) { outS = null; }
    }
    check('generate-stream HTTP 200 + evento done con JSON', stream.status === 200 && !!outS,
      `status=${stream.status} tail=${String(stream.text).slice(-200)}`);
    if (outS && Array.isArray(outS.posts) && outS.posts.length === 5) {
      const vS = captionsCarryDigestMarkers(outS, 'en');
      check('generate-stream: los 5 captions llevan su frase (del digest)', vS.posts.length === 5 && vS.problems.length === 0,
        vS.problems.join('; ') || `marcadores=${JSON.stringify(vS.markers)}`);
      check('generate-stream: un titular lleva su frase', headlineCarriesMarker(outS),
        `titulares=${JSON.stringify(outS.posts.map((p) => p.headline || p.title || ''))} marcadores=${JSON.stringify(vS.markers)}`);
    } else {
      check('generate-stream trae 5 posteos', false, `posts=${outS && outS.posts && outS.posts.length}`);
    }
  } finally {
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    if (!hadData) { try { fs.rmSync(path.join(__dirname, 'data'), { recursive: true, force: true }); } catch (e) {} }
  }
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
