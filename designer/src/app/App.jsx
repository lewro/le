import React, { useEffect } from 'react';
import { useStore, init, undo, redo, apply, select, setTool, zoomBy, zoomToFit, setState, getState, selectedNodes, currentPage, saveNow, setView } from './store.js';
import Toolbar from './components/Toolbar.jsx';
import LayersPanel from './components/LayersPanel.jsx';
import AssetsPanel from './components/AssetsPanel.jsx';
import Canvas from './components/Canvas.jsx';
import RightPanel from './components/RightPanel.jsx';
import Dialogs from './components/Dialogs.jsx';
import FilesView from './components/FilesView.jsx';
import { findById, getParent, hasAutoLayout, cloneWithNewIds, clone, pathTo } from '../core/model.js';

function isTyping(e) {
  const check = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  return check(document.activeElement) || check(e?.target);
}

let clipboard = null;

function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  return (
    <>
      <div className="tabs">
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setState({ leftTab: 'layers' })}>Layers</button>
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setState({ leftTab: 'assets' })}>Assets</button>
      </div>
      {tab === 'layers' ? <LayersPanel /> : <AssetsPanel />}
    </>
  );
}

export default function App() {
  const route = useStore((s) => s.route);
  const docName = useStore((s) => s.docName);
  const status = useStore((s) => s.status);
  const saving = useStore((s) => s.saving);
  const dirty = useStore((s) => s.dirty);
  const backend = useStore((s) => s.backend);
  const zoom = useStore((s) => s.view.zoom);
  const selection = useStore((s) => s.selection);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); return; }
      if (isTyping(e)) return;
      const s = getState();
      if (s.route !== 'editor') return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (s.selection.length) { const r = apply({ op: 'duplicate', target: '#' + s.selection[0], dx: 10, dy: 10 }, { label: 'Duplicate' }); if (r) select(r.created[0]); } return; }
      if (mod && e.key.toLowerCase() === 'c') { if (s.selection.length) clipboard = selectedNodes().map(clone); return; }
      if (mod && e.key.toLowerCase() === 'x') { if (s.selection.length) { clipboard = selectedNodes().map(clone); apply({ op: 'remove', target: s.selection.map((i) => '#' + i), all: true }, { label: 'Cut' }); select([]); } return; }
      if (mod && e.key.toLowerCase() === 'v') {
        if (!clipboard) return;
        const parentId = s.selection.length ? (findById(s.doc, s.selection[0])?.node.children ? s.selection[0] : getParent(s.doc, s.selection[0])?.id) : currentPage()?.id;
        const nodes = clipboard.map((n) => { const c = clone(n); c.x = (c.x || 0) + 10; c.y = (c.y || 0) + 10; return c; });
        const r = apply({ op: 'add', parent: '#' + parentId, nodes: nodes.map((n) => cloneWithNewIds(s.doc, n)) }, { label: 'Paste' });
        if (r) select(r.created.filter((id) => nodes.length && findById(s.doc, id) === null).slice(0, nodes.length));
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); const p = currentPage(); if (p) select(p.children.map((c) => c.id)); return; }
      if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); if (s.selection.length) { const r = apply({ op: 'wrap', target: s.selection.map((i) => '#' + i), dsl: 'frame Group col bg=none noclip', all: true }, { label: 'Group' }); if (r) select(r.created[0]); } return; }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.25); return; }
      if (mod && e.key === '-') { e.preventDefault(); zoomBy(0.8); return; }
      if (mod && e.key === '0') { e.preventDefault(); setView({ zoom: 1 }, { commit: 'now' }); return; }
      if (mod && e.key === '1') { e.preventDefault(); zoomToFit(); return; }
      if (mod && e.key === '2') { e.preventDefault(); if (s.selection.length) zoomToFit(80, selectedNodes().map((n) => (findById(s.doc, n.id).parent?.type === 'CANVAS' ? n : pathTo(s.doc, n.id)[2]))); return; }
      if (mod && e.key === '\\') { e.preventDefault(); return; }
      if (mod) return;
      switch (e.key) {
        case 'v': case 'V': setTool('select'); break;
        case 'f': case 'F': setTool('frame'); break;
        case 'r': case 'R': setTool('rect'); break;
        case 'o': case 'O': setTool('ellipse'); break;
        case 't': case 'T': setTool('text'); break;
        case 'l': case 'L': setTool('line'); break;
        case 'Escape': if (s.editingId) setState({ editingId: null }); else if (s.tool !== 'select') setTool('select'); else select([]); break;
        case 'Delete': case 'Backspace':
          if (s.selection.length) { e.preventDefault(); apply({ op: 'remove', target: s.selection.map((i) => '#' + i), all: true }, { label: 'Delete' }); select([]); }
          break;
        case 'Enter': {
          if (s.selection.length === 1) { const n = findById(s.doc, s.selection[0])?.node; if (n?.type === 'TEXT') setState({ editingId: n.id }); else if (n?.children?.length) select(n.children[0].id); }
          break;
        }
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          if (!s.selection.length) return;
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
          const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
          const ops = [];
          for (const id of s.selection) {
            const f = findById(s.doc, id);
            if (!f) continue;
            if (hasAutoLayout(f.parent) && f.node.layoutPositioning !== 'ABSOLUTE') {
              const horiz = f.parent.layoutMode === 'HORIZONTAL';
              const delta = horiz ? Math.sign(dx) : Math.sign(dy);
              if (delta) ops.push({ op: 'reorder', target: '#' + id, index: Math.max(0, Math.min(f.parent.children.length - 1, f.index + delta)) });
            } else ops.push({ op: 'set', target: '#' + id, props: { x: (f.node.x || 0) + dx, y: (f.node.y || 0) + dy } });
          }
          if (ops.length) apply(ops, { label: 'Nudge' });
          break;
        }
        default: return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (route !== 'editor') return <><FilesView /><Dialogs /></>;
  return (
    <div className="app">
      <Toolbar />
      <div className="left"><LeftPanel /></div>
      <Canvas />
      <div className="right"><RightPanel /></div>
      <div className="statusbar">
        <span>{docName ? `${docName}.json` : 'No document'}</span>
        <span>{backend ? (backend.kind === 'server' ? 'server' : 'local storage') : 'connecting…'}</span>
        <span>{saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}</span>
        <span className="spacer" />
        <span>{status}</span>
        <span>{selection.length ? `${selection.length} selected` : ''}</span>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      <Dialogs />
    </div>
  );
}
