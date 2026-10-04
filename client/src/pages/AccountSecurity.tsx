import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getHomePath } from "../../../shared/roles";

// Kept in step with the zod minimum on the server route (`routers.ts`
// `localAuth.changePassword`). The server is the authority; this only saves a
// round trip and gives an immediate, specific message.
const MIN_PASSWORD_LENGTH = 10;

function describeError(error: {
  message?: string;
  data?: { code?: string } | null;
}) {
  const code = error.data?.code;
  if (code === "UNAUTHORIZED") return "Your current password is incorrect.";
  if (code === "TOO_MANY_REQUESTS") {
    return "Too many attempts from this device. Wait an hour, then try again.";
  }
  return error.message || "We could not change your password. Please try again.";
}

export default function AccountSecurity() {
  const [, navigate] = useLocation();
  const { user } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [notice, setNotice] = useState("");
  const [changed, setChanged] = useState(false);

  const changePassword = trpc.localAuth.changePassword.useMutation({
    onSuccess: () => {
      // Drop every field on success: a password must not be left sitting in the
      // DOM after the change that justified showing it.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("");
      setChanged(true);
    },
    onError: error => {
      setChanged(false);
      setNotice(describeError(error));
      // Keep the current password so a mistyped entry can be corrected, but
      // discard the new one rather than leaving it on screen after a failure.
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  function validate(): string {
    if (!currentPassword) return "Enter your current password.";
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (newPassword === currentPassword) {
      return "Your new password must be different from your current password.";
    }
    if (newPassword !== confirmPassword) return "The new passwords do not match.";
    return "";
  }

  const goHome = () => {
    navigate(user?.role ? getHomePath(user.role as never) : "/login");
  };

  return (
    <main className="login-page">
      <section className="login-card account-card">
        <button type="button" className="text-button" onClick={goHome}>
          <ArrowLeft size={15} /> Back to my dashboard
        </button>

        <div className="login-brand">
          <div className="brand-mark">
            <ShieldCheck size={26} />
          </div>
          <div>
            <strong>PROJECT LIKAS</strong>
            <span>Account security</span>
          </div>
        </div>

        {changed ? (
          <>
            <div className="login-heading" style={{ textAlign: "center" }}>
              <div
                style={{
                  display: "inline-flex",
                  padding: 16,
                  background: "#e9f6f3",
                  borderRadius: "50%",
                  color: "#168a70",
                  marginBottom: 12,
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <span className="eyebrow">Password updated</span>
              <h1>Your password has been changed</h1>
              <p>
                Use your new password the next time you sign in. You are still signed in on this
                device. If you did not make this change, tell an Administrator immediately.
              </p>
              <Button onClick={goHome} style={{ marginTop: 16 }}>
                Continue <ArrowRight size={17} />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="login-heading">
              <span className="eyebrow">Change password</span>
              <h1>Choose a new password.</h1>
              <p>
                Your new password must be at least {MIN_PASSWORD_LENGTH} characters and different
                from your current one.
              </p>
            </div>

            {user?.email && (
              <div className="registration-path-note citizen" role="status" style={{ marginBottom: 16 }}>
                <strong>Signed in as {user.email}</strong>
                <span>
                  Changing your password does not sign you out of this device. It does not affect
                  any other device where you are already signed in.
                </span>
              </div>
            )}

            <form
              className="login-form"
              onSubmit={event => {
                event.preventDefault();
                const problem = validate();
                if (problem) {
                  setNotice(problem);
                  return;
                }
                setNotice("");
                changePassword.mutate({ currentPassword, newPassword });
              }}
            >
              <label className="password-field">
                Current password
                <div className="password-input-wrap">
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={currentPassword}
                    onChange={event => setCurrentPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </label>

              <label className="password-field">
                New password
                <div className="password-input-wrap">
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={newPassword}
                    onChange={event => setNewPassword(event.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                </div>
              </label>

              <label className="password-field">
                Confirm new password
                <div className="password-input-wrap">
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPasswords(value => !value)}
                    aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                  >
                    {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>

              {notice && (
                <div className="login-error" role="alert">
                  <span>{notice}</span>
                </div>
              )}

              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Updating password..." : "Change password"}
                <ArrowRight size={17} />
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
