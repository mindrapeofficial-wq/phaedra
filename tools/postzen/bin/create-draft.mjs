#!/usr/bin/env node
import { createInstagramDraft } from '../src/postzen.mjs';

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx < 0 ? undefined : process.argv[idx+1];
}

if (process.argv.includes('--help')) {
  console.log('Usage: npm run draft -- --account ACCOUNT_ID --content "Caption" --image-url https://example.com/image.png [--request-id unique-key]');
  process.exit(0);
}

try {
  const result = await createInstagramDraft({
    accountId: getArg('account') || process.env.POSTZEN_INSTAGRAM_ACCOUNT_ID,
    content: getArg('content') || '',
    imageUrl: getArg('image-url'),
    requestId: getArg('request-id')
  });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}