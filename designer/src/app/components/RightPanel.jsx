import React from 'react';
import { useStore, setState } from '../store.js';
import Inspector from './Inspector.jsx';
import CodePanel from './CodePanel.jsx';
import InspectPanel from './InspectPanel.jsx';

export default function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  const dev = useStore((s) => s.devMode);
  return (
    <>
      <div className="tabs">
        <button className={tab === 'design' ? 'active' : ''} onClick={() => setState({ rightTab: 'design' })}>{dev ? 'Inspect' : 'Design'}</button>
        <button className={tab === 'code' ? 'active' : ''} onClick={() => setState({ rightTab: 'code' })}>Code</button>
        <label className={'dev-switch' + (dev ? ' on' : '')} title="Dev mode (Shift+D): measurements and specs on the canvas">
          <input type="checkbox" checked={!!dev} onChange={(e) => setState({ devMode: e.target.checked })} />
          <span className="dev-track"><span className="dev-knob" /></span>
          <span>Dev</span>
        </label>
      </div>
      {tab === 'design' ? (dev ? <InspectPanel /> : <Inspector />) : <CodePanel />}
    </>
  );
}
