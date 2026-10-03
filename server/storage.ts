/**
 * Object storage for resident-submitted files: Valid IDs, risk report evidence,
 * and safety advice step photos.
 *
 * Two backends sit behind one interface. The active one is chosen at first use:
 *
 *   volume - files on a Railway volume (or a local directory in development).
 *   s3     - any S3-compatible bucket, when S3_BUCKET and credentials are set.
 *
 * The volume backend is the default because it needs no credentials and no third
 * party. S3 is the target for production: a bucket is durable, versioned and
 * survives a redeploy, where a container filesystem does not.
 *
 * Resident Valid IDs are sensitive personal information under the Data Privacy
 * Act (RA 10173). They must only ever leave the server through `getSignedUrl`,
 * which callers reach only after an authorization check. `put` returns a URL for
 * convenience but it is NOT a substitute for `getSignedUrl`: the returned path
 * is unsigned and serves nothing without a signature.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

/** How long a minted URL stays usable. Deliberately short. */
export const SIGNED_URL_TTL_SECONDS = 300;

export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageBackend {
  readonly name: "volume" | "s3";
  put(
    relKey: string,
    data: Buffer | Uint8Array | string,
    contentType?: string,
  ): Promise<StoredObject>;
  getSignedUrl(relKey: string, ttlSeconds?: number): Promise<string>;
  delete(relKey: string): Promise<void>;
}

/* ------------------------------------------------------------------ keys -- */

/**
 * Normalises a caller-supplied key into a safe relative path.
 *
 * Rejects traversal outright rather than trying to sanitise it. A key is either
 * built by this module or read back from our own database, so a `..` segment
 * means something is wrong upstream and should surface as a loud failure rather
 * than a quietly rewritten path.
 */
export function normalizeKey(relKey: string): string {
  const cleaned = relKey.replace(/^\/+/, "");
  if (!cleaned) throw new Error("Storage key is empty");
  if (cleaned.includes("\0")) throw new Error("Storage key contains a null byte");
  const segments = cleaned.split(/[\\/]+/);
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    throw new Error("Storage key must not contain path traversal segments");
  }
  return segments.filter(Boolean).join("/");
}

/**
 * Appends a short random suffix so two uploads of the same filename cannot
 * overwrite one another. Only the basename is considered: a dot in a directory
 * segment must not be mistaken for an extension.
 */
export function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const segments = relKey.split("/");
  const base = segments[segments.length - 1] ?? "";
  const dot = base.lastIndexOf(".");
  const suffix = dot <= 0 ? `${base}_${hash}` : `${base.slice(0, dot)}_${hash}${base.slice(dot)}`;
  segments[segments.length - 1] = suffix;
  return segments.join("/");
}

/** Percent-encodes each segment while keeping `/` as the separator. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/* -------------------------------------------------------------- signing -- */

/**
 * Signing secret for upload URLs.
 *
 * Derived from JWT_SECRET rather than a new variable so that enabling file
 * uploads does not require provisioning another secret. The `upload:` prefix is
 * a domain separator: a signature minted here can never be replayed as any
 * other HMAC this application computes over the same secret.
 */
function signingSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured. Set JWT_SECRET before starting the server.");
  }
  return secret;
}

function signUploadKey(key: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(`upload:${key}:${expiresAt}`)
    .digest("hex");
}

/**
 * Verifies a signature produced by the volume backend's `getSignedUrl`.
 *
 * Returns false rather than throwing for every failure mode: a bad signature, a
 * missing signature, a non-numeric expiry and an expired token are all just
 * "no" to the caller serving the file.
 */
export function verifyUploadSignature(
  key: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (!signature || !Number.isFinite(expiresAt)) return false;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = signUploadKey(key, expiresAt);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* --------------------------------------------------------- volume backend -- */

/**
 * Resolves the upload root. `ENV.uploadDir` already accounts for Railway's
 * injected volume mount path, and falls back to a directory beside the process
 * for local development.
 */
export function uploadRoot(): string {
  return ENV.uploadDir ? path.resolve(ENV.uploadDir) : path.resolve(process.cwd(), "uploads");
}

/**
 * Resolves a key to an absolute path and refuses anything outside the root.
 *
 * `normalizeKey` already rejects `..`, but the containment check is kept
 * deliberately: it is the last thing standing between a database value and an
 * arbitrary file read, and it costs one string comparison.
 */
export function resolveWithinRoot(key: string): string {
  const root = uploadRoot();
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Storage key resolves outside the upload directory");
  }
  return target;
}

function createVolumeBackend(): StorageBackend {
  return {
    name: "volume",
    async put(relKey, data, _contentType = "application/octet-stream") {
      const key = appendHashSuffix(normalizeKey(relKey));
      const target = resolveWithinRoot(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
      return { key, url: `/api/upload/${encodeKey(key)}` };
    },
    async getSignedUrl(relKey, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
      const key = normalizeKey(relKey);
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      const signature = signUploadKey(key, expiresAt);
      return `/api/upload/${encodeKey(key)}?exp=${expiresAt}&sig=${signature}`;
    },
    async delete(relKey) {
      const target = resolveWithinRoot(normalizeKey(relKey));
      try {
        await fs.unlink(target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // Already absent satisfies the caller's intent: the retention job wants
        // the file gone, and it is gone. Throwing would leave `purgedAt` unset
        // for a record that is in fact clean.
        if (code === "ENOENT") return;
        throw error;
      }
    },
  };
}

/* ------------------------------------------------------------ s3 backend -- */

function createS3Backend(): StorageBackend {
  const client = new S3Client({
    region: ENV.s3Region || "us-east-1",
    endpoint: ENV.s3Endpoint || undefined,
    forcePathStyle: ENV.s3ForcePathStyle,
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  });
  const bucket = ENV.s3Bucket;

  return {
    name: "s3",
    async put(relKey, data, contentType = "application/octet-stream") {
      const key = appendHashSuffix(normalizeKey(relKey));
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      );
      return { key, url: `s3://${bucket}/${key}` };
    },
    async getSignedUrl(relKey, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
      const key = normalizeKey(relKey);
      return presign(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: ttlSeconds },
      );
    },
    async delete(relKey) {
      const key = normalizeKey(relKey);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/* -------------------------------------------------------------- selection -- */

let backend: StorageBackend | null = null;

export function getStorage(): StorageBackend {
  if (backend) return backend;
  const s3Configured =
    Boolean(ENV.s3Bucket) && Boolean(ENV.s3AccessKeyId) && Boolean(ENV.s3SecretAccessKey);
  backend = s3Configured ? createS3Backend() : createVolumeBackend();
  return backend;
}

/** Test seam: forces a specific backend for the duration of a test. */
export function __setStorageForTesting(next: StorageBackend | null): void {
  backend = next;
}

/**
 * Test seam: produces a signature without going through `getSignedUrl`.
 *
 * Needed to build the tamper cases a round-trip test cannot reach, such as a
 * signature replayed against another key or against an extended expiry.
 */
export function __signForTesting(key: string, expiresAt: number): string {
  return signUploadKey(key, expiresAt);
}

/* --------------------------------------------------------------- wrappers -- */
/*
 * Thin delegations to the active backend, kept so existing call sites in
 * db.ts, routers.ts and imageGeneration.ts read the same as before. They
 * deliberately expose no way to choose a backend: selection happens once, from
 * the environment, so no caller can end up writing an ID somewhere the signed
 * URL path does not cover.
 */

export function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<StoredObject> {
  return getStorage().put(relKey, data, contentType);
}

export function storageGetSignedUrl(relKey: string, ttlSeconds?: number): Promise<string> {
  return getStorage().getSignedUrl(relKey, ttlSeconds);
}

/**
 * Removes an object. Used by the ID retention job (OQ 3).
 *
 * A file that is already absent counts as success: the retention job is trying
 * to make a file absent, and propagating an error would fail the run for records
 * it had in fact already cleaned up, leaving `purgedAt` unset for no reason.
 * Each backend enforces that itself.
 */
export function storageDelete(relKey: string): Promise<void> {
  return getStorage().delete(relKey);
}

/**
 * Warns once at startup when uploads would land on an ephemeral filesystem.
 *
 * This deliberately warns rather than throws. Taking the whole app down because
 * no volume is attached would leave the client unable to test anything at all,
 * and the alternative — silently writing resident government IDs to a container
 * filesystem that is wiped on the next deploy — is unacceptable. So it shouts,
 * and the deployment checklist requires a volume before real data is entered.
 */
export function warnIfStorageIsEphemeral(): void {
  const active = getStorage();
  if (active.name === "s3") return;
  if (ENV.uploadDirIsExplicit) return;
  console.warn(
    [
      "",
      "[storage] WARNING: using the volume backend with no configured upload directory.",
      "[storage] Uploads are being written to " + uploadRoot(),
      "[storage] That path is inside the container filesystem and every file will be",
      "[storage] LOST on the next deploy or restart. Attach a Railway volume to the",
      "[storage] service, or set UPLOAD_DIR, before entering any real resident data.",
      "",
    ].join("\n"),
  );
}