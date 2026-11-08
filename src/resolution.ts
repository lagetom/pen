export const DEFAULT_DPI = 96;
export function readDpi(value: unknown = DEFAULT_DPI): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 36 || value > 1200) throw new Error('DPI는 36~1200 정수로 입력하세요.');
  return value;
}
export function mmToPx(mm: number, dpi: number) { readDpi(dpi); if(!Number.isFinite(mm)||mm<=0)throw new Error('mm 크기는 양수로 입력하세요.');return Math.round(mm/25.4*dpi); }
export function pxToMm(px: number,dpi:number){return px/readDpi(dpi)*25.4;}
