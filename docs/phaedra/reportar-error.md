# Phaedra DAW · Cómo informar de un error

Los errores de Phaedra deben enviarse al **repositorio de Phaedra**, no al rastreador de Ardour, salvo que se haya identificado con certeza un problema específico del proyecto original.

**[Abrir un informe en GitHub Issues](https://github.com/mindrapeofficial-wq/phaedra/issues/new)**

Incluye la información necesaria para reproducir el problema:

1. **Versión:** etiqueta de Phaedra, rama o SHA del commit cuando se conozca.
2. **Sistema operativo:** Windows y su versión; arquitectura x64 y dispositivo de audio.
3. **Pasos:** una secuencia corta y numerada desde abrir el programa.
4. **Resultado esperado:** qué tendría que ocurrir.
5. **Resultado observado:** mensaje de error, pantalla o comportamiento real.
6. **Evidencias:** captura y tramo relevante de los registros, evitando archivos privados.

## Ejemplo

**Título:** El ruler de compases aparece oculto al crear una sesión nueva.

**Pasos:** abrir Phaedra Preview, crear sesión, mirar la parte superior del editor.

**Esperado:** Bars:Beats visible.

**Actual:** solo Mins:Secs visible.

**Versión:** Phaedra Preview, SHA indicado en SOURCE.txt.

## Seguridad y privacidad

No publiques contraseñas, tokens, claves API, licencias personales, rutas privadas completas, correos o sesiones con audio confidencial. Si el problema reproduce un fallo de seguridad, evita publicarlo con instrucciones de explotación y contacta de forma privada al mantenedor.

## Antes de abrir un informe

Busca si ya hay una incidencia similar en [Issues](https://github.com/mindrapeofficial-wq/phaedra/issues). Si se trata de una consulta general puedes preguntar en el [Phaedra Chat](./comunidad.md). El chat no sustituye un informe reproducible.

El código de Phaedra deriva parcialmente de Ardour: atribuye bien el origen del error si lo conoces, sin redirigir automáticamente a sus rastreadores.
