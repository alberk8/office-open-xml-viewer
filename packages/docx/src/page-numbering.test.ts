import { describe, it, expect } from 'vitest';
import { computePageNumbering } from './page-numbering';
import type { PaginatedBodyElement, PageNumType } from './types';

// Build one physical page carrying a section identity + its pgNumType. The
// paginator stamps `sectionHF` (a SINGLE object reference SHARED across all pages
// of one section — object identity is how a section boundary is detected) and
// `sectionPageNumType` on each element; the numbering layer reads only those, so a
// single stub element per page is sufficient. `sectionId` must therefore be the
// SAME object for every page of the same section (mirroring `currentSectionHF`).
function page(sectionId: object, pgNum: PageNumType | null): PaginatedBodyElement[] {
  const el = {
    type: 'paragraph',
    // Use `sectionId` itself as the identity object the numbering layer compares.
    sectionHF: sectionId as unknown,
    sectionPageNumType: pgNum,
  } as unknown as PaginatedBodyElement;
  return [el];
}

describe('computePageNumbering — ECMA-376 §17.6.12', () => {
  it('single section without pgNumType numbers 1..N in decimal (unchanged behaviour)', () => {
    const s = {};
    const pages = [page(s, null), page(s, null), page(s, null)];
    expect(computePageNumbering(pages)).toEqual([
      { displayNumber: 1, format: 'decimal' },
      { displayNumber: 2, format: 'decimal' },
      { displayNumber: 3, format: 'decimal' },
    ]);
  });

  it('start=1 on the first section is the identity (matches physical numbers)', () => {
    const s = {};
    const pages = [page(s, { start: 1 }), page(s, null), page(s, null)];
    expect(computePageNumbering(pages).map((n) => n.displayNumber)).toEqual([1, 2, 3]);
  });

  it('start=0 offsets the whole document (physical page 1 shows 0)', () => {
    const s = {};
    const pages = [page(s, { start: 0 }), page(s, null), page(s, null)];
    expect(computePageNumbering(pages).map((n) => n.displayNumber)).toEqual([0, 1, 2]);
  });

  it('start=25 offsets numbering to begin at 25', () => {
    const s = {};
    const pages = [page(s, { start: 25 }), page(s, null)];
    expect(computePageNumbering(pages).map((n) => n.displayNumber)).toEqual([25, 26]);
  });

  it('restarts the counter when a NEW section (page break) declares w:start', () => {
    // Front matter (2 pages, lowerRoman, start=1) then body (restart decimal from 1).
    // Every page of a section carries that section's pgNumType (the paginator stamps
    // `currentSectionPageNumType` on EVERY element, not only the section's first).
    const front = {};
    const body = {};
    const frontNum: PageNumType = { start: 1, fmt: 'lowerRoman' };
    const bodyNum: PageNumType = { start: 1, fmt: 'decimal' };
    const pages = [
      page(front, frontNum),
      page(front, frontNum),
      page(body, bodyNum),
      page(body, bodyNum),
    ];
    expect(computePageNumbering(pages)).toEqual([
      { displayNumber: 1, format: 'lowerRoman' },
      { displayNumber: 2, format: 'lowerRoman' },
      { displayNumber: 1, format: 'decimal' },
      { displayNumber: 2, format: 'decimal' },
    ]);
  });

  it('a new section WITHOUT w:start continues numbering from the previous section', () => {
    const s1 = {};
    const s2 = {};
    const pages = [page(s1, { start: 5 }), page(s1, null), page(s2, null), page(s2, null)];
    // 5, 6 in s1; s2 has no start so it continues 7, 8.
    expect(computePageNumbering(pages).map((n) => n.displayNumber)).toEqual([5, 6, 7, 8]);
  });

  it('applies each section format independently; absent fmt is decimal (not inherited)', () => {
    const s1 = {};
    const s2 = {};
    const s3 = {};
    const pages = [
      page(s1, { fmt: 'lowerRoman' }),
      page(s2, { start: 1 }), // no fmt ⇒ decimal, not roman
      page(s3, { fmt: 'upperLetter', start: 1 }),
    ];
    expect(computePageNumbering(pages)).toEqual([
      { displayNumber: 1, format: 'lowerRoman' },
      { displayNumber: 1, format: 'decimal' },
      { displayNumber: 1, format: 'upperLetter' },
    ]);
  });

  it('does NOT restart mid-page: a continuous section sharing a page keeps its number', () => {
    // The paginator puts the continuous section's content on the SAME page as the
    // preceding section, so the page's FIRST element still belongs to the preceding
    // section — its stamped start is not observed at a page boundary.
    const s1 = {};
    const pages = [
      page(s1, null), // page 1: first element belongs to s1 (even if s2 continues below)
      page(s1, null),
    ];
    expect(computePageNumbering(pages).map((n) => n.displayNumber)).toEqual([1, 2]);
  });

  it('handles an empty page (no stamped element) as a decimal continuation', () => {
    const s = {};
    const pages = [page(s, { start: 3 }), [] as PaginatedBodyElement[], page(s, null)];
    // page 2 empty ⇒ continues 4; page 3 continues 5.
    expect(computePageNumbering(pages).map((n) => n.displayNumber)).toEqual([3, 4, 5]);
  });

  // Non-regression: sample-13's real shape. break[0] is nextPage with start=1
  // (the FIRST section ⇒ physical page 1, identity), and a later continuous
  // section carries start=2 but shares a page with the preceding section, so its
  // restart is never observed at a page boundary. Word's PDF shows sequential
  // 1,2,3,4,5; the numbering layer must reproduce that (not restart to 2 mid-doc).
  // Here every physical page's TOP belongs to the first (nextPage) section — the
  // continuous section's content lands BELOW it on the SAME pages — so all pages
  // carry the start=1 section's identity and settings.
  it('reproduces sample-13: nextPage start=1 + continuous start=2 stays sequential', () => {
    const firstSection = {}; // owns every physical page top (start=1)
    const num: PageNumType = { start: 1 };
    const pages = [
      page(firstSection, num),
      page(firstSection, num),
      page(firstSection, num),
      page(firstSection, num),
      page(firstSection, num),
    ];
    // start=1 on the first section (physical page 1) is the identity ⇒ 1..5, and
    // the continuous start=2 never surfaces (not a page-top section).
    expect(computePageNumbering(pages).map((n) => n.displayNumber)).toEqual([1, 2, 3, 4, 5]);
  });
});
