import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature, handleStripeWebhook } from './stripe.js';

test('billing rejects forged, stale and modified webhook payloads before database access', async () => {
  const now = 1900000000000, timestamp = now / 1000;
  const body = '{"type":"checkout.session.completed"}', secret = 'test-signing-secret';
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const header = `t=${timestamp},v1=${digest}`;
  assert.equal(verifyStripeSignature(body, header, secret, now), true);
  assert.equal(verifyStripeSignature(body + ' ', header, secret, now), false);
  assert.equal(verifyStripeSignature(body, header, secret, now + 301000), false);
  assert.equal(verifyStripeSignature(body, header, undefined, now), false);
  assert.equal(verifyStripeSignature(body, `t=${timestamp},v1=abc`, secret, now), false);
  const native = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unverified webhook reached database'); };
  try { await assert.rejects(handleStripeWebhook(body, 'invalid'), /signature/); }
  finally { globalThis.fetch = native; }
});
