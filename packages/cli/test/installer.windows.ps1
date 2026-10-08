$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$script:expectedVersion = (Get-Content (Join-Path $root 'packages/cli/package.json') -Raw | ConvertFrom-Json).version
$work = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
$oldLocal = $env:LOCALAPPDATA
$oldPath = $env:Path
$environment = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
$hadUserPath = 'Path' -in $environment.GetValueNames()
$oldUserPath = $environment.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$oldUserPathKind = if ($hadUserPath) { $environment.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
$oldReference = $env:COLLAB_TEST_PATH_REFERENCE
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
    $bin = Split-Path $expected
    $persistedPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (@($persistedPath -split ';' | Where-Object { $_ -eq $bin }).Count -ne 1) { throw 'User PATH missing or duplicated' }
    $before = (Get-FileHash $expected).Hash
    Set-Content (Join-Path $downloads 'collab-windows-x64.zip.sha256') (('0' * 64) + '  collab-windows-x64.zip') -Encoding ascii
    $refused = $false
    try { irm https://collab.weez.boo/install.ps1 | iex } catch { $refused = $_.Exception.Message -match 'Checksum mismatch' }
    if (!$refused -or (Get-FileHash $expected).Hash -ne $before) { throw 'Bad checksum did not preserve the installed executable' }
    if ([Environment]::GetEnvironmentVariable('Path', 'User') -ne $persistedPath) { throw 'Failure changed PATH' }
    # A plain string PATH must retain its type as well.
    $environment.SetValue('Path', $rawFixture, [Microsoft.Win32.RegistryValueKind]::String)
    Copy-Item -LiteralPath (Join-Path $env:COLLAB_NATIVE_DOWNLOADS 'collab-windows-x64.zip.sha256') -Destination (Join-Path $downloads 'collab-windows-x64.zip.sha256')
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
    $env:LOCALAPPDATA = $oldLocal
    $env:Path = $oldPath
    if ($hadUserPath) { $environment.SetValue('Path', $oldUserPath, $oldUserPathKind) } else { $environment.DeleteValue('Path', $false) }
    $environment.Dispose()
    if ($machine) { $machine.Dispose() }
    $env:COLLAB_TEST_PATH_REFERENCE = $oldReference
    Remove-Item -LiteralPath $work -Recurse -Force
}
