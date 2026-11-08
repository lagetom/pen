import { readDpi } from './resolution';
function crc(bytes:Uint8Array){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export async function withResolution(png:Blob,dpi:number){
  readDpi(dpi);const data=new Uint8Array(await png.arrayBuffer()),view=new DataView(data.buffer);
  if(data.length<8||[137,80,78,71,13,10,26,10].some((v,i)=>data[i]!==v))throw new Error('PNG 파일 서명이 잘못되었습니다.');
  const chunk=new Uint8Array(21),v=new DataView(chunk.buffer);v.setUint32(0,9);chunk.set([112,72,89,115],4);v.setUint32(8,Math.round(dpi/.0254));v.setUint32(12,Math.round(dpi/.0254));chunk[16]=1;v.setUint32(17,crc(chunk.subarray(4,17)));
  const parts:BlobPart[]=[data.slice(0,8)];let inserted=false;
  for(let offset=8;offset<data.length;){if(offset+12>data.length)throw new Error('PNG 청크가 잘렸습니다.');const length=view.getUint32(offset),end=offset+12+length;if(end>data.length)throw new Error('PNG 청크 길이가 잘못되었습니다.');const type=String.fromCharCode(...data.subarray(offset+4,offset+8));if(type==='IDAT'&&!inserted){parts.push(chunk);inserted=true;}if(type!=='pHYs')parts.push(data.slice(offset,end));offset=end;}
  if(!inserted)throw new Error('PNG 이미지 데이터가 없습니다.');return new Blob(parts,{type:'image/png'});
}
