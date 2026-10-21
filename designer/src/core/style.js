// Node -> CSS. One source of truth shared by the canvas renderer, the HTML exporter and the inspector.
// Figma auto-layout maps almost 1:1 onto flexbox, which is why the canvas is plain DOM.

import { hasAutoLayout, sizingH, sizingV } from './model.js';

const ALIGN = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between', BASELINE: 'baseline', STRETCH: 'stretch' };
const TALIGN = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };

function px(n) { return `${Math.round((n || 0) * 100) / 100}px`; }

export function paintToCss(p) {
  if (!p || p.visible === false) return null;
  const alpha = p.opacity !== undefined && p.opacity !== 1 ? p.opacity : null;
  if (p.type === 'SOLID') return alpha !== null ? withAlpha(p.color, alpha) : p.color;
  if (p.type === 'IMAGE') return p.src ? `url("${p.src}") center / ${p.scaleMode === 'FIT' ? 'contain' : p.scaleMode === 'TILE' ? 'auto repeat' : 'cover'} no-repeat` : 'repeating-linear-gradient(45deg,#ddd 0 10px,#eee 10px 20px)';
  if (p.type === 'GRADIENT_LINEAR') {
    const stops = (p.gradientStops || []).map((s) => `${s.color} ${Math.round((s.position || 0) * 100)}%`).join(', ');
    return `linear-gradient(${p.angle ?? 180}deg, ${stops})`;
  }
  if (p.type === 'GRADIENT_RADIAL') {
    const stops = (p.gradientStops || []).map((s) => `${s.color} ${Math.round((s.position || 0) * 100)}%`).join(', ');
    return `radial-gradient(circle, ${stops})`;
  }
  return null;
}

export function withAlpha(hex, alpha) {
  const { r, g, b, a } = hexToRgba(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * alpha * 1000) / 1000})`;
}

export function hexToRgba(hex) {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) || 0, g = parseInt(h.slice(2, 4), 16) || 0, b = parseInt(h.slice(4, 6), 16) || 0;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

export function rgbaToHex({ r, g, b, a = 1 }) {
  const h = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b) + (a < 1 ? h(a * 255) : '');
}

export function fontStyleCss(node) {
  const s = node.style || {};
  const css = {};
  css.fontFamily = `"${s.fontFamily || 'Inter'}", system-ui, sans-serif`;
  css.fontWeight = s.fontWeight || 400;
  css.fontSize = px(s.fontSize || 16);
  if (s.italic) css.fontStyle = 'italic';
  if (s.lineHeightPx) css.lineHeight = px(s.lineHeightPx);
  else if (s.lineHeightPercentFontSize) css.lineHeight = String(s.lineHeightPercentFontSize / 100);
  else css.lineHeight = 'normal';
  if (s.letterSpacing) css.letterSpacing = px(s.letterSpacing);
  if (s.textAlignHorizontal && s.textAlignHorizontal !== 'LEFT') css.textAlign = TALIGN[s.textAlignHorizontal];
  if (s.textDecoration === 'UNDERLINE') css.textDecoration = 'underline';
  if (s.textDecoration === 'STRIKETHROUGH') css.textDecoration = 'line-through';
  if (s.textCase === 'UPPER') css.textTransform = 'uppercase';
  if (s.textCase === 'LOWER') css.textTransform = 'lowercase';
  if (s.textCase === 'TITLE') css.textTransform = 'capitalize';
  const fill = (node.fills || []).find((f) => f.visible !== false);
  if (fill) {
    if (fill.type === 'SOLID') css.color = paintToCss(fill);
    else { css.background = paintToCss(fill); css.WebkitBackgroundClip = 'text'; css.backgroundClip = 'text'; css.color = 'transparent'; }
  } else css.color = 'transparent';
  return css;
}

/**
 * Compute the CSS for a node rendered inside `parent`.
 * Returns a camelCase style object (React compatible). Use toCssText() for stylesheets.
 */
export function computeStyle(node, parent) {
  const css = { boxSizing: 'border-box' };
  const inAuto = parent && hasAutoLayout(parent) && node.layoutPositioning !== 'ABSOLUTE';
  const sh = sizingH(node), sv = sizingV(node);
  const parentRow = parent && parent.layoutMode === 'HORIZONTAL';

  // position
  if (inAuto) { css.position = 'relative'; css.flexShrink = 0; }
  else { css.position = 'absolute'; css.left = px(node.x); css.top = px(node.y); }

  // size
  if (sh === 'FIXED') css.width = px(node.width);
  else if (sh === 'FILL') {
    if (inAuto && parentRow) { css.flexGrow = 1; css.flexBasis = 0; css.minWidth = 0; css.width = 'auto'; }
    else if (inAuto) { css.alignSelf = 'stretch'; css.width = 'auto'; }
    else { css.width = '100%'; }
  } else { // HUG
    css.width = node.type === 'TEXT' ? 'max-content' : 'fit-content';
    if (node.type === 'TEXT') css.maxWidth = '100%';
  }
  if (sv === 'FIXED') css.height = px(node.height);
  else if (sv === 'FILL') {
    if (inAuto && !parentRow) { css.flexGrow = 1; css.flexBasis = 0; css.minHeight = 0; css.height = 'auto'; }
    else if (inAuto) { css.alignSelf = 'stretch'; css.height = 'auto'; }
    else { css.height = '100%'; }
  } else { css.height = node.type === 'TEXT' ? 'auto' : 'fit-content'; }
  if (inAuto && node.layoutGrow === 1 && css.flexGrow === undefined) { css.flexGrow = 1; css.flexBasis = 0; }
  if (inAuto && node.layoutAlign === 'STRETCH' && css.alignSelf === undefined) css.alignSelf = 'stretch';

  // container layout
  if (hasAutoLayout(node)) {
    css.display = 'flex';
    css.flexDirection = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
    if (node.layoutWrap === 'WRAP') css.flexWrap = 'wrap';
    css.justifyContent = ALIGN[node.primaryAxisAlignItems || 'MIN'];
    css.alignItems = ALIGN[node.counterAxisAlignItems || 'MIN'];
    if (node.layoutWrap === 'WRAP') css.alignContent = ALIGN[node.counterAxisAlignContent || 'MIN'];
    const gap = node.itemSpacing || 0, rowGap = node.counterAxisSpacing;
    css.gap = node.layoutWrap === 'WRAP' && rowGap !== undefined ? `${px(rowGap)} ${px(gap)}` : px(gap);
    css.padding = `${px(node.paddingTop)} ${px(node.paddingRight)} ${px(node.paddingBottom)} ${px(node.paddingLeft)}`;
  } else if (node.children) {
    css.display = 'block';
  }

  // appearance
  if (node.type === 'TEXT') Object.assign(css, fontStyleCss(node));
  else if (node.type === 'LINE') {
    const stroke = (node.strokes || [])[0];
    css.height = px(node.strokeWeight || 1);
    css.background = paintToCss(stroke) || 'transparent';
  } else {
    const fills = (node.fills || []).map(paintToCss).filter(Boolean);
    if (fills.length === 1) css.background = fills[0];
    else if (fills.length > 1) css.background = fills.slice().reverse().map((f) => (f.startsWith('#') || f.startsWith('rgb') ? `linear-gradient(${f}, ${f})` : f)).join(', ');
  }
  if (node.type === 'ELLIPSE') css.borderRadius = '50%';
  else if (node.rectangleCornerRadii) css.borderRadius = node.rectangleCornerRadii.map(px).join(' ');
  else if (node.cornerRadius) css.borderRadius = px(node.cornerRadius);

  const stroke = (node.strokes || []).find((s) => s.visible !== false);
  if (stroke && node.type !== 'LINE' && (node.strokeWeight ?? 1) > 0) {
    const w = node.strokeWeight ?? 1, c = paintToCss(stroke);
    const align = node.strokeAlign || 'INSIDE';
    if (align === 'INSIDE') css.boxShadow = `inset 0 0 0 ${px(w)} ${c}`;
    else if (align === 'OUTSIDE') { css.outline = `${px(w)} solid ${c}`; css.outlineOffset = '0px'; }
    else css.boxShadow = `0 0 0 ${px(w / 2)} ${c}, inset 0 0 0 ${px(w / 2)} ${c}`;
  }
  const shadows = [];
  const filters = [];
  for (const e of node.effects || []) {
    if (e.visible === false) continue;
    if (e.type === 'DROP_SHADOW') shadows.push(`${px(e.offset?.x)} ${px(e.offset?.y)} ${px(e.radius)} ${px(e.spread)} ${e.color || 'rgba(0,0,0,.25)'}`);
    if (e.type === 'INNER_SHADOW') shadows.push(`inset ${px(e.offset?.x)} ${px(e.offset?.y)} ${px(e.radius)} ${px(e.spread)} ${e.color || 'rgba(0,0,0,.25)'}`);
    if (e.type === 'LAYER_BLUR') filters.push(`blur(${px(e.radius)})`);
    if (e.type === 'BACKGROUND_BLUR') css.backdropFilter = `blur(${px(e.radius)})`;
  }
  if (shadows.length) css.boxShadow = [css.boxShadow, ...shadows].filter(Boolean).join(', ');
  if (filters.length) css.filter = filters.join(' ');
  if (node.opacity !== undefined && node.opacity !== 1) css.opacity = node.opacity;
  if (node.clipsContent && node.children) css.overflow = 'hidden';
  if (node.rotation) css.transform = `rotate(${-node.rotation}deg)`;
  if (node.visible === false) css.display = 'none';

  if (node.type === 'TEXT') {
    css.whiteSpace = 'pre-wrap';
    css.overflowWrap = 'break-word';
    css.margin = 0;
    const va = node.style?.textAlignVertical;
    if (va && va !== 'TOP' && sv === 'FIXED') { css.display = 'flex'; css.flexDirection = 'column'; css.justifyContent = va === 'CENTER' ? 'center' : 'flex-end'; }
  }
  return css;
}

/** camelCase style object -> CSS declarations text. */
export function toCssText(style, indent = '') {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${indent}${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/^webkit-/, '-webkit-')}: ${v};`)
    .join('\n');
}
