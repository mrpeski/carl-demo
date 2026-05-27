#!/usr/bin/env node
/**
 * figma-svg-to-regions.mjs
 * --------------------------------------------------------------
 * Convert a Figma-exported SVG of traced regions into the
 * `regions[].polygon` arrays inside data/exhibit.json.
 *
 *   node tools/figma-svg-to-regions.mjs <regions.svg> [exhibit.json]
 *
 * How it matches: each SVG shape must carry an `id` equal to the
 * region id in exhibit.json (Figma uses the layer name as the id).
 *   - <polygon points="..."> / <polyline> -> points read directly
 *   - <path d="..."> -> sampled into points (straight + curves)
 *
 * Coordinates are emitted in the SVG's own viewBox units, which
 * should equal the painting's native pixel size (e.g. 1000x1400).
 * The app overlays an SVG with that same viewBox, so no rescaling.
 *
 * Existing titles / videos / text in exhibit.json are preserved;
 * only `polygon` is added/updated. New ids are reported, not added.
 * Re-run any time you re-trace in Figma.
 * --------------------------------------------------------------
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , svgPath, jsonPath = "data/exhibit.json"] = process.argv;
if (!svgPath) {
  console.error("Usage: node tools/figma-svg-to-regions.mjs <regions.svg> [exhibit.json]");
  process.exit(1);
}

const svg = readFileSync(svgPath, "utf8");

/* ---- viewBox (falls back to width/height attrs) ---- */
const vb = svg.match(/viewBox\s*=\s*"([\d.\s-]+)"/);
let W = 0, H = 0;
if (vb) {
  const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
  W = w; H = h;
} else {
  W = Number((svg.match(/\bwidth\s*=\s*"([\d.]+)/) || [])[1]) || 0;
  H = Number((svg.match(/\bheight\s*=\s*"([\d.]+)/) || [])[1]) || 0;
}
const round = (n) => Math.round(n * 10) / 10;

/* ---- collect <polygon|polyline|path ...> elements ---- */
const shapes = {};
const tagRe = /<(polygon|polyline|path)\b([^>]*)\/?>/gi;
let m;
while ((m = tagRe.exec(svg))) {
  const [, tag, attrs] = m;
  const id = (attrs.match(/\bid\s*=\s*"([^"]+)"/) || [])[1];
  if (!id) continue;
  let pts = null;
  if (tag === "path") {
    const d = (attrs.match(/\bd\s*=\s*"([^"]+)"/) || [])[1];
    if (d) pts = samplePath(d);
  } else {
    const p = (attrs.match(/\bpoints\s*=\s*"([^"]+)"/) || [])[1];
    if (p) pts = p.trim().split(/\s+|,\s*/).map(Number).reduce((acc, v, i) => {
      if (i % 2 === 0) acc.push([v]); else acc[acc.length - 1].push(v);
      return acc;
    }, []);
  }
  if (pts && pts.length >= 3) shapes[id] = pts.map(([x, y]) => [round(x), round(y)]);
}

/* ---- merge into exhibit.json by id ---- */
const data = JSON.parse(readFileSync(jsonPath, "utf8"));
const known = new Set(data.regions.map((r) => r.id));
if (W && H) { data.exhibit.imageWidth = W; data.exhibit.imageHeight = H; }

let updated = 0;
for (const r of data.regions) {
  if (shapes[r.id]) {
    r.polygon = shapes[r.id];
    delete r.x; delete r.y; delete r.r;   // polygon supersedes the circle
    updated++;
  }
}
const orphans = Object.keys(shapes).filter((id) => !known.has(id));

writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
console.log(`viewBox: ${W}x${H}`);
console.log(`Updated ${updated} region(s) with polygons.`);
if (orphans.length) console.log(`SVG ids with no matching region (skipped): ${orphans.join(", ")}`);
const missing = data.regions.filter((r) => !r.polygon && !shapes[r.id]).map((r) => r.id);
if (missing.length) console.log(`Regions still without a polygon: ${missing.join(", ")}`);

/* --------------------------------------------------------------
 * Minimal SVG path sampler: handles M/L/H/V/Z and samples
 * C/S/Q/T/A curves into line segments. Good enough for hit areas.
 * -------------------------------------------------------------- */
function samplePath(d, steps = 12) {
  const out = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const num = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
  const cmds = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
  for (const c of cmds) {
    const type = c[0];
    const a = (c.slice(1).match(num) || []).map(Number);
    const rel = type === type.toLowerCase();
    const push = (x, y) => { cx = x; cy = y; out.push([x, y]); };
    switch (type.toUpperCase()) {
      case "M": {
        for (let i = 0; i < a.length; i += 2) {
          let x = a[i], y = a[i + 1];
          if (rel) { x += cx; y += cy; }
          push(x, y);
          if (i === 0) { sx = cx; sy = cy; }
        }
        break;
      }
      case "L":
        for (let i = 0; i < a.length; i += 2) push(rel ? cx + a[i] : a[i], rel ? cy + a[i + 1] : a[i + 1]);
        break;
      case "H":
        for (const v of a) push(rel ? cx + v : v, cy);
        break;
      case "V":
        for (const v of a) push(cx, rel ? cy + v : v);
        break;
      case "C":
        for (let i = 0; i < a.length; i += 6) {
          const [x1, y1, x2, y2, x, y] = rel
            ? [cx + a[i], cy + a[i+1], cx + a[i+2], cy + a[i+3], cx + a[i+4], cy + a[i+5]]
            : a.slice(i, i + 6);
          cubic(cx, cy, x1, y1, x2, y2, x, y, steps, out); cx = x; cy = y;
        }
        break;
      case "Q":
        for (let i = 0; i < a.length; i += 4) {
          const [x1, y1, x, y] = rel
            ? [cx + a[i], cy + a[i+1], cx + a[i+2], cy + a[i+3]]
            : a.slice(i, i + 4);
          quad(cx, cy, x1, y1, x, y, steps, out); cx = x; cy = y;
        }
        break;
      case "A": // approximate arcs by their end point (rare in traced regions)
        for (let i = 0; i < a.length; i += 7) push(rel ? cx + a[i+5] : a[i+5], rel ? cy + a[i+6] : a[i+6]);
        break;
      case "Z": push(sx, sy); break;
      default: break; // S/T smooth curves: treated as line to endpoint
    }
  }
  return out;
}
function cubic(x0,y0,x1,y1,x2,y2,x3,y3,n,out){
  for(let i=1;i<=n;i++){const t=i/n,u=1-t;
    out.push([u*u*u*x0+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x3, u*u*u*y0+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3]);}
}
function quad(x0,y0,x1,y1,x2,y2,n,out){
  for(let i=1;i<=n;i++){const t=i/n,u=1-t;
    out.push([u*u*x0+2*u*t*x1+t*t*x2, u*u*y0+2*u*t*y1+t*t*y2]);}
}
