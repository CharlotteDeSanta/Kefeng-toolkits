import type { FormInstance, InvoiceItem, NupCount } from "../types";
import {
  buildPdfValues,
  collectValueStrings,
} from "../forms/pdf-values";
import { embedReimbursementFonts } from "./fonts";
import { appendInvoicesToPdf } from "./nup";
import { drawPdfFields } from "./pdf-renderer";
import { loadTemplate } from "./templates";

export interface BuildReimbursementPdfOptions {
  instances: readonly FormInstance[];
  invoices: readonly InvoiceItem[];
  nup: NupCount;
  onProgress?: (message: string) => void;
}

export async function buildReimbursementPdf(
  options: BuildReimbursementPdfOptions,
): Promise<Uint8Array> {
  const { instances, invoices, nup, onProgress } = options;
  if (instances.length === 0 && invoices.length === 0) {
    throw new Error("没有可导出的报销单或发票");
  }

  const { PDFDocument } = await import("pdf-lib");
  const output = await PDFDocument.create();

  const valuesList = instances.map((instance) => buildPdfValues(instance));
  const dynamicText: string[] = [];
  for (const values of valuesList) {
    collectValueStrings(values, dynamicText);
  }

  const fonts =
    instances.length > 0
      ? await embedReimbursementFonts(output, dynamicText.join(""))
      : null;

  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    onProgress?.(`正在生成：${instance.title}`);
    const { bytes, meta } = await loadTemplate(instance.type);
    const template = await PDFDocument.load(bytes);
    const [page] = await output.copyPages(template, [0]);
    output.addPage(page);
    if (fonts) {
      drawPdfFields(page, meta.fields, valuesList[index], fonts);
    }
  }

  await appendInvoicesToPdf(output, invoices, nup, onProgress);
  onProgress?.("正在写入 PDF…");

  return output.save({ useObjectStreams: true });
}
