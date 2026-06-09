// Renderer-facing layer ABOVE the BidiEngine seam: turns a line's logical
// styled runs into visual-ordered draw segments, and resolves base direction.
//
// Pipeline: concat run texts -> engine.computeLevels -> cut atoms at level
// boundaries ∪ shape-style boundaries (NOT at color-only boundaries, to keep
// Arabic joining) -> engine.reorderVisual (L2) over the atoms -> VisualSegment[]
// in visual order, each carrying its logical-order text and per-run parts.

import type { BaseDirection, StyledRun, VisualSegment, SegmentPart } from './types.js';
import { getDefaultBidiEngine } from './engine.js';

const REMOVED_UNIT = 255;

/** Two runs share shape-style iff a glyph can join/shape across their boundary. */
function sameShapeStyle(a: StyledRun, b: StyledRun): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.fontSizePx === b.fontSizePx
  );
}

/**
 * Resolve a format direction flag to a concrete base direction. When the flag is
 * undefined or 'auto', use UAX#9 first-strong (P2-P3) over `text`.
 */
export function resolveBaseDirection(
  flag: boolean | 'auto' | undefined,
  text: string,
): BaseDirection {
  if (flag === true) return 'rtl';
  if (flag === false) return 'ltr';
  return getDefaultBidiEngine().computeLevels(text, 'auto').paragraphLevel === 1 ? 'rtl' : 'ltr';
}

interface Atom {
  level: number;
  start: number; // code-unit offset in the concatenated line text
  parts: SegmentPart[];
}

/**
 * Turn a line's logical styled runs into visual-ordered draw segments.
 * Empty runs are ignored; a fully-empty input yields no segments.
 */
export function toVisualSegments(runs: StyledRun[], base: BaseDirection): VisualSegment[] {
  // Concatenate, tracking the owning run of each code unit.
  let full = '';
  const unitRun: number[] = [];
  for (let r = 0; r < runs.length; r++) {
    const t = runs[r].text;
    full += t;
    for (let k = 0; k < t.length; k++) unitRun.push(r);
  }
  if (full.length === 0) return [];

  const engine = getDefaultBidiEngine();
  const { levels } = engine.computeLevels(full, base);

  // Build atoms in logical order. A new atom starts at a removed unit, a level
  // change, or a shape-style change; a run change with the SAME shape-style only
  // starts a new part within the current atom.
  const atoms: Atom[] = [];
  let cur: Atom | null = null;
  let curRun = -1;

  for (let i = 0; i < full.length; i++) {
    const lvl = levels[i];
    if (lvl === REMOVED_UNIT) {
      cur = null; // removed unit breaks the contiguous slice
      curRun = -1;
      continue;
    }
    const runIdx = unitRun[i];
    const ch = full[i];

    const styleBreak = cur !== null && !sameShapeStyle(runs[curRun], runs[runIdx]);
    if (cur === null || cur.level !== lvl || styleBreak) {
      cur = { level: lvl, start: i, parts: [{ text: ch, run: runs[runIdx] }] };
      atoms.push(cur);
      curRun = runIdx;
    } else if (runIdx !== curRun) {
      cur.parts.push({ text: ch, run: runs[runIdx] });
      curRun = runIdx;
    } else {
      cur.parts[cur.parts.length - 1].text += ch;
    }
  }
  if (atoms.length === 0) return [];

  // L2 over atoms (each atom sits within one level run, so atom-granular
  // reordering equals char-granular visual order).
  const atomLevels = atoms.map((a) => a.level);
  const order = engine.reorderVisual(Uint8Array.from(atomLevels), 0, atoms.length);

  return order.map((ai): VisualSegment => {
    const a = atoms[ai];
    return {
      text: a.parts.map((p) => p.text).join(''),
      isRTL: (a.level & 1) === 1,
      level: a.level,
      parts: a.parts,
      logicalStart: a.start,
    };
  });
}
