import { proPromoActive } from './promo.js';
import { instagramTrialClaimed } from './instagram-trial.js';

const TOPICS = {
  portadas: `🎨 Portadas e imágenes

Pídelo con tus palabras, por ejemplo: «Hazme una portada oscura para mi single Noche».
• Mándame una foto para usarla de referencia. Si me lo pides, mantengo tu cara.
• También quito fondos y cambio luz o colores.
• /imagen seguido de tu idea va directo al encargo.
• Calidad PRO (la máxima) o Lite (rápida; dime «Lite»).
• Gratis: 1 PRO y 5 Lite en total. Plan PRO: 25 Lite al mes.

📁 Mándame varias fotos y dime si las guardo; /fotos te las enseña. Si el administrador te da acceso a una ficha compartida, la verás con /fichas.`,
  bases: `🎧 Bases y pistas

Pídemela con tus palabras, por ejemplo: «Hazme una base de trap melódico, oscura».
• PRO: te pregunto los detalles; hasta 3 minutos.
• Lite: rápida e instrumental; hasta 1 minuto.
• Gratis: 1 PRO y 5 Lite en total. Plan PRO: 5 PRO y 25 Lite al mes.

🎚️ Separar pistas: mándame un audio por privado con /separar (o responde al audio con /separar). Gratis: 1 en total. Plan PRO: 10 al mes.

PRO+ y Ultimate multiplican las cantidades del plan PRO por 2,5 y 5.`,
  comentarios: `💬 Comentarios y ronda diaria

Pégame una publicación y te propongo 3 comentarios; tú publicas el que quieras. Si me das las cuentas, te preparo la ronda del día con qué decir a cada una.
No sigo, ni comento, ni doy me gusta por ti: eso pone tu cuenta en riesgo.`,
  lanzamiento: `🚀 Plan de lanzamiento

Dime el título y la fecha exacta, por ejemplo: «Saco mi single Noche el 15 de enero de 2027, prepárame el plan».
• /plan: ver tus tareas y fechas
• /hecho 2: marcar la tarea 2 como hecha
• /recordatorios on o off: activar o parar los avisos por privado`,
  instagram: `📸 Instagram

Conecta una cuenta Creator o Business para analizarla y preparar borradores. No publico ni envío mensajes por mi cuenta.
• /instagram: conectar o revisar la cuenta
• /instagram verificar: comprobar la conexión
• /instagram reconectar: renovar permisos
• /desconectarinstagram: desactivar el acceso

Requiere una suscripción de pago, que todavía no está disponible.

Para pasar tu cuenta normal de Instagram a Creator o Business, en la app:
1. Abre tu perfil y toca Más (☰).
2. Entra en Configuración y actividad.
3. Toca Tipo de cuenta y herramientas.
4. Toca Cambiar a cuenta profesional y sigue los pasos.
5. Elige una categoría y después Creador o Empresa (Business).

Los nombres pueden variar un poco según la versión. Puedes volver a cambiarla cuando quieras. Para Banana sirven las dos; si dudas entre ambas, para un artista suele encajar Creador.`,
  cuenta: `👤 Tu cuenta y tus datos

• /miplan: tu plan (gratuito, PRO, PRO+ o Ultimate) y el % de tu límite de consumo que llevas
• /cuenta: vincular tu Telegram con tu cuenta de Banana
• /mimemoria: ver lo que recuerdo de ti
• /olvidame: borrar lo que recuerdo de ti

Planes: PRO 12 €, PRO+ 25 € y Ultimate 50 € al mes. Los cobros reales aún no están activos.
Cuenta y extensión: https://banana.phaedra.com.es/cuenta.html
Nunca me envíes contraseñas.`,
  referidos: `🎁 Referidos

Con /referir tienes tu enlace y tus recuentos. Por cada persona nueva que invites, consigues 1 día de funciones PRO. Si además paga una suscripción, 1 mes gratis.

Los cobros reales aún no están activos, así que de momento solo registramos a quién invitas.`,
  extension: `🧩 Extensión para Chrome

1. Descarga el ZIP en https://banana.phaedra.com.es/
2. Extráelo en una carpeta permanente.
3. En chrome://extensions activa el Modo de desarrollador.
4. Pulsa Cargar descomprimida y elige la carpeta con manifest.json.
5. Inicia sesión con tu cuenta.

Para actualizar, usa Recargar. No la quites, porque puedes perder tus datos locales. Si te atascas, dime en qué paso estás y qué error ves.`,
};
const OWNER = `\n\n🛠 Solo para ti
• /actividad: uso de los usuarios
• /gasto: consumo estimado
• /estadoia: comprobar las IA
• /engage: ideas de conversación
• /ficha nombre: ver la ficha de un artista
• /soporte off: salir del modo ayuda en el grupo
• Fichas: sube fotos y di «guárdalas en la ficha 2CB Records para Loyal T». Solo tú puedes crearlas.`;

export function helpTopic(argument = '') {
  const key = argument.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const aliases = { imagen: 'portadas', imagenes: 'portadas', portada: 'portadas', base: 'bases', musica: 'bases', separar: 'bases', pistas: 'bases', engagement: 'comentarios', plan: 'lanzamiento', lanzamientos: 'lanzamiento', ig: 'instagram', datos: 'cuenta', memoria: 'cuenta', referir: 'referidos', extensiones: 'extension' };
  return TOPICS[aliases[key] || key] || null;
}

export async function helpMessage({ argument = '', isGroup = false, isOwner = false } = {}) {
  if (isGroup) return 'Te ayudo por privado, con todos los comandos: https://t.me/SocialBananaBot?start=help\n\nAquí en el grupo puedes escribirme como a cualquiera y mencionar qué necesitas.';
  if (argument.trim()) return helpTopic(argument) || `No tengo ayuda sobre «${argument.trim().slice(0, 40)}». Prueba con: ${Object.keys(TOPICS).join(', ')}.`;
  const extras = [];
  if (proPromoActive()) extras.push('Promoción: funciones PRO gratis hasta el 6 de noviembre a las 13:30 (hora de Madrid).');
  if (!isOwner && !(await instagramTrialClaimed().catch(() => true))) extras.push('Queda 1 hueco gratis de Instagram durante 3 días: /reclamar');
  return `🍌 Hola, soy Emil, la IA manager de artistas de Banana. Háblame con tus palabras: no necesitas comandos.

Puedo ayudarte con:
🎨 Portadas: «Hazme una portada oscura para mi single Noche»
🎧 Bases: «Hazme una base de trap melódico»
🎚️ Separar pistas: mándame un audio con /separar
🚀 Lanzamientos: «Saco mi single el 15 de enero de 2027, prepárame el plan»
💬 Comentarios: pégame una publicación y te propongo qué comentar
🎙️ Notas de voz: si me mandas una, te respondo con voz generada por IA (gratis: 1 al día; plan PRO: 10 al día)

Comandos útiles:
/miplan: tu plan y tu consumo
/plan: tu plan de lanzamiento (/hecho 2 marca la tarea 2)
/ficha: tu ficha de artista · /fotos: tus fotos
/instagram: conectar tu Instagram
/cuenta: vincular tu cuenta de Banana
/referir: invitar a otros artistas
/mimemoria y /olvidame: ver o borrar lo que recuerdo de ti

Más detalle: /help seguido de ${Object.keys(TOPICS).join(', ')}.
¿Dudas o algún problema? Escribe a @PhaseREM.${extras.length ? `\n\n${extras.join('\n')}` : ''}${isOwner ? OWNER : ''}`;
}

export const ACCOUNT_TYPE_GUIDE = "📸 Para pasar tu cuenta normal de Instagram a Creator o Business, en la app:\n1. Abre tu perfil y toca Más (☰).\n2. Entra en Configuración y actividad.\n3. Toca Tipo de cuenta y herramientas.\n4. Toca Cambiar a cuenta profesional y sigue los pasos.\n5. Elige una categoría y después Creador o Empresa (Business).\n\nLos nombres pueden variar un poco según la versión. Puedes volver a cambiarla cuando quieras. Para Banana sirven las dos; si dudas entre ambas, para un artista suele encajar Creador.\n\nDespués: /cuenta, /reclamar y /instagram.";

export const MENU_COMMANDS = [
  ['help', 'Qué puedo hacer y cómo'], ['plan', 'Tu plan de lanzamiento'], ['hecho', 'Marcar una tarea: /hecho 2'],
  ['recordatorios', 'Avisos: /recordatorios on u off'], ['instagram', 'Conectar tu Instagram'], ['cuenta', 'Vincular tu cuenta'],
  ['miplan', 'Tu plan y tu consumo'], ['ficha', 'Tu ficha de artista'], ['fotos', 'Tus fotos guardadas'], ['fichas', 'Fichas compartidas'], ['referir', 'Invitar y conseguir meses gratis'], ['mimemoria', 'Ver lo que recuerdo de ti'], ['olvidame', 'Borrar lo que recuerdo de ti'],
].map(([command, description]) => ({ command, description }));
