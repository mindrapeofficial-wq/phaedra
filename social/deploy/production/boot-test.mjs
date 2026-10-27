#!/usr/bin/env node
/**
 * Disposable Docker acceptance of production authentication and service startup.
 * Never accepts an existing state directory, domain or user credentials.
 * It changes only the test gateway; production lifecycle commands cannot load
 * this overlay. No accounts, messages, SMTP requests or CAPTCHA requests occur.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  command, composeArgs, permanentServices, readState, redact, services, writePrivate,
} from './lib.mjs';
import { prepare } from './prepare.mjs';
import { main as manage } from './manage.mjs';

export async function bootTest() {
  if (process.env.PHAEDRA_PRODUCTION_BOOT_TEST !== '1') {
    throw new Error('Set PHAEDRA_PRODUCTION_BOOT_TEST=1 to run this disposable Docker test explicitly.');
  }
  const temporary = mkdtempSync(join(tmpdir(), 'phaedra-production-boot-'));
  const directory = join(temporary, 'state');
  const settingsFile = join(temporary, 'settings.json');
  const secretsFile = join(temporary, 'secrets.json');
  const domain = 'social.phaedra-fixture.net';
  writePrivate(settingsFile, JSON.stringify({
    schemaVersion: 1, domain, administratorEmail: 'administrator@phaedra-fixture.net',
    smtp: {
      host: 'smtp.phaedra-fixture.net', port: 587, transport: 'starttls',
      fromAddress: 'noreply@phaedra-fixture.net',
    },
    captcha: { enabled: false }, legal: {},
    // Syntax-only fixture: this test does not create a backup.
    backup: { ageRecipient: 'age1' + 'q'.repeat(58) },
  }));
  writePrivate(secretsFile, JSON.stringify({
    smtpUsername: 'isolated-boot-fixture', smtpPassword: 'isolated-smtp-fixture-not-a-credential',
  }));
  let state;
  let runCompose;
  try {
    console.log('Preparing a fresh isolated state with production infrastructure authentication.');
    await prepare({ directory, settingsFile, secretsFile });
    state = readState(directory);
    await manage(['pin-images', '--directory', directory]);
    const marker = JSON.stringify({ kind: 'phaedra-production-boot-test', id: state.manifest.id });
    writePrivate(join(state.upstream, 'Caddyfile.boot-test'), [
      ':80 {',
      '\trespond /__phaedra_production_boot ' + JSON.stringify(marker) + ' 200',
      ...[
        ['/api*', '/api', 'api:14702'],
        ['/ws', '/ws', 'events:14703'],
        ['/autumn*', '/autumn', 'autumn:14704'],
      ].flatMap(([match, prefix, upstream]) => [
        '\troute ' + match + ' {',
        '\t\turi strip_prefix ' + prefix,
        '\t\treverse_proxy http://' + upstream,
        '\t}',
      ]),
      '}',
      '',
    ].join('\n'));
    writePrivate(join(state.upstream, 'compose.boot-test.yml'), [
      'services:',
      '  caddy:',
      '    ports: !override',
      '      - "127.0.0.1:18081:80"',
      '    volumes:',
      '      - "./Caddyfile.boot-test:/etc/caddy/Caddyfile:ro"',
      'networks:',
      '  default:',
      '    internal: true',
      '',
    ].join('\n'));
    runCompose = (args, options = {}) => command('docker',
      composeArgs(state, ['--file', 'compose.boot-test.yml', ...args]),
      { cwd: state.upstream, ...options });
    const effective = JSON.parse(await runCompose(['config', '--format', 'json']));
    assert.equal(effective.networks.default.internal, true, 'Test services must not reach external SMTP or Internet endpoints.');
    const ports = effective.services.caddy.ports;
    assert.equal(ports.length, 1);
    assert.equal(ports[0].host_ip, '127.0.0.1');
    assert.equal(String(ports[0].published), '18081');
    assert.equal(ports[0].target, 80);
    for (const name of services.filter((name) => name !== 'caddy')) {
      assert.equal((effective.services[name].ports || []).length, 0, 'Internal services must not publish host ports.');
    }
    for (const name of ['api', 'events', 'autumn', 'crond', 'pushd']) {
      assert.ok(effective.services[name].volumes.some((volume) => volume.target === '/Revolt.toml' && volume.read_only),
        'The nonroot backend needs a read-only configuration mount.');
    }
    console.log('Starting authenticated services on an internal Docker network; the test gateway binds loopback only.');
    await runCompose(['up', '--detach', '--pull', 'never', ...services], { timeout: 300000 });
    const status = async () => {
      const text = await runCompose(['ps', '--all', '--format', 'json'], { timeout: 15000 });
      return text.startsWith('[') ? JSON.parse(text) : text.split('\n').filter(Boolean).map(JSON.parse);
    };
    const assertAlive = async () => {
      const rows = await status();
      const failed = rows.filter((row) => permanentServices.includes(row.Service) &&
        (['exited', 'dead', 'restarting'].includes(row.State) || row.Health === 'unhealthy'));
      assert.equal(failed.length, 0, 'A production service stopped or failed health during the isolated boot.');
      return rows;
    };
    const request = async (path) => {
      const response = await fetch('http://127.0.0.1:18081' + path, {
        redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('The isolated gateway returned HTTP ' + response.status + '.');
      return response.json();
    };
    let ready = false;
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const rows = await assertAlive();
      try {
        const identity = await request('/__phaedra_production_boot');
        assert.equal(identity.id, state.manifest.id);
        assert.equal(identity.kind, 'phaedra-production-boot-test');
        const info = await request('/api/');
        const files = await request('/autumn/');
        assert.equal(info.features.email, true, 'Email verification must remain enabled.');
        assert.equal(info.features.invite_only, true, 'The production configuration must keep registration closed.');
        assert.equal(info.features.captcha.enabled, false, 'This is the explicit closed-beta fixture.');
        assert.equal(info.ws, 'wss://' + domain + '/ws');
        assert.equal(info.features.autumn.url, 'https://' + domain + '/autumn');
        assert.ok(files.autumn, 'The real Autumn binary must answer.');
        assert.ok(permanentServices.every((name) =>
          rows.some((row) => row.Service === name && row.State === 'running' &&
            (!row.Health || row.Health === 'healthy'))));
        ready = true;
        break;
      } catch { /* The API may still be completing its first migration. */ }
      await new Promise((done) => setTimeout(done, 2000));
    }
    assert.ok(ready, 'The isolated production stack did not become ready.');
    await runCompose(['exec', '-T', 'database', 'mongosh', '--quiet', '--norc', '--file', '/dev/stdin'], {
      input: 'try { db.getSiblingDB("revolt").users.findOne({}); quit(8); } catch(error) { if(error.code!==13) quit(9); }\n',
    });
    const redisUnauthenticated = await runCompose(['exec', '-T', 'redis', 'valkey-cli', 'ping']);
    assert.match(redisUnauthenticated, /NOAUTH/, 'Redis must reject unauthenticated commands.');
    await new Promise((done) => setTimeout(done, 15000));
    const finalStates = await assertAlive();
    assert.ok(permanentServices.every((name) =>
      finalStates.some((row) => row.Service === name && row.State === 'running')),
    'All production workers must remain running after startup.');
    console.log('PASS: real API, WebSocket service, Autumn, crond and pushd remained running with authenticated infrastructure.');
    console.log('PASS: MongoDB and Redis rejected unauthenticated access; no account or email was created.');
  } catch (error) {
    if (state && runCompose) {
      try {
        console.log(redact(state, await runCompose(['ps', '--all'])));
        console.log(redact(state, await runCompose(['logs', '--no-color', '--tail', '100', ...services])));
      } catch { console.error('Redacted diagnostics could not be collected.'); }
    }
    throw error;
  } finally {
    if (runCompose) {
      await runCompose(['down', '--remove-orphans'], { timeout: 180000 });
      console.log('Disposable containers and network removed.');
    }
    try { rmSync(temporary, { recursive: true, force: true }); }
    catch {
      // Some database files belong to container UIDs. CI's disposable runner
      // removes them; never use a broad privileged delete outside this fixture.
      console.log('Protected fixture files await disposable runner cleanup; do not upload this directory.');
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await bootTest(); }
  catch (error) { console.error('Production boot test failed: ' + error.message); process.exitCode = 1; }
}
