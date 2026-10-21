// Conversion between the native document format and Figma's REST API JSON.
//
//   fromFigma(json)  accepts: GET /v1/files/:key response, GET /v1/files/:key/nodes response,
//                    a single Figma node, the output of the bundled Figma plugin, or a native doc (passthrough).
//   toFigma(doc)     produces a /v1/files-shaped JSON (absoluteBoundingBox, float colors, sizing modes...).
//                    The bundled plugin (figma-plugin/) reads the NATIVE format, so for pushing into Figma
//                    use the native JSON; use toFigma() for tools expecting the REST shape.

import { FORMAT, createDocument, assignIds, walk, hasAutoLayout, sizingH, sizingV, pathTo } from './model.js';
import { hexToRgba, rgbaToHex } from './style.js';

const KEEP = new Set([
  'id', 'name', 'type', 'visible', 'locked', 'rotation', 'opacity', 'blendMode', 'clipsContent',
  'layoutMode', 'layoutWrap', 'primaryAxisSizingMode', 'counterAxisSizingMode', 'primaryAxisAlignItems', 'counterAxisAlignItems',
  'counterAxisAlignContent', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing', 'counterAxisSpacing',
  'layoutAlign', 'layoutGrow', 'layoutPositioning', 'layoutSizingHorizontal', 'layoutSizingVertical',
  'cornerRadius', 'rectangleCornerRadii', 'strokeWeight', 'strokeAlign', 'characters', 'componentId', 'componentPropertyDefinitions',
]);

function figColorToHex(c, opacity) {
  if (!c) return '#000000';
  const a = (c.a ?? 1) * (opacity ?? 1);
  return rgbaToHex({ r: c.r * 255, g: c.g * 255, b: c.b * 255, a });
}

function hexToFigColor(hex) {
  const { r, g, b, a } = hexToRgba(hex);
  return { r: r / 255, g: g / 255, b: b / 255, a };
}

function paintFromFigma(p) {
  if (!p) return null;
  const out = { type: p.type };
  if (p.visible === false) out.visible = false;
  if (p.opacity !== undefined && p.opacity !== 1) out.opacity = p.opacity;
  if (p.type === 'SOLID') out.color = figColorToHex(p.color);
  else if (p.type.startsWith('GRADIENT')) {
    out.gradientStops = (p.gradientStops || []).map((s) => ({ position: s.position, color: figColorToHex(s.color) }));
    const h = p.gradientHandlePositions;
    if (h && h.length >= 2) out.angle = Math.round((Math.atan2(h[1].y - h[0].y, h[1].x - h[0].x) * 180) / Math.PI + 90);
  } else if (p.type === 'IMAGE') { out.scaleMode = p.scaleMode || 'FILL'; if (p.imageRef) out.imageRef = p.imageRef; if (p.src) out.src = p.src; }
  return out;
}

function paintToFigma(p) {
  if (!p) return null;
  const out = { blendMode: 'NORMAL', type: p.type };
  if (p.visible === false) out.visible = false;
  if (p.opacity !== undefined) out.opacity = p.opacity;
  if (p.type === 'SOLID') { const c = hexToFigColor(p.color); out.color = { r: c.r, g: c.g, b: c.b, a: 1 }; if (c.a < 1) out.opacity = (p.opacity ?? 1) * c.a; }
  else if (p.type.startsWith('GRADIENT')) {
    out.gradientStops = (p.gradientStops || []).map((s) => ({ position: s.position, color: hexToFigColor(s.color) }));
    const rad = (((p.angle ?? 180) - 90) * Math.PI) / 180;
    out.gradientHandlePositions = [{ x: 0.5 - Math.cos(rad) / 2, y: 0.5 - Math.sin(rad) / 2 }, { x: 0.5 + Math.cos(rad) / 2, y: 0.5 + Math.sin(rad) / 2 }, { x: 0, y: 0.5 }];
  } else if (p.type === 'IMAGE') { out.scaleMode = p.scaleMode || 'FILL'; if (p.imageRef) out.imageRef = p.imageRef; if (p.src) out.src = p.src; }
  return out;
}

function effectFromFigma(e) {
  const out = { type: e.type, visible: e.visible !== false, radius: e.radius || 0 };
  if (e.color) out.color = figColorToHex(e.color);
  if (e.offset) out.offset = { x: e.offset.x, y: e.offset.y };
  if (e.spread) out.spread = e.spread;
  return out;
}

function effectToFigma(e) {
  const out = { type: e.type, visible: e.visible !== false, radius: e.radius || 0, blendMode: 'NORMAL' };
  if (e.color) out.color = hexToFigColor(e.color);
  if (e.offset) out.offset = e.offset;
  if (e.spread) out.spread = e.spread;
  if (e.type === 'DROP_SHADOW') out.showShadowBehindNode = false;
  return out;
}

function textStyleFromFigma(s) {
  if (!s) return undefined;
  const out = {
    fontFamily: s.fontFamily || 'Inter', fontWeight: s.fontWeight || 400, fontSize: s.fontSize || 16,
    textAlignHorizontal: s.textAlignHorizontal || 'LEFT', textAlignVertical: s.textAlignVertical || 'TOP',
  };
  if (s.italic) out.italic = true;
  if (s.letterSpacing) out.letterSpacing = s.letterSpacing;
  if (s.lineHeightUnit === 'PIXELS' && s.lineHeightPx) out.lineHeightPx = s.lineHeightPx;
  else if (s.lineHeightUnit === 'FONT_SIZE_%' && s.lineHeightPercentFontSize) out.lineHeightPercentFontSize = s.lineHeightPercentFontSize;
  else if (s.lineHeightUnit === 'INTRINSIC_%' && s.lineHeightPercent && s.lineHeightPercent !== 100) out.lineHeightPx = s.lineHeightPx;
  if (s.textDecoration && s.textDecoration !== 'NONE') out.textDecoration = s.textDecoration;
  if (s.textCase && s.textCase !== 'ORIGINAL') out.textCase = s.textCase;
  return out;
}

/** Convert one Figma node (recursively). parentAbs = parent's absolute bbox or null. */
function nodeFromFigma(f, parentAbs) {
  const n = {};
  for (const k of KEEP) if (f[k] !== undefined) n[k] = f[k];
  if (f.type === 'CANVAS') { n.children = (f.children || []).map((c) => nodeFromFigma(c, null)); return n; }
  const bb = f.absoluteBoundingBox || f.absoluteRenderBounds;
  if (bb) {
    n.x = Math.round(((bb.x || 0) - (parentAbs ? parentAbs.x : 0)) * 100) / 100;
    n.y = Math.round(((bb.y || 0) - (parentAbs ? parentAbs.y : 0)) * 100) / 100;
    n.width = Math.round((bb.width || 0) * 100) / 100;
    n.height = Math.round((bb.height || 0) * 100) / 100;
  } else if (f.x !== undefined) { n.x = f.x; n.y = f.y; n.width = f.width; n.height = f.height; }
  if (f.fills) n.fills = f.fills.map(paintFromFigma).filter(Boolean);
  if (f.strokes) n.strokes = f.strokes.map(paintFromFigma).filter(Boolean);
  if (f.effects) n.effects = f.effects.map(effectFromFigma);
  if (f.type === 'TEXT') {
    n.style = textStyleFromFigma(f.style);
    if (!n.layoutSizingHorizontal) {
      const ar = f.textAutoResize || 'NONE';
      n.layoutSizingHorizontal = ar === 'WIDTH_AND_HEIGHT' ? 'HUG' : 'FIXED';
      n.layoutSizingVertical = ar === 'NONE' ? 'FIXED' : 'HUG';
    }
  } else if (!n.layoutSizingHorizontal && hasAutoLayout(n)) {
    const row = n.layoutMode === 'HORIZONTAL';
    const primaryHug = n.primaryAxisSizingMode === 'AUTO', counterHug = n.counterAxisSizingMode === 'AUTO';
    n.layoutSizingHorizontal = (row ? primaryHug : counterHug) ? 'HUG' : 'FIXED';
    n.layoutSizingVertical = (row ? counterHug : primaryHug) ? 'HUG' : 'FIXED';
  }
  delete n.primaryAxisSizingMode; delete n.counterAxisSizingMode;
  if (f.layoutMode === 'NONE') delete n.layoutMode;
  if (f.visible === true) delete n.visible;
  if (f.sharedPluginData?.le?.html) { try { n.html = JSON.parse(f.sharedPluginData.le.html); } catch { /* ignore */ } }
  if (f.html) n.html = f.html;
  if (f.children) {
    n.children = f.children.map((c) => nodeFromFigma(c, bb || null));
    // layoutGrow/layoutAlign -> FILL sizing on the parent's axes
    if (hasAutoLayout(n)) for (const c of n.children) {
      const row = n.layoutMode === 'HORIZONTAL';
      if (c.layoutGrow === 1) { if (row) c.layoutSizingHorizontal = 'FILL'; else c.layoutSizingVertical = 'FILL'; }
      if (c.layoutAlign === 'STRETCH') { if (row) c.layoutSizingVertical = 'FILL'; else c.layoutSizingHorizontal = 'FILL'; }
    }
  }
  return n;
}

export function isNativeDoc(json) { return json && json.format && String(json.format).startsWith('le-design'); }

/** Convert any Figma-shaped JSON to a native document. */
export function fromFigma(json, name) {
  if (isNativeDoc(json)) return json;
  let root;
  if (json.document && json.document.type === 'DOCUMENT') root = json.document;
  else if (json.nodes && typeof json.nodes === 'object') {
    root = { type: 'DOCUMENT', children: [{ type: 'CANVAS', name: 'Imported', children: Object.values(json.nodes).map((n) => n.document || n) }] };
  } else if (json.type === 'DOCUMENT') root = json;
  else if (json.type === 'CANVAS') root = { type: 'DOCUMENT', children: [json] };
  else if (json.type) root = { type: 'DOCUMENT', children: [{ type: 'CANVAS', name: 'Page 1', children: [json] }] };
  else if (Array.isArray(json)) root = { type: 'DOCUMENT', children: [{ type: 'CANVAS', name: 'Page 1', children: json }] };
  else throw new Error('Unrecognized Figma JSON');
  const doc = createDocument(name || json.name || 'Imported');
  doc.children = root.children.map((page) => nodeFromFigma(page, null));
  // top-level frames of a page keep their absolute coordinates (page is the origin)
  assignIds(doc);
  if (json.components) doc.components = json.components;
  if (json.styles) doc.styles = json.styles;
  return doc;
}

function textAutoResize(n) {
  const h = sizingH(n), v = sizingV(n);
  if (h === 'HUG') return 'WIDTH_AND_HEIGHT';
  if (v === 'HUG') return 'HEIGHT';
  return 'NONE';
}

function nodeToFigma(n, parent, originX, originY) {
  const absX = originX + (n.x || 0), absY = originY + (n.y || 0);
  const f = { id: n.id, name: n.name, type: n.type };
  if (n.visible === false) f.visible = false;
  if (n.locked) f.locked = true;
  if (n.type !== 'CANVAS' && n.type !== 'DOCUMENT') {
    f.blendMode = n.blendMode || 'PASS_THROUGH';
    f.absoluteBoundingBox = { x: absX, y: absY, width: n.width || 0, height: n.height || 0 };
    f.absoluteRenderBounds = { ...f.absoluteBoundingBox };
    f.constraints = { vertical: 'TOP', horizontal: 'LEFT' };
    f.relativeTransform = [[1, 0, n.x || 0], [0, 1, n.y || 0]];
    f.size = { x: n.width || 0, y: n.height || 0 };
    if (n.rotation) f.rotation = n.rotation;
    if (n.opacity !== undefined) f.opacity = n.opacity;
    f.fills = (n.fills || []).map(paintToFigma).filter(Boolean);
    f.strokes = (n.strokes || []).map(paintToFigma).filter(Boolean);
    f.strokeWeight = n.strokeWeight ?? 1;
    f.strokeAlign = n.strokeAlign || 'INSIDE';
    f.effects = (n.effects || []).map(effectToFigma);
    if (n.cornerRadius !== undefined) f.cornerRadius = n.cornerRadius;
    if (n.rectangleCornerRadii) f.rectangleCornerRadii = n.rectangleCornerRadii;
    if (parent && hasAutoLayout(parent)) {
      const row = parent.layoutMode === 'HORIZONTAL';
      const h = sizingH(n), v = sizingV(n);
      f.layoutAlign = (row ? v : h) === 'FILL' ? 'STRETCH' : 'INHERIT';
      f.layoutGrow = (row ? h : v) === 'FILL' ? 1 : 0;
      f.layoutSizingHorizontal = h; f.layoutSizingVertical = v;
      if (n.layoutPositioning === 'ABSOLUTE') f.layoutPositioning = 'ABSOLUTE';
    } else { f.layoutSizingHorizontal = sizingH(n) === 'FILL' ? 'FIXED' : sizingH(n); f.layoutSizingVertical = sizingV(n) === 'FILL' ? 'FIXED' : sizingV(n); }
    if (n.children) {
      f.clipsContent = n.clipsContent !== false && n.type !== 'GROUP';
      f.layoutMode = n.layoutMode || 'NONE';
      if (hasAutoLayout(n)) {
        const row = n.layoutMode === 'HORIZONTAL';
        f.primaryAxisSizingMode = (row ? sizingH(n) : sizingV(n)) === 'HUG' ? 'AUTO' : 'FIXED';
        f.counterAxisSizingMode = (row ? sizingV(n) : sizingH(n)) === 'HUG' ? 'AUTO' : 'FIXED';
        f.primaryAxisAlignItems = n.primaryAxisAlignItems || 'MIN';
        f.counterAxisAlignItems = n.counterAxisAlignItems || 'MIN';
        f.paddingLeft = n.paddingLeft || 0; f.paddingRight = n.paddingRight || 0; f.paddingTop = n.paddingTop || 0; f.paddingBottom = n.paddingBottom || 0;
        f.itemSpacing = n.itemSpacing || 0;
        if (n.layoutWrap === 'WRAP') { f.layoutWrap = 'WRAP'; f.counterAxisSpacing = n.counterAxisSpacing ?? n.itemSpacing ?? 0; }
      }
    }
    if (n.type === 'TEXT') {
      const s = n.style || {};
      f.characters = n.characters || '';
      f.style = {
        fontFamily: s.fontFamily || 'Inter', fontPostScriptName: null, fontWeight: s.fontWeight || 400, fontSize: s.fontSize || 16,
        italic: !!s.italic, textAlignHorizontal: s.textAlignHorizontal || 'LEFT', textAlignVertical: s.textAlignVertical || 'TOP',
        letterSpacing: s.letterSpacing || 0, textDecoration: s.textDecoration || 'NONE', textCase: s.textCase || 'ORIGINAL',
        textAutoResize: textAutoResize(n),
      };
      if (s.lineHeightPx) { f.style.lineHeightPx = s.lineHeightPx; f.style.lineHeightUnit = 'PIXELS'; }
      else if (s.lineHeightPercentFontSize) { f.style.lineHeightPercentFontSize = s.lineHeightPercentFontSize; f.style.lineHeightUnit = 'FONT_SIZE_%'; f.style.lineHeightPx = (s.fontSize || 16) * s.lineHeightPercentFontSize / 100; }
      else { f.style.lineHeightPercent = 100; f.style.lineHeightUnit = 'INTRINSIC_%'; f.style.lineHeightPx = Math.round((s.fontSize || 16) * 1.21 * 100) / 100; }
      f.textAutoResize = f.style.textAutoResize;
    }
    if (n.componentId) f.componentId = n.componentId;
    if (n.html) f.sharedPluginData = { le: { html: JSON.stringify(n.html) } };
  }
  if (n.children) {
    const ox = n.type === 'CANVAS' ? 0 : absX, oy = n.type === 'CANVAS' ? 0 : absY;
    f.children = n.children.map((c) => nodeToFigma(c, n, ox, oy));
  }
  if (n.type === 'CANVAS') f.backgroundColor = { r: 0.96, g: 0.96, b: 0.96, a: 1 };
  return f;
}

/** Convert a native document to a Figma REST "file" JSON. */
export function toFigma(doc) {
  const document = { id: '0:0', name: 'Document', type: 'DOCUMENT', scrollBehavior: 'SCROLLS', children: (doc.children || []).map((p) => nodeToFigma(p, doc, 0, 0)) };
  return {
    name: doc.name, role: 'owner', lastModified: new Date().toISOString(), editorType: 'figma', version: '1',
    thumbnailUrl: '', schemaVersion: 0, document, components: doc.components || {}, componentSets: {}, styles: doc.styles || {},
  };
}

/** Fetch a file (or specific nodes) from the Figma REST API and convert it. Works in Node 18+ and browsers. */
export async function fetchFromFigma({ token, fileKey, nodeIds, name }, fetchImpl = globalThis.fetch) {
  if (!token || !fileKey) throw new Error('token and fileKey are required');
  const url = nodeIds && nodeIds.length
    ? `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeIds.join(','))}&geometry=paths`
    : `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`;
  const res = await fetchImpl(url, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return fromFigma(json, name || json.name);
}

export { FORMAT };
