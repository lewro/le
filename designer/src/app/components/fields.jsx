import React, { useEffect, useRef, useState } from 'react';

/** Numeric input that commits on blur/Enter and supports arrow keys and label-drag scrubbing. */
export function Num({ label, value, onCommit, step = 1, min, max, disabled, title, placeholder }) {
  const shown = value === undefined || value === null || value === '' ? '' : String(Math.round(value * 100) / 100);
  const [v, setV] = useState(shown);
  const last = useRef(shown); // last committed value, so Enter followed by blur commits only once
  useEffect(() => { setV(shown); last.current = shown; }, [shown]);
  const commit = (raw) => {
    if (raw === '' || raw === shown || raw === last.current) { setV(shown); return; }
    let n = parseFloat(raw);
    if (!Number.isFinite(n)) { setV(shown); return; }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    last.current = String(n);
    onCommit(n);
  };
  const onLabelDown = (e) => {
    if (disabled) return;
    const startX = e.clientX, start = parseFloat(shown) || 0;
    const move = (ev) => { const d = Math.round((ev.clientX - startX) / 2) * step; onCommit(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, start + d))); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return (
    <div className={'field' + (disabled ? ' disabled' : '')} title={title}>
      {label !== undefined && <span className="lbl" onPointerDown={onLabelDown}>{label}</span>}
      <input value={v} disabled={disabled} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => commit(v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(v); e.target.blur(); }
          if (e.key === 'Escape') { setV(shown); e.target.blur(); }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) * step; commit(String((parseFloat(v) || 0) + d)); }
        }} />
    </div>
  );
}

export function Txt({ label, value, onCommit, placeholder, disabled }) {
  const shown = value ?? '';
  const [v, setV] = useState(shown);
  const last = useRef(shown);
  useEffect(() => { setV(shown); last.current = shown; }, [shown]);
  const commit = () => { if (v !== shown && v !== last.current) { last.current = v; onCommit(v); } };
  return (
    <div className="field">
      {label !== undefined && <span className="lbl">{label}</span>}
      <input value={v} placeholder={placeholder} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.target.blur(); } if (e.key === 'Escape') { setV(shown); e.target.blur(); } }} />
    </div>
  );
}

export function Sel({ label, value, options, onCommit, title }) {
  return (
    <div className="field" title={title}>
      {label !== undefined && <span className="lbl">{label}</span>}
      <select value={value ?? ''} onChange={(e) => onCommit(e.target.value)}>
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
      </select>
    </div>
  );
}

export function Seg({ value, options, onCommit }) {
  return (
    <div className="seg">
      {options.map(([val, label, title]) => <button key={val} title={title} className={value === val ? 'active' : ''} onClick={() => onCommit(val)}>{label}</button>)}
    </div>
  );
}

export function Check({ label, checked, onCommit }) {
  return <label className="row" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" className="fixed" checked={!!checked} onChange={(e) => onCommit(e.target.checked)} /><span>{label}</span></label>;
}
