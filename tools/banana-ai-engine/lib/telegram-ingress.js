import {createHash,timingSafeEqual} from 'node:crypto';
const STORE='https://mfylkalarzuhivhmvzbm.supabase.co';
const WORKER='https://social-banana-bot.onrender.com/health';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function receiveTelegram(request,{env=process.env,fetchImpl=fetch}={}){
  if(request.method!=='POST')return{status:405,body:'method not allowed'};
  if(!env.TELEGRAM_BOT_TOKEN||!env.SUPABASE_SERVICE_KEY)return{status:503,body:'not configured'};
  const secret=env.TELEGRAM_WEBHOOK_SECRET||createHash('sha256').update(`social-banana-webhook:${env.TELEGRAM_BOT_TOKEN}`).digest('hex');
  const received=Buffer.from(String(request.headers?.['x-telegram-bot-api-secret-token']||'')),expected=Buffer.from(secret);
  if(received.length!==expected.length||!timingSafeEqual(received,expected))return{status:401,body:'unauthorized'};
  let update=request.body;
  try{
    if(typeof update==='string'){if(Buffer.byteLength(update)>1000000)return{status:413,body:'too large'};update=JSON.parse(update);}
    if(!update||!Number.isSafeInteger(update.update_id))return{status:400,body:'invalid update'};
    if(Buffer.byteLength(JSON.stringify(update))>1000000)return{status:413,body:'too large'};
  }catch{return{status:400,body:'invalid update'};}
  const message=update.message;
  if(!message?.chat?.id||message.from?.is_bot)return{status:200,body:'ignored'};
  try{
    const response=await fetchImpl(STORE+'/rest/v1/sb_bot_jobs?on_conflict=update_id&select=update_id',{
      method:'POST',signal:AbortSignal.timeout(8000),headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({update_id:update.update_id,chat_id:message.chat.id,telegram_id:message.from?.id||0,payload:update}),
    });
    if(!response.ok)return{status:503,body:'retry later'};
    const rows=await response.json();
    if(!Array.isArray(rows))return{status:503,body:'retry later'};
    // Acknowledge Telegram only after persistence. Duplicate deliveries never create
    // another receipt/job, but may still wake the worker after an earlier failed wake.
    return{status:200,body:'ok',wake:true,receipt:rows.length?{...message,updateId:update.update_id}:null};
  }catch{return{status:503,body:'retry later'};}
}

export async function wakeTelegramWorker(message,{env=process.env,fetchImpl=fetch,noticeDelay=3000,retryDelay=4000,maxAttempts=3}={}){
  let receipt=Promise.resolve(),notified=false;
  function notify(text){
    if(notified)return;notified=true;
    receipt=fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
      method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:message.chat.id,text,reply_parameters:{message_id:message.message_id,allow_sending_without_reply:true}}),
    }).then(r=>{if(!r.ok)console.error('[telegram-ingress] receipt unavailable');}).catch(()=>console.error('[telegram-ingress] receipt unavailable'));
  }
  const timer=message?setTimeout(()=>notify('Te he leído. El servicio está tardando en despertar; tu mensaje ya está guardado. Suele tardar alrededor de un minuto en retomar el trabajo.'),noticeDelay):null;
  const queued=message&&Number.isSafeInteger(message.updateId)?(async()=>{
    try{
      const response=await fetchImpl(STORE+`/rest/v1/sb_bot_jobs?update_id=lt.${message.updateId}&status=in.(pending,processing)&select=telegram_id&limit=2`,{headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_KEY},signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;
      const waiting=await response.json();
      if(!((message.photo?.length||String(message.document?.mime_type||'').startsWith('image/'))&&!message.caption)&&Array.isArray(waiting)&&(waiting.length>=2||waiting.some(job=>job.telegram_id===message.from?.id)))notify('Tengo tu mensaje. Estoy terminando un encargo anterior; después sigo con este.');
    }catch{/* The durable job remains available even if this optional notice fails. */}
  })():Promise.resolve();
  try{
    for(let attempt=0;attempt<maxAttempts;attempt++){
      try{
        const response=await fetchImpl(WORKER,{signal:AbortSignal.timeout(25000),cache:'no-store'});
        if(response.ok){const health=await response.json();if(health.status==='ok')return true;}
      }catch{/* No provider bodies or credential-bearing URLs in logs. */}
      if(attempt+1<maxAttempts)await pause(retryDelay);
    }
    console.error('[telegram-ingress] worker wake incomplete; durable jobs retained');
    return false;
  }finally{clearTimeout(timer);await queued;await receipt;}
}
