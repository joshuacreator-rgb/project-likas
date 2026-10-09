import type {
  CitizenEmergencyNotification,
  RealtimeAlert,
  RealtimeAssignment,
  RealtimeEvacueeEvent,
  RealtimeStreamPayload,
} from "../../shared/citizen";
import { realtimeAudienceRoles } from "../../shared/citizen";

type RealtimeSubscriber = {
  role: string;
  handler: (payload: RealtimeStreamPayload) => void;
};

const subscribers = new Set<RealtimeSubscriber>();

export function subscribeRealtime(
  handler: (payload: RealtimeStreamPayload) => void,
  role: string
) {
  const entry: RealtimeSubscriber = { role, handler };
  subscribers.add(entry);
  return () => subscribers.delete(entry);
}

function deliver(payload: RealtimeStreamPayload, roles?: readonly string[]) {
  subscribers.forEach(({ role, handler }) => {
    if (!roles || roles.includes("*") || roles.includes(role)) handler(payload);
  });
}

export function broadcastIncident(incident: CitizenEmergencyNotification) {
  // New citizen emergencies reach everyone: citizens for awareness, responders
  // so they can act or claim, admin/staff for oversight.
  deliver(
    { type: "incident", data: incident },
    ["citizen", "user", "responder", "staff", "admin"]
  );
}

export function broadcastAlert(
  alert: RealtimeAlert,
  targetAudience: RealtimeAlert["targetAudience"] = "ALL_USERS"
) {
  deliver({ type: "alert", data: alert }, realtimeAudienceRoles(targetAudience));
}

/**
 * An ended alert must reach every open dashboard that can display it. The
 * operations alert center shows a role everything it may see (admins see all),
 * so ending an alert cannot leave another open view showing it as ACTIVE (the
 * "alert stays active after the report is done" bug). The targeted audience is
 * therefore widened with the admin role when the end is broadcast.
 */
export function broadcastAlertEnded(alert: RealtimeAlert) {
  const roles = new Set<string>([...realtimeAudienceRoles(alert.targetAudience)]);
  roles.add("admin");
  deliver({ type: "alert", data: alert }, Array.from(roles));
}

export function broadcastAssignment(assignment: RealtimeAssignment) {
  deliver(
    { type: "assignment", data: assignment },
    ["responder", "staff", "admin"]
  );
}

/**
 * Registry changes reach the people who run the registry: staff and admins.
 * Their open dashboards drop the stale list and refetch within the same
 * moment the occupancy count also changes.
 */
export function broadcastEvacuee(event: RealtimeEvacueeEvent) {
  deliver({ type: "evacuee", data: event }, ["staff", "admin"]);
}
