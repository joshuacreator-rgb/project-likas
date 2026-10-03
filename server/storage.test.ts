import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// `ENV` is built once at module load, so the upload directory and signing
// secret have to exist in the environment before storage.ts is imported.
const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "likas-storage-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.JWT_SECRET = "test-signing-secret";
delete process.env.S3_BUCKET;
delete process.env.S3_ACCESS_KEY_ID;
delete process.env.S3_SECRET_ACCESS_KEY;

const storage = await import("./storage");

/** An expiry a few minutes ahead, i.e. what a freshly minted signature carries. */
const future = () => Math.floor(Date.now() / 1000) + 300;

afterAll(async () => {
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe("normalizeKey", () => {
  it("strips leading slashes", () => {
    expect(storage.normalizeKey("/citizen-ids/1/a.jpg")).toBe("citizen-ids/1/a.jpg");
  });

  it("collapses repeated separators", () => {
    expect(storage.normalizeKey("citizen-ids//1///a.jpg")).toBe("citizen-ids/1/a.jpg");
  });

  // Traversal is refused outright rather than rewritten. A key reaching this
  // function is either built here or read back from our own database, so a `..`
  // means something upstream is broken and should be loud.
  it.each([
    "../secrets.env",
    "citizen-ids/../../etc/passwd",
    "citizen-ids/1/../../../root/.ssh/id_rsa",
    "..",
    "./a.jpg",
    "citizen-ids/./1/a.jpg",
  ])("rejects traversal in %s", (key) => {
    expect(() => storage.normalizeKey(key)).toThrow(/traversal/i);
  });

  it("rejects backslash separators used to fake a path", () => {
    expect(() => storage.normalizeKey("citizen-ids\\..\\..\\etc\\passwd")).toThrow(/traversal/i);
  });

  it("rejects a null byte", () => {
    expect(() => storage.normalizeKey("a.jpg\0.png")).toThrow(/null byte/i);
  });

  it("rejects an empty key", () => {
    expect(() => storage.normalizeKey("")).toThrow(/empty/i);
    expect(() => storage.normalizeKey("///")).toThrow(/empty/i);
  });
});

describe("appendHashSuffix", () => {
  it("inserts the suffix before the extension", () => {
    const result = storage.appendHashSuffix("citizen-ids/1/passport.jpg");
    expect(result).toMatch(/^citizen-ids\/1\/passport_[0-9a-f]{8}\.jpg$/);
  });

  it("appends when there is no extension", () => {
    expect(storage.appendHashSuffix("citizen-ids/1/scan")).toMatch(
      /^citizen-ids\/1\/scan_[0-9a-f]{8}$/,
    );
  });

  // A dot in a directory segment must not be mistaken for an extension, or the
  // suffix lands in the wrong place and the directory stops being a directory.
  it("only considers the basename, not dots in directory names", () => {
    const result = storage.appendHashSuffix("citizen-ids/1.v2/scan");
    expect(result).toMatch(/^citizen-ids\/1\.v2\/scan_[0-9a-f]{8}$/);
  });

  it("gives two uploads of the same name different keys", () => {
    const a = storage.appendHashSuffix("citizen-ids/1/a.jpg");
    const b = storage.appendHashSuffix("citizen-ids/1/a.jpg");
    expect(a).not.toBe(b);
  });
});

describe("resolveWithinRoot", () => {
  it("resolves a normal key inside the root", () => {
    const resolved = storage.resolveWithinRoot("citizen-ids/1/a.jpg");
    expect(resolved.startsWith(path.resolve(uploadDir))).toBe(true);
  });

  it("refuses a key that escapes the root", () => {
    expect(() => storage.resolveWithinRoot("../outside.jpg")).toThrow(/outside/i);
  });
});

describe("verifyUploadSignature", () => {
  it("accepts a signature it produced", () => {
    const key = "citizen-ids/1/a.jpg";
    const exp = future();
    const sig = storage.__signForTesting(key, exp);
    expect(storage.verifyUploadSignature(key, exp, sig)).toBe(true);
  });

  it("rejects an expired signature", () => {
    const key = "citizen-ids/1/a.jpg";
    const exp = Math.floor(Date.now() / 1000) - 1;
    const sig = storage.__signForTesting(key, exp);
    expect(storage.verifyUploadSignature(key, exp, sig)).toBe(false);
  });

  it("rejects a valid signature replayed against a different key", () => {
    const exp = future();
    const sig = storage.__signForTesting("citizen-ids/1/a.jpg", exp);
    expect(storage.verifyUploadSignature("citizen-ids/2/b.jpg", exp, sig)).toBe(false);
  });

  // Extending the expiry is the obvious tamper: the holder keeps the signature
  // and just claims a later date. The expiry is inside the signed payload, so
  // this must fail.
  it("rejects an extended expiry", () => {
    const key = "citizen-ids/1/a.jpg";
    const original = future();
    const sig = storage.__signForTesting(key, original);
    expect(storage.verifyUploadSignature(key, original + 86_400, sig)).toBe(false);
  });

  it("rejects a missing, empty or malformed signature", () => {
    const exp = future();
    expect(storage.verifyUploadSignature("citizen-ids/1/a.jpg", exp, "")).toBe(false);
    expect(storage.verifyUploadSignature("citizen-ids/1/a.jpg", exp, "deadbeef")).toBe(false);
  });

  it("rejects a non-numeric expiry", () => {
    const key = "citizen-ids/1/a.jpg";
    expect(storage.verifyUploadSignature(key, Number.NaN, storage.__signForTesting(key, future()))).toBe(
      false,
    );
  });
});

describe("volume backend", () => {
  beforeEach(async () => {
    // Keep each test's files separate without churning the root itself.
    await fs.rm(path.join(uploadDir, "citizen-ids"), { recursive: true, force: true });
  });

  it("round-trips a write and a read", async () => {
    const stored = await storage.storagePut(
      "citizen-ids/7/scan.jpg",
      Buffer.from("pretend-pixels"),
      "image/jpeg",
    );
    expect(stored.key).toMatch(/^citizen-ids\/7\/scan_[0-9a-f]{8}\.jpg$/);
    expect(stored.url.startsWith("/api/upload/")).toBe(true);

    const onDisk = await fs.readFile(path.join(uploadDir, stored.key));
    expect(onDisk.toString()).toBe("pretend-pixels");
  });

  it("creates intermediate directories", async () => {
    const stored = await storage.storagePut("citizen-ids/8/deep/scan.jpg", Buffer.from("x"));
    await expect(fs.readFile(path.join(uploadDir, stored.key))).resolves.toBeTruthy();
  });

  it("never overwrites an existing file with the same name", async () => {
    const first = await storage.storagePut("citizen-ids/9/scan.jpg", Buffer.from("one"));
    const second = await storage.storagePut("citizen-ids/9/scan.jpg", Buffer.from("two"));
    expect(first.key).not.toBe(second.key);
    await expect(fs.readFile(path.join(uploadDir, first.key), "utf8")).resolves.toBe("one");
    await expect(fs.readFile(path.join(uploadDir, second.key), "utf8")).resolves.toBe("two");
  });

  it("mints a signed URL carrying an expiry and a signature", async () => {
    const stored = await storage.storagePut("citizen-ids/10/scan.jpg", Buffer.from("x"));
    const url = await storage.storageGetSignedUrl(stored.key);
    expect(url).toMatch(/^\/api\/upload\/.+\?exp=\d+&sig=[0-9a-f]{64}$/);

    const parsed = new URL(url, "http://localhost");
    expect(
      storage.verifyUploadSignature(
        stored.key,
        Number(parsed.searchParams.get("exp")),
        parsed.searchParams.get("sig") ?? "",
      ),
    ).toBe(true);
  });

  // The unsigned path is not a back door: it is what put() hands back for
  // convenience, and the serving route must refuse it.
  it("returns an unsigned path from put that is not usable as a signed URL", async () => {
    const stored = await storage.storagePut("citizen-ids/11/scan.jpg", Buffer.from("x"));
    const parsed = new URL(stored.url, "http://localhost");
    expect(parsed.searchParams.get("sig")).toBeNull();
    expect(
      storage.verifyUploadSignature(stored.key, future(), parsed.searchParams.get("sig") ?? ""),
    ).toBe(false);
  });

  it("deletes a file", async () => {
    const stored = await storage.storagePut("citizen-ids/12/scan.jpg", Buffer.from("x"));
    await storage.storageDelete(stored.key);
    await expect(fs.readFile(path.join(uploadDir, stored.key))).rejects.toThrow();
  });

  // The retention job wants the file absent. It already is, so this is success,
  // not an error, and must not leave purgedAt unset on an already-clean record.
  it("treats deleting a missing file as success", async () => {
    await expect(storage.storageDelete("citizen-ids/13/never-existed.jpg")).resolves.toBeUndefined();
  });

  it("refuses to delete outside the upload directory", async () => {
    await expect(storage.storageDelete("../escape.jpg")).rejects.toThrow(/traversal/i);
  });
});

describe("backend selection", () => {
  it("uses the volume backend when no bucket is configured", () => {
    expect(storage.getStorage().name).toBe("volume");
  });

  it("warns when the upload directory was not explicitly configured", () => {
    // ENV.uploadDirIsExplicit is true here because the test sets UPLOAD_DIR, so
    // this must stay silent. Asserted so a future edit cannot turn the warning
    // into unconditional noise.
    const warn = console.warn;
    let called = 0;
    console.warn = () => {
      called += 1;
    };
    try {
      storage.warnIfStorageIsEphemeral();
    } finally {
      console.warn = warn;
    }
    expect(called).toBe(0);
  });
});