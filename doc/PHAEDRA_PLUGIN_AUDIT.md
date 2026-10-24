# Phaedra: Vital VST3 integration and built-in plugin audit

## Scope of this change (2026-10-25)

Phaedra continues to be a free DAW. This change adds a **first-class, user-installed**
Vital workflow without redistributing Vital's official binary or factory content:

1. The instrument selector prefers an already discovered **Vital VST3** when adding
   a MIDI track, while preserving the user's explicit selection and falling back
   to Fluid Synth / Reasonable Synth when Vital is absent.
2. The Windows portable launcher exposes `Plugins\VST3` to the host's VST3
   scanner and preserves existing `VST3_PATH` locations.
3. `Install-Vital.bat` launches a user-side PowerShell helper. It copies the
   **user's own officially installed** Vital.vst3 into the portable install.
   The helper does not download Vital, bypass authentication, copy presets, or
   put any Vital files into the Phaedra Git repository/release.
4. The scanner checks `VST3_PATH` on every refresh, even for previously saved
   user profiles (in addition to the configured custom path).

**Important:** Vital is *not* automatically bundled into the public Phaedra ZIP.
Bundling either the official binary or the GPLv3-source build requires a separate
license/release decision and review; the two routes have different obligations.
Likewise, "integrated" here means integrated host workflow, not statically linked
Vital DSP. A successful Windows runtime test has not yet been completed.

### Installation steps for a Windows tester

1. Obtain the free official Vital Basic installer from <https://vital.audio/>.
2. Install its VST3 edition to the conventional Windows location.
3. In the extracted Phaedra Portable directory, double-click
   `Install-Vital.bat` to copy **your local** VST3 into
   `Plugins\VST3\Vital.vst3`.
4. Restart Phaedra, enable VST3 scanning in preferences, rescan plugins if
   necessary, then create a MIDI track. Vital should be pre-selected.
5. Check GUI rendering, MIDI input, sound output, program state save/reload,
   automation, plugin scanning, crash recovery and project reopening.
6. If the copy step is not used, the global official VST3 installation
   can still be found through the ordinary Windows VST3 scan paths.

If Vital is not installed, the helper reports the official download URL and
Phaedra retains its previous default instrument as a fallback.

### Legal / publishing restrictions

- Vital *source* has GPLv3 licensing: <https://github.com/mtytel/vital>.
- Vital official binary/media have separate end-user and content terms:
  <https://vital.audio/eula/>.
- The source repository prohibits using "Vital" and other associated names
  as branding for *new builds* made from source, and excludes factory presets
  from the redistributable source license.
- Therefore this PR does **not** ship source-built renamed versions, patch
  licensing restrictions out, or include third-party .vst3 binaries.
- Any future offline built-in synthesizer derived from Vital source requires
  complying with GPLv3 (including source distribution and notices), auditing
  dependencies/resources, not using restricted branding, and ensuring compatibility
  with the Phaedra project's full license obligations.
- Do not distribute a Phaedra ZIP that a user has augmented with their personal
  Vital installation unless authorized by the relevant license terms.

## Current eight LV2 plugin modules found in this repository

The Waf sources live under `libs/plugins/` and are expected to build into
`build/libs/LV2/` (the Windows portable script copies that directory).
This is a **source-tree inventory**, not a confirmation that any particular
Windows release ZIP built successfully or contains all eight.

| Current source module | Role | Strong free alternative to evaluate | Priority |
| --- | --- | --- | --- |
| ACE Reasonable Synth | Minimal default MIDI synthesizer | **Vital** (wavetable; user-installed), **Surge XT** (open source) | P0 |
| ACE Fluid Synth | SoundFont / GM instrument | **Decent Sampler** for sampled instruments; keep Fluid Synth for SF2/GM compatibility | P2 |
| ACE EQ | Channel equalizer | **TDR Nova** (dynamic EQ) / **Venn Free EQ**; LSP Parametric EQ source option | P1 |
| ACE Compressor | Mono / stereo dynamics | **TDR Kotelnikov** / **Venn Free Comp**; LSP Compressor source option | P1 |
| ACE Expander | Expander / gate-like dynamics | **Venn Free Gate**; LSP Expander / Gate source option | P1 |
| ACE Reverb | Basic algorithmic reverb | **Dragonfly Reverb**, **Venn Free Reverb** or **Valhalla Supermassive** | P1 |
| ACE Delay | Delay with BPM sync | **Venn Free Delay** or a new Phaedra beat-synced native delay | P2 |
| ACE Vapor | Binaural / multichannel rendering | **IEM Plug-in Suite** where its channel layouts and renderers match the route | P2 |

Additional tools in `share/scripts/` are Lua scripts, some of which act as DSP
processors, editors or workflows. Those are distinct from the eight compiled LV2
plugin modules above. Built-in route processors (faders, pans, meters) are another
distinct category. Third-party VSTs/LV2s installed on a user's PC cannot be
enumerated solely from the source repository.

### Product strategy

**Do not delete or silently replace existing ACE plugin identifiers.** Old
projects reference plugin IDs, ports, automation parameters and plugin state.
An external plugin with a similar function is *not* a drop-in binary replacement.
Keep older ACE modules for session compatibility while new projects receive a
curated recommended-effects palette. Offer manual, reversible migration and tests.

- **P0**: stable Windows VST3 scanning; Vital detection/default; local-only copy
  helper; smoke-test new MIDI tracks and projects.
- **P1**: ship original Phaedra-quality native EQ, compressor, reverb and
  limiter, or curate legally redistributable third-party bundles with explicit
  licenses, source, and notices. Prefer a consistent Phaedra UI for built-ins.
- **P2**: replace legacy workflow (not project file IDs) with stronger delay,
  gate, mastering meters, pitch correction, spectral editing and drum tools.
- **P3**: consider a self-contained Vital-inspired/derived wavetable instrument
  only after the license, trademark, presets and Windows build pipeline pass review.

For Windows, **Venn Audio Free Suite** is a simple coherent VST3 upgrade
(EQ, comp, gate, delay, reverb and more) with no registration: see link below.
LSP source is open, but obtaining its 2026 Windows builds may involve the
publisher's separate personal-build distribution site; do not represent those
Windows binaries as an instantly available no-account free bundle.

Useful official links (download != redistribution authorization):
- <https://www.vennaudio.com/free-suite/> 
- <https://vital.audio/>
- <https://surge-synthesizer.github.io/>
- <https://www.tokyodawn.net/>
- <https://dragonflyreverb.com/>
- <https://lsp-plug.in/>
- <https://valhalladsp.com/>
- <https://plugins.iem.at/>

## Release acceptance checklist

- [ ] Phaedra Windows `waf configure` and `waf build` finish.
- [ ] The portable ZIP starts from a clean Windows VM.
- [ ] VST3 support is actually enabled in the produced binary.
- [ ] Portable `Plugins\VST3` is scanned by both the launcher and .bat paths.
- [ ] User-installed Vital is detected after rescan in an existing profile.
- [ ] New MIDI track selects Vital, records notes and plays sound.
- [ ] Installed Vital survives save/restart/reopen/automation without losing state.
- [ ] With Vital absent or blacklisted, the previous GM/Reasonable fallback works.
- [ ] No official Vital binary, factory presets or restricted assets in ZIP.
- [ ] Third-party licensing and required notices verified before redistribution.
