; Phaedra per-user Windows installer. Build only from a verified Phaedra-Portable.
; Invoke: ISCC.exe /DProductVersion=1.0.1 installer\Phaedra.iss
#ifndef ProductVersion
  #define ProductVersion "0.0.0"
#endif

[Setup]
AppId=Phaedra.Galante.Win64
AppName=Phaedra
AppVersion={#ProductVersion}
AppVerName=Phaedra {#ProductVersion}
AppPublisher=Phaedra Contributors
AppPublisherURL=https://github.com/mindrapeofficial-wq/phaedra
AppSupportURL=https://github.com/mindrapeofficial-wq/phaedra/issues
DefaultDirName={localappdata}\Programs\Phaedra
DefaultGroupName=Phaedra
DisableDirPage=yes
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
LicenseFile=..\COPYING
SetupIconFile=..\gtk2_ardour\icons\Phaedra.ico
UninstallDisplayIcon={app}\Phaedra.exe
UninstallLogMode=append
CloseApplications=yes
RestartApplications=no
OutputDir=..
OutputBaseFilename=Phaedra-v{#ProductVersion}-Setup-win-x64
Compression=lzma2
SolidCompression=yes

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; Flags: unchecked

[Files]
; The exact, checksummed payload already verified by tools/verify_portable.py.
; Preserve the tree layout, licenses and updater inside the installed app.
Source: "..\Phaedra-Portable\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Phaedra"; Filename: "{app}\Phaedra.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Phaedra"; Filename: "{app}\Phaedra.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Phaedra.exe"; Description: "Iniciar Phaedra"; Flags: nowait postinstall skipifsilent
