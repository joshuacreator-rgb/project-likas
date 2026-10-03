/**
 * Valid ID verification domain logic (US-2 / US-3).
 *
 * Pure helpers only: no database, no React. Kept separate so the registration
 * form, the review queue, the authenticated file route and the retention job
 * all enforce the same rules.
 *
 * Client decisions this encodes (2026-10-03):
 *   OQ 1  Residency is proven by the address printed on the ID.
 *   OQ 2  All valid ID types are accepted. There is deliberately no whitelist,
 *         so nothing here tries to detect the document type from the image.
 *         Staff select the type during review.
 *   OQ 3  Two-tier retention: rejected and abandoned uploads are purged after
 *         30 days; approved ones survive while the account is active and are
 *         purged a year after deactivation.
 *   OQ 7  Center Staff may view and approve or decline, not only Administrators.
 *
 * Privacy note: an ID image is a government document belonging to a named
 * person. Nothing here may produce a publicly fetchable URL, and the ID number
 * is stored masked rather than in full.
 */

/** Retention tiers, in days. See section 5.1 of the backlog. */
export const ID_RETENTION_DAYS = {
  /** Rejected applicants, and uploads nobody ever reviewed. */
  rejected: 30,
  abandoned: 30,
  /** Days after an account is deactivated before its ID is purged. */
  deactivated: 365,
} as const;

export const ID_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Accepted upload formats. Images and PDF only. The client accepts every valid
 * ID type, so this list constrains the *container format*, not the document
 * type — PhilSys, Barangay ID and driver's licence are all images here.
 */
export const idImageMimeTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
} as const;

export type IdImageMimeType = keyof typeof idImageMimeTypes;

export function isAllowedIdMimeType(value: string): value is IdImageMimeType {
  return Object.prototype.hasOwnProperty.call(idImageMimeTypes, value.toLowerCase());
}

export type IdSizeCheck = { ok: true } | { ok: false; message: string };

export function checkIdFileSize(bytes: number): IdSizeCheck {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, message: "The selected file is empty." };
  }
  if (bytes > ID_MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${formatBytes(bytes)}. The maximum is ${formatBytes(ID_MAX_BYTES)}.`,
    };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Document types staff can record. OQ 2 accepts any valid ID, so this is a
 * convenience list for the reviewer, not an allowlist. `OTHER` exists so an
 * unusual but legitimate document is never blocked by the absence of an entry.
 */
export const idDocumentTypes = {
  PHILSYS: { label: "PhilSys ID" },
  BARANGAY_ID: { label: "Barangay ID" },
  DRIVERS_LICENSE: { label: "Driver's licence" },
  PASSPORT: { label: "Passport" },
  POSTAL_ID: { label: "Postal ID" },
  UTILITY_BILL: { label: "Utility bill" },
  LAND_TITLE: { label: "Land title / tax declaration" },
  OTHER: { label: "Other valid ID" },
} as const;

export type IdDocumentType = keyof typeof idDocumentTypes;

export function isIdDocumentType(value: string): value is IdDocumentType {
  return Object.prototype.hasOwnProperty.call(idDocumentTypes, value);
}

/** Review states. Mirrors the advice status pattern rather than hard deletes. */
export type IdReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export const idReviewStatusLabels: Record<IdReviewStatus, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Declined",
};

/**
 * Decline reasons. Recorded verbatim against the application so the basis for
 * a decision can be explained later. Staff free text is deliberately absent:
 * an open text box on a decline reason tends to collect anything, including
 * things that should not be written about a named applicant.
 */
export const idRejectionReasons = {
  NOT_A_PATEROS_RESIDENT: "Address on the ID is outside Pateros",
  ADDRESS_UNREADABLE: "Address on the ID could not be read",
  ID_UNREADABLE: "ID is unclear, cropped, or unreadable",
  ID_EXPIRED: "ID is expired",
  ID_TYPE_NOT_ACCEPTED: "Document is not a valid ID",
  RESUBMIT: "Please upload a clearer ID",
} as const;

export type IdRejectionReason = keyof typeof idRejectionReasons;

export function isIdRejectionReason(value: string): value is IdRejectionReason {
  return Object.prototype.hasOwnProperty.call(idRejectionReasons, value);
}

/**
 * The ten barangays of the Municipality of Pateros.
 *
 * Note: Pateros is officially a *municipality*, the only one in Metro Manila,
 * not a city. Source: Pateros municipal government "Facts & Figures", via PSA.
 *
 * Spelled-out variants are included because IDs are typed by hand at the
 * registrant's own pace and abbreviations vary between issuers.
 */
export const paterosBarangays: readonly string[] = [
  "Aguho",
  "Magtanggol",
  "Martires Del 96",
  "Poblacion",
  "San Pedro",
  "San Roque",
  "Santa Ana",
  "Santo Rosario Kanluran",
  "Santo Rosario Silangan",
  "Tabacalera",
];

/**
 * Spellings seen on IDs and in typed addresses that mean the same barangay.
 * Longest variants are listed first so a fuller abbreviation is preferred over
 * a shorter prefix that could also match.
 */
const BARANGAY_ALIASES: Record<string, string> = {
  "santo rosario kanluran": "Santo Rosario Kanluran",
  "sto rosario kanluran": "Santo Rosario Kanluran",
  "santo rosario silangan": "Santo Rosario Silangan",
  "sto rosario silangan": "Santo Rosario Silangan",
  "martires del 96": "Martires Del 96",
  "martirez del 96": "Martires Del 96",
  poblacion: "Poblacion",
  agoho: "Aguho",
  "santa ana": "Santa Ana",
  "sta ana": "Santa Ana",
};

/** Municipality names that also contain the word Pateros. */
const PATEROS_SELF_REFERENCES = ["pateros", "municipality of pateros", "bayan ng pateros"];

export type PaterosResidencyResult = {
  /** True when the address places the applicant in Pateros. */
  isPaterosResident: boolean;
  /** The matched barangay, when one was recognised. */
  barangay: string | null;
  /**
   * True when the address mentions Pateros but names no barangay. Per the
   * accepted recommendation this counts as a resident rather than being held
   * for clarification: rejecting a genuine resident over a missing barangay
   * line is the worse failure.
   */
  mentionsPaterosWithoutBarangay: boolean;
  /** Why the address was or was not accepted, for display to staff. */
  explanation: string;
};

/**
 * Decides whether an address printed on an ID places the applicant in Pateros.
 *
 * Deliberately advisory. It reads an address string and reports what it found;
 * it does not approve or reject anyone. OQ 2 means no ID type is verified, so
 * staff judgement remains the control and this exists to save them typing.
 */
export function evaluatePaterosResidency(address: string | null | undefined): PaterosResidencyResult {
  const raw = (address ?? "").toLowerCase().trim();
  const normalised = raw.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

  if (!normalised) {
    return {
      isPaterosResident: false,
      barangay: null,
      mentionsPaterosWithoutBarangay: false,
      explanation: "No address was recorded.",
    };
  }

  // A barangay name is the strongest signal, so it is checked first. Some IDs
  // print the barangay without ever saying Pateros.
  for (const barangay of paterosBarangays) {
    if (containsPhrase(normalised, barangay.toLowerCase())) {
      return {
        isPaterosResident: true,
        barangay,
        mentionsPaterosWithoutBarangay: false,
        explanation: `Matched Pateros barangay "${barangay}".`,
      };
    }
  }

  for (const [alias, canonical] of Object.entries(BARANGAY_ALIASES)) {
    if (containsPhrase(normalised, alias)) {
      return {
        isPaterosResident: true,
        barangay: canonical,
        mentionsPaterosWithoutBarangay: false,
        explanation: `Matched Pateros barangay "${canonical}" via an alternate spelling.`,
      };
    }
  }

  const saysPateros = PATEROS_SELF_REFERENCES.some(reference =>
    containsPhrase(normalised, reference),
  );

  if (saysPateros) {
    return {
      isPaterosResident: true,
      barangay: null,
      mentionsPaterosWithoutBarangay: true,
      explanation:
        "The address names Pateros but does not name a barangay. Accepted as a Pateros resident; confirm against the ten barangays by eye.",
    };
  }

  return {
    isPaterosResident: false,
    barangay: null,
    mentionsPaterosWithoutBarangay: false,
    explanation:
      "No Pateros barangay or municipality reference was found. Check the address against the ten Pateros barangays.",
  };
}

/**
 * Whole-token containment. A plain `includes` would match "San Roque" inside a
 * longer word or an unrelated string, so match on token boundaries instead.
 */
function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = phrase.trim();
  if (!needle) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(needle)}(\\s|$)`).test(haystack);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Masks an ID number so two applicants can be told apart without storing a
 * complete, reusable identifier. Keeps a short prefix and suffix.
 *
 * Anything shorter than 6 characters is fully masked, since a partial short
 * string would reveal too much of what little there is.
 */
export function maskIdNumber(value: string | null | undefined): string {
  const raw = (value ?? "").replace(/\s+/g, "").trim();
  if (!raw) return "";
  if (raw.length < 6) return "*".repeat(raw.length);
  const head = raw.slice(0, 3);
  const tail = raw.slice(-2);
  return `${head}${"*".repeat(Math.max(3, raw.length - 5))}${tail}`;
}

/**
 * Computes the date an ID image may be deleted, so cleanup is a single indexed
 * scan on `purgeAfter` rather than a per-row date calculation.
 *
 * Returns `null` for an approved ID whose account is still active. That null is
 * meaningful, not an oversight: it *is* the "keep while active" half of OQ 3.
 * Dating from approval instead would delete the ID of a resident who never
 * stopped being an active member of the community, a year after they registered.
 * The date is only assigned once `users.deactivatedAt` is populated, at which
 * point the sweep starts counting from that date.
 */
export function computeIdPurgeDate(params: {
  status: IdReviewStatus;
  reviewedAt?: Date | string | null;
  uploadedAt?: Date | string | null;
  accountDeactivatedAt?: Date | string | null;
  now?: Date;
}): Date | null {
  const now = params.now ?? new Date();
  const addDays = (from: Date, days: number) =>
    new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  if (params.status === "REJECTED") {
    return addDays(toDate(params.reviewedAt) ?? now, ID_RETENTION_DAYS.rejected);
  }

  if (params.status === "APPROVED") {
    const deactivated = toDate(params.accountDeactivatedAt);
    return deactivated ? addDays(deactivated, ID_RETENTION_DAYS.deactivated) : null;
  }

  // PENDING: nobody has decided yet. Treated as abandoned, because an upload
  // left unreviewed serves no purpose and holding it is the data privacy
  // problem rather than the solution.
  return addDays(toDate(params.uploadedAt) ?? now, ID_RETENTION_DAYS.abandoned);
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isIdPurgeable(params: { purgeAfter: Date | string | null; now?: Date }): boolean {
  const purgeAfter = toDate(params.purgeAfter);
  if (!purgeAfter) return false;
  return purgeAfter.getTime() <= (params.now ?? new Date()).getTime();
}

/**
 * Who may do what with an ID document. Encodes OQ 7 (staff may review) and the
 * accepted sub-decision that staff may not delete, because deletion is
 * irreversible and stays with administrators.
 */
export const idReviewPermissions = {
  /** View an ID image. Admins and centre staff. */
  canView: (role: string) => role === "admin" || role === "staff",
  /** Approve or decline. Admins and centre staff. */
  canDecide: (role: string) => role === "admin" || role === "staff",
  /** Delete a record. Admins only. */
  canDelete: (role: string) => role === "admin",
} as const;

export function canReviewIdDocuments(role: string | null | undefined): boolean {
  return idReviewPermissions.canDecide(role ?? "");
}

/** Human-readable list for the review screen, so staff know what is expected. */
export const paterosBarangayListForDisplay = paterosBarangays.join(", ");

export const residencyHelpText =
  `Pateros has ten barangays: ${paterosBarangayListForDisplay}. ` +
  "An address that names Pateros without a barangay is accepted, but check it by eye.";