// test-igmock-ava.js — v361: el avatar del encabezado de la tarjeta NUNCA
// puede renderizarse como banner.
// Causa raíz del bug (captura de Valentino 24/10): la capa .scf-pop con la
// tarjeta .igmock se monta DENTRO de la tile del feed de inicio (.hf-tile),
// y la regla del media de la tile `.hf-tile img{width:100%;height:100%}`
// (especificidad 0-1-1) le ganaba a `.igmock-ava{36px}` (0-1-0): el logo
// del negocio se inflaba a 300x300 arriba de la tarjeta.
// Garantías que fija este test (CSS servido, sin navegador):
//  1. Ninguna regla de media de tile queda SIN acotar (descendiente):
//     .hf-tile img / .fp-tile img ya no existen como selectores.
//  2. Las reglas de media de tile quedan acotadas a hijos directos
//     (.hf-tile>img, .fp-tile>img) con el mismo 100%x100% de siempre:
//     la tile se sigue viendo igual; el pop montado adentro no hereda.
//  3. El contrato del avatar: .igmock-ava declara 36px + topes
//     max-width/max-height:36px.
//  4. La guarda .igmock .igmock-ava (0-2-0) existe con 36px + topes:
//     ninguna regla genérica de contenedor puede volver a inflarlo en
//     ninguna superficie (pop de Semana, pop desde el inicio, Día,
//     carrusel de revisión — todos comparten .igmock>.igmock-head).
//  5. El HTML que emiten los constructores mantiene el contrato: el
//     avatar va con class="igmock-ava" dentro de .igmock-head dentro de
//     .igmock, y el media de la tile sigue siendo hijo directo.
//  6. El CSS servido por el server booteado trae las marcas del fix.
// Uso: node test-igmock-ava.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

// Extrae el cuerpo de la primera regla cuyo selector coincide EXACTO.
function ruleBody(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

console.log('— v361 igmock-ava: reglas de tile acotadas');
ok(!/(^|,)\s*\.hf-tile\s+img/.test(css), '1a no queda regla sin acotar «.hf-tile img»');
ok(!/(^|,)\s*\.hf-tile\s+video/.test(css), '1b no queda regla sin acotar «.hf-tile video»');
ok(!/(^|,)\s*\.fp-tile\s+img/.test(css), '1c no queda regla sin acotar «.fp-tile img»');
ok(!/(^|,)\s*\.fp-tile\s+video/.test(css), '1d no queda regla sin acotar «.fp-tile video»');
const hfBody = ruleBody('.hf-tile>img,.hf-tile>video');
ok(!!hfBody && hfBody.includes('width:100%') && hfBody.includes('height:100%'), '2a «.hf-tile>img,.hf-tile>video» conserva el 100%x100% del media propio');
const fpBody = ruleBody('.fp-tile>img,.fp-tile>video');
ok(!!fpBody && fpBody.includes('width:100%') && fpBody.includes('height:100%'), '2b «.fp-tile>img,.fp-tile>video» conserva el 100%x100% del media propio');

console.log('— v361 igmock-ava: contrato del avatar');
const avaBody = ruleBody('.igmock-ava');
ok(!!avaBody, '3a existe la regla base .igmock-ava');
ok(!!avaBody && avaBody.includes('width:36px') && avaBody.includes('height:36px'), '3b .igmock-ava declara 36x36');
ok(!!avaBody && avaBody.includes('max-width:36px') && avaBody.includes('max-height:36px'), '3c .igmock-ava declara topes max-width/max-height:36px');
const guardBody = ruleBody('.igmock .igmock-ava');
ok(!!guardBody, '4a existe la guarda .igmock .igmock-ava');
ok(!!guardBody && guardBody.includes('width:36px') && guardBody.includes('height:36px')
  && guardBody.includes('max-width:36px') && guardBody.includes('max-height:36px'),
  '4b la guarda fija 36x36 con topes (le gana a reglas de contenedor 0-1-1)');

console.log('— v361 igmock-ava: contrato HTML de los constructores');
const wcStart = appSrc.indexOf('function weekCardHTML(');
const wc = appSrc.slice(wcStart, appSrc.indexOf('\nfunction ', wcStart + 10));
ok(wc.includes('class="igmock-ava"'), '5a weekCardHTML emite el avatar con class="igmock-ava"');
ok(wc.includes('<div class="igmock-head">'), '5b weekCardHTML emite .igmock-head dentro de la tarjeta .igmock');
const htStart = appSrc.indexOf('function homeTileHTML(');
const ht = appSrc.slice(htStart, appSrc.indexOf('\nfunction ', htStart + 10));
ok(ht.includes('scf-mini-x hf-tile'), '5c homeTileHTML sigue emitiendo la tile .hf-tile');
ok(ht.includes('>${media}${pill}'), '5d el media de la tile sigue siendo hijo directo (la acotación con > no la rompe)');

(async () => {
  console.log('— v361 igmock-ava: CSS servido por el server');
  const TMPD = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-v361-'));
  const PORT = 18795;
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, DATA_DIR: TMPD, PORT: String(PORT), TMPDIR: os.tmpdir() },
    stdio: 'ignore',
  });
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); up = r.ok; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 400));
    }
    ok(up, '6a el server bootea');
    if (up) {
      const served = await (await fetch(`http://127.0.0.1:${PORT}/styles.css?v=20261024b`)).text();
      ok(served.includes('.igmock .igmock-ava{width:36px;height:36px;max-width:36px;max-height:36px}'), '6b el CSS servido trae la guarda del avatar');
      ok(served.includes('.hf-tile>img,.hf-tile>video'), '6c el CSS servido trae la regla de tile acotada');
      ok(!/(^|,)\s*\.hf-tile\s+img/.test(served), '6d el CSS servido ya no trae la regla sin acotar');
      const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
      ok(idx.includes('/styles.css?v=20261024b'), '6e el index servido referencia styles.css?v=20261024b');
    }
  } finally {
    try { child.kill(); } catch (e) {}
  }
  console.log(`\n${total - fails}/${total} checks OK`);
  process.exit(fails ? 1 : 0);
})();
