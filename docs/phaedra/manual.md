# Phaedra DAW · Manual y referencia

Esta es la documentación propia de **Phaedra**, no un enlace a los manuales de otro DAW. Cubre los conceptos disponibles en la base actual y se irá ampliando a medida que se verifiquen las funciones y compilaciones.

## Navegación

| Zona | Para qué sirve |
| --- | --- |
| Transporte | Play, stop, grabación y posición musical |
| Editor | Pistas, regiones, desplazamiento y selección |
| Mezclador | Ganancia, buses, panorama, inserciones y envíos |
| Bars:Beats | Escala temporal musical por compases y beats |
| Tempo / Compás | Velocidad y métrica de la sesión |
| Edición MIDI | Notas, duración, velocidad y cuadrícula |

### Compases y beats

La regla **Bars:Beats** presenta las marcas de compás y los beats intermedios. El tempo establece cuánto dura cada beat. Un compás 4/4 contiene cuatro negras; si cambias el compás, cambia la agrupación musical. La regla es una representación de la línea temporal, no una pista de audio.

En una **sesión nueva**, Phaedra Preview está configurado para iniciar con la regla Bars:Beats y ocultar otras reglas. Si abres una sesión con visibilidad guardada, Phaedra respeta ese estado. Puedes cambiar las reglas desde el menú contextual de la regla.

### Reloj y transporte

La barra superior muestra la posición; BPM y compás se editan mediante los controles correspondientes. Ajustar BPM no altera por sí mismo el tono de una grabación. Comprueba las opciones de estiramiento/ajuste temporal cuando edites material de audio.

### Audio y grabación

Selecciona el dispositivo de salida y la entrada de la pista. Antes de grabar, verifica el medidor y arma únicamente las pistas necesarias. Evita niveles que saturen el medidor y guarda el proyecto con frecuencia.

### MIDI y piano roll

En una pista MIDI, crea o selecciona una región y abre el editor de notas. La cuadrícula musical sirve de referencia para mover y cuantizar. Para escucharlo, la pista debe tener un instrumento o destino MIDI válido. Algunas funciones dependen de los plugins disponibles en Windows.

### Plugins y mezclador

Los instrumentos y efectos se insertan en rutas de procesamiento. No todos los formatos ni plugins están garantizados en las compilaciones experimentales. Si un plugin no abre, conserva su nombre, versión y formato para el informe.

### Exportar

Comprueba el rango de exportación, la frecuencia de muestreo y el formato del archivo. Reproduce la exportación fuera de Phaedra antes de darla por terminada.

## Soporte y desarrollo

- [Primeros pasos](./primeros-pasos.md)
- [Informar de un problema](./reportar-error.md)
- [Chat y comunidad](./comunidad.md)
- [Código fuente](https://github.com/mindrapeofficial-wq/phaedra)
- [Sitio oficial](https://phaedra-daw.vercel.app/)

**Nota:** esta documentación no significa que la compilación de Windows haya pasado todas las pruebas. Consulta siempre el estado de GitHub Actions y las notas de la versión.
