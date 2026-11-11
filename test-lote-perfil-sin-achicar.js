// test-lote-perfil-sin-achicar.js — LOTE PERFIL-SIN-ACHICAR v904 (11/11 · orden Valentino
// «en el website que no se achique la parte de arriba del perfil. que siempre se vea»):
// La barra de arriba del perfil (#inicioView .hf-head: avatar + «Posty ✓» +
// «@posty.communitymanager») se achicaba al deslizar en escritorio: el colapso
// pzHeadCollapse (clase .hf-collapsed) seguía vivo por encima de 820px — en móvil
// ya estaba desactivado por HEADER-SIN-CAMBIO (4/11). Este lote extiende ese gate
// a TODOS los anchos: pzHeadCollapseIsMobile() se renombra pzHeadCollapseOff()
// (devuelve siempre true) y pzHeadCollapseMobileReset() pasa a
// pzHeadCollapseReset(). pzHeadCollapseNext NO se toca (byte-idéntica: la decisión
// sigue calculando «colapso», el gate es lo que ya nunca lo aplica) y el CSS
// .hf-collapsed sigue vivo (estado válido, solo que ya nunca se aplica). La app
// nativa es solo móvil (≤820px): su comportamiento NO cambia — ahí el colapso ya
// estaba desactivado. Solo cambia public/app.js (+13 líneas), server.js (BUILD)
// Re-estampado sobre base-v903 (re-pineo: A22 31485, B1 v903 x0, B3/B5 styles?v=20261241).
// y public/index.html (app.js?v=617); styles.css y en/index.html byte-idénticos.
// Uso: node test-lote-perfil-sin-achicar.js (desde el scratch; corre contra
// release/ si existe, si no contra work/). Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

let pass = 0, fail = 0;
const fails = [];
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = __dirname;
const TREE = fs.existsSync(path.join(ROOT, 'release', 'public', 'app.js'))
  ? path.join(ROOT, 'release')
  : (fs.existsSync(path.join(ROOT, 'work', 'public', 'app.js')) ? path.join(ROOT, 'work') : ROOT);
const BASE = fs.existsSync(path.join(ROOT, 'base-v903', 'public', 'app.js'))
  ? path.join(ROOT, 'base-v903') : null;

const APPJS = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 12);

async function main() {
  console.log('== A. ESTÁTICOS: el fix ==');
  t('A1: Off definido x1', (APPJS.match(/function pzHeadCollapseOff\(\)/g) || []).length === 1);
  t('A2: Off devuelve siempre true', /function pzHeadCollapseOff\(\) \{[\s\S]*?return true;/.test(APPJS));
  t('A3: Off llamado en los 4 gates (Animate, Apply, Sync, resize)', (APPJS.match(/if \(pzHeadCollapseOff\(\)\)/g) || []).length === 4);
  t('A4: IsMobile sobrevive x1 y solo en comentario histórico',
    (APPJS.match(/pzHeadCollapseIsMobile/g) || []).length === 1
    && APPJS.split('\n').filter((l) => l.includes('pzHeadCollapseIsMobile')).every((l) => l.trim().startsWith('//')));
  t('A5: MobileReset x0', !APPJS.includes('pzHeadCollapseMobileReset'));
  t('A6: Reset definido x1', (APPJS.match(/function pzHeadCollapseReset\(/g) || []).length === 1);
  t('A7: Reset llamado x3 (Apply, Sync, resize)', (APPJS.match(/pzHeadCollapseReset\(/g) || []).length === 4); // def + 3
  t('A8: Next definido x1', (APPJS.match(/function pzHeadCollapseNext\(/g) || []).length === 1);
  t('A9: Next llamado solo desde Sync (2 occ)', (APPJS.match(/pzHeadCollapseNext\(/g) || []).length === 2);
  t('A10: umbral colapso 120 intacto', /y > 120/.test(APPJS));
  t('A11: tope expansión 40 intacto', /y <= 40/.test(APPJS));
  t('A12: delta subida 10 intacto', /y < last - 10/.test(APPJS));
  t('A13: Sync definido x1', (APPJS.match(/function pzHeadCollapseSync\(/g) || []).length === 1);
  t('A14: listener scroll pasivo intacto', /window\.addEventListener\('scroll', pzHeadCollapseSync, \{ passive: true \}\)/.test(APPJS));
  t('A15: bind único intacto', /__pzHeadCollapseBound/.test(APPJS));
  t('A16: resize listener intacto', /__pzHeadCollapseResizeBound/.test(APPJS));
  t('A17: comentario PERFIL-SIN-ACHICAR presente', APPJS.includes('LOTE PERFIL-SIN-ACHICAR'));
  t('A18: CSS .hf-collapsed sigue vivo (estado válido)', CSS.includes('#inicioView.hf-collapsed .hf-head{display:flex;align-items:center'));
  t('A19: avatar compacto 40px sigue en el CSS', CSS.includes('#inicioView.hf-collapsed .hf-head .hf-ava-in{width:40px;height:40px}'));
  t('A20: avatar base 72px intacto', /#inicioView \.hf-ava-in\{width:72px;height:72px\}/.test(CSS));
  t('A21: regla base .hf-head intacta', /#inicioView \.hf-head\{background:rgba\(255,255,255,\.40\)/.test(CSS));
  t('A22: app.js 31485 líneas (31472 base + 13)', APPJS.split('\n').length - 1 === 31485, 'líneas: ' + (APPJS.split('\n').length - 1));

  console.log('== B. ESTÁTICOS: estampado ==');
  t('B1: BUILD v904 x1 en server.js, v903 x0', SRV.includes("20261105-v904") && !SRV.includes('20261105-v903'));
  t('B2: app.js?v=617 x1 en index ES', (IDX.match(/app\.js\?v=617/g) || []).length === 1);
  t('B3: styles?v=20261241 INTACTO x1 ES (no se toca styles.css)', (IDX.match(/styles\.css\?v=20261241/g) || []).length === 1);
  t('B4: styles?v=20261242 x0 en ES', !IDX.includes('styles.css?v=20261242'));
  t('B5: styles?v=20261241 INTACTO x1 EN', (IDXEN.match(/styles\.css\?v=20261241/g) || []).length === 1);
  t('B6: EN sin app.js?v=', !IDXEN.includes('app.js?v='));
  t('B7: styles.css byte-idéntico a base', BASE ? md5(CSS) === md5(fs.readFileSync(path.join(BASE, 'public', 'styles.css'), 'utf8')) : true, 'md5: ' + md5(CSS));
  t('B8: en/index.html byte-idéntico a base', BASE ? md5(IDXEN) === md5(fs.readFileSync(path.join(BASE, 'public', 'en', 'index.html'), 'utf8')) : true, 'md5: ' + md5(IDXEN));

  console.log('== C. FUNCIONALES: el colapso NUNCA se aplica (vm, escritorio 1300px y móvil 390px) ==');
  const mNext = APPJS.match(/function pzHeadCollapseNext[\s\S]*?\n\}\n/);
  const mSync = APPJS.match(/let pzHeadCollapseState[\s\S]*?window\.addEventListener\('scroll', pzHeadCollapseSync, \{ passive: true \}\);?\n?\}/);
  t('C0: bloque Next extraíble', !!mNext);
  t('C0b: bloque Sync extraíble', !!mSync);
  if (mNext && mSync) {
    // Next byte-idéntica a la base (la decisión NO cambia; solo el gate la bloquea).
    if (BASE) {
      const baseApp = fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8');
      const baseNext = baseApp.match(/function pzHeadCollapseNext[\s\S]*?\n\}\n/);
      t('C1: pzHeadCollapseNext BYTE-IDÉNTICA a base', !!baseNext && baseNext[0] === mNext[0]);
    }
    for (const mode of ['desktop', 'móvil']) {
      const isMobile = mode === 'móvil';
      const cls = new Set();
      const el = {
        classList: {
          add: (c) => cls.add(c),
          remove: (c) => cls.delete(c),
          toggle: (c, f) => { if (f) cls.add(c); else cls.delete(c); },
          contains: (c) => cls.has(c),
        },
      };
      const sandbox = {
        console,
        setTimeout, clearTimeout,
        window: {
          innerWidth: isMobile ? 390 : 1300,
          innerHeight: 800, scrollY: 0,
          addEventListener: () => {},
          matchMedia: (q) => ({ matches: isMobile && String(q).includes('820px') }),
        },
        document: {
          documentElement: { scrollHeight: 3000, scrollTop: 0 },
          getElementById: (id) => (id === 'inicioView' ? el : null),
        },
      };
      sandbox.window.document = sandbox.document;
      vm.createContext(sandbox);
      vm.runInContext(mNext[0] + '\n' + mSync[0], sandbox);
      const Next = sandbox.pzHeadCollapseNext;
      const Sync = sandbox.pzHeadCollapseSync;
      // La decisión pura SIGUE diciendo «colapso» al bajar (Next intacta).
      t('C2[' + mode + ']: Next(121) sigue decidiendo colapso (decisión intacta)', Next(121, 0, false).collapsed === true);
      t('C3[' + mode + ']: Next(0) sigue decidiendo completo', Next(0, 0, false).collapsed === false);
      // Pero el gate ya nunca lo aplica, en ningún ancho ni scroll.
      sandbox.window.scrollY = 0; Sync(); await sleep(200);
      t('C4[' + mode + ']: scroll 0: sin clase', !cls.has('hf-collapsed'));
      sandbox.window.scrollY = 300; Sync(); await sleep(200);
      t('C5[' + mode + ']: bajar a 300: SIN clase (antes: colapsaba en escritorio)', !cls.has('hf-collapsed'));
      sandbox.window.scrollY = 1200; Sync(); await sleep(200);
      t('C6[' + mode + ']: bajar a 1200: SIN clase', !cls.has('hf-collapsed'));
      sandbox.window.scrollY = 0; Sync(); await sleep(200);
      t('C7[' + mode + ']: volver arriba: SIN clase', !cls.has('hf-collapsed'));
      // Si la clase ya estaba puesta (p. ej. render viejo), el primer scroll la quita.
      cls.add('hf-collapsed');
      sandbox.window.scrollY = 300; Sync(); await sleep(200);
      t('C8[' + mode + ']: clase pre-puesta: el scroll la QUITA', !cls.has('hf-collapsed'));
      // Animate (nivel más bajo) tampoco pone nunca la clase.
      cls.add('hf-collapsed');
      sandbox.pzHeadCollapseAnimate(el, true); await sleep(50);
      t('C9[' + mode + ']: Animate(true) con clase puesta: la QUITA, no la pone', !cls.has('hf-collapsed'));
    }
  }

  console.log('== D. M78: funciones auditadas ==');
  const fns = ['pzHeadCollapseNext', 'pzHeadCollapseSync', 'pzHeadCollapseApply', 'pzHeadCollapseAnimate', 'pzHeadCollapseOff', 'pzHeadCollapseReset'];
  let defined = 0;
  for (const fn of fns) {
    const n = (APPJS.match(new RegExp('function ' + fn + '\\(', 'g')) || []).length;
    t('D: ' + fn + ' definida x1', n === 1);
    if (n === 1) defined++;
  }
  t('D: Off llamado x4 (Animate, Apply, Sync, resize) + def + comentario histórico', (APPJS.match(/pzHeadCollapseOff\(\)/g) || []).length === 6); // def + 4 + 1 comentario
  t('D: Reset llamado x3 (Apply, Sync, resize)', (APPJS.match(/pzHeadCollapseReset\(/g) || []).length === 4); // def + 3
  t('D: Apply llamado x1 (setTimeout en Sync)', (APPJS.match(/setTimeout\(pzHeadCollapseApply/g) || []).length === 1);
  t('D: Animate llamado x1 (en Apply)', (APPJS.match(/pzHeadCollapseAnimate\(iv, pzHeadCollapseState\.collapsed\)/g) || []).length === 1);
  t('D: Sync llamado x1 (listener scroll)', (APPJS.match(/pzHeadCollapseSync, \{ passive: true \}\)/g) || []).length === 1);
  console.log('funciones auditadas: ' + defined + '/' + fns.length);

  console.log('== E. CENSO: vecinos intactos ==');
  t('E1: needs_review 107 occ en server.js', (SRV.match(/needs_review/g) || []).length === 107, 'occ: ' + (SRV.match(/needs_review/g) || []).length);
  t('E2: pzBoostEsMP x23 en app.js', (APPJS.match(/pzBoostEsMP/g) || []).length === 23, 'occ: ' + (APPJS.match(/pzBoostEsMP/g) || []).length);
  t('E3: pz-boost-3d3 x20 en styles.css', (CSS.match(/pz-boost-3d3/g) || []).length === 20, 'occ: ' + (CSS.match(/pz-boost-3d3/g) || []).length);
  t('E4: CHUNK_V v890 x1 en app.js', (APPJS.match(/20261105-v890/g) || []).length === 1);
  t('E5: min(170px,44vw) x2 en styles.css (v899 intacto)', (CSS.match(/min\(170px,44vw\)/g) || []).length === 2);
  t('E6: noDna x5 en app.js (v898 intacto)', (APPJS.match(/noDna/g) || []).length === 5, 'occ: ' + (APPJS.match(/noDna/g) || []).length);
  t('E7: HEADLINE_POSESIVOS 5 occ en server.js', (SRV.match(/HEADLINE_POSESIVOS/g) || []).length === 5, 'occ: ' + (SRV.match(/HEADLINE_POSESIVOS/g) || []).length);
  t('E8: proactive.js md5 9014a72ada77', md5(fs.readFileSync(path.join(TREE, 'proactive.js'), 'utf8')) === '9014a72ada77', 'md5: ' + md5(fs.readFileSync(path.join(TREE, 'proactive.js'), 'utf8')));
  t('E9: endpoints v900 vivos (config + payment-method)', SRV.includes('/api/billing/stripe/config') && SRV.includes('/api/billing/stripe/payment-method'));
  t('E10: pzTarjeta* vivo (v900)', APPJS.includes('pzTarjetaInlineAbrir'));
  t('E11: frase del chat x1 (v895/v898)', (APPJS.match(/Te armé el posteo de hoy/g) || []).length === 1);
  t('E12: o.hero literal x1 (v897)', (APPJS.match(/o\.hero/g) || []).length === 1);

  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (fails.length ? ' — ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('ERROR suite:', e); process.exit(1); });
