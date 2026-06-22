import { describe, expect, it } from 'vitest';
import { DOCX_GOOGLE_FONTS, docxFontPreloadNames } from './google-fonts.js';
import type { DocxDocumentModel } from './types.js';

/** Build a minimal model whose body is a single paragraph with one text run. */
function docWith(text: string, major = 'Calibri', minor = 'Calibri'): DocxDocumentModel {
  return {
    section: {} as DocxDocumentModel['section'],
    headers: { default: null, first: null, even: null },
    footers: { default: null, first: null, even: null },
    majorFont: major,
    minorFont: minor,
    body: [
      {
        type: 'paragraph',
        runs: [{ type: 'text', text } as never],
      } as never,
    ],
  } as DocxDocumentModel;
}

describe('docxFontPreloadNames — script-aware preload', () => {
  it('pure-Latin doc preloads ONLY the theme fonts (no CJK / script faces)', () => {
    const names = docxFontPreloadNames(docWith('Hello, world.'));
    expect(names).toEqual(['Calibri', 'Calibri']);
    // The expensive CJK faces must NOT be queued for a Latin document.
    expect(names).not.toContain('Noto Sans JP');
    expect(names).not.toContain('Noto Sans KR');
    expect(names).not.toContain('Noto Naskh Arabic');
  });

  it('Japanese doc preloads the JP Noto faces', () => {
    const names = docxFontPreloadNames(docWith('こんにちは世界'));
    expect(names).toContain('Noto Sans JP');
    expect(names).toContain('Noto Serif JP');
    expect(names).not.toContain('Noto Sans KR');
  });

  it('Han with a Korean theme font uses the kr lang hint', () => {
    const names = docxFontPreloadNames(docWith('漢字', 'Malgun Gothic', 'Malgun Gothic'));
    expect(names).toContain('Noto Sans KR');
    expect(names).not.toContain('Noto Sans JP');
  });

  it('is deterministic — same model yields the same set (main == worker)', () => {
    const doc = docWith('日本語 العربية');
    expect(docxFontPreloadNames(doc)).toEqual(docxFontPreloadNames(doc));
  });
});

describe('DOCX_GOOGLE_FONTS — theme typeface coverage', () => {
  // Templates whose theme minorFont is Ubuntu (e.g. sample-11) emit runs with
  // family "Ubuntu". Without an explicit mapping the preloader skips the name
  // and the renderer falls back to a system sans whose metrics are narrower
  // than Ubuntu's — table cells sized against the Ubuntu width then fail to
  // wrap where Word would. The map entry resolves Ubuntu against Google Fonts
  // so the canvas measures glyphs with the actual face.
  it('resolves Ubuntu to a Google Fonts Ubuntu stylesheet', () => {
    const entry = DOCX_GOOGLE_FONTS['ubuntu'];
    expect(entry).toBeDefined();
    expect(entry.url).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
    expect(entry.url).toMatch(/family=Ubuntu(?:[:&]|$)/);
    // No loadFamily override — Google Fonts ships the same family name, so
    // the renderer's canvas font stack can use "Ubuntu" directly.
    expect(entry.loadFamily).toBeUndefined();
  });

  it('includes Ubuntu in the preload list when the theme minorFont is Ubuntu', () => {
    const names = docxFontPreloadNames(docWith('City or Town', 'Calibri', 'Ubuntu'));
    expect(names).toContain('Ubuntu');
  });
});
