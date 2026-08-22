# Audio (sintetizado)

No hay archivos de audio en esta carpeta a propósito. Toda la música y los
efectos de sonido del juego se generan en tiempo real con la Web Audio API
desde `src/audio.ts` (loop chiptune de 16 pasos + `sfx('click'|'door'|'alarm'|
'smoke'|'blackout'|'shake')`), sin dependencias externas.

## Cómo cambiar a archivos reales

1. Poné los `.ogg` que quieras usar en esta carpeta (p.ej. `music.ogg`,
   `door.ogg`, `alarm.ogg`, `click.ogg`).
2. En `src/game/config.ts`/la escena de Phaser, cargalos con
   `this.load.audio('music', 'assets/audio/music.ogg')` y reproducilos con
   `scene.sound.add(...)`/`scene.sound.play(...)`.
3. Reemplazá las llamadas a `unlock()`/`sfx(...)` (importadas de
   `../../audio`) en `GameCanvas.tsx`, `ArcadeConsole.tsx` y los runners de
   `src/game/scenarios/*.ts` por las llamadas equivalentes de `scene.sound`.
4. `MuteButton` puede seguir igual: sólo cambiá `setMuted`/`isMuted` (en
   `src/audio.ts`) por `game.sound.mute = ...` si preferís el mute nativo de
   Phaser.

Sugerencia de fuente CC0 si en algún momento se quiere sumar audio real:
Kenney Audio packs (https://kenney.nl/assets?q=audio) o freesound.org
(filtro CC0).
