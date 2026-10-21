// HTTP API shared by the Vite dev server (middleware) and server.js (production).
// Documents are plain JSON files in designsDir; the CLI edits the same files, and a file watcher
// pushes change events to open editors over Server-Sent Events.

import fs from 'node:fs';
import path from 'node:path';
import { applyOps } from '../src/core/ops.js';
import { parseDsl, parseDslDocument, serializeDsl, serializeTokens, setTokenContext } from '../src/core/dsl.js';
import { createDocument, assignIds, resolve, findById, clone } from '../src/core/model.js';
import { fromFigma, toFigma, fetchFromFigma, libraryFromFigma, isNativeDoc, parseFigmaUrl } from '../src/core/figma.js';
import { exportHtml } from '../src/core/html.js';
import { buildIndex, describeComponents, lintStrict, expandDocument } from '../src/core/components.js';

const SAFE = /^[A-Za-z0-9._-]+$/;

/** Libraries referenced by doc.libraries, loaded from the library store (missing ones are skipped). */
export function loadLibs(libStore, doc) {
  return (doc?.libraries || []).map((n) => { try { return libStore.load(n); } catch { return null; } }).filter(Boolean);
}

/** Parse DSL with the document's token context; merges tokens defined in the text into the document. */
export function parseForDoc(doc, libs, text) {
  setTokenContext(buildIndex(doc, libs).tokens);
  const { roots, tokens } = parseDslDocument(text);
  mergeTokens(doc, tokens);
  return roots;
}

export function mergeTokens(doc, tokens) {
  if (!tokens) return;
  for (const k of ['colors', 'textStyles', 'effects']) {
    if (!Object.keys(tokens[k] || {}).length) continue;
    doc.tokens ||= {};
    doc.tokens[k] = { ...(doc.tokens[k] || {}), ...tokens[k] };
  }
}

/**
 * Import a library from: a Figma file URL/key (token required), an http(s) URL of a JSON document, or parsed JSON.
 */
export async function importLibrary({ source, json, token, name }, fetchImpl = globalThis.fetch) {
  let doc;
  if (json) doc = isNativeDoc(json) ? json : libraryFromFigma(json, name);
  else if (/^https?:\/\//.test(source) && !/figma\.com/.test(source)) {
    const res = await fetchImpl(source);
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const data = await res.json();
    doc = isNativeDoc(data) ? data : libraryFromFigma(data, name);
  } else {
    parseFigmaUrl(source); // throws a helpful error for community URLs
    const full = await fetchFromFigma({ token, fileKey: source, name }, fetchImpl);
    doc = full; doc.kind = 'library';
  }
  doc.kind = 'library';
  if (source) doc.source = source;
  if (name) doc.name = name;
  return doc;
}

const VERSION_LIMIT = 40;          // snapshots kept per document
const VERSION_INTERVAL = 5 * 60e3; // at most one snapshot per 5 minutes per author

/** Summary used by the Files view: title, designer, dates, counts. */
export function summarize(name, doc, st) {
  const page = doc.children?.[0];
  let frames = 0, nodes = 0;
  for (const p of doc.children || []) { frames += (p.children || []).length; walkCount(p, (n) => { nodes++; }); }
  const m = doc.meta || {};
  return {
    name, title: m.title || doc.name || name, createdBy: m.createdBy || null, updatedBy: m.updatedBy || null,
    createdAt: m.createdAt || null, updatedAt: m.updatedAt || (st ? new Date(st.mtimeMs).toISOString() : null),
    mtime: st?.mtimeMs, size: st?.size, pages: (doc.children || []).length, frames, nodes, libraries: doc.libraries || [],
    kind: doc.kind || 'design', firstPage: page?.name || null, brief: m.brief ? String(m.brief).slice(0, 160) : null,
  };
}
function walkCount(n, fn) { fn(n); for (const c of n.children || []) walkCount(c, fn); }

export function createStore(designsDir) {
  fs.mkdirSync(designsDir, { recursive: true });
  const file = (name) => {
    if (!SAFE.test(name)) throw Object.assign(new Error('Invalid document name'), { status: 400 });
    return path.join(designsDir, name + '.json');
  };
  const historyDir = (name) => path.join(designsDir, '.history', name);
  const store = {
    dir: designsDir,
    list() {
      return fs.readdirSync(designsDir).filter((f) => f.endsWith('.json')).map((f) => {
        const st = fs.statSync(path.join(designsDir, f));
        let doc = {};
        try { doc = JSON.parse(fs.readFileSync(path.join(designsDir, f), 'utf8')); } catch { /* corrupt file: list it anyway */ }
        return summarize(f.slice(0, -5), doc, st);
      }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.name.localeCompare(b.name));
    },
    exists(name) { return fs.existsSync(file(name)); },
    load(name) {
      const p = file(name);
      if (!fs.existsSync(p)) throw Object.assign(new Error(`Document "${name}" not found`), { status: 404 });
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    },
    /** Save with metadata; author (who) is recorded as updatedBy / createdBy. */
    save(name, doc, who) {
      const p = file(name);
      const now = new Date().toISOString();
      doc.meta ||= { seq: 1 };
      if (!doc.meta.createdAt) { doc.meta.createdAt = now; if (who) doc.meta.createdBy = who; }
      doc.meta.updatedAt = now;
      if (who) doc.meta.updatedBy = who;
      if (fs.existsSync(p)) store.snapshot(name, who);
      const tmp = p + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(doc, null, 1));
      fs.renameSync(tmp, p);
      return doc;
    },
    /** Keep a copy of the current file in .history/<name>/ (rate limited per author, bounded). */
    snapshot(name, who, force = false) {
      const p = file(name);
      if (!fs.existsSync(p)) return null;
      const dir = historyDir(name);
      fs.mkdirSync(dir, { recursive: true });
      const parse = (f) => { const [ts, author = ''] = f.slice(0, -5).split('__'); return { ts: Number(ts), author }; };
      const existing = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      const last = existing.length ? parse(existing[existing.length - 1]) : null;
      if (!force && last && Date.now() - last.ts < VERSION_INTERVAL && last.author === (who || '')) return null;
      const target = path.join(dir, `${Date.now()}__${(who || '').replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
      fs.copyFileSync(p, target);
      const all = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      for (const f of all.slice(0, Math.max(0, all.length - VERSION_LIMIT))) fs.rmSync(path.join(dir, f), { force: true });
      return path.basename(target, '.json');
    },
    versions(name) {
      const dir = historyDir(name);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => {
        const [ts, author = ''] = f.slice(0, -5).split('__');
        const st = fs.statSync(path.join(dir, f));
        return { id: f.slice(0, -5), at: new Date(Number(ts)).toISOString(), by: author || null, size: st.size };
      });
    },
    loadVersion(name, id) {
      if (!SAFE.test(id)) throw Object.assign(new Error('Invalid version'), { status: 400 });
      const p = path.join(historyDir(name), id + '.json');
      if (!fs.existsSync(p)) throw Object.assign(new Error('Version not found'), { status: 404 });
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    },
    remove(name) { fs.rmSync(file(name), { force: true }); fs.rmSync(historyDir(name), { recursive: true, force: true }); },
  };
  return store;
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

export function createApiHandler({ designsDir, librariesDir = path.join(path.dirname(designsDir), 'libraries') }) {
  const store = createStore(designsDir);
  const libStore = createStore(librariesDir);
  const clients = new Set();
  const lastWriter = new Map();

  // watch the directories for external changes (CLI, other editors)
  const timers = new Map();
  const watchDir = (dir, kind, st) => {
    try {
      fs.watch(dir, { persistent: false }, (ev, filename) => {
        if (!filename || !filename.endsWith('.json')) return;
        const name = filename.slice(0, -5);
        const key = kind + ':' + name;
        clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => {
          const writer = lastWriter.get(key) || null;
          lastWriter.delete(key);
          broadcast({ type: kind === 'lib' ? 'lib-changed' : 'changed', doc: name, lib: kind === 'lib' ? name : undefined, writer, exists: st.exists(name) });
        }, 120));
      });
    } catch (e) { console.warn('fs.watch unavailable:', e.message); }
  };
  watchDir(designsDir, 'doc', store);
  watchDir(librariesDir, 'lib', libStore);
  const markWriter = (name, clientId, kind = 'doc') => lastWriter.set(kind + ':' + name, clientId);

  function broadcast(event) {
    const msg = `data: ${JSON.stringify(event)}\n\n`;
    for (const c of clients) { try { c.write(msg); } catch { clients.delete(c); } }
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id, X-Client-Name' });
      res.end();
      return true;
    }
    try {
      const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
      const clientId = req.headers['x-client-id'] || null;
      const who = req.headers['x-client-name'] ? decodeURIComponent(String(req.headers['x-client-name'])).slice(0, 80) : (url.searchParams.get('who') || null);

      if (parts[1] === 'events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closed */ } }, 25000);
        req.on('close', () => { clients.delete(res); clearInterval(ping); });
        return true;
      }

      if (parts[1] === 'proxy' && req.method === 'GET') {
        // fetch an HTML prototype server-side so the app can load it into a same-origin iframe
        const target = url.searchParams.get('url');
        if (!/^https?:\/\//.test(target || '')) { send(res, 400, { error: 'url required' }); return true; }
        const r = await fetch(target, { headers: { 'User-Agent': 'LE-Designer/1.0' } });
        let html = await r.text();
        if (!/<base\s/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${target.replace(/"/g, '&quot;')}">`);
        send(res, 200, html, 'text/html');
        return true;
      }
      if (parts[1] === 'capture' && req.method === 'POST') {
        // { html?: string, name?, state?, doc?: name } -> capture needs a browser; the app does it client-side.
        send(res, 400, { error: 'Capture runs in the browser (Import → HTML prototype) or via "node le.js import-html" with Playwright' });
        return true;
      }

      if (parts[1] === 'figma' && parts[2] === 'import' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const doc = await fetchFromFigma({ token: body.token || process.env.FIGMA_TOKEN, fileKey: body.fileKey, nodeIds: body.nodeIds, name: body.name });
        const name = body.name || slugify(doc.name) || 'figma-import';
        markWriter(name, clientId);
        store.save(name, doc, who);
        send(res, 200, { name, doc });
        return true;
      }

      if (parts[1] === 'libs') {
        if (parts.length === 2 && req.method === 'GET') { send(res, 200, libStore.list().map((l) => { let d = null; try { d = libStore.load(l.name); } catch { /* ignore */ } return { ...l, source: d?.source, components: d ? buildIndex(null, [d]).list.length : 0 }; })); return true; }
        if (parts[2] === 'import' && req.method === 'POST') {
          const body = JSON.parse(await readBody(req) || '{}');
          const doc = await importLibrary({ source: body.source, json: body.json, token: body.token || process.env.FIGMA_TOKEN, name: body.name });
          const name = body.name || slugify(doc.name) || 'library';
          doc.name = name;
          markWriter(name, clientId, 'lib');
          libStore.save(name, doc, who);
          send(res, 200, { name, components: describeComponents(buildIndex(null, [doc])) });
          return true;
        }
        const name = decodeURIComponent(parts[2] || '');
        if (parts[3] === 'components' && req.method === 'GET') { const d = libStore.load(name); const idx = buildIndex(null, [d]); send(res, 200, url.searchParams.get('format') === 'json' ? componentsJson(idx) : describeComponents(idx).join('\n'), url.searchParams.get('format') === 'json' ? 'application/json' : 'text/plain'); return true; }
        if (parts[3] === 'dsl' && req.method === 'GET') { const d = libStore.load(name); send(res, 200, serializeTokens(d.tokens) + '\n' + serializeDsl(d, { ids: url.searchParams.get('ids') !== '0' }), 'text/plain'); return true; }
        if (req.method === 'GET') { send(res, 200, libStore.load(name)); return true; }
        if (req.method === 'PUT') { let d = JSON.parse(await readBody(req)); d = isNativeDoc(d) ? d : libraryFromFigma(d, name); d.kind = 'library'; d.name ||= name; markWriter(name, clientId, 'lib'); libStore.save(name, d, who); send(res, 200, { ok: true }); return true; }
        if (req.method === 'POST') { // create from DSL text
          const d = createDocument(name); d.kind = 'library';
          const text = await readBody(req);
          if (text.trim()) { d.children[0].children.push(...parseForDoc(d, [], text)); assignIds(d); }
          markWriter(name, clientId, 'lib'); libStore.save(name, d, who); send(res, 200, d); return true;
        }
        if (req.method === 'DELETE') { libStore.remove(name); send(res, 200, { ok: true }); return true; }
        send(res, 404, { error: 'Not found' }); return true;
      }

      if (parts[1] !== 'docs') { send(res, 404, { error: 'Not found' }); return true; }

      if (parts.length === 2 && req.method === 'GET') { send(res, 200, store.list()); return true; }
      const name = decodeURIComponent(parts[2] || '');
      const sub = parts[3];

      if (sub === 'versions') {
        if (req.method === 'GET') { send(res, 200, store.versions(name)); return true; }
        if (req.method === 'POST') { // snapshot now, or restore a version: { restore: id }
          const body = JSON.parse(await readBody(req) || '{}');
          if (body.restore) { const v = store.loadVersion(name, body.restore); markWriter(name, clientId); store.save(name, v, who); send(res, 200, { ok: true, doc: v }); return true; }
          send(res, 200, { ok: true, id: store.snapshot(name, who, true) });
          return true;
        }
      }
      if (sub === 'meta' && req.method === 'POST') { // { title, ... }
        const body = JSON.parse(await readBody(req) || '{}');
        const doc = store.load(name);
        doc.meta ||= { seq: 1 };
        if (body.title !== undefined) doc.meta.title = String(body.title).slice(0, 200);
        if (body.brief !== undefined) doc.meta.brief = String(body.brief).slice(0, 20000);
        if (body.grid !== undefined) doc.meta.grid = body.grid === null ? undefined : Number(body.grid) || 0;
        markWriter(name, clientId);
        store.save(name, doc, who);
        send(res, 200, summarize(name, doc));
        return true;
      }

      if (!sub) {
        if (req.method === 'GET') { send(res, 200, store.load(name)); return true; }
        if (req.method === 'PUT') {
          const raw = await readBody(req);
          let doc = JSON.parse(raw);
          doc = fromFigma(doc, name); // accepts native or Figma JSON
          if (!doc.name) doc.name = name;
          markWriter(name, clientId);
          store.save(name, doc, who);
          send(res, 200, { ok: true });
          return true;
        }
        if (req.method === 'DELETE') { store.remove(name); send(res, 200, { ok: true }); return true; }
        if (req.method === 'POST') { // create (?libs=a,b links libraries)
          if (store.exists(name)) { send(res, 409, { error: 'exists' }); return true; }
          const body = await readBody(req);
          const doc = createDocument(name);
          if (url.searchParams.get('title')) doc.meta.title = url.searchParams.get('title');
          if (url.searchParams.get('libs')) doc.libraries = url.searchParams.get('libs').split(',').filter(Boolean);
          if (body.trim()) { const roots = parseForDoc(doc, loadLibs(libStore, doc), body); doc.children[0].children.push(...roots); assignIds(doc); }
          markWriter(name, clientId);
          store.save(name, doc, who);
          send(res, 200, doc);
          return true;
        }
      }

      if (sub === 'link' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const doc = store.load(name);
        let libs = doc.libraries || [];
        if (body.libraries) libs = body.libraries;
        if (body.add) libs = [...new Set([...libs, ...[].concat(body.add)])];
        if (body.remove) libs = libs.filter((l) => ![].concat(body.remove).includes(l));
        for (const l of libs) if (!libStore.exists(l)) { send(res, 404, { error: `Library "${l}" not found` }); return true; }
        doc.libraries = libs;
        markWriter(name, clientId);
        store.save(name, doc, who);
        send(res, 200, { ok: true, libraries: libs });
        return true;
      }

      if (sub === 'components' && req.method === 'GET') {
        const doc = store.load(name);
        const idx = buildIndex(doc, loadLibs(libStore, doc));
        if (url.searchParams.get('format') === 'json') send(res, 200, componentsJson(idx));
        else send(res, 200, [serializeTokens(idx.tokens), ...describeComponents(idx)].filter(Boolean).join('\n'), 'text/plain');
        return true;
      }

      if (sub === 'lint' && req.method === 'GET') {
        const doc = store.load(name);
        send(res, 200, lintStrict(doc, loadLibs(libStore, doc)));
        return true;
      }

      if (sub === 'ops' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const doc = store.load(name);
        const scope = body.scope ? resolve(doc, body.scope)[0] : doc;
        const result = applyOps(doc, body.ops || body, scope, { libs: loadLibs(libStore, doc) });
        markWriter(name, clientId);
        store.save(name, doc, who);
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
          const libs = loadLibs(libStore, doc);
          if (sel) { setTokenContext(buildIndex(doc, libs).tokens); applyOps(doc, { op: 'replace', target: sel, dsl: text }, doc, { libs }); }
          else { const page = doc.children[parseInt(url.searchParams.get('page') || '0', 10)]; page.children = parseForDoc(doc, libs, text); assignIds(doc); }
          markWriter(name, clientId);
          store.save(name, doc, who);
          send(res, 200, { ok: true });
          return true;
        }
      }

      if (sub === 'export' && req.method === 'GET') {
        const doc = store.load(name);
        const libs = loadLibs(libStore, doc);
        const format = url.searchParams.get('format') || 'json';
        if (format === 'html') { send(res, 200, exportHtml(doc, { page: parseInt(url.searchParams.get('page') || '0', 10), libs }), 'text/html'); return true; }
        if (format === 'figma') { send(res, 200, toFigma(doc, libs)); return true; }
        if (format === 'dsl') { send(res, 200, serializeTokens(doc.tokens) + '\n' + serializeDsl(doc, { ids: false }), 'text/plain'); return true; }
        if (url.searchParams.get('expanded')) { send(res, 200, expandDocument(doc, libs)); return true; }
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

export function componentsJson(idx) {
  return {
    tokens: idx.tokens,
    components: idx.list.map((e) => ({ id: e.id, name: e.name, type: e.type, lib: e.lib, variants: e.variants || {}, textSlots: (e.textSlots || []).map((t) => t.name), description: e.description })),
  };
}

export { clone };
