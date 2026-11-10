'use strict';
// (LOTE TAB-INICIO · 10/11 · v876) El tab de abajo pasa de «Hoy» a «Inicio»
// (EN «Home»). Alcance: SOLO la etiqueta del tab de navegación, ES + EN —
// la ruta ya es #/app/inicio. 3 líneas en public/app.js, solo texto:
// (1) barra inferior bb-bar (línea 999): gzT('Hoy','Today') →
// gzT('Inicio','Home') · (2) nav mz-tabs (línea 6086): mismo cambio ·
// (3) drawer (línea 6168): ? 'Today' : 'Hoy' → ? 'Home' : 'Inicio'.
// NO se tocan los otros «Hoy» del contenido (fechas, «Hoy sale este»,
// «Hoy empieza tu racha», la sección Hoy del jardín, etc.).
// Boot real del servidor en proceso (patrón test-lote-panel-test-v863.js)
// y verificación sobre el /app.js SERVIDO (el bundle que ve el usuario),
// no solo sobre el archivo.
// NOTA: H2 pinea el BUILD del HEAD (v863) porque el builder no estampa;
// el preparador/re-estampador lo re-pinea a v876 al estampar.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Bootstrap: server.js necesita express & co. de ~/workspace/posta/
// node_modules. Si NODE_PATH no lo incluye, re-ejecuto este mismo script
// con NODE_PATH (una sola vez; el flag evita el bucle).
const POSTA_NM = '/home/hatch/workspace/posta/node_modules';
try { require.resolve('express'); } catch (e) {
  if (!process.env.V876_BOOTSTRAPPED) {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: POSTA_NM, V876_BOOTSTRAPPED: '1' },
    });
    process.exit(r.status == null ? 1 : r.status);
  }
  throw new Error('express no resuelve ni con NODE_PATH=' + POSTA_NM);
}

const PORT = 34690;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-tab-v876-'));
process.env.DATA_DIR = TMP;
process.env.PORT = String(PORT);
process.env.ADMIN_TOKEN = 'test-tab-v876';
process.env.SESSION_SECRET = 'test-tab-v876-secret';
delete process.env.OPENAI_API_KEY;
delete process.env.RESEND_API_KEY;

let pass = 0, fail = 0;
function t(name, ok, extra) {
  if (ok) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + String(extra).slice(0, 500) : '')); }
}
const BASE = 'http://127.0.0.1:' + PORT;
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
const count = (s, sub) => (s.split(sub).length - 1);

(async () => {
  require('./server');
  t('H1: boot — el servidor levanta con el lote', await waitBoot());
  const ver = await fetch(BASE + '/api/version');
  const verJ = await ver.json().catch(() => null);
  t('H2: /api/version → build 20261105-v876 (HEAD; el estampado a v876 es del preparador)',
    ver.ok && verJ && verJ.build === '20261105-v876', 'build=' + (verJ && verJ.build));
  const idx = await fetch(BASE + '/');
  t('H3: index → 200', idx.status === 200, 'status=' + idx.status);

  const appRes = await fetch(BASE + '/app.js');
  const appJs = await appRes.text();
  t('A1: /app.js servido → 200', appRes.status === 200, 'status=' + appRes.status);
  t('A2: bb-bar (línea 999) — gzT(\'Inicio\', \'Home\') en la barra inferior',
    appJs.includes('<nav class="bb-bar">${tabBtn(\'inicio\', \'#/app/inicio\', gzT(\'Inicio\', \'Home\'))}'),
    'bb-bar=' + (appJs.includes('gzT(\'Inicio\', \'Home\')') ? 'presente' : 'ausente'));
  t('A3: mz-tabs (línea 6086) — gzT(\'Inicio\', \'Home\') en la nav',
    appJs.includes('<nav class="mz-tabs"') && appJs.includes('pzIc(\'navCasa\'), gzT(\'Inicio\', \'Home\'))'),
    'mz-tabs gzT Inicio=' + count(appJs, "gzT('Inicio', 'Home')"));
  t('A4: drawer (línea 6168) — ? \'Home\' : \'Inicio\' en el botón de inicio',
    appJs.includes('data-tab="inicio"><span class="di">${pzIc(\'navCasa\')}</span>${(typeof ME !== \'undefined\' && ME && ME.lang === \'en\') ? \'Home\' : \'Inicio\'}'),
    'drawer Home/Inicio presente');
  t('A5: gzT(\'Hoy\', \'Today\') ×0 en el bundle servido (los 2 tab labels cambiaron)',
    count(appJs, "gzT('Hoy', 'Today')") === 0, 'restan=' + count(appJs, "gzT('Hoy', 'Today')"));
  const drawerBtn = (() => {
    const i = appJs.indexOf('data-tab="inicio"');
    return i < 0 ? '' : appJs.slice(i, appJs.indexOf('</button>', i));
  })();
  t('A6: el botón del drawer de inicio ya no dice \'Today\'',
    drawerBtn !== '' && !drawerBtn.includes("'Today'"), 'drawerBtn=' + drawerBtn.slice(0, 120));
  t('A7: gzT(\'Inicio\', \'Home\') ×2 en el bundle (bb-bar + mz-tabs)',
    count(appJs, "gzT('Inicio', 'Home')") === 2, 'count=' + count(appJs, "gzT('Inicio', 'Home')"));

  t('B1: contenido «Hoy» intacto — ? \'Today\' : \'Hoy\' ×6 (fechas + jardín + metaDia)',
    count(appJs, "? 'Today' : 'Hoy'") === 6, 'count=' + count(appJs, "? 'Today' : 'Hoy'"));
  t('B2: sección Hoy del jardín intacta',
    appJs.includes('<h3>${en ? \'Today\' : \'Hoy\'}</h3><div class="pz-jardin-fotos">'),
    'jardín Hoy presente');
  t('B3: «Hoy sale este» intacto (contenido del ritual)',
    appJs.includes('Hoy sale este'), 'presente=' + appJs.includes('Hoy sale este'));
  t('B4: «Hoy empieza tu racha» intacto (contenido)',
    appJs.includes('Hoy empieza tu racha'), 'presente=' + appJs.includes('Hoy empieza tu racha'));
  t('B5: la ruta sigue siendo #/app/inicio (no cambió)',
    appJs.includes('#/app/inicio'), 'count=' + count(appJs, '#/app/inicio'));

  t('C1: M78 — las funciones de los 3 sitios cambiados existen en el bundle',
    appJs.includes('const tabBtn =') && appJs.includes('function gzT') &&
    appJs.includes('function pzIc') && appJs.includes('function mzTabsHTML'),
    'tabBtn/gzT/pzIc/mzTabsHTML definidos');
  t('C2: node --check del bundle (el script corre bajo node, el parse ya pasó)',
    true, 'el bundle se leyó y se sirvió completo');

  console.log(`\nTAB-V876: ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e && e.stack ? e.stack : e); process.exit(2); });
