export type CitizenLanguage = "en" | "fil";
export type CitizenEmergencyPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CitizenEmergencyNotification = {
  id: number;
  reportCode: string;
  reportType: string;
  location: string;
  latitude: string | number | null;
  longitude: string | number | null;
  priority: CitizenEmergencyPriority;
  createdAt: Date | string;
  status?: string;
  assignedResponderId?: number | null;
};
export type RealtimeAlert = {
  id: number;
  title: string;
  message: string;
  alertType: string;
  priority: CitizenEmergencyPriority;
  targetAudience:
    | "ALL_USERS"
    | "CITIZENS"
    | "STAFF"
    | "RESPONDERS"
    | "ADMIN";
  isActive: boolean;
  createdAt: Date | string;
};
export type RealtimeAssignment = {
  reportId: number;
  assignedResponderId: number | null;
};
export type RealtimeEvacueeEvent = {
  evacueeId: number;
  centerId: number | null;
  action: "REGISTERED" | "TRANSFERRED" | "RELEASED";
};
export type RealtimeStreamPayload =
  | { type: "connected" }
  | { type: "incident"; data: CitizenEmergencyNotification }
  | { type: "alert"; data: RealtimeAlert }
  | { type: "assignment"; data: RealtimeAssignment }
  | { type: "evacuee"; data: RealtimeEvacueeEvent };

import { getRiskReportHeadline } from "./operations";

export function realtimeAudienceRoles(
  audience: RealtimeAlert["targetAudience"]
): readonly string[] {
  switch (audience) {
    case "ALL_USERS":
      return ["citizen", "user", "responder", "staff", "admin"];
    case "CITIZENS":
      return ["citizen", "user"];
    case "RESPONDERS":
      return ["responder"];
    case "STAFF":
      return ["staff"];
    case "ADMIN":
      return ["admin"];
    default:
      return [];
  }
}

export function toCitizenEmergencyNotification(report: {
  id: number;
  reportCode: string;
  reportType: string;
  description?: string | null;
  location: string;
  latitude: string | number | null | undefined;
  longitude: string | number | null | undefined;
  priority: CitizenEmergencyPriority;
  createdAt: Date | string;
  status?: string;
  assignedResponderId?: number | null;
}): CitizenEmergencyNotification {
  return {
    id: report.id,
    reportCode: report.reportCode,
    reportType: getRiskReportHeadline(report),
    location: report.location,
    latitude: report.latitude ?? null,
    longitude: report.longitude ?? null,
    priority: report.priority,
    createdAt: report.createdAt,
    status: report.status,
    assignedResponderId: report.assignedResponderId ?? null,
  };
}
export const citizenCopy = {
  en: { attachPhoto: "Add a photo", takePhoto: "Take photo", choosePhotos: "Choose photos", attachHelp: "Up to 5 photos, 10 MB each. You can send your report without one.", photoTooLarge: "That photo is larger than 10 MB.", tooManyPhotos: "You can attach up to 5 photos.", photoUnsupported: "That file is not a photo or PDF.", removePhoto: "Remove photo", sendingPhotos: "Sending your photos...", photoSent: "Photo sent", photoPending: "Report sent - photo pending", photoPendingHelp: "Your report reached responders. Your photos will send themselves when your connection returns.", retryPhotos: "Send photos now", photosQueued: "Your photos will be sent when you reconnect. Keep this page open.", photosNotSentWithQueue: "Your report was saved on this device. Photos are not saved with it - add them once you are back online.", subtitle: "Help for Pateros residents", readPage: "Read this page", largerText: "Larger text", standardText: "Standard text", welcome: "Welcome. You are not alone.", intro: "Find a safe place nearby or tell responders what is happening. You can type or speak your report.", report: "Report an emergency", reportHelp: "Flooding, fire, injury, danger, or someone who needs help", immediate: "Need immediate help?", call911: "Call 911", nearby: "Nearby evacuation centers", nearbyHelp: "Choose a center marked Open. The numbers show current people and total capacity.", alerts: "Alerts for your area", safePlaces: "SAFE PLACES NEAR YOU", updates: "IMPORTANT UPDATES", safety: "COMMUNITY SAFETY", signIn: "Sign in", kmAway: "km away", people: "people", noCentersFound: "No evacuation centers to show right now.", readCenters: "Read evacuation center availability", readAlerts: "Read area alerts", reportEyebrow: "EMERGENCY REPORT", cancel: "Cancel", what: "What is happening?", speakOrType: "Speak or type a few words. You do not need to use perfect sentences.", describe: "Describe the danger", location: "Where are you?", example: "Example: Water is entering our home…", describeMin: "At least 5 characters so responders know what is happening.", locationMin: "At least 2 characters.", speak: "Speak your report", listening: "Listening… tap to stop", send: "Send report", sending: "Sending…", sendSms: "Send by SMS instead", offline: "You are offline. Your report is saved on this device and can be sent by SMS.", voiceUnavailable: "Voice input is not available. You can type the details instead.", permissionDenied: "Microphone access was not allowed. You can type the details instead, or call 911 if someone is in immediate danger.", sent: "Report sent", queued: "Report saved for sending", queuedHelp: "Your report is stored on this device. Try SMS now, or it will retry when you reconnect.", done: "Done", open: "OPEN", spaces: "spaces available", directions: "Get directions", locating: "Finding your location…", located: "Sorted by distance from you", locationDenied: "Location permission was not allowed. Showing centers without distance sorting.", language: "Filipino", english: "English", safetyAdvice: "Safety advice", safetyAdviceHelp: "What to do before, during, and after a disaster.", adviceEyebrow: "SAFETY ADVICE", allHazards: "All hazards", readAdvice: "Read this guidance aloud", showSteps: "Show steps", hideSteps: "Hide steps", stepWord: "Step", stepCount: "steps", noAdviceYet: "No guidance has been published yet. Please check back soon.", adviceOffline: "Showing guidance saved on this device. You are offline.", adviceUpdated: "Updated" },
  fil: { attachPhoto: "Magdagdag ng larawan", takePhoto: "Kumuha ng larawan", choosePhotos: "Pumili ng larawan", attachHelp: "Hanggang 5 larawan, 10 MB bawat isa. Maaari kang magpadala ng ulat kahit walang larawan.", photoTooLarge: "Mas malaki sa 10 MB ang larawang ito.", tooManyPhotos: "Hanggang 5 larawan ang maaaring ikabit.", photoUnsupported: "Hindi larawan o PDF ang file na ito.", removePhoto: "Alisin ang larawan", sendingPhotos: "Ipinapadala ang mga larawan...", photoSent: "Naipadala ang larawan", photoPending: "Naipadala ang ulat - nakabinang ang larawan", photoPendingHelp: "Ang ulat ay naabot na ng mga responder. Ipadadala ang mga larawan kapag bumalik ang connection ninyo.", retryPhotos: "Ipadala ang mga larawan ngayon", photosQueued: "Ipadadala ang mga larawan kapag bumalik ang internet. Buksan ang pahinang ito.", photosNotSentWithQueue: "Naka-save ang ulat sa device. Hindi kasama ang mga larawan - idagdag muli kapag online na.", subtitle: "Tulong para sa mga residente ng Pateros", readPage: "Basahin ang pahina", largerText: "Mas malaking teksto", standardText: "Karaniwang teksto", welcome: "Maligayang pagdating. Hindi ka nag-iisa.", intro: "Humanap ng malapit na ligtas na lugar o sabihin sa mga responder ang nangyayari. Maaari kang magsulat o magsalita.", report: "Mag-ulat ng emergency", reportHelp: "Baha, sunog, pinsala, panganib, o taong nangangailangan ng tulong", immediate: "Kailangan ng agarang tulong?", call911: "Tumawag sa 911", nearby: "Mga malapit na evacuation center", nearbyHelp: "Pumili ng center na may markang Bukas. Makikita ang bilang ng tao at kabuuang kapasidad.", alerts: "Mga alerto sa inyong lugar", safePlaces: "MALILIGTAS NA LUGAR", updates: "MAHAHALAGANG BALITA", safety: "KALIGTASAN NG KOMUNIDAD", signIn: "Mag-sign in", kmAway: "km ang layo", people: "tao", noCentersFound: "Walang evacuation center na maipapakita ngayon.", readCenters: "Basahin ang availability ng evacuation center", readAlerts: "Basahin ang mga alerto", reportEyebrow: "ULAT NG EMERGENCY", cancel: "Kanselahin", what: "Ano ang nangyayari?", speakOrType: "Magsalita o magsulat ng ilang salita. Hindi kailangang perpekto ang pangungusap.", describe: "Ilarawan ang panganib", location: "Nasaan kayo?", example: "Halimbawa: Pumapasok ang tubig sa aming bahay…", describeMin: "Hindi bababa sa 5 character upang malaman ng mga responder ang nangyayari.", locationMin: "Hindi bababa sa 2 character.", speak: "Magsalita ng ulat", listening: "Nakikinig… pindutin para huminto", send: "Ipadala ang ulat", sending: "Ipinapadala…", sendSms: "Ipadala sa SMS", offline: "Wala kang internet. Naka-save ang ulat sa device at maaaring ipadala sa SMS.", voiceUnavailable: "Hindi available ang voice input. Maaari mong i-type ang detalye.", permissionDenied: "Hindi pinayagan ang mikropono. Maaari mong i-type ang detalye o tumawag sa 911 kung may agarang panganib.", sent: "Naipadala ang ulat", queued: "Naka-save ang ulat", queuedHelp: "Naka-save ang ulat sa device. Subukan ang SMS o awtomatiko itong ipapadala kapag bumalik ang internet.", done: "Tapos na", open: "BUKAS", spaces: "bakanteng puwesto", directions: "Kumuha ng direksyon", locating: "Hinahanap ang inyong lokasyon…", located: "Inayos ayon sa layo", locationDenied: "Hindi pinayagan ang lokasyon. Ipinapakita ang mga center nang walang pag-aayos ayon sa layo.", language: "Filipino", english: "English", safetyAdvice: "Payo sa kaligtasan", safetyAdviceHelp: "Ano ang gagawin bago, habang, at pagkatapos ng sakuna.", adviceEyebrow: "PAYO SA KALIGTASAN", allHazards: "Lahat ng sakuna", readAdvice: "Basahin ang payo na ito", showSteps: "Ipakita ang mga hakbang", hideSteps: "Itago ang mga hakbang", stepWord: "Hakbang", stepCount: "hakbang", noAdviceYet: "Wala pang inilathalang payo. Pakisuri muli sa lalong madaling panahon.", adviceOffline: "Ipinapakita ang payo na naka-save sa device na ito. Walang internet ka.", adviceUpdated: "Na-update" },
} as const;

export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) { const radians = (value: number) => value * Math.PI / 180; const dLat = radians(to.lat - from.lat); const dLng = radians(to.lng - from.lng); const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
export type CitizenCenterForSort = {
  name?: string;
  displayName?: string;
  currentOccupancy: number;
  maximumCapacity: number;
  status: string;
  distance?: number;
};
/**
 * Centers with open space first, then nearest, then by name. A center with a
 * free slot outranks a full or closed one, so the first thing a citizen sees
 * is where they can actually go. Missing distance (no GPS) ties to furthest.
 */
export function sortCentersForCitizens<T extends CitizenCenterForSort>(centers: readonly T[]): T[] {
  const availableOf = (center: CitizenCenterForSort) => Math.max(0, center.maximumCapacity - center.currentOccupancy);
  const rank = (center: CitizenCenterForSort) => center.status === "OPEN" ? (availableOf(center) > 0 ? 0 : 1) : 2;
  const byDistance = (a: CitizenCenterForSort, b: CitizenCenterForSort) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE);
  const byName = (a: CitizenCenterForSort, b: CitizenCenterForSort) => String(a.displayName ?? a.name ?? "").localeCompare(String(b.displayName ?? b.name ?? ""));
  return [...centers].sort((a, b) => rank(a) - rank(b) || byDistance(a, b) || byName(a, b));
}
export function getDirectionsUrl(destination: { lat: number; lng: number }, origin?: { lat: number; lng: number }) { const params = new URLSearchParams({ api: "1", destination: `${destination.lat},${destination.lng}`, travelmode: "walking" }); if (origin) params.set("origin", `${origin.lat},${origin.lng}`); return `https://www.google.com/maps/dir/?${params.toString()}`; }
export function serializeOfflineReport(report: { reportText: string; location: string; latitude?: number; longitude?: number; createdAt: number }) { return JSON.stringify(report); }
export type OfflineCitizenReport = { reportText: string; location: string; latitude?: number; longitude?: number; createdAt: number };
export function addOfflineReport(raw: string | null, report: OfflineCitizenReport) { let queue: OfflineCitizenReport[] = []; try { const parsed = raw ? JSON.parse(raw) : []; queue = Array.isArray(parsed) ? parsed : parsed?.reportText ? [parsed] : []; } catch { queue = []; } return JSON.stringify([...queue, report]); }
export function parseOfflineReports(raw: string | null) { if (!raw) return [] as OfflineCitizenReport[]; try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed as OfflineCitizenReport[] : parsed?.reportText ? [parsed as OfflineCitizenReport] : []; } catch { return []; } }
export function getSmsFallbackUrl(phone: string, message: string) { return `sms:${phone}?body=${encodeURIComponent(message)}`; }
export function projectOfflineMapPoint(point: { lat: number; lng: number }, bounds = { minLat: 14.53, maxLat: 14.56, minLng: 121.05, maxLng: 121.09 }) { return { left: Math.max(4, Math.min(96, ((point.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100)), top: Math.max(6, Math.min(94, (1 - (point.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100)) }; }
export function normalizeSmsConfiguration(input: { officialNumber: string; provider: string }) { return { officialNumber: input.officialNumber.replace(/[ ()-]/g, ""), provider: input.provider || "NONE" }; }
