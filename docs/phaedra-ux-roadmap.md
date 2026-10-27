# Phaedra UX 2026: primera iteración para Codex

**Incidencia principal:** [#15](https://github.com/mindrapeofficial-wq/phaedra/issues/15)

## Decisión de producto

Phaedra debe evolucionar desde una interfaz heredada de Ardour a un DAW con identidad propia y un flujo más sencillo para producción de música electrónica. Conservar el motor y todas las funciones existentes, pero **reducir la complejidad visible**. El usuario quiere poder diseñar la apariencia y dejarla como boceto para que un desarrollador revise y conecte acciones.

Principios:
- Español natural, sin traducir etiquetas técnicas universalmente aceptadas (BPM, MIDI, VST, etc.).
- Experiencia simple por defecto y acceso reversible a todo lo avanzado.
- Diseño no destructivo: conservar configuraciones, atajos, proyectos, sesión y estado del transporte.
- Evitar recompilaciones por **cada ajuste visual** en los componentes convertidos a layout configurable; modificaciones nativas C++ pueden requerir compilación.
- Nada de copiar literalmente interfaces ni recursos de REAPER. Tomar como referencia su accesibilidad y personalización.
- Sin eliminación de avisos/licencias de componentes heredados.

## Estado encontrado en el repositorio

- `gtk2_ardour/ardour.menus.in`: enorme árbol de menús y acciones existentes. Acciones de ejemplo verificadas: `New`, `Open`, `Recent`, `Save`, `SaveAs`, `AddTrackBus`, `addExistingAudioFiles`, `QuickExport`, `ExportAudio`, `StemExport`, `ToggleRoll`, `Record`, `Loop`, `EditorEditing/undo`, `EditorEditing/redo`, `EditorEditing/editor-cut`, `EditorEditing/editor-copy`, `EditorEditing/editor-paste`, `split-region`, `EditorEditing/cycle-snap-mode` y varias opciones de cuadrícula.
- `gtk2_ardour/po/es.po`: traducción española existente. Confirmar cobertura, compilación de MO, instalación en Windows y locale del proceso.
- `gtk2_ardour/application_bar.cc`, `gtk2_ardour/ardour_ui.cc`, `gtk2_ardour/editor_rulers.cc`, `gtk2_ardour/ui_config.cc`: posibles puntos de integración. Verificar implementación antes de cambiar.
- El chat propio Phaedra se trabaja por separado en `chat/`; fuera de alcance de esta primera mejora.

## Interfaz propuesta (vista simple)

1. **Proyecto:** nuevo, abrir, guardar, importar, exportar.
2. **Editar:** deshacer, rehacer, cortar, copiar, pegar, dividir, ajustar a cuadrícula.
3. **Añadir:** pista, instrumento, MIDI, efectos o plugins (reutilizando acciones reales, sin inventar IDs).
4. **Ver:** editor, mezclador, paneles y herramientas visibles.
5. **Ayuda:** documentación, soporte, chat y diagnósticos.

Controles persistentes prioritarios: Play, Stop, Record, Loop, BPM, compás, cuadrícula/cuantización. Mantener menús originales tras **Avanzado** o **Vista clásica**. No eliminar acciones ni atajos existentes.

## Modo Diseño F12 (fases)

**Fase A: prototipo aislado de barra superior.** Comprobar primero si F12 está reservado. Registrar `widget_id`, `action_id` y propiedades visuales. Mostrar rejilla/guías. Reordenar y ocultar sin alterar widgets nativos fuera del editor. Guardar como borrador local versionado. Deshacer, rehacer, restaurar. Volver a interfaz normal sin alterar sesión.

**Fase B: conexión revisada.** Tras aprobación de un boceto, enlazar IDs a acciones nativas existentes. Los cambios de apariencia en componentes configurables se recargan en caliente; los cambios del motor requieren desarrollo y compilación.

**Fase C: comunidad y asistencia.** Más adelante, posibilidad de compartir bocetos aprobados y de asistencia remota con permiso. Fuera del alcance de este PR.

## Entrega inmediata solicitada a Codex

Trabajar en una rama **basada en `preview/live`**, con PR de **borrador hacia `preview/live`**, no a `main`. Auditar puntos de idioma, menú y F12, e implementar la primera mejora real disponible sin dañar compatibilidad. Priorizar un modo de menús sencillo reversible y habilitar/verificar el español. Si un F12 seguro no es viable en este mismo PR, documentar el diseño técnico y los cambios exactos necesarios, sin dejar un editor falso.

Entregar pruebas, capturas si se pueden obtener, comandos reproducibles de construcción y riesgos de integración Windows. Detallar claramente funcionalidad implementada frente a pendiente. **No fusionar, publicar ni desplegar automáticamente.**
