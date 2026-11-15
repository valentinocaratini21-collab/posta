// test-lote-eventos-rubro.js — LOTE EVENTOS-RUBRO (15/11).
// Origen: hallazgo de Valentino con captura — el flujo de eventos de
// Subir decía «— ej. el DJ. … Posty arma el flyer alrededor» a TODOS
// los negocios, en ES y EN. El lote parametriza el ejemplo de la
// persona y la palabra de la pieza desde el fundamento/rubro del
// negocio (PROFILE): el fundamento manda si nombra a su figura; el
// mapa por rubro (DJ solo en boliche, chef en gastronomía/cafetería,
// barbero en barbería, estilista en belleza, instructor en fitness,
// disertante en educación/eventos); sin figura, NEUTRO sin ejemplo.
// «flyer» queda solo en boliche; fuera, la subida es «imagen» y la
// pieza «posteo». Incluye el barrido: leído/leer/nota del nombre,
// placeholder de la idea de cero, chips de tipo ('DJ set' solo en
// nocturnidad), nota del recibo, confirmación de la cara sumada, nota
// de la confirmación de cero y los 3 errores del servidor del flujo.
// Cubre: renders REALES de subirView y pzCeroConfPintar para los
// rubros pedidos (nocturnidad, barbería, servicios) + fitness,
// gastronomía, belleza, educación, fundamento-que-manda y EN;
// control contra la base viva (los tres rubros muestran «el DJ»).
// (Re-base 15/11: el lote se re-basó sobre v1108 de Juli — cromo web y
// tip-esqueleto fuera de la puerta EN — sin tocar su construcción.)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const BASE_DIR = process.env.LOTE_BASE_DIR || path.join(__dirname, '..', 'base');
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + String(extra).slice(0, 260) : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);

// ---------- DOM falso mínimo (mismo patrón que avatar-dedup) ----------
class El {
  constructor(id) {
    this.id = id || ''; this.hidden = false; this.innerHTML = ''; this.textContent = '';
    this.disabled = false; this.value = ''; this.files = null; this.dataset = {}; this.style = {};
    this.onclick = null; this.onchange = null; this.children = []; this._attrs = {}; this._qs = null;
    const cls = new Set();
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) };
  }
  appendChild(c) { this.children.push(c); return c; }
  querySelector() { if (!this._qs) this._qs = new El('qs'); return this._qs; }
  querySelectorAll() { return []; }
  scrollIntoView() {}
  focus() {}
  setSelectionRange() {}
  remove() {}
  addEventListener() {}
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
}
function subirSlice(src) {
  const a = src.indexOf('const PZ_SUBIR = {');
  const b = src.indexOf('function chatFullView(');
  if (a < 0 || b < 0 || b < a) return '';
  return src.slice(a, b);
}
function buildCtx(appSrc, opts) {
  const o = opts || {};
  const registry = new Map();
  const get = (id) => { if (!registry.has(id)) registry.set(id, new El(id)); return registry.get(id); };
  const documentStub = {
    getElementById: get,
    createElement: () => new El(''),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
  };
  const ctx = {
    console, setTimeout, Intl, document: documentStub,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { hash: '' },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, id: 'a1', kind: 'foto', thumb: '/m/t.jpg', path: '/m/t.jpg' }) }),
    api: { post: async () => ({ ok: true }), get: async () => ({ ok: true }) },
    __get: get,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.PROFILE = o.profile || null;
  const prelude = 'function pzVozEn() { return ' + (o.en ? 'true' : 'false') + '; }\n'
    + 'function pzIc() { return ""; }\n'
    + 'const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");\n';
  vm.runInContext(prelude + subirSlice(appSrc), ctx);
  return ctx;
}
function confHtmlDe(ctx) {
  vm.runInContext("PZ_CERO.ent = { nombre: '', quien: '', fechaISO: '', que: '' }; PZ_CERO.datos = { nombre: '', quien: '', fecha: '', que: '' }; PZ_CERO.conf = { quien: false, fecha: false, que: false }; PZ_CERO.caraThumb = ''; pzCeroConfPintar();", ctx);
  return ctx.__get('pzCeroConf').innerHTML;
}
function reciboHtmlDe(ctx) {
  vm.runInContext("pzEvReciboPintar({ nombre: 'Noche especial', dia_label: 'viernes 20 de noviembre', hora: '19:00', post_id: 42 }, true);", ctx);
  const cont = ctx.__get('pzSubirRecibos');
  // El stub de querySelector nunca devuelve null: la «tarjeta» es el
  // _qs del contenedor y los ítems cuelgan de su propio _qs.
  const card = cont.children[0] || cont._qs;
  const items = card ? (card.children[0] || card._qs) : null;
  const div = items && items.children[0];
  return div ? div.innerHTML : '';
}
function fnDefs(src) {
  const out = new Set();
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m; while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

(async () => {
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

  // ---------- A: nocturnidad (boliche) conserva su mundo ----------
  console.log('A · boliche: el DJ y el flyer son SU vocabulario');
  const ctxA = buildCtx(app, { profile: { category: 'boliche', business_name: 'Nocta Club', description: '' } });
  const htmlA = await ctxA.subirView();
  t('A1 ejemplo «— ej. el DJ.» y el flyer alrededor', has(htmlA, '— ej. el DJ.') && has(htmlA, 'Posty arma el flyer alrededor'), htmlA.slice(htmlA.indexOf('Sumá la foto'), htmlA.indexOf('Sumá la foto') + 240));
  t('A2 «Del flyer leí:» y «Leer el nombre de mi flyer»', has(htmlA, 'Del flyer leí:') && has(htmlA, 'Leer el nombre de mi flyer') && has(htmlA, 'Si subiste el flyer'));
  t('A3 placeholder de la idea: el DJ Martín en el bar', has(htmlA, 'Ej.: el viernes toca DJ Martín en el bar'));
  const confA = confHtmlDe(ctxA);
  t('A4 chips: «DJ set» existe y va primero en nocturnidad', has(confA, 'data-cero-tipo="DJ set"') && confA.indexOf('data-cero-tipo="DJ set"') < confA.indexOf('data-cero-tipo="Fiesta"'));
  t('A5 recibo: «el flyer se rearma alrededor de la foto»', has(reciboHtmlDe(ctxA), 'el flyer se rearma alrededor de la foto'));
  t('A6 cara sumada: «El flyer se rearmó alrededor de la foto»', vm.runInContext('pzEvTxtCaraSumada()', ctxA) === 'El flyer se rearmó alrededor de la foto');

  // ---------- B: barbería (rubro pedido) ----------
  console.log('B · barbería: su barbero, su imagen, su posteo — DJ jamás');
  const ctxB = buildCtx(app, { profile: { category: 'barberia', business_name: 'El Corte', description: '' } });
  const htmlB = await ctxB.subirView();
  t('B1 ejemplo «— ej. el barbero.»', has(htmlB, '— ej. el barbero.'), htmlB.slice(htmlB.indexOf('Sumá la foto'), htmlB.indexOf('Sumá la foto') + 240));
  t('B2 la pieza es el posteo y la subida es la imagen', has(htmlB, 'Posty arma el posteo alrededor') && has(htmlB, 'De tu imagen leí:') && has(htmlB, 'Leer el nombre de mi imagen') && has(htmlB, 'Si subiste la imagen'));
  t('B3 placeholder propio: el barbero invitado', has(htmlB, 'Ej.: el viernes viene un barbero invitado'));
  t('B4 DJ jamás fuera de nocturnidad: cero «DJ» y cero «flyer» en todo el render', !has(htmlB, 'DJ') && !/flyer/i.test(htmlB));
  const confB = confHtmlDe(ctxB);
  t('B5 confirmación de cero: sin DJ, sin flyer; la nota arma el posteo', !has(confB, 'DJ') && !/flyer/i.test(confB) && has(confB, 'el posteo se arma alrededor'));
  t('B6 recibo: «el posteo se rearma alrededor de la foto»', has(reciboHtmlDe(ctxB), 'el posteo se rearma alrededor de la foto'));
  t('B7 cara sumada: «El posteo se rearmó alrededor de la foto»', vm.runInContext('pzEvTxtCaraSumada()', ctxB) === 'El posteo se rearmó alrededor de la foto');

  // ---------- C: servicios (rubro pedido, sin figura) ----------
  console.log('C · servicios: neutro, sin inventar persona');
  const ctxC = buildCtx(app, { profile: { category: 'servicios', business_name: 'Posty', description: '' } });
  const htmlC = await ctxC.subirView();
  t('C1 sin ejemplo: la nota de la foto no trae «— ej.» ni figura', !has(htmlC, '— ej.') && has(htmlC, 'La foto entra tal cual, como foto: Posty arma el posteo alrededor.'));
  t('C2 placeholder neutro, sin persona', has(htmlC, 'Ej.: el viernes tenemos un evento especial'));
  t('C3 cero «DJ» y cero «flyer» en todo el render', !has(htmlC, 'DJ') && !/flyer/i.test(htmlC));
  const confC = confHtmlDe(ctxC);
  t('C4 chips sin «DJ set» y confirmación sin DJ ni flyer', !has(confC, 'DJ') && !/flyer/i.test(confC));

  // ---------- D: el resto del mapa ----------
  console.log('D · fitness, gastronomía, belleza, educación');
  const casos = [
    ['fitness', '— ej. el instructor.', 'Ej.: el sábado hay una clase especial del instructor'],
    ['gastronomia', '— ej. el chef.', 'Ej.: el sábado cocina un chef invitado'],
    ['cafeteria', '— ej. el chef.', 'Ej.: el sábado cocina un chef invitado'],
    ['belleza', '— ej. la estilista.', 'Ej.: el sábado viene una estilista invitada'],
    ['educacion', '— ej. el disertante.', 'Ej.: el viernes hay una charla de un disertante invitado'],
    ['eventos', '— ej. el disertante.', 'Ej.: el viernes hay una charla de un disertante invitado'],
  ];
  for (const [cat, ej, ph] of casos) {
    const cx = buildCtx(app, { profile: { category: cat, business_name: 'X', description: '' } });
    const hx = await cx.subirView();
    t('D ' + cat + ': ejemplo y placeholder propios, sin DJ ni flyer', has(hx, ej) && has(hx, ph) && !has(hx, 'DJ') && !/flyer/i.test(hx), hx.slice(hx.indexOf('Sumá la foto'), hx.indexOf('Sumá la foto') + 200));
  }
  const ctxFit = buildCtx(app, { profile: { category: 'fitness', business_name: 'Gym', description: '' } });
  const confFit = confHtmlDe(ctxFit);
  t('D fitness: su tipo «Clase» va primero en los chips', confFit.indexOf('data-cero-tipo="Clase"') > -1 && confFit.indexOf('data-cero-tipo="Clase"') < confFit.indexOf('data-cero-tipo="Fiesta"'));
  const ctxGas = buildCtx(app, { profile: { category: 'gastronomia', business_name: 'Resto', description: '' } });
  const confGas = confHtmlDe(ctxGas);
  t('D gastronomía: su tipo «Degustación» va primero en los chips', confGas.indexOf('data-cero-tipo="Degustación"') > -1 && confGas.indexOf('data-cero-tipo="Degustación"') < confGas.indexOf('data-cero-tipo="Fiesta"'));

  // ---------- E: el fundamento manda ----------
  console.log('E · si el fundamento nombra a su figura, esa palabra gana');
  const ctxE1 = buildCtx(app, { profile: { category: 'servicios', business_name: 'Sabores Eventos', description: 'Catering para eventos: nuestro chef arma el menú de cada fecha.' } });
  const htmlE1 = await ctxE1.subirView();
  t('E1 servicios con chef en el fundamento: el ejemplo es «el chef»', has(htmlE1, '— ej. el chef.') && has(htmlE1, 'Ej.: el viernes viene el chef'), htmlE1.slice(htmlE1.indexOf('Sumá la foto'), htmlE1.indexOf('Sumá la foto') + 200));
  const ctxE2 = buildCtx(app, { profile: { category: 'fitness', business_name: 'Gym Norte', description: 'Entrenamiento y batidos: la cocinera del equipo prepara la comida post-clase.' } });
  const htmlE2 = await ctxE2.subirView();
  t('E2 el fundamento le gana al mapa: cocinera (fundamento) sobre instructor (rubro)', has(htmlE2, '— ej. la cocinera.') && !has(htmlE2, '— ej. el instructor.'));
  const ctxE3 = buildCtx(app, { profile: { category: 'otro', business_name: 'El Barbero Loco', description: '' } });
  const htmlE3 = await ctxE3.subirView();
  t('E3 el nombre del negocio también es fundamento: «el barbero»', has(htmlE3, '— ej. el barbero.'));

  // ---------- F: inglés ----------
  console.log('F · EN sigue la misma regla');
  const ctxF1 = buildCtx(app, { en: true, profile: { category: 'boliche', business_name: 'Nocta', description: '' } });
  const htmlF1 = await ctxF1.subirView();
  t('F1 EN boliche: «the DJ», «your flyer», placeholder de DJ Martín', has(htmlF1, '— e.g. the DJ.') && has(htmlF1, 'I read from your flyer:') && has(htmlF1, 'DJ Martín plays at the bar on Friday'));
  const ctxF2 = buildCtx(app, { en: true, profile: { category: 'barberia', business_name: 'The Cut', description: '' } });
  const htmlF2 = await ctxF2.subirView();
  t('F2 EN barbería: «the barber», «your image», «the post» — sin DJ ni flyer', has(htmlF2, '— e.g. the barber.') && has(htmlF2, 'I read from your image:') && has(htmlF2, 'Posty builds the post around it') && !has(htmlF2, 'DJ') && !/flyer/i.test(htmlF2));
  const ctxF3 = buildCtx(app, { en: true, profile: { category: 'servicios', business_name: 'Posty', description: '' } });
  const htmlF3 = await ctxF3.subirView();
  t('F3 EN servicios: neutro, sin ejemplo ni DJ ni flyer', !has(htmlF3, '— e.g.') && has(htmlF3, 'we have a special event on Friday') && !has(htmlF3, 'DJ') && !/flyer/i.test(htmlF3));

  // ---------- G: sin perfil cargado, neutro seguro ----------
  console.log('G · sin PROFILE no se rompe nada y no se inventa figura');
  const ctxG = buildCtx(app, { profile: null });
  const htmlG = await ctxG.subirView();
  t('G1 render completo en neutro', has(htmlG, 'pzEvCard') && !has(htmlG, '— ej.') && !has(htmlG, 'DJ'));

  // ---------- H: servidor y stamps ----------
  console.log('H · errores del servidor neutralizados + stamps');
  t('H1 los 3 errores del flujo ya no dicen «flyer» y sí su neutro',
    !has(srv, 'No pude armar el flyer') && !has(srv, 'No pude leer el flyer') && !has(srv, 'No pude recomponer el flyer')
    && has(srv, 'No pude armar la pieza del evento') && has(srv, 'No pude leer la imagen') && has(srv, 'No pude recomponer la pieza del evento'));
  t('H2 stamps en paridad: BUILD_ID y PZ_BUILD en v1109', has(srv, "const BUILD_ID = '20261105-v1109';") && has(app, "const PZ_BUILD = '20261105-v1109';"));
  t('H3 index ES con app.js?v=754', has(idx, '<script src="/app.js?v=754"></script>') && !has(idx, 'app.js?v=753'));

  // ---------- I: funciones auditadas (barrido mecánico) ----------
  console.log('I · funciones auditadas: ninguna definición de la base se pierde');
  const baseAppPath = path.join(BASE_DIR, 'public', 'app.js');
  if (fs.existsSync(baseAppPath)) {
    const bApp = fs.readFileSync(baseAppPath, 'utf8');
    const defsBase = fnDefs(bApp), defsRel = fnDefs(app);
    const perdidas = [...defsBase].filter((f) => !defsRel.has(f));
    t('I1 definiciones de la base presentes en el release: ' + (defsBase.size - perdidas.length) + '/' + defsBase.size, perdidas.length === 0, perdidas.join(','));
    const nuevas = [...defsRel].filter((f) => !defsBase.has(f));
    t('I2 las únicas funciones nuevas son las del lote (pzEv*)', nuevas.length > 0 && nuevas.every((f) => f.startsWith('pzEv')), nuevas.join(','));
    const slice = subirSlice(app);
    const refs = [...new Set([...slice.matchAll(/\b(pzEv\w+)\s*\(/g)].map((m) => m[1]))];
    t('I3 toda función pzEv* llamada desde el flujo está definida', refs.every((f) => defsRel.has(f)), refs.filter((f) => !defsRel.has(f)).join(','));
  } else {
    console.log('  (barrido omitido: no está el árbol base hermano)');
  }

  // ---------- K: control contra la base v1107 (el defecto original) ----------
  console.log('K · control contra la base: los tres rubros mostraban «el DJ»');
  if (fs.existsSync(baseAppPath)) {
    const bApp = fs.readFileSync(baseAppPath, 'utf8');
    for (const cat of ['boliche', 'barberia', 'servicios']) {
      const cb = buildCtx(bApp, { profile: { category: cat, business_name: 'X', description: '' } });
      const hb = await cb.subirView();
      t('K base ' + cat + ': el render decía «— ej. el DJ» y «flyer» para todos', has(hb, '— ej. el DJ.') && /flyer/i.test(hb));
    }
    const cbS = buildCtx(bApp, { profile: { category: 'servicios', business_name: 'X', description: '' } });
    t('K base servicios: los chips ofrecían «DJ set» primero', confHtmlDe(cbS).indexOf('data-cero-tipo="DJ set"') > -1);
  } else {
    console.log('  (control omitido: no está el árbol base hermano)');
  }

  console.log(`\n== LOTE EVENTOS-RUBRO: ${pass} ok · ${fail} mal ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e && e.stack || e); process.exit(2); });
