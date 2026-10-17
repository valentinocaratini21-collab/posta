// test-lp-week.js — v186 PARTE B: la semana de la landing NUNCA repite foto.
//
// Bug real (visto por Valentino en producción): la semana de Mascotas
// mostraba LA MISMA foto (el perro con toalla) en Lun y Mar, porque
// ig-mascotas.jpg y gt-petshop-2.jpg son la misma foto en dos archivos
// (recorte vertical 900×1125 vs cuadrado 600×600 del mismo original).
// La unicidad por nombre de archivo NO alcanza: hay que comparar CONTENIDO.
//
// Este test:
//  1. AUDITORÍA DE DATOS: extrae LP_WEEK de public/app.js, calcula hashes
//     perceptuales (ahash, vía PIL) de todas las fotos de las semanas y de
//     los pools, agrupa las que son LA MISMA foto y exige que las 5 fotos
//     crudas de cada modo sean 5 fotos distintas.
//  2. GARANTÍA DE RENDER: ejecuta lpWeekCards(key) (la función real que usa
//     lpWeekSet) para los 7 modos y exige 5 identidades distintas, incluso
//     si mañana la data vuelve a traer un duplicado (dedupe con pool).
//
// Sin IA paga. Requiere python3 + PIL (el mismo runtime del render del demo).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

const PUBLIC = path.join(__dirname, 'public');
const appSrc = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');

// ---------- Extracción del bloque LP_WEEK* de app.js ----------
function extractBlock() {
  const start = appSrc.indexOf('const LP_WEEK = {');
  const end = appSrc.indexOf('function lpWeekCardHTML');
  if (start < 0 || end < 0 || end <= start) return null;
  const code = appSrc.slice(start, end);
  try {
    return new Function(`${code}; return { LP_WEEK: typeof LP_WEEK !== 'undefined' ? LP_WEEK : null, lpWeekCards: typeof lpWeekCards !== 'undefined' ? lpWeekCards : null };`)();
  } catch (e) {
    console.error('  (no se pudo evaluar el bloque LP_WEEK:', e.message + ')');
    return null;
  }
}

// ---------- Hash perceptual vía PIL (full + recorte cuadrado) ----------
function photoGroups(files) {
  const py = `
import sys, json
from PIL import Image
def ahash(im):
    im = im.resize((8, 8), Image.LANCZOS)
    px = list(im.getdata()); avg = sum(px) / 64.0
    return ''.join('1' if p > avg else '0' for p in px)
def ham(a, b): return sum(1 for x, y in zip(a, b) if x != y)
H = {}
for f in json.loads(sys.argv[1]):
    try:
        im = Image.open(f).convert('L')
        w, h = im.size; s = min(w, h)
        sq = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
        H[f] = (ahash(im), ahash(sq))
    except Exception:
        pass
names = sorted(H)
parent = {n: n for n in names}
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        a, b = names[i], names[j]
        if min(ham(H[a][0], H[b][0]), ham(H[a][1], H[b][1])) <= 6:
            ra, rb = find(a), find(b)
            if ra != rb: parent[max(ra, rb)] = min(ra, rb)
print(json.dumps({n: find(n) for n in names}))
`;
  const out = execFileSync('python3', ['-c', py, JSON.stringify(files)], { maxBuffer: 8 * 1024 * 1024 }).toString();
  const map = JSON.parse(out);
  const byBase = {};
  for (const [abs, g] of Object.entries(map)) byBase[path.basename(abs)] = path.basename(g);
  return byBase;
}

const block = extractBlock();
ok(!!(block && block.LP_WEEK), 'LP_WEEK extraído de app.js');
if (block && block.LP_WEEK) {
  const { LP_WEEK } = block;
  const MODES = ['mixto', 'cafeteria', 'barberia', 'moda', 'belleza', 'mascotas', 'fitness'];

  // Archivos a hashear: los de las 7 semanas + los pools completos.
  const weekSrcs = {};
  for (const key of MODES) {
    const d = LP_WEEK[key];
    weekSrcs[key] = key === 'mixto' ? d.cards.map((c) => c.img) : d.imgs.slice();
  }
  const poolFiles = fs.readdirSync(PUBLIC).filter((f) =>
    /^(ig-.+\.jpg|g-.+\.jpg|gt-(elcorte|tiendacora|esteticaalma|petshop|gymnorte|cafemartinez)-\d+\.jpg)$/.test(f));
  const allFiles = [...new Set([...Object.values(weekSrcs).flat(), ...poolFiles])];
  const groups = photoGroups(allFiles.map((f) => path.join(PUBLIC, f)));
  const identity = (src) => groups[src] || src;

  // ---------- 1. Auditoría de datos crudos ----------
  console.log('— Auditoría de datos (fotos crudas de cada semana):');
  for (const key of MODES) {
    const ids = weekSrcs[key].map(identity);
    const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
    ok(dup.length === 0, `${key}: 5 fotos distintas en la data${dup.length ? ' — DUPLICADA: ' + dup.join(', ') + ' en [' + weekSrcs[key].join(', ') + ']' : ''}`);
  }

  // ---------- 2. Garantía de render (lpWeekCards) ----------
  console.log('— Garantía de render (lpWeekCards):');
  ok(typeof block.lpWeekCards === 'function', 'lpWeekCards existe en app.js');
  if (typeof block.lpWeekCards === 'function') {
    for (const key of MODES) {
      const cards = block.lpWeekCards(key);
      ok(Array.isArray(cards) && cards.length === 5, `${key}: lpWeekCards devuelve 5 tarjetas`);
      const ids = cards.map((c) => identity(c.img));
      const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
      ok(dup.length === 0, `${key}: render sin fotos repetidas${dup.length ? ' — DUPLICADA: ' + dup.join(', ') : ''}`);
      // Las tarjetas conservan usuario/alt coherentes (no quedaron huérfanas).
      ok(cards.every((c) => c.u && c.img && c.alt), `${key}: tarjetas completas (usuario, foto, alt)`);
    }
    // Robustez: aun con una data adulterada (duplicado a propósito), el
    // render tiene que resolverlo desde el pool.
    const masc = LP_WEEK.mascotas;
    const origImgs = masc.imgs.slice();
    masc.imgs = [origImgs[0], origImgs[0], origImgs[2], origImgs[3], origImgs[4]];
    const fixed = block.lpWeekCards('mascotas');
    const fids = fixed.map((c) => identity(c.img));
    ok(new Set(fids).size === 5, 'mascotas con data adulterada: el dedupe rescata 5 fotos distintas desde el pool');
    masc.imgs = origImgs;
  }
}

console.log(fails ? `\n❌ test-lp-week: ${fails} fallas` : '\n✅ test-lp-week: todo OK');
process.exit(fails ? 1 : 0);
