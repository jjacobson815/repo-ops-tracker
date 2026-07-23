// serve.mjs — zero-dependency static file server for the public/ frontend.
// Node built-ins only. Replaces express.static from the removed server.
//
//   node scripts/serve.mjs            # serves ./public on :8787
//   PORT=5050 node scripts/serve.mjs  # custom port
//
// The app is fully client-side (IndexedDB via Dexie); this just hands out
// static files with correct MIME types (notably .mjs -> text/javascript so the
// vendored Dexie ES module loads). In the Capacitor build the same public/ dir
// is served by the native local scheme instead — no server at all.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

async function resolvePath(urlPath) {
  // Strip query/hash, decode, and normalize; reject path traversal.
  const clean = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  let rel = normalize(clean).replace(/^(\.\.[/\\])+/, '');
  if (rel === '/' || rel === '\\' || rel === '') rel = 'index.html';
  const abs = join(PUBLIC_DIR, rel);
  if (!abs.startsWith(PUBLIC_DIR)) return null; // traversal guard
  try {
    const s = await stat(abs);
    if (s.isDirectory()) {
      const indexAbs = join(abs, 'index.html');
      await stat(indexAbs);
      return indexAbs;
    }
    return abs;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const abs = await resolvePath(req.url);
  if (!abs) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });
  createReadStream(abs).pipe(res);
});

server.listen(PORT, () => {
  console.log(`repo-ops-tracker (static) serving ${PUBLIC_DIR}`);
  console.log(`http://localhost:${PORT}`);
});
