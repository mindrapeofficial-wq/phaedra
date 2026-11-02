export function webhookRegistration(secret,env=process.env){
  return {
    url:env.TELEGRAM_WEBHOOK_URL||'https://banana-ai-engine.vercel.app/api/telegram',
    secret_token:secret,
    max_connections:4,
    allowed_updates:['message'],
    // Never discard customer messages during a deploy or an ingress migration.
    drop_pending_updates:false,
  };
}
