// LOTE POSTY APRENDE CLIENTES — test sin IA real (fetch mockeado: cero gasto).
// Cubre: (1) gate por cliente y referencia solo propia, (2) AISLAMIENTO
// A-vs-B explícito (ningún dato de A aparece en la generación de B y
// viceversa), (3) cliente sin material = generación actual sin cambios,
// (4) casa intacta con su línea del equipo, (5) cableado IA.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cli = require('./posty-cliente-linea');
const casa = require('./posty-casa-linea');
const gen = require('./generator');

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.strictEqual(a, b, msg); };

// ---------- Doble de DB con semántica real: filtra por el uid pasado ----------
// Dos clientes con marcadores disjuntos (productos y temas que no se cruzan).
const POSTS = [
  { user_id: 101, caption: 'Alfajor artesanal de dulce de leche\nLa receta de la abuela, horneado hoy', status: 'published', created_at: '2026-10-30' },
  { user_id: 101, caption: 'Torta rogel para el domingo\nCapas crocantes y merengue', status: 'published', created_at: '2026-10-28' },
  { user_id: 202, caption: 'Camiseta oversize de algodón\nCaída perfecta, sin estampa', status: 'published', created_at: '2026-10-30' },
  { user_id: 202, caption: 'Jean mom tiro alto\nEl clásico que no falla', status: 'published', created_at: '2026-10-29' },
  { user_id: 101, caption: 'Borrador viejo de alfajor', status: 'draft', created_at: '2026-10-27' },
];
const SIGNALS = [
  { user_id: 101, caption: 'Budín de limón glaseado', client_signal: 'approved', updated_at: '2026-10-29' },
  { user_id: 202, caption: 'Buzo frisado con capucha', client_signal: 'rating_5', updated_at: '2026-10-29' },
  { user_id: 101, caption: 'Promo rechazada de alfajor', client_signal: 'rejected', updated_at: '2026-10-29' },
  { user_id: 202, caption: 'Jean mom que no gustó', client_signal: 'rating_1', updated_at: '2026-10-28' },
];
const SNAPS = [
  { user_id: 101, payload: JSON.stringify({ bio: 'Pastelería artesanal en Belgrano. Horneamos todos los días.' }) },
  { user_id: 202, payload: JSON.stringify({ bio: 'Ropa sin género, hecha en taller propio.' }) },
];
const calls = [];
function fakeDb() {
  return {
    prepare(sql) {
      return {
        all: (...params) => {
          calls.push({ sql, params });
          if (/FROM posts/.test(sql)) return POSTS.filter(r => r.user_id === params[0] && r.status === 'published');
          if (/FROM post_signals/.test(sql)) return SIGNALS.filter(r => r.user_id === params[0] && ['approved', 'edited', 'rating_4', 'rating_5'].includes(r.client_signal));
          return [];
        },
        get: (...params) => {
          calls.push({ sql, params });
          if (/FROM ig_home_snapshot/.test(sql)) return SNAPS.find(r => r.user_id === params[0]) || null;
          return null;
        },
      };
    },
  };
}
const FUND_A = { business: 'Dulce Horno', category: 'Pastelería', products: [{ nombre: 'alfajor artesanal' }, 'torta rogel'], servicios: [], star: 'budín de limón' };
const FUND_B = { business: 'Tela Libre', category: 'Indumentaria', products: ['camiseta oversize', { nombre: 'jean mom' }], servicios: [], star: 'buzo frisado' };
const MARK_A = ['alfajor artesanal', 'torta rogel', 'budín de limón', 'Budín de limón glaseado', 'Pastelería artesanal en Belgrano'];
const MARK_B = ['camiseta oversize', 'jean mom', 'buzo frisado', 'Buzo frisado con capucha', 'Ropa sin género'];

// ---------- 1. Bundle: solo filas propias, consultas siempre con user_id = ? ----------
calls.length = 0;
const bundleA = cli.propiaBundleFor(fakeDb(), 101);
const bundleB = cli.propiaBundleFor(fakeDb(), 202);
ok(bundleA.published.some(t => /alfajor/i.test(t)), 'bundle A: trae su publicado');
ok(bundleA.approved.some(t => /budín/i.test(t)), 'bundle A: trae su aprobado');
ok(!bundleA.published.some(t => /camiseta|jean/i.test(t)) && !bundleA.approved.some(t => /buzo/i.test(t)), 'bundle A: cero filas de B');
ok(bundleB.published.some(t => /camiseta/i.test(t)), 'bundle B: trae su publicado');
ok(!bundleB.published.some(t => /alfajor|torta/i.test(t)) && !bundleB.approved.some(t => /budín/i.test(t)), 'bundle B: cero filas de A');
ok(bundleA.published.every(t => !/Borrador viejo/.test(t)), 'bundle A: el draft NO entra (solo published)');
ok(bundleA.approved.every(t => !/rechazada/.test(t)), 'bundle A: el rejected NO entra (solo approved/edited/rating_4/5)');
ok(/Pastelería artesanal/.test(bundleA.snapshotBio), 'bundle A: bio de SU snapshot');
ok(/Ropa sin género/.test(bundleB.snapshotBio), 'bundle B: bio de SU snapshot');
ok(calls.length === 6, 'bundle: 3 consultas por cliente (posts, signals, snapshot)');
ok(calls.every(c => /user_id = \?/.test(c.sql)), 'bundle: TODAS las consultas filtran por user_id = ?');
ok(calls.every(c => c.params[0] === 101 || c.params[0] === 202), 'bundle: el parámetro es el uid de la cuenta que se genera');
ok(calls.filter(c => c.params[0] === 101).length === 3, 'bundle A: sus 3 consultas llevan su uid');

// ---------- 2. AISLAMIENTO en el bloque (formato puro de un solo bundle) ----------
const blockA = cli.propiaLineaFor(bundleA, FUND_A);
const blockB = cli.propiaLineaFor(bundleB, FUND_B);
ok(blockA && blockB, 'bloque: ambos clientes con historia tienen bloque');
for (const m of MARK_A) ok(blockA.includes(m), `bloque A: incluye su marcador "${m}"`);
for (const m of MARK_B) ok(!blockA.includes(m), `AISLAMIENTO: bloque A NO contiene marcador de B "${m}"`);
for (const m of MARK_B) ok(blockB.includes(m), `bloque B: incluye su marcador "${m}"`);
for (const m of MARK_A) ok(!blockB.includes(m), `AISLAMIENTO: bloque B NO contiene marcador de A "${m}"`);
ok(!blockA.includes('Tela Libre') && !blockB.includes('Dulce Horno'), 'AISLAMIENTO: ni el nombre del otro negocio cruza');
ok(blockA.includes('REFERENCIA PROPIA') && blockA.includes('de nadie más'), 'bloque A: encabezado anti-cruce');
ok(blockA.includes('no inventes productos'), 'bloque A: regla anti-invención');
ok(blockA.length <= cli.MAX_BLOCK_LEN, `bloque A: cap de largo (${blockA.length} <= ${cli.MAX_BLOCK_LEN})`);
ok(blockA.split('\n').every(l => l.length <= 400), 'bloque A: ninguna línea desborda por títulos largos');

// ---------- 3. Sin material propio = null (generación exactamente como hoy) ----------
eq(cli.propiaLineaFor({ published: [], approved: [], snapshotBio: '' }, FUND_A), null, 'sin material: null');
eq(cli.propiaLineaFor({ published: [], approved: [], snapshotBio: 'Bio linda pero sin posteos' }, FUND_A), null, 'solo bio, sin posteos: null (la bio sola no crea referencia)');
eq(cli.propiaLineaFor(null, FUND_A), null, 'bundle null: null');
eq(cli.propiaLineaForClient(fakeDb(), 999, FUND_A), null, 'cliente sin filas: null');
ok(cli.propiaLineaForClient(fakeDb(), 101, FUND_A).includes('alfajor artesanal'), 'atajo combinado: bloque de A con su fundamento');

// ---------- 4. Caps, dedupe y truncado ----------
const dupBundle = { published: ['Torta rogel para el domingo con un título larguísimo que supera los ochenta caracteres permitidos y debe cortarse', 'torta rogel para el domingo con un título larguísimo que supera los ochenta caracteres permitidos y debe cortarse', 'Torta rogel para el domingo con un título larguísimo que supera los ochenta caracteres permitidos y debe cortarse'], approved: [], snapshotBio: '' };
const dupBlock = cli.propiaLineaFor(dupBundle, FUND_A);
eq((dupBlock.match(/Torta rogel/g) || []).length, 1, 'dedupe: el mismo título no se repite');
ok(!dupBlock.includes('ochenta caracteres permitidos y debe cortarse'), 'truncado: el título se corta a 80');
ok(!dupBlock.includes('undefined') && !dupBlock.includes('null'), 'bloque: sin literales undefined/null');

// ---------- 5. Casa intacta (módulo anterior sin tocar) ----------
ok(casa.isCasaHandle('posty.communitymanager'), 'casa: el gate sigue siendo el handle ES');
ok(!casa.isCasaHandle('dulce.horno'), 'casa: un cliente no es la casa');
ok(casa.casaIdeasBlock().includes('primero estudiar el rubro'), 'casa: su línea editorial intacta');

(async () => {
  // ---------- 6. Cableado IA con fetch mockeado (cero gasto real) ----------
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    seen.push(body.messages.map(m => m.content).join('\n'));
    const userMsg = body.messages[1].content;
    const content = userMsg.includes('Generá las 7 ideas')
      ? JSON.stringify({ ideas: [{ formato: 'Novedad', tipo: 'novedad', titulo: 'lo nuevo de tu negocio', angulo: 'Presentá tu novedad.', porque: 'porque es real' }] })
      : JSON.stringify({ caption: 'Alfajor artesanal, horneado hoy.\n\nLa receta de la abuela con dulce de leche.\n\n¿Cuál es tu alfajor favorito?', overlay: 'Alfajor artesanal', hashtags: '#AlfajorArtesanal' });
    return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
  };
  try {
    const propiaA = cli.propiaLineaFor(bundleA, FUND_A);
    seen.length = 0;
    await gen.generateIdeas({ business: 'Dulce Horno', category: 'Pastelería', propiaLinea: propiaA }, 'test-key');
    ok(seen.some(m => m.includes('REFERENCIA PROPIA') && m.includes('alfajor artesanal')), 'IA ideas cliente A: el bloque propio viaja');
    ok(!seen.some(m => m.includes('camiseta oversize') || m.includes('Tela Libre')), 'IA ideas cliente A: NADA de B viaja');
    seen.length = 0;
    await gen.generateIdeas({ business: 'Dulce Horno', category: 'Pastelería' }, 'test-key');
    ok(!seen.some(m => m.includes('REFERENCIA PROPIA')), 'IA ideas sin propiaLinea: el bloque NO viaja (como hoy)');
    seen.length = 0;
    await gen.generateContent({ business: 'Dulce Horno', category: 'Pastelería', topic: 'alfajor artesanal', tipo: 'novedad', propiaLinea: propiaA }, 'test-key');
    ok(seen.some(m => m.includes('REFERENCIA PROPIA') && m.includes('Lo que este negocio ya publicó')), 'IA caption cliente A: el bloque propio viaja');
    seen.length = 0;
    await gen.generateContent({ business: 'Dulce Horno', category: 'Pastelería', topic: 'alfajor artesanal', tipo: 'novedad' }, 'test-key');
    ok(!seen.some(m => m.includes('REFERENCIA PROPIA')), 'IA caption sin propiaLinea: el bloque NO viaja (como hoy)');
    // Fallback sin IA: sin material, los esqueletos clásicos intactos (como hoy).
    const genIdeas = await gen.generateIdeas({}, null);
    eq(genIdeas[0].titulo, 'lo nuevo de tu negocio', 'fallback sin propiaLinea: esqueleto clásico intacto');
  } finally {
    global.fetch = realFetch;
  }

  // ---------- 7. Cableado estático en server.js / generator.js ----------
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const genSrc = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
  ok(serverSrc.includes("require('./posty-cliente-linea')"), 'server: requiere el módulo de clientes');
  ok(serverSrc.includes('ideasInput.propiaLinea = pl'), 'server: ideasInputFor agrega la referencia propia');
  ok(serverSrc.includes('captionInput.propiaLinea = pl'), 'server: contentInputFor agrega la referencia propia');
  ok(serverSrc.includes('if (isCasaHandle(profile.ig_username)) ideasInput.casaLinea = casaIdeasBlock();\n  else {'), 'server: la casa sigue con su línea y el else es solo para clientes');
  ok(serverSrc.includes('if (isCasaHandle(profile.ig_username)) captionInput.casaLinea = casaCaptionBlock();\n  else {'), 'server: caption con la misma estructura casa/else');
  eq((serverSrc.match(/propiaLineaForClient\(db, uid/g) || []).length, 2, 'server: el combinado se llama en los dos builders con (db, uid)');
  eq((genSrc.match(/propiaLinea/g) || []).length, 9, 'generator: propiaLinea en 3 firmas + 3 mensajes (cada mensaje la menciona 2 veces: condición + interpolación)');
  const tIdx = genSrc.indexOf('function templateIdeas(');
  const tNextSync = genSrc.indexOf('\nfunction ', tIdx + 1);
  const tNextAsync = genSrc.indexOf('\nasync function ', tIdx + 1);
  const tNext = [tNextSync, tNextAsync].filter(i => i !== -1).sort((a, b) => a - b)[0];
  const tBody = genSrc.slice(tIdx, tNext === undefined ? undefined : tNext);
  ok(!tBody.includes('propiaLinea'), 'generator: el fallback local NO se toca (límite declarado: la semana es IA estricta)');

  console.log(`test-lotepostyaprendeclientes: ${n}/${n} asserts OK`);
})().catch(e => { console.error('test-lotepostyaprendeclientes FALLÓ:', e.message); process.exit(1); });
