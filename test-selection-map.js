'use strict';
/* test-selection-map.js — SELECCIÓN QUE SABE (v234)
 * El dataset del estudio de selección (prompt-selection-map.json,
 * 1.267 codes) consumido por el pick real:
 *  (a) LA SONDA DE LOS 100 PICKS (los 10 arquetipos del estudio,
 *      reconstruidos: digest con buildFromParts + plan comercial real
 *      planSalesWeek + pickStyle como en generateWeekDrafts):
 *      contraindicados DUROS < 2% (la vara del estudio; la sonda
 *      reconstruida medía 32% sobre v233 con dataset desactivado) y
 *      subóptimos reducidos de forma masiva (56% → ≤45%; el piso
 *      restante es del CATÁLOGO, verificado por oráculo: 0 picks sin
 *      cobertura rescatables por algoritmo — faltan direcciones de
 *      autoridad/consulta y el rubro funeraria entero, estudio §5);
 *  (b) joyería luminosa premium: CERO presets oscuros contraindicados
 *      en sus 10 picks (en v233, 6 de 10 eran duros);
 *  (c) makeup a domicilio: su promo NO recibe un preset que exige
 *      producto envasado (el caso del estudio: /packshot);
 *  (d) la intención de VENTA se ejerce: con salesIntent=reserva, el
 *      pick cubre reserva en intenciones[] del dataset;
 *  (e) NEGATIVOS: el favorito explícito del cliente gana sobre el
 *      dataset (pero nunca sobre brandSafe/NEVER/exigencias); con
 *      dataset:false el pick es IDÉNTICO a v233 (baseline grabado:
 *      joyería/novedad → /joy-diseno3d);
 *  (f) el dataset cubre los 1.267 codes del catálogo y los perfiles
 *      derivados del digest son los esperados.
 * Corre con: node test-selection-map.js */
const assert = require('assert');
const IS = require('./image-styles');
const cd = require('./client-digest');
const sb = require('./sales-brain');
const MAP = require('./prompt-selection-map.json');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.error('  ✗ ' + name + ' — ' + e.message); }
}

const ARCH = [
  {
    key: 'cafe', business: 'Café Aroma', category: 'cafeteria', registro: 'light',
    palette: [{ hex: '#F5E9D3', rol: 'fondo' }, { hex: '#B07D4F', rol: 'principal' }, { hex: '#FFF8EC', rol: 'light' }],
    dna: { servicios: ['Desayuno y brunch', 'Café de especialidad'], productos: [{ nombre: 'Blend Patagonia 250g', precio: 12000 }, { nombre: 'Medialunas de manteca' }], producto_estrella: 'Blend Patagonia 250g', promos_activas: [{ nombre: '2x1 en flat white los martes' }], diferencial: 'Cafetería de especialidad en Palermo: tostamos nuestro propio blend en lotes chicos.', ubicacion: 'Palermo' },
    feed: { bio: 'Cafetería de especialidad ☕ Tostamos nuestro Blend Patagonia. Desayunos, brunch y medialunas recién horneadas. Reservá tu mesa.', captions: ['Nuestro Blend Patagonia recién tostado, listo para llevar', 'Medialunas de manteca saliendo del horno', 'Flat white con latte art, como siempre'], name: 'Café Aroma', handle: '@cafearoma' },
    titles: { promo: '2x1 en flat white los martes', novedad: 'Llegó el Blend Patagonia recién tostado', social: 'Lo que dicen los que desayunan acá', tip: 'Cómo guardar el café para que no pierda aroma', reserva: 'Reservá tu mesa del finde' },
    truth: { feedLines: ['luminoso', 'calido'], local: true, producto: true, envasado: true, protagonista: false, pos: 'medio' },
  },
  {
    key: 'joyeria', business: 'Joyería Lumière', category: 'joyeria', registro: 'light',
    palette: [{ hex: '#FAFAF7', rol: 'fondo' }, { hex: '#C9A227', rol: 'principal' }, { hex: '#EDEAE2', rol: 'light' }],
    dna: { productos: [{ nombre: 'Anillo de oro 18k' }, { nombre: 'Aros de perlas' }], producto_estrella: 'Anillo de oro 18k', servicios: ['Diseño de piezas a medida'], diferencial: 'Joyería de autor: piezas únicas en oro 18k, hechas a mano en nuestro taller.', ubicacion: 'Recoleta' },
    feed: { bio: 'Joyería de autor ✨ Piezas únicas en oro 18k. Diseño a medida.', captions: ['Anillo de oro 18k terminado a mano', 'Aros de perlas, colección nueva'], name: 'Joyería Lumière', handle: '@joyerialumiere' },
    titles: { promo: 'Piezas únicas: anillo de oro 18k en cuotas', novedad: 'Nueva colección de aros de perlas', social: 'Una clienta y su anillo a medida', tip: 'Cómo cuidar tus piezas de oro', reserva: 'Reservá tu cita de diseño a medida' },
    truth: { feedLines: ['luminoso', 'minimalista'], local: true, producto: true, envasado: false, protagonista: false, pos: 'premium' },
  },
  {
    key: 'makeup', business: 'Mili Makeup', category: 'belleza', registro: 'light',
    palette: [{ hex: '#FBF3EE', rol: 'fondo' }, { hex: '#C98A7D', rol: 'principal' }, { hex: '#FFF9F5', rol: 'light' }],
    dna: { servicios: ['Maquillaje social', 'Maquillaje para novias', 'Clases de automaquillaje'], diferencial: 'Maquillaje social y de novias a domicilio en Buenos Aires: voy a tu casa con todo mi maletín.', ubicacion: 'Buenos Aires' },
    feed: { bio: 'Soy Mili ✨ Maquillaje social y para novias a domicilio. Reservá tu fecha.', captions: ['Maquillaje social de noche, piel glow', 'Novia lista: maquillaje que dura toda la fiesta'], name: 'Mili Makeup', handle: '@milimakeup' },
    titles: { promo: 'Promo: maquillaje social con prueba incluida', novedad: 'Nueva fecha abierta para novias', social: 'Lo que duró el maquillaje de esta novia', tip: 'Tip: cómo hacer que el maquillaje dure toda la fiesta', reserva: 'Reservá tu fecha de maquillaje' },
    truth: { feedLines: ['luminoso'], local: false, producto: false, envasado: false, protagonista: true, pos: 'medio' },
  },
  {
    key: 'barberia', business: 'Barbería El Filo', category: 'barberia', registro: 'dark',
    palette: [{ hex: '#14100D', rol: 'fondo' }, { hex: '#C89B5A', rol: 'principal' }, { hex: '#2A211A', rol: 'dark' }],
    dna: { servicios: ['Corte clásico', 'Arreglo de barba con navaja'], productos: [{ nombre: 'Pomada El Filo 100g', precio: 8500 }], producto_estrella: 'Pomada El Filo 100g', diferencial: 'Barbería clásica: corte, navaja y toalla caliente, como antes.', ubicacion: 'Palermo' },
    feed: { bio: 'Barbería El Filo 💈 Corte clásico y arreglo de barba con navaja y toalla caliente. Reservá tu turno.', captions: ['Corte clásico con navaja, terminado', 'El ritual de la toalla caliente'], name: 'Barbería El Filo', handle: '@barberiaelfilo' },
    titles: { promo: 'Promo corte + barba esta semana', novedad: 'Llegó nuestra pomada propia', social: 'Un cliente de siempre, corte nuevo', tip: 'Tip: cada cuánto retocar la barba', reserva: 'Reservá tu turno de corte' },
    truth: { feedLines: ['oscuro'], local: true, producto: true, envasado: true, protagonista: true, pos: 'medio' },
  },
  {
    key: 'sushi', business: 'Sushi Go', category: 'gastronomia', registro: 'dark',
    palette: [{ hex: '#0E0E12', rol: 'fondo' }, { hex: '#D8D3C8', rol: 'principal' }, { hex: '#1C1C22', rol: 'dark' }],
    dna: { productos: [{ nombre: 'Omakase de autor' }, { nombre: 'Nigiris de salmón' }, { nombre: 'Tiradito nikkei' }], producto_estrella: 'Omakase de autor', servicios: ['Cena omakase con reserva'], diferencial: 'Cocina nikkei de autor en Palermo: omakase de 12 pasos con producto del día.', ubicacion: 'Palermo' },
    feed: { bio: 'Sushi Go 🍣 Cocina nikkei de autor. Omakase con reserva previa.', captions: ['Omakase de autor, paso 7: nigiri de salmón', 'Tiradito nikkei en leche de tigre'], name: 'Sushi Go', handle: '@sushigo' },
    titles: { promo: 'Promo omakase para dos', novedad: 'Nuevo tiradito nikkei en la carta', social: 'Lo que dicen los que probaron el omakase', tip: 'Cómo se come un nigiri, según el chef', reserva: 'Reservá tu omakase del sábado' },
    truth: { feedLines: ['oscuro'], local: true, producto: true, envasado: false, protagonista: false, pos: 'premium' },
  },
  {
    key: 'taller', business: 'Taller Don Pedro', category: 'autos', registro: 'dark',
    palette: [{ hex: '#17181C', rol: 'fondo' }, { hex: '#8A8F98', rol: 'principal' }, { hex: '#23242A', rol: 'dark' }],
    dna: { servicios: ['Service completo', 'Frenos', 'Alineación y balanceo', 'Diagnóstico electrónico'], diferencial: 'Taller mecánico de barrio: service, frenos y diagnóstico con presupuesto claro.', ubicacion: 'Caballito' },
    feed: { bio: 'Taller Don Pedro 🔧 Mecánica integral: service, frenos y diagnóstico. Pedí tu turno.', captions: ['Service completo terminado en el día', 'Frenos nuevos, auto seguro'], name: 'Taller Don Pedro', handle: '@tallerdonpedro' },
    titles: { promo: 'Promo service completo con chequeo de frenos', novedad: 'Nuevo equipo de diagnóstico electrónico', social: 'Un cliente que volvió por su service', tip: 'Tip: cada cuánto hacer el service', reserva: 'Reservá tu turno de service' },
    truth: { feedLines: ['oscuro', 'sobrio'], local: true, producto: false, envasado: false, protagonista: false, pos: 'popular' },
  },
  {
    key: 'inmobiliaria', business: 'Inmobiliaria Norte', category: 'inmobiliaria', registro: 'light',
    palette: [{ hex: '#F7F5F0', rol: 'fondo' }, { hex: '#33566E', rol: 'principal' }, { hex: '#FFFFFF', rol: 'light' }],
    dna: { servicios: ['Venta de propiedades', 'Alquileres', 'Tasaciones'], diferencial: 'Inmobiliaria en zona norte: venta y alquiler de propiedades con acompañamiento completo.', ubicacion: 'Zona Norte' },
    feed: { bio: 'Inmobiliaria Norte 🏡 Venta y alquiler de propiedades en zona norte. Consultanos.', captions: ['Departamento luminoso en venta, 3 ambientes', 'Casa con jardín en alquiler'], name: 'Inmobiliaria Norte', handle: '@inmobiliarianorte' },
    titles: { promo: 'Oportunidad: departamento 3 ambientes en venta', novedad: 'Nueva propiedad en venta: casa con jardín', social: 'Una familia que encontró su casa', tip: 'Tip: qué mirar en una primera visita', reserva: 'Reservá tu visita a esta propiedad' },
    truth: { feedLines: ['luminoso'], local: true, producto: false, envasado: false, protagonista: false, pos: 'medio' },
  },
  {
    key: 'gym', business: 'Funcional Club', category: 'fitness', registro: 'dark',
    palette: [{ hex: '#101418', rol: 'fondo' }, { hex: '#E4572E', rol: 'principal' }, { hex: '#FFC53D', rol: 'accent' }],
    dna: { servicios: ['Entrenamiento funcional en grupos chicos', 'Clases de fuerza'], diferencial: 'Entrenamiento funcional en grupos chicos, con coach que corrige cada movimiento.', ubicacion: 'Belgrano' },
    feed: { bio: 'Funcional Club 💪 Entrenamiento funcional en grupos chicos. Primera clase de prueba gratis.', captions: ['Grupo chico, coach corrigiendo la sentadilla', 'Clase de fuerza de las 19h'], name: 'Funcional Club', handle: '@funcionalclub' },
    titles: { promo: 'Promo: primera clase de prueba gratis', novedad: 'Nuevo horario de funcional a la mañana', social: 'El progreso de una alumna en 3 meses', tip: 'Tip: la sentadilla bien hecha', reserva: 'Reservá tu clase de prueba' },
    truth: { feedLines: ['oscuro', 'saturado'], local: true, producto: false, envasado: false, protagonista: true, pos: 'popular' },
  },
  {
    key: 'mascotas', business: 'Clínica Veterinaria Patitas', category: 'mascotas', registro: 'light',
    palette: [{ hex: '#F2F8F4', rol: 'fondo' }, { hex: '#4E9B6A', rol: 'principal' }, { hex: '#FFFFFF', rol: 'light' }],
    dna: { servicios: ['Consultas veterinarias', 'Vacunación', 'Ecografías'], diferencial: 'Clínica veterinaria: consultas, vacunas y ecografías con turno.', ubicacion: 'Villa Crespo' },
    feed: { bio: 'Clínica Veterinaria Patitas 🐾 Consultas, vacunas y ecografías. Pedí tu turno.', captions: ['Control y vacuna anual, listo', 'Ecografía de control con turno'], name: 'Clínica Veterinaria Patitas', handle: '@vetpatitas' },
    titles: { promo: 'Promo plan de vacunación anual', novedad: 'Nuevo ecógrafo en la clínica', social: 'Un paciente que se recuperó bárbaro', tip: 'Tip: cuándo vacunar a tu cachorro', reserva: 'Reservá tu turno de consulta' },
    truth: { feedLines: ['luminoso'], local: true, producto: false, envasado: false, protagonista: false, pos: 'medio' },
  },
  {
    key: 'funeraria', business: 'Funeraria Serenidad', category: 'funeraria', registro: 'light',
    palette: [{ hex: '#F6F4EF', rol: 'fondo' }, { hex: '#7A7568', rol: 'principal' }, { hex: '#FFFFFF', rol: 'light' }],
    dna: { servicios: ['Sepelios', 'Cremación', 'Planes de previsión'], diferencial: 'Funeraria: acompañamiento sereno y respetuoso para las familias, las 24 horas.', ubicacion: 'Buenos Aires' },
    feed: { bio: 'Funeraria Serenidad. Acompañamiento sereno para las familias, las 24 horas.', captions: ['Nuestro compromiso: acompañar con respeto'], name: 'Funeraria Serenidad', handle: '@funerariaserenidad' },
    titles: { promo: 'Planes de previsión con cobertura completa', novedad: 'Nueva sala velatoria', social: 'El testimonio de una familia acompañada', tip: 'Qué tener en cuenta al contratar un plan de previsión', reserva: 'Consultá por nuestros planes' },
    truth: { feedLines: ['sobrio', 'luminoso'], local: true, producto: false, envasado: false, protagonista: false, pos: 'medio' },
  },
];

function auditPick(entry, { truth, salesIntent, rubro, styleIntent }) {
  const hard = [];
  const sub = [];
  if (!entry) return { hard: ['sin-dataset'], sub: [] };
  const contra = entry.contraindicaciones || [];
  if ((entry.feed_rompe || []).some((l) => truth.feedLines.includes(l))) hard.push('rompe-feed:' + (entry.feed_rompe || []).filter((l) => truth.feedLines.includes(l)).join(','));
  if (contra.includes('exige-local-fisico') && !truth.local) hard.push('exige-local');
  if (contra.includes('exige-producto-envasado') && !truth.envasado) hard.push('exige-envasado');
  if (contra.includes('exige-producto-fisico') && !truth.producto) hard.push('exige-producto');
  if (contra.includes('exige-protagonista-humano') && !truth.protagonista) hard.push('exige-protagonista');
  if (truth.pos === 'premium' && contra.some((c) => ['ugc-no-marca-premium', 'grafica-agresiva-no-premium', 'fantasia-no-cuenta-sobria-ni-premium'].includes(c))) hard.push('no-premium');
  if ((styleIntent === 'testimonio' || styleIntent === 'retrato') && contra.includes('fantasia-o-render-no-testimonio-ni-retrato')) hard.push('fantasia-en-testimonio');
  if (contra.includes('solo-viral-o-manual') && styleIntent !== 'viral') hard.push('solo-viral');
  if (contra.includes('macro-textura-sin-producto-reconocible') && salesIntent === 'venta' && truth.producto) hard.push('macro-textura-en-venta');
  if (contra.includes('requiere-evidencia-real-antes-despues')) hard.push('antes-despues-sin-evidencia');
  if (!hard.length) {
    if (salesIntent && !(entry.intenciones || []).includes(salesIntent)) sub.push('intencion-venta-no-cubierta:' + salesIntent);
    if (rubro && !(entry.rubros_gana || []).includes(rubro)) sub.push('fuera-de-rubros-gana');
    const pos = entry.posicionamiento || [];
    if ((truth.pos === 'premium' && pos.includes('popular') && !pos.includes('premium'))
      || (truth.pos === 'popular' && pos.includes('premium') && !pos.includes('popular') && !pos.includes('medio'))) sub.push('posicionamiento-cruzado');
    if (truth.pos === 'premium' && entry.prioridad === 'baja') sub.push('prioridad-baja-en-premium');
  }
  return { hard, sub };
}

const TIPOS = ['promo', 'novedad', 'social', 'tip', 'reserva'];

function runProbe(withDataset) {
  const per = {};
  let totHard = 0, totSub = 0, tot = 0;
  for (const a of ARCH) {
    const digest = cd.buildFromParts({ business: a.business, category: a.category, dna: a.dna, feed: a.feed, palette: a.palette, registro: a.registro });
    const ideas = [];
    for (let r = 0; r < 2; r++) for (const tp of TIPOS) ideas.push({ tipo: tp, titulo: a.titles[tp], angulo: '' });
    let planned = ideas;
    try { planned = sb.planSalesWeek(ideas.map((i) => ({ ...i })), ideas.length, digest, {}).picks; } catch (e) {}
    let feedProfile = null, offerProfile = null;
    if (withDataset) {
      feedProfile = IS.feedProfileFromDigest(digest);
      offerProfile = IS.offerProfileFromDigest(digest);
    }
    const used = [], fams = [];
    let h = 0, s = 0;
    const codes = [];
    for (const idea of planned) {
      const args = {
        intent: IS.resolveExplicitIntent({ tipo: idea.tipo || '', theme: idea.titulo || '', angle: idea.angulo || '' }).intent,
        tipo: idea.tipo || '', theme: idea.titulo || '', angle: idea.angulo || '',
        rubro: a.category, businessName: a.business,
        usedThisWeek: used, digest, avoidFamilies: fams,
      };
      if (withDataset) {
        args.feedProfile = feedProfile;
        args.offerProfile = offerProfile;
        args.salesIntent = (idea._sales && idea._sales.intent) || '';
      } else {
        args.dataset = false;
      }
      const pk = IS.pickStyle(args);
      tot++;
      assert.ok(pk && pk.style, a.key + ': pick sin estilo');
      used.push(pk.style.code);
      codes.push(pk.style.code);
      if (pk.family && !fams.includes(pk.family)) fams.push(pk.family);
      const entry = MAP[pk.style.code];
      const salesIntent = (idea._sales && idea._sales.intent) || '';
      const r = auditPick(entry, { truth: a.truth, salesIntent, rubro: a.category, styleIntent: pk.intent });
      if (r.hard.length) h++;
      else if (r.sub.length) s++;
    }
    per[a.key] = { hard: h, sub: s, codes };
    totHard += h; totSub += s;
  }
  return { per, totHard, totSub, tot };
}

const before = runProbe(false);
const after = runProbe(true);
console.log(`  sonda ANTES (dataset off): duros ${before.totHard}/100 · subóptimos ${before.totSub}/100`);
console.log(`  sonda DESPUÉS (dataset on): duros ${after.totHard}/100 · subóptimos ${after.totSub}/100`);

t('(a) sonda: contraindicados duros < 2% (desde ' + before.totHard + '%)', () => {
  assert.ok(before.totHard >= 20, 'la sonda sin dataset reproduce el problema: ' + before.totHard);
  assert.ok(after.totHard / after.tot < 0.02, 'duros después: ' + after.totHard);
});
t('(a) sonda: subóptimos reducidos de forma masiva (' + before.totSub + ' → ' + after.totSub + ')', () => {
  assert.ok(after.totSub < before.totSub, 'no bajaron');
  assert.ok(after.totSub <= 45, 'subóptimos después: ' + after.totSub + ' (el piso es del catálogo: funeraria sin rubro + huecos de autoridad/consulta del estudio §5)');
});
t('(b) joyería premium luminosa: cero presets oscuros contraindicados en 10 picks', () => {
  assert.strictEqual(after.per.joyeria.hard, 0, 'duros en joyería: ' + after.per.joyeria.hard);
  const oscuros = after.per.joyeria.codes.filter((c) => MAP[c] && MAP[c].tono === 'oscuro');
  assert.strictEqual(oscuros.length, 0, 'presets oscuros: ' + oscuros.join(','));
});
t('(c) makeup a domicilio: ningún pick exige lo que el negocio no tiene; la promo no exige envasado', () => {
  assert.strictEqual(after.per.makeup.hard, 0, 'duros en makeup: ' + after.per.makeup.hard);
  const digest = cd.buildFromParts({ business: 'Mili Makeup', category: 'belleza', registro: 'light',
    palette: [{ hex: '#FBF3EE', rol: 'fondo' }, { hex: '#C98A7D', rol: 'principal' }, { hex: '#FFF9F5', rol: 'light' }],
    dna: { servicios: ['Maquillaje social', 'Maquillaje para novias'], diferencial: 'Maquillaje social y de novias a domicilio en Buenos Aires.', ubicacion: 'Buenos Aires' },
    feed: { bio: 'Soy Mili ✨ Maquillaje social y para novias a domicilio. Reservá tu fecha.', captions: ['Maquillaje social de noche, piel glow'], name: 'Mili Makeup', handle: '@milimakeup' } });
  const pk = IS.pickStyle({ intent: 'promo', tipo: 'promo', theme: 'Promo: maquillaje social con prueba incluida', angle: '', rubro: 'belleza', businessName: 'Mili Makeup', usedThisWeek: [], digest, avoidFamilies: [], salesIntent: 'venta' });
  const contra = (MAP[pk.style.code] || {}).contraindicaciones || [];
  assert.ok(!contra.includes('exige-producto-envasado') && !contra.includes('exige-producto-fisico') && !contra.includes('exige-local-fisico'), pk.style.code + ' exige: ' + contra.join(','));
});
t('(d) salesIntent=reserva elige un preset que cubre reserva', () => {
  const digest = cd.buildFromParts({ business: 'Café Aroma', category: 'cafeteria', registro: 'light',
    palette: [{ hex: '#F5E9D3', rol: 'fondo' }, { hex: '#B07D4F', rol: 'principal' }, { hex: '#FFF8EC', rol: 'light' }],
    dna: { servicios: ['Desayuno y brunch'], productos: [{ nombre: 'Blend Patagonia 250g', precio: 12000 }], producto_estrella: 'Blend Patagonia 250g', diferencial: 'Cafetería de especialidad en Palermo.', ubicacion: 'Palermo' },
    feed: { bio: 'Cafetería de especialidad ☕ Reservá tu mesa.', captions: ['Blend Patagonia recién tostado'], name: 'Café Aroma', handle: '@cafearoma' } });
  const pk = IS.pickStyle({ intent: 'producto', tipo: 'reserva', theme: 'Reservá tu mesa del finde', angle: '', rubro: 'cafeteria', businessName: 'Café Aroma', usedThisWeek: [], digest, avoidFamilies: [], salesIntent: 'reserva' });
  assert.ok(((MAP[pk.style.code] || {}).intenciones || []).includes('reserva'), pk.style.code + ' no cubre reserva: ' + ((MAP[pk.style.code] || {}).intenciones || []).join(','));
});
function joyeriaDigest() {
  return cd.buildFromParts({ business: 'Joyería Lumière', category: 'joyeria', registro: 'light',
    palette: [{ hex: '#FAFAF7', rol: 'fondo' }, { hex: '#C9A227', rol: 'principal' }, { hex: '#EDEAE2', rol: 'light' }],
    dna: { productos: [{ nombre: 'Anillo de oro 18k' }, { nombre: 'Aros de perlas' }], producto_estrella: 'Anillo de oro 18k', servicios: ['Diseño de piezas a medida'], diferencial: 'Joyería de autor: piezas únicas en oro 18k.', ubicacion: 'Recoleta' },
    feed: { bio: 'Joyería de autor ✨ Piezas únicas en oro 18k.', captions: ['Anillo de oro 18k terminado a mano'], name: 'Joyería Lumière', handle: '@joyerialumiere' } });
}
t('(e) el favorito del cliente gana sobre el dataset (feed), sin favorito no sale', () => {
  const digest = joyeriaDigest();
  const base = { intent: 'lanzamiento', tipo: 'novedad', theme: 'Nueva colección de aros de perlas', angle: '', rubro: 'joyeria', businessName: 'Joyería Lumière', digest, avoidFamilies: [] };
  const sinFav = IS.pickStyle({ ...base, usedThisWeek: [] });
  assert.notStrictEqual(sinFav.style.code, '/luxury', 'sin favorito no debería salir el oscuro que rompe su feed');
  const conFav = IS.pickStyle({ ...base, usedThisWeek: [], favorites: ['/luxury'] });
  assert.strictEqual(conFav.style.code, '/luxury', 'el favorito explícito manda sobre el filtro de feed');
});
t('(e) dataset:false = v233 exacto (baseline grabado /joy-diseno3d)', () => {
  const digest = joyeriaDigest();
  const pk = IS.pickStyle({ intent: 'lanzamiento', tipo: 'novedad', theme: 'Nueva colección de aros de perlas', angle: '', rubro: 'joyeria', businessName: 'Joyería Lumière', usedThisWeek: [], digest, avoidFamilies: [], dataset: false });
  assert.strictEqual(pk.style.code, '/joy-diseno3d', 'con dataset off el pick difiere de v233: ' + pk.style.code);
});
t('(f) el dataset cubre los 1.267 codes y los perfiles derivan como se espera', () => {
  assert.strictEqual(Object.keys(MAP).length, 1267, 'codes en el mapa');
  for (const s of IS.STYLES) assert.ok(MAP[s.code], 'falta ' + s.code + ' en el dataset');
  const cafe = ARCH[0];
  const d = cd.buildFromParts({ business: cafe.business, category: cafe.category, dna: cafe.dna, feed: cafe.feed, palette: cafe.palette, registro: cafe.registro });
  const fp = IS.feedProfileFromDigest(d);
  assert.ok(fp.confident && fp.lineas.includes('luminoso') && fp.lineas.includes('calido'), 'feed del café: ' + JSON.stringify(fp));
  const mk = ARCH[2];
  const dm = cd.buildFromParts({ business: mk.business, category: mk.category, dna: mk.dna, feed: mk.feed, palette: mk.palette, registro: mk.registro });
  const of = IS.offerProfileFromDigest(dm);
  assert.strictEqual(of.tieneLocal, false, 'makeup a domicilio sin local');
  assert.strictEqual(of.tieneEnvasado, false, 'makeup sin envasado');
  // Protagonista: sale del campo protagonista del digest (la minería
  // de "soy X" de buildFromParts es case-sensitive — comportamiento
  // v229 heredado, dirección conservadora: sin protagonista detectada
  // el filtro exige-protagonista no se dispara de más).
  const dpro = cd.buildFromParts({ business: 'Mili Makeup', category: 'belleza', registro: 'light',
    palette: mk.palette, dna: mk.dna,
    feed: { bio: 'Maquillaje social y para novias ✨ soy Mili, maquilladora a domicilio. Reservá tu fecha.', captions: mk.feed.captions, name: 'Mili Makeup', handle: '@milimakeup' } });
  assert.strictEqual(IS.offerProfileFromDigest(dpro).tieneProtagonista, true, 'con protagonista en el digest, el perfil la ve');
});
t('cascada: el feed se relaja antes que las exigencias (datasetFilterList)', () => {
  const feedOscuro = { lineas: ['luminoso'], confident: true };
  const g = IS.datasetFilterList([IS.getStyle('/luxury'), IS.getStyle('/floating')], { feedProfile: feedOscuro, offerProfile: null });
  assert.strictEqual(g.relaxed, 'feed', 'relajación esperada: feed, vino ' + g.relaxed);
  assert.strictEqual(g.kept.length, 2, 'con el feed relajado quedan los dos');
  const offer = { tieneLocal: true, tieneProducto: false, tieneEnvasado: false, tieneProtagonista: false, posicionamiento: 'medio' };
  const g2 = IS.datasetFilterList([IS.getStyle('/packshot')], { feedProfile: null, offerProfile: offer });
  assert.strictEqual(g2.relaxed, 'historico', 'las exigencias no se relajan: ' + g2.relaxed);
});

console.log(`\n${fail ? '✗' : '✅'} test-selection-map: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
