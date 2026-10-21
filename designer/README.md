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
- **Code tab**: the selection (or page) as editable DSL, the computed CSS, or raw JSON — apply with ⌘↵
- **Figma compatible**: import a Figma file via the REST API (token + file key) or a JSON file; export the Figma REST
  shape; a bundled Figma plugin pushes documents into Figma and pulls selections back out
- **HTML export**: semantic HTML + CSS (auto layout → flexbox)
- **Agent optimized**: everything is reachable from `node le.js …`, `POST /api/docs/:name/ops`, or
  `window.__le` in the browser. Open editors live-reload when a file changes on disk. See [AGENTS.md](AGENTS.md).

## Run

```bash
cd designer
npm install
npm run dev            # http://localhost:5173 (editor + API, hot reload)
# or
npm run build && npm start   # http://localhost:4000, serves dist/ + API
npm test               # core unit tests
```

Documents live in `designer/designs/*.json`. A sample landing page is included (`landing`); regenerate it with
`node le.js new landing < examples/landing.dsl`.

## Agent quick start

```bash
node le.js dsl landing                               # read the page (every line carries its #id)
node le.js set landing Hero/Title size=64            # tweak
node le.js add landing Header/Nav 'text "Blog" size=15 tag=a href=/blog'
node le.js new pricing < pricing.dsl                 # build a page from scratch
node le.js export landing --html landing.html        # ship it
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

## Figma

- **Import**: Import → paste a token (Figma → Settings → Security → personal access tokens) and the file key or URL;
  or `node le.js import-figma <key> --as <name>`; or upload the JSON of `GET /v1/files/:key`.
- **Export to Figma**: install `figma-plugin/` in Figma (Plugins → Development → *Import plugin from manifest…*),
  run it, paste the native JSON (Export → Native JSON). The plugin recreates frames, auto layout, text, fills,
  strokes, effects, and stores the HTML tag/class as plugin data. *Export selection* in the plugin produces JSON
  that can be imported back here.
- **Figma REST JSON**: Export → Figma REST JSON gives the `/v1/files` shape for other tooling.

## Limitations

- Vector paths, boolean operations, component properties/variants and prototyping are out of scope; imported
  vectors are kept as placeholders.
- Groups are modelled as non-clipping, unfilled frames.
- Image fills from the Figma API are references (no URL); set `bg=url(...)` for images you want rendered.
- The Figma plugin has been written against the Plugin API docs but not run inside Figma in this environment.
