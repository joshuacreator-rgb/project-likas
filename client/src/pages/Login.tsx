import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, HeartHandshake, LoaderCircle, MapPinned, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { getHomePath, getRoleFromSearch, roleBrands } from "../../../shared/roles";
import { getAuthErrorMessage } from "../../../shared/auth-feedback";
import { authenticateStaticAccount } from "@/lib/staticAuth";
import AccountRegister from "./AccountRegister";
import PasswordRecovery from "./PasswordRecovery";

type LoginRole = "admin" | "staff" | "responder" | "citizen";
const roles: Array<{ value: LoginRole; label: string; help: string; icon: typeof ShieldCheck; brand: (typeof roleBrands)[LoginRole] }> = [
  { value: "admin", label: "Administrator", help: "Manage users, settings, and all operations.", icon: ShieldCheck, brand: roleBrands.admin },
  { value: "staff", label: "Evacuation Center Staff", help: "Manage occupancy, evacuees, and supplies.", icon: Building2, brand: roleBrands.staff },
  { value: "responder", label: "Responder / Disaster Team", help: "See assigned incidents and response actions.", icon: Radio, brand: roleBrands.responder },
  { value: "citizen", label: "Citizen", help: "Find safe centers and report an emergency.", icon: HeartHandshake, brand: roleBrands.citizen },
];

export default function Login() {
  const [, navigate] = useLocation();
  const [role, setRole] = useState<LoginRole>(() => getRoleFromSearch(window.location.search));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [oauthError, setOauthError] = useState("");
  const markAuthenticated = () => {
    sessionStorage.setItem("likas-login-complete", "true");
  };
  const login = trpc.localAuth.login.useMutation({
    onSuccess: result => { if (result.requiresTwoFactor) setChallengeToken(result.challengeToken); else { markAuthenticated(); navigate("/"); } },
    onError: error => {
      if (!import.meta.env.DEV) return;
      const user = authenticateStaticAccount(email, password);
      if (!user || user.role !== role) return;
      markAuthenticated();
      navigate(getHomePath(user.role));
    },
  });
  const verifyTwoFactor = trpc.localAuth.verifyTwoFactor.useMutation({ onSuccess: () => { markAuthenticated(); navigate("/"); } });
  const selected = roles.find((item) => item.value === role) ?? roles[0];
  const isTwoFactorStep = Boolean(challengeToken);
  const roleLocked = new URLSearchParams(window.location.search).has("role");
  const oauthConfigured = Boolean(
    import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID
  );
  const isSubmitting = login.isPending || verifyTwoFactor.isPending;
  const errorMessage = getAuthErrorMessage(
    (isTwoFactorStep ? verifyTwoFactor.error : login.error)?.message,
    isTwoFactorStep ? "2fa" : "login",
    role
  );

  function handleOAuth() {
    setOauthError("");
    try {
      startLogin();
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : "Secure platform sign-in is unavailable.");
    }
  }

  function restartLogin() {
    setChallengeToken("");
    setTwoFactorCode("");
    login.reset();
    verifyTwoFactor.reset();
  }

  function selectRole(nextRole: LoginRole) {
    setRole(nextRole);
    login.reset();
  }

  return (
    <main className="login-page">
      <div className="login-layout">
        <aside className="login-brief">
          <div className="login-brief-topline"><span className="login-live-dot" /> Operations access</div>
          <div className="login-brief-icon"><MapPinned size={28} /></div>
          <div>
            <span className="eyebrow">Pateros emergency network</span>
            <h2>One coordinated response starts here.</h2>
            <p>Connect to the workspace that keeps centers, responders, and citizens moving together when it matters.</p>
          </div>
          <div className="login-brief-list">
          </div>
          <div className="login-brief-footer"><ShieldCheck size={16} /><span>Your access is verified before every workspace session.</span></div>
        </aside>
        <section className="login-card">
        <div className="login-brand"><div className="brand-mark"><ShieldCheck size={26} /></div><div><strong>PROJECT LIKAS</strong><span>Emergency coordination</span></div></div>
        <div className="login-heading"><span className="eyebrow">{isTwoFactorStep ? "Additional security" : "Secure access"}</span><h1>{isTwoFactorStep ? "Confirm your sign-in." : roleLocked ? `Sign in as ${selected.label}.` : "Choose your role."}</h1><p>{isTwoFactorStep ? `Enter the 6-digit code from your authenticator app to continue to ${selected.brand.organization}.` : "Sign in to the workspace for your role. Your account permissions are always verified by the server."}</p></div>
        {!isTwoFactorStep && !roleLocked && <div className="role-choice-grid" role="radiogroup" aria-label="Choose your role">{roles.map((item) => { const Icon = item.icon; return <button type="button" role="radio" aria-checked={role === item.value} className={`role-choice ${role === item.value ? "selected" : ""}`} onClick={() => selectRole(item.value)} key={item.value}><span className={`role-choice-mark ${item.brand.tone}`} aria-hidden="true">{item.brand.mark}</span><Icon size={21} /><span className="role-choice-copy"><strong>{item.label}</strong><small className="role-choice-organization">{item.brand.organization}</small><small className="role-choice-department">{item.brand.department}</small><small>{item.help}</small></span></button>; })}</div>}
        <form className="login-form" aria-busy={isSubmitting} onSubmit={(event) => { event.preventDefault(); if (isTwoFactorStep) verifyTwoFactor.mutate({ challengeToken, code: twoFactorCode }); else login.mutate({ email, password, role }); }}>
          {isTwoFactorStep ? <label>Authenticator code<Input id="authenticator-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={twoFactorCode} aria-invalid={Boolean(errorMessage)} onChange={(event) => { setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6)); verifyTwoFactor.reset(); }} required autoFocus /></label> : <><label>Email address<Input id="login-email" type="email" value={email} aria-invalid={Boolean(errorMessage)} onChange={(event) => { setEmail(event.target.value); login.reset(); }} required autoComplete="email" /></label><label>Password<div className="password-input-wrap"><Input id="login-password" type={showPassword ? "text" : "password"} value={password} aria-invalid={Boolean(errorMessage)} onChange={(event) => { setPassword(event.target.value); login.reset(); }} required autoComplete="current-password" /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label></>}
            {(errorMessage || oauthError) && <div className="login-error" id="login-error" role="alert" aria-live="assertive"><span className="login-error-icon" aria-hidden="true">!</span><span>{errorMessage || oauthError}</span></div>}
          <Button type="submit" disabled={isSubmitting || (isTwoFactorStep && twoFactorCode.length !== 6)} aria-describedby={errorMessage ? "login-error" : undefined}>{isSubmitting ? <><LoaderCircle className="login-spinner" size={18} aria-hidden="true" />{isTwoFactorStep ? "Verifying code…" : "Signing you in…"}</> : isTwoFactorStep ? "Verify and continue" : `Sign in as ${selected.label}`} {!isSubmitting && <ArrowRight size={18} />}</Button>
        </form>
        {isTwoFactorStep ? <button type="button" className="login-back-link" onClick={restartLogin}><ArrowLeft size={16} /> Start over</button> : <><div className="account-links"><button type="button" onClick={() => setRegistrationOpen(true)}>Register as Citizen</button><button type="button" onClick={() => setRecoveryOpen(true)}>Forgot password?</button></div>{oauthConfigured && <><div className="login-divider"><span>or</span></div><Button type="button" variant="outline" onClick={handleOAuth}>Continue with secure platform sign-in</Button></>}</>}
        </section>
      </div>
      {registrationOpen && <AccountRegister embedded initialRole="citizen" onClose={() => setRegistrationOpen(false)} />}
      {recoveryOpen && <PasswordRecovery embedded onClose={() => setRecoveryOpen(false)} />}
    </main>
  );
}
