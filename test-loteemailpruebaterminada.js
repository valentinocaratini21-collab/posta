// test-loteemailpruebaterminada.js — LOTE EMAIL-PRUEBA-TERMINADA (2/11).
// Aprobado por Valentino ~13:03: en el email de prueba terminada el
// boton lleva a PAGAR EL PLAN (#/app/ajustes?plan=1, Mi plan), no a
// ver la semana (#/app/schedule). Mas: el encabezado del Feed de la
// Agenda (feedProfileHeadHTML, la pagina destino del boton viejo)
// mostraba el nombre con entidades literales (&#x2022; &#064;) porque
// rendia con esc() solo; ahora pasa por pzDecEnt, como homeHeadHTML
// ya hace con la bio. Node puro, lee el arbol.
// Uso: node test-loteemailpruebaterminada.js [dir-base]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const base = process.argv[2] || __dirname;
const app = fs.readFileSync(path.join(base, 'public/app.js'), 'utf8');
const email = fs.readFileSync(path.join(base, 'email.js'), 'utf8');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- 1. Email: boton a pagar el plan, resto intacto ----------
const enBody = sliceFn(email, 'function trialClosedEmailEn', 'function trialClosedEmail(');
const esBody = sliceFn(email, 'function trialClosedEmail(', 'module.exports');
t(enBody.includes('/#/app/ajustes?plan=1'), 'EN: href a Mi plan');
t(enBody.includes('>Pay for my plan<'), 'EN: texto Pay for my plan');
t(!enBody.includes('/#/app/schedule'), 'EN: sin resto de schedule');
t(!enBody.includes('See my saved week'), 'EN: sin texto viejo');
t(esBody.includes('/#/app/ajustes?plan=1'), 'ES: href a Mi plan');
t(esBody.includes('>Pagar mi plan<'), 'ES: texto Pagar mi plan');
t(!esBody.includes('/#/app/schedule'), 'ES: sin resto de schedule');
t(!esBody.includes('Ver mi semana guardada'), 'ES: sin texto viejo');
t(enBody.includes("subject = 'Your trial ended — your week is saved 💙'"), 'EN: asunto intacto');
t(esBody.includes("subject = 'Tu prueba terminó — tu semana quedó guardada 💙'"), 'ES: asunto intacto');
t(enBody.includes('everything we built for'), 'EN: cuerpo intacto');
t(esBody.includes('todo lo que armamos para'), 'ES: cuerpo intacto');
t(enBody.includes('your week is ready and saved'), 'EN: semana guardada intacta');
t(esBody.includes('tu semana quedó lista y guardada'), 'ES: semana guardada intacta');
t(cnt(email, '/#/app/ajustes?plan=1') === 2, 'email.js: solo los 2 botones trialClosed apuntan a plan (resto intacto)');
t(cnt(email, '/#/app/schedule') === 4, 'email.js: quedan 4 schedule de otros emails (eran 6, solo 2 cambiaron)');
t(email.includes('function trialExpiryEmail'), 'trialExpiryEmail intacto (no tocado)');
t(email.includes('function trialAbandonEmail'), 'trialAbandonEmail intacto (no tocado)');

// ---------- 2. Render: fp-name decodifica antes de escapar ----------
t(app.includes('${name ? `<div class="fp-name">${esc(pzDecEnt(name))}</div>` : '), 'fp-name pasa por pzDecEnt antes de esc');
t(cnt(app, 'function pzDecEnt') === 1, 'sin duplicados: pzDecEnt 1');
t(app.includes('pzDecEnt(String(P.bio'), 'homeHeadHTML (bio) intacto con pzDecEnt');
const escSrc = (app.match(/const esc = \(s\) => [^\n]+/) || [''])[0];
const sb = {
  console, Intl, Date, Map, Set, ME: { lang: 'es' },
  pzIc: (n) => '<span>' + n + '</span>',
};
vm.createContext(sb);
const load = (code, name) => {
  t(code.length > 0, 'existe ' + name);
  if (code) vm.runInContext(code.replace('function ' + name, 'globalThis.' + name + ' = function'), sb);
};
load(escSrc.replace(/^const esc = /, 'globalThis.esc = '), 'esc-stub');
load(sliceFn(app, 'function pzDecEnt', '/* ---------- Sistema de íconos'), 'pzDecEnt');
load(sliceFn(app, 'function igHeadChipHTML', 'function feedProfileHeadHTML'), 'igHeadChipHTML');
load(sliceFn(app, 'function feedProfileHeadHTML', 'function feedPreviewHTML'), 'feedProfileHeadHTML');
if (typeof sb.feedProfileHeadHTML === 'function') {
  const dirty = 'Posty &#x2022; Tu community manager (&#064;posty.communitymanager) &#x2022; Instagram photos and videos';
  const out = sb.feedProfileHeadHTML({ username: 'posty.communitymanager', name: dirty, pic: null, followers: 0 }, '', {});
  t(!out.includes('&#x2022') && !out.includes('&#064') && !out.includes('&amp;#'), 'fp-name sucio: sin entidades literales');
  t(out.includes('•') && out.includes('@posty.communitymanager'), 'fp-name sucio: punto y @ reales');
  t(out.includes('instagram.com/posty.communitymanager'), 'fp-link intacto');
  t(out.includes('posty.communitymanager'), 'fp-user intacto');
  const clean = sb.feedProfileHeadHTML({ username: 'posty.communitymanager', name: 'Posty. ', pic: null, followers: 0 }, '', {});
  t(clean.includes('Posty.'), 'fp-name limpio: no cambia');
  const amp = sb.feedProfileHeadHTML({ username: 'x', name: 'Café & Té', pic: null, followers: 0 }, '', {});
  t(amp.includes('Café &amp; Té') && !amp.includes('&amp;amp;'), 'fp-name con &: escapado una sola vez');
  const dbl = sb.feedProfileHeadHTML({ username: 'x', name: 'A &amp;#x2022; B', pic: null, followers: 0 }, '', {});
  t(dbl.includes('A • B') && !dbl.includes('#x2022'), 'fp-name doble escape: tambien limpio');
}

// ---------- 3. Censo (debe quedar identico) ----------
const srv = fs.readFileSync(path.join(base, 'server.js'), 'utf8');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: /aprobar 16');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6'); // LIBERACION v570: pin rotado con causa — v566 (chats) subio pzGoBack 4->6 por diseno; este lote no lo toca
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: /aprobar 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');

console.log(`test-loteemailpruebaterminada: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
