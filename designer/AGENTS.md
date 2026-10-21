# LE Designer — agent guide

This is a Figma-like design editor whose documents are plain JSON files you can edit from the shell.
**You do not need the browser to build or change a page.** Write DSL, run the CLI, done; any open editor
live-reloads from disk.

```
designer/
  le.js            CLI (node le.js help)
  designs/*.json   documents (one file per document; Figma-compatible node tree)
  libraries/*.json design libraries: components, variants, colors, text styles (le-ui is included)
  examples/*.dsl   example pages and the le-ui library in the DSL
  src/core/        pure JS: model, dsl, ops, style, figma, html  (usable from Node or the browser)
  server/api.js    HTTP API + SSE live reload   (vite dev server and server.js both mount it)
  figma-plugin/    Figma plugin to push/pull documents into/out of Figma
```

Run the editor: `npm run dev` (http://localhost:5173, API included) or `npm run build && npm start` (port 4000).
Open a document with `?doc=<name>`.

## Fastest workflows

**Build a new page**

```bash
cat > /tmp/page.dsl <<'EOF2'
frame Landing col w=1440 bg=#ffffff tag=main
  frame Header row w=fill h=72 p=0,80 items=center justify=between tag=header
    text "Brand" size=22 weight=800 color=#0f172a
    frame CTA row p=10,18 r=8 bg=#2563eb tag=a href=/signup
      text "Sign up" size=14 weight=600 color=#ffffff
  frame Hero col w=fill p=96,80 gap=24 items=center bg=#f8fafc tag=section
    text Title "Headline" w=820 size=60 weight=800 lh=68 align=center tag=h1
EOF2
node le.js new landing < /tmp/page.dsl        # creates designs/landing.json (fails if it exists)
node le.js page landing < /tmp/page.dsl       # ...or replace the first page of an existing document
```

**Change an existing page**

```bash
node le.js dsl landing                        # read the whole document as DSL, every line ends with its #id
node le.js dsl landing Hero --depth 2         # just a subtree, limited depth
node le.js set landing Hero/Title size=64 color=#111827          # change properties (DSL shorthand)
node le.js set landing 'Categories/Card' bg=#f1f5f9 --all        # every match (name path)
node le.js text landing Hero/Subtitle "New copy for the subtitle"
node le.js add landing Header/Nav 'text "Blog" size=15 color=#334155 tag=a href=/blog' --index 2
node le.js add landing Hero - <<'EOF2'        # multi-line DSL from stdin
frame Buttons row gap=12
  frame Primary row p=12,22 r=10 bg=#2563eb tag=a href=/start
    text "Get started" size=15 weight=600 color=#fff
EOF2
node le.js replace landing Footer < /tmp/footer.dsl   # swap a subtree (keeps the node id)
node le.js rm landing 'Hero/Badge'
node le.js mv landing '#n1z' Header/Nav 0     # move a node (parent selector, index)
node le.js dup landing Categories/Card
node le.js wrap landing 'Stats/*' 'frame StatsRow row gap=48' --all
node le.js ops landing ops.json               # batch of JSON ops (see below)
```

Prefer `set`/`add`/`replace` over rewriting the whole page: they keep ids stable and are smaller diffs.
After a change, `node le.js dsl <doc> <selector>` is the cheapest way to verify.

**Exports**: `node le.js export landing --html out.html --figma out.figma.json --dsl out.dsl --json out.json`
**Imports**: `node le.js import file.json --as name` (native or Figma REST JSON),
`node le.js import-figma <fileKey|URL> --as name [--token figd_… | FIGMA_TOKEN env] [--nodes 12:34,56:78]`

## Libraries: building pages from components (what a designer would do)

A library is a document with `COMPONENT` / `COMPONENT_SET` nodes and tokens. Documents link libraries
(`doc.libraries = ["le-ui"]`); the editor, CLI, exports and lint all resolve components through the linked libraries.

```bash
node le.js lib ls                                              # available libraries
node le.js lib add https://www.figma.com/design/<key>/… --as acme --token figd_…   # from Figma (any file the token can open)
node le.js lib add https://example.com/acme-ui.json --as acme  # from a JSON URL (native or Figma REST JSON)
node le.js lib add ./acme.json --as acme                       # from a file
node le.js lib new acme < acme.dsl                             # from DSL (set/component/token lines, see examples/le-ui.dsl)
node le.js lib link landing acme                               # link to a document (or: node le.js new landing --libs acme)
node le.js components landing                                  # what you can use: tokens + one line per component
node le.js lib dsl acme Button                                 # inspect a component's structure
node le.js lint landing                                        # strict mode: fails if anything is not from the libraries
```

`components` prints lines like `Button  {Type=Primary|Secondary|Ghost, Size=Medium|Large}  texts: Label  [le-ui]  — description`:
the variant properties and values, and the text slots you can override. **Read this before building with a library.**

Instances in the DSL:

```
instance Button Type=Primary Size=Large "Sign up"           # component name, variant props (Capitalized=Value), first text
instance Card Title.text="Home & Repair" Link.text="312 experts" Icon.hidden   # overrides: <ChildName>.<key>=value
instance Input Label.text="Where" Placeholder.text="Vienna" w=200          # size/position/sizing (w=fill, x=, y=) as usual
instance Navbar w=fill name=TopBar                           # name= gives the layer a different name
```

Override keys: `.text=` (characters), `.hidden` / `.visible`, `.fill=#hex|$Token`, `.color=`, `.size=`, `.weight=`, `.style.<field>=`.
A child is addressed by its name inside the component (nested instances by their component name, e.g. `Button.hidden`).
Tokens: `bg=$Brand/500 color=$Ink/900 stroke=$Line/200` (colors), `ts=Heading/H2` (text style), `effect=Card` (effect style).

**Strict library rule** (when the user asks for a page built with a library): use only `instance` nodes, plain layout
frames (`row`/`col`, `bg=none` or `bg=$Token`), and text with `ts=` + `color=$Token`. Never draw rectangles, ellipses or
ad-hoc colors. Verify with `node le.js lint <doc>`; fix every reported node. If a needed component does not exist, say so
and either compose it from existing ones or (if asked) add it to the library with `lib new` / `make-component`.

Other instance ops: `node le.js detach <doc> <sel>` (instance → frame), `node le.js make-component <doc> <sel> --name X`
(frame → component), ops `swap` (`{ "op": "swap", "target": sel, "component": "Button", "variant": { "Type": "Ghost" } }`).

## DSL reference

One node per line; indentation = nesting (2 spaces). `// comment` lines are ignored.

```
<type> [Name | "Quoted Name"] ["text content" (text only)] [flags] [key=value ...] [#id]
```

- **Types**: `page frame group rect ellipse text line component set instance section` (`set` = component set of variants,
  its children are `component "Prop=Value, Prop2=Value"` lines; `desc="…"` documents a component)
- **Token definitions** (library DSL, top level): `token Name #hex`, `textstyle Name size= weight= lh= ls= font=`,
  `effectstyle Name shadow=x,y,blur,spread,#color`
- **Name**: a bare word or quoted string. For `text`, the (last) quoted string is the content; a bare word
  before it or a first quoted string is the name (`text Title "Hello"`, `text "Hello"`). Name defaults to the content.
- `#id` at the end pins the node id (use the ids you read from `dsl` output; new nodes get ids automatically).
- Numbers are px. Colors are hex (`#fff`, `#2563eb`, `#00000040` with alpha) or `none`.

| Group | Keys |
|---|---|
| Position | `x= y=` (ignored inside auto-layout unless `abs`), `rot=` |
| Size | `w=` `h=` → number, `fill`, or `hug`. Auto-layout frames and text default to `hug`; other frames default to 100×100 |
| Auto layout | flags `row` `col` `wrap` `nolayout`; `gap=` `rowgap=`; `p=all` / `p=v,h` / `p=t,r,b,l`; `px= py= pt= pr= pb= pl=`; `justify=start\|center\|end\|between` (main axis); `items=start\|center\|end\|baseline` (cross axis); flag `center` = both centered. Any of these on a frame without `row`/`col` turns on `row` automatically |
| Fill | `bg=#hex` / `bg=none` / `bg=url(https://…)` / `bg=linear(angle,#a,#b)`; `fills=a\|b` for multiple; `img=url` |
| Stroke | `stroke=#hex` `sw=weight` `salign=inside\|center\|outside` |
| Shape | `r=radius` or `r=tl,tr,br,bl`; `opacity=0..1`; `clip` / `noclip` |
| Effects | `shadow=x,y,blur,spread,#color` ; `blur=px` ; `shadow=none` |
| Text | `size=` `weight=100..900\|bold\|medium…` `font="Family"` `lh=px\|150%\|1.5` `ls=px` `align=left\|center\|right\|justify` `valign=top\|center\|bottom` `color=#hex` `decoration=underline\|strike` `case=upper\|lower\|title` `italic=true` |
| Tokens | `bg=$Name` / `color=$Name` / `stroke=$Name` (color tokens), `ts=Name` (text style), `effect=Name` (effect style) |
| Semantics | `tag=section` (any HTML tag; used by HTML export), `class="a b"`, `href= src= alt= title= target= rel= role= aria-label= placeholder=`, `attr:anything=` / `data-x=` |
| State | flags `hidden` `locked` `abs` (absolute inside auto layout) `grow` |
| Raw | any other `key=value` sets the raw node field; dotted paths work (`style.fontFamily=Roboto`, `layoutAlign=STRETCH`) |

Guidelines for good pages: use auto layout everywhere (`col` for sections, `row` for bars/cards), `w=fill` for
full-width children, `hug` for buttons/labels, fixed widths only for the page frame and columns. Put `tag=` on
semantic containers (`header`, `nav`, `section`, `footer`, `a`, `h1`…) so the HTML export is meaningful.
Inter is the default font (loaded from Google Fonts in the editor).

## Selectors

| Selector | Meaning |
|---|---|
| `#n12` or `n12` | by id (ids are shown in `dsl` output) |
| `Header/Nav/Home` | name path; each segment matches any **descendant** of the previous match (text nodes also match by their content) |
| `Nav/*` | all direct children |
| `Hero/@TEXT`, `@FRAME` | by type |
| `Card[2]` | the 3rd match (0-based) |
| `/Page 1/Header` | leading slash: path from the document root (pages are `page` nodes) |

Which matches are affected: `set`, `rename` and `text` apply to **every** match; `add`, `replace`, `move`, `reorder`,
`duplicate`, `remove` and `wrap` use the **first** match unless `all: true` (ops) / `--all` (CLI `rm`, `wrap`) is given.

## Ops (JSON) — CLI `ops`, HTTP `POST /api/docs/:name/ops`, browser `window.__le.apply(ops)`

```json
[
  { "op": "set",       "target": "Hero/Title", "dsl": "size=64 weight=800", "props": { "name": "Headline" } },
  { "op": "add",       "parent": "Header/Nav", "index": 0, "dsl": "text \"Blog\" size=15 tag=a href=/blog" },
  { "op": "add",       "parent": "#n3", "node": { "type": "RECTANGLE", "name": "Divider", "width": 1, "height": 24, "fills": [{ "type": "SOLID", "color": "#e2e8f0" }] } },
  { "op": "replace",   "target": "Footer", "dsl": "frame Footer row w=fill p=40,80 justify=between\n  text \"© 2026\" size=14" },
  { "op": "text",      "target": "Hero/Subtitle", "characters": "New copy" },
  { "op": "rename",    "target": "#n9", "name": "Actions" },
  { "op": "move",      "target": "#n5", "parent": "Header/Actions", "index": -1 },
  { "op": "reorder",   "target": "Nav/Pricing", "index": 0 },
  { "op": "duplicate", "target": "Categories/Card" },
  { "op": "wrap",      "target": "Stats/*", "all": true, "dsl": "frame Row row gap=48" },
  { "op": "unwrap",    "target": "Row" },
  { "op": "remove",    "target": "Hero/Badge" },
  { "op": "swap",      "target": "Hero/Button", "component": "Button", "variant": { "Type": "Ghost" } },
  { "op": "detach",    "target": "Hero/Card" },
  { "op": "component", "target": "Hero/Promo", "name": "PromoCard", "description": "…" }
]
```

`props` are raw node fields, deep-merged (`{"style": {"fontSize": 20}}`); `null` deletes a field.
`dsl` on `set` is the shorthand string from the table above. `replace` keeps the replaced node's id.

## HTTP API (same routes under `npm run dev` on :5173 and `npm start` on :4000)

| Route | |
|---|---|
| `GET /api/docs` | list documents |
| `GET /api/docs/:name` · `PUT` (JSON body, native or Figma REST) · `DELETE` · `POST` (text body = DSL, creates) | |
| `POST /api/docs/:name/ops` | body: ops array or `{ "ops": [...], "scope": "Hero", "return": "dsl" }` |
| `GET /api/docs/:name/dsl?sel=Hero&depth=2&ids=1` | DSL text · `POST …/dsl?sel=Hero` (text body) replaces the subtree; without `sel` replaces the first page |
| `GET /api/docs/:name/export?format=html\|figma\|dsl\|json` | |
| `POST /api/figma/import` `{ "token", "fileKey", "nodeIds"?, "name"? }` | fetch from the Figma REST API (server side) |
| `GET /api/events` | SSE: `{type:"changed", doc, writer}` / `{type:"lib-changed", lib}` when a file changes |
| `GET /api/libs` · `GET/PUT/DELETE /api/libs/:name` · `POST /api/libs/:name` (DSL text) | libraries |
| `POST /api/libs/import` `{ "source": "<figma url|key|json url>", "token"?, "name"? }` or `{ "json": {...} }` | import a library |
| `POST /api/docs/:name/link` `{ "libraries": [...] }` or `{ "add": "lib" }` / `{ "remove": "lib" }` | link libraries |
| `GET /api/docs/:name/components[?format=json]` · `GET /api/docs/:name/lint` · `GET /api/libs/:name/components` | |
| `GET /api/docs/:name/export?format=json&expanded=1` | instances expanded (input for the Figma plugin) |
| `POST /api/docs/:name/meta` `{ "title"?, "brief"?, "grid"? }` · `GET /api/docs/:name/versions` · `POST …/versions` `{}` or `{ "restore": id }` | metadata, history |
| `GET /api/proxy?url=…` | fetch an HTML prototype server-side (for the in-app prototype viewer) |

## Document format

`designs/<name>.json` is `{ format: "le-design/1", name, meta: { seq }, type: "DOCUMENT", children: [CANVAS…] }`.
Nodes follow the Figma REST API field names (`layoutMode`, `itemSpacing`, `paddingLeft`, `primaryAxisAlignItems`,
`fills`, `strokes`, `effects`, `cornerRadius`, `characters`, `style.fontSize`, `layoutSizingHorizontal` …) with three
differences: colors are hex strings, `x`/`y` are relative to the parent, and `node.html = { tag, className, attrs }`
carries semantics. Default values are omitted. `src/core/figma.js` converts to/from the exact REST shape.

**Figma round trip**: `import-figma` / the Import dialog pull a file via the REST API. To push a design into Figma,
install `figma-plugin/` (Plugins → Development → Import plugin from manifest) and paste the native JSON; the plugin
also exports a selection back to the native format. The native JSON is also a good input for the Figma MCP
`use_figma` tool if one is available.

## From brief to code: the workflow this tool is built around

1. **Brief** — the product manager's description lives with the file: `node le.js brief <doc>` (read) /
   `node le.js brief <doc> - < brief.md` (set). Read it first; it says which states and components matter.
2. **Prototype (HTML)** — build an interactive HTML prototype with plain HTML/CSS/JS, **using the library's components**:
   `node le.js lib export le-ui --html gallery.html` gives you every component and variant as HTML+CSS (with
   `data-component="Button" data-variant="Type=Primary, Size=Medium"` on each element and tokens as CSS variables
   `var(--Brand-500)`). Copy those snippets; keep the `data-component`/`data-variant` attributes and put `data-name`
   on text slots. Interactions (dropdowns, panels, tabs) are ordinary JS in the prototype.
3. **States → screens** — every state the developers must see becomes its own screen on the canvas:
   `node le.js import-html proto.html --as <doc> --libs le-ui --state "Default"` then
   `--state "Dropdown open" --click "#dd button"` (or `--script "…"`). Elements with `data-component` come back as
   library instances, everything else as frames/text with the real computed styles. In the app: Prototype → load →
   interact → "Capture this state as a screen". Screens auto-place on the grid; `lint` checks library compliance.
4. **Design review** — designers adjust screens in the editor (or you do via `set`/`replace`). Dev mode shows
   paddings, gaps, distances, colors, fonts and tokens; `node le.js spec <doc> <selector>` prints the same spec.
5. **Back to code** — `node le.js export <doc> --html` regenerates HTML+CSS from the screens (tokens as CSS
   variables, components as `data-component` elements), `--figma` for Figma, and the DSL (`dsl <doc> <screen>`) is
   the compact source for writing the real implementation in any framework: read a screen's DSL, map instances to
   the code components of the target stack, map tokens to the theme.

The same identifiers travel in every direction: component names + variant props, token names, layer names and
`data-le-id`s, so a change made in the editor can be re-exported, and a changed prototype can be re-captured into the
same file (capture again, then `rm` the old screen or `replace` it).

## Files, titles, placement

- `node le.js ls` lists files with title, designer and last update (what the Files home screen shows).
  `node le.js new <doc> --title "Onboarding flow" --libs le-ui < page.dsl` sets the title; `title <doc> "…"` changes it.
  The author recorded on saves comes from `--who`, `LE_USER`, or `git config user.name`.
- Each page of a document is one top-level `frame` on the canvas. Frames added to a page **without x/y are placed
  automatically** to the right of the existing ones, snapped to the 100 px grid, so you never need coordinates:
  `node le.js add landing 'Page 1' - < pricing.dsl` just works. `node le.js arrange <doc> [--columns 3]` tidies a page.
- `node le.js versions <doc>` / `restore <doc> <id>` / `snapshot <doc>`: server-side history (before each save,
  rate limited; 40 per file).

## Performance notes

The canvas is plain DOM (auto layout = flexbox). Edits are copy-on-write (only the touched path is copied), renderers are
memoized by node identity, pan/zoom is a direct transform on the world layer, and top-level frames outside the viewport are
not mounted. A 60-page document (`node scripts/stress.mjs 60`) edits in ~30 ms and pans at 60 fps. Keep each page a
top-level frame of the canvas (`page` → many `frame`s) so culling can work.

## Verifying visually (optional)

Start the server, then screenshot with Playwright:

```js
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
await p.goto('http://localhost:5173/?doc=landing'); await p.waitForSelector('.world [data-id]'); await p.waitForTimeout(500);
await p.screenshot({ path: 'landing.png' }); await b.close();
```

`window.__le` exposes the store in the browser (`getState()`, `apply(ops)`, `select(id)`, `zoomToFit()`, `model`, `dsl`).
The HTML export (`node le.js export <doc> --html out.html`) can also be opened directly in a browser.
