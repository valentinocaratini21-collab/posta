// test-lote-sacar-lapiz-perfil.js — LOTE SACAR-LÁPIZ-PERFIL (7/11, decisión Valentino 20:49):
// «el lapiz del perfil saquemoslo. nadie va a editar su perfil desde posty,
// lo van a hacer por instagram». El perfil de la home es el espejo del
// Instagram del cliente; el lápiz abría una lámina «Editar perfil» que
// guardaba nombre/bio/link SOLO en Posty (PUT /api/profile, profile_*),
// algo que Instagram no deja aplicar desde afuera — una promesa que la
// app no puede cumplir. Se saca: el botón lápiz de la fila de info,
// su rama en hfProfileBind, la lámina (hfEditProfileHTML) + su preview
// (hfEditPreviewProf) + el abridor (hfEditOpen). Quedan: Compartir y
// Ajustes (mismos íconos, mismos handlers), el perfil entero (avatar,
// nombre, bio, stats) y el ícono pencil para TODO lo demás (revisión,
// caption, chat, lightbox… — el lápiz como ícono NO se toca).
// NO se toca: server.js (PUT /api/profile lo usan onboarding, trial y
// Ajustes; el overlay homeDisplayOverlay sigue aplicando profile_*
// guardados — ver STATUS del lote), ni styles.css (reglas .hf-ed-*
// quedan sin emisor; test-loteaprobacionrecorte fija .hf-ed-field 16px).
// Uso: node test-lote-sacar-lapiz-perfil.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
function maxButtonDepth(html) {
  let depth = 0, max = 0;
  const re = /<\/?button\b[^>]*>/g; let m;
  while ((m = re.exec(html))) { if (m[0][1] === '/') depth--; else { depth++; if (depth > max) max = depth; } }
  return max;
}

/* ---------- 1. Fuente: el lápiz y su lámina ya no existen ---------- */
console.log('— fuente: sin lápiz, sin lámina —');
ok(!app.includes('data-hf-pact="edit"'), 'ningún data-hf-pact="edit" en app.js');
ok(!app.includes('function hfEditOpen('), 'hfEditOpen ya no existe');
ok(!app.includes('function hfEditProfileHTML('), 'hfEditProfileHTML ya no existe');
ok(!app.includes('function hfEditPreviewProf('), 'hfEditPreviewProf ya no existe');
ok(!app.includes('hfEditOpen()'), 'ninguna llamada a hfEditOpen en app.js (el comentario-tumba no cuenta)');
ok(!app.includes('hfEditProfileHTML(') && !app.includes('hfEditPreviewProf('), 'ninguna llamada a las piezas de edición en app.js (el comentario-tumba no cuenta)');
ok(!app.includes('data-hf-ed-'), 'ningún data-hf-ed-* en app.js');
ok(!app.includes('Guardar en Posty') && !app.includes('Save in Posty'), 'sin «Guardar en Posty» / «Save in Posty»');
ok(!app.includes('Perfil guardado en Posty') && !app.includes('Profile saved in Posty'), 'sin toast «Perfil guardado en Posty»');
ok(!app.includes('/api/profile", { profile_name'), 'sin PUT de profile_name/bio/link desde la lámina');

/* ---------- 2. Fuente: el ícono pencil sigue para todo lo demás ---------- */
console.log('— fuente: pencil vive para el resto —');
ok(app.includes("pzIc('pencil', 18)} Editar"), 'revisión: botón Editar del posteo intacto');
ok((app.match(/pzIc\('pencil'/g) || []).length >= 10, 'pencil sigue usado en el resto de la app (revisión, caption, chat, lightbox…)');
ok(app.includes("pencil: '<path"), 'la definición del ícono pencil sigue en el mapa');

/* ---------- 3. Fuente: Compartir y Ajustes intactos ---------- */
console.log('— fuente: Compartir y Ajustes intactos —');
const hh = extractFn(app, 'function homeHeadHTML');
ok(!!hh, 'extrae homeHeadHTML');
ok(hh.includes('const headIconsHTML'), 'los íconos siguen en headIconsHTML');
ok(hh.includes('data-hf-pact="share"') && hh.includes('data-hf-pact="settings"'), 'share + settings siguen');
ok(hh.indexOf('data-hf-pact="share"') < hh.indexOf('data-hf-pact="settings"'), 'orden: compartir, Ajustes');
ok(hh.includes("aria-label=\"${en ? 'Share my profile' : 'Compartir mi perfil'}\""), 'Compartir con aria-label ES/EN');
ok(hh.includes("aria-label=\"${en ? 'Settings' : 'Ajustes'}\""), 'Ajustes con aria-label ES/EN');
ok(hh.includes("pzIc('share', 20)") && hh.includes("pzIc('gear', 20)"), 'íconos share 20 + gear 20');
const bind = extractFn(app, 'function hfProfileBind');
ok(bind.includes("root.querySelectorAll('[data-hf-pact]')"), 'hfProfileBind bindea por [data-hf-pact]');
ok(bind.includes("if (act === 'share') hfShareOpen();"), 'share -> hfShareOpen');
ok(bind.includes("else if (act === 'settings') { location.hash = '#/app/ajustes'; }"), 'settings -> #/app/ajustes');
ok(!bind.includes('hfEditOpen') && !bind.includes("act === 'edit'"), 'hfProfileBind sin rama edit');
ok((app.match(/function hfShareOpen\(/g) || []).length === 1, 'hfShareOpen definida (auditoría)');
ok((app.match(/function hfArchiveOpen\(/g) || []).length === 1, 'hfArchiveOpen definida (auditoría)');
ok((app.match(/function hfCoversOpen\(/g) || []).length === 1, 'hfCoversOpen definida (auditoría)');
ok((app.match(/function pzPubInfoOpen\(/g) || []).length === 1, 'pzPubInfoOpen definida (auditoría)');

/* ---------- 4. Render real: el perfil se ve igual, sin el lápiz ---------- */
console.log('— render: perfil intacto, 2 íconos —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const pzDecEnt = extractFn(app, 'function pzDecEnt');
ok(!!escLine && !!pzDecEnt, 'extrae esc + pzDecEnt');
const ctx = { console, pzIc: (n) => '<i data-ic="' + n + '"></i>' };
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + pzDecEnt + '\n' + hh, ctx);
const H = ctx.homeHeadHTML;
ok(typeof H === 'function', 'homeHeadHTML ejecutable');
const base = { username: 'cafesol', name: 'Café Sol', bio: 'Café de especialidad, todos los días.', link: 'cafesol.com', pic: null,
  posts_count: 120, followers: 999, following: 321, is_verified: true };
const outEs = H(Object.assign({}, base), 'Café Sol', { splitHead: true, racha: 2, headIcons: true });
ok(outEs.includes('class="hf-head"'), 'ES: cabecera presente');
ok(outEs.includes('hf-ava') && outEs.includes('Café Sol'), 'ES: avatar + nombre');
ok(outEs.includes('Café de especialidad'), 'ES: bio presente');
ok(outEs.includes('>120<') && outEs.includes('publicaciones') && outEs.includes('>999<') && outEs.includes('seguidores'), 'ES: stats intactas');
ok(outEs.includes('cafesol.com'), 'ES: link presente');
ok(outEs.includes('hf-head-icons'), 'ES: span de íconos presente');
ok(outEs.includes('data-hf-pact="share"') && outEs.includes('data-hf-pact="settings"'), 'ES: compartir + Ajustes en el render');
ok(!outEs.includes('data-hf-pact="edit"') && !outEs.includes('Editar perfil'), 'ES: sin lápiz en el render');
ok(outEs.includes('¿Cómo publica Posty?'), 'ES: fila de info intacta');
const rachaRow = outEs.slice(outEs.indexOf('<div class="hf-racha">'), outEs.indexOf('</div>', outEs.indexOf('<div class="hf-racha">')) + 6);
ok(maxButtonDepth(rachaRow) === 1, 'ES: sin botones anidados en la fila');
const outEn = H(Object.assign({}, base), 'Café Sol', { splitHead: true, racha: 2, headIcons: true, en: true });
ok(outEn.includes('aria-label="Share my profile"') && outEn.includes('aria-label="Settings"'), 'EN: aria-labels compartir + Ajustes');
ok(!outEn.includes('aria-label="Edit profile"') && !outEn.includes('Edit profile'), 'EN: sin «Edit profile» en el render');
ok(outEn.includes('followers') && outEn.includes('posts'), 'EN: stats en inglés');
const outVis = H(Object.assign({}, base), 'Café Sol', { splitHead: true, racha: 2 });
ok(!outVis.includes('hf-head-icons') && !outVis.includes('data-hf-pact'), 'visitante: sin íconos');
ok(outVis.includes('Café Sol') && outVis.includes('Café de especialidad'), 'visitante: el perfil se sigue viendo');

/* ---------- 5. CSS: el estilo de los íconos no se tocó ---------- */
console.log('— CSS —');
ok(css.includes('.hf-head-ic{width:40px;height:40px'), 'ícono 40px intacto');
ok(css.includes('.hf-racha .hf-head-icons{margin-left:auto}'), '.hf-head-icons a la derecha (margin-left:auto)');

console.log('\ntest-lote-sacar-lapiz-perfil: ' + pass + ' ok, ' + fail + ' mal' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
