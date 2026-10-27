#!/usr/bin/env node
import {
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  command, configurationHashes, lock, makeManifest, manifestFile, newInfrastructureSecrets,
  outsideRepository, permanentServices, privateJson, publicClientConfig,
  readJson, validateSecrets, validateSettings, writePrivate,
} from './lib.mjs';

const json = (value) => JSON.stringify(value, null, 2) + '\n';
const toml = (value) => JSON.stringify(value);

export function productionConfig(settings, secrets, infrastructure) {
  if (settings.captcha.enabled && !secrets.hcaptchaSecret) throw new Error('The enabled CAPTCHA needs its private secret.');
  const base = 'https://' + settings.domain;
  return [
    '# Generated for an independent Phaedra instance. Secrets: keep outside Git.',
    '# production=true is reserved upstream for the official Stoat service identity.',
    'production = false',
    'environment = "phaedra-production"',
    '',
    '[database]',
    'mongodb = ' + toml('mongodb://phaedra_app:' + infrastructure.mongoAppPassword + '@database:27017/revolt?authSource=admin'),
    'redis = ' + toml('redis://:' + infrastructure.redisPassword + '@redis:6379/'),
    '',
    '[hosts]',
    'app = ' + toml(base),
    'api = ' + toml(base + '/api'),
    'events = ' + toml('wss://' + settings.domain + '/ws'),
    'autumn = ' + toml(base + '/autumn'),
    'january = ""',
    'gifbox = ""',
    '',
    '[hosts.livekit]',
    '',
    '[rabbit]',
    'host = "rabbit"',
    'username = "phaedra"',
    'password = ' + toml(infrastructure.rabbitPassword),
    '',
    '[api.registration]',
    'invite_only = true',
    '',
    '[api.smtp]',
    'host = ' + toml(settings.smtp.host),
    'port = ' + settings.smtp.port,
    'username = ' + toml(secrets.smtpUsername),
    'password = ' + toml(secrets.smtpPassword),
    'from_address = ' + toml(settings.smtp.fromAddress),
    ...(settings.smtp.replyTo ? ['reply_to = ' + toml(settings.smtp.replyTo)] : []),
    'use_tls = true',
    'use_starttls = ' + (settings.smtp.transport === 'starttls'),
    '',
    '[api.security]',
    'trust_cloudflare = false',
    '',
    '[api.security.captcha]',
    'hcaptcha_key = ' + toml(settings.captcha.enabled ? secrets.hcaptchaSecret : ''),
    'hcaptcha_sitekey = ' + toml(settings.captcha.siteKey),
    '',
    '[files.s3]',
    'endpoint = "http://minio:9000"',
    'access_key_id = "phaedra-storage"',
    'secret_access_key = ' + toml(infrastructure.s3Password),
    'default_bucket = "revolt-uploads"',
    'path_style_buckets = false',
    '',
    '[files]',
    'blocked_mime_types = ["text/html", "application/javascript", "application/vnd.microsoft.portable-executable", "application/vnd.android.package-archive"]',
    '',
    '[features]',
    'webhooks_enabled = false',
    'mass_mentions_enabled = false',
    'mass_mentions_send_notifications = false',
    '',
    '[features.limits.global]',
    'body_limit_size = ' + (settings.maxUploadBytes + 1048576),
    '',
    '[features.limits.new_user]',
    'video = false',
    '[features.limits.new_user.file_upload_size_limit]',
    'attachments = ' + settings.maxUploadBytes,
    '',
    '[features.limits.default]',
    'video = false',
    '[features.limits.default.file_upload_size_limit]',
    'attachments = ' + settings.maxUploadBytes,
    '',
    '[features.legal_links]',
    'terms_of_service = ' + toml(settings.legal.termsUrl),
    'privacy_policy = ' + toml(settings.legal.privacyUrl),
    'guidelines = ' + toml(settings.legal.guidelinesUrl),
    '',
  ].join('\n');
}

export function productionCompose(infrastructure) {
  const services = {};
  for (const name of permanentServices) {
    services[name] = {
      restart: 'unless-stopped', stop_grace_period: '60s',
      logging: { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } },
    };
  }
  Object.assign(services.database, {
    environment: {
      MONGO_INITDB_ROOT_USERNAME: 'phaedra_admin',
      MONGO_INITDB_ROOT_PASSWORD: infrastructure.mongoRootPassword,
      PHAEDRA_MONGO_APP_PASSWORD: infrastructure.mongoAppPassword,
    },
    volumes: [
      './private/mongo-init.js:/docker-entrypoint-initdb.d/10-phaedra.js:ro',
      './private/mongodump.yml:/run/phaedra/mongodump.yml:ro',
      './private/mongorestore.yml:/run/phaedra/mongorestore.yml:ro',
      './data/configdb:/data/configdb',
    ],
    healthcheck: {
      test: ['CMD', 'mongosh', '--quiet', '--eval',
        'const a=db.getSiblingDB("admin"); if(!a.auth("phaedra_app",process.env.PHAEDRA_MONGO_APP_PASSWORD)) quit(1); if(a.runCommand({ping:1}).ok!==1) quit(2);'],
      interval: '10s', timeout: '10s', retries: 12, start_period: '30s',
    },
  });
  Object.assign(services.redis, {
    command: ['valkey-server', '/etc/valkey/phaedra.conf'],
    volumes: [
      './data/redis:/data',
      './private/redis.conf:/etc/valkey/phaedra.conf:ro',
      './private/redis.password:/run/phaedra/redis.password:ro',
    ],
    healthcheck: {
      test: ['CMD-SHELL', 'REDISCLI_AUTH="$$(cat /run/phaedra/redis.password)" valkey-cli ping | grep -q PONG'],
      interval: '10s', timeout: '5s', retries: 6,
    },
  });
  Object.assign(services.rabbit, {
    hostname: 'phaedra-rabbit',
    environment: {
      RABBITMQ_NODENAME: 'rabbit@phaedra-rabbit',
      RABBITMQ_DEFAULT_USER: 'phaedra',
      RABBITMQ_DEFAULT_PASS: infrastructure.rabbitPassword,
    },
  });
  services.minio.environment = {
    MINIO_ROOT_USER: 'phaedra-storage', MINIO_ROOT_PASSWORD: infrastructure.s3Password,
  };
  services.createbuckets = {
    restart: 'no',
    environment: {
      MINIO_ROOT_USER: 'phaedra-storage', MINIO_ROOT_PASSWORD: infrastructure.s3Password,
    },
    entrypoint: ['/bin/sh', '-ec', [
      'attempt=0',
      'until /usr/bin/mc alias set phaedra http://minio:9000 "$$MINIO_ROOT_USER" "$$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 && /usr/bin/mc ready phaedra >/dev/null 2>&1; do',
      '  attempt=$$((attempt+1)); [ "$$attempt" -lt 120 ] || exit 1; sleep 1',
      'done',
      '/usr/bin/mc mb --ignore-existing phaedra/revolt-uploads >/dev/null',
    ].join('\n')],
  };
  for (const name of ['api', 'events', 'autumn', 'crond', 'pushd']) {
    services[name].volumes = ['./Revolt.toml:/Revolt.toml:ro'];
    services[name].depends_on = {
      database: { condition: 'service_healthy' },
      redis: { condition: 'service_healthy' },
    };
  }
  for (const name of ['autumn', 'crond']) {
    services[name].depends_on.createbuckets = { condition: 'service_completed_successfully' };
  }
  // These upstream services remain available in the pinned source but cannot be
  // started accidentally by an unqualified docker compose up.
  for (const name of ['january', 'gifbox', 'livekit', 'voice-ingress']) {
    services[name] = { profiles: ['not-enabled'] };
  }
  return { services };
}

export function productionCaddy(settings) {
  return [
    '{', '\temail ' + settings.administratorEmail, '}',
    settings.domain + ' {',
    '\tencode zstd gzip',
    '\theader Strict-Transport-Security "max-age=31536000"',
    '\trequest_body {', '\t\tmax_size ' + (settings.maxUploadBytes + 1048576), '\t}',
    '\t@internal path /api/metrics /api/metrics/* /livekit* /ingress* /january* /gifbox*',
    '\trespond @internal 404',
    '\troute /.well-known/stoat {',
    '\t\theader Content-Type application/json',
    '\t\theader Access-Control-Allow-Origin *',
    '\t\trespond ' + JSON.stringify(JSON.stringify({ api: 'https://' + settings.domain + '/api' })) + ' 200',
    '\t}',
    ...[
      ['/api*', '/api', 'api:14702'],
      ['/ws', '/ws', 'events:14703'],
      ['/autumn*', '/autumn', 'autumn:14704'],
    ].flatMap(([match, prefix, target]) => [
      '\troute ' + match + ' {',
      '\t\turi strip_prefix ' + prefix,
      '\t\treverse_proxy http://' + target + ' {',
      '\t\t\theader_down Location "^/" "' + prefix + '/"',
      '\t\t}',
      '\t}',
    ]),
    '\treverse_proxy http://web:5000',
    '}',
    '',
  ].join('\n');
}

export async function prepare({ directory, settingsFile, secretsFile }) {
  directory = outsideRepository(directory);
  const settings = validateSettings(readJson(settingsFile));
  const secrets = validateSecrets(privateJson(secretsFile), { captchaEnabled: settings.captcha.enabled });
  if (existsSync(directory) && readdirSync(directory).length) {
    throw new Error('Use a new empty state directory. Existing keys and data are never overwritten.');
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const upstream = join(directory, 'upstream');
  mkdirSync(upstream, { mode: 0o700 });
  await command('git', ['init', '--quiet'], { cwd: upstream });
  await command('git', ['remote', 'add', 'origin', lock.repository], { cwd: upstream });
  await command('git', ['fetch', '--quiet', '--depth', '1', 'origin', lock.revision], { cwd: upstream });
  await command('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: upstream });
  const actual = await command('git', ['rev-parse', 'HEAD'], { cwd: upstream });
  if (actual !== lock.revision) throw new Error('The source does not match the reviewed upstream revision.');
  // Official generator: direct Caddy HTTPS, no voice/video. Never echo secrets.
  await command('bash', ['generate_config.sh', settings.domain], { cwd: upstream, input: 'n\nn\n' });
  const source = readFileSync(join(upstream, 'secrets.env'), 'utf8');
  writePrivate(join(upstream, 'secrets.env'), source.split(/\r?\n/)
    .filter((line) => !/^\s*(?:export\s+)?REVOLT__API__LIVEKIT__NODES__/i.test(line)).join('\n'));
  rmSync(join(upstream, 'livekit.yml'), { force: true });

  const infrastructure = newInfrastructureSecrets();
  writePrivate(join(directory, 'admin-secrets.json'), json(infrastructure));
  writePrivate(join(directory, 'settings.json'), json(settings));
  writePrivate(join(directory, 'client-config.json'), json(publicClientConfig(settings)));
  writePrivate(join(upstream, 'Revolt.toml'), productionConfig(settings, secrets, infrastructure));
  chmodSync(join(upstream, 'Revolt.toml'), 0o644);
  writePrivate(join(upstream, 'compose.production.json'), json(productionCompose(infrastructure)));
  writePrivate(join(upstream, 'Caddyfile'), productionCaddy(settings));
  writePrivate(join(upstream, '.env.web'), [
    'HOSTNAME=' + settings.domain,
    'VITE_HOST=' + settings.domain,
    'VITE_API_URL=https://' + settings.domain + '/api',
    'VITE_DEV_GIFBOX_URL=',
    '',
  ].join('\n'));
  writePrivate(join(upstream, 'stoat.json'), json({ api: 'https://' + settings.domain + '/api' }));
  const privateDir = join(upstream, 'private');
  mkdirSync(privateDir, { mode: 0o700 });
  writePrivate(join(privateDir, 'mongo-init.js'), [
    '// Create credentials in admin; let Stoat initialize its own revolt database.',
    'db.getSiblingDB("admin").createUser({',
    '  user: "phaedra_app", pwd: process.env.PHAEDRA_MONGO_APP_PASSWORD,',
    '  roles: [{role: "readWrite", db: "revolt"}]',
    '});',
    '',
  ].join('\n'));
  writePrivate(join(privateDir, 'mongodump.yml'), 'password: ' + JSON.stringify(infrastructure.mongoAppPassword) + '\n');
  writePrivate(join(privateDir, 'mongorestore.yml'), 'password: ' + JSON.stringify(infrastructure.mongoRootPassword) + '\n');
  writePrivate(join(privateDir, 'redis.conf'), [
    'bind 0.0.0.0', 'protected-mode yes', 'port 6379',
    'requirepass ' + infrastructure.redisPassword, 'appendonly yes', 'dir /data', '',
  ].join('\n'));
  writePrivate(join(privateDir, 'redis.password'), infrastructure.redisPassword + '\n');
  // These individual bind mounts must be readable by the container's unprivileged
  // UID. Their enclosing host directories remain 700.
  for (const file of ['mongo-init.js', 'redis.conf', 'redis.password']) chmodSync(join(privateDir, file), 0o644);
  for (const name of ['db', 'configdb', 'redis', 'rabbit', 'minio', 'caddy-data', 'caddy-config']) {
    mkdirSync(join(upstream, 'data', name), { recursive: true, mode: 0o700 });
  }
  writePrivate(join(directory, manifestFile), json({
    ...makeManifest(settings), configurationHashes: configurationHashes(directory),
  }));
  console.log('Prepared permanent Stoat ' + lock.backendVersion + ' for https://' + settings.domain + '.');
  console.log('No containers, DNS changes, registrations or email deliveries were performed.');
  console.log('Public client configuration: ' + join(directory, 'client-config.json'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  try {
    for (let i = 0; i < args.length; i += 2) {
      const name = { '--directory': 'directory', '--settings': 'settingsFile', '--secrets': 'secretsFile' }[args[i]];
      if (!name || !args[i + 1]) throw new Error('Usage: prepare.mjs --directory /srv/phaedra-social --settings /private/settings.json --secrets /private/secrets.json');
      options[name] = args[i + 1];
    }
    if (!options.directory || !options.settingsFile || !options.secretsFile) throw new Error('All three arguments are required: --directory, --settings, --secrets.');
    await prepare(options);
  } catch (error) {
    console.error('Phaedra production preparation: ' + error.message);
    process.exitCode = 1;
  }
}
