# LEARNING-LOOP.md — Estructura del loop de aprendizaje (v322, pieza E)

Diseño de datos creado el 2026-10-22. **Solo estructura + ingesta fail-closed**:
ninguna pantalla promete datos que hoy no existen, la radiografía y la
generación NO cambian en esta tanda, y que Posty ACTÚE sobre lo aprendido es
una decisión de producto aparte (ya aclarado con Valentino). La capa se prende
con el veredicto de Meta (sin Instagram conectado no hay métricas reales).

## Tablas

### `piece_learning` — rendimiento por pieza × variables de nacimiento
Una fila por posteo publicado, refrescada por `syncLearning()` en
`launch-analytics.js` desde `post_metrics` (la tabla que llena la API de
Instagram cuando la cuenta está conectada):

- identidad: `post_id`, `user_id`, `week_key`
- nacimiento: `intent` (tipo/intención de la pieza), `angle`
  (`posts.source_angle`), `style_code` y `template` (de `post_signals`),
  `format` (`media_type`), `hour` (hora programada)
- rendimiento: `reach`, `likes`, `comments`, `shares`, `saves`

Si `post_metrics` está vacío, la ingesta devuelve `sin_datos` con el motivo y
la tabla queda vacía — fail-closed, sin estimaciones.

### `account_experiments` — memoria de experimentos por cuenta
`user_id`, `week_key`, `hypothesis`, `result`. La escribe el loop semanal
cuando exista (diagnostica → planifica → mide → ajusta): cada semana puede
dejar UNA hipótesis por cuenta y su resultado medido la semana siguiente.
Estructura creada; el escritor se diseña cuando se prenda la capa.

## Qué falta para prenderla (fuera de esta tanda)
1. Veredicto de Meta (métricas de IG por posteo en `post_metrics`).
2. El cruce semanal que propone la hipótesis por cuenta (decisión de producto).
3. Recién con datos reales: benchmark de rubro y que Posty actúe sobre lo
   aprendido (decisión de producto aparte, no automática).
