import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(here, '../../..');
export const lock = JSON.parse(readFileSync(join(here, '../stoat.lock.json'), 'utf8'));
export const services = [
  'database', 'redis', 'rabbit', 'minio', 'createbuckets',
  'api', 'events', 'autumn', 'crond', 'pushd', 'web', 'caddy',
];
export const permanentServices = services.filter((name) => name !== 'createbuckets');
export const manifestFile = 'phaedra-stoat-production.json';
export const configurationFiles = [
  'settings.json', 'admin-secrets.json', 'client-config.json',
  'upstream/compose.yml', 'upstream/compose.production.json',
  'upstream/Revolt.toml', 'upstream/secrets.env', 'upstream/.env.web',
  'upstream/Caddyfile', 'upstream/stoat.json',
  'upstream/private/mongo-init.js', 'upstream/private/mongodump.yml',
  'upstream/private/mongorestore.yml', 'upstream/private/redis.conf',
  'upstream/private/redis.password',
];
const fqdn = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const placeholder = /REPLACE|CHANGE_ME|YOUR_|EXAMPLE_SECRET/i;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function field(value, name, { minimum = 1, maximum = 4096 } = {}) {
  check(typeof value === 'string' && value.length >= minimum && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value) && !placeholder.test(value), 'Invalid or missing ' + name + '.');
  return value;
}

function publicHost(value, name) {
  field(value, name, { maximum: 253 });
  check(fqdn.test(value) && !/(?:^|\.)(?:localhost|local|invalid|test|example|example\.(?:com|net|org))$/.test(value),
    name + ' must be a real public DNS hostname without a scheme, path or port.');
  return value;
}

function email(value, name) {
  field(value, name, { maximum: 254 });
  const match = value.match(/^[^\s<>@]+@([^@]+)$/);
  check(match, 'Invalid ' + name + '.');
  publicHost(match[1], name + ' domain');
  return value;
}

function https(value, name) {
  field(value, name, { maximum: 2048 });
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid ' + name + '.'); }
  check(url.protocol === 'https:' && !url.username && !url.password && !url.hash,
    name + ' must be an HTTPS URL without credentials or a fragment.');
  publicHost(url.hostname, name + ' hostname');
  return url.href;
}

export function validateSettings(input) {
  check(input?.schemaVersion === 1, 'Settings schemaVersion must be 1.');
  const domain = publicHost(input.domain, 'domain');
  const smtp = input.smtp || {};
  const legal = input.legal || {};
  const captcha = input.captcha || {};
  const maxUploadBytes = input.maxUploadBytes ?? 20000000;
  check(Number.isSafeInteger(maxUploadBytes) && maxUploadBytes >= 1000000 && maxUploadBytes <= 20000000,
    'maxUploadBytes must be between 1000000 and 20000000.');
  check(Number.isInteger(smtp.port) && smtp.port > 0 && smtp.port <= 65535, 'Invalid SMTP port.');
  check(['tls', 'starttls'].includes(smtp.transport), 'SMTP transport must require tls or starttls.');
  check(smtp.use_tls !== false && smtp.useTls !== false, 'Disabling SMTP TLS is not supported.');
  const captchaEnabled = captcha.enabled ?? false;
  check(typeof captchaEnabled === 'boolean', 'captcha.enabled must be true or false.');
  const siteKey = captchaEnabled ? field(captcha.siteKey, 'hCaptcha siteKey', { minimum: 20, maximum: 200 }) : '';
  if (captchaEnabled) check(!/^[123]0000000-ffff-ffff-ffff-00000000000[1-3]$/.test(siteKey),
    'An enabled production CAPTCHA cannot use test keys.');
  const recipient = field(input.backup?.ageRecipient, 'backup.ageRecipient', { maximum: 100 });
  check(/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(recipient),
    'Use an age X25519 public recipient, never a private identity.');
  return {
    schemaVersion: 1, domain,
    administratorEmail: email(input.administratorEmail, 'administratorEmail'),
    maxUploadBytes,
    smtp: {
      host: publicHost(smtp.host, 'smtp.host'), port: smtp.port, transport: smtp.transport,
      fromAddress: email(smtp.fromAddress, 'smtp.fromAddress'),
      ...(smtp.replyTo ? { replyTo: email(smtp.replyTo, 'smtp.replyTo') } : {}),
    },
    captcha: { enabled: captchaEnabled, siteKey },
    legal: {
      termsUrl: legal.termsUrl ? https(legal.termsUrl, 'legal.termsUrl') : '',
      privacyUrl: legal.privacyUrl ? https(legal.privacyUrl, 'legal.privacyUrl') : '',
      guidelinesUrl: legal.guidelinesUrl ? https(legal.guidelinesUrl, 'legal.guidelinesUrl') : '',
    },
    backup: { ageRecipient: recipient },
  };
}

export function validateSecrets(input, { captchaEnabled = false } = {}) {
  return {
    smtpUsername: field(input?.smtpUsername, 'smtpUsername'),
    smtpPassword: field(input?.smtpPassword, 'smtpPassword', { minimum: 8 }),
    hcaptchaSecret: captchaEnabled ? field(input?.hcaptchaSecret, 'hcaptchaSecret', { minimum: 20 }) : '',
  };
}

export function publicClientConfig(settings) {
  return {
    schemaVersion: 1, appName: 'Phaedra Social',
    apiUrl: 'https://' + settings.domain + '/api',
    registrationUrl: 'https://' + settings.domain + '/',
    allowedServiceOrigins: [], maxUploadBytes: settings.maxUploadBytes,
  };
}

export function outsideRepository(path) {
  const absolute = resolve(path);
  let existing = absolute;
  while (!existsSync(existing)) {
    check(dirname(existing) !== existing, 'Cannot resolve the private storage path.');
    existing = dirname(existing);
  }
  const canonical = resolve(realpathSync(existing), relative(existing, absolute));
  const rel = relative(realpathSync(repositoryRoot), canonical);
  check(rel !== '' && (rel === '..' || rel.startsWith('../') || isAbsolute(rel)),
    'State, private settings, invitations and backups must remain outside the Git repository.');
  return canonical;
}

export function privateJson(path) {
  const absolute = outsideRepository(path);
  const stat = lstatSync(absolute);
  check(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077),
    'The secrets file must be a regular file with owner-only permissions (chmod 600).');
  return readJson(absolute);
}

export function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { throw new Error('A required JSON file is missing or invalid; its contents were withheld.'); }
}

export function configurationHashes(directory) {
  return Object.fromEntries(configurationFiles.map((file) => [
    file, createHash('sha256').update(readFileSync(join(directory, file))).digest('hex'),
  ]));
}

export function writePrivate(path, content, { exclusive = false } = {}) {
  writeFileSync(path, content, { mode: 0o600, flag: exclusive ? 'wx' : 'w' });
  chmodSync(path, 0o600);
}

export function makeManifest(settings) {
  const id = randomUUID();
  return {
    kind: 'phaedra-stoat-permanent', schemaVersion: 1, id,
    project: 'phaedra-prod-' + id.replaceAll('-', '').slice(0, 12),
    revision: lock.revision, backendVersion: lock.backendVersion,
    domain: settings.domain, preparedAt: new Date().toISOString(),
    apiUrl: 'https://' + settings.domain + '/api',
  };
}

export function readState(directory) {
  directory = outsideRepository(directory);
  const stat = lstatSync(directory);
  check(stat.isDirectory() && !(stat.mode & 0o077), 'The state directory must have permissions 700.');
  const manifest = readJson(join(directory, manifestFile));
  check(manifest.kind === 'phaedra-stoat-permanent' && manifest.schemaVersion === 1 &&
    manifest.revision === lock.revision && /^phaedra-prod-[a-f0-9]{12}$/.test(manifest.project),
  'Not a permanent deployment prepared with the reviewed revision.');
  const settings = validateSettings(readJson(join(directory, 'settings.json')));
  check(settings.domain === manifest.domain && manifest.apiUrl === 'https://' + settings.domain + '/api',
    'The prepared domain and manifest differ.');
  const hashes = configurationHashes(directory);
  check(configurationFiles.every((file) => manifest.configurationHashes?.[file] === hashes[file]),
    'Prepared configuration changed. Restore the prepared files or review a migration that preserves existing data and encryption keys.');
  return { directory, upstream: join(directory, 'upstream'), manifest, settings };
}

export async function withOperation(state, operation) {
  const path = join(state.directory, '.operation-lock');
  try { mkdirSync(path, { mode: 0o700 }); }
  catch { throw new Error('Another operation is active, or a previous operation left .operation-lock. Inspect before removing it.'); }
  writePrivate(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  try { return await operation(); }
  finally { rmSync(path, { recursive: true, force: true }); }
}

export function command(binary, args, {
  cwd, input, stdinFile, stdoutFile, timeout = 120000, signal, showOutput = false,
} = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(binary, args, {
      cwd, signal, stdio: [stdinFile ?? 'pipe', stdoutFile ?? 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderrSize = 0;
    let oversized = false;
    let killTimer;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 15000);
    }, timeout);
    child.stdout?.on('data', (chunk) => {
      if (showOutput) process.stdout.write(chunk);
      else if (stdout.length + chunk.length <= 8 * 1024 * 1024) stdout += chunk.toString();
      else { oversized = true; child.kill('SIGTERM'); }
    });
    // Error output can contain config values. Capture no text, and report only
    // the executable and exit code. Use the dedicated redacted diagnosis below.
    child.stderr.on('data', (chunk) => { stderrSize += chunk.length; });
    child.stdin?.on('error', () => {});
    child.on('error', () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(new Error(binary + ' could not execute; check installation, permissions and cancellation.'));
    });
    child.on('close', (code, terminated) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (code !== 0 || oversized) reject(new Error(binary + ' failed (' +
        (oversized ? 'output limit' : terminated || 'exit ' + code) + ').' +
        (stderrSize ? ' Raw error output was withheld to protect secrets.' : '')));
      else resolveCommand(stdout.trim());
    });
    child.stdin?.end(input);
  });
}

export function composeArgs(state, args, { pinned = true } = {}) {
  const files = ['compose.yml', 'compose.production.json'];
  if (pinned) {
    check(existsSync(join(state.upstream, 'compose.images.json')), 'Run pin-images before starting this deployment.');
    files.push('compose.images.json');
  }
  return ['compose', '--project-name', state.manifest.project,
    ...files.flatMap((file) => ['--file', file]), ...args];
}

export function compose(state, args, options = {}) {
  return command('docker', composeArgs(state, args, options), { cwd: state.upstream, ...options });
}

export async function inspectServices(state) {
  const result = await compose(state, ['ps', '--all', '--format', 'json'], { timeout: 15000 });
  if (!result) return [];
  return result.startsWith('[') ? JSON.parse(result) : result.split('\n').filter(Boolean).map(JSON.parse);
}

export async function assertCompose(state, { pinned = true } = {}) {
  const config = JSON.parse(await compose(state, ['config', '--format', 'json'], { pinned }));
  for (const name of services) {
    const service = config.services?.[name];
    check(service, 'The reviewed Compose is missing ' + name + '.');
    const ports = service.ports || [];
    if (name === 'caddy') {
      check(ports.length === 2 && ports.every((port) =>
        ['80', '443'].includes(String(port.published)) &&
        String(port.target) === String(port.published) && (port.protocol || 'tcp') === 'tcp'),
      'The public gateway may publish only TCP 80 and 443.');
    } else check(ports.length === 0, 'An internal service unexpectedly publishes a host port: ' + name + '.');
    if (pinned) check(/@sha256:[a-f0-9]{64}$/.test(service.image), 'Every started image must be pinned by digest.');
  }
  check(config.services.database.environment.MONGO_INITDB_ROOT_PASSWORD &&
    config.services.rabbit.environment.RABBITMQ_DEFAULT_PASS !== 'rabbitpass' &&
    config.services.minio.environment.MINIO_ROOT_PASSWORD !== 'minioautumn',
  'Default infrastructure credentials must not be used.');
  return config;
}

export function redact(state, text) {
  const values = new Set();
  const collect = (value) => {
    if (typeof value === 'string' && value.length) {
      values.add(value); values.add(JSON.stringify(value).slice(1, -1)); values.add(encodeURIComponent(value));
    } else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(readJson(join(state.directory, 'admin-secrets.json')));
  collect(readJson(join(state.upstream, 'compose.production.json')));
  const config = readFileSync(join(state.upstream, 'Revolt.toml'), 'utf8');
  for (const match of config.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    try { collect(JSON.parse(match[0])); } catch { /* Fail closed on known generated strings. */ }
  }
  for (const line of readFileSync(join(state.upstream, 'secrets.env'), 'utf8').split('\n')) {
    const match = line.match(/^[A-Z_][A-Z0-9_]*=(.*)$/);
    if (match) { collect(match[1]); collect(match[1].replace(/^['"]|['"]$/g, '')); }
  }
  let result = text;
  for (const value of [...values].sort((a, b) => b.length - a.length)) result = result.replaceAll(value, '[REDACTED]');
  return result.replace(/(["']?(?:password|token|secret)["']?\s*[:=]\s*)"(?:[^"\\]|\\.)*"/gi, '$1"[REDACTED]"')
    .replace(/((?:authorization|x-session-token|x-bot-token)\s*[:=]\s*)[^\s,;}]+/gi, '$1[REDACTED]');
}

export function newInfrastructureSecrets() {
  return {
    mongoRootPassword: randomBytes(32).toString('hex'),
    mongoAppPassword: randomBytes(32).toString('hex'),
    rabbitPassword: randomBytes(32).toString('hex'),
    s3Password: randomBytes(32).toString('hex'),
    redisPassword: randomBytes(32).toString('hex'),
  };
}
