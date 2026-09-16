import { jsPDF } from "jspdf";
import fs from "node:fs";

const doc = new jsPDF();
const lines = [
  "Al Maraii Aliments",
  "Traçabilité Expédition",
  "Date du : 16/09/2026 00:00 au : 16/09/2026 23:59",
  "COV-MA2609086 LIVRE VRAC | LIVRAISON",
  "Client: al maraii du cap bon chair Camion: 9467 TU 259 Chauffeur: wajdi aziza",
  "Date BC: 16/09/2026 14:58 Entree: 16/09/2026 16:41 Sortie: 16/09/2026 17:15",
  "Tare entree: 13460.00 Kg Poids sortie: 16160.00 Kg Poids net: 2700.00 Kg",
  "Code Designation Qte theo Qte reelle Ecart Lots Silo source",
  "PCCV03 CG 25 Vrac 2700 Kg 2700.00 Kg +0.00 Kg 2600656-0910 (2700 Kg) SPF4",
  "COV-MA2609085 LIVRE VRAC | LIVRAISON",
  "Client: ABDERAZEK GODDI Camion: 7742 tu 249 Chauffeur: zouahir chetioui",
  "Date BC: 16/09/2026 13:38 Entree: 16/09/2026 15:15 Sortie: 16/09/2026 16:29",
  "Tare entree: 24960.00 Kg Poids sortie: 32960.00 Kg Poids net: 8000.00 Kg",
  "Code Designation Qte theo Qte reelle Ecart Lots Silo source",
  "PCDV01 CM1 Vrac 8000 Kg 8000.00 Kg +0.00 Kg 2600666-0914 (8000 Kg) SPF7",
];
lines.forEach((line, index) => doc.text(line, 10, 10 + index * 8));
const buffer = Buffer.from(doc.output("arraybuffer"));
fs.writeFileSync("tmp-expedition-report.pdf", buffer);
console.log("PDF written:", buffer.length, "bytes");
