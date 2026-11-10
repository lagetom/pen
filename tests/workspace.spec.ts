import { test, expect, type Page } from '@playwright/test';
import { menu } from './ui';

async function ready(page: Page) { await page.waitForFunction(() => !!(window as any).__paint && !(window as any).__paint.busy); }
async function point(page: Page, x: number, y: number) {
  return page.evaluate(({x,y}) => { const p=(window as any).__paint,r=document.getElementById('paper')!.getBoundingClientRect();return {x:r.x+x*p.zoom,y:r.y+y*p.zoom}; }, {x,y});
}
async function stroke(page: Page, a: [number,number], b: [number,number]) {
  const from=await point(page,...a),to=await point(page,...b);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:4});await page.mouse.up();
}
const history = (page: Page) => page.evaluate(() => (window as any).__paint.app.history.past.length);
test.beforeEach(async ({page}) => { await page.goto('/'); await ready(page); await menu(page,'new'); await page.locator('#newWidth').fill('128'); await page.locator('#newHeight').fill('96'); await page.locator('#createDocument').click(); });

test('메뉴: 열기·닫기·대상 컨트롤 상태 반영·명령 실행', async ({page}) => {
  const file=page.locator('.menu-button',{hasText:'파일'}),edit=page.locator('.menu-button',{hasText:'편집'});
  await expect(page.locator('#new')).toBeHidden();await file.click();await expect(page.locator('#new')).toBeVisible();await expect(file).toHaveAttribute('aria-expanded','true');
  await edit.hover();await expect(page.locator('#new')).toBeHidden();await expect(page.locator('[data-run=undo]')).toBeVisible();await expect(page.locator('[data-run=undo]')).toBeDisabled();
  await page.keyboard.press('Escape');await expect(page.locator('[data-run=undo]')).toBeHidden();await expect(edit).toHaveAttribute('aria-expanded','false');
  await file.click();await page.locator('#statusText').click();await expect(page.locator('#new')).toBeHidden();await expect(file).toHaveAttribute('aria-expanded','false');
  await stroke(page,[20,20],[40,20]);expect(await history(page)).toBe(1);
  await edit.click();await expect(page.locator('[data-run=undo]')).toBeEnabled();await expect(page.locator('[data-run=copySelection]')).toBeDisabled();await page.locator('[data-run=undo]').click();
  expect(await history(page)).toBe(0);await expect(page.locator('[data-run=undo]')).toBeHidden();
  await edit.click();await page.locator('[data-run=selectAll]').click();expect(await page.evaluate(()=>(window as any).__paint.selection)).toEqual({x:0,y:0,width:128,height:96});await expect(page.locator('#select')).toHaveAttribute('aria-pressed','true');
  const view=page.locator('.menu-button',{hasText:'보기'});await view.click();await expect(page.locator('[data-run=mirrorView]')).toHaveAttribute('aria-checked','false');await page.locator('[data-run=mirrorView]').click();
  expect(await page.evaluate(()=>(window as any).__paint.mirrored)).toBe(true);await view.click();await expect(page.locator('[data-run=mirrorView]')).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');
  await page.locator('.menu-button',{hasText:'레이어'}).click();await page.locator('[data-run=addLayer]').click();await expect(page.locator('#layerCount')).toHaveText('2');
});

test('다른 이름으로 저장 메뉴는 Ctrl+Shift+S와 같은 경로', async ({page}) => {
  await page.evaluate(()=>{delete (window as any).showSaveFilePicker;});
  const messages:string[]=[];page.on('dialog',d=>{messages.push(d.message());void d.dismiss();});
  await menu(page,'saveAs');await expect.poll(()=>messages).toEqual(['프로젝트 파일 이름']);
});

test('설정 막대는 선택한 도구의 설정만 한 줄 고정 높이로 표시', async ({page}) => {
  const groups=['brushSizeOptions','opacityOptions','textureOptions','bucketOptions','selectOptions','moveOptions','moveTransform','toolSetMenu'];
  const expected:Record<string,string[]>={
    pen:['brushSizeOptions','opacityOptions','toolSetMenu'],pencil:['brushSizeOptions','opacityOptions','toolSetMenu'],'dark-pencil':['brushSizeOptions','opacityOptions','toolSetMenu'],eraser:['brushSizeOptions','opacityOptions','toolSetMenu'],
    'rough-ink':['brushSizeOptions','opacityOptions','textureOptions','toolSetMenu'],'felt-tip':['brushSizeOptions','opacityOptions','textureOptions','toolSetMenu'],ballpoint:['brushSizeOptions','opacityOptions','textureOptions','toolSetMenu'],
    bucket:['opacityOptions','bucketOptions'],select:['selectOptions'],'move-layer':['moveTransform'],'move-artwork':['moveOptions'],eyedropper:[],hand:[],
  };
  const stageTop=(await page.locator('#stage').boundingBox())!.y;
  for(const [tool,visible] of Object.entries(expected)){
    await page.locator(`#${tool}`).click();await expect(page.locator('#brushTool')).toHaveValue(tool);
    expect(await page.evaluate(ids=>ids.filter(id=>!document.getElementById(id)!.hidden),groups)).toEqual(visible);
    expect(await page.locator('.tool[aria-pressed=true]').evaluateAll(els=>els.map(el=>el.id))).toEqual([tool]);
    expect((await page.locator('#toolOptions').boundingBox())!.height).toBe(40);expect((await page.locator('#stage').boundingBox())!.y).toBe(stageTop);
  }
  await page.locator('#bucket').click();await page.locator('#bucketToleranceRange').fill('37');await expect(page.locator('#bucketTolerance')).toHaveValue('37');expect(await page.evaluate(()=>(window as any).__paint.toolPreferences.bucket.tolerance)).toBe(37);
  await page.locator('#bucketTolerance').fill('12');await expect(page.locator('#bucketToleranceRange')).toHaveValue('12');
  await page.locator('#pen').click();await stroke(page,[20,20],[60,40]);await page.locator('#move-layer').click();await page.locator('#moveTransform').click();
  await expect(page.locator('#transformControls')).toBeVisible();await expect(page.locator('#toolOptions')).toBeHidden();expect((await page.locator('#stage').boundingBox())!.y).toBe(stageTop);
  await page.keyboard.press('Escape');await expect(page.locator('#toolOptions')).toBeVisible();await expect(page.locator('#moveTransform')).toBeVisible();
});

test('컷 패널 접기·높이 조절·범위·취소·복원, 도구 이름 표시 복원', async ({page}) => {
  const panel=page.locator('#cutPanel'),handle=page.locator('#cutResize'),height=async()=>(await panel.boundingBox())!.height;
  expect(await height()).toBe(124);
  let box=(await handle.boundingBox())!;await page.mouse.move(box.x+200,box.y+3);await page.mouse.down();await page.mouse.move(box.x+200,box.y-57);await page.mouse.up();expect(await height()).toBe(184);
  box=(await handle.boundingBox())!;await page.mouse.move(box.x+200,box.y+3);await page.mouse.down();await page.mouse.move(box.x+200,box.y-900);await page.mouse.up();expect(await height()).toBe(320);
  await handle.focus();for(let i=0;i<20;i++)await page.keyboard.press('ArrowDown');expect(await height()).toBe(96);await page.keyboard.press('ArrowUp');expect(await height()).toBe(112);
  box=(await handle.boundingBox())!;await page.mouse.move(box.x+200,box.y+3);await page.mouse.down();await page.mouse.move(box.x+200,box.y-40);await handle.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();expect(await height()).toBe(112);
  const stageBefore=(await page.locator('#stage').boundingBox())!.height;
  await page.locator('#toggleCuts').click();await expect(page.locator('#cutList')).toBeHidden();await expect(page.locator('#addCut')).toBeVisible();expect((await page.locator('#stage').boundingBox())!.height).toBeGreaterThan(stageBefore);
  await expect(page.locator('#pen .tool-name')).toBeVisible();await menu(page,'toggleRailLabels');await expect(page.locator('#pen .tool-name')).toBeHidden();await expect(page.locator('#pen')).toBeVisible();await expect(page.locator('#pen')).toHaveAttribute('title','펜 (B)');
  await expect(page.locator('#autoStatus')).toHaveText('자동 저장 완료',{timeout:10000});page.on('dialog',d=>void d.accept());await page.reload();await ready(page);await page.locator('#discardRecovery').click();
  await expect(page.locator('#cutList')).toBeHidden();await expect(page.locator('#toggleCuts')).toHaveAttribute('aria-expanded','false');await expect(page.locator('#pen .tool-name')).toBeHidden();
  await page.locator('#addCut').click();await ready(page);await expect(page.locator('#cutCount')).toHaveText('2');
  await page.locator('.menu-button',{hasText:'보기'}).click();await expect(page.locator('[data-run=toggleCuts]')).toHaveAttribute('aria-checked','false');await page.locator('[data-run=toggleCuts]').click();
  await expect(page.locator('.cut-card')).toHaveCount(2);expect(await height()).toBe(112);
});

test('잘못 저장된 화면 설정은 기본값으로 시작', async ({page}) => {
  await page.evaluate(()=>{localStorage.setItem('mini-paint-workspace-v1','{"cutHeight":"x","cutCollapsed":1,"railLabels":"yes"');});
  page.on('dialog',d=>void d.accept());await page.reload();await ready(page);expect((await page.locator('#cutPanel').boundingBox())!.height).toBe(124);await expect(page.locator('#cutList')).toBeVisible();
  await page.evaluate(()=>{localStorage.setItem('mini-paint-workspace-v1',JSON.stringify({cutHeight:9999,cutCollapsed:false,railLabels:null}));});
  await page.reload();await ready(page);expect((await page.locator('#cutPanel').boundingBox())!.height).toBe(320);
});

test('획을 그리는 동안 패널 DOM을 다시 만들지 않음', async ({page}) => {
  await page.locator('#addCut').click();await ready(page);await page.locator('#addLayer').click();await stroke(page,[10,10],[30,10]);
  await expect(page.locator('.cut-card[aria-pressed=true] img')).toHaveAttribute('src',/^data:image\/png/);
  await page.evaluate(()=>{
    const w=window as any;w.__mutations=[];w.__cards=[...document.querySelectorAll('.cut-card')];w.__rows=[...document.querySelectorAll('.layer-row')];
    new MutationObserver(list=>{for(const m of list){const el=(m.target.nodeType===1?m.target:m.target.parentElement) as HTMLElement;w.__mutations.push(`${m.type}:${el.id||el.className||el.nodeName}`);}})
      .observe(document.getElementById('workspace')!,{subtree:true,childList:true,attributes:true,characterData:true});
  });
  const from=await point(page,20,40),to=await point(page,90,60);await page.mouse.move(from.x,from.y);await page.mouse.down();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.evaluate(()=>{(window as any).__mutations.length=0;});
  await page.mouse.move(to.x,to.y,{steps:12});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  // While the pointer is down only pointer feedback (coordinates text, cursor transform) may change.
  expect(await page.evaluate(()=>(window as any).__mutations.filter((m:string)=>!/:(coordinates|brushCursor)$/.test(m)))).toEqual([]);
  await page.mouse.up();await expect(page.locator('#statusText')).toHaveText('준비');
  expect(await page.evaluate(()=>{const w=window as any;return [...document.querySelectorAll('.cut-card')].every((el,i)=>el===w.__cards[i])&&[...document.querySelectorAll('.layer-row')].every((el,i)=>el===w.__rows[i]);})).toBe(true);
  expect(await history(page)).toBe(3);
});
