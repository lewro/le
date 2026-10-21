import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, getIndex, apply, select, currentPage, selectedNodes, setState, viewRef } from '../store.js';
import { expandInstance } from '../../core/components.js';
import { computeStyle } from '../../core/style.js';
import { findById, hasAutoLayout } from '../../core/model.js';

/** Small static preview of a component rendered with the same DOM renderer, measured then scaled to fit. */
function Thumb({ entry, index }) {
  const ref = useRef(null);
  const [dim, setDim] = useState(null);
  const comp = entry.type === 'COMPONENT_SET' ? entry.node.children?.[0] : entry.node;
  useLayoutEffect(() => {
    const el = ref.current?.firstChild;
    if (el) setDim({ w: Math.max(1, el.offsetWidth), h: Math.max(1, el.offsetHeight) });
  }, [entry, index]);
  if (!comp) return null;
  const expanded = expandInstance(index, { id: 'thumb', type: 'INSTANCE', componentId: comp.id, name: comp.name }) || comp;
  const scale = dim ? Math.min(1, 100 / dim.w, 56 / dim.h) : 1;
  const render = (n, parentMode, isRoot) => {
    if (n.visible === false) return null;
    const style = computeStyle(n, parentMode === 'NONE' ? null : { layoutMode: parentMode });
    if (isRoot) { style.position = 'relative'; style.left = 0; style.top = 0; if (style.width === '100%') style.width = 'fit-content'; }
    if (n.type === 'TEXT') return <div key={n.id} style={style}>{n.characters}</div>;
    return <div key={n.id} style={style}>{n.children?.map((c) => render(c, n.layoutMode || 'NONE', false))}</div>;
  };
  return (
    <div className="thumb">
      <div style={{ position: 'relative', width: dim ? dim.w * scale : 0, height: dim ? dim.h * scale : 0 }}>
        <div ref={ref} style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: '0 0', visibility: dim ? 'visible' : 'hidden', whiteSpace: 'nowrap' }}>{render(expanded, 'NONE', true)}</div>
      </div>
    </div>
  );
}

export default function AssetsPanel() {
  const doc = useStore((s) => s.doc);
  const libs = useStore((s) => s.libs);
  const [q, setQ] = useState('');
  const index = doc ? getIndex() : null;
  const groups = useMemo(() => {
    if (!index) return [];
    const list = index.list.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
    const by = new Map();
    for (const e of list) {
      const key = e.lib || 'This document';
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(e);
    }
    return [...by.entries()];
  }, [index, q, libs]);

  const insert = (entry) => {
    const page = currentPage();
    if (!page) return;
    const sel = selectedNodes()[0];
    const f = sel ? findById(doc, sel.id) : null;
    const parent = sel && sel.children && sel.type !== 'INSTANCE' ? sel : f?.parent && f.parent.type !== 'CANVAS' ? f.parent : page;
    const node = { type: 'INSTANCE', name: entry.name, component: entry.name };
    if (!hasAutoLayout(parent)) {
      const el = document.querySelector('.canvas');
      const cx = el ? (el.clientWidth / 2 - viewRef.pan.x) / viewRef.zoom : 0, cy = el ? (el.clientHeight / 2 - viewRef.pan.y) / viewRef.zoom : 0;
      const pr = parent.type === 'CANVAS' ? { left: 0, top: 0 } : (() => { const d = document.querySelector(`.world [data-id="${CSS.escape(parent.id)}"]`); const cr = el.getBoundingClientRect(); const r = d?.getBoundingClientRect(); return r ? { left: (r.left - cr.left - viewRef.pan.x) / viewRef.zoom, top: (r.top - cr.top - viewRef.pan.y) / viewRef.zoom } : { left: 0, top: 0 }; })();
      node.x = Math.round(cx - pr.left); node.y = Math.round(cy - pr.top);
    }
    const r = apply({ op: 'add', parent: '#' + parent.id, node, index: f && f.parent === parent ? f.index + 1 : undefined }, { label: `Insert ${entry.name}` });
    if (r) { select(r.created[0]); setState({ rightTab: 'design' }); }
  };

  if (!doc) return <div className="empty-state">No document.</div>;
  if (!index?.list.length) {
    return (
      <div className="empty-state">
        No components yet.<br />
        <button className="primary" style={{ marginTop: 10 }} onClick={() => setState({ dialog: 'libraries' })}>Add a library</button>
        <div className="muted" style={{ marginTop: 10 }}>or select a frame and use "Create component" in the inspector.</div>
      </div>
    );
  }
  return (
    <div className="assets">
      <div className="bar"><input placeholder="Search components" value={q} onChange={(e) => setQ(e.target.value)} /><button title="Manage libraries" onClick={() => setState({ dialog: 'libraries' })}>⚙</button></div>
      {groups.map(([lib, entries]) => (
        <div key={lib}>
          <div className="panel-title"><span>{lib}</span><span className="muted">{entries.length}</span></div>
          <div className="asset-grid">
            {entries.map((e) => (
              <div key={e.id} className="asset" title={`${e.name}${e.description ? '\n' + e.description : ''}\nClick to insert`} onClick={() => insert(e)}
                draggable onDragStart={(ev) => ev.dataTransfer.setData('text/le-component', e.name)}>
                <Thumb entry={e} index={index} />
                <div className="asset-name">{e.name}</div>
                {e.type === 'COMPONENT_SET' && <div className="asset-meta">{Object.entries(e.variants).map(([k, v]) => `${k}: ${v.length}`).join(' · ')}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
