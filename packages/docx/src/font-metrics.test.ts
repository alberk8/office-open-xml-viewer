import { describe, it, expect } from 'vitest';
import { fontWinLineHeightRatio, intendedSingleLinePx } from './font-metrics.js';

describe('fontWinLineHeightRatio', () => {
  it('returns Meiryo / Meiryo UI win line-height ratio (≈1.60 em)', () => {
    expect(fontWinLineHeightRatio('Meiryo UI')).toBe(1.6);
    expect(fontWinLineHeightRatio('Meiryo')).toBe(1.6);
    expect(fontWinLineHeightRatio('メイリオ')).toBe(1.6);
  });
  it('is case-insensitive', () => {
    expect(fontWinLineHeightRatio('meiryo ui')).toBe(1.6);
    expect(fontWinLineHeightRatio('MEIRYO')).toBe(1.6);
  });
  it('returns null for untabled fonts (Latin / unknown / null)', () => {
    // Latin fonts are intentionally absent — their win ratio (~1.15–1.22) is
    // close to the browser fallback, so no correction is needed.
    expect(fontWinLineHeightRatio('Arial')).toBeNull();
    expect(fontWinLineHeightRatio('Calibri')).toBeNull();
    expect(fontWinLineHeightRatio('Arial Nova')).toBeNull();
    expect(fontWinLineHeightRatio(null)).toBeNull();
    expect(fontWinLineHeightRatio(undefined)).toBeNull();
    expect(fontWinLineHeightRatio('')).toBeNull();
  });
});

describe('intendedSingleLinePx', () => {
  it('scales the ratio by the em size (px)', () => {
    // 48 pt title at deviceScaleFactor 2 → em = 96 px → 1.6 × 96 = 153.6.
    expect(intendedSingleLinePx('Meiryo UI', 96)).toBeCloseTo(153.6, 5);
    // Single-spaced 9 pt body at scale 2 → em = 18 px → 1.6 × 18 = 28.8.
    expect(intendedSingleLinePx('Meiryo UI', 18)).toBeCloseTo(28.8, 5);
  });
  it('returns 0 (no-op sentinel) for untabled fonts', () => {
    expect(intendedSingleLinePx('Arial', 96)).toBe(0);
    expect(intendedSingleLinePx(null, 96)).toBe(0);
  });
});
