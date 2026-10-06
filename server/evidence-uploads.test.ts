import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * US-5 / US-7 at the database layer: what a successful upload writes, what a
 * failed one leaves behind, and how a retry that finally lands supersedes the
 * failure record (US-7 AC 4).
 *
 * `uploadEvidence` and `recordEvidenceUploadFailure` are exercised directly so
 * the assertions are on the rows actually written. The drizzle driver is
 * replaced with a fake that records whichever `insert`/`delete` chains are
 * built, and `storagePut` is replaced so no file is written anywhere. The
 * payload validation — `prepareEvidencePayload` — is real, because a test
 * that never validates has nothing to do with uploading.
 *
 * The bug being guarded: a failed upload used to be indistinguishable from an
 * upload never attempted. A responder opening a report saw nothing and could
 * conclude no photo was taken. Now every attempt leaves a row, `status` says
 * which of the two it was, and `uploadEvidence` removes FAILED rows matching
 * the same report and file name so a recovered retry does not leave a phantom
 * failure beside the real file.
 */

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
const JPEG_BASE64 = JPEG_BYTES.toString("base64");

const inserts: Array<{ values: Record<string, unknown> }> = [];
const deletes: Array<{ table: unknown }> = [];

const fakeDb = {
  insert: () => {
    const record = { values: {} as Record<string, unknown> };
    const chain = {
      values: (v: Record<string, unknown>) => {
        record.values = v;
        return chain;
      },
      $returningId: async () => {
        inserts.push(record);
        return [{ id: 4242 }];
      },
    };
    return chain;
  },
  delete: (table: unknown) => {
    const chain = {
      where: async () => {
        deletes.push({ table });
        return chain;
      },
    };
    return chain;
  },
};

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "risk-reports/9/5-photo.jpg",
    url: "/api/upload/risk-reports/9/5-photo.jpg",
  }),
}));

let uploadEvidence: typeof import("./db").uploadEvidence;
let recordEvidenceUploadFailure: typeof import("./db").recordEvidenceUploadFailure;

beforeAll(async () => {
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
  ({ uploadEvidence, recordEvidenceUploadFailure } = await import("./db"));
}, 60_000);

beforeEach(() => {
  inserts.length = 0;
  deletes.length = 0;
});

describe("uploadEvidence", () => {
  it("writes a STORED row and clears any superseded failure first", async () => {
    const result = await uploadEvidence({
      reportId: 9,
      userId: 5,
      fileName: "photo.jpg",
      dataBase64: JPEG_BASE64,
    });
    // The row must look like a real, reachable file.
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      reportId: 9,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: JPEG_BYTES.byteLength,
      status: "STORED",
    });
    expect(inserts[0].values.fileKey).toContain("/9/5-");
    // A FAILED record for the same report and file is superseded, so a retry
    // that finally lands does not leave a phantom failure next to the file.
    expect(deletes).toHaveLength(1);
    expect(result.url).toBe("/api/files/evidence/4242");
  });

  it("cleans a hostile file name before storing and before matching", async () => {
    await uploadEvidence({
      reportId: 9,
      userId: 5,
      fileName: "../../etc/passwd",
      dataBase64: JPEG_BASE64,
    });
    expect(inserts[0].values.fileName).toBe(".._.._etc_passwd");
  });

  it("refuses a payload that is not a supported file without touching the database", async () => {
    await expect(
      uploadEvidence({ reportId: 9, userId: 5, fileName: "note.txt", dataBase64: "aGVsbG8=" }),
    ).rejects.toThrow("not a supported photo, screenshot or PDF");
    expect(inserts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });
});

describe("recordEvidenceUploadFailure", () => {
  it("leaves a FAILED row with no storage key", async () => {
    const result = await recordEvidenceUploadFailure({
      reportId: 9,
      fileName: "photo.jpg",
    });
    expect(inserts).toHaveLength(1);
    // status is the only truthful column: there is no key, no url, no type,
    // because nothing was stored. A reader that trusts those columns instead
    // of status is the exact failure mode AC 4 exists to prevent.
    expect(inserts[0].values).toMatchObject({
      reportId: 9,
      fileName: "photo.jpg",
      fileKey: "",
      fileUrl: "",
      mimeType: "",
      sizeBytes: 0,
      status: "FAILED",
    });
    expect(result.status).toBe("FAILED");
    expect(deletes).toHaveLength(0);
  });

  it("neutralises path traversal in a hostile file name", async () => {
    await recordEvidenceUploadFailure({ reportId: 9, fileName: "../../etc/passwd" });
    expect(inserts[0].values.fileName).toBe(".._.._etc_passwd");
  });
});