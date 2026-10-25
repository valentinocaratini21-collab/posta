'use strict';
/* =====================================================================
 * test-creator-case.js — Gap 12 (auditoría de material del cliente,
 * 2026-10-25): fuera el toUpperCase forzado del Creador.
 *
 * La regla de la casa (2026-10-22) dice que el pie/titular NUNCA va en
 * mayúsculas forzadas, pero creator.js gritaba el titular y la barra
 * de TODA opción re-renderizada con «Mi foto» (rerenderOption) y de
 * las opciones generadas (generateOptions/headlineFor). Este test
 * verifica que la transformación ya no existe en el camino del texto
 * (quedan SOLO el hex de color y la capitalización de etiqueta, que no
 * son texto del cliente) y que un re-render con titular en caso mixto
 * produce su imagen sin tocar el camino.
 * ===================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-creator-'));
process.env.DATA_DIR = TMP;
process.env.MEDIA_DIR = path.join(TMP, 'media'); // creator.js resuelve /media/ contra MEDIA_DIR

(async () => {
  let passed = 0, failed = 0;
  const ok = (name, cond, extra) => {
    if (cond) { passed++; console.log('  ✓ ' + name); }
    else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };

  const src = fs.readFileSync(path.join(__dirname, 'creator.js'), 'utf8');
  const upperLines = src.split('\n').filter((l) => l.includes('toUpperCase') && !l.trim().startsWith('//'));
  ok('creator.js: quedan solo 2 toUpperCase (el hex de color y la capitalización de etiqueta)',
    upperLines.length === 2 && upperLines.some((l) => l.includes("toString(16)")) && upperLines.some((l) => l.includes('charAt(0)')),
    'líneas: ' + upperLines.map((l) => l.trim()).join(' | '));
  ok('ni el titular ni la barra pasan por toUpperCase en rerenderOption/generateOptions/headlineFor',
    !/\(headline[^)]*\)\.toUpperCase|\(bar[^)]*\)\.toUpperCase|\(business[^)]*\)\.toUpperCase|join\(' '\)\.toUpperCase/.test(src));

  // Smoke: «Mi foto» re-renderiza con un titular en caso mixto y la
  // opción sale (el render recibe el texto tal cual fue escrito).
  const creator = require('./creator');
  const mediaDir = path.join(TMP, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const foto = path.join(mediaDir, 'foto-test.png');
  execFileSync('python3', ['-c', `import sys
from PIL import Image
Image.new('RGB', (900, 900), (120, 90, 40)).save(sys.argv[1], 'PNG')`, foto]);
  const img = await creator.rerenderOption({
    photo: '/media/foto-test.png',
    headline: 'Promo de la Semana',
    bar: 'Café Aroma',
    title: 'Promo de la Semana',
    subline: 'Como siempre, recién hecho',
    pill: 'Nuevo',
    cta: 'Escribinos por DM',
    colors: ['#2793C8', '#FEC14D'],
  });
  ok('rerenderOption («Mi foto») re-renderiza sin romper con el caso natural', typeof img === 'string' && img.length > 0, String(img));

  console.log(`\ntest-creator-case: ${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
