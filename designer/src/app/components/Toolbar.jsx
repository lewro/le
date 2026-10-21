import React from 'react';
import { useStore, setTool, undo, redo, zoomBy, zoomToFit, setState, openDoc, goFiles, setTitle, tidy } from '../store.js';

const TOOLS = [
  ['select', 'V', '↖'], ['frame', 'F', '▭'], ['rect', 'R', '■'], ['ellipse', 'O', '●'], ['text', 'T', 'T'], ['line', 'L', '╱'],
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const docs = useStore((s) => s.docs);
  const docName = useStore((s) => s.docName);
  const title = useStore((s) => s.doc?.meta?.title || s.docName || '');
  const zoom = useStore((s) => s.view.zoom);
  const canUndo = useStore((s) => s.history.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  return (
    <div className="toolbar">
      <button className="brand" onClick={() => goFiles()} title="All files">← Files</button>
      <div className="group">
        {TOOLS.map(([id, key, glyph]) => (
          <button key={id} className={'tool' + (tool === id ? ' active' : '')} title={`${id} (${key})`} onClick={() => setTool(id)}>{glyph}</button>
        ))}
      </div>
      <div className="group">
        <button onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>
      </div>
      <div className="group">
        <input className="title-input" value={title} title="File title (Files view)" onChange={(e) => setState((s) => ({ doc: { ...s.doc, meta: { ...(s.doc.meta || {}), title: e.target.value } } }))} onBlur={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
        <select value={docName || ''} onChange={(e) => e.target.value && openDoc(e.target.value)} title="Switch file">
          {!docName && <option value="">— select —</option>}
          {docs.map((d) => <option key={d.name} value={d.name}>{d.title || d.name}</option>)}
        </select>
        <button onClick={() => setState({ dialog: 'new' })} title="New document">＋</button>
        <button onClick={() => setState({ dialog: 'import' })} title="Import (native / Figma JSON / Figma API)">Import</button>
        <button onClick={() => setState({ dialog: 'prototype' })} title="Load an HTML prototype and capture its states as screens" disabled={!docName}>Prototype</button>
        <button onClick={() => setState({ dialog: 'export' })} title="Export (JSON / Figma / HTML / DSL)" disabled={!docName}>Export</button>
        <button onClick={() => setState({ dialog: 'libraries' })} title="Libraries: import, link, manage" disabled={!docName}>Libraries</button>
        <button onClick={() => setState({ dialog: 'versions' })} title="Version history" disabled={!docName}>History</button>
        <button onClick={() => setState({ dialog: 'brief' })} title="Product brief / spec stored with this file" disabled={!docName}>Brief</button>
      </div>
      <div className="group">
        <button onClick={() => tidy()} title="Tidy up: arrange all frames of this page on the grid" disabled={!docName}>⊞ Tidy</button>
      </div>
      <div className="spacer" />
      <div className="group">
        <button onClick={() => zoomBy(0.8)} title="Zoom out (⌘-)">−</button>
        <button onClick={() => zoomToFit()} title="Zoom to fit (⌘1)" style={{ minWidth: 48 }}>{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomBy(1.25)} title="Zoom in (⌘+)">＋</button>
      </div>
      <div className="group">
        <button onClick={() => setState({ dialog: 'help' })} title="Shortcuts & agent docs">?</button>
      </div>
    </div>
  );
}
