#!/usr/bin/env node
// Production server: serves the built editor (dist/) and the /api routes.
//   npm run build && npm start            (default port 4000, designs in ./designs)
//   PORT=5000 LE_DESIGNS=/path node server.js

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './server/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT || process.argv[2] || '4000', 10);
const designsDir = process.env.LE_DESIGNS || path.join(here, 'designs');
const librariesDir = process.env.LE_LIBRARIES || path.join(path.dirname(designsDir), 'libraries');
const dist = path.join(here, 'dist');
const handle = createApiHandler({ designsDir, librariesDir });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  if (await handle(req, res)) return;
  if (!fs.existsSync(dist)) { res.writeHead(500); res.end('Run "npm run build" first (dist/ missing).'); return; }
  let p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = path.join(dist, p);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`LE Designer: http://localhost:${port}  (designs: ${designsDir}, libraries: ${librariesDir})`));
