// test-lote-ads-publico.js — LOTE ADS-PÚBLICO (orden de Valentino
// 17/11: las preguntas del público «están mal porque yo no tengo un
// local» — preguntas generales para todo tipo de negocio).
//
// Cubre ads-audiencia.js con Meta mockeado:
// (a) fundamento online (ciudad «Online») → alcance default 'pais',
//     textoHumano SIN «tu local» y SIN «Online»;
// (b) fundamento con ciudad real → alcance 'cerca' y texto con radio;
// (c) validarAudiencia: acepta cada alcance y rechaza alcance fuera
//     de opciones; radio inválido con alcance=pais NO invalida;
//     radio inválido con alcance=cerca SÍ invalida;
// (d) resolverTargeting por alcance: cerca=custom_locations con
//     radio · ciudad=cities sin radio · pais=countries ·
//     todos=regions si el mock resuelve Worldwide, y si no, fallback
//     declarado a countries;
// (e) objetivo 'seguir': válido, etiqueta ES/EN y mapeo de
//     engagement; objetivo fuera de lista rechazado; el objetivo
//     elegido viaja y manda sobre el de la propuesta;
// (f) textoHumano en los 4 alcances × ES/EN.
// Uso: node test-lote-ads-publico.js
'use strict';

const A = require('./ads-audiencia.js');

let ok = 0, mal = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('ok  -', nombre); }
  else { mal++; console.log('MAL -', nombre, detalle != null ? ':: ' + JSON.stringify(detalle) : ''); }
}

// Meta mockeado: intereses resuelven siempre; el geo resuelve según
// el escenario (ciudades con coordenadas; Worldwide solo si el
// escenario lo habilita).
function metaMock({ worldwide = false } = {}) {
  return {
    async searchInterestId(nombre) { return { id: 'id-' + nombre, name: nombre }; },
    async searchGeo(q) {
      if (q === 'Worldwide') return worldwide ? { key: 'WW1', name: 'Worldwide', latitude: null, longitude: null } : null;
      return { key: 'city-' + q, name: q, latitude: -32.95, longitude: -60.64 };
    },
    async findLookalikeAudienceId() { return null; },
  };
}

(async () => {
  // ── (a) Fundamento online ──────────────────────────────────────
  const fundOnline = {
    categoria: 'servicios', ciudad: 'Online', pais: 'AR', lang: 'es',
    clienteIdeal: 'Negocios que venden por Instagram y necesitan un community manager',
    audienciaTexto: '', cta: 'escribirte',
  };
  const pOnline = A.propuestaDesdeFundamento(fundOnline);
  check('a1 online: alcance default pais', pOnline.audiencia.alcance === 'pais', pOnline.audiencia.alcance);
  check('a2 online: geo.ciudad vacía (nunca «Online» como lugar)', pOnline.geo.ciudad === '', pOnline.geo);
  check('a3 online: texto sin «tu local»', !/tu local/.test(pOnline.texto), pOnline.texto);
  check('a4 online: texto sin «Online»', !/Online/.test(pOnline.texto), pOnline.texto);
  check('a5 online: comprador_texto es la frase del fundamento', pOnline.comprador_texto === fundOnline.clienteIdeal, pOnline.comprador_texto);
  check('a6 online: opciones.alcances completas', JSON.stringify(pOnline.opciones.alcances) === JSON.stringify(['cerca', 'ciudad', 'pais', 'todos']), pOnline.opciones.alcances);
  for (const mala of ['Online', 'online', 'remoto', 'Remoto', '—', '-', '', '   ', 'en línea', 'virtual', 'sin ciudad']) {
    check('a7 esCiudadReal rechaza ' + JSON.stringify(mala), A.esCiudadReal(mala) === false);
  }

  // ── (b) Fundamento con ciudad real ─────────────────────────────
  const pLocal = A.propuestaDesdeFundamento({ categoria: 'cafeteria', ciudad: 'Rosario', pais: 'AR', lang: 'es' });
  check('b1 local: alcance default cerca', pLocal.audiencia.alcance === 'cerca', pLocal.audiencia.alcance);
  check('b2 local: texto con radio y ciudad', /a 5 km de tu local en Rosario/.test(pLocal.texto), pLocal.texto);
  check('b3 local: geo.ciudad es la real', pLocal.geo.ciudad === 'Rosario', pLocal.geo);
  check('b4 esCiudadReal acepta Rosario', A.esCiudadReal('Rosario') === true);
  check('b5 comprador por respaldo de rubro (sin frase del fundamento)', /Personas a las que les gusta/.test(pLocal.comprador_texto), pLocal.comprador_texto);

  // ── (c) validarAudiencia ───────────────────────────────────────
  const baseValida = (extra) => ({
    radio_km: 5, edad_min: 25, edad_max: 44, genero: 'todos',
    intereses: pLocal.audiencia.intereses.map((i) => ({ ...i })), parecidos: true, ...(extra || {}),
  });
  for (const alc of ['cerca', 'ciudad', 'pais', 'todos']) {
    const v = A.validarAudiencia(baseValida({ alcance: alc }), pLocal);
    check('c1 validar acepta alcance ' + alc, v.ok === true && v.audiencia.alcance === alc, v);
  }
  const vFuera = A.validarAudiencia(baseValida({ alcance: 'barrio' }), pLocal);
  check('c2 alcance fuera de opciones rechazado', vFuera.ok === false && vFuera.detalle === 'alcance_fuera_de_opciones', vFuera);
  const vRadioPais = A.validarAudiencia(baseValida({ alcance: 'pais', radio_km: 99 }), pLocal);
  check('c3 radio inválido con alcance=pais NO invalida (se normaliza)', vRadioPais.ok === true && A.RADIOS_KM.includes(vRadioPais.audiencia.radio_km), vRadioPais);
  const vRadioCerca = A.validarAudiencia(baseValida({ alcance: 'cerca', radio_km: 99 }), pLocal);
  check('c4 radio inválido con alcance=cerca SÍ invalida', vRadioCerca.ok === false && vRadioCerca.detalle === 'radio_fuera_de_opciones', vRadioCerca);
  const audOnlineSinAlc = JSON.parse(JSON.stringify(pOnline.audiencia));
  delete audOnlineSinAlc.alcance;
  const vSinAlc = A.validarAudiencia(audOnlineSinAlc, pOnline);
  check('c5 sin alcance en el payload manda el de la propuesta', vSinAlc.ok === true && vSinAlc.audiencia.alcance === 'pais', vSinAlc);
  const vRadioOnline = A.validarAudiencia({ radio_km: 5, alcance: 'cerca', edad_min: 35, edad_max: 54, genero: 'todos', intereses: [], parecidos: false }, pOnline);
  check('c6 la propuesta por defecto pasa su propia validación (invariante)', A.validarAudiencia(JSON.parse(JSON.stringify(pLocal.audiencia)), pLocal).ok === true
    && A.validarAudiencia(JSON.parse(JSON.stringify(pOnline.audiencia)), pOnline).ok === true, vRadioOnline);

  // ── (d) resolverTargeting por alcance ──────────────────────────
  const audDe = (prop, extra) => ({ ...JSON.parse(JSON.stringify(prop.audiencia)), ...(extra || {}) });
  const rCerca = await A.resolverTargeting(audDe(pLocal, { alcance: 'cerca' }), pLocal, metaMock());
  check('d1 cerca: custom_locations con radio 5', !!(rCerca.targeting.geo_locations.custom_locations && rCerca.targeting.geo_locations.custom_locations[0].radius === 5), rCerca.targeting.geo_locations);
  check('d1b cerca: geo_modo radio', rCerca.resuelto.geo_modo === 'radio', rCerca.resuelto);
  const rCiudad = await A.resolverTargeting(audDe(pLocal, { alcance: 'ciudad' }), pLocal, metaMock());
  check('d2 ciudad: cities con key y SIN radio', !!(rCiudad.targeting.geo_locations.cities && rCiudad.targeting.geo_locations.cities[0].key === 'city-Rosario' && rCiudad.targeting.geo_locations.cities[0].radius === undefined), rCiudad.targeting.geo_locations);
  check('d2b ciudad: geo_modo ciudad', rCiudad.resuelto.geo_modo === 'ciudad', rCiudad.resuelto);
  const rPais = await A.resolverTargeting(audDe(pLocal, { alcance: 'pais' }), pLocal, metaMock());
  check('d3 pais: countries [AR]', JSON.stringify(rPais.targeting.geo_locations) === JSON.stringify({ countries: ['AR'] }), rPais.targeting.geo_locations);
  check('d3b pais: geo_modo pais', rPais.resuelto.geo_modo === 'pais', rPais.resuelto);
  const rTodos = await A.resolverTargeting(audDe(pOnline, { alcance: 'todos' }), pOnline, metaMock({ worldwide: true }));
  check('d4 todos con Worldwide resuelto: regions', !!(rTodos.targeting.geo_locations.regions && rTodos.targeting.geo_locations.regions[0].key === 'WW1'), rTodos.targeting.geo_locations);
  check('d4b todos: geo_modo todos', rTodos.resuelto.geo_modo === 'todos', rTodos.resuelto);
  const rTodosSin = await A.resolverTargeting(audDe(pOnline, { alcance: 'todos' }), pOnline, metaMock({ worldwide: false }));
  check('d5 todos sin resolver: fallback a countries', JSON.stringify(rTodosSin.targeting.geo_locations) === JSON.stringify({ countries: ['AR'] }), rTodosSin.targeting.geo_locations);
  check('d5b todos sin resolver: fallback DECLARADO en resuelto', rTodosSin.resuelto.geo_modo === 'pais' && rTodosSin.resuelto.geo_fallback === 'todos_sin_resolver', rTodosSin.resuelto);
  const rOnlineCerca = await A.resolverTargeting(audDe(pOnline, { alcance: 'cerca' }), pOnline, metaMock());
  check('d6 online con alcance=cerca: jamás geocodifica «Online» (cae a país declarado)', JSON.stringify(rOnlineCerca.targeting.geo_locations) === JSON.stringify({ countries: ['AR'] }) && rOnlineCerca.resuelto.geo_fallback === 'cerca_sin_ciudad_resuelta', rOnlineCerca);
  const rLegado = await A.resolverTargeting({ radio_km: 5, edad_min: 25, edad_max: 44, genero: 'todos', intereses: [], parecidos: false }, pLocal, metaMock());
  check('d7 audiencia legada sin alcance + ciudad real: comportamiento histórico (radio)', rLegado.resuelto.geo_modo === 'radio', rLegado.resuelto);

  // ── (e) objetivo 'seguir' ──────────────────────────────────────
  check('e1 seguir está en OBJETIVOS', A.OBJETIVOS.includes('seguir'), A.OBJETIVOS);
  const etSeguir = (pOnline.opciones.objetivos || []).find((o) => o.valor === 'seguir');
  check('e2 etiqueta ES «Que me sigan» en las opciones', !!etSeguir && etSeguir.etiqueta === 'Que me sigan', pOnline.opciones.objetivos);
  const pEn = A.propuestaDesdeFundamento({ ...fundOnline, lang: 'en' });
  const etSeguirEn = (pEn.opciones.objetivos || []).find((o) => o.valor === 'seguir');
  check('e3 etiqueta EN del objetivo seguir', !!etSeguirEn && etSeguirEn.etiqueta === 'Get followers', pEn.opciones.objetivos);
  const mapSeguir = A.mapeoMeta('seguir');
  check('e4 seguir mapea a engagement honesto (OUTCOME_ENGAGEMENT + POST_ENGAGEMENT)', mapSeguir.campaignObjective === 'OUTCOME_ENGAGEMENT' && mapSeguir.optimizationGoal === 'POST_ENGAGEMENT' && mapSeguir.medicion === 'clics', mapSeguir);
  const vSeguir = A.validarAudiencia({ ...audDe(pOnline), objetivo: 'seguir' }, pOnline);
  check('e5 validarAudiencia acepta objetivo seguir y lo devuelve', vSeguir.ok === true && vSeguir.objetivo === 'seguir', vSeguir);
  const vObjMalo = A.validarAudiencia({ ...audDe(pOnline), objetivo: 'vender_mas' }, pOnline);
  check('e6 objetivo fuera de lista rechazado', vObjMalo.ok === false && vObjMalo.detalle === 'objetivo_fuera_de_opciones', vObjMalo);
  const vObjPropuesta = A.validarAudiencia(audDe(pOnline), pOnline);
  check('e7 sin objetivo en el payload manda el de la propuesta (escribirte)', vObjPropuesta.ok === true && vObjPropuesta.objetivo === 'escribirte', vObjPropuesta);
  const vObjManda = A.validarAudiencia({ ...audDe(pOnline), objetivo: 'comprar' }, pOnline);
  check('e8 el objetivo elegido MANDA sobre el de la propuesta', vObjManda.ok === true && vObjManda.objetivo === 'comprar', vObjManda);
  check('e9 objetivoDesdeFundamento: cta seguirme → seguir', A.objetivoDesdeFundamento({ cta: 'seguirme' }).objetivo === 'seguir');

  // ── (f) textoHumano: 4 alcances × ES/EN ────────────────────────
  const textoCon = (prop, alcance, lang) => A.textoHumano({ ...prop, audiencia: { ...prop.audiencia, alcance } }, lang);
  check('f1 cerca ES', /a 5 km de tu local en Rosario/.test(textoCon(pLocal, 'cerca', 'es')), textoCon(pLocal, 'cerca', 'es'));
  check('f2 cerca EN', /within 5 km of your spot in Rosario/.test(textoCon(pLocal, 'cerca', 'en')), textoCon(pLocal, 'cerca', 'en'));
  check('f3 ciudad ES', /· en Rosario ·/.test(textoCon(pLocal, 'ciudad', 'es') + ' ·') || /en Rosario/.test(textoCon(pLocal, 'ciudad', 'es')), textoCon(pLocal, 'ciudad', 'es'));
  check('f4 ciudad EN', /in Rosario/.test(textoCon(pLocal, 'ciudad', 'en')), textoCon(pLocal, 'ciudad', 'en'));
  check('f5 pais ES', /en todo el país/.test(textoCon(pLocal, 'pais', 'es')), textoCon(pLocal, 'pais', 'es'));
  check('f6 pais EN', /all over the country/.test(textoCon(pLocal, 'pais', 'en')), textoCon(pLocal, 'pais', 'en'));
  check('f7 todos ES', /en todos lados/.test(textoCon(pLocal, 'todos', 'es')), textoCon(pLocal, 'todos', 'es'));
  check('f8 todos EN', /everywhere/.test(textoCon(pLocal, 'todos', 'en')), textoCon(pLocal, 'todos', 'en'));
  check('f9 ningún alcance dice «tu local» salvo cerca', ['ciudad', 'pais', 'todos'].every((alc) => !/tu local/.test(textoCon(pLocal, alc, 'es'))));
  check('f10 cerca sin ciudad real cae a la línea de país (honesto)', /en todo el país/.test(textoCon(pOnline, 'cerca', 'es')), textoCon(pOnline, 'cerca', 'es'));

  // ── (g) La tarjeta del cliente (public/app.js en VM) ───────────
  // Se extraen las funciones reales de la tarjeta y se rinden con la
  // propuesta real del módulo: la estructura de 4 preguntas, el
  // radio solo con alcance=cerca y el espejo del resumen.
  {
    const fs = require('fs');
    const vm = require('vm');
    const src = fs.readFileSync(require('path').join(__dirname, 'public', 'app.js'), 'utf8');
    const i0 = src.indexOf('const PZ_AUD_CHIP');
    const i1 = src.indexOf('function pzAdsAudienciaPintar');
    check('g0 se extrajo el bloque de la tarjeta de app.js', i0 > 0 && i1 > i0, { i0, i1 });
    const ctx = {
      console,
      ME: { lang: 'es' },
      pzBoostState: null,
      esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    };
    vm.createContext(ctx);
    vm.runInContext(src.slice(i0, i1), ctx);
    const pintar = (prop, selExtra, objetivo) => {
      ctx.pzBoostState = {
        audienciaProp: prop,
        audienciaSel: { ...JSON.parse(JSON.stringify(prop.audiencia)), ...(selExtra || {}) },
        audienciaObjetivo: objetivo,
        chipExtra: null,
      };
      return vm.runInContext('pzAdsAudienciaHTML()', ctx);
    };
    const htmlOnline = pintar(pOnline, {}, undefined);
    check('g1 tarjeta online: pregunta 1 con la frase del comprador', htmlOnline.includes('¿QUIÉN TE COMPRA?') && htmlOnline.includes('necesitan un community manager'), htmlOnline.slice(0, 200));
    check('g2 tarjeta online (alcance pais): NO hay sección de distancia', !htmlOnline.includes('DISTANCIA A TU LOCAL'));
    check('g3 tarjeta online: pregunta 2 con los 4 alcances', htmlOnline.includes('¿DÓNDE ESTÁN?') && htmlOnline.includes('Cerca de mi negocio') && htmlOnline.includes('En todos lados'));
    check('g4 tarjeta online: pregunta 3 con chips de objetivo (incluye «Que me sigan») y sin línea fija «Objetivo:»', htmlOnline.includes('¿QUÉ QUERÉS QUE HAGAN?') && htmlOnline.includes('Que me sigan') && !htmlOnline.includes('Objetivo: '));
    check('g5 tarjeta online: ajustes finos presentes (edades, quiénes, parecidos)', htmlOnline.includes('EDADES') && htmlOnline.includes('QUIÉNES') && htmlOnline.includes('PARECIDO A TUS SEGUIDORES'));
    const htmlLocal = pintar(pLocal, {}, undefined);
    check('g6 tarjeta local (alcance cerca): el radio SÍ aparece', htmlLocal.includes('DISTANCIA A TU LOCAL') && htmlLocal.includes('A 5 km'));
    const htmlTodos = pintar(pOnline, { alcance: 'todos' }, 'seguir');
    check('g7 resumen espejo con alcance=todos dice «en todos lados»', /en todos lados/.test(vm.runInContext('pzAdsAudienciaTexto(pzBoostState.audienciaSel)', ctx)));
    check('g8 resumen espejo con alcance=pais no dice «tu local»', !/tu local/.test(pintar(pOnline, {}, undefined) && vm.runInContext('pzAdsAudienciaTexto(pzBoostState.audienciaSel)', ctx)));
    ctx.ME = { lang: 'en' };
    const htmlEn = pintar(pEn, {}, undefined);
    check('g9 tarjeta EN: WHO BUYS FROM YOU? + chip Get followers', htmlEn.includes('WHO BUYS FROM YOU?') && htmlEn.includes('Get followers'));
    ctx.ME = { lang: 'es' };
  }

  console.log(`\n${ok} ok / ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
