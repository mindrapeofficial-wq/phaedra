# Phaedra · Sitio oficial

Web oficial de Phaedra DAW: https://phaedra-daw.vercel.app

## Diseño (v2, 25/10/2026)

Dirección visual: identidad editorial e industrial, con tipografía a gran escala, márgenes amplios, ritmo de retícula y contraste entre papel cálido, tinta oscura y violeta Phaedra.

Referencias estudiadas:
- Teenage Engineering OP–1 field: https://teenage.engineering/products/op-1 (tipografía editorial y fichas técnicas).
- Ableton Live: https://www.ableton.com/en/live/ (bloques de contenido y exposición del flujo creativo).
- Bitwig Studio: https://www.bitwig.com/overview/ (secciones centradas en el producto y su entorno de trabajo).

No se han copiado HTML, CSS, imágenes comerciales, logos ni activos de estas webs. Esta implementación es original y usa el emblema real de Phaedra alojado en su propio repositorio: `gtk2_ardour/resources/Phaedra-icon_512px.png`.

La representación del editor multipista es **conceptual** y se identifica como tal en la página. Sustituirla más adelante por una captura auténtica y verificada del software cuando esté disponible.

**REA** (Reverse Engineer Anything) no estaba conectado a este entorno de ChatGPT y tampoco se pudo instalar por ausencia de acceso al registro npm. Por tanto, las referencias se investigaron con páginas públicas, no mediante un informe de REA. Una investigación futura puede conectarlo en un cliente de programación compatible, siguiendo https://rea.tools/.

## Archivos

- `index.html`: implementación HTML, CSS y JavaScript sin dependencias ni compilación.
- Idioma inicial: español. Diseño responsive y navegación por teclado.
- Novedades y descarga: API pública de GitHub Releases con `v1.0.0` como respaldo.

## Publicación

Proyecto Vercel: `phaedra-daw`. Sitio de producción: https://phaedra-daw.vercel.app. Directorio publicado: `.`.

El despliegue inicial y el rediseño se publicaron **mediante subida directa** a Vercel, ya que la integración GitHub de la cuenta Vercel aún no está autorizada.

**Importante:** modificar este archivo en GitHub NO actualiza Vercel automáticamente. Para habilitar despliegues automáticos hay que vincular `mindrapeofficial-wq/phaedra` a Vercel y configurar:
- Rama: `main`
- Directorio raíz: `website`
- Framework: Other / sin framework
- Directorio de salida: `.`

## Distribución

La versión `v1.0.0` publicada es un ZIP portátil experimental de Windows. No se anuncia como instalador estable ni se afirma que la compilación funcione en todos los equipos. El sitio deja claro que Phaedra es gratuito por ahora, sin suscripciones ni registro obligatorio.

Phaedra contiene código derivado de Ardour con obligaciones de licencia. Conservar los avisos de copyright pertinentes y el acceso al código fuente correspondiente. Consultar `COPYING` y licencias de componentes.
