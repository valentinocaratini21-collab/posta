#!/usr/bin/env node
// test-lotesaltomiplan.js — LOTE SALTO-MI-PLAN: la prueba vencida que pega
// 402 trial_expired ya no rebota en silencio arriba de Ajustes: cae en Mi
// plan (?plan=1 → bindApp desplaza planZone a la vista), donde el banner
// de prueba terminada ya explica la situación; y los textos de prueba
// terminada en Mi plan salen ES/EN. Sin funciones nuevas, sin doble aviso
// (el modal/aviso de vencido se suprime en Ajustes, como siempre).
// Uso: node test-lotesaltomiplan.js   (desde la raíz del árbol)
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 250) : ''); }
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

const app = read('public/app.js');
const chk = read('public/chunk-ajustes.js');
const srv = read('server.js');
const idx = read('public/index.html');
const en = read('public/en/index.html');

// Bloque 402 de api.req (el único con r.status === 402).
const i402 = app.indexOf('r.status === 402');
const block402 = i402 < 0 ? '' : app.slice(i402, i402 + 1400);

console.log('— 402 trial_expired: destino Mi plan, nunca arriba en silencio —');
ok('bloque 402 existe', i402 >= 0);
ok('402: destino es #/app/ajustes?plan=1', block402.includes('#/app/ajustes?plan=1'));
ok('402: sin asignación en seco a #/app/ajustes', !block402.includes("location.hash = '#/app/ajustes'"));
ok('402: guarda plan/plan_sel (no pisa preselección)', block402.includes("plan_sel") && block402.includes("get('plan')"));
ok('402: ME.trial_expired sigue marcándose', block402.includes('ME.trial_expired = true'));
ok('402: sin funciones nuevas en el bloque', !block402.includes('function '));

// La guarda, evaluada TAL CUAL está escrita en el código servido.
const m = block402.match(/if \((.+)\) location\.hash = '#\/app\/ajustes\?plan=1';/);
ok('402: guarda extraíble del código', !!m);
if (m) {
  const decide = new Function('_h', '_pq', 'return (' + m[1] + ');');
  const q = (h) => new URLSearchParams((h.split('?')[1] || ''));
  const cases = [
    ['#/app/inicio', true],
    ['#/app/jardin-posty', true],
    ['#/app/ajustes', true],
    ['#/app/ajustes?plan=1', false],
    ['#/app/ajustes?plan_sel=esencial', false],
    ['#/app/ajustes?plan=error', false],
    ['#/app/ajustes?foo=1', true],
  ];
  for (const [h, want] of cases) {
    let got;
    try { got = decide(h, q(h)); } catch (e) { got = 'ERR:' + e.message; }
    ok(`402: guarda ${_h0(h)} → ${want ? 'redirige' : 'no toca'}`, got === want, 'dio=' + got);
  }
}
function _h0(h) { return h; }

console.log('— mecanismo de llegada a Mi plan intacto, sin doble aviso —');
ok('bindApp: ?plan=1 o ?plan_sel= desplaza planZone', app.includes("if (tab === 'ajustes' && (_pq.get('plan') || _pq.get('plan_sel')))") && app.includes('scrollIntoView'));
ok('vencido: modal/aviso suprimido en Ajustes (sin doble aviso)', app.includes("ME.trial_expired && ME.plan_status === 'trial' && tab !== 'ajustes'"));
ok('modal web intacto (Elegir → ?plan_sel=)', app.includes("location.hash = '#/app/ajustes' + (pid ? '?plan_sel=' + encodeURIComponent(pid) : '')"));
ok('aviso nativo intacto (neutro, sin CTA)', app.includes('Tu prueba terminó.') || chk.includes('Tu prueba terminó.'));

console.log('— Mi plan: prueba terminada ES/EN —');
ok('web: banner ES intacto', chk.includes('Se terminó la prueba.') && chk.includes('Elegí tu plan y seguimos publicando juntos'));
ok('web: banner EN nuevo', chk.includes('Your trial ended.') && chk.includes("Pick your plan and let's keep posting together"));
ok('web: statusTag EN nuevo', chk.includes("isUS ? 'trial ended' : 'prueba terminada'"));
ok('web: hint EN nuevo', chk.includes("Pick your plan and let's keep posting together."));
ok('web: encabezado EN nuevo', chk.includes('Pick your plan to keep going') && chk.includes('Pick your plan to start'));
ok('nativo: estado EN nuevo', chk.includes("? 'Your trial ended.' : 'Tu prueba terminó.'"));
ok('app: planTag EN nuevo', app.includes("ME.lang === 'en' ? 'trial ended' : 'prueba terminada'"));

console.log('— bumps y censo estático —');
ok('BUILD v556', srv.includes("const BUILD_ID = '20261101-v556';"));
ok('index ES: app.js?v=372', idx.includes('app.js?v=372'));
ok('index ES: styles intacto 20261089', idx.includes('styles.css?v=20261089'));
ok('index EN: sin app.js, styles intacto', !en.includes('app.js?v=') && en.includes('styles.css?v=20261089'));
ok('CHUNK_V v556 (chunk-ajustes tocado)', app.includes("const CHUNK_V = '20261101-v556';"));
ok('sin funciones nuevas en el lote', count(app, 'function pzSaltomiplan') === 0 && count(chk, 'function pzSaltomiplan') === 0);

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed ? 1 : 0);
