// Suite de pines — LOTE REHACER-CONSERVA-DIA (día + estrategia)
// Uso: node test-lote-rehacer-conserva-dia.js [dirDelArbol]
// Sin argumento usa ./release del propio lote. Contra el árbol prístino
// (sin el lote) tiene que FALLAR: es el control diferencial.
const fs = require('fs');
const path = require('path');
const root = process.argv[2] || path.join(__dirname, 'release');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
let ok = 0, mal = 0;
function pin(nombre, cond) { if (cond) { ok++; console.log('  ok  ' + nombre); } else { mal++; console.log('  MAL ' + nombre); } }

// regenDirectedDraft: el tramo de la función
const iFn = srv.indexOf('async function regenDirectedDraft');
const fn = srv.slice(iFn, iFn + 14000);
const iUpd = fn.indexOf('UPDATE posts SET image_path = ?, prev_image_path = ?');
const upd = fn.slice(iUpd, iUpd + 700);

// --- Pieza DÍA: el rehacer hereda el día del original ---
pin('regenDirectedDraft captura el día original del programado', fn.includes("post.status === 'scheduled' && post.scheduled_at") && fn.includes('diaOriginal'));
pin('la escritura final ya NO hardcodea status draft / scheduled_at NULL', !upd.includes("status = 'draft', scheduled_at = NULL"));
pin('la escritura final restaura status y día por parámetro', upd.includes('status = ?, scheduled_at = ?') && upd.includes("diaOriginal ? 'scheduled' : 'draft', diaOriginal"));
pin('el retorno declara dia_conservado', fn.includes('dia_conservado: diaOriginal'));

// --- Pieza ESTRATEGIA: el rehacer lee la línea del feed ---
pin('el rehacer construye la línea del feed (lineaFeed)', fn.includes('lineaFeed'));
pin('la línea se lee de las piezas publicadas anteriores de la cuenta', fn.includes("status = 'published' AND id != ?"));
pin('la línea declara la estrategia en curso y el tema propio de la pieza', fn.includes('Línea del feed (la estrategia en curso') && fn.includes('El tema propio de esta pieza es'));
pin('la línea viaja en el topic de generación', fn.includes('const topic = [title, brief, lineaFeed]'));
pin('el retorno declara linea_feed', fn.includes('linea_feed: !!lineaFeed'));

// --- Endpoint admin: ya no desprograma antes de regenerar ---
const iEp = srv.indexOf("app.post('/api/admin/regen-post'");
const ep = srv.slice(iEp, iEp + 3200);
pin('regen-post ya no desprograma el posteo antes de regenerar', !ep.includes("UPDATE posts SET status = 'draft', scheduled_at = NULL WHERE id = ?"));
pin('regen-post declara dia_conservado en la respuesta', ep.includes('dia_conservado: diaConservado'));
pin('regen-post responde el estado real tras el rehacer (scheduled si conservó el día)', ep.includes("status: diaConservado ? 'scheduled' : 'draft'"));

console.log(`\n${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
