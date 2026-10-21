# ⚠️ Esta carpeta raíz NO es lo que se sirve

El sitio en producción se sirve desde `public/` (express.static en
server.js) más los módulos `.js` de esta raíz.

Los archivos `index.html`, `app.js`, `prueba.html`, `sw.js` y
`manifest.json` que viven EN ESTA RAÍZ son fósiles de la era de los zips:
**no se sirven, no se usan y no hay que editarlos** — cualquier cambio
acá no llega nunca a producción y confunde (pasó el 2026-09-28 con
archivos duplicados de iPhone).

Para cambiar el sitio: editá `public/` y los módulos de la raíz.
