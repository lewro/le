// Batch operations on a document. Used by the ops API, the CLI and the editor store.
//
//   { op: 'set',       target: sel, props: {...raw node fields}, dsl: 'p=16 gap=8' }
//   { op: 'add',       parent: sel, index?: n, dsl: '...' | node: {...} | nodes: [...] }
//   { op: 'replace',   target: sel, dsl: '...' | node: {...} }       // keeps the target id
//   { op: 'remove',    target: sel }
//   { op: 'move',      target: sel, parent: sel, index?: n }          // index omitted = append; negative counts from end
//   { op: 'duplicate', target: sel }
//   { op: 'rename',    target: sel, name: '...' }
//   { op: 'reorder',   target: sel, index: n }                        // within the same parent
//   { op: 'text',      target: sel, characters: '...' }
//   { op: 'wrap',      target: sel, dsl: 'frame Card col p=16' }     // wrap target(s) in a new frame
//   { op: 'unwrap',    target: sel }                                  // replace frame with its children
// Every op accepts "all: true" to apply to every match of the selector (default: first match only for
// structural ops, every match for 'set'/'rename'/'text').
// Returns { changed: [ids...], created: [ids...] }.

import { findById, resolve, cloneWithNewIds, assignIds, nextId, walk, clone, hasAutoLayout, sizingH, sizingV } from './model.js';
import { parseDsl, applyShorthandString, finishNode, setTokenContext } from './dsl.js';
import { buildIndex, detachInstance } from './components.js';

function nodesFromOp(doc, op, keepId) {
  let nodes;
  if (op.dsl !== undefined) nodes = parseDsl(op.dsl);
  else if (op.nodes) nodes = clone(op.nodes);
  else if (op.node) nodes = [clone(op.node)];
  else throw new Error(`op "${op.op}" needs dsl, node or nodes`);
  // a single replacement root without an explicit id inherits the replaced node's id
  if (keepId && nodes.length === 1 && (!nodes[0].id || op.dsl === undefined)) nodes[0].id = keepId;
  nodes.forEach((n) => assignIds(doc, n));
  return nodes;
}

function targets(doc, op, scope, defaultAll) {
  const key = op.target !== undefined ? 'target' : 'parent';
  const found = resolve(doc, op[key], scope);
  if (!found.length) throw new Error(`Selector not found: ${JSON.stringify(op[key])}`);
  const all = op.all !== undefined ? op.all : defaultAll;
  return all ? found : [found[0]];
}

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepMerge(target[k], v);
    else if (v === null || v === undefined) delete target[k];
    else target[k] = v;
  }
}

function insertAt(parent, node, index) {
  if (!parent.children) parent.children = [];
  const len = parent.children.length;
  let i = index === undefined || index === null ? len : index;
  if (i < 0) i = Math.max(0, len + 1 + i);
  if (i > len) i = len;
  parent.children.splice(i, 0, node);
  return i;
}

/**
 * Apply one or more ops in place. Throws on the first error (callers clone first if they need atomicity).
 * ctx.libs: linked library documents (needed for 'detach' and $token resolution).
 */
export function applyOps(doc, ops, scope = doc, ctx = {}) {
  const result = { changed: [], created: [] };
  const list = Array.isArray(ops) ? ops : [ops];
  const libs = ctx.libs || [];
  setTokenContext(ctx.tokens || buildIndex(doc, libs).tokens);
  for (const op of list) applyOp(doc, op, scope, result, libs);
  return result;
}

function applyOp(doc, op, scope, result, libs) {
  if (!op || !op.op) throw new Error('Operation missing "op"');
  switch (op.op) {
    case 'batch': return (op.ops || []).forEach((o) => applyOp(doc, o, scope, result, libs));
    case 'detach': {
      const index = buildIndex(doc, libs);
      for (const n of targets(doc, op, scope, false)) {
        if (n.type !== 'INSTANCE') throw new Error(`"${n.name}" is not an instance`);
        const f = findById(doc, n.id);
        const frame = detachInstance(index, n, () => nextId(doc));
        f.parent.children.splice(f.index, 1, frame);
        result.changed.push(f.parent.id); result.created.push(frame.id);
      }
      return;
    }
    case 'component': {
      // turn a frame into a COMPONENT (optionally named); keeps id and children
      for (const n of targets(doc, op, scope, false)) {
        if (!n.children) throw new Error(`"${n.name}" cannot become a component`);
        n.type = 'COMPONENT';
        if (op.name) n.name = op.name;
        if (op.description) n.description = op.description;
        result.changed.push(n.id);
      }
      return;
    }
    case 'swap': {
      // swap the component of an instance (and optionally its variant)
      for (const n of targets(doc, op, scope, true)) {
        if (n.type !== 'INSTANCE') throw new Error(`"${n.name}" is not an instance`);
        if (op.component) { n.component = op.component; delete n.componentId; delete n.componentKey; }
        if (op.variant) n.variant = { ...(n.variant || {}), ...op.variant };
        if (op.resetOverrides) delete n.overrides;
        result.changed.push(n.id);
      }
      return;
    }
    case 'set': {
      for (const n of targets(doc, op, scope, true)) {
        if (op.props) deepMerge(n, op.props);
        if (op.dsl) { applyShorthandString(n, op.dsl); }
        result.changed.push(n.id);
      }
      return;
    }
    case 'rename': {
      for (const n of targets(doc, op, scope, true)) { n.name = op.name; result.changed.push(n.id); }
      return;
    }
    case 'text': {
      for (const n of targets(doc, op, scope, true)) {
        if (n.type !== 'TEXT') throw new Error(`"${n.name}" is not a text node`);
        n.characters = String(op.characters ?? op.text ?? '');
        result.changed.push(n.id);
      }
      return;
    }
    case 'add': {
      const parents = targets(doc, op, scope, false);
      const nodes = nodesFromOp(doc, op);
      for (const parent of parents) {
        if (!parent.children) throw new Error(`"${parent.name}" (${parent.type}) cannot have children`);
        let i = op.index;
        for (const n of nodes) {
          const copy = parents.length > 1 ? cloneWithNewIds(doc, n) : n;
          const at = insertAt(parent, copy, i);
          if (i !== undefined && i !== null) i = at + 1;
          walk(copy, (x) => result.created.push(x.id));
        }
        result.changed.push(parent.id);
      }
      return;
    }
    case 'replace': {
      const [t] = targets(doc, op, scope, false);
      const f = findById(doc, t.id);
      if (!f.parent) throw new Error('Cannot replace the document root');
      const nodes = nodesFromOp(doc, op, t.id);
      f.parent.children.splice(f.index, 1, ...nodes);
      nodes.forEach((n) => walk(n, (x) => result.created.push(x.id)));
      result.changed.push(f.parent.id);
      return;
    }
    case 'remove': {
      for (const n of targets(doc, op, scope, true)) {
        const f = findById(doc, n.id);
        if (!f || !f.parent) continue;
        f.parent.children.splice(f.index, 1);
        result.changed.push(f.parent.id);
      }
      return;
    }
    case 'move': {
      const nodes = targets(doc, op, scope, false);
      const parent = resolve(doc, op.parent, scope)[0];
      if (!parent) throw new Error(`Parent not found: ${op.parent}`);
      if (!parent.children) throw new Error(`"${parent.name}" cannot have children`);
      let i = op.index;
      for (const n of nodes) {
        const f = findById(doc, n.id);
        if (findById(n, parent.id)) throw new Error('Cannot move a node into itself');
        f.parent.children.splice(f.index, 1);
        if (f.parent === parent && i !== undefined && i !== null && i > f.index) i -= 1;
        const at = insertAt(parent, n, i);
        if (i !== undefined && i !== null) i = at + 1;
        result.changed.push(n.id, parent.id);
      }
      return;
    }
    case 'reorder': {
      for (const n of targets(doc, op, scope, false)) {
        const f = findById(doc, n.id);
        f.parent.children.splice(f.index, 1);
        insertAt(f.parent, n, op.index);
        result.changed.push(f.parent.id);
      }
      return;
    }
    case 'duplicate': {
      for (const n of targets(doc, op, scope, false)) {
        const f = findById(doc, n.id);
        const copy = cloneWithNewIds(doc, n);
        if (!hasAutoLayout(f.parent)) { copy.x = (copy.x || 0) + (op.dx ?? 0); copy.y = (copy.y || 0) + (op.dy ?? 0); }
        f.parent.children.splice(f.index + 1, 0, copy);
        walk(copy, (x) => result.created.push(x.id));
        result.changed.push(f.parent.id);
      }
      return;
    }
    case 'wrap': {
      const nodes = targets(doc, op, scope, true);
      const first = findById(doc, nodes[0].id);
      const wrapper = nodesFromOp(doc, { ...op, op: 'wrap', dsl: op.dsl ?? 'frame Wrapper col bg=none' })[0];
      if (!wrapper.children) wrapper.children = [];
      if (!hasAutoLayout(first.parent)) {
        const minX = Math.min(...nodes.map((n) => n.x || 0)), minY = Math.min(...nodes.map((n) => n.y || 0));
        wrapper.x = minX; wrapper.y = minY;
        if (!hasAutoLayout(wrapper)) {
          wrapper.width = Math.max(...nodes.map((n) => (n.x || 0) + (n.width || 0))) - minX;
          wrapper.height = Math.max(...nodes.map((n) => (n.y || 0) + (n.height || 0))) - minY;
          nodes.forEach((n) => { n.x = (n.x || 0) - minX; n.y = (n.y || 0) - minY; });
        }
      }
      first.parent.children.splice(first.index, 0, wrapper);
      for (const n of nodes) {
        const f = findById(doc, n.id);
        f.parent.children.splice(f.index, 1);
        wrapper.children.push(n);
      }
      result.created.push(wrapper.id);
      result.changed.push(first.parent.id);
      return;
    }
    case 'unwrap': {
      for (const n of targets(doc, op, scope, false)) {
        const f = findById(doc, n.id);
        if (!f.parent || !n.children) continue;
        if (!hasAutoLayout(f.parent)) n.children.forEach((c) => { c.x = (c.x || 0) + (n.x || 0); c.y = (c.y || 0) + (n.y || 0); });
        f.parent.children.splice(f.index, 1, ...n.children);
        result.changed.push(f.parent.id);
      }
      return;
    }
    default:
      throw new Error(`Unknown op "${op.op}"`);
  }
}

/** Convenience: build an op list from a compact command array used by the CLI. */
export { nextId, sizingH, sizingV, finishNode };
