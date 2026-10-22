#!/usr/bin/env node
// Import popular UI libraries as LE libraries by rendering their real components in a headless browser.
//   node scripts/import-popular-libs.mjs [mui antd bootstrap] [--vendor <dir>]
// Needs Playwright (global or local) and network access to the npm registry (npm pack) the first time.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStore } from '../server/api.js';
import { buildIndex, describeComponents } from '../src/core/components.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const args = process.argv.slice(2);
const vendorIdx = args.indexOf('--vendor');
const vendor = vendorIdx >= 0 ? path.resolve(args[vendorIdx + 1]) : path.join(os.tmpdir(), 'le-designer-vendor');
const wanted = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--vendor');
const LIBS = {
  mui: { title: 'MUI (Material Design)', packages: ['react@18.3.1', 'react-dom@18.3.1', '@mui/material@5.16.7'], files: { 'react.production.min.js': 'react/package/umd/react.production.min.js', 'react-dom.production.min.js': 'react-dom/package/umd/react-dom.production.min.js', 'material-ui.production.min.js': 'mui-material/package/umd/material-ui.production.min.js' } },
  antd: { title: 'Ant Design', packages: ['react@18.3.1', 'react-dom@18.3.1', 'dayjs@1.11.13', 'antd@5.21.6'], files: { 'react.production.min.js': 'react/package/umd/react.production.min.js', 'react-dom.production.min.js': 'react-dom/package/umd/react-dom.production.min.js', 'dayjs.min.js': 'dayjs/package/dayjs.min.js', 'antd.min.js': 'antd/package/dist/antd.min.js' } },
  bootstrap: { title: 'Bootstrap 5', packages: ['bootstrap@5.3.3'], files: { 'bootstrap.min.css': 'bootstrap/package/dist/css/bootstrap.min.css' } },
};
const names = wanted.length ? wanted : Object.keys(LIBS);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  const g = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  return import(path.join(g, 'playwright/index.mjs'));
}

function ensureVendor(lib) {
  fs.mkdirSync(vendor, { recursive: true });
  for (const [file, rel] of Object.entries(lib.files)) {
    const target = path.join(vendor, file);
    if (fs.existsSync(target)) continue;
    const pkgDir = rel.split('/')[0];
    const extracted = path.join(vendor, 'x-' + pkgDir);
    if (!fs.existsSync(extracted)) {
      const spec = lib.packages.find((p) => p.replace(/^@/, '').replace('/', '-').startsWith(pkgDir + '@'));
      console.log(`  npm pack ${spec}`);
      const out = execSync(`npm pack ${spec} --silent`, { cwd: vendor }).toString().trim().split('\n').pop();
      fs.mkdirSync(extracted, { recursive: true });
      execSync(`tar -xzf ${JSON.stringify(path.join(vendor, out))} -C ${JSON.stringify(extracted)}`);
    }
    fs.copyFileSync(path.join(vendor, 'x-' + rel), target);
  }
}

const { chromium } = await loadPlaywright();
const libStore = createStore(path.join(root, 'libraries'));
const captureSrc = fs.readFileSync(path.join(root, 'src/core/capture.js'), 'utf8').replace(/export function/g, 'function');
const browser = await chromium.launch();
for (const name of names) {
  const lib = LIBS[name];
  if (!lib) { console.error(`unknown library ${name} (${Object.keys(LIBS).join(', ')})`); continue; }
  console.log(`→ ${lib.title}`);
  ensureVendor(lib);
  const html = fs.readFileSync(path.join(root, 'examples/galleries', name + '.html'), 'utf8').replace(/VENDOR\//g, 'file://' + vendor + '/');
  const tmp = path.join(vendor, name + '.gallery.html');
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  page.on('pageerror', (e) => console.warn('  page error:', e.message));
  await page.goto('file://' + tmp);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const doc = await page.evaluate(`(() => { ${captureSrc}; return captureLibrary(document, { name: ${JSON.stringify(lib.title)} }); })()`);
  await page.close();
  doc.name = name;
  doc.source = `examples/galleries/${name}.html`;
  doc.meta.title = lib.title;
  libStore.save(name, doc, 'import-popular-libs');
  const idx = buildIndex(null, [doc]);
  console.log(`  saved libraries/${name}.json: ${idx.list.length} components, ${Object.keys(idx.tokens.colors).length} colors, ${Object.keys(idx.tokens.textStyles).length} text styles, ${Object.keys(idx.tokens.effects).length} effects`);
  console.log('  ' + describeComponents(idx).slice(0, 6).join('\n  ') + (idx.list.length > 6 ? `\n  … ${idx.list.length - 6} more` : ''));
}
await browser.close();
