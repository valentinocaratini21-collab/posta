# LEEME — 🧠 Niveles de conocimiento de Posty

Los niveles miden **lo que Posty SABE del negocio con datos reales**.
Nunca miden volumen de chat, nunca inventan. Progresión secuencial: no se
sube de nivel sin completar los requisitos de los niveles anteriores.

## Niveles y requisitos (verificables en DB)

| Nivel | Nombre | Requisitos |
|---|---|---|
| 1 | Te conozco | `profiles.business_name` + `profiles.category` (rubro) no vacíos. `category='otro'` es el default de la DB y NO cuenta. Usuario vacío = N1 con 0%. |
| 2 | Veo tu marca | `settings.brand_logo` + `settings.brand_colors` seteados + ≥3 `assets` con `kind='photo'`. |
| 3 | Sé tu gusto | ≥5 `post_signals` (`approved`/`rejected`) **O** ≥1 `style_rules` con `active=1`. |
| 4 | Sé tu ritmo | IG conectado (`getCreds` no null) + ≥3 `posts` con `status='published'`. |
| 5 | Te anticipo | N4 + ≥2 fuentes activas de la tarjeta "Lo que Posty sabe": web, historias, Facebook, comentarios, reseñas (mismos checks que el frontend: `website_analyzed_at`, `stories_analyzed_at`, `fb_analyzed_at`, `comments_analyzed_at`, `places_analyzed_at` en `business_dna`). |

## Desbloqueos reales por nivel

- **N2** = propone posteos con tu marca (colores + fotos del brand kit).
- **N3** = escribe en tu tono (taste: las reglas de `style_rules` que aprende de tus ediciones).
- **N4** = sugiere tus mejores horarios (según tu Instagram).
- **N5** = ideas proactivas anticipadas.

## Contrato del endpoint

- Módulo `posty-level.js`: `postyLevel(db, userId)` →
  `{level:1-5, level_name, progress_pct:0-100, next_missing:[{key,label,action}], checks:{...}}`.
  - `next_missing` = requisitos NO cumplidos del siguiente nivel, `label` en voseo ("Subí tu logo"), `action` deep-link (`#/app/ajustes`, `#/app/semana`).
  - `progress_pct` = % de requisitos del siguiente nivel ya cumplidos (N3 vale el mejor de sus dos caminos).
  - `checks` = evidencia cruda (flags, conteos, fuentes).
- `GET /api/posty/level` (requireAuth) →
  `{ok:true, level, level_name, progress_pct, next_missing, leveled_up:false|true, level_message}`.

## Level-up: una sola vez

- `users.posty_level` (default 0) guarda el último nivel festejado.
- Primera vez (NULL/0): se guarda en **silencio**, `leveled_up:false`.
- Si el nivel computado > guardado: se inserta UN mensaje en `chat_messages`
  (`role='assistant'`) en VOZ POSTY (voseo, cálido, concreto: qué sabe ahora +
  qué desbloquea), se actualiza `users.posty_level`, y la respuesta trae
  `leveled_up:true` + `level_message`. Nunca se repite.
- Mensajes actuales:
  - N2: "🧠 ¡Nivel 2! Ya veo tu marca: a partir de ahora te propongo posteos con tus colores y tus fotos 🎉"
  - N3: "🧠 ¡Nivel 3! Ya sé tu gusto: escribo los captions en tu tono, como a vos te salen ✨"
  - N4: "🧠 ¡Nivel 4! Ya sé tu ritmo: te sugiero los mejores horarios según tu Instagram ⏰"
  - N5: "🧠 ¡Nivel 5! Te anticipo: de ahora en más te traigo ideas proactivas antes de que me las pidas 🚀"

## Resumen semanal (scheduler.js)

- Cron: lunes 09:00 `America/Argentina/Buenos_Aires` → `postyWeeklyDigest(db)`.
- Para cada usuario con `posty_level` ≥ 1: cuenta conocimiento **nuevo** desde
  `users.posty_digest_at` (fotos del brand kit, señales 👍/👎, reglas de estilo
  recién activadas — `style_rules.created_at` —, fuentes del ADN analizadas).
- Si hay ≥1 item: mensaje "🧠 Mirá lo que aprendí esta semana:" + 2-3 items
  **concretos** (ej: "que preferís captions cortos y directos",
  "tus 3 fotos nuevas del negocio 📷"). Si no hay nada nuevo: **silencio total**.
- `posty_digest_at` se actualiza siempre (marca de agua).

## Pendiente honesto (NO implementado a propósito)

- Los desbloqueos de cada nivel describen lo que el nivel **significa**, pero
  no se cambió el comportamiento del generador ni del chat: si en el futuro se
  quiere que N2/N3/N4/N5 alteren los prompts de generación de forma distinta a
  como ya lo hacen (el taste y el mejor horario ya existen y se usan), eso
  requiere un cambio deliberado en `generator.js`/`server.js` — riesgoso y
  fuera del alcance de este módulo.
- `style_rules.created_at` solo existe para filas creadas después de este
  deploy (las anteriores quedan en NULL y nunca cuentan como "nuevas").
- El resumen semanal no cuenta cambios en `business_name`/`rubro` (no hay
  `updated_at` en `users`): si se quiere, hay que agregar esa columna.
