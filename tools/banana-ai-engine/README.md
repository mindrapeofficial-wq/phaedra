# Banana AI Engine 0.25.1

Producción: https://banana-ai-engine.vercel.app/api/generate

OpenAI GPT-4.1; OPENAI_API_KEY únicamente en Vercel como secreto de producción.
JWT Supabase verificado, acceso mediante banana-billing y cupo atómico de 20 solicitudes por día UTC.
Solo genera borradores: no publica ni envía mensajes en Instagram.

`npm test`: 12 pruebas de autenticación, permisos, cupos, recepción durable y ausencia de secretos en respuestas.
Una generación autenticada real devolvió HTTP 200 y texto de GPT-4.1 el 2/11/2026.
El despliegue activo es dpl_CyZaPP6qHCT6WVhXavcQqAoedxL8.

## Recepción de Telegram

`/api/telegram` valida el secreto del webhook y persiste en sb_bot_jobs antes de confirmar la entrega. Después despierta Render con waitUntil; si tarda más de tres segundos, envía un único aviso en respuesta al mensaje. Los duplicados no generan otra tarea ni aviso. Render sigue siendo el trabajador de IA y el plan sigue Free.

TELEGRAM_BOT_TOKEN y SUPABASE_SERVICE_KEY son secretos de producción en Vercel. TELEGRAM_WEBHOOK_SECRET es opcional: usa la misma derivación SHA256 que el bot. Nunca incluirlos en archivos. @vercel/functions 3.6.1 está fijado con lockfile; npm audit no reportó vulnerabilidades al publicar.

Esto reduce los fallos de entrega cuando Render duerme; no convierte Render Free en un servicio siempre encendido. Si el trabajador no despierta tras los reintentos, las tareas siguen persistidas hasta el siguiente arranque.
