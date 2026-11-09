// View-only transforms never modify pixels, project metadata, or history.
export function paperTransform(width:number,zoom:number,panX:number,panY:number,mirrored:boolean){
  return `translate(${panX+(mirrored?width*zoom:0)}px, ${panY}px) scale(${mirrored?-zoom:zoom}, ${zoom})`;
}
export function canvasPoint(event:{clientX:number;clientY:number},rect:{left:number;top:number},zoom:number,width:number,mirrored:boolean){
  const x=(event.clientX-rect.left)/zoom;return {x:mirrored?width-x:x,y:(event.clientY-rect.top)/zoom};
}
