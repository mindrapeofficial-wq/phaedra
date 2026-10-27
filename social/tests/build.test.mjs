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
