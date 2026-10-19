import { describe, expect, it } from "vitest";
import type { DayRecord } from "../types";
import {
  accruedRestDays,
  formatHundredths,
  minutesToHundredths,
} from "./fixed-point";
import { parseTime, workMinutes } from "./time";
import {
  createYearOptions,
  daysInMonth,
  WorkCalendarRegistry,
} from "./work-calendar";
import {
  deriveDay,
  getProjectTokens,
  overtimeHoursHundredths,
  projectAttendanceHundredths,
  workHoursHundredths,
} from "./daily-entry";
import { computeLocationSummary, computeSummary } from "./summary";
import { buildReportLines, defaultFileName } from "./report-layout";

const calendar = new WorkCalendarRegistry();

function day(
  date: string,
  location = "",
  startTime = "",
  endTime = "",
): DayRecord {
  return { date, location, workContent: "", startTime, endTime };
}

/** 黄金样例 2026-09 曹铮：只填充 6 天，其余为空。 */
function goldenDays(): DayRecord[] {
  const days: DayRecord[] = [];
  for (let dayNumber = 1; dayNumber <= 30; dayNumber += 1) {
    days.push(day(`2026-09-${String(dayNumber).padStart(2, "0")}`));
  }

  const data: Array<[number, string, string, string, string]> = [
    [1, "调休", "", "", ""],
    [2, "无锡国药", "09:05", "18:51", "初到国药现场，熟悉项目，测量巷道中点，贴地码"],
    [3, "无锡国药", "08:56", "17:33", "继续贴地码，测量货架ab面铅垂线"],
    [4, "无锡国药", "09:02", "18:08", "测量货架ab面铅垂线"],
    [5, "无锡国药", "09:00", "17:10", "安装STU供电单元，绘制货架仓位码定位线"],
    [7, "无锡国药", "08:46", "17:47", "绘制货架仓位码定位线"],
    [8, "无锡国药", "09:00", "17:00", ""],
  ];

  for (const [dayNumber, location, startTime, endTime, workContent] of data) {
    days[dayNumber - 1] = {
      date: `2026-09-${String(dayNumber).padStart(2, "0")}`,
      location,
      workContent,
      startTime,
      endTime,
    };
  }
  return days;
}

describe("fixed point / rounding", () => {
  it("converts minutes to hundredths of an hour", () => {
    expect(minutesToHundredths(480)).toBe(800);
    expect(minutesToHundredths(540)).toBe(900);
    expect(minutesToHundredths(586)).toBe(977);
    expect(minutesToHundredths(0)).toBe(0);
  });

  it("uses banker's rounding for accrued rest days", () => {
    expect(accruedRestDays(1268)).toBe(158); // 1.585 -> 1.58
    expect(accruedRestDays(1204)).toBe(150); // 1.505 -> 1.50
    expect(accruedRestDays(1212)).toBe(152); // 1.515 -> 1.52
    expect(accruedRestDays(4)).toBe(0); // 0.005 -> 0.00
    expect(accruedRestDays(0)).toBe(0);
  });

  it("formats hundredths", () => {
    expect(formatHundredths(158, 2)).toBe("1.58");
    expect(formatHundredths(600, 1)).toBe("6.0");
    expect(formatHundredths(100, 2)).toBe("1.00");
  });
});

describe("time parsing", () => {
  it("accepts h:mm and hh:mm only", () => {
    expect(parseTime("9:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseTime("09:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseTime(" 08:30 ")).toEqual({ hour: 8, minute: 30 });
    expect(parseTime("9:5")).toBeNull();
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("23:60")).toBeNull();
    expect(parseTime("")).toBeNull();
  });

  it("handles cross-midnight and equal times", () => {
    expect(workMinutes("09:00", "17:00")).toBe(480);
    expect(workMinutes("23:00", "00:30")).toBe(90);
    expect(workMinutes("09:00", "09:00")).toBe(0);
    expect(workMinutes("", "17:00")).toBeNull();
    expect(workMinutes("9:5", "17:00")).toBeNull();
  });
});

describe("daily derivation", () => {
  it("computes a normal workday", () => {
    const entry = day("2026-09-02", "无锡国药", "09:05", "18:51");
    expect(workHoursHundredths(entry)).toBe(977);
    expect(overtimeHoursHundredths(entry, calendar)).toBe(177);
    expect(projectAttendanceHundredths(entry)).toBe(100);
  });

  it("treats weekend hours as full overtime", () => {
    const entry = day("2026-09-05", "无锡国药", "09:00", "17:10");
    expect(workHoursHundredths(entry)).toBe(817);
    expect(overtimeHoursHundredths(entry, calendar)).toBe(817);
    expect(deriveDay(entry, calendar).isRestDay).toBe(true);
  });

  it("treats statutory holiday hours as full overtime", () => {
    const entry = day("2026-09-25", "无锡国药", "09:00", "13:00");
    expect(overtimeHoursHundredths(entry, calendar)).toBe(400);
    expect(projectAttendanceHundredths(entry)).toBe(50);
  });

  it("treats a makeup weekend as a normal workday for overtime, but does not highlight it", () => {
    const entry = day("2026-09-20", "无锡国药", "09:00", "17:00");
    const derived = deriveDay(entry, calendar);
    expect(calendar.isMakeupWorkday(entry.date)).toBe(true);
    expect(derived.isRestDay).toBe(false);
    expect(derived.workHours).toBe(800);
    expect(derived.overtimeHours).toBe(0);
    expect(derived.projectAttendance).toBe(100);
  });

  it("uses the 8-hour threshold on a makeup workday", () => {
    const entry = day("2026-10-10", "无锡国药", "09:00", "18:00");
    const derived = deriveDay(entry, calendar);
    expect(calendar.isMakeupWorkday(entry.date)).toBe(true);
    expect(derived.workHours).toBe(900);
    expect(derived.overtimeHours).toBe(100);
  });

  it("uses the 4-hour mixed-rest threshold on a makeup workday", () => {
    const entry = day("2026-09-20", "调休/无锡国药", "09:00", "14:00");
    const derived = deriveDay(entry, calendar);
    expect(calendar.isMakeupWorkday(entry.date)).toBe(true);
    expect(derived.workHours).toBe(500);
    expect(derived.overtimeHours).toBe(100);
  });

  it("distinguishes a regular Saturday from a makeup Saturday", () => {
    const regularSaturday = day("2026-09-05", "无锡国药", "09:00", "17:00");
    const makeupSaturday = day("2026-10-10", "无锡国药", "09:00", "17:00");

    expect(calendar.isMakeupWorkday(makeupSaturday.date)).toBe(true);
    expect(overtimeHoursHundredths(regularSaturday, calendar)).toBe(800);
    expect(overtimeHoursHundredths(makeupSaturday, calendar)).toBe(0);
  });

  it("uses the 4-hour threshold for mixed rest on a workday", () => {
    const entry = day("2026-09-02", "调休/无锡国药", "09:00", "14:00");
    const derived = deriveDay(entry, calendar);
    expect(derived.workHours).toBe(500);
    expect(derived.overtimeHours).toBe(100);
    expect(derived.projectAttendance).toBe(50);
    expect(derived.containsRest).toBe(true);
    expect(derived.isPureRest).toBe(false);
  });

  it("excludes pure rest from project attendance", () => {
    const entry = day("2026-09-01", "调休", "09:00", "17:00");
    const derived = deriveDay(entry, calendar);
    expect(derived.workHours).toBe(800);
    expect(derived.projectAttendance).toBe(0);
    expect(derived.isPureRest).toBe(true);
  });

  it("gives 0.5 for company/project even without hours", () => {
    const entry = day("2026-09-02", "公司/无锡国药");
    expect(projectAttendanceHundredths(entry)).toBe(50);
  });

  it("matches token filtering edge cases", () => {
    expect(getProjectTokens("公司/调休")).toEqual([]);
    expect(getProjectTokens("调休/无锡国药/公司")).toEqual(["无锡国药"]);
    expect(getProjectTokens("公司A")).toEqual(["公司A"]);
    expect(projectAttendanceHundredths(day("2026-09-02", "公司A"))).toBe(50);
    expect(projectAttendanceHundredths(day("2026-09-02", "公司"))).toBe(0);
  });

  it("applies attendance thresholds at 4h and 8h", () => {
    expect(projectAttendanceHundredths(day("2026-09-02", "项目", "09:00", "12:59"))).toBe(0);
    expect(projectAttendanceHundredths(day("2026-09-02", "项目", "09:00", "13:00"))).toBe(50);
    expect(projectAttendanceHundredths(day("2026-09-02", "项目", "09:00", "16:59"))).toBe(50);
    expect(projectAttendanceHundredths(day("2026-09-02", "项目", "09:00", "17:00"))).toBe(100);
  });

  it("flags invalid and missing times", () => {
    expect(deriveDay(day("2026-09-02", "项目", "9:5", "17:00"), calendar).hasInvalidTime).toBe(true);
    expect(deriveDay(day("2026-09-02", "项目", "", "17:00"), calendar).hasInvalidTime).toBe(false);
    expect(deriveDay(day("2026-09-02", "", "", "17:00"), calendar).hasFilledTime).toBe(true);
  });
});

describe("monthly summary", () => {
  it("matches the golden CSV totals", () => {
    const days = goldenDays();
    const summary = computeSummary(days, calendar);
    expect(summary).toEqual({
      actualWorkDays: 600,
      projectAttendanceDays: 600,
      totalWorkHours: 5268,
      totalOvertimeHours: 1268,
      accruedRestDays: 158,
      usedRestDays: 100,
    });

    expect(computeLocationSummary(days, calendar)).toEqual([
      { location: "无锡国药", attendanceDays: 600, overtimeHours: 1268 },
    ]);
  });

  it("does not count regular makeup-day hours as overtime", () => {
    const days = [day("2026-10-10", "无锡国药", "09:00", "17:00")];
    const summary = computeSummary(days, calendar);

    expect(summary.totalWorkHours).toBe(800);
    expect(summary.totalOvertimeHours).toBe(0);
    expect(summary.actualWorkDays).toBe(100);
    expect(summary.projectAttendanceDays).toBe(100);
  });

  it("uses only the first project token and keeps case-sensitive grouping", () => {
    const days = [
      day("2026-09-02", "Alpha/上海", "09:00", "17:00"),
      day("2026-09-03", "Alpha/北京", "09:00", "17:00"),
      day("2026-09-04", "Zulu", "09:00", "17:00"),
    ];
    const rows = computeLocationSummary(days, calendar, new Intl.Collator("en"));
    expect(rows).toEqual([
      { location: "Alpha", attendanceDays: 200, overtimeHours: 0 },
      { location: "Zulu", attendanceDays: 100, overtimeHours: 0 },
    ]);

    const caseRows = computeLocationSummary(
      [
        day("2026-09-02", "Alpha", "09:00", "17:00"),
        day("2026-09-03", "alpha", "09:00", "17:00"),
      ],
      calendar,
      new Intl.Collator("en"),
    );
    expect(caseRows).toHaveLength(2);
    expect(caseRows.find((row) => row.location === "Alpha")?.attendanceDays).toBe(100);
    expect(caseRows.find((row) => row.location === "alpha")?.attendanceDays).toBe(100);
  });
});

describe("report layout", () => {
  it("matches the golden 40-row structure", () => {
    const lines = buildReportLines(
      { year: 2026, month: 9, employeeName: "曹铮", level: "新进工程师" },
      goldenDays(),
      calendar,
    );

    expect(lines).toHaveLength(40);
    expect(lines[0]).toMatchObject({
      role: "Title",
      cells: ["2026年AGV项目工作月报", "", "", "", "", "", "", ""],
    });
    expect(lines[1].cells).toEqual([
      "姓名",
      "曹铮",
      "工程师等级",
      "新进工程师",
      "填报年份",
      "2026",
      "填报月份",
      "9",
    ]);
    expect(lines[2].cells).toEqual([
      "日期",
      "上班地点",
      "工作内容",
      "上班时间",
      "下班时间",
      "工作时长(h)",
      "加班时长(h)",
      "项目出勤",
    ]);

    expect(lines[3].cells).toEqual([
      "2026-09-01",
      "调休",
      "",
      "",
      "",
      "0.00",
      "0.00",
      "0.00",
    ]);
    expect(lines[7].cells[0]).toBe("2026-09-05");
    expect(lines[7].restDay).toBe(true);

    expect(lines[33].role).toBe("Separator");
    expect(lines[34].cells).toEqual([
      "月度汇总统计",
      "",
      "实际上班天数(天)",
      "项目出勤天数(天)",
      "总工作时长(h)",
      "总加班时长(h)",
      "当月累计可调休天数(天)",
      "当月已调休天数(天)",
    ]);
    expect(lines[35].cells).toEqual([
      "",
      "",
      "6.0",
      "6.00",
      "52.68",
      "12.68",
      "1.58",
      "1.0",
    ]);
    expect(lines[37].cells[0]).toBe("项目地点汇总");
    expect(lines[39].cells).toEqual([
      "无锡国药",
      "6.0",
      "12.68",
      "",
      "",
      "",
      "",
      "",
    ]);
  });

  it("builds the default filename with an unpadded month", () => {
    expect(
      defaultFileName({
        year: 2026,
        month: 9,
        employeeName: "曹铮",
        level: "新进工程师",
      }),
    ).toBe("AGV月报_曹铮_2026_9.xlsx");
  });
});

describe("work calendar", () => {
  it("knows built-in holidays and makeup workdays", () => {
    expect(calendar.isHoliday("2026-09-25")).toBe(true);
    expect(calendar.isWorkday("2026-09-25")).toBe(false);
    expect(calendar.isRestDay("2026-09-25")).toBe(true);

    expect(calendar.isMakeupWorkday("2026-09-20")).toBe(true);
    expect(calendar.isWorkday("2026-09-20")).toBe(true);
    expect(calendar.isRestDay("2026-09-20")).toBe(false);

    expect(calendar.isWeekend("2026-09-05")).toBe(true);
    expect(calendar.isRestDay("2026-09-05")).toBe(true);

    expect(calendar.isHoliday("2025-10-01")).toBe(true);
  });

  it("falls back to weekends-only for years without data", () => {
    expect(calendar.isHoliday("2027-01-01")).toBe(false);
    expect(calendar.isWorkday("2027-01-01")).toBe(true);
    expect(calendar.isWeekend("2027-01-02")).toBe(true);
    expect(calendar.isWorkday("2027-01-02")).toBe(false);
  });

  it("computes month lengths and dynamic year options", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 9)).toBe(30);

    const years = createYearOptions(new Date(2026, 9, 19));
    expect(years[0]).toBe(2025);
    expect(years).toContain(2026);
    expect(years).toContain(2036);
    expect(years).not.toContain(2037);
  });
});
