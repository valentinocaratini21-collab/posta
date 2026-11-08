// test-lote-iconos-linea-info.js — LOTE ICONOS-LINEA-INFO: los 2 botones
// del perfil (Compartir/Ajustes) viven en la misma línea que
// «¿Cómo publica Posty?» (fila .hf-racha), a la derecha.
// (LOTE SACAR-LÁPIZ-PERFIL · 7/11, decisión Valentino: el lápiz
// —Editar perfil— SALE; eran 3 íconos, ahora son 2.)
// Decisión de Valentino 6/11: donde estaban (fila del avatar, después
// de las stats) quedaba un espacio en blanco enorme a la izquierda.
// La fila de info es un <button>: NO se anidan botones — la línea es
// un contenedor flex con el botón de info y el span de íconos como
// hermanos. Mismos data-hf-pact, mismos handlers (hfProfileBind),
// mismos aria-labels y mismo tamaño/estilo (.hf-head-ic).
// Estado colapsado (OBLIGATORIO): la fila .hf-racha ya no se oculta
// entera — se muestra como 4ª pieza con SOLO los íconos; la info
// queda oculta. El visitante no ve los íconos (headIcons: !HF_VISITOR).
// Uso: node test-lote-iconos-linea-info.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

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
const cnt = (s, re) => (s.match(re) || []).length;

/* ---------- 1. Estructura estática ---------- */
console.log('— estructura: íconos en la línea de info, fuera de .hf-prow —');
const hh = extractFn(app, 'function homeHeadHTML');
ok(!!hh, 'extrae homeHeadHTML');
const prowBlock = hh.slice(hh.indexOf('<div class="hf-prow">'), hh.indexOf('${name ?'));
ok(prowBlock.length > 0 && !prowBlock.includes('hf-head-icons'), '.hf-prow ya NO contiene los íconos');
ok(prowBlock.includes('hf-ava') && prowBlock.includes('hf-stats'), '.hf-prow queda con avatar + stats');
ok(hh.includes('const headIconsHTML'), 'los íconos viven en headIconsHTML');
ok(hh.includes('`<div class="hf-racha">${rachaTxt ? rachaTxt + infoBtnHTML : infoRowHTML}${headIconsHTML}</div>`'), 'la fila .hf-racha rinde info + íconos');
ok(!hh.includes("data-hf-pact=\"edit\"") && hh.includes("data-hf-pact=\"share\"") && hh.includes("data-hf-pact=\"settings\""), 'los 2 data-hf-pact siguen (share/settings); el lápiz ya no existe (sacar-lápiz-perfil 7/11)');
ok(hh.indexOf("data-hf-pact=\"share\"") < hh.indexOf("data-hf-pact=\"settings\""), 'orden: compartir, Ajustes');
ok(hh.includes("pzIc('gear', 20)"), 'Ajustes con ícono gear 20');
ok(hh.includes("aria-label=\"${en ? 'Settings' : 'Ajustes'}\""), 'Ajustes con aria-label ES/EN');
ok(app.includes('headIcons: !HF_VISITOR'), 'Inicio pide los íconos solo si no es visitante');

/* ---------- 2. Render real de homeHeadHTML ---------- */
console.log('— render: misma línea, sin botones anidados —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const pzDecEnt = extractFn(app, 'function pzDecEnt');
ok(!!escLine && !!pzDecEnt, 'extrae esc + pzDecEnt');
const ctx = { console, pzIc: (n) => '<i data-ic="' + n + '"></i>' };
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + pzDecEnt + '\n' + hh, ctx);
const H = ctx.homeHeadHTML;
const base = { username: 'test.ok', name: 'Test Ok', pic: 'x.jpg',
  posts_count: 120, followers: 5432, following: 321, is_verified: true };
const rachaRow = (html) => {
  const a = html.indexOf('<div class="hf-racha">');
  if (a < 0) return '';
  return html.slice(a, html.indexOf('</div>', a) + 6);
};

// R1: sin racha + íconos -> info + 2 íconos en la misma línea.
const r1 = H(Object.assign({}, base), '', { splitHead: true, headIcons: true });
const row1 = rachaRow(r1);
ok(!!row1, 'R1 fila hf-racha presente');
ok(row1.includes('<button type="button" class="hf-info-row"'), 'R1 botón de info presente');
ok(row1.includes('¿Cómo publica Posty?'), 'R1 etiqueta «¿Cómo publica Posty?»');
ok(row1.includes('hf-head-icons'), 'R1 los íconos están en la fila');
ok(row1.indexOf('hf-info-row') < row1.indexOf('hf-head-icons'), 'R1 la info va a la izquierda, los íconos a la derecha');
for (const p of ['share', 'settings']) ok(row1.includes('data-hf-pact="' + p + '"'), 'R1 ícono ' + p + ' en la fila');
ok(!row1.includes('data-hf-pact="edit"'), 'R1 sin lápiz en la fila (sacar-lápiz-perfil 7/11)');
ok(row1.indexOf('data-hf-pact="share"') < row1.indexOf('data-hf-pact="settings"'), 'R1 orden compartir, Ajustes');
ok(maxButtonDepth(row1) === 1, 'R1 sin botones anidados (profundidad máx 1)');
ok(row1.indexOf('</button>') < row1.indexOf('<span class="hf-head-icons">'), 'R1 el botón de info cierra antes de abrir el span de íconos');
ok(r1.indexOf('hf-head-icons') > r1.indexOf('<div class="hf-name">'), 'R1 los íconos NO están en .hf-prow (aparecen después del nombre)');
ok((r1.match(/hf-info-btn/g) || []).length === 1, 'R1 un solo «i» en la cabecera');

// R2: con racha 3 + íconos -> texto + (i) + 2 íconos en la misma línea.
const r2 = H(Object.assign({}, base), '', { splitHead: true, racha: 3, headIcons: true });
const row2 = rachaRow(r2);
ok(!!row2, 'R2 fila hf-racha presente con racha 3');
ok(row2.includes('3 semanas seguidas publicando'), 'R2 texto de racha presente');
ok(row2.includes('hf-head-icons'), 'R2 los íconos siguen en la misma línea con racha');
ok(row2.indexOf('semanas seguidas') < row2.indexOf('hf-info-btn') && row2.indexOf('hf-info-btn') < row2.indexOf('hf-head-icons'), 'R2 orden: texto, (i), íconos');
ok(maxButtonDepth(row2) === 1, 'R2 sin botones anidados con racha');
ok((row2.match(/onclick="pzPubInfoOpen\(\)"/g) || []).length === 1, 'R2 un solo onclick a la hoja');

// R3: sin headIcons (visitante) -> sin íconos en toda la cabecera.
const r3 = H(Object.assign({}, base), '', { splitHead: true });
ok(!r3.includes('hf-head-icons') && !r3.includes('data-hf-pact'), 'R3 visitante: sin íconos');
ok(r3.includes('hf-racha') && r3.includes('¿Cómo publica Posty?'), 'R3 visitante: la fila de info sigue');

// R4: sin usuario -> ni fila ni íconos.
const r4 = H({ name: 'X', pic: 'x.jpg', posts_count: 1, followers: 2 }, '', { splitHead: true, racha: 5, headIcons: true });
ok(typeof r4 === 'string' && !r4.includes('hf-racha') && !r4.includes('hf-head-icons'), 'R4 sin usuario: ni fila ni íconos');

// R5: espejo EN.
const r5 = H(Object.assign({}, base), '', { splitHead: true, headIcons: true, en: true });
const row5 = rachaRow(r5);
ok(row5.includes('How does Posty publish?'), 'R5 EN «How does Posty publish?»');
ok(row5.includes('aria-label="Share my profile"') && row5.includes('aria-label="Settings"'), 'R5 EN aria-labels de los 2 íconos');
ok(!row5.includes('aria-label="Edit profile"'), 'R5 EN sin «Edit profile» (sacar-lápiz-perfil 7/11)');

/* ---------- 3. Handlers intactos (los botones hacen lo mismo) ---------- */
console.log('— handlers: hfProfileBind sigue bindeando por atributo —');
const bind = extractFn(app, 'function hfProfileBind');
ok(bind.includes("root.querySelectorAll('[data-hf-pact]')"), 'hfProfileBind bindea por [data-hf-pact] en todo el root');
ok(bind.includes("if (act === 'share') hfShareOpen();"), 'share -> hfShareOpen');
ok(!bind.includes("hfEditOpen") && !bind.includes("act === 'edit'"), 'sin rama edit en hfProfileBind (el lápiz se sacó 7/11)');
ok(bind.includes("else if (act === 'settings') { location.hash = '#/app/ajustes'; }"), 'settings -> #/app/ajustes');
ok((app.match(/function hfShareOpen\(/g) || []).length === 1, 'hfShareOpen definida');
ok(!app.includes('function hfEditOpen('), 'hfEditOpen ya no existe (sacar-lápiz-perfil 7/11)');
ok((app.match(/function pzPubInfoOpen\(/g) || []).length === 1, 'pzPubInfoOpen definida');

/* ---------- 4. CSS ---------- */
console.log('— CSS: línea de info + colapsado —');
ok(css.includes('.hf-racha{font-size:13px;font-weight:700;color:#0A1E33;margin-top:8px;display:flex;align-items:center;gap:8px}'), 'regla base .hf-racha intacta (texto exacto, test-lotei-racha)');
ok(css.includes('.hf-racha .hf-head-icons{margin-left:auto}'), '.hf-racha .hf-head-icons a la derecha (margin-left:auto)');
ok(css.includes('.hf-head-ic{width:40px;height:40px'), 'ícono 40px intacto');
ok(css.includes('.hf-racha .hf-info-row{min-width:0}'), 'info con min-width:0 (sin desborde a 360)');
ok(css.includes('.hf-racha .hf-info-row-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'), 'etiqueta de info con ellipsis de seguridad');
const hidStart = css.indexOf('#inicioView.hf-collapsed .hf-head .hf-stats,');
const hid = hidStart < 0 ? '' : css.slice(hidStart, css.indexOf('{display:none}', hidStart));
ok(hid.length > 0 && !hid.includes('hf-racha'), 'colapsado: .hf-racha YA NO está en la lista de ocultos');
ok(css.includes("#inicioView.hf-collapsed .hf-head .hf-racha{display:flex;order:4;flex:none;margin:0}"), 'colapsado: la fila .hf-racha se muestra como 4ª pieza');
ok(css.includes('#inicioView.hf-collapsed .hf-head .hf-racha .hf-info-row,') && css.includes('#inicioView.hf-collapsed .hf-head .hf-racha .hf-racha-txt,') && css.includes('#inicioView.hf-collapsed .hf-head .hf-racha > .hf-info-btn{display:none}'), 'colapsado: la info queda oculta (botón, texto de racha, «i»)');
const colBlock = css.slice(css.indexOf('(LOTE ENCABEZADO-COLAPSABLE'), css.indexOf('LOTE SEMANA-APROBADA'));
ok(!/\.hf-head-icons\s*\{[^}]*display\s*:\s*none/.test(colBlock), 'colapsado: ningún display:none sobre .hf-head-icons');
ok(!colBlock.includes('hf-pacts'), 'colapsado: sin mención a hf-pacts');

/* ---------- 5. Censo ---------- */
console.log('— censo —');
ok(cnt(srv, /catsMatch/g) === 3, 'server catsMatch 3');
ok(cnt(srv, /week-redo/g) === 16, 'server week-redo 16');
ok(cnt(srv, /first_week/g) === 3, 'server first_week 3');
ok(cnt(srv, /\/aprobar/g) === 17, 'server /aprobar 17');
ok(cnt(app, /pzGoBack/g) === 6, 'app pzGoBack 6');
ok(cnt(app, /pz-detalle-setup/g) === 1, 'app pz-detalle-setup 1');
ok(cnt(app, /\/aprobar/g) === 1, 'app /aprobar 1');
ok(cnt(app, /autofetch/g) === 0, 'app autofetch 0');
ok(cnt(app, /pcDayKeyShift/g) === 6, 'app pcDayKeyShift 6');

console.log('\nTOTAL ' + pass + ' asserts, ' + fail + ' fallos' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
