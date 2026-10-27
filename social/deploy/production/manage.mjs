#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCompose, command, compose, inspectServices, outsideRepository,
  permanentServices, privateJson, readJson, readState, redact, services,
  withOperation, writePrivate,
} from './lib.mjs';

export async function verify(state) {
  const response = await fetch(state.manifest.apiUrl + '/', {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('The public HTTPS API returned HTTP ' + response.status + '.');
  let info;
  try { info = await response.json(); } catch { throw new Error('The public API did not return its configuration.'); }
  const features = info.features || {};
  const expectedBase = 'https://' + state.settings.domain;
  if (!features.email || !features.invite_only || Boolean(features.captcha?.enabled) !== state.settings.captcha.enabled ||
      features.captcha.key !== state.settings.captcha.siteKey ||
      !features.autumn?.enabled || features.autumn.url !== expectedBase + '/autumn' ||
      info.ws !== 'wss://' + state.settings.domain + '/ws' ||
      features.livekit?.enabled ||
      ![info.stoat, info.revolt].includes(state.manifest.backendVersion.replace(/^v/, ''))) {
    throw new Error('Public discovery does not match the reviewed permanent configuration.');
  }
  return info;
}

export async function waitHealthy(state, names = permanentServices, { checkHttps = true } = {}) {
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const rows = await inspectServices(state);
    const selected = rows.filter((row) => names.includes(row.Service));
    if (selected.some((row) => ['exited', 'dead'].includes(row.State) || row.Health === 'unhealthy')) {
      throw new Error('A required service stopped or is unhealthy. Run diagnose for redacted logs.');
    }
    if (names.every((name) => selected.some((row) => row.Service === name && row.State === 'running' &&
      (!row.Health || row.Health === 'healthy')))) {
      if (!checkHttps) return;
      try { await verify(state); return; } catch { /* DNS, ACME or backend startup may still be settling. */ }
    }
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error('Readiness timed out. Check DNS, TCP 80/443, the host kernel and redacted diagnostics.');
}

export async function mongoAdmin(state, javascript) {
  const secrets = privateJson(join(state.directory, 'admin-secrets.json'));
  const input = [
    'const admin = db.getSiblingDB("admin");',
    'if (!admin.auth("phaedra_admin",' + JSON.stringify(secrets.mongoRootPassword) + ')) quit(10);',
    'try {\n' + javascript + '\n} catch { quit(20); }',
    '',
  ].join('\n');
  return compose(state, ['exec', '-T', 'database', 'mongosh', '--quiet', '--norc', '--file', '/dev/stdin'], { input, timeout: 30000 });
}

function normalizeRepository(image) {
  let repository = image.split('@')[0].replace(/:[^/:]+$/, '').replace(/^docker\.io\//, '');
  if (!repository.includes('/')) repository = 'library/' + repository;
  return repository;
}

async function pinImages(state) {
  const path = join(state.upstream, 'compose.images.json');
  if (existsSync(path)) throw new Error('Images are already pinned. Upgrades require a reviewed backup and migration plan.');
  const config = await assertCompose(state, { pinned: false });
  await compose(state, ['pull', ...services], { pinned: false, timeout: 600000 });
  const pinned = {};
  for (const name of services) {
    const image = config.services[name].image;
    let metadata;
    try { metadata = JSON.parse(await command('docker', ['image', 'inspect', image])); }
    catch { throw new Error('Could not inspect a downloaded service image.'); }
    const digest = metadata[0]?.RepoDigests?.find((value) =>
      normalizeRepository(value) === normalizeRepository(image) && /@sha256:[a-f0-9]{64}$/.test(value));
    if (!digest) throw new Error('The downloaded image lacks a verified repository digest: ' + name + '.');
    pinned[name] = { image: digest };
  }
  const serialized = JSON.stringify({ services: pinned }, null, 2) + '\n';
  writePrivate(path, serialized, { exclusive: true });
  writePrivate(join(state.directory, 'images.lock.json'), JSON.stringify({
    revision: state.manifest.revision, resolvedAt: new Date().toISOString(),
    composeSha256: createHash('sha256').update(serialized).digest('hex'), services: pinned,
  }, null, 2) + '\n', { exclusive: true });
  await assertCompose(state);
  console.log('Pinned every selected service by repository digest. No containers were started.');
}

export function verifyImageLock(state) {
  const pinned = readJson(join(state.directory, 'images.lock.json'));
  const content = readFileSync(join(state.upstream, 'compose.images.json'));
  if (pinned.revision !== state.manifest.revision ||
      pinned.composeSha256 !== createHash('sha256').update(content).digest('hex')) {
    throw new Error('The immutable image selection no longer matches images.lock.json.');
  }
}

async function createInvite(state, output) {
  await verify(state);
  const path = outsideRepository(output);
  const code = randomBytes(32).toString('hex');
  const invitation = {
    kind: 'phaedra-stoat-invitation', project: state.manifest.project, code,
    registrationUrl: 'https://' + state.settings.domain + '/',
    createdAt: new Date().toISOString(),
    note: 'Stoat v0.15.5 does not enforce one use. Revoke explicitly after the controlled registration window.',
  };
  writePrivate(path, JSON.stringify(invitation, null, 2) + '\n', { exclusive: true });
  try {
    await mongoAdmin(state, [
      'const application = db.getSiblingDB("revolt");',
      'if (!application.migrations.findOne({})) quit(11);',
      'application.account_invites.insertOne({_id:' + JSON.stringify(code) + ', used:false});',
    ].join('\n'));
  } catch {
    // A response can be lost after Mongo commits. Retain the code for revocation.
    try { writePrivate(path, JSON.stringify({ ...invitation, creationOutcome: 'uncertain' }, null, 2) + '\n'); } catch {}
    throw new Error('Invitation creation outcome is uncertain. Its private file was retained; revoke it before retrying.');
  }
  console.log('Invitation saved privately to ' + path + '. Revoke it after registration.');
}

async function revokeInvite(state, path) {
  const invitation = privateJson(path);
  if (invitation.kind !== 'phaedra-stoat-invitation' || invitation.project !== state.manifest.project ||
      !/^[a-f0-9]{64}$/.test(invitation.code)) throw new Error('Not an invitation for this prepared instance.');
  await mongoAdmin(state,
    'db.getSiblingDB("revolt").account_invites.deleteOne({_id:' + JSON.stringify(invitation.code) + '});');
  writePrivate(outsideRepository(path), JSON.stringify({
    ...invitation, revokedAt: new Date().toISOString(),
  }, null, 2) + '\n');
  console.log('The invitation is revoked. Registrations already in flight are not cancelled.');
}

async function promoteAdministrator(state, userId) {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(userId)) throw new Error('Use the exact existing user ID (ULID).');
  await verify(state);
  await mongoAdmin(state, [
    'const application = db.getSiblingDB("revolt");',
    'const id = ' + JSON.stringify(userId) + ';',
    'const account = application.accounts.findOne({_id:id});',
    'const user = application.users.findOne({_id:id});',
    'if (!account || account.verification?.status !== "Verified" || !user || user.bot) quit(12);',
    'application.users.updateOne({_id:id}, {$set:{privileged:true}});',
  ].join('\n'));
  console.log('The verified existing account was promoted to instance administrator.');
}

async function restoreDatabase(state, archive) {
  const databaseDirectory = join(state.upstream, 'data/db');
  if (existsSync(databaseDirectory) && readdirSync(databaseDirectory).length) {
    throw new Error('Restore requires an empty MongoDB data directory on a separate recovery instance.');
  }
  const rows = await inspectServices(state);
  if (rows.some((row) => !['exited', 'created'].includes(row.State))) throw new Error('Stop all services before recovery.');
  const path = outsideRepository(archive);
  const fd = openSync(path, 'r');
  try {
    await compose(state, ['up', '--detach', '--pull', 'never', 'database']);
    await waitHealthy(state, ['database'], { checkHttps: false });
    await mongoAdmin(state, 'if(db.getSiblingDB("revolt").getCollectionNames().length) quit(13);');
    await compose(state, [
      'exec', '-T', 'database', 'mongorestore',
      '--config=/run/phaedra/mongorestore.yml',
      '--host=127.0.0.1', '--username=phaedra_admin', '--authenticationDatabase=admin',
      '--archive', '--gzip', '--nsInclude=revolt.*',
    ], { stdinFile: fd, timeout: 3600000 });
    await mongoAdmin(state, [
      'const application=db.getSiblingDB("revolt");',
      'const names=application.getCollectionNames();',
      'if(!application.migrations.findOne({}) || !["accounts","users","channels","messages","attachments"].every(name=>names.includes(name))) quit(15);',
    ].join('\n'));
  } finally { closeSync(fd); }
  console.log('Logical database restored. Application services remain stopped for recovery review.');
}

export async function main(args) {
  const [action, ...rest] = args;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--directory', '--out', '--invite-file', '--user-id', '--archive'].includes(rest[i]) ||
        !rest[i + 1] || options[rest[i]]) throw new Error('Unknown, repeated or incomplete argument.');
    options[rest[i]] = rest[i + 1];
  }
  if (!options['--directory']) throw new Error('Specify --directory /srv/phaedra-social.');
  const state = readState(options['--directory']);
  const required = {
    'invite-create': '--out', 'invite-revoke': '--invite-file',
    'promote-admin': '--user-id', 'restore-database': '--archive',
  };
  if (required[action] && !options[required[action]]) throw new Error('This operation requires ' + required[action] + '.');
  if (action === 'pin-images') return withOperation(state, () => pinImages(state));
  if (action === 'validate') {
    const pinned = existsSync(join(state.upstream, 'compose.images.json'));
    if (pinned) verifyImageLock(state);
    await assertCompose(state, { pinned });
    console.log('Private configuration and Docker Compose validate. SMTP, CAPTCHA and delivery still require live acceptance.');
    return;
  }
  verifyImageLock(state);
  if (action === 'status') {
    console.log(redact(state, await compose(state, ['ps', '--all'])));
    return;
  }
  if (action === 'diagnose') {
    console.log(redact(state, await compose(state, ['ps', '--all'])));
    console.log(redact(state, await compose(state, ['logs', '--no-color', '--tail', '80', ...services], { timeout: 30000 })));
    return;
  }
  if (action === 'verify') {
    await verify(state);
    console.log('HTTPS discovery matches the configured version, SMTP, invitation policy, CAPTCHA, WebSocket and file service.');
    return;
  }
  return withOperation(state, async () => {
    if (action === 'up') {
      await assertCompose(state);
      await compose(state, ['up', '--detach', '--pull', 'never', ...services], { timeout: 300000 });
      await waitHealthy(state);
      console.log('Permanent Stoat is ready at ' + state.manifest.apiUrl + '. Registration requires an invitation and email verification.');
    } else if (action === 'stop') {
      await compose(state, ['stop', '--timeout', '60', ...services], { timeout: 180000 });
      console.log('Services stopped. Persistent data and encryption keys remain in the state directory.');
    } else if (action === 'invite-create') await createInvite(state, options['--out']);
    else if (action === 'invite-revoke') await revokeInvite(state, options['--invite-file']);
    else if (action === 'promote-admin') await promoteAdministrator(state, options['--user-id']);
    else if (action === 'unlock-database') {
      await mongoAdmin(state, 'admin.fsyncUnlock();');
      console.log('One MongoDB write lock was released. Inspect state before starting services.');
    } else if (action === 'restore-database') {
      await assertCompose(state);
      await restoreDatabase(state, options['--archive']);
    } else throw new Error('Commands: validate, pin-images, up, stop, status, diagnose, verify, invite-create, invite-revoke, promote-admin, unlock-database, restore-database.');
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error('Phaedra permanent Stoat: ' + error.message); process.exitCode = 1; }
}
