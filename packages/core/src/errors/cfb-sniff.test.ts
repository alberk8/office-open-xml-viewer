import { describe, it, expect } from 'vitest';
import { sniffCfb } from './cfb-sniff';

/**
 * Minimal synthetic-CFB builder for the sniffer tests. Emits a version-3
 * (512-byte sector) compound file whose FAT lives in sector 0 and whose
 * directory chain starts at sector 1. Enough of [MS-CFB] to exercise the
 * header parse, the FAT-walked directory chain, and the directory-entry name
 * enumeration — not a general CFB writer.
 */
const SECTOR = 512;
const HEADER = 512;
const ENTRY = 128; // directory entry size
const ENTRIES_PER_SECTOR = SECTOR / ENTRY; // 4
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

interface DirEntry {
  /** UTF-16 stream / storage name (without the trailing NUL the format stores). */
  name: string;
  /** 0 unknown, 1 storage, 2 stream, 5 root. Defaults to 2 (stream). */
  objType?: number;
}

interface BuildOpts {
  entries: DirEntry[];
  /** Sector size power-of-two shift. Default 9 (512). */
  sectorShift?: number;
  /** Major version. Default 3. */
  majorVersion?: number;
  /** Override first directory sector location (to point it out of range). */
  firstDirSector?: number;
}

/** Write a directory entry's 128 bytes into `view` at `off`. */
function writeEntry(view: DataView, off: number, e: DirEntry): void {
  const name = e.name;
  // Name: UTF-16LE, up to 32 code units (64 bytes) incl. terminator.
  const units = Math.min(name.length, 31);
  for (let i = 0; i < units; i++) {
    view.setUint16(off + i * 2, name.charCodeAt(i), true);
  }
  // Terminator NUL is already zero. Name length in BYTES incl. terminator.
  view.setUint16(off + 0x40, (units + 1) * 2, true);
  view.setUint8(off + 0x42, e.objType ?? 2); // object type
  view.setUint8(off + 0x43, 0); // color flag
  // Left/right/child sibling + CLSID left as 0 — the sniffer walks the
  // directory sequentially, not the red-black tree, so links are unused.
}

function buildCfb(opts: BuildOpts): Uint8Array {
  const sectorShift = opts.sectorShift ?? 9;
  const sectorSize = 1 << sectorShift;
  const major = opts.majorVersion ?? 3;
  const entries = opts.entries;

  // Directory chain sectors needed (starting at logical sector 1).
  const dirSectors = Math.max(1, Math.ceil(entries.length / (sectorSize / ENTRY)));
  // Layout: sector 0 = FAT, sectors 1..dirSectors = directory chain.
  const totalSectors = 1 + dirSectors;
  const size = HEADER + totalSectors * sectorSize;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // --- Header ---
  for (let i = 0; i < 8; i++) bytes[i] = SIGNATURE[i];
  view.setUint16(0x18, 0x003e, true); // minor version
  view.setUint16(0x1a, major, true); // major version
  view.setUint16(0x1c, 0xfffe, true); // byte order
  view.setUint16(0x1e, sectorShift, true); // sector shift
  view.setUint16(0x20, 6, true); // mini sector shift
  view.setUint32(0x28, major >= 4 ? dirSectors : 0, true); // number of directory sectors
  view.setUint32(0x2c, 1, true); // number of FAT sectors
  view.setUint32(0x30, opts.firstDirSector ?? 1, true); // first directory sector location
  view.setUint32(0x38, 0x00001000, true); // mini stream cutoff
  view.setUint32(0x3c, ENDOFCHAIN, true); // first mini FAT sector
  view.setUint32(0x40, 0, true); // number of mini FAT sectors
  view.setUint32(0x44, ENDOFCHAIN, true); // first DIFAT sector
  view.setUint32(0x48, 0, true); // number of DIFAT sectors
  // DIFAT[0] = FAT sector location (logical sector 0). Rest FREESECT.
  view.setUint32(0x4c, 0, true);
  for (let i = 1; i < 109; i++) view.setUint32(0x4c + i * 4, FREESECT, true);

  // --- FAT (logical sector 0) ---
  const fatOff = HEADER + 0 * sectorSize;
  const fatEntries = sectorSize / 4;
  for (let i = 0; i < fatEntries; i++) view.setUint32(fatOff + i * 4, FREESECT, true);
  view.setUint32(fatOff + 0 * 4, FATSECT, true); // sector 0 is the FAT
  // Directory chain 1 -> 2 -> ... -> ENDOFCHAIN.
  for (let s = 1; s <= dirSectors; s++) {
    const next = s < dirSectors ? s + 1 : ENDOFCHAIN;
    view.setUint32(fatOff + s * 4, next, true);
  }

  // --- Directory entries (logical sectors 1..dirSectors) ---
  for (let idx = 0; idx < entries.length; idx++) {
    const logicalSector = 1 + Math.floor(idx / (sectorSize / ENTRY));
    const within = idx % (sectorSize / ENTRY);
    const off = HEADER + logicalSector * sectorSize + within * ENTRY;
    writeEntry(view, off, entries[idx]);
  }
  void ENTRIES_PER_SECTOR;

  return bytes;
}

/** A well-formed encrypted-OOXML CFB (has an EncryptionInfo stream). */
function encryptedCfb(): Uint8Array {
  return buildCfb({
    entries: [
      { name: 'Root Entry', objType: 5 },
      { name: 'EncryptionInfo', objType: 2 },
      { name: 'EncryptedPackage', objType: 2 },
    ],
  });
}

describe('sniffCfb — signature', () => {
  it('returns null for non-CFB bytes (ZIP magic)', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]);
    expect(sniffCfb(zip)).toBeNull();
  });

  it('returns null for an empty / too-short buffer', () => {
    expect(sniffCfb(new Uint8Array(0))).toBeNull();
    expect(sniffCfb(new Uint8Array([0xd0, 0xcf, 0x11]))).toBeNull();
  });

  it('returns null when only the signature is present but header is truncated', () => {
    const short = new Uint8Array(16);
    short.set(SIGNATURE);
    expect(sniffCfb(short)).toBeNull();
  });
});

describe('sniffCfb — classification', () => {
  it('detects an encrypted OOXML container (EncryptionInfo stream)', () => {
    expect(sniffCfb(encryptedCfb())).toBe('encrypted');
  });

  it('detects a legacy Word binary (.doc, WordDocument stream)', () => {
    const cfb = buildCfb({
      entries: [
        { name: 'Root Entry', objType: 5 },
        { name: 'WordDocument', objType: 2 },
        { name: '1Table', objType: 2 },
      ],
    });
    expect(sniffCfb(cfb)).toBe('legacy-binary-format');
  });

  it('detects a legacy Excel binary (.xls, Workbook stream)', () => {
    const cfb = buildCfb({
      entries: [
        { name: 'Root Entry', objType: 5 },
        { name: 'Workbook', objType: 2 },
      ],
    });
    expect(sniffCfb(cfb)).toBe('legacy-binary-format');
  });

  it('detects the older Excel "Book" stream as legacy', () => {
    const cfb = buildCfb({
      entries: [
        { name: 'Root Entry', objType: 5 },
        { name: 'Book', objType: 2 },
      ],
    });
    expect(sniffCfb(cfb)).toBe('legacy-binary-format');
  });

  it('detects a legacy PowerPoint binary (.ppt, PowerPoint Document stream)', () => {
    const cfb = buildCfb({
      entries: [
        { name: 'Root Entry', objType: 5 },
        { name: 'PowerPoint Document', objType: 2 },
      ],
    });
    expect(sniffCfb(cfb)).toBe('legacy-binary-format');
  });

  it('prefers "encrypted" when both EncryptionInfo and a legacy stream appear', () => {
    // Encryption should win: an encrypted .doc is still handled by the crypto
    // path in the next PR, not the legacy-binary dead-end.
    const cfb = buildCfb({
      entries: [
        { name: 'Root Entry', objType: 5 },
        { name: 'WordDocument', objType: 2 },
        { name: 'EncryptionInfo', objType: 2 },
      ],
    });
    expect(sniffCfb(cfb)).toBe('encrypted');
  });

  it('returns "cfb-unknown" for a CFB with no recognised stream', () => {
    const cfb = buildCfb({
      entries: [
        { name: 'Root Entry', objType: 5 },
        { name: 'SomeOtherStream', objType: 2 },
      ],
    });
    expect(sniffCfb(cfb)).toBe('cfb-unknown');
  });

  it('spans a multi-sector directory chain to find a stream in the 2nd sector', () => {
    // 4 entries per 512-byte sector; put the marker as the 5th entry so it only
    // resolves if the FAT chain walk advances to the 2nd directory sector.
    const filler: DirEntry[] = [
      { name: 'Root Entry', objType: 5 },
      { name: 'a', objType: 2 },
      { name: 'b', objType: 2 },
      { name: 'c', objType: 2 },
      { name: 'EncryptionInfo', objType: 2 },
    ];
    expect(sniffCfb(buildCfb({ entries: filler }))).toBe('encrypted');
  });
});

describe('sniffCfb — robustness (malicious / corrupt input)', () => {
  it('returns "cfb-unknown" when the sector shift is absurd (out-of-range read)', () => {
    // sectorShift 30 => 1 GiB sectors; the directory sector is far past EOF.
    const cfb = buildCfb({ entries: [{ name: 'Root Entry', objType: 5 }] });
    // Overwrite the sector shift in the finished buffer.
    new DataView(cfb.buffer).setUint16(0x1e, 30, true);
    expect(sniffCfb(cfb)).toBe('cfb-unknown');
  });

  it('returns "cfb-unknown" when the first directory sector points past EOF', () => {
    const cfb = buildCfb({
      entries: [{ name: 'Root Entry', objType: 5 }],
      firstDirSector: 9999,
    });
    expect(sniffCfb(cfb)).toBe('cfb-unknown');
  });

  it('does not hang on a cyclic FAT directory chain (returns a value)', () => {
    // Build a normal encrypted CFB, then corrupt the FAT so sector 1 -> 1.
    const cfb = encryptedCfb();
    const view = new DataView(cfb.buffer);
    const fatOff = HEADER + 0 * SECTOR;
    view.setUint32(fatOff + 1 * 4, 1, true); // self-cycle at sector 1
    // Must terminate. The marker is in sector 1, so it is still found before
    // the cycle guard trips; the point is that it returns rather than looping.
    const result = sniffCfb(cfb);
    expect(['encrypted', 'cfb-unknown']).toContain(result);
  });

  it('does not hang when every directory sector points forward in a long cycle', () => {
    // A cycle that does NOT contain a recognised stream must still terminate.
    const cfb = buildCfb({
      entries: [
        { name: 'Root Entry', objType: 5 },
        { name: 'x', objType: 2 },
        { name: 'y', objType: 2 },
        { name: 'z', objType: 2 },
        { name: 'nothing', objType: 2 },
      ],
    });
    const view = new DataView(cfb.buffer);
    const fatOff = HEADER + 0 * SECTOR;
    // dir chain is sectors 1..2; make sector 2 loop back to 1.
    view.setUint32(fatOff + 2 * 4, 1, true);
    const result = sniffCfb(cfb);
    // No recognised stream anywhere -> cfb-unknown, and it must return.
    expect(result).toBe('cfb-unknown');
  });

  it('handles a signature-only buffer padded to header length as cfb-unknown or null', () => {
    const buf = new Uint8Array(HEADER);
    buf.set(SIGNATURE);
    // No valid sector shift / all-zero header. A zero sector shift => 1-byte
    // sectors; the walk should bail to cfb-unknown, never throw.
    const result = sniffCfb(buf);
    expect(result === 'cfb-unknown' || result === null).toBe(true);
  });
});
