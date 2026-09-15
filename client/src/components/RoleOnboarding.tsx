import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRoleLabel, onboardingSteps } from "../../../shared/roles";

type Role = "admin" | "staff" | "responder" | "citizen" | "user";
const guidance: Record<Role, { intro: string; steps: string[] }> = {
  citizen: { intro: "Find a safe place, read local alerts, or tell responders what is happening.", steps: ["Check nearby center availability and directions.", "Use Report an emergency for danger, flooding, fire, or injury.", "Call 911 when someone needs immediate help."] },
  responder: { intro: "Stay focused on assigned incidents and close the loop with clear actions.", steps: ["Open the Incident map to review priority and location.", "Record arrival and actions as the situation develops.", "Resolve incidents only after the situation is confirmed safe."] },
  staff: { intro: "Keep your center’s occupancy, evacuee registry, and supplies accurate.", steps: ["Review center capacity before registering or transferring evacuees.", "Record stock movements as they happen.", "Use Alerts to coordinate shortages and urgent center updates."] },
  admin: { intro: "Coordinate the whole response network and protect least-privilege access.", steps: ["Review the overview for capacity, alerts, and incidents.", "Use User & roles to invite and assign staff or responders.", "Check Activity log after sensitive changes and configuration updates."] },
  user: { intro: "Find safe centers, read alerts, and share emergency information.", steps: ["Check nearby center availability and directions.", "Use Report an emergency when you need responder help.", "Call 911 when someone needs immediate help."] },
};

export default function RoleOnboarding({ role }: { role?: string | null }) {
  const normalized = (role || "citizen") as Role;
  const content = { ...(guidance[normalized] || guidance.citizen), steps: onboardingSteps(normalized) };
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(window.localStorage.getItem(`likas-onboarding-${normalized}-v1`) !== "done"); }, [normalized]);
  if (!open) return null;
  return <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><section className="onboarding-card"><span className="eyebrow">WELCOME TO PROJECT LIKAS</span><h2 id="onboarding-title">Your {formatRoleLabel(normalized)} guide</h2><p>{content.intro}</p><div className="onboarding-steps">{content.steps.map((step) => <div key={step}><CheckCircle2 size={19}/><span>{step}</span></div>)}</div><Button onClick={() => { window.localStorage.setItem(`likas-onboarding-${normalized}-v1`, "done"); setOpen(false); }}>Got it <ArrowRight size={17}/></Button></section></div>;
}
