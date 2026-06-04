// MathML → SVG via a pre-bundled MathJax v4 + STIX Two Math converter.
//
// This module is the *heavy* half of the math feature: it references the
// pre-built engine asset `assets/mathjax-stix2.js` (~3 MB; MathJax core + the
// statically-baked STIX2 font), so anything that statically imports it drags
// that asset into the bundle.
//
// To keep the asset OUT of the docx/pptx initial bundles, the renderers do NOT
// import this module. Instead it is published as a *separate* entry point
// (`@silurus/ooxml/math`) that consumers explicitly import and pass to a viewer
// (`new DocxViewer(canvas, { math })`). When they don't, the whole asset
// tree-shakes away. See `src/math.ts` (root) and the `MathRenderer` interface.
//
// The asset itself is self-contained: DOM-free internally, zero network, zero
// cross-origin requests. It exposes `globalThis.__ooxmlStix2`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { type MathSvg, svgExtents } from './mathjax';

interface Stix2Engine {
  /** MathML string → standalone `<svg>…</svg>` (currentColor fill, viewBox in 1000-units/em). */
  mathml2svg(mathml: string): string;
}

let enginePromise: Promise<Stix2Engine> | null = null;

function resolveAssetUrl(): string {
  return new URL('../../assets/mathjax-stix2.js', import.meta.url).href;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load math engine from ${src}`));
    document.head.appendChild(s);
  });
}

function ensureEngine(): Promise<Stix2Engine> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const existing = (globalThis as any).__ooxmlStix2 as Stix2Engine | undefined;
    if (existing) return existing;
    if (typeof document === 'undefined') {
      throw new Error('Math rendering requires a DOM (browser environment)');
    }
    await loadScript(resolveAssetUrl());
    const engine = (globalThis as any).__ooxmlStix2 as Stix2Engine | undefined;
    if (!engine) throw new Error('Math engine failed to initialize');
    return engine;
  })();
  return enginePromise;
}

/** Preload the math engine. Call once before rendering equations. */
export async function loadMathJax(): Promise<void> {
  await ensureEngine();
}

/** Convert a MathML string to a standalone SVG + its baseline-relative extents. */
export async function mathMLToSvg(mathml: string): Promise<MathSvg> {
  const engine = await ensureEngine();
  const svg = engine.mathml2svg(mathml);
  return { svg, ...svgExtents(svg) };
}
