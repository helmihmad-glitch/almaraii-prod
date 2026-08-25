import type { jsPDF as JsPDF } from "jspdf";
import data from "@/data/app-data.json";

export type PdfProductionRow = {
  productionDate: string;
  article: string;
  totalProductionHours: number | string;
  plannedStopsHours: number | string;
  unplannedStopsHours: number | string;
  productionTons: number | string;
  wasteTons: number | string;
  standardRate: number | string;
  availability: number | string;
  performance: number | string;
  trs: number | string;
  realHours: number | string;
  comment: string | null;
};

const logoUrl = "/manus-storage/almaraai-corn-logo_37c73384.png";
const asNumber = (value: number | string) => Number(value);
const fmt = (value: number, digits = 1) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const pct = (value: number) => `${Math.round(value * 100)}%`;
const prettyDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
const prettyMonth = (value: string) => {
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${value}-01T00:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

function calculateKpis(rows: PdfProductionRow[]) {
  const totalHours = rows.reduce((sum, row) => sum + asNumber(row.totalProductionHours), 0);
  const plannedStops = rows.reduce((sum, row) => sum + asNumber(row.plannedStopsHours), 0);
  const unplannedStops = rows.reduce((sum, row) => sum + asNumber(row.unplannedStopsHours), 0);
  const production = rows.reduce((sum, row) => sum + asNumber(row.productionTons), 0);
  const waste = rows.reduce((sum, row) => sum + asNumber(row.wasteTons), 0);
  const activeHours = Math.max(totalHours - plannedStops - unplannedStops, 0);
  const standardCapacity = rows.reduce((sum, row) => sum + asNumber(row.realHours) * asNumber(row.standardRate), 0);
  const availability = totalHours > 0 ? Math.max((totalHours - unplannedStops) / totalHours, 0) : 0;
  const performance = standardCapacity > 0 ? production / standardCapacity : 0;
  const quality = production > 0 ? Math.max((production - waste) / production, 0) : 1;
  return { totalHours, plannedStops, unplannedStops, activeHours, production, waste, availability, performance, trs: availability * performance * quality };
}

function monthlyTarget(period: string) {
  try {
    const stored = JSON.parse(localStorage.getItem("production-month-targets") ?? "{}") as Record<string, number>;
    const target = Number(stored[period]);
    if (Number.isFinite(target) && target > 0) return target;
  } catch {
    // La valeur standard reste utilisable si le stockage local est indisponible.
  }
  const configuredMonth = data.months.find((month) => month.daily.some((entry) => entry.date.startsWith(period)));
  return configuredMonth?.target ?? 2500;
}

async function loadLogo() {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Logo PDF indisponible"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addPageHeader(doc: JsPDF, pageWidth: number, date: string, logo: string | null) {
  const green: [number, number, number] = [29, 72, 38];
  const gold: [number, number, number] = [232, 181, 58];
  doc.setFillColor(...green);
  doc.rect(0, 0, pageWidth, 29, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 29, pageWidth, 1.8, "F");
  if (logo) doc.addImage(logo, "PNG", pageWidth - 29, 4.5, 18, 18);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Almaraïi", 15, 13);
  doc.setFontSize(7);
  doc.text("PRODUCTION PULSE", 15, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`RAPPORT JOURNALIER · ${prettyDate(date)}`, 15, 24.5);
}

export async function generateDayPdf(options: { productionDate: string; allRows: PdfProductionRow[]; exportComment?: string; save?: boolean }) {
  const dayRows = options.allRows.filter((row) => row.productionDate === options.productionDate);
  if (!dayRows.length) throw new Error("Aucune donnée n’est disponible pour cette journée.");

  const period = options.productionDate.slice(0, 7);
  const monthRows = options.allRows.filter((row) => row.productionDate.startsWith(period));
  const day = calculateKpis(dayRows);
  const month = calculateKpis(monthRows);
  const target = monthlyTarget(period);
  const progress = target > 0 ? month.production / target : 0;
  const remaining = Math.max(target - month.production, 0);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 30;
  const green: [number, number, number] = [29, 72, 38];
  const leafy: [number, number, number] = [78, 123, 69];
  const gold: [number, number, number] = [232, 181, 58];
  const paleGreen: [number, number, number] = [242, 248, 241];
  const ink: [number, number, number] = [38, 61, 44];
  const muted: [number, number, number] = [105, 123, 109];
  const logo = await loadLogo();
  addPageHeader(doc, pageWidth, options.productionDate, logo);

  const objectiveY = 39;
  doc.setFillColor(...green);
  doc.roundedRect(15, objectiveY, contentWidth, 58, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`OBJECTIF MENSUEL · ${prettyMonth(period).toUpperCase()}`, 23, objectiveY + 10);
  doc.setFontSize(22);
  doc.text(`${fmt(month.production)} T`, 23, objectiveY + 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`/ ${fmt(target)} T`, 67, objectiveY + 25);
  doc.setFontSize(7.5);
  doc.text(remaining > 0 ? `${fmt(remaining)} T restent à produire pour atteindre le plan.` : "Objectif dépassé — la production du mois est au-dessus du plan.", 23, objectiveY + 34);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("PÉRIODE OBSERVÉE", 112, objectiveY + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(prettyMonth(period), 112, objectiveY + 18);
  doc.setFillColor(...gold);
  doc.circle(114, objectiveY + 26, 1.5, "F");
  doc.setFontSize(7.5);
  doc.text("Données disponibles", 119, objectiveY + 28);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(2.6);
  doc.circle(177, objectiveY + 27, 14, "S");
  doc.setDrawColor(...gold);
  doc.setLineWidth(3.2);
  doc.circle(177, objectiveY + 27, 14, "S");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(pct(progress), 177, objectiveY + 29, { align: "center" });
  doc.setFontSize(6.5);
  doc.text("DU PLAN", 177, objectiveY + 34, { align: "center" });
  doc.setFontSize(7);
  doc.text("ATTEINTE DU PLAN", 177, objectiveY + 46, { align: "center" });
  doc.setFillColor(...leafy);
  doc.roundedRect(23, objectiveY + 42, 102, 3.1, 1.5, 1.5, "F");
  doc.setFillColor(...gold);
  doc.roundedRect(23, objectiveY + 42, Math.min(progress, 1) * 102, 3.1, 1.5, 1.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Progression réelle  ${pct(progress)}`, 23, objectiveY + 52);
  doc.text(`Plan  ${fmt(target)} T`, 125, objectiveY + 52, { align: "right" });

  const dayY = 108;
  doc.setFillColor(...paleGreen);
  doc.roundedRect(15, dayY, contentWidth, 29, 4, 4, "F");
  doc.setFillColor(...gold);
  doc.roundedRect(15, dayY, 4, 29, 2, 2, "F");
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("PRODUCTION DE LA JOURNÉE", 25, dayY + 10);
  doc.setTextColor(...green);
  doc.setFontSize(20);
  doc.text(`${fmt(day.production)} T`, 25, dayY + 22);
  doc.setTextColor(...ink);
  doc.setFontSize(10);
  doc.text(prettyDate(options.productionDate), pageWidth - 21, dayY + 10, { align: "right" });
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`${dayRows.length} ligne(s) de production`, pageWidth - 21, dayY + 18, { align: "right" });
  doc.text(doc.splitTextToSize(dayRows.map((row) => `${row.article} · ${fmt(asNumber(row.productionTons))} T`).join("   "), 102), pageWidth - 21, dayY + 24, { align: "right" });

  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Indicateurs de performance", 15, 150);
  const cards = [["TRS GLOBAL", pct(day.trs), "Efficacité globale"], ["DISPONIBILITÉ", pct(day.availability), "Temps utile / planifié"], ["PERFORMANCE", pct(day.performance), "Cadence réelle / standard"]];
  const cardWidth = (contentWidth - 12) / 3;
  cards.forEach(([label, value, detail], index) => {
    const x = 15 + index * (cardWidth + 6);
    doc.setDrawColor(221, 231, 220);
    doc.setFillColor(255, 254, 250);
    doc.roundedRect(x, 155, cardWidth, 25, 3, 3, "FD");
    doc.setFillColor(...gold);
    doc.roundedRect(x, 155, cardWidth, 2.2, 2, 2, "F");
    doc.setTextColor(...muted);
    doc.setFontSize(7);
    doc.text(label, x + 5, 164);
    doc.setTextColor(...green);
    doc.setFontSize(15);
    doc.text(value, x + 5, 174);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(detail, x + 5, 178);
    doc.setFont("helvetica", "bold");
  });

  doc.setFillColor(...green);
  doc.roundedRect(15, 189, contentWidth, 31, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text("REBUTS / DÉCHETS", 25, 199);
  doc.setFontSize(15);
  doc.text(`${fmt(day.waste)} T`, 25, 211);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(.25);
  doc.line(77, 195, 77, 215);
  doc.setFontSize(7);
  doc.text("TEMPS TOTAL PROD.", 87, 199);
  doc.setFontSize(14);
  doc.text(`${fmt(day.totalHours)} h`, 87, 209);
  doc.setFontSize(8.5);
  doc.text(`ACTIVES  ${fmt(day.activeHours)} h`, 132, 200);
  doc.setTextColor(...gold);
  doc.setFontSize(13);
  doc.text(`${fmt(day.activeHours)} h`, 132, 210);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text(`PERDUES  ${fmt(day.plannedStops + day.unplannedStops)} h`, 166, 200);
  doc.setTextColor(...gold);
  doc.setFontSize(13);
  doc.text(`${fmt(day.plannedStops + day.unplannedStops)} h`, 166, 210);

  let tableY = 233;
  const columns = ["Article", "Production", "Rebuts", "H. réelles", "TRS", "Commentaire"];
  const positions = [15, 41, 69, 91, 114, 132];
  const drawTableHeader = (y: number) => {
    doc.setFillColor(232, 241, 232);
    doc.roundedRect(15, y - 5, contentWidth, 8, 1.8, 1.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...green);
    columns.forEach((column, index) => doc.text(column.toUpperCase(), positions[index], y));
  };
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Détail des lignes de production", 15, 228);
  drawTableHeader(tableY);
  tableY += 5;
  dayRows.forEach((row, index) => {
    const commentLines = doc.splitTextToSize(row.comment || "—", pageWidth - 137);
    const lineHeight = Math.max(8, commentLines.length * 3.7 + 4);
    if (tableY + lineHeight > 279) {
      doc.addPage();
      addPageHeader(doc, pageWidth, options.productionDate, logo);
      tableY = 41;
      drawTableHeader(tableY);
      tableY += 5;
    }
    if (index % 2 === 0) { doc.setFillColor(250, 252, 249); doc.rect(15, tableY - 3, contentWidth, lineHeight, "F"); }
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(row.article, positions[0], tableY + 1);
    doc.text(`${fmt(asNumber(row.productionTons))} T`, positions[1], tableY + 1);
    doc.text(`${fmt(asNumber(row.wasteTons))} T`, positions[2], tableY + 1);
    doc.text(`${fmt(asNumber(row.realHours))} h`, positions[3], tableY + 1);
    doc.text(pct(asNumber(row.trs)), positions[4], tableY + 1);
    doc.text(commentLines, positions[5], tableY + 1);
    tableY += lineHeight;
  });

  const exportComment = options.exportComment?.trim();
  if (exportComment) {
    const lines = doc.splitTextToSize(exportComment, contentWidth - 16);
    const height = Math.max(19, lines.length * 4 + 11);
    if (tableY + height > 280) { doc.addPage(); addPageHeader(doc, pageWidth, options.productionDate, logo); tableY = 42; }
    doc.setFillColor(255, 249, 229);
    doc.setDrawColor(...gold);
    doc.roundedRect(15, tableY + 5, contentWidth, height, 3, 3, "FD");
    doc.setTextColor(...green);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("COMMENTAIRE AJOUTÉ À L’EXPORT", 23, tableY + 15);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(lines, 23, tableY + 22);
    tableY += height + 8;
  }

  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Almaraïi Production Pulse · ${dayRows.length} ligne(s) incluse(s) · ${prettyDate(options.productionDate)}`, 15, Math.min(tableY + 6, 288));
  if (options.save !== false) doc.save(`production-${options.productionDate}.pdf`);
  return doc;
}
