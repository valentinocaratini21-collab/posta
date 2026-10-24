'use strict';
/* v390 — DETALLE «POR VOS» AL TOCAR LA TARJETA DE PLAN (pedido de Valentino
   vía tablero: «si vos los tocás pero no tocás suscribirte, te los explique
   más detalladamente todo lo que hacen por vos»).
   Superficies: home ES (planCardsHTML en app.js), home EN (tarjetas
   estáticas en en/index.html), /prueba ES+EN (la price-card del pico
   despliega los 3 planes), paywall (modal de trial vencido) y app →
   Ajustes/Mi plan (plan-mini en chunk-ajustes).
   Parte 1: la fuente de verdad (config/plans.js) — detail por plan y país.
   Parte 2: estático sobre cada superficie.
   Parte 3: COMPORTAMIENTO — se extraen los bloques reales (app.js y el
   espejo inline EN) y se ejecutan con un DOM mínimo: tocar la tarjeta
   abre el detalle; tocar el enlace NO lo abre (navega como siempre);
   acordeón (abrir una cierra las demás); re-toque cierra. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const P = require(path.join(__dirname, 'config/plans.js'));
const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const enHtml = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const prueba = fs.readFileSync(path.join(__dirname, 'public/prueba.html'), 'utf8');
const enPrueba = fs.readFileSync(path.join(__dirname, 'public/en-prueba.html'), 'utf8');
const ajustes = fs.readFileSync(path.join(__dirname, 'public/chunk-ajustes.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

/* ---------- Parte 1: fuente de verdad ---------- */
for (const country of ['AR', 'UY', 'US', 'GB', 'CA']) {
  const plans = P.getPlans(country);
  for (const id of ['esencial', 'pro', 'total']) {
    const d = plans[id].detail;
    ok(Array.isArray(d) && d.length >= 5, country + '/' + id + ': detail con >=5 líneas (hay ' + (d && d.length) + ')');
    ok((d || []).every(s => typeof s === 'string' && s.length >= 25), country + '/' + id + ': líneas sustantivas');
  }
}
const arE = P.PLANS_AR.esencial.detail.join(' ');
const arP = P.PLANS_AR.pro.detail.join(' ');
const arT = P.PLANS_AR.total.detail.join(' ');
ok(!/competencia/i.test(arE), 'ES Esencial: el detalle NO promete competencia (eso es Pro+)');
ok(/competencia/i.test(arP) && /competencia/i.test(arT), 'ES Pro/Total: el detalle incluye la radiografía de competencia');
ok(!/reseñas/i.test(arE) && !/reseñas/i.test(arP), 'ES Esencial/Pro: sin reseñas de Google (eso es Total)');
ok(/turnos y reservas/i.test(arT) && /reseñas de Google/i.test(arT) && /link de pago/i.test(arT), 'ES Total: atención completa (turnos, reseñas, cierre con link)');
ok(!/Atenty|Gesty|Venty|Growty|Desy|Talenty|Bossty/i.test(arE + arP + arT), 'vidriera: el detalle ES no nombra a ningún otro agente');
const usT = P.PLANS_US.total.detail.join(' ');
ok(/approve each one/i.test(usT), 'US Total detail: comment/message replies with approval (mirror of US features)');
ok(/competition|competitor/i.test(P.PLANS_US.pro.detail.join(' ')), 'US Pro detail: competitor breakdown');
ok(serverJs.includes('...p, price_label'), 'la API /api/billing/plans sigue esparciendo el plan entero (detail viaja solo)');

/* ---------- Parte 2: estático por superficie ---------- */
// Home ES (app.js)
ok(appJs.includes('function planDetailHTML(p)'), 'app.js: planDetailHTML definido');
ok(appJs.includes('function planCardsHTML(plans)'), 'app.js: planCardsHTML sigue definido');
ok(appJs.includes('data-plan-card="${esc(p.id)}"'), 'app.js: la tarjeta lleva data-plan-card');
ok(appJs.includes('class="plan-detail" hidden'), 'app.js: el detalle nace oculto dentro de la tarjeta');
ok(appJs.includes('function togglePlanDetail(card)'), 'app.js: togglePlanDetail definido');
ok(appJs.includes("t.closest('a')"), 'app.js: el toque en un enlace NO despliega (navega como siempre)');
ok(appJs.includes("track('plan_detail_open'"), 'app.js: abrir el detalle se mide (plan_detail_open)');
// Paywall (modal de trial vencido en app.js)
ok(appJs.includes('pz-exp-detail') && appJs.includes('data-exp-more'), 'app.js paywall: detalle desplegable por fila (pz-exp-detail)');
ok(appJs.includes('Elegir el plan ${esc(p.name)}'), 'app.js paywall: el detalle trae su propio botón Elegir');
// Home EN (estática)
ok((enHtml.match(/data-plan-card=/g) || []).length === 3, 'EN: las 3 tarjetas llevan data-plan-card');
ok((enHtml.match(/class="plan-detail" hidden/g) || []).length === 3, 'EN: las 3 tarjetas llevan su detalle oculto');
ok((enHtml.match(/See everything it does for you/g) || []).length >= 3, 'EN: affordance «See everything it does for you» en las 3');
ok(enHtml.includes('Everything the Total plan does for you'), 'EN: título del detalle Total');
ok(enHtml.includes('I look after your Instagram customer care'), 'EN: el detalle Total incluye la atención (espejo de su tarjeta)');
// /prueba ES + EN
for (const [label, src, hint, pick] of [
  ['prueba ES', prueba, 'Tocá la tarjeta y mirá todo lo que hace cada plan por vos', 'Empezar con el plan'],
  ['prueba EN', enPrueba, 'Tap the card to see everything each plan does for you', 'Start with the'],
]) {
  ok(src.includes('id="pricePlans"'), label + ': contenedor del detalle (pricePlans)');
  ok(src.includes(hint), label + ': pista de toque presente');
  ok(src.includes('data-plan-pick'), label + ': cada plan del detalle trae su botón (data-plan-pick)');
  ok(src.includes(pick), label + ': CTA del detalle («' + pick + '…»)');
  ok(src.includes("localStorage.setItem('posta_chosen_plan'"), label + ': el botón guarda posta_chosen_plan (puente al alta)');
  ok(src.includes('openRegTrial()'), label + ': el botón abre el registro de la prueba');
  ok(src.includes('(p.detail || [])'), label + ': el detalle se arma desde p.detail de la API');
}
// Ajustes / Mi plan (chunk-ajustes)
ok(ajustes.includes('class="pm-detail" hidden'), 'ajustes: el detalle nace oculto en la plan-mini');
ok(ajustes.includes('data-plan-more'), 'ajustes: affordance data-plan-more');
ok((ajustes.match(/data-sub="\$\{p\.id\}"/g) || []).length >= 2, 'ajustes: DOS botones data-sub por tarjeta (el de siempre + el del detalle)');
ok(ajustes.includes("e.target.closest('[data-sub]')"), 'ajustes: el toque en Suscribirse NO despliega (va al flujo de pago)');
// CSS compartido
for (const cls of ['.plan-detail', '.plan-more', '.pm-detail', '.pm-more', '.pz-exp-detail', '.pz-exp-more']) {
  ok(styles.includes(cls), 'styles.css: ' + cls + ' definido');
}
ok(styles.includes('.plan-detail[hidden]{display:none}'), 'styles.css: [hidden] del detalle gana al display');
// El ancla vieja NO resucita en ninguna superficie (formatos con punto y con coma)
for (const [label, src] of [['app.js', appJs], ['en/index.html', enHtml], ['prueba.html', prueba], ['en-prueba.html', enPrueba], ['chunk-ajustes.js', ajustes]]) {
  ok(!/300\.000|600\.000|300,000|600,000/.test(src), label + ': 0 rastros del ancla AR muerta ($300.000–$600.000)');
}

/* ---------- Parte 3: comportamiento (bloques reales, DOM mínimo) ---------- */
function El(tag, attrs, classes) {
  const el = {
    tag, attrs: attrs || {}, classes: new Set(classes || []), children: [], parent: null,
    hidden: false, _listeners: {},
  };
  el.classList = {
    add: c => el.classes.add(c), remove: c => el.classes.delete(c),
    toggle: (c, force) => { const on = force !== undefined ? force : !el.classes.has(c); if (on) el.classes.add(c); else el.classes.delete(c); return on; },
    contains: c => el.classes.has(c),
  };
  el.getAttribute = n => (n === 'class' ? [...el.classes].join(' ') : el.attrs[n]);
  el.setAttribute = (n, v) => { el.attrs[n] = v; };
  el.append = ch => { ch.parent = el; el.children.push(ch); return ch; };
  el.matches = sel => {
    if (sel === 'a') return el.tag === 'a';
    if (sel.startsWith('.')) return el.classes.has(sel.slice(1));
    if (sel.startsWith('[data-')) { const k = sel.slice(1, -1); return el.attrs[k] !== undefined; }
    return false;
  };
  el.closest = sel => { let n = el; while (n) { if (n.matches && n.matches(sel)) return n; n = n.parent; } return null; };
  el.querySelector = sel => el.querySelectorAll(sel)[0] || null;
  el.querySelectorAll = sel => {
    const out = [];
    const walk = n => { for (const ch of n.children) { if (ch.matches && ch.matches(sel)) out.push(ch); if (ch.children) walk(ch); } };
    walk(el); return out;
  };
  return el;
}
function buildRow() {
  const row = El('div', {}, ['plans-row']);
  const cards = {};
  for (const id of ['esencial', 'pro']) {
    const card = El('div', { 'data-plan-card': id }, ['price-card']);
    const det = El('div', {}, ['plan-detail']); det.hidden = true;
    const btn = El('button', { 'data-plan-more': '', 'aria-expanded': 'false' }, ['plan-more']);
    btn.firstChild = { textContent: 'Ver todo lo que hace por vos ' };
    const a = El('a', { href: '/prueba' }, ['btn']);
    card.append(det); card.append(btn); card.append(a);
    row.append(card);
    cards[id] = { card, det, btn, a };
  }
  return { row, cards };
}
function runBlock(blockSrc, label) {
  const { row, cards } = buildRow();
  const listeners = {};
  const doc = {
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
    querySelectorAll: () => [],
  };
  const ctx = { document: doc, console, track: () => {}, trk: () => {} };
  vm.createContext(ctx);
  try { vm.runInContext(blockSrc, ctx); } catch (e) { ok(false, label + ': el bloque evalúa (' + e.message + ')'); return; }
  ok(typeof listeners.click === 'function', label + ': listener de click registrado');
  if (typeof listeners.click !== 'function') return;
  const fire = target => listeners.click({ target });
  // 1) tocar el cuerpo de la tarjeta abre SU detalle
  fire(cards.esencial.card);
  ok(cards.esencial.det.hidden === false, label + ': toque en la tarjeta → detalle abierto');
  ok(cards.esencial.card.classList.contains('open'), label + ': la tarjeta queda .open');
  ok(cards.esencial.btn.getAttribute('aria-expanded') === 'true', label + ': aria-expanded=true');
  // 2) tocar el enlace NO toggles (navega): el detalle queda como estaba
  fire(cards.esencial.a);
  ok(cards.esencial.det.hidden === false, label + ': toque en el enlace → NO toggles (sigue abierto)');
  // 3) acordeón: abrir la otra cierra la primera
  fire(cards.pro.card);
  ok(cards.pro.det.hidden === false && cards.esencial.det.hidden === true, label + ': acordeón — abrir Pro cierra Esencial');
  // 4) re-toque en la tarjeta abierta la cierra
  fire(cards.pro.btn);
  ok(cards.pro.det.hidden === true, label + ': toque en «Ver menos» → detalle cerrado');
  ok(cards.pro.btn.getAttribute('aria-expanded') === 'false', label + ': aria-expanded vuelve a false');
}
// Bloque ES: desde togglePlanDetail hasta el fin del listener delegado
(function () {
  const a = appJs.indexOf('function togglePlanDetail(card)');
  const b = appJs.indexOf("});", appJs.indexOf('togglePlanDetail(card);', a));
  ok(a >= 0 && b > a, 'ES: bloque del detalle localizable en app.js');
  if (a >= 0 && b > a) runBlock(appJs.slice(a, b + 3), 'ES app.js');
})();
// Bloque EN: el script inline (v390) de en/index.html
(function () {
  const mark = enHtml.indexOf('/* (v390) Tap a plan card');
  const a = enHtml.indexOf('document.addEventListener', mark);
  const b = enHtml.indexOf('</script>', a);
  ok(mark >= 0 && a > mark && b > a, 'EN: bloque del detalle localizable en en/index.html');
  if (mark >= 0 && a > mark && b > a) runBlock(enHtml.slice(a, b), 'EN en/index.html');
})();

console.log('test-plan-detail: ' + okN + ' ok / ' + failN + ' fallas');
process.exit(failN ? 1 : 0);
