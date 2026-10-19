import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Windows chmod does not enforce private files; use the OS ACL before touching credentials.
// The script calls .NET only: when the CLI runs from PowerShell 7, the inherited PSModulePath
// resolves cmdlets such as Get-Acl to PowerShell 7 modules that Windows PowerShell cannot load.
const script = `
$ErrorActionPreference = 'Stop'
try {
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
  $request = [Console]::In.ReadToEnd()
  $separator = $request.IndexOf([char]10)
  $create = $request.Substring(0, $separator)
  $path = $request.Substring($separator + 1)
  $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  if ('file' -eq $create) {
    $security = [System.Security.AccessControl.FileSecurity]::new()
    $security.SetAccessRuleProtection($true, $false)
    $security.SetOwner($me)
    $security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($me, 'FullControl', 'Allow'))
    $stream = [System.IO.FileStream]::new($path, [System.IO.FileMode]::CreateNew, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.IO.FileShare]::None, 4096, [System.IO.FileOptions]::None, $security)
    $stream.Dispose()
  } elseif ('true' -eq $create -and ![System.IO.Directory]::Exists($path) -and ![System.IO.File]::Exists($path)) {
    $security = [System.Security.AccessControl.DirectorySecurity]::new()
    $security.SetAccessRuleProtection($true, $false)
    $security.SetOwner($me)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $security.AddAccessRule($rule)
    [void][System.IO.Directory]::CreateDirectory($path, $security)
  }
  $attributes = [System.IO.File]::GetAttributes($path)
  if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }
  if (($attributes -band [System.IO.FileAttributes]::Directory) -ne 0) { $acl = [System.IO.Directory]::GetAccessControl($path) }
  else { $acl = [System.IO.File]::GetAccessControl($path) }
  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $me.Value) { exit 1 }
  $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
  if ($null -eq $raw.DiscretionaryAcl) { exit 1 }
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($me.Value, 'S-1-5-18', 'S-1-5-32-544')) { exit 1 }
  }
  exit 0
} catch { exit 1 }
`;

export function windowsAcl(target, create = false) {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    input: `${create}\n${target}`, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 4096,
  });
  return result.status === 0;
}
