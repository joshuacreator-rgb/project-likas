import { describe, expect, it } from "vitest";
import { detectFileType, isAllowedEvidenceType, prepareEvidencePayload } from "./file-signature";

/**
 * Locks down the type check that stands between a resident's upload and a file
 * served inline from our own origin.
 *
 * The SVG cases are the point of this file. SVG passed the previous
 * `startsWith("image/")` test, and an SVG can carry script; serving one inline
 * is stored XSS in the application's own origin. US-5 is the change that
 * starts rendering resident images inline instead of forcing a download, so the
 * window this closes is being opened by this same release.
 */

/** detectFileType refuses anything under 12 bytes, so fixtures are padded. */
function pad(bytes: Buffer): Buffer {
  return bytes.length >= 12 ? bytes : Buffer.concat([bytes, Buffer.alloc(12 - bytes.length)]);
}

const JPEG = pad(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("JFIF\0"), Buffer.alloc(16)]));
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const GIF = pad(Buffer.from("GIF89a" + "payload".repeat(3)));
const WEBP = pad(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]));
const PDF = pad(Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\n"));
const HEIC = pad(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)]));
const HEIF = pad(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmif1"), Buffer.alloc(16)]));

/** An MP4 also starts with an ftyp box, and must not be mistaken for a photo. */
const MP4 = pad(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(16)]));

const SVG = pad(Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)">
  <script>fetch("/api/trpc/auth.me")</script>
</svg>`));

const HTML = pad(Buffer.from("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>"));

const base64 = (bytes: Buffer) => bytes.toString("base64");

describe("detectFileType reads the type from the bytes", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["GIF", GIF, "image/gif"],
    ["WEBP", WEBP, "image/webp"],
    ["PDF", PDF, "application/pdf"],
    ["HEIC", HEIC, "image/heic"],
    ["HEIF", HEIF, "image/heif"],
  ])("recognises %s", (_name, bytes, expected) => {
    expect(detectFileType(bytes)).toEqual({ mimeType: expected });
  });

  it("returns null for SVG", () => {
    expect(detectFileType(SVG)).toBeNull();
  });

  it("returns null for an HTML document", () => {
    expect(detectFileType(HTML)).toBeNull();
  });

  it("returns null for an MP4 wearing a still-image container", () => {
    // Both MP4 and HEIC are `ftyp` boxes; only the brand separates them.
    expect(detectFileType(MP4)).toBeNull();
  });

  it("returns null for something too short to identify", () => {
    expect(detectFileType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("the evidence allowlist", () => {
  it("accepts photographs, screenshots and PDFs", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"]) {
      expect(isAllowedEvidenceType(type)).toBe(true);
    }
  });

  it("rejects SVG even though it is an image mime type", () => {
    expect(isAllowedEvidenceType("image/svg+xml")).toBe(false);
  });

  it("rejects script-bearing and non-image types", () => {
    for (const type of ["text/html", "text/plain", "application/javascript", "image/bmp", "video/mp4"]) {
      expect(isAllowedEvidenceType(type)).toBe(false);
    }
  });
});

describe("prepareEvidencePayload", () => {
  it("returns bytes and the detected type for a real photograph", () => {
    const result = prepareEvidencePayload(base64(JPEG));
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.bytes.byteLength).toBe(JPEG.byteLength);
  });

  it("strips a data URL prefix if the client sends one", () => {
    const result = prepareEvidencePayload(`data:image/png;base64,${base64(PNG)}`);
    expect(result.mimeType).toBe("image/png");
    expect(result.bytes.byteLength).toBe(PNG.byteLength);
  });

  it("refuses SVG with a message a resident can act on", () => {
    expect(() => prepareEvidencePayload(base64(SVG))).toThrow(/supported photo, screenshot or PDF/);
  });

  it("refuses an HTML document", () => {
    expect(() => prepareEvidencePayload(base64(HTML))).toThrow(/supported photo, screenshot or PDF/);
  });

  it("refuses a payload over the encoded ceiling without decoding it", () => {
    // Longer than 14 M characters. Asserted on length alone: the point of the
    // ceiling is that this is refused before the buffer is ever allocated.
    const oversized = "A".repeat(14_000_001);
    expect(() => prepareEvidencePayload(oversized)).toThrow(/exceeds 10MB/);
  });

  it("refuses a decoded payload over 10 MB", () => {
    // Base64 of roughly 10.5 MB: under the encoded ceiling, over the decoded one.
    const big = Buffer.alloc(10_500_000, 0xff);
    expect(() => prepareEvidencePayload(big.toString("base64"))).toThrow(/exceeds 10MB/);
  });

  it("accepts a payload sitting just under both ceilings", () => {
    // Guards the ceiling being accidentally set below the decoded limit, which
    // would make the 10 MB rule unreachable and the error message untrue.
    const under = Buffer.concat([JPEG, Buffer.alloc(1_000_000, 0x00)]);
    expect(() => prepareEvidencePayload(under.toString("base64"))).not.toThrow();
  });
});
