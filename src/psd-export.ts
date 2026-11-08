import type { Paint } from './engine';
import type { PsdJob } from './psd-worker';
const LIMIT=512*1024*1024;
export async function exportPsd(paint:Paint,dpi:number,signal:AbortSignal,progress:(text:string,value:number)=>void):Promise<Blob>{
  if(typeof Worker==='undefined')throw new Error('이 브라우저는 PSD 내보내기를 지원하지 않습니다.');
  const estimate=(paint.layers.length+1)*paint.width*paint.height*4*3;
  if(estimate>LIMIT)throw new Error(`PSD 인코딩 예상 추가 메모리 ${Math.ceil(estimate/1048576)} MiB가 한도 512 MiB를 넘습니다. 레이어 수를 줄이거나 PNG로 내보내세요.`);
  const cancelled=()=>{if(signal.aborted)throw new DOMException('PSD 내보내기 취소','AbortError');};cancelled();
  const layers:PsdJob['layers']=[];
  for(const [i,l]of paint.layers.entries()){
    cancelled();progress(`레이어 복사 ${i+1}/${paint.layers.length} · 예상 추가 ${Math.ceil(estimate/1048576)} MiB`,Math.round(i/paint.layers.length*45));
    const pixels=l.canvas.getContext('2d')!.getImageData(0,0,paint.width,paint.height);layers.push({name:l.name,visible:l.visible,opacity:l.opacity,pixels:{width:paint.width,height:paint.height,data:pixels.data}});
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
  cancelled();const c=paint.composite(false),pixels=c.getContext('2d')!.getImageData(0,0,paint.width,paint.height);c.width=c.height=0;
  const job:PsdJob={width:paint.width,height:paint.height,dpi,layers,composite:{width:paint.width,height:paint.height,data:pixels.data}};
  progress('PSD 데이터 준비',50);
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./psd-worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{worker.terminate();signal.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new DOMException('PSD 내보내기 취소','AbortError'));};signal.addEventListener('abort',abort,{once:true});
    worker.onerror=e=>{cleanup();reject(new Error(e.message||'PSD Worker 오류'));};
    worker.onmessage=e=>{if(e.data.type==='progress')progress(e.data.text,e.data.value);else if(e.data.type==='done'){cleanup();progress('PSD 생성 완료',100);resolve(new Blob([e.data.buffer],{type:'image/vnd.adobe.photoshop'}));}else if(e.data.type==='error'){cleanup();reject(new Error(`PSD 인코딩 실패: ${e.data.message}`));}};
    if(signal.aborted){abort();return;}worker.postMessage(job,[...layers.map(l=>l.pixels.data.buffer),pixels.data.buffer]);
  });
}
