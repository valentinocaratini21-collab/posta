#!/usr/bin/env node
// LOTE PERSONALIZACIÓN DE POSTEOS (6/11) — los 7 ítems.
// 1 logo siempre visible (sello en cada pieza + paleta del logo) ·
// 2 prompts por dentro (mismo producto en 3 tarjetas, 3 ángulos; el toque
//   guarda la onda y pesa en la semana) · 3 su voz (marcadores del
//   fundamento) · 4 lo que funcionó (YA ESTABA: regresión) · 5 historia del
//   producto · 6 su gente y su local (YA ESTABA: regresión) · 7 testimonios
//   solo con frase real (fail-closed).
// Reglas: nunca inventar nada (sin cita real no hay testimonio, sin logo no
// hay sello, sin datos no hay «lo que funcionó»); producto nunca cortado;
// paleta del cliente manda; prompts jamás crudos al cliente.
// Uso: node test-lote-personalizacion.js
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = __dirname;
const es = fs.readFileSync(path.join(DIR, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(DIR, 'public', 'en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const gen = fs.readFileSync(path.join(DIR, 'generator.js'), 'utf8');
const digest = fs.readFileSync(path.join(DIR, 'client-digest.js'), 'utf8');
const comp = fs.readFileSync(path.join(DIR, 'composite-headline.py'), 'utf8');
const pers = require('./personalizacion.js');
const generator = require('./generator.js');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
function count(h, s) { return h.split(s).length - 1; }
function has(h, s) { return h.indexOf(s) >= 0; }
function formatos(ideas) { return ideas.map((i) => String(i.formato || '')); }

// ---------- A) Ítem 1 — EL LOGO SIEMPRE VISIBLE ----------
console.log('A) logo siempre visible');
ok('A1: composite-headline.py acepta --logo', has(comp, "'--logo'"));
ok('A2: composite-headline.py tiene stamp_logo (medallón circular)', has(comp, 'def stamp_logo'));
ok('A3: stamp_logo es fail-open (nunca rompe la pieza)', has(comp, "except Exception:\n        return img"));
ok('A4: server.js tiene logoSealArgsForUser (6 sitios + definición)', count(srv, 'logoSealArgsForUser(uid)') === 7, count(srv, 'logoSealArgsForUser(uid)'));
ok('A5: los 6 sitios de composición empujan el sello', count(srv, '...logoSealArgsForUser(uid)') === 6, count(srv, '...logoSealArgsForUser(uid)'));
ok('A6: sin logo no hay sello (logoSealArgsForUser devuelve [])', /function logoSealArgsForUser[\s\S]{0,600}return \[\];/.test(srv));
ok('A7: el sello va como argumento --logo al compositor', has(srv, "'--logo'"));
ok('A8: digest guarda logo_url/logo_paleta/logo_file', has(digest, "logo_url: ''") && has(digest, 'logo_paleta: []') && has(digest, "logo_file: ''"));
ok('A9: buildFromParts toma logo_url de la foto de perfil del feed', has(digest, 'd.logo_url = p.feed.pic'));
ok('A10: server.js tiene logoPaletaYArchivo (paleta sacada del logo)', has(srv, 'function logoPaletaYArchivo'));
ok('A11: server.js tiene refreshLogoPaleta (barrido semanal)', has(srv, 'function refreshLogoPaleta'));
ok('A12: el logo de la prueba se renombra a logo-<userId>.png al registrarse', has(srv, "logo-${userId}.png"));
ok('A13: el barrido guarda la foto de perfil en el feed (pic)', has(srv, "pic: data.profile.pic || ''"));
ok('A14: el barrido refresca la paleta del logo si falta', has(srv, 'refreshLogoPaleta(db, uid)'));

// A15 — vivo: el sello se dibuja de verdad (píxel del medallón) y sin logo
// la pieza sale igual que antes.
(function selloVivo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pers-logo-'));
  try {
    const make = [
      'from PIL import Image, ImageDraw',
      `base = Image.new('RGB', (1080, 1350), (40, 90, 120))`,
      `ImageDraw.Draw(base).rectangle([200, 400, 880, 1000], fill=(200, 170, 90))`,
      `base.save('${tmp}/base.png')`,
      `logo = Image.new('RGB', (400, 400), (255, 140, 0))`,
      `ImageDraw.Draw(logo).ellipse([40, 40, 360, 360], fill=(10, 30, 51))`,
      `logo.save('${tmp}/logo.png')`,
    ].join('\n');
    fs.writeFileSync(tmp + '/make.py', make);
    execFileSync('python3', [tmp + '/make.py'], { timeout: 30000 });
    const py = [
      'from PIL import Image',
      `import json`,
      `def px(p, x, y):`,
      `    im = Image.open(p).convert('RGB')`,
      `    return list(im.getpixel((x, y)))`,
      `print(json.dumps({'sin': px('${tmp}/sin.png', 983, 1253), 'con': px('${tmp}/con.png', 983, 1253), 'conTit': px('${tmp}/con-tit.png', 983, 1253)}))`,
    ].join('\n');
    execFileSync('python3', [path.join(DIR, 'composite-headline.py'), '--in', tmp + '/base.png', '--out', tmp + '/sin.png'], { timeout: 30000 });
    execFileSync('python3', [path.join(DIR, 'composite-headline.py'), '--in', tmp + '/base.png', '--out', tmp + '/con.png', '--logo', tmp + '/logo.png'], { timeout: 30000 });
    execFileSync('python3', [path.join(DIR, 'composite-headline.py'), '--in', tmp + '/base.png', '--headline', 'La historia de la medialuna', '--out', tmp + '/con-tit.png', '--logo', tmp + '/logo.png'], { timeout: 30000 });
    // Logo inexistente: fail-open, no rompe.
    execFileSync('python3', [path.join(DIR, 'composite-headline.py'), '--in', tmp + '/base.png', '--headline', 'Hola', '--out', tmp + '/malo.png', '--logo', tmp + '/no-existe.png'], { timeout: 30000 });
    fs.writeFileSync(tmp + '/px.py', py);
    const out = JSON.parse(execFileSync('python3', [tmp + '/px.py'], { encoding: 'utf8' }));
    ok('A15: con --logo el medallón se dibuja (píxel = color del logo)', JSON.stringify(out.con) === JSON.stringify([10, 30, 51]), JSON.stringify(out));
    ok('A16: sin --logo la esquina queda intacta (sin sello inventado)', JSON.stringify(out.sin) === JSON.stringify([40, 90, 120]), JSON.stringify(out));
    ok('A17: el sello también se dibuja con titular', JSON.stringify(out.conTit) === JSON.stringify([10, 30, 51]), JSON.stringify(out));
    ok('A18: logo inexistente no rompe la pieza (fail-open)', fs.existsSync(tmp + '/malo.png'));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
})();

// ---------- B) Ítem 2 — PROMPTS POR DENTRO (mock v3) ----------
console.log('B) prompts por dentro / picker de onda');
const op = pers.generarOpcionesOnda({ producto: 'Remera Corteiz', precio: '$45.000', foto: 'https://x/foto.jpg', diferencial: 'hecha a mano en el taller' });
ok('B1: el picker devuelve 3 opciones', op.length === 3, op.length);
ok('B2: las 3 opciones son ángulos distintos (id)', new Set(op.map((o) => o.id)).size === 3);
ok('B3: las 3 opciones tienen chip distinto (mock v3)', new Set(op.map((o) => o.chip)).size === 3);
ok('B4: chips del mock v3 (directo, para vender / la historia / tip, para enseñar)', op[0].chip === 'directo, para vender' && op[1].chip === 'la historia' && op[2].chip === 'tip, para enseñar', op.map((o) => o.chip).join(' | '));
ok('B5: EL MISMO producto en las 3 tarjetas (mismo título/producto)', op.every((o) => String(o.titulo).includes('Remera Corteiz')), op.map((o) => o.titulo).join(' | '));
ok('B6: LA MISMA foto en las 3 tarjetas', op.every((o) => o.foto === 'https://x/foto.jpg'));
ok('B7: 3 variantes de layout (héroe / detalle / aviso, mock v3)', op.map((o) => o.variante).join(',') === 'heroe,detalle,aviso', op.map((o) => o.variante).join(','));
ok('B8: los 3 títulos tienen ≤6 palabras', op.every((o) => String(o.titulo).trim().split(/\s+/).length <= 6), op.map((o) => o.titulo).join(' | '));
ok('B9: sin producto no hay opciones (fail-closed)', pers.generarOpcionesOnda({ producto: '', foto: 'https://x/f.jpg' }).length === 0);
ok('B10: el precio no se duplica con $ ($$ nunca)', !JSON.stringify(pers.generarOpcionesOnda({ producto: 'X', precio: '$45.000', foto: 'f' })).includes('$$'));
ok('B11: la opción nunca lleva el brief interno (prompts jamás crudos)', !JSON.stringify(op).includes('briefInterno'));
ok('B12: ANGULOS_ONDA lleva el brief interno (solo para el generador)', pers.ANGULOS_ONDA.every((a) => a.briefInternoEs && a.briefInternoEn));
ok('B13: ordenarPoolPorOnda pone el ángulo elegido primero y no pierde ideas', (() => {
  const pool = [{ formato: 'Promo' }, { formato: 'Tip' }, { formato: 'Novedad' }];
  const out = pers.ordenarPoolPorOnda(pool, 'ensenar');
  return out.length === 3 && out[0].formato === 'Tip';
})());
ok('B14: server.js tiene la tabla trial_onda (el toque queda guardado)', has(srv, 'CREATE TABLE IF NOT EXISTS trial_onda'));
ok('B15: POST /api/trial/onda-opciones existe', has(srv, "'/api/trial/onda-opciones'"));
ok('B16: POST /api/trial/onda existe (guarda la elección)', has(srv, "'/api/trial/onda'"));
ok('B17: POST /api/onda existe (cuenta: guarda en el fundamento)', has(srv, "'/api/onda'"));
ok('B18: ideasInputFor lee la onda elegida del digest', has(srv, 'digest.onda_elegida'));
ok('B19: el generador ordena por la onda elegida', has(gen, 'ordenarPoolPorOnda'));
ok('B20: la prueba ES muestra el picker (ondaSec + elegir esta)', has(es, 'id="ondaSec"') && has(es, 'elegir esta') && has(es, 'seguir con esta onda'));
ok('B21: la prueba EN muestra el picker (pick this one)', has(en, 'id="ondaSec"') && has(en, 'pick this one') && has(en, 'keep this vibe'));
ok('B22: el picker pide las opciones al servidor y guarda el toque', has(es, '/api/trial/onda-opciones') && has(es, '/api/trial/onda'));
ok('B23: héroe y aviso nunca cortan el producto (object-fit: contain)', has(es, '.onda-hero img') && has(es, 'object-fit:contain'));
ok('B24: el detalle es un zoom sobre la misma foto (object-fit: cover)', has(es, '.onda-detalle img') && has(es, 'object-fit:cover'));

// ---------- C) Ítem 3 — SU VOZ ----------
console.log('C) su voz');
const voz = pers.extraerMarcadoresVoz(
  ['Amor por lo hecho a mano, amor en cada detalle', 'Hecho a mano, con amor', 'Café de especialidad y medialunas caseras'],
  ['café de especialidad de la casa']);
ok('C1: extrae marcadores reales de sus captions', voz.includes('Amor') || voz.includes('amor'), JSON.stringify(voz));
ok('C2: extrae frases de 2 palabras (hecho a mano)', voz.some((v) => /hecho a mano/i.test(v)), JSON.stringify(voz));
ok('C3: extrae la frase del rubro (café de especialidad)', voz.some((v) => /café de especialidad/i.test(v)), JSON.stringify(voz));
ok('C4: sin captions no hay marcadores', pers.extraerMarcadoresVoz([], []).length === 0);
ok('C5: lineaVoz arma la línea del brief con sus palabras', pers.lineaVoz(['Hecho a mano', 'café de especialidad'], 'es').includes('Hecho a mano'));
ok('C6: lineaVoz vacía es cadena vacía (nada inventado)', pers.lineaVoz([], 'es') === '');
ok('C7: el digest mina los marcadores de voz del feed', has(digest, 'voz_marcadores = personalizacion.extraerMarcadoresVoz'));
ok('C8: los captions usan la voz del fundamento (3 sitios)', count(srv, 'lineaVoz(') === 3, count(srv, 'lineaVoz('));
ok('C9: el generador recibe los marcadores de voz (openaiIdeas)', has(gen, 'vozMarcadores'));

// ---------- D) Ítem 4 — LO QUE FUNCIONÓ (YA ESTABA: regresión) ----------
console.log('D) lo que funcionó (ya estaba)');
ok('D1: contentPerformanceLine sigue en server.js', has(srv, 'function contentPerformanceLine'));
ok('D2: anglePerformanceFor sigue en server.js', has(srv, 'function anglePerformanceFor'));
ok('D3: tasteProfile sigue en server.js', has(srv, 'function tasteProfile'));
ok('D4: el brief de ideas lleva lo que funcionó', has(srv, 'contentPerf: contentPerformanceLine(uid)'));

// ---------- E) Ítem 5 — PRODUCTO REAL CON HISTORIA ----------
console.log('E) historia del producto');
ok('E1: historiaSlot devuelve el hueco con la historia real', (() => {
  const s = pers.historiaSlot({ r1: 'Medialuna casera', historia: 'receta de la abuela, horneada cada mañana', lang: 'es' });
  return !!s && String(s.titulo).includes('Medialuna') && String(s.angulo).includes('receta de la abuela');
})());
ok('E2: historiaSlot sin historia es null (nada inventado)', pers.historiaSlot({ r1: 'Medialuna', historia: '', lang: 'es' }) === null);
ok('E3: templateIdeas con historia trae el ángulo historia del producto', (() => {
  const ideas = generator.templateIdeas({ business: 'Café Test', category: 'cafeteria', lang: 'es', historiaProducto: 'medialuna casera, receta de la abuela' });
  return ideas.some((i) => /detr/i.test(String(i.formato)) && /medialuna/i.test(String(i.titulo || '') + ' ' + String(i.angulo || '')));
})());
ok('E4: templateIdeas sin historia no inventa historia', (() => {
  const ideas = generator.templateIdeas({ business: 'Café Test', category: 'cafeteria', lang: 'es' });
  return !ideas.some((i) => /historia del producto/i.test(String(i.titulo || '') + ' ' + String(i.angulo || '')));
})());

// ---------- F) Ítem 6 — SU GENTE Y SU LOCAL (YA ESTABA: regresión) ----------
console.log('F) su gente y su local (ya estaba)');
ok('F1: el permiso de gente existe (tabla cm_gente_permiso en cm-gente.js)', has(fs.readFileSync(path.join(DIR, 'cm-gente.js'), 'utf8'), 'CREATE TABLE IF NOT EXISTS cm_gente_permiso') && has(srv, 'cmGente.conPermisoDueno'));
ok('F2: el contexto de semana consulta el permiso de gente', has(srv, 'permisoGente'));
ok('F3: templateIdeas sigue trayendo Detrás de escena', (() => {
  const ideas = generator.templateIdeas({ business: 'Café Test', category: 'cafeteria', lang: 'es' });
  return formatos(ideas).some((f) => /detr/i.test(f));
})());

// ---------- G) Ítem 7 — TESTIMONIOS SOLO CON FRASE REAL ----------
console.log('G) testimonios');
ok('G1: testimonioSlot con cita real trae la cita textual', (() => {
  const s = pers.testimonioSlot({ citas: [{ texto: 'El mejor café del barrio, vuelvo siempre', autor: 'Ana' }], lang: 'es' });
  return !!s && String(s.angulo).includes('El mejor café del barrio');
})());
ok('G2: testimonioSlot sin citas es null (fail-closed)', pers.testimonioSlot({ citas: [], lang: 'es' }) === null);
ok('G3: templateIdeas SIN cita NO inventa cita (ninguna frase entre comillas); el reemplazo por Proceso lo hace generateIdeas (H1)', (() => {
  const ideas = generator.templateIdeas({ business: 'Café Test', category: 'cafeteria', lang: 'es' });
  return ideas.length === 7 && !ideas.some((i) => /"[^"]{8,}"/.test(String(i.titulo || '') + ' ' + String(i.angulo || '')));
})());
ok('G4: templateIdeas CON cita trae Testimonio con la frase real', (() => {
  const ideas = generator.templateIdeas({ business: 'Café Test', category: 'cafeteria', lang: 'es', testimonioCitas: [{ texto: 'El mejor café del barrio, vuelvo siempre', autor: 'Ana' }] });
  return ideas.some((i) => /testimoni/i.test(String(i.formato)) && /El mejor café del barrio/.test(String(i.angulo || '')));
})());
ok('G5: server.js lee las citas reales para el brief', has(srv, 'function citasRealesParaBrief'));
ok('G6: el brief de ideas lleva las citas reales', has(srv, 'testimonioCitas = citasRealesParaBrief(db, uid)'));

// ---------- H) generateIdeas (pipeline completa, sin IA) ----------
console.log('H) generateIdeas sin IA');
(async () => {
  const base = { business: 'Café Test', category: 'cafeteria', lang: 'es' };
  const sinCita = await generator.generateIdeas(base, null);
  ok('H1: generateIdeas sin cita devuelve 7 ideas sin Testimonio', sinCita.length === 7 && !formatos(sinCita).some((f) => /testimoni/i.test(f)), formatos(sinCita).join(','));
  const conCita = await generator.generateIdeas({ ...base, testimonioCitas: [{ texto: 'El mejor café del barrio, vuelvo siempre', autor: 'Ana' }] }, null);
  ok('H2: generateIdeas con cita trae Testimonio con la frase real', conCita.some((i) => /testimoni/i.test(String(i.formato)) && /El mejor café del barrio/.test(String(i.angulo || ''))));
  const onda = await generator.generateIdeas({ ...base, ondaElegida: 'ensenar' }, null);
  ok('H3: generateIdeas con onda=ensenar pone el Tip primero', onda.length === 7 && /tip/i.test(String(onda[0].formato || '')), formatos(onda).join(','));
  const hist = await generator.generateIdeas({ ...base, historiaProducto: 'medialuna casera, receta de la abuela' }, null);
  ok('H4: generateIdeas con historia trae el ángulo historia del producto', hist.some((i) => /medialuna/i.test(String(i.titulo || '') + ' ' + String(i.angulo || ''))));
  const enIdeas = await generator.generateIdeas({ business: 'Test Cafe', category: 'cafeteria', lang: 'en', testimonioCitas: [{ texto: 'Best coffee in the neighborhood', autor: 'Ana' }] }, null);
  ok('H5: EN también trae Testimonio con la cita real', enIdeas.some((i) => /testimonial/i.test(String(i.formato)) && /Best coffee in the neighborhood/.test(String(i.angulo || ''))));

  console.log(`\n${pass} ok · ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
