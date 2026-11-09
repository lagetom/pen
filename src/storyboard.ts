import { readDpi } from './resolution';
import { Paint, canvas, ctx, blob, blobURL, loadImage, dimensions, HISTORY_LIMIT, type Layer, type Project } from './engine';
export const MAX_CUTS = 30;
export const HOT_PIXELS = 32_000_000;
export type View = { zoom: number; panX: number; panY: number };
type Frozen = { layer: Layer; image: Blob };
export type Cut = { id: string; name: string; paint: Paint; cold: Frozen[] | null; thumbnail: string; view: View | null };
export type ProjectV2 = { format: 'mini-paint'; version: 2; name: string; dpi?: number; width: number; height: number; activeCut: string; whiteBackground: boolean; cuts: { id: string; name: string; layers: Project['layers']; guide?: Project['guide']; activeLayer: number; view: View | null }[] };
let sequence = 0;
function makeCut(paint: Paint, name: string): Cut { return { id: `cut-${++sequence}`, name, paint, cold: null, thumbnail: '', view: null }; }
export function thumbnailCanvas(width: number, height: number) {
  const scale = Math.min(96 / width, 72 / height);
  return canvas(Math.max(1,Math.round(width*scale)), Math.max(1,Math.round(height*scale)));
}
function preview(paint: Paint) {
  const c = thumbnailCanvas(paint.width,paint.height), g = ctx(c);
  for (const l of paint.layers) if (l.visible) { g.globalAlpha = l.opacity; g.drawImage(l.canvas, 0, 0, c.width, c.height); }
  return c.toDataURL('image/png');
}
export class Storyboard {
  dpi = 96; cuts: Cut[]; current: Cut; whiteBackground = true;
  constructor(paint = new Paint()) { this.dpi=paint.dpi; this.current = makeCut(paint, '컷 1'); this.cuts = [this.current]; }
  get paint() { return this.current.paint; }
  get width() { return this.paint.width; }
  get height() { return this.paint.height; }
  get stats() {
    return { cuts: this.cuts.length, hotCuts: this.cuts.filter(c => !c.cold).length,
      canvasBytes: this.cuts.reduce((n,c) => n + c.paint.referencedLayers().reduce((v,l) => v + l.canvas.width * l.canvas.height * 4,0),0),
      compressedBytes: this.cuts.reduce((n,c) => n + (c.cold?.reduce((v,l) => v+l.image.size,0) ?? 0),0),
      historyBytes: this.cuts.reduce((n,c) => n+c.paint.history.bytes,0) };
  }
  enforceHistoryBudget() {
    let total = this.stats.historyBytes, trimmed = false;
    for (const cut of [...this.cuts.filter(c => c !== this.current), this.current]) {
      const h = cut.paint.history;
      while (total > HISTORY_LIMIT && (h.past.length || h.future.length)) {
        const old = h.past.shift() ?? h.future.shift()!; total -= old.bytes; h.bytes -= old.bytes; trimmed = true;
      }
      const refs = new Set(cut.paint.referencedLayers());
      if (cut.cold) cut.cold = cut.cold.filter(f => refs.has(f.layer));
    }
    return trimmed;
  }
  async freeze(cut: Cut) {
    if (cut.cold) return;
    if (cut.paint.stroke) throw new Error('그리는 중에는 컷을 전환할 수 없습니다.');
    const thumbnail = preview(cut.paint);
    const packed = await Promise.all(cut.paint.referencedLayers().map(async layer => ({ layer, image: await blob(layer.canvas) })));
    // Release backing stores only after every encode succeeds. History retains the same Layer references.
    for (const f of packed) f.layer.canvas.width = f.layer.canvas.height = 0;
    cut.cold = packed; cut.thumbnail = thumbnail;
  }
  async thaw(cut: Cut) {
    if (!cut.cold) return;
    const decoded: { layer: Layer; image: HTMLImageElement }[] = [];
    for (const f of cut.cold) {
      const url = URL.createObjectURL(f.image);
      try { decoded.push({ layer: f.layer, image: await loadImage(url) }); } finally { URL.revokeObjectURL(url); }
    }
    // Decode all images before mutating any retained Canvas, including canvases referenced by history.
    for (const f of decoded) { f.layer.canvas.width = cut.paint.width; f.layer.canvas.height = cut.paint.height; ctx(f.layer.canvas).drawImage(f.image, 0, 0); }
    cut.cold = null;
  }
  async reconcile() {
    const i = this.cuts.indexOf(this.current), keep = new Set([this.current]);
    let pixels = this.current.paint.referencedLayers().length * this.width * this.height;
    for (const neighbor of [this.cuts[i-1], this.cuts[i+1]]) if (neighbor) {
      const cost = neighbor.paint.referencedLayers().length * this.width * this.height;
      if (pixels + cost <= HOT_PIXELS) { keep.add(neighbor); pixels += cost; }
    }
    for (const c of this.cuts) if (!keep.has(c)) await this.freeze(c);
    for (const c of keep) await this.thaw(c);
  }
  async select(id: string) {
    const next = this.cuts.find(c => c.id === id); if (!next || next === this.current) return;
    const previous = this.current;
    try { await this.thaw(next); this.current = next; await this.reconcile(); }
    catch (e) { this.current = previous; await this.thaw(previous); throw e; }
  }
  async add(duplicate = false) {
    if (this.cuts.length >= MAX_CUTS) throw new Error(`컷은 최대 ${MAX_CUTS}개까지 만들 수 있습니다.`);
    const p = new Paint();
    if (duplicate) { p.load(await p.decode(await this.paint.serialize('복제'))); p.active = p.layers[this.paint.layers.indexOf(this.paint.selected)].id; }
    else p.reset(this.width, this.height);
    p.dpi=this.dpi;
    const cut = makeCut(p, duplicate ? `${this.current.name} 복사` : `컷 ${this.cuts.length + 1}`);
    while (this.cuts.some(c=>c.id===cut.id)) cut.id=`cut-${++sequence}`;
    cut.view = this.current.view ? {...this.current.view} : null; cut.thumbnail = preview(p);
    const previous = this.current; this.cuts.splice(this.cuts.indexOf(previous)+1,0,cut); this.current = cut;
    try { await this.reconcile(); } catch (e) { this.cuts.splice(this.cuts.indexOf(cut),1); this.current = previous; p.release(); await this.thaw(previous); throw e; }
  }
  async remove() {
    if (this.cuts.length <= 1) throw new Error('컷은 최소 1개가 필요합니다.');
    const old = this.current, i = this.cuts.indexOf(old), next = this.cuts[i-1] ?? this.cuts[i+1];
    await this.select(next.id); this.cuts.splice(this.cuts.indexOf(old),1); old.paint.release(); old.cold = null; await this.reconcile();
  }
  async move(delta: number) {
    const i = this.cuts.indexOf(this.current), j = i + delta;
    if (j < 0 || j >= this.cuts.length) return;
    [this.cuts[i],this.cuts[j]] = [this.cuts[j],this.cuts[i]];
    try { await this.reconcile(); } catch(e) { [this.cuts[i],this.cuts[j]] = [this.cuts[j],this.cuts[i]]; throw e; }
  }
  async copyPreviousLayers() {
    const previous = this.cuts[this.cuts.indexOf(this.current)-1]; if (!previous) throw new Error('이전 컷이 없습니다.');
    const p = this.paint;
    if (p.layers.length + previous.paint.layers.length > 50 || (p.layers.length+previous.paint.layers.length)*this.width*this.height > 128e6) throw new Error('레이어 메모리 한도를 초과합니다.');
    const saved = await this.serializeCut(previous), decoded = await p.decode(saved);
    p.structure('이전 컷 레이어 복제', () => { p.layers.push(...decoded.layers); p.active = decoded.layers.at(-1)!.id; }, decoded.layers.length*this.width*this.height*4);
  }
  private serializeCut(cut: Cut): Promise<Project> {
    const p = cut.paint;
    if (!cut.cold) return p.serialize(cut.name);
    const metadata = p.layers.map(l => ({ name:l.name, visible:l.visible, opacity:l.opacity, imageSource:l.imageSource?{...l.imageSource}:undefined, blob:cut.cold!.find(f=>f.layer===l)!.image }));
    const width = p.width, height = p.height, name = cut.name, guide = {...p.guide}, dpi=this.dpi;
    return Promise.all(metadata.map(async l => ({name:l.name,visible:l.visible,opacity:l.opacity,imageSource:l.imageSource,image:await blobURL(l.blob)}))).then(layers=>({format:'mini-paint',version:1,width,height,name,guide,dpi,layers}));
  }
  async serialize(name: string): Promise<ProjectV2> {
    // Every hot cut synchronously clones its canvases before the first await; cold Blobs are immutable.
    const metadata = { format:'mini-paint' as const, version:2 as const, name, dpi:this.dpi, width:this.width, height:this.height, activeCut:this.current.id, whiteBackground:this.whiteBackground };
    const pending = this.cuts.map(c => { const id=c.id, name=c.name, activeLayer=c.paint.layers.indexOf(c.paint.selected), view=c.view ? {...c.view}:null; const project=this.serializeCut(c); return project.then(p=>({id,name,activeLayer,view,guide:p.guide,layers:p.layers})); });
    return {...metadata,cuts:await Promise.all(pending)};
  }
  static async decode(raw: any): Promise<{ story: Storyboard; name: string }> {
    const story = new Storyboard(), staging = story.current.paint;
    try {
      if (!raw || typeof raw !== 'object') throw new Error('올바른 프로젝트가 아닙니다.');
      if (raw.version !== 2) {
        const p = await staging.decode(raw); staging.load(p); story.dpi=p.dpi; story.current.thumbnail = preview(staging); return {story,name:p.name};
      }
      dimensions(raw.width, raw.height); story.dpi=readDpi(raw.dpi);
      if (raw.format !== 'mini-paint' || !Array.isArray(raw.cuts) || !raw.cuts.length || raw.cuts.length > MAX_CUTS) throw new Error('잘못된 다중 컷 프로젝트입니다.');
      const ids = new Set<string>(); const cuts: Cut[]=[];
      // Keep decoded full-resolution canvases for one staging cut at a time; reject before replacing the live document.
      story.cuts = cuts;
      for (const item of raw.cuts) {
        if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.name !== 'string') throw new Error('잘못된 컷 정보입니다.');
        if (item.objects !== undefined && (!Array.isArray(item.objects) || item.objects.length)) throw new Error('이 버전에서는 편집 가능한 객체를 지원하지 않습니다.');
        ids.add(item.id);
        const p = new Paint();
        try {
          p.load(await p.decode({format:'mini-paint',version:1,width:raw.width,height:raw.height,dpi:story.dpi,guide:item.guide,layers:item.layers}));
          if (!Number.isInteger(item.activeLayer) || item.activeLayer < 0 || item.activeLayer >= p.layers.length) throw new Error('잘못된 선택 레이어입니다.');
          p.active = p.layers[item.activeLayer].id;
          const cut = makeCut(p,item.name.slice(0,100)); cut.id=item.id;
          if (item.view !== null && item.view !== undefined) {
            const v=item.view;
            if (![v.zoom,v.panX,v.panY].every(Number.isFinite) || v.zoom<.1 || v.zoom>8 || Math.abs(v.panX)>1e6 || Math.abs(v.panY)>1e6) throw new Error('잘못된 화면 위치입니다.');
            cut.view={zoom:v.zoom,panX:v.panX,panY:v.panY};
          }
          cuts.push(cut); await story.freeze(cut);
        } catch(e) { p.release(); throw e; }
      }
      const selected = cuts.find(c=>c.id===raw.activeCut); if (!selected) throw new Error('선택된 컷이 없습니다.');
      story.current=selected; story.whiteBackground=raw.whiteBackground !== false; staging.release(); await story.reconcile();
      return {story,name:typeof raw.name==='string'?raw.name.slice(0,100):'제목 없음'};
    } catch(e) { staging.release(); story.dispose(); throw e; }
  }
  dispose() { for (const c of this.cuts) { c.paint.changed=()=>{}; c.paint.render=()=>{}; c.paint.release(); c.cold=null; } }
}
