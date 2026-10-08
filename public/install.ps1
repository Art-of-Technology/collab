function Install-Collab {
    $ErrorActionPreference = 'Stop'
    $version = '0.1.1'
    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    if ($env:OS -ne 'Windows_NT' -or $architecture -ne 'AMD64') { throw 'This installer requires Windows x64. Use install.sh on macOS/Linux.' }
    $archive = 'collab-windows-x64.zip'
    $base = "https://github.com/Art-of-Technology/collab/releases/download/cli-v$version"
    $work = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
    $bin = Join-Path $env:LOCALAPPDATA 'Collab\bin'
    $staged = $null
    [void][IO.Directory]::CreateDirectory($work)
    try {
        Invoke-WebRequest "$base/$archive" -UseBasicParsing -OutFile (Join-Path $work $archive)
        Invoke-WebRequest "$base/$archive.sha256" -UseBasicParsing -OutFile (Join-Path $work "$archive.sha256")
        $checksum = [IO.File]::ReadAllText((Join-Path $work "$archive.sha256")).Trim()
        if ($checksum -notmatch '^([0-9a-fA-F]{64})  collab-windows-x64\.zip$') { throw 'Invalid checksum file.' }
        if ((Get-FileHash (Join-Path $work $archive) -Algorithm SHA256).Hash -ne $Matches[1]) { throw 'Checksum mismatch. Nothing installed.' }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $work $archive))
        try {
            $entry = $zip.GetEntry('collab-windows-x64/collab.exe')
            if (!$entry) { throw 'Executable missing from archive.' }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $work 'collab.exe'))
        } finally { $zip.Dispose() }
        & (Join-Path $work 'collab.exe') schema | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Downloaded CLI could not run.' }
        [void][IO.Directory]::CreateDirectory($bin)
        $staged = Join-Path $bin ([IO.Path]::GetRandomFileName())
        Copy-Item -LiteralPath (Join-Path $work 'collab.exe') -Destination $staged
        $destination = Join-Path $bin 'collab.exe'
        if (Test-Path -LiteralPath $destination) { [IO.File]::Replace($staged, $destination, [System.Management.Automation.Language.NullString]::Value) }
        else { [IO.File]::Move($staged, $destination) }
        $staged = $null
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        $userPath = (@($bin) + @($userPath -split ';' | Where-Object { $_ -and $_ -ne $bin })) -join ';'
        [Environment]::SetEnvironmentVariable('Path', $userPath, 'User')
        $env:Path = (@($bin) + @($env:Path -split ';' | Where-Object { $_ -and $_ -ne $bin })) -join ';'
        Write-Host "Collab $version installed. Run collab --help in this terminal."
    } finally {
        if ($staged -and (Test-Path -LiteralPath $staged)) { Remove-Item -LiteralPath $staged -Force }
        Remove-Item -LiteralPath $work -Recurse -Force
    }
}
Install-Collab
