import React, { useEffect, useMemo, useState } from 'react';
import { useStore, apply, selectedNodes, currentPage, replaceDoc, select } from '../store.js';
import { serializeDsl, parseDsl } from '../../core/dsl.js';
import { computeStyle, toCssText } from '../../core/style.js';
import { findById, assignIds, clone } from '../../core/model.js';

export default function CodePanel() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const [mode, setMode] = useState('dsl');
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const nodes = selectedNodes();
  const page = currentPage();

  const generated = useMemo(() => {
    if (!doc) return '';
    if (mode === 'dsl') {
      if (nodes.length) return serializeDsl(nodes, { ids: true }, findById(doc, nodes[0].id)?.parent);
      return page ? serializeDsl(page.children, { ids: true }, page) : '';
    }
    if (mode === 'css') {
      if (!nodes.length) return '/* select a layer */';
      return nodes.map((n) => `/* ${n.name} */\n.${String(n.id).replace(/[^a-zA-Z0-9_-]/g, '_')} {\n${toCssText(computeStyle(n, findById(doc, n.id)?.parent), '  ')}\n}`).join('\n\n');
    }
    if (mode === 'json') return JSON.stringify(nodes.length ? (nodes.length === 1 ? nodes[0] : nodes) : page, null, 2);
    return '';
  }, [doc, selection, mode, nodes.length && nodes[0], page]);

  useEffect(() => { if (!dirty) { setText(generated); setError(''); } }, [generated, dirty]);

  const applyText = () => {
    try {
      if (mode === 'dsl') {
        const roots = parseDsl(text);
        if (nodes.length === 1) {
          const f = findById(doc, nodes[0].id);
          apply({ op: 'replace', target: '#' + nodes[0].id, dsl: text }, { label: 'Apply DSL' });
          void f;
        } else if (nodes.length > 1) {
          // replace each selected node in order with the parsed roots
          const ops = nodes.map((n, i) => (roots[i] ? { op: 'replace', target: '#' + n.id, nodes: [roots[i]] } : { op: 'remove', target: '#' + n.id }));
          apply(ops, { label: 'Apply DSL' });
        } else {
          const next = clone(doc);
          const p = next.children.find((x) => x.id === page.id);
          p.children = roots;
          assignIds(next);
          replaceDoc(next, 'Apply DSL');
        }
      } else if (mode === 'json') {
        const parsed = JSON.parse(text);
        if (nodes.length === 1) apply({ op: 'replace', target: '#' + nodes[0].id, node: parsed }, { label: 'Apply JSON' });
        else if (!nodes.length && parsed.type === 'CANVAS') { const next = clone(doc); next.children = next.children.map((p) => (p.id === page.id ? parsed : p)); assignIds(next); replaceDoc(next, 'Apply JSON'); }
        else throw new Error('Select exactly one layer to apply JSON');
      }
      setDirty(false); setError('');
    } catch (e) { setError(e.message); }
  };

  const addAsChildren = () => {
    try {
      const parent = nodes.length === 1 && nodes[0].children ? nodes[0] : page;
      const r = apply({ op: 'add', parent: '#' + parent.id, dsl: text }, { label: 'Add from DSL' });
      if (r) { select(r.created.slice(0, 1)); setDirty(false); }
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="code-panel">
      <div className="tabs">
        {[['dsl', 'DSL'], ['css', 'CSS'], ['json', 'JSON']].map(([m, l]) => <button key={m} className={mode === m ? 'active' : ''} onClick={() => { setMode(m); setDirty(false); }}>{l}</button>)}
      </div>
      <div className="bar">
        <span className="muted">{nodes.length ? `${nodes.length} selected` : page ? `page: ${page.name}` : ''}</span>
        <span className="spacer" />
        <button onClick={() => navigator.clipboard.writeText(text)}>Copy</button>
        {mode === 'dsl' && <button onClick={addAsChildren} title="Insert the DSL as children of the selected frame (or the page)">Insert</button>}
        {mode !== 'css' && <button className="primary" onClick={applyText} disabled={!dirty} title={nodes.length ? 'Replace selection' : 'Replace page content'}>Apply</button>}
      </div>
      {mode === 'css'
        ? <pre className="mono">{generated}</pre>
        : <textarea spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') applyText(); if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const s = t.selectionStart; setText(text.slice(0, s) + '  ' + text.slice(t.selectionEnd)); setDirty(true); requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2)); } }} />}
      {error && <div style={{ color: 'var(--danger)', padding: '6px 8px' }}>{error}</div>}
      {dirty && mode !== 'css' && <div className="muted" style={{ padding: '4px 8px' }}>Unapplied changes · ⌘↵ to apply</div>}
    </div>
  );
}
