# Repository notes

- `designer/` is **LE Designer**, a Figma-like design editor optimized for agent work. When asked to build or change
  a page/design, read `designer/AGENTS.md` first: pages are described in a compact DSL and edited with
  `node designer/le.js …` (no browser needed; open editors live-reload). Documents live in `designer/designs/`.
- The rest of the repository is the legacy Django 1.11 site (`webapp/`, `le/`); `localexperts/` is a checked-in
  virtualenv and should not be edited.
