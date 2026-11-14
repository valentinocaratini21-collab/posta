// test-lote-bloque-fundador.js — LOTE BLOQUE-FUNDADOR-WEB
// Orden de Valentino (reclamada 3 veces, 13/11 21:13): el bloque del
// fundador aprobado — la foto espalda con espalda con Posty del post 5
// (la final, con destellos y el sello dorado), a tamaño completo sin
// recortar, «Somos un equipo, Posty y yo» + «Valentino Caratini /
// Founder de Posty» — tiene que ser lo que muestra el website.
//
// Hallazgo del censo: la sección #equipo YA existía en las dos homes
// con el titular, el nombre y el párrafo pineados por la directiva de
// Valentino del 7/11 (vecina test-lote-website-copy), pero el archivo
// valentino-posty-fundador.jpg guardaba OTRA toma (sin destellos, sin
// sello): la foto aprobada nunca había subido. Este lote reemplaza el
// CONTENIDO del archivo por la foto aprobada (fuente:
// ig-personal/primeros-6/05-posty-final.jpg, 1296×1616 → copia web
// 1080×1347 q82, la misma foto completa) y versiona el src (?v=2)
// para que ningún caché siga sirviendo la toma vieja.
//
// Pins:
//  A. Las dos homes montan el bloque (titular + tarjeta + nombre +
//     founder + foto versionada), ES y EN espejados.
//  B. La foto servida ES la aprobada: md5 pineado de la copia web
//     construida desde la fuente aprobada (verificación de identidad
//     por píxeles en el STATUS del lote: distancia 0,19 contra la
//     fuente, 32,55 contra la toma vieja) + dimensiones 1080×1347.
//  C. Sin recorte: la regla .founder-card img es height:auto y no
//     declara object-fit que corte.
//  D. Boot: la foto se sirve por HTTP con los bytes exactos del
//     archivo, y las homes servidas traen el bloque.
//  K. Control contra la base (LOTE_BASE_DIR): la base sirve la toma
//     vieja (md5 histórico) y el src sin versionar — el hueco se
//     reproduce.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = __dirname;
const BASE = process.env.LOTE_BASE_DIR || '';
let ok = 0, bad = 0;
const t = (cond, msg) => { if (cond) { ok++; } else { bad++; console.log('  MAL:', msg); } };
const read = (p) => fs.readFileSync(p, 'utf8');
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

const MD5_FOTO_APROBADA_WEB = '574c3b5082b7e2382dc486f89f17f861';
const MD5_FOTO_VIEJA = 'ce6de402aab7f55fe9bc9684d2449086';

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

async function main() {
  console.log('== A. El bloque montado en las dos homes ==');
  const app = read(path.join(ROOT, 'public/app.js'));
  const en = read(path.join(ROOT, 'public/en/index.html'));
  for (const [nombre, src, cadenas] of [
    ['ES (app.js landingView)', app, ['id="equipo"', 'Somos un equipo, Posty y yo', 'founder-card', 'id="homeFounderCard"', 'Valentino Caratini', 'Founder de Posty', 'src="valentino-posty-fundador.jpg?v=2"']],
    ['EN (en/index.html)', en, ['id="equipo"', "We're a team, Posty and I", 'founder-card', 'Valentino Caratini', 'Founder of Posty', 'src="valentino-posty-fundador.jpg?v=2"']],
  ]) {
    for (const c of cadenas) t(src.includes(c), `${nombre}: falta «${c}»`);
  }

  console.log('== B. La foto servida es la aprobada ==');
  const fotoPath = path.join(ROOT, 'public/valentino-posty-fundador.jpg');
  const foto = fs.readFileSync(fotoPath);
  t(md5(foto) === MD5_FOTO_APROBADA_WEB, `md5 de la foto = ${md5(foto)} (esperado el de la copia web de la foto aprobada)`);
  t(md5(foto) !== MD5_FOTO_VIEJA, 'la foto ya no es la toma vieja');
  const dim = jpegSize(foto);
  t(dim && dim.w === 1080 && dim.h === 1347, `dimensiones ${dim ? dim.w + '×' + dim.h : '??'} (esperado 1080×1347, la foto completa en su aspecto original)`);

  console.log('== C. Sin recorte por CSS ==');
  const css = read(path.join(ROOT, 'public/styles.css'));
  const regla = (css.match(/\.founder-card img\{[^}]*\}/) || [''])[0];
  t(/height\s*:\s*auto/.test(regla), 'la regla .founder-card img declara height:auto');
  t(!/object-fit\s*:\s*cover/.test(regla), 'la regla .founder-card img NO recorta con object-fit:cover');

  if (BASE && fs.existsSync(path.join(BASE, 'public/valentino-posty-fundador.jpg'))) {
    console.log('== K. Control contra la base (el hueco se reproduce) ==');
    const fotoBase = fs.readFileSync(path.join(BASE, 'public/valentino-posty-fundador.jpg'));
    t(md5(fotoBase) === MD5_FOTO_VIEJA, 'la base sirve la toma vieja (sin destellos ni sello)');
    const appBase = read(path.join(BASE, 'public/app.js'));
    t(appBase.includes('src="valentino-posty-fundador.jpg"') && !appBase.includes('valentino-posty-fundador.jpg?v=2'), 'la base referencia la foto sin versionar');
  } else {
    console.log('== K. Control contra la base: omitido (sin LOTE_BASE_DIR) ==');
  }

  console.log('== D. Boot: la foto y las homes se sirven ==');
  const PORT = 34771;
  const tmpDir = fs.mkdtempSync('/tmp/lote-bloque-fundador-');
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
      const rImg = await fetch(`http://127.0.0.1:${PORT}/valentino-posty-fundador.jpg?v=2`);
      const bytes = Buffer.from(await rImg.arrayBuffer());
      t(rImg.status === 200, `GET foto → ${rImg.status}`);
      t((rImg.headers.get('content-type') || '').includes('image/jpeg'), 'la foto se sirve como image/jpeg');
      t(md5(bytes) === MD5_FOTO_APROBADA_WEB, 'los bytes servidos son exactamente la foto aprobada');
      const rEn = await fetch(`http://127.0.0.1:${PORT}/en/`);
      const enHtml = await rEn.text();
      t(rEn.status === 200 && enHtml.includes('valentino-posty-fundador.jpg?v=2') && enHtml.includes("We're a team, Posty and I"), 'la home EN servida trae el bloque espejado');
      const rApp = await fetch(`http://127.0.0.1:${PORT}/app.js`);
      const appJs = await rApp.text();
      t(appJs.includes('valentino-posty-fundador.jpg?v=2') && appJs.includes('Somos un equipo, Posty y yo') && appJs.includes('id="homeFounderCard"'), 'el app.js servido trae el bloque ES completo');
    }
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  t(!fs.existsSync(path.join(ROOT, 'data')), 'el boot no dejó data/ dentro del árbol');

  console.log(`\n== test-lote-bloque-fundador: ${ok} ok · ${bad} mal ==`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
