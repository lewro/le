// Compact design DSL — the fastest way for an agent (or a human) to describe or edit a page.
//
//   frame Header row w=fill h=72 p=16,32 gap=24 items=center justify=between bg=#fff tag=header #n3
//     text Logo "Acme" size=20 weight=700 color=#111
//     frame Nav row gap=24
//       text "Home" size=14
//       text "Pricing" size=14
//     frame Button p=10,16 r=8 bg=#2563eb tag=a href=/signup
//       text "Sign up" size=14 weight=600 color=#fff
//
// Grammar (one node per line, indentation = nesting, 2 spaces recommended but any consistent indent works):
//   <type> [Name | "Quoted Name"] ["text content" (TEXT only)] [flag ...] [key=value ...] [#id]
//
// Types: page frame group rect ellipse text line component instance section
// See AGENTS.md for the full property reference. parseProps/applyShorthand/toShorthand are also used by
// the ops API ("dsl" strings) and by the inspector.

import { createNode, normalizeType, SHORT_TYPES, DEFAULT_TEXT_STYLE, sizingH, sizingV, hasAutoLayout } from './model.js';

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(line) {
  const tokens = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '/' && line[i + 1] === '/') break; // comment
    let tok = '';
    let quoted = false;
    let key = null;
    // read until whitespace, honoring quotes
    while (i < n && line[i] !== ' ' && line[i] !== '\t') {
      const c = line[i];
      if (c === '"' || c === "'") {
        const q = c; i++;
        quoted = true;
        while (i < n && line[i] !== q) {
          if (line[i] === '\\' && i + 1 < n) {
            const e = line[i + 1];
            tok += e === 'n' ? '\n' : e === 't' ? '\t' : e;
            i += 2;
          } else { tok += line[i++]; }
        }
        i++; // closing quote
        continue;
      }
      if (c === '=' && key === null && !quoted) { key = tok; tok = ''; i++; continue; }
      tok += c; i++;
    }
    tokens.push({ text: tok, quoted, key });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export function num(v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function solid(color) { return { type: 'SOLID', color }; }

function parseColor(v) {
  v = String(v).trim();
  if (v === 'none' || v === 'transparent' || v === '') return null;
  if (/^[0-9a-fA-F]{3,8}$/.test(v)) v = '#' + v;
  if (/^#[0-9a-fA-F]{3,4}$/.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('');
  return v.toLowerCase();
}

/** Parse a paint value: "#hex", "none", "url(...)", "linear(90,#a,#b)". */
export function parsePaint(v) {
  v = String(v).trim();
  if (v === 'none' || v === 'transparent' || v === '') return null;
  let m;
  if ((m = /^url\((.*)\)$/.exec(v))) return { type: 'IMAGE', scaleMode: 'FILL', src: m[1].replace(/^['"]|['"]$/g, '') };
  if ((m = /^linear\((.*)\)$/.exec(v))) {
    const parts = m[1].split(',').map((s) => s.trim());
    const angle = num(parts.shift(), 180);
    const stops = parts.map((c, i) => ({ position: parts.length === 1 ? 0 : i / (parts.length - 1), color: parseColor(c) }));
    return { type: 'GRADIENT_LINEAR', angle, gradientStops: stops };
  }
  return solid(parseColor(v));
}

export function paintToShort(p) {
  if (!p) return 'none';
  if (p.type === 'SOLID') return p.color + (p.opacity !== undefined && p.opacity !== 1 ? `@${p.opacity}` : '');
  if (p.type === 'IMAGE') return `url(${p.src || p.imageRef || ''})`;
  if (p.type === 'GRADIENT_LINEAR') return `linear(${p.angle ?? 180},${(p.gradientStops || []).map((s) => s.color).join(',')})`;
  return 'none';
}

function parsePadding(v) {
  const p = String(v).split(',').map((s) => num(s));
  if (p.length === 1) return { paddingTop: p[0], paddingRight: p[0], paddingBottom: p[0], paddingLeft: p[0] };
  if (p.length === 2) return { paddingTop: p[0], paddingRight: p[1], paddingBottom: p[0], paddingLeft: p[1] };
  if (p.length === 3) return { paddingTop: p[0], paddingRight: p[1], paddingBottom: p[2], paddingLeft: p[1] };
  return { paddingTop: p[0], paddingRight: p[1], paddingBottom: p[2], paddingLeft: p[3] };
}

const JUSTIFY = { start: 'MIN', min: 'MIN', left: 'MIN', top: 'MIN', center: 'CENTER', end: 'MAX', max: 'MAX', right: 'MAX', bottom: 'MAX', between: 'SPACE_BETWEEN', 'space-between': 'SPACE_BETWEEN' };
const JUSTIFY_BACK = { MIN: 'start', CENTER: 'center', MAX: 'end', SPACE_BETWEEN: 'between' };
const ITEMS = { start: 'MIN', min: 'MIN', center: 'CENTER', end: 'MAX', max: 'MAX', baseline: 'BASELINE', stretch: 'STRETCH' };
const ITEMS_BACK = { MIN: 'start', CENTER: 'center', MAX: 'end', BASELINE: 'baseline', STRETCH: 'stretch' };
const TALIGN = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED', justified: 'JUSTIFIED' };
const TALIGN_BACK = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
const VALIGN = { top: 'TOP', center: 'CENTER', middle: 'CENTER', bottom: 'BOTTOM' };
const VALIGN_BACK = { TOP: 'top', CENTER: 'center', BOTTOM: 'bottom' };
const WEIGHTS = { thin: 100, extralight: 200, light: 300, regular: 400, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };

export const FLAGS = new Set(['row', 'col', 'column', 'wrap', 'nowrap', 'clip', 'noclip', 'hidden', 'visible', 'locked', 'unlocked', 'abs', 'grow', 'nolayout']);

function setSizing(node, axis, v) {
  const key = axis === 'h' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  const dim = axis === 'h' ? 'width' : 'height';
  const s = String(v).toLowerCase();
  if (s === 'fill') node[key] = 'FILL';
  else if (s === 'hug' || s === 'auto') node[key] = 'HUG';
  else { node[dim] = num(v); node[key] = 'FIXED'; }
}

/**
 * Apply a single shorthand property (DSL key/value) to a node. Unknown keys are set as raw node fields
 * (dotted keys like style.fontSize are supported) so every Figma property remains reachable.
 */
export function applyShorthand(node, key, value) {
  const st = () => (node.style ||= { ...DEFAULT_TEXT_STYLE });
  const html = () => (node.html ||= {});
  switch (key) {
    // flags
    case 'row': node.layoutMode = 'HORIZONTAL'; return;
    case 'col': case 'column': node.layoutMode = 'VERTICAL'; return;
    case 'nolayout': node.layoutMode = 'NONE'; return;
    case 'wrap': node.layoutWrap = 'WRAP'; return;
    case 'nowrap': node.layoutWrap = 'NO_WRAP'; return;
    case 'clip': node.clipsContent = true; return;
    case 'noclip': node.clipsContent = false; return;
    case 'hidden': node.visible = false; return;
    case 'visible': delete node.visible; return;
    case 'locked': node.locked = true; return;
    case 'unlocked': delete node.locked; return;
    case 'abs': node.layoutPositioning = 'ABSOLUTE'; return;
    case 'grow': node.layoutGrow = 1; return;
    // geometry
    case 'x': node.x = num(value); return;
    case 'y': node.y = num(value); return;
    case 'w': case 'width': setSizing(node, 'h', value); return;
    case 'h': case 'height': setSizing(node, 'v', value); return;
    case 'rot': case 'rotation': node.rotation = num(value); return;
    case 'layout': node.layoutMode = value === 'row' ? 'HORIZONTAL' : value === 'col' ? 'VERTICAL' : 'NONE'; return;
    case 'gap': node.itemSpacing = num(value); return;
    case 'rowgap': node.counterAxisSpacing = num(value); return;
    case 'p': case 'padding': Object.assign(node, parsePadding(value)); return;
    case 'px': node.paddingLeft = node.paddingRight = num(value); return;
    case 'py': node.paddingTop = node.paddingBottom = num(value); return;
    case 'pt': node.paddingTop = num(value); return;
    case 'pr': node.paddingRight = num(value); return;
    case 'pb': node.paddingBottom = num(value); return;
    case 'pl': node.paddingLeft = num(value); return;
    case 'justify': node.primaryAxisAlignItems = JUSTIFY[String(value).toLowerCase()] || 'MIN'; return;
    case 'items': node.counterAxisAlignItems = ITEMS[String(value).toLowerCase()] || 'MIN'; return;
    case 'center': node.primaryAxisAlignItems = 'CENTER'; node.counterAxisAlignItems = 'CENTER'; return;
    // appearance
    case 'bg': case 'fill': {
      if (node.type === 'TEXT' && key === 'fill') { const p = parsePaint(value); node.fills = p ? [p] : []; return; }
      const p = parsePaint(value); node.fills = p ? [p] : []; return;
    }
    case 'fills': node.fills = String(value).split('|').map(parsePaint).filter(Boolean); return;
    case 'color': { const p = parsePaint(value); node.fills = p ? [p] : []; return; }
    case 'img': case 'image': node.fills = [{ type: 'IMAGE', scaleMode: 'FILL', src: String(value) }]; return;
    case 'stroke': case 'border': { const p = parsePaint(value); node.strokes = p ? [p] : []; if (p && node.strokeWeight === undefined) node.strokeWeight = 1; return; }
    case 'sw': case 'strokeWeight': node.strokeWeight = num(value); return;
    case 'strokeAlign': case 'salign': node.strokeAlign = String(value).toUpperCase(); return;
    case 'r': case 'radius': {
      const p = String(value).split(',').map((s) => num(s));
      if (p.length === 1) { node.cornerRadius = p[0]; delete node.rectangleCornerRadii; }
      else { node.rectangleCornerRadii = [p[0], p[1] ?? p[0], p[2] ?? p[0], p[3] ?? p[1] ?? p[0]]; delete node.cornerRadius; }
      return;
    }
    case 'opacity': case 'o': node.opacity = num(value, 1); return;
    case 'shadow': {
      // shadow=x,y,blur,spread,#color  (or shadow=none)
      if (value === 'none') { node.effects = []; return; }
      const p = String(value).split(',').map((s) => s.trim());
      node.effects = [{ type: 'DROP_SHADOW', offset: { x: num(p[0]), y: num(p[1]) }, radius: num(p[2]), spread: num(p[3]), color: parseColor(p[4] || '#00000040'), visible: true }];
      return;
    }
    case 'blur': node.effects = [...(node.effects || []).filter((e) => e.type !== 'LAYER_BLUR'), { type: 'LAYER_BLUR', radius: num(value), visible: true }]; return;
    // text
    case 'text': case 'chars': node.characters = String(value); return;
    case 'size': case 'fontSize': st().fontSize = num(value, 16); return;
    case 'weight': case 'fontWeight': st().fontWeight = WEIGHTS[String(value).toLowerCase()] ?? num(value, 400); return;
    case 'font': case 'family': st().fontFamily = String(value); return;
    case 'lh': case 'lineHeight': {
      const s = String(value);
      if (s === 'auto' || s === '') { delete st().lineHeightPx; delete st().lineHeightPercentFontSize; return; }
      if (s.endsWith('%')) { st().lineHeightPercentFontSize = num(s); delete st().lineHeightPx; return; }
      const n = num(s);
      if (n > 0 && n <= 4) { st().lineHeightPercentFontSize = Math.round(n * 100); delete st().lineHeightPx; return; }
      st().lineHeightPx = n; delete st().lineHeightPercentFontSize; return;
    }
    case 'ls': case 'letterSpacing': st().letterSpacing = num(value); return;
    case 'align': st().textAlignHorizontal = TALIGN[String(value).toLowerCase()] || 'LEFT'; return;
    case 'valign': st().textAlignVertical = VALIGN[String(value).toLowerCase()] || 'TOP'; return;
    case 'decoration': st().textDecoration = value === 'underline' ? 'UNDERLINE' : value === 'strike' || value === 'line-through' ? 'STRIKETHROUGH' : 'NONE'; return;
    case 'case': st().textCase = value === 'upper' ? 'UPPER' : value === 'lower' ? 'LOWER' : value === 'title' ? 'TITLE' : 'ORIGINAL'; return;
    case 'italic': st().italic = value !== 'false'; return;
    // html / semantics
    case 'tag': html().tag = String(value); return;
    case 'class': case 'className': html().className = String(value); return;
    case 'href': case 'src': case 'alt': case 'title': case 'target': case 'rel': case 'role': case 'aria-label': case 'placeholder': case 'type': case 'value': case 'id':
      if (key === 'id' && node.html === undefined && !node.id) { node.id = String(value); return; }
      (html().attrs ||= {})[key] = String(value); return;
    case 'name': node.name = String(value); return;
    case 'component': node.componentId = String(value); return;
    default: {
      if (key.startsWith('attr:') || key.startsWith('data-')) { (html().attrs ||= {})[key.replace(/^attr:/, '')] = String(value); return; }
      // raw field, dotted path supported
      const path = key.split('.');
      let obj = node;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]] ||= {};
      obj[path[path.length - 1]] = coerce(value);
    }
  }
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) { try { return JSON.parse(v); } catch { /* keep string */ } }
  return v;
}

/** Parse a "key=value key2=value flag" string into [{key, value}] pairs. */
export function parseProps(str) {
  const out = [];
  for (const t of tokenize(str)) {
    if (t.key !== null) out.push({ key: t.key, value: t.text });
    else if (FLAGS.has(t.text)) out.push({ key: t.text, value: true });
    else if (t.text.startsWith('#') && !t.quoted) out.push({ key: 'id', value: t.text.slice(1) });
  }
  return out;
}

/** Apply a "key=value ..." string to a node. */
export function applyShorthandString(node, str) {
  for (const { key, value } of parseProps(str)) applyShorthand(node, key, value);
  return node;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse DSL text into an array of root nodes. Ids are only assigned when given with #id;
 * callers use model.assignIds() to fill in the rest.
 */
export function parseDsl(text) {
  const roots = [];
  const stack = []; // { indent, node }
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    if (!raw.trim() || raw.trim().startsWith('//')) continue;
    const indent = raw.match(/^[ \t]*/)[0].replace(/\t/g, '  ').length;
    const tokens = tokenize(raw.trim());
    if (!tokens.length) continue;
    const typeTok = tokens.shift();
    const type = normalizeType(typeTok.text);
    if (!SHORT_TYPES[type]) throw new Error(`Line ${ln + 1}: unknown node type "${typeTok.text}"`);
    const node = createNode(type);
    delete node.id;
    let name = null;
    const strings = [];
    const explicit = new Set();
    for (const t of tokens) {
      if (t.key !== null) { explicit.add(t.key); applyShorthand(node, t.key, t.text); }
      else if (!t.quoted && FLAGS.has(t.text)) { explicit.add(t.text); applyShorthand(node, t.text, true); }
      else if (!t.quoted && t.text.startsWith('#') && t.text.length > 1) node.id = t.text.slice(1);
      else if (!t.quoted && name === null && !strings.length) name = t.text;
      else strings.push(t.text);
    }
    if (type === 'TEXT') {
      if (strings.length >= 2) { name = strings[0]; node.characters = strings[1]; }
      else if (strings.length === 1) { if (name === null) name = null; node.characters = strings[0]; }
      if (name === null) name = node.characters.split('\n')[0].slice(0, 60) || 'Text';
    } else if (strings.length) {
      name = name === null ? strings[0] : name + ' ' + strings.join(' ');
    }
    if (name !== null) node.name = name;
    finishNode(node, explicit);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) {
      const parent = stack[stack.length - 1].node;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else roots.push(node);
    stack.push({ indent, node });
  }
  return roots;
}

const LAYOUT_KEYS = new Set(['gap', 'rowgap', 'p', 'padding', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'justify', 'items', 'center']);

/** Apply DSL defaults: layout props imply auto-layout; auto-layout frames hug unless sized explicitly. */
export function finishNode(node, explicit) {
  if (node.type === 'TEXT' || node.type === 'CANVAS') return;
  if (!node.layoutMode || node.layoutMode === 'NONE') {
    for (const k of explicit) if (LAYOUT_KEYS.has(k)) { node.layoutMode = 'HORIZONTAL'; break; }
  }
  if (hasAutoLayout(node)) {
    if (!explicit.has('w') && !explicit.has('width')) node.layoutSizingHorizontal = 'HUG';
    if (!explicit.has('h') && !explicit.has('height')) node.layoutSizingVertical = 'HUG';
  }
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function fmt(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }
function q(s) { return JSON.stringify(String(s)); }
function isWord(s) { return /^[A-Za-z0-9_.-]+$/.test(s) && !FLAGS.has(s) && !SHORT_TYPES[String(s).toUpperCase()] && !TYPE_ALIAS_WORDS.has(s.toLowerCase()); }
const TYPE_ALIAS_WORDS = new Set(['frame', 'group', 'rect', 'rectangle', 'ellipse', 'circle', 'text', 'line', 'component', 'instance', 'page', 'canvas', 'vector', 'section', 'image', 'img']);

function paddingShort(n) {
  const t = n.paddingTop || 0, r = n.paddingRight || 0, b = n.paddingBottom || 0, l = n.paddingLeft || 0;
  if (!t && !r && !b && !l) return null;
  if (t === r && r === b && b === l) return fmt(t);
  if (t === b && r === l) return `${fmt(t)},${fmt(r)}`;
  return `${fmt(t)},${fmt(r)},${fmt(b)},${fmt(l)}`;
}

/** Build the list of shorthand props for a node (excluding name/characters/id). */
export function toShorthand(node, parent) {
  const p = [];
  const inAuto = parent && hasAutoLayout(parent) && node.layoutPositioning !== 'ABSOLUTE';
  if (node.layoutPositioning === 'ABSOLUTE') p.push('abs');
  if (!inAuto && node.type !== 'CANVAS' && (node.x || node.y)) p.push(`x=${fmt(node.x || 0)}`, `y=${fmt(node.y || 0)}`);
  if (node.type !== 'CANVAS') {
    const sh = sizingH(node), sv = sizingV(node);
    const hugDefault = node.type === 'TEXT' || hasAutoLayout(node);
    if (!(sh === 'HUG' && hugDefault)) p.push(`w=${sh === 'FIXED' ? fmt(node.width || 0) : sh.toLowerCase()}`);
    if (!(sv === 'HUG' && hugDefault)) p.push(`h=${sv === 'FIXED' ? fmt(node.height || 0) : sv.toLowerCase()}`);
  }
  if (node.rotation) p.push(`rot=${fmt(node.rotation)}`);
  if (node.layoutMode === 'HORIZONTAL') p.push('row');
  if (node.layoutMode === 'VERTICAL') p.push('col');
  if (hasAutoLayout(node)) {
    if (node.layoutWrap === 'WRAP') p.push('wrap');
    if (node.itemSpacing) p.push(`gap=${fmt(node.itemSpacing)}`);
    if (node.counterAxisSpacing) p.push(`rowgap=${fmt(node.counterAxisSpacing)}`);
    const pad = paddingShort(node); if (pad) p.push(`p=${pad}`);
    if (node.primaryAxisAlignItems && node.primaryAxisAlignItems !== 'MIN') p.push(`justify=${JUSTIFY_BACK[node.primaryAxisAlignItems]}`);
    if (node.counterAxisAlignItems && node.counterAxisAlignItems !== 'MIN') p.push(`items=${ITEMS_BACK[node.counterAxisAlignItems]}`);
  }
  if (node.type === 'TEXT') {
    const s = node.style || {};
    if (s.fontFamily && s.fontFamily !== 'Inter') p.push(`font=${q(s.fontFamily)}`);
    if (s.fontSize !== undefined && s.fontSize !== 16) p.push(`size=${fmt(s.fontSize)}`);
    if (s.fontWeight && s.fontWeight !== 400) p.push(`weight=${s.fontWeight}`);
    if (s.italic) p.push('italic=true');
    if (s.lineHeightPx) p.push(`lh=${fmt(s.lineHeightPx)}`);
    else if (s.lineHeightPercentFontSize) p.push(`lh=${fmt(s.lineHeightPercentFontSize)}%`);
    if (s.letterSpacing) p.push(`ls=${fmt(s.letterSpacing)}`);
    if (s.textAlignHorizontal && s.textAlignHorizontal !== 'LEFT') p.push(`align=${TALIGN_BACK[s.textAlignHorizontal]}`);
    if (s.textAlignVertical && s.textAlignVertical !== 'TOP') p.push(`valign=${VALIGN_BACK[s.textAlignVertical]}`);
    if (s.textDecoration && s.textDecoration !== 'NONE') p.push(`decoration=${s.textDecoration === 'UNDERLINE' ? 'underline' : 'strike'}`);
    if (s.textCase && s.textCase !== 'ORIGINAL') p.push(`case=${s.textCase.toLowerCase()}`);
    const fill = (node.fills || [])[0];
    if (!fill) p.push('color=none');
    else if (fill.type !== 'SOLID' || fill.color !== '#000000') p.push(`color=${paintToShort(fill)}`);
  } else if (node.type !== 'CANVAS' && node.type !== 'GROUP' && node.type !== 'LINE') {
    const fills = (node.fills || []).filter((f) => f.visible !== false);
    const def = node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'SECTION' ? '#ffffff' : '#d9d9d9';
    if (!fills.length) p.push('bg=none');
    else if (fills.length === 1) { if (fills[0].type !== 'SOLID' || fills[0].color !== def || fills[0].opacity !== undefined) p.push(`bg=${paintToShort(fills[0])}`); }
    else p.push(`fills=${fills.map(paintToShort).join('|')}`);
  }
  const strokes = (node.strokes || []).filter((f) => f.visible !== false);
  if (strokes.length) {
    p.push(`stroke=${paintToShort(strokes[0])}`);
    if (node.strokeWeight !== undefined && node.strokeWeight !== 1) p.push(`sw=${fmt(node.strokeWeight)}`);
    if (node.strokeAlign && node.strokeAlign !== 'INSIDE') p.push(`salign=${node.strokeAlign.toLowerCase()}`);
  }
  if (node.rectangleCornerRadii) p.push(`r=${node.rectangleCornerRadii.map(fmt).join(',')}`);
  else if (node.cornerRadius) p.push(`r=${fmt(node.cornerRadius)}`);
  if (node.opacity !== undefined && node.opacity !== 1) p.push(`opacity=${fmt(node.opacity)}`);
  for (const e of node.effects || []) {
    if (e.visible === false) continue;
    if (e.type === 'DROP_SHADOW') p.push(`shadow=${fmt(e.offset?.x || 0)},${fmt(e.offset?.y || 0)},${fmt(e.radius || 0)},${fmt(e.spread || 0)},${e.color}`);
    if (e.type === 'LAYER_BLUR') p.push(`blur=${fmt(e.radius || 0)}`);
  }
  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') { if (node.clipsContent === false) p.push('noclip'); }
  if (node.visible === false) p.push('hidden');
  if (node.locked) p.push('locked');
  if (node.componentId) p.push(`component=${node.componentId}`);
  if (node.html) {
    if (node.html.tag) p.push(`tag=${node.html.tag}`);
    if (node.html.className) p.push(`class=${q(node.html.className)}`);
    for (const [k, v] of Object.entries(node.html.attrs || {})) p.push(`${/^[a-z-]+$/.test(k) ? k : 'attr:' + k}=${isWord(v) ? v : q(v)}`);
  }
  return p;
}

/**
 * Serialize a node (or array of nodes) to DSL text.
 * options: { ids: true, depth: Infinity, indent: '  ' }
 */
export function serializeDsl(nodes, options = {}, parent = null) {
  const { ids = true, depth = Infinity, indent = '  ' } = options;
  const list = Array.isArray(nodes) ? nodes : [nodes];
  const lines = [];
  const rec = (node, par, level) => {
    if (node.type === 'DOCUMENT') { (node.children || []).forEach((c) => rec(c, node, level)); return; }
    const parts = [SHORT_TYPES[node.type] || node.type.toLowerCase()];
    const defaultName = node.type === 'TEXT' ? (node.characters || '').split('\n')[0].slice(0, 60) : null;
    const showName = node.name !== undefined && node.name !== defaultName && !(node.type === 'TEXT' && node.name === 'Text');
    if (showName) parts.push(isWord(node.name) ? node.name : q(node.name));
    if (node.type === 'TEXT') parts.push(q(node.characters || ''));
    parts.push(...toShorthand(node, par));
    if (ids && node.id) parts.push('#' + node.id);
    lines.push(indent.repeat(level) + parts.join(' '));
    if (node.children && level + 1 < depth + (list.includes(node) ? 0 : 0)) {
      if (level < depth - 1) node.children.forEach((c) => rec(c, node, level + 1));
      else if (node.children.length) lines.push(indent.repeat(level + 1) + `// ${node.children.length} children (depth limit)`);
    }
  };
  list.forEach((n) => rec(n, parent, 0));
  return lines.join('\n');
}
