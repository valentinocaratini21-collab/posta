// LOTE FUNDAMENTO-LITERAL x5 (construccion sin push, base v578 servida).
// Decision Valentino 3/11 («dale, arma todo»): saber EXACTAMENTE que
// vende cada cliente. Caso que lo motiva: un cliente que vende campos
// recibio posteos de flores porque Posty no capto su producto real.
// Doctrina: si no es literal lo que venden, el producto es malisimo.
// Las 5 piezas: (1) espejo antes de la semana, (2) foto como prueba,
// (3) conectar donde ya vende (v1, solo datos publicos), (4) «¿que
// vendes esta semana?» cada semana, (5) vetos permanentes.
// Se apoya en la puerta fail-closed de rubro-literal y NO la reescribe.
// Uso: node test-lotefundamentoliteral.js [dir]
const fs = require('fs');
const dir = process.argv[2] || '.';
const fl = require(dir + '/fundamento-literal.js');
const gen = fs.readFileSync(dir + '/generator.js', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const chunk = fs.readFileSync(dir + '/public/chunk-analisis.js', 'utf8');
const prueba = fs.readFileSync(dir + '/public/prueba.html', 'utf8');
const pruebaEn = fs.readFileSync(dir + '/public/en-prueba.html', 'utf8');
let ok = 0, bad = 0;
function t(name, cond) { if (cond) { ok++; } else { bad++; console.log('FALLA: ' + name); } }
const cnt = (s, sub) => (s.split(sub).length - 1);

// ---------- PIEZA 1: ESPEJO ----------
t('1 espejo: bio+web+cliente con procedencia, sin duplicados', (() => {
  const e = fl.construirEspejo({
    bio: [{ nombre: 'campos' }, { nombre: 'chacras' }],
    web: [{ nombre: 'campos' }, { nombre: 'lotes' }],
    cliente: ['campos', 'venta de campos'],
  });
  const noms = e.map((p) => p.nombre);
  return e.length === 4 && noms.includes('campos') && noms.includes('chacras')
    && noms.includes('lotes') && noms.includes('venta de campos')
    && e.find((p) => p.nombre === 'campos').procedencia === 'bio'
    && e.find((p) => p.nombre === 'lotes').procedencia === 'web';
})());
t('1 espejo: vacio sin productos', fl.construirEspejo({}).length === 0);
t('1 espejo: tope 8 productos', fl.construirEspejo({ bio: Array.from({ length: 12 }, (_, i) => ({ nombre: 'prod' + i })) }).length === 8);
t('1 correccion: lineas -> productos cliente, vacias fuera', (() => {
  const c = fl.parsearCorreccion('campos\n\nchacras en venta\n');
  return c.length === 2 && c[0].procedencia === 'cliente' && c[0].nombre === 'campos';
})());
t('1 correccion: linea larguisima (frase) no entra como producto', fl.parsearCorreccion('vendo campos hermosos en las afueras de la ciudad con vista al rio y mucho verde para disfrutar en familia').length === 0);
t('1 correccion: texto vacio -> []', fl.parsearCorreccion('   ').length === 0);
t('1 espejoFromFields: aprobado=1 + productos -> espejo', (() => {
  const e = fl.espejoFromFields({ espejo_flujo: '1', espejo_aprobado: '1', espejo_productos: JSON.stringify([{ nombre: 'campos', procedencia: 'bio' }]), espejo_vetos: JSON.stringify(['flores']) });
  return e && e.aprobado === true && e.productos.length === 1 && e.vetos[0] === 'flores';
})());
t('1 espejoFromFields: sin aprobar -> null (sin semana)', fl.espejoFromFields({ espejo_flujo: '1', espejo_aprobado: '0', espejo_productos: '[]' }) === null);
t('1 espejoFromFields: flujo viejo sin flag -> null (no afectado)', fl.espejoFromFields({}) === null);
t('1 espejoGoalLines: lineas con procedencia + veto', (() => {
  const ls = fl.espejoGoalLines({ espejo_flujo: '1', espejo_aprobado: '1', espejo_productos: JSON.stringify([{ nombre: 'campos', procedencia: 'bio' }]), espejo_vetos: JSON.stringify(['flores']) }, 'es');
  return ls.length === 2 && ls[0].includes('campos') && ls[1].includes('flores');
})());
t('1 server: gate espejo en generate', srv.includes("String(fields.espejo_flujo || '') === '1'") && srv.includes("Confirm the mirror first"));
t('1 server: gate espejo en generate-stream', cnt(srv, 'Confirm the mirror first') === 2);
t('1 server: gate espejo NO anidado dentro del gate OC (bug real de insercion, corregido)', srv.includes("Respondé las preguntas rápidas primero así tu semana sale a medida de tu negocio' });\n  }\n  // (FUNDAMENTO-LITERAL") && srv.includes("Respondé las preguntas rápidas primero así tu semana sale a medida de tu negocio');\n    return;\n  }\n  // (FUNDAMENTO-LITERAL"));
t('1 server: inyeccion espejo en ambas rutas', cnt(srv, 'espejoGoalLines(fields, lang)') === 2);
t('1 server: inyeccion stream NO anidada en webData (bug real, corregido)', srv.includes("webExtraPhotos = await trialWebPhotos(webData);\n      }\n    }\n    // (FUNDAMENTO-LITERAL"));
t('1 server: espejo en out (siembra al registrarse)', cnt(srv, 'fundamentoLiteral.espejoFromFields(fields)') === 2);
t('1 server: siembra digest+ADN en importTrialWeek', srv.includes('espejo_aprobado: 1') && srv.includes('dna0.productos = esp.productos.map'));
t('1 prueba ES: espejo con aprobar/corregir/foto/link', prueba.includes('screenEspejo') && prueba.includes('OC_ESPEJO') && prueba.includes('espejo_flujo') && prueba.includes('flFoto') && prueba.includes('flLink') && prueba.includes('armar mi semana'));
t('1 prueba EN: espejo espejo en ingles', pruebaEn.includes('screenEspejo') && pruebaEn.includes('OC_ESPEJO') && pruebaEn.includes('Looks good, build my week'));
t('1 prueba: sprout va al espejo; el setTimeout de generar queda solo en el aprobar', prueba.includes('screenEspejo();') && cnt(prueba, 'setTimeout(function () { runGeneration(); }, reduced ? 300 : 900);') === 1);

// ---------- PIEZA 2: FOTO COMO PRUEBA ----------
t('2 vision: producto concreto -> literal con foto', (() => {
  const v = fl.productoDesdeVision({ producto: 'sillón gris de tres cuerpos' });
  return !v.pendiente && v.producto.nombre === 'sillón gris de tres cuerpos' && v.producto.procedencia === 'foto';
})());
t('2 vision: null -> pendiente, nunca invento', fl.productoDesdeVision({ producto: null }).pendiente === true);
t('2 vision: palabra generica del set -> pendiente', fl.productoDesdeVision({ producto: 'productos' }).pendiente === true);
t('2 vision: palabra suelta no generica se acepta (el espejo es el gate humano)', (() => {
  const v = fl.productoDesdeVision({ producto: 'muebles' });
  return !v.pendiente && v.producto.procedencia === 'foto';
})());
t('2 vision: texto libre sin JSON -> pendiente', fl.productoDesdeVision({}).pendiente === true);
t('2 server: visionNombreProducto + rutas foto', srv.includes('function visionNombreProducto') && srv.includes("'/api/trial/foto-vision'") && srv.includes("'/api/fundamento/foto'"));
t('2 prueba: picker foto con mensaje de pendiente', prueba.includes("'/api/trial/foto-vision'") && prueba.includes('photoPend'));

// ---------- PIEZA 3: CONECTAR DONDE YA VENDE ----------
t('3 link: JSON-LD de producto -> productos con precio y procedencia link', (() => {
  const html = '<html><head><script type="application/ld+json">{"@type":"Product","name":"Curso de cerámica","offers":{"price":"40","priceCurrency":"USD"}}</script></head></html>';
  const ex = fl.extraerProductosDeLink(html, 'https://tienda.test/curso');
  return ex.productos.length === 1 && ex.productos[0].procedencia === 'link' && ex.productos[0].precio !== '' && ex.productos[0].nombre === 'Curso de cerámica';
})());
t('3 link: sin JSON-LD -> sin_datos', (() => {
  const ex = fl.extraerProductosDeLink('<html><body>hola</body></html>', 'https://tienda.test/');
  return ex.productos.length === 0 && ex.razon === 'sin_datos';
})());
t('3 link: sin HTML -> sin_datos', fl.extraerProductosDeLink(null, '').productos.length === 0);
t('3 server: rutas link + 422 honesto', srv.includes("'/api/trial/link'") && srv.includes("'/api/fundamento/link'") && srv.includes('No pudimos leer productos de ese link'));
t('3 prueba: input de link', prueba.includes("'/api/trial/link'") && prueba.includes('flLink'));

// ---------- PIEZA 4: CONFIRMACION SEMANAL ----------
t('4 edicion: cambia solo el producto nombrado, el resto intacto', (() => {
  const cur = [{ nombre: 'campos', precio: '', procedencia: 'bio' }, { nombre: 'chacras', precio: '', procedencia: 'bio' }];
  const out = fl.aplicarEdicionSemanal(cur, 'chacras en venta');
  return out.length === 2 && out[0].nombre === 'campos' && out[0].procedencia === 'bio' && out[1].nombre === 'chacras en venta' && out[1].procedencia === 'cliente';
})());
t('4 edicion: texto sin coincidencia se suma como producto nuevo (lo escribió el cliente)', (() => {
  const cur = [{ nombre: 'campos', precio: '', procedencia: 'bio' }];
  const out = fl.aplicarEdicionSemanal(cur, 'lotes');
  return out.length === 2 && out[1].nombre === 'lotes' && out[1].procedencia === 'cliente';
})());
t('4 edicion: vacia no cambia nada', (() => {
  const cur = [{ nombre: 'campos', precio: '', procedencia: 'bio' }];
  const out = fl.aplicarEdicionSemanal(cur, '   ');
  return out.length === 1 && out[0].nombre === 'campos';
})());
t('4 server: seguir=true no cambia nada, solo fecha', srv.includes("req.body && req.body.seguir") && srv.includes('semana_confirmada_at'));
t('4 chunk: tira solo carta actual (anaPastMode la excluye)', chunk.includes('anaFlConfirmLoad') && chunk.includes('anaFlBox') && chunk.includes("if (!anaPastMode) h += `<div class=\"ana-fl-confirm\""));
t('4 chunk: Sigue igual + editar', chunk.includes('Sigue igual') && chunk.includes('anaFlSeguir') && chunk.includes('anaFlEditar'));
t('5 chunk: vetos visibles y revocables en la confirmacion semanal', chunk.includes('anaFlQuitarVeto') && chunk.includes("method: 'DELETE'") && chunk.includes('Vetado (nunca se genera)'));

// ---------- PIEZA 5: VETOS PERMANENTES ----------
t('5 vetos: normalizar dedupea y baja', (() => {
  const v = fl.normalizarVetos([' Flores ', 'flores', 'FLORERO', '']);
  return v.length === 2 && v[0] === 'flores' && v[1] === 'florero';
})());
t('5 vetos: agregar y quitar', (() => {
  let v = fl.agregarVeto([], 'flores');
  v = fl.agregarVeto(v, 'flores');
  v = fl.quitarVeto(v, 'FLORES');
  return v.length === 0;
})());
t('5 vetos: idea vetada por titulo y por caption', fl.ideaVetada({ titulo: '3 flores para tu casa', caption: '' }, ['flores']) && fl.ideaVetada({ titulo: 'Oferta', caption: 'todo sobre flores hoy' }, ['flores']));
t('5 vetos: sin falso positivo (florecer no es flores)', !fl.ideaVetada({ titulo: 'El florecer del barrio', caption: '' }, ['flores']));
t('5 vetos: raiz singular/plural (flor = flores)', fl.ideaVetada({ titulo: 'Día de la Flor', caption: '' }, ['flores']));
t('5 vetos: sin vetos nada se bloquea', !fl.ideaVetada({ titulo: 'Flores', caption: '' }, []));
t('5 vetos: filtro saca vetadas y deja el resto', (() => {
  const ideas = [{ titulo: 'Flores de estación' }, { titulo: 'Campos en venta' }, { titulo: 'Tu chacra ideal' }];
  const out = fl.filtrarIdeasVetadas(ideas, ['flores']);
  return out.length === 2 && out[0].titulo === 'Campos en venta';
})());
t('5 vetos: lineaVetos con formato', fl.lineaVetos(['flores'], '').includes('flores'));
t('5 generator: post-filtro de vetos cableado', gen.includes('input.vetos') && gen.includes('filtrarIdeasVetadas(ideas, input.vetos)'));
t('5 generator: efemeride pasa por el mismo filtro (post-filtro final de generateIdeas)', gen.includes('filtrarIdeasVetadas(ideas'));
t('5 server: vetos en excludedTopicsLine (prompt+plantillas)', srv.includes('lineaVetos') && srv.includes('vetos permanentes del fundamento'));
t('5 server: vetos en ideasInputFor (post-filtro)', srv.includes('ideasInput.vetos = vs'));
t('5 server: vetos bloquean estacionalidad en los 3 caminos (sin cambiar la firma: se lee de profile.user_id)', srv.includes('function ephemerisFor(profile, pais)') && srv.includes('profile.user_id') && srv.includes("ideaVetada({ titulo: eph.name") && srv.includes('ephemeris: ephemerisFor(profile, adCountry(uid))') && srv.includes('albumMissionPick(getProfile(uid) || {}, weekKey, adCountry(uid))'));
t('5 server: rutas veto + espejo en ADN sobrevive a rebuild', srv.includes("'/api/fundamento/veto'") && srv.includes('digest.vetos = fundamentoLiteral.normalizarVetos(dna.vetos)'));
t('5 app: veto desde el posteo en revision', app.includes('apvVetoBtn') && app.includes('apvVetoInput') && app.includes("api.post('/api/fundamento/veto'"));
t('5 app: la fila de veto NO cuenta como boton secundario del menu (siguen siendo 5)', (() => {
  const i = app.indexOf('apv-veto-row');
  const row = i >= 0 ? app.slice(i, app.indexOf('`;', i)) : '';
  return row.includes('class="apv-veto-btn"') && !row.includes('apv-sec-btn');
})());
t('5 app: menu conserva Editar/Rechazar/Frenar/Eliminar/Rehacer', app.includes('id="apvEdit"') && app.includes('id="apvReject"') && app.includes('id="apvDelete"') && app.includes('id="apvRedo"'));

// ---------- REGLAS DURAS / CENSO ----------
t('sin credenciales ni logins en el lote (bloque fundamento)', (() => {
  const a = srv.indexOf('// ---------- FUNDAMENTO-LITERAL');
  const b = srv.indexOf('// ---------- Perfil del negocio', a);
  const block = (a >= 0 && b > a) ? srv.slice(a, b) : '';
  return block.length > 1000 && !/password|client_secret|oauth|credential/i.test(block);
})());
t('sin data/ en el arbol', (() => { try { return !fs.existsSync(dir + '/work/data'); } catch (e) { return true; } })());
t('censo server: catsMatch 3', cnt(srv, 'catsMatch') === 3);
t('censo server: week-redo 16', cnt(srv, 'week-redo') === 16);
t('censo server: first_week 3', cnt(srv, 'first_week') === 3);
t('censo server: /aprobar 17 (16 + ruta espejo/aprobar del lote, con causa)', cnt(srv, '/aprobar') === 17);
t('censo app: pzGoBack 6', cnt(app, 'pzGoBack') === 6);
t('censo app: pz-detalle-setup 1', cnt(app, 'pz-detalle-setup') === 1);
t('censo app: /aprobar 1', cnt(app, '/aprobar') === 1);
t('censo app: autofetch 0', cnt(app, 'autofetch') === 0);
t('censo app: pcDayKeyShift 7', cnt(app, 'pcDayKeyShift') === 7);
t('CHUNK_V v575 intacto en el arbol (el liberador lo bumpea por chunk-analisis)', app.includes("const CHUNK_V = '20261101-v575'"));

console.log(`LOTEFUNDAMENTOLITERAL: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
