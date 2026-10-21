import React, { useState } from 'react';
import { useStore, setState, createDoc, getState, replaceDoc, openDoc, refreshDocs, deleteDoc, setLinkedLibraries, refreshLibraries, getIndex } from '../store.js';
import { describeComponents, expandDocument } from '../../core/components.js';
import { fromFigma, toFigma } from '../../core/figma.js';
import { exportHtml } from '../../core/html.js';
import { serializeDsl } from '../../core/dsl.js';

function download(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); e.stopPropagation(); }}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function NewDialog({ close }) {
  const libraries = useStore((s) => s.libraries);
  const [name, setName] = useState('');
  const [dsl, setDsl] = useState('');
  const [libs, setLibs] = useState([]);
  const [err, setErr] = useState('');
  const go = async () => {
    const n = name.trim().replace(/[^A-Za-z0-9._-]+/g, '-');
    if (!n) return setErr('Name required');
    try { await createDoc(n, dsl, libs); close(); } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="New document" onClose={close}>
      <div className="row"><input type="text" autoFocus placeholder="document name (file name)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></div>
      {libraries.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <span className="muted fixed">Libraries:</span>
          {libraries.map((l) => <label key={l.name} className="fixed" style={{ cursor: 'pointer' }}><input type="checkbox" checked={libs.includes(l.name)} onChange={(e) => setLibs(e.target.checked ? [...libs, l.name] : libs.filter((x) => x !== l.name))} /> {l.name}</label>)}
        </div>
      )}
      <div className="hint">Optional: paste DSL to start from (see ? for the syntax).</div>
      <textarea value={dsl} onChange={(e) => setDsl(e.target.value)} placeholder={'frame Page col w=1440 bg=#fff\n  text "Hello" size=32 weight=700'} />
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
      <div className="footer"><button onClick={close}>Cancel</button><button className="primary" onClick={go}>Create</button></div>
    </Modal>
  );
}

function ImportDialog({ close }) {
  const backend = useStore((s) => s.backend);
  const [name, setName] = useState('');
  const [json, setJson] = useState('');
  const [token, setToken] = useState(localStorage.getItem('le-designer:figma-token') || '');
  const [fileKey, setFileKey] = useState('');
  const [nodeIds, setNodeIds] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const importJson = async (text, suggested) => {
    try {
      const parsed = JSON.parse(text);
      const docName = (name || suggested || parsed.name || 'imported').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
      const doc = fromFigma(parsed, docName);
      await backend.put(docName, doc);
      await refreshDocs();
      await openDoc(docName);
      close();
    } catch (e) { setErr(e.message); }
  };
  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    importJson(await f.text(), f.name.replace(/\.json$/i, ''));
  };
  const fetchFigma = async () => {
    setBusy(true); setErr('');
    try {
      localStorage.setItem('le-designer:figma-token', token);
      let key = fileKey.trim();
      const m = /figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/.exec(key);
      if (m) key = m[1];
      const ids = nodeIds.split(/[,\s]+/).filter(Boolean).map((s) => s.replace('-', ':'));
      const res = await backend.figmaImport({ token, fileKey: key, nodeIds: ids.length ? ids : undefined, name: name || undefined });
      await refreshDocs();
      await openDoc(res.name);
      close();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal title="Import" onClose={close}>
      <div className="row"><input type="text" placeholder="document name (optional)" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <h4 style={{ margin: '8px 0 4px' }}>From a JSON file</h4>
      <div className="hint">Native LE JSON, a Figma REST API response (<code>GET /v1/files/:key</code>), or the output of the bundled Figma plugin.</div>
      <div className="row"><input type="file" accept="application/json,.json" onChange={onFile} /></div>
      <textarea placeholder="…or paste JSON here" value={json} onChange={(e) => setJson(e.target.value)} />
      <div className="footer" style={{ marginTop: 6 }}><button className="primary" disabled={!json.trim()} onClick={() => importJson(json)}>Import JSON</button></div>
      <h4 style={{ margin: '8px 0 4px' }}>From the Figma API</h4>
      <div className="hint">Needs a personal access token (Figma → Settings → Security). The token is only stored in this browser.</div>
      <div className="row"><input type="password" placeholder="figd_… personal access token" value={token} onChange={(e) => setToken(e.target.value)} /></div>
      <div className="row"><input type="text" placeholder="file key or figma.com/design/… URL" value={fileKey} onChange={(e) => setFileKey(e.target.value)} /></div>
      <div className="row"><input type="text" placeholder="node ids (optional, e.g. 12:34, 56-78)" value={nodeIds} onChange={(e) => setNodeIds(e.target.value)} /></div>
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
      <div className="footer"><button onClick={close}>Cancel</button><button className="primary" disabled={busy || !token || !fileKey} onClick={fetchFigma}>{busy ? 'Fetching…' : 'Fetch from Figma'}</button></div>
    </Modal>
  );
}

function ExportDialog({ close }) {
  const doc = useStore((s) => s.doc);
  const docName = useStore((s) => s.docName);
  const pageId = useStore((s) => s.pageId);
  const libs = Object.values(useStore((s) => s.libs));
  const expanded = () => expandDocument(doc, libs);
  const pageIndex = Math.max(0, doc.children.findIndex((p) => p.id === pageId));
  const copy = (t) => navigator.clipboard.writeText(t);
  return (
    <Modal title="Export" onClose={close}>
      <div className="row"><span style={{ flex: 1 }}><b>Native JSON</b><div className="hint">Full fidelity, instances kept as references to the linked libraries.</div></span><button className="fixed" onClick={() => copy(JSON.stringify(doc))}>Copy</button><button className="fixed primary" onClick={() => download(`${docName}.json`, JSON.stringify(doc, null, 1))}>Download</button></div>
      <div className="row"><span style={{ flex: 1 }}><b>Native JSON for the Figma plugin</b><div className="hint">Instances expanded (with their component name/key kept), so the plugin can rebuild them as real instances when the library is in Figma, or as frames otherwise.</div></span><button className="fixed" onClick={() => copy(JSON.stringify(expanded()))}>Copy</button><button className="fixed primary" onClick={() => download(`${docName}.expanded.json`, JSON.stringify(expanded(), null, 1))}>Download</button></div>
      <div className="row"><span style={{ flex: 1 }}><b>Figma REST JSON</b><div className="hint">Same shape as <code>GET /v1/files/:key</code> (absolute bounds, float colors, sizing modes).</div></span><button className="fixed" onClick={() => copy(JSON.stringify(toFigma(doc, libs)))}>Copy</button><button className="fixed primary" onClick={() => download(`${docName}.figma.json`, JSON.stringify(toFigma(doc, libs), null, 1))}>Download</button></div>
      <div className="row"><span style={{ flex: 1 }}><b>HTML + CSS</b><div className="hint">Current page as a standalone HTML file with semantic tags and classes.</div></span><button className="fixed" onClick={() => copy(exportHtml(doc, { page: pageIndex, libs }))}>Copy</button><button className="fixed primary" onClick={() => download(`${docName}.html`, exportHtml(doc, { page: pageIndex, libs }), 'text/html')}>Download</button></div>
      <div className="row"><span style={{ flex: 1 }}><b>DSL</b><div className="hint">Compact text format; the fastest way to hand a page to an agent.</div></span><button className="fixed" onClick={() => copy(serializeDsl(doc, { ids: false }))}>Copy</button><button className="fixed primary" onClick={() => download(`${docName}.dsl`, serializeDsl(doc, { ids: false }), 'text/plain')}>Download</button></div>
      <div className="footer"><button onClick={close}>Close</button></div>
    </Modal>
  );
}

function HelpDialog({ close }) {
  const docName = useStore((s) => s.docName);
  return (
    <Modal title="Shortcuts & agent workflow" onClose={close}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, lineHeight: 1.8 }}>
          <b>Tools</b><br />
          <span className="kbd">V</span> select · <span className="kbd">F</span> frame · <span className="kbd">R</span> rectangle · <span className="kbd">O</span> ellipse · <span className="kbd">T</span> text · <span className="kbd">L</span> line<br />
          <span className="kbd">Space</span>+drag pan · <span className="kbd">⌘</span>+scroll zoom · <span className="kbd">⌘1</span> fit · <span className="kbd">⌘0</span> 100%<br />
          <b>Edit</b><br />
          <span className="kbd">⌘Z</span> undo · <span className="kbd">⇧⌘Z</span> redo · <span className="kbd">⌘D</span> duplicate · <span className="kbd">⌘G</span> group in frame<br />
          <span className="kbd">⌘C</span>/<span className="kbd">⌘V</span> copy/paste · <span className="kbd">⌫</span> delete · arrows nudge (⇧ ×10, reorders in auto layout)<br />
          <span className="kbd">Enter</span> edit text / enter frame · double-click drills into a layer · <span className="kbd">⌘</span>+click selects the deepest layer<br />
          Drag a layer inside an auto-layout frame to reorder it; drag in the Layers panel to re-parent.<br />
          <b>Libraries</b>: Libraries → import (Figma URL/key, JSON URL, file, or DSL) and tick to link. Assets tab → click a component to insert an instance. Inspector → variants, text overrides, Detach.
        </div>
      </div>
      <h4 style={{ margin: '10px 0 4px' }}>For agents</h4>
      <div className="hint" style={{ fontSize: 12 }}>
        Documents are JSON files in <code>designer/designs/</code>; open editors live-reload when they change. The CLI edits them directly:
        <pre className="mono" style={{ background: 'var(--panel-2)', padding: 8, borderRadius: 6, overflow: 'auto' }}>{`node le.js dsl ${docName || 'doc'}                 # read the page as DSL (with #ids)
node le.js set ${docName || 'doc'} Header/Nav gap=32   # change properties
node le.js add ${docName || 'doc'} Header 'frame CTA p=10,16 r=8 bg=#2563eb'
node le.js new landing < page.dsl           # build a page from DSL
node le.js components ${docName || 'doc'}            # library components + tokens available to this document
node le.js lint ${docName || 'doc'}                  # strict: everything must come from the libraries
curl -X POST localhost:5173/api/docs/${docName || 'doc'}/ops -d '[{"op":"set","target":"Hero/Title","dsl":"size=64"}]'`}</pre>
        The full DSL and ops reference is in <code>designer/AGENTS.md</code>.
      </div>
      <div className="footer"><button className="primary" onClick={close}>Close</button></div>
    </Modal>
  );
}

function LibrariesDialog({ close }) {
  const backend = useStore((s) => s.backend);
  const libraries = useStore((s) => s.libraries);
  const doc = useStore((s) => s.doc);
  const linked = doc?.libraries || [];
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState(localStorage.getItem('le-designer:figma-token') || '');
  const [dsl, setDsl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const isFigma = /figma\.com|^[A-Za-z0-9]{15,}$/.test(source.trim()) && !/\.json($|\?)/.test(source);
  const toggle = async (lib) => {
    try { await setLinkedLibraries(linked.includes(lib) ? linked.filter((l) => l !== lib) : [...linked, lib]); } catch (e) { setErr(e.message); }
  };
  const importFrom = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      if (token) localStorage.setItem('le-designer:figma-token', token);
      const res = await backend.importLib({ source: source.trim(), token, name: name || undefined });
      await refreshLibraries();
      await setLinkedLibraries([...new Set([...linked, res.name])]);
      setMsg(`Imported "${res.name}"${res.components ? `: ${res.components.length} components` : ''} and linked it.`);
      setSource(''); setName('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const importFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const json = JSON.parse(await f.text());
      const res = await backend.importLib({ json, name: name || f.name.replace(/\.json$/i, '') });
      await refreshLibraries();
      await setLinkedLibraries([...new Set([...linked, res.name])]);
      setMsg(`Imported "${res.name}" and linked it.`);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };
  const createFromDsl = async () => {
    const n = name.trim().replace(/[^A-Za-z0-9._-]+/g, '-');
    if (!n) return setErr('Give the library a name first');
    setBusy(true); setErr('');
    try {
      const { createDocument, assignIds } = await import('../../core/model.js');
      const { parseDslDocument } = await import('../../core/dsl.js');
      const d = createDocument(n); d.kind = 'library';
      const { roots, tokens } = parseDslDocument(dsl);
      d.children[0].children.push(...roots); assignIds(d);
      if (Object.keys(tokens.colors).length || Object.keys(tokens.textStyles).length || Object.keys(tokens.effects).length) d.tokens = tokens;
      await backend.putLib(n, d);
      await refreshLibraries();
      await setLinkedLibraries([...new Set([...linked, n])]);
      setMsg(`Created "${n}" and linked it.`); setDsl('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const remove = async (lib) => {
    if (!confirm(`Delete library "${lib}"? Documents using it will show missing components.`)) return;
    await backend.removeLib(lib);
    await refreshLibraries();
    if (linked.includes(lib)) await setLinkedLibraries(linked.filter((l) => l !== lib));
  };
  return (
    <Modal title="Libraries" onClose={close}>
      <div className="hint">Linked libraries provide components (with variants), colors and text styles to this document. Tick to link.</div>
      {libraries.map((l) => (
        <div className="lib-row" key={l.name}>
          <input type="checkbox" checked={linked.includes(l.name)} onChange={() => toggle(l.name)} />
          <span className="grow"><b>{l.name}</b> <span className="meta">{l.components} components{l.source ? ` · ${l.source}` : ''}</span></span>
          <button onClick={() => remove(l.name)} title="Delete library">🗑</button>
        </div>
      ))}
      {!libraries.length && <div className="muted" style={{ padding: '6px 0' }}>No libraries yet.</div>}
      <h4 style={{ margin: '14px 0 4px' }}>Import a library</h4>
      <div className="hint">Paste a Figma file URL or key (any file your token can open: your own libraries, team libraries, or a community file after "Open in Figma" duplicated it to your drafts), or a URL to a JSON export.</div>
      <div className="row"><input type="text" placeholder="https://www.figma.com/design/<key>/… or https://…/library.json" value={source} onChange={(e) => setSource(e.target.value)} /></div>
      {isFigma && <div className="row"><input type="password" placeholder="figd_… Figma personal access token" value={token} onChange={(e) => setToken(e.target.value)} /></div>}
      <div className="row"><input type="text" placeholder="library name (optional)" value={name} onChange={(e) => setName(e.target.value)} /><button className="primary fixed" disabled={busy || !source.trim() || (isFigma && !token)} onClick={importFrom}>{busy ? 'Importing…' : 'Import'}</button></div>
      <div className="row"><span className="muted fixed">…or a JSON file:</span><input type="file" accept=".json,application/json" onChange={importFile} /></div>
      <h4 style={{ margin: '14px 0 4px' }}>Create from DSL</h4>
      <textarea value={dsl} onChange={(e) => setDsl(e.target.value)} placeholder={'token Primary/500 #2563eb\ntextstyle Body size=16 lh=24\nset Button\n  component "Type=Primary" row p=12,24 r=8 bg=$Primary/500\n    text Label "Button" ts=Body color=#fff'} style={{ minHeight: 100 }} />
      <div className="footer" style={{ marginTop: 6 }}><button className="primary" disabled={busy || !dsl.trim()} onClick={createFromDsl}>Create library "{name || '…'}"</button></div>
      {msg && <div style={{ color: '#4ade80' }}>{msg}</div>}
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
      <div className="footer"><button onClick={close}>Close</button></div>
    </Modal>
  );
}

export default function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const close = () => setState({ dialog: null });
  if (!dialog) return null;
  if (dialog === 'new') return <NewDialog close={close} />;
  if (dialog === 'import') return <ImportDialog close={close} />;
  if (dialog === 'export') return <ExportDialog close={close} />;
  if (dialog === 'help') return <HelpDialog close={close} />;
  if (dialog === 'libraries') return <LibrariesDialog close={close} />;
  return null;
}

export { getState, replaceDoc, deleteDoc };
