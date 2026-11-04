// Lote AGREGAR-A-SUBIR: test sobre el codigo REAL extraido de public/app.js.
// Corre: node test-loteagregarsubir.js <workdir>
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] + '/public/app.js', 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fails++; };

// 1. Estatico: literales viejos de la hoja, 0; nuevos, 1 cada uno (ES+EN en gzT).
for (const old of ["'¿Qué querés agregar?'", "'What do you want to add?'", "'Agregar foto'", "'Add photo'", "'Agregar video'", "'Add video'"]) {
  // 'Agregar foto'/'Add photo' viejos: solo cuentan dentro de pzDockMasHTML
  const i = src.indexOf('function pzDockMasHTML()');
  const j = src.indexOf('function pzDockMasToggle()');
  const sheet = src.slice(i, j);
  ok(!sheet.includes(old), 'hoja sin literal viejo ' + old);
}
for (const nw of ["'¿Qué querés subir?'", "'What do you want to upload?'", "'Subir foto'", "'Upload photo'", "'Subir video'", "'Upload video'"]) {
  const i = src.indexOf('function pzDockMasHTML()');
  const j = src.indexOf('function pzDockMasToggle()');
  const sheet = src.slice(i, j);
  ok(sheet.split(nw).length - 1 === 1, 'hoja con literal nuevo ' + nw + ' x1');
}
// 2. Etiqueta del + del dock intacta + handlers intactos + resto de Agregar intacto.
ok(src.includes("gzT('Agregar', 'Add')"), 'etiqueta del + del dock intacta (Agregar/Add)');
ok(src.includes('onclick="pzDockMasFoto()"') && src.includes('onclick="pzDockMasVideo()"') && src.includes('onclick="pzDockMasClose()"'), 'handlers de la hoja intactos');
ok(src.includes('title="Agregar fotos o videos"'), 'otro Agregar (titulo media) intacto');
ok(src.includes('Tocá "Agregar"'), 'otro Agregar (paso PWA) intacto');
// 3. Conductual: evaluar pzDockMasHTML real con stubs, ES y EN.
const i = src.indexOf('function pzDockMasHTML()');
const j = src.indexOf('function pzDockMasToggle()');
const fnSrc = src.slice(i, j);
let LANG = 'es';
const gzT = (es, en) => (LANG === 'en' ? en : es);
const pzIc = () => '[ic]';
eval(fnSrc);
for (const [lang, t, f, v] of [['es', '¿Qué querés subir?', 'Subir foto', 'Subir video'], ['en', 'What do you want to upload?', 'Upload photo', 'Upload video']]) {
  LANG = lang;
  const html = pzDockMasHTML();
  ok(html.includes(t), lang + ': titulo "' + t + '"');
  ok(html.includes(f), lang + ': boton "' + f + '"');
  ok(html.includes(v), lang + ': boton "' + v + '"');
  ok(!html.includes('agregar') && !html.includes('Agregar') && !html.includes('add') && !html.includes('Add'), lang + ': sin restos de agregar/add en la hoja');
}
console.log(fails === 0 ? 'TODO OK' : fails + ' FALLOS');
process.exit(fails ? 1 : 0);
