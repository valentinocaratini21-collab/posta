// Suite LOTE TOPE-ABIERTO — el tope diario de generaciones gratis por IP
// sube a 50 hasta el 2026-11-30 inclusive (día del servidor, el mismo
// todayStr que cuenta los intentos) y vuelve solo a 5 desde el
// 2026-12-01, día del lanzamiento, por chequeo de fecha en el código.
// Uso: node test-lote-tope-abierto.js [raíz-del-árbol]
// Sin argumento usa el directorio de este archivo. El control sobre el
// árbol base (v1147) tiene que fallar exactamente en los puntos [FIX].
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let ok = 0, mal = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre); }
}

const demo = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

console.log('A · censo de fuente');
// La constante de siempre queda en 5: es el valor al que se vuelve.
check('A1 DEMO_LIMIT_PER_DAY sigue en 5', /const DEMO_LIMIT_PER_DAY = 5;/.test(demo));
// [FIX] la ventana pre-lanzamiento existe.
check('A2 [FIX] constante de ventana = 50', /const DEMO_LIMIT_PRELAUNCH_PER_DAY = 50;/.test(demo));
check('A3 [FIX] borde de ventana = 2026-11-30', /const DEMO_LIMIT_PRELAUNCH_UNTIL = '2026-11-30';/.test(demo));
check('A4 [FIX] demoLimitPerDay definida', /function demoLimitPerDay\(day\) \{/.test(demo));
check('A5 [FIX] demoLimitPerDay exportada', /demoLimitPerDay,/.test(demo));
// [FIX] los dos consumidores usan el tope efectivo del día.
check('A6 [FIX] checkTrialAllowed usa demoLimitPerDay()',
  /const limit = demoLimitPerDay\(\);\n  return \{ allowed: count < limit/.test(demo));
check('A7 [FIX] consumeTrialAttempt pasa demoLimitPerDay(day) al SQL atómico',
  /\)\.run\(ip, day, demoLimitPerDay\(day\)\);/.test(demo));
check('A8 [FIX] consumeTrialAttempt calcula remaining con demoLimitPerDay(day)',
  /remaining: Math\.max\(0, demoLimitPerDay\(day\) - count\)/.test(demo));
// La mecánica no cambia: reserva atómica con WHERE count < ? y reembolso.
check('A9 la reserva sigue atómica (ON CONFLICT ... WHERE count < ?)',
  /ON CONFLICT\(ip, day\) DO UPDATE SET count = count \+ 1 WHERE count < \?/.test(demo));
check('A10 refundTrialAttempt intacta', /function refundTrialAttempt\(ip\) \{/.test(demo));
// [FIX] ningún mensaje 429 de la familia demo/prueba/auditoría miente el número.
const duros = (server.match(/límite de 5 (demos|auditorías|pruebas) por día|limit of 5 audits per day/g) || []).length;
check('A11 [FIX] cero mensajes con el 5 hardcodeado (hay ' + duros + ')', duros === 0);
const dinamicos = (server.match(/demo\.demoLimitPerDay\(\)/g) || []).length;
check('A12 [FIX] los mensajes usan el tope efectivo (' + dinamicos + ' usos en server.js)', dinamicos >= 5);

console.log('B · el borde de fecha, ejecutado (VM sobre la fuente real)');
const mConst = demo.match(/const DEMO_LIMIT_PER_DAY = 5;[\s\S]*?function demoLimitPerDay\(day\) \{[\s\S]*?\n\}/);
check('B1 [FIX] el bloque del tope se puede extraer de demo.js', !!mConst);
if (mConst) {
  const caja = { __hoy: '2026-11-16' };
  caja.todayStr = () => caja.__hoy;
  vm.createContext(caja);
  vm.runInContext(mConst[0] + '\nthis.__f = demoLimitPerDay;', caja);
  const f = caja.__f;
  check('B2 [FIX] 2026-11-16 (hoy, pre-lanzamiento) → 50', f('2026-11-16') === 50);
  check('B3 [FIX] 2026-11-30 (último día de la ventana) → 50', f('2026-11-30') === 50);
  check('B4 [FIX] 2026-12-01 (lanzamiento) → 5', f('2026-12-01') === 5);
  check('B5 [FIX] 2026-12-25 → 5', f('2026-12-25') === 5);
  check('B6 [FIX] 2027-06-01 → 5 (nunca vuelve a abrir)', f('2027-06-01') === 5);
  caja.__hoy = '2026-11-20';
  check('B7 [FIX] sin argumento usa todayStr (2026-11-20) → 50', f() === 50);
  caja.__hoy = '2026-12-01';
  check('B8 [FIX] sin argumento usa todayStr (2026-12-01) → 5', f() === 5);
}

console.log('\nResultado: ' + ok + ' ok · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
