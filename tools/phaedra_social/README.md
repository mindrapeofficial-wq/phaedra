# Phaedra Social: isolated Windows host

This prototype opens the Phaedra social client in a separate Win32 window and
process. It does not link to Ardour, run on an audio thread, or expose native
commands to JavaScript. It is a companion window, not a docked GTK panel.

## Build

On Windows x64, install Visual Studio 2022 with Desktop development with C++,
CMake, a supported .NET SDK (for NuGet signature verification), and PowerShell
7.2 or later. Generate the frontend under `social/dist` first, then run from the
repository root:

```powershell
pwsh -File tools/phaedra_social/build.ps1 -ClientDist social/dist -OutputDir artifacts/phaedra-social
```

The script restores the fixed stable `Microsoft.Web.WebView2` version
**1.0.4314.35**, verifies the NuGet package signature and Microsoft loader
signature, builds using MSVC `/MT`, retains SDK license notices, and writes a
bundle manifest with SHA-256 hashes. There is no Waf/MSYS2 dependency and no
change to the audio-engine build.

Output:

```text
artifacts/phaedra-social/bin/PhaedraSocial.exe
artifacts/phaedra-social/bin/WebView2Loader.dll
artifacts/phaedra-social/share/phaedra-social/
artifacts/phaedra-social/licenses/
artifacts/phaedra-social/social-bundle.json
```

The Windows portable packager accepts this reviewed bundle explicitly:

```powershell
python tools/package_windows.py --social-bundle artifacts/phaedra-social
```

Without that option it packages the existing DAW as before. A requested bundle
must be complete and its hashes valid; a broken social build is not silently
treated as a successful integrated build.

## Runtime and fallback

The client is served from the reserved origin
`https://phaedra-social.invalid` through WebView2's local folder mapping.
There is no local HTTP server. Configure the Stoat instance's CORS policy to
allow this exact origin. The `.invalid` suffix avoids the `.local` lookup delays
documented by Microsoft.

Runtime arguments:

```powershell
PhaedraSocial.exe --self-test
PhaedraSocial.exe --assets C:\path\to\social\dist --fallback-url https://phaedra-chat.vercel.app/
```

`--self-test` verifies required assets, UTF-8 JSON with `schemaVersion: 1`, and
the loader file's presence. It exits without opening UI, creating a profile,
loading WebView2, or making network requests. It does **not** verify installed
WebView2 Runtime, authentication, message delivery, or voice.

On a normal launch, the loader is loaded explicitly from the executable's
directory. If the Evergreen WebView2 Runtime is absent or the panel fails,
the helper offers to open the existing Phaedra chat in the default browser.
There is no automatic runtime installation. User profile/cache data lives in
`%LOCALAPPDATA%\Phaedra\Social`, not the installation directory. The web
client owns its in-memory authentication; the host never receives tokens.

The host keeps top-level/frame navigation on its own origin, opens only
user-initiated HTTP(S) links externally, denies requested permissions including
microphone/camera, disables downloads and native host objects, and disables
WebMessage delivery. Voice/video, file downloads, and DAW control are outside
this prototype. The renderer can fail independently of the DAW process.

## Sources and licenses

- [Pinned Microsoft SDK package](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4314.35)
- [Microsoft: Win32 WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/win32)
- [Microsoft: runtime and loader distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)
- [Microsoft: virtual host mapping](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_3)

New host code in this directory is MIT licensed; see `LICENSE`. The DAW retains
its existing licenses. The Microsoft SDK/runtime has its own license and is
not part of the open-source Stoat backend; SDK notices accompany the helper.
