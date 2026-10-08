import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const command = `ZDOTDIR="\${ZDOTDIR:-$HOME}" bash -o pipefail -c 'curl -fsSL https://collab.weez.boo/install.sh | sh' && . "$HOME/.local/share/collab/env"`;
const supported = process.platform === 'darwin' || process.platform === 'linux';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'collab installer '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'), tools = path.join(dir, 'tools');
  mkdirSync(home); mkdirSync(tools);
  const platform = `${process.platform}-${process.arch}`;
  const name = `collab-${platform}.tar.gz`;
  const downloads = path.join(dir, 'downloads'); mkdirSync(downloads);
  if (process.env.COLLAB_NATIVE_DOWNLOADS) {
    for (const file of [name, `${name}.sha256`]) copyFileSync(path.join(process.env.COLLAB_NATIVE_DOWNLOADS, file), path.join(downloads, file));
  } else {
    const stage = path.join(dir, `collab-${platform}`); mkdirSync(stage);
    writeFileSync(path.join(stage, 'collab'), `#!/bin/sh\nprintf '%s\\n' '{"version":"${version}"}'\n`, { mode: 0o755 });
    execFileSync('tar', ['-czf', path.join(downloads, name), '-C', dir, `collab-${platform}`], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const digest = createHash('sha256').update(readFileSync(path.join(downloads, name))).digest('hex');
    writeFileSync(path.join(downloads, `${name}.sha256`), `${digest}  ${name}\n`);
  }
  writeFileSync(path.join(tools, 'curl'), `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), url = args.find(x => x.startsWith('https://'));
if (process.env.FAIL_DOWNLOAD) process.exit(22);
if (url === 'https://collab.weez.boo/install.sh') process.stdout.write(fs.readFileSync(${JSON.stringify(path.join(root, 'public/install.sh'))}));
else {
  const base = 'https://github.com/Art-of-Technology/collab/releases/download/cli-v${version}/';
  if (!url?.startsWith(base)) process.exit(23);
  const name = url.slice(base.length);
  if (name !== ${JSON.stringify(name)} && name !== ${JSON.stringify(`${name}.sha256`)}) process.exit(24);
  fs.copyFileSync(path.join(${JSON.stringify(downloads)}, name), args[args.indexOf('-o') + 1]);
}
`, { mode: 0o755 });
  const env = { ...process.env, HOME: home, PATH: `${tools}:${process.env.PATH}`, COLLAB_CONFIG_DIR: path.join(home, 'untouched-config') };
  for (const key of ['BASH_ENV', 'ENV', 'COLLAB_TOKEN', 'ZDOTDIR']) delete env[key];
  const run = (suffix = '', extra = {}) => spawnSync('bash', ['--noprofile', '--norc', '-c', `${command}${suffix}`], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 30000 });
  return { home, downloads, name, env, run };
}

test('one pasted command installs, refreshes this shell, and keeps future shells configured once', { skip: !supported }, t => {
  const f = fixture(t);
  writeFileSync(path.join(f.home, '.bash_profile'), '# existing setup\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = f.run(' && collab schema');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))).version, version);
  }
  for (const name of ['.bash_profile', '.bashrc', '.zshrc']) {
    const text = readFileSync(path.join(f.home, name), 'utf8');
    assert.equal(text.split('. "$HOME/.local/share/collab/env"').length - 1, 1, name);
  }
  assert.ok(readFileSync(path.join(f.home, '.bash_profile'), 'utf8').startsWith('# existing setup\n'));
  assert.equal(existsSync(path.join(f.home, '.profile')), false);
  assert.equal(existsSync(f.env.COLLAB_CONFIG_DIR), false, 'install must not touch login/configuration');
  const future = spawnSync('bash', ['--noprofile', '--norc', '-c', '. "$HOME/.bash_profile" && collab schema'], { env: f.env, encoding: 'utf8' });
  assert.equal(future.status, 0, future.stderr);
  assert.equal(JSON.parse(future.stdout).version, version);
});

test('bad checksums preserve the existing executable and shell profile', { skip: !supported }, t => {
  const f = fixture(t);
  mkdirSync(path.join(f.home, '.local/bin'), { recursive: true });
  writeFileSync(path.join(f.home, '.local/bin/collab'), 'old executable');
  writeFileSync(path.join(f.home, '.bashrc'), 'old profile');
  writeFileSync(path.join(f.downloads, `${f.name}.sha256`), `${'0'.repeat(64)}  ${f.name}\n`);
  const result = f.run();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Checksum mismatch/);
  assert.equal(readFileSync(path.join(f.home, '.local/bin/collab'), 'utf8'), 'old executable');
  assert.equal(readFileSync(path.join(f.home, '.bashrc'), 'utf8'), 'old profile');
  assert.equal(existsSync(path.join(f.home, '.local/share/collab/env')), false);
});

test('a failed installer download fails the one-liner before sourcing any old environment file', { skip: !supported }, t => {
  const f = fixture(t);
  mkdirSync(path.join(f.home, '.local/share/collab'), { recursive: true });
  writeFileSync(path.join(f.home, '.local/share/collab/env'), 'touch "$HOME/should-not-run"');
  assert.notEqual(f.run('', { FAIL_DOWNLOAD: '1' }).status, 0);
  assert.equal(existsSync(path.join(f.home, 'should-not-run')), false);
});

test('installed CLI wins PATH lookup and repeated sourcing removes duplicate entries', { skip: !supported }, t => {
  const f = fixture(t);
  const oldBin = path.join(f.home, 'old bin');
  const bin = path.join(f.home, '.local/bin');
  mkdirSync(oldBin);
  writeFileSync(path.join(oldBin, 'collab'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  const expectedPath = `${bin}:${oldBin}:${f.env.PATH}`;
  f.env.PATH = `${oldBin}:${bin}:${f.env.PATH}:${bin}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = f.run(' && collab schema && printf "%s\\n" "$PATH"');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim().split('\n').at(-1), expectedPath);
  }
  const future = spawnSync('bash', ['--noprofile', '--norc', '-c', '. "$HOME/.bashrc" && . "$HOME/.bashrc" && collab schema && printf "%s\\n" "$PATH"'], { env: f.env, encoding: 'utf8' });
  assert.equal(future.status, 0, future.stderr);
  assert.equal(future.stdout.trim().split('\n').at(-1), expectedPath);
});

test('non-exported ZDOTDIR configures a new custom directory and future Zsh terminals', { skip: !supported }, t => {
  const available = spawnSync('zsh', ['--version']);
  if (available.error?.code === 'ENOENT') return t.skip('Zsh unavailable; exercised on macOS CI');
  const f = fixture(t);
  const custom = path.join(f.home, 'custom zsh');
  writeFileSync(path.join(f.home, '.zshenv'), 'ZDOTDIR="$HOME/custom zsh"\n');
  const result = spawnSync('zsh', ['-d', '-c', `${command} && collab schema`], { env: f.env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))).version, version);
  assert.ok(existsSync(path.join(custom, '.zshrc')));
  assert.equal(existsSync(path.join(f.home, '.zshrc')), false);
  const future = spawnSync('zsh', ['-d', '-i', '-c', 'collab schema'], { env: f.env, encoding: 'utf8', timeout: 30000 });
  assert.equal(future.status, 0, future.stderr);
  assert.equal(JSON.parse(future.stdout).version, version);
});
