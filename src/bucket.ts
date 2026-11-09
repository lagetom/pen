import { ctx, canvas, HISTORY_LIMIT, type Paint } from './engine';
import type { Rect } from './selection';
import { colorValue, type BucketSettings } from './tool-settings';

type Hooks={signal:AbortSignal;progress:(phase:string,done:number)=>void};
const abort=(signal:AbortSignal)=>{if(signal.aborted)throw new DOMException('채우기 취소','AbortError');};
// RGBA distance uses premultiplied RGB: invisible stored RGB never divides a region.
export function colorDistance(a:Uint8ClampedArray,i:number,j:number){const aa=a[i+3]/255,ba=a[j+3]/255;return Math.max(Math.abs(a[i+3]-a[j+3]),Math.abs(a[i]*aa-a[j]*ba),Math.abs(a[i+1]*aa-a[j+1]*ba),Math.abs(a[i+2]*aa-a[j+2]*ba));}
export async function bucketFill(paint:Paint,x:number,y:number,color:string,settings:BucketSettings,selection:Rect|null,hooks:Hooks){
  if(paint.stroke)throw new Error('획을 마친 뒤 채우세요.');
  const layer=paint.selected;if(!layer.visible||!layer.opacity)throw new Error('표시된 레이어를 선택하세요.');
  const {opacity,tolerance,expand,contiguous,reference}=settings;
  if(!Number.isFinite(opacity)||opacity<0||opacity>1||!Number.isInteger(tolerance)||tolerance<0||tolerance>100||!Number.isInteger(expand)||expand<0||expand>5||typeof contiguous!=='boolean'||!['layer','visible'].includes(reference))throw new Error('잘못된 채우기 설정입니다.');
  color=colorValue(color);x=Math.floor(x);y=Math.floor(y);
  const r=selection??{x:0,y:0,width:paint.width,height:paint.height};
  if(!opacity||x<r.x||y<r.y||x>=r.x+r.width||y>=r.y+r.height||!Number.isFinite(x+y))return 0;
  const n=r.width*r.height;
  if(n*8>HISTORY_LIMIT)throw new Error('채우기 실행 취소 메모리 한도(128 MiB)를 초과합니다. 선택 영역을 줄이세요.');
  abort(hooks.signal);hooks.progress('영역 분석',0);
  const before=ctx(layer.canvas).getImageData(r.x,r.y,r.width,r.height);
  let ref:ImageData;
  if(reference==='visible'){
    // Crop the actual layer composite; display white, guides and selection overlays are absent.
    const c=canvas(r.width,r.height),g=ctx(c);for(const l of paint.layers)if(l.visible){g.globalAlpha=l.opacity;g.drawImage(l.canvas,r.x,r.y,r.width,r.height,0,0,r.width,r.height);}
    ref=g.getImageData(0,0,r.width,r.height);c.width=c.height=0;
  }else ref=before;
  const seed=(y-r.y)*r.width+x-r.x,mask=new Uint8Array(n),queue=new Uint32Array(n);
  const threshold=tolerance*255/100;let head=0,tail=0,work=0,lastYield=performance.now();
  const maybeYield=async(phase:string,done:number)=>{hooks.progress(phase,done);await new Promise<void>(resolve=>setTimeout(resolve,0));abort(hooks.signal);lastYield=performance.now();};
  const visit=(i:number)=>{if(mask[i])return;if(colorDistance(ref.data,i*4,seed*4)<=threshold){mask[i]=2;queue[tail++]=i;}else mask[i]=1;};
  if(contiguous){
    visit(seed);
    while(head<tail){const i=queue[head++],cx=i%r.width;
      if(cx>0)visit(i-1);if(cx+1<r.width)visit(i+1);if(i>=r.width)visit(i-r.width);if(i+r.width<n)visit(i+r.width);
      if((++work&16383)===0&&performance.now()-lastYield>8)await maybeYield('영역 분석',Math.round(head/n*45));
    }
  }else{
    for(let i=0;i<n;i++){visit(i);if((i&16383)===0&&performance.now()-lastYield>8)await maybeYield('영역 분석',Math.round(i/n*45));}
  }
  if(expand){
    // Multi-source 8-neighbour dilation, clipped to the selection. Each pixel queues once.
    head=0;while(head<tail){const i=queue[head++],distance=mask[i]-2;if(distance>=expand)continue;const cx=i%r.width,cy=Math.floor(i/r.width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=r.width||ny>=r.height)continue;const j=ny*r.width+nx;if(mask[j]<2){mask[j]=mask[i]+1;queue[tail++]=j;}}
      if((++work&16383)===0&&performance.now()-lastYield>8)await maybeYield('채우기 확장',50+Math.round(head/n*15));
    }
  }
  const after=new ImageData(new Uint8ClampedArray(before.data),r.width,r.height),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  let left=r.width,top=r.height,right=-1,bottom=-1,changed=0;
  for(let i=0;i<n;i++){
    if(mask[i]>=2){const o=i*4,da=before.data[o+3]/255,alpha=opacity+da*(1-opacity);
      for(let c=0;c<3;c++)after.data[o+c]=Math.round((rgb[c]*opacity+before.data[o+c]*da*(1-opacity))/alpha);
      after.data[o+3]=Math.round(alpha*255);
      if(after.data[o]!==before.data[o]||after.data[o+1]!==before.data[o+1]||after.data[o+2]!==before.data[o+2]||after.data[o+3]!==before.data[o+3]){const cx=i%r.width,cy=Math.floor(i/r.width);left=Math.min(left,cx);top=Math.min(top,cy);right=Math.max(right,cx);bottom=Math.max(bottom,cy);changed++;}
    }
    if((i&16383)===0&&performance.now()-lastYield>8)await maybeYield('색상 계산',65+Math.round(i/n*30));
  }
  abort(hooks.signal);if(!changed){hooks.progress('변경 없음',100);return 0;}
  const width=right-left+1,height=bottom-top+1,b=new ImageData(width,height),a=new ImageData(width,height);
  for(let row=0;row<height;row++){const offset=((top+row)*r.width+left)*4;b.data.set(before.data.subarray(offset,offset+width*4),row*width*4);a.data.set(after.data.subarray(offset,offset+width*4),row*width*4);
    if((row&63)===0&&performance.now()-lastYield>8)await maybeYield('실행 취소 준비',98);
  }
  abort(hooks.signal);const px=r.x+left,py=r.y+top;
  ctx(layer.canvas).putImageData(a,px,py);
  paint.commit({label:'페인트통',layers:[layer],bytes:b.data.byteLength+a.data.byteLength,undo:()=>ctx(layer.canvas).putImageData(b,px,py),redo:()=>ctx(layer.canvas).putImageData(a,px,py)});
  hooks.progress('채우기 완료',100);return changed;
}
