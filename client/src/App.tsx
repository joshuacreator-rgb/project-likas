import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { AdminLogin, CitizenLogin, InternalLogin } from "./pages/Login";
import AccountRegister from "./pages/AccountRegister";
import PasswordRecovery from "./pages/PasswordRecovery";
import AcceptInvitation from "./pages/AcceptInvitation";
import CitizenHome from "./pages/CitizenHome";

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={CitizenLogin} />
      <Route path={"/admin/login"} component={() => <AdminLogin />} />
      <Route path={"/staff/login"} component={() => <InternalLogin role="staff" />} />
      <Route path={"/responder/login"} component={() => <InternalLogin role="responder" />} />
      <Route path={"/internal/login"} component={() => <InternalLogin />} />
      <Route path={"/register"} component={AccountRegister} />
      <Route path={"/recover"} component={PasswordRecovery} />
      <Route path={"/accept-invitation"} component={AcceptInvitation} />
      <Route path={"/admin"} component={Home} />
      <Route path={"/staff"} component={Home} />
      <Route path={"/responder"} component={Home} />
      <Route path={"/citizen"} component={CitizenHome} />
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
