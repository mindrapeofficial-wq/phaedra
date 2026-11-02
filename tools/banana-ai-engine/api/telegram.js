import {waitUntil} from '@vercel/functions';
import {receiveTelegram,wakeTelegramWorker} from '../lib/telegram-ingress.js';

export default async function handler(req,res){
  const result=await receiveTelegram(req);
  if(result.wake)waitUntil(wakeTelegramWorker(result.receipt));
  res.setHeader('Cache-Control','no-store');
  res.status(result.status).send(result.body);
}
