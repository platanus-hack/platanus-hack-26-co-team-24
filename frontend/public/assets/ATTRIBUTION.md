# Attribution

All art in this folder is **programmatically generated placeholder pixel art**
(solid-color blocks with 1px darker borders), produced by
`frontend/scripts/gen-assets.mjs`. It exists so the game is playable and
demoable without shipping third-party binaries in an agent-authored commit.

Real art is intended to be a **drop-in swap**: replace the files below with
matching filenames and frame sizes, no code changes required (frame geometry
is fixed in `game/config.ts` / scene code).

## Expected files & frame sizes

### `tiles/office.png` — 128x16, 8 tiles of 16x16 in a row
Index 0 floor, 1 wall, 2 desk, 3 chair, 4 coffee machine, 5 meeting table, 6 server, 7 console.

### `sprites/objects.png` — 192x16, 12 frames of 16x16 in a row
`server_on, server_off, pc_on, pc_off, coffee_a, coffee_b, lamp_a, lamp_b, meet_on, meet_off, console, question`.

### Character layers — each a 4-row x 3-col sheet of 16x24 frames (48x96)
Rows: down, left, right, up. Cols: 3 walk frames.

- `sprites/char_body_light.png`, `sprites/char_body_dark.png`
- `sprites/char_hair_short.png`, `sprites/char_hair_long.png`
- `sprites/char_clothes_shirt.png`, `sprites/char_clothes_suit.png`

Clothing layers are kept light-gray/grayscale-ish so the runtime `paleta` tint
(applied via Phaser sprite tint) reads correctly on top of them.

### `audio/`
See `audio/README.md` — 4 files to be dropped in later (`music.ogg`, `door.ogg`,
`alarm.ogg`, `click.ogg`).

## Intended real-art sources (to swap in later)

- **Kenney** (tiles, objects, UI, audio) — CC0. https://kenney.nl — no attribution
  legally required, but credit is nice: "Assets by Kenney (kenney.nl), CC0."
- **LPC (Liberated Pixel Cup)** base/hair/clothes character sprites — CC-BY-SA 3.0
  and/or GPL 3.0 depending on the specific contributor's assets on OpenGameArt.
  When swapped in, list here the exact asset pack(s) used and their authors per
  the license's attribution requirements (e.g. "LPC character base by
  <author>, opengameart.org, CC-BY-SA 3.0").

Until swapped, no external attribution is owed — everything here was generated
by our own script.
