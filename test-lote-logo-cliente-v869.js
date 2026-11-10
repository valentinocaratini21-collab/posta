// test-lote-logo-cliente-v869.js — LOTE v869: LOGO DEL CLIENTE ARRIBA A LA IZQUIERDA.
// Regla de Valentino (10/11 08:49, corrección): en los posteos del cliente va
// SOLO el logo del cliente arriba a la izquierda, chiquito y discreto; la cara
// de Posty NO aparece en los posteos de clientes. La cara de Posty arriba a la
// izquierda es solo para el feed propio de Posty (las tiras).
// Uso: node test-lote-logo-cliente-v869.js (sale 0 si pasa todo).
// Convención de las suites del repo: ok(name, cond, extra) + contador pass/fail.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const gen = fs.readFileSync(path.join(DIR, 'generator.js'), 'utf8');
const gateSrc = fs.readFileSync(path.join(DIR, 'qa-gate.js'), 'utf8');
const comp = fs.readFileSync(path.join(DIR, 'composite-headline.py'), 'utf8');
const qaGate = require('./qa-gate');
const refRoles = require('./ref-roles');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}
function has(s, sub) { return s.indexOf(sub) !== -1; }
function count(s, sub) { return s.split(sub).length - 1; }

// ---------- A) server.js — resolución del logo + prompt + QA ----------
console.log('A) server.js');
ok('A1: existe isHouseAccount (la casa es @posty.communitymanager)', has(srv, 'function isHouseAccount(uid)') && has(srv, "handle === 'posty.communitymanager'"));
{
  const fn = srv.slice(srv.indexOf('function logoSealArgsForUser'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  ok('A2: el sello resuelve primero el asset kind=\'logo\' (logoAbsPath) y después digest.logo_file',
    body.indexOf('logoAbsPath(uid)') !== -1 && body.indexOf('dg.logo_file') !== -1 &&
    body.indexOf('logoAbsPath(uid)') < body.indexOf('dg.logo_file'), body.slice(0, 200));
  ok('A3: sin logo, el sello es [] (pieza limpia)', has(body, "return [];"));
}
ok('A4: el prompt prohíbe dibujar logo/mascota en posteos de clientes y deja la esquina superior izquierda limpia',
  has(srv, 'Do not draw any logo, watermark, mascot or platform signature') &&
  has(srv, 'Leave the top-left corner clean and empty') &&
  has(srv, 'Never draw the Posty mascot') && has(srv, 'if (!isHouseAccount(uid))'));
ok('A5: qaImageB64 acepta logoExpected/isHouse', has(srv, 'async function qaImageB64(b64, { headline, paletteHex, dnaFacts, logoExpected, isHouse }, apiKey)'));
ok('A6: el schema del QA incluye client_logo_ok/no_posty_face condicionales',
  has(srv, "const logoSchemaKeys = (typeof logoExpected === 'boolean')") &&
  has(srv, "const faceSchemaKeys = (isHouse === false)") &&
  has(srv, '${logoSchemaKeys}${faceSchemaKeys}'));
ok('A7: el evaluate de conceptShot pasa logoExpected + isHouse al QA',
  has(srv, 'const logoExpected = logoSealArgsForUser(uid).length > 0;') &&
  has(srv, 'const housePost = isHouseAccount(uid);') &&
  has(srv, 'logoExpected, isHouse: housePost }, key);'));
ok('A8: BUILD v869 ×1 y v859 ×0 en server.js', count(srv, '20261105-v869') === 1 && count(srv, '20261105-v859') === 0,
  { v869: count(srv, '20261105-v869'), v859: count(srv, '20261105-v859') });

// ---------- B) generator.js — reglas de calidad ----------
console.log('B) generator.js (CALIDAD)');
ok('B1: CALIDAD-55 trae la excepción del logo del cliente (v869)', has(gen, 'EXCEPCIÓN LOGO DEL CLIENTE (v869)') && has(gen, 'se estampa por código arriba a la izquierda, chiquito y discreto'));
ok('B2: CALIDAD-55 dice que la cara de Posty NO aparece en los posteos de clientes', has(gen, 'La cara de Posty NO aparece en los posteos de clientes.'));
ok('B3: CALIDAD-61 trae el logo estampado por código arriba a la izquierda (v869)', has(gen, 'se estampa por código arriba a la izquierda (v869)'));
ok('B4: el nombre como rótulo sigue prohibido (la excepción es solo el logo-imagen)', has(gen, 'el nombre del negocio no se estampa como rótulo'));

// ---------- C) qa-gate.js — módulo puro ----------
console.log('C) qa-gate.js');
const PASS = { texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, brand_ok: true, anatomia_ok: true, headline_clear: true, detalle: 'todo bien' };
ok('C1: GATE_CHECKS trae client_logo_ok y no_posty_face',
  has(gateSrc, "['client_logo_ok', 'client_logo_ok']") && has(gateSrc, "['no_posty_face', 'no_posty_face']"));
ok('C2: FIX_LINES trae la corrección del logo y de la cara de Posty',
  has(gateSrc, 'client_logo_ok:') && has(gateSrc, 'no_posty_face:') && has(gateSrc, 'top-left corner'));
ok('C3: todo true + logo ok + sin cara → pasa', qaGate.qaGatePassed({ ...PASS, client_logo_ok: true, no_posty_face: true }) === true);
ok('C4: client_logo_ok false → NO pasa', qaGate.qaGatePassed({ ...PASS, client_logo_ok: false }) === false);
ok('C5: no_posty_face false → NO pasa', qaGate.qaGatePassed({ ...PASS, no_posty_face: false }) === false);
ok('C6: client_logo_ok/no_posty_face AUSENTES → pasa (patrón !== false: la casa y otros llamadores no se rompen)',
  qaGate.qaGatePassed({ ...PASS }) === true);
ok('C7: qaGateFailedChecks lista client_logo_ok y no_posty_face',
  JSON.stringify(qaGate.qaGateFailedChecks({ ...PASS, client_logo_ok: false, no_posty_face: false })) === JSON.stringify(['client_logo_ok', 'no_posty_face']));
ok('C8: qaGateFixesFor trae ambas líneas de corrección',
  qaGate.qaGateFixesFor({ ...PASS, client_logo_ok: false, no_posty_face: false, detalle: '' }).join(' | ').includes('top-left corner') &&
  qaGate.qaGateFixesFor({ ...PASS, client_logo_ok: false, no_posty_face: false, detalle: '' }).join(' | ').includes('Posty mascot'));

// ---------- D) ref-roles.js — la nota del rol logo ----------
console.log('D) ref-roles.js');
ok('D1: el rol logo dice que se estampa por código y que NO se dibuja',
  has(refRoles.REF_ROLE_TEXT.logo, 'stamped afterwards by code') &&
  has(refRoles.REF_ROLE_TEXT.logo, 'do NOT draw it') &&
  has(refRoles.REF_ROLE_TEXT.logo, 'leave the top-left corner clean and empty'));
ok('D2: buildRefNote con rol logo incluye la instrucción de la esquina limpia',
  refRoles.buildRefNote(['logo']).includes('top-left corner'));

// ---------- E) composite-headline.py — pruebas vivas por píxel ----------
console.log('E) composite-headline.py (vivo, por píxel)');
ok('E0: el sello tiene geometría fija arriba a la izquierda (seal_geometry)', has(comp, 'def seal_geometry') && has(comp, 'x = m') && has(comp, 'y = m'));
(function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v869-'));
  try {
    const make = [
      'from PIL import Image, ImageDraw',
      `base = Image.new('RGB', (1080, 1350), (40, 90, 120))`,
      `ImageDraw.Draw(base).rectangle([200, 400, 880, 1000], fill=(200, 170, 90))`,
      `base.save('${tmp}/base.png')`,
      `logo = Image.new('RGB', (400, 400), (255, 140, 0))`,
      `ImageDraw.Draw(logo).ellipse([40, 40, 360, 360], fill=(10, 30, 51))`,
      `logo.save('${tmp}/logo.png')`,
      `wide = Image.new('RGB', (400, 100), (200, 30, 60))`,
      `wide.save('${tmp}/wide.png')`,
    ].join('\n');
    fs.writeFileSync(tmp + '/make.py', make);
    execFileSync('python3', [tmp + '/make.py'], { timeout: 30000 });
    const run = (args) => execFileSync('python3', [path.join(DIR, 'composite-headline.py'), ...args], { timeout: 30000 });
    run(['--in', tmp + '/base.png', '--out', tmp + '/sin.png']);
    run(['--in', tmp + '/base.png', '--out', tmp + '/con.png', '--logo', tmp + '/logo.png']);
    run(['--in', tmp + '/base.png', '--headline', 'La historia de la medialuna', '--out', tmp + '/con-tit.png', '--logo', tmp + '/logo.png']);
    run(['--in', tmp + '/base.png', '--headline', 'La historia de la medialuna', '--zone', 'bottom', '--out', tmp + '/con-bot.png', '--logo', tmp + '/logo.png']);
    run(['--in', tmp + '/base.png', '--out', tmp + '/con-wide.png', '--logo', tmp + '/wide.png']);
    run(['--in', tmp + '/base.png', '--headline', 'Hola', '--out', tmp + '/malo.png', '--logo', tmp + '/no-existe.png']);
    const px = [
      'from PIL import Image',
      'import json',
      'def px(p, x, y):',
      '    return list(Image.open(p).convert("RGB").getpixel((x, y)))',
      'def white_in_row(p, y, x0=200, x1=880, step=4):',
      '    im = Image.open(p).convert("RGB")',
      '    return any(all(c > 240 for c in im.getpixel((x, y))) for x in range(x0, x1, step))',
      'def white_in_strip(p, y0, y1, x0=200, x1=880, step=4):',
      '    im = Image.open(p).convert("RGB")',
      '    return any(all(c > 240 for c in im.getpixel((x, y))) for y in range(y0, y1, step) for x in range(x0, x1, step))',
      `print(json.dumps({`,
      `  'sin_tl': px('${tmp}/sin.png', 68, 68),`,
      `  'con_tl': px('${tmp}/con.png', 68, 68),`,
      `  'con_old': px('${tmp}/con.png', 983, 1253),`,
      `  'tit_tl': px('${tmp}/con-tit.png', 68, 68),`,
      `  'tit_strip_white': white_in_strip('${tmp}/con-tit.png', 60, 140),`,
      `  'tit_row200_white': white_in_strip('${tmp}/con-tit.png', 155, 250),`,
      `  'bot_tl': px('${tmp}/con-bot.png', 68, 68),`,
      `  'bot_row1180_white': white_in_strip('${tmp}/con-bot.png', 1080, 1290),`,
      `  'bot_top_strip_white': white_in_strip('${tmp}/con-bot.png', 60, 140),`,
      `  'wide_tl': px('${tmp}/con-wide.png', 68, 68),`,
      `  'wide_above': px('${tmp}/con-wide.png', 68, 30),`,
      `}))`,
    ].join('\n');
    fs.writeFileSync(tmp + '/px.py', px);
    const out = JSON.parse(execFileSync('python3', [tmp + '/px.py'], { encoding: 'utf8' }));
    ok('E1: con --logo el sello está arriba a la izquierda (68,68 = color del logo)', JSON.stringify(out.con_tl) === JSON.stringify([10, 30, 51]), out);
    ok('E2: con --logo la esquina vieja (abajo a la derecha) queda intacta', JSON.stringify(out.con_old) === JSON.stringify([40, 90, 120]), out);
    ok('E3: sin --logo la esquina superior izquierda queda intacta (sin sello inventado)', JSON.stringify(out.sin_tl) === JSON.stringify([40, 90, 120]), out);
    ok('E4: con titular arriba, el sello sigue intacto', JSON.stringify(out.tit_tl) === JSON.stringify([10, 30, 51]), out);
    ok('E5: con titular arriba, el titular NO pisa la franja del sello (nada blanco entre y=60 y y=140)', out.tit_strip_white === false, out);
    ok('E6: con titular arriba, el titular SÍ se renderiza debajo del sello (blanco entre y=155 e y=250)', out.tit_row200_white === true, out);
    ok('E7: con titular abajo, el sello sigue arriba a la izquierda y el titular está abajo', JSON.stringify(out.bot_tl) === JSON.stringify([10, 30, 51]) && out.bot_row1180_white === true && out.bot_top_strip_white === false, out);
    ok('E8: el logo HORIZONTAL va entero con su aspecto (centro = su color, encima de la franja = blanco del medallón)',
      JSON.stringify(out.wide_tl) === JSON.stringify([200, 30, 60]) && JSON.stringify(out.wide_above) === JSON.stringify([255, 255, 255]), out);
    ok('E9: logo inexistente no rompe la pieza (fail-open)', fs.existsSync(tmp + '/malo.png'));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
})();

console.log(`\nLOGO-CLIENTE-v869: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
