import { describe, expect, it } from "vitest";
import * as ExcelJS from "exceljs";
import type { ReportLine } from "../types";
import { buildMonthlyWorkbookBytes } from "./xlsx-export";

function fillArgb(cell: ExcelJS.Cell): string | undefined {
  const fill = cell.fill as { fgColor?: { argb?: string } } | undefined;
  return fill?.fgColor?.argb;
}

function lines(): ReportLine[] {
  const row = (...values: string[]): string[] => {
    const cells = new Array<string>(8).fill("");
    values.forEach((value, index) => {
      if (index < 8) {
        cells[index] = value;
      }
    });
    return cells;
  };

  return [
    { role: "Title", cells: row("2026年AGV项目工作月报"), columnCount: 8 },
    {
      role: "Meta",
      cells: row(
        "姓名",
        "曹铮",
        "工程师等级",
        "新进工程师",
        "填报年份",
        "2026",
        "填报月份",
        "9",
      ),
      columnCount: 8,
    },
    {
      role: "DetailHeader",
      cells: row(
        "日期",
        "上班地点",
        "工作内容",
        "上班时间",
        "下班时间",
        "工作时长(h)",
        "加班时长(h)",
        "项目出勤",
      ),
      columnCount: 8,
    },
    {
      role: "Detail",
      cells: row(
        "2026-09-05",
        "无锡国药",
        "周末加班",
        "09:00",
        "17:10",
        "8.17",
        "8.17",
        "1.00",
      ),
      restDay: true,
      columnCount: 8,
    },
    {
      role: "Detail",
      cells: row(
        "2026-09-08",
        "无锡国药",
        "正常工作日",
        "09:00",
        "17:00",
        "8.00",
        "0.00",
        "1.00",
      ),
      restDay: false,
      columnCount: 8,
    },
    { role: "Separator", cells: row(), columnCount: 8 },
    {
      role: "SummaryTitle",
      cells: row(
        "月度汇总统计",
        "",
        "实际上班天数(天)",
        "项目出勤天数(天)",
        "总工作时长(h)",
        "总加班时长(h)",
        "当月累计可调休天数(天)",
        "当月已调休天数(天)",
      ),
      columnCount: 8,
    },
    {
      role: "SummaryValues",
      cells: row("", "", "6.0", "6.00", "52.68", "12.68", "1.58", "1.0"),
      columnCount: 8,
    },
    { role: "Separator", cells: row(), columnCount: 8 },
    { role: "LocationTitle", cells: row("项目地点汇总"), columnCount: 8 },
    {
      role: "LocationHeader",
      cells: row("项目地点", "出勤天数(天)", "加班时长(h)"),
      columnCount: 8,
    },
    {
      role: "LocationRow",
      cells: row("无锡国药", "6.0", "12.68"),
      columnCount: 8,
    },
  ];
}

describe("XLSX export", () => {
  it("writes the monthly report structure and styles", async () => {
    const bytes = await buildMonthlyWorkbookBytes(lines());
    expect(bytes.byteLength).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const sheet = workbook.getWorksheet("报表");
    expect(sheet).toBeDefined();
    if (!sheet) {
      return;
    }

    expect(sheet.views?.[0]).toMatchObject({
      state: "frozen",
      ySplit: 3,
    });
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((column) => sheet.getColumn(column).width))
      .toEqual([12, 14, 46, 12, 12, 11, 11, 10]);

    // 标题合并与样式
    expect(sheet.getCell("A1").value).toBe("2026年AGV项目工作月报");
    expect(sheet.getCell("A1").isMerged).toBe(true);
    expect(sheet.getCell("H1").isMerged).toBe(true);
    expect(sheet.getCell("A1").font.bold).toBe(true);
    expect(sheet.getCell("A1").font.size).toBe(14);
    expect(sheet.getCell("A1").alignment.horizontal).toBe("center");
    expect(sheet.getRow(1).height).toBe(26);

    // 元信息：年份/月份保持文本（与原 WPF 导出一致）
    expect(sheet.getCell("F2").value).toBe("2026");
    expect(sheet.getCell("H2").value).toBe("9");

    // 表头填充与边框
    expect(fillArgb(sheet.getCell("A3"))).toBe("FFD9E1F2");
    expect(fillArgb(sheet.getCell("H3"))).toBe("FFD9E1F2");
    expect(sheet.getCell("A3").font.bold).toBe(true);
    expect(sheet.getCell("A3").alignment.horizontal).toBe("center");
    expect(sheet.getCell("A3").border.top?.style).toBe("thin");

    // 明细：休息日仅日期格填充；内容列换行；数值列真实数字
    expect(fillArgb(sheet.getCell("A4"))).toBe("FFFEE2E2");
    expect(fillArgb(sheet.getCell("B4"))).not.toBe("FFFEE2E2");
    expect(sheet.getCell("C4").alignment.wrapText).toBe(true);
    expect(sheet.getCell("A4").alignment.horizontal).toBe("center");
    expect(sheet.getCell("F4").value).toBe(8.17);
    expect(sheet.getCell("F4").numFmt).toBe("0.00");

    // 汇总数值与格式
    expect(sheet.getCell("C8").value).toBe(6);
    expect(sheet.getCell("C8").numFmt).toBe("0.0");
    expect(sheet.getCell("D8").value).toBe(6);
    expect(sheet.getCell("D8").numFmt).toBe("0.00");
    expect(sheet.getCell("G8").value).toBe(1.58);
    expect(sheet.getCell("G8").numFmt).toBe("0.00");
    expect(sheet.getCell("H8").value).toBe(1);
    expect(sheet.getCell("H8").numFmt).toBe("0.0");
    expect(sheet.getCell("A7").border.top?.style).toBeUndefined();

    // 地点汇总格式
    expect(sheet.getCell("B12").value).toBe(6);
    expect(sheet.getCell("B12").numFmt).toBe("0.0");
    expect(sheet.getCell("C12").value).toBe(12.68);
    expect(sheet.getCell("C12").numFmt).toBe("0.00");
  });
});
