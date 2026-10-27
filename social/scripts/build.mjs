// SPDX-License-Identifier: GPL-2.0-or-later
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizeConfig } from '../src/view-model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildClient({ configPath = path.join(root, 'config.json'), output = path.join(root, 'dist'), quiet = false } = {}) {
output = path.resolve(output);
if (output === root || output === path.dirname(root) || path.relative(output, root).split(path.sep)[0] !== '..') {
  throw new Error('La salida no puede contener el código fuente.');
}
const config = normalizeConfig(JSON.parse(await readFile(configPath, 'utf8')));
// Build from an explicit allowlist: tests, deployment credentials and local
// instance state must never become part of the distributed client.
const sources = ['index.html', 'style.css', 'assets/mark.svg', 'src/app.js', 'src/view-model.js', 'src/stoat-client.js'];
const data = await Promise.all(sources.map(async (file) => [file, await readFile(path.join(root, file))]));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [file, content] of data) {
  await mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await writeFile(path.join(output, file), content);
}
await writeFile(path.join(output, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
await cp(path.join(root, '..', 'COPYING'), path.join(output, 'LICENSE.txt'));
if (!quiet) {
  console.log(`Cliente preparado: ${path.relative(process.cwd(), output) || output}`);
  console.log(config.apiUrl ? 'Comunidad configurada. No se han incluido credenciales.' : 'Sin servidor predeterminado: se solicitará la dirección al abrirlo.');
}
return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i + 1]) throw new Error(`Falta el valor de ${args[i]}`);
    if (args[i] === '--config') options.configPath = path.resolve(args[i + 1]);
    else if (args[i] === '--out') options.output = path.resolve(args[i + 1]);
    else throw new Error(`Opción desconocida: ${args[i]}`);
  }
  await buildClient(options);
}
