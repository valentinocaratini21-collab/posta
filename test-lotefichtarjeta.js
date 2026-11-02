// test-lotefichtarjeta.js — LOTE FIX TARJETA ROTA (captura Valentino 1/11 21:08)
// Uso: node test-lotefichtarjeta.js  (desde la raíz del árbol)
// La tarjeta grande réplica de Instagram (weekCardHTML / igmock-fixed) de
// un posteo PROGRAMADO mostraba en su fila superior, en vez del ícono,
// el código del ícono como texto literal («<span class="pz-ic" st…»),
// y el posteo carrusel no se podía deslizar (weekCardHTML nunca leía
// carousel_paths). Además: la capa .scf-pop desbordaba el viewport del
// teléfono y el botón de recorte se veía como óvalo oscuro.
// El marco azul grueso de la captura NO es del código (ver STATUS.md):
// ningún CSS da un marco azul a la capa ni a la tarjeta; es markup
// dibujado sobre la captura. No se cambia nada por ese ítem.
// Alcance: solo app.js + styles.css. Sin tocar server.js, precios,
// fechas, Gesty, aprobación, caption ni foto.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
// Extrae un const objeto con balanceo de llaves (ignora strings).
function extractConstObj(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  let i = src.indexOf('{', a), depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === q && src[j - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (!depth) return src.slice(a, j + 1); }
  }
  return '';
}

/* ---------- 1. Estructura ---------- */
console.log('— estructura: split ícono/texto, carrusel, capa, botón —');
ok(app.includes('labelIcon') && app.includes('labelText'), 'weekCardHTML separa ícono (HTML) de texto (escapado)');
ok(app.includes('<div class="igmock-when-top"><span>${labelIcon}${esc(whenTxt)}'), 'when-top renderiza ícono real + texto escapado');
ok(!app.includes("${prop.iso ? pzIc('calendar', 15) + ' ' : ''}${esc(whenTxt)}"), 'el render viejo (todo escapado) ya no existe');
ok(app.includes('carSlides') && app.includes('carousel_paths'), 'weekCardHTML lee carousel_paths');
ok(app.includes('igmock-media-car') && app.includes('hf-d-track') && app.includes('hf-d-count'), 'rama carrusel con track + contador + puntitos');
ok(app.includes("t.closest('.igmock')") && app.includes("classList.contains('hf-d-track')"), 'sync carrusel delegado global, solo dentro de .igmock');
ok(css.includes('env(safe-area-inset-top'), 'la capa .scf-pop usa safe areas');
ok(css.includes('.scf-pop .igmock{') && css.includes('flex:1 1 auto'), 'la tarjeta de la capa scrollea dentro (flex:1 1 auto)');
ok(css.includes('.hf-crop-mini{') && css.includes('flex:none'), 'el botón de recorte nunca se aprieta (flex:none)');
// (LOTE CARRUSEL-DETALLE 2/11 · SUPERSEDE CON CAUSA: el pan-x pan-y
// obligaba a iOS a adivinar la dirección dentro de la tarjeta que
// scrollea en vertical y el horizontal se perdía; ahora es pan-x
// solo: el horizontal va al track sin ambigüedad y el vertical sigue
// a la tarjeta. El overscroll contain intacto.)
ok(css.includes('.igmock-media-car .hf-d-track{touch-action:pan-x;overscroll-behavior-x:contain}'), 'el track no encadena al riel y admite solo pan-x (carrusel-detalle)');
ok(css.includes('.igmock-media-car .hf-d-slide img{') && css.includes('aspect-ratio:4/5;object-fit:cover'), 'el slide se ve igual que la foto simple (4:5 cover)');

/* ---------- 2. Render real en vm ---------- */
console.log('— render: ícono real, fecha intacta, carrusel —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const celLine = app.split('\n').find((l) => l.startsWith('const PZ_IC_CEL'));
const pzIcFn = extractFn(app, 'function pzIc');
const pzIcObj = extractConstObj(app, 'const PZ_IC = ');
const hwl = extractFn(app, 'function homeWhenLabel');
const plf = extractFn(app, 'function proposedLabelFor');
const wc = extractFn(app, 'function weekCardHTML');
ok(!!escLine && !!celLine && !!pzIcFn && !!pzIcObj && !!hwl && !!plf && !!wc, 'extrae esc + pzIc real + homeWhenLabel + proposedLabelFor + weekCardHTML');
const ctx = {
  console,
  LP_WEEK_ICONS: '',
  hfAskChangeBtnHTML: () => '',
  pcParseDate: () => null,
  pcFmtDayLong: () => '',
  igRelTime: () => '',
};
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + celLine + '\n' + pzIcObj + '\n' + pzIcFn + '\n' + hwl + '\n' + plf + '\n' + wc, ctx);
const { proposedLabelFor, weekCardHTML, homeWhenLabel, pzIc } = ctx;
const TZ = 'America/Argentina/Buenos_Aires';
const whenTop = (html) => {
  const a = html.indexOf('<div class="igmock-when-top">');
  if (a < 0) return '';
  return html.slice(a, html.indexOf('</div>', a) + 6);
};
const noLiteral = (wt, label) => {
  ok(!wt.includes('&lt;span') && !wt.includes('&quot;pz-ic&quot;'), label + ': sin código de ícono como texto literal');
  ok(wt.includes('<span class="pz-ic"'), label + ': ícono renderizado como HTML real');
};

// R1: programado (el caso de la captura).
const p1 = { id: 101, status: 'scheduled', scheduled_at: '2026-11-05T22:00:00.000Z', image_path: '/media/p1.jpg', caption: 'Hola test', hashtags: '#test', media_type: 'image' };
const prop1 = proposedLabelFor(p1, new Map(), TZ);
const r1 = weekCardHTML(p1, { bizName: 'Test', tz: TZ, prop: prop1 });
const w1 = whenTop(r1);
const fecha1 = homeWhenLabel(p1.scheduled_at);
ok(!!w1, 'R1 when-top presente (programado)');
noLiteral(w1, 'R1');
ok(w1.includes(fecha1), 'R1 fecha real intacta: ' + fecha1);
ok(w1.includes('Programado'), 'R1 pastilla «Programado» intacta');
ok(w1.includes('hf-crop-tog hf-crop-mini'), 'R1 botón de recorte mini intacto');

// R2: borrador sin iso (pencil + «Borrador»).
const p2 = { id: 102, status: 'draft', image_path: '/media/p2.jpg', caption: 'Borrador', media_type: 'image' };
const r2 = weekCardHTML(p2, { bizName: 'Test', tz: TZ, prop: proposedLabelFor(p2, new Map(), TZ) });
const w2 = whenTop(r2);
noLiteral(w2, 'R2');
ok(w2.includes('Borrador'), 'R2 texto «Borrador» intacto');

// R3: borrador con iso (ícono calendario + fecha propuesta).
const p3 = { id: 103, status: 'draft', image_path: '/media/p3.jpg', caption: 'Borrador', media_type: 'image' };
const prop3 = proposedLabelFor(p3, new Map([[103, { iso: '2026-11-06T19:00:00' }]]), TZ);
const r3 = weekCardHTML(p3, { bizName: 'Test', tz: TZ, prop: prop3 });
const w3 = whenTop(r3);
ok(w3.includes('<span class="pz-ic"') && w3.includes('19:00'), 'R3 ícono calendario + hora propuesta');
ok(!w3.includes('&lt;span'), 'R3 sin texto literal escapado');

// R4: publicado (checkCircle + fecha, pastilla «Publicado»).
const p4 = { id: 104, status: 'published', published_at: '2026-11-01T18:00:00.000Z', scheduled_at: '2026-11-01T18:00:00.000Z', image_path: '/media/p4.jpg', caption: 'Pub', media_type: 'image' };
const prop4 = { label: pzIc('checkCircle', 14) + ' ' + homeWhenLabel(p4.published_at), iso: null };
const r4 = weekCardHTML(p4, { bizName: 'Test', tz: TZ, prop: prop4 });
const w4 = whenTop(r4);
noLiteral(w4, 'R4');
ok(w4.includes('Publicado'), 'R4 pastilla «Publicado» intacta');

// R5: vista Día + programado (etiqueta corta, sin mes, sin literal).
const r5 = weekCardHTML(p1, { bizName: 'Test', tz: TZ, prop: prop1, dia: true });
const w5 = whenTop(r5);
noLiteral(w5, 'R5');
const diaEsperado = fecha1.replace(/^(\S+)\s+[^·]*·\s*/, '$1 ');
ok(w5.includes(diaEsperado) && !w5.includes('jue 5'), 'R5 Día: etiqueta corta (' + diaEsperado + ', sin día numérico)');

// R6: carrusel de 3 (portada + 2): track, puntitos, contador, lightbox por slide.
const p6 = { id: 105, status: 'scheduled', scheduled_at: '2026-11-05T22:00:00.000Z', image_path: '/media/cover.jpg', carousel_paths: JSON.stringify(['/media/s2.jpg', '/media/s3.jpg']), caption: 'Car', hashtags: '#c', media_type: 'carousel' };
const r6 = weekCardHTML(p6, { bizName: 'Test', tz: TZ, prop: proposedLabelFor(p6, new Map(), TZ) });
ok((r6.match(/hf-d-slide/g) || []).length === 3, 'R6 3 slides en el track');
ok(r6.includes('<div class="igmock-media igmock-media-car">'), 'R6 media carrusel en div (no botón)');
ok(r6.includes('<span class="hf-d-count">1/3</span>'), 'R6 contador 1/3');
const dots6 = r6.slice(r6.indexOf('<div class="hf-d-dots">'), r6.indexOf('</div>', r6.indexOf('<div class="hf-d-dots">')) + 6);
ok((dots6.match(/<i /g) || []).length === 3 && dots6.includes('<i class="on">'), 'R6 3 puntitos, primero activo');
for (const s of ['/media/cover.jpg', '/media/s2.jpg', '/media/s3.jpg'])
  ok(r6.includes('data-lightbox="' + s + '"'), 'R6 slide con su propio lightbox: ' + s);
ok(r6.includes('data-post="105"'), 'R6 slides con data-post del posteo');

// R7: carrusel con la portada repetida en paths (sin duplicar).
const p7 = Object.assign({}, p6, { id: 106, carousel_paths: JSON.stringify(['/media/cover.jpg', '/media/s2.jpg']) });
const r7 = weekCardHTML(p7, { bizName: 'Test', tz: TZ, prop: proposedLabelFor(p7, new Map(), TZ) });
ok((r7.match(/hf-d-slide/g) || []).length === 2, 'R7 portada duplicada en paths no duplica slide');
ok(r7.includes('<span class="hf-d-count">1/2</span>'), 'R7 contador 1/2');

// R8: foto simple sigue EXACTAMENTE igual (botón, sin track ni puntitos).
const p8 = { id: 107, status: 'scheduled', scheduled_at: '2026-11-05T22:00:00.000Z', image_path: '/media/solo.jpg', caption: 'Solo', media_type: 'image' };
const r8 = weekCardHTML(p8, { bizName: 'Test', tz: TZ, prop: proposedLabelFor(p8, new Map(), TZ) });
ok(!r8.includes('hf-d-track') && !r8.includes('hf-d-dots') && !r8.includes('hf-d-count'), 'R8 foto simple: sin track ni puntitos ni contador');
ok(r8.includes('<button type="button" class="igmock-media" data-lightbox="/media/solo.jpg"'), 'R8 foto simple: botón con su lightbox intacto');

// R9: video con carousel_paths (rama video intacta, sin track).
const p9 = { id: 108, status: 'scheduled', scheduled_at: '2026-11-05T22:00:00.000Z', image_path: '/media/v.mp4', carousel_paths: JSON.stringify(['/media/s2.jpg']), caption: 'Vid', media_type: 'video' };
const r9 = weekCardHTML(p9, { bizName: 'Test', tz: TZ, prop: proposedLabelFor(p9, new Map(), TZ) });
ok(r9.includes('<video') && !r9.includes('hf-d-track'), 'R9 video: rama video intacta, sin track');

// R10: borrador creándose (sin imagen): arte pending, sin track.
const p10 = { id: 109, status: 'draft', caption: '', media_type: 'image' };
const r10 = weekCardHTML(p10, { bizName: 'Test', tz: TZ, prop: proposedLabelFor(p10, new Map(), TZ) });
ok(r10.includes('pcard-pending-art') && !r10.includes('hf-d-track'), 'R10 creando: arte pending, sin track');

// R11: el caption y la foto no se tocan.
ok(r1.includes('Hola test') && r1.includes('/media/p1.jpg'), 'R11 caption y foto intactos (programado)');
ok(r6.includes('Car') && r6.includes('/media/cover.jpg'), 'R11 caption y portada intactos (carrusel)');

/* ---------- 3. Censo (debe ser idéntico al pre) ---------- */
console.log('— censo: sin cambios —');
const cnt = (s, re) => (s.match(re) || []).length;
ok(cnt(server, /catsMatch/g) === 3, 'server catsMatch 3');
ok(cnt(server, /week-redo/g) === 16, 'server week-redo 16');
ok(cnt(server, /first_week/g) === 3, 'server first_week 3');
ok(cnt(server, /\/aprobar/g) === 16, 'server /aprobar 16');
ok(cnt(app, /\/aprobar/g) === 1, 'app /aprobar 1');
ok(cnt(app, /pzGoBack/g) === 4, 'app pzGoBack 4');
ok(cnt(app, /pz-detalle-setup/g) === 1, 'app pz-detalle-setup 1');
ok(cnt(app, /autofetch/g) === 0, 'app autofetch 0');
ok(cnt(app, /pcDayKeyShift/g) === 7, 'app pcDayKeyShift 7');

console.log(`\n${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
