'use strict';
/* Suite LOTE SOULCYCLE-CIERRE-2 (CIERRE 2 de la corrida SoulCycle,
 * candidata 1 de 5 del gate, 15/11/2026).
 * La corrida coronó como estrella a «From USD» — un fragmento de
 * precio minado de «From $38.00» (evidencia: offerSheet «From USD
 * $38.00») — con sin_confirmar: true, y abrió el diseño de la semana
 * («Try From USD today») sin que la puerta de duda viera nada:
 * question_candidates salió [] porque no había estrella inferida y
 * la candidata de rubro no tenía candidatas. Gemelo del «Infused»
 * de Blind Barber. Dos cierres:
 *  (1) LA ESTRELLA NO PUEDE SER UN FRAGMENTO DE PRECIO: la clase
 *      isPriceFragmentName (resto vacío de material de precio, con
 *      al menos un token fuerte) queda cableada en la admisión
 *      (isPlausibleOfferItem → ingesta/scrub/insignia/validez de
 *      ancla/temas), en inferStar, en starNamedEvidenceOk y en la
 *      rotación de estrellas del diseño (estrellasDeDigest). Un
 *      nombre real con un número o una moneda como parte de su
 *      identidad («Air Max 90», «Peso Pluma») NO es un fragmento.
 *  (2) LA ESTRELLA SIN CONFIRMAR NO ABRE EN SILENCIO: si no hay
 *      estrella confirmada ni insignia ni candidata de inferida,
 *      pero el diseño abriría anclado en un ítem, nace la candidata
 *      de estrella (motivo ancla_sin_confirmar) y la puerta
 *      trialPreguntaGate pregunta antes de armar.
 * Uso: node test-lote-soulcycle-cierre2.js [--no-boot]
 * Control contra la base: LOTE_BASE_DIR=<árbol base v1102>. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-soulcycle-c2-data-'));

const REL = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.resolve(REL, '..', 'base');
const cd = require(path.join(REL, 'client-digest'));
const cre = require(path.join(REL, 'creatividad'));
const CD_SRC = fs.readFileSync(path.join(REL, 'client-digest.js'), 'utf8');
const CRE_SRC = fs.readFileSync(path.join(REL, 'creatividad.js'), 'utf8');
const SERVER_SRC = fs.readFileSync(path.join(REL, 'server.js'), 'utf8');
const APPJS_SRC = fs.readFileSync(path.join(REL, 'public', 'app.js'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(REL, 'public', 'index.html'), 'utf8');
const WAITLIST_SRC = fs.readFileSync(path.join(REL, 'waitlist.js'), 'utf8');
const RUBRO_SRC = fs.readFileSync(path.join(REL, 'rubro-id.js'), 'utf8');
const tieneBase = fs.existsSync(path.join(BASE, 'client-digest.js'));
const cdB = tieneBase ? require(path.join(BASE, 'client-digest')) : null;
const creB = tieneBase ? require(path.join(BASE, 'creatividad')) : null;
const APPJS_BASE = tieneBase ? fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') : '';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function seccion(s) { console.log('\n[' + s + ']'); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }

/* ------------------------------------------------ fixtures */
// El digest de la corrida, fiel a done-out.json (SoulCycle leído del
// negocio equivocado: la tienda BMX de Amsterdam). Los dos primeros
// «productos» son los fragmentos de precio minados de la vidriera.
function digestCorrida() {
  return {
    business: 'SoulCycle', category: 'otro', subcat: '',
    productos: [
      { nombre: 'From USD', precio: '$38.00' }, { nombre: 'USD', precio: '$47.00' },
      { nombre: 'Rotor Set Install' }, { nombre: 'Bars Cutting' }, { nombre: 'General BMX Maintenance' },
      { nombre: 'HALLOWEEN RIDE-OUT 2026 💀' }, { nombre: 'KINK 2027 COLLECTION' }, { nombre: 'WHEELS OF STEEL' },
      { nombre: 'Clip', fuente: 'caption' }, { nombre: 'Turn It Up', fuente: 'caption' },
      { nombre: 'Booking', fuente: 'caption' }, { nombre: 'Link', fuente: 'caption' },
    ],
    servicios: [],
    productos_nombrados: [
      { nombre: 'Clip', fuente: 'caption', menciones: 3, clases: ['frase', 'repetida', 'sujeto'] },
      { nombre: 'Turn It Up', fuente: 'caption', menciones: 3, clases: ['frase', 'repetida'] },
      { nombre: 'Booking', fuente: 'caption', menciones: 2, clases: ['frase', 'repetida', 'sujeto'] },
      { nombre: 'Link', fuente: 'caption', menciones: 2, clases: ['frase', 'repetida', 'sujeto'] },
      { nombre: 'Thanksgiving', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'Turkey Burns', fuente: 'caption', menciones: 1, clases: ['frase', 'sujeto'] },
      { nombre: 'Soul Early', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'GO ALL IN', fuente: 'caption', menciones: 1, clases: ['frase', 'sujeto'] },
      { nombre: 'Palm Beach', fuente: 'caption', menciones: 1, clases: ['frase', 'sujeto'] },
      { nombre: 'From USD', fuente: 'web-catalog', menciones: 0, clases: ['catalogo'] },
      { nombre: 'USD', fuente: 'web-catalog', menciones: 0, clases: ['catalogo'] },
      { nombre: 'Rotor Set Install', fuente: 'web', menciones: 0, clases: ['catalogo'] },
    ],
    inferred_star: null, dueno: null, temas_feed: [],
    rubro_id: { v: 1, rubro: 'otro', subrubro: '', confianza: 0, candidatas: [], evidencia: [], fuente: 'deteccion', segura: false, nivel_duda: 'rubro', needs_question: false, sin_confirmar: true },
    onboarding: { producto_estrella: '', diferencial: '', etapa: '' },
  };
}
// El input que en la base corona al fragmento por inferencia: el
// fragmento encabeza el catálogo, se repite en captions y su posteo
// es el de más alcance y más cariño.
function inferInput(d) {
  return {
    items: d.productos,
    captions: ['From USD now in store', 'From USD restocked', 'From USD back again'],
    orderNames: d.productos.map((p) => p.nombre),
    metrics: [{ text: 'From USD launch day', reach: 2000, likes: 50, comments: 5 }],
  };
}
// Caso sano: estrella real corroborada con un número en el nombre.
function digestSano() {
  return {
    business: 'Zapatería Andina', category: 'moda', subcat: '',
    productos: [{ nombre: 'Air Max 90' }, { nombre: 'Classic Leather' }],
    servicios: [],
    productos_nombrados: [{ nombre: 'Air Max 90', fuente: 'web-catalog', menciones: 6, clases: ['catalogo'] }],
    inferred_star: { item: 'Air Max 90', confidence: 0.85, evidence: ['aparece en 6 de sus últimos posteos'], fuente: 'feed' },
    dueno: {}, temas_feed: [],
    rubro_id: { v: 1, rubro: 'moda', subrubro: '', confianza: 0.9, candidatas: [], evidencia: [], fuente: 'deteccion', segura: true, nivel_duda: '', needs_question: false, sin_confirmar: false },
    onboarding: { producto_estrella: '', diferencial: '', etapa: '' },
  };
}

/* ------------------------------------------------ A · la clase */
seccion('A · isPriceFragmentName — la clase fragmento de precio');
{
  ok(typeof cd.isPriceFragmentName === 'function', 'A1 la guarda existe y se exporta');
  const fragmentos = ['From USD', 'USD', 'From $38.00', '$38.00', 'USD $47.00', 'Desde $99', '$10-$20', '10 a 20 pesos', 'USD 38', '38 USD', 'EUR', 'Desde 50 dolares', 'A partir de $50', '2 x 1'];
  ok(fragmentos.every((x) => cd.isPriceFragmentName(x)), 'A2 toda cadena con forma de precio ES fragmento', fragmentos.filter((x) => !cd.isPriceFragmentName(x)));
  const nombres = ['Air Max 90', '212 VIP', 'Peso Pluma', 'Nike Air Force 1', 'Rotor Set Install', 'Espresso', 'Sol', 'No. 5', 'KINK 2027 COLLECTION', 'WHEELS OF STEEL', 'General BMX Maintenance', 'Café de especialidad', 'HALLOWEEN RIDE-OUT 2026 💀', 'Classic Leather'];
  ok(nombres.every((x) => !cd.isPriceFragmentName(x)), 'A3 un nombre real con número/moneda como identidad NO es fragmento', nombres.filter((x) => cd.isPriceFragmentName(x)));
  ok(cd.isPlausibleOfferItem('From USD') === false && cd.isPlausibleOfferItem('USD') === false, 'A4 la admisión rechaza los fragmentos de la corrida');
  ok(cd.isPlausibleOfferItem('Rotor Set Install') === true && cd.isPlausibleOfferItem('Air Max 90') === true, 'A5 la admisión sigue aceptando ítems reales');
}

/* ------------------------------------------------ B · la corrida */
seccion('B · el fixture de la corrida — el fragmento no corona en ninguna superficie');
{
  const d = digestCorrida();
  ok(cd.effectiveStarOf(d) === null, 'B1 sin estrella confirmada: no se inventa ninguna', cd.effectiveStarOf(d));
  ok(cd.insigniaOf(d) === null, 'B2 sin insignia válida en el fixture');
  const topics = cd.deriveTopics(d, { lang: 'en', count: 5, category: 'otro' });
  ok(topics.length > 0 && topics.every((t) => !cd.isPriceFragmentName(t.digest_anchor || '')), 'B3 ningún tema de la semana ancla en un fragmento de precio', topics.map((t) => t.digest_anchor));
  ok(topics.length > 0 && topics[0].digest_anchor === 'Rotor Set Install', 'B4 la estrella cae a la candidata corroborada (el primer ítem real)', topics[0] && topics[0].digest_anchor);
  const rot = cre.estrellasDeDigest(d, null);
  ok(!rot.includes('From USD') && !rot.includes('USD') && rot.includes('Rotor Set Install'), 'B5 la rotación de estrellas del diseño sale sin fragmentos', rot);
  ok(cd.starAnchorValida(d, 'From USD') === false && cd.starAnchorValida(d, 'Rotor Set Install') === true, 'B6 la validez del ancla rechaza el fragmento y acepta el ítem real');
  const inf = cd.inferStar(inferInput(d));
  ok(!inf || inf.item !== 'From USD', 'B7 inferStar no corona el fragmento aunque encabece el catálogo', inf);
  const dMv = digestCorrida(); dMv.dueno = { mas_vendido: 'From USD' };
  ok(cd.insigniaOf(dMv) === null, 'B8 ni como insignia: mas_vendido «From USD» no corona', cd.insigniaOf(dMv));
  const dScr = digestCorrida(); cd.scrubDigestItems(dScr);
  ok((dScr.productos || []).every((p) => !cd.isPriceFragmentName(p.nombre || p)), 'B9 el scrub al guardar limpia los fragmentos del fundamento', (dScr.productos || []).map((p) => p.nombre));
}

/* ------------------------------------------------ C · la puerta */
seccion('C · la puerta de duda — la estrella sin confirmar pregunta antes de armar');
{
  const d = digestCorrida();
  const cands = cd.questionCandidatesOf(d);
  const cand = cands.find((c) => c.tipo === 'estrella' && c.motivo === 'ancla_sin_confirmar');
  ok(!!cand, 'C1 nace la candidata de la estrella sin confirmar', cands);
  ok(!!cand && cand.item === 'Rotor Set Install' && cand.sin_confirmar === true, 'C2 la candidata nombra el ancla corroborada y se marca sin confirmar', cand);
  d.question_candidates = cands;
  const q = cd.trialQuestionFor(d, { lang: 'en' });
  // (ACTUALIZADO CON CAUSA — LOTE SOULCYCLE-CIERRE-6 · PISO DE LA
  // DUDA) El fixture de la corrida es TAMBIÉN el estado cero de
  // señal IG (rubro «otro», confianza 0, sin candidatas ni
  // evidencia): desde el cierre 6 la puerta pregunta PRIMERO el
  // rubro con opciones amplias (motivo sin_senal_ig) — preguntar la
  // estrella de un negocio que no se sabe qué es fue el fallo de la
  // re-corrida — y la pregunta de estrella de ESTE lote se sirve al
  // responder el rubro. C3/C5 se ajustan a ese orden; la duda de
  // estrella y su no-repregunta quedan verificadas un paso después.
  ok(!!q && q.tipo === 'rubro' && q.motivo === 'sin_senal_ig', 'C3 la puerta pregunta primero el rubro (piso de la duda del cierre 6: el fixture es el estado cero)', q);
  const qStar = cd.trialQuestionFor(d, { lang: 'en', answered: { rubro: true } });
  ok(!!qStar && qStar.tipo === 'estrella' && qStar.item === 'Rotor Set Install', 'C3b respondido el rubro, la puerta devuelve la pregunta de estrella (EN)', qStar);
  ok(!!qStar && Array.isArray(qStar.opciones) && qStar.opciones.length >= 2 && qStar.opciones.every((o) => !cd.isPriceFragmentName(o)), 'C4 las opciones de un toque son ítems reales — ningún fragmento', qStar && qStar.opciones);
  const qSkip = cd.trialQuestionFor(d, { lang: 'en', answered: { rubro: true, estrella: true } });
  ok(qSkip === null, 'C5 lo respondido/salteado no se repregunta', qSkip);
  // Compat Lote A: con contradicción marcada, esa candidata sigue primera.
  const dRec = digestCorrida();
  dRec.reconciliacion = { contradiccion: true, ig: { rubro: 'fitness', fuente: 'prefill' }, web: { rubro: 'otro', nombre: 'soulcyclebmx', url: 'https://soulcycle.com/' }, motivo: 'web_no_encaja' };
  const candsRec = cd.questionCandidatesOf(dRec);
  ok(candsRec.length > 0 && candsRec[0].motivo === 'contradiccion_fuentes', 'C6 la contradicción del Lote A sigue siendo la primera candidata', candsRec.map((c) => c.motivo || c.tipo));
}

/* ------------------------------------------------ D · caso sano */
seccion('D · caso sano — la estrella real corroborada abre sin freno espurio');
{
  const s = digestSano();
  const eff = cd.effectiveStarOf(s);
  ok(!!eff && eff.item === 'Air Max 90' && eff.source === 'inferred', 'D1 la estrella real con número en el nombre corona confirmada', eff);
  const tops = cd.deriveTopics(s, { lang: 'es', count: 3, category: 'moda' });
  ok(tops.length > 0 && tops[0].digest_anchor === 'Air Max 90' && tops[0]._star === 1, 'D2 el primer tema es la estrella (_star) — abre la semana', tops[0] && { a: tops[0].digest_anchor, star: tops[0]._star });
  const candsS = cd.questionCandidatesOf(s);
  ok(!candsS.some((c) => c.motivo === 'ancla_sin_confirmar'), 'D3 la candidata nueva NO nace con estrella corroborada', candsS);
  ok(candsS.some((c) => c.tipo === 'estrella' && c.item === 'Air Max 90' && !c.sin_confirmar), 'D4 la única duda es la confirmación clásica de la inferida', candsS);
}

/* ------------------------------------------------ E · control base */
seccion('E · control contra la base v1102 (la corrida coronaba en silencio)');
if (tieneBase) {
  ok(typeof cdB.isPriceFragmentName !== 'function', 'E1 base: la guarda no existe');
  const dB = digestCorrida();
  const topicsB = cdB.deriveTopics(dB, { lang: 'en', count: 5, category: 'otro' });
  ok(topicsB.length > 0 && topicsB[0].digest_anchor === 'From USD', 'E2 base: el slot 0 anclaba en «From USD» (el fallo original)', topicsB.map((t) => t.digest_anchor));
  ok(cdB.starAnchorValida(dB, 'From USD') === true, 'E3 base: la validez del ancla aceptaba el fragmento');
  const rotB = creB.estrellasDeDigest(dB, null);
  ok(rotB.includes('From USD') && rotB.includes('USD'), 'E4 base: la rotación de estrellas traía los fragmentos', rotB);
  const infB = cdB.inferStar(inferInput(dB));
  ok(!!infB && infB.item === 'From USD', 'E5 base: inferStar coronaba el fragmento', infB);
  const candsB = cdB.questionCandidatesOf(dB);
  dB.question_candidates = candsB;
  ok(!candsB.some((c) => c.tipo === 'estrella'), 'E6 base: ninguna candidata de estrella — la puerta no veía la duda', candsB);
  ok(cdB.trialQuestionFor(dB, { lang: 'en' }) === null, 'E7 base: la puerta no frenaba — la semana abría en silencio');
} else {
  console.log('  (sin LOTE_BASE_DIR: se salta el control)');
}

/* ------------------------------------------------ F · cableado */
seccion('F · cableado y stamps de la cadena');
{
  ok(count(CD_SRC, 'function isPriceFragmentName') === 1, 'F1 la guarda está definida una vez en client-digest');
  ok(count(CD_SRC, 'if (isPriceFragmentName(s)) return false') === 1 && count(CD_SRC, '!isPriceFragmentName(String(x.nombre || x))') === 1 && count(CD_SRC, 'isCreditRoleName(s) || isPriceFragmentName(s)) return false') === 1, 'F2 cableada en la admisión (isPlausibleOfferItem), en inferStar y en starNamedEvidenceOk');
  ok(count(CD_SRC, "motivo: 'ancla_sin_confirmar'") === 1 && count(CD_SRC, 'function anclaSinConfirmarOf') === 1, 'F3 la candidata del ancla sin confirmar existe');
  ok(count(CRE_SRC, 'isPriceFragmentName') >= 2, 'F4 la rotación de estrellas (creatividad) filtra por la guarda');
  ok(count(SERVER_SRC, 'trialPreguntaGate(trialDigest, fields, ocAns, lang)') === 2, 'F5 la puerta sigue cableada en las DOS rutas de la prueba');
  ok(count(SERVER_SRC, "const BUILD_ID = '20261105-v1103'") === 1, 'F6 BUILD_ID v1103');
  ok(count(APPJS_SRC, "const PZ_BUILD = '20261105-v1103'") === 1, 'F7 PZ_BUILD en paridad v1103');
  ok(count(INDEX_SRC, 'app.js?v=749') === 1, 'F8 index ES sirve app.js?v=749');
  ok(count(RUBRO_SRC, 'reconcileSources') >= 1 && count(SERVER_SRC, 'digest.reconciliacion') >= 0 && CD_SRC.includes('reconciliacion'), 'F9 el marcador del Lote A (reconciliación) sigue presente');
  ok(WAITLIST_SRC.includes('20261128') && WAITLIST_SRC.includes('20261130'), 'F10 la ventana del gate de la lista (28–30/11/2026) sigue intacta');
  if (tieneBase) {
    const defs = (src) => (src.match(/function [A-Za-z_$][A-Za-z0-9_$]*\s*\(/g) || []).sort().join('|');
    ok(defs(APPJS_SRC) === defs(APPJS_BASE), 'F11 funciones auditadas: las definiciones de app.js son idénticas a la base (solo cambió el stamp)');
  }
}

/* ------------------------------------------------ G · boot */
async function boot() {
  if (process.argv.includes('--no-boot')) { console.log('\n[G · boot] salteado por --no-boot'); return; }
  seccion('G · boot aislado del árbol final');
  const PORT = 34574;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-soulcycle-c2-boot-'));
  const nmSnapshot = path.join(os.homedir(), 'workspace', 'posta', 'node_modules');
  const nodePath = process.env.NODE_PATH || (fs.existsSync(nmSnapshot) ? nmSnapshot : '');
  const server = spawn('node', ['server.js'], {
    cwd: REL,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: 'development', ...(nodePath ? { NODE_PATH: nodePath } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logBuf = '';
  server.stdout.on('data', (d) => { logBuf += d; });
  server.stderr.on('data', (d) => { logBuf += d; });
  const getJson = async (p) => {
    const r = await fetch('http://127.0.0.1:' + PORT + p);
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try { const v = await getJson('/api/version'); up = v.status === 200; } catch (e) { /* todavía no */ }
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    ok(up, 'G1 el servidor levanta en el puerto aislado', logBuf.slice(-300));
    if (up) {
      const v = await getJson('/api/version');
      ok(v.body && v.body.build === '20261105-v1103', 'G2 /api/version del boot = v1103', v.body);
      const f = await getJson('/api/founders');
      ok(f.status === 200 && f.body && f.body.ok === true, 'G3 /api/founders responde 200 en el boot (sin regresión)', f);
    }
  } finally {
    try { server.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
    try { if (!server.killed) server.kill('SIGKILL'); } catch (e) {}
  }
}

boot().then(() => {
  console.log(`\n== test-lote-soulcycle-cierre2: ${pass} ok · ${fail} mal ==`);
  if (failures.length) console.log('fallaron:', failures.join(' | '));
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error('ERROR test:', e); process.exit(1); });
