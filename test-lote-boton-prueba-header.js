#!/usr/bin/env node
// test-lote-boton-prueba-header.js — LOTE BOTÓN-PRUEBA-HEADER (v1069; provisorio del builder v1000).
// Pedido de Valentino (12/11 23:32): en el header del sitio todos los links son
// texto plano y ninguno resalta — falta UN botón destacado para la prueba.
//
//  §E Estático (archivos del release):
//     · ES y EN: el header servido trae UN botón con class="nav-cta", texto
//       exacto («Probá 3 días gratis» / «Try 3 days free»), href DIRECTO al
//       flujo de la prueba (/prueba · /en/prueba), ubicado al final de la
//       barra (después del último link y de .lp-entrar) y FUERA del menú
//       hamburguesa (mobile-menu).
//     · styles.css: la regla .nav-cta lleva los colores exactos de marca
//       (fondo #FEC14D, texto #0A1E33); es el único relleno de la barra
//       (ninguna regla de .nav-links a / .lp-entrar / .logo gana background);
//       ninguna regla oculta .nav-cta (en el bloque ≤760px, donde
//       .nav-links{display:none}, el botón solo se compacta, no se esconde).
//     · El resto de los links del header quedan intactos (mismos hrefs y
//       textos que la base); styles.css?v=20261283 en AMBOS index;
//       app.js?v= sin cambios; BUILD_ID v1000.
//  §B Boot real (sandbox, DATA_DIR en /tmp): /, /en, /styles.css y
//     /api/version sirven lo de arriba; /prueba responde 200 (el destino).
//  §C Control sobre la base v1068: no existe nav-cta en ningún archivo.
//
// Uso: node test-lote-boton-prueba-header.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let fails = 0, total = 0;
const ok = (cond, msg, extra) => {
  total++;
  if (cond) console.log('  ✓', msg);
  else { fails++; console.error('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
};
const read = (p) => fs.readFileSync(p, 'utf8');
const ROOT = __dirname;
const BASE_ROOT = path.join(ROOT, '..', 'base');

// Extrae el bloque de la barra: desde <div class="nav nav-landing"> hasta el banner.
function navBlock(html) {
  const a = html.indexOf('<div class="nav nav-landing">');
  const b = html.indexOf('id="campBanner"');
  return (a >= 0 && b > a) ? html.slice(a, b) : '';
}
function count(hay, needle) { return hay.split(needle).length - 1; }

// ───────────────────────── §E · Estático ─────────────────────────
console.log('§E estático (release)');
{
  const es = read(path.join(ROOT, 'public', 'index.html'));
  const en = read(path.join(ROOT, 'public', 'en', 'index.html'));
  const css = read(path.join(ROOT, 'public', 'styles.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  const srv = read(path.join(ROOT, 'server.js'));

  // — ES —
  ok(count(es, 'class="nav-cta"') === 1, 'E1 ES: exactamente un botón .nav-cta en la página');
  ok(es.includes('<a class="nav-cta" href="/prueba">Probá 3 días gratis</a>'), 'E1 ES: botón con texto exacto y href directo a /prueba (arranca la prueba, no la sección)');
  const navEs = navBlock(es);
  ok(navEs.includes('class="nav-cta"'), 'E1 ES: el botón vive dentro de la barra del header');
  ok(navEs.indexOf('class="nav-cta"') > navEs.indexOf('class="lp-entrar"'), 'E1 ES: el botón va al final de la barra (después de Entrar)');
  ok(navEs.indexOf('class="nav-cta"') > navEs.indexOf('href="#faq"'), 'E1 ES: el botón va después del último link de .nav-links');
  for (const [href, txt] of [['#prueba', 'La prueba'], ['#como-funciona', 'Cómo trabaja'], ['#equipo', 'Equipo'], ['#ads', 'Ads'], ['#planes', 'Plan'], ['#faq', 'Preguntas']]) {
    ok(navEs.includes(`href="${href}"`) && navEs.includes(`>${txt}</a>`), `E2 ES: link intacto ${txt} (${href})`);
  }
  ok(navEs.includes('class="lp-entrar"'), 'E2 ES: .lp-entrar sigue como estaba');

  // — EN —
  ok(count(en, 'class="nav-cta"') === 1, 'E3 EN: exactamente un botón .nav-cta en la página');
  ok(en.includes('<a class="nav-cta" href="/en/prueba">Try 3 days free</a>'), 'E3 EN: botón con texto exacto y href directo a /en/prueba');
  const navEn = navBlock(en);
  ok(navEn.includes('class="nav-cta"'), 'E3 EN: el botón vive dentro de la barra del header');
  ok(navEn.indexOf('class="nav-cta"') > navEn.indexOf('class="lp-entrar"'), 'E3 EN: el botón va al final de la barra (después de Log in)');
  ok(navEn.indexOf('class="nav-cta"') < navEn.indexOf('class="mobile-menu"'), 'E3 EN: el botón NO está dentro del menú hamburguesa (mobile-menu)');
  ok(navEn.indexOf('class="nav-cta"') < navEn.indexOf('id="mobileMenu"'), 'E3 EN: el botón está antes del mobile-menu en el DOM (barra, no menú)');
  for (const [href, txt] of [['#prueba', 'The trial'], ['#como-funciona', 'How it works'], ['#equipo', 'Team'], ['#ads', 'Ads'], ['#planes', 'Plan'], ['#faq', 'FAQ']]) {
    ok(navEn.includes(`href="${href}"`) && navEn.includes(`>${txt}</a>`), `E4 EN: link intacto ${txt} (${href})`);
  }

  // — CSS —
  const ctaRule = (css.match(/\.nav-cta\{[^}]*\}/) || [''])[0];
  ok(ctaRule.includes('background:#FEC14D'), 'E5 CSS: .nav-cta fondo amarillo Posty exacto #FEC14D', ctaRule);
  ok(ctaRule.includes('color:#0A1E33'), 'E5 CSS: .nav-cta texto navy exacto #0A1E33', ctaRule);
  ok(!/\.nav-cta[^{]*\{[^}]*display\s*:\s*none/.test(css), 'E6 CSS: ninguna regla pone display:none a .nav-cta (visible en móvil)');
  ok(!/\.nav-links a[^{]*\{[^}]*background\s*:/.test(css), 'E6 CSS: los links de .nav-links no ganan relleno');
  ok(!/\.lp-entrar[^{]*\{[^}]*background\s*:/.test(css), 'E6 CSS: .lp-entrar no gana relleno (sigue siendo solo borde)');
  // La ventana del bloque ≤760px DE LA LANDING (hay muchos @media iguales):
  // se ancla en la regla móvil de .lp-entrar, única de ese bloque.
  const lpIdx = css.indexOf('.nav-landing .lp-entrar{display:inline-flex');
  const mediaBlock = lpIdx >= 0 ? css.slice(Math.max(0, lpIdx - 3000), lpIdx + 3000) : '';
  ok(mediaBlock.includes('.nav-landing .nav-links{display:none}'), 'E6 CSS: en ≤760px los links se esconden (contexto del control)');
  ok(mediaBlock.includes('.nav-landing .nav-cta{'), 'E6 CSS: en ≤760px el botón tiene regla propia y visible (solo se compacta)');
  ok(!mediaBlock.includes('.nav-cta{display:none'), 'E6 CSS: en ≤760px el botón NO se esconde');

  // — Estampados —
  ok(es.includes('/styles.css?v=20261283') && en.includes('/styles.css?v=20261283'), 'E7 styles.css?v=20261283 en AMBOS index (mismo valor)');
  ok(es.includes('/app.js?v=725'), 'E7 ES: app.js?v= sin cambios (725; app.js no se tocó)');
  ok(!en.includes('app.js?v='), 'E7 EN: sigue sin app.js?v= (como siempre)');
  ok(srv.includes("BUILD_ID = '20261105-v1069'"), 'E7 server.js: BUILD_ID 20261105-v1069');
}

// ───────────────────────── §C · Control base ─────────────────────────
console.log('§C control sobre la base v1068');
{
  const bEs = read(path.join(BASE_ROOT, 'public', 'index.html'));
  const bEn = read(path.join(BASE_ROOT, 'public', 'en', 'index.html'));
  const bCss = read(path.join(BASE_ROOT, 'public', 'styles.css'));
  ok(!bEs.includes('nav-cta') && !bEn.includes('nav-cta') && !bCss.includes('nav-cta'), 'C1 base: no hay botón .nav-cta en ningún archivo (el hueco)');
  ok(bEs.includes('/styles.css?v=20261282'), 'C1 base: styles.css?v=20261282 (pre-bump)');
}

// ───────────────────────── §B · Boot real ─────────────────────────
const PORT = 19412;
const BASE = `http://127.0.0.1:${PORT}`;
async function boot() {
  console.log('§B boot real (release)');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'boton-header-boot-'));
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), SESSION_SECRET: 'test-secret', ADMIN_TOKEN: 'test-admin', OPENAI_API_KEY: '', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try { const r = await fetch(`${BASE}/api/version`); up = r.ok; } catch (e) {}
  }
  ok(up, 'B0 el server levanta');
  try {
    if (up) {
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      ok(ver.build === '20261105-v1069', `B1 /api/version v1069 (vino ${ver.build})`);

      const home = await (await fetch(`${BASE}/`)).text();
      ok(home.includes('<a class="nav-cta" href="/prueba">Probá 3 días gratis</a>'), 'B2 GET / sirve el botón ES exacto con href a /prueba');
      ok(home.includes('/styles.css?v=20261283'), 'B2 GET / referencia styles.css?v=20261283');

      const homeEn = await (await fetch(`${BASE}/en/`)).text();
      ok(homeEn.includes('<a class="nav-cta" href="/en/prueba">Try 3 days free</a>'), 'B3 GET /en/ sirve el botón EN exacto con href a /en/prueba');

      const cssSrv = await (await fetch(`${BASE}/styles.css?v=20261283`)).text();
      const r = (cssSrv.match(/\.nav-cta\{[^}]*\}/) || [''])[0];
      ok(r.includes('background:#FEC14D') && r.includes('color:#0A1E33'), 'B4 styles servido: .nav-cta con #FEC14D y #0A1E33');

      const pr = await fetch(`${BASE}/prueba`);
      ok(pr.status === 200, `B5 el destino /prueba responde 200 (vino ${pr.status})`);
      const prEn = await fetch(`${BASE}/en/prueba`);
      ok(prEn.status === 200, `B5 el destino /en/prueba responde 200 (vino ${prEn.status})`);
    }
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
}

boot().then(() => {
  console.log(`\n${total - fails}/${total} ok · ${fails} fallas`);
  process.exit(fails ? 1 : 0);
}).catch((e) => { console.error('ERROR', e); process.exit(1); });
