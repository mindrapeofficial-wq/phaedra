# Phaedra Preview Bridge (Windows)

Este canal permite ver compilaciones experimentales producidas por GitHub Actions,
sin modificar la instalacion estable de Phaedra.

## Primera instalacion

La rama `preview/live` genera una *prerelease* `preview-<SHA>` **solo** cuando
terminan correctamente la compilacion de Windows, las pruebas y la verificacion
del paquete. Si CI falla, no se publica una nueva Preview.

1. Descarga `PhaedraPreview.ps1` y `Iniciar-Phaedra-Preview.cmd` de esta
   carpeta y guardalos juntos en una carpeta que conserves.
2. Haz doble clic en `Iniciar-Phaedra-Preview.cmd`.
3. Autoriza la instalacion de la version de prueba cuando el programa lo
   solicite. La primera instalacion precisa conexion a GitHub.

El puente guarda Phaedra Preview en:
`%LOCALAPPDATA%\Phaedra\Preview`

La version de prueba usa una configuracion separada:
`%APPDATA%\PhaedraPreview8`

La version estable mantiene su instalacion y
`%APPDATA%\Phaedra8`. No se borran proyectos ni copias de seguridad.

## Modos

- `-Mode Run`: consulta una vez, ofrece instalar el ultimo cambio verificado
  y abre el DAW. Usalo como acceso directo habitual a Phaedra Preview.
- `-Mode Check`: consulta sin instalar y muestra el estado en la consola.
- `-Mode Watch -PollSeconds 120`: observa publicaciones mientras permanezca
  abierta la consola; avisa por texto de nuevas builds. El cambio se aplica
  con `Run` cuando cierres el DAW.

El intervalo de vigilancia minimo es 120 segundos para evitar agotar el limite
de consultas no autenticadas de GitHub. La compilacion C++ es remota y puede
tardar bastante mas. **La recarga en caliente de controles y colores es una
funcion futura, distinta del actualizador de ejecutables.**

## Seguridad y recuperacion

- Solo se aceptan prereleases de `mindrapeofficial-wq/phaedra` cuyo tag sea
  `preview-<SHA de 40 caracteres>`.
- Comprueba el SHA256 del ZIP publicado por GitHub, limita el tamano y evita
  extracciones fuera del directorio temporal.
- Verifica `MANIFEST.sha256`, `SOURCE.txt` y que la version sea del canal
  Preview, con el actualizador estable deshabilitado.
- Antes de sustituir una instalacion conserva una copia entera en la carpeta
  `%LOCALAPPDATA%\Phaedra\backup-...`, y permite restaurarla manualmente.
- No reemplaza ejecutables mientras Phaedra Preview esta abierto.
- Si la red falla pero ya tienes Preview instalado, `Run` abre esa version.
- Los proyectos deben guardarse fuera de la carpeta `Preview`.
- Solo instala codigo que hayas revisado o aprobado para la rama Preview.
  Una suma SHA256 verifica integridad respecto a GitHub, no ausencia de errores
  de programacion. Las versiones Preview son de prueba, no de produccion.

Para volver atras: cierra el DAW, renombra o mueve
`%LOCALAPPDATA%\Phaedra\Preview` a una carpeta de diagnostico y coloca en su
lugar una carpeta `backup-...` conocida y verificada.

## Flujo para contribuciones

1. Los cambios de interfaz se hacen en otra rama/PR y se prueban.
2. Se integran en `preview/live`, nunca automaticamente en `main`.
3. El workflow compila y verifica, publica una prerelease separada.
4. El proximo lanzamiento mediante `Iniciar-Phaedra-Preview.cmd` actualiza
   la copia local tras aceptacion, conserva el ultimo backup y abre el DAW.
5. Solo despues de revisar Windows/Phaedra se prepara una version estable.

Este puente todavia requiere demostrar que CI de Windows completa con exito;
una configuracion que falla bloquea la creacion de cualquier Preview.
