import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClient } from '../scripts/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('client bundle contains runtime assets and no deployment state or injected credentials', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'phaedra-social-build-'));
  try {
    const configPath = path.join(temporary, 'config.json');
    await writeFile(configPath, JSON.stringify({ schemaVersion: 1, token: 'fixture-secret', password: 'fixture-password' }));
    await buildClient({ configPath, output: path.join(temporary, 'bundle'), quiet: true });
    const config = JSON.parse(await readFile(path.join(temporary, 'bundle/config.json')));
    assert.equal(config.token, undefined);
    assert.equal(config.password, undefined);
    const files = (await readdir(path.join(temporary, 'bundle'), { recursive: true })).map(String);
    assert.ok(files.some((file) => file.replaceAll('\\', '/') === 'src/stoat-client.js'));
    assert.ok(files.includes('LICENSE.txt'));
    assert.ok(!files.some((file) => /deploy|tests|secrets|node_modules/.test(file)));
    const html = await readFile(path.join(temporary, 'bundle/index.html'), 'utf8');
    assert.ok(html.includes('Content-Security-Policy'));
    assert.ok(html.includes('src="./src/app.js"'));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('CI public community variables configure the real bundle without copying other environment values', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'phaedra-social-public-config-'));
  try {
    const output = path.join(temporary, 'bundle');
    await buildClient({ output, quiet: true, environment: { PUBLIC_PHAEDRA_SOCIAL_API_URL: '' } });
    assert.equal(JSON.parse(await readFile(path.join(output, 'config.json'))).apiUrl, '');
    await buildClient({ output, quiet: true, environment: {
      PUBLIC_PHAEDRA_SOCIAL_API_URL: ' https://social.phaedra.test/api/ ',
      PUBLIC_PHAEDRA_SOCIAL_REGISTRATION_URL: 'https://social.phaedra.test/',
      PUBLIC_PHAEDRA_SOCIAL_ALLOWED_SERVICE_ORIGINS: '["wss://events.phaedra.test", "https://files.phaedra.test"]',
      SMTP_PASSWORD: 'fixture-private-smtp-password',
      GITHUB_TOKEN: 'fixture-private-github-token',
    } });
    const serialized = await readFile(path.join(output, 'config.json'), 'utf8');
    const config = JSON.parse(serialized);
    assert.equal(config.apiUrl, 'https://social.phaedra.test/api');
    assert.equal(config.registrationUrl, 'https://social.phaedra.test');
    assert.deepEqual(config.allowedServiceOrigins, ['https://events.phaedra.test', 'https://files.phaedra.test']);
    assert.ok(!serialized.includes('fixture-private'));
    assert.ok(!serialized.includes('SMTP_PASSWORD'));
    assert.ok(!serialized.includes('GITHUB_TOKEN'));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('invalid public CI settings fail before replacing a previously built client', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'phaedra-social-invalid-config-'));
  try {
    const output = path.join(temporary, 'bundle');
    await buildClient({ output, quiet: true });
    const before = await readFile(path.join(output, 'config.json'), 'utf8');
    const invalid = [
      { PUBLIC_PHAEDRA_SOCIAL_API_URL: 'https://user:fixture-password@social.phaedra.test/api' },
      { PUBLIC_PHAEDRA_SOCIAL_API_URL: 'https://social.phaedra.test/api?token=fixture-token' },
      { PUBLIC_PHAEDRA_SOCIAL_API_URL: 'http://social.phaedra.test/api' },
      { PUBLIC_PHAEDRA_SOCIAL_REGISTRATION_URL: 'javascript:alert(1)' },
      { PUBLIC_PHAEDRA_SOCIAL_ALLOWED_SERVICE_ORIGINS: 'fixture-invalid-json-secret' },
      { PUBLIC_PHAEDRA_SOCIAL_ALLOWED_SERVICE_ORIGINS: '{"token":"fixture-token"}' },
      { PUBLIC_PHAEDRA_SOCIAL_ALLOWED_SERVICE_ORIGINS: '["https://files.phaedra.test/private"]' },
    ];
    for (const environment of invalid) {
      await assert.rejects(buildClient({ output, quiet: true, environment }), (error) => {
        assert.ok(!String(error).includes('fixture-'));
        return true;
      });
      assert.equal(await readFile(path.join(output, 'config.json'), 'utf8'), before);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('an explicit configuration file takes precedence over public CI defaults', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'phaedra-social-explicit-config-'));
  try {
    const configPath = path.join(temporary, 'community.json');
    const output = path.join(temporary, 'bundle');
    await writeFile(configPath, JSON.stringify({ schemaVersion: 1, apiUrl: 'https://chosen.phaedra.test/api' }));
    await buildClient({ configPath, output, quiet: true, environment: {
      PUBLIC_PHAEDRA_SOCIAL_API_URL: 'https://different.phaedra.test/api',
      PUBLIC_PHAEDRA_SOCIAL_ALLOWED_SERVICE_ORIGINS: 'unused-invalid-json',
    } });
    const config = JSON.parse(await readFile(path.join(output, 'config.json')));
    assert.equal(config.apiUrl, 'https://chosen.phaedra.test/api');
    assert.deepEqual(config.allowedServiceOrigins, []);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
