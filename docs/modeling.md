# Product modeling workflow

The CLI scene is the source of truth for layout, materials, cameras, and animation.
Use built-in primitives for simple forms; use a procedural asset when silhouette,
wall thickness, branching topology, or continuous curvature needs more control.

## Runtime

Use Node 22+ and `pnpm install`. The portable installation for this workspace is
`.3d/tools/Blender.app/Contents/MacOS/Blender` (Blender 4.5.10 LTS).
On other machines install Blender 4.5+ or set `BLENDER_BIN` to its executable.
`3d doctor` checks both preview and Blender readiness.

Blender runs headlessly. It is needed for uncached procedural builds and final
renders. Existing primitive previews and already-compiled assets do not require it.
The studio is a Three.js preview; it uses the same evaluated geometry as final
renders, but lighting is intentionally approximate. Cycles is the final renderer.
No cloud service, paid API, or Blender UI is required.

## Commands

From the repository root, prefix commands below with `node packages/cli/bin/3d.mjs`:

```sh
3d build scenes/cutlery.scene.json
3d validate scenes/cutlery.scene.json
3d render scenes/cutlery.scene.json --pass silhouette --size 512
3d sheet scenes/cutlery.scene.json --views front,right,iso --pass clay --size 512
3d inspect scenes/cutlery.scene.json --quality final --size 512
3d render scenes/cutlery.scene.json --quality final --size 1024
3d sheet scenes/cutlery.scene.json --quality final --frames 6 --size 384
```

Use `--fit spoon` for a selected object's bounds. For precise close-ups set
`camera.framing.region: {center: [x,y,z], radius: r}` in world metres.
`meta.inspection` is a list of `{label, center, radius}` for the inspection command.
`meta.reference` is an image path relative to the project root. A CLI
`inspect --reference references/example.png` overrides it.

Each render/inspection writes an immutable PNG and settings snapshot in
`.3d/out/iterations`. The snapshot contains the parsed scene, parameters, compiled
mesh data, cache hashes, and render options. The asset cache also retains the exact
builder sources and an editable `source.blend`. Recover parameters from a snapshot
and builder sources from its referenced cache directory; do not blindly copy
runtime `meta.compiledAssets` into authored scene files.

## Local builder contract

```json
{
  "type": "asset",
  "name": "body",
  "builder": "../assets/builders/body.py",
  "parameters": {"width": 0.08},
  "dependencies": ["../assets/data/profile.json"],
  "material": "gold"
}
```

Builder paths and declared dependencies are relative to the scene file. Builders
are executable project code, like build scripts. Their entry point is
`build(parameters)`, returning a nonempty list of Blender mesh objects. Parameters
are finite numbers, strings, or booleans. Validate shape-specific limits inside
`build` and raise `ValueError` with a useful explanation.

The helper API uses **metres, Y-up, right-handed coordinates** and converts to
Blender's Z-up internally. When editing raw Blender vertices directly, they are
already Z-up. Generate local-space geometry; do not duplicate scene transforms or
animation in the builder. Give objects unique names. Set an object's
`material_key` custom property to a scene material name for per-part materials;
a material assigned to the scene asset node overrides all its parts.

Available in `packages/blender/python/modeling.py`:

- `mesh(name, vertices, faces, material=None)`: editable control mesh; recalculates winding.
- `loft(name, rings, cap=True, levels=2, material=None)`: connect corresponding section rings.
- `sweep(name, centers, radii, segments=16, levels=2)`: transport cross-sections along a curve.
- `subdivision(obj, levels=2)`, `solidify(obj, thickness)`, `bevel(obj, width, segments)`,
  `mirror(obj, axis, merge)`: modifiers execute in call order.

The worker hashes parameters, Blender version, builder-directory Python sources,
helper sources, and declared dependency bytes. It snapshots these inputs before
execution so edits during a build cannot poison the cache. Outputs are published
only after successful compilation. Keep unrelated builders in separate directories
if broad source-directory invalidation becomes expensive. Imports outside the
builder directory and non-Python inputs must appear in `dependencies`.

Outputs under `.3d/cache/<hash>/`:

- `asset.glb`: evaluated Y-up geometry for the studio and external consumers.
- `mesh.json`: equivalent evaluated positions, loop normals, indices, and topology report.
- `source.blend`: editable control meshes and modifier stacks.
- `project/`, `runtime/`: captured build inputs.

A failed build never substitutes a placeholder or overwrites the last valid studio
view. The studio marks the previous view **stale** and displays the error.

## Visual acceptance, in order

1. Compare silhouette proportions, head alignment, neck width, and spacing to the reference.
2. Inspect clay front/side/three-quarter views for real depth, joins, curvature, and thickness.
3. Check manifold reports where the object should be closed. Separate manufactured parts
   may be separate meshes; a continuous cast surface should not be overlapping primitives.
4. Tune material and area lights. Background, floor, and illumination are independent.
5. Inspect 1024px final output and animation before calling the model complete.

The built-in `product-white` final rig uses broad area lights and soft grounding
shadows. `environment.lights` can override it with `{position,target,size,power,color}`
entries (metres, watts); `exposure` is in stops. Use `floor.mode: "shadow"` for a
seamless backdrop, `"solid"` for a real floor, or `"none"`. `background: "transparent"`
exports alpha independently of the reflection environment.

## Working scenes

- `scenes/compass.scene.json`: closed manufactured parts, raised dial details, and a pivoted needle.
- `scenes/cutlery.scene.json`: continuous spoon shell and branched fork control mesh.

## Validation

```sh
pnpm check
node node_modules/typescript/bin/tsc -p apps/studio/tsconfig.json --noEmit
pnpm docs:check
pnpm test
BLENDER_TESTS=1 pnpm test
```

Blender integration tests are opt-in so primitive-only installations remain usable.
They verify topology, axes/bounds, caching, rendering, and animated frame changes.
Existing preview golden images must remain stable; missing images fail. Updating a
baseline is explicit, never automatic. New product renders are **review candidates**,
not human-approved artistic baselines. Keep preview and Cycles baselines separate;
a pixel comparison between different renderers does not measure model quality.

To verify the studio, run `pnpm check:studio`; it starts and stops its own studio.
The smoke test creates isolated temporary assets, checks reference/GLB loading and
stale-preview handling, writes screenshots, and removes its fixtures.
