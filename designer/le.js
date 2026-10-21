#!/usr/bin/env node
// LE Designer CLI — edit design documents directly on disk (no server needed; open editors live-reload).
// Run `node le.js help` for usage. All commands read/write designs/<doc>.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './server/api.js';
import { applyOps } from './src/core/ops.js';
import { parseDsl, serializeDsl } from './src/core/dsl.js';
import { createDocument, assignIds, resolve, findById, walk, describe, sizingH, sizingV } from './src/core/model.js';
import { fromFigma, toFigma, fetchFromFigma } from './src/core/figma.js';
import { exportHtml } from './src/core/html.js';

const here = path.dirname(fileURLToPath(import.meta.url));
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });

const HELP = `LE Designer CLI

  node le.js ls                                   list documents
  node le.js new <doc> [< page.dsl]               create a document (optionally from DSL on stdin)
  node le.js dsl <doc> [selector] [--depth N] [--no-ids]   print a document/subtree as DSL (the best way to read a page)
  node le.js outline <doc> [selector]             compact tree: id, type, name, size (no styling)
  node le.js get <doc> <selector>                 print node JSON
  node le.js set <doc> <selector> key=value ...   set properties (DSL shorthand, e.g. p=16 gap=8 bg=#fff w=fill)
  node le.js text <doc> <selector> "new text"     change text content
  node le.js add <doc> <parent> "<dsl line>" [--index N]   add node(s); multi-line DSL via stdin: add <doc> <parent> -
  node le.js replace <doc> <selector> [< sub.dsl] replace a subtree with DSL (stdin or next argument)
  node le.js rm <doc> <selector> [--all]          remove node(s)
  node le.js mv <doc> <selector> <parent> [index] move a node
  node le.js dup <doc> <selector>                 duplicate a node
  node le.js wrap <doc> <selector> "<dsl line>"   wrap node(s) in a new frame
  node le.js ops <doc> [ops.json | -]             apply a JSON array of operations (see AGENTS.md)
  node le.js page <doc> [--page N] [< page.dsl]   replace a whole page's content with DSL from stdin
  node le.js export <doc> --html out.html | --figma out.json | --json out.json | --dsl out.dsl
  node le.js import <file.json> --as <doc>        import native or Figma REST JSON
  node le.js import-figma <fileKey> --as <doc> [--token T] [--nodes 1:2,3:4]   fetch via Figma API (or FIGMA_TOKEN env)
  node le.js serve [port]                         start the production server (needs npm run build)

Selectors: #id | Name/Path | Header/@TEXT | Card[1] | Header/* | /Page 1/Header   (see AGENTS.md)
Options: --dir <designsDir> (default ./designs, or LE_DESIGNS env)
`;

function parseArgs(argv) {
  const args = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (k.startsWith('no-')) opts[k.slice(3)] = false;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts[k] = argv[++i];
      else opts[k] = true;
    } else args.push(a);
  }
  return { args, opts };
}

function readStdin() { return fs.readFileSync(0, 'utf8'); }

async function main() {
  const { args, opts } = parseArgs(process.argv.slice(2));
  const [cmd, docName, ...rest] = args;
  const store = createStore(opts.dir || process.env.LE_DESIGNS || path.join(here, 'designs'));
  const out = (s) => process.stdout.write(typeof s === 'string' ? s + '\n' : JSON.stringify(s, null, 2) + '\n');
  const load = () => store.load(docName);
  const save = (doc) => store.save(docName, doc);
  const propsFrom = (list) => list.join(' ');

  switch (cmd) {
    case undefined: case 'help': case '--help': case '-h': out(HELP); return;
    case 'ls': for (const d of store.list()) out(`${d.name}\t${(d.size / 1024).toFixed(1)}kB`); return;
    case 'new': {
      if (store.exists(docName)) throw new Error(`"${docName}" already exists`);
      const doc = createDocument(docName);
      const text = process.stdin.isTTY ? '' : readStdin();
      if (text.trim()) { doc.children[0].children.push(...parseDsl(text)); }
      assignIds(doc);
      save(doc);
      out(serializeDsl(doc));
      return;
    }
    case 'dsl': {
      const doc = load();
      const sel = rest[0];
      const nodes = sel ? resolve(doc, sel) : [doc];
      if (!nodes.length) throw new Error(`Selector not found: ${sel}`);
      const parent = sel ? findById(doc, nodes[0].id)?.parent : null;
      out(serializeDsl(nodes, { ids: opts.ids !== false, depth: opts.depth ? parseInt(opts.depth, 10) : Infinity }, parent));
      return;
    }
    case 'outline': {
      const doc = load();
      const roots = rest[0] ? resolve(doc, rest[0]) : [doc];
      for (const r of roots) walk(r, (n, p, i, depth) => {
        if (n.type === 'DOCUMENT') return;
        const dim = (s, v) => (s === 'FIXED' ? Math.round(v || 0) : s.toLowerCase());
        const size = n.type === 'CANVAS' ? '' : ` ${dim(sizingH(n), n.width)}x${dim(sizingV(n), n.height)}${n.layoutMode === 'HORIZONTAL' ? ' row' : n.layoutMode === 'VERTICAL' ? ' col' : ''}`;
        out(`${'  '.repeat(depth - (r.type === 'DOCUMENT' ? 1 : 0))}#${n.id} ${describe(n)}${size}`);
      });
      return;
    }
    case 'get': { const doc = load(); const n = resolve(doc, rest[0]); if (!n.length) throw new Error('not found'); out(n.length === 1 ? n[0] : n); return; }
    case 'set': { const doc = load(); const r = applyOps(doc, { op: 'set', target: rest[0], dsl: propsFrom(rest.slice(1)), all: opts.all !== false }); save(doc); out(`updated ${r.changed.length} node(s)`); return; }
    case 'text': { const doc = load(); const r = applyOps(doc, { op: 'text', target: rest[0], characters: rest[1] ?? readStdin() }); save(doc); out(`updated ${r.changed.length} node(s)`); return; }
    case 'add': {
      const doc = load();
      const dsl = rest[1] === '-' || rest[1] === undefined ? readStdin() : rest[1];
      const r = applyOps(doc, { op: 'add', parent: rest[0], dsl, index: opts.index !== undefined ? parseInt(opts.index, 10) : undefined });
      save(doc);
      out(serializeDsl(r.created.map((id) => resolve(doc, '#' + id)[0]).filter((n, i, a) => n && !a.slice(0, i).some((x) => findById(x, n.id)))));
      return;
    }
    case 'replace': { const doc = load(); const dsl = rest[1] === '-' || rest[1] === undefined ? readStdin() : rest[1]; applyOps(doc, { op: 'replace', target: rest[0], dsl }); save(doc); out('replaced'); return; }
    case 'rm': { const doc = load(); const r = applyOps(doc, { op: 'remove', target: rest[0], all: !!opts.all }); save(doc); out(`removed ${r.changed.length} node(s)`); return; }
    case 'mv': { const doc = load(); applyOps(doc, { op: 'move', target: rest[0], parent: rest[1], index: rest[2] !== undefined ? parseInt(rest[2], 10) : undefined }); save(doc); out('moved'); return; }
    case 'dup': { const doc = load(); const r = applyOps(doc, { op: 'duplicate', target: rest[0], dx: 0, dy: 0 }); save(doc); out(`created #${r.created[0]}`); return; }
    case 'wrap': { const doc = load(); const r = applyOps(doc, { op: 'wrap', target: rest[0], dsl: rest[1], all: !!opts.all }); save(doc); out(`wrapped in #${r.created[0]}`); return; }
    case 'ops': {
      const doc = load();
      const text = rest[0] && rest[0] !== '-' ? fs.readFileSync(rest[0], 'utf8') : readStdin();
      const r = applyOps(doc, JSON.parse(text));
      save(doc);
      out(r);
      return;
    }
    case 'page': {
      const doc = load();
      const page = doc.children[parseInt(opts.page || '0', 10)];
      page.children = parseDsl(readStdin());
      assignIds(doc);
      save(doc);
      out(serializeDsl(page));
      return;
    }
    case 'export': {
      const doc = load();
      if (opts.html) { fs.writeFileSync(opts.html, exportHtml(doc, { page: parseInt(opts.page || '0', 10) })); out(`wrote ${opts.html}`); }
      if (opts.figma) { fs.writeFileSync(opts.figma, JSON.stringify(toFigma(doc), null, 1)); out(`wrote ${opts.figma}`); }
      if (opts.json) { fs.writeFileSync(opts.json, JSON.stringify(doc, null, 1)); out(`wrote ${opts.json}`); }
      if (opts.dsl) { fs.writeFileSync(opts.dsl, serializeDsl(doc, { ids: false })); out(`wrote ${opts.dsl}`); }
      if (!opts.html && !opts.figma && !opts.json && !opts.dsl) out(HELP);
      return;
    }
    case 'import': {
      const json = JSON.parse(fs.readFileSync(docName, 'utf8'));
      const name = opts.as || path.basename(docName, '.json');
      const doc = fromFigma(json, name);
      store.save(name, doc);
      out(`imported as "${name}"`);
      out(serializeDsl(doc, { depth: 3 }));
      return;
    }
    case 'import-figma': {
      const doc = await fetchFromFigma({ token: opts.token || process.env.FIGMA_TOKEN, fileKey: docName, nodeIds: opts.nodes ? String(opts.nodes).split(',') : undefined, name: opts.as });
      const name = opts.as || doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      store.save(name, doc);
      out(`imported as "${name}"`);
      out(serializeDsl(doc, { depth: 3 }));
      return;
    }
    case 'serve': { process.env.PORT = docName || process.env.PORT || '4000'; await import('./server.js'); return; }
    default: throw new Error(`Unknown command "${cmd}". Run: node le.js help`);
  }
}

main().catch((e) => { console.error('error:', e.message); process.exit(1); });
