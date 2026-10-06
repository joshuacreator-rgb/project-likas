/**
 * True file type from magic bytes.
 *
 * `uploadEvidence` used to accept the `mimeType` the browser reported and store
 * it unchanged. That value is attacker-controlled: it comes straight off the
 * `File` object, and a request can carry any string. Three things follow from
 * that, and only the first was being handled.
 *
 *   1. Size was checked. That part was correct.
 *   2. The declared type was not checked against the bytes, so a file declaring
 *      `image/png` was stored as a PNG regardless of what it actually was.
 *   3. `image/svg+xml` passed the old `startsWith("image/")` test. SVG is not a
 *      picture — it is a document that can carry script. Serving one inline
 *      from our own origin is stored XSS, and US-5 is the change that starts
 *      serving resident images inline rather than forcing a download.
 *
 * The US-6 story states the rule already: *the server must re-validate true mime
 * type and size after upload — never trust client-supplied values.* This module
 * is that rule for the formats US-5 accepts, written now rather than when video
 * arrives, because the photo path needs it first.
 *
 * Detection is by content only. Extension and declared type are ignored
 * entirely: a name is evidence of nothing.
 */

/** What the bytes actually are, or null if nothing here recognises them. */
export type DetectedType = { mimeType: string } | null;

const ASCII = (buffer: Buffer, offset: number, length: number): string =>
  buffer.subarray(offset, offset + length).toString("latin1");

/**
 * Brands that mean a still-image HEIF container, i.e. a photo.
 *
 * Two lists rather than one because there is no `heif` brand: `mif1` and
 * `msf1` are the generic HEIF and image-sequence brands, while `heic` and its
 * relatives are the specific variants. An earlier version of this matched a
 * prefix that no brand carries, which meant one of the two branches was
 * unreachable and the returned type was wrong for half the inputs — caught by
 * the test asserting the other branch, which is the usual way it goes.
 *
 * `ftyp` alone is not enough to go on, because `ftyp` also covers MP4, AVI and
 * a dozen video containers that must not be accepted as photographs. HEIC
 * deliberately is: an iPhone shoots it by default, and refusing it would mean
 * the citizens most likely to be reporting an emergency on a phone cannot
 * attach the photo they just took.
 */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const HEIF_BRANDS = new Set(["mif1", "msf1"]);

export function detectFileType(bytes: Buffer): DetectedType {
  if (bytes.length < 12) return null;

  // JPEG: starts FFD8FF.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A.
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png" };
  }

  // GIF: GIF87a / GIF89a.
  const gif = ASCII(bytes, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return { mimeType: "image/gif" };

  // WEBP: RIFF....WEBP — the container is RIFF, so the brand at 8 is what says
  // it is a picture rather than a WAV or AVI.
  if (ASCII(bytes, 0, 4) === "RIFF" && ASCII(bytes, 8, 4) === "WEBP") {
    return { mimeType: "image/webp" };
  }

  // PDF: %PDF- within the first bytes. Some producers prefix junk, so the
  // header is searched rather than required at offset 0.
  if (bytes.subarray(0, 1024).includes("%PDF-")) return { mimeType: "application/pdf" };

  // HEIF/HEIC: ftyp box with a still-image brand.
  if (ASCII(bytes, 4, 4) === "ftyp") {
    const brand = ASCII(bytes, 8, 4).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return { mimeType: "image/heic" };
    if (HEIF_BRANDS.has(brand)) return { mimeType: "image/heif" };
  }

  return null;
}

/**
 * Whether a detected type may be stored as report evidence.
 *
 * SVG is absent on purpose and is the main reason this exists — see the module
 * comment. `image/heic` and `image/heif` are present for the reason given
 * there too.
 */
export function isAllowedEvidenceType(mimeType: string): boolean {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp" ||
    mimeType === "image/gif" ||
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    mimeType === "application/pdf"
  );
}

/**
 * Base64 of a 10 MB file is about 13.3 M characters.
 *
 * The check on encoded length runs before decoding so an oversized payload is
 * refused without ever materialising it. `express.json` accepts up to 50 MB, so
 * without this the worst case is roughly 37 MB of buffer allocated for a file
 * that was always going to be rejected.
 */
const ENCODED_LENGTH_CEILING = 14_000_000;
const DECODED_LENGTH_CEILING = 10_000_000;

/**
 * Turns an uploaded payload into bytes plus the type the bytes actually are.
 *
 * Extracted from `uploadEvidence` so it can be tested directly. The database
 * helper opens a connection before it does anything else, which means a test
 * aimed at the validation would fail for the wrong reason on any machine
 * without a reachable database — the exact failure mode section 11.9 of this
 * project's backlog is about.
 *
 * Throws with a message meant for the resident to read.
 */
export function prepareEvidencePayload(dataBase64: string): {
  bytes: Buffer;
  mimeType: string;
} {
  if (dataBase64.length > ENCODED_LENGTH_CEILING) {
    throw new Error("Evidence file exceeds 10MB");
  }

  const bytes = Buffer.from(
    dataBase64.replace(/^data:[^;]+;base64,/, ""),
    "base64",
  );
  if (bytes.byteLength > DECODED_LENGTH_CEILING) {
    throw new Error("Evidence file exceeds 10MB");
  }

  const detected = detectFileType(bytes);
  if (!detected || !isAllowedEvidenceType(detected.mimeType)) {
    throw new Error("That file is not a supported photo, screenshot or PDF");
  }

  return { bytes, mimeType: detected.mimeType };
}
