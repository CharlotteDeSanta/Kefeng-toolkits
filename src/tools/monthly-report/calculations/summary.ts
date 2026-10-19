import type {
  DayRecord,
  LocationSummaryRow,
  SummaryValues,
  WorkCalendar,
} from "../types";
import { accruedRestDays } from "./fixed-point";
import { deriveDay, getProjectTokens } from "./daily-entry";

export const EMPTY_SUMMARY: SummaryValues = {
  actualWorkDays: 0,
  projectAttendanceDays: 0,
  totalWorkHours: 0,
  totalOvertimeHours: 0,
  accruedRestDays: 0,
  usedRestDays: 0,
};

/** 六项月度汇总，对应 WPF ReportLayoutBuilder.ComputeSummary。 */
export function computeSummary(
  days: readonly DayRecord[],
  calendar: WorkCalendar,
): SummaryValues {
  let projectAttendanceDays = 0;
  let totalWorkHours = 0;
  let totalOvertimeHours = 0;
  let actualWorkDays = 0;
  let usedRestDays = 0;

  for (const day of days) {
    const derived = deriveDay(day, calendar);
    projectAttendanceDays += derived.projectAttendance;
    totalWorkHours += derived.workHours;
    totalOvertimeHours += derived.overtimeHours;

    if (!derived.isPureRest && derived.workHours > 0) {
      actualWorkDays += derived.workHours >= 800 ? 100 : derived.workHours >= 400 ? 50 : 0;
    }

    if (calendar.isWorkday(day.date) && derived.containsRest) {
      usedRestDays += derived.isPureRest ? 100 : 50;
    }
  }

  return {
    actualWorkDays,
    projectAttendanceDays,
    totalWorkHours,
    totalOvertimeHours,
    accruedRestDays: accruedRestDays(totalOvertimeHours),
    usedRestDays,
  };
}

/** 项目地点汇总，对应 WPF ReportLayoutBuilder.ComputeLocationSummary。 */
export function computeLocationSummary(
  days: readonly DayRecord[],
  calendar: WorkCalendar,
  collator: Intl.Collator = new Intl.Collator("zh-CN"),
): LocationSummaryRow[] {
  const map = new Map<string, { attendanceDays: number; overtimeHours: number }>();

  for (const day of days) {
    const project = getProjectTokens(day.location)[0];
    if (!project) {
      continue;
    }

    const derived = deriveDay(day, calendar);
    const current = map.get(project) ?? { attendanceDays: 0, overtimeHours: 0 };
    current.attendanceDays += derived.projectAttendance;
    current.overtimeHours += derived.overtimeHours;
    map.set(project, current);
  }

  return [...map.entries()]
    .map(([location, value]) => ({
      location,
      attendanceDays: value.attendanceDays,
      overtimeHours: value.overtimeHours,
    }))
    .sort((a, b) => collator.compare(a.location, b.location));
}
