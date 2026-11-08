// LOTE BOTÓN-COMPARTIR-REFERIDOS (decisión Valentino 7/11 ~20:50):
// «el boton de compartir, que sea para los referidos» + «que ese boton
// te lleve a lo de referidos». Compartir suelto (la lámina «Compartir mi
// perfil» con el link de Instagram) no da el descuento: por Referidos el
// invitado queda registrado y cuenta para el 50% (2 referidos suscriptos).
// Cambio: el ícono de compartir del encabezado del perfil (home) ya NO
// abre la lámina de compartir: lleva a Ajustes > Referidos
// (#/app/ajustes?referidos=1), donde vive el link de referido con sus
// botones para invitar. La lámina vieja (hfShareOpen / hfShareSheetHTML
// + sus helpers de QR/WhatsApp) queda sin emisor y se borra; los demás
// botones de compartir (detalle de posteo, racha, TikTok, historia,
// festejos, Referidos) NO se tocan.
// Corre con: node test-lote-boton-compartir-referidos.js (desde el dir del árbol).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const t = (c, n) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n); } };

const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const ajustes = fs.readFileSync(path.join(__dirname, 'public', 'chunk-ajustes.js'), 'utf8');

// --- A) El botón principal: mismo ícono, nuevo destino ---
// homeHeadHTML vive en el bloque HOME_FEED; se carga en sandbox como en
// test-feed6d-front.js (con pzDecEnt, que el home usa y el sandbox no trae).
const a = app.indexOf('const HOME_FEED_CAP');
const b = app.indexOf('/* ===== /HOME_FEED ===== */', a);
t(a > 0 && b > a, 'bloque HOME_FEED delimitado en app.js');
const pzDecEnt = (s) => {
  let out = String(s ?? ''), prev = null;
  for (let i = 0; i < 3 && out !== prev; i++) {
    prev = out;
    out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ''; } })
      .replace(/&#([0-9]+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return ''; } })
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  return out;
};
const sb = {
  console, Date, Math, JSON, pzDecEnt,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  pcTz: () => 'America/New_York',
  pcParseDate: (s0) => { const s = String(s0 || ''); if (!s) return null; let x = s.replace(' ', 'T'); if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z'; const d = new Date(x); return isNaN(d) ? null : d; },
  ME: undefined,
  pzIc: (name, px) => '<span class="pz-ic"></span>',
};
vm.createContext(sb);
vm.runInContext(app.slice(a, b), sb);
const prof = { username: 'cafesol', name: 'Café Sol', bio: 'Café de especialidad', highlights: [], palette: ['#3B2314', '#FEC14D'] };
const headEs = sb.homeHeadHTML(prof, 'Café Sol', { en: false, headIcons: true });
const headEn = sb.homeHeadHTML(prof, 'Café Sol', { en: true, headIcons: true });
t(headEs.includes('data-hf-pact="share"'), 'header ES: el ícono de compartir sigue en el encabezado');
t(headEs.includes('aria-label="Referidos"'), 'header ES: el botón dice Referidos');
t(!headEs.includes('Compartir mi perfil'), 'header ES: ya no dice «Compartir mi perfil»');
t(headEn.includes('aria-label="Referrals"'), 'header EN: el botón dice Referrals');
t(!headEn.includes('Share my profile'), 'header EN: ya no dice «Share my profile»');
t(headEs.includes('data-hf-pact="settings"') && headEs.includes('aria-label="Ajustes"'), 'header: el engranaje (Ajustes) sigue intacto');
t(!headEs.includes('data-hf-pact="edit"'), 'header: el lápiz ya no está (lo sacó el lote sacar-lápiz-perfil 7/11, en vivo v780)');
t(!sb.homeHeadHTML(prof, 'Café Sol', { en: false }).includes('data-hf-pact="share"'), 'sin headIcons no hay botón de compartir en el header');

// --- B) El destino: hfProfileBind funcional con DOM falso ---
const bindStart = app.indexOf('function hfProfileBind(root)');
const bindEnd = app.indexOf('\nfunction hfCoverOpen(', bindStart);
t(bindStart > 0 && bindEnd > bindStart, 'hfProfileBind extraíble de app.js');
const loc = { hash: '' };
const called = [];
const sb2 = {
  console, location: loc,
  hfCoversOpen: () => called.push('covers'),
  hfArchiveOpen: () => called.push('archive'),
};
vm.createContext(sb2);
vm.runInContext(app.slice(bindStart, bindEnd), sb2);
const fakeEls = ['share', 'settings', 'covers', 'archive'].map((act) => ({ dataset: { hfPact: act }, onclick: null }));
const fakeRoot = { querySelectorAll: () => fakeEls };
sb2.hfProfileBind(fakeRoot);
t(fakeEls.every((el) => typeof el.onclick === 'function'), 'hfProfileBind: bindea los 4 íconos del header (el lápiz salió en v780)');
fakeEls[0].onclick(); t(loc.hash === '#/app/ajustes?referidos=1', 'click compartir → #/app/ajustes?referidos=1');
fakeEls[1].onclick(); t(loc.hash === '#/app/ajustes', 'click ajustes → #/app/ajustes (intacto)');
fakeEls[2].onclick(); t(called.includes('covers'), 'click cubiertas → hfCoversOpen (intacto)');
fakeEls[3].onclick(); t(called.includes('archive'), 'click archivo → hfArchiveOpen (intacto)');
t((() => { try { sb2.hfProfileBind(null); return true; } catch (e) { return false; } })(), 'hfProfileBind(null) no tira');

// --- C) La lámina vieja ya no existe (código muerto borrado) ---
for (const fn of ['hfShareOpen', 'hfShareSheetHTML', 'hfWaUrl', 'hfShareText', 'hfIgUrl',
  'hfQrMatrix', 'hfQrSVG', 'hfLoadQrVendor', 'HF_QR_LOADING', 'HF_WA_GLYPH', 'HF_SHARE_ICON']) {
  t(!app.includes(fn), 'app.js: sin resto de ' + fn);
}
t(app.includes('const HF_COPY_ICON'), 'app.js: HF_COPY_ICON sigue definido (conservado; su último uso era la lámina de compartir)');
t(fs.existsSync(path.join(__dirname, 'public', 'qr-vendor.js')), 'public/qr-vendor.js sigue en el árbol (vendoreado; ya nada lo carga)');

// --- D) Referidos sigue vivo: el destino existe ---
t(ajustes.includes("if (pq.get('referidos')) return 'referidos'"), 'chunk-ajustes: deep-link ?referidos → sección referidos');
t(ajustes.includes('id="ajsec-referidos"'), 'chunk-ajustes: existe la sección #ajsec-referidos');
t(ajustes.includes('id="pzRefNative"') && ajustes.includes('Compartir'), 'Referidos: botón Compartir nativo intacto');
t(ajustes.includes('id="pzRefCopy"') && ajustes.includes('Copiar link'), 'Referidos: Copiar link intacto');
t(ajustes.includes("Pagás la mitad, todos los meses") || ajustes.includes('Pagás la mitad'), 'Referidos: el 50% sigue explicado');

// --- E) Los OTROS compartir no se tocaron ---
t(app.includes('data-hfd-act="share"') && app.includes('hfDetailShare(post)'), 'detalle de posteo: compartir el posteo intacto');
t(app.includes('id="streakShareBtn"') && app.includes('Compartir mi racha'), 'racha: «Compartir mi racha» intacto');
t(app.includes('Compartir en TikTok'), 'TikTok: «Compartir en TikTok» intacto');
t(app.includes('data-pz-celeb-share') && app.includes('Compartir como historia'), 'festejo: «Compartir como historia» intacto');
t(app.includes('Compartí tu link'), 'festejo: bloque de referidos «Compartí tu link» intacto');
t((app.match(/hfShareOpen/g) || []).length === 0, 'ningún emisor restante de la lámina vieja');

// --- F) Funciones auditadas (M78: el lote toca app.js) ---
// (RE-BASE v780: hfEditOpen ya no existe — lo sacó el lápiz 7/11, en vivo v780.)
for (const fn of ['hfCoversOpen', 'hfArchiveOpen']) {
  t(new RegExp('function ' + fn + '\\(').test(app), 'función auditada: ' + fn + ' definida en app.js');
}
t(!app.includes('function hfEditOpen('), 'función auditada: hfEditOpen NO existe (sacado por el lápiz 7/11)');
t(/if \(act === 'share'\) \{ location\.hash = '#\/app\/ajustes\?referidos=1'; \}/.test(app), 'hfProfileBind: la rama share navega a Referidos (sin llamar a nada inexistente)');

console.log(`boton-compartir-referidos: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
