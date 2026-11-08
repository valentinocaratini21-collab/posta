#!/usr/bin/env node
// LOTE LÍNEAS-ROJAS-TITULAR (7/11) — en la semana generada para Top
// Class Barber Squad (grabación 3er intento, v747 en vivo), el posteo
// del lunes salió titulado literalmente «LÍNEAS ROJAS». La respuesta
// de q8 («Fotos de clientes sin permiso») se usó como titular.
// CAUSA RAÍZ (verificada, no adivinada): el richGoal lleva la línea
// «LÍNEAS ROJAS — NUNCA PUBLICAR: Fotos de clientes sin permiso»
// (onboardingGoalLines, server.js) y formTextBase = richGoal alimenta
// buildFromParts({ form: { description: richGoal } }); offeringsFromText
// parte en « — » y «LÍNEAS ROJAS» pasaba isPlausibleOfferItem como si
// fuera un servicio → deriveTopics lo anclaba → titular «LÍNEAS ROJAS».
// SEGUNDA VÍA (misma familia, hallada al probar el fix): en
// generateIdeas, el reemplazo Testimonio→Proceso corre DESPUÉS de los
// post-filtros de vetos e inyecta productos[0] en el título («cómo
// estamos preparando LÍNEAS ROJAS» con un digest envenenado).
// El fix (5 capas): (1) el minador salta segmentos de veto; (2)
// deriveTopics + scrubDigestItems sacan lo vetado (cubre digest ya
// envenenados); (3) generateDemo pasa allTopics por dropVetoTopics y
// applyGoal no cita la línea de vetos en el caption; (4) generateIdeas
// vuelve a aplicar los vetos tras el reemplazo de Testimonio;
// (5) ideasInputFor suma las etiquetas a lineasRojas para la semana
// normal. Las líneas rojas son veto, nunca tema/titular/ángulo.
// Uso: node test-lote-lineas-rojas-titular.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const cd = require('./client-digest');
const gen = require('./generator');
const fl = require('./fundamento-literal');
const cdSrc = fs.readFileSync(path.join(DIR, 'client-digest.js'), 'utf8');
const demoSrc = fs.readFileSync(path.join(DIR, 'demo.js'), 'utf8');
const genSrc = fs.readFileSync(path.join(DIR, 'generator.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9# ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hasLabel = (texts) => texts.some((t) => norm(t).includes('lineas rojas') || norm(t).includes('red lines'));

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}
function digestFromGoal(goalLines, category) {
  return cd.buildFromParts({
    business: 'Top Class Barber Squad', category: category || 'barberia', web: null,
    feed: { bio: '', captions: [], name: '', handle: 'topclassbarbersquad' },
    form: { description: goalLines.join('\n') },
  });
}
function headlinesOf(digest) {
  return cd.deriveTopics(digest, { count: 5 }).map((t) => t.headline || '');
}
const TOPCLASS_GOAL = [
  'Producto estrella (elegido por el dueño): Top Class Barber Squad',
  'Objetivo del posteo: mensajes', 'Voz: cercano', 'Precios en posteos: sí',
  'Etapa del Instagram: postea seguido', 'Audiencia: todo el mundo',
  'Diferencial (de ahí salen los ganchos): Atención personalizada',
  'LÍNEAS ROJAS — NUNCA PUBLICAR: Fotos de clientes sin permiso',
];

// ---------- A) El minador ya no crea el servicio veto ----------
const dA1 = digestFromGoal(TOPCLASS_GOAL);
ok('A1 Top Class (caso real): el minador no crea «LÍNEAS ROJAS» como servicio', !dA1.servicios.some((s) => hasLabel([s.nombre || s])), JSON.stringify(dA1.servicios));
ok('A2 Top Class (caso real): ningún titular con la etiqueta', !hasLabel(headlinesOf(dA1)), JSON.stringify(headlinesOf(dA1)));
const dA3 = digestFromGoal(['LÍNEAS ROJAS — NUNCA PUBLICAR: no hablar mal de la competencia']);
ok('A3 q8 libre («no hablar mal de la competencia»): sin etiqueta en servicios ni titulares', !dA3.servicios.some((s) => hasLabel([s.nombre || s])) && !hasLabel(headlinesOf(dA3)), JSON.stringify(dA3.servicios));
const dA4 = digestFromGoal(['LÍNEAS ROJAS — NUNCA PUBLICAR: nada de fotos de clientes']);
ok('A4 q8 corto («nada de fotos de clientes»): sin etiqueta', !dA4.servicios.some((s) => hasLabel([s.nombre || s])) && !hasLabel(headlinesOf(dA4)), JSON.stringify(dA4.servicios));
const dA5 = digestFromGoal(['RED LINES — NEVER POST: Photos of clients without permission']);
ok('A5 EN («RED LINES — NEVER POST: …»): sin etiqueta', !dA5.servicios.some((s) => hasLabel([s.nombre || s])) && !hasLabel(headlinesOf(dA5)), JSON.stringify(dA5.servicios));
const dA6 = digestFromGoal(['Promo real esta semana: % de descuento', 'LÍNEAS ROJAS — NUNCA PUBLICAR: Fotos de clientes sin permiso']);
ok('A6 Con promo real: la promo no se mezcla y la etiqueta no sale', !dA6.servicios.some((s) => hasLabel([s.nombre || s])) && !hasLabel(headlinesOf(dA6)), JSON.stringify(dA6.servicios));

// ---------- B) Digest ya envenenado (sembrado antes del fix) ----------
const dB1 = digestFromGoal(TOPCLASS_GOAL);
dB1.servicios = [{ nombre: 'LÍNEAS ROJAS' }, { nombre: 'Corte fade' }];
dB1.onboarding = { lineas_rojas: 'Fotos de clientes sin permiso' };
const hB1 = headlinesOf(dB1);
ok('B1 Digest envenenado: deriveTopics saca la etiqueta y deja «Corte fade»', !hasLabel(hB1) && hB1.some((h) => /corte fade/i.test(h)), JSON.stringify(hB1));
ok('B2 dropVetoTopics directo: saca el tema veto y deja el legítimo', typeof cd.dropVetoTopics === 'function' && JSON.stringify(cd.dropVetoTopics([{ headline: 'LÍNEAS ROJAS', tema: null, digest_anchor: 'LÍNEAS ROJAS' }, { headline: 'Corte fade', tema: null, digest_anchor: 'Corte fade' }], { lineas_rojas: 'Fotos de clientes sin permiso' }).map((t) => t.headline)) === '["Corte fade"]', typeof cd.dropVetoTopics);
const dB3 = { productos: [{ nombre: 'LÍNEAS ROJAS' }, { nombre: 'Corte fade' }], servicios: [{ nombre: 'Sesión de fotos' }], promos: [], onboarding: { lineas_rojas: 'Fotos de clientes sin permiso' } };
const sB3 = cd.scrubDigestItems(dB3);
ok('B3 scrubDigestItems: limpia lo vetado al guardar y deja lo legítimo', JSON.stringify((sB3.productos || []).map((p) => p.nombre)) === '["Corte fade"]' && JSON.stringify((sB3.servicios || []).map((p) => p.nombre)) === '["Sesión de fotos"]', JSON.stringify(sB3));
ok('B4 stripVetoLines: saca la línea de vetos del texto', typeof cd.stripVetoLines === 'function' && cd.stripVetoLines('Hola\nLÍNEAS ROJAS — NUNCA PUBLICAR: Fotos de clientes sin permiso\nChau') === 'Hola\nChau', typeof cd.stripVetoLines);

// ---------- D) Sin sobre-filtrado: lo legítimo sigue andando ----------
ok('D1 «Sesión de fotos» NO se confunde con el veto de fotos sin permiso', (() => {
  const d = digestFromGoal(['LÍNEAS ROJAS — NUNCA PUBLICAR: Fotos de clientes sin permiso']);
  d.servicios = [{ nombre: 'Sesión de fotos' }, { nombre: 'Corte fade' }];
  d.onboarding = { lineas_rojas: 'Fotos de clientes sin permiso' };
  const h = headlinesOf(d);
  return h.some((x) => /corte fade/i.test(x)) && !hasLabel(h);
})(), 'D1');
ok('D2 Un digest con servicios reales sigue armando semana', (() => {
  const d = digestFromGoal(TOPCLASS_GOAL);
  d.servicios = [{ nombre: 'Corte fade' }];
  return headlinesOf(d).length > 0 && headlinesOf(d).some((h) => /corte fade/i.test(h));
})(), 'D2');
ok('D3 isVetoLabelText: falso para textos legítimos', typeof cd.isVetoLabelText === 'function' && cd.isVetoLabelText('Corte fade') === false && cd.isVetoLabelText('Atención personalizada') === false && cd.isVetoLabelText('Café de especialidad') === false, typeof cd.isVetoLabelText);

// ---------- E) Estático: el fix está cableado en los 4 archivos ----------
ok('E1 offeringsFromText salta segmentos de veto', /isVetoLabelText\(s\)\) continue/.test(cdSrc), 'E1');
ok('E2 deriveTopics filtra ítems vetados', /items\.filter\(\(x\) => !isVetoText\(name\(x\), digest\.onboarding\)/.test(cdSrc), 'E2');
ok('E3 generateDemo pasa allTopics por dropVetoTopics', /dropVetoTopics\(dropTemplateVarTopics/.test(demoSrc), 'E3');
ok('E4 applyGoal saca las líneas de vetos del goal', /stripVetoLines\(goal\)/.test(demoSrc), 'E4');
ok('E5 ideasInputFor suma las etiquetas a lineasRojas', /'LÍNEAS ROJAS', 'RED LINES'/.test(srvSrc), 'E5');
ok('E6 generateIdeas vuelve a aplicar vetos tras el reemplazo de Testimonio', /LOTE LÍNEAS-ROJAS-TITULAR[\s\S]{0,600}filtrarIdeasVetadas\(ideas, input\.lineasRojas\)[\s\S]{0,200}fixTipos\(ideas\)/.test(genSrc), 'E6');

// ---------- C) generateIdeas (semana normal): el reemplazo no reinyecta ----------
(async () => {
  const lr = fl.normalizarVetos(['Fotos de clientes sin permiso', 'LÍNEAS ROJAS', 'RED LINES']);
  const input = { business: 'Top Class Barber Squad', category: 'barberia', lang: 'es', productos: [{ nombre: 'LÍNEAS ROJAS' }, { nombre: 'Corte fade' }], lineasRojas: lr };
  const ideas = await gen.generateIdeas(input, null, {});
  const texts = ideas.flatMap((i) => [i.titulo || '', i.angulo || '']);
  ok('C1 Semana normal con digest envenenado: ninguna idea con la etiqueta (ni por el reemplazo de Testimonio)', !hasLabel(texts) && ideas.length >= 4, JSON.stringify(ideas.map((i) => i.titulo)));
  ok('C2 Restricción SÍ respetada: idea sobre fotos de clientes sin permiso se filtra', fl.filtrarIdeasVetadas([{ titulo: 'Fotos de tus clientes', angulo: 'mostrá el trabajo', caption: '' }], fl.normalizarVetos(['Fotos de clientes sin permiso'])).length === 0, 'C2');
  ok('C3 Idea legítima («Corte fade») sobrevive al filtro de vetos', fl.filtrarIdeasVetadas([{ titulo: 'Corte fade', angulo: 'precisión', caption: '' }], lr).length === 1, 'C3');
  console.log('\n' + pass + ' ok · ' + fail + ' fallas' + (fails.length ? ' — ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR suite', e); process.exit(1); });
