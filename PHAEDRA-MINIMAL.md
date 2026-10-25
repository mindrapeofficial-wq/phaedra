# Phaedra mínima

Objetivo: una DAW que abre con una línea de compases y controles esenciales. Cada función adicional se integra en una rama y se prueba antes de publicarse.

## Núcleo de la primera versión

- Abrir, guardar y recuperar un proyecto.
- Reproducir, detener, grabar y hacer loop.
- Una pista capaz de alojar audio o MIDI; instrumento VST3 y efectos en la misma cadena.
- Importar audio y MIDI, mover clips, dividir con S, deshacer y rehacer.
- BPM, compás y regla Bars:Beats; las demás reglas se activan desde el menú.
- Mezclador básico: volumen, panorama, mute, solo y medidores.
- Exportar WAV con una ruta y formato claros.

## Funciones que se añaden después

- Superficies de control, cue, vídeo, VCA, OSC y herramientas avanzadas de edición.
- Integración visual de MiniMeters y Master Galante.
- Plantillas y opciones avanzadas de sesiones.

## Método de trabajo

1. `main` contiene solo funciones que abren y pasan una prueba de uso.
2. Una rama por cambio visible. MiniMeters y otros experimentos permanecen fuera de `main` hasta que funcionen.
3. Se compila en el árbol persistente `C:\PhaedraDev` con `tools\build-local.ps1`. El primer build crea la base; los siguientes reutilizan los objetos.
4. Cada cambio se prueba con una sesión temporal: abrir, reproducir, grabar, guardar y reabrir según lo que afecte.
5. Se genera portable e instalador solo después de probar un grupo de cambios. La actualización automática usa únicamente esa versión publicada.

Las bibliotecas del motor se mantienen mientras tengan dependencias directas con el audio, la sesión o la interfaz. Se desactivan módulos opcionales de forma gradual, comprobando cada recorte con el ejecutable local.