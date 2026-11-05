import { proPromoActive } from './promo.js';
import { instagramTrialClaimed } from './instagram-trial.js';

const TOPICS = {
  portadas: `🎨 Portadas e imágenes

Pídelo con tus palabras, por ejemplo: «Hazme una portada oscura para mi single Noche».
• Mándame una foto para usarla de referencia. Puedo mantener tu cara si me lo pides.
• También quito fondos y cambio luz o colores.
• /imagen seguido de tu idea va directo al encargo.
• Mándame varias fotos y dime si las guardo; /fotos te las enseña.
• Si el administrador te da acceso a una ficha compartida, la verás con /fichas.

La cuenta gratuita incluye una imagen PRO en total.`,
  lanzamiento: `🚀 Plan de lanzamiento

Dime el título y la fecha exacta, por ejemplo: «Saco mi single Noche el 15 de enero de 2027, prepárame el plan».
• /plan: ver tus tareas y fechas
• /hecho 2: marcar la tarea 2
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

Los nombres pueden variar un poco según la versión. Puedes volver a cambiarla cuando quieras. Para Emil sirven las dos; si dudas entre ambas, para un artista suele encajar Creador.`,
  cuenta: `👤 Tu cuenta y tus datos

• /cuenta: vincular tu Telegram con tu cuenta de Social Banana
• /miplan: ver tu plan y tus consultas de hoy
• /mimemoria: ver lo que recuerdo de ti
• /olvidame: borrar lo que recuerdo de ti

Cuenta y extensión: https://banana.phaedra.com.es/cuenta.html
Nunca me envíes contraseñas.`,
  referidos: `🎁 Referidos

Con /referir tienes tu enlace y tus recuentos. Por cada persona que invites y pague una suscripción, consigues 1 mes gratis.

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
• /soporte off: salir del modo ayuda en el grupo
• Fichas: sube fotos y di «guárdalas en la ficha 2CB Records para Loyal T». Solo tú puedes crearlas.`;

export function helpTopic(argument = '') {
  const key = argument.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const aliases = { imagen: 'portadas', imagenes: 'portadas', portada: 'portadas', plan: 'lanzamiento', lanzamientos: 'lanzamiento', ig: 'instagram', datos: 'cuenta', memoria: 'cuenta', referir: 'referidos', extensiones: 'extension' };
  return TOPICS[aliases[key] || key] || null;
}

export async function helpMessage({ argument = '', isGroup = false, isOwner = false } = {}) {
  if (isGroup) return 'Te ayudo por privado, con todos los comandos: https://t.me/SocialBananaBot?start=help\n\nAquí en el grupo puedes escribirme como a cualquiera y mencionar qué necesitas.';
  if (argument.trim()) return helpTopic(argument) || `No tengo ayuda sobre «${argument.trim().slice(0, 40)}». Prueba con: ${Object.keys(TOPICS).join(', ')}.`;
  const extras = [];
  if (proPromoActive()) extras.push('Promoción: funciones Pro gratis hasta el 6 de noviembre a las 13:30 (hora de Madrid).');
  if (!isOwner && !(await instagramTrialClaimed().catch(() => true))) extras.push('Queda 1 hueco gratis de Instagram durante 3 días: /reclamar');
  return `🍌 Soy Emil, la IA manager de esta comunidad. No hace falta usar comandos: cuéntame qué necesitas.

Empieza por aquí:
• «Hazme una portada para mi single»
• «Saco un tema el 15 de enero de 2027, prepárame el plan»
• «Escríbeme una biografía de artista»
También entiendo fotos, y si me mandas una nota de voz te respondo con otra, con voz generada por IA.

Comandos:
/plan: tu plan de lanzamiento
/hecho 2: marcar una tarea
/recordatorios on o off: avisos por privado
/instagram: conectar tu cuenta
/cuenta: vincular tu cuenta
/miplan: tu plan y tus consultas
/referir: invitar y conseguir meses gratis
/fotos: tus fotos guardadas
/fichas: fichas compartidas, como las de un sello
/mimemoria y /olvidame: tus datos

Más detalle: /help seguido de ${Object.keys(TOPICS).join(', ')}.
Ejemplo: /help portadas${extras.length ? `\n\n${extras.join('\n')}` : ''}${isOwner ? OWNER : ''}`;
}

export const ACCOUNT_TYPE_GUIDE = "📸 Para pasar tu cuenta normal de Instagram a Creator o Business, en la app:\n1. Abre tu perfil y toca Más (☰).\n2. Entra en Configuración y actividad.\n3. Toca Tipo de cuenta y herramientas.\n4. Toca Cambiar a cuenta profesional y sigue los pasos.\n5. Elige una categoría y después Creador o Empresa (Business).\n\nLos nombres pueden variar un poco según la versión. Puedes volver a cambiarla cuando quieras. Para Emil sirven las dos; si dudas entre ambas, para un artista suele encajar Creador.\n\nDespués: /cuenta, /reclamar y /instagram.";

export const MENU_COMMANDS = [
  ['help', 'Qué puedo hacer y cómo'], ['plan', 'Tu plan de lanzamiento'], ['hecho', 'Marcar una tarea: /hecho 2'],
  ['recordatorios', 'Avisos: /recordatorios on u off'], ['instagram', 'Conectar tu Instagram'], ['cuenta', 'Vincular tu cuenta'],
  ['miplan', 'Tu plan y tus consultas'], ['fotos', 'Tus fotos guardadas'], ['fichas', 'Fichas compartidas'], ['referir', 'Invitar y conseguir meses gratis'], ['mimemoria', 'Ver lo que recuerdo de ti'], ['olvidame', 'Borrar lo que recuerdo de ti'],
].map(([command, description]) => ({ command, description }));
