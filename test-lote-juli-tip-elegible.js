#!/usr/bin/env node
// LOTE JULI-TIP-ELEGIBLE (8/11) — dos defectos reales de la ruta
// prueba/digest, cazados en la auditoría del 7/11 (cuentas 87/88/89):
// (1) id 576, Top Class Barber Squad: «3 claves para elegir bien en
// atención personalizada» — el frame del tip exige un ítem ELEGIBLE
// (algo con variantes entre las que se elige: café, vestido, corte) y
// «atención personalizada» es una cualidad del servicio, no algo que
// se elija: el español sale roto y el cuerpo es tautología («así
// trabajamos atención personalizada»).
// (2) ids 571/573/577/578/579: digests sembrados ANTES del fix v755
// siguen trayendo rótulos EN («Best Sellers», «single origin
// coffees», «your bag»), barras («Country/region and currency») y
// slogans («Timeless style. Effortless you.») como ítems. La ingesta
// nueva ya los rechaza y el scrub al guardar también, pero un digest
// guardado antes de v755 queda envenenado hasta que se re-guarde.
// El fix (2 capas, client-digest.js): (a) deriveTopics filtra los
// ítems por isPlausibleOfferItem antes de anclar CUALQUIER tema —
// para un digest sano es un no-op; (b) el paso del tip solo ancla un
// ítem elegible (isChoosableTipItem): busca el primer ítem libre
// elegible y, si no queda ninguno, reutiliza la estrella SI es
// elegible — el fallback existe para que la semana no quede con un
// hueco que el demo rellena con un tema genérico del rubro («Los
// viernes se pide milanesa» en un sushi). Si NI la estrella es
// elegible, el tip NO sale: mejor una semana sin tip que un tip en
// español roto.
// Uso: node test-lote-juli-tip-elegible.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const cd = require('./client-digest');
const cdSrc = fs.readFileSync(path.join(DIR, 'client-digest.js'), 'utf8');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9# ]+/g, ' ').replace(/\s+/g, ' ').trim();

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}

// Digest literal con defaults sanos + ítems exactos (sin minero).
function digestWith(productos, servicios, category) {
  const d = cd.buildFromParts({
    business: 'Negocio de Prueba', category: category || 'barberia',
    feed: { bio: 'Café de especialidad y medialunas', captions: [], name: '', handle: '' },
  });
  d.productos = (productos || []).map((n) => ({ nombre: n }));
  d.servicios = (servicios || []).map((n) => ({ nombre: n }));
  d.temas_feed = [];
  d.promos = [];
  d.inferred_star = null;
  d.dueno = {};
  return d;
}
const topicsOf = (d, category, lang) => cd.deriveTopics(d, { count: 5, category: category || 'barberia', ...(lang ? { lang } : {}) });
const joined = (ts) => ts.map((t) => `${t.kind} ${t.headline || ''} ${t.caption || ''} ${t.digest_anchor || ''}`).join(' | ');
const tipOf = (ts) => ts.find((t) => t.kind === 'tip');

console.log('== A) isChoosableTipItem (unidad) ==');
{
  // Defensivo a propósito: en el árbol prístino (PRE) el helper no
  // existe y cada assert falla en vez de romper la suite — así el PRE
  // reproduce el bug y el POST lo cierra.
  const choosable = (s) => (typeof cd.isChoosableTipItem === 'function' ? cd.isChoosableTipItem(s) : undefined);
  ok('A1 «atención personalizada» NO es elegible (id 576 real)', choosable('atención personalizada') === false);
  ok('A2 «Atención al cliente» NO es elegible', choosable('Atención al cliente') === false);
  ok('A3 «servicio de catering» NO es elegible (primera palabra abstracta)', choosable('servicio de catering') === false);
  ok('A4 «asesoría de imagen» NO es elegible', choosable('asesoría de imagen') === false);
  ok('A5 «calidad premium» NO es elegible', choosable('calidad premium') === false);
  ok('A6 «café de especialidad» SÍ es elegible', choosable('café de especialidad') === true);
  ok('A7 «corte fade» SÍ es elegible', choosable('corte fade') === true);
  ok('A8 «Zahra Dress» SÍ es elegible', choosable('Zahra Dress') === true);
  ok('A9 «vestido de fiesta» SÍ es elegible', choosable('vestido de fiesta') === true);
  ok('A10 vacío NO es elegible', choosable('') === false);
  ok('A11 exportado en el módulo', typeof cd.isChoosableTipItem === 'function');
}

console.log('== B) deriveTopics — el tip salta lo abstracto (caso real 576) ==');
{
  // B1: el único ítem libre para el tip es abstracto → el tip
  // reutiliza la estrella (elegible), como el diseño histórico — pero
  // JAMÁS ancla lo abstracto.
  const d1 = digestWith(['Café de especialidad', 'Medialunas'], ['atención personalizada'], 'barberia');
  const t1 = topicsOf(d1, 'barberia');
  const tip1 = tipOf(t1);
  ok('B1 sin ítem elegible libre: el tip reutiliza la estrella elegible', tip1 && tip1.digest_anchor === 'Café de especialidad', tip1 && JSON.stringify(tip1));
  ok('B1 ningún topic dice «elegir bien en atención»', !norm(joined(t1)).includes('elegir bien en atencion'), joined(t1));
  // B2: hay un elegible después del abstracto → el tip lo toma a él.
  const d2 = digestWith(['Café de especialidad', 'Medialunas'], ['atención personalizada', 'Corte fade'], 'barberia');
  const t2 = topicsOf(d2, 'barberia');
  const tip2 = tipOf(t2);
  ok('B2 el tip existe cuando hay un elegible libre', !!tip2, joined(t2));
  ok('B2 el tip ancla «Corte fade», no la atención', tip2 && tip2.digest_anchor === 'Corte fade', tip2 && JSON.stringify(tip2));
  ok('B2 el caption del tip no menciona la atención', tip2 && !norm(tip2.caption).includes('atencion'), tip2 && tip2.caption);
  // B3: digest con SOLO la atención → novedad la anuncia (válido), tip ausente.
  const d3 = digestWith([], ['atención personalizada'], 'barberia');
  const t3 = topicsOf(d3, 'barberia');
  ok('B3 con un solo servicio abstracto: no hay tip', !tipOf(t3), joined(t3));
  ok('B3 la novedad SÍ puede anunciar el servicio (no es el frame roto)', t3.some((t) => t.kind === 'novedad'), joined(t3));
}

console.log('== C) deriveTopics — digest envenenado pre-v755 no ancla rótulos ==');
{
  // C1: Portrait Coffee (ids 571/573): rótulos EN + un producto real.
  const d1 = digestWith(['Best Sellers', 'single origin coffees', 'Zahra Dress'], [], 'moda');
  const t1 = topicsOf(d1, 'moda');
  const j1 = norm(joined(t1));
  ok('C1 ningún topic ancla «Best Sellers»', !j1.includes('best sellers'), joined(t1));
  ok('C1 ningún topic ancla «single origin»', !j1.includes('single origin'), joined(t1));
  ok('C1 la novedad ancla el producto real «Zahra Dress»', t1.some((t) => t.digest_anchor === 'Zahra Dress'), joined(t1));
  // C2: Ladyee (ids 577/578/579): TODO el fundamento es veneno → 0 temas, no 3 rotos.
  const d2 = digestWith(['your bag', 'Country/region and currency'], ['Timeless style. Effortless you'], 'moda');
  const t2 = topicsOf(d2, 'moda');
  ok('C2 digest todo-envenenado: 0 temas derivados (el demo rellena con autoridad)', t2.length === 0, joined(t2));
  // C3: paridad EN — el filtro no depende del idioma del frame.
  const d3 = digestWith(['Best Sellers', 'Zahra Dress'], [], 'moda');
  const t3 = topicsOf(d3, 'moda', 'en');
  const j3 = norm(joined(t3));
  ok('C3 en inglés tampoco ancla «Best Sellers»', !j3.includes('best sellers'), joined(t3));
  ok('C3 en inglés la novedad ancla «Zahra Dress»', t3.some((t) => t.digest_anchor === 'Zahra Dress'), joined(t3));
}

console.log('== D) Regresión — digest sano sigue igual ==');
{
  const d = digestWith(['Café de especialidad', 'Medialunas'], ['Brunch'], 'gastronomia');
  const t = topicsOf(d, 'gastronomia');
  const tip = tipOf(t);
  ok('D1 digest sano: el tip existe', !!tip, joined(t));
  ok('D2 digest sano: el tip ancla un ítem real', tip && ['Café de especialidad', 'Medialunas', 'Brunch'].includes(tip.digest_anchor), tip && tip.digest_anchor);
  ok('D3 digest sano: ≥3 temas derivados', t.length >= 3, `${t.length} temas: ${joined(t)}`);
  ok('D4 el filtro vive en deriveTopics (no depende de que alguien se acuerde)', /isPlausibleOfferItem\(name\(x\)\)/.test(cdSrc), 'D4');
  ok('D5 el tip usa el selector elegible (no el pickItem(0) ciego)', /pickChoosableTipItem/.test(cdSrc), 'D5');
}

console.log('\n' + pass + ' ok · ' + fail + ' fallas' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
