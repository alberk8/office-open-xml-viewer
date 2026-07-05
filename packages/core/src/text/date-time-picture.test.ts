import { describe, it, expect } from 'vitest';
import { formatDateTimePicture, parseDateTimePictureSwitch } from './date-time-picture';

// ECMA-376 §17.16.4.1 reference instant used by the spec's example table:
// Tuesday, January 3, 2006, 5:28:34 PM (local time).
const REF = new Date(2006, 0, 3, 17, 28, 34);

describe('parseDateTimePictureSwitch — §17.16.4.1 \\@ switch', () => {
  it('extracts a quoted picture', () => {
    expect(parseDateTimePictureSwitch(' DATE \\@ "M/d/yyyy" \\* MERGEFORMAT ')).toBe('M/d/yyyy');
    expect(parseDateTimePictureSwitch(' TIME  \\@ "YYYY"  \\* MERGEFORMAT ')).toBe('YYYY');
    expect(parseDateTimePictureSwitch(`DATE \\@ "'Today is 'HH:mm:ss"`)).toBe("'Today is 'HH:mm:ss");
  });

  it('extracts a bare single-token picture', () => {
    expect(parseDateTimePictureSwitch('DATE \\@ yyyy')).toBe('yyyy');
  });

  it('returns null when no \\@ switch is present', () => {
    expect(parseDateTimePictureSwitch('PAGE \\* MERGEFORMAT')).toBeNull();
    expect(parseDateTimePictureSwitch('TIME \\* MERGEFORMAT')).toBeNull();
    expect(parseDateTimePictureSwitch('')).toBeNull();
  });
});

describe('formatDateTimePicture — §17.16.4.1 picture items (spec example table)', () => {
  const cases: Array<[string, string]> = [
    ['M/d/yyyy', '1/3/2006'],
    ['dddd, MMMM dd, yyyy', 'Tuesday, January 03, 2006'],
    ['MMMM d, yyyy', 'January 3, 2006'],
    ['M/d/yy', '1/3/06'],
    ['yyyy-MM-dd', '2006-01-03'],
    ['d-MMM-yy', '3-Jan-06'],
    ['M.d.yyyy', '1.3.2006'],
    ['d MMMM yyyy', '3 January 2006'],
    ['MMMM yy', 'January 06'],
    ['M/d/yyyy h:mm am/pm', '1/3/2006 5:28 PM'],
    ['M/d/yyyy h:mm:ss am/pm', '1/3/2006 5:28:34 PM'],
    ['h:mm am/pm', '5:28 PM'],
    ['h:mm:ss am/pm', '5:28:34 PM'],
    ["'Today is 'HH:mm:ss", 'Today is 17:28:34'],
  ];
  for (const [pic, want] of cases) {
    it(`${pic} → ${want}`, () => {
      expect(formatDateTimePicture(pic, REF)).toBe(want);
    });
  }

  it('YYYY (uppercase) formats the 4-digit year (sample-28 footer)', () => {
    expect(formatDateTimePicture('YYYY', REF)).toBe('2006');
    expect(formatDateTimePicture('YY', REF)).toBe('06');
  });

  it('HH is 24-hour with leading zero; H drops it', () => {
    const morning = new Date(2006, 0, 3, 9, 5, 7);
    expect(formatDateTimePicture('HH:mm:ss', morning)).toBe('09:05:07');
    expect(formatDateTimePicture('H:m:s', morning)).toBe('9:5:7');
  });

  it('12-hour h maps midnight/noon to 12; meridiem is always uppercase (§17.16.4.1 example)', () => {
    const midnight = new Date(2006, 0, 3, 0, 0, 0);
    const noon = new Date(2006, 0, 3, 12, 0, 0);
    // The picture's "am/pm" is lowercase but Word emits uppercase AM/PM.
    expect(formatDateTimePicture('h:mm am/pm', midnight)).toBe('12:00 AM');
    expect(formatDateTimePicture('h:mm am/pm', noon)).toBe('12:00 PM');
    expect(formatDateTimePicture('h:mm AM/PM', noon)).toBe('12:00 PM');
  });

  it('A/P is the single-letter meridiem (always uppercase)', () => {
    expect(formatDateTimePicture('h A/P', REF)).toBe('5 P');
    const am = new Date(2006, 0, 3, 9, 0, 0);
    expect(formatDateTimePicture('h a/p', am)).toBe('9 A');
  });

  it("copies literal 'text' and passes other characters through", () => {
    expect(formatDateTimePicture("'Year: 'yyyy", REF)).toBe('Year: 2006');
    // doubled '' is an escaped single quote inside a literal
    expect(formatDateTimePicture("'it''s 'yyyy", REF)).toBe("it's 2006");
  });

  it('returns null for an unsupported letter token so the caller keeps the cache', () => {
    // `bbbb` (Thai Buddhist era) and `e` (Japanese emperor era) are unimplemented.
    expect(formatDateTimePicture('bbbb', REF)).toBeNull();
    expect(formatDateTimePicture('ee', REF)).toBeNull();
    // A picture that mixes a supported and an unsupported token still bails.
    expect(formatDateTimePicture('yyyy bbbb', REF)).toBeNull();
  });
});
