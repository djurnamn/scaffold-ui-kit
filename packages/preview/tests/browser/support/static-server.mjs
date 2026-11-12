// A static file server for a built preview: `serveStatic(root, port, path)`
// serves the directory's files under `path` with their content types and
// answers a directory with its index.html; anything outside `path` is not
// found, as on a project site whose domain root is someone else's. A few
// lines of `node:http`, so the tests carry no server dependency.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.map', 'application/json; charset=utf-8'],
]);

/**
 * Serve `root` on `port` under `path`.
 *
 * @param {string} root - The directory to serve.
 * @param {number} port - The port to listen on.
 * @param {string} [path] - The path the directory is served under, starting
 *   and ending with `/`; the domain root by default.
 * @returns {Promise<import('node:http').Server>} The listening server.
 */
export function serveStatic(root, port, path = '/') {
  const base = normalize(root);
  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url ?? '/', `http://localhost:${port}`);
      if (`${pathname}/` === path) {
        response.writeHead(301, { location: path }).end();
        return;
      }
      if (!pathname.startsWith(path)) {
        response.writeHead(404).end('not found');
        return;
      }
      const relative = pathname.slice(path.length);
      const resolved = join(base, normalize(decodeURIComponent(`/${relative}`)));
      if (!resolved.startsWith(base)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      let file = resolved;
      const found = await stat(file).catch(() => null);
      if (found?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': CONTENT_TYPES.get(extname(file)) ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise((resolvePromise) => {
    server.listen(port, () => {
      console.log(`[static] serving ${base} on http://localhost:${port}${path}`);
      resolvePromise(server);
    });
  });
}
