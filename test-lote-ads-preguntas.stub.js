// test-lote-ads-preguntas.stub.js — Meta + Stripe deterministas para
// la suite del LOTE ADS-PREGUNTAS. Deriva del stub del LOTE
// CIERRE-ADS y suma lo de este lote:
//   - Audiencias personalizadas (GET/POST /act_{id}/customaudiences):
//     la de interacción «Posty · Ya te vieron · IG <id>» existe o no
//     según el control (engagementExiste para la cuenta del cliente
//     act_777001/IG 555001; engagementExistePosty para la de Posty
//     act_123456/IG 999001); la creación devuelve AUD_ENG_CREADA y su
//     cuerpo queda en el log para verificar subtype/regla/retención;
//     con engagementTerminos la creación rechaza con el error de los
//     Términos de Audiencias Personalizadas (code 200 +
//     error_user_msg), como Meta.
//   - Insights con la acción de visitas al perfil
//     (insightsVisitasPerfil): onsite_conversion.profile_visit = 4 y
//     conversaciones = 2, para el barrido de resultados.
// Se carga de dos maneras:
//   - En el server de prueba: NODE_OPTIONS=--require <este archivo>
//     con META_STUB_AUTOINSTALL=1, META_STUB_LOG, STRIPE_STUB_LOG y
//     META_STUB_CONTROL (interruptores del escenario).
//   - En la suite: require() + install() para la parte de módulo.
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

const objetos = new Map(); // id -> { kind, status, media }
let seq = 0;
const creativeMedia = new Map(); // creative_id -> ig_media_id

function adAccountsFor(token) {
  if (token === 'SUAT_TEST') return [{ id: 'act_777001', account_id: '777001', name: 'Cuenta del Cliente', currency: 'USD', account_status: 1, business: { id: 'BIZ900', name: 'Negocio Cliente' } }];
  if (token === 'TOKEN_POSTY') return [{ id: 'act_123456', account_id: '123456', name: 'Posty', currency: 'USD', account_status: 1 }];
  return [];
}
function pagesFor(token) {
  if (token === 'SUAT_TEST') return [{ id: '555111', name: 'Página Cliente', instagram_business_account: { id: '555001' } }];
  if (token === 'TOKEN_POSTY') return [{ id: '447205365133941', name: 'Posty', instagram_business_account: { id: '999001' } }];
  return [];
}

// Las audiencias de una cuenta según el escenario: siempre una
// LOOKALIKE (el parecidos histórico) y, si el control lo dice, la
// de interacción de ESTE lote ya creada.
function audienciasDe(cuenta) {
  const c = control();
  const rows = [{ id: 'AUD_LOOK_1', name: 'Parecida a seguidores', subtype: 'LOOKALIKE' }];
  if (cuenta === '777001' && c.engagementExiste) rows.push({ id: 'AUD_ENG_EXISTE', name: 'Posty · Ya te vieron · IG 555001', subtype: 'ENGAGEMENT' });
  if (cuenta === '123456' && c.engagementExistePosty) rows.push({ id: 'AUD_ENG_POSTY', name: 'Posty · Ya te vieron · IG 999001', subtype: 'ENGAGEMENT' });
  return rows;
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

  if (host === 'api.instagram.com' && u.pathname === '/oauth/access_token') {
    return json({ access_token: 'IG_SHORT', user_id: 555001, permissions: [] });
  }
  if (host === 'graph.instagram.com') {
    if (u.pathname === '/access_token' || u.pathname === '/refresh_access_token') return json({ access_token: 'IG_LONG', token_type: 'bearer', expires_in: 5183944 });
    const mProf = u.pathname.match(/^\/v[\d.]+\/(\d+)$/);
    if (mProf && method === 'GET') return json({ id: mProf[1], username: 'postycommunitymanager', account_type: 'BUSINESS' });
    return json({ data: [] });
  }

  if (host === 'graph.facebook.com') {
    const p = u.pathname.replace(/^\/v[\d.]+/, '');
    record({ method, path: p, token, body });
    if (p === '/oauth/access_token') return json({ access_token: 'SUAT_TEST', token_type: 'bearer' });
    if (p === '/me' && method === 'GET') return json({ id: 'BISU1', name: 'Integración Posty' });
    if (p === '/me/permissions') return json({ data: [{ permission: 'ads_management', status: 'granted' }, { permission: 'ads_read', status: 'granted' }] });
    if (p === '/me/adaccounts') return json({ data: adAccountsFor(token) });
    if (p === '/me/businesses') return json({ data: [] });
    if (p === '/me/accounts') return json({ data: pagesFor(token) });

    // ── (LOTE ADS-PREGUNTAS) Audiencias personalizadas ──
    const mAud = p.match(/^\/act_(\d+)\/customaudiences$/);
    if (mAud && method === 'GET') return json({ data: audienciasDe(mAud[1]) });
    if (mAud && method === 'POST') {
      if (control().engagementTerminos) {
        return json({ error: { message: 'You must accept the Custom Audience Terms before creating this audience', code: 200, type: 'OAuthException', error_user_title: 'Accept the Custom Audience Terms', error_user_msg: 'You must accept the Custom Audience Terms in Ads Manager before Posty can create this audience.', fbtrace_id: 'stub-trace' } }, 400);
      }
      return json({ id: 'AUD_ENG_CREADA' });
    }

    // Insights: gasto > 0 para las campañas creadas por el stub; con
    // el interruptor, también las acciones de visitas y mensajes.
    if (/\/insights$/.test(p)) {
      const filtro = JSON.stringify(q);
      if (filtro.includes('CAMP_')) {
        const actions = control().insightsVisitasPerfil
          ? [{ action_type: 'onsite_conversion.profile_visit', value: '4' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '2' }]
          : [];
        return json({ data: [{ spend: '3.25', reach: '120', impressions: '340', clicks: '7', actions }] });
      }
      return json({ data: [] });
    }
    if (/^\/act_\d+$/.test(p) && method === 'GET') return json({ currency: 'USD', id: p.slice(1) });

    const mCamps = p.match(/^\/act_(\d+)\/campaigns$/);
    if (mCamps && method === 'GET') {
      const propias = [...objetos.entries()].filter(([, o]) => o.kind === 'campaign').map(([id, o]) => ({ id, name: o.name || '', status: o.status }));
      return json({ data: propias });
    }
    const mCampAds = p.match(/^\/(\w+)\/ads$/);
    if (mCampAds && method === 'GET') {
      const ads = [...objetos.entries()].filter(([, o]) => o.kind === 'ad' && o.campaignId === mCampAds[1]).map(([id, o]) => ({ id, status: o.status }));
      return json({ data: ads });
    }
    const mCampAdsets = p.match(/^\/(\w+)\/adsets$/);
    if (mCampAdsets && method === 'GET') {
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
      objetos.set(id, { kind: 'ad', status: 'ACTIVE', campaignId: adset.campaignId || '', media });
      return json({ id });
    }

    const mObj = p.match(/^\/([\w-]+)$/);
    if (mObj && method === 'GET') {
      const id = mObj[1];
      if (q.fields && q.fields.includes('boost_eligibility_info')) {
        return json({ id, boost_eligibility_info: { eligible: true, ineligibility_reasons: [] } });
      }
      if (q.fields && q.fields.includes('owner')) {
        // El dueño del medio: MEDIA_CLI es del Instagram del cliente
        // (555001, el de su Página); el resto, del de Posty (999001).
        return json({ id, owner: { id: id === 'MEDIA_CLI' ? '555001' : '999001', username: 'postycommunitymanager' } });
      }
      if (q.fields && q.fields.includes('instagram_business_account')) {
        if (id === '447205365133941') return json({ id, instagram_business_account: { id: '999001', username: 'postycommunitymanager' } });
        if (id === '555111') return json({ id, instagram_business_account: { id: '555001', username: 'postycommunitymanager' } });
        return json({ id });
      }
      if (q.fields === 'status') {
        const o = objetos.get(id);
        if (o) return json({ id, status: o.status });
        return graphError('stub: objeto inexistente', 100, 404);
      }
      return json({ id });
    }
    if (mObj && method === 'POST') {
      const o = objetos.get(mObj[1]);
      if (o && body.status) o.status = body.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
      return json({ success: true });
    }
    // Búsquedas de targeting y demás lecturas: vacío determinista.
    return json({ data: [] });
  }

  return realFetch(url, opts);
}

function install() {
  if (globalThis.__adsPreguntasStubInstalled) return;
  globalThis.__adsPreguntasStubInstalled = true;
  globalThis.fetch = stubFetch;
  const slog = process.env.STRIPE_STUB_LOG || '';
  if (slog) {
    try {
      const sb = require(require('path').join(process.cwd(), 'stripe-billing.js'));
      let piSeq = 0;
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
            rec({ tipo: 'payment_intent', id: 'pi_stub_' + piSeq, amount: params.amount, currency: params.currency, customer: params.customer, payment_method: params.payment_method, off_session: params.off_session, idempotencyKey: (opts && opts.idempotencyKey) || '', metadata_tipo: (params.metadata && params.metadata.tipo) || '' });
            return { id: 'pi_stub_' + piSeq, status: 'succeeded' };
          },
        },
        refunds: {
          create: async (params, opts) => {
            rec({ tipo: 'refund', payment_intent: params.payment_intent || '', idempotencyKey: (opts && opts.idempotencyKey) || '' });
            return { id: 're_stub_1', status: 'succeeded' };
          },
        },
      });
    } catch (e) { /* sin stripe-billing: la suite lo detecta por la ausencia del log */ }
  }
}

if (process.env.META_STUB_AUTOINSTALL === '1') install();

module.exports = { install, calls, stubFetch, objetos };
