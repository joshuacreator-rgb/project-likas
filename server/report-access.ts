/**
 * Who may reach a risk report and its attachments.
 *
 * One definition, used by three call sites: `operations.uploadEvidence`,
 * `operations.listEvidence`, and the file serving route in
 * `server/_core/fileRoutes.ts`. The rule previously existed only inline inside
 * `uploadEvidence`. Adding the other two by copy would have produced three
 * places that have to be kept in step, which is how a rule quietly stops being
 * one rule — the same failure this project has now hit with `nixpacks.toml`,
 * with the `validId` comment, and with the `/manus-storage` warnings.
 *
 * Written before US-5 and US-7 were built rather than after they diverged.
 */

import type { User } from "../drizzle/schema";

/**
 * The columns this rule depends on, kept structural so the helper can be handed
 * a report row, a partially-selected row, or a test fixture without dragging the
 * whole table shape along.
 */
export type ReportAccessRow = {
  reporterId: number | null;
  assignedResponderId: number | null;
};

/**
 * Administrative staff, the citizen or responder who filed the report, or the
 * responder it is assigned to.
 *
 * **Center staff are deliberately absent.** US-7 names "Responder and
 * Administrator" and the decision recorded in section 12.3 of the backlog was to
 * follow the story as written rather than widen it. The consequence is worth
 * stating plainly because it is not obvious: `listRiskReportsForUser` gives
 * staff every report in the system, so a center staff member opening one of
 * them will see the incident with no attachments beneath it. That is the
 * decision as agreed, not an oversight. If it reads as wrong in front of the
 * client, changing it means changing this one function.
 */
export function canAccessReport(
  user: Pick<User, "id" | "role">,
  report: ReportAccessRow,
): boolean {
  if (user.role === "admin") return true;
  if (report.reporterId != null && report.reporterId === user.id) return true;
  if (report.assignedResponderId != null && report.assignedResponderId === user.id) return true;
  return false;
}

/**
 * Why access was refused, so an audit row can say more than "denied".
 *
 * A center staff member is refused by the role rule itself, which is a
 * different event from an unrelated responder or citizen who simply is not
 * party to this report: the first is a policy decision being enforced, the
 * second is someone reaching for what is not theirs. A log that records both
 * identically as `DENIED` is much less useful when someone later asks who was
 * blocked and why.
 *
 * Takes no report because no report column can change the answer while
 * `canAccessReport` is written as it is — anyone already a party to the report
 * never reaches the denial path.
 */
export function accessDenialReason(
  user: Pick<User, "id" | "role">,
): "STAFF_EXCLUDED" | "NOT_A_PARTY" {
  return user.role === "staff" ? "STAFF_EXCLUDED" : "NOT_A_PARTY";
}
