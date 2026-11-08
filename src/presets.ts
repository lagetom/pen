import { dimensions } from './engine';
export const PRESETS = [
  { id:'instagram-square', label:'인스타툰 정사각형 · 1080 × 1080 (1:1)', width:1080, height:1080 },
  { id:'instagram-portrait', label:'인스타툰 세로 · 1080 × 1350 (4:5)', width:1080, height:1350 },
  { id:'instagram-tall', label:'인스타툰 긴 세로 · 1080 × 1440 (3:4)', width:1080, height:1440 },
  { id:'story', label:'스토리 · 1080 × 1920 (9:16)', width:1080, height:1920 },
  { id:'standard', label:'기본 · 1600 × 1200 (4:3)', width:1600, height:1200 },
  { id:'wide', label:'와이드 · 1920 × 1080 (16:9)', width:1920, height:1080 },
];
export function ratio(width: number, height: number) { let a=width,b=height;while(b){const next=a%b;a=b;b=next;}return `${width/a}:${height/a}`; }
const KEY='mini-paint.canvasPreset.v1';
export function readPreset() {
  try { const saved=JSON.parse(localStorage.getItem(KEY) ?? 'null'); if(saved){dimensions(saved.width,saved.height);return {id:PRESETS.find(p=>p.id===saved.id && p.width===saved.width && p.height===saved.height)?.id ?? 'custom',width:saved.width,height:saved.height};} }catch{}
  return {...PRESETS[0]};
}
export function rememberPreset(id:string,width:number,height:number) { dimensions(width,height);try{localStorage.setItem(KEY,JSON.stringify({id,width,height}));}catch{} }
