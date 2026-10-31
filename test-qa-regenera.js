// test-qa-regenera.js — "QA QUE REHACE SOLA" (2026-10-26, ítem 3 ARMA TODO).
//
// Parte A (loop, sin IA ni servidor): el módulo puro qa-gate.js con
// adaptadores falsos — rechazo → regeneración → entrega o bandeja.
// Parte B (definición de la vara): el pase es EXACTAMENTE el del audit
// (los checks solo-auditoría no deciden).
// Parte C (prompt correctivo): las correcciones nombran cada falla.
// Parte D (contrato estático): server.js trae el gate síncrono, la
// línea MORA-7, y el enforcement en todos los llamadores que crean o
// actualizan posteos.
// Uso: node test-qa-regenera.js (sale 0 solo si todo pasa).
const fs = require('fs');
const path = require('path');
const qaGate = require('./qa-gate');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const PASS = { texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, brand_ok: true, anatomia_ok: true, headline_clear: true, headline_complete: true, detalle: 'todo bien, robot en café' };
const FAIL_TEXTO = { ...PASS, texto_ok: false, detalle: 'texto garbled en cartel' };
const FAIL_ALL = { texto_ok: false, colores_ok: false, claims_ok: false, mobile_ok: false, brand_ok: false, anatomia_ok: false, headline_clear: false, headline_complete: false, detalle: 'todo mal' };

// Harness: evaluate responde según una lista (o null); generate/save/
// composite/retain registran llamadas. Nada de red, nada de IA.
function harness(evals) {
  let ei = 0;
  const calls = { evaluate: 0, generate: [], save: 0, composite: 0, retain: [] };
  return {
    calls,
    evaluate: async () => { calls.evaluate++; const v = evals[Math.min(ei++, evals.length - 1)]; return v === undefined ? null : v; },
    generate: async (corrPrompt) => { calls.generate.push(corrPrompt); return `b64-${calls.generate.length}`; },
    save: async (b64, corrPrompt) => { calls.save++; return { abs: `/media/gen${calls.save}.jpg`, pub: `/media/gen${calls.save}.jpg` }; },
    composite: async () => { calls.composite++; },
    retain: async (abs, reason) => { calls.retain.push([abs, reason]); },
  };
}

(async () => {
  console.log('— Parte A: el loop (rechazo → regeneración → entrega o bandeja)');

  { // 1. Pasa al primer intento: sin regeneración.
    const h = harness([PASS]);
    const r = await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h });
    ok(r.outcome === 'delivered' && r.attempts === 1 && r.path === '/media/orig.jpg', 'pasa al primer intento: delivered, 1 intento, path original');
    ok(h.calls.evaluate === 1 && h.calls.generate.length === 0 && h.calls.retain.length === 0, 'sin regenerar ni retener cuando pasa al primer intento');
    ok(r.firstQa === PASS && r.finalPrompt === 'BASE', 'firstQa y finalPrompt son los del intento original');
  }

  { // 2. Falla texto → regenera con la corrección → pasa.
    const h = harness([FAIL_TEXTO, PASS]);
    const r = await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h });
    ok(r.outcome === 'delivered' && r.attempts === 2 && r.path === '/media/gen1.jpg', 'falla texto → regenera → delivered en 2 intentos con el path nuevo');
    ok(h.calls.generate.length === 1 && h.calls.generate[0].includes('CORRECTION') && h.calls.generate[0].includes('NO text, letters or numbers anywhere'), 'la corrección nombra la falla de texto (fix 2026-10-16 textual)');
    ok(h.calls.generate[0].startsWith('BASE\nCORRECTION'), 'la corrección va sobre el prompt base, misma forma del correctivo viejo');
    ok(h.calls.composite === 1 && h.calls.retain.length === 1 && h.calls.retain[0][0] === '/media/orig.jpg', 'se compone el titular en la regenerada y se retiene la fallida original');
    ok(r.finalPrompt === h.calls.generate[0], 'finalPrompt es el prompt correctivo que produjo la entrega');
  }

  { // 3. Falla siempre → bandeja tras el tope, nunca entrega.
    const h = harness([FAIL_ALL]);
    const r = await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h });
    ok(r.outcome === 'bandeja' && r.attempts === 3, 'falla siempre → bandeja tras EXACTAMENTE 3 intentos (tope)');
    ok(h.calls.evaluate === 3 && h.calls.generate.length === 2, '3 evaluaciones y 2 regeneraciones (no hay 4ª generación)');
    ok(h.calls.retain.length === 3, 'los 3 intentos fallidos quedan retenidos (diagnóstico)');
    ok(r.failedChecks.includes('texto') && r.failedChecks.includes('claims') && r.failedChecks.includes('headline_clear'), 'failedChecks lista todas las fallas');
    ok(r.path === '/media/gen2.jpg', 'el path de bandeja es el último intento (el llamador lo marca needs_review, no lo entrega)');
  }

  { // 4. QA sin veredicto (null) siempre → bandeja, fail-closed.
    const h = harness([null]);
    const r = await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h });
    ok(r.outcome === 'bandeja' && r.attempts === 3, 'QA null siempre → bandeja tras 3 intentos (fail-closed, no se entrega sin verificar)');
    ok(eq(r.failedChecks, ['qa_unavailable']) && /sin veredicto/.test(r.reason), 'falla qa_unavailable con motivo explícito');
  }

  { // 5. QA null primero, pasa después → delivered.
    const h = harness([null, PASS]);
    const r = await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h });
    ok(r.outcome === 'delivered' && r.attempts === 2, 'null primero y pase después → delivered en 2 intentos');
    ok(r.firstQa === null, 'firstQa null queda registrado (la fila qa_audit sale passed NULL, como hoy)');
  }

  { // 6. Fallar generando propaga (no se convierte en bandeja silenciosa).
    const h = harness([FAIL_TEXTO, PASS]);
    h.generate = async () => { throw new Error('429 simulado'); };
    let threw = false;
    try { await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h }); } catch (e) { threw = /429/.test(e.message); }
    ok(threw, 'si la regeneración lanza (429/cap), el loop propaga: el llamador reintenta el motor o no crea el borrador');
  }

  { // 7. Retener que falla no rompe el loop.
    const h = harness([FAIL_TEXTO, PASS]);
    h.retain = async () => { throw new Error('disco lleno simulado'); };
    const r = await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h });
    ok(r.outcome === 'delivered' && r.attempts === 2, 'un retain que falla no rompe la entrega (es diagnóstico)');
  }

  console.log('— Parte B: la vara es la del audit, ni más ni menos');
  ok(qaGate.qaGatePassed(PASS) === true, 'todo true → pasa');
  ok(qaGate.qaGatePassed({ ...PASS, headline_clear: false }) === false, 'headline_clear false → NO pasa (definición del audit)');
  ok(qaGate.qaGatePassed({ ...PASS, headline_complete: false }) === true, 'headline_complete false SOLO → pasa (es solo-auditoría, no decide)');
  ok(qaGate.qaGatePassed({ ...PASS, contraste_ok: false, elementos_ok: false }) === true, 'contraste/elementos false solos → pasan (solo-auditoría)');
  ok(qaGate.qaGatePassed(null) === false && qaGate.qaGatePassed(undefined) === false, 'sin veredicto → NO pasa (fail-closed)');
  ok(qaGate.QA_GATE_MAX_ATTEMPTS === 3, 'tope de intentos = 3 generaciones en total');

  console.log('— Parte C: el prompt correctivo nombra cada falla');
  const multi = { ...PASS, colores_ok: false, mobile_ok: false, brand_ok: false, headline_complete: false, detalle: 'paleta ausente' };
  const cp = qaGate.qaGateCorrectionPrompt('BASE', multi);
  ok(cp.includes('brand colors into props') && cp.includes('phone screen') && cp.includes('own visual identity') && cp.includes('read complete on its own'), 'correcciones nuevas: colores, mobile, marca, headline_complete');
  ok(cp.includes('paleta ausente'), 'el detalle del QA viaja en la corrección');
  ok(cp.includes('keeping the same subject, scene, palette and style'), 'se conserva sujeto, escena, paleta y estilo');

  console.log('— Parte D: contrato estático en server.js');
  const srvPath = fs.existsSync(path.join(__dirname, 'server.js')) ? path.join(__dirname, 'server.js') : path.join(__dirname, 'work', 'server.js');
  const SRC = fs.readFileSync(srvPath, 'utf8');
  ok(SRC.includes("const qaGate = require('./qa-gate');"), 'server.js requiere ./qa-gate');
  ok(SRC.includes('never a lone symbol, letter or glyph (#, @, stray letters) as screen content'), 'MORA-7: la línea de pantallas en blanco/abstractas está en el estándar de escena');
  ok(!SRC.includes('QA de auditoría DESACOPLADO'), 'la auditoría desacoplada en background ya no existe');
  ok(!SRC.includes('[qa-correct]') && !SRC.includes('[qa-claims-block]'), 'el reintento correctivo viejo en background y el degrade a brand card ya no existen (los reemplaza el gate)');
  ok(SRC.includes('QA GATE SÍNCRONO') && SRC.includes('qaGate.QA_GATE_MAX_ATTEMPTS'), 'el motor corre el gate síncrono con el tope del módulo');
  ok(SRC.includes('qa_gate_outcome') && SRC.includes('qa_gate_final_path'), 'la fila qa_audit guarda el resultado del gate (semántica de la primera evaluación intacta)');
  const enf = (SRC.match(/qaGate\.outcome === 'bandeja'/g) || []).length;
  console.log(`    (enforcement: ${enf} sitios con qaGate.outcome === 'bandeja')`);
  ok(enf >= 12, `enforcement en los llamadores que crean/actualizan posteos (esperaba ≥12, hay ${enf})`);

  console.log(`\n${total - fails}/${total} OK`);
  if (fails) { console.error(`${fails} FALLA(S)`); process.exitCode = 1; }
})().catch((e) => { console.error('ERROR DEL TEST:', e); process.exitCode = 1; });
