// Core document model. Framework-free; used by the editor UI, the CLI and the server.
//
// A document is a tree of nodes in a Figma-compatible shape:
//   DOCUMENT > CANVAS (page) > FRAME | GROUP | RECTANGLE | ELLIPSE | TEXT | LINE | COMPONENT | INSTANCE
// Differences from the Figma REST format (both are handled by core/figma.js):
//   - colors are hex strings ("#rrggbb" or "#rrggbbaa") instead of {r,g,b,a} floats
//   - x/y are relative to the parent instead of absoluteBoundingBox
//   - node.html = { tag, className, attrs } carries semantic HTML information
//   - default values are omitted to keep files small

export const FORMAT = 'le-design/1';

export const CONTAINER_TYPES = new Set([
  'DOCUMENT', 'CANVAS', 'FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION', 'BOOLEAN_OPERATION',
]);

export const TYPE_ALIASES = {
  frame: 'FRAME', group: 'GROUP', rect: 'RECTANGLE', rectangle: 'RECTANGLE', ellipse: 'ELLIPSE', circle: 'ELLIPSE',
  text: 'TEXT', line: 'LINE', component: 'COMPONENT', instance: 'INSTANCE', page: 'CANVAS', canvas: 'CANVAS',
  vector: 'VECTOR', section: 'SECTION', image: 'RECTANGLE', img: 'RECTANGLE', set: 'COMPONENT_SET', componentset: 'COMPONENT_SET',
  use: 'INSTANCE',
};

export const SHORT_TYPES = {
  FRAME: 'frame', GROUP: 'group', RECTANGLE: 'rect', ELLIPSE: 'ellipse', TEXT: 'text', LINE: 'line',
  COMPONENT: 'component', INSTANCE: 'instance', CANVAS: 'page', VECTOR: 'vector', SECTION: 'section',
  COMPONENT_SET: 'set', BOOLEAN_OPERATION: 'group', DOCUMENT: 'document',
};

export function normalizeType(t) {
  if (!t) return 'FRAME';
  const up = String(t).toUpperCase();
  if (SHORT_TYPES[up]) return up;
  return TYPE_ALIASES[String(t).toLowerCase()] || up;
}

export function isContainer(node) {
  return CONTAINER_TYPES.has(node.type);
}

export function hasAutoLayout(node) {
  return !!node && node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
}

/** Default text style (Figma "style" object). */
export const DEFAULT_TEXT_STYLE = {
  fontFamily: 'Inter', fontWeight: 400, fontSize: 16, textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP',
};

export function createDocument(name = 'Untitled') {
  return {
    format: FORMAT,
    name,
    meta: { seq: 1 },
    type: 'DOCUMENT',
    id: '0:0',
    children: [{ id: 'page1', type: 'CANVAS', name: 'Page 1', children: [] }],
  };
}

/** Allocate a new unique short id, e.g. "n12". */
export function nextId(doc) {
  if (!doc.meta) doc.meta = { seq: 1 };
  const ids = collectIds(doc);
  let id;
  do { id = 'n' + (doc.meta.seq++).toString(36); } while (ids.has(id));
  return id;
}

export function collectIds(node, set = new Set()) {
  if (node.id) set.add(node.id);
  if (node.children) for (const c of node.children) collectIds(c, set);
  return set;
}

/** Create a node of the given type with sensible defaults (Figma-like). */
export function createNode(type, props = {}) {
  type = normalizeType(type);
  const base = { id: props.id, name: props.name, type };
  let node;
  switch (type) {
    case 'CANVAS':
      node = { ...base, name: props.name || 'Page', children: [] };
      break;
    case 'TEXT':
      node = {
        ...base, name: props.name || props.characters || 'Text',
        characters: props.characters ?? 'Text',
        style: { ...DEFAULT_TEXT_STYLE },
        fills: [{ type: 'SOLID', color: '#000000' }],
        layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
        x: 0, y: 0, width: 100, height: 20,
      };
      break;
    case 'RECTANGLE':
      node = { ...base, name: props.name || 'Rectangle', x: 0, y: 0, width: 100, height: 100, fills: [{ type: 'SOLID', color: '#d9d9d9' }] };
      break;
    case 'ELLIPSE':
      node = { ...base, name: props.name || 'Ellipse', x: 0, y: 0, width: 100, height: 100, fills: [{ type: 'SOLID', color: '#d9d9d9' }] };
      break;
    case 'LINE':
      node = { ...base, name: props.name || 'Line', x: 0, y: 0, width: 100, height: 0, strokes: [{ type: 'SOLID', color: '#000000' }], strokeWeight: 1 };
      break;
    case 'GROUP':
      node = { ...base, name: props.name || 'Group', x: 0, y: 0, width: 100, height: 100, children: [] };
      break;
    case 'INSTANCE':
      node = { ...base, name: props.name || props.component || 'Instance', component: props.component, x: 0, y: 0 };
      break;
    case 'COMPONENT_SET':
      node = {
        ...base, name: props.name || 'Component set', x: 0, y: 0, children: [],
        layoutMode: 'HORIZONTAL', layoutWrap: 'WRAP', itemSpacing: 24, counterAxisSpacing: 24, paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24,
        layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', fills: [], strokes: [{ type: 'SOLID', color: '#9747ff' }], strokeWeight: 1, clipsContent: false,
      };
      break;
    default: // FRAME, COMPONENT, INSTANCE, SECTION ...
      node = {
        ...base, name: props.name || (type === 'FRAME' ? 'Frame' : type[0] + type.slice(1).toLowerCase()),
        x: 0, y: 0, width: 100, height: 100,
        fills: [{ type: 'SOLID', color: '#ffffff' }], clipsContent: true, children: [],
      };
  }
  const { id, name, ...rest } = props;
  Object.assign(node, rest);
  if (type === 'INSTANCE' && node.component === undefined) delete node.component;
  if (rest.style && type === 'TEXT') node.style = { ...DEFAULT_TEXT_STYLE, ...rest.style };
  if (node.children === undefined && isContainer(node) && type !== 'INSTANCE') node.children = [];
  return node;
}

/** Depth-first walk. fn(node, parent, index, depth) — return false to skip children. */
export function walk(node, fn, parent = null, index = 0, depth = 0) {
  if (fn(node, parent, index, depth) === false) return;
  if (node.children) node.children.forEach((c, i) => walk(c, fn, node, i, depth + 1));
}

/** Find a node by id. Returns { node, parent, index, path } or null. */
export function findById(root, id) {
  let found = null;
  const stack = [];
  (function rec(node, parent, index) {
    if (found) return;
    if (node.id === id) { found = { node, parent, index, path: [...stack, node] }; return; }
    if (node.children) {
      stack.push(node);
      node.children.forEach((c, i) => rec(c, node, i));
      stack.pop();
    }
  })(root, null, 0);
  return found;
}

export function getNode(root, id) { return findById(root, id)?.node || null; }
export function getParent(root, id) { return findById(root, id)?.parent || null; }

/** Ancestors from root to node (inclusive of node). */
export function pathTo(root, id) { return findById(root, id)?.path || []; }

export function pageOf(root, id) {
  const p = pathTo(root, id);
  return p.find((n) => n.type === 'CANVAS') || null;
}

export function isAncestor(root, ancestorId, id) {
  return pathTo(root, id).some((n) => n.id === ancestorId);
}

/** Absolute position of a node in page coordinates (ignores rotation). */
export function absolutePosition(root, id) {
  const p = pathTo(root, id);
  let x = 0, y = 0;
  for (const n of p) { if (n.type === 'CANVAS' || n.type === 'DOCUMENT') continue; x += n.x || 0; y += n.y || 0; }
  return { x, y };
}

export function clone(obj) {
  return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

/** Deep-clone a subtree assigning fresh ids. */
export function cloneWithNewIds(doc, node) {
  const copy = clone(node);
  walk(copy, (n) => { n.id = nextId(doc); });
  return copy;
}

/** Ensure every node has a unique id. */
export function assignIds(doc, node = doc) {
  const seen = new Set();
  walk(node, (n) => {
    if (!n.id || seen.has(n.id)) n.id = nextId(doc);
    seen.add(n.id);
  });
  return node;
}

// ---------------------------------------------------------------------------
// Selectors
//
//   "#n12"              exact id (the "#" is optional when the id exists)
//   "Header/Nav/Home"   name path; each segment matches any descendant of the previous match
//   "Header/@TEXT"      "@TYPE" matches by type
//   "Card[1]"           nth match (0-based)
//   "*"                 any node
//   "/Page 1/Header"    leading slash: start at the document root instead of the scope
//   "Header/Nav/*"      all children matching the last segment
// resolve() returns ALL matches of the final segment; callers typically take the first.
// ---------------------------------------------------------------------------

function parseSegment(seg) {
  const m = /^(.*?)(?:\[(\d+)\])?$/.exec(seg.trim());
  let pattern = m[1];
  const nth = m[2] !== undefined ? parseInt(m[2], 10) : null;
  let type = null;
  const star = pattern === '*'; // a literal "*" after a slash means direct children; "@TYPE" matches any descendant
  if (pattern.startsWith('@')) { type = normalizeType(pattern.slice(1)); pattern = '*'; }
  return { name: pattern, type, nth, star };
}

function segmentMatches(node, seg) {
  if (seg.type && node.type !== seg.type) return false;
  if (seg.name === '*') return true;
  if (node.name === seg.name) return true;
  if (node.type === 'TEXT' && node.characters === seg.name) return true;
  return false;
}

function descendantsMatching(node, seg, direct) {
  const out = [];
  if (!node.children) return out;
  if (direct) {
    for (const c of node.children) if (segmentMatches(c, seg)) out.push(c);
    return out;
  }
  walk(node, (n) => { if (n !== node && segmentMatches(n, seg)) out.push(n); });
  return out;
}

/**
 * Resolve a selector to an array of nodes.
 * @param {object} root document root
 * @param {string|string[]|object} selector
 * @param {object} [scope] node to search within (defaults to root)
 */
export function resolve(root, selector, scope = root) {
  if (!selector) return [];
  if (Array.isArray(selector)) return selector.flatMap((s) => resolve(root, s, scope));
  if (typeof selector === 'object') return selector.id ? [getNode(root, selector.id)].filter(Boolean) : [];
  let sel = String(selector).trim();
  if (sel.startsWith('#')) {
    const n = getNode(root, sel.slice(1));
    return n ? [n] : [];
  }
  const byId = getNode(root, sel);
  if (byId) return [byId];
  let start = scope;
  if (sel.startsWith('/')) { start = root; sel = sel.slice(1); }
  const segments = sel.split('/').filter(Boolean).map(parseSegment);
  let current = [start];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const direct = i > 0 && seg.star;
    let next = [];
    for (const n of current) next.push(...descendantsMatching(n, seg, direct));
    // dedupe while keeping order
    next = [...new Set(next)];
    if (seg.nth !== null) next = next[seg.nth] ? [next[seg.nth]] : [];
    current = next;
    if (!current.length) break;
  }
  return current;
}

export function resolveOne(root, selector, scope) {
  const r = resolve(root, selector, scope);
  if (!r.length) throw new Error(`Selector not found: ${JSON.stringify(selector)}`);
  return r[0];
}

// ---------------------------------------------------------------------------
// Sizing helpers
// ---------------------------------------------------------------------------

export function sizingH(node) {
  if (node.layoutSizingHorizontal) return node.layoutSizingHorizontal;
  return node.type === 'TEXT' ? 'HUG' : 'FIXED';
}
export function sizingV(node) {
  if (node.layoutSizingVertical) return node.layoutSizingVertical;
  return node.type === 'TEXT' ? 'HUG' : 'FIXED';
}

/** Summarize a node in one line (used by outline output). */
export function describe(node) {
  const parts = [SHORT_TYPES[node.type] || node.type.toLowerCase(), JSON.stringify(node.name || '')];
  if (node.type === 'TEXT') parts.push(JSON.stringify((node.characters || '').slice(0, 40)));
  return parts.join(' ');
}
