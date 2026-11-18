// test-lote-venty-f5-series.js — VENTY F5 (series con nombre, C14): unitarias.
// Generación de las 4 series para Café Aroma con nombres derivados de su
// fundamento · segundo rubro genérico con nombres distintos · fundamento
// pobre → nombre funcional + jugada propuesta · validador de una-idea
// rechaza un paso con dos ideas · oleadas eligen la serie por nombre
// según el toque · negocio sin series → comportamiento actual intacto.
// Uso: node test-lote-venty-f5-series.js
'use strict';
const { DatabaseSync } = require('node:sqlite');

const venty = require('./venty');
const series = require('./venty-series');
const oleadas = require('./venty-oleadas');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const db = new DatabaseSync(':memory:');
venty.init(db);
series.ensureSchema(db);
oleadas.ensureSchema(db);

// ---------- A. Café Aroma: las 4 series con nombres de su fundamento ----------
console.log('— A. café aroma: 4 series, nombres derivados (estrella con nombre)');
const UID = 1;
venty.asegurarSemilla(db, UID);
const FUND_CAFE = { ...venty.CAFE_AROMA, negocio: 'Café Aroma' };
{
  const r = series.generarSeries(db, UID, { fundamento: FUND_CAFE, negocio: 'Café Aroma' });
  ok(r.ok, 'generarSeries café aroma: ok');
  eq(r.nombres_con_identidad, 4, 'las 4 series nacen con identidad');
  eq(r.jugada_nombre_id, null, 'con fundamento rico no hay jugada de nombre faltante');
  const lista = series.listarSeries(db, UID);
  eq(lista.length, 4, 'quedan guardadas 4 series por negocio');
  const porTipo = Object.fromEntries(lista.map((s) => [s.tipo, s]));
  eq(porTipo.primer_contacto.nombre, 'Brunch Aroma · la mesa', 'primer contacto: nombre desde la estrella (Brunch Aroma) + ritual del rubro');
  eq(porTipo.seguimiento.nombre, 'Brunch Aroma · la sobremesa', 'seguimiento: mismo stem, otra palabra de serie');
  eq(porTipo.reactivacion.nombre, 'Brunch Aroma · la vuelta a la mesa', 'reactivación: nombre propio');
  eq(porTipo.resena_referido.nombre, 'Brunch Aroma · el boca a boca', 'reseña/referido: nombre propio');
  ok(lista.every((s) => s.nombre_es_identidad), 'todas marcadas con identidad');
  ok(lista.every((s) => !/serie \d/i.test(s.nombre)), 'ningún nombre genérico tipo «serie 1»');
  // estructura del playbook: 4 series cubren los 6 tipos, con sus tiempos
  eq(JSON.stringify(porTipo.primer_contacto.pasos.map((p) => p.tipo_email)), JSON.stringify(['T1']), 'primer contacto = [T1]');
  eq(JSON.stringify(porTipo.seguimiento.pasos.map((p) => p.tipo_email)), JSON.stringify(['T2', 'T3', 'T4']), 'seguimiento = [T2, T3, T4] (máximo 3 toques)');
  const [t2, t3] = porTipo.seguimiento.pasos;
  ok(t2.espera.min_horas === 24 && t2.espera.max_horas === 48, 'T2 sale a las 24–48 h (playbook)');
  ok(t3.espera.min_horas === 96 && t3.espera.max_horas === 120, 'T3 sale a los 4–5 días del T1 (playbook)');
  eq(JSON.stringify(porTipo.reactivacion.pasos.map((p) => p.tipo_email)), JSON.stringify(['T5']), 'reactivación = [T5]');
  eq(JSON.stringify(porTipo.resena_referido.pasos.map((p) => p.tipo_email)), JSON.stringify(['T6']), 'reseña/referido = [T6]');
  ok(porTipo.resena_referido.pasos[0].solo_tras_cierre === true && porTipo.resena_referido.pasos[0].una_vez_por_venta === true, 'T6: solo tras cierre ganado, una vez por venta');
  // cada paso: una sola idea, firma del negocio, voz de venty
  for (const s of lista) {
    for (const p of s.pasos) {
      ok(typeof p.idea === 'string' && typeof p.cta === 'string', `${s.tipo}/${p.tipo_email}: idea y cta singulares`);
      ok(series.validarPaso(p).ok, `${s.tipo}/${p.tipo_email}: pasa el validador de una idea (${series.validarPaso(p).errores.join(',')})`);
      ok(!/[¿¡]/.test(p.texto + p.asunto + s.nombre), `${s.tipo}/${p.tipo_email}: cero signos de apertura`);
      ok(venty.validarVoz(p.texto).ok, `${s.tipo}/${p.tipo_email}: pasa el validador de voz de venty`);
    }
    ok(/café aroma/i.test(s.firma_negocio) && !/venty/i.test(s.firma_negocio), `${s.tipo}: se firma como el negocio (café aroma), nunca como venty`);
    ok(series.validarSerie(s).ok, `${s.tipo}: la serie completa valida`);
  }
  ok(porTipo.primer_contacto.pasos[0].texto.includes('brunch aroma para dos'), 'T1 nombra el producto estrella por nombre, no «nuestros productos»');
  ok(porTipo.primer_contacto.pasos[0].texto.includes('$24.000'), 'T1 trae el precio de la lista cargada del fundamento');
  // determinismo + idempotencia por hash
  eq(series.derivarNombreSerie('primer_contacto', FUND_CAFE).nombre, 'Brunch Aroma · la mesa', 'la derivación es determinística');
  const r2 = series.generarSeries(db, UID, { fundamento: FUND_CAFE, negocio: 'Café Aroma' });
  ok(r2.ok && r2.ya_existia, 'segunda generación con el mismo fundamento: ya existía, no reescribe');
  eq(series.listarSeries(db, UID).length, 4, 'siguen siendo 4 series (sin duplicar)');
}

// ---------- B. segundo rubro genérico: nombres distintos, nada calcado ----------
console.log('— B. barbería genérica: otro rubro, otros nombres');
const FUND_BARBERIA = {
  rubro: 'servicios — barbería', modo: 'servicios',
  estrella: 'Fade Navaja',
  precios: [{ item: 'Fade Navaja', precio: 12000 }, { item: 'Barba completa', precio: 8000 }],
  politicas: {}, limites: { descuento_max_pct: 10 }, tono: 'corto, seguro, sin vueltas',
  objeciones: [], negocio: 'Navaja Club', rituales: ['la silla del sábado a la mañana'],
};
{
  const U2 = 2;
  const r = series.generarSeries(db, U2, { fundamento: FUND_BARBERIA, negocio: 'Navaja Club' });
  ok(r.ok && r.nombres_con_identidad === 4, 'barbería: 4 series con identidad');
  const lista = series.listarSeries(db, U2);
  const porTipo = Object.fromEntries(lista.map((s) => [s.tipo, s]));
  eq(porTipo.primer_contacto.nombre, 'Fade Navaja · la primera silla', 'barbería: primer contacto desde su estrella (Fade Navaja)');
  eq(porTipo.seguimiento.nombre, 'Fade Navaja · la silla', 'barbería: seguimiento con su palabra de rubro');
  eq(porTipo.reactivacion.nombre, 'Fade Navaja · de vuelta a la silla', 'barbería: reactivación propia');
  eq(porTipo.resena_referido.nombre, 'Fade Navaja · el boca a boca', 'barbería: reseña propia');
  const nombresCafe = new Set(series.listarSeries(db, UID).map((s) => s.nombre));
  ok(lista.every((s) => !nombresCafe.has(s.nombre)), 'ningún nombre de la barbería coincide con uno de café aroma: nada calcado entre negocios');
  ok(lista.every((s) => /navaja club/i.test(s.firma_negocio)), 'barbería: firma de navaja club en todas las series');
  ok(porTipo.primer_contacto.pasos[0].texto.includes('fade navaja'), 'barbería: T1 nombra su estrella');
  ok(porTipo.seguimiento.pasos[1].texto.includes('barba completa'), 'barbería: T3 cambia de ángulo con otro ítem de SU lista');
}

// ---------- C. fundamento pobre: nombre funcional + jugada, sin inventar ----------
console.log('— C. fundamento pobre: funcional + jugada en bandeja');
{
  const U3 = 3;
  venty.asegurarSemilla(db, U3); // asegura las tablas de bandeja del usuario; el fundamento que se pasa es el pobre
  const pobre = { rubro: '', modo: '', estrella: '', precios: [], politicas: {}, limites: {}, tono: '', objeciones: [] };
  const r = series.generarSeries(db, U3, { fundamento: pobre });
  ok(r.ok, 'fundamento pobre: las series igual se generan');
  eq(r.nombres_con_identidad, 0, 'fundamento pobre: cero nombres con identidad (no se inventa)');
  const lista = series.listarSeries(db, U3);
  eq(lista.length, 4, 'fundamento pobre: quedan las 4 series');
  eq(Object.fromEntries(lista.map((s) => [s.tipo, s.nombre])).primer_contacto, 'primer contacto', 'nombre funcional de primer contacto');
  eq(Object.fromEntries(lista.map((s) => [s.tipo, s.nombre])).seguimiento, 'seguimiento', 'nombre funcional de seguimiento');
  eq(Object.fromEntries(lista.map((s) => [s.tipo, s.nombre])).reactivacion, 'reactivación', 'nombre funcional de reactivación');
  eq(Object.fromEntries(lista.map((s) => [s.tipo, s.nombre])).resena_referido, 'reseña y referido', 'nombre funcional de reseña/referido');
  ok(lista.every((s) => !s.nombre_es_identidad), 'todas marcadas SIN identidad');
  ok(lista.every((s) => series.validarSerie(s).ok), 'las series funcionales también validan (una idea por paso)');
  ok(r.jugada_nombre_id, 'fundamento pobre: nace la jugada en bandeja proponiendo el nombre al completar el fundamento');
  const jugadas = venty.listarBandeja(db, U3).filter((j) => j.tipo === 'serie_sin_nombre');
  eq(jugadas.length, 1, 'exactamente una jugada serie_sin_nombre pendiente en la bandeja');
  ok(/producto estrella/i.test(jugadas[0].propuesta.que || ''), 'la jugada propone completar el fundamento con el producto estrella con nombre');
  const r2 = series.generarSeries(db, U3, { fundamento: pobre, forzar: true });
  ok(r2.ok, 'regeneración forzada del pobre: ok');
  eq(venty.listarBandeja(db, U3).filter((j) => j.tipo === 'serie_sin_nombre').length, 1, 'regenerar no duplica la jugada de nombre');
  // y cuando el fundamento se completa, el nombre llega y es con identidad
  const completo = { ...pobre, rubro: 'gastronomía', estrella: 'Brunch Aroma para dos', precios: venty.CAFE_AROMA.precios };
  ok(series.fundamentoCambioSustancial(db, U3, completo), 'completar estrella y lista = cambio sustancial detectado');
  const r3 = series.generarSeries(db, U3, { fundamento: completo, negocio: 'Café Aroma' });
  ok(r3.ok && r3.nombres_con_identidad === 4, 'con el fundamento completo las series se regeneran con identidad');
  eq(series.obtenerSerie(db, U3, 'primer_contacto').nombre, 'Brunch Aroma · la mesa', 'el nombre propuesto llega al completar el fundamento');
  ok(!series.fundamentoCambioSustancial(db, U3, { ...completo, paleta: [{ hex: '#112233' }], website_url: 'https://example.com' }), 'paleta o web nuevas NO son cambio sustancial: no regeneran');
}

// ---------- D. validador de una idea: un paso con dos ideas no pasa ----------
console.log('— D. validador una-idea');
{
  const pasoOk = series.obtenerSerie(db, UID, 'primer_contacto').pasos[0];
  ok(series.validarPaso(pasoOk).ok, 'paso bien formado: pasa');
  const dosIdeas = { ...pasoOk, ideas: ['presentar el brunch aroma', 'ofrecer también un descuento'] };
  const v1 = series.validarPaso(dosIdeas);
  ok(!v1.ok && v1.errores.includes('dos_ideas'), 'paso con dos ideas (lista de 2): rechazado');
  const dosCtas = { ...pasoOk, ctas: ['responder por la degustación', 'agendar una llamada'] };
  ok(!series.validarPaso(dosCtas).ok && series.validarPaso(dosCtas).errores.includes('dos_ctas'), 'paso con dos ctas: rechazado');
  const ideaLista = { ...pasoOk, idea: ['una idea', 'otra idea'] };
  ok(!series.validarPaso(ideaLista).ok, 'idea dada como lista de dos: rechazada');
  const sinIdea = { ...pasoOk, idea: '' };
  ok(!series.validarPaso(sinIdea).ok, 'paso sin idea: rechazado');
  const firmaVenty = { ...pasoOk, firma: 'el equipo de venty' };
  ok(!series.validarPaso(firmaVenty).ok, 'paso firmado como venty: rechazado (se firma como el negocio)');
  const conApertura = { ...pasoOk, texto: '¿querés probarlo? te lo llevamos' };
  ok(!series.validarPaso(conApertura).ok, 'texto con signo de apertura: rechazado');
  const serieRota = { tipo: 'seguimiento', nombre: 'x', pasos: [pasoOk, dosIdeas] };
  ok(!series.validarSerie(serieRota).ok, 'una serie con un paso de dos ideas no valida entera');
}

// ---------- E. oleadas: eligen la serie por nombre según el toque ----------
console.log('— E. oleadas con series: primer contacto, seguimiento y reactivación por nombre');
{
  const U4 = 4;
  venty.asegurarSemilla(db, U4);
  series.generarSeries(db, U4, { fundamento: FUND_CAFE, negocio: 'Café Aroma' });
  const z1 = venty.crearZona(db, U4, { nombre: 'Zona Series', ciudad: 'prueba' });
  venty.crearLead(db, U4, { nombre: 'Oficina Serie Uno', zona_id: z1.id, canal_preferido: 'email', contacto_ref: 'uno@example.com', puntaje: 90, porque: 'prueba f5' });
  const ol1 = oleadas.prepararOleadaZona(db, U4, z1.id, { piloto: 'prueba-f5', fecha: '2026-11-18' });
  eq(ol1.items.length, 1, 'oleada de primer contacto: 1 ítem en espejo');
  eq(ol1.items[0].serie_nombre, 'Brunch Aroma · la mesa', 'la oleada de primer contacto usa la serie de primer contacto POR NOMBRE');
  eq(ol1.items[0].serie_tipo, 'primer_contacto', 'el ítem guarda el tipo de serie');
  const itemDb = db.prepare('SELECT * FROM venty_s4_oleada_items WHERE id = ?').get(ol1.items[0].id);
  eq(itemDb.serie_nombre, 'Brunch Aroma · la mesa', 'el ítem guardado lleva serie_nombre');
  const jug1 = db.prepare('SELECT * FROM venty_jugadas WHERE id = ?').get(ol1.items[0].jugada_id);
  const prop1 = JSON.parse(jug1.propuesta_json);
  eq(prop1.serie_nombre, 'Brunch Aroma · la mesa', 'la jugada de bandeja nombra la serie');
  ok(typeof prop1.idea === 'string' && prop1.idea.length > 0, 'la jugada trae la única idea del paso de la serie');

  const z2 = venty.crearZona(db, U4, { nombre: 'Zona Seguimiento', ciudad: 'prueba' });
  venty.crearLead(db, U4, { nombre: 'Oficina Serie Dos', zona_id: z2.id, canal_preferido: 'email', contacto_ref: 'dos@example.com', puntaje: 88, porque: 'prueba f5' });
  const ol2 = oleadas.prepararOleadaZona(db, U4, z2.id, { piloto: 'prueba-f5', fecha: '2026-11-19', tipo: 'T2' });
  eq(ol2.items.length, 1, 'oleada de seguimiento: 1 ítem');
  eq(ol2.items[0].serie_nombre, 'Brunch Aroma · la sobremesa', 'el toque T2 usa la serie de seguimiento POR NOMBRE');
  const item2 = db.prepare('SELECT * FROM venty_s4_oleada_items WHERE id = ?').get(ol2.items[0].id);
  eq(item2.tipo, 'T2', 'el ítem de seguimiento guarda tipo T2');

  const z3 = venty.crearZona(db, U4, { nombre: 'Zona Reactivación', ciudad: 'prueba' });
  venty.crearLead(db, U4, { nombre: 'Cliente Dormido', zona_id: z3.id, canal_preferido: 'email', contacto_ref: 'dormido@example.com', puntaje: 80, porque: 'prueba f5' });
  const ol3 = oleadas.prepararOleadaZona(db, U4, z3.id, { piloto: 'prueba-f5', fecha: '2026-11-20', tipo: 'T5' });
  eq(ol3.items.length, 1, 'oleada de reactivación: 1 ítem (la pieza sale del paso de la serie)');
  eq(ol3.items[0].serie_nombre, 'Brunch Aroma · la vuelta a la mesa', 'el toque T5 usa la serie de reactivación POR NOMBRE');
  const item3 = db.prepare('SELECT * FROM venty_s4_oleada_items WHERE id = ?').get(ol3.items[0].id);
  ok(item3.texto.includes('brunch aroma'), 'la pieza de reactivación nombra la estrella del fundamento');
  eq(series.serieParaToque(db, U4, 'T6').serie_nombre, 'Brunch Aroma · el boca a boca', 'serieParaToque T6 → serie de reseña/referido');
  eq(series.serieParaToque(db, U4, 'cierre_suave').serie_tipo, 'seguimiento', 'serieParaToque cierre_suave → seguimiento');
  eq(series.serieParaToque(db, U4, 'T9'), null, 'toque desconocido → null');
}

// ---------- F. negocio sin series: comportamiento actual intacto ----------
console.log('— F. sin series: fallback exacto al comportamiento de S4');
{
  const U5 = 5;
  venty.asegurarSemilla(db, U5);
  ok(!series.tieneSeries(db, U5), 'el negocio de fallback no tiene series generadas');
  eq(series.serieParaToque(db, U5, 'T1'), null, 'sin series, serieParaToque es null');
  const z = venty.crearZona(db, U5, { nombre: 'Zona Fallback', ciudad: 'prueba' });
  venty.crearLead(db, U5, { nombre: 'Local Fallback', zona_id: z.id, canal_preferido: 'instagram', contacto_ref: '@fallback', puntaje: 92, porque: 'prueba f5' });
  const ol = oleadas.prepararOleadaZona(db, U5, z.id, { piloto: 'prueba-f5', fecha: '2026-11-18' });
  eq(ol.items.length, 1, 'sin series la oleada prepara igual que en S4');
  ok(!('serie_nombre' in ol.items[0]), 'sin series el ítem devuelto no trae campos de serie');
  const itemDb = db.prepare('SELECT * FROM venty_s4_oleada_items WHERE id = ?').get(ol.items[0].id);
  eq(itemDb.tipo, 'T1', 'sin series el ítem es T1 como siempre');
  eq(itemDb.serie_nombre, '', 'sin series la columna serie_nombre queda vacía');
  const esperada = oleadas.textoPara({ nombre: 'Local Fallback', canal_preferido: 'instagram' }, 'T1', {});
  eq(itemDb.texto, esperada.texto, 'sin series el texto es exactamente el textoPara de S4');
  const jug = db.prepare('SELECT * FROM venty_jugadas WHERE id = ?').get(ol.items[0].jugada_id);
  const prop = JSON.parse(jug.propuesta_json);
  ok(!('serie_nombre' in prop), 'sin series la propuesta de bandeja es la de S4, sin campos nuevos');
  eq(prop.tipo_email, 'T1', 'sin series la propuesta sigue siendo T1');
  const v = oleadas.verificarSalida(db, U5, ol.oleada.id, {});
  ok(!v.puede_salir && v.bloqueos.some((b) => b.error === 'sin_espejo_aceptado'), 'sin series la puerta de espejo sigue igual');
}

console.log(`\n— venty-f5-series (unit): ${total - fails}/${total} OK, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
