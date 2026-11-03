// LOTE RUBRO-GARANTÍAS ×6 (construcción sin push, base v580 servida).
// Decisión Valentino 3/11 («dale, armemos todo»): que SIEMPRE se postee
// del rubro literal del cliente. Caso que lo motiva: un cliente que vende
// campos recibió posteos de flores. Se suma a lo ya construido (puerta
// fail-closed de rubro-literal, espejo, vetos y confirmación semanal de
// fundamento-literal) y NO lo reescribe.
// Las 6 piezas: (1) puerta en la generación misma, (2) «No es mi rubro»,
// (3) rubro visible en cada borrador, (4) dos fuentes o palabra del
// cliente, (5) temas genéricos borrados con fundamento, (6) rubro según
// su propio feed. Uso: node test-loterubrugarantias.js [dir]
const fs = require('fs');
const dir = process.argv[2] || '.';
const rg = require(dir + '/rubro-garantias.js');
const fl = require(dir + '/fundamento-literal.js');
const gen = require(dir + '/generator.js');
const genSrc = fs.readFileSync(dir + '/generator.js', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const chunk = fs.readFileSync(dir + '/public/chunk-analisis.js', 'utf8');
const dbjs = fs.readFileSync(dir + '/db.js', 'utf8');
let ok = 0, bad = 0;
function t(name, cond) { if (cond) { ok++; } else { bad++; console.log('FALLA: ' + name); } }
const cnt = (s, sub) => (s.split(sub).length - 1);
const PRODS = [{ nombre: 'campos', procedencia: 'bio' }, { nombre: 'chacras en venta', procedencia: 'web' }];

// ---------- PIEZA 1: PUERTA EN LA GENERACIÓN MISMA ----------
t('1 idea de campos calza con producto campos', (() => {
  const m = rg.productoDeIdea({ titulo: 'lote con vista: tu campo espera', angulo: '' }, PRODS);
  return m && m.nombre === 'campos';
})());
t('1 idea de flores NO calza con campos (revisión, nunca programada)', rg.productoDeIdea({ titulo: 'flores de estación para tu casa', angulo: '' }, PRODS) === null);
t('1 raíz: flor = flores, sin falso positivo en florecer', (() => {
  const a = rg.productoDeIdea({ titulo: 'ramo de flores frescas', angulo: '' }, [{ nombre: 'flores', procedencia: 'bio' }]);
  const b = rg.productoDeIdea({ titulo: 'tu negocio florece este mes', angulo: '' }, [{ nombre: 'flores', procedencia: 'bio' }]);
  return !!a && b === null;
})());
t('1 anotarIdeas: con producto -> _rgProducto, sin producto -> _rgSinProducto', (() => {
  const out = rg.anotarIdeas([{ titulo: 'tu campo espera' }, { titulo: 'flores de estación' }], PRODS);
  return out[0]._rgProducto && out[0]._rgProducto.nombre === 'campos' && out[1]._rgSinProducto === true && !out[1]._rgProducto;
})());
t('1 anotarIdeas: sin productos en el input no anota nada (caminos viejos intactos)', (() => {
  const out = rg.anotarIdeas([{ titulo: 'lo que sea' }], []);
  return !out[0]._rgProducto && !out[0]._rgSinProducto;
})());
t('1 servidor: semana e ideas-loop convierten _rgSinProducto en needs_review', srv.includes('idea._rgSinProducto ? 1 : 0') && srv.includes('rgSinProducto) ? 1 : 0'));
t('1 servidor: pipeline guarda rg_producto/rg_procedencia en los 5 inserts', cnt(srv, 'rg_producto, rg_procedencia') >= 5 && cnt(srv, 'rg_producto') >= 6);

// ---------- PIEZA 2: «NO ES MI RUBRO» ----------
t('2 endpoint no-es-mi-rubro existe: veta antes de generar y regenera desde producto real', srv.includes("app.post('/api/posts/:id/no-es-mi-rubro'") && srv.includes('fundamentoLiteral.agregarVeto(d.vetos, termino)') && srv.includes('regenDirectedDraft(uid, post, { title: cand.titulo'));
t('2 endpoint: publicado no se regenera, sin idea real el veto igual queda y se dice', srv.includes("Un posteo publicado no se regenera") && srv.includes('Vetado, pero no quedó una idea con producto real'));
t('2 cliente: botón No es mi rubro en la fila del veto (no sexto botón del menú)', (() => {
  const body = app.slice(app.indexOf('function apvMoreHTML'), app.indexOf('function pzApvMenuToggle'));
  return app.includes('id="apvNoRubroBtn"') && app.includes('No es mi rubro') && app.includes('Not my niche') && cnt(body, 'apv-sec-btn') === 5;
})());
t('2 cliente: el botón llama al endpoint (no al restyle de foto)', (() => {
  const bind = app.slice(app.indexOf("getElementById('apvNoRubroBtn')"), app.indexOf("getElementById('apvNoRubroBtn')") + 1200);
  return bind.includes('no-es-mi-rubro') && !bind.includes('hfRedoPost');
})());
t('2 regenDirectedDraft guarda rg_* del tema dirigido', srv.includes('rg_producto = ?, rg_procedencia = ?') && srv.includes('mm3 = rubroGarantias.productoDeIdea'));

// ---------- PIEZA 3: RUBRO VISIBLE ----------
t('3 línea con producto + procedencia ES/EN', rg.lineaRubro('campos', 'bio', 'es') === 'Este posteo es de: campos — visto en tu bio' && rg.lineaRubro('campos', 'feed', 'en') === 'This post is about: campos — seen in your own feed' && rg.lineaRubro('campos', 'cliente', 'es') === 'Este posteo es de: campos — visto en lo que escribiste');
t('3 línea sin producto: Sin producto asociado ES/EN', rg.lineaRubro(null, '', 'es') === 'Sin producto asociado' && rg.lineaRubro(null, '', 'en') === 'No product linked');
t('3 cliente: rgLineHTML en detalle del feed y en detalle de aprobación, solo draft/scheduled', app.includes('function rgLineHTML(p, en)') && cnt(app, 'rgLineHTML(p, en)') >= 3 && app.includes("if (st !== 'draft' && st !== 'scheduled') return '';"));
t('3 servidor: migración rg_producto/rg_procedencia en db.js', dbjs.includes('ADD COLUMN rg_producto') && dbjs.includes('ADD COLUMN rg_procedencia'));

// ---------- PIEZA 4: DOS FUENTES O PALABRA DEL CLIENTE ----------
t('4 una fuente débil -> hipótesis, nunca producto', (() => {
  const r = rg.clasificarFuentes({ link: [{ nombre: 'lotes' }] });
  return r.confirmados.length === 0 && r.hipotesis.length === 1 && r.hipotesis[0].fuentes[0] === 'link';
})());
t('4 dos fuentes distintas -> confirmado', (() => {
  const r = rg.clasificarFuentes({ bio: [{ nombre: 'lotes' }], web: [{ nombre: 'lotes' }] });
  return r.confirmados.length === 1 && r.confirmados[0].fuentes.length === 2 && r.hipotesis.length === 0;
})());
t('4 palabra del cliente -> confirmado siempre (una sola fuente)', (() => {
  const r = rg.clasificarFuentes({ cliente: ['campos'] });
  return r.confirmados.length === 1 && r.hipotesis.length === 0;
})());
t('4 servidor: link y foto van a hipótesis (no a productos directo)', srv.includes("rgAplicarSenal(d, p.nombre, 'link')") && srv.includes("rgAplicarSenal(d, v.producto.nombre, 'foto')") && srv.includes('function rgAplicarSenal'));
t('4 servidor: espejo aprobado promueve hipótesis (palabra del cliente) y hay ruta de confirmar', srv.includes('hipotesis: flHipotesis(d)') && srv.includes("app.post('/api/fundamento/hipotesis/confirmar'") && srv.includes('procedencia: h.fuentes[0]'));
t('4 cliente: la tira semanal muestra hipótesis con botón Confirmar', chunk.includes('anaFlConfirmarHipotesis') && chunk.includes('/api/fundamento/hipotesis/confirmar'));

// ---------- PIEZA 5: TEMAS GENÉRICOS BORRADOS ----------
t('5 con fundamento, el pool solo conserva ideas ancladas a un producto', (() => {
  const pool = [{ titulo: 'tu campo espera', angulo: '' }, { titulo: 'frases que motivan', angulo: 'motivación para emprender' }, { titulo: 'tips genéricos de instagram', angulo: '' }];
  const f = rg.filtrarGenericos(pool, PRODS);
  return f.length === 1 && f[0].titulo === 'tu campo espera';
})());
t('5 sin fundamento, el pool queda intacto (caso bloqueado por fail-closed aparte)', rg.filtrarGenericos([{ titulo: 'x' }], []).length === 1);
t('5 generador: templateIdeas ES y EN filtran con productos (piso 4, efeméride la ataja la puerta 1)', genSrc.includes('filtrarGenericos(pool, productos)') && genSrc.includes('productos });'));

// ---------- PIEZA 6: RUBRO SEGÚN SU PROPIO FEED ----------
t('6 temas del feed rankean por respuesta (likes + 3×comments)', (() => {
  const temas = rg.temasFeedPropio([
    { caption: 'nuestros campos al atardecer', likes: 10, comments: 2 },
    { caption: 'flores del jardín', likes: 1, comments: 0 },
  ]);
  return temas[0].palabra === 'campos' && temas[0].score === 16;
})());
t('6 sin engagement, usa frecuencia (nunca inventa engagement)', (() => {
  const temas = rg.temasFeedPropio([
    { caption: 'nuestros campos al atardecer', likes: 0, comments: 0 },
    { caption: 'los campos en invierno', likes: 0, comments: 0 },
    { caption: 'campos y cielo abierto', likes: 0, comments: 0 },
    { caption: 'flores del jardín', likes: 0, comments: 0 },
  ]);
  return temas[0].palabra === 'campos' && temas[0].menciones === 3 && temas[0].score === 0;
})());
t('6 reforzarConFeed marca feed solo en productos que calzan con el feed propio', (() => {
  const out = rg.reforzarConFeed([{ nombre: 'campos', fuentes: ['bio'] }, { nombre: 'lotes', fuentes: ['web'] }], [{ palabra: 'campos', score: 5, menciones: 1 }]);
  return out[0].fuentes.includes('feed') && !out[1].fuentes.includes('feed');
})());
t('6 servidor: ideasInputFor refuerza con el feed propio (publicados + métricas)', srv.includes('temasFeedPropio(feedRows)') && srv.includes('reforzarConFeed(conFuentes, temas)'));

// ---------- EN ESPEJO ----------
t('EN espejo: línea, botón y tira en inglés', app.includes('Not my niche') && app.includes('No product linked') && chunk.includes('Do you also sell this?'));

// ---------- ASYNC: generateIdeas anota la puerta ----------
// Con producto que calza, las 4 ideas del pool filtrado llevan
// _rgProducto (la pieza 5 ya quitó las genéricas). Con producto que no
// calza con nada, el piso 4 deja el pool intacto y la puerta (1) marca
// TODAS _rgSinProducto: en ningún caso se programa en silencio.
(async () => {
  let asyncOk = false;
  try {
    const a = await gen.generateIdeas({ business: 'Campo Sur', category: 'otro', dna: { productos: [{ nombre: 'campos' }] }, productos: PRODS, vetos: [] }, null);
    const b = await gen.generateIdeas({ business: 'Campo Sur', category: 'otro', dna: { productos: [{ nombre: 'campos' }] }, productos: [{ nombre: 'zzzzqq', procedencia: 'bio' }], vetos: [] }, null);
    asyncOk = Array.isArray(a) && a.length > 0 && a.every((i) => !!i._rgProducto)
      && Array.isArray(b) && b.length > 0 && b.every((i) => i._rgSinProducto === true);
  } catch (e) { asyncOk = false; }
  if (asyncOk) ok++; else { bad++; console.log('FALLA: 1 generateIdeas anota _rgProducto/_rgSinProducto (puerta final, no filtro)'); }
  console.log(`RUBRO-GARANTÍAS ×6: ${ok} OK, ${bad} FALLAS`);
  process.exit(bad ? 1 : 0);
})();
