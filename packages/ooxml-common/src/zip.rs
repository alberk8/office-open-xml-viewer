//! Shared configuration for ZIP entry decompression limits.
//!
//! OOXML parsers must cap per-entry decompressed output to block zip-bomb DoS.
//! The cap defaults to 512 MiB — large enough for legitimate embedded video /
//! 4K media but small enough to refuse pathological archives — and can be
//! overridden per-parse via the `wasm_bindgen` entry points so library users
//! can tighten the budget (untrusted gateways) or loosen it (legitimate huge
//! decks) without forking.
//!
//! The current cap is stored in a thread-local so existing `read_zip_*`
//! helpers in each parser can consult it without threading a parameter
//! through ~70 call sites. Each WASM entry point installs a [`Guard`] for
//! its scope and the cap is restored on drop, so concurrent JS callers never
//! interfere (WASM is single-threaded; each invocation runs to completion).

use std::cell::Cell;

/// 512 MiB. OOXML legitimately reaches tens of MB (embedded video, 4K
/// images) but not hundreds, so this cap blocks zip-bomb DoS without
/// rejecting real files.
pub const DEFAULT_MAX_ZIP_ENTRY_BYTES: u64 = 512 * 1024 * 1024;

thread_local! {
    static MAX_ZIP_ENTRY_BYTES: Cell<u64> = const { Cell::new(DEFAULT_MAX_ZIP_ENTRY_BYTES) };
}

/// RAII guard that restores the previous cap when dropped. Created by
/// [`scoped_max`]; the caller should bind it to a `let _guard = …` for the
/// full duration of the parse call.
#[must_use = "binding the guard keeps the cap installed for this scope"]
pub struct Guard {
    previous: u64,
}

impl Drop for Guard {
    fn drop(&mut self) {
        MAX_ZIP_ENTRY_BYTES.with(|c| c.set(self.previous));
    }
}

/// Install a per-call ZIP entry size cap for the lifetime of the returned
/// guard. `None`, zero, or any non-positive value falls back to
/// [`DEFAULT_MAX_ZIP_ENTRY_BYTES`].
pub fn scoped_max(value: Option<u64>) -> Guard {
    let resolved = value
        .filter(|&n| n > 0)
        .unwrap_or(DEFAULT_MAX_ZIP_ENTRY_BYTES);
    let previous = MAX_ZIP_ENTRY_BYTES.with(|c| c.replace(resolved));
    Guard { previous }
}

/// Current cap in effect on this thread. Parsers consult this from their
/// `read_zip_*` helpers when validating entry sizes.
pub fn current_max() -> u64 {
    MAX_ZIP_ENTRY_BYTES.with(Cell::get)
}

/// Read one zip entry's bytes by path. Honors the scoped max-entry guard:
/// entries whose declared size exceeds the cap (default 512 MiB, or the
/// per-call override) are rejected rather than truncated — the zip-bomb DoS
/// guard shared with the per-parser `extract_*` WASM entry points.
pub fn extract_zip_entry(
    data: &[u8],
    path: &str,
    max_zip_entry_bytes: Option<u64>,
) -> Result<Vec<u8>, String> {
    use std::io::{Cursor, Read};
    let _guard = scoped_max(max_zip_entry_bytes);
    let max = current_max();
    let cursor = Cursor::new(data);
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| format!("zip open error: {e}"))?;
    let mut entry = zip
        .by_name(path)
        .map_err(|e| format!("entry not found: {path}: {e}"))?;
    if entry.size() > max {
        return Err(format!("ZIP entry exceeds size limit: {path}"));
    }
    let mut buf = Vec::with_capacity(entry.size() as usize);
    entry
        .by_ref()
        .take(max)
        .read_to_end(&mut buf)
        .map_err(|e| format!("read error: {e}"))?;
    Ok(buf)
}

/// Read one entry's bytes from an **already-opened** [`ZipArchive`]. Twin of
/// [`extract_zip_entry`] for callers that keep a single archive open across
/// many reads (the common case inside a parser) instead of re-opening it from
/// the raw bytes per entry. Honors the scoped max-entry guard: an entry whose
/// declared size exceeds the current cap is rejected with an `Err`, never
/// silently truncated (the zip-bomb DoS guard). Generic over the archive's
/// reader so each parser's concrete type (`Cursor<&[u8]>`, …) works unchanged.
pub fn read_zip_bytes<R: std::io::Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    path: &str,
) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let max = current_max();
    let mut entry = archive
        .by_name(path)
        .map_err(|e| format!("entry not found: {path}: {e}"))?;
    if entry.size() > max {
        return Err(format!("ZIP entry exceeds size limit: {path}"));
    }
    let mut buf = Vec::with_capacity(entry.size() as usize);
    entry
        .by_ref()
        .take(max)
        .read_to_end(&mut buf)
        .map_err(|e| format!("read error: {e}"))?;
    Ok(buf)
}

/// UTF-8 string counterpart of [`read_zip_bytes`] for XML parts. Same cap
/// enforcement and archive-reuse contract; decodes the entry as UTF-8 (strict —
/// OOXML parts are well-formed UTF-8, and a decode failure is a real corruption
/// worth reporting rather than papering over with lossy substitution).
pub fn read_zip_string<R: std::io::Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    path: &str,
) -> Result<String, String> {
    use std::io::Read;
    let max = current_max();
    let mut entry = archive
        .by_name(path)
        .map_err(|e| format!("entry not found: {path}: {e}"))?;
    if entry.size() > max {
        return Err(format!("ZIP entry exceeds size limit: {path}"));
    }
    let mut buf = String::new();
    entry
        .by_ref()
        .take(max)
        .read_to_string(&mut buf)
        .map_err(|e| format!("read error: {e}"))?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_zip_entry_reads_by_path() {
        use std::io::{Cursor, Write};
        let mut buf = Vec::new();
        {
            let mut w = zip::ZipWriter::new(Cursor::new(&mut buf));
            let opts = zip::write::SimpleFileOptions::default();
            w.start_file("ppt/media/image1.png", opts).unwrap();
            w.write_all(b"\x89PNGdata").unwrap();
            w.finish().unwrap();
        }
        let bytes = extract_zip_entry(&buf, "ppt/media/image1.png", None).unwrap();
        assert_eq!(bytes, b"\x89PNGdata");
        assert!(extract_zip_entry(&buf, "ppt/media/missing.png", None)
            .unwrap_err()
            .contains("not found"));
    }

    #[test]
    fn extract_zip_entry_rejects_oversized_entry() {
        use std::io::{Cursor, Write};
        let mut buf = Vec::new();
        {
            let mut w = zip::ZipWriter::new(Cursor::new(&mut buf));
            let opts = zip::write::SimpleFileOptions::default();
            w.start_file("ppt/media/big.bin", opts).unwrap();
            w.write_all(b"12345678").unwrap(); // 8 bytes uncompressed
            w.finish().unwrap();
        }
        // A cap below the declared size must be REJECTED, never silently
        // truncated — this is the zip-bomb DoS guard (default 512 MiB).
        let err = extract_zip_entry(&buf, "ppt/media/big.bin", Some(4)).unwrap_err();
        assert!(err.contains("exceeds size limit"), "got: {err}");
        // A cap above the size reads the entry in full.
        assert_eq!(
            extract_zip_entry(&buf, "ppt/media/big.bin", Some(64)).unwrap(),
            b"12345678"
        );
    }

    /// Build a one-entry in-memory zip for the open-archive helper tests.
    fn archive_with(name: &str, body: &[u8]) -> zip::ZipArchive<std::io::Cursor<Vec<u8>>> {
        use std::io::{Cursor, Write};
        let mut buf = Vec::new();
        {
            let mut w = zip::ZipWriter::new(Cursor::new(&mut buf));
            let opts = zip::write::SimpleFileOptions::default();
            w.start_file(name, opts).unwrap();
            w.write_all(body).unwrap();
            w.finish().unwrap();
        }
        zip::ZipArchive::new(Cursor::new(buf)).unwrap()
    }

    #[test]
    fn read_zip_bytes_reads_present_and_reports_missing() {
        let mut ar = archive_with("word/document.xml", b"<xml/>");
        assert_eq!(
            read_zip_bytes(&mut ar, "word/document.xml").unwrap(),
            b"<xml/>"
        );
        let err = read_zip_bytes(&mut ar, "word/missing.xml").unwrap_err();
        assert!(err.contains("not found"), "got: {err}");
    }

    #[test]
    fn read_zip_string_reads_present_and_reports_missing() {
        let mut ar = archive_with("xl/workbook.xml", b"<workbook/>");
        assert_eq!(
            read_zip_string(&mut ar, "xl/workbook.xml").unwrap(),
            "<workbook/>"
        );
        let err = read_zip_string(&mut ar, "xl/nope.xml").unwrap_err();
        assert!(err.contains("not found"), "got: {err}");
    }

    #[test]
    fn read_zip_helpers_reject_oversized_under_scoped_cap() {
        // 8-byte entry; a scoped cap of 4 must reject (never truncate) — the
        // zip-bomb guard applies to the open-archive helpers too.
        let mut ar = archive_with("ppt/media/big.bin", b"12345678");
        {
            let _guard = scoped_max(Some(4));
            let be = read_zip_bytes(&mut ar, "ppt/media/big.bin").unwrap_err();
            assert!(be.contains("exceeds size limit"), "got: {be}");
            let se = read_zip_string(&mut ar, "ppt/media/big.bin").unwrap_err();
            assert!(se.contains("exceeds size limit"), "got: {se}");
        }
        // Cap restored on guard drop → the same entry now reads in full.
        assert_eq!(
            read_zip_bytes(&mut ar, "ppt/media/big.bin").unwrap(),
            b"12345678"
        );
    }
}
