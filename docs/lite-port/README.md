# Traslado de mejoras de Lite a Pro

Inicio: 3 de noviembre de 2026. Trabajo local, sin publicar ni sustituir instalaciones.

## Fuente elegida y trazabilidad

Destino confirmado por el propietario: `C:/Users/mindr/Desktop/PHAEDRA` (C++/GTK, basado en Ardour).
Fuente de trabajo: `C:/Users/mindr/Desktop/PHAEDRA LITE/08-DESARROLLO-PREVIEW6` (Rust/egui).
El nombre Preview 6 identifica el desarrollo local; Cargo.toml sigue declarando `0.1.0-preview.5`.
Se observaron modificaciones del 3 de noviembre en los menús; la copia soundcraft-src tiene cambios hasta el 1 de noviembre.
La antigua ruta FLUX/phaedra-history-recovery ya no está presente.

`source-inventory.csv` registra SHA-256 y fecha por archivo, comparando apps, crates, packaging y assets con soundcraft-src, 02-CODIGO-INDEPENDIENTE y phaedra-rea-compare. `source-summary.json` registra la captura y sus recuentos. Se inventariaron 512 archivos de la fuente seleccionada. Una diferencia de bytes no demuestra por sí sola una mejora funcional: puede ser formato, marca o contenido. Las copias no son una cadena Git verificable; no se presume que todo archivo más reciente sea mejor.

Los 14 archivos exclusivos de soundcraft-src son recursos y empaquetado heredados (incluido manifest web), no módulos Rust ausentes. Conservar su inventario permite revisar cualquier comportamiento útil sin restituir identificadores SoundCraft.

Regenerar con `powershell -NoProfile -ExecutionPolicy Bypass -File tools/inventory-lite.ps1`. La fuente sigue siendo editable: la captura identifica el contenido examinado, no congela otros trabajos. Revisar diferencias respecto a la captura antes de cada bloque.

## Matriz inicial de traslado

Esta matriz organiza el trabajo; no certifica todavía una comparación exhaustiva de todas las funciones.

| Bloque | Evidencia en Lite | Situación de Pro / siguiente trabajo | Estado |
|---|---|---|---|
| Descarga verificada | ui-egui/src/updates_ui/installer.rs | Tamaño, SHA-256, identidad exacta y canal independiente; comprobación repetida al instalar | Implementado en fuente, pruebas sintéticas aprobadas |
| Instalación consentida | updates_ui.rs e installer.rs | Separación descargar/instalar; esperar al lanzador y rechazar otra instancia abierta sin terminar procesos | Implementado en fuente; UI y actualización real pendientes |
| Actualización recuperable | installer.rs y packaging/windows/test-update.ps1 | Extracción controlada, respaldo de archivos reemplazados, diario y restauración ante excepciones; configuración de usuario conservada | 27 comprobaciones sintéticas aprobadas; actualización gráfica real pendiente |
| Cabecera y diseño | docs/preview5-release.md; ui-egui/src/edit_window/header.rs | Paleta Lite y cifras IBM Plex Sans incorporadas, con licencia OFL | Implementado parcialmente; comparación visual pendiente |
| Menús simplificados | ui-egui/src/menus/presentation.rs | Agrupación File/Edit/Tracks/Clips/MIDI/View/Settings; 641 referencias preexistentes conservadas, nuevas etiquetas en español | Implementado; comprobación gráfica pendiente |
| Paneles y preferencias | docs/removed-side-panels-validation.md | Decidir equivalencias de paneles GTK y migrar preferencias sin quitar capacidades de Pro | Pendiente |
| Medición de salida | docs/preview5-release.md; crates/playback | Pico dBFS y LUFS momentáneo 400 ms. Nuevo medidor continuo sobre la salida maestra mono/estéreo, posterior a ganancia/panorama | 19 pruebas DSP aprobadas; integración gráfica pendiente |
| Pulse | tools/pulse-host y paquete Pulse modificado | Panel GTK, puente con HWND exacto, perfil separado de Pro y empaquetado con fuente/licencias | Puente compilado; prueba gráfica pendiente |
| Español e instrumentos | docs/preview6-local-improvements.md | Selector persistente de idioma (reinicio requerido). Drums/Slice/FM6 exportan VST3 nativo y se empaquetan con fuentes/licencias; búsqueda de plugins ampliada al directorio incluido | Procesamiento nativo probado; integración gráfica pendiente |
| Edición y estiramiento | ui-egui/src/edit_window/input.rs, clips.rs; docs/preview5-release.md | Pro tiene sp_stretch.cc y st_stretch.cc. Comparar interacción, conservación de tono y previsualización, no sustituir DSP sin medir | Pendiente |
| Automatización de mute | docs/strip-mute-automation.md; crates/mix | Comparar transiciones dentro del bloque, envíos pre/post, Aux, carpetas, solo y VCA con el motor Pro | Pendiente |
| Formatos y recuperación | docs/session-format-validation.md; engine/src/io; ui-egui/src/app/files.rs | Pro utiliza otro formato de sesión. No renombrar .phl como sesión Ardour: requiere importador y pruebas de ida/vuelta si se ofrece interoperabilidad | Pendiente |
| Plugins | ui-egui/src/app/plugins.rs; vst3-host/clap-host | Pro ya posee escáner externo y listas de bloqueo (plugin_manager.cc). Revisar diferencias restantes, caché, timeout y mensajes | Base existente; equivalencia pendiente |
| Rendimiento de audio | crates/playback y crates/mix | Comparar streaming, ganancia, memoria y tiempos de callback con sesiones sintéticas iguales | Pendiente |
| Control y automatización externa | crates/automation y ui-egui/src/control.rs | Comparar protocolos y comandos con las capacidades de Pro antes de añadir adaptadores | Pendiente |
| Distribución multiplataforma | packaging y apps/phaedralite-web | Adaptar por plataforma; WASM/egui no se traslada directamente al binario C++/GTK | Pendiente |

Los informes MorningDAW y ProWave contienen propuestas, no necesariamente funciones implementadas. No contarlas como mejoras ya disponibles ni copiar recursos de terceros.

## Implementación y validación local

- Actualizador: SHA-256, tamaño y repositorio propios de Pro, descarga acotada durante la transferencia, cancelación con limpieza del ZIP temporal, confirmaciones separadas y espera del cierre normal. No termina procesos del usuario. Las carpetas Git y paquetes marcados development-build.txt no se reemplazan; el empaquetado de QA usa PHAEDRA_DEVELOPMENT_BUILD=1.
- Instalación: extracción temporal con límites y rechazo de rutas inseguras, respaldo de archivos reemplazados, diario y rollback ante errores de copia. Conserva update_config.ini y archivos ajenos al paquete. No se ha probado recuperación automática tras corte de corriente.
- Pulse: panel inferior redimensionable y persistencia de visibilidad; proceso separado mediante PulseHost, vinculado al HWND del panel. Captura el dispositivo Windows seleccionado en Pulse, no una conexión exclusiva al master de Pro.
- UI: menús reorganizados, paleta oscura/magenta/lavanda, fuentes IBM Plex y hada original animada con el transporte; accesos inferiores a mezclador, Pulse y editor de notas. Editor de notas nativo acoplado al panel inferior, alternando con Pulse; conserva la selección de clips MIDI. Su verificación gráfica sigue pendiente.
- Idioma: selector English/Español/sistema en Preferencias → Apariencia → Traducción, guardado fuera de sesiones y diseños de ventanas. Requiere reiniciar GTK.
- Medición: pico dBFS acumulado entre lecturas y LUFS momentáneo de 400 ms sobre la salida maestra mono/estéreo. Procesamiento continuo sin asignaciones de memoria en la ruta nueva. No equivale a un medidor de salida surround.
- Compilación: versión de motor separada de los tags comerciales, MSYS2/UCRT64 con PortAudio y Dummy. Compilación completa de 1.831 tareas e incremental posterior aprobadas. Paquete de desarrollo de 421 MB generado; 229 módulos PE pasan la comprobación de dependencias. Ejecutable iniciado con configuración y caché aisladas; se muestra Audio/MIDI Setup. Pruebas de integración restantes pendientes.

Pruebas completadas:

- 29 comprobaciones de política de actualización en Windows PowerShell 5.1.
- 27 comprobaciones de instalación sintética: actualización, respaldo, preservación de configuración/sesiones, ZIP inseguro/incompleto y rollback con fallo inyectado.
- 19 comprobaciones del DSP real de LUFS: 44,1/48/96 kHz, mono/estéreo, bloques de 64/4096 muestras, diferencia de ganancia, silencio y ausencia de asignaciones durante procesamiento.
- PulseHost compilado mediante dotnet publish para win-x64.
- Drums, Slice y FM6: carga de fábrica VST3 y procesamiento de 48 bloques estéreo de 512 muestras a 48 kHz aprobados. FM6 produce audio; los dos samplers permanecen en silencio sin muestras cargadas. No implica soporte CLAP genérico ni integración del volcado MIDI de Slice.
- Sintaxis PowerShell, bash -n y git diff --check comprobadas.

No se ha publicado ni reemplazado ninguna instalación. Falta probar el paquete real, la integración GUI/audio, guardado y reapertura. No se certifica todavía el traslado de todas las mejoras: edición, mute dentro del bloque, interoperabilidad de sesiones, CLAP, control externo y otras plataformas siguen pendientes de implementación o comparación funcional.

## Espacio recuperado

cleanup-summary-20261103.json registra 22,42 GB lógicos eliminados de cachés/compilaciones regenerables y 18,96 GB de aumento neto de espacio libre. Se conservaron fuentes, sesiones, audio, releases y la compilación activa de Lite Preview 6. No se eliminaron datos de Docker.
