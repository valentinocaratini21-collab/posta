# La prueba con el sistema de estilos real (v182)

La semana de `/prueba` ya no se renderiza con plantillas fijas: cada posteo
elige un **estilo real del catálogo del producto** (la misma data que sirve
`GET /api/image-styles` y que usa el selector de estilos de la app), y
`demo_render.py` aplica el **tratamiento visual** de ese estilo con la
gramática del producto (la de `composite-headline.py`): foto protagonista
full-bleed, titular integrado según la luminancia de la zona, barra de
acento y CTA con la paleta del cliente, Montserrat.

Sin IA paga en el camino del demo (regla de costo + velocidad): el estilo
se materializa como tratamiento determinístico local.

## (v235) La prueba identifica el rubro como especialista — y pregunta si duda

El rubro/subrubro de la prueba ya no sale de un regex único sobre
bio+nombre: lo vota `rubro-id.js` (`classifyBusiness`) con las señales
que el sistema ya recolecta — @type JSON-LD de la web (`categoryHint`,
que `web-extract` por fin devuelve), vocabulario de productos/servicios
del catálogo web, bio + nombre + **handle**, captions + hashtags del
feed, categoría declarada de IG, texto del formulario y, SOLO como
desempate con el voto cerca, visión batch gpt-4o-mini sobre 3-4 fotos
(≤ USD 0,01, atrás del tope diario del demo; en tests, stub).

- **La vara de "100% seguro"** (documentada en `rubro-id.js`): puntaje
  ≥6, margen ≥4 sobre la 2.ª candidata y ≥2 familias de señales
  independientes (un @type JSON-LD que vota por el ganador cuenta por
  dos: es la auto-declaración del negocio). Debajo de eso hay DUDA y no
  se adivina: padre seguro + subrubro vacío.
- **La pregunta va ANTES de generar**: `prefill`/`web-prefill` devuelven
  `rubro_check {needed, options, detected}`; si hay duda, `/prueba`
  muestra la tarjeta de un toque (`#rubroCard`) y recién con la
  respuesta (`rubro_src=pregunta|form|skip` + `subcat`) se genera. Sin
  duda, cero fricción: la tarjeta ni aparece.
- **Subrubros** solo donde cambian posteos Y prompts: belleza
  {peluqueria, makeup, unas, estetica}, gastronomía {sushi, parrilla,
  pizzeria}, cafetería {cafe, panaderia}, mascotas {veterinaria,
  petshop}, autos {taller, repuestos}, inmobiliaria {inmobiliaria,
  constructora}, fitness {gimnasio, entrenador}, flores {floreria,
  vivero}. `buildDemoSpec` los toma del digest (el `demoSubcat`
  histórico queda de respaldo) y `photoGateCtx` usa su mundo: belleza
  SIN subrubro confirmado, en contexto de digest, usa el mundo
  `belleza-neutro` (local/personas/retrato/rostro/café) — el default
  pelo quedó solo para el harness legacy sin digest.
- El resultado vive versionado en `digest.rubro_id` (fuente:
  deteccion/pregunta/form/skip), siembra `profiles.category` +
  `profiles.subrubro` al registrarse y alimenta
  `question_candidates` tipo `rubro`. El barrido semanal puede
  reclasificar pero NUNCA en silencio (log + pregunta pendiente; lo
  confirmado por el dueño no se toca).
- `rubroMatch` resuelve alias en ambos lados (ropa⇒moda,
  restaurante⇒gastronomía, florería⇒flores, cosmética/peluquería⇒
  belleza…): el pool de moda nunca más vacío, y `pickStyle` acepta el
  subrubro confirmado para abrir pools taggeados por subrubro.

## (v234) El dataset de selección también elige en la prueba

`pickDemoStyles` (y la reparación de variedad) consumen el dataset del
estudio de selección (`prompt-selection-map.json`, vía
`image-styles.datasetFilterList/datasetScoreDelta`):

- **Gate duro en cascada** sobre el pool del rubro: fuera los presets
  que exigen lo que el negocio no tiene (local/producto/envasado/
  protagonista según el digest de la prueba), los que rompen la línea
  de feed heredada (registro medido del feed + paleta del digest, solo
  si el feed está consolidado) y los de prioridad baja; relajación en
  cascada posicionamiento → feed, exigencias jamás.
- **Score**: la intención de venta del tema (`salesIntent` de
  `trialTopicSales`; el relleno va capado a autoridad), la compatibilidad
  con la línea de feed y el posicionamiento suman/resta con la misma
  escala de `pickStyle` (intención −150, feed −150, posición −100,
  kind −50, prioridad media +100, dado vuelta porque acá mayor gana).
- `evidenceOk` en la prueba: la pieza de antes/después es un formato
  editorial declarado (su etiqueta lo dice), no el resultado de un
  cliente real — el filtro de evidencia rige en las semanas de clientes.

## Selección de estilos (`demo.js → pickDemoStyles`)

- Pool = misma lógica que `/api/image-styles`: `brandSafe`, sin
  `forbiddenStyles(rubro, negocio)`, `rubroMatch` con fallback a `otro`.
- Un estilo distinto por posteo (sin repetir en la semana).
- Prioridad: (1) recomendados por intención del posteo (`INTENT_STYLES`,
  mapeo `KIND_INTENT`: promo→promo, tip→tips, social→testimonio,
  novedad→lanzamiento, reserva→producto, sorteo→promo); (2) diversidad de
  composición (+40 si el esqueleto es nuevo en la semana, con pase de
  reparación que garantiza ≥3 esqueletos); (3) afinidad de subrubro.
- Exclusiones por público (`STYLE_AUDIENCE_EXCLUDE`, se testea contra
  code+name del estilo): makeup no recibe estilos de uñas/barbería/
  peluquería; belleza no recibe de barbería; barbería no recibe de
  uñas/makeup.
- Un posteo con tag **ANTES/DESPUÉS** prioriza estilos before/after
  (esqueleto `duo`): la pieza muestra lo que su etiqueta promete.
- **Herencia visual del perfil (v192):** si el visitante trae su @, la
  semana hereda SU línea: la paleta sale de hasta 3 fotos de su feed
  (`extractPaletteFromBuffers`, misma extracción que los logos — reemplaza
  a la del rubro y a la de la foto de perfil; los colores que el visitante
  fijó a mano siempre ganan) y su bio alimenta los temas vía `bioText`.
  Subrubro `contenido` (servicios de contenido / community manager,
  `CONTENIDO_SERVICE_RE`): temas de contenido/crecimiento
  (`DEMO_TOPICS.contenido`: carruseles, horarios, comunidad, ventas) y
  bonus de puntaje a los estilos "de marca" (esqueletos `centro`/`claro`
  y vocabulario brand/identidad/editorial). Un servicio de contenido
  NUNCA categoriza `tecnologia`: la palabra "app" sola ya no categoriza
  (la tiene cualquier bio) y `categoryFromText` lo resuelve a
  `profesionales` antes de la tabla de keywords.
- Un estilo que **nombra un plato** (`dishOf`: hamburguesa, pizza, sushi,
  cazuela, mariscos, provoleta, milanesa, café, …) solo etiqueta posteos
  de ese plato — el nombre del estilo se imprime en la pieza.
- **Variedad estructural (v197, `enforceSkeletonVariety`):** la
  diversidad dejó de ser un puntaje: ninguna semana repite `style_code`
  NI esqueleto de render NI par (esqueleto × tipo de fondo). Si el
  estilo de una pieza colisiona, se cambia el estilo por otro del pool
  con esqueleto libre (respetando público/platos/antes-después) o, en
  última instancia, se reasigna el esqueleto a uno genérico libre
  (nunca `duo` ni `poster`). El **póster de marca** (servicios/
  contenido, v196) es UNA sola pieza posible por semana — la primera
  de la semana principal; los extras nunca son póster — y la **foto de
  perfil** aparece como máximo en 2 piezas con tratamientos distintos:
  el medallón del póster y una marca suave grande (`pic_mark:
  'watermark'`, fantasma en la esquina de una foto, bajo los textos).
- **Registro lumínico heredado (v197):** la luminancia media de las
  fotos del feed (`feedLuminanceFromBuffers`, mismas fotos que la
  paleta) clasifica el registro: ≥0,55 → `light` y las piezas gráficas
  (el póster) salen CLARAS — fondo crema/tinte claro de su paleta
  (`posterBgLightFor`) con textos en el color oscuro de su paleta
  (`poster_dark`); el feed de @posty.communitymanager mide ~0,62. Feed oscuro →
  registro oscuro de siempre; sin perfil → comportamiento actual.
- La pieza muestra el estilo con etiqueta discreta abajo a la izquierda:
  `ESTILO · {nombre}`. El `style_code` viaja en el spec y, al importar la
  semana a la cuenta, queda en `posts.style_code` y en `post_signals`
  (señal `approved`, con `tipo` = kind del posteo): el aprendizaje por
  estilo lo ve desde el día uno.

## Mapeo estilo → tratamiento (`treatmentForStyle`, determinístico)

Derivado de los campos existentes del estilo (`code` + `prompt`):

| Aspecto | Regla |
|---|---|
| Esqueleto `duo` | code/prompt con *before* + *after/después* → foto partida antes/después (misma foto, lado "antes" desaturado) con franja inferior |
| Esqueleto `centro` | estilo *quote* → titular centrado sobre velo suave de la foto |
| Esqueleto `velo` | vocabulario oscuro (dark/night/neon/cinematic/noir/moody/midnight) → foto oscurecida pareja, titular blanco |
| Esqueleto `claro` | vocabulario luminoso (bright/airy/clean/minimal/studio/packshot/flat lay) → velo blanco, texto navy |
| Esqueleto `abajo`/`arriba` | resto: degradé de marca abajo o arriba, por hash estable del code |
| Grade | warm (warm/golden/cozy/sunset/gold + ember/firelight/amber/candlelit/sunlit/terracotta) · vivid (vibrant/pop/saturated/vivid/colorful + neon/electric/bold) · soft (soft/pastel/muted/dreamy/gentle + airy/delicate/milky) · cool (cool/fresh/blue + frost/icy/mint) · neutral — vocabulario ampliado en v233: el texto del preset deriva el grade con más fidelidad |
| Crop | `tight` (zoom 1.28) si macro/close-up/detail/zoom + fills the frame/frame-filling/tight crop/extreme close |

**Límite (v233, documentado):** el *viewpoint* del preset (flat-lay /
cenital / top-down) NO se deriva a ningún parámetro del tratamiento
porque `demo_render.py` no tiene consumidor para viewpoint: los
esqueletos son duo/centro/velo/claro/abajo/arriba/poster y ninguno es
cenital (el flat-lay hoy cae en `claro` por vocabulario luminoso). El
`subject_scale` tampoco sale del tratamiento: lo fija `buildDemoSpec`
desde la familia de dirección de arte del estilo. No se inventan
parámetros sin consumidor real en el render.

El render v2 (`demo_render.py → render_v2`) suavizó el grade base: el
motor viejo lavaba la foto (velo blanco 0,42 + brillo 1,22); el v2 usa
0,14 / 1,08 para que la foto siga siendo la protagonista. Los renders sin
`treatment` (rediseños viejos) siguen por el motor legacy intacto.

## Fotos: match foto↔tema (`PHOTO_TAGS` + `pickPhotoTagged`)

Las fotos stock del demo están tageadas A OJO sobre el archivo real
(`demo.js → PHOTO_TAGS`). La familia `beauty*` mezclaba rubros (esa fue la
falla real: foto de uñas para un titular de tintura, barbería masculina
para un negocio femenino):

| Archivo | Muestra | Temas |
|---|---|---|
| `beauty` | barbero cortando el pelo a un hombre | barberia, pelo |
| `beauty-1` | interior de barbería (sillas) | barberia, local |
| `beauty-2` | peluquería (sillones + espejos) | pelo, local |
| `beauty-3` | brochas y polvos de maquillaje | makeup |
| `beauty-4` | crema cosmética en frasco rosa | skincare, cosmetica |
| `beauty-5` | retrato femenino con makeup | makeup, rostro |
| `beauty-6` | primer plano de uñas rojas | unas |
| `fashion` / `fashion-1` | modelo streetwear | moda, retrato |
| `fashion-2` | percheros de tienda | moda, local |
| `food*` (pool café) | café/comida curados | cafe, comida |
| `lifestyle` / `-1` / `-2` | café con gente / mesa / playa | cafe, personas, retrato |

Reglas (`TEMA_CONFLICTS` + `AUDIENCE_FORBIDDEN_TEMAS`), aplicadas SOLO en
las categorías con biblioteca mezclada (belleza, makeup, barbería); el
resto conserva la curaduría por categoría existente:

- Un tema nunca usa una foto de su tema en conflicto: pelo ✗ {uñas,
  makeup, barbería}, makeup ✗ {uñas, pelo, barbería}, uñas ✗ {pelo,
  makeup, barbería}, skincare ✗ {barbería, uñas}, barbería ✗ {uñas,
  makeup}.
- Match exacto = la foto muestra el tema **y** ningún tema prohibido (el
  barbero es "pelo", pero para una peluquería femenina es barbería).
- Orden de elección: match exacto del tema → foto conocida sin prohibidos
  → foto curada del tema si no está prohibida (fallback definido en
  `demo-captions.js`, p. ej. `photoTema`) → foto desconocida → cualquiera
  sin prohibidos. Si no hay match, el posteo usa una genérica DEL RUBRO,
  nunca de otro tema puntual.

## Taxonomía: makeup ≠ peluquería

- `demoSubcat`: si el negocio/detalle dice maquillaje/make-up/makeup
  (y no es una barbería declarada), la semana usa el set de ángulos de
  **makeup** de `demo-captions.js` (makeup social, agenda de fechas,
  tip de técnica, novias con prueba incluida, antes/después de makeup,
  sorteo de makeup) — cero contenido de peluquería.
- La palabra específica manda sobre la familia genérica también en
  `categoryFromText` (una bio con "maquillaje" es belleza aunque mencione
  "peluquería"; solo "barbero/barba" le gana) y en uñas/estética: quedan
  en belleza con los ángulos genéricos (no hay set propio todavía).

## Invalidación de demos viejas

`DEMO_ENGINE_V = 2` (demo.js) viaja en el payload (`engine`) y en el spec.
No matchea / no se importa / no se restaura nada de un motor anterior:

- server: `trialCacheMatches` exige `engine === DEMO_ENGINE_V`;
  `importTrialWeek` no importa payloads con engine menor.
- cliente: `public/prueba.html` (`TRIAL_ENGINE_V`) no restaura semanas
  guardadas en IndexedDB de motores viejos.

## Video del demo

`demo_video.py --tour`: recorre las 5 piezas nuevas (zoompan alternado,
1,4 s por pieza, 7 s total, 1080×1350). OJO: cada imagen entra como UN
frame — con `-loop`, zoompan multiplica frames (entrada × d) y el video
explota en duración y peso. El modo clásico (rediseños de 1 diseño) no
cambió.

## Tests

- `test-demo-styles.js`: propiedades sobre `buildDemoSpec` (makeup ×60,
  belleza ×60, barbería ×60, cafetería ×30, gastronomía ×60 + taxonomía +
  las 25 categorías): estilos distintos y del catálogo, ≥3 esqueletos,
  cero fotos con temas prohibidos, cero titulares de peluquería en makeup,
  etiqueta de estilo acorde al plato.
- `test-demo-import.js`: server real + DB temporal — import con
  style_code en posts y post_signals, motor viejo importa 0,
  extend-trial 403/200 con fecha efectiva correcta.
- `test-demo-variety.js` (v197): 25 rubros ×60 + makeup/contenido ×60 —
  cero style_code/esqueleto/par repetido por semana, contenido con ≥4
  esqueletos, póster ≤1 y nunca en extras, foto de perfil ≤2 con
  tratamientos distintos, luminancia del feed y fondos de póster por
  registro.
