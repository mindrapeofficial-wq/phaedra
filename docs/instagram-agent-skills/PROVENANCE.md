# Verificación de procedencia y límites

Fecha de preparación: 2026-10-31. Fuente upstream: `postzen-dev/instagram-agent-skill`, commit `7d3dd6e0183127e266e7c81f4d4044fa4fa9d368`. Licencia MIT. Skills copiadas como texto sin cambios desde GitHub a rutas de descubrimiento locales de Claude Code y Codex.

Hay un archivo `.mcp.json` que declara el servidor remoto oficial `https://mcp.postzen.dev/mcp`, pero **no** incluye credenciales, tokens ni sesiones. El cliente debe preguntar por OAuth y el usuario debe aprobarlo. El repositorio no dispone de capacidad de publicar por sí solo ni accede a Instagram tras este commit. Para funcionalidad real, faltan conexión PostZen y comprobaciones de permisos.

En la sesión de ChatGPT actual se ha verificado por el directorio de plugins que Metricool está instalado, PostZen no figura disponible como plugin directo. El conector de Metricool solo expone creación/edición de programaciones y lecturas analíticas, no herramientas directas para comentarios y DMs.

Límites explícitos: comentarios en cuentas ajenas son manuales, DMs solo como respuesta a hilos existentes bajo ventanas de Meta, stories con stickers requieren publicación manual, perfiles deben actualizarse desde la app. Publicar requiere aprobación por contenido y hora. No duplicar contenidos administrados por Metricool.

**No es una instalación en la máquina del usuario ni una conexión OAuth activa.** Es un paquete en una rama GitHub listo para que el titular lo revise e incorpore a un cliente compatible.
