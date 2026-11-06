# Pulse in Phaedra Pro (Windows)

The editor's Pulse button opens a resizable lower dock. Select the same Windows
output device as Phaedra in Pulse's own settings. Pulse captures that device;
this is not a direct master-bus audio feed and can include other applications.

`PulseHost.exe` and `Pulse/pulse-visualizer.exe` live beside the audio executable
in `bin/`. The bridge is self-contained .NET 8. The GTK dock passes its exact
native window handle, PID and geometry file. The bridge validates handle ownership
before parenting Pulse, and its kill-on-close Job Object owns the child process.
Its profile is isolated under `%LOCALAPPDATA%/Phaedra Pro/Pulse`, separate from Lite.

Source adapted from Phaedra Lite's tools/pulse-host, snapshot Preview 6 on
2026-11-03. Retained MIT/Apache licenses and NOTICE accompany this directory.
Pulse itself is a separate GPL-3.0 application by Audio Solutions:
https://github.com/Audio-Solutions/pulse-visualizer . Its modified source and GPL
license must accompany each portable distribution. The Phaedra modifications
include the spectral waveform colors, Mid/Side toggle and Phaedra theme.

Package with `PHAEDRA_PULSE_BUNDLE` pointing at a folder containing `Pulse/`,
`PULSE-LICENSE-GPL-3.0.txt` and `Pulse-modified-source.zip`. The packager builds
the current bridge and refuses incomplete bundles.
