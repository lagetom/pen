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
// Deterministic per-stamp variation. The stamp index advances with distance, so these are functions of arc length only.
function hash(index:number,seed:number){let h=Math.imul(index+1^seed,0x45d9f3b);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>13;return (h>>>0)/4294967296;}
function wave(index:number,period:number,seed:number){const t=index/period,i=Math.floor(t),f=t-i,u=f*f*(3-2*f);return hash(i,seed)*(1-u)+hash(i+1,seed)*u;}
const VARIANTS:Record<BasicBrushKind,number>={'rough-ink':4,'felt-tip':1,ballpoint:1};
// One cache entry per key holds every tip variant side by side.
function acquire(kind:BasicBrushKind,size:number,color:string,amount:number){
  const key=`${kind}:${size}:${color}:${amount}`,cached=tips.get(key);
  if(cached){cached.users++;tips.delete(key);tips.set(key,cached);return cached;}
  const c=document.createElement('canvas'),resolution=Math.min(128,Math.max(16,Math.ceil(size*2))),variants=VARIANTS[kind];c.width=resolution*variants;c.height=resolution;
  const g=c.getContext('2d')!,image=g.createImageData(c.width,resolution);
  g.fillStyle=color;g.fillRect(0,0,1,1);const rgb=g.getImageData(0,0,1,1).data;
  let seed=kind==='rough-ink'?0x519d2b3f:kind==='felt-tip'?0x7a3c91e5:0x2c74af61;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const strength=amount/100,sharp=resolution/2.5;
  for(let variant=0;variant<variants;variant++){
    const p1=random()*6.283,p2=random()*6.283,p3=random()*6.283;
    for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
      const dx=(x+.5-resolution/2)/(resolution/2),dy=(y+.5-resolution/2)/(resolution/2),r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),noise=random();let alpha:number;
      if(kind==='rough-ink'){
        // Nib on paper: solid core, outline bitten inward by lobes that differ per variant.
        const bite=strength*(.16*(.5+.5*Math.sin(3*a+p1))+.12*(.5+.5*Math.sin(7*a+p2))+.08*(.5+.5*Math.sin(13*a+p3))+.1*noise);
        alpha=Math.max(0,Math.min(1,(1-bite-r)*sharp));
      }else if(kind==='felt-tip'){
        // Felt: flat body, then a feather whose width is the softness setting.
        const feather=.2+.55*strength,t=Math.max(0,Math.min(1,(r-(1-feather))/feather)),rim=Math.max(0,Math.min(1,(r-.3)/.4));
        // Water-based ink settles toward the edge: a lighter body, a denser rim, then the feather.
        alpha=r>=1?0:(1-t*t*(3-2*t))*(.3+.7*rim*rim*(3-2*rim));
      }else alpha=Math.max(0,Math.min(1,(1-r)*sharp))*Math.min(1,.3+1.2*r*r*r*r); // ball: hard rim, slightly lighter centre
      const i=(y*c.width+variant*resolution+x)*4;image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];image.data[i+3]=Math.round(alpha*255);
    }
  }
  g.putImageData(image,0,0);const tip={canvas:c,bytes:c.width*resolution*4,users:1};tips.set(key,tip);bytes+=tip.bytes;generated++;trim();return tip;
}

// Sampling phase is independent of event segmentation, duplicates and render frames.
export class InkStampStroke {
  private tip:Tip;private untilNext:number;private step:number;private index=0;private closed=false;private strength:number;private cell:number;private origin:[number,number];
  constructor(private context:CanvasRenderingContext2D,private x:number,private y:number,private size:number,private kind:BasicBrushKind,color:string,amount:number){
    this.origin=[x,y];this.tip=acquire(kind,size,color,amount);this.cell=this.tip.canvas.height;this.strength=amount/100;
    this.step=Math.max(.25,size*(kind==='rough-ink'?.16:kind==='felt-tip'?.1:.2));this.untilNext=this.step;
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    try{this.stamp(x,y,0);}catch(e){this.release();throw e;}
  }
  private stamp(x:number,y:number,index:number){
    let size=this.size,variant=0,alpha=1;const k=this.strength;
    if(this.kind==='rough-ink'&&this.size>1){
      // Ink flow: slow width drift plus per-stamp bite. The slack left by a smaller stamp is spent on a
      // sideways offset, so both outlines wander independently while staying inside the nominal width.
      const shrink=(.08+.85*k)*(.7*wave(index,11,0x9e3779b9)+.3*hash(index,0x85ebca6b));
      size=this.size*(1-shrink);variant=Math.floor(hash(index,0xc2b2ae35)*VARIANTS['rough-ink']);
      const slack=(this.size-size)/2,angle=hash(index,0x27d4eb2f)*6.2831853;x+=Math.cos(angle)*slack;y+=Math.sin(angle)*slack;
    }else if(this.kind==='felt-tip'){
      // Low per-stamp density keeps the body slightly translucent under a denser rim and a smooth feather.
      alpha=.42;size=this.size*(1-.04*wave(index,29,0x165667b1));
    }else if(this.kind==='ballpoint'){
      // Oil ink: density drifts along the line and the ball occasionally skips.
      const drift=wave(index,26,0x45d9f3b),skip=wave(index,6,0x119de1f3)<.16?1:0,depth=Math.min(1,.3+2.2*k);
      alpha=.66*(1-.45*depth*drift)*(1-.75*depth*skip);
    }
    const left=this.size===1?Math.round(x-.5):Math.round((x-size/2)*256)/256,top=this.size===1?Math.round(y-.5):Math.round((y-size/2)*256)/256;
    this.context.globalAlpha=alpha;this.context.drawImage(this.tip.canvas,variant*this.cell,0,this.cell,this.cell,left,top,size,size);this.context.globalAlpha=1;
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
  /** A tap rests the tip on the paper: build the lone first stamp up to the density of a drawn line. Returns true if it drew. */
  settle(){
    const extra=this.kind==='felt-tip'?7:this.kind==='ballpoint'?5:0;if(this.closed||this.index||!extra)return false;
    for(let i=0;i<extra;i++)this.stamp(this.origin[0],this.origin[1],0);return true;
  }
  release(){if(this.closed)return;this.closed=true;this.tip.users--;trim();}
}
