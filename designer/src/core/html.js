// Export a document (or a subtree) as a standalone HTML file with a <style> block.
// Semantic tags come from node.html.tag (fallbacks by node type), classes from node.html.className.

import { computeStyle, toCssText } from './style.js';
import { hasAutoLayout } from './model.js';
import { expandDocument, buildIndex } from './components.js';

const cssVar = (name) => `--${String(name).replace(/[^A-Za-z0-9]+/g, '-')}`;

const DEFAULT_TAG = { FRAME: 'div', GROUP: 'div', RECTANGLE: 'div', ELLIPSE: 'div', TEXT: 'p', LINE: 'hr', COMPONENT: 'div', INSTANCE: 'div', SECTION: 'section', VECTOR: 'div', CANVAS: 'div' };
const VOID = new Set(['img', 'hr', 'br', 'input']);

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cssClass(node) { return `le-${String(node.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`; }

/**
 * @param {object} doc
 * @param {{ nodes?: object[], page?: number, title?: string, fontLink?: boolean, bodyWidth?: boolean }} options
 */
export function exportHtml(doc, options = {}) {
  const libs = options.libs || [];
  const tokens = buildIndex(doc, libs).tokens;
  const sourceRoots = options.nodes;
  doc = expandDocument(doc, libs);
  const page = (doc.children || [])[options.page || 0];
  const roots = sourceRoots ? sourceRoots.map((n) => findIn(doc, n.id) || n) : (page ? page.children : []);
  const rules = [];
  const body = [];
  const tokenRules = Object.entries(tokens.colors || {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => `  ${cssVar(k)}: ${v};`);

  const render = (node, parent, depth) => {
    if (node.visible === false) return '';
    const style = computeStyle(node, parent);
    // top-level frames are laid out in normal flow, stacked vertically
    if (!parent || parent.type === 'CANVAS') { style.position = 'relative'; delete style.left; delete style.top; if (style.width === '100%') style.width = 'auto'; }
    if (node.type === 'TEXT') { delete style.flexShrink; }
    // tokens -> CSS custom properties (with the resolved value as fallback)
    const fill = (node.fills || []).find((f) => f.visible !== false);
    if (fill?.token && fill.type === 'SOLID') { if (node.type === 'TEXT') style.color = `var(${cssVar(fill.token)}, ${fill.color})`; else style.background = `var(${cssVar(fill.token)}, ${fill.color})`; }
    const stroke = (node.strokes || []).find((f) => f.visible !== false);
    if (stroke?.token && stroke.type === 'SOLID' && style.boxShadow) style.boxShadow = style.boxShadow.replace(stroke.color, `var(${cssVar(stroke.token)}, ${stroke.color})`);
    const cls = cssClass(node);
    rules.push(`.${cls} {\n${toCssText(style, '  ')}\n}`);
    const h = node.html || {};
    let tag = h.tag || DEFAULT_TAG[node.type] || 'div';
    const attrs = { class: [cls, h.className].filter(Boolean).join(' ') };
    attrs['data-name'] = node.name;
    attrs['data-le-id'] = String(node.id).split('::').pop();
    if (node.type === 'INSTANCE' && node.component) { attrs['data-component'] = node.component; if (node.variant && Object.keys(node.variant).length) attrs['data-variant'] = Object.entries(node.variant).map(([k, v]) => `${k}=${v}`).join(', '); }
    if (node.style?.token) attrs['data-textstyle'] = node.style.token;
    for (const [k, v] of Object.entries(h.attrs || {})) attrs[k] = v;
    const img = (node.fills || []).find((f) => f.type === 'IMAGE' && f.src);
    if (tag === 'img' && img) { attrs.src = img.src; if (!attrs.alt) attrs.alt = node.name; }
    const attrText = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
    const pad = '  '.repeat(depth);
    if (VOID.has(tag)) return `${pad}<${tag}${attrText}>\n`;
    let inner = '';
    if (node.type === 'TEXT') inner = escapeHtml(node.characters || '');
    else if (node.children) inner = '\n' + node.children.map((c) => render(c, node, depth + 1)).join('') + pad;
    return `${pad}<${tag}${attrText}>${inner}</${tag}>\n`;
  };
  for (const r of roots) body.push(render(r, page || null, 2));

  const fonts = new Set();
  const collect = (n) => { if (n.type === 'TEXT') fonts.add(n.style?.fontFamily || 'Inter'); (n.children || []).forEach(collect); };
  roots.forEach(collect);
  const fontLink = options.fontLink === false ? '' : [...fonts].map((f) => `  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title || doc.name || 'Design')}</title>
${fontLink}
  <style>
    * { box-sizing: border-box; }
    :root {
${tokenRules.join('\n')}
    }
    html, body { margin: 0; padding: 0; }
    body { font-family: "Inter", system-ui, sans-serif; display: flex; flex-direction: column; align-items: flex-start; }
    hr { border: 0; }
${rules.join('\n')}
  </style>
</head>
<body>
${body.join('')}</body>
</html>
`;
}

function findIn(root, id) {
  let out = null;
  const rec = (n) => { if (out) return; if (n.id === id) { out = n; return; } for (const c of n.children || []) rec(c); };
  rec(root);
  return out;
}

export { hasAutoLayout };
