// test-lote-venty-f1-fundamento.js — VENTY F1: fundamento automático desde
// lo publicado. Unitarias con DB en memoria (node:sqlite): extracción
// completa desde web simulada (salida de web-extract), extracción desde
// Instagram simulado, puente business_dna/client_digest, lectura vacía,
// productos sin precio, contradicción entre fuentes, zona ambigua,
// fundamento aceptado que nunca se pisa, aceptación por Bandeja, dedupe
// y voz de Venty (sin signos de apertura) en todas las jugadas.
// Uso: node test-lote-venty-f1-fundamento.js
'use strict';
const { DatabaseSync } = require('node:sqlite');
const venty = require('./venty');
const fa = require('./venty-fundamento-auto');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);
const sinApertura = (s) => !/[¿¡]/.test(String(s || ''));

const SITIO_CAFE = { ok: true, url: 'https://cafearoma.example', name: 'Café Aroma', description: 'café de especialidad y brunch en el centro, querés probar el flat white', services: [], productos: [{ nombre: 'Brunch Aroma para dos', precio: 24000 }, { nombre: 'Flat white', precio: 5500 }, { nombre: 'Café con leche', precio: 4800 }], city: 'CABA', palette: ['#7A4A21', '#E8D5B5'], photos: [], facts: { tone: 'vos', has_prices: true }, address: '', categoryHint: 'CafeOrCoffeeShop' };
const IG_PELU = { handle: 'peluqueria.luna', name: 'Peluquería Luna', bio: 'peluquería y color en Palermo, escribinos para tu turno', category: 'Hair Salon', productos: [{ nombre: 'Corte y brushing', precio: 18000 }, { nombre: 'Color completo', precio: 35000 }], ciudad: 'Palermo' };

function dbNueva() { const db = new DatabaseSync(':memory:'); venty.init(db); fa.ensureSchema(db); return db; }

(async () => {
  // ---------- A. Extracción completa desde web simulada ----------
  console.log('— A. web simulada: fundamento completo');
  {
    const db = dbNueva(); const UID = 11;
    const r = await fa.leerFundamentoAuto(db, UID, { sitio: SITIO_CAFE, saltarRed: true });
    ok(r.ok && r.lectura_id && r.jugada_id, 'lectura web: crea lectura y jugada');
    eq(r.tipo_jugada, 'fundamento_auto', 'lectura limpia: jugada fundamento_auto (borrador)');
    eq(r.fundamento.rubro, 'cafeteria', 'rubro desde la web (rubro-id + jsonld)');
    eq(r.fundamento.estrella, 'Brunch Aroma para dos', 'estrella: el producto estrella por nombre');
    eq(r.fundamento.precios.length, 3, 'oferta con nombre y precio publicados: 3 ítems');
    eq(r.fundamento.precios[0].precio, 24000, 'precio del brunch tal como se publicó');
    eq(r.fundamento.ciudad, 'CABA', 'zona/ciudad desde la web');
    ok(/voseo/.test(r.fundamento.tono), 'tono desde los facts de web-extract (vos)');
    eq(r.dudas.length, 0, 'lectura limpia: sin dudas');
    const bandeja = venty.listarBandeja(db, UID);
    eq(bandeja.length, 1, 'el borrador nace en la Bandeja');
    eq(bandeja[0].tipo, 'fundamento_auto', 'la jugada de Bandeja es el borrador');
    ok(sinApertura(bandeja[0].porque), 'voz de la jugada: sin signos de apertura');
    ok(venty.validarVoz(bandeja[0].porque).ok, 'voz de la jugada válida según venty.validarVoz');
    ok(!fa.hayAceptado(db, UID), 'antes de aceptar no hay fundamento aceptado F1');
    ok(!venty.leerFundamento(db, UID), 'el borrador no escribe el fundamento vigente');
    const dup = await fa.leerFundamentoAuto(db, UID, { sitio: SITIO_CAFE, saltarRed: true });
    ok(dup.duplicada && dup.jugada_id === r.jugada_id, 'misma lectura repetida: dedupe, no duplica la jugada');
    eq(venty.listarBandeja(db, UID).length, 1, 'bandeja sigue con 1 jugada tras el dedupe');
  }

  // ---------- B. Extracción desde Instagram simulado ----------
  console.log('— B. instagram simulado: fundamento desde el perfil');
  {
    const db = dbNueva(); const UID = 12;
    const r = await fa.leerFundamentoAuto(db, UID, { perfilInstagram: IG_PELU, saltarRed: true });
    ok(r.ok, 'lectura IG: ok');
    eq(r.tipo_jugada, 'fundamento_auto', 'lectura IG limpia: borrador');
    eq(r.fundamento.rubro, 'belleza', 'rubro desde bio/categoría/handle de IG');
    eq(r.fundamento.precios.length, 2, 'oferta de IG con nombre y precio: 2 ítems');
    eq(r.fundamento.estrella, 'Corte y brushing', 'estrella desde IG por nombre');
    eq(r.fundamento.zona, 'Palermo', 'zona desde IG');
    ok(r.fundamento.fuentes.includes('instagram'), 'la fuente instagram queda registrada');
  }

  // ---------- C. Puente business_dna / client_digest ----------
  console.log('— C. puente Posty: dna + digest guardados');
  {
    const db = dbNueva(); const UID = 13;
    db.exec(`CREATE TABLE IF NOT EXISTS business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT '')`);
    db.exec(`CREATE TABLE IF NOT EXISTS client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT NOT NULL DEFAULT '{}', hash TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT '')`);
    db.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)`).run(UID, JSON.stringify({ website_url: 'https://cafearoma.example', productos: [{ nombre: 'Brunch Aroma para dos', precio: 24000 }], producto_estrella: 'Brunch Aroma para dos', ubicacion: 'CABA' }));
    db.prepare(`INSERT INTO client_digest (user_id, digest_json) VALUES (?, ?)`).run(UID, JSON.stringify({ business: 'Café Aroma', ciudad: 'CABA', paleta: [{ hex: '#7A4A21', rol: 'principal' }], productos: [{ nombre: 'Brunch Aroma para dos', precio: 24000 }, { nombre: 'Flat white', precio: 5500 }] }));
    const r = await fa.leerFundamentoAuto(db, UID, { saltarRed: true });
    ok(r.ok, 'lectura desde el puente: ok');
    ok(r.fundamento.precios.some((p) => p.item === 'Flat white' && p.precio === 5500), 'el digest aporta oferta con precio');
    eq(r.fundamento.estrella, 'Brunch Aroma para dos', 'la estrella del dna manda por nombre');
    eq(r.fundamento.website_url, 'https://cafearoma.example', 'website_url desde el puente');
  }

  // ---------- D. Lectura vacía: jugada con la duda de ESE negocio ----------
  console.log('— D. lectura vacía');
  {
    const db = dbNueva(); const UID = 14;
    const r = await fa.leerFundamentoAuto(db, UID, { sitio: { ok: true, url: 'https://vacio.example', name: '', description: '', services: [], city: '', palette: [], categoryHint: '', facts: {} }, saltarRed: true });
    eq(r.tipo_jugada, 'fundamento_duda', 'lectura vacía: jugada de duda, no borrador limpio');
    ok(r.dudas.some((d) => d.tipo === 'lectura_vacia'), 'la duda es lectura_vacia');
    const j = venty.listarBandeja(db, UID)[0];
    ok(j && /volvió vacía/.test(j.porque), 'la jugada dice que la lectura volvió vacía');
    ok(sinApertura(j.porque), 'voz de la duda: sin signos de apertura');
    const acc = fa.aceptarLectura(db, UID, r.lectura_id, {});
    ok(!acc.ok && acc.error === 'lectura_con_dudas', 'una lectura con dudas no se acepta a ciegas');
  }

  // ---------- E. Productos sin precio ----------
  console.log('— E. oferta con nombre y sin precio publicado');
  {
    const db = dbNueva(); const UID = 15;
    const sitio = { ...SITIO_CAFE, productos: undefined, services: ['Brunch Aroma para dos', 'Flat white'], facts: { tone: 'vos', has_prices: false } };
    const r = await fa.leerFundamentoAuto(db, UID, { sitio, saltarRed: true });
    eq(r.tipo_jugada, 'fundamento_duda', 'sin precios: jugada de duda');
    const d = r.dudas.find((x) => x.tipo === 'productos_sin_precio');
    ok(d && d.items.includes('Brunch Aroma para dos'), 'la duda nombra los productos reales del negocio');
    const j = venty.listarBandeja(db, UID)[0];
    ok(/Brunch Aroma para dos/.test(j.porque) && /precios/.test(j.porque), 'la jugada pide los precios nombrando la oferta real');
    ok(sinApertura(j.porque), 'voz: sin signos de apertura');
  }

  // ---------- F. Contradicción entre fuentes ----------
  console.log('— F. contradicción web vs instagram y zona ambigua');
  {
    const db = dbNueva(); const UID = 16;
    const r = await fa.leerFundamentoAuto(db, UID, {
      sitio: { ok: true, url: 'https://mix.example', name: 'Mix', description: 'café y brunch', services: [], productos: [{ nombre: 'Brunch para dos', precio: 24000 }], city: 'CABA', palette: [], categoryHint: 'CafeOrCoffeeShop', facts: {} },
      perfilInstagram: { handle: 'mixfit', name: 'Mix Fit', bio: 'gimnasio y entrenamiento funcional, musculación y crossfit', category: 'Gym', productos: [{ nombre: 'Pase mensual gimnasio', precio: 30000 }], ciudad: 'CABA' },
      saltarRed: true,
    });
    eq(r.tipo_jugada, 'fundamento_duda', 'rubros en conflicto: jugada de duda');
    const d = r.dudas.find((x) => x.tipo === 'rubro_fuentes');
    ok(d && d.candidatas.length === 2, 'la duda trae las dos candidatas reales');
    ok(d.candidatas.some((c) => c.rubro === 'cafeteria') && d.candidatas.some((c) => c.rubro === 'fitness'), 'candidatas: cafeteria (web) y fitness (instagram)');
    eq(r.fundamento.rubro, '', 'con contradicción el rubro no se firma');
    const j = venty.listarBandeja(db, UID)[0];
    ok(/cafeteria/.test(j.porque) && /fitness/.test(j.porque), 'la jugada nombra ambas candidatas del negocio');
    ok(sinApertura(j.porque), 'voz: sin signos de apertura');

    const db2 = dbNueva(); const UID2 = 17;
    const r2 = await fa.leerFundamentoAuto(db2, UID2, {
      sitio: SITIO_CAFE,
      perfilInstagram: { handle: 'cafearoma.rosario', bio: 'café de especialidad, brunch y flat white', productos: [{ nombre: 'Brunch Aroma para dos', precio: 24000 }], ciudad: 'Rosario' },
      saltarRed: true,
    });
    eq(r2.tipo_jugada, 'fundamento_duda', 'zonas distintas: jugada de duda');
    const dz = r2.dudas.find((x) => x.tipo === 'zona_ambigua');
    ok(dz && dz.candidatas.includes('CABA') && dz.candidatas.includes('Rosario'), 'la duda de zona trae las zonas reales publicadas');
  }

  // ---------- G. Aceptado existente: nunca se pisa ----------
  console.log('— G. fundamento aceptado: actualización con diff, sin pisar');
  {
    const db = dbNueva(); const UID = 18;
    const a = await fa.leerFundamentoAuto(db, UID, { sitio: SITIO_CAFE, saltarRed: true });
    const viaBandeja = venty.resolverJugada(db, UID, a.jugada_id, 'aceptar', '');
    ok(viaBandeja.ok && viaBandeja.estado === 'aceptada', 'aceptar en Bandeja aplica el borrador (delegación F1)');
    const f1 = venty.leerFundamento(db, UID);
    ok(f1 && f1.rubro === 'cafeteria' && f1.precios.length === 3, 'el fundamento vigente es el aceptado');
    ok(fa.hayAceptado(db, UID), 'snapshot de aceptado registrado');
    const sitioNuevo = { ...SITIO_CAFE, productos: [{ nombre: 'Brunch Aroma para dos', precio: 26000 }, { nombre: 'Flat white', precio: 5500 }, { nombre: 'Café con leche', precio: 4800 }, { nombre: 'Torta del día', precio: 6800 }] };
    const b = await fa.leerFundamentoAuto(db, UID, { sitio: sitioNuevo, saltarRed: true });
    eq(b.tipo_jugada, 'fundamento_actualizacion', 'con aceptado previo: jugada de actualización');
    ok(b.diff.some((x) => x.campo === 'precio' && x.item === 'Brunch Aroma para dos' && x.antes === 24000 && x.despues === 26000), 'el diff trae el cambio de precio');
    ok(b.diff.some((x) => x.campo === 'oferta_nueva' && x.item === 'Torta del día'), 'el diff trae la oferta nueva por nombre');
    const f2 = venty.leerFundamento(db, UID);
    eq(f2.precios.find((p) => p.item === 'Brunch Aroma para dos').precio, 24000, 'el aceptado NO se pisó: el precio vigente sigue 24000');
    const j = venty.listarBandeja(db, UID).find((x) => x.tipo === 'fundamento_actualizacion');
    ok(j && /no se tocó/.test(j.porque), 'la jugada de actualización avisa que el fundamento no se tocó');
    ok(sinApertura(j.porque), 'voz: sin signos de apertura');
    const acc2 = venty.resolverJugada(db, UID, b.jugada_id, 'aceptar', '');
    ok(acc2.ok, 'aceptar la actualización: ok');
    eq(venty.leerFundamento(db, UID).precios.find((p) => p.item === 'Brunch Aroma para dos').precio, 26000, 'tras aceptar, el precio nuevo sí aplica');
    // Rechazo: la lectura siguiente rechazada no toca el fundamento.
    const c = await fa.leerFundamentoAuto(db, UID, { sitio: { ...SITIO_CAFE, city: 'Rosario', zona: 'Rosario' }, saltarRed: true });
    const rec = venty.resolverJugada(db, UID, c.jugada_id, 'rechazar', 'esa zona no');
    ok(rec.ok && rec.estado === 'rechazada', 'rechazar la jugada F1 por Bandeja: ok');
    eq(venty.leerFundamento(db, UID).ciudad, 'CABA', 'tras el rechazo, el fundamento sigue como estaba');
  }

  // ---------- H. Disparador por conexión ----------
  console.log('— H. disparador alConectarFuente');
  {
    const db = dbNueva(); const UID = 19;
    const malo = await fa.alConectarFuente(db, UID, 'whatsapp', {});
    ok(!malo.ok && malo.error === 'canal_sin_lectura', 'canal sin lectura de fundamento: error honesto');
    const r = await fa.alConectarFuente(db, UID, 'web', { sitio: SITIO_CAFE, saltarRed: true });
    ok(r.ok && r.tipo_jugada === 'fundamento_auto', 'conectar web dispara la lectura');
    eq(db.prepare(`SELECT disparador FROM venty_fundamento_auto WHERE user_id = ?`).get(UID).disparador, 'conexion_web', 'el disparador queda registrado');
    const sinDatos = await fa.alConectarFuente(db, 999, 'instagram', { saltarRed: true, soloSiHayDatos: true });
    ok(!sinDatos.ok && sinDatos.omitida, 'instagram sin datos guardados: se omite sin crear ruido');
  }

  // ---------- I. Voz en todos los textos ----------
  console.log('— I. voz de Venty en todas las jugadas del módulo');
  {
    const db = dbNueva();
    for (const tipo of fa.TIPOS_JUGADA) {
      const t = fa.textoJugada(tipo, { nombre_negocio: 'Café Aroma', rubro: 'cafeteria', estrella: 'Brunch Aroma para dos', precios: [{ item: 'Brunch Aroma para dos', precio: 24000 }] }, [{ tipo: 'rubro', candidatas: [{ rubro: 'cafeteria' }, { rubro: 'fitness' }] }], [{ campo: 'rubro', despues: 'cafeteria' }]);
      ok(sinApertura(t) && venty.validarVoz(t).ok, `texto de ${tipo}: voz válida, sin signos de apertura`);
    }
  }

  console.log(`\n— venty-f1-fundamento (unit): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
