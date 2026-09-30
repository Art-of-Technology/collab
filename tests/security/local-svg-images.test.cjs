const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Image = require('next/image').default;
const { getImgProps } = require('next/dist/shared/lib/get-img-props');
const defaultLoader = require('next/dist/shared/lib/image-loader').default;
const { imageConfigDefault } = require('next/dist/shared/lib/image-config');
const { ImageConfigContext } = require('next/dist/shared/lib/image-config-context.shared-runtime');

const root = resolve(__dirname, '../..');
const configModule = { exports: {} };
runInNewContext(readFileSync(resolve(root, 'next.config.js'), 'utf8'), {
  module: configModule, process: { env: {} },
  require(name) {
    assert.equal(name, '@sentry/nextjs');
    return { withSentryConfig: config => config };
  },
});
const imageConfig = { ...imageConfigDefault, ...configModule.exports.images };

// Execute the actual, self-contained logo JSX expressions. Page/session/layout
// behavior is outside this fixture; Next's image component and loader are real.
function logos(file) {
  const source = ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imageImport = source.statements.find(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'next/image');
  assert.ok(imageImport?.importClause?.name, `${file}: default Next Image import`);
  const name = imageImport.importClause.name.text;
  const elements = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === name &&
        node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.text === 'src' &&
          attr.initializer && ts.isStringLiteral(attr.initializer) && ['/logo-text.svg', '/logo-icon.svg'].includes(attr.initializer.text))) {
      const { outputText } = ts.transpileModule(`module.exports = (${node.getText(source)});`, {
        compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      });
      const loaded = { exports: {} };
      runInNewContext(outputText, { module: loaded, React, [name]: Image });
      elements.push(loaded.exports);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return elements;
}

// Existing rendered dimensions, accessible name and classes are part of the fix's contract.
const callers = [
  ['src/app/(auth)/auth/mcp/page.tsx', [['text', 125, 125], ['text', 125, 125]]],
  ['src/app/(auth)/login/page.tsx', [['text', 125, 125]]],
  ['src/app/admin/layout.tsx', [['text', 100, 100, 'h-6 w-auto']]],
  ['src/app/dev/layout.tsx', [['text', 100, 100, 'h-6 w-auto'], ['icon', 32, 32, 'h-8 w-auto']]],
  ['src/app/home/page.tsx', [['text', 120, 27, 'mr-2 sm:h-10']]],
  ['src/components/dev/DevSidebar.tsx', [['icon', 32, 32, 'h-8 w-auto'], ['text', 100, 100, 'h-6 w-auto']]],
  ['src/components/layout/Navbar.tsx', [['text', 100, 100, 'h-6 w-auto']]],
  ['src/components/layout/SimplifiedSidebar.tsx', [['icon', 24, 24], ['text', 100, 28]]],
  ['src/components/welcome/StreamlinedWelcomeClient.tsx', [['text', 112, 32, 'h-auto w-[112px]'], ['icon', 240, 240, 'h-24']]],
  ['src/components/welcome/WelcomeClient.tsx', [['icon', 120, 120, 'h-10 mb-4']]],
];

for (const [file, expected] of callers) {
  const elements = logos(file);
  assert.equal(elements.length, expected.length, `${file}: caller coverage`);
  expected.forEach(([kind, width, height, className], index) => {
    test(`${file} logo ${index + 1} stays on the direct authenticated asset path`, () => {
      const element = elements[index];
      const { props } = getImgProps(element.props, { defaultLoader, imgConf: imageConfig });
      assert.equal(props.src, `/logo-${kind}.svg`);
      assert.equal(props.srcSet, undefined);
      assert.equal(props.sizes, undefined);
      assert.equal(props.width, width);
      assert.equal(props.height, height);
      assert.equal(props.alt, 'Collab');
      assert.equal(props.className, className);
      const html = renderToStaticMarkup(React.createElement(ImageConfigContext.Provider, { value: imageConfig }, element));
      assert.ok(html.includes(`src="/logo-${kind}.svg"`), html);
      assert.ok(html.includes(`width="${width}"`) && html.includes(`height="${height}"`), html);
      assert.ok(html.includes('alt="Collab"'), html);
      assert.doesNotMatch(html, /srcSet=|srcset=|\/_next\/image/);
    });
  });
}

test('the unchanged image configuration still optimizes callers without the local opt-out', () => {
  const { props } = getImgProps({ src: '/logo-text.svg', width: 100, height: 28, alt: 'Collab' }, {
    defaultLoader, imgConf: imageConfig,
  });
  assert.equal(props.src, '/_next/image?url=%2Flogo-text.svg&w=256&q=75');
  assert.equal(props.srcSet, '/_next/image?url=%2Flogo-text.svg&w=128&q=75 1x, /_next/image?url=%2Flogo-text.svg&w=256&q=75 2x');
});
