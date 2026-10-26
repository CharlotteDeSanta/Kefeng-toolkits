import type { FormInstance, InvoiceItem, NupCount } from "../types";
import { createId } from "../forms/defaults";
import { pickInvoicePaths, readPdfFile } from "./files";

export interface InvoiceImportResult {
  items: InvoiceItem[];
  errors: string[];
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export async function loadInvoiceFile(path: string): Promise<InvoiceItem> {
  const bytes = await readPdfFile(path);
  let pageCount: number;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    pageCount = pdf.getPageCount();
  } catch (error) {
    throw new Error(
      `无法读取发票 ${baseName(path)}：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (pageCount <= 0) {
    throw new Error(`发票 ${baseName(path)} 没有可导入的页面`);
  }

  return {
    id: createId(),
    name: baseName(path),
    path,
    bytes,
    pageCount,
    size: bytes.byteLength,
  };
}

export async function importInvoices(): Promise<InvoiceImportResult> {
  const paths = await pickInvoicePaths();
  const items: InvoiceItem[] = [];
  const errors: string[] = [];

  for (const path of paths) {
    try {
      items.push(await loadInvoiceFile(path));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { items, errors };
}

export function totalInvoicePages(invoices: readonly InvoiceItem[]): number {
  return invoices.reduce((total, invoice) => total + invoice.pageCount, 0);
}

export function nupSheetCount(
  invoices: readonly InvoiceItem[],
  perSheet: NupCount,
): number {
  return Math.ceil(totalInvoicePages(invoices) / perSheet);
}

export function formPageCount(instances: readonly FormInstance[]): number {
  return instances.length;
}
