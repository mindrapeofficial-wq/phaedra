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
  command, composeArgs, permanentServices, readJson, readState, redact, services, writePrivate,
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
    const caddyImage = readJson(join(state.directory, 'images.lock.json')).services.caddy.image;
    console.log('Validating the original production HTTPS Caddyfile with networking disabled.');
    await command('docker', [
      'run', '--rm', '--network', 'none',
      '--mount', 'type=bind,source=' + join(state.upstream, 'Caddyfile') + ',target=/etc/caddy/Caddyfile,readonly',
      caddyImage, 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile',
    ]);
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
      '    ports: !override []',
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
    for (const name of services) {
      assert.equal((effective.services[name].ports || []).length, 0, 'Test services must not publish host ports.');
      assert.deepEqual(Object.keys(effective.services[name].networks), ['default'],
        'Every test service must remain exclusively on the isolated network.');
    }
    for (const name of ['api', 'events', 'autumn', 'crond', 'pushd']) {
      assert.ok(effective.services[name].volumes.some((volume) => volume.target === '/Revolt.toml' && volume.read_only),
        'The nonroot backend needs a read-only configuration mount.');
    }
    console.log('Starting authenticated services on an internal Docker network with no published ports.');
    await runCompose(['up', '--detach', '--pull', 'never', ...services], { timeout: 300000 });
    // Docker does not publish host ports for containers attached only to an
    // internal network. The official Alpine Caddy image provides BusyBox wget,
    // so probe its loopback directly without giving any service external egress.
    await runCompose(['exec', '-T', 'caddy', 'wget', '--help'], { timeout: 10000 });
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
      const response = await runCompose([
        'exec', '-T', 'caddy', 'wget', '-qO-', '-T', '5', 'http://127.0.0.1' + path,
      ], { timeout: 10000 });
      return JSON.parse(response);
    };
    let ready = false;
    let lastReadinessFailure = 'No successful gateway response yet.';
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const rows = await assertAlive();
      let stage = 'gateway identity';
      try {
        const identity = await request('/__phaedra_production_boot');
        assert.equal(identity.id, state.manifest.id);
        assert.equal(identity.kind, 'phaedra-production-boot-test');
        stage = 'API discovery';
        const info = await request('/api/');
        stage = 'Autumn root';
        const files = await request('/autumn/');
        stage = 'registration policy';
        assert.equal(info.features.email, true, 'Email verification must remain enabled.');
        assert.equal(info.features.invite_only, true, 'The production configuration must keep registration closed.');
        assert.equal(info.features.captcha.enabled, false, 'This is the explicit closed-beta fixture.');
        stage = 'discovered service URLs';
        assert.equal(info.ws, 'wss://' + domain + '/ws');
        assert.equal(info.features.autumn.url, 'https://' + domain + '/autumn');
        stage = 'Autumn response';
        assert.ok(files.autumn, 'The real Autumn binary must answer.');
        stage = 'container readiness';
        assert.ok(permanentServices.every((name) =>
          rows.some((row) => row.Service === name && row.State === 'running' &&
            (!row.Health || row.Health === 'healthy'))));
        ready = true;
        break;
      } catch (error) {
        // Keep the stage and a controlled reason, never serialize an HTTP body.
        const reason = error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0].slice(0, 160) :
          'HTTP request inside Caddy or JSON parsing failed.';
        lastReadinessFailure = stage + ': ' + reason;
      }
      await new Promise((done) => setTimeout(done, 2000));
    }
    assert.ok(ready, 'The isolated production stack did not become ready. Last check: ' + lastReadinessFailure);
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
