import { describe, expect, it } from "vitest";
import type { InvoiceItem } from "../types";
import { nupSheetCount, totalInvoicePages } from "./invoices";

function invoices(pageCounts: number[]): InvoiceItem[] {
  return pageCounts.map((pageCount, index) => ({
    id: `i${index}`,
    name: `invoice-${index}.pdf`,
    path: `C:/tmp/invoice-${index}.pdf`,
    bytes: new Uint8Array(),
    pageCount,
    size: 0,
  }));
}

describe("invoice N-up counts", () => {
  it("counts pages and sheets for 1/2/4 per page", () => {
    const items = invoices([3, 2]);
    expect(totalInvoicePages(items)).toBe(5);
    expect(nupSheetCount(items, 1)).toBe(5);
    expect(nupSheetCount(items, 2)).toBe(3);
    expect(nupSheetCount(items, 4)).toBe(2);
  });

  it("returns zero for no invoices", () => {
    expect(totalInvoicePages([])).toBe(0);
    expect(nupSheetCount([], 2)).toBe(0);
  });
});
