import type {
  CitizenEmergencyNotification,
  RealtimeAlert,
  RealtimeAssignment,
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

export function broadcastAssignment(assignment: RealtimeAssignment) {
  deliver(
    { type: "assignment", data: assignment },
    ["responder", "staff", "admin"]
  );
}
