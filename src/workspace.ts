// Workspace chrome only: menus, tool rail labels and the cut panel. No canvas, pixel or project state lives here.
type WorkspaceState = { cutHeight: number; cutCollapsed: boolean; railLabels: boolean | null };
const KEY = 'mini-paint-workspace-v1';
export const CUT_MIN = 96, CUT_MAX = 320, CUT_DEFAULT = 124;

/** Menu items are either real command buttons (own id) or proxies (`data-run`) for a control that lives elsewhere. */
export function initMenus(bar: HTMLElement, checks: Record<string, () => boolean>) {
  const menus = [...bar.querySelectorAll<HTMLElement>('.menu')]; let open: HTMLElement | null = null;
  const trigger = (m: HTMLElement) => m.querySelector<HTMLButtonElement>('.menu-button')!;
  const list = (m: HTMLElement) => m.querySelector<HTMLElement>('.menu-list')!;
  // Item state is read only when a menu opens, so drawing never touches menu DOM.
  function sync(m: HTMLElement) {
    for (const item of list(m).querySelectorAll<HTMLButtonElement>('button')) {
      const target = item.dataset.run ? document.getElementById(item.dataset.run) as HTMLButtonElement | null : null;
      if (target) item.disabled = !!target.disabled || !!target.closest('[inert]');
      const check = item.dataset.check ? checks[item.dataset.check] : undefined;
      if (check) item.setAttribute('aria-checked', String(check()));
    }
  }
  function show(m: HTMLElement | null) {
    if (open === m) return;
    if (open) { list(open).hidden = true; trigger(open).setAttribute('aria-expanded', 'false'); }
    open = m;
    if (m) { sync(m); list(m).hidden = false; trigger(m).setAttribute('aria-expanded', 'true'); }
  }
  for (const m of menus) {
    trigger(m).addEventListener('click', () => show(open === m ? null : m));
    trigger(m).addEventListener('pointerenter', () => { if (open && open !== m) show(m); });
    list(m).addEventListener('click', e => {
      const item = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!item) return;
      show(null);
      if (item.dataset.run) document.getElementById(item.dataset.run)?.click();
    });
    m.addEventListener('keydown', e => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const next = menus[(menus.indexOf(m) + (e.key === 'ArrowRight' ? 1 : menus.length - 1)) % menus.length];
        if (open) show(next); trigger(next).focus();
      } else {
        if (open !== m) show(m);
        const items = [...list(m).querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(at + (e.key === 'ArrowDown' ? 1 : at < 0 ? 0 : items.length - 1)) % items.length].focus();
      }
      e.preventDefault(); e.stopPropagation();
    });
  }
  document.addEventListener('pointerdown', e => { if (open && !open.contains(e.target as Node)) show(null); }, true);
  // Escape closes whichever menu is open, wherever focus is, before any canvas shortcut sees the key.
  document.addEventListener('keydown', e => { if (!open || e.key !== 'Escape') return; const m = open; show(null); if (m.contains(document.activeElement)) trigger(m).focus(); e.preventDefault(); e.stopPropagation(); }, true);
  window.addEventListener('blur', () => show(null));
  return { close: () => show(null) };
}

export function initWorkspace(o: { workspace: HTMLElement; cutPanel: HTMLElement; cutHandle: HTMLElement; cutToggle: HTMLButtonElement; editable: () => boolean; onError: (message: string) => void }) {
  let state: WorkspaceState = { cutHeight: CUT_DEFAULT, cutCollapsed: false, railLabels: null };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') state = { cutHeight: Number.isFinite(raw.cutHeight) ? clamp(raw.cutHeight) : CUT_DEFAULT,
      cutCollapsed: raw.cutCollapsed === true, railLabels: typeof raw.railLabels === 'boolean' ? raw.railLabels : null };
  } catch { /* Invalid settings cannot prevent drawing. */ }
  // Until the user chooses, tool names follow the available width.
  const wide = matchMedia('(min-width: 1180px)');
  const labels = () => state.railLabels ?? wide.matches;
  function clamp(value: number) { return Math.round(Math.max(CUT_MIN, Math.min(CUT_MAX, value))); }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { o.onError('작업 화면 설정을 브라우저에 저장하지 못했습니다.'); } }
  function apply() {
    o.cutPanel.style.setProperty('--cut-height', `${state.cutHeight}px`); o.cutPanel.classList.toggle('collapsed', state.cutCollapsed);
    o.cutHandle.setAttribute('aria-valuenow', String(state.cutHeight));
    o.cutToggle.setAttribute('aria-expanded', String(!state.cutCollapsed)); o.cutToggle.title = state.cutCollapsed ? '컷 목록 펼치기' : '컷 목록 접기';
    o.cutToggle.setAttribute('aria-label', o.cutToggle.title); o.cutToggle.textContent = state.cutCollapsed ? '▸' : '▾';
    o.workspace.classList.toggle('rail-compact', !labels());
  }
  function toggleCuts() { if (!o.editable()) return; state.cutCollapsed = !state.cutCollapsed; apply(); persist(); }
  o.cutToggle.onclick = toggleCuts;
  wide.addEventListener('change', apply);
  let resizing: { id: number; y: number; height: number } | null = null;
  o.cutHandle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !o.editable() || state.cutCollapsed) return;
    e.preventDefault(); resizing = { id: e.pointerId, y: e.clientY, height: state.cutHeight }; o.cutHandle.setPointerCapture(e.pointerId);
  });
  o.cutHandle.addEventListener('pointermove', e => { if (!resizing || e.pointerId !== resizing.id) return; state.cutHeight = clamp(resizing.height + resizing.y - e.clientY); apply(); });
  function finish(e: PointerEvent, cancel: boolean) {
    if (!resizing || e.pointerId !== resizing.id) return;
    if (cancel) { state.cutHeight = resizing.height; apply(); }
    resizing = null; if (o.cutHandle.hasPointerCapture(e.pointerId)) o.cutHandle.releasePointerCapture(e.pointerId); persist();
  }
  o.cutHandle.addEventListener('pointerup', e => finish(e, false)); o.cutHandle.addEventListener('pointercancel', e => finish(e, true)); o.cutHandle.addEventListener('lostpointercapture', e => finish(e, true));
  o.cutHandle.addEventListener('keydown', e => {
    if (!o.editable() || state.cutCollapsed || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation(); state.cutHeight = clamp(state.cutHeight + (e.key === 'ArrowUp' ? 16 : -16)); apply(); persist();
  });
  apply();
  return {
    get railLabels() { return labels(); }, get cutsVisible() { return !state.cutCollapsed; }, toggleCuts,
    toggleRailLabels() { state.railLabels = !labels(); apply(); persist(); },
  };
}
