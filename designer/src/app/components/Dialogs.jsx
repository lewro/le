import React, { useState } from 'react';
import { useStore, setState, createDoc, getState, replaceDoc, openDoc, refreshDocs, deleteDoc } from '../store.js';
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
  const [name, setName] = useState('');
  const [dsl, setDsl] = useState('');
  const [err, setErr] = useState('');
  const go = async () => {
    const n = name.trim().replace(/[^A-Za-z0-9._-]+/g, '-');
    if (!n) return setErr('Name required');
    try { await createDoc(n, dsl); close(); } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="New document" onClose={close}>
      <div className="row"><input type="text" autoFocus placeholder="document name (file name)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></div>
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
  const pageIndex = Math.max(0, doc.children.findIndex((p) => p.id === pageId));
  const copy = (t) => navigator.clipboard.writeText(t);
  return (
    <Modal title="Export" onClose={close}>
      <div className="row"><span style={{ flex: 1 }}><b>Native JSON</b><div className="hint">Full fidelity. Paste into the LE Figma plugin to push this design into Figma.</div></span><button className="fixed" onClick={() => copy(JSON.stringify(doc))}>Copy</button><button className="fixed primary" onClick={() => download(`${docName}.json`, JSON.stringify(doc, null, 1))}>Download</button></div>
      <div className="row"><span style={{ flex: 1 }}><b>Figma REST JSON</b><div className="hint">Same shape as <code>GET /v1/files/:key</code> (absolute bounds, float colors, sizing modes).</div></span><button className="fixed" onClick={() => copy(JSON.stringify(toFigma(doc)))}>Copy</button><button className="fixed primary" onClick={() => download(`${docName}.figma.json`, JSON.stringify(toFigma(doc), null, 1))}>Download</button></div>
      <div className="row"><span style={{ flex: 1 }}><b>HTML + CSS</b><div className="hint">Current page as a standalone HTML file with semantic tags and classes.</div></span><button className="fixed" onClick={() => copy(exportHtml(doc, { page: pageIndex }))}>Copy</button><button className="fixed primary" onClick={() => download(`${docName}.html`, exportHtml(doc, { page: pageIndex }), 'text/html')}>Download</button></div>
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
          Drag a layer inside an auto-layout frame to reorder it; drag in the Layers panel to re-parent.
        </div>
      </div>
      <h4 style={{ margin: '10px 0 4px' }}>For agents</h4>
      <div className="hint" style={{ fontSize: 12 }}>
        Documents are JSON files in <code>designer/designs/</code>; open editors live-reload when they change. The CLI edits them directly:
        <pre className="mono" style={{ background: 'var(--panel-2)', padding: 8, borderRadius: 6, overflow: 'auto' }}>{`node le.js dsl ${docName || 'doc'}                 # read the page as DSL (with #ids)
node le.js set ${docName || 'doc'} Header/Nav gap=32   # change properties
node le.js add ${docName || 'doc'} Header 'frame CTA p=10,16 r=8 bg=#2563eb'
node le.js new landing < page.dsl           # build a page from DSL
curl -X POST localhost:5173/api/docs/${docName || 'doc'}/ops -d '[{"op":"set","target":"Hero/Title","dsl":"size=64"}]'`}</pre>
        The full DSL and ops reference is in <code>designer/AGENTS.md</code>.
      </div>
      <div className="footer"><button className="primary" onClick={close}>Close</button></div>
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
  return null;
}

export { getState, replaceDoc, deleteDoc };
