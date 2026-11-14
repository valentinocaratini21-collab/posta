// (LOTE IMPULSAR-DIRECTO-RE-RIELADO) Stub determinista de Meta +
// Stripe para la suite del lote. Deriva del stub del LOTE
// CONEXIÓN-PÁGINA y suma: lectura de estados ACTIVE (la verificación
// de «corriendo» de la costura del fee), ids de campaña únicos por
// creación, un SUAT que falla al crear (SUAT_FALLA) y un cliente
// Stripe falso inyectado vía _setClient que registra los
// PaymentIntents (STRIPE_STUB_LOG). Se carga de dos maneras:
//   - En el server de prueba: NODE_OPTIONS=--require <este archivo>
//     con META_STUB_AUTOINSTALL=1 (parcha globalThis.fetch del proceso
//     hijo) y META_STUB_LOG=<ruta> (las llamadas a graph.facebook.com
//     quedan en un JSONL para que la suite asevere cuenta/token/creative).
//   - En la suite: require() + install() para la parte de módulo.
// Todo lo que no es api.instagram.com / graph.instagram.com /
// graph.facebook.com pasa al fetch real.
'use strict';
const fs = require('fs');

const calls = [];
const realFetch = globalThis.fetch;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function record(entry) {
  calls.push(entry);
  const logPath = process.env.META_STUB_LOG || '';
  if (logPath) { try { fs.appendFileSync(logPath, JSON.stringify(entry) + '\n'); } catch (e) {} }
}

function suatFor(code) {
  if (code === 'SINCUENTA') return 'SUAT_SINCUENTA';
  if (code === 'SINPAGINA') return 'SUAT_SINPAGINA';
  return 'SUAT_TEST';
}

function adAccountsFor(token) {
  if (token === 'SUAT_TEST' || token === 'SUAT_FALLA') return [{ id: 'act_777001', account_id: '777001', name: 'Cuenta del Cliente', currency: 'USD', account_status: 1, business: { id: 'BIZ900', name: 'Negocio Cliente' } }];
  if (token === 'SUAT_SINPAGINA') return [{ id: 'act_777002', account_id: '777002', name: 'Cuenta Sin Página', currency: 'USD', account_status: 1, business: { id: 'BIZ901', name: 'Negocio Sin Página' } }];
  return [];
}

function pagesFor(token) {
  if (token === 'SUAT_TEST') return [{ id: '555111', name: 'Página Cliente', instagram_business_account: { id: '555001' } }];
  if (token === 'TOKEN_POSTY') return [{ id: '447205365133941', name: 'Posty', instagram_business_account: { id: '999001' } }];
  return [];
}

let stubSeq = 0;

async function stubFetch(url, opts = {}) {
  const u = new URL(String(url));
  const host = u.hostname;
  const method = (opts.method || 'GET').toUpperCase();
  let body = {};
  if (opts.body) {
    if (typeof opts.body === 'string') {
      const t = opts.body.trim();
      if (t.startsWith('{')) { try { body = JSON.parse(t); } catch (e) { body = {}; } }
      else { try { body = Object.fromEntries(new URLSearchParams(t)); } catch (e) { body = {}; } }
    } else if (typeof opts.body === 'object') {
      // URLSearchParams o FormData: meta_ads manda URLSearchParams, que
      // itera [key, value]; FormData.get no se usa en los caminos del lote.
      try { body = Object.fromEntries(opts.body); } catch (e) { body = {}; }
    }
  }
  const q = Object.fromEntries(u.searchParams.entries());
  const token = body.access_token || q.access_token || '';

  // ---------- Instagram Login (flujo histórico, intacto) ----------
  if (host === 'api.instagram.com' && u.pathname === '/oauth/access_token') {
    const igId = body.code === 'IGCODE_D' ? 555009 : 555001;
    return json({ access_token: 'IG_SHORT', user_id: igId, permissions: [] });
  }
  if (host === 'graph.instagram.com') {
    if (u.pathname === '/access_token') return json({ access_token: 'IG_LONG', token_type: 'bearer', expires_in: 5183944 });
    if (u.pathname === '/refresh_access_token') return json({ access_token: 'IG_LONG', token_type: 'bearer', expires_in: 5183944 });
    const mProf = u.pathname.match(/^\/v[\d.]+\/(\d+)$/);
    if (mProf && method === 'GET') return json({ id: mProf[1], username: 'cliente.test', account_type: 'BUSINESS' });
    // análisis de fondo, medios, insights del IG: vacío determinista.
    return json({ data: [] });
  }

  // ---------- Graph de Facebook ----------
  if (host === 'graph.facebook.com') {
    const p = u.pathname.replace(/^\/v[\d.]+/, '');
    record({ method, path: p, token, body });
    // Canje del login unificado (code → SUAT): GET con query params.
    if (p === '/oauth/access_token') return json({ access_token: suatFor(q.code || body.code || ''), token_type: 'bearer' });
    if (p === '/me' && method === 'GET') return json({ id: 'BISU1', name: 'Integración Posty' });
    if (p === '/me/permissions') return json({ data: [{ permission: 'ads_management', status: 'granted' }, { permission: 'ads_read', status: 'granted' }] });
    if (p === '/me/adaccounts') return json({ data: adAccountsFor(token) });
    if (p === '/me/accounts') return json({ data: pagesFor(token) });
    if (/^\/act_\d+$/.test(p) && method === 'GET') return json({ currency: 'USD', id: p.slice(1) });
    if (/^\/\d+$/.test(p) && method === 'GET' && q.fields && q.fields.includes('boost_eligibility_info')) {
      return json({ id: p.slice(1), boost_eligibility_info: { eligible: true, ineligibility_reasons: [] } });
    }
    if (p === '/555111' && method === 'GET') {
      return json({ id: '555111', name: 'Página Cliente', about: 'Panadería artesanal de barrio', description: 'Panadería artesanal de barrio, medialunas y tortas por encargo.', website: 'https://cliente.example', category: 'Bakery', link: 'https://facebook.com/555111' });
    }
    if (p === '/555111/ratings') return json({ data: [] });
    if (/insights$/.test(p)) return json({ data: [] });
    // (RE-RIELADO) Estados para la costura del fee: campaña y conjunto
    // quedan ACTIVE (el encendido del paso 5 de createBoost ya corrió).
    if (method === 'GET' && q.fields === 'status') return json({ id: p.slice(1), status: 'ACTIVE' });
    if (method === 'POST' && /\/campaigns$/.test(p)) {
      if (token === 'SUAT_FALLA') return json({ error: { message: 'stub: la cuenta del cliente rechazó la creación', code: 190, type: 'OAuthException' } }, 400);
      stubSeq++;
      return json({ id: 'CAMP_' + stubSeq });
    }
    if (method === 'POST' && /\/adsets$/.test(p)) return json({ id: 'ADSET_' + stubSeq });
    if (method === 'POST' && /\/adcreatives$/.test(p)) return json({ id: 'CRE_STUB' });
    if (method === 'POST' && /\/ads$/.test(p)) return json({ id: 'AD_STUB' });
    if (method === 'POST' && /^\/\w+$/.test(p)) return json({ success: true });
    return json({ data: [] });
  }

  return realFetch(url, opts);
}

function install() {
  if (globalThis.__metaStubInstalled) return;
  globalThis.__metaStubInstalled = true;
  globalThis.fetch = stubFetch;
  // (RE-RIELADO) Cliente Stripe falso: registra cada PaymentIntent
  // creado (monto, customer, tarjeta, clave de idempotencia) en
  // STRIPE_STUB_LOG y lo da por exitoso. La tarjeta guardada se
  // resuelve por customers.retrieve (default_payment_method).
  const slog = process.env.STRIPE_STUB_LOG || '';
  if (slog) {
    try {
      const sb = require(require('path').join(process.cwd(), 'stripe-billing.js'));
      let piSeq = 0;
      const rec = (entry) => { try { require('fs').appendFileSync(slog, JSON.stringify(entry) + '\n'); } catch (e) {} };
      sb._setClient({
        customers: { retrieve: async (id) => ({ id, invoice_settings: { default_payment_method: 'pm_test_123' } }) },
        paymentMethods: {
          list: async () => ({ data: [{ id: 'pm_test_123' }] }),
          retrieve: async (id) => ({ id, card: { brand: 'visa', last4: '4242' } }),
        },
        paymentIntents: {
          create: async (params, opts) => {
            piSeq++;
            rec({ amount: params.amount, currency: params.currency, customer: params.customer, payment_method: params.payment_method, off_session: params.off_session, idempotencyKey: (opts && opts.idempotencyKey) || '', tipo: (params.metadata && params.metadata.tipo) || '' });
            return { id: 'pi_stub_' + piSeq, status: 'succeeded' };
          },
        },
      });
    } catch (e) { /* sin stripe-billing: la suite lo detecta por la ausencia del log */ }
  }
}

if (process.env.META_STUB_AUTOINSTALL === '1') install();

module.exports = { install, calls, stubFetch };
