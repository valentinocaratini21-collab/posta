// test-demo-subcat.js — v199: el mundo de fotos se angosta por SUBRUBRO.
//
// El caso que lo originó (QA visual 2026-10-18 sobre el motor 9/10): la
// semana de una PELUQUERÍA salió con las brochas de makeup (beauty-3) en
// el posteo genérico "Turnos de esta semana", y la semana de un estudio
// de MAKEUP salió con fotos fashion (ropa) en "Agenda abierta" y en el
// "Antes y después: invitada real" — el split ANTES/DESPUÉS sobre una
// foto de cuerpo entero en buzo se lee falso. El gate duro de v196 era
// por CATEGORÍA (belleza): el mundo ancho dejaba pasar los temas fuertes
// del subrubro hermano, y makeup incluía 'moda' en su mundo.
//
// Este test garantiza:
//  1) Peluquería ×40: NINGÚN posteo (ni el genérico) con foto de tema
//     fuerte de otro oficio (makeup, uñas, skincare/cosmética, moda,
//     barbería) y 5 fotos distintas por semana.
//  2) Makeup ×40: NINGUNA foto de la familia fashion en ningún posteo;
//     el antes/despues siempre con foto de rostro/makeup; 5 distintas.
//  3) A nivel gate: beauty-3 no pasa en contexto peluquería ni con tema
//     genérico; fashion/fashion-1 no pasan en contexto makeup ni como
//     única candidata de un tema de makeup.
//  4) trialPhotoOptions (el selector para cambiar una foto a mano en
//     /prueba): pasa por el MISMO gate — peluquería nunca recibe opciones
//     de makeup/uñas/skincare/moda/barbería, makeup nunca fashion; las
//     excluidas (foto actual + usadas en la semana) no se ofrecen; y el
//     selector jamás queda vacío (relaja exclusiones antes que el gate).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-subcat-'));

const demo = require('./demo');
const captions = require('./demo-captions');

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error('  ✗', msg); }
}
const famOf = (p) => (typeof p === 'string' ? path.basename(p).replace(/\.webp$/, '') : null);
const temasOf = (f) => (demo.PHOTO_TAGS[f] ? demo.PHOTO_TAGS[f].temas : []);
const FUERTES_AJENOS_PELU = ['makeup', 'unas', 'skincare', 'cosmetica', 'moda', 'barberia'];

// ---------- 1) Peluquería: cero fotos del subrubro hermano ----------
console.log('— subrubro peluquería ×40: ni el genérico toca makeup');
for (let r = 0; r < 40; r++) {
  const spec = demo.buildDemoSpec({
    business: 'Milagros Peluqueria', category: 'belleza', country: 'AR', tone: 'vos',
    goal: 'turnos', count: 5,
  });
  ok(spec.subcat === null, `peluquería: subcat inesperado ${spec.subcat}`);
  ok(spec.specPosts.length === 5, `peluquería: ${spec.specPosts.length} posteos`);
  const fams = spec.specPosts.map((p) => famOf(p.photo));
  ok(new Set(fams).size === fams.length, `peluquería: fotos repetidas ${fams}`);
  spec.specPosts.forEach((p, i) => {
    const f = fams[i];
    ok(!!f, `peluquería: posteo ${i} sin foto ("${p.headline}")`);
    if (!f) return;
    const t = temasOf(f);
    for (const x of FUERTES_AJENOS_PELU) {
      ok(!t.includes(x), `peluquería: "${p.headline}" con foto ${f} (temas ${t}) — tema ajeno ${x}`);
    }
    const ctx = demo.photoGateCtx({ category: 'belleza', subcat: spec.subcat, topic: spec.topics[i], isCafe: false });
    ok(demo.photoPassesGate(f, ctx), `peluquería: foto ${f} no pasa su propio gate`);
  });
}

// ---------- 2) Makeup: cero fashion; antes/despues = rostro/makeup ----------
console.log('— subrubro makeup ×40: fashion no ilustra makeup ni el antes/despues');
for (let r = 0; r < 40; r++) {
  const spec = demo.buildDemoSpec({
    business: 'Luna Makeup Studio', category: 'belleza', country: 'AR', tone: 'vos',
    goal: 'ventas', count: 5,
  });
  ok(spec.subcat === 'makeup', `makeup: subcat=${spec.subcat}`);
  ok(spec.specPosts.length === 5, `makeup: ${spec.specPosts.length} posteos`);
  const fams = spec.specPosts.map((p) => famOf(p.photo));
  ok(new Set(fams).size === fams.length, `makeup: fotos repetidas ${fams}`);
  spec.specPosts.forEach((p, i) => {
    const f = fams[i];
    ok(!!f, `makeup: posteo ${i} sin foto ("${p.headline}")`);
    if (!f) return;
    ok(!f.startsWith('fashion'), `makeup: "${p.headline}" con foto fashion (${f})`);
    const t = temasOf(f);
    ok(!t.includes('moda'), `makeup: "${p.headline}" con foto de moda (${f}, temas ${t})`);
    if (/antes y despu/i.test(p.headline) || (spec.topics[i] && spec.topics[i].tema === 'makeup')) {
      ok(t.includes('rostro') || t.includes('makeup') || t.includes('skincare') || t.includes('cosmetica'),
        `makeup: "${p.headline}" sin foto de rostro/makeup (${f}, temas ${t})`);
    }
    const ctx = demo.photoGateCtx({ category: 'belleza', subcat: spec.subcat, topic: spec.topics[i], isCafe: false });
    ok(demo.photoPassesGate(f, ctx), `makeup: foto ${f} no pasa su propio gate`);
  });
}

// ---------- 3) Nivel gate: ni como única candidata se fuerza ----------
console.log('— gate por subrubro: la foto ajena no entra ni forzada');
{
  const ctxPelu = demo.photoGateCtx({ category: 'belleza', subcat: null, topic: null, isCafe: false });
  ok(demo.photoPassesGate('beauty-3', ctxPelu) === false, 'peluquería: las brochas (beauty-3) pasan el gate genérico');
  ok(demo.photoPassesGate('beauty-5', ctxPelu) === false, 'peluquería: el retrato makeup (beauty-5) pasa el gate');
  ok(demo.photoPassesGate('beauty-4', ctxPelu) === false, 'peluquería: la crema (beauty-4) pasa el gate');
  ok(demo.photoPassesGate('beauty-2', ctxPelu) === true, 'peluquería: el interior de salón (beauty-2) debería pasar');
  ok(demo.photoPassesGate('beauty-12', ctxPelu) === true, 'peluquería: el lavado (beauty-12) debería pasar');
  // Tema genérico SIN foto curada (la curada es candidata legítima y
  // rescataría el pick): con las brochas como única candidata del pool,
  // el gate devuelve null — la foto ajena no se fuerza jamás.
  ok(demo.pickPhotoGated({ tema: null }, ['beauty-3'], new Set(), ctxPelu) === null,
    'peluquería: pickPhotoGated forzó las brochas como única candidata del genérico');
  const turnos = captions.DEMO_TOPICS.belleza.find((t) => /turnos de esta semana/i.test(t.headline));
  ok(demo.topicPhotoMatchable(turnos, demo.CATEGORY_PHOTOS.belleza, ctxPelu) === true,
    'peluquería: "Turnos" debería ser matchable con el pool real');

  const ctxMk = demo.photoGateCtx({ category: 'belleza', subcat: 'makeup', topic: null, isCafe: false });
  ok(demo.photoPassesGate('fashion', ctxMk) === false, 'makeup: fashion pasa el gate');
  ok(demo.photoPassesGate('fashion-1', ctxMk) === false, 'makeup: fashion-1 pasa el gate');
  ok(demo.photoPassesGate('beauty-10', ctxMk) === true, 'makeup: la aplicación de makeup (beauty-10) debería pasar');
  ok(demo.photoPassesGate('beauty-11', ctxMk) === true, 'makeup: el labial (beauty-11) debería pasar');
  const antesDespues = captions.DEMO_TOPICS.makeup.find((t) => /antes y despu/i.test(t.headline));
  const ctxAD = demo.photoGateCtx({ category: 'belleza', subcat: 'makeup', topic: antesDespues, isCafe: false });
  // Con un tema de makeup SIN foto curada, fashion como única candidata
  // no se fuerza ni cuenta como match (la curada real, beauty-5, sí es
  // candidata legítima cuando el tema la trae).
  ok(demo.pickPhotoGated({ tema: 'makeup' }, ['fashion'], new Set(), ctxAD) === null,
    'makeup: pickPhotoGated forzó fashion en un tema de makeup');
  ok(demo.topicPhotoMatchable({ tema: 'makeup' }, ['fashion'], ctxAD) === false,
    'makeup: un tema de makeup figura matchable solo con fashion');
  ok(demo.topicPhotoMatchable(antesDespues, demo.CATEGORY_PHOTOS.belleza, ctxAD) === true,
    'makeup: el antes/despues debería ser matchable con el pool real');
}

// ---------- 4) trialPhotoOptions: el cambio manual también pasa el gate ----------
console.log('— trialPhotoOptions ×100: el selector manual no ofrece fotos del otro oficio');
{
  const ctxPelu = demo.photoGateCtx({ category: 'belleza', subcat: null, topic: null, isCafe: false });
  const ctxMk = demo.photoGateCtx({ category: 'belleza', subcat: 'makeup', topic: null, isCafe: false });
  for (let r = 0; r < 100; r++) {
    const usadasPelu = ['beauty-2', 'beauty-7'];
    const optsP = demo.trialPhotoOptions('belleza', 'Milagros Peluqueria', usadasPelu, 8);
    ok(optsP.length > 0, 'opciones peluquería: selector vacío');
    for (const o of optsP) {
      ok(!usadasPelu.includes(o.fam), `opciones peluquería: ofrece la excluida ${o.fam}`);
      ok(o.url === '/demo-stock/' + o.fam + '.webp', `opciones peluquería: url rara ${o.url}`);
      const t = temasOf(o.fam);
      for (const x of FUERTES_AJENOS_PELU) {
        ok(!t.includes(x), `opciones peluquería: ofrece ${o.fam} (temas ${t}) — tema ajeno ${x}`);
      }
      ok(demo.photoPassesGate(o.fam, ctxPelu), `opciones peluquería: ${o.fam} no pasa el gate de su contexto`);
    }
    const optsM = demo.trialPhotoOptions('belleza', 'Luna Makeup Studio', [], 8);
    ok(optsM.length > 0, 'opciones makeup: selector vacío');
    for (const o of optsM) {
      ok(!o.fam.startsWith('fashion'), `opciones makeup: ofrece fashion (${o.fam})`);
      const t = temasOf(o.fam);
      for (const x of ['moda', 'pelo', 'unas', 'barberia']) {
        ok(!t.includes(x), `opciones makeup: ofrece ${o.fam} (temas ${t}) — tema ajeno ${x}`);
      }
      ok(demo.photoPassesGate(o.fam, ctxMk), `opciones makeup: ${o.fam} no pasa el gate de su contexto`);
    }
  }
  // Exclusiones que agotan el mundo: el selector relaja las EXCLUSIONES
  // (repite una foto de la semana) antes que ofrecer una foto ajena.
  const mundoPelu = demo.CATEGORY_PHOTOS.belleza.filter((f) => demo.photoPassesGate(f, ctxPelu));
  const agotadas = demo.trialPhotoOptions('belleza', 'Milagros Peluqueria', mundoPelu, 8);
  ok(agotadas.length > 0, 'opciones peluquería agotadas: selector vacío pese al fallback');
  for (const o of agotadas) {
    ok(demo.photoPassesGate(o.fam, ctxPelu), `opciones peluquería agotadas: el fallback ofreció ${o.fam} fuera del mundo`);
  }
  // El pool de café sigue intacto tras el gate.
  const optsCafe = demo.trialPhotoOptions('gastronomia', 'Café Aurora', [], 8);
  ok(optsCafe.length > 0, 'opciones café: selector vacío');
  for (const o of optsCafe) {
    const t = temasOf(o.fam);
    ok(t.includes('cafe') || t.includes('comida'), `opciones café: ofrece ${o.fam} (temas ${t})`);
  }
}

console.log(fails ? `\n✗ ${fails} FALLAS` : '\n✓ TODO OK');
process.exit(fails ? 1 : 0);
