import { BASIC_BRUSHES, BASIC_DEFAULTS, isBasicBrush, readTexture, type BrushTexture } from './basic-brushes';
export const BRUSHES=['pen','pencil','dark-pencil','eraser',...BASIC_BRUSHES] as const;
export type BrushTool=typeof BRUSHES[number];
export type BrushValues={size:number;opacity:number;texture?:BrushTexture};
export type BrushSettings=Record<BrushTool,BrushValues>;
export type BucketSettings={opacity:number;tolerance:number;expand:number;contiguous:boolean;reference:'layer'|'visible'};
export type ToolPreferences={version:1;tools:BrushSettings;foreground:string;background:string;bucket:BucketSettings};
export const TOOL_KEY='mini-paint.tool-settings.v1';
export function isBrush(tool:string):tool is BrushTool{return (BRUSHES as readonly string[]).includes(tool);}
export function colorValue(value:unknown):string{if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw new Error('잘못된 색상입니다.');return value.toLowerCase();}
export function brushSettings(raw:any):BrushSettings {
  const tools={} as BrushSettings;
  for(const key of BRUSHES){const v=raw?.[key]===undefined&&isBasicBrush(key)?BASIC_DEFAULTS[key]:raw?.[key];if(!v||!Number.isInteger(v.size)||v.size<1||v.size>100||!Number.isFinite(v.opacity)||v.opacity<0||v.opacity>1)throw new Error('도구 크기 또는 불투명도가 잘못되었습니다.');tools[key]={size:v.size,opacity:v.opacity,...(isBasicBrush(key)?{texture:readTexture(key,v.texture)}:{})};}
  return tools;
}
export function defaults():ToolPreferences{return {version:1,tools:{pen:{size:8,opacity:1},pencil:{size:8,opacity:1},'dark-pencil':{size:12,opacity:1},eraser:{size:10,opacity:1},...Object.fromEntries(BASIC_BRUSHES.map(k=>[k,{...BASIC_DEFAULTS[k],texture:{...BASIC_DEFAULTS[k].texture}}]))} as BrushSettings,foreground:'#283747',background:'#ffffff',bucket:{opacity:1,tolerance:0,expand:0,contiguous:true,reference:'layer'}};}
export function validatePreferences(raw:any):ToolPreferences {
  const b=raw?.bucket;
  if(raw?.version!==1||!b||!Number.isFinite(b.opacity)||b.opacity<0||b.opacity>1||!Number.isInteger(b.tolerance)||b.tolerance<0||b.tolerance>100||!Number.isInteger(b.expand)||b.expand<0||b.expand>5||typeof b.contiguous!=='boolean'||!['layer','visible'].includes(b.reference))throw new Error('잘못된 도구 설정입니다.');
  return {version:1,tools:brushSettings(raw.tools),foreground:colorValue(raw.foreground),background:colorValue(raw.background),bucket:{...b}};
}
export function loadToolPreferences(){const raw=localStorage.getItem(TOOL_KEY);return raw?validatePreferences(JSON.parse(raw)):defaults();}
export function saveToolPreferences(p:ToolPreferences){localStorage.setItem(TOOL_KEY,JSON.stringify(validatePreferences(p)));}
