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

## Integration with the DAW preview build

The DAW's `build-release.yml` workflow builds this component in an independent
MSVC job for pushes to `preview/live` and pull requests targeting that branch.
Manual non-tag builds can opt in with the `include_social` input. Stable tag
builds keep their existing packaging path.

The audio build downloads only the component produced by the same workflow,
then calls:

```bash
bash make_portable.sh --social-bundle artifacts/phaedra-social
python tools/verify_portable.py Phaedra-Portable --require-social
```

The packager includes the helper, loader, client and license notices in the
DAW's own SHA-256 manifest. Verification checks both the DAW manifest and the
social component manifest. The workflow runs `PhaedraSocial.exe --self-test`
again from `Phaedra-Portable/bin`, then retains the existing launcher and DAW
executable checks before creating a ZIP. The ZIP gate also requires all social
assets. A failed requested social component prevents that preview from being
published; it never silently falls back to packaging a DAW without it.

Social preview packages remain on the separate preview update channel. Their
client configuration comes from `social/config.json`, with optional public
repository-variable overrides: `PUBLIC_PHAEDRA_SOCIAL_API_URL`,
`PUBLIC_PHAEDRA_SOCIAL_REGISTRATION_URL`, and
`PUBLIC_PHAEDRA_SOCIAL_ALLOWED_SERVICE_ORIGINS`. Empty variables preserve the
committed configuration. These are public endpoint/origin settings, never
credentials. The workflow has no built-in server address.

The source ZIP also includes `social/build-config.public.json`, copied from
the final package, so that a build using repository variables can be reproduced
with `node social/scripts/build.mjs --config social/build-config.public.json`.

## Runtime and fallback

The client is served from the reserved origin
`https://phaedra-social.invalid` through WebView2's local folder mapping.
There is no local HTTP server. Configure the Stoat instance's CORS policy to
allow this exact origin. The `.invalid` suffix avoids the `.local` lookup delays
documented by Microsoft.

Runtime arguments:

```powershell
PhaedraSocial.exe --self-test
PhaedraSocial.exe --ui-smoke-test
PhaedraSocial.exe --assets C:\path\to\social\dist --fallback-url https://phaedra-chat.vercel.app/
```

`--self-test` verifies required assets, UTF-8 JSON with `schemaVersion: 1`, and
the loader file's presence. It exits without opening UI, creating a profile,
loading WebView2, or making network requests. It does **not** verify installed
WebView2 Runtime, authentication, message delivery, or voice.

`--ui-smoke-test` opens an actual WebView2 controller with a unique temporary
profile. Within 30 seconds it must load the local HTML, stylesheet, logo,
JavaScript modules and the login form after successful configuration parsing.
It does not submit credentials or contact the chat backend; unexpected external
web resource requests fail the test. It exits without fallback dialogs:
`0` means the UI loaded, `10` means runtime/navigation/UI failure, `11` is the
30-second deadline, and `12` means the window closed before readiness.
The temporary profile is cleaned up when possible after COM shutdown.

For CI, run `./tools/phaedra_social/smoke-test.ps1 -BundleRoot <bundle>`; this
wrapper adds a 45-second process limit and captures diagnostics. The Evergreen
WebView2 Runtime must be installed in the Windows test environment. A missing
runtime is a test failure, not a skipped check. This test does not verify
authentication, server availability, or DAW recording/playback.

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
