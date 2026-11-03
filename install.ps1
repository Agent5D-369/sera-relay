# Sera Relay one-line installer for Windows 10 and 11 (64-bit). Paste into PowerShell:
#   irm https://raw.githubusercontent.com/Agent5D-369/sera-relay/main/install.ps1 | iex
# Downloads the newest release's installer, checks its SHA-256, installs for your account only, and opens the app.
# To install on another drive, set the folder first (the download is stored there too):
#   $env:SERA_RELAY_DIR = 'D:\SeraRelay'; irm https://raw.githubusercontent.com/Agent5D-369/sera-relay/main/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'Agent5D-369/sera-relay'
$name = 'SeraRelay-Windows-Setup.exe'

if (-not [Environment]::Is64BitOperatingSystem) { throw 'Sera Relay needs 64-bit Windows 10 or 11.' }
Write-Host 'Finding the newest Sera Relay release...'
$headers = @{ 'User-Agent' = 'sera-relay-installer'; 'Accept' = 'application/vnd.github+json' }
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases?per_page=10" -Headers $headers |
  Where-Object { $_.assets.name -contains $name } | Select-Object -First 1
if (-not $release) { throw "No release with $name yet. See https://github.com/$repo/releases" }
$asset = $release.assets | Where-Object name -eq $name
$sums = $release.assets | Where-Object name -eq 'SHA256SUMS.txt'

$target = $env:SERA_RELAY_DIR
if ($target) {
  $target = [IO.Path]::GetFullPath($target)
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  $download = $target
} else { $download = [IO.Path]::GetTempPath() }
$setup = Join-Path $download $name
Write-Host ("Downloading Sera Relay {0} ({1:N0} MB). This can take a few minutes..." -f $release.tag_name, ($asset.size / 1MB))
Invoke-WebRequest $asset.browser_download_url -OutFile $setup -UseBasicParsing -Headers $headers
if ($sums) {
  # GitHub serves the checksum file as binary, so save it and read it as text.
  $sumsFile = Join-Path $download 'SeraRelay-SHA256SUMS.txt'
  Invoke-WebRequest $sums.browser_download_url -OutFile $sumsFile -UseBasicParsing -Headers $headers
  $expected = ((Get-Content -LiteralPath $sumsFile) | Where-Object { $_ -match [regex]::Escape($name) } |
    Select-Object -First 1) -replace '\s.*$', ''
  Remove-Item -LiteralPath $sumsFile -Force
  $actual = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash
  if (-not $expected -or $actual -ne $expected.Trim().ToUpperInvariant()) {
    Remove-Item -LiteralPath $setup -Force
    throw 'The download did not match the published checksum. Nothing was installed. Try again.'
  }
  Write-Host 'Checksum verified.'
}

Write-Host 'Installing for your Windows account (no administrator rights needed)...'
$setupArgs = @('/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/TASKS=desktopicon')
if ($target) { $setupArgs += "/DIR=`"$target`"" }
$process = Start-Process -FilePath $setup -ArgumentList $setupArgs -Wait -PassThru
Remove-Item -LiteralPath $setup -Force -ErrorAction SilentlyContinue
if ($process.ExitCode) { throw "Setup stopped with code $($process.ExitCode). Close Sera Relay if it is open, then try again." }

# The app may live on another drive (chosen now or at an earlier install); setup records where.
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{2A465F68-4959-4F95-B316-06F5934E1904}_is1'
$folder = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).InstallLocation
if (-not $folder) { $folder = Join-Path $env:LOCALAPPDATA 'SeraRelay' }
$app = Join-Path $folder 'SeraRelay.exe'
$browsers = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
if (-not ($browsers | Where-Object { Test-Path -LiteralPath $_ })) { Write-Warning 'Sera Relay needs Google Chrome or Microsoft Edge to show WhatsApp. Install one, then open Sera Relay.' }
Write-Host 'Installed. Opening Sera Relay. Next time, open it from the Start menu or your Desktop.'
Start-Process -FilePath $app -ArgumentList '--inline'
