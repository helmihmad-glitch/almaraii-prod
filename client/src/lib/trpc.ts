import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

/**
 * Options pour les vues de lecture partagées entre plusieurs onglets ou
 * personnes (état des silos, traçabilité des lots…) : la mutation qui
 * modifie les données invalide déjà le cache de son propre onglet, mais un
 * autre onglet resté ouvert sur la vue de lecture n’en sait rien tant qu’il
 * ne revérifie pas lui-même. `refetchOnMount: "always"` force une vérification
 * à chaque retour sur la page, et `refetchInterval` en ajoute une pendant que
 * la page reste ouverte, pour que les changements apparaissent sans recharger
 * manuellement.
 */
export const LIVE_QUERY_OPTIONS = {
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchInterval: 5_000,
};
