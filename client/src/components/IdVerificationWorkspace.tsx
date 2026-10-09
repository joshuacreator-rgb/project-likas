import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  evaluatePaterosResidency,
  formatBytes,
  idDocumentTypes,
  idRejectionReasons,
  idReviewStatusLabels,
  paterosBarangays,
  type IdDocumentType,
  type IdRejectionReason,
  type IdReviewStatus,
} from "../../../shared/idVerification";

/**
 * Valid ID review queue (US-2 / US-3).
 *
 * Who is admitted is decided by the router, not here; this component assumes
 * the caller is an administrator or centre staff member and renders accordingly.
 * Two rules from the accepted decisions shape what is on screen:
 *
 *   - OQ 7 admits centre staff to approve and decline. They are scoped by the
 *     server to their own centre, so this screen never shows an applicant the
 *     backend would then refuse to reveal.
 *   - Sub-decision 5.2(c) keeps deletion with administrators only, so the
 *     delete control is rendered for admins alone.
 *
 * The ID number field is masked before it is stored, so what staff type is never
 * recoverable afterwards. The full number is deliberately not retained.
 */

const documentTypeOptions = Object.entries(idDocumentTypes) as [
  IdDocumentType,
  { label: string },
][];

const rejectionReasonOptions = Object.entries(idRejectionReasons) as [
  IdRejectionReason,
  string,
][];

type QueueRow = {
  id: number;
  userId: number;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number | null;
  status: IdReviewStatus;
  createdAt: Date;
  centerId: number | null;
  applicantName: string | null;
  applicantFirstName: string | null;
  applicantLastName: string | null;
  applicantEmail: string | null;
  applicantPhone: string | null;
  declaredAddress: string | null;
  applicantAge: number | null;
  residency: {
    isPaterosResident: boolean;
    barangay: string | null;
    mentionsPaterosWithoutBarangay: boolean;
    explanation: string;
  };
};

type Props = {
  role: string;
};

function displayName(row: QueueRow) {
  const parts = [row.applicantFirstName, row.applicantLastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return row.applicantName || `Applicant ${row.userId}`;
}

export default function IdVerificationWorkspace({ role }: Props) {
  const isAdmin = role === "admin";
  const [status, setStatus] = useState<IdReviewStatus>("PENDING");
  const utils = trpc.useUtils();

  const queue = trpc.idVerification.queue.useQuery({ status });
  const reviewMutation = trpc.idVerification.review.useMutation({
    onSuccess: () => utils.idVerification.queue.invalidate(),
    onError: () => {},
  });
  const removeMutation = trpc.idVerification.remove.useMutation({
    onSuccess: () => utils.idVerification.queue.invalidate(),
  });
  const purgeMutation = trpc.idVerification.purgeExpired.useMutation();

  // The signed URL is fetched only when a reviewer asks to see a document, so
  // opening the queue does not mint a file URL for every row in it.
  const imageUrl = trpc.idVerification.imageUrl.useMutation();
  const [openImages, setOpenImages] = useState<Record<number, string>>({});
  const [showImageError, setShowImageError] = useState("");

  const [editing, setEditing] = useState<number | null>(null);
  const [idType, setIdType] = useState<IdDocumentType | "">("");
  const [idNumber, setIdNumber] = useState("");
  const [addressOnId, setAddressOnId] = useState("");
  const [rejectionReason, setRejectionReason] = useState<IdRejectionReason | "">("");
  const [rejectionNote, setRejectionNote] = useState("");
  const [decisionError, setDecisionError] = useState("");

  function startReview(row: QueueRow) {
    setEditing(row.id);
    setIdType("");
    setIdNumber("");
    setAddressOnId("");
    setRejectionReason("");
    setRejectionNote("");
    setDecisionError("");
  }

  async function decide(row: QueueRow, decision: "APPROVED" | "REJECTED") {
    setDecisionError("");
    try {
      await reviewMutation.mutateAsync({
        documentId: row.id,
        decision,
        idType: idType || null,
        idNumber: idNumber.trim() || null,
        addressOnId: addressOnId.trim() || null,
        rejectionReason: decision === "REJECTED" ? rejectionReason || null : null,
        rejectionNote: rejectionNote.trim() || null,
      });
      setEditing(null);
      if (decision === "APPROVED") {
        toast.success(`${displayName(row)} is approved as a Pateros resident.`);
      } else {
        toast.info(`${displayName(row)}'s application was declined.`);
      }
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "That decision could not be saved.");
    }
  }

  async function reveal(row: QueueRow) {
    setShowImageError("");
    try {
      const result = await imageUrl.mutateAsync({ id: row.id });
      setOpenImages(current => ({ ...current, [row.id]: result.url }));
    } catch (error) {
      setShowImageError(error instanceof Error ? error.message : "That ID could not be opened.");
    }
  }

  const rows = (queue.data ?? []) as unknown as QueueRow[];

  // Live residency read of the address the reviewer is typing on the ID. The
  // card badge above only ever reflects what was stored on an earlier review;
  // this one reacts keystroke-by-keystroke so the reviewer sees the verdict
  // before they commit to it.
  const typedAddress = addressOnId.trim();
  const liveResidency = evaluatePaterosResidency(typedAddress);
  // Client feedback (2026-10-09): "automatically approved when verified as a
  // Pateros residence" means the address printed on the ID, as the reviewer
  // types it — not only when a barangay name is present. A barangay match or an
  // address that names Pateros on its own both auto-approve; an address with no
  // Pateros reference stays with the reviewer's buttons. The effect below and
  // the note under the address field both key off `liveResidency`.

  // Auto-approve (client request): once the reviewer finishes typing an address
  // that verifies as a Pateros residence, the application approves itself
  // through the same audited review mutation the Approve button calls. The
  // short pause after typing separates intent from in-progress input. An
  // address with no Pateros reference stays with the reviewer's buttons.
  useEffect(() => {
    if (!editing || status !== "PENDING" || reviewMutation.isPending) return;
    const row = rows.find(candidate => candidate.id === editing);
    if (!row || row.status !== "PENDING") return;
    const residency = evaluatePaterosResidency(addressOnId.trim());
    if (!residency.isPaterosResident || !addressOnId.trim()) return;
    const timer = window.setTimeout(() => decide(row, "APPROVED"), 900);
    return () => window.clearTimeout(timer);
  }, [editing, status, rows, addressOnId, idType, idNumber, reviewMutation.isPending]);

  return (
    <section className="workspace-view panel">
      <div className="workspace-view-head">
        <div>
          <span className="eyebrow">Citizen registration</span>
          <h2>Valid ID verification</h2>
          <p>
            Confirm that each applicant lives in Pateros from the address printed on
            their ID. Any valid ID is accepted, so this is a judgement about
            residency, not about which document was presented.
          </p>
        </div>
        <div className="workspace-actions">
          <div className="id-review-bar">
            <div className="status-tabs" role="tablist" aria-label="Filter by decision">
              {(["PENDING", "APPROVED", "REJECTED"] as IdReviewStatus[]).map(option => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={status === option}
                  key={option}
                  onClick={() => setStatus(option)}
                >
                  {idReviewStatusLabels[option]}
                </button>
              ))}
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                disabled={purgeMutation.isPending}
                onClick={() => purgeMutation.mutate()}
              >
                {purgeMutation.isPending ? (
                  <LoaderCircle className="login-spinner" size={15} />
                ) : (
                  <Trash2 size={15} />
                )}
                Run retention sweep
              </Button>
            )}
          </div>
        </div>
      </div>

      {!isAdmin && (
        <p className="id-purge-note">
          You are seeing applicants assigned to your centre. Deleting a record and
          running the retention sweep stay with Administrators.
        </p>
      )}
      {isAdmin && (
        <p className="id-purge-note">
          The retention sweep deletes ID images whose retention period has ended:
          30 days after a decline, and a year after a deactivated resident&apos;s
          account closed. An approved ID for an active resident is never touched.
        </p>
      )}
      {(purgeMutation.data || purgeMutation.error) && (
        <div className="workspace-note" role="status">
          {purgeMutation.error
            ? purgeMutation.error.message
            : `${purgeMutation.data?.purged ?? 0} ID image(s) deleted, ${
                purgeMutation.data?.newlyScheduled ?? 0
              } newly scheduled for deletion.`}
        </div>
      )}
      {showImageError && <div className="login-error" role="alert">{showImageError}</div>}

      <div className="id-review-grid">
        {queue.isPending && (
          <div className="id-review-empty" role="status">
            <LoaderCircle className="login-spinner" size={16} /> Loading applications…
          </div>
        )}
        {!queue.isPending && rows.length === 0 && (
          <div className="id-review-empty">
            No {idReviewStatusLabels[status].toLowerCase()} applications.
          </div>
        )}

        {rows.map(row => {
          const url = openImages[row.id];
          const isEditing = editing === row.id;
          return (
            <article className="id-review-card" key={row.id}>
              <header>
                <div>
                  <h3>{displayName(row)}</h3>
                  <div className="id-review-meta">
                    {row.applicantEmail && <span>{row.applicantEmail}</span>}
                    {row.applicantPhone && <span>{row.applicantPhone}</span>}
                    {row.applicantAge !== null && <span>{row.applicantAge} years old</span>}
                    <span>
                      Uploaded {new Date(row.createdAt).toLocaleString()}
                      {row.sizeBytes ? ` · ${formatBytes(row.sizeBytes)}` : ""}
                    </span>
                  </div>
                  {row.declaredAddress && (
                    <div className="id-review-declared">
                      Address declared at registration: {row.declaredAddress}
                    </div>
                  )}
                </div>
                <span className={`pill ${row.status === "APPROVED" ? "ok" : row.status === "REJECTED" ? "warn" : ""}`}>
                  {idReviewStatusLabels[row.status]}
                </span>
              </header>

              <div
                className={`id-review-residency ${row.residency.isPaterosResident ? "match" : "unmatched"}`}
              >
                <b>
                  {row.residency.isPaterosResident
                    ? row.residency.mentionsPaterosWithoutBarangay
                      ? "Names Pateros, no barangay"
                      : `Pateros barangay: ${row.residency.barangay}`
                    : "No Pateros address recognised"}
                </b>
                {row.residency.explanation}
              </div>
              <p className="id-review-barangays">
                Pateros has ten barangays: {paterosBarangays.join(", ")}. An address
                that names Pateros without a barangay is accepted, but check it by eye
                against this list.
              </p>

              {url ? (
                row.mimeType === "application/pdf" ? (
                  <div className="id-review-pdf">
                    <FileText size={26} />
                    <span>{row.fileName ?? "ID document"} (PDF)</span>
                    <a href={url} target="_blank" rel="noreferrer" className="btn btn-outline">
                      Open in a new tab
                    </a>
                  </div>
                ) : (
                  <img className="id-review-image" src={url} alt={`ID uploaded by ${displayName(row)}`} />
                )
              ) : (
                <Button variant="outline" disabled={imageUrl.isPending} onClick={() => reveal(row)}>
                  <ShieldAlert size={15} /> Open ID image
                </Button>
              )}

              {row.status === "PENDING" && !isEditing && (
                <div className="id-review-actions">
                  <Button onClick={() => startReview(row)}>Review application</Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate({ id: row.id })}
                    >
                      <Trash2 size={15} /> Delete record
                    </Button>
                  )}
                </div>
              )}

              {row.status === "PENDING" && isEditing && (
                <div className="id-review-form">
                  <div className="id-review-form-row">
                    <label>
                      ID type
                      <select
                        value={idType}
                        onChange={event => setIdType(event.target.value as IdDocumentType | "")}
                      >
                        <option value="">Not recorded</option>
                        {documentTypeOptions.map(([value, meta]) => (
                          <option value={value} key={value}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      ID number (stored masked)
                      <Input
                        value={idNumber}
                        onChange={event => setIdNumber(event.target.value)}
                        placeholder="Recorded masked, never in full"
                        maxLength={60}
                      />
                    </label>
                  </div>
                  <label>
                    Address on the ID
                    <Input
                      value={addressOnId}
                      onChange={event => {
                        setAddressOnId(event.target.value);
                        setDecisionError("");
                      }}
                      placeholder="Copy the address exactly as printed on the ID"
                      maxLength={300}
                    />
                  </label>
                  {liveResidency.barangay ? (
                    <p className="id-auto-approve-note ok" role="status">
                      Verified Pateros barangay: <b>{liveResidency.barangay}</b>. This
                      application will be <b>approved automatically</b> once you stop
                      typing.
                    </p>
                  ) : liveResidency.mentionsPaterosWithoutBarangay ? (
                    <p className="id-auto-approve-note ok" role="status">
                      Address verified as a Pateros residence. This application will be{" "}
                      <b>approved automatically</b> once you stop typing.
                    </p>
                  ) : typedAddress ? (
                    <p className="id-auto-approve-note" role="status">
                      {liveResidency.explanation} Approve or decline by eye against the
                      barangay list.
                    </p>
                  ) : null}
                  <label>
                    Reason for declining
                    <select
                      value={rejectionReason}
                      onChange={event => setRejectionReason(event.target.value as IdRejectionReason | "")}
                    >
                      <option value="">Choose a reason</option>
                      {rejectionReasonOptions.map(([value, text]) => (
                        <option value={value} key={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Note to the applicant (optional)
                    <Input
                      value={rejectionNote}
                      onChange={event => setRejectionNote(event.target.value)}
                      placeholder="Keep this factual. Avoid opinions about the applicant."
                      maxLength={500}
                    />
                  </label>
                  {decisionError && (
                    <div className="login-error" role="alert">
                      {decisionError}
                    </div>
                  )}
                  <div className="id-review-actions">
                    <Button
                      disabled={reviewMutation.isPending}
                      onClick={() => decide(row, "APPROVED")}
                    >
                      <CheckCircle2 size={15} /> Approve as Pateros resident
                    </Button>
                    <Button
                      variant="outline"
                      disabled={reviewMutation.isPending || !rejectionReason}
                      onClick={() => decide(row, "REJECTED")}
                    >
                      <XCircle size={15} /> Decline application
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                  {!rejectionReason && (
                    <small className="id-purge-note">
                      Pick a reason before an application can be declined.
                    </small>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}