// Coque commune : rail latéral de navigation partagé par toutes les pages.
// Les pages conservent leur propre en-tête (actions spécifiques) et reçoivent
// le bouton d’ouverture du rail sur mobile via `useSidebar()`.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Boxes, CalendarDays, ChevronDown, ClipboardList, LayoutDashboard, PackageSearch, Settings2, X, type LucideIcon } from "lucide-react";
import { BRAND_LOGO_URL } from "@/lib/brand";

type SidebarContextValue = { openSidebar: () => void };
const SidebarContext = createContext<SidebarContextValue>({ openSidebar: () => {} });

/** Donne accès à l’ouverture du rail depuis l’en-tête d’une page (mobile). */
export const useSidebar = () => useContext(SidebarContext);

type NavLeaf = { path: string; label: string };
type NavItem =
  | { kind: "link"; path: string; label: string; icon: LucideIcon }
  | { kind: "group"; label: string; icon: LucideIcon; children: NavLeaf[] };

const NAV_ITEMS: NavItem[] = [
  { kind: "link", path: "/", label: "Accueil", icon: LayoutDashboard },
  {
    kind: "group", label: "Programme journalier", icon: CalendarDays, children: [
      { path: "/programme-journalier", label: "Liste des programmes" },
      { path: "/programme-journalier-donnee", label: "Ajouter un programme" },
    ],
  },
  {
    kind: "group", label: "État des silos", icon: Boxes, children: [
      { path: "/silo-pf", label: "Silo PF" },
      { path: "/silo-pf-production", label: "Ajouter production" },
      { path: "/silo-pf-expedition", label: "Ajouter expédition" },
    ],
  },
  { kind: "link", path: "/silo-pf-lots", label: "Traçabilité des lots", icon: PackageSearch },
  { kind: "link", path: "/registre", label: "Registre journalier", icon: ClipboardList },
];

/** Groupe (par étiquette) dont un enfant correspond au chemin actuel. */
function groupLabelForPath(path: string): string | null {
  for (const item of NAV_ITEMS) {
    if (item.kind === "group" && item.children.some((child) => child.path === path)) return item.label;
  }
  return null;
}

export default function AppShell({ children, shortcuts }: { children: ReactNode; shortcuts?: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location, setLocation] = useLocation();
  // Groupes dépliés : on ouvre automatiquement celui qui contient la page
  // actuelle (y compris lors d’un accès direct par lien, pas seulement via un
  // clic dans le rail), et l’utilisateur peut en déplier d’autres ensuite.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = groupLabelForPath(location);
    return initial ? new Set([initial]) : new Set();
  });

  useEffect(() => {
    const activeGroup = groupLabelForPath(location);
    if (!activeGroup) return;
    setOpenGroups((previous) => (previous.has(activeGroup) ? previous : new Set(previous).add(activeGroup)));
  }, [location]);

  const navigate = (path: string) => { setSidebarOpen(false); setLocation(path); };
  const toggleGroup = (label: string) => setOpenGroups((previous) => {
    const next = new Set(previous);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

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
              {NAV_ITEMS.map((item) => {
                if (item.kind === "link") {
                  const Icon = item.icon;
                  return (
                    <button key={item.path} className={`rail-link ${location === item.path ? "active" : ""}`} onClick={() => navigate(item.path)}>
                      <Icon size={17} />{item.label}
                    </button>
                  );
                }
                const Icon = item.icon;
                const isOpen = openGroups.has(item.label);
                const hasActiveChild = item.children.some((child) => child.path === location);
                return (
                  <div key={item.label} className="rail-group">
                    <button
                      type="button"
                      className={`rail-link rail-group-toggle ${hasActiveChild ? "active" : ""}`}
                      onClick={() => toggleGroup(item.label)}
                      aria-expanded={isOpen}
                    >
                      <Icon size={17} />{item.label}
                      <ChevronDown size={15} className={`rail-group-chevron ${isOpen ? "rail-group-chevron-open" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="rail-subnav">
                        {item.children.map((child) => (
                          <button key={child.path} className={`rail-link rail-sublink ${location === child.path ? "active" : ""}`} onClick={() => navigate(child.path)}>
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
