# Stoat permanente para la beta de Phaedra

Este paquete prepara una **instancia independiente en una VM**, con Caddy/HTTPS, datos persistentes, credenciales propias y registro por invitación. Usa el checkout oficial de [stoat.lock.json](../stoat.lock.json): self-host 9af5e906… y backend v0.15.5. No aprovisiona servidores, modifica DNS ni envía correo durante la preparación.

La [configuración local](../README.md) desactiva la verificación de correo y no sirve para publicar esta instancia. Los estados permanente y efímero tienen marcadores distintos; el test que crea cuentas locales rechaza el estado permanente.

## Destino y recursos

El repositorio documenta el chat anterior en Vercel/Neon, pero no contiene un servidor Stoat permanente existente. Esta ruta necesita:

- Una VM Linux compatible. Stoat recomienda como mínimo **2 vCPU y 2 GB de RAM**. Para la beta proponemos **2 vCPU, 4 GB y 40 GB de SSD** como margen inicial estimado, ajustable al uso.
- Docker Engine, Docker Compose 2.24.4+, Node.js 22+, Git, Bash y OpenSSL. Para respaldos: GNU tar y age.
- Un dominio cuyo A/AAAA apunte a la VM. Caddy publica únicamente TCP **80 y 443**; el acceso administrativo se gestiona aparte. MongoDB, Redis, RabbitMQ y S3 no publican puertos del host.
- SMTP autorizado con remitente configurado y TLS o STARTTLS, para verificar cuentas y recuperar contraseñas.
- Un destinatario público de age, generado por el operador en una máquina de confianza. La identidad privada de descifrado se conserva fuera de la VM.

Ubuntu 22.04 superó la integración anterior con MongoDB 8. Para otro kernel, revisar [la incidencia documentada](../README.md#compatibilidad-de-mongodb-y-el-entorno-de-ci). No desactivar las comprobaciones del motor ni cambiar de versión mayor sobre datos existentes para evitar ese problema.

Render permite contenedores y servicios privados, pero exige dividir el Compose en servicios y contratar almacenamiento persistente para MongoDB, RabbitMQ y S3. Sus discos pertenecen a un solo servicio e impiden escalarlo a varias instancias. La VM conserva la topología oficial y concentra el respaldo. Este paquete no crea recursos de Render.

## Configuración

Copiar las plantillas fuera del repositorio con acceso exclusivo del administrador:

~~~sh
sudo install -d -m 700 /etc/phaedra-social /srv/phaedra-backups
sudo cp social/deploy/production/settings.example.json /etc/phaedra-social/settings.json
sudo cp social/deploy/production/secrets.example.json /etc/phaedra-social/secrets.json
sudo chmod 600 /etc/phaedra-social/*.json
~~~

Editar esos archivos en el host o mediante un gestor de secretos. No copiar sus valores a Git, artefactos, el bundle Windows, issues o conversaciones. Los dominios de ejemplo se rechazan hasta sustituirlos.

| Ajuste | Comportamiento |
|---|---|
| smtp.transport: starttls | STARTTLS obligatorio; puerto habitual 587. |
| smtp.transport: tls | TLS desde el inicio; puerto habitual 465. |
| captcha.enabled: false | Opción explícita para esta beta cerrada. No requiere cuenta de hCaptcha. |
| captcha.enabled: true | Requiere clave pública y secreto propios; rechaza claves de prueba. |
| legal.* | Enlaces opcionales a documentos del administrador. No genera ni publica textos legales. |
| backup.ageRecipient | Destinatario público age1…; nunca la identidad privada AGE-SECRET-KEY-…. |

El paquete **siempre configura invite_only=true**. No incluye un modo de registro abierto y no permite desactivar SMTP/TLS.

Generar la identidad de recuperación **fuera del servidor** y guardar solo su destinatario público en settings.json:

~~~sh
umask 077
age-keygen -o /ruta-segura/phaedra-recovery.key
~~~

## Preparar, revisar y arrancar

Desde la raíz del código de Phaedra:

~~~sh
sudo node social/deploy/production/prepare.mjs --directory /srv/phaedra-social --settings /etc/phaedra-social/settings.json --secrets /etc/phaedra-social/secrets.json
sudo node social/deploy/production/manage.mjs validate --directory /srv/phaedra-social
sudo node social/deploy/production/manage.mjs pin-images --directory /srv/phaedra-social
sudo node social/deploy/production/manage.mjs up --directory /srv/phaedra-social
~~~

La preparación verifica el SHA oficial, genera claves propias y se niega a sobrescribir datos existentes. No inicia contenedores ni consulta SMTP. La clave de cifrado de archivos permanece en upstream/secrets.env: sin ella no se recuperan los adjuntos aunque sobrevivan los objetos S3.

pin-images descarga las imágenes y guarda sus digests en images.lock.json y upstream/compose.images.json. up utiliza esas referencias sin actualizar etiquetas. Los hashes del manifiesto detectan modificaciones accidentales de configuración. Una actualización o cambio de credenciales requiere una revisión que preserve claves y datos; este paquete no automatiza migraciones ni rotaciones.

El arranque comprueba HTTPS y la configuración anunciada por la API. Eso confirma que el correo está configurado, **no acredita entrega SMTP**: verificar entrega y recuperación de contraseña con una cuenta propia cuando exista el destino.

La instancia incluye MongoDB con usuario readWrite limitado a revolt, Redis autenticado con AOF, RabbitMQ con nombre de nodo fijo, S3 privado, API, WebSocket, Autumn, cliente oficial y procesos crond/pushd. Los datos y certificados persisten en el directorio de estado. Voz, vídeo, GIF y proxy de vistas previas quedan desactivados.

Los bind mounts de configuración son de solo lectura. Revolt.toml y los archivos que leen procesos sin privilegios son legibles dentro del contenedor, protegidos por directorios del host con permisos 0700.

El valor upstream production=false se conserva: en esta versión selecciona también identidad y plantillas del servicio oficial de Stoat. HTTPS y los controles de esta instancia se configuran independientemente.

## Configuración pública del cliente

Se genera /srv/phaedra-social/client-config.json con schemaVersion=1, appName=Phaedra Social, apiUrl=https://DOMINIO/api, registrationUrl=https://DOMINIO/, allowedServiceOrigins=[] y maxUploadBytes. Contiene únicamente datos públicos y puede alimentar la compilación:

~~~sh
node social/scripts/build.mjs --config /ruta/client-config.json
~~~

El resto del estado contiene secretos y datos y no debe incluirse en el bundle del DAW ni en artefactos de CI.

## Alta inicial

La API debe completar primero sus migraciones. No crear colecciones de aplicación ni cuentas mediante inserciones manuales antes de ese arranque.

1. Crear una invitación mediante el comando local siguiente.
2. Leer el código del archivo privado y registrar la cuenta propia desde el cliente oficial de https://DOMINIO/. Verificar el correo y completar el nombre de usuario.
3. Revocar el código tras esa ventana de alta.
4. Si la cuenta administrará la instancia completa, promover su identificador exacto. Para una comunidad pueden bastar la propiedad del servidor y sus roles.

~~~sh
sudo node social/deploy/production/manage.mjs invite-create --directory /srv/phaedra-social --out /etc/phaedra-social/first-invitation.json
sudo node social/deploy/production/manage.mjs invite-revoke --directory /srv/phaedra-social --invite-file /etc/phaedra-social/first-invitation.json
sudo node social/deploy/production/manage.mjs promote-admin --directory /srv/phaedra-social --user-id IDENTIFICADOR_ULID_DE_26_CARACTERES
~~~

La promoción exige una cuenta existente con correo verificado y onboarding terminado. Los scripts no envían invitaciones, crean usuarios ni modifican la verificación de correo.

**En v0.15.5 los códigos de registro no garantizan un solo uso ni caducan automáticamente.** El backend marca used pero no lo comprueba al aceptar otro registro. Revocarlos borra el documento; no cancela peticiones que ya lo hayan leído. Si la creación devuelve un resultado incierto, el archivo privado se conserva para poder revocarlo.

## Operación y respaldo

~~~sh
sudo node social/deploy/production/manage.mjs status --directory /srv/phaedra-social
sudo node social/deploy/production/manage.mjs verify --directory /srv/phaedra-social
sudo node social/deploy/production/manage.mjs diagnose --directory /srv/phaedra-social
sudo node social/deploy/production/manage.mjs stop --directory /srv/phaedra-social
sudo node social/deploy/production/backup.mjs --directory /srv/phaedra-social --out /srv/phaedra-backups/2026-10-27.tar.gz.age
~~~

diagnose redacta valores de configuración y secretos antes de mostrar logs. No publicar el resultado crudo de docker compose config ni los archivos de estado.

El respaldo **interrumpe temporalmente el servicio**. Detiene la entrada y los procesos escritores, bloquea escrituras Mongo durante un mongodump lógico y archiva S3/RabbitMQ/Redis detenidos, certificados, configuración, digests y claves. Cifra el conjunto con age y después reanuda los servicios. La identidad privada no se necesita para crear la copia.

Copiar el archivo cifrado a un destino autorizado separado de la VM; conservarlo solo en ese servidor no protege frente a su pérdida. No se contrata almacenamiento ni se realiza una transferencia externa automática.

Si el proceso acaba abruptamente, comprobar el propietario de .operation-lock antes de retirar un bloqueo obsoleto. Revisar si Mongo continúa bloqueado; la recuperación local es:

~~~sh
sudo node social/deploy/production/manage.mjs unlock-database --directory /srv/phaedra-social
sudo node social/deploy/production/manage.mjs up --directory /srv/phaedra-social
~~~

No desbloquear mientras haya otra copia o tarea administrativa activa.

## Restauración

Restaurar en otro host aislado y vacío, con las mismas imágenes, evitando colisiones con el proyecto Compose activo. El archivo contiene recovery/mongo.archive.gz en lugar de los archivos Mongo en bruto. S3 y su clave de cifrado deben proceder de la misma copia.

~~~sh
umask 077
age --decrypt --identity /ruta-segura/phaedra-recovery.key --output /ruta-segura/phaedra-restore.tar.gz /ruta/2026-10-27.tar.gz.age
sudo install -d -m 700 /srv/phaedra-social-recovery
sudo tar --extract --gzip --file /ruta-segura/phaedra-restore.tar.gz --directory /srv/phaedra-social-recovery
sudo node social/deploy/production/manage.mjs restore-database --directory /srv/phaedra-social-recovery --archive /srv/phaedra-social-recovery/recovery/mongo.archive.gz
~~~

El comando exige un directorio Mongo vacío, arranca únicamente Mongo y comprueba la migración y las colecciones restauradas. No usa --drop ni sobrescribe una base existente. Antes de cambiar DNS o declarar la recuperación completa, verificar una cuenta propia, un mensaje conocido y un adjunto con SHA-256 conocido. Retirar después la copia temporal descifrada.

## Validación y límites

~~~sh
node social/deploy/production/production.test.mjs
PHAEDRA_PRODUCTION_BOOT_TEST=1 node social/deploy/production/boot-test.mjs
~~~

Las pruebas usan fixtures sintéticos y no contactan SMTP, hCaptcha ni un dominio real. Verifican preparación, rutas privadas, permisos, configuración pública sin secretos, guardas de registro, transporte binario y errores redactados.

El segundo comando requiere Docker. Valida primero el Caddyfile HTTPS original con la imagen fijada y la red desactivada. Después crea una instancia nueva, conserva la autenticación y la persistencia de producción y usa un gateway HTTP exclusivo de prueba dentro de una red Docker interna sin salida externa ni puertos publicados. Consulta la API y Autumn desde el loopback del contenedor Caddy; comprueba los procesos permanentes y el rechazo de Mongo/Redis a operaciones sin credenciales. No acepta un directorio existente, crea cuentas ni llama a SMTP. El overlay de prueba no puede cargarse mediante manage/up.

Entrega SMTP, certificado del dominio, cuentas propias y un ensayo completo de restauración se comprueban cuando exista el destino definitivo. Una validación de sintaxis no acredita un servicio público operativo.

## Referencias

- [Despliegue oficial fijado y recursos mínimos](https://github.com/stoatchat/self-hosted/tree/9af5e9063a8d1311477b7d2f24f5764ffe3e1cd1).
- [Guía oficial de invitaciones](https://github.com/stoatchat/self-hosted/blob/9af5e9063a8d1311477b7d2f24f5764ffe3e1cd1/Guides.md#making-your-instance-invite-only).
- [Configuración del backend v0.15.5](https://github.com/stoatchat/stoatchat/blob/dc31dd7e62c1f8806b663549700a4121537b9530/crates/core/config/Revolt.toml).
- [Registro e invitaciones v0.15.5](https://github.com/stoatchat/stoatchat/blob/dc31dd7e62c1f8806b663549700a4121537b9530/crates/delta/src/routes/account/create_account.rs).
- [MongoDB: imagen oficial](https://github.com/docker-library/docs/blob/master/mongo/README.md) y [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/).
- [age](https://github.com/FiloSottile/age).
- [Render: servicios privados](https://render.com/docs/private-services) y [discos persistentes](https://render.com/docs/disks).
