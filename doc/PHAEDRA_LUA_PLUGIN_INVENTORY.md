# Phaedra: built-in Lua DSP plugins audit

Source paths are in `share/scripts/`. This is distinct from the seven
enabled LV2 plugin targets recorded in `PHAEDRA_PLUGIN_AUDIT.md`. The
scripts below have an active `ardour { ["type"] = "dsp" }` descriptor;
their files are copied by the portable packager.

`Better` means suitable feature coverage after verification, not simply
newer-looking UI. No auto-migration of existing session plugin IDs.

## Lua DSP plugins identified

| Current script / name | Role | Equivalent or stronger free approach | Migration |
| --- | --- | --- | --- |
| `HiAndLowPass.lua` / ACE High/Low Pass Filter | HP/LP audio filters | ZamEQ2 (EQ), or a purpose-built HP/LP with same frequencies and slopes | Manual test needed |
| `a-noise.lua` / ACE Noise | white/pink noise generator | ZamNoise (part of verified ZamAudio 4.5) | New-project candidate |
| `a_dtmf_phone.lua` / ACE DTMF Phone | DTMF telephone tone generator | Keep until a tested, functionally equivalent DTMF generator is found | Preserve |
| `a_mute.lua` / ACE Mute | automatable audio mute | Native Phaedra track mute/automation | Keep for historical plugin automation |
| `a_slow_mute.lua` / ACE Slow-Mute | audio fade mute | Native gain automation; dedicated smoother preferable | Preserve |
| `a_stereo_routing.lua` / ACE Stereo Routing | signal routing | Native mixer channel routing | Preserve |
| `ab_switch.lua` / ACE A/B Switch | realtime A/B source switching | Native mixer routing/snapshots | Preserve |
| `amp5.lua` / ACE Amplifier | multichannel gain | Native gain/trim | Preserve |
| `barlow_arp.lua` / Arpeggiator (Barlow) | advanced rhythmic MIDI arpeggio | No equivalent demonstrated in 24 VST3 replacements | Preserve |
| `dm10studio.lua` / DM10-mkII-Studio HiHat | device-specific MIDI hi-hat mapping | Native MIDI remap if functionally equivalent | Preserve |
| `ir_capture.lua` / Lua IR Capture | measure impulse responses | Convolution IR capture tool with matching workflow | Preserve |
| `ltc_reader.lua` / LTC Reader | timecode decoding | Native Phaedra timecode engine where equivalent | Preserve |
| `midi_remap.lua` / MIDI Note Mapper | map MIDI notes | Native MIDI note mapping | Preserve |
| `midimon.lua` / ACE MIDI Monitor | inline MIDI note/CC monitor | MIDI tracing window, or standalone compatible MIDI monitor | Preserve inline workflow |
| `notch_bank.lua` / ACE Notch Bank | multiple narrow-band noise notches | Dynamic/parametric EQ only after confirming same notches and phase | Preserve until tested |
| `raptor_arp.lua` / Arpeggiator (Raptor) | algorithmic MIDI composition | No known drop-in superior free equivalent | Preserve |
| `scope.lua` / ACE Inline Scope | waveform view within mixer strip | Dedicated oscilloscope only if inline display is maintained | Preserve |
| `simple_arp.lua` / Arpeggiator | MIDI chord arpeggiation | More advanced MIDI arp with VST3 + routing support required | Preserve |
| `singen.lua` / SinGen | sine generator | Synth such as Surge XT, or ZamNoise for noise only (NOT a sine equivalent) | Preserve until tone generator present |
| `spectrogram.lua` / ACE Inline Spectrogram | inline spectral visualization | free spectrum analyzer, but must replicate *spectrogram* and inline layout | Preserve |
| `voice_activate.lua` / Voice/Level Activate | audio-triggered DAW transport | Native transport automation/rules; audio gate is NOT equivalent | Preserve |
| `x-fade.lua` / ACE Cross Fade | realtime crossfade | Native bus gain/fader automation | Preserve for legacy sessions |

Additional Lua files starting with underscores include development examples or
processors (such as basic amplifier versions, FIR/convolution experiments,
synths, MIDI filters and sound smashers). Their shipped/visible status should be
verified against the Lua script-manager enumeration and packaging before any
deletion. Other Lua file types are editor actions/hooks, not DSP plugins.

## Actual scope of PR #8

- The seven **active LV2 modules** have modern free candidates in a verified
  installer. ZamAudio's ZamNoise also provides a direct option for ACE Noise.
- Existing ACE LV2 IDs remain available so old tracks and automation load.
- The other Lua processors in the table are **not automatically swapped**, due
  to differences in parameter semantics, realtime events, inline visualization,
  MIDI routing or functionality. Replacing these blindly would break important
  DAW features or alter existing projects.
- Future migration should be case-by-case with an audio/null-test or MIDI event
  comparison, plugin state migration test, rollback and correct licensing.

The verified installation test is not an audio host/GUI regression test.
