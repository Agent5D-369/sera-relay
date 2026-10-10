param([string]$PythonPath, [switch]$SkipInstaller)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$python = if ($PythonPath) { $PythonPath } else { Join-Path $PSScriptRoot '.venv\Scripts\python.exe' }
$version = (& $python -c "from platform_support import VERSION; print(VERSION)").Trim()
& $python -m PyInstaller --noconfirm portable.spec
if ($LASTEXITCODE) { throw 'Desktop build failed.' }
$release = Join-Path $PSScriptRoot 'dist\SeraRelay'
$receiver = Join-Path $release 'receiver'
New-Item -ItemType Directory -Path $receiver -Force | Out-Null
$runtimeFiles = @('bridge.cjs','compat.cjs','external.cjs','focus.cjs','history.cjs','incoming.cjs','inline.cjs','media-compat.cjs','review-ui.cjs','window.cjs','package.json','package-lock.json')
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

# Portable ZIP for people who prefer to extract and run Install.cmd.
$package = Join-Path $PSScriptRoot "dist\release-$version"
if (Test-Path -LiteralPath $package) {
  $expected = [IO.Path]::GetFullPath($package)
  if ((Resolve-Path -LiteralPath $package).Path -ne $expected) { throw 'Unexpected release directory.' }
  Remove-Item -LiteralPath $expected -Recurse -Force
}
New-Item -ItemType Directory -Path $package -Force | Out-Null
Copy-Item -LiteralPath $release -Destination $package -Recurse -Force
Copy-Item Install.cmd,Install-Portable.ps1,DEPLOYMENT.md,LICENSE -Destination $package
& $python package_release.py $package 'dist\SeraRelay-Windows-x64-portable.zip'
if ($LASTEXITCODE) { throw 'Release packaging failed.' }

# One-file installer: per-user, no administrator rights, Start menu and Desktop shortcuts, uninstaller.
if (-not $SkipInstaller) {
  $iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $iscc) { throw 'Inno Setup 6 is required to build the installer. Install it, or pass -SkipInstaller.' }
  & $iscc /Qp "/DAppVersion=$version" "/DSourceDir=$release" "/DOutputDir=$(Join-Path $PSScriptRoot 'dist')" 'installer\SeraRelay.iss'
  if ($LASTEXITCODE) { throw 'Installer build failed.' }
}
Get-ChildItem dist\SeraRelay-Windows-* | Get-FileHash -Algorithm SHA256 | Select-Object Hash, Path | Format-List
