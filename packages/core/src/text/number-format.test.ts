import { describe, it, expect } from 'vitest';
import { formatOrdinalNumber, type NumberFormat } from './number-format';

describe('formatOrdinalNumber — ECMA-376 §17.18.59 ST_NumberFormat', () => {
  describe('decimal (Arabic cardinal)', () => {
    it('renders positive integers verbatim', () => {
      expect(formatOrdinalNumber(1, 'decimal')).toBe('1');
      expect(formatOrdinalNumber(123, 'decimal')).toBe('123');
      expect(formatOrdinalNumber(0, 'decimal')).toBe('0');
    });
    it('keeps the sign for negatives', () => {
      expect(formatOrdinalNumber(-5, 'decimal')).toBe('-5');
    });
  });

  describe('lowerRoman / upperRoman — §17.16.4.3.1 roman / Roman', () => {
    it('converts standard values (spec example: 123 -> cxxiii / CXXIII)', () => {
      expect(formatOrdinalNumber(123, 'lowerRoman')).toBe('cxxiii');
      expect(formatOrdinalNumber(123, 'upperRoman')).toBe('CXXIII');
    });
    it('handles the four subtractive pairs', () => {
      expect(formatOrdinalNumber(4, 'upperRoman')).toBe('IV');
      expect(formatOrdinalNumber(9, 'upperRoman')).toBe('IX');
      expect(formatOrdinalNumber(40, 'upperRoman')).toBe('XL');
      expect(formatOrdinalNumber(90, 'upperRoman')).toBe('XC');
      expect(formatOrdinalNumber(400, 'upperRoman')).toBe('CD');
      expect(formatOrdinalNumber(900, 'upperRoman')).toBe('CM');
    });
    it('renders 1 and 3999 (max within the classic additive system)', () => {
      expect(formatOrdinalNumber(1, 'lowerRoman')).toBe('i');
      expect(formatOrdinalNumber(3999, 'upperRoman')).toBe('MMMCMXCIX');
    });
    it('renders values above 3999 with repeated M (no bars/overlines)', () => {
      // 4000 = MMMM (Word writes four Ms; it does NOT use the vinculum bar form).
      expect(formatOrdinalNumber(4000, 'upperRoman')).toBe('MMMM');
      expect(formatOrdinalNumber(4999, 'upperRoman')).toBe('MMMMCMXCIX');
    });
    it('falls back to decimal for zero and negatives (roman has no glyph for 0)', () => {
      expect(formatOrdinalNumber(0, 'lowerRoman')).toBe('0');
      expect(formatOrdinalNumber(-1, 'upperRoman')).toBe('-1');
    });
  });

  describe('lowerLetter / upperLetter — §17.16.4.3.1 alphabetic / ALPHABETIC', () => {
    it('maps 1..26 to a..z / A..Z', () => {
      expect(formatOrdinalNumber(1, 'lowerLetter')).toBe('a');
      expect(formatOrdinalNumber(26, 'lowerLetter')).toBe('z');
      expect(formatOrdinalNumber(1, 'upperLetter')).toBe('A');
      expect(formatOrdinalNumber(26, 'upperLetter')).toBe('Z');
    });
    it('repeats the same letter beyond 26 (spec: 27 -> aa, 52 -> zz, 54 -> BBB)', () => {
      expect(formatOrdinalNumber(27, 'lowerLetter')).toBe('aa');
      expect(formatOrdinalNumber(28, 'lowerLetter')).toBe('bb');
      expect(formatOrdinalNumber(52, 'lowerLetter')).toBe('zz');
      expect(formatOrdinalNumber(53, 'lowerLetter')).toBe('aaa');
      expect(formatOrdinalNumber(54, 'upperLetter')).toBe('BBB');
    });
    it('falls back to decimal for zero and negatives (no letter for 0)', () => {
      expect(formatOrdinalNumber(0, 'upperLetter')).toBe('0');
      expect(formatOrdinalNumber(-3, 'lowerLetter')).toBe('-3');
    });
  });

  describe('unsupported / text formats fall back to decimal', () => {
    it('renders cardinalText, ordinal, none, etc. as decimal (documented residual)', () => {
      // Text-based formats (cardinalText, ordinalText, ...) are NOT implemented;
      // they degrade to Arabic decimal so a page number is never blank.
      expect(formatOrdinalNumber(5, 'cardinalText' as NumberFormat)).toBe('5');
      expect(formatOrdinalNumber(5, 'none' as NumberFormat)).toBe('5');
      expect(formatOrdinalNumber(5, undefined)).toBe('5');
    });
  });
});
