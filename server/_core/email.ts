import { TRPCError } from "@trpc/server";
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