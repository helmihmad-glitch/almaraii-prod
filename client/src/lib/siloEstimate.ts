// Estimation importée (classeur « Traçabilité des lots » retouché, dernière feuille) :
// affichée en transparence sur les pages État des silos et Traçabilité des lots,
// jamais enregistrée. Une seule estimation, partagée par les deux pages et gardée
// dans ce navigateur jusqu'à « Retirer », pour survivre à un rechargement.

export type SiloEstimateLot = { article: string; lotNumber: string | null; date: string | null; quantity: number };
export type SiloEstimate = { silo: string; quantity: number; articles: { article: string; quantity: number }[]; lots?: SiloEstimateLot[] };
export type StoredEstimate = { fileName: string; sheet?: string | null; label: string | null; silos: SiloEstimate[] };

const ESTIMATE_STORAGE_KEY = "silo-pf-estimate";

export function loadStoredEstimate(): StoredEstimate | null {
  try {
    const raw = window.localStorage.getItem(ESTIMATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as StoredEstimate : null;
    return parsed && Array.isArray(parsed.silos) ? parsed : null;
  } catch {
    return null;
  }
}

export function storeEstimate(estimate: StoredEstimate | null) {
  try {
    if (estimate) window.localStorage.setItem(ESTIMATE_STORAGE_KEY, JSON.stringify(estimate));
    else window.localStorage.removeItem(ESTIMATE_STORAGE_KEY);
  } catch {
    // Stockage indisponible (navigation privée) : l'estimation reste affichée jusqu'au rechargement.
  }
}

export function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Le fichier n’a pas pu être lu."));
    reader.readAsDataURL(file);
  });
}

export const formatSignedTons = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : "±"}${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value))} T`;

export const estimateLotKey = (silo: string, lotNumber: string | null) => `${silo.toUpperCase()}::${(lotNumber ?? "").trim().toUpperCase()}`;

/** Libellé court affiché dans la pastille « Estimation · feuille 28 · Le 28 oct. 2026 ». */
export const describeEstimate = (estimate: StoredEstimate) =>
  `Estimation${estimate.sheet ? ` · feuille ${estimate.sheet}` : ""}${estimate.label ? ` · ${estimate.label}` : ""}`;
