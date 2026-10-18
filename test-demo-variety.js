// test-demo-variety.js — v197: VARIEDAD REAL DE ESTILOS + REGISTRO HEREDADO.
//
// El veredicto que lo originó (2026-10-18, Valentino sobre la grilla
// v196): "Sigue mal… estilos repetidos. No sigue una línea con los
// posteos anteriores." Los 3 "pósters de marca" eran LA MISMA plantilla
// con distinto titular, y el registro oscuro no era el de su feed
// (luminoso: crema/amarillo/celeste pastel).
//
// Este test garantiza, sobre buildDemoSpec (sin IA, sin red):
//  1) Ninguna semana repite style_code NI esqueleto de render NI par
//     (esqueleto × tipo de fondo) — 60 corridas por rubro/subrubro.
//  2) El subrubro contenido produce ≥4 esqueletos distintos por semana.
//  3) El póster de marca es UNA pieza posible por semana (máximo 1) y
//     los extras (topicOffset > 0) nunca son póster.
//  4) La foto de perfil aparece como máximo en 2 piezas, con
//     tratamientos distintos (medallón del póster ≠ marca suave).
//  5) Registro lumínico: la luminancia medida de las fotos del feed
//     clasifica claro/oscuro, y demoColors produce el fondo de póster
//     acorde (claro ≥0,75 de luminancia; oscuro ≤0,25).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-variety-'));

const demo = require('./demo');

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error('  ✗', msg); }
}
const lumOf = (hex) => {
  const v = parseInt(String(hex).slice(1), 16);
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
};
// Tipo de fondo por esqueleto (para el par esqueleto × fondo): el póster
// es plano (claro u oscuro según registro); el resto vive sobre la foto.
const bgTypeOf = (p, register) => {
  const sk = p.treatment && p.treatment.skeleton;
  if (sk === 'poster') return register === 'light' ? 'plano-claro' : 'plano-oscuro';
  if (sk === 'velo') return 'foto-velo';
  if (sk === 'claro') return 'foto-clara';
  if (sk === 'centro') return 'foto-panel';
  if (sk === 'duo') return 'foto-duo';
  return 'foto-degrade-' + sk;
};
function checkVariety(spec, label, register) {
  const posts = spec.specPosts;
  const codes = posts.map((p) => p.style);
  ok(new Set(codes).size === codes.length, `${label}: style_code repetido ${codes}`);
  const skels = posts.map((p) => p.treatment && p.treatment.skeleton);
  ok(skels.every(Boolean), `${label}: pieza sin treatment ${JSON.stringify(skels)}`);
  ok(new Set(skels).size === skels.length, `${label}: ESQUELETO repetido ${skels}`);
  const pairs = posts.map((p) => `${p.treatment.skeleton}×${bgTypeOf(p, register)}`);
  ok(new Set(pairs).size === pairs.length, `${label}: par esqueleto×fondo repetido ${pairs}`);
  return skels;
}

// ---------- 1) Variedad estructural: todos los rubros ×60 ----------
console.log('— variedad: 25 rubros ×60 corridas, cero esqueletos repetidos');
for (const cat of demo.CATEGORIES) {
  for (let r = 0; r < 60; r++) {
    const spec = demo.buildDemoSpec({
      business: 'Negocio Test', category: cat, country: 'AR', tone: 'vos', goal: '', count: 5,
      profilePicPath: '/tmp/pic-test.jpg',
    });
    ok(spec.specPosts.length === 5, `${cat}: ${spec.specPosts.length} posteos (esperaba 5)`);
    checkVariety(spec, cat, spec.feedRegister);
  }
}

// ---------- 1b) Subrubros con público propio ×60 ----------
console.log('— variedad: makeup y contenido ×60');
for (let r = 0; r < 60; r++) {
  const mk = demo.buildDemoSpec({
    business: 'Milagros Makeup', category: 'belleza', country: 'AR', tone: 'vos',
    goal: 'Soy maquilladora profesional: makeup social, novias y producciones para fotos',
    count: 5, profilePicPath: '/tmp/pic-test.jpg',
  });
  ok(mk.subcat === 'makeup', `makeup: subcat=${mk.subcat}`);
  checkVariety(mk, 'makeup', mk.feedRegister);
  const cm = demo.buildDemoSpec({
    business: 'Posta. | Contenido para tu negocio', category: 'profesionales',
    country: 'AR', tone: 'vos', goal: 'Conseguir clientes y crecer en Instagram',
    count: 5, profilePicPath: '/tmp/pic-test.jpg', feedRegister: 'light',
  });
  ok(cm.subcat === 'contenido', `contenido: subcat=${cm.subcat}`);
  const skels = checkVariety(cm, 'contenido', 'light');
  ok(new Set(skels).size >= 4, `contenido: solo ${new Set(skels).size} esqueletos distintos (${skels})`);
}

// ---------- 2) Póster: máximo 1 por semana; extras nunca ----------
console.log('— póster de marca: una sola pieza posible por semana');
for (let r = 0; r < 60; r++) {
  for (const [business, category] of [
    ['Posta. | Contenido para tu negocio', 'profesionales'],
    ['Estudio Jurídico Andina', 'profesionales'],
    ['Servicios Integrales Sur', 'servicios'],
  ]) {
    const spec = demo.buildDemoSpec({
      business, category, country: 'AR', tone: 'vos', goal: '', count: 5,
      profilePicPath: '/tmp/pic-test.jpg',
    });
    const posters = spec.specPosts.filter((p) => p.poster);
    ok(posters.length <= 1, `${business}: ${posters.length} pósters (máximo 1)`);
  }
  const extra = demo.buildDemoSpec({
    business: 'Posta. | Contenido para tu negocio', category: 'profesionales',
    country: 'AR', tone: 'vos', goal: '', count: 1, topicOffset: 5,
    profilePicPath: '/tmp/pic-test.jpg',
  });
  ok(extra.specPosts.every((p) => !p.poster), 'el extra salió como póster');
}

// ---------- 3) Foto de perfil: ≤2 apariciones, tratamientos distintos ----------
console.log('— foto de perfil: máximo 2 piezas, nunca el mismo tratamiento');
for (let r = 0; r < 60; r++) {
  const spec = demo.buildDemoSpec({
    business: 'Posta. | Contenido para tu negocio', category: 'profesionales',
    country: 'AR', tone: 'vos', goal: 'Conseguir clientes y crecer en Instagram',
    count: 5, profilePicPath: '/tmp/pic-test.jpg', feedRegister: 'light',
  });
  const uses = [];
  spec.specPosts.forEach((p, i) => {
    if (p.poster && p.photo === '/tmp/pic-test.jpg') uses.push({ i, trato: 'medallon-poster' });
    if (p.pic_mark === 'watermark') {
      ok(p.pic_path === '/tmp/pic-test.jpg', 'marca suave sin la foto de perfil');
      ok(!p.poster, 'la marca suave cayó en el póster');
      ok(p.treatment.skeleton !== 'duo', 'marca suave sobre un antes/después');
      uses.push({ i, trato: 'marca-suave' });
    }
  });
  ok(uses.length <= 2, `la foto de perfil aparece ${uses.length} veces (máximo 2)`);
  ok(new Set(uses.map((u) => u.i)).size === uses.length, 'la misma pieza usa la foto dos veces');
  ok(new Set(uses.map((u) => u.trato)).size === uses.length, 'tratamientos de la foto repetidos');
  const posters = spec.specPosts.filter((p) => p.poster);
  ok(posters.length === 1 && posters[0].photo === '/tmp/pic-test.jpg',
    'el único póster lleva la foto de perfil como medallón');
}

// ---------- 4) Registro lumínico heredado ----------
console.log('— registro: luminancia del feed y fondo del póster');
(async () => {
  // Fotos sintéticas: una luminosa (crema) y una oscura (casi negra).
  const mk = (name, rgb) => {
    const p = path.join(os.tmpdir(), name);
    execFileSync('python3', ['-c',
      `from PIL import Image; Image.new('RGB', (200, 200), (${rgb})).save(${JSON.stringify(p)})`]);
    return fs.readFileSync(p);
  };
  const bright = mk('posta-test-bright.jpg', '242,236,218');
  const dark = mk('posta-test-dark.jpg', '14,16,22');
  const lumB = await demo.feedLuminanceFromBuffers([bright, bright, bright]);
  const lumD = await demo.feedLuminanceFromBuffers([dark]);
  ok(lumB != null && lumB >= 0.55, `feed luminoso mide ${lumB} (debería dar registro claro)`);
  ok(lumD != null && lumD < 0.55, `feed oscuro mide ${lumD} (debería dar registro oscuro)`);
  ok((await demo.feedLuminanceFromBuffers([])) === null, 'sin fotos → null (comportamiento actual)');

  const cLight = demo.demoColors('#F9C00E', '#1386C7', 'light');
  ok(lumOf(cLight.poster_bg) >= 0.75, `póster claro: fondo ${cLight.poster_bg} lum ${lumOf(cLight.poster_bg).toFixed(2)}`);
  ok(lumOf(cLight.poster_dark) <= 0.25, `póster claro: textos en ${cLight.poster_dark} (oscuro de su paleta)`);
  const cDark = demo.demoColors('#F9C00E', '#1386C7', 'dark');
  ok(lumOf(cDark.poster_bg) <= 0.25, `póster oscuro: fondo ${cDark.poster_bg} lum ${lumOf(cDark.poster_bg).toFixed(2)}`);
  const cNone = demo.demoColors('#F9C00E', '#1386C7');
  ok(cNone.poster_bg === cDark.poster_bg, 'sin registro → el póster oscuro de siempre');
  ok(demo.posterBgLightFor('#F9C00E', '#1386C7') === cLight.poster_bg, 'posterBgLightFor consistente con demoColors');

  const specL = demo.buildDemoSpec({
    business: 'Posta. | Contenido para tu negocio', category: 'profesionales',
    country: 'AR', tone: 'vos', goal: '', count: 5, feedRegister: 'light',
  });
  ok(specL.feedRegister === 'light', 'el spec conserva el registro luminoso');
  const specN = demo.buildDemoSpec({
    business: 'Café Aurora', category: 'cafeteria', country: 'AR', tone: 'vos', goal: '', count: 5,
  });
  ok(specN.feedRegister === null, 'sin perfil → spec sin registro (comportamiento actual)');

  console.log(fails ? `\n✗ ${fails} FALLAS` : '\n✓ TODO OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
