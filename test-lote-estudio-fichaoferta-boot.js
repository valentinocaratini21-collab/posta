'use strict';
/* test-lote-estudio-fichaoferta-boot.js — M3 ESTUDIO-PROFUNDO: BOOT AISLADO.
 * Levanta el scratch con DATA_DIR aislada en /tmp (nombre único), puerto
 * 18776, express 4.22.3 PIN (nunca 5; las deps viven en
 * /home/hatch/workspace/posta/node_modules vía NODE_PATH — el árbol no trae
 * node_modules) y verifica por HTTP:
 *  - /api/version trae 20261105-v767 (BUILD re-estampado por la baja de la campaña)
 *  - /prueba.html y /en-prueba.html sirven la tarjeta de la ficha
 *  - POST /api/trial/offer-correct guarda correcciones (promo sin fecha
 *    → vigente=false; con fecha → vigente=true; fecha inválida → 400)
 *  - POST /api/trial/generate (modo test, TRIAL_TEST_KEY) genera la
 *    semana con la ficha en el fundamento: con promo vigente corregida
 *    la pieza promo existe Y trae sus términos; sin oferta vigente,
 *    ninguna pieza es promo ni promete urgencia.
 * Uso: node test-lote-estudio-fichaoferta-boot.js
 * (las deps son las de /home/hatch/workspace/posta/node_modules, express@4.22.3;
 *  /tmp/m3-boot-deps ya no existe — lo borró la limpieza de /tmp del 7/11)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const BASE = process.env.BASE || __dirname;
const PORT = 18776;
const URL = `http://127.0.0.1:${PORT}`;
const TEST_KEY = 'm3-boot-key';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'm3-boot-'));
const DEPS = '/home/hatch/workspace/posta/node_modules';

let fails = 0, total = 0;
const ok = (cond, msg, extra) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg, extra ? '(' + extra + ')' : ''); } };

async function waitBoot(tries = 90) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${URL}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
const jpost = async (p, body) => {
  const r = await fetch(URL + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
};
function trialForm(ig, business) {
  const fd = new FormData();
  fd.append('ig', ig);
  fd.append('business', business);
  fd.append('category', 'cafeteria');
  fd.append('country', 'AR');
  fd.append('tone', 'vos');
  fd.append('lang', 'es');
  fd.append('producto_estrella', 'Café de especialidad');
  fd.append('producto_mix', 'uno');
  fd.append('cta', 'reservar');
  fd.append('promo', 'ninguna');
  fd.append('voz', 'cercano');
  fd.append('precios', 'si');
  fd.append('donde', 'local');
  fd.append('audiencia_mix', 'todos');
  fd.append('diferencial_mix', 'nose');
  fd.append('lineas_rojas_mix', 'nada');
  return fd;
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: BASE,
    env: { ...process.env, NODE_PATH: DEPS, DATA_DIR: TMP, PORT: String(PORT), TRIAL_TEST_KEY: TEST_KEY, OPENAI_API_KEY: '', GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'boot: server levanta en 18776');
    const ver = await (await fetch(`${URL}/api/version`)).json();
    ok(ver.build === '20261105-v767', '/api/version 20261105-v767', 'vino ' + ver.build);
    const pr = await (await fetch(`${URL}/prueba.html`)).text();
    ok(pr.includes('offerSheetCard') && pr.includes('renderOfferSheet'), '/prueba.html sirve la tarjeta de la ficha');
    const en = await (await fetch(`${URL}/en-prueba.html`)).text();
    ok(en.includes('offerSheetCard') && en.includes('renderOfferSheet'), '/en-prueba.html sirve la tarjeta de la ficha');

    // Correcciones por HTTP.
    const noId = await jpost('/api/trial/offer-correct', { correccion: { campo: 'promo_nueva', valor: 'X' } });
    ok(noId.status === 400, 'offer-correct sin identidad → 400');
    const igA = 'testig-m3-boot';
    const nueva = await jpost('/api/trial/offer-correct', { ig: igA, correccion: { campo: 'promo_nueva', valor: 'Black Friday 20% OFF' } });
    ok(nueva.status === 200 && nueva.j && nueva.j.ok, 'offer-correct promo_nueva sin fecha → 200', JSON.stringify(nueva.j || {}).slice(0, 120));
    const p0 = (nueva.j && nueva.j.offer_sheet && nueva.j.offer_sheet.promos || [])[0] || {};
    ok(p0.vigente === false && p0.status === 'sin_fecha', 'promo sin fecha guardada como sin_fecha/vigente=false');
    const conFecha = await jpost('/api/trial/offer-correct', { ig: igA, correccion: { campo: 'promo_ends_at', titulo: 'Black Friday 20% OFF', ends_at: '2026-11-30' } });
    ok(conFecha.status === 200 && conFecha.j && conFecha.j.ok, 'offer-correct promo_ends_at → 200');
    const p1 = (conFecha.j && conFecha.j.offer_sheet && conFecha.j.offer_sheet.promos || [])[0] || {};
    ok(p1.ends_at === '2026-11-30' && p1.vigente === true, 'corrección pone fecha: vigente=true', p1.ends_at + '/' + p1.status);
    const corr1 = (conFecha.j && conFecha.j.offer_sheet && conFecha.j.offer_sheet.correcciones_cliente || []);
    ok(corr1.length >= 1 && corr1[corr1.length - 1].origen === 'dueno', 'corrección registrada con origen dueno');
    const mala = await jpost('/api/trial/offer-correct', { ig: igA, correccion: { campo: 'promo_ends_at', titulo: 'Black Friday 20% OFF', ends_at: 'no-una-fecha' } });
    ok(mala.status === 400, 'offer-correct fecha inválida → 400');

    // Generación con la promo vigente corregida: la pieza promo existe
    // y trae sus términos (fecha de fin en el caption).
    const genA = await fetch(`${URL}/api/trial/generate?test_key=${TEST_KEY}`, {
      method: 'POST', body: trialForm(igA, 'Café Luna'), signal: AbortSignal.timeout(300000),
    });
    const outA = await genA.json().catch(() => ({}));
    ok(genA.ok && outA.ok === true, 'generate con promo vigente → 200 + ok', 'status ' + genA.status + ' ' + JSON.stringify(outA.error || '').slice(0, 100));
    ok(outA.digest && outA.digest.offerSheet && outA.digest.offerSheet.v === 1, 'generate: digest lleva fundamento.offerSheet');
    const kindsA = ((outA.design && outA.design.posts) || []).map((p) => p.kind);
    ok(kindsA.includes('promo'), 'generate con fecha: la semana trae pieza promo', kindsA.join(','));
    const capsA = (outA.posts || []).map((p) => p.caption || '').join('\n');
    ok(/30\/11\/2026/.test(capsA), 'generate con fecha: el caption trae sus términos (30/11/2026)');

    // Generación sin oferta vigente: ninguna pieza promo, ninguna urgencia.
    const igB = 'testig-m3-boot-sin';
    const genB = await fetch(`${URL}/api/trial/generate?test_key=${TEST_KEY}`, {
      method: 'POST', body: trialForm(igB, 'Café Nube'), signal: AbortSignal.timeout(300000),
    });
    const outB = await genB.json().catch(() => ({}));
    ok(genB.ok && outB.ok === true, 'generate sin oferta → 200 + ok', 'status ' + genB.status);
    const kindsB = ((outB.design && outB.design.posts) || []).map((p) => p.kind);
    ok(!kindsB.includes('promo'), 'generate sin fecha: cero piezas promo', kindsB.join(','));
    const capsB = (outB.posts || []).map((p) => p.caption || '').join('\n');
    ok(!/tiempo limitado/i.test(capsB), 'generate sin fecha: ningún caption promete urgencia');
  } catch (e) {
    ok(false, 'boot/generate sin excepciones', e.message);
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    if (fails) console.error('\n--- cola del log del server ---\n' + srvLog.slice(-2000));
  }
  console.log(`\n${total - fails} pasaron, ${fails} fallaron.`);
  process.exit(fails ? 1 : 0);
})();
