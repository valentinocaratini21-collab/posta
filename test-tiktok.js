// test-tiktok.js — Módulo TikTok (Login Kit + Content Posting API).
// Corre SIN red: fetch stubbeado con la forma real de la API v2 y la
// base es node:sqlite en memoria con la DDL real de db.js.
// Cubre: fail-closed sin credenciales (la conexión se muestra honesta,
// jamás un éxito simulado), URL de autorización con los 3 scopes, alta/
// baja de cuenta, refresh de token vencido, elección de privacidad
// desde creator_info (sin auditoría = SELF_ONLY; público solo si
// TikTok lo ofrece; ante error de red, default seguro SELF_ONLY) y los
// payloads de Direct Post (video/foto) y de bandeja (video.upload).
'use strict';

const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

// ---------- entorno y fetch stub ----------
const ENV0 = { k: process.env.TIKTOK_CLIENT_KEY, s: process.env.TIKTOK_CLIENT_SECRET };
const fetchReal = global.fetch;
let fetchCalls = [];
let fetchPlan = null; // fn(url, opts) → {status, json} | throw
global.fetch = async (url, opts = {}) => {
  fetchCalls.push({ url: String(url), opts });
  if (!fetchPlan) throw new Error('fetch sin plan en el test');
  const r = await fetchPlan(String(url), opts);
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => r.json,
  };
};
function callsTo(substr) { return fetchCalls.filter((c) => c.url.includes(substr)); }

const tt = require('./tiktok.js');

// ---------- DB real (DDL de db.js) ----------
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE tiktok_accounts (
  user_id INTEGER PRIMARY KEY,
  tiktok_user_id TEXT DEFAULT '',
  username TEXT DEFAULT '',
  access_token TEXT DEFAULT '',
  refresh_token TEXT DEFAULT '',
  expires_at INTEGER DEFAULT 0,
  scope TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

(async () => {
  // ===== fail-closed sin credenciales =====
  delete process.env.TIKTOK_CLIENT_KEY; delete process.env.TIKTOK_CLIENT_SECRET;
  ok('sin credenciales: configured() = false', tt.configured() === false);
  process.env.TIKTOK_CLIENT_KEY = 'key_test';
  ok('solo client key: configured() = false', tt.configured() === false);
  process.env.TIKTOK_CLIENT_SECRET = 'secret_test';
  ok('con ambas credenciales: configured() = true', tt.configured() === true);

  // ===== URL de autorización =====
  const auth = tt.buildAuthUrl('https://postyhacetodo.com/api/tiktok/callback', 'st123');
  const aq = new URL(auth).searchParams;
  ok('auth url: client_key', aq.get('client_key') === 'key_test');
  ok('auth url: scopes user.info.basic + video.publish + video.upload',
    aq.get('scope') === 'user.info.basic,video.publish,video.upload', aq.get('scope'));
  ok('auth url: redirect_uri exacta', aq.get('redirect_uri') === 'https://postyhacetodo.com/api/tiktok/callback');
  ok('auth url: response_type=code y state', aq.get('response_type') === 'code' && aq.get('state') === 'st123');

  // ===== alta / lectura / baja de cuenta =====
  tt.saveAccount(db, 7, { open_id: 'oid7', access_token: 'AT1', refresh_token: 'RT1', expires_in: 86400, scope: tt.SCOPES }, 'negocio.7');
  const acc = tt.getAccount(db, 7);
  ok('saveAccount/getAccount: guarda token y username', !!acc && acc.access_token === 'AT1' && acc.username === 'negocio.7');
  ok('saveAccount: expires_at a futuro', acc.expires_at > Date.now());
  tt.saveAccount(db, 7, { open_id: 'oid7', access_token: 'AT2', refresh_token: 'RT2', expires_in: 86400, scope: tt.SCOPES }, 'negocio.7');
  ok('saveAccount: reconectar pisa el token (una fila por usuario)', tt.getAccount(db, 7).access_token === 'AT2');
  tt.deleteAccount(db, 7);
  ok('deleteAccount: la cuenta desaparece', tt.getAccount(db, 7) === null);

  // ===== token vigente no se refresca; vencido sí =====
  tt.saveAccount(db, 8, { open_id: 'oid8', access_token: 'AT_OK', refresh_token: 'RT8', expires_in: 86400, scope: tt.SCOPES }, 'ocho');
  fetchCalls = []; fetchPlan = () => { throw new Error('no debería llamar a la red'); };
  ok('token vigente: getValidToken no toca la red', (await tt.getValidToken(db, 8)) === 'AT_OK' && fetchCalls.length === 0);

  tt.saveAccount(db, 9, { open_id: 'oid9', access_token: 'AT_VIEJO', refresh_token: 'RT9', expires_in: -10, scope: tt.SCOPES }, 'nueve');
  fetchCalls = [];
  fetchPlan = (url) => {
    if (url.includes('/v2/oauth/token/')) return { status: 200, json: { access_token: 'AT_NUEVO', refresh_token: 'RT9B', expires_in: 86400, open_id: 'oid9', scope: tt.SCOPES } };
    throw new Error('url inesperada ' + url);
  };
  const tok9 = await tt.getValidToken(db, 9);
  ok('token vencido: se refresca contra /v2/oauth/token/', tok9 === 'AT_NUEVO' && callsTo('/v2/oauth/token/').length === 1);
  ok('token vencido: el nuevo queda guardado', tt.getAccount(db, 9).access_token === 'AT_NUEVO');
  const form = new URLSearchParams(callsTo('/v2/oauth/token/')[0].opts.body);
  ok('refresh: grant_type + refresh_token correctos', form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'RT9');

  // ===== user info =====
  fetchPlan = (url) => url.includes('/v2/user/info/')
    ? { status: 200, json: { data: { user: { open_id: 'oid9', username: 'nueve', display_name: 'Nueve' } }, error: { code: 'ok' } } }
    : { status: 404, json: {} };
  const ui = await tt.fetchUserInfo('AT_NUEVO');
  ok('fetchUserInfo: devuelve el usuario', ui.username === 'nueve');

  // ===== privacidad desde creator_info =====
  function planCreator(optionsOrError, capture) {
    return (url, opts) => {
      if (url.includes('/creator_info/query/')) {
        if (optionsOrError === 'ERROR') throw new Error('red caída');
        return { status: 200, json: { data: { privacy_level_options: optionsOrError }, error: { code: 'ok' } } };
      }
      if (url.includes('/video/init/') || url.includes('/inbox/') || url.includes('/content/init/')) {
        capture.push({ url, body: JSON.parse(opts.body) });
        return { status: 200, json: { data: { publish_id: 'pub_123' }, error: { code: 'ok' } } };
      }
      throw new Error('url inesperada ' + url);
    };
  }
  let sent = [];
  fetchPlan = planCreator(['SELF_ONLY'], sent);
  let out = await tt.publishVideo({ accessToken: 'AT', videoUrl: 'https://postyhacetodo.com/media/reel.mp4', title: 'Mi reel' });
  ok('sin auditoría: Direct Post sale SELF_ONLY', out.publishId === 'pub_123' && out.privacyLevel === 'SELF_ONLY', out);
  ok('Direct Post video: PULL_FROM_URL con la URL del reel',
    sent[0].body.source_info.source === 'PULL_FROM_URL' && sent[0].body.source_info.video_url.endsWith('reel.mp4'));
  ok('Direct Post video: endpoint /post/publish/video/init/', sent[0].url.includes('/v2/post/publish/video/init/'));

  sent = [];
  fetchPlan = planCreator(['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], sent);
  out = await tt.publishVideo({ accessToken: 'AT', videoUrl: 'https://postyhacetodo.com/media/reel.mp4', title: 'Mi reel' });
  ok('con auditoría: público solo si creator_info lo ofrece', out.privacyLevel === 'PUBLIC_TO_EVERYONE');

  sent = [];
  fetchPlan = planCreator('ERROR', sent);
  out = await tt.publishVideo({ accessToken: 'AT', videoUrl: 'https://postyhacetodo.com/media/reel.mp4', title: 'Mi reel' });
  ok('creator_info caído: default seguro SELF_ONLY', out.privacyLevel === 'SELF_ONLY');

  // ===== bandeja (video.upload) =====
  sent = [];
  fetchPlan = (url, opts) => {
    if (url.includes('/inbox/video/init/')) { sent.push({ url, body: JSON.parse(opts.body) }); return { status: 200, json: { data: { publish_id: 'inb_1' }, error: { code: 'ok' } } }; }
    throw new Error('la bandeja no debe consultar creator_info ni post_info: ' + url);
  };
  out = await tt.publishVideoInbox({ accessToken: 'AT', videoUrl: 'https://postyhacetodo.com/media/reel.mp4' });
  ok('inbox: devuelve publish_id', out.publishId === 'inb_1');
  ok('inbox: endpoint /post/publish/inbox/video/init/', sent[0].url.includes('/v2/post/publish/inbox/video/init/'));
  ok('inbox: payload SOLO source_info PULL_FROM_URL (sin post_info)',
    sent[0].body.source_info.source === 'PULL_FROM_URL' && !('post_info' in sent[0].body), sent[0].body);

  // ===== foto (Direct Post de fotos) =====
  sent = [];
  fetchPlan = planCreator(['SELF_ONLY'], sent);
  out = await tt.publishPhoto({ accessToken: 'AT', imageUrls: ['https://postyhacetodo.com/media/a.jpg'], title: 'Título', description: 'Descripción' });
  ok('foto: DIRECT_POST + media_type PHOTO', sent[0].body.post_mode === 'DIRECT_POST' && sent[0].body.media_type === 'PHOTO');
  ok('foto: endpoint /post/publish/content/init/', sent[0].url.includes('/v2/post/publish/content/init/'));

  // ===== errores de la API: se propagan, nunca éxito simulado =====
  fetchPlan = () => ({ status: 200, json: { error: { code: 'access_token_invalid', message: 'token malo' } } });
  let lanzo = false;
  try { await tt.publishVideo({ accessToken: 'AT', videoUrl: 'https://postyhacetodo.com/media/reel.mp4', title: 'x' }); }
  catch (e) { lanzo = /token malo/.test(e.message); }
  ok('error de TikTok: publishVideo lanza (nada de éxito falso)', lanzo);

  // ===== exchangeCode: error OAuth se propaga =====
  fetchPlan = () => ({ status: 400, json: { error: 'invalid_grant', error_description: 'code vencido' } });
  lanzo = false;
  try { await tt.exchangeCode('code_x', 'https://postyhacetodo.com/api/tiktok/callback'); }
  catch (e) { lanzo = /code vencido/.test(e.message); }
  ok('exchangeCode: el error de TikTok llega tal cual', lanzo);

  global.fetch = fetchReal;
  if (ENV0.k === undefined) delete process.env.TIKTOK_CLIENT_KEY; else process.env.TIKTOK_CLIENT_KEY = ENV0.k;
  if (ENV0.s === undefined) delete process.env.TIKTOK_CLIENT_SECRET; else process.env.TIKTOK_CLIENT_SECRET = ENV0.s;

  console.log(`\n== RESULTADO: ${pass} ok, ${fail} fail ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
