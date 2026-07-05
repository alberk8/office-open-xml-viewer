import { describe, it, expect } from 'vitest';
import { parseFieldFormatSwitch } from './field-format-switch';

describe('parseFieldFormatSwitch — ECMA-376 §17.16.4.3.1 general-formatting switch', () => {
  it('returns null when the instruction carries no \\* switch', () => {
    expect(parseFieldFormatSwitch('PAGE')).toBeNull();
    expect(parseFieldFormatSwitch('PAGE \\* MERGEFORMAT')).toBeNull(); // MERGEFORMAT is not a number format
    expect(parseFieldFormatSwitch('')).toBeNull();
  });

  it('maps the numeric switch arguments to ST_NumberFormat values (case-sensitive)', () => {
    // Arabic -> decimal
    expect(parseFieldFormatSwitch('PAGE \\* Arabic')).toBe('decimal');
    // Roman (uppercase) vs roman (lowercase) are DISTINCT arguments
    expect(parseFieldFormatSwitch('PAGE \\* Roman')).toBe('upperRoman');
    expect(parseFieldFormatSwitch('PAGE \\* roman')).toBe('lowerRoman');
    // ALPHABETIC vs alphabetic
    expect(parseFieldFormatSwitch('PAGE \\* ALPHABETIC')).toBe('upperLetter');
    expect(parseFieldFormatSwitch('PAGE \\* alphabetic')).toBe('lowerLetter');
  });

  it('ignores a trailing MERGEFORMAT after a real format switch', () => {
    expect(parseFieldFormatSwitch('PAGE \\* roman \\* MERGEFORMAT')).toBe('lowerRoman');
    expect(parseFieldFormatSwitch('PAGE \\* MERGEFORMAT \\* Roman')).toBe('upperRoman');
  });

  it('tolerates extra whitespace and surrounding switches', () => {
    expect(parseFieldFormatSwitch('  PAGE    \\*    Roman   ')).toBe('upperRoman');
    expect(parseFieldFormatSwitch('PAGE \\* roman \\# 0')).toBe('lowerRoman');
  });

  it('returns null for a format argument this converter does not support', () => {
    // CardText etc. are recognised switches but not numeric-native — the caller
    // then keeps the section fmt / decimal. We surface null (not decimal) so the
    // caller can distinguish "no override" from "override to decimal".
    expect(parseFieldFormatSwitch('PAGE \\* CardText')).toBeNull();
    expect(parseFieldFormatSwitch('PAGE \\* Ordinal')).toBeNull();
  });
});
