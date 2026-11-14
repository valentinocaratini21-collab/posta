// test-lote-seccion-subir-web.js — LOTE SECCIÓN-SUBIR-WEBSITE (+ fotos de
// Posty en escena + héroe grande). Órdenes de Valentino (13/11 23:33):
//  (1) La home no mostraba que el cliente puede mandarle a Posty sus
//      fotos, sus videos y sus ideas desde Subir: sección nueva en las
//      dos homes (ES + EN), junto a «cómo funciona», con las guardas de
//      verdad del flujo real (lo subido ocupa su día; la idea por voz se
//      revisa y sale AL DÍA SIGUIENTE; la edición de video es la real de
//      video-edicion.js: mejor tramo, vertical, música, portada).
//  (2) Fotos de Posty EN ESCENA trabajando repartidas por la home: la
//      sección Subir lleva una pieza nueva (Posty en una cafetería
//      recibiendo el material de un negocio), compuesta desde la cara
//      canónica (public/ai-avatar.png), sin regenerarla.
//  (3) El video del tope se veía muy chiquito (100px en escritorio por la
//      regla «video-website-chico»): pasa a héroe de verdad, grande en
//      desktop y en móvil. El CONTENIDO del video no se toca.
//
// Pins:
//  A. Sección #subir en la home ES (lpSubirHTML invocada en landingView
//     entre #como-funciona y #equipo) con los tres envíos y sus textos.
//  B. Espejo EN completo en public/en/index.html, mismo lugar y peso.
//  C. Guardas de verdad: la idea dice «al día siguiente» / «next day»,
//     lo subido «ocupa su día» / «takes its day», y NINGUNA promesa de
//     inmediatez sobre la idea; sin rayas largas en los bloques nuevos.
//  D. La foto nueva: md5 y dimensiones pineados (2048×1152).
//  E. Héroe: las reglas nuevas están (600px/92vw base, 640px escritorio),
//     el achique viejo (100px / min(170px,44vw)) salió de las reglas del
//     héroe, y el archivo de video queda byte-idéntico a la base.
//  F. Diff acotado: sacando los bloques insertados, los tres archivos
//     tocados vuelven byte a byte a la base; el censo de archivos
//     distintos es exactamente el declarado; el bloque del fundador no
//     se tocó.
//  K. Control contra la base: sin sección y con el héroe chico, el hueco
//     se reproduce.
//  G. Boot: las dos homes servidas traen la sección, el styles servido
//     trae el héroe grande y la foto se sirve con sus bytes exactos.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const BASE = process.env.LOTE_BASE_DIR || '';
let ok = 0, bad = 0;
const t = (cond, msg) => { if (cond) { ok++; } else { bad++; console.log('  MAL:', msg); } };
const read = (p) => fs.readFileSync(p, 'utf8');
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

const MD5_FOTO_NUEVA = '44158fb66904a84eb49719b8ceb3be26';

function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function bloqueSubirES(app) {
  const a = app.indexOf('function lpSubirHTML()');
  const b = app.indexOf('function landingView(cfg)');
  return a >= 0 && b > a ? app.slice(a, b) : '';
}
function bloqueSubirEN(en) {
  const a = en.indexOf('<div class="section" id="subir">');
  const b = en.indexOf('<div class="section" id="equipo">');
  return a >= 0 && b > a ? en.slice(a, b) : '';
}

async function main() {
  const app = read(path.join(ROOT, 'public/app.js'));
  const en = read(path.join(ROOT, 'public/en/index.html'));
  const css = read(path.join(ROOT, 'public/styles.css'));

  console.log('== A. Sección Subir en la home ES ==');
  const es = bloqueSubirES(app);
  t(es.length > 500, 'lpSubirHTML existe en app.js');
  t((app.match(/function lpSubirHTML\(\)/g) || []).length === 1, 'lpSubirHTML definida exactamente 1 vez (M78)');
  t((app.match(/\$\{lpSubirHTML\(\)\}/g) || []).length === 1, 'lpSubirHTML invocada exactamente 1 vez (M78)');
  const iCf = app.indexOf('id="como-funciona"');
  const iInv = app.indexOf('${lpSubirHTML()}');
  const iEq = app.indexOf('id="equipo"', iCf);
  t(iCf >= 0 && iInv > iCf && iEq > iInv, 'la sección va entre #como-funciona y #equipo en landingView');
  for (const c of ['id="subir"', 'Tu material también se convierte en posteos', 'posty-recibiendo.jpg',
    'Tus fotos', 'las convertimos en posteos', 'programadas en tu semana',
    'Tus videos', 'los editamos nosotros', 'elegimos el mejor tramo', 'lo pasamos a vertical', 'le sumamos música',
    'Tus ideas', 'nota de voz', 'href="/prueba"']) {
    t(es.includes(c), `ES: falta «${c}»`);
  }

  console.log('== B. Espejo EN ==');
  const enB = bloqueSubirEN(en);
  t(enB.length > 500, 'la sección #subir existe en en/index.html');
  const eCf = en.indexOf('id="como-funciona"');
  const eSub = en.indexOf('id="subir"');
  const eEq = en.indexOf('id="equipo"', eCf);
  t(eCf >= 0 && eSub > eCf && eEq > eSub, 'la sección EN va entre #como-funciona y #equipo');
  for (const c of ['Your material becomes posts, too', 'posty-recibiendo.jpg',
    'Your photos', 'we turn them into posts', 'scheduled in your week',
    'Your videos', 'we edit them for you', 'turn it vertical', 'add music',
    'Your ideas', 'voice note', 'href="/en/prueba"']) {
    t(enB.includes(c), `EN: falta «${c}»`);
  }

  console.log('== C. Guardas de verdad ==');
  t(es.includes('sale al día siguiente como posteo'), 'ES: la idea sale al día siguiente');
  t(enB.includes('goes out the next day as a post'), 'EN: la idea sale al día siguiente');
  t(es.includes('ocupa su día'), 'ES: lo subido ocupa su día');
  t(enB.includes('takes its day'), 'EN: lo subido ocupa su día');
  const prohibido = /en el acto|al instante|al momento|de inmediato|instant|right away|on the spot|immediately/i;
  t(!prohibido.test(es), 'ES: ninguna promesa de inmediatez en la sección');
  t(!prohibido.test(enB), 'EN: ninguna promesa de inmediatez en la sección');
  t(!es.includes('—'), 'ES: sin rayas largas en el bloque nuevo');
  t(!enB.includes('—'), 'EN: sin rayas largas en el bloque nuevo');

  console.log('== D. La foto nueva de Posty en escena ==');
  const foto = fs.readFileSync(path.join(ROOT, 'public/posty-recibiendo.jpg'));
  t(md5(foto) === MD5_FOTO_NUEVA, `md5 de posty-recibiendo.jpg = ${md5(foto)}`);
  const dim = jpegSize(foto);
  t(dim && dim.w === 2048 && dim.h === 1152, `dimensiones ${dim ? dim.w + '×' + dim.h : '??'} (esperado 2048×1152)`);

  console.log('== E. Héroe grande, contenido intacto ==');
  t(css.includes('.pz-mg--heroV{display:block;width:min(600px,92vw);margin:0 auto 26px}'), 'regla base del héroe: min(600px,92vw)');
  t(css.includes('@media(min-width:761px){.pz-mg--heroV{width:min(640px,58vw)}}'), 'regla escritorio del héroe: min(640px,58vw)');
  t(css.includes('.hero-video{display:block;width:100%;'), '.hero-video llena su contenedor');
  const lineasHeroe = css.split('\n').filter((l) => l.includes('heroV') || l.includes('.hero-video'));
  t(!lineasHeroe.some((l) => l.includes('width:100px')), 'el achique a 100px salió de las reglas del héroe');
  t(!lineasHeroe.some((l) => l.includes('min(170px,44vw)')), 'el tope de 170px salió de las reglas del héroe');
  t(app.includes('class="hero-video" src="/videos/posty-presentacion.mp4"') && app.includes('poster="/videos/posty-presentacion-poster.jpg"'), 'ES: el héroe sigue siendo el mismo video con su póster');
  t(en.includes('class="hero-video" src="/videos/posty-presentacion.mp4"'), 'EN: el héroe sigue siendo el mismo video');
  const iVid = app.indexOf('posty-presentacion.mp4');
  const iH1 = app.indexOf('<h1>', iVid);
  t(iVid >= 0 && iH1 > iVid, 'ES: el video sigue arriba del titular en el héroe');

  if (BASE && fs.existsSync(path.join(BASE, 'public/app.js'))) {
    console.log('== F. Diff acotado contra la base ==');
    const appB = read(path.join(BASE, 'public/app.js'));
    const enBd = read(path.join(BASE, 'public/en/index.html'));
    const cssB = read(path.join(BASE, 'public/styles.css'));
    const a0 = app.indexOf('function lpSubirHTML()');
    const a1 = app.indexOf('\n}\n', a0);
    const funcBlock = app.slice(a0, a1 + 3);
    const appSin = app.replace(funcBlock + '\nfunction landingView(cfg) {', 'function landingView(cfg) {').replace('  ${lpSubirHTML()}\n', '');
    t(appSin === appB, 'app.js sin los bloques nuevos = la base, byte a byte');
    const e0 = en.indexOf('  <div class="section" id="subir">');
    const e1 = en.indexOf('  <div class="section" id="equipo">', e0);
    // RE-PIN DE LA PREPARACIÓN (base viva v1046, aterrizaje v1047): el preparador
    // estampa styles?v=20261282 en AMBOS index (regla dura), así que la cirugía
    // del EN normaliza ese único stamp antes de comparar byte a byte.
    const enSin = (en.slice(0, e0) + en.slice(e1)).replace('styles.css?v=20261282', 'styles.css?v=20261281');
    t(enSin === enBd, 'en/index.html sin la sección (y sin el stamp de styles de la preparación) = la base, byte a byte');
    const cssSin = css
      .replace('.hero-video{display:block;width:100%;', '.hero-video{display:block;width:min(170px,44vw);')
      .replace('.pz-mg--heroV{display:block;width:min(600px,92vw);margin:0 auto 26px}', '.pz-mg--heroV{display:block;width:min(170px,44vw);margin:0 auto 22px}')
      .replace('/* (LOTE SECCION-SUBIR-WEB · héroe grande, orden de Valentino 13/11) El video del tope pasa a héroe de verdad: protagonista de la primera pantalla. Reemplaza el achique de «video-website-chico» (100px en escritorio para que el h1 no bajara del pliegue): ahora el video manda y el titular va debajo de él. */\n@media(min-width:761px){.pz-mg--heroV{width:min(640px,58vw)}}',
        '/* (video-website-chico) En escritorio el video es más chico todavía: el h1 a 67px ocupa ~352px y con 170px el título quedaba bajo el pliegue (837px > 800px). Con 100px termina en ~767px. En móvil sigue 170px/44vw. */\n@media(min-width:761px){.hero-video{width:100px}.pz-mg--heroV{width:100px}}');
    t(cssSin === cssB, 'styles.css sin las 3 reglas del héroe = la base, byte a byte');
    const vidB = fs.readFileSync(path.join(BASE, 'public/videos/posty-presentacion.mp4'));
    const vidR = fs.readFileSync(path.join(ROOT, 'public/videos/posty-presentacion.mp4'));
    t(md5(vidB) === md5(vidR), 'el archivo del video del héroe es byte-idéntico a la base (contenido intacto)');
    t(app.includes('src="valentino-posty-fundador.jpg?v=2"') && en.includes('src="valentino-posty-fundador.jpg?v=2"'), 'el bloque del fundador no se tocó (src versionado presente en las dos homes)');
    let difOut = '';
    try { difOut = execFileSync('diff', ['-rq', BASE, ROOT], { encoding: 'utf8' }); }
    catch (e) { difOut = e.stdout || ''; }
    const dif = difOut
      .split('\n').filter(Boolean)
      .map((l) => l.replace(BASE, 'BASE').replace(ROOT, 'ROOT'));
    // RE-PIN DE LA PREPARACIÓN (base viva v1046, aterrizaje v1047): el censo suma
    // las dos entradas de los stamps del preparador — server.js (solo el BUILD)
    // y public/index.html (solo app.js?v=715 + styles?v=20261282) — verificadas
    // por diff directo en el STATUS del preparador.
    const esperados = [
      'Files BASE/public/app.js and ROOT/public/app.js differ',
      'Files BASE/public/en/index.html and ROOT/public/en/index.html differ',
      'Files BASE/public/index.html and ROOT/public/index.html differ',
      'Files BASE/public/styles.css and ROOT/public/styles.css differ',
      'Files BASE/server.js and ROOT/server.js differ',
      'Only in ROOT/public: posty-recibiendo.jpg',
      'Only in ROOT: test-lote-seccion-subir-web.js',
    ];
    t(dif.length === esperados.length && esperados.every((e) => dif.includes(e)), `censo del diff = el declarado (${dif.length} entradas: ${dif.join(' · ')})`);

    console.log('== K. Control contra la base (el hueco se reproduce) ==');
    t(!appB.includes('lpSubirHTML') && !enBd.includes('id="subir"'), 'la base no tiene la sección Subir en ninguna home');
    t(cssB.includes('@media(min-width:761px){.hero-video{width:100px}.pz-mg--heroV{width:100px}}'), 'la base tiene el héroe achicado a 100px en escritorio');
    t(!fs.existsSync(path.join(BASE, 'public/posty-recibiendo.jpg')), 'la base no tiene la foto nueva');
  } else {
    console.log('== F/K. Omitidos (sin LOTE_BASE_DIR) ==');
  }

  console.log('== G. Boot: las homes servidas ==');
  const PORT = 34774;
  const tmpDir = fs.mkdtempSync('/tmp/lote-seccion-subir-');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: 'ignore',
  });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); up = r.ok; } catch (e) { /* espera */ }
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'el server levantó');
    if (up) {
      const rEn = await fetch(`http://127.0.0.1:${PORT}/en/`);
      const enHtml = await rEn.text();
      t(rEn.status === 200 && enHtml.includes('id="subir"') && enHtml.includes('Your videos') && enHtml.includes('goes out the next day as a post'), 'la home EN servida trae la sección Subir espejada');
      const rApp = await fetch(`http://127.0.0.1:${PORT}/app.js`);
      const appJs = await rApp.text();
      t(appJs.includes('function lpSubirHTML()') && appJs.includes('Tu material también se convierte en posteos') && appJs.includes('sale al día siguiente como posteo'), 'el app.js servido trae la sección Subir ES completa');
      const rCss = await fetch(`http://127.0.0.1:${PORT}/styles.css`);
      const cssS = await rCss.text();
      t(cssS.includes('width:min(600px,92vw)') && cssS.includes('width:min(640px,58vw)'), 'el styles servido trae el héroe grande');
      const rImg = await fetch(`http://127.0.0.1:${PORT}/posty-recibiendo.jpg`);
      const bytes = Buffer.from(await rImg.arrayBuffer());
      t(rImg.status === 200 && md5(bytes) === MD5_FOTO_NUEVA, 'la foto nueva se sirve con sus bytes exactos');
      const rVid = await fetch(`http://127.0.0.1:${PORT}/videos/posty-presentacion-poster.jpg`);
      t(rVid.status === 200, 'el póster del video del héroe se sirve (preload del héroe grande cubierto por el póster existente)');
    }
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  t(!fs.existsSync(path.join(ROOT, 'data')), 'el boot no dejó data/ dentro del árbol');

  console.log(`\n== test-lote-seccion-subir-web: ${ok} ok · ${bad} mal ==`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
