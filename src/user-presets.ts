import { isBasicBrush, readTexture, type BrushTexture } from './basic-brushes';
import { dimensions } from './engine';
import { readDpi } from './resolution';
import { readGuide, type GuideSettings } from './guides';
import { brushSettings, colorValue, defaults, isBrush, type BrushTool, type BrushSettings } from './tool-settings';
export type BrushPreset={id:string;name:string;kind:'brush';tool:BrushTool;size:number;opacity:number;color:string;texture?:{version:1}|BrushTexture};
export type WorkPreset={id:string;name:string;kind:'work';width:number;height:number;dpi:number;guide:GuideSettings;whiteBackground:boolean};
export type ToolSetPreset={id:string;name:string;kind:'toolset';tools:BrushSettings;foreground:string;background:string};
export type UserPreset=BrushPreset|WorkPreset|ToolSetPreset;
const KEY='mini-paint.user-presets.v3',PREVIOUS_KEY='mini-paint.user-presets.v2',LEGACY_KEY='mini-paint.user-presets.v1';
let next=0;
export function presetId(){return `preset-${Date.now()}-${++next}`;}
export function validatePreset(raw:any):UserPreset{
  if(!raw || typeof raw!=='object' || typeof raw.id!=='string'|| !raw.id||raw.id.length>100 || typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100)throw new Error('프리셋 이름 또는 ID가 잘못되었습니다.');
  const base={id:raw.id,name:raw.name.trim()};
  if(raw.kind==='toolset')return {...base,kind:'toolset',tools:brushSettings(raw.tools),foreground:colorValue(raw.foreground),background:colorValue(raw.background)};
  if(raw.kind==='brush'){
    if(!isBrush(raw.tool)||!Number.isInteger(raw.size)||raw.size<1||raw.size>100||!Number.isFinite(raw.opacity)||raw.opacity<0||raw.opacity>1||!/^#[0-9a-f]{6}$/i.test(raw.color))throw new Error('브러시 프리셋 값이 잘못되었습니다.');
    if(raw.texture!==undefined && raw.texture?.version!==1)throw new Error('지원하지 않는 브러시 질감 설정입니다.');
    return {...base,kind:'brush',tool:raw.tool,size:raw.size,opacity:raw.opacity,color:raw.color,...(isBasicBrush(raw.tool)?{texture:readTexture(raw.tool,raw.texture)}:raw.texture?{texture:{version:1 as const}}:{})};
  }
  if(raw.kind!=='work' || typeof raw.whiteBackground!=='boolean')throw new Error('잘못된 작업 프리셋입니다.');
  dimensions(raw.width,raw.height);return {...base,kind:'work',width:raw.width,height:raw.height,dpi:readDpi(raw.dpi),guide:readGuide(raw.guide),whiteBackground:raw.whiteBackground};
}
export function importPresets(raw:any):UserPreset[]{
  if(raw?.format!=='mini-paint-presets'||![1,2,3].includes(raw.version)||!Array.isArray(raw.presets)||raw.presets.length>100||(raw.version===1&&raw.presets.some((p:any)=>p?.kind==='toolset')))throw new Error('올바른 프리셋 JSON이 아닙니다.');
  const parsed=raw.presets.map(validatePreset),ids=new Set(parsed.map((p:UserPreset)=>p.id));if(ids.size!==parsed.length)throw new Error('프리셋 ID가 중복되었습니다.');return parsed;
}
export function exampleToolSets():ToolSetPreset[]{return [['일상툰 선화',20,8,12,10],['작은 캐릭터',6,4,6,6],['러프 스케치',12,18,24,16]].map(([name,pen,pencil,dark,eraser],i)=>{const tools=defaults().tools;for(const [key,size]of [['pen',pen],['pencil',pencil],['dark-pencil',dark],['eraser',eraser]] as const)tools[key].size=Number(size);if(i===2)tools.pencil.opacity=.55;return {id:`example-toolset-${i}`,name:String(name),kind:'toolset',tools,foreground:'#283747',background:'#ffffff'};});}
export function loadPresets():UserPreset[]{const raw=localStorage.getItem(KEY);if(raw)return importPresets(JSON.parse(raw));const previous=localStorage.getItem(PREVIOUS_KEY);if(previous)return importPresets(JSON.parse(previous));const old=localStorage.getItem(LEGACY_KEY),presets=old?importPresets(JSON.parse(old)):[];const examples=exampleToolSets().filter(p=>!presets.some(old=>old.id===p.id));return [...presets,...examples].slice(0,100);}
export function presetFile(presets:UserPreset[]){return {format:'mini-paint-presets',version:3,presets:importPresets({format:'mini-paint-presets',version:3,presets})};}
export function savePresets(presets:UserPreset[]){localStorage.setItem(KEY,JSON.stringify(presetFile(presets)));}
