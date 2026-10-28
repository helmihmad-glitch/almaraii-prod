import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { describeEstimate, loadStoredEstimate, readFileAsBase64, storeEstimate, type StoredEstimate } from "@/lib/siloEstimate";

const ESTIMATE_CHANGED_EVENT = "silo-estimate-changed";

/**
 * Estimation importée partagée par les pages État des silos et Traçabilité des lots :
 * importer ou retirer sur l'une se voit sur l'autre (même stockage du navigateur).
 */
export function useSiloEstimate() {
  const [estimate, setEstimate] = useState<StoredEstimate | null>(loadStoredEstimate);
  const parseEstimate = trpc.silo.parseEstimate.useMutation();

  useEffect(() => {
    const reload = () => setEstimate(loadStoredEstimate());
    window.addEventListener(ESTIMATE_CHANGED_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(ESTIMATE_CHANGED_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  const save = (next: StoredEstimate | null) => {
    setEstimate(next);
    storeEstimate(next);
    window.dispatchEvent(new Event(ESTIMATE_CHANGED_EVENT));
  };

  const importFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) { toast.error("Sélectionnez un classeur Excel au format .xlsx."); return; }
    if (file.size > 2_500_000) { toast.error("Le fichier Excel est trop volumineux (2,5 Mo maximum)."); return; }
    try {
      const result = await parseEstimate.mutateAsync({ fileName: file.name, fileBase64: await readFileAsBase64(file) });
      save({ fileName: file.name, sheet: result.sheet, label: result.label, silos: result.silos });
      const lotCount = result.silos.reduce((sum, silo) => sum + silo.lots.length, 0);
      toast.success("Estimation affichée", { description: `${result.silos.length} silo(s) et ${lotCount} lot(s) lus dans ${file.name}${result.sheet ? `, feuille « ${result.sheet} »` : ""}. Le stock réel n’est pas modifié.` });
      if (result.errors.length) toast.warning(`${result.errors.length} remarque(s) sur le fichier`, { description: result.errors.slice(0, 4).join(" ") });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’import de l’estimation a échoué.");
    }
  };

  return { estimate, importFile, clear: () => save(null), isImporting: parseEstimate.isPending };
}

/** Pastille « Estimation · feuille 28 … » + Retirer, et bouton d'import. */
export function SiloEstimateTools({ estimate, importFile, clear, isImporting }: ReturnType<typeof useSiloEstimate>) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      {estimate && (
        <span className="silo-estimate-chip" title={estimate.fileName}>
          {describeEstimate(estimate)}
          <button type="button" onClick={clear} aria-label="Retirer l’estimation"><X size={13} />Retirer</button>
        </span>
      )}
      <button type="button" className="silo-manage-link" onClick={() => inputRef.current?.click()} disabled={isImporting}>
        <Upload size={14} />{isImporting ? "Lecture…" : estimate ? "Remplacer l’estimation" : "Importer une estimation"}
      </button>
    </>
  );
}
