import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, mkdtempSync, mkdirSync, openSync,
  readFileSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  command, configurationFiles, configurationHashes, lock, makeManifest, manifestFile,
  newInfrastructureSecrets, outsideRepository, privateJson, publicClientConfig,
  readState, redact, repositoryRoot, validateSecrets, validateSettings, writePrivate,
} from './lib.mjs';
import { productionCaddy, productionCompose, productionConfig } from './prepare.mjs';
import { verify, verifyImageLock } from './manage.mjs';

// Synthetic data only. No DNS, SMTP, hCaptcha or Docker request is made here.
const fixture = {
  schemaVersion: 1, domain: 'social.phaedra-fixture.net',
  administratorEmail: 'admin@phaedra-fixture.net', maxUploadBytes: 12000000,
  smtp: {
    host: 'smtp.phaedra-fixture.net', port: 587, transport: 'starttls',
    fromAddress: 'noreply@phaedra-fixture.net',
  },
  captcha: { enabled: true, siteKey: 'b58c7ef1-4ac0-49ec-a7b2-39340f11799a' },
  legal: {
    termsUrl: 'https://social.phaedra-fixture.net/terms',
    privacyUrl: 'https://social.phaedra-fixture.net/privacy',
    guidelinesUrl: 'https://social.phaedra-fixture.net/guidelines',
  },
  backup: { ageRecipient: 'age1' + 'q'.repeat(58) },
};
const fakeSecrets = {
  smtpUsername: 'fixture-user', smtpPassword: 'synthetic$"\\password123',
  hcaptchaSecret: 'synthetic-captcha-secret-for-tests',
};

function temporary(t) {
  const path = mkdtempSync(join(tmpdir(), 'phaedra-production-test-'));
  chmodSync(path, 0o700);
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function fixtureState(t) {
  const directory = temporary(t);
  const settings = validateSettings(structuredClone(fixture));
  for (const file of configurationFiles) {
    const path = join(directory, file);
    mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
    writePrivate(path, '{}\n');
  }
  writePrivate(join(directory, 'settings.json'), JSON.stringify(settings));
  const manifest = { ...makeManifest(settings), configurationHashes: configurationHashes(directory) };
  writePrivate(join(directory, manifestFile), JSON.stringify(manifest));
  return readState(directory);
}

test('public export contains only the client contract and HTTPS endpoints', () => {
  const settings = validateSettings({ ...structuredClone(fixture), accidentalSecret: fakeSecrets.smtpPassword });
  const config = publicClientConfig(settings);
  assert.deepEqual(Object.keys(config).sort(), [
    'allowedServiceOrigins', 'apiUrl', 'appName', 'maxUploadBytes', 'registrationUrl', 'schemaVersion',
  ].sort());
  assert.equal(config.apiUrl, 'https://' + fixture.domain + '/api');
  assert.equal(config.registrationUrl, 'https://' + fixture.domain + '/');
  assert.deepEqual(config.allowedServiceOrigins, []);
  assert.equal(config.maxUploadBytes, fixture.maxUploadBytes);
  assert.ok(!JSON.stringify(config).includes(fakeSecrets.smtpPassword));
});

test('public preparation refuses placeholder, loopback and reserved domains', () => {
  for (const domain of ['social.example.org', 'localhost', '127.0.0.1', 'social.test', 'social.invalid',
    'https://social.phaedra-fixture.net', 'social.phaedra-fixture.net:443', 'bad\nhost.net']) {
    assert.throws(() => validateSettings({ ...structuredClone(fixture), domain }));
  }
});

test('SMTP transport must remain encrypted and CAPTCHA must use a production key', () => {
  const insecure = structuredClone(fixture);
  insecure.smtp.transport = 'plain';
  assert.throws(() => validateSettings(insecure), /SMTP/);
  insecure.smtp.transport = 'starttls';
  insecure.smtp.use_tls = false;
  assert.throws(() => validateSettings(insecure), /TLS/);
  const testCaptcha = structuredClone(fixture);
  testCaptcha.captcha.siteKey = '10000000-ffff-ffff-ffff-000000000001';
  assert.throws(() => validateSettings(testCaptcha), /test keys/);
  assert.throws(() => validateSecrets({ ...fakeSecrets, smtpPassword: 'secret\nvalue' }), /smtpPassword/);
});

test('closed beta can explicitly omit CAPTCHA and legal links without disabling email', () => {
  const input = structuredClone(fixture);
  input.captcha = { enabled: false };
  input.legal = {};
  const settings = validateSettings(input);
  const secrets = validateSecrets({ smtpUsername: 'fixture', smtpPassword: 'synthetic-password' });
  const config = productionConfig(settings, secrets, newInfrastructureSecrets());
  assert.match(config, /invite_only = true/);
  assert.match(config, /host = "smtp.phaedra-fixture.net"/);
  assert.match(config, /hcaptcha_key = ""/);
  assert.equal(settings.legal.privacyUrl, '');
});

test('generated TOML retains invitations, email, CAPTCHA and explicit safe transport', () => {
  const infrastructure = newInfrastructureSecrets();
  const text = productionConfig(validateSettings(fixture), validateSecrets(fakeSecrets, { captchaEnabled: true }), infrastructure);
  assert.match(text, /production = false/);
  assert.match(text, /\[api.registration\]\ninvite_only = true/);
  assert.match(text, /use_tls = true\nuse_starttls = true/);
  const smtpBlock = text.split('[api.smtp]')[1].split('\n[')[0];
  const password = smtpBlock.match(/^password = (.+)$/m)[1];
  assert.equal(JSON.parse(password), fakeSecrets.smtpPassword);
  assert.match(text, /authSource=admin/);
  assert.match(text, /attachments = 12000000/);
  assert.match(text, /body_limit_size = 13048576/);
  assert.ok(!text.includes('rabbitpass'));
  assert.ok(!text.includes('minioautumn'));
});

test('production overlay preserves state and stops S3 bootstrap on failure', () => {
  const overlay = productionCompose(newInfrastructureSecrets());
  assert.equal(overlay.services.rabbit.hostname, 'phaedra-rabbit');
  assert.equal(overlay.services.rabbit.environment.RABBITMQ_NODENAME, 'rabbit@phaedra-rabbit');
  assert.ok(overlay.services.redis.volumes.includes('./data/redis:/data'));
  assert.match(overlay.services.createbuckets.entrypoint[2], /until .*mc alias set.*&& .*mc ready/);
  assert.match(overlay.services.createbuckets.entrypoint[2], /120.*exit 1/);
  assert.ok(overlay.services.createbuckets.entrypoint[2].includes('$$MINIO_ROOT_PASSWORD'));
  for (const service of ['api', 'events', 'autumn', 'crond', 'pushd']) {
    assert.deepEqual(overlay.services[service].volumes, ['./Revolt.toml:/Revolt.toml:ro']);
  }
  assert.deepEqual(overlay.services.livekit.profiles, ['not-enabled']);
});

test('gateway retains Caddy HTTPS and does not expose internal or voice services', () => {
  const config = productionCaddy(validateSettings(fixture));
  assert.ok(config.includes(fixture.domain + ' {'));
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /respond @internal 404/);
  assert.match(config, /reverse_proxy http:\/\/events:14703/);
  assert.ok(!config.includes('auto_https off'));
  assert.ok(!config.includes('basic_auth'));
  for (const value of Object.values(fakeSecrets)) assert.ok(!config.includes(value));
});

test('private files tighten existing permissions and malformed JSON never echoes secrets', (t) => {
  const directory = temporary(t);
  const path = join(directory, 'secret.json');
  writeFileSync(path, 'old', { mode: 0o644 });
  writePrivate(path, '{"secret":"' + fakeSecrets.hcaptchaSecret);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.throws(() => privateJson(path), (error) =>
    error.message.includes('contents were withheld') && !error.message.includes(fakeSecrets.hcaptchaSecret));
});

test('private data cannot be placed in Git, including through a symlink', (t) => {
  assert.throws(() => outsideRepository(join(repositoryRoot, 'social/private.json')), /outside the Git/);
  const directory = temporary(t);
  symlinkSync(repositoryRoot, join(directory, 'repo'), 'dir');
  assert.throws(() => outsideRepository(join(directory, 'repo/private.json')), /outside the Git/);
});

test('permanent state refuses the ephemeral marker and modified configuration', (t) => {
  const state = fixtureState(t);
  const manifest = JSON.parse(readFileSync(join(state.directory, manifestFile), 'utf8'));
  assert.equal(manifest.revision, lock.revision);
  manifest.kind = 'phaedra-stoat-ephemeral';
  writePrivate(join(state.directory, manifestFile), JSON.stringify(manifest));
  assert.throws(() => readState(state.directory), /Not a permanent deployment/);
  manifest.kind = 'phaedra-stoat-permanent';
  writePrivate(join(state.directory, manifestFile), JSON.stringify(manifest));
  writePrivate(join(state.upstream, 'Revolt.toml'), 'invite_only = false\n');
  assert.throws(() => readState(state.directory), /configuration changed/);
});

test('image pin changes are detected before lifecycle operations', (t) => {
  const state = fixtureState(t);
  const content = '{"services":{}}\n';
  writePrivate(join(state.upstream, 'compose.images.json'), content);
  writePrivate(join(state.directory, 'images.lock.json'), JSON.stringify({
    revision: state.manifest.revision,
    composeSha256: createHash('sha256').update(content).digest('hex'),
  }));
  assert.doesNotThrow(() => verifyImageLock(state));
  writePrivate(join(state.upstream, 'compose.images.json'), content + '\n');
  assert.throws(() => verifyImageLock(state), /image selection/);
});

test('command errors suppress secret-bearing child output', async () => {
  const secret = 'private-synthetic-error-content';
  await assert.rejects(command(process.execPath, ['-e', 'process.stderr.write(' + JSON.stringify(secret) + ');process.exit(9)']),
    (error) => error.message.includes('exit 9') && !error.message.includes(secret));
});

test('diagnostics redact all credential variants without erasing public status text', (t) => {
  const state = fixtureState(t);
  const infrastructure = newInfrastructureSecrets();
  const encryptionKey = 'synthetic-file-key-with+/=symbols';
  writePrivate(join(state.directory, 'admin-secrets.json'), JSON.stringify(infrastructure));
  writePrivate(join(state.upstream, 'compose.production.json'), JSON.stringify(productionCompose(infrastructure)));
  writePrivate(join(state.upstream, 'Revolt.toml'), productionConfig(state.settings, fakeSecrets, infrastructure));
  writePrivate(join(state.upstream, 'secrets.env'), "REVOLT__FILES__ENCRYPTION_KEY='" + encryptionKey + "'\n");
  const values = [...Object.values(infrastructure), ...Object.values(fakeSecrets), encryptionKey];
  const variants = values.flatMap((value) => [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)]);
  const publicStatus = 'database: 3 checks, not ready; restart=no; container running';
  const output = redact(state, publicStatus + '\n' + variants.join('\n'));
  assert.equal(output.split('\n')[0], publicStatus);
  for (const value of variants) assert.ok(!output.includes(value), 'A credential variant was not redacted.');
});

test('native dump transport preserves binary bytes through file descriptors', async (t) => {
  const directory = temporary(t);
  const source = Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 256));
  const input = join(directory, 'input');
  const output = join(directory, 'output');
  writeFileSync(input, source);
  const inputFd = openSync(input, 'r');
  const outputFd = openSync(output, 'wx', 0o600);
  try {
    await command(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      stdinFile: inputFd, stdoutFile: outputFd,
    });
  } finally { closeSync(inputFd); closeSync(outputFd); }
  assert.deepEqual(readFileSync(output), source);
});

test('public verification is read-only and rejects registration without safeguards', async (t) => {
  const state = fixtureState(t);
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const info = {
    stoat: lock.backendVersion.slice(1),
    ws: 'wss://' + fixture.domain + '/ws',
    features: {
      email: true, invite_only: true,
      captcha: { enabled: true, key: fixture.captcha.siteKey },
      autumn: { enabled: true, url: 'https://' + fixture.domain + '/autumn' },
      livekit: { enabled: false },
    },
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, state.manifest.apiUrl + '/');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined);
    return { ok: true, json: async () => info };
  };
  await verify(state);
  info.features.email = false;
  await assert.rejects(verify(state), /does not match/);
});
