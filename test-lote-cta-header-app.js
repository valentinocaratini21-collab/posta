#!/usr/bin/env node
// test-lote-cta-header-app.js — LOTE CTA-HEADER-APP (sobre v1078; provisorio del builder v1079).
// Pedido de Valentino (14/11 14:15 EST, captura de escritorio): en el header del
// website se ven los links «La prueba · Cómo trabaja · Equipo · Ads · Plan ·
// Preguntas · Ayuda · English · Entrar» y NINGÚN botón de prueba: «aca falta un
// boton que los lleve a hacer la prueba de 3 dias gratis !!!».
//
// DIAGNÓSTICO (verificado contra el vivo, /api/version v1077 al diagnosticar, re-basado a v1078 al aterrizar SUBIR-HOY):
//  · El header ESTÁTICO de public/index.html SÍ trae el botón desde v1069
//    (index.html: <a class="nav-cta" href="/prueba">Probá 3 días gratis</a>),
//    pero es solo el caparazón previo al JS: index.html carga /app.js y el boot,
//    en rutas de landing, hace root.innerHTML = landingView(PLANS_CACHE)
//    (app.js ×2), reemplazando TODO el caparazón por el markup de landingView.
//  · El header que pinta landingView (app.js, <div class="nav nav-landing">) NO
//    contenía .nav-cta (grep -a del bundle vivo, md5 idéntico al árbol: ×0).
//    Es el header de la captura: sus .nav-links son los únicos que incluyen
//    «Ayuda» y «English» (el caparazón estático no los trae).
//  · CSS no es la causa: .nav-cta (styles.css) es visible en todo ancho y su
//    compactación ≤760px dentro de .nav-landing ya existía.
//  · EN no tiene este problema: public/en/index.html es estático puro (NO carga
//    app.js) y su header ya trae «Try 3 days free» → /en/prueba desde v1069.
//
// EL CAMBIO: landingView suma el MISMO botón del caparazón — misma clase
// (.nav-cta), mismo texto y mismo destino (/prueba) — en la barra, después de
// .lp-entrar y antes del hamburguesa (el orden del caparazón estático), fuera
// de .nav-links y del menú móvil. Sin CSS nuevo: hereda la regla vigente y su
// compactación ≤760px.
//
//  §A El header de la app (landingView) trae el botón, una sola vez, en su lugar.
//  §B Los otros headers quedan como estaban (estático ES ×1 · estático EN ×1 ·
//     EN sin app.js: no existe un cuarto header).
//  §C CSS: ninguna regla oculta .nav-cta; la compactación móvil sigue intacta.
//  §D Pin del camino de boot que hace que este header sea el que se ve.
//  §E Control contra la base v1078: el header de la app no tiene botón
//     (reproduce la captura) y los estáticos sí — el delta es solo este header.
//  §F Boot real (DATA_DIR en /tmp): /, /app.js y /en/ sirven lo de arriba.
//
// Uso: node test-lote-cta-header-app.js
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
const count = (hay, needle) => hay.split(needle).length - 1;

// Bloque del header que pinta landingView: desde <div class="nav nav-landing">
// hasta el <div class="hero"> que le sigue.
function appNavBlock(appJs) {
  const a = appJs.indexOf('<div class="nav nav-landing">');
  const b = appJs.indexOf('<div class="hero">', a);
  return (a >= 0 && b > a) ? appJs.slice(a, b) : '';
}
// Bloque de la barra en un index estático: hasta el banner de campaña.
function staticNavBlock(html) {
  const a = html.indexOf('<div class="nav nav-landing">');
  const b = html.indexOf('id="campBanner"', a);
  return (a >= 0 && b > a) ? html.slice(a, b) : '';
}
const CTA_ES = '<a class="nav-cta" href="/prueba">Probá 3 días gratis</a>';
const CTA_EN = '<a class="nav-cta" href="/en/prueba">Try 3 days free</a>';

// ───────────────────────── §A · Header de la app ─────────────────────────
console.log('§A header de la app (landingView, release)');
{
  const app = read(path.join(ROOT, 'public', 'app.js'));
  const nav = appNavBlock(app);
  ok(nav.length > 0, 'A0 se extrajo el bloque del header de landingView');
  ok(count(nav, 'class="nav-cta"') === 1, 'A1 el header de la app trae exactamente UN .nav-cta');
  ok(count(app, 'class="nav-cta"') === 1, 'A1b en todo app.js hay un solo .nav-cta (sin duplicados en otras vistas)');
  ok(nav.includes(CTA_ES), 'A2 el botón es el del caparazón: class nav-cta, texto «Probá 3 días gratis», href directo a /prueba');
  const iLinks = nav.indexOf('class="nav-links"');
  const iLinksEnd = nav.indexOf('</div>', iLinks);
  const iEntrar = nav.indexOf('class="lp-entrar"');
  const iCta = nav.indexOf('class="nav-cta"');
  const iBurger = nav.indexOf('class="hamburger"');
  const iMenu = nav.indexOf('id="mobileMenu"');
  ok(iCta > iLinksEnd, 'A3 el botón está FUERA de .nav-links (como en el caparazón)');
  ok(iCta > iEntrar && iCta < iBurger, 'A4 orden de la barra: después de .lp-entrar y antes del hamburguesa (el orden del caparazón)');
  ok(iCta < iMenu, 'A5 el botón vive en la barra, no dentro del menú móvil');
  for (const t of ['La prueba', 'Cómo trabaja', 'Equipo', 'Ads', 'Plan', 'Preguntas', 'Ayuda', 'English', 'Entrar'])
    ok(nav.includes('>' + t + '</a>'), `A6 link intacto en el header de la app: ${t}`);
}

// ───────────────────────── §B · Los otros headers ─────────────────────────
console.log('§B estáticos ES/EN (release)');
{
  const es = read(path.join(ROOT, 'public', 'index.html'));
  const en = read(path.join(ROOT, 'public', 'en', 'index.html'));
  const navEs = staticNavBlock(es);
  ok(count(es, 'class="nav-cta"') === 1 && navEs.includes(CTA_ES), 'B1 ES estático: un solo .nav-cta en la barra, texto y destino de siempre (sin duplicar)');
  const navEn = staticNavBlock(en);
  ok(count(en, 'class="nav-cta"') === 1 && navEn.includes(CTA_EN), 'B2 EN estático: un solo .nav-cta «Try 3 days free» → /en/prueba');
  ok(!/<script[^>]*src="[^"]*app\.js/.test(en), 'B3 EN no carga app.js: no existe header EN de la app (el estático es el único header EN)');
}

// ───────────────────────── §C · CSS ─────────────────────────
console.log('§C CSS de visibilidad');
{
  const cssRaw = read(path.join(ROOT, 'public', 'styles.css'));
  const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/\.nav-cta\{display:inline-flex/.test(css), 'C1 la regla vigente .nav-cta es display:inline-flex (visible)');
  const ctaRules = css.match(/[^{}]*nav-cta[^{}]*\{[^}]*\}/g) || [];
  ok(ctaRules.length >= 2 && ctaRules.every(r => !/display\s*:\s*none|visibility\s*:\s*hidden/.test(r)),
    'C2 ninguna regla de .nav-cta lo oculta (ni display:none ni visibility:hidden)', ctaRules);
  ok(cssRaw.includes('/* ===== Landing mobile (≤760px): nav hamburguesa + hero compacto ===== */') &&
     css.includes('.nav-landing .nav-cta{font-size:13.5px;padding:10px 14px}'),
    'C3 la compactación ≤760px del botón dentro de .nav-landing sigue intacta (la hereda el header de la app)');
}

// ───────────────────────── §D · Camino de boot ─────────────────────────
console.log('§D boot');
{
  const app = read(path.join(ROOT, 'public', 'app.js'));
  ok(count(app, 'root.innerHTML = landingView(') === 2,
    'D1 el boot pinta landingView sobre la raíz ×2 (por eso su header es el que ve el visitante)');
}

// ───────────────────────── §E · Control contra la base ─────────────────────────
console.log('§E control (base v1078)');
{
  const appB = read(path.join(BASE_ROOT, 'public', 'app.js'));
  const navB = appNavBlock(appB);
  ok(navB.length > 0 && count(navB, 'class="nav-cta"') === 0 && count(appB, 'class="nav-cta"') === 0,
    'E1 BASE: el header de la app no tiene ningún .nav-cta (la captura de Valentino)');
  const esB = read(path.join(BASE_ROOT, 'public', 'index.html'));
  ok(staticNavBlock(esB).includes(CTA_ES), 'E2 BASE: el caparazón estático ES sí traía el botón (y la app lo pisaba)');
  const enB = read(path.join(BASE_ROOT, 'public', 'en', 'index.html'));
  ok(staticNavBlock(enB).includes(CTA_EN), 'E3 BASE: el estático EN ya estaba bien');
}

// ───────────────────────── §F · Boot real ─────────────────────────
const PORT = 35177;
async function boot() {
  console.log('§F boot real (release)');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cta-header-app-'));
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: TMP, SESSION_SECRET: 'test-secret', ADMIN_TOKEN: 'test-admin', OPENAI_API_KEY: '', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  srv.stderr.on('data', d => { err += d; });
  const BASE = `http://127.0.0.1:${PORT}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(`${BASE}/api/version`); up = r.ok; } catch (e) {}
      if (!up) await new Promise(r => setTimeout(r, 1000));
    }
    ok(up, 'F0 el server del release levantó', err.slice(-200));
    if (up) {
      const home = await (await fetch(`${BASE}/`)).text();
      const m = home.match(/app\.js\?v=(\d+)/);
      ok(!!m, 'F1 la home servida referencia app.js con stamp');
      const appLive = await (await fetch(`${BASE}/app.js?v=${m ? m[1] : 'x'}`)).text();
      const navLive = appNavBlock(appLive);
      ok(count(navLive, 'class="nav-cta"') === 1 && navLive.includes(CTA_ES),
        'F2 el bundle servido trae el botón en el header de landingView');
      const enLive = await (await fetch(`${BASE}/en/`)).text();
      ok(count(enLive, 'class="nav-cta"') === 1 && enLive.includes(CTA_EN),
        'F3 /en/ servido: el botón EN sigue presente, una sola vez');
      const pr = await fetch(`${BASE}/prueba`);
      ok(pr.status === 200, `F4 el destino /prueba responde 200 (vino ${pr.status})`);
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
