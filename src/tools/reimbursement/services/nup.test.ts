import { describe, expect, it } from "vitest";
import { PDFDocument, PageSizes, degrees } from "pdf-lib";
import type { InvoiceItem, NupCount } from "../types";
import {
  INVOICE_GUTTER,
  INVOICE_MARGIN,
  appendInvoicesToPdf,
  nupCellRect,
} from "./nup";

const [A4_WIDTH, A4_HEIGHT] = PageSizes.A4;

describe("N-up grid geometry", () => {
  it("uses the full printable area for one invoice per page", () => {
    const cell = nupCellRect(1, 0, A4_WIDTH, A4_HEIGHT);
    expect(cell.x).toBeCloseTo(INVOICE_MARGIN);
    expect(cell.y).toBeCloseTo(INVOICE_MARGIN);
    expect(cell.w).toBeCloseTo(A4_WIDTH - 2 * INVOICE_MARGIN);
    expect(cell.h).toBeCloseTo(A4_HEIGHT - 2 * INVOICE_MARGIN);
  });

  it("stacks two invoices vertically", () => {
    const top = nupCellRect(2, 0, A4_WIDTH, A4_HEIGHT);
    const bottom = nupCellRect(2, 1, A4_WIDTH, A4_HEIGHT);
    expect(top.x).toBeCloseTo(bottom.x);
    expect(top.y).toBeGreaterThan(bottom.y);
    expect(top.y - (bottom.y + bottom.h)).toBeCloseTo(INVOICE_GUTTER);
    expect(top.h).toBeCloseTo(
      (A4_HEIGHT - 2 * INVOICE_MARGIN - INVOICE_GUTTER) / 2,
    );
  });

  it("lays out four invoices in reading order", () => {
    const cells = [0, 1, 2, 3].map((slot) =>
      nupCellRect(4, slot, A4_WIDTH, A4_HEIGHT),
    );
    expect(cells[0].y).toBeCloseTo(cells[1].y);
    expect(cells[0].x).toBeLessThan(cells[1].x);
    expect(cells[2].y).toBeCloseTo(cells[3].y);
    expect(cells[2].y).toBeLessThan(cells[0].y);
    expect(cells[2].x).toBeCloseTo(cells[0].x);
    expect(cells[3].x).toBeCloseTo(cells[1].x);
  });
});

async function invoiceWithPages(pages: number, pageCount: number): Promise<InvoiceItem> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([300 + index, 500]);
    page.drawRectangle({ x: 10, y: 10, width: 40, height: 40 });
  }
  const bytes = await pdf.save();
  return {
    id: `invoice-${pages}`,
    name: `invoice-${pages}.pdf`,
    path: `C:/tmp/invoice-${pages}.pdf`,
    bytes,
    pageCount,
    size: bytes.byteLength,
  };
}

describe("invoice sheet assembly", () => {
  it.each<[NupCount, number]>([
    [1, 3],
    [2, 2],
    [4, 1],
  ])("places %i invoice(s) per page into %i A4 sheet(s)", async (nup, expected) => {
    const item = await invoiceWithPages(3, 3);
    const output = await PDFDocument.create();
    await appendInvoicesToPdf(output, [item], nup);

    expect(output.getPageCount()).toBe(expected);
    for (const page of output.getPages()) {
      expect(page.getWidth()).toBeCloseTo(A4_WIDTH);
      expect(page.getHeight()).toBeCloseTo(A4_HEIGHT);
    }

    const bytes = await output.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(expected);
  });

  it("keeps one sheet per group across multiple invoices", async () => {
    const first = await invoiceWithPages(2, 2);
    const second = await invoiceWithPages(1, 1);
    const output = await PDFDocument.create();
    await appendInvoicesToPdf(output, [first, second], 2);
    expect(output.getPageCount()).toBe(2);
  });

  it("normalizes rotated pages without failing", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([300, 500]);
    page.drawRectangle({ x: 10, y: 10, width: 40, height: 40 });
    page.setRotation(degrees(90));
    const bytes = await pdf.save();
    const item: InvoiceItem = {
      id: "rotated",
      name: "rotated.pdf",
      path: "C:/tmp/rotated.pdf",
      bytes,
      pageCount: 1,
      size: bytes.byteLength,
    };

    const output = await PDFDocument.create();
    await appendInvoicesToPdf(output, [item], 2);
    expect(output.getPageCount()).toBe(1);
    const saved = await output.save();
    expect(saved.byteLength).toBeGreaterThan(0);
  });
});
