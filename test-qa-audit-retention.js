// test-qa-audit-retention.js — Frente 1 (2026-10-23): copia estable de
// TODA evaluación qa_audit en media/qa-audit/.
// Contexto: qa_audit.image_path apuntaba al archivo suelto en /media/ y
// la evaluación (sobre todo las APROBADAS, que no pasan por qa-failed/)
// quedaba inauditable cuando ese archivo moría (ids 43/48 de Mora).
// Parte A (contrato estático): server.js define retainQaAuditCopy, los
// dos INSERT de qa_audit usan el path estable (auditPath) y el fallback
// al path suelto sigue existiendo.
// Parte B (funcional): la función extraída de server.js copia (no mueve),
// devuelve /media/qa-audit/<nombre>, devuelve null si el origen no existe
// y poda a QA_AUDIT_MAX_FILES.
// Uso: node test-qa-audit-retention.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const SRC = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

console.log('— Parte A: contrato en server.js');
ok(SRC.includes("const QA_AUDIT_DIR = path.join(MEDIA_DIR, 'qa-audit');"), 'QA_AUDIT_DIR = MEDIA_DIR/qa-audit (subdirectorio: el janitor no lo barre)');
ok(SRC.includes('function retainQaAuditCopy(imgName)'), 'existe retainQaAuditCopy(imgName)');
ok(SRC.includes('const auditPath = retainQaAuditCopy(imgName) || `/media/${imgName}`;'), 'auditPath con fallback al path suelto de siempre');
const inserts = [...SRC.matchAll(/INSERT INTO qa_audit \(passed, result, image_path\) VALUES \(\?, \?, \?\)'\)\.run\(([^\n]+)\)/g)].map((m) => m[1]);
ok(inserts.length === 2, `los 2 INSERT de qa_audit siguen existiendo (hallados: ${inserts.length})`);
ok(inserts.every((a) => a.includes('auditPath')), 'ambos INSERT guardan auditPath (sin veredicto y con veredicto)');
ok(!SRC.includes('`/media/${imgName}`);') || SRC.includes('|| `/media/${imgName}`'), 'ningún INSERT guarda el path suelto directo');

console.log('— Parte B: comportamiento de retainQaAuditCopy (extraída)');
const start = SRC.indexOf('const QA_AUDIT_DIR');
const end = SRC.indexOf('// ── Limpieza de media', start);
ok(start > 0 && end > start, 'bloque de retención localizable para extracción');
const block = SRC.slice(start, end);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-qa-audit-'));
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const ctx = { fs, path, MEDIA_DIR, console };
vm.createContext(ctx);
vm.runInContext(block, ctx);
ok(typeof ctx.retainQaAuditCopy === 'function', 'la función se evalúa aislada');
ok(vm.runInContext('QA_AUDIT_MAX_FILES', ctx) === 120, 'poda acotada en 120 (ventana de /api/qa-audit = 100 + margen)');

// copia (no mueve) y path devuelto
fs.writeFileSync(path.join(MEDIA_DIR, '123-final.png'), Buffer.from('imagen-final'));
const ret = ctx.retainQaAuditCopy('123-final.png');
ok(ret === '/media/qa-audit/123-final.png', 'devuelve /media/qa-audit/<nombre>');
ok(fs.existsSync(path.join(MEDIA_DIR, 'qa-audit', '123-final.png')), 'la copia existe en media/qa-audit/');
ok(fs.readFileSync(path.join(MEDIA_DIR, 'qa-audit', '123-final.png'), 'utf8') === 'imagen-final', 'la copia es byte-idéntica');
ok(fs.existsSync(path.join(MEDIA_DIR, '123-final.png')), 'el original sigue vivo (copia, no mueve: el posteo lo referencia)');

// origen ausente / nombre vacío → null (la fila cae al fallback)
ok(ctx.retainQaAuditCopy('no-esta.png') === null, 'origen ausente → null (fallback al path suelto)');
ok(ctx.retainQaAuditCopy('') === null, 'nombre vacío → null');

// poda: 125 copias viejas + 1 nueva → quedan las 120 más recientes
const auditDir = path.join(MEDIA_DIR, 'qa-audit');
for (let i = 0; i < 125; i++) {
  const f = path.join(auditDir, `vieja-${String(i).padStart(3, '0')}.png`);
  fs.writeFileSync(f, 'x');
  const t = new Date(Date.now() - (200 - i) * 60000);
  fs.utimesSync(f, t, t);
}
fs.writeFileSync(path.join(MEDIA_DIR, '999-nueva.png'), 'nueva');
ctx.retainQaAuditCopy('999-nueva.png');
const quedan = fs.readdirSync(auditDir).filter((f) => /\.png$/i.test(f));
ok(quedan.length === 120, `la poda deja 120 archivos (quedan: ${quedan.length})`);
ok(quedan.includes('999-nueva.png'), 'la copia más reciente sobrevive a la poda');
ok(!quedan.includes('vieja-000.png'), 'la copia más vieja es la podada');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log(fails ? `\n❌ test-qa-audit-retention: ${total - fails}/${total}` : `\n✅ test-qa-audit-retention: ${total}/${total} verificaciones OK`);
process.exit(fails ? 1 : 0);
