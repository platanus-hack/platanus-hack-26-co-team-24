# Attribution

Todo el arte de esta carpeta es **pixel art generado por script**
(`frontend/scripts/gen-assets.mjs`), dibujado rectángulo a rectángulo según
la guía de arte "Synth Dusk" de Claude Design
(`docs/design/guia-visual.dc.html`, secciones 03 TILES y 04 SPRITE SHEET).
Las coordenadas de la guía se muestran a 2x en cajas de 64 px: aquí van
divididas por 2.

No se usa arte de terceros, así que no se debe atribución externa.

## Archivos y geometría de frames

### `tiles/office.png` — 408x34, 12 tiles de 32x32 (margin 1, spacing 2)

`0 piso · 1 muro · 2 escritorio · 3 silla · 4 monitor_on · 5 monitor_off ·
6 rack GitHub · 7 cafetera · 8 puerta · 9 lámpara · 10 pantalla Meet · 11 planta`

Los tiles de mobiliario tienen fondo transparente: se pintan en la capa
`furniture` sobre la capa `floor`.

### `sprites/glow.png` — 64x64, halo radial blanco

Textura de un solo uso: `OfficeScene` la tinta y la escala para los glows
aditivos (monitores encendidos, rack, lámparas, pantalla Meet).

### `sprites/objects.png` — 384x32, 12 frames de 32x32 en fila

`server_on, server_off, pc_on, pc_off, coffee_a, coffee_b, lamp_a, lamp_b,
meet_on, meet_off, console, question`. Fondo transparente.

### Capas de personaje — 96x208 (3 columnas x 4 filas de 32x52)

Filas: frente, izquierda, derecha, espalda. Columnas: 1 = reposo, 0 y 2 =
pasos alternos.

- `sprites/char_body_light.png`, `sprites/char_body_dark.png`
- `sprites/char_hair_short.png`, `sprites/char_hair_long.png`
- `sprites/char_clothes_shirt.png`, `sprites/char_clothes_suit.png`

Pelo y ropa se dibujan en `#d8d8d8` para que el tinte en runtime
(`HAIR_PALETTE` / `PALETTE`) lea vivo. La piel va en `#E8B98A` (clara) o
`#8A5C3E` (oscura) y el pantalón siempre en `#331D53`.

Los glows (`box-shadow` en la guía) **no** están horneados en los PNG: los
añade `OfficeScene` como elipses aditivas detrás de monitores encendidos,
rack, lámparas y pantalla Meet.

### `audio/`

Ver `audio/README.md` — 4 archivos a soltar más adelante (`music.ogg`,
`door.ogg`, `alarm.ogg`, `click.ogg`).
