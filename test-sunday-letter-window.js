'use strict';
/* test-sunday-letter-window.js — 📮 Entrega de la carta dominical (2026-10-20)
 * La carta semanal llega el DOMINGO A LA NOCHE, ~21:00 en la zona del
 * cliente (userTz; default Buenos Aires). El sweep corre por hora en la
 * franja UTC amplia y esta función decide, por cuenta, si ES su domingo a
 * la noche. Se extrae la función REAL de server.js (mismo patrón que
 * test-user-stopped) y se la prueba con instantes fijos: cero red, cero IA.
 * Corre con: node test-sunday-letter-window.js */
const fs = require('fs');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
const start = src.indexOf('function sundayLetterWindow');
ok(start >= 0, 'la función sundayLetterWindow existe en server.js');
const end = src.indexOf('\n}\n', start);
const fnSrc = src.slice(start, end + 3);
const sundayLetterWindow = eval('(' + fnSrc.replace(/^function sundayLetterWindow/, 'function sundayLetterWindow') + ')');

const BA = 'America/Argentina/Buenos_Aires'; // UTC-3
// Domingo 25/10/2026 21:00 BA = lunes 26/10 00:00 UTC.
ok(sundayLetterWindow(BA, new Date('2026-10-26T00:00:00Z')) === true, 'domingo 21:00 del cliente (BA) → es su ventana');
ok(sundayLetterWindow(BA, new Date('2026-10-25T22:59:00Z')) === false, 'domingo 19:59 BA → todavía no');
ok(sundayLetterWindow(BA, new Date('2026-10-26T01:59:00Z')) === true, 'domingo 22:59 BA → último borde de la ventana');
ok(sundayLetterWindow(BA, new Date('2026-10-26T02:00:00Z')) === false, 'domingo 23:00 BA → la ventana cerró');
ok(sundayLetterWindow(BA, new Date('2026-10-27T00:00:00Z')) === false, 'lunes 21:00 BA → no es domingo');
ok(sundayLetterWindow(BA, new Date('2026-10-25T00:00:00Z')) === false, 'sábado 21:00 BA → no es domingo');
// La ventana sigue al cliente, no al servidor: a la misma hora UTC en que BA
// ya es lunes 00:00, Ciudad de México (UTC-6) está en su domingo 21:00.
ok(sundayLetterWindow(BA, new Date('2026-10-26T03:00:00Z')) === false, 'lunes 00:00 BA → fuera (control)');
ok(sundayLetterWindow('America/Mexico_City', new Date('2026-10-26T03:00:00Z')) === true, 'mismo instante: domingo 21:00 en México → es SU ventana');
// Zona inválida o ausente: cae a Buenos Aires, nunca explota.
ok(sundayLetterWindow('Marte/Olympus', new Date('2026-10-26T00:00:00Z')) === true, 'tz inválida → default BA sin explotar');
ok(sundayLetterWindow(null, new Date('2026-10-26T00:00:00Z')) === true, 'tz ausente → default BA');
// El scheduler dispara el barrido en modo ventana (no el disparo único del lunes).
ok(/opts && opts\.sundayWindow/.test(src), 'server.js: el sweep acepta el modo ventana dominical');
const sched = fs.readFileSync(__dirname + '/scheduler.js', 'utf8');
ok(/sundayWindow: true/.test(sched), 'scheduler.js: el barrido se dispara con { sundayWindow: true }');
ok(!/'45 6 \* \* 1'/.test(sched), 'scheduler.js: el disparo del lunes 06:45 ya no existe');
ok(/'30 20 \* \* 0'/.test(sched), 'scheduler.js: el fundamento se refresca el domingo 20:30 BA, antes de la carta');

console.log(fails ? '\n✗ ' + fails + ' fallas' : '\n✓ TODO VERDE — test-sunday-letter-window');
process.exit(fails ? 1 : 0);
