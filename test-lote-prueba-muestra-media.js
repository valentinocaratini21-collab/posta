'use strict';
/* ════════════════════════════════════════════════════════════════════
 * LOTE PRUEBA-MUESTRA-MEDIA — suite propia (2026-11-23)
 * Orden del dueño (23/11 00:31–00:38, chat principal, con captura de la
 * sección viva): la muestra de /prueba cambia de negocio (sale Big Top
 * Candy Shop, entra De Otro Tiempo) y de paso sale el defecto de fondo.
 *
 * CAUSA RAÍZ DEL ÓVALO (medida en Chromium sobre la base prístina):
 * la regla del avatar «.hero img{width:96px;height:96px;border-radius:50%}»
 * se filtraba a TODAS las imágenes del hero — y la muestra .ej vive dentro
 * del hero. Las fotos del Día 1 y del carrusel del Día 2 recibían
 * height:96px + border-radius:50% (su width:100% y su aspect-ratio 4/5
 * perdían contra el height fijo): óvalos de 202×96 sobre tarjetas de
 * 204×255. El video del Día 3 no es <img>: no le pegaba la regla y se
 * veía bien — esa era la vara. El arreglo: la regla pasa a «.hero>img»
 * (el avatar es hijo directo; dentro del hero no hay ninguna otra imagen
 * que dependiera de la regla: la espera y la preview viven en el form).
 *
 * EL CAMBIO DE NEGOCIO: las tres piezas pasan a ser las de la prueba
 * real de De Otro Tiempo (@deotrotiempo): Día 1 su imagen 4:5, Día 2 su
 * carrusel de 5 (4:5), Día 3 su videazo 9:16 + póster derivado de un
 * frame del mismo video recortado al 4:5 que la caja le aplica. El
 * título conserva su forma y cambia solo el nombre del negocio.
 *
 * Uso: node test-lote-prueba-muestra-media.js <ROOT> <PUERTO> <antes|despues>
 *  - despues: todo pasa.  - antes (control prístino): el óvalo se
 *    reproduce (radio 50%, alto 96) y la muestra es la de Big Top.
 * ════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const ROOT = process.argv[2], PORT = Number(process.argv[3] || 35171), TAG = process.argv[4] || 'despues';
const DESPUES = TAG === 'despues';
const QA = path.join(os.homedir(), 'workspace/.lote-prueba-muestra-media/qa');
fs.mkdirSync(QA, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pmm-data-'));
const MEDIA = fs.mkdtempSync(path.join(os.tmpdir(), 'pmm-media-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const check = (nombre, cond, detalle) => { if (cond) { ok++; console.log('  ok  ', nombre); } else { mal++; console.log('  MAL ', nombre, detalle ? '— ' + detalle : ''); } };
const BASE = `http://127.0.0.1:${PORT}`;

const NEG = DESPUES ? 'deotrotiempo' : 'bigtop';
const TITULO_ES = DESPUES ? 'La prueba real de De Otro Tiempo' : 'La prueba real de Big Top Candy Shop';
const TITULO_EN = DESPUES ? "De Otro Tiempo's real trial" : "Big Top Candy Shop's real trial";
const ASSETS = [
  `puerta-ej-${NEG}-dia1.jpg`, `puerta-ej-${NEG}-dia2-1.jpg`, `puerta-ej-${NEG}-dia2-2.jpg`,
  `puerta-ej-${NEG}-dia2-3.jpg`, `puerta-ej-${NEG}-dia2-4.jpg`, `puerta-ej-${NEG}-dia2-5.jpg`,
  `puerta-ej-${NEG}-dia3-poster.jpg`, `puerta-ej-${NEG}-dia3.mp4`,
];

async function main() {
  // ---------- boot del servidor real ----------
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, MEDIA_DIR: MEDIA, ADMIN_TOKEN: 'tok-suite' }, stdio: 'ignore' });
  let up = false;
  const t0 = Date.now();
  while (!up && Date.now() - t0 < 90000) {
    try { const r = await fetch(`${BASE}/api/version`); up = r.ok; } catch (e) { await sleep(400); }
  }
  check('boot del servidor real (' + TAG + ')', up);
  if (!up) { try { process.kill(srv.pid, 'SIGKILL'); } catch (e) {} process.exit(2); }

  try {
    // ---------- HTTP: páginas y assets ----------
    const htmlEs = await (await fetch(`${BASE}/prueba`)).text();
    const htmlEn = await (await fetch(`${BASE}/en/prueba`)).text();
    check('ES: el título nombra al negocio de la muestra', htmlEs.includes(TITULO_ES));
    check('EN: el título nombra al negocio de la muestra', htmlEn.includes(TITULO_EN));
    const AJENO = DESPUES ? 'bigtop' : 'deotrotiempo';
    for (const [nom, html] of [['ES', htmlEs], ['EN', htmlEn]]) {
      const refs = ASSETS.filter(a => html.includes('/' + a));
      check(`${nom}: las 8 piezas referenciadas`, refs.length === 8, 'faltan: ' + ASSETS.filter(a => !refs.includes(a)).join(','));
      check(`${nom}: ningún asset del otro negocio`, !html.includes('puerta-ej-' + AJENO));
    }
    if (DESPUES) {
      check('ES: cero referencias a Big Top (ni en comentarios)', !htmlEs.includes('bigtop') && !htmlEs.includes('Big Top'));
      check('EN: cero referencias a Big Top (ni en comentarios)', !htmlEn.includes('bigtop') && !htmlEn.includes('Big Top'));
      check('ES: la regla del avatar es de hijo directo (.hero>img)', htmlEs.includes('.hero>img{') && !htmlEs.includes('.hero img{'));
      check('EN: la regla del avatar es de hijo directo (.hero>img)', htmlEn.includes('.hero>img{') && !htmlEn.includes('.hero img{'));
    } else {
      check('control: la regla amplia .hero img sigue presente', htmlEs.includes('.hero img{'));
    }
    for (const a of ASSETS) {
      const r = await fetch(`${BASE}/${a}`);
      const ct = r.headers.get('content-type') || '';
      check(`asset servido: ${a}`, r.status === 200 && (ct.includes('image') || ct.includes('video')), `status ${r.status} ct ${ct}`);
    }

    // ---------- Chromium: geometría real de la muestra ----------
    const { chromium } = require(path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core'));
    const browser = await chromium.launch();
    for (const [ruta, nombre] of [['/prueba', 'ES'], ['/en/prueba', 'EN']]) {
      for (const ancho of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width: ancho, height: 900 } });
        await page.goto(BASE + ruta, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(1800);
        const m = await page.evaluate(() => {
          const cards = [...document.querySelectorAll('.ej-card')].map(c => {
            const cr = c.getBoundingClientRect();
            const media = c.querySelector('img.ph, video, .ej-car img');
            const mr = media.getBoundingClientRect();
            const cs = getComputedStyle(media);
            return { cardW: cr.width, cardH: cr.height, medW: mr.width, medH: mr.height, radio: cs.borderRadius, fit: cs.objectFit, tag: media.tagName };
          });
          const av = document.querySelector('.hero>img');
          const avr = av ? av.getBoundingClientRect() : null;
          const avcs = av ? getComputedStyle(av) : null;
          return { cards, avatar: avr ? { w: avr.width, h: avr.height, radio: avcs.borderRadius } : null };
        });
        check(`${nombre} ${ancho}px: hay 3 tarjetas`, m.cards.length === 3, JSON.stringify(m.cards.map(c => c.tag)));
        m.cards.forEach((c, i) => {
          const llena = c.medW >= c.cardW - 3 && c.medH >= c.cardH - 3;
          if (DESPUES) {
            check(`${nombre} ${ancho}px · tarjeta ${i + 1}: el medio LLENA la tarjeta`, llena, `medio ${c.medW}×${c.medH} vs tarjeta ${c.cardW}×${c.cardH}`);
            check(`${nombre} ${ancho}px · tarjeta ${i + 1}: sin óvalo (radio 0) y object-fit cover`, c.radio === '0px' && c.fit === 'cover', `radio ${c.radio} fit ${c.fit}`);
          } else if (i < 2) {
            check(`${nombre} ${ancho}px · tarjeta ${i + 1}: DEFECTO reproducido (óvalo 50%, alto 96)`, c.radio === '50%' && Math.round(c.medH) === 96 && !llena, `radio ${c.radio} medio ${c.medW}×${c.medH}`);
          } else {
            check(`${nombre} ${ancho}px · tarjeta ${i + 1}: el video siempre llenó (la vara)`, llena, `medio ${c.medW}×${c.medH} vs tarjeta ${c.cardW}×${c.cardH}`);
          }
        });
        check(`${nombre} ${ancho}px: el avatar del hero intacto (96×96, redondo)`, !!m.avatar && Math.round(m.avatar.w) === 96 && Math.round(m.avatar.h) === 96 && m.avatar.radio === '50%', JSON.stringify(m.avatar));
        // Carrusel: avanzar y ver el contador
        const car = await page.evaluate(() => {
          const el = document.getElementById('ejCar');
          el.scrollBy({ left: el.clientWidth, behavior: 'instant' });
          return true;
        }).catch(() => false);
        await page.waitForTimeout(700);
        const cuenta = await page.evaluate(() => (document.getElementById('ejCount') || {}).textContent);
        const scrollL = await page.evaluate(() => document.getElementById('ejCar').scrollLeft);
        check(`${nombre} ${ancho}px: el carrusel avanza y el contador marca 2 / 5`, car && String(cuenta).trim() === '2 / 5' && scrollL > 0, `contador ${cuenta} scrollLeft ${scrollL}`);
        // Video: póster correcto y metadata cargada
        const vid = await page.evaluate((neg) => {
          const v = document.querySelector('.ej-card video');
          return { poster: v.poster.split('/').pop(), esperado: `puerta-ej-${neg}-dia3-poster.jpg`, rs: v.readyState, vw: v.videoWidth };
        }, NEG);
        check(`${nombre} ${ancho}px: el video trae su póster y carga`, vid.poster === vid.esperado && (vid.rs >= 1 || vid.vw > 0), JSON.stringify(vid));
        const ej = await page.$('.ej');
        if (ej) await ej.screenshot({ path: path.join(QA, `${TAG}-${nombre}-${ancho}.png`) });
        await page.close();
      }
    }
    await browser.close();
  } finally {
    try { process.kill(srv.pid, 'SIGTERM'); } catch (e) {}
    await sleep(1200);
    let vivo = true;
    try { process.kill(srv.pid, 0); } catch (e) { vivo = false; }
    if (vivo) { try { process.kill(srv.pid, 'SIGKILL'); } catch (e) {} console.log('  (el servidor quedó vivo tras SIGTERM: SIGKILL por PID exacto)'); }
    else console.log('  (servidor muerto por SIGTERM, pid ' + srv.pid + ')');
  }
  console.log(`\n== PRUEBA-MUESTRA-MEDIA (${TAG}): ${ok} ok · ${mal} MAL`);
  process.exit(mal ? 1 : 0);
}

main().catch(e => { console.error('FALLO LA SUITE', e); process.exit(2); });
