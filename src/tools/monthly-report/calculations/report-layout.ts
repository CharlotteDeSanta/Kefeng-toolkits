import type {
  DayRecord,
  ReportLine,
  ReportMeta,
  WorkCalendar,
} from "../types";
import { deriveDay } from "./daily-entry";
import { formatHundredths } from "./fixed-point";
import { computeLocationSummary, computeSummary } from "./summary";

export const COLUMN_COUNT = 8;

function row(...values: string[]): string[] {
  const cells = new Array<string>(COLUMN_COUNT).fill("");
  values.forEach((value, index) => {
    if (index < COLUMN_COUNT) {
      cells[index] = value;
    }
  });
  return cells;
}

export function reportTitle(meta: ReportMeta): string {
  return `${meta.year}年AGV项目工作月报`;
}

export function defaultFileName(meta: ReportMeta): string {
  return `AGV月报_${meta.employeeName}_${meta.year}_${meta.month}.xlsx`;
}

/**
 * 生成与 WPF ReportLayoutBuilder.Build 完全一致的报表行序列：
 * 标题 → 元信息 → 表头 → 明细 → 空行 → 月度汇总 → 空行 → 项目地点汇总。
 */
export function buildReportLines(
  meta: ReportMeta,
  days: readonly DayRecord[],
  calendar: WorkCalendar,
): ReportLine[] {
  const summary = computeSummary(days, calendar);
  const locations = computeLocationSummary(days, calendar);
  const lines: ReportLine[] = [];

  lines.push({
    role: "Title",
    cells: row(reportTitle(meta)),
    columnCount: COLUMN_COUNT,
  });

  lines.push({
    role: "Meta",
    cells: row(
      "姓名",
      meta.employeeName,
      "工程师等级",
      meta.level,
      "填报年份",
      String(meta.year),
      "填报月份",
      String(meta.month),
    ),
    columnCount: COLUMN_COUNT,
  });

  lines.push({
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
    columnCount: COLUMN_COUNT,
  });

  for (const day of days) {
    const derived = deriveDay(day, calendar);
    lines.push({
      role: "Detail",
      cells: row(
        day.date,
        day.location,
        day.workContent,
        day.startTime,
        day.endTime,
        formatHundredths(derived.workHours, 2),
        formatHundredths(derived.overtimeHours, 2),
        formatHundredths(derived.projectAttendance, 2),
      ),
      restDay: derived.isRestDay,
      columnCount: COLUMN_COUNT,
    });
  }

  lines.push({ role: "Separator", cells: row(), columnCount: COLUMN_COUNT });

  lines.push({
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
    columnCount: COLUMN_COUNT,
  });

  lines.push({
    role: "SummaryValues",
    cells: row(
      "",
      "",
      formatHundredths(summary.actualWorkDays, 1),
      formatHundredths(summary.projectAttendanceDays, 2),
      formatHundredths(summary.totalWorkHours, 2),
      formatHundredths(summary.totalOvertimeHours, 2),
      formatHundredths(summary.accruedRestDays, 2),
      formatHundredths(summary.usedRestDays, 1),
    ),
    columnCount: COLUMN_COUNT,
  });

  lines.push({ role: "Separator", cells: row(), columnCount: COLUMN_COUNT });

  lines.push({
    role: "LocationTitle",
    cells: row("项目地点汇总"),
    columnCount: COLUMN_COUNT,
  });

  lines.push({
    role: "LocationHeader",
    cells: row("项目地点", "出勤天数(天)", "加班时长(h)"),
    columnCount: COLUMN_COUNT,
  });

  for (const location of locations) {
    lines.push({
      role: "LocationRow",
      cells: row(
        location.location,
        formatHundredths(location.attendanceDays, 1),
        formatHundredths(location.overtimeHours, 2),
      ),
      columnCount: COLUMN_COUNT,
    });
  }

  return lines;
}
