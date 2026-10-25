// v472 — gamification en el website de Posty: el SISTEMA, nunca un nivel inventado.
// Uso: node test-gamificacion-website.js <dir-base-fresh>
const fs = require("fs");
const path = require("path");
const base = process.argv[2];
let ok = 0, bad = 0;
function t(name, cond) {
  if (cond) { ok++; } else { bad++; console.log("FAIL:", name); }
}
const app = fs.readFileSync(path.join(base, "public/app.js"), "utf8");
const en = fs.readFileSync(path.join(base, "public/en/index.html"), "utf8");
const idx = fs.readFileSync(path.join(base, "public/index.html"), "utf8");
const srv = fs.readFileSync(path.join(base, "server.js"), "utf8");

// ES: función 1 def + 1 llamada
t("ES def gjSistemaHTML x1", (app.match(/function gjSistemaHTML\(\)/g) || []).length === 1);
t("ES call gjSistemaHTML x1", (app.match(/\$\{gjSistemaHTML\(\)\}/g) || []).length === 1);
t("ES guarda sistema-no-tu-nivel", app.includes("Esto es el sistema, no tu nivel"));
t("ES sin nivel inventado", !/vos estás en (el )?nivel|tu nivel es|estás en Nivel/i.test(app.split("gjSistemaHTML")[1] || ""));
// ES: 6 hechos + 4 cambios + reglas + socio + 7 agregados
for (const s of ["Lee tus fuentes", "Tus respuestas", "Tu material real", "Tus decisiones",
  "El trabajo que salió bien", "La continuidad"])
  t("ES hecho: " + s, app.includes(s));
for (const s of ["Pregunta menos", "Acierta más de primera", "Hace más solo", "Desde Mano derecha, anticipa"])
  t("ES cambio: " + s, app.includes(s));
t("ES regla nunca baja", app.includes("nunca baja"));
t("ES regla sin comparación", app.includes("Sin comparación entre clientes"));
t("ES regla no bloquea", app.includes("No bloquea lo esencial"));
t("ES regla sensible", app.includes("Lo sensible no se gamifica"));
t("ES nunca por pagar", app.includes("Nunca se sube por pagar más"));
t("ES socio no techo", app.includes("Socio no es un techo"));
for (const s of ["La colección de lo aprendido", "Subí — y ya te traje esto",
  "Semanas creciendo juntos", "El mes de tu oficina", "La subida se comparte",
  "La familia festeja", "Tu jardín, antes y hoy"])
  t("ES agregado: " + s, app.includes(s));
// sin backtick ni ${ dentro del bloque ES (no rompe el template de landingView)
const esBlock = (app.split("function gjSistemaHTML() {")[1] || "").split("\n}\n")[0] || "";
t("ES bloque sin ${ interno", !esBlock.includes("${"));

// EN espejo
t("EN bloque presente", en.includes("data-gj-sistema"));
t("EN guarda", en.includes("This is the system, not your level"));
for (const s of ["It reads your sources", "Your answers", "Your real material", "Your decisions",
  "Work that went well", "Continuity", "Asks less", "Gets it right the first time",
  "Does more on its own", "From Right hand on, it anticipates",
  "it never goes down", "No comparison between clients",
  "It never blocks the essentials", "Sensitive stuff is never gamified",
  "You never level up by paying more", "Partner isn't a ceiling",
  "The collection of what is learned", "Leveled up — and I already brought you this",
  "Weeks growing together", "Your office's month", "The climb is shareable",
  "The family celebrates", "Your garden, before and today"])
  t("EN: " + s, en.includes(s));

// pins + build + estructura intacta
t("BUILD v472", srv.includes("const BUILD_ID = '20261025-v472';"));
t("index pin 303", idx.includes("/app.js?v=303"));
t("ES tallo intacto", app.includes("gj-levels") && app.includes("Tu socio de contenido"));
t("EN tallo intacto", en.includes("gj-levels") && en.includes("Your content partner"));
t("ES CTA intacto", app.includes("Empezá tu viaje"));
t("EN CTA intacto", en.includes("Start your journey"));

console.log(`gamificacion-website: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
