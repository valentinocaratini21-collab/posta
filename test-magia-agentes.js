#!/usr/bin/env node
/* Test estático de la tanda MAGIA-AGENTES.
   Uso: node test-magia-agentes.js <dir-pre> <dir-post>
   dir-pre  = árbol base (p. ej. fresh480: contiene public/ y server.js)
   dir-post = árbol parcheado (misma estructura).
   Solo lectura + conteos: no escribe nada. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [preDir, postDir] = process.argv.slice(2);
if (!preDir || !postDir) { console.error('uso: node test-magia-agentes.js <pre> <post>'); process.exit(2); }
let fail = 0;
function ok(cond, name, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra && !cond ? ' :: ' + extra : ''}`);
  if (!cond) fail++;
}
function read(dir, rel) { return fs.readFileSync(path.join(dir, rel), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }

const preApp = read(preDir, 'public/app.js');
const app = read(postDir, 'public/app.js');
const preStyles = read(preDir, 'public/styles.css');
const styles = read(postDir, 'public/styles.css');

// 1. Wrappers presentes (post)
const W = [
  ['tira 52px', '<span class="pz-mg"><img src="ai-avatar.png" alt="Posty" style="width:52px', 1],
  ['celebración 96px big', '<span class="pz-celeb-evo pz-mg pz-mg--big">', 1],
  ['historia', '<span class="pz-mg"><img class="pz-story-av"', 1],
  ['chat hs-ava', '<span class="pz-mg"><img src="ai-avatar.png" class="hs-ava"', 1],
  ['home 4 estados', '<div class="hs-gen-ava"><span class="pz-mg">', 4],
  ['sidebar', '<span class="pz-mg"><img src="ai-avatar.png" alt="Posty" class="side-posty-ava">', 1],
  ['mini-celebración', '<span class="pz-mg"><img class="pc-ava"', 1],
  ['post-pago 30px sm', '<span class="pz-mg pz-mg--sm"><img src="ai-avatar.png" alt="Posty" style="width:30px', 1],
  ['propuesta sm', '<span class="pz-mg pz-mg--sm"><img class="cp-avatar"', 1],
  ['relación sm', '<span class="pz-mg pz-mg--sm"><img src="ai-avatar.png" alt="Posty" class="relacion-ava">', 1],
  ['oficina top sm dorado', '<span class="pz-mg pz-mg--sm" style="--mg-c:#DBA453"><img class="bb-top-av"', 1],
  ['medalla botón', 'pz-mg-medal', 1],
  ['chat vacío oficina', '<div class="bb-chat-vacio"><span class="pz-mg" style="--mg-c:#DBA453">', 1],
  ['hero video ES', '<div class="pz-mg pz-mg--heroV"><video class="hero-video"', 1],
  ['escritorio ES', '<span class="pz-mg pz-mg--gj"><img class="gj-posty"', 1],
  ['feed ES', '<span class="pz-mg pz-mg--feed"><img class="lp-feed-posty"', 1],
  ['carta head ES', '<div class="lp-letter-head"><span class="pz-mg">', 1],
  ['carta firma ES sm', '<div class="lp-letter-sign"><span class="pz-mg pz-mg--sm">', 1],
  ['cap-ig ES sm', '<div class="cap-ig-head"><span class="pz-mg pz-mg--sm">', 1],
];
for (const [n, s, c] of W) ok(count(app, s) === c, `app.js ${n} x${c}`, `hallado x${count(app, s)}`);

// racha con scope: envuelta dentro de showStreakCelebration
const iFn = app.indexOf('function showStreakCelebration');
const jBrace = app.indexOf('{', iFn);
let d = 0, k = jBrace, end = -1;
for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (d === 0) { end = k + 1; break; } } }
const streakSeg = app.slice(iFn, end);
ok(streakSeg.includes('<span class="pz-mg"><img src="ai-avatar.png" alt="Posty" style="width:64px'), 'racha envuelta (scope showStreakCelebration)');
// excluidos: quota + push-prompt conservan el string plano SIN envolver.
// (el conteo por scope falla: los template literals rompen el balanceo de
// llaves ingenuo; lo que importa es que la ocurrencia no esté envuelta.)
function countUnwrapped(src, sub, wrapPrefix) {
  let n = 0, i = 0;
  for (;;) {
    const j = src.indexOf(sub, i);
    if (j < 0) return n;
    if (src.slice(Math.max(0, j - wrapPrefix.length), j) !== wrapPrefix) n++;
    i = j + sub.length;
  }
}
const PLAIN64 = '<img src="ai-avatar.png" alt="Posty" style="width:64px;height:64px;border-radius:50%;box-shadow:0 4px 14px rgba(39,147,200,.35)">';
ok(countUnwrapped(preApp, PLAIN64, '<span class="pz-mg">') === 3, 'pre: 64px plano x3 (quota+racha+push)', `hallado x${countUnwrapped(preApp, PLAIN64, '<span class="pz-mg">')}`);
ok(countUnwrapped(app, PLAIN64, '<span class="pz-mg">') === 2, 'post: 64px plano x2 (solo quota+push; racha envuelta)', `hallado x${countUnwrapped(app, PLAIN64, '<span class="pz-mg">')}`);
// comentario de escritorio sin magia + mock cliente sin magia
ok(count(app, '<img src="ai-avatar.png" alt="">') === 1, 'avatar burbuja comentario intacto (sin magia)');
const phLine = app.split('\n').filter((l) => l.includes('cap-ph-head'));
ok(phLine.length > 0 && phLine.every((l) => !l.includes('pz-mg')), 'mock cliente cap-ph-head sin magia');

// 2. Canon + opt-outs
ok(app.includes("const MG_CANON = { posty: '#2793C8', venty: '#E8836B', gesty: '#A175CA', atenty: '#3FA7A3', oficina: '#DBA453' };"), 'MG_CANON canon presente');
ok(app.includes('function bbAvatarHTML(poder, avatar, nombre, color, cls, magia)'), 'bbAvatarHTML firma con magia');
ok(count(app, "'bb-av bb-av-sm', false") === 3, 'opt-outs río x1 + prefs x2', `hallado x${count(app, "'bb-av bb-av-sm', false")}`);
ok(count(app, '<span class="pz-fam-dot" style="background:${r[1]};box-shadow:0 0 8px ${MG_CANON[r[0]] || r[1]}"></span>') === 1, 'puntos familia con resplandor canónico');

// 3. CSS: bloque presente, llaves balanceadas, clases usadas definidas
ok(styles.includes('MAGIA-AGENTES'), 'styles.css bloque MAGIA-AGENTES');
ok(count(styles, '{') === count(styles, '}'), 'styles.css llaves balanceadas');
for (const cls of ['.pz-mg{', '.pz-mg--sm', '.pz-mg--big', '.pz-mg--heroV', '.pz-mg--heroI', '.pz-mg--gj', '.pz-mg--feed', '.pz-mg-letra', '.bb-medal.pz-mg-medal', '@keyframes pzMgFlota', '@keyframes pzMgBrilla']) {
  ok(styles.includes(cls), `styles.css define ${cls}`);
}

// 4. Website EN + shell + prueba + widget
const en = read(postDir, 'public/en/index.html');
for (const [n, s] of [['hero video EN', '<div class="pz-mg pz-mg--heroV"><video class="hero-video"'],
  ['escritorio EN', '<span class="pz-mg pz-mg--gj"><img class="gj-posty"'],
  ['feed EN', '<span class="pz-mg pz-mg--feed"><img class="lp-feed-posty"'],
  ['hero final EN', '<div class="pz-mg pz-mg--heroI"><img class="hero-posty lp-final-ava"'],
  ['carta head EN', '<div class="lp-letter-head"><span class="pz-mg">'],
  ['carta firma EN', '<div class="lp-letter-sign"><span class="pz-mg pz-mg--sm">'],
  ['cap-ig EN', '<div class="cap-ig-head"><span class="pz-mg pz-mg--sm">']]) {
  ok(count(en, s) === 1, `en/index.html ${n}`);
}
const shell = read(postDir, 'public/index.html');
ok(count(shell, '<div class="pz-mg pz-mg--heroI"><img class="hero-posty"') === 1, 'index.html hero shell');
for (const f of ['public/prueba.html', 'public/en-prueba.html']) {
  const t = read(postDir, f);
  ok(count(t, '<span class="pz-mg"><img src="ai-avatar.png" alt="Posty" style="width:46px') === 2, `${f} res-hero x2`);
  ok(count(t, '<span class="pz-mg"><img src="ai-avatar.png" alt="Posty" class="tk-avatar">') === 1, `${f} tk-avatar x1`);
  ok(t.includes('MAGIA-AGENTES (espejo de styles.css'), `${f} snippet CSS espejo`);
}
const widget = read(postDir, 'public/posty-chat.js');
ok(count(widget, '<span class="pz-mg pz-mg--sm"><img src="/ai-avatar.png" alt="Posty"></span>') === 1, 'widget posty-chat.js avatar envuelto');
ok(widget.includes('MAGIA-AGENTES (espejo de styles.css'), 'widget CSS espejo');

// 5. Assets intactos por md5
for (const a of ['public/ai-avatar.png', 'public/bambooty-avatar.webp', 'public/posty-disenando-hero.jpg', 'public/logo-bambooty.png', 'public/bambooty-placa.webp']) {
  const h = (dir) => crypto.createHash('md5').update(fs.readFileSync(path.join(dir, a))).digest('hex');
  ok(h(preDir) === h(postDir), `asset intacto ${a}`);
}

// 6. Censo pre/post: marcadores, precios, cascada website
function census(dir) {
  const a = read(dir, 'public/app.js');
  const srv = read(dir, 'server.js');
  const web = ['public/index.html', 'public/en/index.html', 'public/prueba.html', 'public/en-prueba.html'].map((f) => read(dir, f)).join('\n');
  return {
    canario: count(srv, 'HEADLINE_INFINITIVES'),
    anillo: count(a, 'logo-bambooty.png') + count(web, 'logo-bambooty.png'),
    sello: count(a, 'sello-bambooty.png') + count(web, 'sello-bambooty.png'),
    lpUy: count(a, 'lpUy'),
    pzIc: count(a, 'pzIc('),
    precio19999: count(a, '199,99') + count(web, '199,99'),
    webVenty: count(web, 'venty'), webGesty: count(web, 'gesty'), webAtenty: count(web, 'atenty'),
  };
}
const cPre = census(preDir), cPost = census(postDir);
for (const k of Object.keys(cPre)) ok(cPre[k] === cPost[k], `censo ${k} pre=${cPre[k]} post=${cPost[k]}`);

// 7. Copy intacto: una muestra de strings que no deben moverse
for (const s of ['Tu semana está completa', 'Compartir mi perfil', 'Pedir un cambio', 'Lo que Posty sabe de tu negocio', 'Your first week could already be ready']) {
  ok(app.includes(s) || en.includes(s) || shell.includes(s), `copy intacto: ${s.slice(0, 30)}`);
}
console.log(fail === 0 ? '\nMAGIA-AGENTES: TODOS LOS CHECKS OK' : `\nMAGIA-AGENTES: ${fail} FALLOS`);
process.exit(fail === 0 ? 0 : 1);
