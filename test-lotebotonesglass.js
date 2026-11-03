// LOTE BOTONES-GLASS OPCION 2 — test nuevo (solo CSS, sin tocar app.js).
// Corre con: node test-lotebotonesglass.js  (desde el dir del árbol work/)
// Compara work/public/styles.css contra ../pristine-v567/public/styles.css
// si existe; si no, usa el prístino del lote detalle-directo como fallback.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const WORK_CSS = path.join(HERE, 'public/styles.css');
let PRISTINE_CSS = path.join(HERE, '..', 'pristine-v567', 'public', 'styles.css');
if (!fs.existsSync(PRISTINE_CSS)) {
  PRISTINE_CSS = path.join(process.env.HOME, 'workspace/.lotebotonesglass-release/pristine-v567/public/styles.css');
}
const MARKER = '/* (LOTE BOTONES-GLASS';
const GRAD = 'linear-gradient(135deg, rgba(39,147,200,.28), rgba(39,147,200,.12))';
const VEIL = 'linear-gradient(rgba(255,255,255,.82), rgba(255,255,255,.82))';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const eq = (a, b, name) => ok(a === b, name + (a === b ? '' : ` (work=${JSON.stringify(a)} pristine=${JSON.stringify(b)})`));

const work = fs.readFileSync(WORK_CSS, 'utf8');
const pris = fs.readFileSync(PRISTINE_CSS, 'utf8');
const block = work.slice(work.indexOf(MARKER));
ok(work.indexOf(MARKER) >= 0, 'marcador presente en work');
ok(work.split(MARKER).length - 1 === 1, 'marcador exactamente 1 vez');
ok(!pris.includes(MARKER), 'marcador ausente en prístino');
// Todo lo anterior al bloque debe ser byte-idéntico al prístino.
eq(work.slice(0, work.indexOf(MARKER)).replace(/\s+$/, ''), pris.replace(/\s+$/, ''), 'styles fuera del bloque byte-idéntico al prístino');
// Receta exacta dentro del bloque.
for (const tok of [GRAD, 'blur(18px) saturate(1.6)', '-webkit-backdrop-filter: blur(18px) saturate(1.6)',
  'border: 1px solid rgba(255,255,255,.85)',
  'box-shadow: 0 0 0 1px rgba(39,147,200,.35), 0 10px 30px rgba(39,147,200,.35)',
  'color: #0A1E33']) ok(block.includes(tok), 'receta contiene: ' + tok);
// Familia exacta (selectores dentro del bloque).
const family = ['.hf-pmain', '.apv-accept', '.apv-primary .btn', '.pcard-accept',
  '.pcard-approve', '.pcard-actions .pcard-main', '.igmock-accept', '.hf-d-accept',
  '.hf-redo-btn', '#lightbox .lb-edit', '.pz-ropa-btn:not(.puesto)',
  '#inicioView .btn-primary', '#schedView .btn-primary', '.ana-wrap .btn-primary',
  '.ajsec .btn-primary', '.apv-wrap .btn-primary', '.scf-pop .btn-primary',
  '.hf-dcard .btn-primary', '.form-card .btn-primary', '#talkSheetOv .btn-primary',
  '#flyerSheetOv .btn-primary', '.modal-ov .btn-primary', '.pz-exp-overlay .btn-primary'];
for (const s of family) ok(block.includes(s), 'familia incluye: ' + s);
// Variante con velo para los flotantes sobre fotos.
for (const s of ['.accept-pill', '.hf-accept-bar', '.ag-upload-btn']) {
  ok(block.includes(s), 'flotante incluye: ' + s);
}
ok(block.includes(GRAD + ', ' + VEIL), 'flotantes llevan degradado + velo .82');
// Icono de Aceptar en aprobación pasa a navy.
ok(block.includes('.apv-accept .pz-ic svg') && block.includes('stroke: #0A1E33'), 'icono apv-accept a navy');
// Badge dorado intacto: misma regla en work y prístino.
const badgeRe = /\.accept-count\{[^}]*\}/;
eq((work.match(badgeRe) || [''])[0], (pris.match(badgeRe) || [''])[0], 'badge .accept-count intacto');
// Base .btn-primary intacta (el cambio vive solo en selectores scoped).
const baseRe = /\.btn-primary\{[^}]*\}/;
eq((work.match(baseRe) || [''])[0], (pris.match(baseRe) || [''])[0], 'base .btn-primary intacta');
// Exclusiones: ninguno de estos selectores aparece en el bloque.
for (const s of ['.btn-soft', '.btn-danger', '.btn-ghost', '.bb-btn', '.mz-chatbar',
  '.mz-sheet', '.hf-tab', '.mz-plus', '.hf-like', '.pz-ropa-btn.puesto',
  '.lp-', '.hero-cta', '.nav-landing']) {
  if (s === '.pz-ropa-btn.puesto') { ok(!block.includes('.pz-ropa-btn.puesto {'), 'excluido: .pz-ropa-btn.puesto como regla'); continue; }
  ok(!block.includes(s), 'excluido: ' + s);
}
// Sin cambios de layout en el bloque.
for (const p of ['position:', 'width:', 'padding:', 'font-size:', 'display:']) ok(!block.includes(p), 'bloque sin layout: ' + p);
// Contraste (luminancia relativa WCAG, aproximación de composición alfa).
function lum(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const L_NAVY = lum(10, 30, 51);
const L_CEL = lum(39, 147, 200);
const ratio = (lb) => (lb + 0.05) / (L_NAVY + 0.05);
const over = (a, lb) => a * L_CEL + (1 - a) * lb; // degradado sobre fondo lb
ok(ratio(over(0.28, 1.0)) >= 4.5, 'contraste receta exacta sobre tarjeta blanca >= 4.5 (ratio ' + ratio(over(0.28, 1.0)).toFixed(1) + ')');
const veilOverBlack = 0.28 * L_CEL + 0.72 * (0.82 * 1.0 + 0.18 * 0); // velo .82 sobre foto negra
ok(ratio(veilOverBlack) >= 4.5, 'contraste flotante con velo sobre foto negra >= 4.5 (ratio ' + ratio(veilOverBlack).toFixed(1) + ')');
ok(ratio(over(0.28, 0)) < 4.5, 'control: sin velo, sobre foto negra NO llega (documenta por qué existe el velo)');
// Solo styles.css cambia: app.js, chunks y server.js byte-idénticos.
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
const same = (rel) => {
  const w = path.join(HERE, rel), q = path.join(HERE, '..', 'pristine-v567', rel);
  const q2 = fs.existsSync(q) ? q : path.join(process.env.HOME, 'workspace/.lotebotonesglass-release/pristine-v567', rel);
  return fs.existsSync(w) && fs.existsSync(q2) && md5(w) === md5(q2);
};
for (const rel of ['public/app.js', 'server.js', 'public/chunk-analisis.js', 'public/chunk-ajustes.js'])
  ok(same(rel), 'sin cambios: ' + rel);

console.log(`lotebotonesglass: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
