// Public API of the bidirectional-text (UAX#9) module. Renderers import only
// from here.

export { REMOVED_LEVEL } from './types.js';
export type {
  BaseDirection,
  BidiClass,
  BidiLevels,
  StyledRun,
  VisualSegment,
  SegmentPart,
} from './types.js';

export type { BidiEngine } from './engine.js';
export {
  getDefaultBidiEngine,
  setBidiEngine,
  resetBidiEngine,
} from './engine.js';

export { toVisualSegments, resolveBaseDirection } from './segments.js';

// Shared per-line SEGMENT-ordering building blocks for the docx/pptx/xlsx
// renderers' `bidi-line.ts` wrappers (the strong-RTL gate, the neutral object
// placeholder, and the UAX#9 L2 back half). Format-specific parts stay in each
// wrapper.
export {
  RTL_GATE,
  hasStrongRtl,
  OBJECT_PLACEHOLDER,
  buildVisualOrder,
} from './line-order.js';
