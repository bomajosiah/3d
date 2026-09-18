# Animated 3D icons — Flutter implementation notes

This document covers the small looping 3D icons and how they're integrated into
the Flutter app.

## Overview

The icons are modelled and lit in a Blender-based pipeline and rendered to
transparent frames ahead of time. The app composites those frames; it does not
run a 3D engine. The same assets and the same widget code work on iOS and
Android.

The video encoder in the pipeline writes RGB without an alpha channel, so MP4
and WebM aren't suitable for icons — they'd carry an opaque background. Icons
are delivered as PNG and WebP, both of which preserve transparency.

## Assets per icon

| File | Description |
| --- | --- |
| `icon-name.webp` | Animated WebP, transparent, loops seamlessly |
| `icon-name.atlas.png` | Sprite sheet with every frame packed in a grid, transparent |
| `icon-name.atlas.json` | Manifest: `{ frames, fps, cols, rows, width, height }` |
| `icon-name.png` | Single static frame, used as the resting and fallback state |
| `2.0x/`, `3.0x/` | Density variants of the above |

Both the animated WebP and the atlas are included so either approach is
available per use case.

## Producing the assets

Locally, the Studio export panel and `pnpm icon <scene> [output]` run the same
handler. Both render the full clip with Cycles at 1536x1536, 24 samples, then
downscale to 256/512/768 and pack the animated WebP with `img2webp`.

That render is CPU-only -- `render.py` never sets `cycles.device` -- so it is
slow and it occupies the machine for as long as it runs.

To move it off your machine, run the **Export icons** workflow from the Actions
tab and give it the scene names:

    dice compass coffee-cup

Each scene gets its own runner and they render concurrently, so a batch costs
roughly what the slowest single scene costs. Results arrive as one downloadable
artifact per scene, matching the local `dist/icons/<name>/` layout.

The job runs on the free `ubuntu-latest` runner, which is enough because this
workload does not scale with cores. Measured on an 8-core M1: a full 60-frame
export took 18m20s wall for 42m39s CPU (2.3x), and a single 1536px final frame
took 45s wall for 88s CPU (1.9x). Cycles keeps roughly two cores busy here, so
a 4 vCPU runner is in the same range per scene and a paid larger runner would
mostly idle. The gain from CI is running scenes concurrently, and not tying up
your own machine for the duration.

Packaging is not the bottleneck and never will be: encoding all 60 frames of the
3x variant costs ~1.4s in sharp plus ~8.4s in img2webp, against ~18 minutes of
Cycles. If an export is too slow, the levers are `samples` and `masterSize` in
`packages/blender/src/icon.ts`, not hardware.

Two environment variables raise the Blender subprocess budgets for slower
hardware; the defaults are unchanged without them:

| variable | default | covers |
| --- | --- | --- |
| `BLENDER_BUILD_TIMEOUT_MS` | 300000 | one `asset` builder invocation |
| `BLENDER_RENDER_TIMEOUT_MS` | 900000 | the whole Cycles frame batch |

## Two integration approaches

### Animated WebP

`Image.asset('assets/icons/spark.webp')` plays the animation directly. Flutter
decodes animated WebP natively with alpha, so this needs no state and no
controller. Playback starts when the widget mounts and loops continuously;
pausing, scrubbing, and gesture-syncing aren't available through this path.

This is the simpler option and covers most placements.

### Sprite atlas with CustomPainter

Decoding the atlas once and drawing a single cell per tick gives full control
over playback — play on tap, play once and rest, scrub with a drag, or drive
several icons from one clock.

```dart
// frame = (controller.value * manifest.frames).floor() % manifest.frames
final src = Rect.fromLTWH(
  (frame % cols) * w, (frame ~/ cols) * h, w, h);
canvas.drawImageRect(atlas, src, dst, Paint()..filterQuality = FilterQuality.medium);
```

This decodes one image and uses one texture, with no per-frame allocation.
`drawAtlas` covers the case of drawing many icons from the same sheet in a
single call.

## Background reading

1. **[Assets and images](https://docs.flutter.dev/ui/assets/assets-and-images)** — Flutter's resolution-aware asset system. The `2.0x/` and `3.0x/` folder convention selects the right density automatically, which removes most manual sizing work.
2. **`precacheImage` and `ImageCache`** — decoding ahead of first paint avoids a stutter on the first loop. The cache is bounded at roughly 100 MB, and animated frames are held decoded.
3. **`CustomPainter`, `Canvas.drawImageRect` and `drawAtlas`** — the atlas approach above.
4. **Impeller** — Google's renderer, now the default on iOS and on modern Android. Useful context when profiling jank.
5. **Reduce Motion** — `MediaQuery.disableAnimationsOf(context)` exposes the OS setting. Apple's HIG and Google's Material motion guidance both call for a still fallback; the static PNG serves that purpose.
6. **Rive and Lottie** (Airbnb) — runtime vector animation, a different approach from pre-rendered frames. Icons that need to morph between states or be recoloured at runtime suit those tools better, and it's worth raising early since it changes how the icon is authored.

## Behaviour and limits

**Memory.** Decoded frames cost `frames × pixels × 4` bytes. A 64pt icon at 3x
is 192px, roughly 147 KB per frame or 9 MB for a 60-frame clip. A 120pt icon at
3x is closer to 31 MB for the same clip. Clips are kept to 24–30 frames for this
reason, and mounting many at once adds up quickly.

**Looping.** Clips are sampled half-open: the last frame sits one step before the
first, so they loop cleanly as delivered. Ping-ponging or appending a copy of
frame 0 introduces a visible hitch.

**Scaling.** Icons are rendered at a fixed pixel size. Displaying them above the
delivered density softens the edges — a larger render is available on request
if a placement needs one.

**Compositing.** Transparent edges are premultiplied. A colour filter applied
over an icon can fringe the antialiased rim.

**Review sheets.** The labelled contact sheets shared during review are for
visual inspection. The production asset is `.atlas.png`.

**Recolouring.** Icons are lit 3D renders rather than flat vectors, so a
`ColorFilter` flattens the shading. Colour variants can be rendered from the
source if an icon needs to appear in more than one brand colour.

## Checklist

- [ ] Icons render crisply on a 3x device with no seam at the loop point
- [ ] First play is free of stutter (precached), with no dropped frames in profile mode
- [ ] Reduce Motion shows the static PNG on both iOS and Android
- [ ] Memory returns to baseline after a screen with icons is pushed and popped repeatedly
- [ ] Appearance matches between iOS and Android

Differences in appearance, geometry, or timing are usually a small change
upstream and a re-render, so they're worth reporting rather than compensating
for in app code.

## Links

**Flutter — assets and images**
- [Assets and images](https://docs.flutter.dev/ui/assets/assets-and-images) — resolution variants, `pubspec` declaration
- [`Image`](https://api.flutter.dev/flutter/widgets/Image-class.html) — animated WebP and GIF play automatically here
- [`precacheImage`](https://api.flutter.dev/flutter/widgets/precacheImage.html) — warming the cache before first paint
- [`ImageCache`](https://api.flutter.dev/flutter/painting/ImageCache-class.html) — the available budget
- [`instantiateImageCodec`](https://api.flutter.dev/flutter/dart-ui/instantiateImageCodec.html) — manual frame control

**Flutter — drawing and performance**
- [`CustomPainter`](https://api.flutter.dev/flutter/rendering/CustomPainter-class.html) — the atlas approach
- [`Canvas.drawAtlas`](https://api.flutter.dev/flutter/dart-ui/Canvas/drawAtlas.html) — many sprites in one call
- [`RepaintBoundary`](https://api.flutter.dev/flutter/widgets/RepaintBoundary-class.html) — isolating an animating icon from its parent's repaints
- [Impeller](https://docs.flutter.dev/perf/impeller) — Google's renderer, default on iOS and modern Android
- [Performance best practices](https://docs.flutter.dev/perf/best-practices)

**Accessibility and motion**
- [`MediaQueryData.disableAnimations`](https://api.flutter.dev/flutter/widgets/MediaQueryData/disableAnimations.html) — the OS Reduce Motion flag
- [Flutter accessibility](https://docs.flutter.dev/ui/accessibility-and-internationalization/accessibility)
- [Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Material 3 — Motion](https://m3.material.io/styles/motion/overview) — Google's equivalent

**Formats**
- [WebP](https://developers.google.com/speed/webp) — Google's format; alpha and animation in one file
- [`img2webp`](https://developers.google.com/speed/webp/docs/img2webp) — builds an animated WebP from a PNG sequence

**Adjacent, for context**
- [Rive](https://pub.dev/packages/rive) and [Lottie](https://pub.dev/packages/lottie) ([Airbnb](https://airbnb.io/lottie/)) — runtime vector animation
- [`flutter_scene`](https://pub.dev/packages/flutter_scene) and [`model_viewer_plus`](https://pub.dev/packages/model_viewer_plus) — real-time 3D in Flutter, for a draggable model rather than an icon
