import type {
  PDFDocument,
  PDFEmbeddedPage,
  PDFPage,
} from "pdf-lib";
import type { InvoiceItem, NupCount } from "../types";

type PdfLibModule = typeof import("pdf-lib");

export const INVOICE_MARGIN = 18;
export const INVOICE_GUTTER = 10;

export const NUP_GRIDS: Record<NupCount, [number, number]> = {
  1: [1, 1],
  2: [1, 2],
  4: [2, 2],
};

export interface NupCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function nupCellRect(
  nup: NupCount,
  slot: number,
  pageWidth: number,
  pageHeight: number,
  margin: number = INVOICE_MARGIN,
  gutter: number = INVOICE_GUTTER,
): NupCell {
  const [columns, rows] = NUP_GRIDS[nup];
  const cellWidth =
    (pageWidth - 2 * margin - (columns - 1) * gutter) / columns;
  const cellHeight =
    (pageHeight - 2 * margin - (rows - 1) * gutter) / rows;
  const column = slot % columns;
  const row = Math.floor(slot / columns);

  return {
    x: margin + column * (cellWidth + gutter),
    y: pageHeight - margin - (row + 1) * cellHeight - row * gutter,
    w: cellWidth,
    h: cellHeight,
  };
}

function drawFittedPage(
  sheet: PDFPage,
  embedded: PDFEmbeddedPage,
  cell: NupCell,
  rotation: number,
  degrees: PdfLibModule["degrees"],
): void {
  const normalized = ((rotation % 360) + 360) % 360;
  const theta = (360 - normalized) % 360;
  const swapped = normalized === 90 || normalized === 270;
  const visualWidth = swapped ? embedded.height : embedded.width;
  const visualHeight = swapped ? embedded.width : embedded.height;
  const scale = Math.min(cell.w / visualWidth, cell.h / visualHeight);

  const width = visualWidth * scale;
  const height = visualHeight * scale;
  const x = cell.x + (cell.w - width) / 2;
  const y = cell.y + (cell.h - height) / 2;

  let drawX = x;
  let drawY = y;
  if (theta === 90) {
    drawX = x + width;
  } else if (theta === 180) {
    drawX = x + width;
    drawY = y + height;
  } else if (theta === 270) {
    drawY = y + height;
  }

  sheet.drawPage(embedded, {
    x: drawX,
    y: drawY,
    width: embedded.width * scale,
    height: embedded.height * scale,
    rotate: degrees(theta),
  });
}

export async function appendInvoicesToPdf(
  output: PDFDocument,
  invoices: readonly InvoiceItem[],
  nup: NupCount,
  onProgress?: (message: string) => void,
): Promise<void> {
  if (invoices.length === 0) {
    return;
  }

  const { PDFDocument: PdfDocumentClass, degrees, PageSizes } = await import(
    "pdf-lib"
  );
  const [a4Width, a4Height] = PageSizes.A4;

  // Keep source documents alive until the caller saves the output.
  const sources: PDFDocument[] = [];
  let slot = 0;
  let sheet: PDFPage | undefined;

  for (const invoice of invoices) {
    onProgress?.(`正在处理发票：${invoice.name}`);
    let source: PDFDocument;
    try {
      source = await PdfDocumentClass.load(invoice.bytes, {
        updateMetadata: false,
      });
    } catch (error) {
      throw new Error(
        `无法处理发票 ${invoice.name}：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    sources.push(source);

    for (const page of source.getPages()) {
      if (slot === 0) {
        sheet = output.addPage(PageSizes.A4);
      }
      if (!sheet) {
        throw new Error("创建发票排版页面失败");
      }

      const crop = page.getCropBox();
      const embedded = await output.embedPage(page, {
        left: crop.x,
        bottom: crop.y,
        right: crop.x + crop.width,
        top: crop.y + crop.height,
      });

      drawFittedPage(
        sheet,
        embedded,
        nupCellRect(nup, slot, a4Width, a4Height),
        page.getRotation().angle,
        degrees,
      );
      slot = (slot + 1) % nup;
    }
  }

  // Reference the sources so bundlers/runtime cannot release them before save.
  void sources;
}
