$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$script:expectedVersion = (Get-Content (Join-Path $root 'packages/cli/package.json') -Raw | ConvertFrom-Json).version
$work = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
$oldLocal = $env:LOCALAPPDATA
$oldPath = $env:Path
$oldUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$downloads = Join-Path $work 'downloads'
[void][IO.Directory]::CreateDirectory($downloads)
Copy-Item (Join-Path $env:COLLAB_NATIVE_DOWNLOADS 'collab-windows-x64.zip*') $downloads
function Invoke-RestMethod($Uri) {
    if ($Uri -ne 'https://collab.weez.boo/install.ps1') { throw 'Unexpected installer URL' }
    Get-Content (Join-Path $root 'public/install.ps1') -Raw
}
function Invoke-WebRequest($Uri, [switch]$UseBasicParsing, $OutFile) {
    $base = "https://github.com/Art-of-Technology/collab/releases/download/cli-v$script:expectedVersion/"
    if (!$Uri.StartsWith($base)) { throw 'Unexpected release URL/version' }
    $name = $Uri.Substring($base.Length)
    if ($name -notin @('collab-windows-x64.zip', 'collab-windows-x64.zip.sha256')) { throw 'Unexpected archive' }
    Copy-Item -LiteralPath (Join-Path $downloads $name) -Destination $OutFile
}
try {
    $env:LOCALAPPDATA = Join-Path $work 'local app data'
    for ($i = 0; $i -lt 2; $i++) {
        irm https://collab.weez.boo/install.ps1 | iex
        $expected = Join-Path $env:LOCALAPPDATA 'Collab\bin\collab.exe'
        if ((Get-Command collab).Source -ne $expected) { throw 'CLI not available in the current terminal' }
        $schema = collab schema | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $schema.version -ne $script:expectedVersion) { throw 'Installed CLI failed' }
    }
    $bin = Split-Path $expected
    $persistedPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (@($persistedPath -split ';' | Where-Object { $_ -eq $bin }).Count -ne 1) { throw 'User PATH missing or duplicated' }
    $before = (Get-FileHash $expected).Hash
    Set-Content (Join-Path $downloads 'collab-windows-x64.zip.sha256') (('0' * 64) + '  collab-windows-x64.zip') -Encoding ascii
    $refused = $false
    try { irm https://collab.weez.boo/install.ps1 | iex } catch { $refused = $_.Exception.Message -match 'Checksum mismatch' }
    if (!$refused -or (Get-FileHash $expected).Hash -ne $before) { throw 'Bad checksum did not preserve the installed executable' }
    if ([Environment]::GetEnvironmentVariable('Path', 'User') -ne $persistedPath) { throw 'Failure changed PATH' }
    # Run the full authentication and API suite against the installed executable.
    $env:COLLAB_CLI_EXECUTABLE = $expected
    node --test (Join-Path $root 'packages/cli/test/cli.test.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Installed Windows CLI integration tests failed' }
    Write-Host 'PASS: PowerShell one-command installation, immediate PATH, repeat install, checksum refusal, full CLI suite'
} finally {
    $env:LOCALAPPDATA = $oldLocal
    $env:Path = $oldPath
    [Environment]::SetEnvironmentVariable('Path', $oldUserPath, 'User')
    Remove-Item -LiteralPath $work -Recurse -Force
}
