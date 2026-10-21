// Minimal external store (useSyncExternalStore). All document mutations go through apply(ops),
// which keeps undo/redo history and debounces saves to the backend.

import { useSyncExternalStore } from 'react';
import { applyOps } from '../core/ops.js';
import { clone, findById, pathTo, getParent, walk, hasAutoLayout } from '../core/model.js';
import { getBackend, clientId } from './api.js';

const HISTORY_LIMIT = 200;

let state = {
  backend: null,
  docs: [],
  docName: null,
  doc: null,
  pageId: null,
  selection: [],
  hoverId: null,
  editingId: null,
  tool: 'select',
  zoom: 1,
  pan: { x: 0, y: 0 },
  history: [],
  future: [],
  dirty: false,
  saving: false,
  status: '',
  rightTab: 'design',
  dialog: null,
  dragPreview: null, // { parentId, index } while reordering inside auto-layout
};

const listeners = new Set();
function emit() { for (const l of listeners) l(); }
export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  emit();
}
export function getState() { return state; }
export function useStore(selector = (s) => s) {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => selector(state), () => selector(state));
}

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
  if (!backend || !doc || !docName) return;
  setState({ saving: true });
  try { await backend.put(docName, doc); lastSaveTime = Date.now(); setState({ saving: false, dirty: false, status: 'Saved' }); }
  catch (e) { setState({ saving: false, status: 'Save failed: ' + e.message }); }
}

export async function init() {
  const backend = await getBackend();
  setState({ backend });
  await refreshDocs();
  backend.events(async (ev) => {
    if (ev.type !== 'changed') return;
    await refreshDocs();
    if (ev.doc === state.docName && ev.writer !== clientId) {
      if (!ev.exists) return;
      if (state.dirty || Date.now() - lastSaveTime < 300) return; // our own write in flight
      const doc = await backend.get(ev.doc);
      setState({ doc, status: 'Reloaded from disk', history: [...state.history, state.doc].slice(-HISTORY_LIMIT), future: [] });
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
}

export async function openDoc(name) {
  await saveNow();
  const doc = await state.backend.get(name);
  localStorage.setItem('le-designer:last', name);
  history.replaceState(null, '', `?doc=${encodeURIComponent(name)}`);
  setState({ doc, docName: name, pageId: doc.children?.[0]?.id || null, selection: [], hoverId: null, editingId: null, history: [], future: [], dirty: false, status: `Opened ${name}` });
  requestAnimationFrame(() => zoomToFit());
}

export async function createDoc(name, dsl = '') {
  const doc = await state.backend.create(name, dsl);
  await refreshDocs();
  await openDoc(name);
  return doc;
}

export async function deleteDoc(name) {
  await state.backend.remove(name);
  if (state.docName === name) setState({ doc: null, docName: null, selection: [] });
  await refreshDocs();
}

export function replaceDoc(doc, label = 'Replace document') {
  setState((s) => ({ doc, history: [...s.history, s.doc].slice(-HISTORY_LIMIT), future: [], dirty: true, status: label }));
  pruneSelection();
  scheduleSave();
}

// --------------------------------------------------------------------------- mutations

let txSnapshot = null; // snapshot of the doc before a transient interaction (drag/resize)

/** Apply ops to the current document. opts.transient groups many calls (e.g. a drag) into one undo step. */
export function apply(ops, opts = {}) {
  const { doc } = state;
  if (!doc) return null;
  const next = clone(doc);
  try {
    const result = applyOps(next, ops, next);
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

export function select(ids, { add = false, toggle = false } = {}) {
  ids = Array.isArray(ids) ? ids : ids ? [ids] : [];
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

export function setPage(id) { setState({ pageId: id, selection: [], editingId: null }); requestAnimationFrame(() => zoomToFit()); }

export function zoomToFit(padding = 60) {
  const page = currentPage();
  const el = document.querySelector('.canvas');
  if (!page || !el) return;
  const kids = page.children || [];
  if (!kids.length) { setState({ zoom: 1, pan: { x: padding, y: padding } }); return; }
  // Use DOM rects for accurate hugged sizes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const { zoom, pan } = state;
  const cr = el.getBoundingClientRect();
  for (const k of kids) {
    const d = el.querySelector(`[data-id="${CSS.escape(k.id)}"]`);
    const r = d ? d.getBoundingClientRect() : null;
    const x = r ? (r.left - cr.left - pan.x) / zoom : k.x || 0, y = r ? (r.top - cr.top - pan.y) / zoom : k.y || 0;
    const w = r ? r.width / zoom : k.width || 100, h = r ? r.height / zoom : k.height || 100;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  const w = maxX - minX, h = maxY - minY;
  const z = Math.min(2, Math.max(0.05, Math.min((cr.width - padding * 2) / w, (cr.height - padding * 2) / h)));
  setState({ zoom: z, pan: { x: (cr.width - w * z) / 2 - minX * z, y: (cr.height - h * z) / 2 - minY * z } });
}

export function zoomBy(factor, center) {
  setState((s) => {
    const z = Math.min(8, Math.max(0.05, s.zoom * factor));
    const c = center || { x: 0, y: 0 };
    const pan = { x: c.x - ((c.x - s.pan.x) * z) / s.zoom, y: c.y - ((c.y - s.pan.y) * z) / s.zoom };
    return { zoom: z, pan };
  });
}

export function setTool(tool) { setState({ tool, editingId: null }); }

// --------------------------------------------------------------------------- helpers used by panels

export function parentAllowsFreeMove(doc, id) {
  const parent = getParent(doc, id);
  const node = findById(doc, id)?.node;
  return !parent || !hasAutoLayout(parent) || node?.layoutPositioning === 'ABSOLUTE';
}

export { findById, pathTo, getParent, walk, hasAutoLayout };
