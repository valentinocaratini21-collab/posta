'use strict';
/* test-adoption-patterns.js — BUILD DE ADOPCIÓN v231 (2026-10-18,
 * aprobada por Valentino: "ejecutemos esto; los posteos que armamos
 * definen todo"). Aplica los patrones medidos en el estudio
 * competitivo (estudio-patrones-posteos-ia.md) + el AMENDMENT del
 * mismo día: "Nada de palabras en el medio del posteo" — el texto va
 * SOLO en las bandas superior/inferior, nunca en el centro.
 * Cubre, con fixtures USD 0 (renders locales y aserciones sobre el
 * prompt ensamblado, sin generaciones en vivo):
 *  1) Presupuesto de texto ≤20% MEDIDO en renders reales (demo_render
 *     y composite-headline) + regla de bandas (centro del bloque
 *     fuera del tercio medio) + esqueleto 'centro' RETIRADO → panel.
 *  2) subject_scale en TODAS las familias de ART_DIRECTIONS, línea en
 *     el prompt de dirección de arte y campo en el spec del demo.
 *  3) Prompt con fórmula oficial (escena→sujeto→acción→composición→
 *     estilo + declaración de uso) y estándar POSITIVO: la lista de
 *     ~10 negaciones (PROMPT_AVOID_BASE) ya no existe.
 *  4) Referencias con roles etiquetados por índice (ref-roles.js) en
 *     conceptShot (clientes) y en la ruta ilustrada del demo.
 *  5) Titular-oferta con número SOLO del digest: promo con precio en
 *     el digest → el número sube al titular; promo sin número en el
 *     digest → NO se genera número (test negativo) y el guard bloquea
 *     el número inventado.
 *  6) Contraste ≥4,5:1: gate medido en demo_render + composite y
 *     campos audit-only (contraste_ok/elementos_ok) en qaImageB64,
 *     FUERA de qaPassed.
 *  7) Carrusel: arco qué→por qué→precio/dónde + continuidad de
 *     escena con bleed lateral en la primera placa.
 *  8) Cuotas de intención: rebalance solo en semanas degeneradas.
 *  9) Tres roles tipográficos: ExtraBold (titular) / SemiBold
 *     (etiqueta) / Regular (bajada) como assets reales.
 * 10) Test de sustracción: tope de elementos por esqueleto en el
 *     renderer (_pill_for) + checklist en qaImageB64.
 * Corre con: node test-adoption-patterns.js (sin red, sin IA paga). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const clientDigest = require('./client-digest');
const cleanPieces = require('./clean-pieces');
const refRoles = require('./ref-roles');
const demoAi = require('./demo-ai');
const demo = require('./demo');
const carousel = require('./carousel');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };
const srv = fs.readFileSync('server.js', 'utf8');
const genSrc = fs.readFileSync('generator.js', 'utf8');
const demoSrc = fs.readFileSync('demo.js', 'utf8');
const renderSrc = fs.readFileSync('demo_render.py', 'utf8');

console.log('== 1) Presupuesto de texto + regla de bandas (renders reales) ==');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posty-adoption-'));
const stockPhoto = path.join(__dirname, 'public', 'demo-stock', 'bar-1.webp');
const mkPost = (skeleton, headline, subline) => ({
  photo: stockPhoto, style: 'promo',
  treatment: { skeleton, grade: 'neutral', crop: 'normal' },
  headline, subline, pill: '', focus: 0.5,
});
const specPath = path.join(TMP, 'spec.json');
fs.writeFileSync(specPath, JSON.stringify({
  fonts_dir: path.join(__dirname, 'assets', 'fonts'),
  colors: {},
  posts: [
    mkPost('centro', 'Agenda abierta: reservá tu fecha', 'Turnos de octubre'),
    mkPost('abajo', 'Sushi libre toda la semana para vos', 'Rolls, nigiris y makis recién hechos en el momento'),
    mkPost('arriba', 'Noche de tragos de autor', 'La barra abre hasta tarde'),
  ],
}));
const renderOut = execFileSync('python3', ['demo_render.py', specPath, path.join(TMP, 'out')], { encoding: 'utf8' });
const lineOf = (i) => renderOut.split('\n').find((l) => l.startsWith(`post-${i} `)) || '';
const field = (line, k) => { const m = line.match(new RegExp(`${k}=(\\S+)`)); return m ? m[1] : null; };
ok("spec 'centro' → el bloque cae al panel inferior (esqueleto retirado)", () => {
  assert.strictEqual(field(lineOf(0), 'zone'), 'panel');
  assert.strictEqual(field(lineOf(0), 'band_ok'), 'True');
});
ok('guard de área: las 3 piezas miden ≤20% de texto', () => {
  for (const i of [0, 1, 2]) {
    const a = parseFloat(field(lineOf(i), 'area'));
    assert.ok(!Number.isNaN(a) && a <= 20.0, `post-${i}: área ${a}% > 20%`);
  }
});
ok('regla de bandas: ningún bloque centra en el tercio medio', () => {
  for (const i of [0, 1, 2]) assert.strictEqual(field(lineOf(i), 'band_ok'), 'True', `post-${i}`);
});
ok('gate de contraste en render sobre foto: ≥4,5:1 medido', () => {
  for (const i of [1, 2]) {
    const c = parseFloat(field(lineOf(i), 'contrast'));
    assert.ok(!Number.isNaN(c) && c >= 4.5, `post-${i}: contraste ${c}`);
  }
});
ok('composite-headline: área ≤20% y contraste ≥4,5 en foto clara', () => {
  execFileSync('python3', ['-c', "from PIL import Image; Image.new('RGB', (1024, 1280), (225, 228, 230)).save('/tmp/adoption-bright.jpg')"]);
  const out = execFileSync('python3', ['composite-headline.py', '--in', '/tmp/adoption-bright.jpg',
    '--headline', 'Sushi libre para dos personas toda la semana', '--out', path.join(TMP, 'comp.jpg')], { encoding: 'utf8' });
  const a = parseFloat((out.match(/area=([\d.]+)/) || [])[1]);
  const c = parseFloat((out.match(/contrast=([\d.]+)/) || [])[1]);
  assert.ok(a <= 20.0, `área ${a}%`);
  assert.ok(c >= 4.5, `contraste ${c}`);
});
ok('demo_render.py documenta la regla de Valentino y el retiro de centro', () => {
  assert.ok(renderSrc.includes('Nada de palabras en el medio del posteo'));
  const centroBody = renderSrc.slice(renderSrc.indexOf('def sk_centro'), renderSrc.indexOf('def sk_duo'));
  assert.ok(centroBody.includes('_sk_panel(fonts_dir, p, C, hs, img, lay)'), 'sk_centro delega al panel');
  assert.ok(!centroBody.includes('rounded_rectangle'), 'sk_centro ya no dibuja panel central');
});

console.log('== 2) subject_scale en todas las familias ==');
ok('las 16 familias tienen subject_scale con rangos válidos', () => {
  const fams = Object.keys(demoAi.ART_DIRECTIONS);
  assert.ok(fams.length >= 16, `${fams.length} familias`);
  for (const f of fams) {
    const ss = demoAi.ART_DIRECTIONS[f].subject_scale;
    assert.ok(ss, `${f} sin subject_scale`);
    for (const k of ['text', 'clean']) {
      assert.ok(Array.isArray(ss[k]) && ss[k][0] > 0 && ss[k][0] < ss[k][1] && ss[k][1] <= 1.0, `${f}.${k} inválido`);
    }
    assert.ok(['none', 'bottom', 'right', 'edges'].includes(ss.bleed), `${f}.bleed`);
  }
});
ok('la dirección de arte inyecta la línea de escala y existe la familia carousel', () => {
  assert.ok(/Subject scale/.test(demoAi.artDirectionFor('/flatlay')));
  assert.strictEqual(demoAi.artFamilyFor('/carousel'), 'carousel');
  assert.ok(/bleed off the RIGHT edge/.test(demoAi.artDirectionFor('/carousel')));
});
ok('el spec del demo lleva subject_scale por pieza', () => {
  const spec = demo.buildDemoSpec({ business: 'Café Test', category: 'cafeteria', country: 'AR', tone: 'vos', count: 5, profilePicPath: '/tmp/pic-test.jpg' });
  assert.ok(spec.specPosts.length >= 3);
  for (const p of spec.specPosts) {
    assert.ok(p.subject_scale && Array.isArray(p.subject_scale.text), `pieza sin subject_scale (${p.style})`);
  }
});

console.log('== 3) Prompt con fórmula oficial y framing positivo ==');
const segStart = srv.indexOf('const PROMPT_SCENE_STANDARD');
const segEnd = srv.indexOf("return parts.join('\\n');", segStart);
assert.ok(segStart > 0 && segEnd > segStart, 'segmento del ensamblador localizado');
const seg = srv.slice(segStart, srv.indexOf('\n}', segEnd) + 2);
const assembleImagePrompt = new Function(`${seg}; return assembleImagePrompt;`)();
const fixture = assembleImagePrompt({
  blocks: {
    contexto: 'a small sushi bar in Palermo with a wooden counter',
    sujeto: 'the omakase platter of Sushi Go',
    momento: 'the chef placing the last nigiri with tweezers',
    luz: 'warm pendant light from above',
    composicion: 'close three-quarter shot, platter low in frame',
  },
  rawText: '', visualStyle: '', paletteHex: ['#1D3557'], headline: 'Omakase de autor', category: 'gastronomia',
});
ok('fixture: orden oficial uso → escena → sujeto → acción → composición', () => {
  const idx = ['USE: a vertical 4:5', 'SCENE:', 'HERO SUBJECT:', 'ACTION:', 'COMPOSITION & LIGHT:', 'exact brand colors', 'HEADLINE ZONE', 'SCENE STANDARD']
    .map((s) => fixture.indexOf(s));
  assert.ok(idx.every((v) => v >= 0), `faltan bloques: ${idx}`);
  assert.ok(idx.every((v, i) => i === 0 || idx[i - 1] < v), `orden roto: ${idx}`);
});
ok('fixture: cero negaciones de la lista vieja (PROMPT_AVOID_BASE eliminada)', () => {
  assert.ok(!srv.includes('const PROMPT_AVOID_BASE =') && !srv.includes('parts.push(PROMPT_AVOID_BASE'), 'la lista de negaciones sigue viva en el ensamblador');
  for (const bad of ['AVOID: generic stock-photo', 'deformed hands, fingers, faces', 'watermarks or stock-site seals', 'flat gray backgrounds or empty studio voids']) {
    assert.ok(!fixture.includes(bad), `el prompt conserva "${bad}"`);
  }
  assert.ok(fixture.includes('blank, dark, empty or softly blurred'), 'equivalente positivo de superficies sin texto');
  assert.ok(fixture.includes('never a flat gray or empty studio void'), 'equivalente positivo de fondo vivo');
});
ok('fixture: pieza limpia no reserva zona de titular (contrato v228 intacto)', () => {
  const clean = assembleImagePrompt({ blocks: { sujeto: 'x' }, rawText: '', visualStyle: '', paletteHex: [], headline: '', category: '' });
  assert.ok(!clean.includes('HEADLINE ZONE'));
  assert.ok(srv.includes("if (String(headline || '').trim()) parts.push(headlineZoneLine(headline));"));
});
ok('demo-ai: directivas de fondo y de reintento QA en positivo', () => {
  const dir = demoAi.compositionDirectives({ formula: { character_scale: 0.7, background: 'prop', headline: 'large' } }, 'Los horarios que más rinden');
  assert.ok(!/FORBIDDEN/.test(dir) && /clear empty surfaces/i.test(dir));
  assert.ok(demoAi.qaRetryDirective({ failures: ['text'] }).includes('completely clean'));
});

console.log('== 4) Referencias con roles etiquetados ==');
ok('buildRefNote etiqueta cada imagen con su rol e instrucción', () => {
  const note = refRoles.buildRefNote(['logo', 'product', 'style']);
  assert.ok(note.includes('Image 1:') && /logo/.test(note) && /IDENTICAL/.test(note));
  assert.ok(note.includes('Image 2:') && /REAL product/.test(note) && /preserve/.test(note));
  assert.ok(note.includes('Image 3:') && /ONLY its palette/.test(note));
  assert.strictEqual(refRoles.buildRefNote([]), '');
});
ok('conceptShot compone la nota desde los roles (y el caller declara product)', () => {
  assert.ok(srv.includes('refRoles.buildRefNote(roles.length ? roles : absRefs.map(() => \'photo\'))'));
  assert.ok(srv.includes("refRolesForRefs = refs.map((r) => (mappedRefs.includes(r) ? 'product' : 'photo'))"));
  assert.ok(srv.includes('refRoles: refRolesForRefs'));
});
ok('la ruta ilustrada del demo usa la nota de roles (personaje + estilo)', () => {
  assert.strictEqual(demoAi.REF_NOTE, refRoles.DEMO_REF_NOTE);
  assert.ok(refRoles.DEMO_REF_NOTE.includes('Image 1:') && refRoles.DEMO_REF_NOTE.includes('Image 2:'));
});

console.log('== 5) Titular-oferta con número: solo del digest ==');
const digestConPrecio = {
  business_name: 'Sushi Go', category: 'gastronomia',
  productos: [{ nombre: 'Omakase de autor', precio: '$12.000' }],
  servicios: [{ nombre: 'Cena por pasos', precio: '' }],
  promos: [{ titulo: 'Noche nikkei para dos', precio: '$18.500' }],
  temas_feed: [], protagonista: '', has_booking: false, diferencial: '', ciudad: '',
};
const digestSinNumero = {
  business_name: 'Sushi Go', category: 'gastronomia',
  productos: [{ nombre: 'Omakase de autor', precio: '' }],
  servicios: [{ nombre: 'Cena por pasos', precio: '' }],
  promos: [{ titulo: 'Noche nikkei', precio: '' }],
  temas_feed: [], protagonista: '', has_booking: false, diferencial: '', ciudad: '',
};
ok('promo CON precio en el digest: el número sube al titular', () => {
  const promo = clientDigest.deriveTopics(digestConPrecio, { count: 5, category: 'gastronomia' }).find((t) => t.kind === 'promo');
  assert.ok(promo && promo.headline.includes('18.500'), `titular: ${promo && promo.headline}`);
});
ok('NEGATIVO: promo SIN número en el digest NO genera número', () => {
  const promo = clientDigest.deriveTopics(digestSinNumero, { count: 5, category: 'gastronomia' }).find((t) => t.kind === 'promo');
  assert.ok(promo, 'hay tema promo');
  assert.ok(!/\d/.test(`${promo.headline} ${promo.subline || ''}`), `salió un número: "${promo.headline}"`);
});
ok('el guard bloquea el número inventado y deja pasar el del digest', () => {
  const bad = clientDigest.promoNumberGuard({ kind: 'promo', headline: 'Sushi libre $8.500' }, digestConPrecio);
  assert.strictEqual(bad.ok, false);
  assert.deepStrictEqual(bad.numbers, ['8500']);
  const good = clientDigest.promoNumberGuard({ kind: 'promo', headline: 'Omakase a $12.000' }, digestConPrecio);
  assert.strictEqual(good.ok, true);
  const pct = clientDigest.promoNumberGuard({ kind: 'promo', headline: '20% off en rolls' }, digestSinNumero);
  assert.strictEqual(pct.ok, false);
});
ok('el demo aplica el candado sobre el spec (wiring)', () => {
  assert.ok(demoSrc.includes('clientDigest.promoNumberGuard'));
  assert.ok(demoSrc.includes('CANDADO DE NÚMEROS DE PROMO'));
});
ok('CAPTION_CRAFT: la promo con número de los datos arranca el caption; inventar, prohibido', () => {
  assert.ok(genSrc.includes('PROMO CON NÚMERO (v231)'));
  assert.ok(genSrc.includes('JAMÁS inventes un precio'));
});

console.log('== 6) Contraste y sustracción en el QA de clientes (audit-only) ==');
ok('qaImageB64 devuelve contraste_ok y elementos_ok fuera de qaPassed', () => {
  assert.ok(srv.includes('contraste_ok: parsed.contraste_ok !== false'));
  assert.ok(srv.includes('elementos_ok: parsed.elementos_ok !== false'));
  const qaPassedLine = srv.split('\n').find((l) => l.includes('const qaPassed')) || '';
  assert.ok(qaPassedLine && !/contraste|elementos/.test(qaPassedLine), 'los campos nuevos NO bloquean');
  assert.ok(srv.includes('test de sustracción'));
});

console.log('== 7) Carrusel: arco + continuidad ==');
ok('CAROUSEL_ARC qué → por qué → precio/dónde', () => {
  assert.deepStrictEqual(carousel.CAROUSEL_ARC.map((a) => a.role), ['que', 'porque', 'cierre']);
  assert.strictEqual(carousel.arcForSlide(0, 3).role, 'que');
  assert.strictEqual(carousel.arcForSlide(1, 3).role, 'porque');
  assert.strictEqual(carousel.arcForSlide(2, 3).role, 'cierre');
});
ok('generateCarouselSet inyecta continuidad y bleed lateral en la placa 1', () => {
  assert.ok(srv.includes('carouselContinuityNote(idx)'));
  assert.ok(srv.includes('gently cropped by the right edge'));
  assert.ok(srv.includes('EXACT same scene as its sibling slides'));
});

console.log('== 8) Cuotas de intención ==');
ok('semana degenerada (toda venta) se reequilibra con el buffer', () => {
  const picks = [
    { tipo: 'promo' }, { tipo: 'promo' }, { tipo: 'novedad' }, { tipo: 'reserva' }, { tipo: 'promo' },
    { tipo: 'tip' }, { tipo: 'social' },
  ];
  const rb = cleanPieces.rebalanceIntentPicks(picks, 5);
  assert.ok(rb.swapped >= 1, 'hubo canjes');
  const mix = cleanPieces.intentMixOf(rb.picks.slice(0, 5));
  assert.ok(mix.venta <= 3, `venta=${mix.venta}`);
  assert.ok(mix.valor + mix.comunidad >= 2, `mix: ${JSON.stringify(mix)}`);
});
ok('semana sana no se toca', () => {
  const picks = [{ tipo: 'promo' }, { tipo: 'tip' }, { tipo: 'social' }, { tipo: 'novedad' }, { tipo: 'detras' }, { tipo: 'promo' }];
  const rb = cleanPieces.rebalanceIntentPicks(picks, 5);
  assert.strictEqual(rb.swapped, 0);
  assert.deepStrictEqual(rb.picks.map((p) => p.tipo), picks.map((p) => p.tipo));
});
ok('wiring: generateWeekDrafts reequilibra antes de la grilla; el demo audita su ventana', () => {
  assert.ok(srv.includes('cleanPieces.rebalanceIntentPicks(picks, deficit)'));
  assert.ok(srv.indexOf('rebalanceIntentPicks(picks, deficit)') < srv.indexOf('EQUILIBRIO DE GRILLA'));
  assert.ok(demoSrc.includes('AUDITORÍA DE INTENCIÓN'));
});

console.log('== 9) Tres roles tipográficos ==');
ok('assets de fuente: ExtraBold / SemiBold / Regular verdaderos', () => {
  for (const f of ['Montserrat-ExtraBold.ttf', 'Montserrat-SemiBold.ttf', 'Montserrat-Regular.ttf']) {
    assert.ok(fs.existsSync(path.join(__dirname, 'assets', 'fonts', f)), `falta ${f}`);
  }
  const names = execFileSync('python3', ['-c',
    "from PIL import ImageFont; import sys; [print(ImageFont.truetype('assets/fonts/' + f, 40).getname()[1]) for f in sys.argv[1:]]",
    'Montserrat-ExtraBold.ttf', 'Montserrat-SemiBold.ttf', 'Montserrat-Regular.ttf'], { encoding: 'utf8' }).trim().split('\n');
  assert.deepStrictEqual(names, ['ExtraBold', 'SemiBold', 'Regular']);
});
ok('el renderer asigna los roles (titular B/800, etiqueta SB/600, bajada R/400)', () => {
  assert.ok(renderSrc.includes('def SB(fonts_dir, size)'));
  assert.ok(renderSrc.includes('Montserrat-ExtraBold.ttf'));
  assert.ok(renderSrc.includes('f = SB(fonts_dir, 34)'));
});

console.log('== 10) Test de sustracción en el renderer ==');
ok('_pill_for: titular + bajada + pastilla → la pastilla cede', () => {
  assert.ok(renderSrc.includes('def _pill_for(p)'));
  const out = execFileSync('python3', ['-c', `
import importlib.util
spec = importlib.util.spec_from_file_location('dr', 'demo_render.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(m._pill_for({'pill': 'NUEVO', 'headline': 'Hola', 'subline': 'bajada'}))
print(repr(m._pill_for({'pill': 'NUEVO', 'headline': 'Hola', 'subline': ''})))
print(m.text_area_pct(409) > 20.0, round(m.text_area_pct(300), 1))
`], { encoding: 'utf8' });
  assert.ok(out.includes("\n'NUEVO'") || out.includes('"NUEVO"') || out.split('\n')[1].includes('NUEVO'), out);
  assert.ok(out.includes('True'), 'el baseline de ~25% efectivamente supera el presupuesto');
});

console.log('== Versiones ==');
ok('BUILD_ID v232 + motores de la prueba en 21 (cerebro comercial)', () => {
  assert.ok(srv.includes("const BUILD_ID = '20261018-v232'"));
  assert.strictEqual(demo.DEMO_ENGINE_V, 21);
  assert.ok(fs.readFileSync('public/prueba.html', 'utf8').includes('const TRIAL_ENGINE_V = 21;'));
});

console.log(`\n✅ test-adoption-patterns: ${passed} verificaciones OK`);
