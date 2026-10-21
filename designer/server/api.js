// HTTP API shared by the Vite dev server (middleware) and server.js (production).
// Documents are plain JSON files in designsDir; the CLI edits the same files, and a file watcher
// pushes change events to open editors over Server-Sent Events.

import fs from 'node:fs';
import path from 'node:path';
import { applyOps } from '../src/core/ops.js';
import { parseDsl, serializeDsl } from '../src/core/dsl.js';
import { createDocument, assignIds, resolve, findById, clone } from '../src/core/model.js';
import { fromFigma, toFigma, fetchFromFigma } from '../src/core/figma.js';
import { exportHtml } from '../src/core/html.js';

const SAFE = /^[A-Za-z0-9._-]+$/;

export function createStore(designsDir) {
  fs.mkdirSync(designsDir, { recursive: true });
  const file = (name) => {
    if (!SAFE.test(name)) throw Object.assign(new Error('Invalid document name'), { status: 400 });
    return path.join(designsDir, name + '.json');
  };
  return {
    dir: designsDir,
    list() {
      return fs.readdirSync(designsDir).filter((f) => f.endsWith('.json')).map((f) => {
        const st = fs.statSync(path.join(designsDir, f));
        return { name: f.slice(0, -5), mtime: st.mtimeMs, size: st.size };
      }).sort((a, b) => a.name.localeCompare(b.name));
    },
    exists(name) { return fs.existsSync(file(name)); },
    load(name) {
      const p = file(name);
      if (!fs.existsSync(p)) throw Object.assign(new Error(`Document "${name}" not found`), { status: 404 });
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    },
    save(name, doc) {
      const p = file(name);
      const tmp = p + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(doc, null, 1));
      fs.renameSync(tmp, p);
      return doc;
    },
    remove(name) { fs.rmSync(file(name), { force: true }); },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(data);
}

export function createApiHandler({ designsDir }) {
  const store = createStore(designsDir);
  const clients = new Set();
  const lastWriter = new Map();

  // watch the directory for external changes (CLI, other editors)
  const timers = new Map();
  try {
    fs.watch(designsDir, { persistent: false }, (ev, filename) => {
      if (!filename || !filename.endsWith('.json')) return;
      const name = filename.slice(0, -5);
      clearTimeout(timers.get(name));
      timers.set(name, setTimeout(() => {
        const writer = lastWriter.get(name) || null;
        lastWriter.delete(name);
        broadcast({ type: 'changed', doc: name, writer, exists: store.exists(name) });
      }, 120));
    });
  } catch (e) { console.warn('fs.watch unavailable:', e.message); }

  function broadcast(event) {
    const msg = `data: ${JSON.stringify(event)}\n\n`;
    for (const c of clients) { try { c.write(msg); } catch { clients.delete(c); } }
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id' });
      res.end();
      return true;
    }
    try {
      const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
      const clientId = req.headers['x-client-id'] || null;

      if (parts[1] === 'events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closed */ } }, 25000);
        req.on('close', () => { clients.delete(res); clearInterval(ping); });
        return true;
      }

      if (parts[1] === 'figma' && parts[2] === 'import' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const doc = await fetchFromFigma({ token: body.token || process.env.FIGMA_TOKEN, fileKey: body.fileKey, nodeIds: body.nodeIds, name: body.name });
        const name = body.name || slugify(doc.name) || 'figma-import';
        lastWriter.set(name, clientId);
        store.save(name, doc);
        send(res, 200, { name, doc });
        return true;
      }

      if (parts[1] !== 'docs') { send(res, 404, { error: 'Not found' }); return true; }

      if (parts.length === 2 && req.method === 'GET') { send(res, 200, store.list()); return true; }
      const name = decodeURIComponent(parts[2] || '');
      const sub = parts[3];

      if (!sub) {
        if (req.method === 'GET') { send(res, 200, store.load(name)); return true; }
        if (req.method === 'PUT') {
          const raw = await readBody(req);
          let doc = JSON.parse(raw);
          doc = fromFigma(doc, name); // accepts native or Figma JSON
          if (!doc.name) doc.name = name;
          lastWriter.set(name, clientId);
          store.save(name, doc);
          send(res, 200, { ok: true });
          return true;
        }
        if (req.method === 'DELETE') { store.remove(name); send(res, 200, { ok: true }); return true; }
        if (req.method === 'POST') { // create
          if (store.exists(name)) { send(res, 409, { error: 'exists' }); return true; }
          const body = await readBody(req);
          const doc = createDocument(name);
          if (body.trim()) { const roots = parseDsl(body); doc.children[0].children.push(...roots); assignIds(doc); }
          lastWriter.set(name, clientId);
          store.save(name, doc);
          send(res, 200, doc);
          return true;
        }
      }

      if (sub === 'ops' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const doc = store.load(name);
        const scope = body.scope ? resolve(doc, body.scope)[0] : doc;
        const result = applyOps(doc, body.ops || body, scope);
        lastWriter.set(name, clientId);
        store.save(name, doc);
        send(res, 200, { ok: true, ...result, dsl: body.return === 'dsl' ? serializeDsl(doc) : undefined, doc: body.return === 'doc' ? doc : undefined });
        return true;
      }

      if (sub === 'dsl') {
        const doc = store.load(name);
        if (req.method === 'GET') {
          const sel = url.searchParams.get('sel');
          const nodes = sel ? resolve(doc, sel) : [doc];
          const depth = url.searchParams.get('depth') ? parseInt(url.searchParams.get('depth'), 10) : Infinity;
          const parent = sel && nodes[0] ? findById(doc, nodes[0].id)?.parent : null;
          send(res, 200, serializeDsl(nodes, { ids: url.searchParams.get('ids') !== '0', depth }, parent), 'text/plain');
          return true;
        }
        if (req.method === 'POST') { // replace subtree (sel) or whole page content
          const text = await readBody(req);
          const sel = url.searchParams.get('sel');
          if (sel) applyOps(doc, { op: 'replace', target: sel, dsl: text });
          else { const page = doc.children[0]; page.children = parseDsl(text); assignIds(doc); }
          lastWriter.set(name, clientId);
          store.save(name, doc);
          send(res, 200, { ok: true });
          return true;
        }
      }

      if (sub === 'export' && req.method === 'GET') {
        const doc = store.load(name);
        const format = url.searchParams.get('format') || 'json';
        if (format === 'html') { send(res, 200, exportHtml(doc, { page: parseInt(url.searchParams.get('page') || '0', 10) }), 'text/html'); return true; }
        if (format === 'figma') { send(res, 200, toFigma(doc)); return true; }
        if (format === 'dsl') { send(res, 200, serializeDsl(doc, { ids: false }), 'text/plain'); return true; }
        send(res, 200, doc);
        return true;
      }

      send(res, 404, { error: 'Not found' });
      return true;
    } catch (e) {
      send(res, e.status || 400, { error: e.message });
      return true;
    }
  };
}

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export { clone };
