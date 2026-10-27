#!/usr/bin/env node
/**
 * An isolated, loopback-only Stoat deployment using the pinned upstream Compose.
 * No Docker daemon is installed and no public service is provisioned here.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const lock = JSON.parse(readFileSync(join(here, 'stoat.lock.json'), 'utf8'));
const services = ['database', 'redis', 'rabbit', 'minio', 'createbuckets', 'api', 'events', 'autumn', 'caddy', 'web'];
const manifestName = 'phaedra-stoat-local.json';

function usage() {
  console.error('Usage: node social/deploy/local-stoat.mjs prepare|up|down|status --directory PATH [--port 18080]');
  process.exitCode = 1;
}

function parseArgs(args) {
  const [command, ...options] = args;
  if (!['prepare', 'up', 'down', 'status'].includes(command)) return null;
  let directory = join(here, '.state');
  let port = 18080;
  for (let i = 0; i < options.length; i += 2) {
    if (!options[i + 1]) throw new Error(`Missing value for ${options[i]}.`);
    if (options[i] === '--directory') directory = resolve(options[i + 1]);
    else if (options[i] === '--port') {
      if (!/^\d+$/.test(options[i + 1])) throw new Error('The port must be an integer.');
      port = Number(options[i + 1]);
    } else throw new Error(`Unknown argument: ${options[i]}.`);
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port from 1024 to 65535.');
  return { command, directory, port };
}

function run(command, args, { cwd, input, quiet = false, timeout = 240000 } = {}) {
  const result = spawnSync(command, args, {
    cwd, input, encoding: 'utf8', timeout,
    stdio: quiet || input !== undefined ? ['pipe', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0) {
    // The official configurator deals with secrets; never echo its output.
    throw new Error(`${command} failed${result.error?.code ? ` (${result.error.code})` : ` (exit ${result.status})`}.`);
  }
  return result.stdout?.trim() || '';
}

function loadManifest(directory) {
  const file = join(directory, manifestName);
  if (!existsSync(file)) throw new Error('This is not a prepared Phaedra local instance. Run prepare first.');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (manifest.kind !== 'phaedra-stoat-ephemeral' || manifest.revision !== lock.revision ||
      !/^phaedra-stoat-[a-f0-9]{12}$/.test(manifest.project) ||
      !/^[a-f0-9-]{36}$/.test(manifest.id) || !Number.isInteger(manifest.port) ||
      manifest.port < 1024 || manifest.port > 65535) {
    throw new Error('The local instance manifest is invalid or belongs to a different upstream revision.');
  }
  const expected = `http://127.0.0.1:${manifest.port}`;
  if (manifest.baseUrl !== expected || manifest.apiUrl !== `${expected}/api`) {
    throw new Error('The deployment must remain on the loopback interface.');
  }
  return manifest;
}

function compose(directory, manifest, args, options = {}) {
  return run('docker', [
    'compose', '--project-name', manifest.project,
    '--file', 'compose.yml', '--file', 'compose.phaedra.yml', ...args,
  ], { cwd: join(directory, 'upstream'), ...options });
}

function prepare(directory, port) {
  const manifestPath = join(directory, manifestName);
  if (existsSync(manifestPath)) {
    const manifest = loadManifest(directory);
    if (manifest.port !== port) throw new Error('This instance already uses a different port. Use a new directory.');
    console.log(`Existing local instance retained: ${manifest.apiUrl}`);
    return;
  }
  const upstream = join(directory, 'upstream');
  if (existsSync(upstream)) throw new Error('The destination already contains an upstream checkout. Use a new empty directory.');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  mkdirSync(upstream, { mode: 0o700 });
  run('git', ['init', '--quiet'], { cwd: upstream });
  run('git', ['remote', 'add', 'origin', lock.repository], { cwd: upstream });
  run('git', ['fetch', '--quiet', '--depth', '1', 'origin', lock.revision], { cwd: upstream });
  run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: upstream });
  const actual = run('git', ['rev-parse', 'HEAD'], { cwd: upstream, quiet: true });
  if (actual !== lock.revision) throw new Error('The downloaded source did not match the reviewed revision.');

  const host = `127.0.0.1:${port}`;
  // Use the official secret generator. Responses: external proxy, no camera/video.
  // It runs only after verification of the source revision; its output is private.
  run('bash', ['generate_config.sh', host], { cwd: upstream, input: 'y\nn\n', quiet: true });
  for (const name of ['Revolt.toml', '.env.web', 'stoat.json']) {
    const path = join(upstream, name);
    const content = readFileSync(path, 'utf8')
      .replaceAll(`https://${host}`, `http://${host}`)
      .replaceAll(`wss://${host}`, `ws://${host}`);
    writeFileSync(path, content, { mode: 0o600 });
  }
  const configPath = join(upstream, 'Revolt.toml');
  // Remove live media discovery so local clients cannot advertise absent servers.
  const config = readFileSync(configPath, 'utf8')
    .replace(/^\[hosts\.livekit\]\n[\s\S]*?(?=^\[|$(?![\s\S]))/gm, '')
    .replace(/^\[api\.livekit\.nodes\.worldwide\]\n[\s\S]*?(?=^\[|$(?![\s\S]))/gm, '');
  writeFileSync(configPath, `${config}\n# Local integration tests only. Not a public deployment.\n` +
    `[api.registration]\ninvite_only = false\n\n` +
    `[api.smtp]\nhost = ""\n\n` +
    `[api.security.captcha]\nhcaptcha_key = ""\nhcaptcha_sitekey = ""\n\n` +
    `[features.limits.new_user]\nvideo = false\n\n` +
    `[features.limits.default]\nvideo = false\n`, { mode: 0o600 });

  const id = randomUUID();
  const project = `phaedra-stoat-${id.replaceAll('-', '').slice(0, 12)}`;
  const manifest = {
    kind: 'phaedra-stoat-ephemeral', id, project, port,
    revision: lock.revision, backendVersion: lock.backendVersion,
    baseUrl: `http://${host}`, apiUrl: `http://${host}/api`,
  };
  const marker = JSON.stringify({ kind: manifest.kind, id, revision: lock.revision });
  const caddyPath = join(upstream, 'Caddyfile');
  const caddy = readFileSync(caddyPath, 'utf8');
  if (!caddy.startsWith('{$HOSTNAME} {')) throw new Error('Unexpected upstream Caddyfile format.');
  writeFileSync(caddyPath, caddy.replace('{$HOSTNAME} {',
    `{$HOSTNAME} {\n\theader /__phaedra_ephemeral_test Content-Type application/json\n` +
    `\trespond /__phaedra_ephemeral_test ${JSON.stringify(marker)} 200`));
  // Compose v2.24.4+ supports !override. Other services expose no host ports.
  const overrides = ['services:', '  caddy:', '    restart: "no"', '    ports: !override', `      - "127.0.0.1:${port}:80"`];
  for (const service of services) {
    if (service === 'caddy') continue;
    overrides.push(`  ${service}:`, '    restart: "no"');
    if (service === 'autumn') {
      overrides.push('    depends_on:', '      createbuckets:', '        condition: service_completed_successfully');
    }
  }
  writeFileSync(join(upstream, 'compose.phaedra.yml'), overrides.join('\n') + '\n');
  // Only the explicit compose files above are used. Generated override is ignored.
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  console.log(`Prepared isolated Stoat ${lock.backendVersion} at ${manifest.apiUrl}`);
  console.log('Secrets remain in the local state directory. No service has been started.');
}

async function waitReady(manifest) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(manifest.apiUrl + '/', { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        const data = await response.json();
        const marker = await fetch(manifest.baseUrl + '/__phaedra_ephemeral_test', {
          signal: AbortSignal.timeout(4000),
        }).then((value) => value.json());
        const files = await fetch(manifest.baseUrl + '/autumn/', {
          signal: AbortSignal.timeout(4000),
        }).then((value) => value.ok ? value.json() : null);
        if (data.ws && files?.autumn && marker.id === manifest.id && marker.kind === manifest.kind) return;
      }
    } catch { /* A dependency may still be starting. */ }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error('The local API did not become ready in 180 seconds. Check Docker service status.');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!options) usage();
  else if (options.command === 'prepare') prepare(options.directory, options.port);
  else {
    const manifest = loadManifest(options.directory);
    if (options.command === 'up') {
      compose(options.directory, manifest, ['version'], { quiet: true });
      compose(options.directory, manifest, ['config', '--quiet'], { quiet: true });
      compose(options.directory, manifest, ['pull', ...services], { timeout: 600000 });
      compose(options.directory, manifest, ['up', '--detach', ...services], { timeout: 240000 });
      await waitReady(manifest);
      console.log(`Stoat ready: ${manifest.apiUrl}`);
      console.log('This instance is loopback-only. Voice and video services are not started.');
    } else if (options.command === 'down') {
      compose(options.directory, manifest, ['down', '--remove-orphans'], { timeout: 120000 });
      console.log('Local services stopped. Database and local secrets are retained in the state directory.');
    } else compose(options.directory, manifest, ['ps', '--all']);
  }
} catch (error) {
  console.error(`Phaedra local Stoat: ${error.message}`);
  process.exitCode = 1;
}
