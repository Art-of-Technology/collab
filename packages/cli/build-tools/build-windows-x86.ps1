$ErrorActionPreference = 'Stop'
$cli = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dist = Join-Path $cli 'dist'
[void][IO.Directory]::CreateDirectory($dist)
# Node supplies a supported x86 runtime; Bun only compiles 64-bit Windows targets.
$version = '22.23.3'
$runtime = Join-Path $dist 'node-x86.exe'
Invoke-WebRequest "https://nodejs.org/dist/v$version/win-x86/node.exe" -UseBasicParsing -OutFile $runtime
if ((Get-FileHash $runtime -Algorithm SHA256).Hash -ne 'a8aa72dda43af5357d0a502548a54e402d4f7643be221662624a2cc876cd37bb') { throw 'Node x86 checksum mismatch' }
if ((& $runtime -p 'process.arch') -ne 'ia32' -or $LASTEXITCODE -ne 0) { throw 'Expected a runnable 32-bit Node runtime' }
Invoke-WebRequest "https://raw.githubusercontent.com/nodejs/node/v$version/LICENSE" -UseBasicParsing -OutFile (Join-Path $dist 'NODE-LICENSE.txt')
bun build (Join-Path $cli 'bin/collab.mjs') --target=node --format=cjs --outfile (Join-Path $dist 'collab.cjs')
if ($LASTEXITCODE -ne 0) { throw 'CLI bundling failed' }
$config = @{
    main = (Join-Path $dist 'collab.cjs')
    output = (Join-Path $dist 'collab.blob')
    disableExperimentalSEAWarning = $true
    useSnapshot = $false
    useCodeCache = $false
    execArgvExtension = 'none'
} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $dist 'sea.json'), $config)
& $runtime --experimental-sea-config (Join-Path $dist 'sea.json')
if ($LASTEXITCODE -ne 0) { throw 'SEA generation failed' }
Copy-Item -LiteralPath $runtime -Destination (Join-Path $dist 'collab.exe')
npm.cmd ci --ignore-scripts --prefix $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw 'Build tools installation failed' }
node (Join-Path $PSScriptRoot 'node_modules/postject/dist/cli.js') (Join-Path $dist 'collab.exe') NODE_SEA_BLOB (Join-Path $dist 'collab.blob') --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if ($LASTEXITCODE -ne 0) { throw 'SEA injection failed' }
& (Join-Path $dist 'collab.exe') schema | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Packaged x86 CLI could not run' }
