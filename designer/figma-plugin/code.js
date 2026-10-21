// LE Designer Sync — Figma plugin main thread.
// Imports native LE Designer JSON into the current page and exports Figma nodes back to the same format.
// Install: Figma → Plugins → Development → Import plugin from manifest… → pick figma-plugin/manifest.json

figma.showUI(__html__, { width: 460, height: 560 });

const STYLE_BY_WEIGHT = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const WEIGHT_BY_STYLE = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, heavy: 800, black: 900 };

const round = (n) => Math.round((n || 0) * 100) / 100;

function hexToRgba(hex) {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255 || 0, g = parseInt(h.slice(2, 4), 16) / 255 || 0, b = parseInt(h.slice(4, 6), 16) / 255 || 0;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}
function rgbaToHex(c, a) {
  const h = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
  const alpha = a === undefined ? (c.a === undefined ? 1 : c.a) : a;
  return '#' + h(c.r) + h(c.g) + h(c.b) + (alpha < 1 ? h(alpha) : '');
}

// ------------------------------------------------------------------ import (JSON -> Figma)

async function paintToFigma(p) {
  if (!p) return null;
  const base = { visible: p.visible !== false, blendMode: 'NORMAL' };
  if (p.type === 'SOLID') {
    const c = hexToRgba(p.color);
    return Object.assign(base, { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: (p.opacity === undefined ? 1 : p.opacity) * c.a });
  }
  if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL') {
    const rad = (-((p.angle === undefined ? 180 : p.angle) - 90) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // rotate around the center of the unit square
    const gradientTransform = [[cos, -sin, 0.5 - 0.5 * cos + 0.5 * sin], [sin, cos, 0.5 - 0.5 * sin - 0.5 * cos]];
    return Object.assign(base, {
      type: p.type, gradientTransform,
      gradientStops: (p.gradientStops || []).map((s) => { const c = hexToRgba(s.color); return { position: s.position || 0, color: { r: c.r, g: c.g, b: c.b, a: c.a } }; }),
      opacity: p.opacity === undefined ? 1 : p.opacity,
    });
  }
  if (p.type === 'IMAGE') {
    try {
      if (p.src) { const img = await figma.createImageAsync(p.src); return Object.assign(base, { type: 'IMAGE', scaleMode: p.scaleMode || 'FILL', imageHash: img.hash }); }
      if (p.imageRef) return Object.assign(base, { type: 'IMAGE', scaleMode: p.scaleMode || 'FILL', imageHash: p.imageRef });
    } catch (e) { figma.ui.postMessage({ type: 'status', text: 'Image could not be loaded: ' + e.message }); }
    return Object.assign(base, { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 }, opacity: 1 });
  }
  return null;
}

async function paintsToFigma(list) {
  const out = [];
  for (const p of list || []) { const f = await paintToFigma(p); if (f) out.push(f); }
  return out;
}

function effectsToFigma(list) {
  return (list || []).map((e) => {
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      const c = hexToRgba(e.color || '#00000040');
      return { type: e.type, color: { r: c.r, g: c.g, b: c.b, a: c.a }, offset: { x: (e.offset && e.offset.x) || 0, y: (e.offset && e.offset.y) || 0 }, radius: e.radius || 0, spread: e.spread || 0, visible: e.visible !== false, blendMode: 'NORMAL' };
    }
    if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') return { type: e.type, radius: e.radius || 0, visible: e.visible !== false };
    return null;
  }).filter(Boolean);
}

async function loadFont(family, weight, italic) {
  const style = (STYLE_BY_WEIGHT[weight] || 'Regular') + (italic ? ' Italic' : '');
  const candidates = [{ family, style }, { family, style: style.replace('SemiBold', 'Semi Bold').replace('ExtraBold', 'Extra Bold') }, { family, style: 'Regular' }, { family: 'Inter', style }, { family: 'Inter', style: 'Regular' }];
  for (const f of candidates) { try { await figma.loadFontAsync(f); return f; } catch (e) { /* try next */ } }
  throw new Error('No font could be loaded');
}

const isAuto = (node) => 'layoutMode' in node && node.layoutMode !== 'NONE';

/** Try to create a real Figma instance for an INSTANCE node (library component by key, or a component in this file). */
async function tryInstance(n, parent) {
  let component = null;
  if (n.componentKey) { try { component = await figma.importComponentByKeyAsync(n.componentKey); } catch (e) { component = null; } }
  if (!component && n.componentId) { try { const c = await figma.getNodeByIdAsync(n.componentId); if (c && c.type === 'COMPONENT') component = c; } catch (e) { component = null; } }
  if (!component && n.component) {
    const found = figma.root.findOne((x) => (x.type === 'COMPONENT' || x.type === 'COMPONENT_SET') && x.name === n.component);
    if (found) component = found.type === 'COMPONENT_SET' ? found.defaultVariant : found;
  }
  if (!component) return null;
  let inst = component.createInstance();
  parent.appendChild(inst);
  if (n.variant && inst.variantProperties) { try { inst.setProperties(n.variant); } catch (e) { /* unknown variant */ } }
  // text overrides by child name (or first text for @TEXT)
  const ov = n.overrides || {};
  for (const sel in ov) {
    const o = ov[sel];
    const targets = sel === '@TEXT' ? [inst.findOne((x) => x.type === 'TEXT')] : inst.findAll((x) => x.name === sel.split('/').pop());
    for (const t of targets) {
      if (!t) continue;
      if (o.characters !== undefined && t.type === 'TEXT') { try { await figma.loadFontAsync(t.fontName); t.characters = o.characters; } catch (e) { /* mixed fonts */ } }
      if (o.visible === false) t.visible = false;
      if (o.fills && 'fills' in t) t.fills = await paintsToFigma(o.fills);
    }
  }
  return inst;
}

async function build(n, parent) {
  const type = n.type || 'FRAME';
  let node;
  if (type === 'INSTANCE') {
    node = await tryInstance(n, parent);
    if (node) {
      node.name = n.name || node.name;
      const parentAuto = isAuto(parent);
      if (!parentAuto || n.layoutPositioning === 'ABSOLUTE') { if (parentAuto) node.layoutPositioning = 'ABSOLUTE'; node.x = n.x || 0; node.y = n.y || 0; }
      if (n.width && n.height && n.layoutSizingHorizontal === 'FIXED') node.resize(n.width, n.height);
      try { if (n.layoutSizingHorizontal === 'FILL' && parentAuto) node.layoutSizingHorizontal = 'FILL'; } catch (e) { /* ignore */ }
      try { if (n.layoutSizingVertical === 'FILL' && parentAuto) node.layoutSizingVertical = 'FILL'; } catch (e) { /* ignore */ }
      if (n.opacity !== undefined) node.opacity = n.opacity;
      if (n.visible === false) node.visible = false;
      if (n.html) node.setSharedPluginData('le', 'html', JSON.stringify(n.html));
      return node;
    }
    if (!n.children) { figma.ui.postMessage({ type: 'status', text: `Component "${n.component}" not found; export with "expanded" to keep its contents` }); }
  }
  if (type === 'TEXT') node = figma.createText();
  else if (type === 'RECTANGLE') node = figma.createRectangle();
  else if (type === 'ELLIPSE') node = figma.createEllipse();
  else if (type === 'LINE') node = figma.createLine();
  else node = figma.createFrame(); // FRAME, GROUP, COMPONENT, INSTANCE, SECTION ...
  node.name = n.name || type;

  const w = Math.max(0.01, n.width || (type === 'TEXT' ? 100 : 100)), h = Math.max(0.01, n.height || 100);
  if (type === 'LINE') node.resize(w, 0);
  else if (type !== 'TEXT') node.resize(w, h);

  if (type === 'TEXT') {
    const s = n.style || {};
    const font = await loadFont(s.fontFamily || 'Inter', s.fontWeight || 400, !!s.italic);
    node.fontName = font;
    node.characters = n.characters || '';
    node.fontSize = s.fontSize || 16;
    node.lineHeight = s.lineHeightPx ? { unit: 'PIXELS', value: s.lineHeightPx } : s.lineHeightPercentFontSize ? { unit: 'PERCENT', value: s.lineHeightPercentFontSize } : { unit: 'AUTO' };
    node.letterSpacing = { unit: 'PIXELS', value: s.letterSpacing || 0 };
    node.textAlignHorizontal = s.textAlignHorizontal || 'LEFT';
    node.textAlignVertical = s.textAlignVertical || 'TOP';
    node.textDecoration = s.textDecoration || 'NONE';
    node.textCase = s.textCase || 'ORIGINAL';
    const sh = n.layoutSizingHorizontal || 'HUG', sv = n.layoutSizingVertical || 'HUG';
    if (sh === 'HUG' && sv === 'HUG') node.textAutoResize = 'WIDTH_AND_HEIGHT';
    else if (sv === 'HUG') { node.textAutoResize = 'HEIGHT'; node.resize(w, node.height); }
    else { node.textAutoResize = 'NONE'; node.resize(w, h); }
  }

  if ('fills' in node) {
    if (n.fills) node.fills = await paintsToFigma(n.fills);
    else if (type === 'GROUP') node.fills = [];
  }
  if ('strokes' in node && n.strokes) { node.strokes = await paintsToFigma(n.strokes); node.strokeWeight = n.strokeWeight === undefined ? 1 : n.strokeWeight; node.strokeAlign = n.strokeAlign || 'INSIDE'; }
  if ('cornerRadius' in node) {
    if (n.rectangleCornerRadii && 'topLeftRadius' in node) { [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius] = n.rectangleCornerRadii; }
    else if (n.cornerRadius !== undefined) node.cornerRadius = n.cornerRadius;
  }
  if (n.opacity !== undefined) node.opacity = n.opacity;
  if ('effects' in node && n.effects) node.effects = effectsToFigma(n.effects);
  if (n.visible === false) node.visible = false;
  if (n.locked) node.locked = true;
  if ('clipsContent' in node) node.clipsContent = type === 'GROUP' ? false : n.clipsContent !== false;

  parent.appendChild(node);

  if ('layoutMode' in node && n.layoutMode && n.layoutMode !== 'NONE') {
    node.layoutMode = n.layoutMode;
    if (n.layoutWrap === 'WRAP') node.layoutWrap = 'WRAP';
    node.paddingTop = n.paddingTop || 0; node.paddingRight = n.paddingRight || 0; node.paddingBottom = n.paddingBottom || 0; node.paddingLeft = n.paddingLeft || 0;
    node.itemSpacing = n.itemSpacing || 0;
    if (n.layoutWrap === 'WRAP') node.counterAxisSpacing = n.counterAxisSpacing === undefined ? (n.itemSpacing || 0) : n.counterAxisSpacing;
    node.primaryAxisAlignItems = n.primaryAxisAlignItems || 'MIN';
    node.counterAxisAlignItems = n.counterAxisAlignItems || 'MIN';
  }

  const parentAuto = isAuto(parent);
  if (!parentAuto || n.layoutPositioning === 'ABSOLUTE') {
    if (parentAuto) node.layoutPositioning = 'ABSOLUTE';
    node.x = n.x || 0; node.y = n.y || 0;
  }
  if (n.rotation) node.rotation = n.rotation;

  const sh = n.layoutSizingHorizontal || (type === 'TEXT' ? 'HUG' : 'FIXED');
  const sv = n.layoutSizingVertical || (type === 'TEXT' ? 'HUG' : 'FIXED');
  const canHug = type === 'TEXT' || isAuto(node);
  try { if (sh === 'FILL' && parentAuto) node.layoutSizingHorizontal = 'FILL'; else if (sh === 'HUG' && canHug) node.layoutSizingHorizontal = 'HUG'; } catch (e) { /* unsupported combination */ }
  try { if (sv === 'FILL' && parentAuto) node.layoutSizingVertical = 'FILL'; else if (sv === 'HUG' && canHug) node.layoutSizingVertical = 'HUG'; } catch (e) { /* unsupported combination */ }

  if (n.html) node.setSharedPluginData('le', 'html', JSON.stringify(n.html));
  if (n.id) node.setSharedPluginData('le', 'id', String(n.id));

  for (const c of n.children || []) await build(c, node);
  return node;
}

async function importJson(json) {
  let roots;
  if (json.format && json.children && json.children[0] && json.children[0].type === 'CANVAS') roots = json.children.flatMap((p) => p.children || []);
  else if (json.type === 'CANVAS') roots = json.children || [];
  else if (Array.isArray(json)) roots = json;
  else if (json.type) roots = [json];
  else throw new Error('Unrecognized JSON (expected an LE Designer document or node)');
  const created = [];
  for (const r of roots) created.push(await build(r, figma.currentPage));
  figma.currentPage.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
  return created.length;
}

// ------------------------------------------------------------------ export (Figma -> JSON)

function paintFromFigma(p) {
  if (!p) return null;
  const out = { type: p.type };
  if (p.visible === false) out.visible = false;
  if (p.type === 'SOLID') out.color = rgbaToHex(p.color, p.opacity === undefined ? 1 : p.opacity);
  else if (p.type.indexOf('GRADIENT') === 0) {
    out.gradientStops = (p.gradientStops || []).map((s) => ({ position: round(s.position), color: rgbaToHex(s.color) }));
    const t = p.gradientTransform;
    if (t) out.angle = Math.round((Math.atan2(t[1][0], t[0][0]) * -180) / Math.PI + 90);
    if (p.opacity !== undefined && p.opacity !== 1) out.opacity = p.opacity;
  } else if (p.type === 'IMAGE') { out.scaleMode = p.scaleMode; out.imageRef = p.imageHash; if (p.opacity !== undefined && p.opacity !== 1) out.opacity = p.opacity; }
  else return null;
  return out;
}

function effectFromFigma(e) {
  const out = { type: e.type, visible: e.visible !== false, radius: round(e.radius) };
  if (e.color) out.color = rgbaToHex(e.color);
  if (e.offset) out.offset = { x: round(e.offset.x), y: round(e.offset.y) };
  if (e.spread) out.spread = round(e.spread);
  return out;
}

function serialize(node) {
  const n = { id: node.id, name: node.name, type: node.type };
  if (node.type === 'COMPONENT_SET') n.type = 'FRAME';
  if (node.type === 'BOOLEAN_OPERATION' || node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'POLYGON') n.type = node.type === 'BOOLEAN_OPERATION' ? 'GROUP' : 'VECTOR';
  if (!node.visible) n.visible = false;
  if (node.locked) n.locked = true;
  if ('x' in node) { n.x = round(node.x); n.y = round(node.y); n.width = round(node.width); n.height = round(node.height); }
  if (node.rotation) n.rotation = round(node.rotation);
  if ('opacity' in node && node.opacity !== 1) n.opacity = round(node.opacity);
  if ('fills' in node && node.fills !== figma.mixed) n.fills = node.fills.map(paintFromFigma).filter(Boolean);
  if ('strokes' in node && node.strokes.length) {
    n.strokes = node.strokes.map(paintFromFigma).filter(Boolean);
    if (node.strokeWeight !== figma.mixed) n.strokeWeight = round(node.strokeWeight);
    n.strokeAlign = node.strokeAlign;
  }
  if ('cornerRadius' in node) {
    if (node.cornerRadius === figma.mixed) n.rectangleCornerRadii = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius].map(round);
    else if (node.cornerRadius) n.cornerRadius = round(node.cornerRadius);
  }
  if ('effects' in node && node.effects.length) n.effects = node.effects.map(effectFromFigma);
  if ('clipsContent' in node && !node.clipsContent) n.clipsContent = false;
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    n.layoutMode = node.layoutMode;
    if (node.layoutWrap === 'WRAP') { n.layoutWrap = 'WRAP'; n.counterAxisSpacing = round(node.counterAxisSpacing); }
    n.paddingTop = round(node.paddingTop); n.paddingRight = round(node.paddingRight); n.paddingBottom = round(node.paddingBottom); n.paddingLeft = round(node.paddingLeft);
    n.itemSpacing = round(node.itemSpacing);
    n.primaryAxisAlignItems = node.primaryAxisAlignItems;
    n.counterAxisAlignItems = node.counterAxisAlignItems;
  }
  if ('layoutSizingHorizontal' in node) { n.layoutSizingHorizontal = node.layoutSizingHorizontal; n.layoutSizingVertical = node.layoutSizingVertical; }
  if ('layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE') n.layoutPositioning = 'ABSOLUTE';
  if (node.type === 'TEXT') {
    n.characters = node.characters;
    const s = {};
    if (node.fontName !== figma.mixed) {
      s.fontFamily = node.fontName.family;
      const styleWords = node.fontName.style.toLowerCase().replace(/\s+/g, '');
      s.fontWeight = 400;
      for (const k in WEIGHT_BY_STYLE) if (styleWords.indexOf(k) === 0) { s.fontWeight = WEIGHT_BY_STYLE[k]; break; }
      if (styleWords.indexOf('italic') >= 0) s.italic = true;
    }
    if (node.fontSize !== figma.mixed) s.fontSize = round(node.fontSize);
    if (node.lineHeight !== figma.mixed) { if (node.lineHeight.unit === 'PIXELS') s.lineHeightPx = round(node.lineHeight.value); else if (node.lineHeight.unit === 'PERCENT') s.lineHeightPercentFontSize = round(node.lineHeight.value); }
    if (node.letterSpacing !== figma.mixed && node.letterSpacing.unit === 'PIXELS' && node.letterSpacing.value) s.letterSpacing = round(node.letterSpacing.value);
    s.textAlignHorizontal = node.textAlignHorizontal; s.textAlignVertical = node.textAlignVertical;
    if (node.textDecoration !== figma.mixed && node.textDecoration !== 'NONE') s.textDecoration = node.textDecoration;
    if (node.textCase !== figma.mixed && node.textCase !== 'ORIGINAL') s.textCase = node.textCase;
    n.style = s;
  }
  if (node.type === 'INSTANCE' && node.mainComponent) {
    const mc = node.mainComponent;
    n.componentId = mc.id;
    if (mc.key) n.componentKey = mc.key;
    const set = mc.parent && mc.parent.type === 'COMPONENT_SET' ? mc.parent : null;
    n.component = set ? set.name : mc.name;
    if (set) { const v = {}; mc.name.split(',').forEach((p) => { const i = p.indexOf('='); if (i > 0) v[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }); n.variant = v; }
  }
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') { if (node.key) n.key = node.key; if (node.description) n.description = node.description; }
  const html = node.getSharedPluginData('le', 'html');
  if (html) { try { n.html = JSON.parse(html); } catch (e) { /* ignore */ } }
  if ('children' in node) n.children = node.children.map(serialize);
  return n;
}

function exportNodes(nodes) {
  return {
    format: 'le-design/1', name: figma.root.name, type: 'DOCUMENT', id: '0:0', meta: { seq: 1 },
    children: [{ id: figma.currentPage.id, type: 'CANVAS', name: figma.currentPage.name, children: nodes.map(serialize) }],
  };
}

// ------------------------------------------------------------------ messages

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'import') {
      const count = await importJson(msg.json);
      figma.ui.postMessage({ type: 'status', text: `Imported ${count} top-level node(s)` });
      figma.notify(`LE Designer: imported ${count} node(s)`);
    } else if (msg.type === 'export') {
      const nodes = msg.scope === 'page' ? figma.currentPage.children : figma.currentPage.selection;
      if (!nodes.length) throw new Error('Nothing selected');
      figma.ui.postMessage({ type: 'exported', json: exportNodes(nodes), count: nodes.length });
    }
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: e.message });
  }
};
