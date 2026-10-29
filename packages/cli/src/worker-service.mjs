import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CliError } from './client.mjs';

const error = message => new CliError('worker_service', message, 5);
const digest = value => createHash('sha256').update(value).digest('hex');
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const quote = value => `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
export function serviceDefinition(identity, args, configDir, { platform = process.platform, home = os.homedir(), uid = process.getuid?.() } = {}) {
  if ([...args, configDir].some(value => /[\x00-\x1f]/.test(value))) throw error('Service paths must not contain control characters.');
  const label = `collab-worker-${identity}`;
  if (platform === 'darwin') return { label, file: path.join(home, 'Library/LaunchAgents', `${label}.plist`),
    content: `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(configDir)}</string><key>EnvironmentVariables</key><dict><key>COLLAB_CONFIG_DIR</key><string>${xml(configDir)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>30</integer></dict></plist>`,
    install: [['launchctl', ['bootstrap', `gui/${uid}`, path.join(home, 'Library/LaunchAgents', `${label}.plist`)]]],
    uninstall: [['launchctl', ['bootout', `gui/${uid}/${label}`]]],
    inspect: ['launchctl', ['print', `gui/${uid}/${label}`]] };
  if (platform === 'linux') {
    const unit = value => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;
    return { label, file: path.join(home, '.config/systemd/user', `${label}.service`),
      content: `[Unit]\nDescription=Collab dedicated worker\nStartLimitIntervalSec=3600\nStartLimitBurst=4\n[Service]\nType=simple\nExecStart=:${args.map(unit).join(' ')}\nWorkingDirectory=${unit(configDir)}\nEnvironment=${unit(`COLLAB_CONFIG_DIR=${configDir}`)}\nRestart=on-failure\nRestartSec=30\nTimeoutStopSec=15\nKillMode=control-group\n[Install]\nWantedBy=default.target\n`,
      install: [['systemctl', ['--user', 'daemon-reload']], ['systemctl', ['--user', 'enable', '--now', `${label}.service`]]],
      uninstall: [['systemctl', ['--user', 'disable', '--now', `${label}.service`]]],
      inspect: ['systemctl', ['--user', 'show', `${label}.service`, '--property=LoadState', '--value']] };
  }
  if (platform === 'win32') return { label, file: path.join(configDir, `${label}.xml`),
    content: `<?xml version="1.0" encoding="UTF-8"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers><Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings><Actions Context="Author"><Exec><Command>${xml(args[0])}</Command><Arguments>${xml(args.slice(1).map(quote).join(' '))}</Arguments><WorkingDirectory>${xml(configDir)}</WorkingDirectory></Exec></Actions></Task>`,
    install: [['schtasks.exe', ['/Create', '/TN', label, '/XML', path.join(configDir, `${label}.xml`)]], ['schtasks.exe', ['/Run', '/TN', label]]],
    disable: ['schtasks.exe', ['/Change', '/TN', label, '/Disable']], closure: windowsClosureCommand(label),
    uninstall: [['schtasks.exe', ['/Delete', '/TN', label, '/F']]],
    inspect: ['schtasks.exe', ['/Query', '/TN', label, '/XML', '/HRESULT']] };
  throw error('Only macOS launchd, Linux systemd user, and Windows user Scheduled Tasks are supported.');
}
async function serviceAbsent(definition, execute) {
  const [command, args] = definition.inspect;
  try {
    const result = await execute(command, args);
    return command === 'systemctl' && result?.stdout?.trim() === 'not-found';
  } catch (failure) {
    if (failure.killed || failure.signal || !Number.isInteger(failure.code)) return false;
    if (command === 'schtasks.exe') return (failure.code >>> 0) === 0x80070002;
    if (command === 'launchctl' && failure.code === 113) {
      const uid = args[1].split('/')[1];
      return failure.stderr === `Bad request.\nCould not find service "${definition.label}" in domain for user gui: ${uid}\n`;
    }
    return false;
  }
}
function windowsClosureCommand(label) {
  const script = `$ErrorActionPreference='Stop'; $scheduler=New-Object -ComObject Schedule.Service; $scheduler.Connect(); $deadline=[DateTime]::UtcNow.AddSeconds(10); do { $running=@($scheduler.GetRunningTasks(1) | Where-Object { $_.Path -eq '\\${label}' }); if ($running.Count -eq 0) { @{label='${label}';closed=$true} | ConvertTo-Json -Compress; exit 0 }; Start-Sleep -Milliseconds 100 } while ([DateTime]::UtcNow -lt $deadline); exit 1`;
  return ['powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]];
}
export async function workerService(name, identity, options, state, save, dependencies = {}) {
  const configDir = path.resolve(process.env.COLLAB_CONFIG_DIR || path.join(os.homedir(), '.config/collab'));
  const execute = dependencies.execute || ((command, args) => promisify(execFile)(command, args, { timeout: 15000, windowsHide: true, shell: false, maxBuffer: 65536 }));
  const supervisorError = () => error('OS supervisor action failed. Inspect the named service; no other service was changed.');
  if (name === 'worker uninstall') {
    const expected = serviceDefinition(identity, [], configDir, dependencies);
    const owned = state.service;
    if (!owned || owned.file !== expected.file || owned.label !== expected.label || !/^[a-f0-9]{64}$/.test(owned.hash)) throw error('No matching owned installation is recorded.');
    const file = fs.lstatSync(owned.file, { throwIfNoEntry: false });
    if (file && (!file.isFile() || digest(fs.readFileSync(owned.file)) !== owned.hash)) throw error('No matching owned installation is recorded.');
    if ((state.runId && !state.closed) || (state.active && state.active.closed !== true)) throw error('Owned worker closure must be confirmed before uninstalling.');
    if (options['dry-run']) return { file: owned.file, label: owned.label, uninstall: file ? expected.uninstall : [], inspect: expected.inspect,
      ...(expected.closure && { disable: file ? expected.disable : undefined, closure: expected.closure }), dryRun: true };
    owned.retired = true; save(state);
    if (expected.closure) {
      try {
        if (file) {
          try { await execute(...expected.disable); }
          catch { if (!await serviceAbsent(expected, execute)) throw supervisorError(); }
        } else if (!await serviceAbsent(expected, execute)) throw supervisorError();
        const proof = JSON.parse((await execute(...expected.closure)).stdout);
        if (proof.label !== owned.label || proof.closed !== true) throw supervisorError();
      } catch { throw supervisorError(); }
    }
    if (!file) {
      if (!expected.closure && !await serviceAbsent(expected, execute)) throw supervisorError();
    } else {
      try { for (const [command, args] of expected.uninstall) await execute(command, args); }
      catch { if (!await serviceAbsent(expected, execute)) throw supervisorError(); }
      fs.unlinkSync(owned.file);
    }
    delete state.service; save(state);
    return { uninstalled: true, label: owned.label };
  }
  const installationId = randomUUID();
  const args = [...(dependencies.command || (/^node(?:\.exe)?$/.test(path.basename(process.execPath)) ? [process.execPath, fileURLToPath(new URL('../bin/collab.mjs', import.meta.url))] : [process.execPath])),
    dependencies.kind || 'worker', 'run', '--agent', options.agent, '--workspace', options.workspace, '--config-dir', configDir, '--service-id', installationId,
    ...(options.project ? ['--project', options.project] : []), ...(options.profile ? ['--profile', options.profile] : [])];
  const definition = serviceDefinition(identity, args, configDir, dependencies);
  if (options['dry-run']) return { ...definition, installationId, installed: false, dryRun: true };
  if (state.service) throw error('Uninstall the existing owned service before reinstalling.');
  if (fs.existsSync(definition.file)) throw error('Existing service definition is not the saved owned definition.');
  fs.mkdirSync(path.dirname(definition.file), { recursive: true });
  fs.writeFileSync(definition.file, definition.content, { mode: 0o600, flag: 'wx' });
  state.service = { file: definition.file, hash: digest(definition.content), label: definition.label, installationId }; save(state);
  try { for (const [command, args] of definition.install) await execute(command, args); }
  catch { throw supervisorError(); }
  return { installed: true, label: definition.label, file: definition.file };
}
