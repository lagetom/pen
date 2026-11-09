import { readDpi } from './resolution';
import { PencilStroke, type PencilKind } from './pencil';
import { defaultGuide, readGuide, type GuideSettings } from './guides';
// IDs only identify layers inside this module; they are not authentication tokens.
// A module-wide counter also works on HTTP origins without crypto.randomUUID.
let nextLayerId = 0;
function layerId() { return `layer-${++nextLayerId}`; }
export const TILE = 128;
export const HISTORY_LIMIT = 128 * 1024 * 1024;
export type ImageSource = { width:number; height:number; name:string };
export function readImageSource(raw:any):ImageSource|undefined {
  if(raw===undefined)return;
  if(!raw||!Number.isInteger(raw.width)||!Number.isInteger(raw.height)||raw.width<1||raw.height<1||raw.width>8192||raw.height>8192||typeof raw.name!=='string'||raw.name.length>100)throw new Error('잘못된 원본 이미지 정보입니다.');
  return {width:raw.width,height:raw.height,name:raw.name};
}
export type Layer = { id: string; name: string; visible: boolean; opacity: number; canvas: HTMLCanvasElement; imageSource?: ImageSource };
export type Command = { label: string; bytes: number; undo: () => void; redo: () => void; layers?: Layer[] };
export type Project = { format: 'mini-paint'; version: 1; width: number; height: number; name: string; dpi?: number; guide?: GuideSettings; layers: { name: string; visible: boolean; opacity: number; image: string; imageSource?: ImageSource }[] };
export function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function ctx(c: HTMLCanvasElement) { return c.getContext('2d', { willReadFrequently: true })!; }
export function dimensions(w: number, h: number) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096) throw new Error('캔버스 크기는 1~4096px 정수로 지정하세요.');
}
export class History {
  past: Command[] = []; future: Command[] = []; bytes = 0; discarded = false;
  push(c: Command) {
    for (const old of this.future) this.bytes -= old.bytes;
    this.future = []; this.past.push(c); this.bytes += c.bytes; this.discarded = false;
    while (this.past.length + this.future.length > 50 || this.bytes > HISTORY_LIMIT) {
      const old = this.past.shift(); if (!old) break; this.bytes -= old.bytes; this.discarded = true;
    }
  }
  undo() { const c = this.past.pop(); if (c) { c.undo(); this.future.push(c); } return c; }
  redo() { const c = this.future.pop(); if (c) { c.redo(); this.past.push(c); } return c; }
  clear() { this.past = []; this.future = []; this.bytes = 0; }
}
export class Paint {
  dpi = 96;
  guide = defaultGuide();
  width = 1600; height = 1200; layers: Layer[] = []; active = ''; history = new History();
  stroke: null | { layer: Layer; original: HTMLCanvasElement; mask: HTMLCanvasElement; x: number; y: number; size: number; color: string; opacity: number; erase: boolean; pencil: PencilStroke | null; tiles: Set<string>; pending: Set<string> } = null;
  changed = (_layers?: Layer[]) => {}; render = () => {};
  constructor() { this.reset(1600, 1200); }
  get selected() { return this.layers.find(l => l.id === this.active)!; }
  makeLayer(name = '레이어'): Layer { return { id: layerId(), name, visible: true, opacity: 1, canvas: canvas(this.width, this.height) }; }
  reset(w: number, h: number) { dimensions(w, h); this.cancel(); this.width = w; this.height = h; this.guide = defaultGuide(); this.dpi = 96; this.layers = [this.makeLayer('레이어 1')]; this.active = this.layers[0].id; this.history.clear(); }
  commit(c: Command) { this.history.push(c); this.changed(c.layers); this.render(); }
  structure(label: string, action: () => void, bytes = 0) {
    if (this.stroke) return;
    const before = [...this.layers], oldActive = this.active;
    action(); const after = [...this.layers], newActive = this.active;
    this.commit({ label, bytes, layers: [...new Set([...before, ...after])], undo: () => { this.layers = [...before]; this.active = oldActive; }, redo: () => { this.layers = [...after]; this.active = newActive; } });
  }
  add() {
    if ((this.layers.length + 1) * this.width * this.height > 128e6 || this.layers.length >= 50) throw new Error('레이어 메모리 한도에 도달했습니다.');
    const l = this.makeLayer(`레이어 ${this.layers.length + 1}`);
    this.structure('레이어 추가', () => { this.layers.splice(this.layers.indexOf(this.selected) + 1, 0, l); this.active = l.id; }, this.width * this.height * 4);
  }
  remove() { if (this.layers.length === 1) throw new Error('레이어는 최소 1개가 필요합니다.'); const l = this.selected; this.structure('레이어 삭제', () => { const i = this.layers.indexOf(l); this.layers.splice(i, 1); this.active = this.layers[Math.max(0, i - 1)].id; }, this.width * this.height * 4); }
  move(delta: number) { const i = this.layers.indexOf(this.selected), j = i + delta; if (j < 0 || j >= this.layers.length) return; this.structure('레이어 순서 변경', () => { [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]]; }); }
  property<K extends 'name' | 'opacity' | 'visible'>(l: Layer, key: K, value: Layer[K]) {
    if (this.stroke || l[key] === value) return; const before = l[key]; l[key] = value;
    this.commit({ label: '레이어 속성 변경', bytes: 0, layers: [l], undo: () => { l[key] = before; }, redo: () => { l[key] = value; } });
  }
  begin(x: number, y: number, size: number, color: string, opacity: number, erase: boolean, pencil: PencilKind | null = null) {
    if (this.stroke || !this.selected.visible || this.selected.opacity === 0 || opacity === 0) return false;
    const original = canvas(this.width, this.height); ctx(original).drawImage(this.selected.canvas, 0, 0);
    const mask = canvas(this.width, this.height);
    this.stroke = { layer: this.selected, original, mask, pencil: pencil && !erase ? new PencilStroke(ctx(mask), x, y, size, pencil, color) : null, x, y, size, color, opacity, erase, tiles: new Set(), pending: new Set() };
    this.point(x, y, true); return true;
  }
  point(x: number, y: number, dot = false) {
    const s = this.stroke; if (!s || !Number.isFinite(x + y)) return;
    if (s.pencil) { if (!dot) s.pencil.point(x, y); } else {
      const m = ctx(s.mask); m.fillStyle = m.strokeStyle = s.color; m.lineWidth = s.size; m.lineCap = m.lineJoin = 'round';
      if (dot) { m.beginPath(); m.arc(x, y, s.size / 2, 0, Math.PI * 2); m.fill(); }
      else if (x !== s.x || y !== s.y) { m.beginPath(); m.moveTo(s.x, s.y); m.lineTo(x, y); m.stroke(); }
    }
    const r = s.size / 2 + 2;
    const left = Math.max(0, Math.floor((Math.min(x, s.x) - r) / TILE)), top = Math.max(0, Math.floor((Math.min(y, s.y) - r) / TILE));
    const right = Math.min(Math.ceil(this.width / TILE) - 1, Math.floor((Math.max(x, s.x) + r) / TILE)), bottom = Math.min(Math.ceil(this.height / TILE) - 1, Math.floor((Math.max(y, s.y) + r) / TILE));
    for (let tx = left; tx <= right; tx++) for (let ty = top; ty <= bottom; ty++) { s.tiles.add(`${tx},${ty}`); s.pending.add(`${tx},${ty}`); }
    s.x = x; s.y = y; this.render();
  }
  flush() {
    const s = this.stroke; if (!s) return;
    const c = ctx(s.layer.canvas);
    // Each tile is recomposited from the original, so brush opacity never builds up within one stroke.
    for (const tile of s.pending) {
      const [tx, ty] = tile.split(',').map(Number), x = tx * TILE, y = ty * TILE, w = Math.min(TILE, this.width - x), h = Math.min(TILE, this.height - y);
      c.clearRect(x, y, w, h); c.drawImage(s.original, x, y, w, h, x, y, w, h);
      c.globalAlpha = s.opacity; c.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      c.drawImage(s.mask, x, y, w, h, x, y, w, h); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    s.pending.clear();
  }
  end() {
    if (!this.stroke) return; this.flush(); const s = this.stroke, layer = s.layer; this.stroke = null;
    const patches: { x: number; y: number; before: ImageData; after: ImageData }[] = [];
    for (const tile of s.tiles) {
      const [tx, ty] = tile.split(',').map(Number), x = tx * TILE, y = ty * TILE, w = Math.min(TILE, this.width - x), h = Math.min(TILE, this.height - y);
      const before = ctx(s.original).getImageData(x, y, w, h), after = ctx(s.layer.canvas).getImageData(x, y, w, h);
      if (before.data.some((v, i) => v !== after.data[i])) patches.push({ x, y, before, after });
    }
    s.original.width = s.original.height = s.mask.width = s.mask.height = 0;
    if (!patches.length) { this.render(); return; }
    this.commit({ label: s.erase ? '지우개' : s.pencil ? '연필 스트로크' : '펜 스트로크', layers: [layer], bytes: patches.reduce((n, p) => n + p.before.data.byteLength * 2, 0), undo: () => patches.forEach(p => ctx(layer.canvas).putImageData(p.before, p.x, p.y)), redo: () => patches.forEach(p => ctx(layer.canvas).putImageData(p.after, p.x, p.y)) });
  }
  cancel() { const s = this.stroke; if (!s) return; const c = ctx(s.layer.canvas); c.clearRect(0, 0, this.width, this.height); c.drawImage(s.original, 0, 0); s.original.width = s.original.height = s.mask.width = s.mask.height = 0; this.stroke = null; this.render(); }
  clearLayer() {
    if (this.stroke) return; const l = this.selected, before = ctx(l.canvas).getImageData(0, 0, this.width, this.height);
    if (!before.data.some((v, i) => i % 4 === 3 && v)) return;
    ctx(l.canvas).clearRect(0, 0, this.width, this.height);
    this.commit({ label: '레이어 내용 지우기', layers: [l], bytes: before.data.byteLength, undo: () => ctx(l.canvas).putImageData(before, 0, 0), redo: () => ctx(l.canvas).clearRect(0, 0, this.width, this.height) });
  }
  composite(white = false) {
    const out = canvas(this.width, this.height), c = ctx(out);
    if (white) { c.fillStyle = '#fff'; c.fillRect(0, 0, out.width, out.height); }
    for (const l of this.layers) if (l.visible) { c.globalAlpha = l.opacity; c.drawImage(l.canvas, 0, 0); }
    c.globalAlpha = 1; return out;
  }
  referencedLayers() { return [...new Set([...this.layers, ...[...this.history.past, ...this.history.future].flatMap(c => c.layers ?? [])])]; }
  release() { this.cancel(); for (const l of this.referencedLayers()) l.canvas.width = l.canvas.height = 0; this.history.clear(); this.layers = []; }
  async serialize(name: string): Promise<Project> {
    // Capture all canvases synchronously before yielding so edits cannot mix revisions.
    const copies = this.layers.map(l => ({ name: l.name, visible: l.visible, opacity: l.opacity, imageSource:l.imageSource?{...l.imageSource}:undefined, copy: (() => { const c = canvas(this.width, this.height); ctx(c).drawImage(l.canvas, 0, 0); return c; })() }));
    const width = this.width, height = this.height, guide = {...this.guide}, dpi = this.dpi;
    const layers = await Promise.all(copies.map(async l => ({ name: l.name, visible: l.visible, opacity: l.opacity, imageSource:l.imageSource, image: await dataURL(l.copy) })));
    return { format: 'mini-paint', version: 1, name, width, height, guide, dpi, layers };
  }
  async decode(raw: unknown) {
    if (!raw || typeof raw !== 'object') throw new Error('올바른 프로젝트 파일이 아닙니다.');
    const p = raw as Record<string, any>;
    if (p.version !== undefined && p.version !== 1) throw new Error('지원하지 않는 프로젝트 버전입니다.');
    if (p.format !== undefined && p.format !== 'mini-paint') throw new Error('지원하지 않는 프로젝트 형식입니다.');
    const guide = readGuide(p.guide), dpi = readDpi(p.dpi);
    const w = p.width ?? p.canvasWidth, h = p.height ?? p.canvasHeight; dimensions(w, h);
    if (!Array.isArray(p.layers) || !p.layers.length || p.layers.length > 50 || p.layers.length * w * h > 128e6) throw new Error('레이어 개수 또는 메모리 한도를 초과했습니다.');
    const layers: Layer[] = [];
    for (const entry of p.layers) {
      if (!entry || typeof entry !== 'object') throw new Error('잘못된 레이어입니다.');
      const imageSource=readImageSource(entry.imageSource);
      const image = entry.image ?? entry.dataURL ?? entry.data;
      if (typeof image !== 'string' || image.length > 96e6 || !image.startsWith('data:image/png;base64,')) throw new Error('레이어에 유효한 PNG 데이터가 없습니다.');
      const opacity = entry.opacity ?? 1;
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('잘못된 레이어 불투명도입니다.');
      const img = await loadImage(image);
      if (img.width !== w || img.height !== h) throw new Error('레이어와 캔버스 크기가 다릅니다.');
      const c = canvas(w, h); ctx(c).drawImage(img, 0, 0);
      layers.push({ id: layerId(), name: String(entry.name ?? '레이어').slice(0, 100), visible: entry.visible !== false, opacity, canvas: c, imageSource });
    }
    return { width: w, height: h, layers, guide, dpi, name: typeof p.name === 'string' ? p.name.slice(0, 100) : '제목 없음' };
  }
  load(p: Awaited<ReturnType<Paint['decode']>>) { this.cancel(); this.width = p.width; this.height = p.height; this.guide = {...p.guide}; this.dpi = p.dpi; this.layers = p.layers; this.active = p.layers.at(-1)!.id; this.history.clear(); }
}
export function loadImage(src: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.')); img.src = src; }); }
export function blob(c: HTMLCanvasElement): Promise<Blob> { return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('이미지 변환에 실패했습니다.')), 'image/png')); }
async function dataURL(c: HTMLCanvasElement) { return blobURL(await blob(c)); }
export function blobURL(b: Blob) { return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = () => reject(new Error('이미지 직렬화에 실패했습니다.')); r.readAsDataURL(b); }); }
