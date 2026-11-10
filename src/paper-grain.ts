// Paper tooth, generated once per brush kind from a fixed seed and anchored to canvas coordinates.
// A sheet's alpha channel is the share of ink the paper rejects at that pixel. It is applied when a
// stroke tile is composited, so the texture survives overlapping stamps and never depends on input timing.
export type GrainKind = 'pencil' | 'dark-pencil' | 'rough-ink' | 'ballpoint';
export const GRAIN = 256; // Two engine tiles; a tile at (x, y) reads the sheet at (x % GRAIN, y % GRAIN).
const sheets = new Map<GrainKind, HTMLCanvasElement>();
const SEEDS: Record<GrainKind, number> = { pencil: 0x6a09e667, 'dark-pencil': 0x3c6ef372, 'rough-ink': 0x1f83d9ab, ballpoint: 0x5be0cd19 };

function generator(seed: number) { return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }; }
/** Tileable value noise: a random lattice of `cells` × `cells`, smoothly interpolated over the sheet. */
function field(random: () => number, cells: number) {
  const lattice = Float32Array.from({ length: cells * cells }, random), out = new Float32Array(GRAIN * GRAIN), scale = cells / GRAIN;
  for (let y = 0; y < GRAIN; y++) for (let x = 0; x < GRAIN; x++) {
    const fx = x * scale, fy = y * scale, x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const u = fx - x0, v = fy - y0, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    out[y * GRAIN + x] = (lattice[y0 * cells + x0] * (1 - a) + lattice[y0 * cells + x1] * a) * (1 - b) + (lattice[y1 * cells + x0] * (1 - a) + lattice[y1 * cells + x1] * a) * b;
  }
  return out;
}
const step = (low: number, high: number, value: number) => { const t = Math.max(0, Math.min(1, (value - low) / (high - low))); return t * t * (3 - 2 * t); };

export function grainSheet(kind: GrainKind) {
  const cached = sheets.get(kind); if (cached) return cached;
  const c = document.createElement('canvas'); c.width = c.height = GRAIN;
  const g = c.getContext('2d', { willReadFrequently: true })!, image = g.createImageData(GRAIN, GRAIN), random = generator(SEEDS[kind]);
  const fine = field(random, GRAIN), medium = field(random, kind === 'dark-pencil' ? 64 : kind === 'rough-ink' ? 56 : 96), coarse = field(random, 24);
  for (let i = 0; i < GRAIN * GRAIN; i++) {
    let reject: number;
    if (kind === 'pencil') reject = .62 * step(.38, .66, .6 * fine[i] + .4 * medium[i]);            // HB: fine, open grain
    else if (kind === 'dark-pencil') reject = .5 * step(.5, .85, .35 * fine[i] + .65 * medium[i]); // 4B: larger, softer, mostly filled
    else if (kind === 'rough-ink') reject = step(.7, .75, .7 * medium[i] + .2 * coarse[i] + .1 * fine[i]); // sparse dry gaps
    else reject = fine[i] > .93 ? .6 : .18 * step(.5, .9, coarse[i]);                                // ballpoint: pinholes and faint ink starvation
    image.data[i * 4 + 3] = Math.round(reject * 255);
  }
  g.putImageData(image, 0, 0); sheets.set(kind, c); return c;
}

let scratch: CanvasRenderingContext2D | null = null;
/** Returns a tile-sized canvas holding `mask` at (x, y) with the paper applied. `fill` > 1 lets dense strokes fill the tooth. */
export function texturedTile(mask: HTMLCanvasElement, x: number, y: number, w: number, h: number, sheet: HTMLCanvasElement, strength: number, fill: number) {
  if (!scratch) { const c = document.createElement('canvas'); c.width = c.height = 128; scratch = c.getContext('2d', { willReadFrequently: true })!; }
  const g = scratch;
  g.globalAlpha = 1; g.globalCompositeOperation = 'copy'; g.drawImage(mask, x, y, w, h, 0, 0, w, h);
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = strength; g.drawImage(sheet, x % GRAIN, y % GRAIN, w, h, 0, 0, w, h);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  for (let pass = 1; pass < fill; pass++) g.drawImage(g.canvas, 0, 0);
  return g.canvas;
}
