import { ctx, type Paint } from './engine';
import type { Rect } from './selection';

export class InvertPreview {
  private layer; private before:ImageData; private after:ImageData; private closed=false;
  readonly changed:boolean;
  private region:Rect;
  constructor(private paint:Paint,region:Rect|null){
    if(paint.stroke)throw new Error('획을 마친 뒤 반전하세요.');
    this.layer=paint.selected;this.region=region??{x:0,y:0,width:paint.width,height:paint.height};const r=this.region;
    this.before=ctx(this.layer.canvas).getImageData(r.x,r.y,r.width,r.height);
    this.after=new ImageData(new Uint8ClampedArray(this.before.data),r.width,r.height);
    let changed=false;for(let i=0;i<this.after.data.length;i+=4)if(this.after.data[i+3]){for(let c=0;c<3;c++)this.after.data[i+c]=255-this.before.data[i+c];changed=true;}
    this.changed=changed;ctx(this.layer.canvas).putImageData(this.after,r.x,r.y);paint.render();
  }
  finish(){
    if(this.closed)return;this.closed=true;if(!this.changed)return;
    const {before,after,layer,region:r}=this;
    this.paint.commit({label:'RGB 색상 반전',layers:[layer],bytes:before.data.byteLength+after.data.byteLength,undo:()=>ctx(layer.canvas).putImageData(before,r.x,r.y),redo:()=>ctx(layer.canvas).putImageData(after,r.x,r.y)});
  }
  cancel(){if(this.closed)return;this.closed=true;ctx(this.layer.canvas).putImageData(this.before,this.region.x,this.region.y);this.paint.render();}
}
