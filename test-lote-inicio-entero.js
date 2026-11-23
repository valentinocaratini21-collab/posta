'use strict';
/* LOTE INICIO-ENTERO — Inicio entra ENTERO en el teléfono y el
   encabezado se va con el scroll (pedidos del dueño 23/11 01:16 y
   01:18, con captura de su iPhone).
   Prueba, en Chromium con viewports de iPhone y el estado EXACTO de la
   captura (cuenta de la casa, tarjeta del día vacía, pregunta de los
   lunes ya respondida, 3 posteos publicados):
   A · 390×844: el documento NO scrollea (scrollHeight == alto visible)
       y la primera tile de la grilla se ve ENTERA sobre la barra
       inferior; la celda NO se achicó (alto == el del control); todas
       las secciones siguen (encabezado, tira, tarjeta del día, perfil
       con la bio COMPLETA — jamás truncada —, racha, pestañas, grilla).
   B · 375×667 (variante compacta, decisión del dueño 23/11 01:49):
       Inicio CIERRA también acá — sin scroll, primera tile entera
       sobre la barra, ninguna sección desapareció, la bio completa
       y sin truncar, la celda sin achicar, y el encabezado sigue sin
       ser fijo en Inicio.
   C · 390×844 con 9 posteos (hay scroll de verdad): al deslizar, el
       encabezado se va con el contenido; el contenido no salta (el
       offset documental de la primera tile no cambia en la ida y
       vuelta); arriba de todo, el encabezado está en su lugar.
   D · 390×664 (variante compacta): CIERRA — sin scroll y tile entera.
   F · 375×667 con 9 posteos (bajo la variante hay scroll de verdad):
       el encabezado se va al deslizar y vuelve a su lugar sin saltos.
   E · Fuera de Inicio (Subir), el encabezado de la cáscara SIGUE fijo
       (sticky): el cambio es solo de Inicio, declarado.
   S · Estático: la regla base sticky de .pz-shell-head sigue verbatim
       en styles.css, el override vive acotado a .bb-glass-inicio, y
       la variante compacta vive SOLO dentro de
       @media (max-height:720px) and (max-width:760px) — pantallas
       bajas de teléfono; una ventana de escritorio baja no cuenta —
       y a 390×844 las secciones del lote base miden lo mismo que sin
       la variante (A5).
   EXTENSIÓN PROMESA (TARJETA-PROMESA-9AM aterrizó después que este
   lote): el estado vacío de la captura hoy es la tarjeta de la
   promesa (.promesa), que sin comprimir medía 193.5px a 390×844 y
   168.4px en pantallas bajas y rompía el cierre. La compresión de
   este lote la alcanza (movimiento 4 del bloque CSS): A4c afirma el
   estado promesa SIN el botón «Que Posty lo arme» (TARJETA lo sacó
   a propósito: contradecía la promesa) y con su link de subir; A5
   pincha su altura comprimida (159.5px) y B8/D5 la de la variante
   (110.3px). La altura es la misma en los dos estados de hoy de la
   promesa (antes de las 9:00 y «está en armado.»): la línea lleva
   line-height fijo en px.
   CONTROL (árbol prístino, HEAD sin el lote): A1/A2/A5/B/C2/D/F/S3
   fallan — la tile queda cortada por la barra (bottom 809 > barra
   778; faltantes de 193.7px a 375×667 y 211.4px a 390×664) y el
   encabezado queda fijo al deslizar: es el defecto de la captura
   del dueño. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const ROOT = path.resolve(__dirname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, total = 0;
function ok(cond, msg) { total++; console.log((cond ? 'ok ' : 'FALLO ') + total + ' - ' + msg); if (!cond) fails++; }

const SEED_JS = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
const iso = (ms) => new Date(ms).toISOString();
const D = 86400000;
function usuario(id, email) {
  db.prepare("INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at) VALUES (?, ?, ?, 'posty', 'active', 0, 0, 0, NULL, NULL, 1, 'es', 1, '2026-09-01 10:00:00')").run(id, email, hash);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)').run(id, 'Posty', 'posty.communitymanager', 'community manager');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
function posteo(id, uid, dias, code) {
  db.prepare("INSERT INTO posts (id, user_id, image_path, caption, status, media_type, scheduled_at, published_at, ig_permalink, created_at) VALUES (?, ?, '/media/semilla.jpg', 'POSTEO QA', 'published', 'image', ?, ?, ?, ?)").run(id, uid, iso(Date.now() - dias * D), iso(Date.now() - dias * D), 'https://www.instagram.com/p/' + code + '/', iso(Date.now() - dias * D));
}
usuario(601, 'dueno@inicioqa.test');
posteo(6011, 601, 1, 'SEMILLA1'); posteo(6012, 601, 8, 'SEMILLA2'); posteo(6013, 601, 15, 'SEMILLA3');
usuario(602, 'largo@inicioqa.test');
for (let i = 0; i < 9; i++) posteo(6021 + i, 602, 1 + i, 'LARGA' + (i + 1));
console.log('SEED_OK');
`;

const BIO = '"No tengo tiempo de postear en IG"\nNosotros posteamos TODOS los días por tu negocio, con tu producto real\n🚀 Lanzamiento: 1/2/2027\n👇 Sumate a la lista';
function perfilJSON() {
  return JSON.stringify({ ok: true, username: 'posty.communitymanager', name: 'Posty', pic: '', is_verified: true, posts_count: 1, followers: 8, following: 2, bio: BIO, category: null, note: null, location: null, recents: [] });
}
function vivoJSON(codes) {
  return JSON.stringify({ ok: true, complete: true, shortcodes: codes, window_oldest: new Date(Date.now() - 30 * 86400000).toISOString() });
}

function buscarPuerto() {
  const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
  for (let p = 37200; p < 37500; p++) if (!out.includes(':' + p + ' ')) return p;
  return 0;
}
function cargarPlaywright() {
  const cands = [path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core'), '/tmp/pw-boot/node_modules/playwright-core', 'playwright-core'];
  for (const c of cands) { try { return require(c); } catch (e) {} }
  return null;
}
function chromiumExe() {
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  try {
    for (const dir of fs.readdirSync(base)) {
      const p = path.join(base, dir, 'chrome-linux', 'chrome');
      if (dir.startsWith('chromium') && fs.existsSync(p)) return p;
    }
  } catch (e) {}
  return undefined;
}

async function main() {
  /* S: estático */
  const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
  const reglaBase = '.pz-shell-head{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;max-width:560px;margin:0 auto;width:100%;box-sizing:border-box}';
  ok(css.includes(reglaBase), 'S1: la regla base sticky del encabezado sigue verbatim (las demás pantallas no cambian)');
  ok(css.includes('.bb-app.bb-glass-inicio .pz-shell-head{position:relative'), 'S2: el override del encabezado vive acotado a Inicio (.bb-glass-inicio)');
  const mqIdx = css.indexOf('@media (max-height:720px) and (max-width:760px){');
  const bloqueVar = mqIdx >= 0 ? css.slice(mqIdx, css.indexOf('/* ===== /LOTE INICIO-ENTERO ===== */', mqIdx)) : '';
  ok(mqIdx >= 0 && css.indexOf('@media (max-height:720px) and (max-width:760px){', mqIdx + 1) === -1 && bloqueVar.includes('#inicioView .hf-bio{font-size:12.25px') && bloqueVar.includes('.pz-shell-ava{width:34px'), 'S3: la variante compacta existe una sola vez y vive SOLO dentro de @media (max-height:720px) and (max-width:760px) — pantallas bajas de teléfono');

  const PORT = buscarPuerto();
  if (!PORT) { ok(false, 'sin puerto libre'); return; }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-suite-'));
  fs.writeFileSync(path.join(tmpD, 'seed.js'), SEED_JS);
  execFileSync(process.execPath, [path.join(tmpD, 'seed.js'), tmpD, ROOT], { encoding: 'utf8', timeout: 120000 });
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-ie', DEMO_AI_DAILY_CAP_USD: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + PORT;
  let browser = null;
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) {} if (!up) await sleep(500); }
    ok(up, 'boot del servidor de prueba');
    const pw = cargarPlaywright();
    if (!pw) { ok(false, 'playwright-core no disponible'); return; }
    browser = await pw.chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox'] });

    async function sesion(email, codes, viewport) {
      const lr = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'ClaveQA123' }) });
      if (lr.status !== 200) throw new Error('login ' + lr.status);
      const m = (lr.headers.get('set-cookie') || '').match(/^([^=]+)=([^;]+)/);
      const ctx = await browser.newContext({ viewport });
      await ctx.addCookies([{ name: m[1], value: m[2], url: base }]);
      const page = await ctx.newPage();
      await page.route('**/api/home/profile', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: perfilJSON() }));
      await page.route('**/api/home/live-grid', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: vivoJSON(codes) }));
      await page.route('**/api/weekly-consultas', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rango: 2, week_key: '2026-W48' }) }));
      await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#inicioView .hf-grid .hf-tile', { timeout: 30000 });
      for (let i = 0; i < 30; i++) {
        const listo = await page.evaluate(() => { const v = document.getElementById('inicioView'); const t = document.querySelector('#inicioView .hf-tile'); return !!(v && t && v.querySelector('.hf-bio') && v.querySelector('.pz-semana-mini')); });
        if (listo) break;
        await sleep(400);
      }
      await sleep(600);
      return { ctx, page };
    }
    const MEDIR = () => {
      const r = (el) => el ? { top: Math.round(el.getBoundingClientRect().top * 10) / 10, bottom: Math.round(el.getBoundingClientRect().bottom * 10) / 10, h: Math.round(el.getBoundingClientRect().height * 10) / 10 } : null;
      const head = document.querySelector('.pz-shell-head');
      const tile = document.querySelector('#inicioView .hf-grid .hf-tile');
      const bar = document.querySelector('.bb-bar');
      const bio = document.querySelector('#inicioView .hf-bio');
      return {
        docScrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
        head: r(head), headPos: head ? getComputedStyle(head).position : null,
        headBtnCampana: !!document.querySelector('.pz-shell-head .pz-hbtn-bell, .pz-shell-head [data-pzcampana], .pz-shell-head button'),
        tira: r(document.querySelector('#inicioView .pz-semana-mini')),
        diasTira: document.querySelectorAll('#inicioView .pz-semana-dia').length,
        detalle: r(document.querySelector('#inicioView .pz-hoy-tira-detalle')),
        detallePromesa: (() => { const d = document.querySelector('#inicioView .pz-hoy-tira-detalle'); return !!(d && d.classList.contains('promesa')); })(),
        detalleTexto: (() => { const d = document.querySelector('#inicioView .pz-hoy-tira-detalle'); return d ? d.textContent.replace(/\s+/g, ' ') : ''; })(),
        detalleBtn: (document.querySelector('#inicioView .pz-hoy-glass-btn') || {}).textContent || '',
        detalleLink: (document.querySelector('#inicioView .pz-hoy-subir-link') || {}).textContent || '',
        perfil: r(document.querySelector('#inicioView .hf-head')),
        stats: document.querySelectorAll('#inicioView .hf-stat').length,
        bioTexto: bio ? bio.textContent : '',
        bioSinTruncar: bio ? (bio.scrollHeight <= bio.clientHeight + 1) : false,
        racha: r(document.querySelector('#inicioView .hf-racha')),
        tabs: document.querySelectorAll('#inicioView .hf-tab').length,
        tiles: document.querySelectorAll('#inicioView .hf-grid .hf-tile').length,
        tile: r(tile),
        tileDocTop: tile ? Math.round((tile.getBoundingClientRect().top + window.scrollY) * 10) / 10 : null,
        bar: r(bar),
      };
    };

    /* A · 390×844, estado de la captura */
    {
      const { ctx, page } = await sesion('dueno@inicioqa.test', ['SEMILLA1', 'SEMILLA2', 'SEMILLA3'], { width: 390, height: 844 });
      const m = await page.evaluate(MEDIR);
      ok(m.docScrollH <= m.innerH + 1, 'A1: 390×844 sin scroll — scrollHeight ' + m.docScrollH + ' == alto visible ' + m.innerH);
      ok(m.tile && m.bar && m.tile.bottom <= m.bar.top + 0.5, 'A2: la primera tile se ve ENTERA sobre la barra (bottom ' + (m.tile && m.tile.bottom) + ' <= barra ' + (m.bar && m.bar.top) + ')');
      ok(m.tile && m.tile.h >= 158, 'A3: la celda NO se achicó (alto ' + (m.tile && m.tile.h) + 'px, como en el control)');
      ok(!!m.head && m.headBtnCampana, 'A4a: encabezado con sus botones presente');
      ok(m.tira && m.diasTira === 7, 'A4b: tira de la semana con sus 7 días');
      ok(m.detalle && m.detallePromesa && m.detalleBtn === '' && /subir algo/i.test(m.detalleLink) && (/9:00/.test(m.detalleTexto) || /armado/i.test(m.detalleTexto)), 'A4c: tarjeta del día en estado PROMESA (la de las 9:00), SIN el botón «Que Posty lo arme» — TARJETA lo sacó a propósito — y con su link de subir');
      ok(m.perfil && m.stats === 3, 'A4d: perfil con avatar y sus 3 contadores');
      ok(m.bioTexto.includes('No tengo tiempo de postear en IG') && m.bioTexto.includes('TODOS los días') && m.bioTexto.includes('Lanzamiento: 1/2/2027') && m.bioTexto.includes('Sumate a la lista'), 'A4e: la bio está COMPLETA (las 4 líneas)');
      ok(m.bioSinTruncar, 'A4f: la bio no está truncada (scrollHeight == clientHeight)');
      ok(!!m.racha, 'A4g: la racha sigue en el perfil');
      ok(m.tabs === 3 && m.tiles === 3, 'A4h: pestañas (3) y grilla (3 posteos) presentes');
      const cerca = (v, esp) => v !== null && Math.abs(v - esp) <= 0.7;
      ok(cerca(m.head.h, 60) && cerca(m.tira.h, 57.5) && cerca(m.detalle.h, 159.5) && cerca(m.perfil.h, 257.3) && cerca(m.tile.h, 159.1) && cerca(m.tile.bottom, 756.4), 'A5: IDENTIDAD del lote base a 390×844 en las secciones de siempre (head 60 · tira 57.5 · perfil 257.3 · tile 159.1) y la tarjeta de la PROMESA a su altura comprimida por este lote: 159.5px (sin comprimir medía 193.5 y rompía el cierre) — head ' + m.head.h + ' · tira ' + m.tira.h + ' · tarjeta ' + m.detalle.h + ' · perfil ' + m.perfil.h + ' · tile ' + m.tile.h + '/' + m.tile.bottom);
      await ctx.close();
    }

    /* B · 375×667: la variante compacta CIERRA (decisión del dueño 01:49) */
    {
      const { ctx, page } = await sesion('dueno@inicioqa.test', ['SEMILLA1', 'SEMILLA2', 'SEMILLA3'], { width: 375, height: 667 });
      const m = await page.evaluate(MEDIR);
      ok(!!m.head && !!m.tira && !!m.detalle && !!m.perfil && m.tabs === 3 && m.tiles === 3, 'B1: 375×667 — ninguna sección desapareció');
      ok(m.docScrollH <= m.innerH + 1, 'B2: 375×667 SIN scroll bajo la variante — scrollHeight ' + m.docScrollH + ' == alto visible ' + m.innerH);
      ok(m.tile && m.bar && m.tile.bottom <= m.bar.top - 5, 'B3: la primera tile se ve ENTERA sobre la barra con margen (bottom ' + (m.tile && m.tile.bottom) + ' vs barra ' + (m.bar && m.bar.top) + ')');
      ok(m.tile && Math.abs(m.tile.h - 152.4) <= 0.7, 'B4: la celda tampoco se achicó en la variante (alto ' + (m.tile && m.tile.h) + 'px, el del lote base a este ancho)');
      ok(m.bioTexto.includes('No tengo tiempo de postear en IG') && m.bioTexto.includes('TODOS los días') && m.bioTexto.includes('Lanzamiento: 1/2/2027') && m.bioTexto.includes('Sumate a la lista') && m.bioSinTruncar, 'B5: la bio está COMPLETA y sin truncar también en la variante');
      ok(!!m.racha && m.stats === 3, 'B6: racha y contadores siguen en el perfil compacto');
      ok(m.headPos !== 'sticky' && m.headPos !== 'fixed', 'B7: en Inicio el encabezado sigue sin ser fijo bajo la variante (position: ' + m.headPos + ')');
      ok(m.detalle && Math.abs(m.detalle.h - 110.3) <= 0.7, 'B8: la tarjeta de la PROMESA bajo la variante mide su altura comprimida: 110.3px (sin comprimir medía 168.4 y rompía el cierre) — mide ' + (m.detalle && m.detalle.h));
      await ctx.close();
    }

    /* C · 390×844 con grilla larga: el encabezado se va y nada salta */
    {
      const { ctx, page } = await sesion('largo@inicioqa.test', ['LARGA1', 'LARGA2', 'LARGA3', 'LARGA4', 'LARGA5', 'LARGA6', 'LARGA7', 'LARGA8', 'LARGA9'], { width: 390, height: 844 });
      const m0 = await page.evaluate(MEDIR);
      ok(m0.tiles === 9 && m0.docScrollH > m0.innerH, 'C1: con 9 posteos la pantalla sí scrollea (base del escenario)');
      await page.evaluate(() => window.scrollTo(0, 600));
      await sleep(500);
      const m1 = await page.evaluate(MEDIR);
      ok(m1.head && m1.head.bottom <= 0, 'C2: deslizando, el encabezado se fue con el contenido (bottom ' + (m1.head && m1.head.bottom) + ')');
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);
      const m2 = await page.evaluate(MEDIR);
      ok(m2.head && m2.head.top === 0 && m2.tileDocTop === m0.tileDocTop, 'C3: ida y vuelta sin saltos — la tile vuelve a su offset exacto (' + m0.tileDocTop + ' -> ' + m2.tileDocTop + ') y el encabezado está arriba');
      await ctx.close();
    }

    /* D · 390×664: la variante compacta CIERRA */
    {
      const { ctx, page } = await sesion('dueno@inicioqa.test', ['SEMILLA1', 'SEMILLA2', 'SEMILLA3'], { width: 390, height: 664 });
      const m = await page.evaluate(MEDIR);
      ok(m.docScrollH <= m.innerH + 1, 'D1: 390×664 SIN scroll bajo la variante — scrollHeight ' + m.docScrollH + ' == alto visible ' + m.innerH);
      ok(m.tile && m.bar && m.tile.bottom <= m.bar.top - 5, 'D2: la primera tile se ve ENTERA sobre la barra con margen (bottom ' + (m.tile && m.tile.bottom) + ' vs barra ' + (m.bar && m.bar.top) + ')');
      ok(m.tile && Math.abs(m.tile.h - 159.1) <= 0.7, 'D3: la celda intacta a 390×664 (alto ' + (m.tile && m.tile.h) + 'px)');
      ok(m.bioTexto.includes('Sumate a la lista') && m.bioSinTruncar && !!m.racha, 'D4: bio completa sin truncar y racha presente a 390×664');
      ok(m.detalle && Math.abs(m.detalle.h - 110.3) <= 0.7, 'D5: la tarjeta de la PROMESA a 390×664 mide su altura comprimida de la variante: 110.3px — mide ' + (m.detalle && m.detalle.h));
      await ctx.close();
    }

    /* F · 375×667 con grilla larga: bajo la variante, si hay scroll el encabezado se va */
    {
      const { ctx, page } = await sesion('largo@inicioqa.test', ['LARGA1', 'LARGA2', 'LARGA3', 'LARGA4', 'LARGA5', 'LARGA6', 'LARGA7', 'LARGA8', 'LARGA9'], { width: 375, height: 667 });
      const m0 = await page.evaluate(MEDIR);
      ok(m0.tiles === 9 && m0.docScrollH > m0.innerH, 'F1: con 9 posteos a 375×667 la pantalla sí scrollea (base del escenario)');
      await page.evaluate(() => window.scrollTo(0, 600));
      await sleep(500);
      const m1 = await page.evaluate(MEDIR);
      ok(m1.head && m1.head.bottom <= 0, 'F2: deslizando bajo la variante, el encabezado se fue con el contenido (bottom ' + (m1.head && m1.head.bottom) + ')');
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);
      const m2 = await page.evaluate(MEDIR);
      ok(m2.head && m2.head.top === 0 && m2.tileDocTop === m0.tileDocTop, 'F3: ida y vuelta sin saltos bajo la variante — la tile vuelve a su offset exacto (' + m0.tileDocTop + ' -> ' + m2.tileDocTop + ')');
      await ctx.close();
    }

    /* E · fuera de Inicio, la cáscara no cambia */
    {
      const { ctx, page } = await sesion('dueno@inicioqa.test', ['SEMILLA1', 'SEMILLA2', 'SEMILLA3'], { width: 390, height: 844 });
      await page.goto(base + '/#/app/subir', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.pz-shell-head', { timeout: 20000 });
      await sleep(600);
      const pos = await page.evaluate(() => { const h = document.querySelector('.pz-shell-head'); return h ? getComputedStyle(h).position : null; });
      ok(pos === 'sticky', 'E1: en Subir el encabezado SIGUE fijo (sticky) — el cambio es solo de Inicio');
      await ctx.close();
    }
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}
    await sleep(400);
    fs.rmSync(tmpD, { recursive: true, force: true });
  }
  console.log('== INICIO-ENTERO: ' + (total - fails) + '/' + total + ' ok' + (fails ? ' — ' + fails + ' FALLOS' : ''));
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.log('ERROR ' + (e && e.message)); process.exit(1); });
