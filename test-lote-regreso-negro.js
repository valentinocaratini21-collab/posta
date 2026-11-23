// test-lote-regreso-negro.js — Suite del lote REGRESO-NEGRO
// (2026-11-22): «cuando salgo de Posty sin cerrar la app y quiero
// volver, la pantalla me aparece toda negra o se traba» (dueño, PWA
// en su iPhone).
//   A · Estática: el modo espera del boot existe y está cableado
//       (CSS, vigilante, magia que respeta la pintura, señal
//       __pzAppPainted en bootSplashOff) y el timer ciego de 6 s que
//       retiraba el boot sobre la landing ya no existe.
//   B · Boot real, red sana: la apertura de siempre no cambia (la
//       magia suena y se retira con la app pintada), la recarga con
//       sesión preservada pinta la app, y los ciclos de
//       visibilidad ×10 (el regreso SIN recarga) dejan la app
//       visible, respondiendo y sin duplicar timers.
//   C · Boot real con la API demorada 2,5 s por pedido (el regreso
//       por descarte del webview con la red fría del teléfono): en
//       las dos variantes — sesión preservada y sesión fresca — el
//       boot NUNCA abandona al dueño: ni degradé mudo, ni landing
//       pública con el dueño logueado; espera con el estándar de
//       carga (rayo + «Cargando…») hasta que la app pinta, y si a
//       los 30 s la app sigue sin pintar, ofrece la salida
//       («Está tardando… tocá para reintentar»).
//   D · La web pública no cambia: sin contexto app, la landing
//       pinta y el boot se retira como siempre.
// El control prístino (HEAD v1243) falla exactamente C1, C2 y C3:
// a los 3 s el degradé está mudo (sin .pz-boot-wait, texto oculto),
// a los 6 s el timer ciego lo retira sobre la landing, y en sesión
// fresca la magia se retira a los 1,6 s dejando la landing expuesta
// hasta que la app pinta (~11 s con la API a 2,5 s).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let chromium = null;
for (const cand of ['playwright', 'playwright-core',
  '/home/hatch/workspace/posty-stores/tools/node_modules/playwright-core']) {
  try { chromium = require(cand).chromium; if (chromium) break; } catch (e) {}
}

// ---------------------------------------------------------------- A
console.log('\nA · Estática');
{
  const idx = read('public/index.html');
  const app = read('public/app.js');
  ok('A1 el CSS del modo espera existe (degradé + rayo + línea visibles, tapa toques)',
    idx.includes('#posty-boot.pz-boot-wait') && idx.includes('pz-boot-wait .pz-boot-txt') && idx.includes('pointer-events:auto'));
  ok('A2 el timer ciego de 6 s que retiraba el boot ya no existe',
    !idx.includes("var kill = setTimeout(function () { var b = document.getElementById('posty-boot'); if (b) b.remove(); }, 6000);"));
  ok('A3 sin magia (sesión preservada) el boot entra en modo espera, no queda mudo',
    idx.includes("pz_splash_played') === '1') { waitMode(); return; }"));
  ok('A4 la magia solo se retira si la app ya pintó; si no, pasa a espera',
    idx.includes('if (sp.appReady || window.__pzAppPainted) sp.finish(300);') && idx.includes('sp.waiting = true; waitMode();'));
  ok('A5 el toque sobre la magia no descubre la landing antes de la pintura',
    idx.includes('if (sp.appReady || window.__pzAppPainted) sp.finish(200);'));
  ok('A6 el vigilante: a los 6 s sin pintura entra la espera (no retira) y a los 30 s la salida',
    idx.includes('if (painted()) return;') && idx.includes('Está tardando… tocá para reintentar') && idx.includes('pz-boot-lento'));
  ok('A7 bootSplashOff marca la pintura de la app (__pzAppPainted) antes de retirar el boot',
    app.includes('window.__pzAppPainted = true;') && app.includes('function bootSplashOff()'));
  ok('A8 la web conserva su retiro histórico a los 6 s (rama sin contexto app)',
    idx.includes("if (!appCtx) { var b0 = document.getElementById('posty-boot'); if (b0) b0.remove(); return; }"));
}

// ------------------------------------------------------------- boot
function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

(async () => {
  if (!chromium) { ok('B0 playwright disponible', false, 'no se resolvió playwright-core'); }
  else {
    const PORT = await freePort();
    const BASE = `http://127.0.0.1:${PORT}`;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-regreso-'));
    const srv = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvErr = '';
    srv.stderr.on('data', (d) => { srvErr += d; });
    const cleanup = () => { try { srv.kill('SIGKILL'); } catch (e) {} };
    process.on('exit', cleanup);
    try {
      let up = false;
      for (let i = 0; i < 60 && !up; i++) {
        try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch (e) {}
        if (!up) await sleep(500);
      }
      ok('B0 el server levanta', up, srvErr.slice(0, 200));
      const browser = await chromium.launch({});
      const mkCtx = () => browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      });
      const state = (page) => page.evaluate(() => {
        const boot = document.getElementById('posty-boot');
        const app = document.getElementById('app');
        const txt = boot ? boot.querySelector('.pz-boot-txt') : null;
        const txtCs = txt ? getComputedStyle(txt) : null;
        const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        let topInBoot = false; let n = top;
        while (n) { if (n.id === 'posty-boot') { topInBoot = true; break; } n = n.parentElement; }
        return {
          boot: !!boot,
          magic: boot ? boot.classList.contains('pz-magic') : false,
          wait: boot ? boot.classList.contains('pz-boot-wait') : false,
          lento: boot ? boot.classList.contains('pz-boot-lento') : false,
          txtVisible: !!(txt && txtCs && txtCs.display !== 'none' && txt.textContent.trim().length > 0),
          txt: txt ? txt.textContent.trim() : '',
          appPainted: !!(app && app.querySelector('.mtop, .pz-shell, .bb-shell, #inicioView, .pz-load')),
          topInBoot,
          paintedFlag: !!window.__pzAppPainted,
        };
      }).catch(() => ({ boot: null }));
      const registerAndEnter = async (page, email) => {
        await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
        await page.evaluate(async (em) => {
          await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password: 'test-password-123' }) });
        }, email);
        await page.goto(BASE + '/#/app/inicio', { waitUntil: 'load', timeout: 45000 });
        await page.waitForFunction(() => typeof ME !== 'undefined' && !!ME, null, { timeout: 30000 });
      };

      // ---------------------------------------------------------- B
      console.log('\nB · Boot real, red sana');
      {
        const ctx = await mkCtx();
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
        await page.addInitScript(() => {
          window.__iv = { live: new Set(), created: 0 };
          const si = window.setInterval, ci = window.clearInterval;
          window.setInterval = function (...a) { const id = si.apply(window, a); window.__iv.live.add(id); window.__iv.created++; return id; };
          window.clearInterval = function (id) { window.__iv.live.delete(id); return ci.call(window, id); };
        });
        await registerAndEnter(page, 'regreso-b@test.local');
        await page.waitForTimeout(600);
        let st = await state(page);
        ok('B1 apertura sana: la app pintó y el boot se retiró', st.appPainted && !st.boot, JSON.stringify(st));
        // Recarga con sesión preservada y red sana: la magia puede
        // sonar (el documento anterior fue la web) y el boot se
        // retira al cumplirla, con la app pintada detrás.
        await page.reload({ waitUntil: 'load', timeout: 45000 });
        await page.waitForFunction(() => typeof ME !== 'undefined' && !!ME, null, { timeout: 30000 });
        let bootGone = false;
        for (let i = 0; i < 14 && !bootGone; i++) {
          await sleep(500);
          bootGone = await page.evaluate(() => !document.getElementById('posty-boot'));
        }
        st = await state(page);
        ok('B2 recarga sana: la app pintó y el boot se retiró sin espera colgada', st.appPainted && bootGone && !st.boot, JSON.stringify(st));
        // Ciclos de visibilidad ×10 (el regreso SIN recarga). La
        // foto de timers se toma con el conteo ya estabilizado (el
        // vivo de Inicio arma sus intervalos al primer render: una
        // foto temprana lo confunde con duplicación).
        const ivStable = async () => {
          let prev = -1;
          for (let i = 0; i < 10; i++) {
            const cur = await page.evaluate(() => window.__iv.live.size);
            if (cur === prev && cur > 0) return cur;
            prev = cur;
            await page.waitForTimeout(700);
          }
          return prev;
        };
        const iv0n = await ivStable();
        const iv0 = { live: iv0n };
        await page.evaluate(async () => {
          const H = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
          const V = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
          const setVis = (hid) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => hid });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hid ? 'hidden' : 'visible') });
            document.dispatchEvent(new Event('visibilitychange'));
          };
          for (let i = 0; i < 10; i++) {
            setVis(true); window.dispatchEvent(new Event('pagehide'));
            await new Promise(r => setTimeout(r, 60));
            setVis(false); window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
            await new Promise(r => setTimeout(r, 60));
          }
          if (H) Object.defineProperty(document, 'hidden', H);
          if (V) Object.defineProperty(document, 'visibilityState', V);
        });
        await page.waitForTimeout(800);
        const raf = await page.evaluate(() => new Promise((res) => {
          const t0 = performance.now();
          requestAnimationFrame(() => res(performance.now() - t0));
          setTimeout(() => res(-1), 3000);
        }));
        const iv1 = await page.evaluate(() => ({ live: window.__iv.live.size, created: window.__iv.created }));
        st = await state(page);
        ok('B3 tras 10 regresos sin recarga: la app responde (rAF < 500 ms) y sigue pintada', raf > 0 && raf < 500 && st.appPainted, 'raf=' + raf);
        ok('B4 los timers no se duplican entre regresos', iv1.live === iv0.live, JSON.stringify({ iv0, iv1 }));
        ok('B5 sin errores JS nuevos en todo el ciclo sano', errs.length === 0, errs.join(' | '));
        await ctx.close();
      }

      // ---------------------------------------------------------- C
      console.log('\nC · El regreso por descarte con la API lenta (2,5 s por pedido)');
      const slowApi = async (page, ms) => {
        await page.route('**/api/**', async (route) => { await sleep(ms); try { await route.continue(); } catch (e) {} });
      };
      {
        const ctx = await mkCtx();
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
        await registerAndEnter(page, 'regreso-c1@test.local');
        await slowApi(page, 2500);
        const t0 = Date.now();
        await page.reload({ waitUntil: 'commit', timeout: 60000 }).catch(() => {});
        await sleep(Math.max(0, 3000 - (Date.now() - t0)));
        let st = await state(page);
        ok('C1 a los 3 s (sesión preservada): el boot espera CON señal visible, no mudo', st.boot && st.wait && st.txtVisible, JSON.stringify(st));
        ok('C1b la landing no queda expuesta: el centro de la pantalla es el boot', st.topInBoot === true, JSON.stringify(st));
        await sleep(Math.max(0, 7500 - (Date.now() - t0)));
        st = await state(page);
        ok('C2 a los 7,5 s: el timer ciego no dejó al dueño en la landing (boot en espera o app pintada)', (st.boot && st.wait) || st.appPainted, JSON.stringify(st));
        await page.waitForFunction(() => {
          const app = document.getElementById('app');
          return !document.getElementById('posty-boot') && !!app && !!app.querySelector('.mtop, .pz-shell, .bb-shell, #inicioView');
        }, null, { timeout: 30000 }).catch(() => {});
        st = await state(page);
        ok('C3 cuando la API responde, la app pinta y el boot se retira', st.appPainted && !st.boot, JSON.stringify(st));
        ok('C4 sin errores JS en el regreso lento (sesión preservada)', errs.length === 0, errs.join(' | '));
        await ctx.close();
      }
      {
        const ctx = await mkCtx();
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
        await registerAndEnter(page, 'regreso-c2@test.local');
        await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
        await slowApi(page, 2500);
        const t0 = Date.now();
        await page.reload({ waitUntil: 'commit', timeout: 60000 }).catch(() => {});
        await sleep(Math.max(0, 2600 - (Date.now() - t0)));
        let st = await state(page);
        ok('C5 sesión fresca: cumplida la magia (1,6 s) sin pintura, el boot NO se retira sobre la landing', st.boot === true && st.topInBoot === true, JSON.stringify(st));
        await sleep(Math.max(0, 5000 - (Date.now() - t0)));
        st = await state(page);
        ok('C6 a los 5 s: el boot espera con su señal visible (rayo + línea)', st.boot && st.wait && st.txtVisible, JSON.stringify(st));
        await page.waitForFunction(() => {
          const app = document.getElementById('app');
          return !document.getElementById('posty-boot') && !!app && !!app.querySelector('.mtop, .pz-shell, .bb-shell, #inicioView');
        }, null, { timeout: 30000 }).catch(() => {});
        st = await state(page);
        ok('C7 la app termina pintando y el boot se retira (sesión fresca)', st.appPainted && !st.boot, JSON.stringify(st));
        ok('C8 sin errores JS en el regreso lento (sesión fresca)', errs.length === 0, errs.join(' | '));
        await ctx.close();
      }
      {
        // La traba tiene salida: API casi muerta (20 s por pedido) —
        // a los 30 s la espera ofrece tocar para reintentar.
        const ctx = await mkCtx();
        const page = await ctx.newPage();
        await registerAndEnter(page, 'regreso-c3@test.local');
        await slowApi(page, 20000);
        const t0 = Date.now();
        await page.reload({ waitUntil: 'commit', timeout: 60000 }).catch(() => {});
        let st = {};
        let lento = false;
        while (Date.now() - t0 < 45000) {
          await sleep(1500);
          st = await state(page);
          if (st.lento && /tardando/i.test(st.txt || '')) { lento = true; break; }
          if (!st.boot) break;
        }
        ok('C9 si la app no pinta en 30 s, la espera ofrece la salida (tocá para reintentar)', lento, JSON.stringify(st));
        await ctx.close();
      }

      // ---------------------------------------------------------- D
      console.log('\nD · La web pública no cambia');
      {
        const ctx = await mkCtx();
        const page = await ctx.newPage();
        await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
        let gone = false;
        for (let i = 0; i < 20 && !gone; i++) {
          await sleep(500);
          gone = await page.evaluate(() => !document.getElementById('posty-boot'));
        }
        const landing = await page.evaluate(() => {
          const app = document.getElementById('app');
          return !!app && app.innerHTML.length > 5000;
        });
        ok('D1 sin contexto app: la landing pinta y el boot se retira como siempre', gone && landing, `gone=${gone} landing=${landing}`);
        await ctx.close();
      }

      await browser.close();
    } finally { cleanup(); }
  }
})().then(() => {
  console.log(`\nTOTAL: ${pass} ok · ${fail} fallas`);
  if (fails.length) { console.log('FALLAS:'); fails.forEach(f => console.log('  -', f)); }
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error('ERROR SUITE:', e); process.exit(1); });
