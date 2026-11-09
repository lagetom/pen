import {canvas,ctx,type Paint,type Layer} from './engine';
function idle(paint:Paint){if(paint.stroke)throw new Error('획을 마친 뒤 레이어를 편집하세요.');}
function commitPixels(paint:Paint,layer:Layer,before:ImageData,after:ImageData,label:string){
  if(!before.data.some((v,i)=>v!==after.data[i]))return;
  ctx(layer.canvas).putImageData(after,0,0);
  paint.commit({label,layers:[layer],bytes:before.data.byteLength+after.data.byteLength,undo:()=>ctx(layer.canvas).putImageData(before,0,0),redo:()=>ctx(layer.canvas).putImageData(after,0,0)});
}
export function flipLayer(paint:Paint){
  idle(paint);const layer=paint.selected,before=ctx(layer.canvas).getImageData(0,0,paint.width,paint.height),after=new ImageData(paint.width,paint.height);
  const source=new Uint32Array(before.data.buffer,before.data.byteOffset,before.data.byteLength/4),target=new Uint32Array(after.data.buffer);
  for(let y=0;y<paint.height;y++)for(let x=0;x<paint.width;x++)target[y*paint.width+x]=source[y*paint.width+paint.width-1-x];
  commitPixels(paint,layer,before,after,'레이어 좌우 반전');
}
export function duplicateLayer(paint:Paint){
  idle(paint);if(paint.layers.length>=50||(paint.layers.length+1)*paint.width*paint.height>128e6)throw new Error('레이어 개수 또는 메모리 한도를 초과합니다.');
  const source=paint.selected,layer=paint.makeLayer(`${source.name} 복사`);layer.imageSource=source.imageSource?{...source.imageSource}:undefined;layer.visible=source.visible;layer.opacity=source.opacity;
  ctx(layer.canvas).putImageData(ctx(source.canvas).getImageData(0,0,paint.width,paint.height),0,0);
  paint.structure('레이어 복제',()=>{paint.layers.splice(paint.layers.indexOf(source)+1,0,layer);paint.active=layer.id;},paint.width*paint.height*4);
}
export class LayerMove {
  private layer:Layer;private before:ImageData;private original:HTMLCanvasElement;
  private dx=0;private dy=0;private pending=false;private closed=false;
  constructor(private paint:Paint,private startX:number,private startY:number){
    idle(paint);this.layer=paint.selected;if(!this.layer.visible||!this.layer.opacity)throw new Error('표시된 레이어를 선택하세요.');
    this.before=ctx(this.layer.canvas).getImageData(0,0,paint.width,paint.height);this.original=canvas(paint.width,paint.height);ctx(this.original).putImageData(this.before,0,0);
  }
  update(x:number,y:number){if(this.closed||!Number.isFinite(x+y))return;const dx=Math.round(x-this.startX),dy=Math.round(y-this.startY);if(dx===this.dx&&dy===this.dy)return;this.dx=dx;this.dy=dy;this.pending=true;this.paint.render();}
  flush(){if(!this.pending||this.closed)return;const g=ctx(this.layer.canvas);g.clearRect(0,0,this.paint.width,this.paint.height);g.drawImage(this.original,this.dx,this.dy);this.pending=false;}
  finish(){if(this.closed)return;this.flush();try{const after=ctx(this.layer.canvas).getImageData(0,0,this.paint.width,this.paint.height);commitPixels(this.paint,this.layer,this.before,after,'레이어 이동');}catch(e){ctx(this.layer.canvas).putImageData(this.before,0,0);throw e;}finally{this.dispose();this.paint.render();}}
  cancel(){if(this.closed)return;ctx(this.layer.canvas).putImageData(this.before,0,0);this.dispose();this.paint.render();}
  private dispose(){this.original.width=this.original.height=0;this.closed=true;}
}
