export type CenterState = "OPEN" | "FULL" | "CLOSED" | "UNDER_MAINTENANCE" | "EMERGENCY_ONLY";
export type ResourceState = "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK" | "EXPIRED";

export function calculateCenterMetrics(maximumCapacity: number, currentOccupancy: number, status: CenterState) {
  const safeCapacity = Math.max(0, maximumCapacity);
  const safeOccupancy = Math.min(Math.max(0, currentOccupancy), safeCapacity);
  const availableSlots = safeCapacity - safeOccupancy;
  const occupancyRate = safeCapacity === 0 ? 0 : Math.round((safeOccupancy / safeCapacity) * 1000) / 10;
  return { availableSlots, occupancyRate, canAcceptEvacuee: status === "OPEN" && availableSlots > 0, nextStatus: availableSlots === 0 && status === "OPEN" ? "FULL" : status };
}

export function getResourceStatus(quantity: number, minimumStock: number, expirationDate?: Date | null, now = new Date()): ResourceState {
  if (expirationDate && expirationDate.getTime() < now.getTime()) return "EXPIRED";
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= minimumStock) return "LOW_STOCK";
  return "AVAILABLE";
}

export type ReportStatus = "PENDING" | "VERIFIED" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
export function canTransitionReport(current: ReportStatus, next: ReportStatus) {
  const transitions: Record<ReportStatus, ReportStatus[]> = { PENDING: ["VERIFIED", "REJECTED"], VERIFIED: ["IN_PROGRESS", "REJECTED"], IN_PROGRESS: ["RESOLVED"], RESOLVED: [], REJECTED: [] };
  return current === next || transitions[current].includes(next);
}

export type AlertTargetAudience =
  | "ALL_USERS"
  | "CITIZENS"
  | "STAFF"
  | "RESPONDERS"
  | "ADMIN";
export type OperationalAlert = {
  id: number;
  title: string;
  message: string;
  alertType: string;
  priority: string;
  targetAudience: AlertTargetAudience;
  isActive: boolean;
  createdAt: Date | string;
  /** Set when the alert was raised for a specific incident report. */
  reportId?: number | null;
};

/** Active alerts surfaced to a role: targeted audience plus public broadcasts. */
export function alertsVisibleToRole<T extends OperationalAlert>(
  alerts: T[] | undefined,
  role: string | undefined
): T[] {
  const list = (alerts ?? []).filter(alert => alert.isActive !== false);
  if (role === "responder")
    return list.filter(
      alert =>
        alert.targetAudience === "RESPONDERS" ||
        alert.targetAudience === "ALL_USERS"
    );
  if (role === "staff")
    return list.filter(
      alert =>
        alert.targetAudience === "STAFF" ||
        alert.targetAudience === "ALL_USERS"
    );
  return list; // admins see everything
}

/**
 * The assignment notification a responder receives (spec 4.1). It must carry
 * the incident identity, the complainant, what happened, where, when it was
 * reported, the current status, when it was assigned, and whether any
 * attachments are waiting — everything needed to act without opening the
 * incident first.
 */
export function describeAssignmentNotification(
  report: {
    id: number;
    reportCode?: string | null;
    description: string;
    location: string;
    complainantName?: string | null;
    reportedAt?: Date | string | null;
    status?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
  },
  options: { assignedAt: Date; attachmentCount: number }
): string {
  const code = report.reportCode || `Incident ${report.id}`;
  const reportedAt = report.reportedAt
    ? new Date(report.reportedAt).toLocaleString()
    : "an unrecorded time";
  const attachments =
    options.attachmentCount > 0
      ? ` ${options.attachmentCount} attachment${options.attachmentCount === 1 ? "" : "s"} on file — open the incident to view.`
      : " No attachments on file.";
  const coordinates =
    report.latitude != null && report.longitude != null
      ? ` Pin: https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`
      : "";
  return `${code} requires responder attention at ${report.location}: ${report.description}. Reporter: ${report.complainantName || "Unknown"}. Reported ${reportedAt}. Status: ${report.status || "IN_PROGRESS"}. Assigned ${options.assignedAt.toLocaleString()}.${attachments}${coordinates}`;
}

/**
 * Registry search (spec 5.30): a household listing is searchable by any of the
 * person's names, the linked account email, the household id, or the member id.
 * An empty query matches everything so the box is optional.
 */
export function evacueeMatchesSearch(
  row: {
    id: number;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    userEmail?: string | null;
    householdId?: number | null;
  },
  query: string
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    row.firstName,
    row.middleName ?? "",
    row.lastName,
    row.userEmail ?? "",
    row.householdId ?? "",
    row.id,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

export function resolveNotificationDelivery(config: { emailConfigured?: boolean; smsConfigured?: boolean }) {
  const channels = [config.emailConfigured ? "EMAIL" : null, config.smsConfigured ? "SMS" : null].filter(Boolean) as string[];
  return { channels: channels.length ? channels : ["IN_APP"], fallback: channels.length === 0 };
}

const legacyCitizenEmergencyLabel = /^citizen emergency$/i;

/** Short label stored as reportType for citizen submissions (max 80 chars). */
export function citizenReportTypeFromDanger(danger: string): string {
  // Split on line breaks before collapsing whitespace, otherwise the first-line
  // rule below never applies and a multi-line report becomes the whole headline.
  const firstLine = danger
    .split(/\r?\n/)
    .map(line => line.trim().replace(/\s+/g, " "))
    .find(Boolean);
  if (!firstLine) return "Emergency report";
  if (firstLine.length <= 80) return firstLine;
  return `${firstLine.slice(0, 77).trimEnd()}...`;
}

export function isCitizenSubmittedReportCode(reportCode: string): boolean {
  return reportCode.startsWith("CIT-");
}

/** Headline shown in incident lists; legacy rows used a fixed "Citizen emergency" type. */
export function getRiskReportHeadline(report: {
  reportCode: string;
  reportType: string;
  description?: string | null;
}): string {
  if (legacyCitizenEmergencyLabel.test(report.reportType.trim())) {
    const fromDescription = citizenReportTypeFromDanger(report.description ?? "");
    return fromDescription === "Emergency report" ? report.reportType : fromDescription;
  }
  return report.reportType;
}

export function compareNames(a: { lastName: string; firstName: string; middleName?: string | null }, b: { lastName: string; firstName: string; middleName?: string | null }) { return (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || '') || (a.middleName || '').localeCompare(b.middleName || ''); }
