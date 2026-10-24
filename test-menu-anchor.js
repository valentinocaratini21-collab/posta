'use strict';
/* v388 — el menú hamburguesa de las homes se CIERRA al tocar un ancla
   interna (defecto adyacente medido en la auditoría de anclas de v383:
   tras el salto la nav quedaba abierta en ~565px y la sección aterrizaba
   pegada a su borde inferior; cerrado el menú, aterriza con el aire del
   scroll-margin de v383). La lógica vive DUPLICADA: public/app.js (home
   ES) y el script inline de public/en/index.html (home EN) — el fix y
   este test cubren las dos copias.
   Parte 1: asserts estáticos sobre ambas fuentes.
   Parte 2: COMPORTAMIENTO — se extrae el bloque real (toggle + close +
   listener delegado) de cada fuente y se ejecuta con un DOM mínimo:
   click en ancla de sección cierra; click en ruta hash (#/login) NO
   cierra; click fuera del menú NO cierra; el toggle sigue igual. */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const enHtml = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');

/* ---------- Parte 1: estático, ambas copias ---------- */
for (const [label, src] of [['ES app.js', appJs], ['EN en/index.html', enHtml]]) {
  ok(src.includes('function toggleMobileMenu()'), label + ': toggleMobileMenu sigue definido');
  ok(src.includes("m.classList.toggle('open')"), label + ': el toggle conserva su comportamiento (abre/cierra)');
  ok(src.includes('function closeMobileMenu()'), label + ': closeMobileMenu definido');
  ok(src.includes("classList.remove('open')"), label + ': closeMobileMenu quita la clase open');
  ok(src.includes("document.addEventListener('click'"), label + ': listener delegado de click registrado');
  ok(src.includes("'#mobileMenu a[href^=\"#\"]'"), label + ': el delegado apunta solo a anclas dentro de #mobileMenu');
  ok(src.includes("charAt(1) !== '/'"), label + ': las rutas hash (#/...) quedan excluidas');
  ok(src.includes('id="mobileMenu"'), label + ': el markup #mobileMenu sigue presente');
  ok(src.includes('href="#como-funciona"'), label + ': el menú sigue enlazando a #como-funciona');
}
/* El fix NO toca el scroll-margin de v383 */
ok(styles.includes('scroll-margin-top:90px') && styles.includes('scroll-margin-top:82px'),
  'v383 intacto: scroll-margin 90px desktop / 82px mobile en styles.css');

/* ---------- Parte 2: comportamiento del bloque real ---------- */
function extractBlock(src) {
  const start = src.indexOf('function toggleMobileMenu()');
  if (start < 0) return '';
  const call = src.indexOf('closeMobileMenu();', start);
  if (call < 0) return '';
  const end = src.indexOf('});', call);
  if (end < 0) return '';
  return src.slice(start, end + 3);
}

function makeDoc() {
  const menu = { classes: new Set() };
  menu.classList = {
    toggle: c => { if (menu.classes.has(c)) menu.classes.delete(c); else menu.classes.add(c); },
    remove: c => { menu.classes.delete(c); },
    contains: c => menu.classes.has(c),
  };
  const doc = {
    menu,
    listeners: {},
    getElementById: id => (id === 'mobileMenu' ? menu : null),
    addEventListener: (ev, fn) => { doc.listeners[ev] = fn; },
  };
  return doc;
}

const evOnAnchor = href => ({
  target: {
    closest: sel => (sel.indexOf('#mobileMenu') === 0
      ? { getAttribute: n => (n === 'href' ? href : null) }
      : null),
  },
});
const evOutside = { target: { closest: () => null } };

for (const [label, src] of [['ES app.js', appJs], ['EN en/index.html', enHtml]]) {
  const block = extractBlock(src);
  ok(block.length > 200, label + ': bloque v388 extraíble de la fuente real');
  if (block.length <= 200) continue;
  const doc = makeDoc();
  const api = new Function('document', block + '\nreturn { toggleMobileMenu, closeMobileMenu };')(doc);
  const click = doc.listeners.click;
  ok(typeof click === 'function', label + ': el listener de click quedó registrado');

  doc.menu.classes.add('open');
  click(evOnAnchor('#como-funciona'));
  ok(!doc.menu.classList.contains('open'), label + ': click en #como-funciona CIERRA el menú');

  doc.menu.classes.add('open');
  click(evOnAnchor('#faq'));
  ok(!doc.menu.classList.contains('open'), label + ': click en #faq CIERRA el menú');

  doc.menu.classes.add('open');
  click(evOnAnchor('#/login'));
  ok(doc.menu.classList.contains('open'), label + ': click en la ruta #/login NO cierra (no es ancla de sección)');

  click(evOutside);
  ok(doc.menu.classList.contains('open'), label + ': click fuera del menú NO lo cierra');

  api.toggleMobileMenu();
  ok(!doc.menu.classList.contains('open'), label + ': toggleMobileMenu sigue cerrando un menú abierto');
  api.toggleMobileMenu();
  ok(doc.menu.classList.contains('open'), label + ': toggleMobileMenu sigue abriendo un menú cerrado');
}

console.log(`test-menu-anchor: ${okN} ok / ${failN} FAIL`);
process.exit(failN ? 1 : 0);
