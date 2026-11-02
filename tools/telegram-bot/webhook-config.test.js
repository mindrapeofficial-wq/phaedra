import test from 'node:test';
import assert from 'node:assert/strict';
import {webhookRegistration} from './webhook-config.js';
test('deploys retain pending Telegram updates and keep durable ingress registered',()=>{
  const registration=webhookRegistration('synthetic-secret',{});
  assert.equal(registration.url,'https://banana-ai-engine.vercel.app/api/telegram');
  assert.equal(registration.secret_token,'synthetic-secret');
  assert.equal(registration.drop_pending_updates,false);
  assert.equal(registration.max_connections,4);
  assert.deepEqual(registration.allowed_updates,['message']);
  assert.equal(webhookRegistration('secret',{TELEGRAM_WEBHOOK_URL:'https://example.test/webhook'}).url,'https://example.test/webhook');
});
