export const BASIC_BRUSHES=['rough-ink','felt-tip','ballpoint'] as const;
export type BasicBrushKind=typeof BASIC_BRUSHES[number];
export type BrushTexture={version:1;amount:number};
export const BASIC_DEFAULTS={
  'rough-ink':{size:8,opacity:1,texture:{version:1,amount:35}},
  'felt-tip':{size:12,opacity:1,texture:{version:1,amount:35}},
  ballpoint:{size:3,opacity:.9,texture:{version:1,amount:20}},
} as const;
export function isBasicBrush(value:string):value is BasicBrushKind{return (BASIC_BRUSHES as readonly string[]).includes(value);}
export function readTexture(kind:BasicBrushKind,raw:any):BrushTexture{
  if(raw===undefined)return {...BASIC_DEFAULTS[kind].texture};
  if(raw?.version!==1||!Number.isInteger(raw.amount)||raw.amount<0||raw.amount>100)throw new Error('브러시 질감은 0~100 정수로 지정하세요.');
  return {version:1,amount:raw.amount};
}
type Tip={canvas:HTMLCanvasElement;bytes:number;users:number};
const tips=new Map<string,Tip>();const MAX_BYTES=2*1024*1024,MAX_TIPS=24;
let bytes=0,generated=0;
function trim(all=false){for(const [key,tip]of tips){if(!all&&bytes<=MAX_BYTES&&tips.size<=MAX_TIPS)break;if(tip.users)continue;tips.delete(key);bytes-=tip.bytes;tip.canvas.width=tip.canvas.height=0;}}
export function clearBasicBrushCache(){trim(true);}
export function basicBrushCacheStats(){return {entries:tips.size,bytes,generated,pinned:[...tips.values()].reduce((n,t)=>n+t.users,0),limit:MAX_BYTES};}
function acquire(kind:'rough-ink'|'ballpoint',size:number,color:string,amount:number){
  const key=`${kind}:${size}:${color}:${amount}`,cached=tips.get(key);
  if(cached){cached.users++;tips.delete(key);tips.set(key,cached);return cached;}
  const c=document.createElement('canvas'),resolution=Math.min(192,Math.max(16,Math.ceil(size*2)));c.width=c.height=resolution;
  const g=c.getContext('2d')!,image=g.createImageData(resolution,resolution);
  g.fillStyle=color;g.fillRect(0,0,1,1);const rgb=g.getImageData(0,0,1,1).data;
  let seed=kind==='rough-ink'?0x519d2b3f:0x2c74af61;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const strength=amount/100;
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const dx=(x+.5-resolution/2)/(resolution/2),dy=(y+.5-resolution/2)/(resolution/2),r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),noise=random();
    const edgeOffset=kind==='rough-ink'?strength*(.025*Math.sin(11*a+.7)+.015*Math.sin(19*a)+.025*(noise-.5)):0;
    const edge=Math.max(0,Math.min(1,(1-r+edgeOffset)*(kind==='rough-ink'?18:10)));
    // Solid ink core; mild edge variation. Ballpoint density noise is deliberately small.
    const alpha=kind==='rough-ink'?edge:edge*(.76+(noise-.5)*.12*strength);
    const i=(y*resolution+x)*4;image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];image.data[i+3]=Math.round(alpha*255);
  }
  g.putImageData(image,0,0);const tip={canvas:c,bytes:resolution*resolution*4,users:1};tips.set(key,tip);bytes+=tip.bytes;generated++;trim();return tip;
}

// Sampling phase is independent of event segmentation, duplicates and render frames.
export class InkStampStroke {
  private tip:Tip;private untilNext:number;private step:number;private index=0;private closed=false;
  constructor(private context:CanvasRenderingContext2D,private x:number,private y:number,private size:number,private kind:'rough-ink'|'ballpoint',color:string,private amount:number){
    this.tip=acquire(kind,size,color,amount);this.step=Math.max(.25,size*(kind==='rough-ink'?.16:.14));this.untilNext=this.step;
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    try{this.stamp(x,y,0);}catch(e){this.release();throw e;}
  }
  private stamp(x:number,y:number,index:number){
    const left=this.size===1?Math.round(x-.5):Math.round((x-this.size/2)*256)/256,top=this.size===1?Math.round(y-.5):Math.round((y-this.size/2)*256)/256;
    if(this.kind==='ballpoint'){
      const hash=Math.imul(index+1,0x45d9f3b)>>>0;
      this.context.globalAlpha=1-(hash%1024)/1023*.06*this.amount/100;
    }
    this.context.drawImage(this.tip.canvas,left,top,this.size,this.size);this.context.globalAlpha=1;
  }
  point(x:number,y:number){
    if(this.closed)return;const dx=x-this.x,dy=y-this.y,length=Math.hypot(dx,dy);if(!length)return;
    let start=0,end=1;const radius=this.size/2+1;
    for(const [position,delta,low,high]of [[this.x,dx,-radius,this.context.canvas.width+radius],[this.y,dy,-radius,this.context.canvas.height+radius]]){
      if(!delta){if(position<low||position>high){end=-1;break;}}
      else{const a=(low-position)/delta,b=(high-position)/delta;start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b));}
    }
    if(start<=end){const skip=Math.max(0,Math.ceil((start*length-this.untilNext)/this.step-1e-9));let n=skip;
      for(let d=this.untilNext+skip*this.step;d<=end*length+1e-9;d+=this.step,n++)this.stamp(this.x+dx*d/length,this.y+dy*d/length,this.index+n+1);
    }
    const count=length+1e-9>=this.untilNext?Math.floor((length-this.untilNext+1e-9)/this.step)+1:0;
    this.index+=count;this.untilNext+=count*this.step-length;this.x=x;this.y=y;
  }
  release(){if(this.closed)return;this.closed=true;this.tip.users--;trim();}
}

// Reuses the pen's circular path geometry, with a narrow translucent outer edge.
export function feltPath(g:CanvasRenderingContext2D,x:number,y:number,previousX:number,previousY:number,size:number,dot:boolean,texture:BrushTexture){
  const softness=texture.amount/100;
  for(const [width,alpha]of [[size,.28],[size*(1-.18*softness),1]]){
    g.globalAlpha=alpha;g.lineWidth=width;g.beginPath();
    if(dot){g.arc(x,y,width/2,0,Math.PI*2);g.fill();}
    else if(x!==previousX||y!==previousY){g.moveTo(previousX,previousY);g.lineTo(x,y);g.stroke();}
  }
  g.globalAlpha=1;
}
