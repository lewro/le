// Components, component sets (variants), instances, overrides and design tokens.
//
// COMPONENT      a reusable node subtree. Lives anywhere in a document or library.
// COMPONENT_SET  a group of COMPONENT variants named "Prop=Value, Prop2=Value".
// INSTANCE       { type: 'INSTANCE', component: 'Button', componentId?, variant?: { Type: 'Primary' },
//                  overrides?: { '<selector>': { characters, fills, visible, ... } } }
//                Rendering/export expands an instance into the component subtree with overrides applied.
// Tokens         doc.tokens = { colors: { 'Primary/500': '#2563eb' }, textStyles: { 'Heading/H1': {...} }, effects: {...} }
//                DSL references them as bg=$Primary/500, ts=Heading/H1, effect=Card.

import { walk, clone, resolve, hasAutoLayout, findById } from './model.js';

export const INSTANCE_OWN_KEYS = [
  'id', 'name', 'type', 'component', 'componentId', 'componentKey', 'variant', 'overrides', 'x', 'y', 'width', 'height', 'rotation',
  'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutPositioning', 'layoutGrow', 'layoutAlign', 'opacity', 'visible', 'locked', 'html',
];

/** "Type=Primary, Size=Large" -> { Type: 'Primary', Size: 'Large' } */
export function parseVariantName(name) {
  const out = {};
  for (const part of String(name || '').split(',')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function variantName(props) {
  return Object.entries(props || {}).map(([k, v]) => `${k}=${v}`).join(', ');
}

function lower(s) { return String(s || '').toLowerCase(); }

/**
 * Build an index of every component reachable from a document and its linked libraries.
 * Returns { byId, byName (lowercase), list, tokens }.
 */
export function buildIndex(doc, libs = []) {
  const byId = new Map();
  const byName = new Map();
  const list = [];
  const tokens = { colors: {}, textStyles: {}, effects: {} };
  const sources = [...libs.map((l) => ({ doc: l, lib: l.name })), { doc, lib: null }];
  for (const { doc: d, lib } of sources) {
    if (!d) continue;
    for (const k of Object.keys(tokens)) Object.assign(tokens[k], d.tokens?.[k] || {});
    walk(d, (n, parent) => {
      if (n.type === 'COMPONENT_SET') {
        const variants = {};
        for (const c of n.children || []) for (const [p, v] of Object.entries(parseVariantName(c.name))) (variants[p] ||= new Set()).add(v);
        const entry = { id: n.id, name: n.name, type: 'COMPONENT_SET', node: n, lib, variants: Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, [...v]])), textSlots: textSlots(n.children?.[0]), description: n.description };
        byId.set(n.id, entry);
        if (!byName.has(lower(n.name)) || lib === null) byName.set(lower(n.name), entry);
        list.push(entry);
        for (const c of n.children || []) byId.set(c.id, { id: c.id, name: c.name, type: 'COMPONENT', node: c, lib, set: entry, textSlots: textSlots(c) });
        return false;
      }
      if (n.type === 'COMPONENT' && parent?.type !== 'COMPONENT_SET') {
        const entry = { id: n.id, name: n.name, type: 'COMPONENT', node: n, lib, textSlots: textSlots(n), description: n.description };
        byId.set(n.id, entry);
        if (!byName.has(lower(n.name)) || lib === null) byName.set(lower(n.name), entry);
        list.push(entry);
        return false;
      }
      return true;
    });
  }
  return { byId, byName, list, tokens };
}

/** Names of TEXT descendants of a component (what an instance can override with Name.text=...). */
export function textSlots(node) {
  const out = [];
  if (!node) return out;
  walk(node, (n) => { if (n.type === 'TEXT') out.push({ name: n.name, characters: n.characters }); if (n.type === 'INSTANCE') return false; });
  return out;
}

/** Find the component (entry) an instance points to, honoring variant props. Returns { entry, component } or null. */
export function resolveComponent(index, inst) {
  let entry = (inst.componentId && index.byId.get(inst.componentId)) || (inst.component && index.byName.get(lower(inst.component))) || null;
  if (!entry && inst.componentKey) entry = index.list.find((e) => e.node.key === inst.componentKey) || null;
  if (!entry) return null;
  if (entry.type === 'COMPONENT' && entry.set) {
    // id points at a specific variant; apply requested variant props on top of it
    return { entry: entry.set, component: pickVariant(entry.set, { ...parseVariantName(entry.name), ...(inst.variant || {}) }) };
  }
  if (entry.type === 'COMPONENT_SET') return { entry, component: pickVariant(entry, inst.variant || {}) };
  return { entry, component: entry.node };
}

export function pickVariant(setEntry, want) {
  const kids = setEntry.node.children || [];
  if (!kids.length) return null;
  const wantL = Object.fromEntries(Object.entries(want || {}).map(([k, v]) => [lower(k), lower(v)]));
  let best = null, bestScore = -1;
  for (const c of kids) {
    const props = parseVariantName(c.name);
    let score = 0, mismatch = false;
    for (const [k, v] of Object.entries(props)) {
      const w = wantL[lower(k)];
      if (w === undefined) continue;
      if (w === lower(v)) score += 2; else mismatch = true;
    }
    if (mismatch) score -= 10;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best || kids[0];
}

/** Apply shorthand/raw overrides to a node in an expanded subtree. */
function applyOverride(node, ov) {
  for (const [k, v] of Object.entries(ov)) {
    if (k === 'characters') node.characters = v;
    else if (k === 'style' && node.style) node.style = { ...node.style, ...v };
    else if (v === null) delete node[k];
    else node[k] = v;
  }
}

/**
 * Expand an instance into a renderable subtree. The result has the instance's id/name/type ('INSTANCE'),
 * the component's children with ids prefixed "<instanceId>::<childId>", and overrides applied.
 * Returns null when the component cannot be resolved (callers then fall back to inst.children).
 */
export function expandInstance(index, inst, depth = 0) {
  if (depth > 12) return null;
  const r = resolveComponent(index, inst);
  if (!r || !r.component) return null;
  const comp = r.component;
  const out = clone(comp);
  out.type = 'INSTANCE';
  out.expanded = true;
  out.id = inst.id;
  out.name = inst.name || comp.name;
  out.component = r.entry.name;
  out.componentId = comp.id;
  if (r.entry.type === 'COMPONENT_SET') out.variant = parseVariantName(comp.name);
  delete out.key; delete out.description; delete out.componentPropertyDefinitions;
  for (const k of ['x', 'y', 'width', 'height', 'rotation', 'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutPositioning', 'layoutGrow', 'layoutAlign', 'opacity', 'visible', 'locked', 'html']) {
    if (inst[k] !== undefined) out[k] = inst[k];
  }
  // allow geometry-neutral overrides on the instance root itself (fills, padding...) stored under overrides['.']
  const prefix = inst.id + '::';
  walk(out, (n, parent) => { if (parent) n.id = prefix + n.id; });
  for (const [sel, ov] of Object.entries(inst.overrides || {})) {
    const targets = sel === '.' ? [out] : resolve(out, sel, out);
    for (const t of targets) applyOverride(t, ov);
  }
  // expand nested instances
  const rec = (node) => {
    if (!node.children) return;
    node.children = node.children.map((c) => {
      if (c.type === 'INSTANCE' && !c.expanded) { const e = expandInstance(index, c, depth + 1); if (e) return e; }
      rec(c);
      return c;
    });
  };
  rec(out);
  return out;
}

/** Return a deep copy of the document where every resolvable instance is expanded (for exports). */
export function expandDocument(doc, libs = []) {
  const index = buildIndex(doc, libs);
  const out = clone(doc);
  const rec = (node) => {
    if (!node.children) return;
    node.children = node.children.map((c) => {
      if (c.type === 'INSTANCE' && !c.expanded) { const e = expandInstance(index, c); if (e) return e; }
      rec(c);
      return c;
    });
  };
  rec(out);
  return out;
}

/** Turn an instance into a plain frame with fresh ids (ops 'detach'). */
export function detachInstance(index, inst, nextId) {
  const e = expandInstance(index, inst);
  const node = e ? e : clone(inst);
  node.type = 'FRAME';
  delete node.component; delete node.componentId; delete node.componentKey; delete node.variant; delete node.overrides;
  walk(node, (n, parent) => { if (parent) n.id = nextId(); });
  return node;
}

/** Summaries for agents: one line per component. */
export function describeComponents(index) {
  return index.list.map((e) => {
    const parts = [e.name];
    if (e.type === 'COMPONENT_SET') parts.push('{' + Object.entries(e.variants).map(([k, v]) => `${k}=${v.join('|')}`).join(', ') + '}');
    const slots = e.textSlots || [];
    if (slots.length) parts.push('texts: ' + slots.map((s) => s.name).join(', '));
    if (e.lib) parts.push(`[${e.lib}]`);
    if (e.description) parts.push('— ' + e.description);
    return parts.join('  ');
  });
}

/**
 * Strict-library lint: everything on a page must be an instance of a library component, a text using a library
 * text style, or a plain layout frame (auto layout, no fill/stroke/effects unless they use tokens).
 * Returns an array of { id, name, type, reason }.
 */
export function lintStrict(doc, libs = [], index = buildIndex(doc, libs)) {
  const problems = [];
  const tokenColors = new Set(Object.values(index.tokens.colors || {}).map(lower));
  const okPaint = (p) => !p || p.visible === false || p.token || (p.type === 'SOLID' && tokenColors.has(lower(p.color)));
  for (const page of doc.children || []) walk(page, (n, parent) => {
    if (n === page) return true;
    if (n.type === 'INSTANCE') {
      if (!resolveComponent(index, n)) problems.push({ id: n.id, name: n.name, reason: `instance of unknown component "${n.component || n.componentId}"` });
      return false;
    }
    if (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') return false;
    if (n.type === 'TEXT') {
      if (!n.style?.token) problems.push({ id: n.id, name: n.name, reason: 'text without a library text style (use ts=Name)' });
      if (!(n.fills || []).every(okPaint)) problems.push({ id: n.id, name: n.name, reason: 'text color is not a token (use color=$Name)' });
      return false;
    }
    if (n.type === 'FRAME' || n.type === 'SECTION' || n.type === 'GROUP') {
      const topLevel = parent === page;
      if (!topLevel && !hasAutoLayout(n)) problems.push({ id: n.id, name: n.name, reason: 'frame without auto layout (use row/col)' });
      if (!(n.fills || []).every(okPaint)) problems.push({ id: n.id, name: n.name, reason: 'fill is not a token (use bg=$Name or bg=none)' });
      if (!(n.strokes || []).every(okPaint)) problems.push({ id: n.id, name: n.name, reason: 'stroke is not a token' });
      if ((n.effects || []).some((e) => !e.token && e.visible !== false)) problems.push({ id: n.id, name: n.name, reason: 'effect is not a token (use effect=Name)' });
      return true;
    }
    problems.push({ id: n.id, name: n.name, reason: `${n.type.toLowerCase()} drawn by hand — use a library component` });
    return false;
  });
  return problems;
}

/**
 * Compute instance overrides by diffing an expanded instance (e.g. from Figma) against its component.
 * Only characters, visibility and solid fills are compared. Returns {} when nothing differs.
 */
export function diffOverrides(componentNode, instanceNode) {
  const overrides = {};
  const rec = (c, i, path) => {
    if (!c || !i) return;
    const ov = {};
    if (c.type === 'TEXT' && i.characters !== undefined && i.characters !== c.characters) ov.characters = i.characters;
    if ((i.visible === false) !== (c.visible === false)) ov.visible = i.visible === false ? false : null;
    const cf = JSON.stringify((c.fills || []).map((f) => f.color)), inf = JSON.stringify((i.fills || []).map((f) => f.color));
    if (cf !== inf && i.fills) ov.fills = i.fills;
    if (Object.keys(ov).length && path) overrides[path] = ov;
    const ck = c.children || [], ik = i.children || [];
    for (let k = 0; k < Math.min(ck.length, ik.length); k++) rec(ck[k], ik[k], (path ? path + '/' : '') + ck[k].name);
  };
  rec(componentNode, instanceNode, '');
  return overrides;
}

export { findById };
