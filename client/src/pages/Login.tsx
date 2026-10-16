import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { getHomePath } from "../../../shared/roles";
import { getAuthErrorMessage } from "../../../shared/auth-feedback";
import {
  authenticateStaticAccount,
  clearStaticDemoRole,
  clearStaticOverrides,
} from "@/lib/staticAuth";
import { broadcastAuthEvent, useAuthBroadcastKick } from "@/lib/authBroadcast";
import AccountRegister from "./AccountRegister";
import PasswordRecovery from "./PasswordRecovery";

/**
 * One consolidated sign-in for every account. The user only enters credentials;
 * the account's stored role decides the workspace they land in (admin, staff,
 * responder, or citizen). Legacy `/admin/login`, `/staff/login`, and
 * `/responder/login` links redirect here.
 */
export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [oauthError, setOauthError] = useState("");

  const isTwoFactorStep = Boolean(challengeToken);

  // Spec 1.8: while sitting on /login, an auth event from ANOTHER tab (that
  // tab signed in or out) reloads this page too, dropping any half-typed
  // credentials or stale 2FA step. The same hook on every dashboard route is
  // what kicks an already-signed-in tab back here.
  useAuthBroadcastKick();

  const login = trpc.localAuth.login.useMutation({
    onSuccess: (result) => {
      if (result.requiresTwoFactor) {
        setChallengeToken(result.challengeToken);
        return;
      }
      clearStaticOverrides();
      broadcastAuthEvent("likas-login");
      navigate(getHomePath(result.user?.role));
    },
    onError: () => {
      if (!import.meta.env.DEV) return;
      const user = authenticateStaticAccount(email, password);
      if (!user) return;
      clearStaticDemoRole();
      navigate(getHomePath(user.role));
    },
  });

  const verifyTwoFactor = trpc.localAuth.verifyTwoFactor.useMutation({
    onSuccess: (result) => {
      clearStaticOverrides();
      broadcastAuthEvent("likas-login");
      navigate(getHomePath(result.user?.role));
    },
  });

  const isSubmitting = login.isPending || verifyTwoFactor.isPending;
  const errorMessage = getAuthErrorMessage(
    (isTwoFactorStep ? verifyTwoFactor.error : login.error)?.message,
    isTwoFactorStep ? "2fa" : "login",
  );
  const oauthConfigured = Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID);

  function restartLogin() {
    setChallengeToken("");
    setTwoFactorCode("");
    login.reset();
    verifyTwoFactor.reset();
  }

  function handleOAuth() {
    setOauthError("");
    try {
      startLogin();
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : "Secure platform sign-in is unavailable.");
    }
  }

  return (
    <main className="login-page login-page-citizen">
      <div className="login-layout">
        <section className="login-card unified-login-card">
          <div className="login-brand">
            <div className="brand-mark"><ShieldCheck size={26} /></div>
            <div>
              <strong>PROJECT LIKAS</strong>
              <span>Disaster Response &amp; Community Safety</span>
            </div>
          </div>

          <div className="login-heading">
            <span className="eyebrow">Secure access</span>
            <h1>{isTwoFactorStep ? "Enter your security code." : "Welcome back."}</h1>
            <p>
              {isTwoFactorStep
                ? "Enter the 6-digit code from your authenticator app to finish signing in."
                : "Sign in to your Project Likas workspace. Admins, responders, staff, and residents all use this sign-in."}
            </p>
          </div>

          <form
            className="login-form"
            aria-busy={isSubmitting}
            onSubmit={(event) => {
              event.preventDefault();
              if (isTwoFactorStep) {
                verifyTwoFactor.mutate({ challengeToken, code: twoFactorCode });
                return;
              }
              login.mutate({ email, password });
            }}
          >
            {isTwoFactorStep ? (
              <label>
                Authenticator code
                <Input
                  id="authenticator-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={twoFactorCode}
                  aria-invalid={Boolean(errorMessage)}
                  onChange={(event) => {
                    setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    verifyTwoFactor.reset();
                  }}
                  required
                  autoFocus
                />
              </label>
            ) : (
              <>
                <label>
                  Email address
                  <Input
                    id="login-email"
                    type="email"
                    value={email}
                    aria-invalid={Boolean(errorMessage)}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      login.reset();
                    }}
                    required
                    autoComplete="email"
                  />
                </label>
                <label>
                  Password
                  <div className="password-input-wrap">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      aria-invalid={Boolean(errorMessage)}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        login.reset();
                      }}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              </>
            )}

            {(errorMessage || oauthError) && (
              <div className="login-error" id="login-error" role="alert" aria-live="assertive">
                <span className="login-error-icon" aria-hidden="true">!</span>
                <span>{errorMessage || oauthError}</span>
              </div>
            )}

            {!isTwoFactorStep && (
              <div className="account-links align-right">
                <button type="button" onClick={() => setRecoveryOpen(true)}>Forgot password?</button>
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting || (isTwoFactorStep && twoFactorCode.length !== 6)}
              aria-describedby={errorMessage ? "login-error" : undefined}
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="login-spinner" size={18} aria-hidden="true" />
                  {isTwoFactorStep ? "Verifying code…" : "Signing you in…"}
                </>
              ) : isTwoFactorStep ? (
                "Verify and continue"
              ) : (
                "Sign in"
              )}
              {!isSubmitting && <ArrowRight size={18} />}
            </Button>
          </form>

          {isTwoFactorStep && (
            <button type="button" className="login-back-link" onClick={restartLogin}>
              <ArrowLeft size={16} /> Start over
            </button>
          )}

          {!isTwoFactorStep && (
            <>
              <div className="account-links">
                <button type="button" onClick={() => setRegistrationOpen(true)}>Register as Citizen</button>
              </div>
              {oauthConfigured && (
                <>
                  <div className="login-divider"><span>or</span></div>
                  <Button type="button" variant="outline" onClick={handleOAuth}>
                    Continue with secure platform sign-in
                  </Button>
                </>
              )}
              <p className="login-note">
                Sign in once — we take you straight to your workspace based on your account.
              </p>
            </>
          )}
        </section>
        <p className="login-undernote">Trusted community safety for every household.</p>
      </div>

      {registrationOpen && <AccountRegister embedded initialRole="citizen" onClose={() => setRegistrationOpen(false)} />}
      {recoveryOpen && <PasswordRecovery embedded onClose={() => setRecoveryOpen(false)} />}
    </main>
  );
}
