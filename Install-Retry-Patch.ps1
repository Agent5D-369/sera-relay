param([string]$Destination = "$env:LOCALAPPDATA\SeraRelay")
$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($Destination)
$exe = Join-Path $target 'SeraRelay.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Install Sera Relay 2.1.0-beta.1 first.' }
if (Get-Process SeraRelay -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }) { throw 'Close Sera Relay, then run this patch again.' }
foreach ($name in @('inline.cjs','review-ui.cjs','external.cjs')) {
  $file = Join-Path $target "receiver\$name"
  if (-not (Test-Path -LiteralPath $file)) { throw 'Receiver files are missing. Reinstall the full beta.' }
  if (-not (Test-Path -LiteralPath "$file.before-retry-patch")) { Copy-Item -LiteralPath $file -Destination "$file.before-retry-patch" }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "receiver\$name") -Destination $file -Force
}
Write-Host 'Review and record-link fixes installed. Open Sera Relay again.'
