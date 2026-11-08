import { dimensions } from './engine';
import { readDpi } from './resolution';
import { readGuide, type GuideSettings } from './guides';
export type BrushPreset={id:string;name:string;kind:'brush';tool:'pen'|'pencil'|'dark-pencil'|'eraser';size:number;opacity:number;color:string;texture?:{version:1}};
export type WorkPreset={id:string;name:string;kind:'work';width:number;height:number;dpi:number;guide:GuideSettings;whiteBackground:boolean};
export type UserPreset=BrushPreset|WorkPreset;
const KEY='mini-paint.user-presets.v1';
let next=0;
export function presetId(){return `preset-${Date.now()}-${++next}`;}
export function validatePreset(raw:any):UserPreset{
  if(!raw || typeof raw!=='object' || typeof raw.id!=='string'|| !raw.id||raw.id.length>100 || typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100)throw new Error('프리셋 이름 또는 ID가 잘못되었습니다.');
  const base={id:raw.id,name:raw.name.trim()};
  if(raw.kind==='brush'){
    if(!['pen','pencil','dark-pencil','eraser'].includes(raw.tool)||!Number.isInteger(raw.size)||raw.size<1||raw.size>100||!Number.isFinite(raw.opacity)||raw.opacity<0||raw.opacity>1||!/^#[0-9a-f]{6}$/i.test(raw.color))throw new Error('브러시 프리셋 값이 잘못되었습니다.');
    if(raw.texture!==undefined && raw.texture?.version!==1)throw new Error('지원하지 않는 연필 질감 설정입니다.');
    return {...base,kind:'brush',tool:raw.tool,size:raw.size,opacity:raw.opacity,color:raw.color,...(raw.texture?{texture:{version:1 as const}}:{})};
  }
  if(raw.kind!=='work' || typeof raw.whiteBackground!=='boolean')throw new Error('잘못된 작업 프리셋입니다.');
  dimensions(raw.width,raw.height);return {...base,kind:'work',width:raw.width,height:raw.height,dpi:readDpi(raw.dpi),guide:readGuide(raw.guide),whiteBackground:raw.whiteBackground};
}
export function importPresets(raw:any):UserPreset[]{
  if(raw?.format!=='mini-paint-presets'||raw.version!==1||!Array.isArray(raw.presets)||raw.presets.length>100)throw new Error('올바른 프리셋 JSON이 아닙니다.');
  const parsed=raw.presets.map(validatePreset),ids=new Set(parsed.map((p:UserPreset)=>p.id));if(ids.size!==parsed.length)throw new Error('프리셋 ID가 중복되었습니다.');return parsed;
}
export function loadPresets():UserPreset[]{const raw=localStorage.getItem(KEY);return raw?importPresets(JSON.parse(raw)):[];}
export function savePresets(presets:UserPreset[]){if(presets.length>100)throw new Error('프리셋은 최대 100개입니다.');const parsed=importPresets({format:'mini-paint-presets',version:1,presets});localStorage.setItem(KEY,JSON.stringify({format:'mini-paint-presets',version:1,presets:parsed}));}
