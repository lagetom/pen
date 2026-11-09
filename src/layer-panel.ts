import { canvas, ctx, type Layer, type Paint } from './engine';

export class LayerList {
  private rows = new Map<Layer, { row: HTMLElement; eye: HTMLButtonElement; select: HTMLButtonElement; name: HTMLElement; opacity: HTMLElement; mark: HTMLElement; thumb: HTMLCanvasElement }>();
  private dirty = new Set<Layer>(); private lastActive = '';
  constructor(private host: HTMLElement, private actions: { select: (l: Layer) => void; rename: (l: Layer) => void; toggle: (l: Layer) => void; reorder: (from: string, to: string) => void; editable: () => boolean }) {}
  invalidate(layers: Layer[]) { for (const l of layers) this.dirty.add(l); }
  reset() { this.rows.clear(); this.dirty.clear(); this.lastActive = ''; this.host.replaceChildren(); }
  sync(paint: Paint, editing: boolean) {
    for (const [l, item] of this.rows) if (!paint.layers.includes(l)) { item.row.remove(); this.rows.delete(l); this.dirty.delete(l); }
    for (const [i, l] of [...paint.layers].reverse().entries()) {
      let item = this.rows.get(l);
      if (!item) {
        const row = document.createElement('div'); row.className = 'layer-row'; row.setAttribute('role', 'listitem'); row.dataset.layerId = l.id;
        const eye = document.createElement('button'); eye.className = 'eye';
        const thumb = canvas(44, 34); thumb.className = 'layer-thumbnail'; thumb.setAttribute('aria-hidden', 'true');
        const select = document.createElement('button'); select.className = 'layer-select';
        const name = document.createElement('span'), opacity = document.createElement('small'), mark = document.createElement('span'); mark.className = 'active-mark';
        select.append(name, opacity); row.append(eye, thumb, select, mark);
        eye.onclick = () => this.actions.toggle(l); select.onclick = () => this.actions.select(l); select.ondblclick = () => this.actions.rename(l);
        row.draggable = true;
        row.addEventListener('dragstart', e => { if (!this.actions.editable()) { e.preventDefault(); return; } e.dataTransfer!.setData('application/x-mini-paint-layer', l.id); e.dataTransfer!.effectAllowed = 'move'; row.classList.add('dragging'); });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
        row.addEventListener('dragover', e => { if (this.actions.editable() && e.dataTransfer?.types.includes('application/x-mini-paint-layer')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
        row.addEventListener('drop', e => { const id = e.dataTransfer?.getData('application/x-mini-paint-layer'); if (id && this.actions.editable()) { e.preventDefault(); this.actions.reorder(id, l.id); } });
        item = { row, eye, select, name, opacity, mark, thumb }; this.rows.set(l, item); this.dirty.add(l);
      }
      const active = l.id === paint.active;
      item.row.classList.toggle('selected', active); item.select.setAttribute('aria-pressed', String(active));
      item.name.textContent = l.name; item.select.title = l.name; item.opacity.textContent = `${Math.round(l.opacity * 100)}% · 일반`; item.mark.textContent = active ? '•' : '';
      item.eye.title = l.visible ? '레이어 숨기기' : '레이어 표시'; item.eye.setAttribute('aria-label', item.eye.title); item.eye.setAttribute('aria-pressed', String(l.visible));
      item.eye.textContent = l.visible ? '◉' : '○';
      if (!editing && this.dirty.delete(l)) { const g = ctx(item.thumb); g.clearRect(0, 0, 44, 34); g.drawImage(l.canvas, 0, 0, 44, 34); }
      if (this.host.children[i] !== item.row) this.host.insertBefore(item.row, this.host.children[i] ?? null);
    }
    const position = `${paint.active}:${paint.layers.indexOf(paint.selected)}`;
    if (this.lastActive !== position) { this.rows.get(paint.selected)?.row.scrollIntoView({ block: 'nearest', inline: 'nearest' }); this.lastActive = position; }
  }
}

type PanelSettings = { width: number; collapsed: boolean; compact: boolean; brush: boolean; screen: boolean };
const KEY = 'mini-paint-layer-panel-v1';
export function initLayerPanel(sidebar: HTMLElement, handle: HTMLElement, toggle: HTMLButtonElement, editable: () => boolean, onError: (message: string) => void) {
  let state: PanelSettings = { width: 340, collapsed: false, compact: false, brush: true, screen: true };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') state = { width: Number.isFinite(raw.width) ? Math.max(280, Math.min(520, raw.width)) : 340,
      collapsed: raw.collapsed === true, compact: raw.compact === true, brush: raw.brush !== false, screen: raw.screen !== false };
  } catch { /* Invalid settings cannot prevent drawing. */ }
  const density = document.getElementById('layerDensity') as HTMLSelectElement;
  const brush = document.getElementById('brushSettings') as HTMLDetailsElement, screen = document.getElementById('screenSettings') as HTMLDetailsElement;
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { onError('패널 설정을 브라우저에 저장하지 못했습니다.'); } }
  function apply() {
    sidebar.style.setProperty('--sidebar-width', `${state.width}px`); sidebar.hidden = state.collapsed; sidebar.classList.toggle('compact', state.compact);
    handle.classList.toggle('collapsed', state.collapsed); handle.setAttribute('aria-valuenow', String(state.width));
    toggle.textContent = state.collapsed ? '‹' : '›'; toggle.setAttribute('aria-expanded', String(!state.collapsed)); toggle.title = state.collapsed ? '레이어 패널 펼치기' : '레이어 패널 접기';
    density.value = state.compact ? 'compact' : 'normal'; brush.open = state.brush; screen.open = state.screen;
  }
  toggle.onclick = () => { if (editable()) { state.collapsed = !state.collapsed; apply(); persist(); } };
  density.onchange = () => { state.compact = density.value === 'compact'; apply(); persist(); };
  for (const [element, key] of [[brush, 'brush'], [screen, 'screen']] as const) element.addEventListener('toggle', () => { state[key] = element.open; persist(); });
  let resizing: { id: number; x: number; width: number } | null = null;
  handle.addEventListener('pointerdown', e => {
    if (e.target === toggle || e.button !== 0 || !editable() || state.collapsed) return;
    e.preventDefault(); resizing = { id: e.pointerId, x: e.clientX, width: state.width }; handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => { if (!resizing || e.pointerId !== resizing.id) return; state.width = Math.max(280, Math.min(520, resizing.width + resizing.x - e.clientX)); apply(); });
  function finish(e: PointerEvent, cancel: boolean) {
    if (!resizing || e.pointerId !== resizing.id) return;
    if (cancel) { state.width = resizing.width; apply(); }
    resizing = null; if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId); persist();
  }
  handle.addEventListener('pointerup', e => finish(e, false)); handle.addEventListener('pointercancel', e => finish(e, true)); handle.addEventListener('lostpointercapture', e => finish(e, true));
  handle.addEventListener('keydown', e => { if (e.target === toggle || !editable() || state.collapsed || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); state.width = Math.max(280, Math.min(520, state.width + (e.key === 'ArrowLeft' ? 20 : -20))); apply(); persist(); });
  apply();
}
