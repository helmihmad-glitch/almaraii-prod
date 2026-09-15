// Atelier Signal — shell de navigation : rail latéral stable, interface de pilotage lisible et orientée décision.
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import AppShell from "./components/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Registry from "./pages/Registry";
import Settings from "./pages/Settings";
import DailyProgram from "./pages/DailyProgram";
import DailyProgramData from "./pages/DailyProgramData";
import SiloPf from "./pages/SiloPf";
import SiloProduction from "./pages/SiloProduction";
import SiloExpedition from "./pages/SiloExpedition";
import SiloLots from "./pages/SiloLots";

function Router() {
  console.log("Router initialized");
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/registre" component={Registry} />
      <Route path="/parametres" component={Settings} />
      <Route path="/programme-journalier" component={DailyProgram} />
      <Route path="/programme-journalier-donnee" component={DailyProgramData} />
      <Route path="/silo-pf" component={SiloPf} />
      <Route path="/silo-pf-production" component={SiloProduction} />
      <Route path="/silo-pf-expedition" component={SiloExpedition} />
      <Route path="/silo-pf-lots" component={SiloLots} />
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
