#!/usr/bin/env node
// Copy sample designs and libraries into dist/seed so a static build (no API server) can seed itself.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'dist', 'seed');
fs.mkdirSync(out, { recursive: true });
const manifest = { docs: [], libs: [], open: 'landing-ui' };
for (const [dir, key] of [['designs', 'docs'], ['libraries', 'libs']]) {
  for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith('.json') && x !== 'stress.json')) {
    fs.copyFileSync(path.join(root, dir, f), path.join(out, `${key}-${f}`));
    manifest[key].push(f.slice(0, -5));
  }
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
console.log('seeded', manifest);
