/* Banana AI 0.25 · Authenticated, read-only editorial inference gateway.
 * Vercel project: banana-ai-engine. No Instagram mutations or token forwarding to the model.
 */
const SUPABASE_URL='https://mfylkalarzuhivhmvzbm.supabase.co';
const MODEL='gpt-4.1';
const GATEWAY_URL='https://api.openai.com/v1/chat/completions';
const ALLOWED_SKILLS=new Set(['ig-reel','ig-viral','ig-caption','ig-carousel','ig-story','ig-profile','ig-plan','ig-human','ig-comment','ig-reply','ig-dm','ig-repurpose','ig-audit','ig-publish']);
const APP_ORIGIN='https://banana.phaedra.com.es';
const USERNAME=/^[a-zA-Z0-9._]{1,30}$/;
const SYSTEM_PROMPT=`Eres Banana AI, asistente editorial de Instagram para marcas y músicos. Responde en español salvo petición explícita de otro idioma. Escribe textos útiles, específicos y revisables. No inventes métricas, testimonios, investigaciones, publicaciones ni datos de una cuenta. Si el usuario aporta datos incompletos, marca las lagunas. No realices acciones en Instagram ni anuncies publicaciones, seguimientos o mensajes como ejecutados. Trabaja solo con el material que la persona proporcione. No solicites contraseñas ni tokens. Nunca conviertas una petición de generación en envío masivo de mensajes o interacciones. Evita texto promocional spam. Todas las publicaciones y respuestas quedan pendientes de aprobación humana.`;
const isOriginAllowed=origin=>origin===''||origin===APP_ORIGIN||/^chrome-extension:\/\/[a-p]{32}$/.test(origin||'');
function makeReply(body,status=200,origin=''){
  return {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(isOriginAllowed(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST, GET, OPTIONS'}:{})},body};
}
function err(code,message,status,origin){return makeReply({ok:false,code,message},status,origin);}
function publicKey(env){return env.SUPABASE_PUBLISHABLE_KEY||'';}
function validBody(body){
  return body&&typeof body==='object'&&!Array.isArray(body)&&
    ALLOWED_SKILLS.has(body.skill)&&typeof body.account==='string'&&USERNAME.test(body.account)&&
    typeof body.prompt==='string'&&body.prompt.length>=20&&body.prompt.length<=11000;
}
export async function processGenerate(request,{env=process.env,fetchImpl=fetch}={}){
  const origin=String(request.headers?.origin||request.headers?.Origin||'');
  if(request.method==='OPTIONS')return isOriginAllowed(origin)?makeReply({ok:true},204,origin):err('origin_denied','Origen no permitido.',403,origin);
  if(!isOriginAllowed(origin))return err('origin_denied','Origen no permitido.',403,origin);
  if(request.method==='GET')return makeReply({ok:true,service:'Banana AI',version:'0.25.1',model:MODEL,providerReady:Boolean(env.OPENAI_API_KEY),generationRequiresLogin:true,publishingEnabled:false},200,origin);
  if(request.method!=='POST')return err('method','Método no admitido.',405,origin);
  const header=String(request.headers?.authorization||request.headers?.Authorization||'');
  const bearer=header.match(/^Bearer ([A-Za-z0-9_.-]{50,10000})$/);
  if(!bearer)return err('unauthorized','Inicia sesión en Social Banana.',401,origin);
  let body=request.body;
  if(typeof body==='string'){if(body.length>15000)return err('bad_input','El encargo es demasiado largo.',413,origin);try{body=JSON.parse(body);}catch{return err('bad_input','El encargo no es JSON válido.',400,origin);}}
  if(!validBody(body))return err('bad_input','Selecciona una herramienta, cuenta y encargo válido (máx. 11000 caracteres).',400,origin);
  if(JSON.stringify(body).length>15500)return err('bad_input','El encargo es demasiado largo.',413,origin);
  const pk=publicKey(env);
  if(!pk)return err('misconfigured','Servidor sin configuración de autenticación.',503,origin);
  const authHeaders={apikey:pk,Authorization:'Bearer '+bearer[1]};
  let user;
  try{
    const identity=await fetchImpl(SUPABASE_URL+'/auth/v1/user',{headers:authHeaders,signal:AbortSignal.timeout(10000)});
    if(!identity.ok)return err('unauthorized','Tu sesión ya no es válida. Vuelve a iniciar sesión.',401,origin);
    user=await identity.json();
    if(!user?.id||!user?.email_confirmed_at||user?.is_anonymous)return err('unauthorized','Confirma tu cuenta de Social Banana.',401,origin);
    const statusResp=await fetchImpl(SUPABASE_URL+'/functions/v1/banana-billing',{method:'POST',headers:{...authHeaders,Origin:APP_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({action:'status'}),signal:AbortSignal.timeout(15000)});
    if(!statusResp.ok)return err('access_unavailable','No se ha podido comprobar tu suscripción.',503,origin);
    const member=await statusResp.json();
    const validUntil=Date.parse(member.active?member.paidUntil:member.trialEndsAt);
    if(!(member.active||member.trialActive)||!Number.isFinite(validUntil)||validUntil<=Date.now())return err('subscription_required','No tienes un periodo de acceso válido.',403,origin);
  }catch{
    return err('access_unavailable','No se ha podido comprobar tu acceso.',503,origin);
  }
  const gatewayToken=env.OPENAI_API_KEY;
  if(!gatewayToken)return err('model_unavailable','El proveedor de IA aún no está configurado.',503,origin);
  // Server-enforced, atomic quota: callers cannot alter quotas from the browser.
  let usage;
  try{
    const quota=await fetchImpl(SUPABASE_URL+'/rest/v1/rpc/sb_ai_take_quota',{method:'POST',headers:{...authHeaders,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
    if(!quota.ok)throw Error('quota_db');
    usage=await quota.json();
    if(!usage||typeof usage!=='object'||typeof usage.allowed!=='boolean')throw Error('quota_shape');
    if(!usage.allowed)return err('quota','Se ha alcanzado el límite de 20 generaciones por día (UTC).',429,origin);
  }catch{return err('quota_unavailable','No se ha podido comprobar el límite diario.',503,origin);}
  try{
    const response=await fetchImpl(GATEWAY_URL,{method:'POST',headers:{Authorization:'Bearer '+gatewayToken,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:body.prompt}],stream:false,max_tokens:1400,temperature:0.65}),signal:AbortSignal.timeout(45000)});
    if(!response.ok){console.error('banana_ai_gateway_failed',response.status);return err('model_error',response.status===402?'No hay crédito disponible en el proveedor de IA.':'El proveedor de IA no ha podido responder ('+response.status+').',502,origin);}
    const result=await response.json();
    const content=result?.choices?.[0]?.message?.content;
    const text=typeof content==='string'?content:Array.isArray(content)?content.filter(p=>p?.type==='text').map(p=>p.text).join('\n'):'';
    if(!text.trim())return err('empty_model_response','La IA no devolvió texto. Prueba otra vez.',502,origin);
    return makeReply({ok:true,text:text.slice(0,15000),model:MODEL,quota:{used:usage.used,remaining:usage.remaining,limit:20},reviewRequired:true,published:false},200,origin);
  }catch{ return err('model_unavailable','La generación no respondió a tiempo. Comprueba tu conexión y prueba de nuevo.',503,origin); }
}
export default async function handler(req,res){
  const output=await processGenerate({method:req.method,headers:req.headers,body:req.body});
  for(const [key,value] of Object.entries(output.headers))res.setHeader(key,value);
  res.status(output.status).json(output.body);
}
