// Coque commune : rail latéral de navigation partagé par toutes les pages.
// Les pages conservent leur propre en-tête (actions spécifiques) et reçoivent
// le bouton d’ouverture du rail sur mobile via `useSidebar()`.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeftRight, CalendarDays, ChevronDown, ClipboardList, FileSpreadsheet, LayoutDashboard, LogIn, LogOut, PackageSearch, Settings2, X, type LucideIcon } from "lucide-react";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { trpc } from "@/lib/trpc";

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
    kind: "group", label: "Flux de Production", icon: ArrowLeftRight, children: [
      { path: "/silo-pf-production", label: "Production" },
      { path: "/silo-pf-expedition", label: "Expédition" },
      { path: "/silo-pf", label: "Silo PF" },
    ],
  },
  { kind: "link", path: "/silo-pf-lots", label: "Traçabilité des lots", icon: PackageSearch },
  { kind: "link", path: "/registre", label: "Registre journalier", icon: ClipboardList },
  { kind: "link", path: "/rapports", label: "Rapports", icon: FileSpreadsheet },
];

/** Groupe (par étiquette) dont un enfant correspond au chemin actuel. */
function groupLabelForPath(path: string): string | null {
  for (const item of NAV_ITEMS) {
    if (item.kind === "group" && item.children.some((child) => child.path === path)) return item.label;
  }
  return null;
}

// Pages visibles sans connexion : l’essentiel du suivi, en lecture. Le reste
// (saisies, imports, paramètres) exige la session admin — voir AdminRoute
// dans App.tsx, qui applique le même contrôle côté route, pas seulement ici.
const VISITOR_ALLOWED_PATHS = new Set<string>(["/", "/programme-journalier", "/silo-pf", "/silo-pf-lots"]);

/** Filtre le rail pour un visiteur : retire les liens non autorisés, et un groupe réduit à un seul enfant devient un lien direct plutôt qu’un groupe à déplier. */
function filterNavItemsForRole(role: "admin" | "visiteur"): NavItem[] {
  if (role === "admin") return NAV_ITEMS;
  const filtered: NavItem[] = [];
  for (const item of NAV_ITEMS) {
    if (item.kind === "link") {
      if (VISITOR_ALLOWED_PATHS.has(item.path)) filtered.push(item);
      continue;
    }
    const children = item.children.filter((child) => VISITOR_ALLOWED_PATHS.has(child.path));
    if (children.length === 0) continue;
    if (children.length === 1) filtered.push({ kind: "link", path: children[0].path, label: children[0].label, icon: item.icon });
    else filtered.push({ ...item, children });
  }
  return filtered;
}

export default function AppShell({ children, shortcuts }: { children: ReactNode; shortcuts?: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery();
  const role = meQuery.data?.role ?? "visiteur";
  const navItems = useMemo(() => filterNavItemsForRole(role), [role]);
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); setLocation("/"); },
  });
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
              {navItems.map((item) => {
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
              {role === "admin" ? (
                <>
                  <button className={`rail-link ${location === "/parametres" ? "active" : ""}`} onClick={() => navigate("/parametres")}><Settings2 size={17} />Paramètres</button>
                  <button className="rail-link" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={17} />Déconnexion</button>
                </>
              ) : (
                <button className={`rail-link ${location === "/connexion" ? "active" : ""}`} onClick={() => navigate("/connexion")}><LogIn size={17} />Se connecter</button>
              )}
            </nav>
          </div>
        </aside>
        {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu" />}
        <div className="main-content">{children}</div>
      </div>
    </SidebarContext.Provider>
  );
}
