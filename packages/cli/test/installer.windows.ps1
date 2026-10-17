param([ValidateSet('windows-x64', 'windows-x86')][string]$Platform = 'windows-x64')
# Run x86 acceptance in 32-bit PowerShell on the WoW64 CI host.
if ($Platform -eq 'windows-x86' -and [Environment]::Is64BitProcess) {
    & "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -File $PSCommandPath -Platform $Platform
    exit $LASTEXITCODE
}
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$script:expectedVersion = (Get-Content (Join-Path $root 'packages/cli/package.json') -Raw | ConvertFrom-Json).version
$work = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
$oldArchitecture = $env:PROCESSOR_ARCHITECTURE
$oldWowArchitecture = $env:PROCESSOR_ARCHITEW6432
$archive = "collab-$Platform.zip"
$oldLocal = $env:LOCALAPPDATA
$oldPath = $env:Path
$environment = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
$hadUserPath = 'Path' -in $environment.GetValueNames()
$oldUserPath = $environment.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$oldUserPathKind = if ($hadUserPath) { $environment.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
$oldReference = $env:COLLAB_TEST_PATH_REFERENCE
$downloads = Join-Path $work 'downloads'
[void][IO.Directory]::CreateDirectory($downloads)
Copy-Item (Join-Path $env:COLLAB_NATIVE_DOWNLOADS "$archive*") $downloads
function Invoke-RestMethod($Uri) {
    if ($Uri -ne 'https://collab.weez.boo/install.ps1') { throw 'Unexpected installer URL' }
    Get-Content (Join-Path $root 'public/install.ps1') -Raw
}
function Invoke-WebRequest($Uri, [switch]$UseBasicParsing, $OutFile) {
    $base = "https://github.com/Art-of-Technology/collab/releases/download/cli-v$script:expectedVersion/"
    if (!$Uri.StartsWith($base)) { throw 'Unexpected release URL/version' }
    if ($script:selectionOnly) { $script:selectedURL = $Uri; throw 'Selection recorded' }
    $name = $Uri.Substring($base.Length)
    if ($name -notin @($archive, "$archive.sha256")) { throw 'Unexpected archive' }
    Copy-Item -LiteralPath (Join-Path $downloads $name) -Destination $OutFile
}
try {
    # Verify OS architecture wins over the process architecture before any download.
    $script:selectionOnly = $true
    foreach ($case in @(
        @{ process = 'x86'; wow = ''; expected = 'windows-x86' },
        @{ process = 'AMD64'; wow = ''; expected = 'windows-x64' },
        @{ process = 'x86'; wow = 'AMD64'; expected = 'windows-x64' },
        @{ process = 'ARM64'; wow = ''; expected = $null },
        @{ process = 'x86'; wow = 'ARM64'; expected = $null }
    )) {
        $env:PROCESSOR_ARCHITECTURE = $case.process
        $env:PROCESSOR_ARCHITEW6432 = $case.wow
        $script:selectedURL = $null
        $message = ''
        try { irm https://collab.weez.boo/install.ps1 | iex } catch { $message = $_.Exception.Message }
        if ($case.expected) {
            if (!$script:selectedURL -or !$script:selectedURL.EndsWith("/collab-$($case.expected).zip") -or $message -ne 'Selection recorded') { throw 'Wrong architecture selected' }
        } elseif ($script:selectedURL -or $message -notmatch 'Unsupported Windows architecture') { throw 'Unsupported architecture was not refused before download' }
    }
    $script:selectionOnly = $false
    $env:PROCESSOR_ARCHITECTURE = $oldArchitecture
    $env:PROCESSOR_ARCHITEW6432 = $oldWowArchitecture
    # Simulate a native 32-bit OS; the actual process and installed executable are 32-bit.
    if ($Platform -eq 'windows-x86') { $env:PROCESSOR_ARCHITEW6432 = $null }
    $env:LOCALAPPDATA = Join-Path $work 'local app data'
    $bin = Join-Path $env:LOCALAPPDATA 'Collab\bin'
    $oldBin = Join-Path $work 'older cli'
    [void][IO.Directory]::CreateDirectory($oldBin)
    Set-Content (Join-Path $oldBin 'collab.cmd') '@exit /b 99'
    $env:Path = "$oldBin;$bin;$oldPath;$bin"
    $env:COLLAB_TEST_PATH_REFERENCE = $oldBin
    $rawFixture = '%COLLAB_TEST_PATH_REFERENCE%;' + $bin + ';' + $oldUserPath + ';' + $bin
    $environment.SetValue('Path', $rawFixture, [Microsoft.Win32.RegistryValueKind]::ExpandString)
    $machine = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment')
    $machinePath = $machine.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $machineKind = $machine.GetValueKind('Path')
    for ($i = 0; $i -lt 2; $i++) {
        irm https://collab.weez.boo/install.ps1 | iex
        $expected = Join-Path $env:LOCALAPPDATA 'Collab\bin\collab.exe'
        if ((Get-Command collab).Source -ne $expected) { throw 'CLI not available in the current terminal' }
        foreach ($value in @($env:Path, [Environment]::GetEnvironmentVariable('Path', 'User'))) {
            if (($value -split ';')[0] -ne $bin) { throw 'Install directory must lead PATH' }
            if (@($value -split ';' | Where-Object { $_ -eq $bin }).Count -ne 1) { throw 'Install directory duplicated in PATH' }
            if ($oldBin -notin ($value -split ';')) { throw 'Unrelated PATH entry removed' }
        }
        $rawPath = $environment.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $expectedRaw = (@($bin) + @($rawFixture -split ';' | Where-Object { [Environment]::ExpandEnvironmentVariables($_) -ne $bin })) -join ';'
        if ($rawPath -cne $expectedRaw -or $environment.GetValueKind('Path') -ne [Microsoft.Win32.RegistryValueKind]::ExpandString) { throw 'Raw User PATH text or type changed' }
        if ([Environment]::ExpandEnvironmentVariables($rawPath) -ne [Environment]::GetEnvironmentVariable('Path', 'User')) { throw 'User PATH reference did not resolve' }
        if ($machine.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) -cne $machinePath -or $machine.GetValueKind('Path') -ne $machineKind) { throw 'Machine PATH changed' }
        $schema = collab schema | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $schema.version -ne $script:expectedVersion) { throw 'Installed CLI failed' }
    }
    if ($Platform -eq 'windows-x86') {
        $bytes = [IO.File]::ReadAllBytes($expected)
        $pe = [BitConverter]::ToInt32($bytes, 0x3c)
        if ([BitConverter]::ToUInt16($bytes, $pe + 4) -ne 0x14c) { throw 'Installed executable is not x86' }
    }
    $bin = Split-Path $expected
    $persistedPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (@($persistedPath -split ';' | Where-Object { $_ -eq $bin }).Count -ne 1) { throw 'User PATH missing or duplicated' }
    $before = (Get-FileHash $expected).Hash
    Set-Content (Join-Path $downloads "$archive.sha256") (('0' * 64) + "  $archive") -Encoding ascii
    $refused = $false
    try { irm https://collab.weez.boo/install.ps1 | iex } catch { $refused = $_.Exception.Message -match 'Checksum mismatch' }
    if (!$refused -or (Get-FileHash $expected).Hash -ne $before) { throw 'Bad checksum did not preserve the installed executable' }
    if ([Environment]::GetEnvironmentVariable('Path', 'User') -ne $persistedPath) { throw 'Failure changed PATH' }
    # A plain string PATH must retain its type as well.
    $environment.SetValue('Path', $rawFixture, [Microsoft.Win32.RegistryValueKind]::String)
    Copy-Item -LiteralPath (Join-Path $env:COLLAB_NATIVE_DOWNLOADS "$archive.sha256") -Destination (Join-Path $downloads "$archive.sha256")
    irm https://collab.weez.boo/install.ps1 | iex
    if ($environment.GetValueKind('Path') -ne [Microsoft.Win32.RegistryValueKind]::String -or $environment.GetValue('Path') -cne $expectedRaw) { throw 'REG_SZ PATH was changed' }
    # Exercise Node's file creation as well as the compiled Bun executable.
    node --test (Join-Path $root 'packages/cli/test/cli.test.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Node Windows CLI integration tests failed' }
    # Run the full authentication and API suite against the installed executable.
    $env:COLLAB_CLI_EXECUTABLE = $expected
    node --test (Join-Path $root 'packages/cli/test/cli.test.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Installed Windows CLI integration tests failed' }
    Write-Host 'PASS: PowerShell one-command installation, immediate PATH, repeat install, checksum refusal, full CLI suite'
} finally {
    $env:PROCESSOR_ARCHITECTURE = $oldArchitecture
    $env:PROCESSOR_ARCHITEW6432 = $oldWowArchitecture
    $env:LOCALAPPDATA = $oldLocal
    $env:Path = $oldPath
    if ($hadUserPath) { $environment.SetValue('Path', $oldUserPath, $oldUserPathKind) } else { $environment.DeleteValue('Path', $false) }
    $environment.Dispose()
    if ($machine) { $machine.Dispose() }
    $env:COLLAB_TEST_PATH_REFERENCE = $oldReference
    Remove-Item -LiteralPath $work -Recurse -Force
}
