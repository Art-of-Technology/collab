import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CliError } from './client.mjs';

const error = message => new CliError('worker_service', message, 5);
const digest = value => createHash('sha256').update(value).digest('hex');
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const quote = value => `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
export function serviceDefinition(identity, args, cwd, configDir, { platform = process.platform, home = os.homedir(), uid = process.getuid?.() } = {}) {
  if ([...args, cwd, configDir].some(value => /[\x00-\x1f]/.test(value))) throw error('Service paths must not contain control characters.');
  const label = `collab-worker-${identity}`;
  if (platform === 'darwin') return { label, file: path.join(home, 'Library/LaunchAgents', `${label}.plist`),
    content: `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(cwd)}</string><key>EnvironmentVariables</key><dict><key>COLLAB_CONFIG_DIR</key><string>${xml(configDir)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>30</integer></dict></plist>`,
    install: [['launchctl', ['bootstrap', `gui/${uid}`, path.join(home, 'Library/LaunchAgents', `${label}.plist`)]]],
    uninstall: [['launchctl', ['bootout', `gui/${uid}/${label}`]]] };
  if (platform === 'linux') {
    const unit = value => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;
    return { label, file: path.join(home, '.config/systemd/user', `${label}.service`),
      content: `[Unit]\nDescription=Collab dedicated worker\nStartLimitIntervalSec=3600\nStartLimitBurst=4\n[Service]\nType=simple\nExecStart=:${args.map(unit).join(' ')}\nWorkingDirectory=${unit(cwd)}\nEnvironment=${unit(`COLLAB_CONFIG_DIR=${configDir}`)}\nRestart=on-failure\nRestartSec=30\nTimeoutStopSec=15\nKillMode=control-group\n[Install]\nWantedBy=default.target\n`,
      install: [['systemctl', ['--user', 'daemon-reload']], ['systemctl', ['--user', 'enable', '--now', `${label}.service`]]],
      uninstall: [['systemctl', ['--user', 'disable', '--now', `${label}.service`]]] };
  }
  if (platform === 'win32') return { label, file: path.join(configDir, `${label}.xml`),
    content: `<?xml version="1.0" encoding="UTF-8"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers><Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings><Actions Context="Author"><Exec><Command>${xml(args[0])}</Command><Arguments>${xml(args.slice(1).map(quote).join(' '))}</Arguments><WorkingDirectory>${xml(cwd)}</WorkingDirectory></Exec></Actions></Task>`,
    install: [['schtasks.exe', ['/Create', '/TN', label, '/XML', path.join(configDir, `${label}.xml`)]], ['schtasks.exe', ['/Run', '/TN', label]]],
    uninstall: [['schtasks.exe', ['/Delete', '/TN', label, '/F']]] };
  throw error('Only macOS launchd, Linux systemd user, and Windows user Scheduled Tasks are supported.');
}
export async function workerService(name, identity, options, state, save, dependencies = {}) {
  const configDir = path.resolve(process.env.COLLAB_CONFIG_DIR || path.join(os.homedir(), '.config/collab'));
  const args = [...(dependencies.command || (/^node(?:\.exe)?$/.test(path.basename(process.execPath)) ? [process.execPath, fileURLToPath(new URL('../bin/collab.mjs', import.meta.url))] : [process.execPath])),
    'worker', 'run', '--agent', options.agent, '--workspace', options.workspace, '--config-dir', configDir, ...(options.profile ? ['--profile', options.profile] : [])];
  const definition = serviceDefinition(identity, args, state.config.cwd, configDir, dependencies);
  if (options['dry-run']) return { ...definition, installed: false, dryRun: true };
  const execute = dependencies.execute || (async (command, args) => { try { await promisify(execFile)(command, args, { timeout: 15000, windowsHide: true, shell: false, maxBuffer: 65536 }); } catch { throw error('OS supervisor action failed. Inspect the named service; no other service was changed.'); } });
  const owned = state.service?.file === definition.file && state.service?.hash === digest(definition.content);
  if (fs.existsSync(definition.file) && (!owned || fs.readFileSync(definition.file, 'utf8') !== definition.content)) throw error('Existing service definition is not the saved owned definition.');
  if (name === 'worker uninstall') {
    if (!owned) throw error('No matching owned installation is recorded.');
    if ((state.runId && !state.closed) || (state.active && state.active.closed !== true)) throw error('Owned worker closure must be confirmed before uninstalling.');
    for (const [command, args] of definition.uninstall) await execute(command, args);
    fs.unlinkSync(definition.file); delete state.service; save(state);
    return { uninstalled: true, label: definition.label };
  }
  if (state.service) throw error('Uninstall the existing owned service before reinstalling.');
  fs.mkdirSync(path.dirname(definition.file), { recursive: true });
  fs.writeFileSync(definition.file, definition.content, { mode: 0o600, flag: 'wx' });
  state.service = { file: definition.file, hash: digest(definition.content), label: definition.label }; save(state);
  for (const [command, args] of definition.install) await execute(command, args);
  return { installed: true, label: definition.label, file: definition.file };
}
