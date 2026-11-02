import { database } from './database.js';
import { sendMessage } from './telegram.js';
import { memoryRequest } from './memory.js';
const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
const PHAEDRA_ACCOUNT = 'j9728s2139w1qrqdte0fynrjf98hbg4j';
async function alertOwner(reason) {
  const state = await memoryRequest(0, OWNER);
  if (Date.now() - (state.capacityAlertAt || 0) < 3600_000) return;
  await sendMessage(OWNER, reason);
  await memoryRequest(0, OWNER, 'POST', { ...state, capacityAlertAt: Date.now() });
}
export async function prepareInstagramCapacity(userId, { api, connection, notify = alertOwner } = {}) {
  if (Number(userId) === OWNER) return;
  const capacity = Number(process.env.POSTZEN_CLIENT_CAPACITY || 2);
  const slot = await database('rpc/sb_claim_instagram_slot','POST',{p_user:userId,p_capacity:capacity});
  if (!slot) {
    await notify('Hay un cliente pendiente de conectar Instagram. Revisa su pago y amplía la capacidad de PostZen si las dos plazas ya están asignadas. No se ha comprado capacidad ni desconectado ninguna cuenta automáticamente.');
    throw new Error('Tu conexión necesita que revisemos la capacidad disponible. He avisado al administrador; todavía no puedo ofrecerte un enlace de conexión.');
  }
  if (slot !== 2) return;
  const owner = await connection(OWNER);
  if (!owner || owner.status === 'disabled') return;
  if (owner.account_id !== PHAEDRA_ACCOUNT) throw new Error('El administrador debe revisar la cuenta reservada antes de liberar esta plaza.');
  const accounts = (await api('/accounts')).accounts || [];
  if (accounts.some(account => account._id === PHAEDRA_ACCOUNT)) {
    for (const status of ['scheduled','queued','publishing']) {
      const result = await api(`/posts?${new URLSearchParams({ accountId:PHAEDRA_ACCOUNT,profileId:owner.profile_id,status,limit:'1',page:'1' })}`);
      // Missing/unknown shape is not evidence that the account has no scheduled work.
      if (!Array.isArray(result.posts)) throw new Error('No pude comprobar las publicaciones pendientes antes de liberar la plaza.');
      if (result.posts.length) {
        await notify('La segunda plaza está reservada para un cliente de pago, pero Phaedra tiene publicaciones pendientes. Revisa esos trabajos antes de liberar su conexión.');
        throw new Error('Tu plaza está reservada. El administrador debe terminar unos trabajos pendientes antes de activar la conexión.');
      }
    }
    await api(`/accounts/${PHAEDRA_ACCOUNT}`,{method:'DELETE'});
    if (((await api('/accounts')).accounts || []).some(account=>account._id===PHAEDRA_ACCOUNT)) throw new Error('No pude confirmar que la plaza se haya liberado.');
  }
  await connection(OWNER,{...owner,status:'disabled'});
  await notify('He liberado la conexión de Phaedra para la segunda plaza de cliente con suscripción real verificada, según la política acordada. No había publicaciones pendientes.');
}
