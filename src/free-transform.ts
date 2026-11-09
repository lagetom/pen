import { canvas, ctx, HISTORY_LIMIT, type Paint } from './engine';
import type { Rect } from './selection';

export type TransformState = { cx: number; cy: number; width: number; height: number; angle: number };
export type ImportSource = { image: HTMLImageElement; rect: Rect };
export type TransformHandle = 'move' | 'rotate' | 'nw' | 'ne' | 'sw' | 'se';
const signs = { nw: [-1,-1], ne: [1,-1], sw: [-1,1], se: [1,1] } as const;
function rotate(x: number, y: number, degrees: number) {
  const r=degrees*Math.PI/180;return {x:x*Math.cos(r)-y*Math.sin(r),y:x*Math.sin(r)+y*Math.cos(r)};
}
export function alphaBounds(pixels: ImageData): Rect | null {
  let left=pixels.width,top=pixels.height,right=-1,bottom=-1;
  for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++)if(pixels.data[(y*pixels.width+x)*4+3]){
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
  }
  return right<left?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}

// Each preview is rendered from immutable source pixels, never from the previous preview.
// The raster engine and project format continue to own the committed layer pixels.
export class FreeTransform {
  readonly layer;
  readonly initial: TransformState;
  state: TransformState;
  readonly sourceWidth: number; readonly sourceHeight: number;
  private before: ImageData;
  private background: HTMLCanvasElement;
  private source: HTMLCanvasElement | HTMLImageElement;
  private drag: {handle:TransformHandle;x:number;y:number;state:TransformState} | null=null;
  private pending=false; private closed=false; private touched=false;
  constructor(private paint:Paint,region:Rect|null=null,imported?:ImportSource) {
    if(paint.stroke)throw new Error('획을 마친 뒤 변형하세요.');
    if(paint.width*paint.height*8>HISTORY_LIMIT)throw new Error('변형 실행 취소 메모리 한도(128 MiB)를 초과합니다.');
    this.layer=paint.selected;
    if(!this.layer.visible || !this.layer.opacity)throw new Error('표시된 레이어를 선택하세요.');
    this.before=ctx(this.layer.canvas).getImageData(0,0,paint.width,paint.height);
    const rect=imported?.rect ?? region ?? alphaBounds(this.before);
    if(!rect)throw new Error('변형할 픽셀이 없습니다.');
    this.background=canvas(paint.width,paint.height);ctx(this.background).putImageData(this.before,0,0);
    if(imported){ctx(this.background).clearRect(0,0,paint.width,paint.height);this.source=imported.image;}
    else {
      this.source=canvas(rect.width,rect.height);
      ctx(this.source).putImageData(ctx(this.layer.canvas).getImageData(rect.x,rect.y,rect.width,rect.height),0,0);
      ctx(this.background).clearRect(rect.x,rect.y,rect.width,rect.height);
    }
    this.sourceWidth=imported?.image.naturalWidth ?? rect.width;
    this.sourceHeight=imported?.image.naturalHeight ?? rect.height;
    this.state=this.initial={cx:rect.x+rect.width/2,cy:rect.y+rect.height/2,width:rect.width,height:rect.height,angle:0};
  }
  set(values:Partial<TransformState>) {
    if(this.closed)return;
    const next={...this.state,...values};
    if(!Object.values(next).every(Number.isFinite) || next.width<1 || next.height<1 || next.width>32768 || next.height>32768 || Math.abs(next.cx)>1e6 || Math.abs(next.cy)>1e6 || Math.abs(next.angle)>36000)
      throw new Error('크기는 1~32768px, 각도는 -36000~36000° 범위로 입력하세요.');
    this.state=next;this.touched=true;this.pending=true;this.paint.render();
  }
  resize(axis:'width'|'height',value:number,locked:boolean) {
    const ratio=this.state.width/this.state.height;
    this.set(axis==='width'?{width:value,...(locked?{height:value/ratio}:{})}:{height:value,...(locked?{width:value*ratio}:{})});
  }
  point(x:number,y:number){const p=rotate(x,y,this.state.angle);return {x:this.state.cx+p.x,y:this.state.cy+p.y};}
  hit(x:number,y:number){const p=rotate(x-this.state.cx,y-this.state.cy,-this.state.angle);return Math.abs(p.x)<=this.state.width/2 && Math.abs(p.y)<=this.state.height/2;}
  begin(handle:TransformHandle,x:number,y:number){this.drag={handle,x,y,state:{...this.state}};}
  update(x:number,y:number,locked:boolean) {
    const d=this.drag;if(!d)return;const s=d.state;
    if(d.handle==='move'){this.set({cx:s.cx+x-d.x,cy:s.cy+y-d.y});return;}
    if(d.handle==='rotate'){
      this.set({angle:s.angle+(Math.atan2(y-s.cy,x-s.cx)-Math.atan2(d.y-s.cy,d.x-s.cx))*180/Math.PI});return;
    }
    const [sx,sy]=signs[d.handle],opposite=rotate(-sx*s.width/2,-sy*s.height/2,s.angle);
    const anchor={x:s.cx+opposite.x,y:s.cy+opposite.y},p=rotate(x-anchor.x,y-anchor.y,-s.angle);
    let width=Math.max(1,sx*p.x),height=Math.max(1,sy*p.y);
    if(locked){const scale=Math.max(width/s.width,height/s.height);width=s.width*scale;height=s.height*scale;}
    const center=rotate(sx*width/2,sy*height/2,s.angle);
    this.set({width,height,cx:anchor.x+center.x,cy:anchor.y+center.y});
  }
  endDrag(cancelled=false){if(cancelled && this.drag)this.set(this.drag.state);this.drag=null;}
  flush(){
    if(this.closed||!this.pending)return;
    const g=ctx(this.layer.canvas),s=this.state;
    g.clearRect(0,0,this.paint.width,this.paint.height);g.drawImage(this.background,0,0);
    g.save();g.translate(s.cx,s.cy);g.rotate(s.angle*Math.PI/180);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
    g.drawImage(this.source,-s.width/2,-s.height/2,s.width,s.height);g.restore();this.pending=false;
  }
  finish(){
    if(this.closed)return;
    try {
      this.flush();
      if(this.touched){
        const after=ctx(this.layer.canvas).getImageData(0,0,this.paint.width,this.paint.height),before=this.before,layer=this.layer;
        if(before.data.some((v,i)=>v!==after.data[i]))this.paint.commit({label:'자유 변형',layers:[layer],bytes:before.data.byteLength+after.data.byteLength,
          undo:()=>ctx(layer.canvas).putImageData(before,0,0),redo:()=>ctx(layer.canvas).putImageData(after,0,0)});
      }
    }catch(e){ctx(this.layer.canvas).putImageData(this.before,0,0);throw e;}
    finally{this.dispose();this.paint.render();}
  }
  cancel(){if(this.closed)return;ctx(this.layer.canvas).putImageData(this.before,0,0);this.dispose();this.paint.render();}
  private dispose(){this.closed=true;this.background.width=this.background.height=0;if(this.source instanceof HTMLCanvasElement)this.source.width=this.source.height=0;this.drag=null;}
}
