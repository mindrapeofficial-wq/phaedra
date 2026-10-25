# Phaedra DAW · Primeros pasos

Phaedra es una estación de trabajo de audio digital gratuita en desarrollo para Windows. Esta guía describe un recorrido básico y evita asumir que todas las compilaciones experimentales están listas para producción.

## 1. Instala una compilación verificada

1. Revisa [Phaedra Releases](https://github.com/mindrapeofficial-wq/phaedra/releases) y las notas de la versión.
2. Usa una versión cuyo paquete de Windows haya superado compilación, comprobación de archivos y prueba de arranque. Una ejecución fallida de GitHub Actions **no** es una versión instalable.
3. Conserva copias de tus proyectos y evita guardar sesiones dentro de la carpeta del programa.
4. Para la edición Preview consulta [Phaedra Preview](https://github.com/mindrapeofficial-wq/phaedra/tree/preview/live/phaedra_preview).

## 2. Configura el audio

Abre Phaedra. En Windows, el motor previsto para las compilaciones actuales es **PortAudio**. Selecciona la salida de audio disponible y una frecuencia compatible con tu interfaz. Si el audio no funciona, revisa primero que ningún otro programa haya bloqueado el dispositivo.

## 3. Crea una sesión

Desde el menú de sesión crea un proyecto nuevo, elige su nombre y una carpeta fuera de la instalación. Configura la frecuencia de muestreo antes de grabar.

## 4. Conoce la interfaz

- **Barra de transporte:** reproduce, detiene, graba y presenta el tiempo musical.
- **Bars:Beats:** regla musical con números de compás y subdivisiones. Es la vista inicial de una sesión nueva en Phaedra Preview.
- **Editor:** coloca y edita regiones de audio o MIDI.
- **Mezclador:** ajusta ganancia, panorámica, envíos y procesamiento.
- **Tempo / Time Signature:** controla BPM y compás, por ejemplo 120 BPM y 4/4.

## 5. Tu primera pista

Crea una pista de audio o MIDI mediante el menú de pistas. En audio, importa una grabación o prepara una entrada para grabar; en MIDI, crea una región y abre el editor de notas. Comprueba la salida y el nivel antes de reproducir.

## 6. Exporta una mezcla

Selecciona el rango musical deseado y utiliza las opciones de exportación de Phaedra. Reproduce el archivo resultante para comprobar el formato y el nivel. Las opciones concretas pueden variar entre compilaciones experimentales.

## ¿Necesitas ayuda?

- [Phaedra Chat, comunidad propia](./comunidad.md) (servicio en preparación).
- [Manual y referencia](./manual.md).
- [Cómo informar de un error](./reportar-error.md).

Phaedra utiliza componentes derivados de Ardour. Los avisos de licencias y atribución se mantienen en [LICENSES.md](../../LICENSES.md).
