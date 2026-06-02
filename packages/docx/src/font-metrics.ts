// Font line-height metrics for fonts whose real vertical metrics differ
// substantially from whatever the browser substitutes when the font is not
// installed.
//
// Why this exists
// ---------------
// For `lineRule="auto"` / single spacing (ECMA-376 §17.3.1.33), Word's line
// height is `multiplier × singleLineHeight`, where the single-line height is
// the font's design line height. On Windows (the platform Word's PDF export
// targets) that single line height is `(usWinAscent + usWinDescent) /
// unitsPerEm` per the OS/2 table.
//
// Our renderer normally derives the single-line height from the Canvas
// `fontBoundingBoxAscent + fontBoundingBoxDescent` of the font the browser
// actually used. That is correct when the document's font is installed, but
// when it is substituted the fallback's metrics can be far smaller than the
// intended font's — and for fonts with large win-metrics (Japanese UI fonts
// especially) the gap is big enough to overlap lines and accumulate vertical
// drift down the page.
//
// `Meiryo` / `Meiryo UI` are the canonical example: their win line height is
// ≈1.60 em (unitsPerEm 2048, usWinAscent+usWinDescent ≈ 3269), while the
// macOS/Chromium fallback (`Hiragino Sans`) reports only ≈1.0 em from
// `fontBoundingBox`. A 48 pt Meiryo title with `line="168"` (0.7×) therefore
// renders at 0.7 × 1.60 × 48 ≈ 53.8 pt in Word but collapses to ≈34 pt with
// the fallback metric, overlapping the lines.
//
// This table provides the intended font's win line-height ratio so the line
// box can be sized as Word would, independent of which fallback ends up
// drawing the glyphs. Only fonts whose ratio is verified from real metrics
// belong here — never a value tuned to make one sample look right. Latin
// fonts are intentionally absent: their win ratio (~1.15–1.22 em) is close to
// what the browser fallback already reports, so the correction is negligible.

/** A known font's win line-height ratio: `(usWinAscent + usWinDescent) /
 *  unitsPerEm`. Keyed by a normalized (lowercased) family name. */
const WIN_LINE_HEIGHT_RATIO: ReadonlyArray<readonly [test: (n: string) => boolean, ratio: number]> = [
  // Meiryo / Meiryo UI — unitsPerEm 2048, usWinAscent 2210 + usWinDescent 1059
  // ≈ 3269 → 1.596. Cross-checked against the sample-3 reference PDF: the 48 pt
  // Title (`line="168"` = 0.7×) measures 53.8 pt cap-top to cap-top
  // → singleLine = 53.8 / 0.7 / 48 = 1.60 em.
  [(n) => n.includes('meiryo') || n.includes('メイリオ'), 1.6],
];

/**
 * Win line-height ratio (`(usWinAscent+usWinDescent)/unitsPerEm`) for a
 * requested font family, or `null` when the font is not in the table (the
 * caller should then fall back to the substituted font's Canvas metrics).
 */
export function fontWinLineHeightRatio(family: string | null | undefined): number | null {
  if (!family) return null;
  const n = family.toLowerCase();
  for (const [test, ratio] of WIN_LINE_HEIGHT_RATIO) {
    if (test(n)) return ratio;
  }
  return null;
}

/**
 * Intended single-line height in px for a run of `family` at `emPx` (the font
 * size already multiplied by the render scale), or `0` when the font is not in
 * the table. `0` is a no-op sentinel for the line-box math, which takes the
 * max of this and the substituted font's natural ascent+descent.
 */
export function intendedSingleLinePx(family: string | null | undefined, emPx: number): number {
  const ratio = fontWinLineHeightRatio(family);
  return ratio === null ? 0 : ratio * emPx;
}
