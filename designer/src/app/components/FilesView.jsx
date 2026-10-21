import React, { useEffect, useState } from 'react';
import { useStore, openDoc, setState, deleteDoc, duplicateDoc, setUser, refreshDocs } from '../store.js';

export function relTime(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function initials(name) { return String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

function Card({ d, onOpen }) {
  const [menu, setMenu] = useState(false);
  const by = d.updatedBy || d.createdBy;
  return (
    <div className="file-card" onClick={onOpen} title={`${d.title}\n${d.name}.json`}>
      <div className="file-thumb">
        <div className="file-thumb-frames">{Array.from({ length: Math.min(d.frames || 0, 6) }).map((_, i) => <span key={i} />)}</div>
        <div className="file-thumb-meta">{d.frames || 0} frame{d.frames === 1 ? '' : 's'}{d.pages > 1 ? ` · ${d.pages} pages` : ''}</div>
      </div>
      <div className="file-body">
        <div className="file-title">{d.title}</div>
        <div className="file-sub">
          <span className="avatar" title={by || 'unknown designer'}>{initials(by)}</span>
          <span>{by || 'Unknown'}</span>
          <span className="dot">·</span>
          <span title={d.updatedAt || ''}>{relTime(d.updatedAt)}</span>
        </div>
        {d.brief && <div className="file-brief muted">{d.brief}</div>}
        {d.libraries?.length > 0 && <div className="file-libs">{d.libraries.map((l) => <span key={l} className="tagchip">{l}</span>)}</div>}
      </div>
      <button className="file-menu-btn" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }} title="More">⋯</button>
      {menu && (
        <div className="file-menu" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setMenu(false)}>
          <button onClick={() => { setMenu(false); onOpen(); }}>Open</button>
          <button onClick={async () => { setMenu(false); const n = await duplicateDoc(d.name); openDoc(n); }}>Duplicate</button>
          <button onClick={async () => { setMenu(false); await openDoc(d.name); setState({ dialog: 'versions' }); }}>Version history</button>
          <button className="danger" onClick={async () => { setMenu(false); if (confirm(`Delete "${d.title}"? This cannot be undone.`)) await deleteDoc(d.name); }}>Delete</button>
        </div>
      )}
    </div>
  );
}

export default function FilesView() {
  const docs = useStore((s) => s.docs);
  const libraries = useStore((s) => s.libraries);
  const user = useStore((s) => s.user);
  const backend = useStore((s) => s.backend);
  const [q, setQ] = useState('');
  const [editingUser, setEditingUser] = useState(!user);
  useEffect(() => { refreshDocs(); }, []);
  const list = docs.filter((d) => !q || (d.title || '').toLowerCase().includes(q.toLowerCase()) || d.name.includes(q.toLowerCase()));
  return (
    <div className="files">
      <header className="files-header">
        <div className="brand">LE<span>·</span>Designer</div>
        <input className="files-search" placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        <span className="muted">{backend ? (backend.kind === 'server' ? 'files on the server' : 'files in this browser') : ''}</span>
        {editingUser ? (
          <input className="user-input" autoFocus placeholder="Your name (designer)" defaultValue={user} onBlur={(e) => { setUser(e.target.value.trim()); setEditingUser(false); }} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
        ) : (
          <button className="user-chip" onClick={() => setEditingUser(true)} title="Change your name"><span className="avatar">{initials(user)}</span>{user || 'Set your name'}</button>
        )}
        <button className="primary" onClick={() => setState({ dialog: 'new' })}>＋ New file</button>
        <button onClick={() => setState({ dialog: 'import' })}>Import</button>
      </header>
      <main className="files-main">
        <h2>Recent files <span className="muted">{list.length}</span></h2>
        {!list.length && <div className="empty-state">No files yet. Create one, import a Figma file, or run <code>node le.js new &lt;name&gt; &lt; page.dsl</code>.</div>}
        <div className="file-grid">
          {list.map((d) => <Card key={d.name} d={d} onOpen={() => openDoc(d.name)} />)}
        </div>
        {libraries.length > 0 && (
          <>
            <h2 style={{ marginTop: 32 }}>Libraries <span className="muted">{libraries.length}</span></h2>
            <div className="file-grid">
              {libraries.map((l) => (
                <div className="file-card lib" key={l.name} onClick={() => setState({ dialog: 'libraries' })} title="Manage libraries">
                  <div className="file-thumb"><div className="file-thumb-meta">❖ {l.components} components</div></div>
                  <div className="file-body"><div className="file-title">{l.name}</div><div className="file-sub muted">{l.source || 'library'}</div></div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
