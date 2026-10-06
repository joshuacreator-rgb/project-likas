/**
 * Photo attachments for an emergency report (US-5).
 *
 * A module rather than logic inside `CitizenHome` for one reason, recorded in
 * section 12.3 of the backlog: US-6 wants this exact interface with a
 * different transport, because a 30-second video cannot travel as base64
 * through a tRPC call. Everything that decides *what* is accepted and *what
 * each file's status is* lives here, and only `EvidenceSend` describes *how*
 * it travels. Swapping the transport then changes this file's sender and
 * nothing in the UI.
 *
 * The statuses are the feature, not decoration. US-5 acceptance criterion 6
 * and US-7 acceptance criterion 4 both describe a resident whose connection
 * dropped mid-upload: the report must already be saved, the photo must be
 * visibly pending rather than silently gone, and it must send itself when the
 * connection returns. A file input with no state machine cannot express any of
 * that, which is why this carries per-file status rather than a single
 * `uploading` flag.
 */

/** Every attachment is held in memory as a `File` until it is sent. */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10_000_000;

/**
 * Why a chosen file was not accepted.
 *
 * Codes rather than strings so `CitizenHome` can render them in the resident's
 * language — the page speaks English and Filipino and a rejection is exactly
 * the moment a resident needs to read the reason rather than guess it.
 */
export type AttachmentRejection = "TOO_MANY" | "TOO_LARGE" | "UNSUPPORTED";

export type AttachmentStatus = "ready" | "uploading" | "sent" | "failed";

export type Attachment = {
  id: string;
  file: File;
  status: AttachmentStatus;
};

/**
 * How a file travels.
 *
 * Injected rather than imported so this module never reaches for the tRPC
 * client itself, which is what keeps the transport swappable. The concrete
 * sender in `CitizenHome` is one call to `trpc.operations.uploadEvidence`.
 */
export type EvidenceSend = (input: {
  reportId: number;
  fileName: string;
  dataBase64: string;
}) => Promise<unknown>;

let attachmentSequence = 0;

function nextId(): string {
  attachmentSequence += 1;
  return `att-${Date.now()}-${attachmentSequence}`;
}

function isSupportedDeclaredType(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.type.startsWith("image/");
}

/**
 * Whether this file may be added, given how many are already held.
 *
 * Order matters: `TOO_MANY` first so a resident who picks twelve photos at
 * once is told the count rather than being walked through them one oversized
 * file at a time.
 *
 * All three checks are advisory and every one of them is re-done on the
 * server. The size and count are enforced by `prepareEvidencePayload` and by
 * the zod input, and the *type* is decided from the bytes by `detectFileType`
 * rather than from `file.type`, which is a value the browser reports and an
 * attacker can replace. This exists to give a resident an answer immediately;
 * it is not what the rule rests on.
 */
export function rejectionFor(
  file: File,
  currentCount: number,
): AttachmentRejection | null {
  if (currentCount >= MAX_ATTACHMENTS) return "TOO_MANY";
  if (file.size > MAX_ATTACHMENT_BYTES) return "TOO_LARGE";
  if (!isSupportedDeclaredType(file)) return "UNSUPPORTED";
  return null;
}

/**
 * Splits a chosen set into accepted and rejected, preserving the resident's
 * picking order so thumbnails appear in the order they chose them.
 */
export function classifyAttachments(
  files: File[],
  existing: Attachment[],
): { accepted: Attachment[]; rejected: AttachmentRejection[] } {
  const accepted: Attachment[] = [];
  const rejected: AttachmentRejection[] = [];

  for (const file of files) {
    const rejection = rejectionFor(file, existing.length + accepted.length);
    if (rejection) rejected.push(rejection);
    else accepted.push({ id: nextId(), file, status: "ready" });
  }

  return { accepted, rejected };
}

/**
 * Reads a file as a base64 data URL for the tRPC transport.
 *
 * The server strips the `data:...;base64,` prefix itself, so the prefix being
 * here is a transport detail and nothing downstream may depend on its shape.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read the file."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Sends one attachment and returns its new status.
 *
 * Never throws. The whole point of acceptance criterion 6 is that one failed
 * upload must not take the report down with it or hide which file failed, so
 * the failure is reported as data and the caller decides what to show.
 */
export async function uploadAttachment(
  reportId: number,
  attachment: Attachment,
  send: EvidenceSend,
): Promise<Attachment> {
  try {
    const dataBase64 = await readFileAsDataUrl(attachment.file);
    await send({ reportId, fileName: attachment.file.name, dataBase64 });
    return { ...attachment, status: "sent" };
  } catch {
    return { ...attachment, status: "failed" };
  }
}

/**
 * Sends every attachment still outstanding, in order, one at a time.
 *
 * Sequential on purpose. Three 10 MB payloads in flight at once on a phone
 * tethered to congested mobile data during a storm is the exact environment
 * this feature is for, and parallel uploads there fail more often than they
 * save time. Partial progress is preserved: files already `sent` are skipped,
 * so a retry after a dropped connection resumes rather than duplicating.
 */
export async function uploadPending(
  reportId: number,
  attachments: Attachment[],
  send: EvidenceSend,
): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (const attachment of attachments) {
    if (attachment.status === "sent") {
      result.push(attachment);
      continue;
    }
    result.push(await uploadAttachment(reportId, attachment, send));
  }
  return result;
}

export function countByStatus(
  attachments: Attachment[],
  status: AttachmentStatus,
): number {
  return attachments.filter(attachment => attachment.status === status).length;
}

/** True when the resident is still waiting for at least one photo to arrive. */
export function hasOutstanding(attachments: Attachment[]): boolean {
  return attachments.some(
    attachment => attachment.status === "ready" || attachment.status === "failed",
  );
}
