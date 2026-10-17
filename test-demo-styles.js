// test-demo-styles.js — v182: la prueba con estilos reales del catálogo,
// fotos con match foto↔tema y taxonomía makeup ≠ peluquería.
// Sin IA paga: todo corre sobre buildDemoSpec (local, determinístico salvo
// el orden de elección, cuyas invariantes se verifican en N corridas).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-demo-'));

const demo = require('./demo');
const IS = require('./image-styles');

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error('  ✗', msg); }
}
function famOf(p) {
  if (!p || typeof p !== 'string') return null;
  return path.basename(p).replace(/\.webp$/, '');
}
function temasOf(famName) {
  const t = demo.PHOTO_TAGS[famName];
  return t ? t.temas : [];
}
function checkWeek(spec, label, forbiddenTemas) {
  const posts = spec.specPosts;
  const codes = posts.map((p) => p.style);
  ok(new Set(codes).size === codes.length, `${label}: estilos repetidos ${codes}`);
  for (const p of posts) {
    ok(typeof p.style === 'string' && p.style.startsWith('/'), `${label}: style no es del catálogo: ${p.style}`);
    const st = IS.getStyle(p.style);
    ok(!!st && st.brandSafe, `${label}: estilo inexistente o no brandSafe: ${p.style}`);
    ok(!!p.style_name, `${label}: falta style_name en ${p.style}`);
    ok(!!p.treatment && !!p.treatment.skeleton, `${label}: falta treatment en ${p.style}`);
    const famName = famOf(p.photo);
    if (famName) {
      const temas = temasOf(famName);
      for (const ft of forbiddenTemas) ok(!temas.includes(ft), `${label}: foto ${famName} con tema prohibido ${ft} (posteo "${p.headline}")`);
      if (p.tema) {
        for (const c of (demo.TEMA_CONFLICTS[p.tema] || [])) {
          ok(!temas.includes(c), `${label}: foto ${famName} (temas ${temas}) en conflicto con tema ${p.tema} ("${p.headline}")`);
        }
      }
    }
  }
  const skels = new Set(posts.map((p) => p.treatment && p.treatment.skeleton));
  ok(skels.size >= 3, `${label}: solo ${skels.size} esqueletos (${[...skels]})`);
  const fams = posts.map((p) => famOf(p.photo)).filter(Boolean);
  ok(new Set(fams).size === fams.length, `${label}: fotos repetidas ${fams}`);
}

// ---------- 1) MAKEUP: ángulos de maquillaje, jamás de peluquería ----------
console.log('— makeup ×60');
for (let r = 0; r < 60; r++) {
  const spec = demo.buildDemoSpec({
    business: 'Milagros Makeup', category: 'belleza', country: 'AR', tone: 'vos',
    goal: 'Soy maquilladora profesional: makeup social, novias y producciones para fotos',
    count: 5,
  });
  ok(spec.subcat === 'makeup', `makeup: subcat=${spec.subcat}`);
  for (const p of spec.specPosts) {
    ok(!/balayage|corte|teñir|teñirte|pelo/i.test(p.headline), `makeup: titular de peluquería "${p.headline}"`);
  }
  checkWeek(spec, 'makeup', demo.AUDIENCE_FORBIDDEN_TEMAS.makeup);
}

// ---------- 2) BELLEZA peluquería: los pares que fallaron en la vida real ----------
console.log('— belleza (peluquería) ×60');
for (let r = 0; r < 60; r++) {
  const spec = demo.buildDemoSpec({
    business: 'Peluquería Lumi', category: 'belleza', country: 'AR', tone: 'vos',
    goal: 'Cortes, color, balayage y peinados para mujeres',
    count: 5,
  });
  ok(spec.subcat === null, `belleza: subcat inesperado ${spec.subcat}`);
  checkWeek(spec, 'belleza', demo.AUDIENCE_FORBIDDEN_TEMAS.belleza);
  for (const p of spec.specPosts) {
    const famName = famOf(p.photo);
    // EL caso real: "De castaño a rubio" (tintura) con foto de UÑAS.
    if (/castaño a rubio|teñirte/i.test(p.headline)) {
      ok(famName !== 'beauty-6', `belleza: "${p.headline}" con foto de uñas (beauty-6)`);
      ok(!temasOf(famName).includes('unas'), `belleza: "${p.headline}" con temas de uñas`);
      ok(!temasOf(famName).includes('makeup'), `belleza: "${p.headline}" con foto de makeup`);
    }
    // Ningún posteo de una peluquería femenina con fotos de barbería masculina.
    ok(famName !== 'beauty' && famName !== 'beauty-1', `belleza: foto de barbería (${famName}) en "${p.headline}"`);
  }
}

// ---------- 3) BARBERÍA: sin uñas ni makeup (los otros dos pares reales) ----------
console.log('— barbería ×60');
for (let r = 0; r < 60; r++) {
  const spec = demo.buildDemoSpec({
    business: 'Navaja Club', category: 'barberia', country: 'AR', tone: 'vos',
    goal: 'Barbería: cortes, fade y ritual de barba',
    count: 5,
  });
  checkWeek(spec, 'barberia', demo.AUDIENCE_FORBIDDEN_TEMAS.barberia);
  for (const p of spec.specPosts) {
    const famName = famOf(p.photo);
    ok(famName !== 'beauty-3' && famName !== 'beauty-5' && famName !== 'beauty-6',
      `barberia: foto femenina/uñas (${famName}) en "${p.headline}"`);
  }
}

// ---------- 4) CAFETERÍA: pool de café curado + estilos distintos ----------
console.log('— cafetería ×30');
const CAFE_SET = new Set(['food', 'food-2', 'food-4', 'lifestyle', 'lifestyle-1', 'food-1']);
for (let r = 0; r < 30; r++) {
  const spec = demo.buildDemoSpec({
    business: 'Café Aurora', category: 'gastronomia', country: 'AR', tone: 'vos', goal: '', count: 5,
  });
  checkWeek(spec, 'cafeteria', []);
  for (const p of spec.specPosts) {
    ok(CAFE_SET.has(famOf(p.photo)), `cafeteria: foto fuera del pool de café: ${famOf(p.photo)}`);
  }
}

// ---------- 4b) GASTRONOMÍA: el estilo nombrado no contradice el plato ----------
console.log('— gastronomía (etiqueta vs plato) ×60');
for (let r = 0; r < 60; r++) {
  const spec = demo.buildDemoSpec({
    business: 'Restaurante Don Pepe', category: 'gastronomia', country: 'AR', tone: 'vos', goal: '', count: 5,
  });
  for (const p of spec.specPosts) {
    const st = IS.getStyle(p.style);
    const sd = demo.dishOf(`${p.style} ${st ? st.name : ''}`);
    if (sd) {
      ok(demo.dishOf(`${p.headline} ${p.sub} ${p.tag}`) === sd,
        `gastro: estilo "${st && st.name}" (${sd}) en posteo "${p.headline}"`);
    }
  }
}

// ---------- 5) Tratamientos determinísticos ----------
console.log('— tratamientos');
{
  const ba = IS.getStyle('/ugcbeforeafter');
  ok(ba && demo.treatmentForStyle(ba).skeleton === 'duo', 'beforeafter debería ser skeleton duo');
  const q = IS.STYLES.find((s) => s.code.includes('quote'));
  if (q) ok(demo.treatmentForStyle(q).skeleton === 'centro', `${q.code} debería ser skeleton centro`);
  const a = demo.treatmentForStyle(IS.getStyle('/cosmetic'));
  const b = demo.treatmentForStyle(IS.getStyle('/cosmetic'));
  ok(JSON.stringify(a) === JSON.stringify(b), 'treatmentForStyle no es determinístico');
}

// ---------- 6) Taxonomía ----------
console.log('— taxonomía');
ok(demo.demoSubcat({ business: 'Milagros Makeup', category: 'belleza', goal: '' }) === 'makeup', 'subcat makeup por nombre');
ok(demo.demoSubcat({ business: 'Estudio Ana', category: 'belleza', goal: 'maquillaje social y novias' }) === 'makeup', 'subcat makeup por detalle');
ok(demo.demoSubcat({ business: 'Navaja Club', category: 'barberia', goal: 'cortes y barba' }) === null, 'barbería declarada no es makeup');
ok(demo.demoSubcat({ business: 'Pelu Lumi', category: 'belleza', goal: 'peluquería y maquillaje' }) === 'makeup', 'la palabra específica (maquillaje) manda');
ok(demo.categoryFromText('Maquillaje profesional y peinados') === 'belleza', 'categoryFromText makeup → belleza');
ok(demo.categoryFromText('Peluquería y maquillaje') === 'belleza', 'categoryFromText: makeup gana a peluquería genérica');
ok(demo.categoryFromText('Barbería Navaja, cortes y barba') === 'barberia', 'categoryFromText barbería');
ok(demo.categoryFromText('Cafetería de especialidad y brunch') === 'cafeteria', 'categoryFromText cafetería');

// ---------- 7) Sanidad general: todas las categorías arman spec ----------
console.log('— categorías');
for (const cat of demo.CATEGORIES) {
  const spec = demo.buildDemoSpec({ business: 'Negocio Test', category: cat, country: 'AR', tone: 'vos', goal: '', count: 5 });
  ok(spec.specPosts.length === 5, `${cat}: ${spec.specPosts.length} posteos`);
  checkWeek(spec, cat, []);
}

console.log(fails ? `\n✗ ${fails} FALLAS` : '\n✓ TODO OK');
process.exit(fails ? 1 : 0);
