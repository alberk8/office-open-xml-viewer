// Per-line bidi ordering for the xlsx renderer (rich-text cell runs).
//
// We reorder a cell line's rich-text runs at SEGMENT granularity (1:1 with the
// runs — every per-run font/colour property is preserved) using the shared
// UAX#9 engine (rule L2), and let Canvas shape each run internally when it is
// drawn with `ctx.direction` set to the run's resolved direction. The whole run
// string is drawn in one fillText, so Canvas resolves any residual
// intra-run bidi.

import {
  getDefaultBidiEngine,
  resolveBaseDirection,
  hasStrongRtl,
  OBJECT_PLACEHOLDER,
  buildVisualOrder,
} from '@silurus/ooxml-core';

/**
 * Resolve a cell's base direction from its xf @readingOrder
 * (ECMA-376 §18.8.1: 1 = LTR, 2 = RTL, 0/absent = Context → UAX#9 first-strong).
 */
export function cellBaseRtl(readingOrder: number | undefined, text: string): boolean {
  if (readingOrder === 2) return true;
  if (readingOrder === 1) return false;
  return resolveBaseDirection(undefined, text) === 'rtl';
}

/** A laid-out segment as seen here: only its optional text matters for bidi.
 *  Typed as `unknown` element so the renderer's LayoutSeg union (whose image /
 *  math / tab members carry no `text`) assigns cleanly. */
const segText = (s: unknown): string | undefined => {
  const t = (s as { text?: unknown }).text;
  return typeof t === 'string' ? t : undefined;
};

/** Cheap test: does this run of segments contain any strong-RTL character? */
export function segmentsHaveRtl(segments: readonly unknown[]): boolean {
  for (const s of segments) {
    const t = segText(s);
    if (t !== undefined && hasStrongRtl(t)) return true;
  }
  return false;
}

/**
 * Resolve whether one cell line / paragraph needs the bidi pass and its base
 * direction, from the xf @readingOrder (§18.8.1) and the line/paragraph text.
 * Gated so pure-LTR text (no strong-RTL char and not explicitly RTL) keeps the
 * exact pre-bidi path: `needBidi` false ⇒ no UAX#9 reorder. `baseRtl` is only
 * resolved when the pass will run. The single source of truth for the gate +
 * base-direction rule shared by the non-wrap ({@link cellBaseRtl} per LF line)
 * and wrap (per LF paragraph) rich-text paths — keeping the two in lockstep.
 */
export function resolveCellBidi(
  readingOrder: number | undefined,
  text: string,
): { needBidi: boolean; baseRtl: boolean } {
  const needBidi = readingOrder === 2 || hasStrongRtl(text);
  return { needBidi, baseRtl: needBidi && cellBaseRtl(readingOrder, text) };
}

export interface LineVisualOrder {
  /** Logical segment indices in visual (left-to-right) order. */
  order: number[];
  /** Per-LOGICAL-index resolved direction (true = RTL) for `ctx.direction`. */
  rtl: boolean[];
}

/**
 * Compute the visual draw order of a line's segments under `baseRtl`. Text
 * segments contribute their text; non-text segments contribute one neutral
 * placeholder so they take the surrounding direction. Each segment is assigned
 * the embedding level of its first code unit (segments are single-script in
 * practice because they are space-split); Canvas resolves any residual
 * intra-segment bidi when the slice is drawn with the matching `ctx.direction`.
 */
export function computeLineVisualOrder(
  segments: readonly unknown[],
  baseRtl: boolean,
): LineVisualOrder {
  const n = segments.length;
  if (n === 0) return { order: [], rtl: [] };

  let full = '';
  const segStart: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    segStart[i] = full.length;
    const t = segText(segments[i]) ?? '';
    full += t.length > 0 ? t : OBJECT_PLACEHOLDER;
  }

  const { levels, paragraphLevel } = getDefaultBidiEngine().computeLevels(
    full,
    baseRtl ? 'rtl' : 'ltr',
  );

  const { order, segLevels } = buildVisualOrder(levels, paragraphLevel, segStart);
  const rtl: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) rtl[i] = (segLevels[i] & 1) === 1;
  return { order, rtl };
}
