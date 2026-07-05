// ECMA-376 §17.18.59 ST_NumberFormat — render an ordinal integer (a list item's
// index, a page number, …) as the text a consumer displays for that value. This
// is the SHARED numbering-format kernel for every WordprocessingML surface that
// carries an ST_NumberFormat: page numbering (§17.6.12 `<w:pgNumType w:fmt>` and
// the §17.16.4.3.1 field general-formatting switches `\* roman` / `\* ALPHABETIC`
// / …), list markers (§17.9.17 `<w:numFmt>`), footnote/endnote numbering, etc.
// Keeping it in `core` means a future list-numbering feature reuses ONE roman /
// letter converter instead of forking a second copy.
//
// SCOPE (this pass): the numeric, locale-independent formats Word's page-number
// and list surfaces use in practice — `decimal`, `upperRoman`/`lowerRoman`,
// `upperLetter`/`lowerLetter`. Every OTHER ST_NumberFormat value (the text
// spell-outs `cardinalText`/`ordinalText`, the CJK / Hebrew / Thai / Hindi
// counting systems, the enclosed-glyph families, `hex`, `none`, …) is a
// DOCUMENTED RESIDUAL: it degrades to `decimal` so a page number is never blank.
// Those are follow-ups; extend the switch below (and the docx page-number wiring)
// when a fixture needs them.

/** ECMA-376 §17.18.59 ST_NumberFormat — the subset this converter renders
 *  natively (see module header). Any other string is accepted at the call site
 *  and falls back to `decimal`. */
export type NumberFormat =
  | 'decimal'
  | 'upperRoman'
  | 'lowerRoman'
  | 'upperLetter'
  | 'lowerLetter'
  // Accepted but rendered as decimal (documented residual) — kept in the type so
  // callers can pass a raw parsed value without a cast for the common ones.
  | 'none'
  | 'cardinalText'
  | 'ordinalText'
  | 'ordinal'
  | (string & {});

// Classic additive roman numerals, greedily consumed high→low. The four
// subtractive pairs (CM/CD/XC/XL/IX/IV) are inlined so 4/9/40/… render correctly.
// Values ≥ 4000 have no classical single glyph; Word writes repeated M (no
// vinculum bar), which the greedy 1000→M step reproduces (4000 → "MMMM").
const ROMAN_TABLE: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Uppercase roman numerals for a positive integer. Caller guarantees n ≥ 1. */
function toUpperRoman(n: number): string {
  let out = '';
  let rem = n;
  for (const [value, glyph] of ROMAN_TABLE) {
    while (rem >= value) {
      out += glyph;
      rem -= value;
    }
  }
  return out;
}

/** ECMA-376 §17.16.4.3.1 ALPHABETIC/alphabetic (⇔ ST_NumberFormat
 *  upperLetter/lowerLetter): the value maps into A..Z, and for values > 26 the
 *  SAME letter is REPEATED once per full 26 subtracted (27 → "aa", 53 → "aaa",
 *  54 → "BBB"). This is Word's spreadsheet-column-UNLIKE scheme — NOT base-26
 *  (which would give 27 → "aa" too but 53 → "ba"). Caller guarantees n ≥ 1. */
function toUpperLetter(n: number): string {
  const repeats = Math.floor((n - 1) / 26) + 1;
  const letter = String.fromCharCode(0x41 + ((n - 1) % 26)); // 'A' + index
  return letter.repeat(repeats);
}

/**
 * Render `n` in the ST_NumberFormat `fmt`. Non-native formats — and zero /
 * negative values under a format that has no glyph for them (roman, letters) —
 * fall back to Arabic decimal, so the result is never empty. `undefined`/absent
 * `fmt` is the spec default `decimal`.
 */
export function formatOrdinalNumber(n: number, fmt: NumberFormat | undefined): string {
  switch (fmt) {
    case 'upperRoman':
      return n >= 1 ? toUpperRoman(n) : String(n);
    case 'lowerRoman':
      return n >= 1 ? toUpperRoman(n).toLowerCase() : String(n);
    case 'upperLetter':
      return n >= 1 ? toUpperLetter(n) : String(n);
    case 'lowerLetter':
      return n >= 1 ? toUpperLetter(n).toLowerCase() : String(n);
    case 'decimal':
    default:
      return String(n);
  }
}
