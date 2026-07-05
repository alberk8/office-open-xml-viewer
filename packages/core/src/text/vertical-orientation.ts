// UAX #50 — Unicode Vertical Text Layout (https://www.unicode.org/reports/tr50/).
// The single source of truth for how a code point orients when set in a vertical
// line (tbRl / eaVert), consumed by every renderer's vertical-text draw path.
//
// The `Vertical_Orientation` (vo) property has four values:
//   • U  — Upright: same orientation as the code charts. CJK ideographs, kana,
//          Hangul, fullwidth forms, and the already-vertical presentation forms
//          (U+FE10–U+FE19). Drawn standing up.
//   • R  — Rotated 90° clockwise. Latin letters, Western digits, and most Latin
//          punctuation. This is the property's file-wide default (see below).
//   • Tu — Transformed typographically, fallback Upright. A glyph the font may
//          substitute with a dedicated vertical form; if it does not, the glyph
//          is drawn UPRIGHT. Small kana, the ideographic comma/full stop 、。,
//          fullwidth ！？：；，．, etc.
//   • Tr — Transformed typographically, fallback Rotated. Like Tu, but the
//          fallback (no vertical glyph available) is to ROTATE. Corner brackets
//          「」, parentheses （）, angle brackets 〈〉, the katakana-hiragana
//          prolonged sound mark ー (U+30FC), quotation marks, etc.
//
// The generated table is built straight from the UCD `VerticalOrientation.txt`
// data section plus its `@missing: 0000..10FFFF; R` default, so code points not
// listed in the file resolve to R exactly as UAX #50 specifies. See
// packages/core/scripts/gen-vertical-orientation.mjs for provenance.

import {
  VO_NAMES,
  VO_RANGE_STARTS,
  VO_RANGE_VALUE,
} from './vertical-orientation.generated.js';

export { UNICODE_VERSION as VO_UNICODE_VERSION } from './vertical-orientation.generated.js';

/** UAX #50 Vertical_Orientation property value. */
export type VerticalOrientation = 'U' | 'R' | 'Tu' | 'Tr';

/**
 * Vertical_Orientation index (into {@link VO_NAMES}) for a code point.
 * Binary search for the greatest range start ≤ cp; ranges are gap-free and cover
 * [0, 0x110000), so a match always exists for a valid Unicode scalar value.
 */
function verticalOrientationIndex(cp: number): number {
  let lo = 0;
  let hi = VO_RANGE_STARTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (VO_RANGE_STARTS[mid] <= cp) lo = mid;
    else hi = mid - 1;
  }
  return VO_RANGE_VALUE[lo];
}

/**
 * The UAX #50 `Vertical_Orientation` of a code point — one of `'U'`, `'R'`,
 * `'Tu'`, `'Tr'`. Backed by the generated UCD table; no heuristics.
 *
 * @param cp A Unicode scalar value (e.g. from `String.prototype.codePointAt`).
 */
export function verticalOrientation(cp: number): VerticalOrientation {
  return VO_NAMES[verticalOrientationIndex(cp)] as VerticalOrientation;
}

/**
 * The vertical-form (`<vertical>` compatibility) substitution for a Tu/Tr code
 * point, or `null` when there is no dedicated vertical glyph to substitute.
 *
 * UAX #50 §5 ("Glyph Changes for Vertical Orientation") describes the Tu/Tr
 * transform as substituting the glyph with a vertical presentation form. Unicode
 * supplies those forms in the CJK Compatibility Forms block "Vertical Forms"
 * (U+FE10–U+FE19, "PRESENTATION FORM FOR VERTICAL …"), each carrying a
 * `<vertical>` compatibility decomposition back to its horizontal source in
 * UnicodeData.txt. This map is the inverse of those decompositions for the
 * commas / stops / colons / brackets / ellipsis a Japanese document uses; the
 * source code points are exactly the Tu-class punctuation the corner-cell shift
 * applies to (、。！？：；，． and 【】…). Small kana (also Tu) have no vertical
 * presentation form — the font substitutes a smaller upright glyph via its own
 * `vert`/`vrt2` OpenType feature, which a Canvas cannot invoke — so they return
 * null and are drawn upright unchanged.
 *
 * Renderers apply this ONLY at glyph-draw time (glyph selection): the text model,
 * advance/width (kept at 1 em), selection, and find/highlight all continue to use
 * the ORIGINAL code point, so searching for 。 still matches a substituted 。.
 *
 * @param cp A Unicode scalar value.
 * @returns The vertical presentation-form code point, or null.
 */
export function verticalFormSubstitute(cp: number): number | null {
  return VERTICAL_FORM_MAP.get(cp) ?? null;
}

// Inverse of the U+FE10–U+FE19 `<vertical>` compatibility decompositions
// (UnicodeData.txt) — source (horizontal) code point → vertical presentation
// form. Names per the Unicode "CJK Compatibility Forms" chart:
//   U+FE10 PRESENTATION FORM FOR VERTICAL COMMA               <vertical> FF0C
//   U+FE11 PRESENTATION FORM FOR VERTICAL IDEOGRAPHIC COMMA   <vertical> 3001 、
//   U+FE12 PRESENTATION FORM FOR VERTICAL IDEOGRAPHIC FULL STOP <vertical> 3002 。
//   U+FE13 PRESENTATION FORM FOR VERTICAL COLON               <vertical> FF1A ：
//   U+FE14 PRESENTATION FORM FOR VERTICAL SEMICOLON           <vertical> FF1B ；
//   U+FE15 PRESENTATION FORM FOR VERTICAL EXCLAMATION MARK    <vertical> FF01 ！
//   U+FE16 PRESENTATION FORM FOR VERTICAL QUESTION MARK       <vertical> FF1F ？
//   U+FE17 PRESENTATION FORM FOR VERTICAL LEFT WHITE LENTICULAR BRACKET  <vertical> 3016 〖
//   U+FE18 PRESENTATION FORM FOR VERTICAL RIGHT WHITE LENTICULAR BRACKET <vertical> 3017 〗
//   U+FE19 PRESENTATION FORM FOR VERTICAL HORIZONTAL ELLIPSIS <vertical> 2026 …
// (U+FE19's source 2026 is vo=R, not Tu; it is included because a horizontal
// ellipsis in vertical Japanese is still conventionally set upright via the
// vertical form when the font provides it. The corner brackets 「」（） etc. are
// Tr with no U+FExx vertical form — the font's own `vert` feature reshapes them;
// a Canvas rotates them instead, handled by the Tr rotation path in the renderer.)
const VERTICAL_FORM_MAP: ReadonlyMap<number, number> = new Map<number, number>([
  [0xff0c, 0xfe10], // ， fullwidth comma
  [0x3001, 0xfe11], // 、 ideographic comma
  [0x3002, 0xfe12], // 。 ideographic full stop
  [0xff1a, 0xfe13], // ： fullwidth colon
  [0xff1b, 0xfe14], // ； fullwidth semicolon
  [0xff01, 0xfe15], // ！ fullwidth exclamation mark
  [0xff1f, 0xfe16], // ？ fullwidth question mark
  [0x3016, 0xfe17], // 〖 left white lenticular bracket
  [0x3017, 0xfe18], // 〗 right white lenticular bracket
  [0x2026, 0xfe19], // … horizontal ellipsis
]);
