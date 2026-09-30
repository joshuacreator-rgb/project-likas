import { TRPCError } from "@trpc/server";
import { roleLabels } from "../../shared/roles";
import { ENV } from "./env";

export async function sendVerificationEmail(input: { email: string; name: string; code: string }) {
  if (!ENV.resendApiKey || !ENV.emailFrom) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Email verification is not configured." });
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ENV.emailFrom,
      to: [input.email],
      subject: "Verify your Project Likas account",
      text: `Hi ${input.name},\n\nYour Project Likas verification code is ${input.code}. It expires in 15 minutes.\n\nIf you did not create this account, ignore this email.`,
    }),
  });
  if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: "Verification email could not be sent." });
}

export async function sendPasswordResetEmail(input: { email: string; name: string; resetUrl: string }) {
  if (!ENV.resendApiKey || !ENV.emailFrom) {
    console.warn("[Email] Password reset email not sent because RESEND_API_KEY or EMAIL_FROM is not configured.");
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ENV.emailFrom,
      to: [input.email],
      subject: "Reset your Project Likas password",
      text: `Hi ${input.name},\n\nWe received a request to reset your Project Likas password. Open the link below to choose a new password:\n${input.resetUrl}\n\nThis link expires in 30 minutes and can only be used once.\nIf you did not request this, you can safely ignore this email.`,
    }),
  });
  if (!response.ok) {
    console.warn(`[Email] Password reset email failed with status ${response.status}.`);
  }
}

export async function sendInvitationEmail(input: { email: string; name: string; role: string; inviteUrl: string }): Promise<{ sent: boolean; error?: string }> {
  if (!ENV.resendApiKey || !ENV.emailFrom) {
    return { sent: false, error: "RESEND_API_KEY or EMAIL_FROM is not configured." };
  }

  const roleLabel = roleLabels[input.role as keyof typeof roleLabels] ?? input.role;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: ENV.emailFrom,
        to: [input.email],
        subject: "You've been invited to join Project Likas",
        text: `Hi ${input.name},\n\nYou have been invited to join Project Likas as ${roleLabel}.\nClick the link below to set your password and activate your account:\n${input.inviteUrl}\nThis link expires in 7 days and can only be used once.\nIf you did not expect this invitation, ignore this email.`,
      }),
    });
  } catch (error) {
    return {
      sent: false,
      error: `Could not reach Resend: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      sent: false,
      error: `Resend rejected the email (status ${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    };
  }

  return { sent: true };
}