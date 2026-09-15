import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import AccountRegister from "./pages/AccountRegister";
import PasswordRecovery from "./pages/PasswordRecovery";
import AcceptInvitation from "./pages/AcceptInvitation";
import CitizenHome from "./pages/CitizenHome";

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/register"} component={AccountRegister} />
      <Route path={"/recover"} component={PasswordRecovery} />
      <Route path={"/accept-invitation"} component={AcceptInvitation} />
      <Route path={"/"} component={Home} />
      <Route path="/citizen" component={CitizenHome} />
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
