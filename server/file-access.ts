/**
 * Authorization and audit for opening a resident-supplied file.
 *
 * Sits apart from the HTTP route so it can be tested without a server, and so
 * the route stays a thin shell: authenticate, ask, stream, or refuse.
 *
 * Every outcome writes an activity row before anything is served. The order
 * matters — audit first, bytes second — because a log written after the response
 * is a log that is skipped whenever the connection drops mid-transfer, which is
 * precisely when someone would most want to know what was opened.
 */

import type { User } from "../drizzle/schema";
import { getEvidenceById, getRiskReportById, logActivity } from "./db";
import { accessDenialReason, canAccessReport } from "./report-access";

/**
 * 404 for both "no such file" and "you may not have this file".
 *
 * Evidence ids are sequential integers, so a 403 on some and a 404 on others
 * would tell an authenticated prober exactly which ids exist and belong to
 * someone else. The denial is still written to the activity log, so nothing is
 * lost by not telling the caller.
 */
export type FileOpenFailure = { ok: false; status: 404 };
export type FileOpenSuccess = {
  ok: true;
  fileKey: string;
  fileName: string;
  mimeType: string;
  reportId: number;
};
export type FileOpenResult = FileOpenSuccess | FileOpenFailure;

const refused: FileOpenFailure = { ok: false, status: 404 };

/**
 * Resolves an evidence file to a storage key, having satisfied three things:
 * the file exists, its report exists, and this user may reach that report.
 *
 * The storage key never leaves this module unreturned, and `fileUrl` is
 * deliberately not echoed back — the column holds an unsigned `/api/upload/...`
 * path that returns 403, so handing it to a caller would be handing over a
 * link that cannot be fetched.
 */
export async function openEvidence(
  user: User,
  evidenceId: number,
): Promise<FileOpenResult> {
  const file = await getEvidenceById(evidenceId);
  // A FAILED row (US-7 AC 4) has no file behind it. Refusing it here keeps the
  // "no such file" and "not yours" answers identical, and the row still serves
  // its purpose in the gallery list, which reads `status` rather than the key.
  if (!file || file.status !== "STORED") return refused;

  const report = await getRiskReportById(file.reportId);
  if (!report) return refused;

  if (!canAccessReport(user, report)) {
    await logActivity({
      actorId: user.id,
      action: "EVIDENCE_ACCESS_DENIED",
      entityType: "evidence_file",
      entityId: file.id,
      metadata: JSON.stringify({
        reportId: file.reportId,
        reason: accessDenialReason(user),
        requesterRole: user.role,
      }),
    });
    return refused;
  }

  await logActivity({
    actorId: user.id,
    action: "EVIDENCE_VIEWED",
    entityType: "evidence_file",
    entityId: file.id,
    metadata: JSON.stringify({
      reportId: file.reportId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    }),
  });

  return {
    ok: true,
    fileKey: file.fileKey,
    fileName: file.fileName,
    mimeType: file.mimeType,
    reportId: file.reportId,
  };
}
