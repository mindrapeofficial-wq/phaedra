import { getUser } from './tiers.js';
import { database } from './database.js';
import { sendMessage } from './telegram.js';

const TEMPLATE = [
  [-28, 'Cerrar la mezcla y el máster final'],
  [-25, 'Tener la portada definitiva'],
  [-21, 'Subir el lanzamiento a tu distribuidora'],
  [-18, 'Escribir tu biografía y la nota de lanzamiento'],
  [-14, 'Enviar la canción a playlists y blogs'],
  [-10, 'Preparar 3 contenidos cortos con el mejor momento de la canción'],
  [-7, 'Publicar el primer adelanto'],
  [-3, 'Publicar la cuenta atrás y el enlace de preguardado, si tu distribuidora lo ofrece'],
  [0, 'Publicar el lanzamiento y contestar a quienes comenten'],
  [7, 'Revisar resultados y decidir el siguiente paso'],
];
const REMIND_AGAIN_MS = 2 * 86400_000;
let timer, running = false;

export function madridDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return parts;
}
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}
function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
export function buildReleaseTasks(releaseDate, today = madridDate()) {
  return TEMPLATE.map(([offset, title], position) => {
    const planned = addDays(releaseDate, offset);
    return { position, title, due_date: planned < today ? today : planned };
  });
}
export function formatDate(date) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export async function createReleasePlan(userId, title, releaseDate, today = madridDate()) {
  const cleanTitle = String(title || '').trim().slice(0, 120);
  if (!cleanTitle) return { error: 'Falta el título del lanzamiento.' };
  if (!validDate(releaseDate)) return { error: 'La fecha debe ser válida, con formato AAAA-MM-DD.' };
  if (releaseDate <= today) return { error: 'La fecha de lanzamiento debe ser futura.' };
  if (releaseDate > addDays(today, 366)) return { error: 'La fecha debe estar dentro del próximo año.' };
  await getUser(userId);
  await database(`sb_release_plans?telegram_id=eq.${Number(userId)}&status=eq.active`, 'PATCH', { status: 'archived' }, 'return=minimal');
  const [plan] = await database('sb_release_plans', 'POST', { telegram_id: userId, title: cleanTitle, release_date: releaseDate });
  await database('sb_release_tasks', 'POST', buildReleaseTasks(releaseDate, today).map(task => ({ ...task, plan_id: plan.id, telegram_id: userId })), 'return=minimal');
  return { created: true, summary: await releasePlanSummary(userId) };
}

async function activePlan(userId) {
  const [plan] = await database(`sb_release_plans?telegram_id=eq.${Number(userId)}&status=eq.active&select=*`);
  if (!plan) return null;
  const tasks = await database(`sb_release_tasks?plan_id=eq.${plan.id}&select=*&order=due_date.asc,position.asc`);
  return { plan, tasks };
}

export async function releasePlanSummary(userId) {
  const active = await activePlan(userId);
  if (!active) return 'Aún no tienes un plan. Dime el título y la fecha de tu lanzamiento y te lo preparo.';
  const lines = active.tasks.map((task, index) => `${index + 1}. ${task.done_at ? '✅' : '⬜'} ${formatDate(task.due_date)}: ${task.title}`);
  return `Plan de «${active.plan.title}», lanzamiento el ${formatDate(active.plan.release_date)}:\n\n${lines.join('\n')}\n\nMarca una tarea con /hecho y su número.\nRecordatorios por privado: ${active.plan.reminders_enabled ? 'activados' : 'desactivados'}. Cámbialos con /recordatorios on o /recordatorios off.`;
}

export async function completeReleaseTask(userId, number) {
  const active = await activePlan(userId);
  if (!active) return 'Aún no tienes un plan activo.';
  const task = active.tasks[Number(number) - 1];
  if (!task) return `Ese número no existe. Tu plan tiene ${active.tasks.length} tareas.`;
  await database(`sb_release_tasks?id=eq.${task.id}&telegram_id=eq.${Number(userId)}`, 'PATCH', { done_at: new Date().toISOString() }, 'return=minimal');
  const next = active.tasks.find(other => !other.done_at && other.id !== task.id);
  return next ? `Hecho: ${task.title}.\n\nLo siguiente: ${next.title} (${formatDate(next.due_date)}).` : `Hecho: ${task.title}.\n\nHas completado todo el plan.`;
}

export async function setReleaseReminders(userId, enabled) {
  const updated = await database(`sb_release_plans?telegram_id=eq.${Number(userId)}&status=eq.active`, 'PATCH', { reminders_enabled: enabled });
  if (!updated?.length) return 'Aún no tienes un plan activo.';
  return enabled ? 'Recordatorios activados.' : 'Recordatorios desactivados. Tu plan sigue guardado.';
}

export function reminderHour(now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
  return hour >= 10 && hour < 21;
}
export function tasksToRemind(tasks, today, now = Date.now()) {
  return tasks.filter(task => !task.done_at && task.due_date <= today && (!task.reminded_at || now - Date.parse(task.reminded_at) >= REMIND_AGAIN_MS));
}

export async function runReminderTick(now = Date.now()) {
  if (running || !reminderHour(now)) return;
  running = true;
  try {
    const today = madridDate(now);
    const rows = await database(`sb_release_tasks?done_at=is.null&due_date=lte.${today}&select=id,telegram_id,title,due_date,done_at,reminded_at,sb_release_plans!inner(title,status,reminders_enabled)&sb_release_plans.status=eq.active&sb_release_plans.reminders_enabled=is.true&order=due_date.asc,position.asc&limit=500`);
    const byUser = new Map();
    for (const task of tasksToRemind(rows || [], today, now)) byUser.set(task.telegram_id, [...(byUser.get(task.telegram_id) || []), task]);
    for (const [userId, tasks] of byUser) {
      const list = tasks.slice(0, 3).map(task => `• ${task.title} (${formatDate(task.due_date)})`).join('\n');
      const more = tasks.length > 3 ? `\n…y ${tasks.length - 3} más. Míralas con /plan.` : '';
      try {
        await sendMessage(userId, `Toca avanzar con «${tasks[0].sb_release_plans.title}»:\n\n${list}${more}\n\nCuéntame cómo va o márcala con /hecho. Puedes parar estos avisos con /recordatorios off.`);
        await database(`sb_release_tasks?id=in.(${tasks.map(task => Number(task.id)).join(',')})`, 'PATCH', { reminded_at: new Date(now).toISOString() }, 'return=minimal');
      } catch { console.error('[release] reminder not delivered'); }
    }
  } catch (error) { console.error('[release] reminder tick failed', error.name); }
  finally { running = false; }
}
export function startReminderLoop() {
  if (!timer) timer = setInterval(runReminderTick, 10 * 60_000);
}
export function stopReminderLoop() { clearInterval(timer); timer = null; }
