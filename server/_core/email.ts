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

export async function sendInvitationEmail(input: { email: string; name: string; role: string; inviteUrl: string }) {
  if (!ENV.resendApiKey || !ENV.emailFrom) {
    console.warn("[Email] Invitation email not sent because RESEND_API_KEY or EMAIL_FROM is not configured.");
    return;
  }

  const roleLabel = roleLabels[input.role as keyof typeof roleLabels] ?? input.role;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ENV.emailFrom,
      to: [input.email],
      subject: "You've been invited to join Project Likas",
      text: `Hi ${input.name},\n\nYou have been invited to join Project Likas as ${roleLabel}.\n\nInvitation link: ${input.inviteUrl}\n\nThis invitation expires in 7 days and can only be used once.\n\nAfter opening the link, you can create your password and complete your account setup.\n\nIf you did not expect this invitation, you can safely ignore this email.`,
    }),
  });

  if (!response.ok) throw new Error(`Resend invitation email failed with status ${response.status}.`);
}