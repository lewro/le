import React from 'react';
import { useStore, setState } from '../store.js';
import Inspector from './Inspector.jsx';
import CodePanel from './CodePanel.jsx';

export default function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  return (
    <>
      <div className="tabs">
        <button className={tab === 'design' ? 'active' : ''} onClick={() => setState({ rightTab: 'design' })}>Design</button>
        <button className={tab === 'code' ? 'active' : ''} onClick={() => setState({ rightTab: 'code' })}>Code</button>
      </div>
      {tab === 'design' ? <Inspector /> : <CodePanel />}
    </>
  );
}
