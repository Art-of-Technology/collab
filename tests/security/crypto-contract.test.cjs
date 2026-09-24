const { assert, test, load, resolve, ts } = require('./helpers.cjs');

test('review: encryption roundtrip and generated Prisma Bytes assignments retain concrete allocation types', async () => {
  const env = { APP_TOKENS_KEY: '0123456789abcdef0123456789abcdef' };
  const crypto = load('src/lib/apps/crypto.ts', {
    crypto: require('node:crypto'), util: require('node:util'), bcrypt: { default: require('bcrypt') },
  }, { Buffer, process: { env }, console: { error() {} } });
  const plaintext = 'dummy-token-✓';
  const encrypted = await crypto.encryptToken(plaintext);
  assert.ok(Buffer.isBuffer(encrypted));
  assert.ok(encrypted.buffer instanceof ArrayBuffer);
  assert.equal(await crypto.decryptToken(encrypted), plaintext);
  assert.equal(await crypto.decrypt(await crypto.encrypt(plaintext)), plaintext);
  const newKey = 'abcdef0123456789abcdef0123456789';
  const rotated = await crypto.rotateTokenEncryption(encrypted, env.APP_TOKENS_KEY, newKey);
  env.APP_TOKENS_KEY = newKey;
  assert.equal(await crypto.decryptToken(rotated), plaintext);
  const tampered = Buffer.from(rotated); tampered[tampered.length - 1] ^= 1;
  await assert.rejects(crypto.decryptToken(tampered), /Failed to decrypt token/);

  const file = resolve('tests/security/prisma-bytes-contract.ts');
  const contract = `import { Prisma } from '@prisma/client';
    import { encryptToken, encrypt, rotateTokenEncryption } from '../../src/lib/apps/crypto';
    async function check() {
      const secret: Prisma.AppOAuthClientCreateInput['clientSecret'] = await encryptToken('dummy');
      const webhook: Prisma.AppWebhookCreateInput['secretEnc'] = await encrypt('dummy');
      const rotated: Prisma.AppOAuthClientCreateInput['clientSecret'] = await rotateTokenEncryption(Buffer.alloc(64), '', '');
      return [secret, webhook, rotated];
    }`;
  const options = { noEmit: true, incremental: false, strict: true, skipLibCheck: true,
    esModuleInterop: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
  const host = ts.createCompilerHost(options);
  const read = host.readFile;
  host.readFile = name => name === file ? contract : read(name);
  const program = ts.createProgram([file], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
});
