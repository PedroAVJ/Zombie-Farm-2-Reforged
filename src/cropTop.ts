// Crop "plants-only" texture generation.
//
// Each grown-crop sprite bakes an isometric DIRT diamond into the bottom of its
// art with the plant/produce/creature drawn on top. Because plots are placed
// freely (not snapped to a coarse grid), a plot can sit one tile diagonally in
// FRONT of its neighbour — so by footprint depth that neighbour is legitimately
// nearer and its baked dirt is painted OVER the tall crop/zombie behind it,
// chopping off the part that overhangs its own plot (a risen zombie's head, a
// leek's tops). No whole-sprite reorder fixes it: the neighbour really is in
// front at ground level.
//
// The fix is to stop letting the dirt take part in the depth sort at all. We
// render every crop TWICE: the untouched art in a ground layer BELOW all the
// actors/crops (so its dirt can never cover anything), and this dirt-removed
// copy in the depth-sorted entity layer (so the plants themselves still sort
// correctly against actors and each other). The two copies are pixel-aligned,
// so the plants read as one — but a neighbour's dirt now sits strictly below
// every plant and can no longer clip it.
//
// WHERE the dirt is, is pure geometry: the plot's soil art (plowed_dirt) is
// bottom-aligned and spans the full width of every crop texture, so its own
// alpha diamond IS the ground plane. We rasterize that silhouette into the crop's
// pixel space and only ever remove inside it. Everything outside — the whole
// overhang above the soil: a cross's arms, a risen zombie, tall foliage — is kept
// whatever its colour, because that overhang is exactly the part a neighbour's
// dirt must never clip.
//
// (This replaced a scanline heuristic that looked for the first row with a wide
// CONTIGUOUS run of soil. Plants standing on the soil break that run, so the line
// landed at or below the diamond's widest row instead of its apex, leaving the
// diamond's whole BACK half in the depth-sorted copy — 65 of 77 crop stages kept
// dirt there, up to 83% of the diamond. That retained dirt painted over any
// character the sort placed behind the plot.)
//
// WHAT is dirt, inside that region, is still decided by colour: the soil is a
// distinct brown/tan hue. Bright produce (carrots, coffee berries) is protected
// so it survives where it sits down in the soil, and the near-greyscale wooden
// grave cross is protected from being eaten as tan.
import { Texture } from "pixi.js";

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

// Bright, saturated warm produce (carrots, coffee cherries) — never soil.
function isProduce(r: number, g: number, b: number): boolean {
  const [h, s, v] = rgbToHsv(r, g, b);
  return h >= 8 && h <= 42 && s >= 0.62 && v >= 0.72;
}
// Near-greyscale (the wooden grave cross) — keep it, it isn't soil.
function isGrey(r: number, g: number, b: number): boolean {
  return rgbToHsv(r, g, b)[1] < 0.16;
}
// Brown/tan soil: warm hue, from dark shadow through light furrow-crest.
function isSoil(r: number, g: number, b: number): boolean {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (h >= 18 && h <= 48) {
    if (v <= 0.72 && s >= 0.18 && s <= 0.85) return true; // dark/mid brown body
    if (v > 0.6 && v <= 0.9 && s >= 0.14 && s <= 0.55 && r > g && g > b) return true; // light rim/crest
  }
  if (v <= 0.28 && r >= g && g >= b && r - b >= 8) return true; // near-black warm shadow
  return false;
}

/** Read a texture's frame into a pixel buffer, or null if it isn't readable
 *  (no DOM, no canvas, tainted source). */
function readPixels(tex: Texture): { w: number; h: number; d: Uint8ClampedArray } | null {
  const src = tex.source?.resource as CanvasImageSource | undefined;
  const w = tex.frame.width, h = tex.frame.height;
  if (!src || !w || !h || typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  if (!cx) return null;
  cx.drawImage(src, tex.frame.x, tex.frame.y, w, h, 0, 0, w, h);
  return { w, h, d: cx.getImageData(0, 0, w, h).data };
}

// The ground plane's silhouette, taken from the soil art's alpha and dilated by
// one pixel so the diamond's own antialiased rim counts as covered. Cached: it's
// the same soil texture for every crop.
interface SoilMask { w: number; h: number; covered: Uint8Array }
const soilMasks = new WeakMap<Texture, SoilMask | null>();

function soilMask(soilTex: Texture): SoilMask | null {
  const hit = soilMasks.get(soilTex);
  if (hit !== undefined) return hit;
  let mask: SoilMask | null = null;
  try {
    const px = readPixels(soilTex);
    if (px) {
      const { w, h, d } = px;
      const covered = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (d[(y * w + x) * 4 + 3] <= 8) continue;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h) covered[ny * w + nx] = 1;
            }
        }
      }
      mask = { w, h, covered };
    }
  } catch {
    mask = null;
  }
  soilMasks.set(soilTex, mask);
  return mask;
}

/** Build a copy of `tex` with the baked soil pixels cleared to transparent.
 *  `soilTex` is the plot's plowed-soil art, whose alpha silhouette locates the
 *  ground plane inside the crop art (bottom-aligned, full width).
 *  Returns the original texture unchanged if a canvas isn't available or the
 *  pixels can't be read (e.g. a tainted source) — callers then fall back to the
 *  old single-sprite behaviour rather than crashing. */
export function makeCropTopTexture(tex: Texture, soilTex: Texture): Texture {
  try {
    const mask = soilMask(soilTex);
    const px = readPixels(tex);
    if (!mask || !px) return tex;
    const { w: W, h: H, d } = px;
    const n = W * H;

    // Map crop pixels onto the soil art. Both are drawn 4 tiles wide with their
    // bottoms on the plot's ground-contact line (see Field.layoutCrop), so the
    // soil spans the crop's full width and its apex sits `soilH/k` rows up from
    // the bottom.
    const k = mask.w / W;              // soil pixels per crop pixel
    const top = H - mask.h / k;        // crop row of the diamond's apex
    const onSoil = (x: number, y: number): boolean => {
      if (y < top) return false;
      const sx = Math.round(x * k), sy = Math.round((y - top) * k);
      if (sx < 0 || sy < 0 || sx >= mask.w || sy >= mask.h) return false;
      return mask.covered[sy * mask.w + sx] === 1;
    };

    const remove = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
      if (a <= 30) continue;
      const y = (i / W) | 0;
      if (!onSoil(i - y * W, y)) continue; // overhang above the ground plane — always kept
      if (!isProduce(r, g, b) && !isGrey(r, g, b) && isSoil(r, g, b)) remove[i] = 1;
    }
    // Erode one pixel into the soil's anti-aliased edge: a kept pixel touching
    // removed soil that is itself a desaturated warm tone is halo, not plant.
    const halo = new Uint8Array(n);
    for (let y = Math.max(0, Math.floor(top)); y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (remove[i] || d[i * 4 + 3] <= 30 || !onSoil(x, y)) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (remove[ny * W + nx]) { near = true; break; }
          }
        if (!near) continue;
        const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        if (!isProduce(r, g, b) && !isGrey(r, g, b) && rgbToHsv(r, g, b)[1] < 0.6 && r > g && g >= b)
          halo[i] = 1;
      }
    }

    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    if (!cx) return tex;
    const img = cx.createImageData(W, H);
    img.data.set(d);
    for (let i = 0; i < n; i++) if (remove[i] || halo[i]) img.data[i * 4 + 3] = 0;
    cx.putImageData(img, 0, 0);
    return Texture.from(cv);
  } catch {
    return tex;
  }
}
