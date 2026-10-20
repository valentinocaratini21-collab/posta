// test-tiendanube.js — Integración Tiendanube de SOLO LECTURA (Posty
// conectado, primer corte 2026-10-20). Corre sin red: fixtures con la
// forma REAL de la API v1 de Tiendanube (verificada contra la doc
// oficial) y fetch stubbeado para OAuth/cliente.
// Cubre: digestFromTiendanube puro (estrella por unidades pagadas,
// sin-stock solo con stock conocido 0 en TODAS las variantes, quietos
// con tope, no-pagadas no cuentan, sin campo de stock ≠ agotado),
// authorizeUrl, exchangeCode con fetch mockeado, URLs del cliente API,
// almacenamiento en user_connections, y los EFECTOS en el consumo del
// fundamento (client-digest: anclas sin el agotado, estrella por ventas
// en deriveTopics/ADN, quietos promovidos; sales-brain: señales).
'use strict';

const tn = require('./tiendanube.js');
const cd = require('./client-digest.js');
const sb = require('./sales-brain.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

// ---------- fixtures con la forma real de TN v1 ----------
const PRODS = [
  { id: 1, name: { es: 'Remera Sol', en: 'Sun Tee' }, published: true, variants: [{ id: 11, stock: 10, stock_management: true }] },
  { id: 2, name: { es: 'Buzo Luna' }, published: true, variants: [{ id: 21, stock: 0, stock_management: true }, { id: 22, stock: 0, stock_management: true }] },
  { id: 3, name: { es: 'Gorra Río' }, published: true, variants: [{ id: 31, stock: null, stock_management: false }] },
  { id: 4, name: 'Campera Nube', published: true, variants: [{ id: 41, stock: 3, stock_management: true }] },
  { id: 5, name: { es: 'Pantalón Sur' }, published: true, variants: [{ id: 51, stock: 0, stock_management: true }, { id: 52, stock: null, stock_management: false }] },
  { id: 6, name: { es: 'Borrador Oculto' }, published: false, variants: [{ id: 61, stock: 0, stock_management: true }] },
];
const ORDERS = [
  { id: 100, payment_status: 'paid', products: [{ product_id: 1, name: 'Remera Sol', quantity: 2 }, { product_id: 1, name: 'Remera Sol', quantity: 3 }] },
  { id: 101, payment_status: 'paid', products: [{ product_id: 1, name: 'Remera Sol', quantity: 2 }, { product_id: 99, name: 'Fantasma Borrado', quantity: 50 }] },
  { id: 102, payment_status: 'pending', products: [{ product_id: 4, name: 'Campera Nube', quantity: 99 }] },
  { id: 103, payment_status: 'voided', products: [{ product_id: 4, name: 'Campera Nube', quantity: 5 }] },
  { id: 104, payment_status: 'partially_paid', products: [{ product_id: 4, name: 'Campera Nube', quantity: 7 }] },
];

async function main() {
  console.log('== digestFromTiendanube: estrella, sin-stock, quietos ==');
  const d = tn.digestFromTiendanube({ products: PRODS, orders: ORDERS, store: { name: { es: 'Mi Tienda' } }, connected_at: '2026-10-20T00:00:00.000Z' });
  ok('store_name localizado (es)', d.store_name === 'Mi Tienda', d.store_name);
  ok('products_total cuenta el catálogo traído', d.products_total === 6, d.products_total);
  ok('estrella = más unidades PAGADAS (2+3+2=7, ítems repetidos agregan)', d.star && d.star.name === 'Remera Sol' && d.star.units_30d === 7, d.star);
  ok('top_sellers[0] es la estrella', d.top_sellers.length === 1 && d.top_sellers[0].name === 'Remera Sol' && d.top_sellers[0].units === 7, d.top_sellers);
  ok('producto fuera de catálogo (id 99, 50u) NO es estrella', !d.top_sellers.some((s) => s.name === 'Fantasma Borrado'));
  ok('sin-stock: solo TODAS las variantes en 0 conocido', JSON.stringify(d.out_of_stock) === JSON.stringify(['Buzo Luna']), d.out_of_stock);
  ok('sin campo de stock (null) NO es agotado', !d.out_of_stock.includes('Gorra Río') && !d.out_of_stock.includes('Pantalón Sur'));
  ok('no publicado con stock 0 NO entra a sin-stock', !d.out_of_stock.includes('Borrador Oculto'));
  ok('quietos: vendibles con 0 ventas (sin control de stock cuenta)', d.quiet.includes('Gorra Río') && d.quiet.includes('Campera Nube'), d.quiet);
  ok('órdenes pending/voided/partially_paid NO cuentan como venta', d.quiet.includes('Campera Nube'));
  ok('la estrella y el agotado NO son quietos', !d.quiet.includes('Remera Sol') && !d.quiet.includes('Buzo Luna'));
  ok('connected_at pasa por la función pura', d.connected_at === '2026-10-20T00:00:00.000Z');

  const compat = tn.digestFromTiendanube({ products: PRODS, orders: [{ id: 1, payment_status: 'paid', line_items: [{ product_id: 4, name: 'Campera Nube', quantity: 4 }] }], store: null });
  ok('compat: ítems en line_items también cuentan', compat.star && compat.star.name === 'Campera Nube' && compat.star.units_30d === 4, compat.star);

  const many = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, name: `Producto ${i}`, published: true, variants: [{ stock: 5 }] }));
  const dq = tn.digestFromTiendanube({ products: many, orders: [], store: null });
  ok('quietos con tope 8', dq.quiet.length === 8, dq.quiet.length);
  ok('sin ventas no hay estrella', dq.star === null && dq.top_sellers.length === 0);
  const empty = tn.digestFromTiendanube({});
  ok('entrada vacía no rompe', empty.products_total === 0 && empty.star === null && empty.out_of_stock.length === 0 && empty.quiet.length === 0);

  console.log('== OAuth: authorizeUrl y exchangeCode (fetch stub) ==');
  delete process.env.TIENDANUBE_CLIENT_ID; delete process.env.TIENDANUBE_CLIENT_SECRET;
  ok('sin env no está configurada', tn.tnConfigured() === false);
  process.env.TIENDANUBE_CLIENT_ID = '1234';
  ok('solo client_id no alcanza', tn.tnConfigured() === false);
  process.env.TIENDANUBE_CLIENT_SECRET = 'secreto-test';
  ok('con id+secret está configurada', tn.tnConfigured() === true);
  ok('authorizeUrl con la forma oficial /apps/{id}/authorize?state=',
    tn.authorizeUrl('user.abc.sig') === 'https://www.tiendanube.com/apps/1234/authorize?state=user.abc.sig',
    tn.authorizeUrl('user.abc.sig'));

  const realFetch = global.fetch;
  let lastCall = null;
  global.fetch = async (url, opts) => {
    lastCall = { url: String(url), opts };
    return { ok: true, status: 200, json: async () => ({ access_token: 'tok-abc', token_type: 'bearer', scope: 'read_products,read_orders', user_id: 789 }) };
  };
  const tok = await tn.exchangeCode('code-xyz');
  ok('exchangeCode parsea access_token/scope/user_id', tok.access_token === 'tok-abc' && tok.user_id === 789 && tok.scope.includes('read_orders'), tok);
  const sentBody = JSON.parse(lastCall.opts.body);
  ok('exchangeCode manda grant_type authorization_code al endpoint oficial',
    lastCall.url === 'https://www.tiendanube.com/apps/authorize/token' && sentBody.grant_type === 'authorization_code' && sentBody.code === 'code-xyz' && sentBody.client_id === '1234');
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'invalid_grant', error_description: 'code vencido' }) });
  let err401 = null;
  try { await tn.exchangeCode('malo'); } catch (e) { err401 = e; }
  ok('exchangeCode con 401 tira error con status 401', !!err401 && err401.status === 401, err401 && err401.message);

  console.log('== Cliente API: URLs y headers ==');
  let apiCall = null;
  global.fetch = async (url, opts) => { apiCall = { url: String(url), opts }; return { ok: true, status: 200, json: async () => [] }; };
  const conn = { store_id: '789', access_token: 'tok-abc' };
  await tn.fetchProducts(conn);
  ok('fetchProducts pega a /v1/{store}/products?per_page=200',
    apiCall.url.startsWith('https://api.tiendanube.com/v1/789/products?') && apiCall.url.includes('per_page=200'), apiCall.url);
  ok('header Authentication: bearer + User-Agent Posty',
    apiCall.opts.headers.Authentication === 'bearer tok-abc' && apiCall.opts.headers['User-Agent'] === 'Posty (postyhacetodo.com)', apiCall.opts.headers);
  await tn.fetchOrders(conn, 30);
  ok('fetchOrders filtra por created_at_min y pide products (campo real TN)',
    apiCall.url.includes('/orders?') && apiCall.url.includes('created_at_min=') && decodeURIComponent(apiCall.url).includes('fields=id,products,payment_status'), apiCall.url);
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) });
  let apiErr = null;
  try { await tn.fetchStore(conn); } catch (e) { apiErr = e; }
  ok('401 de la API se propaga con status (marca de conexión rota)', !!apiErr && apiErr.status === 401);
  global.fetch = realFetch;

  console.log('== Almacenamiento user_connections ==');
  const { DatabaseSync } = require('node:sqlite');
  const mdb = new DatabaseSync(':memory:');
  ok('sin conexión devuelve null', tn.getConnection(mdb, 42) === null);
  tn.saveConnection(mdb, 42, { store_id: '789', store_name: 'Mi Tienda', access_token: 'tok-abc', scope: 'read_products' });
  const saved = tn.getConnection(mdb, 42);
  ok('save/get redondo', !!saved && saved.store_id === '789' && saved.store_name === 'Mi Tienda' && saved.status === 'connected', saved);
  tn.markConnectionBroken(mdb, 42);
  ok('markConnectionBroken marca broken', tn.getConnection(mdb, 42).status === 'broken');
  tn.deleteConnection(mdb, 42);
  ok('delete borra la fila', tn.getConnection(mdb, 42) === null);
  tn.deleteConnection(mdb, 42);
  ok('delete sin conexión es idempotente', true);

  console.log('== EFECTOS en client-digest (consumo real del fundamento) ==');
  const TN_BLOCK = {
    store_name: 'Mi Tienda', products_total: 4,
    star: { name: 'Remera Sol', units_30d: 7 },
    out_of_stock: ['Buzo Luna'], quiet: ['Gorra Río'],
    top_sellers: [{ name: 'Remera Sol', units: 7 }],
  };
  const base = cd.buildFromParts({
    business: 'Tienda Test', category: 'moda',
    dna: { productos: ['Remera Sol', 'Campera Nube', 'Buzo Luna', 'Gorra Río'] },
  });
  ok('fixture sin estrella inferida (aisla el efecto TN)', !base.inferred_star || !base.inferred_star.item || (base.inferred_star.confidence || 0) < 0.5, base.inferred_star);
  const withTn = { ...base, connections: { tiendanube: TN_BLOCK } };

  const es = cd.effectiveStarOf(withTn);
  ok("effectiveStarOf: ventas reales mandan (source 'sales')", !!es && es.item === 'Remera Sol' && es.source === 'sales', es);
  const sinTn = cd.effectiveStarOf(base);
  ok('sin TN no hay estrella efectiva inventada', sinTn === null, sinTn);
  const duenoFirst = cd.effectiveStarOf({ ...withTn, dueno: { estrella: 'Campera Nube' } });
  ok('lo del dueño en persona pisa a las ventas', !!duenoFirst && duenoFirst.item === 'Campera Nube' && duenoFirst.source === 'dueno', duenoFirst);

  const anch = cd.anchorsOf(withTn);
  ok('anchorsOf EXCLUYE el producto sin stock', !anch.some((a) => cd.sameItemName(a.text, 'Buzo Luna')), anch.map((a) => a.text));
  ok('anchorsOf conserva los vendibles', anch.some((a) => cd.sameItemName(a.text, 'Remera Sol')));
  const anchBase = cd.anchorsOf(base);
  ok('sin TN el agotado ancla como siempre (no cambió nada)', anchBase.some((a) => cd.sameItemName(a.text, 'Buzo Luna')));

  const topics = cd.deriveTopics(withTn, { count: 5, category: 'moda' });
  ok('deriveTopics: el primer tema es la estrella por ventas', topics.length > 0 && topics[0].digest_anchor === 'Remera Sol', topics.map((t) => t.digest_anchor));
  ok('deriveTopics: ningún tema sobre el producto sin stock', !topics.some((t) => cd.sameItemName(t.digest_anchor || '', 'Buzo Luna')), topics.map((t) => t.digest_anchor));
  ok('deriveTopics: el quieto sube a la segunda posición', topics.length > 1 && topics[1].digest_anchor === 'Gorra Río', topics.map((t) => t.digest_anchor));

  const fragBase = cd.buildFromParts({
    business: 'Tienda Test', category: 'moda',
    dna: { productos: ['Campera Nube', 'Remera Sol', 'Buzo Luna', 'Gorra Río'] },
  });
  const frag = cd.dnaFragmentFromDigest({ ...fragBase, connections: { tiendanube: TN_BLOCK } });
  ok('dnaFragment: producto_estrella = estrella por ventas (no el primer ítem)', frag.producto_estrella === 'Remera Sol', frag.producto_estrella);
  const fragSin = cd.dnaFragmentFromDigest(fragBase);
  ok('dnaFragment sin TN sigue con el primer ítem', fragSin.producto_estrella === 'Campera Nube', fragSin.producto_estrella);

  console.log('== EFECTOS en sales-brain (señales de la semana) ==');
  const sigDigest = {
    productos: [{ nombre: 'Remera Sol' }, { nombre: 'Campera Nube' }, { nombre: 'Buzo Luna' }, { nombre: 'Gorra Río' }],
    servicios: [], promos: [], inferred_star: null, connections: { tiendanube: TN_BLOCK },
  };
  const sig = sb.digestSignals(sigDigest);
  ok('digestSignals: estrella por ventas', !!sig.star && sig.star.item === 'Remera Sol' && sig.star.source === 'sales', sig.star);
  ok('digestSignals: la evidencia es la venta real', !!sig.star && sig.star.evidence.join(' ').includes('7 unidades'), sig.star);
  ok('digestSignals: productos sin el agotado', !sig.products.includes('Buzo Luna'), sig.products);
  ok('digestSignals: orden candidatos = estrella, quieto, resto',
    sig.products[0] === 'Remera Sol' && sig.products[1] === 'Gorra Río', sig.products);
  ok('digestSignals: quiet expuesto', Array.isArray(sig.quiet) && sig.quiet.includes('Gorra Río'), sig.quiet);
  const sigSin = sb.digestSignals({ productos: sigDigest.productos, servicios: [], promos: [], inferred_star: null });
  ok('digestSignals sin TN: sin estrella y con todos los productos',
    sigSin.star === null && sigSin.products.length === 4 && sigSin.products[0] === 'Remera Sol' && sigSin.products[1] === 'Campera Nube', sigSin.products);

  console.log(`\n== RESULTADO: ${pass} ok, ${fail} fail ==`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
