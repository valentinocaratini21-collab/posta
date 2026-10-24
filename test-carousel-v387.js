'use strict';
/* v387 — MODO CARRUSEL aceptado (ítem 7 de la ronda «Arma todo!»):
   2/semana en el plan base · total 5 por defecto (clamp 3–6) · portada =
   única imagen IA · placas de material real o renders · selección por
   estrategia (estrella → oferta) · tope semanal en el endpoint manual. */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const C = require('./carousel.js');
const plans = require('./config/plans.js');

/* ---------- constantes y split ---------- */
ok(C.CAROUSEL_SLIDES === 4, 'CAROUSEL_SLIDES = 4 (total por defecto 5)');
ok(C.CAROUSEL_MAX === 6, 'CAROUSEL_MAX = 6 (total)');
ok(C.CAROUSEL_MIN === 3, 'CAROUSEL_MIN = 3 (total)');

/* ---------- cupo en planes ---------- */
// Un "plan" = objeto con price y postsPerWeek, en cualquier nivel del catálogo.
let planObjs = [];
(function walk(o, depth) {
  if (!o || typeof o !== 'object' || depth > 4) return;
  if (typeof o.price === 'number' && typeof o.postsPerWeek === 'number') { planObjs.push(o); return; }
  for (const v of Object.values(o)) walk(v, depth + 1);
})(plans);
ok(planObjs.length >= 9, 'catálogo de planes legible (' + planObjs.length + ')');
ok(planObjs.every((p) => p.carouselsPerWeek === 2), 'TODOS los planes con carouselsPerWeek = 2');

/* ---------- server: selección, inversión, topes ---------- */
ok(!serverJs.includes('carouselClaimed'), 'sin claim booleano de 1/semana');
ok(serverJs.includes('carouselSet') && serverJs.includes('carouselReason'), 'selección precomputada por estrategia');
ok(serverJs.includes("ang === 'estrella'"), 'prioridad 1: la pieza estrella');
ok(serverJs.includes("intent === 'venta'"), 'prioridad 2: la oferta (intent venta)');
ok(serverJs.includes('carruseles de esta semana'), 'endpoint manual con tope semanal del plan');
const gi = serverJs.indexOf('async function generateCarouselSet');
const gj = serverJs.indexOf('app.post(\'/api/diag/run-sweep\'', gi);
const gen = serverJs.slice(gi, gj > gi ? gj : gi + 9000);
ok((gen.match(/conceptShotGenerateQueued/g) || []).length === 1, 'generateCarouselSet: UNA sola generación IA (la portada)');
ok(gen.includes('albumRefsForPiece'), 'generateCarouselSet: material real del cliente (álbum)');
ok(gen.includes('CAROUSEL_MIN'), 'generateCarouselSet: mínimo de 3 enforced');
ok(gen.includes('aiImages: 1'), 'generateCarouselSet: costo declarado de 1 imagen');
ok(!gen.includes('refs: []'), 'generateCarouselSet: sin placas IA sin referencias (diseño viejo)');

/* ---------- split con stub: 4 y 2 placas ---------- */
(async () => {
  const realFetch = global.fetch;
  const stub = (slides) => async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ cover: 'Gancho de prueba', slides }) } }] }),
  });
  global.fetch = stub([1, 2, 3, 4].map((i) => ({ title: 'Punto ' + i, text: 'Texto ' + i })));
  const sp4 = await C.splitCarouselSlides({ titulo: 'T', porque: 'x', caption: 'y' }, 'k');
  ok(sp4 && sp4.slides.length === 4, 'split: 4 placas cuando el modelo da 4');
  global.fetch = stub([1, 2].map((i) => ({ title: 'Punto ' + i, text: 'Texto ' + i })));
  const sp2 = await C.splitCarouselSlides({ titulo: 'T', porque: 'x', caption: 'y' }, 'k');
  ok(sp2 && sp2.slides.length === 2, 'split: acepta 2 placas (total 3 = mínimo)');
  global.fetch = realFetch;
  console.log(`test-carousel-v387: ${okN} ok / ${failN} fallas`);
  process.exit(failN ? 1 : 0);
})();
