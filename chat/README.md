# PHAEDRA CHAT / servicio propio

Chat creado y administrado por Phaedra. No usa IRC, Discord ni infraestructura de mensajería ajena. La web y API son código propio; el alojamiento y la base de datos son proveedores de infraestructura.

## Arquitectura

- **Cliente:** `index.html`, `style.css` y `app.js`, interfaz Phaedra.
- **API:** `api/chat.mjs`, aplicación propia en Vercel Functions, peticiones autenticadas mediante token anónimo.
- **Base de datos:** PostgreSQL dedicado, migración `db/schema.sql`. No reutilizar BD de otros proyectos.
- **Salas:** #general, #produccion, #ayuda y #desarrollo.
- **Actualizaciones:** sondeo cada 2,8 segundos. Esto es casi tiempo real, **todavía no WebSocket**.
- **Identidad:** apodos de invitados sin verificar, no confundir con cuentas personales.
- **Mensajes:** texto solamente, longitud máxima 500; protección básica de frecuencia (una publicación por IP cada 3 s y máximo diario de 120).
- **Presencia:** ventana de 65 s actualizada por heartbeat cada 30 s.
- **Moderación:** API `POST /api/chat?action=moderate` protegida por `CHAT_ADMIN_KEY`, que permite ocultar mensajes; pendiente interfaz administrativa.
- **Privacidad:** no se guarda la dirección IP en claro; se almacena un hash con `CHAT_IP_PEPPER`. Es importante redactar los términos de privacidad y retención antes de producción pública.

## Desarrollo

Node 22 o superior.

```bash
cd chat
npm ci
npm test
npx vercel dev
```

Configurar las variables en la plataforma, nunca en GitHub:

- `DATABASE_URL`: conexión PostgreSQL al proyecto de Phaedra Chat.
- `CHAT_IP_PEPPER`: cadena aleatoria secreta de al menos 32 bytes, para hash IP.
- `CHAT_ADMIN_KEY`: secreto aleatorio para las operaciones de moderación.

Ejecutar `db/schema.sql` una vez en la base de datos dedicada. El cliente funciona con API bajo el mismo dominio. Todas las acciones se hacen mediante `/api/chat`.

## API

- `GET ?action=health`: salud de la base de datos.
- `GET ?action=rooms`: salas.
- `POST ?action=join` con `{"nickname":"Artista"}`: token de invitado válido 7 días.
- `GET ?action=me`, header `Authorization: Bearer TOKEN`.
- `GET ?action=messages&room=general&after=0`: historial.
- `POST ?action=send`: mensaje, autenticado, con sala y cuerpo.
- `GET ?action=presence&room=general`: presencia reciente.
- `POST ?action=heartbeat`: actualiza presencia, autenticado.
- `POST ?action=logout`: invalida la sesión.
- `POST ?action=moderate`: ocultar mensaje, requiere cabecera `X-Phaedra-Admin-Key`.

## Antes de publicar para todos

Pendiente añadir registro y verificación de cuentas, bloqueo de usuarios, borrado/expiración del historial, panel de moderación, términos/aviso de privacidad y monitorización de abuso. La versión actual es una **beta para pruebas con invitados**, no una red social endurecida.

La aplicación Phaedra debe enlazar únicamente al dominio **verificado y publicado** de este servicio. No se sustituye el chat IRC por otra URL que todavía no exista.
