export type PencilKind = 'pencil' | 'dark-pencil';
const RESOLUTION = 96;
const tips = new Map<string, HTMLCanvasElement>();
function tip(kind: PencilKind, color: string) {
  const key = `${kind}:${color}`; const cached = tips.get(key); if (cached) return cached;
  const c = document.createElement('canvas'); c.width = c.height = RESOLUTION;
  const g = c.getContext('2d')!, pixels = g.createImageData(RESOLUTION, RESOLUTION);
  let hex = color.replace('#', ''); if (hex.length === 3) hex = [...hex].map(v => v + v).join('');
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
  let seed = kind === 'pencil' ? 0x713a23d1 : 0x4f25d918;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let y = 0; y < RESOLUTION; y++) for (let x = 0; x < RESOLUTION; x++) {
    const dx = (x + .5 - RESOLUTION / 2) / (RESOLUTION / 2), dy = (y + .5 - RESOLUTION / 2) / (RESOLUTION / 2);
    const radius = Math.hypot(dx, dy), angle = Math.atan2(dy, dx), noise = random();
    const edge = Math.max(0, Math.min(1, (1 - radius + Math.sin(angle * 11) * .025 + (noise - .5) * .09) * 7));
    const dense = kind === 'dark-pencil';
    const grain = noise < (dense ? .16 : .34) ? .015 : Math.pow(noise, dense ? 1.1 : 2.1);
    const alpha = edge * grain * (dense ? .58 : .31);
    const i = (y * RESOLUTION + x) * 4;
    pixels.data[i] = rgb[0]; pixels.data[i+1] = rgb[1]; pixels.data[i+2] = rgb[2]; pixels.data[i+3] = Math.round(alpha * 255);
  }
  g.putImageData(pixels, 0, 0); tips.set(key, c);
  if (tips.size > 12) tips.delete(tips.keys().next().value!);
  return c;
}
// Fixed-distance sampling does not depend on render frames or duplicate pointer events.
export class PencilStroke {
  private sprite: HTMLCanvasElement;
  private untilNext: number;
  private step: number;
  constructor(private context: CanvasRenderingContext2D, private x: number, private y: number, private size: number, kind: PencilKind, color: string) {
    context.imageSmoothingEnabled = false;
    this.sprite = tip(kind, color); this.step = Math.max(.5, size * .22); this.untilNext = this.step; this.stamp(x, y);
  }
  private stamp(x: number, y: number) {
    // Subpixel quantization prevents numerical segmentation noise from shifting grain.
    // A one-pixel nearest-neighbor tip must align to the pixel grid; half-pixel
    // placement can sample only the transparent rim and lose a tap entirely.
    const left = this.size === 1 ? Math.round(x - .5) : Math.round((x - this.size / 2) * 256) / 256;
    const top = this.size === 1 ? Math.round(y - .5) : Math.round((y - this.size / 2) * 256) / 256;
    this.context.drawImage(this.sprite, left, top, this.size, this.size);
  }
  point(x: number, y: number) {
    const dx = x - this.x, dy = y - this.y, length = Math.hypot(dx, dy); if (!length) return;
    // Clip stamp iteration to the canvas, while advancing the sampling phase across the whole segment.
    let start = 0, end = 1; const r = this.size / 2;
    for (const [position, delta, low, high] of [[this.x,dx,-r,this.context.canvas.width+r],[this.y,dy,-r,this.context.canvas.height+r]]) {
      if (!delta) { if (position < low || position > high) { end = -1; break; } }
      else { const a=(low-position)/delta,b=(high-position)/delta; start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b)); }
    }
    if (start <= end) {
      const skip = Math.max(0, Math.ceil((start * length - this.untilNext) / this.step - 1e-9));
      for (let d = this.untilNext + skip * this.step; d <= end * length + 1e-9; d += this.step) this.stamp(this.x + dx * d / length, this.y + dy * d / length);
    }
    const count = length + 1e-9 >= this.untilNext ? Math.floor((length - this.untilNext + 1e-9) / this.step) + 1 : 0;
    this.untilNext += count * this.step - length; this.x=x; this.y=y;
  }
}
