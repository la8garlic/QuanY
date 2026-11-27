# The public download is the executable itself. License texts are embedded by Vite.
$ErrorActionPreference = 'Stop'
$meta = cargo metadata --locked --no-deps --format-version 1 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$exe = Join-Path $meta.target_directory 'release/quany.exe'
if ((Get-Item $exe).VersionInfo.ProductVersion -ne $meta.packages[0].version) { throw 'EXE version does not match Cargo.toml' }
$dir = [IO.Directory]::CreateDirectory((Join-Path $PWD 'release/distribution')).FullName
$download = Join-Path $dir 'QuanY.exe'
Copy-Item -LiteralPath $exe -Destination $download -Force
$sha = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $dir 'SHA256SUMS.txt'), "$sha  QuanY.exe" + [char]10)
Write-Output "QuanY.exe  SHA256=$sha"
