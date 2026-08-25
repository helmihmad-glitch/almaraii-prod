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

export function getMonthlyRowsThroughExportDay<T extends { productionDate: string }>(rows: T[], exportDate: string) {
  const period = exportDate.slice(0, 7);
  return rows.filter((row) => row.productionDate.startsWith(period) && row.productionDate <= exportDate);
}

type Rgb = [number, number, number];

const logoUrl = "/manus-storage/almaraai-corn-logo_37c73384.png";
const asNumber = (value: number | string) => Number(value);
const fmt = (value: number, digits = 1) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value).replace(/[\u00A0\u202F]/g, " ");
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
    // Le paramètre par défaut du tableau de bord demeure disponible hors navigateur.
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
  const green: Rgb = [24, 71, 37];
  const gold: Rgb = [232, 181, 58];
  const mutedGold: Rgb = [246, 226, 165];
  doc.setFillColor(...green);
  doc.rect(0, 0, pageWidth, 38, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 38, pageWidth, 2, "F");
  doc.setFillColor(68, 112, 64);
  doc.rect(0, 0, 5, 38, "F");
  if (logo) doc.addImage(logo, "PNG", 15, 6, 12.7, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Almaraïi", 34, 15);
  doc.setTextColor(...mutedGold);
  doc.setFontSize(6.8);
  doc.text("PRODUCTION PULSE", 34, 21);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("RAPPORT JOURNALIER · REGISTRE DE PRODUCTION", 34, 28);
  doc.setTextColor(...mutedGold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("SYNTHÈSE OPÉRATIONNELLE", pageWidth - 15, 15, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(prettyDate(date), pageWidth - 15, 23, { align: "right" });
  doc.setDrawColor(...gold);
  doc.setLineWidth(.35);
  doc.line(pageWidth - 63, 28, pageWidth - 15, 28);
}

function drawMetricCard(doc: JsPDF, options: { x: number; y: number; width: number; label: string; value: string; detail: string; ratio: number; accent: Rgb; green: Rgb; muted: Rgb }) {
  const { x, y, width, label, value, detail, ratio, accent, green, muted } = options;
  doc.setFillColor(255, 254, 251);
  doc.roundedRect(x, y, width, 29, 3.4, 3.4, "F");
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, width, 2.3, 2, 2, "F");
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.7);
  doc.text(label, x + 5, y + 10);
  doc.setTextColor(...green);
  doc.setFontSize(16);
  doc.text(value, x + 5, y + 20);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.text(detail, x + 5, y + 25);
  doc.setFillColor(231, 239, 229);
  doc.roundedRect(x + 5, y + 26.5, width - 10, 1.45, .7, .7, "F");
  doc.setFillColor(...accent);
  doc.roundedRect(x + 5, y + 26.5, Math.max(0, Math.min(ratio, 1)) * (width - 10), 1.45, .7, .7, "F");
}

export async function generateDayPdf(options: { productionDate: string; allRows: PdfProductionRow[]; exportComment?: string; save?: boolean }) {
  const dayRows = options.allRows.filter((row) => row.productionDate === options.productionDate);
  if (!dayRows.length) throw new Error("Aucune donnée n’est disponible pour cette journée.");

  const period = options.productionDate.slice(0, 7);
  const monthRowsUpToExportDay = getMonthlyRowsThroughExportDay(options.allRows, options.productionDate);
  const day = calculateKpis(dayRows);
  const month = calculateKpis(monthRowsUpToExportDay);
  const target = monthlyTarget(period);
  const progress = target > 0 ? month.production / target : 0;
  const remaining = Math.max(target - month.production, 0);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 30;
  const green: Rgb = [24, 71, 37];
  const leafy: Rgb = [77, 123, 64];
  const gold: Rgb = [232, 181, 58];
  const paleGreen: Rgb = [242, 248, 241];
  const ink: Rgb = [38, 61, 44];
  const muted: Rgb = [105, 123, 109];
  const logo = await loadLogo();
  addPageHeader(doc, pageWidth, options.productionDate, logo);

  const objectiveY = 47;
  doc.setFillColor(...green);
  doc.roundedRect(15, objectiveY, contentWidth, 54, 4.5, 4.5, "F");
  doc.setFillColor(...gold);
  doc.roundedRect(15, objectiveY, 4, 54, 2.2, 2.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(`OBJECTIF MENSUEL JUSQU’AU ${prettyDate(options.productionDate).toUpperCase()}`, 25, objectiveY + 10);
  doc.setTextColor(246, 226, 165);
  doc.setFontSize(5.9);
  doc.text("RÉEL", 25, objectiveY + 16);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(`${fmt(month.production)} T`, 25, objectiveY + 26);
  doc.setDrawColor(111, 148, 101);
  doc.setLineWidth(.25);
  doc.line(76, objectiveY + 13, 76, objectiveY + 29);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(246, 226, 165);
  doc.setFontSize(5.9);
  doc.text("PLAN", 82, objectiveY + 16);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`${fmt(target)} T`, 82, objectiveY + 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  doc.text(remaining > 0 ? `${fmt(remaining)} T restent à produire pour atteindre le plan.` : "Objectif dépassé — la production du mois est au-dessus du plan.", 25, objectiveY + 33);
  doc.setDrawColor(111, 148, 101);
  doc.setLineWidth(.25);
  doc.line(105, objectiveY + 9, 105, objectiveY + 35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.text("CUMUL ARRÊTÉ AU", 113, objectiveY + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(prettyDate(options.productionDate), 113, objectiveY + 19);
  doc.setFillColor(...gold);
  doc.circle(115, objectiveY + 26, 1.6, "F");
  doc.setTextColor(245, 249, 245);
  doc.setFontSize(7.2);
  doc.text("Données disponibles", 120, objectiveY + 28);
  doc.setDrawColor(93, 135, 84);
  doc.setLineWidth(2.3);
  doc.circle(176, objectiveY + 26, 14, "S");
  doc.setDrawColor(...gold);
  doc.setLineWidth(3.2);
  doc.circle(176, objectiveY + 26, 14, "S");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(pct(progress), 176, objectiveY + 28, { align: "center" });
  doc.setFontSize(6.1);
  doc.text("DU PLAN", 176, objectiveY + 33, { align: "center" });
  doc.setFontSize(6.7);
  doc.text("ATTEINTE DU PLAN", 176, objectiveY + 43, { align: "center" });
  doc.setFillColor(74, 115, 66);
  doc.roundedRect(25, objectiveY + 39, 100, 3.5, 1.7, 1.7, "F");
  doc.setFillColor(...gold);
  doc.roundedRect(25, objectiveY + 39, Math.min(progress, 1) * 100, 3.5, 1.7, 1.7, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Progression réelle  ${pct(progress)}`, 25, objectiveY + 49);
  doc.text(`Plan  ${fmt(target)} T`, 125, objectiveY + 49, { align: "right" });

  const dayY = 112;
  doc.setFillColor(...paleGreen);
  doc.roundedRect(15, dayY, contentWidth, 29, 4, 4, "F");
  doc.setFillColor(...gold);
  doc.roundedRect(15, dayY, 4.2, 29, 2.2, 2.2, "F");
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text("PRODUCTION DE LA JOURNÉE", 25, dayY + 9);
  doc.setTextColor(...green);
  doc.setFontSize(22);
  doc.text(`${fmt(day.production)} T`, 25, dayY + 21);
  doc.setDrawColor(205, 221, 204);
  doc.setLineWidth(.25);
  doc.line(86, dayY + 6, 86, dayY + 23);
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(prettyDate(options.productionDate), 95, dayY + 10);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`${dayRows.length} ligne(s) de production enregistrée(s)`, 95, dayY + 17);
  doc.text(doc.splitTextToSize(dayRows.map((row) => `${row.article} · ${fmt(asNumber(row.productionTons))} T`).join("   "), 87), 95, dayY + 23);
  doc.setFillColor(...green);
  doc.roundedRect(163, dayY + 6, 29, 17, 2.2, 2.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.3);
  doc.text("JOURNÉE", 177.5, dayY + 12, { align: "center" });
  doc.setFontSize(10);
  doc.text(pct(day.trs), 177.5, dayY + 19, { align: "center" });

  const sectionY = 151;
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("Indicateurs de performance", 15, sectionY);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text("Lecture instantanée des résultats du jour", pageWidth - 15, sectionY, { align: "right" });
  const cardWidth = (contentWidth - 12) / 3;
  drawMetricCard(doc, { x: 15, y: 156, width: cardWidth, label: "TRS GLOBAL", value: pct(day.trs), detail: "Efficacité globale", ratio: day.trs, accent: gold, green, muted });
  drawMetricCard(doc, { x: 15 + cardWidth + 6, y: 156, width: cardWidth, label: "DISPONIBILITÉ", value: pct(day.availability), detail: "Temps utile / planifié", ratio: day.availability, accent: leafy, green, muted });
  drawMetricCard(doc, { x: 15 + (cardWidth + 6) * 2, y: 156, width: cardWidth, label: "PERFORMANCE", value: pct(day.performance), detail: "Cadence réelle / standard", ratio: day.performance, accent: [49, 103, 62], green, muted });

  const operationY = 195;
  doc.setFillColor(...green);
  doc.roundedRect(15, operationY, contentWidth, 30, 3.5, 3.5, "F");
  doc.setFillColor(...gold);
  doc.roundedRect(15, operationY, 3.1, 30, 1.6, 1.6, "F");
  const operationMetrics = [
    { label: "REBUTS / DÉCHETS", value: `${fmt(day.waste)} T`, x: 25, color: [255, 255, 255] as Rgb },
    { label: "TEMPS TOTAL PROD.", value: `${fmt(day.totalHours)} h`, x: 76, color: [255, 255, 255] as Rgb },
    { label: "ACTIVES", value: `${fmt(day.activeHours)} h`, x: 128, color: gold },
    { label: "PERDUES", value: `${fmt(day.plannedStops + day.unplannedStops)} h`, x: 165, color: gold },
  ];
  operationMetrics.forEach((metric, index) => {
    if (index > 0) { doc.setDrawColor(94, 136, 86); doc.setLineWidth(.25); doc.line(metric.x - 9, operationY + 7, metric.x - 9, operationY + 24); }
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(metric.label, metric.x, operationY + 11);
    doc.setTextColor(...metric.color);
    doc.setFontSize(index > 1 ? 13.5 : 15);
    doc.text(metric.value, metric.x, operationY + 22);
  });

  let tableY = 240;
  const columns = ["Article", "Production", "Rebuts", "H. réelles", "TRS", "Commentaire"];
  const positions = [15, 41, 69, 91, 114, 132];
  const drawTableHeader = (y: number) => {
    doc.setFillColor(225, 238, 224);
    doc.roundedRect(15, y - 5, contentWidth, 8, 1.8, 1.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...green);
    columns.forEach((column, index) => doc.text(column.toUpperCase(), positions[index], y));
  };
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("Détail des lignes de production", 15, 235);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(`${dayRows.length} saisie(s) incluses dans ce rapport`, pageWidth - 15, 235, { align: "right" });
  drawTableHeader(tableY);
  tableY += 5;
  dayRows.forEach((row, index) => {
    const commentLines = doc.splitTextToSize(row.comment || "—", pageWidth - 137);
    const lineHeight = Math.max(8, commentLines.length * 3.7 + 4);
    if (tableY + lineHeight > 279) {
      doc.addPage();
      addPageHeader(doc, pageWidth, options.productionDate, logo);
      doc.setTextColor(...ink);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text("Détail des lignes de production", 15, 48);
      tableY = 54;
      drawTableHeader(tableY);
      tableY += 5;
    }
    if (index % 2 === 0) { doc.setFillColor(250, 252, 249); doc.rect(15, tableY - 3, contentWidth, lineHeight, "F"); }
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
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
    if (tableY + height > 280) {
      doc.addPage();
      addPageHeader(doc, pageWidth, options.productionDate, logo);
      tableY = 45;
    }
    doc.setFillColor(255, 250, 235);
    doc.roundedRect(15, tableY + 5, contentWidth, height, 3, 3, "F");
    doc.setFillColor(...gold);
    doc.roundedRect(15, tableY + 5, 3, height, 1.5, 1.5, "F");
    doc.setTextColor(...green);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("COMMENTAIRE AJOUTÉ À L’EXPORT", 24, tableY + 15);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(lines, 24, tableY + 22);
    tableY += height + 8;
  }

  doc.setDrawColor(221, 231, 220);
  doc.setLineWidth(.22);
  doc.line(15, Math.min(tableY + 4, 285), pageWidth - 15, Math.min(tableY + 4, 285));
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("Almaraïi Production Pulse", 15, Math.min(tableY + 9, 289));
  doc.text(`${dayRows.length} ligne(s) · ${prettyDate(options.productionDate)}`, pageWidth - 15, Math.min(tableY + 9, 289), { align: "right" });
  if (options.save !== false) doc.save(`production-${options.productionDate}.pdf`);
  return doc;
}
