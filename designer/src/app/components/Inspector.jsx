import React from 'react';
import { useStore, setProps, setDsl, selectedNodes, apply, getIndex, select } from '../store.js';
import { findById, hasAutoLayout, sizingH, sizingV } from '../../core/model.js';
import { resolveComponent, textSlots } from '../../core/components.js';
import { paintToShort, parsePaint } from '../../core/dsl.js';
import { hexToRgba, rgbaToHex } from '../../core/style.js';
import { Num, Txt, Sel, Seg, Check } from './fields.jsx';

const TAGS = ['', 'div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside', 'a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'ul', 'ol', 'li', 'img', 'form', 'input', 'label', 'figure', 'blockquote'];
const WEIGHTS = [[100, 'Thin'], [200, 'Extra light'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semi bold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']];
const FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat', 'Source Sans 3', 'Playfair Display', 'Merriweather', 'IBM Plex Sans', 'DM Sans', 'Manrope', 'Space Grotesk', 'JetBrains Mono', 'Georgia', 'Arial', 'Helvetica', 'system-ui'];

function solidHex(p) { return p && p.type === 'SOLID' ? p.color.slice(0, 7) : '#000000'; }

function PaintList({ title, paints, onChange, addDefault = '#d9d9d9' }) {
  const list = paints || [];
  const update = (i, p) => onChange(list.map((x, j) => (j === i ? p : x)));
  return (
    <div className="section">
      <h4>{title}<span className="actions"><button title="Add" onClick={() => onChange([...list, { type: 'SOLID', color: addDefault }])}>＋</button></span></h4>
      {list.map((p, i) => {
        const alpha = hexToRgba(p.color || '#000000').a;
        const opacity = Math.round((p.opacity ?? 1) * alpha * 100);
        return (
          <div className="paint-row" key={i}>
            {p.type === 'SOLID' ? <input type="color" value={solidHex(p)} onChange={(e) => update(i, { ...p, color: e.target.value + (alpha < 1 ? p.color.slice(7) : '') })} /> : <span className="kbd">{p.type === 'IMAGE' ? 'img' : 'grad'}</span>}
            <div className="hex"><Txt value={paintToShort({ ...p, opacity: undefined })} title={p.token ? `token ${p.token} = ${p.color}` : undefined} onCommit={(v) => { const np = parsePaint(v); if (np) update(i, { ...np, opacity: p.opacity, visible: p.visible }); else onChange(list.filter((_, j) => j !== i)); }} /></div>
            <div style={{ flex: '0 0 56px' }}><Num value={opacity} min={0} max={100} onCommit={(v) => { const { r, g, b } = hexToRgba(p.color || '#000000'); update(i, { ...p, color: p.type === 'SOLID' ? rgbaToHex({ r, g, b, a: v / 100 }) : p.color, opacity: p.type === 'SOLID' ? undefined : v / 100 }); }} /></div>
            <button title="Toggle" onClick={() => update(i, { ...p, visible: p.visible === false ? undefined : false })}>{p.visible === false ? '◌' : '◉'}</button>
            <button title="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))}>−</button>
          </div>
        );
      })}
      {!list.length && <div className="muted">None</div>}
    </div>
  );
}

function InstanceInspector({ n }) {
  const doc = useStore((s) => s.doc);
  const index = getIndex();
  const r = resolveComponent(index, n);
  const f = findById(doc, n.id);
  const parent = f?.parent;
  const inAuto = parent && hasAutoLayout(parent) && n.layoutPositioning !== 'ABSOLUTE';
  const sizingOpts = [['', 'Default'], ['FIXED', 'Fixed'], ['HUG', 'Hug'], ['FILL', 'Fill']];
  const slots = r ? textSlots(r.component) : [];
  const ov = n.overrides || {};
  const setOv = (sel, patch) => setProps({ overrides: { [sel]: patch } });
  const textValue = (slot, i) => {
    const direct = ov[slot.name]?.characters;
    if (direct !== undefined) return direct;
    if (i === 0 && ov['@TEXT']?.characters !== undefined) return ov['@TEXT'].characters;
    return slot.characters;
  };
  return (
    <div className="inspector">
      <div className="section">
        <h4><span>instance <span className="muted mono">#{n.id}</span></span>
          <span className="actions">
            <button title={n.visible === false ? 'Show' : 'Hide'} onClick={() => setProps({ visible: n.visible === false ? null : false })}>{n.visible === false ? '◌' : '◉'}</button>
            <button title={n.locked ? 'Unlock' : 'Lock'} onClick={() => setProps({ locked: n.locked ? null : true })}>{n.locked ? '🔒' : '🔓'}</button>
          </span>
        </h4>
        <div className="row"><Txt label="Name" value={n.name} onCommit={(v) => setProps({ name: v })} /></div>
        <div className="row">
          <Sel label="Component" value={r ? r.entry.name : n.component || ''} options={[...(r ? [] : [[n.component || '', `${n.component || n.componentId} (missing)`]]), ...index.list.map((e) => [e.name, e.name + (e.lib ? ` · ${e.lib}` : '')])]}
            onCommit={(v) => apply({ op: 'swap', target: '#' + n.id, component: v, resetOverrides: false }, { label: 'Swap component' })} />
        </div>
        {r && r.entry.type === 'COMPONENT_SET' && Object.entries(r.entry.variants).map(([prop, values]) => (
          <div className="row" key={prop}>
            <Sel label={prop} value={(n.variant || {})[prop] ?? (r.component ? (Object.entries(r.component.name.split(',').map((p) => p.split('=').map((x) => x.trim()))).find(([, kv]) => kv[0] === prop) || [])[1]?.[1] : '')} options={values} onCommit={(v) => setProps({ variant: { [prop]: v } })} />
          </div>
        ))}
        {r?.entry.description && <div className="muted" style={{ marginTop: 4 }}>{r.entry.description}</div>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="fixed" onClick={() => { const res = apply({ op: 'detach', target: '#' + n.id }, { label: 'Detach instance' }); if (res) select(res.created[0]); }} title="Turn into a plain frame">Detach</button>
          {Object.keys(ov).length > 0 && <button className="fixed" onClick={() => setProps({ overrides: null })}>Reset overrides</button>}
          {r && r.entry.lib === null && <button className="fixed" onClick={() => select(r.component.id)}>Go to main</button>}
        </div>
      </div>
      {slots.length > 0 && (
        <div className="section">
          <h4>Text</h4>
          {slots.map((slot, i) => (
            <div className="row" key={slot.name + i}><Txt label={slot.name} value={textValue(slot, i)} onCommit={(v) => setOv(slot.name, { characters: v })} /></div>
          ))}
        </div>
      )}
      <div className="section">
        <h4>Layout</h4>
        <div className="row">
          <Num label="X" value={n.x} disabled={inAuto} onCommit={(v) => setProps({ x: v })} />
          <Num label="Y" value={n.y} disabled={inAuto} onCommit={(v) => setProps({ y: v })} />
        </div>
        <div className="row">
          <Num label="W" value={n.width} placeholder="auto" onCommit={(v) => setProps({ width: v, layoutSizingHorizontal: 'FIXED' })} />
          <Sel value={n.layoutSizingHorizontal || ''} options={sizingOpts} onCommit={(v) => setProps({ layoutSizingHorizontal: v || null })} />
        </div>
        <div className="row">
          <Num label="H" value={n.height} placeholder="auto" onCommit={(v) => setProps({ height: v, layoutSizingVertical: 'FIXED' })} />
          <Sel value={n.layoutSizingVertical || ''} options={sizingOpts} onCommit={(v) => setProps({ layoutSizingVertical: v || null })} />
        </div>
        <div className="row">
          <Num label="Opacity" value={Math.round((n.opacity ?? 1) * 100)} min={0} max={100} onCommit={(v) => setProps({ opacity: v === 100 ? null : v / 100 })} />
          {parent && hasAutoLayout(parent) && <Check label="Absolute" checked={n.layoutPositioning === 'ABSOLUTE'} onCommit={(c) => setProps({ layoutPositioning: c ? 'ABSOLUTE' : null })} />}
        </div>
        <div className="row">
          <Sel label="Tag" value={n.html?.tag || ''} options={TAGS.map((t) => [t, t || 'auto'])} onCommit={(v) => setProps({ html: { tag: v || null } })} />
          <Txt label="Class" value={n.html?.className || ''} onCommit={(v) => setProps({ html: { className: v || null } })} />
        </div>
      </div>
      {Object.keys(ov).length > 0 && (
        <div className="section">
          <h4>Overrides</h4>
          <pre className="mono muted" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 10.5 }}>{JSON.stringify(ov, null, 1)}</pre>
        </div>
      )}
    </div>
  );
}

export default function Inspector() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const nodes = selectedNodes();
  if (!doc) return <div className="empty-state">No document.</div>;
  if (!nodes.length) {
    const page = doc.children[0];
    return <div className="empty-state">Select a layer to inspect it.<br /><span className="muted">{page ? `${page.children.length} top-level frames` : ''}</span></div>;
  }
  const n = nodes[0];
  if (n.type === 'INSTANCE' && nodes.length === 1) return <InstanceInspector n={n} />;
  const f = findById(doc, n.id);
  const parent = f?.parent;
  const inAuto = parent && hasAutoLayout(parent) && n.layoutPositioning !== 'ABSOLUTE';
  const isText = n.type === 'TEXT';
  const canLayout = !!n.children && n.type !== 'GROUP';
  const st = n.style || {};
  const multi = nodes.length > 1;
  const sizingOpts = [['FIXED', 'Fixed'], ['HUG', 'Hug'], ['FILL', 'Fill']];
  const setStyle = (patch) => setProps({ style: patch });
  const radii = n.rectangleCornerRadii;

  return (
    <div className="inspector">
      <div className="section">
        <h4>
          <span>{multi ? `${nodes.length} layers` : n.type.toLowerCase()} <span className="muted mono">#{n.id}</span></span>
          <span className="actions">
            <button title={n.visible === false ? 'Show' : 'Hide'} onClick={() => setProps({ visible: n.visible === false ? null : false })}>{n.visible === false ? '◌' : '◉'}</button>
            <button title={n.locked ? 'Unlock' : 'Lock'} onClick={() => setProps({ locked: n.locked ? null : true })}>{n.locked ? '🔒' : '🔓'}</button>
          </span>
        </h4>
        {!multi && <div className="row"><Txt label="Name" value={n.name} onCommit={(v) => setProps({ name: v })} /></div>}
        <div className="row">
          <Sel label="Tag" value={n.html?.tag || ''} options={TAGS.map((t) => [t, t || 'auto'])} onCommit={(v) => setProps({ html: { tag: v || null } })} title="Semantic HTML tag used on export" />
          <Txt label="Class" value={n.html?.className || ''} placeholder="css classes" onCommit={(v) => setProps({ html: { className: v || null } })} />
        </div>
        {(n.html?.tag === 'a' || n.html?.attrs?.href) && <div className="row"><Txt label="href" value={n.html?.attrs?.href || ''} onCommit={(v) => setProps({ html: { attrs: { href: v || null } } })} /></div>}
        {n.type === 'COMPONENT' || n.type === 'COMPONENT_SET' ? (
          <div className="row"><Txt label="Description" value={n.description || ''} placeholder="what this component is for" onCommit={(v) => setProps({ description: v || null })} /></div>
        ) : (n.children && !multi && parent?.type !== 'COMPONENT_SET' && (
          <div className="row"><button className="fixed" onClick={() => apply({ op: 'component', target: '#' + n.id }, { label: 'Create component' })} title="Turn this frame into a reusable component">❖ Create component</button></div>
        ))}
        {n.html?.tag === 'img' && <div className="row"><Txt label="alt" value={n.html?.attrs?.alt || ''} onCommit={(v) => setProps({ html: { attrs: { alt: v || null } } })} /></div>}
      </div>

      <div className="section">
        <h4>Layout</h4>
        <div className="row">
          <Num label="X" value={n.x} disabled={inAuto} onCommit={(v) => setProps({ x: v })} />
          <Num label="Y" value={n.y} disabled={inAuto} onCommit={(v) => setProps({ y: v })} />
        </div>
        <div className="row">
          <Num label="W" value={sizingH(n) === 'FIXED' ? n.width : undefined} placeholder={sizingH(n).toLowerCase()} onCommit={(v) => setProps({ width: v, layoutSizingHorizontal: 'FIXED' })} />
          <Sel value={sizingH(n)} options={sizingOpts} onCommit={(v) => setProps({ layoutSizingHorizontal: v })} />
        </div>
        <div className="row">
          <Num label="H" value={sizingV(n) === 'FIXED' ? n.height : undefined} placeholder={sizingV(n).toLowerCase()} onCommit={(v) => setProps({ height: v, layoutSizingVertical: 'FIXED' })} />
          <Sel value={sizingV(n)} options={sizingOpts} onCommit={(v) => setProps({ layoutSizingVertical: v })} />
        </div>
        <div className="row">
          <Num label="↻" value={n.rotation || 0} onCommit={(v) => setProps({ rotation: v || null })} title="Rotation" />
          {parent && hasAutoLayout(parent) && <Check label="Absolute" checked={n.layoutPositioning === 'ABSOLUTE'} onCommit={(c) => setProps({ layoutPositioning: c ? 'ABSOLUTE' : null })} />}
        </div>
      </div>

      {canLayout && (
        <div className="section">
          <h4>Auto layout</h4>
          <div className="row">
            <Seg value={n.layoutMode || 'NONE'} options={[['NONE', '✕', 'No auto layout'], ['HORIZONTAL', '→', 'Horizontal'], ['VERTICAL', '↓', 'Vertical']]}
              onCommit={(v) => setDsl(v === 'NONE' ? 'nolayout' : v === 'HORIZONTAL' ? 'row' : 'col')} />
            {hasAutoLayout(n) && <Check label="Wrap" checked={n.layoutWrap === 'WRAP'} onCommit={(c) => setProps({ layoutWrap: c ? 'WRAP' : null })} />}
          </div>
          {hasAutoLayout(n) && (
            <>
              <div className="row">
                <Num label="Gap" value={n.itemSpacing || 0} min={0} onCommit={(v) => setProps({ itemSpacing: v })} />
                {n.layoutWrap === 'WRAP' ? <Num label="Row gap" value={n.counterAxisSpacing ?? n.itemSpacing ?? 0} min={0} onCommit={(v) => setProps({ counterAxisSpacing: v })} /> : <span />}
              </div>
              <div className="row">
                <Num label="⊤" title="Padding top" value={n.paddingTop || 0} min={0} onCommit={(v) => setProps({ paddingTop: v })} />
                <Num label="⊣" title="Padding right" value={n.paddingRight || 0} min={0} onCommit={(v) => setProps({ paddingRight: v })} />
                <Num label="⊥" title="Padding bottom" value={n.paddingBottom || 0} min={0} onCommit={(v) => setProps({ paddingBottom: v })} />
                <Num label="⊢" title="Padding left" value={n.paddingLeft || 0} min={0} onCommit={(v) => setProps({ paddingLeft: v })} />
              </div>
              <div className="row">
                <Sel label="Main" value={n.primaryAxisAlignItems || 'MIN'} options={[['MIN', 'Start'], ['CENTER', 'Center'], ['MAX', 'End'], ['SPACE_BETWEEN', 'Space between']]} onCommit={(v) => setProps({ primaryAxisAlignItems: v })} />
                <Sel label="Cross" value={n.counterAxisAlignItems || 'MIN'} options={[['MIN', 'Start'], ['CENTER', 'Center'], ['MAX', 'End'], ['BASELINE', 'Baseline']]} onCommit={(v) => setProps({ counterAxisAlignItems: v })} />
              </div>
            </>
          )}
          <Check label="Clip content" checked={n.clipsContent} onCommit={(c) => setProps({ clipsContent: c })} />
        </div>
      )}

      {isText && (
        <div className="section">
          <h4>Text</h4>
          <textarea rows={3} style={{ width: '100%', marginBottom: 6, fontFamily: 'inherit' }} value={n.characters || ''} onChange={(e) => apply({ op: 'text', target: '#' + n.id, characters: e.target.value }, { transient: true })} onBlur={() => apply({ op: 'text', target: '#' + n.id, characters: n.characters || '' }, { label: 'Edit text' })} />
          {Object.keys(getIndex().tokens.textStyles).length > 0 && (
            <div className="row">
              <Sel label="Style" value={st.token || ''} options={[['', '— none —'], ...Object.keys(getIndex().tokens.textStyles).map((k) => [k, k])]} onCommit={(v) => (v ? setDsl(`ts=${JSON.stringify(v)}`) : setStyle({ token: null }))} />
            </div>
          )}
          <div className="row">
            <Sel value={st.fontFamily || 'Inter'} options={[...new Set([st.fontFamily || 'Inter', ...FONTS])]} onCommit={(v) => setStyle({ fontFamily: v })} />
          </div>
          <div className="row">
            <Sel value={st.fontWeight || 400} options={WEIGHTS} onCommit={(v) => setStyle({ fontWeight: parseInt(v, 10) })} />
            <Num label="Size" value={st.fontSize || 16} min={1} onCommit={(v) => setStyle({ fontSize: v })} />
          </div>
          <div className="row">
            <Num label="LH" title="Line height (px, blank = auto)" value={st.lineHeightPx ?? (st.lineHeightPercentFontSize ? ((st.fontSize || 16) * st.lineHeightPercentFontSize) / 100 : undefined)} placeholder="auto" min={0} onCommit={(v) => setStyle({ lineHeightPx: v || null, lineHeightPercentFontSize: null })} />
            <Num label="LS" title="Letter spacing (px)" value={st.letterSpacing || 0} step={0.1} onCommit={(v) => setStyle({ letterSpacing: v || null })} />
          </div>
          <div className="row">
            <Seg value={st.textAlignHorizontal || 'LEFT'} options={[['LEFT', '⇤'], ['CENTER', '↔'], ['RIGHT', '⇥'], ['JUSTIFIED', '≡']]} onCommit={(v) => setStyle({ textAlignHorizontal: v })} />
            <Seg value={st.textAlignVertical || 'TOP'} options={[['TOP', '⤒'], ['CENTER', '↕'], ['BOTTOM', '⤓']]} onCommit={(v) => setStyle({ textAlignVertical: v })} />
          </div>
          <div className="row">
            <Sel label="Deco" value={st.textDecoration || 'NONE'} options={[['NONE', 'None'], ['UNDERLINE', 'Underline'], ['STRIKETHROUGH', 'Strike']]} onCommit={(v) => setStyle({ textDecoration: v === 'NONE' ? null : v })} />
            <Sel label="Case" value={st.textCase || 'ORIGINAL'} options={[['ORIGINAL', 'As typed'], ['UPPER', 'UPPER'], ['LOWER', 'lower'], ['TITLE', 'Title']]} onCommit={(v) => setStyle({ textCase: v === 'ORIGINAL' ? null : v })} />
          </div>
          <Check label="Italic" checked={st.italic} onCommit={(c) => setStyle({ italic: c || null })} />
        </div>
      )}

      <div className="section">
        <h4>Appearance</h4>
        <div className="row">
          <Num label="Opacity" value={Math.round((n.opacity ?? 1) * 100)} min={0} max={100} onCommit={(v) => setProps({ opacity: v === 100 ? null : v / 100 })} />
          {n.type !== 'TEXT' && n.type !== 'ELLIPSE' && n.type !== 'LINE' && (
            radii
              ? <button className="fixed" title="Single radius" onClick={() => setProps({ cornerRadius: radii[0], rectangleCornerRadii: null })}>⌜</button>
              : <><Num label="Radius" value={n.cornerRadius || 0} min={0} onCommit={(v) => setProps({ cornerRadius: v || null })} /><button className="fixed" title="Independent corners" onClick={() => setProps({ rectangleCornerRadii: [n.cornerRadius || 0, n.cornerRadius || 0, n.cornerRadius || 0, n.cornerRadius || 0], cornerRadius: null })}>⌜⌝</button></>
          )}
        </div>
        {radii && (
          <div className="row">
            {['⌜', '⌝', '⌟', '⌞'].map((l, i) => <Num key={i} label={l} value={radii[i]} min={0} onCommit={(v) => { const r = [...radii]; r[i] = v; setProps({ rectangleCornerRadii: r }); }} />)}
          </div>
        )}
      </div>

      <PaintList title={isText ? 'Text color' : 'Fill'} paints={n.fills} onChange={(fills) => setProps({ fills })} addDefault={isText ? '#000000' : n.children ? '#ffffff' : '#d9d9d9'} />

      <PaintList title="Stroke" paints={n.strokes} onChange={(strokes) => setProps({ strokes, strokeWeight: n.strokeWeight ?? 1 })} addDefault="#000000" />
      {!!(n.strokes && n.strokes.length) && (
        <div className="section">
          <div className="row">
            <Num label="Weight" value={n.strokeWeight ?? 1} min={0} onCommit={(v) => setProps({ strokeWeight: v })} />
            <Sel value={n.strokeAlign || 'INSIDE'} options={[['INSIDE', 'Inside'], ['CENTER', 'Center'], ['OUTSIDE', 'Outside']]} onCommit={(v) => setProps({ strokeAlign: v })} />
          </div>
        </div>
      )}

      <div className="section">
        <h4>Effects<span className="actions"><button title="Add drop shadow" onClick={() => setProps({ effects: [...(n.effects || []), { type: 'DROP_SHADOW', offset: { x: 0, y: 4 }, radius: 12, spread: 0, color: '#00000026', visible: true }] })}>＋</button></span></h4>
        {(n.effects || []).map((e, i) => {
          const update = (patch) => setProps({ effects: (n.effects || []).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') return (
            <div className="row" key={i}><span className="muted fixed">{e.type === 'LAYER_BLUR' ? 'Blur' : 'Bg blur'}</span><Num value={e.radius} min={0} onCommit={(v) => update({ radius: v })} /><button className="fixed" onClick={() => setProps({ effects: n.effects.filter((_, j) => j !== i) })}>−</button></div>
          );
          return (
            <div key={i}>
              <div className="row">
                <span className="muted fixed">{e.type === 'INNER_SHADOW' ? 'Inner' : 'Shadow'}</span>
                <input type="color" className="fixed" value={(e.color || '#000000').slice(0, 7)} onChange={(ev) => update({ color: ev.target.value + (e.color || '').slice(7) })} />
                <Txt value={e.color} onCommit={(v) => update({ color: v })} />
                <button className="fixed" onClick={() => update({ type: e.type === 'INNER_SHADOW' ? 'DROP_SHADOW' : 'INNER_SHADOW' })} title="Toggle inner/outer">⇄</button>
                <button className="fixed" onClick={() => setProps({ effects: n.effects.filter((_, j) => j !== i) })}>−</button>
              </div>
              <div className="row">
                <Num label="X" value={e.offset?.x || 0} onCommit={(v) => update({ offset: { x: v, y: e.offset?.y || 0 } })} />
                <Num label="Y" value={e.offset?.y || 0} onCommit={(v) => update({ offset: { x: e.offset?.x || 0, y: v } })} />
                <Num label="B" value={e.radius || 0} min={0} onCommit={(v) => update({ radius: v })} />
                <Num label="S" value={e.spread || 0} onCommit={(v) => update({ spread: v })} />
              </div>
            </div>
          );
        })}
        {!(n.effects || []).length && <div className="muted">None</div>}
      </div>
    </div>
  );
}
