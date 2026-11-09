import { canvas, ctx, HISTORY_LIMIT, type Paint, type Layer, type Command } from './engine';

export type Rect = { x: number; y: number; width: number; height: number };
export function rectangle(x1: number, y1: number, x2: number, y2: number, width: number, height: number): Rect | null {
  const x = Math.max(0, Math.min(width, Math.round(Math.min(x1, x2))));
  const y = Math.max(0, Math.min(height, Math.round(Math.min(y1, y2))));
  const right = Math.max(0, Math.min(width, Math.round(Math.max(x1, x2))));
  const bottom = Math.max(0, Math.min(height, Math.round(Math.max(y1, y2))));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
export function inside(r: Rect | null, x: number, y: number) {
  return !!r && x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
}
function different(a: ImageData, b: ImageData) { return a.data.some((v, i) => v !== b.data[i]); }
function idle(paint: Paint) { if (paint.stroke) throw new Error('획을 마친 뒤 선택 영역을 편집하세요.'); }

export function clearRegion(paint: Paint, r: Rect) {
  idle(paint);
  const layer = paint.selected, g = ctx(layer.canvas), before = g.getImageData(r.x, r.y, r.width, r.height);
  if (!before.data.some((v, i) => i % 4 === 3 && v)) return;
  g.clearRect(r.x, r.y, r.width, r.height);
  paint.commit({ label: '선택 영역 지우기', layers: [layer], bytes: before.data.byteLength,
    undo: () => ctx(layer.canvas).putImageData(before, r.x, r.y),
    redo: () => ctx(layer.canvas).clearRect(r.x, r.y, r.width, r.height) });
}

// Only the active edit owns temporary canvases. The brush input path does no selection work.
// A selection moves its crop; an artwork move uses the same preview/commit/cancel transaction.
export class PixelMove {
  private sources: { layer: Layer; original: HTMLCanvasElement; crop: HTMLCanvasElement | null }[] = [];
  private dx = 0; private dy = 0; private pending = false; private closed = false;
  constructor(private paint: Paint, private startX: number, private startY: number,
    layers: Layer[], private region: Rect | null = null) {
    idle(paint);
    if (!layers.length) throw new Error('이동할 레이어가 없습니다.');
    // Refuse before allocating/mutating when one complete undo command could exceed the budget.
    if (layers.length * paint.width * paint.height * 8 > HISTORY_LIMIT)
      throw new Error('이동할 레이어의 픽셀 합계가 실행 취소 메모리 한도(128 MiB)를 초과합니다. 레이어 수나 캔버스 크기를 줄이세요.');
    try {
      for (const layer of layers) {
        const original = canvas(paint.width, paint.height);
        this.sources.push({ layer, original, crop: null });
        ctx(original).drawImage(layer.canvas, 0, 0);
        if (region) {
          const crop = canvas(region.width, region.height); this.sources.at(-1)!.crop = crop;
          ctx(crop).drawImage(original, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
        }
      }
    } catch (e) { this.dispose(); throw e; }
  }
  update(x: number, y: number) {
    if (this.closed || !Number.isFinite(x + y)) return;
    const dx = Math.round(x - this.startX), dy = Math.round(y - this.startY);
    if (dx === this.dx && dy === this.dy) return;
    this.dx = dx; this.dy = dy; this.pending = true; this.paint.render();
  }
  get selection(): Rect | null {
    const r = this.region;
    return r && rectangle(r.x + this.dx, r.y + this.dy, r.x + r.width + this.dx, r.y + r.height + this.dy, this.paint.width, this.paint.height);
  }
  flush() {
    if (!this.pending || this.closed) return;
    for (const { layer, original, crop } of this.sources) {
      const g = ctx(layer.canvas), r = this.region;
      g.clearRect(0, 0, this.paint.width, this.paint.height);
      if (r && crop) {
        g.drawImage(original, 0, 0); g.clearRect(r.x, r.y, r.width, r.height);
        g.drawImage(crop, r.x + this.dx, r.y + this.dy);
      } else g.drawImage(original, this.dx, this.dy);
    }
    this.pending = false;
  }
  finish() {
    if (this.closed) return;
    try {
      this.flush();
      const r = this.region;
      const bounds = r ? rectangle(Math.min(r.x, r.x + this.dx), Math.min(r.y, r.y + this.dy),
        Math.max(r.x + r.width, r.x + r.width + this.dx), Math.max(r.y + r.height, r.y + r.height + this.dy), this.paint.width, this.paint.height)!
        : { x: 0, y: 0, width: this.paint.width, height: this.paint.height };
      const patches = this.sources.flatMap(({ layer, original }) => {
        const { x, y, width, height } = bounds;
        const before = ctx(original).getImageData(x, y, width, height), after = ctx(layer.canvas).getImageData(x, y, width, height);
        return different(before, after) ? [{ layer, before, after }] : [];
      });
      if (patches.length) {
        const apply = (key: 'before' | 'after') => patches.forEach(p => ctx(p.layer.canvas).putImageData(p[key], bounds.x, bounds.y));
        const command: Command = { label: r ? '선택 영역 이동' : '전체 그림 이동', layers: patches.map(p => p.layer),
          bytes: patches.reduce((n, p) => n + p.before.data.byteLength * 2, 0), undo: () => apply('before'), redo: () => apply('after') };
        this.paint.commit(command);
      }
    } catch (e) { this.restore(); throw e; }
    finally { this.dispose(); this.paint.render(); }
  }
  cancel() { if (this.closed) return; this.restore(); this.dispose(); this.paint.render(); }
  private restore() {
    for (const { layer, original } of this.sources) { const g = ctx(layer.canvas); g.clearRect(0, 0, this.paint.width, this.paint.height); g.drawImage(original, 0, 0); }
  }
  private dispose() { for (const s of this.sources) { s.original.width = s.original.height = 0; if (s.crop) s.crop.width = s.crop.height = 0; } this.sources = []; this.closed = true; }
}

export class SelectionClipboard {
  private value: { pixels: ImageData; x: number; y: number; name: string } | null = null;
  get available() { return !!this.value; }
  copy(paint: Paint, r: Rect) {
    idle(paint); this.value = { pixels: ctx(paint.selected.canvas).getImageData(r.x, r.y, r.width, r.height), x: r.x, y: r.y, name: paint.selected.name };
  }
  async writeSystem() {
    if (!this.value || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return;
    const c = canvas(this.value.pixels.width, this.value.pixels.height); ctx(c).putImageData(this.value.pixels, 0, 0);
    try { const image = new Promise<Blob>((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('PNG 변환 실패')), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]); }
    finally { c.width = c.height = 0; }
  }
  paste(paint: Paint): Rect | null {
    idle(paint); if (!this.value) return null;
    if (paint.layers.length >= 50 || (paint.layers.length + 1) * paint.width * paint.height > 128e6)
      throw new Error('레이어 개수 또는 메모리 한도를 초과합니다.');
    const { pixels, name } = this.value;
    const x = Math.min(this.value.x, Math.max(0, paint.width - pixels.width)), y = Math.min(this.value.y, Math.max(0, paint.height - pixels.height));
    const layer = paint.makeLayer(`${name} 선택 영역`), source = paint.selected;
    ctx(layer.canvas).putImageData(pixels, x, y);
    paint.structure('선택 영역 붙여넣기', () => { paint.layers.splice(paint.layers.indexOf(source) + 1, 0, layer); paint.active = layer.id; }, paint.width * paint.height * 4);
    return rectangle(x, y, x + pixels.width, y + pixels.height, paint.width, paint.height);
  }
}
