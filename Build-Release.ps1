param([string]$PythonPath)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$python = if ($PythonPath) { $PythonPath } else { Join-Path $PSScriptRoot '.venv\Scripts\python.exe' }
& $python -m PyInstaller --noconfirm portable.spec
if ($LASTEXITCODE) { throw 'Desktop build failed.' }
$release = Join-Path $PSScriptRoot 'dist\SeraRelay'
$receiver = Join-Path $release 'receiver'
New-Item -ItemType Directory -Path $receiver -Force | Out-Null
$runtimeFiles = @('bridge.cjs','compat.cjs','external.cjs','history.cjs','incoming.cjs','inline.cjs','media-compat.cjs','review-ui.cjs','window.cjs','package.json','package-lock.json')
foreach ($file in $runtimeFiles) { Copy-Item -LiteralPath (Join-Path 'receiver' $file) -Destination $receiver }
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
$npmCli = Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules\npm\bin\npm-cli.js'
& "$release\_internal\runtime\node.exe" $npmCli ci --omit=dev --prefix $receiver --ignore-scripts
if ($LASTEXITCODE) { throw 'Receiver dependency install failed.' }
Copy-Item -LiteralPath 'DEPLOYMENT.md' -Destination $release
Copy-Item -LiteralPath 'assets' -Destination $release -Recurse -Force
$notices = Join-Path $release 'THIRD-PARTY-NOTICES'
New-Item -ItemType Directory -Path $notices -Force | Out-Null
& $python collect_licenses.py $notices
if ($LASTEXITCODE) { throw 'License collection failed.' }
$package = Join-Path $PSScriptRoot 'dist\release-2.1.0-beta.1'
if (Test-Path -LiteralPath $package) {
  $expected = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist\release-2.1.0-beta.1'))
  if ((Resolve-Path -LiteralPath $package).Path -ne $expected) { throw 'Unexpected release directory.' }
  Remove-Item -LiteralPath $expected -Recurse -Force
}
New-Item -ItemType Directory -Path $package -Force | Out-Null
Copy-Item -LiteralPath $release -Destination $package -Recurse -Force
Copy-Item Install.cmd,Install-Portable.ps1,DEPLOYMENT.md,LICENSE -Destination $package
& $python package_release.py $package 'dist\SeraRelay-2.1.0-beta.1-Windows-x64.zip'
if ($LASTEXITCODE) { throw 'Release packaging failed.' }
Get-FileHash 'dist\SeraRelay-2.1.0-beta.1-Windows-x64.zip' -Algorithm SHA256 | Format-List
