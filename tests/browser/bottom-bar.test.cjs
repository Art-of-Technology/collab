const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { chromium } = require('playwright');
const { buildFixture, loadFixture } = require('./mobile-sidebar-fixture.cjs');

const phone = { viewport: { width: 388, height: 844 }, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };

let browser;
let fixture;

before(async () => {
  fixture = await buildFixture();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function openPage(t, settings, content) {
  const page = await browser.newPage(settings);
  t.after(() => page.close());
  page.setDefaultTimeout(5_000);
  await loadFixture(page, fixture, content);
  const bar = page.locator('.app-toolbar > div').filter({ has: page.locator('textarea') });
  await bar.getByPlaceholder('Search or ask Cleo anything...').waitFor();
  return { page, bar };
}

test('phone: the icon row is gone and the AI bar has a menu button that opens the drawer', async t => {
  const { page, bar } = await openPage(t, phone);
  const toolbar = page.locator('.app-toolbar');
  for (const name of ['Agents', 'All Views', 'All Projects', 'Posts', 'Context', 'Search']) {
    assert.equal(await toolbar.getByRole('button', { name, exact: true }).count(), 0, name);
  }
  const firstControl = bar.locator('button:visible, textarea:visible').first();
  assert.equal(await firstControl.getAttribute('aria-label'), 'Open menu');
  await firstControl.tap();
  const drawer = page.locator('[role="dialog"][data-open="true"]');
  await drawer.waitFor();
  assert.equal(await toolbar.evaluate(node => node.inert), true);
});

test('desktop: the AI bar has no menu button', async t => {
  const { bar } = await openPage(t, desktop);
  assert.equal(await bar.getByRole('button', { name: 'Open menu', exact: true }).count(), 0);
  await bar.getByRole('button', { name: 'Attach image' }).waitFor();
});

test('phone: every button of the resting AI bar is at least 44 by 44 px', async t => {
  const { bar } = await openPage(t, phone);
  const buttons = await bar.getByRole('button').all();
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    const box = await button.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, JSON.stringify(box));
  }
});

test('phone: tapping the search field reveals quick actions and the attachment control', async t => {
  const { page, bar } = await openPage(t, phone);
  await bar.getByPlaceholder('Search or ask Cleo anything...').tap();
  await bar.getByText('Go to Projects', { exact: true }).waitFor();
  const chooser = page.waitForEvent('filechooser');
  await bar.getByRole('button', { name: 'Attach image' }).tap();
  assert.equal(await (await chooser).element().getAttribute('accept'), 'image/*');
});

test('the end of a page clears the AI bar at phone and at desktop width', async t => {
  for (const settings of [phone, desktop]) {
    await t.test(`${settings.viewport.width}px`, async t => {
      const { page, bar } = await openPage(t, settings, 'tall');
      const last = page.getByText('Last page item');
      const { padding, bottom } = await last.evaluate(node => {
        const scroller = node.parentElement;
        scroller.scrollTop = scroller.scrollHeight;
        return {
          padding: parseFloat(getComputedStyle(scroller).paddingBottom),
          bottom: node.getBoundingClientRect().bottom,
        };
      });
      const { y } = await bar.boundingBox();
      t.diagnostic(`Bottom padding ${padding}px, bar reach ${settings.viewport.height - y}px, last item bottom ${bottom}px, bar top ${y}px`);
      assert.ok(bottom <= y, 'the page end is above or level with the bar');
      assert.ok(y - bottom <= 1, 'the page uses only the required clearance');
    });
  }
});

test('phone: a minimap pinned to the bottom sits above the AI bar', async t => {
  for (const content of ['kanban', 'week']) {
    await t.test(content, async t => {
      const { page, bar } = await openPage(t, phone, content);
      const minimap = page.getByText('← Scroll →', { exact: true });
      await minimap.waitFor();
      const minimapBox = await minimap.boundingBox();
      const barBox = await bar.boundingBox();
      assert.ok(minimapBox.y + minimapBox.height <= barBox.y, 'the minimap header clears the bar');
      const containerBox = await minimap.locator('../..').boundingBox();
      assert.ok(containerBox.y + containerBox.height <= barBox.y, 'the entire minimap clears the bar');
    });
  }
});
