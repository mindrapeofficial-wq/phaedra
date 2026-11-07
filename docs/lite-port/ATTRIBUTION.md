# Assets and code retained from Phaedra Lite

| Material | Author / provenance | License |
|---|---|---|
| Phaedra Drums, Slice and FM6 native VST3 bundles | Phaedra Instruments, derived from Lemon Studio / ItsAlphaNeon revision 556481e6a18c0bab7ef8e864b24aaae230869444 | GPL-3.0-or-later; LICENSE, THIRD-PARTY-NOTICES.txt and Phaedra-Instruments-source.tar.gz retained in licenses/phaedra-instruments |
| gtk2_ardour/resources/phaedra-fairy-dance.png | Phaedra Lite original fairy sprite, assets/dancer; attribution and owner declaration recorded in Lite ATTRIBUTION.md and docs/provenance-audit.md | MIT / Apache-2.0; corresponding license files retained in tools/pulse-host and packaged under licenses/pulse-host |
| tools/pulse-host/Program.cs and project | Phaedra Lite, Preview 6 local source; adapted for GTK dock HWND and separate Pro profile | MIT / Apache-2.0; license files and NOTICE retained in tools/pulse-host |
| gtk2_ardour/fonts/ibm-plex/*.ttf | IBM Plex project, copied from Lite assets/fonts/ibm-plex | SIL Open Font License 1.1, adjacent OFL.txt |
| Phaedra theme token values | Phaedra Lite ui-egui/src/theme.rs and existing Pro theme mappings | Lite MIT / Apache-2.0; Pro theme retains its existing project license |
| Distributed Pulse executable, themes, shaders and resources | Audio Solutions Pulse Visualizer and Phaedra modified source bundle | GPL-3.0; PULSE-LICENSE-GPL-3.0.txt and Pulse-modified-source.zip distributed with the application |

Pulse is launched as a separate process. Its sound is captured independently from
the selected Windows output device. No proprietary DAW assets were introduced.
