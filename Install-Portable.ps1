param([string]$Destination = "$env:LOCALAPPDATA\SeraRelay")
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'SeraRelay'
if (!(Test-Path -LiteralPath (Join-Path $source 'SeraRelay.exe'))) { throw 'Extract the complete release ZIP before installing.' }
$resolved = [IO.Path]::GetFullPath($Destination)
if ($resolved -eq [IO.Path]::GetPathRoot($resolved)) { throw 'Choose an application folder.' }
$running = Get-Process SeraRelay -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $resolved 'SeraRelay.exe') }
if ($running) { throw 'Close Sera Relay before updating this installation.' }
New-Item -ItemType Directory -Path $resolved -Force | Out-Null
Get-ChildItem -LiteralPath $source | Copy-Item -Destination $resolved -Recurse -Force
$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $shortcut = $shell.CreateShortcut((Join-Path $folder 'Sera Relay.lnk'))
  $shortcut.TargetPath = Join-Path $resolved 'SeraRelay.exe'
  $shortcut.Arguments = '--inline'
  $shortcut.WorkingDirectory = $resolved
  $shortcut.IconLocation = (Join-Path $resolved 'assets\sera-relay.ico') + ',0'
  $shortcut.Description = 'Local voice transcription, reviewed Living Memory publishing, and follow-up tasks.'
  $shortcut.Save()
}
Write-Host "Installed. Open Sera Relay from your Desktop."
