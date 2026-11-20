// test-lote-cierre-ads.stub.js — Meta + Stripe deterministas para la
// suite del LOTE CIERRE-ADS. Deriva del stub del LOTE
// IMPULSAR-DIRECTO-RE-RIELADO y suma: lectura de estado del ANUNCIO
// (la verificación completa del FIX 1), escenarios de activación por
// media, las huérfanas de la reconciliación y refunds de Stripe.
// Se carga de dos maneras:
//   - En el server de prueba: NODE_OPTIONS=--require <este archivo>
//     con META_STUB_AUTOINSTALL=1 (parcha globalThis.fetch del proceso
//     hijo), META_STUB_LOG=<ruta jsonl> (llamadas a graph.facebook.com),
//     STRIPE_STUB_LOG=<ruta jsonl> (PaymentIntents y refunds) y
//     META_STUB_CONTROL=<ruta json> (interruptores del escenario).
//   - En la suite: require() + install() para la parte de módulo.
// Escenarios por ig_media_id (la creación):
//   MEDIA_OK        → todo activa; las tres lecturas dan ACTIVE.
//   MEDIA_ADPAUSED  → el anuncio NO activa mientras el control diga
//                     {"adActivable": false} (default para este media);
//                     con true, el POST de encendido (el del barrido)
//                     sí lo activa.
//   MEDIA_NODATA    → las lecturas de estado de sus objetos devuelven
//                     error de Graph → verificación «sin dato».
//   MEDIA_FALLA     → el paso creativo rechaza (code 100, el texto
//                     histórico del instagram_user_id inválido).
// Huérfanas (reconciliación): la cuenta act_777009 (SUAT_HUERF) lista
// dos campañas «Posty · Impulso u<uid> · p<post>» — uid y posteos
// salen del control ({"huerfanasUid":N,"huerfanaPost1":id,
// "huerfanaPost2":id}): CAMP_H1 sin anuncios (se archiva) y CAMP_H2
// con un anuncio pausado que sí activa al re-encender.
// Todo lo que no es *.facebook.com / *.instagram.com pasa al fetch real.
'use strict';
const fs = require('fs');

const calls = [];
const realFetch = globalThis.fetch;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function graphError(message, code, status) {
  return json({ error: { message, code: code || 100, type: 'OAuthException', fbtrace_id: 'stub-trace' } }, status || 400);
}
function record(entry) {
  calls.push(entry);
  const logPath = process.env.META_STUB_LOG || '';
  if (logPath) { try { fs.appendFileSync(logPath, JSON.stringify(entry) + '\n'); } catch (e) {} }
}
function control() {
  try { return JSON.parse(fs.readFileSync(process.env.META_STUB_CONTROL || '', 'utf8')); } catch (e) { return {}; }
}

// Estado de objetos de Meta creados por el stub.
const objetos = new Map(); // id -> { kind, status, nodata, media }
let seq = 0;
const creativeMedia = new Map(); // creative_id -> ig_media_id
let lastAdsetId = '';

function adAccountsFor(token) {
  if (token === 'SUAT_TEST') return [{ id: 'act_777001', account_id: '777001', name: 'Cuenta del Cliente', currency: 'USD', account_status: 1, business: { id: 'BIZ900', name: 'Negocio Cliente' } }];
  if (token === 'SUAT_HUERF') return [{ id: 'act_777009', account_id: '777009', name: 'Cuenta Huérfanas', currency: 'USD', account_status: 1, business: { id: 'BIZ909', name: 'Negocio Huérfanas' } }];
  if (token === 'TOKEN_POSTY') return [{ id: 'act_123456', account_id: '123456', name: 'Posty', currency: 'USD', account_status: 1 }];
  return [];
}
function pagesFor(token) {
  if (token === 'SUAT_TEST' || token === 'SUAT_HUERF') return [{ id: '555111', name: 'Página Cliente', instagram_business_account: { id: '555001' } }];
  if (token === 'TOKEN_POSTY') return [{ id: '447205365133941', name: 'Posty', instagram_business_account: { id: '999001' } }];
  return [];
}

// Las dos huérfanas de la reconciliación (cuenta act_777009).
function huerfanas() {
  const c = control();
  const uid = c.huerfanasUid || 0;
  return [
    { id: 'CAMP_H1', name: `Posty · Impulso u${uid} · p${c.huerfanaPost1 || 0}`, status: 'PAUSED' },
    { id: 'CAMP_H2', name: `Posty · Impulso u${uid} · p${c.huerfanaPost2 || 0}`, status: 'PAUSED' },
  ];
}
function estadoHuerfana(id) {
  if (!objetos.has(id)) {
    if (id === 'CAMP_H1') objetos.set(id, { kind: 'campaign', status: 'PAUSED' });
    if (id === 'ADSET_H1') objetos.set(id, { kind: 'adset', status: 'PAUSED', lifetime_budget: 2000 });
    if (id === 'CAMP_H2') objetos.set(id, { kind: 'campaign', status: 'PAUSED' });
    if (id === 'ADSET_H2') objetos.set(id, { kind: 'adset', status: 'PAUSED', lifetime_budget: 2000 });
    if (id === 'AD_H2') objetos.set(id, { kind: 'ad', status: 'PAUSED' });
  }
  return objetos.get(id);
}

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
      try { body = Object.fromEntries(opts.body); } catch (e) { body = {}; }
    }
  }
  const q = Object.fromEntries(u.searchParams.entries());
  const token = body.access_token || q.access_token || '';

  // ---------- Instagram Login / graph.instagram.com ----------
  if (host === 'api.instagram.com' && u.pathname === '/oauth/access_token') {
    return json({ access_token: 'IG_SHORT', user_id: 555001, permissions: [] });
  }
  if (host === 'graph.instagram.com') {
    if (u.pathname === '/access_token' || u.pathname === '/refresh_access_token') return json({ access_token: 'IG_LONG', token_type: 'bearer', expires_in: 5183944 });
    const mProf = u.pathname.match(/^\/v[\d.]+\/(\d+)$/);
    if (mProf && method === 'GET') return json({ id: mProf[1], username: 'postycommunitymanager', account_type: 'BUSINESS' });
    return json({ data: [] });
  }

  // ---------- Graph de Facebook ----------
  if (host === 'graph.facebook.com') {
    const p = u.pathname.replace(/^\/v[\d.]+/, '');
    record({ method, path: p, token, body });
    if (p === '/oauth/access_token') return json({ access_token: 'SUAT_TEST', token_type: 'bearer' });
    if (p === '/me' && method === 'GET') return json({ id: 'BISU1', name: 'Integración Posty' });
    if (p === '/me/permissions') return json({ data: [{ permission: 'ads_management', status: 'granted' }, { permission: 'ads_read', status: 'granted' }] });
    if (p === '/me/adaccounts') return json({ data: adAccountsFor(token) });
    if (p === '/me/businesses') return json({ data: [] });
    if (p === '/me/accounts') return json({ data: pagesFor(token) });

    // Insights: gasto > 0 para las campañas creadas por el stub.
    if (/\/insights$/.test(p)) {
      const filtro = JSON.stringify(q);
      if (filtro.includes('CAMP_')) {
        return json({ data: [{ spend: '3.25', reach: '120', impressions: '340', clicks: '7', actions: [] }] });
      }
      return json({ data: [] });
    }
    // Cuenta publicitaria: moneda USD.
    if (/^\/act_\d+$/.test(p) && method === 'GET') return json({ currency: 'USD', id: p.slice(1) });

    // Campañas de una cuenta: la de huérfanas trae las dos del 17/11.
    const mCamps = p.match(/^\/act_(\d+)\/campaigns$/);
    if (mCamps && method === 'GET') {
      if (mCamps[1] === '777009') return json({ data: huerfanas() });
      const propias = [...objetos.entries()].filter(([, o]) => o.kind === 'campaign').map(([id, o]) => ({ id, name: o.name || '', status: o.status }));
      return json({ data: propias });
    }
    // Anuncios / conjuntos de una campaña.
    const mCampAds = p.match(/^\/(\w+)\/ads$/);
    if (mCampAds && method === 'GET') {
      if (mCampAds[1] === 'CAMP_H1') return json({ data: [] });
      if (mCampAds[1] === 'CAMP_H2') { const a = estadoHuerfana('AD_H2'); return json({ data: [{ id: 'AD_H2', status: a.status }] }); }
      const ads = [...objetos.entries()].filter(([, o]) => o.kind === 'ad' && o.campaignId === mCampAds[1]).map(([id, o]) => ({ id, status: o.status }));
      return json({ data: ads });
    }
    const mCampAdsets = p.match(/^\/(\w+)\/adsets$/);
    if (mCampAdsets && method === 'GET') {
      if (mCampAdsets[1] === 'CAMP_H1') { const a = estadoHuerfana('ADSET_H1'); return json({ data: [{ id: 'ADSET_H1', status: a.status, lifetime_budget: 2000 }] }); }
      if (mCampAdsets[1] === 'CAMP_H2') { const a = estadoHuerfana('ADSET_H2'); return json({ data: [{ id: 'ADSET_H2', status: a.status, lifetime_budget: 2000 }] }); }
      const sets = [...objetos.entries()].filter(([, o]) => o.kind === 'adset' && o.campaignId === mCampAdsets[1]).map(([id, o]) => ({ id, status: o.status, lifetime_budget: 2000 }));
      return json({ data: sets });
    }

    // Creación: campaña → conjunto → creativo → anuncio.
    if (method === 'POST' && /\/campaigns$/.test(p)) {
      seq++;
      const id = 'CAMP_' + seq;
      objetos.set(id, { kind: 'campaign', status: 'PAUSED', name: body.name || '' });
      return json({ id });
    }
    if (method === 'POST' && /\/adsets$/.test(p)) {
      const id = 'ADSET_' + seq;
      lastAdsetId = id;
      objetos.set(id, { kind: 'adset', status: 'PAUSED', campaignId: body.campaign_id || '' });
      return json({ id });
    }
    if (method === 'POST' && /\/adcreatives$/.test(p)) {
      if (body.source_instagram_media_id === 'MEDIA_FALLA') {
        return graphError('(#100) Param instagram_user_id must be a valid Instagram account id', 100, 400);
      }
      seq++;
      const id = 'CRE_' + seq;
      creativeMedia.set(id, String(body.source_instagram_media_id || ''));
      return json({ id });
    }
    if (method === 'POST' && /\/ads$/.test(p)) {
      seq++;
      const id = 'AD_' + seq;
      const media = creativeMedia.get((body.creative && body.creative.creative_id) || '') || '';
      const adset = objetos.get(body.adset_id) || {};
      // MEDIA_ADPAUSED: el anuncio nace PAUSED aunque el alta pida
      // ACTIVE (Meta no lo encendió de verdad — el defecto que el
      // lote cierra: campaña y conjunto ACTIVE, anuncio apagado).
      objetos.set(id, { kind: 'ad', status: media === 'MEDIA_ADPAUSED' ? 'PAUSED' : 'ACTIVE', campaignId: adset.campaignId || '', media, nodata: media === 'MEDIA_NODATA' });
      // La nodata se contagia a la campaña y al conjunto del media.
      if (media === 'MEDIA_NODATA') {
        if (adset.campaignId && objetos.has(adset.campaignId)) objetos.get(adset.campaignId).nodata = true;
        if (objetos.has(body.adset_id)) objetos.get(body.adset_id).nodata = true;
      }
      return json({ id });
    }

    // Lecturas de un objeto puntual: estado / elegibilidad / dueño /
    // instagram_business_account de la Página.
    const mObj = p.match(/^\/([\w-]+)$/);
    if (mObj && method === 'GET') {
      const id = mObj[1];
      if (q.fields && q.fields.includes('boost_eligibility_info')) {
        return json({ id, boost_eligibility_info: { eligible: true, ineligibility_reasons: [] } });
      }
      if (q.fields && q.fields.includes('owner')) {
        return json({ id, owner: { id: '999001', username: 'postycommunitymanager' } });
      }
      if (q.fields && q.fields.includes('instagram_business_account')) {
        if (id === '447205365133941') return json({ id, instagram_business_account: { id: '999001', username: 'postycommunitymanager' } });
        if (id === '555111') return json({ id, instagram_business_account: { id: '555001', username: 'postycommunitymanager' } });
        return json({ id });
      }
      if (q.fields === 'status') {
        const o = objetos.get(id) || estadoHuerfana(id);
        if (o && o.nodata) return graphError('stub: lectura de estado sin dato', 1, 500);
        if (o) return json({ id, status: o.status });
        return graphError('stub: objeto inexistente', 100, 404);
      }
      return json({ id });
    }
    // Encendido / archivado de un objeto puntual.
    if (mObj && method === 'POST') {
      const id = mObj[1];
      const o = objetos.get(id) || estadoHuerfana(id);
      if (o && body.status) {
        if (body.status === 'ARCHIVED') { o.status = 'ARCHIVED'; return json({ success: true }); }
        if (body.status === 'ACTIVE') {
          // El anuncio de MEDIA_ADPAUSED solo enciende cuando el
          // control lo habilita (el barrido llega después del flip).
          if (!(o.kind === 'ad' && o.media === 'MEDIA_ADPAUSED' && control().adActivable !== true)) {
            o.status = 'ACTIVE';
          }
          return json({ success: true });
        }
      }
      return json({ success: true });
    }
    // Búsquedas de targeting y demás lecturas: vacío determinista.
    return json({ data: [] });
  }

  return realFetch(url, opts);
}

function install() {
  if (globalThis.__cierreAdsStubInstalled) return;
  globalThis.__cierreAdsStubInstalled = true;
  globalThis.fetch = stubFetch;
  const slog = process.env.STRIPE_STUB_LOG || '';
  if (slog) {
    try {
      const sb = require(require('path').join(process.cwd(), 'stripe-billing.js'));
      let piSeq = 0, rfSeq = 0;
      const rec = (entry) => { try { fs.appendFileSync(slog, JSON.stringify(entry) + '\n'); } catch (e) {} };
      sb._setClient({
        customers: { retrieve: async (id) => ({ id, invoice_settings: { default_payment_method: 'pm_test_123' } }) },
        paymentMethods: {
          list: async () => ({ data: [{ id: 'pm_test_123' }] }),
          retrieve: async (id) => ({ id, card: { brand: 'visa', last4: '4242' } }),
        },
        paymentIntents: {
          create: async (params, opts) => {
            piSeq++;
            const esFee = params.metadata && params.metadata.tipo === 'fee_impulso';
            // Fallo único del fee (control {"feeFallaUnaVez": true}):
            // el cobro de gestión vuelve requires_payment_method UNA
            // vez y el interruptor se consume — el reintento cobra.
            if (esFee && control().feeFallaUnaVez === true) {
              try {
                const cp = process.env.META_STUB_CONTROL || '';
                const c = control(); c.feeFallaUnaVez = false;
                if (cp) fs.writeFileSync(cp, JSON.stringify(c));
              } catch (e) {}
              rec({ tipo: 'payment_intent_fallido', amount: params.amount, currency: params.currency, customer: params.customer, idempotencyKey: (opts && opts.idempotencyKey) || '', metadata_tipo: 'fee_impulso' });
              return { id: 'pi_stub_fallo_' + piSeq, status: 'requires_payment_method' };
            }
            rec({ tipo: 'payment_intent', id: 'pi_stub_' + piSeq, amount: params.amount, currency: params.currency, customer: params.customer, payment_method: params.payment_method, off_session: params.off_session, idempotencyKey: (opts && opts.idempotencyKey) || '', metadata_tipo: (params.metadata && params.metadata.tipo) || '' });
            return { id: 'pi_stub_' + piSeq, status: 'succeeded' };
          },
        },
        refunds: {
          create: async (params, opts) => {
            rfSeq++;
            rec({ tipo: 'refund', payment_intent: params.payment_intent || '', idempotencyKey: (opts && opts.idempotencyKey) || '' });
            return { id: 're_stub_' + rfSeq, status: 'succeeded' };
          },
        },
      });
    } catch (e) { /* sin stripe-billing: la suite lo detecta por la ausencia del log */ }
  }
}

if (process.env.META_STUB_AUTOINSTALL === '1') install();

module.exports = { install, calls, stubFetch, objetos };
