# 3D asset handoff — developer notes

## Overview

Product models are authored in a CLI-driven 3D pipeline: the scene is described
as JSON, geometry is sculpted with Python builders, and frames are rendered by
Blender Cycles. The pipeline runs upstream, so integration work starts from the
exported files described below.

## Deliverables

| File | Description | Typical use |
| --- | --- | --- |
| `name.glb` | The master model — geometry, PBR materials, baked animation | Web viewer, Android AR, any engine |
| `name.usdz` | The same model in Apple's format | iOS and Safari AR Quick Look |
| `name.mp4` / `.webm` | Rendered animation clip, square or 9:16 | Hero video, ads, social, email |
| `name.png` | Stills and multi-view sheets up to 4K, transparent background | Product pages, thumbnails, print |

## Background reading

1. **glTF 2.0 / GLB** — the Khronos Group standard, supported by Google, Adobe,
   Microsoft and Meta. The specification overview and the metallic-roughness
   material model are the relevant sections.
2. **`<model-viewer>`** — Google's open-source web component. It provides a
   drop-in 3D viewer, and its `ar` attribute routes to Scene Viewer on Android
   and AR Quick Look on iOS. This is the shortest path to a working viewer.
3. **USDZ and AR Quick Look** — Apple's AR format, built on USD from Pixar. iOS
   AR uses the `.usdz` file rather than the `.glb`, served from an
   `<a rel="ar">` link.
4. **three.js and React Three Fiber** — relevant if the design calls for custom
   interaction such as scroll scrubbing, configurators, or bespoke lighting.
   Apple, Stripe, Vercel and Linear use this stack for marketing 3D on the web.
5. **glTF-Transform** — the standard toolchain for compressing and inspecting
   GLB files: Draco and Meshopt geometry compression, KTX2 textures, and
   pruning. File-size work happens here rather than in the modelling tool.
6. **3D commerce precedent** — Shopify, IKEA, Amazon and Nike have well-developed
   patterns for presenting 3D and AR on product pages, and the Khronos 3D
   Commerce working group publishes the asset guidelines behind much of it.

## Integration

**Web product pages.** Embed the `.glb` with `<model-viewer>`, lazy-loaded below
the fold, with a `poster` PNG so the page has something to show while the model
loads. The `ar` attribute enables AR, with `ios-src` pointing at the `.usdz`.

**iOS AR.** Serve the `.usdz` over HTTPS with the
`model/vnd.usdz+zip` content type. AR Quick Look is unavailable in the iOS
simulator, so verification needs a physical device.

**Android AR.** Scene Viewer reads the `.glb` directly; no second file is
required.

**Video.** Clips are encoded to loop seamlessly — the last frame sits one step
before the first. `<video autoplay muted loop playsinline>` covers the common
case; `playsinline` prevents iOS Safari from opening the clip fullscreen.

**Hosting.** Models are static assets and suit a CDN with long-lived immutable
cache headers and a content hash in the filename.

## Pipeline characteristics

- **Units are metres, Y-up.** A bottle measures around 0.2. Models arrive at
  final scale and don't need adjusting on import.
- **Materials are untextured PBR** — base colour, roughness, metalness, opacity
  and emissive, with no UV maps or image textures at present. Metal reads as
  metal only under an environment map, so the viewer needs an HDRI or
  `environment-image` set.
- **Animation is baked into a single merged clip** with linear keys, named after
  the scene's clip. It plays at clip index 0, and contains no skeleton or blend
  shapes.
- **Compression isn't applied at export.** Files that are too heavy for their
  placement can be processed with `gltf-transform draco` or `meshopt`, which is
  usually more effective than reducing the model's detail.
- **USDZ is generated from the same geometry as the GLB**, so the two should
  match. Where they differ, the GLB reflects the source scene.

## Checklist

- [ ] Model loads in under ~2s on a mid-tier phone over 4G (target < 3 MB compressed)
- [ ] Poster image renders immediately, with no layout shift when the viewer loads
- [ ] AR verified on a physical iPhone and a physical Android handset
- [ ] Video loops without a visible seam and autoplays in iOS Safari
- [ ] Assets are CDN-hosted, content-hashed, and immutable-cached

Issues with the model itself — proportions, a seam, a material — are usually a
small change upstream and a re-export, so they're worth reporting rather than
correcting in code.
---

## Links

**Formats and specs**
- [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) — Khronos Group; the material model section is the part you need
- [glTF overview](https://www.khronos.org/gltf/) — why it exists, who backs it
- [OpenUSD](https://openusd.org/release/index.html) — Pixar's format, what USDZ is built on
- [Blender glTF exporter reference](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) and [USD exporter](https://docs.blender.org/manual/en/latest/files/import_export/usd.html) — exactly what our pipeline calls

**Web viewers and engines**
- [`<model-viewer>`](https://modelviewer.dev/) — Google's web component; start here
- [`<model-viewer>` docs](https://modelviewer.dev/docs/index.html) and [AR examples](https://modelviewer.dev/examples/augmentedreality/)
- [`<model-viewer>` editor](https://modelviewer.dev/editor/) — drag a GLB in to sanity-check it in ten seconds
- [three.js manual](https://threejs.org/manual/) — for custom interaction
- [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction) — three.js in React

**Platform AR**
- [AR Quick Look](https://developer.apple.com/augmented-reality/quick-look/) — Apple; iOS AR entry point
- [Previewing a model with AR Quick Look](https://developer.apple.com/documentation/arkit/previewing-a-model-with-ar-quick-look) — Apple developer docs
- [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer) — Google; Android AR, reads the GLB directly

**Optimisation and validation**
- [glTF-Transform](https://gltf-transform.dev/) and its [CLI](https://gltf-transform.dev/cli) — compression, pruning, inspection
- [Draco](https://google.github.io/draco/) — Google's geometry compression
- [meshoptimizer](https://github.com/zeux/meshoptimizer) — the Meshopt alternative, usually faster to decode
- [KTX / Basis Universal](https://www.khronos.org/ktx/) — for when we add textures
- [glTF Validator](https://github.khronos.org/glTF-Validator/) and [gltf.report](https://gltf.report/) — paste a file in before shipping it
- [Largest Contentful Paint](https://web.dev/articles/lcp) — the metric a heavy hero model will wreck

**Precedent and standards**
- [Khronos 3D Commerce](https://www.khronos.org/3dcommerce/) — the working group where Amazon, IKEA, Shopify, Target and Adobe agree on this
- [3D Commerce asset creation guidelines](https://github.com/KhronosGroup/3DC-Asset-Creation) — their published spec for production-ready commerce assets

**Misc**
- [MDN `<video>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video) — for the `playsinline` / autoplay rules
- [Poly Haven HDRIs](https://polyhaven.com/hdris) — free CC0 environment maps if the viewer needs one
