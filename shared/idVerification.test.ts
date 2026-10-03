import { describe, expect, it } from "vitest";
import {
  ID_MAX_BYTES,
  canReviewIdDocuments,
  checkIdFileSize,
  computeIdPurgeDate,
  evaluatePaterosResidency,
  formatBytes,
  idReviewPermissions,
  isAllowedIdMimeType,
  isIdDocumentType,
  isIdPurgeable,
  isIdRejectionReason,
  maskIdNumber,
  paterosBarangays,
} from "./idVerification";

describe("paterosBarangays", () => {
  it("lists the ten barangays of the Municipality of Pateros", () => {
    expect(paterosBarangays).toHaveLength(10);
    expect(paterosBarangays).toContain("Aguho");
    expect(paterosBarangays).toContain("Santa Ana");
    expect(paterosBarangays).toContain("Santo Rosario Kanluran");
  });
});

describe("evaluatePaterosResidency", () => {
  it("matches a barangay name", () => {
    const result = evaluatePaterosResidency("123 Katipunan Ave, Poblacion, Pateros");
    expect(result.isPaterosResident).toBe(true);
    expect(result.barangay).toBe("Poblacion");
    expect(result.mentionsPaterosWithoutBarangay).toBe(false);
  });

  it("matches a barangay even when Pateros is not mentioned", () => {
    const result = evaluatePaterosResidency("45 San Roque St., San Roque");
    expect(result.isPaterosResident).toBe(true);
    expect(result.barangay).toBe("San Roque");
  });

  it("accepts an address naming Pateros with no barangay", () => {
    const result = evaluatePaterosResidency("88 Rizal Ave, Pateros, Metro Manila");
    expect(result.isPaterosResident).toBe(true);
    expect(result.barangay).toBeNull();
    expect(result.mentionsPaterosWithoutBarangay).toBe(true);
    expect(result.explanation).toMatch(/by eye/i);
  });

  it("resolves the Santo Rosario spelling variants", () => {
    expect(evaluatePaterosResidency("9 Kantonal, Sto. Rosario Silangan, Pateros").barangay).toBe(
      "Santo Rosario Silangan",
    );
    expect(evaluatePaterosResidency("9 Kanluran, Santo Rosario Kanluran").barangay).toBe(
      "Santo Rosario Kanluran",
    );
  });

  it("resolves Martires/Martirez and Sta. Ana variants", () => {
    expect(evaluatePaterosResidency("2 Mabini, Martirez del 96").barangay).toBe("Martires Del 96");
    expect(evaluatePaterosResidency("7 Sta. Ana, Pateros").barangay).toBe("Santa Ana");
  });

  it("rejects an address outside Pateros", () => {
    const result = evaluatePaterosResidency("17 Katipunan, Quezon City");
    expect(result.isPaterosResident).toBe(false);
    expect(result.barangay).toBeNull();
  });

  it("rejects a Taguig address even though Taguig borders Pateros", () => {
    expect(evaluatePaterosResidency("3 Main St., Taguig City").isPaterosResident).toBe(false);
  });

  it("does not match a barangay name embedded in a longer word", () => {
    expect(evaluatePaterosResidency("99 San Roqueles Village, Taguig").isPaterosResident).toBe(false);
  });

  it("handles an empty or missing address", () => {
    expect(evaluatePaterosResidency("").isPaterosResident).toBe(false);
    expect(evaluatePaterosResidency(null).explanation).toMatch(/no address/i);
    expect(evaluatePaterosResidency(undefined).isPaterosResident).toBe(false);
  });

  it("is case and punctuation insensitive", () => {
    expect(evaluatePaterosResidency("poblacion, pateros.").barangay).toBe("Poblacion");
    expect(evaluatePaterosResidency("POBLACION").isPaterosResident).toBe(true);
  });
});

describe("maskIdNumber", () => {
  it("keeps a short prefix and suffix", () => {
    expect(maskIdNumber("1234-5678-9012")).toBe("123*********12");
  });

  it("fully masks anything too short to reveal safely", () => {
    expect(maskIdNumber("12345")).toBe("*****");
    expect(maskIdNumber("1")).toBe("*");
  });

  it("returns an empty string for no value", () => {
    expect(maskIdNumber(null)).toBe("");
    expect(maskIdNumber(undefined)).toBe("");
    expect(maskIdNumber("")).toBe("");
  });

  it("strips whitespace before masking", () => {
    expect(maskIdNumber("  1234 5678 9012  ")).toBe(maskIdNumber("123456789012"));
  });

  it("never returns the full number for a realistic ID", () => {
    const masked = maskIdNumber("ABCD123456789");
    expect(masked).not.toBe("ABCD123456789");
    expect(masked.startsWith("ABC")).toBe(true);
  });
});

describe("retention", () => {
  const now = new Date("2026-10-03T00:00:00.000Z");
  const days = (n: number) => n * 24 * 60 * 60 * 1000;

  it("purges a rejected ID 30 days after the decision", () => {
    const reviewed = new Date("2026-10-01T00:00:00.000Z");
    const purge = computeIdPurgeDate({ status: "REJECTED", reviewedAt: reviewed, now });
    expect(purge.getTime() - reviewed.getTime()).toBe(days(30));
  });

  it("purges an abandoned upload 30 days after it was uploaded", () => {
    const uploaded = new Date("2026-09-20T00:00:00.000Z");
    const purge = computeIdPurgeDate({ status: "PENDING", uploadedAt: uploaded, now });
    expect(purge.getTime() - uploaded.getTime()).toBe(days(30));
  });

  it("keeps an approved ID for a year after deactivation", () => {
    const deactivated = new Date("2026-09-01T00:00:00.000Z");
    const purge = computeIdPurgeDate({
      status: "APPROVED",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      accountDeactivatedAt: deactivated,
      now,
    });
    expect(purge).not.toBeNull();
    expect(purge!.getTime() - deactivated.getTime()).toBe(days(365));
  });

  it("schedules no deletion for an approved ID whose account is still active", () => {
    // The "keep while active" half of OQ 3. Dating the purge from approval
    // instead would delete the ID of a resident who never left the community,
    // one year after registering.
    expect(
      computeIdPurgeDate({ status: "APPROVED", reviewedAt: "2026-01-01T00:00:00.000Z", now }),
    ).toBeNull();
  });

  it("treats a missing deactivation date as still active, not as approved a year ago", () => {
    expect(computeIdPurgeDate({ status: "APPROVED", reviewedAt: now, accountDeactivatedAt: null, now })).toBeNull();
  });

  it("falls back to now when timestamps are missing", () => {
    expect(computeIdPurgeDate({ status: "REJECTED", now }).getTime()).toBe(now.getTime() + days(30));
  });

  it("only reports purgeable once the date has passed", () => {
    expect(isIdPurgeable({ purgeAfter: new Date(now.getTime() - 1000), now })).toBe(true);
    expect(isIdPurgeable({ purgeAfter: new Date(now.getTime() + 1000), now })).toBe(false);
    expect(isIdPurgeable({ purgeAfter: null, now })).toBe(false);
  });
});

describe("upload validation", () => {
  it("accepts the agreed image and PDF formats", () => {
    expect(isAllowedIdMimeType("image/jpeg")).toBe(true);
    expect(isAllowedIdMimeType("image/png")).toBe(true);
    expect(isAllowedIdMimeType("application/pdf")).toBe(true);
    expect(isAllowedIdMimeType("IMAGE/JPEG")).toBe(true);
  });

  it("rejects formats that are not ID documents", () => {
    expect(isAllowedIdMimeType("video/mp4")).toBe(false);
    expect(isAllowedIdMimeType("application/zip")).toBe(false);
    expect(isAllowedIdMimeType("")).toBe(false);
  });

  it("caps the file size", () => {
    expect(checkIdFileSize(ID_MAX_BYTES).ok).toBe(true);
    const over = checkIdFileSize(ID_MAX_BYTES + 1);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toMatch(/maximum is/);
  });

  it("rejects an empty file", () => {
    expect(checkIdFileSize(0).ok).toBe(false);
  });

  it("formats sizes for display", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("review permissions (OQ 7)", () => {
  it("lets administrators and centre staff view and decide", () => {
    for (const role of ["admin", "staff"]) {
      expect(idReviewPermissions.canView(role)).toBe(true);
      expect(idReviewPermissions.canDecide(role)).toBe(true);
    }
  });

  it("keeps deletion with administrators only", () => {
    expect(idReviewPermissions.canDelete("admin")).toBe(true);
    expect(idReviewPermissions.canDelete("staff")).toBe(false);
  });

  it("refuses citizens, responders and anonymous callers", () => {
    for (const role of ["citizen", "responder", "user", ""]) {
      expect(idReviewPermissions.canView(role)).toBe(false);
      expect(idReviewPermissions.canDecide(role)).toBe(false);
    }
    expect(canReviewIdDocuments(null)).toBe(false);
  });
});

describe("enumerations", () => {
  it("recognises known document types and rejection reasons", () => {
    expect(isIdDocumentType("PHILSYS")).toBe(true);
    expect(isIdDocumentType("BARANGAY_ID")).toBe(true);
    expect(isIdRejectionReason("NOT_A_PATEROS_RESIDENT")).toBe(true);
  });

  it("offers OTHER so an unusual valid ID is never blocked", () => {
    expect(isIdDocumentType("OTHER")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isIdDocumentType("SOMETHING_ELSE")).toBe(false);
    expect(isIdRejectionReason("because_i_said_so")).toBe(false);
  });
});