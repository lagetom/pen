// Sample the canonical raster viewport, before CSS reflection, guides, or the display background.
// Reusing the actual composite avoids extra allocations and different blend rounding in a 1px canvas.
export function sampleColor(composite:HTMLCanvasElement,x:number,y:number):string|null{
  x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=composite.width||y>=composite.height)return null;
  const pixel=composite.getContext('2d')!.getImageData(x,y,1,1).data;
  return pixel[3]?`#${[...pixel.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join('')}`:null;
}
