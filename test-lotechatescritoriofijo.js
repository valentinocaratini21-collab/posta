// LOTE CHAT-ESCRITORIO-FIJO — test nuevo (solo región; no toca producción).
// Uso: node test-lotechatescritoriofijo.js [dir]  (dir = work/ o pristine-v558/)
// Sale 0 solo si TODOS los asserts pasan.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = process.argv[2] || __dirname;
const css = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

let ok = 0, bad = 0;
function t(name, cond, extra = "") {
  if (cond) { ok++; console.log(`ok - ${name}`); }
  else { bad++; console.log(`FAIL - ${name} ${extra}`); }
}
function has(s) { return css.includes(s); }

// --- 1. Móvil intacto (≤820px) ---
t("móvil: bottomstack fijo left12/right12/bottom72",
  has(".mz-bottomstack{position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom))"));
t("móvil: chatbar estática dentro del stack",
  has(".mz-bottomstack .mz-chatbar{position:static;left:auto;right:auto;bottom:auto;z-index:auto}"));
t("móvil: accept-bar PÍLDORA COMPACTA centrada dentro del stack (SUPERSEDED CON CAUSA v564, decisión Valentino 2/11: la barra a todo el ancho se veía demasiado larga; el lote escritorio NO la toca en móvil)",
  has(".mz-bottomstack .hf-accept-bar{position:static;width:fit-content") &&
  has("margin-left:auto;margin-right:auto"));
t("móvil: acceptbar-on despeja 196px",
  has("#inicioView.hf-wrap.hf-acceptbar-on{padding-bottom:calc(196px + env(safe-area-inset-bottom))}"));
t("base: chatbar oculta fuera de móvil", has(".mz-chatbar{display:none}"));
t("base: despeje Inicio 148px intacto",
  has("#inicioView.hf-wrap{padding-bottom:calc(148px + env(safe-area-inset-bottom))}"));
t("base: píldora Agenda (.accept-pill) intacta, no tocada",
  has(".accept-pill{position:fixed;right:16px;bottom:calc(86px + env(safe-area-inset-bottom))"));

// --- 2. Escritorio sin sidebar (821–1023): columna .main max 1060, lateral 32 ---
const mid = css.split("@media(min-width:821px) and (max-width:1023px){")[1] || "";
const midBlock = mid.split("@media(min-width:1024px){")[0] || "";
t("821–1023: bloque existe", !!midBlock);
t("821–1023: bottomstack fijo abajo 16, alineado columna 1060/32",
  midBlock.includes(".main #inicioView .mz-bottomstack{position:fixed") &&
  midBlock.includes("bottom:16px") &&
  midBlock.includes("left:calc(max(32px,(100vw - 1060px)/2 + 32px))") &&
  midBlock.includes("width:calc(min(1060px,100vw) - 64px)"));
t("821–1023: chatbar visible y estática dentro del stack",
  midBlock.includes(".main #inicioView .mz-bottomstack .mz-chatbar{display:flex") &&
  midBlock.includes("position:static"));
t("821–1023: visitante sigue sin chatbar",
  midBlock.includes(".main #inicioView.hf-visitor .mz-bottomstack .mz-chatbar{display:none}"));
t("821–1023: accept-bar estática a todo el ancho dentro del stack",
  midBlock.includes(".main #inicioView .mz-bottomstack .hf-accept-bar{position:static;width:100%"));
t("821–1023: acceptbar-on despeja 196px",
  midBlock.includes(".main #inicioView.hf-wrap.hf-acceptbar-on{padding-bottom:calc(196px + env(safe-area-inset-bottom))}"));

// --- 3. Escritorio con sidebar (≥1024): sidebar 280, columna 920, lateral 24 ---
const desk = css.split("@media(min-width:1024px){").slice(1).join("@media(min-width:1024px){");
// El bloque nuevo es el ÚLTIMO @media(min-width:1024px) del archivo (va al final).
const lastDesk = css.slice(css.lastIndexOf("@media(min-width:1024px){"));
t("≥1024: bloque nuevo existe al final", lastDesk.includes("LOTE CHAT-ESCRITORIO-FIJO") || css.includes("LOTE CHAT-ESCRITORIO-FIJO"));
const d = lastDesk;
t("≥1024: bottomstack fijo abajo 16, con offset sidebar 280 y columna 920/24",
  d.includes(".main #inicioView .mz-bottomstack{position:fixed") &&
  d.includes("bottom:16px") &&
  d.includes("left:calc(280px + max(24px,(100vw - 280px - 920px)/2 + 24px))") &&
  d.includes("width:calc(min(920px,100vw - 280px) - 48px)"));
t("≥1024: chatbar visible y estática dentro del stack",
  d.includes(".main #inicioView .mz-bottomstack .mz-chatbar{display:flex") &&
  d.includes("position:static"));
t("≥1024: visitante sigue sin chatbar",
  d.includes(".main #inicioView.hf-visitor .mz-bottomstack .mz-chatbar{display:none}"));
t("≥1024: accept-bar estática a todo el ancho dentro del stack (no píldora flotante)",
  d.includes(".main #inicioView .mz-bottomstack .hf-accept-bar{position:static;width:100%"));
t("≥1024: acceptbar-on despeja 196px",
  d.includes(".main #inicioView.hf-wrap.hf-acceptbar-on{padding-bottom:calc(196px + env(safe-area-inset-bottom))}"));

// --- 4. Alcance: solo shell web (.main); nada sin scoping fuera del bloque móvil ---
const afterMobile = css.split("@media(max-width:820px){").slice(1).join("");
// Contar solo las reglas #inicioView .mz-bottomstack SIN el prefijo .main
// (el regex simple casaría como subcadena dentro de ".main #inicioView …").
const scopedMatches = afterMobile.match(/(\.main )?#inicioView \.mz-bottomstack\{position:fixed/g) || [];
const unscoped = scopedMatches.filter((m) => !m.startsWith(".main")).length;
t("sin reglas nuevas sin scoping .main fuera de móvil", unscoped === 0, `(halladas ${unscoped})`);
t("shell nativo (.bb-main) sin reglas nuevas",
  !css.includes(".bb-main #inicioView .mz-bottomstack"));

// --- 5. app.js intacto: landing/chat público sin tocar ---
t("app.js: pzLpChatBind intacto (web pública no tocada)",
  appJs.includes("function pzLpChatBind()") && appJs.includes("pzLpChatHTML"));
t("app.js: inicioView sigue renderizando el bottomstack",
  appJs.includes('class="mz-bottomstack"'));

// --- 6. CSS bien formado: llaves balanceadas ---
const opens = (css.match(/{/g) || []).length, closes = (css.match(/}/g) || []).length;
t("llaves balanceadas en styles.css", opens === closes, `(${opens} vs ${closes})`);

// --- 7. Geometría simulada: el stack cae EXACTO sobre la caja interior del feed ---
function col821(w) { // sin sidebar: .main max 1060, lateral 32
  const colW = Math.min(1060, w);
  return { left: (w - colW) / 2 + 32, width: colW - 64 };
}
function stack821(w) {
  const left = Math.max(32, (w - 1060) / 2 + 32);
  return { left, width: Math.min(1060, w) - 64 };
}
function col1024(w) { // sidebar 280, .main max 920, lateral 24
  const r = w - 280, colW = Math.min(920, r);
  return { left: 280 + (r - colW) / 2 + 24, width: colW - 48 };
}
function stack1024(w) {
  const left = 280 + Math.max(24, (w - 280 - 920) / 2 + 24);
  return { left, width: Math.min(920, w - 280) - 48 };
}
for (const w of [900, 1000, 1023]) {
  const a = col821(w), b = stack821(w);
  t(`geometría 821–1023 @${w}px: stack == columna`, Math.abs(a.left - b.left) < 0.01 && Math.abs(a.width - b.width) < 0.01,
    `(col ${a.left}/${a.width} vs stack ${b.left}/${b.width})`);
}
for (const w of [1024, 1200, 1440, 1920, 2560]) {
  const a = col1024(w), b = stack1024(w);
  t(`geometría ≥1024 @${w}px: stack == columna (sin pisar sidebar)`, Math.abs(a.left - b.left) < 0.01 && Math.abs(a.width - b.width) < 0.01 && b.left >= 304,
    `(col ${a.left}/${a.width} vs stack ${b.left}/${b.width})`);
}

// --- 8. app.js byte-idéntico al prístino (si hay prístino al lado) ---
try {
  const pris = fs.readFileSync(path.join(path.dirname(root), "pristine-v558", "public", "app.js"));
  const h = (b) => crypto.createHash("md5").update(b).digest("hex");
  t("app.js byte-idéntico al prístino v558", h(appJs) === h(pris));
} catch (e) { console.log("skip - sin prístino al lado para comparar app.js"); }

console.log(`\n${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
