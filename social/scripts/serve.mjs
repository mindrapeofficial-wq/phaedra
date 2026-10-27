// SPDX-License-Identifier: GPL-2.0-or-later
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PHAEDRA_SOCIAL_PORT || 5186);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto local no válido.');
const permitted = new Set(['/index.html', '/config.json', '/style.css', '/assets/mark.svg',
  '/src/app.js', '/src/stoat-client.js', '/src/view-model.js', '/LICENSE.txt']);
const mime = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); return response.end(); }
  let pathname;
  try { pathname = new URL(request.url, `http://127.0.0.1:${port}`).pathname; }
  catch { response.writeHead(400); return response.end(); }
  if (pathname === '/') pathname = '/index.html';
  if (!permitted.has(pathname)) { response.writeHead(404); return response.end('No encontrado'); }
  try {
    const data = await readFile(path.join(root, pathname.slice(1)));
    response.setHeader('Content-Type', mime[path.extname(pathname)] || 'application/octet-stream');
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Ejecuta npm run build antes de iniciar el cliente.');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Phaedra Social: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
