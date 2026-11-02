// test-loteglasstodas.js — LOTE GLASS TODAS (decisión Valentino 2/11 05:20)
// Uso: node test-loteglasstodas.js [dir]  (dir = raíz del árbol; default: __dirname)
// TODAS las pantallas de la app en vidrio con la receta v519 exacta (.55 + blur 16px
// saturate 1.4 + borde blanco .75 + sombra) y el degradado de Inicio detrás.
// Fotos y visuales SIN vidrio: el blur actúa sobre lo que hay DETRÁS del panel,
// nunca sobre la foto. Perfil .40 (v537) es EXCEPCIÓN DELIBERADA y no se toca;
// Jardín/Estrategia/Ajustes (v539) intactos; chat principal lo hace chat-pantalla.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const blockStart = css.indexOf('/* (LOTE GLASS TODAS');
const block = blockStart >= 0 ? css.slice(blockStart) : '';
// Solo las reglas (después del comentario del encabezado), para que el comentario
// que documenta lo NO tocado no contamine los asserts de "no tocado".
const blockRules = blockStart >= 0 ? css.slice(css.indexOf('*/', blockStart) + 2) : '';

console.log('— 1. Shell: bb-glass-pantallas en TODAS las tabs de la app —');
const shellLine = (app.match(/bb-glass-pantallas' : ''\}\)">/) || [])[0];
const shellCond = app.slice(app.indexOf('bb-glass-inicio'), app.indexOf('bb-glass-inicio') + 600);
for (const t of ['jardin-posty', 'analisis', 'ajustes', 'schedule', 'bandeja', 'post', 'numeros', 'dogfood', 'onboarding', 'ads', 'admin'])
  ok(shellCond.includes(`tab === '${t}'`), `bbShell incluye tab '${t}'`);
ok(!!shellLine || shellCond.includes('bb-glass-pantallas'), 'condición bb-glass-pantallas presente');

console.log('— 2. Fondos con el degradado de Inicio detrás —');
ok(block.includes('.app-shell, .hf-dback, body:has(.form-card){background:radial-gradient(260px 260px at 85% -60px,rgba(39,147,200,.28)'), 'gradiente en .app-shell (desktop), .hf-dback (detalle) y body:has(.form-card) (auth)');
ok(block.includes('linear-gradient(165deg,#dff1fa 0%,#eef9fd 30%,#fdf9ec 62%,#fdeec2 100%)'), 'degradado exacto de Inicio (165deg celeste→dorado)');

console.log('— 3. Paneles en vidrio receta v519 (.55) —');
const panels = ['.sched-col', '.bb-bcard', '.bb-bloque:not(.bb-bloque-top)', '.bb-libre', '.apv-wrap .card', '.hf-dcard', '.form-card', '.st-card', '.st-wrap .card', '.ob-wrap .card', '.ads-wrap .card', '.ads-wrap .ads-rec', '#adminCard'];
const panelLine = (block.split('\n').find(l => l.includes('.sched-col, .bb-bcard')) || '');
for (const p of panels) ok(panelLine.includes(p), `panel en vidrio: ${p}`);
ok(panelLine.includes('background:rgba(255,255,255,.55)') && panelLine.includes('backdrop-filter:blur(16px) saturate(1.4)') && panelLine.includes('border:1px solid rgba(255,255,255,.75)') && panelLine.includes('box-shadow:0 8px 24px rgba(10,30,51,.10)'), 'receta v519 exacta (.55 + blur 16px saturate 1.4 + borde .75 + sombra)');
ok(block.includes('.sched-col.today{border:2px solid var(--cel);box-shadow:0 8px 24px rgba(39,147,200,.20)}'), 'columna HOY conserva borde celeste 2px + sombra (señal intacta)');
ok(block.includes('.mz-tabs{background:rgba(255,255,255,.55)'), 'barra .mz-tabs (web móvil) en vidrio');

console.log('— 4. Envoltorios nuevos en app.js —');
ok(app.includes('<div class="ob-wrap">'), 'onboardingView envuelve en .ob-wrap (3 variantes)');
ok(app.includes('<div class="ads-wrap">'), 'adsView envuelve en .ads-wrap');

console.log('— 5. NO tocado: lo ya en vidrio, navy/celeste, fotos, .card global —');
ok(css.includes('#inicioView .hf-head{background:rgba(255,255,255,.40)'), 'perfil .40 (v537) INTACTO, nunca vuelve a .55');
ok(css.includes('.bb-app.bb-glass-pantallas .mx-jardin-posty .mx-tarjeta') && css.includes('.bb-app.bb-glass-pantallas .ana-card') && css.includes('.bb-app.bb-glass-pantallas .card.ajsec'), 'v539 intacto (jardín, estrategia, ajustes)');
ok(css.includes('#inicioView.hf-wrap{background:radial-gradient'), 'gradiente de Inicio intacto');
ok(css.includes('.ana-verdict{background:#2793C8'), 'banner ana-verdict sigue sólido celeste (no se vidria)');
ok(!/\.card\{[^}]*backdrop-filter/.test(block), 'ninguna regla .card global con vidrio (solo .card con ámbito: apv/ob/ads/st)');
ok(!/(hf-d-media|apv-media|igmock-media|\.pcard|img)/.test(panelLine), 'ninguna foto ni mini-tarjeta en la lista de vidrio');
ok(!blockRules.includes('scf-pop'), 'pop de semana .scf-pop NO tocado (preview transitorio, no pantalla)');
ok(server.includes("const BUILD_ID = '20261101-v546'"), 'server.js sin tocar (BUILD v546 tras el bump de liberación (pin rotado desde v542 con causa: re-base a v545 + bump v546; el parche no toca server.js))');

console.log('— 6. Contraste re-medido (misma receta aprobada en Inicio) —');
// Composición: panel .55 blanco sobre cada parada del degradado y sobre los glows.
function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function comp(fg, bg, a) { return fg.map((c, i) => Math.round(a * c + (1 - a) * bg[i])); }
function lum(rgb) {
  const s = rgb.map(c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}
function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
const WHITE = [255, 255, 255], NAVY = hexRgb('#0A1E33'), GRAY = hexRgb('#47617A'), CELESTE = [39, 147, 200], DORADO = [254, 193, 77];
const stops = ['#dff1fa', '#eef9fd', '#fdf9ec', '#fdeec2'];
for (const s of stops) {
  const bg = comp(WHITE, hexRgb(s), 0.55);
  const rn = ratio(NAVY, bg), rg = ratio(GRAY, bg);
  console.log(`    parada ${s}: navy ${rn.toFixed(2)}:1, gris ${rg.toFixed(2)}:1`);
  ok(rn >= 7 && rg >= 4.5, `contraste sobre ${s}: navy ≥7 y gris ≥4.5`);
}
// Peor caso: glow celeste .28 sobre la parada más clara, luego panel .55.
const glowBg = comp(CELESTE, hexRgb('#dff1fa'), 0.28);
const glowPanel = comp(WHITE, glowBg, 0.55);
const rnG = ratio(NAVY, glowPanel), rgG = ratio(GRAY, glowPanel);
console.log(`    glow celeste: navy ${rnG.toFixed(2)}:1, gris ${rgG.toFixed(2)}:1 (banda conocida v537, no regresión: Inicio ya la tiene)`);
ok(rnG >= 7, 'navy ≥7 incluso sobre el glow');
ok(rgG >= 3.5, 'gris ≥3.5 sobre el glow (documentado, igual que Inicio v537)');

console.log(`\nTOTAL: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
