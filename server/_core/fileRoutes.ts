import type { Express, Request, Response } from "express";
import { detectFileType, isAllowedEvidenceType } from "../file-signature";
import { openEvidence } from "../file-access";
import { storageGet } from "../storage";
import { authenticateRequest } from "./context";

/**
 * Serves resident files to a caller who has been authorized for them.
 *
 * Contrast `/api/upload/*` in `uploadRoutes.ts`, which serves to anyone holding
 * a valid signature — a capability URL. That is the right shape for a short
 * presigned link and the wrong shape for browsing a resident's emergency
 * photographs, because nothing on that path knows who is asking and nothing on
 * that path writes down that they asked.
 *
 * This route does both on every request. The audit row is written before any
 * byte leaves: a log written after the response is a log that gets skipped
 * whenever a connection drops mid-transfer, which is exactly when someone would
 * want to know what was opened.
 *
 * `openEvidence` answers 404 for both "no such file" and "not yours", because
 * evidence ids are sequential and a 403 would confirm to an authenticated
 * prober which ids exist.
 */
export function registerFileRoutes(app: Express) {
  app.get("/api/files/evidence/:id", async (req: Request, res: Response) => {
    const user = await authenticateRequest(req);
    if (!user) {
      // The gallery is same-origin and cookie-carrying, so a signed-out visitor
      // has no way to reach this point without it being deliberate.
      res.status(401).end();
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).end();
      return;
    }

    const opened = await openEvidence(user, id);
    if (!opened.ok) {
      res.status(opened.status).end();
      return;
    }

    let bytes: Buffer;
    try {
      bytes = await storageGet(opened.fileKey);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR") {
        // The row outlived the file. Retention, a volume swap, or a redeploy
        // onto an ephemeral filesystem will each do this.
        res.status(404).end();
        return;
      }
      console.error("[files] read failed for evidence", opened.reportId, error);
      res.status(500).end();
      return;
    }

    /**
     * The type is read from the bytes on every request, not taken from the
     * database row.
     *
     * Rows written before `detectFileType` was introduced trusted the client's
     * declared type, so one of those could be an HTML document stored under
     * `image/png`. Checking the stored column would inherit that. Checking the
     * bytes means the worst a legacy or tampered row can do is get served as a
     * download, which is the same outcome as any other unrecognised file.
     */
    const detected = detectFileType(bytes);
    const mimeType = detected?.mimeType ?? "";
    const renderInline = mimeType !== "" && isAllowedEvidenceType(mimeType) && mimeType.startsWith("image/");

    if (renderInline) {
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", "inline");
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${basename(opened.fileName)}"`,
      );
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    // Resident images are not for other origins to embed: a report photographed
    // by a citizen is not an asset for a third party's page.
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    // Private and uncached. These are per-authorization responses — a shared
    // cache holding one would serve it to whoever asked next.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", String(bytes.byteLength));
    res.end(bytes);
  });
}

/**
 * Folds the stored filename down to something safe to quote in a header.
 *
 * `fileName` was already sanitised on upload, but a header is not the place to
 * rely on a check made at another time by another function, and a quoted string
 * in `Content-Disposition` is an injection surface if it ever is not.
 */
function basename(fileName: string): string {
  const segment = fileName.split(/[\\/]/).pop() ?? "evidence";
  return segment.replace(/[^\w.\-]/g, "_") || "evidence";
}
