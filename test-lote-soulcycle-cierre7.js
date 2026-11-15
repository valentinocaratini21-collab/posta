// test-lote-soulcycle-cierre7.js
// LOTE SOULCYCLE-CIERRE-7 — PRESUPUESTO QUE ALCANZA PARA LA PRIMERA
// IMAGEN (cierre 7 de la corrida SoulCycle, candidata 1 de 5 del
// gate, 15/11). EL ÚLTIMO CIERRE.
//
// FASE 1 · EL DIAGNÓSTICO (evidencia: ~/workspace/soulcycle-corrida2-15nov/
// + ledger de producción): el tope de gasto del demo es un pote
// GLOBAL diario (costs.demoAiCapOk, USD 10/día para TODAS las
// pruebas), no un presupuesto por semana. El día de la re-corrida el
// ledger cerró con demo-ai-image 44 × USD 0,25 = USD 11,00 (total
// demo-ai USD 11,44): la imagen nº 40 del día agotó el pote. La
// re-corrida (guest 104) nació con el pote ya muerto: su stream gastó
// USD 0 (demo_ai {used:false, pieces:0, cost_usd:0}) y sus 5 cadenas
// de rescate sellaron 'tope-de-gasto' en las 5 piezas sin generar una
// sola imagen (ese motivo nace del chequeo de tope ANTES de generar)
// — quema USD 0, pero ciclado eterno: el barrido la seguía re-abriendo
// 7+ horas después (gen-status rescuing:true) y al renovarse el pote
// la misma semana de insumo sin confirmar iba a quemar el día
// siguiente. El QA de logo de la prueba (qaGeneratedLogo) NO corrió
// en los ciclos trabados (sin generación no hay compuesto ni QA); el
// instrumento que miente aceptando es el de la otra tubería
// (client_logo_ok !== false; falsos pases 619/620 de Mora, clase
// MORA-11, lote M218 — fuera de alcance).
//
// FASE 2 · EL ARREGLO (solo desde ese diagnóstico):
//   (1) FIRMA DE INTENTO por pieza (digest + archivo de logo +
//       titular): un veredicto que ya costó generaciones — 'logo-qa'
//       · 'qa-concepto' — sobre la misma firma NO se re-compra: la
//       pieza conserva su veredicto sin llamar a la generación.
//   (2) EL TOPE NO SE CICLA: una pasada sin completar nada con todas
//       las pendientes en 'tope-de-gasto' u omitidas cierra la cadena
//       en UNA pasada; y el re-enganche no re-abre mientras el pote
//       siga muerto y las piezas ya declaren ese tope.
//   (3) CAMINO Y ESCALACIÓN: los cierres de cadena sin completar
//       ninguna pieza por bloqueo declarado cuentan
//       (payload.rescate_cierres); a los 3, la semana ESCALA
//       (payload.escalacion {motivo, desbloqueo, cierres, firma} +
//       estado 'escalado' por pieza) y el barrido no la re-abre
//       mientras la firma global no cambie; si el insumo cambia, la
//       escalación se levanta y la cadena trabaja — el camino real.
//
// Se corre desde la raíz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-soulcycle-cierre7.js
// Control contra la base v1106: PZ_ROOT=<base> (la sección A cae; en
// el boot, la semana del tope cicla sin cerrar en una pasada ni
// contar cierres, la re-entrada re-abre la cadena contra el pote
// muerto, y la semana del veredicto caro re-compra su veredicto sin
// escalar jamás).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const ENINDEX = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const WAITLIST = fs.readFileSync(path.join(ROOT, 'waitlist.js'), 'utf8');
const DIGEST = fs.readFileSync(path.join(ROOT, 'client-digest.js'), 'utf8');
const RUBRO = fs.readFileSync(path.join(ROOT, 'rubro-id.js'), 'utf8');
const FEEDAUDIT = fs.readFileSync(path.join(ROOT, 'feed-audit.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function seccion(s) { console.log('\n[' + s + ']'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const iRescate = SERVER.indexOf('async function scheduleWeekRescue');
const cuerpoRescate = iRescate >= 0 ? SERVER.slice(iRescate, iRescate + 90000) : '';
const iRearmar = SERVER.indexOf('async function rearmarSemanaPruebaPorCacheKey');
const cuerpoRearmar = iRearmar >= 0 ? SERVER.slice(iRearmar, iRearmar + 9000) : '';
const iGuest = SERVER.indexOf("app.post('/api/guest/start'");
const cuerpoGuest = iGuest >= 0 ? SERVER.slice(iGuest, iGuest + 60000) : '';

/* ── A · Censo estático del lote ─────────────────────────────── */
seccion('A · firma de intento y no re-gasto');
{
  ok(SERVER.includes('function rescateFirmaPieza') && SERVER.includes('function rescateFirmaGlobal'), 'A1 existen las firmas de intento (pieza y global)');
  ok(SERVER.includes("RESCATE_MOTIVOS_SIN_REGASTO = new Set(['logo-qa', 'qa-concepto'])"), 'A2 los veredictos caros que no se re-compran son logo-qa y qa-concepto');
  ok(cuerpoRescate.includes('omitidasRescate') && cuerpoRescate.includes('RESCATE_MOTIVOS_SIN_REGASTO.has(rescatePrev.motivo)'), 'A3 la pasada omite la pieza con veredicto caro sobre la misma firma (no llama a la cadena)');
  ok(cuerpoRescate.includes("omitidasRescate.has(idxM) ? 'detenido' : 'trabajando'"), 'A4 la pieza omitida queda detenido con su veredicto — no finge trabajando');
  ok(cuerpoRescate.includes('firma: firmasRescate.get(idx)') || cuerpoRescate.includes('firma: firmasRescate.get(idxM)'), 'A5 los sellos de rescate llevan la firma del insumo que los produjo');
}
seccion('A · el tope no se cicla');
{
  ok(cuerpoRescate.includes('CIERRE SIN RE-GASTO') && cuerpoRescate.includes("declararRescateDetenido('tope-de-gasto')"), 'A6 una pasada sin completar nada con todo en tope u omitido cierra la cadena en esa pasada');
  ok(cuerpoRearmar.includes('tope: true') && cuerpoRearmar.includes('costs.demoAiCapOk()'), 'A7 el re-enganche no re-abre con el pote muerto si las piezas ya declaran tope-de-gasto');
}
seccion('A · camino y escalación');
{
  ok(SERVER.includes('RESCATE_ESCALA_CIERRES = 3') && cuerpoRescate.includes('rescate_cierres'), 'A8 los cierres sin completar ninguna pieza cuentan (rescate_cierres)');
  ok(cuerpoRescate.includes("estado: 'escalado'") && cuerpoRescate.includes('finR.escalacion = {'), 'A9 al tercer cierre la semana escala: estado escalado por pieza + registro de escalación');
  ok(SERVER.includes('function rescateDesbloqueoPara') && SERVER.includes('tope diario de IA del demo') && SERVER.includes('falta el logo real del negocio'), 'A10 la escalación nombra su desbloqueo por motivo');
  ok(cuerpoRearmar.includes('escalada: true') && cuerpoRearmar.includes('la escalación se levanta'), 'A11 el re-enganche no re-abre una semana escalada con la misma firma; con firma nueva la levanta y re-abre');
  ok(cuerpoRescate.includes('RESCATE_MOTIVOS_BLOQUEO.has(m)'), 'A12 solo los cierres por bloqueo declarado cuentan para escalar (los transitorios no)');
}
seccion('A · marcadores de los lotes anteriores y stamps');
{
  ok(SERVER.includes('reconcileSources') || RUBRO.includes('reconcileSources'), 'A13 marcador cierre 1/A: reconcileSources');
  ok(SERVER.includes('trialWebCanonica'), 'A14 marcador lote A: trialWebCanonica (web canónica)');
  ok(DIGEST.includes('isPriceFragmentName') && DIGEST.includes('ancla_sin_confirmar'), 'A15 marcador cierre 2: isPriceFragmentName + ancla_sin_confirmar');
  ok(SERVER.includes('rescateSemanaSweep') && cuerpoGuest.includes('week_pending: true'), 'A16 marcador cierre 4: barrido + guest/start 202 week_pending');
  ok(SERVER.includes('duenoStarConflictoOf') && SERVER.includes('estrella_vinculante'), 'A17 marcador cierre 5 (lote B): la palabra del dueño vinculante');
  ok(DIGEST.includes('sin_senal_ig') && FEEDAUDIT.includes('parseProfilePageLink') && FEEDAUDIT.includes('retryProfileLink'), 'A18 marcador cierre 6 (lote C): piso de la duda + link leído de verdad');
  ok(WAITLIST.includes('20261128') && WAITLIST.includes('20261130'), 'A19 marcador ventana del gate: 20261128/20261130');
  ok(SERVER.includes("BUILD_ID = '20261105-v1107'"), 'A20 stamp BUILD v1107');
  ok(APPJS.includes("PZ_BUILD = '20261105-v1107'"), 'A21 stamp PZ_BUILD v1107 en paridad');
  ok(INDEX.includes('app.js?v=753') && !ENINDEX.includes('app.js?v=753'), 'A22 ?v=753 solo en el index ES');
}

/* ── B/C/D · Boot: los fixtures de la re-corrida, vivos ─────── */
const HEADLINES = ['Try Rotor Set Install today', 'Bars Cutting', '3 keys to general bmx maintenance', 'Rotor Set Install: order today', 'Something new just arrived'];
function fixturePayload(ig, digestHash, extra) {
  const posts = HEADLINES.map((h) => ({
    type: 'image', image: null, armando: true,
    headline: h, caption: 'Caption fixture ' + h, hashtags: '#fixture',
  }));
  const payload = {
    ok: true, engine: 25, lang: 'en', content_lang: 'en',
    business: 'SoulCycle', ig, category: 'otro', subcat: '',
    accent: '#B99B77', btn: '#5D2A0D',
    digest: { hash: digestHash, logo_file: 'logo-fix7.png', producto_estrella: null, texto_feed: null },
    web_info: { description: 'Soulcycle is a BMX shop in Amsterdam', url: '' },
    posts,
    design: {
      posts: HEADLINES.map((h) => ({ headline: h, subline: '', tema: null, text_mode: 'text', photo_source: 'brand-poster' })),
      styles: [], photos: [], videoIdx: 2, count: 5, engine: 25, subcat: null,
    },
    rescate_semana: [2, 3, 4].map((idx) => ({ idx, cadena: 'en-rescate', motivo: 'cadena-en-fondo' })),
    primer_posteo: null,
    week: [0, 1, 2, 3, 4].map((i) => ({ day: 'Monday', date: 'Nov 16', hour: '12:30 PM', post: i })),
    spots_left: 49, video_ok: false,
  };
  return Object.assign(payload, extra || {});
}
function firmaEsperada(digestHash, logoFile, headline) {
  return crypto.createHash('sha1').update(String(digestHash) + '|' + String(logoFile) + '|' + String(headline)).digest('hex').slice(0, 16);
}

async function boot() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 35800 + Math.floor(Math.random() * 150);
  const base = 'http://127.0.0.1:' + port;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-cierre7-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '', ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '', GEMINI_API_KEY: '', DEMO_AI_DAILY_CAP_USD: '0.10' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  async function req(method, url, body) {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, text };
  }
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(dataDir, 'posta.db');
  const readPayload = (ig) => {
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = ro.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(ig);
      return row && row.payload ? JSON.parse(row.payload) : null;
    } finally { ro.close(); }
  };
  const writePayload = (ig, payload) => {
    const rw = new DatabaseSync(dbPath);
    try {
      rw.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?) ON CONFLICT(ig) DO UPDATE SET payload = excluded.payload').run(ig, JSON.stringify(payload), Date.now());
    } finally { rw.close(); }
  };
  const pollUntil = async (fn, timeoutMs, stepMs) => {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > timeoutMs) return null;
      await sleep(stepMs || 2000);
    }
  };
  try {
    let version = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { const r = await fetch(base + '/api/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
      await sleep(1500);
    }
    ok(!!version, 'B1 el servidor botea y /api/version responde', version || out.slice(-300));
    eq(version && version.build, '20261105-v1107', 'B2 el build servido es el del lote');

    // Insumos físicos: el archivo de logo de las semanas fixture.
    fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'media', 'logo-fix7.png'), Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));

    /* ── Fixture A · la semana del tope (el estado de la re-corrida) ── */
    seccion('B · fixture del tope: cierra en una pasada, no cicla, vuelve cuando el pote vuelve');
    const IGA = 'soulcyclefix7';
    {
      const rw = new DatabaseSync(dbPath);
      // El pote del día ya quemado: USD 0,25 en imágenes demo contra un tope de USD 0,10.
      rw.prepare("INSERT INTO api_costs (feature, model, images, est_cost_usd) VALUES ('demo-ai-image', 'gpt-image-2@high', 1, 0.25)").run();
      rw.close();
    }
    writePayload(IGA, fixturePayload(IGA, 'fixturehashcierre7'));
    const stA0 = await req('GET', '/api/trial/gen-status?ig=' + IGA);
    ok(stA0.json && stA0.json.arming === 5 && stA0.json.rescuing === false, 'B3 gen-status: 5 en armado, nadie trabajando (como la re-corrida)', stA0.text.slice(0, 200));
    const gsA1 = await req('POST', '/api/guest/start', { ig: IGA, domain: '', device: 'dvc-cierre7', lang: 'en' });
    eq(gsA1.status, 202, 'B4 guest/start con la semana en armado: 202 week_pending (contrato del cierre 4 intacto)');
    const cierreA = await pollUntil(() => {
      const pl = readPayload(IGA);
      if (!pl || !Array.isArray(pl.posts)) return null;
      const detenidas = pl.posts.every((p) => p && p.rescate && p.rescate.estado === 'detenido' && p.rescate.motivo === 'tope-de-gasto');
      return detenidas && pl.rescate_cierres && pl.rescate_cierres.n === 1 ? pl : null;
    }, 90000);
    ok(!!cierreA, 'B5 la cadena cerró en UNA pasada: las 5 piezas detenido/tope-de-gasto y el cierre quedó contado (rescate_cierres.n=1)');
    const stA1 = await req('GET', '/api/trial/gen-status?ig=' + IGA);
    eq(stA1.json && stA1.json.rescuing, false, 'B6 tras el cierre, la cadena está detenida (rescuing:false) — no quedaron 6 pasadas de teatro corriendo');
    const gsA2 = await req('POST', '/api/guest/start', { ig: IGA, domain: '', device: 'dvc-cierre7', lang: 'en' });
    eq(gsA2.status, 202, 'B7 la re-entrada sigue siendo honesta (202)');
    let reabrioA = false;
    for (let i = 0; i < 10; i++) {
      const st = await req('GET', '/api/trial/gen-status?ig=' + IGA);
      if (st.json && st.json.rescuing === true) { reabrioA = true; break; }
      await sleep(1500);
    }
    eq(reabrioA, false, 'B8 con el pote todavía muerto, el re-enganche NO re-abre la cadena (el tope no se cicla)');
    {
      const rw = new DatabaseSync(dbPath);
      rw.prepare("DELETE FROM api_costs WHERE feature LIKE 'demo-ai%'").run();
      rw.close();
    }
    const gsA3 = await req('POST', '/api/guest/start', { ig: IGA, domain: '', device: 'dvc-cierre7', lang: 'en' });
    eq(gsA3.status, 202, 'B9 con el pote renovado, la entrada vuelve a responder 202');
    const trabajandoA = await pollUntil(() => {
      const pl = readPayload(IGA);
      if (!pl || !Array.isArray(pl.posts)) return null;
      return pl.posts.every((p) => p && p.rescate && p.rescate.estado === 'trabajando' && p.rescate.motivo === 'generacion-fallo') ? pl : null;
    }, 60000);
    ok(!!trabajandoA, 'B10 el camino se ejerció: con pote vivo la cadena re-abrió y las piezas volvieron a intentarse (trabajando · generacion-fallo sin claves — veredicto transitorio, sin skip ni escalación)');
    ok(!(trabajandoA && trabajandoA.escalacion), 'B11 la semana del tope no escaló por un cierre transitorio');

    /* ── Fixture B · el veredicto caro no se re-compra; la semana escala ── */
    seccion('C · fixture de firma: veredicto caro conservado, escalación, y levantamiento por insumo nuevo');
    const IGB = 'soulcyclefix7b';
    const payloadB = fixturePayload(IGB, 'fixturehashcierre7b', { rescate_cierres: { n: 2, at: Date.now() - 3600000 } });
    payloadB.posts = payloadB.posts.map((p, i) => ({
      ...p,
      rescate: { estado: 'detenido', motivo: 'logo-qa', firma: firmaEsperada('fixturehashcierre7b', 'logo-fix7.png', HEADLINES[i]), at: Date.now() - 3600000 },
    }));
    writePayload(IGB, payloadB);
    const gsB1 = await req('POST', '/api/guest/start', { ig: IGB, domain: '', device: 'dvc-cierre7', lang: 'en' });
    eq(gsB1.status, 202, 'C1 guest/start de la semana con veredicto caro: 202');
    const escalada = await pollUntil(() => {
      const pl = readPayload(IGB);
      if (!pl || !pl.escalacion) return null;
      const piezas = pl.posts.every((p) => p && p.rescate && p.rescate.estado === 'escalado' && p.rescate.motivo === 'logo-qa');
      return piezas ? pl : null;
    }, 60000);
    ok(!!escalada, 'C2 la semana ESCALÓ al tercer cierre: piezas en escalado/logo-qa — el veredicto caro NO se re-compró (nunca apareció generacion-fallo)');
    ok(!!(escalada && escalada.escalacion.motivo === 'logo-qa' && escalada.escalacion.cierres === 3), 'C3 el registro de escalación declara motivo (logo-qa) y cierres (3)', escalada && escalada.escalacion);
    ok(!!(escalada && /logo/i.test(escalada.escalacion.desbloqueo || '')), 'C4 la escalación nombra su desbloqueo (el archivo correcto del logo o la confirmación del dueño)');
    const gsB2 = await req('POST', '/api/guest/start', { ig: IGB, domain: '', device: 'dvc-cierre7', lang: 'en' });
    eq(gsB2.status, 202, 'C5 la entrada sobre la semana escalada sigue honesta (202)');
    let reabrioB = false;
    for (let i = 0; i < 8; i++) {
      const st = await req('GET', '/api/trial/gen-status?ig=' + IGB);
      if (st.json && st.json.rescuing === true) { reabrioB = true; break; }
      await sleep(1500);
    }
    eq(reabrioB, false, 'C6 con la firma intacta, la semana escalada NO se re-abre (ni por la entrada ni por el barrido)');
    // El insumo cambia: aparece OTRO archivo de logo (firma nueva).
    fs.writeFileSync(path.join(dataDir, 'media', 'logo-fix7-v2.png'), Buffer.from('89504e470d0a1a0a0000000d49484453', 'hex'));
    const plB = readPayload(IGB);
    plB.digest.logo_file = 'logo-fix7-v2.png';
    writePayload(IGB, plB);
    const gsB3 = await req('POST', '/api/guest/start', { ig: IGB, domain: '', device: 'dvc-cierre7', lang: 'en' });
    eq(gsB3.status, 202, 'C7 con insumo nuevo, la entrada responde 202');
    const levantada = await pollUntil(() => {
      const pl = readPayload(IGB);
      if (!pl || pl.escalacion) return null;
      const trabajando = pl.posts.every((p) => p && p.rescate && p.rescate.estado === 'trabajando' && p.rescate.motivo === 'generacion-fallo');
      return trabajando ? pl : null;
    }, 60000);
    ok(!!levantada, 'C8 el camino se ejerció: la firma nueva levantó la escalación y la cadena volvió a intentar las piezas (trabajando · generacion-fallo sin claves)');

    /* ── Fixture C · la semana sana no gana frenos ── */
    seccion('D · la semana sana: intentos normales, sin skip ni escalación');
    const IGC = 'soulcyclefix7c';
    writePayload(IGC, fixturePayload(IGC, 'fixturehashcierre7c'));
    const gsC1 = await req('POST', '/api/guest/start', { ig: IGC, domain: '', device: 'dvc-cierre7', lang: 'en' });
    eq(gsC1.status, 202, 'D1 guest/start de la semana sana: 202');
    const sana = await pollUntil(() => {
      const pl = readPayload(IGC);
      if (!pl || !Array.isArray(pl.posts)) return null;
      const intentando = pl.posts.every((p) => p && p.rescate && p.rescate.estado === 'trabajando' && p.rescate.motivo === 'generacion-fallo' && !!p.rescate.firma);
      return intentando ? pl : null;
    }, 60000);
    ok(!!sana, 'D2 la semana sana se intenta como siempre: cada pieza con su veredicto transitorio y su firma registrada (sin omisiones)');
    ok(!!(sana && !sana.escalacion && (!sana.rescate_cierres || sana.rescate_cierres.n === 0)), 'D3 la semana sana no suma cierres ni escalación');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await boot();
  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE SOULCYCLE-CIERRE-7: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
