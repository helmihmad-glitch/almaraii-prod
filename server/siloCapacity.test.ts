import { describe, expect, it } from "vitest";
import { getSiloFillStatus, SILO_CAPACITY_TONS } from "../shared/silo";

describe("état de remplissage d’un silo (capacité 25 T)", () => {
  it("est vide sans quantité ou à quantité nulle/négative", () => {
    expect(getSiloFillStatus(null)).toEqual({ percent: 0, status: "empty" });
    expect(getSiloFillStatus(0)).toEqual({ percent: 0, status: "empty" });
    expect(getSiloFillStatus(-3)).toEqual({ percent: 0, status: "empty" });
  });

  it("est normal en dessous de 85 % de la capacité", () => {
    expect(getSiloFillStatus(10)).toEqual({ percent: 40, status: "normal" });
    expect(getSiloFillStatus(21.24)).toEqual({ percent: 85, status: "normal" }); // 84,96 % arrondi à l’affichage, sous le seuil réel
  });

  it("passe en alerte à partir de 85 % et jusqu’à la capacité nominale", () => {
    expect(getSiloFillStatus(21.25)).toEqual({ percent: 85, status: "warning" });
    expect(getSiloFillStatus(22)).toEqual({ percent: 88, status: "warning" });
    expect(getSiloFillStatus(SILO_CAPACITY_TONS)).toEqual({ percent: 100, status: "warning" });
  });

  it("signale un dépassement au-delà de la capacité, comme certains silos du classeur réel", () => {
    // SPF3 dans Silo_PF.xlsx : 25,48 T pour une capacité de 25 T.
    expect(getSiloFillStatus(25.48)).toEqual({ percent: 102, status: "over" });
  });
});
