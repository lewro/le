import React, { useEffect, useRef, useState } from 'react';
import { useStore, setState, apply, select, currentPage, zoomToFit } from '../store.js';
import { captureDocument } from '../../core/capture.js';

/**
 * Prototype viewer: load an HTML prototype (file, pasted HTML, or URL through the server proxy) into an iframe,
 * interact with it (open menus, switch tabs…) and capture each state as a screen on the canvas.
 */
export default function PrototypeDialog({ close }) {
  const backend = useStore((s) => s.backend);
  const docName = useStore((s) => s.docName);
  const [html, setHtml] = useState('');
  const [url, setUrl] = useState('');
  const [stateName, setStateName] = useState('');
  const [width, setWidth] = useState(1440);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [captured, setCaptured] = useState([]);
  const frameRef = useRef(null);
  const fileRef = useRef(null);

  const load = async () => {
    setErr('');
    try {
      let text = html;
      if (!text && url) {
        if (backend.kind !== 'server') throw new Error('Loading a URL needs the server; paste the HTML instead');
        const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
        if (!r.ok) throw new Error((await r.json()).error || r.statusText);
        text = await r.text();
      }
      if (!text) throw new Error('Paste HTML, choose a file or enter a URL');
      frameRef.current.srcdoc = text;
      setMsg('Loaded. Interact with the prototype, then capture the state you want as a screen.');
    } catch (e) { setErr(e.message); }
  };
  const onFile = async (e) => { const f = e.target.files[0]; if (f) { setHtml(await f.text()); setMsg(`File ${f.name} ready — press Load`); } };

  const capture = () => {
    setErr('');
    try {
      const doc = frameRef.current.contentDocument;
      if (!doc || !doc.body) throw new Error('Nothing loaded');
      const name = stateName.trim() || doc.title || `Screen ${captured.length + 1}`;
      const node = captureDocument(doc, { name });
      const page = currentPage();
      const r = apply({ op: 'add', parent: '#' + page.id, node }, { label: `Capture ${name}` });
      if (r) { setCaptured([...captured, name]); select(r.created[0]); setMsg(`Captured "${name}" (${r.created.length} nodes). Change the prototype state and capture again.`); setStateName(''); }
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => () => { if (captured.length) requestAnimationFrame(() => zoomToFit()); }, [captured.length]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal proto-modal" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') close(); e.stopPropagation(); }}>
        <h3>HTML prototype → screens <span className="muted" style={{ fontWeight: 400 }}>into {docName}</span></h3>
        <div className="row">
          <input type="file" accept=".html,.htm,text/html" ref={fileRef} onChange={onFile} className="fixed" />
          <input type="text" placeholder="…or URL of the prototype (fetched by the server)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="field sm"><span className="lbl">W</span><input value={width} onChange={(e) => setWidth(parseInt(e.target.value, 10) || 1440)} /></div>
          <button className="primary fixed" onClick={load}>Load</button>
        </div>
        <textarea placeholder="…or paste HTML here (elements with data-component=&quot;Button&quot; data-variant=&quot;Type=Primary&quot; become library instances)" value={html} onChange={(e) => setHtml(e.target.value)} style={{ minHeight: 56, maxHeight: 120 }} />
        <div className="proto-frame-wrap">
          <iframe ref={frameRef} title="prototype" className="proto-frame" style={{ width }} sandbox="allow-same-origin allow-scripts allow-forms allow-popups" />
        </div>
        <div className="row">
          <input type="text" placeholder="State name, e.g. Dropdown open" value={stateName} onChange={(e) => setStateName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && capture()} />
          <button className="primary fixed" onClick={capture}>Capture this state as a screen</button>
        </div>
        {captured.length > 0 && <div className="muted">Captured: {captured.join(' · ')}</div>}
        {msg && <div style={{ color: '#4ade80' }}>{msg}</div>}
        {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
        <div className="footer"><button onClick={close}>Done</button></div>
      </div>
    </div>
  );
}

export { setState };
