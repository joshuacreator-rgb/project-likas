import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { getHomePath } from "../../../shared/roles";
import { getAuthErrorMessage } from "../../../shared/auth-feedback";
import { authenticateStaticAccount } from "@/lib/staticAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AccountRegister from "./AccountRegister";
import PasswordRecovery from "./PasswordRecovery";

type LoginRole = "admin" | "staff" | "responder" | "citizen";
type InternalLoginRole = Exclude<LoginRole, "citizen">;

const internalLoginLabels: Record<InternalLoginRole, string> = {
  admin: "Administrator",
  staff: "Evacuation Center Staff",
  responder: "Responder / Disaster Team",
};

const internalBrief: Record<
  InternalLoginRole,
  { topline: string; title: string; description: string; points: string[] }
> = {
  admin: {
    topline: "Admin",
    title: "Emergency Operations Command",
    description:
      "Configure the system, manage staff and responders, and keep operations running from one command center.",
    points: [
      "Manage users, roles, and access",
      "Oversee emergency operations",
      "Monitor system activity and reports",
    ],
  },
  staff: {
    topline: "Staff",
    title: "Evacuation Center Operations",
    description:
      "Coordinate evacuation centers, track resources and capacity, and support families in your care.",
    points: [
      "Manage evacuation center operations",
      "Track resources and capacity",
      "Support displaced families",
    ],
  },
  responder: {
    topline: "Responder",
    title: "Disaster Response Coordination",
    description:
      "Receive deployments, report field status, and coordinate with your response team in real time.",
    points: [
      "Receive and manage deployments",
      "Report field status in real time",
      "Coordinate your response team",
    ],
  },
};

function resolveInternalRole(): InternalLoginRole {
  if (typeof window === "undefined") return "admin";
  const path = window.location.pathname;
  if (path === "/admin/login") return "admin";
  if (path === "/staff/login") return "staff";
  if (path === "/responder/login") return "responder";
  const requested = new URLSearchParams(window.location.search).get("role");
  if (requested === "staff" || requested === "responder") return requested;
  return "staff";
}

export function CitizenLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [oauthError, setOauthError] = useState("");

  const markAuthenticated = () => {
    sessionStorage.setItem("likas-login-complete", "true");
  };

  const login = trpc.localAuth.login.useMutation({
    onSuccess: () => {
      markAuthenticated();
      navigate("/citizen");
    },
    onError: (error) => {
      if (!import.meta.env.DEV) return;
      const user = authenticateStaticAccount(email, password);
      if (!user || user.role !== "citizen") return;
      markAuthenticated();
      navigate(getHomePath(user.role));
    },
  });

  const oauthConfigured = Boolean(
    import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID
  );
  const isSubmitting = login.isPending;
  const errorMessage = getAuthErrorMessage(login.error?.message, "login", "citizen");

  function handleOAuth() {
    setOauthError("");
    try {
      startLogin();
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : "Secure platform sign-in is unavailable.");
    }
  }

  return (
    <main className="login-page citizen-login-page">
      <div className="login-layout">
        <aside className="login-brief">
          <div className="login-brief-topline"><span className="login-live-dot" /> Community access</div>
          <div className="login-brief-icon"><ShieldCheck size={28} /></div>
          <div>
            <span className="eyebrow">Project Likas</span>
            <h2>Disaster Response &amp; Community Safety</h2>
            <p>Stay informed, report emergencies, and find the safest path to support when time matters.</p>
          </div>
          <div className="login-brief-list">
            <div><span className="list-pill">•</span> Locate safe evacuation centers</div>
            <div><span className="list-pill">•</span> Report incidents and urgent hazards</div>
            <div><span className="list-pill">•</span> Receive critical local updates</div>
          </div>
          <div className="login-brief-footer"><ShieldCheck size={16} /><span>Trusted community safety for every household.</span></div>
        </aside>

        <section className="login-card citizen-login-card">
          <div className="login-brand">
            <div className="brand-mark"><ShieldCheck size={26} /></div>
            <div>
              <strong>PROJECT LIKAS</strong>
              <span>Disaster Response &amp; Community Safety</span>
            </div>
          </div>

          <div className="login-heading">
            <span className="eyebrow">Public access</span>
            <h1>Welcome back.</h1>
            <p>Sign in to check updates, report emergencies, and access support for your community.</p>
          </div>

          <form className="login-form" aria-busy={isSubmitting} onSubmit={(event) => {
            event.preventDefault();
            login.mutate({ email, password, role: "citizen" });
          }}>
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

            {(errorMessage || oauthError) && (
              <div className="login-error" id="login-error" role="alert" aria-live="assertive">
                <span className="login-error-icon" aria-hidden="true">!</span>
                <span>{errorMessage || oauthError}</span>
              </div>
            )}

            <div className="account-links align-right">
              <button type="button" onClick={() => setRecoveryOpen(true)}>Forgot password?</button>
            </div>

            <Button type="submit" disabled={isSubmitting} aria-describedby={errorMessage ? "login-error" : undefined}>
              {isSubmitting ? (
                <>
                  <LoaderCircle className="login-spinner" size={18} aria-hidden="true" />
                  Signing you in…
                </>
              ) : (
                <>Sign in to Project Likas</>
              )}
              {!isSubmitting && <ArrowRight size={18} />}
            </Button>
          </form>

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
        </section>
      </div>

      {registrationOpen && <AccountRegister embedded initialRole="citizen" onClose={() => setRegistrationOpen(false)} />}
      {recoveryOpen && <PasswordRecovery embedded onClose={() => setRecoveryOpen(false)} />}
    </main>
  );
}

export function AdminLogin() {
  return <InternalLogin role="admin" />;
}

export function InternalLogin({
  role: roleOverride,
  allowRoleSelection = false,
}: {
  role?: InternalLoginRole;
  allowRoleSelection?: boolean;
}) {
  const [, navigate] = useLocation();
  const initialRole = roleOverride ?? resolveInternalRole();
  const [role, setRole] = useState<InternalLoginRole>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const markAuthenticated = () => {
    sessionStorage.setItem("likas-login-complete", "true");
  };

  const login = trpc.localAuth.login.useMutation({
    onSuccess: (result) => {
      if (result.requiresTwoFactor) {
        setChallengeToken(result.challengeToken);
        return;
      }
      markAuthenticated();
      navigate(getHomePath(role));
    },
  });

  const verifyTwoFactor = trpc.localAuth.verifyTwoFactor.useMutation({
    onSuccess: () => {
      markAuthenticated();
      navigate(getHomePath(role));
    },
  });

  const isTwoFactorStep = Boolean(challengeToken);
  const isSubmitting = login.isPending || verifyTwoFactor.isPending;
  const errorMessage = getAuthErrorMessage(
    (isTwoFactorStep ? verifyTwoFactor.error : login.error)?.message,
    isTwoFactorStep ? "2fa" : "login",
    role
  );

  function restartLogin() {
    setChallengeToken("");
    setTwoFactorCode("");
    login.reset();
    verifyTwoFactor.reset();
  }

  return (
    <main className="login-page internal-login-page">
      <div className="login-layout">
        <aside className="login-brief">
          <div className="login-brief-topline"><span className="login-live-dot" /> {internalBrief[role].topline} access</div>
          <div className="login-brief-icon"><ShieldCheck size={28} /></div>
          <div>
            <span className="eyebrow">Project Likas</span>
            <h2>{internalBrief[role].title}</h2>
            <p>{internalBrief[role].description}</p>
          </div>
          <div className="login-brief-list">
            {internalBrief[role].points.map((point) => (
              <div key={point}><span className="list-pill">•</span> {point}</div>
            ))}
          </div>
          <div className="login-brief-footer"><ShieldCheck size={16} /><span>Secured access for authorized personnel only.</span></div>
        </aside>

        <section className="login-card">
          <div className="login-brand">
            <div className="brand-mark"><ShieldCheck size={26} /></div>
            <div>
              <strong>PROJECT LIKAS</strong>
              <span>Disaster Response &amp; Community Safety</span>
            </div>
          </div>

          <div className="login-heading">
            <span className="eyebrow">{isTwoFactorStep ? "Confirm identity" : `${internalLoginLabels[role]} access`}</span>
            <h1>{isTwoFactorStep ? "Enter your security code." : "Welcome back."}</h1>
            <p>
              {isTwoFactorStep
                ? "Open your authenticator app and enter the 6-digit code to continue."
                : "Sign in to manage evacuation, response, and recovery operations for your community."}
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
              login.mutate({ email, password, role });
            }}
          >
            {allowRoleSelection && !isTwoFactorStep && (
              <label>
                Role
                <Select
                  value={role}
                  onValueChange={(value) => {
                    if (value !== "staff" && value !== "responder") return;
                    setRole(value);
                    restartLogin();
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Choose internal role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">{internalLoginLabels.staff}</SelectItem>
                    <SelectItem value="responder">{internalLoginLabels.responder}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            )}

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
                    id="internal-login-email"
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
                      id="internal-login-password"
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

            {(errorMessage || isTwoFactorStep) && (
              <div className="login-error" id="login-error" role="alert" aria-live="assertive">
                <span className="login-error-icon" aria-hidden="true">!</span>
                <span>{errorMessage || "Enter the 6-digit code to continue."}</span>
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
                "Login"
              )}
              {!isSubmitting && !isTwoFactorStep && <ArrowRight size={18} />}
            </Button>
          </form>

          {isTwoFactorStep && (
            <button type="button" className="login-back-link" onClick={restartLogin}>
              <ArrowLeft size={16} /> Start over
            </button>
          )}
        </section>
      </div>

      {recoveryOpen && <PasswordRecovery embedded onClose={() => setRecoveryOpen(false)} />}
    </main>
  );
}

export default function Login() {
  return <CitizenLogin />;
}
