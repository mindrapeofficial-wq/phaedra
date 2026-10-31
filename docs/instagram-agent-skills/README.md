# PHAEDRA · Instagram Agent Skills (integración para Claude Code y Codex)

Este cambio instala **14 skills** de [postzen-dev/instagram-agent-skill](https://github.com/postzen-dev/instagram-agent-skill) como instrucciones locales de proyecto para gestionar la comunicación de PHAEDRA, con una puerta de autorización en cada publicación. Repositorio upstream fijado en el commit `7d3dd6e0183127e266e7c81f4d4044fa4fa9d368` (MIT). Archivo de licencia: `third_party/instagram-agent-skill/LICENSE`.

## Estado verificable

- **Archivos instalados en la rama de integración**: `.claude/skills/ig-*/` y `.agents/skills/ig-*/`. Claude Code usa la primera ruta; Codex descubre la segunda.
- **Scripts incluidos**: hookscore.py, beats.py, caption.py, humanize.py, detect.py y swipe.py, junto a hooks.json, slop.json y rubric.json.
- **PostZen MCP declarado** en `.mcp.json`: URL `https://mcp.postzen.dev/mcp`.
- **PostZen NO está autenticado** al añadir estos archivos. Tampoco implica que @phaedrasound esté conectado a PostZen. La autenticación OAuth, permiso Read & Write y conexión de la cuenta deben ser autorizadas por su titular en el navegador.
- **ChatGPT conectado a Metricool**, no a PostZen. El plugin de PostZen no apareció en el directorio de ChatGPT al auditarlo el 31/10/2026. Este cambio no instala ningún plugin nuevo en la sesión de ChatGPT y no modifica las automatizaciones de Metricool.
- **Estado del DAW**: Phaedra Lite v0.1.0-preview.5 pública en Windows/Linux, macOS preview.4; no anunciar una estable inexistente.

## Las 14 skills

| Habilidad | Trabajo | Cuenta Instagram necesaria |
|---|---|---|
| `ig-reel` | Hook + guion + beat sheet | No |
| `ig-viral` | Investigación de hooks y formatos, sin scraping | No |
| `ig-caption` | Redacción y validador de captions | No |
| `ig-carousel` | Guion de carrusel y diapositivas | No |
| `ig-story` | Secuencia de historias y llamadas a la acción | No; sí para publicar |
| `ig-profile` | Auditoría y propuesta de perfil | No; edición manual |
| `ig-plan` | Plan semanal y calendario | No; datos reales con PostZen o Metricool |
| `ig-human` | Limpieza y puntuación del borrador | No |
| `ig-comment` | Prepara comentarios de valor en cuentas ajenas | Manual: NO autopublica |
| `ig-reply` | Clasifica y redacta respuestas de comentarios propios | Sí para lectura/escritura |
| `ig-dm` | Redacta respuestas entrantes y keyword-to-DM | Sí para lectura/escritura |
| `ig-repurpose` | Reutiliza contenido largo original en varias piezas | No; sí para publicar |
| `ig-audit` | Análisis comparado de resultados | Requiere datos de una cuenta |
| `ig-publish` | Publicar/programar/verificar | Sí, **Read & Write** |

## Cómo completar la conexión

### Claude Code

1. Cambia a la rama de integración o incorpora este PR. Reinicia Claude Code para que detecte las skills.
2. En Claude Code ejecuta `/mcp`; selecciona `postzen` y pulsa Authenticate. La URL ya está declarada en `.mcp.json`.
3. Se abre PostZen: inicia sesión tú, selecciona permiso **Read & Write** y limita el acceso al perfil de Phaedra cuando esté disponible.
4. Conecta tu Instagram profesional **@phaedrasound** desde PostZen. Debes realizar personalmente Instagram Login.
5. Verifica `listAccounts({platform:"instagram"})` y que aparezca exactamente @phaedrasound. Después prueba `/ig-reel`, `/ig-audit` y `/ig-publish` en modo borrador antes de programar.

### Codex

Abre el repo en Codex; los directorios `.agents/skills` estarán disponibles. Configura y autoriza el MCP en tu equipo:

```bash
codex mcp add postzen --url https://mcp.postzen.dev/mcp
codex mcp login postzen
codex mcp list
```

La configuración OAuth queda en tu propio cliente, no se commitea ni se comparte. No pegues contraseñas ni claves de PostZen en este repositorio, chats o ficheros `.mcp.json`.

## Voz editorial

- La versión aprobada de `voice-phaedra-instagram.md` está en Google Drive `PHAEDRA/07-MARKETING`.
- Copia su contenido a `~/.instagram-agent/voice.md` en el equipo que ejecute Claude/Codex; el paquete original usa esa ruta.
- Para una voz nueva, plantilla general en `docs/instagram-agent-skills/voice-template.md`.
- Identificar mockups como conceptos y capturas con versión exacta; no afirmar que los vídeos promocionales son una ejecución real de preview.5.

## Políticas de operación

- Las **7 piezas ya autorizadas** (1-7 nov 2026) están programadas mediante Metricool. **No duplicarlas en PostZen**.
- Los **3 contenidos del 10, 12 y 14 de noviembre** están en Metricool como borradores no autorizados para su publicación.
- No publicar ni activar nuevos borradores sin aprobación concreta del propietario del contenido, cuenta y hora.
- No enviar spam, automatizar likes/seguimientos o comentarios a terceros; `ig-comment` prepara textos de publicación manual.
- PostZen permite leer y responder mensajes entrantes dentro de ventanas autorizadas, no iniciar DMs no solicitados.
- No borrar comentarios automáticamente; revisar la moderación y preferir ocultar spam después de una aprobación.
- No activar una automatización de comentario-a-DM de forma global ni masiva sin una regla y mensaje revisados y autorización específica.
- En caso de error de acceso, detenerse y pedir reautorización; no eludir mediante scraping ni cookies.

## Validación antes de darlo por operativo

1. Detectar las catorce skills en el cliente local.
2. Comprobar que el cliente ve el servidor `postzen` y que OAuth está autenticado.
3. Obtener `listAccounts` con `instagram` conectado y handle exacto.
4. Probar tres skills de solo escritura: `ig-reel`, `ig-caption`, `ig-human`.
5. Probar lectura real de insights y comentarios en la cuenta; jamás afirmar capacidades de DMs sin haber comprobado permisos.
6. Crear un único borrador de prueba **sin publicación automática**, revisar su contenido y comprobar su existencia.
7. Solo después, bajo aprobación explícita del usuario, activar cualquier función de escritura.

Fuente: https://github.com/postzen-dev/instagram-agent-skill , https://docs.postzen.dev/mcp y https://docs.postzen.dev/platforms/instagram .
