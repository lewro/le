import React, { useState } from 'react';
import { useStore, selectedNodes, getIndex } from '../store.js';
import { findById } from '../../core/model.js';
import { nodeSpec } from '../../core/devspec.js';
import { expandInstance } from '../../core/components.js';
import { computeStyle, toCssText } from '../../core/style.js';
import { exportHtml } from '../../core/html.js';
import { serializeDsl } from '../../core/dsl.js';

const GROUP_COLOR = { Layout: '#3b82f6', Appearance: '#22c55e', Typography: '#f59e0b', Component: '#a855f7', HTML: '#64748b' };

function Copy({ text }) {
  const [ok, setOk] = useState(false);
  return <button className="copy-btn" title="Copy" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 900); }}>{ok ? '✓' : '⧉'}</button>;
}

export default function InspectPanel() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const libs = useStore((s) => s.libs);
  const [code, setCode] = useState('css');
  const nodes = selectedNodes();
  if (!doc) return null;
  if (!nodes.length) return <div className="empty-state">Dev mode<br /><span className="muted">Select an element to see its spec. Hover another one to measure distances.</span></div>;
  const n = nodes[0];
  const parent = findById(doc, n.id)?.parent;
  const expanded = n.type === 'INSTANCE' ? expandInstance(getIndex(), n) : null;
  const groups = nodeSpec(n, parent, expanded);
  const tokens = getIndex().tokens;
  const codeText = code === 'css' ? toCssText(computeStyle(expanded || n, parent), '')
    : code === 'html' ? exportHtml(doc, { nodes: [n], libs: Object.values(libs), fontLink: false }).replace(/^[\s\S]*<body>\n?/, '').replace(/<\/body>[\s\S]*$/, '')
    : serializeDsl(n, { ids: false }, parent);
  return (
    <div className="inspector inspect">
      <div className="section">
        <h4><span>{n.name} <span className="muted mono">#{n.id}</span></span></h4>
        <div className="muted">{n.type.toLowerCase()}{n.html?.tag ? ` · <${n.html.tag}>` : ''}</div>
      </div>
      {groups.map((g) => (
        <div className="section" key={g.group}>
          <h4><span style={{ color: GROUP_COLOR[g.group] }}>{g.group}</span></h4>
          {g.items.map((it) => (
            <div className="spec-row" key={it.key}>
              <span className="spec-label">{it.label}</span>
              {it.color && <span className="dev-chip" style={{ background: it.color }} />}
              <span className="spec-value">{it.token ? <><b>${it.token}</b> <span className="muted">{it.value}</span></> : it.value}</span>
              <Copy text={it.token ? `$${it.token}` : it.value} />
            </div>
          ))}
        </div>
      ))}
      {Object.keys(tokens.colors).length > 0 && (
        <div className="section">
          <h4>Tokens used</h4>
          {collectTokens(expanded || n).map((t) => <div className="spec-row" key={t}><span className="spec-label">${t}</span><span className="spec-value muted">{tokenValue(tokens, t)}</span><Copy text={`var(--${t.replace(/[^A-Za-z0-9]+/g, '-')})`} /></div>)}
        </div>
      )}
      <div className="section code-section">
        <h4>
          <span className="seg" style={{ padding: 2 }}>
            {[['css', 'CSS'], ['html', 'HTML'], ['dsl', 'DSL']].map(([k, l]) => <button key={k} className={code === k ? 'active' : ''} onClick={() => setCode(k)}>{l}</button>)}
          </span>
          <span className="actions"><Copy text={codeText} /></span>
        </h4>
        <pre className="mono">{codeText}</pre>
      </div>
    </div>
  );
}

function collectTokens(node) {
  const out = new Set();
  const rec = (n) => {
    for (const p of [...(n.fills || []), ...(n.strokes || [])]) if (p.token) out.add(p.token);
    if (n.style?.token) out.add(n.style.token);
    for (const e of n.effects || []) if (e.token) out.add(e.token);
    for (const c of n.children || []) rec(c);
  };
  rec(node);
  return [...out];
}
function tokenValue(tokens, name) {
  if (tokens.colors[name] !== undefined) return typeof tokens.colors[name] === 'string' ? tokens.colors[name] : 'gradient';
  if (tokens.textStyles[name]) { const t = tokens.textStyles[name]; return `${t.fontFamily || 'Inter'} ${t.fontWeight || 400} ${t.fontSize}px/${t.lineHeightPx ? t.lineHeightPx + 'px' : 'auto'}`; }
  if (tokens.effects[name]) return 'effect';
  return '';
}
