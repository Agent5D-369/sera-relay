; Sera Relay per-user installer. Build: ISCC /DAppVersion=x /DSourceDir=<dist\SeraRelay> /DOutputDir=<dist> SeraRelay.iss
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist\SeraRelay"
#endif
#ifndef OutputDir
  #define OutputDir "..\dist"
#endif

[Setup]
AppId={{2A465F68-4959-4F95-B316-06F5934E1904}
AppName=Sera Relay
AppVersion={#AppVersion}
AppVerName=Sera Relay {#AppVersion}
AppPublisher=Sera Relay contributors
AppPublisherURL=https://github.com/Agent5D-369/sera-relay
AppSupportURL=https://github.com/Agent5D-369/sera-relay/blob/main/SUPPORT.md
; Same folder as the earlier ZIP installer, so this upgrades it in place.
DefaultDirName={localappdata}\SeraRelay
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=SeraRelay-Windows-Setup
SetupIconFile=..\assets\sera-relay.ico
UninstallDisplayIcon={app}\assets\sera-relay.ico
UninstallDisplayName=Sera Relay
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "desktopicon"; Description: "Add a Desktop shortcut"

[InstallDelete]
; Replace the program cleanly on upgrade. Transcripts, the WhatsApp link and the Sera credential live in
; %USERPROFILE%\.whatsapp-transcriber and are never touched by install, upgrade or uninstall.
Type: filesandordirs; Name: "{app}\_internal"
Type: filesandordirs; Name: "{app}\receiver"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Sera Relay"; Filename: "{app}\SeraRelay.exe"; Parameters: "--inline"; WorkingDir: "{app}"; IconFilename: "{app}\assets\sera-relay.ico"; Comment: "Transcribe WhatsApp voice notes on this PC."
Name: "{userdesktop}\Sera Relay"; Filename: "{app}\SeraRelay.exe"; Parameters: "--inline"; WorkingDir: "{app}"; IconFilename: "{app}\assets\sera-relay.ico"; Comment: "Transcribe WhatsApp voice notes on this PC."; Tasks: desktopicon

[Run]
Filename: "{app}\SeraRelay.exe"; Parameters: "--inline"; Description: "Open Sera Relay now"; Flags: nowait postinstall skipifsilent
