#!/usr/bin/env node
// PALETA HEREDADA DEL FEED — criterio v202.
// El criterio viejo (hex exacto + bonus de saturación) agarraba el color
// más vivo de UNA foto suelta: @starbucks salía rosa (un refresher) y
// @adidas rojo (una zapatilla). El nuevo agrupa por cercanía ANTES de
// contar, exige recurrencia entre fotos o dominancia clara, y si el feed
// no tiene color de marca devuelve null (fallback a perfil/rubro).
// Casos sintéticos (PNG generados con PIL acá mismo):
//  (a) marca repetida con hex levemente distinto en 2 fotos + producto
//      muy vivo en 1 → gana la marca, no el producto.
//  (b) ningún color repetido ni dominante → null.
//  (c) un solo color domina el color vivo del feed → ese.
//  (d) accent recurrente + segundo color recurrente → btn distinguible.
//  (e) sin buffers / buffer basura → null, sin explotar.
//  (f) el extractor clásico de 2 colores (logos) no cambió.
// Uso: node test-demo-palette.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const demo = require('./demo');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✓' : '✗ FALLO') + ' ' + msg); if (!cond) fails++; };

const dist = (a, b) => {
  const A = [0, 1, 2].map((i) => parseInt(a.slice(1 + i * 2, 3 + i * 2), 16));
  const B = [0, 1, 2].map((i) => parseInt(b.slice(1 + i * 2, 3 + i * 2), 16));
  return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
};

const PY = `
import json, sys
from PIL import Image, ImageDraw
specs = json.load(sys.stdin)
for spec in specs:
    im = Image.new('RGB', (120, 120))
    dr = ImageDraw.Draw(im)
    x = 0
    for hexcol, w in spec['bands']:
        rgb = tuple(int(hexcol[i:i+2], 16) for i in (1, 3, 5))
        dr.rectangle([x, 0, x + w - 1, 119], fill=rgb)
        x += w
    im.save(spec['path'])
`;

const NEUTRO = '#93A5B4'; // sat ~0.18: color apagado, nunca "vivo"
const VERDE_A = '#0B6E4F';
const VERDE_B = '#0E7352'; // mismo verde de marca, hex apenas distinto
const ROSA = '#E84393';
const TURQUESA = '#00B894';
const AMARILLO = '#F9C00E';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-palette-test-'));
  const mk = (name, bands) => {
    const p = path.join(dir, name + '.png');
    execFileSync('python3', ['-c', PY], { input: JSON.stringify([{ path: p, bands }]) });
    return fs.readFileSync(p);
  };

  // ---------- (a) la marca repetida le gana al producto vivo ----------
  const a1 = mk('a1', [[VERDE_A, 84], [NEUTRO, 36]]);
  const a2 = mk('a2', [[VERDE_B, 84], [NEUTRO, 36]]);
  const a3 = mk('a3', [[ROSA, 54], [NEUTRO, 66]]);
  const pa = await demo.extractPaletteFromBuffers([a1, a2, a3]);
  ok(pa && dist(pa.accent, VERDE_A) < 48,
    `(a) accent = familia de la marca repetida (dio ${pa && pa.accent})`);
  ok(pa && dist(pa.accent, ROSA) > 90,
    '(a) el producto vivo de una sola foto NO es el accent');

  // ---------- (b) sin recurrencia ni dominancia → null ----------
  const b1 = mk('b1', [['#D63031', 60], [NEUTRO, 60]]);
  const b2 = mk('b2', [['#0984E3', 60], [NEUTRO, 60]]);
  const b3 = mk('b3', [['#FDCB6E', 60], [NEUTRO, 60]]);
  const pb = await demo.extractPaletteFromBuffers([b1, b2, b3]);
  ok(pb === null, `(b) feed variado sin señal de marca → null (dio ${JSON.stringify(pb)})`);

  // ---------- (c) un dominante claro gana aunque esté en 1 foto ----------
  const c1 = mk('c1', [[TURQUESA, 102], [NEUTRO, 18]]);
  const c2 = mk('c2', [[NEUTRO, 110], [ROSA, 10]]);
  const c3 = mk('c3', [[NEUTRO, 110], ['#6C5CE7', 10]]);
  const pc = await demo.extractPaletteFromBuffers([c1, c2, c3]);
  ok(pc && dist(pc.accent, TURQUESA) < 48,
    `(c) accent = el dominante del color vivo (dio ${pc && pc.accent})`);

  // ---------- (d) btn: distinguible y recurrente ----------
  const d1 = mk('d1', [[VERDE_A, 72], [AMARILLO, 30], [NEUTRO, 18]]);
  const pd = await demo.extractPaletteFromBuffers([d1, d1, d1]);
  ok(pd && dist(pd.accent, VERDE_A) < 48, `(d) accent = la marca (dio ${pd && pd.accent})`);
  ok(pd && pd.btn === AMARILLO, `(d) btn = el segundo color de la marca (dio ${pd && pd.btn})`);
  ok(pd && pd.btn && dist(pd.btn, pd.accent) > 90, '(d) btn distinguible del accent (>90 RGB)');

  // ---------- (e) entradas vacías/basura → null ----------
  ok((await demo.extractPaletteFromBuffers([])) === null, '(e) sin buffers → null');
  ok((await demo.extractPaletteFromBuffers([Buffer.from('esto no es una imagen')])) === null,
    '(e) buffer basura → null');

  // ---------- (f) el modo clásico de logos sigue intacto ----------
  const cols = await demo.extractColorsFromBuffer(d1);
  ok(Array.isArray(cols) && cols.length === 2 && cols[0] === VERDE_A,
    `(f) extractColorsFromBuffer sigue dando 2 colores, dominante primero (dio ${JSON.stringify(cols)})`);

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log(fails ? `\n❌ ${fails} FALLOS` : '\n✅ TODO OK — paleta del feed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
