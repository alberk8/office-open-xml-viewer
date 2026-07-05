/**
 * ECMA-376 §17.16.4.1 — date-and-time formatting ("picture") switch evaluator,
 * shared across the docx / pptx field renderers (DATE §17.16.5.16, TIME
 * §17.16.5.72, and any field whose result is a date/time, e.g. CREATEDATE /
 * SAVEDATE / PRINTDATE). The DATE/TIME field displays the CURRENT date/time
 * "filtered through the specified date picture" (§17.16.4.1); this pure function
 * performs that filtering so each renderer can format the injected current time
 * deterministically.
 *
 * The instruction carries the picture in a `\@ "…"` switch (§17.16.4.1
 * `date-and-time-formatting-switch = \@ switch-argument`). A switch-argument is a
 * series of picture items; we implement the necessary-and-sufficient Gregorian
 * (US-locale) set Word writes in practice:
 *
 *   year   : yyyy/YYYY (4-digit) · yy/YY/y/Y (2-digit)
 *   month  : MMMM (full name) · MMM (abbrev) · MM (2-digit) · M (no-zero)
 *   day    : dddd/DDDD (full weekday) · ddd/DDD (abbrev weekday) · dd/DD
 *            (2-digit day-of-month) · d/D (no-zero day-of-month)
 *   hour   : HH (24-h, 2-digit) · H (24-h) · hh (12-h, 2-digit) · h (12-h)
 *   minute : mm (2-digit) · m (no-zero)
 *   second : ss (2-digit) · s (no-zero)
 *   period : AM/PM · am/pm (and A/P · a/p) → the locale meridiem
 *   literal: 'text' passes through verbatim; any other character is copied as-is
 *
 * Locale-specific and calendar-shifting items (aaa/A Japanese numerals, bb/bbbb
 * Thai Buddhist era, e/ee/E emperor era, Thai ปปปป/ดดดด/วววว, the `\s`/`\h`
 * switches, numbered-item back-references) are NOT implemented: encountering an
 * unsupported LETTER run makes the evaluator return `null`, so the caller falls
 * back to the field's cached result rather than emitting a wrong date. Month and
 * weekday NAMES are English (the practical default; the `lang`-driven localization
 * of §17.3.2.20 is a follow-up — a name request with a non-English requirement is
 * still English here, which is the same limitation Word documents assume in an
 * en-US context).
 */

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
const WEEKDAYS_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/**
 * Extract the `\@ "picture"` (or `\@ picture` — a bare single-token argument)
 * from a field instruction (§17.16.4.1). Returns the picture string, or `null`
 * when the instruction carries no date-time switch.
 */
export function parseDateTimePictureSwitch(instruction: string): string | null {
  // Quoted argument: \@ "…". The picture may contain spaces, so capture up to the
  // closing quote. `[^"]*` is safe — the switch argument itself never contains a
  // literal double-quote (nested literals use single quotes per §17.16.4.1).
  const quoted = /\\@\s*"([^"]*)"/.exec(instruction);
  if (quoted) return quoted[1];
  // Bare single-token argument: \@ token (rare, e.g. `\@ yyyy`).
  const bare = /\\@\s*(\S+)/.exec(instruction);
  return bare ? bare[1] : null;
}

/**
 * Format a Date through a §17.16.4.1 picture string. Returns the formatted text,
 * or `null` when the picture contains an unsupported letter token (so the caller
 * can fall back to the field's cached result).
 */
export function formatDateTimePicture(picture: string, date: Date): string | null {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const dom = date.getDate();
  const dow = date.getDay(); // 0=Sun
  const hour24 = date.getHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minute = date.getMinutes();
  const second = date.getSeconds();
  const isPM = hour24 >= 12;

  let out = '';
  let i = 0;
  const n = picture.length;
  while (i < n) {
    const ch = picture[i];

    // 'text' literal — copy verbatim, honoring a doubled '' as an escaped quote.
    if (ch === "'") {
      i++;
      let lit = '';
      while (i < n) {
        if (picture[i] === "'") {
          if (picture[i + 1] === "'") { lit += "'"; i += 2; continue; }
          i++; // closing quote
          break;
        }
        lit += picture[i++];
      }
      out += lit;
      continue;
    }

    // A run of the same letter is one picture item; its length selects the form.
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < n && picture[j] === ch) j++;
      const run = picture.slice(i, j);
      const len = run.length;
      const lower = ch.toLowerCase();
      let piece: string | null = null;

      if (ch === 'y' || ch === 'Y') {
        piece = len >= 4 ? String(year).padStart(4, '0') : pad2(year % 100);
      } else if (ch === 'M') {
        // Month (uppercase M). MMMM full · MMM abbrev · MM 2-digit · M no-zero.
        piece = len >= 4 ? MONTHS_FULL[month]
          : len === 3 ? MONTHS_ABBR[month]
          : len === 2 ? pad2(month + 1)
          : String(month + 1);
      } else if (lower === 'd') {
        // Day. dddd/DDDD full weekday · ddd/DDD abbrev weekday · dd/DD 2-digit
        // day-of-month · d/D no-zero day-of-month.
        piece = len >= 4 ? WEEKDAYS_FULL[dow]
          : len === 3 ? WEEKDAYS_ABBR[dow]
          : len === 2 ? pad2(dom)
          : String(dom);
      } else if (ch === 'H') {
        piece = len >= 2 ? pad2(hour24) : String(hour24);
      } else if (ch === 'h') {
        piece = len >= 2 ? pad2(hour12) : String(hour12);
      } else if (ch === 'm') {
        // minute (lowercase m). mm 2-digit · m no-zero.
        piece = len >= 2 ? pad2(minute) : String(minute);
      } else if (ch === 's') {
        piece = len >= 2 ? pad2(second) : String(second);
      } else if (lower === 'a' || lower === 'p') {
        // AM/PM · am/pm · A/P · a/p meridiem. Word treats the whole "AM/PM"
        // (or "A/P") — including the slash — as a single meridiem item; consume
        // the letter, an optional "M"/"m", the slash, and the trailing token.
        piece = null; // handled below via the meridiem matcher
      }

      if (piece !== null) {
        out += piece;
        i = j;
        continue;
      }
      // Unsupported letter token (and not a meridiem handled below) → bail so the
      // caller keeps the cached result.
      if (!(lower === 'a' || lower === 'p')) return null;
    }

    // Meridiem: AM/PM, am/pm, A/P, a/p. Per the §17.16.4.1 example table the
    // emitted meridiem is ALWAYS uppercase regardless of the picture's case
    // (`… h:mm am/pm` → "5:28 PM"). Matched here (not as a single-letter run)
    // because it spans a "/" between two tokens.
    const merid = /^([AaPp])([Mm])?\/([AaPp])([Mm])?/.exec(picture.slice(i));
    if (merid) {
      const twoLetter = merid[2] !== undefined; // "AM/PM" form vs "A/P" form
      out += twoLetter ? (isPM ? 'PM' : 'AM') : (isPM ? 'P' : 'A');
      i += merid[0].length;
      continue;
    }

    // Any other character (":", "-", "/", " ", ".", …) passes through verbatim.
    out += ch;
    i++;
  }

  return out;
}
