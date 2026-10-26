import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PdfField, PdfFieldNode } from "../types";
import { drawPdfFields } from "./pdf-renderer";

describe("PDF field renderer", () => {
  it("draws nested fields, wraps long text, and ignores empty values", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fonts = { simsun: font, yahei: font };

    const field = (x: number, y: number, width: number, height: number, wrap: boolean): PdfField => ({
      address: "A1",
      x,
      y,
      width,
      height,
      font: "SimSun",
      fontSize: 9,
      align: "left",
      wrap,
    });

    const fields: PdfFieldNode = {
      title: {
        ...field(50, 760, 200, 20, false),
        align: "center",
        fontSize: 14,
      },
      rows: [
        {
          description: field(50, 700, 180, 40, true),
          amount: { ...field(250, 700, 60, 20, false), align: "right" },
        },
        {
          description: field(50, 650, 180, 40, true),
          amount: { ...field(250, 650, 60, 20, false), align: "right" },
        },
      ],
      empty: field(50, 600, 100, 20, false),
    };

    const values = {
      title: "REIMBURSEMENT TEST",
      rows: [
        {
          description:
            "A long reimbursement description used to verify wrapping, shrinking and line height handling in the renderer.",
          amount: "123.45",
        },
        {
          description: "Second row",
          amount: "",
        },
      ],
      empty: "",
    };

    drawPdfFields(page, fields, values, fonts);
    const bytes = await pdf.save();
    expect(bytes.length).toBeGreaterThan(0);
  });
});
