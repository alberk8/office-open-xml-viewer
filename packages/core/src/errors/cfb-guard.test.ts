import { describe, it, expect } from 'vitest';
import { assertNotCfbContainer } from './cfb-guard';
import { OoxmlError } from './ooxml-error';

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Build a tiny CFB whose single directory sector contains the given entries.
 *  Mirrors the builder in cfb-sniff.test.ts but inline + minimal. */
function cfbWith(names: string[]): Uint8Array {
  const SECTOR = 512;
  const HEADER = 512;
  const ENTRY = 128;
  const FREESECT = 0xffffffff;
  const ENDOFCHAIN = 0xfffffffe;
  const FATSECT = 0xfffffffd;
  const buf = new ArrayBuffer(HEADER + 2 * SECTOR);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < 8; i++) bytes[i] = SIGNATURE[i];
  view.setUint16(0x1a, 3, true); // major version
  view.setUint16(0x1e, 9, true); // sector shift => 512
  view.setUint16(0x20, 6, true);
  view.setUint32(0x2c, 1, true); // FAT sectors
  view.setUint32(0x30, 1, true); // first dir sector = 1
  view.setUint32(0x3c, ENDOFCHAIN, true);
  view.setUint32(0x44, ENDOFCHAIN, true);
  view.setUint32(0x4c, 0, true); // DIFAT[0] = FAT at sector 0
  for (let i = 1; i < 109; i++) view.setUint32(0x4c + i * 4, FREESECT, true);
  const fatOff = HEADER;
  for (let i = 0; i < SECTOR / 4; i++) view.setUint32(fatOff + i * 4, FREESECT, true);
  view.setUint32(fatOff, FATSECT, true);
  view.setUint32(fatOff + 4, ENDOFCHAIN, true); // dir sector 1 ends the chain
  names.forEach((name, idx) => {
    const off = HEADER + 1 * SECTOR + idx * ENTRY;
    const units = Math.min(name.length, 31);
    for (let i = 0; i < units; i++) view.setUint16(off + i * 2, name.charCodeAt(i), true);
    view.setUint16(off + 0x40, (units + 1) * 2, true);
    view.setUint8(off + 0x42, idx === 0 ? 5 : 2);
  });
  return bytes;
}

describe('assertNotCfbContainer', () => {
  it('does nothing for a non-CFB (ZIP) buffer', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(() => assertNotCfbContainer(zip)).not.toThrow();
  });

  it('throws OoxmlError code "encrypted" for an EncryptionInfo CFB', () => {
    const cfb = cfbWith(['Root Entry', 'EncryptionInfo']);
    expect(() => assertNotCfbContainer(cfb)).toThrow(OoxmlError);
    try {
      assertNotCfbContainer(cfb);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OoxmlError);
      expect((e as OoxmlError).code).toBe('encrypted');
      expect((e as OoxmlError).message).toMatch(/password-protected/i);
    }
  });

  it('throws OoxmlError code "legacy-binary-format" for a WordDocument CFB', () => {
    const cfb = cfbWith(['Root Entry', 'WordDocument']);
    try {
      assertNotCfbContainer(cfb);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OoxmlError);
      expect((e as OoxmlError).code).toBe('legacy-binary-format');
      expect((e as OoxmlError).message).toMatch(/legacy binary/i);
    }
  });

  it('throws OoxmlError code "not-ooxml" for an unrecognised CFB', () => {
    const cfb = cfbWith(['Root Entry', 'Mystery']);
    try {
      assertNotCfbContainer(cfb);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OoxmlError);
      expect((e as OoxmlError).code).toBe('not-ooxml');
    }
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const cfb = cfbWith(['Root Entry', 'EncryptionInfo']);
    // Copy into a fresh, definitely-ArrayBuffer to exercise the ArrayBuffer arm.
    const ab = new ArrayBuffer(cfb.byteLength);
    new Uint8Array(ab).set(cfb);
    expect(() => assertNotCfbContainer(ab)).toThrow(OoxmlError);
  });
});
