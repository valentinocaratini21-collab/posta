// test-lote-ads-meta-msg.stub.js — LOTE ADS-META-MSG
// Stub determinista de Graph para la suite del lote. Se carga en el
// proceso del server con NODE_OPTIONS=--require y
// META_STUB_AUTOINSTALL=1: parcha globalThis.fetch SOLO para
// graph.facebook.com / graph.instagram.com; el resto pasa al fetch
// real. Las llamadas a graph.facebook.com quedan registradas en
// META_STUB_LOG (JSONL) para aseverar qué se creó y con qué token.
//
// Escenarios por SUAT (la conexión sembrada de cada usuario):
//   SUAT_FRENO → la resolución no puede verificar la dueña del
//     posteo (las cuentas vivas son otras dos, las lecturas del
//     dueño y de la Página fallan): freno ig_no_resuelto.
//   SUAT_CONF  → la dueña leída del medio NO está entre las vivas
//     de la cuenta publicitaria: freno ig_conflicto.
//   SUAT_META  → la resolución cierra (la viva es la que publica)
//     y Meta rechaza la creación de la campaña con su
//     error_user_msg: el rechazo genuino de siempre.
'use strict';
const fs = require('fs');

const realFetch = globalThis.fetch;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function record(entry) {
  const logPath = process.env.META_STUB_LOG || '';
  if (logPath) { try { fs.appendFileSync(logPath, JSON.stringify(entry) + '\n'); } catch (e) {} }
}

const META_USER_MSG = 'Agregá un método de pago a tu cuenta publicitaria para crear la campaña.';

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
      try { body = Object.fromEntries(opts.body); } catch (e) { body = {}; } }
  }
  const q = Object.fromEntries(u.searchParams.entries());
  const token = body.access_token || q.access_token || '';
  const fields = String(q.fields || body.fields || '');

  if (host === 'graph.instagram.com') {
    const mProf = u.pathname.match(/^\/v[\d.]+\/(\d+)$/);
    if (mProf && method === 'GET') return json({ id: mProf[1], username: 'casa.test', account_type: 'BUSINESS' });
    return json({ data: [] });
  }

  if (host === 'graph.facebook.com') {
    const p = u.pathname.replace(/^\/v[\d.]+/, '');
    record({ method, path: p, token });
    if (p === '/me/adaccounts') return json({ data: [{ id: 'act_777001', account_id: '777001', name: 'Cuenta del Cliente', currency: 'USD', account_status: 1, business: { id: 'BIZ900', name: 'Negocio Cliente' } }] });
    if (p === '/me/businesses') return json({ data: [] });
    if (p === '/me/accounts') return json({ data: [{ id: '555111', name: 'Página Cliente', instagram_business_account: { id: '555001', username: 'casa.test' } }] });
    if (p === '/me/permissions') return json({ data: [{ permission: 'ads_management', status: 'granted' }, { permission: 'ads_read', status: 'granted' }] });
    if (p === '/me') return json({ id: 'BISU1', name: 'Integración Posty' });
    if (p === '/act_777001' && method === 'GET') return json({ id: 'act_777001', currency: 'USD', business: { id: 'BIZ900' } });
    if (p === '/act_777001/instagram_accounts') {
      if (token === 'SUAT_CONF') return json({ data: [{ id: '888001', username: 'otra.cuenta' }] });
      if (token === 'SUAT_META') return json({ data: [{ id: '555001', username: 'casa.test' }] });
      return json({ data: [{ id: '888001', username: 'otra.uno' }, { id: '888002', username: 'otra.dos' }] });
    }
    if (p === '/BIZ900/instagram_accounts' || p === '/BIZ900/owned_pages' || p === '/BIZ900/client_pages'
      || p === '/BIZ900/owned_ad_accounts' || p === '/BIZ900/client_ad_accounts') return json({ data: [] });
    // Lecturas sobre el medio: elegibilidad siempre ok; el dueño solo
    // se lee en el escenario de conflicto.
    const mMedia = p.match(/^\/([A-Z_]+)$/);
    if (mMedia && method === 'GET' && fields.includes('boost_eligibility_info')) {
      return json({ id: mMedia[1], boost_eligibility_info: { eligible: true, ineligibility_reasons: [] } });
    }
    if (mMedia && method === 'GET' && fields.includes('owner')) {
      if (token === 'SUAT_CONF') return json({ id: mMedia[1], owner: { id: '555001', username: 'casa.test' } });
      return json({ error: { message: 'stub: la lectura del dueño no está permitida con este token', code: 190, type: 'OAuthException' } }, 400);
    }
    if (p === '/555111' && method === 'GET' && fields.includes('instagram_business_account')) {
      return json({ error: { message: 'stub: la lectura de la Página no está permitida con este token', code: 190, type: 'OAuthException' } }, 400);
    }
    if (method === 'GET' && fields === 'status') return json({ id: p.slice(1), status: 'ACTIVE' });
    if (method === 'POST' && /\/campaigns$/.test(p)) {
      if (token === 'SUAT_META') {
        return json({ error: { message: 'Invalid parameter', code: 100, error_subcode: 1885021, error_user_title: 'Falta un método de pago', error_user_msg: META_USER_MSG, fbtrace_id: 'TRACE_STUB_1' } }, 400);
      }
      return json({ id: 'CAMP_STUB' });
    }
    if (method === 'POST' && /\/adsets$/.test(p)) return json({ id: 'ADSET_STUB' });
    if (method === 'POST' && /\/adcreatives$/.test(p)) return json({ id: 'CRE_STUB' });
    if (method === 'POST' && /\/ads$/.test(p)) return json({ id: 'AD_STUB' });
    if (method === 'POST') return json({ success: true });
    if (/insights$/.test(p)) return json({ data: [] });
    return json({ data: [] });
  }

  return realFetch(url, opts);
}

function install() { globalThis.fetch = stubFetch; }
if (process.env.META_STUB_AUTOINSTALL === '1') install();
module.exports = { install, META_USER_MSG };
