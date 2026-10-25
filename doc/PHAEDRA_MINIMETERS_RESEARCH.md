# MiniMeters.exe technical research / Phaedra Meter Suite

Date: 2026-10-25

## User-provided file, static inspection only

- Filename: `MiniMeters.exe`
- SHA-256: `1f2ae6d7896727ee240a688f1c23b102b0518cfe37b9f4c9469d769e5ad13ecc`
- Size: ~9.7 MiB
- Type: Windows PE32+ GUI executable, x86-64, 18 sections.
- Windows imports observed via `objdump -p` include `d3d11.dll`,
  `D3DCOMPILER_47.dll`, `OPENGL32.dll`, `dcomp.dll`,
  `WINMM.dll`, `WS2_32.dll` and `KERNEL32.dll`.
- UTF-8/ASCII strings observed by `strings -a` include
  `Loudness::receive_audio`, `Loudness::draw()`,
  `Oscilloscope::receive_audio`, `Spectrogram::receive_audio`,
  `Spectrum::receive_audio`, `Stereometer::receive_audio`,
  `Waveform::receive_audio` and references to a sender plug-in.
- This is compiled machine code **not source code** and cannot be copied
  as original C++ into Phaedra. The import table does **not** prove which
  framework or language produced the executable.
- The executable was never launched, installed or patched.

## Official product functionality

Source: <https://minimeters.app/> (commercial product; the vendor also
provides a demonstration release and VST3/CLAP plug-ins).

| MiniMeters feature | Phaedra native implementation | Status in this branch |
| --- | --- | --- |
| Waveform | Ring buffer + SIMD-native peak range in Lua GUI | Implemented, not host-tested |
| Spectrum FFT | Existing `ARDOUR.DSP.FFTSpectrum` binding | Implemented, not host-tested |
| Spectrogram | Frame-history FFT heatmap | Implemented, not host-tested |
| Oscilloscope | Sample-time trace from ring | Implemented, not host-tested |
| Stereometer | Lissajous / correlation estimation | Implemented, not host-tested |
| Loudness meter | Sample peak and sampled RMS only, explicitly **not** LUFS | Partial |
| VU | Properly calibrated analog-ballistic VU | Not implemented |
| Quad layout | Four simultaneous compressed views inline | Prototype |
| Full scalable standalone window | New Gtk/Cairo detached window | Not implemented |
| 10/60-second retrospective recording | Recorder ring + WAV export (not realtime callback) | Not implemented |
| System audio capture | Windows WASAPI loopback | Not implemented |
| Meter forwarding from DAW | Insert analyzer on master bus, no external process needed | Available natively |

Warning: an `exe` does not provide a free redistribution license or editable
source. Do **not** place MiniMeters binary assets, logos or compiled shaders
inside the open-source Phaedra repository. Recreate functional concepts
using independent code.

## Usable source repositories (license-aware)

### EasyMeter, MIT

- Code: <https://github.com/bgivenb/EasyMeter>
- License: <https://github.com/bgivenb/EasyMeter/blob/main/LICENSE>
- Particularly useful files:
  - `Source/Meters.cpp` / `Source/Meters.h`: visualization and meters.
  - `Source/Spectrogram.cpp` / `Source/Spectrogram.h`: spectrogram drawing.
  - `Source/PluginProcessor.cpp`: pass-through DSP, ring buffers, FFT,
    spectrum, metering and audio-thread/GUI hand-off.
  - `Source/PluginEditor.cpp`: plugin multi-panel view and resize controls.
- The source is MIT. Reusing substantial parts requires preserving its
  copyright/license notice. It currently uses **JUCE 9** and C++20.
  JUCE has separate license/dependency obligations, so its full source cannot
  be pasted into a GTK2/Ardour module as if it were a standalone MIT DSP blob.

### Grisey, GPLv3

- Code: <https://github.com/ZhiyuAlexZhang/Grisey>
- License: GPLv3
- `Source/Engine/LoudnessMeter.h`: LUFS / BS.1770 loudness computation.
- `Source/Engine/TruePeakDetector.h`: true-peak detection.
- `Source/Engine/SpectrumEngine.h` and `SampleRingBuffer.h`:
  spectral analysis and realtime hand-off.
- The project's own README describes beta builds; its DSP and GUI
  were intentionally separated and tested. Port the algorithm only if its
  GPLv3 dependencies are compatible with the full Phaedra distribution
  and keep the required notices and corresponding source.

### Existing Phaedra components worth using first

- `share/scripts/scope.lua`, `share/scripts/spectrogram.lua`,
  `share/scripts/_correlation_meter.lua` already show the Ardour Lua
  shared-memory, Cairo renderer, FFT and stereo correlation APIs.
- `libs/ardour/lufs_meter.cc` and `libs/vamp-plugins/EBUr128.cpp` contain
  existing loudness/EBU R128 processing primitives, so a properly calibrated
  loudness module can reuse the already linked audio engine.
- The Lua binding `ARDOUR.DSP.FFTSpectrum` is already available under
  `libs/ardour/luabindings.cc`. It is more appropriate for the prototype
  than pulling a second FFT dependency into the audio callback.

## Implemented prototype

- Script: `share/scripts/phaedra_meter_suite.lua`
- Smoke test: `tests/phaedra_meter_suite_test.lua`
- CI workflow: `.github/workflows/verify-meter-suite.yml`
- Add in Phaedra as a DSP plugin, insert on the master bus (end of chain).
- Choose `View` = Quad / Levels / Waveform / Spectrum / Spectrogram /
  Stereo / Oscilloscope.
- Set FFT size, spectral floor, waveform span and inline height.
- The audio is bit-transparent for every mapped, connected channel.
- All FFT, display and RMS estimation happens in the GUI context.
- The analyzer is intentionally MONO/STEREO only in v0.1.
- The Phaedra packager copies all visible `share/scripts/*.lua`;
  the build definition `share/scripts/wscript` auto-globs non-underscore
  scripts. No new third-party library or binary is required.

## Next steps for MiniMeters-class production quality

1. **Host smoke test on Windows:** verify Phaedra registers script; insert
   on master bus; confirm video redraw, GUI scaling and audio transparency.
2. **CPU profiling:** check the graphical Lua interpreter at 25fps and
   FFT 512–4096 at high sample rates. Keep UI behind a cached frame renderer.
3. **True loudness:** implement LUFS momentary/short-term/integrated, gated
   BS.1770 / EBU R128 from Phaedra's existing C++ loudness engine, or port
   verified GPL source with notices and corresponding source distribution.
4. **True peak:** oversampled dBTP; do not label sample peak as true peak.
5. **A full-size GTK/Cairo dockable panel:** separate realtime collection
   from the meter grid. Use independent clean-room styling.
6. **Retrospective capture:** lock-free 10- and 60-second rings with recording
   only on a non-realtime thread and explicit user controls.
7. **Acceptance:** mono/stereo passthrough null test; LUFS and dBTP reference
   vectors; 44.1/48/96/192 kHz; buffer sizes 64–8192; pause, no audio,
   session reopen, high DPI and inactive GUI behavior.

This document does not claim to have reconstructed, copied or recompiled any
proprietary MiniMeters code. The new Phaedra code is independently authored
against already-available Ardour APIs and project-licensed examples.
