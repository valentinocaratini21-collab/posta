'use strict';
/* test-loteseguidosapi.js — LOTE SEGUIDOS POR API (1/11, pedido de Valentino).
   El embed no trae seguidos: la cabecera los completa con follows_count de
   la API oficial para la CUENTA CONECTADA del cliente (su propio perfil).
   Reglas fijadas acá (con respuestas Graph mockeadas, sin red, sin token):
   - API devuelve follows_count real -> se muestra.
   - El embed manda cuando trae número; si no, vale la API; si ninguno trae
     dato -> no se muestra nada (nunca un cero inventado).
   - follows_count 0 real -> se muestra 0.
   - Error de Meta / token ausente / cuenta distinta -> no se muestra y
     nada se cae (null).
   - Sin cuenta conectada -> no se muestra.
   - Ritmo: la llamada vive SOLO en homeProfileReadAndStore (refresh de
     perfil), nunca en el render de la home (el GET sirve el snapshot).
   - EN espejado (el render ya distingue 'following' / 'seguido(s)').
   Repo-ejecutable: node test-loteseguidosapi.js (desde la raíz del repo).
   Lee ./ig-follows.js, ./server.js y ./public/app.js. Sin dependencias. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
}

const igFollows = require('./ig-follows');
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

function mockFetch(body, capture) {
  return async (url, opts) => {
    if (capture) capture.push(url);
    return { json: async () => body };
  };
}

async function fetchTests() {
  const H = 'posty.communitymanager';
  // API devuelve follows_count real -> se muestra.
  let r = await igFollows.fetchFollowsCount({ igUserId: '17841424145064983', accessToken: 'TOK', expectedHandle: H, fetchFn: mockFetch({ follows_count: 312, username: H }) });
  ok('API follows_count real', r === 312, 'dio ' + r);
  // Normalización @ y mayúsculas en la guarda de identidad.
  r = await igFollows.fetchFollowsCount({ igUserId: '1', accessToken: 'TOK', expectedHandle: '@Posty.CommunityManager', fetchFn: mockFetch({ follows_count: 40, username: H }) });
  ok('API guarda identidad normalizada', r === 40, 'dio ' + r);
  // Sin expectedHandle no hay guarda (el llamador ya sabe que es su cuenta).
  r = await igFollows.fetchFollowsCount({ igUserId: '1', accessToken: 'TOK', fetchFn: mockFetch({ follows_count: 7, username: 'otra.cuenta' }) });
  ok('API sin expectedHandle devuelve', r === 7, 'dio ' + r);
  // Cuenta distinta a la mostrada -> null (nunca un número ajeno).
  r = await igFollows.fetchFollowsCount({ igUserId: '1', accessToken: 'TOK', expectedHandle: H, fetchFn: mockFetch({ follows_count: 999, username: 'otra.cuenta' }) });
  ok('API cuenta distinta -> null', r === null, 'dio ' + r);
  // Error de Meta -> null, sin excepción.
  r = await igFollows.fetchFollowsCount({ igUserId: '1', accessToken: 'TOK', expectedHandle: H, fetchFn: mockFetch({ error: { message: 'permission denied' } }) });
  ok('API error Meta -> null', r === null, 'dio ' + r);
  // follows_count 0 real -> se muestra 0 (no se confunde con desconocido).
  r = await igFollows.fetchFollowsCount({ igUserId: '1', accessToken: 'TOK', expectedHandle: H, fetchFn: mockFetch({ follows_count: 0, username: H }) });
  ok('API follows_count 0 real', r === 0, 'dio ' + r);
  // follows_count ausente -> null.
  r = await igFollows.fetchFollowsCount({ igUserId: '1', accessToken: 'TOK', expectedHandle: H, fetchFn: mockFetch({ username: H }) });
  ok('API sin follows_count -> null', r === null, 'dio ' + r);
  // Sin token -> null y SIN llamar a la red.
  const urls = [];
  r = await igFollows.fetchFollowsCount({ igUserId: '1', accessToken: '', expectedHandle: H, fetchFn: mockFetch({ follows_count: 5, username: H }, urls) });
  ok('API sin token -> null sin llamada', r === null && urls.length === 0, 'dio ' + r + ', llamadas ' + urls.length);
  // Sin cuenta conectada (sin id) -> null sin llamada.
  const urls2 = [];
  r = await igFollows.fetchFollowsCount({ igUserId: null, accessToken: 'TOK', expectedHandle: H, fetchFn: mockFetch({ follows_count: 5, username: H }, urls2) });
  ok('API sin cuenta -> null sin llamada', r === null && urls2.length === 0, 'dio ' + r + ', llamadas ' + urls2.length);
  // El fetch lanza -> null, sin excepción.
  r = await igFollows.fetchFollowsCount({ igUserId: '1', accessToken: 'TOK', expectedHandle: H, fetchFn: async () => { throw new Error('red caída'); } });
  ok('API fetch lanza -> null', r === null, 'dio ' + r);
  // La llamada va al host y versión del patrón existente.
  const urls3 = [];
  await igFollows.fetchFollowsCount({ igUserId: '42', accessToken: 'TOK', fetchFn: mockFetch({ follows_count: 1, username: 'x' }, urls3) });
  ok('API host+versión del patrón', urls3.length === 1 && urls3[0].indexOf('https://graph.instagram.com/v26.0/42?') === 0 && urls3[0].indexOf('fields=follows_count') >= 0, urls3[0] || '');
}

function precedenceTests() {
  const R = igFollows.resolveFollowing;
  ok('precedencia embed manda', R(7, 5) === 7);
  ok('precedencia embed null -> API', R(null, 5) === 5);
  ok('precedencia ninguno -> null', R(null, null) === null);
  ok('precedencia embed 0 real manda', R(0, 5) === 0);
  ok('precedencia API 0 real se muestra', R(null, 0) === 0);
  ok('precedencia embed no-número -> API', R('x', 5) === 5);
  ok('precedencia API no-número -> null', R(null, 'x') === null);
  ok('precedencia undefined -> API', R(undefined, 3) === 3);
}

function wiringTests() {
  // El módulo está requerido en server.js.
  ok('server requiere ig-follows', serverSrc.indexOf("require('./ig-follows')") >= 0);
  // El hook vive en homeProfileReadAndStore (refresh), y SOLO ahí se llama:
  // una única llamada + require; el GET /api/home/profile no referencia el módulo.
  const calls = (serverSrc.match(/igFollows\.fetchFollowsCount/g) || []).length;
  ok('server una sola llamada (hook refresh)', calls === 1, 'llamadas: ' + calls);
  const hookIdx = serverSrc.indexOf('igFollows.fetchFollowsCount');
  const fnIdx = serverSrc.indexOf('async function homeProfileReadAndStore');
  const nextFnIdx = serverSrc.indexOf('function homeProfileRefreshOnce', fnIdx);
  ok('hook dentro de homeProfileReadAndStore', fnIdx >= 0 && hookIdx > fnIdx && hookIdx < nextFnIdx);
  // El hook solo corre cuando el embed NO trajo seguidos (precedencia embed).
  ok('hook gated por following null', serverSrc.indexOf('payload.following == null') >= 0);
  // La guarda de identidad viaja en la llamada (expectedHandle = handle leído).
  ok('hook pasa expectedHandle', serverSrc.indexOf('expectedHandle: handle') >= 0);
  // El slot del cliente existe y distingue número de null (sin cambio en app.js).
  ok('app render seguidos solo con número', appSrc.indexOf('typeof P.following') >= 0 && appSrc.indexOf('seguidos') >= 0);
  ok('app render EN following', appSrc.indexOf("'following'") >= 0);
}

(async () => {
  await fetchTests();
  precedenceTests();
  wiringTests();
  console.log('loteseguidosapi: ' + pass + ' pass, ' + fail + ' fail');
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
})();
