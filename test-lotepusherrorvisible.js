// LOTE PUSH-ERROR-VISIBLE — suite nueva.
// Uso: node test-lotepusherrorvisible.js <chunk-ajustes.js> <app.js>
// Extrae las funciones REALES del chunk y las ejecuta con stubs.
const fs = require('fs');
const chunkPath = process.argv[2];
const appPath = process.argv[3];
const chunk = fs.readFileSync(chunkPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');

let ok = 0, bad = 0;
function eq(name, got, want) {
  if (got === want) { ok++; }
  else { bad++; console.log(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
}
function has(name, cond) { if (cond) ok++; else { bad++; console.log('FAIL ' + name); } }

// Extracción por conteo de llaves.
function extract(src, fname) {
  const i = src.indexOf('function ' + fname);
  if (i === -1) throw new Error('no existe ' + fname);
  let j = src.indexOf('{', i);
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + fname);
}
let fns = null;
try {
  const code = extract(chunk, 'pzPushErrTexto') + '\n' + extract(chunk, 'pzPushErrMostrar');
  const maker = new Function(code + '\nreturn [pzPushErrTexto, pzPushErrMostrar];');
  const [t, m] = maker();
  fns = { t, m };
  has('funciones extraídas del chunk', true);
} catch (e) { has('funciones extraídas del chunk (' + e.message + ')', false); }

if (fns) {
  const { t, m } = fns;
  const els = {};
  global.$ = (sel) => (els[sel] = els[sel] || { textContent: '', style: {} });
  const el = () => els['#pzPushErr'];
  // (LOTE PUSH-FUNCIONANDO) El chunk corre en la app, donde pzNativePush
  // existe: simular nativo para las ramas iOS; la rama web se prueba aparte.
  global.pzNativePush = () => true;

  global.ME = { lang: 'es' };
  delete global.PZ_NATIVE_LAST_ERROR;
  // (LOTE PUSH-FUNCIONANDO) El copy de denied cambió por orden: ahora dice
  // el camino exacto (Ajustes del iPhone → Posty → Notificaciones).
  eq('denied ES', t({ ok: false, reason: 'denied' }, false), 'Las notificaciones están apagadas para Posty en tu iPhone. Abrí Ajustes del iPhone → Posty → Notificaciones y prendelas.');
  global.ME = { lang: 'en' };
  eq('denied EN', t({ ok: false, reason: 'denied' }, true), 'Notifications are off for Posty in your iPhone Settings. Open iPhone Settings → Posty → Notifications and turn them on.');
  global.pzNativePush = () => false;
  eq('denied ES web -> ajustes del navegador', t({ ok: false, reason: 'denied' }, false), 'Las notificaciones están bloqueadas en los ajustes de tu navegador.');
  global.pzNativePush = () => true;
  global.ME = { lang: 'es' };
  eq('no_token ES', t({ ok: false, reason: 'no_token' }, false), 'El iPhone no entregó el token de notificaciones');
  eq('no_token EN', t({ ok: false, reason: 'no_token' }, true), 'Your iPhone did not deliver the notifications token');
  // (LOTE PUSH-FUNCIONANDO) no_token con error de registro: muestra el detalle.
  global.PZ_NATIVE_LAST_ERROR = 'no valid aps-environment entitlement string found';
  eq('no_token + registrationError -> detalle', t({ ok: false, reason: 'no_token' }, false), 'El iPhone no entregó el token de notificaciones: no valid aps-environment entitlement string found');
  eq('registration_error + detalle', t({ ok: false, reason: 'registration_error' }, false), 'No se pudo activar: no valid aps-environment entitlement string found');
  delete global.PZ_NATIVE_LAST_ERROR;
  eq('ok -> vacío', t({ ok: true }, false), '');
  eq('pr nulo -> vacío', t(null, false), '');
  eq('error sin detalle -> genérico', t({ ok: false, reason: 'error' }, false), 'No se pudo activar, probá de nuevo');
  eq('error sin detalle EN', t({ ok: false, reason: 'error' }, true), 'Could not enable, try again');
  global.PZ_NATIVE_LAST_ERROR = 'No APNs token received';
  eq('error + lastError -> genérico con detalle', t({ ok: false, reason: 'error' }, false), 'No se pudo activar: No APNs token received');
  delete global.PZ_NATIVE_LAST_ERROR;
  eq('motivo desconocido -> genérico con motivo', t({ ok: false, reason: 'kaput' }, false), 'No se pudo activar: kaput');
  global.PZ_NATIVE_LAST_ERROR = 'x'.repeat(200);
  const long = t({ ok: false, reason: 'error' }, false);
  has('detalle largo truncado a 120', long === 'No se pudo activar: ' + 'x'.repeat(120));
  delete global.PZ_NATIVE_LAST_ERROR;

  // Mostrar: DOM falso.
  global.ME = { lang: 'es' };
  m({ ok: false, reason: 'denied' });
  eq('mostrar pone texto', el().textContent, 'Las notificaciones están apagadas para Posty en tu iPhone. Abrí Ajustes del iPhone → Posty → Notificaciones y prendelas.');
  eq('mostrar revela', el().style.display, '');
  m({ ok: true });
  eq('mostrar ok limpia texto', el().textContent, '');
  eq('mostrar ok oculta', el().style.display, 'none');
  global.ME = { lang: 'en' };
  m({ ok: false, reason: 'no_token' });
  eq('mostrar EN', el().textContent, 'Your iPhone did not deliver the notifications token');
}

// Estáticos: app.js guarda el error nativo; chunk tiene div + handler.
has('app declara PZ_NATIVE_LAST_ERROR', app.includes("let PZ_NATIVE_LAST_ERROR = '';"));
has('app declara PZ_NATIVE_REG_ERROR (solo registrationError)', app.includes("let PZ_NATIVE_REG_ERROR = '';"));
has('app registrationError guarda motivo', app.includes('PZ_NATIVE_LAST_ERROR = String(m)'));
has('app registrationError marca REG_ERROR', app.includes('PZ_NATIVE_REG_ERROR = String(m)'));
has('app sin listener vacío', !app.includes("PN.addListener('registrationError', () => {});"));
has('chunk tiene div pzPushErr', chunk.includes('id="pzPushErr"'));
has('chunk handler llama mostrar', chunk.includes('pzPushErrMostrar(pr || '));
has('chunk handler catch muestra genérico', chunk.includes("pzPushErrMostrar({ ok: false, reason: 'error' })"));

console.log(`OK ${ok} MAL ${bad}`);
process.exit(bad ? 1 : 0);
