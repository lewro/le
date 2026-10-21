#!/usr/bin/env node
// LE Designer CLI — edit design documents directly on disk (no server needed; open editors live-reload).
// Run `node le.js help` for usage. All commands read/write designs/<doc>.json.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStore, loadLibs, parseForDoc, importLibrary, componentsJson } from './server/api.js';
import { applyOps } from './src/core/ops.js';
import { parseDsl, serializeDsl, serializeTokens, setTokenContext } from './src/core/dsl.js';
import { createDocument, assignIds, resolve, findById, walk, describe, sizingH, sizingV } from './src/core/model.js';
import { fromFigma, toFigma, fetchFromFigma, isNativeDoc, libraryFromFigma } from './src/core/figma.js';
import { exportHtml } from './src/core/html.js';
import { buildIndex, describeComponents, lintStrict } from './src/core/components.js';

const here = path.dirname(fileURLToPath(import.meta.url));
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });

const HELP = `LE Designer CLI

  node le.js ls                                   list documents
  node le.js new <doc> [--title T] [--libs a,b] [< page.dsl]   create a document (optionally from DSL on stdin)
  node le.js title <doc> "Title"                  set the display title (Files view)
  node le.js arrange <doc> [--columns N] [--gap G] [--sort name]   tidy top-level frames into a snapped grid
  node le.js versions <doc> | restore <doc> <id> | snapshot <doc>   version history (kept on the server)
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
  node le.js import-html <file|url> --as <doc> [--state "Menu open" --click ".menu"|--script js] [--root sel]   HTML -> screen (needs Playwright)
  node le.js spec <doc> <selector>                developer spec of a node (values + tokens)
  node le.js serve [port]                         start the production server (needs npm run build)

Libraries (components, variants, tokens — stored in ./libraries/<name>.json):
  node le.js lib ls                               list libraries
  node le.js lib add <figma URL|key|https://…json|file.json> --as <name> [--token T]   import a library
  node le.js lib new <name> < library.dsl         create a library from DSL (set/component/token lines)
  node le.js lib rm <name>
  node le.js lib link <doc> <lib> [<lib>…]        link libraries to a document (unlink: --remove)
  node le.js lib dsl <lib> [selector]             read a library as DSL
  node le.js lib export <lib> --html gallery.html export every component/variant as HTML+CSS (base for prototypes)
  node le.js brief <doc> ["text"|-]               read/set the product brief stored with the file
  node le.js components <doc>                     list usable components + tokens (doc + linked libraries)
  node le.js lint <doc>                           strict check: everything must come from the libraries
  node le.js detach <doc> <selector>              turn an instance into a plain frame
  node le.js make-component <doc> <selector> [--name N] [--desc D]

Selectors: #id | Name/Path | Header/@TEXT | Card[1] | Header/* | /Page 1/Header   (see AGENTS.md)
Options: --dir <designsDir> (default ./designs, or LE_DESIGNS env); --who <name> (author; default LE_USER env or git user.name)
New top-level frames added to a page without x/y are placed automatically to the right of the existing ones, on the grid.
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
  const designsDir = opts.dir || process.env.LE_DESIGNS || path.join(here, 'designs');
  const store = createStore(designsDir);
  const libStore = createStore(opts.libdir || process.env.LE_LIBRARIES || path.join(path.dirname(designsDir), 'libraries'));
  const out = (s) => process.stdout.write(typeof s === 'string' ? s + '\n' : JSON.stringify(s, null, 2) + '\n');
  let libsCache = null;
  const load = () => { const d = store.load(docName); libsCache = loadLibs(libStore, d); setTokenContext(buildIndex(d, libsCache).tokens); return d; };
  const libs = () => libsCache || [];
  const ctx = () => ({ libs: libs() });
  const who = opts.who || process.env.LE_USER || (() => { try { return execSync('git config user.name', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return process.env.USER || null; } })();
  const save = (doc) => store.save(docName, doc, who);
  const propsFrom = (list) => list.join(' ');

  switch (cmd) {
    case undefined: case 'help': case '--help': case '-h': out(HELP); return;
    case 'ls': for (const d of store.list()) out(`${d.name}\t"${d.title}"\t${d.frames} frames\tby ${d.updatedBy || '?'}\t${d.updatedAt ? d.updatedAt.slice(0, 16).replace('T', ' ') : ''}`); return;
    case 'brief': {
      // node le.js brief <doc> ["text" | -]   read or set the product brief / spec stored with the file
      const doc = load();
      if (rest[0] === undefined) { out(doc.meta?.brief || '(no brief)'); return; }
      (doc.meta ||= { seq: 1 }).brief = rest[0] === '-' ? readStdin() : rest[0];
      save(doc); out('brief saved'); return;
    }
    case 'title': { const doc = load(); (doc.meta ||= { seq: 1 }).title = rest[0]; save(doc); out(`title: ${rest[0]}`); return; }
    case 'arrange': { const doc = load(); const r = applyOps(doc, { op: 'arrange', target: opts.page ? `#${opts.page}` : undefined, columns: opts.columns ? parseInt(opts.columns, 10) : undefined, gap: opts.gap ? parseInt(opts.gap, 10) : undefined, sort: opts.sort }, doc, ctx()); save(doc); out(`arranged ${r.changed.length} frames`); return; }
    case 'versions': { for (const v of store.versions(docName)) out(`${v.id}\t${v.at.slice(0, 19).replace('T', ' ')}\t${v.by || '?'}\t${(v.size / 1024).toFixed(1)}kB`); return; }
    case 'restore': { const v = store.loadVersion(docName, rest[0]); save(v); out(`restored ${rest[0]}`); return; }
    case 'snapshot': { out(`snapshot ${store.snapshot(docName, who, true)}`); return; }
    case 'new': {
      if (store.exists(docName)) throw new Error(`"${docName}" already exists`);
      const doc = createDocument(docName);
      if (opts.title) doc.meta.title = String(opts.title);
      if (opts.libs) doc.libraries = String(opts.libs).split(',').filter(Boolean);
      const text = process.stdin.isTTY ? '' : readStdin();
      if (text.trim()) { doc.children[0].children.push(...parseForDoc(doc, loadLibs(libStore, doc), text)); }
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
      if (!sel && doc.libraries?.length) out(`// libraries: ${doc.libraries.join(', ')}  (node le.js components ${docName})`);
      if (!sel && doc.tokens) { const t = serializeTokens(doc.tokens); if (t) out(t); }
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
    case 'set': { const doc = load(); const r = applyOps(doc, { op: 'set', target: rest[0], dsl: propsFrom(rest.slice(1)), all: opts.all !== false }, doc, ctx()); save(doc); out(`updated ${r.changed.length} node(s)`); return; }
    case 'text': { const doc = load(); const r = applyOps(doc, { op: 'text', target: rest[0], characters: rest[1] ?? readStdin() }, doc, ctx()); save(doc); out(`updated ${r.changed.length} node(s)`); return; }
    case 'add': {
      const doc = load();
      const dsl = rest[1] === '-' || rest[1] === undefined ? readStdin() : rest[1];
      const r = applyOps(doc, { op: 'add', parent: rest[0], dsl, index: opts.index !== undefined ? parseInt(opts.index, 10) : undefined }, doc, ctx());
      save(doc);
      out(serializeDsl(r.created.map((id) => resolve(doc, '#' + id)[0]).filter((n, i, a) => n && !a.slice(0, i).some((x) => findById(x, n.id)))));
      return;
    }
    case 'replace': { const doc = load(); const dsl = rest[1] === '-' || rest[1] === undefined ? readStdin() : rest[1]; applyOps(doc, { op: 'replace', target: rest[0], dsl }, doc, ctx()); save(doc); out('replaced'); return; }
    case 'rm': { const doc = load(); const r = applyOps(doc, { op: 'remove', target: rest[0], all: !!opts.all }, doc, ctx()); save(doc); out(`removed ${r.changed.length} node(s)`); return; }
    case 'mv': { const doc = load(); applyOps(doc, { op: 'move', target: rest[0], parent: rest[1], index: rest[2] !== undefined ? parseInt(rest[2], 10) : undefined }, doc, ctx()); save(doc); out('moved'); return; }
    case 'dup': { const doc = load(); const r = applyOps(doc, { op: 'duplicate', target: rest[0], dx: 0, dy: 0 }, doc, ctx()); save(doc); out(`created #${r.created[0]}`); return; }
    case 'wrap': { const doc = load(); const r = applyOps(doc, { op: 'wrap', target: rest[0], dsl: rest[1], all: !!opts.all }, doc, ctx()); save(doc); out(`wrapped in #${r.created[0]}`); return; }
    case 'detach': { const doc = load(); const r = applyOps(doc, { op: 'detach', target: rest[0] }, doc, ctx()); save(doc); out(`detached into #${r.created[0]}`); return; }
    case 'make-component': { const doc = load(); const r = applyOps(doc, { op: 'component', target: rest[0], name: opts.name, description: opts.desc }, doc, ctx()); save(doc); out(`component #${r.changed[0]}`); return; }
    case 'ops': {
      const doc = load();
      const text = rest[0] && rest[0] !== '-' ? fs.readFileSync(rest[0], 'utf8') : readStdin();
      const r = applyOps(doc, JSON.parse(text), doc, ctx());
      save(doc);
      out(r);
      return;
    }
    case 'page': {
      const doc = load();
      const page = doc.children[parseInt(opts.page || '0', 10)];
      page.children = parseForDoc(doc, libs(), readStdin());
      assignIds(doc);
      save(doc);
      out(serializeDsl(page));
      return;
    }
    case 'components': {
      const doc = load();
      const idx = buildIndex(doc, libs());
      if (opts.json) out(componentsJson(idx));
      else { const t = serializeTokens(idx.tokens); if (t) out(t); out(describeComponents(idx).join('\n') || '(no components — link a library: node le.js lib link <doc> <lib>)'); }
      return;
    }
    case 'lint': {
      const doc = load();
      const problems = lintStrict(doc, libs());
      if (!problems.length) { out('OK — every node comes from the linked libraries'); return; }
      for (const p of problems) out(`#${p.id}\t${p.name}\t${p.reason}`);
      process.exitCode = 2;
      return;
    }
    case 'lib': {
      const sub = docName;
      const arg = rest[0];
      switch (sub) {
        case 'ls': for (const l of libStore.list()) { const d = libStore.load(l.name); out(`${l.name}\t${buildIndex(null, [d]).list.length} components${d.source ? '\t' + d.source : ''}`); } return;
        case 'add': {
          let doc;
          if (arg && fs.existsSync(arg)) doc = await importLibrary({ json: JSON.parse(fs.readFileSync(arg, 'utf8')), name: opts.as });
          else doc = await importLibrary({ source: arg, token: opts.token || process.env.FIGMA_TOKEN, name: opts.as });
          const name = opts.as || String(doc.name || 'library').toLowerCase().replace(/[^a-z0-9]+/g, '-');
          doc.name = name;
          libStore.save(name, doc);
          const idx = buildIndex(null, [doc]);
          out(`library "${name}": ${idx.list.length} components, ${Object.keys(idx.tokens.colors).length} colors, ${Object.keys(idx.tokens.textStyles).length} text styles`);
          out(describeComponents(idx).join('\n'));
          return;
        }
        case 'new': {
          if (libStore.exists(arg)) throw new Error(`library "${arg}" exists`);
          const d = createDocument(arg); d.kind = 'library';
          d.children[0].children.push(...parseForDoc(d, [], readStdin()));
          assignIds(d);
          libStore.save(arg, d);
          out(describeComponents(buildIndex(null, [d])).join('\n'));
          return;
        }
        case 'rm': libStore.remove(arg); out('removed'); return;
        case 'link': {
          const d = store.load(arg);
          const names = rest.slice(1);
          if (!opts.remove) for (const n of names) if (!libStore.exists(n)) throw new Error(`library "${n}" not found`);
          d.libraries = opts.remove ? (d.libraries || []).filter((l) => !names.includes(l)) : [...new Set([...(d.libraries || []), ...names])];
          store.save(arg, d);
          out(`libraries: ${d.libraries.join(', ') || '(none)'}`);
          return;
        }
        case 'dsl': {
          const d = libStore.load(arg);
          const nodes = rest[1] ? resolve(d, rest[1]) : [d];
          setTokenContext(buildIndex(null, [d]).tokens);
          if (!rest[1]) { const t = serializeTokens(d.tokens); if (t) out(t); }
          out(serializeDsl(nodes, { ids: opts.ids !== false, depth: opts.depth ? parseInt(opts.depth, 10) : Infinity }, rest[1] ? findById(d, nodes[0].id)?.parent : null));
          return;
        }
        case 'components': { const d = libStore.load(arg); out(describeComponents(buildIndex(null, [d])).join('\n')); return; }
        case 'export': {
          // node le.js lib export <lib> --html gallery.html   component gallery (every variant) as HTML+CSS for prototypes
          const d = libStore.load(arg);
          const idx = buildIndex(null, [d]);
          const g = createDocument(arg + '-gallery'); g.libraries = [arg];
          setTokenContext(idx.tokens);
          const lines = [`frame Gallery col w=1200 p=40 gap=40 bg=$Surface/0`];
          lines.push(`  text "${arg} — components" size=28 weight=800`);
          for (const e of idx.list) {
            lines.push(`  frame ${JSON.stringify(e.name)} col gap=12 w=fill`);
            lines.push(`    text ${JSON.stringify(e.name)} size=16 weight=700`);
            if (e.description) lines.push(`    text ${JSON.stringify(e.description)} size=13 color=#64748b`);
            lines.push(`    frame Variants row wrap gap=16 rowgap=16 w=fill items=start`);
            const variants = e.type === 'COMPONENT_SET' ? e.node.children.map((c) => c.name) : [null];
            for (const v of variants) lines.push(`      instance ${JSON.stringify(e.name)}${v ? ' ' + v.split(',').map((p) => p.trim()).join(' ') : ''}`);
          }
          const roots = parseDsl(lines.join('\n'));
          g.children[0].children.push(...roots); assignIds(g);
          const html = exportHtml(g, { libs: [d] });
          const file = opts.html || `${arg}-gallery.html`;
          fs.writeFileSync(file, html);
          out(`wrote ${file} (${idx.list.length} components; elements carry data-component / data-variant attributes)`);
          return;
        }
        default: throw new Error('lib: ls | add | new | rm | link | dsl | components | export');
      }
    }
    case 'export': {
      const doc = load();
      if (opts.html) { fs.writeFileSync(opts.html, exportHtml(doc, { page: parseInt(opts.page || '0', 10), libs: libs() })); out(`wrote ${opts.html}`); }
      if (opts.figma) { fs.writeFileSync(opts.figma, JSON.stringify(toFigma(doc, libs()), null, 1)); out(`wrote ${opts.figma}`); }
      if (opts.json) { fs.writeFileSync(opts.json, JSON.stringify(doc, null, 1)); out(`wrote ${opts.json}`); }
      if (opts.dsl) { fs.writeFileSync(opts.dsl, serializeTokens(doc.tokens) + '\n' + serializeDsl(doc, { ids: false })); out(`wrote ${opts.dsl}`); }
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
    case 'import-html': {
      // node le.js import-html <file.html|url> --as <doc> [--name "Screen"] [--state "Dropdown open" --script "..."] [--append] [--width 1440]
      let chromium;
      try { ({ chromium } = await import('playwright')); }
      catch {
        try { const root = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); ({ chromium } = await import(path.join(root, 'playwright/index.mjs'))); }
        catch { throw new Error('import-html needs Playwright: npm i -D playwright (or use Prototype in the app)'); }
      }
      const source = docName;
      const target = opts.as || path.basename(source).replace(/\.html?$/i, '');
      const captureSrc = fs.readFileSync(path.join(here, 'src/core/capture.js'), 'utf8').replace(/export function/g, 'function');
      const browser = await chromium.launch();
      const pg = await browser.newPage({ viewport: { width: parseInt(opts.width || '1440', 10), height: parseInt(opts.height || '900', 10) } });
      await pg.goto(/^https?:/.test(source) ? source : 'file://' + path.resolve(source));
      await pg.waitForTimeout(parseInt(opts.wait || '300', 10));
      if (opts.script) await pg.evaluate(opts.script);
      if (opts.click) { await pg.click(opts.click); await pg.waitForTimeout(200); }
      const node = await pg.evaluate(`(() => { ${captureSrc}; return captureDocument(document, { name: ${JSON.stringify(opts.state || opts.name || '')}, root: ${JSON.stringify(opts.root || '')} }); })()`);
      await browser.close();
      let doc = store.exists(target) ? store.load(target) : createDocument(target);
      if (!store.exists(target) && opts.libs) doc.libraries = String(opts.libs).split(',').filter(Boolean);
      const r = applyOps(doc, { op: 'add', parent: '#' + doc.children[0].id, node }, doc, { libs: loadLibs(libStore, doc) });
      store.save(target, doc, who);
      out(`captured "${node.name}" into ${target} as #${r.created[0]} (${r.created.length} nodes)`);
      return;
    }
    case 'spec': {
      const { specText } = await import('./src/core/devspec.js');
      const { expandInstance, buildIndex: bi } = await import('./src/core/components.js');
      const doc = load();
      const nodes = resolve(doc, rest[0]);
      if (!nodes.length) throw new Error('not found');
      const idx = bi(doc, libs());
      for (const n of nodes) { const f = findById(doc, n.id); out(`# ${n.name} (#${n.id})`); out(specText(n, f.parent, n.type === 'INSTANCE' ? expandInstance(idx, n) : null)); }
      return;
    }
    case 'serve': { process.env.PORT = docName || process.env.PORT || '4000'; await import('./server.js'); return; }
    default: throw new Error(`Unknown command "${cmd}". Run: node le.js help`);
  }
}

main().catch((e) => { console.error('error:', e.message); process.exit(1); });
