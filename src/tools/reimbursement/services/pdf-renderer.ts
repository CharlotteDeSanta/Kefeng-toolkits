import type { PDFFont, PDFPage } from "pdf-lib";
import type { PdfField, PdfFieldNode } from "../types";
import { isPdfField } from "../types";

export interface RenderFonts {
  simsun: PDFFont;
  yahei: PDFFont;
}

/** 允许亚像素级溢出，避免为不到 1pt 的误差无谓缩字或截断。 */
const FIT_TOLERANCE = 0.6;

function pickFont(fontName: string, fonts: RenderFonts): PDFFont {
  return /yahei|雅黑/i.test(fontName) ? fonts.yahei : fonts.simsun;
}

export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const char of Array.from(paragraph)) {
      const candidate = line + char;
      if (line.length > 0 && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }

  return lines;
}

function truncateWithEllipsis(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }

  let value = text;
  while (
    value.length > 1 &&
    font.widthOfTextAtSize(`${value}…`, size) > maxWidth
  ) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

function drawField(
  page: PDFPage,
  field: PdfField,
  value: string,
  fonts: RenderFonts,
): void {
  const text = value.trim();
  if (text.length === 0) {
    return;
  }

  const font = pickFont(field.font, fonts);
  const minSize = 4;
  let size = Math.max(minSize, field.fontSize);
  let lines: string[] = [];
  let lineHeight = size * 1.2;

  while (size >= minSize) {
    lineHeight = size * 1.2;
    lines = field.wrap ? wrapText(text, font, size, field.width) : [text];
    const blockHeight = size + (lines.length - 1) * lineHeight;
    const fitsWidth = lines.every(
      (line) =>
        font.widthOfTextAtSize(line, size) <= field.width + FIT_TOLERANCE,
    );
    if (fitsWidth && blockHeight <= field.height + FIT_TOLERANCE) {
      break;
    }
    size -= 0.25;
  }

  if (size < minSize) {
    size = minSize;
    lineHeight = size * 1.2;
    lines = field.wrap ? wrapText(text, font, size, field.width) : [text];
  }

  if (!field.wrap && lines.length === 1) {
    lines = [
      truncateWithEllipsis(
        lines[0],
        font,
        size,
        field.width + FIT_TOLERANCE,
      ),
    ];
  }

  const blockHeight = size + (lines.length - 1) * lineHeight;
  const blockBottom = field.y + (field.height - blockHeight) / 2;
  let baseline =
    blockBottom + (lines.length - 1) * lineHeight + size * 0.18;

  for (const line of lines) {
    const width = font.widthOfTextAtSize(line, size);
    let x = field.x + 1.2;
    if (field.align === "center") {
      x = field.x + (field.width - width) / 2;
    } else if (field.align === "right") {
      x = field.x + field.width - width - 1.2;
    }

    page.drawText(line, {
      x,
      y: baseline,
      size,
      font,
    });
    baseline -= lineHeight;
  }
}

export function drawPdfFields(
  page: PDFPage,
  fields: PdfFieldNode,
  values: unknown,
  fonts: RenderFonts,
): void {
  if (isPdfField(fields)) {
    if (typeof values === "string") {
      drawField(page, fields, values, fonts);
    }
    return;
  }

  if (Array.isArray(fields)) {
    fields.forEach((child, index) => {
      const childValue = Array.isArray(values) ? values[index] : undefined;
      drawPdfFields(page, child, childValue, fonts);
    });
    return;
  }

  if (typeof fields === "object" && fields !== null) {
    const record =
      typeof values === "object" && values !== null
        ? (values as Record<string, unknown>)
        : {};
    for (const [key, child] of Object.entries(fields)) {
      drawPdfFields(page, child, record[key], fonts);
    }
  }
}
