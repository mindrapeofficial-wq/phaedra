# PHAEDRA · PostZen en producción (31-10-2026)

Esta integración pertenece a las **Instagram Agent Skills de Phaedra**; no tiene relación con Social Banana.

## Verificaciones realizadas mediante la API REST

- Cuenta PostZen `j9728s2139w1qrqdte0fynrjf98hbg4j` → **Instagram @phaedrasound**, conectada (GET /v1/accounts, HTTP 200).
- Borrador de prueba: `m1767zvcde9ked9gpx7stxbchd8hbjy9`, «Hello from PostZen 👋», estado **draft**, sin publicación.
- Bandeja de DMs: GET /v1/inbox/conversations devolvió 200 y cero conversaciones en el momento de la prueba. No afirmar que eso demuestra ausencia de mensajes en Instagram.
- Dos automatizaciones de PostZen verificadas **activas**, sin envíos todavía registrados:
  - `qs74sd3yx608n5f54sred8wmm58hbc8s`: comentarios en cualquier publicación propia con texto **exacto** `INFO` → DM informativo + respuesta pública.
  - `qs7a61g14qgm15r3ex1dxw95b58ha0gn`: respuesta a historia con texto **exacto** `INFO` → DM informativo.

Las reglas se ejecutan en PostZen desde eventos de Instagram: no requieren servidor local ni abrir Chrome. **No publicar contenido extra ni duplicar estas reglas.**

## Operativa de PHAEDRA

- La voz y hechos verificables están en Google Drive `PHAEDRA/07-MARKETING/voice-phaedra-instagram.md`, `PHAEDRA-AGENTE-INSTAGRAM-GUIA.md` y `PHAEDRA-POSTZEN-INTEGRACION-2026-10-31.md`.
- Las siete piezas del 1 al 7 de noviembre siguen en Metricool y **no deben crearse por segunda vez en PostZen**. Los tres borradores del 10, 12 y 14 de noviembre no están autorizados para publicación.
- En nuevos **borradores** de piezas informativas puede sugerirse «Si quieres saber más, comenta INFO», siempre que tenga sentido y el propietario lo apruebe al publicar.
- La regla solo responde cuando una persona ha escrito exactamente `INFO`. No genera outreach, follows, likes, comentarios en publicaciones ajenas ni lectura de historias de terceros.
- Los demás DMs y comentarios requieren destinatario real, ventana de mensajería válida y aprobación del texto concreto; no enviar en masa. No duplicar respuestas si una ejecución queda incierta.
- No prometer estabilidad de Phaedra Lite o características todavía no verificadas.

## Puente Node.js probado

La versión **1.1.0** con 15 pruebas locales satisfactorias está guardada en la misma carpeta de Drive:
[PHAEDRA-POSTZEN-BRIDGE-1.1.0.zip](https://drive.google.com/file/d/1asRqGiB66m7tL7f8jTXPSyHoS2k6UD5G/view).

Comandos, desde el proyecto extraído y **con `POSTZEN_API_KEY` configurada en un secret manager**:

```sh
npm test
npm run inspect
npm run draft -- --account j9728s2139w1qrqdte0fynrjf98hbg4j --content "Texto autorizado" --image-url "https://example.com/imagen.png" --request-id "unico"
```

Los comandos de respuesta individual exigen `--approve-send` y el destinatario exacto. Nunca subir la clave API al repositorio, al archivo MCP, al frontend, a Drive ni a los prompts.

## Distinción importante: MCP vs. REST

- **REST PostZen**: autenticada y probada con una API key del propietario, como servicio separado.
- **MCP PostZen en Claude/Codex**: el servidor remoto está declarado en `.mcp.json`, pero cada cliente debe completar OAuth/permiso o autenticación privada. No inferir que la sesión del cliente está autenticada por existir un borrador REST.
- **ChatGPT**: PostZen todavía no aparece como plugin nativo disponible en esta conversación; Metricool sí está conectado. No inventar acciones de PostZen que no se hayan podido ejecutar realmente.

Documentación: https://www.postzen.dev/agent-quickstart.md · https://www.postzen.dev/mcp/instagram · https://docs.postzen.dev/comment-automations
