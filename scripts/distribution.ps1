# 在临时目录组包，排除已有稿件、旧版本和本机发布目录中的其他文件。
$ErrorActionPreference = 'Stop'
$meta = cargo metadata --locked --no-deps --format-version 1 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$version = $meta.packages[0].version
$exe = Join-Path $meta.target_directory 'release/quany.exe'
if ((Get-Item $exe).VersionInfo.ProductVersion -ne $version) { throw 'EXE version does not match Cargo.toml' }
$stage = Join-Path ([IO.Path]::GetTempPath()) ("quany-package-" + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($stage)
Copy-Item -LiteralPath $exe -Destination (Join-Path $stage 'QuanY.exe')
Copy-Item -LiteralPath 'LICENSE','NOTICE' -Destination $stage
node scripts/notices.mjs (Join-Path $stage 'THIRD-PARTY-NOTICES.txt')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
[void][IO.Directory]::CreateDirectory((Join-Path $PWD 'release'))
$name = "QuanY-$version-windows-x64.zip"
$archive = Join-Path 'release' $name
Compress-Archive -Path "$stage/*" -DestinationPath $archive -Force
$sha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $PWD 'release/SHA256SUMS.txt'), "$sha  $name" + [char]10)
Write-Output "$name  SHA256=$sha"
