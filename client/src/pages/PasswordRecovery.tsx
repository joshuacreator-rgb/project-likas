import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

type PasswordRecoveryProps = { embedded?: boolean; onClose?: () => void; params?: Record<string, string | undefined> };

export default function PasswordRecovery({ embedded = false, onClose }: PasswordRecoveryProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"request" | "reset" | "success">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");

  // Prefill from an emailed recovery link: /recover?email=...&token=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const tokenParam = params.get("token");
    if (emailParam) setEmail(emailParam);
    if (tokenParam) {
      setToken(tokenParam);
      setStep("reset");
    }
  }, []);

  const forgotMutation = trpc.localAuth.forgotPassword.useMutation({
    onSuccess: result => {
      if (result.devToken) {
        setToken(result.devToken);
      }
      setStep("reset");
      setNotice("");
    },
    onError: error => setNotice(error.message),
  });

  const resetMutation = trpc.localAuth.resetPassword.useMutation({
    onSuccess: () => {
      setStep("success");
      setNotice("");
    },
    onError: error => setNotice(error.message),
  });

  const handleBack = () => {
    if (embedded && onClose) {
      onClose();
      return;
    }
    navigate("/login");
  };

  const content = (
    <section className="login-card account-card">
      <button className="text-button" onClick={handleBack}>
        <ArrowLeft size={15} /> Back to sign in
      </button>
      <div className="login-brand">
        <div className="brand-mark">
          <KeyRound size={26} />
        </div>
        <div>
          <strong>PROJECT LIKAS</strong>
          <span>Account recovery</span>
        </div>
      </div>

      {step === "request" && (
        <>
          <div className="login-heading">
            <span className="eyebrow">Password recovery</span>
            <h1>Let’s get you back in.</h1>
            <p>Enter your account email and we will send you a secure reset link.</p>
          </div>
          <div className="registration-path-note citizen" role="status" style={{ marginBottom: 16 }}>
            <strong>How to get a reset link</strong>
            <span>1. Enter your registered email above and click Request password recovery.<br/>2. A secure reset link will be sent to your email{import.meta.env.DEV ? " (the token is also shown here in development)" : ""}. It expires in 30 minutes.</span>
          </div>
          <form
            className="login-form"
            onSubmit={event => {
              event.preventDefault();
              setNotice("");
              forgotMutation.mutate({ email });
            }}
          >
            <label>
              Email address
              <Input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            {notice && (
              <div className="login-error" role="alert">
                <span>{notice}</span>
              </div>
            )}
            <Button type="submit" disabled={forgotMutation.isPending}>
              {forgotMutation.isPending ? "Requesting recovery token..." : "Request password recovery"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="account-links" style={{ marginTop: 16 }}>
            <button type="button" onClick={() => setStep("reset")}>
              Have a reset token already? Enter it here
            </button>
          </div>
        </>
      )}

      {step === "reset" && (
        <>
          <div className="login-heading">
            <span className="eyebrow">Set new password</span>
            <h1>Enter your reset token</h1>
            <p>Paste the token from your reset email, then choose a new password (at least 10 characters).</p>
          </div>
          {token && (
            <div className="registration-path-note citizen" role="status" style={{ marginBottom: 16, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
              <strong>Reset Token Ready</strong>
              <span>Token automatically populated: <code style={{ userSelect: "all", background: "#dcfce7", padding: "2px 6px", borderRadius: 4 }}>{token}</code></span>
            </div>
          )}
          <form
            className="login-form"
            onSubmit={event => {
              event.preventDefault();
              setNotice("");
              if (newPassword.length < 10) {
                setNotice("Password must be at least 10 characters.");
                return;
              }
              resetMutation.mutate({ email, token, newPassword });
            }}
          >
            <label>
              Email address
              <Input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label>
              Reset token
              <Input
                type="text"
                value={token}
                onChange={event => setToken(event.target.value)}
                placeholder="Enter reset token"
                required
              />
            </label>
            <label className="password-field">
              New password
              <div className="password-input-wrap">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {notice && (
              <div className="login-error" role="alert">
                <span>{notice}</span>
              </div>
            )}
            <Button type="submit" disabled={resetMutation.isPending}>
              {resetMutation.isPending ? "Updating password..." : "Reset password"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="account-links" style={{ marginTop: 16 }}>
            <button type="button" onClick={() => setStep("request")}>
              Request a new token
            </button>
          </div>
        </>
      )}

      {step === "success" && (
        <div className="login-heading" style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", padding: 16, background: "#e9f6f3", borderRadius: "50%", color: "#168a70", marginBottom: 12 }}>
            <CheckCircle2 size={36} />
          </div>
          <span className="eyebrow">Recovery complete</span>
          <h1>Password updated successfully</h1>
          <p>Your password has been reset. You can now sign in with your new credentials.</p>
          <Button onClick={handleBack} style={{ marginTop: 16 }}>
            Return to sign in <ArrowRight size={17} />
          </Button>
        </div>
      )}
    </section>
  );

  return embedded ? (
    <div className="recovery-modal-backdrop" role="dialog" aria-modal="true" aria-label="Password recovery">
      {content}
    </div>
  ) : (
    <main className="login-page">{content}</main>
  );
}
