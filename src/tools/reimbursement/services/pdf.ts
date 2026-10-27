import type { PDFImage } from "pdf-lib";
import type {
  FormInstance,
  InvoiceItem,
  NupCount,
  PdfFieldNode,
  PdfImageField,
  SignatureImage,
} from "../types";
import { isPdfImageField } from "../types";
import { hasSignatureField } from "../forms/approvals";
import {
  buildPdfValues,
  collectValueStrings,
} from "../forms/pdf-values";
import { embedReimbursementFonts } from "./fonts";
import { appendInvoicesToPdf } from "./nup";
import { drawPdfFields, drawSignatureImage } from "./pdf-renderer";
import { decodeSignature } from "./signature";
import { loadTemplate } from "./templates";

export interface BuildReimbursementPdfOptions {
  instances: readonly FormInstance[];
  invoices: readonly InvoiceItem[];
  nup: NupCount;
  signature?: SignatureImage | null;
  onProgress?: (message: string) => void;
}

function signatureFieldOf(fields: PdfFieldNode): PdfImageField | null {
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    return null;
  }
  const candidate = (fields as unknown as Record<string, PdfFieldNode>).signature;
  return isPdfImageField(candidate) ? candidate : null;
}

export async function buildReimbursementPdf(
  options: BuildReimbursementPdfOptions,
): Promise<Uint8Array> {
  const { instances, invoices, nup, signature, onProgress } = options;
  if (instances.length === 0 && invoices.length === 0) {
    throw new Error("没有可导出的报销单或发票");
  }

  const { PDFDocument } = await import("pdf-lib");
  const output = await PDFDocument.create();

  let signatureImage: PDFImage | null = null;
  if (signature && instances.some((instance) => hasSignatureField(instance.type))) {
    const decoded = decodeSignature(signature);
    try {
      signatureImage =
        decoded.mime === "image/png"
          ? await output.embedPng(decoded.bytes)
          : await output.embedJpg(decoded.bytes);
    } catch (error) {
      throw new Error(
        `签名图片无法嵌入 PDF：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

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
    const signatureField = signatureFieldOf(meta.fields);
    if (signatureImage && signatureField) {
      drawSignatureImage(page, signatureField, signatureImage);
    }
  }

  await appendInvoicesToPdf(output, invoices, nup, onProgress);
  onProgress?.("正在写入 PDF…");

  return output.save({ useObjectStreams: true });
}
