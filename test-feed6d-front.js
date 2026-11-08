'use strict';
global.pzIc = (name, px) => '<span class="pz-ic"></span>'; // stub: en producción pzIc es global de app.js (sistema de íconos 2026-10-25)
/* test-feed6d-front.js — Tanda feed 6D · ítems 11–14 (frente): piezas
 * puras del bloque HOME_FEED real + el QR vendoreado real:
 *  · ítem 11: hfIgUrl/hfWaUrl y la lámina de compartir — con handle,
 *    QR (SVG de la matriz real), link en texto y las tres acciones;
 *    sin handle, lámina honesta sin QR ni links falsos.
 *  · ítem 12: hfCoverPlan (desde las destacadas reales o el set
 *    genérico ES/EN), iconos honestos, hfCoverSVG determinístico con
 *    la paleta de la cuenta, SIN texto en la imagen y tinta con
 *    contraste; el nombre va como rótulo en la lámina, no impreso.
 *  · ítem 13: editar perfil SACADO (lote sacar-lápiz-perfil · 7/11,
 *    decisión Valentino: el lápiz sale; la lámina hfEditProfileHTML y
 *    su preview hfEditPreviewProf ya no existen; el test fija que no
 *    queda ningún data-hf-pact="edit" ni llamada a hfEditOpen).
 *  · ítem 14: hfArchiveHTML con las tres fuentes: versión de borrador
 *    con botón de intercambio, versión de publicado SIN botón,
 *    republicado con «Ver el borrador», descartado con restaurar,
 *    archivado en IG SIN botón falso y con su copy; vacíos honestos.
 * Uso: node test-feed6d-front.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
ok(a > 0 && b > a, 'bloque HOME_FEED delimitado en app.js');

const sb = {
  console, Date, Math, JSON,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  pcTz: () => 'America/Argentina/Buenos_Aires',
  pcParseDate: (s0) => { const s = String(s0 || ''); if (!s) return null; let x = s.replace(' ', 'T'); if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z'; const d = new Date(x); return isNaN(d) ? null : d; },
  ME: undefined,
  pzIc: (name, px) => '<span class="pz-ic"></span>', // stub: en producción pzIc es global de app.js
};
vm.createContext(sb);
// El QR vendoreado REAL, como lo carga el navegador a demanda.
vm.runInContext(fs.readFileSync(path.join(__dirname, 'public', 'qr-vendor.js'), 'utf8'), sb);
vm.runInContext(APP.slice(a, b), sb);
// (LOTE SACAR-LÁPIZ-PERFIL · 7/11) pzDecEnt vive en app.js:11, FUERA
// del bloque HOME_FEED: el sandbox no lo tenía y homeHeadHTML reventaba
// con ReferenceError (el crash pre-existente de la base en :116).
// Se extrae la función real y se carga tal cual, como hace
// test-loteglassperfil.js — sin stub inventado.
const pzDecEntSrc = (() => {
  const i = APP.indexOf('function pzDecEnt');
  if (i < 0) return '';
  let depth = 0, j = i, q = null, esc = false;
  for (; j < APP.length; j++) {
    const c = APP[j];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; }
    else { if (c === '"' || c === "'" || c === '`') q = c; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
  }
  return APP.slice(i, j + 1);
})();
if (pzDecEntSrc) vm.runInContext(pzDecEntSrc, sb);
ok(typeof sb.pzDecEnt === 'function', 'pzDecEnt real cargado en el sandbox (fuera del bloque HOME_FEED)');
ok(typeof sb.hfShareSheetHTML === 'function' && typeof sb.hfCoverSVG === 'function'
  && typeof sb.hfEditProfileHTML === 'undefined' && typeof sb.hfArchiveHTML === 'function',
  'piezas puras 6D cargan en el sandbox (la lámina de edición ya no existe: sacar-lápiz-perfil 7/11)');

// — Ítem 11: URL, WhatsApp y QR —
const prof = { username: 'cafesol', name: 'Café Sol', bio: 'Café de especialidad', highlights: [], palette: ['#3B2314', '#FEC14D'] };
ok(sb.hfIgUrl(prof) === 'https://www.instagram.com/cafesol/', 'hfIgUrl: URL pública con el handle real');
ok(sb.hfIgUrl({}) === '' && sb.hfIgUrl(null) === '', 'hfIgUrl: sin handle, sin URL');
ok(sb.hfWaUrl(prof, false).indexOf('https://wa.me/?text=') === 0
  && decodeURIComponent(sb.hfWaUrl(prof, false)).includes('https://www.instagram.com/cafesol/'),
  'hfWaUrl: wa.me con texto + link');
ok(sb.hfWaUrl({}, false) === '', 'hfWaUrl: sin handle, sin link de WhatsApp');
const m = sb.hfQrMatrix('https://www.instagram.com/cafesol/');
ok(Array.isArray(m) && m.length >= 21 && m.length === m[0].length, 'hfQrMatrix: matriz cuadrada de la librería real');
ok(m[0][0] === true && m[0][6] === true && m[0][7] === false && m[7][0] === false,
  'hfQrMatrix: patrón buscador + separador en la esquina');
const qrSvg = sb.hfQrSVG('https://www.instagram.com/cafesol/');
ok(qrSvg.includes('<svg') && qrSvg.includes('<path') && qrSvg === sb.hfQrSVG('https://www.instagram.com/cafesol/'),
  'hfQrSVG: SVG determinístico de la matriz');
const sheet = sb.hfShareSheetHTML(prof, false);
ok(sheet.includes('data-hf-qr') && sheet.includes('<svg'), 'lámina de compartir: QR renderizado');
ok(sheet.includes('https://www.instagram.com/cafesol/') && sheet.includes('@cafesol'), 'lámina: link en texto + @');
ok(sheet.includes('data-hf-ps-act="copy"') && sheet.includes('Copiar link')
  && sheet.includes('data-hf-ps-act="native"') && sheet.includes('Enviar por WhatsApp'),
  'lámina: Copiar link + Compartir del sistema + WhatsApp');
const sheetEn = sb.hfShareSheetHTML(prof, true);
ok(sheetEn.includes('Share my profile') && sheetEn.includes('Copy link'), 'lámina EN: gemelos «Share my profile»/«Copy link»');
const sheetNo = sb.hfShareSheetHTML({}, false);
ok(!sheetNo.includes('data-hf-qr') && !sheetNo.includes('wa.me') && !sheetNo.includes('<svg')
  && sheetNo.includes('Todavía no tenemos tu usuario'),
  'sin handle: lámina honesta, sin QR ni links falsos');

// — Ítem 12: cubiertas —
const profHl = Object.assign({}, prof, { highlights: [{ title: 'Promos' }, { title: 'Catálogo' }, { title: 'Opiniones' }, { title: 'Nuestro rincón' }] });
const plan = sb.hfCoverPlan(profHl, false);
ok(plan.length === 4 && plan[0].icon === 'percent' && plan[1].icon === 'bag' && plan[2].icon === 'chat' && plan[3].icon === 'spark',
  'hfCoverPlan: una por destacada real, ícono acorde (y genérico honesto si no mapea)');
const planGen = sb.hfCoverPlan(prof, false);
ok(planGen.length === 6 && planGen[0].title === 'Lo estrella' && planGen[4].title === 'Cómo comprar',
  'hfCoverPlan: sin destacadas legibles, set genérico del rubro (ES)');
const planGenEn = sb.hfCoverPlan(prof, true);
ok(planGenEn[0].title === 'The star' && planGenEn[5].title === 'About us', 'hfCoverPlan: set genérico EN');
ok(sb.hfCoverPalette(prof)[0] === '#3B2314', 'hfCoverPalette: la paleta del feed manda');
ok(sb.hfCoverInk('#FFFFFF') === '#0A1E33' && sb.hfCoverInk('#111111') === '#FFFFFF', 'hfCoverInk: tinta con contraste');
const cov = sb.hfCoverSVG(plan[0], sb.hfCoverPalette(prof), 0);
ok(cov.includes('fill="#3B2314"') && cov.includes('stroke="#FEC14D"') === false && cov.includes('translate(300 300)'),
  'hfCoverSVG: fondo = paleta[0], ícono centrado');
ok(!cov.includes('<text') && cov === sb.hfCoverSVG(plan[0], sb.hfCoverPalette(prof), 0),
  'hfCoverSVG: SIN texto en la imagen y determinístico');
const covSheet = sb.hfCoversSheetHTML(profHl, false);
ok(covSheet.includes('<figcaption>Promos</figcaption>') && covSheet.includes('data-hf-cov-dl="0"')
  && covSheet.includes('Descargar todas'), 'lámina de cubiertas: rótulo FUERA de la imagen + descargar (una/todas)');
ok(covSheet.includes('Instagram no deja que Posty las aplique por vos'),
  'lámina de cubiertas: copy honesto de aplicación manual en IG');
ok(sb.hfCoversSheetHTML(profHl, true).includes('Instagram does not let Posty apply them for you'),
  'lámina de cubiertas EN: copy honesto gemelo');

// — Ítem 13: editar perfil SACADO (lote sacar-lápiz-perfil · 7/11,
//   decisión Valentino: el lápiz sale) — las piezas ya no existen; se
//   fija a nivel de fuente que no queda ningún botón ni llamada.
ok(!APP.includes('function hfEditProfileHTML(') && !APP.includes('function hfEditPreviewProf(')
  && !APP.includes('function hfEditOpen(') && !APP.includes('hfEditOpen()'),
  'editar: la lámina + su preview + el abridor ya no existen');
ok(!APP.includes('data-hf-pact="edit"') && !APP.includes('data-hf-ed-'),
  'editar: ningún botón lápiz ni campo de edición en app.js');
ok(APP.includes('data-hf-pact="share"') && APP.includes('data-hf-pact="settings"'),
  'editar: compartir y Ajustes siguen (solo salió el lápiz)');
ok(!APP.includes('Guardar en Posty') && !APP.includes('Save in Posty'),
  'editar: sin «Guardar en Posty» (la promesa que no se podía cumplir)');

// — Ítem 14: archivo —
const archData = {
  versions: [
    { id: 11, post_id: 5, caption: 'Versión vieja del posteo', image_path: '/media/v.jpg', created_at: '2026-10-20 10:00:00', post_status: 'draft' },
    { id: 10, post_id: 6, caption: 'Versión de un publicado', image_path: '/media/w.jpg', created_at: '2026-10-19 10:00:00', post_status: 'published' },
  ],
  recycled: [{ post_id: 7, new_post_id: 9, created_at: 1761000000000, old_caption: 'El que voló', old_image: '/media/r.jpg', new_status: 'draft' }],
  cancelled: [{ id: 8, caption: 'Borrador descartado', image_path: '/media/c.jpg', created_at: '2026-10-18 10:00:00' }],
  archived: [{ id: 4, caption: 'Archivado en IG', image_path: '/media/a.jpg', published_at: '2026-09-01 10:00:00', ig_permalink: 'https://www.instagram.com/p/ABC123/' }],
};
const arch = sb.hfArchiveHTML(archData, false);
ok(arch.includes('data-hf-ar-ver="11"') && arch.includes('Volver a esta versión'),
  'archivo: versión de borrador con «Volver a esta versión» (intercambio)');
ok(!arch.includes('data-hf-ar-ver="10"') && arch.includes('Ya publicado'),
  'archivo: versión de publicado SIN botón (nota honesta)');
ok(arch.includes('data-hf-ar-goto="9"') && arch.includes('Ver el borrador'), 'archivo: republicado con su borrador nuevo');
ok(arch.includes('data-hf-ar-restore="8"') && arch.includes('Restaurar como borrador'), 'archivo: descartado con restaurar');
ok(arch.includes('desarchivarlo en Instagram') && !arch.includes('data-hf-ar-unarchive')
  && arch.includes('https://www.instagram.com/p/ABC123/'),
  'archivo: archivado en IG sin botón falso, con su copy y su permalink');
const archEmpty = sb.hfArchiveHTML({ versions: [], recycled: [], cancelled: [], archived: [] }, false);
ok(archEmpty.includes('Tu archivo está vacío por ahora') && archEmpty.includes('Todavía no hay versiones anteriores'),
  'archivo vacío: estados honestos por sección');
ok(sb.hfArchiveHTML(archData, true).includes('Back to this version'), 'archivo EN: gemelo «Back to this version»');
// (LOTE SACAR-LÁPIZ-PERFIL · 7/11) Las aserciones v462 de abajo estaban
// rotas desde INICIO-3 (3/11): hfProfileActionsHTML ya NO rinde botones
// de texto («Editar perfil», «Compartir mi perfil», «Ver como visitante»,
// «Tu archivo») — sin acceptHTML devuelve '' y con acceptHTML rinde SOLO
// la fila de Aceptar todo. Estaban tapadas por el crash de :116; al
// arreglar el sandbox salieron a la luz. Se fijan al comportamiento real.
ok(sb.hfProfileActionsHTML(false) === '' && sb.hfProfileActionsHTML(true) === '',
  'cabecera: sin candidatos no hay fila (los botones de texto salieron en INICIO-3)');
ok(sb.hfProfileActionsHTML(false, '<b>X</b>').includes('class="hf-pacts hf-pacts-accept"')
  && sb.hfProfileActionsHTML(false, '<b>X</b>').includes('<b>X</b>')
  && !sb.hfProfileActionsHTML(false, '<b>X</b>').includes('Editar perfil')
  && !sb.hfProfileActionsHTML(false, '<b>X</b>').includes('Compartir mi perfil')
  && !sb.hfProfileActionsHTML(false, '<b>X</b>').includes('class="hf-pact"'),
  'cabecera: con candidatos rinde SOLO la fila de Aceptar todo, sin botones de texto ni pastillas viejas');
const headPlus = sb.homeHeadHTML({ username: 'u', name: 'N', bio: '', bio_unread: false, link: '', pic: null, followers: null, posts_count: null, following: null, highlights: [{ title: 'Menú', cover: '' }] }, 'X', { en: false, coversPlus: true });
ok(headPlus.includes('data-hf-pact="covers"') && headPlus.includes('Crear cubierta') && !headPlus.includes('Cubiertas') && headPlus.indexOf('hf-hl-plus') < headPlus.indexOf('Menú'),
  'cabecera v462: cubiertas como primer tile «+» de la tira (vista del dueño)');
const headNoPlus = sb.homeHeadHTML({ username: 'u', name: 'N', bio: '', bio_unread: false, link: '', pic: null, followers: null, posts_count: null, following: null, highlights: [{ title: 'Menú', cover: '' }] }, 'X', { en: false });
ok(!headNoPlus.includes('hf-hl-plus') && headNoPlus.includes('Menú'),
  'cabecera v462: sin coversPlus no hay tile «+» (preview de edición intacto)');
const headPlusEmpty = sb.homeHeadHTML({ username: 'u', name: 'N', bio: '', bio_unread: false, link: '', pic: null, followers: null, posts_count: null, following: null, highlights: [] }, 'X', { en: true, coversPlus: true });
ok(headPlusEmpty.includes('data-hf-pact="covers"') && headPlusEmpty.includes('Create cover') && !headPlusEmpty.includes('>Covers<'),
  'cabecera v462: con coversPlus la tira existe aunque no haya destacadas');

console.log(`\nfeed6d-front: ${total - fails}/${total}`);
process.exit(fails ? 1 : 0);
