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
