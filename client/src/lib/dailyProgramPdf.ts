import type { jsPDF as JsPDF } from "jspdf";
import { BRAND_LOGO_URL } from "@/lib/brand";

export type DailyProgramPdfLine = {
  sequence: number;
  article: string | null;
  version: string | null;
  bagQuantity: string | null;
  bulkQuantity: string | null;
  plannedStart: string;
  plannedEnd: string;
  observation: string | null;
};

export type DailyProgramPdfData = {
  programDate: string;
  operatorName: string;
  lines: DailyProgramPdfLine[];
};

type Rgb = [number, number, number];
const palette = { green: [29, 72, 38] as Rgb, gold: [232, 181, 58] as Rgb, ink: [20, 28, 22] as Rgb, muted: [92, 103, 94] as Rgb, header: [247, 249, 244] as Rgb, grid: [39, 47, 41] as Rgb };
const logoUrl = BRAND_LOGO_URL;
const prettyDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));

async function loadLogo() {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Logo indisponible"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function text(doc: JsPDF, value: string, x: number, y: number, options?: Parameters<JsPDF["text"]>[3]) {
  doc.text(value, x, y, options);
}

function drawProgramHeader(doc: JsPDF, page: number, data: DailyProgramPdfData, logo: string | null) {
  const { green, gold, ink, muted, header, grid } = palette;
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 14;
  const right = pageWidth - 14;
  const top = 13;
  const height = 35;
  const logoBlock = 54;
  const referenceBlock = 63;
  doc.setDrawColor(...grid);
  doc.setLineWidth(.3);
  doc.rect(left, top, right - left, height);
  doc.line(left + logoBlock, top, left + logoBlock, top + height);
  doc.line(right - referenceBlock, top, right - referenceBlock, top + height);
  [top + 7.5, top + 15, top + 27.5].forEach((y) => doc.line(right - referenceBlock, y, right, y));
  doc.setFillColor(...header);
  doc.rect(left + logoBlock, top, right - left - logoBlock - referenceBlock, height, "F");
  if (logo) {
    doc.addImage(logo, "PNG", left + 6, top + 4, 11, 25);
    doc.addImage(logo, "PNG", left + 21, top + 4, 11, 25);
  }
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  text(doc, "Programme de Production", left + logoBlock + (right - left - logoBlock - referenceBlock) / 2, top + 20, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.1);
  text(doc, "Réf: For-Prod-09", right - referenceBlock + 4, top + 5);
  text(doc, "Indice : 00", right - referenceBlock + 4, top + 12.5);
  text(doc, `Date : ${prettyDate(data.programDate)}`, right - referenceBlock + 4, top + 23);
  text(doc, `Page ${page}`, right - referenceBlock + 4, top + 32);
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.2);
  doc.line(left + logoBlock + 20, top + 28, right - referenceBlock - 20, top + 28);
  doc.setTextColor(...muted);
  doc.setFontSize(6.8);
  text(doc, "PLANIFICATION JOURNALIÈRE", left + logoBlock + (right - left - logoBlock - referenceBlock) / 2, top + 32, { align: "center" });
}

function drawTableHeader(doc: JsPDF, top: number, columns: number[]) {
  const { green, header, grid } = palette;
  const x = 14;
  const widths = [16, 22, 28, 25, 31, 27, 27, 81];
  const labels = ["N°", "Article", "Version", "Quantité (tonne)", "H début prévue", "H fin prévue", "Observation"];
  doc.setFillColor(...header);
  doc.setDrawColor(...grid);
  doc.setLineWidth(.3);
  doc.rect(x, top, widths.reduce((sum, width) => sum + width, 0), 28, "FD");
  let cursor = x;
  [16, 22, 28, 56, 27, 27, 81].forEach((width, index) => {
    if (index > 0) doc.line(cursor, top, cursor, top + 28);
    cursor += width;
  });
  doc.line(x + 16 + 22 + 28, top + 12, x + 16 + 22 + 28 + 56, top + 12);
  doc.line(x + 16 + 22 + 28 + 25, top + 12, x + 16 + 22 + 28 + 25, top + 28);
  doc.setTextColor(...green);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.3);
  text(doc, labels[0], x + 8, top + 17, { align: "center" });
  text(doc, labels[1], x + 27, top + 17, { align: "center" });
  text(doc, labels[2], x + 52, top + 17, { align: "center" });
  text(doc, labels[3], x + 16 + 22 + 28 + 28, top + 8, { align: "center" });
  text(doc, "Sac", x + 16 + 22 + 28 + 12.5, top + 20, { align: "center" });
  text(doc, "Vrac", x + 16 + 22 + 28 + 25 + 15.5, top + 20, { align: "center" });
  text(doc, labels[4], x + 16 + 22 + 28 + 56 + 13.5, top + 17, { align: "center" });
  text(doc, labels[5], x + 16 + 22 + 28 + 56 + 27 + 13.5, top + 17, { align: "center" });
  text(doc, labels[6], x + 16 + 22 + 28 + 56 + 27 + 27 + 40.5, top + 17, { align: "center" });
  return { x, widths, bodyTop: top + 28, totalWidth: widths.reduce((sum, width) => sum + width, 0), columns };
}

export async function generateDailyProgramPdf(data: DailyProgramPdfData, options?: { save?: boolean }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const logo = await loadLogo();
  let page = 1;
  drawProgramHeader(doc, page, data, logo);
  const { green, ink, muted, grid } = palette;
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  text(doc, `Date : ${prettyDate(data.programDate)}`, 21, 62);
  text(doc, `Pupitreur : ${data.operatorName}`, 21, 73);
  let table = drawTableHeader(doc, 81, []);
  let y = table.bodyTop;
  const cellsX = [14, 30, 52, 80, 105, 136, 163, 190];
  const drawNewPage = () => {
    doc.addPage();
    page += 1;
    drawProgramHeader(doc, page, data, logo);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    text(doc, `Programme du ${prettyDate(data.programDate)} · Pupitreur : ${data.operatorName}`, 14, 59);
    table = drawTableHeader(doc, 66, []);
    y = table.bodyTop;
  };
  const lines = data.lines.length ? data.lines : [{ sequence: 1, article: null, version: null, bagQuantity: null, bulkQuantity: null, plannedStart: "—", plannedEnd: "—", observation: "Aucune ligne programmée" }];
  lines.forEach((line, index) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    const observation = doc.splitTextToSize(line.observation || "—", 77);
    const rowHeight = Math.max(13, observation.length * 3.8 + 5);
    if (y + rowHeight > 192) drawNewPage();
    doc.setDrawColor(...grid);
    doc.setLineWidth(.22);
    doc.rect(table.x, y, table.totalWidth, rowHeight);
    let cursor = table.x;
    table.widths.slice(0, -1).forEach((width) => { cursor += width; doc.line(cursor, y, cursor, y + rowHeight); });
    if (index % 2 === 1) { doc.setFillColor(250, 251, 248); doc.rect(table.x + .25, y + .25, table.totalWidth - .5, rowHeight - .5, "F"); doc.setDrawColor(...grid); doc.rect(table.x, y, table.totalWidth, rowHeight); cursor = table.x; table.widths.slice(0, -1).forEach((width) => { cursor += width; doc.line(cursor, y, cursor, y + rowHeight); }); }
    doc.setTextColor(...ink);
    doc.setFont("helvetica", line.article ? "bold" : "normal");
    const baseline = y + Math.max(8, rowHeight / 2 + 2);
    text(doc, String(line.sequence), cellsX[0] + 8, baseline, { align: "center" });
    text(doc, line.article || "—", cellsX[1] + 11, baseline, { align: "center" });
    text(doc, line.version || "—", cellsX[2] + 14, baseline, { align: "center" });
    text(doc, line.bagQuantity || "—", cellsX[3] + 12.5, baseline, { align: "center" });
    text(doc, line.bulkQuantity || "—", cellsX[4] + 15.5, baseline, { align: "center" });
    text(doc, line.plannedStart, cellsX[5] + 13.5, baseline, { align: "center" });
    text(doc, line.plannedEnd, cellsX[6] + 13.5, baseline, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.1);
    text(doc, observation, cellsX[7] + 4, y + 7);
    y += rowHeight;
  });
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...green);
  doc.setLineWidth(.3);
  doc.line(14, pageHeight - 13, doc.internal.pageSize.getWidth() - 14, pageHeight - 13);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  text(doc, "Almaraïi · Programme de Production", 14, pageHeight - 8);
  text(doc, `Programme du ${prettyDate(data.programDate)}`, doc.internal.pageSize.getWidth() - 14, pageHeight - 8, { align: "right" });
  if (options?.save !== false) doc.save(`programme-production-${data.programDate}.pdf`);
  return doc;
}
