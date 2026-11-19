'use strict';
/* ════════════════════════════════════════════════════════════════════
 * LOTE PUERTA-NUEVA — suite propia (2026-11-18)
 * Orden de Valentino («corregí todo», 18/11 17:08) tras la recorrida
 * en vivo del modelo nuevo (invitado fresco @highlandbakery sobre
 * producción v1179): la puerta y las superficies del invitado seguían
 * prometiendo el posteo instantáneo del modelo viejo.
 *
 * EL LOTE (ES + EN espejo):
 *  1 · Copy de la puerta (prueba.html / en-prueba.html): title,
 *      og:title, description y H1 dejan de prometer el primer posteo
 *      armado al instante. La promesa es el modelo aprobado: entrás
 *      hoy → ves tu semana PLANEADA al instante → tu primer posteo
 *      sale mañana a las 19:00. Línea de venta: «Descargá la app y
 *      te hacemos 3 posteos gratis». pvDiasTxt() cuenta los 3 días
 *      reales (mañana / +2 / +3, siempre 19:00). Los estados del
 *      flujo (espera, preview, errores) hablan el mismo modelo y en
 *      voz de equipo (plural).
 *  2 · Bienvenida del invitado (guest-trial.js): ya no dice «está
 *      listo» — afirma el plan y la salida de mañana 19:00; los
 *      marcadores de idempotencia (L10) suman el wording nuevo SIN
 *      perder los viejos (las bienvenidas ya insertadas siguen
 *      bloqueando duplicados).
 *  3 · La espera que mentía (app.js, homeWeekHTML + completando):
 *      «En unos segundos aparece acá» prometía segundos que nunca
 *      llegan (la semana la produce la línea a mano durante el día).
 *      Ahora: hechos — primer posteo mañana 19:00, las piezas
 *      aparecen a medida que están listas. Ídem el festejo demo del
 *      funnel («está listo» → «ya está en tu semana») y la tarjeta
 *      «Publicar mi primero» sin borradores («al toque» afuera).
 *  4 · Regla del formulario (aprobada 18/11 13:19, NO viva — la
 *      recorrida contó 0 ocurrencias): los dos campos siempre
 *      visibles; la etiqueta pasa a «Tu web o tu link» (vale
 *      Tiendanube/Linktree/menú/perfil de Google) y aparece el
 *      escape «No tengo web»: lo toca → la web queda renunciada, el
 *      invitado entra y el estado viaja como sin_web en los tres
 *      payloads (pregenerate, generate-stream, guest/start). El
 *      servidor lo registra (users.guest_sin_web, columna de db.js;
 *      createGuest lo guarda sin romper esquemas viejos).
 *  5 · ENMIENDA 21:49/21:58 (Valentino, la misma noche): la puerta
 *      DICE qué son los 3 posteos y lo MUESTRA — el trío de chips
 *      «Día 1: una imagen · Día 2: un carrusel · Día 3: un video»
 *      (con su espejo EN) y la tira de ejemplo con la prueba REAL
 *      de Big Top Candy Shop (su imagen del día 1, su carrusel del
 *      día 2 deslizable y su video del día 3 mudo en loop), antes
 *      del formulario en las 4 superficies: prueba.html,
 *      en-prueba.html y los heroes de index.html y en/index.html
 *      (sección G + el boot F12–F17).
 *
 * Correr:  node test-lote-puerta-nueva.js [--no-boot]
 * Control prístino (base e29fe7d1): las secciones A–D caen en los
 * censos (los strings viejos están, los nuevos no) y F no encuentra
 * ni el escape en la puerta servida ni la columna guest_sin_web.
 * ════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const PRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
const ENPRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const GUEST = fs.readFileSync(path.join(ROOT, 'guest-trial.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DBJS = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const ENINDEX = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { DatabaseSync = null; }

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre, extra) {
  if (cond) { pass++; console.log('  ✓ ' + nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }
const sin = (txt, s, nombre) => eq(txt.split(s).length - 1, 0, nombre + ' = 0');
const con = (txt, s, nombre, min) => ok((txt.split(s).length - 1) >= (min || 1), nombre + ' ≥' + (min || 1), txt.split(s).length - 1);

/* ── A · Puerta ES ─────────────────────────────────────────────── */
function seccionA() {
  seccion('A · puerta ES (prueba.html): copy del modelo nuevo + escape');
  sin(PRUEBA, 'Tu primer posteo armado gratis', 'A1 title viejo');
  sin(PRUEBA, 'Posty te arma tu primer posteo', 'A2 og/twitter viejos');
  sin(PRUEBA, 'Tu primer posteo, armado con', 'A3 H1 viejo');
  sin(PRUEBA, 'Tu website', 'A4 etiqueta «Tu website»');
  sin(PRUEBA, '(si tenés)', 'A5 «(si tenés)»');
  sin(PRUEBA, 'Tu primer posteo ya está listo', 'A6 «ya está listo» de la puerta');
  sin(PRUEBA, 'Armar mi primer posteo', 'A7 botón viejo');
  sin(PRUEBA, 'Esto es el día 1 de 3', 'A8 pvDiasTxt viejo');
  sin(PRUEBA, 'Estoy armando tu primer posteo', 'A9 espera vieja');
  con(PRUEBA, 'Descargá la app y te hacemos 3 posteos gratis', 'A10 línea de venta (title+og+twitter)', 3);
  con(PRUEBA, 'mañana a las 19:00 sale tu primer posteo', 'A11 promesa del modelo (meta+og+sub)', 3);
  con(PRUEBA, '<h1>Te hacemos 3 posteos <span class="hl">gratis</span></h1>', 'A12 H1 nuevo', 1);
  con(PRUEBA, '<label for="fWeb">Tu web o tu link</label>', 'A13 etiqueta nueva', 1);
  con(PRUEBA, 'id="fNoWeb">No tengo web</button>', 'A14 el escape «No tengo web»', 1);
  con(PRUEBA, 'id="fNoWebNote"', 'A15 nota del escape', 1);
  con(PRUEBA, "fd.append('sin_web', '1')", 'A16 sin_web en generate-stream', 1);
  con(PRUEBA, 'sin_web: noWeb ? 1 : 0', 'A17 sin_web en guest/start + pregenerate', 2);
  con(PRUEBA, 'sinWeb: !!noWeb', 'A18 sinWeb persiste en la intención', 1);
  con(PRUEBA, 'pend.sinWeb', 'A19 la intención restaura el escape', 1);
  con(PRUEBA, 'Ver mi semana planeada', 'A20 botón nuevo', 4);
  con(PRUEBA, 'Tu prueba son 3 posteos, uno por día: el primero sale mañana,', 'A21 pvDiasTxt nuevo', 1);
  con(PRUEBA, '+ 3 * 86400000', 'A22 pvDiasTxt cuenta el tercer día', 1);
  con(PRUEBA, '✓ Sin tarjeta · ✓ 3 posteos gratis', 'A23 hero-note alineada', 1);
  con(PRUEBA, 'Estamos armando tu semana', 'A24 espera en voz de equipo', 1);
}

/* ── B · Puerta EN ─────────────────────────────────────────────── */
function seccionB() {
  seccion('B · puerta EN (en-prueba.html): espejo completo');
  sin(ENPRUEBA, 'Your first post, built for free', 'B1 title viejo');
  sin(ENPRUEBA, 'Posty builds your first post', 'B2 og/twitter viejos');
  sin(ENPRUEBA, 'Your website <small>', 'B3 etiqueta vieja');
  sin(ENPRUEBA, '(if you have one)', 'B4 «(if you have one)»');
  sin(ENPRUEBA, 'Your first post is ready', 'B5 «is ready» de la puerta');
  sin(ENPRUEBA, 'Build my first post', 'B6 botón viejo');
  sin(ENPRUEBA, 'This is day 1 of 3', 'B7 pvDiasTxt viejo');
  con(ENPRUEBA, "Download the app and we'll make you 3 free posts", 'B8 línea de venta EN', 3);
  con(ENPRUEBA, '<h1>We make you 3 posts <span class="hl">for free</span></h1>', 'B9 H1 nuevo', 1);
  con(ENPRUEBA, '<label for="fWeb">Your website or your link</label>', 'B10 etiqueta nueva', 1);
  con(ENPRUEBA, 'id="fNoWeb">I don\'t have a website</button>', 'B11 el escape EN', 1);
  con(ENPRUEBA, "fd.append('sin_web', '1')", 'B12 sin_web en generate-stream', 1);
  con(ENPRUEBA, 'sin_web: noWeb ? 1 : 0', 'B13 sin_web en guest/start + pregenerate', 2);
  con(ENPRUEBA, 'See my planned week', 'B14 botón nuevo', 4);
  con(ENPRUEBA, 'Your trial is 3 posts, one per day: the first goes out tomorrow,', 'B15 pvDiasTxt nuevo', 1);
  con(ENPRUEBA, "We\\'re building your week", 'B16 espera en voz de equipo', 1);
}

/* ── C · Bienvenida del invitado ───────────────────────────────── */
function seccionC() {
  seccion('C · guest-trial.js: bienvenida del modelo nuevo + marcadores');
  sin(GUEST, 'tu primer posteo está listo${paraBiz}', 'C1 plantilla ES vieja');
  sin(GUEST, 'your first post is ready${paraBiz}', 'C2 plantilla EN vieja');
  sin(GUEST, 'te aviso cuando tu primer posteo esté listo', 'C3 aviso viejo n=0');
  con(GUEST, 'tu semana ya está planeada', 'C4 wording REAL nuevo ES', 3);
  con(GUEST, 'your week is already planned', 'C5 wording REAL nuevo EN', 3);
  con(GUEST, 'sale mañana a las 19:00', 'C6 salida de mañana ES', 4);
  con(GUEST, 'goes out tomorrow at 7:00 PM', 'C7 salida de mañana EN', 4);
  con(GUEST, 'estamos armando tu semana', 'C8 wording HOLD nuevo ES', 1);
  con(GUEST, "we're building your week", 'C9 wording HOLD nuevo EN', 1);
  const iR = GUEST.indexOf('const REAL_MARKERS');
  const lineaR = iR >= 0 ? GUEST.slice(iR, GUEST.indexOf('\n', iR)) : '';
  ok(lineaR.includes("'tu primer posteo está listo'") && lineaR.includes("'tu semana ya está planeada'"), 'C10 REAL_MARKERS: legacy + nuevo conviven');
  const iH = GUEST.indexOf('const HOLD_MARKERS');
  const lineaH = iH >= 0 ? GUEST.slice(iH, GUEST.indexOf('\n', iH)) : '';
  ok(lineaH.includes("'estoy terminando de armar tu semana'") && lineaH.includes("'estamos armando tu semana'"), 'C11 HOLD_MARKERS: legacy + nuevo conviven');
  con(GUEST, 'guest_sin_web = 1', 'C12 createGuest guarda la marca sin_web', 1);
  // Funcional: la bienvenida nueva + su idempotencia, con DB real.
  if (!DatabaseSync) { ok(false, 'C13 node:sqlite disponible'); return; }
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE chat_messages (user_id INTEGER, role TEXT, text TEXT)');
  const gt = require(path.join(ROOT, 'guest-trial.js'));
  const w = gt.welcomeGuestMessage;
  ok(typeof w === 'function', 'C13 welcomeGuestMessage exportada');
  if (typeof w !== 'function') { db.close(); return; }
  const r1 = w(db, 501, { lang: 'es', business: 'Panadería Sol', nPosts: 3, productoReal: true });
  eq(r1, true, 'C14 la bienvenida nueva se inserta');
  const filas1 = db.prepare('SELECT text FROM chat_messages WHERE user_id = 501').all();
  eq(filas1.length, 1, 'C15 una sola fila');
  ok(filas1.length && filas1[0].text.includes('tu semana ya está planeada') && filas1[0].text.includes('sale mañana a las 19:00'), 'C16 el texto afirma plan + mañana 19:00');
  ok(filas1.length && !filas1[0].text.includes('está listo'), 'C17 el texto NO dice «está listo»');
  const r2 = w(db, 501, { lang: 'es', business: 'Panadería Sol', nPosts: 3, productoReal: true });
  eq(r2, false, 'C18 segunda llamada: idempotente (no duplica)');
  const r3 = w(db, 502, { lang: 'es', business: '', nPosts: 0, productoReal: false });
  eq(r3, true, 'C19 placeholder n=0 se inserta');
  const r4 = w(db, 502, { lang: 'en', business: '', nPosts: 2, productoReal: false });
  eq(r4, true, 'C20 el REAL posterior al placeholder SÍ entra (regla L10)');
  const filas2 = db.prepare('SELECT text FROM chat_messages WHERE user_id = 502 ORDER BY rowid').all();
  ok(filas2.length === 2 && filas2[1].text.includes('your week is already planned'), 'C21 el segundo texto es el REAL nuevo EN');
  db.close();
}

/* ── D · app.js: la espera honesta + funnel ────────────────────── */
function seccionD() {
  seccion('D · app.js: espera honesta, funnel demo y tarjeta de primero');
  sin(APPJS, 'En unos segundos aparece acá', 'D1 «en unos segundos» = 0');
  sin(APPJS, 'They appear right here in a few seconds', 'D2 «in a few seconds» = 0');
  sin(APPJS, 'Posty está terminando de armar tu semana', 'D3 «terminando» en tarjetas = 0');
  sin(APPJS, 'Estoy terminando de armar tu semana', 'D4 «terminando» en completando = 0');
  sin(APPJS, '¡Tu primer posteo está listo!', 'D5 festejo demo viejo = 0');
  sin(APPJS, 'armo el primero al toque', 'D6 «al toque» = 0');
  con(APPJS, 'Tu primer posteo sale mañana a las 19:00 — las piezas aparecen acá a medida que están listas', 'D7 tarjeta del invitado honesta', 2);
  con(APPJS, 'Your first post goes out tomorrow at 7:00 PM — the pieces appear here as they are ready', 'D8 espejo EN de la tarjeta', 1);
  con(APPJS, 'piezas aparecen acá a medida que están listas', 'D9 fórmula honesta reutilizada', 5);
  con(APPJS, '¡Tu primer posteo ya está en tu semana!', 'D10 festejo demo nuevo', 1);
  con(APPJS, 'estamos armando tu semana: tu primer posteo sale mañana a las 19:00', 'D11 tarjeta sin borradores honesta', 1);
  con(APPJS, "your first post goes out tomorrow at 7:00 PM and the pieces appear here as they're ready", 'D12 completando EN honesto', 1);
  con(INDEX, 'app.js?v=797', 'D13 sello del aterrizaje app.js?v=797 (solo ES)', 1);
  con(SERVER, "body.sin_web === 1", 'D14 guest/start lee sin_web', 1);
  con(SERVER, 'sinWeb: !!sinWebK', 'D15 guest/start pasa la marca al alta', 1);
  con(DBJS, 'ADD COLUMN guest_sin_web', 'D16 db.js crea la columna', 1);
}

/* ── E · sintaxis de todo lo tocado ────────────────────────────── */
function seccionE() {
  seccion('E · node --check (archivos + scripts inline de la puerta)');
  for (const f of ['public/app.js', 'guest-trial.js', 'server.js', 'db.js']) {
    let bien = true;
    try { execFileSync('node', ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); } catch (e) { bien = false; }
    ok(bien, 'E·check ' + f);
  }
  for (const [nombre, html] of [['prueba.html', PRUEBA], ['en-prueba.html', ENPRUEBA]]) {
    const bloques = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    let bien = bloques.length > 0;
    bloques.forEach((b, i) => {
      const tmp = path.join(os.tmpdir(), 'pn-' + nombre + '-' + i + '.js');
      try { fs.writeFileSync(tmp, b); execFileSync('node', ['--check', tmp], { stdio: 'pipe' }); }
      catch (e) { bien = false; }
      try { fs.unlinkSync(tmp); } catch (e) {}
    });
    ok(bien, 'E·check inline ' + nombre + ' (' + bloques.length + ' bloque/s)');
  }
}

/* ── G · Enmienda 21:49/21:58: trío de formatos + ejemplo real ─── */
function seccionG() {
  seccion('G · enmienda: el trío de formatos + la tira de ejemplo real (Big Top) en las 4 superficies');
  const veces = (txt, s) => txt.split(s).length - 1;
  const superficies = [
    ['prueba.html', PRUEBA, 'Día 1: una imagen', 'Día 2: un carrusel', 'Día 3: un video', 'La prueba real de Big Top Candy Shop', 'Día 1', 'Día 2', 'Día 3'],
    ['index.html', INDEX, 'Día 1: una imagen', 'Día 2: un carrusel', 'Día 3: un video', 'La prueba real de Big Top Candy Shop', 'Día 1', 'Día 2', 'Día 3'],
    ['en-prueba.html', ENPRUEBA, 'Day 1: a photo', 'Day 2: a carousel', 'Day 3: a video', "Big Top Candy Shop's real trial", 'Day 1', 'Day 2', 'Day 3'],
    ['en/index.html', ENINDEX, 'Day 1: a photo', 'Day 2: a carousel', 'Day 3: a video', "Big Top Candy Shop's real trial", 'Day 1', 'Day 2', 'Day 3'],
  ];
  for (const [nombre, html, t1, t2, t3, titulo, c1, c2, c3] of superficies) {
    eq(veces(html, t1), 1, 'G·' + nombre + ' chip «' + t1 + '» ×1');
    eq(veces(html, t2), 1, 'G·' + nombre + ' chip «' + t2 + '» ×1');
    eq(veces(html, t3), 1, 'G·' + nombre + ' chip «' + t3 + '» ×1');
    eq(veces(html, titulo), 1, 'G·' + nombre + ' el negocio se nombra ×1');
    eq(veces(html, 'class="daychip">' + c1), 1, 'G·' + nombre + ' daychip ' + c1);
    eq(veces(html, 'class="daychip">' + c2), 1, 'G·' + nombre + ' daychip ' + c2);
    eq(veces(html, 'class="daychip">' + c3), 1, 'G·' + nombre + ' daychip ' + c3);
    eq(veces(html, '/puerta-ej-bigtop-dia1.jpg'), 1, 'G·' + nombre + ' imagen día 1 ×1');
    for (let i = 1; i <= 5; i++) eq(veces(html, '/puerta-ej-bigtop-dia2-' + i + '.jpg'), 1, 'G·' + nombre + ' carrusel foto ' + i + ' ×1');
    eq(veces(html, '/puerta-ej-bigtop-dia3.mp4'), 1, 'G·' + nombre + ' video día 3 ×1');
    eq(veces(html, '/puerta-ej-bigtop-dia3-poster.jpg'), 1, 'G·' + nombre + ' póster del video ×1');
    con(html, 'autoplay muted loop playsinline', 'G·' + nombre + ' video mudo en loop con autoplay', 1);
    con(html, 'id="ejCar"', 'G·' + nombre + ' carrusel deslizable presente', 1);
    // El trío se ve ANTES del formulario en cada superficie.
    const iTrio = html.indexOf(t1);
    const iForm = Math.max(html.indexOf('<form'), html.indexOf('lp-igform'));
    ok(iTrio >= 0 && iForm >= 0 && iTrio < iForm, 'G·' + nombre + ' el trío va antes del formulario');
  }
  // El hero ES también lo renderiza app.js (su plantilla pisa el HTML
  // estático de index.html): el trío + la tira viven ahí también, una
  // sola vez, con el contador del carrusel inline (onscroll).
  eq(veces(APPJS, 'Día 1: una imagen'), 1, 'G·app.js (hero renderizado) chip día 1 ×1');
  eq(veces(APPJS, 'Día 2: un carrusel'), 1, 'G·app.js chip día 2 ×1');
  eq(veces(APPJS, 'Día 3: un video'), 1, 'G·app.js chip día 3 ×1');
  eq(veces(APPJS, 'La prueba real de Big Top Candy Shop'), 1, 'G·app.js el negocio se nombra ×1');
  eq(veces(APPJS, '/puerta-ej-bigtop-dia1.jpg'), 1, 'G·app.js imagen día 1 ×1');
  for (let i = 1; i <= 5; i++) eq(veces(APPJS, '/puerta-ej-bigtop-dia2-' + i + '.jpg'), 1, 'G·app.js carrusel foto ' + i + ' ×1');
  eq(veces(APPJS, '/puerta-ej-bigtop-dia3.mp4'), 1, 'G·app.js video día 3 ×1');
  con(APPJS, 'onscroll=\\"var n=this.parentNode.querySelector', 'G·app.js contador del carrusel inline', 1);
  con(APPJS, 'oncanplay=\\"try{var pr=this.play()', 'G·app.js video del hero con play() explícito (patrón de la casa)', 1);
  ok(APPJS.indexOf('Día 1: una imagen') > APPJS.indexOf('No tengo tiempo de postear') && APPJS.indexOf('Día 1: una imagen') < APPJS.indexOf('lp-igform', APPJS.indexOf('No tengo tiempo de postear')), 'G·app.js el trío va entre el H1 y el formulario del hero');
  const assets = ['puerta-ej-bigtop-dia1.jpg', 'puerta-ej-bigtop-dia2-1.jpg', 'puerta-ej-bigtop-dia2-2.jpg', 'puerta-ej-bigtop-dia2-3.jpg', 'puerta-ej-bigtop-dia2-4.jpg', 'puerta-ej-bigtop-dia2-5.jpg', 'puerta-ej-bigtop-dia3-poster.jpg', 'puerta-ej-bigtop-dia3.mp4'];
  for (const a of assets) {
    const p = path.join(ROOT, 'public', a);
    ok(fs.existsSync(p) && fs.statSync(p).size > 10000, 'G·asset ' + a + ' existe y pesa', fs.existsSync(p) ? fs.statSync(p).size : 0);
  }
  const mp4 = path.join(ROOT, 'public', 'puerta-ej-bigtop-dia3.mp4');
  ok(fs.statSync(mp4).size <= 4.5 * 1024 * 1024, 'G·el video web pesa ≤ ~4 MB [' + (fs.statSync(mp4).size / 1048576).toFixed(2) + ' MB]');
}

/* ── F · boot: la puerta servida + el camino sin_web ───────────── */
const PAYLOAD_PN = {
  engine: 25, business: 'Puerta Nueva', category: 'gastronomia', lang: 'es', content_lang: 'es',
  posts: [{ armando: true, headline: 'Día 1' }, { armando: true, headline: 'Día 2' }, { armando: true, headline: 'Día 3' }],
};
async function seccionF() {
  seccion('F · boot aislado: puerta servida + guest/start con sin_web');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'F0 node:sqlite disponible para sembrar'); return; }
  const port = 19920 + Math.floor(Math.random() * 60);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-puerta-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-puerta-media-'));
  const childEnv = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: 'token-suite', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' };
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'FAL_API_KEY', 'REPLICATE_API_TOKEN']) delete childEnv[k];
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + port;
  try {
    let vivo = false;
    for (let i = 0; i < 150 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(base + '/api/version').catch(() => null);
      if (resp && resp.ok) vivo = true;
    }
    ok(vivo, 'F1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    const puerta = await (await fetch(base + '/prueba')).text();
    ok(puerta.includes('Tu web o tu link') && puerta.includes('No tengo web'), 'F2 la puerta servida trae etiqueta nueva + escape');
    ok(!puerta.includes('Tu website') && !puerta.includes('Tu primer posteo armado gratis'), 'F3 la puerta servida ya no promete el instante');
    const puertaEn = await (await fetch(base + '/en/prueba')).text();
    ok(puertaEn.includes('Your website or your link') && puertaEn.includes("I don't have a website"), 'F4 la puerta EN servida trae su espejo');
    ok(puerta.includes('Día 1: una imagen') && puerta.includes('La prueba real de Big Top Candy Shop'), 'F12 la puerta servida trae el trío + el ejemplo real (ES)');
    ok(puertaEn.includes('Day 1: a photo') && puertaEn.includes("Big Top Candy Shop's real trial"), 'F13 la puerta EN servida trae el trío + el ejemplo real');
    const home = await (await fetch(base + '/')).text();
    ok(home.includes('Día 1: una imagen') && home.includes('/puerta-ej-bigtop-dia3.mp4'), 'F14 el hero servido trae el trío + la tira (ES)');
    const homeEn = await (await fetch(base + '/en')).text();
    ok(homeEn.includes('Day 1: a photo') && homeEn.includes('/puerta-ej-bigtop-dia3.mp4'), 'F15 el hero EN servido trae el trío + la tira');
    const vid = await fetch(base + '/puerta-ej-bigtop-dia3.mp4').catch(() => null);
    ok(!!vid && vid.status === 200 && (vid.headers.get('content-type') || '').includes('video'), 'F16 el video del ejemplo se sirve (200, video) [' + (vid && vid.status) + ']');
    if (vid) { try { await vid.arrayBuffer(); } catch (e) {} }
    const slide = await fetch(base + '/puerta-ej-bigtop-dia2-3.jpg').catch(() => null);
    ok(!!slide && slide.status === 200, 'F17 una foto del carrusel de ejemplo se sirve (200) [' + (slide && slide.status) + ']');
    const dbPath = path.join(dataDir, 'posta.db');
    let db = null;
    for (let i = 0; i < 20 && !db; i++) {
      try { db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000'); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
    }
    ok(!!db, 'F5 la base del boot se puede abrir para sembrar');
    if (!db) return;
    const ahora = Date.now();
    for (const ig of ['puertanueva.suite', 'puertanueva.control']) {
      db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify({ ...PAYLOAD_PN, ig }), ahora);
    }
    const start = async (body) => {
      const r = await fetch(base + '/api/guest/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(() => null);
      return r ? { status: r.status, json: await r.json().catch(() => ({})) } : { status: 0, json: {} };
    };
    const gs1 = await start({ ig: 'puertanueva.suite', domain: '', sin_web: 1, device: 'suite-puerta-1', lang: 'es', tz: 'America/New_York' });
    ok(gs1.status === 200 || gs1.status === 202, 'F6 guest/start con sin_web entra (200/202, no bloquea) [' + gs1.status + ']');
    let u1 = null;
    try { u1 = db.prepare('SELECT guest_domain, guest_sin_web FROM users WHERE guest_ig = ?').get('puertanueva.suite'); } catch (e) { u1 = null; }
    ok(!!u1, 'F7 el invitado sin_web existe (y la columna guest_sin_web existe)');
    eq(u1 && u1.guest_sin_web, 1, 'F8 guest_sin_web = 1 registrado');
    eq(u1 && u1.guest_domain, '', 'F9 guest_domain vacío (renunciada, no faltante)');
    const gs2 = await start({ ig: 'puertanueva.control', domain: '', device: 'suite-puerta-2', lang: 'es', tz: 'America/New_York' });
    ok(gs2.status === 200 || gs2.status === 202, 'F10 guest/start control entra [' + gs2.status + ']');
    let u2 = null;
    try { u2 = db.prepare('SELECT guest_sin_web FROM users WHERE guest_ig = ?').get('puertanueva.control'); } catch (e) { u2 = null; }
    eq(u2 && u2.guest_sin_web, 0, 'F11 sin escape, guest_sin_web = 0');
    db.close();
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
  }
}

(async () => {
  seccionA(); seccionB(); seccionC(); seccionD(); seccionE(); seccionG();
  await seccionF();
  console.log('\n══════════════════════════════════════════════');
  console.log('LOTE PUERTA-NUEVA: ' + pass + ' ok · ' + fail + ' mal');
  if (failures.length) { console.log('Fallan:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
