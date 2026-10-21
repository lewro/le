# LE Designer

A lightweight, Figma-like design editor built for working **with an AI agent**: a layers panel on the left, a
canvas in the middle, an inspector on the right, documents stored as Figma-compatible JSON, and a compact text
DSL + CLI + HTTP API so an agent can build or change a page in seconds without touching the UI.

## Features

- **Layers**: pages, nested frames, drag to reorder / re-parent, rename, hide, lock
- **Canvas**: zoom/pan, Figma-style selection (click selects the top frame, click again to drill down, ⌘-click for the
  deepest layer), move, resize handles, drag to reorder inside auto layout, inline text editing, frame / rectangle /
  ellipse / text / line tools, marquee selection, undo/redo, copy/paste, duplicate, group
- **Inspector**: semantic tag + class + attributes, position & size (fixed / hug / fill), auto layout (direction, wrap,
  gap, padding, alignment), opacity, corner radii, fills (solid, gradient, image), strokes, shadows & blur, full
  typography
- **Libraries**: import a design library from a Figma file (URL or key), a JSON URL, a file, or write one in the DSL;
  link it to a document and build pages from its components (sets with variants, text overrides, color/text/effect
  tokens) in the Assets panel or the DSL. `lint` enforces "library elements only". A sample library (`le-ui`) and a
  landing page built strictly from it are included.
- **Code tab**: the selection (or page) as editable DSL, the computed CSS, or raw JSON — apply with ⌘↵
- **Figma compatible**: import a Figma file via the REST API (token + file key) or a JSON file; export the Figma REST
  shape; a bundled Figma plugin pushes documents into Figma and pulls selections back out
- **HTML export**: semantic HTML + CSS (auto layout → flexbox)
- **Agent optimized**: everything is reachable from `node le.js …`, `POST /api/docs/:name/ops`, or
  `window.__le` in the browser. Open editors live-reload when a file changes on disk. See [AGENTS.md](AGENTS.md).
- **Built for big files**: copy-on-write edits, memoized rendering, direct-DOM pan/zoom and viewport culling keep a
  60-page canvas editing at ~30 ms per change and panning at 60 fps (`node scripts/stress.mjs` generates one).

## Run

```bash
cd designer
npm install
npm run dev            # http://localhost:5173 (editor + API, hot reload)
# or
npm run build && npm start   # http://localhost:4000, serves dist/ + API
npm test               # core unit tests
```

Documents live in `designer/designs/*.json`, libraries in `designer/libraries/*.json`. Included samples: `landing`
(hand-built), `le-ui` (library) and `landing-ui` (built only from `le-ui`). Regenerate with
`node le.js new landing < examples/landing.dsl`, `node le.js lib new le-ui < examples/le-ui.dsl`,
`node le.js new landing-ui --libs le-ui < examples/landing-ui.dsl`.

## Agent quick start

```bash
node le.js dsl landing                               # read the page (every line carries its #id)
node le.js set landing Hero/Title size=64            # tweak
node le.js add landing Header/Nav 'text "Blog" size=15 tag=a href=/blog'
node le.js new pricing < pricing.dsl                 # build a page from scratch
node le.js export landing --html landing.html        # ship it
node le.js lib add <figma url> --as acme --token …   # import a library, then:
node le.js components landing-ui                     # see components/variants/tokens
node le.js lint landing-ui                           # enforce "library elements only"
```

The DSL looks like this:

```
frame Header row w=fill h=72 p=0,80 items=center justify=between bg=#fff tag=header
  text "LocalExperts" size=22 weight=800 color=#0f172a
  frame Nav row gap=28 tag=nav
    text "Find experts" size=15 color=#334155 tag=a href=/search
  frame SignupButton row p=10,18 r=8 bg=#2563eb tag=a href=/register
    text "Join as expert" size=14 weight=600 color=#fff
```

## Libraries

- Import: Libraries dialog or `node le.js lib add …` with a Figma file URL/key (needs a personal access token and a file
  the token can open: your libraries, team libraries, or a community file after "Open in Figma" duplicated it into your
  drafts), a URL to a JSON export, a local JSON file, or DSL (`examples/le-ui.dsl` shows the format).
- Figma files keep their component sets, variants, component keys, and the colors/text styles/effects that are applied in
  the file (as tokens). Instances whose component is in the same file keep only their overrides.
- Link libraries per document; the Assets panel lists components with live thumbnails. Click to insert; the inspector
  switches variants, edits text overrides, swaps or detaches.

## Figma

- **Import**: Import → paste a token (Figma → Settings → Security → personal access tokens) and the file key or URL;
  or `node le.js import-figma <key> --as <name>`; or upload the JSON of `GET /v1/files/:key`.
- **Export to Figma**: install `figma-plugin/` in Figma (Plugins → Development → *Import plugin from manifest…*),
  run it, paste the JSON from Export → *Native JSON for the Figma plugin*. The plugin recreates frames, auto layout,
  text, fills, strokes, effects, stores the HTML tag/class as plugin data, and rebuilds instances as real Figma
  instances when the component exists (by library key or name), otherwise as frames. *Export selection* in the plugin
  produces JSON that can be imported back here.
- **Figma REST JSON**: Export → Figma REST JSON gives the `/v1/files` shape for other tooling.

## Limitations

- Vector paths, boolean operations, component properties/variants and prototyping are out of scope; imported
  vectors are kept as placeholders.
- Groups are modelled as non-clipping, unfilled frames.
- Image fills from the Figma API are references (no URL); set `bg=url(...)` for images you want rendered.
- The Figma plugin has been written against the Plugin API docs but not run inside Figma in this environment.
