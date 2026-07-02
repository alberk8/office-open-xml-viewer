// Shared building blocks for the per-line SEGMENT-granularity bidi ordering that
// the docx / pptx / xlsx renderers each run over a laid-out line's segments.
//
// Only the format-agnostic pieces live here: the cheap strong-RTL gate, the
// neutral object placeholder, and the mechanical back half that turns resolved
// UAX#9 levels into a visual-order permutation. The format-specific parts stay
// in each package's `bidi-line.ts`:
//   - docx: a §17.3.2.30 / §17.3.2.20 class-override input (digitsAsAN / rtl
//     marks) and a trailing-whitespace-excluding "any odd level" rtl scan;
//   - xlsx: the @readingOrder (§18.8.1) base-direction gate;
//   - pptx: neither (plain first-strong base).
// Those legitimately differ (ECMA-376 gives each format its own rule), so they
// are NOT abstracted into a format-branching function.

import { getDefaultBidiEngine } from './engine.js';
import { REMOVED_LEVEL } from './types.js';

/**
 * Strong-RTL scripts (Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, …) plus
 * Arabic presentation forms, the Plane-1 RTL blocks (Phoenician..Old Hungarian
 * U+10800–10FFF; Mende Kikakui / Adlam / Arabic Math U+1E800–1EFFF) and the
 * RTL-implicating controls (RLM/RLE/RLO/RLI). A cheap gate to decide whether a
 * line needs the (exact) bidi pass at all — never used for ordering itself.
 */
export const RTL_GATE =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u200F\u202B\u202E\u2067]|[\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

/** Cheap test: does this text contain any strong-RTL character (per {@link RTL_GATE})? */
export function hasStrongRtl(text: string): boolean {
  return RTL_GATE.test(text);
}

/** OBJECT REPLACEMENT CHARACTER (U+FFFC, bidi class ON). Each non-text segment
 *  (inline image / math / tab) contributes exactly one of these to the logical
 *  string so it takes the surrounding direction. */
export const OBJECT_PLACEHOLDER = '￼';

/**
 * The mechanical UAX#9 L2 back half shared by all three renderers: given the
 * resolved per-code-unit `levels` (and the paragraph level for the X9-removed
 * fallback) plus each segment's start offset into the concatenated logical
 * string, assign every segment the level of its first real code unit and return
 * both the visual-order permutation and those per-segment levels.
 *
 * @param levels          resolved embedding levels from `engine.computeLevels`.
 * @param paragraphLevel  the line's paragraph level (fallback for a segment
 *                        whose first unit was removed by X9 — level 255).
 * @param segStart        `segStart[i]` = offset of segment i's first code unit.
 * @returns `order` — logical indices in visual (left-to-right) order — and
 *   `segLevels` — the per-segment level each caller uses to derive its own
 *   `rtl[]` direction flags (pptx/xlsx: level parity; docx: its own scan).
 */
export function buildVisualOrder(
  levels: Uint8Array,
  paragraphLevel: number,
  segStart: readonly number[],
): { order: number[]; segLevels: Uint8Array } {
  const n = segStart.length;
  const segLevels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const lvl = levels[segStart[i]];
    // 255 = removed by X9 (no glyph); fall back to the paragraph level.
    segLevels[i] = lvl === REMOVED_LEVEL ? paragraphLevel : lvl;
  }
  const order = getDefaultBidiEngine().reorderVisual(segLevels, 0, n);
  return { order, segLevels };
}
