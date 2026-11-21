const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
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

async function buildFixture() {
  const stylesheet = join(root, 'src/app/globals.css');
  const [script, { css }] = await Promise.all([
    bundleApp(),
    readFile(stylesheet, 'utf8').then(source =>
      postcss([tailwindcss(join(root, 'tailwind.config.js'))]).process(source, { from: stylesheet })),
  ]);

  return { script, css };
}

async function loadFixture(page, { script, css }, content = '') {
  const url = new URL('http://fixture.test/');
  if (content) url.searchParams.set('content', content);
  await page.route(url.href, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="app"></div>',
  }));
  await page.goto(url.href);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
}

module.exports = { buildFixture, loadFixture };
