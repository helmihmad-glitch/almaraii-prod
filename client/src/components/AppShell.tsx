// Coque commune : rail latéral de navigation partagé par toutes les pages.
// Les pages conservent leur propre en-tête (actions spécifiques) et reçoivent
// le bouton d’ouverture du rail sur mobile via `useSidebar()`.
import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Boxes, CalendarDays, ClipboardList, LayoutDashboard, Layers, PackageSearch, Settings2, SlidersHorizontal, X } from "lucide-react";
import { BRAND_LOGO_URL } from "@/lib/brand";

type SidebarContextValue = { openSidebar: () => void };
const SidebarContext = createContext<SidebarContextValue>({ openSidebar: () => {} });

/** Donne accès à l’ouverture du rail depuis l’en-tête d’une page (mobile). */
export const useSidebar = () => useContext(SidebarContext);

const NAV_LINKS = [
  { path: "/", label: "Vue d’ensemble", icon: LayoutDashboard },
  { path: "/registre", label: "Registre journalier", icon: ClipboardList },
  { path: "/programme-journalier", label: "Programme journalier", icon: CalendarDays },
  { path: "/programme-journalier-donnee", label: "Programme journalier donnée", icon: SlidersHorizontal },
  { path: "/silo-pf", label: "Silo PF", icon: Boxes },
  { path: "/silo-pf-donnee", label: "Silo PF donnée", icon: Layers },
  { path: "/silo-pf-lots", label: "Traçabilité des lots", icon: PackageSearch },
] as const;

export default function AppShell({ children, shortcuts }: { children: ReactNode; shortcuts?: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location, setLocation] = useLocation();

  const navigate = (path: string) => { setSidebarOpen(false); setLocation(path); };

  return (
    <SidebarContext.Provider value={{ openSidebar: () => setSidebarOpen(true) }}>
      <div className="app-shell">
        <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
          <div className="brand">
            <div className="brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div>
            <div><strong>Almaraïi</strong><span>Production Pulse</span></div>
            <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu"><X size={18} /></button>
          </div>
          <div className="rail-section">
            <span className="rail-label">Espace opérationnel</span>
            <nav>
              {NAV_LINKS.map(({ path, label, icon: Icon }) => (
                <button key={path} className={`rail-link ${location === path ? "active" : ""}`} onClick={() => navigate(path)}>
                  <Icon size={17} />{label}
                </button>
              ))}
            </nav>
          </div>
          <div className="rail-section">
            <span className="rail-label">Raccourcis</span>
            <nav>
              {shortcuts}
              <button className={`rail-link ${location === "/parametres" ? "active" : ""}`} onClick={() => navigate("/parametres")}><Settings2 size={17} />Paramètres</button>
            </nav>
          </div>
          <div className="rail-footer">
            <div className="status-pulse"><span />Source synchronisée</div>
            <small>Classeur : Dashboard_Production.xlsx<br />Dernière lecture · aujourd’hui</small>
          </div>
        </aside>
        {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu" />}
        <div className="main-content">{children}</div>
      </div>
    </SidebarContext.Provider>
  );
}
