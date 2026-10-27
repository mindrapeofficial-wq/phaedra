# Phaedra Social — prototipo con Stoat

Cliente propio para conectar Phaedra a una instancia de Stoat administrada por su comunidad. Esta primera versión ofrece inicio de sesión, canales de texto, mensajes directos, contactos y envío/reproducción de audio. El ejecutable Windows tiene su propio proceso y se abre desde el chat del DAW cuando está incluido en la distribución.

El cliente no contiene una comunidad de demostración ni un servidor público predeterminado. Una pantalla abierta o una compilación correcta no acreditan que haya un servicio conectado: la interfaz indica su estado real.

## Desarrollo del cliente

Requiere Node.js 22 o superior. No tiene dependencias de ejecución ni necesita instalar paquetes.

```sh
cd social
npm test
npm run check
npm run build
npm run dev
```

Abrir `http://127.0.0.1:5186`. El servidor de desarrollo escucha exclusivamente en loopback. `npm test` ejecuta las pruebas de contratos de red, ciclo de sesión, reconexión, configuración y distribución; no las confunde con la prueba de integración real.

La distribución web se genera en `social/dist/`. Solo se copian los archivos autorizados del cliente; los secretos, bases de datos y configuración de la instancia local quedan fuera.

## Configuración de una comunidad

`config.json` contiene únicamente configuración pública:

```json
{
  "schemaVersion": 1,
  "appName": "Phaedra Social",
  "apiUrl": "https://social.example.org/api",
  "registrationUrl": "https://social.example.org/",
  "allowedServiceOrigins": [],
  "maxUploadBytes": 20971520
}
```

La dirección es la raíz de la **API**, no una página de login. Desde esa raíz el cliente descubre WebSocket y Autumn. Si esos servicios están en otros orígenes, el administrador debe añadirlos expresamente a `allowedServiceOrigins`. Por ejemplo, `https://events.example.org` autoriza su equivalente `wss://events.example.org`; no se aceptan rutas o credenciales en esa lista. El navegador o WebView2 sigue sujeto a CORS: el servidor debe aceptar el origen del cliente. El host Windows usa `https://phaedra-social.invalid`.

Puede mantenerse `apiUrl` vacío para que quien prueba el cliente introduzca el servidor al abrirlo. Para generar un bundle configurado sin editar el archivo compartido:

```sh
node social/scripts/build.mjs --config /ruta/a/comunidad.local.json
```

Las compilaciones de preview también aceptan tres variables públicas de GitHub Actions:

| Variable | Contenido |
| --- | --- |
| `PUBLIC_PHAEDRA_SOCIAL_API_URL` | Raíz HTTPS de la API de la comunidad. |
| `PUBLIC_PHAEDRA_SOCIAL_REGISTRATION_URL` | Dirección HTTPS del cliente oficial para registro y recuperación. |
| `PUBLIC_PHAEDRA_SOCIAL_ALLOWED_SERVICE_ORIGINS` | Lista JSON de orígenes adicionales, por ejemplo `["https://files.example.org"]`. |

Estas variables se configuran como **Repository variables**, no contienen credenciales y se incluyen en el cliente distribuido. Si están vacías, se conserva `config.json`; por defecto se solicita el servidor al abrir la ventana. Un archivo indicado mediante `--config` tiene prioridad sobre todas estas variables. Una dirección con credenciales, parámetros o un origen inválido hace fallar la compilación antes de sustituir una distribución anterior.

El ZIP de fuentes de cada paquete incluye la configuración pública emitida como `social/build-config.public.json`. Para reproducir esa configuración desde las fuentes extraídas, ejecutar `node social/scripts/build.mjs --config social/build-config.public.json`.

No se deben poner contraseñas, tokens ni claves de servidor en esta configuración. Las credenciales de usuario se envían solo al API seleccionado; la sesión se conserva en memoria y se pierde al cerrar la ventana. El socket se autentica mediante un primer mensaje `Authenticate`, sin tokens en la URL. El cliente no sigue redirecciones en solicitudes autenticadas.

El registro de cuentas, verificación de correo y recuperación de contraseñas se realizan desde el cliente oficial de la instancia indicado por `registrationUrl`. Esta versión requiere cuentas con onboarding terminado. MFA no está implementado en el formulario del prototipo; las cuentas que lo requieren reciben una explicación y no se declara una sesión abierta.

## Prueba con dos usuarios reales

La integración usa el despliegue oficial de Stoat fijado en [deploy/stoat.lock.json](deploy/stoat.lock.json). Solo crea cuentas y archivos en una instancia local efímera verificada mediante marcador. Instrucciones completas en [deploy/README.md](deploy/README.md).

```sh
node social/deploy/local-stoat.mjs prepare --directory /tmp/phaedra-stoat
node social/deploy/local-stoat.mjs up --directory /tmp/phaedra-stoat
PHAEDRA_STOAT_STATE=/tmp/phaedra-stoat node social/tests/live-stoat.test.mjs
node social/deploy/local-stoat.mjs down --directory /tmp/phaedra-stoat
```

Requiere Docker y Docker Compose 2.24.4+. El workflow `Phaedra Social prototype` ejecuta esta prueba en un runner Ubuntu. Comprueba registro/onboarding, dos conexiones simultáneas, amistad, mensaje privado recibido por WebSocket, persistencia en historial, subida a Autumn, descarga y SHA-256 de un WAV. Si no hay instancia configurada, la ejecución manual de la prueba informa explícitamente que se omite.

El despliegue de pruebas desactiva correo y CAPTCHA y solo expone `127.0.0.1`. No es una configuración para publicar una comunidad en Internet. La instancia permanente requiere dominio, HTTPS, correo/recuperación de cuentas, almacenamiento, copias y administración propios.

## Integración en Windows

El host se compila con MSVC y WebView2, separado del motor Waf/GTK. Ver [tools/phaedra_social/README.md](../tools/phaedra_social/README.md).

```powershell
node social/scripts/build.mjs
./tools/phaedra_social/build.ps1 -ClientDist social/dist -OutputDir artifacts/phaedra-social
./artifacts/phaedra-social/bin/PhaedraSocial.exe --self-test
```

`tools/package_windows.py --social-bundle artifacts/phaedra-social` incorpora el host, el cliente, las licencias y los hashes al bundle del DAW. El parámetro es opcional y no cambia la compilación del motor de audio. La construcción del prototipo en CI genera un ZIP Windows independiente y un ZIP con sus fuentes.

El DAW intenta abrir el host empaquetado y conserva su destino web de chat si no está presente. El host detecta la falta del runtime WebView2 y ofrece una alternativa comprensible, sin presentar una ventana vacía. La ventana social es una ventana compañera; todavía no es un panel acoplado al editor GTK.

## Alcance de esta versión

- Incluye mensajes de texto, canales disponibles para la cuenta, privados, contactos y audio adjunto.
- Los mensajes y nombres se muestran como texto. No se ejecuta HTML recibido desde el chat.
- Un fallo de red al enviar no desencadena reenvíos automáticos. Se conserva el borrador y se pide comprobar la conversación antes de repetir.
- La reconexión recupera los canales y el historial activo. No se almacenan credenciales en `localStorage`, cookies de la aplicación ni archivos del cliente.
- Voz, cámara, compartir pantalla, audio del máster y coedición de proyectos quedan fuera de esta fase. El host no expone un puente JavaScript hacia órdenes del DAW.
- Las pruebas de contrato son distintas de las pruebas con servidor real, del arranque gráfico de WebView2 y de una sesión de reproducción/grabación del DAW. Cada una debe tener evidencia propia antes de anunciarla como verificada.

## Fuentes y licencias

El cliente es código de Phaedra bajo GPL-2.0-or-later. El host auxiliar nuevo incluye su licencia MIT. El bundle Windows incluye los avisos de redistribución de WebView2. No se ha copiado el cliente completo de Stoat ni se ha incorporado su SDK al ejecutable.

El protocolo y las rutas se han contrastado con:

- [Stoat backend](https://github.com/stoatchat/stoatchat), incluidos Bonfire y las rutas REST.
- [SDK oficial de Stoat](https://github.com/stoatchat/javascript-client-sdk), como referencia del contrato de API.
- [Despliegue oficial](https://github.com/stoatchat/self-hosted), cuya revisión se fija en el lock.
- [Documentación de WebView2 Win32](https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/win32).

El servidor Stoat conserva su licencia AGPL y las licencias específicas de sus componentes. Nuestra identidad visual es propia; no se presenta esta instancia como el servicio oficial de Stoat.
