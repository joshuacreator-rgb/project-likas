import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartHandshake,
  LoaderCircle,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  getHomePath,
  getRoleFromSearch,
  roleBrands,
} from "../../../shared/roles";

type RegistrationRole = "admin" | "staff" | "responder" | "citizen";
const roles: Array<{
  value: RegistrationRole;
  label: string;
  help: string;
  icon: typeof ShieldCheck;
  brand: (typeof roleBrands)[RegistrationRole];
}> = [
  {
    value: "admin",
    label: "Administrator",
    help: "Manage users, settings, and all operations.",
    icon: ShieldCheck,
    brand: roleBrands.admin,
  },
  {
    value: "staff",
    label: "Evacuation Center Staff",
    help: "Manage occupancy, evacuees, and supplies.",
    icon: Building2,
    brand: roleBrands.staff,
  },
  {
    value: "responder",
    label: "Responder / Disaster Team",
    help: "See assigned incidents and response actions.",
    icon: Radio,
    brand: roleBrands.responder,
  },
  {
    value: "citizen",
    label: "Citizen",
    help: "Find safe centers and report an emergency.",
    icon: HeartHandshake,
    brand: roleBrands.citizen,
  },
];

type AccountRegisterProps = {
  embedded?: boolean;
  initialRole?: RegistrationRole;
  onClose?: () => void;
  params?: Record<string, string | undefined>;
};

export default function AccountRegister({
  embedded = false,
  initialRole,
  onClose,
}: AccountRegisterProps) {
  const [, navigate] = useLocation();
  const [role, setRole] = useState<RegistrationRole>(
    () => initialRole ?? getRoleFromSearch(window.location.search)
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalAccepted, setApprovalAccepted] = useState(false);
  const [approvalToken, setApprovalToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = roles.find(item => item.value === role) ?? roles[3];
  const register = trpc.localAuth.register.useMutation({
    onSuccess: result => {
      setApprovalToken(result.approvalToken);
      setApprovalPending(true);
    },
    onError: error => {
      setNotice(error.message);
    },
  });
  const approvalStatus = trpc.localAuth.checkApproval.useQuery(
    { token: approvalToken },
    { enabled: approvalPending && Boolean(approvalToken), refetchInterval: 500 }
  );
  const completeApproval = trpc.localAuth.completeApproval.useMutation({
    onSuccess: () => {
      window.location.href = "/citizen";
    },
    onError: error => {
      setApprovalAccepted(false);
      setNotice(error.message);
    },
  });
  const isCitizenRegistration = role === "citizen";
  const hasEmail = email.trim().length > 0;
  const isGmailEmail = /^[^\s@]+@gmail\.com$/i.test(email.trim());

  useEffect(() => {
    if (approvalStatus.data?.accountStatus === "APPROVED" && !approvalAccepted && !completeApproval.isPending) {
      setApprovalAccepted(true);
      completeApproval.mutate({ token: approvalToken });
    }
    if (approvalStatus.data?.accountStatus === "REJECTED") {
      setApprovalPending(false);
      setNotice("Your registration was not approved. Please contact an Administrator.");
    }
  }, [approvalAccepted, approvalStatus.data?.accountStatus, approvalToken, completeApproval]);

  function selectRole(nextRole: RegistrationRole) {
    setRole(nextRole);
    setNotice("");
    setApprovalPending(false);
    setApprovalAccepted(false);
    setApprovalToken("");
    register.reset();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    register.reset();
    if (!isCitizenRegistration) {
      setNotice(
        `${selected.label} accounts are provisioned by an Administrator for security. Use Log in for an existing account, or ask an Administrator to create a temporary demo account.`
      );
      return;
    }
    register.mutate({ name, email, password, role });
  }

  function handleBack() {
    if (embedded && onClose) {
      onClose();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate(`/login?role=${role}`);
  }

  const content = (
    <section className="login-card account-card">
      <div className="account-top-actions">
        <Button type="button" variant="outline" onClick={handleBack}>
          <ArrowLeft size={15} /> Back
        </Button>
      </div>
      <div className="login-brand">
        <div className="brand-mark">
          <ShieldCheck size={26} />
        </div>
        <div>
          <strong>PROJECT LIKAS</strong>
          <span>Create an account</span>
        </div>
      </div>
      <div className="login-heading">
        <span className="eyebrow">Registration</span>
        <h1>
          {embedded ? "Create your account." : "Choose your access path."}
        </h1>
        <p>
          {embedded
            ? "Register as a citizen to receive center guidance, alerts, and emergency reporting."
            : "Select the role you need before continuing. Citizen accounts can self-register; operational roles are securely provisioned by an Administrator."}
        </p>
      </div>
      {!embedded && (
        <>
          <div
            className="role-choice-grid registration-role-grid"
            role="radiogroup"
            aria-label="Choose the account role"
          >
            {roles.map(item => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={role === item.value}
                  className={`role-choice ${role === item.value ? "selected" : ""}`}
                  onClick={() => selectRole(item.value)}
                  key={item.value}
                >
                  <span
                    className={`role-choice-mark ${item.brand.tone}`}
                    aria-hidden="true"
                  >
                    {item.brand.mark}
                  </span>
                  <Icon size={21} />
                  <span className="role-choice-copy">
                    <strong>{item.label}</strong>
                    <small className="role-choice-organization">
                      {item.brand.organization}
                    </small>
                    <small className="role-choice-department">
                      {item.brand.department}
                    </small>
                    <small>{item.help}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className={`registration-path-note ${isCitizenRegistration ? "citizen" : "protected"}`}
            role="status"
          >
            <strong>
              {isCitizenRegistration
                ? "Citizen self-registration"
                : `${selected.label} access is protected`}
            </strong>
            <span>
              {isCitizenRegistration
                ? "Create your account to use nearby center guidance, alerts, and emergency reporting."
                : "Operational access is assigned by invitation or temporary demo provisioning from an Administrator."}
            </span>
          </div>
        </>
      )}
      {approvalPending ? approvalAccepted ? <div className="registration-accepted" role="status" aria-live="polite">
        <div className="registration-accepted-check"><CheckCircle2 size={38} aria-hidden="true" /></div>
        <span className="eyebrow">Approval complete</span>
        <h2>Your account has been approved!</h2>
        <p>Redirecting you to your citizen dashboard...</p>
        <LoaderCircle className="registration-accepted-loader" size={22} aria-label="Opening your dashboard" />
      </div> : <div className="registration-pending" role="status" aria-live="polite">
        <div className="registration-pending-orbit"><LoaderCircle size={34} aria-hidden="true" /></div>
        <span className="eyebrow">Application received</span>
        <h2>Waiting for approval</h2>
        <p>Your citizen account is waiting for an Administrator to review and accept it. This page will continue automatically after approval.</p>
        <div className="registration-pending-dots" aria-hidden="true"><i /><i /><i /></div>
      </div> : <form
        className="login-form"
        aria-busy={register.isPending}
        onSubmit={handleSubmit}
      >
        <label>
          Your name
          <Input
            value={name}
            onChange={event => {
              setName(event.target.value);
              register.reset();
            }}
            required
            minLength={2}
            autoComplete="name"
          />
        </label>
        <label>
          Email address
          <div className="email-input-wrap">
            <Input
              type="email"
              value={email}
              pattern="[^\s@]+@gmail\.com"
              title="Enter a Gmail address ending in @gmail.com."
              onChange={event => {
                setEmail(event.target.value);
                register.reset();
              }}
              required
              autoComplete="email"
              aria-invalid={hasEmail && !isGmailEmail}
              aria-describedby={hasEmail && !isGmailEmail ? "registration-email-alert" : undefined}
            />
            {isGmailEmail && (
              <CheckCircle2 className="email-valid-icon" size={19} aria-label="Valid Gmail address" />
            )}
          </div>
          {hasEmail && !isGmailEmail && (
            <span id="registration-email-alert" className="email-validation-alert" role="alert">
              Enter a Gmail address ending in @gmail.com.
            </span>
          )}
        </label>
        <label className="password-field">
          Create a password
          <div className="password-input-wrap">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={event => {
                setPassword(event.target.value);
                register.reset();
              }}
              required
              minLength={10}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        {(notice || register.error) && (
          <div className="login-error" role="alert" aria-live="assertive">
            <span className="login-error-icon" aria-hidden="true">
              !
            </span>
            <span>{notice || register.error?.message}</span>
          </div>
        )}
        {isCitizenRegistration ? (
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? (
              <>
                <LoaderCircle className="login-spinner" size={18} /> Creating
                account…
              </>
            ) : (
              <>
                Register as Citizen <ArrowRight size={17} />
              </>
            )}
          </Button>
        ) : (
          <Button type="button" onClick={() => navigate(`/login?role=${role}`)}>
            <ArrowRight size={17} /> Log in as {selected.label}
          </Button>
        )}
      </form>}
      {!embedded && (
        <div className="account-links registration-footer-links">
          <button type="button" onClick={() => navigate("/recover")}>
            Forgot password?
          </button>
        </div>
      )}
    </section>
  );
  return embedded ? (
    <div
      className="registration-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Create an account"
    >
      {content}
    </div>
  ) : (
    <main className="login-page">{content}</main>
  );
}
