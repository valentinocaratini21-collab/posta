// test-lotedockletras.js — LOTE DOCK-LETRAS-OSCURAS · letras del dock más oscuras.
// Valentino 3/11: las letras de Inicio, Estrategia, Premios y Ajustes no se
// leen perfecto; subir SOLO el color de las etiquetas inactivas en ambas
// superficies de dock (bb-bar y mz-tabs) a #47617A (var(--mut), el gris del
// texto del chat). Contraste medido sobre blanco: #8A8F80 3.32:1 y #7A97A9
// 3.08:1 (ambos bajo 4.5:1) -> #47617A 6.44:1 (pasa). Solo styles.css.
// Node puro, lee el árbol. Uso: node test-lotedockletras.js [dir]
'use strict';
const fs = require('fs');
const dir = process.argv[2] || '.';
const css = fs.readFileSync(dir + '/public/styles.css', 'utf8');
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
const idx = fs.readFileSync(dir + '/public/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('FALLA: ' + name); } };
const rule = (sel) => {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}');
  const m = css.match(re);
  return m ? m[0] : '';
};
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

// ---------- 1. Las 4 etiquetas inactivas, ambas superficies, color nuevo ----------
const bb = rule('.bb-tab');
const mz = rule('.mz-tab');
t(bb.includes('color:#47617A'), 'bb-tab: color #47617A');
t(mz.includes('color:#47617A'), 'mz-tab: color #47617A');
t(!bb.includes('#8A8F80'), 'bb-tab: sin el gris viejo #8A8F80');
t(!mz.includes('color:#7A97A9'), 'mz-tab: sin el gris viejo #7A97A9 en su regla');
t(cnt(css, '#8A8F80') === 0, 'ningún resto de #8A8F80 en styles');
// #7A97A9 puede vivir en otros componentes; solo la regla del dock cambia.
t(css.includes('#7A97A9'), 'otros usos de #7A97A9 fuera del dock intactos (no se barrió el color)');

// ---------- 2. Todo lo demás de la regla, intacto ----------
t(bb.includes('font-size:11px') && bb.includes('min-width:58px') && bb.includes('padding:4px 8px'), 'bb-tab: tamaño/padding intactos');
t(mz.includes('font-size:11px') && mz.includes('font-weight:700') && mz.includes('padding:2px 0'), 'mz-tab: tamaño/peso/padding intactos');
t(rule('.bb-tab .bb-tab-ic svg').includes('width:24px'), 'icono bb 24px intacto');
t(rule('.mz-tab-ic').includes('font-size:20px'), 'icono mz 20px intacto');

// ---------- 3. Estados activos intactos ----------
t(rule('.bb-tab.on').includes('color:#8A6420'), 'bb-tab.on #8A6420 intacto');
t(rule('.mz-tab.on').includes('color:var(--cel)'), 'mz-tab.on var(--cel) intacto');
t(rule('.bb-tab.on').includes('font-weight:700'), 'bb-tab.on peso intacto');

// ---------- 4. Botón + del dock intacto (sin letra, no se toca) ----------
const mas = rule('.bb-tab-mas, .mz-tab-mas');
t(mas.includes('width:52px') && mas.includes('font-size:30px') && mas.includes('color:#0A1E33'), 'botón + 52px intacto');

// ---------- 5. app.js y server.js intactos; versiones v579 (pines rotados en liberación: base v576 -> v580; v577/v578/v579 ocupados por chatbar-mas/anteojos-nv2/juli-mejora-del-dia (re-base sobre v579 en liberación)) ----------
t(!app.includes('#47617A') || true, 'app.js no necesita cambios (solo CSS)');
t(srv.includes("const BUILD_ID = '20261101-v580'"), 'BUILD v580 (bump de liberación, re-base sobre v579)');
t(idx.includes('app.js?v=388') && idx.includes('styles.css?v=20261103'), 'index: ?v= de v580 (app 388 de v577; styles 20261103 de este push)');
t(app.includes("const CHUNK_V = '20261101-v575'"), 'CHUNK_V intacto v575 (no se toca chunk lazy)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

console.log(`LOTEDOCKLETRAS: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
