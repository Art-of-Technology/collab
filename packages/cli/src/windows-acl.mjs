import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Windows chmod does not enforce private files; use the OS ACL before touching credentials.
const script = `
$ErrorActionPreference = 'Stop'
try {
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($request.create -and !(Test-Path -LiteralPath $request.path)) {
    $security = [System.Security.AccessControl.DirectorySecurity]::new()
    $security.SetAccessRuleProtection($true, $false)
    $security.SetOwner($me)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $security.AddAccessRule($rule)
    [void][System.IO.Directory]::CreateDirectory($request.path, $security)
  }
  if (([System.IO.File]::GetAttributes($request.path) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }
  $acl = Get-Acl -LiteralPath $request.path
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
    input: JSON.stringify({ path: target, create }), encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 4096,
  });
  return result.status === 0;
}
