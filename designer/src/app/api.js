import { createDocument, assignIds } from '../core/model.js';
import { parseDsl } from '../core/dsl.js';
import { fetchFromFigma } from '../core/figma.js';

// Backend client. Talks to the /api routes when a server is present; falls back to localStorage
// (useful when the built app is hosted statically).

export const clientId = Math.random().toString(36).slice(2, 10);

const headers = { 'Content-Type': 'application/json', 'X-Client-Id': clientId };

async function j(res) {
  if (!res.ok) { let msg = res.statusText; try { msg = (await res.json()).error || msg; } catch { /* ignore */ } throw new Error(msg); }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

const remote = {
  kind: 'server',
  list: () => fetch('/api/docs').then(j),
  get: (name) => fetch(`/api/docs/${encodeURIComponent(name)}`).then(j),
  put: (name, doc) => fetch(`/api/docs/${encodeURIComponent(name)}`, { method: 'PUT', headers, body: JSON.stringify(doc) }).then(j),
  create: (name, dsl = '') => fetch(`/api/docs/${encodeURIComponent(name)}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: dsl }).then(j),
  remove: (name) => fetch(`/api/docs/${encodeURIComponent(name)}`, { method: 'DELETE', headers }).then(j),
  figmaImport: (body) => fetch('/api/figma/import', { method: 'POST', headers, body: JSON.stringify(body) }).then(j),
  events(cb) {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => { try { cb(JSON.parse(e.data)); } catch { /* ignore */ } };
    return () => es.close();
  },
};

const LS = 'le-designer:docs';
function lsRead() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } }
function lsWrite(all) { localStorage.setItem(LS, JSON.stringify(all)); }

const local = {
  kind: 'local',
  async list() { return Object.keys(lsRead()).sort().map((name) => ({ name })); },
  async get(name) { const d = lsRead()[name]; if (!d) throw new Error('not found'); return d; },
  async put(name, doc) { const all = lsRead(); all[name] = doc; lsWrite(all); return { ok: true }; },
  async create(name, dsl) {
    const doc = createDocument(name);
    if (dsl && dsl.trim()) doc.children[0].children.push(...parseDsl(dsl));
    assignIds(doc);
    await local.put(name, doc);
    return doc;
  },
  async remove(name) { const all = lsRead(); delete all[name]; lsWrite(all); return { ok: true }; },
  async figmaImport({ token, fileKey, nodeIds, name }) {
    const doc = await fetchFromFigma({ token, fileKey, nodeIds, name });
    const n = name || doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await local.put(n, doc);
    return { name: n, doc };
  },
  events() { return () => {}; },
};

let backend = null;
export async function getBackend() {
  if (backend) return backend;
  try { await remote.list(); backend = remote; } catch { backend = local; }
  return backend;
}
