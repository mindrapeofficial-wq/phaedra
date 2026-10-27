# Stoat local para Phaedra Social

Instancia aislada para comprobar el cliente de Phaedra con **dos cuentas reales de prueba**. Usa el [despliegue oficial de Stoat](https://github.com/stoatchat/self-hosted), fijado al commit indicado en `stoat.lock.json`. No copia ni modifica el motor de Phaedra.

## Requisitos

- Linux o WSL2, Node.js 22 o posterior, Git, Bash y OpenSSL.
- Docker Engine y Docker Compose **2.24.4 o posterior** (`!override`). Docker debe estar ya instalado.
- Acceso a GitHub, GHCR y Docker Hub para descargar las fuentes y las imágenes públicas.
- Un puerto local libre, por defecto `18080`. Hay varios servicios: reservar recursos de Docker suficientes, no solo los del cliente web.

## Preparar y arrancar

Desde la raíz del repositorio:

```bash
node social/deploy/local-stoat.mjs prepare --directory /tmp/phaedra-stoat --port 18080
node social/deploy/local-stoat.mjs up --directory /tmp/phaedra-stoat
```

`prepare` descarga el commit revisado, ejecuta el generador oficial de secretos y aplica una configuración **solo local**. Conserva los secretos en el directorio de estado con permisos restringidos. Si ya existe una instancia preparada, no regenera ni sobrescribe sus claves.

`up` arranca MongoDB, Valkey, RabbitMQ, almacenamiento S3, creación de buckets, API, WebSocket, Autumn, Caddy y el cliente oficial. Solo publica `127.0.0.1:18080`; no abre puertos de base de datos ni puertos de voz. Espera a que la API y el marcador de la instancia respondan.

- API para configurar en Phaedra Social: **http://127.0.0.1:18080/api**.
- Cliente oficial para registrar cuentas locales: **http://127.0.0.1:18080**.
- Las llamadas, vídeo, notificaciones push y proxies de GIF/vistas previas quedan fuera de esta prueba.

La configuración local desactiva correo de verificación y CAPTCHA. **No es una configuración de producción ni debe exponerse mediante un túnel o proxy público.** Un despliegue público requiere su dominio HTTPS, política de registro, correo, copias de seguridad y dimensionamiento propios.

## Prueba real de extremo a extremo

```bash
PHAEDRA_STOAT_STATE=/tmp/phaedra-stoat node social/tests/live-stoat.test.mjs
```

Antes de crear cuentas, el test verifica el manifiesto local, la dirección loopback y un identificador único servido por esa instancia. No acepta un servidor arbitrario ni credenciales de una comunidad existente.

La prueba:

1. Crea dos cuentas locales con contraseñas aleatorias que permanecen en memoria.
2. Completa sus nombres de usuario y conecta ambos clientes de Phaedra con REST y WebSocket reales.
3. Crea la relación de amistad y una conversación privada.
4. Envía un mensaje y comprueba recepción WebSocket e historial persistido.
5. Genera un WAV breve, lo sube a Autumn/S3 y lo comparte en la conversación.
6. Descarga el audio desde el segundo cliente y compara su SHA-256 con el original.
7. Cierra las sesiones. No imprime contraseñas ni tokens.

Sin `PHAEDRA_STOAT_STATE`, el test aparece **omitido**, nunca como una integración real aprobada. Las pruebas unitarias con transporte simulado no sustituyen esta ejecución.

## Detener y consultar

```bash
node social/deploy/local-stoat.mjs status --directory /tmp/phaedra-stoat
node social/deploy/local-stoat.mjs diagnose --directory /tmp/phaedra-stoat
node social/deploy/local-stoat.mjs down --directory /tmp/phaedra-stoat
```

`down` detiene únicamente el proyecto Compose identificado en el manifiesto. Conserva los datos y secretos locales; el directorio se puede eliminar después si ya no se necesita. No subirlo a GitHub, incluirlo en artefactos ni publicar los logs completos de autenticación.

`diagnose` recoge los últimos logs de los servicios y sus dependencias (incluidos MongoDB, RabbitMQ, Valkey, S3 y creación de buckets) en memoria y elimina los valores de `secrets.env`, las cadenas del TOML y los campos de autenticación antes de mostrarlos. No imprime los archivos de configuración ni los logs sin redacción. `up` detecta si un proceso permanente termina o queda sin salud al arrancar y falla inmediatamente para permitir ese diagnóstico.

## Versiones y alcance de la reproducibilidad

El checkout de configuración oficial está fijado por SHA y las imágenes del backend por `v0.15.5`. Las imágenes de infraestructura conservan las etiquetas del Compose oficial; estas etiquetas pueden actualizarse en sus registros. No se presenta esta configuración como una compilación hermética por digest.

La interfaz de Phaedra usa la API pública del servidor. Los avisos y licencias del software descargado permanecen en su checkout. Stoat y sus componentes conservan sus respectivas licencias; Phaedra Social es una integración independiente.

Fuentes revisadas:

- [Compose oficial fijado](https://github.com/stoatchat/self-hosted/blob/9af5e9063a8d1311477b7d2f24f5764ffe3e1cd1/compose.yml).
- [Generador oficial fijado](https://github.com/stoatchat/self-hosted/blob/9af5e9063a8d1311477b7d2f24f5764ffe3e1cd1/generate_config.sh).
- [Configuración del backend](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/config/Revolt.toml).
