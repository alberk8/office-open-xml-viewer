// ── WMF (Windows Metafile) player ───────────────────────────────────────────
//
// Browsers cannot decode WMF/EMF via `createImageBitmap`, so the renderer falls
// back to this player for metafile blips. It is a *minimal* WMF interpreter:
// just enough to rasterize the vector-graphics metafiles that Office embeds for
// charts and diagrams (e.g. sample-10.docx `word/media/image1.emf`, which —
// despite the `.emf` extension — is a standard non-placeable WMF whose labels
// are POLYPOLYGON glyph outlines, not text-out records).
//
// Format reference: ECMA-376 references WMF/EMF; the byte layout below follows
// the [MS-WMF] Windows Metafile Format spec.
//   - Header: 18 bytes (u16 type, u16 headerSizeWords=9, u16 version, u32
//     fileSizeWords, u16 numObjects, u32 maxRecordWords, u16 numMembers).
//   - Record: u32 recordSizeWords (INCLUDING the 6-byte size+function header,
//     counted in 16-bit words), u16 function, then (recordSizeWords*2 − 6)
//     param bytes. Loop until function==0x0000 (META_EOF) or bytes exhausted.
//   - All values little-endian. COLORREF = u32 0x00BBGGRR (low byte = R).
//
// Implemented records: SETWINDOWORG, SETWINDOWEXT, SETPOLYFILLMODE,
// CREATEPENINDIRECT, CREATEBRUSHINDIRECT, SELECTOBJECT, DELETEOBJECT,
// POLYLINE, POLYGON, POLYPOLYGON, RECTANGLE, EOF.
// Ignored (no-op, skipped by size): ESCAPE, SETROP2, SETBKMODE, SETTEXTALIGN,
// SETSTRETCHBLTMODE, SETMAPMODE, and any unrecognized record.

// WMF record function codes (the subset we act on; others are skipped by size).
const META = {
  EOF: 0x0000,
  SETPOLYFILLMODE: 0x0106,
  SETWINDOWORG: 0x020b,
  SETWINDOWEXT: 0x020c,
  SELECTOBJECT: 0x012d,
  DELETEOBJECT: 0x01f0,
  POLYGON: 0x0324,
  POLYLINE: 0x0325,
  POLYPOLYGON: 0x0538,
  RECTANGLE: 0x041b,
  CREATEPENINDIRECT: 0x02fa,
  CREATEBRUSHINDIRECT: 0x02fc,
} as const;

const PLACEABLE_MAGIC = 0x9ac6cdd7; // little-endian bytes D7 CD C6 9A
const PLACEABLE_HEADER_BYTES = 22;
const WMF_HEADER_BYTES = 18;
const EMF_SIGNATURE = 0x464d4520; // " EMF" (bytes 20 45 4D 46)

// ── detection ───────────────────────────────────────────────────────────────

/** Reads the standard 18-byte WMF header at `off` and validates type∈{1,2} and
 *  headerSize==9 words. */
function looksLikeStandardHeader(b: Uint8Array, off: number): boolean {
  if (b.length < off + WMF_HEADER_BYTES) return false;
  const type = b[off] | (b[off + 1] << 8);
  const headerSize = b[off + 2] | (b[off + 3] << 8);
  return (type === 1 || type === 2) && headerSize === 9;
}

/** True for a placeable (`D7 CD C6 9A`) or standard (type∈{1,2}, headerSize==9)
 *  WMF. A placeable file prepends a 22-byte header before the standard one. */
export function isWmf(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const magic =
    bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  if ((magic >>> 0) === PLACEABLE_MAGIC) {
    // Be lenient: a placeable file is a WMF even if we can't re-validate the
    // inner header (some toolchains emit slightly off inner fields).
    return true;
  }
  return looksLikeStandardHeader(bytes, 0);
}

/** True for a true EMF (ENHMETAHEADER): u32@0 == 1 (EMR_HEADER) AND u32@40 ==
 *  0x464D4520 (" EMF"). True EMF is a different, larger format than WMF.
 *  TODO: EMF (ECMA-376 references it too) is a separate format — follow-up. */
export function isEmf(bytes: Uint8Array): boolean {
  if (bytes.length < 44) return false;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(0, true) === 1 && dv.getUint32(40, true) === EMF_SIGNATURE;
}

// ── color ─────────────────────────────────────────────────────────────────

/** COLORREF (u32 0x00BBGGRR) → CSS `#rrggbb`. */
function colorRefToCss(c: number): string {
  const r = c & 0xff;
  const g = (c >>> 8) & 0xff;
  const b = (c >>> 16) & 0xff;
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// ── object table ─────────────────────────────────────────────────────────

interface Pen {
  kind: 'pen';
  stroke: string | null; // null = PS_NULL (no stroke)
  width: number; // device-independent logical width; mapped to ≥1 device px
}
interface Brush {
  kind: 'brush';
  fill: string | null; // null = BS_NULL / hollow (no fill)
}
type WmfObject = Pen | Brush;

/** Inserts an object at the FIRST free slot (lowest index whose slot is empty
 *  or was deleted), mirroring the WMF object-table allocation rule. */
function insertObject(table: (WmfObject | null)[], obj: WmfObject): void {
  for (let i = 0; i < table.length; i++) {
    if (table[i] == null) {
      table[i] = obj;
      return;
    }
  }
  table.push(obj);
}

// ── little-endian cursor over the param region of one record ───────────────

class Cursor {
  private p = 0;
  constructor(
    private readonly b: Uint8Array,
    private readonly start: number,
    private readonly end: number, // exclusive
  ) {
    this.p = start;
  }
  get remaining(): number {
    return this.end - this.p;
  }
  i16(): number {
    const v = this.u16();
    return v >= 0x8000 ? v - 0x10000 : v;
  }
  u16(): number {
    const v = this.b[this.p] | (this.b[this.p + 1] << 8);
    this.p += 2;
    return v;
  }
  u32(): number {
    const v =
      (this.b[this.p] |
        (this.b[this.p + 1] << 8) |
        (this.b[this.p + 2] << 16) |
        (this.b[this.p + 3] << 24)) >>>
      0;
    this.p += 4;
    return v;
  }
}

// ── any 2D context we can replay onto (Offscreen or HTMLCanvas) ─────────────

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface PlayState {
  ctx: AnyCtx;
  W: number;
  H: number;
  // window mapping
  orgX: number;
  orgY: number;
  extX: number;
  extY: number;
  haveExt: boolean;
  // GDI state
  objects: (WmfObject | null)[];
  curPen: Pen | null;
  curBrush: Brush | null;
  fillRule: CanvasFillRule; // from SETPOLYFILLMODE
  drew: boolean;
}

/** logical → device along X. */
function mapX(s: PlayState, x: number): number {
  return (x - s.orgX) * (s.W / s.extX);
}
/** logical → device along Y. */
function mapY(s: PlayState, y: number): number {
  return (y - s.orgY) * (s.H / s.extY);
}

/** Device line width: scale the logical pen width by |W/extX| and clamp to ≥1
 *  so hairlines stay visible after mapping. */
function deviceLineWidth(s: PlayState, logicalWidth: number): number {
  const scale = Math.abs(s.W / s.extX);
  const w = logicalWidth * scale;
  return w >= 1 ? w : 1;
}

// ── per-record handlers ─────────────────────────────────────────────────────

function readPoints(s: PlayState, c: Cursor, count: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    if (c.remaining < 4) break; // malformed; bail with what we have
    const x = c.i16();
    const y = c.i16();
    pts.push([mapX(s, x), mapY(s, y)]);
  }
  return pts;
}

function strokePolyline(s: PlayState, pts: Array<[number, number]>): void {
  if (pts.length < 2 || !s.curPen || s.curPen.stroke == null) return;
  const { ctx } = s;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = s.curPen.stroke;
  ctx.lineWidth = deviceLineWidth(s, s.curPen.width);
  ctx.stroke();
  s.drew = true;
}

/** Fill (current brush) + stroke (current pen) a single closed polygon. */
function fillStrokePolygon(s: PlayState, pts: Array<[number, number]>): void {
  if (pts.length < 2) return;
  const { ctx } = s;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (s.curBrush && s.curBrush.fill != null) {
    ctx.fillStyle = s.curBrush.fill;
    ctx.fill(s.fillRule);
    s.drew = true;
  }
  if (s.curPen && s.curPen.stroke != null) {
    ctx.strokeStyle = s.curPen.stroke;
    ctx.lineWidth = deviceLineWidth(s, s.curPen.width);
    ctx.stroke();
    s.drew = true;
  }
}

/** POLYPOLYGON: one path spanning every sub-polygon so the fill rule applies
 *  across them as a unit (correct glyph holes). */
function fillStrokePolyPolygon(s: PlayState, c: Cursor): void {
  const numPolys = c.u16();
  if (numPolys <= 0 || numPolys > 0x10000) return;
  const counts: number[] = [];
  for (let i = 0; i < numPolys; i++) {
    if (c.remaining < 2) return;
    counts.push(c.u16());
  }
  const { ctx } = s;
  ctx.beginPath();
  let any = false;
  for (const count of counts) {
    if (count < 2) {
      // still consume this sub-poly's points to stay aligned
      for (let i = 0; i < count && c.remaining >= 4; i++) {
        c.i16();
        c.i16();
      }
      continue;
    }
    const pts = readPoints(s, c, count);
    if (pts.length < 2) continue;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    any = true;
  }
  if (!any) return;
  if (s.curBrush && s.curBrush.fill != null) {
    ctx.fillStyle = s.curBrush.fill;
    ctx.fill(s.fillRule);
    s.drew = true;
  }
  if (s.curPen && s.curPen.stroke != null) {
    ctx.strokeStyle = s.curPen.stroke;
    ctx.lineWidth = deviceLineWidth(s, s.curPen.width);
    ctx.stroke();
    s.drew = true;
  }
}

function createPen(c: Cursor): Pen {
  const style = c.u16();
  const widthX = c.i16();
  c.i16(); // widthY (unused — WMF pens are isotropic in practice)
  const color = c.u32();
  const lowStyle = style & 0xff;
  // PS_NULL (5) → no stroke. Dash/dot styles (1..4) are rendered solid (we do
  // not synthesize a dash pattern); see module note.
  const stroke = lowStyle === 5 ? null : colorRefToCss(color);
  return { kind: 'pen', stroke, width: Math.abs(widthX) };
}

function createBrush(c: Cursor): Brush {
  const style = c.u16();
  const color = c.u32();
  c.u16(); // hatch (HATCHED brushes are rendered as solid fills)
  // BS_NULL / BS_HOLLOW (1) → no fill. SOLID (0) and HATCHED (2) fill solid.
  const fill = style === 1 ? null : colorRefToCss(color);
  return { kind: 'brush', fill };
}

// ── core record-replay loop (pure; testable with a mock ctx) ────────────────

/**
 * Replay a WMF byte buffer onto a 2D context, mapping logical coordinates to a
 * `W`×`H` device space. Returns `true` if anything was drawn, `false` for a
 * non-WMF buffer or a metafile that produced no geometry.
 *
 * Pure with respect to the injected `ctx`, so it is unit-testable against a
 * recording mock — no OffscreenCanvas required.
 */
export function playWmf(bytes: Uint8Array, ctx: AnyCtx, W: number, H: number): boolean {
  if (!isWmf(bytes)) return false;

  // Skip the placeable header if present, then the 18-byte standard header.
  let base = 0;
  const magic =
    bytes.length >= 4
      ? (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0
      : 0;
  if (magic === PLACEABLE_MAGIC) base = PLACEABLE_HEADER_BYTES;
  let pos = base + WMF_HEADER_BYTES;
  if (pos > bytes.length) return false;

  const s: PlayState = {
    ctx,
    W,
    H,
    orgX: 0,
    orgY: 0,
    extX: W || 1,
    extY: H || 1,
    haveExt: false,
    objects: [],
    curPen: null,
    curBrush: null,
    fillRule: 'nonzero',
    drew: false,
  };

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (pos + 6 <= bytes.length) {
    const sizeWords = dv.getUint32(pos, true);
    const fn = dv.getUint16(pos + 4, true);
    // Validate: a record is ≥3 words (u32 size + u16 fn) and in-bounds.
    if (sizeWords < 3) break;
    const recordBytes = sizeWords * 2;
    const recEnd = pos + recordBytes;
    if (recEnd > bytes.length) break; // truncated/malformed → partial render
    if (fn === META.EOF) break;

    const paramStart = pos + 6;
    const c = new Cursor(bytes, paramStart, recEnd);

    switch (fn) {
      case META.SETWINDOWORG: {
        // params: i16 yOrg, i16 xOrg (Y FIRST)
        s.orgY = c.i16();
        s.orgX = c.i16();
        break;
      }
      case META.SETWINDOWEXT: {
        // params: i16 yExt, i16 xExt (Y FIRST)
        const yExt = c.i16();
        const xExt = c.i16();
        s.extY = yExt || 1;
        s.extX = xExt || 1;
        s.haveExt = true;
        break;
      }
      case META.SETPOLYFILLMODE: {
        const mode = c.u16(); // 1=ALTERNATE→evenodd, 2=WINDING→nonzero
        s.fillRule = mode === 1 ? 'evenodd' : 'nonzero';
        break;
      }
      case META.CREATEPENINDIRECT: {
        insertObject(s.objects, createPen(c));
        break;
      }
      case META.CREATEBRUSHINDIRECT: {
        insertObject(s.objects, createBrush(c));
        break;
      }
      case META.SELECTOBJECT: {
        const idx = c.u16();
        const obj = s.objects[idx];
        if (obj?.kind === 'pen') s.curPen = obj;
        else if (obj?.kind === 'brush') s.curBrush = obj;
        break;
      }
      case META.DELETEOBJECT: {
        const idx = c.u16();
        const obj = s.objects[idx];
        if (obj) {
          if (obj === s.curPen) s.curPen = null;
          if (obj === s.curBrush) s.curBrush = null;
          s.objects[idx] = null;
        }
        break;
      }
      case META.POLYLINE: {
        const count = c.i16();
        strokePolyline(s, readPoints(s, c, count));
        break;
      }
      case META.POLYGON: {
        const count = c.i16();
        fillStrokePolygon(s, readPoints(s, c, count));
        break;
      }
      case META.POLYPOLYGON: {
        fillStrokePolyPolygon(s, c);
        break;
      }
      case META.RECTANGLE: {
        // params: i16 bottom, i16 right, i16 top, i16 left
        const bottom = c.i16();
        const right = c.i16();
        const top = c.i16();
        const left = c.i16();
        fillStrokePolygon(s, [
          [mapX(s, left), mapY(s, top)],
          [mapX(s, right), mapY(s, top)],
          [mapX(s, right), mapY(s, bottom)],
          [mapX(s, left), mapY(s, bottom)],
        ]);
        break;
      }
      default:
        // ESCAPE, SETROP2, SETBKMODE, SETTEXTALIGN, SETSTRETCHBLTMODE,
        // SETMAPMODE, and anything unrecognized: skip by record size.
        break;
    }

    pos = recEnd;
  }

  return s.drew;
}

// ── async OffscreenCanvas wrapper ───────────────────────────────────────────

/**
 * Rasterize a WMF metafile to an `ImageBitmap` of `targetW`×`targetH`, replaying
 * onto an `OffscreenCanvas` 2D context. Returns `null` if the bytes are not a
 * parseable WMF or nothing drew (so the caller can fall back to the existing
 * "missing image" behavior without crashing).
 */
export async function renderWmfToBitmap(
  bytes: Uint8Array,
  targetW: number,
  targetH: number,
): Promise<ImageBitmap | null> {
  if (!isWmf(bytes)) return null;
  if (targetW <= 0 || targetH <= 0) return null;
  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const drew = playWmf(bytes, ctx, targetW, targetH);
  if (!drew) return null;
  return createImageBitmap(canvas);
}
