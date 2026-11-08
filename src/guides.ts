export type GuideSettings = { type: 'none' | 'grid' | 'ruled' | 'dots'; visible: boolean; spacing: number; color: 'blue' | 'gray'; opacity: number };
export const defaultGuide = (): GuideSettings => ({type:'none',visible:true,spacing:24,color:'blue',opacity:.3});
export function readGuide(raw: unknown): GuideSettings {
  if (raw === undefined) return defaultGuide();
  if (!raw || typeof raw !== 'object') throw new Error('잘못된 종이 가이드 설정입니다.');
  const g = raw as GuideSettings;
  if (!['none','grid','ruled','dots'].includes(g.type) || typeof g.visible !== 'boolean' || !Number.isInteger(g.spacing) || g.spacing < 8 || g.spacing > 64 || !['blue','gray'].includes(g.color) || !Number.isFinite(g.opacity) || g.opacity < .1 || g.opacity > .8) throw new Error('잘못된 종이 가이드 설정입니다.');
  return {type:g.type,visible:g.visible,spacing:g.spacing,color:g.color,opacity:g.opacity};
}
export function renderGuide(overlay: HTMLElement, g: GuideSettings) {
  overlay.hidden = !g.visible || g.type === 'none';
  const color = g.color === 'blue' ? '#78a5cf' : '#858d96';
  overlay.style.opacity = String(g.opacity); overlay.style.backgroundSize = `${g.spacing}px ${g.spacing}px`;
  overlay.style.backgroundPosition = '0px 0px';
  const horizontal = `linear-gradient(to bottom, ${color} 1px, transparent 1px)`;
  overlay.style.backgroundImage = g.type === 'grid' ? `${horizontal}, linear-gradient(to right, ${color} 1px, transparent 1px)` : g.type === 'ruled' ? horizontal : g.type === 'dots' ? `radial-gradient(circle at 1px 1px, ${color} .9px, transparent 1.2px)` : 'none';
}
