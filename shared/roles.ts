export const roleLabels = { admin: "Administrator", staff: "Evacuation Center Staff", responder: "Responder / Disaster Team", citizen: "Citizen", user: "Citizen" } as const;
export const roleBrands = {
  admin: { organization: "Pateros DRRM Office", department: "Command & Governance", mark: "PDRRM", tone: "teal" },
  staff: { organization: "Pateros Evacuation Network", department: "Center Operations", mark: "PEN", tone: "blue" },
  responder: { organization: "Pateros DRRM Response Unit", department: "Field Response", mark: "PRU", tone: "amber" },
  citizen: { organization: "Pateros Community Safety", department: "Citizen Support", mark: "PCS", tone: "rose" },
} as const;
export type RoleName = keyof typeof roleLabels;
export type AccountRole = "admin" | "staff" | "responder" | "citizen";
export function getRoleFromSearch(search: string | undefined, fallback: AccountRole = "citizen"): AccountRole { const requested = new URLSearchParams(search || "").get("role"); return requested === "admin" || requested === "staff" || requested === "responder" || requested === "citizen" ? requested : fallback; }
export function getLoginPath(role?: AccountRole) { return role ? `/login?role=${role}` : "/login"; }
export function getRegisterPath(role: AccountRole = "citizen") { return `/register?role=${role}`; }
export function formatRoleLabel(role?: string | null) { return roleLabels[(role as RoleName) || "citizen"] || "Citizen"; }
export function getHomePath(role?: string | null) {
  if (role === "admin") return "/admin";
  if (role === "staff") return "/staff";
  if (role === "responder") return "/responder";
  return role === "citizen" || role === "user" ? "/citizen" : "/login";
}
export function isRoleSelectionAllowed(selected: string, stored: string) { return selected === stored || (selected === "citizen" && stored === "user"); }
export function isSelfRegistrationAllowed(role?: string | null) { return role === "citizen" || role === undefined || role === null; }
export function requiresTwoFactor(role?: string | null, enabled?: boolean) { return Boolean(enabled && role === "responder"); }
export function isInvitableRole(role: string) { return role === "staff" || role === "responder"; }
export function isInvitationUsable(expiresAt: Date | number, acceptedAt: Date | number | null | undefined, now = Date.now()) { return !acceptedAt && new Date(expiresAt).getTime() > now; }
export function onboardingSteps(role?: string | null) { const key = role === "admin" || role === "staff" || role === "responder" || role === "citizen" || role === "user" ? role : "citizen"; return { admin: ["Review the overview for capacity, alerts, and incidents.", "Use User & roles to invite and assign staff or responders.", "Check Activity log after sensitive changes and configuration updates."], staff: ["Review center capacity before registering or transferring evacuees.", "Record stock movements as they happen.", "Use Alerts to coordinate shortages and urgent center updates."], responder: ["Open Risk reports to review priority and location.", "Record arrival, actions, and resources used.", "Resolve incidents only after the situation is confirmed safe."], citizen: ["Check nearby center availability and directions.", "Use Report an emergency for danger, flooding, fire, or injury.", "Call 911 when someone needs immediate help."], user: ["Check nearby center availability and directions.", "Use Report an emergency when you need responder help.", "Call 911 when someone needs immediate help."] }[key]; }
export function getVoiceInputMode(supported: boolean) { return supported ? "voice" : "type"; }
export function getVoiceFallbackMessage(error?: string) { if (error === "not-allowed" || error === "service-not-allowed") return "Microphone access was not allowed. You can type the details instead, or call 911 if someone is in immediate danger."; if (error === "language-not-supported") return "This voice language is not supported by your browser. You can try again or type the details instead."; if (error === "network") return "Voice recognition could not connect to the browser service. Check your internet connection. Please try again or type the details instead."; if (error === "no-speech") return "We did not detect speech. Please try again or type the details."; return "We could not hear that. Please try again or type the details."; }
