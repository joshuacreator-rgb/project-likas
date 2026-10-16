import type {
  CitizenEmergencyNotification,
  RealtimeAlert,
  RealtimeAssignment,
  RealtimeCenterEvent,
  RealtimeEvacueeEvent,
  RealtimeStreamPayload,
} from "../../shared/citizen";
import { alertDeliveryRoles } from "../../shared/operations";

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

/**
 * Live alert delivery (client §26): the audience it was stamped with, plus
 * staff for incident notifications — one row, filtered per subscriber, so a
 * role never receives the same alert twice.
 */
export function broadcastAlert(alert: RealtimeAlert) {
  deliver({ type: "alert", data: alert }, alertDeliveryRoles(alert));
}

/**
 * An ended alert must reach every open dashboard that can display it. The
 * operations alert center shows a role everything it may see (admins see
 * all), so ending an alert cannot leave another open view showing it as ACTIVE (the
 * "alert stays active after the report is done" bug). The delivery roles are
 * therefore widened with the admin role when the end is broadcast.
 */
export function broadcastAlertEnded(alert: RealtimeAlert) {
  const roles = new Set<string>([...alertDeliveryRoles(alert)]);
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

/**
 * Evacuation-center changes (created, capacity/occupancy edited, archived)
 * reach every open staff/admin dashboard so occupancy and center lists stay
 * in sync even when the change originates from another session.
 */
export function broadcastCenter(event: RealtimeCenterEvent) {
  deliver({ type: "center", data: event }, ["staff", "admin"]);
}
