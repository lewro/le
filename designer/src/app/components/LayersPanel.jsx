import React, { useEffect, useMemo, useState } from 'react';
import { useStore, select, apply, setState, setPage, currentPage } from '../store.js';
import { pathTo, SHORT_TYPES, hasAutoLayout } from '../../core/model.js';

const ICONS = { FRAME: '#', GROUP: '⬚', RECTANGLE: '▭', ELLIPSE: '○', TEXT: 'T', LINE: '—', COMPONENT: '❖', INSTANCE: '◇', SECTION: '§', VECTOR: '⌇', CANVAS: '▤' };

export default function LayersPanel() {
  const doc = useStore((s) => s.doc);
  const pageId = useStore((s) => s.pageId);
  const selection = useStore((s) => s.selection);
  const hoverId = useStore((s) => s.hoverId);
  const [expanded, setExpanded] = useState(() => new Set());
  const [renaming, setRenaming] = useState(null);
  const [drop, setDrop] = useState(null); // { id, where }
  const page = doc ? doc.children.find((p) => p.id === pageId) || doc.children[0] : null;

  // auto-expand ancestors of the selection
  useEffect(() => {
    if (!doc || !selection.length) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of selection) for (const n of pathTo(doc, id).slice(0, -1)) next.add(n.id);
      return next;
    });
  }, [selection, doc]);

  if (!doc) return <div className="empty-state">No document open.</div>;

  const toggle = (id) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const onDragStart = (e, id) => {
    const ids = selection.includes(id) ? selection : [id];
    e.dataTransfer.setData('text/le-ids', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };
  const zoneOf = (e, node) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const container = !!node.children && node.type !== 'TEXT';
    return y < 0.25 ? 'before' : y > 0.75 || !container ? 'after' : 'inside';
  };
  const onDragOver = (e, node) => {
    e.preventDefault();
    const where = zoneOf(e, node);
    if (drop?.id !== node.id || drop?.where !== where) setDrop({ id: node.id, where });
  };
  const onDrop = (e, node) => {
    e.preventDefault();
    let ids = [];
    try { ids = JSON.parse(e.dataTransfer.getData('text/le-ids')); } catch { /* ignore */ }
    const where = zoneOf(e, node);
    setDrop(null);
    if (!ids.length || ids.includes(node.id)) return;
    const f = pathTo(doc, node.id);
    const parent = f[f.length - 2];
    // drop onto own ancestor is not allowed
    if (ids.some((id) => pathTo(doc, node.id).some((n) => n.id === id))) return;
    const ops = [];
    if (where === 'inside') ids.forEach((id) => ops.push({ op: 'move', target: '#' + id, parent: '#' + node.id, index: -1 }));
    else {
      // the list shows the last child first, so "above" in the list means a higher index
      ids.forEach((id) => {
        const cur = parent.children.indexOf(node);
        ops.push({ op: 'move', target: '#' + id, parent: '#' + parent.id, index: where === 'before' ? cur + 1 : cur });
      });
    }
    apply(ops, { label: 'Reorder layers' });
  };

  const rows = [];
  const walkRows = (node, depth) => {
    const kids = node.children || [];
    // layers are listed top-most first (last child first), like Figma
    for (let i = kids.length - 1; i >= 0; i--) {
      const c = kids[i];
      rows.push({ node: c, depth, parent: node });
      if (c.children && expanded.has(c.id)) walkRows(c, depth + 1);
    }
  };
  walkRows(page, 0);

  return (
    <>
      <div className="panel-title">
        <span>Pages</span>
        <div className="actions">
          <button title="Add page" onClick={() => { const r = apply({ op: 'add', parent: '#' + doc.id, dsl: `page "Page ${doc.children.length + 1}"` }, { label: 'Add page' }); if (r) setPage(r.created[0]); }}>＋</button>
        </div>
      </div>
      <div className="pages">
        {doc.children.map((p) => (
          <div key={p.id} className={'row' + (p.id === page.id ? ' active' : '')} onClick={() => setPage(p.id)} onDoubleClick={() => setRenaming(p.id)}>
            {renaming === p.id ? <RenameInput value={p.name} onDone={(v) => { setRenaming(null); if (v && v !== p.name) apply({ op: 'rename', target: '#' + p.id, name: v }); }} /> : <span className="name">{p.name}</span>}
            {doc.children.length > 1 && p.id === page.id && <button title="Delete page" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete page "${p.name}"?`)) { apply({ op: 'remove', target: '#' + p.id }, { label: 'Delete page' }); setPage(doc.children.find((x) => x.id !== p.id).id); } }}>×</button>}
          </div>
        ))}
      </div>
      <div className="panel-title"><span>Layers</span>
        <div className="actions">
          <button title="Collapse all" onClick={() => setExpanded(new Set())}>⇈</button>
        </div>
      </div>
      <div className="layers" onDragLeave={() => setDrop(null)}>
        {!rows.length && <div className="empty-state">Empty page.<br />Draw with <span className="kbd">F</span> <span className="kbd">R</span> <span className="kbd">T</span> or paste DSL in the Code tab.</div>}
        {rows.map(({ node, depth, parent }) => {
          const isSel = selection.includes(node.id);
          const has = node.children && node.children.length > 0;
          const cls = ['layer', isSel ? 'selected' : '', hoverId === node.id ? 'hovered' : '', node.visible === false ? 'hidden-node' : '', drop?.id === node.id ? 'drop-' + drop.where : ''].filter(Boolean).join(' ');
          return (
            <div key={node.id} className={cls} style={{ paddingLeft: 8 + depth * 14 }}
              draggable={renaming !== node.id}
              onDragStart={(e) => onDragStart(e, node.id)} onDragOver={(e) => onDragOver(e, node)} onDrop={(e) => onDrop(e, node)}
              onClick={(e) => select(node.id, { toggle: e.shiftKey || e.metaKey || e.ctrlKey })}
              onDoubleClick={() => setRenaming(node.id)}
              onMouseEnter={() => setState({ hoverId: node.id })} onMouseLeave={() => setState({ hoverId: null })}>
              <span className={'caret' + (has ? '' : ' empty')} onClick={(e) => { e.stopPropagation(); toggle(node.id); }}>{expanded.has(node.id) ? '▼' : '▶'}</span>
              <span className="icon" title={node.type}>{ICONS[node.type] || '?'}</span>
              <span className="name">
                {renaming === node.id ? <RenameInput value={node.name} onDone={(v) => { setRenaming(null); if (v && v !== node.name) apply({ op: 'rename', target: '#' + node.id, name: v }, { label: 'Rename' }); }} /> : node.name}
              </span>
              {node.html?.tag && <span className="tagchip">{node.html.tag}</span>}
              {hasAutoLayout(node) && <span className="tagchip" title="Auto layout">{node.layoutMode === 'HORIZONTAL' ? '→' : '↓'}</span>}
              <span className={'btns' + (node.visible === false || node.locked ? ' on' : '')}>
                <button title="Lock" onClick={(e) => { e.stopPropagation(); apply({ op: 'set', target: '#' + node.id, props: { locked: node.locked ? null : true } }); }}>{node.locked ? '🔒' : '🔓'}</button>
                <button title="Toggle visibility" onClick={(e) => { e.stopPropagation(); apply({ op: 'set', target: '#' + node.id, props: { visible: node.visible === false ? null : false } }); }}>{node.visible === false ? '◌' : '◉'}</button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RenameInput({ value, onDone }) {
  const [v, setV] = useState(value);
  return (
    <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onClick={(e) => e.stopPropagation()}
      onBlur={() => onDone(v)} onKeyDown={(e) => { if (e.key === 'Enter') onDone(v); if (e.key === 'Escape') onDone(null); e.stopPropagation(); }} />
  );
}

export { SHORT_TYPES, currentPage, useMemo };
