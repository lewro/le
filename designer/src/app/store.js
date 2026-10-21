// Minimal external store (useSyncExternalStore). All document mutations go through apply(ops), which:
//   - copies only the touched path of the tree (copy-on-write), so unchanged subtrees keep their identity and
//     memoized renderers skip them — this is what keeps a 60-page canvas responsive while editing
//   - keeps undo/redo history (cheap: snapshots share structure)
//   - debounces saves to the backend
// Pan/zoom live in a mutable view ref that is applied straight to the DOM (see Canvas) and committed to React
// state at a throttled rate.

import { useSyncExternalStore } from 'react';
import { applyOps } from '../core/ops.js';
import { clone, findById, pathTo, getParent, walk, hasAutoLayout, resolve } from '../core/model.js';
import { buildIndex } from '../core/components.js';
import { getBackend, clientId } from './api.js';

const HISTORY_LIMIT = 200;

let state = {
  backend: null,
  docs: [],
  libraries: [],   // [{ name, components, source }] available libraries
  libs: {},        // name -> library document (linked ones, loaded)
  docName: null,
  doc: null,
  pageId: null,
  selection: [],
  hoverId: null,
  editingId: null,
  tool: 'select',
  view: { zoom: 1, pan: { x: 0, y: 0 } }, // committed view (throttled); the live value is in viewRef
  history: [],
  future: [],
  dirty: false,
  saving: false,
  status: '',
  leftTab: 'layers',
  rightTab: 'design',
  dialog: null,
};

export const viewRef = { zoom: 1, pan: { x: 0, y: 0 } };
const viewListeners = new Set();
/** Subscribe to live view changes (used by Canvas to update the DOM transform without re-rendering). */
export function onViewChange(fn) { viewListeners.add(fn); return () => viewListeners.delete(fn); }
let viewCommitTimer = null;
export function setView(next, { commit = 'throttle' } = {}) {
  viewRef.zoom = next.zoom ?? viewRef.zoom;
  viewRef.pan = next.pan ?? viewRef.pan;
  for (const fn of viewListeners) fn(viewRef);
  if (commit === 'now') { clearTimeout(viewCommitTimer); viewCommitTimer = null; commitView(); }
  else if (!viewCommitTimer) viewCommitTimer = setTimeout(() => { viewCommitTimer = null; commitView(); }, 80);
}
function commitView() { setState({ view: { zoom: viewRef.zoom, pan: { ...viewRef.pan } } }); }

const listeners = new Set();
function emit() { for (const l of listeners) l(); }
export function setState(patch) { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; emit(); }
export function getState() { return state; }
export function useStore(selector = (s) => s) {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => selector(state), () => selector(state));
}

// --------------------------------------------------------------------------- component index (memoized)

let indexCache = { doc: null, libs: null, index: null };
/**
 * Component index for the open document + linked libraries. Its identity only changes when a component,
 * component set, token table or library actually changes, so instance renderers can skip work on unrelated edits.
 */
export function getIndex() {
  const { doc, libs } = state;
  if (indexCache.doc === doc && indexCache.libs === libs) return indexCache.index;
  let index = buildIndex(doc, Object.values(libs));
  const prev = indexCache.index;
  if (prev && indexCache.libs === libs && prev.list.length === index.list.length && (doc?.tokens === indexCache.doc?.tokens)
    && index.list.every((e, i) => prev.list[i].node === e.node && prev.list[i].id === e.id)) index = prev;
  indexCache = { doc, libs, index };
  return index;
}
export function useIndex() { return useStore((s) => s.doc && s.libs) && getIndex(); }
export function linkedLibs() { return Object.values(state.libs); }

// --------------------------------------------------------------------------- persistence

let saveTimer = null;
let lastSaveTime = 0;
export function scheduleSave(delay = 400) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, delay);
}
export async function saveNow() {
  clearTimeout(saveTimer);
  const { backend, doc, docName } = state;
  if (!backend || !doc || !docName || !state.dirty) return;
  setState({ saving: true });
  try { await backend.put(docName, doc); lastSaveTime = Date.now(); setState({ saving: false, dirty: false, status: 'Saved' }); }
  catch (e) { setState({ saving: false, status: 'Save failed: ' + e.message }); }
}

export async function init() {
  const backend = await getBackend();
  setState({ backend });
  await refreshDocs();
  backend.events(async (ev) => {
    if (ev.type === 'lib-changed') {
      await refreshLibraries();
      if (state.libs[ev.lib] && ev.writer !== clientId) { try { setState({ libs: { ...state.libs, [ev.lib]: await backend.getLib(ev.lib) }, status: `Library ${ev.lib} reloaded` }); } catch { /* removed */ } }
      return;
    }
    if (ev.type !== 'changed') return;
    await refreshDocs();
    if (ev.doc === state.docName && ev.writer !== clientId) {
      if (!ev.exists) return;
      if (state.dirty || Date.now() - lastSaveTime < 300) return; // our own write in flight
      const doc = await backend.get(ev.doc);
      setState({ doc, status: 'Reloaded from disk', history: [...state.history, state.doc].slice(-HISTORY_LIMIT), future: [] });
      await loadLinkedLibs(doc);
      pruneSelection();
    }
  });
  const params = new URLSearchParams(location.search);
  const name = params.get('doc') || localStorage.getItem('le-designer:last') || state.docs[0]?.name;
  if (name && state.docs.some((d) => d.name === name)) await openDoc(name);
  else if (!state.docs.length) {
    const { SAMPLE_DSL } = await import('./sample.js');
    await createDoc('untitled', SAMPLE_DSL);
  }
}

export async function refreshDocs() {
  try { setState({ docs: await state.backend.list() }); } catch { /* ignore */ }
  await refreshLibraries();
}
export async function refreshLibraries() {
  try { setState({ libraries: await state.backend.libs() }); } catch { /* ignore */ }
}

async function loadLinkedLibs(doc) {
  const names = doc?.libraries || [];
  const libs = {};
  for (const n of names) { try { libs[n] = state.libs[n] && state.libs[n].name === n ? state.libs[n] : await state.backend.getLib(n); } catch { /* missing */ } }
  setState({ libs });
}

export async function openDoc(name) {
  await saveNow();
  const doc = await state.backend.get(name);
  localStorage.setItem('le-designer:last', name);
  history.replaceState(null, '', `?doc=${encodeURIComponent(name)}`);
  setState({ doc, docName: name, pageId: doc.children?.[0]?.id || null, selection: [], hoverId: null, editingId: null, history: [], future: [], dirty: false, status: `Opened ${name}` });
  await loadLinkedLibs(doc);
  requestAnimationFrame(() => requestAnimationFrame(() => zoomToFit()));
}

export async function createDoc(name, dsl = '', libraries = []) {
  const doc = await state.backend.create(name, dsl);
  if (libraries.length) await state.backend.link(name, { libraries });
  await refreshDocs();
  await openDoc(name);
  return doc;
}

export async function deleteDoc(name) {
  await state.backend.remove(name);
  if (state.docName === name) setState({ doc: null, docName: null, selection: [] });
  await refreshDocs();
}

/** Link/unlink libraries on the open document. */
export async function setLinkedLibraries(libraries) {
  const { backend, docName, doc } = state;
  await saveNow();
  await backend.link(docName, { libraries });
  const next = { ...doc, libraries };
  setState({ doc: next, dirty: false });
  await loadLinkedLibs(next);
}

export function replaceDoc(doc, label = 'Replace document') {
  setState((s) => ({ doc, history: [...s.history, s.doc].slice(-HISTORY_LIMIT), future: [], dirty: true, status: label }));
  pruneSelection();
  scheduleSave();
}

// --------------------------------------------------------------------------- copy-on-write

function flattenOps(ops) {
  const out = [];
  const visit = (op) => { if (!op) return; if (op.op === 'batch') (op.ops || []).forEach(visit); else out.push(op); };
  (Array.isArray(ops) ? ops : [ops]).forEach(visit);
  return out;
}

/** Ids of nodes an op list may mutate directly: targets, their parents, destination parents. */
function touchedIds(doc, ops) {
  const ids = new Set();
  for (const op of flattenOps(ops)) {
    for (const key of ['target', 'parent']) {
      if (op[key] === undefined) continue;
      let nodes = [];
      try { nodes = resolve(doc, op[key]); } catch { /* unknown selector: the op will throw later */ }
      for (const n of nodes) {
        ids.add(n.id);
        const p = getParent(doc, n.id); if (p) ids.add(p.id);
        if (op.op === 'unwrap') for (const c of n.children || []) ids.add(c.id);
      }
    }
  }
  return ids;
}

/** Copy the document along the paths to the touched nodes; everything else is shared by reference. */
function cowDoc(doc, touched) {
  const rec = (node) => {
    let copy = null;
    if (touched.has(node.id)) {
      const { children, ...rest } = node;
      copy = clone(rest);
      if (children) copy.children = children.map(rec);
      return copy;
    }
    if (!node.children) return node;
    let changed = false;
    const kids = node.children.map((c) => { const r = rec(c); if (r !== c) changed = true; return r; });
    return changed ? { ...node, children: kids } : node;
  };
  let out = rec(doc);
  if (out === doc) out = { ...doc, children: [...doc.children] };
  out.meta = { ...(doc.meta || { seq: 1 }) };
  return out;
}

// --------------------------------------------------------------------------- mutations

let txSnapshot = null; // snapshot of the doc before a transient interaction (drag/resize)

/** Apply ops to the current document. opts.transient groups many calls (e.g. a drag) into one undo step. */
export function apply(ops, opts = {}) {
  const { doc } = state;
  if (!doc) return null;
  const next = cowDoc(doc, touchedIds(doc, ops));
  try {
    const result = applyOps(next, ops, next, { libs: linkedLibs(), tokens: getIndex().tokens });
    if (opts.transient) {
      if (!txSnapshot) txSnapshot = doc;
      setState({ doc: next, dirty: true });
    } else {
      const base = txSnapshot || doc;
      txSnapshot = null;
      setState((s) => ({ doc: next, history: [...s.history, base].slice(-HISTORY_LIMIT), future: [], dirty: true, status: opts.label || '' }));
      scheduleSave();
    }
    return result;
  } catch (e) {
    setState({ status: 'Error: ' + e.message });
    console.error(e);
    return null;
  }
}

/** Finish a transient interaction: push one undo step and save. */
export function commit(label) {
  if (!txSnapshot) return;
  const base = txSnapshot;
  txSnapshot = null;
  setState((s) => ({ history: [...s.history, base].slice(-HISTORY_LIMIT), future: [], status: label || '' }));
  scheduleSave();
}

export function undo() {
  setState((s) => {
    if (!s.history.length) return {};
    const prev = s.history[s.history.length - 1];
    return { doc: prev, history: s.history.slice(0, -1), future: [s.doc, ...s.future], dirty: true, status: 'Undo' };
  });
  pruneSelection();
  scheduleSave();
}
export function redo() {
  setState((s) => {
    if (!s.future.length) return {};
    const [next, ...rest] = s.future;
    return { doc: next, history: [...s.history, s.doc], future: rest, dirty: true, status: 'Redo' };
  });
  pruneSelection();
  scheduleSave();
}

export function pruneSelection() {
  const { doc, selection, pageId } = state;
  if (!doc) return;
  const sel = selection.filter((id) => findById(doc, id));
  const page = doc.children.find((p) => p.id === pageId) ? pageId : doc.children[0]?.id;
  if (sel.length !== selection.length || page !== pageId) setState({ selection: sel, pageId: page });
}

/** Set raw properties on all selected nodes (deep-merged; null deletes). */
export function setProps(props, opts) {
  if (!state.selection.length) return;
  return apply({ op: 'set', target: state.selection.map((id) => '#' + id), props, all: true }, opts);
}
export function setDsl(dsl, opts) {
  if (!state.selection.length) return;
  return apply({ op: 'set', target: state.selection.map((id) => '#' + id), dsl, all: true }, opts);
}

// --------------------------------------------------------------------------- selection & view

/** Ids inside expanded instances look like "inst::child"; selection always targets the outermost instance. */
export function ownId(id) { return id ? String(id).split('::')[0] : id; }

export function select(ids, { add = false, toggle = false } = {}) {
  ids = (Array.isArray(ids) ? ids : ids ? [ids] : []).map(ownId);
  setState((s) => {
    if (toggle) {
      const set = new Set(s.selection);
      for (const id of ids) set.has(id) ? set.delete(id) : set.add(id);
      return { selection: [...set], editingId: null };
    }
    if (add) return { selection: [...new Set([...s.selection, ...ids])], editingId: null };
    return { selection: ids, editingId: s.editingId && ids.includes(s.editingId) ? s.editingId : null };
  });
}

export function selectedNodes() {
  const { doc, selection } = state;
  if (!doc) return [];
  return selection.map((id) => findById(doc, id)?.node).filter(Boolean);
}

export function currentPage() {
  const { doc, pageId } = state;
  if (!doc) return null;
  return doc.children.find((p) => p.id === pageId) || doc.children[0] || null;
}

export function setPage(id) { setState({ pageId: id, selection: [], editingId: null }); requestAnimationFrame(() => requestAnimationFrame(() => zoomToFit())); }

/** World-space bounds of a top-level frame (measured DOM size when available). */
export const measured = new Map(); // id -> { x, y, w, h } in world units (updated by Canvas)
export function boundsOf(node) {
  const m = measured.get(node.id);
  return { x: node.x || 0, y: node.y || 0, w: m?.w ?? node.width ?? 100, h: m?.h ?? node.height ?? 100 };
}

export function zoomToFit(padding = 60, nodes) {
  const page = currentPage();
  const el = document.querySelector('.canvas');
  if (!page || !el) return;
  const kids = nodes || page.children || [];
  const cr = el.getBoundingClientRect();
  if (!kids.length) { setView({ zoom: 1, pan: { x: padding, y: padding } }, { commit: 'now' }); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of kids) {
    const b = boundsOf(k);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const z = Math.min(2, Math.max(0.02, Math.min((cr.width - padding * 2) / w, (cr.height - padding * 2) / h)));
  setView({ zoom: z, pan: { x: (cr.width - w * z) / 2 - minX * z, y: (cr.height - h * z) / 2 - minY * z } }, { commit: 'now' });
}

export function zoomBy(factor, center) {
  const z = Math.min(16, Math.max(0.02, viewRef.zoom * factor));
  const el = document.querySelector('.canvas');
  const c = center || (el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 });
  const pan = { x: c.x - ((c.x - viewRef.pan.x) * z) / viewRef.zoom, y: c.y - ((c.y - viewRef.pan.y) * z) / viewRef.zoom };
  setView({ zoom: z, pan });
}

export function setTool(tool) { setState({ tool, editingId: null }); }

export function parentAllowsFreeMove(doc, id) {
  const parent = getParent(doc, id);
  const node = findById(doc, id)?.node;
  return !parent || !hasAutoLayout(parent) || node?.layoutPositioning === 'ABSOLUTE';
}

export { findById, pathTo, getParent, walk, hasAutoLayout };
