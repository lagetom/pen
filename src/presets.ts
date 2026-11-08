import { readDpi } from './resolution';
import { dimensions } from './engine';
export const PRESETS = [
  { id:'instagram-square', label:'인스타툰 정사각형 · 1080 × 1080 (1:1)', width:1080, height:1080, dpi:96 },
  { id:'instagram-portrait', label:'인스타툰 세로 · 1080 × 1350 (4:5)', width:1080, height:1350, dpi:96 },
  { id:'instagram-tall', label:'인스타툰 긴 세로 · 1080 × 1440 (3:4)', width:1080, height:1440, dpi:96 },
  { id:'story', label:'스토리 · 1080 × 1920 (9:16)', width:1080, height:1920, dpi:96 },
  { id:'standard', label:'기본 · 1600 × 1200 (4:3)', width:1600, height:1200, dpi:96 },
  { id:'wide', label:'와이드 · 1920 × 1080 (16:9)', width:1920, height:1080, dpi:96 },
  {id:'a4-150',label:'A4 150dpi · 1240 × 1754',width:1240,height:1754,dpi:150},
  {id:'a4-300',label:'A4 300dpi · 2480 × 3508',width:2480,height:3508,dpi:300},
  {id:'a5-150',label:'A5 150dpi · 874 × 1240',width:874,height:1240,dpi:150},
  {id:'a5-300',label:'A5 300dpi · 1748 × 2480',width:1748,height:2480,dpi:300},
  {id:'square-1200',label:'정사각형 · 1200 × 1200',width:1200,height:1200,dpi:96},
];
export function ratio(width: number, height: number) { let a=width,b=height;while(b){const next=a%b;a=b;b=next;}return `${width/a}:${height/a}`; }
const KEY='mini-paint.canvasPreset.v1';
export function readPreset() {
  try { const saved=JSON.parse(localStorage.getItem(KEY) ?? 'null'); if(saved){dimensions(saved.width,saved.height);return {dpi:readDpi(saved.dpi),id:PRESETS.find(p=>p.id===saved.id && ((p.width===saved.width && p.height===saved.height)||(p.width===saved.height && p.height===saved.width)))?.id ?? 'custom',width:saved.width,height:saved.height};} }catch{}
  return {...PRESETS[0]};
}
export function rememberPreset(id:string,width:number,height:number,dpi=96) { readDpi(dpi); dimensions(width,height);try{localStorage.setItem(KEY,JSON.stringify({id,width,height,dpi}));}catch{} }
