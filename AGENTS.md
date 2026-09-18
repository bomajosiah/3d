# 3d — model and animate 3D objects from the command line

This repo is a 3D modelling and animation tool built to be driven by you, an AI
coding agent. You author a **scene file**, run a **CLI**, and **look at the PNG it
renders**. A human watches in the browser app and exports the result.

You are not flying blind: render early, render often, and actually look at the image.

## Quality comes from surfaces, then presentation

Read [docs/modeling.md](docs/modeling.md) before building a product object. Use
silhouette → clay multi-view → material/lighting → final/animation inspection.
Do not declare success from validation alone. Compare against the reference at
1024px and inspect necks, slots, rims, thickness, and continuous surfaces.

Use an `asset` with a local Python builder for connected sculpted surfaces. The
helpers provide lofts, sweeps, editable control meshes and real Blender modifiers.
Overlapping primitives do not create a continuous join. More triangles do not fix
bad proportions. Scene-node `modifiers` are rejected; use builder helpers instead.

`3d build` compiles assets. `3d render --quality final` uses Blender Cycles;
`3d inspect` creates reference/pass/detail sheets. The studio loads the same GLB
geometry as an approximate preview and retains its last valid view on build errors.
Blender 4.5+ is required for builds and final renders (`BLENDER_BIN` can override).

## The loop

```bash
node packages/cli/bin/3d.mjs new bottle --template object   # or edit an existing scene
node packages/cli/bin/3d.mjs validate scenes/bottle.scene.json
node packages/cli/bin/3d.mjs render   scenes/bottle.scene.json --size 512
# → then Read the printed path, look at it, adjust the numbers, repeat
```

Add `alias 3d="node packages/cli/bin/3d.mjs"` if you are running many commands.

Every render also writes `.3d/out/last.png`, so the next file to read is always
predictable. `3d sheet` packs several moments or views into **one** image — prefer
it, because you get one image per read.

```bash
3d sheet scenes/bottle.scene.json --frames 6            # six moments of the animation
3d sheet scenes/bottle.scene.json --views iso,front,right,top
```

### Let the human watch

```bash
pnpm studio      # http://localhost:5175
```

The browser app lists every scene in `scenes/`, plays the
animation, and **hot-reloads when you edit a file** — no page reload, so their
camera and playhead survive your edit. Invalid JSON shows the same diagnostics
the CLI prints. Start it when the human wants to follow along; you don't need it
to work.

## Commands

| command | what it is for |
| --- | --- |
| `3d new <name>` | start a scene from a template (`icon`, `object`, `empty`) |
| `3d outline <scene>` | compact tree + stats — **use this instead of reading the JSON** |
| `3d validate <scene>` | schema errors with `file:line:col` and a suggested fix |
| `3d render <scene>` | one frame to PNG (`--at`, `--size`, `--view`, `--bg`) |
| `3d sheet <scene>` | several frames or views in one labelled image |
| `3d video <scene>` | record the animation clip to an MP4 or WebM |
| `3d export <scene>` | write the scene as GLB or USDZ for an app or AR viewer |
| `3d fmt <scene>` | canonicalise: fill in ids, order keys, round numbers |
| `3d doctor` | check Node, Chromium, WebGL and sharp are working |

`3d help <command>` prints the full reference. Full docs: [docs/agent/cli.md](docs/agent/cli.md)
and [docs/agent/schema.md](docs/agent/schema.md).

Every command takes `--json` for machine-readable output and never prompts.
Exit codes: `0` ok, `1` validation, `2` render, `3` export, `64` usage.

## The scene file

One JSON file per project in `scenes/`. Every field has a default, so this is valid:

```json
{ "version": 1, "name": "cube", "nodes": [{ "type": "box", "name": "cube" }] }
```

A realistic one:

```json
{
  "version": 1,
  "name": "side-table",
  "environment": { "preset": "product-white", "background": "transparent" },
  "camera": { "fov": 26, "framing": { "fit": "all", "view": "iso", "padding": 0.14 } },
  "materials": {
    "oak":   { "color": "#c8a170", "roughness": 0.62 },
    "steel": { "color": "#8b8f96", "roughness": 0.3, "metalness": 0.8 }
  },
  "nodes": [
    { "type": "group", "name": "table", "children": [
      { "type": "box", "name": "top", "size": [0.52, 0.03, 0.52], "radius": 0.012,
        "material": "oak", "transform": { "position": [0, 0.56, 0] } },
      { "type": "cylinder", "name": "leg-front-left", "radius": 0.012, "height": 0.545,
        "material": "steel", "transform": { "position": [-0.2, 0.2725, 0.2] } }
    ] }
  ],
  "animation": { "clips": [{ "name": "spin", "duration": 2, "fps": 30, "loop": "forever",
    "tracks": [{ "target": "table.transform.rotation.y", "keys": [[0, 0], [2, 360]] }] }] }
}
```

Working production scenes live in [`scenes/`](scenes/) — inspect those before inventing a shape.

## Conventions that will bite you if you guess

- **Metres, Y-up, right-handed.** A coffee cup is ~0.1, a table ~0.5, not 50.
- **Rotations are degrees** in the file. `360` is one turn.
- **Time is seconds.** Keys are `[time, value]` or `[time, value, "easing"]`.
- **Colours are sRGB hex** strings.
- **Never write `id` yourself.** Run `3d fmt` and it assigns stable ids. Ids are
  never regenerated, because animation tracks and editor selection reference them.
- **Don't set `camera.position`.** Use `camera.framing` and let it fit the scene.
  An explicit position disables automatic framing and is the usual cause of an
  empty render.
- Objects sit where you put them; nothing falls to the floor. Build on `y = 0`.

## Node types

`box` (with `radius` for rounded corners), `sphere`, `cylinder`, `lathe`,
`extrude`, `asset`, `group`, and `reference` (a blueprint image plane you model against,
never exported). Everything except `reference` accepts `children`.

**`lathe` revolves an SVG profile around Y** — `x` is radius, `y` is height.
This is how you get smooth continuous curves; stacked cones leave shading seams.
Trace up the outside and back down the inside to build a hollow form, which is
what makes a spoon bowl genuinely concave rather than a solid blob:

```json
{ "type": "lathe", "name": "bowl", "segments": 96,
  "profile": { "d": "M0,-0.03 C0.015,-0.03 0.026,-0.02 0.027,0 L0.023,0 C0.023,-0.018 0.013,-0.027 0,-0.028 Z" } }
```

**`extrude` pushes an SVG outline along Z with a bevel.** Extra subpaths in the
same `d` become holes, so slots and cut-outs need no boolean:

```json
{ "type": "extrude", "path": { "d": "M0,0 H1 V1 H0 Z M0.3,0.3 H0.7 V0.7 H0.3 Z" },
  "depth": 0.1, "bevel": 0.01 }
```

Keep `bevel` **below half your narrowest gap** — a wider bevel rounds the two
sides back together and the gap renders as a scratch.

Field-by-field reference: [docs/agent/schema.md](docs/agent/schema.md).

## Lighting and presentation

Start with `environment.preset`, then inspect the actual reflections and shadows. Each installs a complete light rig **and a
matching environment map**: `studio-soft`, `studio-contrast`, `product-white`,
`warm-key`, `rim-dark`, `flat-icon`. Lighting reveals surface shape; it cannot repair disconnected or flat geometry.

The environment map is what makes metal read as metal. `metalness: 1` with a
gold `color` gives real gold; without an environment it would just go dark.

## Selectors

Used by animation `target` and `camera.framing.fit`:

| form | matches |
| --- | --- |
| `chair/seat` | name path, each segment unique among its siblings |
| `#a7Kd91xQ` | a stable node id |
| `@tag:metal` | every node carrying that tag |
| `all` | everything |

An animation `target` is a selector plus a property path:
`"lid.transform.rotation.x"`, `"body.transform.position"`, `"body.visible"`.

## When a render looks wrong

- **`E_EMPTY_FRAME`** — read the message, it tells you the scene bounds and the
  exact fix. Usually an explicit `camera.position`, or nothing in the scene.
- **Object too small or huge in frame** — check your units, then
  `camera.framing.padding`.
- **Object looks flat** — inspect a clay side view first. Fix the surface, then tune lighting.
- **Can't tell what changed** — render a `--views iso,front,right,top` sheet.

## Three rules

1. Never hand-write `id`. Run `3d fmt`.
2. Look at the render before saying it works. `3d sheet` for anything animated.
3. Never edit files marked `GENERATED` — change the source and run `pnpm run docs`.

## Repo layout

```
packages/schema   zod scene schema; the source of truth for the format
packages/core     document → three.js; geometry, materials, lighting, animation
packages/blender  local Python builders, geometry cache, and Cycles final renderer
packages/render   headless renderer (Playwright + Chromium, offscreen readback)
packages/cli      the `3d` binary
scenes/           production scene documents shown in Studio
docs/agent/       GENERATED schema and CLI reference
```

`pnpm test` runs unit tests plus golden-image regressions. After an intentional
visual change, re-bless them with `UPDATE_GOLDEN=1 npx vitest run packages/render`.
