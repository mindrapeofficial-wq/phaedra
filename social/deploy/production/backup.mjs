#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  assertCompose, command, compose, inspectServices, outsideRepository,
  permanentServices, readState, withOperation,
} from './lib.mjs';
import { mongoAdmin, verifyImageLock, waitHealthy } from './manage.mjs';

function completion(child, label) {
  child.stderr?.resume();
  return new Promise((resolveChild, reject) => {
    child.on('error', () => reject(new Error(label + ' could not execute.')));
    child.on('close', (code) => code === 0 ? resolveChild() : reject(new Error(label + ' failed; raw output withheld.')));
  });
}

async function encryptArchive(state, staging, outputFd, signal) {
  const tar = spawn('tar', [
    '--create', '--gzip', '--file=-',
    '--exclude=./.operation-lock', '--exclude=./upstream/data/db',
    '--exclude=./upstream/data/configdb', '--exclude=./recovery',
    '--directory', state.directory, '.',
    '--directory', staging, 'recovery',
  ], { signal, stdio: ['ignore', 'pipe', 'pipe'] });
  const age = spawn('age', ['--encrypt', '--recipient', state.settings.backup.ageRecipient], {
    signal, stdio: ['pipe', outputFd, 'pipe'],
  });
  const work = [
    completion(tar, 'Archive creation'), completion(age, 'age encryption'),
    pipeline(tar.stdout, age.stdin, { signal }),
  ];
  try { await Promise.all(work); }
  catch (error) {
    tar.kill('SIGTERM'); age.kill('SIGTERM');
    await Promise.allSettled(work);
    throw error;
  }
}

export async function backup(state, output) {
  verifyImageLock(state);
  await assertCompose(state);
  const path = outsideRepository(output);
  const relation = relative(state.directory, path);
  if (relation === '' || (!relation.startsWith('../') && !relation.startsWith('..\\'))) {
    throw new Error('The encrypted archive must be written outside the live state directory.');
  }
  // This also validates the recipient checksum before any service is stopped.
  await command('age', ['--encrypt', '--recipient', state.settings.backup.ageRecipient], { input: '' });
  await command('tar', ['--version']);
  const rows = await inspectServices(state);
  const running = permanentServices.filter((name) =>
    rows.some((row) => row.Service === name && row.State === 'running'));
  if (running.length !== permanentServices.length) throw new Error('Start and verify all permanent services before taking a coordinated backup.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  const staging = mkdtempSync(join(tmpdir(), 'phaedra-stoat-backup-'));
  mkdirSync(join(staging, 'recovery'), { mode: 0o700 });
  const dumpFd = openSync(join(staging, 'recovery/mongo.archive.gz'), 'wx', 0o600);
  let outputFd;
  let stopped = false;
  let locked = false;
  let lockUncertain = false;
  let completed = false;
  try {
    outputFd = openSync(path, 'wx', 0o600);
    console.log('Starting maintenance backup. Public messaging will be interrupted until services resume.');
    stopped = true;
    await compose(state, ['stop', '--timeout', '60', 'caddy'], { signal: controller.signal });
    await compose(state, ['stop', '--timeout', '60', ...running.filter((name) => !['database', 'caddy'].includes(name))],
      { signal: controller.signal, timeout: 180000 });
    lockUncertain = true;
    await mongoAdmin(state,
      'const result=admin.fsyncLock(); if(result.lockCount!==1){admin.fsyncUnlock();quit(14);}');
    locked = true;
    lockUncertain = false;
    await compose(state, [
      'exec', '-T', 'database', 'mongodump',
      '--config=/run/phaedra/mongodump.yml',
      '--host=127.0.0.1', '--username=phaedra_app', '--authenticationDatabase=admin',
      '--db=revolt', '--archive', '--gzip',
    ], { stdoutFile: dumpFd, signal: controller.signal, timeout: 3600000 });
    await mongoAdmin(state, 'admin.fsyncUnlock();');
    locked = false;
    await encryptArchive(state, staging, outputFd, controller.signal);
    completed = true;
  } finally {
    let cleanupFailed = false;
    for (const cleanup of [
      () => closeSync(dumpFd),
      () => { if (outputFd !== undefined) closeSync(outputFd); },
      () => rmSync(staging, { recursive: true, force: true }),
      () => { if (!completed && outputFd !== undefined) rmSync(path, { force: true }); },
    ]) {
      try { cleanup(); } catch { cleanupFailed = true; }
    }
    try {
      if (lockUncertain) throw new Error('MongoDB lock acquisition was interrupted. Services remain stopped; inspect the lock before running unlock-database.');
      if (locked) {
        try { await mongoAdmin(state, 'admin.fsyncUnlock();'); locked = false; }
        catch { throw new Error('MongoDB remains write-locked. Run unlock-database before resuming services.'); }
      }
      if (stopped) {
        await compose(state, ['start', ...running.filter((name) => name !== 'database')], { timeout: 300000 });
        await waitHealthy(state);
      }
    } finally {
      process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    }
    if (cleanupFailed) throw new Error('Services recovered, but private backup staging cleanup failed. Inspect the protected temporary directory.');
  }
  console.log('Encrypted backup created: ' + path);
  console.log('Copy this archive to a separate authorized destination and test recovery. The age private identity must remain off the server.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--directory', '--out'].includes(args[i]) || !args[i + 1] || options[args[i]]) {
        throw new Error('Usage: backup.mjs --directory /srv/phaedra-social --out /secure-backups/DATE.tar.gz.age');
      }
      options[args[i]] = args[i + 1];
    }
    if (!options['--directory'] || !options['--out']) throw new Error('--directory and --out are required.');
    const state = readState(options['--directory']);
    await withOperation(state, () => backup(state, options['--out']));
  } catch (error) {
    console.error('Phaedra backup: ' + error.message);
    process.exitCode = 1;
  }
}
