import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  HeartHandshake,
  LoaderCircle,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { formatRoleLabel, getHomePath, roleBrands } from "../../../shared/roles";
import { getAuthErrorMessage } from "../../../shared/auth-feedback";
import {
  authenticateStaticAccount,
  clearStaticDemoRole,
  clearStaticOverrides,
} from "@/lib/staticAuth";
import AccountRegister from "./AccountRegister";
import PasswordRecovery from "./PasswordRecovery";

type AccountRole = "admin" | "staff" | "responder" | "citizen";
type MarkTone = "teal" | "blue" | "amber" | "rose";

const loginRoles: { role: AccountRole; icon: typeof ShieldCheck; tone: MarkTone }[] = [
  { role: "citizen", icon: HeartHandshake, tone: "rose" },
  { role: "admin", icon: ShieldCheck, tone: "teal" },
  { role: "staff", icon: Building2, tone: "blue" },
  { role: "responder", icon: Siren, tone: "amber" },
];

/**
 * One sign-in for every account: citizen by default, with a role switch for
 * admin, evacuation center staff, and responder teams. A `?role=` query param
 * (e.g. /login?role=admin) preselects the tab so old links keep working.
 */
export default function Login() {
  const [, navigate] = useLocation();
  const [role, setRole] = useState<AccountRole>(resolveInitialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [oauthError, setOauthError] = useState("");

  const isInternal = role !== "citizen";
  const isTwoFactorStep = Boolean(challengeToken);

  const login = trpc.localAuth.login.useMutation({
    onSuccess: (result) => {
      if (result.requiresTwoFactor) {
        setChallengeToken(result.challengeToken);
        return;
      }
      clearStaticOverrides();
      navigate(getHomePath(role));
    },
    onError: (error) => {
      if (!import.meta.env.DEV) return;
      const user = authenticateStaticAccount(email, password);
      if (!user || user.role !== role) return;
      clearStaticDemoRole();
      navigate(getHomePath(user.role));
    },
  });

  const verifyTwoFactor = trpc.localAuth.verifyTwoFactor.useMutation({
    onSuccess: () => {
      clearStaticOverrides();
      navigate(getHomePath(role));
    },
  });

  const isSubmitting = login.isPending || verifyTwoFactor.isPending;
  const errorMessage = getAuthErrorMessage(
    (isTwoFactorStep ? verifyTwoFactor.error : login.error)?.message,
    isTwoFactorStep ? "2fa" : "login",
    role,
  );

  const active = loginRoles.find(option => option.role === role) ?? loginRoles[0];
  const brand = roleBrands[role];
  const oauthConfigured = Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID);

  function switchRole(next: AccountRole) {
    if (next === role) return;
    setRole(next);
    setChallengeToken("");
    setTwoFactorCode("");
    login.reset();
    verifyTwoFactor.reset();
    const params = new URLSearchParams(window.location.search);
    params.set("role", next);
    window.history.replaceState(null, "", `/login?${params.toString()}`);
  }

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
    <main className={isInternal ? "login-page login-page-internal" : "login-page login-page-citizen"}>
      <div className="login-layout">
        <section className="login-card unified-login-card">
          <div className="login-brand">
            <div className="brand-mark"><ShieldCheck size={26} /></div>
            <div>
              <strong>PROJECT LIKAS</strong>
              <span>Disaster Response &amp; Community Safety</span>
            </div>
          </div>

          <div className="login-role-switch" role="tablist" aria-label="Sign in as">
            {loginRoles.map(({ role: option, icon: RoleIcon, tone }) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={option === role}
                className={`login-role-tab ${option === role ? "active" : ""}`}
                onClick={() => switchRole(option)}
              >
                <span className={`role-choice-mark ${tone}`}><RoleIcon size={17} /></span>
                <span className="login-role-label">{formatRoleLabel(option)}</span>
              </button>
            ))}
          </div>

          <div className="login-heading">
            <span className="eyebrow">{isInternal ? `${formatRoleLabel(role)} access` : "Public access"}</span>
            <h1>{isTwoFactorStep ? "Enter your security code." : "Welcome back."}</h1>
            <p>
              {isInternal
                ? "Sign in to manage evacuation, response, and recovery operations for your community."
                : "Sign in to check updates, report emergencies, and access support for your community."}
            </p>
          </div>

          {isInternal && (
            <div className="login-role-context">
              <span className={`role-choice-mark ${active.tone}`}>{brand.mark}</span>
              <div>
                <span>{brand.organization}</span>
                <small>{brand.department}</small>
              </div>
            </div>
          )}

          <form
            className="login-form"
            aria-busy={isSubmitting}
            onSubmit={(event) => {
              event.preventDefault();
              if (isTwoFactorStep) {
                verifyTwoFactor.mutate({ challengeToken, code: twoFactorCode });
                return;
              }
              login.mutate({ email, password, role });
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

            {(errorMessage || oauthError || isTwoFactorStep) && (
              <div className="login-error" id="login-error" role="alert" aria-live="assertive">
                <span className="login-error-icon" aria-hidden="true">!</span>
                <span>{isTwoFactorStep && !errorMessage ? "Enter the 6-digit code to continue." : errorMessage || oauthError}</span>
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
              ) : isInternal ? (
                "Login"
              ) : (
                "Sign in to Project Likas"
              )}
              {!isSubmitting && <ArrowRight size={18} />}
            </Button>
          </form>

          {isTwoFactorStep && (
            <button type="button" className="login-back-link" onClick={restartLogin}>
              <ArrowLeft size={16} /> Start over
            </button>
          )}

          {!isInternal ? (
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
                Citizen, Administrator, Center Staff, and Responder teams all sign in here — pick your role above.
              </p>
            </>
          ) : (
            <p className="login-note">Only authorized personnel use {formatRoleLabel(role)} access.</p>
          )}
        </section>
        <p className="login-undernote">
          {isInternal ? "Secured access for authorized personnel only." : "Trusted community safety for every household."}
        </p>
      </div>

      {registrationOpen && <AccountRegister embedded initialRole="citizen" onClose={() => setRegistrationOpen(false)} />}
      {recoveryOpen && <PasswordRecovery embedded onClose={() => setRecoveryOpen(false)} />}
    </main>
  );
}

function resolveInitialRole(): AccountRole {
  const requested = new URLSearchParams(window.location.search).get("role");
  return requested === "admin" || requested === "staff" || requested === "responder" || requested === "citizen"
    ? requested
    : "citizen";
}