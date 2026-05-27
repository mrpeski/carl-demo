# Interactive Sacred Art Exhibit — Prototype

A single-codebase, interactive exhibit for a high-resolution classical painting.
Visitors touch/click regions of the painting to open a modal that plays a short
explainer video about that detail. Built with **plain HTML5 + CSS + JavaScript**
— no framework, no build step, fully static and offline-capable.

This prototype uses Carl Heinrich Bloch's *The Resurrection* (1881, public domain)
with 12 sample regions. Production scales to ~25 regions by editing one JSON file.

---

## Run it locally

A static server is required (the app `fetch`es JSON and registers a service worker):

```bash
cd painting-bid
python3 -m http.server 8753
```

Then open:

| Mode  | URL                                            | Notes |
|-------|------------------------------------------------|-------|
| Web   | http://localhost:8753/index.html               | Responsive. Resize narrow / open on a phone → hotspots are replaced by a **title bar** list. |
| Kiosk | http://localhost:8753/index.html?mode=kiosk    | Large touch targets, hidden cursor, idle **attract screen** + auto-reset, input lockdown. |

---

## How content is updated (the museum's job)

Everything is driven by **`data/exhibit.json`** and the **`assets/`** folder — no
code changes needed.

```jsonc
{
  "exhibit": {
    "title": "The Resurrection",
    "artist": "Carl Heinrich Bloch",
    "image": "assets/painting.jpg",     // swap the painting here
    "idleTimeoutSeconds": 90,           // kiosk reset delay
    "attractPrompt": "Touch the painting to begin"
  },
  "regions": [
    {
      "id": "face",
      "title": "The Face of the Risen Christ",
      "x": 48.5, "y": 14.5, "r": 5,     // % position + radius on the image
      "duration": "2:55",
      "video": "assets/videos/face.mp4", // drop the real video here
      "text": "Caption / transcript shown beside the video…"
    }
  ]
}
```

**To update a video or text:** edit the region's `video`/`text` field (or replace
the file at that path). **To add a region:** copy a block, give it a new `id`, set
`x`/`y` (percent from top-left of the image) and `r` (radius). Up to ~25+ regions
is comfortable.

> Positioning tip: `x`/`y`/`r` are percentages of the image, so hotspots stay
> aligned at every screen size. A small "click to place a hotspot" authoring
> helper can be added for non-technical staff in the build phase.

If a video file is missing, the modal gracefully shows a placeholder + the text,
so the exhibit never breaks mid-show.

---

## Tracing regions in Figma (polygon hotspots)

Circles (`x`/`y`/`r`) are fine for quick placement, but real features are traced
as **polygons** in Figma and converted automatically.

1. **Match the canvas.** In Figma, place `assets/painting.jpg` on a frame sized to
   the image's native pixels (**1000 × 1400** here) and lock it. Now Figma
   coordinates equal painting pixels.
2. **Trace.** Pen tool → outline each feature. **Name each layer with the region
   `id`** from `exhibit.json` (`face`, `rays`, `hand-left`…). The layer name
   becomes the SVG element `id`, which is how the converter matches.
3. **Export.** Select the frame → Export → **SVG** (keep "Include id attribute" on).
4. **Convert.** Merge the shapes into `exhibit.json` (titles/videos/text preserved):
   ```bash
   node tools/figma-svg-to-regions.mjs path/to/regions.svg data/exhibit.json
   ```
   It reads the SVG `viewBox`, supports `<polygon>`, `<polyline>`, and `<path>`
   (curves are sampled), reports unmatched ids and any region still missing a
   polygon, and is safe to re-run after re-tracing.
5. **Done.** The app overlays an SVG with the same `viewBox`; each region renders
   as a clickable `<polygon>` with hover highlight. Regions without a polygon are
   not drawn on the painting yet — they stay reachable via the mobile title bar
   until you trace them.

> Coordinates are stored in the painting's own pixel space, so polygons scale
> perfectly at every screen size with no rescaling.

## Two configurations, one codebase

**Web mode (default)** — responsive for desktop mouse + mobile touch.
On screens ≤ 640px the clickable regions are hidden and a **title bar list**
is shown instead (per spec), since small hotspots are hard to tap on a phone.
Can be hosted on any static host (Netlify, S3, GitHub Pages) or embedded in an
`<iframe>`.

**Kiosk mode (`?mode=kiosk`)** — designed for a large vertical touch monitor:
- Larger touch targets (≥ 64px) and bigger modal/body text.
- **Idle attract loop**: after `idleTimeoutSeconds` of no interaction it returns
  to a full-screen "Touch to begin" screen, closing any open video.
- **Lockdown**: hidden cursor, disabled context menu, text selection, double-tap
  zoom and pinch gestures.
- **Offline**: a service worker caches the page, painting, and videos on first
  run so playback is reliable with no network.

---

## Windows kiosk deployment (recommended setup)

1. Copy this folder to the PC and serve it locally — either bundle a tiny static
   server, or wrap the folder in a Chrome/Edge app shortcut.
2. Launch Chrome/Edge in kiosk mode pointing at the kiosk URL:
   ```
   chrome.exe --kiosk --app="http://localhost:8753/index.html?mode=kiosk" ^
     --noerrdialogs --disable-pinch --overscroll-history-navigation=0 ^
     --disable-features=TranslateUI --check-for-update-interval=31536000
   ```
3. Use **Windows Assigned Access** (Kiosk mode) so the browser is the only app
   and the OS shell/taskbar/hotkeys are locked down.
4. The service worker means once the kiosk has loaded online, it runs fully offline.

---

## File structure

```
painting-bid/
├── index.html            # shell + <template>s
├── css/styles.css        # web + kiosk styling, responsive breakpoints
├── js/app.js             # data-driven controller (modes, modal, idle, fullscreen)
├── service-worker.js     # offline caching
├── data/exhibit.json     # ← ALL content lives here
└── assets/
    ├── painting.jpg       # the artwork
    └── videos/*.mp4       # one short clip per region (samples included)
```

---

## Prototype scope vs. production

This demo proves the full experience end-to-end. For the production engagement:
- Replace sample clips with the museum's real explainer videos.
- Expand to the full ~25 regions.
- Optional: visual hotspot-authoring tool, multi-language support, captions/subtitles,
  analytics (which regions get watched), a deep-zoom viewer for very large images,
  and a packaged Windows installer for one-click kiosk setup.
# carl-demo
