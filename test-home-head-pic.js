'use strict';
/* test-home-head-pic.js — v363: foto del encabezado de la home con
 * respaldo de logo. homeHeadHTML (public/app.js) arma la foto solo
 * desde P.pic; si viene vacía, usa el asset de logo del negocio con el
 * MISMO criterio que weekCardHTML (assetLogo + file_path, try/catch).
 * La inicial queda como último recurso.
 * Patrón de extracción por vm de test-v331-home.js.
 * Uso: node test-home-head-pic.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const src = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const a = src.indexOf('const HOME_FEED_CAP');
const b = src.indexOf('/* ===== /HOME_FEED ===== */', a);
ok(a > 0 && b > a, 'bloque HOME_FEED delimitado en app.js');
ok(src.includes("if (!picSrc) { try { const lg = (typeof assetLogo === 'function') ? assetLogo() : null; if (lg && lg.file_path) picSrc = lg.file_path; } catch (e) {} }"), 'app.js: marca del respaldo de logo presente en homeHeadHTML');

const sandbox = {
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  ASSETS: [],
};
sandbox.assetLogo = () => sandbox.ASSETS.find((x) => x.kind === 'logo');
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b), sandbox);
const { homeHeadHTML } = sandbox;
ok(typeof homeHeadHTML === 'function', 'homeHeadHTML cargada');

const baseProf = { username: 'cafesol', name: 'Café Sol', bio: '', bio_unread: false, link: '', followers: null, posts_count: null, following: null, highlights: [] };

// (a) sin pic y con logo en ASSETS -> usa el file_path del logo
sandbox.ASSETS = [{ kind: 'photo', file_path: '/media/foto.jpg' }, { kind: 'logo', file_path: '/media/logo-test.png' }];
const htmlA = homeHeadHTML({ ...baseProf, pic: null }, 'X');
ok(htmlA.includes('<img src="/media/logo-test.png"'), '(a) sin pic + logo: el encabezado usa el file_path del logo');
ok(!htmlA.includes('/media/foto.jpg'), '(a) un asset que no es logo no se usa como foto');

// (b) con pic -> gana la pic, el logo no aparece
sandbox.ASSETS = [{ kind: 'logo', file_path: '/media/logo-test.png' }];
const htmlB = homeHeadHTML({ ...baseProf, pic: '/media/pic-real.jpg' }, 'X');
ok(htmlB.includes('<img src="/media/pic-real.jpg"'), '(b) con pic: gana la foto de perfil');
ok(!htmlB.includes('/media/logo-test.png'), '(b) con pic: el logo no aparece');

// (c) sin pic ni logo -> solo la inicial
sandbox.ASSETS = [];
const htmlC = homeHeadHTML({ ...baseProf, pic: '' }, 'X');
ok(!htmlC.includes('<img'), '(c) sin pic ni logo: no hay <img> en el encabezado');
ok(htmlC.includes('hf-ava-letter') && htmlC.includes('>C</span>'), '(c) sin pic ni logo: queda la inicial como último recurso');

// (d) assetLogo ausente/no definido no rompe (try/catch): se simula
// quitando el helper del sandbox y recargando el bloque.
const sandbox2 = {
  esc: sandbox.esc, mv: (p) => p, ASSETS: [],
};
vm.createContext(sandbox2);
vm.runInContext(src.slice(a, b), sandbox2);
let htmlD = null, threw = false;
try { htmlD = sandbox2.homeHeadHTML({ ...baseProf, pic: null }, 'X'); } catch (e) { threw = true; }
ok(!threw && htmlD && !htmlD.includes('<img'), '(d) sin assetLogo definido: no rompe y cae a la inicial');

console.log(fails ? `\n✗ ${fails}/${total} FALLOS` : `\n✓ ${total}/${total} OK`);
process.exit(fails ? 1 : 0);
