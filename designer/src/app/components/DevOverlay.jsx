import React from 'react';
import { useStore, getIndex } from '../store.js';
import { findById, hasAutoLayout } from '../../core/model.js';
import { nodeBadges } from '../../core/devspec.js';
import { expandInstance } from '../../core/components.js';

const GROUP_COLOR = { Layout: '#3b82f6', Appearance: '#22c55e', Typography: '#f59e0b', Component: '#a855f7', HTML: '#64748b' };

function fmt(n) { return Math.round(n * 10) / 10; }

/**
 * Dev-mode drawings in world coordinates: padding and gap badges of the selected frame, a callout with the
 * selected element's values, distances to the hovered element, and a tag on the hovered element.
 * `rectOf(id)` returns a world rect from the DOM. `inv` is "var(--inv)" (1/zoom) for screen-sized labels.
 */
export default function DevOverlay({ selRect, selNode, hoverRect, hoverNode, rectOf, inv }) {
  const doc = useStore((s) => s.doc);
  if (!doc) return null;
  const items = [];
  const label = (key, x, y, text, color, opts = {}) => items.push(
    <div key={key} className="dev-label" style={{ left: x, top: y, background: color, transform: `translate(-50%, -50%) scale(${inv})`, ...opts.style }}>{text}</div>,
  );

  if (selRect && selNode) {
    const r = selRect;
    // paddings
    if (hasAutoLayout(selNode)) {
      const pads = [['paddingTop', 0, 0, r.width, selNode.paddingTop], ['paddingBottom', 0, r.height - (selNode.paddingBottom || 0), r.width, selNode.paddingBottom], ['paddingLeft', 0, 0, selNode.paddingLeft, r.height], ['paddingRight', r.width - (selNode.paddingRight || 0), 0, selNode.paddingRight, r.height]];
      for (const [k, x, y, w, h] of pads) {
        const v = selNode[k] || 0;
        if (!v) continue;
        const horiz = k === 'paddingTop' || k === 'paddingBottom';
        items.push(<div key={k} className="dev-pad" style={{ left: r.left + x, top: r.top + y, width: horiz ? w : v, height: horiz ? v : h }} />);
        label(k + 'l', r.left + x + (horiz ? w / 2 : v / 2), r.top + y + (horiz ? v / 2 : h / 2), fmt(v), '#16a34a');
      }
      // gaps between consecutive children
      const kids = (selNode.children || []).filter((c) => c.visible !== false && c.layoutPositioning !== 'ABSOLUTE');
      const horizLayout = selNode.layoutMode === 'HORIZONTAL';
      for (let i = 0; i < kids.length - 1; i++) {
        const a = rectOf(kids[i].id), b = rectOf(kids[i + 1].id);
        if (!a || !b) continue;
        if (horizLayout) {
          if (b.left < a.left + a.width - 0.5 || Math.abs(a.top - b.top) > Math.max(a.height, b.height)) continue; // wrapped
          const gap = b.left - (a.left + a.width);
          if (gap <= 0) continue;
          items.push(<div key={'g' + i} className="dev-gap" style={{ left: a.left + a.width, top: Math.max(a.top, b.top), width: gap, height: Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) }} />);
          label('gl' + i, a.left + a.width + gap / 2, Math.max(a.top, b.top) + Math.min(a.height, b.height) / 2, fmt(gap), '#9333ea');
        } else {
          if (b.top < a.top + a.height - 0.5) continue;
          const gap = b.top - (a.top + a.height);
          if (gap <= 0) continue;
          items.push(<div key={'g' + i} className="dev-gap" style={{ left: Math.max(a.left, b.left), top: a.top + a.height, width: Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left), height: gap }} />);
          label('gl' + i, Math.max(a.left, b.left) + Math.min(a.width, b.width) / 2, a.top + a.height + gap / 2, fmt(gap), '#9333ea');
        }
      }
    }
    // callout with values
    const parent = findById(doc, selNode.id)?.parent;
    const expanded = selNode.type === 'INSTANCE' ? expandInstance(getIndex(), selNode) : null;
    const badges = nodeBadges(selNode, parent, expanded);
    items.push(
      <div key="callout" className="dev-callout" style={{ left: r.left + r.width, top: r.top, transform: `scale(${inv}) translate(14px, 0)`, transformOrigin: '0 0' }}>
        <div className="dev-callout-arrow" />
        <div className="dev-callout-title">{selNode.name} <span>{fmt(r.width)} × {fmt(r.height)}</span></div>
        {badges.map((b) => (
          <div key={b.key} className="dev-badge" style={{ borderColor: GROUP_COLOR[b.group] || '#64748b' }}>
            <span className="dev-badge-k" style={{ background: GROUP_COLOR[b.group] || '#64748b' }}>{b.label}</span>
            {b.color && <span className="dev-chip" style={{ background: b.color }} />}
            <span className="dev-badge-v">{b.token ? <><b>${b.token}</b> <span className="muted">{b.value}</span></> : b.value}</span>
          </div>
        ))}
      </div>,
    );
  }

  // distances between selection and hovered element
  if (selRect && hoverRect && hoverNode && hoverNode.id !== selNode?.id) {
    const s = selRect, h = hoverRect;
    const lines = [];
    const inside = (a, b) => a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.left + a.width <= b.left + b.width + 0.5 && a.top + a.height <= b.top + b.height + 0.5;
    if (inside(s, h) || inside(h, s)) {
      const [inner, outer] = inside(s, h) ? [s, h] : [h, s];
      const cx = inner.left + inner.width / 2, cy = inner.top + inner.height / 2;
      lines.push({ x1: outer.left, y1: cy, x2: inner.left, y2: cy }, { x1: inner.left + inner.width, y1: cy, x2: outer.left + outer.width, y2: cy }, { x1: cx, y1: outer.top, x2: cx, y2: inner.top }, { x1: cx, y1: inner.top + inner.height, x2: cx, y2: outer.top + outer.height });
    } else {
      const overlapY = Math.min(s.top + s.height, h.top + h.height) - Math.max(s.top, h.top);
      const overlapX = Math.min(s.left + s.width, h.left + h.width) - Math.max(s.left, h.left);
      if (overlapY > 0) { const y = Math.max(s.top, h.top) + overlapY / 2; if (h.left >= s.left + s.width) lines.push({ x1: s.left + s.width, y1: y, x2: h.left, y2: y }); else if (s.left >= h.left + h.width) lines.push({ x1: h.left + h.width, y1: y, x2: s.left, y2: y }); }
      if (overlapX > 0) { const x = Math.max(s.left, h.left) + overlapX / 2; if (h.top >= s.top + s.height) lines.push({ x1: x, y1: s.top + s.height, x2: x, y2: h.top }); else if (s.top >= h.top + h.height) lines.push({ x1: x, y1: h.top + h.height, x2: x, y2: s.top }); }
      if (!lines.length) { // diagonal: show both axes
        const x = s.left + s.width / 2, y = h.top + h.height / 2;
        lines.push({ x1: x, y1: s.top < h.top ? s.top + s.height : s.top, x2: x, y2: y }, { x1: x, y1: y, x2: h.left < s.left ? h.left + h.width : h.left, y2: y });
      }
    }
    lines.forEach((l, i) => {
      const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
      if (len < 0.5) return;
      const horiz = Math.abs(l.y2 - l.y1) < 0.01;
      items.push(<div key={'d' + i} className="dev-line" style={{ left: Math.min(l.x1, l.x2), top: Math.min(l.y1, l.y2), width: horiz ? len : 0, height: horiz ? 0 : len, borderTop: horiz ? `calc(1px * ${inv}) solid #ef4444` : undefined, borderLeft: horiz ? undefined : `calc(1px * ${inv}) solid #ef4444` }} />);
      label('dl' + i, (l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2, fmt(len), '#ef4444');
    });
    label('hovertag', h.left + h.width / 2, h.top, `${hoverNode.name} · ${fmt(h.width)}×${fmt(h.height)}`, '#0d99ff', { style: { transform: `translate(-50%, -100%) scale(${inv})`, transformOrigin: '50% 100%' } });
  } else if (hoverRect && hoverNode && !selRect) {
    label('hovertag', hoverRect.left + hoverRect.width / 2, hoverRect.top, `${hoverNode.name} · ${fmt(hoverRect.width)}×${fmt(hoverRect.height)}`, '#0d99ff', { style: { transform: `translate(-50%, -100%) scale(${inv})`, transformOrigin: '50% 100%' } });
  }
  return <>{items}</>;
}
