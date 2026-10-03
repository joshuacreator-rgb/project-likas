import type { Express } from "express";
import fs from "node:fs/promises";
import { getStorage, resolveWithinRoot, verifyUploadSignature } from "../storage";

/**
 * Serves files held by the volume backend, and only with a valid signature.
 *
 * A request without `?exp` and `?sig` is refused, so the unsigned path returned
 * by `storagePut` serves nothing on its own. The signature covers the key and
 * the expiry and is verified in constant time, so a guessed key cannot be
 * walked into.
 *
 * When the S3 backend is active these URLs are not used at all: `getSignedUrl`
 * returns a bucket URL and the browser fetches from the bucket directly.
 */
export function registerUploadRoutes(app: Express) {
  app.get("/api/upload/*", async (req, res) => {
    const raw = (req.params as Record<string, string>)[0];
    if (!raw) {
      res.status(400).send("Missing storage key");
      return;
    }

    let key: string;
    try {
      key = raw
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");
    } catch {
      res.status(400).send("Malformed storage key");
      return;
    }

    const expiresAt = Number(req.query.exp);
    const signature = typeof req.query.sig === "string" ? req.query.sig : "";
    if (!verifyUploadSignature(key, expiresAt, signature)) {
      // 403 rather than 404: the key may well exist, and a 404 would tell
      // someone probing which keys are real.
      res.status(403).send("This link is invalid or has expired");
      return;
    }

    if (getStorage().name !== "volume") {
      // A signature minted by the volume backend, but the backend has since
      // changed, e.g. a volume was swapped for a bucket.
      res.status(404).send("Not found");
      return;
    }

    let target: string;
    try {
      target = resolveWithinRoot(key);
    } catch {
      res.status(403).send("Invalid storage key");
      return;
    }

    let bytes: Buffer;
    try {
      bytes = await fs.readFile(target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR") {
        res.status(404).send("Not found");
        return;
      }
      console.error("[upload] read failed for", key, error);
      res.status(500).send("Storage error");
      return;
    }

    // Force a download rather than letting a browser sniff resident-supplied
    // content as HTML and execute it in this origin.
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${basename(key).replace(/[^\w.\-]/g, "_")}"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(bytes.byteLength));
    res.end(bytes);
  });
}

function basename(key: string): string {
  const segments = key.split("/");
  return segments[segments.length - 1] ?? "download";
}