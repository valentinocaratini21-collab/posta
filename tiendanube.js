// tiendanube.js — Conexión con Tiendanube (OAuth) de SOLO LECTURA.
// (2026-10-20) Primer corte de "Posty conectado" (elección de Valentino):
// Posty lee el catálogo, el stock y las ventas reales de la tienda para que
// el fundamento deje de inferirse del feed: el producto estrella sale de
// las VENTAS, lo que no tiene stock no se promociona y lo que está quieto
// se empuja. Reglas duras: jamás contraseñas (OAuth oficial), solo lectura
// (esta integración no escribe NADA en la tienda) y sin datos personales
// de los clientes del cliente (de las órdenes solo cuentan unidades por
// producto: nunca se guarda comprador, email ni montos).
// Sin TIENDANUBE_CLIENT_ID / TIENDANUBE_CLIENT_SECRET en el entorno, el
// módulo queda inerte: tnConfigured() = false y la UI muestra "Muy pronto"
// (regla de verdad: nada que parezca conectar y no conecte).
// Superficie verificada contra la doc oficial (tiendanube.github.io,
// 2026-10-20):
// · Instalación/autorización: GET https://www.tiendanube.com/apps/{app_id}/authorize?state=…
//   (TN_AUTH_BASE parametriza el prefijo por si el registro de la app en
//   Partners exige ajustar el host: tiendanube.com ↔ nuvemshop.com.br).
// · Token: POST https://www.tiendanube.com/apps/authorize/token con JSON
//   {client_id, client_secret, grant_type:'authorization_code', code} →
//   {access_token, token_type, scope, user_id} donde user_id ES el store id.
//   Tiendanube NO emite refresh token: el access_token no expira salvo
//   desconexión/desinstalación; un 401 significa conexión rota.
// · API v1: https://api.tiendanube.com/v1/{store_id}, header
//   Authentication: bearer {token} y User-Agent identificando la app.
// · Producto: name es objeto localizado {es, en, pt}; published boolean;
//   variants[].stock es número o null (null = la variante no controla
//   stock: stock DESCONOCIDO, jamás 0 inventado).
// · Orden: los ítems viven en `products` (no `line_items`: eso es de
//   Shopify) con {product_id, variant_id, name, quantity};
//   payment_status: authorized|pending|paid|partially_paid|abandoned|
//   refunded|partially_refunded|voided — solo 'paid' cuenta como venta.
const { URLSearchParams } = require('url');

const TN_AUTH_BASE = 'https://www.tiendanube.com/apps';
const TN_TOKEN_URL = 'https://www.tiendanube.com/apps/authorize/token';
const API_BASE = 'https://api.tiendanube.com/v1';
const USER_AGENT = 'Posty (postycommunitymanager.com)';
const DEFAULT_REDIRECT_URI = 'https://postycommunitymanager.com/api/connections/tiendanube/callback';

function clientId() { return process.env.TIENDANUBE_CLIENT_ID || ''; }
function clientSecret() { return process.env.TIENDANUBE_CLIENT_SECRET || ''; }
function redirectUri() { return process.env.TIENDANUBE_REDIRECT_URI || DEFAULT_REDIRECT_URI; }
function tnConfigured() { return !!(clientId() && clientSecret()); }

function tnError(data, fallback, status) {
  const msg = (data && (data.message || data.error_description || data.description))
    || (data && typeof data.error === 'string' ? data.error : '')
    || fallback || 'Tiendanube devolvió un error';
  const err = new Error(msg);
  if (status) err.status = status;
  return err;
}

function authorizeUrl(state) {
  return `${TN_AUTH_BASE}/${encodeURIComponent(clientId())}/authorize?state=${encodeURIComponent(state || '')}`;
}

/* Intercambio del code por el access_token. Devuelve el JSON crudo de TN:
 * {access_token, token_type, scope, user_id}. */
async function exchangeCode(code) {
  const r = await fetch(TN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'authorization_code',
      code: String(code || ''),
    }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error || !data.access_token) throw tnError(data, `Tiendanube OAuth ${r.status}`, r.status);
  return data;
}

async function apiGet(conn, pathAndQuery) {
  const storeId = conn && (conn.store_id || conn.storeId);
  const token = conn && (conn.access_token || conn.accessToken);
  const r = await fetch(`${API_BASE}/${encodeURIComponent(String(storeId || ''))}${pathAndQuery}`, {
    headers: { Authentication: `bearer ${token || ''}`, 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw tnError(data, `Tiendanube API ${r.status}`, r.status);
  return data;
}

async function fetchStore(conn) {
  return apiGet(conn, '/store');
}

async function fetchProducts(conn) {
  const q = new URLSearchParams({ per_page: '200', fields: 'id,name,published,visibility,variants' });
  const data = await apiGet(conn, `/products?${q.toString()}`);
  return Array.isArray(data) ? data : [];
}

async function fetchOrders(conn, days = 30) {
  const since = new Date(Date.now() - (days || 30) * 24 * 3600 * 1000).toISOString();
  const q = new URLSearchParams({
    per_page: '200', created_at_min: since, fields: 'id,products,payment_status',
  });
  const data = await apiGet(conn, `/orders?${q.toString()}`);
  return Array.isArray(data) ? data : [];
}

// ---------- digest puro (sin red, testeable con fixtures) ----------

/* Los nombres de TN vienen localizados: {es, en, pt}. Preferimos es. */
function localizedName(name) {
  if (name == null) return '';
  if (typeof name === 'string') return name.trim();
  if (typeof name === 'object') {
    for (const k of ['es', 'en', 'pt']) {
      if (typeof name[k] === 'string' && name[k].trim()) return name[k].trim();
    }
    for (const v of Object.values(name)) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return String(name).trim();
}

function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Stock conocido de una variante: número explícito. TN manda stock:null
 * cuando la variante no controla stock (stock_management=false) → null =
 * DESCONOCIDO (nunca 0). Se acepta inventory_quantity por compatibilidad. */
function variantStock(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.stock === 'number' && Number.isFinite(v.stock)) return v.stock;
  if (typeof v.inventory_quantity === 'number' && Number.isFinite(v.inventory_quantity)) return v.inventory_quantity;
  return null;
}

/* digestFromTiendanube({products, orders, store, connected_at}) → bloque
 * que vive en digest.connections.tiendanube. PURO: sin red ni reloj
 * (connected_at entra por parámetro; synced_at lo estampa el sync).
 * - star: producto del catálogo con más unidades vendidas en órdenes
 *   PAGADAS; null si nadie vendió (units>0 exigido).
 * - out_of_stock: publicados con TODAS las variantes en stock conocido 0.
 *   Un solo dato desconocido saca al producto de la lista: ante la duda,
 *   no se acusa falta de stock.
 * - quiet: publicados vendibles (con stock conocido >0, o sin control de
 *   stock — TN los vende igual) con 0 ventas en el período; tope 8.
 * - top_sellers: hasta 5 {name, units} por unidades descendente. */
function digestFromTiendanube(input) {
  const p = input || {};
  const products = Array.isArray(p.products) ? p.products : [];
  const orders = Array.isArray(p.orders) ? p.orders : [];

  // Unidades vendidas por producto (solo órdenes pagadas).
  const unitsById = new Map();
  const unitsByName = new Map();
  for (const o of orders) {
    if (!o || o.payment_status !== 'paid') continue;
    const items = Array.isArray(o.products) ? o.products
      : (Array.isArray(o.line_items) ? o.line_items : []);
    for (const it of items) {
      if (!it) continue;
      const q = Number(it.quantity);
      const units = Number.isFinite(q) && q > 0 ? q : 1;
      if (it.product_id != null && it.product_id !== '') {
        const k = String(it.product_id);
        unitsById.set(k, (unitsById.get(k) || 0) + units);
      }
      const nm = normName(localizedName(it.name));
      if (nm) unitsByName.set(nm, (unitsByName.get(nm) || 0) + units);
    }
  }

  const rows = products.map((prod) => {
    const name = localizedName(prod && prod.name);
    const published = prod
      ? (prod.published !== undefined ? !!prod.published
        : (prod.visibility ? prod.visibility === 'visible' : true))
      : false;
    const variants = (prod && Array.isArray(prod.variants)) ? prod.variants : [];
    const stocks = variants.map(variantStock);
    const known = stocks.filter((s) => s !== null);
    const totalKnown = known.reduce((a, b) => a + b, 0);
    const allKnownZero = variants.length > 0 && known.length === variants.length && totalKnown === 0;
    const outOfStock = published && allKnownZero;
    // Vendible: no está agotado Y (tiene stock conocido >0 O alguna
    // variante no controla stock — TN la vende sin límite).
    const sellable = published && !outOfStock && (totalKnown > 0 || known.length < variants.length);
    const idKey = prod && prod.id != null ? String(prod.id) : '';
    let units = (idKey && unitsById.get(idKey)) || 0;
    if (!units) units = unitsByName.get(normName(name)) || 0;
    return { name, published, outOfStock, sellable, units };
  });

  const sold = rows.filter((r) => r.name && r.units > 0)
    .sort((a, b) => b.units - a.units);
  const star = sold.length ? { name: sold[0].name, units_30d: sold[0].units } : null;
  const topSellers = sold.slice(0, 5).map((r) => ({ name: r.name, units: r.units }));
  const outOfStock = rows.filter((r) => r.outOfStock && r.name).map((r) => r.name);
  const quiet = rows.filter((r) => r.sellable && r.units === 0 && r.name)
    .slice(0, 8).map((r) => r.name);

  return {
    store_name: localizedName(p.store && p.store.name),
    connected_at: p.connected_at || p.connectedAt || null,
    products_total: products.length,
    star,
    out_of_stock: outOfStock,
    quiet,
    top_sellers: topSellers,
  };
}

// ---- Almacenamiento (tabla genérica user_connections) ----
function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS user_connections (
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      store_id TEXT DEFAULT '',
      store_name TEXT DEFAULT '',
      access_token TEXT DEFAULT '',
      scope TEXT DEFAULT '',
      status TEXT DEFAULT 'connected',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, provider)
    )`);
  } catch (e) { /* defensivo: la crea el primer uso */ }
}

function getConnection(db, userId) {
  try {
    ensureTable(db);
    const c = db.prepare('SELECT * FROM user_connections WHERE user_id = ? AND provider = ?').get(userId, 'tiendanube');
    if (!c || !c.access_token) return null;
    return c;
  } catch (e) { return null; }
}

function saveConnection(db, userId, data) {
  ensureTable(db);
  const d = data || {};
  db.prepare(`INSERT INTO user_connections (user_id, provider, store_id, store_name, access_token, scope, status, updated_at)
    VALUES (?, 'tiendanube', ?, ?, ?, ?, 'connected', datetime('now'))
    ON CONFLICT(user_id, provider) DO UPDATE SET store_id=excluded.store_id,
      store_name=CASE WHEN excluded.store_name != '' THEN excluded.store_name ELSE user_connections.store_name END,
      access_token=excluded.access_token, scope=excluded.scope, status='connected',
      updated_at=datetime('now')`)
    .run(userId, String(d.store_id || ''), String(d.store_name || ''),
      String(d.access_token || ''), String(d.scope || ''));
}

function touchConnection(db, userId, storeName) {
  try {
    ensureTable(db);
    db.prepare(`UPDATE user_connections SET updated_at = datetime('now'),
      store_name = CASE WHEN ? != '' THEN ? ELSE store_name END
      WHERE user_id = ? AND provider = 'tiendanube'`).run(String(storeName || ''), String(storeName || ''), userId);
  } catch (e) { /* no bloquea el sync */ }
}

function markConnectionBroken(db, userId) {
  try {
    ensureTable(db);
    db.prepare(`UPDATE user_connections SET status = 'broken', updated_at = datetime('now')
      WHERE user_id = ? AND provider = 'tiendanube'`).run(userId);
  } catch (e) { /* no bloquea */ }
}

function deleteConnection(db, userId) {
  try {
    ensureTable(db);
    db.prepare('DELETE FROM user_connections WHERE user_id = ? AND provider = ?').run(userId, 'tiendanube');
  } catch (e) { /* tabla nueva */ }
}

module.exports = {
  TN_AUTH_BASE, TN_TOKEN_URL, API_BASE,
  clientId, clientSecret, redirectUri, tnConfigured, configured: tnConfigured,
  authorizeUrl, exchangeCode,
  fetchStore, fetchProducts, fetchOrders,
  localizedName, variantStock, digestFromTiendanube,
  ensureTable, getConnection, saveConnection, touchConnection,
  markConnectionBroken, deleteConnection,
};
