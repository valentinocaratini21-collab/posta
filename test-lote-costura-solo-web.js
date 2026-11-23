'use strict';
/* LOTE COSTURA-SOLO-WEB — la costura de CONSERJE-SOLO-WEB (v1241): ningún
 * texto que un cliente pueda ver nombra al conserje ni le promete la
 * revisión de la noche; lo que el cliente usa para eso es la Bandeja (sus
 * respuestas listas para su toque) y el chat de Subir (sus pedidos por
 * escrito). Aprobación del dueño en el tablero, 23/11 00:17.
 *
 * El censo completo vive en el scratch del lote (CENSO.md): recorrió el
 * árbol entero y no encontró NINGÚN string visible para clientes con la
 * palabra — el diff de código de producción del lote es vacío y esta suite
 * es la invariante pinchada, con el control prístino mostrando el estado
 * de hoy (el inventario clasificado completo).
 *
 * A · Inventario clasificado (prístino y release): cada línea con
 *     «conserje|concierge» del bundle del cliente y de los módulos que
 *     producen texto para el cliente se clasifica en COMENTARIO /
 *     OPERADOR (panel admin del dueño, consola web) / MUERTO (chunk viejo
 *     sin cargar, clases CSS sin uso) / INTERNO (identificadores, rutas,
 *     la sonda y el trampolín deliberados) / RUIDO (el «concierge desk»
 *     de un prompt de imagen). SOSPECHOSO = todo lo demás: tiene que ser 0.
 * B · Los destinos vivos están en el bundle: la copia de la Bandeja y la
 *     del acuse de Subir (ES + EN) sigue presente en app.js.
 * C · Boot del release: lo SERVIDO por HTTP clasifica igual (0
 *     sospechosos), /conserje responde la consola del operador intacta,
 *     y chunk-conserje.js no es referenciado por ningún archivo vivo.
 * D · Release == prístino en los archivos de producción censados (el
 *     lote no cambia código: la costura ya estaba cerrada).
 *
 * El árbol prístino se busca en PZ_PRISTINE_DIR o en ../base (el scratch
 * del lote); sin él, el control A/D se omite con nota.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const PRISTINE = process.env.PZ_PRISTINE_DIR || path.resolve(ROOT, '..', 'base');
const HAY_BASE = fs.existsSync(path.join(PRISTINE, 'public', 'app.js'));

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Clasificador de ocurrencias. Escanea línea por línea llevando el estado de
// comentario de bloque y de string, para distinguir el texto visible de los
// comentarios y los identificadores. Las excepciones internas llevan nombre.
// ---------------------------------------------------------------------------
const RE_CONSERJE = /conserje|concierge/i;
const EXCEPCIONES_INTERNAS = [
  { re: /\/api\/conserje\/puerta/, clase: 'INTERNO:sonda-puerta' },
  { re: /location\.replace\('\/conserje'/, clase: 'INTERNO:trampolin' },
  { re: /tab === 'conserje'/, clase: 'INTERNO:tab' },
  { re: /'conserje'\) \? ' bb-glass-pantallas'/, clase: 'INTERNO:tab-clase' },
  { re: /#\/app\/conserje/, clase: 'INTERNO:url-push-operador' },
  { re: /\/conserje\.js/, clase: 'INTERNO:consola-web' },
  { re: /conserje\.html/, clase: 'INTERNO:consola-web' },
  { re: /app\.(get|post)\('\/api\/[^\n]*conserje/, clase: 'INTERNO:ruta-admin' },
  { re: /console\.(log|error|warn)\(/, clase: 'INTERNO:log-servidor' },
  { re: /app\.(get|post)\('\/conserje'/, clase: 'INTERNO:ruta-consola' },
  { re: /require\('\.\/conserje/, clase: 'INTERNO:require' },
  { re: /concierge desk/i, clase: 'RUIDO:prompt-imagen' },
];

// Devuelve para cada línea con match: { linea, clase, texto }.
function clasificarArchivo(absPath, forzarClase) {
  const src = fs.readFileSync(absPath, 'utf8');
  const lineas = src.split('\n');
  const out = [];
  let enBloque = false;
  for (let i = 0; i < lineas.length; i++) {
    const ln = lineas[i];
    if (!RE_CONSERJE.test(ln)) {
      // mantener el estado de bloque aunque la línea no tenga la palabra
      let j = 0, enStr = null;
      while (j < ln.length) {
        if (enBloque) { const k = ln.indexOf('*/', j); if (k === -1) { j = ln.length; break; } enBloque = false; j = k + 2; continue; }
        if (enStr) { if (ln[j] === '\\') { j += 2; continue; } if (ln[j] === enStr) enStr = null; j++; continue; }
        if (ln.startsWith('//', j)) break;
        if (ln.startsWith('/*', j)) { enBloque = true; j += 2; continue; }
        const c = ln[j];
        if (c === "'" || c === '"' || c === '`') enStr = c;
        j++;
      }
      continue;
    }
    // línea con match: ubicar cada match y clasificarlo
    const matches = [...ln.matchAll(new RegExp(RE_CONSERJE.source, 'gi'))];
    for (const m of matches) {
      let clase = null;
      if (forzarClase) clase = forzarClase;
      else if (enBloque) clase = 'COMENTARIO';
      else {
        // ¿el match cae tras un // fuera de string en esta línea?
        let enStr2 = null, comentarioAntes = false, bloqueAntes = enBloque;
        let j = 0;
        while (j < m.index) {
          if (bloqueAntes) { const k = ln.indexOf('*/', j); if (k === -1 || k >= m.index) { comentarioAntes = true; break; } bloqueAntes = false; j = k + 2; continue; }
          if (enStr2) { if (ln[j] === '\\') { j += 2; continue; } if (ln[j] === enStr2) enStr2 = null; j++; continue; }
          if (ln.startsWith('//', j)) { comentarioAntes = true; break; }
          if (ln.startsWith('/*', j)) { bloqueAntes = true; j += 2; continue; }
          const c = ln[j];
          if (c === "'" || c === '"' || c === '`') enStr2 = c;
          j++;
        }
        if (comentarioAntes || bloqueAntes) clase = 'COMENTARIO';
      }
      if (!clase) {
        for (const ex of EXCEPCIONES_INTERNAS) if (ex.re.test(ln)) { clase = ex.clase; break; }
      }
      if (!clase) {
        // ¿el match es parte de un identificador, un acceso por propiedad
        // (obj.conserje) o la clave de un objeto/payload (conserje: …)?
        const antes = ln[m.index - 1] || '';
        const resto = ln.slice(m.index + m[0].length);
        const despues = resto[0] || '';
        if (/[A-Za-z0-9_$.]/.test(antes) || /[A-Za-z0-9_$]/.test(despues) || /^\s*:/.test(resto)) clase = 'INTERNO:identificador';
      }
      if (!clase) clase = 'SOSPECHOSO';
      out.push({ linea: i + 1, clase, texto: ln.trim().slice(0, 140) });
    }
    // actualizar estado de bloque al final de la línea con match
    let j = 0, enStr = null;
    while (j < ln.length) {
      if (enBloque) { const k = ln.indexOf('*/', j); if (k === -1) { j = ln.length; break; } enBloque = false; j = k + 2; continue; }
      if (enStr) { if (ln[j] === '\\') { j += 2; continue; } if (ln[j] === enStr) enStr = null; j++; continue; }
      if (ln.startsWith('//', j)) break;
      if (ln.startsWith('/*', j)) { enBloque = true; j += 2; continue; }
      const c = ln[j];
      if (c === "'" || c === '"' || c === '`') enStr = c;
      j++;
    }
  }
  return out;
}

function inventario(root) {
  const jobs = [
    // bundle del cliente
    ['public/app.js', null],
    ['public/chunk-analisis.js', null],
    ['public/chunk-ajustes.js', null],
    ['public/chunk-creator.js', null],
    ['public/chunk-flyer.js', null],
    ['public/chunk-reel.js', null],
    ['public/chunk-terminos.js', null],
    ['public/ads.js', null], ['public/destacado.js', null], ['public/dislike.js', null],
    ['public/gj.js', null], ['public/panel.js', null], ['public/posty-chat.js', null],
    ['public/qr-vendor.js', null], ['public/showcase-lp.js', null], ['public/sw.js', null],
    // superficies del operador (clasificación forzada, declaradas)
    ['public/chunk-admin.js', 'OPERADOR:panel-admin'],
    ['public/conserje.js', 'OPERADOR:consola-web'],
    ['public/conserje.html', 'OPERADOR:consola-web'],
    ['public/chunk-conserje.js', 'MUERTO:chunk-sin-cargar'],
    // módulos del servidor que producen texto para el cliente
    // (support-cases es vocabulario del operador — casos, etiquetas, pasos —;
    // su ÚNICO string que llega al cliente es la reply de divertToConcierge,
    // que la sección B verifica literal por literal)
    ['push.js', null], ['bandeja.js', null], ['support-cases.js', 'OPERADOR:modulo-soporte'],
    ['server.js', null], ['scheduler.js', null],
    ['carta-audio.js', null], ['analysis-engine.js', null], ['relacion.js', null],
    ['image-styles-rubros.js', null],
  ];
  const porArchivo = {};
  let sospechosos = [];
  for (const [rel, forzada] of jobs) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const items = clasificarArchivo(abs, forzada);
    porArchivo[rel] = items;
    for (const it of items) if (it.clase === 'SOSPECHOSO') sospechosos.push(rel + ':' + it.linea + ' ' + it.texto);
  }
  // styles.css: toda ocurrencia tiene que ser clase muerta o comentario
  const cssAbs = path.join(root, 'public', 'styles.css');
  if (fs.existsSync(cssAbs)) {
    const items = [];
    fs.readFileSync(cssAbs, 'utf8').split('\n').forEach((ln, i) => {
      if (RE_CONSERJE.test(ln)) {
        const esClase = /\.pz-[a-z-]*conserje|\.pz-conserje/.test(ln);
        const esComentario = /^\s*\/\*|\*\/|^\s*\*/.test(ln) || /conserje/i.test(ln) && /\/\*/.test(ln.slice(0, ln.toLowerCase().indexOf('conserje')));
        items.push({ linea: i + 1, clase: esClase ? 'MUERTO:css-sin-uso' : (esComentario ? 'COMENTARIO' : 'SOSPECHOSO'), texto: ln.trim().slice(0, 140) });
      }
    });
    porArchivo['public/styles.css'] = items;
    for (const it of items) if (it.clase === 'SOSPECHOSO') sospechosos.push('public/styles.css:' + it.linea + ' ' + it.texto);
  }
  return { porArchivo, sospechosos };
}

function imprimirInventario(titulo, inv) {
  console.log('  — inventario ' + titulo + ' —');
  for (const [rel, items] of Object.entries(inv.porArchivo)) {
    if (!items.length) continue;
    const porClase = {};
    for (const it of items) porClase[it.clase] = (porClase[it.clase] || 0) + 1;
    console.log('    ' + rel + ': ' + items.length + ' → ' + Object.entries(porClase).map(([k, v]) => k + '×' + v).join(' · '));
  }
}

// ---------------------------------------------------------------------------
function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (let p = 21511; p < 21611; p++) { if (!out.includes(':' + p + ' ')) return p; }
  throw new Error('sin puerto libre');
}
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}

(async () => {
  seccion('A · Inventario clasificado — ningún string visible nombra al conserje');
  const invRel = inventario(ROOT);
  imprimirInventario('release', invRel);
  t('release: 0 ocurrencias SOSPECHOSAS (toda mención es comentario, operador, muerta, interna o ruido)',
    invRel.sospechosos.length === 0, invRel.sospechosos.slice(0, 5).join(' | '));
  const invBase = HAY_BASE ? inventario(PRISTINE) : null;
  if (invBase) {
    imprimirInventario('prístino (control — los textos de hoy)', invBase);
    t('control prístino: 0 SOSPECHOSAS también hoy (la costura ya estaba cerrada en v1243)',
      invBase.sospechosos.length === 0, invBase.sospechosos.slice(0, 5).join(' | '));
  } else console.log('  (sin árbol prístino: control omitido con nota)');

  seccion('B · Los destinos vivos del cliente están en el bundle');
  const appjs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const destinos = [
    'ESPERA TU TOQUE', 'WAITING FOR YOUR TAP',
    'Preparadas por Posty', 'Prepared by Posty',
    'Todavía no hay respuestas para preparar', 'No replies to prepare yet',
    '¿Tenés una idea?', 'Got an idea?',
    'Respuesta estimada', 'Estimated reply',
    'te avisamos con una push', "we'll let you know with a push",
  ];
  for (const d of destinos) t('app.js trae la copia viva «' + d + '»', appjs.includes(d));
  t('app.js NO trae «Revisión de la noche» como texto visible', !/Revisión de la noche/.test(appjs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
  const sc = fs.readFileSync(path.join(ROOT, 'support-cases.js'), 'utf8');
  const dv = sc.slice(sc.indexOf('function divertToConcierge'), sc.indexOf('function divertToConcierge') + 2600);
  // la reply se arma por concatenación: se juntan TODOS sus literales
  const replyExpr = dv.slice(dv.indexOf('reply:'), dv.indexOf('reply:') + 220);
  const replyLit = [...replyExpr.matchAll(/'([^']*)'/g)].map((m) => m[1]).join('');
  t('el acuse del modo conserje al cliente no nombra al conserje',
    replyLit.includes('te respondemos en este chat') && replyLit.includes('recibido') && !/conserje/i.test(replyLit), replyLit);
  t('push.js no menciona al conserje en ningún payload', !RE_CONSERJE.test(fs.readFileSync(path.join(ROOT, 'push.js'), 'utf8')));
  t('bandeja.js no menciona al conserje', !RE_CONSERJE.test(fs.readFileSync(path.join(ROOT, 'bandeja.js'), 'utf8')));

  seccion('C · Boot del release — lo servido clasifica igual y la consola vive');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-costura-'));
  const port = freePort();
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, MEDIA_DIR: path.join(dir, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const base = 'http://127.0.0.1:' + port;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
  t('el release bootea y /api/version responde', up, log.slice(-300));
  if (up) {
    const servido = {};
    for (const p of ['/app.js', '/chunk-ajustes.js', '/chunk-analisis.js', '/chunk-admin.js', '/']) {
      const r = await fetch(base + p);
      servido[p] = await r.text();
      t('GET ' + p + ' → 200', r.ok);
    }
    // clasificar lo servido con el mismo clasificador (sobre texto en memoria)
    const tmp = path.join(dir, 'servido-app.js');
    fs.writeFileSync(tmp, servido['/app.js']);
    const invServ = clasificarArchivo(tmp, null);
    const sospServ = invServ.filter((x) => x.clase === 'SOSPECHOSO');
    t('el app.js SERVIDO clasifica con 0 sospechosas', sospServ.length === 0, sospServ.slice(0, 3).map((x) => x.texto).join(' | '));
    t('el index servido no referencia chunk-conserje', !/chunk-conserje/.test(servido['/']));
    t('ningún archivo vivo llama loadChunk(\'conserje\')',
      !/loadChunk\('conserje'\)/.test(servido['/app.js']) && !/loadChunk\('conserje'\)/.test(servido['/chunk-admin.js']) && !/loadChunk\('conserje'\)/.test(servido['/chunk-ajustes.js']) && !/loadChunk\('conserje'\)/.test(servido['/chunk-analisis.js']));
    const rCons = await fetch(base + '/conserje');
    const htmlCons = await rCons.text();
    t('GET /conserje → 200 con la consola del operador (su casa, intacta)', rCons.ok && /<title>Conserje/.test(htmlCons));
    const rPuerta = await fetch(base + '/api/conserje/puerta');
    t('GET /api/conserje/puerta responde (la sonda interna sigue viva, sin sesión = no casa)',
      rPuerta.status === 401 || rPuerta.ok);
  }
  try { process.kill(proc.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  t('el boot muere por PID exacto y el puerto queda libre', portFree(port));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}

  seccion('D · Release == prístino en producción (diff del lote: solo esta suite)');
  if (HAY_BASE) {
    const archivos = ['public/app.js', 'public/styles.css', 'public/chunk-admin.js', 'public/chunk-analisis.js',
      'public/chunk-ajustes.js', 'public/conserje.js', 'public/conserje.html', 'server.js', 'bandeja.js',
      'push.js', 'support-cases.js', 'scheduler.js'];
    let difieren = [];
    for (const rel of archivos) {
      const a = fs.readFileSync(path.join(PRISTINE, rel));
      const b = fs.readFileSync(path.join(ROOT, rel));
      if (!a.equals(b)) difieren.push(rel);
    }
    t('los 12 archivos censados son byte-idénticos entre prístino y release', difieren.length === 0, difieren.join(', '));
  } else console.log('  (sin árbol prístino: D omitida con nota)');

  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
