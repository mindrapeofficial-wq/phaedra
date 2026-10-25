# Phaedra Chat · Comunidad propia

Phaedra Chat es un sistema de mensajería desarrollado para Phaedra. **No utiliza IRC ni Discord.**

## Salas

- **#general**: músicos y usuarios.
- **#produccion**: audio, mezcla, instrumentos, plugins y MIDI.
- **#ayuda**: preguntas y respuestas.
- **#desarrollo**: propuestas, errores y novedades del DAW.

## Funcionamiento

La web tiene interfaz propia, lista de participantes, historial y mensajes. Cada participante entra con un **apodo de invitado temporal**. En la beta se consulta el historial a intervalos cortos, sin WebSocket. Los apodos todavía no están verificados.

El código está disponible en [chat/](../../chat/) y su explicación técnica en [README de Phaedra Chat](../../chat/README.md). La base de datos Phaedra Chat está separada de los demás proyectos.

## Acceso desde el programa

El menú **Ayuda → Live Community Chat** se está cambiando para acceder únicamente al servicio propio. Hasta que se verifique el despliegue no abrirá salas de terceros ni enlaces que no existan. Para pruebas locales, los desarrolladores pueden establecer `PHAEDRA_CHAT_URL=http://127.0.0.1:3000` o la URL segura de una implementación verificada.

## Estado de beta

Todavía faltan verificación de cuentas, herramientas avanzadas de moderación, política de conservación y documentación legal antes de abrir el acceso indiscriminadamente. No compartas contraseñas, claves ni mensajes privados. El chat no reemplaza [GitHub Issues](https://github.com/mindrapeofficial-wq/phaedra/issues) para informar fallos.

## Enlaces

- [Manual](./manual.md)
- [Primeros pasos](./primeros-pasos.md)
- [Chat propio: código](../../chat/)
- [Repositorio Phaedra](https://github.com/mindrapeofficial-wq/phaedra)
