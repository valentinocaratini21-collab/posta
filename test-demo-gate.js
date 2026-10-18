// test-demo-gate.js — v196: GATE DURO foto↔tema universal + póster de marca.
//
// El caso que lo originó (2026-10-17, veredicto de Valentino "Está todo mal
// esto"): el diseño extra "Sorteamos una auditoría completa" de la semana
// de @posty.hacetodo salió sobre una foto de playa con sombrero — los
// rubros fuera de belleza/makeup/barbería no pasaban por NINGÚN matching
// foto↔tema. Y la semana de un servicio salía como fotos stock corporativas
// genéricas en vez de piezas de marca.
//
// Este test garantiza:
//  1) lifestyle-2 (playa) JAMÁS acompaña un tema de contenido/auditoría —
//     ni forzándola como única candidata (pickPhotoGated devuelve null).
//  2) Invariante universal: en TODAS las categorías, toda foto de stock de
//     la semana pasa el gate para su (rubro, subrubro, tema).
//  3) Modo póster: servicios/contenido arman 3 pósters + 2 fotos con match;
//     el resto de los rubros no conoce pósters.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-gate-'));

const demo = require('./demo');
const captions = require('./demo-captions');

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error('  ✗', msg); }
}
const famOf = (p) => (typeof p === 'string' ? path.basename(p).replace(/\.webp$/, '') : null);

// ---------- 1) El caso real: sorteo + auditoría ≠ playa ----------
console.log('— gate: el sorteo de auditoría nunca sale en la playa');
{
  const sorteo = captions.DEMO_TOPICS.contenido.find((t) => /sorteamos/i.test(t.headline));
  ok(!!sorteo, 'existe el tema sorteo en contenido');
  const ctx = demo.photoGateCtx({ category: 'profesionales', subcat: 'contenido', topic: sorteo, isCafe: false });
  ok(demo.photoPassesGate('lifestyle-2', ctx) === false, 'lifestyle-2 (playa) pasa el gate de contenido (!!)');
  ok(demo.photoPassesGate('office-1', ctx) === true, 'office-1 debería pasar el gate de contenido');
  // Ni siquiera como única candidata: no se fuerza, devuelve null.
  ok(demo.pickPhotoGated(sorteo, ['lifestyle-2'], new Set(), ctx) === null,
    'pickPhotoGated forzó la foto de playa como única candidata');
  ok(demo.topicPhotoMatchable(sorteo, ['lifestyle-2'], ctx) === false,
    'topicPhotoMatchable aceptó la playa para el sorteo');
  // Y con el pool real, el sorteo recibe una foto de oficina/equipo.
  const pool = demo.CATEGORY_PHOTOS.profesionales;
  const pick = demo.pickPhotoGated(sorteo, pool, new Set(), ctx);
  ok(!!pick && demo.photoPassesGate(pick, ctx), `el sorteo quedó con ${pick}, que no pasa su gate`);
}

// ---------- 2) Invariante universal en todas las categorías ----------
console.log('— gate universal: toda foto de la semana pasa su gate (25 rubros ×40)');
for (const cat of demo.CATEGORIES) {
  for (let r = 0; r < 40; r++) {
    const spec = demo.buildDemoSpec({
      business: 'Negocio Test', category: cat, country: 'AR', tone: 'vos', goal: '', count: 5,
      profilePicPath: '/tmp/pic-test.jpg',
    });
    ok(spec.specPosts.length === 5, `${cat}: ${spec.specPosts.length} posteos (esperaba 5)`);
    const seen = new Set();
    spec.specPosts.forEach((p, i) => {
      const fam = famOf(p.photo);
      if (p.poster) {
        ok(p.treatment && p.treatment.skeleton === 'poster', `${cat}: póster sin skeleton poster`);
        return;
      }
      if (!fam) { ok(false, `${cat}: posteo ${i} sin foto ni póster`); return; }
      ok(!seen.has(fam), `${cat}: foto repetida ${fam}`);
      seen.add(fam);
      const ctx = demo.photoGateCtx({ category: cat, subcat: spec.subcat, topic: spec.topics[i], isCafe: false });
      ok(demo.photoPassesGate(fam, ctx),
        `${cat}: foto ${fam} (temas ${demo.PHOTO_TAGS[fam] && demo.PHOTO_TAGS[fam].temas}) no pasa el gate en "${p.headline}"`);
    });
  }
}

// ---------- 3) La semana de Posty: pósters de marca + el extra sin playa ----------
console.log('— póster de marca: la semana de un servicio de contenido');
{
  for (let r = 0; r < 40; r++) {
    const spec = demo.buildDemoSpec({
      business: 'Posta. | Contenido para tu negocio', category: 'profesionales',
      country: 'AR', tone: 'vos', goal: 'Community manager para negocios: contenido que vende',
      count: 5, profilePicPath: '/tmp/pic-test.jpg',
    });
    ok(spec.subcat === 'contenido', `posty: subcat=${spec.subcat}`);
    const posters = spec.specPosts.filter((p) => p.poster);
    const fotos = spec.specPosts.filter((p) => !p.poster);
    ok(posters.length === 3, `posty: ${posters.length} pósters (esperaba 3)`);
    ok(fotos.length === 2, `posty: ${fotos.length} posteos con foto (esperaba 2)`);
    for (const p of posters) ok(p.photo === '/tmp/pic-test.jpg', 'posty: póster sin la foto de perfil como medallón');
    for (const p of fotos) ok(famOf(p.photo) !== 'lifestyle-2', 'posty: foto de playa en la semana');
    // El extra (tema 6, el sorteo) vía la misma vía que usa el servidor:
    const extra = demo.buildDemoSpec({
      business: 'Posta. | Contenido para tu negocio', category: 'profesionales',
      country: 'AR', tone: 'vos', goal: 'Community manager para negocios: contenido que vende',
      count: 1, topicOffset: 5, profilePicPath: '/tmp/pic-test.jpg',
      excludePhotos: spec.specPosts.map((p) => p.photo).filter((x) => typeof x === 'string'),
    });
    if (extra.specPosts.length) {
      const ep = extra.specPosts[0];
      ok(!ep.poster, 'posty: el extra del sorteo salió como póster');
      ok(famOf(ep.photo) !== 'lifestyle-2', `posty: EL EXTRA salió con la foto de playa (${famOf(ep.photo)})`);
      const ctx = demo.photoGateCtx({ category: 'profesionales', subcat: 'contenido', topic: extra.topics[0], isCafe: false });
      ok(demo.photoPassesGate(famOf(ep.photo), ctx), `posty: el extra (${famOf(ep.photo)}) no pasa el gate`);
    }
  }
  // Sin foto de perfil: póster tipográfico (photo null), misma composición.
  const sinPic = demo.buildDemoSpec({
    business: 'Estudio Jurídico Andina', category: 'profesionales',
    country: 'AR', tone: 'vos', goal: '', count: 5,
  });
  ok(sinPic.specPosts.filter((p) => p.poster).length === 3, 'profesionales sin pic: composición de pósters');
  ok(sinPic.specPosts.every((p) => !p.poster || p.photo === null), 'profesionales sin pic: póster con foto inesperada');
  // Un rubro de producto NO conoce pósters.
  const gastro = demo.buildDemoSpec({
    business: 'Restaurante Don Pepe', category: 'gastronomia', country: 'AR', tone: 'vos', goal: '', count: 5,
    profilePicPath: '/tmp/pic-test.jpg',
  });
  ok(gastro.specPosts.every((p) => !p.poster), 'gastronomía: apareció un póster');
}

// ---------- 4) El mundo manda: la playa SÍ vale donde es del rubro ----------
console.log('— gate: la playa sigue viva en turismo');
{
  const ctx = demo.photoGateCtx({ category: 'turismo', subcat: null, topic: null, isCafe: false });
  ok(demo.photoPassesGate('lifestyle-2', ctx) === true, 'lifestyle-2 debería pasar en turismo');
  const ctxOtro = demo.photoGateCtx({ category: 'otro', subcat: null, topic: null, isCafe: false });
  ok(demo.photoPassesGate('lifestyle-2', ctxOtro) === false, 'lifestyle-2 no debería pasar en "otro"');
  const ctxSalud = demo.photoGateCtx({ category: 'salud', subcat: null, topic: null, isCafe: false });
  ok(demo.photoPassesGate('beauty', ctxSalud) === false, 'la foto de barbería no debería pasar en salud');
  ok(demo.photoPassesGate('office-3', ctxSalud) === true, 'el consultorio dental debería pasar en salud');
}

console.log(fails ? `\n✗ ${fails} FALLAS` : '\n✓ TODO OK');
process.exit(fails ? 1 : 0);
