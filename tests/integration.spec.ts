import {test,expect,Page} from '@playwright/test';
import { openGuides } from './ui';
async function ready(page:Page){await page.waitForFunction(()=>!!(window as any).__paint && !(window as any).__paint.busy);}
async function act(page:Page,id:string){await page.locator(`#${id}`).click();await ready(page);}
async function select(page:Page,index:number){await page.locator('.cut-card').nth(index).click();await ready(page);}
async function dot(page:Page){const r=(await page.locator('#paper').boundingBox())!,z=await page.evaluate(()=>(window as any).__paint.zoom);await page.mouse.click(r.x+100*z,r.y+100*z);}
test.beforeEach(async({page})=>{await page.goto('/');await ready(page);await openGuides(page);});
test('연필·컷 복제·가이드·비활성 컷 복원·v2 저장을 함께 사용',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#brushTool').selectOption('pencil');await page.locator('#guideType').selectOption('grid');await dot(page);
  const original=await page.evaluate(()=>(window as any).__paint.app.selected.canvas.toDataURL());
  await act(page,'duplicateCut');expect(await page.evaluate(()=>(window as any).__paint.app.selected.canvas.toDataURL())).toBe(original);await expect(page.locator('#guideType')).toHaveValue('grid');
  await page.locator('#guideType').selectOption('ruled');await act(page,'addCut');await act(page,'addCut');await act(page,'addCut');
  expect(await page.evaluate(()=>!!(window as any).__paint.story.cuts[0].cold)).toBe(true);
  const project=await page.evaluate(async()=>(window as any).__paint.story.serialize('통합 프로젝트'));expect(project.version).toBe(2);expect(project.cuts[0].guide.type).toBe('grid');expect(project.cuts[1].guide.type).toBe('ruled');
  await select(page,0);await expect(page.locator('#guideType')).toHaveValue('grid');expect(await page.evaluate(()=>(window as any).__paint.app.selected.canvas.toDataURL())).toBe(original);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>(window as any).__paint.app.selected.canvas.getContext('2d').getImageData(100,100,1,1).data[3])).toBe(0);await page.keyboard.press('Control+y');expect(await page.evaluate(()=>(window as any).__paint.app.selected.canvas.toDataURL())).toBe(original);
  page.on('dialog',d=>void d.accept());await page.locator('#fileInput').setInputFiles({name:'combined.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await ready(page);await select(page,1);await expect(page.locator('#guideType')).toHaveValue('ruled');expect(await page.evaluate(()=>(window as any).__paint.app.selected.canvas.toDataURL())).toBe(original);await select(page,0);await expect(page.locator('#guideType')).toHaveValue('grid');expect(errors).toEqual([]);
});
test('이전 v2 파일의 가이드 기본값과 잘못된 컷 가이드 거부',async({page})=>{
  await page.locator('#guideType').selectOption('dots');await dot(page);await act(page,'duplicateCut');const project=await page.evaluate(async()=>(window as any).__paint.story.serialize('이전 v2'));
  for(const cut of project.cuts)delete cut.guide;page.on('dialog',d=>void d.accept());await page.locator('#fileInput').setInputFiles({name:'old-v2.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await ready(page);await expect(page.locator('#guideType')).toHaveValue('none');await select(page,0);await expect(page.locator('#guideType')).toHaveValue('none');
  const before=await page.evaluate(()=>(window as any).__paint.app.selected.canvas.toDataURL());project.cuts[1].guide={type:'grid',spacing:999,visible:true,color:'blue',opacity:.5};await page.locator('#fileInput').setInputFiles({name:'bad-v2.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await ready(page);await expect(page.locator('#toast')).toContainText('가이드 설정');expect(await page.evaluate(()=>(window as any).__paint.app.selected.canvas.toDataURL())).toBe(before);await expect(page.locator('#cutCount')).toHaveText('2');
});
