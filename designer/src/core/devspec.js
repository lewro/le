// Developer-facing spec for a node: the values a developer (or an agent writing code) needs, with tokens.
// Shared by the canvas dev overlay, the Inspect panel and the CLI `spec` command.

import { hasAutoLayout, sizingH, sizingV } from './model.js';
import { paintToCss } from './style.js';

const ALIGN = { MIN: 'start', CENTER: 'center', MAX: 'end', SPACE_BETWEEN: 'space-between', BASELINE: 'baseline' };

function paintLabel(p) {
  if (!p) return null;
  if (p.type === 'SOLID') return { value: p.color, token: p.token || null, css: paintToCss(p) };
  if (p.type === 'IMAGE') return { value: p.src || p.imageRef || 'image', token: null, css: paintToCss(p) };
  return { value: paintToCss(p), token: p.token || null, css: paintToCss(p) };
}

/**
 * Returns groups of { group, items: [{ key, label, value, token?, color?, css? }] }.
 * `expanded` is the expanded instance when node is an INSTANCE (optional).
 */
export function nodeSpec(node, parent, expanded) {
  const n = node.type === 'INSTANCE' && expanded ? { ...expanded, ...pick(node, ['name', 'x', 'y', 'width', 'height']) } : node;
  const groups = [];
  const add = (group, items) => { const list = items.filter(Boolean); if (list.length) groups.push({ group, items: list }); };

  if (node.type === 'INSTANCE') {
    add('Component', [
      { key: 'component', label: 'Component', value: node.component || node.componentId },
      node.variant && Object.keys(node.variant).length ? { key: 'variant', label: 'Variant', value: Object.entries(node.variant).map(([k, v]) => `${k}=${v}`).join(', ') } : null,
    ]);
  }

  const inAuto = parent && hasAutoLayout(parent) && n.layoutPositioning !== 'ABSOLUTE';
  const sh = sizingH(n), sv = sizingV(n);
  add('Layout', [
    !inAuto ? { key: 'position', label: 'Position', value: `${round(n.x)}, ${round(n.y)}` } : null,
    { key: 'size', label: 'Size', value: `${sh === 'FIXED' ? round(n.width) : sh.toLowerCase()} × ${sv === 'FIXED' ? round(n.height) : sv.toLowerCase()}` },
    n.rotation ? { key: 'rotation', label: 'Rotation', value: `${n.rotation}°` } : null,
    hasAutoLayout(n) ? { key: 'direction', label: 'Auto layout', value: `${n.layoutMode === 'HORIZONTAL' ? 'row' : 'column'}${n.layoutWrap === 'WRAP' ? ' wrap' : ''}` } : null,
    hasAutoLayout(n) ? { key: 'gap', label: 'Gap', value: `${round(n.itemSpacing)}px${n.layoutWrap === 'WRAP' && n.counterAxisSpacing !== undefined ? ` / ${round(n.counterAxisSpacing)}px` : ''}` } : null,
    hasAutoLayout(n) && (n.paddingTop || n.paddingRight || n.paddingBottom || n.paddingLeft) ? { key: 'padding', label: 'Padding', value: `${round(n.paddingTop)} ${round(n.paddingRight)} ${round(n.paddingBottom)} ${round(n.paddingLeft)}` } : null,
    hasAutoLayout(n) ? { key: 'align', label: 'Align', value: `${ALIGN[n.primaryAxisAlignItems || 'MIN']} / ${ALIGN[n.counterAxisAlignItems || 'MIN']}` } : null,
    n.clipsContent && n.children ? { key: 'clip', label: 'Overflow', value: 'hidden' } : null,
  ]);

  if (n.type === 'TEXT') {
    const s = n.style || {};
    const fill = paintLabel((n.fills || [])[0]);
    add('Typography', [
      s.token ? { key: 'textstyle', label: 'Text style', value: s.token, token: s.token } : null,
      { key: 'font', label: 'Font', value: `${s.fontFamily || 'Inter'} ${s.fontWeight || 400}${s.italic ? ' italic' : ''}` },
      { key: 'fontsize', label: 'Size / line height', value: `${round(s.fontSize || 16)}px / ${s.lineHeightPx ? round(s.lineHeightPx) + 'px' : s.lineHeightPercentFontSize ? s.lineHeightPercentFontSize + '%' : 'auto'}` },
      s.letterSpacing ? { key: 'letterspacing', label: 'Letter spacing', value: `${s.letterSpacing}px` } : null,
      fill ? { key: 'color', label: 'Color', value: fill.value, token: fill.token, color: fill.css } : null,
      s.textAlignHorizontal && s.textAlignHorizontal !== 'LEFT' ? { key: 'textalign', label: 'Align', value: s.textAlignHorizontal.toLowerCase() } : null,
      s.textDecoration && s.textDecoration !== 'NONE' ? { key: 'decoration', label: 'Decoration', value: s.textDecoration.toLowerCase() } : null,
      s.textCase && s.textCase !== 'ORIGINAL' ? { key: 'case', label: 'Case', value: s.textCase.toLowerCase() } : null,
    ]);
  } else {
    const fills = (n.fills || []).filter((f) => f.visible !== false).map(paintLabel);
    const strokes = (n.strokes || []).filter((f) => f.visible !== false).map(paintLabel);
    add('Appearance', [
      ...fills.map((f, i) => ({ key: 'fill' + i, label: fills.length > 1 ? `Fill ${i + 1}` : 'Background', value: f.value, token: f.token, color: f.css })),
      ...strokes.map((f, i) => ({ key: 'stroke' + i, label: 'Border', value: `${round(n.strokeWeight ?? 1)}px ${f.value}${n.strokeAlign && n.strokeAlign !== 'INSIDE' ? ' ' + n.strokeAlign.toLowerCase() : ''}`, token: f.token, color: f.css })),
      n.rectangleCornerRadii ? { key: 'radius', label: 'Radius', value: n.rectangleCornerRadii.map(round).join(' ') + 'px' } : n.cornerRadius ? { key: 'radius', label: 'Radius', value: `${round(n.cornerRadius)}px` } : null,
      ...(n.effects || []).filter((e) => e.visible !== false).map((e, i) => ({ key: 'effect' + i, label: e.type === 'LAYER_BLUR' ? 'Blur' : e.type === 'INNER_SHADOW' ? 'Inner shadow' : 'Shadow', value: e.type.includes('BLUR') ? `${round(e.radius)}px` : `${round(e.offset?.x)} ${round(e.offset?.y)} ${round(e.radius)} ${round(e.spread)} ${e.color}`, token: e.token || null, color: e.color })),
      n.opacity !== undefined && n.opacity !== 1 ? { key: 'opacity', label: 'Opacity', value: `${Math.round(n.opacity * 100)}%` } : null,
    ]);
  }
  if (n.html?.tag || n.html?.className || n.html?.attrs) {
    add('HTML', [
      n.html.tag ? { key: 'tag', label: 'Tag', value: `<${n.html.tag}>` } : null,
      n.html.className ? { key: 'class', label: 'Class', value: n.html.className } : null,
      ...Object.entries(n.html.attrs || {}).map(([k, v]) => ({ key: 'attr-' + k, label: k, value: v })),
    ]);
  }
  return groups;
}

/** Short badge list for the on-canvas callout (most important values only). */
export function nodeBadges(node, parent, expanded) {
  const out = [];
  for (const g of nodeSpec(node, parent, expanded)) for (const it of g.items) {
    if (['position', 'size', 'align', 'clip', 'rotation', 'class', 'tag', 'decoration', 'case', 'textalign'].includes(it.key) || it.key.startsWith('attr-')) continue;
    out.push({ ...it, group: g.group });
  }
  return out.slice(0, 8);
}

function round(v) { return Math.round((v || 0) * 100) / 100; }
function pick(o, keys) { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; }

/** Plain-text spec (CLI). */
export function specText(node, parent, expanded) {
  return nodeSpec(node, parent, expanded).map((g) => `${g.group}\n` + g.items.map((i) => `  ${i.label}: ${i.value}${i.token ? `  ($${i.token})` : ''}`).join('\n')).join('\n');
}
