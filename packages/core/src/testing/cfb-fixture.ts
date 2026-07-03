/**
 * Synthetic Compound File Binary (CFB / OLE2) builder for tests.
 *
 * Emits a minimal version-3 (512-byte sector) compound file whose FAT lives in
 * sector 0 and whose directory chain starts at sector 1, containing the given
 * directory-entry names. Just enough of [MS-CFB] to drive `sniffCfb` and the
 * `assertNotCfbContainer` load guard — not a general CFB writer.
 *
 * Shared here (rather than duplicated per package) so the docx / pptx / xlsx
 * load-guard tests build their fixtures the same way. Test-only; never imported
 * by production code.
 */

const SECTOR = 512;
const HEADER = 512;
const ENTRY = 128;
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Build a synthetic CFB whose directory contains `names` (entry 0 is treated as
 * the root storage, the rest as streams). The result is an `ArrayBuffer` ready
 * to hand to a `load()` factory.
 */
export function buildCfbFixture(names: string[]): ArrayBuffer {
  const entriesPerSector = SECTOR / ENTRY; // 4
  const dirSectors = Math.max(1, Math.ceil(names.length / entriesPerSector));
  const totalSectors = 1 + dirSectors; // sector 0 = FAT, then directory
  const buf = new ArrayBuffer(HEADER + totalSectors * SECTOR);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Header (§2.2).
  for (let i = 0; i < 8; i++) bytes[i] = SIGNATURE[i];
  view.setUint16(0x18, 0x003e, true); // minor version
  view.setUint16(0x1a, 3, true); // major version 3
  view.setUint16(0x1c, 0xfffe, true); // byte order
  view.setUint16(0x1e, 9, true); // sector shift => 512
  view.setUint16(0x20, 6, true); // mini sector shift
  view.setUint32(0x2c, 1, true); // number of FAT sectors
  view.setUint32(0x30, 1, true); // first directory sector = 1
  view.setUint32(0x38, 0x00001000, true); // mini stream cutoff
  view.setUint32(0x3c, ENDOFCHAIN, true); // first mini FAT
  view.setUint32(0x44, ENDOFCHAIN, true); // first DIFAT
  view.setUint32(0x4c, 0, true); // DIFAT[0] = FAT at sector 0
  for (let i = 1; i < 109; i++) view.setUint32(0x4c + i * 4, FREESECT, true);

  // FAT (logical sector 0): sector 0 is the FAT; directory chain 1..dirSectors.
  const fatOff = HEADER;
  for (let i = 0; i < SECTOR / 4; i++) view.setUint32(fatOff + i * 4, FREESECT, true);
  view.setUint32(fatOff, FATSECT, true);
  for (let s = 1; s <= dirSectors; s++) {
    view.setUint32(fatOff + s * 4, s < dirSectors ? s + 1 : ENDOFCHAIN, true);
  }

  // Directory entries.
  names.forEach((name, idx) => {
    const logicalSector = 1 + Math.floor(idx / entriesPerSector);
    const within = idx % entriesPerSector;
    const off = HEADER + logicalSector * SECTOR + within * ENTRY;
    const units = Math.min(name.length, 31);
    for (let i = 0; i < units; i++) view.setUint16(off + i * 2, name.charCodeAt(i), true);
    view.setUint16(off + 0x40, (units + 1) * 2, true); // name byte length incl. NUL
    view.setUint8(off + 0x42, idx === 0 ? 5 : 2); // root storage (5) / stream (2)
  });

  return buf;
}
