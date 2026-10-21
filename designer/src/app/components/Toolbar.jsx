import React from 'react';
import { useStore, setTool, undo, redo, zoomBy, zoomToFit, setState, openDoc } from '../store.js';

const TOOLS = [
  ['select', 'V', '↖'], ['frame', 'F', '▭'], ['rect', 'R', '■'], ['ellipse', 'O', '●'], ['text', 'T', 'T'], ['line', 'L', '╱'],
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const docs = useStore((s) => s.docs);
  const docName = useStore((s) => s.docName);
  const zoom = useStore((s) => s.zoom);
  const canUndo = useStore((s) => s.history.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  return (
    <div className="toolbar">
      <div className="brand">LE<span>·</span>Designer</div>
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
        <select value={docName || ''} onChange={(e) => e.target.value && openDoc(e.target.value)} title="Document">
          {!docName && <option value="">— select —</option>}
          {docs.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
        <button onClick={() => setState({ dialog: 'new' })} title="New document">＋</button>
        <button onClick={() => setState({ dialog: 'import' })} title="Import (native / Figma JSON / Figma API)">Import</button>
        <button onClick={() => setState({ dialog: 'export' })} title="Export (JSON / Figma / HTML / DSL)" disabled={!docName}>Export</button>
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
