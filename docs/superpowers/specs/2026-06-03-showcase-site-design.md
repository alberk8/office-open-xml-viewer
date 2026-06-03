# Showcase Site Design — office-open-xml-viewer

Date: 2026-06-03

## Goal

A dedicated, visually striking marketing/showcase site for `@silurus/ooxml`,
deployable to GitHub Pages. The existing Storybook (port 6006, also used for VRT)
stays untouched. Local-first; public deployment is a later decision.

The site's central weapon: **the real library renders real sample files live in
the page**, proving the rendering quality that screenshots can't.

## Decisions

- **Location**: `site/` at repo root — its own Astro project, added to
  `pnpm-workspace.yaml`. Storybook config and `packages/*` are not modified
  (read-only) except for adding the workspace entry.
- **Stack**: Astro + islands. Shiki for code highlighting (Astro built-in).
  Three.js for the 3D hero icon. Aesthetic: **dark technical** (dark bg, neon
  accent, monospace touches) — GitHub/Vercel-adjacent.
- **UI integration examples**: React, Vue, Svelte, vanilla JS (tabbed code).
- **3D icon constraint**: `cube3.glb` (~/開発/cube3.glb) only has text on the
  front 3 faces; the back is not built. The 3D view MUST only show the front
  faces — constrain rotation to the front or use a gentle limited sway; never
  reveal the unfinished back faces.

## Sections

1. **Hero** — interactive 3D `cube3.glb` (front faces only), tagline,
   `npm install @silurus/ooxml`, CTAs (npm / GitHub / Storybook).
2. **Pitch** — Rust/WASM parser + Canvas renderer, spec-faithful rendering,
   headless engine for custom UIs (3–4 strengths).
3. **Live Showcase** (centerpiece) — DOCX / XLSX / PPTX tabs; each runs the real
   `Viewer` rendering `demo/sample-1.*` live, with page/slide nav + zoom.
4. **Code** — per format, mount code in React / Vue / Svelte / vanilla tabs
   (Shiki, copy button), placed beside the live demo.
5. **UI library integration** — same 4 framework tabs, more practical component
   examples (ref + effect mount/cleanup, scroll view).
6. **Feature Support matrix** — reused from README.
7. **Footer** — npm / GitHub / VS Code extension / Storybook links.

## Technical risks (validate first)

- **Real Viewer inside an Astro island**: site depends on `@silurus/ooxml` via
  workspace; Astro Vite config needs `vite-plugin-wasm` + `top-level-await`.
  Worker + WASM must work inside the island. This is the first thing to prove.
- **GitHub Pages base path**: configurable via env (`/` for custom domain,
  `/office-open-xml-viewer/` for project pages). Default `/` for local.
- **Deploy**: provide a GitHub Actions workflow skeleton only; publishing is the
  user's call.

## Process

Build incrementally; share a browser preview after each step:

1. Astro scaffold + dark theme base
2. One real Viewer in an island (tech validation)
3. Live Showcase, all 3 formats
4. Hero + 3D icon (front faces only)
5. Code tabs (4 FW) + UI integration
6. Pitch / Feature matrix / Footer polish

## Out of scope

- Modifying Storybook or `packages/*` source.
- Deciding the public domain / CNAME (the custom domain currently serves
  Storybook).
- Auto-updating any VRT reference images.
