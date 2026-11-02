// LOTE POSTY APRENDE — test sin IA real (key null o fetch mockeado: cero gasto).
// Cubre: gate por handle, bloques de línea, pool de temas, fallback local,
// cableado IA (ideas + captions) y que la generación de clientes no cambia.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const casa = require('./posty-casa-linea');
const gen = require('./generator');

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.strictEqual(a, b, msg); };

// ---------- 1. Gate por handle ----------
ok(casa.isCasaHandle('@posty.communitymanager'), 'gate: con @');
ok(casa.isCasaHandle('posty.communitymanager'), 'gate: sin @');
ok(casa.isCasaHandle('Posty.CommunityManager'), 'gate: mayúsculas');
ok(casa.isCasaHandle('  @posty.communitymanager  '), 'gate: espacios');
ok(!casa.isCasaHandle('otro.negocio'), 'gate: otro handle no');
ok(!casa.isCasaHandle(''), 'gate: vacío no');
ok(!casa.isCasaHandle(null), 'gate: null no');
ok(!casa.isCasaHandle('postycommunitymanager'), 'gate: el handle EN (sin punto) NO es la casa ES — el EN queda para otro lote');
eq(casa.CASA_HANDLE, 'posty.communitymanager', 'gate: constante del handle');

// ---------- 2. Bloques de línea ----------
const ideasBlock = casa.casaIdeasBlock();
const captionBlock = casa.casaCaptionBlock();
ok(ideasBlock.includes('primero estudiar el rubro'), 'ideas: tema estudiar el rubro');
ok(ideasBlock.includes('freno de mano'), 'ideas: tema freno de mano');
ok(ideasBlock.includes('PROHIBIDO'), 'ideas: trae anti-patrones');
ok(ideasBlock.indexOf('PROHIBIDO') < ideasBlock.indexOf('3 días gratis'), 'ideas: "3 días gratis" aparece NOMBRADO como prohibido, no como ángulo');
ok(!ideasBlock.includes('1 de enero') && !ideasBlock.includes('1 de febrero'), 'ideas: sin fechas viejas del corpus');
ok(!ideasBlock.includes('Café Aroma'), 'ideas: sin datos de clientes del corpus');
ok(!ideasBlock.includes('Ayer me senté'), 'ideas: sin frases copiadas del corpus');
ok(captionBlock.includes('primera persona'), 'caption: voz en primera persona');
ok(captionBlock.includes('pregunta al público'), 'caption: cierre con pregunta');
ok(captionBlock.includes('PROHIBIDO'), 'caption: trae anti-patrones');
ok(!captionBlock.includes('1 de enero') && !captionBlock.includes('Café Aroma'), 'caption: sin fechas ni clientes del corpus');

// ---------- 3. Pool de temas ----------
const TIPOS = ['promo', 'tip', 'social', 'detras', 'novedad'];
for (const lang of ['es', 'en']) {
  const pool = casa.casaTemas(lang);
  ok(pool.length >= 7, `pool ${lang}: al menos 7 temas (hay ${pool.length})`);
  ok(pool.every(t => TIPOS.includes(t.tipo)), `pool ${lang}: tipos del vocabulario vigente`);
  ok(pool.every(t => t.tipo !== 'promo'), `pool ${lang}: ningún tema es promo de la prueba`);
  ok(pool.every((t, i) => i === 0 || t.tipo !== pool[i - 1].tipo), `pool ${lang}: sin dos tipos seguidos iguales`);
}
ok(casa.casaTemas('es').every(t => !/gratis|sumate|probá/i.test(t.titulo)), 'pool ES: ningún título es ángulo de prueba');
ok(casa.casaTemas('en').every(t => !/free trial/i.test(t.titulo)), 'pool EN: ningún título es ángulo de prueba');
ok(casa.casaTemas().length >= 7, 'pool: lang indefinido cae a ES');

// ---------- 4. Fallback local sin IA ----------
const casaTitles = new Set(casa.casaTemas('es').map(t => t.titulo));
(async () => {
  const casaIdeas = await gen.generateIdeas({ casaLinea: ideasBlock }, null);
  eq(casaIdeas.length, 7, 'fallback casa: 7 ideas');
  ok(casaIdeas.every(i => casaTitles.has(i.titulo)), 'fallback casa: todas salen del pool de la casa');
  const genIdeas = await gen.generateIdeas({}, null);
  eq(genIdeas.length, 7, 'fallback genérico: 7 ideas');
  ok(genIdeas.every(i => !casaTitles.has(i.titulo)), 'fallback genérico: ninguna es tema de la casa (clientes intactos)');
  eq(genIdeas[0].titulo, 'lo nuevo de tu negocio', 'fallback genérico: primer esqueleto clásico intacto');
  const filtradas = await gen.generateIdeas({ casaLinea: ideasBlock, excluded: 'estudiar rubro feed medias herramienta agente freno mano' }, null);
  eq(filtradas.length, 7, 'fallback casa con excluidos: sigue dando 7');
  ok(!filtradas.some(i => ['primero estudiar el rubro', 'mi feed queda a medias', 'herramienta vs agente', 'el freno de mano'].includes(i.titulo)), 'fallback casa con excluidos: los 4 temas excluidos no salen');
  ok(gen.templateIdeas({ casaLinea: ideasBlock })[0].titulo === 'primero estudiar el rubro', 'templateIdeas casa directo: primer tema del pool');
  eq(gen.templateIdeas({})[0].titulo, 'lo nuevo de tu negocio', 'templateIdeas sin casaLinea: esqueleto clásico intacto');

  // ---------- 5. Cableado IA con fetch mockeado (cero gasto real) ----------
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    seen.push(body.messages.map(m => m.content).join('\n'));
    const userMsg = body.messages[1].content;
    const content = userMsg.includes('Generá las 7 ideas')
      ? JSON.stringify({ ideas: casa.casaTemas('es').slice(0, 7).map(t => ({ ...t, porque: 'porque muestra el método' })) })
      : JSON.stringify({ caption: '«Mi feed queda a medias y no me trae clientes.»\n\nPosty estudia tu rubro primero y arma tu semana con tus productos reales, para que aprobar sea un toque.\n\n¿Tu feed vende o solo existe?', overlay: 'Mi feed queda a medias', hashtags: '#EstudiaTuRubro #FeedQueVende' });
    return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
  };
  try {
    seen.length = 0;
    await gen.generateIdeas({ business: 'Posty', category: 'Community manager', casaLinea: ideasBlock }, 'test-key');
    ok(seen.some(m => m.includes('LÍNEA EDITORIAL DE LA CASA')), 'IA ideas casa: el bloque viaja en el mensaje user');
    seen.length = 0;
    await gen.generateIdeas({ business: 'Posty', category: 'Community manager' }, 'test-key');
    ok(!seen.some(m => m.includes('LÍNEA EDITORIAL DE LA CASA')), 'IA ideas cliente: el bloque NO viaja sin casaLinea');
    seen.length = 0;
    const out = await gen.generateContent({ business: 'Posty', category: 'Community manager', topic: 'mi feed queda a medias', tipo: 'social', casaLinea: captionBlock }, 'test-key');
    ok(seen.some(m => m.includes('LÍNEA EDITORIAL DE LA CASA') && m.includes('PROHIBIDO')), 'IA caption casa: el bloque viaja en el mensaje user');
    ok(typeof out.caption === 'string' && out.caption.length > 0, 'IA caption casa: devuelve caption');
    seen.length = 0;
    await gen.generateContent({ business: 'Posty', category: 'Community manager', topic: 'mi feed queda a medias', tipo: 'social' }, 'test-key');
    ok(!seen.some(m => m.includes('LÍNEA EDITORIAL DE LA CASA')), 'IA caption cliente: el bloque NO viaja sin casaLinea');
  } finally {
    global.fetch = realFetch;
  }

  // ---------- 6. Cableado estático en server.js / generator.js ----------
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const genSrc = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
  ok(serverSrc.includes("require('./posty-casa-linea')"), 'server: requiere el módulo de la casa');
  ok(serverSrc.includes('ideasInput.casaLinea = casaIdeasBlock()'), 'server: ideasInputFor agrega la línea');
  ok(serverSrc.includes('captionInput.casaLinea = casaCaptionBlock()'), 'server: contentInputFor agrega la línea');
  eq((serverSrc.match(/isCasaHandle\(profile\.ig_username\)/g) || []).length, 2, 'server: el gate aparece en los dos builders');
  ok((genSrc.match(/casaLinea/g) || []).length >= 6, 'generator: casaLinea cableada en ideas, captions y fallback');

  console.log(`test-lotepostyaprende: ${n}/${n} asserts OK`);
})().catch(e => { console.error('test-lotepostyaprende FALLÓ:', e.message); process.exit(1); });
