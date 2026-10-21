import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDsl, serializeDsl, applyShorthandString } from '../src/core/dsl.js';
import { applyOps } from '../src/core/ops.js';
import { createDocument, assignIds, resolve, getNode, createNode } from '../src/core/model.js';
import { toFigma, fromFigma } from '../src/core/figma.js';
import { exportHtml } from '../src/core/html.js';
import { computeStyle } from '../src/core/style.js';

const PAGE = `frame Header row w=fill h=72 p=16,32 gap=24 items=center justify=between bg=#fff tag=header
  text Logo "Acme" size=20 weight=700 color=#111
  frame Nav row gap=24
    text "Home" size=14
    text "Pricing" size=14
  frame Button p=10,16 r=8 bg=#2563eb tag=a href=/signup shadow=0,2,8,0,#00000020
    text "Sign up" size=14 weight=600 color=#fff`;

function docFrom(dsl) {
  const doc = createDocument('t');
  doc.children[0].children.push(...parseDsl(dsl));
  assignIds(doc);
  return doc;
}

test('DSL parses layout, defaults and round-trips', () => {
  const roots = parseDsl(PAGE);
  const header = roots[0];
  assert.equal(header.type, 'FRAME');
  assert.equal(header.layoutMode, 'HORIZONTAL');
  assert.equal(header.layoutSizingHorizontal, 'FILL');
  assert.equal(header.height, 72);
  assert.deepEqual([header.paddingTop, header.paddingRight, header.paddingBottom, header.paddingLeft], [16, 32, 16, 32]);
  assert.equal(header.primaryAxisAlignItems, 'SPACE_BETWEEN');
  assert.equal(header.html.tag, 'header');
  const nav = header.children[1];
  assert.equal(nav.layoutSizingHorizontal, 'HUG', 'auto-layout frames hug by default');
  const button = header.children[2];
  assert.equal(button.layoutMode, 'HORIZONTAL', 'padding implies auto layout');
  assert.equal(button.html.attrs.href, '/signup');
  assert.equal(button.effects[0].type, 'DROP_SHADOW');
  const text = header.children[0];
  assert.equal(text.characters, 'Acme');
  assert.equal(text.name, 'Logo');
  assert.equal(text.style.fontWeight, 700);
  assert.equal(text.fills[0].color, '#111111');
  const out = serializeDsl(roots, { ids: false });
  assert.equal(serializeDsl(parseDsl(out), { ids: false }), out, 'serialize(parse(x)) is stable');
});

test('shorthand strings update nodes', () => {
  const n = createNode('FRAME');
  applyShorthandString(n, 'col gap=12 p=8 bg=none stroke=#000 sw=2 r=4,4,0,0 opacity=0.5 hidden');
  assert.equal(n.layoutMode, 'VERTICAL');
  assert.equal(n.itemSpacing, 12);
  assert.deepEqual(n.fills, []);
  assert.equal(n.strokeWeight, 2);
  assert.deepEqual(n.rectangleCornerRadii, [4, 4, 0, 0]);
  assert.equal(n.opacity, 0.5);
  assert.equal(n.visible, false);
  const t = createNode('TEXT');
  applyShorthandString(t, 'size=24 lh=1.5 align=center case=upper style.fontFamily=Roboto');
  assert.equal(t.style.lineHeightPercentFontSize, 150);
  assert.equal(t.style.textAlignHorizontal, 'CENTER');
  assert.equal(t.style.fontFamily, 'Roboto');
});

test('selectors', () => {
  const doc = docFrom(PAGE);
  assert.equal(resolve(doc, 'Header/Nav/Home')[0].characters, 'Home');
  assert.equal(resolve(doc, 'Nav/@TEXT').length, 2);
  assert.equal(resolve(doc, 'Nav/@TEXT[1]')[0].characters, 'Pricing');
  assert.equal(resolve(doc, 'Header/*').length, 3);
  assert.equal(resolve(doc, '/Page 1/Header').length, 1);
  const id = resolve(doc, 'Button')[0].id;
  assert.equal(resolve(doc, '#' + id)[0].name, 'Button');
  assert.equal(resolve(doc, id)[0].name, 'Button');
  assert.equal(resolve(doc, 'Nope').length, 0);
});

test('ops: set, add, move, replace, remove, duplicate, wrap, unwrap', () => {
  const doc = docFrom(PAGE);
  applyOps(doc, { op: 'set', target: 'Nav', dsl: 'gap=40 bg=#eee', props: { name: 'Menu' } });
  const nav = resolve(doc, 'Menu')[0];
  assert.equal(nav.itemSpacing, 40);
  assert.equal(nav.fills[0].color, '#eeeeee');
  const r = applyOps(doc, { op: 'add', parent: 'Menu', index: 0, dsl: 'text "Docs"' });
  assert.equal(nav.children[0].characters, 'Docs');
  assert.ok(r.created.length === 1 && nav.children[0].id === r.created[0]);
  applyOps(doc, { op: 'move', target: 'Menu/Docs', parent: 'Menu', index: -1 });
  assert.equal(nav.children[nav.children.length - 1].characters, 'Docs');
  const btnId = resolve(doc, 'Button')[0].id;
  applyOps(doc, { op: 'replace', target: 'Button', dsl: 'frame Button p=12 bg=#000\n  text "Go" color=#fff' });
  assert.equal(resolve(doc, 'Button')[0].id, btnId, 'replace keeps the id');
  assert.equal(resolve(doc, 'Button/Go')[0].characters, 'Go');
  applyOps(doc, { op: 'duplicate', target: 'Button' });
  assert.equal(resolve(doc, 'Button').length, 2);
  applyOps(doc, { op: 'remove', target: 'Button[1]' });
  assert.equal(resolve(doc, 'Button').length, 1);
  const w = applyOps(doc, { op: 'wrap', target: 'Menu/@TEXT', dsl: 'frame Links row gap=8', all: true });
  assert.equal(resolve(doc, 'Links')[0].children.length, 3);
  assert.equal(w.created.length, 1);
  applyOps(doc, { op: 'unwrap', target: 'Links' });
  assert.equal(resolve(doc, 'Links').length, 0);
  assert.equal(nav.children.length, 3);
  assert.throws(() => applyOps(doc, { op: 'set', target: 'Nope', dsl: 'gap=1' }), /Selector not found/);
  assert.throws(() => applyOps(doc, { op: 'move', target: 'Header', parent: 'Menu' }), /into itself/);
});

test('figma REST round trip preserves layout and text', () => {
  const doc = docFrom(PAGE);
  const fig = toFigma(doc);
  assert.equal(fig.document.type, 'DOCUMENT');
  const header = fig.document.children[0].children[0];
  assert.equal(header.layoutMode, 'HORIZONTAL');
  assert.equal(header.primaryAxisAlignItems, 'SPACE_BETWEEN');
  assert.ok(header.absoluteBoundingBox);
  assert.deepEqual(header.fills[0].color, { r: 1, g: 1, b: 1, a: 1 });
  const logo = header.children[0];
  assert.equal(logo.style.fontWeight, 700);
  assert.equal(logo.characters, 'Acme');
  assert.equal(logo.textAutoResize, 'WIDTH_AND_HEIGHT');
  const back = fromFigma(JSON.parse(JSON.stringify(fig)));
  const h2 = back.children[0].children[0];
  assert.equal(h2.layoutMode, 'HORIZONTAL');
  assert.equal(h2.paddingLeft, 32);
  assert.equal(h2.children[0].style.fontWeight, 700);
  assert.equal(h2.children[0].fills[0].color, '#111111');
  assert.equal(h2.children[2].html.tag, 'a');
  assert.equal(h2.children[1].layoutSizingHorizontal, 'HUG');
});

test('fromFigma handles file responses with absolute coordinates', () => {
  const file = { name: 'F', document: { id: '0:0', type: 'DOCUMENT', children: [{ id: '0:1', type: 'CANVAS', name: 'P', children: [
    { id: '1:1', type: 'FRAME', name: 'A', absoluteBoundingBox: { x: 100, y: 50, width: 200, height: 100 }, fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 } }], children: [
      { id: '1:2', type: 'RECTANGLE', name: 'B', absoluteBoundingBox: { x: 110, y: 60, width: 20, height: 20 }, fills: [] },
    ] },
  ] }] } };
  const doc = fromFigma(file);
  const a = doc.children[0].children[0];
  assert.equal(a.x, 100);
  assert.equal(a.fills[0].color, '#0000ff');
  assert.equal(a.children[0].x, 10);
  assert.equal(a.children[0].y, 10);
});

test('style and HTML export', () => {
  const doc = docFrom(PAGE);
  const header = resolve(doc, 'Header')[0];
  const css = computeStyle(header, doc.children[0]);
  assert.equal(css.display, 'flex');
  assert.equal(css.justifyContent, 'space-between');
  assert.equal(css.padding, '16px 32px 16px 32px');
  const btn = resolve(doc, 'Button')[0];
  const bcss = computeStyle(btn, header);
  assert.equal(bcss.width, 'fit-content');
  assert.ok(bcss.boxShadow.includes('8px'));
  const html = exportHtml(doc);
  assert.ok(html.includes('<header'));
  assert.ok(html.includes('<a class="le-'));
  assert.ok(html.includes('href="/signup"'));
  assert.ok(html.includes('Sign up'));
  assert.ok(html.includes('font-weight: 700'));
});
