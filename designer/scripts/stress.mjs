#!/usr/bin/env node
// Generate designs/stress.json: N copies of examples/landing-ui.dsl laid out in a grid (perf testing).
//   node scripts/stress.mjs [pages=60]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDsl, setTokenContext } from '../src/core/dsl.js';
import { createDocument, assignIds, clone } from '../src/core/model.js';
import { buildIndex } from '../src/core/components.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pages = parseInt(process.argv[2] || '60', 10);
const lib = JSON.parse(fs.readFileSync(path.join(here, '../libraries/le-ui.json'), 'utf8'));
setTokenContext(buildIndex(null, [lib]).tokens);
const roots = parseDsl(fs.readFileSync(path.join(here, '../examples/landing-ui.dsl'), 'utf8'));
const doc = createDocument('stress');
doc.libraries = ['le-ui'];
for (let i = 0; i < pages; i++) {
  const p = clone(roots[0]);
  p.name = `Page ${i + 1}`; p.x = (i % 10) * 1600; p.y = Math.floor(i / 10) * 2400;
  doc.children[0].children.push(p);
}
assignIds(doc);
fs.writeFileSync(path.join(here, '../designs/stress.json'), JSON.stringify(doc));
console.log(`wrote designs/stress.json with ${pages} pages`);
