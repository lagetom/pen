import {test,expect,Page} from '@playwright/test';
import { openGuides } from './ui';
async function dot(page:Page,x:number,y:number){const r=(await page.locator('#paper').boundingBox())!,z=await page.evaluate(()=>(window as any).__paint.zoom);await page.mouse.click(r.x+x*z,r.y+y*z);}
async function setRange(page:Page,id:string,value:string){await page.locator(`#${id}`).fill(value);await page.locator(`#${id}`).dispatchEvent('input');}
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>!!(window as any).__paint);await openGuides(page);});
test('연필 점 25회·작은 원 25회 실제 포인터 입력',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#brushTool').selectOption('pencil');
  for(let i=0;i<25;i++)await dot(page,80+i%20*24,80+Math.floor(i/20)*24);
  const r=(await page.locator('#paper').boundingBox())!,z=await page.evaluate(()=>(window as any).__paint.zoom);
  for(let i=0;i<25;i++){const x=90+i%20*24,y=270+Math.floor(i/20)*24;await page.mouse.move(r.x+(x+6)*z,r.y+y*z);await page.mouse.down();for(let j=1;j<=12;j++)await page.mouse.move(r.x+(x+Math.cos(j/12*Math.PI*2)*6)*z,r.y+(y+Math.sin(j/12*Math.PI*2)*6)*z);await page.mouse.up();}
  const result=await page.evaluate(()=>{const p=(window as any).__paint,c=p.app.selected.canvas.getContext('2d');let missing=0;for(let i=0;i<25;i++){for(const [x,y]of[[80+i%20*24,80+Math.floor(i/20)*24],[96+i%20*24,270+Math.floor(i/20)*24]]){const data=c.getImageData(x-2,y-2,5,5).data;if(!data.some((n:number,k:number)=>k%4===3&&n>0))missing++;}}return {missing,undo:p.app.history.past.length,memory:p.app.history.bytes,maxRender:Math.max(...p.metrics.frames),meanInput:p.metrics.latencies.reduce((a:number,b:number)=>a+b,0)/p.metrics.latencies.length};});
  expect(result.missing).toBe(0);expect(result.undo).toBe(50);expect(result.memory).toBeLessThanOrEqual(128*1048576);expect(errors).toEqual([]);console.log('Pencil pointer measurements:',result);await page.screenshot({path:'test-results/pencil-input.png'});
});
test('고정 시드·분할 입력·렌더 횟수 재현성, 농도 차이와 겹침 누적',async({page})=>{
  const result=await page.evaluate(async()=>{
    const {Paint}=await import('/src/engine.ts');
    function draw(kind:'pencil'|'dark-pencil',split=false,flush=false){const p=new Paint();p.reset(256,256);p.begin(30,100,24,'#283747',1,false,kind);if(split){for(let x=31;x<=75;x++){p.point(x,100);if(flush)p.flush();}}else p.point(75,100);p.end();return p;}
    const a=draw('pencil'),b=draw('pencil',true),c=draw('pencil',true,true),dark=draw('dark-pencil');
    const signature=(p:any)=>p.selected.canvas.toDataURL();const amount=(p:any)=>p.selected.canvas.getContext('2d').getImageData(0,0,256,256).data.reduce((n:number,v:number,i:number)=>n+(i%4===3?v:0),0);
    const before=amount(a);a.begin(30,100,24,'#283747',1,false,'pencil');a.point(75,100);a.end();
    return {same:signature(b)===signature(c),segmented:signature(b)===signature(draw('pencil')),repeat:signature(b)===signature(draw('pencil')),base:before,dark:amount(dark),overlap:amount(a)};
  });expect(result.same).toBe(true);expect(result.segmented).toBe(true);expect(result.repeat).toBe(true);expect(result.dark).toBeGreaterThan(result.base);expect(result.overlap).toBeGreaterThan(result.base);
});
test('연필·진한 연필 Undo/Redo·저장/열기 픽셀 보존, 취소 복원',async({page})=>{
  const result=await page.evaluate(async()=>{const {Paint}=await import('/src/engine.ts');const p=new Paint();p.reset(256,256);p.begin(127,127,32,'#ee6c55',.65,false,'pencil');p.point(180,150);p.end();p.begin(80,80,24,'#283747',1,false,'dark-pencil');p.point(170,180);p.end();const before=p.selected.canvas.toDataURL();p.history.undo();p.history.redo();const after=p.selected.canvas.toDataURL();const loaded=new Paint();loaded.load(await loaded.decode(await p.serialize('연필')));p.begin(50,50,60,'#000000',1,false,'dark-pencil');p.point(100,100);p.flush();p.cancel();return {undo:before===after,load:before===loaded.selected.canvas.toDataURL(),cancel:before===p.selected.canvas.toDataURL()};});expect(result).toEqual({undo:true,load:true,cancel:true});
});
test('가이드 설정이 픽셀·레이어·Undo/Redo 분기에 영향을 주지 않음',async({page})=>{
  await dot(page,100,100);await page.keyboard.press('Control+z');
  const before=await page.evaluate(()=>{const a=(window as any).__paint.app;return {pixels:a.selected.canvas.toDataURL(),layers:a.layers.length,past:a.history.past.length,future:a.history.future.length};});
  for(const type of ['grid','ruled','dots','none']){await page.locator('#guideType').selectOption(type);await setRange(page,'guideSpacing','48');await setRange(page,'guideOpacity','70');await page.locator('#guideColor').selectOption('gray');await page.locator('#guideVisible').uncheck();await page.locator('#guideVisible').check();}
  const after=await page.evaluate(()=>{const a=(window as any).__paint.app;return {pixels:a.selected.canvas.toDataURL(),layers:a.layers.length,past:a.history.past.length,future:a.history.future.length};});expect(after).toEqual(before);await page.keyboard.press('Control+y');expect(await page.evaluate(()=>(window as any).__paint.app.selected.canvas.getContext('2d').getImageData(100,100,1,1).data[3])).toBe(255);
});
test('가이드 실제 격자 좌표는 확대·화면 이동과 일치하고 포인터를 통과시킴',async({page})=>{
  await page.locator('#whiteBackground').check();await page.locator('#guideType').selectOption('grid');await setRange(page,'guideSpacing','32');await setRange(page,'guideOpacity','80');
  for(const zoom of [1,4]){
    await page.evaluate(zoom=>{const r=document.getElementById('paper')!.getBoundingClientRect(),s=document.getElementById('stage')!.getBoundingClientRect();(window as any).__paint.setZoom(zoom,r.x-s.x,r.y-s.y);},zoom);await page.mouse.move(20,20);
    const r=(await page.locator('#paper').boundingBox())!;const screenshot=await page.screenshot();
    const colors=await page.evaluate(async({png,x,y,zoom})=>{const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;img.src=png;});const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d')!;g.drawImage(img,0,0);return [32,40,64].map(px=>Array.from(g.getImageData(Math.round(x+px*zoom),Math.round(y+16*zoom),1,1).data));},{png:`data:image/png;base64,${screenshot.toString('base64')}`,x:r.x,y:r.y,zoom});
    expect(colors[0][0]).toBeLessThan(245);expect(colors[1].slice(0,3)).toEqual([255,255,255]);expect(colors[2][0]).toBeLessThan(245);
  }
  await expect(page.locator('#guideOverlay')).toHaveCSS('pointer-events','none');
  // Middle-button pan keeps the paper and its CSS overlay in the same transformed coordinate space.
  const before=(await page.locator('#paper').boundingBox())!;await page.mouse.move(before.x+50,before.y+50);await page.mouse.down({button:'middle'});await page.mouse.move(before.x+87,before.y+75);await page.mouse.up({button:'middle'});const after=(await page.locator('#paper').boundingBox())!;expect(after.x-before.x).toBeCloseTo(37);expect(after.y-before.y).toBeCloseTo(25);
  const overlay=(await page.locator('#guideOverlay').boundingBox())!;expect(overlay.x).toBeCloseTo(after.x);expect(overlay.y).toBeCloseTo(after.y);expect(overlay.width).toBeCloseTo(after.width);
  await page.locator('#fit').click();await dot(page,96,96);expect(await page.evaluate(()=>(window as any).__paint.app.selected.canvas.getContext('2d').getImageData(96,96,1,1).data[3])).toBe(255);
});
test('실제 PNG 다운로드에 가이드가 포함되지 않음',async({page})=>{
  await page.locator('#guideType').selectOption('grid');await setRange(page,'guideOpacity','80');await dot(page,100,100);
  const {readFile}=await import('node:fs/promises');
  for(const white of [false,true]){await page.locator('#export').click();await page.locator(`input[name=exportBg][value=${white?'white':'transparent'}]`).check();const pending=page.waitForEvent('download');await page.locator('#downloadPng').click();const data=await readFile((await(await pending).path())!);
    const equal=await page.evaluate(async({png,white})=>{const a=(window as any).__paint.app,img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;img.src=png;});const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d')!;g.drawImage(img,0,0);const actual=g.getImageData(0,0,c.width,c.height).data,expected=a.composite(white).getContext('2d').getImageData(0,0,c.width,c.height).data;return actual.every((v:number,i:number)=>v===expected[i]);},{png:`data:image/png;base64,${data.toString('base64')}`,white});expect(equal).toBe(true);
  }
});
test('프로젝트·자동 복구의 가이드 메타데이터와 기존 v1 기본값',async({page})=>{
  await page.locator('#guideType').selectOption('dots');await setRange(page,'guideSpacing','40');await setRange(page,'guideOpacity','60');await page.locator('#guideColor').selectOption('gray');await dot(page,100,100);
  const project=await page.evaluate(async()=>(window as any).__paint.app.serialize('가이드'));expect(project.version).toBe(1);expect(project.guide).toEqual({type:'dots',visible:true,spacing:40,color:'gray',opacity:.6});
  await page.locator('#guideType').selectOption('none');page.on('dialog',d=>void d.accept());await page.locator('#fileInput').setInputFiles({name:'guide.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await expect(page.locator('#guideType')).toHaveValue('dots');await expect(page.locator('#guideOverlay')).toBeVisible();
  await expect(page.locator('#autoStatus')).toHaveText('자동 저장 완료',{timeout:15000});await page.reload();await page.locator('#restoreRecovery').click();await expect(page.locator('#guideType')).toHaveValue('dots');await expect(page.locator('#guideSpacing')).toHaveValue('40');
  const legacy={...project};delete legacy.guide;await page.locator('#fileInput').setInputFiles({name:'old.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await expect(page.locator('#guideType')).toHaveValue('none');await expect(page.locator('#guideOverlay')).toBeHidden();
  const malformed={...project,guide:{...project.guide,spacing:0}};await page.locator('#fileInput').setInputFiles({name:'bad.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});await expect(page.locator('#toast')).toContainText('가이드 설정');await expect(page.locator('#guideType')).toHaveValue('none');
});
test('1px 연필 점이 정수·소수점 좌표에서 사라지지 않음',async({page})=>{
  const missing=await page.evaluate(async()=>{const {Paint}=await import('/src/engine.ts');const missing:any[]=[];for(const kind of ['pencil','dark-pencil'] as const)for(const size of [1,2,3,8,100])for(const offset of [0,.25,.5,.75]){const p=new Paint();p.reset(128,128);p.begin(64+offset,64+offset,size,'#283747',1,false,kind);p.end();const data=p.selected.canvas.getContext('2d').getImageData(0,0,128,128).data;if(!data.some((v:number,i:number)=>i%4===3&&v))missing.push({kind,size,offset});}return missing;});expect(missing).toEqual([]);
});
