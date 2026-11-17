// LOTE SIN-VETO (17/11 · orden Valentino con captura: «Esto hay que
// eliminarlo»). Sale del detalle del posteo (apv) la fila de veto:
// input «¿Qué NO vendés?» + botón «Esto no lo vendo» + botón «No es mi
// rubro». Las correcciones de rubro llegan por audio y las atiende
// bamboo a mano (doctrina de voz vigente); la fila de formulario sobra.
// Los endpoints del servidor quedan DORMIDOS (no se borran): el guarda
// de rubro no se toca y el DELETE de veto sigue vivo desde Análisis.
// Uso: node test-lote-sin-veto.js [dir]
const fs = require('fs');
const vm = require('vm');
const dir = process.argv[2] || '.';
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
const chunk = fs.readFileSync(dir + '/public/chunk-analisis.js', 'utf8');
let ok = 0, bad = 0;
function t(name, cond) { if (cond) { ok++; } else { bad++; console.log('FALLA: ' + name); } }

// ---------- [FIX] AUSENCIA EN EL CLIENTE ----------
for (const s of ['apvVetoInput', 'apvVetoBtn', 'apvNoRubroBtn', 'apv-veto-row', 'apv-veto-btn', 'apv-veto-input', 'rgTopic']) {
  t('[FIX] app.js sin ' + s, !app.includes(s));
}
for (const s of ['¿Qué NO vendés?', 'What do you NOT sell', 'Esto no lo vendo', "don\\'t sell this", 'No es mi rubro', 'Not my niche', 'No es tu rubro']) {
  t('[FIX] app.js sin el texto «' + s + '»', !app.includes(s));
}
t('[FIX] app.js ya no llama al endpoint no-es-mi-rubro', !app.includes('no-es-mi-rubro'));
t('[FIX] app.js ya no hace POST a /api/fundamento/veto', !app.includes("api.post('/api/fundamento/veto'"));
t('[FIX] bindApprovalPost sin los handlers de la fila', (() => {
  const b = app.slice(app.indexOf('function bindApprovalPost'), app.indexOf('function bindApprovalPost') + 14000);
  return !b.includes('apvVetoBtn') && !b.includes('apvNoRubroBtn') && !b.includes('apvVetoInput');
})());

// ---------- LA VISTA RINDE SANA SIN LA FILA (VM con fixture) ----------
function renderMenu(lang, st) {
  const body = app.slice(app.indexOf('function apvMoreHTML'), app.indexOf('function pzApvMenuToggle'));
  const ctx = {
    ME: { lang },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
  };
  vm.createContext(ctx);
  vm.runInContext(body + '\nthis.__f = apvMoreHTML;', ctx);
  const p = { id: 696, titulo: 'Zapatillas Volt edición limitada', caption: 'Zapatillas Volt\nsalieron las nuevas' };
  return ctx.__f(p, st, true, false);
}
const menuES = renderMenu('es', 'scheduled');
t('VM: el menú del detalle rinde (apvMenu + botones de siempre)',
  menuES.includes('id="apvMenu"') && menuES.includes('id="apvEdit"') && menuES.includes('id="apvShareChat"')
  && menuES.includes('id="apvReject"') && menuES.includes('id="apvHold"') && menuES.includes('id="apvDelete"') && menuES.includes('id="apvRedo"'));
t('[FIX] VM: el menú rendido no trae la fila de veto', !/apvVeto|apv-veto|NO vendés|no lo vendo|mi rubro/i.test(menuES));
const menuEN = renderMenu('en', 'scheduled');
t('[FIX] VM: el menú en inglés tampoco trae la fila', !/apvVeto|apv-veto|NOT sell|sell this|my niche/i.test(menuEN) && menuEN.includes('id="apvMenu"'));
const menuPub = renderMenu('es', 'published');
t('VM: el publicado rinde su variante (Pedir un cambio) sin fila', menuPub.includes('apvChangePub') && !/apvVeto|apv-veto/.test(menuPub));

// ---------- EL MENÚ Y SUS HANDLERS SOBREVIVEN ----------
t('bindApprovalPost conserva los handlers vecinos (Aceptar borrador, Compartir, menú)',
  app.includes("getElementById('apvAcceptDraft')") && app.includes("getElementById('apvShareChat')") && app.includes("getElementById('apvMenuBtn')"));
t('apvMoreHTML sigue definida y llamada desde el detalle', app.includes('function apvMoreHTML') && app.includes('${apvMoreHTML(p, st, canMenu, isDraft)}'));

// ---------- SERVIDOR: DORMIDO, NO BORRADO (guardas, valen en la base) ----------
t('server: POST /api/fundamento/veto queda dormido (sin llamador del cliente)', srv.includes("app.post('/api/fundamento/veto'"));
t('server: POST /api/posts/:id/no-es-mi-rubro queda dormido (sin llamador del cliente)', srv.includes("app.post('/api/posts/:id/no-es-mi-rubro'"));
t('server: DELETE /api/fundamento/veto sigue vivo y Análisis lo sigue llamando',
  srv.includes("app.delete('/api/fundamento/veto'") && chunk.includes('anaFlQuitarVeto') && chunk.includes("'/api/fundamento/veto', { method: 'DELETE'"));
t('server: el guarda de rubro no se tocó (vetosForUser + agregarVeto presentes)',
  srv.includes('function vetosForUser') && srv.includes('fundamentoLiteral.agregarVeto(d.vetos, termino)'));

console.log(`SIN-VETO: ${ok} OK, ${bad} FALLAS`);
process.exit(bad ? 1 : 0);
