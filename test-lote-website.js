#!/usr/bin/env node
/* test-lote-website.js — LOTE WEBSITE (16/11/2026): el diseño actual del
   website con todo lo que la app tiene, según el mock aprobado (v14,
   fuente única: v2 pill verde · v3 sin badge · v4 frase «por tu negocio» ·
   v5 llegada · v6/v7 carrusel Patagonia · v8 texto de semana fuera ·
   v9 voz de equipo · v11/v13 Subir dúo Filthy Rich · v12 Ads · v14 banda
   de estrategia). Pins estáticos sobre app.js / index.html / en/index.html
   / styles.css + boot real con DATA_DIR aislado y chequeos HTTP.
   Corre con: node test-lote-website.js (lee el árbol que lo contiene). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const DIR = __dirname;
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');

let ok = 0, bad = 0;
function t(cond, name) {
  if (cond) { ok++; }
  else { bad++; console.log('FAIL:', name); }
}
function cnt(txt, sub) { return txt.split(sub).length - 1; }

/* ---------- 1. Hero: foto del equipo limpia + pill plural + frase nueva */
for (const [txt, name] of [[app, 'SPA'], [idx, 'shell']]) {
  t(txt.includes('pz-mg--heroI'), name + ' heroI');
  t(txt.includes('valentino-posty-fundador.jpg?v=2'), name + ' foto equipo');
  t(txt.includes('<div class="pill">Tus community managers</div>'), name + ' pill plural exacta');
  t(!txt.includes('posty-presentacion'), name + ' sin video de hero');
  t(!txt.includes('pz-mg--heroV'), name + ' sin heroV');
}
t(idxEn.includes('pz-mg--heroI') && idxEn.includes('valentino-posty-fundador.jpg?v=2'), 'EN hero foto equipo');
t(idxEn.includes('<div class="pill">Your community managers</div>'), 'EN pill plural exacta');
t(cnt(app, 'nosotros posteamos por tu negocio todos los días, con tu producto real') === 1, 'SPA frase plural x1');
t(cnt(idx, 'nosotros posteamos por tu negocio') === 1 && cnt(idx, 'Nosotros posteamos por tu negocio') === 2, 'shell frase plural h1+metas');
t(cnt(idxEn, 'we post for your business every day, with your real product') === 1 && cnt(idxEn, 'We post for your business every day with your real product') === 2, 'EN frase plural h1+metas');
t(!app.includes('Posty postea por') && !idx.includes('Posty postea por') && !idxEn.includes('Posty posts for you'), 'sin singular en ninguna superficie');

/* ---------- 2. Quiz fuera (las 3 superficies) + comparador intacto */
for (const [txt, name] of [[app, 'SPA'], [idx, 'shell'], [idxEn, 'EN']]) {
  t(!txt.includes('pp-mirror'), name + ' sin pp-mirror');
  t(!txt.includes('ppGoTrial'), name + ' sin ppGoTrial');
}
t(cnt(app, 'ppMirrorInit') === 0 && cnt(app, 'ppVerdictText') === 0 && cnt(app, 'ppRenderVerdict') === 0, 'SPA familia pp fuera');
t(!idx.includes('<script>(function(){var S=') && !idxEn.includes('<script>(function(){var S='), 'sin script inline del quiz');
t(cnt(app, 'function lpCarrInit()') === 1 && app.includes('lpCarrInit();'), 'lpCarrInit definida y llamada');
t(app.includes('pz-beforeafter') && app.includes('La diferencia se ve en una semana'), 'comparador intacto');

/* ---------- 2b. Formulario: Instagram + website, mismo paso (v15) */
t(cnt(app, 'placeholder="tu-negocio.com"') === 3, 'SPA website en 3 forms');
t(cnt(idx, 'placeholder="tu-negocio.com"') === 1, 'shell website en el form hero');
t(cnt(idxEn, 'placeholder="your-business.com"') === 3, 'EN website en 3 forms');
t(cnt(app, "querySelector('input[data-lp-web]')") === 4, 'SPA cableado web x4');
t(cnt(idxEn, "querySelector('input[data-lp-web]')") === 4, 'EN cableado web x4');
t(!app.includes('webMode') && !idx.includes('webMode') && !idxEn.includes('webMode'), 'sin webMode');

/* ---------- 3. Llegada del posteo (mock v5) */
t(app.includes('mk-arrive'), 'SPA bloque llegada');
t(app.includes('Tu posteo del día ya está listo. Sale hoy 7pm al feed y a tu story.'), 'SPA notif copia exacta');
t(!app.includes('El de hoy es la Berry Mille Crepe: salió a las 19:00 y ya está en tu feed, resaltado.'), 'SPA feed cap fuera (FUERA-REPETIDO)');
t(css.includes('.mk-feed figure:not(.mk-hoy) img{filter:brightness(.8)}'), 'CSS no-hoy oscurecidas');
t(idxEn.includes('Your post of the day is ready. It goes out today at 7pm to your feed and your story.'), 'EN notif');
t(!app.includes('¿No te cierra? Lo rehacés, lo editás, lo frenás o lo eliminás — todo desde la app, en un toque.'), 'SPA línea control del posteo fuera (FUERA-REPETIDO)');
t(!idxEn.includes('Not feeling it? Redo it, edit it, pause it or delete it — all from the app, in one tap.'), 'EN línea control del posteo fuera (FUERA-REPETIDO)');
t(css.includes('.mk-ctrl{'), 'CSS regla mk-ctrl');

/* ---------- 4. Carrusel Patagonia (mock v6/v7) */
t(app.includes('El día 2 es un carrusel') && app.includes('Patagonia · deslizá →'), 'SPA carrusel head');
t(app.includes('Es el día 2 de la prueba gratis: te armamos un carrusel con las fotos reales de tu negocio.'), 'SPA carrusel sub-línea');
t(app.includes('lp-patagonia-carrusel-1.jpg') && app.includes('lp-patagonia-carrusel-5.jpg'), 'SPA carrusel fotos');
t(app.includes('four repairs in. still going. every patch is a place this jacket has been. #wornwear'), 'SPA carrusel caption real');
t(app.includes('mk-carr-next'), 'SPA carrusel flecha');
t(idxEn.includes('Day 2 is a carousel') && idxEn.includes("It's day 2 of the free trial: we build you a carousel with your business's real photos."), 'EN carrusel + sub');

/* ---------- 5. Semana sin bloque de texto (mock v8) */
t(!app.includes('lp-week-note') && !app.includes('lp-week-bridge'), 'SPA sin note/bridge');
t(!app.includes('lpWeekToForm') && !app.includes('lpWeekBridge'), 'SPA sin handler del bridge');
t(!idxEn.includes('lp-week-note') && !idxEn.includes('lpWeekToForm'), 'EN sin note/handler');

/* ---------- 6. Conexión en un toque */
t(app.includes('mk-connect mk-wow') && app.includes('Publicalo en @tu_negocio hoy') && app.includes('✓ Programado'), 'SPA wow genérica');
t(app.includes('¿Lo querés en tu Instagram? Conectalo y este posteo sale hoy a las 19:00, solo.'), 'SPA wow línea');
t(app.includes('lp-wow-generica.jpg') && !app.includes('Conectá tu Instagram y Posty publica por vos'), 'SPA wow foto nueva, sin tarjeta vieja');
t(css.includes('.mk-ok{margin-left:auto;background:#E7F8EE;color:var(--green-d)'), 'CSS chip Programado verde');
t(idxEn.includes('Post it to @your_business today') && idxEn.includes('✓ Scheduled'), 'EN wow genérica');

/* ---------- 7. Voz + Subir dúo (mock v13) */
t(app.includes('mk-voice-bubble') && app.includes('«cambiame el fondo, más cálido»'), 'SPA nota de voz');
t(app.includes('mk-duo') && app.includes('id="mkVidRaw"') && app.includes('id="mkVidPro"'), 'SPA dúo videos');
t(app.includes('ASÍ COMO LLEGÓ') && app.includes('ASÍ LO PUBLICAMOS'), 'SPA dúo etiquetas');
t(app.includes('El video que nos mandó Filthy Rich Barbershop: así sale publicado.'), 'SPA dúo sub-línea');
t(app.includes('filthyrichbarbershop') && app.includes('walk in filthy, come out rich. book at the link in bio · 148 Havemeyer St, Williamsburg 💈'), 'SPA dúo tarjeta publicada');
t(cnt(app, 'lp-tomoko-berry.jpg') === 1 && cnt(idxEn, 'lp-tomoko-berry.jpg') === 1, 'Berry una sola vez por superficie');
t(app.includes('lp-patagonia-syncilla.jpg') && app.includes('lp-patagonia-syncilla-calida.jpg') && !app.includes('lp-tomoko-berry-fondo'), 'SPA par Syncilla (v21)');
t(css.includes('.mk-ok-chip'), 'CSS chip ok presente');
t(cnt(app, 'mkVidRaw') === 2, 'SPA sincronía cableada (markup + JS)');
t(!app.includes('mkSubirVid') && !app.includes('topteamcontractorsllc'), 'SPA sin formatos viejos de Subir');
t(idxEn.includes('AS IT ARRIVED') && idxEn.includes('AS WE POST IT'), 'EN dúo etiquetas');
t(css.includes('.mk-duo{') && css.includes('.mk-raw-tag.ok{background:var(--green-d)}'), 'CSS dúo');

/* ---------- 8. Cómo funciona en voz de equipo (mock v9) */
t(app.includes('Así trabajamos nosotros') && app.includes('Nos contás tu negocio una vez'), 'SPA voz títulos');
t(app.includes('Y trabajamos con tres reglas simples') && app.includes('Son nuestra forma de trabajar'), 'SPA voz reglas');
t(app.includes('antes de que salga te avisamos;'), 'SPA voz paso 3 (solo landing)');
t(app.includes('Detrás del equipo está Valentino') && app.includes('revisa cada pieza, toma las decisiones'), 'SPA línea fundador');
t(app.includes('<b>Trabajamos completo.</b>'), 'SPA voz cierre');
t(idxEn.includes('How we work') && idxEn.includes('Behind the team is Valentino'), 'EN voz + fundador');

/* ---------- 9. Ads: tarjeta Impulsar + público (mock v12) */
t(app.includes('Con Posty impulsamos tus mejores posteos'), 'SPA ads h2 plural');
t(app.includes('★ Recomendado · 2× tu promedio'), 'SPA ads métrica');
t(app.includes('🎯 <b>Tu público:</b> mujeres de 25 a 44 años en Williamsburg y barrios cercanos (8 km), que compran postres para regalar y siguen la pastelería japonesa.'), 'SPA ads público exacto');
t(app.includes('Lo estudiamos de tu negocio: tu producto, tu zona y quién te compra. Nada de públicos genéricos.'), 'SPA ads público sub');
t(app.includes('$20 de pauta + $2 de gestión (10%) — la gestión se cobra solo si el anuncio sale.'), 'SPA ads fee');
t(app.includes('+ 10% de gestión de Posty, solo sobre lo que el anuncio gasta.'), 'SPA ads cap-note con fee');
t(!app.includes('cap-prop'), 'SPA ads sin cap-prop');
t(idxEn.includes('With Posty we boost your best posts') && idxEn.includes('<b>Your audience:</b>'), 'EN ads plural + público');
t(css.includes('.cap-aud{') && css.includes('.cap-amts{'), 'CSS ads público/montos');

/* ---------- 10. Banda de estrategia (mock v14) */
t(app.includes('id="crecimiento"') && app.includes('Estudiamos tu negocio'), 'SPA banda estrategia');
t(app.includes('Estrategia de Birds of a Feather') && app.includes('Dan Dan Noodles'), 'SPA strat-card');
t(app.includes('Su público de Ads') && app.includes('Cada negocio tiene la suya: sale de su estudio, no de una plantilla.'), 'SPA strat filas + nota');
t(!app.includes('Foco de este mes') && !app.includes('Cada mes, <span class="hl">un foco</span>'), 'SPA sin banda Growth');
t(idxEn.includes('We study your business') && idxEn.includes('Its Ads audience'), 'EN banda estrategia');
t(css.includes('.strat-card{') && css.includes('.strat-row{'), 'CSS strat');

/* ---------- 11. Pill HOY verde (regla de sistema) + stamps */
t(css.includes('.pz-hoy-hoy-pill{font-size:12px;font-weight:800;color:var(--green-d);background:#E7F8EE;'), 'CSS pill hoy verde');
t(idx.includes('/app.js?v=764'), 'shell app.js?v=764');
t(idx.includes('/styles.css?v=20261289') && idxEn.includes('/styles.css?v=20261289'), 'styles?v=20261289 en ambos index');

/* ---------- 12. Boot + HTTP */
const PORT = 18779;
const dataDir = path.join(DIR, '.qa-data-website');
function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}
async function waitUp(tries) {
  for (let i = 0; i < tries; i++) {
    try { const r = await get('/api/version'); if (r.status === 200) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}
(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  const child = spawn('node', ['server.js'], {
    cwd: DIR,
    env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: dataDir }),
    stdio: 'ignore',
  });
  try {
    const up = await waitUp(40);
    t(up, 'boot del servidor');
    if (up) {
      const home = await get('/');
      t(home.status === 200 && home.body.includes('/app.js?v=764') && home.body.includes('styles.css?v=20261289'), 'HTTP / stamps');
      const en = await get('/en/');
      t(en.status === 200 && en.body.includes('Your community managers'), 'HTTP /en/ pill');
      const cssR = await get('/styles.css');
      t(cssR.status === 200 && cssR.body.includes('color:var(--green-d);background:#E7F8EE'), 'HTTP styles pill verde');
      const js = await get('/app.js');
      t(js.status === 200 && js.body.includes('lpCarrInit') && js.body.includes('mk-duo'), 'HTTP app.js nuevo');
      const vid = await get('/lp-subir-crudo.mp4');
      t(vid.status === 200, 'HTTP video crudo');
      const img = await get('/lp-patagonia-carrusel-1.jpg');
      t(img.status === 200, 'HTTP foto carrusel');
      const img2 = await get('/lp-tomoko-yuzu.jpg');
      t(img2.status === 200, 'HTTP foto tomoko');
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('lote-website: ' + ok + ' ok, ' + bad + ' fail');
  process.exit(bad ? 1 : 0);
})();
