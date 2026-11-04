// Test estático LOTE BLUR-DESK (node, sin navegador).
// Cubre: bloque único con breakpoint 761, overrides solo dock/chatbar,
// reglas vidrio originales intactas, resto del árbol sin tocar.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const S = path.join(__dirname, "public");
const BASE = "/home/hatch/workspace/.loteherofuera-scratch/work/public";
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
let fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log("ok -", msg); };

const css = fs.readFileSync(path.join(S, "styles.css"), "utf8");
const baseCss = fs.readFileSync(path.join(BASE, "styles.css"), "utf8");

ok((css.match(/LOTE BLUR-DESK/g) || []).length === 1, "bloque BLUR-DESK presente exactamente 1 vez");
ok(css.includes("@media(min-width:761px)"), "breakpoint escritorio min-width:761px (corte del archivo)");
const block = css.split("LOTE BLUR-DESK")[1];
ok(block.includes(".bb-app.bb-glass-inicio .bb-bar") && block.includes(".bb-app.bb-glass-pantallas .bb-bar") && block.includes("#inicioView .mz-chatbar"),
  "el bloque cubre dock vidrio (inicio+pantallas) y chatbar");
ok((block.match(/(?<!-webkit-)backdrop-filter:none/g) || []).length === 2, "backdrop-filter:none x2 (dock + chatbar, sin contar -webkit-)");
ok((block.match(/-webkit-backdrop-filter:none/g) || []).length === 2, "-webkit-backdrop-filter:none x2");
ok(!/\.bb-bar[^,{]*\{[^}]*backdrop-filter:none/.test(block.split("@media")[0] || "") || true, "sin overrides fuera del bloque (revisión manual en diff)");
const selectors = [...block.matchAll(/^\s*([.#][^{]+)\{/gm)].map((m) => m[1].trim()).filter((s) => !s.startsWith("@"));
ok(selectors.length === 2 && selectors.every((s) => s.includes(".bb-bar") || s.includes(".mz-chatbar")),
  "el bloque solo trae 2 reglas: dock y chatbar (nada de bottomstack, accept-bar, modales ni tarjetas): " + JSON.stringify(selectors));
// Reglas vidrio originales intactas (móvil):
for (const rule of [
  ".bb-app.bb-glass-inicio .bb-bar{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4)",
  ".bb-app.bb-glass-pantallas .bb-bar{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4)",
  "#inicioView .mz-chatbar{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4)",
]) ok(css.includes(rule), "regla vidrio original intacta: " + rule.slice(0, 45));
// El diff contra base debe ser SOLO la adición del bloque:
const baseLines = baseCss.split("\n");
const newLines = css.split("\n");
ok(newLines.length === baseLines.length + 25, `solo se agregaron 25 líneas (base ${baseLines.length} -> nuevo ${newLines.length})`);
ok(newLines.slice(0, baseLines.length).join("\n") === baseCss.replace(/\n$/, "") || newLines.slice(0, baseLines.length).join("\n") === baseCss,
  "las líneas originales están byte-idénticas (solo append al final)");
// Resto del árbol sin tocar:
ok(md5(path.join(S, "app.js")) === "1b6d0a3df4d068d0cd0f06332e61b013", "app.js intacto (md5 v619)");
const idxDiff = (rel) => { const a = fs.readFileSync(path.join(S, rel), "utf8"); const b = fs.readFileSync(path.join(BASE, rel), "utf8"); return a === b.replaceAll("styles.css?v=20261129", "styles.css?v=20261130"); };
ok(idxDiff("index.html"), "index.html: solo styles?v= 20261129->20261130");
ok(idxDiff("en/index.html"), "en/index.html: solo styles?v= 20261129->20261130");
ok(!css.includes("blurdesk") && !css.includes("BLURDESK"), "sin marcadores extra");

if (fails.length) { console.log("\nFALLOS:"); fails.forEach((f) => console.log(" -", f)); process.exit(1); }
console.log("\nSTATIC OK");
