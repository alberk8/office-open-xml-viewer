import { describe, it, expect } from 'vitest';
import { colWidthToPx, rowHeightToPx, pxToColWidth, pxToRowHeight } from './renderer.js';
import { selectionOverlayStyle, zoomStepScale } from './viewer.js';

/**
 * Drag-to-resize (issue #567) stores the user's dragged pixel size back into the
 * worksheet's `colWidths` / `rowHeights` model in its native units (Excel column
 * "characters" for columns, points for rows). `pxToColWidth` / `pxToRowHeight`
 * are the exact inverses of the forward converters the renderer uses, so a
 * column dragged to N px renders back at exactly N px with no drift.
 */
describe('px <-> model-unit round trip (drag-to-resize)', () => {
  for (const mdw of [7, 8, 10, 11]) {
    for (const px of [1, 5, 10, 32, 64, 100, 128, 255, 512]) {
      it(`column ${px}px @ mdw=${mdw} round-trips exactly`, () => {
        expect(colWidthToPx(pxToColWidth(px, mdw), mdw)).toBe(px);
      });
    }
  }

  for (const px of [1, 4, 10, 18, 20, 32, 64, 100, 255]) {
    it(`row ${px}px round-trips exactly`, () => {
      expect(rowHeightToPx(pxToRowHeight(px))).toBe(px);
    });
  }
});

/**
 * The viewer takes a single `selectionColor`; the rectangle border uses it as-is
 * and the fill is the same color made translucent (issue follow-up). The default
 * (`#1a73e8`) must keep the historical Google-blue look.
 */
describe('selectionOverlayStyle', () => {
  it('uses the color verbatim for the border', () => {
    expect(selectionOverlayStyle('red').border).toBe('2px solid red');
    expect(selectionOverlayStyle('#1a73e8').border).toBe('2px solid #1a73e8');
  });

  it('derives a translucent fill from the same color', () => {
    expect(selectionOverlayStyle('#1a73e8').background).toBe(
      'color-mix(in srgb, #1a73e8 8%, transparent)',
    );
    expect(selectionOverlayStyle('rgb(0,128,0)').background).toBe(
      'color-mix(in srgb, rgb(0,128,0) 8%, transparent)',
    );
  });
});

/**
 * Ctrl/⌘ + wheel (and trackpad pinch, which the browser reports as a ctrl-wheel)
 * zoom. The old handler ignored `deltaY` magnitude and added a fixed ±0.1 per
 * event, so a trackpad pinch — which fires a high-frequency stream of small
 * wheel events — zoomed far too fast. `zoomStepScale` makes the step
 * exponential in `deltaY`, so the *total* zoom over a gesture is
 * `exp(-k·Σ deltaY)` and depends only on the total scroll distance, not on how
 * many events the OS splits it into.
 */
describe('zoomStepScale (ctrl/pinch zoom)', () => {
  it('scrolling up / pinching out (deltaY < 0) zooms in', () => {
    expect(zoomStepScale(1, -10)).toBeGreaterThan(1);
  });

  it('scrolling down / pinching in (deltaY > 0) zooms out', () => {
    expect(zoomStepScale(1, 10)).toBeLessThan(1);
  });

  it('honors deltaY magnitude (a bigger delta zooms more)', () => {
    const small = zoomStepScale(1, -2) - 1;
    const big = zoomStepScale(1, -20) - 1;
    expect(big).toBeGreaterThan(small);
  });

  it('is resolution-independent: two small events ≈ one event of their sum', () => {
    const twoSteps = zoomStepScale(zoomStepScale(1, -5), -5);
    const oneStep = zoomStepScale(1, -10);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
  });

  it('is symmetric: zooming in then out by the same delta returns to start', () => {
    expect(zoomStepScale(zoomStepScale(1, -8), 8)).toBeCloseTo(1, 10);
  });

  it('scales relative to the current zoom (multiplicative, not additive)', () => {
    // Same delta from 200% must move proportionally more than from 100%.
    const from1 = zoomStepScale(1, -10) - 1;
    const from2 = zoomStepScale(2, -10) - 2;
    expect(from2).toBeCloseTo(from1 * 2, 10);
  });
});
