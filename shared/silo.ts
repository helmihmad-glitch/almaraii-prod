// Silos de produits finis (SPF). La liste reprend celle du classeur
// Silo_PF.xlsx ; ajouter un silo ici suffit à le faire apparaître partout
// (saisie, expéditions, matrice d’état).
export const SILOS = ["SPF1", "SPF2", "SPF3", "SPF4", "SPF5", "SPF6", "SPF7", "SPF8", "SPF9", "SPF10", "SPF11", "SPF12"] as const;

export type Silo = (typeof SILOS)[number];

export const SHIPMENT_TYPES = ["Sac", "Vrac"] as const;

export type ShipmentType = (typeof SHIPMENT_TYPES)[number];

/** Capacité nominale d’un silo PF, identique pour les douze silos. */
export const SILO_CAPACITY_TONS = 25;

export type SiloFillStatus = "empty" | "normal" | "warning" | "over";

/**
 * État de remplissage d’un silo par rapport à sa capacité nominale.
 * - "warning" à partir de 85 % : le silo approche de sa limite.
 * - "over" au-delà de la capacité : cas réel du classeur (quelques silos
 *   dépassent légèrement 25 T), signalé plutôt que masqué.
 */
export function getSiloFillStatus(quantity: number | null, capacity: number = SILO_CAPACITY_TONS): { percent: number; status: SiloFillStatus } {
  if (quantity === null || quantity <= 0) return { percent: 0, status: "empty" };
  const ratio = quantity / capacity;
  const percent = Math.round(ratio * 100);
  if (ratio > 1) return { percent, status: "over" };
  if (ratio >= 0.85) return { percent, status: "warning" };
  return { percent, status: "normal" };
}
