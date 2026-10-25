#define AppName "Phaedra"
#ifndef AppVersion
#define AppVersion "1.0.9"
#endif
#ifndef PortableRoot
#define PortableRoot "Phaedra-Portable"
#endif

[Setup]
AppId={{D5A62C7D-9E84-4D6D-9D52-2570943E3C11}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName=Phaedra
AppPublisher=Galante Studio
DefaultDirName={localappdata}\Programs\Phaedra by Galante
UsePreviousAppDir=no
DefaultGroupName=Phaedra
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
MinVersion=10.0
WizardStyle=modern dark
WizardBackColor=#1D1930
WizardImageBackColor=#1D1930
WizardSmallImageBackColor=#1D1930
WizardSmallImageFile={#PortableRoot}\share\ardour8\resources\Phaedra-icon_256px.png
SetupIconFile={#PortableRoot}\share\ardour8\icons\Phaedra.ico
UninstallDisplayIcon={app}\Phaedra.exe
OutputDir=.
OutputBaseFilename=Phaedra-Instalador-Windows-x64
Compression=lzma2
SolidCompression=yes
ShowLanguageDialog=no
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}.0
VersionInfoDescription=Instalador de Phaedra
VersionInfoCompany=Galante Studio
VersionInfoProductName=Phaedra

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Accesos directos:"; Flags: checkedonce

[Files]
Source: "{#PortableRoot}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{userprograms}\Phaedra"; Filename: "{app}\Phaedra.exe"; WorkingDir: "{app}"; IconFilename: "{app}\Phaedra.exe"
Name: "{userdesktop}\Phaedra"; Filename: "{app}\Phaedra.exe"; WorkingDir: "{app}"; IconFilename: "{app}\Phaedra.exe"; Tasks: desktopicon

[InstallDelete]
Type: files; Name: "{userprograms}\Phaedra by Galante.lnk"
Type: files; Name: "{userdesktop}\Phaedra by Galante.lnk"

[Run]
Filename: "{app}\Phaedra.exe"; Description: "Abrir Phaedra"; Flags: nowait postinstall skipifsilent

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel1.Caption := 'Bienvenido a Phaedra';
  WizardForm.WelcomeLabel2.Caption :=
    'Tu estudio musical está a un paso de abrirse.' + #13#10 + #13#10 +
    'El instalador copiará Phaedra y creará su acceso directo. ' +
    'La configuración de audio se elegirá la primera vez que abras la aplicación.';
end;
