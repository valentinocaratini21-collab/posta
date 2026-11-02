'use strict';
/* test-loteglassperfil.js — LOTE GLASS PERFIL (1/11, opinión bamboo: SÍ)
   + DECISIÓN VALENTINO 1/11 21:52: bajar SOLO la tarjeta a .40.
   Hallazgo de auditoría (verificado contra código servido v533/v534 y
   contra la captura de Valentino): la tarjeta de perfil de Inicio YA
   llevaba la receta de vidrio v519. Este test la FIJA para que nadie la
   vuelva a blanquear en silencio:
   - #inicioView .hf-head tiene la receta v519 con alfa .40 (decisión
     1/11 21:52): blur 16px saturate 1.4 + borde .75 + sombra sutil +
     radio 22px. El resto de la receta NO cambió.
   - La tira del jardín y los botones QUEDAN en .55 (decisión 1/11):
     la receta ya NO es uniforme entre paneles — documentado así a
     propósito, no es deriva accidental. Contraste re-medido con
     números (contrast-40.py): navy 13.10–16.30:1, gris 3.69–4.59:1
     (peor zona = glow azul, igual que en .55; caída máxima 0.24).
   - FOTOS SIN VIDRIO: ninguna regla con backdrop-filter apunta a
     fotos, miniaturas ni avatares.
   - El render de homeHeadHTML sigue intacto (nombre + tic + «i» +
     stats + nombre + @ + racha + botones), y el vidrio viene de CSS,
     nunca inline.
   - El «i» se cuenta sin importar su fila (v533: en hf-user; i-racha:
     en hf-racha): el test pasa en ambas, para no pelearse con el
     re-base de la liberación.
   Repo-ejecutable: node test-loteglassperfil.js (desde la raíz).
   Lee ./public/app.js y ./public/styles.css. Sin red, sin deps. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
}

/* Extractor por llaves con estado de cadena (patrón de test-feed-16-17.js). */
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let depth = 0, j = i, q = null, esc = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = null;
    } else {
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
  }
  if (depth !== 0) return null;
  return src.slice(i, j + 1);
}

const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

/* Regla CSS de una línea: devuelve su cuerpo o null. */
function cssRule(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}');
  const m = css.match(re);
  return m ? m[1] : null;
}
function cssRuleAll(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'g');
  return [...css.matchAll(re)].map((m) => m[1]);
}
/* Alfa por panel (decisión Valentino 1/11 21:52): tarjeta .40, tira y
   botones .55. El resto de la receta es compartido. */
const RECIPE_REST = [
  '-webkit-backdrop-filter:blur(16px) saturate(1.4)',
  'backdrop-filter:blur(16px) saturate(1.4)',
  'border:1px solid rgba(255,255,255,.75)',
  'box-shadow:0 8px 24px rgba(10,30,51,.10)',
];
const BG40 = 'background:rgba(255,255,255,.40)';
const BG55 = 'background:rgba(255,255,255,.55)';
const RECIPE55 = [BG55, ...RECIPE_REST];

/* ---------- 1. La tarjeta de perfil de Inicio ES vidrio .40 (decisión 1/11) ---------- */
const headGlass = cssRule('#inicioView .hf-head');
ok('G1 regla #inicioView .hf-head existe', !!headGlass);
for (const tok of RECIPE_REST) ok('G1 hf-head trae ' + tok, !!headGlass && headGlass.includes(tok));
ok('G1 hf-head fondo .40 (decisión 1/11 21:52)', !!headGlass && headGlass.includes(BG40));
ok('G1 hf-head ya NO está en .55 (no es un revert a uniforme)', !!headGlass && !headGlass.includes(BG55));
ok('G1 hf-head radio 22px', !!headGlass && headGlass.includes('border-radius:22px'));
ok('G1 hf-head margen/padding de panel', !!headGlass && headGlass.includes('margin:0 12px') && headGlass.includes('padding:16px'));

/* ---------- 2. Tira del jardín y botones: siguen en .55, sin tocar ---------- */
const tiraGlass = cssRule('#inicioView .mx-tira-jardin.mx-tira-posty');
ok('G2 tira jardín vidrio existe', !!tiraGlass);
for (const tok of RECIPE55) ok('G2 tira trae ' + tok, !!tiraGlass && tiraGlass.includes(tok));
const pmainRules = cssRuleAll('#inicioView .hf-pacts .hf-pmain');
ok('G3 botones vidrio existen', pmainRules.length > 0);
const pmainEff = pmainRules[pmainRules.length - 1];
ok('G3 botones: la regla EFECTIVA (última, 4201) trae la receta .55',
  !!pmainEff && RECIPE55.every((tok) => pmainEff.includes(tok)));
ok('G4 resto de receta compartido en los 3 paneles; alfa diverge por decisión',
  !!headGlass && !!tiraGlass && pmainRules.length > 0
  && RECIPE_REST.every((tok) => headGlass.includes(tok) && tiraGlass.includes(tok) && pmainEff.includes(tok))
  && headGlass.includes(BG40) && tiraGlass.includes(BG55) && pmainEff.includes(BG55));

/* ---------- 3. Fotos sin vidrio ---------- */
const backdropRules = [];
{
  const re = /([^{}]+)\{([^{}]*backdrop-filter[^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) backdropRules.push(m[1].trim());
}
ok('G5 hay reglas con backdrop-filter', backdropRules.length > 0);
ok('G5 ningún backdrop-filter apunta a foto/avatar/miniatura',
  backdropRules.every((sel) => !/img|foto|ava|thumb/i.test(sel)),
  backdropRules.filter((sel) => /img|foto|ava|thumb/i.test(sel)).join(' | '));

/* ---------- 4. Vidrio solo en Inicio; fondo degradado detrás ---------- */
ok('G6 base .hf-head sigue blanca fuera de Inicio', /\.hf-head\{[^}]*background:#fff/.test(css));
ok('G7 Inicio tiene fondo degradado detrás del vidrio',
  /#inicioView\.hf-wrap\{[^}]*linear-gradient/.test(css));

/* ---------- 5. Control negativo: sin la regla, el test discrimina ---------- */
{
  const mutated = css.replace(/#inicioView \.hf-head\{[^}]*\}/, '');
  const m2 = mutated.match(/#inicioView \.hf-head\{([^}]*)\}/);
  ok('G8 sin la regla, la extracción da null (discrimina)', m2 === null);
}

/* ---------- 6. Render real de la cabecera (vm) ---------- */
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const pzDecEnt = extractFn(app, 'function pzDecEnt');
const pzIcFn = extractFn(app, 'function pzIc');
const headFn = extractFn(app, 'function homeHeadHTML');
const pactsFn = extractFn(app, 'function hfProfileActionsHTML');
ok('R1 extrae esc', !!escLine);
ok('R1 extrae pzDecEnt', !!pzDecEnt);
ok('R1 extrae pzIc', !!pzIcFn);
ok('R1 extrae homeHeadHTML', !!headFn);
ok('R1 extrae hfProfileActionsHTML', !!pactsFn);
let H = null, P = null;
if (escLine && pzDecEnt && pzIcFn && headFn && pactsFn) {
  const flame = app.match(/flame: '([^']*)'/);
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(
    escLine + '\nconst PZ_IC_CEL = "#2793C8";\nconst PZ_IC = { flame: ' + JSON.stringify(flame ? flame[1] : '') + ' };\n'
    + pzDecEnt + '\n' + pzIcFn + '\n' + headFn + '\n' + pactsFn, ctx);
  H = ctx.homeHeadHTML;
  P = ctx.hfProfileActionsHTML;
}
ok('R1 homeHeadHTML ejecutable', typeof H === 'function');
ok('R1 hfProfileActionsHTML ejecutable', typeof P === 'function');
if (H && P) {
  const prof = { username: 'posty.communitymanager', name: 'Posty.', pic: 'x.jpg',
    posts_count: 7, followers: 8, is_verified: true };
  const h = H(prof, '', { splitHead: true, racha: 2 });
  ok('R2 render trae hf-head', h.includes('class="hf-head"'));
  ok('R2 hf-head sin fondo inline (el vidrio viene de CSS)', !/class="hf-head"[^>]*style=/.test(h));
  ok('R2 nombre + tic', h.includes('posty.communitymanager') && h.includes('hf-verified'));
  ok('R2 botón «i» presente una sola vez (sin importar su fila)',
    (h.match(/hf-info-btn/g) || []).length === 1);
  ok('R2 stats 7 publicaciones', h.includes('>7<') && h.includes('publicaciones'));
  ok('R2 stats 8 seguidores', h.includes('>8<') && h.includes('seguidores'));
  ok('R2 nombre Posty.', h.includes('>Posty.<'));
  ok('R2 @ link', h.includes('@posty.communitymanager'));
  ok('R2 racha 2 semanas', h.includes('2 semanas seguidas publicando'));
  const hEn = H(prof, '', { splitHead: true, racha: 2, en: true });
  ok('R3 EN racha', hEn.includes('2 weeks in a row posting'));
  ok('R3 EN stats', hEn.includes('followers') && hEn.includes('posts'));
  const hNoRacha = H(prof, '', { splitHead: true, racha: 1 });
  // SUPERSEDED 1/11 v535 (lote «i»-racha, decisión Valentino): la fila
  // hf-racha existe SIEMPRE que hay usuario; sin racha muestra el
  // botón «i» + etiqueta, no desaparece. El viejo "no hay hf-racha"
  // quedó obsoleto; se exige la fila con «i» + etiqueta.
  ok('R4 sin racha: fila hf-racha con «i» + etiqueta (i-racha v535)', hNoRacha.includes('hf-racha') && hNoRacha.includes('¿Cómo publica Posty?'));
  ok('R4 sin racha resto intacto', hNoRacha.includes('hf-verified') && hNoRacha.includes('>7<'));
  const acts = P(false);
  ok('R5 botones Editar/Compartir intactos',
    acts.includes('hf-pmain') && acts.includes('Editar perfil') && acts.includes('Compartir mi perfil'));
  const tiraSrc = extractFn(app, 'function mxTiraHTML');
  ok('R6 tira jardín existe con su clase y foto',
    !!tiraSrc && tiraSrc.includes('mx-tira-jardin mx-tira-posty') && tiraSrc.includes('mx-tira-foto'));
  ok('R6 tira sin vidrio inline', !!tiraSrc && !tiraSrc.includes('background:rgba'));
}

console.log(`loteglassperfil: ${pass} pass, ${fail} fail`);
if (fails.length) { for (const f of fails) console.log('  FAIL: ' + f); process.exit(1); }
