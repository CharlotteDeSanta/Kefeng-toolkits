import type { Cell, Worksheet } from "exceljs";
import type { LineRole, ReportLine } from "../types";

type ExcelJSModule = typeof import("exceljs");

const COLUMN_WIDTHS = [12, 14, 46, 12, 12, 11, 11, 10];
const THIN_BORDER = { style: "thin" as const, color: { argb: "FF000000" } };
const HEADER_FILL = "FFD9E1F2";
const REST_DAY_FILL = "FFFEE2E2";

async function loadExcelJS(): Promise<ExcelJSModule> {
  const module = await import("exceljs");
  return (
    (module as unknown as { default?: ExcelJSModule }).default ?? module
  ) as ExcelJSModule;
}

/** 与 WPF XlsxExportService.GetNumberFormat 完全一致（含 Meta 列映射怪癖）。 */
export function getNumberFormat(role: LineRole, column: number): string | null {
  switch (role) {
    case "Meta":
      return column === 5 || column === 7 ? "0" : null;
    case "Detail":
      return column === 6 || column === 7 || column === 8 ? "0.00" : null;
    case "SummaryValues":
      if (column === 3) {
        return "0.0";
      }
      if (column >= 4 && column <= 7) {
        return "0.00";
      }
      return column === 8 ? "0.0" : null;
    case "LocationRow":
      return column === 2 ? "0.0" : column === 3 ? "0.00" : null;
    default:
      return null;
  }
}

function setBorder(cell: Cell): void {
  cell.border = {
    top: THIN_BORDER,
    left: THIN_BORDER,
    bottom: THIN_BORDER,
    right: THIN_BORDER,
  };
}

function setCenter(cell: Cell): void {
  cell.alignment = { ...cell.alignment, horizontal: "center", vertical: "middle" };
}

function setWrap(cell: Cell): void {
  cell.alignment = { ...cell.alignment, wrapText: true };
}

function setFill(cell: Cell, argb: string): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function writeCell(cell: Cell, text: string, format: string | null): void {
  if (text.length === 0) {
    return;
  }
  if (format !== null) {
    const value = Number(text);
    if (Number.isFinite(value)) {
      cell.value = value;
      cell.numFmt = format;
      return;
    }
  }
  cell.value = text;
}

function applyStyle(sheet: Worksheet, rowNumber: number, line: ReportLine): void {
  const columnCount = line.columnCount;

  switch (line.role) {
    case "Title": {
      sheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
      const cell = sheet.getCell(rowNumber, 1);
      cell.font = { bold: true, size: 14 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(rowNumber).height = 26;
      break;
    }

    case "DetailHeader":
    case "LocationHeader":
      for (let column = 1; column <= columnCount; column += 1) {
        const cell = sheet.getCell(rowNumber, column);
        cell.font = { ...cell.font, bold: true };
        setFill(cell, HEADER_FILL);
        setCenter(cell);
        setBorder(cell);
      }
      break;

    case "Detail":
      for (let column = 1; column <= columnCount; column += 1) {
        const cell = sheet.getCell(rowNumber, column);
        setBorder(cell);
        if ([1, 4, 5, 6, 7, 8].includes(column)) {
          setCenter(cell);
        }
      }
      setWrap(sheet.getCell(rowNumber, 3));
      if (line.restDay) {
        setFill(sheet.getCell(rowNumber, 1), REST_DAY_FILL);
      }
      break;

    case "SummaryTitle":
    case "SummaryValues":
    case "LocationTitle":
      for (let column = 1; column <= columnCount; column += 1) {
        const cell = sheet.getCell(rowNumber, column);
        cell.font = { ...cell.font, bold: true };
      }
      break;

    default:
      break;
  }
}

function renderLine(sheet: Worksheet, rowNumber: number, line: ReportLine): void {
  const columnCount = Math.min(line.cells.length, line.columnCount);
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = sheet.getCell(rowNumber, column);
    writeCell(cell, line.cells[column - 1], getNumberFormat(line.role, column));
  }

  applyStyle(sheet, rowNumber, line);

  if (
    line.mergeDownCols &&
    line.mergeDownCols.length > 0 &&
    (line.mergeDownCount ?? 1) > 1
  ) {
    for (const column of line.mergeDownCols) {
      if (column >= 1 && column <= line.columnCount) {
        sheet.mergeCells(
          rowNumber,
          column,
          rowNumber + (line.mergeDownCount ?? 1) - 1,
          column,
        );
      }
    }
  }
}

export async function buildMonthlyWorkbookBytes(
  lines: readonly ReportLine[],
): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("报表");

  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));
  sheet.views = [{ state: "frozen", ySplit: 3 }];

  lines.forEach((line, index) => {
    renderLine(sheet, index + 1, line);
  });

  const raw: unknown = await workbook.xlsx.writeBuffer();
  if (raw instanceof Uint8Array) {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }
  throw new Error("ExcelJS 返回了无法识别的缓冲区类型");
}
