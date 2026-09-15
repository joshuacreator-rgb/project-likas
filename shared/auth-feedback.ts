export type AuthFeedbackStep = "login" | "2fa";
export type AuthFeedbackRole = "admin" | "staff" | "responder" | "citizen";

export function getAuthErrorMessage(
  message: string | null | undefined,
  step: AuthFeedbackStep,
  role: AuthFeedbackRole = "citizen"
) {
  if (!message) return "";
  const normalized = message.trim().toLowerCase();
  if (step === "2fa") {
    if (normalized.includes("expired")) return "This verification window expired. Start sign-in again to receive a new code.";
    if (normalized.includes("verification code") || normalized.includes("security challenge")) return "That code was not accepted. Check the six digits in your authenticator app and try again.";
    return "We could not verify that code. Try again or start over.";
  }
  if (normalized.includes("registered as")) return `${message.trim()} Select the matching role card and try again.`;
  if (normalized.includes("invalid email") || normalized.includes("password")) {
    if (role !== "citizen") {
      return "This operational account is administrator-provisioned. Check your details or ask an Administrator for an invitation or temporary demo account.";
    }
    return "We could not sign you in with those details. Check your email and password, then try again.";
  }
  return message.trim() || "Sign-in could not be completed. Please try again.";
}
