import type { Page } from '@playwright/test';
/** Runs a command that lives only in the menu bar: opens its menu, then clicks the item. */
export async function menu(page: Page, id: string) {
  await page.locator(`.menu:has(#${id}) > .menu-button`).click();
  await page.locator(`#${id}`).click();
}
/** The guide section starts collapsed; open it before using its controls. */
export async function openGuides(page: Page) {
  if (!(await page.locator('#screenSettings').evaluate(el => (el as HTMLDetailsElement).open))) await page.locator('#screenSettings summary').click();
}
