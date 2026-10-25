# Música de los reels (licencias)

Las 15 pistas de `assets/music/` son **CC0 (dominio público)**: se verificó la
licencia de cada archivo en Wikimedia Commons (API `imageinfo`, campo
`LicenseShortName = CC0`) antes de incluirlas. CC0 permite uso comercial sin
atribución; la citamos igual por transparencia.

Licencia CC0: https://creativecommons.org/publicdomain/zero/1.0/

| Archivo | Pista | Autor | Fuente (página del archivo) | Uso en Posty |
|---|---|---|---|---|
| `assets/music/upbeat.mp3` | "Curve" (Monplaisir – 10) | Monplaisir (Loyalty Freak Music) | https://commons.wikimedia.org/wiki/File:Monplaisir_-_10_-_Curve.ogg | mood `upbeat`: gastronomía, pizzerías, fitness y default |
| `assets/music/upbeat-hop.mp3` | "Hop" (Monplaisir – 08) | Monplaisir (Loyalty Freak Music) | https://commons.wikimedia.org/wiki/File:Monplaisir_-_08_-_Hop.ogg | mood `upbeat` (rotación) |
| `assets/music/upbeat-lalalatown.mp3` | "Lalalatown" (Monplaisir – 13) | Monplaisir (Loyalty Freak Music) | https://commons.wikimedia.org/wiki/File:Monplaisir_-_13_-_Lalalatown.ogg | mood `upbeat` (rotación) |
| `assets/music/upbeat-challenge.mp3` | "The Challenge" (Komiku – 62) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_62_-_The_Challenge.ogg | mood `upbeat` (rotación) |
| `assets/music/upbeat-bicycle.mp3` | "Bicycle" (Komiku – 12) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_12_-_Bicycle.ogg | mood `upbeat` (rotación) |
| `assets/music/groove.mp3` | "First Dance" (Komiku – 64) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_64_-_First_Dance.ogg | mood `groove`: barberías, moda, mascotas, heladerías |
| `assets/music/groove-cat-city.mp3` | "Cat City" (Komiku – 15) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_15_-_Cat_City.ogg | mood `groove` (rotación) |
| `assets/music/groove-space-mtv.mp3` | "Space MTV" (Komiku – 33) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_33_-_Space_MTV.ogg | mood `groove` (rotación) |
| `assets/music/groove-fruitcore.mp3` | "Fruitcore" (Monplaisir – 04) | Monplaisir (Loyalty Freak Music) | https://commons.wikimedia.org/wiki/File:Monplaisir_-_04_-_Fruitcore.ogg | mood `groove` (rotación) |
| `assets/music/groove-strawberry.mp3` | "The Strawberry" (Komiku – 60) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_60_-_The_Strawberry.ogg | mood `groove` (rotación) |
| `assets/music/chill.mp3` | "Chillin Poupi" (Komiku – 50) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_50_-_Chillin_Poupi.ogg | mood `chill`: cafeterías, panaderías, belleza, deco, florerías |
| `assets/music/chill-beach.mp3` | "Beach" (Komiku – 05) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_05_-_Beach.ogg | mood `chill` (rotación) |
| `assets/music/chill-the-beach.mp3` | "The Beach" (Komiku – 47) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_47_-_The_Beach.ogg | mood `chill` (rotación) |
| `assets/music/chill-chocolate-valley.mp3` | "Chocolate Valley" (Komiku – 51) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_51_-_Chocolate_Valley.ogg | mood `chill` (rotación) |
| `assets/music/chill-childhood.mp3` | "Childhood scene" (Komiku – 01) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_01_-_Childhood_scene.ogg | mood `chill` (rotación) |

Preparación: recorte a 30 s, normalización loudnorm a −14 LUFS (estándar de
redes), MP3 128 kbps (~470 KB c/u). El motor (`reel-engine.js`) las recorta
a la duración del reel con fade in/out. (Excepción: `upbeat-bicycle.mp3`
dura 25,6 s porque la pista original es más corta que 30 s; el motor la
repite en loop si el reel dura más.)

## Ampliación del catálogo y rotación (Gap 8, 2026-10-25)

Hasta el 2026-10-24 el catálogo tenía UNA pista por mood: todos los reels
de un mismo rubro sonaban igual. Desde el 2026-10-25 hay 5 por mood
(15 en total) y la elección es una ROTACIÓN DETERMINÍSTICA por seed
(`pickMusicFile(mood, seed)` en `reel-engine.js`): la seed es
`${usuario}:${semana}` (+ el índice del reel), así dos reels del mismo
negocio en semanas seguidas no repiten pista y la elección es auditable
(la misma seed da siempre la misma pista). Nota de descarte: "WIN"
(Komiku – 11) se bajó y se descartó — la pista original dura ~2 s (es un
jingle, no una cama musical); en su lugar entró "The Challenge".

## El límite honesto: nada de audios trending por API

La **API de publicación de Meta no permite adjuntar audios comerciales
de la biblioteca de Instagram** a un reel publicado por API: los audios
trending solo se pueden elegir a mano desde la app de Instagram. Por
eso Posty NO promete música trending — promete variedad propia con
licencia limpia (este catálogo CC0, que sí se puede publicar por API
sin riesgo de muteos ni reclamos). Si el cliente quiere un audio
trending puntual, el camino real es: Posty le deja el reel listo y él
lo sube a mano desde Instagram eligiendo el audio ahí.

## Mapa de beats (Motion v3, Fase 3 — 2026-10-20)

`assets/music/beats.json` guarda, por pista, el BPM detectado offline y la
grilla de beats que usa el motor v3 para hacer snap de los cortes de escena
(±150 ms). Se genera con `node music-beats.js --write` (análisis local con
ffmpeg, sin dependencias). Si una pista se reemplaza, REGENERAR el mapa.

Estado al 2026-10-25 (tras la ampliación del catálogo): las 15 pistas
están en el mapa. Con grilla detectable (snap activo): `chill.mp3`
79,5 BPM · `chill-beach.mp3` 120,2 · `chill-chocolate-valley.mp3` 110 ·
`groove.mp3` 76 · `groove-cat-city.mp3` 120,2 · `groove-strawberry.mp3`
120,2 · `upbeat-hop.mp3` 80,7 · `upbeat-bicycle.mp3` 74,9 ·
`upbeat-challenge.mp3` 184,6. SIN grilla detectable (flujo de energía
plano: la pista no tiene onsets percusivos claros) → con esas pistas el
motor no hace snap y corta con las duraciones del guion, declarado en el
resultado (`beatsSnapped: 0`): `upbeat.mp3`, `upbeat-lalalatown.mp3`,
`chill-childhood.mp3`, `chill-the-beach.mp3`, `groove-fruitcore.mp3`,
`groove-space-mtv.mp3`. No inventar el tempo: si se quiere snap en una
de esas, reemplazar la pista por una con percusión marcada y regenerar.
