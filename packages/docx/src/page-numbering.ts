// ECMA-376 §17.6.12 `<w:pgNumType>` — resolve the DISPLAYED page number (and its
// number format) for every PHYSICAL page, honoring per-section restart (`w:start`)
// and re-formatting (`w:fmt`). This is the layer that separates the "physical page
// index" (0..N-1, produced by the paginator) from the number a PAGE field shows.
//
// The paginator stamps each element with `sectionPageNumType` — the page-numbering
// settings of the section that element belongs to (from the upcoming
// `SectionBreak.pageNumType`, or the body-level `section.pageNumType`). We read the
// FIRST element of each physical page to learn which section OWNS the top of that
// page and whether that section carries a restart.
//
// ── §17.6.12 semantics ──────────────────────────────────────────────────────
//   • `start` — "the page number that appears on the first page of the section."
//     So when a NEW section begins at the top of a physical page and that section
//     declares `w:start`, the running counter RESETS to `start` on that page.
//     "If this value is omitted, numbering continues from the highest page number
//     in the previous section" — i.e. keep incrementing.
//   • `fmt` — "the number format that shall be used for all page numbering in this
//     section." Absent ⇒ decimal (the default). Unlike `start`, `fmt` has no
//     continuation clause, so each section's format is independent (absent ⇒
//     decimal, NOT inherited from the previous section).
//
// A CONTINUOUS section break does not open a new physical page, so a continuous
// section that declares `w:start` does not restart the number of the page it
// SHARES with the preceding section — its content is not the FIRST element of a
// new page, so we never observe its restart at a page boundary. This matches Word
// (and preserves sample-13, whose `start="2"` continuous section shows no visible
// restart because it never starts a fresh page).

import type { PaginatedBodyElement, PageNumType } from './types';
import type { NumberFormat } from '@silurus/ooxml-core';

/** The displayed page number + its format for one physical page. */
export interface PageNumber {
  /** The number a PAGE field shows on this page (after §17.6.12 restart). */
  displayNumber: number;
  /** The ST_NumberFormat the section governing this page's TOP declares (§17.18.59);
   *  `decimal` when the section omits `w:fmt`. A PAGE field may still override this
   *  with its own `\*` switch (that is applied at field-resolution time, not here). */
  format: NumberFormat;
}

/** The page-numbering settings governing the TOP of physical page `pageIndex`,
 *  read from the first stamped element (the section that owns the page start).
 *  `null` when the page is empty or the section carries no `<w:pgNumType>`. */
function pageTopSettings(page: PaginatedBodyElement[] | undefined): PageNumType | null {
  return page?.[0]?.sectionPageNumType ?? null;
}

/** Identity of the section owning a page's top, used to detect a NEW section at a
 *  page boundary. We reuse the same `sectionHF` object identity the paginator
 *  stamps (a fresh object per section in the pagination pass), mirroring
 *  `resolvePageSection`'s `isFirstPageOfSection` test. */
function pageTopSectionId(page: PaginatedBodyElement[] | undefined): unknown {
  return page?.[0]?.sectionHF;
}

/**
 * Compute the displayed page number + format for every physical page.
 *
 * @param pages the paginated body (one array of stamped elements per physical page)
 * @returns a per-physical-page array of {@link PageNumber}
 */
export function computePageNumbering(pages: PaginatedBodyElement[][]): PageNumber[] {
  const out: PageNumber[] = [];
  let counter = 0; // the previous page's display number (0 before the first page)
  for (let p = 0; p < pages.length; p++) {
    const settings = pageTopSettings(pages[p]);
    const fmt = (settings?.fmt ?? 'decimal') as NumberFormat;

    // A page starts a NEW section when its owning section differs from the
    // previous page's (or it is the very first page). Only a NEW section may
    // restart the counter — a section continuing across a page break keeps
    // incrementing.
    const startsNewSection = p === 0 || pageTopSectionId(pages[p]) !== pageTopSectionId(pages[p - 1]);

    if (startsNewSection && settings?.start != null) {
      // §17.6.12 `w:start` — the number shown on the first page of the section.
      counter = settings.start;
    } else {
      // §17.6.12 — otherwise numbering continues from the previous page.
      counter = counter + 1;
    }
    out.push({ displayNumber: counter, format: fmt });
  }
  return out;
}
