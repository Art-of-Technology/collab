// Runs one TypeScript file of the app in plain Node, the way the tests do (tests/security/helpers.cjs),
// so a script can use the app's own code without a second copy of its rules.
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';

/** The exports of `file`. `require` supplies what it imports; `globals` replaces globals such as `process`. */
export function loadTs(file, require, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const exports = {};
  compileFunction(outputText, ['exports', 'require', ...Object.keys(globals)])(exports, require, ...Object.values(globals));
  return exports;
}
