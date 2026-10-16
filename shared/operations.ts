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
/**
 * Spec 4.3/4.4 plus the client's two-button review flow (backlog §26): a
 * rejected report needs the note explaining why, and from any open state the
 * review actions work directly — Resolve lands on RESOLVED and Reject lands
 * on REJECTED. Only the closed states refuse further actions.
 */
export function canTransitionReport(current: ReportStatus, next: ReportStatus) {
  const transitions: Record<ReportStatus, ReportStatus[]> = { PENDING: ["VERIFIED", "RESOLVED", "REJECTED"], VERIFIED: ["IN_PROGRESS", "RESOLVED", "REJECTED"], IN_PROGRESS: ["RESOLVED", "REJECTED"], RESOLVED: [], REJECTED: [] };
  return current === next || transitions[current].includes(next);
}

/**
 * Client §30: once a report is closed (RESOLVED or REJECTED) responder
 * assignment is over. The incident modal disables its assignment controls with
 * this exact sentence and the server refuses the mutation with the same
 * wording, so the UI and the API speak with one voice.
 */
export const CLOSED_ASSIGNMENT_MESSAGES: Record<"RESOLVED" | "REJECTED", string> = {
  RESOLVED: "This incident has been resolved. Responder assignment is no longer available.",
  REJECTED: "This incident has been rejected. Responder assignment is no longer available.",
};

export function closedAssignmentMessage(status: string): string | null {
  return status === "RESOLVED" || status === "REJECTED"
    ? CLOSED_ASSIGNMENT_MESSAGES[status]
    : null;
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

/**
 * Client §26: staff are authorized recipients of incident notifications —
 * a new emergency, an assignment, or a rejection reaches staff alongside the
 * audience the row was stamped with (admin + responder), never duplicating a
 * row because delivery is a filter over the one alert.
 */
export const OPERATIONAL_ALERT_TYPES = ["CITIZEN_EMERGENCY", "INCIDENT_ASSIGNMENT", "INCIDENT_REJECTED"];

export function isOperationalAlert(alertType: string): boolean {
  return OPERATIONAL_ALERT_TYPES.includes(alertType);
}

/** Every role an alert is delivered to: its audience plus staff for incident operations. */
export function alertDeliveryRoles(alert: { alertType: string; targetAudience: AlertTargetAudience }): string[] {
  const roles = new Set<string>();
  if (isOperationalAlert(alert.alertType)) {
    roles.add("staff");
  }
  switch (alert.targetAudience) {
    case "ALL_USERS":
      ["admin", "staff", "responder", "citizen", "user"].forEach(role => roles.add(role));
      break;
    case "STAFF":
      roles.add("staff");
      break;
    case "RESPONDERS":
      roles.add("responder");
      break;
    case "ADMIN":
      roles.add("admin");
      break;
    case "CITIZENS":
      ["citizen", "user"].forEach(role => roles.add(role));
      break;
  }
  return Array.from(roles);
}

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
        alert.targetAudience === "ALL_USERS" ||
        isOperationalAlert(alert.alertType)
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

/**
 * Heading for an alert card, notification toast, or alert row (client §26):
 * the actual emergency name first. Legacy alerts stored a role-word title like
 * "HIGH citizen emergency"; for those rows the real name is the description
 * segment of "… reported at <location>: <description>."
 */
export function getAlertHeadline(alert: { title: string; message: string }): string {
  const title = alert.title.trim();
  if (!/citizen emergency$/i.test(title)) return title;
  const described = alert.message.split(/:\s+/).slice(1).join(": ").trim();
  return described ? citizenReportTypeFromDanger(described) : title;
}

export function compareNames(a: { lastName: string; firstName: string; middleName?: string | null }, b: { lastName: string; firstName: string; middleName?: string | null }) { return (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || '') || (a.middleName || '').localeCompare(b.middleName || ''); }
