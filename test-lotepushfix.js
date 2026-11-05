// test-lotepushfix.js — LOTE PUSHFIX (3/8, «Arma todo» 5/11).
// Uso: node test-lotepushfix.js  (desde la raíz del repo).
// Extrae las funciones REALES del camino del token nativo de public/app.js
// y las ejecuta con stubs: sin red, sin Capacitor real, sin sesión real.
// Lo que prueba (el bug que dejaba el push en no_token):
//  1) POST que falla (401) -> el token NO se descarta: queda pendiente.
//  2) Flush con sesión recuperada -> se guarda, se confirma y se usa.
//  3) Subscribe con POST fallido -> 'pendiente' (no ok falso, no no_token).
//  4) Subscribe con POST ok -> ok y el contador de confirmación avanza.
//  5) Trampa del token viejo: token guardado viejo + POST fallido -> NO ok.
//  6) Sin evento de registro -> no_token (como antes).
//  7) Estáticos: cola, noLoginRedirect, texto pendiente, hooks intactos.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APPJS = path.join(ROOT, 'public', 'app.js');
const CHUNK = path.join(ROOT, 'public', 'chunk-ajustes.js');
const SCHED = path.join(ROOT, 'scheduler.js');
const MORNING = path.join(ROOT, 'morning-post-push.js');

let ok = 0, bad = 0;
function eq(name, got, want) {
  if (got === want) { ok++; console.log('ok - ' + name); }
  else { bad++; console.log(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
}
function has(name, cond) { if (cond) { ok++; console.log('ok - ' + name); } else { bad++; console.log('FAIL ' + name); } }

const src = fs.readFileSync(APPJS, 'utf8');
const chunk = fs.readFileSync(CHUNK, 'utf8');
const sched = fs.readFileSync(SCHED, 'utf8');
const morning = fs.readFileSync(MORNING, 'utf8');

function extract(name, from) {
  const s = from || src;
  const m = s.match(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('no existe ' + name);
  return m[0];
}

// ---------- stubs ----------
const TOKEN = 'a'.repeat(64);
function makeStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}
let store = makeStore();
let apiCalls = [];
let apiMode = 'ok'; // 'ok' | 'fail401' | 'failOnce401'
let apiCallCount = 0;
const apiStub = {
  post: async (url, body, opts) => {
    apiCalls.push({ url, body, opts });
    apiCallCount++;
    if (apiMode === 'fail401' || (apiMode === 'failOnce401' && apiCallCount === 1)) {
      const e = new Error('Tu sesión se cerró, entrá de nuevo');
      e.status = 401;
      throw e;
    }
    return { ok: true };
  },
};
function makePN(fireToken) {
  return {
    _fire: null,
    async checkPermissions() { return { receive: 'granted' }; },
    async requestPermissions() { return { receive: 'granted' }; },
    async register() {
      if (fireToken) setTimeout(() => { if (this._fire) this._fire({ value: fireToken }); }, 10);
    },
    addListener() {},
  };
}
let pn = makePN(null);

global.localStorage = null; // se reasigna por caso (el fake vive en store)
function resetGlobals() {
  store = makeStore();
  apiCalls = [];
  apiCallCount = 0;
  global.localStorage = {
    getItem: (k) => store.getItem(k),
    setItem: (k, v) => store.setItem(k, v),
    removeItem: (k) => store.removeItem(k),
  };
  global.api = apiStub;
  global.window = {
    Capacitor: {
      getPlatform: () => 'ios',
      isNativePlatform: () => true,
      Plugins: { PushNotifications: pn },
    },
  };
}

const code = [
  'let PZ_NATIVE_PERM = \'prompt\';',
  'let PZ_NATIVE_LAST_ERROR = \'\';',
  'let PZ_NATIVE_REG_ERROR = \'\';', // (LOTE PUSH-FUNCIONANDO) espejo de app.js: solo el listener registrationError lo pone.
  extract('pzNativePlugin'),
  extract('pzNativeTransport'),
  extract('pzNativeTokenOk'),
  extract('pzNativePendGet'),
  extract('pzNativePendClear'),
  extract('pzNativeFlushPendiente'),
  extract('pzNativeSaveToken'),
  extract('pzNativeSubscribe'),
  'return { save: pzNativeSaveToken, sub: pzNativeSubscribe, flush: pzNativeFlushPendiente, pend: pzNativePendGet, get lastError() { return PZ_NATIVE_LAST_ERROR; } };',
].join('\n');
const F = new Function(code)();

async function main() {
  // 1) POST 401 -> pendiente, no descartado.
  resetGlobals();
  pn = makePN(null);
  global.window.Capacitor.Plugins.PushNotifications = pn;
  apiMode = 'fail401';
  const r1 = await F.save(TOKEN);
  eq('1 POST 401 -> ok:false', r1.ok, false);
  eq('1 POST 401 -> reason sesion', r1.reason, 'sesion');
  const pend1 = F.pend();
  has('1 pendiente guardado con el token', !!(pend1 && pend1.token === TOKEN && pend1.transport === 'apns'));
  eq('1 guardado confirmado ausente', store.getItem('pz-native-token'), null);
  has('1 lastError con frase de sesión', F.lastError.indexOf('sesión') !== -1);
  has('1 POST llevó noLoginRedirect', apiCalls.length === 1 && apiCalls[0].opts && apiCalls[0].opts.noLoginRedirect === true);
  eq('1 POST al endpoint correcto', apiCalls[0].url, '/api/push/subscribe');

  // 2) Flush con sesión recuperada -> guardado y confirmado.
  apiMode = 'ok';
  const r2 = await F.flush();
  eq('2 flush ok', r2.ok, true);
  eq('2 token guardado', store.getItem('pz-native-token'), TOKEN);
  eq('2 pendiente limpio', store.getItem('pz-native-token-pendiente'), null);
  eq('2 contador en 1', store.getItem('pz-native-token-seq'), '1');

  // 3) Subscribe con POST que falla la primera vez -> pendiente.
  resetGlobals();
  pn = makePN(TOKEN);
  global.window.Capacitor.Plugins.PushNotifications = pn;
  pn._fire = (reg) => { F.save(reg && reg.value); };
  apiMode = 'failOnce401';
  const r3 = await F.sub();
  eq('3 subscribe POST fallido -> pendiente', r3.reason, 'pendiente');
  eq('3 subscribe POST fallido -> ok:false', r3.ok, false);
  has('3 pendiente sigue guardado', !!(F.pend() && F.pend().token === TOKEN));

  // 4) Subscribe con POST ok -> ok y contador avanza.
  resetGlobals();
  pn = makePN(TOKEN);
  global.window.Capacitor.Plugins.PushNotifications = pn;
  pn._fire = (reg) => { F.save(reg && reg.value); };
  apiMode = 'ok';
  const r4 = await F.sub();
  eq('4 subscribe ok', r4.ok, true);
  eq('4 token guardado', store.getItem('pz-native-token'), TOKEN);
  eq('4 pendiente limpio', store.getItem('pz-native-token-pendiente'), null);
  eq('4 contador en 1', store.getItem('pz-native-token-seq'), '1');

  // 5) Trampa del token viejo: guardado viejo + POST fallido -> NO ok.
  resetGlobals();
  store.setItem('pz-native-token', 'b'.repeat(64));
  store.setItem('pz-native-token-seq', '5');
  pn = makePN(TOKEN);
  global.window.Capacitor.Plugins.PushNotifications = pn;
  pn._fire = (reg) => { F.save(reg && reg.value); };
  apiMode = 'fail401';
  const r5 = await F.sub();
  eq('5 token viejo + POST fallido -> ok:false', r5.ok, false);
  eq('5 token viejo + POST fallido -> pendiente', r5.reason, 'pendiente');

  // 6) Sin evento de registro -> no_token.
  resetGlobals();
  pn = makePN(null);
  global.window.Capacitor.Plugins.PushNotifications = pn;
  apiMode = 'ok';
  const r6 = await F.sub();
  eq('6 sin evento -> no_token', r6.reason, 'no_token');

  // 7) Estáticos.
  has('7 app tiene cola pendiente', src.includes('pz-native-token-pendiente'));
  has('7 app tiene contador de confirmación', src.includes('pz-native-token-seq'));
  has('7 app POST con noLoginRedirect', src.includes('noLoginRedirect'));
  has('7 app POST subscribe con transport+token (test push-nativo)', src.includes("api.post('/api/push/subscribe', { transport: transport, token:"));
  has('7 chunk texto pendiente ES', chunk.includes('Tu token quedó guardado: se manda solo la próxima vez que abras la app con sesión'));
  has('7 chunk texto pendiente EN', chunk.includes('Your token is saved: it will be sent next time you open the app signed in'));
  has('7 chunk textos viejos intactos', chunk.includes('El iPhone no entregó el token de notificaciones') && chunk.includes('No se pudo activar, probá de nuevo'));
  has('7 scheduler hook premios-notif intacto', sched.includes("require('./premios-notif')") && sched.includes("require('./push').sendPush"));
  has('7 push matutina texto INTOCABLE', morning.includes('Tu posteo de hoy ya está 👇'));
  has('7 logout limpia pendiente', src.includes("localStorage.removeItem('pz-native-token-pendiente')"));

  console.log(`test-lotepushfix: OK ${ok} MAL ${bad}`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error('ERROR test-lotepushfix:', e && e.stack || e); process.exit(1); });
