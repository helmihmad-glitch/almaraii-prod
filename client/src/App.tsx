// Atelier Signal — shell de navigation : rail latéral stable, interface de pilotage lisible et orientée décision.
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import AppShell from "./components/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Registry from "./pages/Registry";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import DailyProgram from "./pages/DailyProgram";
import DailyProgramData from "./pages/DailyProgramData";
import SiloPf from "./pages/SiloPf";
import SiloProduction from "./pages/SiloProduction";
import SiloExpedition from "./pages/SiloExpedition";
import SiloLots from "./pages/SiloLots";
import Reports from "./pages/Reports";
import SmsSend from "./pages/SmsSend";

/** Garde de route : redirige vers l’accueil tant que la session admin n’est pas confirmée (ne rend rien entre-temps pour éviter un flash de contenu protégé). */
function AdminRoute({ children }: { children: ReactNode }) {
  const meQuery = trpc.auth.me.useQuery();
  const [, setLocation] = useLocation();
  const isAdmin = meQuery.data?.role === "admin";

  useEffect(() => {
    if (meQuery.data && !isAdmin) setLocation("/");
  }, [meQuery.data, isAdmin, setLocation]);

  if (!isAdmin) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/connexion" component={Login} />
      <Route path="/registre"><AdminRoute><Registry /></AdminRoute></Route>
      <Route path="/parametres"><AdminRoute><Settings /></AdminRoute></Route>
      <Route path="/programme-journalier" component={DailyProgram} />
      <Route path="/programme-journalier-donnee"><AdminRoute><DailyProgramData /></AdminRoute></Route>
      <Route path="/silo-pf" component={SiloPf} />
      <Route path="/silo-pf-production"><AdminRoute><SiloProduction /></AdminRoute></Route>
      <Route path="/silo-pf-expedition"><AdminRoute><SiloExpedition /></AdminRoute></Route>
      <Route path="/silo-pf-lots" component={SiloLots} />
      <Route path="/rapports"><AdminRoute><Reports /></AdminRoute></Route>
      <Route path="/sms"><AdminRoute><SmsSend /></AdminRoute></Route>
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
          <AppShell><Router /></AppShell>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
