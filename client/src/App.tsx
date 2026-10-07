import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import { getHomePath } from "../../shared/roles";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Home from "./pages/Home";
import { AdminLogin, CitizenLogin, InternalLogin } from "./pages/Login";
import AccountRegister from "./pages/AccountRegister";
import PasswordRecovery from "./pages/PasswordRecovery";
import AcceptInvitation from "./pages/AcceptInvitation";
import AccountSecurity from "./pages/AccountSecurity";
import CitizenHome from "./pages/CitizenHome";

type GuardedRole = "admin" | "staff" | "responder" | "citizen";

function RouteSplash() {
  return (
    <div
      className="route-splash"
      style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}
    >
      <LoaderCircle className="login-spinner" size={26} aria-hidden="true" />
    </div>
  );
}

/**
 * Route-level role guard. The dashboard path a user lands on must match their
 * actual role; anything else redirects to their own home path. This is a
 * client-side visibility guard — the backend still enforces authorization on
 * every procedure.
 */
function RouteGuard({
  role,
  children,
}: {
  role: GuardedRole;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return <RouteSplash />;
  const allowed =
    role === "citizen"
      ? user?.role === "citizen" || user?.role === "user"
      : user?.role === role;
  if (!allowed) return <Redirect to={getHomePath(user?.role)} />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={CitizenLogin} />
      <Route path={"/admin/login"} component={() => <AdminLogin />} />
      <Route path={"/staff/login"} component={() => <InternalLogin role="staff" />} />
      <Route path={"/responder/login"} component={() => <InternalLogin role="responder" />} />
      <Route path={"/internal/login"} component={() => <InternalLogin allowRoleSelection />} />
      <Route path={"/register"} component={AccountRegister} />
      <Route path={"/recover"} component={PasswordRecovery} />
      <Route path={"/accept-invitation"} component={AcceptInvitation} />
      <Route path="/account/security" component={AccountSecurity} />
      <Route path={"/admin"}>{() => (
        <RouteGuard role="admin"><Home /></RouteGuard>
      )}</Route>
      <Route path={"/staff"}>{() => (
        <RouteGuard role="staff"><Home /></RouteGuard>
      )}</Route>
      <Route path={"/responder"}>{() => (
        <RouteGuard role="responder"><Home /></RouteGuard>
      )}</Route>
      <Route path={"/citizen"}>{() => (
        <RouteGuard role="citizen"><CitizenHome /></RouteGuard>
      )}</Route>
      <Route path={"/"} component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
