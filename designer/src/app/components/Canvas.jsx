import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useStore, select, apply, commit, setState, getState, setTool, zoomBy, currentPage } from '../store.js';
import { computeStyle } from '../../core/style.js';
import { findById, pathTo, hasAutoLayout, createNode, sizingH, sizingV, getParent } from '../../core/model.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Figma-like selection: first click picks the top-level frame; clicking inside a selected node drills down. */
function pickSelectable(doc, clickedId, selection, deep) {
  const path = pathTo(doc, clickedId);
  let chain = path.filter((n) => n.type !== 'DOCUMENT' && n.type !== 'CANVAS');
  const lockedAt = chain.findIndex((n) => n.locked);
  if (lockedAt >= 0) chain = chain.slice(0, lockedAt);
  if (!chain.length) return null;
  if (deep) return chain[chain.length - 1].id;
  if (chain.length === 1) return chain[0].id;
  for (const sel of selection) {
    const idx = chain.findIndex((n) => n.id === sel);
    if (idx >= 0) return chain[Math.min(idx + 1, chain.length - 1)].id;
  }
  for (const sel of selection) {
    const parent = getParent(doc, sel);
    if (!parent) continue;
    const idx = chain.findIndex((n) => n.id === parent.id);
    if (idx >= 0 && idx < chain.length - 1) return chain[idx + 1].id;
  }
  return chain[0].id;
}

function TextNode({ node, parent, editing }) {
  const ref = useRef(null);
  const style = computeStyle(node, parent);
  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    const range = document.createRange(); range.selectNodeContents(el);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }, [editing]);
  const finish = (save) => {
    const el = ref.current;
    if (!el) return;
    const text = el.innerText.replace(/\n$/, '');
    setState({ editingId: null });
    if (save && text !== node.characters) apply({ op: 'text', target: '#' + node.id, characters: text }, { label: 'Edit text' });
    else el.innerText = node.characters || '';
  };
  return (
    <div ref={ref} className="node" data-id={node.id} style={style}
      contentEditable={editing} suppressContentEditableWarning
      onBlur={editing ? () => finish(true) : undefined}
      onKeyDown={editing ? (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); finish(false); } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true); } } : undefined}
      onPaste={editing ? (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); } : undefined}>
      {node.characters}
    </div>
  );
}

function NodeView({ node, parent, editingId }) {
  if (node.visible === false) return null;
  if (node.type === 'TEXT') return <TextNode node={node} parent={parent} editing={editingId === node.id} />;
  const style = computeStyle(node, parent);
  return (
    <div className="node" data-id={node.id} style={style}>
      {node.children && node.children.map((c) => <NodeView key={c.id} node={c} parent={node} editingId={editingId} />)}
    </div>
  );
}

export default function Canvas() {
  const doc = useStore((s) => s.doc);
  const pageId = useStore((s) => s.pageId);
  const selection = useStore((s) => s.selection);
  const hoverId = useStore((s) => s.hoverId);
  const editingId = useStore((s) => s.editingId);
  const tool = useStore((s) => s.tool);
  const zoom = useStore((s) => s.zoom);
  const pan = useStore((s) => s.pan);
  const ref = useRef(null);
  const ix = useRef(null); // current interaction
  const [space, setSpace] = useState(false);
  const [rects, setRects] = useState({ sel: [], hover: null, labels: [] });
  const [marquee, setMarquee] = useState(null);
  const [dropLine, setDropLine] = useState(null);
  const [tick, setTick] = useState(0);
  const page = doc ? doc.children.find((p) => p.id === pageId) || doc.children[0] : null;

  const toWorld = useCallback((clientX, clientY) => {
    const cr = ref.current.getBoundingClientRect();
    const { zoom: z, pan: p } = getState();
    return { x: (clientX - cr.left - p.x) / z, y: (clientY - cr.top - p.y) / z, sx: clientX - cr.left, sy: clientY - cr.top };
  }, []);

  /** Screen (container) rect of a node from the DOM. */
  const rectOf = useCallback((id) => {
    const el = ref.current?.querySelector(`.world [data-id="${CSS.escape(id)}"]`);
    if (!el) return null;
    const cr = ref.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { id, left: r.left - cr.left, top: r.top - cr.top, width: r.width, height: r.height };
  }, []);

  // recompute overlay rects after every render that could move things
  useLayoutEffect(() => {
    if (!ref.current || !doc) return;
    const sel = selection.map(rectOf).filter(Boolean);
    const hover = hoverId && !selection.includes(hoverId) ? rectOf(hoverId) : null;
    const labels = (page?.children || []).filter((c) => c.visible !== false).map((c) => ({ ...rectOf(c.id), name: c.name })).filter((r) => r.left !== undefined);
    setRects({ sel, hover, labels });
  }, [doc, selection, hoverId, zoom, pan, editingId, tick, page, rectOf]);

  useEffect(() => {
    document.fonts?.ready.then(() => setTick((t) => t + 1));
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(ref.current);
    const world = ref.current.querySelector('.world');
    if (world) ro.observe(world);
    return () => ro.disconnect();
  }, []);

  // wheel: zoom with ctrl/meta, otherwise pan (non-passive to prevent browser zoom)
  useEffect(() => {
    const el = ref.current;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const cr = el.getBoundingClientRect();
        zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX - cr.left, y: e.clientY - cr.top });
      } else setState((s) => ({ pan: { x: s.pan.x - e.deltaX, y: s.pan.y - e.deltaY } }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const down = (e) => { if (e.code === 'Space' && !(document.activeElement?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName))) { setSpace(true); e.preventDefault(); } };
    const up = (e) => { if (e.code === 'Space') setSpace(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const containerUnder = (clientX, clientY) => {
    const s = getState();
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const id = el.getAttribute?.('data-id');
      if (!id || el.classList.contains('frame-label')) continue;
      const f = findById(s.doc, id);
      if (f && f.node.children && !f.node.locked && !pathTo(s.doc, id).some((n) => n.locked)) return f.node;
    }
    return page;
  };

  const onPointerDown = (e) => {
    if (!doc || !page) return;
    const s = getState();
    if (s.editingId) { if (e.target.closest('[contenteditable="true"]')) return; }
    const el = ref.current;
    el.focus({ preventScroll: true });
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || space || (e.button === 0 && tool === 'hand')) {
      ix.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, pan: s.pan };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const handle = e.target.getAttribute?.('data-handle');
    if (handle && s.selection.length === 1) {
      const id = s.selection[0];
      const f = findById(s.doc, id);
      const r = rectOf(id);
      ix.current = { kind: 'resize', handle, id, start: w, orig: { x: f.node.x || 0, y: f.node.y || 0, w: r.width / s.zoom, h: r.height / s.zoom }, free: !hasAutoLayout(f.parent) || f.node.layoutPositioning === 'ABSOLUTE' };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (tool !== 'select') {
      ix.current = { kind: 'draw', start: w, parent: containerUnder(e.clientX, e.clientY) };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const target = e.target.closest('[data-id]');
    const clickedId = target?.getAttribute('data-id');
    const picked = clickedId ? pickSelectable(s.doc, clickedId, s.selection, e.metaKey || e.ctrlKey) : null;
    if (!picked) {
      ix.current = { kind: 'marquee', start: w };
      if (!e.shiftKey) select([]);
      el.setPointerCapture(e.pointerId);
      return;
    }
    let ids;
    if (e.shiftKey) { select(picked, { toggle: true }); ids = getState().selection; }
    else if (s.selection.includes(picked)) ids = s.selection;
    else { select(picked); ids = [picked]; }
    const origin = new Map();
    for (const id of ids) { const f = findById(s.doc, id); if (f) origin.set(id, { x: f.node.x || 0, y: f.node.y || 0 }); }
    ix.current = { kind: 'drag', start: w, ids, origin, moved: false, pointerId: e.pointerId };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    const s = getState();
    const cur = ix.current;
    if (!cur) {
      if (tool !== 'select' || !doc) return;
      const target = e.target.closest?.('[data-id]');
      const id = target?.getAttribute('data-id');
      const picked = id ? pickSelectable(s.doc, id, s.selection, e.metaKey || e.ctrlKey) : null;
      if (picked !== s.hoverId) setState({ hoverId: picked });
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    switch (cur.kind) {
      case 'pan':
        setState({ pan: { x: cur.pan.x + (e.clientX - cur.sx), y: cur.pan.y + (e.clientY - cur.sy) } });
        return;
      case 'marquee':
        setMarquee({ x: Math.min(cur.start.sx, w.sx), y: Math.min(cur.start.sy, w.sy), w: Math.abs(w.sx - cur.start.sx), h: Math.abs(w.sy - cur.start.sy) });
        return;
      case 'draw':
        setMarquee({ x: Math.min(cur.start.sx, w.sx), y: Math.min(cur.start.sy, w.sy), w: Math.abs(w.sx - cur.start.sx), h: Math.abs(w.sy - cur.start.sy), draw: true });
        return;
      case 'resize': {
        const dx = w.x - cur.start.x, dy = w.y - cur.start.y;
        const h = cur.handle;
        const o = cur.orig;
        const props = {};
        if (h.includes('e')) { props.width = Math.max(1, o.w + dx); props.layoutSizingHorizontal = 'FIXED'; }
        if (h.includes('s')) { props.height = Math.max(1, o.h + dy); props.layoutSizingVertical = 'FIXED'; }
        if (h.includes('w')) { props.width = Math.max(1, o.w - dx); props.layoutSizingHorizontal = 'FIXED'; if (cur.free) props.x = o.x + Math.min(dx, o.w - 1); }
        if (h.includes('n')) { props.height = Math.max(1, o.h - dy); props.layoutSizingVertical = 'FIXED'; if (cur.free) props.y = o.y + Math.min(dy, o.h - 1); }
        if (e.shiftKey && (h === 'nw' || h === 'ne' || h === 'sw' || h === 'se')) { const r = o.w / o.h; props.height = props.width / r; }
        apply({ op: 'set', target: '#' + cur.id, props: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 2) / 2 : v])) }, { transient: true });
        return;
      }
      case 'drag': {
        const dx = w.x - cur.start.x, dy = w.y - cur.start.y;
        if (!cur.moved && Math.hypot(dx * s.zoom, dy * s.zoom) < 3) return;
        cur.moved = true;
        const ops = [];
        let reorder = null;
        for (const id of cur.ids) {
          const f = findById(s.doc, id);
          if (!f) continue;
          if (hasAutoLayout(f.parent) && f.node.layoutPositioning !== 'ABSOLUTE') {
            if (cur.ids.length === 1) reorder = computeReorder(f, w);
            continue;
          }
          const o = cur.origin.get(id);
          ops.push({ op: 'set', target: '#' + id, props: { x: Math.round(o.x + dx), y: Math.round(o.y + dy) } });
        }
        if (ops.length) apply(ops, { transient: true });
        if (reorder) { cur.reorder = reorder; setDropLine(reorder.line); } else setDropLine(null);
        return;
      }
      default:
    }
  };

  /** While dragging inside an auto-layout parent, find the new index and a drop indicator. */
  const computeReorder = (f, w) => {
    const horiz = f.parent.layoutMode === 'HORIZONTAL';
    const sibs = f.parent.children.filter((c) => c.id !== f.node.id && c.visible !== false && c.layoutPositioning !== 'ABSOLUTE');
    const rs = sibs.map((c) => ({ c, r: rectOf(c.id) })).filter((x) => x.r);
    let index = 0;
    for (const { r } of rs) {
      const center = horiz ? (r.left + r.width / 2) : (r.top + r.height / 2);
      if ((horiz ? w.sx : w.sy) > center) index++;
    }
    const parentIndexes = f.parent.children.map((c) => c.id);
    const beforeSib = rs[index] || null, afterSib = rs[index - 1] || null;
    let line;
    if (beforeSib) line = horiz ? { left: beforeSib.r.left - 2, top: beforeSib.r.top, width: 3, height: beforeSib.r.height } : { left: beforeSib.r.left, top: beforeSib.r.top - 2, width: beforeSib.r.width, height: 3 };
    else if (afterSib) line = horiz ? { left: afterSib.r.left + afterSib.r.width - 1, top: afterSib.r.top, width: 3, height: afterSib.r.height } : { left: afterSib.r.left, top: afterSib.r.top + afterSib.r.height - 1, width: afterSib.r.width, height: 3 };
    // translate index among siblings to index in full children array
    const targetId = beforeSib ? beforeSib.c.id : null;
    let fullIndex = targetId ? parentIndexes.indexOf(targetId) : f.parent.children.length;
    if (fullIndex > f.index) fullIndex -= 1;
    return { index: fullIndex, line, changed: fullIndex !== f.index };
  };

  const onPointerUp = (e) => {
    const cur = ix.current;
    ix.current = null;
    setMarquee(null);
    setDropLine(null);
    if (!cur) return;
    const s = getState();
    const w = toWorld(e.clientX, e.clientY);
    switch (cur.kind) {
      case 'resize': commit('Resize'); return;
      case 'drag':
        if (cur.reorder?.changed) apply({ op: 'reorder', target: '#' + cur.ids[0], index: cur.reorder.index }, { label: 'Reorder' });
        if (cur.moved) commit('Move');
        return;
      case 'marquee': {
        if (!page) return;
        const x1 = Math.min(cur.start.sx, w.sx), y1 = Math.min(cur.start.sy, w.sy), x2 = Math.max(cur.start.sx, w.sx), y2 = Math.max(cur.start.sy, w.sy);
        if (x2 - x1 < 3 && y2 - y1 < 3) return;
        const hit = page.children.filter((c) => { const r = rectOf(c.id); return r && r.left < x2 && r.left + r.width > x1 && r.top < y2 && r.top + r.height > y1; }).map((c) => c.id);
        select(hit, { add: e.shiftKey });
        return;
      }
      case 'draw': {
        const parent = cur.parent || page;
        let width = Math.abs(w.x - cur.start.x), height = Math.abs(w.y - cur.start.y);
        const clicked = width < 3 && height < 3;
        const type = { frame: 'FRAME', rect: 'RECTANGLE', ellipse: 'ELLIPSE', text: 'TEXT', line: 'LINE' }[tool];
        if (clicked) { width = type === 'TEXT' ? 0 : 100; height = type === 'TEXT' ? 0 : type === 'LINE' ? 0 : 100; }
        const props = {};
        if (type !== 'TEXT') { props.width = Math.round(width); props.height = type === 'LINE' ? 0 : Math.round(height); }
        else if (!clicked) { props.width = Math.round(width); props.layoutSizingHorizontal = 'FIXED'; }
        if (type === 'LINE') props.width = Math.round(Math.max(width, height, 1));
        const node = createNode(type, props);
        if (!hasAutoLayout(parent) || e.altKey) {
          const pr = parent.type === 'CANVAS' ? { left: s.pan.x, top: s.pan.y } : rectOf(parent.id);
          const px = parent.type === 'CANVAS' ? 0 : (pr.left - s.pan.x) / s.zoom, py = parent.type === 'CANVAS' ? 0 : (pr.top - s.pan.y) / s.zoom;
          node.x = Math.round(Math.min(cur.start.x, w.x) - px);
          node.y = Math.round(Math.min(cur.start.y, w.y) - py);
          if (hasAutoLayout(parent)) node.layoutPositioning = 'ABSOLUTE';
        }
        const r = apply({ op: 'add', parent: '#' + parent.id, node }, { label: `Create ${tool}` });
        if (r) { select(r.created[0]); if (type === 'TEXT') setState({ editingId: r.created[0] }); }
        if (!e.shiftKey) setTool('select');
        return;
      }
      default:
    }
  };

  const onDoubleClick = (e) => {
    if (tool !== 'select' || !doc) return;
    // pointer capture makes e.target the canvas, so hit-test by coordinates
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.world [data-id]');
    if (!target) return;
    const id = target.getAttribute('data-id');
    const deep = pickSelectable(doc, id, [], true);
    if (!deep) return;
    const node = findById(doc, deep)?.node;
    select(deep);
    if (node?.type === 'TEXT') setState({ editingId: deep });
  };

  const single = rects.sel.length === 1 ? rects.sel[0] : null;
  const singleNode = single ? findById(doc, single.id)?.node : null;

  return (
    <div ref={ref} className={`canvas tool-${tool}${space ? ' panning' : ''}`} tabIndex={0}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick} onPointerLeave={() => { if (!ix.current) setState({ hoverId: null }); }}>
      {!doc && <div className="canvas-empty">Open or create a document</div>}
      <div className="world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {page && page.children.map((c) => <NodeView key={c.id} node={c} parent={page} editingId={editingId} />)}
      </div>
      {rects.labels.map((l) => (
        <div key={l.id} className={'frame-label' + (selection.includes(l.id) ? ' selected' : '')} data-id={l.id} style={{ left: l.left, top: l.top }}>{l.name}</div>
      ))}
      <div className="overlay">
        {rects.hover && <div className="hover-box" style={{ left: rects.hover.left, top: rects.hover.top, width: rects.hover.width, height: rects.hover.height }} />}
        {rects.sel.map((r) => <div key={r.id} className="sel-box" style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />)}
        {single && !editingId && singleNode && (
          <>
            {HANDLES.map((h) => {
              const cx = h.includes('w') ? single.left : h.includes('e') ? single.left + single.width : single.left + single.width / 2;
              const cy = h.includes('n') ? single.top : h.includes('s') ? single.top + single.height : single.top + single.height / 2;
              return <div key={h} className={'handle ' + h} data-handle={h} style={{ left: cx, top: cy }} />;
            })}
            <div className="size-label" style={{ left: single.left + single.width / 2, top: single.top + single.height }}>
              {sizingH(singleNode) === 'FIXED' ? Math.round(single.width / zoom) : sizingH(singleNode).toLowerCase()} × {sizingV(singleNode) === 'FIXED' ? Math.round(single.height / zoom) : sizingV(singleNode).toLowerCase()}
            </div>
          </>
        )}
        {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        {dropLine && <div className="drop-line" style={dropLine} />}
      </div>
    </div>
  );
}

export { currentPage };
