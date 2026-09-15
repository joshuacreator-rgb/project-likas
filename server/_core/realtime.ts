import type {
  CitizenEmergencyNotification,
  RealtimeStreamPayload,
} from "../../shared/citizen";

type RealtimeSubscriber = (payload: RealtimeStreamPayload) => void;

const subscribers = new Set<RealtimeSubscriber>();

export function subscribeRealtime(subscriber: RealtimeSubscriber) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function broadcastIncident(incident: CitizenEmergencyNotification) {
  subscribers.forEach(subscriber => {
    subscriber({ type: "incident", data: incident });
  });
}

export function broadcastAlert(alert: unknown) {
  subscribers.forEach(subscriber => {
    subscriber({ type: "alert", data: alert });
  });
}
