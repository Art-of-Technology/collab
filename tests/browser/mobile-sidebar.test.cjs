const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { test } = require('node:test');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');

const root = join(__dirname, '../..');
const stubs = join(__dirname, 'mobile-sidebar-stubs.jsx');
const dependencies = {
  'next/link': 'Link',
  'next/dynamic': 'dynamic',
  'next/image': 'default',
  'next/navigation': '*',
  '@tanstack/react-query': '*',
  '@/context/AIContext': '*',
  '@/context/WorkspaceContext': '*',
  '@/hooks/useAI': '*',
  '@/hooks/use-toast': '*',
  '@/hooks/queries/useUser': '*',
  '@/hooks/queries/useProjects': '*',
  '@/hooks/queries/useViews': '*',
  '@/hooks/queries/useInstalledApps': '*',
  '@/hooks/queries/useSeatsWaiting': '*',
  '@/hooks/queries/useCommandSearch': '*',
  '@/lib/sign-out': '*',
  '@/components/workspace/WorkspaceSelector': 'default',
  '@/components/layout/sidebar/NotificationPopover': 'default',
  '@/components/modals/CreateViewModal': 'default',
  '@/components/modals/CreateProjectModal': 'default',
  '@/components/issue/NewIssueModal': 'default',
  './ChatPanel': 'default',
};

async function bundleApp() {
  const { outputFiles } = await build({
    absWorkingDir: root,
    entryPoints: [join(__dirname, 'mobile-sidebar-app.jsx')],
    bundle: true,
    write: false,
    jsx: 'automatic',
    plugins: [{
      name: 'sidebar-fixture',
      setup(plugin) {
        plugin.onResolve({ filter: /.*/ }, ({ path }) =>
          Object.hasOwn(dependencies, path) ? { path, namespace: 'fixture' } : undefined);
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
          const symbol = dependencies[path];
          const exports = symbol === '*' ? '*' : `{ ${symbol} as default }`;
          return { contents: `export ${exports} from ${JSON.stringify(stubs)};`, resolveDir: root };
        });
      },
    }],
  });
  return outputFiles[0].text;
}

async function paintOrder(page, elements) {
  await Promise.all(Object.entries(elements).map(([name, element]) =>
    element.evaluate((node, name) => { node.dataset.paintProbe = name; }, name)));
  const session = await page.context().newCDPSession(page);
  try {
    const { documents: [document], strings } = await session.send('DOMSnapshot.captureSnapshot', {
      computedStyles: [],
      includePaintOrder: true,
    });
    const orders = {};
    document.layout.nodeIndex.forEach((nodeIndex, layoutIndex) => {
      const attributes = document.nodes.attributes[nodeIndex];
      const marker = attributes.findIndex((index, position) => position % 2 === 0 && strings[index] === 'data-paint-probe');
      if (marker !== -1) orders[strings[attributes[marker + 1]]] = document.layout.paintOrders[layoutIndex];
    });
    return orders;
  } finally {
    await session.detach();
  }
}

test('the phone drawer and backdrop cover the page and toolbar, and account taps open the menu', { timeout: 60_000 }, async () => {
  const stylesheet = join(root, 'src/app/globals.css');
  const [script, { css }] = await Promise.all([
    bundleApp(),
    readFile(stylesheet, 'utf8').then(source =>
      postcss([tailwindcss(join(root, 'tailwind.config.js'))]).process(source, { from: stylesheet })),
  ]);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 388, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    page.setDefaultTimeout(5_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error));
    await page.route('http://fixture.test/', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="app"></div>',
    }));
    await page.goto('http://fixture.test/');
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });

    const search = page.getByPlaceholder(/Search or ask/);
    await search.waitFor();
    const searchBox = await search.boundingBox();
    assert.ok(searchBox, 'the real search field is visible before opening the drawer');
    const outside = {
      x: Math.floor(searchBox.x + searchBox.width - 12),
      y: Math.floor(searchBox.y + searchBox.height / 2),
    };
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).tagName, outside), 'TEXTAREA');

    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.tap();
    const drawer = page.locator('[role="dialog"][data-open="true"]');
    const account = drawer.getByRole('button', { name: 'Fixture User' });
    await account.waitFor();
    await page.waitForFunction(() =>
      document.querySelector('[role="dialog"][data-open="true"]')?.getBoundingClientRect().left === 0);
    const drawerBox = await drawer.boundingBox();
    assert.ok(outside.x > drawerBox.x + drawerBox.width, 'the search field extends beyond the drawer');
    const accountBox = await account.boundingBox();
    const points = [0.08, 0.5, 0.92].map(fraction => ({
      x: Math.floor(accountBox.x + accountBox.width * fraction),
      y: Math.floor(accountBox.y + accountBox.height / 2),
    }));

    // Inert excludes the underlying controls from hit testing even if they paint over the drawer.
    const layers = await paintOrder(page, {
      drawer,
      backdrop: page.locator('.fixed.inset-0'),
      search,
      menu: page.getByRole('button', { name: 'Menu', exact: true, includeHidden: true }),
      page: page.getByRole('button', { name: 'Page action', includeHidden: true }),
    });
    assert.ok(layers.drawer > layers.backdrop, 'the drawer paints above the backdrop');
    for (const name of ['search', 'menu', 'page']) {
      assert.ok(layers.backdrop > layers[name], `the backdrop paints above ${name}: ${JSON.stringify(layers)}`);
    }

    for (const { x, y } of points) {
      await page.touchscreen.tap(x, y);
      await page.getByRole('menuitem', { name: 'Settings' }).waitFor();
      await page.getByRole('menuitem', { name: 'Sign out' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('menu').waitFor({ state: 'hidden' });
    }

    await page.touchscreen.tap(outside.x, outside.y);
    await drawer.waitFor({ state: 'hidden' });
    await menu.waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
