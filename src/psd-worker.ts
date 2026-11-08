import { writePsd, type Psd } from 'ag-psd';
export type PsdPixels={width:number;height:number;data:Uint8ClampedArray};
export type PsdJob={width:number;height:number;dpi:number;composite:PsdPixels;layers:{name:string;visible:boolean;opacity:number;pixels:PsdPixels}[]};
self.onmessage=(event:MessageEvent<PsdJob>)=>{
  try{
    const job=event.data;self.postMessage({type:'progress',text:'PSD 레이어 인코딩',value:65});
    // ag-psd children are bottom-to-top, matching Paint.layers. No Canvas/DOM is needed.
    const psd:Psd={width:job.width,height:job.height,bitsPerChannel:8,colorMode:3,imageData:job.composite,
      imageResources:{resolutionInfo:{horizontalResolution:job.dpi,verticalResolution:job.dpi,horizontalResolutionUnit:'PPI',verticalResolutionUnit:'PPI',widthUnit:'Centimeters',heightUnit:'Centimeters'}},
      children:job.layers.map(l=>({name:l.name,hidden:!l.visible,opacity:l.opacity,blendMode:'normal',left:0,top:0,imageData:l.pixels}))};
    const buffer=writePsd(psd,{generateThumbnail:false,trimImageData:false,noBackground:true});
    (self as any).postMessage({type:'done',buffer},[buffer]);
  }catch(e){self.postMessage({type:'error',message:e instanceof Error?e.message:String(e)});}
};
