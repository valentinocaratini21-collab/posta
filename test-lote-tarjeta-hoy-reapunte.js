// Suite de pines — LOTE TARJETA-HOY-REAPUNTE
// Uso: node test-lote-tarjeta-hoy-reapunte.js [dirDelArbol]
// Sin argumento usa ./release del propio lote. Contra el árbol prístino
// (sin el lote) tiene que FALLAR: es el control diferencial.
const fs = require('fs');
const path = require('path');
const root = process.argv[2] || path.join(__dirname, 'release');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
let ok = 0, mal = 0;
function pin(nombre, cond) { if (cond) { ok++; console.log('  ok  ' + nombre); } else { mal++; console.log('  MAL ' + nombre); } }

// --- Pieza CSS: la nota de archivado no rompe la tarjeta de hoy ---
const reglaSide = (css.match(/\.pz-hoy-tira-detalle \.side\{[^}]*\}/) || [''])[0];
pin('la columna .side puede encoger (sin flex:0 0 auto)', !!reglaSide && !/flex:0 0 auto/.test(reglaSide));
pin('la columna .side tiene tope de ancho (max-width:46%)', /max-width:46%/.test(reglaSide));
const reglaArch = (css.match(/\.pz-hoy-tira-detalle \.side \.pz-hoy-arch\{[^}]*\}/) || [''])[0];
pin('existe regla propia para .pz-hoy-arch', !!reglaArch);
pin('.pz-hoy-arch envuelve el texto (white-space:normal)', /white-space:normal/.test(reglaArch));
pin('.pz-hoy-arch tiene el tope de la píldora (max-width:150px)', /max-width:150px/.test(reglaArch));

// --- Pieza REAPUNTE: la palanca admin para re-apuntar el registro IG ---
pin('existe POST /api/admin/posts/:id/set-ig con token admin', srv.includes("app.post('/api/admin/posts/:id/set-ig', requireAdminToken"));
const setIg = srv.slice(srv.indexOf("'/api/admin/posts/:id/set-ig'"), srv.indexOf("'/api/admin/posts/:id/set-ig'") + 2600);
pin('set-ig solo acepta posteos publicados (motivo no_publicado)', setIg.includes("no_publicado") && setIg.includes("post.status !== 'published'"));
pin("set-ig escribe ig_media_id + ig_permalink y deja ig_state='live'", setIg.includes("ig_state = 'live'") && setIg.includes('ig_media_id = ?') && setIg.includes('ig_permalink = ?'));
pin('set-ig devuelve el puntero anterior (anterior:)', setIg.includes('anterior:'));

// --- Pieza ADOPCIÓN: registrar un medio publicado fuera de la app ---
pin('existe POST /api/admin/ig/adopt con token admin', srv.includes("app.post('/api/admin/ig/adopt', requireAdminToken"));
const adopt = srv.slice(srv.indexOf("'/api/admin/ig/adopt'"), srv.indexOf("'/api/admin/ig/adopt'") + 1200);
pin('adopt usa la primitiva adoptarRecienteIg existente', adopt.includes('adoptarRecienteIg(db, uid, mid)'));
pin('adopt declara la idempotencia (ya_existia)', adopt.includes('ya_existia'));

console.log(`\n${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
