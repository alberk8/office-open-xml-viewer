// ECMA-376 §17.16.4.3 / §17.16.4.3.1 — the field "general formatting switch"
// (`\*`). A field instruction may carry `\* <argument>` to format its numeric
// result: `\* Roman` → uppercase roman, `\* alphabetic` → lowercase letters, etc.
// This is a PER-FIELD override that takes precedence over a section-level format
// (e.g. `<w:pgNumType w:fmt>`), because the switch is authored ON the field
// itself. §17.16.4.3.1 lists every argument and its ST_NumberFormat equivalent;
// we recognise the NUMERIC, locale-independent subset that `formatOrdinalNumber`
// (number-format.ts) can render — the same subset the page-number wiring uses.
//
// The mapping table below is verbatim from §17.16.4.3.1 ("Corresponds to an
// ST_NumberFormat enumeration value of …"):
//   Arabic      → decimal        Roman  → upperRoman   roman     → lowerRoman
//   ALPHABETIC  → upperLetter    alphabetic → lowerLetter
// The switch arguments are CASE-SENSITIVE (Roman ≠ roman, ALPHABETIC ≠
// alphabetic) — §17.16.4.3.1 lists them as distinct rows with different results.

import type { NumberFormat } from './number-format';

// Case-sensitive switch-argument → ST_NumberFormat, restricted to the values
// `formatOrdinalNumber` renders natively. Arguments outside this set (CardText,
// Ordinal, DBNUM1, Hex, …) intentionally have no entry: `parseFieldFormatSwitch`
// returns null for them so the caller keeps the section format rather than
// silently downgrading to decimal.
const SWITCH_TO_FORMAT: Readonly<Record<string, NumberFormat>> = {
  Arabic: 'decimal',
  Roman: 'upperRoman',
  roman: 'lowerRoman',
  ALPHABETIC: 'upperLetter',
  alphabetic: 'lowerLetter',
};

/**
 * Parse a field instruction's general-formatting switch (§17.16.4.3.1) into an
 * ST_NumberFormat, or `null` when the instruction carries no numeric-format
 * switch this converter supports (no `\*`, or only `\* MERGEFORMAT`, or an
 * argument outside the native subset). The first supported `\*` argument wins;
 * unsupported ones (e.g. `MERGEFORMAT`) are skipped so `\* MERGEFORMAT \* Roman`
 * still resolves to `upperRoman`.
 */
export function parseFieldFormatSwitch(instruction: string): NumberFormat | null {
  // Match every `\* <arg>` occurrence; `<arg>` is a run of non-space chars
  // (switch arguments are single tokens — MERGEFORMAT, Roman, Arabic, …).
  const re = /\\\*\s+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(instruction)) !== null) {
    const fmt = SWITCH_TO_FORMAT[m[1]];
    if (fmt) return fmt;
  }
  return null;
}
