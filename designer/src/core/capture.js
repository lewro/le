// DOM -> design nodes. Runs inside a browser (the app's prototype viewer, or Playwright from the CLI).
// Converts an HTML page/element into the native node format using layout (getBoundingClientRect) and
// computed styles. Elements marked with data-component="Button" data-variant="Type=Primary" become
// library instances; data-name names a layer; data-le-id keeps an id (what exportHtml emits).
//
// This file must stay dependency-free: the CLI injects its source into a page as-is.

export function captureDocument(doc, options = {}) {
  const win = doc.defaultView;
  const rootEl = options.root ? doc.querySelector(options.root) : (doc.body.children.length === 1 ? doc.body.firstElementChild : doc.body);
  const rootRect = rootEl.getBoundingClientRect();
  const frame = captureElement(rootEl, win, { x: rootRect.left, y: rootRect.top }, options, 0);
  frame.name = options.name || frame.name || doc.title || 'Screen';
  delete frame.x; delete frame.y; // placed by auto-place when added to a page
  if (rootEl === doc.body) { frame.width = Math.round(Math.max(doc.documentElement.scrollWidth, rootRect.width)); frame.height = Math.round(Math.max(doc.documentElement.scrollHeight, rootRect.height)); }
  frame.layoutSizingHorizontal = 'FIXED'; frame.layoutSizingVertical = 'FIXED';
  frame.clipsContent = false; // keep overflowing menus/popovers visible on the screen
  return frame;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE', 'BR']);
const ALIGN = { 'flex-start': 'MIN', start: 'MIN', normal: 'MIN', stretch: 'MIN', center: 'CENTER', 'flex-end': 'MAX', end: 'MAX', 'space-between': 'SPACE_BETWEEN', 'space-around': 'SPACE_BETWEEN', 'space-evenly': 'SPACE_BETWEEN', baseline: 'BASELINE' };
const WEIGHTS = { normal: 400, bold: 700, lighter: 300, bolder: 700 };

function px(v) { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }

function parseColor(str) {
  if (!str) return null;
  const m = /rgba?\(([^)]+)\)/.exec(str);
  if (!m) return str.startsWith('#') ? str : null;
  const parts = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
  const a = parts.length > 3 ? parts[3] : 1;
  if (a === 0) return null;
  const h = (n) => Math.round(n).toString(16).padStart(2, '0');
  return '#' + h(parts[0]) + h(parts[1]) + h(parts[2]) + (a < 1 ? h(a * 255) : '');
}

function parseShadow(str) {
  if (!str || str === 'none') return [];
  // split on commas outside parentheses
  const parts = []; let depth = 0, cur = '';
  for (const ch of str) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  return parts.map((p) => {
    const inset = /inset/.test(p);
    const color = parseColor(p);
    const nums = p.replace(/rgba?\([^)]*\)/, '').replace('inset', '').trim().split(/\s+/).map(parseFloat).filter((n) => Number.isFinite(n));
    if (!color || nums.length < 2) return null;
    return { type: inset ? 'INNER_SHADOW' : 'DROP_SHADOW', offset: { x: nums[0], y: nums[1] }, radius: nums[2] || 0, spread: nums[3] || 0, color, visible: true };
  }).filter(Boolean);
}

function textOf(el) { return (el.innerText ?? el.textContent ?? '').replace(/\s+\n/g, '\n').trim(); }

function isTextOnly(el) {
  if (!el.childNodes.length) return false;
  for (const c of el.childNodes) {
    if (c.nodeType === 3) continue;
    if (c.nodeType === 1 && ['B', 'I', 'EM', 'STRONG', 'SPAN', 'A', 'SMALL', 'U', 'S', 'CODE', 'BR'].includes(c.tagName) && isTextOnly(c)) continue;
    return false;
  }
  return textOf(el).length > 0;
}

function captureText(el, cs, rect, origin) {
  const fam = (cs.fontFamily || 'Inter').split(',')[0].replace(/["']/g, '').trim();
  const lh = cs.lineHeight === 'normal' ? undefined : px(cs.lineHeight);
  const style = { fontFamily: fam, fontWeight: WEIGHTS[cs.fontWeight] || parseInt(cs.fontWeight, 10) || 400, fontSize: px(cs.fontSize), textAlignHorizontal: { left: 'LEFT', start: 'LEFT', center: 'CENTER', right: 'RIGHT', end: 'RIGHT', justify: 'JUSTIFIED' }[cs.textAlign] || 'LEFT', textAlignVertical: 'TOP' };
  if (lh) style.lineHeightPx = lh;
  if (cs.letterSpacing && cs.letterSpacing !== 'normal') style.letterSpacing = px(cs.letterSpacing);
  if (cs.fontStyle === 'italic') style.italic = true;
  if (cs.textDecorationLine?.includes('underline')) style.textDecoration = 'UNDERLINE';
  if (cs.textDecorationLine?.includes('line-through')) style.textDecoration = 'STRIKETHROUGH';
  if (cs.textTransform === 'uppercase') style.textCase = 'UPPER';
  if (cs.textTransform === 'lowercase') style.textCase = 'LOWER';
  if (cs.textTransform === 'capitalize') style.textCase = 'TITLE';
  const color = parseColor(cs.color) || '#000000';
  return { type: 'TEXT', characters: textOf(el), style, fills: [{ type: 'SOLID', color }], x: Math.round(rect.left - origin.x), y: Math.round(rect.top - origin.y), width: Math.round(rect.width), height: Math.round(rect.height), layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG' };
}

function appearance(el, cs, node) {
  const bg = parseColor(cs.backgroundColor);
  const fills = [];
  if (bg) fills.push({ type: 'SOLID', color: bg });
  const img = /url\(["']?([^"')]+)["']?\)/.exec(cs.backgroundImage || '');
  if (img) fills.push({ type: 'IMAGE', scaleMode: cs.backgroundSize === 'contain' ? 'FIT' : 'FILL', src: img[1] });
  else if (/gradient\(/.test(cs.backgroundImage || '')) { const cols = (cs.backgroundImage.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi) || []).map(parseColor).filter(Boolean); if (cols.length) fills.push({ type: 'GRADIENT_LINEAR', angle: 180, gradientStops: cols.map((c, i) => ({ position: cols.length === 1 ? 0 : i / (cols.length - 1), color: c })) }); }
  if (el.tagName === 'IMG' && el.currentSrc) fills.length = 0, fills.push({ type: 'IMAGE', scaleMode: cs.objectFit === 'contain' ? 'FIT' : 'FILL', src: el.currentSrc });
  if (fills.length) node.fills = fills; else node.fills = [];
  const bw = px(cs.borderTopWidth);
  const bc = parseColor(cs.borderTopColor);
  if (bw > 0 && bc && cs.borderTopStyle !== 'none') { node.strokes = [{ type: 'SOLID', color: bc }]; node.strokeWeight = bw; node.strokeAlign = 'INSIDE'; }
  const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((r) => px(String(r).split(' ')[0]));
  if (radii.some((r) => r)) { if (radii.every((r) => r === radii[0])) node.cornerRadius = radii[0]; else node.rectangleCornerRadii = radii; }
  const shadows = parseShadow(cs.boxShadow);
  if (shadows.length) node.effects = shadows;
  if (cs.opacity && parseFloat(cs.opacity) < 1) node.opacity = parseFloat(cs.opacity);
  if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') node.clipsContent = true; else node.clipsContent = false;
}

function nameOf(el) {
  if (el.dataset?.name) return el.dataset.name;
  if (el.dataset?.component) return el.dataset.component;
  const cls = (el.getAttribute('class') || '').split(/\s+/).filter((c) => c && !c.startsWith('le-'))[0];
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  return cls ? `${tag}.${cls}` : tag;
}

function htmlInfo(el) {
  const tag = el.tagName.toLowerCase();
  const h = { tag };
  const cls = (el.getAttribute('class') || '').split(/\s+/).filter((c) => c && !c.startsWith('le-')).join(' ');
  if (cls) h.className = cls;
  const attrs = {};
  for (const a of ['href', 'src', 'alt', 'title', 'placeholder', 'type', 'role', 'aria-label', 'target']) if (el.getAttribute(a)) attrs[a] = el.getAttribute(a);
  if (Object.keys(attrs).length) h.attrs = attrs;
  return h;
}

function captureElement(el, win, origin, options, depth) {
  const cs = win.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const base = { name: nameOf(el), html: htmlInfo(el) };
  if (el.dataset?.leId) base.id = el.dataset.leId;

  // library instance marker
  if (el.dataset?.component) {
    const inst = { ...base, type: 'INSTANCE', component: el.dataset.component, x: Math.round(rect.left - origin.x), y: Math.round(rect.top - origin.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    if (el.dataset.variant) { inst.variant = {}; for (const part of el.dataset.variant.split(',')) { const i = part.indexOf('='); if (i > 0) inst.variant[part.slice(0, i).trim()] = part.slice(i + 1).trim(); } }
    const overrides = {};
    const texts = el.querySelectorAll('[data-name]');
    let any = false;
    for (const t of texts) if (!t.children.length && textOf(t)) { overrides[t.dataset.name] = { characters: textOf(t) }; any = true; }
    if (!any && textOf(el)) overrides['@TEXT'] = { characters: textOf(el).split('\n')[0] };
    if (Object.keys(overrides).length) inst.overrides = overrides;
    if (el.dataset.sizing === 'fill' || parseFloat(cs.flexGrow) > 0) inst.layoutSizingHorizontal = 'FILL';
    return inst;
  }

  if (el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'svg' || el.tagName === 'CANVAS' || el.tagName === 'VIDEO') {
    const node = { ...base, type: 'RECTANGLE', x: Math.round(rect.left - origin.x), y: Math.round(rect.top - origin.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    appearance(el, cs, node);
    if (!node.fills.length) node.fills = [{ type: 'SOLID', color: '#e2e8f0' }];
    if (el.tagName === 'IMG') node.html.tag = 'img';
    return node;
  }

  const textOnly = isTextOnly(el);
  const hasBox = parseColor(cs.backgroundColor) || px(cs.borderTopWidth) > 0 || /url\(|gradient\(/.test(cs.backgroundImage || '') || cs.boxShadow !== 'none';
  if (textOnly && !hasBox && !['BUTTON', 'A', 'LABEL', 'INPUT'].includes(el.tagName)) {
    const t = captureText(el, cs, rect, origin);
    return { ...base, ...t, html: base.html };
  }
  if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && !el.children.length) {
    const node = { ...base, type: 'FRAME', x: Math.round(rect.left - origin.x), y: Math.round(rect.top - origin.y), width: Math.round(rect.width), height: Math.round(rect.height), layoutMode: 'HORIZONTAL', counterAxisAlignItems: 'CENTER', paddingLeft: px(cs.paddingLeft), paddingRight: px(cs.paddingRight), paddingTop: px(cs.paddingTop), paddingBottom: px(cs.paddingBottom), children: [] };
    appearance(el, cs, node);
    const text = el.value || el.placeholder || (el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : '') || '';
    if (text) { const t = captureText(el, cs, rect, origin); t.characters = text; t.layoutSizingHorizontal = 'HUG'; if (!el.value && el.placeholder) t.fills = [{ type: 'SOLID', color: parseColor(cs.color) ? withAlpha(parseColor(cs.color), 0.55) : '#94a3b8' }]; delete t.x; delete t.y; node.children.push({ name: 'Value', ...t }); }
    return node;
  }

  const node = { ...base, type: 'FRAME', x: Math.round(rect.left - origin.x), y: Math.round(rect.top - origin.y), width: Math.round(rect.width), height: Math.round(rect.height), children: [] };
  appearance(el, cs, node);
  const display = cs.display;
  const isFlex = display === 'flex' || display === 'inline-flex';
  const childEls = [...el.children].filter((c) => !SKIP.has(c.tagName) && win.getComputedStyle(c).display !== 'none' && (c.getBoundingClientRect().width > 0 || c.getBoundingClientRect().height > 0));
  const inner = { x: rect.left, y: rect.top };

  if (isFlex) {
    node.layoutMode = cs.flexDirection.startsWith('column') ? 'VERTICAL' : 'HORIZONTAL';
    if (cs.flexWrap === 'wrap') node.layoutWrap = 'WRAP';
    const gapMain = node.layoutMode === 'HORIZONTAL' ? cs.columnGap : cs.rowGap;
    const gapCross = node.layoutMode === 'HORIZONTAL' ? cs.rowGap : cs.columnGap;
    node.itemSpacing = gapMain === 'normal' ? 0 : px(gapMain);
    if (node.layoutWrap === 'WRAP') node.counterAxisSpacing = gapCross === 'normal' ? 0 : px(gapCross);
    node.primaryAxisAlignItems = ALIGN[cs.justifyContent] || 'MIN';
    node.counterAxisAlignItems = ALIGN[cs.alignItems] || 'MIN';
  }
  node.paddingTop = px(cs.paddingTop); node.paddingRight = px(cs.paddingRight); node.paddingBottom = px(cs.paddingBottom); node.paddingLeft = px(cs.paddingLeft);
  const directText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
  const mixedText = directText && !isFlex;
  if (directText && isFlex) {
    // flex container with its own text (a <button>, a <label>…): the text becomes a hugging child
    const t = captureText(el, cs, rect, inner);
    t.characters = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').replace(/\s+/g, ' ').trim();
    delete t.x; delete t.y; t.layoutSizingHorizontal = 'HUG';
    if (t.characters) node.children.push({ name: 'Text', ...t });
    if (!childEls.length) { node.layoutMode = node.layoutMode || 'HORIZONTAL'; }
  }

  for (const c of childEls) {
    const child = captureElement(c, win, inner, options, depth + 1);
    if (!child) continue;
    const ccs = win.getComputedStyle(c);
    if (isFlex) {
      delete child.x; delete child.y;
      const grow = parseFloat(ccs.flexGrow) > 0;
      const stretch = (cs.alignItems === 'stretch' || cs.alignItems === 'normal') && ccs.alignSelf !== 'center' && ccs.alignSelf !== 'flex-start' && ccs.alignSelf !== 'flex-end';
      if (node.layoutMode === 'HORIZONTAL') { if (grow) child.layoutSizingHorizontal = 'FILL'; if (stretch && child.type !== 'TEXT' && ccs.height === 'auto') child.layoutSizingVertical = 'FILL'; }
      else { if (grow) child.layoutSizingVertical = 'FILL'; if (stretch && child.type !== 'TEXT' && (ccs.width === 'auto' || ccs.width === '100%' || c.getBoundingClientRect().width >= rect.width - px(cs.paddingLeft) - px(cs.paddingRight) - 1)) child.layoutSizingHorizontal = 'FILL'; }
      if (child.type === 'TEXT' && !grow && child.layoutSizingHorizontal !== 'FILL') { child.layoutSizingHorizontal = 'HUG'; }
      if (ccs.position === 'absolute' || ccs.position === 'fixed') { child.layoutPositioning = 'ABSOLUTE'; const cr = c.getBoundingClientRect(); child.x = Math.round(cr.left - rect.left); child.y = Math.round(cr.top - rect.top); }
    }
    node.children.push(child);
  }
  if (mixedText) {
    // block with inline text and elements: keep the text as one TEXT node behind the elements
    const t = captureText(el, cs, rect, inner);
    t.width = Math.round(rect.width - px(cs.paddingLeft) - px(cs.paddingRight)); t.x = px(cs.paddingLeft); t.y = px(cs.paddingTop);
    node.children.unshift({ name: 'Text', ...t });
  }
  // block stacks: convert vertically stacked, non-overlapping children into a column layout
  if (!isFlex && node.children.length > 1 && node.children.every((c) => c.x !== undefined)) {
    const ks = node.children;
    const stacked = ks.every((c, i) => i === 0 || c.y >= ks[i - 1].y + ks[i - 1].height - 1);
    const gaps = ks.slice(1).map((c, i) => c.y - (ks[i].y + ks[i].height));
    if (stacked && gaps.every((g) => Math.abs(g - gaps[0]) <= 1)) {
      node.layoutMode = 'VERTICAL'; node.itemSpacing = Math.max(0, Math.round(gaps[0]));
      node.paddingTop = ks[0].y; node.paddingLeft = Math.min(...ks.map((c) => c.x));
      node.paddingBottom = Math.max(0, Math.round(rect.height - (ks[ks.length - 1].y + ks[ks.length - 1].height)));
      node.paddingRight = Math.max(0, Math.round(rect.width - Math.max(...ks.map((c) => c.x + c.width)) ));
      for (const c of ks) { if (c.width >= rect.width - node.paddingLeft - node.paddingRight - 2 && c.type !== 'TEXT') c.layoutSizingHorizontal = 'FILL'; delete c.x; delete c.y; }
    }
  }
  if (!node.children.length) delete node.layoutMode;
  // sizing
  const parentFlex = el.parentElement && /flex/.test(win.getComputedStyle(el.parentElement).display);
  if (['BUTTON', 'A', 'SPAN', 'LABEL'].includes(el.tagName) && cs.width === 'auto' && node.layoutMode) { node.layoutSizingHorizontal = 'HUG'; node.layoutSizingVertical = 'HUG'; }
  else { node.layoutSizingHorizontal = node.layoutSizingHorizontal || 'FIXED'; node.layoutSizingVertical = node.layoutMode && cs.height === 'auto' ? 'HUG' : 'FIXED'; }
  void parentFlex; void depth;
  return node;
}

function withAlpha(hex, a) { const h = (n) => Math.round(n).toString(16).padStart(2, '0'); return hex.slice(0, 7) + h(a * 255); }
