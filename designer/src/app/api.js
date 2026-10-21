import { createDocument, assignIds } from '../core/model.js';
import { parseDsl } from '../core/dsl.js';
import { fetchFromFigma, libraryFromFigma, isNativeDoc } from '../core/figma.js';

// Backend client. Talks to the /api routes when a server is present; falls back to localStorage
// (useful when the built app is hosted statically).

export const clientId = Math.random().toString(36).slice(2, 10);

export function userName() { try { return localStorage.getItem('le-designer:user') || ''; } catch { return ''; } }
export function setUserName(n) { try { localStorage.setItem('le-designer:user', n || ''); } catch { /* ignore */ } }
const headers = { 'Content-Type': 'application/json', 'X-Client-Id': clientId };
Object.defineProperty(headers, 'X-Client-Name', { enumerable: true, get: () => encodeURIComponent(userName()) });

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
  create: (name, dsl = '', { title, libraries } = {}) => fetch(`/api/docs/${encodeURIComponent(name)}?${new URLSearchParams({ ...(title ? { title } : {}), ...(libraries?.length ? { libs: libraries.join(',') } : {}) })}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: dsl }).then(j),
  meta: (name, body) => fetch(`/api/docs/${encodeURIComponent(name)}/meta`, { method: 'POST', headers, body: JSON.stringify(body) }).then(j),
  versions: (name) => fetch(`/api/docs/${encodeURIComponent(name)}/versions`).then(j),
  snapshot: (name) => fetch(`/api/docs/${encodeURIComponent(name)}/versions`, { method: 'POST', headers, body: '{}' }).then(j),
  restore: (name, id) => fetch(`/api/docs/${encodeURIComponent(name)}/versions`, { method: 'POST', headers, body: JSON.stringify({ restore: id }) }).then(j),
  remove: (name) => fetch(`/api/docs/${encodeURIComponent(name)}`, { method: 'DELETE', headers }).then(j),
  figmaImport: (body) => fetch('/api/figma/import', { method: 'POST', headers, body: JSON.stringify(body) }).then(j),
  libs: () => fetch('/api/libs').then(j),
  getLib: (name) => fetch(`/api/libs/${encodeURIComponent(name)}`).then(j),
  putLib: (name, doc) => fetch(`/api/libs/${encodeURIComponent(name)}`, { method: 'PUT', headers, body: JSON.stringify(doc) }).then(j),
  removeLib: (name) => fetch(`/api/libs/${encodeURIComponent(name)}`, { method: 'DELETE', headers }).then(j),
  importLib: (body) => fetch('/api/libs/import', { method: 'POST', headers, body: JSON.stringify(body) }).then(j),
  link: (name, body) => fetch(`/api/docs/${encodeURIComponent(name)}/link`, { method: 'POST', headers, body: JSON.stringify(body) }).then(j),
  events(cb) {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => { try { cb(JSON.parse(e.data)); } catch { /* ignore */ } };
    return () => es.close();
  },
};

const LS = 'le-designer:docs';
function lsRead() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } }
function lsWrite(all) { localStorage.setItem(LS, JSON.stringify(all)); }

function summary(name, doc) {
  const m = doc.meta || {};
  let frames = 0;
  for (const p of doc.children || []) frames += (p.children || []).length;
  return { name, title: m.title || doc.name || name, createdBy: m.createdBy || null, updatedBy: m.updatedBy || null, createdAt: m.createdAt || null, updatedAt: m.updatedAt || null, pages: (doc.children || []).length, frames, libraries: doc.libraries || [] };
}

const local = {
  kind: 'local',
  async list() { const all = lsRead(); return Object.keys(all).map((name) => summary(name, all[name])).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); },
  async get(name) { const d = lsRead()[name]; if (!d) throw new Error('not found'); return d; },
  async put(name, doc) {
    const all = lsRead();
    doc.meta ||= { seq: 1 };
    const now = new Date().toISOString();
    if (!doc.meta.createdAt) { doc.meta.createdAt = now; if (userName()) doc.meta.createdBy = userName(); }
    doc.meta.updatedAt = now; if (userName()) doc.meta.updatedBy = userName();
    all[name] = doc; lsWrite(all); return { ok: true };
  },
  async create(name, dsl, { title, libraries } = {}) {
    const doc = createDocument(name);
    if (title) doc.meta.title = title;
    if (libraries?.length) doc.libraries = libraries;
    if (dsl && dsl.trim()) doc.children[0].children.push(...parseDsl(dsl));
    assignIds(doc);
    await local.put(name, doc);
    return doc;
  },
  async meta(name, body) { const doc = await local.get(name); doc.meta ||= { seq: 1 }; if (body.title !== undefined) doc.meta.title = body.title; if (body.grid !== undefined) doc.meta.grid = body.grid ?? undefined; await local.put(name, doc); return summary(name, doc); },
  async versions() { return []; },
  async snapshot() { return { ok: false }; },
  async restore() { throw new Error('Version history needs the server'); },
  async remove(name) { const all = lsRead(); delete all[name]; lsWrite(all); return { ok: true }; },
  async figmaImport({ token, fileKey, nodeIds, name }) {
    const doc = await fetchFromFigma({ token, fileKey, nodeIds, name });
    const n = name || doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await local.put(n, doc);
    return { name: n, doc };
  },
  async libs() { return Object.keys(lsReadLibs()).sort().map((name) => ({ name, components: 0 })); },
  async getLib(name) { const d = lsReadLibs()[name]; if (!d) throw new Error('not found'); return d; },
  async putLib(name, doc) { const all = lsReadLibs(); all[name] = { ...doc, kind: 'library' }; lsWriteLibs(all); return { ok: true }; },
  async removeLib(name) { const all = lsReadLibs(); delete all[name]; lsWriteLibs(all); return { ok: true }; },
  async importLib({ source, json, token, name }) {
    let doc;
    if (json) doc = isNativeDoc(json) ? json : libraryFromFigma(json, name);
    else if (/^https?:\/\//.test(source) && !/figma\.com/.test(source)) { const r = await fetch(source); const data = await r.json(); doc = isNativeDoc(data) ? data : libraryFromFigma(data, name); }
    else doc = await fetchFromFigma({ token, fileKey: source, name });
    doc.kind = 'library'; if (source) doc.source = source;
    const n = name || String(doc.name || 'library').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    doc.name = n;
    await local.putLib(n, doc);
    return { name: n };
  },
  async link(name, { libraries, add, remove }) {
    const doc = await local.get(name);
    let libs = libraries || doc.libraries || [];
    if (add) libs = [...new Set([...libs, ...[].concat(add)])];
    if (remove) libs = libs.filter((l) => ![].concat(remove).includes(l));
    doc.libraries = libs; await local.put(name, doc); return { ok: true, libraries: libs };
  },
  events() { return () => {}; },
};
const LSL = 'le-designer:libs';
function lsReadLibs() { try { return JSON.parse(localStorage.getItem(LSL) || '{}'); } catch { return {}; } }
function lsWriteLibs(all) { localStorage.setItem(LSL, JSON.stringify(all)); }

/** Static builds (no API server): load the bundled sample documents and libraries once. */
async function seedLocal() {
  if (Object.keys(lsRead()).length || Object.keys(lsReadLibs()).length) return;
  try {
    const manifest = await (await fetch('seed/manifest.json')).json();
    for (const n of manifest.libs) await local.putLib(n, await (await fetch(`seed/libs-${n}.json`)).json());
    for (const n of manifest.docs) await local.put(n, await (await fetch(`seed/docs-${n}.json`)).json());
    if (manifest.open) localStorage.setItem('le-designer:last', manifest.open);
  } catch { /* no seed available */ }
}

let backend = null;
export async function getBackend() {
  if (backend) return backend;
  try { const r = await fetch('api/docs'); if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no api'); backend = remote; }
  catch { backend = local; await seedLocal(); }
  return backend;
}
