// The charcell shell's events view: the log of the events a story's panes
// fire. A story's events are its function props (the fixture Button's
// `onPress`); each pane records a call of one and the log shows it, newest
// last, with its pane and what it was called with. `clear` empties the log,
// and another story starts it afresh. Run with `pnpm test:e2e`.
import { expect, test, type Page } from '@playwright/test';
import { SCRIPTED_TARGETS, openHost, paneBody } from './support/host';

const eventsRow = (page: Page) => page.locator('[data-preview-events]');

test.describe('The events view', () => {
  test("logs each event a story's panes fire, and clears", async ({ page }) => {
    await openHost(page, '/?component=components-button&option.shell.events=true');
    await expect(page.locator('.CharcellSplitter__handle-row').getByRole('heading', { name: 'events' })).toBeVisible();
    await expect(eventsRow(page)).toContainText('No events yet: onPress, onActivate show here as the story fires them.');

    for (const target of SCRIPTED_TARGETS) await paneBody(page, target).locator('.FixtureButton').click();
    const entries = eventsRow(page).locator('li');
    await expect(entries).toHaveCount(6);
    // Each pane's click, its two events in the order the story fires them,
    // read alike in every target: the text, and the click itself.
    const payload = (index: number) => entries.nth(index).locator('.EventsRow__payload').textContent();
    for (const [index, target] of SCRIPTED_TARGETS.entries()) {
      await expect(entries.nth(2 * index)).toContainText(target);
      await expect(entries.nth(2 * index)).toContainText('onPress');
      expect(await payload(2 * index)).toBe('"Button"');
      await expect(entries.nth(2 * index + 1)).toContainText('onActivate');
      expect(await payload(2 * index + 1)).toMatch(/^(Pointer|Mouse)Event click$/);
    }
    expect(new Set([await payload(1), await payload(3), await payload(5)]).size).toBe(1);
    // The story's own behavior runs beside the recording.
    await expect(paneBody(page, 'react').locator('.FixtureButton')).toHaveAttribute('data-pressed', '');

    await page.getByRole('main').getByRole('button', { name: 'clear', exact: true }).click();
    await expect(entries).toHaveCount(0);
    await paneBody(page, 'vue').locator('.FixtureButton').click();
    await expect(entries).toHaveCount(2);

    // Another story starts the log afresh; one with no events says so.
    await page.getByRole('treeitem', { name: 'Tag', exact: true }).click();
    await expect(eventsRow(page)).toContainText('This story declares no events.');
  });

  test('follows the newest event, as a terminal does', async ({ page }) => {
    // Short enough that a few events overflow the log.
    await page.setViewportSize({ width: 1440, height: 400 });
    await openHost(page, '/?component=components-button&option.shell.events=true&option.shell.output=true');
    const button = paneBody(page, 'react').locator('.FixtureButton');
    for (let click = 0; click < 8; click++) await button.click();
    const log = page.getByRole('region', { name: 'events' });
    await expect(eventsRow(page).locator('li')).toHaveCount(16);
    // Scrolled to its end: the last entry in view.
    await expect
      .poll(() => log.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
      .toBeLessThanOrEqual(1);
    await expect(eventsRow(page).locator('li').last().locator('.EventsRow__name')).toBeInViewport();
  });
});
