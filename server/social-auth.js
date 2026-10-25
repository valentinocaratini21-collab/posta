// ---------- Login social (Google + Apple) ----------
// Módulo puro de OAuth para Posty: sin secretos hardcodeados, sin valores
// de entorno impresos. Toda credencial llega por variables de entorno
// (nombres, nunca valores, en los reportes).
//
// Flujo (código de autorización, un toque):
//   GET  /api/auth/:provider/start    -> 302 al proveedor (state firmado HMAC)
//   GET  /api/auth/google/callback    -> canje + userinfo + link-or-create
//   POST /api/auth/apple/callback     -> canje + id_token RS256 + link-or-create
//   GET  /api/auth/apple/callback     -> mismo handler (por si response_mode=query)
//   GET  /api/auth/social/providers   -> { google, apple } (solo booleanos)
//   POST /api/auth/device-issue       -> token "Continuar como" para el callback
//
// Reglas:
//  - Sin duplicar cuentas: email existente = VINCULAR (fila en oauth_identities).
//  - Email de Google: exige verified_email (el proveedor lo verifica).
//  - Email de Apple: puede ser relay privado (@privaterelay.appleid.com). Si
//    el relay no matchea ninguna cuenta, se crea la cuenta CON ese relay y
//    queda documentado como límite (no se inventa un linkeo inseguro).
//  - El state viaja firmado (HMAC-SHA256, expira a los 10 min, nonce).
//  - Cuentas solo-sociales guardan un password_hash ALEATORIO e inutilizable
//    (nadie lo conoce): el login con contraseña jamás acierta, y el usuario
//    puede poner contraseña real después por "Olvidé mi contraseña".
//  - El registro y la compra son contratos separados: en #/registro viaja
//    SOLO proveedor. agente/nivel/pais/moneda/plan_sel NO se interpretan acá
//    (pertenecen al deep link de checkout #/app/ajustes?...).
const crypto = require('crypto');

const STATE_TTL_MS = 10 * 60 * 1000;
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_JWKS_TTL_MS = 24 * 3600 * 1000;
let appleJwksCache = null; // { keys, at }

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDec(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}
function safeEq(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Nombres de entorno (nunca valores): Google acepta el par dedicado o el
// genérico (por si el proyecto de Google Business Profile ya usa ese nombre).
function googleCreds(env) {
  return {
    id: env.GOOGLE_OAUTH_CLIENT_ID || env.GOOGLE_CLIENT_ID || '',
    secret: env.GOOGLE_OAUTH_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || '',
  };
}
function appleCreds(env) {
  return {
    serviceId: env.APPLE_SERVICE_ID || '',
    teamId: env.APPLE_TEAM_ID || '',
    keyId: env.APPLE_KEY_ID || '',
    privateKey: env.APPLE_PRIVATE_KEY || '',
  };
}
function socialProviders(env) {
  const g = googleCreds(env);
  const a = appleCreds(env);
  return {
    google: !!(g.id && g.secret),
    apple: !!(a.serviceId && a.teamId && a.keyId && a.privateKey),
  };
}
function stateKey(env) {
  return String(env.SESSION_SECRET || '') + ':posta-oauth-state';
}

function signState(env, payload) {
  const p = Object.assign({}, payload, {
    x: Date.now() + STATE_TTL_MS,
    n: crypto.randomBytes(16).toString('hex'),
  });
  const body = b64u(JSON.stringify(p));
  return body + '.' + hmacHex(stateKey(env), body);
}
function verifyState(env, state) {
  try {
    if (!env.SESSION_SECRET) return null;
    const parts = String(state || '').split('.');
    if (parts.length !== 2) return null;
    if (!safeEq(hmacHex(stateKey(env), parts[0]), parts[1])) return null;
    const p = JSON.parse(b64uDec(parts[0]).toString('utf8'));
    if (p.p !== 'google' && p.p !== 'apple') return null;
    if (!p.x || Date.now() > p.x) return null;
    return p;
  } catch (e) { return null; }
}

// Redirect URI con el mismo patrón que /api/google/connect: el host actual
// manda (los dos dominios de Posty deben estar listados en cada consola).
function redirectUri(req, provider) {
  const host = req.get ? req.get('host') : (req.headers && req.headers.host) || '';
  const scheme = String(host || '').startsWith('localhost') ? 'http' : 'https';
  return scheme + '://' + host + '/api/auth/' + provider + '/callback';
}
function googleAuthUrl(clientId, uri, state) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: uri, response_type: 'code',
    scope: 'openid email profile', access_type: 'online', state,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + q.toString();
}
function appleAuthUrl(serviceId, uri, state) {
  const q = new URLSearchParams({
    client_id: serviceId, redirect_uri: uri, response_type: 'code',
    scope: 'name email', response_mode: 'form_post', state,
  });
  return 'https://appleid.apple.com/auth/authorize?' + q.toString();
}

// client_secret de Apple: JWT ES256 (P-256 + SHA-256, firma cruda R||S).
function derToRaw(der) {
  let o = 0;
  if (der[o++] !== 0x30) throw new Error('bad der');
  let len = der[o++];
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | der[o++]; }
  if (der[o++] !== 0x02) throw new Error('bad der r');
  let rl = der[o++];
  if (rl & 0x80) { const n = rl & 0x7f; rl = 0; for (let i = 0; i < n; i++) rl = (rl << 8) | der[o++]; }
  let r = der.slice(o, o + rl); o += rl;
  if (der[o++] !== 0x02) throw new Error('bad der s');
  let sl = der[o++];
  if (sl & 0x80) { const n = sl & 0x7f; sl = 0; for (let i = 0; i < n; i++) sl = (sl << 8) | der[o++]; }
  let s = der.slice(o, o + sl);
  const pad = (b) => { const out = Buffer.alloc(32); b = b.length > 32 ? b.slice(b.length - 32) : b; b.copy(out, 32 - b.length); return out; };
  return Buffer.concat([pad(r), pad(s)]);
}
function appleClientSecret(creds) {
  const header = b64u(JSON.stringify({ alg: 'ES256', kid: creds.keyId, typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64u(JSON.stringify({
    iss: creds.teamId, iat: now, exp: now + 3600,
    aud: 'https://appleid.apple.com', sub: creds.serviceId,
  }));
  const data = header + '.' + payload;
  const pem = String(creds.privateKey || '').replace(/\\n/g, '\n');
  const key = crypto.createPrivateKey({ key: pem, format: 'pem' });
  const der = crypto.sign('sha256', Buffer.from(data), key);
  return data + '.' + b64u(derToRaw(der));
}

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let d = null;
  try { d = JSON.parse(t); } catch (e) {}
  if (!r.ok) throw new Error('provider_http_' + r.status);
  return d || {};
}

async function googleUserinfo(accessToken) {
  const d = await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  const email = String(d.email || '').trim().toLowerCase();
  if (!email || (d.verified_email !== true && d.verified_email !== 'true')) {
    throw new Error('google_email_not_verified');
  }
  return { sub: String(d.sub || ''), email };
}

async function appleIdClaims(idToken, serviceId, fetchFn) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('apple_bad_token');
  let header, claims;
  try {
    header = JSON.parse(b64uDec(parts[0]).toString('utf8'));
    claims = JSON.parse(b64uDec(parts[1]).toString('utf8'));
  } catch (e) { throw new Error('apple_bad_token'); }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('apple_bad_alg');
  if (!appleJwksCache || Date.now() - appleJwksCache.at > APPLE_JWKS_TTL_MS) {
    const jwks = await (fetchFn || fetchJson)(APPLE_JWKS_URL, {});
    appleJwksCache = { keys: jwks.keys || [], at: Date.now() };
  }
  const jwk = (appleJwksCache.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('apple_unknown_kid');
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), pub, b64uDec(parts[2]));
  if (!ok) throw new Error('apple_bad_sig');
  if (claims.iss !== 'https://appleid.apple.com') throw new Error('apple_bad_iss');
  if (claims.aud !== serviceId) throw new Error('apple_bad_aud');
  if (!claims.exp || Date.now() >= claims.exp * 1000) throw new Error('apple_expired');
  const email = String(claims.email || '').trim().toLowerCase();
  if (!email) throw new Error('apple_no_email');
  return { sub: String(claims.sub || ''), email, verified: claims.email_verified === 'true' || claims.email_verified === true };
}

// Núcleo: vincular o crear. fns trae las funciones del servidor (inyectadas
// para poder testear sin la app): newReferralCode, hashPassword,
// normalizeSrc, importTrialWeek, applyTrialLang, seedFromTrialDigest,
// recordTrialImport, streakFromTrialImport, autoWeekEnabled, autoArmWeek,
// track, evTrack, trialDays. Devuelve { user, created, linked }.
// Errores: 'social_identity_email_mismatch' (el sub ya es de otro usuario).
function linkOrCreateUser(db, fns, input) {
  const provider = input.provider;
  const sub = String(input.sub || '');
  const email = String(input.email || '').trim().toLowerCase();
  if (!provider || !sub || !email) throw new Error('social_missing_identity');
  const ident = db.prepare('SELECT * FROM oauth_identities WHERE provider = ? AND sub = ?').get(provider, sub);
  if (ident) {
    const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(ident.user_id);
    if (!user) throw new Error('social_orphan_identity');
    if (user.email !== email) throw new Error('social_identity_email_mismatch');
    return { user, created: false, linked: false };
  }
  const existing = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare('INSERT INTO oauth_identities (provider, sub, email, user_id, created_at) VALUES (?, ?, ?, ?, ?)').run(provider, sub, email, existing.id, Date.now());
    if (input.emailVerified) {
      try { db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(existing.id); } catch (e) {}
    }
    return { user: existing, created: false, linked: true };
  }
  const code = fns.newReferralCode();
  let referredBy = null;
  const refCode = String(input.ref || '').trim().toLowerCase().slice(0, 16);
  if (/^[a-z0-9]{4,16}$/.test(refCode)) {
    const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(refCode);
    if (referrer && referrer.id) referredBy = referrer.id;
  }
  const trialEnds = Date.now() + (fns.trialDays || 3) * 24 * 3600 * 1000;
  const utm = input.utm || {};
  const utmS = (fns.normalizeSrc ? fns.normalizeSrc(utm.source) : '') || String(utm.source || '').slice(0, 40);
  const utmC = String(utm.campaign || '').slice(0, 80);
  const hash = fns.hashPassword(crypto.randomBytes(32).toString('hex'));
  const r = db.prepare('INSERT INTO users (email, password_hash, referral_code, referred_by, trial_ends_at, utm_source, utm_campaign, trust_level, autopilot_enabled, lang, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)').run(email, hash, code, referredBy, trialEnds, utmS, utmC, input.lang === 'en' ? 'en' : 'es', input.emailVerified ? 1 : 0);
  const newUserId = r.lastInsertRowid;
  db.prepare('INSERT INTO oauth_identities (provider, sub, email, user_id, created_at) VALUES (?, ?, ?, ?, ?)').run(provider, sub, email, newUserId, Date.now());
  try {
    const nImp = fns.importTrialWeek(newUserId, input.trial_ig);
    fns.applyTrialLang(newUserId, input.trial_ig);
    if (nImp) console.log('[posta] semana de prueba importada (social): ' + nImp + ' borradores -> usuario ' + newUserId);
    fns.seedFromTrialDigest(newUserId, input.trial_ig);
    fns.recordTrialImport(newUserId, input.trial_ig, nImp, false);
    fns.streakFromTrialImport(newUserId, nImp);
    if (nImp && fns.autoWeekEnabled(newUserId)) {
      const uidNew = newUserId;
      setTimeout(() => { fns.autoArmWeek(uidNew, 'signup').catch(() => {}); }, 5000);
    }
  } catch (e) { console.error('[posta] importTrialWeek (social):', e.message); }
  fns.track(newUserId, 'registered');
  fns.evTrack(newUserId, 'account_created', {});
  return { user: { id: newUserId, email }, created: true, linked: false };
}

module.exports = {
  b64u, b64uDec, hmacHex, safeEq,
  googleCreds, appleCreds, socialProviders,
  signState, verifyState, redirectUri,
  googleAuthUrl, appleAuthUrl, appleClientSecret,
  googleUserinfo, appleIdClaims, linkOrCreateUser, fetchJson,
  _resetAppleJwksCache: () => { appleJwksCache = null; },
};
