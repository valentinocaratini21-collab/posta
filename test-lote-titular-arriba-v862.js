#!/usr/bin/env node
/* test-lote-titular-arriba-v862.js — LOTE TITULAR ARRIBA v862.
   Defecto (Valentino 10/11/2026 07:29, captura del posteo 583; y
   10/11/2026 08:41, captura del 590): el titular «Tu gimnasio, siempre
   activo» quedó en la banda INFERIOR y TAPABA el cuerpo del robot
   (torso y brazos); en el 590 el titular en letras grandes abajo tapaba
   la imagen (Posty en la oficina) aunque el hueco vacío estaba arriba.
   La regla: el titular va en el HUECO VACÍO detectado de la imagen,
   nunca sobre la imagen — ni sobre el sujeto, el producto ni Posty.
   Mecanismo: Gap 6 recomponía abajo cuando arriba tapaba al sujeto, y el
   QA gate no tenía campo para el solape en la banda inferior
   (headline_clear solo mira el tercio superior). La banda inferior NUNCA
   se chequeaba: el titular abajo sobre el sujeto pasaba todos los checks.
   Fix (v862, HUECO VACÍO — Valentino 10/11/2026 08:41, captura del 590):
   (1) el titular va SOLO en el HUECO VACÍO detectado de la imagen
   (generador); (2) el QA tiene campo DECISIVO headline_empty_space_ok
   (en el hueco vacío y sin tapar al sujeto; false = rechazado/
   regenerado); (3) si no hay hueco vacío, la pieza sale LIMPIA sin
   titular — nunca se mueve a otra zona para probar suerte (en el 583
   arriba tapaba la cabeza y abajo tapó torso y brazos).
   El 583 queda publicado como está (decisión Valentino 9/11 «Dejalo
   publicado») y el 590 no se regenera por esta regla (lo reemplaza el
   posteo de nails). Excepción deliberada: el chat-edit (el usuario pide
   explícitamente mover el texto) sigue pudiendo elegir la zona.

   Uso:  NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-titular-arriba-v862.js   (desde la raíz del árbol)
         node test-lote-titular-arriba-v862.js <dir>      (dir con server.js en la raíz)
   Autónomo (patrón de las suites del repo): node:sqlite no hace falta
   acá — módulo puro + estáticas + spawn + fetch, sin harness externo.
   Bootea el server con DATA_DIR en /tmp (nunca producción).

   Parte 0: pines de la base v861 + BUILD v862. [RE-PIN 10/11: base v859 -> v861]
   Parte 1: el gate (módulo puro qa-gate, sin IA ni servidor) — el caso
     583 (titular fuera del hueco vacío, sobre el sujeto) es RECHAZADO
     y el caso bueno (titular en el hueco vacío) es ACEPTADO.
   Parte 2: estáticas del QA en server.js (prompt + parse + log).
   Parte 3: estáticas de la regla de colocación (generador, Gap 6, demo,
     composite-headline.py, excepción chat-edit).
   Parte 4: boot aislado — /api/version v862 + /api/qa-audit 200.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const qaGate = require('./qa-gate');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- Parte 0: pines de la base v861 + BUILD v862 ---- [RE-PIN 10/11: el comentario decía v854 (rancio)]
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const supMod = fs.readFileSync(path.join(TREE, 'supervision-chat.js'), 'utf8');
const gen = fs.readFileSync(path.join(TREE, 'generator.js'), 'utf8');

console.log('— Parte 0: pines de la base v861 + BUILD v862');
ok(srv.includes("const BUILD_ID = '20261105-v862'"), 'BUILD v862 estampado en server.js');
ok((srv.match(/20261105-v862/g) || []).length === 1, 'BUILD v862 ×1 en server.js');
ok(!srv.includes('20261105-v854') && !srv.includes('20261105-v859') && !srv.includes('20261105-v860') && !srv.includes('20261105-v861'), 'cero BUILD viejo en server.js (ni v854 ni v859 ni v860 ni v861)');
ok(dbjs.includes('supervision_decisiones'), 'marcador v854 intacto: supervision_decisiones en db.js');
ok(supMod.includes('entrevistaEnCurso'), 'marcador v854 intacto: entrevistaEnCurso en supervision-chat.js');
ok(srv.includes('estrategia_semana'), 'marcador v852 intacto: estrategia_semana en server.js');

// ---- Parte 1: el gate (módulo puro, sin IA ni servidor) ----
console.log('— Parte 1: el gate — el caso 583 se rechaza, el bueno se acepta');
const PASS = { texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, brand_ok: true, anatomia_ok: true, headline_clear: true, headline_complete: true, headline_empty_space_ok: true, detalle: 'todo bien, robot en café' };
// El 583: todo bien SALVO que el titular está abajo, sobre el torso del robot.
const CASO_583 = { ...PASS, headline_empty_space_ok: false, detalle: 'titular abajo sobre el torso del robot' };
ok(qaGate.qaGatePassed(CASO_583) === false, 'caso 583 (titular fuera del hueco vacío, sobre el sujeto) → RECHAZADO');
ok(qaGate.qaGatePassed(PASS) === true, 'caso bueno (titular en el hueco vacío, sin tapar) → ACEPTADO');
ok(qaGate.qaGatePassed({ ...PASS, headline_empty_space_ok: false }) === false, 'headline_empty_space_ok false SOLO → NO pasa (decide, a diferencia de headline_complete)');
ok(qaGate.qaGatePassed({ ...PASS, headline_complete: false }) === true, 'headline_complete false SOLO → pasa (es solo-auditoría, no decide)');
{ const sinCampo = { ...PASS }; delete sinCampo.headline_empty_space_ok;
  ok(qaGate.qaGatePassed(sinCampo) === true, 'campo ausente → pasa (backward compat !== false)'); }
ok(qaGate.qaGateFailedChecks(CASO_583).includes('headline_empty_space_ok'), 'failedChecks incluye headline_empty_space_ok');
ok(qaGate.qaGateFixesFor(CASO_583).join(' ').toLowerCase().includes('empty space'), 'la corrección nombra el hueco vacío (empty space)');
ok(qaGate.qaGateCorrectionPrompt('BASE', CASO_583).includes('empty space'), 'el prompt correctivo lleva la línea del hueco vacío');
ok(qaGate.qaGateCorrectionPrompt('BASE', CASO_583).includes('titular abajo sobre el torso del robot'), 'el detalle del 583 viaja en la corrección');

// Harness: evaluate responde según una lista; generate/save/composite/
// retain registran llamadas. Nada de red, nada de IA (espejo de
// test-qa-regenera.js).
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
  { // El 583 → regenera con la corrección → pasa.
    const h = harness([CASO_583, PASS]);
    const r = await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h });
    ok(r.outcome === 'delivered' && r.attempts === 2 && r.path === '/media/gen1.jpg', 'el 583 → regenera → delivered en 2 intentos con el path nuevo');
    ok(h.calls.generate.length === 1 && h.calls.generate[0].includes('empty space'), 'la corrección del 583 nombra el hueco vacío');
    ok(r.firstQa === CASO_583, 'firstQa es el 583 (la fila qa_audit guarda la primera evaluación)');
  }

  { // Titular abajo siempre → bandeja tras el tope, nunca entrega.
    const h = harness([CASO_583]);
    const r = await qaGate.runQaGate({ basePrompt: 'BASE', initialAbs: '/media/orig.jpg', initialPub: '/media/orig.jpg', maxAttempts: 3, ...h });
    ok(r.outcome === 'bandeja' && r.attempts === 3, 'titular fuera del hueco vacío siempre → bandeja tras EXACTAMENTE 3 intentos (tope)');
    ok(r.failedChecks.includes('headline_empty_space_ok'), 'failedChecks de bandeja incluye headline_empty_space_ok');
    ok(h.calls.evaluate === 3 && h.calls.generate.length === 2, '3 evaluaciones y 2 regeneraciones (no hay 4ª generación)');
  }

  // ---- Parte 2: estáticas del QA en server.js ----
  console.log('— Parte 2: el QA en server.js (prompt + parse + log)');
  ok(srv.includes('"headline_empty_space_ok":true') && !srv.includes('headline_top_ok'), 'el ejemplo JSON del prompt trae "headline_empty_space_ok":true (y no queda headline_top_ok)');
  ok(srv.includes('headline_empty_space_ok (v862, HUECO VACÍO'), 'el prompt define headline_empty_space_ok (v862, HUECO VACÍO)');
  ok(srv.includes('HUECO VACÍO') && srv.includes('NO tapa al sujeto'), 'la definición exige el hueco vacío y prohíbe tapar al sujeto');
  ok(srv.includes('headline_empty_space_ok: parsed.headline_empty_space_ok !== false'), 'el parse trae headline_empty_space_ok con !== false');
  ok(srv.includes('headline_empty_space_ok: fq.headline_empty_space_ok'), 'el log del gate registra headline_empty_space_ok');

  // ---- Parte 3: estáticas de la regla de colocación ----
  console.log('— Parte 3: la regla de colocación (generador, Gap 6, demo, compositor)');
  ok((gen.match(/HUECO VACÍO/g) || []).length === 2 && !gen.includes('banda de ARRIBA'), 'CALIDAD-55 y CALIDAD-61: titular solo en el HUECO VACÍO (×2, sin "banda de ARRIBA")');
  ok(!gen.includes('arriba o de abajo'), 'generator.js: no queda "arriba o de abajo"');
  const gap6 = srv.slice(srv.indexOf('ZONA MEDIDA'), srv.indexOf('QA GATE SÍNCRONO'));
  ok(gap6.length > 100, 'región Gap 6 localizada (ZONA MEDIDA → QA GATE SÍNCRONO)');
  ok(gap6.length > 100 && !gap6.includes("'--zone', 'bottom'"), 'Gap 6: ya no recompone abajo');
  ok(gap6.length > 100 && gap6.includes('RETIRADO'), 'Gap 6: la pieza sale limpia (titular RETIRADO)');
  ok(gap6.length > 100 && gap6.includes("cleanHeadline = ''"), 'Gap 6: cleanHeadline se vacía');
  const demo = srv.slice(srv.indexOf('(v209, v862 HUECO VACÍO) DOSIFICACIÓN también en la'), srv.indexOf("pieceQa[i] = { ...qaInfo, text: textInfo }"));
  ok(demo.length > 100, 'región demo localizada (DOSIFICACIÓN → pieceQa textInfo)');
  ok(demo.length > 100 && !demo.includes("zone: 'bottom'"), 'demo: sin recomposición abajo');
  ok(demo.length > 100 && demo.includes("headline: ''"), 'demo: composite limpio (headline vacío)');
  ok(demo.length > 100 && demo.includes("zone: 'none'"), 'demo: textInfo zone none');
  const py = fs.readFileSync(path.join(TREE, 'composite-headline.py'), 'utf8');
  ok(py.includes("default='top'"), 'composite-headline.py: default --zone top');
  ok(!srv.includes("'--zone', 'bottom'"), 'server.js: ningún camino automático usa --zone bottom');
  ok(srv.includes('normalizeOverlayZone') && srv.includes("cArgs.push('--zone', zone)"), 'chat-edit: el override explícito del usuario sigue existiendo (no se borró en silencio)');

  // ---- Parte 4: boot aislado ----
  console.log('— Parte 4: boot aislado (puerto 34666)');
  const PORT = 34666;
  const ADMIN_TOKEN = 'boot-test-token-v862';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-titular-v862-'));
  const BASE = `http://127.0.0.1:${PORT}`;
  let srvProc = null;
  async function waitBoot(tries = 60) {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  async function waitPortFree(tries = 40) {
    for (let i = 0; i < tries; i++) {
      try { await fetch(`${BASE}/api/version`); } catch (e) { return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  function boot(extraEnv) {
    return new Promise((resolve) => {
      srvProc = spawn('node', ['server.js'], {
        cwd: TREE, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN, SUPERVISION_HOOK_URL: '', ...extraEnv },
      });
      let out = '';
      srvProc.stdout.on('data', (d) => { out += String(d); });
      srvProc.stderr.on('data', (d) => { out += String(d); });
      setTimeout(() => resolve(out), 500);
    });
  }
  function killBoot() {
    return new Promise((res) => {
      if (!srvProc) return res();
      const p = srvProc; srvProc = null;
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      p.once('exit', finish);
      p.kill('SIGTERM');
      setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} setTimeout(finish, 800); }, 3000);
    }).then(async () => {
      for (let i = 0; i < 40; i++) {
        try { await fetch(`${BASE}/api/version`); } catch (e) { return; }
        await new Promise((r) => setTimeout(r, 500));
      }
      console.log('  (aviso: el puerto 34666 siguió ocupado 20 s tras matar el boot)');
    });
  }
  try {
    ok(await waitPortFree(), 'puerto 34666 libre antes del boot');
    const bootLog = await boot({});
    const booted = await waitBoot();
    ok(booted, 'server booteó (/api/version v862)');
    if (!booted) console.log('  (log del boot):\n' + bootLog.slice(-2000));
    const v = await fetch(`${BASE}/api/version`).then((r) => r.json()).catch(() => null);
    ok(v && v.build === '20261105-v862', '/api/version es v862');
    const qa = await fetch(`${BASE}/api/qa-audit`).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) })).catch(() => null);
    ok(qa && qa.status === 200 && qa.data && qa.data.ok === true, 'GET /api/qa-audit 200 con {ok:true}');
    await killBoot();
    ok(await waitPortFree(), 'puerto 34666 libre tras matar el boot');
  } catch (e) {
    ok(false, 'boot: ' + (e && e.message));
    await killBoot();
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\n${total - fails}/${total} OK`);
  if (fails) { console.error(`${fails} FALLA(S)`); process.exitCode = 1; }
})().catch((e) => { console.error('ERROR DEL TEST:', e); process.exitCode = 1; });
